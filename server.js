const path = require('node:path');
const express = require('express');

require('./src/env.js').load(); // до остальных модулей: они читают process.env при загрузке

const store = require('./src/db');
const auth = require('./src/auth');
const api = require('./src/api');
const pages = require('./src/pages');
const events = require('./src/events');

store.load();
auth.seedAdmin();

// Пустая доска выглядит сломанной, поэтому при первом запуске кладём одну
// демо-плашку. Отключить: SEED_DEMO=0. Удалить её можно в /admin.
if (process.env.SEED_DEMO !== '0' && !store.db.nicknames.length && !store.db.items.length) {
  const bear = { id: store.uid('n_'), name: 'Монокума', about: 'Ультимативный медведь', avatar: '', order: 0, hidden: false };
  store.db.nicknames.push(bear);
  store.db.items.push({
    id: store.uid('i_'),
    nicknameId: bear.id,
    title: 'Демо-дело: так выглядит плашка',
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    reason: 'troll',
    description: 'Тестовая запись, чтобы посмотреть оформление. Удали её в панели трибунала.',
    tags: ['демо'],
    order: 0,
    hidden: false,
    createdAt: Date.now(),
    votes: [],
  });
  store.saveSync();
  console.log('[seed] добавлена демо-плашка «Монокума» (удаляется в /admin)');
}

const app = express();
// Botkeep не пробрасывает PORT в контейнер: приложение обязано слушать выданный
// серверу порт (Overview → Port). Сменился порт — править значение здесь или в Startup.
const PORT = Number(process.env.PORT) || Number(process.env.SERVER_PORT) || 34086;
const HOST = process.env.HOST || '0.0.0.0';
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

/** Страница доступна и в корне, и под префиксом, если он задан. */
const withBase = (route) => (BASE_PATH ? [route, `${BASE_PATH}${route}`] : [route]);

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

app.use((req, res, next) => {
  const prefix = (req.headers['x-forwarded-prefix'] || BASE_PATH).replace(/\/+$/, '');
  req.basePath = prefix === '/' ? '' : prefix;
  next();
});

const staticOpts = { maxAge: '1h' };
app.use('/public', express.static(path.join(__dirname, 'public'), staticOpts));
if (BASE_PATH) app.use(`${BASE_PATH}/public`, express.static(path.join(__dirname, 'public'), staticOpts));

app.use(auth.session);
app.use('/api', api);
if (BASE_PATH) app.use(`${BASE_PATH}/api`, api);

const html = (res, body) => res.set('Content-Type', 'text/html; charset=utf-8').send(body);

app.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get(withBase('/'), (req, res) => html(res, pages.index({ base: req.basePath })));

app.get(withBase('/admin/login'), (req, res) => {
  if (req.user) return res.redirect(`${req.basePath}/admin`);
  html(res, pages.login({ base: req.basePath }));
});

app.post(
  withBase('/admin/login'),
  (req, res, next) => {
    if (!auth.rateLimit(`login:${req.ip}`, 10, 60_000)) {
      return html(res, pages.login({ base: req.basePath, error: 'Слишком много попыток, подожди минуту' }));
    }
    next();
  },
  (req, res) => {
    const nick = String(req.body.nick || '').trim();
    const password = String(req.body.password || '');
    const user = store.db.users.find((u) => u.nick.toLocaleLowerCase('ru') === nick.toLocaleLowerCase('ru'));
    if (!user || !auth.verifyPassword(password, user.salt, user.passHash)) {
      return html(res, pages.login({ base: req.basePath, error: 'Неверный ник или пароль' }));
    }
    auth.login(res, user);
    res.redirect(`${req.basePath}/admin`);
  }
);

app.post(withBase('/admin/logout'), (req, res) => {
  auth.logout(res, req.basePath);
  res.redirect(`${req.basePath}/`);
});

app.get(withBase('/admin'), (req, res) => {
  if (!req.user) return res.redirect(`${req.basePath}/admin/login`);
  html(res, pages.admin({ base: req.basePath }));
});

app.use((req, res) => res.status(404).send('404'));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[http]', err.message);
  res.status(500).json({ error: 'Внутренняя ошибка' });
});

setInterval(() => {
  for (const client of events.live()) client.write(': ping\n\n');
}, 25_000).unref();

app.listen(PORT, HOST, () => {
  console.log(`video-board on http://${HOST}:${PORT}${BASE_PATH || '/'} (db: ${store.FILE})`);
});
