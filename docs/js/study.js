// Camada de estudo por perícopes: índice por livro (data/estudo/<LIVRO>/index.json)
// e um arquivo por perícope (data/estudo/<LIVRO>/<c>.<v>.json). Livros sem estudo devolvem null.

const indexCache = new Map(); // id -> Promise<index|null>
const periCache = new Map(); // "MRK.1.1" -> Promise<pericope|null>

const getJson = (url) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

let livros = null; // Promise<Set<string>>
const hasStudy = (id) => {
  if (!livros) {
    livros = getJson('data/estudo/livros.json').then((l) => new Set(Array.isArray(l) ? l : []));
    livros.then((s) => s.size || (livros = null));
  }
  return livros.then((s) => s.has(id));
};

export async function bookIndex(id) {
  if (!(await hasStudy(id))) return null;
  if (!indexCache.has(id)) {
    const p = getJson(`data/estudo/${id}/index.json`);
    p.then((x) => x || indexCache.delete(id)); // sem estudo ou offline: tenta de novo depois
    indexCache.set(id, p);
  }
  return indexCache.get(id);
}

export function pericope(id, c, v) {
  const key = `${id}.${c}.${v}`;
  if (!periCache.has(key)) {
    const p = getJson(`data/estudo/${id}/${c}.${v}.json`);
    p.then((x) => x || periCache.delete(key));
    periCache.set(key, p);
  }
  return periCache.get(key);
}

const cmp = (a, b) => a.c - b.c || a.v - b.v;
export const contains = (p, c, v) => cmp(p.ini, { c, v }) <= 0 && cmp({ c, v }, p.fim) <= 0;

// Perícope que contém o versículo, com as vizinhas.
export function locate(index, c, v) {
  const i = index.pericopes.findIndex((p) => contains(p, c, v));
  if (i < 0) return null;
  return { cur: index.pericopes[i], prev: index.pericopes[i - 1] || null, next: index.pericopes[i + 1] || null, i };
}

// Títulos que começam neste capítulo: { [versículo]: { p, novaSecao } }.
export function headingsFor(index, c) {
  const out = {};
  index.pericopes.forEach((p, i) => {
    if (p.ini.c !== c) return;
    const before = index.pericopes[i - 1];
    out[p.ini.v] = { p, novaSecao: !before || before.secao !== p.secao };
  });
  return out;
}
