import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
const ddbExplicitAccessKey = process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const ddbExplicitSecretKey = process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const ddbExplicitSessionToken = process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
const ddbExplicitCreds = ddbExplicitAccessKey && ddbExplicitSecretKey ? {
    accessKeyId: ddbExplicitAccessKey as string,
    secretAccessKey: ddbExplicitSecretKey as string,
    ...(ddbExplicitSessionToken ? { sessionToken: ddbExplicitSessionToken as string } : {})
} : undefined;

const client = new DynamoDBClient({ region: ddbRegion, credentials: ddbExplicitCreds });
const docClient = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const WEBHOOK_LOGS_TABLE = process.env.DYNAMODB_TABLE_WEBHOOK_LOGS || 'jvtutorcorner-webhook-logs';

/**
 * GET /api/line/webhook-logs
 * Query webhook logs by integrationId and optional filters
 * 
 * Query Parameters:
 * - integrationId: LINE integration ID (required)
 * - level: ERROR|WARN|INFO (optional, default: all)
 * - category: image_download_failed|image_analysis_failed|etc (optional)
 * - hoursBack: number of hours to look back (optional, default: 24)
 * - limit: max results (optional, default: 100)
 */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const integrationId = url.searchParams.get('integrationId');
        const level = url.searchParams.get('level');
        const category = url.searchParams.get('category');
        const hoursBack = parseInt(url.searchParams.get('hoursBack') || '24', 10);
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);

        if (!integrationId) {
            return NextResponse.json({
                error: 'Missing integrationId parameter',
                example: '/api/line/webhook-logs?integrationId=abc123&level=ERROR&hoursBack=24'
            }, { status: 400 });
        }

        // Calculate timestamp range
        const now = Date.now();
        const startTime = now - (hoursBack * 60 * 60 * 1000);

        // Build filter expression
        let filterExpression = 'timestamp BETWEEN :startTime AND :now';
        const expressionValues: Record<string, any> = {
            ':startTime': startTime,
            ':now': now
        };

        if (level) {
            filterExpression += ' AND #lvl = :level';
            expressionValues[':level'] = level;
        }

        if (category) {
            filterExpression += ' AND category = :category';
            expressionValues[':category'] = category;
        }

        // Query logs
        const { Items } = await docClient.send(new QueryCommand({
            TableName: WEBHOOK_LOGS_TABLE,
            KeyConditionExpression: 'integrationId = :integrationId',
            FilterExpression: filterExpression,
            ExpressionAttributeNames: level ? { '#lvl': 'level' } : undefined,
            ExpressionAttributeValues: {
                ':integrationId': integrationId,
                ...expressionValues
            },
            Limit: limit,
            ScanIndexForward: false // Sort by timestamp descending (newest first)
        }));

        return NextResponse.json({
            ok: true,
            integrationId,
            hoursBack,
            filters: { level, category },
            totalRecords: Items?.length || 0,
            logs: Items || []
        });
    } catch (error: any) {
        console.error('[GET /webhook-logs] Error:', error);
        return NextResponse.json({
            error: 'Failed to retrieve webhook logs',
            message: error?.message || String(error)
        }, { status: 500 });
    }
}
