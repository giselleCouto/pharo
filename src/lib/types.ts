// ═══════════════════════════════════════════════════════════════
// TIPOS DO PHAROS — OTIMIZADOR DE CABOTAGEM
// ═══════════════════════════════════════════════════════════════

// ── Maré e Calado ──────────────────────────────────────────────
export interface PontoMare {
  dt: string;              // ISO-8601
  altura_m: number;
  tipo: 'height' | 'High' | 'Low';
}

/**
 * Origem do calado efetivo resolvido para um porto/data:
 *  - 'catalogo'   : valor de catálogo (calado máximo do porto)
 *  - 'mare'       : maré com harmônicas completas (alta precisão)
 *  - 'aproximada' : maré sintetizada a partir da amplitude média (baixa precisão)
 */
export type FonteCaladoMare = 'catalogo' | 'mare' | 'aproximada';

export interface JanelaMare {
  porto_id: string;
  data: string;            // YYYY-MM-DD
  inicio: string;          // ISO-8601
  fim: string;             // ISO-8601
  calado_max_disponivel_m: number;
  altura_mare_min_m: number;
  altura_mare_max_m: number;
  duracao_horas: number;
  viavel: boolean;
  restricao_noturna_bloqueada: boolean;
}

export interface ValidacaoCalado {
  porto_id: string;
  data_prevista_chegada: string;
  calado_navio_m: number;
  calado_disponivel_m: number;
  altura_mare_m: number;
  margem_seguranca_m: number;
  aprovado: boolean;
  mensagem: string;
  proxima_janela?: JanelaMare;
  janelas_7dias: JanelaMare[];
}

export interface PortoMareConfig {
  porto_id: string;
  profundidade_m: number;
  amplitude_media_m: number;
  restricao_noturna: boolean;
  margem_seguranca_m: number;
  margem_meteorologica_m: number;  // ≥0.5 para planejamento 2 meses à frente
  worldtides_api_key?: string;
}

export interface RestricoesMare {
  [porto_id: string]: {
    porto_nome: string;
    profundidade_m: number;
    calado_referencia_m: number;
    amplitude_media_m: number;
    restricao_noturna: boolean;
    janelas_navegacao: JanelaMare[];
    calado_max_horario: Record<string, number>;  // "YYYY-MM-DDTHH:mm" → calado (m)
    dias_sem_janela: string[];
    total_janelas: number;
    total_horas_viaveis: number;
  };
}

export interface Porto {
  id: string;
  nome: string;
  codigo: string;
  latitude: number;
  longitude: number;
  calado_max_metros: number;
  dias_operacao: number; // dias para carregar/descarregar
  despesas_portuarias_usd: number;
  // ── Maré e Datum ──────────────────────────────────────────────
  profundidade_canal_m?: number;   // profundidade nominal do canal
  amplitude_media_m?: number;      // amplitude média da maré local
  restricao_noturna?: boolean;     // restrição noturna para calados altos
  referencial_datum?: 'ZH' | 'NR' | 'MSL'; // Zero Hidrográfico, Nível de Redução, Nível Médio
  offset_mare_m?: number;          // correção de altura local (ex: canal interno)
}

export interface MatrizDistancia {
  porto_origem_id: string;
  porto_destino_id: string;
  distancia_nm: number; // milhas náuticas
  dias_transito: number;
}

export interface PerfilConsumo {
  velocidade_no: number;
  consumo_carregado_mt_dia: number;
  consumo_vazio_mt_dia: number;
  consumo_descarga_mt_dia: number;
}

export type TipoNavio = 'TC' | 'SPOT';
export type VelocidadeNavio = 'FULL' | 'ECO' | 'MIN';

/** Unidade de medida da carga: granel líquido/seco (CBM) ou contêiner (TEU). */
export type UnidadeCarga = 'CBM' | 'TEU';

/**
 * Classe de carga perigosa segundo o Código IMDG (IMO).
 * 'NAO_PERIGOSA' = carga geral; '1'..'9' = classes IMDG.
 */
export type ClasseIMO =
  | 'NAO_PERIGOSA'
  | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export interface Navio {
  id: string;
  nome: string;
  tipo: TipoNavio;
  capacidade_cbm: number;
  calado_carregado_metros: number;
  calado_vazio_metros: number;
  custo_tc_diario_usd?: number; // apenas TC
  custo_spot_fixo_usd?: number; // apenas SPOT
  /** Laytime contratual (dias) — SPOT */
  laytime_dias?: number;
  /** Taxa de demurrage USD/dia após laytime — SPOT */
  demurrage_usd_dia?: number;
  perfil_consumo: PerfilConsumo;
  velocidade_referencia: VelocidadeNavio;
  ativo: boolean;
  // ── Contêiner (opcional; ausente = navio de granel em CBM) ──────
  /** Unidade que o navio transporta. Default 'CBM'. */
  unidade_carga?: UnidadeCarga;
  /** Capacidade em TEU (quando unidade_carga = 'TEU'). */
  capacidade_teu?: number;
  /** Tomadas reefer (contêineres refrigerados) disponíveis a bordo. */
  slots_reefer?: number;
  /** Capacidade de peso de carga / deadweight útil (toneladas). */
  capacidade_peso_t?: number;
  /** Altura máxima de empilhamento on-deck (tiers). */
  altura_empilhamento_max?: number;
  /** Bunker extra por dia para gerar energia de cada TEU reefer (MT/dia/TEU). */
  consumo_reefer_mt_dia_por_teu?: number;
}

/** Previsão de maré / profundidade por porto e janela (DHN, NOAA, harmônica). */
export interface PrevisaoMarePorto {
  porto_id: string;
  inicio_janela_iso: string;
  fim_janela_iso: string;
  calado_max_admissivel_m?: number;
  profundidade_disponivel_min_m?: number;
  ukc_minimo_m?: number;
}

// ── Produto / lote de carga individual de entrega em um porto ──
export interface ProdutoEntrega {
  id: string;
  nome: string;
  volume_cbm: number;
  // ── Atributos de contêiner (opcionais) ─────────────────────────
  /** Quantidade em TEU deste lote (carga conteinerizada). */
  volume_teu?: number;
  /** Carga refrigerada (consome tomada reefer + energia). */
  reefer?: boolean;
  /** Peso total do lote em toneladas (para limite de deadweight). */
  peso_t?: number;
  /** Classe de carga perigosa IMDG/IMO. Default 'NAO_PERIGOSA'. */
  classe_imo?: ClasseIMO;
  /** Tiers de empilhamento exigidos/permitidos. */
  altura_empilhamento?: number;
}

export interface Demanda {
  id: string;
  porto_destino_id: string;
  /** @deprecated use produtos[] */
  produto: string;
  volume_cbm: number; // total (soma dos produtos)
  produtos: ProdutoEntrega[]; // produtos detalhados por entrega
  data_necessidade: string; // YYYY-MM-DD
  prioridade: 'ALTA' | 'MEDIA' | 'BAIXA';
  janela_min_dias?: number;
  janela_max_dias?: number;
  // ── Contêiner (opcional) ────────────────────────────────────────
  /** Unidade da demanda. Default 'CBM'. */
  unidade_carga?: UnidadeCarga;
  /** Volume total em TEU (quando unidade_carga = 'TEU'). */
  volume_teu?: number;
}

export interface Premissas {
  porto_origem_id: string; // Temadre / porto base
  inicio_periodo: string; // YYYY-MM-DD
  fim_periodo: string; // YYYY-MM-DD
  ocupacao_minima_pct: number; // e.g. 60
  ocupacao_ideal_pct: number; // e.g. 85
  ocupacao_maxima_pct: number; // e.g. 100
  min_portos_por_viagem: number;
  /** 0 = sem limite */
  max_portos_por_viagem: number;
  intervalo_minimo_dias: number;
  viagens_mes_tc: number;
  bunker_preco_usd_mt: number; // preço bunker por tonelada métrica
  taxa_cambio_usd_brl: number;
  percentil_performance: number; // 0-100
  origem_sempre_temadre: boolean;
  // ── Maré e Calado ─────────────────────────────────────────────
  usar_previsao_mare: boolean;         // ativa o módulo de maré
  margem_seguranca_mare_m: number;     // UKC mínimo (padrão PIANC: 0.5 m)
  margem_meteorologica_m: number;      // surge storm p/ planejo antecipado (0.5 m = 2 meses)
  worldtides_api_key?: string;         // opcional: WorldTides API key
  restricoes_mare?: RestricoesMare;    // previsão pré-calculada (injetada pelo backend)
  // ── Margens de Lucro ──────────────────────────────────────────
  margem_lucro_alvo_pct: number;       // Padrão 60%
  // ── Contêiner (opcional) ──────────────────────────────────────
  /** Unidade padrão usada ao criar novas demandas/navios. Default 'CBM'. */
  unidade_carga_padrao?: UnidadeCarga;
  /** Custo de energia para contêiner refrigerado (USD por TEU reefer por dia). */
  custo_energia_reefer_usd_dia_teu?: number;
}

export interface ConfiguracaoOtimizacao {
  portos: Porto[];
  matriz_distancias: MatrizDistancia[];
  navios: Navio[];
  demandas: Demanda[];
  premissas: Premissas;
  previsoes_mare?: PrevisaoMarePorto[];
}

// ═══════════════════════════════════════════════════════════════
// RESULTADO DA OTIMIZAÇÃO
// ═══════════════════════════════════════════════════════════════

export interface ParadaViagem {
  porto_id: string;
  porto_nome: string;
  ordem: number;
  volume_entregue_cbm: number;
  produtos: string[];
  produtos_detalhados?: ProdutoEntrega[];
  dias_operacao: number;
  /** ISO datetime com hora estimada (YYYY-MM-DDTHH:mm) */
  data_chegada: string;
  /** ISO datetime com hora estimada (YYYY-MM-DDTHH:mm) */
  data_saida: string;
  despesas_portuarias_usd: number;
  calado_limite_efetivo_m?: number;
  restricao_mare_aplicada?: boolean;
  /** Fonte do calado: catálogo, maré harmônica ou aproximação por amplitude. */
  fonte_calado?: FonteCaladoMare;
  // ── Contêiner (opcional) ────────────────────────────────────────
  volume_entregue_teu?: number;
  peso_entregue_t?: number;
  teu_reefer?: number;
}

export interface DetalhesCustoViagem {
  custo_tc_diario_usd: number;
  custo_bunker_usd: number;
  custo_demurrage_usd?: number;
  despesas_portuarias_usd: number;
  custo_total_usd: number;
  custo_total_brl: number;
  custo_por_cbm_usd: number;
  /** Custo de energia de contêineres reefer na viagem (USD). */
  custo_reefer_usd?: number;
  /** Custo por unidade de carga (CBM ou TEU conforme a viagem). */
  custo_por_unidade_usd?: number;
}

export interface Viagem {
  id: string;
  navio_id: string;
  navio_nome: string;
  tipo_navio: TipoNavio;
  /** ISO datetime (YYYY-MM-DDTHH:mm) */
  data_partida: string;
  /** ISO datetime (YYYY-MM-DDTHH:mm) */
  data_retorno: string;
  duracao_dias: number;
  paradas: ParadaViagem[];
  volume_total_cbm: number;
  capacidade_navio_cbm: number;
  ocupacao_pct: number;
  distancia_total_nm: number;
  custos: DetalhesCustoViagem;
  // ── Contêiner (opcional) ────────────────────────────────────────
  /** Unidade de carga desta viagem ('CBM' por padrão). */
  unidade_carga?: UnidadeCarga;
  volume_total_teu?: number;
  capacidade_navio_teu?: number;
  peso_total_t?: number;
  teu_reefer_total?: number;
}

export type TipoCenario = 'OTIMISTA' | 'BASE' | 'CONSERVADOR' | 'CUSTO_MINIMO';

export interface MetricasCenario {
  total_viagens: number;
  volume_total_entregue_cbm: number;
  volume_total_demandado_cbm: number;
  demanda_atendida_pct: number;
  custo_total_usd: number;
  custo_total_brl: number;
  custo_medio_por_cbm_usd: number;
  ocupacao_media_pct: number;
  total_navios_tc_usados: number;
  total_navios_spot_usados: number;
  tempo_execucao_ms: number;
  // ── Contêiner (opcional) ────────────────────────────────────────
  unidade_carga?: UnidadeCarga;
  volume_total_entregue_teu?: number;
  volume_total_demandado_teu?: number;
  teu_reefer_total?: number;
}

export interface CenarioOtimizacao {
  tipo: TipoCenario;
  label: string;
  descricao: string;
  viagens: Viagem[];
  metricas: MetricasCenario;
  status: 'PENDENTE' | 'EXECUTANDO' | 'CONCLUIDO' | 'ERRO';
  erro?: string;
}

export interface ResultadoOtimizacao {
  id: string;
  timestamp: string;
  configuracao: ConfiguracaoOtimizacao;
  cenarios: CenarioOtimizacao[];
  cenario_recomendado: TipoCenario;
  status_geral: 'PENDENTE' | 'EXECUTANDO' | 'CONCLUIDO' | 'ERRO';
  comparativo: {
    melhor_custo: TipoCenario;
    melhor_demanda: TipoCenario;
    custo_total_minimo_usd: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTES DE ROTAS
// ═══════════════════════════════════════════════════════════════

export const ROUTE_PATHS = {
  LANDING: '/',
  HOME: '/app',
  AUTH: '/auth',
  CONFIGURACAO: '/configuracao',
  OTIMIZACAO: '/otimizacao',
  RESULTADOS: '/resultados',
  PLANOS: '/planos',
} as const;
