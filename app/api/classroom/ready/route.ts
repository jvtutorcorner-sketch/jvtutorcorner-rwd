import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE_WHITEBOARD || 'jvtutorcorner-whiteboard';
const TTL_SECONDS = 3600;

type Participant = { role: string; userId: string; present?: boolean };

function getReadyItemId(uuid: string) {
  return uuid.includes('classroom_') ? uuid : `classroom_ready_${uuid}`;
}

function memberKey(role: string, userIdNorm: string) {
  return `${role}:${userIdNorm}`;
}

function nextTtl() {
  return Math.floor(Date.now() / 1000) + TTL_SECONDS;
}

// A nested SET / REMOVE against `members.<key>` fails with ValidationException
// when the `members` map itself does not exist yet (first writer for a room).
function isMissingPathError(error: unknown) {
  const name = typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: string }).name)
    : '';
  return name === 'ValidationException';
}

function normalizeParticipant(p: unknown): Participant | null {
  if (!p || typeof p !== 'object') return null;
  const rec = p as Record<string, unknown>;
  if (!rec.role || !rec.userId) return null;
  return {
    role: String(rec.role),
    userId: String(rec.userId).toLowerCase().trim(),
    present: !!rec.present,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// R-2 fix (2026-09-16): the presence/ready state used to be a single
// `participants` array rewritten under an optimistic `version` lock. Teacher,
// student and every extra tab wrote the SAME item, so concurrent heartbeats
// collided on the version, exhausted the retry budget and returned 500 under
// load (12+ browsers). We now store one entry per participant in a `members`
// map keyed by `role:userId` and update ONLY that key. DynamoDB applies a
// nested-attribute update atomically at the item level, and two different keys
// never conflict — no version lock, no retry storm, no conflict-driven 500.
//
// GET stays backward compatible: it reads the new `members` map when present
// and falls back to the legacy `participants` array for rooms created before
// this deploy (both age out within the 1h TTL).
// ─────────────────────────────────────────────────────────────────────────────

async function readParticipants(uuid: string): Promise<Participant[]> {
  try {
    const id = getReadyItemId(uuid);
    const res = await ddbDocClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id },
      ConsistentRead: true,
    }));
    const item = res.Item;
    if (!item) return [];
    if (item.members && typeof item.members === 'object' && !Array.isArray(item.members)) {
      return Object.values(item.members as Record<string, unknown>)
        .map(normalizeParticipant)
        .filter((p): p is Participant => p !== null);
    }
    if (Array.isArray(item.participants)) {
      return (item.participants as unknown[])
        .map(normalizeParticipant)
        .filter((p): p is Participant => p !== null);
    }
  } catch (e) {
    console.warn('/api/classroom/ready readParticipants failed (DynamoDB)', e);
  }
  return [];
}

// 1.5s server-side cache: 10 browsers polling every 2s = ~5 req/sec per room.
// All hit the same UUID, so serve burst GET reads from memory instead of DynamoDB.
const readCache = new Map<string, { data: Participant[]; expiresAt: number }>();
const READ_CACHE_TTL_MS = 1500;

async function readParticipantsCached(uuid: string): Promise<Participant[]> {
  const now = Date.now();
  const cached = readCache.get(uuid);
  if (cached && now < cached.expiresAt) return cached.data;
  const data = await readParticipants(uuid);
  readCache.set(uuid, { data, expiresAt: now + READ_CACHE_TTL_MS });
  return data;
}

/** Atomically upsert one participant into the members map (conflict-free). */
async function setMember(uuid: string, participant: Participant): Promise<void> {
  const id = getReadyItemId(uuid);
  const key = memberKey(participant.role, participant.userId);
  const common = {
    TableName: TABLE_NAME,
    Key: { id },
    ExpressionAttributeNames: { '#m': 'members', '#k': key, '#ttl': 'ttl' },
    ExpressionAttributeValues: { ':p': participant, ':u': new Date().toISOString(), ':t': nextTtl() },
  };
  const setChild = new UpdateCommand({
    ...common,
    UpdateExpression: 'SET #m.#k = :p, updatedAt = :u, #ttl = :t',
  });
  try {
    await ddbDocClient.send(setChild);
  } catch (e) {
    if (!isMissingPathError(e)) throw e;
    // The `members` map does not exist yet — create it (idempotent, never
    // clobbers a map another writer just created), then set this member.
    await ddbDocClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET #m = if_not_exists(#m, :empty)',
      ExpressionAttributeNames: { '#m': 'members' },
      ExpressionAttributeValues: { ':empty': {} },
    }));
    await ddbDocClient.send(setChild);
  }
}

/** Atomically remove one participant from the members map (conflict-free). */
async function removeMember(uuid: string, role: string, userIdNorm: string): Promise<void> {
  const id = getReadyItemId(uuid);
  const key = memberKey(role, userIdNorm);
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'REMOVE #m.#k SET updatedAt = :u, #ttl = :t',
      ExpressionAttributeNames: { '#m': 'members', '#k': key, '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':u': new Date().toISOString(), ':t': nextTtl() },
    }));
  } catch (e) {
    if (!isMissingPathError(e)) throw e;
    // No members map / nothing to remove — treat as already absent.
  }
}

/** Reset the room's presence (session end). Also strips the legacy array. */
async function clearAll(uuid: string): Promise<void> {
  const id = getReadyItemId(uuid);
  await ddbDocClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { id },
    UpdateExpression: 'SET #m = :empty, updatedAt = :u, #ttl = :t REMOVE participants, #version',
    ExpressionAttributeNames: { '#m': 'members', '#ttl': 'ttl', '#version': 'version' },
    ExpressionAttributeValues: { ':empty': {}, ':u': new Date().toISOString(), ':t': nextTtl() },
  }));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const uuid = url.searchParams.get('uuid');
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });
    const participants = await readParticipantsCached(uuid);
    return NextResponse.json({ participants });
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
      await clearAll(uuid);
      readCache.delete(uuid);
      return NextResponse.json({ participants: [] });
    }

    if (!role) return NextResponse.json({ error: 'role required' }, { status: 400 });
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    if (!action || !['ready', 'unready'].includes(action)) {
      return NextResponse.json({ error: 'action must be ready, unready, or clear-all' }, { status: 400 });
    }

    const userIdNorm = String(userId).toLowerCase().trim();

    if (action === 'ready') {
      await setMember(uuid, { role, userId: userIdNorm, present: !!present });
    } else {
      await removeMember(uuid, role, userIdNorm);
    }

    readCache.delete(uuid);
    const participants = await readParticipants(uuid);
    return NextResponse.json({ participants });
  } catch (err) {
    console.error('/api/classroom/ready error', err);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}
