#!/usr/bin/env node
const { spawn } = require('child_process');
const httpProxy = require('http-proxy');
const https = require('https');
const fs = require('fs');
const path = require('path');

async function ensureCert() {
  const gen = require('./scripts/generate-cert');
  const out = path.resolve(process.cwd(), '.cert');
  const keyPath = path.join(out, 'dev-key.pem');
  const certPath = path.join(out, 'dev-cert.pem');
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log('Generating self-signed certificate...');
    await gen.generate({ altNames: ['localhost', '127.0.0.1', '::1', '192.168.79.1', '10.133.190.1'] });
  }
  return { keyPath, certPath };
}

function spawnNext() {
  // spawn npm run dev:http
  console.log('Starting Next.js dev server on port 3001...');
  let p;
  if (process.platform === 'win32') {
    p = spawn('cmd', ['/c', 'npm run dev:http'], { stdio: 'inherit', windowsHide: false });
  } else {
    p = spawn('npm', ['run', 'dev:http'], { stdio: 'inherit' });
  }
  p.on('exit', (code) => {
    console.log('Next dev exited with', code);
    process.exit(code);
  });
  return p;
}

function isPortOpen(port, host = '127.0.0.1', timeout = 1000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    let called = false;
    socket.setTimeout(timeout);
    socket.once('error', () => { if (!called) { called = true; resolve(false); } });
    socket.once('timeout', () => { if (!called) { called = true; resolve(false); } });
    socket.connect(port, host, () => { if (!called) { called = true; socket.end(); resolve(true); } });
  });
}

async function waitForPort(port, host = '127.0.0.1', attempts = 50, delay = 200) {
  for (let i = 0; i < attempts; i++) {
    if (await isPortOpen(port, host, 200)) return true;
    await new Promise((r) => setTimeout(r, delay));
  }
  return false;
}

async function startProxy() {
  const { keyPath, certPath } = await ensureCert();
  const key = fs.readFileSync(keyPath);
  const cert = fs.readFileSync(certPath);

  // create a proxy server to forward to http://127.0.0.1:3001
  const proxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:3001', changeOrigin: true, ws: true });

  proxy.on('error', (err, req, res) => {
    console.error('Proxy error', err);
    try { res.writeHead && res.writeHead(502); res.end('Bad gateway'); } catch (e) {}
  });

  const server = https.createServer({ key, cert }, (req, res) => {
    proxy.web(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    proxy.ws(req, socket, head);
  });

  server.listen(3000, '0.0.0.0', () => {
    console.log('HTTPS proxy listening on https://0.0.0.0:3000');
    console.log('Proxying to http://127.0.0.1:3001');
    console.log('If using a remote device, import and trust .cert/dev-cert.pem on that device to allow camera/mic access.');
  });

  return server;
}

(async () => {
  const port = 3001;
  const proxyPort = 3000;

  // Check if proxy port is occupied
  const proxyOpen = await isPortOpen(proxyPort, '0.0.0.0', 200);
  if (proxyOpen) {
    console.error(`\x1b[31mError: Port ${proxyPort} is already in use.\x1b[0m`);
    console.error(`Please stop any existing 'npm run dev' or other processes using port ${proxyPort}.`);
    process.exit(1);
  }

  const open = await isPortOpen(port, '127.0.0.1', 200);
  if (open) {
    console.log('Detected existing process listening on port', port, '- will not spawn Next.');
  } else {
    spawnNext();
  }

  const ready = await waitForPort(port, '127.0.0.1', 100, 200);
  if (!ready) {
    console.error('Timed out waiting for Next dev on port', port);
    process.exit(1);
  }

  await startProxy();
})();
