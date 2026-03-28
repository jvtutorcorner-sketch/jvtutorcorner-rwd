/**
 * lib/keyLogger.ts
 *
 * 關鍵事件日誌服務 (Key Event Logger)
 *
 * 設計原則：
 * - CloudWatch 紀錄完整 raw 日誌（除錯用）
 * - 本服務只寫入「業務關鍵事件」至 DynamoDB，供 AI 查詢與管理員快速回顧
 *
 * DynamoDB Table: jvtutorcorner-key-logs
 * PK: date (YYYY-MM-DD)        → 依日期分區，避免熱分區問題
 * SK: timestamp#id              → 時間可排序，id 保證唯一
 * GSI1: level-date-index        → 依嚴重度查詢（ERROR/CRITICAL 警報）
 * GSI2: category-date-index     → 依業務類別查詢（payment/auth/enrollment）
 * GSI3: userId-timestamp-index  → 依使用者查詢行為軌跡
 */

import { ddbDocClient } from './dynamo';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const KEY_LOGS_TABLE = process.env.DYNAMODB_TABLE_KEY_LOGS || 'jvtutorcorner-key-logs';
const DEFAULT_TTL_DAYS = parseInt(process.env.KEY_LOG_TTL_DAYS || '30', 10);

// ─── Types ───────────────────────────────────────────────────────────────────

export type KeyLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export type KeyLogCategory =
    | 'auth'          // 登入、登出、Token 失效
    | 'payment'       // 付款成功/失敗、退款
    | 'enrollment'    // 課程報名、取消
    | 'classroom'     // 進入/離開教室、連線狀態
    | 'teacher'       // 教師審核、狀態變更
    | 'admin'         // 管理員操作
    | 'api_error'     // API 5xx 錯誤
    | 'webhook'       // LINE/PayPal/Stripe Webhook
    | 'recommendation' // 推薦系統事件
    | 'system';       // 系統啟動、健康檢查

export interface KeyLogEntry {
    /** 日期分區鍵 (YYYY-MM-DD) */
    date: string;
    /** 排序鍵：ISO timestamp + UUID */
    sk: string;
    /** 唯一 ID */
    id: string;
    /** ISO 8601 timestamp */
    timestamp: string;
    /** 毫秒 timestamp，方便數字範圍查詢 */
    timestampMs: number;
    level: KeyLogLevel;
    category: KeyLogCategory;
    /** 動作描述，例如 'payment_failed', 'user_login', 'enrollment_created' */
    action: string;
    /** 一句話摘要，供 AI 直接閱讀 */
    summary: string;
    /** 相關使用者（email 或 userId）*/
    userId?: string;
    /** 相關實體 ID（orderId、courseId、enrollmentId 等）*/
    entityId?: string;
    /** 實體類型 */
    entityType?: string;
    /** 觸發來源 API path */
    source?: string;
    /** 額外結構化資料（最多保留關鍵欄位，避免過大）*/
    metadata?: Record<string, string | number | boolean | null>;
    /** HTTP 狀態碼（API 錯誤時）*/
    httpStatus?: number;
    /** DynamoDB TTL（Unix 秒）*/
    ttl: number;
}

export type KeyLogInput = Omit<KeyLogEntry, 'date' | 'sk' | 'id' | 'timestamp' | 'timestampMs' | 'ttl'>;

// ─── 寫入日誌 ─────────────────────────────────────────────────────────────────

/**
 * 寫入一筆關鍵事件日誌到 DynamoDB
 *
 * @example
 * await writeKeyLog({
 *   level: 'ERROR',
 *   category: 'payment',
 *   action: 'payment_failed',
 *   summary: 'PayPal 付款失敗：餘額不足',
 *   userId: 'user@example.com',
 *   entityId: 'order_abc123',
 *   entityType: 'order',
 *   source: 'api/paypal/webhook',
 *   metadata: { errorCode: 'INSUFFICIENT_FUNDS', amount: 500 }
 * });
 */
export async function writeKeyLog(input: KeyLogInput): Promise<void> {
    const now = new Date();
    const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const id = uuidv4();
    const timestamp = now.toISOString();
    const timestampMs = now.getTime();
    const sk = `${timestamp}#${id}`;
    const ttl = Math.floor(timestampMs / 1000) + DEFAULT_TTL_DAYS * 86400;

    const entry: KeyLogEntry = {
        date,
        sk,
        id,
        timestamp,
        timestampMs,
        ttl,
        ...input,
        // 確保 metadata 不超過安全大小（只保留前 20 個 key）
        metadata: input.metadata
            ? Object.fromEntries(Object.entries(input.metadata).slice(0, 20))
            : undefined,
    };

    try {
        await ddbDocClient.send(new PutCommand({
            TableName: KEY_LOGS_TABLE,
            Item: entry,
        }));
    } catch (err) {
        // keyLogger 本身的錯誤不應中斷主流程，只在 CloudWatch 留跡
        console.error('[keyLogger] Failed to write key log:', err, { input });
    }
}

// ─── 便捷方法 ─────────────────────────────────────────────────────────────────

export const keyLog = {
    info: (input: Omit<KeyLogInput, 'level'>) =>
        writeKeyLog({ ...input, level: 'INFO' }),

    warn: (input: Omit<KeyLogInput, 'level'>) =>
        writeKeyLog({ ...input, level: 'WARN' }),

    error: (input: Omit<KeyLogInput, 'level'>) =>
        writeKeyLog({ ...input, level: 'ERROR' }),

    critical: (input: Omit<KeyLogInput, 'level'>) =>
        writeKeyLog({ ...input, level: 'CRITICAL' }),
};

// ─── 查詢日誌（供 Admin API 與 AI Tool 使用）──────────────────────────────────

export interface QueryKeyLogsOptions {
    /** 查詢日期，格式 YYYY-MM-DD，預設今日 */
    date?: string;
    /** 查詢過去 N 小時（會自動推算涉及的日期） */
    hoursBack?: number;
    level?: KeyLogLevel;
    category?: KeyLogCategory;
    userId?: string;
    action?: string;
    limit?: number;
}

export interface KeyLogQueryResult {
    logs: KeyLogEntry[];
    dates: string[];
    totalFound: number;
    options: QueryKeyLogsOptions;
}

/**
 * 查詢 DynamoDB 關鍵日誌
 * 支援跨天查詢（hoursBack 超過 24h 時自動查多個日期）
 */
export async function queryKeyLogs(options: QueryKeyLogsOptions = {}): Promise<KeyLogQueryResult> {
    const { hoursBack = 24, limit = 50 } = options;

    // 計算需要查詢的日期列表
    const now = new Date();
    const dates: string[] = [];
    const daysBack = Math.ceil(hoursBack / 24);
    for (let i = 0; i < daysBack; i++) {
        const d = new Date(now.getTime() - i * 86400000);
        dates.push(d.toISOString().slice(0, 10));
    }
    const targetDates = options.date ? [options.date] : dates;

    // 計算 timestamp 篩選範圍
    const startMs = now.getTime() - hoursBack * 3600000;
    const startTs = new Date(startMs).toISOString();

    const allLogs: KeyLogEntry[] = [];

    for (const date of targetDates) {
        // 建立 FilterExpression
        const filterParts: string[] = ['sk >= :startSk'];
        const exprValues: Record<string, any> = {
            ':date': date,
            ':startSk': startTs,
        };
        const exprNames: Record<string, string> = {};

        if (options.level) {
            filterParts.push('#lvl = :level');
            exprNames['#lvl'] = 'level';
            exprValues[':level'] = options.level;
        }
        if (options.category) {
            filterParts.push('category = :category');
            exprValues[':category'] = options.category;
        }
        if (options.userId) {
            filterParts.push('userId = :userId');
            exprValues[':userId'] = options.userId;
        }
        if (options.action) {
            filterParts.push('#act = :action');
            exprNames['#act'] = 'action';
            exprValues[':action'] = options.action;
        }

        try {
            const { Items } = await ddbDocClient.send(new QueryCommand({
                TableName: KEY_LOGS_TABLE,
                KeyConditionExpression: '#dt = :date',
                FilterExpression: filterParts.join(' AND '),
                ExpressionAttributeNames: { '#dt': 'date', ...exprNames },
                ExpressionAttributeValues: exprValues,
                ScanIndexForward: false, // 最新在前
                Limit: limit,
            }));
            allLogs.push(...((Items || []) as KeyLogEntry[]));
        } catch (err) {
            console.error(`[keyLogger] queryKeyLogs failed for date ${date}:`, err);
        }
    }

    // 多日期合併後重新排序（newest first），截斷到 limit
    allLogs.sort((a, b) => b.timestampMs - a.timestampMs);
    const trimmed = allLogs.slice(0, limit);

    return {
        logs: trimmed,
        dates: targetDates,
        totalFound: trimmed.length,
        options,
    };
}
