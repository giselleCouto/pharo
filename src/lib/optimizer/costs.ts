import type { Navio, VelocidadeNavio } from '../types';

const MULT_VELOCIDADE: Record<
  VelocidadeNavio,
  { carregado: number; vazio: number; descarga: number; transito: number }
> = {
  FULL: { carregado: 1.15, vazio: 1.05, descarga: 1.1, transito: 0.85 },
  ECO: { carregado: 1.0, vazio: 1.0, descarga: 1.0, transito: 1.0 },
  MIN: { carregado: 0.88, vazio: 0.92, descarga: 0.95, transito: 1.2 },
};

export function calcularCustoBunker(
  dias: number,
  consumoMtDia: number,
  precoUsdMt: number,
  velocidade: VelocidadeNavio,
  modo: 'carregado' | 'vazio' | 'descarga' | 'transito'
): number {
  const mult = MULT_VELOCIDADE[velocidade][modo];
  return dias * consumoMtDia * mult * precoUsdMt;
}

export function calcularDemurrageSpot(
  navio: Navio,
  diasOperacao: number
): number {
  if (navio.tipo !== 'SPOT') return 0;
  const laytime = navio.laytime_dias;
  const taxa = navio.demurrage_usd_dia;
  if (laytime == null || taxa == null || taxa <= 0) return 0;
  const excesso = Math.max(0, diasOperacao - laytime);
  return excesso * taxa;
}

/**
 * Custo de energia de contêineres refrigerados (reefer).
 * Combina, quando disponível, o custo elétrico/operacional (USD/TEU/dia)
 * e o bunker extra para geração de energia a bordo.
 */
export function calcularCustoReefer(
  teuReefer: number,
  diasViagem: number,
  custoUsdDiaTeu: number,
  consumoBunkerMtDiaPorTeu: number,
  precoBunkerUsdMt: number
): number {
  if (teuReefer <= 0 || diasViagem <= 0) return 0;
  const custoEnergia = teuReefer * diasViagem * Math.max(0, custoUsdDiaTeu);
  const custoBunkerReefer =
    teuReefer * diasViagem * Math.max(0, consumoBunkerMtDiaPorTeu) * precoBunkerUsdMt;
  return custoEnergia + custoBunkerReefer;
}

export function calcularCustoNavio(
  navio: Navio,
  duracaoDias: number
): number {
  if (navio.tipo === 'TC' && navio.custo_tc_diario_usd) {
    return navio.custo_tc_diario_usd * duracaoDias;
  }
  if (navio.tipo === 'SPOT' && navio.custo_spot_fixo_usd) {
    return navio.custo_spot_fixo_usd;
  }
  return 0;
}
