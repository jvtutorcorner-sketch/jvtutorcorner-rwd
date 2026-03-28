import { NextRequest, NextResponse } from 'next/server';
import { queryKeyLogs, KeyLogCategory, KeyLogLevel } from '@/lib/keyLogger';

/**
 * GET /api/admin/key-logs
 *
 * 查詢 DynamoDB 關鍵業務日誌（精簡版，供管理員與 AI 工具使用）
 *
 * Query Parameters:
 *   hoursBack   – 查詢過去 N 小時 (預設 24，最大 168 / 7天)
 *   date        – 指定單一日期 YYYY-MM-DD（與 hoursBack 互斥）
 *   level       – INFO | WARN | ERROR | CRITICAL
 *   category    – auth | payment | enrollment | classroom | teacher | admin | api_error | webhook | recommendation | system
 *   userId      – 過濾特定使用者
 *   action      – 過濾特定動作字串（完全符合）
 *   limit       – 最多回傳筆數 (預設 50，最大 200)
 *
 * Response:
 *   { ok, totalFound, dates, logs: KeyLogEntry[] }
 */
export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;

    const hoursBack = Math.min(parseInt(sp.get('hoursBack') || '24', 10), 168);
    const date = sp.get('date') || undefined;
    const level = (sp.get('level') || undefined) as KeyLogLevel | undefined;
    const category = (sp.get('category') || undefined) as KeyLogCategory | undefined;
    const userId = sp.get('userId') || undefined;
    const action = sp.get('action') || undefined;
    const limit = Math.min(parseInt(sp.get('limit') || '50', 10), 200);

    try {
        const result = await queryKeyLogs({ hoursBack, date, level, category, userId, action, limit });

        // 為 AI 工具提供 summary 格式
        const summary = buildSummary(result.logs);

        return NextResponse.json({
            ok: true,
            totalFound: result.totalFound,
            dates: result.dates,
            summary,
            logs: result.logs,
        });
    } catch (err: any) {
        console.error('[GET /api/admin/key-logs] Error:', err);
        return NextResponse.json(
            { ok: false, error: 'Failed to query key logs', message: err?.message },
            { status: 500 }
        );
    }
}

// ─── Summary Builder（供 AI 快速理解） ────────────────────────────────────────

interface LogSummary {
    totalByLevel: Record<string, number>;
    totalByCategory: Record<string, number>;
    criticalEvents: Array<{ timestamp: string; summary: string; category: string; action: string }>;
    errorEvents: Array<{ timestamp: string; summary: string; category: string; action: string; userId?: string }>;
}

function buildSummary(logs: any[]): LogSummary {
    const byLevel: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const criticals: LogSummary['criticalEvents'] = [];
    const errors: LogSummary['errorEvents'] = [];

    for (const log of logs) {
        byLevel[log.level] = (byLevel[log.level] || 0) + 1;
        byCategory[log.category] = (byCategory[log.category] || 0) + 1;

        if (log.level === 'CRITICAL') {
            criticals.push({ timestamp: log.timestamp, summary: log.summary, category: log.category, action: log.action });
        }
        if (log.level === 'ERROR') {
            errors.push({ timestamp: log.timestamp, summary: log.summary, category: log.category, action: log.action, userId: log.userId });
        }
    }

    return {
        totalByLevel: byLevel,
        totalByCategory: byCategory,
        criticalEvents: criticals.slice(0, 10),
        errorEvents: errors.slice(0, 20),
    };
}
