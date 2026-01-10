function randomString(len = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function randomAlpha(len = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function makeSvg(text: string) {
  const width = 140;
  const height = 48;
  const bg = '#f6f7fb';
  const fg = '#222';
  const jitter = (v: number) => (Math.floor(Math.random() * (v * 2)) - v);
  const chars = text.split('');
  const cx = 12;
  const fontSize = 28;
  const parts = chars.map((c, i) => {
    const x = cx + i * 24 + jitter(4);
    const y = 30 + jitter(4);
    const rotate = jitter(18);
    return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" fill="${fg}" transform="rotate(${rotate} ${x} ${y})">${c}</text>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${bg}"/><g>${parts.join('')}</g></svg>`;
}

type Entry = { value: string; expires: number };

// Use globalThis to persist store across hot reloads in dev mode and ensure singleton
function getStore(): Map<string, Entry> {
  const g = globalThis as any;
  if (!g._captchaStore) {
    g._captchaStore = new Map<string, Entry>();
  }
  return g._captchaStore;
}

const store = getStore();

export function generateCaptcha(ttlMs = 3 * 60 * 1000) {
  const value = randomAlpha(5);
  const token = (typeof (globalThis as any).crypto?.randomUUID === 'function') ? (globalThis as any).crypto.randomUUID() : randomString(32);
  const expires = Date.now() + ttlMs;
  store.set(token, { value, expires });
  const svg = makeSvg(value);
  const image = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  console.log('[captcha] generated', { token, value, expires, storeSize: store.size });
  return { token, image };
}

export function verifyCaptcha(token: string | undefined, value: string | undefined) {
  console.log('[captcha] verifying', { token, value, storeSize: store.size });
  if (!token || !value) {
    console.log('[captcha] missing token or value');
    return false;
  }
  const entry = store.get(token);
  if (!entry) {
    // If not found, log some existing tokens to see if there is a mismatch
    const tokens = Array.from(store.keys()).slice(0, 5);
    console.log('[captcha] token not found. existing tokens:', tokens);
    return false;
  }
  if (entry.expires < Date.now()) {
    console.log('[captcha] token expired');
    store.delete(token);
    return false;
  }
  const ok = entry.value.toLowerCase() === String(value).trim().toLowerCase();
  console.log('[captcha] verify result', { ok, expected: entry.value, received: value });
  if (ok) store.delete(token);
  return ok;
}

export function clearExpired() {
  const now = Date.now();
  for (const [k, v] of store.entries()) if (v.expires < now) store.delete(k);
}
