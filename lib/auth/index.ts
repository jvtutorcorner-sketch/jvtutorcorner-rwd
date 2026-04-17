// lib/auth/index.ts
// Auth 模組統一入口

export { createSession, getSession, deleteSession, extractTokenFromRequest } from './sessionManager';
export type { Session, SessionPayload } from './sessionManager';
export { computeHmac, verifyHmacRequest, verifyHmacFromHeaders, generateHmacHeaders } from './hmac';
export { withAuth, withHmac, withAdmin, withAnyAuth } from './apiGuard';
export type { AuthedRequest, ApiHandler, PlainHandler } from './apiGuard';
