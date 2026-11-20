// Estado do usuário persistido no localStorage: ajustes, marcadores,
// destaques, notas, histórico, capítulos lidos e planos de leitura.

const KEY = 'biblia:v1';

export const DEFAULT_SETTINGS = {
  theme: 'auto', // auto | vitral | noturno
  color: 'liturgical', // liturgical | verde | roxo | dourado | vermelho | rosa
  fontSize: 19,
  fontFamily: 'style', // style | serif | classic | sans | readable
  lineHeight: 1.7,
  width: 'medium', // narrow | medium | wide
  layout: 'verses', // verses | paragraph
  verseNumbers: true,
  justify: false,
  immersive: true, // esconde as barras ao rolar para baixo
  readMode: 'off', // off | sepia | night | auto (sépia de dia, noturno das 19h às 6h)
  keepAwake: false,
  ttsRate: 1,
  ttsVoice: '',
  ttsContinue: true,
};

const empty = () => ({
  settings: { ...DEFAULT_SETTINGS },
  highlights: {}, // "GEN.1.1": { c: 'yellow', t: timestamp }
  bookmarks: {}, // "GEN.1.1": { t }
  notes: {}, // "GEN.1.1": { text, t }
  history: [], // [{ b, c, t }] mais recente primeiro
  last: null, // { b, c, y } posição de leitura
  read: {}, // "GEN.1": timestamp
  plans: {}, // id: { start: 'YYYY-MM-DD', done: { [dia]: timestamp } }
  activePlan: null,
  searches: [], // buscas recentes
  lastStudy: null, // { b, c, v, t, r } última perícope estudada (r = referência)
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return normalize(JSON.parse(raw));
  } catch {
    return empty();
  }
}

function normalize(data) {
  const base = empty();
  const out = { ...base, ...(data && typeof data === 'object' ? data : {}) };
  out.settings = { ...DEFAULT_SETTINGS, ...(out.settings || {}) };
  // Temas antigos (claro/sépia/escuro/preto) viram os estilos atuais.
  const legacy = { light: 'vitral', sepia: 'vitral', dark: 'noturno', black: 'noturno' };
  if (legacy[out.settings.theme]) out.settings.theme = legacy[out.settings.theme];
  // "Padrão do estilo" saiu das opções: passa a seguir o tempo litúrgico.
  if (out.settings.color === 'style') out.settings.color = 'liturgical';
  // "Leitura noturna" (1.7) virou "Modo leitura".
  if ('nightMode' in out.settings) {
    if (out.settings.readMode === 'off') out.settings.readMode = { on: 'night', auto: 'auto' }[out.settings.nightMode] || 'off';
    delete out.settings.nightMode;
  }
  for (const k of ['highlights', 'bookmarks', 'notes', 'read', 'plans']) {
    if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {};
  }
  if (!Array.isArray(out.history)) out.history = [];
  if (!Array.isArray(out.searches)) out.searches = [];
  return out;
}

let state = load();
const listeners = new Set();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* armazenamento indisponível (modo privado): segue só em memória */
  }
}

export const get = () => state;
export const settings = () => state.settings;

export function update(fn, { silent = false } = {}) {
  fn(state);
  save();
  if (!silent) listeners.forEach((l) => l(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const vkey = (b, c, v) => `${b}.${c}.${v}`;
export const ckey = (b, c) => `${b}.${c}`;
export function parseKey(k) {
  const [b, c, v] = k.split('.');
  return { b, c: +c, v: +v };
}

export function addHistory(b, c) {
  update(
    (s) => {
      s.history = [{ b, c, t: Date.now() }, ...s.history.filter((h) => !(h.b === b && h.c === c))].slice(0, 50);
    },
    { silent: true },
  );
}

export function exportData() {
  return JSON.stringify({ app: 'biblia-catolica', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importData(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Arquivo inválido');
  const next = normalize(data);
  delete next.app;
  delete next.version;
  delete next.exportedAt;
  state = next;
  save();
  listeners.forEach((l) => l(state));
}

export function resetAll() {
  state = empty();
  save();
  listeners.forEach((l) => l(state));
}
