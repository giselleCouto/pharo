import {
  ConfiguracaoOtimizacao,
  CenarioOtimizacao,
  Viagem,
  ParadaViagem,
  DetalhesCustoViagem,
  MetricasCenario,
  TipoCenario,
  ResultadoOtimizacao,
  MatrizDistancia,
  ProdutoEntrega,
  Demanda,
} from './types';
import {
  ordenarDemandasEstrategicas,
  otimizarSequenciaPortos,
  respeitaJanelaRessuprimento,
  prioridadeFaixaTemporal,
} from './optimizer/ordering';
import {
  calcularCustoBunker,
  calcularCustoNavio,
  calcularDemurrageSpot,
  calcularCustoReefer,
} from './optimizer/costs';
import {
  navioElegivelParaPorto,
  produtosCompativeis,
  resolverCaladoPlanejamento,
} from './optimizer/constraints';
import {
  unidadeNavio,
  unidadeDemanda,
  capacidadeNavio,
  quantidadeDemanda,
  unidadeCompativel,
  pesoDemanda,
  teuReeferDemanda,
  fracionarDemanda,
} from './optimizer/cargo';

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════

/** Adiciona dias a uma string de data (aceita YYYY-MM-DD ou YYYY-MM-DDTHH:mm) */
function addDias(dateStr: string, dias: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Math.round(dias));
  return d.toISOString().slice(0, 10);
}

/** Adiciona horas a um datetime ISO */
function addHoras(dateStr: string, horas: number): string {
  const d = new Date(dateStr.length === 10 ? dateStr + 'T08:00' : dateStr);
  d.setTime(d.getTime() + horas * 3600000);
  // retorna YYYY-MM-DDTHH:mm
  return d.toISOString().slice(0, 16);
}

/** Calcula horas de trânsito a partir de dias (arredonda para múltiplo de 0.5h) */
function diasParaHoras(dias: number): number {
  return Math.round(dias * 24 * 2) / 2;
}

function obterDistancia(
  origem: string,
  destino: string,
  matriz: MatrizDistancia[]
): { distancia_nm: number; dias_transito: number } {
  if (origem === destino) return { distancia_nm: 0, dias_transito: 0 };
  const rota = matriz.find(
    (m) => m.porto_origem_id === origem && m.porto_destino_id === destino
  );
  if (rota) return { distancia_nm: rota.distancia_nm, dias_transito: rota.dias_transito };
  // Tenta inverso
  const rotaInv = matriz.find(
    (m) => m.porto_origem_id === destino && m.porto_destino_id === origem
  );
  if (rotaInv) return { distancia_nm: rotaInv.distancia_nm, dias_transito: rotaInv.dias_transito };
  return { distancia_nm: 500, dias_transito: 2 };
}

/** Retorna o limite de portos (0 = sem limite → usa 999) */
function limitePortos(max: number, cenarioMax: number): number {
  const raw = cenarioMax === 0 ? 999 : cenarioMax;
  return max === 0 ? raw : Math.min(max, raw);
}

// ═══════════════════════════════════════════════════════════════
// MOTOR DE OTIMIZAÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════

export function executarOtimizacao(
  config: ConfiguracaoOtimizacao,
  tipo: TipoCenario,
  onProgress?: (pct: number, msg: string) => void
): CenarioOtimizacao {
  const inicio = Date.now();

  const labels: Record<TipoCenario, { label: string; descricao: string }> = {
    OTIMISTA: {
      label: 'Cenário Otimista',
      descricao: 'Maximiza demanda atendida, prioriza múltiplos portos por viagem',
    },
    BASE: {
      label: 'Cenário Base',
      descricao: 'Equilíbrio entre custo e cobertura de demanda',
    },
    CONSERVADOR: {
      label: 'Cenário Conservador',
      descricao: 'Minimiza riscos, prioriza viagens curtas e navios menores',
    },
    CUSTO_MINIMO: {
      label: 'Otimizador de Custo',
      descricao: 'Foco total em minimização de custo total operacional',
    },
  };

  try {
    onProgress?.(10, 'Inicializando motor de otimização...');

    const { portos, matriz_distancias, navios, demandas, premissas, previsoes_mare } = config;
    const naviosAtivos = navios.filter((n) => n.ativo);
    const naviosTC = naviosAtivos.filter((n) => n.tipo === 'TC');
    const naviosSPOT = naviosAtivos.filter((n) => n.tipo === 'SPOT');

    // Parâmetros por cenário (maxPortos=0 → sem limite)
    const configMaxPortosPremissa = premissas.max_portos_por_viagem || 0;

    const params: Record<
      TipoCenario,
      { ocMin: number; ocMax: number; maxPortosCenario: number; prioridadeTC: boolean }
    > = {
      OTIMISTA: { ocMin: 50, ocMax: 100, maxPortosCenario: 0, prioridadeTC: true },
      BASE: { ocMin: premissas.ocupacao_minima_pct, ocMax: premissas.ocupacao_maxima_pct, maxPortosCenario: configMaxPortosPremissa, prioridadeTC: true },
      CONSERVADOR: { ocMin: 70, ocMax: 95, maxPortosCenario: 3, prioridadeTC: false },
      CUSTO_MINIMO: { ocMin: 80, ocMax: 100, maxPortosCenario: 0, prioridadeTC: true },
    };

    const p = params[tipo];
    const maxPortosEfetivo = limitePortos(configMaxPortosPremissa, p.maxPortosCenario);

    onProgress?.(25, 'Analisando demandas e portos...');

    const demandasOrdenadas = ordenarDemandasEstrategicas(demandas).sort((a, b) => {
      const faixaA = prioridadeFaixaTemporal(a, premissas.inicio_periodo, premissas);
      const faixaB = prioridadeFaixaTemporal(b, premissas.inicio_periodo, premissas);
      return faixaA - faixaB;
    });
    const ultimaEntregaPorto: Record<string, string> = {};

    onProgress?.(40, 'Construindo plano de viagens...');

    const viagens: Viagem[] = [];
    const demandasAtendidas = new Set<string>();
    let idViagem = 1;

    const filaNavio = p.prioridadeTC
      ? [...naviosTC, ...naviosSPOT]
      : [...naviosSPOT, ...naviosTC];

    const disponibilidadeNavios: Record<string, string> = {};
    for (const nav of naviosAtivos) {
      disponibilidadeNavios[nav.id] = premissas.inicio_periodo;
    }

    let demandasRestantes = demandasOrdenadas.filter((d) => !demandasAtendidas.has(d.id));

    let iteracoes = 0;
    const MAX_ITER = 200;

    while (demandasRestantes.length > 0 && iteracoes < MAX_ITER) {
      iteracoes++;

      // Seleciona navio disponível com menor data de disponibilidade
      const navioDisp = filaNavio
        .filter((nav) => disponibilidadeNavios[nav.id] <= premissas.fim_periodo)
        .sort((a, b) =>
          disponibilidadeNavios[a.id].localeCompare(disponibilidadeNavios[b.id])
        )[0];

      if (!navioDisp) break;

      const dataAtual = disponibilidadeNavios[navioDisp.id];
      if (dataAtual > premissas.fim_periodo) break;

      const unidade = unidadeNavio(navioDisp);
      const capNavio = capacidadeNavio(navioDisp);
      const portosViagemRaw: string[] = [];
      const demandasViagem: Demanda[] = [];
      let volumeAcumulado = 0;       // na unidade do navio (CBM ou TEU)
      let pesoAcumulado = 0;          // toneladas
      let teuReeferAcumulado = 0;     // TEU refrigerados
      const capMax = capNavio * (p.ocMax / 100);
      const capPeso = navioDisp.capacidade_peso_t ?? Infinity;
      const slotsReefer = navioDisp.slots_reefer ?? Infinity;

      const cabeNaCarga = (dem: Demanda, qtde: number): boolean => {
        const fr = qtde / Math.max(quantidadeDemanda(dem), 1e-9);
        const pesoExtra = pesoDemanda(dem) * fr;
        const reeferExtra = teuReeferDemanda(dem) * fr;
        if (pesoAcumulado + pesoExtra > capPeso + 1e-6) return false;
        if (teuReeferAcumulado + reeferExtra > slotsReefer + 1e-6) return false;
        return true;
      };

      const registrar = (dem: Demanda, qtde: number) => {
        const fr = qtde / Math.max(quantidadeDemanda(dem), 1e-9);
        const fracionada = fracionarDemanda(dem, qtde);
        demandasViagem.push(fracionada);
        volumeAcumulado += qtde;
        pesoAcumulado += pesoDemanda(dem) * fr;
        teuReeferAcumulado += teuReeferDemanda(dem) * fr;
      };

      for (const dem of demandasRestantes) {
        if (demandasAtendidas.has(dem.id)) continue;
        // Unidade de carga precisa casar (navio TEU ↔ demanda TEU)
        if (!unidadeCompativel(navioDisp, dem)) continue;
        const portoInfo = portos.find((pt) => pt.id === dem.porto_destino_id);
        if (!portoInfo) continue;

        const refMare = `${dem.data_necessidade}T12:00`;
        if (
          !navioElegivelParaPorto(navioDisp, portoInfo, refMare, premissas, previsoes_mare)
        ) {
          continue;
        }

        if (!respeitaJanelaRessuprimento(dem, dataAtual, ultimaEntregaPorto[dem.porto_destino_id])) {
          continue;
        }

        const candidatas = portosViagemRaw.includes(dem.porto_destino_id)
          ? demandasViagem
          : [...demandasViagem, dem];
        if (!produtosCompativeis(candidatas)) continue;

        const qtdeDemanda = quantidadeDemanda(dem);

        if (portosViagemRaw.includes(dem.porto_destino_id)) {
          const qtdePossivel = Math.min(qtdeDemanda, capMax - volumeAcumulado);
          if (qtdePossivel > 0 && cabeNaCarga(dem, qtdePossivel)) {
            registrar(dem, qtdePossivel);
          }
          continue;
        }

        if (portosViagemRaw.length >= maxPortosEfetivo) break;

        const qtdePossivel = Math.min(qtdeDemanda, capMax - volumeAcumulado);
        if (qtdePossivel <= 0) break;
        if (!cabeNaCarga(dem, qtdePossivel)) continue;

        portosViagemRaw.push(dem.porto_destino_id);
        registrar(dem, qtdePossivel);
      }

      const portosViagem = otimizarSequenciaPortos(
        portosViagemRaw,
        premissas.porto_origem_id,
        matriz_distancias
      );

      if (portosViagem.length === 0) {
        disponibilidadeNavios[navioDisp.id] = addDias(dataAtual, 3);
        demandasRestantes = demandasOrdenadas.filter((d) => !demandasAtendidas.has(d.id));
        continue;
      }

      // Verifica ocupação mínima (na unidade do navio)
      const ocupacaoPct = capNavio > 0 ? (volumeAcumulado / capNavio) * 100 : 0;
      if (ocupacaoPct < p.ocMin && tipo !== 'OTIMISTA') {
        disponibilidadeNavios[navioDisp.id] = addDias(dataAtual, 1);
        demandasRestantes = demandasOrdenadas.filter((d) => !demandasAtendidas.has(d.id));
        continue;
      }

      // Constrói paradas com datas/horas detalhadas
      const paradas: ParadaViagem[] = [];
      // Hora de partida padrão: 08:00
      let datetimeAtual = dataAtual + 'T08:00';
      let distTotal = 0;
      let custoPortuarioTotal = 0;
      let custoBunkerTotal = 0;
      let custoDemurrageTotal = 0;
      const vel = navioDisp.velocidade_referencia;
      let portoAnterior = premissas.porto_origem_id;

      for (let i = 0; i < portosViagem.length; i++) {
        const portoId = portosViagem[i];
        const portoInfo = portos.find((pt) => pt.id === portoId)!;
        const rota = obterDistancia(portoAnterior, portoId, matriz_distancias);

        distTotal += rota.distancia_nm;
        const horasTransito = diasParaHoras(rota.dias_transito);
        const dataChegada = addHoras(datetimeAtual, horasTransito);

        const caladoNaChegada = resolverCaladoPlanejamento(
          portoInfo,
          navioDisp.calado_carregado_metros,
          dataChegada,
          premissas,
          previsoes_mare
        );

        const demandasPorto = demandasViagem.filter(
          (d) => d.porto_destino_id === portoId
        );
        // demandasPorto já estão fracionadas (volume/teu/peso escalados)
        const volPortoCbm = demandasPorto.reduce((s, d) => s + d.volume_cbm, 0);
        const volPortoTeu = unidade === 'TEU'
          ? demandasPorto.reduce((s, d) => s + quantidadeDemanda(d), 0)
          : 0;
        const pesoPorto = demandasPorto.reduce((s, d) => s + pesoDemanda(d), 0);
        const teuReeferPorto = demandasPorto.reduce((s, d) => s + teuReeferDemanda(d), 0);

        // Produtos detalhados (já escalados pelo fracionamento)
        const produtosDetalhados: ProdutoEntrega[] = [];
        const nomeProdutos: string[] = [];
        for (const dem of demandasPorto) {
          if (dem.produtos && dem.produtos.length > 0) {
            for (const prod of dem.produtos) {
              produtosDetalhados.push({ ...prod });
              if (!nomeProdutos.includes(prod.nome)) nomeProdutos.push(prod.nome);
            }
          } else {
            // fallback: produto legado
            if (!nomeProdutos.includes(dem.produto)) nomeProdutos.push(dem.produto);
          }
        }

        const diasOp = portoInfo.dias_operacao;
        const horasOp = diasOp * 24;
        const dataSaida = addHoras(dataChegada, horasOp);

        const perfil = navioDisp.perfil_consumo;
        custoBunkerTotal += calcularCustoBunker(
          rota.dias_transito,
          perfil.consumo_carregado_mt_dia,
          premissas.bunker_preco_usd_mt,
          vel,
          'transito'
        );
        custoBunkerTotal += calcularCustoBunker(
          diasOp,
          perfil.consumo_descarga_mt_dia,
          premissas.bunker_preco_usd_mt,
          vel,
          'descarga'
        );
        custoDemurrageTotal += calcularDemurrageSpot(navioDisp, diasOp);
        custoPortuarioTotal += portoInfo.despesas_portuarias_usd;

        paradas.push({
          porto_id: portoId,
          porto_nome: portoInfo.nome,
          ordem: i + 1,
          volume_entregue_cbm: volPortoCbm,
          produtos: nomeProdutos,
          produtos_detalhados: produtosDetalhados,
          dias_operacao: diasOp,
          data_chegada: dataChegada,
          data_saida: dataSaida,
          despesas_portuarias_usd: portoInfo.despesas_portuarias_usd,
          calado_limite_efetivo_m: caladoNaChegada.calado_efetivo_m,
          restricao_mare_aplicada: caladoNaChegada.fonte === 'mare' || caladoNaChegada.fonte === 'aproximada',
          fonte_calado: caladoNaChegada.fonte,
          volume_entregue_teu: unidade === 'TEU' ? volPortoTeu : undefined,
          peso_entregue_t: pesoPorto > 0 ? +pesoPorto.toFixed(2) : undefined,
          teu_reefer: teuReeferPorto > 0 ? +teuReeferPorto.toFixed(2) : undefined,
        });

        ultimaEntregaPorto[portoId] = dataSaida.slice(0, 10);

        datetimeAtual = dataSaida;
        portoAnterior = portoId;
      }

      // Retorno ao porto base
      const rotaRetorno = obterDistancia(
        portoAnterior, premissas.porto_origem_id, matriz_distancias
      );
      distTotal += rotaRetorno.distancia_nm;
      const horasRetorno = diasParaHoras(rotaRetorno.dias_transito);
      const dataRetorno = addHoras(datetimeAtual, horasRetorno);

      custoBunkerTotal += calcularCustoBunker(
        rotaRetorno.dias_transito,
        navioDisp.perfil_consumo.consumo_vazio_mt_dia,
        premissas.bunker_preco_usd_mt,
        vel,
        'vazio'
      );

      const caladoIncompativel = paradas.some(
        (pa) =>
          pa.calado_limite_efetivo_m != null &&
          navioDisp.calado_carregado_metros > pa.calado_limite_efetivo_m
      );
      if (caladoIncompativel) {
        disponibilidadeNavios[navioDisp.id] = addDias(dataAtual, 1);
        demandasRestantes = demandasOrdenadas.filter((d) => !demandasAtendidas.has(d.id));
        continue;
      }

      const tsPartida = new Date(dataAtual + 'T08:00').getTime();
      const tsRetorno = new Date(dataRetorno).getTime();
      const duracaoDias = Math.max(
        1, Math.round((tsRetorno - tsPartida) / (1000 * 60 * 60 * 24))
      );

      const custoTCDiario = calcularCustoNavio(navioDisp, duracaoDias);
      const custoReeferTotal = calcularCustoReefer(
        teuReeferAcumulado,
        duracaoDias,
        premissas.custo_energia_reefer_usd_dia_teu ?? 0,
        navioDisp.consumo_reefer_mt_dia_por_teu ?? 0,
        premissas.bunker_preco_usd_mt
      );
      const custoTotal =
        custoTCDiario + custoBunkerTotal + custoPortuarioTotal + custoDemurrageTotal + custoReeferTotal;
      const custoPorUnidade = volumeAcumulado > 0 ? custoTotal / volumeAcumulado : 0;
      const volTotalCbm = demandasViagem.reduce((s, d) => s + d.volume_cbm, 0);

      const custos: DetalhesCustoViagem = {
        custo_tc_diario_usd: custoTCDiario,
        custo_bunker_usd: custoBunkerTotal,
        custo_demurrage_usd: custoDemurrageTotal,
        despesas_portuarias_usd: custoPortuarioTotal,
        custo_total_usd: custoTotal,
        custo_total_brl: custoTotal * premissas.taxa_cambio_usd_brl,
        custo_por_cbm_usd: custoPorUnidade,
        custo_reefer_usd: custoReeferTotal > 0 ? custoReeferTotal : undefined,
        custo_por_unidade_usd: custoPorUnidade,
      };

      const viagem: Viagem = {
        id: `V${String(idViagem).padStart(3, '0')}`,
        navio_id: navioDisp.id,
        navio_nome: navioDisp.nome,
        tipo_navio: navioDisp.tipo,
        data_partida: dataAtual + 'T08:00',
        data_retorno: dataRetorno,
        duracao_dias: duracaoDias,
        paradas,
        volume_total_cbm: unidade === 'TEU' ? volTotalCbm : volumeAcumulado,
        capacidade_navio_cbm: navioDisp.capacidade_cbm,
        ocupacao_pct: ocupacaoPct,
        distancia_total_nm: distTotal,
        custos,
        unidade_carga: unidade,
        volume_total_teu: unidade === 'TEU' ? volumeAcumulado : undefined,
        capacidade_navio_teu: unidade === 'TEU' ? capNavio : undefined,
        peso_total_t: pesoAcumulado > 0 ? +pesoAcumulado.toFixed(2) : undefined,
        teu_reefer_total: teuReeferAcumulado > 0 ? +teuReeferAcumulado.toFixed(2) : undefined,
      };

      viagens.push(viagem);
      idViagem++;

      for (const dem of demandasViagem) {
        demandasAtendidas.add(dem.id);
      }

      disponibilidadeNavios[navioDisp.id] = addDias(
        dataRetorno, premissas.intervalo_minimo_dias
      );

      demandasRestantes = demandasOrdenadas.filter((d) => !demandasAtendidas.has(d.id));

      onProgress?.(
        40 + Math.min(50, iteracoes),
        `Planejando viagens... (${viagens.length} viagens geradas)`
      );
    }

    onProgress?.(90, 'Calculando métricas finais...');

    // Demanda e entrega segregadas por unidade (CBM / TEU)
    const demandadoCbm = demandas
      .filter((d) => unidadeDemanda(d) === 'CBM')
      .reduce((s, d) => s + d.volume_cbm, 0);
    const demandadoTeu = demandas
      .filter((d) => unidadeDemanda(d) === 'TEU')
      .reduce((s, d) => s + quantidadeDemanda(d), 0);
    const entregueCbm = viagens
      .filter((v) => (v.unidade_carga ?? 'CBM') === 'CBM')
      .reduce((s, v) => s + v.volume_total_cbm, 0);
    const entregueTeu = viagens
      .filter((v) => v.unidade_carga === 'TEU')
      .reduce((s, v) => s + (v.volume_total_teu ?? 0), 0);

    const unidadePrincipal = demandadoTeu > demandadoCbm ? 'TEU' : 'CBM';
    const reeferTotal = viagens.reduce((s, v) => s + (v.teu_reefer_total ?? 0), 0);

    // % de demanda atendida combinando as unidades presentes
    const pcts: number[] = [];
    if (demandadoCbm > 0) pcts.push((entregueCbm / demandadoCbm) * 100);
    if (demandadoTeu > 0) pcts.push((entregueTeu / demandadoTeu) * 100);
    const demandaAtendidaPct = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;

    const custoTotalUsd = viagens.reduce((s, v) => s + v.custos.custo_total_usd, 0);
    const ocupacaoMedia =
      viagens.length > 0
        ? viagens.reduce((s, v) => s + v.ocupacao_pct, 0) / viagens.length
        : 0;
    const entregueUnidadePrincipal = unidadePrincipal === 'TEU' ? entregueTeu : entregueCbm;

    const metricas: MetricasCenario = {
      total_viagens: viagens.length,
      volume_total_entregue_cbm: entregueCbm,
      volume_total_demandado_cbm: demandadoCbm,
      demanda_atendida_pct: demandaAtendidaPct,
      custo_total_usd: custoTotalUsd,
      custo_total_brl: custoTotalUsd * premissas.taxa_cambio_usd_brl,
      custo_medio_por_cbm_usd:
        entregueUnidadePrincipal > 0 ? custoTotalUsd / entregueUnidadePrincipal : 0,
      ocupacao_media_pct: ocupacaoMedia,
      total_navios_tc_usados: new Set(
        viagens.filter((v) => v.tipo_navio === 'TC').map((v) => v.navio_id)
      ).size,
      total_navios_spot_usados: new Set(
        viagens.filter((v) => v.tipo_navio === 'SPOT').map((v) => v.navio_id)
      ).size,
      tempo_execucao_ms: Date.now() - inicio,
      unidade_carga: unidadePrincipal,
      volume_total_entregue_teu: entregueTeu,
      volume_total_demandado_teu: demandadoTeu,
      teu_reefer_total: reeferTotal > 0 ? +reeferTotal.toFixed(2) : undefined,
    };

    onProgress?.(100, 'Otimização concluída!');

    return {
      tipo,
      ...labels[tipo],
      viagens,
      metricas,
      status: 'CONCLUIDO',
    };
  } catch (err) {
    return {
      tipo,
      label: tipo,
      descricao: '',
      viagens: [],
      metricas: {
        total_viagens: 0,
        volume_total_entregue_cbm: 0,
        volume_total_demandado_cbm: 0,
        demanda_atendida_pct: 0,
        custo_total_usd: 0,
        custo_total_brl: 0,
        custo_medio_por_cbm_usd: 0,
        ocupacao_media_pct: 0,
        total_navios_tc_usados: 0,
        total_navios_spot_usados: 0,
        tempo_execucao_ms: Date.now() - inicio,
      },
      status: 'ERRO',
      erro: String(err),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// ORQUESTRADOR: EXECUTA OS 4 CENÁRIOS
// ═══════════════════════════════════════════════════════════════

export async function executarTodosCenarios(
  config: ConfiguracaoOtimizacao,
  onProgress?: (cenario: TipoCenario, pct: number, msg: string) => void
): Promise<ResultadoOtimizacao> {
  const tipos: TipoCenario[] = ['OTIMISTA', 'BASE', 'CONSERVADOR', 'CUSTO_MINIMO'];
  const cenarios: CenarioOtimizacao[] = [];

  for (const tipo of tipos) {
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    const cenario = executarOtimizacao(config, tipo, (pct, msg) =>
      onProgress?.(tipo, pct, msg)
    );
    cenarios.push(cenario);
  }

  const recomendado = cenarios.reduce((melhor, atual) => {
    if (atual.status !== 'CONCLUIDO') return melhor;
    if (melhor.status !== 'CONCLUIDO') return atual;
    const scoreMelhor =
      melhor.metricas.demanda_atendida_pct / (melhor.metricas.custo_total_usd / 1e6 + 1);
    const scoreAtual =
      atual.metricas.demanda_atendida_pct / (atual.metricas.custo_total_usd / 1e6 + 1);
    return scoreAtual > scoreMelhor ? atual : melhor;
  });

  return {
    id: `OTM-${Date.now()}`,
    timestamp: new Date().toISOString(),
    configuracao: config,
    cenarios,
    cenario_recomendado: recomendado.tipo,
    status_geral: 'CONCLUIDO',
    comparativo: {
      melhor_custo: cenarios.reduce((p, c) => 
        c.metricas.custo_total_usd < p.metricas.custo_total_usd ? c : p
      ).tipo,
      melhor_demanda: cenarios.reduce((p, c) => 
        c.metricas.demanda_atendida_pct > p.metricas.demanda_atendida_pct ? c : p
      ).tipo,
      custo_total_minimo_usd: recomendado.metricas.custo_total_usd,
    }
  };
}

export function gerarJsonSaida(resultado: ResultadoOtimizacao): string {
  const payload = {
    type: 4,
    metaheuristica: 'multi_porto_heuristica_v3.3',
    timestamp: resultado.timestamp,
    id_execucao: resultado.id,
    cenario_recomendado: resultado.cenario_recomendado,
    cenarios: resultado.cenarios.map((c) => ({
      tipo: c.tipo,
      label: c.label,
      status: c.status,
      metricas: c.metricas,
      viagens: c.viagens.map((v) => ({
        id: v.id,
        navio: { id: v.navio_id, nome: v.navio_nome, tipo: v.tipo_navio },
        periodo: { inicio: v.data_partida, fim: v.data_retorno, duracao_dias: v.duracao_dias },
        carga: {
          unidade: v.unidade_carga ?? 'CBM',
          volume_cbm: v.volume_total_cbm,
          capacidade_cbm: v.capacidade_navio_cbm,
          volume_teu: v.volume_total_teu,
          capacidade_teu: v.capacidade_navio_teu,
          peso_total_t: v.peso_total_t,
          teu_reefer: v.teu_reefer_total,
          ocupacao_pct: v.ocupacao_pct,
        },
        rota: {
          distancia_total_nm: v.distancia_total_nm,
          paradas: v.paradas,
        },
        custos: v.custos,
      })),
    })),
  };
  return JSON.stringify(payload, null, 2);
}
