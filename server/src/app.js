// API 本体。Node.js（server/src/index.js、better-sqlite3）と Cloudflare Workers（worker/src/index.js、D1）で共用する
import { Hono } from 'hono';
import { parseName, posterId, hashPassword, verifyPassword } from './util.js';

const MAX_POSTS = 1000;
const NO_THREAD = 'そんな板orスレッドないです。';

// 文字列項目の検証ルール [最大長, 必須]（空文字は各 API で個別のメッセージを返す）
const postRules = { name: [64, false], email: [64, false], body: [4000, true], password: [64, false] };
const threadRules = { ...postRules, title: [96, true] };

const isValid = (body, rules) =>
  body !== null && typeof body === 'object'
  && Object.entries(rules).every(([key, [max, required]]) => {
    const v = body[key];
    if (v === undefined) return !required;
    return typeof v === 'string' && v.length <= max;
  });

const readBody = (c) => c.req.json().catch(() => null);
const badRequest = (c) => c.json({ error: '入力内容が正しくないか、長すぎます' }, 400);

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

// db: D1Database または同じ API を持つもの（server/src/db.js）
// clientIp: (c) => 投稿者の IP
export const createApp = ({ db, title = 'なんでも掲示板＠あの頃', salt = 'change-me-bbs-salt', clientIp }) => {
  const app = new Hono();

  // 投稿の列の値（thread_id と num 以外）
  const postValues = (c, body, now) => {
    const { name, trip } = parseName(body.name, salt);
    return [
      name,
      trip,
      (body.email ?? '').trim(),
      body.body.replace(/\r\n?/g, '\n').trimEnd(),
      posterId(clientIp(c), salt),
      hashPassword(body.password),
      now,
    ];
  };

  // スレッド一覧
  app.get('/api/threads', async (c) => {
    const { results } = await db.prepare(`
      SELECT t.id, t.title, t.created_at AS createdAt, t.bumped_at AS bumpedAt, COUNT(p.id) AS postCount
      FROM threads t JOIN posts p ON p.thread_id = t.id
      GROUP BY t.id ORDER BY t.bumped_at DESC
    `).all();
    return c.json(results);
  });

  // スレッド作成（スレッドと 1 レス目を 1 トランザクションで追加）
  app.post('/api/threads', async (c) => {
    const body = await readBody(c);
    if (!isValid(body, threadRules)) return badRequest(c);
    const title = body.title.trim();
    if (!title || !body.body.trim()) return c.json({ error: 'タイトルと本文を入力してください' }, 400);
    const now = new Date().toISOString();
    const [created] = await db.batch([
      db.prepare('INSERT INTO threads (title, created_at, bumped_at) VALUES (?, ?, ?) RETURNING id').bind(title, now, now),
      db.prepare(`
        INSERT INTO posts (thread_id, num, name, trip, email, body, poster_id, password, created_at)
        VALUES (last_insert_rowid(), 1, ?, ?, ?, ?, ?, ?, ?)
      `).bind(...postValues(c, body, now)),
    ]);
    return c.json({ id: created.results[0].id }, 201);
  });

  // スレッド詳細
  app.get('/api/threads/:id', async (c) => {
    const thread = await db.prepare('SELECT id, title, created_at AS createdAt FROM threads WHERE id = ?').bind(c.req.param('id')).first();
    if (!thread) return c.json({ error: NO_THREAD }, 404);
    const { results } = await db.prepare('SELECT * FROM posts WHERE thread_id = ? ORDER BY num').bind(thread.id).all();
    return c.json({ ...thread, posts: results.map(toPublic), maxPosts: MAX_POSTS });
  });

  // レス投稿（レス番号の採番と上限の確認を 1 文で行う）
  app.post('/api/threads/:id/posts', async (c) => {
    const body = await readBody(c);
    if (!isValid(body, postRules)) return badRequest(c);
    if (!body.body.trim()) return c.json({ error: '本文がありません！' }, 400);
    const thread = await db.prepare('SELECT id FROM threads WHERE id = ?').bind(c.req.param('id')).first();
    if (!thread) return c.json({ error: NO_THREAD }, 404);
    const now = new Date().toISOString();
    const values = postValues(c, body, now);
    const posted = await db.prepare(`
      INSERT INTO posts (thread_id, num, name, trip, email, body, poster_id, password, created_at)
      SELECT ?, n + 1, ?, ?, ?, ?, ?, ?, ?
      FROM (SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?) WHERE n < ?
      RETURNING num
    `).bind(thread.id, ...values, thread.id, MAX_POSTS).first();
    if (!posted) return c.json({ error: `このスレッドは${MAX_POSTS}を超えました。もう書けないので、新しいスレッドを立ててくださいです。。。` }, 409);
    if (values[2] !== 'sage') await db.prepare('UPDATE threads SET bumped_at = ? WHERE id = ?').bind(now, thread.id).run();
    return c.json({ num: posted.num }, 201);
  });

  // レス削除（あぼーん）
  app.post('/api/posts/:id/delete', async (c) => {
    const body = await readBody(c);
    if (typeof body?.password !== 'string') return badRequest(c);
    const post = await db.prepare('SELECT id, password, deleted FROM posts WHERE id = ?').bind(c.req.param('id')).first();
    if (!post || post.deleted) return c.json({ error: '該当するレスがありません' }, 404);
    if (!verifyPassword(body.password, post.password)) return c.json({ error: '削除キーが違います' }, 403);
    await db.prepare('UPDATE posts SET deleted = 1 WHERE id = ?').bind(post.id).run();
    return c.json({ ok: true });
  });

  // 掲示板の設定
  app.get('/api/config', (c) => c.json({ title }));

  // アクセスカウンター
  app.post('/api/counter', async (c) =>
    c.json(await db.prepare('UPDATE counter SET count = count + 1 WHERE id = 1 RETURNING count').first()));

  app.all('/api/*', (c) => c.json({ error: 'Not Found' }, 404));

  return app;
};
