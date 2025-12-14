import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { createS3Client, getOrgBucketName } from "@/lib/minio";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "@/lib/logger";
import { validateCsvFile } from "@/lib/csv-validator";
import { query } from "@/lib/db";
import { randomUUID } from "crypto";
import { getUserFromToken } from "@/lib/auth";

const uploadSchema = z.object({
  orgId: z.string().min(1).optional(),
  key: z.string().min(1),
  content: z.string().min(1),
  contentType: z.string().optional(),
});

/**
 * GET /api/storage
 * Why: Lists objects for an organization to support content management.
 */

// export async function GET(req: Request) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const videoUrl = searchParams.get('url'); // Use 'url' param in query string
//     if (!videoUrl) {
//       return NextResponse.json({ error: 'url query parameter is required' }, { status: 400 });
//     }

//     // Parse URL in format: ${minioEndpoint}/${bucket}/${encodeURIComponent(key)}
//     // Example: http://localhost:9000/org-abc-bucket/video%20file.mp4
//     const urlObj = new URL(videoUrl);
//     const pathParts = urlObj.pathname.split('/').filter(Boolean); // Remove empty strings

//     if (pathParts.length < 2) {
//       return NextResponse.json({ error: 'Invalid URL format. Expected: endpoint/bucket/key' }, { status: 400 });
//     }

//     const bucket = pathParts[0];
//     const key = decodeURIComponent(pathParts.slice(1).join('/')); // Decode the key

//     await logger.info(`GET /storage bucket=${bucket} key=${key}`);

//     const s3 = createS3Client();

//     // Get object stream from MinIO/S3 using GetObjectCommand
//     const command = new GetObjectCommand({ Bucket: bucket, Key: key });
//     const response = await s3.send(command);

//     // Stream video data in response with appropriate headers
//     return new NextResponse(response.Body as any, {
//       headers: {
//         'Content-Type': 'video/mp4',
//         'Access-Control-Allow-Origin': '*',
//       },
//     });

//   } catch (error: any) {
//     // Log error and respond with JSON error
//     await logger.error(`Error streaming video: ${error.message || error}`);
//     return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
//   }
// }

/**
 * POST /api/storage
 * Why: Uploads a small text blob into the org-specific bucket.
 * For CSV files, creates a background processing job.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authentication and Authorization
    let user;
    try {
      user = await getUserFromToken(req);
      

    } catch (authError: any) {
      await logger.error(`Authentication failed: ${authError.message || authError}`);
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing Bearer token" },
        { status: 401 }
      );
    }

    const createdBy = user.userId;
    const organizationId = user.organizationId;

    // 2. Parse request body
    const parsedBody = await req.json();

    // Validate against Zod schema
    const { orgId, key, content, contentType } = uploadSchema.parse(parsedBody);

    await logger.info(`POST /storage orgId=${orgId} key=${key}`);
    if (
      !contentType ||
      !["video/mp4", "text/csv", "application/pdf"].includes(
        contentType.toLowerCase()
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Only video/mp4, text/csv, or application/pdf content types allowed",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(content, "base64");
    const signature = buffer.slice(0, 8);

    // MP4: bytes 4-8 == 'ftyp'
    const isMp4 = buffer.slice(4, 8).toString("utf-8") === "ftyp";

    // CSV: check if first few bytes are text starting with typical CSV characters (letters/digits/quotes, commas, newlines)
    // A simple heuristic: check ASCII printable chars and presence of commas/newlines in first 100 bytes
    const textSample = buffer.slice(0, 100).toString("utf-8");
    // CSV: Check file extension and content type instead of content heuristics
    const isCsv = 
      contentType.toLowerCase() === "text/csv" || 
      key.toLowerCase().endsWith(".csv");

    // PDF: starts with '%PDF-' signature
    const isPdf = signature.slice(0, 5).toString("utf-8") === "%PDF-";

    if (!isMp4 && !isCsv && !isPdf) {
      return NextResponse.json(
        { error: "Uploaded file is not a valid MP4, CSV, or PDF" },
        { status: 400 }
      );
    }

    // Additional CSV validation
    if (isCsv) {
      const csvValidation = validateCsvFile(buffer, key);
      if (!csvValidation.isValid) {
        return NextResponse.json(
          { 
            error: "CSV validation failed",
            details: csvValidation.error 
          },
          { status: 400 }
        );
      }
    }

    const s3 = createS3Client();
    const bucket = getOrgBucketName(orgId || organizationId);

    // Ensure bucket exists
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const minioEndpoint =
      process.env.EXTERNAL_MINIO_ENDPOINT || "http://localhost:9000";
    const minioUrl = `${minioEndpoint}/${bucket}/${encodeURIComponent(key)}`;

    // If CSV file, create a processing job
    if (isCsv) {
      const csvValidation = validateCsvFile(buffer, key);//
      const jobId = randomUUID();
      
      console.log(`[Storage Upload] Creating CSV job: jobId=${jobId}, orgId=${orgId}, file=${key}, records=${csvValidation.recordCount}`);
      
      try {
        await query(
          `INSERT INTO csv_processing_jobs 
           (job_id, organization_id, file_name, file_size, total_records, success_count, failure_count, csv_status, errors, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [
            jobId,
            orgId || organizationId,
            key,
            buffer.length,
            csvValidation.recordCount || 0,
            0,
            0,
            'queued',
            JSON.stringify([]),
            createdBy
          ]
        );

        console.log(`[Storage Upload] ✅ CSV job created successfully: ${jobId}`);

        await logger.info(
          `Created CSV processing job ${jobId} for file ${key} with ${csvValidation.recordCount} records`
        );

        return NextResponse.json(
          {
            bucket,
            key,
            status: "uploaded",
            url: minioUrl,
            csvProcessing: {
              jobId,
              recordCount: csvValidation.recordCount,
              headers: csvValidation.headers,
              status: "queued"
            }
          },
          { status: 201 }
        );
      } catch (dbError: any) {
        const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
        await logger.error(`Failed to create CSV processing job: ${errorMsg}`);
        // Still return success for upload, but note job creation failed
        return NextResponse.json(
          {
            bucket,
            key,
            status: "uploaded",
            url: minioUrl,
            warning: "File uploaded but CSV processing job creation failed",
            error_details: errorMsg
          },
          { status: 201 }
        );
      }
    }

    return NextResponse.json(
      { bucket, key, status: "uploaded", url: minioUrl },
      { status: 201 }
    );
  } catch (error: any) {
    await logger.error(`Upload failed: ${error.message || error}`);
    return NextResponse.json(
      { error: `Upload failed: ${error.message || error}` },
      { status: 500 }
    );
  }
}
