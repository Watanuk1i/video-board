const express = require('express');
const { db, uid, save, byId } = require('./db');
const auth = require('./auth');
const { resolve } = require('./video');
const { broadcast, subscribe } = require('./events');

const router = express.Router();

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const multiline = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const now = () => Date.now();

function ip(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').split(',')[0].trim();
}

function fail(res, code, message) {
  return res.status(code).json({ error: message });
}

function guard(limit, windowMs, key) {
  return (req, res, next) => {
    if (!auth.rateLimit(`${key}:${ip(req)}`, limit, windowMs)) {
      return fail(res, 429, 'Слишком часто. Подожди немного.');
    }
    next();
  };
}

function requireStaff(req, res, next) {
  if (!req.user) return fail(res, 401, 'Нужен вход');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) return fail(res, 403, 'Только для администратора');
  next();
}

/** Публичное представление плашки: считаем плеер из ссылки на лету. */
function publicItem(item, host) {
  const player = resolve(item.url, host);
  const nick = byId(db.nicknames, item.nicknameId);
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    tags: item.tags || [],
    provider: player.provider,
    player,
    nicknameId: item.nicknameId,
    nickname: nick ? nick.name : null,
    createdAt: item.createdAt,
  };
}

const visibleNicknames = () => db.nicknames.filter((n) => !n.hidden).sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'ru'));
const visibleItems = () => db.items.filter((i) => !i.hidden);

/* ------------------------------------------------------------------ public */

router.get('/bootstrap', (req, res) => {
  const counts = new Map();
  for (const item of visibleItems()) counts.set(item.nicknameId, (counts.get(item.nicknameId) || 0) + 1);
  res.json({
    nicknames: visibleNicknames().map((n) => ({
      id: n.id,
      name: n.name,
      about: n.about || '',
      count: counts.get(n.id) || 0,
    })),
    totals: { nicknames: db.nicknames.length, items: db.items.length, comments: db.comments.length },
  });
});

router.get('/nicknames/:id/items', (req, res) => {
  const nick = byId(db.nicknames, req.params.id);
  if (!nick || nick.hidden) return fail(res, 404, 'Не найдено');
  const items = visibleItems()
    .filter((i) => i.nicknameId === nick.id)
    .sort((a, b) => (a.order - b.order) || (b.createdAt - a.createdAt))
    .map((i) => publicItem(i, req.hostname));
  res.json({ nickname: { id: nick.id, name: nick.name, about: nick.about || '' }, items });
});

router.get('/search', (req, res) => {
  const q = text(req.query.q, 80).toLocaleLowerCase('ru');
  if (q.length < 2) return res.json({ nicknames: [], items: [] });
  const hit = (s) => String(s || '').toLocaleLowerCase('ru').includes(q);
  res.json({
    nicknames: visibleNicknames()
      .filter((n) => hit(n.name) || hit(n.about))
      .slice(0, 30)
      .map((n) => ({ id: n.id, name: n.name, about: n.about || '' })),
    items: visibleItems()
      .filter((i) => hit(i.title) || (i.tags || []).some(hit))
      .slice(0, 40)
      .map((i) => publicItem(i, req.hostname)),
  });
});

router.get('/items/:id/comments', (req, res) => {
  const list = db.comments
    .filter((c) => c.itemId === req.params.id && !c.hidden)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-200);
  res.json({ comments: list });
});

router.post('/items/:id/comments', guard(4, 60_000, 'comment'), (req, res) => {
  const item = byId(db.items, req.params.id);
  if (!item || item.hidden) return fail(res, 404, 'Плашка не найдена');
  const author = text(req.body.author, 32);
  const body = multiline(req.body.text, 600);
  if (author.length < 2 || body.length < 1) return fail(res, 400, 'Ник (от 2 символов) и текст обязательны');
  if (db.muted.some((m) => m.nick.toLocaleLowerCase('ru') === author.toLocaleLowerCase('ru') && m.until > now())) {
    return fail(res, 403, 'Возможность оставлять комментарии временно ограничена');
  }
  const comment = { id: uid('c_'), itemId: item.id, author, text: body, createdAt: now(), hidden: false };
  db.comments.push(comment);
  save();
  broadcast('comment', { itemId: item.id, comment });
  res.json({ comment });
});

router.get('/chat', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 200);
  res.json({ messages: db.chat.filter((m) => !m.hidden).slice(-limit) });
});

router.post('/chat', guard(5, 10_000, 'chat'), (req, res) => {
  const author = text(req.body.author, 32);
  const body = text(req.body.text, 300);
  if (author.length < 2) return fail(res, 400, 'Введи ник (от 2 символов)');
  if (!body) return fail(res, 400, 'Пустое сообщение');
  const key = author.toLocaleLowerCase('ru');
  const mute = db.muted.find((m) => m.nick.toLocaleLowerCase('ru') === key && m.until > now());
  if (mute) return fail(res, 403, `Мут до ${new Date(mute.until).toLocaleString('ru')}`);
  const message = { id: uid('m_'), author, text: body, createdAt: now(), hidden: false };
  db.chat.push(message);
  if (db.chat.length > 1000) db.chat.splice(0, db.chat.length - 1000);
  save();
  broadcast('chat', { message });
  res.json({ message });
});

router.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  subscribe(res);
});

router.post('/submissions', guard(5, 3600_000, 'submit'), (req, res) => {
  const nickname = text(req.body.nickname, 32);
  const url = text(req.body.videoUrl, 300);
  const title = text(req.body.title, 120);
  const note = multiline(req.body.note, 300);
  if (nickname.length < 2) return fail(res, 400, 'Укажи ник (от 2 символов)');
  if (resolve(url, req.hostname).kind === 'none') return fail(res, 400, 'Ссылка не распознана или не https');
  const submission = { id: uid('s_'), nickname, title, url, note, status: 'pending', createdAt: now() };
  db.submissions.push(submission);
  save();
  broadcast('submission', { submission });
  res.json({ ok: true, message: 'Предложение отправлено на модерацию' });
});

router.get('/video-preview', (req, res) => {
  res.json({ player: resolve(text(req.query.url, 300), req.hostname) });
});

/* -------------------------------------------------------------------- auth */

router.post('/login', guard(10, 60_000, 'login'), (req, res) => {
  const nick = text(req.body.nick, 32);
  const password = String(req.body.password ?? '').slice(0, 200);
  const user = db.users.find((u) => u.nick.toLocaleLowerCase('ru') === nick.toLocaleLowerCase('ru'));
  if (!user || !auth.verifyPassword(password, user.salt, user.passHash)) {
    return fail(res, 401, 'Неверный ник или пароль');
  }
  auth.login(res, user);
  res.json({ ok: true, nick: user.nick, role: user.role });
});

router.post('/logout', (req, res) => {
  auth.logout(res, req.basePath);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? { nick: req.user.nick, role: req.user.role } : null });
});

/* ------------------------------------------------------------------- admin */

const admin = express.Router();
admin.use(requireStaff);

admin.get('/overview', (req, res) => {
  res.json({
    nicknames: db.nicknames.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    items: db.items.map((i) => publicItem(i, req.hostname)),
    submissions: db.submissions.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 200),
    chat: db.chat.slice(-300).reverse(),
    comments: db.comments.slice(-300).reverse(),
    muted: db.muted.filter((m) => m.until > now()),
    users: db.users.map(({ salt, passHash, ...rest }) => rest),
  });
});

admin.post('/nicknames', (req, res) => {
  const name = text(req.body.name, 32);
  if (name.length < 2) return fail(res, 400, 'Название от 2 символов');
  if (db.nicknames.some((n) => n.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) {
    return fail(res, 409, 'Такой ник уже есть');
  }
  const nickname = { id: uid('n_'), name, about: text(req.body.about, 160), order: db.nicknames.length, hidden: false };
  db.nicknames.push(nickname);
  save();
  broadcast('nicknames', {});
  res.json({ nickname });
});

admin.patch('/nicknames/:id', (req, res) => {
  const nick = byId(db.nicknames, req.params.id);
  if (!nick) return fail(res, 404, 'Не найдено');
  if (req.body.name != null) {
    const name = text(req.body.name, 32);
    if (name.length < 2) return fail(res, 400, 'Название от 2 символов');
    nick.name = name;
  }
  if (req.body.about != null) nick.about = text(req.body.about, 160);
  if (req.body.order != null) nick.order = Number(req.body.order) || 0;
  if (req.body.hidden != null) nick.hidden = !!req.body.hidden;
  save();
  broadcast('nicknames', {});
  res.json({ nickname: nick });
});

admin.delete('/nicknames/:id', requireAdmin, (req, res) => {
  const nick = byId(db.nicknames, req.params.id);
  if (!nick) return fail(res, 404, 'Не найдено');
  db.nicknames = db.nicknames.filter((n) => n.id !== nick.id);
  db.items = db.items.filter((i) => i.nicknameId !== nick.id);
  save();
  broadcast('nicknames', {});
  res.json({ ok: true });
});

admin.post('/items', (req, res) => {
  const nicknameId = text(req.body.nicknameId, 40);
  const title = text(req.body.title, 120);
  const url = text(req.body.url, 300);
  if (!byId(db.nicknames, nicknameId)) return fail(res, 400, 'Выбери ник');
  if (title.length < 2) return fail(res, 400, 'Название от 2 символов');
  const player = resolve(url, req.hostname);
  if (player.kind === 'none') return fail(res, 400, 'Ссылка не распознана (нужен https)');
  const item = {
    id: uid('i_'),
    nicknameId,
    title,
    url,
    tags: String(req.body.tags || '').split(',').map((t) => text(t, 24)).filter(Boolean),
    order: db.items.length,
    hidden: false,
    createdAt: now(),
  };
  db.items.push(item);
  save();
  broadcast('items', {});
  res.json({ item: publicItem(item, req.hostname) });
});

admin.patch('/items/:id', (req, res) => {
  const item = byId(db.items, req.params.id);
  if (!item) return fail(res, 404, 'Не найдено');
  if (req.body.url != null) {
    const url = text(req.body.url, 300);
    if (resolve(url, req.hostname).kind === 'none') return fail(res, 400, 'Ссылка не распознана');
    item.url = url;
  }
  if (req.body.title != null) item.title = text(req.body.title, 120);
  if (req.body.tags != null) item.tags = String(req.body.tags).split(',').map((t) => text(t, 24)).filter(Boolean);
  if (req.body.nicknameId != null && byId(db.nicknames, req.body.nicknameId)) item.nicknameId = req.body.nicknameId;
  if (req.body.order != null) item.order = Number(req.body.order) || 0;
  if (req.body.hidden != null) item.hidden = !!req.body.hidden;
  save();
  broadcast('items', {});
  res.json({ item: publicItem(item, req.hostname) });
});

admin.delete('/items/:id', (req, res) => {
  const item = byId(db.items, req.params.id);
  if (!item) return fail(res, 404, 'Не найдено');
  db.items = db.items.filter((i) => i.id !== item.id);
  db.comments = db.comments.filter((c) => c.itemId !== item.id);
  save();
  broadcast('items', {});
  res.json({ ok: true });
});

admin.patch('/submissions/:id', (req, res) => {
  const submission = byId(db.submissions, req.params.id);
  if (!submission) return fail(res, 404, 'Не найдено');
  const status = text(req.body.status, 12);
  if (status === 'approved') {
    let nick = db.nicknames.find((n) => n.name.toLocaleLowerCase('ru') === submission.nickname.toLocaleLowerCase('ru'));
    if (!nick) {
      nick = { id: uid('n_'), name: submission.nickname, about: '', order: db.nicknames.length, hidden: false };
      db.nicknames.push(nick);
    }
    const item = { id: uid('i_'), nicknameId: nick.id, title: submission.title || submission.nickname, url: submission.url, tags: [], order: db.items.length, hidden: false, createdAt: now() };
    db.items.push(item);
    submission.status = 'approved';
    broadcast('items', {});
    broadcast('nicknames', {});
  } else if (status === 'rejected') {
    submission.status = 'rejected';
    submission.note = `${submission.note || ''}\n— ${text(req.body.note, 200)}`.trim();
  } else {
    return fail(res, 400, 'status: approved | rejected');
  }
  save();
  res.json({ submission });
});

admin.delete('/submissions/:id', (req, res) => {
  db.submissions = db.submissions.filter((s) => s.id !== req.params.id);
  save();
  res.json({ ok: true });
});

admin.delete('/chat/:id', (req, res) => {
  const message = byId(db.chat, req.params.id);
  if (!message) return fail(res, 404, 'Не найдено');
  db.chat = db.chat.filter((m) => m.id !== message.id);
  save();
  broadcast('chat-deleted', { id: message.id });
  res.json({ ok: true });
});

admin.delete('/comments/:id', (req, res) => {
  const comment = byId(db.comments, req.params.id);
  if (!comment) return fail(res, 404, 'Не найдено');
  db.comments = db.comments.filter((c) => c.id !== comment.id);
  save();
  broadcast('comment-deleted', { id: comment.id, itemId: comment.itemId });
  res.json({ ok: true });
});

admin.post('/mute', (req, res) => {
  const nick = text(req.body.nick, 32);
  const minutes = Math.max(1, Math.min(Number(req.body.minutes) || 30, 60 * 24 * 365));
  if (nick.length < 2) return fail(res, 400, 'Укажи ник');
  const until = now() + minutes * 60_000;
  const existing = db.muted.find((m) => m.nick.toLocaleLowerCase('ru') === nick.toLocaleLowerCase('ru'));
  if (existing) existing.until = until;
  else db.muted.push({ nick, until });
  save();
  res.json({ ok: true, nick, until });
});

admin.delete('/mute/:nick', (req, res) => {
  const nick = decodeURIComponent(req.params.nick).toLocaleLowerCase('ru');
  db.muted = db.muted.filter((m) => m.nick.toLocaleLowerCase('ru') !== nick);
  save();
  res.json({ ok: true });
});

admin.post('/users', requireAdmin, (req, res) => {
  const nick = text(req.body.nick, 32);
  const password = String(req.body.password ?? '');
  if (nick.length < 2 || password.length < 6) return fail(res, 400, 'Ник от 2 символов, пароль от 6');
  if (db.users.some((u) => u.nick.toLocaleLowerCase('ru') === nick.toLocaleLowerCase('ru'))) return fail(res, 409, 'Такой пользователь есть');
  const { salt, hash } = auth.hashPassword(password);
  const user = { id: uid('u_'), nick, role: req.body.role === 'admin' ? 'admin' : 'moderator', salt, passHash: hash, createdAt: now() };
  db.users.push(user);
  save();
  res.json({ user: { nick: user.nick, role: user.role } });
});

admin.delete('/users/:id', requireAdmin, (req, res) => {
  const user = byId(db.users, req.params.id);
  if (!user) return fail(res, 404, 'Не найдено');
  if (user.id === req.user.id) return fail(res, 400, 'Нельзя удалить себя');
  db.users = db.users.filter((u) => u.id !== user.id);
  save();
  res.json({ ok: true });
});

admin.get('/export', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="video-board-export.json"');
  res.end(JSON.stringify(db, null, 2));
});

router.use('/admin', admin);

module.exports = router;
