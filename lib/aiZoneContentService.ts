// lib/aiZoneContentService.ts
//
// AI 專區的內容（短片、課程單元…）：首頁 #ai-zone 區塊與 /ai-zone 專頁的資料來源，
// 由 /ai-zone/manage 上傳與管理。影片與封面存在物件儲存的 ai-zone/ 底下，
// 資料表只存 key —— 對外網址一律經 /api/uploads/ai-zone/*（見 aiZoneMediaUrl）。
import { ddbDocClient } from '@/lib/dynamo';
import { DeleteCommand, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const AI_ZONE_TABLE = process.env.DYNAMODB_TABLE_AI_ZONE_CONTENT || 'jvtutorcorner-ai-zone-content';

/**
 * 物件在 bucket 裡的資料夾。Amplify 執行角色的 IAM 政策是對這個前綴授權
 * （jvtutorcorner-uploads/ai-zone/*），改名要同步改 IAM 並搬檔案。
 */
export const AI_ZONE_MEDIA_PREFIX = 'ai-zone/';

/** 允許上傳的媒體類型 → 副檔名。副檔名由這裡決定，不採信使用者的檔名。 */
export const AI_ZONE_MEDIA_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const AI_ZONE_VIDEO_MAX_BYTES = 30 * 1024 * 1024;
export const AI_ZONE_POSTER_MAX_BYTES = 5 * 1024 * 1024;

const VIDEO_KEY_RE = /^ai-zone\/[A-Za-z0-9_-]+\.mp4$/;
const POSTER_KEY_RE = /^ai-zone\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

export interface AiZoneItem {
  id: string;
  /** 排序用的數字，大的排前面（例如單元編號、第幾天）。 */
  order: number;
  /** 卡片上的小標籤，例如「單元 2」「每日一句」。 */
  label: string;
  title: string;
  subtitle: string;
  note: string;
  videoKey: string;
  posterKey?: string;
  durationSec?: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 送到瀏覽器的形狀：key 已轉成可播放的網址。 */
export interface AiZoneItemPublic {
  id: string;
  order: number;
  label: string;
  title: string;
  subtitle: string;
  note: string;
  videoUrl: string;
  posterUrl: string | null;
  durationSec: number | null;
}

export type AiZoneItemInput = Partial<
  Pick<AiZoneItem, 'order' | 'label' | 'title' | 'subtitle' | 'note' | 'videoKey' | 'posterKey' | 'durationSec' | 'published'>
>;

export function newAiZoneMediaKey(mimeType: string): string | null {
  const ext = AI_ZONE_MEDIA_TYPES[mimeType];
  if (!ext) return null;
  return `${AI_ZONE_MEDIA_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${ext}`;
}

export function aiZoneMediaUrl(key: string): string {
  return `/api/uploads/ai-zone/${key.slice(AI_ZONE_MEDIA_PREFIX.length)}`;
}

export function toPublicAiZoneItem(rec: AiZoneItem): AiZoneItemPublic {
  return {
    id: rec.id,
    order: rec.order,
    label: rec.label,
    title: rec.title,
    subtitle: rec.subtitle,
    note: rec.note,
    videoUrl: aiZoneMediaUrl(rec.videoKey),
    posterUrl: rec.posterKey ? aiZoneMediaUrl(rec.posterKey) : null,
    durationSec: typeof rec.durationSec === 'number' ? rec.durationSec : null,
  };
}

/** 新的在前：order 大的優先，同一個 order 依建立時間。 */
function byNewest(a: AiZoneItem, b: AiZoneItem): number {
  if (b.order !== a.order) return b.order - a.order;
  return String(b.createdAt).localeCompare(String(a.createdAt));
}

/** 後台用：全部資料，讀取失敗會 throw。 */
export async function listAllAiZoneItems(): Promise<AiZoneItem[]> {
  const items: AiZoneItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddbDocClient.send(new ScanCommand({ TableName: AI_ZONE_TABLE, ExclusiveStartKey }));
    items.push(...((res.Items || []) as AiZoneItem[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.sort(byNewest);
}

/**
 * 公開頁用：只回已發布且有合法影片 key 的資料。
 * 讀取失敗（例如資料表尚未建立）回空陣列 —— 首頁是 ISR，這裡 throw 會讓整個首頁 build 失敗。
 */
export async function listPublishedAiZoneItems(): Promise<AiZoneItemPublic[]> {
  try {
    const all = await listAllAiZoneItems();
    return all
      .filter((r) => r.published === true && typeof r.videoKey === 'string' && VIDEO_KEY_RE.test(r.videoKey))
      .map(toPublicAiZoneItem);
  } catch (err) {
    console.warn('[aiZoneContentService] listPublishedAiZoneItems failed, returning []:', (err as Error).message);
    return [];
  }
}

export async function getAiZoneItem(id: string): Promise<AiZoneItem | null> {
  const res = await ddbDocClient.send(new GetCommand({ TableName: AI_ZONE_TABLE, Key: { id } }));
  return (res.Item as AiZoneItem) || null;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/**
 * 驗證並套用輸入到既有資料（新增時 base 為 null）。回傳錯誤訊息字串代表驗證失敗。
 */
function applyInput(base: AiZoneItem | null, input: AiZoneItemInput): AiZoneItem | string {
  const now = new Date().toISOString();
  const next: AiZoneItem = base
    ? { ...base, updatedAt: now }
    : {
        id: `aiz-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        order: 0,
        label: '',
        title: '',
        subtitle: '',
        note: '',
        videoKey: '',
        published: false,
        createdAt: now,
        updatedAt: now,
      };

  if (input.order !== undefined) next.order = Number(input.order);
  if (input.label !== undefined) next.label = cleanText(input.label, 24);
  if (input.title !== undefined) next.title = cleanText(input.title, 120);
  if (input.subtitle !== undefined) next.subtitle = cleanText(input.subtitle, 200);
  if (input.note !== undefined) next.note = cleanText(input.note, 300);
  if (input.videoKey !== undefined) next.videoKey = String(input.videoKey);
  if (input.posterKey !== undefined) next.posterKey = input.posterKey ? String(input.posterKey) : undefined;
  if (input.durationSec !== undefined) {
    const d = Number(input.durationSec);
    next.durationSec = Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : undefined;
  }
  if (input.published !== undefined) next.published = input.published === true;

  if (!Number.isInteger(next.order) || next.order < 1 || next.order > 9999) return '排序必須是 1–9999 的整數';
  if (!next.title) return '請填寫標題';
  if (!VIDEO_KEY_RE.test(next.videoKey)) return '影片 key 不合法';
  if (next.posterKey && !POSTER_KEY_RE.test(next.posterKey)) return '封面 key 不合法';
  return next;
}

export async function createAiZoneItem(input: AiZoneItemInput): Promise<AiZoneItem | string> {
  const rec = applyInput(null, input);
  if (typeof rec === 'string') return rec;
  await ddbDocClient.send(new PutCommand({ TableName: AI_ZONE_TABLE, Item: rec }));
  return rec;
}

/** 回傳 null 代表找不到；字串代表驗證失敗。`replaced` 是被換掉、可以刪除的舊媒體 key。 */
export async function updateAiZoneItem(
  id: string,
  input: AiZoneItemInput
): Promise<{ record: AiZoneItem; replaced: string[] } | string | null> {
  const current = await getAiZoneItem(id);
  if (!current) return null;
  const rec = applyInput(current, input);
  if (typeof rec === 'string') return rec;
  await ddbDocClient.send(new PutCommand({ TableName: AI_ZONE_TABLE, Item: rec }));
  const replaced = [
    current.videoKey !== rec.videoKey ? current.videoKey : undefined,
    current.posterKey && current.posterKey !== rec.posterKey ? current.posterKey : undefined,
  ].filter((k): k is string => !!k);
  return { record: rec, replaced };
}

/** 回傳被刪除的資料（讓呼叫端清掉對應的媒體檔），找不到回 null。 */
export async function deleteAiZoneItem(id: string): Promise<AiZoneItem | null> {
  const current = await getAiZoneItem(id);
  if (!current) return null;
  await ddbDocClient.send(new DeleteCommand({ TableName: AI_ZONE_TABLE, Key: { id } }));
  return current;
}
