import { GET } from "../app/download-file/route";
import { NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";

// 1. Manual Mock for AWS SDK S3
const mockS3Send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  GetObjectCommand: jest.fn().mockImplementation((args) => args),
}));

// 2. Mock Internal Libs
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/minio", () => ({
  createS3Client: () => new (require("@aws-sdk/client-s3").S3Client)(),
  getOrgBucketName: (orgId: string) => `bucket-${orgId}`,
}));

describe("GET /api/storage/download", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createReq = (url: string) => new NextRequest(url, { method: "GET" });

  it("should return 400 if orgId or key are missing", async () => {
    // Missing 'key' parameter
    const req = createReq("http://localhost/api/storage/download?orgId=123");
    const res = await GET(req);
    
    expect(res.status).toBe(400);
    const data = await res.json();
    
    // MATCHING ACTUAL ZOD OUTPUT: "Expected string, received null"
    expect(data.error).toContain("Invalid query parameters");
    expect(data.error).toMatch(/key|string/); 
  });

  it("should return a 200 response with correct download headers", async () => {
    mockS3Send.mockResolvedValueOnce({
      Body: "fake-stream",
      ContentType: "application/pdf",
      ContentLength: 1024,
    });

    const req = createReq("http://localhost/api/storage/download?orgId=org_abc&key=report.pdf");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="report.pdf"');
  });

  it("should return 500 if S3 retrieval fails", async () => {
    // Force the S3 mock to throw an error
    const s3Error = new Error("S3 Access Denied");
    mockS3Send.mockRejectedValueOnce(s3Error);

    const req = createReq("http://localhost/api/storage/download?orgId=org1&key=file.txt");
    const res = await GET(req);

    // Verify status is 500
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Download failed: S3 Access Denied");
  });
});