import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createS3Client, getOrgBucketName } from '@/lib/minio';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '@/lib/logger';




const uploadSchema = z.object({
  orgId: z.string().min(1),
  key: z.string().min(1),
  content: z.string().min(1),
  contentType: z.string().optional(),
});

/**
 * GET /api/storage
 * Why: Lists objects for an organization to support content management.
 */


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const videoUrl = searchParams.get('url'); // Use 'url' param in query string
    if (!videoUrl) {
      return NextResponse.json({ error: 'url query parameter is required' }, { status: 400 });
    }

    // Parse bucket and key from plain URL
    const urlObj = new URL(videoUrl);
    const bucket = urlObj.pathname.split('/')[1];
    const key = urlObj.pathname.split('/').slice(2).join('/');

    const s3 = createS3Client();

    // Get object stream from MinIO/S3 using GetObjectCommand
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3.send(command);

    // Stream video data in response with appropriate headers
    return new NextResponse(response.Body as any, {
      headers: {
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error: any) {
    // Log error and respond with JSON error
    await logger.error(`Error streaming video: ${error.message || error}`);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}


/**
 * POST /api/storage
 * Why: Uploads a small text blob into the org-specific bucket.
 */
export async function POST(req: Request) {
  try {
    // Directly parse JSON body
    const parsedBody = await req.json();

    // Validate against Zod schema
    const { orgId, key, content, contentType } = uploadSchema.parse(parsedBody);

    await logger.info(`POST /storage orgId=${orgId} key=${key}`);

    if (!contentType || contentType.toLowerCase() !== 'video/mp4') {
      return NextResponse.json({ error: 'Only video/mp4 content type allowed' }, { status: 400 });
    }

    const buffer = Buffer.from(content, 'base64');

    // Basic MP4 container signature check
    if (buffer.slice(4, 8).toString('utf-8') !== 'ftyp') {
      return NextResponse.json({ error: 'Uploaded file is not a valid MP4 container' }, { status: 400 });
    }

    const s3 = createS3Client();
    const bucket = getOrgBucketName(orgId);

    // Ensure bucket exists
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'video/mp4',
    }));

    const minioEndpoint = process.env.EXTERNAL_MINIO_ENDPOINT || 'http://localhost:9000';
    const minioUrl = `${minioEndpoint}/${bucket}/${encodeURIComponent(key)}`;

    return NextResponse.json({ bucket, key, status: 'uploaded', url: minioUrl }, { status: 201 });

  } catch (error: any) {
    await logger.error(`Upload failed: ${error.message || error}`);
    return NextResponse.json({ error: `Upload failed: ${error.message || error}` }, { status: 500 });
  }
}
