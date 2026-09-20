// app/api/admin/ai-skills/[id]/reset/route.ts
// 還原 seed 技能為程式預設（刪除 DB 覆寫）。僅 admin。

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { resetSkill, getSkill } from '@/lib/ai/skillsStore';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (_req, context: any) => {
    const { id } = await context.params;
    await resetSkill(id);
    return NextResponse.json({ ok: true, skill: await getSkill(id) });
});
