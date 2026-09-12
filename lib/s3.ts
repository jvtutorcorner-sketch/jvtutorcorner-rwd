// lib/s3.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * 物件儲存設定。
 *
 * 預設是 AWS S3，行為與先前完全相同。設定 STORAGE_S3_ENDPOINT 後改走 S3 相容儲存
 * （規劃中是 Cloudflare R2，見 docs/hybrid-architecture-plan.md）：
 *
 *   STORAGE_S3_ENDPOINT        例：https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 *   STORAGE_S3_REGION          R2 用 'auto'（預設值）
 *   STORAGE_BUCKET             未設定時沿用 CI_AWS_S3_BUCKET_NAME / AWS_S3_BUCKET_NAME
 *   STORAGE_ACCESS_KEY_ID      R2 API token 的 Access Key ID
 *   STORAGE_SECRET_ACCESS_KEY  R2 API token 的 Secret —— R2 無法使用 Amplify 的 IAM Role，一定要靜態金鑰
 *   STORAGE_PUBLIC_BASE_URL    公開讀取網址的前綴，例：https://files.jvtutorcorner.com
 *                              設定後 uploadToS3 / getPresignedPutUrl 回傳的公開網址改用它；
 *                              使用自訂 endpoint 時為必填（R2 的 S3 endpoint 本身不能匿名讀取）。
 *
 * 其他模組需要物件儲存時請用這裡匯出的函式，不要自己 new S3Client——
 * 否則切換到 R2 時那些地方會繼續打 AWS。
 */
const getAwsConfig = () => {
  const endpoint = process.env.STORAGE_S3_ENDPOINT || undefined;
  const bucketName =
    process.env.STORAGE_BUCKET || process.env.CI_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;

  if (endpoint) {
    return {
      endpoint,
      awsRegion: process.env.STORAGE_S3_REGION || 'auto',
      accessKey: process.env.STORAGE_ACCESS_KEY_ID,
      secretKey: process.env.STORAGE_SECRET_ACCESS_KEY,
      bucketName,
    };
  }

  return {
    endpoint: undefined,
    awsRegion: process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1',
    accessKey: process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY,
    bucketName,
  };
};

const getS3Client = () => {
  const { endpoint, awsRegion, accessKey, secretKey } = getAwsConfig();

  if (endpoint) {
    if (!accessKey || !secretKey) {
      throw new Error('STORAGE_S3_ENDPOINT is set but STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY are missing');
    }
    return new S3Client({
      region: awsRegion,
      endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      // 新版 SDK 預設會替每個請求計算 CRC32 checksum，並把 checksum 參數簽進 presigned URL；
      // 瀏覽器直傳（whiteboard／carousel presign）送不出對應的 header，簽章就會對不上。
      // 只在 API 要求時才計算，對 S3 相容儲存的相容性最好。
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  return new S3Client({
    region: awsRegion,
    credentials: accessKey && secretKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined,
  });
};

/** 目前使用中的 bucket（S3 或 R2）。 */
export function getStorageBucket(): string | undefined {
  return getAwsConfig().bucketName;
}

/** 需要直接下 S3 指令的地方（proxy 路由、健康檢查）用這個 client。 */
export function getStorageClient(): S3Client {
  return getS3Client();
}

/**
 * 物件儲存是否可用。取代各路由各自拼湊的判斷——先前有的只看 bucket、有的只看金鑰，
 * 同一個環境會得到不同答案。
 *
 * - 自訂 endpoint（R2）：要有 bucket 與靜態金鑰
 * - AWS S3：要有 bucket，且在正式環境（憑證由 Amplify SSR 的 IAM Role 提供）或本機有靜態金鑰
 */
export function isObjectStorageConfigured(): boolean {
  const { endpoint, bucketName, accessKey, secretKey } = getAwsConfig();
  if (!bucketName) return false;
  if (endpoint) return !!(accessKey && secretKey);
  return process.env.NODE_ENV === 'production' || !!accessKey;
}

/**
 * 物件的公開網址。設定 STORAGE_PUBLIC_BASE_URL 時用它，否則維持 S3 virtual-hosted 網址。
 * 使用自訂 endpoint 卻沒設公開網址時直接丟錯——那種網址無法匿名讀取，存進資料庫只會變成破圖。
 */
export function publicUrlForKey(key: string): string {
  const base = process.env.STORAGE_PUBLIC_BASE_URL;
  if (base) return `${base.replace(/\/+$/, '')}/${key}`;

  const { endpoint, awsRegion, bucketName } = getAwsConfig();
  if (endpoint) {
    throw new Error('STORAGE_PUBLIC_BASE_URL is required when STORAGE_S3_ENDPOINT is set');
  }
  return `https://${bucketName}.s3.${awsRegion}.amazonaws.com/${key}`;
}

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
    const err = new Error('S3 bucket is not configured. Set AWS_S3_BUCKET_NAME, CI_AWS_S3_BUCKET_NAME or STORAGE_BUCKET');
    console.error('[S3 Upload] Aborting upload - bucket not configured');
    throw err;
  }

  // 先算公開網址：設定不完整時在這裡就失敗，而不是先上傳一個沒有可用網址的孤兒物件。
  const url = publicUrlForKey(key);

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
  const { bucketName } = getAwsConfig();
  if (!bucketName) {
    throw new Error('S3 bucket is not configured (AWS_S3_BUCKET_NAME)');
  }

  // 同 uploadToS3：設定不完整時在簽發之前就失敗。
  const publicUrl = publicUrlForKey(key);

  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: mimeType,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

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
    // 自訂公開網域（可能帶路徑前綴，例如 https://cdn.example.com/files）
    const base = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/+$/, '');
    if (base && url.startsWith(`${base}/`)) {
      return decodeURIComponent(url.slice(base.length + 1)) || null;
    }

    const urlObj = new URL(url);
    let key = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ''));

    // path-style 網址（https://<endpoint>/<bucket>/<key>）要去掉開頭的 bucket；
    // virtual-hosted 網址（https://<bucket>.s3.<region>.amazonaws.com/<key>）的 pathname 就是 key。
    const bucket = getAwsConfig().bucketName;
    if (bucket && !urlObj.hostname.startsWith(`${bucket}.`) && key.startsWith(`${bucket}/`)) {
      key = key.slice(bucket.length + 1);
    }
    return key || null;
  } catch {
    return null;
  }
}
