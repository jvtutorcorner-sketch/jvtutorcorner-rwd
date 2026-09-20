// app/api/ai-skills/route.ts
// 供下拉選單使用的 AI 技能清單（需登入）。只回 id/label/icon/desc，不含完整 prompt。

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/apiGuard';
import { listSkills } from '@/lib/ai/skillsStore';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
    const skills = await listSkills();
    return NextResponse.json({ ok: true, skills: skills.map((s) => ({ id: s.id, label: s.label, icon: s.icon, desc: s.desc })) });
});
