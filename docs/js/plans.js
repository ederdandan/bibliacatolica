// Planos de leitura gerados a partir do índice, equilibrados pelo número de versículos.
import { books, book } from './bible.js';

export const PLANS = [
  { id: 'biblia-1-ano', name: 'Bíblia completa em 1 ano', desc: 'Os 73 livros, do Gênesis ao Apocalipse.', days: 365, select: () => books() },
  { id: 'nt-90', name: 'Novo Testamento em 90 dias', desc: 'Evangelhos, Atos, Cartas e Apocalipse.', days: 90, select: () => books().filter((b) => b.testament === 'NT') },
  { id: 'evangelhos-40', name: 'Os Evangelhos em 40 dias', desc: 'Mateus, Marcos, Lucas e João.', days: 40, select: () => books().filter((b) => b.group === 'Evangelhos') },
  { id: 'salmos-30', name: 'Salmos em 30 dias', desc: 'Os 150 Salmos (numeração da Vulgata).', days: 30, select: () => [book('PSA')] },
  { id: 'sapienciais-60', name: 'Livros Sapienciais em 60 dias', desc: 'Jó, Salmos, Provérbios, Eclesiastes, Cântico, Sabedoria e Eclesiástico.', days: 60, select: () => books().filter((b) => b.group === 'Livros Sapienciais') },
  { id: 'at-1-ano', name: 'Antigo Testamento em 1 ano', desc: 'Os 46 livros do Antigo Testamento.', days: 365, select: () => books().filter((b) => b.testament === 'AT') },
];

const cache = new Map();

export const plan = (id) => PLANS.find((p) => p.id === id);

// Lista de dias; cada dia é uma lista de { b, c }.
export function schedule(id) {
  if (cache.has(id)) return cache.get(id);
  const p = plan(id);
  const chapters = [];
  for (const bk of p.select()) bk.verses.forEach((n, i) => chapters.push({ b: bk.id, c: i + 1, n }));
  const total = chapters.reduce((s, x) => s + x.n, 0);
  const days = Array.from({ length: p.days }, () => []);
  let acc = 0;
  let d = 0;
  chapters.forEach((ch, i) => {
    const remainingCh = chapters.length - i;
    const remainingDays = p.days - d;
    // Avança de dia quando a meta acumulada já foi atingida, sem deixar dias vazios no fim.
    if (days[d].length && d < p.days - 1 && (acc >= (total * (d + 1)) / p.days || remainingCh <= remainingDays - 1)) d++;
    days[d].push({ b: ch.b, c: ch.c });
    acc += ch.n;
  });
  const out = days.filter((x) => x.length);
  cache.set(id, out);
  return out;
}

// [{b:'GEN',c:1},{b:'GEN',c:2},{b:'EXO',c:1}] -> "Gn 1–2; Êx 1"
export function dayLabel(items) {
  const parts = [];
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (items[j + 1] && items[j + 1].b === items[i].b && items[j + 1].c === items[j].c + 1) j++;
    const ab = book(items[i].b).abbrev;
    parts.push(j > i ? `${ab} ${items[i].c}–${items[j].c}` : `${ab} ${items[i].c}`);
    i = j + 1;
  }
  return parts.join('; ');
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Índice (0-based) do dia de hoje no plano.
export function dayIndex(startISO) {
  const [y, m, d] = startISO.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - start) / 86400000);
}

// Versículo do dia: referências fixas, escolhidas pela data.
export const VOTD = [
  'JHN.3.16', 'PSA.22.1', 'PHP.4.13', 'MAT.11.28', 'ROM.8.28', 'PRO.3.5', 'JOS.1.9', 'PSA.118.105',
  '1CO.13.4', 'LUK.1.38', 'PSA.45.11', 'PSA.36.5', 'MAT.6.33', 'JHN.14.6', 'ISA.41.10', 'PSA.33.9',
  '2CO.12.9', 'HEB.11.1', '1JN.4.8', 'MAT.5.9', 'ROM.12.12', 'GAL.5.22', 'JHN.15.12', 'PSA.50.12',
  'LAM.3.22', 'MIC.6.8', 'PSA.26.1', 'PSA.90.1', 'ISA.40.31', 'JER.29.11', 'MAT.5.3', 'MAT.5.8',
  'JHN.8.12', 'JHN.11.25', 'JHN.6.35', 'JHN.10.11', 'ROM.5.8', 'ROM.8.31', 'ROM.8.38', '1CO.10.13',
  'EPH.2.8', 'PHP.4.6', 'COL.3.14', '1TH.5.16', '2TI.1.7', 'HEB.13.8', 'JAS.1.5', '1PE.5.7',
  '1JN.1.9', 'REV.3.20', 'MAT.28.20', 'LUK.6.31', 'LUK.11.9', 'MRK.10.27', 'ISA.9.6', 'ISA.53.5',
  'PSA.4.9', 'PSA.15.11', 'PSA.120.2', 'SIR.2.6', 'WIS.3.1', 'TOB.4.16',
];

export function verseOfDay(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date - start) / 86400000);
  const [b, c, v] = VOTD[(day + date.getFullYear()) % VOTD.length].split('.');
  return { b, c: +c, v: +v };
}
