/**
 * Minimal Node.js HTTP server for Phase 1 token API tests.
 *
 * Implements the same /api/signaling/token endpoint logic as
 * app/api/signaling/token/route.ts so tests can run against a fresh server
 * that always has SIGNALING_TOKEN_SECRET configured — without needing to
 * restart the Next.js dev server.
 *
 * Started by playwright.phase1.config.ts on PORT (default 3001).
 */

import { createHmac } from 'node:crypto';
import http from 'node:http';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const SECRET =
  process.env.SIGNALING_TOKEN_SECRET ??
  'phase1-local-test-secret-change-in-production';
const TOKEN_LIFETIME_MS = 60_000;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  // Health check — Playwright webServer URL polling requires 200
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/signaling/token') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const channelName = String(data.channelName ?? '');
    const userId = String(data.userId ?? '');

    if (!channelName || !userId) {
      json(res, 400, { error: 'channelName and userId are required' });
      return;
    }

    const expiry = Date.now() + TOKEN_LIFETIME_MS;
    const payload = `${channelName}:${userId}:${expiry}`;
    const token =
      createHmac('sha256', SECRET).update(payload).digest('hex') + '.' + expiry;

    json(res, 200, { token, expiresAt: expiry });
  });
});

server.listen(PORT, () => {
  // Playwright detects readiness by checking the URL — log the port clearly
  console.log(`Phase 1 token test server listening on http://localhost:${PORT}`);
});
