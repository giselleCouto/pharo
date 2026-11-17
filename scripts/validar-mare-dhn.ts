/**
 * Validação do motor de maré (src/lib/tideEngine.ts) contra a Tábua de Marés oficial da DHN.
 *
 * Referência: Marinha do Brasil, DHN — Tábua de Marés, Porto de Itaqui (MA), 2025
 * (30 componentes, fuso UTC−03, nível médio 3,4 m, Carta 413): 705 preamares e 706 baixa-mares,
 * em scripts/fixtures/dhn_itaqui_2025_extremos.csv (horários convertidos para UTC).
 *
 * Gera a série prevista de 2025 a cada 5 min, extrai preamares e baixa-mares e compara cada
 * extremo da DHN com o previsto mais próximo do mesmo tipo. Falha (exit 1) se o erro médio
 * passar dos limites abaixo.
 *
 * Uso:
 *   npx esbuild scripts/validar-mare-dhn.ts --bundle --platform=node --outfile=validar-mare.cjs
 *   node validar-mare.cjs scripts/fixtures/dhn_itaqui_2025_extremos.csv
 */
import { readFileSync } from 'node:fs';
import { preverMareHarmonico } from '../src/lib/tideEngine';

const LIMITE_MIN = 10; // erro médio máximo no horário (min)
const LIMITE_CM = 10;  // erro médio máximo na altura (cm)

const csv = process.argv[2] ?? 'scripts/fixtures/dhn_itaqui_2025_extremos.csv';
const dhn = readFileSync(csv, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => {
  const [, utc, h, tipo] = l.split(',');
  return { t: Date.parse(utc + 'Z'), h: Number(h), tipo };
});

const inicio = new Date(Date.UTC(2024, 11, 31, 12, 0, 0));
const pts = preverMareHarmonico('ITAQUI', inicio, 367, 5).map((p) => ({ t: Date.parse(p.dt), h: p.altura_m }));

const ext: { t: number; h: number; tipo: string }[] = [];
for (let i = 1; i < pts.length - 1; i++) {
  const [a, b, c] = [pts[i - 1].h, pts[i].h, pts[i + 1].h];
  if (b > a && b >= c) ext.push({ ...pts[i], tipo: 'PM' });
  else if (b < a && b <= c) ext.push({ ...pts[i], tipo: 'BM' });
}

let falhou = false;
for (const tipo of ['PM', 'BM']) {
  const P = ext.filter((e) => e.tipo === tipo);
  const dt: number[] = [];
  const dh: number[] = [];
  for (const d of dhn.filter((e) => e.tipo === tipo)) {
    let best = P[0];
    for (const p of P) if (Math.abs(p.t - d.t) < Math.abs(best.t - d.t)) best = p;
    dt.push(Math.abs(best.t - d.t) / 60000);
    dh.push(Math.abs(best.h - d.h) * 100);
  }
  const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const [emin, ecm] = [media(dt), media(dh)];
  const ok = emin <= LIMITE_MIN && ecm <= LIMITE_CM;
  falhou ||= !ok;
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${tipo}: horário ${emin.toFixed(1)} min | altura ${ecm.toFixed(1)} cm  [n=${dt.length}]`);
}
process.exit(falhou ? 1 : 0);
