import { POST } from "../app/get-video/route";
import { NextRequest } from "next/server";

// 1. Manual Mock for AWS SDK S3
const mockS3Send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  HeadObjectCommand: jest.fn().mockImplementation((args) => ({ ...args, name: 'HeadObjectCommand' })),
  GetObjectCommand: jest.fn().mockImplementation((args) => ({ ...args, name: 'GetObjectCommand' })),
}));

// 2. Mock Internal Libs
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/minio", () => ({
  createS3Client: () => new (require("@aws-sdk/client-s3").S3Client)(),
}));

describe("POST /api/get-video (Video Streaming & Range Support)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createReq = (body: object, headers: Record<string, string> = {}) => {
    return new NextRequest("http://localhost/api/get-video", {
      method: "POST",
      headers: new Headers(headers),
      body: JSON.stringify(body),
    });
  };

  it("should return 400 if URL is missing or invalid (Zod Branch)", async () => {
    const res = await POST(createReq({ url: "not-a-url" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid request body");
  });

  it("should return 400 if URL path is malformed", async () => {
    const res = await POST(createReq({ url: "http://minio:9000/only-bucket" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid URL format. Expected: endpoint/bucket/key' });
  });

  it("should return 200 (Full Content) when no Range header is present", async () => {
    // Mock HeadObject for file size
    mockS3Send.mockResolvedValueOnce({ ContentLength: 1000 });
    // Mock GetObject for body
    mockS3Send.mockResolvedValueOnce({ Body: "fake-stream" });

    const res = await POST(createReq({ url: "http://minio/bucket/video.mp4" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("1000");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("should return 206 (Partial Content) for a valid range request", async () => {
    const fileSize = 1000;
    mockS3Send.mockResolvedValueOnce({ ContentLength: fileSize });
    mockS3Send.mockResolvedValueOnce({ Body: "partial-stream" });

    const req = createReq(
      { url: "http://minio/bucket/video.mp4" },
      { range: "bytes=0-499" }
    );

    const res = await POST(req);

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 0-499/${fileSize}`);
    expect(res.headers.get("Content-Length")).toBe("500");
  });

  it("should return 416 for an unsatisfiable range", async () => {
    mockS3Send.mockResolvedValueOnce({ ContentLength: 1000 });

    const req = createReq(
      { url: "http://minio/bucket/video.mp4" },
      { range: "bytes=1500-2000" }
    );

    const res = await POST(req);

    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
  });

  it("should return 400 for a malformed range header", async () => {
    mockS3Send.mockResolvedValueOnce({ ContentLength: 1000 });

    const req = createReq(
      { url: "http://minio/bucket/video.mp4" },
      { range: "invalid-format" }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Malformed Range Header");
  });

  it("should return 500 when S3 throws an unexpected error", async () => {
    mockS3Send.mockRejectedValue(new Error("S3 Connection Lost"));

    const res = await POST(createReq({ url: "http://minio/bucket/video.mp4" }));
    
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("S3 Connection Lost");
  });
});