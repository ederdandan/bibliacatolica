// Tempo litúrgico (rito romano) e sua cor, a partir da data.
// Cobre os tempos e alguns domingos próprios; não inclui festas de santos.

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const same = (a, b) => a.getTime() === b.getTime();

// Domingo de Páscoa (algoritmo gregoriano anônimo).
export function easter(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

// 1º domingo do Advento: quatro domingos antes do Natal.
export function adventStart(y) {
  const xmas = new Date(y, 11, 25);
  const fourth = addDays(xmas, -(xmas.getDay() || 7));
  return addDays(fourth, -21);
}

// Batismo do Senhor: domingo depois de 6 de janeiro (encerra o Tempo do Natal).
function baptism(y) {
  const j6 = new Date(y, 0, 6);
  return addDays(j6, 7 - j6.getDay());
}

export const COLOR_NAMES = {
  verde: 'Verde',
  roxo: 'Roxo',
  dourado: 'Branco/Dourado',
  vermelho: 'Vermelho',
  rosa: 'Rosa',
};

export function season(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const y = d.getFullYear();
  const E = easter(y);
  const adv = adventStart(y);
  const natal = { name: 'Tempo do Natal', color: 'dourado' };

  if (d >= new Date(y, 11, 25) || d <= baptism(y)) return natal;
  if (d >= adv) {
    if (same(d, addDays(adv, 14))) return { name: 'Advento · Domingo Gaudete', color: 'rosa' };
    return { name: 'Tempo do Advento', color: 'roxo' };
  }
  const ash = addDays(E, -46);
  if (d >= ash && d < E) {
    if (same(d, addDays(E, -7))) return { name: 'Domingo de Ramos', color: 'vermelho' };
    if (same(d, addDays(E, -2))) return { name: 'Sexta-feira da Paixão', color: 'vermelho' };
    if (same(d, addDays(E, -3))) return { name: 'Quinta-feira Santa', color: 'dourado' };
    if (same(d, addDays(E, -21))) return { name: 'Quaresma · Domingo Laetare', color: 'rosa' };
    if (d >= addDays(E, -7)) return { name: 'Semana Santa', color: 'roxo' };
    return { name: 'Tempo da Quaresma', color: 'roxo' };
  }
  const pent = addDays(E, 49);
  if (same(d, pent)) return { name: 'Pentecostes', color: 'vermelho' };
  if (d >= E && d < pent) return { name: 'Tempo Pascal', color: 'dourado' };
  if (same(d, addDays(E, 56))) return { name: 'Santíssima Trindade', color: 'dourado' };
  if (same(d, addDays(adv, -7))) return { name: 'Cristo Rei', color: 'dourado' };
  return { name: 'Tempo Comum', color: 'verde' };
}
