import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createS3Client, getOrgBucketName } from '@/lib/minio';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { logger } from '@/lib/logger';

const uploadSchema = z.object({ orgId: z.string().min(1), key: z.string().min(1), content: z.string().min(1) });

/**
 * GET /api/storage
 * Why: Lists objects for an organization to support content management.
 */


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  await logger.info(`GET /api/storage orgId=${orgId}`);
  const s3 = createS3Client();
  const bucket = getOrgBucketName(orgId);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try { await s3.send(new CreateBucketCommand({ Bucket: bucket })); } catch {}
  }
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
  return NextResponse.json({ bucket, objects: (listed.Contents || []).map(o => ({ key: o.Key, size: o.Size })) });
}

/**
 * POST /api/storage
 * Why: Uploads a small text blob into the org-specific bucket.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const schema = uploadSchema.extend({ contentType: z.string().optional() });
  const { orgId, key, content, contentType } = schema.parse(body);

  if (!contentType || contentType.toLowerCase() !== 'video/mp4') {
    return NextResponse.json({ error: 'Only video/mp4 content type allowed' }, { status: 400 });
  }

  const s3 = createS3Client();
  const bucket = getOrgBucketName(orgId);

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  const buffer = Buffer.from(content, 'base64');

  // Basic MP4 container check
  if (buffer.slice(4, 8).toString('utf-8') !== 'ftyp') {
    return NextResponse.json({ error: 'Uploaded file is not a valid MP4 container' }, { status: 400 });
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
}


