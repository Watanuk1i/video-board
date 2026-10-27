const base = document.body.dataset.base || '';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = (ts) => new Date(ts).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function api(path, opts = {}) {
  const res = await fetch(`${base}/api${path}`, {
    credentials: 'same-origin',
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    ...opts,
  });
  if (res.status === 401) {
    location.href = `${base}/admin/login`;
    throw new Error('нет доступа');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let data = null;

/* --------------------------------------------------------------- rendering */

function row(actions) {
  return `<div class="row end">${actions}</div>`;
}
const btn = (label, kind = 'ghost') => `<button class="btn ${kind}">${label}</button>`;

function renderNicknames() {
  $('#admin-nicknames').innerHTML = data.nicknames
    .map(
      (n) => `
    <div class="arow" data-id="${esc(n.id)}">
      <input class="name" value="${esc(n.name)}" maxlength="32">
      <input class="about" value="${esc(n.about || '')}" maxlength="160" placeholder="описание">
      <span class="muted">${data.items.filter((i) => i.nicknameId === n.id).length} плашек</span>
      <label class="chk"><input type="checkbox" class="hidden" ${n.hidden ? 'checked' : ''}> скрыт</label>
      ${row(`${btn('↑','ghost')}${btn('↓','ghost')}${btn('Сохранить')}${btn('Удалить','danger')}`)}
    </div>`
    )
    .join('');

  $$('#admin-nicknames .arow').forEach((el) => {
    const id = el.dataset.id;
    const [up, down, saveBtn, del] = $$('button', el);
    const patch = (body) =>
      api(`/admin/nicknames/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(load).catch(alert);
    up.onclick = () => move(id, -1);
    down.onclick = () => move(id, 1);
    saveBtn.onclick = () => patch({ name: $('.name', el).value, about: $('.about', el).value, hidden: $('.hidden', el).checked });
    del.onclick = () => confirm('Удалить ник и все его плашки?') && api(`/admin/nicknames/${id}`, { method: 'DELETE' }).then(load).catch(alert);
  });
}

async function move(id, dir) {
  const list = data.nicknames.slice().sort((a, b) => a.order - b.order);
  const i = list.findIndex((n) => n.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i].order, list[j].order] = [list[j].order, list[i].order];
  await Promise.all([list[i], list[j]].map((n) => api(`/admin/nicknames/${n.id}`, { method: 'PATCH', body: { order: n.order }, }).catch(() => {})));
  load();
}

function renderItems() {
  const select = $('#add-item select[name=nicknameId]');
  select.innerHTML = data.nicknames.map((n) => `<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('');

  $('#admin-items').innerHTML = data.items
    .map(
      (i) => `
    <div class="arow wide" data-id="${esc(i.id)}">
      <div class="thumb">${i.player?.poster ? `<img src="${esc(i.player.poster)}" alt="">` : `<span class="muted">${esc(i.provider)}</span>`}</div>
      <div class="cols">
        <input class="title" value="${esc(i.title)}" maxlength="120">
        <input class="url" value="${esc(i.url)}" maxlength="300">
        <input class="tags" value="${esc((i.tags || []).join(', '))}" placeholder="теги через запятую" maxlength="120">
        <span class="muted">${esc(i.nickname || '—')} · ${esc(i.provider)}${i.hidden ? ' · <b>скрыта</b>' : ''}</span>
      </div>
      ${row(`${btn('Сохранить')}${btn(i.hidden ? 'Показать' : 'Скрыть','ghost')}${btn('Удалить','danger')}`)}
    </div>`
    )
    .join('');

  $$('#admin-items .arow').forEach((el) => {
    const id = el.dataset.id;
    const [saveBtn, toggle, del] = $$('button', el);
    const item = data.items.find((i) => i.id === id);
    saveBtn.onclick = () =>
      api(`/admin/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: $('.title', el).value, url: $('.url', el).value, tags: $('.tags', el).value }),
      })
        .then(load)
        .catch(alert);
    toggle.onclick = () => api(`/admin/items/${id}`, { method: 'PATCH', body: JSON.stringify({ hidden: !item.hidden }) }).then(load).catch(alert);
    del.onclick = () => confirm('Удалить плашку?') && api(`/admin/items/${id}`, { method: 'DELETE' }).then(load).catch(alert);
  });
}

function renderSubmissions() {
  const pending = data.submissions.filter((s) => s.status === 'pending');
  $('#sub-count').textContent = pending.length || '';
  $('#admin-submissions').innerHTML =
    data.submissions
      .map(
        (s) => `
    <div class="arow wide" data-id="${esc(s.id)}">
      <div class="cols">
        <b>${esc(s.nickname)} — ${esc(s.title || 'без названия')} <span class="pill ${esc(s.status)}">${esc(s.status)}</span></b>
        <a class="muted" href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.url)}</a>
        ${s.note ? `<p>${esc(s.note)}</p>` : ''}
        <span class="muted">${dt(s.createdAt)}</span>
      </div>
      ${
        s.status === 'pending'
          ? row(`${btn('Одобрить')}${btn('Отклонить','ghost')}`)
          : row(btn('Удалить','danger'))
      }
    </div>`
      )
      .join('') || `<p class="muted">Предложений нет.</p>`;

  $$('#admin-submissions .arow').forEach((el) => {
    const id = el.dataset.id;
    const buttons = $$('button', el);
    if (buttons[0]?.textContent === 'Одобрить') {
      buttons[0].onclick = () => api(`/admin/submissions/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }).then(load).catch(alert);
      buttons[1].onclick = () => {
        const note = prompt('Причина отказа (необязательно)') || '';
        api(`/admin/submissions/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected', note }) }).then(load).catch(alert);
      };
    } else {
      buttons[0].onclick = () => api(`/admin/submissions/${id}`, { method: 'DELETE' }).then(load).catch(alert);
    }
  });
}

function renderModeration() {
  $('#admin-muted').innerHTML =
    data.muted.map((m) => `<div class="arow"><span>${esc(m.nick)}</span><span class="muted">до ${dt(m.until)}</span>${row(btn('Снять мут'))}</div>`)
      .join('') || '<p class="muted">Мутов нет.</p>';
  $$('#admin-muted .arow button').forEach((b, i) => {
    b.onclick = () => api(`/admin/mute/${encodeURIComponent(data.muted[i].nick)}`, { method: 'DELETE' }).then(load).catch(alert);
  });

  const chatRow = (m) => `
    <div class="arow"><b>${esc(m.author)}</b><span class="grow">${esc(m.text)}</span><span class="muted">${dt(m.createdAt)}</span>${row(btn('Удалить','danger'))}</div>`;
  $('#admin-chat').innerHTML = data.chat.map(chatRow).join('') || '<p class="muted">Пусто.</p>';
  $$('#admin-chat .arow').forEach((el, i) => {
    const buttons = $$('button', el);
    buttons[0].onclick = () => api(`/admin/chat/${data.chat[i].id}`, { method: 'DELETE' }).then(load).catch(alert);
    el.firstElementChild.addEventListener('dblclick', () => muteNick(data.chat[i].author));
  });

  const commentRow = (c) => `
    <div class="arow"><b>${esc(c.author)}</b><span class="grow">${esc(c.text)}</span><span class="muted">${dt(c.createdAt)}</span>${row(btn('Удалить','danger'))}</div>`;
  $('#admin-comments').innerHTML = data.comments.map(commentRow).join('') || '<p class="muted">Пусто.</p>';
  $$('#admin-comments .arow').forEach((el, i) => {
    $('button', el).onclick = () => api(`/admin/comments/${data.comments[i].id}`, { method: 'DELETE' }).then(load).catch(alert);
    el.firstElementChild.addEventListener('dblclick', () => muteNick(data.comments[i].author));
  });
}

async function muteNick(nick) {
  const minutes = Number(prompt(`Мут для ${nick}. Минут:`, '30'));
  if (!minutes) return;
  await api('/admin/mute', { method: 'POST', body: JSON.stringify({ nick, minutes }) }).then(load).catch(alert);
}

function renderUsers() {
  $('#admin-users').innerHTML = data.users
    .map((u) => `<div class="arow"><b>${esc(u.nick)}</b><span class="pill">${esc(u.role)}</span><span class="muted">${dt(u.createdAt)}</span>${row(btn('Удалить','danger'))}</div>`)
    .join('');
  $$('#admin-users .arow').forEach((el, i) => {
    $('button', el).onclick = () => api(`/admin/users/${data.users[i].id}`, { method: 'DELETE' }).then(load).catch(alert);
  });
}

/* -------------------------------------------------------------------- init */

async function load() {
  data = await api('/admin/overview');
  renderNicknames();
  renderItems();
  renderSubmissions();
  renderModeration();
  renderUsers();
}

$$('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
  })
);

$('#add-nickname').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    await api('/admin/nicknames', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset();
    load();
  } catch (err) {
    alert(err.message);
  }
});

$('#add-item').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    await api('/admin/items', { method: 'POST', body: JSON.stringify(body) });
    $('#item-msg').textContent = 'Плашка добавлена';
    e.target.querySelector('input[name=title]').value = '';
    e.target.querySelector('input[name=url]').value = '';
    load();
  } catch (err) {
    $('#item-msg').textContent = err.message;
  }
});

$('#add-user').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    await api('/admin/users', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset();
    load();
  } catch (err) {
    alert(err.message);
  }
});

load().catch(alert);
