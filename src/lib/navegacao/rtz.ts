// ═══════════════════════════════════════════════════════════════
// EXPORTAÇÃO RTZ — Route Plan Exchange Format (IEC 61174)
// ═══════════════════════════════════════════════════════════════
// Versão padrão: RTZ 1.0, o esquema do Anexo S da IEC 61174 Ed. 4.0 (2015) —
//   namespace http://www.cirm.org/RTZ/1/0. O XSD oficial (publicado pelo CIRM) grafa o elemento de
//   cronograma como "sheduleElement"; seguimos o XSD.
// Opcional: RTZ 1.2, revisão da IEC PAS 61174-1:2021 — namespace http://www.cirm.org/RTZ/1/2,
//   "scheduleElement", atributo revision obrigatório e extensões em <extension manufacturer=…>.
// Os dois formatos são validados contra os XSD oficiais em scripts/navegacao/validar_rtz_xsd.py.
//
// Convenções do RTZ seguidas aqui (conforme os arquivos de teste do CIRM):
//   • o <leg> de um waypoint descreve a perna que CHEGA a ele (o primeiro waypoint não tem leg);
//   • routeName = nome do arquivo sem a extensão .rtz;
//   • horários em UTC (xsd:dateTime com 'Z'); distâncias em NM; velocidades em nós.
//
// O arquivo não tem certificação de nenhum tipo: é rota de PLANEJAMENTO. O aviso vai no comentário
// do cabeçalho, no routeStatus e numa extensão — a autoridade de navegação é o ECDIS com ENC oficial.

import { ResultadoRota } from './roteador';
import { FONTES_DADOS_NAVEGACAO } from './grade';

export type VersaoRTZ = '1.0' | '1.2';

export const AVISO_PLANEJAMENTO =
  'Rota de PLANEJAMENTO, não é para navegação. A autoridade de navegação é o ECDIS com ENC oficial: ' +
  'antes de usar, verifique a rota no ECDIS (route check) contra as ENC atualizadas, os Avisos aos Navegantes e o Roteiro.';

/** Texto curto, sem acentos, para campos que o ECDIS exibe. */
const STATUS_ROTA = 'Planning only - not for navigation / Planejamento - nao usar para navegacao';

export interface DadosNavioRTZ {
  nome?: string;
  imo?: number;
  mmsi?: number;
  /** Calado (m) — vai em draughtForward/draughtAft das pernas. */
  caladoM?: number;
}

export interface OpcoesRTZ {
  /** Nome da rota (também o nome do arquivo). Será normalizado para ASCII [A-Za-z0-9_-]. */
  nomeRota: string;
  rota: ResultadoRota;
  /** ETD no primeiro waypoint (ponto de aproximação de origem). */
  partida: Date;
  /** Velocidade planejada (nós): única ou uma por perna. */
  velocidadeNos: number | number[];
  navio?: DadosNavioRTZ;
  viagem?: string;
  versao?: VersaoRTZ;
  /** Raio de guinada padrão (NM). */
  raioGuinadaNm?: number;
  /** Limite de desvio lateral (XTD) padrão, cada bordo (NM). */
  xtdNm?: number;
  /** Data de geração (para testes reprodutíveis). */
  geradoEm?: Date;
}

export interface CronogramaRota {
  /** Velocidade planejada por perna (nós). */
  velocidadePorPerna: number[];
  /** ETA em cada waypoint (o primeiro é o ETD). */
  horarios: Date[];
  /** Duração total (h). */
  duracaoHoras: number;
}

export function calcularCronograma(rota: ResultadoRota, partida: Date, velocidadeNos: number | number[]): CronogramaRota {
  const n = rota.pernas.length;
  const vel = Array.isArray(velocidadeNos) ? velocidadeNos : new Array(n).fill(velocidadeNos);
  if (vel.length !== n) throw new Error(`São ${n} pernas e ${vel.length} velocidades`);
  if (vel.some((v) => !(v > 0) || v > 60)) throw new Error('Velocidade planejada deve estar entre 0 e 60 nós');
  const horarios: Date[] = [new Date(partida.getTime())];
  let t = partida.getTime();
  for (let i = 0; i < n; i++) {
    t += (rota.pernas[i].distanciaNm / vel[i]) * 3600_000;
    horarios.push(new Date(Math.round(t / 1000) * 1000));
  }
  return { velocidadePorPerna: vel, horarios, duracaoHoras: (t - partida.getTime()) / 3600_000 };
}

/** Normaliza para ASCII seguro em nome de arquivo e no routeName. */
export function normalizarNomeRota(nome: string): string {
  const s = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s.slice(0, 80) || 'ROTA';
}

export function nomeArquivoRTZ(nomeRota: string): string {
  return `${normalizarNomeRota(nomeRota)}.rtz`;
}

const asciiTexto = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Comentários XML não podem conter "--". */
const comentario = (s: string) => s.replace(/--+/g, '-');

const dataUtc = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const dec = (v: number, casas: number) => {
  const s = v.toFixed(casas);
  return s === `-${(0).toFixed(casas)}` ? (0).toFixed(casas) : s;
};
const fmtRumo = (r: number) => dec(r, 1).padStart(5, '0');

function attrs(pares: [string, string | number | undefined][]): string {
  return pares
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('');
}

export function gerarRTZ(op: OpcoesRTZ): { nomeArquivo: string; conteudo: string } {
  const versao = op.versao ?? '1.0';
  const v12 = versao === '1.2';
  const ns = v12 ? 'http://www.cirm.org/RTZ/1/2' : 'http://www.cirm.org/RTZ/1/0';
  const elSched = v12 ? 'scheduleElement' : 'sheduleElement';
  const nomeRota = normalizarNomeRota(op.nomeRota);
  const { rota } = op;
  if (rota.waypoints.length < 2) throw new Error('A rota precisa de pelo menos 2 waypoints');
  const crono = calcularCronograma(rota, op.partida, op.velocidadeNos);
  const raio = Math.min(op.raioGuinadaNm ?? 0.5, v12 ? 5 : 9.9);
  const xtd = Math.min(op.xtdNm ?? 0.5, 9.9);
  const xtdAprox = Math.min(xtd, 0.2);
  const calado = op.navio?.caladoM && op.navio.caladoM > 0 ? dec(op.navio.caladoM, 2) : undefined;
  const geradoEm = op.geradoEm ?? new Date();
  const iso = rota.isobataUsadaM;
  const p = rota.parametros;

  const L: string[] = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push('<!--');
  L.push(comentario(`  AVISO: ${AVISO_PLANEJAMENTO}`));
  L.push(comentario('  WARNING: planning route only, NOT for navigation. The navigation authority is the ECDIS with official ENCs;'));
  L.push(comentario('  run the ECDIS route check against up-to-date ENCs, Notices to Mariners and Sailing Directions before use.'));
  L.push(comentario(`  Gerado pelo Pharos (NOKAHI) em ${dataUtc(geradoEm)} — formato RTZ ${versao} (IEC 61174).`));
  L.push(comentario(`  Parâmetros: afastamento mínimo da costa ${dec(p.distanciaMinCostaNm, 1)} NM; isóbata de segurança ${iso} m;`));
  L.push(comentario(`  afastamento mínimo da isóbata ${dec(p.distanciaMinIsobataNm, 1)} NM; pernas loxodrômicas; horários em UTC.`));
  L.push(comentario('  Primeiro e último waypoints = pontos de aproximação (referência de planejamento); o trecho de praticagem até o berço não está incluído.'));
  for (const f of FONTES_DADOS_NAVEGACAO) L.push(comentario(`  ${f}`));
  L.push('-->');
  L.push(`<route xmlns="${ns}" version="${versao}">`);
  L.push(`  <routeInfo${attrs([
    ['routeName', nomeRota],
    ['routeAuthor', 'Pharos (NOKAHI)'],
    ['routeStatus', STATUS_ROTA],
    ['validityPeriodStart', dataUtc(crono.horarios[0])],
    ['validityPeriodStop', dataUtc(crono.horarios[crono.horarios.length - 1])],
    ['vesselName', op.navio?.nome ? asciiTexto(op.navio.nome) : undefined],
    ['vesselMMSI', op.navio?.mmsi],
    ['vesselIMO', op.navio?.imo],
    ['vesselVoyage', op.viagem ? asciiTexto(op.viagem) : undefined],
  ])}>`);
  L.push('    <extensions>');
  if (v12) {
    L.push(`      <extension${attrs([
      ['manufacturer', 'NOKAHI'], ['name', 'PharosPlanejamento'], ['version', '1.0'],
      ['aviso', AVISO_PLANEJAMENTO], ['isobataSegurancaM', iso],
      ['afastamentoCostaNm', dec(p.distanciaMinCostaNm, 1)], ['afastamentoIsobataNm', dec(p.distanciaMinIsobataNm, 1)],
    ])}/>`);
  } else {
    L.push(`      <pharos:planejamento xmlns:pharos="urn:nokahi:pharos:rtz:planejamento:1"${attrs([
      ['aviso', AVISO_PLANEJAMENTO], ['isobataSegurancaM', iso],
      ['afastamentoCostaNm', dec(p.distanciaMinCostaNm, 1)], ['afastamentoIsobataNm', dec(p.distanciaMinIsobataNm, 1)],
    ])}/>`);
  }
  L.push('    </extensions>');
  L.push('  </routeInfo>');

  L.push('  <waypoints>');
  L.push(`    <defaultWaypoint radius="${dec(raio, 2)}">`);
  L.push(`      <leg${attrs([
    ['starboardXTD', dec(xtd, 2)], ['portsideXTD', dec(xtd, 2)], ['safetyContour', iso], ['geometryType', 'Loxodrome'],
  ])}/>`);
  L.push('    </defaultWaypoint>');
  rota.waypoints.forEach((w, i) => {
    const id = i + 1;
    L.push(`    <waypoint${attrs([['id', id], ['revision', v12 ? 0 : undefined], ['name', asciiTexto(w.nome)]])}>`);
    L.push(`      <position lat="${dec(w.lat, 6)}" lon="${dec(w.lon, 6)}"/>`);
    if (i > 0) {
      const perna = rota.pernas[i - 1];
      const xtdPerna = perna.emZonaAproximacao ? xtdAprox : xtd;
      L.push(`      <leg${attrs([
        ['starboardXTD', dec(xtdPerna, 2)],
        ['portsideXTD', dec(xtdPerna, 2)],
        ['safetyContour', iso],
        ['geometryType', 'Loxodrome'],
        ['draughtForward', calado],
        ['draughtAft', calado],
        ['legInfo', `Rumo ${fmtRumo(perna.rumoDeg)} - ${dec(perna.distanciaNm, 1)} NM - ${dec(crono.velocidadePorPerna[i - 1], 1)} kn`],
        ['legNote1', perna.emZonaAproximacao ? `Aproximacao: afastamento de terra reduzido (min. 0.2 NM); isobata ${iso} m mantida` : undefined],
      ])}/>`);
    }
    L.push('    </waypoint>');
  });
  L.push('  </waypoints>');

  L.push('  <schedules>');
  L.push('    <schedule id="1" name="Pharos - velocidade planejada">');
  L.push('      <manual>');
  rota.waypoints.forEach((_, i) => {
    L.push(i === 0
      ? `        <${elSched} waypointId="1" etd="${dataUtc(crono.horarios[0])}"/>`
      : `        <${elSched} waypointId="${i + 1}" speed="${dec(crono.velocidadePorPerna[i - 1], 1)}"/>`);
  });
  L.push('      </manual>');
  L.push('      <calculated>');
  rota.waypoints.forEach((_, i) => {
    L.push(i === 0
      ? `        <${elSched} waypointId="1" etd="${dataUtc(crono.horarios[0])}"/>`
      : `        <${elSched} waypointId="${i + 1}" eta="${dataUtc(crono.horarios[i])}" speed="${dec(crono.velocidadePorPerna[i - 1], 1)}"/>`);
  });
  L.push('      </calculated>');
  L.push('    </schedule>');
  L.push('  </schedules>');
  L.push('</route>');
  return { nomeArquivo: `${nomeRota}.rtz`, conteudo: L.join('\n') + '\n' };
}
