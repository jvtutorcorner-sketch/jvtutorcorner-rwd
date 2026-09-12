/**
 * Daily Report Status & Manual Trigger API
 * 
 * GET  /api/cron/daily-report/status — Check last report status
 * POST /api/cron/daily-report/status — Manually trigger a report
 */

import { NextResponse } from 'next/server';
import { generateDailyReport, ReportTier } from '@/lib/dailyReportService';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';

const VALID_TIERS: ReportTier[] = ['health', 'daily', 'weekly', 'full'];

// GET: Check latest report status from DynamoDB
export async function GET() {
  try {
    const { ddbDocClient } = await import('@/lib/dynamo');
    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');

    // Try to get today's report
    const today = new Date().toISOString().split('T')[0];
    const reportId = `report-${today}`;

    try {
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      const result = await ddbDocClient.send(new GetCommand({
        TableName: 'jvtutorcorner-daily-reports',
        Key: { id: reportId },
      }));

      if (result.Item) {
        return NextResponse.json({
          ok: true,
          hasReport: true,
          report: result.Item,
        });
      }
    } catch {
      // Table may not exist
    }

    return NextResponse.json({
      ok: true,
      hasReport: false,
      message: `尚未生成今日 (${today}) 的報告`,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: true,
      hasReport: false,
      message: '無法查詢報告狀態',
      error: error.message,
    });
  }
}

// POST: Manual trigger (admin only) — supports tier parameter
// 註解一直寫著 admin only，但先前沒有任何檢查：任何人都能觸發完整報表產生與寄送。
async function handlePost(req: AuthedRequest) {
  let tier: ReportTier = 'full';

  try {
    const body = await req.json().catch(() => ({}));
    if (body.tier && VALID_TIERS.includes(body.tier)) {
      tier = body.tier;
    }
  } catch {}

  console.log(`[Report Status] Manual ${tier} report trigger requested`);

  try {
    const result = await generateDailyReport(tier);

    return NextResponse.json({
      ok: true,
      tier,
      result: {
        reportDate: result.reportDate,
        success: result.success,
        emailSent: result.emailSent,
        error: result.error || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, tier, error: error.message },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handlePost);
