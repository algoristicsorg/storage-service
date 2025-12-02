import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createS3Client } from '@/lib/minio';
import { HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '@/lib/logger';

const videoUrlSchema = z.object({
  url: z.string().url('Invalid URL format'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url: videoUrl } = videoUrlSchema.parse(body);

    const urlObj = new URL(videoUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return NextResponse.json(
        { error: 'Invalid URL format. Expected: endpoint/bucket/key' },
        { status: 400 }
      );
    }

    const bucket = pathParts[0];
    const key = decodeURIComponent(pathParts.slice(1).join('/'));

    await logger.info(`POST /get-video bucket=${bucket} key=${key}`);

    const s3 = createS3Client();
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const fileSize = head.ContentLength ?? 0;

    const rangeHeader = req.headers.get('range');

    if (!rangeHeader) {
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

      return new NextResponse(obj.Body as any, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      return new NextResponse('Malformed Range Header', { status: 400 });
    }

    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
    if (start > end || end >= fileSize) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }

    const contentLength = end - start + 1;
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end}` })
    );

    return new NextResponse(obj.Body as any, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(contentLength),
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      await logger.error(`POST /get-video validation error: ${error.message}`);
      return NextResponse.json(
        { error: 'Invalid request body: url is required and must be valid' },
        { status: 400 }
      );
    }
    await logger.error(`Error streaming video: ${error.message || error}`);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
