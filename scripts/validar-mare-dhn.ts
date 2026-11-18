/**
 * Validação do motor de maré (src/lib/tideEngine.ts) contra as Tábuas de Marés oficiais da DHN.
 *
 * Referência: Marinha do Brasil, DHN — Tábuas de Marés 2025 dos dez portos do catálogo
 * (estações em FONTE_DHN, src/lib/mareHarmonicas.ts), horários convertidos para UTC.
 * Fixtures: scripts/fixtures/dhn_<porto>_2025_extremos.csv (eventos marcados '?' — estofos — são ignorados).
 *
 * Para cada porto, gera a série de 2025 a cada 5 min e mede:
 *   - altura no instante de cada extremo oficial (critério principal: é o que o cálculo de UKC usa);
 *   - horário do extremo previsto mais próximo do mesmo tipo.
 * Falha (exit 1) se algum porto passar dos limites abaixo.
 *
 * Uso:
 *   npx esbuild scripts/validar-mare-dhn.ts --bundle --platform=node --outfile=validar-mare.cjs
 *   node validar-mare.cjs              # todos os portos
 *   node validar-mare.cjs SANTOS       # um porto
 */
import { readFileSync } from 'node:fs';
import { preverMareHarmonico } from '../src/lib/tideEngine';

const LIMITE_ALTURA_CM = 8;
// Horário dos extremos: nas marés pequenas e mistas do Sudeste e do Sul (Santos, Paranaguá, Itajaí,
// Rio Grande) há preamares achatadas, dupla preamar e dupla baixa-mar; num pico achatado, poucos
// centímetros deslocam muito o "momento" do pico. O limite de horário é maior nesses portos — o
// critério que importa para UKC é a altura, com o mesmo limite em todos.
const F = (p: string) => `scripts/fixtures/dhn_${p}_2025_extremos.csv`;
const PORTOS: Record<string, { fixture: string; limiteMin: number }> = {
  ITAQUI: { fixture: F('itaqui'), limiteMin: 10 },
  SANTOS: { fixture: F('santos'), limiteMin: 30 },
  SUAPE: { fixture: F('suape'), limiteMin: 10 },
  TEMADRE: { fixture: F('madredeus'), limiteMin: 10 },
  'PECÉM': { fixture: F('pecem'), limiteMin: 10 },
  MUCURIPE: { fixture: F('mucuripe'), limiteMin: 10 },
  VILA_DO_CONDE: { fixture: F('viladoconde'), limiteMin: 10 },
  'PARANAGUÁ': { fixture: F('paranagua'), limiteMin: 30 },
  'ITAJAÍ': { fixture: F('itajai'), limiteMin: 30 },
  RIO_GRANDE: { fixture: F('riogrande'), limiteMin: 30 },
};

const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

function validar(portoId: string): boolean {
  const { fixture, limiteMin } = PORTOS[portoId];
  const dhn = readFileSync(fixture, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => {
    const [, utc, h, tipo] = l.split(',');
    return { t: Date.parse(utc + 'Z'), h: Number(h), tipo };
  }).filter((e) => e.tipo === 'PM' || e.tipo === 'BM');

  const inicio = new Date(Date.UTC(2024, 11, 31, 12, 0, 0));
  const pts = preverMareHarmonico(portoId, inicio, 367, 5).map((p) => ({ t: Date.parse(p.dt), h: p.altura_m }));
  const passo = pts[1].t - pts[0].t;

  const alturaEm = (t: number) => {
    const i = Math.min(Math.max(Math.floor((t - pts[0].t) / passo), 0), pts.length - 2);
    const f = (t - pts[i].t) / passo;
    return pts[i].h + f * (pts[i + 1].h - pts[i].h);
  };

  const ext: { t: number; tipo: string }[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1].h, pts[i].h, pts[i + 1].h];
    if (b > a && b >= c) ext.push({ t: pts[i].t, tipo: 'PM' });
    else if (b < a && b <= c) ext.push({ t: pts[i].t, tipo: 'BM' });
  }

  const dh = dhn.map((d) => Math.abs(alturaEm(d.t) - d.h) * 100);
  const dt = dhn.map((d) => {
    let best = Infinity;
    for (const p of ext) if (p.tipo === d.tipo) best = Math.min(best, Math.abs(p.t - d.t));
    return best / 60000;
  });
  const [ecm, emin] = [media(dh), media(dt)];
  const ok = ecm <= LIMITE_ALTURA_CM && emin <= limiteMin;
  console.log(
    `${ok ? 'OK   ' : 'FALHA'} ${portoId.padEnd(13)} altura no instante ${ecm.toFixed(1)} cm (limite ${LIMITE_ALTURA_CM}) | ` +
    `horário dos extremos ${emin.toFixed(1)} min (limite ${limiteMin})  [n=${dhn.length}]`,
  );
  return ok;
}

const pedidos = process.argv.slice(2).filter((a) => PORTOS[a]);
const resultados = (pedidos.length ? pedidos : Object.keys(PORTOS)).map(validar);
process.exit(resultados.every(Boolean) ? 0 : 1);
