// Confere a lista do Versículo do dia: cada trecho existe e forma frase completa.
// uso: node scripts/check-votd.mjs [-v]  (-v imprime o texto de cada trecho)
import { readFileSync } from 'node:fs';
import { VOTD, votdText } from '../docs/js/plans.js';
const verbose = process.argv.includes('-v');
let bad = 0;
for (const r of VOTD) {
  const [b, c, vv] = r.split('.');
  const [a, z = a] = vv.split('-').map(Number);
  const ch = JSON.parse(readFileSync(new URL(`../docs/data/books/${b}.json`, import.meta.url), 'utf8'))[c - 1] || [];
  const vs = [];
  for (let v = a; v <= z; v++) vs.push(ch[v - 1]);
  const errs = [];
  if (vs.some((t) => !t)) errs.push('versículo inexistente');
  const t = votdText(vs.filter(Boolean));
  if (!/^[\p{Lu}]/u.test(t)) errs.push('não começa por maiúscula');
  if (!/[.!?]["”)]?$/.test(t)) errs.push('não termina em ponto');
  if (errs.length) { bad++; console.log(`✗ ${r}: ${errs.join(', ')}\n   ${t}`); }
  else if (verbose) console.log(`✓ ${r}: ${t}`);
}
console.log(bad ? `${bad} trecho(s) com problema.` : `Versículo do dia: ${VOTD.length} trechos, tudo certo.`);
process.exitCode = bad ? 1 : 0;
