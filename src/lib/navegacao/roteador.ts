// ═══════════════════════════════════════════════════════════════
// ROTEADOR COSTEIRO — rota por waypoints entre dois pontos de aproximação
// ═══════════════════════════════════════════════════════════════
// Rota de PLANEJAMENTO. A autoridade de navegação é o ECDIS com ENC oficial; a grade usada aqui
// (GEBCO + Natural Earth, ver grade.ts) não é carta náutica.
//
// Método:
//  1. Transformada de distância euclidiana (Felzenszwalb–Huttenlocher) sobre a grade de 1', em
//     milhas náuticas, a partir das células de terra e das células mais rasas que a isóbata.
//  2. Célula navegável (regime normal): profundidade ≥ isóbata em toda a célula, afastamento da
//     costa ≥ distanciaMinCostaNm e afastamento da isóbata ≥ distanciaMinIsobataNm. As distâncias
//     levam uma margem de meia diagonal de célula duas vezes (célula do obstáculo e célula da
//     amostra), de modo que o afastamento real até o polígono de terra fica ≥ o configurado.
//  3. Zona de aproximação: num raio em torno de cada ponto de aproximação, vale o regime reduzido
//     (isóbata mantida, afastamento de terra ≥ AFASTAMENTO_APROXIMACAO_NM) — é por onde o navio sai
//     da área de praticagem para o regime normal. O raio cresce só se for preciso, com aviso.
//  4. A* em 16 direções (sem cortar quinas) e suavização por linha de visada ao longo da
//     loxodromia: sobram só os waypoints de mudança de rumo.

import { LatLon, loxodromia, mercatorY, pontoNaLoxodromia } from './geo';
import {
  GradeNavegacao, celulaDe, centroDaCelula, dentroDaGrade, isobataDisponivel,
} from './grade';

export interface ParametrosRota {
  /** Afastamento mínimo da linha de costa (NM). */
  distanciaMinCostaNm: number;
  /** Isóbata de segurança (m) — arredondada para a próxima disponível na grade. */
  isobataM: number;
  /** Afastamento mínimo da isóbata de segurança (NM). */
  distanciaMinIsobataNm: number;
}

export const PARAMETROS_ROTA_PADRAO: ParametrosRota = {
  distanciaMinCostaNm: 3,
  isobataM: 20,
  distanciaMinIsobataNm: 1,
};

/** Afastamento mínimo de terra garantido dentro da zona de aproximação (NM). */
export const AFASTAMENTO_APROXIMACAO_NM = 0.2;

export interface WaypointRota extends LatLon {
  nome: string;
}

export interface PernaRota {
  /** Índice do waypoint de partida da perna (a perna chega em indice + 1). */
  indice: number;
  distanciaNm: number;
  rumoDeg: number;
  /** A perna passa pela zona de aproximação (afastamento reduzido). */
  emZonaAproximacao: boolean;
}

export interface ResultadoRota {
  waypoints: WaypointRota[];
  pernas: PernaRota[];
  distanciaTotalNm: number;
  /** Distância em linha reta (loxodromia direta) entre os extremos, para comparação. */
  distanciaDiretaNm: number;
  parametros: ParametrosRota;
  isobataUsadaM: number;
  raioAproximacaoNm: { origem: number; destino: number };
  avisos: string[];
  /** pernasSemVisada: deve ser sempre 0 (pernas do A* que a verificação exata não confirmou). */
  diagnostico: { celulasExpandidas: number; tempoMs: number; pernasSemVisada: number };
}

export interface ExtremoRota extends LatLon {
  nome: string;
}

// ─── Parâmetros internos ───────────────────────────────────────────
/** Margem de discretização: meia diagonal de célula (obstáculo) + meia diagonal (amostra). */
const MARGEM_DISCRETIZACAO_NM = Math.SQRT2;
const RAIO_APROXIMACAO_MAX_NM = 60;

// ─── Transformada de distância (Felzenszwalb–Huttenlocher), em NM ───
const INF = 1e20;

function edt1d(f: Float64Array, pos: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const r = v[k];
      s = ((f[q] + pos[q] * pos[q]) - (f[r] + pos[r] * pos[r])) / (2 * pos[q] - 2 * pos[r]);
      if (s <= z[k] && k > 0) k--;
      else break;
    }
    if (s <= z[k]) {
      v[0] = q; z[0] = -INF; z[1] = INF; k = 0;
    } else {
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < pos[q]) k++;
    const r = v[k];
    const dx = pos[q] - pos[r];
    d[q] = dx * dx + f[r];
  }
}

/** Distância (NM) de cada célula ao centro da célula-obstáculo mais próxima. */
export function transformadaDistanciaNm(grade: GradeNavegacao, obstaculo: (classe: number) => boolean): Float32Array {
  const { linhas, colunas, classe, celulaDeg, latMin } = grade;
  const celNm = celulaDeg * 60;
  const m = Math.max(linhas, colunas);
  const f = new Float64Array(m);
  const pos = new Float64Array(m);
  const d = new Float64Array(m);
  const v = new Int32Array(m);
  const z = new Float64Array(m + 1);
  const g = new Float64Array(linhas * colunas);

  // Passo 1: ao longo das colunas (norte–sul), espaçamento uniforme.
  for (let i = 0; i < linhas; i++) pos[i] = i * celNm;
  for (let c = 0; c < colunas; c++) {
    let algum = false;
    for (let i = 0; i < linhas; i++) {
      const ob = obstaculo(classe[i * colunas + c]);
      f[i] = ob ? 0 : INF;
      if (ob) algum = true;
    }
    if (!algum) {
      for (let i = 0; i < linhas; i++) g[i * colunas + c] = INF;
      continue;
    }
    edt1d(f, pos, linhas, d, v, z);
    for (let i = 0; i < linhas; i++) g[i * colunas + c] = d[i];
  }
  // Passo 2: ao longo das linhas (leste–oeste), espaçamento cos(lat) — métrica local.
  const out = new Float32Array(linhas * colunas);
  for (let i = 0; i < linhas; i++) {
    const lat = latMin + (i + 0.5) * celulaDeg;
    const larg = Math.cos((lat * Math.PI) / 180) * celNm;
    for (let c = 0; c < colunas; c++) {
      pos[c] = c * larg;
      f[c] = g[i * colunas + c];
    }
    edt1d(f, pos, colunas, d, v, z);
    for (let c = 0; c < colunas; c++) out[i * colunas + c] = d[c] >= INF / 2 ? 1e9 : Math.sqrt(d[c]);
  }
  return out;
}

// ─── Máscaras em cache (por grade e parâmetros) ───
interface CacheGrade {
  distTerra?: Float32Array;
  distRaso: Map<number, Float32Array>;
  mascaras: Map<string, { normal: Uint8Array; reduzida: Uint8Array }>;
}
const cache = new WeakMap<GradeNavegacao, CacheGrade>();

function cacheDe(grade: GradeNavegacao): CacheGrade {
  let c = cache.get(grade);
  if (!c) {
    c = { distRaso: new Map(), mascaras: new Map() };
    cache.set(grade, c);
  }
  return c;
}

export function distanciaATerra(grade: GradeNavegacao): Float32Array {
  const c = cacheDe(grade);
  if (!c.distTerra) c.distTerra = transformadaDistanciaNm(grade, (k) => k === 0);
  return c.distTerra;
}

function distanciaARaso(grade: GradeNavegacao, classeMin: number): Float32Array {
  const c = cacheDe(grade);
  let d = c.distRaso.get(classeMin);
  if (!d) {
    d = transformadaDistanciaNm(grade, (k) => k < classeMin);
    c.distRaso.set(classeMin, d);
  }
  return d;
}

function mascaras(grade: GradeNavegacao, p: ParametrosRota) {
  const { indice } = isobataDisponivel(grade, p.isobataM);
  const classeMin = indice + 2;
  const chave = `${p.distanciaMinCostaNm}|${classeMin}|${p.distanciaMinIsobataNm}`;
  const c = cacheDe(grade);
  let mk = c.mascaras.get(chave);
  if (!mk) {
    const dT = distanciaATerra(grade);
    const dR = distanciaARaso(grade, classeMin);
    const n = grade.linhas * grade.colunas;
    const normal = new Uint8Array(n);
    const reduzida = new Uint8Array(n);
    const limCosta = p.distanciaMinCostaNm + MARGEM_DISCRETIZACAO_NM;
    const limIso = p.distanciaMinIsobataNm > 0 ? p.distanciaMinIsobataNm + MARGEM_DISCRETIZACAO_NM : 0;
    const limRed = AFASTAMENTO_APROXIMACAO_NM + MARGEM_DISCRETIZACAO_NM;
    for (let i = 0; i < n; i++) {
      if (grade.classe[i] < classeMin) continue;
      if (dT[i] >= limRed) reduzida[i] = 1;
      if (dT[i] >= limCosta && dR[i] >= limIso) normal[i] = 1;
    }
    mk = { normal, reduzida };
    c.mascaras.set(chave, mk);
  }
  return { ...mk, classeMin };
}

// ─── Utilidades de grade ───
function cosLinha(grade: GradeNavegacao, linha: number): number {
  return Math.cos(((grade.latMin + (linha + 0.5) * grade.celulaDeg) * Math.PI) / 180);
}

/** Distância aproximada (NM) entre o centro de uma célula e um ponto. */
function distCelulaPontoNm(grade: GradeNavegacao, linha: number, coluna: number, p: LatLon): number {
  const c = centroDaCelula(grade, linha, coluna);
  const dLat = (c.lat - p.lat) * 60;
  const dLon = (c.lon - p.lon) * 60 * Math.cos((((c.lat + p.lat) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** Máscara de travessia: regime normal + regime reduzido dentro das zonas de aproximação. */
function montarPermissao(
  grade: GradeNavegacao, normal: Uint8Array, reduzida: Uint8Array,
  zonas: { centro: LatLon; raioNm: number }[],
): Uint8Array {
  const perm = normal.slice();
  for (const z of zonas) {
    const raioLat = z.raioNm / 60;
    const raioLon = z.raioNm / (60 * Math.max(0.2, Math.cos((z.centro.lat * Math.PI) / 180)));
    const a = celulaDe(grade, { lat: z.centro.lat - raioLat, lon: z.centro.lon - raioLon });
    const b = celulaDe(grade, { lat: z.centro.lat + raioLat, lon: z.centro.lon + raioLon });
    for (let i = Math.max(0, a.linha); i <= Math.min(grade.linhas - 1, b.linha); i++) {
      for (let j = Math.max(0, a.coluna); j <= Math.min(grade.colunas - 1, b.coluna); j++) {
        const k = i * grade.colunas + j;
        if (reduzida[k] && !perm[k] && distCelulaPontoNm(grade, i, j, z.centro) <= z.raioNm) perm[k] = 1;
      }
    }
  }
  return perm;
}

/**
 * Percorre, em ordem, TODAS as células atravessadas pela loxodromia a→b (reta em Mercator; as
 * fronteiras de célula são retas de lat e lon constantes também em Mercator). Na passagem exata por
 * um vértice, visita as duas células vizinhas (conservador). `visitar` devolve false para parar.
 */
export function percorrerCelulas(
  grade: GradeNavegacao, a: LatLon, b: LatLon, visitar: (indice: number) => boolean,
): boolean {
  const { latMin, lonMin, celulaDeg: cel, linhas, colunas } = grade;
  let { linha: i, coluna: j } = celulaDe(grade, a);
  const fim = celulaDe(grade, b);
  const passoI = b.lat > a.lat ? 1 : b.lat < a.lat ? -1 : 0;
  const passoJ = b.lon > a.lon ? 1 : b.lon < a.lon ? -1 : 0;
  const ya = mercatorY(a.lat);
  const dy = mercatorY(b.lat) - ya;
  const dx = b.lon - a.lon;
  const tX = (jj: number) => (passoJ === 0 ? Infinity : (lonMin + (jj + (passoJ > 0 ? 1 : 0)) * cel - a.lon) / dx);
  const tY = (ii: number) => (passoI === 0 ? Infinity : (mercatorY(latMin + (ii + (passoI > 0 ? 1 : 0)) * cel) - ya) / dy);
  const ver = (ii: number, jj: number) =>
    ii >= 0 && jj >= 0 && ii < linhas && jj < colunas ? visitar(ii * colunas + jj) : visitar(-1);
  if (!ver(i, j)) return false;
  let txm = tX(j);
  let tym = tY(i);
  const EPS = 1e-12;
  for (let guarda = 0; (i !== fim.linha || j !== fim.coluna) && guarda < 1_000_000; guarda++) {
    if (Math.min(txm, tym) > 1 + 1e-9) break; // chegou à célula final por arredondamento
    if (txm < tym - EPS) {
      j += passoJ; txm = tX(j);
    } else if (tym < txm - EPS) {
      i += passoI; tym = tY(i);
    } else {
      if (!ver(i, j + passoJ) || !ver(i + passoI, j)) return false;
      i += passoI; j += passoJ; txm = tX(j); tym = tY(i);
    }
    if (!ver(i, j)) return false;
  }
  return true;
}

/** Linha de visada: a loxodromia a→b só atravessa células permitidas (verificação exata, sem amostragem). */
export function visadaLivre(grade: GradeNavegacao, perm: Uint8Array, a: LatLon, b: LatLon): boolean {
  return percorrerCelulas(grade, a, b, (k) => k >= 0 && perm[k] === 1);
}

// ─── A* em 16 direções ───
const VIZ: [number, number, [number, number][]][] = (() => {
  const out: [number, number, [number, number][]][] = [];
  const sgn = Math.sign;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) out.push([dr, dc, []]);
  for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) out.push([dr, dc, [[dr, 0], [0, dc]]]);
  for (const [dr, dc] of [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]] as const) {
    const meio: [number, number][] = Math.abs(dc) === 2
      ? [[0, sgn(dc)], [dr, sgn(dc)]]
      : [[sgn(dr), 0], [sgn(dr), dc]];
    out.push([dr, dc, meio]);
  }
  return out;
})();

function aEstrela(
  grade: GradeNavegacao, perm: Uint8Array, inicio: number, fim: number,
): { caminho: number[] | null; expandidas: number } {
  const { linhas, colunas, celulaDeg } = grade;
  const n = linhas * colunas;
  const celNm = celulaDeg * 60;
  const g = new Float32Array(n).fill(Infinity);
  const pai = new Int32Array(n).fill(-1);
  const fechado = new Uint8Array(n);
  let heapF = new Float64Array(1 << 16);
  let heapI = new Int32Array(1 << 16);
  let tam = 0;
  const push = (f: number, i: number) => {
    if (tam === heapF.length) {
      const nf = new Float64Array(tam * 2); nf.set(heapF); heapF = nf;
      const ni = new Int32Array(tam * 2); ni.set(heapI); heapI = ni;
    }
    let k = tam++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p] <= f) break;
      heapF[k] = heapF[p]; heapI[k] = heapI[p]; k = p;
    }
    heapF[k] = f; heapI[k] = i;
  };
  const pop = (): number => {
    const topo = heapI[0];
    const f = heapF[--tam];
    const i = heapI[tam];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= tam) break;
      if (c + 1 < tam && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= f) break;
      heapF[k] = heapF[c]; heapI[k] = heapI[c]; k = c;
    }
    heapF[k] = f; heapI[k] = i;
    return topo;
  };

  const lf = Math.floor(fim / colunas);
  const cf = fim % colunas;
  const cosFim = cosLinha(grade, lf);
  const h = (l: number, c: number) => {
    const cc = Math.min(cosLinha(grade, l), cosFim);
    const dx = (c - cf) * cc;
    const dy = l - lf;
    return Math.sqrt(dx * dx + dy * dy) * celNm;
  };

  g[inicio] = 0;
  push(h(Math.floor(inicio / colunas), inicio % colunas), inicio);
  let expandidas = 0;
  while (tam > 0) {
    const atual = pop();
    if (fechado[atual]) continue;
    fechado[atual] = 1;
    expandidas++;
    if (atual === fim) break;
    const l = Math.floor(atual / colunas);
    const c = atual % colunas;
    const gA = g[atual];
    for (const [dr, dc, meio] of VIZ) {
      const nl = l + dr;
      const nc = c + dc;
      if (nl < 0 || nc < 0 || nl >= linhas || nc >= colunas) continue;
      const k = nl * colunas + nc;
      if (!perm[k] || fechado[k]) continue;
      let ok = true;
      for (const [ml, mc] of meio) {
        if (!perm[(l + ml) * colunas + (c + mc)]) { ok = false; break; }
      }
      if (!ok) continue;
      const cm = Math.cos(((grade.latMin + (l + dr / 2 + 0.5) * celulaDeg) * Math.PI) / 180);
      const custo = Math.sqrt(dr * dr + dc * dc * cm * cm) * celNm;
      const ng = gA + custo;
      if (ng < g[k]) {
        g[k] = ng;
        pai[k] = atual;
        push(ng + h(nl, nc), k);
      }
    }
  }
  if (!fechado[fim]) return { caminho: null, expandidas };
  const caminho: number[] = [];
  for (let k = fim; k !== -1; k = pai[k]) caminho.push(k);
  caminho.reverse();
  return { caminho, expandidas };
}

/** Células alcançáveis a partir de `inicio` com os mesmos movimentos do A*. */
function inundar(grade: GradeNavegacao, perm: Uint8Array, inicio: number): Uint8Array {
  const { linhas, colunas } = grade;
  const vis = new Uint8Array(linhas * colunas);
  if (!perm[inicio]) return vis;
  const fila = new Int32Array(linhas * colunas);
  let ini = 0;
  let fim = 0;
  fila[fim++] = inicio;
  vis[inicio] = 1;
  while (ini < fim) {
    const atual = fila[ini++];
    const l = Math.floor(atual / colunas);
    const c = atual % colunas;
    for (const [dr, dc, meio] of VIZ) {
      const nl = l + dr;
      const nc = c + dc;
      if (nl < 0 || nc < 0 || nl >= linhas || nc >= colunas) continue;
      const k = nl * colunas + nc;
      if (vis[k] || !perm[k]) continue;
      let ok = true;
      for (const [ml, mc] of meio) {
        if (!perm[(l + ml) * colunas + (c + mc)]) { ok = false; break; }
      }
      if (!ok) continue;
      vis[k] = 1;
      fila[fim++] = k;
    }
  }
  return vis;
}

/** Semente de mar aberto (Atlântico Sul, ~20°S 35°W): profundo e longe de qualquer costa. */
const MAR_ABERTO: LatLon = { lat: -20, lon: -35 };
/** Distância máxima para deslocar um extremo sem saída para o mar aberto (NM). */
const DESLOCAMENTO_MAX_NM = 40;

/** Suavização gulosa por linha de visada: mantém só os vértices necessários. */
function suavizar(grade: GradeNavegacao, perm: Uint8Array, pts: LatLon[]): { vertices: LatLon[]; semVisada: number } {
  const out: LatLon[] = [pts[0]];
  let semVisada = 0;
  let ancora = 0;
  while (ancora < pts.length - 1) {
    // Avança enquanto houver visada; recua para o último ponto visível.
    let melhor = ancora + 1;
    if (!visadaLivre(grade, perm, pts[ancora], pts[melhor])) semVisada++;
    for (let j = ancora + 2; j < pts.length; j++) {
      if (visadaLivre(grade, perm, pts[ancora], pts[j])) melhor = j;
      else if (j - melhor > 40) break; // obstáculo persistente: não adianta procurar mais longe
    }
    out.push(pts[melhor]);
    ancora = melhor;
  }
  return { vertices: out, semVisada };
}

/**
 * Divide as pernas que só tocam a zona de aproximação numa ponta: insere um waypoint SOBRE a própria
 * perna no limite da zona (a geometria da rota não muda), para que só o trecho da ponta fique no regime
 * reduzido — e receba XTD menor no RTZ — e o resto cumpra o regime normal.
 */
function dividirNaZona(grade: GradeNavegacao, normal: Uint8Array, vertices: LatLon[]): LatLon[] {
  const out: LatLon[] = [vertices[0]];
  const PASSO_NM = 0.05;
  const MIN_TRECHO_NM = 1;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const dist = loxodromia(a, b).distanciaNm;
    if (dist < 2 * MIN_TRECHO_NM || visadaLivre(grade, normal, a, b)) { out.push(b); continue; }
    const n = Math.ceil(dist / PASSO_NM);
    const ok: boolean[] = [];
    for (let k = 0; k <= n; k++) {
      const q = pontoNaLoxodromia(a, b, k / n);
      const c = celulaDe(grade, q);
      ok.push(dentroDaGrade(grade, c.linha, c.coluna) && normal[c.linha * grade.colunas + c.coluna] === 1);
    }
    let k1 = ok.indexOf(true);
    let k2 = ok.lastIndexOf(true);
    if (k1 < 0 || (k2 - k1) * PASSO_NM < MIN_TRECHO_NM || ok.slice(k1, k2 + 1).some((x) => !x)) { out.push(b); continue; }
    // Confirma o trecho do meio pela travessia exata; encolhe até confirmar.
    while (k2 - k1 > 2 && !visadaLivre(grade, normal, pontoNaLoxodromia(a, b, k1 / n), pontoNaLoxodromia(a, b, k2 / n))) { k1++; k2--; }
    if ((k2 - k1) * PASSO_NM < MIN_TRECHO_NM) { out.push(b); continue; }
    if (k1 > 0 && k1 * PASSO_NM >= 0.2) out.push(pontoNaLoxodromia(a, b, k1 / n));
    if (k2 < n && (n - k2) * PASSO_NM >= 0.2) out.push(pontoNaLoxodromia(a, b, k2 / n));
    out.push(b);
  }
  return out;
}

/** Célula permitida mais próxima de um ponto (busca em anéis), para extremos em água rasa. */
function celulaPermitidaMaisProxima(
  grade: GradeNavegacao, perm: Uint8Array, p: LatLon, raioMaxNm: number,
): { linha: number; coluna: number } | null {
  const { linha, coluna } = celulaDe(grade, p);
  const raioCel = Math.ceil(raioMaxNm / (grade.celulaDeg * 60 * 0.8));
  // A coluna mede cos(lat) NM ≥ 0,8 NM no recorte (|lat| ≤ 35°): o anel r está a ≥ 0,8·r NM.
  let melhorD = Infinity;
  let melhorI = -1;
  let melhorJ = -1;
  for (let r = 0; r <= raioCel; r++) {
    for (let i = linha - r; i <= linha + r; i++) {
      for (let j = coluna - r; j <= coluna + r; j++) {
        if (Math.max(Math.abs(i - linha), Math.abs(j - coluna)) !== r) continue;
        if (!dentroDaGrade(grade, i, j) || !perm[i * grade.colunas + j]) continue;
        const d = distCelulaPontoNm(grade, i, j, p);
        if (d <= raioMaxNm && d < melhorD) { melhorD = d; melhorI = i; melhorJ = j; }
      }
    }
    if (melhorI >= 0 && r * grade.celulaDeg * 60 * 0.8 > melhorD) break;
  }
  return melhorI >= 0 ? { linha: melhorI, coluna: melhorJ } : null;
}

const fmt1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Calcula a rota de planejamento entre dois pontos de aproximação.
 * Lança erro se não houver passagem que respeite os parâmetros.
 */
export function calcularRota(
  grade: GradeNavegacao, origem: ExtremoRota, destino: ExtremoRota,
  parametros: Partial<ParametrosRota> = {},
): ResultadoRota {
  const t0 = Date.now();
  const p: ParametrosRota = { ...PARAMETROS_ROTA_PADRAO, ...parametros };
  if (!(p.distanciaMinCostaNm >= 0) || !(p.distanciaMinIsobataNm >= 0) || !(p.isobataM > 0)) {
    throw new Error('Parâmetros de rota inválidos');
  }
  const avisos: string[] = [];
  const maxIso = grade.limiares[grade.limiares.length - 1];
  if (p.isobataM > maxIso) throw new Error(`Isóbata de segurança acima de ${maxIso} m não disponível na grade.`);
  const iso = isobataDisponivel(grade, p.isobataM);
  if (iso.valorM !== p.isobataM) {
    avisos.push(`Isóbata de ${fmt1(p.isobataM)} m arredondada para ${iso.valorM} m, a próxima disponível na grade (como no ECDIS).`);
  }
  const { normal, reduzida } = mascaras(grade, p);

  // Extremos: devem cair em água com profundidade ≥ isóbata e longe de terra (regime reduzido).
  const extremos: ExtremoRota[] = [];
  for (const [rotulo, e] of [['origem', origem], ['destino', destino]] as const) {
    const cel = celulaDe(grade, e);
    if (!dentroDaGrade(grade, cel.linha, cel.coluna)) {
      throw new Error(`O ponto de ${rotulo} (${e.nome}) está fora da área coberta (costa brasileira).`);
    }
    if (reduzida[cel.linha * grade.colunas + cel.coluna]) {
      extremos.push(e);
      continue;
    }
    const alt = celulaPermitidaMaisProxima(grade, reduzida, e, 25);
    if (!alt) {
      throw new Error(`Não há água com profundidade ≥ ${iso.valorM} m a menos de 25 NM do ponto de ${rotulo} (${e.nome}). Reduza a isóbata.`);
    }
    const novo = { ...centroDaCelula(grade, alt.linha, alt.coluna), nome: e.nome };
    const desloc = loxodromia(e, novo).distanciaNm;
    avisos.push(`O ponto de aproximação de ${rotulo} (${e.nome}) está em água mais rasa que ${iso.valorM} m ou junto à costa; a rota começa ${fmt1(desloc)} NM dali, no ponto mais próximo que atende à isóbata.`);
    extremos.push(novo);
  }
  let [a, b] = extremos;

  // Zona de aproximação: começa justa e cresce só se não houver saída.
  let raio = Math.max(2, p.distanciaMinCostaNm + p.distanciaMinIsobataNm + 2 * MARGEM_DISCRETIZACAO_NM + 1);
  const ca = celulaDe(grade, a);
  const cb = celulaDe(grade, b);
  const ia = ca.linha * grade.colunas + ca.coluna;
  const ib = cb.linha * grade.colunas + cb.coluna;
  let res: { caminho: number[] | null; expandidas: number } = { caminho: null, expandidas: 0 };
  let perm = normal;
  let expandidas = 0;
  for (;;) {
    perm = montarPermissao(grade, normal, reduzida, [{ centro: a, raioNm: raio }, { centro: b, raioNm: raio }]);
    res = aEstrela(grade, perm, ia, ib);
    expandidas += res.expandidas;
    if (res.caminho || raio >= RAIO_APROXIMACAO_MAX_NM) break;
    raio = Math.min(RAIO_APROXIMACAO_MAX_NM, raio * 2);
  }
  if (!res.caminho) {
    // Algum extremo está num bolsão (ex.: baía com água ≥ isóbata sem saída ≥ isóbata para o mar):
    // desloca-o para a célula mais próxima ligada ao mar aberto e tenta de novo.
    const cm = celulaDe(grade, MAR_ABERTO);
    const mar = inundar(grade, perm, cm.linha * grade.colunas + cm.coluna);
    const novos: ExtremoRota[] = [a, b];
    let deslocou = false;
    for (const [n, rotulo, ext] of [[0, 'origem', origem], [1, 'destino', destino]] as const) {
      const e = novos[n];
      const c = celulaDe(grade, e);
      if (mar[c.linha * grade.colunas + c.coluna]) continue;
      const alt = celulaPermitidaMaisProxima(grade, mar, e, DESLOCAMENTO_MAX_NM);
      if (!alt) continue;
      const novo = { ...centroDaCelula(grade, alt.linha, alt.coluna), nome: ext.nome };
      avisos.push(`Com isóbata de ${iso.valorM} m, o ponto de ${rotulo} (${ext.nome}) não tem saída para o mar aberto; a rota começa ${fmt1(loxodromia(e, novo).distanciaNm)} NM dali, no ponto mais próximo com saída.`);
      novos[n] = novo;
      deslocou = true;
    }
    if (deslocou) {
      [a, b] = novos;
      const na = celulaDe(grade, a);
      const nb = celulaDe(grade, b);
      res = aEstrela(grade, perm, na.linha * grade.colunas + na.coluna, nb.linha * grade.colunas + nb.coluna);
      expandidas += res.expandidas;
    }
  }
  if (!res.caminho) {
    throw new Error(
      `Não há passagem que mantenha ${fmt1(p.distanciaMinCostaNm)} NM da costa, isóbata de ${iso.valorM} m e ` +
      `${fmt1(p.distanciaMinIsobataNm)} NM da isóbata entre ${origem.nome} e ${destino.nome}. Reduza os afastamentos.`,
    );
  }
  const raioBase = Math.max(2, p.distanciaMinCostaNm + p.distanciaMinIsobataNm + 2 * MARGEM_DISCRETIZACAO_NM + 1);
  if (raio > raioBase) {
    avisos.push(`Para sair dos pontos de aproximação foi preciso estender a zona de afastamento reduzido para ${fmt1(raio)} NM.`);
  }

  const pts: LatLon[] = res.caminho.map((k) => centroDaCelula(grade, Math.floor(k / grade.colunas), k % grade.colunas));
  pts[0] = { lat: a.lat, lon: a.lon };
  pts[pts.length - 1] = { lat: b.lat, lon: b.lon };
  const suave = suavizar(grade, perm, pts);
  const semVisada = suave.semVisada;
  const vertices = dividirNaZona(grade, normal, suave.vertices);

  const waypoints: WaypointRota[] = vertices.map((v, i) => ({
    lat: v.lat,
    lon: v.lon,
    nome: i === 0 ? origem.nome : i === vertices.length - 1 ? destino.nome : `WP${String(i).padStart(2, '0')}`,
  }));
  const pernas: PernaRota[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const { distanciaNm, rumoDeg } = loxodromia(waypoints[i], waypoints[i + 1]);
    // Perna em zona de aproximação se atravessa alguma célula fora do regime normal.
    const emZona = !visadaLivre(grade, normal, waypoints[i], waypoints[i + 1]);
    pernas.push({ indice: i, distanciaNm, rumoDeg, emZonaAproximacao: emZona });
  }
  const distanciaTotalNm = pernas.reduce((s, x) => s + x.distanciaNm, 0);
  return {
    waypoints,
    pernas,
    distanciaTotalNm,
    distanciaDiretaNm: loxodromia(a, b).distanciaNm,
    parametros: p,
    isobataUsadaM: iso.valorM,
    raioAproximacaoNm: { origem: raio, destino: raio },
    avisos,
    diagnostico: { celulasExpandidas: expandidas, tempoMs: Date.now() - t0, pernasSemVisada: semVisada },
  };
}
