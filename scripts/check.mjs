#!/usr/bin/env node
// Verificações rápidas da lógica (referências, busca, planos, versículo do dia).
// Uso: node scripts/check.mjs

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
globalThis.fetch = async (p) => {
  try {
    const text = await readFile(join(DOCS, p), 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
  } catch {
    return { ok: false, status: 404 };
  }
};

const B = await import('../docs/js/bible.js');
const P = await import('../docs/js/plans.js');
await B.loadIndex();

const ref = (s) => {
  const r = B.parseRef(s);
  return r && [r.b, r.c, r.v, r.v2];
};
assert.deepEqual(ref('Jo 3,16'), ['JHN', 3, 16, null]);
assert.deepEqual(ref('joao 3:16-18'), ['JHN', 3, 16, 18]);
assert.deepEqual(ref('Jó 3'), ['JOB', 3, null, null]);
assert.deepEqual(ref('1 Cor 13,4-7'), ['1CO', 13, 4, 7]);
assert.deepEqual(ref('1cor 13'), ['1CO', 13, null, null]);
assert.deepEqual(ref('Gênesis'), ['GEN', 1, null, null]);
assert.deepEqual(ref('genesis 50'), ['GEN', 50, null, null]);
assert.deepEqual(ref('Sl 118,105'), ['PSA', 118, 105, null]);
assert.deepEqual(ref('Salmo 22'), ['PSA', 22, null, null]);
assert.deepEqual(ref('Apocalipse 22,21'), ['REV', 22, 21, null]);
assert.deepEqual(ref('Eclo 2,6'), ['SIR', 2, 6, null]);
assert.deepEqual(ref('Ecl 3'), ['ECC', 3, null, null]);
assert.deepEqual(ref('Mt 5.3'), ['MAT', 5, 3, null]);
assert.equal(ref('Gn 51'), null);
assert.equal(ref('Jo 3,999'), null);
assert.equal(ref('amor de Deus'), null);
assert.equal(B.fmtRef('JHN', 3, [18, 16, 17, 20]), 'Jo 3,16-18.20');
assert.equal(B.psalmHebrew(22), '23');
assert.equal(B.psalmHebrew(9), '9–10');
assert.equal(B.psalmHebrew(150), null);

let r = await B.search('Deus amou de tal modo', { mode: 'exact' });
assert.ok(r.some((x) => x.b === 'JHN' && x.c === 3 && x.v === 16), 'Jo 3,16 na busca exata');
r = await B.search('espirito santo', {});
assert.ok(r.length > 50, 'busca sem acento');
const one = r[0];
assert.equal(B.fold(one.t.slice(one.ranges[0][0], one.ranges[0][1])), 'espirito');
r = await B.search('amor', { whole: true, scope: 'NT' });
assert.ok(r.every((x) => B.book(x.b).testament === 'NT'));
assert.ok(r.every((x) => !/amore/i.test(B.fold(x.t)) || /(^|[^a-z])amor([^a-z]|$)/.test(B.fold(x.t))));
console.log('busca "Senhor":', (await B.search('Senhor', {})).length, 'versículos');

for (const p of P.PLANS) {
  const days = P.schedule(p.id);
  const all = days.flat();
  const expected = p.select().reduce((s, b) => s + b.chapters, 0);
  assert.equal(days.length, p.days, `${p.id}: dias`);
  assert.equal(all.length, expected, `${p.id}: capítulos`);
  assert.ok(days.every((d) => d.length), `${p.id}: sem dias vazios`);
  console.log(p.id, '-> dia 1:', P.dayLabel(days[0]), '| último:', P.dayLabel(days[days.length - 1]));
}

for (const k of P.VOTD) {
  const [b, c, v] = k.split('.');
  const t = await B.verseText(b, +c, +v);
  assert.ok(t, `VOTD inexistente: ${k}`);
}
console.log('VOTD ok:', P.VOTD.length);
console.log('Tudo certo.');
