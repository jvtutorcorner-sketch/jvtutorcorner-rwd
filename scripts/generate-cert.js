const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
}

async function generate(opts = {}) {
  const outDir = path.resolve(process.cwd(), '.cert');
  ensureDir(outDir);

  const attrs = [{ name: 'commonName', value: opts.commonName || 'localhost' }];
  const altNames = opts.altNames || ['localhost'];
  const altNamesExt = altNames.map((n) => {
    // if looks like an IP address, use type 7 (IP), otherwise type 2 (DNS)
    const isIP = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(n) || n.includes(':');
    return { type: isIP ? 7 : 2, value: n };
  });

  let pems;
  try {
    pems = selfsigned.generate(attrs, { 
      days: 3650, 
      algorithm: 'sha256', 
      extensions: [{ name: 'subjectAltName', altNames: altNamesExt }] 
    });
    
    if (pems instanceof Promise) {
      pems = await pems;
    }
  } catch (e) {
    console.warn('Generation with extensions failed:', e.message);
  }

  // If pems is missing or doesn't have the required keys, try a simple generation
  if (!pems || (!pems.private && !pems.privateKey && !pems.private_key)) {
    pems = selfsigned.generate(attrs, { days: 3650, algorithm: 'sha256' });
    if (pems instanceof Promise) {
      pems = await pems;
    }
  }

  const privateKey = pems.private || pems.privateKey || pems.private_key;
  const certificate = pems.cert || pems.public || pems.publicKey;

  if (!privateKey || !certificate) {
    throw new Error('Failed to generate valid certificate: private key or certificate is missing.');
  }

  const keyPath = path.join(outDir, 'dev-key.pem');
  const certPath = path.join(outDir, 'dev-cert.pem');
  fs.writeFileSync(keyPath, privateKey);
  fs.writeFileSync(certPath, certificate);

  return { keyPath, certPath };
}

if (require.main === module) {
  // When run directly, generate default certs for localhost and common local IPs
  (async () => {
    const alt = ['localhost', '127.0.0.1', '::1', '192.168.79.1'];
    try {
      const res = await generate({ commonName: 'localhost', altNames: alt });
      console.log('Generated dev certs:', res);
    } catch (err) {
      console.error('Failed to generate certs:', err);
      process.exit(1);
    }
  })();
}

module.exports = { generate };
