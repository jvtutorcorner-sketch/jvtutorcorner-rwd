import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { findProfileByEmail } from '@/lib/profilesService';
import { hashPassword } from '@/lib/auth/password';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { assertPlanId } from '@/lib/plans';

function createTemporaryPassword() {
  return `tmp_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

// 先前完全沒有 auth：任何人都能建立帳號並指定方案。
async function handleCreateUser(req: AuthedRequest) {
  try {
    const body = await req.json();
    const { plan, password } = body;
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 });

    // profile.plan is a controlled vocabulary (lib/plans.ts); an unknown value is rejected here
    // rather than written and silently failing a later entitlement check.
    let normalizedPlan: string;
    try {
      normalizedPlan = await assertPlanId(plan);
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'invalid plan' }, { status: 400 });
    }
    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
    if (!PROFILES_TABLE) return NextResponse.json({ ok: false, error: 'DYNAMODB_TABLE_PROFILES 未設定' }, { status: 500 });

    try {
      const existing = await findProfileByEmail(email);
      if (existing) return NextResponse.json({ ok: false, error: 'email exists' }, { status: 400 });
    } catch (e) {
      console.warn('[admin.create-user] Email check failed', (e as any)?.message || e);
    }

    const id = crypto.randomUUID();
    const providedPassword = typeof password === 'string' ? password.trim() : '';
    const defaultPassword = process.env.DEFAULT_NEW_USER_PASSWORD || '';
    const generatedPassword = createTemporaryPassword();
    const finalPassword = providedPassword || defaultPassword || generatedPassword;
    const useTemporaryPassword = !providedPassword && !defaultPassword;

    const record = {
      id,
      roid_id: id,
      email,
      password: hashPassword(finalPassword),
      plan: normalizedPlan,
      nickname: email.split('@')[0],
      role: 'student',
      isB2B: false,
      createdAt: new Date().toISOString(),
    };
    const responseProfile: any = { id: record.id, email: record.email, plan: record.plan };
    if (useTemporaryPassword) {
      responseProfile.temporaryPassword = finalPassword;
    }

    try {
      await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: record, ConditionExpression: 'attribute_not_exists(id)' }));
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

export const POST = withAdmin(handleCreateUser);
