import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { db, sqlite } from './db.js';

// リバースプロキシ（Ingress など）越しでも元の IP を使う
const clientIp = (c) =>
  c.req.header('x-forwarded-for')?.split(',')[0].trim() || getConnInfo(c).remote.address || '';

const app = new Hono();
app.use(logger());
app.route('/', createApp({ db, title: process.env.BBS_TITLE, salt: process.env.BBS_SALT, clientIp }));

// 本番時はビルド済みクライアントを配信（API 以外の未知のパスは index.html）
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(dist)) {
  app.use('*', serveStatic({ root: dist }));
  app.get('*', serveStatic({ root: dist, path: 'index.html' }));
}

const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: '0.0.0.0' },
  ({ port }) => console.log(`http://localhost:${port} で起動しました`));

// Docker / Kubernetes の停止シグナルで新しいリクエストの受付を止め、DB を閉じてから終了
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    console.log(`${signal} を受信したため終了します`);
    server.close(() => {
      sqlite.close();
      process.exit(0);
    });
  });
}
