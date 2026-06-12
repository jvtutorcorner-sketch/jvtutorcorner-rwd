import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { findProfileByEmail } from '@/lib/profilesService';

function createTemporaryPassword() {
  return `tmp_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, plan, password } = body;
    if (!email) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 });
    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
    if (!PROFILES_TABLE) return NextResponse.json({ ok: false, error: 'DYNAMODB_TABLE_PROFILES 未設定' }, { status: 500 });

    try {
      const existing = await findProfileByEmail(email);
      if (existing) return NextResponse.json({ ok: false, error: 'email exists' }, { status: 400 });
    } catch (e) {
      console.warn('[admin.create-user] Email check failed', (e as any)?.message || e);
    }

    const id = `u_${Date.now()}`;
    const providedPassword = typeof password === 'string' ? password.trim() : '';
    const defaultPassword = process.env.DEFAULT_NEW_USER_PASSWORD || '';
    const generatedPassword = createTemporaryPassword();
    const finalPassword = providedPassword || defaultPassword || generatedPassword;
    const useTemporaryPassword = !providedPassword && !defaultPassword;

    const record = { id, email, password: finalPassword, plan: plan || 'basic', nickname: email.split('@')[0], role: 'student' };
    const responseProfile: any = { id: record.id, email: record.email, plan: record.plan };
    if (useTemporaryPassword) {
      responseProfile.temporaryPassword = finalPassword;
    }

    try {
      await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: record }));
      return NextResponse.json({ ok: true, profile: responseProfile });
    } catch (e: any) {
      console.error('[admin.create-user] Dynamo write failed', e?.message || e);
      return NextResponse.json({ ok: false, error: 'Dynamo write failed' }, { status: 500 });
    }
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message || 'error' }, { status: 500 });
  }
}
