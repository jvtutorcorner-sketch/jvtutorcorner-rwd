import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE_WHITEBOARD || 'jvtutorcorner-whiteboard';
const MAX_UPDATE_RETRIES = 8;

type Participant = { role: string; userId: string; present?: boolean };
type ReadyItem = { participants: Participant[]; version: number };

function getReadyItemId(uuid: string) {
  return uuid.includes('classroom_') ? uuid : `classroom_ready_${uuid}`;
}

function isConditionalWriteError(error: unknown) {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name?: string }).name) : '';
  return name === 'ConditionalCheckFailedException';
}

async function readReadyItem(uuid: string): Promise<ReadyItem> {
  try {
    const id = getReadyItemId(uuid);
    const res = await ddbDocClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id }
    }));
    if (res.Item) {
      return {
        participants: Array.isArray(res.Item.participants) ? res.Item.participants : [],
        version: typeof res.Item.version === 'number' ? res.Item.version : 0,
      };
    }
  } catch (e) {
    console.warn('/api/classroom/ready readReadyItem failed (DynamoDB)', e);
  }
  return { participants: [], version: 0 };
}

async function readList(uuid: string): Promise<Participant[]> {
  const item = await readReadyItem(uuid);
  return item.participants;
}

async function writeList(uuid: string, arr: Participant[], expectedVersion: number) {
  const id = getReadyItemId(uuid);
  const nextVersion = expectedVersion + 1;

  await ddbDocClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { id },
    UpdateExpression: 'SET participants = :p, updatedAt = :u, #ttl = :t, #version = :nextVersion',
    ConditionExpression: expectedVersion === 0
      ? '(attribute_not_exists(#version) OR #version = :expectedVersion)'
      : '#version = :expectedVersion',
    ExpressionAttributeNames: {
      '#ttl': 'ttl',
      '#version': 'version',
    },
    ExpressionAttributeValues: {
      ':p': arr,
      ':u': new Date().toISOString(),
      ':t': Math.floor(Date.now() / 1000) + 3600,
      ':expectedVersion': expectedVersion,
      ':nextVersion': nextVersion,
    }
  }));
}

async function updateList(uuid: string, updater: (arr: Participant[]) => Participant[]) {
  for (let attempt = 1; attempt <= MAX_UPDATE_RETRIES; attempt++) {
    const current = await readReadyItem(uuid);
    const updated = updater(current.participants);

    try {
      await writeList(uuid, updated, current.version);
      return updated;
    } catch (e) {
      if (isConditionalWriteError(e) && attempt < MAX_UPDATE_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 25));
        continue;
      }
      console.warn('/api/classroom/ready writeList failed (DynamoDB)', e);
      throw e;
    }
  }

  throw new Error('/api/classroom/ready updateList exhausted retry budget');
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const uuid = url.searchParams.get('uuid');
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });
    const arr = await readList(uuid);
    return NextResponse.json({ participants: arr });
  } catch {
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Partial<Participant> & {
      uuid?: string;
      action?: string;
    };
    const { uuid, role, userId, action, present } = body || {};
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });

    if (action === 'clear-all') {
      const cleared = await updateList(uuid, () => []);
      return NextResponse.json({ participants: cleared });
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
  } catch (err) {
    console.error('/api/classroom/ready error', err);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}
