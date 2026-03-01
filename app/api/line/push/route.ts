import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

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

const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';

const useDynamoForApps =
    typeof APPS_TABLE === 'string' && APPS_TABLE.length > 0 &&
    (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

const useDynamoForProfiles =
    typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0 &&
    (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

/**
 * 获取 LINE 平台的集成配置（channelAccessToken）
 */
async function getLINEIntegration() {
    if (!useDynamoForApps) {
        console.warn('[LINE Push] DynamoDB for apps not enabled');
        return null;
    }

    try {
        const { Items } = await docClient.send(new ScanCommand({
            TableName: APPS_TABLE,
            FilterExpression: '#type = :type AND #status = :status',
            ExpressionAttributeNames: { '#type': 'type', '#status': 'status' },
            ExpressionAttributeValues: { ':type': 'LINE', ':status': 'ACTIVE' }
        }));
        
        if (Items && Items.length > 0) {
            return Items[0];
        }
    } catch (err) {
        console.error('[LINE Push] Error scanning apps table:', err);
    }

    return null;
}

/**
 * 根据用户邮箱获取该用户的 lineUid
 */
async function getUserLineUid(email: string) {
    if (!useDynamoForProfiles) {
        console.warn('[LINE Push] DynamoDB for profiles not enabled');
        return null;
    }

    try {
        const targetEmail = String(email).trim().toLowerCase();
        const { Items } = await docClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': targetEmail }
        }));

        if (Items && Items.length > 0 && Items[0].lineUid) {
            return Items[0].lineUid;
        }
    } catch (err) {
        console.error('[LINE Push] Error scanning profiles table:', err);
    }

    return null;
}

/**
 * 向 LINE 用户发送推送消息
 */
async function sendLinePushMessage(lineUid: string, messages: any[], channelAccessToken: string) {
    try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({ to: lineUid, messages })
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error('[LINE Push] Failed to send push message:', res.status, errorText);
            return false;
        }

        console.log('[LINE Push] Message sent successfully to', lineUid);
        return true;
    } catch (err) {
        console.error('[LINE Push] Error sending message:', err);
        return false;
    }
}

/**
 * POST /api/line/push
 * 向指定用户或所有已绑定用户发送 LINE 推送消息
 * 
 * Body:
 * {
 *   "userEmail"?: string,           // 可选：指定用户邮箱，不提供则发送给所有已绑定用户
 *   "message": string,              // 文本内容
 *   "title"?: string,               // 可选：标题（用于增强显示）
 * }
 */
export async function POST(request: Request) {
    try {
        const { userEmail, message, title } = await request.json();

        if (!message) {
            return NextResponse.json(
                { ok: false, error: 'message is required' },
                { status: 400 }
            );
        }

        // 获取 LINE 平台配置
        const lineConfig = await getLINEIntegration();
        if (!lineConfig || !lineConfig.config?.channelAccessToken) {
            console.warn('[LINE Push] LINE integration not found or not configured');
            return NextResponse.json(
                { ok: false, error: 'LINE integration not found' },
                { status: 404 }
            );
        }

        const channelAccessToken = lineConfig.config.channelAccessToken;

        // 构建消息
        const lineMessage = {
            type: 'text',
            text: title ? `【${title}】\n${message}` : message
        };

        if (userEmail) {
            // 发送给指定用户
            const lineUid = await getUserLineUid(userEmail);
            if (!lineUid) {
                return NextResponse.json(
                    { ok: false, error: `User ${userEmail} has not bound LINE` },
                    { status: 404 }
                );
            }

            const success = await sendLinePushMessage(lineUid, [lineMessage], channelAccessToken);
            return NextResponse.json({
                ok: success,
                message: success ? 'Message sent successfully' : 'Failed to send message',
                recipient: userEmail
            });
        } else {
            // 发送给所有已绑定用户（scan profiles with lineUid）
            if (!useDynamoForProfiles) {
                return NextResponse.json(
                    { ok: false, error: 'Profile service not enabled' },
                    { status: 500 }
                );
            }

            try {
                const { Items } = await docClient.send(new ScanCommand({
                    TableName: PROFILES_TABLE,
                    FilterExpression: 'attribute_exists(lineUid)',
                }));

                if (!Items || Items.length === 0) {
                    return NextResponse.json({
                        ok: true,
                        message: 'No users with LINE binding found',
                        recipientCount: 0
                    });
                }

                // 多个用户并发发送消息
                const results = await Promise.allSettled(
                    Items.map(item => sendLinePushMessage(item.lineUid, [lineMessage], channelAccessToken))
                );

                const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

                return NextResponse.json({
                    ok: true,
                    message: `Sent to ${successCount}/${Items.length} users`,
                    recipientCount: Items.length,
                    successCount
                });
            } catch (err) {
                console.error('[LINE Push] Error scanning profiles:', err);
                return NextResponse.json(
                    { ok: false, error: 'Failed to scan profiles' },
                    { status: 500 }
                );
            }
        }
    } catch (error: any) {
        console.error('[LINE Push] Error:', error);
        return NextResponse.json(
            { ok: false, error: error?.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
