import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { CsvProcessorPool } from '@/lib/worker-pool';
import { csvProcessor } from '@/lib/csv-processor';
import { logger } from '@/lib/logger';

// Global worker pool instance
let workerPool: CsvProcessorPool | null = null;
let isProcessing = false;

export async function POST(request: NextRequest) {
  try {
    // Initialize worker pool if not already done
    if (!workerPool) {
      const maxWorkers = parseInt(process.env.CSV_WORKER_THREADS || '5', 10);
      workerPool = new CsvProcessorPool(maxWorkers);

      workerPool.setProcessor(async (jobId: string, batchNumber: number) => {
        // Get job details
        const jobResult = await query(
          `SELECT organization_id, created_by, file_name FROM csv_processing_jobs WHERE job_id = $1`,
          [jobId]
        );

        if (jobResult.rows.length === 0) {
          throw new Error(`Job ${jobId} not found`);
        }

        const job = jobResult.rows[0];
        
        // Construct MinIO file URL
        const minioEndpoint = process.env.EXTERNAL_MINIO_ENDPOINT || 'http://localhost:9000';
        const bucketName = `org-${job.organization_id}`;
        const fileUrl = `${minioEndpoint}/${bucketName}/${encodeURIComponent(job.file_name)}`;

        // Process batch
        return csvProcessor.processBatch({
          jobId,
          batchNumber,
          organizationId: job.organization_id,
          userId: job.created_by,
          fileUrl,
        });
      });

      logger.info(`CSV Processor initialized with ${maxWorkers} worker threads`);

      // DEBUG: option to run a single queued job directly (bypass pool) for troubleshooting
      if (process.env.DEBUG_RUN_DIRECT === 'true') {
        (async () => {
          try {
            const nextJob = await query(
              `SELECT job_id, organization_id, created_by, file_name FROM csv_processing_jobs WHERE csv_status = 'queued' ORDER BY created_at ASC LIMIT 1`,
              []
            );
            if (nextJob.rows.length > 0) {
              const j = nextJob.rows[0];
              const minioEndpoint = process.env.EXTERNAL_MINIO_ENDPOINT || 'http://localhost:9000';
              const fileUrl = `${minioEndpoint}/org-${j.organization_id}/${encodeURIComponent(j.file_name)}`;
              logger.info(`DEBUG_RUN_DIRECT: running direct processor for job ${j.job_id}`);
              await csvProcessor.processBatch({
                jobId: j.job_id,
                batchNumber: 1,
                organizationId: j.organization_id,
                userId: j.created_by,
                fileUrl,
              });
              logger.info(`DEBUG_RUN_DIRECT: finished direct processor for job ${j.job_id}`);
            } else {
              logger.info('DEBUG_RUN_DIRECT: no queued job found');
            }
          } catch (err) {
            logger.error(`DEBUG_RUN_DIRECT error: ${err}`);
          }
        })();
      }
    }

    // Start processing queued jobs
    if (!isProcessing) {
      isProcessing = true;
      processQueuedJobs().finally(() => {
        isProcessing = false;
      });
    }

    const stats = workerPool.getStats();
    return NextResponse.json({
      status: 'initialized',
      message: 'CSV job scheduler initialized',
      workerStats: stats,
    });
  } catch (error) {
    logger.error(`Error initializing CSV scheduler: ${error}`);
    return NextResponse.json(
      { error: 'Failed to initialize CSV scheduler' },
      { status: 500 }
    );
  }
}

async function processQueuedJobs(): Promise<void> {
  try {
    logger.info('processQueuedJobs: loop started');
    while (true) {
      logger.debug('processQueuedJobs: checking for queued jobs');
      // Find next queued job
      const result = await query(
        `SELECT job_id, total_records FROM csv_processing_jobs 
         WHERE csv_status = 'queued' 
         ORDER BY created_at ASC 
         LIMIT 1`,
        []
      );

      if (result.rows.length === 0) {
        // No queued jobs, wait before checking again
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      const job = result.rows[0];
      logger.info(`processQueuedJobs: picked job ${job.job_id} total_records=${job.total_records}`);
      const batchSize = parseInt(process.env.CSV_BATCH_SIZE || '50', 10);
      const totalBatches = Math.ceil(job.total_records / batchSize);
      logger.info(`processQueuedJobs: job ${job.job_id} totalBatches=${totalBatches}`);

      // Update job status to processing
      await query(
        `UPDATE csv_processing_jobs 
         SET csv_status = 'processing', updated_at = NOW() 
         WHERE job_id = $1`,
        [job.job_id]
      );

      logger.info(
        `Starting processing for job ${job.job_id} with ${totalBatches} batches`
      );

      // Queue all batches for processing
      let completedBatches = 0;
      let totalSuccessful = 0;
      let totalFailed = 0;

      for (let batchNumber = 1; batchNumber <= totalBatches; batchNumber++) {
        logger.info(`processQueuedJobs: submitting batch ${batchNumber} for job ${job.job_id}`);
        try {
          const result = await workerPool!.execute(
            `${job.job_id}-batch-${batchNumber}`,
            {
              jobId: job.job_id,
              batchNumber,
            }
          );

          logger.info(`processQueuedJobs: worker result for ${job.job_id} batch ${batchNumber} => ${JSON.stringify(result)}`);
          if (result.success) {
            completedBatches++;
            totalSuccessful += result.processedCount;
            totalFailed += result.failedCount;
            logger.info(`Batch ${batchNumber} processed: ${result.processedCount} success, ${result.failedCount} failed`);
          } else {
            logger.warn(`Batch ${batchNumber} failed`);
            totalFailed += result.failedCount;
          }
        } catch (error) {
          logger.error(
            `Error processing batch ${batchNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          totalFailed++;
        }
      }

      logger.info(`processQueuedJobs: finished job ${job.job_id} -- success ${totalSuccessful}, failed ${totalFailed}`);

      // Update job status to completed (counts already updated by processBatch)
      await query(
        `UPDATE csv_processing_jobs 
         SET csv_status = 'completed',
             completed_at = NOW(), 
             updated_at = NOW()
         WHERE job_id = $1`,
        [job.job_id]
      );

      logger.info(
        `Job ${job.job_id} processing completed: ${totalSuccessful} success, ${totalFailed} failed`
      );

      // Small delay before processing next job
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    logger.error(
      `Error in job processing loop: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    // Retry after delay on error
    await new Promise((resolve) => setTimeout(resolve, 10000));
    processQueuedJobs();
  }
}
