import { S3Client } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
}));

describe('MinIO Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should generate correct bucket name', () => {
    const { getOrgBucketName } = require('../lib/minio');
    expect(getOrgBucketName('test-org')).toBe('org-test-org-bucket');
  });

  it('should use default credentials when env is empty', () => {
    delete process.env.ACCESS_KEY;
    delete process.env.SECRET_KEY;
    delete process.env.MINIO_ROOT_USER;
    delete process.env.MINIO_ROOT_PASSWORD;

    let createS3Client: any;
    jest.isolateModules(() => {
      createS3Client = require('../lib/minio').createS3Client;
    });

    createS3Client();
    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
      credentials: { accessKeyId: 'admin', secretAccessKey: 'admin12345' }
    }));
  });

  it('should use MINIO_ROOT fallback', () => {
    delete process.env.ACCESS_KEY;
    process.env.MINIO_ROOT_USER = 'root_user';
    
    let createS3Client: any;
    jest.isolateModules(() => {
      createS3Client = require('../lib/minio').createS3Client;
    });

    createS3Client();
    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
      credentials: expect.objectContaining({ accessKeyId: 'root_user' })
    }));
  });
});