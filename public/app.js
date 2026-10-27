const base = document.body.dataset.base || '';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const res = await fetch(base + path, {
    credentials: 'same-origin',
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const time = (ts) => new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

/* ------------------------------------------------------------------ player */

function playerHtml(p) {
  if (!p || p.kind === 'none') return `<a class="nolink" href="#" rel="noopener">ссылка не распознана</a>`;
  if (p.kind === 'iframe') {
    return `<div class="player"><iframe src="${esc(p.src)}" loading="lazy" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if (p.kind === 'file') {
    return `<div class="player"><video controls preload="metadata" src="${esc(p.src)}"></video></div>`;
  }
  if (p.kind === 'hls') {
    return `<div class="player raw"><p class="muted">HLS-поток: нужен плеер с HLS (Safari умеет сам).</p><a class="btn ghost" href="${esc(p.src)}" target="_blank" rel="noopener">Открыть поток</a></div>`;
  }
  return `<div class="player raw"><p class="muted">Внешняя страница: ${esc(p.provider)}</p><a class="btn ghost" href="${esc(p.url)}" target="_blank" rel="noopener">Смотреть source</a></div>`;
}

/* -------------------------------------------------------------------- board */

const state = { open: new Set(), items: new Map() };

async function renderBoard() {
  const { nicknames, totals } = await api('/api/bootstrap');
  $('#board-meta').textContent = `${nicknames.length} ников · ${totals.items} плашек`;
  const box = $('#nicknames');
  if (!nicknames.length) {
    box.innerHTML = `<p class="muted pad">Пока пусто. Админ может добавить ник и плашку в панели.</p>`;
    return;
  }
  box.innerHTML = nicknames
    .map(
      (n) => `
    <div class="nick" data-id="${esc(n.id)}">
      <button class="nick-head" aria-expanded="false">
        <span class="chev">▸</span>
        <span class="nick-name">${esc(n.name)}</span>
        <span class="nick-about muted">${esc(n.about)}</span>
        <span class="count">${n.count}</span>
      </button>
      <div class="nick-body" hidden></div>
    </div>`
    )
    .join('');

  $$('.nick-head').forEach((btn) => btn.addEventListener('click', () => toggleNick(btn.closest('.nick'), btn)));
}

async function toggleNick(node, btn) {
  const id = node.dataset.id;
  const body = $('.nick-body', node);
  const open = node.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(open));
  $('.chev', btn).textContent = open ? '▾' : '▸';
  if (!open) return;
  if (state.items.has(id)) {
    body.innerHTML = state.items.get(id);
    return;
  }
  body.innerHTML = `<p class="muted pad">Загрузка…</p>`;
  const { items } = await api(`/api/nicknames/${encodeURIComponent(id)}/items`);
  body.innerHTML = items.length ? items.map(cardHtml).join('') : `<p class="muted pad">Плашек пока нет.</p>`;
  state.items.set(id, body.innerHTML);
  bindCards(body);
}

function cardHtml(item) {
  return `
  <article class="card item" data-id="${esc(item.id)}">
    ${playerHtml(item.player)}
    <div class="item-body">
      <h3>${esc(item.title)}</h3>
      <p class="muted">${esc(item.provider)} · <a href="${esc(item.url)}" target="_blank" rel="noopener nofollow">источник</a></p>
      ${item.tags?.length ? `<p class="tags">${item.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</p>` : ''}
      <button class="btn ghost small toggle-comments">Комментарии <span class="cnum"></span></button>
      <div class="comments" hidden></div>
      <form class="comment-form">
        <input name="author" placeholder="ник" maxlength="32">
        <input name="text" placeholder="комментарий…" maxlength="600">
        <button class="btn">→</button>
      </form>
    </div>
  </article>`;
}

function bindCards(root) {
  $$('.item', root).forEach((card) => {
    const id = card.dataset.id;
    const list = $('.comments', card);
    const form = $('.comment-form', card);
    $('input[name=author]', form).value = localStorage.getItem('vb_nick') || '';

    async function load() {
      const { comments } = await api(`/api/items/${encodeURIComponent(id)}/comments`);
      $('.cnum', card).textContent = comments.length ? `(${comments.length})` : '';
      list.innerHTML = comments.length
        ? comments.map((c) => `<p><b>${esc(c.author)}</b> <span class="muted">${time(c.createdAt)}</span><br>${esc(c.text)}</p>`).join('')
        : `<p class="muted">Пока нет комментариев.</p>`;
    }

    $('.toggle-comments', card).addEventListener('click', () => {
      list.hidden = !list.hidden;
      if (!list.hidden && !list.innerHTML) load();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const author = $('input[name=author]', form).value.trim();
      const text = $('input[name=text]', form).value.trim();
      if (!author || !text) return;
      localStorage.setItem('vb_nick', author);
      try {
        await api(`/api/items/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify({ author, text }) });
        $('input[name=text]', form).value = '';
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

/* ------------------------------------------------------------------- chat */

function chatLine(m) {
  return `<div class="msg-row" data-id="${esc(m.id)}"><b>${esc(m.author)}</b><span>${esc(m.text)}</span><time>${time(m.createdAt)}</time></div>`;
}

async function loadChat() {
  const { messages } = await api('/api/chat');
  const log = $('#chat-log');
  log.innerHTML = messages.map(chatLine).join('');
  log.scrollTop = log.scrollHeight;
}

function connectStream() {
  const dot = $('#chat-status');
  const es = new EventSource(`${base}/api/stream`);
  es.onopen = () => dot.classList.add('on');
  es.onerror = () => dot.classList.remove('on');
  es.addEventListener('chat', (e) => {
    const { message } = JSON.parse(e.data);
    $('#chat-log').insertAdjacentHTML('beforeend', chatLine(message));
    $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  });
  es.addEventListener('chat-deleted', (e) => {
    const { id } = JSON.parse(e.data);
    $(`#chat-log .msg-row[data-id="${id}"]`)?.remove();
  });
  es.addEventListener('items', renderBoard);
  es.addEventListener('nicknames', renderBoard);
}

function bindChat() {
  const nick = $('#chat-nick');
  nick.value = localStorage.getItem('vb_nick') || '';
  $('#chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = nick.value.trim();
    const text = $('#chat-text').value.trim();
    if (!author || !text) return;
    localStorage.setItem('vb_nick', author);
    try {
      await api('/api/chat', { method: 'POST', body: JSON.stringify({ author, text }) });
      $('#chat-text').value = '';
    } catch (err) {
      alert(err.message);
    }
  });
}

/* ---------------------------------------------------------------- suggest */

function bindSuggest() {
  const modal = $('#suggest');
  $('#open-suggest').addEventListener('click', () => (modal.hidden = false));
  $$('[data-close]', modal).forEach((b) => b.addEventListener('click', () => (modal.hidden = true)));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  let timer;
  $('input[name=videoUrl]', modal).addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const url = e.target.value.trim();
      if (url.length < 8) return ($('#suggest-preview').innerHTML = '');
      try {
        const { player } = await api(`/api/video-preview?url=${encodeURIComponent(url)}`);
        $('#suggest-preview').innerHTML =
          player.kind === 'none'
            ? `<p class="msg error">Плеер не распознал ссылку</p>`
            : `<p class="muted">Источник: ${esc(player.provider)}</p>${playerHtml(player)}`;
      } catch {
        /* ignore */
      }
    }, 400);
  });

  $('#suggest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      const { message } = await api('/api/submissions', { method: 'POST', body: JSON.stringify(body) });
      $('#suggest-msg').textContent = message;
      e.target.reset();
      $('#suggest-preview').innerHTML = '';
    } catch (err) {
      $('#suggest-msg').textContent = err.message;
    }
  });
}

/* ------------------------------------------------------------------ search */

function bindSearch() {
  const input = $('#search');
  const box = $('#search-results');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) return (box.hidden = true);
      const { nicknames, items } = await api(`/api/search?q=${encodeURIComponent(q)}`);
      box.hidden = false;
      box.innerHTML =
        [...nicknames.map((n) => `<button class="res" data-nick="${esc(n.id)}">👤 ${esc(n.name)} <span class="muted">${esc(n.about)}</span></button>`),
         ...items.map((i) => `<div class="res static">${esc(i.title)} <span class="muted">${esc(i.nickname || '')} · ${esc(i.provider)}</span></div>`)].join('') ||
        `<p class="muted pad">Ничего не найдено.</p>`;
      $$('[data-nick]', box).forEach((btn) =>
        btn.addEventListener('click', () => {
          box.hidden = true;
          const node = $(`.nick[data-id="${btn.dataset.nick}"]`);
          if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (!node.classList.contains('open')) toggleNick(node, $('.nick-head', node));
          }
        })
      );
    }, 250);
  });
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target) && e.target !== input) box.hidden = true;
  });
}

/* ------------------------------------------------------------------- init */

renderBoard().then(() => {
  bindChat();
  bindSuggest();
  bindSearch();
  loadChat();
  connectStream();
});
