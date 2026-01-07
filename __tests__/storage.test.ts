import { POST } from "../app/storage/route";
import { NextRequest } from "next/server";
import { 
  HeadBucketCommand, 
  CreateBucketCommand, 
  PutObjectCommand 
} from "@aws-sdk/client-s3";

// 1. Mock the entire S3 Client manually
const mockS3Send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockS3Send,
    })),
    HeadBucketCommand: jest.fn(),
    CreateBucketCommand: jest.fn(),
    PutObjectCommand: jest.fn(),
  };
});

// 2. Mock other internal dependencies
jest.mock("@/lib/auth", () => ({ getUserFromToken: jest.fn() }));
jest.mock("@/lib/db", () => ({ query: jest.fn() }));
jest.mock("@/lib/csv-validator", () => ({ validateCsvFile: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() }
}));
jest.mock("@/lib/minio", () => ({
  createS3Client: () => new (require("@aws-sdk/client-s3").S3Client)(),
  getOrgBucketName: (id: string) => `org-${id}-bucket`
}));

describe("POST /api/storage (Manual Mocking)", () => {
  const { getUserFromToken } = require("@/lib/auth");
  const { validateCsvFile } = require("@/lib/csv-validator");
  const { query } = require("@/lib/db");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createReq = (body: object) => new NextRequest("http://localhost/api/storage", {
    method: "POST",
    body: JSON.stringify(body)
  });

  it("should successfully upload a PDF and handle bucket creation logic", async () => {
    // Arrange
    getUserFromToken.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    
    // Logic: First call (HeadBucket) fails, Second (CreateBucket) succeeds, Third (Put) succeeds
    mockS3Send
      .mockRejectedValueOnce(new Error("Bucket not found")) // HeadBucket fails
      .mockResolvedValueOnce({}) // CreateBucket succeeds
      .mockResolvedValueOnce({}); // PutObject succeeds

    const pdfContent = Buffer.from("%PDF-1.4 sample content").toString("base64");

    // Act
    const res = await POST(createReq({
      key: "test.pdf",
      content: pdfContent,
      contentType: "application/pdf"
    }));

    // Assert
    expect(res.status).toBe(201);
    expect(mockS3Send).toHaveBeenCalledTimes(3); 
    // This hits the 'catch' block for CreateBucketCommand, giving 100% coverage there
  });

  it("should handle CSV processing and database insertion", async () => {
    // Arrange
    getUserFromToken.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    validateCsvFile.mockReturnValue({ isValid: true, recordCount: 5, headers: ['id'] });
    mockS3Send.mockResolvedValue({}); // All S3 calls succeed
    query.mockResolvedValue({ rowCount: 1 });

    const csvContent = Buffer.from("id\n1").toString("base64");

    // Act
    const res = await POST(createReq({
      key: "data.csv",
      content: csvContent,
      contentType: "text/csv"
    }));

    // Assert
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.csvProcessing.status).toBe("queued");
    expect(query).toHaveBeenCalled(); // Hits the DB insertion branch
  });

  it("should fail when an invalid file signature is provided", async () => {
    getUserFromToken.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    
    // Sending a string that isn't PDF, MP4, or CSV
    const res = await POST(createReq({
      key: "malicious.pdf",
      content: Buffer.from("not-a-pdf").toString("base64"),
      contentType: "application/pdf"
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not a valid");
  });
});