// lib/s3.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const awsRegion = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

const s3Client = new S3Client({
  region: awsRegion,
  credentials: accessKey && secretKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined,
});

// Prefer CI_AWS_S3_BUCKET_NAME (CI / Amplify), then AWS_S3_BUCKET_NAME, fallback to uploads bucket
const BUCKET_NAME = process.env.CI_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || 'jvtutorcorner-uploads';

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * Upload a file to S3
 */
export async function uploadToS3(file: File | Buffer, key: string, mimeType?: string): Promise<UploadResult> {
  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: mimeType || 'image/jpeg',
        ACL: 'public-read', // Make images publicly accessible
      },
    });

    await upload.done();

    const url = `https://${BUCKET_NAME}.s3.${awsRegion}.amazonaws.com/${key}`;

    return { url, key };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error('Failed to upload image to S3');
  }
}

// Read S3 object into a Buffer
export async function getObjectBuffer(key: string): Promise<Buffer> {
  try {
    const cmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    const res = await s3Client.send(cmd);
    const stream = res.Body as any;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (error) {
    console.error('S3 getObject error:', error);
    throw error;
  }
}

// Generate a presigned GET URL for a key
export async function getSignedUrlForKey(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  return await getSignedUrl(s3Client, cmd, { expiresIn });
}

export async function deleteObjectKey(key: string) {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  } catch (error) {
    console.error('S3 deleteObject error:', error);
    throw error;
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error('Failed to delete image from S3');
  }
}

/**
 * Extract S3 key from URL
 */
export function getS3KeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    // Remove empty first part and 'carousel' folder
    return pathParts.slice(2).join('/');
  } catch {
    return null;
  }
}