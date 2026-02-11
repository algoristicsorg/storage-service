// app/api/storage/route.ts
import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { createS3Client, getOrgBucketName } from "@/lib/minio";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "@/lib/logger";
import { validateCsvFile } from "@/lib/csv-validator";
import { query } from "@/lib/db";
import { randomUUID } from "crypto";
import { getUserFromToken } from "@/lib/auth";

/* ---------------- Schema ---------------- */
const uploadSchema = z.object({
  orgId: z.string().min(1).optional(),
  key: z.string().min(1),
  content: z.string().min(1), // base64
  contentType: z.string().min(1),
});

/* ---------------- Allowed MIME Types ---------------- */
const ALLOWED_CONTENT_TYPES = [
  // Video
  "video/mp4",
  "video/webm",
  "video/ogg",

  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",

  // Images
  "image/jpeg",
  "image/jpg", // ✅ NEW
  "image/png",
  "image/svg+xml",
  "image/gif",
  "image/webp",

  // Documents
  "application/pdf",
  "text/plain",
  "application/rtf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  // Spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  // Data
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",

  // SQL
  "application/sql", // ✅ NEW
  "text/sql",        // ✅ NEW

  // Archives
  "application/zip",
  "application/x-zip-compressed",
];

/* ---------------- POST /api/storage ---------------- */
export async function POST(req: NextRequest) {
  try {
    /* -------- Auth -------- */
    const user = await getUserFromToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
 
 
    const createdBy = user.userId;
    const organizationId = user.organizationId;
 
    // 2. Parse request body fo to extract orgId, key, content, contentType
    const parsedBody = await req.json();
 
    // Validate against Zod schema
    const { orgId, key, content, contentType } = uploadSchema.parse(parsedBody);
 
    await logger.info(`POST /storage orgId=${orgId} key=${key}`);
    if (
      !contentType ||
      !["video/mp4", "text/csv", "application/pdf", "image/jpeg", "image/png", "image/svg+xml", "audio/mpeg", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(
      contentType.toLowerCase()
      )
    ) {
      return NextResponse.json(
      {
        error:
        "Only video/mp4, text/csv, application/pdf, image/jpeg, image/png, image/svg+xml, audio/mpeg, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, or application/vnd.openxmlformats-officedocument.spreadsheetml.sheet content types allowed",
      },
      { status: 400 }
      );
    }
    if (
      !contentType ||
      !["video/mp4", "text/csv", "application/pdf", "image/jpeg", "image/png", "image/svg+xml", "audio/mpeg", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(
      contentType.toLowerCase()
      )
    ) {
      return NextResponse.json(
      {
        error:
        "Only video/mp4, text/csv, application/pdf, image/jpeg, image/png, image/svg+xml, audio/mpeg, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, or application/vnd.openxmlformats-officedocument.spreadsheetml.sheet content types allowed",
      },
      { status: 400 }
      );
    }
    if (
      !contentType ||
      !["video/mp4", "text/csv", "application/pdf", "image/jpeg", "image/png", "image/svg+xml", "audio/mpeg", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(
      contentType.toLowerCase()
      )
    ) {
      return NextResponse.json(
      {
        error:
        "Only video/mp4, text/csv, application/pdf, image/jpeg, image/png, image/svg+xml, audio/mpeg, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, or application/vnd.openxmlformats-officedocument.spreadsheetml.sheet content types allowed",
      },
      { status: 400 }
      );
    }
    const buffer = Buffer.from(content, "base64");
    const signature = buffer.slice(0, 8);

    /* -------- File Signature Checks -------- */
    const isMp4 = buffer.slice(4, 8).toString("utf8") === "ftyp";

    const isMp3 =
      (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xfa)) ||
      buffer.slice(0, 3).toString("utf8") === "ID3";

    const isPdf = signature.slice(0, 5).toString("utf8") === "%PDF-";

    const isJpeg =
      (buffer[0] === 0xff && buffer[1] === 0xd8) || // jpeg
      contentType === "image/jpg" ||               // jpg
      key.toLowerCase().endsWith(".jpg");

    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;

    const isGif = buffer.slice(0, 3).toString("ascii") === "GIF";

    const isWebp =
      buffer.slice(0, 4).toString("ascii") === "RIFF" &&
      buffer.slice(8, 12).toString("ascii") === "WEBP";

    const isSvg =
      contentType === "image/svg+xml" &&
      buffer.toString("utf8", 0, 200).includes("<svg");

    const isCsv =
      contentType === "text/csv" || key.toLowerCase().endsWith(".csv");

    const isJson =
      contentType === "application/json" &&
      buffer.toString("utf8", 0, 50).trim().startsWith("{");

    const isXml =
      (contentType === "application/xml" || contentType === "text/xml") &&
      buffer.toString("utf8", 0, 100).includes("<?xml");

    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;

    const isDoc =
      contentType === "application/msword" || key.endsWith(".doc");

    const isDocx =
      isZip &&
      (contentType.includes("wordprocessingml") || key.endsWith(".docx"));

    const isPpt =
      contentType === "application/vnd.ms-powerpoint" ||
      key.endsWith(".ppt");

    const isPptx =
      isZip &&
      (contentType.includes("presentationml") || key.endsWith(".pptx"));

    const isXlsx =
      isZip &&
      (contentType.includes("spreadsheetml") || key.endsWith(".xlsx"));

    /* -------- SQL Validation (safe text-based) -------- */
    const isSql =
      contentType === "application/sql" ||
      contentType === "text/sql" ||
      key.toLowerCase().endsWith(".sql");

    if (isSql) {
      const sqlText = buffer.toString("utf8", 0, 200).toUpperCase();
      if (
        !sqlText.includes("SELECT") &&
        !sqlText.includes("INSERT") &&
        !sqlText.includes("UPDATE") &&
        !sqlText.includes("DELETE") &&
        !sqlText.includes("CREATE")
      ) {
        return NextResponse.json(
          { error: "Invalid SQL file" },
          { status: 400 }
        );
      }
    }

    /* -------- Final Validation Gate -------- */
    if (
      !isMp4 &&
      !isMp3 &&
      !isPdf &&
      !isJpeg &&
      !isPng &&
      !isGif &&
      !isWebp &&
      !isSvg &&
      !isCsv &&
      !isJson &&
      !isXml &&
      !isDoc &&
      !isDocx &&
      !isPpt &&
      !isPptx &&
      !isXlsx &&
      !isSql &&
      !isZip
    ) {
      return NextResponse.json(
        { error: "Invalid or unsupported file signature" },
        { status: 400 }
      );
    }

    /* -------- CSV Validation -------- */
    if (isCsv) {
      const csvCheck = validateCsvFile(buffer, key);
      if (!csvCheck.isValid) {
        return NextResponse.json(
          { error: "CSV validation failed", details: csvCheck.error },
          { status: 400 }
        );
      }
    }

    /* -------- S3 Upload -------- */
    const s3 = createS3Client();
    const bucket = getOrgBucketName(orgId || organizationId);

    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
 
 
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const endpoint =
      process.env.EXTERNAL_MINIO_ENDPOINT || "http://localhost:9000";
    const url = `${endpoint}/${bucket}/${encodeURIComponent(key)}`;

    /* -------- CSV Job Creation -------- */
    if (isCsv) {
      const csvMeta = validateCsvFile(buffer, key);
      const jobId = randomUUID();

      await query(
        `INSERT INTO csv_processing_jobs
         (job_id, organization_id, file_name, file_size, total_records,
          success_count, failure_count, csv_status, errors, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,0,0,'queued',$6,$7,NOW())`,
        [
          jobId,
          orgId || organizationId,
          key,
          buffer.length,
          csvMeta.recordCount || 0,
          JSON.stringify([]),
          createdBy,
        ]
      );

      return NextResponse.json(
        {
          bucket,
          key,
          url,
          status: "uploaded",
          csvProcessing: {
            jobId,
            recordCount: csvMeta.recordCount,
            headers: csvMeta.headers,
            status: "queued",
          },
        },
        { status: 201 }
      );
    }
 
 
    return NextResponse.json(
      { bucket, key, url, status: "uploaded" },
      { status: 201 }
    );
  } catch (error: any) {
    await logger.error(`Upload failed: ${error.message}`);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
 
 
 
 