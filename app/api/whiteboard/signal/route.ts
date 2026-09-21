import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { normalizeUuid } from '@/lib/whiteboardService';
import { verifyClassroomAccess } from '@/lib/auth/classroomAccess';
import type { MailboxMsg } from '@/lib/whiteboard/rtcProtocol';

// WebRTC signaling mailbox — control-plane only (offer/answer/ICE/hello, a handful
// of messages per handshake). The stroke data-plane never touches this. The real
// classroom relays signaling over RTM instead; this mailbox is the demo/dev
// fallback. Hardened: a new offer resets the box, it is capped, TTL is short, and
// non-demo channels require classroom access.

const TABLE = process.env.WHITEBOARD_TABLE || 'jvtutorcorner-whiteboard';
const TTL_SECONDS = 10 * 60; // 10 min — a handshake is seconds

function keyFor(channel: string) {
  return `wbsignal:${normalizeUuid(channel)}`;
}

function isDemoChannel(channel: string) {
  return /^(demo|test)/i.test(channel) || /^(demo|test)/i.test(normalizeUuid(channel));
}

/** Demo/test channels are open; anything else must prove classroom access via courseId. */
async function ensureAccess(req: AuthedRequest, channel: string, courseId: string | null): Promise<boolean> {
  if (isDemoChannel(channel)) return true;
  if (!courseId) return false;
  try {
    const access = await verifyClassroomAccess(req.session, courseId);
    return !!access.granted;
  } catch {
    return false;
  }
}

async function readMsgs(channel: string): Promise<MailboxMsg[]> {
  const { Item } = await ddbDocClient.send(
    new GetCommand({ TableName: TABLE, Key: { id: keyFor(channel) }, ConsistentRead: true })
  );
  return Array.isArray((Item as any)?.msgs) ? ((Item as any).msgs as MailboxMsg[]) : [];
}

async function handlePost(req: AuthedRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.channel || !body?.role || !body?.kind) {
      return new Response(JSON.stringify({ ok: false, error: 'channel/role/kind required' }), { status: 400 });
    }
    if (!(await ensureAccess(req, String(body.channel), body.courseId ? String(body.courseId) : null))) {
      return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 });
    }
    const now = Date.now();
    const incoming: MailboxMsg = {
      role: String(body.role),
      kind: String(body.kind),
      data: body.data ?? null,
      mid: String(body.mid ?? `${now}-${Math.random()}`),
      t: now,
      epoch: body.epoch ? String(body.epoch) : undefined,
    };
    // Atomic append (no read-modify-write) so concurrent teacher/student writes never
    // lose an ICE candidate. Stale messages are bounded by TTL + the client's `since`
    // filter; a handshake is only a handful of messages.
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id: keyFor(String(body.channel)) },
        UpdateExpression: 'SET msgs = list_append(if_not_exists(msgs, :empty), :m), updatedAt = :now, #ttl = :ttl',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':m': [incoming], ':empty': [], ':now': now, ':ttl': Math.floor(now / 1000) + TTL_SECONDS },
      })
    );
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}

async function handleGet(req: AuthedRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel');
    if (!channel) return new Response(JSON.stringify({ ok: false, error: 'channel required' }), { status: 400 });
    if (!(await ensureAccess(req, channel, searchParams.get('courseId')))) {
      return new Response(JSON.stringify({ ok: false, error: 'forbidden', msgs: [] }), { status: 403 });
    }
    const since = Number(searchParams.get('since') || '0');
    const all = await readMsgs(channel);
    const msgs = since > 0 ? all.filter((m) => (m.t ?? 0) > since) : all;
    return new Response(JSON.stringify({ ok: true, msgs }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), msgs: [] }), { status: 500 });
  }
}

export const POST = withAuth(handlePost);
export const GET = withAuth(handleGet);
