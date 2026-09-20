// app/api/admin/ai-skills/route.ts
// AI 技能管理（僅 admin）。GET 列出全部（含停用），POST 新增/更新。

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { listSkills, upsertSkill } from '@/lib/ai/skillsStore';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async () => {
    const skills = await listSkills({ includeDisabled: true });
    return NextResponse.json({ ok: true, skills });
});

export const POST = withAdmin(async (req) => {
    try {
        const body = await req.json();
        if (!body?.label || !body?.prompt) {
            return NextResponse.json({ ok: false, error: 'label 與 prompt 為必填' }, { status: 400 });
        }
        const skill = await upsertSkill(body, req.session.email || req.session.userId);
        return NextResponse.json({ ok: true, skill }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || '建立失敗' }, { status: 500 });
    }
});
