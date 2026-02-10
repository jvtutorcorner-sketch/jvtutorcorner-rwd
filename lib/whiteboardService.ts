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
    console.log('[WhiteboardService] ===== QUERYING DYNAMODB =====');
    console.log('[WhiteboardService] Table:', TABLE_NAME);
    console.log('[WhiteboardService] ID (uuid):', uuid);
    const startTime = Date.now();
    const { Item } = await ddbDocClient.send(new GetCommand(params));
    const duration = Date.now() - startTime;
    if (Item) {
      console.log('[WhiteboardService] ✓ Item FOUND:', { uuid, strokeCount: (Item as any).strokes?.length || 0, hasPdf: !!(Item as any).pdf, duration: `${duration}ms` });
      if ((Item as any).pdf) {
        console.log('[WhiteboardService] PDF in item:', { name: (Item as any).pdf.name, s3Key: (Item as any).pdf.s3Key });
      }
    } else {
      console.log('[WhiteboardService] ✗ Item NOT FOUND for uuid:', uuid, `(query took ${duration}ms)`);
    }
    return Item as WhiteboardState | null;
  } catch (error) {
    console.error('[WhiteboardService] Error getting state:', { uuid, error: String(error), errorStack: (error as any)?.stack });
    return null;
  }
}

export function normalizeUuid(raw?: string | null) {
  if (!raw) return 'default';
  try {
    // 1. Trim and decode
    let dec = decodeURIComponent(raw).trim();
    
    // 2. Extract base ID by stripping common prefixes to ensure idempotency
    let baseId = dec;
    if (baseId.startsWith('course_')) {
      baseId = baseId.slice(7);
    }
    
    // 3. Special cases for session/classroom IDs - DO NOT prepend 'course_'
    // These are often already long and specific enough to be keys.
    if (baseId.startsWith('session_') || baseId.startsWith('classroom_') || baseId.includes('session_ready')) {
      return baseId;
    }
    
    // 4. Look for courseId in a query-string-like raw input
    const m = baseId.match(/[?&]courseId=([^&]+)/);
    if (m) return `course_${m[1]}`;
    
    // 5. Default: prefix short IDs to avoid collisions in DynamoDB
    if (baseId.length < 50 && !baseId.includes('/') && !baseId.includes(' ') && !baseId.includes('-')) {
      return `course_${baseId}`;
    }
    
    return baseId;
  } catch (e) {
    return (raw || 'default').trim();
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
    console.log('[WhiteboardService] ===== SAVING TO DYNAMODB =====');
    console.log('[WhiteboardService] Table:', TABLE_NAME);
    console.log('[WhiteboardService] ID (uuid):', uuid);
    console.log('[WhiteboardService] Stroke count:', strokes.length);
    console.log('[WhiteboardService] Has PDF:', !!pdf);
    if (pdf) {
      console.log('[WhiteboardService] PDF details:', { name: pdf.name, s3Key: pdf.s3Key, url: pdf.url });
    }
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
    if (!state || !state.strokes) return;
    
    const idx = state.strokes.findIndex((s: any) => s.id === strokeId);
    
    if (idx >= 0) {
      // ATOMIC UPDATE: Modify only the specific stroke to prevent overwriting concurrent additions
      // This solves the race condition where reading the full list and writing it back 
      // wipes out strokes added by addStrokeAtomic() in the interim.
      const now = Date.now();
      const params = {
        TableName: TABLE_NAME,
        Key: { id: uuid },
        UpdateExpression: `SET strokes[${idx}].points = :points, updatedAt = :now`,
        ConditionExpression: `strokes[${idx}].id = :strokeId`,
        ExpressionAttributeValues: {
          ':points': points,
          ':now': now,
          ':strokeId': strokeId
        }
      };

      try {
        await ddbDocClient.send(new UpdateCommand(params));
      } catch (err: any) {
        if (err.name === 'ConditionalCheckFailedException') {
          // If index shifted (rare), we could retry, but for high-freq updates we can skip
          console.warn('[WhiteboardService] Stroke update condition failed (index shift?), skipping', { uuid, strokeId, idx });
        } else {
          throw err;
        }
      }
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
