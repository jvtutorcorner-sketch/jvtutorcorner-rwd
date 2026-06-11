import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const CONFIG_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
const CONFIG_PK = 'make-settings';

export interface MakeConfig {
  webhookUrl: string | null;
  webhookSecret: string | null;
  configured: boolean;
  source: 'db' | 'env' | 'unset';
  updatedAt: string | null;
}

export async function getMakeConfig(): Promise<MakeConfig> {
  // 1. Try DynamoDB
  if (CONFIG_TABLE) {
    try {
      const res = await ddbDocClient.send(new GetCommand({
        TableName: CONFIG_TABLE,
        Key: { id: CONFIG_PK },
      }));
      if (res.Item?.webhookUrl) {
        return {
          webhookUrl: res.Item.webhookUrl,
          webhookSecret: res.Item.webhookSecret || null,
          configured: true,
          source: 'db',
          updatedAt: res.Item.updatedAt || null,
        };
      }
    } catch (e) {
      console.warn('[makeRuntimeConfig] DynamoDB read failed', (e as any)?.message || e);
    }
  }

  // 2. Fall back to environment variables
  const webhookUrl = process.env.MAKE_WEBHOOK_URL || null;
  const webhookSecret = process.env.MAKE_WEBHOOK_SECRET || null;
  if (webhookUrl) {
    return { webhookUrl, webhookSecret, configured: true, source: 'env', updatedAt: null };
  }

  return { webhookUrl: null, webhookSecret: null, configured: false, source: 'unset', updatedAt: null };
}

export async function saveMakeConfig(webhookUrl: string, webhookSecret?: string): Promise<void> {
  if (!CONFIG_TABLE) throw new Error('App integrations table not configured');
  await ddbDocClient.send(new PutCommand({
    TableName: CONFIG_TABLE,
    Item: {
      id: CONFIG_PK,
      webhookUrl,
      webhookSecret: webhookSecret || null,
      updatedAt: new Date().toISOString(),
    },
  }));
}
