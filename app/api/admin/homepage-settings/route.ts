import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getHomepageSettings, saveHomepageSettings, type HomepageSettings } from '@/lib/homepageSettingsService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getHomepageSettings();
  return NextResponse.json({ ok: true, settings });
}

// 先前完全沒有 auth：任何人都能開關首頁區塊。
export const POST = withAdmin(async (req: AuthedRequest) => {
  try {
    const body = await req.json();

    // 只更新有送來的開關，其餘沿用現值 —— 設定頁每個開關各自存檔，
    // 整筆覆寫會把另一個開關洗回預設。
    const settings: HomepageSettings = { ...(await getHomepageSettings()) };
    if (typeof body.showRecommendations === 'boolean') settings.showRecommendations = body.showRecommendations;
    if (typeof body.showDailyPhrases === 'boolean') settings.showDailyPhrases = body.showDailyPhrases;

    const saved = await saveHomepageSettings(settings);
    if (!saved) {
      return NextResponse.json(
        { ok: false, error: 'Failed to save homepage settings. Check server logs / DYNAMODB_TABLE_HOMEPAGE_SETTINGS.' },
        { status: 500 }
      );
    }

    // 首頁是 ISR（revalidate 300），不主動失效的話後台改動最多要 5 分鐘才看得到。
    revalidatePath('/');

    return NextResponse.json({ ok: true, settings });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'write error' }, { status: 500 });
  }
});
