// Tend — habit & weight tracker (vanilla JS, IndexedDB, no dependencies)
import { icon, TRACKER_ICONS } from './icons.js';

const $ = (s) => document.querySelector(s);

/* ================= palette ================= */
const GRADIENTS = {
  peach:  ['#ffb38a', '#ff6fa3'],
  sky:    ['#7cc8ff', '#7b86ff'],
  mint:   ['#63e6be', '#38bdf8'],
  lilac:  ['#c9a7ff', '#ff8ad8'],
  sun:    ['#ffd76b', '#ff8f5a'],
  ocean:  ['#5eead4', '#6d6bff'],
  berry:  ['#ff86b8', '#a78bfa'],
  lime:   ['#d9f27a', '#34d399'],
};
const GRAD_KEYS = Object.keys(GRADIENTS);

const DEFAULT_TRACKERS = [
  { name: 'Weight',    type: 'number', unit: 'lb', icon: 'scale',    gradient: 'peach' },
  { name: 'Exercise',  type: 'check',  unit: '',   icon: 'dumbbell', gradient: 'mint'  },
  { name: 'Skin care', type: 'check',  unit: '',   icon: 'droplet',  gradient: 'lilac' },
  { name: 'Dental',    type: 'check',  unit: '',   icon: 'tooth',    gradient: 'sky'   },
];

/* ================= dates ================= */
const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const todayKey = () => dkey(new Date());
const fmtDate = (k, withYear) => parseKey(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
const fmtShort = (k) => parseKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtNum = (v) => String(+(+v).toFixed(2));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ================= storage (IndexedDB) ================= */
const db = {
  idb: null,
  async open() {
    if (!('indexedDB' in window)) return;
    try {
      this.idb = await new Promise((res, rej) => {
        const r = indexedDB.open('tend', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          d.createObjectStore('trackers', { keyPath: 'id' });
          d.createObjectStore('entries', { keyPath: ['trackerId', 'date'] });
          d.createObjectStore('meta', { keyPath: 'key' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    } catch (e) { console.warn('IndexedDB unavailable, running in memory', e); this.idb = null; }
  },
  all(store) {
    if (!this.idb) return Promise.resolve([]);
    return new Promise((res, rej) => {
      const q = this.idb.transaction(store).objectStore(store).getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  },
  write(store, fn) {
    if (!this.idb) return Promise.resolve();
    return new Promise((res, rej) => {
      const tx = this.idb.transaction(store, 'readwrite');
      fn(tx.objectStore(store));
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  },
  put(store, v) { return this.write(store, (s) => s.put(v)); },
  del(store, k) { return this.write(store, (s) => s.delete(k)); },
};

/* ================= state ================= */
const state = {
  trackers: [],
  entries: new Map(),          // trackerId -> Map(date -> value)
  settings: { theme: 'auto', current: null, range: '1M' },
  date: todayKey(),
  today: todayKey(),
};
const cur = () => state.trackers.find((t) => t.id === state.settings.current) || state.trackers[0];
const entriesOf = (id) => { if (!state.entries.has(id)) state.entries.set(id, new Map()); return state.entries.get(id); };
const saveSettings = () => db.put('meta', { key: 'settings', ...state.settings });
const saveTracker = (t) => db.put('trackers', t);

async function setEntry(t, date, value) {
  const m = entriesOf(t.id);
  if (value === null || value === undefined) { m.delete(date); await db.del('entries', [t.id, date]); }
  else { m.set(date, value); await db.put('entries', { trackerId: t.id, date, value, updated: Date.now() }); }
}

async function load() {
  await db.open();
  const [trackers, entries, meta] = await Promise.all([db.all('trackers'), db.all('entries'), db.all('meta')]);
  state.trackers = trackers.sort((a, b) => a.order - b.order);
  for (const e of entries) entriesOf(e.trackerId).set(e.date, e.value);
  const s = meta.find((m) => m.key === 'settings');
  if (s) { const { key, ...rest } = s; Object.assign(state.settings, rest); }
  if (!state.trackers.length) {
    const today = todayKey();
    state.trackers = DEFAULT_TRACKERS.map((t, i) => ({ ...t, id: uid(), order: i, created: today }));
    await Promise.all(state.trackers.map(saveTracker));
    // Optional hook: a demo/preview page may define window.__tendSeed(state, {entriesOf, addDays, todayKey, saveTracker})
    // before app.js runs, to fill sample data. The real installed app never defines this, so it always starts empty.
    if (typeof window.__tendSeed === 'function') {
      try { await window.__tendSeed(state, { entriesOf, addDays, todayKey, saveTracker }); } catch (e) { console.warn(e); }
    }
  }
  if (!cur()) state.settings.current = state.trackers[0]?.id;
  state.settings.current = cur()?.id;
}

/* ================= theme (time of day) ================= */
function isDaytime(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  return h >= 6.5 && h < 19;
}
function applyTheme() {
  const mode = state.settings.theme === 'auto' ? (isDaytime() ? 'light' : 'dark') : state.settings.theme;
  document.documentElement.dataset.theme = mode;
  const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = mode === 'dark' ? '#0f0d17' : '#fbf8f6';
}
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Night owl hours';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Winding down';
}
function applyGradient(t) {
  const [a, b] = GRADIENTS[t.gradient] || GRADIENTS.peach;
  const r = document.documentElement.style;
  r.setProperty('--g1', a); r.setProperty('--g2', b);
}

/* ================= stats ================= */
function trackerStart(t) {
  let first = t.created || todayKey();
  for (const d of entriesOf(t.id).keys()) if (d < first) first = d;
  return first;
}
function streak(t) {
  const m = entriesOf(t.id);
  let d = state.today, n = 0;
  if (!m.get(d)) d = addDays(d, -1);
  while (m.get(d)) { n++; d = addDays(d, -1); }
  return n;
}
function prevNumber(t, before) {
  let best = null;
  for (const [d, v] of entriesOf(t.id)) if (d < before && (!best || d > best[0])) best = [d, v];
  return best;
}
const RANGES = { '1W': 7, '1M': 30, '3M': 91, '1Y': 365, All: Infinity };

function series(t) {
  const today = state.today, m = entriesOf(t.id);
  const n = RANGES[state.settings.range];
  const start0 = trackerStart(t);
  let start = n === Infinity ? start0 : addDays(today, -(n - 1));
  if (t.type === 'number') {
    const pts = [...m].filter(([d]) => d >= start && d <= today).sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, y: v }));
    return { pts, from: pts[0]?.date, to: today };
  }
  if (start < start0) start = start0;
  const pts = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const done = !!m.get(d);
    let end = d;
    if (d === today && !done) end = addDays(d, -1);          // today isn't over yet
    let hit = 0, days = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDays(end, -i);
      if (k < start0) break;
      days++; if (m.get(k)) hit++;
    }
    pts.push({ date: d, y: days ? hit / days : 0, done, hit, days });
  }
  return { pts, from: start, to: today };
}

/* ================= rendering ================= */
function render(animate) {
  const t = cur();
  if (!t) return;
  applyGradient(t);
  renderTabs();
  $('#eyebrow').textContent = greeting();
  $('#title').textContent = t.name;
  renderDay();
  renderEntry();
  renderRanges();
  drawChart();
  if (animate) { const m = $('#page'); m.classList.remove('swap'); void m.offsetWidth; m.classList.add('swap'); }
}

function renderTabs() {
  const nav = $('#tabs');
  nav.innerHTML = state.trackers.map((t) => {
    const [a, b] = GRADIENTS[t.gradient] || GRADIENTS.peach;
    return `<button class="tab ${t.id === cur().id ? 'on' : ''}" data-id="${t.id}" style="--t1:${a};--t2:${b}" aria-label="${esc(t.name)}">${icon(t.icon)}</button>`;
  }).join('') + `<button class="tab add" id="addTab" aria-label="Add tracker">${icon('plus')}</button>`;
  nav.querySelector('.tab.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function renderDay() {
  const d = state.date;
  $('#dayLabel').textContent = d === state.today ? 'Today' : d === addDays(state.today, -1) ? 'Yesterday' : fmtDate(d, d.slice(0, 4) !== state.today.slice(0, 4));
  $('#next').disabled = d >= state.today;
}

function renderEntry() {
  const t = cur(), box = $('#entry'), v = entriesOf(t.id).get(state.date);
  if (t.type === 'number') {
    const prev = prevNumber(t, state.date);
    box.innerHTML = `
      <label class="num"><input id="num" inputmode="decimal" enterkeyhint="done" autocomplete="off"
        placeholder="${prev ? fmtNum(prev[1]) : '0.0'}" value="${v ?? ''}" aria-label="${esc(t.name)}">${t.unit ? `<span class="unit">${esc(t.unit)}</span>` : ''}</label>
      <div class="bar" id="bar"></div>
      <div class="hint" id="hint"></div>`;
    const input = $('#num');
    let timer;
    const commit = async () => {
      clearTimeout(timer);
      const raw = input.value.trim().replace(',', '.');
      const n = raw === '' ? null : parseFloat(raw);
      if (raw !== '' && !isFinite(n)) return;
      if ((entriesOf(t.id).get(state.date) ?? null) === n) return;
      await setEntry(t, state.date, n);
      const bar = $('#bar'); bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse');
      numberHint(t); drawChart();
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(commit, 900); });
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    numberHint(t);
  } else {
    box.innerHTML = `
      <button class="check ${v ? 'done' : ''}" id="check" aria-pressed="${!!v}" aria-label="Mark ${esc(t.name)} done">${icon('check')}</button>
      <div class="hint" id="hint"></div>`;
    $('#check').addEventListener('click', async (e) => {
      const on = !entriesOf(t.id).get(state.date);
      e.currentTarget.classList.toggle('done', on);
      e.currentTarget.setAttribute('aria-pressed', on);
      if (on) navigator.vibrate?.(12);
      await setEntry(t, state.date, on ? 1 : null);
      checkHint(t); drawChart();
    });
    checkHint(t);
  }
}

function numberHint(t) {
  const v = entriesOf(t.id).get(state.date), prev = prevNumber(t, state.date), h = $('#hint');
  if (v == null) { h.textContent = prev ? `Last ${fmtNum(prev[1])} · ${fmtShort(prev[0])}` : 'Tap the number to log'; return; }
  if (!prev) { h.textContent = 'First entry — nice start'; return; }
  const d = v - prev[1];
  h.textContent = Math.abs(d) < 0.005 ? `Same as ${fmtShort(prev[0])}` : `${d < 0 ? '↓' : '↑'} ${fmtNum(Math.abs(d))} since ${fmtShort(prev[0])}`;
}
function checkHint(t) {
  const s = streak(t), h = $('#hint');
  if (state.date !== state.today) { h.textContent = entriesOf(t.id).get(state.date) ? 'Done' : 'Not logged'; return; }
  h.textContent = s >= 2 ? `${s} day streak ✦` : s === 1 ? '1 day — keep it going' : 'Tap when done';
}

function renderRanges() {
  $('#ranges').innerHTML = Object.keys(RANGES)
    .map((r) => `<button data-r="${r}" class="${r === state.settings.range ? 'on' : ''}">${r}</button>`).join('');
}

/* ---------- chart ---------- */
let chart = null; // { pts:[{x,y,...}], t }

function monotone(P) {
  const n = P.length;
  if (n < 2) return '';
  const f = (v) => Math.round(v * 10) / 10;
  if (n === 2) return `M${f(P[0][0])},${f(P[0][1])}L${f(P[1][0])},${f(P[1][1])}`;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0]; m[i] = (P[i + 1][1] - P[i][1]) / dx[i]; }
  const s = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    s[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  }
  s[n - 1] = m[n - 2];
  let d = `M${f(P[0][0])},${f(P[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(P[i][0] + h)},${f(P[i][1] + h * s[i])} ${f(P[i + 1][0] - h)},${f(P[i + 1][1] - h * s[i + 1])} ${f(P[i + 1][0])},${f(P[i + 1][1])}`;
  }
  return d;
}

function drawChart() {
  const t = cur(), svg = $('#chart');
  const W = svg.clientWidth || 320, H = svg.clientHeight || 170;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const [g1, g2] = GRADIENTS[t.gradient] || GRADIENTS.peach;
  const { pts, from, to } = series(t);
  hideReadout();
  if (pts.length < 2) {
    chart = null;
    svg.innerHTML = `<line class="base" x1="8" x2="${W - 8}" y1="${H / 2}" y2="${H / 2}"/>
      <text class="empty" x="${W / 2}" y="${H / 2 - 14}">${t.type === 'number' ? 'Your line will grow here' : 'A few days in, your rhythm appears here'}</text>`;
    return;
  }
  const px = 10, top = 14, bottom = 14;
  const span = Math.max(1, diffDays(from, to));
  let lo, hi;
  if (t.type === 'number') {
    lo = Math.min(...pts.map((p) => p.y)); hi = Math.max(...pts.map((p) => p.y));
    const padY = Math.max((hi - lo) * .18, Math.abs(hi) * .004, .5);
    lo -= padY; hi += padY;
  } else { lo = 0; hi = 1; }
  const X = (d) => px + (diffDays(from, d) / span) * (W - px * 2);
  const Y = (v) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
  const P = pts.map((p) => ({ ...p, x: X(p.date), py: Y(p.y) }));
  const path = monotone(P.map((p) => [p.x, p.py]));
  const last = P[P.length - 1];
  const area = `${path}L${last.x},${H}L${P[0].x},${H}Z`;
  svg.innerHTML = `
    <defs>
      <linearGradient id="lg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="${g1}"/><stop offset="1" stop-color="${g2}"/></linearGradient>
      <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g2}" stop-opacity=".16"/><stop offset="1" stop-color="${g2}" stop-opacity="0"/></linearGradient>
    </defs>
    <path d="${area}" fill="url(#ag)"/>
    <path class="line" d="${path}" stroke="url(#lg)"/>
    <circle class="dot last" cx="${last.x}" cy="${last.py}" r="4" stroke="${g2}"/>
    <g class="scrub"><line class="hair" id="hair" y1="0" y2="${H}"/><circle class="dot" id="sdot" r="5.5" stroke="${g2}"/></g>`;
  chart = { P, t, W };
}

function hideReadout() { $('#readout').classList.remove('on'); $('#chart').classList.remove('scrubbing'); }

function nearest(clientX) {
  const r = $('#chart').getBoundingClientRect();
  const x = (clientX - r.left) * (chart.W / r.width);
  let best = chart.P[0];
  for (const p of chart.P) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  return best;
}

function showPoint(p) {
  const svg = $('#chart'), t = chart.t;
  svg.classList.add('scrubbing');
  const hair = $('#hair'), dot = $('#sdot');
  hair.setAttribute('x1', p.x); hair.setAttribute('x2', p.x);
  dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.py);
  const rv = $('#rv'), rd = $('#rd');
  if (t.type === 'number') {
    rv.innerHTML = `${fmtNum(p.y)}${t.unit ? `<small>${esc(t.unit)}</small>` : ''}`;
    rd.textContent = fmtDate(p.date, p.date.slice(0, 4) !== state.today.slice(0, 4));
  } else {
    rv.innerHTML = `${p.done ? 'Done' : '—'}<small>${p.hit} of ${p.days} days</small>`;
    rd.textContent = fmtDate(p.date, p.date.slice(0, 4) !== state.today.slice(0, 4));
  }
  const wrap = $('#readout'), ww = wrap.clientWidth;
  const cx = (p.x / chart.W) * ww;
  for (const el of [rv, rd]) {
    const half = el.offsetWidth / 2 + 4;
    el.style.left = `${Math.min(ww - half, Math.max(half, cx))}px`;
  }
  wrap.classList.add('on');
}

function bindChart() {
  const svg = $('#chart');
  let down = null, lastDate = null;
  svg.addEventListener('pointerdown', (e) => {
    if (!chart) return;
    svg.setPointerCapture(e.pointerId);
    down = { x: e.clientX, y: e.clientY, moved: false };
    const p = nearest(e.clientX); lastDate = p.date; showPoint(p);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!down || !chart) return;
    if (Math.abs(e.clientX - down.x) > 6) down.moved = true;
    const p = nearest(e.clientX);
    if (p.date !== lastDate) { lastDate = p.date; showPoint(p); }
  });
  const end = () => {
    if (!down) return;
    const tap = !down.moved; down = null;
    setTimeout(hideReadout, tap ? 1400 : 250);
    if (tap && lastDate && lastDate !== state.date) { state.date = lastDate; renderDay(); renderEntry(); }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}

/* ================= sheet (add / edit / settings) ================= */
let sheetOpen = false;
function openSheet(html, onMount) {
  const s = $('#sheet');
  s.innerHTML = `<div class="grab"></div>${html}`;
  s.scrollTop = 0;
  onMount?.(s);
  requestAnimationFrame(() => { $('#backdrop').classList.add('on'); s.classList.add('on'); });
  if (!sheetOpen) history.pushState({ sheet: 1 }, '');
  sheetOpen = true;
}
function closeSheet(fromPop) {
  if (!sheetOpen) return;
  sheetOpen = false;
  $('#backdrop').classList.remove('on'); $('#sheet').classList.remove('on');
  document.activeElement?.blur?.();
  if (!fromPop && history.state?.sheet) history.back();
}

function trackerSheet(t) {
  const isNew = !t;
  const used = new Set(state.trackers.map((x) => x.icon));
  const draft = t ? { ...t } : {
    name: '', type: 'check', unit: '', icon: TRACKER_ICONS.find((i) => !used.has(i)) || 'sparkle',
    gradient: GRAD_KEYS[state.trackers.length % GRAD_KEYS.length],
  };
  const hasData = t && entriesOf(t.id).size > 0;
  const prevGrad = cur() ? cur().gradient : draft.gradient;
  const idx = t ? state.trackers.indexOf(t) : -1;

  const html = `
    <h2>${isNew ? 'New tracker' : 'Edit tracker'}</h2>
    <input class="field" id="fName" placeholder="Name — e.g. Water, Reading" maxlength="28" value="${esc(draft.name)}">
    <h3>Input</h3>
    <div class="seg ${hasData ? 'locked' : ''}" id="fType">
      <button data-v="check">Daily check</button><button data-v="number">Number</button>
    </div>
    <div id="unitRow" style="margin-top:10px"><input class="field" id="fUnit" placeholder="Unit — lb, kg, min, glasses…" maxlength="10" value="${esc(draft.unit || '')}"></div>
    <h3>Icon</h3>
    <div class="icons" id="fIcon">${TRACKER_ICONS.map((i) => `<button data-v="${i}" aria-label="${i}">${icon(i)}</button>`).join('')}</div>
    <h3>Color</h3>
    <div class="swatches" id="fGrad">${GRAD_KEYS.map((g) => `<button data-v="${g}" style="--s1:${GRADIENTS[g][0]};--s2:${GRADIENTS[g][1]}" aria-label="${g}"></button>`).join('')}</div>
    <button class="primary" id="fSave">${isNew ? 'Add tracker' : 'Save'}</button>
    ${isNew ? '' : `
      <div class="row" style="margin-top:12px">
        <button class="ghost" id="fLeft" ${idx <= 0 ? 'disabled style="opacity:.4"' : ''}>${icon('left')}Move</button>
        <button class="ghost" id="fRight" ${idx >= state.trackers.length - 1 ? 'disabled style="opacity:.4"' : ''}>Move${icon('right')}</button>
        <button class="ghost danger" id="fDel">Delete</button>
      </div>
      ${settingsHtml()}`}`;

  openSheet(html, (s) => {
    const sync = () => {
      s.querySelectorAll('#fType button').forEach((b) => b.classList.toggle('on', b.dataset.v === draft.type));
      s.querySelectorAll('#fIcon button').forEach((b) => b.classList.toggle('on', b.dataset.v === draft.icon));
      s.querySelectorAll('#fGrad button').forEach((b) => b.classList.toggle('on', b.dataset.v === draft.gradient));
      $('#unitRow').style.display = draft.type === 'number' ? '' : 'none';
      $('#fSave').disabled = !$('#fName').value.trim();
      applyGradient(draft);
    };
    s.querySelector('#fType').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { draft.type = v; sync(); } };
    s.querySelector('#fIcon').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { draft.icon = v; sync(); } };
    s.querySelector('#fGrad').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { draft.gradient = v; sync(); } };
    $('#fName').oninput = sync;
    $('#fSave').onclick = async () => {
      draft.name = $('#fName').value.trim();
      draft.unit = draft.type === 'number' ? $('#fUnit').value.trim() : '';
      if (!draft.name) return;
      if (isNew) {
        const nt = { ...draft, id: uid(), order: state.trackers.length, created: todayKey() };
        state.trackers.push(nt); await saveTracker(nt);
        state.settings.current = nt.id; state.date = state.today;
      } else {
        Object.assign(t, draft); await saveTracker(t);
      }
      saveSettings(); closeSheet(); render(true);
    };
    if (!isNew) {
      const move = async (dir) => {
        const i = state.trackers.indexOf(t), j = i + dir;
        if (j < 0 || j >= state.trackers.length) return;
        [state.trackers[i], state.trackers[j]] = [state.trackers[j], state.trackers[i]];
        state.trackers.forEach((x, k) => (x.order = k));
        await Promise.all(state.trackers.map(saveTracker));
        renderTabs(); toast('Moved');
        $('#fLeft').disabled = j <= 0; $('#fRight').disabled = j >= state.trackers.length - 1;
        $('#fLeft').style.opacity = j <= 0 ? .4 : 1; $('#fRight').style.opacity = j >= state.trackers.length - 1 ? .4 : 1;
      };
      $('#fLeft').onclick = () => move(-1);
      $('#fRight').onclick = () => move(1);
      const del = $('#fDel');
      del.onclick = async () => {
        if (!del.classList.contains('armed')) {
          del.classList.add('armed'); del.textContent = 'Tap to confirm';
          setTimeout(() => { del.classList.remove('armed'); del.textContent = 'Delete'; }, 3000);
          return;
        }
        if (state.trackers.length === 1) { toast('Keep at least one tracker'); return; }
        state.trackers = state.trackers.filter((x) => x.id !== t.id);
        const m = entriesOf(t.id);
        await db.write('entries', (st) => { for (const d of m.keys()) st.delete([t.id, d]); });
        await db.del('trackers', t.id);
        state.entries.delete(t.id);
        state.trackers.forEach((x, k) => (x.order = k));
        await Promise.all(state.trackers.map(saveTracker));
        state.settings.current = state.trackers[Math.max(0, idx - 1)].id;
        saveSettings(); closeSheet(); render(true);
      };
      bindSettings(s);
    }
    sync();
    if (isNew) setTimeout(() => $('#fName').focus(), 350);
  });
  sheetCleanup = () => applyGradient(cur() || { gradient: prevGrad });
}
let sheetCleanup = null;

function settingsHtml() {
  return `
    <div class="divider"></div>
    <h3>Appearance</h3>
    <div class="seg" id="sTheme">
      <button data-v="auto">Time of day</button><button data-v="light">Light</button><button data-v="dark">Dark</button>
    </div>
    <h3>Your data</h3>
    <div class="row">
      <button class="ghost" id="sExport">Export backup</button>
      <button class="ghost" id="sImport">Import backup</button>
    </div>
    <input type="file" id="sFile" accept="application/json,.json" hidden>
    <p class="note">Everything is stored privately on this device. Export a backup now and then to keep it safe or move it to a new phone.</p>`;
}
function bindSettings(s) {
  const sync = () => s.querySelectorAll('#sTheme button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.settings.theme));
  s.querySelector('#sTheme').onclick = (e) => {
    const v = e.target.closest('button')?.dataset.v; if (!v) return;
    state.settings.theme = v; saveSettings(); applyTheme(); sync();
  };
  $('#sExport').onclick = exportData;
  $('#sImport').onclick = () => $('#sFile').click();
  $('#sFile').onchange = (e) => { const f = e.target.files[0]; if (f) importData(f); };
  sync();
}

function exportData() {
  const data = {
    app: 'tend', version: 1, exported: new Date().toISOString(),
    trackers: state.trackers,
    entries: [...state.entries].flatMap(([trackerId, m]) => [...m].map(([date, value]) => ({ trackerId, date, value }))),
    settings: state.settings,
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `tend-backup-${todayKey()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup saved');
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'tend' || !Array.isArray(data.trackers) || !Array.isArray(data.entries)) throw new Error('Not a Tend backup');
    if (!confirm(`Replace everything on this device with the backup from ${String(data.exported || '').slice(0, 10)}?`)) return;
    await db.write('trackers', (s) => s.clear());
    await db.write('entries', (s) => s.clear());
    state.trackers = data.trackers.sort((a, b) => a.order - b.order);
    state.entries = new Map();
    for (const e of data.entries) entriesOf(e.trackerId).set(e.date, e.value);
    await db.write('trackers', (s) => state.trackers.forEach((t) => s.put(t)));
    await db.write('entries', (s) => data.entries.forEach((e) => s.put({ ...e, updated: Date.now() })));
    Object.assign(state.settings, data.settings || {});
    if (!cur()) state.settings.current = state.trackers[0]?.id;
    await saveSettings();
    applyTheme(); closeSheet(); render(true); toast('Backup restored');
  } catch (err) { toast(err.message || 'Could not read that file'); }
}

/* ================= misc ================= */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 1800);
}

function tick() {
  applyTheme();
  const now = todayKey();
  if (now !== state.today) {
    const wasToday = state.date === state.today;
    state.today = now;
    if (wasToday) state.date = now;
    render();
  } else {
    $('#eyebrow').textContent = greeting();
  }
}

/* ================= events ================= */
function bind() {
  $('#more').innerHTML = icon('more');
  $('#prev').innerHTML = icon('left');
  $('#next').innerHTML = icon('right');
  $('#prev').onclick = () => { state.date = addDays(state.date, -1); renderDay(); renderEntry(); };
  $('#next').onclick = () => { if (state.date < state.today) { state.date = addDays(state.date, 1); renderDay(); renderEntry(); } };
  $('#more').onclick = () => trackerSheet(cur());
  $('#ranges').onclick = (e) => {
    const r = e.target.closest('button')?.dataset.r; if (!r) return;
    state.settings.range = r; saveSettings(); renderRanges(); drawChart();
  };

  // tabs: tap to switch, long-press to edit
  const nav = $('#tabs');
  let press = null;
  nav.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.tab[data-id]'); if (!b) return;
    press = { id: b.dataset.id, fired: false, timer: setTimeout(() => {
      press.fired = true; navigator.vibrate?.(8);
      trackerSheet(state.trackers.find((t) => t.id === b.dataset.id));
    }, 520) };
  });
  const cancel = () => { if (press) clearTimeout(press.timer); };
  nav.addEventListener('pointerup', cancel);
  nav.addEventListener('pointercancel', cancel);
  nav.addEventListener('pointerleave', cancel);
  nav.addEventListener('scroll', cancel, { passive: true });
  nav.addEventListener('contextmenu', (e) => e.preventDefault());
  nav.addEventListener('click', (e) => {
    if (e.target.closest('#addTab')) { trackerSheet(null); return; }
    const b = e.target.closest('.tab[data-id]'); if (!b) return;
    if (press?.fired) { press = null; return; }
    if (b.dataset.id !== state.settings.current) {
      state.settings.current = b.dataset.id; state.date = state.today;
      saveSettings(); render(true);
    }
  });

  $('#backdrop').onclick = () => closeSheet();
  window.addEventListener('popstate', () => { if (sheetOpen) closeSheet(true); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  $('#sheet').addEventListener('transitionend', (e) => {
    if (e.target.id === 'sheet' && !sheetOpen) { sheetCleanup?.(); sheetCleanup = null; }
  });

  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawChart, 120); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  setInterval(tick, 30_000);
  bindChart();
}

async function init() {
  await load();
  applyTheme();
  bind();
  render(true);
  if (navigator.storage?.persist) {
    navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); }).catch(() => {});
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
