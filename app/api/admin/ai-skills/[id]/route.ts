// app/api/admin/ai-skills/[id]/route.ts
// 更新 / 刪除單一技能（僅 admin）。id 不可變。

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { upsertSkill, deleteSkill } from '@/lib/ai/skillsStore';

export const dynamic = 'force-dynamic';

export const PUT = withAdmin(async (req, context: any) => {
    try {
        const { id } = await context.params;
        const body = await req.json();
        if (!body?.label || !body?.prompt) {
            return NextResponse.json({ ok: false, error: 'label 與 prompt 為必填' }, { status: 400 });
        }
        const skill = await upsertSkill({ ...body, id }, req.session.email || req.session.userId);
        return NextResponse.json({ ok: true, skill });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || '更新失敗' }, { status: 500 });
    }
});

export const DELETE = withAdmin(async (req, context: any) => {
    try {
        const { id } = await context.params;
        await deleteSkill(id, req.session.email || req.session.userId);
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || '刪除失敗' }, { status: 500 });
    }
});
