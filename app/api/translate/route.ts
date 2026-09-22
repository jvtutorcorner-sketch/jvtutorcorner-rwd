import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getActiveAIIntegration } from '@/lib/ai/llmClient';
import { runWithIntegration } from '@/lib/ai/gateway/gateway';

const LOCALE_NAMES: Record<string, string> = {
  'zh-TW': 'Traditional Chinese (Taiwan)',
  'zh-CN': 'Simplified Chinese',
  en: 'English',
};

const MAX_LENGTH = 2000;

export const POST = withAuth(postHandler);

async function postHandler(req: AuthedRequest) {
  try {
    const { text, targetLocale } = await req.json();

    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }
    if (text.length > MAX_LENGTH) {
      return NextResponse.json({ error: 'text too long' }, { status: 400 });
    }
    const targetLanguage = LOCALE_NAMES[targetLocale];
    if (!targetLanguage) {
      return NextResponse.json({ error: 'unsupported targetLocale' }, { status: 400 });
    }

    // Prefer a configured GEMINI integration (metered via the gateway); fall back
    // to the env key so translation keeps working before /apps is configured.
    let integration = await getActiveAIIntegration(['GEMINI']);
    if (!integration) {
      const envKey = process.env.GEMINI_API_KEY;
      if (!envKey) {
        return NextResponse.json({ error: '系統尚未設定翻譯服務，請聯絡管理員設定 GEMINI 串接或 GEMINI_API_KEY。' }, { status: 503 });
      }
      integration = { type: 'GEMINI', config: { apiKey: envKey, model: 'gemini-1.5-flash' } };
    }

    const prompt = `Translate the following user-generated text into ${targetLanguage}. Output only the translated text with no quotes, labels, or extra commentary:\n\n${text}`;
    const res = await runWithIntegration(integration, { prompt, maxTokens: 1024 }, {
      feature: 'translate',
      userId: req.session.userId,
      defaultModel: 'gemini-1.5-flash',
    });
    const translated = res.ok ? (res.result.text || '').trim() : '';

    if (!translated) {
      return NextResponse.json({ error: 'empty translation result' }, { status: 502 });
    }

    return NextResponse.json({ translated });
  } catch (error: any) {
    console.error('[translate API] error:', error);
    return NextResponse.json({ error: '翻譯失敗，請稍後再試' }, { status: 500 });
  }
}
