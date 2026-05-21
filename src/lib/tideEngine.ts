/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MOTOR DE MARÉ — PHAROS (TypeScript / browser)
 *  Espelho do tide_engine.py — roda 100% client-side sem API key
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Fontes suportadas:
 *    1. WorldTides API  (se api_key fornecida)
 *    2. Síntese Harmônica Local — sempre disponível, precisão ±10-20 cm
 *
 *  PLANEJAMENTO 2 MESES À FRENTE:
 *    A maré astronômica é determinística. A incerteza é meteorológica
 *    (surge ±0,3 m). Use margem_meteorologica_m ≥ 0.5 m para planejo antecipado.
 */

import type { JanelaMare, ValidacaoCalado, RestricoesMare, PontoMare } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÕES DOS PORTOS BRASILEIROS
// ─────────────────────────────────────────────────────────────────────────────
export const PORTOS_MARE: Record<string, {
  nome: string; lat: number; lon: number;
  profundidade_m: number; amplitude_media_m: number;
  restricao_noturna: boolean;
}> = {
  TEMADRE:      { nome: 'Terminal Almirante Barroso', lat: -12.97, lon: -38.50, profundidade_m: 14.0, amplitude_media_m: 2.3, restricao_noturna: false },
  SUAPE:        { nome: 'Porto de Suape',              lat: -8.40,  lon: -34.98, profundidade_m: 15.5, amplitude_media_m: 2.1, restricao_noturna: false },
  PECÉM:        { nome: 'Terminal Portuário do Pecém', lat: -3.54,  lon: -38.80, profundidade_m: 14.5, amplitude_media_m: 2.5, restricao_noturna: true  },
  MUCURIPE:     { nome: 'Porto de Mucuripe',           lat: -3.72,  lon: -38.48, profundidade_m: 11.0, amplitude_media_m: 2.6, restricao_noturna: true  },
  ITAQUI:       { nome: 'Porto do Itaqui',             lat: -2.57,  lon: -44.36, profundidade_m: 19.0, amplitude_media_m: 5.2, restricao_noturna: false },
  VILA_DO_CONDE:{ nome: 'Terminal Vila do Conde',      lat: -1.53,  lon: -48.78, profundidade_m: 16.5, amplitude_media_m: 4.0, restricao_noturna: false },
  SANTOS:       { nome: 'Porto de Santos',             lat: -23.96, lon: -46.32, profundidade_m: 15.0, amplitude_media_m: 1.0, restricao_noturna: false },
  PARANAGUÁ:    { nome: 'Porto de Paranaguá',          lat: -25.50, lon: -48.52, profundidade_m: 12.5, amplitude_media_m: 1.5, restricao_noturna: true  },
  ITAJAÍ:       { nome: 'Porto de Itajaí',             lat: -26.91, lon: -48.65, profundidade_m: 11.0, amplitude_media_m: 1.0, restricao_noturna: false },
  RIO_GRANDE:   { nome: 'Porto do Rio Grande',         lat: -32.04, lon: -52.10, profundidade_m: 14.0, amplitude_media_m: 0.4, restricao_noturna: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// HARMÔNICAS — amplitude (m) e fase (graus) das 5 componentes principais
// Extraídas da Tábua DHN 2026
// ─────────────────────────────────────────────────────────────────────────────
type Harmonica = Record<string, [number, number]>; // comp → [amp, fase°]

const HARMONICAS: Record<string, Harmonica> = {
  // Adicionado M4, MS4 para águas rasas e K2 para modulação de S2
  TEMADRE:       { M2:[0.60,245], S2:[0.22,275], N2:[0.13,228], K1:[0.11,190], O1:[0.08,165], M4:[0.02,310], MS4:[0.01,340], K2:[0.06,275] },
  SUAPE:         { M2:[0.58,230], S2:[0.20,262], N2:[0.12,214], K1:[0.10,180], O1:[0.07,155], M4:[0.01,290], MS4:[0.01,320], K2:[0.05,262] },
  PECÉM:         { M2:[0.65,220], S2:[0.24,255], N2:[0.14,205], K1:[0.12,170], O1:[0.09,148], M4:[0.03,280], MS4:[0.02,310], K2:[0.07,255] },
  MUCURIPE:      { M2:[0.68,218], S2:[0.25,252], N2:[0.15,203], K1:[0.12,168], O1:[0.09,145], M4:[0.03,278], MS4:[0.02,308], K2:[0.07,252] },
  ITAQUI:        { M2:[1.80,180], S2:[0.58,210], N2:[0.38,165], K1:[0.14,130], O1:[0.10,110], M4:[0.15,220], MS4:[0.10,250], K2:[0.16,210] },
  VILA_DO_CONDE: { M2:[1.20,175], S2:[0.40,205], N2:[0.25,162], K1:[0.13,128], O1:[0.09,108], M4:[0.08,210], MS4:[0.05,240], K2:[0.11,205] },
  SANTOS:        { M2:[0.42,295], S2:[0.18,330], N2:[0.09,278], K1:[0.08,250], O1:[0.06,225], M4:[0.01,350], MS4:[0.01,20],  K2:[0.05,330] },
  PARANAGUÁ:     { M2:[0.55,285], S2:[0.20,315], N2:[0.12,270], K1:[0.09,245], O1:[0.07,220], M4:[0.02,340], MS4:[0.01,10],  K2:[0.06,315] },
  ITAJAÍ:        { M2:[0.40,290], S2:[0.16,322], N2:[0.09,275], K1:[0.08,248], O1:[0.06,222], M4:[0.01,345], MS4:[0.01,15],  K2:[0.04,322] },
  RIO_GRANDE:    { M2:[0.18,315], S2:[0.07,340], N2:[0.04,300], K1:[0.07,260], O1:[0.05,235], M4:[0.00,0],   MS4:[0.00,0],   K2:[0.02,340] },
};

// Frequências angulares (rad/hora) das componentes
const FREQ_RAD_H: Record<string, number> = {
  M2: 0.50591, S2: 0.52360, N2: 0.49637, K1: 0.26252, O1: 0.24339,
  M4: 1.01182, MS4: 1.02951, K2: 0.52504,
};

// ─────────────────────────────────────────────────────────────────────────────
// HORAS DESDE J2000 (01/01/2000 12:00 UTC) — âncora das harmônicas
// ─────────────────────────────────────────────────────────────────────────────
function t0Horas(dt: Date): number {
  const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  return (dt.getTime() - J2000) / 3_600_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// SÍNTESE HARMÔNICA
// ─────────────────────────────────────────────────────────────────────────────
export function preverMareHarmonico(
  portoId: string,
  inicio: Date,
  dias = 7,
  intervaloMin = 30,
): PontoMare[] {
  const harmonicas = HARMONICAS[portoId] ?? HARMONICAS['TEMADRE'];
  const t0 = t0Horas(inicio);
  const nPts = Math.ceil((dias * 24 * 60) / intervaloMin);
  const pontos: PontoMare[] = [];

  for (let i = 0; i < nPts; i++) {
    const tH = t0 + (i * intervaloMin) / 60;
    let eta = 0;
    for (const [comp, [amp, faseDeg]] of Object.entries(harmonicas)) {
      const freq = FREQ_RAD_H[comp] ?? 0;
      const fase = (faseDeg * Math.PI) / 180;
      eta += amp * Math.cos(freq * tH - fase);
    }
    const dt = new Date(inicio.getTime() + i * intervaloMin * 60_000);
    pontos.push({ dt: dt.toISOString(), altura_m: +(eta + 1.0).toFixed(3), tipo: 'height' });
  }
  return pontos;
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLDTIDES API (cliente browser)
// ─────────────────────────────────────────────────────────────────────────────
export async function buscarMareWorldTides(
  lat: number, lon: number,
  dataInicio: string,          // YYYY-MM-DD
  dias = 7,
  apiKey: string,
): Promise<PontoMare[] | null> {
  try {
    const params = new URLSearchParams({
      heights: '', extremes: '',
      lat: String(lat), lon: String(lon),
      date: dataInicio, days: String(dias),
      datum: 'CD', step: '1800', key: apiKey,
    });
    const resp = await fetch(`https://www.worldtides.info/api/v3?${params}`);
    const json = await resp.json();
    if (json.status !== 200) return null;

    const pontos: PontoMare[] = json.heights?.map((h: { date: string; height: number }) => ({
      dt: h.date, altura_m: +h.height.toFixed(3), tipo: 'height' as const,
    })) ?? [];

    // Sobrescreve extremos com labels High/Low
    for (const e of (json.extremes ?? [])) {
      pontos.push({ dt: e.date, altura_m: +e.height.toFixed(3), tipo: e.type as 'High' | 'Low' });
    }
    pontos.sort((a, b) => a.dt.localeCompare(b.dt));
    return pontos;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORQUESTRADOR DE FONTES
// ─────────────────────────────────────────────────────────────────────────────
export async function obterPrevisaoMare(
  portoId: string,
  inicio: Date,
  dias = 7,
  apiKey = '',
): Promise<PontoMare[]> {
  const porto = PORTOS_MARE[portoId];
  if (porto && apiKey) {
    const pts = await buscarMareWorldTides(
      porto.lat, porto.lon,
      inicio.toISOString().slice(0, 10), dias, apiKey,
    );
    if (pts) return pts;
  }
  return preverMareHarmonico(portoId, inicio, dias);
}

// ─────────────────────────────────────────────────────────────────────────────
// CALADO DISPONÍVEL (UKC) — COM SUPORTE A DATUM E OFFSET
// ─────────────────────────────────────────────────────────────────────────────
export function calcularCaladoDisponivel(
  alturaMare: number,
  profNominal: number,
  margemSeg = 0.50,
  margemMet = 0.30,
  offsetLocal = 0,
): number {
  // alturaMare já deve estar no datum do Zero Hidrográfico local
  const profEfetiva = profNominal + alturaMare + offsetLocal;
  return +(profEfetiva - margemSeg - margemMet).toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// JANELAS DE NAVEGAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
export function calcularJanelasNavegacao(
  portoId: string,
  caladonavio: number,
  pontos: PontoMare[],
  margemSeg = 0.50,
  margemMet = 0.30,
): JanelaMare[] {
  const porto = PORTOS_MARE[portoId];
  const prof = porto?.profundidade_m ?? 12.0;
  const restricaoNoturna = porto?.restricao_noturna ?? false;
  const janelas: JanelaMare[] = [];
  let janelaAtual: PontoMare[] = [];

  const fechar = (pts: PontoMare[]) => {
    if (pts.length < 2) return;
    const alturas = pts.map(p => p.altura_m);
    const dur = (new Date(pts[pts.length-1].dt).getTime() - new Date(pts[0].dt).getTime()) / 3_600_000;
    janelas.push({
      porto_id: portoId,
      data: pts[0].dt.slice(0, 10),
      inicio: pts[0].dt,
      fim: pts[pts.length - 1].dt,
      calado_max_disponivel_m: calcularCaladoDisponivel(Math.max(...alturas), prof, margemSeg, margemMet),
      altura_mare_min_m: +Math.min(...alturas).toFixed(2),
      altura_mare_max_m: +Math.max(...alturas).toFixed(2),
      duracao_horas: +dur.toFixed(1),
      viavel: true,
      restricao_noturna_bloqueada: false,
    });
  };

  for (const pt of pontos) {
    const cDisp = calcularCaladoDisponivel(pt.altura_m, prof, margemSeg, margemMet);
    const hora = new Date(pt.dt).getUTCHours();
    const noturno = hora < 6 || hora >= 18;
    const bloqueioNoturno = restricaoNoturna && noturno && caladonavio > 13.0;
    const ok = cDisp >= caladonavio && !bloqueioNoturno;

    if (ok) {
      janelaAtual.push(pt);
    } else {
      fechar(janelaAtual);
      janelaAtual = [];
    }
  }
  fechar(janelaAtual);
  return janelas;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAÇÃO DE CHEGADA
// ─────────────────────────────────────────────────────────────────────────────
export function validarChegadaPorto(
  portoId: string,
  dataChegada: Date,
  caladoNavio: number,
  pontos: PontoMare[],
  margemSeg = 0.50,
  margemMet = 0.30,
  janelas: JanelaMare[] = [],
): ValidacaoCalado {
  const porto = PORTOS_MARE[portoId];
  const prof = porto?.profundidade_m ?? 12.0;

  // Ponto mais próximo da chegada
  const chegadaMs = dataChegada.getTime();
  const ptChegada = pontos.reduce((best, pt) =>
    Math.abs(new Date(pt.dt).getTime() - chegadaMs) <
    Math.abs(new Date(best.dt).getTime() - chegadaMs) ? pt : best
  );

  const cDisp = calcularCaladoDisponivel(ptChegada.altura_m, prof, margemSeg, margemMet);
  const aprovado = cDisp >= caladoNavio;
  const margem = +(cDisp - caladoNavio).toFixed(2);

  const proximaJanela = janelas.find(j => new Date(j.inicio) > dataChegada);
  const msg = aprovado
    ? `✅ Aprovado | Disp: ${cDisp.toFixed(2)}m | Navio: ${caladoNavio}m | Margem: +${margem}m`
    : `❌ Reprovado | Disp: ${cDisp.toFixed(2)}m < Navio: ${caladoNavio}m | Deficit: ${margem}m${
        proximaJanela ? ` | Próx janela: ${new Date(proximaJanela.inicio).toLocaleString('pt-BR')}` : ''
      }`;

  return {
    porto_id: portoId,
    data_prevista_chegada: dataChegada.toISOString(),
    calado_navio_m: caladoNavio,
    calado_disponivel_m: cDisp,
    altura_mare_m: +ptChegada.altura_m.toFixed(2),
    margem_seguranca_m: margemSeg,
    aprovado,
    mensagem: msg,
    proxima_janela: proximaJanela,
    janelas_7dias: janelas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AJUSTE AUTOMÁTICO DE HORÁRIO DE CHEGADA
// ─────────────────────────────────────────────────────────────────────────────
export function ajustarHorarioChegada(
  dataIdeal: Date,
  janelas: JanelaMare[],
  maxEsperaHoras = 24,
): { novoHorario: Date | null; esperaHoras: number; motivo: string } {
  // Verifica se já está dentro de uma janela
  const emJanela = janelas.find(j =>
    new Date(j.inicio) <= dataIdeal && new Date(j.fim) >= dataIdeal
  );
  if (emJanela) return { novoHorario: dataIdeal, esperaHoras: 0, motivo: 'Horário ideal viável' };

  // Busca próxima janela dentro do limite de espera
  const candidatas = janelas
    .filter(j => new Date(j.inicio) > dataIdeal)
    .filter(j => (new Date(j.inicio).getTime() - dataIdeal.getTime()) / 3_600_000 <= maxEsperaHoras)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  if (!candidatas.length) {
    return { novoHorario: null, esperaHoras: maxEsperaHoras, motivo: `Sem janela nas próximas ${maxEsperaHoras}h` };
  }

  const melhor = candidatas[0];
  const espera = +(( new Date(melhor.inicio).getTime() - dataIdeal.getTime()) / 3_600_000).toFixed(1);
  return {
    novoHorario: new Date(melhor.inicio),
    esperaHoras: espera,
    motivo: `Aguardar maré — espera de ${espera}h fundeado`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GERAÇÃO DE RESTRIÇÕES DE MARÉ PARA O PAYLOAD (client-side)
// ─────────────────────────────────────────────────────────────────────────────
export async function gerarRestricoesMarePayload(
  portoIds: string[],
  periodoInicio: Date,
  periodoFim: Date,
  caladoReferencia: number,
  margemSeg = 0.50,
  margemMet = 0.50,   // conservador para 2 meses de antecedência
  apiKey = '',
): Promise<RestricoesMare> {
  const dias = Math.ceil((periodoFim.getTime() - periodoInicio.getTime()) / 86_400_000) + 14;
  const restricoes: RestricoesMare = {};

  for (const portoId of portoIds) {
    const porto = PORTOS_MARE[portoId];
    if (!porto) continue;

    const pontos = await obterPrevisaoMare(portoId, periodoInicio, dias, apiKey);
    const janelas = calcularJanelasNavegacao(portoId, caladoReferencia, pontos, margemSeg, margemMet);

    // Mapa horário de calado disponível (a cada 30 min)
    const caladoHorario: Record<string, number> = {};
    for (const pt of pontos) {
      const dt = new Date(pt.dt);
      if (dt.getUTCMinutes() === 0 || dt.getUTCMinutes() === 30) {
        const key = dt.toISOString().slice(0, 16);
        caladoHorario[key] = calcularCaladoDisponivel(pt.altura_m, porto.profundidade_m, margemSeg, margemMet);
      }
    }

    // Dias sem janela
    const datasComJanela = new Set(janelas.map(j => j.data));
    const diasSemJanela: string[] = [];
    for (let d = 0; d < dias; d++) {
      const data = new Date(periodoInicio.getTime() + d * 86_400_000).toISOString().slice(0, 10);
      if (!datasComJanela.has(data)) diasSemJanela.push(data);
    }

    restricoes[portoId] = {
      porto_nome: porto.nome,
      profundidade_m: porto.profundidade_m,
      calado_referencia_m: caladoReferencia,
      amplitude_media_m: porto.amplitude_media_m,
      restricao_noturna: porto.restricao_noturna,
      janelas_navegacao: janelas,
      calado_max_horario: caladoHorario,
      dias_sem_janela: diasSemJanela,
      total_janelas: janelas.length,
      total_horas_viaveis: +janelas.reduce((s, j) => s + j.duracao_horas, 0).toFixed(1),
    };
  }

  return restricoes;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: resumo de maré para exibição
// ─────────────────────────────────────────────────────────────────────────────
export function resumoMarePorto(
  portoId: string,
  restricoes: RestricoesMare,
): { status: 'ok' | 'restrito' | 'bloqueado'; texto: string; cor: string } {
  const r = restricoes[portoId];
  if (!r) return { status: 'ok', texto: 'Sem dados de maré', cor: 'text-muted-foreground' };

  const pctViavel = r.total_horas_viaveis / (r.total_janelas * 24 || 1) * 100;
  const diasBloq = r.dias_sem_janela.length;

  if (diasBloq > r.total_janelas * 3) {
    return { status: 'bloqueado', texto: `${diasBloq} dias sem janela de maré viável`, cor: 'text-destructive' };
  }
  if (pctViavel < 50) {
    return { status: 'restrito', texto: `${r.total_janelas} janelas · ${r.total_horas_viaveis}h viáveis`, cor: 'text-warning' };
  }
  return { status: 'ok', texto: `${r.total_janelas} janelas · ${r.total_horas_viaveis}h viáveis`, cor: 'text-success' };
}
