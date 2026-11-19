#!/usr/bin/env node
// Gera os ícones PNG do PWA (sem dependências): fundo vinho com cruz dourada.
// Uso: node scripts/make-icons.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'icons');
const BG = [107, 39, 55];
const FG = [233, 196, 106];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// scale: fração do ícone ocupada pela cruz; rounded: cantos arredondados (não-maskable).
function icon(size, { scale = 0.62, rounded = true } = {}) {
  const S = 4; // supersampling para bordas suaves
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const h = scale; // altura da cruz
  const w = h * 0.62; // largura do braço horizontal
  const t = h * 0.16; // espessura
  const cy = 0.5 - h / 2 + h * 0.3; // centro do braço horizontal
  const r = 0.2; // raio dos cantos
  const inCross = (x, y) =>
    (Math.abs(x - 0.5) <= t / 2 && Math.abs(y - 0.5) <= h / 2) ||
    (Math.abs(y - cy) <= t / 2 && Math.abs(x - 0.5) <= w / 2);
  const inShape = (x, y) => {
    if (!rounded) return true;
    const dx = Math.max(r - x, 0, x - (1 - r));
    const dy = Math.max(r - y, 0, y - (1 - r));
    return dx * dx + dy * dy <= r * r;
  };
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let a = 0, f = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S) / size;
          const y = (py + (sy + 0.5) / S) / size;
          if (inShape(x, y)) {
            a++;
            if (inCross(x, y)) f++;
          }
        }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const k = a ? f / a : 0;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - k) + FG[i] * k);
      raw[o + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'icon-192.png'), icon(192));
await writeFile(join(OUT, 'icon-512.png'), icon(512));
await writeFile(join(OUT, 'maskable-512.png'), icon(512, { scale: 0.46, rounded: false }));
await writeFile(join(OUT, 'apple-touch-icon.png'), icon(180, { rounded: false }));
await writeFile(join(OUT, 'favicon-32.png'), icon(32, { scale: 0.7 }));
console.log('Ícones gerados em docs/icons/');
