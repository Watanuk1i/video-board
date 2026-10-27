const crypto = require('node:crypto');
const { db, uid, saveSync } = require('./db');

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET is not set — sessions die on every restart.');
}

const COOKIE = 'vb_session';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function makeToken(userId) {
  const body = `${userId}.${Date.now() + MAX_AGE_MS}`;
  return `${body}.${sign(body)}`;
}

function readToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = sign(body);
  const given = parts[2];
  if (given.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return parts[0];
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const a = Buffer.from(hashPassword(password, salt).hash, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function session(req, res, next) {
  req.cookies = parseCookies(req);
  const userId = readToken(req.cookies[COOKIE]);
  req.user = userId ? db.users.find((u) => u.id === userId) || null : null;
  req.isAdmin = !!req.user && req.user.role === 'admin';
  next();
}

function login(res, user) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${makeToken(user.id)}; Path=/; Max-Age=${MAX_AGE_MS / 1000}; HttpOnly; SameSite=Lax`
  );
}

function logout(res, basePath = '') {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=${basePath || '/'}; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function seedAdmin() {
  if (db.users.some((u) => u.role === 'admin')) return;
  const nick = process.env.ADMIN_NICK || 'admin';
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    console.log(`[auth] no ADMIN_PASSWORD — created admin "${nick}" with password: ${password}`);
  }
  const { salt, hash } = hashPassword(password);
  db.users.push({
    id: uid('u_'),
    nick,
    role: 'admin',
    salt,
    passHash: hash,
    createdAt: Date.now(),
  });
  saveSync();
}

const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

module.exports = {
  COOKIE,
  session,
  login,
  logout,
  seedAdmin,
  hashPassword,
  verifyPassword,
  rateLimit,
};
