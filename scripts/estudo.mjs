#!/usr/bin/env node
// Ferramentas da camada de estudo por perícopes.
//
//   node scripts/estudo.mjs index MRK          gera docs/data/estudo/MRK/index.json a partir de scripts/pericopes/MRK.txt
//   node scripts/estudo.mjs contexto MRK 10.46 imprime o texto Matos Soares + trechos da Catena da perícope
//   node scripts/estudo.mjs check [MRK]        valida índice e arquivos de estudo
//   node scripts/estudo.mjs status [MRK]       lista perícopes feitas / pendentes / revisadas

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'docs', 'data');
const EST = join(DATA, 'estudo');
const json = async (p) => JSON.parse(await readFile(p, 'utf8'));

const ABBR = { MAT: 'Mt', MRK: 'Mc', LUK: 'Lc', JHN: 'Jo' };
const cmp = (a, b) => a.c - b.c || a.v - b.v;
const fmt = (id, ini, fim) =>
  `${ABBR[id] || id} ${ini.c},${ini.v}` + (cmp(ini, fim) === 0 ? '' : ini.c === fim.c ? `-${fim.v}` : `–${fim.c},${fim.v}`);
const pid = (id, ini) => `${id}.${ini.c}.${ini.v}`;
const file = (id, ini) => join(EST, id, `${ini.c}.${ini.v}.json`);

async function parseDivision(id) {
  const txt = await readFile(join(ROOT, 'scripts', 'pericopes', `${id}.txt`), 'utf8');
  const out = [];
  let secao = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || (line.startsWith('#') && !line.startsWith('## '))) continue;
    if (line.startsWith('## ')) { secao = line.slice(3).trim(); continue; }
    const m = line.match(/^(\d+):(\d+)-(\d+):(\d+)\s*\|\s*(.+)$/);
    if (!m) throw new Error(`linha inválida: ${line}`);
    const ini = { c: +m[1], v: +m[2] }, fim = { c: +m[3], v: +m[4] };
    out.push({ id: pid(id, ini), titulo: m[5].trim(), secao, referencia: fmt(id, ini, fim), ini, fim });
  }
  return out;
}

// Cobertura: perícopes contíguas, sem lacuna nem sobreposição, do 1,1 ao último versículo.
function checkCoverage(id, list, bible, errs) {
  let exp = { c: 1, v: 1 };
  const next = (p) => (p.v < bible[p.c - 1].length ? { c: p.c, v: p.v + 1 } : { c: p.c + 1, v: 1 });
  for (const p of list) {
    if (cmp(p.ini, exp) !== 0) errs.push(`${id}: esperava início em ${exp.c}:${exp.v}, veio ${p.ini.c}:${p.ini.v} (${p.titulo})`);
    if (cmp(p.fim, p.ini) < 0) errs.push(`${p.id}: fim antes do início`);
    if (p.fim.c > bible.length || p.fim.v > bible[p.fim.c - 1].length) errs.push(`${p.id}: fim fora do livro`);
    exp = next(p.fim);
  }
  if (exp.c !== bible.length + 1) errs.push(`${id}: a divisão termina antes do fim do livro (${exp.c}:${exp.v})`);
}

const inRange = (p, c, v) => cmp(p.ini, { c, v }) <= 0 && cmp({ c, v }, p.fim) <= 0;
const overlaps = (a, b) => cmp(a.ini, b.fim) <= 0 && cmp(b.ini, a.fim) <= 0;

async function catenaFor(id, per) {
  const p = join(DATA, 'catena', `${id}.json`);
  if (!existsSync(p)) return [];
  const cat = await json(p);
  return cat.blocos.filter((b) => overlaps(b, per));
}

async function cmdIndex(id) {
  const bible = await json(join(DATA, 'books', `${id}.json`));
  const list = await parseDivision(id);
  const errs = [];
  checkCoverage(id, list, bible, errs);
  if (errs.length) { errs.forEach((e) => console.error('✗', e)); process.exit(1); }
  await mkdir(join(EST, id), { recursive: true });
  const secoes = [...new Set(list.map((p) => p.secao))];
  await writeFile(join(EST, id, 'index.json'), JSON.stringify({ livro: id, secoes, pericopes: list }, null, 1));
  // Lista de livros com estudo, para o app não buscar índices que não existem.
  const livros = (await readdir(EST, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  await writeFile(join(EST, 'livros.json'), JSON.stringify(livros));
  console.log(`${id}: ${list.length} perícopes em ${secoes.length} seções → docs/data/estudo/${id}/index.json`);
}

async function cmdContexto(id, key) {
  const [c, v] = key.split(/[.:,]/).map(Number);
  const idx = await json(join(EST, id, 'index.json'));
  const per = idx.pericopes.find((p) => p.ini.c === c && p.ini.v === v) || idx.pericopes.find((p) => inRange(p, c, v));
  if (!per) throw new Error('perícope não encontrada');
  const bible = await json(join(DATA, 'books', `${id}.json`));
  const i = idx.pericopes.indexOf(per);
  console.log(`# ${per.id} · ${per.referencia} · ${per.titulo}`);
  console.log(`Seção: ${per.secao}`);
  console.log(`Anterior: ${idx.pericopes[i - 1]?.titulo || '—'} · Próxima: ${idx.pericopes[i + 1]?.titulo || '—'}\n`);
  console.log('## Texto (Matos Soares)');
  for (let ch = per.ini.c; ch <= per.fim.c; ch++) {
    const a = ch === per.ini.c ? per.ini.v : 1;
    const z = ch === per.fim.c ? per.fim.v : bible[ch - 1].length;
    for (let vv = a; vv <= z; vv++) console.log(`${ch}:${vv} ${bible[ch - 1][vv - 1]}`);
  }
  for (const b of await catenaFor(id, per)) {
    console.log(`\n## Catena ${b.catena} (Matos Soares ${b.ini.c}:${b.ini.v}–${b.fim.c}:${b.fim.v})`);
    // Trechos longos são cortados (MAX caracteres) para economizar tokens; a ideia central vem no início.
    const MAX = +(process.env.MAX || 700);
    const cut = (s) => (s.length > MAX ? s.slice(0, MAX) + '…' : s);
    b.trechos.forEach((t, k) => console.log(`[${b.catena}#${k}] ${t.autor}${t.obra ? ` (${t.obra})` : ''}: ${cut(t.texto)}`));
  }
}

const ORIGENS = new Set(['ia', 'ia+fonte', 'fonte', 'tabela', 'indice']);

async function checkBook(id, errs, stats) {
  const idx = await json(join(EST, id, 'index.json'));
  const bible = await json(join(DATA, 'books', `${id}.json`));
  checkCoverage(id, idx.pericopes, bible, errs);
  const fresh = await parseDivision(id).catch(() => null);
  if (fresh && JSON.stringify(fresh) !== JSON.stringify(idx.pericopes)) errs.push(`${id}: index.json desatualizado; rode "index ${id}"`);
  const catena = existsSync(join(DATA, 'catena', `${id}.json`)) ? (await json(join(DATA, 'catena', `${id}.json`))).blocos : [];
  const byRef = new Map(catena.map((b) => [b.catena, b]));
  const files = new Set((await readdir(join(EST, id))).filter((f) => f !== 'index.json'));

  for (const per of idx.pericopes) {
    const f = `${per.ini.c}.${per.ini.v}.json`;
    if (!files.has(f)) { stats.pendentes++; continue; }
    files.delete(f);
    stats.feitas++;
    const e = (m) => errs.push(`${per.id}: ${m}`);
    let d;
    try { d = await json(join(EST, id, f)); } catch (x) { e(`JSON inválido (${x.message})`); continue; }
    if (d.revisado === true) stats.revisadas++;
    for (const k of ['id', 'titulo', 'referencia']) if (d[k] !== per[k]) e(`${k} difere do índice ("${d[k]}" ≠ "${per[k]}")`);
    if (JSON.stringify(d.ini) !== JSON.stringify(per.ini) || JSON.stringify(d.fim) !== JSON.stringify(per.fim)) e('ini/fim difere do índice');
    if ('versiculos' in d || 'texto' in d) e('o arquivo não pode conter texto bíblico');
    const S = d.quatro_sentidos || {};
    for (const k of ['literal', 'alegorico', 'moral', 'anagogico']) if (typeof S[k] !== 'string' || S[k].length < 80) e(`quatro_sentidos.${k} ausente ou curto`);
    const L = d.lectio_divina || {};
    if (typeof L.lectio_resumo !== 'string' || L.lectio_resumo.length < 60) e('lectio_resumo ausente ou curto');
    if (!Array.isArray(L.meditatio_perguntas) || L.meditatio_perguntas.length < 2) e('meditatio_perguntas: mínimo 2');
    if (typeof L.oratio_guia !== 'string' || L.oratio_guia.length < 40) e('oratio_guia ausente ou curto');
    const C = L.contemplatio_foco || {};
    if (!C.texto || !C.ref) e('contemplatio_foco precisa de texto e ref');
    if (!d.liturgia || typeof d.liturgia.tema_central !== 'string' || !Array.isArray(d.liturgia.usos)) e('liturgia.tema_central / usos');
    if (typeof d.revisado !== 'boolean') e('revisado deve ser boolean');

    for (const [k, a] of Object.entries(d.ancoras || {})) {
      const m = k.match(/^(\d+):(\d+)$/);
      if (!m || !inRange(per, +m[1], +m[2])) { e(`âncora ${k} fora da perícope`); continue; }
      if (!Array.isArray(a.cic) || a.cic.some((n) => !Number.isInteger(n) || n < 1 || n > 2865)) e(`${k}: cic inválido`);
      if (a.cic?.length) e(`${k}: cic deve ficar vazio até o índice do Catecismo (fase 1.2)`);
      for (const p of a.padres || []) {
        const [ref, n] = String(p.catena || '').split('#');
        const b = byRef.get(ref);
        const t = b?.trechos[+n];
        if (!t) { e(`${k}: referência à Catena inexistente "${p.catena}"`); continue; }
        if (t.autor !== p.autor) e(`${k}: ${p.catena} é de "${t.autor}", não de "${p.autor}"`);
        if (!overlaps(b, per)) e(`${k}: ${p.catena} não cobre esta perícope`);
        if (typeof p.sintese !== 'string' || p.sintese.length < 30) e(`${k}: síntese de ${p.autor} ausente ou curta`);
      }
      if (a.nota != null && (typeof a.nota.texto !== 'string' || !ORIGENS.has(a.nota.origem))) e(`${k}: nota precisa de {texto, origem}`);
    }
  }
  for (const f of files) errs.push(`${id}: arquivo sem perícope no índice: ${f}`);
}

async function books(arg) {
  if (arg) return [arg];
  if (!existsSync(EST)) return [];
  return (await readdir(EST, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
}

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'index') await cmdIndex(a1);
else if (cmd === 'contexto') await cmdContexto(a1, a2);
else if (cmd === 'check' || cmd === 'status') {
  const errs = [];
  for (const id of await books(a1)) {
    const stats = { feitas: 0, pendentes: 0, revisadas: 0 };
    await checkBook(id, errs, stats);
    console.log(`${id}: ${stats.feitas} feitas · ${stats.pendentes} pendentes · ${stats.revisadas} revisadas`);
    if (cmd === 'status') {
      const idx = await json(join(EST, id, 'index.json'));
      const next = idx.pericopes.find((p) => !existsSync(file(id, p.ini)));
      if (next) console.log(`  próxima: ${next.id} · ${next.referencia} · ${next.titulo}`);
    }
  }
  if (errs.length) { errs.forEach((e) => console.error('✗', e)); process.exit(1); }
  console.log('Estudo: tudo certo.');
} else {
  console.log('uso: node scripts/estudo.mjs index|contexto|check|status …');
}
