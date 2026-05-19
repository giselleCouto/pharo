import type { Demanda, Navio, Porto, Premissas, PrevisaoMarePorto } from '../types';
import { resolverCaladoMaximoPorto, type CaladoEfetivoPorto } from '../mare';
import { preverMareHarmonico, validarChegadaPorto, calcularJanelasNavegacao } from '../tideEngine';

/** Matriz simplificada: produtos incompatíveis não podem compartilhar a mesma viagem. */
const INCOMPATIVEL: Record<string, string[]> = {
  'Diesel S10': ['Gasolina C', 'GLP'],
  'Gasolina C': ['Diesel S10', 'GLP'],
  GLP: ['Diesel S10', 'Gasolina C'],
};

export function produtosCompativeis(demandas: Demanda[]): boolean {
  const nomes = new Set<string>();
  for (const d of demandas) {
    const lista =
      d.produtos?.length > 0 ? d.produtos.map((p) => p.nome) : d.produto ? [d.produto] : [];
    for (const nome of lista) {
      for (const existente of nomes) {
        if (INCOMPATIVEL[nome]?.includes(existente) || INCOMPATIVEL[existente]?.includes(nome)) {
          return false;
        }
      }
      nomes.add(nome);
    }
  }
  return true;
}

export function resolverCaladoPlanejamento(
  porto: Porto,
  caladoNavioM: number,
  dataRefIso: string,
  premissas: Premissas,
  previsoes?: PrevisaoMarePorto[]
): CaladoEfetivoPorto {
  const margemTotal =
    (premissas.margem_seguranca_mare_m ?? 0.5) + (premissas.margem_meteorologica_m ?? 0.5);

  if (premissas.usar_previsao_mare) {
    const dt = new Date(
      dataRefIso.length === 10 ? dataRefIso + 'T12:00:00Z' : dataRefIso
    );
    const pontos = preverMareHarmonico(porto.id, dt, 3, 30);
    const janelas = calcularJanelasNavegacao(
      porto.id,
      caladoNavioM,
      pontos,
      premissas.margem_seguranca_mare_m ?? 0.5,
      premissas.margem_meteorologica_m ?? 0.5
    );
    const val = validarChegadaPorto(
      porto.id,
      dt,
      caladoNavioM,
      pontos,
      premissas.margem_seguranca_mare_m ?? 0.5,
      premissas.margem_meteorologica_m ?? 0.5,
      janelas
    );
    const caladoHarm = val.calado_disponivel_m;
    const efetivo = Math.max(0, Math.min(porto.calado_max_metros, caladoHarm));
    return {
      calado_efetivo_m: efetivo,
      fonte: 'mare',
      calado_mare_min_na_janela_m: caladoHarm,
    };
  }

  return resolverCaladoMaximoPorto(
    porto.calado_max_metros,
    porto.id,
    dataRefIso,
    previsoes,
    margemTotal
  );
}

export function navioElegivelParaPorto(
  navio: Navio,
  porto: Porto,
  dataRef: string,
  premissas: Premissas,
  previsoes?: PrevisaoMarePorto[]
): boolean {
  const calado = resolverCaladoPlanejamento(
    porto,
    navio.calado_carregado_metros,
    dataRef,
    premissas,
    previsoes
  );
  return navio.calado_carregado_metros <= calado.calado_efetivo_m;
}
