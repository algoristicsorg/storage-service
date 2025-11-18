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
  const { orgId, key, content, contentType = 'application/octet-stream' } = uploadSchema.extend({
    contentType: z.string().optional(),
  }).parse(body);
  await logger.info(`POST /storage orgId=${orgId} key=${key}`);
  const s3 = createS3Client();
  const bucket = getOrgBucketName(orgId);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
 const buffer = Buffer.from(content, 'base64');

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType, // Use contentType from request or default generic
  }));
  const minioEndpoint = process.env.EXTERNAL_MINIO_ENDPOINT || 'http://localhost:9000';
  const minioUrl = `${minioEndpoint}/${bucket}/${encodeURIComponent(key)}`;
  // url =`/storage?orgId=${orgId}&key=${key}`
  return NextResponse.json({ bucket, key, status: 'uploaded',url:minioUrl }, { status: 201 });
}


