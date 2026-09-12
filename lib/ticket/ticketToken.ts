// lib/ticket/ticketToken.ts
// Signs/verifies the token embedded in a student's check-in ticket link (/ticket/[token]).
//
// Deliberately distinct from lib/auth/sessionManager.ts's session token: a ticket must stay
// valid for the life of a multi-week course package, so it has no expiry — it only needs to
// prove the orderId wasn't guessed/tampered with (orderId itself is already an unguessable UUID).

import crypto from 'crypto';

const TICKET_SECRET =
  process.env.TICKET_TOKEN_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.API_HMAC_SECRET ||
  'dev-insecure-ticket-secret';

export function signOrderToken(orderId: string): string {
  const sig = crypto.createHmac('sha256', TICKET_SECRET).update(orderId).digest('hex');
  return `${orderId}.${sig}`;
}

export function verifyOrderToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex <= 0) return null;
  const orderId = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  const expected = crypto.createHmac('sha256', TICKET_SECRET).update(orderId).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return null;
    }
  } catch {
    return null;
  }
  return orderId;
}
