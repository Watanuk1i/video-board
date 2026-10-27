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
const day = (ts) => new Date(ts).toLocaleDateString('ru', { day: '2-digit', month: 'short', year: 'numeric' });

const nick = () => (localStorage.getItem('vb_nick') || $('#chat-nick').value || '').trim();
const setNick = (v) => v && localStorage.setItem('vb_nick', v.trim());

/* ------------------------------------------------------------------ аватар */

const initials = (name) => {
  const clean = String(name).trim().replace(/^#/, '');
  return (clean.slice(0, 2) || '?').toUpperCase();
};
const hue = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

function fallbackAvatar(el, name) {
  const h = hue(name);
  el.innerHTML = `<svg viewBox="0 0 58 58" aria-hidden="true"><rect width="58" height="58" fill="hsl(${h} 40% 18%)"/><text x="29" y="37" text-anchor="middle" font-family="Oswald, sans-serif" font-size="21" font-weight="700" fill="hsl(${h} 85% 72%)">${esc(initials(name))}</text></svg>`;
}

function avatarHtml(p) {
  if (p.avatar) return `<span class="avatar" data-name="${esc(p.name)}"><img src="${esc(p.avatar)}" alt="" loading="lazy"></span>`;
  return `<span class="avatar" data-empty="1" data-name="${esc(p.name)}"></span>`;
}

/* ------------------------------------------------------------------- плеер */

function boxHtml(item) {
  const p = item.player || {};
  if (p.kind === 'iframe') {
    return `<div class="player-box" data-src="${esc(p.src)}">${p.poster ? `<img class="poster" src="${esc(p.poster)}" alt="" loading="lazy">` : ''
      }<button class="play" aria-label="Смотреть доказательство">▶</button><span class="muted kind">${esc(p.provider)}</span></div>`;
  }
  if (p.kind === 'file') {
    return `<div class="player-box"><video controls preload="metadata" src="${esc(p.src)}"></video></div>`;
  }
  if (p.kind === 'hls') {
    return `<div class="player-box raw"><p class="muted">HLS-поток: нужен плеер с HLS (Safari умеет сам).</p><a class="btn ghost small" href="${esc(p.src)}" target="_blank" rel="noopener nofollow">Открыть поток</a></div>`;
  }
  if (p.kind === 'link') {
    return `<div class="player-box raw"><p class="muted">Внешняя страница: ${esc(p.provider)}</p><a class="btn ghost small" href="${esc(p.url)}" target="_blank" rel="noopener nofollow">Смотреть source</a></div>`;
  }
  return `<div class="player-box raw"><p class="muted">Ссылка не распознана</p></div>`;
}

const VERDICT = { guilty: 'виновен', innocent: 'невиновен', trial: 'идёт суд' };

function evidenceHtml(item) {
  return `
  <article class="evidence" data-item="${esc(item.id)}" style="--accent:${esc(item.color)}">
    ${boxHtml(item)}
    <div class="evidence-body">
      <div class="evidence-head">
        <span class="chip" style="background:${esc(item.color)}">${esc(item.reasonLabel)}</span>
        <h3>${esc(item.title)}</h3>
      </div>
      ${item.description ? `<p class="evidence-desc">${esc(item.description)}</p>` : ''}
      <div class="evidence-meta">
        <span>${esc(item.provider)}</span>
        <span>${day(item.createdAt)}</span>
        ${(item.tags || []).map((t) => `<span>#${esc(t)}</span>`).join('')}
        ${item.player?.watchUrl ? `<a href="${esc(item.player.watchUrl)}" target="_blank" rel="noopener nofollow">source</a>` : ''}
      </div>
      <div class="verdict">
        <span class="label">Вердикт зала:</span>
        <button class="vote guilty" data-vote="guilty">Виновен <b>${item.guilty}</b></button>
        <button class="vote innocent" data-vote="innocent">Невиновен <b>${item.innocent}</b></button>
        <span class="stamp ${esc(item.verdict)}">${esc(VERDICT[item.verdict] || VERDICT.trial)}</span>
      </div>
      <button class="btn ghost small link-toggle">Вердикты трибунала</button>
      <div class="verdicts" hidden></div>
      <form class="comment-form">
        <input name="author" placeholder="твой ник" maxlength="32" value="${esc(nick())}">
        <input name="text" placeholder="добавить в дело…" maxlength="600">
        <button class="btn primary small" aria-label="Отправить">➤</button>
      </form>
    </div>
  </article>`;
}

function plateHtml(p, i = 0) {
  const sub = p.about || p.ultimate || 'ищет оправдание';
  return `
  <button class="plate" style="animation-delay:${Math.min(i, 12) * 45}ms" aria-expanded="false">
    ${avatarHtml(p)}
    <span class="plate-text">
      <span class="plate-nick">${esc(p.name)}</span>
      <span class="plate-sub"${p.color ? ` style="background:${esc(p.color)}"` : ''}>${esc(sub)}</span>
    </span>
    <span class="plate-side">
      <span class="plate-count${p.count >= 3 ? ' hot' : ''}">${p.count}</span>
      <span class="chev">▶</span>
    </span>
  </button>
  <div class="dossier" hidden></div>`;
}

/* -------------------------------------------------------------------- state */

const state = { players: [], reasons: {}, loaded: new Map() };

let boardTimer;
const refreshBoard = () => {
  clearTimeout(boardTimer);
  boardTimer = setTimeout(() => renderBoard().catch(() => {}), 500);
};

async function renderBoard() {
  const opening = $$('.player.open').map((n) => n.dataset.id);
  const { reasons, nicknames, leaderboard, ticker, totals } = await api('/api/bootstrap');
  state.reasons = reasons;
  state.players = nicknames.slice().sort((a, b) => b.weight - a.weight || b.count - a.count || a.name.localeCompare(b.name, 'ru'));
  state.loaded.clear();

  $('#stat-players').textContent = totals.players;
  $('#stat-plates').textContent = totals.plates;
  $('#stat-guilty').textContent = totals.guilty;
  renderTicker(ticker);
  renderLeaderboard(leaderboard);

  const box = $('#players');
  if (!state.players.length) {
    box.innerHTML = `<p class="muted pad">Архив пуст. Подайте жалобу — трибунал внесёт первого нарушителя.</p>`;
    return;
  }
  box.innerHTML = state.players
    .map((p, i) => `<div class="player" data-id="${esc(p.id)}">${plateHtml(p, i)}</div>`)
    .join('');
  $$('.avatar', box).forEach((a) => {
    if (a.dataset.empty) fallbackAvatar(a, a.dataset.name);
    const img = a.querySelector('img');
    if (img) img.addEventListener('error', () => fallbackAvatar(a, a.dataset.name));
  });
  $$('.plate', box).forEach((btn) => btn.addEventListener('click', () => togglePlayer(btn.closest('.player'))));

  for (const id of opening) {
    const node = box.querySelector(`.player[data-id="${CSS.escape(id)}"]`);
    if (node && !node.classList.contains('open')) await openPlayer(node);
  }
}

function renderTicker(list) {
  const wrap = $('#ticker');
  if (!list.length) return (wrap.hidden = true);
  const one = list
    .map((t) => `<span class="ticker-item"><i style="background:${esc(t.color)}"></i><b>${esc(t.nickname || '—')}</b><span>${esc(VERDICT[t.verdict] || '')}</span></span>`)
    .join('');
  wrap.hidden = false;
  $('#ticker-track').innerHTML = one + one;
}

function renderLeaderboard(list) {
  const box = $('#leaderboard');
  const top = list.filter((p) => p.count > 0);
  if (!top.length) {
    box.innerHTML = `<p class="muted pad">Рейтинг появится с первыми делами.</p>`;
    return;
  }
  box.innerHTML = top
    .map(
      (p, i) => `
      <button class="rank${i < 3 ? ` top${i + 1}` : ''}" data-goto="${esc(p.id)}">
        <span class="pos">${i + 1}</span>
        <span class="who"><b>${esc(p.name)}</b><span>${p.count} дел · ${p.guilty} приговорено</span></span>
        <span class="cnt">${p.weight}</span>
      </button>`
    )
    .join('');
  $$('.rank', box).forEach((b) =>
    b.addEventListener('click', () => {
      const node = $(`.player[data-id="${CSS.escape(b.dataset.goto)}"]`);
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!node.classList.contains('open')) openPlayer(node);
    })
  );
}

/* ------------------------------------------------------------------ досье */

async function togglePlayer(node) {
  if (node.classList.contains('open')) {
    closePlayer(node);
    return;
  }
  await openPlayer(node);
}

function closePlayer(node) {
  node.classList.remove('open');
  $('.plate', node).setAttribute('aria-expanded', 'false');
  $('.dossier', node).hidden = true;
}

async function openPlayer(node) {
  const id = node.dataset.id;
  node.classList.add('open');
  $('.plate', node).setAttribute('aria-expanded', 'true');
  const dossier = $('.dossier', node);
  dossier.hidden = false;
  if (!state.loaded.has(id)) dossier.innerHTML = `<p class="dossier-empty">Достаём папку с доказательствами…</p>`;
  try {
    const data = state.loaded.get(id) || (await api(`/api/nicknames/${encodeURIComponent(id)}/items`));
    state.loaded.set(id, data);
    dossier.innerHTML = data.items.length
      ? data.items.map(evidenceHtml).join('')
      : `<p class="dossier-empty">Дело заведено, но доказательств пока нет.</p>`;
    bindEvidence(dossier);
  } catch (err) {
    dossier.innerHTML = `<p class="dossier-empty">${esc(err.message)}</p>`;
  }
}

function bindEvidence(root) {
  $$('.evidence', root).forEach((card) => {
    const id = card.dataset.item;

    const play = $('.play', card);
    if (play) {
      play.addEventListener('click', () => {
        const box = $('.player-box', card);
        box.innerHTML = `<iframe src="${esc(box.dataset.src)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      });
    }

    const list = $('.verdicts', card);
    const toggle = $('.link-toggle', card);
    toggle.addEventListener('click', () => {
      list.hidden = !list.hidden;
      if (!list.hidden && !list.dataset.loaded) loadComments(card);
    });

    $$('.vote', card).forEach((btn) =>
      btn.addEventListener('click', () => vote(card, btn.dataset.vote))
    );

    const form = $('.comment-form', card);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const author = $('input[name=author]', form).value.trim();
      const text = $('input[name=text]', form).value.trim();
      if (author.length < 2) return flash(card, 'Ник от 2 символов');
      if (!text) return;
      setNick(author);
      try {
        const { comment } = await api(`/api/items/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify({ author, text }) });
        $('input[name=text]', form).value = '';
        list.dataset.loaded = '1';
        list.hidden = false;
        appendComment(list, comment);
      } catch (err) {
        flash(card, err.message);
      }
    });
  });
}

async function loadComments(card) {
  const list = $('.verdicts', card);
  try {
    const { comments } = await api(`/api/items/${encodeURIComponent(card.dataset.item)}/comments`);
    list.dataset.loaded = '1';
    list.innerHTML = comments.length ? comments.map(commentHtml).join('') : `<p class="muted">В деле пока тихо.</p>`;
    $('.link-toggle', card).textContent = `Вердикты трибунала (${comments.length})`;
  } catch {
    /* сеть */
  }
}

const commentHtml = (c) => `<p data-id="${esc(c.id)}"><b>${esc(c.author)}</b> <time>${time(c.createdAt)}</time><br>${esc(c.text)}</p>`;

function appendComment(list, comment) {
  if (list.querySelector('p.muted')) list.innerHTML = '';
  list.insertAdjacentHTML('beforeend', commentHtml(comment));
  list.scrollTop = list.scrollHeight;
}

async function vote(card, value) {
  const author = nick();
  if (author.length < 2) {
    const input = $('input[name=author]', card);
    input.focus();
    return flash(card, 'Сначала укажи ник в поле ниже');
  }
  setNick(author);
  try {
    const { guilty, innocent, verdict } = await api(`/api/items/${encodeURIComponent(card.dataset.item)}/vote`, {
      method: 'POST',
      body: JSON.stringify({ author, value }),
    });
    paintVerdict(card, { guilty, innocent, verdict });
  } catch (err) {
    flash(card, err.message);
  }
}

function paintVerdict(card, { guilty, innocent, verdict }) {
    const box = $('.verdict', card);
  $('.vote.guilty b', box).textContent = guilty;
  $('.vote.innocent b', box).textContent = innocent;
  $('.vote.guilty', box).classList.toggle('on', guilty > innocent);
  $('.vote.innocent', box).classList.toggle('on', innocent > guilty);
  const stamp = $('.stamp', box);
  stamp.className = `stamp ${verdict}`;
  stamp.textContent = VERDICT[verdict] || VERDICT.trial;
}

function flash(card, message) {
  let note = $('.flash', card);
  if (!note) {
    note = document.createElement('p');
    note.className = 'msg error flash';
    $('.evidence-body', card).append(note);
  }
  note.textContent = message;
  clearTimeout(note.timer);
  note.timer = setTimeout(() => note.remove(), 3200);
}

/* ---------------------------------------------------------------- трибунал */

const chatLine = (m) =>
  `<div class="msg-row" data-id="${esc(m.id)}"><b>${esc(m.author)}</b><span>${esc(m.text)}</span><time>${time(m.createdAt)}</time></div>`;

async function loadChat() {
  const { messages } = await api('/api/chat');
  const log = $('#chat-log');
  log.innerHTML = messages.length ? messages.map(chatLine).join('') : `<p class="chat-empty">Эфир пуст — трибунал ещё не собрался.</p>`;
  log.scrollTop = log.scrollHeight;
}

function bindChat() {
  $('#chat-nick').value = localStorage.getItem('vb_nick') || '';
  $('#chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = $('#chat-nick').value.trim();
    const text = $('#chat-text').value.trim();
    if (author.length < 2 || !text) return;
    setNick(author);
    try {
      await api('/api/chat', { method: 'POST', body: JSON.stringify({ author, text }) });
      $('#chat-text').value = '';
    } catch (err) {
      flashChat(err.message);
    }
  });
}

function flashChat(message) {
  const log = $('#chat-log');
  log.insertAdjacentHTML('beforeend', `<p class="msg error">${esc(message)}</p>`);
  setTimeout(() => $('.msg.error', log)?.remove(), 3200);
}

function bindTribunalDrawer() {
  const panel = $('#tribunal');
  const toggle = () => panel.classList.toggle('open');
  $('#toggle-tribunal').addEventListener('click', toggle);
  $('#close-tribunal').addEventListener('click', () => panel.classList.remove('open'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') panel.classList.remove('open');
  });
}

/* -------------------------------------------------------------------- поток */

function connectStream() {
  const dot = $('#chat-status');
  const es = new EventSource(`${base}/api/stream`);
  es.onopen = () => dot.classList.add('on');
  es.onerror = () => dot.classList.remove('on');

  es.addEventListener('chat', (e) => {
    const { message } = JSON.parse(e.data);
    const empty = $('#chat-log .chat-empty');
    if (empty) empty.remove();
    $('#chat-log').insertAdjacentHTML('beforeend', chatLine(message));
    $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  });
  es.addEventListener('chat-deleted', (e) => {
    const { id } = JSON.parse(e.data);
    $(`#chat-log .msg-row[data-id="${CSS.escape(id)}"]`)?.remove();
  });
  es.addEventListener('comment', (e) => {
    const { itemId, comment } = JSON.parse(e.data);
    const card = $(`.evidence[data-item="${CSS.escape(itemId)}"]`);
    if (!card) return;
    const list = $('.verdicts', card);
    if (!list.hidden) appendComment(list, comment);
  });
  es.addEventListener('comment-deleted', (e) => {
    const { id } = JSON.parse(e.data);
    $$(`.verdicts p[data-id="${CSS.escape(id)}"]`).forEach((p) => p.remove());
  });
  es.addEventListener('vote', (e) => {
    const { itemId, item } = JSON.parse(e.data);
    const card = $(`.evidence[data-item="${CSS.escape(itemId)}"]`);
    if (card) paintVerdict(card, item);
  });
  es.addEventListener('items', refreshBoard);
  es.addEventListener('nicknames', refreshBoard);
}

/* ------------------------------------------------------------------- жалоба */

function bindSuggest() {
  const modal = $('#suggest');
  const select = $('#suggest-reason');

  function open() {
    modal.hidden = false;
    if (!select.options.length) {
      select.innerHTML = Object.entries(state.reasons)
        .map(([key, r]) => `<option value="${esc(key)}">${esc(r.label)}</option>`)
        .join('');
    }
    $('input[name=nickname]', modal).focus();
  }
  $('#open-suggest').addEventListener('click', open);
  $$('[data-close]', modal).forEach((b) => b.addEventListener('click', () => (modal.hidden = true)));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
  });

  let timer;
  $('input[name=videoUrl]', modal).addEventListener('input', (e) => {
    clearTimeout(timer);
    const box = $('#suggest-preview');
    timer = setTimeout(async () => {
      const url = e.target.value.trim();
      if (url.length < 8) return (box.innerHTML = '');
      try {
        const { player } = await api(`/api/video-preview?url=${encodeURIComponent(url)}`);
        if (player.kind === 'none') {
          box.innerHTML = `<p class="msg error">Трибунал не распознаёт такую ссылку</p>`;
        } else if (player.kind === 'iframe') {
          box.innerHTML = `<p class="muted">Источник: ${esc(player.provider)}</p><div class="player-box"><iframe src="${esc(player.src)}" allow="autoplay; fullscreen" allowfullscreen></iframe></div>`;
        } else {
          box.innerHTML = `<p class="muted">Источник: ${esc(player.provider)}</p>${boxHtml({ player })}`;
        }
      } catch {
        /* ignore */
      }
    }, 420);
  });

  $('#suggest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    setNick(body.nickname);
    try {
      const { message } = await api('/api/submissions', { method: 'POST', body: JSON.stringify(body) });
      $('#suggest-msg').classList.remove('error');
      $('#suggest-msg').textContent = message;
      e.target.reset();
      $('#suggest-preview').innerHTML = '';
    } catch (err) {
      $('#suggest-msg').classList.add('error');
      $('#suggest-msg').textContent = err.message;
    }
  });
}

/* -------------------------------------------------------------------- поиск */

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
        [
          ...nicknames.map((n) => `<button class="res" data-nick="${esc(n.id)}">▸ <b>${esc(n.name)}</b> <span class="muted">${esc(n.about)}</span></button>`),
          ...items.map((i) => `<button class="res" data-nick="${esc(i.nicknameId)}" data-item="${esc(i.id)}">▸ <b>${esc(i.title)}</b> <span class="muted">${esc(i.nickname || '')} · ${esc(i.reasonLabel)}</span></button>`),
        ].join('') || `<p class="muted pad">Ничего не найдено.</p>`;
      $$('[data-nick]', box).forEach((btn) =>
        btn.addEventListener('click', async () => {
          box.hidden = true;
          input.value = '';
          const node = $(`.player[data-id="${CSS.escape(btn.dataset.nick)}"]`);
          if (!node) return;
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (!node.classList.contains('open')) await openPlayer(node);
          if (btn.dataset.item) {
            const card = $(`.evidence[data-item="${CSS.escape(btn.dataset.item)}"]`, node);
            if (card) {
              card.classList.add('flash');
              card.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => card.classList.remove('flash'), 2400);
            }
          }
        })
      );
    }, 250);
  });
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target) && e.target !== input) box.hidden = true;
  });
}

/* --------------------------------------------------------------------- init */

(async function init() {
  bindChat();
  bindSuggest();
  bindSearch();
  bindTribunalDrawer();
  await renderBoard();
  await loadChat();
  connectStream();
})();
