import * as B from './bible.js';
import * as S from './store.js';
import * as P from './plans.js';
import * as T from './tts.js';
import * as L from './liturgy.js';
import * as ST from './study.js';
import { trackView, trackEvent } from './analytics.js';

const APP_VERSION = '1.3.0';

// ---------- Utilidades ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const fmtDate = (t) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(t));
const plural = (n, one, many) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
const view = $('#view');
const body = document.body;

const HL = [
  { id: 'yellow', name: 'amarelo' },
  { id: 'green', name: 'verde' },
  { id: 'blue', name: 'azul' },
  { id: 'pink', name: 'rosa' },
  { id: 'orange', name: 'laranja' },
];
const STYLES = [
  { id: 'auto', name: 'Automático', bg: 'linear-gradient(135deg,#f4f2fb 50%,#0b1020 50%)', bars: ['#6a3fd1', '#f5b544', '#0b7a5c'] },
  { id: 'vitral', name: 'Vitral', bg: '#f4f2fb', bars: ['#2b57d9', '#c8323c', '#0b7a5c'] },
  { id: 'noturno', name: 'Noturno', bg: '#0b1020', bars: ['#1e2640', '#f5b544', '#1e2640'] },
];
// Cores de destaque: litúrgicas + automáticas. "hex" só ilustra a amostra.
const COLORS = [
  { id: 'liturgical', name: 'Tempo litúrgico' },
  { id: 'style', name: 'Padrão do estilo' },
  { id: 'verde', name: 'Verde', hex: '#0b7a5c' },
  { id: 'roxo', name: 'Roxo', hex: '#6a3fd1' },
  { id: 'dourado', name: 'Branco/Dourado', hex: '#f5e6b8' },
  { id: 'vermelho', name: 'Vermelho', hex: '#c8323c' },
  { id: 'rosa', name: 'Rosa', hex: '#e58fb6' },
];
const FONTS = {
  style: { name: 'Do estilo', css: 'var(--font-text)' },
  serif: { name: 'Serifada', css: "Georgia, 'Times New Roman', serif" },
  classic: { name: 'Clássica', css: "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  sans: { name: 'Sem serifa', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  readable: { name: 'Alta legibilidade', css: "Verdana, Tahoma, 'DejaVu Sans', sans-serif" },
};
const WIDTHS = { narrow: '34rem', medium: '42rem', wide: '58rem' };

// ---------- Aparência ----------
const darkMq = matchMedia('(prefers-color-scheme: dark)');

const resolveStyle = (s) => (s.theme === 'vitral' || s.theme === 'noturno' ? s.theme : darkMq.matches ? 'noturno' : 'vitral');

function resolveColor(s, style) {
  if (s.color === 'liturgical') return L.season().color;
  if (s.color === 'style' || !L.COLOR_NAMES[s.color]) return style === 'noturno' ? 'dourado' : 'roxo';
  return s.color;
}

function applySettings() {
  const s = S.settings();
  const root = document.documentElement;
  const style = resolveStyle(s);
  root.dataset.style = style;
  root.dataset.color = resolveColor(s, style);
  try {
    localStorage.setItem('biblia:lit', L.season().color);
  } catch {
    /* sem armazenamento */
  }
  root.style.setProperty('--reader-size', `${s.fontSize}px`);
  root.style.setProperty('--reader-lh', String(s.lineHeight));
  root.style.setProperty('--font-reader', (FONTS[s.fontFamily] || FONTS.style).css);
  root.style.setProperty('--reader-width', WIDTHS[s.width] || WIDTHS.medium);
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  $('meta[name="theme-color"]')?.setAttribute('content', bg || '#6b2737');
  const r = $('.reader');
  if (r) readerClasses(r);
  setWake(body.dataset.view === 'reader' && s.keepAwake);
}

function readerClasses(el) {
  const s = S.settings();
  el.classList.toggle('justify', !!s.justify);
  el.classList.toggle('no-vn', !s.verseNumbers);
  el.classList.toggle('layout-verses', s.layout === 'verses');
}

darkMq.addEventListener('change', applySettings);
S.subscribe(applySettings);

// ---------- Tela sempre ligada ----------
let wakeLock = null;
async function setWake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') setWake(body.dataset.view === 'reader' && S.settings().keepAwake);
});

// ---------- Toast ----------
let toastTimer;
function toast(msg, { action, onAction, ms = 2600 } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) {
    el.querySelector('button').onclick = () => {
      el.classList.remove('show');
      onAction?.();
    };
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Sheet (diálogo) ----------
const sheet = $('#sheet');
let sheetOnClose = null;
sheet.addEventListener('close', () => {
  const f = sheetOnClose;
  sheetOnClose = null;
  f?.();
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
});

function openSheet(title, html, { onMount, onClose } = {}) {
  if (sheet.open) closeSheet();
  $('#sheet-title').textContent = title;
  const b = $('#sheet-body');
  b.innerHTML = html;
  sheetOnClose = onClose || null;
  sheet.showModal();
  b.scrollTop = 0;
  onMount?.(b);
  return b;
}

function closeSheet() {
  if (sheet.open) sheet.close();
}

function confirmSheet(title, msg, okLabel = 'Confirmar') {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => {
      if (answered) return;
      answered = true;
      resolve(v);
      closeSheet();
    };
    openSheet(
      title,
      `<p>${esc(msg)}</p><div class="row"><span class="spacer"></span>
       <button class="btn" type="button" data-no>Cancelar</button>
       <button class="btn primary" type="button" data-yes>${esc(okLabel)}</button></div>`,
      {
        onMount: (b) => {
          b.querySelector('[data-yes]').onclick = () => done(true);
          b.querySelector('[data-no]').onclick = () => done(false);
        },
        onClose: () => done(false),
      },
    );
  });
}

// ---------- Área de transferência e compartilhamento ----------
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copiado');
}

async function shareText(title, text, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  await copyText(url ? `${text}\n${url}` : text);
}

const appUrl = (hash) => `${location.origin}${location.pathname}${hash}`;

function quote(b, c, vs, texts) {
  const sorted = [...vs].sort((x, y) => x - y);
  const txt = sorted.length === 1 ? texts[sorted[0] - 1] : sorted.map((v) => `${v} ${texts[v - 1]}`).join(' ');
  return `“${txt}”\n— ${B.fmtRef(b, c, sorted, { long: true })} (Bíblia Matos Soares)`;
}

// ---------- Roteador ----------
let routeAbort = null;
let ttsAutoNext = false;
const go = (hash) => (location.hash = hash);
const readHash = (b, c, v) => `#/ler/${b}/${c}${v ? `/${v}` : ''}`;

function parseHash() {
  const h = location.hash.slice(1) || '/';
  const [path, qs = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, q: new URLSearchParams(qs) };
}

function setView(name, title, tab) {
  body.dataset.view = name;
  document.title = title ? `${title} · Bíblia Católica` : 'Bíblia Católica';
  $$('#tabbar a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tab === tab));
  $$('#tabbar a[aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));
  $('#ref-btn').hidden = name !== 'reader';
}

async function route() {
  routeAbort?.abort();
  routeAbort = new AbortController();
  const signal = routeAbort.signal;
  closeSheet();
  clearSelection();
  body.classList.remove('immersive');
  if (!ttsAutoNext) stopTTS();
  setWake(false);
  const { parts, q } = parseHash();
  const [name, a, b, c] = parts;
  const keepScroll = name === 'ler' || name === 'buscar';
  if (!keepScroll) window.scrollTo(0, 0);
  try {
    switch (name) {
      case undefined:
        await homeView(signal);
        break;
      case 'continuar': {
        const last = S.get().last;
        location.replace(last ? readHash(last.b, last.c) : readHash('GEN', 1));
        break;
      }
      case 'livros':
        a ? bookView(a) : booksView(q, signal);
        break;
      case 'ler':
        await readerView(a, +b || 1, c ? +c : null, signal);
        break;
      case 'estudo':
        await studyView(a, +b || 1, +c || 1, q, signal);
        break;
      case 'buscar':
        await searchView(q, signal);
        break;
      case 'salvos':
        await savedView(q, signal);
        break;
      case 'planos':
        a ? planView(a, signal) : plansView();
        break;
      case 'ajustes':
        await settingsView(signal);
        break;
      default:
        notFound();
    }
  } catch (e) {
    if (signal.aborted) return;
    console.error(e);
    view.innerHTML = `<div class="page"><div class="empty"><p>Não foi possível carregar este conteúdo.</p>
      <p class="small">${esc(e.message)}</p><p><button class="btn" type="button" onclick="location.reload()">Tentar novamente</button></p></div></div>`;
  }
}

function notFound() {
  setView('404', 'Página não encontrada');
  view.innerHTML = `<div class="page"><div class="empty"><p>Página não encontrada.</p><a class="btn" href="#/">Voltar ao início</a></div></div>`;
}

// ---------- Início ----------
const groupNames = () => [...new Set(B.books().map((b) => b.group))];
const groupIndex = (name) => groupNames().indexOf(name);
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SEASON_HEX = { verde: '#0b7a5c', roxo: '#6a3fd1', dourado: '#d9a520', vermelho: '#c8323c', rosa: '#e58fb6' };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

// Dias seguidos com leitura (a sequência continua ativa se a última leitura foi ontem).
function streak(history) {
  const days = new Set(history.map((h) => new Date(h.t).toDateString()));
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function planCardHtml(st) {
  const id = st.activePlan;
  const prog = id && st.plans[id];
  if (!prog || !P.plan(id)) {
    return `<a class="card plan-card" href="#/planos"><p class="eyebrow">Plano de leitura</p>
      <div class="row"><b>Escolha um plano e leia um pouco por dia</b><span class="spacer"></span>${icon('right')}</div></a>`;
  }
  const p = P.plan(id);
  const days = P.schedule(id);
  const today = Math.min(Math.max(P.dayIndex(prog.start), 0), days.length - 1);
  let next = days.findIndex((_, i) => !prog.done[i]);
  if (next === -1) next = days.length - 1;
  const d = days[next];
  const [y, m, d0] = prog.start.split('-').map(Number);
  const from = Math.min(today, Math.max(days.length - 7, 0));
  const week = [];
  for (let i = from; i < Math.min(from + 7, days.length); i++) {
    const date = new Date(y, m - 1, d0 + i);
    const cls = i === today ? 'today' : prog.done[i] ? 'done' : '';
    week.push(`<div><span>${WEEKDAYS[date.getDay()]}</span><b class="${cls}" title="Dia ${i + 1}: ${esc(P.dayLabel(days[i]))}">${date.getDate()}</b></div>`);
  }
  return `<section class="card">
    <div class="row"><a class="plan-card" href="#/planos/${p.id}"><b>${esc(p.name)}</b></a><span class="spacer"></span>
      <span class="small muted">Dia ${next + 1} · ${esc(P.dayLabel(d))}</span></div>
    ${next < today ? `<p class="small muted" style="margin:6px 0 0">${plural(today - next, 'dia', 'dias')} em atraso</p>` : ''}
    <div class="week">${week.join('')}</div>
    <div class="row" style="margin-top:14px">
      <a class="btn primary" href="${readHash(d[0].b, d[0].c)}">${icon('book')}Ler agora</a>
      <button class="btn" type="button" data-plan-done="${next}">${icon('check')}Concluir dia</button>
    </div></section>`;
}

async function homeView(signal) {
  setView('home', '', 'home');
  const st = S.get();
  const meta = B.meta();
  const votd = P.verseOfDay();
  const votdCh = await B.chapter(votd.b, votd.c);
  const votdVs = Array.from({ length: votd.to - votd.v + 1 }, (_, i) => votd.v + i);
  const votdText = P.votdText(votdVs.map((n) => votdCh?.[n - 1] ?? ''));
  if (signal.aborted) return;
  const last = st.last && B.book(st.last.b) ? st.last : null;
  const lastBook = last ? B.book(last.b) : B.book('GEN');
  const readCount = Object.keys(st.read).length;
  const pct = Math.round((readCount / meta.totalChapters) * 1000) / 10;
  const season = L.season();
  const days = streak(st.history);
  const ring = 2 * Math.PI * 23;
  const lastPct = last ? Math.min(1, last.y || 0) : 0;
  const dateStr = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const groups = groupNames().map((g) => ({ g, n: B.books().filter((b) => b.group === g).length }));
  const recent = st.history.slice(0, 8).filter((h) => B.book(h.b));
  const votdRef = B.fmtRef(votd.b, votd.c, votdVs, { long: true });

  view.innerHTML = `<div class="page">
    <div class="hero">
      <div><p>${greeting()} · ${esc(dateStr)}</p><h1>O que vamos ler hoje?</h1></div>
      ${days ? `<span class="streak" title="Dias seguidos de leitura">${icon('flame', 'ic sm')}${plural(days, 'dia', 'dias')}</span>` : ''}
    </div>
    <p class="season"><i style="background:${SEASON_HEX[season.color]}"></i>${esc(season.name)} · cor ${esc(L.COLOR_NAMES[season.color].toLowerCase())}</p>
    <form class="searchbox" id="home-search" role="search">
      ${icon('search')}
      <input type="search" name="q" placeholder="Palavra ou referência (ex.: Jo 3,16)" aria-label="Buscar ou ir para referência" autocomplete="off" enterkeyhint="search">
    </form>

    <a class="continue" href="${last ? readHash(last.b, last.c) : readHash('GEN', 1)}">
      <svg class="ring" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="23" fill="none" stroke="var(--surface-2)" stroke-width="6"/>
        <circle cx="28" cy="28" r="23" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(ring * lastPct).toFixed(1)} ${ring.toFixed(1)}" transform="rotate(-90 28 28)"/>
      </svg>
      <span><small>${last ? `Continuar · ${esc(lastBook.group)}` : 'Começar a ler'}</small><b>${last ? `${esc(lastBook.name)} ${last.c}` : 'Gênesis 1'}</b></span>
      <span class="go">${icon('right')}</span>
    </a>

    <section class="card votd">
      <p class="eyebrow">Versículo do dia</p>
      <p class="verse-quote">“${esc(votdText)}”</p>
      <div class="row">
        <a class="ref" href="${readHash(votd.b, votd.c, votd.v)}">${esc(votdRef)}</a>
        <span class="spacer"></span>
        <button class="btn primary" type="button" data-votd="listen">${icon('play')}Ouvir</button>
        <button class="icon-btn" type="button" data-votd="copy" aria-label="Copiar versículo">${icon('copy')}</button>
        <button class="icon-btn" type="button" data-votd="share" aria-label="Compartilhar versículo">${icon('share')}</button>
      </div>
    </section>

    ${planCardHtml(st)}

    <h2>Explorar a Bíblia</h2>
    <div class="tiles">${groups
      .map((x) => `<a class="tile" data-g="${groupIndex(x.g)}" href="#/livros?g=${encodeURIComponent(x.g)}"><b>${esc(x.g)}</b><small>${plural(x.n, 'livro', 'livros')}</small></a>`)
      .join('')}</div>

    <section class="card">
      <p class="eyebrow">Seu progresso</p>
      <div class="stats">
        <div><b>${readCount}</b><span>capítulos lidos</span></div>
        <div><b>${Object.keys(st.bookmarks).length}</b><span>favoritos</span></div>
        <div><b>${Object.keys(st.notes).length}</b><span>notas</span></div>
      </div>
      <div class="progress" style="margin-top:14px" aria-label="Bíblia lida: ${pct}%"><span style="width:${pct}%"></span></div>
      <p class="small muted" style="margin:8px 0 0">${pct.toLocaleString('pt-BR')}% da Bíblia (${readCount} de ${meta.totalChapters} capítulos)</p>
    </section>

    ${
      recent.length
        ? `<h2>Lidos recentemente</h2><div class="chips">${recent
            .map((h) => `<a class="chip" href="${readHash(h.b, h.c)}">${esc(B.book(h.b).name)} ${h.c}</a>`)
            .join('')}</div>`
        : ''
    }
  </div>`;

  $('#home-search').addEventListener('submit', (e) => {
    e.preventDefault();
    submitQuery(e.target.q.value);
  });
  view.addEventListener(
    'click',
    (e) => {
      const v = e.target.closest('[data-votd]');
      if (v) {
        const txt = `“${votdText}”\n— ${votdRef} (Bíblia Matos Soares)`;
        if (v.dataset.votd === 'copy') copyText(txt);
        else if (v.dataset.votd === 'listen') {
          if (!T.supported()) toast('Seu navegador não oferece leitura em voz alta');
          else T.play([votdText], 0, { rate: S.settings().ttsRate, voiceURI: S.settings().ttsVoice });
        } else shareText('Versículo do dia', txt, appUrl(readHash(votd.b, votd.c, votd.v)));
      }
      const pd = e.target.closest('[data-plan-done]');
      if (pd) {
        completePlanDay(S.get().activePlan, +pd.dataset.planDone);
        route();
      }
    },
    { signal },
  );
}

function submitQuery(text) {
  const q = text.trim();
  if (!q) return;
  const ref = B.parseRef(q);
  if (ref && ref.explicitChapter) go(readHash(ref.b, ref.c, ref.v));
  else go(`#/buscar?q=${encodeURIComponent(q)}`);
}

// ---------- Livros ----------
function readInBook(id) {
  const prefix = `${id}.`;
  return Object.keys(S.get().read).filter((k) => k.startsWith(prefix)).length;
}

function booksView(q, signal) {
  setView('books', 'Livros', 'books');
  const t = q.get('t') || 'all';
  const groups = [];
  for (const b of B.books()) {
    if (t !== 'all' && b.testament !== t) continue;
    let g = groups.find((x) => x.name === b.group);
    if (!g) groups.push((g = { name: b.group, books: [] }));
    g.books.push(b);
  }
  view.innerHTML = `<div class="page">
    <h1>Livros</h1>
    <div class="row" style="margin-bottom:12px">
      <div class="seg" role="group" aria-label="Testamento">
        ${[
          ['all', 'Todos'],
          ['AT', 'Antigo'],
          ['NT', 'Novo'],
        ]
          .map(([k, n]) => `<button type="button" data-t="${k}" aria-pressed="${t === k}">${n}</button>`)
          .join('')}
      </div>
    </div>
    <div class="searchbox">${icon('search')}<input type="search" id="book-filter" placeholder="Filtrar livros" aria-label="Filtrar livros" autocomplete="off"></div>
    ${groups
      .map(
        (g) => `<section class="book-group" id="g-${groupIndex(g.name)}" data-g="${groupIndex(g.name)}"><h2>${esc(g.name)}</h2><div class="book-grid">
        ${g.books
          .map((b) => {
            const r = readInBook(b.id);
            return `<a class="book-item" href="#/livros/${b.id}" data-name="${esc(B.fold(`${b.name} ${b.abbrev} ${b.aliases.join(' ')}`))}">
              <span class="badge" aria-hidden="true">${esc(b.abbrev)}</span>
              <span><b>${esc(b.name)}</b><small>${plural(b.chapters, 'capítulo', 'capítulos')}</small></span>
              ${r ? `<span class="bar" style="width:${(r / b.chapters) * 100}%"></span>` : ''}</a>`;
          })
          .join('')}</div></section>`,
      )
      .join('')}
  </div>`;
  view.addEventListener(
    'click',
    (e) => {
      const s = e.target.closest('[data-t]');
      if (s) location.replace(`#/livros?t=${s.dataset.t}`);
    },
    { signal },
  );
  const g = q.get('g');
  if (g) $(`#g-${groupIndex(g)}`)?.scrollIntoView({ block: 'start' });
  $('#book-filter').addEventListener('input', (e) => {
    const f = B.fold(e.target.value.trim());
    $$('.book-item').forEach((el) => (el.hidden = f && !el.dataset.name.includes(f)));
    $$('.book-group').forEach((g) => (g.hidden = !$$('.book-item', g).some((el) => !el.hidden)));
  });
}

function chapterGridHtml(bk, linkFn) {
  const st = S.get();
  return `<div class="chapter-grid">${bk.verses
    .map((_, i) => {
      const c = i + 1;
      const cls = [st.read[S.ckey(bk.id, c)] ? 'read' : '', st.last?.b === bk.id && st.last?.c === c ? 'current' : '']
        .filter(Boolean)
        .join(' ');
      return linkFn(c, cls);
    })
    .join('')}</div>`;
}

function bookView(id) {
  const bk = B.book(id);
  if (!bk) return notFound();
  setView('books', bk.name, 'books');
  const r = readInBook(id);
  const total = bk.verses.reduce((s, n) => s + n, 0);
  view.innerHTML = `<div class="page" data-g="${groupIndex(bk.group)}">
    <a class="btn ghost" href="#/livros">${icon('left')}Livros</a>
    <h1>${esc(bk.name)}</h1>
    <p class="muted">${esc(bk.group)} · ${bk.testament === 'AT' ? 'Antigo' : 'Novo'} Testamento · ${plural(bk.chapters, 'capítulo', 'capítulos')} · ${plural(total, 'versículo', 'versículos')}</p>
    ${r ? `<div class="progress" style="margin-bottom:6px"><span style="width:${(r / bk.chapters) * 100}%"></span></div><p class="small muted">${r} de ${bk.chapters} capítulos lidos</p>` : ''}
    ${id === 'PSA' ? '<p class="small muted">Os Salmos seguem a numeração da Vulgata. Na numeração hebraica, a maioria tem um número a mais (ex.: Sl 22 aqui = Sl 23).</p>' : ''}
    <h2>Capítulos</h2>
    ${chapterGridHtml(bk, (c, cls) => `<a class="${cls}" href="${readHash(id, c)}" aria-label="Capítulo ${c}">${c}</a>`)}
  </div>`;
}

// ---------- Leitor ----------
let ctx = null; // { b, c, texts }
const selected = new Set();

function verseMarks(b, c, v) {
  const st = S.get();
  const k = S.vkey(b, c, v);
  const parts = [];
  if (st.bookmarks[k]) parts.push(`<span title="Favorito">${icon('bookmark-fill')}</span>`);
  if (st.notes[k]) parts.push(`<button type="button" data-note="${v}" aria-label="Ver nota">${icon('note')}</button>`);
  return parts.length ? `<span class="verse-marks">${parts.join('')}</span>` : '';
}

function verseHtml(b, c, v, t) {
  const hl = S.get().highlights[S.vkey(b, c, v)];
  const cls = selected.has(v) ? 'verse selected' : 'verse';
  return `<span class="${cls}" id="v${v}" data-v="${v}"${hl ? ` data-hl="${hl.c}"` : ''}><sup class="vn">${v}</sup>${esc(t)}${verseMarks(b, c, v)}</span> `;
}

function refreshVerse(v) {
  const el = $(`.verse[data-v="${v}"]`);
  if (!el || !ctx) return;
  el.outerHTML = verseHtml(ctx.b, ctx.c, v, ctx.texts[v - 1]).trimEnd();
}

// ---------- Estudo por perícopes ----------
const studyHash = (b, ini, tab) => `#/estudo/${b}/${ini.c}/${ini.v}${tab && tab !== 'texto' ? `?aba=${tab}` : ''}`;

function periHeadHtml(b, h) {
  if (!h) return '';
  const { p } = h;
  return `${h.novaSecao ? `<div class="peri-sec">${esc(p.secao)}</div>` : ''}<div class="peri-head">
    <h2>${esc(p.titulo)}</h2>
    <a class="peri-btn" href="${studyHash(b, p.ini)}">${icon('book')}Estudar</a></div>`;
}

const STUDY_TABS = [
  ['texto', 'Texto'],
  ['sentidos', '4 Sentidos'],
  ['lectio', 'Lectio Divina'],
  ['padres', 'Padres'],
];
const SENSES = [
  ['literal', 'Literal', 'o que o autor sagrado quis dizer'],
  ['alegorico', 'Alegórico', 'Cristo, a Igreja e os sacramentos'],
  ['moral', 'Moral', 'o que devo fazer'],
  ['anagogico', 'Anagógico', 'para onde caminhamos'],
];
const LIT_HEX = { verde: '#0b7a5c', roxo: '#6a3fd1', branco: '#d9a520', vermelho: '#c8323c', rosa: '#e58fb6' };

function anchorHtml(a) {
  if (!a) return '';
  const parts = [];
  if (a.cic?.length) parts.push(`<p class="anc-cic"><b>Catecismo</b> ${a.cic.map((n) => `§ ${n}`).join(' · ')}</p>`);
  for (const f of a.padres || []) {
    parts.push(`<div class="anc-father"><strong>${esc(f.autor)}</strong>${f.obra ? `<span class="small muted"> · ${esc(f.obra)}</span>` : ''}<p>${esc(f.sintese)}</p></div>`);
  }
  if (a.nota?.texto) parts.push(`<p class="anc-nota"><b>Nota</b> ${esc(a.nota.texto)}</p>`);
  return parts.join('');
}

async function studyView(id, c, v, q, signal) {
  const bk = B.book(id);
  if (!bk) return notFound();
  setView('study', `Estudo · ${bk.name} ${c}`, 'books');
  view.innerHTML = '<div class="loading">Carregando…</div>';
  const idx = await ST.bookIndex(id);
  if (signal.aborted) return;
  const loc = idx && ST.locate(idx, c, v);
  if (!loc) return notFound();
  const per = loc.cur;
  if (per.ini.c !== c || per.ini.v !== v) return location.replace(studyHash(id, per.ini));

  const chs = [];
  for (let k = per.ini.c; k <= per.fim.c; k++) chs.push(k);
  const [d, ...texts] = await Promise.all([ST.pericope(id, c, v), ...chs.map((k) => B.chapter(id, k))]);
  if (signal.aborted) return;
  const verses = [];
  chs.forEach((k, j) => {
    const a = k === per.ini.c ? per.ini.v : 1;
    const z = k === per.fim.c ? per.fim.v : texts[j].length;
    for (let n = a; n <= z; n++) verses.push({ c: k, v: n, t: texts[j][n - 1] });
  });
  const multi = chs.length > 1;
  const tab = STUDY_TABS.some(([k]) => k === q.get('aba')) ? q.get('aba') : 'texto';
  const gi = groupIndex(bk.group);
  body.style.setProperty('--band', `var(--g${gi})`);
  const vref = (k) => {
    const [cc, vv] = k.split(':');
    return `${bk.abbrev} ${cc},${vv}`;
  };

  let content;
  if (!d) {
    content = `<div class="empty"><p>O estudo desta perícope ainda está em preparação.</p>
      <a class="btn" href="${readHash(id, c, v)}">${icon('book')}Ler o texto</a></div>`;
  } else if (tab === 'texto') {
    content = `<p class="small muted">Toque nos versículos marcados para ver os Padres e as notas.</p>
      <div class="study-verses">${verses
        .map(({ c: cc, v: vv, t }) => {
          const k = `${cc}:${vv}`;
          const a = d.ancoras?.[k];
          const num = multi ? `${cc},${vv}` : vv;
          return a
            ? `<button class="sv has" type="button" data-k="${k}" aria-expanded="false"><sup class="vn">${num}</sup>${esc(t)}<span class="anc-dot" aria-label="tem comentário"></span></button><div class="anc-box" data-for="${k}" hidden>${anchorHtml(a)}</div>`
            : `<p class="sv"><sup class="vn">${num}</sup>${esc(t)}</p>`;
        })
        .join('')}</div>`;
  } else if (tab === 'sentidos') {
    const S4 = d.quatro_sentidos || {};
    content = `<p class="small muted">Os quatro sentidos da Escritura (Catecismo 115–118).</p>${SENSES.map(
      ([k, h, sub]) => `<section class="card sense"><h3>${h} <small>${sub}</small></h3><p>${esc(S4[k])}</p></section>`,
    ).join('')}`;
  } else if (tab === 'lectio') {
    const Lc = d.lectio_divina || {};
    content = `<ol class="lectio">
      <li><h3>Lectio <small>o que o texto diz · leia devagar, duas vezes</small></h3><p>${esc(Lc.lectio_resumo)}</p>
        <a class="small" href="#/estudo/${id}/${c}/${v}">Ler o texto da perícope</a></li>
      <li><h3>Meditatio <small>o que o texto me diz</small></h3><ul>${(Lc.meditatio_perguntas || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></li>
      <li><h3>Oratio <small>o que eu digo a Deus</small></h3><p>${esc(Lc.oratio_guia)}</p></li>
      <li><h3>Contemplatio <small>repouse em silêncio, repetindo</small></h3>
        <blockquote class="jac">“${esc(Lc.contemplatio_foco?.texto)}”<cite>${esc(Lc.contemplatio_foco?.ref)}</cite></blockquote></li>
    </ol>`;
  } else {
    const keys = Object.keys(d.ancoras || {}).sort((x, y) => {
      const [a1, b1] = x.split(':').map(Number);
      const [a2, b2] = y.split(':').map(Number);
      return a1 - a2 || b1 - b2;
    });
    content = keys.length
      ? keys.map((k) => `<section class="anc-item"><a class="anc-ref" href="${readHash(id, ...k.split(':').map(Number))}">${esc(vref(k))}</a><div>${anchorHtml(d.ancoras[k])}</div></section>`).join('')
      : '<p class="empty">Sem comentários dos Padres para esta perícope.</p>';
    content += '<p class="small muted">Fonte: <i>Catena Aurea</i>, de Santo Tomás de Aquino. Sínteses em português.</p>';
  }

  const usos = d?.liturgia?.usos || [];
  view.innerHTML = `<div class="page study">
    <p class="eyebrow">${esc(per.secao || bk.name)}</p>
    <h1>${esc(per.titulo)}</h1>
    <p class="study-ref"><a href="${readHash(id, c, v)}">${esc(per.referencia)}</a></p>
    ${d?.liturgia?.tema_central ? `<p class="study-tema">${esc(d.liturgia.tema_central)}</p>` : ''}
    ${usos.length ? `<div class="chips">${usos.map((u) => `<span class="chip"><span class="dot" style="background:${LIT_HEX[u.cor] || 'var(--muted)'}"></span>${esc(u.celebracao)}</span>`).join('')}</div>` : ''}
    <nav class="tabs study-tabs" aria-label="Partes do estudo">${STUDY_TABS.map(
      ([k, l]) => `<a href="${studyHash(id, per.ini, k)}"${k === tab ? ' aria-current="page"' : ''}>${l}</a>`,
    ).join('')}</nav>
    <div class="study-body">${content}</div>
    ${d && !d.revisado ? '<p class="small muted study-flag">Conteúdo preparado com auxílio de IA a partir da Tradição; ainda sem revisão.</p>' : ''}
    <nav class="chap-nav study-nav" aria-label="Perícopes">
      ${loc.prev ? `<a class="btn" href="${studyHash(id, loc.prev.ini, tab)}" rel="prev">${icon('left')}${esc(loc.prev.referencia)}</a>` : '<span class="spacer"></span>'}
      ${loc.next ? `<a class="btn" href="${studyHash(id, loc.next.ini, tab)}" rel="next">${esc(loc.next.referencia)}${icon('right')}</a>` : '<span class="spacer"></span>'}
    </nav>
  </div>`;

  view.addEventListener(
    'click',
    (e) => {
      const sv = e.target.closest('.sv.has');
      if (!sv) return;
      const box = $(`.anc-box[data-for="${sv.dataset.k}"]`, view);
      const open = sv.getAttribute('aria-expanded') !== 'true';
      sv.setAttribute('aria-expanded', open);
      box.hidden = !open;
    },
    { signal },
  );
}

async function readerView(id, c, v, signal) {
  const bk = B.book(id);
  if (!bk) return notFound();
  c = Math.min(Math.max(c, 1), bk.chapters);
  setView('reader', `${bk.name} ${c}`, 'books');
  $('#ref-label').textContent = `${bk.name} ${c}`;
  view.innerHTML = '<div class="loading">Carregando…</div>';
  const [texts, sidx] = await Promise.all([B.chapter(id, c), ST.bookIndex(id)]);
  if (signal.aborted) return;
  ctx = { b: id, c, texts };
  selected.clear();
  const heads = sidx ? ST.headingsFor(sidx, c) : {};
  const carry = sidx && !heads[1] ? ST.locate(sidx, c, 1) : null; // capítulo que começa no meio de uma perícope

  const prev = B.adjacent(id, c, -1);
  const next = B.adjacent(id, c, 1);
  const label = (r) => `${B.book(r.b).abbrev} ${r.c}`;
  const alt = id === 'PSA' ? B.psalmHebrew(c) : null;
  const gi = groupIndex(bk.group);
  const isRead = !!S.get().read[S.ckey(id, c)];

  view.innerHTML = `
    <header class="chap-band" data-g="${gi}">
      <div class="inner">
        <a class="group" href="#/livros?g=${encodeURIComponent(bk.group)}">${esc(bk.group)}</a>
        <h1>${esc(bk.name)} ${c}</h1>
        ${alt ? `<span class="alt">Na numeração hebraica: Salmo ${alt}</span>` : ''}
        <nav class="chap-strip" aria-label="Capítulos de ${esc(bk.name)}">${bk.verses
          .map((_, i) => `<a href="${readHash(id, i + 1)}"${i + 1 === c ? ' aria-current="true"' : ''}>${i + 1}</a>`)
          .join('')}</nav>
      </div>
    </header>
    <div class="reader-sheet">
    <article class="reader" id="reader" lang="pt">
      ${carry ? `<a class="peri-carry" href="${studyHash(id, carry.cur.ini)}">${icon('book')}Continuação de: ${esc(carry.cur.titulo)}</a>` : ''}
      <div class="verses">${texts.map((t, i) => periHeadHtml(id, heads[i + 1]) + verseHtml(id, c, i + 1, t)).join('')}</div>
      <div class="chap-end">
        <button class="btn${isRead ? ' primary' : ''}" type="button" id="mark-read" aria-pressed="${isRead}">${icon('check')}${isRead ? 'Capítulo lido' : 'Marcar como lido'}</button>
        <div id="plan-hint"></div>
        <nav class="chap-nav" aria-label="Capítulos">
          ${prev ? `<a class="btn" href="${readHash(prev.b, prev.c)}" rel="prev">${icon('left')}${esc(label(prev))}</a>` : '<span class="spacer"></span>'}
          ${next ? `<a class="btn" href="${readHash(next.b, next.c)}" rel="next">${esc(label(next))}${icon('right')}</a>` : '<span class="spacer"></span>'}
        </nav>
      </div>
    </article>
    </div>
    ${prev ? `<a class="side-nav prev" href="${readHash(prev.b, prev.c)}" aria-label="Capítulo anterior">${icon('left')}</a>` : ''}
    ${next ? `<a class="side-nav next" href="${readHash(next.b, next.c)}" aria-label="Próximo capítulo">${icon('right')}</a>` : ''}`;
  readerClasses($('#reader'));
  body.style.setProperty('--band', `var(--g${gi})`);
  const strip = $('.chap-strip');
  const curChip = $('[aria-current="true"]', strip);
  if (curChip) {
    const r = curChip.getBoundingClientRect();
    const sr = strip.getBoundingClientRect();
    strip.scrollLeft += r.left - sr.left - (sr.width - r.width) / 2;
  }
  renderPlanHint();

  // Posição de leitura e histórico.
  const old = S.get().last;
  const restoreY = !v && old && old.b === id && old.c === c ? old.y || 0 : 0;
  S.update((s) => (s.last = { b: id, c, y: restoreY }), { silent: true });
  S.addHistory(id, c);

  holdImmersive = Date.now() + 800; // rolagem automática não deve esconder as barras
  if (v) {
    const el = $(`#v${v}`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('flash');
    }
  } else {
    const max = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo(0, restoreY > 0 ? restoreY * max : 0);
  }

  let saveTimer;
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        const y = max > 0 ? Math.min(1, scrollY / max) : 0;
        S.update((s) => (s.last = { b: id, c, y }), { silent: true });
      }, 400);
    },
    { passive: true, signal },
  );

  view.addEventListener(
    'click',
    (e) => {
      const note = e.target.closest('[data-note]');
      if (note) {
        e.stopPropagation();
        editNote(id, c, [+note.dataset.note]);
        return;
      }
      if (e.target.closest('#mark-read')) return toggleRead(id, c);
      if (e.target.closest('[data-plan-done]')) {
        const btn = e.target.closest('[data-plan-done]');
        completePlanDay(S.get().activePlan, +btn.dataset.planDone);
        toast('Dia do plano concluído');
        renderPlanHint();
        return;
      }
      const verse = e.target.closest('.verse');
      if (verse && !String(getSelection()).trim()) toggleSelect(+verse.dataset.v);
    },
    { signal },
  );

  setWake(S.settings().keepAwake);

  if (ttsAutoNext) {
    ttsAutoNext = false;
    startTTS(1);
  }
}

function toggleRead(b, c) {
  const k = S.ckey(b, c);
  const now = !S.get().read[k];
  S.update((s) => {
    if (now) s.read[k] = Date.now();
    else delete s.read[k];
  });
  const btn = $('#mark-read');
  btn.classList.toggle('primary', now);
  btn.setAttribute('aria-pressed', String(now));
  btn.innerHTML = `${icon('check')}${now ? 'Capítulo lido' : 'Marcar como lido'}`;
  if (now) toast('Capítulo marcado como lido');
}

// Se o capítulo atual pertence a um dia pendente do plano ativo, oferece concluir o dia.
function renderPlanHint() {
  const el = $('#plan-hint');
  if (!el || !ctx) return;
  el.innerHTML = '';
  const st = S.get();
  const id = st.activePlan;
  if (!id || !st.plans[id] || !P.plan(id)) return;
  const days = P.schedule(id);
  const i = days.findIndex((d, n) => !st.plans[id].done[n] && d.some((x) => x.b === ctx.b && x.c === ctx.c));
  if (i === -1) return;
  const d = days[i];
  const last = d[d.length - 1];
  const nextInDay = d.findIndex((x) => x.b === ctx.b && x.c === ctx.c) + 1;
  const nx = d[nextInDay];
  el.innerHTML = `<div class="card" style="text-align:center;margin:0">
    <p class="small muted" style="margin:0 0 8px">${esc(P.plan(id).name)} · Dia ${i + 1}: ${esc(P.dayLabel(d))}</p>
    <div class="row" style="justify-content:center">
      ${nx ? `<a class="btn" href="${readHash(nx.b, nx.c)}">Próximo do dia: ${esc(B.book(nx.b).abbrev)} ${nx.c}</a>` : ''}
      ${!nx || (last.b === ctx.b && last.c === ctx.c) ? `<button class="btn primary" type="button" data-plan-done="${i}">${icon('check')}Concluir dia ${i + 1}</button>` : ''}
    </div></div>`;
}

// ---------- Seleção de versículos ----------
function toggleSelect(v) {
  if (selected.has(v)) selected.delete(v);
  else selected.add(v);
  $(`.verse[data-v="${v}"]`)?.classList.toggle('selected', selected.has(v));
  body.classList.remove('immersive');
  updateVerseBar();
}

function clearSelection() {
  selected.forEach((v) => $(`.verse[data-v="${v}"]`)?.classList.remove('selected'));
  selected.clear();
  updateVerseBar();
}

function updateVerseBar() {
  const bar = $('#verse-bar');
  if (!selected.size || !ctx) {
    bar.hidden = true;
    return;
  }
  const st = S.get();
  const vs = [...selected].sort((a, b) => a - b);
  const keys = vs.map((v) => S.vkey(ctx.b, ctx.c, v));
  const colors = new Set(keys.map((k) => st.highlights[k]?.c || ''));
  const current = colors.size === 1 ? [...colors][0] : null;
  const allBm = keys.every((k) => st.bookmarks[k]);
  $('#vb-ref').textContent = B.fmtRef(ctx.b, ctx.c, vs, { long: true });
  $('#vb-colors').innerHTML =
    HL.map(
      (h) =>
        `<button class="swatch" type="button" data-color="${h.id}" style="background:var(--hl-${h.id})" aria-label="Destacar em ${h.name}" aria-pressed="${current === h.id}"></button>`,
    ).join('') +
    `<button class="swatch" type="button" data-color="none" aria-label="Remover destaque">${icon('x', 'ic sm')}</button>`;
  const bm = $('[data-act="bookmark"]', bar);
  bm.classList.toggle('on', allBm);
  bm.innerHTML = `${icon(allBm ? 'bookmark-fill' : 'bookmark')}<span>${allBm ? 'Favorito' : 'Favoritar'}</span>`;
  $('[data-act="note"] span', bar).textContent = st.notes[keys[0]] ? 'Ver nota' : 'Nota';
  bar.hidden = false;
}

$('#vb-close').addEventListener('click', clearSelection);
$('#vb-colors').addEventListener('click', (e) => {
  const sw = e.target.closest('[data-color]');
  if (!sw || !ctx) return;
  const color = sw.dataset.color;
  const vs = [...selected];
  trackEvent(color === 'none' ? 'versiculo/remover-destaque' : 'versiculo/destacar');
  S.update((s) => {
    for (const v of vs) {
      const k = S.vkey(ctx.b, ctx.c, v);
      if (color === 'none') delete s.highlights[k];
      else s.highlights[k] = { c: color, t: Date.now() };
    }
  });
  clearSelection();
  vs.forEach(refreshVerse);
});
$('.vb-actions').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || !ctx) return;
  const vs = [...selected].sort((a, b) => a - b);
  const { b, c, texts } = ctx;
  trackEvent(`versiculo/${btn.dataset.act}`);
  switch (btn.dataset.act) {
    case 'bookmark': {
      const keys = vs.map((v) => S.vkey(b, c, v));
      const all = keys.every((k) => S.get().bookmarks[k]);
      S.update((s) => keys.forEach((k) => (all ? delete s.bookmarks[k] : (s.bookmarks[k] = { t: Date.now() }))));
      toast(all ? 'Removido dos favoritos' : 'Adicionado aos favoritos');
      clearSelection();
      vs.forEach(refreshVerse);
      break;
    }
    case 'note':
      editNote(b, c, vs);
      break;
    case 'copy':
      copyText(quote(b, c, vs, texts));
      clearSelection();
      break;
    case 'share':
      shareText(B.fmtRef(b, c, vs, { long: true }), quote(b, c, vs, texts), appUrl(readHash(b, c, vs[0])));
      clearSelection();
      break;
    case 'listen':
      clearSelection();
      startTTS(vs[0]);
      break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (sheet.open) return;
  if (e.key === 'Escape' && selected.size) clearSelection();
  if (e.key === '/') {
    e.preventDefault();
    go('#/buscar');
  }
  if (body.dataset.view === 'reader' && ctx) {
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const t = dir && B.adjacent(ctx.b, ctx.c, dir);
    if (t) go(readHash(t.b, t.c));
  }
});

// Gestos: deslizar para o lado troca de capítulo.
let touch = null;
view.addEventListener(
  'touchstart',
  (e) => {
    touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
  },
  { passive: true },
);
view.addEventListener(
  'touchend',
  (e) => {
    if (!touch || body.dataset.view !== 'reader' || !ctx) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    const quick = Date.now() - touch.t < 600;
    touch = null;
    if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || String(getSelection()).trim()) return;
    const t = B.adjacent(ctx.b, ctx.c, dx < 0 ? 1 : -1);
    if (t) go(readHash(t.b, t.c));
  },
  { passive: true },
);

// Modo imersivo: esconde as barras ao rolar para baixo no leitor.
let lastY = 0;
let holdImmersive = 0;
window.addEventListener(
  'scroll',
  () => {
    const y = scrollY;
    const on =
      body.dataset.view === 'reader' && S.settings().immersive && !selected.size && !T.state().playing && Date.now() > holdImmersive;
    const atEnd = innerHeight + y >= document.documentElement.scrollHeight - 40;
    if (!on || atEnd || y < 80) body.classList.remove('immersive');
    else if (y > lastY + 8) body.classList.add('immersive');
    else if (y < lastY - 8) body.classList.remove('immersive');
    lastY = y;
  },
  { passive: true },
);

// ---------- Notas ----------
function editNote(b, c, vs) {
  const v0 = vs[0];
  const k = S.vkey(b, c, v0);
  const existing = S.get().notes[k];
  const noteVs = existing?.vs || vs;
  const texts = ctx && ctx.b === b && ctx.c === c ? ctx.texts : null;
  openSheet(
    `Nota · ${B.fmtRef(b, c, noteVs, { long: true })}`,
    `${texts ? `<p class="preview" style="font-size:1rem">${esc(noteVs.map((v) => texts[v - 1]).join(' '))}</p>` : ''}
     <label class="field"><span>Sua nota</span><textarea id="note-text" placeholder="Escreva sua reflexão, oração ou estudo…">${esc(existing?.text || '')}</textarea></label>
     <div class="row">
       ${existing ? `<button class="btn danger" type="button" id="note-del">${icon('trash')}Excluir</button>` : ''}
       <span class="spacer"></span>
       <button class="btn" type="button" data-close>Cancelar</button>
       <button class="btn primary" type="button" id="note-save">Salvar</button>
     </div>`,
    {
      onMount: (el) => {
        const ta = $('#note-text', el);
        ta.focus();
        $('#note-save', el).onclick = () => {
          const text = ta.value.trim();
          S.update((s) => {
            if (text) s.notes[k] = { text, vs: noteVs, t: Date.now() };
            else delete s.notes[k];
          });
          closeSheet();
          clearSelection();
          refreshVerse(v0);
          toast(text ? 'Nota salva' : 'Nota removida');
        };
        const del = $('#note-del', el);
        if (del)
          del.onclick = () => {
            S.update((s) => delete s.notes[k]);
            closeSheet();
            clearSelection();
            refreshVerse(v0);
            toast('Nota excluída');
          };
      },
    },
  );
}

// ---------- Leitura em voz alta ----------
const ttsBar = $('#tts-bar');

function markSpeaking(v) {
  $$('.verse.speaking').forEach((el) => el.classList.remove('speaking'));
  if (!v) return;
  const el = $(`.verse[data-v="${v}"]`);
  if (!el) return;
  el.classList.add('speaking');
  const r = el.getBoundingClientRect();
  if (r.top < 80 || r.bottom > innerHeight - 120) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  $('#tts-label').textContent = `Lendo ${B.fmtRef(ctx.b, ctx.c, v)}`;
  $('#tts-progress').style.width = `${(v / ctx.texts.length) * 100}%`;
}

function setTtsToggle(paused) {
  $('#tts-toggle').innerHTML = icon(paused ? 'play' : 'pause');
  $('#tts-toggle').setAttribute('aria-label', paused ? 'Continuar' : 'Pausar');
}

function startTTS(from = 1) {
  if (!T.supported()) {
    toast('Seu navegador não oferece leitura em voz alta');
    return;
  }
  if (!ctx) return;
  const s = S.settings();
  const { b, c } = ctx;
  ttsBar.hidden = false;
  const voice = T.voices().find((v) => v.voiceURI === s.ttsVoice);
  $('#tts-sub').textContent = `${voice ? voice.name : 'Voz padrão'} · ${s.ttsRate.toLocaleString('pt-BR')}×`;
  setTtsToggle(false);
  $('#tts-btn').classList.add('active');
  T.play(ctx.texts, from - 1, {
    rate: s.ttsRate,
    voiceURI: s.ttsVoice,
    onVerse: (i) => markSpeaking(i + 1),
    onEnd: () => {
      markSpeaking(null);
      const nx = S.settings().ttsContinue && B.adjacent(b, c, 1);
      if (nx) {
        ttsAutoNext = true;
        go(readHash(nx.b, nx.c));
      } else stopTTS();
    },
  });
}

function stopTTS() {
  T.stop();
  ttsBar.hidden = true;
  $('#tts-btn').classList.remove('active');
  markSpeaking(null);
}

$('#tts-btn').addEventListener('click', () => {
  if (T.state().playing) return stopTTS();
  trackEvent('audio/ouvir-capitulo');
  startTTS(1);
});
$('#tts-stop').addEventListener('click', stopTTS);
$('#tts-toggle').addEventListener('click', () => {
  if (T.state().paused) T.resume();
  else T.pause();
  setTtsToggle(T.state().paused);
});

// ---------- Seletor de livro/capítulo ----------
function openPicker() {
  const cur = ctx ? B.book(ctx.b) : B.book('GEN');
  let t = cur.testament;
  const render = (el) => {
    el.innerHTML = `
      <form class="searchbox" id="pick-ref">${icon('search')}<input type="search" name="q" placeholder="Ir para… (ex.: Sl 22 ou Jo 3,16)" aria-label="Ir para referência" autocomplete="off" enterkeyhint="go"></form>
      <div class="row" style="margin:12px 0"><div class="seg">
        <button type="button" data-pt="AT" aria-pressed="${t === 'AT'}">Antigo Testamento</button>
        <button type="button" data-pt="NT" aria-pressed="${t === 'NT'}">Novo Testamento</button>
      </div></div>
      <div class="book-grid">${B.testament(t)
        .map(
          (b) =>
            `<button class="book-item${b.id === cur.id ? ' current' : ''}" type="button" data-pb="${b.id}" data-g="${groupIndex(b.group)}"><span class="badge" aria-hidden="true">${esc(b.abbrev)}</span><span><b>${esc(b.name)}</b><small>${plural(b.chapters, 'cap.', 'caps.')}</small></span></button>`,
        )
        .join('')}</div>`;
    // No desktop, foca o campo; no celular evita abrir o teclado sem pedir.
    if (matchMedia('(pointer: fine)').matches) $('#pick-ref input', el).focus();
    $('#pick-ref', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const r = B.parseRef(e.target.q.value);
      if (r) go(readHash(r.b, r.c, r.v));
      else toast('Referência não encontrada');
    });
  };
  const chapters = (el, bk) => {
    $('#sheet-title').textContent = bk.name;
    el.innerHTML = `<button class="btn ghost" type="button" data-back>${icon('left')}Livros</button>
      <div style="margin-top:12px">${chapterGridHtml(bk, (c, cls) => `<a class="${cls}" href="${readHash(bk.id, c)}">${c}</a>`)}</div>`;
  };
  openSheet('Escolher passagem', '', {
    onMount: (el) => {
      render(el);
      el.onclick = (e) => {
        const pt = e.target.closest('[data-pt]');
        if (pt) {
          t = pt.dataset.pt;
          render(el);
        }
        const pb = e.target.closest('[data-pb]');
        if (pb) chapters(el, B.book(pb.dataset.pb));
        if (e.target.closest('[data-back]')) {
          $('#sheet-title').textContent = 'Escolher passagem';
          render(el);
        }
        if (e.target.closest('a[href]')) closeSheet();
      };
    },
  });
}
$('#ref-btn').addEventListener('click', openPicker);

// ---------- Aparência (controles reutilizados no leitor e em Ajustes) ----------
function segHtml(key, options, value) {
  return `<div class="seg" role="group">${options
    .map(([v, n]) => `<button type="button" data-seg="${key}" data-val="${v}" aria-pressed="${String(value) === String(v)}">${n}</button>`)
    .join('')}</div>`;
}

function displayControlsHtml() {
  const s = S.settings();
  const season = L.season();
  return `
    <p class="eyebrow">Estilo</p>
    <div class="styles" role="group" aria-label="Estilo">${STYLES.map(
      (t) => `<button class="style-opt" type="button" data-style-opt="${t.id}" aria-pressed="${s.theme === t.id}">
        <span class="sample" style="background:${t.bg}" aria-hidden="true">${t.bars.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${t.name}</button>`,
    ).join('')}</div>
    <p class="small muted" style="margin:8px 0 0">Automático usa o Vitral de dia e o Noturno quando o aparelho está no modo escuro.</p>
    <p class="eyebrow" style="margin-top:20px">Cor</p>
    <div class="colors" role="group" aria-label="Cor de destaque">${COLORS.map((c) => {
      const hex = c.id === 'liturgical' ? SEASON_HEX[season.color] : c.hex;
      const dot = hex
        ? `<span class="dot" style="background:${hex}"></span>`
        : '<span class="dot" style="background:conic-gradient(#6a3fd1 0 50%,#f5b544 0)"></span>';
      return `<button class="color-opt" type="button" data-color-opt="${c.id}" aria-pressed="${s.color === c.id}">${dot}${c.name}</button>`;
    }).join('')}</div>
    <p class="small muted" style="margin:8px 0 4px">Hoje: ${esc(season.name)} (${esc(L.COLOR_NAMES[season.color].toLowerCase())}). Com “Tempo litúrgico”, a cor muda sozinha ao longo do ano.</p>
    <div class="setting"><div class="label">Tamanho da letra</div>
      <div class="stepper">
        <button class="btn" type="button" data-step="-1" aria-label="Diminuir letra">A−</button>
        <output>${s.fontSize}</output>
        <button class="btn" type="button" data-step="1" aria-label="Aumentar letra">A+</button>
      </div></div>
    <div class="setting"><div class="label">Fonte</div>
      <select data-set="fontFamily" style="width:auto">${Object.entries(FONTS)
        .map(([k, f]) => `<option value="${k}"${s.fontFamily === k ? ' selected' : ''}>${f.name}</option>`)
        .join('')}</select></div>
    <div class="setting"><div class="label">Entrelinhas</div>${segHtml('lineHeight', [[1.45, 'Compacto'], [1.7, 'Normal'], [2, 'Amplo']], s.lineHeight)}</div>
    <div class="setting"><div class="label">Largura</div>${segHtml('width', [['narrow', 'Estreita'], ['medium', 'Média'], ['wide', 'Larga']], s.width)}</div>
    <div class="setting"><div class="label">Disposição<small>Um versículo por linha ou texto corrido</small></div>${segHtml('layout', [['verses', 'Versículos'], ['paragraph', 'Corrido']], s.layout)}</div>
    <label class="setting"><span class="label">Números dos versículos</span><input type="checkbox" data-set="verseNumbers"${s.verseNumbers ? ' checked' : ''}></label>
    <label class="setting"><span class="label">Texto justificado</span><input type="checkbox" data-set="justify"${s.justify ? ' checked' : ''}></label>
    <div class="preview"><sup class="vn">1</sup>No princípio era o Verbo, e o Verbo estava junto de Deus, e o Verbo era Deus.</div>`;
}

function bindDisplayControls(el) {
  const rerender = () => (el.innerHTML = displayControlsHtml());
  rerender();
  el.addEventListener('click', (e) => {
    const th = e.target.closest('[data-style-opt]');
    const co = e.target.closest('[data-color-opt]');
    const st = e.target.closest('[data-step]');
    const sg = e.target.closest('[data-seg]');
    if (th) {
      S.update((s) => (s.settings.theme = th.dataset.styleOpt));
      trackEvent(`aparencia/estilo-${th.dataset.styleOpt}`);
    } else if (co) {
      S.update((s) => (s.settings.color = co.dataset.colorOpt));
      trackEvent(`aparencia/cor-${co.dataset.colorOpt}`);
    }
    else if (st) S.update((s) => (s.settings.fontSize = Math.min(34, Math.max(13, s.settings.fontSize + +st.dataset.step))));
    else if (sg) {
      const raw = sg.dataset.val;
      S.update((s) => (s.settings[sg.dataset.seg] = isNaN(+raw) ? raw : +raw));
    } else return;
    rerender();
  });
  el.addEventListener('change', (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    S.update((s) => (s.settings[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value));
    rerender();
  });
}

$('#display-btn').addEventListener('click', () => {
  trackEvent('aparencia/abrir');
  openSheet('Aparência do texto', '<div id="display-controls"></div>', {
    onMount: (el) => bindDisplayControls($('#display-controls', el)),
  });
});

// ---------- Busca ----------
let lastSearch = null; // { key, results }

function markText(t, ranges) {
  let out = '';
  let i = 0;
  for (const [a, b] of ranges) {
    out += `${esc(t.slice(i, a))}<mark>${esc(t.slice(a, b))}</mark>`;
    i = b;
  }
  return out + esc(t.slice(i));
}

async function searchView(q, signal) {
  setView('search', 'Buscar', 'search');
  const query = (q.get('q') || '').trim();
  const mode = q.get('m') || 'all';
  const scope = q.get('s') || 'all';
  const whole = q.get('w') === '1';
  const only = q.get('b') || '';
  const groups = [...new Set(B.books().map((b) => b.group))];
  const sel = (v) => (scope === v ? ' selected' : '');

  view.innerHTML = `<div class="page">
    <h1>Buscar</h1>
    <form id="search-form" role="search">
      <div class="searchbox">${icon('search')}<input type="search" name="q" value="${esc(query)}" placeholder="Palavras, frase ou referência (ex.: Mt 5,3)" aria-label="Buscar" autocomplete="off" enterkeyhint="search"></div>
      <div class="search-opts">
        <select name="m" aria-label="Modo de busca">
          <option value="all"${mode === 'all' ? ' selected' : ''}>Todas as palavras</option>
          <option value="exact"${mode === 'exact' ? ' selected' : ''}>Frase exata</option>
          <option value="any"${mode === 'any' ? ' selected' : ''}>Qualquer palavra</option>
        </select>
        <select name="s" aria-label="Onde buscar">
          <option value="all"${sel('all')}>Bíblia inteira</option>
          <option value="AT"${sel('AT')}>Antigo Testamento</option>
          <option value="NT"${sel('NT')}>Novo Testamento</option>
          <optgroup label="Seções">${groups.map((g) => `<option value="group:${esc(g)}"${sel(`group:${g}`)}>${esc(g)}</option>`).join('')}</optgroup>
          <optgroup label="Livro">${B.books().map((b) => `<option value="${b.id}"${sel(b.id)}>${esc(b.name)}</option>`).join('')}</optgroup>
        </select>
        <label class="check"><input type="checkbox" name="w" value="1"${whole ? ' checked' : ''}> Somente palavras inteiras</label>
      </div>
    </form>
    <div id="search-out"></div>
  </div>`;

  const form = $('#search-form');
  const submit = () => {
    const fd = new FormData(form);
    const p = new URLSearchParams();
    const qq = String(fd.get('q') || '').trim();
    if (!qq) return;
    p.set('q', qq);
    if (fd.get('m') !== 'all') p.set('m', fd.get('m'));
    if (fd.get('s') !== 'all') p.set('s', fd.get('s'));
    if (fd.get('w')) p.set('w', '1');
    document.activeElement?.blur();
    go(`#/buscar?${p}`);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    trackEvent('busca/pesquisar');
    submit();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'q' && form.q.value.trim()) submit();
  });

  const out = $('#search-out');
  if (!query) {
    form.q.focus();
    const recent = S.get().searches;
    out.innerHTML = `${
      recent.length
        ? `<h2>Buscas recentes</h2><div class="chips">${recent
            .map((s) => `<a class="chip" href="#/buscar?q=${encodeURIComponent(s)}">${esc(s)}</a>`)
            .join('')}</div><p><button class="btn ghost small" type="button" id="clear-searches">Limpar buscas recentes</button></p>`
        : ''
    }
      <h2>Dicas</h2>
      <ul class="muted">
        <li>Digite uma referência para ir direto: <b>Jo 3,16</b>, <b>Sl 22</b>, <b>1 Cor 13,4-7</b>.</li>
        <li>A busca ignora acentos e maiúsculas: <b>espirito</b> encontra “Espírito”.</li>
        <li>Use “Frase exata” para expressões como <b>reino dos céus</b>.</li>
      </ul>`;
    $('#clear-searches')?.addEventListener('click', () => {
      S.update((s) => (s.searches = []));
      route();
    });
    return;
  }

  S.update(
    (s) => {
      s.searches = [query, ...s.searches.filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, 12);
    },
    { silent: true },
  );

  // Sugestão de referência ("Jo 3,16" ou nome de livro).
  const ref = B.parseRef(query);
  const refHtml = ref
    ? `<a class="card ref-suggest" href="${readHash(ref.b, ref.c, ref.v)}">${icon('book')}<span>Ir para <b>${esc(
        ref.v ? B.fmtRef(ref.b, ref.c, ref.v2 ? Array.from({ length: ref.v2 - ref.v + 1 }, (_, i) => ref.v + i) : [ref.v], { long: true }) : `${B.book(ref.b).name} ${ref.c}`,
      )}</b></span>${icon('right')}</a>`
    : '';

  const key = JSON.stringify([query, mode, scope, whole]);
  let results;
  if (lastSearch?.key === key) results = lastSearch.results;
  else {
    out.innerHTML = `${refHtml}<div class="loading" id="search-progress">Buscando…</div>`;
    results = await B.search(query, { mode, scope, whole }, (n, total) => {
      const el = $('#search-progress');
      if (el && total > 8) el.textContent = `Carregando livros… ${n}/${total}`;
    });
    if (signal.aborted) return;
    lastSearch = { key, results };
  }

  const counts = new Map();
  for (const r of results) counts.set(r.b, (counts.get(r.b) || 0) + 1);
  const shown = only && counts.has(only) ? results.filter((r) => r.b === only) : results;
  const baseQs = new URLSearchParams(q);
  baseQs.delete('b');
  const facetHref = (b) => {
    const p = new URLSearchParams(baseQs);
    if (b) p.set('b', b);
    return `#/buscar?${p}`;
  };

  const PAGE = 50;
  let page = 0;
  out.innerHTML = `${refHtml}
    <p class="muted">${results.length ? `${plural(results.length, 'versículo encontrado', 'versículos encontrados')}${counts.size > 1 ? ` em ${plural(counts.size, 'livro', 'livros')}` : ''}` : 'Nenhum versículo encontrado.'}</p>
    ${
      counts.size > 1
        ? `<div class="chips facets">
            <a class="chip${!only ? ' active' : ''}" href="${facetHref('')}">Todos <span class="count">${results.length}</span></a>
            ${[...counts]
              .map(([b, n]) => `<a class="chip${only === b ? ' active' : ''}" href="${facetHref(b)}">${esc(B.book(b).abbrev)} <span class="count">${n}</span></a>`)
              .join('')}</div>`
        : ''
    }
    <ul class="list" id="results"></ul>
    <p style="text-align:center"><button class="btn" type="button" id="more" hidden>Mostrar mais</button></p>`;

  const list = $('#results');
  const more = $('#more');
  const renderPage = () => {
    const slice = shown.slice(page * PAGE, (page + 1) * PAGE);
    list.insertAdjacentHTML(
      'beforeend',
      slice
        .map(
          (r) => `<li class="result"><a class="ref" href="${readHash(r.b, r.c, r.v)}">${esc(B.fmtRef(r.b, r.c, r.v, { long: true }))}</a>
          <p>${markText(r.t, r.ranges)}</p></li>`,
        )
        .join(''),
    );
    page++;
    more.hidden = page * PAGE >= shown.length;
    more.textContent = `Mostrar mais (${(shown.length - page * PAGE).toLocaleString('pt-BR')} restantes)`;
  };
  renderPage();
  more.addEventListener('click', renderPage);
  if (!only) window.scrollTo(0, 0);
}

// ---------- Salvos ----------
const SAVED_TABS = [
  ['favoritos', 'Favoritos'],
  ['destaques', 'Destaques'],
  ['notas', 'Notas'],
  ['historico', 'Histórico'],
];

async function savedView(q, signal) {
  setView('saved', 'Salvos', 'saved');
  const tab = SAVED_TABS.some(([k]) => k === q.get('tab')) ? q.get('tab') : 'favoritos';
  const order = q.get('o') === 'bib' ? 'bib' : 'recent';
  const color = q.get('c') || '';
  const st = S.get();
  const link = (p) => {
    const n = new URLSearchParams({ tab, ...(order === 'bib' ? { o: 'bib' } : {}), ...(color ? { c: color } : {}), ...p });
    for (const [k, v] of [...n]) if (!v) n.delete(k);
    return `#/salvos?${n}`;
  };

  const tabsHtml = `<nav class="tabs">${SAVED_TABS.map(
    ([k, n]) => `<a href="#/salvos?tab=${k}"${k === tab ? ' aria-current="page"' : ''}>${n}</a>`,
  ).join('')}</nav>`;

  if (tab === 'historico') {
    const items = st.history.filter((h) => B.book(h.b));
    view.innerHTML = `<div class="page"><h1>Salvos</h1>${tabsHtml}
      ${
        items.length
          ? `<ul class="list">${items
              .map(
                (h) => `<li class="saved-item"><div class="body"><a class="ref" href="${readHash(h.b, h.c)}">${esc(B.book(h.b).name)} ${h.c}</a>
                <div class="small muted">${fmtDate(h.t)}</div></div></li>`,
              )
              .join('')}</ul>
             <p><button class="btn danger" type="button" id="clear-history">${icon('trash')}Limpar histórico</button></p>`
          : '<div class="empty">Nenhum capítulo lido ainda.</div>'
      }</div>`;
    $('#clear-history')?.addEventListener('click', async () => {
      if (await confirmSheet('Limpar histórico', 'Apagar a lista de capítulos lidos recentemente?', 'Limpar')) {
        S.update((s) => (s.history = []));
        route();
      }
    });
    return;
  }

  const source = tab === 'favoritos' ? st.bookmarks : tab === 'destaques' ? st.highlights : st.notes;
  let keys = Object.keys(source).filter((k) => B.book(S.parseKey(k).b));
  if (tab === 'destaques' && color) keys = keys.filter((k) => source[k].c === color);
  if (order === 'bib') {
    keys.sort((a, b) => {
      const x = S.parseKey(a);
      const y = S.parseKey(b);
      return B.book(x.b).order - B.book(y.b).order || x.c - y.c || x.v - y.v;
    });
  } else keys.sort((a, b) => source[b].t - source[a].t);

  view.innerHTML = `<div class="page"><h1>Salvos</h1>${tabsHtml}<div class="loading">Carregando…</div></div>`;
  await Promise.all([...new Set(keys.map((k) => S.parseKey(k).b))].map((b) => B.loadBook(b)));
  if (signal.aborted) return;

  const items = await Promise.all(
    keys.map(async (k) => {
      const { b, c, v } = S.parseKey(k);
      const ch = await B.chapter(b, c);
      const vs = tab === 'notas' && source[k].vs ? source[k].vs : [v];
      return { k, b, c, v, vs, text: vs.map((n) => ch?.[n - 1] || '').join(' '), item: source[k] };
    }),
  );
  if (signal.aborted) return;

  const emptyMsg = {
    favoritos: 'Nenhum favorito. Toque em um versículo durante a leitura e escolha “Favoritar”.',
    destaques: 'Nenhum destaque. Toque em um versículo e escolha uma cor.',
    notas: 'Nenhuma nota. Toque em um versículo e escolha “Nota”.',
  }[tab];

  view.innerHTML = `<div class="page"><h1>Salvos</h1>${tabsHtml}
    <div class="row" style="margin:8px 0 4px">
      ${segHtml('order', [['recent', 'Recentes'], ['bib', 'Ordem bíblica']], order)}
    </div>
    ${
      tab === 'destaques'
        ? `<div class="chips" style="margin:10px 0"><a class="chip${!color ? ' active' : ''}" href="${link({ c: '' })}">Todas</a>${HL.map(
            (h) => `<a class="chip${color === h.id ? ' active' : ''}" href="${link({ c: h.id })}"><span class="dot" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--hl-${h.id});border:1px solid var(--border)"></span>${h.name}</a>`,
          ).join('')}</div>`
        : ''
    }
    ${
      items.length
        ? `<p class="small muted">${plural(items.length, 'item', 'itens')}</p><ul class="list">${items
            .map(
              (it) => `<li class="saved-item">
                ${tab === 'destaques' ? `<span class="dot" style="background:var(--hl-${it.item.c})"></span>` : ''}
                <div class="body">
                  <a class="ref" href="${readHash(it.b, it.c, it.v)}">${esc(B.fmtRef(it.b, it.c, it.vs, { long: true }))}</a>
                  <p>${esc(it.text)}</p>
                  ${tab === 'notas' ? `<div class="note-text">${esc(it.item.text)}</div>` : ''}
                  <div class="small muted" style="margin-top:4px">${fmtDate(it.item.t)}</div>
                </div>
                <div>
                  ${tab === 'notas' ? `<button class="icon-btn" type="button" data-edit="${it.k}" aria-label="Editar nota">${icon('note')}</button>` : ''}
                  <button class="icon-btn" type="button" data-remove="${it.k}" aria-label="Remover">${icon('trash')}</button>
                </div>
              </li>`,
            )
            .join('')}</ul>`
        : `<div class="empty">${emptyMsg}</div>`
    }</div>`;

  view.addEventListener(
    'click',
    async (e) => {
      const sg = e.target.closest('[data-seg="order"]');
      if (sg) location.replace(link({ o: sg.dataset.val === 'bib' ? 'bib' : '' }));
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        const k = rm.dataset.remove;
        const map = tab === 'favoritos' ? 'bookmarks' : tab === 'destaques' ? 'highlights' : 'notes';
        const backup = S.get()[map][k];
        S.update((s) => delete s[map][k]);
        route();
        toast('Removido', { action: 'Desfazer', onAction: () => (S.update((s) => (s[map][k] = backup)), route()), ms: 5000 });
      }
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const { b, c } = S.parseKey(ed.dataset.edit);
        const n = S.get().notes[ed.dataset.edit];
        ctx = { b, c, texts: await B.chapter(b, c) };
        editNote(b, c, n.vs || [S.parseKey(ed.dataset.edit).v]);
        sheetOnClose = () => route();
      }
    },
    { signal },
  );
}

// ---------- Planos ----------
function completePlanDay(id, day) {
  if (!id || !P.plan(id)) return;
  const d = P.schedule(id)[day];
  S.update((s) => {
    s.plans[id] ||= { start: P.todayISO(), done: {} };
    s.plans[id].done[day] = Date.now();
    for (const x of d) s.read[S.ckey(x.b, x.c)] ||= Date.now();
  });
}

function plansView() {
  setView('plans', 'Planos de leitura', 'plans');
  const st = S.get();
  view.innerHTML = `<div class="page">
    <h1>Planos de leitura</h1>
    <p class="muted">Escolha um plano. Cada dia traz uma porção equilibrada de leitura.</p>
    ${P.PLANS.map((p) => {
      const prog = st.plans[p.id];
      const days = P.schedule(p.id);
      const done = prog ? Object.keys(prog.done).length : 0;
      return `<a class="card plan-card" href="#/planos/${p.id}">
        <div class="row"><b>${esc(p.name)}</b><span class="spacer"></span>${st.activePlan === p.id ? '<span class="chip active">Ativo</span>' : ''}</div>
        <p class="muted small" style="margin:4px 0 0">${esc(p.desc)} · ${plural(days.length, 'dia', 'dias')}</p>
        ${prog ? `<div class="row"><div class="progress" style="flex:1"><span style="width:${(done / days.length) * 100}%"></span></div><span class="small muted">${done}/${days.length}</span></div>` : ''}
      </a>`;
    }).join('')}
  </div>`;
}

function planView(id, signal) {
  const p = P.plan(id);
  if (!p) return notFound();
  setView('plans', p.name, 'plans');
  const st = S.get();
  const prog = st.plans[id];
  const days = P.schedule(id);

  if (!prog) {
    view.innerHTML = `<div class="page">
      <a class="btn ghost" href="#/planos">${icon('left')}Planos</a>
      <h1>${esc(p.name)}</h1>
      <p class="muted">${esc(p.desc)} ${plural(days.length, 'dia', 'dias')}, cerca de ${Math.round(days.reduce((s, d) => s + d.length, 0) / days.length)} capítulo(s) por dia.</p>
      <label class="field"><span>Data de início</span><input type="text" id="plan-start" value="${P.todayISO()}" inputmode="numeric" pattern="\\d{4}-\\d{2}-\\d{2}" aria-describedby="start-help"></label>
      <p class="small muted" id="start-help">Formato AAAA-MM-DD.</p>
      <button class="btn primary" type="button" id="plan-begin">${icon('calendar')}Começar plano</button>
      <h2>Primeiros dias</h2>
      <ul class="list">${days
        .slice(0, 7)
        .map((d, i) => `<li class="day"><div class="label"><b>Dia ${i + 1}</b><small>${esc(P.dayLabel(d))}</small></div></li>`)
        .join('')}</ul>
    </div>`;
    const inp = $('#plan-start');
    inp.type = 'date';
    $('#plan-begin').addEventListener('click', () => {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(inp.value) ? inp.value : P.todayISO();
      S.update((s) => {
        s.plans[id] = { start, done: {} };
        s.activePlan = id;
      });
      toast('Plano iniciado');
      route();
    });
    return;
  }

  const today = P.dayIndex(prog.start);
  const done = Object.keys(prog.done).length;
  const [y, m, d0] = prog.start.split('-').map(Number);
  const dateOf = (i) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(y, m - 1, d0 + i));
  const behind = days.slice(0, Math.min(today, days.length)).filter((_, i) => !prog.done[i]).length;

  view.innerHTML = `<div class="page">
    <a class="btn ghost" href="#/planos">${icon('left')}Planos</a>
    <h1>${esc(p.name)}</h1>
    <div class="card">
      <div class="row"><b>${done} de ${days.length} dias concluídos</b><span class="spacer"></span><span class="muted small">${Math.round((done / days.length) * 100)}%</span></div>
      <div class="progress" style="margin:10px 0"><span style="width:${(done / days.length) * 100}%"></span></div>
      <p class="small muted" style="margin:0">Início: ${fmtDate(new Date(y, m - 1, d0))}${today >= 0 && today < days.length ? ` · Hoje é o dia ${today + 1}` : ''}${behind ? ` · ${plural(behind, 'dia', 'dias')} em atraso` : ''}</p>
      <div class="row" style="margin-top:12px">
        ${st.activePlan !== id ? `<button class="btn primary" type="button" id="plan-activate">Tornar plano ativo</button>` : '<span class="chip active">Plano ativo</span>'}
        <span class="spacer"></span>
        <button class="btn danger" type="button" id="plan-reset">${icon('trash')}Reiniciar</button>
      </div>
    </div>
    <ul class="list" id="days">${days
      .map((d, i) => {
        const isDone = !!prog.done[i];
        return `<li class="day${isDone ? ' done' : ''}${i === today ? ' today' : ''}" id="day-${i}">
          <input type="checkbox" data-day="${i}"${isDone ? ' checked' : ''} aria-label="Dia ${i + 1} concluído">
          <div class="label"><b>Dia ${i + 1}</b> <span class="small muted">· ${dateOf(i)}</span><small>${esc(P.dayLabel(d))}</small></div>
          <a class="btn" href="${readHash(d[0].b, d[0].c)}">Ler</a>
        </li>`;
      })
      .join('')}</ul>
  </div>`;

  const focus = $(`#day-${Math.min(Math.max(today, 0), days.length - 1)}`);
  focus?.scrollIntoView({ block: 'center' });

  view.addEventListener(
    'change',
    (e) => {
      const cb = e.target.closest('[data-day]');
      if (!cb) return;
      const i = +cb.dataset.day;
      if (cb.checked) completePlanDay(id, i);
      else S.update((s) => delete s.plans[id].done[i]);
      cb.closest('.day').classList.toggle('done', cb.checked);
    },
    { signal },
  );
  $('#plan-activate')?.addEventListener('click', () => {
    S.update((s) => (s.activePlan = id));
    route();
  });
  $('#plan-reset').addEventListener('click', async () => {
    if (await confirmSheet('Reiniciar plano', 'O progresso deste plano será apagado. Os capítulos marcados como lidos continuam.', 'Reiniciar')) {
      S.update((s) => {
        delete s.plans[id];
        if (s.activePlan === id) s.activePlan = null;
      });
      route();
    }
  });
}

// ---------- Ajustes ----------
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function offlineCount() {
  if (!('caches' in window)) return null;
  let n = 0;
  for (const b of B.books()) if (await caches.match(`data/books/${b.id}.json`)) n++;
  return n;
}

async function settingsView(signal) {
  setView('settings', 'Ajustes', '');
  const s = S.settings();
  const meta = B.meta();
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  view.innerHTML = `<div class="page">
    <h1>Ajustes</h1>

    <h2>Aparência</h2>
    <div class="card" id="display-controls"></div>

    <h2>Leitura</h2>
    <div class="card">
      <label class="setting"><span class="label">Modo imersivo<small>Esconde as barras ao rolar o texto</small></span><input type="checkbox" data-opt="immersive"${s.immersive ? ' checked' : ''}></label>
      <label class="setting"><span class="label">Manter tela ligada<small>Durante a leitura (se o aparelho permitir)</small></span><input type="checkbox" data-opt="keepAwake"${s.keepAwake ? ' checked' : ''}></label>
    </div>

    <h2>Leitura em voz alta</h2>
    <div class="card">
      ${
        T.supported()
          ? `<label class="field"><span>Voz</span><select data-opt="ttsVoice" id="voice-select"></select></label>
             <label class="field"><span>Velocidade: <output id="rate-out">${s.ttsRate.toFixed(1)}×</output></span>
               <input type="range" min="0.5" max="2" step="0.1" value="${s.ttsRate}" data-opt="ttsRate"></label>
             <label class="setting"><span class="label">Continuar no próximo capítulo</span><input type="checkbox" data-opt="ttsContinue"${s.ttsContinue ? ' checked' : ''}></label>`
          : '<p class="muted">Seu navegador não oferece leitura em voz alta.</p>'
      }
    </div>

    <h2>Uso offline</h2>
    <div class="card">
      <p id="offline-status" class="muted">Verificando…</p>
      <div class="progress" id="offline-progress" hidden><span style="width:0"></span></div>
      <p><button class="btn primary" type="button" id="offline-dl">${icon('download')}Baixar Bíblia completa</button></p>
    </div>

    <h2>Instalar aplicativo</h2>
    <div class="card" id="install-card">
      ${
        isStandalone()
          ? '<p class="muted" style="margin:0">O app já está instalado neste aparelho.</p>'
          : `<p class="muted" style="margin-top:0">Instale para abrir como um aplicativo, em tela cheia e sem internet.</p>
             <button class="btn primary" type="button" id="install-btn">${icon('download')}Instalar</button>
             <p class="small muted" id="install-help" hidden>${
               ios
                 ? 'No iPhone/iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
                 : 'Use o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.'
             }</p>`
      }
    </div>

    <h2>Backup dos seus dados</h2>
    <div class="card">
      <p class="muted" style="margin-top:0">Favoritos, destaques, notas, planos e ajustes ficam salvos só neste navegador. Exporte um arquivo para guardar ou levar a outro aparelho.</p>
      <div class="row">
        <button class="btn" type="button" id="export-btn">${icon('download')}Exportar</button>
        <label class="btn">${icon('upload')}Importar<input type="file" id="import-file" accept="application/json,.json" hidden></label>
        <span class="spacer"></span>
        <button class="btn danger" type="button" id="reset-btn">${icon('trash')}Apagar tudo</button>
      </div>
    </div>

    <h2>Sobre</h2>
    <div class="card">
      <p style="margin-top:0"><b>${esc(meta.title)}</b></p>
      <p class="small muted">${esc(meta.translator)} · ${esc(meta.source)} · ${esc(meta.approval)}</p>
      <p class="small">${meta.totalBooks} livros · ${meta.totalChapters.toLocaleString('pt-BR')} capítulos · ${meta.totalVerses.toLocaleString('pt-BR')} versículos.</p>
      <p class="small">Os Salmos seguem a numeração da Vulgata (a maioria tem um número a menos que na numeração hebraica). No Salmo, o leitor mostra a numeração hebraica correspondente.</p>
      <p class="small">Texto: <a href="${esc(meta.origin)}" target="_blank" rel="noopener">bibliacatolica/biblia</a> (${esc(meta.license)}). Revisado de OCR com auxílio de IA; podem existir erros pontuais.</p>
      <p class="small muted" style="margin-bottom:0">Versão do app ${APP_VERSION}</p>
    </div>
  </div>`;

  bindDisplayControls($('#display-controls'));

  // Ajustes de leitura e voz.
  const fillVoices = () => {
    const sel = $('#voice-select');
    if (!sel) return;
    const vs = T.voices();
    sel.innerHTML =
      `<option value="">Padrão do sistema</option>` +
      vs.map((v) => `<option value="${esc(v.voiceURI)}"${S.settings().ttsVoice === v.voiceURI ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  };
  fillVoices();
  T.onVoicesChanged(fillVoices);
  view.addEventListener(
    'input',
    (e) => {
      const k = e.target.dataset.opt;
      if (!k) return;
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value;
      S.update((st) => (st.settings[k] = val));
      if (k === 'ttsRate') $('#rate-out').textContent = `${val.toFixed(1)}×`;
    },
    { signal },
  );

  // Offline.
  const status = $('#offline-status');
  const showCount = async () => {
    const n = await offlineCount();
    if (signal.aborted) return;
    if (n === null || !navigator.serviceWorker?.controller) {
      status.textContent = 'O uso offline fica disponível depois que o app termina de carregar (recarregue a página se necessário).';
      if (n === null) $('#offline-dl').hidden = true;
      return;
    }
    status.textContent = n === meta.totalBooks ? 'A Bíblia completa está disponível offline.' : `${n} de ${meta.totalBooks} livros salvos para uso offline.`;
    $('#offline-dl').hidden = n === meta.totalBooks;
  };
  showCount();
  $('#offline-dl').addEventListener('click', async () => {
    const btn = $('#offline-dl');
    const bar = $('#offline-progress');
    trackEvent('offline/baixar-biblia');
    btn.disabled = true;
    bar.hidden = false;
    const ids = B.books().map((b) => b.id);
    let n = 0;
    try {
      for (let i = 0; i < ids.length; i += 6) {
        await Promise.all(
          ids.slice(i, i + 6).map(async (id) => {
            const r = await fetch(`data/books/${id}.json`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            await r.arrayBuffer();
            n++;
            $('span', bar).style.width = `${(n / ids.length) * 100}%`;
            status.textContent = `Baixando… ${n}/${ids.length}`;
          }),
        );
      }
      toast('Bíblia salva para uso offline');
    } catch {
      toast('Falha no download. Verifique a conexão.');
    }
    btn.disabled = false;
    bar.hidden = true;
    showCount();
  });

  // Instalação.
  $('#install-btn')?.addEventListener('click', async () => {
    trackEvent('app/instalar');
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      if (outcome === 'accepted') toast('Instalando…');
    } else $('#install-help').hidden = false;
  });

  // Backup.
  $('#export-btn').addEventListener('click', () => {
    trackEvent('backup/exportar');
    const blob = new Blob([S.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `biblia-backup-${P.todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import-file').addEventListener('change', async (e) => {
    trackEvent('backup/importar');
    const f = e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (!(await confirmSheet('Importar backup', 'Os dados atuais deste navegador serão substituídos pelos do arquivo.', 'Importar'))) return;
      S.importData(text);
      toast('Backup importado');
      route();
    } catch {
      toast('Arquivo de backup inválido');
    } finally {
      e.target.value = '';
    }
  });
  $('#reset-btn').addEventListener('click', async () => {
    if (await confirmSheet('Apagar tudo', 'Apagar favoritos, destaques, notas, planos, histórico e ajustes deste navegador? Isso não pode ser desfeito.', 'Apagar tudo')) {
      S.resetAll();
      toast('Dados apagados');
      route();
    }
  });
}

// ---------- Service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      const notify = (w) =>
        toast('Nova versão disponível', { action: 'Atualizar', onAction: () => w.postMessage('skipWaiting'), ms: 0 });
      if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w);
        });
      });
    })
    .catch((e) => console.warn('SW:', e));
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}

// ---------- Início do app ----------
async function start() {
  applySettings();
  view.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    await B.loadIndex();
  } catch (e) {
    view.innerHTML = `<div class="page"><div class="empty"><p>Não foi possível carregar a Bíblia.</p>
      <p class="small">Verifique sua conexão e tente novamente.</p>
      <button class="btn" type="button" onclick="location.reload()">Tentar novamente</button></div></div>`;
    return;
  }
  // Re-renderizações internas chamam route() direto; só navegações reais contam visita.
  const navigate = async () => {
    await route();
    trackView();
  };
  window.addEventListener('hashchange', navigate);
  await navigate();
  registerSW();
}

start();
