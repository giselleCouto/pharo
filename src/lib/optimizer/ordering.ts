import type { Demanda, MatrizDistancia, Premissas } from '../types';

const PRIORIDADE_ORDEM = { ALTA: 0, MEDIA: 1, BAIXA: 2 } as const;

/** Agrupa por porto destino e ordena por prazo e prioridade dentro do grupo. */
export function ordenarDemandasEstrategicas(demandas: Demanda[]): Demanda[] {
  const porPorto = new Map<string, Demanda[]>();
  for (const d of demandas) {
    const lista = porPorto.get(d.porto_destino_id) ?? [];
    lista.push(d);
    porPorto.set(d.porto_destino_id, lista);
  }

  const portosOrdenados = [...porPorto.keys()].sort();
  const resultado: Demanda[] = [];

  for (const portoId of portosOrdenados) {
    const grupo = porPorto.get(portoId)!;
    grupo.sort((a, b) => {
      const diffData =
        new Date(a.data_necessidade).getTime() - new Date(b.data_necessidade).getTime();
      if (diffData !== 0) return diffData;
      return PRIORIDADE_ORDEM[a.prioridade] - PRIORIDADE_ORDEM[b.prioridade];
    });
    resultado.push(...grupo);
  }

  return resultado;
}

export function diffDias(dataInicio: string, dataFim: string): number {
  const a = new Date(dataInicio.slice(0, 10) + 'T12:00:00Z').getTime();
  const b = new Date(dataFim.slice(0, 10) + 'T12:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/** Valida intervalo mínimo/máximo entre entregas no mesmo porto (ressuprimento). */
export function respeitaJanelaRessuprimento(
  dem: Demanda,
  dataPlanejada: string,
  ultimaEntregaNoPorto?: string
): boolean {
  if (!ultimaEntregaNoPorto) return true;
  const dias = diffDias(ultimaEntregaNoPorto, dataPlanejada);
  const min = dem.janela_min_dias ?? 0;
  const max = dem.janela_max_dias ?? 365;
  return dias >= min && dias <= max;
}

/** Subdivide o período em faixas de ~7 dias para distribuição mensal equilibrada. */
export function indiceFaixaTemporal(dataIso: string, inicioPeriodo: string): number {
  const dias = diffDias(inicioPeriodo, dataIso);
  return Math.max(0, Math.floor(dias / 7));
}

/** Prioriza demandas da faixa temporal corrente (0 = primeira semana do período). */
export function prioridadeFaixaTemporal(
  dem: Demanda,
  dataReferencia: string,
  premissas: Premissas
): number {
  const faixaDem = indiceFaixaTemporal(dem.data_necessidade, premissas.inicio_periodo);
  const faixaRef = indiceFaixaTemporal(dataReferencia, premissas.inicio_periodo);
  return Math.abs(faixaDem - faixaRef);
}

/** Reordena portos da viagem por proximidade (vizinho mais próximo na matriz). */
export function otimizarSequenciaPortos(
  portosIds: string[],
  portoOrigemId: string,
  matriz: MatrizDistancia[]
): string[] {
  if (portosIds.length <= 1) return portosIds;

  const restantes = [...portosIds];
  const rota: string[] = [];
  let atual = portoOrigemId;

  while (restantes.length > 0) {
    restantes.sort((a, b) => {
      const da = distanciaEntre(atual, a, matriz);
      const db = distanciaEntre(atual, b, matriz);
      return da - db;
    });
    const prox = restantes.shift()!;
    rota.push(prox);
    atual = prox;
  }

  return rota;
}

function distanciaEntre(origem: string, destino: string, matriz: MatrizDistancia[]): number {
  if (origem === destino) return 0;
  const rota = matriz.find(
    (m) => m.porto_origem_id === origem && m.porto_destino_id === destino
  );
  if (rota) return rota.distancia_nm;
  const inv = matriz.find(
    (m) => m.porto_origem_id === destino && m.porto_destino_id === origem
  );
  return inv?.distancia_nm ?? 500;
}
