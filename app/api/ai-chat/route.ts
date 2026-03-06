import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getSkillById } from '@/lib/ai-skills';
import { getAgentById } from '@/lib/platform-agents';

// Table for app integrations (source of truth for API keys)
const APP_INTEGRATIONS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

/**
 * Dynamically retrieves the AI configuration (API Key, Model, Provider).
 * Source of truth: Database integration (DynamoDB).
 */
async function getAIConfig(): Promise<{ provider: string; apiKey: string; model: string; systemInstruction?: string; linkedSkillId?: string; linkedDatabaseId?: string } | null> {
    try {
        // 1. Check for AI_CHATROOM integration first
        const chatroomRes = await ddbDocClient.send(new ScanCommand({
            TableName: APP_INTEGRATIONS_TABLE,
            FilterExpression: '#type = :type AND #status = :status',
            ExpressionAttributeNames: { '#type': 'type', '#status': 'status' },
            ExpressionAttributeValues: { ':type': 'AI_CHATROOM', ':status': 'ACTIVE' }
        }));

        const chatroom = chatroomRes.Items?.[0];
        let targetServiceId = chatroom?.config?.linkedServiceId;

        // 2. Fetch the target service (Gemini, OpenAI, etc.)
        let integration: any = null;

        if (targetServiceId) {
            const getRes = await ddbDocClient.send(new ScanCommand({
                TableName: APP_INTEGRATIONS_TABLE,
                FilterExpression: 'integrationId = :id',
                ExpressionAttributeValues: { ':id': targetServiceId }
            }));
            integration = getRes.Items?.[0];
        }

        // 3. Fallback: If no AI_CHATROOM linked, look for an active GEMINI integration
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
            const config = integration.config;
            let model = config.models?.[0] || config.model;

            // Default models if none selected
            if (!model) {
                if (provider === 'GEMINI') model = 'gemini-1.5-pro';
                else if (provider === 'OPENAI') model = 'gpt-4o';
                else if (provider === 'ANTHROPIC') model = 'claude-3-5-sonnet-20240620';
            }

            return {
                provider,
                apiKey: config.apiKey || config.openaiApiKey || config.geminiApiKey || config.anthropicApiKey,
                model,
                systemInstruction: config.systemInstruction,
                linkedSkillId: config.linkedSkillId,
                linkedDatabaseId: chatroom?.config?.linkedDatabaseId
            };
        }
    } catch (dbError: any) {
        console.error('[AI Chat API] Database lookup for config failed:', dbError.message);
    }

    return null;
}

export async function POST(req: Request) {
    try {
        const config = await getAIConfig();

        if (!config || !config.apiKey) {
            console.error("AI Configuration or API Key missing in Database");
            return NextResponse.json({ reply: '抱歉，系統尚未設定 AI 服務串接，無法啟動 AI 聊天室。請前往系統設定完成「AI 工具串接」配置。' });
        }

        const { provider, apiKey, model: modelName, systemInstruction: dbSystemInstruction, linkedSkillId, linkedDatabaseId } = config;
        const { messages, agentId } = await req.json();

        // Platform Agent override — if agentId provided, use agent's dedicated prompt
        const platformAgent = agentId ? getAgentById(agentId) : null;
        
        // For ASK_PLAN_AGENT, check if it's stored as an app integration with executionEnvironment
        let executionEnvironment = 'local'; // Default execution environment
        let askPlanAgentConfig: any = null;
        
        if (agentId) {
            try {
                const agentRes = await ddbDocClient.send(new ScanCommand({
                    TableName: APP_INTEGRATIONS_TABLE,
                    FilterExpression: '#type = :type AND #status = :status',
                    ExpressionAttributeNames: { '#type': 'type', '#status': 'status' },
                    ExpressionAttributeValues: { ':type': 'ASK_PLAN_AGENT', ':status': 'ACTIVE' }
                }));
                
                askPlanAgentConfig = agentRes.Items?.find((item: any) => item.config?.name === agentId || item.integrationId === agentId);
                if (askPlanAgentConfig?.config?.executionEnvironment) {
                    executionEnvironment = askPlanAgentConfig.config.executionEnvironment;
                }
            } catch (err) {
                console.warn('[AI Chat API] Failed to fetch ASK_PLAN_AGENT config:', err);
            }
        }

        // Default system prompt (generic, customizable via DB)
        const defaultSystemPrompt = `你是一個智慧、友善且樂於助人的 AI 助理。請以清楚、簡潔且準確的方式回答使用者的問題。`;

        // Fetch knowledge base / database context if linked
        let knowledgeContext = '';
        if (linkedDatabaseId) {
            try {
                const dbConfigRes = await ddbDocClient.send(new ScanCommand({
                    TableName: APP_INTEGRATIONS_TABLE,
                    FilterExpression: 'integrationId = :id',
                    ExpressionAttributeValues: { ':id': linkedDatabaseId }
                }));
                
                const database = dbConfigRes.Items?.[0];
                if (database) {
                    if (database.type === 'DYNAMODB' && database.config?.tableName) {
                        // Query DynamoDB table for knowledge data
                        try {
                            const tableRes = await ddbDocClient.send(new ScanCommand({
                                TableName: database.config.tableName,
                                Limit: 10 // Limit to avoid oversized prompts
                            }));
                            
                            if (tableRes.Items && tableRes.Items.length > 0) {
                                const entries = tableRes.Items
                                    .slice(0, 5) // Take first 5 items
                                    .map((item: any) => JSON.stringify(item))
                                    .join('\n');
                                
                                knowledgeContext = `[知識庫資料 - from ${database.name}]\n${entries}\n`;
                            }
                        } catch (scanErr: any) {
                            console.warn(`[AI Chat API] Failed to scan DynamoDB table ${database.config.tableName}:`, scanErr.message);
                        }
                    } else if (database.type === 'KNOWLEDGE_BASE') {
                        // For knowledge base, use the description or stored entries
                        if (database.config?.description) {
                            knowledgeContext = `[知識庫資料 - ${database.name}]\n${database.config.description}\n`;
                        }
                        // In a real implementation, you'd store and retrieve knowledge base entries
                        // For now, we just use the description from config
                    }
                }
            } catch (dbErr: any) {
                console.warn('[AI Chat API] Failed to fetch linked database:', dbErr.message);
            }
        }

        // Prepend Skill Prompt if linked
        const skill = linkedSkillId ? getSkillById(linkedSkillId) : null;
        const skillPrompt = skill ? `[你的當前技能：${skill.label}]\n${skill.prompt}\n\n` : '';

        // Platform Agent overrides skill + DB instruction when agentId is provided
        const finalSystemPrompt = platformAgent
            ? `${knowledgeContext}${platformAgent.singlePrompt}`
            : `${knowledgeContext}${skillPrompt}${dbSystemInstruction ? `${dbSystemInstruction}\n\n` : ''}${defaultSystemPrompt}`;

        if (provider === 'GEMINI') {
            const genAI = new GoogleGenerativeAI(apiKey);

            // Convert generic chat history to Gemini's format
            const history: { role: string; parts: { text: string }[] }[] = [];
            let startIndex = 0;
            if (messages.length > 0 && messages[0].role === 'assistant') {
                startIndex = 1;
            }

            for (let i = startIndex; i < messages.length - 1; i++) {
                const msg = messages[i];
                const role = msg.role === 'assistant' ? 'model' : 'user';
                if (history.length > 0 && history[history.length - 1].role === role) {
                    history[history.length - 1].parts[0].text += '\n' + msg.content;
                } else {
                    history.push({ role, parts: [{ text: msg.content }] });
                }
            }

            const latestMessage = messages[messages.length - 1]?.content || "";
            if (!latestMessage) {
                return NextResponse.json({ reply: '您好！我是 AI 助理，有什麼可以幫您的嗎？' });
            }

            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: finalSystemPrompt
            });

            const chat = model.startChat({ history });
            const result = await chat.sendMessage(latestMessage);
            const response = result.response;

            return NextResponse.json({ 
                reply: response.text(),
                executionEnvironment,
                agentId: platformAgent?.id || agentId
            });

        } else if (provider === 'OPENAI') {
            const openAiMessages = [
                { role: 'system', content: finalSystemPrompt },
                ...messages.map((m: any) => ({ role: m.role, content: m.content }))
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: openAiMessages,
                    temperature: 0.7,
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            return NextResponse.json({ 
                reply: data.choices[0].message.content,
                executionEnvironment,
                agentId: platformAgent?.id || agentId
            });

        } else if (provider === 'ANTHROPIC') {
            return NextResponse.json({ reply: '目前尚未完全支援 Anthropic (Claude) 串接，請優先選用 Gemini 或 OpenAI。' });
        }

        return NextResponse.json({ reply: '不支援的 AI 供應商類型。' });

    } catch (error: any) {
        console.error('❌ [AI Chat API] Global Error:', error);
        return NextResponse.json(
            {
                reply: '抱歉，系統遭遇錯誤，請稍後再試。',
                error: error?.message || 'Unknown error'
            },
            { status: 500 }
        );
    }
}
