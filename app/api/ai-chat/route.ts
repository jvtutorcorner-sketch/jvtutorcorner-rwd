import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDefault, getIntegration } from '@/lib/integrations/store';
import { getSkill } from '@/lib/ai/skillsStore';
import { getAgent } from '@/lib/ai/agentsStore';
import { PLATFORM_TOOLS, getToolDefinitions } from '@/lib/platform-skills';
import { getAIModels } from '@/lib/aiModelsService';

import { evaluatePromptComplexity } from '@/lib/smartRouterService';
import { randomUUID } from 'crypto';
import { recordUsage } from '@/lib/ai/gateway/ledger';
import { usageToMusd } from '@/lib/ai/gateway/pricing';

/**
 * Dynamically retrieves the AI configuration (API Key, Model, Provider).
 * 透過整合 store 讀取（新表 + 舊表 fallback），尊重每個 type 的預設連線。
 */
async function getAIConfig(messages: any[] = [], useSmartRouter: boolean = false): Promise<{ provider: string; apiKey: string; model: string; systemInstruction?: string; linkedSkillId?: string; linkedDatabaseId?: string; routingReason?: string } | null> {
    try {
        const chatroom = await getDefault('AI_CHATROOM');
        const targetServiceId = chatroom?.config?.linkedServiceId;

        let integration: any = null;
        if (targetServiceId) {
            integration = await getIntegration(targetServiceId);
        }

        let routingReason: string | undefined = undefined;
        let smartRouterSystemInstruction: string | undefined = undefined;

        if (useSmartRouter && (!integration || integration.type !== 'SMART_ROUTER')) {
            const sr = await getDefault('SMART_ROUTER');
            if (sr) integration = sr;
        }

        if (integration && integration.type === 'SMART_ROUTER') {
            const config = integration.config || {};
            smartRouterSystemInstruction = config.systemInstruction;
            const { level, reason } = evaluatePromptComplexity(messages);
            routingReason = reason;

            // SMART_ROUTER stores fastServiceId / smartServiceId (see
            // lib/integrations/registry/providers/aiContainer.ts). The evaluator emits
            // FAST/BALANCED/COMPLEX. Map FAST→fast, BALANCED/COMPLEX→smart, with the
            // old *ModelId names kept as a fallback for any legacy config rows.
            let selectedChildId = config.smartServiceId || config.balancedModelId;
            if (level === 'FAST') selectedChildId = config.fastServiceId || config.fastModelId || selectedChildId;
            else if (level === 'COMPLEX') selectedChildId = config.smartServiceId || config.complexModelId || selectedChildId;

            if (selectedChildId) {
                const childIntegration = await getIntegration(selectedChildId);
                if (childIntegration && childIntegration.status === 'ACTIVE') {
                    integration = childIntegration;
                }
            }
        }

        if (!integration) {
            const fallback = await getDefault('GEMINI');
            if (fallback?.config?.apiKey) integration = fallback;
        }

        if (integration) {
            const provider = integration.type;
            const config = integration.config || {};
            let model = config.models?.[0] || config.model;

            if (!model && !['AI_CHATROOM', 'ASK_PLAN_AGENT', 'SMART_ROUTER'].includes(provider)) {
                const allModels = await getAIModels();
                const source = allModels.find(s => s.provider === provider.toUpperCase());
                if (source && source.models.length > 0) {
                    model = source.models[0];
                }
            }

            return {
                provider,
                apiKey: config.apiKey || config.openaiApiKey || config.geminiApiKey || config.anthropicApiKey,
                model: model || '',
                systemInstruction: smartRouterSystemInstruction || config.systemInstruction,
                linkedSkillId: chatroom?.config?.linkedSkillId || config.linkedSkillId,
                linkedDatabaseId: chatroom?.config?.linkedDatabaseId || config.linkedDatabaseId,
                routingReason
            };
        }
    } catch (dbError: any) {
        console.error('[AI Chat API] Database lookup for config failed:', dbError.message);
    }
    return null;
}

const promptCache = new Map<string, { data: any, timestamp: number }>();

export const POST = withAuth(postHandler);

async function postHandler(req: AuthedRequest) {
    try {
        const { messages, agentId, useSmartRouter, usePromptCache } = await req.json();

        const cacheKeyHash = Buffer.from(encodeURI(JSON.stringify({ messages, agentId, useSmartRouter }))).toString('base64');
        if (usePromptCache && promptCache.has(cacheKeyHash)) {
            const cached = promptCache.get(cacheKeyHash);
            if (cached && Date.now() - cached.timestamp < 1000 * 60 * 10) { // 10 mins TTL
                return NextResponse.json({ ...cached.data, isCached: true });
            } else {
                promptCache.delete(cacheKeyHash);
            }
        }

        const config = await getAIConfig(messages, useSmartRouter);
        if (!config || !config.apiKey) {
            return NextResponse.json({ reply: '抱歉，系統尚未設定 AI 服務串接，無法啟動 AI 聊天室。' });
        }

        const { provider, apiKey, model: modelName, systemInstruction: dbSystemInstruction, linkedSkillId, linkedDatabaseId, routingReason } = config;
        const latestMessage = messages[messages.length - 1]?.content || "";
        if (!latestMessage && messages.length > 0) return NextResponse.json({ reply: '您好！有什麼我可以幫您的嗎？' });

        const platformAgent = agentId ? await getAgent(agentId) : null;
        const tools = getToolDefinitions(platformAgent?.allowedTools);

        const defaultSystemPrompt = `你是一個智慧、友善且樂於助人的 AI 助理。請以清楚、簡潔且準確的方式回答使用者的問題。
若有可用的工具，請在適當時機調用工具以獲取真實資訊。`;

        const knowledgeContext = '';
        if (linkedDatabaseId) {
            // ... (keep metadata context logic if needed, but tool-calling is better)
        }

        const skill = linkedSkillId ? await getSkill(linkedSkillId) : null;
        const skillPrompt = skill ? `[你的當前技能：${skill.label}]\n${skill.prompt}\n\n` : '';
        const finalSystemPrompt = platformAgent
            ? `${knowledgeContext}${platformAgent.singlePrompt}`
            : `${knowledgeContext}${skillPrompt}${dbSystemInstruction ? `${dbSystemInstruction}\n\n` : ''}${defaultSystemPrompt}`;

        let finalReply = '';
        const toolLogs: any[] = [];
        // Accumulate token usage across all turns (tool-calling loop) for metering.
        let inTok = 0, outTok = 0, reasoningTok = 0;
        const addGeminiUsage = (resp: any) => {
            const u = resp?.usageMetadata; if (!u) return;
            inTok += u.promptTokenCount ?? 0; outTok += u.candidatesTokenCount ?? 0; reasoningTok += u.thoughtsTokenCount ?? 0;
        };
        const addOpenAiUsage = (data: any) => {
            const u = data?.usage; if (!u) return;
            inTok += u.prompt_tokens ?? 0; outTok += u.completion_tokens ?? 0; reasoningTok += u.completion_tokens_details?.reasoning_tokens ?? 0;
        };

        if (provider === 'GEMINI') {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: finalSystemPrompt,
                tools: tools.length > 0 ? [{ functionDeclarations: tools as any }] : undefined
            });

            let history = messages.slice(0, -1).map((m: any) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

            // Gemini requires the first message in history to be from 'user'
            const firstUserIndex = history.findIndex((h: any) => h.role === 'user');
            if (firstUserIndex > 0) {
                history = history.slice(firstUserIndex);
            } else if (firstUserIndex === -1 && history.length > 0) {
                history = [];
            }

            const chat = model.startChat({ history });

            let result = await chat.sendMessage(latestMessage);
            let response = result.response;
            addGeminiUsage(response);
            let calls = response.functionCalls();

            // Loop to handle potential multiple tool calls or sequential logic
            let iterations = 0;
            while (calls && calls.length > 0 && iterations < 5) {
                const toolResults: any[] = [];
                for (const call of calls) {
                    const tool = PLATFORM_TOOLS[call.name];
                    if (tool) {
                        const output = await tool.execute(call.args);
                        toolResults.push({ name: call.name, response: output });
                        toolLogs.push({ tool: call.name, args: call.args, result: output });
                    }
                }
                result = await chat.sendMessage(toolResults.map(r => ({ functionResponse: r })));
                response = result.response;
                addGeminiUsage(response);
                calls = response.functionCalls();
                iterations++;
            }
            finalReply = response.text();

        } else if (provider === 'OPENAI') {
            const openaiTools = tools.map(t => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.parameters }
            }));

            const openaiMessages = [
                { role: 'system', content: finalSystemPrompt },
                ...messages.map((m: any) => ({ role: m.role, content: m.content }))
            ];

            const fetchChat = async (msgs: any[]) => {
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: modelName,
                        messages: msgs,
                        tools: openaiTools.length > 0 ? openaiTools : undefined,
                        tool_choice: 'auto'
                    })
                });
                if (!res.ok) throw new Error(`OpenAI API Error: ${res.status}`);
                return res.json();
            };

            let data = await fetchChat(openaiMessages);
            addOpenAiUsage(data);
            let message = data.choices[0].message;

            let iterations = 0;
            while (message.tool_calls && iterations < 5) {
                openaiMessages.push(message);
                for (const toolCall of message.tool_calls) {
                    const tool = PLATFORM_TOOLS[toolCall.function.name];
                    if (tool) {
                        const args = JSON.parse(toolCall.function.arguments);
                        const output = await tool.execute(args);
                        openaiMessages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                            content: JSON.stringify(output)
                        });
                        toolLogs.push({ tool: toolCall.function.name, args, result: output });
                    }
                }
                data = await fetchChat(openaiMessages);
                addOpenAiUsage(data);
                message = data.choices[0].message;
                iterations++;
            }
            finalReply = message.content;
        } else {
            finalReply = '不支援的 AI 供應商進行工具調用。';
        }

        // Meter the whole chat turn (summed across the tool-calling loop).
        if (inTok > 0 || outTok > 0) {
            try {
                await recordUsage({
                    requestId: randomUUID(),
                    costCenter: 'ai',
                    actualCostMusd: usageToMusd(modelName, { inputTokens: inTok, outputTokens: outTok, reasoningTokens: reasoningTok }),
                    feature: 'chat',
                    model: modelName,
                    provider: provider as any,
                    userId: req.session.userId,
                    inputTokens: inTok,
                    outputTokens: outTok,
                    reasoningTokens: reasoningTok,
                    status: 'ok',
                });
            } catch (meterErr) {
                console.warn('[AI Chat API] usage metering failed (non-fatal)', meterErr);
            }
        }

        const responseData = {
            reply: finalReply,
            toolCalls: toolLogs,
            agentId: platformAgent?.id || agentId,
            routingReason,
            modelUsed: modelName
        };

        if (usePromptCache) {
            promptCache.set(cacheKeyHash, { data: responseData, timestamp: Date.now() });
        }

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error('❌ [AI Chat API] Error:', error);
        return NextResponse.json({ reply: '系統發生錯誤，請稍後再試。', error: error.message }, { status: 500 });
    }
}
