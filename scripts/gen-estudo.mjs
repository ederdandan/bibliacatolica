// Gera arquivos de estudo de livros sem Catena (padres: []). uso: node scripts/gen-estudo.mjs <LIVRO> <dados.mjs>  — escreve docs/data/estudo/<LIVRO>/<c>.<v>.json
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const [id, dataPath] = process.argv.slice(2);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'data', 'estudo', id);
const idx = JSON.parse(readFileSync(ROOT + '/index.json', 'utf8'));
const { default: data } = await import(pathToFileURL(resolve(dataPath)).href);
for (const d of data) {
  const [c, v] = d.k.split('.').map(Number);
  const p = idx.pericopes.find((x) => x.ini.c === c && x.ini.v === v);
  if (!p) throw new Error('sem perícope ' + d.k);
  const ancoras = {};
  for (const [k, t] of Object.entries(d.notas || {})) ancoras[k] = { cic: [], padres: [], nota: { texto: t, origem: 'ia' } };
  const out = {
    id: p.id, livro: id, titulo: p.titulo, secao: p.secao, referencia: p.referencia, ini: p.ini, fim: p.fim,
    liturgia: { tema_central: d.tema, usos: [] },
    quatro_sentidos: { literal: d.literal, alegorico: d.alegorico, moral: d.moral, anagogico: d.anagogico },
    lectio_divina: { lectio_resumo: d.lectio, meditatio_perguntas: d.perguntas, oratio_guia: d.oratio, contemplatio_foco: { texto: d.foco[0], ref: d.foco[1] } },
    ancoras, revisado: false,
  };
  writeFileSync(`${ROOT}/${c}.${v}.json`, JSON.stringify(out, null, 2) + '\n');
  console.log('ok', p.id);
}
