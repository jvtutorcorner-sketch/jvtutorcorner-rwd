import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '系統尚未設定翻譯服務，請聯絡管理員設定 GEMINI_API_KEY。' }, { status: 503 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Translate the following user-generated text into ${targetLanguage}. Output only the translated text with no quotes, labels, or extra commentary:\n\n${text}`;
    const result = await model.generateContent(prompt);
    const translated = result.response.text().trim();

    if (!translated) {
      return NextResponse.json({ error: 'empty translation result' }, { status: 502 });
    }

    return NextResponse.json({ translated });
  } catch (error: any) {
    console.error('[translate API] error:', error);
    return NextResponse.json({ error: '翻譯失敗，請稍後再試' }, { status: 500 });
  }
}
