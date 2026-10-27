const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FONTS =
  'https://fonts.googleapis.com/css2?family=Russo+One&family=Oswald:wght@400;600;700&family=Rubik:wght@400;500;700&display=swap';

function shell({ base, title, body, scripts = [], className = '' }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0d">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${base}/public/styles.css">
</head>
<body class="${className}" data-base="${esc(base)}">
<div class="fx-noise" aria-hidden="true"></div>
<div class="fx-scan" aria-hidden="true"></div>
${body}
${scripts.map((src) => `<script src="${base}${src}" defer></script>`).join('\n')}
</body>
</html>`;
}

const emblem = `<span class="emblem" aria-hidden="true"><i></i><i></i><b></b></span>`;

function index({ base }) {
  return shell({
    base,
    title: 'Shinri Trial — Доска позора',
    body: `
<header class="topbar">
  <a class="brand" href="${base}/">${emblem}<span class="brand-text"><b>SHINRI TRIAL</b><i>доска позора сервера</i></span></a>

  <div class="search">
    <input id="search" type="search" placeholder="найти ник по делу…" autocomplete="off" aria-label="Поиск по никам">
    <div id="search-results" class="search-results" hidden></div>
  </div>

  <nav class="nav">
    <button id="open-suggest" class="btn primary">Подать жалобу</button>
    <button id="toggle-tribunal" class="btn ghost mobile-only">Трибунал</button>
    <a href="${base}/admin" class="btn ghost">Админ</a>
  </nav>
</header>

<section class="hero">
  <div class="hero-title">
    <span class="kicker">классный триал · глава позора</span>
    <h1 data-text="ПРОШМОДОВКА">ПРОШМОДОВКА</h1>
    <p>Кто срывает игры, кидает тиммейтов и душит чат — попадает на доску. Доказательство = видео, приговор = голосование.</p>
  </div>
  <div class="hero-stats" id="hero-stats">
    <div class="stat"><b id="stat-players">0</b><span>игроков на доске</span></div>
    <div class="stat"><b id="stat-plates">0</b><span>доказательств</span></div>
    <div class="stat guilty"><b id="stat-guilty">0</b><span>приговорено</span></div>
  </div>
</section>

<div class="ticker" id="ticker" hidden>
  <div class="ticker-track" id="ticker-track"></div>
</div>

<main class="layout">
  <section class="board">
    <div class="section-head">
      <h2>Топ позора</h2>
      <span class="muted">по количеству дел и голосов «виновен»</span>
    </div>
    <div id="leaderboard" class="podium"></div>

    <div class="section-head">
      <h2>Личные дела</h2>
      <span class="muted">нажми на пластинку — откроется доказательство</span>
    </div>
    <div id="players" class="players"><p class="muted pad">Открываем архив трибунала…</p></div>
  </section>

  <aside class="tribunal" id="tribunal">
    <div class="panel-head">
      <h2>Трибунал</h2>
      <span id="chat-status" class="live"><i></i>эфир</span>
      <button id="close-tribunal" class="btn ghost tiny mobile-only" aria-label="Закрыть эфир">✕</button>
    </div>
    <div id="chat-log" class="chat-log" role="log" aria-live="polite"></div>
    <form id="chat-form" class="chat-form">
      <input id="chat-nick" placeholder="твой ник" maxlength="32" autocomplete="nickname">
      <input id="chat-text" placeholder="вердикт в эфир…" maxlength="300" autocomplete="off">
      <button class="btn primary" aria-label="Отправить">➤</button>
    </form>
  </aside>
</main>

<div id="suggest" class="modal" hidden role="dialog" aria-modal="true" aria-label="Подать жалобу">
  <form class="sheet" id="suggest-form">
    <div class="sheet-head"><h2>Подать жалобу</h2><button type="button" class="x" data-close aria-label="Закрыть">✕</button></div>
    <p class="hint">Жалоба без видео-доказательства не рассматривается. После проверки админом плашка появится на доске.</p>
    <label>Ник нарушителя<input name="nickname" maxlength="32" required placeholder="как в лобби"></label>
    <label>Что натворил
      <select name="reason" id="suggest-reason"></select>
    </label>
    <label>Название дела (необязательно)<input name="title" maxlength="120" placeholder="например: кинул команду в финале"></label>
    <label>Видео-доказательство<input name="videoUrl" maxlength="300" required placeholder="YouTube / Twitch / Rutube / Vimeo / mp4"></label>
    <label>Описание ситуации<textarea name="note" maxlength="500" rows="3" required placeholder="Раунд, что сделал, почему это мешает играть"></textarea></label>
    <div id="suggest-preview" class="preview"></div>
    <div class="row"><button class="btn primary wide">Отправить на трибунал</button><button type="button" class="btn ghost" data-close>Отмена</button></div>
    <p id="suggest-msg" class="msg" role="status"></p>
  </form>
</div>

<footer class="foot">
  <span>${emblem} Shinri Trial · доска позора · <a href="${base}/admin">трибунал-панель</a></span>
</footer>`,
    scripts: ['/public/app.js'],
  });
}

function login({ base, error = '' }) {
  return shell({
    base,
    title: 'Вход в трибунал',
    className: 'centered',
    body: `
<form class="sheet login" method="post" action="${base}/admin/login">
  <div class="sheet-head">${emblem}<h2>Вход в трибунал</h2></div>
  <label>Ник<input name="nick" maxlength="32" autocomplete="username" required></label>
  <label>Пароль<input name="password" type="password" maxlength="200" autocomplete="current-password" required></label>
  ${error ? `<p class="msg error">${esc(error)}</p>` : ''}
  <button class="btn primary wide">Войти</button>
  <p class="muted"><a href="${base}/">← на доску</a></p>
</form>`,
  });
}

function admin({ base }) {
  return shell({
    base,
    title: 'Панель трибунала',
    className: 'admin',
    body: `
<header class="topbar">
  <a class="brand" href="${base}/admin">${emblem}<span class="brand-text"><b>ТРИБУНАЛ</b><i>панель управления</i></span></a>
  <nav class="nav tabs">
    <button class="tab active" data-tab="players">Игроки</button>
    <button class="tab" data-tab="items">Плашки</button>
    <button class="tab" data-tab="submissions">Жалобы <span id="sub-count" class="pill"></span></button>
    <button class="tab" data-tab="moderation">Модерация</button>
    <button class="tab" data-tab="users">Доступ</button>
  </nav>
  <nav class="nav right">
    <a href="${base}/" class="btn ghost">На доску</a>
    <a href="${base}/api/admin/export" class="btn ghost">Экспорт</a>
    <form method="post" action="${base}/admin/logout"><button class="btn ghost">Выйти</button></form>
  </nav>
</header>

<main class="admin-body">
  <section data-panel="players">
    <form id="add-nickname" class="inline-form">
      <input name="name" placeholder="ник игрока" maxlength="32" required>
      <input name="about" placeholder="титул, напр. «Ультимативный обманщик»" maxlength="160">
      <input name="avatar" placeholder="URL аватара (необязательно)" maxlength="300">
      <button class="btn primary">Внести в архив</button>
    </form>
    <div id="admin-nicknames" class="stack"></div>
  </section>

  <section data-panel="items" hidden>
    <form id="add-item" class="grid-form">
      <select name="nicknameId" required></select>
      <select name="reason" id="admin-reasons" required></select>
      <input name="title" placeholder="название дела" maxlength="120" required>
      <input name="url" placeholder="ссылка на видео-доказательство" maxlength="300" required>
      <input name="description" placeholder="что произошло (1-2 предложения)" maxlength="500">
      <input name="tags" placeholder="теги через запятую" maxlength="120">
      <button class="btn primary">Добавить плашку</button>
      <span id="item-msg" class="msg"></span>
    </form>
    <div id="admin-items" class="stack"></div>
  </section>

  <section data-panel="submissions" hidden>
    <div id="admin-submissions" class="stack"></div>
  </section>

  <section data-panel="moderation" hidden>
    <h3>Активные муты</h3>
    <div id="admin-muted" class="stack"></div>
    <h3>Эфир трибунала</h3>
    <div id="admin-chat" class="stack scroll"></div>
    <h3>Вердикты в комментариях</h3>
    <div id="admin-comments" class="stack scroll"></div>
  </section>

  <section data-panel="users" hidden>
    <p class="muted">Модератор разбирает жалобы и эфир, админ — ведёт архив игроков и доступы.</p>
    <form id="add-user" class="inline-form">
      <input name="nick" placeholder="ник" maxlength="32" required>
      <input name="password" type="password" placeholder="пароль (от 6)" maxlength="200" required>
      <select name="role"><option value="moderator">модератор</option><option value="admin">админ</option></select>
      <button class="btn primary">Создать</button>
    </form>
    <div id="admin-users" class="stack"></div>
  </section>
</main>`,
    scripts: ['/public/admin.js'],
  });
}

module.exports = { index, login, admin, esc };
