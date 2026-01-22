import { ddbDocClient } from './dynamo';
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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
      ConsistentRead: true, // CRITICAL: Force strongly consistent read to see recent writes immediately
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
    console.log('[WhiteboardService] Saving state to DynamoDB (Put):', { uuid, strokeCount: strokes.length, hasPdf: !!pdf });
    const startTime = Date.now();
    await ddbDocClient.send(new PutCommand(params));
    const duration = Date.now() - startTime;
    console.log('[WhiteboardService] State saved successfully (Put):', { uuid, strokeCount: strokes.length, duration: `${duration}ms` });
  } catch (error) {
    console.error('[WhiteboardService] Error saving state:', { uuid, error: String(error) });
  }
}

/**
 * ATOMIC: Adds a stroke to the strokes list without reading the whole item first.
 * Prevents race conditions in high-frequency environments like AWS Lambda.
 */
export async function addStrokeAtomic(uuid: string, stroke: any): Promise<void> {
  try {
    const now = Date.now();
    const ttl = Math.floor(now / 1000) + TTL_SECONDS;
    const params = {
      TableName: TABLE_NAME,
      Key: { id: uuid },
      UpdateExpression: 'SET strokes = list_append(if_not_exists(strokes, :empty_list), :new_stroke), updatedAt = :now, #ttl = :ttl',
      ExpressionAttributeNames: {
        '#ttl': 'ttl'
      },
      ExpressionAttributeValues: {
        ':new_stroke': [stroke], // list_append expects a list
        ':empty_list': [],
        ':now': now,
        ':ttl': ttl
      }
    };
    await ddbDocClient.send(new UpdateCommand(params));
    console.log('[WhiteboardService] Atomic stroke added:', { uuid, strokeId: stroke.id });
  } catch (error) {
    console.error('[WhiteboardService] Error in addStrokeAtomic:', { uuid, error: String(error) });
    // Fallback if update fails (e.g. attribute type mismatch if strokes wasn't a list)
    await saveWhiteboardState(uuid, [stroke], null);
  }
}

/**
 * ATOMIC: Updates an existing stroke by finding it in the list.
 * Note: DDB doesn't support "update item in list where id=X" easily without knowing the index.
 * So we still might need to read-modify for updates, OR we just append a NEW update event.
 * For now, we'll keep it simple: Read-Modify for updates but use ATOMIC for starts.
 */
export async function updateStrokeInList(uuid: string, strokeId: string, points: number[]): Promise<void> {
  try {
    const state = await getWhiteboardState(uuid);
    if (!state) return;
    const strokes = [...(state.strokes || [])];
    const idx = strokes.findIndex((s: any) => s.id === strokeId);
    if (idx >= 0) {
      strokes[idx].points = points;
      await saveWhiteboardState(uuid, strokes, state.pdf);
    }
  } catch (error) {
    console.error('[WhiteboardService] Error in updateStrokeInList:', error);
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
