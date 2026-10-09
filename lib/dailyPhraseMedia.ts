// lib/dailyPhraseMedia.ts
//
// 「AI 每日一句」媒體檔的存放位置：有物件儲存（S3 / R2）就放那裡，
// 沒有（本機開發）就放 .uploads/daily，兩者都由 /api/uploads/daily/* 送出。
import fs from 'fs';
import path from 'path';
import { deleteObjectKey, isObjectStorageConfigured, uploadToS3 } from '@/lib/s3';
import { DAILY_MEDIA_PREFIX } from '@/lib/dailyPhraseService';

export const DAILY_LOCAL_DIR = path.resolve(process.cwd(), '.uploads', 'daily');

/** key 對應的本機路徑；key 不在 daily/ 底下或想跳出目錄時回 null。 */
export function dailyLocalPath(key: string): string | null {
  if (!key.startsWith(DAILY_MEDIA_PREFIX)) return null;
  const full = path.resolve(DAILY_LOCAL_DIR, key.slice(DAILY_MEDIA_PREFIX.length));
  return full.startsWith(DAILY_LOCAL_DIR + path.sep) ? full : null;
}

export async function saveDailyMedia(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  if (isObjectStorageConfigured()) {
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
      else if (isObjectStorageConfigured()) await deleteObjectKey(key);
    } catch (err) {
      console.warn('[dailyPhraseMedia] delete failed (ignoring):', key, (err as Error).message);
    }
  }
}
