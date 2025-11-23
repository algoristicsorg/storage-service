import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createS3Client, getOrgBucketName } from '@/lib/minio';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '@/lib/logger';

const videoUrlSchema = z.object({
  url: z.string().url('Invalid URL format'),
});

/**
 * POST /api/get-video
 * Why: Streams video objects for an organization to support video playback (request body).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url: videoUrl } = videoUrlSchema.parse(body);

    // Parse URL in format: ${minioEndpoint}/${bucket}/${encodeURIComponent(key)}
    // Example: http://localhost:9000/org-abc-bucket/video%20file.mp4
    const urlObj = new URL(videoUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean); // Remove empty strings
    
    if (pathParts.length < 2) {
      return NextResponse.json({ error: 'Invalid URL format. Expected: endpoint/bucket/key' }, { status: 400 });
    }

    const bucket = pathParts[0];
    const key = decodeURIComponent(pathParts.slice(1).join('/')); // Decode the key

    await logger.info(`POST /get-video bucket=${bucket} key=${key}`);

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
    if (error instanceof z.ZodError) {
      await logger.error(`POST /get-video validation error: ${error.message}`);
      return NextResponse.json({ error: 'Invalid request body: url is required and must be a valid URL' }, { status: 400 });
    }
    await logger.error(`Error streaming video: ${error.message || error}`);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}