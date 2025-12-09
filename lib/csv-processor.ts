import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import csv from 'csv-parser';
import { query } from './db';
import { validateStudentRecords, StudentRecord } from './csv-schema';
import { logger } from './logger';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  credentials: {
    accessKeyId: process.env.ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.SECRET_KEY || 'minioadmin',
  },
});

interface ProcessingContext {
  jobId: string;
  batchNumber: number;
  organizationId: string;
  userId: string;
  fileUrl: string;
}

export class CsvProcessor {
  async processBatch(context: ProcessingContext): Promise<{
    success: boolean;
    processedCount: number;
    failedCount: number;
    errorMessage?: string;
    errorRecords?: Array<{ email: string; error: string }>;
  }> {
    logger.info(`CsvProcessor.processBatch start job=${context.jobId} batch=${context.batchNumber} fileUrl=${context.fileUrl}`);
    try {
      logger.info(`Processing batch ${context.batchNumber} for job ${context.jobId}`);
console.log(`Processing batch ${context.batchNumber} for job ${context.jobId}`);
      // Download CSV from MinIO
      const records = await this.downloadAndParseCsv(
        context.fileUrl,
        context.organizationId,
        context.batchNumber
      );
console.log(`Downloaded and parsed ${records.length} records for batch ${context.batchNumber}`);
      if (records.length === 0) {
        logger.warn(
          `No records found in batch ${context.batchNumber} for job ${context.jobId}`
        );
        return {
          success: true,
          processedCount: 0,
          failedCount: 0,
        };
      }
console.log(`Processing ${records.length} records in batch ${context.batchNumber}`);
      logger.info(
        `Batch ${context.batchNumber}: Found ${records.length} records to process`
      );

      // Validate records
      const validation = validateStudentRecords(records);
      if (!validation.valid && validation.errors.length > 0) {
        logger.warn(
          `Validation failed for ${validation.errors.length} records in batch ${context.batchNumber}`
        );
      } else {
        logger.info(`All ${records.length} records passed validation`);
      }
console.log(`Validation complete for batch ${context.batchNumber}: ${validation.valid ? 'all valid' : validation.errors.length + ' invalid'}`);
      // Log first record for debugging
      if (records.length > 0) {
        logger.info(`First record in batch: ${JSON.stringify(records[0])}`);
      }
console.log(`First record in batch ${context.batchNumber}: ${JSON.stringify(records[0])}`);
      // Process valid records with user-service
      const { processed, failed, errorRecords } = await this.sendToUserService(
        records,
        context.organizationId,
        context.userId
      );
console.log(`Processed batch ${context.batchNumber}: ${processed} success, ${failed} failed`);
      logger.info(`CsvProcessor.processBatch: sendToUserService returned processed=${processed} failed=${failed}`);

      // Update job progress in database
      await this.updateJobProgress(context.jobId, processed, failed, errorRecords);
console.log(`Updated job progress for job ${context.jobId} after batch ${context.batchNumber}`);
      logger.info(
        `Batch ${context.batchNumber} completed: ${processed} processed, ${failed} failed`
      );

      return {
        success: true,
        processedCount: processed,
        failedCount: failed,
        errorRecords,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(
        `Error processing batch ${context.batchNumber}: ${errorMessage}`
      );
      return {
        success: false,
        processedCount: 0,
        failedCount: 0,
        errorMessage,
      };
    }
  }
  

  private async downloadAndParseCsv(
    fileUrl: string,
    organizationId: string,
    batchNumber: number
  ): Promise<StudentRecord[]> {
    try {
      const bucketName = `org-${organizationId}`;
      
      // Extract key from URL: http://localhost:9000/bucket-name/file-name
      // URL format: {minioEndpoint}/{bucket}/{encodeURIComponent(key)}
      const urlObj = new URL(fileUrl);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts.length < 2) {
        throw new Error(`Invalid file URL format: ${fileUrl}`);
      }
      console.log(`Downloading CSV from bucket=${bucketName}, key=${pathParts.slice(1).join('/')}`);
      // pathParts[0] = bucket, pathParts[1:] = key parts
      const key = decodeURIComponent(pathParts.slice(1).join('/'));
      
      logger.info(`Downloading CSV from bucket: ${bucketName}, key: ${key}`);
      console.log(`Downloading CSV from bucket: ${bucketName}, key: ${key}`);

      // Download from MinIO
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
console.log(`Sending GetObjectCommand to MinIO for bucket=${bucketName}, key=${key}`);
      const response = await s3Client.send(command);
      const records: StudentRecord[] = [];
      let rowNumber = 0; // Row counter (0 = header, 1+ = data rows)
      const batchSize = parseInt(process.env.CSV_BATCH_SIZE || '50', 10);
      
      // Calculate which rows belong to this batch
      const startRow = (batchNumber - 1) * batchSize + 1; // First data row for this batch
      const endRow = startRow + batchSize - 1; // Last data row for this batch

      logger.info(
        `Batch ${batchNumber}: Processing rows ${startRow} to ${endRow} (batch size: ${batchSize})`
      );

      return new Promise((resolve, reject) => {
        (response.Body as Readable)
          .pipe(csv())
          .on('data', (row: any) => {
            rowNumber++; // Increment AFTER header (csv-parser skips header automatically)
            
            // Only include rows that belong to this batch
            if (rowNumber >= startRow && rowNumber <= endRow) {
              logger.debug(`Row ${rowNumber}: Adding to batch`);
              const normalizedRow = this.normalizeRecord(row);
              records.push(normalizedRow);
            } else if (rowNumber > endRow) {
              // Stop processing once we've passed this batch
              logger.debug(`Row ${rowNumber}: Beyond batch range, skipping`);
            }
          })
          .on('end', () => {
            logger.info(
              `CSV parsing complete. Total rows read: ${rowNumber}, Records in batch: ${records.length}`
            );
            resolve(records);
          })
          .on('error', reject);
      });

      console.log(`Downloaded and parsed ${records.length} records for batch ${batchNumber}`);
    } catch (error) {
      logger.error(`Failed to download and parse CSV: ${error}`);
      throw error;
    }
  }

  private normalizeRecord(row: any): StudentRecord {
    return {
      email: (row.email || '').toString().trim().toLowerCase(),
      firstname: (row.firstname || row.firstName || '').toString().trim(),
      lastname: (row.lastname || row.lastName || '').toString().trim(),
      phoneno: (row.phoneno || row.phoneNo || '').toString().trim(),
    };
  }

  private async sendToUserService(
    records: StudentRecord[],
    organizationId: string,
    userId: string
  ): Promise<{ processed: number; failed: number; errorRecords: Array<{ email: string; error: string }> }> {
    let processed = 0;
    let failed = 0;
    const errorRecords: Array<{ email: string; error: string }> = [];

    const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:4001';
    const endpoint = process.env.USER_SERVICE_ENDPOINT || '/student-create';
    const fullUrl = `${userServiceUrl}${endpoint}`;

    logger.info(`Processing ${records.length} records`);
    logger.info(`User service URL: ${fullUrl}`);

    console.log(`Processing ${records.length} records to user service at ${fullUrl}`);

    if (records.length === 0) {
      return { processed: 0, failed: 0, errorRecords: [] };
    }
    console.log(`Sending records to user service: ${JSON.stringify(records)}`);

    for (const record of records) {
      try {
        const payload = {
          email: record.email,
          firstName: record.firstname,
          lastName: record.lastname,
          phoneNo: record.phoneno,
          organizationId,
          createdBy: userId,
        };

        console.log(`Sending user data: ${JSON.stringify(payload)}`);

        logger.info(`Sending user data: ${JSON.stringify(payload)}`);

        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const responseText = await response.text();
        logger.info(`Response status: ${response.status}, body: ${responseText}`);
        console.log(`Response status: ${response.status}, body: ${responseText}`);

        if (response.ok) {
          processed++;
          logger.info(`✅ Successfully created user ${record.email}`);
        } else {
          failed++;
          const errorMsg = `${response.status} - ${responseText}`;
          logger.warn(`❌ Failed to create user ${record.email}: ${errorMsg}`);
          errorRecords.push({ email: record.email, error: errorMsg });
        }
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`❌ Error creating user ${record.email}: ${errorMsg}`);
        errorRecords.push({ email: record.email, error: errorMsg });
      }
    }

    logger.info(`Batch complete: ${processed} processed, ${failed} failed`);
console.log(`Batch complete: ${processed} processed, ${failed} failed`);
    return { processed, failed, errorRecords };
  }

  private async updateJobProgress(
    jobId: string,
    processedCount: number,
    failedCount: number,
    errorRecords?: Array<{ email: string; error: string }>
  ): Promise<void> {
    try {
      // Build error JSON to store
      let errorsJson = JSON.stringify([]);
      if (errorRecords && errorRecords.length > 0) {
        errorsJson = JSON.stringify(errorRecords);
      }

      logger.info(
        `Updating job ${jobId} progress: +${processedCount} success, +${failedCount} failed`
      );

      await query(
        `UPDATE csv_processing_jobs 
         SET success_count = success_count + $1,
             failure_count = failure_count + $2,
             errors = CASE 
               WHEN errors IS NULL OR errors = '[]'::jsonb THEN $3::jsonb
               ELSE errors || $3::jsonb
             END,
             updated_at = NOW()
         WHERE job_id = $4`,
        [processedCount, failedCount, errorsJson, jobId]
      );

      logger.info(`✅ Job progress updated successfully`);
    } catch (error) {
      logger.error(
        `Failed to update job progress: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export const csvProcessor = new CsvProcessor();
