// lib/dailyPhraseMedia.ts
//
// 「AI 每日一句」媒體檔的存放位置：有物件儲存（S3 / R2）就放那裡，
// 沒有（本機開發）就放 .uploads/daily，兩者都由 /api/uploads/daily/* 送出。
import fs from 'fs';
import path from 'path';
import { deleteObjectKey, uploadToS3 } from '@/lib/s3';
import { DAILY_MEDIA_PREFIX } from '@/lib/dailyPhraseService';

/** 物件儲存的 bucket（與 lib/s3.ts 讀的環境變數一致）。 */
export function dailyStorageBucket(): string | undefined {
  return process.env.CI_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || undefined;
}

/** 有 bucket，且在正式環境（憑證由 Amplify 的 IAM Role 提供）或本機有靜態金鑰時才走物件儲存。 */
export function dailyStorageConfigured(): boolean {
  if (!dailyStorageBucket()) return false;
  return process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID);
}

export const DAILY_LOCAL_DIR = path.resolve(process.cwd(), '.uploads', 'daily');

/** key 對應的本機路徑；key 不在 daily/ 底下或想跳出目錄時回 null。 */
export function dailyLocalPath(key: string): string | null {
  if (!key.startsWith(DAILY_MEDIA_PREFIX)) return null;
  const full = path.resolve(DAILY_LOCAL_DIR, key.slice(DAILY_MEDIA_PREFIX.length));
  return full.startsWith(DAILY_LOCAL_DIR + path.sep) ? full : null;
}

export async function saveDailyMedia(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  if (dailyStorageConfigured()) {
    await uploadToS3(buffer, key, mimeType);
    return;
  }
  const localPath = dailyLocalPath(key);
  if (!localPath) throw new Error('Invalid daily media key');
  fs.mkdirSync(DAILY_LOCAL_DIR, { recursive: true });
  fs.writeFileSync(localPath, buffer);
}

/** 盡力而為：媒體刪不掉不該讓後台操作失敗，留下的只是孤兒檔。 */
export async function deleteDailyMedia(keys: Array<string | undefined>): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      const localPath = dailyLocalPath(key);
      if (!localPath) continue;
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      else if (dailyStorageConfigured()) await deleteObjectKey(key);
    } catch (err) {
      console.warn('[dailyPhraseMedia] delete failed (ignoring):', key, (err as Error).message);
    }
  }
}
