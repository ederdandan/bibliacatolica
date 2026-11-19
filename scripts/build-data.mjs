#!/usr/bin/env node
// Converte a Bíblia Matos Soares (CC0, github.com/bibliacatolica/biblia)
// em arquivos JSON pequenos, um por livro, para o PWA em docs/.
//
// Uso:
//   node scripts/build-data.mjs                 (baixa do GitHub)
//   node scripts/build-data.mjs caminho.json    (usa arquivo local)

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_URL =
  'https://raw.githubusercontent.com/bibliacatolica/biblia/main/biblia-matos-soares-completa.json';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'data');

const GROUPS = [
  ['Pentateuco', 'GEN EXO LEV NUM DEU'],
  ['Livros Históricos', 'JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH TOB JDT EST 1MA 2MA'],
  ['Livros Sapienciais', 'JOB PSA PRO ECC SNG WIS SIR'],
  ['Livros Proféticos', 'ISA JER LAM BAR EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL'],
  ['Evangelhos', 'MAT MRK LUK JHN'],
  ['Atos dos Apóstolos', 'ACT'],
  ['Cartas Paulinas', 'ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB'],
  ['Cartas Católicas', 'JAS 1PE 2PE 1JN 2JN 3JN JUD'],
  ['Apocalipse', 'REV'],
];

// Abreviações e nomes alternativos aceitos na busca por referência.
const ALIASES = {
  GEN: 'gen gên', EXO: 'exo êx exodo', LEV: 'lev', NUM: 'num nú', DEU: 'deut deu',
  JOS: 'jos', JDG: 'jui juí jz', RUT: 'rut', '1SA': '1sam 1 sam 1samuel', '2SA': '2sam 2 sam 2samuel',
  '1KI': '1re 1reis', '2KI': '2re 2reis', '1CH': '1cro 1crônicas 1cronicas', '2CH': '2cro 2crônicas 2cronicas',
  EZR: 'esd', NEH: 'nee', TOB: 'tob', JDT: 'jdt jud', EST: 'est', '1MA': '1mac', '2MA': '2mac',
  JOB: 'jó', PSA: 'sal salmo sl ps', PRO: 'prov pv', ECC: 'ecle ecl coélet coelet', SNG: 'cant cânt ct',
  WIS: 'sab sb', SIR: 'eclo sir siracida eclesiastico', ISA: 'isa is', JER: 'jer jr', LAM: 'lam lm',
  BAR: 'bar', EZE: 'ezeq ez', DAN: 'dan dn', HOS: 'os ose', JOE: 'jl', AMO: 'am', OBA: 'abd ab',
  JON: 'jon jn', MIC: 'miq mq', NAH: 'na', HAB: 'hab', ZEP: 'sof', HAG: 'ag', ZEC: 'zac', MAL: 'mal',
  MAT: 'mat mt sãomateus', MRK: 'mar mc sãomarcos', LUK: 'luc lc sãolucas', JHN: 'jo joão joao sãojoão',
  ACT: 'at atos', ROM: 'rom rm', '1CO': '1co 1cor', '2CO': '2co 2cor', GAL: 'gál gal gl', EPH: 'efe ef',
  PHP: 'fil fl', COL: 'col cl', '1TH': '1tes 1ts', '2TH': '2tes 2ts', '1TI': '1tim 1tm', '2TI': '2tim 2tm',
  TIT: 'tit tt', PHM: 'filem fm filêmon', HEB: 'heb hb', JAS: 'tia tg', '1PE': '1ped 1pe 1pd',
  '2PE': '2ped 2pe 2pd', '1JN': '1jo 1joão', '2JN': '2jo 2joão', '3JN': '3jo 3joão', JUD: 'jd',
  REV: 'apoc ap',
};

async function load() {
  const path = process.argv[2];
  if (path) return JSON.parse(await readFile(path, 'utf8'));
  console.log('Baixando', SRC_URL);
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function main() {
  const src = await load();
  const groupOf = {};
  for (const [g, ids] of GROUPS) for (const id of ids.split(' ')) groupOf[id] = g;

  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'books'), { recursive: true });

  const books = [];
  let verses = 0;
  for (const b of src.books) {
    if (!groupOf[b.id]) throw new Error(`Livro sem grupo: ${b.id}`);
    const nums = Object.keys(b.chapters).map(Number).sort((x, y) => x - y);
    const chapters = nums.map((n) => {
      const vs = b.chapters[String(n)];
      vs.forEach((v, i) => {
        if (v.v !== i + 1) throw new Error(`Numeração inesperada em ${b.id} ${n},${v.v}`);
      });
      return vs.map((v) => {
        const t = v.t.normalize('NFC').replace(/\s+/g, ' ').trim();
        // A busca depende de fold() preservar o comprimento do texto.
        if (fold(t).length !== t.length) throw new Error(`fold altera comprimento: ${b.id} ${n},${v.v}`);
        return t;
      });
    });
    verses += chapters.reduce((s, c) => s + c.length, 0);
    await writeFile(join(OUT, 'books', `${b.id}.json`), JSON.stringify(chapters));
    books.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      abbrev: b.abbrev,
      testament: b.testament,
      group: groupOf[b.id],
      verses: chapters.map((c) => c.length),
      aliases: (ALIASES[b.id] || '').split(' ').filter(Boolean),
    });
  }

  const index = {
    title: src.title,
    translator: src.translator,
    source: src.source,
    approval: src.approval,
    version: src.version,
    origin: 'https://github.com/bibliacatolica/biblia',
    license: 'CC0-1.0 / Domínio público',
    totalBooks: books.length,
    totalChapters: books.reduce((s, b) => s + b.verses.length, 0),
    totalVerses: verses,
    books,
  };
  await writeFile(join(OUT, 'index.json'), JSON.stringify(index));
  console.log(`OK: ${index.totalBooks} livros, ${index.totalChapters} capítulos, ${verses} versículos -> docs/data/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
