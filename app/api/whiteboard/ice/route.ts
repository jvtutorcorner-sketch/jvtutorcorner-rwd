import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { fetchIceServers } from '@/lib/realtime/ice';

// Short-lived ICE servers for the whiteboard's P2P DataChannel transport. Reuses the
// shared ICE module (Cloudflare TURN minting + guaranteed UDP/TCP/TLS-443 coverage),
// but reads the TURN env directly so the whiteboard still works when the SFU app
// itself is not configured — it just falls back to Cloudflare STUN. TURN and SFU
// share the free 1TB egress. `degraded: true` means only STUN was available (the
// client should warn: relay-only networks will fail).
const ICE_TTL_SEC = 600;

async function handleGet(_req: AuthedRequest) {
  const turnKeyId = process.env.CF_TURN_KEY_ID?.trim() || null;
  const turnKeyApiToken = process.env.CF_TURN_KEY_API_TOKEN?.trim() || null;
  const { iceServers, degraded } = await fetchIceServers({ turnKeyId, turnKeyApiToken }, ICE_TTL_SEC);
  if (degraded) console.warn('[WB ICE] degraded to STUN-only (no usable TURN)');
  return new Response(JSON.stringify({ ok: true, iceServers, degraded, ttlSec: ICE_TTL_SEC }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export const GET = withAuth(handleGet);
