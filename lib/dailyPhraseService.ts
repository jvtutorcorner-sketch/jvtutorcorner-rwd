// lib/dailyPhraseService.ts
//
// 「AI 每日一句」短片：首頁 #daily-phrases 區塊與 /daily 專頁的資料來源，
// 由 /admin/daily-phrases 上傳與管理。影片與封面存在物件儲存的 daily/ 底下，
// 資料表只存 key —— 對外網址一律經 /api/uploads/daily/*（見 dailyMediaUrl）。
import { ddbDocClient } from '@/lib/dynamo';
import { DeleteCommand, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const DAILY_PHRASES_TABLE = process.env.DYNAMODB_TABLE_DAILY_PHRASES || 'jvtutorcorner-daily-phrases';

export const DAILY_MEDIA_PREFIX = 'daily/';

/** 允許上傳的媒體類型 → 副檔名。副檔名由這裡決定，不採信使用者的檔名。 */
export const DAILY_MEDIA_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const DAILY_VIDEO_MAX_BYTES = 30 * 1024 * 1024;
export const DAILY_POSTER_MAX_BYTES = 5 * 1024 * 1024;

const VIDEO_KEY_RE = /^daily\/[A-Za-z0-9_-]+\.mp4$/;
const POSTER_KEY_RE = /^daily\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

export interface DailyPhraseRecord {
  id: string;
  day: number;
  phrase: string;
  translation: string;
  note: string;
  videoKey: string;
  posterKey?: string;
  durationSec?: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 送到瀏覽器的形狀：key 已轉成可播放的網址。 */
export interface DailyPhrasePublic {
  id: string;
  day: number;
  phrase: string;
  translation: string;
  note: string;
  videoUrl: string;
  posterUrl: string | null;
  durationSec: number | null;
}

export type DailyPhraseInput = Partial<
  Pick<DailyPhraseRecord, 'day' | 'phrase' | 'translation' | 'note' | 'videoKey' | 'posterKey' | 'durationSec' | 'published'>
>;

export function newDailyMediaKey(mimeType: string): string | null {
  const ext = DAILY_MEDIA_TYPES[mimeType];
  if (!ext) return null;
  return `${DAILY_MEDIA_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${ext}`;
}

export function dailyMediaUrl(key: string): string {
  return `/api/uploads/daily/${key.slice(DAILY_MEDIA_PREFIX.length)}`;
}

export function toPublicDailyPhrase(rec: DailyPhraseRecord): DailyPhrasePublic {
  return {
    id: rec.id,
    day: rec.day,
    phrase: rec.phrase,
    translation: rec.translation,
    note: rec.note,
    videoUrl: dailyMediaUrl(rec.videoKey),
    posterUrl: rec.posterKey ? dailyMediaUrl(rec.posterKey) : null,
    durationSec: typeof rec.durationSec === 'number' ? rec.durationSec : null,
  };
}

/** 新的在前：Day 大的優先，同一天依建立時間。 */
function byNewest(a: DailyPhraseRecord, b: DailyPhraseRecord): number {
  if (b.day !== a.day) return b.day - a.day;
  return String(b.createdAt).localeCompare(String(a.createdAt));
}

/** 後台用：全部資料，讀取失敗會 throw。 */
export async function listAllDailyPhrases(): Promise<DailyPhraseRecord[]> {
  const items: DailyPhraseRecord[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddbDocClient.send(new ScanCommand({ TableName: DAILY_PHRASES_TABLE, ExclusiveStartKey }));
    items.push(...((res.Items || []) as DailyPhraseRecord[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.sort(byNewest);
}

/**
 * 公開頁用：只回已發布且有合法影片 key 的資料。
 * 讀取失敗（例如資料表尚未建立）回空陣列 —— 首頁是 ISR，這裡 throw 會讓整個首頁 build 失敗。
 */
export async function listPublishedDailyPhrases(): Promise<DailyPhrasePublic[]> {
  try {
    const all = await listAllDailyPhrases();
    return all
      .filter((r) => r.published === true && typeof r.videoKey === 'string' && VIDEO_KEY_RE.test(r.videoKey))
      .map(toPublicDailyPhrase);
  } catch (err) {
    console.warn('[dailyPhraseService] listPublishedDailyPhrases failed, returning []:', (err as Error).message);
    return [];
  }
}

export async function getDailyPhrase(id: string): Promise<DailyPhraseRecord | null> {
  const res = await ddbDocClient.send(new GetCommand({ TableName: DAILY_PHRASES_TABLE, Key: { id } }));
  return (res.Item as DailyPhraseRecord) || null;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/**
 * 驗證並套用輸入到既有資料（新增時 base 為 null）。回傳錯誤訊息字串代表驗證失敗。
 */
function applyInput(base: DailyPhraseRecord | null, input: DailyPhraseInput): DailyPhraseRecord | string {
  const now = new Date().toISOString();
  const next: DailyPhraseRecord = base
    ? { ...base, updatedAt: now }
    : {
        id: `daily-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        day: 0,
        phrase: '',
        translation: '',
        note: '',
        videoKey: '',
        published: false,
        createdAt: now,
        updatedAt: now,
      };

  if (input.day !== undefined) next.day = Number(input.day);
  if (input.phrase !== undefined) next.phrase = cleanText(input.phrase, 200);
  if (input.translation !== undefined) next.translation = cleanText(input.translation, 200);
  if (input.note !== undefined) next.note = cleanText(input.note, 300);
  if (input.videoKey !== undefined) next.videoKey = String(input.videoKey);
  if (input.posterKey !== undefined) next.posterKey = input.posterKey ? String(input.posterKey) : undefined;
  if (input.durationSec !== undefined) {
    const d = Number(input.durationSec);
    next.durationSec = Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : undefined;
  }
  if (input.published !== undefined) next.published = input.published === true;

  if (!Number.isInteger(next.day) || next.day < 1 || next.day > 9999) return 'day 必須是 1–9999 的整數';
  if (!next.phrase) return '請填寫句型';
  if (!VIDEO_KEY_RE.test(next.videoKey)) return '影片 key 不合法';
  if (next.posterKey && !POSTER_KEY_RE.test(next.posterKey)) return '封面 key 不合法';
  return next;
}

export async function createDailyPhrase(input: DailyPhraseInput): Promise<DailyPhraseRecord | string> {
  const rec = applyInput(null, input);
  if (typeof rec === 'string') return rec;
  await ddbDocClient.send(new PutCommand({ TableName: DAILY_PHRASES_TABLE, Item: rec }));
  return rec;
}

/** 回傳 null 代表找不到；字串代表驗證失敗。`replaced` 是被換掉、可以刪除的舊媒體 key。 */
export async function updateDailyPhrase(
  id: string,
  input: DailyPhraseInput
): Promise<{ record: DailyPhraseRecord; replaced: string[] } | string | null> {
  const current = await getDailyPhrase(id);
  if (!current) return null;
  const rec = applyInput(current, input);
  if (typeof rec === 'string') return rec;
  await ddbDocClient.send(new PutCommand({ TableName: DAILY_PHRASES_TABLE, Item: rec }));
  const replaced = [
    current.videoKey !== rec.videoKey ? current.videoKey : undefined,
    current.posterKey && current.posterKey !== rec.posterKey ? current.posterKey : undefined,
  ].filter((k): k is string => !!k);
  return { record: rec, replaced };
}

/** 回傳被刪除的資料（讓呼叫端清掉對應的媒體檔），找不到回 null。 */
export async function deleteDailyPhrase(id: string): Promise<DailyPhraseRecord | null> {
  const current = await getDailyPhrase(id);
  if (!current) return null;
  await ddbDocClient.send(new DeleteCommand({ TableName: DAILY_PHRASES_TABLE, Key: { id } }));
  return current;
}
