import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { broadcast } from '@/lib/classroomSSE';
import { clearRoomState } from '@/app/api/whiteboard/stream/route';

const TABLE_NAME = process.env.DYNAMODB_TABLE_WHITEBOARD || 'jvtutorcorner-whiteboard';
// Session items use 'session_' prefix so they never collide with whiteboard state or ready-list items
const sessionKey = (uuid: string) => `session_${uuid}`;

async function readSession(uuid: string): Promise<{ endTs?: number | null }> {
  try {
    const res = await ddbDocClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: sessionKey(uuid) },
    }));
    if (res.Item) {
      return { endTs: res.Item.endTs !== undefined ? (res.Item.endTs as number | null) : undefined };
    }
    // Item not found → session never written (treat as unknown, not cleared)
    return {};
  } catch (e) {
    console.warn('[session] readSession DynamoDB failed', e);
    return {};
  }
}

async function writeSession(uuid: string, obj: { endTs?: number | null }) {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    // TTL: 2 hours after write so stale sessions auto-expire
    const ttl = nowSec + 60 * 60 * 2;
    await ddbDocClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        id: sessionKey(uuid),
        endTs: obj.endTs !== undefined ? obj.endTs : null,
        updatedAt: new Date().toISOString(),
        ttl,
      },
    }));
  } catch (e) {
    console.warn('[session] writeSession DynamoDB failed', e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const uuid = url.searchParams.get('uuid');
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });
    const s = await readSession(uuid);
    return NextResponse.json({ endTs: s.endTs !== undefined ? s.endTs : undefined });
  } catch (err: any) {
    console.error('/api/classroom/session GET error', err);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { uuid, endTs, action } = body || {};
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });

    if (action === 'clear') {
      await writeSession(uuid, { endTs: null });
      // Broadcast to all SSE listeners that the class has ended
      try { broadcast(uuid, { type: 'class_ended', timestamp: Date.now() }); } catch (e) { }
      // Free in-memory whiteboard state so the server memory reclaimed immediately
      try { clearRoomState(uuid); } catch (e) { }
      return NextResponse.json({ endTs: null });
    }

    if (typeof endTs !== 'number') return NextResponse.json({ error: 'endTs required (number) or use action=clear' }, { status: 400 });

    // Allow resetting expired session: if client sends a new endTs, we just overwrite it.
    // The previous logic allowed this too, but we are making it explicit that overwriting is supported.
    // If the client logic detects expiration, it can POST a new endTs (extended time).

    await writeSession(uuid, { endTs });
    return NextResponse.json({ endTs });
  } catch (err: any) {
    console.error('/api/classroom/session POST error', err);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}
