import { ddbDocClient } from './dynamo';
import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.WHITEBOARD_TABLE || 'jvtutorcorner-whiteboard';
const TTL_SECONDS = 60 * 60 * 24; // 24 hours

export interface WhiteboardState {
  strokes: any[];
  pdf: any | null;
  updatedAt: number;
}

export async function getWhiteboardState(uuid: string): Promise<WhiteboardState | null> {
  try {
    const params = {
      TableName: TABLE_NAME,
      Key: { id: uuid },
    };
    const startTime = Date.now();
    const { Item } = await ddbDocClient.send(new GetCommand(params));
    const duration = Date.now() - startTime;
    if (Item) {
      console.log('[WhiteboardService] Retrieved state from DynamoDB:', { uuid, strokeCount: (Item as any).strokes?.length || 0, duration: `${duration}ms` });
    }
    return Item as WhiteboardState | null;
  } catch (error) {
    console.error('[WhiteboardService] Error getting state:', { uuid, error: String(error), errorStack: (error as any)?.stack });
    return null;
  }
}

export async function saveWhiteboardState(uuid: string, strokes: any[], pdf: any | null): Promise<void> {
  try {
    const now = Date.now();
    const ttl = Math.floor(now / 1000) + TTL_SECONDS;
    const params = {
      TableName: TABLE_NAME,
      Item: {
        id: uuid,
        strokes,
        pdf,
        updatedAt: now,
        ttl,
      },
    };
    console.log('[WhiteboardService] Saving state to DynamoDB:', { uuid, strokeCount: strokes.length, hasPdf: !!pdf, TABLE_NAME });
    const startTime = Date.now();
    await ddbDocClient.send(new PutCommand(params));
    const duration = Date.now() - startTime;
    console.log('[WhiteboardService] State saved successfully:', { uuid, strokeCount: strokes.length, duration: `${duration}ms` });
  } catch (error) {
    console.error('[WhiteboardService] Error saving state:', { uuid, error: String(error), errorStack: (error as any)?.stack });
  }
}

export async function deleteWhiteboardState(uuid: string): Promise<void> {
  try {
    const params = {
      TableName: TABLE_NAME,
      Key: { id: uuid },
    };
    await ddbDocClient.send(new DeleteCommand(params));
  } catch (error) {
    console.error('[WhiteboardService] Error deleting state:', error);
  }
}
