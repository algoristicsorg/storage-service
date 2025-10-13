import { S3Client } from '@aws-sdk/client-s3';

export function createS3Client() {
  const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
  const accessKeyId = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'admin';
  const secretAccessKey = process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'admin12345';
  return new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function getOrgBucketName(orgId: string) {
  return `org-${orgId}-bucket`;
}


