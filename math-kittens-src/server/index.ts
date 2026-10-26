// Math Kittens game server: serves the built web app and runs every online room over WebSocket.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/net';
import { Hub, type Conn } from './hub';

const argPort = process.argv.indexOf('--port');
const PORT = Number((argPort > 0 && process.argv[argPort + 1]) || process.env.PORT || 8787);
const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = [path.resolve(here, '../dist'), path.resolve(process.cwd(), 'dist')].find((d) => fs.existsSync(path.join(d, 'index.html')));
const DATA_FILE = process.env.DATA_FILE || path.resolve(process.cwd(), 'data', 'state.json');

const hub = new Hub({ dataFile: DATA_FILE });

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: hub.rooms.size, classes: hub.classes.size }));
    return;
  }
  if (url.pathname === '/api/info') {
    // Lets a page opened as "localhost" show the address other devices on the Wi-Fi should use.
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ lan: lanAddresses() }));
    return;
  }
  if (!DIST) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Математик Муурнууд сервер ажиллаж байна. Хөгжүүлэлтийн горимд вэб хуудсыг Vite-ийн хаягаар (ихэвчлэн http://localhost:5173) нээнэ үү.');
    return;
  }
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file).toLowerCase();
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });
let nextConn = 1;

wss.on('connection', (ws: WebSocket) => {
  const conn: Conn = {
    id: nextConn++,
    send(msg: ServerMessage) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  hub.connect(conn);
  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  const beat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, 20_000);
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as any).t !== 'string') return;
    hub.handle(conn, msg);
  });
  ws.on('close', () => {
    clearInterval(beat);
    hub.disconnect(conn);
  });
  ws.on('error', () => ws.close());
});

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map((a) => a!.address);
}

server.listen(PORT, () => {
  const addrs = lanAddresses();
  console.log(`\n🐱 Математик Муурнууд сервер: http://localhost:${PORT}`);
  if (DIST) for (const a of addrs) console.log(`   Нэг сүлжээнд: http://${a}:${PORT}`);
  else console.log('   (dist/ алга — хөгжүүлэлтийн горимд зөвхөн WebSocket ажиллана)');
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    hub.stop();
    process.exit(0);
  });
}
