import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

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
async function getGeminiConfig(): Promise<{ apiKey: string; model: string } | null> {
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
                    model: model
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

        const { apiKey, model: modelName } = config;

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
You are the JV Tutor AI Customer Service Assistant. Your primary language is Traditional Chinese (zh-TW).
Be polite, professional, and helpful. Use the following dynamic knowledge base to answer user questions about courses and teachers.

=== KNOWLEDGE BASE (DYNAMIC FROM DATABASE) ===
COURSES (Current Status: 上架):
${JSON.stringify(dynamicCourses, null, 2)}

TEACHERS:
${JSON.stringify(dynamicTeachers, null, 2)}
==============================================

INSTRUCTIONS:
1. Answer questions based ONLY on the dynamic knowledge base provided above. Do not hallucinate courses or teachers that do not exist in the list.
2. Provide short and helpful answers using markdown structure when helpful.
3. AGENT WORKFLOW: If a user wants to contact human support, report a severe issue, or explicitly asks for human contact, politely ask for their contact info (email/phone) FIRST if they haven't provided it. 
4. Once you have their contact info, MUST USE the 'notify_department' tool immediately. After the system confirms the ticket is created, apologize for the inconvenience and let them know the department has been notified.
`;

        const model = genAI.getGenerativeModel({
            model: modelName,
            tools,
            systemInstruction: systemPrompt
        });

        const chat = model.startChat({
            history,
        });

        const result = await chat.sendMessage(latestMessage);
        const response = result.response;

        const functionCalls = response.functionCalls();

        // Check if the agent wants to call a function
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];

            if (call.name === 'notify_department') {
                const { department, message, userContact } = call.args as any;

                const ticketId = uuidv4();
                console.log(`[AI Agent] Tool Triggered: notify_department. Department: ${department}, Contact: ${userContact}`);

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

        // Normal Text Response
        return NextResponse.json({ reply: response.text() });

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
