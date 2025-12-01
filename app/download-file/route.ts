// import { NextResponse } from 'next/server';
// import { z } from 'zod';
// import { createS3Client, getOrgBucketName } from '@/lib/minio';
// import { GetObjectCommand, GetObjectCommandOutput } from '@aws-sdk/client-s3';
// import { logger } from '@/lib/logger';



// // Function to convert the S3 Body (StreamingBlobPayloadOutputTypes) into a Web Stream
// // This is the key fix for the type errors.
// function getWebStream(body: GetObjectCommandOutput['Body']): ReadableStream<any> | undefined {
//   if (!body) return undefined;
  
//   // Use the SDK's internal method to safely transform to a Web Stream
//   return body.transformToWebStream();
// }

// const downloadSchema = z.object({
//   orgId: z.string().min(1),
//   key: z.string().min(1),
// });

// export async function GET(req: Request) {
//     try {
//     const url = new URL(req.url);

//     const validationResult = downloadSchema.safeParse(Object.fromEntries(url.searchParams));
    
//     if (!validationResult.success) {
//       const issues = validationResult.error.issues.map(i => i.path[0]).join(', ');
//       return NextResponse.json({ error: `Missing or invalid query parameters: ${issues}` }, { status: 400 });
//     }

//     const { orgId, key } = validationResult.data;

//     await logger.info(`GET /storage/download orgId=${orgId} key=${key}`);

//     const s3 = createS3Client();
//     const bucket = getOrgBucketName(orgId);

//     const getObjectResult = await s3.send(new GetObjectCommand({
//       Bucket: bucket,
//       Key: key,
//     }));

//     const contentType = getObjectResult.ContentType || 'application/octet-stream';
//     const fileName = key.substring(key.lastIndexOf('/') + 1) || 'download'; 
//     const fileStream = getObjectResult.Body;

//     // Use the fixed helper function
//     const webStream = getWebStream(fileStream);

//     if (!webStream) {
//         return NextResponse.json({ error: 'File body is empty' }, { status: 500 });
//     }

//     // Pass the Web Stream to NextResponse (casting as any to resolve type conflicts)
//     const response = new NextResponse(webStream as any, { 
//         status: 200,
//         headers: {
//             'Content-Disposition': `attachment; filename="${fileName}"`, 
//             'Content-Type': contentType,
//             'Content-Length': (getObjectResult.ContentLength || 0).toString(),
//             'Cache-Control': 'no-cache, no-store, must-revalidate', // Recommended for downloads
//         },
//     });

//     return response;

//   } catch (error: any) {
//     if (error.name === 'NoSuchKey') {
//         await logger.warn(`File not found: ${error.message}`);
//         return NextResponse.json({ error: 'File not found' }, { status: 404 });
//     }
    
//     await logger.error(`Download failed: ${error.message || error}`);
//     return NextResponse.json({ error: `Download failed: ${error.message || error}` }, { status: 500 });
//   }
// }


import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createS3Client, getOrgBucketName } from '@/lib/minio';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '@/lib/logger';

// Schema for validating the URL search parameters
const downloadSchema = z.object({
  orgId: z.string().min(1, { message: 'orgId is required' }),
  key: z.string().min(1, { message: 'key is required' }),
});

/**
 * GET /api/storage/download?orgId=...&key=...
 * Why: Downloads a file object from the org-specific bucket.
 * @param req The incoming Next.js Request object (contains URL/search params).
 */
export async function GET(req: Request) {
  try {
    // 1. Get and Validate Parameters from search parameters
    const { searchParams } = new URL(req.url);
    const params = {
        orgId: searchParams.get('orgId'),
        key: searchParams.get('key'),
    };
    
    const validatedParams = downloadSchema.safeParse(params);
    if (!validatedParams.success) {
        // Zod validation error
        const errorMessage = validatedParams.error.issues.map(i => i.message).join(', ');
        await logger.error(`GET /storage/download validation error: ${errorMessage}`);
        return NextResponse.json({ error: `Invalid query parameters: ${errorMessage}` }, { status: 400 });
    }
    
    const { orgId, key } = validatedParams.data;

    // 2. Determine Bucket Name and Prepare for S3 access
    const s3 = createS3Client();
    const bucket = getOrgBucketName(orgId);

    // Determine the filename for the Content-Disposition header
    // Use the last part of the key as the suggested filename
    const fileName = key.split('/').pop() || 'downloaded-file'; 

    await logger.info(`GET /storage/download bucket=${bucket} key=${key}`);

    // 3. Retrieve the Object Stream from S3
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3.send(command);

    // 4. Prepare Response Headers for Download
    // Use Content-Type from S3 response, default to binary stream
    const contentType = response.ContentType || 'application/octet-stream';

    // *** Key Change for Download ***
    // Content-Disposition: attachment triggers the browser download prompt
    return new NextResponse(response.Body as any, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`, // Triggers download
        'Access-Control-Allow-Origin': '*', // Adjust for your CORS needs
        // Optional: Include Content-Length for better download progress
        ...(response.ContentLength && { 'Content-Length': response.ContentLength.toString() }),
      },
    });

  } catch (error: any) {
    // Handle S3/MinIO errors (e.g., Object Not Found) and internal server errors
    const errorMessage = error.message || 'Internal Server Error';
    await logger.error(`Download failed: ${errorMessage}`);
    return NextResponse.json({ error: `Download failed: ${errorMessage}` }, { status: 500 });
  }
}