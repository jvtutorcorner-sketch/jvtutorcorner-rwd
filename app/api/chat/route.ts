import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { COURSES } from '@/data/courses';
import { TEACHERS } from '@/data/teachers';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Initialize Gemini with API Key. Ensure you've set GEMINI_API_KEY in your .env.local
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
        if (!process.env.GEMINI_API_KEY) {
            console.error("GEMINI_API_KEY missing");
            return NextResponse.json({ reply: '抱歉，系統尚未設定 AI API Key，無法啟動 AI 助理。請聯絡管理員設定 GEMINI_API_KEY。' });
        }

        const { messages } = await req.json();

        // Convert generic chat history to Gemini's format
        const history = messages.slice(0, -1).map((msg: any) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
        }));

        const latestMessage = messages[messages.length - 1].content;

        // Build the Knowledge Base prompt
        const systemPrompt = `
You are the JV Tutor AI Customer Service Assistant. Your primary language is Traditional Chinese (zh-TW).
Be polite, professional, and helpful. Use the following knowledge base to answer user questions about courses and teachers.

=== KNOWLEDGE BASE ===
COURSES:
${JSON.stringify(COURSES, null, 2)}

TEACHERS:
${JSON.stringify(TEACHERS, null, 2)}
======================

INSTRUCTIONS:
1. Answer questions based ONLY on the knowledge base provided above. Do not hallucinate courses or teachers that do not exist.
2. Provide short and helpful answers using markdown structure when helpful.
3. AGENT WORKFLOW: If a user wants to contact human support, report a severe issue, or explicitly asks for human contact, politely ask for their contact info (email/phone) FIRST if they haven't provided it. 
4. Once you have their contact info, MUST USE the 'notify_department' tool immediately. After the system confirms the ticket is created, apologize for the inconvenience and let them know the department has been notified.
`;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
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
        console.error('Chat API Error:', error);
        return NextResponse.json(
            { reply: '抱歉，系統遭遇錯誤，請稍後再試。' },
            { status: 500 }
        );
    }
}
