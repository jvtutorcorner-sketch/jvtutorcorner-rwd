import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';

// Table for app integrations
const APP_INTEGRATIONS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

/**
 * Dynamically retrieves current courses and teachers from DynamoDB.
 */
async function getDynamicKnowledgeBase(): Promise<{ courses: any[]; teachers: any[] }> {
    try {
        console.log('[AI Chat API] Fetching dynamic knowledge base from DynamoDB...');

        const [coursesRes, teachersRes] = await Promise.all([
            ddbDocClient.send(new ScanCommand({
                TableName: COURSES_TABLE,
                FilterExpression: '#status = :status',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':status': '上架' }
            })),
            ddbDocClient.send(new ScanCommand({ TableName: TEACHERS_TABLE }))
        ]);

        return {
            courses: coursesRes.Items || [],
            teachers: teachersRes.Items || []
        };
    } catch (error) {
        console.error('[AI Chat API] Failed to fetch dynamic knowledge base:', error);
        return { courses: [], teachers: [] };
    }
}

/**
 * Dynamically retrieves the Gemini configuration (API Key and Model).
 * Source of truth: Database integration (DynamoDB).
 */
async function getGeminiConfig(): Promise<{ apiKey: string; model: string; systemInstruction?: string } | null> {
    // 1. Check Database for an active GEMINI integration first (Source of truth)
    try {
        console.log(`[AI Chat API] Attempting to fetch config from ${APP_INTEGRATIONS_TABLE}...`);
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
            // Find the item that has a config with an apiKey and possibly a selected model
            const integration = items.find(item => item.config?.apiKey);
            if (integration) {
                console.log(`[AI Chat API] Found config from integration: ${integration.name}`);

                // Use the configured model from the 'models' array (stored in /apps page)
                let model = "gemini-1.5-flash"; // Default fallback if no model selected
                if (Array.isArray(integration.config.models) && integration.config.models.length > 0) {
                    model = integration.config.models[0];
                    console.log(`[AI Chat API] Using model from DB: ${model}`);
                } else if (integration.config.model) {
                    // Backwards compatibility or alternative storage
                    model = integration.config.model;
                    console.log(`[AI Chat API] Using model (alt field) from DB: ${model}`);
                }

                return {
                    apiKey: integration.config.apiKey,
                    model: model,
                    systemInstruction: integration.config.systemInstruction
                };
            }
        }
    } catch (dbError: any) {
        console.error('[AI Chat API] Database lookup for config failed:', dbError.message);
    }

    return null;
}

// Define the function tool for the agent
const notifyDepartmentDeclaration: FunctionDeclaration = {
    name: 'notify_department',
    description: 'When a user wants to contact human customer service, report an issue, or escalate a request, use this tool to create a ticket and notify the relevant department. Ask the user for their email or phone if they have not provided it.',
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            department: {
                type: SchemaType.STRING,
                description: 'The department to handle this request (e.g., "Customer Support", "Technical Support", "Billing")',
            },
            message: {
                type: SchemaType.STRING,
                description: 'A summary of the user\'s issue or request that needs human attention.',
            },
            userContact: {
                type: SchemaType.STRING,
                description: 'The user\'s email, phone number, or whatever contact info they provided.',
            }
        },
        required: ['department', 'message', 'userContact'],
    },
};

const tools = [{ functionDeclarations: [notifyDepartmentDeclaration] }];

export async function POST(req: Request) {
    try {
        const config = await getGeminiConfig();

        if (!config || !config.apiKey) {
            console.error("Gemini API Key missing in Database");
            return NextResponse.json({ reply: '抱歉，系統尚未設定 AI API Key，無法啟動 AI 助理。請聯絡管理員設定 GEMINI_API_KEY 或在系統設定中完成 AI 串接。' });
        }

        const { apiKey, model: modelName, systemInstruction: customInstruction } = config;

        // Fetch Courses and Teachers dynamically from DynamoDB
        const { courses: dynamicCourses, teachers: dynamicTeachers } = await getDynamicKnowledgeBase();

        // Initialize Gemini with the retrieved key
        const genAI = new GoogleGenerativeAI(apiKey);
        const { messages } = await req.json();

        // Convert generic chat history to Gemini's format
        // CRITICAL: Gemini history must start with 'user' and alternate roles.
        const history: { role: string; parts: { text: string }[] }[] = [];

        // ... (startIndex logic)
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
                // If same role, merge content or skip. Merging is safer.
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
            return NextResponse.json({ reply: '您好！有什麼我可以幫您的幫忙查詢課程或老師嗎？' });
        }

        // Build the Knowledge Base prompt
        const systemPrompt = `
# 角色設定
你是「jvtutorcorner」語言學習平台的專屬 AI 助教。你的任務是透過 LINE 提供高品質的語言指導，同時引導學生善用平台的線上教學資源。你的語氣必須親切、專業、充滿鼓勵，就像一位真實且充滿熱忱的家教。

# 核心任務
1. 語言解答 (純文字)：精準回答學生的單字、文法或翻譯問題。每次解答請務必提供 1 到 2 個實用的生活化英文例句，並附上中文翻譯。
2. 視覺學習 (圖片支援)：若學生傳送圖片，請仔細觀察圖片細節，挑選 3 到 5 個最相關的核心英文單字（附詞性與中文解釋），並利用其中一個單字造一個與圖片情境相符的句子。
3. 平台特色引導：在適當的教學時機，自然地提醒學生「語言需要實際開口練習」。主動引導並鼓勵他們預約 jvtutorcorner 的「1對1視訊教學」課程，並提及上課時可以利用專屬的「互動白板」與老師進行視覺化的即時演練，讓學習更有成效。您可以參考下方的「平台動態知識庫」來推薦適合的課程或老師。

# 回覆限制與排版格式
- 內容必須條列式、段落分明，絕對避免產生密密麻麻的長篇大論，確保極佳的 LINE 手機閱讀體驗。
- 適度使用表情符號（如 💡、🗣️、✨、📸）增加對話的溫度與互動感。
- 每次回覆的結尾，請務必拋出一個與剛剛學習內容相關的「簡單英文問句」，引導學生繼續在 LINE 上用英文回覆你，達成連續互動。
- 若學生詢問與語言學習或平台操作完全無關的話題，請幽默且禮貌地將話題導回學習本身。

=== 平台動態知識庫 (KNOWLEDGE BASE) ===
COURSES (目前上架的課程):
${JSON.stringify(dynamicCourses, null, 2)}

TEACHERS (師資陣容):
${JSON.stringify(dynamicTeachers, null, 2)}
==============================================

# 額外系統指令 (AGENT WORKFLOW):
1. 如果使用者遇到嚴重問題、需要客服協助、或是明確要求轉接真人客服，請先禮貌詢問他們的聯絡方式（Email 或電話），若他們尚未提供。
2. 取得聯絡方式後，請務必立即使用 'notify_department' 工具建立工單。系統確認工單建立後，請向使用者致歉並告知已通知相關部門處理。

${customInstruction ? `
# 管理員特別指令 (ADMIN CUSTOM INSTRUCTIONS):
${customInstruction}
` : ''}
`;

        const model = genAI.getGenerativeModel({
            model: modelName,
            tools,
            systemInstruction: systemPrompt
        });

        // Memory search disabled (LanceDB removed)
        const chat = model.startChat({
            history,
            systemInstruction: systemPrompt
        } as any);

        const result = await chat.sendMessage(latestMessage);
        const response = result.response;

        const functionCalls = response.functionCalls();

        // Check if the agent wants to call a function
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];

            if (call.name === 'notify_department') {
                const { department, message, userContact } = call.args as any;

                const ticketId = uuidv4();
                console.log(`[AI Agent]Tool Triggered: notify_department.Department: ${department}, Contact: ${userContact}`);

                try {
                    // Attempt to save to DynamoDB. If table doesn't exist, we will catch the error.
                    await ddbDocClient.send(new PutCommand({
                        TableName: 'jvtutorcorner-tickets',
                        Item: {
                            id: ticketId,
                            department: department || 'General',
                            message: message,
                            userContact: userContact,
                            status: 'open',
                            createdAt: new Date().toISOString(),
                        }
                    }));

                    console.log(`[AI Agent] Created ticket ${ticketId} successfully.`);

                    // Fetch SMTP config and send email notification
                    try {
                        let smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
                        let smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
                        let smtpUser = process.env.SMTP_USER;
                        let smtpPass = process.env.SMTP_PASS;
                        let fromAddress = process.env.SMTP_USER;

                        const scanRes = await ddbDocClient.send(new ScanCommand({
                            TableName: APP_INTEGRATIONS_TABLE,
                            FilterExpression: '#typ = :type AND #sts = :status',
                            ExpressionAttributeNames: { '#typ': 'type', '#sts': 'status' },
                            ExpressionAttributeValues: { ':type': 'SMTP', ':status': 'ACTIVE' }
                        }));

                        if (scanRes.Items && scanRes.Items.length > 0) {
                            const smtpApp = scanRes.Items[0];
                            if (smtpApp.config) {
                                smtpHost = smtpApp.config.smtpHost || smtpHost;
                                smtpPort = parseInt(smtpApp.config.smtpPort || String(smtpPort), 10);
                                smtpUser = smtpApp.config.smtpUser || smtpUser;
                                smtpPass = smtpApp.config.smtpPass || smtpPass;
                                fromAddress = smtpApp.config.fromAddress || smtpUser;
                            }
                        }

                        if (smtpUser && smtpPass) {
                            const transporter = nodemailer.createTransport({
                                host: smtpHost,
                                port: smtpPort,
                                secure: smtpPort === 465,
                                auth: { user: smtpUser, pass: smtpPass },
                            });

                            const adminEmail = process.env.ADMIN_EMAIL || smtpUser;

                            await transporter.sendMail({
                                from: `"JV Tutor 系統通知" <${fromAddress}>`,
                                to: adminEmail,
                                subject: `[新客服工單 - ${department}] 來自 ${userContact}`,
                                html: `
                                    <div style="font-family: sans-serif; padding: 20px;">
                                        <h2>收到新客服請求</h2>
                                        <p><strong>聯絡方式:</strong> ${userContact}</p>
                                        <p><strong>處理部門:</strong> ${department}</p>
                                        <div style="margin: 20px 0; padding: 15px; background: #f3f4f6; border-radius: 8px;">
                                            <p style="white-space: pre-wrap;">${message}</p>
                                        </div>
                                        <p style="color: #666; font-size: 12px;">工單編號: ${ticketId}</p>
                                    </div>
                                `
                            });
                            console.log(`[AI Agent] Email notification sent successfully to ${adminEmail}`);
                        } else {
                            console.warn('[AI Agent] SMTP credentials not configured. Email notification skipped.');
                        }
                    } catch (emailErr) {
                        console.error('[AI Agent] Error sending email notification:', emailErr);
                    }

                    const followUpResult = await chat.sendMessage([{
                        functionResponse: {
                            name: 'notify_department',
                            response: {
                                status: 'success',
                                ticketId: ticketId,
                                note: 'Success. The ticket is open. Please inform the user that their request has been seamlessly passed to the relevant team. Do not leak the internal ticket DB id.'
                            }
                        }
                    }]);

                    return NextResponse.json({ reply: followUpResult.response.text() });

                } catch (dbError: any) {
                    console.error('[AI Agent] DB Error creating ticket:', dbError.message);

                    // Fallback if DynamoDB table doesn't exist
                    const followUpResult = await chat.sendMessage([{
                        functionResponse: {
                            name: 'notify_department',
                            response: {
                                status: 'fallback_success',
                                error_note: 'Database table missing, but email alert sent successfully. Inform the user their request was received.'
                            }
                        }
                    }]);

                    return NextResponse.json({ reply: followUpResult.response.text() });
                }
            }
        }

        const finalReply = response.text();

        // Memory storage disabled (LanceDB removed)

        // Normal Text Response
        return NextResponse.json({ reply: finalReply });

    } catch (error: any) {
        console.error('❌ [AI Chat API] Global Error:', error);
        if (error.response) {
            try {
                const errorData = error.response;
                console.error('❌ [AI Chat API] Gemini Response Error:', JSON.stringify(errorData, null, 2));
            } catch (e) { }
        }
        return NextResponse.json(
            {
                reply: '抱歉，系統遭遇錯誤，請稍後再試。',
                error: error?.message || 'Unknown error'
            },
            { status: 500 }
        );
    }
}
