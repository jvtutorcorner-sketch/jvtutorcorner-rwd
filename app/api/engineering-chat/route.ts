import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

// Table for app integrations (source of truth for API keys)
const APP_INTEGRATIONS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

/**
 * Dynamically retrieves the Gemini configuration (API Key and Model).
 * Source of truth: Database integration (DynamoDB).
 */
async function getGeminiConfig(): Promise<{ apiKey: string; model: string } | null> {
    try {
        const result = await ddbDocClient.send(new ScanCommand({
            TableName: APP_INTEGRATIONS_TABLE,
            FilterExpression: '#type = :type AND #status = :status',
            ExpressionAttributeNames: {
                '#type': 'type',
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':type': 'GEMINI',
                ':status': 'ACTIVE'
            }
        }));

        const items = result.Items || [];
        if (items.length > 0) {
            const integration = items.find(item => item.config?.apiKey);
            if (integration) {
                let model = "gemini-1.5-pro"; // Recommend higher reasoning model for engineering
                if (Array.isArray(integration.config.models) && integration.config.models.length > 0) {
                    model = integration.config.models[0];
                } else if (integration.config.model) {
                    model = integration.config.model;
                }

                return {
                    apiKey: integration.config.apiKey,
                    model: model
                };
            }
        }
    } catch (dbError: any) {
        console.error('[Eng API] Database lookup for config failed:', dbError.message);
    }

    return null;
}

export async function POST(req: Request) {
    try {
        const config = await getGeminiConfig();

        if (!config || !config.apiKey) {
            console.error("Gemini API Key missing in Database");
            return NextResponse.json({ reply: '抱歉，系統尚未設定 AI API Key，無法啟動工程 AI 助理。請聯絡管理員設定 GEMINI_API_KEY 或在系統設定中完成 AI 串接。' });
        }

        const { apiKey, model: modelName } = config;

        // Initialize Gemini with the retrieved key
        const genAI = new GoogleGenerativeAI(apiKey);
        const { messages } = await req.json();

        // Convert generic chat history to Gemini's format
        // CRITICAL: Gemini history must start with 'user' and alternate roles.
        const history: { role: string; parts: { text: string }[] }[] = [];

        let startIndex = 0;
        if (messages.length > 0 && messages[0].role === 'assistant') {
            startIndex = 1;
        }

        // Process up to the second to last message for history
        for (let i = startIndex; i < messages.length - 1; i++) {
            const msg = messages[i];
            const role = msg.role === 'assistant' ? 'model' : 'user';

            // Avoid consecutive roles (Gemini requirement)
            if (history.length > 0 && history[history.length - 1].role === role) {
                // If same role, merge content
                history[history.length - 1].parts[0].text += '\n' + msg.content;
            } else {
                history.push({
                    role,
                    parts: [{ text: msg.content }],
                });
            }
        }

        const latestMessage = messages[messages.length - 1]?.content || "";

        if (!latestMessage) {
            return NextResponse.json({ reply: '您好！我是專屬的工程 AI 助理，有什麼可以為您評估的架構或套件問題嗎？' });
        }

        // Build the system prompt specifically for engineering tasks
        const systemPrompt = `
# 角色設定
你是 JV Tutor 平台的「專屬工程 AI 助理」。你的服務對象是平台管理階層與工程人員。
你的核心任務是協助工程人員進行系統架構規劃、版本更新評估、套件與網路調研、以及提供專業的技術諮詢與解決方案。
你的語氣必須嚴謹、專業且具有洞察力，能針對複雜技術問題給出明確的利弊分析與建議。

# 核心任務
1. 系統架構評估：根據提供的現有架構或需求，分析效能瓶頸、安全性及擴展性，並提供最佳實踐建議。
2. 版本與套件分析：針對前端框架（如 Next.js, React）、後端技術或串接服務（如 Agora, DynamoDB 等），評估更新風險與依賴衝突。
3. 網路與技術調研：根據工程需求，提供相關技術的市佔、社區活躍度及替代方案對比。
4. 專業解答：程式碼優化建議、伺服器配置、資料庫索引優化等技術問題。

# 回覆限制與排版格式
- 內容必須條列清楚、層次分明，適合工程師閱讀的 Markdown 格式，適當使用標題、程式碼區塊（code blocks）及粗體強調重點。
- 可以使用如 🚀、⚙️、🔍、⚠️ 等表情符號標示重點分類，提升閱讀效率，但不要過於花俏。
- 若分析指出潛在風險，請務必提供「風險緩解方案」或「替代選項」。
- 如果使用者的問題不明確，請向專業工程師一樣釐清問題的上下文與環境變數。
`;

        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt
        });

        const chat = model.startChat({
            history,
        });

        const result = await chat.sendMessage(latestMessage);
        const response = result.response;

        return NextResponse.json({ reply: response.text() });

    } catch (error: any) {
        console.error('❌ [Eng API] Global Error:', error);
        return NextResponse.json(
            {
                reply: '抱歉，系統遭遇錯誤，請稍後再試。',
                error: error?.message || 'Unknown error'
            },
            { status: 500 }
        );
    }
}
