import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'jvtutorcorner-agora-connections';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const {
            userId,
            courseId,
            page,
            role,
            os,
            browser,
            device,
            agoraVersion,
            systemRequirements,
            timestamp,
            orderId, // Optional
        } = body;

        const connectionId = uuidv4();
        const eventTimestamp = timestamp || Date.now();

        const params = {
            TableName: TABLE_NAME,
            Item: {
                connectionId,
                userId: userId || 'anonymous',
                courseId: courseId || 'unknown',
                page: page || 'unknown',
                role: role || 'unknown',
                os: os || 'unknown',
                browser: browser || 'unknown',
                device: device || 'unknown',
                agoraVersion: agoraVersion || 'unknown',
                systemRequirements: systemRequirements || null,
                timestamp: eventTimestamp,
                orderId: orderId || null,
                createdAt: new Date(eventTimestamp).toISOString(),
            },
        };

        await docClient.send(new PutCommand(params));

        return NextResponse.json({ ok: true, connectionId });
    } catch (error) {
        console.error('Error logging Agora connection:', error);
        return NextResponse.json({ ok: false, error: 'Failed to record connection log' }, { status: 500 });
    }
}
