// Acesso ao texto bíblico: índice, capítulos, referências e busca.

let index = null;
const byId = new Map();
const exactMap = new Map(); // com acentos
const foldMap = new Map(); // sem acentos
const bookCache = new Map(); // id -> Promise<string[][]>
const foldCache = new Map(); // id -> string[][] (texto sem acentos, minúsculo)

export const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const compact = (s) => s.toLowerCase().replace(/[\s.]/g, '');

export async function loadIndex() {
  if (index) return index;
  const res = await fetch('data/index.json');
  if (!res.ok) throw new Error('Não foi possível carregar o índice da Bíblia');
  index = await res.json();
  index.books.forEach((b, i) => {
    b.order = i;
    b.chapters = b.verses.length;
    byId.set(b.id, b);
  });
  // Abreviações têm prioridade sobre nomes/slugs (ex.: slug de Jó é "jo", abreviação de João é "Jo").
  const register = (b, keys) => {
    for (const k of keys.map(compact)) {
      if (!exactMap.has(k)) exactMap.set(k, b.id);
      const f = fold(k);
      if (!foldMap.has(f)) foldMap.set(f, b.id);
    }
  };
  index.books.forEach((b) => register(b, [b.id, b.abbrev, ...b.aliases]));
  index.books.forEach((b) => register(b, [b.name, b.slug]));
  // "Jo" sem acento é São João; "Jó" (com acento) continua sendo Jó.
  foldMap.set('jo', 'JHN');
  return index;
}

export const meta = () => index;
export const books = () => index.books;
export const book = (id) => byId.get(id);
export const testament = (t) => index.books.filter((b) => b.testament === t);

export function adjacent(b, c, dir) {
  const bk = byId.get(b);
  if (!bk) return null;
  const n = c + dir;
  if (n >= 1 && n <= bk.chapters) return { b, c: n };
  const other = index.books[bk.order + dir];
  if (!other) return null;
  return { b: other.id, c: dir > 0 ? 1 : other.chapters };
}

export function loadBook(id) {
  if (!bookCache.has(id)) {
    const p = fetch(`data/books/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`Falha ao carregar ${id}`);
      return r.json();
    });
    p.catch(() => bookCache.delete(id));
    bookCache.set(id, p);
  }
  return bookCache.get(id);
}

export async function chapter(id, c) {
  const data = await loadBook(id);
  return data[c - 1] || null;
}

export async function verseText(b, c, v) {
  const ch = await chapter(b, c);
  return ch?.[v - 1] ?? '';
}

export async function loadAll(onProgress) {
  let done = 0;
  const total = index.books.length;
  // Lotes pequenos para não saturar a rede em celulares.
  const ids = index.books.map((b) => b.id);
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(
      ids.slice(i, i + 8).map((id) =>
        loadBook(id).then(() => {
          done++;
          onProgress?.(done, total);
        }),
      ),
    );
  }
}

// ---------- Referências ----------

export function findBook(name) {
  const k = compact(name);
  if (!k) return null;
  const id = exactMap.get(k) || foldMap.get(fold(k));
  if (id) return byId.get(id);
  const f = fold(k);
  if (f.length < 2) return null;
  return index.books.find((b) => fold(compact(b.name)).startsWith(f) || b.slug.replace(/-/g, '').startsWith(f)) || null;
}

const REF_RE = /^\s*((?:[1-3]\s*)?[^\d\s][^\d]*?)\.?\s*(\d+)?(?:\s*[,:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/u;

// "Jo 3,16", "joao 3:16-18", "1 Cor 13", "Gênesis" -> { b, c, v, v2 }
export function parseRef(input) {
  const m = String(input || '').match(REF_RE);
  if (!m) return null;
  const bk = findBook(m[1]);
  if (!bk) return null;
  const c = m[2] ? +m[2] : 1;
  if (c < 1 || c > bk.chapters) return null;
  const max = bk.verses[c - 1];
  let v = m[3] ? +m[3] : null;
  let v2 = m[4] ? +m[4] : null;
  if (v && (v < 1 || v > max)) return null;
  if (v2 && (v2 < v || v2 > max)) v2 = null;
  return { b: bk.id, c, v, v2, explicitChapter: !!m[2] };
}

// [16,17,18,20] -> "16-18.20"
export function verseList(vs) {
  const s = [...new Set(vs)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (s[j + 1] === s[j] + 1) j++;
    parts.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j;
  }
  return parts.join('.');
}

export function fmtRef(b, c, vs, { long = false } = {}) {
  const bk = byId.get(b);
  const name = long ? bk.name : bk.abbrev;
  const list = Array.isArray(vs) ? vs : vs ? [vs] : [];
  return list.length ? `${name} ${c},${verseList(list)}` : `${name} ${c}`;
}

// Os Salmos seguem a numeração da Vulgata; devolve a numeração hebraica correspondente.
export function psalmHebrew(n) {
  if (n <= 8 || n >= 148) return null;
  if (n === 9) return '9–10';
  if (n <= 112) return String(n + 1);
  if (n === 113) return '114–115';
  if (n === 114 || n === 115) return '116';
  if (n <= 145) return String(n + 1);
  return '147';
}

// ---------- Busca ----------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function folded(id, data) {
  if (!foldCache.has(id)) foldCache.set(id, data.map((ch) => ch.map(fold)));
  return foldCache.get(id);
}

export function buildMatchers(query, { mode = 'all', whole = false } = {}) {
  const q = fold(query).trim().replace(/\s+/g, ' ');
  if (!q) return null;
  const terms = mode === 'exact' ? [q] : [...new Set(q.split(' ').filter(Boolean))];
  const wrap = (t) => (whole ? `(?<![\\p{L}\\p{N}])${escapeRe(t)}(?![\\p{L}\\p{N}])` : escapeRe(t));
  return { mode, terms, res: terms.map((t) => new RegExp(wrap(t), 'gu')) };
}

// Intervalos [início, fim] onde os termos aparecem (texto sem acentos tem o mesmo comprimento).
export function matchRanges(foldedText, matchers) {
  const ranges = [];
  let hits = 0;
  for (const re of matchers.res) {
    re.lastIndex = 0;
    let found = false;
    let m;
    while ((m = re.exec(foldedText))) {
      ranges.push([m.index, m.index + m[0].length]);
      found = true;
      if (m[0].length === 0) re.lastIndex++;
    }
    if (found) hits++;
  }
  const ok = matchers.mode === 'any' ? hits > 0 : hits === matchers.res.length;
  if (!ok) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

// scope: 'all' | 'AT' | 'NT' | 'group:<nome>' | '<ID do livro>'
export function scopeBooks(scope) {
  if (!scope || scope === 'all') return index.books;
  if (scope === 'AT' || scope === 'NT') return testament(scope);
  if (scope.startsWith('group:')) return index.books.filter((b) => b.group === scope.slice(6));
  return byId.has(scope) ? [byId.get(scope)] : index.books;
}

export async function search(query, opts = {}, onProgress) {
  const matchers = buildMatchers(query, opts);
  if (!matchers) return [];
  const list = scopeBooks(opts.scope);
  let loaded = 0;
  await Promise.all(list.map((b) => loadBook(b.id).then(() => onProgress?.(++loaded, list.length))));
  const results = [];
  for (const bk of list) {
    const data = await loadBook(bk.id);
    const f = folded(bk.id, data);
    for (let c = 0; c < data.length; c++) {
      for (let v = 0; v < data[c].length; v++) {
        const ranges = matchRanges(f[c][v], matchers);
        if (ranges) results.push({ b: bk.id, c: c + 1, v: v + 1, t: data[c][v], ranges });
      }
    }
  }
  return results;
}
