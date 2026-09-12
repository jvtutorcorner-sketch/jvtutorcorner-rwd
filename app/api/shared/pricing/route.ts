import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { getPricingSettings } from '@/lib/pricingService';

/**
 * 公開的定價讀取端點，給未登入訪客的 /pricing 頁使用。
 *
 * 這裡刻意只有 GET：寫入一律走 `POST /api/admin/pricing`（withAdmin）。
 * 先前這支檔案有一份未受保護的 POST 複本，任何人都能覆寫全站方案與點數包定價。
 */
export async function GET() {
  try {
    const settings = await getPricingSettings();

    if (!settings) {
      // Return empty structure if no data exists in DynamoDB
      return NextResponse.json({
        ok: true,
        settings: {
          pageTitle: '方案與價格',
          pageDescription: '選擇最適合您的會員方案',
          mode: 'subscription',
          plans: [],
          pointPackages: [],
          discountPlans: [],
          extensions: [],
          appPlans: [],
        }
      });
    }

    return NextResponse.json({ ok: true, settings });
  } catch (err: any) {
    console.error('[Pricing API] Failed to read pricing settings:', err);
    return NextResponse.json({
      ok: false,
      error: err?.message || 'Failed to read settings'
    }, { status: 500 });
  }
}
