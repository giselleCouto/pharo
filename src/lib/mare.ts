import type { PrevisaoMarePorto } from './types';

const UKC_PADRAO_M = 0.5;

function dataSoDia(iso: string): string {
  const s = iso.trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function parseDia(iso: string): number {
  const d = dataSoDia(iso);
  const t = Date.parse(d + 'T12:00:00Z');
  return Number.isNaN(t) ? NaN : t;
}

export function dataDentroDaJanela(
  dataReferenciaIso: string,
  inicioJanelaIso: string,
  fimJanelaIso: string
): boolean {
  const t = parseDia(dataReferenciaIso);
  const a = parseDia(inicioJanelaIso);
  const b = parseDia(fimJanelaIso);
  if (Number.isNaN(t) || Number.isNaN(a) || Number.isNaN(b)) return false;
  return t >= a && t <= b;
}

function caladoDaPrevisao(p: PrevisaoMarePorto): number | undefined {
  if (p.calado_max_admissivel_m != null && Number.isFinite(p.calado_max_admissivel_m)) {
    return p.calado_max_admissivel_m;
  }
  if (p.profundidade_disponivel_min_m != null && Number.isFinite(p.profundidade_disponivel_min_m)) {
    const ukc = p.ukc_minimo_m != null && Number.isFinite(p.ukc_minimo_m) ? p.ukc_minimo_m : UKC_PADRAO_M;
    return Math.max(0, p.profundidade_disponivel_min_m - ukc);
  }
  return undefined;
}

export type FonteCaladoMare = 'catalogo' | 'mare';

export interface CaladoEfetivoPorto {
  calado_efetivo_m: number;
  fonte: FonteCaladoMare;
  calado_mare_min_na_janela_m?: number;
}

export function resolverCaladoMaximoPorto(
  caladoMaxCatalogo: number,
  portoId: string,
  dataReferenciaIso: string,
  previsoes: PrevisaoMarePorto[] | undefined,
  margemNaoAstronomicaM: number | undefined
): CaladoEfetivoPorto {
  const margem =
    margemNaoAstronomicaM != null && Number.isFinite(margemNaoAstronomicaM)
      ? Math.max(0, margemNaoAstronomicaM)
      : 0;

  if (!previsoes?.length) {
    return {
      calado_efetivo_m: Math.max(0, caladoMaxCatalogo - margem),
      fonte: 'catalogo',
    };
  }

  const candidatos: number[] = [];
  for (const pr of previsoes) {
    if (pr.porto_id !== portoId) continue;
    if (!dataDentroDaJanela(dataReferenciaIso, pr.inicio_janela_iso, pr.fim_janela_iso)) continue;
    const c = caladoDaPrevisao(pr);
    if (c != null) candidatos.push(c);
  }

  if (candidatos.length === 0) {
    return {
      calado_efetivo_m: Math.max(0, caladoMaxCatalogo - margem),
      fonte: 'catalogo',
    };
  }

  const minMare = Math.min(...candidatos);
  const bruto = Math.min(caladoMaxCatalogo, minMare);
  const efetivo = Math.max(0, bruto - margem);

  return {
    calado_efetivo_m: efetivo,
    fonte: 'mare',
    calado_mare_min_na_janela_m: minMare,
  };
}
