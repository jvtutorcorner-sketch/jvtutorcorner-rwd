import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE_WHITEBOARD || 'jvtutorcorner-whiteboard';

async function updateList(uuid: string, updater: (arr: Array<any>) => Array<any>) {
  const arr = await readList(uuid);
  const updated = updater(arr);
  await writeList(uuid, updated);
  return updated;
}

async function readList(uuid: string): Promise<Array<{ role: string; userId: string; present?: boolean }>> {
  try {
    // UUID may already contain 'classroom_' prefix from frontend, use it as-is
    const id = uuid.includes('classroom_') ? uuid : `classroom_ready_${uuid}`;
    const res = await ddbDocClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id }
    }));
    if (res.Item && Array.isArray(res.Item.participants)) {
      return res.Item.participants;
    }
  } catch (e) {
    console.warn('/api/classroom/ready readList failed (DynamoDB)', e);
  }
  return [];
}

async function writeList(uuid: string, arr: Array<{ role: string; userId: string; present?: boolean }>) {
  try {
    const id = uuid.includes('classroom_') ? uuid : `classroom_ready_${uuid}`;
    
    // Use UpdateCommand to ONLY update participants, preserving other attributes like 'pdf' and 'strokes'
    await ddbDocClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET participants = :p, updatedAt = :u, #ttl = :t',
      ExpressionAttributeNames: {
        '#ttl': 'ttl'
      },
      ExpressionAttributeValues: {
        ':p': arr,
        ':u': new Date().toISOString(),
        ':t': Math.floor(Date.now() / 1000) + 3600
      }
    }));
  } catch (e) {
    console.warn('/api/classroom/ready writeList failed (DynamoDB)', e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const uuid = url.searchParams.get('uuid');
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });
    const arr = await readList(uuid);
    return NextResponse.json({ participants: arr });
  } catch (err: any) {
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { uuid, role, userId, action, present } = body || {};
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });

    if (action === 'clear-all') {
      await writeList(uuid, []);
      return NextResponse.json({ participants: [] });
    }

    if (!role) return NextResponse.json({ error: 'role required' }, { status: 400 });
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    if (!['ready', 'unready'].includes(action)) return NextResponse.json({ error: 'action must be ready, unready, or clear-all' }, { status: 400 });

    const userIdNorm = String(userId).toLowerCase().trim();

    const filtered = await updateList(uuid, (arr) => {
      const normalized = (arr || []).map((p) => ({
        role: p.role,
        userId: String(p.userId).toLowerCase().trim(),
        present: !!p.present,
      }));

      const updated = normalized.filter((p) => !(p.role === role && p.userId === userIdNorm));
      if (action === 'ready') {
        updated.push({ role, userId: userIdNorm, present: !!present });
      }

      const dedupe = new Map<string, { role: string; userId: string; present?: boolean }>();
      for (const p of updated) {
        dedupe.set(`${p.role}:${p.userId}`, p);
      }
      return Array.from(dedupe.values());
    });

    return NextResponse.json({ participants: filtered });
  } catch (err: any) {
    console.error('/api/classroom/ready error', err);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}

