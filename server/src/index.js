import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { parseName, posterId, hashPassword, verifyPassword } from './util.js';

const MAX_POSTS = 1000;
const BBS_TITLE = process.env.BBS_TITLE ?? 'なんでも掲示板＠あの頃';
const app = Fastify({ logger: true, trustProxy: true });

const postBody = {
  type: 'object',
  required: ['body'],
  properties: {
    name: { type: 'string', maxLength: 64 },
    email: { type: 'string', maxLength: 64 },
    body: { type: 'string', minLength: 1, maxLength: 4000 },
    password: { type: 'string', maxLength: 64 },
  },
};

const toPublic = (p) => ({
  num: p.num,
  id: p.id,
  name: p.deleted ? 'あぼーん' : p.name,
  trip: p.deleted ? null : p.trip,
  email: p.deleted ? 'あぼーん' : p.email,
  body: p.deleted ? 'あぼーん' : p.body,
  posterId: p.deleted ? '???' : p.poster_id,
  deleted: !!p.deleted,
  createdAt: p.created_at,
});

const insertPost = db.prepare(`
  INSERT INTO posts (thread_id, num, name, trip, email, body, poster_id, password, created_at)
  VALUES (@threadId, @num, @name, @trip, @email, @body, @posterId, @password, @createdAt)
`);

const addPost = (threadId, req) => {
  const now = new Date().toISOString();
  const { name, trip } = parseName(req.body.name);
  const email = (req.body.email ?? '').trim();
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?').get(threadId);
  if (n >= MAX_POSTS) return null;
  insertPost.run({
    threadId,
    num: n + 1,
    name,
    trip,
    email,
    body: req.body.body.replace(/\r\n?/g, '\n').trimEnd(),
    posterId: posterId(req.ip),
    password: hashPassword(req.body.password),
    createdAt: now,
  });
  if (email !== 'sage') db.prepare('UPDATE threads SET bumped_at = ? WHERE id = ?').run(now, threadId);
  return n + 1;
};

// スレッド一覧
app.get('/api/threads', async () =>
  db.prepare(`
    SELECT t.id, t.title, t.created_at AS createdAt, t.bumped_at AS bumpedAt, COUNT(p.id) AS postCount
    FROM threads t JOIN posts p ON p.thread_id = t.id
    GROUP BY t.id ORDER BY t.bumped_at DESC
  `).all());

// スレッド作成
app.post('/api/threads', {
  schema: {
    body: {
      ...postBody,
      required: ['title', 'body'],
      properties: { ...postBody.properties, title: { type: 'string', minLength: 1, maxLength: 96 } },
    },
  },
}, async (req, reply) => {
  const title = req.body.title.trim();
  if (!title || !req.body.body.trim()) return reply.code(400).send({ error: 'タイトルと本文を入力してください' });
  const now = new Date().toISOString();
  const id = db.transaction(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO threads (title, created_at, bumped_at) VALUES (?, ?, ?)').run(title, now, now);
    addPost(lastInsertRowid, req);
    return Number(lastInsertRowid);
  })();
  return reply.code(201).send({ id });
});

// スレッド詳細
app.get('/api/threads/:id', async (req, reply) => {
  const thread = db.prepare('SELECT id, title, created_at AS createdAt FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return reply.code(404).send({ error: 'そんな板orスレッドないです。' });
  const posts = db.prepare('SELECT * FROM posts WHERE thread_id = ? ORDER BY num').all(thread.id).map(toPublic);
  return { ...thread, posts, maxPosts: MAX_POSTS };
});

// レス投稿
app.post('/api/threads/:id/posts', { schema: { body: postBody } }, async (req, reply) => {
  if (!req.body.body.trim()) return reply.code(400).send({ error: '本文がありません！' });
  const thread = db.prepare('SELECT id FROM threads WHERE id = ?').get(req.params.id);
  if (!thread) return reply.code(404).send({ error: 'そんな板orスレッドないです。' });
  const num = db.transaction(() => addPost(thread.id, req))();
  if (!num) return reply.code(409).send({ error: `このスレッドは${MAX_POSTS}を超えました。もう書けないので、新しいスレッドを立ててくださいです。。。` });
  return reply.code(201).send({ num });
});

// レス削除（あぼーん）
app.post('/api/posts/:id/delete', {
  schema: { body: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } } },
}, async (req, reply) => {
  const post = db.prepare('SELECT id, password, deleted FROM posts WHERE id = ?').get(req.params.id);
  if (!post || post.deleted) return reply.code(404).send({ error: '該当するレスがありません' });
  if (!verifyPassword(req.body.password, post.password)) return reply.code(403).send({ error: '削除キーが違います' });
  db.prepare('UPDATE posts SET deleted = 1 WHERE id = ?').run(post.id);
  return { ok: true };
});

// 掲示板の設定
app.get('/api/config', async () => ({ title: BBS_TITLE }));

// アクセスカウンター
app.post('/api/counter', async () =>
  db.prepare('UPDATE counter SET count = count + 1 WHERE id = 1 RETURNING count').get());

// 本番時はビルド済みクライアントを配信
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api') ? reply.code(404).send({ error: 'Not Found' }) : reply.sendFile('index.html'));
}

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });

// Docker / Kubernetes の停止シグナルで新しいリクエストの受付を止め、DB を閉じてから終了
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    app.log.info(`${signal} を受信したため終了します`);
    await app.close();
    db.close();
    process.exit(0);
  });
}
