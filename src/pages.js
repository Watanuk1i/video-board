const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shell({ base, title, body, scripts = [], className = '' }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0d12">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${base}/public/styles.css">
</head>
<body class="${className}" data-base="${esc(base)}">
${body}
${scripts.map((src) => `<script src="${base}${src}" defer></script>`).join('\n')}
</body>
</html>`;
}

function index({ base }) {
  return shell({
    base,
    title: 'Video Board',
    body: `
<header class="topbar">
  <a class="brand" href="${base}/">Video<span>Board</span></a>
  <div class="search">
    <input id="search" type="search" placeholder="Поиск по никам, названиям, тегам…" autocomplete="off">
    <div id="search-results" class="search-results" hidden></div>
  </div>
  <nav class="nav">
    <button id="open-suggest" class="btn ghost">Предложить</button>
    <a href="${base}/admin" class="btn ghost">Админ</a>
  </nav>
</header>

<main class="layout">
  <section class="board">
    <div class="board-head">
      <h1>Ники и плашки</h1>
      <span id="board-meta" class="muted"></span>
    </div>
    <div id="nicknames" class="nicknames"><p class="muted pad">Загрузка…</p></div>
  </section>

  <aside class="side">
    <div class="card chat">
      <div class="card-head"><h2>Мини-чат</h2><span id="chat-status" class="dot"></span></div>
      <div id="chat-log" class="chat-log"></div>
      <form id="chat-form" class="chat-form">
        <input id="chat-nick" placeholder="твой ник" maxlength="32">
        <input id="chat-text" placeholder="сообщение…" maxlength="300" autocomplete="off">
        <button class="btn">→</button>
      </form>
    </div>
  </aside>
</main>

<div id="suggest" class="modal" hidden>
  <form class="modal-box" id="suggest-form">
    <h2>Предложить ник и видео</h2>
    <p class="muted">Появится на сайте после модерации админом.</p>
    <label>Ник<input name="nickname" maxlength="32" required placeholder="например NeMo"></label>
    <label>Название плашки<input name="title" maxlength="120" placeholder="необязательно"></label>
    <label>Ссылка на видео<input name="videoUrl" maxlength="300" required placeholder="YouTube / Twitch / Vimeo / Rutube / OK / mp4"></label>
    <label>Комментарий<textarea name="note" maxlength="300" rows="2"></textarea></label>
    <div id="suggest-preview" class="preview"></div>
    <div class="row"><button class="btn">Отправить</button><button type="button" class="btn ghost" data-close>Отмена</button></div>
    <p id="suggest-msg" class="msg"></p>
  </form>
</div>

<footer class="foot">
  <span>Video Board · <a href="${base}/admin">панель управления</a></span>
</footer>`,
    scripts: ['/public/app.js'],
  });
}

function login({ base, error = '' }) {
  return shell({
    base,
    title: 'Вход — Video Board',
    className: 'centered',
    body: `
<form class="modal-box login" method="post" action="${base}/admin/login">
  <h2>Вход в админ-панель</h2>
  <label>Ник<input name="nick" maxlength="32" autocomplete="username" required></label>
  <label>Пароль<input name="password" type="password" maxlength="200" autocomplete="current-password" required></label>
  ${error ? `<p class="msg error">${esc(error)}</p>` : ''}
  <button class="btn wide">Войти</button>
  <p class="muted"><a href="${base}/">← на сайт</a></p>
</form>`,
  });
}

function admin({ base }) {
  return shell({
    base,
    title: 'Админ-панель — Video Board',
    className: 'admin',
    body: `
<header class="topbar">
  <a class="brand" href="${base}/admin">Admin<span>Panel</span></a>
  <nav class="nav">
    <button class="tab active" data-tab="nicknames">Ники</button>
    <button class="tab" data-tab="items">Плашки</button>
    <button class="tab" data-tab="submissions">Предложения <span id="sub-count" class="pill"></span></button>
    <button class="tab" data-tab="moderation">Модерация</button>
    <button class="tab" data-tab="users">Доступ</button>
  </nav>
  <nav class="nav right">
    <a href="${base}/" class="btn ghost">На сайт</a>
    <a href="${base}/api/admin/export" class="btn ghost">Экспорт</a>
    <form method="post" action="${base}/admin/logout"><button class="btn ghost">Выйти</button></form>
  </nav>
</header>

<main class="admin-body">
  <section data-panel="nicknames">
    <form id="add-nickname" class="inline-form">
      <input name="name" placeholder="новый ник" maxlength="32" required>
      <input name="about" placeholder="описание (необязательно)" maxlength="160">
      <button class="btn">Добавить ник</button>
    </form>
    <div id="admin-nicknames" class="stack"></div>
  </section>

  <section data-panel="items" hidden>
    <form id="add-item" class="grid-form">
      <select name="nicknameId" required></select>
      <input name="title" placeholder="название плашки" maxlength="120" required>
      <input name="url" placeholder="ссылка на видео" maxlength="300" required>
      <input name="tags" placeholder="теги, через запятую" maxlength="120">
      <button class="btn">Добавить плашку</button>
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
    <h3>Чат</h3>
    <div id="admin-chat" class="stack scroll"></div>
    <h3>Комментарии</h3>
    <div id="admin-comments" class="stack scroll"></div>
  </section>

  <section data-panel="users" hidden>
    <p class="muted">Модератор видит модерацию и предложения, админ — всё включая удаление ников и доступов.</p>
    <form id="add-user" class="inline-form">
      <input name="nick" placeholder="ник" maxlength="32" required>
      <input name="password" type="password" placeholder="пароль (от 6)" maxlength="200" required>
      <select name="role"><option value="moderator">модератор</option><option value="admin">админ</option></select>
      <button class="btn">Создать</button>
    </form>
    <div id="admin-users" class="stack"></div>
  </section>
</main>`,
    scripts: ['/public/admin.js'],
  });
}

module.exports = { index, login, admin, esc };
