// app/api/admin/platform-agents/[id]/reset/route.ts
// 還原 seed agent 為程式預設（刪除 DB 覆寫）。僅 admin。

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { resetAgent, getAgent } from '@/lib/ai/agentsStore';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (_req, context: any) => {
    const { id } = await context.params;
    await resetAgent(id);
    return NextResponse.json({ ok: true, agent: await getAgent(id) });
});
