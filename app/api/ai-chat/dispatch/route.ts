import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getDefault, getIntegration } from '@/lib/integrations/store';
import { getDispatchPrompt, quickDispatchDb, getAgent, listAgents } from '@/lib/ai/agentsStore';
import { runWithIntegration } from '@/lib/ai/gateway/gateway';

/**
 * Get AI config for dispatch (reuses chatroom config or falls back to Gemini).
 * 透過整合 store 讀取（新表 + 舊表 fallback）。
 */
async function getDispatchAIConfig() {
    try {
        const chatroom = await getDefault('AI_CHATROOM');
        const targetId = chatroom?.config?.linkedServiceId;
        if (targetId) {
            const svc = await getIntegration(targetId);
            if (svc?.config?.apiKey) return { provider: svc.type as string, apiKey: svc.config.apiKey as string };
        }

        // Fallback: active Gemini default
        const gem = await getDefault('GEMINI');
        if (gem?.config?.apiKey) return { provider: 'GEMINI', apiKey: gem.config.apiKey as string };
    } catch (_) { /* silent fallback */ }
    return null;
}

// ─── POST /api/ai-chat/dispatch ───────────────────────────────────────────────
export const POST = withAuth(postHandler);

async function postHandler(req: AuthedRequest) {
    try {
        const { query } = await req.json();
        if (!query?.trim()) {
            return NextResponse.json({ ok: false, error: 'query required' }, { status: 400 });
        }

        // 1. Quick keyword-based dispatch (no AI needed for common cases)
        const quickResults = await quickDispatchDb(query);

        // 2. Try AI-powered dispatch for better accuracy
        let aiDispatch: { dispatch: string[]; primary: string; confidence: number; reason: string; summary: string } | null = null;

        const aiConfig = await getDispatchAIConfig();
        if (aiConfig) {
            const dispatchPrompt = await getDispatchPrompt();
            const dispatchModel = aiConfig.provider === 'GEMINI' ? 'gemini-2.0-flash' : 'gpt-4o-mini';
            try {
                const res = await runWithIntegration(
                    { type: aiConfig.provider, config: { apiKey: aiConfig.apiKey, model: dispatchModel } },
                    { prompt: query, systemInstruction: dispatchPrompt, jsonMode: true, temperature: 0.2, maxTokens: 1024 },
                    { feature: 'dispatch', userId: req.session.userId, defaultModel: dispatchModel }
                );
                if (res.ok && res.result.text) {
                    const parsed = JSON.parse(res.result.text);
                    if (parsed.dispatch) aiDispatch = parsed;
                }
            } catch (aiErr) {
                console.warn('[Dispatch] AI dispatch failed, using keyword fallback:', aiErr);
            }
        }

        // 3. Build response — AI result wins, fallback to keyword
        if (aiDispatch && aiDispatch.dispatch && aiDispatch.primary) {
            const agents = (await Promise.all((aiDispatch.dispatch as string[]).map((id) => getAgent(id)))).filter(Boolean);
            const primaryAgent = await getAgent(aiDispatch.primary);

            return NextResponse.json({
                ok: true,
                mode: 'ai',
                primary: primaryAgent || null,
                agents,
                confidence: aiDispatch.confidence ?? 1,
                reason: aiDispatch.reason ?? '',
                summary: aiDispatch.summary ?? `為您推薦最適合的 Agent：`,
            });
        }

        // Keyword-only fallback
        if (quickResults.length > 0) {
            return NextResponse.json({
                ok: true,
                mode: 'keyword',
                primary: quickResults[0],
                agents: quickResults,
                confidence: 0.7,
                reason: `根據關鍵詞「${query.slice(0, 20)}」匹配到相關 Agent`,
                summary: '根據您的問題，這些 Agent 可以協助您：',
            });
        }

        // No match
        return NextResponse.json({
            ok: true,
            mode: 'none',
            primary: null,
            agents: (await listAgents()).slice(0, 4),
            confidence: 0,
            reason: '無法精確匹配，顯示主要 Agent 供選擇',
            summary: '我目前無法確定最適合的 Agent，以下是所有可用的 Agent，請選擇您需要的：',
        });

    } catch (err: any) {
        console.error('[Dispatch API] Error:', err);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}

// ─── GET /api/ai-chat/dispatch — List all agents ──────────────────────────────
export const GET = withAuth(getHandler);

async function getHandler() {
    const agents = await listAgents();
    return NextResponse.json({
        ok: true,
        agents: agents.map(a => ({
            id: a.id,
            name: a.name,
            icon: a.icon,
            color: a.color,
            badge: a.badge,
            category: a.category,
            desc: a.desc,
            capabilities: a.capabilities,
            exampleQuestions: a.exampleQuestions,
        }))
    });
}
