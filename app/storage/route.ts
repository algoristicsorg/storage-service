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
  const { orgId, key, content } = uploadSchema.parse(body);
  await logger.info(`POST /api/storage orgId=${orgId} key=${key}`);
  const s3 = createS3Client();
  const bucket = getOrgBucketName(orgId);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(content, 'utf8'), ContentType: 'text/plain' }));
  const url =`http://localhost:4006/api/storage?orgId=${bucket}&key=${key}`
  return NextResponse.json({ bucket, key, status: 'uploaded' }, { status: 201 });
}


