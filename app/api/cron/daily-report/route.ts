/**
 * Report Cron API Route (Three-Tier Architecture)
 * 
 * Endpoint: POST /api/cron/daily-report
 * 
 * Query params:
 *   ?tier=health  — AWS health check only (every 6 hours)
 *   ?tier=daily   — Health + news (daily 00:00)
 *   ?tier=weekly  — Health + news + risks + trends (weekly Mon 00:00)
 *   ?tier=full    — All sections (manual trigger, default)
 * 
 * Triggered by:
 *   - AWS EventBridge + Lambda (3 scheduled rules)
 *   - Manual trigger from AI Widget
 * 
 * Security: Protected by CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateDailyReport, logReportToDynamo, ReportTier } from '@/lib/dailyReportService';

const VALID_TIERS: ReportTier[] = ['health', 'daily', 'weekly', 'full'];

// Verify the request is authorized
function isAuthorized(req: NextRequest): boolean {
  // 1. Check Authorization header (Lambda / manual trigger)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // 2. Check custom header (for external cron services)
  const cronToken = req.headers.get('x-cron-token');
  if (cronSecret && cronToken === cronSecret) {
    return true;
  }

  // 3. Allow if no CRON_SECRET is set (dev mode / local testing)
  if (!cronSecret) {
    console.warn('[Cron] CRON_SECRET not set — allowing unauthenticated access (dev mode)');
    return true;
  }

  return false;
}

// POST handler — for Lambda trigger and manual triggers
export async function POST(req: NextRequest) {
  return handleCronRequest(req);
}

async function handleCronRequest(req: NextRequest) {
  const startTime = Date.now();

  // Parse tier from query string or body
  const url = new URL(req.url);
  let tier: ReportTier = (url.searchParams.get('tier') as ReportTier) || 'full';

  // Also try to read from body for POST requests
  try {
    const body = await req.json().catch(() => ({}));
    if (body.tier && VALID_TIERS.includes(body.tier)) {
      tier = body.tier;
    }
  } catch {}

  if (!VALID_TIERS.includes(tier)) {
    tier = 'full';
  }

  console.log(`[Cron] ${tier} report triggered at ${new Date().toISOString()}`);

  // Authorization check
  if (!isAuthorized(req)) {
    console.error('[Cron] Unauthorized request');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Generate the report for the specified tier
    const result = await generateDailyReport(tier);

    // Log to DynamoDB (non-blocking)
    logReportToDynamo(result).catch(err => {
      console.warn('[Cron] DynamoDB logging failed:', err.message);
    });

    const duration = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      tier,
      reportDate: result.reportDate,
      success: result.success,
      emailSent: result.emailSent,
      duration: `${duration}ms`,
      error: result.error || null,
      sections: {
        health: result.sections.health ? '✓' : '✗',
        news: result.sections.news ? '✓' : '✗',
        risks: result.sections.risks ? '✓' : '✗',
        trends: result.sections.trends ? '✓' : '✗',
      },
    });
  } catch (error: any) {
    console.error('[Cron] Report failed:', error);

    return NextResponse.json(
      {
        ok: false,
        tier,
        error: error.message,
        duration: `${Date.now() - startTime}ms`,
      },
      { status: 500 }
    );
  }
}
