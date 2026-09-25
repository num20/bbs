import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const b64 = (buf) => buf.toString('base64').replace(/[+/=]/g, (c) => ({ '+': '.', '/': '/', '=': '' })[c]);

// 名前欄の「名無し#キー」をトリップ「◆xxxxxxxxxx」に変換
export const parseName = (raw, salt) => {
  const input = (raw ?? '').trim();
  const idx = input.indexOf('#');
  if (idx === -1) return { name: input || '名無しさん', trip: null };
  const name = input.slice(0, idx).trim() || '名無しさん';
  const key = input.slice(idx + 1);
  const trip = key ? b64(createHash('sha1').update(salt + key).digest()).slice(0, 10) : null;
  return { name, trip };
};

// IP と日付から 1 日単位で変わる ID を生成
export const posterId = (ip, salt, now = new Date()) => {
  const day = now.toISOString().slice(0, 10);
  return b64(createHash('sha256').update(`${salt}:${ip}:${day}`).digest()).slice(0, 8);
};

export const hashPassword = (pw) => {
  if (!pw) return null;
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}`;
};

export const verifyPassword = (pw, stored) => {
  if (!pw || !stored) return false;
  const [salt, hash] = stored.split(':');
  const actual = scryptSync(pw, Buffer.from(salt, 'hex'), 32);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
};
