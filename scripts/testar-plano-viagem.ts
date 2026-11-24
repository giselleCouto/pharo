/**
 * Testes do módulo Plano de Viagem (fase 1): rota por waypoints e exportação RTZ.
 *
 * 1. Grade e pontos de aproximação: grade íntegra; cada ponto de aproximação em água ≥ 20 m e fora
 *    dos polígonos de terra.
 * 2. Rotas entre TODOS os pares de portos do catálogo (parâmetros padrão) e entre alguns pares com
 *    outros parâmetros. Para cada perna (loxodromia), verificações independentes do roteador:
 *      a) nenhuma perna cruza terra — interseção exata segmento × aresta, em Mercator, contra os
 *         polígonos Natural Earth 1:10m em resolução original (scripts/fixtures/ne10m_terra_costa_br.json);
 *      b) afastamento da linha de costa Natural Earth ≥ o configurado (pernas da zona de aproximação:
 *         ≥ 0,2 NM), amostrado a cada 0,05 NM;
 *      c) afastamento ≥ o configurado de toda célula de terra ou mais rasa que a isóbata na grade
 *         (distância exata ponto–retângulo), e profundidade ≥ isóbata em todas as amostras.
 * 3. RTZ 1.0 (IEC 61174 Ed.4) e 1.2 (IEC PAS 61174-1): estrutura, ids, legs, cronograma (ETA),
 *    aviso de planejamento, routeName = nome do arquivo; validação contra os XSD oficiais do CIRM com
 *    scripts/navegacao/validar_rtz_xsd.py (requer Python + lxml e rede na 1ª vez; senão, SKIP).
 * 4. Pernas de uma viagem do otimizador e conversão de hora de Brasília para UTC.
 *
 * Uso:
 *   npx esbuild scripts/testar-plano-viagem.ts --bundle --platform=node --format=esm --outfile=testar-plano-viagem.mjs
 *   node testar-plano-viagem.mjs                    # testes completos
 *   node testar-plano-viagem.mjs --rapido           # 6 pares
 *   node testar-plano-viagem.mjs --gravar-exemplos  # também grava docs/plano-de-viagem/exemplos/*.rtz
 * Sai com código 1 se algum teste falhar.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodificarGrade, GradeNavegacao, celulaDe, isobataDisponivel } from '../src/lib/navegacao/grade';
import { calcularRota, ParametrosRota, PARAMETROS_ROTA_PADRAO, ResultadoRota, AFASTAMENTO_APROXIMACAO_NM } from '../src/lib/navegacao/roteador';
import { PORTOS_NAVEGACAO } from '../src/lib/navegacao/portosAproximacao';
import { LatLon, loxodromia, mercatorY, pontoNaLoxodromia } from '../src/lib/navegacao/geo';
import { gerarRTZ, calcularCronograma, AVISO_PLANEJAMENTO } from '../src/lib/navegacao/rtz';
import { pernasDaViagem, horaLocalParaUtc, utcParaHoraLocal, extremoDoPorto } from '../src/lib/navegacao/planoViagem';
import type { Viagem } from '../src/lib/types';

const args = new Set(process.argv.slice(2));
let falhas = 0;
let verificacoes = 0;
function checar(cond: boolean, msg: string) {
  verificacoes++;
  if (!cond) {
    falhas++;
    console.log(`  FALHA: ${msg}`);
  }
}

// ─── Dados ───
const bin = readFileSync('public/navegacao/grade_costa_br.bin');
const grade = decodificarGrade(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const terra = JSON.parse(readFileSync('scripts/fixtures/ne10m_terra_costa_br.json', 'utf8')) as {
  poligonos: [number, number][][][];
};

// ─── Índice de arestas da linha de costa (Natural Earth), em baldes de 0,25° ───
interface Aresta { x1: number; y1: number; x2: number; y2: number; lon1: number; lat1: number; lon2: number; lat2: number }
const BALDE = 0.25;
const baldes = new Map<string, Aresta[]>();
const aneis: { pts: [number, number][]; bb: [number, number, number, number] }[] = [];
const chave = (i: number, j: number) => `${i},${j}`;
for (const poly of terra.poligonos) {
  for (const anel of poly) {
    let bb: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lo, la] of anel) bb = [Math.min(bb[0], lo), Math.min(bb[1], la), Math.max(bb[2], lo), Math.max(bb[3], la)];
    aneis.push({ pts: anel, bb });
    for (let k = 0; k < anel.length - 1; k++) {
      const [lon1, lat1] = anel[k];
      const [lon2, lat2] = anel[k + 1];
      const a: Aresta = { x1: lon1, y1: mercatorY(lat1), x2: lon2, y2: mercatorY(lat2), lon1, lat1, lon2, lat2 };
      const i0 = Math.floor(Math.min(lat1, lat2) / BALDE), i1 = Math.floor(Math.max(lat1, lat2) / BALDE);
      const j0 = Math.floor(Math.min(lon1, lon2) / BALDE), j1 = Math.floor(Math.max(lon1, lon2) / BALDE);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const c = chave(i, j);
        if (!baldes.has(c)) baldes.set(c, []);
        baldes.get(c)!.push(a);
      }
    }
  }
}

function dentroDeTerra(p: LatLon): boolean {
  // Par/ímpar sobre todos os anéis (externos e buracos) — Natural Earth: anéis sem auto-interseção.
  let dentro = false;
  for (const { pts, bb } of aneis) {
    if (p.lon < bb[0] || p.lon > bb[2] || p.lat < bb[1] || p.lat > bb[3]) continue;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if ((yi > p.lat) !== (yj > p.lat) && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** A perna (reta em Mercator) cruza ou toca alguma aresta de terra? */
function pernaCruzaTerra(a: LatLon, b: LatLon): boolean {
  const ax = a.lon, ay = mercatorY(a.lat), bx = b.lon, by = mercatorY(b.lat);
  const vistos = new Set<Aresta>();
  const i0 = Math.floor(Math.min(a.lat, b.lat) / BALDE), i1 = Math.floor(Math.max(a.lat, b.lat) / BALDE);
  const j0 = Math.floor(Math.min(a.lon, b.lon) / BALDE), j1 = Math.floor(Math.max(a.lon, b.lon) / BALDE);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    for (const e of baldes.get(chave(i, j)) ?? []) {
      if (vistos.has(e)) continue;
      vistos.add(e);
      const d1 = orient(ax, ay, bx, by, e.x1, e.y1);
      const d2 = orient(ax, ay, bx, by, e.x2, e.y2);
      const d3 = orient(e.x1, e.y1, e.x2, e.y2, ax, ay);
      const d4 = orient(e.x1, e.y1, e.x2, e.y2, bx, by);
      if (((d1 <= 0 && d2 >= 0) || (d1 >= 0 && d2 <= 0)) && ((d3 <= 0 && d4 >= 0) || (d3 >= 0 && d4 <= 0))) return true;
    }
  }
  return dentroDeTerra(a) || dentroDeTerra(b);
}

/** Distância (NM, métrica local) de um ponto à aresta de costa mais próxima, buscando até `raioNm`. */
function distCostaNm(p: LatLon, raioNm: number): number {
  const cosl = Math.cos((p.lat * Math.PI) / 180);
  const rLat = raioNm / 60, rLon = raioNm / (60 * cosl);
  let melhor = Infinity;
  for (let i = Math.floor((p.lat - rLat) / BALDE); i <= Math.floor((p.lat + rLat) / BALDE); i++) {
    for (let j = Math.floor((p.lon - rLon) / BALDE); j <= Math.floor((p.lon + rLon) / BALDE); j++) {
      for (const e of baldes.get(chave(i, j)) ?? []) {
        const x1 = (e.lon1 - p.lon) * 60 * cosl, y1 = (e.lat1 - p.lat) * 60;
        const x2 = (e.lon2 - p.lon) * 60 * cosl, y2 = (e.lat2 - p.lat) * 60;
        const dx = x2 - x1, dy = y2 - y1;
        const L2 = dx * dx + dy * dy;
        const t = L2 > 0 ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / L2)) : 0;
        const d = Math.hypot(x1 + t * dx, y1 + t * dy);
        if (d < melhor) melhor = d;
      }
    }
  }
  return melhor;
}

/** Distância (NM) do ponto à célula mais próxima que satisfaz `obst`, até `raioNm`. */
function distCelulaNm(g: GradeNavegacao, p: LatLon, raioNm: number, obst: (c: number) => boolean): number {
  const cosl = Math.cos((p.lat * Math.PI) / 180);
  const { linha, coluna } = celulaDe(g, p);
  const rl = Math.ceil(raioNm / (g.celulaDeg * 60)) + 1;
  const rc = Math.ceil(raioNm / (g.celulaDeg * 60 * cosl)) + 1;
  let melhor = Infinity;
  for (let i = linha - rl; i <= linha + rl; i++) {
    for (let j = coluna - rc; j <= coluna + rc; j++) {
      if (i < 0 || j < 0 || i >= g.linhas || j >= g.colunas) continue;
      if (!obst(g.classe[i * g.colunas + j])) continue;
      const la0 = g.latMin + i * g.celulaDeg, lo0 = g.lonMin + j * g.celulaDeg;
      const dyLat = p.lat < la0 ? la0 - p.lat : p.lat > la0 + g.celulaDeg ? p.lat - la0 - g.celulaDeg : 0;
      const dxLon = p.lon < lo0 ? lo0 - p.lon : p.lon > lo0 + g.celulaDeg ? p.lon - lo0 - g.celulaDeg : 0;
      const d = Math.hypot(dyLat * 60, dxLon * 60 * cosl);
      if (d < melhor) melhor = d;
    }
  }
  return melhor;
}

// O roteador verifica a travessia célula a célula (exata); a tolerância cobre a métrica local da
// transformada de distância (cos da latitude da linha) e o arredondamento das coordenadas.
const TOL_AMOSTRA_NM = 0.02;

interface Estat { pernas: number; minCosta: number; minCostaAprox: number; minIso: number }

function verificarRota(rotulo: string, r: ResultadoRota, p: ParametrosRota): Estat {
  const classeMin = isobataDisponivel(grade, p.isobataM).indice + 2;
  const est: Estat = { pernas: r.pernas.length, minCosta: Infinity, minCostaAprox: Infinity, minIso: Infinity };
  checar(r.waypoints.length >= 2, `${rotulo}: rota com menos de 2 waypoints`);
  checar(r.diagnostico.pernasSemVisada === 0, `${rotulo}: ${r.diagnostico.pernasSemVisada} perna(s) do A* sem visada confirmada`);
  for (const perna of r.pernas) {
    const a = r.waypoints[perna.indice], b = r.waypoints[perna.indice + 1];
    checar(!pernaCruzaTerra(a, b), `${rotulo}: perna ${perna.indice + 1}→${perna.indice + 2} cruza terra (Natural Earth)`);
    const exigCosta = perna.emZonaAproximacao ? AFASTAMENTO_APROXIMACAO_NM : p.distanciaMinCostaNm;
    const exigIso = perna.emZonaAproximacao ? 0 : p.distanciaMinIsobataNm;
    const n = Math.max(1, Math.ceil(perna.distanciaNm / 0.05));
    let piorCosta = Infinity, piorIso = Infinity, rasa = false;
    for (let s = 0; s <= n; s++) {
      const q = pontoNaLoxodromia(a, b, s / n);
      piorCosta = Math.min(piorCosta, distCostaNm(q, exigCosta + 2));
      piorCosta = Math.min(piorCosta, distCelulaNm(grade, q, exigCosta + 2, (c) => c === 0));
      if (exigIso > 0) piorIso = Math.min(piorIso, distCelulaNm(grade, q, exigIso + 2, (c) => c < classeMin));
      const { linha, coluna } = celulaDe(grade, q);
      if (grade.classe[linha * grade.colunas + coluna] < classeMin) rasa = true;
    }
    checar(!rasa, `${rotulo}: perna ${perna.indice + 1}→${perna.indice + 2} passa por célula mais rasa que ${r.isobataUsadaM} m`);
    checar(piorCosta >= exigCosta - TOL_AMOSTRA_NM,
      `${rotulo}: perna ${perna.indice + 1}→${perna.indice + 2} a ${piorCosta.toFixed(2)} NM da costa (mínimo ${exigCosta})`);
    if (exigIso > 0) {
      checar(piorIso >= exigIso - TOL_AMOSTRA_NM,
        `${rotulo}: perna ${perna.indice + 1}→${perna.indice + 2} a ${piorIso.toFixed(2)} NM da isóbata (mínimo ${exigIso})`);
      est.minIso = Math.min(est.minIso, piorIso);
    }
    if (perna.emZonaAproximacao) est.minCostaAprox = Math.min(est.minCostaAprox, piorCosta);
    else est.minCosta = Math.min(est.minCosta, piorCosta);
    checar(Math.abs(loxodromia(a, b).distanciaNm - perna.distanciaNm) < 1e-9, `${rotulo}: distância da perna inconsistente`);
  }
  const soma = r.pernas.reduce((s, x) => s + x.distanciaNm, 0);
  checar(Math.abs(soma - r.distanciaTotalNm) < 1e-6, `${rotulo}: distância total ≠ soma das pernas`);
  checar(r.distanciaTotalNm >= r.distanciaDiretaNm - 1e-6, `${rotulo}: rota mais curta que a loxodromia direta`);
  return est;
}

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '  - ');

// ═══ 1. Grade e pontos de aproximação ═══
console.log('1. Grade e pontos de aproximação');
checar(grade.linhas === 2400 && grade.colunas === 1350, 'dimensões da grade');
checar(grade.limiares.join(',') === '2,5,10,15,20,25,30,40,50,100,200', 'limiares de isóbata');
for (const p of Object.values(PORTOS_NAVEGACAO)) {
  const { linha, coluna } = celulaDe(grade, p.aproximacao);
  const c = grade.classe[linha * grade.colunas + coluna];
  checar(c >= isobataDisponivel(grade, 20).indice + 2, `${p.id}: ponto de aproximação mais raso que 20 m (classe ${c})`);
  checar(!dentroDeTerra(p.aproximacao), `${p.id}: ponto de aproximação dentro de terra`);
  const dc = distCostaNm(p.aproximacao, 5);
  checar(dc >= 1, `${p.id}: ponto de aproximação a ${dc.toFixed(2)} NM da costa (< 1 NM)`);
  checar(loxodromia(p.porto, p.aproximacao).distanciaNm < 150, `${p.id}: ponto de aproximação longe demais do porto`);
}
console.log(`   ${Object.keys(PORTOS_NAVEGACAO).length} pontos de aproximação verificados`);

// ═══ 2. Rotas ═══
const ids = Object.keys(PORTOS_NAVEGACAO);
let pares: [string, string][] = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pares.push([ids[i], ids[j]]);
if (args.has('--rapido')) {
  pares = [['SANTOS', 'SUAPE'], ['TEMADRE', 'SUAPE'], ['RIO_GRANDE', 'VILA_DO_CONDE'], ['PARANAGUÁ', 'ITAJAÍ'], ['ITAQUI', 'PECÉM'], ['SANTOS', 'TEMADRE']];
}
const ext = (id: string) => extremoDoPorto(id).extremo;
const rotas = new Map<string, ResultadoRota>();

console.log(`\n2a. Rotas com parâmetros padrão (${PARAMETROS_ROTA_PADRAO.distanciaMinCostaNm} NM da costa, isóbata ${PARAMETROS_ROTA_PADRAO.isobataM} m, ${PARAMETROS_ROTA_PADRAO.distanciaMinIsobataNm} NM da isóbata) — ${pares.length} pares`);
console.log('   par                          wps   dist NM  direta  min costa  min aprox  min isob   ms');
let paresSemFalha = 0;
for (const [o, d] of pares) {
  const antes = falhas;
  const rotulo = `${o}→${d}`;
  let r: ResultadoRota;
  try {
    r = calcularRota(grade, ext(o), ext(d));
  } catch (e) {
    checar(false, `${rotulo}: ${(e as Error).message}`);
    continue;
  }
  rotas.set(rotulo, r);
  const est = verificarRota(rotulo, r, PARAMETROS_ROTA_PADRAO);
  if (falhas === antes) paresSemFalha++;
  console.log(`   ${rotulo.padEnd(28)} ${String(r.waypoints.length).padStart(3)} ${r.distanciaTotalNm.toFixed(0).padStart(9)} ${r.distanciaDiretaNm.toFixed(0).padStart(7)} ${f2(est.minCosta).padStart(10)} ${f2(est.minCostaAprox).padStart(10)} ${f2(est.minIso).padStart(9)} ${String(r.diagnostico.tempoMs).padStart(5)}`);
}
checar(paresSemFalha >= 5, `menos de 5 pares sem falha (${paresSemFalha})`);
console.log(`   ${paresSemFalha}/${pares.length} pares sem nenhuma perna cruzando terra ou violando afastamento`);

// Simetria aproximada: ida e volta com distâncias parecidas
const ida = calcularRota(grade, ext('SANTOS'), ext('SUAPE'));
const volta = calcularRota(grade, ext('SUAPE'), ext('SANTOS'));
checar(Math.abs(ida.distanciaTotalNm - volta.distanciaTotalNm) / ida.distanciaTotalNm < 0.02, 'ida e volta Santos–Suape diferem mais de 2%');
verificarRota('SUAPE→SANTOS', volta, PARAMETROS_ROTA_PADRAO);

console.log('\n2b. Outros parâmetros');
const variantes: { p: ParametrosRota; pares: [string, string][] }[] = [
  { p: { distanciaMinCostaNm: 6, isobataM: 30, distanciaMinIsobataNm: 2 }, pares: [['SANTOS', 'SUAPE'], ['RIO_GRANDE', 'SANTOS'], ['ITAQUI', 'SUAPE']] },
  { p: { distanciaMinCostaNm: 1, isobataM: 10, distanciaMinIsobataNm: 0.5 }, pares: [['PARANAGUÁ', 'SANTOS'], ['TEMADRE', 'PECÉM']] },
  { p: { distanciaMinCostaNm: 10, isobataM: 50, distanciaMinIsobataNm: 0 }, pares: [['TEMADRE', 'SANTOS']] },
];
for (const v of variantes) {
  for (const [o, d] of v.pares) {
    const rotulo = `${o}→${d} [${v.p.distanciaMinCostaNm} NM | ${v.p.isobataM} m | ${v.p.distanciaMinIsobataNm} NM]`;
    try {
      const r = calcularRota(grade, ext(o), ext(d), v.p);
      const est = verificarRota(rotulo, r, v.p);
      console.log(`   ${rotulo.padEnd(48)} ${String(r.waypoints.length).padStart(3)} wps ${r.distanciaTotalNm.toFixed(0).padStart(6)} NM  min costa ${f2(est.minCosta)}  min isob ${f2(est.minIso)}  avisos ${r.avisos.length}`);
    } catch (e) {
      checar(false, `${rotulo}: ${(e as Error).message}`);
    }
  }
}
// Afastamento maior ⇒ rota não mais curta
const r3 = calcularRota(grade, ext('SANTOS'), ext('SUAPE'));
const r10 = calcularRota(grade, ext('SANTOS'), ext('SUAPE'), { distanciaMinCostaNm: 10 });
checar(r10.distanciaTotalNm >= r3.distanciaTotalNm - 1, 'afastamento de 10 NM deu rota mais curta que 3 NM');
// Isóbata arredondada para a próxima disponível, com aviso
const r18 = calcularRota(grade, ext('SANTOS'), ext('PARANAGUÁ'), { isobataM: 18 });
checar(r18.isobataUsadaM === 20 && r18.avisos.some((a) => a.includes('arredondada')), 'isóbata 18 m não foi arredondada para 20 m com aviso');
// Ponto de aproximação mais raso que a isóbata: rota desloca o início e avisa
const r100 = calcularRota(grade, ext('ITAJAÍ'), ext('SANTOS'), { isobataM: 30 });
checar(r100.avisos.some((a) => a.includes('mais rasa')), 'início em água rasa sem aviso de deslocamento');
verificarRota('ITAJAÍ→SANTOS [isóbata 30 m]', r100, { ...PARAMETROS_ROTA_PADRAO, isobataM: 30 });
// Isóbata sem saída para o mar a partir do ponto de aproximação (bolsão na Baía de São Marcos)
const rBolsao = calcularRota(grade, ext('ITAQUI'), ext('PECÉM'), { isobataM: 30 });
checar(rBolsao.avisos.some((a) => a.includes('saída para o mar aberto')), 'Itaqui com isóbata de 30 m: aviso de bolsão ausente');
verificarRota('ITAQUI→PECÉM [isóbata 30 m]', rBolsao, { ...PARAMETROS_ROTA_PADRAO, isobataM: 30 });
// Parâmetros impossíveis ⇒ erro claro
let erroImpossivel = '';
try { calcularRota(grade, ext('SANTOS'), ext('SUAPE'), { isobataM: 5000 }); } catch (e) { erroImpossivel = (e as Error).message; }
checar(erroImpossivel.length > 0, 'isóbata impossível não gerou erro');
console.log(`   isóbata 18 m → ${r18.isobataUsadaM} m; afastamento 3 NM: ${r3.distanciaTotalNm.toFixed(0)} NM, 10 NM: ${r10.distanciaTotalNm.toFixed(0)} NM`);

// ═══ 3. RTZ ═══
console.log('\n3. Exportação RTZ');
interface No { nome: string; attr: Record<string, string>; filhos: No[] }
function parseXml(xml: string): { raiz: No; comentarios: string[] } {
  const comentarios: string[] = [];
  const pilha: No[] = [{ nome: '#doc', attr: {}, filhos: [] }];
  const re = /<!--([\s\S]*?)-->|<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  const desesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) comentarios.push(m[1]);
    else if (m[2]) {
      const no = pilha.pop()!;
      if (no.nome !== m[2]) throw new Error(`XML mal formado: </${m[2]}> fecha <${no.nome}>`);
    } else if (m[3]) {
      const attr: Record<string, string> = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
        if (a[1] in attr) throw new Error(`atributo duplicado ${a[1]}`);
        attr[a[1]] = desesc(a[2]);
      }
      const no: No = { nome: m[3], attr, filhos: [] };
      pilha[pilha.length - 1].filhos.push(no);
      if (!m[5]) pilha.push(no);
    } else if (m[6] && m[6].trim()) throw new Error(`texto inesperado: ${m[6].trim().slice(0, 40)}`);
  }
  if (pilha.length !== 1) throw new Error('XML mal formado: elementos não fechados');
  return { raiz: pilha[0].filhos[0], comentarios };
}
const filhos = (n: No, nome: string) => n.filhos.filter((f) => f.nome === nome);
const ordem = (n: No) => n.filhos.map((f) => f.nome).join(',');

const rotaRtz = rotas.get('SANTOS→SUAPE') ?? ida;
const partida = horaLocalParaUtc('2026-05-01T08:00');
const navio = { nome: 'Navio Exemplo', caladoM: 12.5 };
const arquivosXsd: string[] = [];
const dirTmp = mkdtempSync(join(tmpdir(), 'pharos-rtz-'));
for (const versao of ['1.0', '1.2'] as const) {
  const { nomeArquivo, conteudo } = gerarRTZ({
    nomeRota: `PHAROS SANTOS-SUAPE ${versao === '1.2' ? 'v12' : ''}`.trim(), rota: rotaRtz, partida, velocidadeNos: 12,
    navio, viagem: 'V001', versao, geradoEm: new Date(Date.UTC(2026, 10, 24, 12, 0, 0)),
  });
  const { raiz, comentarios } = parseXml(conteudo);
  const n = rotaRtz.waypoints.length;
  checar(raiz.nome === 'route', `${versao}: raiz não é <route>`);
  checar(raiz.attr.xmlns === `http://www.cirm.org/RTZ/1/${versao === '1.0' ? '0' : '2'}`, `${versao}: namespace`);
  checar(raiz.attr.version === versao, `${versao}: atributo version`);
  checar(ordem(raiz) === 'routeInfo,waypoints,schedules', `${versao}: ordem dos elementos da raiz (${ordem(raiz)})`);
  const info = filhos(raiz, 'routeInfo')[0];
  checar(`${info.attr.routeName}.rtz` === nomeArquivo, `${versao}: routeName ≠ nome do arquivo`);
  checar(/^[A-Za-z0-9_-]+$/.test(info.attr.routeName), `${versao}: routeName com caracteres fora de [A-Za-z0-9_-]`);
  checar(/not for navigation/i.test(info.attr.routeStatus) && /nao usar para navegacao/.test(info.attr.routeStatus), `${versao}: routeStatus sem aviso`);
  checar(comentarios.some((c) => c.includes(AVISO_PLANEJAMENTO)) && comentarios.some((c) => /ECDIS/.test(c)), `${versao}: comentário de aviso ausente`);
  checar(comentarios.every((c) => !c.includes('--')), `${versao}: comentário com "--"`);
  const extInfo = filhos(info, 'extensions')[0];
  checar(!!extInfo && JSON.stringify(extInfo).includes('ECDIS'), `${versao}: extensão com aviso ausente`);
  if (versao === '1.2') checar(extInfo.filhos.every((e) => e.nome === 'extension' && !!e.attr.manufacturer && !!e.attr.name), '1.2: <extension> sem manufacturer/name');
  const wps = filhos(raiz, 'waypoints')[0];
  checar(ordem(wps).startsWith('defaultWaypoint,waypoint'), `${versao}: ordem em <waypoints>`);
  const lista = filhos(wps, 'waypoint');
  checar(lista.length === n, `${versao}: ${lista.length} waypoints, esperado ${n}`);
  checar(new Set(lista.map((w) => w.attr.id)).size === n, `${versao}: ids duplicados`);
  lista.forEach((w, i) => {
    checar(w.attr.id === String(i + 1), `${versao}: id do waypoint ${i + 1}`);
    checar(!!w.attr.name, `${versao}: waypoint ${i + 1} sem nome`);
    if (versao === '1.2') checar(w.attr.revision === '0', `1.2: waypoint ${i + 1} sem revision`);
    const pos = filhos(w, 'position')[0];
    checar(!!pos && Math.abs(+pos.attr.lat - rotaRtz.waypoints[i].lat) < 1e-6 && Math.abs(+pos.attr.lon - rotaRtz.waypoints[i].lon) < 1e-6, `${versao}: posição do waypoint ${i + 1}`);
    checar(/^-?\d+\.\d+$/.test(pos.attr.lat) && /^-?\d+\.\d+$/.test(pos.attr.lon), `${versao}: lat/lon fora do formato decimal`);
    const leg = filhos(w, 'leg');
    if (i === 0) checar(leg.length === 0, `${versao}: primeiro waypoint não deve ter <leg>`);
    else {
      checar(leg.length === 1 && leg[0].attr.geometryType === 'Loxodrome', `${versao}: waypoint ${i + 1} sem leg loxodrômica`);
      checar(+leg[0].attr.safetyContour === rotaRtz.isobataUsadaM, `${versao}: safetyContour`);
      checar(+leg[0].attr.draughtForward === 12.5, `${versao}: draughtForward`);
      checar(+leg[0].attr.starboardXTD < 10 && +leg[0].attr.portsideXTD < 10, `${versao}: XTD fora do intervalo`);
    }
    checar(ordem(w).startsWith('position'), `${versao}: position deve ser o 1º filho do waypoint`);
  });
  const sched = filhos(filhos(raiz, 'schedules')[0], 'schedule')[0];
  const el = versao === '1.0' ? 'sheduleElement' : 'scheduleElement';
  const man = filhos(filhos(sched, 'manual')[0], el);
  const calc = filhos(filhos(sched, 'calculated')[0], el);
  checar(man.length === n && calc.length === n, `${versao}: cronograma com ${man.length}/${calc.length} elementos <${el}>`);
  checar(!!man[0].attr.etd && man.slice(1).every((e) => +e.attr.speed === 12), `${versao}: cronograma manual (etd + velocidade por perna)`);
  const crono = calcularCronograma(rotaRtz, partida, 12);
  checar(calc[0].attr.etd === '2026-05-01T11:00:00Z', `${versao}: ETD em UTC (08:00 de Brasília = 11:00Z), obtido ${calc[0].attr.etd}`);
  let anterior = Date.parse(calc[0].attr.etd);
  calc.slice(1).forEach((e, i) => {
    const t = Date.parse(e.attr.eta);
    checar(t > anterior, `${versao}: ETA não crescente no waypoint ${i + 2}`);
    checar(Math.abs(t - crono.horarios[i + 1].getTime()) < 1000, `${versao}: ETA do waypoint ${i + 2}`);
    anterior = t;
  });
  const horas = (Date.parse(calc[n - 1].attr.eta) - Date.parse(calc[0].attr.etd)) / 3600_000;
  checar(Math.abs(horas - rotaRtz.distanciaTotalNm / 12) < 0.01, `${versao}: duração ≠ distância/velocidade`);
  checar(info.attr.validityPeriodStop === calc[n - 1].attr.eta, `${versao}: validityPeriodStop ≠ ETA final`);
  const caminho = join(dirTmp, nomeArquivo);
  writeFileSync(caminho, conteudo, 'utf8');
  arquivosXsd.push(caminho);
  console.log(`   RTZ ${versao}: ${nomeArquivo} — ${n} waypoints, ETA final ${calc[n - 1].attr.eta} (${horas.toFixed(1)} h a 12 kn)`);
}
// Velocidade por perna diferente em cada perna
const velPernas = rotaRtz.pernas.map((_, i) => 10 + (i % 3));
const rtzVar = parseXml(gerarRTZ({ nomeRota: 'VAR', rota: rotaRtz, partida, velocidadeNos: velPernas }).conteudo).raiz;
const manVar = filhos(filhos(filhos(filhos(rtzVar, 'schedules')[0], 'schedule')[0], 'manual')[0], 'sheduleElement');
checar(manVar.slice(1).every((e, i) => +e.attr.speed === velPernas[i]), 'velocidade por perna não respeitada');
let erroVel = '';
try { gerarRTZ({ nomeRota: 'X', rota: rotaRtz, partida, velocidadeNos: [12] }); } catch (e) { erroVel = (e as Error).message; }
checar(erroVel.includes('pernas'), 'nº de velocidades ≠ nº de pernas não gerou erro');
const esc = parseXml(gerarRTZ({ nomeRota: 'Ação & <teste>', rota: rotaRtz, partida, velocidadeNos: 12, navio: { nome: 'Navio "A" & B' } }).conteudo).raiz;
checar(filhos(esc, 'routeInfo')[0].attr.routeName === 'Acao_teste' && filhos(esc, 'routeInfo')[0].attr.vesselName === 'Navio "A" & B', 'escape/normalização de nomes');

// Exemplos versionados
if (args.has('--gravar-exemplos')) {
  const dirEx = 'docs/plano-de-viagem/exemplos';
  mkdirSync(dirEx, { recursive: true });
  for (const versao of ['1.0', '1.2'] as const) {
    const { nomeArquivo, conteudo } = gerarRTZ({
      nomeRota: versao === '1.0' ? 'PHAROS_SANTOS-SUAPE_RTZ10' : 'PHAROS_SANTOS-SUAPE_RTZ12', rota: ida, partida, velocidadeNos: 12,
      navio, viagem: 'EXEMPLO', versao, geradoEm: new Date(Date.UTC(2026, 10, 24, 12, 0, 0)),
    });
    writeFileSync(join(dirEx, nomeArquivo), conteudo, 'utf8');
    arquivosXsd.push(join(dirEx, nomeArquivo));
    console.log(`   exemplo gravado: ${dirEx}/${nomeArquivo}`);
  }
} else {
  for (const f of ['PHAROS_SANTOS-SUAPE_RTZ10.rtz', 'PHAROS_SANTOS-SUAPE_RTZ12.rtz']) {
    const c = join('docs/plano-de-viagem/exemplos', f);
    if (existsSync(c)) arquivosXsd.push(c);
  }
}

// Validação XSD oficial (Python + lxml)
const py = process.platform === 'win32' ? 'python' : 'python3';
const xsd = spawnSync(py, ['scripts/navegacao/validar_rtz_xsd.py', '--cache', join(tmpdir(), 'pharos-rtz-xsd'), ...arquivosXsd], { encoding: 'utf8' });
if (xsd.error || xsd.status === 2) {
  console.log(`   XSD: SKIP — ${xsd.error ? `${py} indisponível` : xsd.stdout.trim()}`);
} else {
  for (const l of xsd.stdout.trim().split(/\r?\n/)) console.log(`   XSD: ${l}`);
  checar(xsd.status === 0, 'RTZ inválido contra o XSD oficial');
}

// ═══ 4. Pernas da viagem e fuso ═══
console.log('\n4. Pernas da viagem e horários');
checar(horaLocalParaUtc('2026-05-01T08:00').toISOString() === '2026-05-01T11:00:00.000Z', 'hora de Brasília → UTC');
checar(utcParaHoraLocal(new Date('2026-05-01T11:00:00Z')) === '2026-05-01T08:00', 'UTC → hora de Brasília');
const viagem = {
  id: 'V001', data_partida: '2026-05-01T08:00', data_retorno: '2026-05-12T10:00',
  paradas: [
    { porto_id: 'SUAPE', data_chegada: '2026-05-03T20:00', data_saida: '2026-05-05T20:00' },
    { porto_id: 'PECÉM', data_chegada: '2026-05-06T20:00', data_saida: '2026-05-08T20:00' },
  ],
} as unknown as Viagem;
const pv = pernasDaViagem(viagem, 'TEMADRE');
checar(pv.length === 3, `viagem com 2 paradas deve ter 3 pernas (obtido ${pv.length})`);
checar(pv.map((p) => `${p.origemId}>${p.destinoId}@${p.partidaLocal}`).join(' ') ===
  'TEMADRE>SUAPE@2026-05-01T08:00 SUAPE>PECÉM@2026-05-05T20:00 PECÉM>TEMADRE@2026-05-08T20:00', 'origem/destino/partida das pernas');
const custom = extremoDoPorto('XYZ', [{ id: 'XYZ', nome: 'Porto Novo', latitude: -20.3, longitude: -40.24 }]);
checar(!custom.catalogado && custom.extremo.lat === -20.3, 'porto fora do catálogo usa a própria posição');
const rCustom = calcularRota(grade, custom.extremo, ext('SANTOS'));
checar(rCustom.avisos.some((a) => a.includes('Porto Novo')), 'porto fora do catálogo: aviso de deslocamento ausente');
verificarRota('Porto Novo (ES)→SANTOS', rCustom, PARAMETROS_ROTA_PADRAO);

console.log(`\n${verificacoes} verificações, ${falhas} falha(s).`);
process.exit(falhas > 0 ? 1 : 0);
