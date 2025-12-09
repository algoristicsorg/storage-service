import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

interface RouteParams {
  params: {
    jobId: string;
  };
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { jobId } = params;
    console.log(`Fetching status for job ID: ${jobId}`);

    // Validate job ID format (UUID)
    if (!jobId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        console.log(`Invalid job ID format: ${jobId}`);
      return NextResponse.json(
        { error: 'Invalid job ID format' },
        { status: 400 }
      );
    }

    console.log(`Job ID format validated: ${jobId}`);

    // Query job status
    const result = await query(
      `SELECT job_id, organization_id, file_name, csv_status, total_records, 
              success_count, failure_count, errors, 
              created_at, updated_at, completed_at
       FROM csv_processing_jobs
       WHERE job_id = $1`,
      [jobId]
    );
    console.log(`Database query executed for job ID: ${jobId}`);

    if (result.rows.length === 0) {
        console.log(`Job not found: ${jobId}`);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }
    console.log(`Job found: ${jobId}`);

    const job = result.rows[0];
    const progress = job.total_records > 0
      ? Math.round(((job.success_count + job.failure_count) / job.total_records) * 100)
      : 0;
    console.log(`Job ${jobId} status fetched successfully.`);
    
    // Parse error records from the errors JSONB field
    const errorRecords = job.errors && Array.isArray(job.errors) ? job.errors : [];
    
    return NextResponse.json({
      jobId: job.job_id,
      organizationId: job.organization_id,
      fileName: job.file_name,
      fileSize: job.file_size,
      status: job.csv_status,
      totalRecords: job.total_records,
      successCount: job.success_count,
      failureCount: job.failure_count,
      progressPercentage: progress,
      errorRecords,
      createdBy: job.created_by,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at,
    });
  } catch (error) {
    logger.error(`Error fetching job status: ${error}`);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
