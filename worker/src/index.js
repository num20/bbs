import { createApp } from '../../server/src/app.js';

let app;

export default {
  fetch: (req, env, ctx) => {
    app ??= createApp({
      db: env.DB,
      title: env.BBS_TITLE,
      salt: env.BBS_SALT,
      clientIp: (c) => c.req.header('cf-connecting-ip') ?? '',
    });
    return app.fetch(req, env, ctx);
  },
};
