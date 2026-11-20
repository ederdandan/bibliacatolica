#!/usr/bin/env node
// Converte a Catena Aurea local (repositório catena-aurea, data/*.json) em
// docs/data/catena/{MAT,MRK,LUK,JHN}.json, já na numeração do Matos Soares.
//
// Só o comentário é aproveitado: o texto dos Evangelhos que vem nesse repositório
// é de outra tradução e é descartado.
//
// Uso:
//   node scripts/build-catena.mjs                      (usa ../../catena-aurea)
//   node scripts/build-catena.mjs C:/caminho/catena-aurea

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(process.argv[2] || join(ROOT, '..', '..', '..', 'catena-aurea'));
const OUT = join(ROOT, 'docs', 'data', 'catena');

const GOSPELS = { MAT: 'mateus', MRK: 'marcos', LUK: 'lucas', JHN: 'joao' };

// Versificação: a Catena usa a numeração moderna; o Matos Soares, a da Vulgata.
// Cada regra devolve o intervalo [c, v1, v2] do Matos Soares para um versículo da Catena.
const MAP = {
  MAT: (c, v) => (c === 17 && v >= 15 ? [17, v - 1, v - 1] : null), // MS 17,14 = Catena 17,14-15
  MRK: (c, v) => {
    if (c === 4 && v === 41) return [4, 40, 40]; // MS 4,40 = Catena 4,40-41
    if (c === 9 && v === 1) return [8, 39, 39]; // MS 8,39 = Catena 9,1
    if (c === 9) return [9, v - 1, v - 1];
    return null;
  },
  JHN: (c, v) => {
    if (c === 6 && v === 51) return [6, 51, 52]; // Catena 6,51 = MS 6,51-52
    if (c === 6 && v > 51) return [6, v + 1, v + 1];
    return null;
  },
  LUK: () => null,
};
const toMS = (id, c, v) => MAP[id](c, v) || [c, v, v];

// Nomes que abrem cada trecho ("Santo Agostinho. (obra) texto…"). Lista fechada:
// uma linha que comece com outro nome é tratada como continuação do trecho anterior.
const AUTORES = new Set([
  'São João Crisóstomo', 'Santo Agostinho', 'São Jerônimo', 'São Beda, o Venerável', 'Teofilato',
  'Pseudo-Crisóstomo', 'Orígenes', 'Santo Hilário', 'São Remígio', 'Glosa', 'São Gregório Magno',
  'Rábano Mauro', 'Pseudo-Jerônimo', 'Alcuíno', 'Santo Ambrósio', 'São Leão Magno', 'Pseudo-Agostinho',
  'São Pedro Crisólogo', 'São Cipriano', 'Pseudo-Orígenes', 'Haymo', 'São Cirilo de Alexandria',
  'Severiano', 'Dídimo', 'São João Cassiano', 'São Basílio', 'Eusébio', 'São João Damasceno',
  'Pseudo-Dionísio', 'Concílio de Éfeso', 'Teódoto de Ancira', 'Santo Isidoro', 'Ambrosiaster',
  'Pseudo-Atanásio', 'São Gregório de Nissa', 'Santo Isidoro de Pelúsio', 'Genádio', 'Petrus Alfonsus',
  'São Máximo', 'Nemésio', 'Segundo Concílio de Constantinopla', 'Santo Pascásio Radberto', 'Lanfranc',
  'Tito de Bostra', 'Expositor Grego', 'Santo Atanásio', 'São Gregório de Nazianzo', 'Santo Epifânio',
  'Pseudo-Basílio', 'São Cirilo de Jerusalém', 'Clemente de Alexandria', 'São Dionísio de Alexandria',
]);
const AUTHOR = /^([^.()\n]{2,45})\.\s+/;
const VERSE_LINE = /^\d+\.\s/;
const desconhecidos = {};

function parseRange(range, chapter) {
  const m = range.match(/^(\d+):(\d+)(?:[–-](\d+))?$/);
  if (!m || +m[1] !== +chapter) throw new Error(`faixa inesperada: ${range} (cap. ${chapter})`);
  return [+m[1], +m[2], +(m[3] || m[2])];
}

function parseTrechos(text, where) {
  // Lucas separa os trechos com uma quebra de linha; os demais, com duas. Por isso, linha a linha.
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  let i = 0;
  while (i < paras.length && VERSE_LINE.test(paras[i])) i++; // texto evangélico de outra tradução: descartado
  const out = [];
  for (const p of paras.slice(i)) {
    const m = p.match(AUTHOR);
    if (m && !AUTORES.has(m[1].trim()) && !VERSE_LINE.test(p)) desconhecidos[m[1].trim()] = where;
    if (m && AUTORES.has(m[1].trim())) {
      let rest = p.slice(m[0].length);
      let obra = null;
      const o = rest.match(/^\(([^)]{1,120})\)\s*/);
      if (o) {
        obra = o[1].trim();
        rest = rest.slice(o[0].length);
      }
      out.push({ autor: m[1].trim(), obra, texto: rest.trim() });
    } else if (out.length) {
      out[out.length - 1].texto += '\n' + p; // continuação do trecho anterior
    } else {
      throw new Error(`trecho sem autor em ${where}: ${p.slice(0, 60)}`);
    }
  }
  return out;
}

const ours = async (id) => JSON.parse(await readFile(join(ROOT, 'docs', 'data', 'books', `${id}.json`), 'utf8'));

await mkdir(OUT, { recursive: true });
let total = { blocos: 0, trechos: 0 };
for (const [id, file] of Object.entries(GOSPELS)) {
  const src = JSON.parse(await readFile(join(SRC, 'data', `${file}.json`), 'utf8'));
  const bible = await ours(id);
  const exists = (c, v) => c >= 1 && c <= bible.length && v >= 1 && v <= bible[c - 1].length;
  const blocos = [];
  const autores = {};

  for (const [ch, blocks] of Object.entries(src.commentary)) {
    for (const b of Object.values(blocks)) {
      const [c, v1, v2] = parseRange(b.range, ch);
      const a = toMS(id, c, v1);
      const z = toMS(id, c, v2);
      const ini = { c: a[0], v: a[1] };
      const fim = { c: z[0], v: z[2] };
      if (!exists(ini.c, ini.v) || !exists(fim.c, fim.v)) throw new Error(`${id} ${b.range}: fora do Matos Soares`);
      const trechos = parseTrechos(b.text, `${id} ${b.range}`);
      trechos.forEach((t) => (autores[t.autor] = (autores[t.autor] || 0) + 1));
      blocos.push({ ini, fim, catena: b.range.replace('-', '–'), trechos });
    }
  }

  blocos.sort((x, y) => x.ini.c - y.ini.c || x.ini.v - y.ini.v);
  // Na Catena, blocos vizinhos às vezes dividem um versículo (ex.: 1:3–6 e 1:6–8). Mais que isso é erro.
  for (let k = 1; k < blocos.length; k++) {
    const p = blocos[k - 1].fim, n = blocos[k].ini;
    if (n.c < p.c || (n.c === p.c && n.v < p.v)) console.warn(`  aviso ${id}: ${blocos[k - 1].catena} sobrepõe ${blocos[k].catena}`);
  }

  const doc = {
    obra: 'Catena Aurea — Santo Tomás de Aquino',
    traducao: 'Português baseado na edição inglesa de Oxford (1841–1845); repositório catena-aurea (G. Evangelista). Uso pessoal.',
    versificacao: 'Matos Soares (Vulgata)',
    blocos,
  };
  await writeFile(join(OUT, `${id}.json`), JSON.stringify(doc));
  const n = blocos.reduce((s, b) => s + b.trechos.length, 0);
  total.blocos += blocos.length;
  total.trechos += n;
  console.log(`${id}: ${blocos.length} blocos, ${n} trechos, ${Object.keys(autores).length} autores`);
}
console.log(`Total: ${total.blocos} blocos, ${total.trechos} trechos → ${OUT}`);
if (Object.keys(desconhecidos).length) console.log('Prefixos fora da lista de autores (tratados como continuação):', desconhecidos);
