import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getHomepageSettings, saveHomepageSettings } from '@/lib/homepageSettingsService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getHomepageSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const showRecommendations = !!body.showRecommendations;

    const saved = await saveHomepageSettings({ showRecommendations });
    if (!saved) {
      return NextResponse.json(
        { ok: false, error: 'Failed to save homepage settings. Check server logs / DYNAMODB_TABLE_HOMEPAGE_SETTINGS.' },
        { status: 500 }
      );
    }

    // 首頁是 ISR（revalidate 300），不主動失效的話後台改動最多要 5 分鐘才看得到。
    revalidatePath('/');

    return NextResponse.json({ ok: true, settings: { showRecommendations } });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'write error' }, { status: 500 });
  }
}
