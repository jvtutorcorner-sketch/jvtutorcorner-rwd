// lib/s3.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const getAwsConfig = () => {
  // Use a different name for the bucket variable to avoid confusion
  const envBucket = process.env.CI_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
  const awsRegion = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
  
  // LOG THE EXACT BUCKET BEING USED
  console.log('[S3 Config] Resolved:', { 
    bucket: envBucket || 'MISSING', 
    region: awsRegion,
    hasAccessKey: !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID)
  });

  const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
  const bucketName = process.env.CI_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;

  return { awsRegion, accessKey, secretKey, bucketName };
};

const getS3Client = () => {
  const { awsRegion, accessKey, secretKey } = getAwsConfig();
  return new S3Client({
    region: awsRegion,
    credentials: accessKey && secretKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined,
  });
};

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * Upload a file to S3
 */
export async function uploadToS3(file: File | Buffer, key: string, mimeType?: string): Promise<UploadResult> {
  const { awsRegion, bucketName, accessKey, secretKey } = getAwsConfig();

  if (!bucketName) {
    const err = new Error('S3 bucket is not configured. Set AWS_S3_BUCKET_NAME or CI_AWS_S3_BUCKET_NAME');
    console.error('[S3 Upload] Aborting upload - bucket not configured');
    throw err;
  }
  console.log('[S3 Upload] Starting upload:', {
    bucket: bucketName,
    key: key,
    region: awsRegion,
    mimeType: mimeType || 'image/jpeg',
    fileSize: file instanceof Buffer ? file.length : (file as File).size,
    fileType: file instanceof Buffer ? 'Buffer' : 'File',
    hasCredentials: !!(accessKey && secretKey)
  });

  try {
    const s3Client = getS3Client();
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: key,
        Body: file,
        ContentType: mimeType || 'image/jpeg',
      },
    });

    console.log('[S3 Upload] Upload instance created, starting upload...');
    const result = await upload.done();
    console.log('[S3 Upload] Upload completed successfully:', {
      location: result.Location,
      etag: result.ETag,
      bucket: result.Bucket,
      key: result.Key
    });

    const url = `https://${bucketName}.s3.${awsRegion}.amazonaws.com/${key}`;
    console.log('[S3 Upload] Generated URL:', url);

    return { url, key };
  } catch (error: any) {
    console.error('[S3 Upload] Upload failed with detailed error:', {
      error: error.message || error,
      code: error.code,
      statusCode: error.statusCode,
      name: error.name,
      stack: error.stack,
      region: awsRegion,
      bucket: bucketName,
      key: key,
    });

    throw error;
  }
}

/**
 * Generate a presigned PUT URL for direct client upload to S3.
 * Returns { url, key, publicUrl }
 */
export async function getPresignedPutUrl(key: string, mimeType: string = 'image/jpeg', expiresIn = 900) {
  const { awsRegion, bucketName } = getAwsConfig();
  if (!bucketName) {
    throw new Error('S3 bucket is not configured (AWS_S3_BUCKET_NAME)');
  }

  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: mimeType,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

  const publicUrl = `https://${bucketName}.s3.${awsRegion}.amazonaws.com/${key}`;

  return { url, key, publicUrl };
}

// Read S3 object into a Buffer
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const { bucketName } = getAwsConfig();
  try {
    const s3Client = getS3Client();
    const cmd = new GetObjectCommand({ Bucket: bucketName, Key: key });
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
  const { bucketName } = getAwsConfig();
  const s3Client = getS3Client();
  const cmd = new GetObjectCommand({ Bucket: bucketName, Key: key });
  return await getSignedUrl(s3Client, cmd, { expiresIn });
}

export async function deleteObjectKey(key: string) {
  const { bucketName } = getAwsConfig();
  try {
    const s3Client = getS3Client();
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
  } catch (error) {
    console.error('S3 deleteObject error:', error);
    throw error;
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  const { bucketName } = getAwsConfig();
  try {
    const s3Client = getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
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
    // Remove empty first part, keep the full path including carousel/ folder
    return pathParts.slice(1).join('/');
  } catch {
    return null;
  }
}