import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getSkillById } from '@/lib/ai-skills';
import { getAgentById } from '@/lib/platform-agents';
import { PLATFORM_TOOLS, getToolDefinitions } from '@/lib/platform-skills';
import { getAIModels } from '@/lib/aiModelsService';

import { evaluatePromptComplexity } from '@/lib/smartRouterService';

// Table for app integrations (source of truth for API keys)
const APP_INTEGRATIONS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

/**
 * Dynamically retrieves the AI configuration (API Key, Model, Provider).
 */
async function getAIConfig(messages: any[] = []): Promise<{ provider: string; apiKey: string; model: string; systemInstruction?: string; linkedSkillId?: string; linkedDatabaseId?: string; routingReason?: string } | null> {
    try {
        const chatroomRes = await ddbDocClient.send(new ScanCommand({
            TableName: APP_INTEGRATIONS_TABLE,
            FilterExpression: '#type = :type AND #status = :status',
            ExpressionAttributeNames: { '#type': 'type', '#status': 'status' },
            ExpressionAttributeValues: { ':type': 'AI_CHATROOM', ':status': 'ACTIVE' }
        }));

        const chatroom = chatroomRes.Items?.[0];
        let targetServiceId = chatroom?.config?.linkedServiceId;

        let integration: any = null;
        if (targetServiceId) {
            const getRes = await ddbDocClient.send(new ScanCommand({
                TableName: APP_INTEGRATIONS_TABLE,
                FilterExpression: 'integrationId = :id',
                ExpressionAttributeValues: { ':id': targetServiceId }
            }));
            integration = getRes.Items?.[0];
        }

        let routingReason: string | undefined = undefined;
        let smartRouterSystemInstruction: string | undefined = undefined;

        if (integration && integration.type === 'SMART_ROUTER') {
            const config = integration.config || {};
            smartRouterSystemInstruction = config.systemInstruction;
            const { level, reason } = evaluatePromptComplexity(messages);
            routingReason = reason;

            let selectedChildId = config.balancedModelId;
            if (level === 'FAST' && config.fastModelId) selectedChildId = config.fastModelId;
            else if (level === 'COMPLEX' && config.complexModelId) selectedChildId = config.complexModelId;

            if (selectedChildId) {
                const getChildRes = await ddbDocClient.send(new ScanCommand({
                    TableName: APP_INTEGRATIONS_TABLE,
                    FilterExpression: 'integrationId = :id AND #status = :status',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: { ':id': selectedChildId, ':status': 'ACTIVE' }
                }));
                const childIntegration = getChildRes.Items?.[0];
                if (childIntegration) {
                    integration = childIntegration;
                }
            }
        }

        if (!integration) {
            const fallbackRes = await ddbDocClient.send(new ScanCommand({
                TableName: APP_INTEGRATIONS_TABLE,
                FilterExpression: '#type = :type AND #status = :status',
                ExpressionAttributeNames: { '#type': 'type', '#status': 'status' },
                ExpressionAttributeValues: { ':type': 'GEMINI', ':status': 'ACTIVE' }
            }));
            integration = fallbackRes.Items?.find(item => item.config?.apiKey);
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

export async function POST(req: Request) {
    try {
        const { messages, agentId } = await req.json();

        const config = await getAIConfig(messages);
        if (!config || !config.apiKey) {
            return NextResponse.json({ reply: '抱歉，系統尚未設定 AI 服務串接，無法啟動 AI 聊天室。' });
        }

        const { provider, apiKey, model: modelName, systemInstruction: dbSystemInstruction, linkedSkillId, linkedDatabaseId, routingReason } = config;
        const latestMessage = messages[messages.length - 1]?.content || "";
        if (!latestMessage && messages.length > 0) return NextResponse.json({ reply: '您好！有什麼我可以幫您的嗎？' });

        const platformAgent = agentId ? getAgentById(agentId) : null;
        const tools = getToolDefinitions(platformAgent?.allowedTools);

        const defaultSystemPrompt = `你是一個智慧、友善且樂於助人的 AI 助理。請以清楚、簡潔且準確的方式回答使用者的問題。
若有可用的工具，請在適當時機調用工具以獲取真實資訊。`;

        let knowledgeContext = '';
        if (linkedDatabaseId) {
            // ... (keep metadata context logic if needed, but tool-calling is better)
        }

        const skill = linkedSkillId ? getSkillById(linkedSkillId) : null;
        const skillPrompt = skill ? `[你的當前技能：${skill.label}]\n${skill.prompt}\n\n` : '';
        const finalSystemPrompt = platformAgent
            ? `${knowledgeContext}${platformAgent.singlePrompt}`
            : `${knowledgeContext}${skillPrompt}${dbSystemInstruction ? `${dbSystemInstruction}\n\n` : ''}${defaultSystemPrompt}`;

        let finalReply = '';
        let toolLogs: any[] = [];

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
                message = data.choices[0].message;
                iterations++;
            }
            finalReply = message.content;
        } else {
            finalReply = '不支援的 AI 供應商進行工具調用。';
        }

        return NextResponse.json({
            reply: finalReply,
            toolCalls: toolLogs,
            agentId: platformAgent?.id || agentId,
            routingReason,
            modelUsed: modelName
        });

    } catch (error: any) {
        console.error('❌ [AI Chat API] Error:', error);
        return NextResponse.json({ reply: '系統發生錯誤，請稍後再試。', error: error.message }, { status: 500 });
    }
}
