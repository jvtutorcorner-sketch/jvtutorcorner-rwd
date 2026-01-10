import { NextResponse } from 'next/server';
import { generateCaptcha, clearExpired } from '@/lib/captcha';

export async function GET() {
  try {
    clearExpired();
    const { token, image } = generateCaptcha();
    return NextResponse.json({ token, image });
  } catch (err: any) {
    console.error('[captcha] generate error', err?.message || err);
    return NextResponse.json({ message: 'Captcha generation failed' }, { status: 500 });
  }
}
