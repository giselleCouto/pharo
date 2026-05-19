import {
  Porto,
  Navio,
  MatrizDistancia,
  Demanda,
  Premissas,
  ConfiguracaoOtimizacao,
} from '@/lib/types';

// ═══════════════════════════════════════════════════════════════
// DADOS MOCK PADRÃO — CABOTAGEM OTIMIZADOR v3.1
// ═══════════════════════════════════════════════════════════════

export const PORTOS_DEFAULT: Porto[] = [
  {
    id: 'TEMADRE',
    nome: 'Terminal Almirante Barroso',
    codigo: 'TEMADRE',
    latitude: -12.97,
    longitude: -38.50,
    calado_max_metros: 14.5,
    dias_operacao: 1.5,
    despesas_portuarias_usd: 12500,
    profundidade_canal_m: 14.0,
    amplitude_media_m: 2.3,
    restricao_noturna: false,
    referencial_datum: 'ZH',
    offset_mare_m: 0,
  },
  {
    id: 'SUAPE',
    nome: 'Porto de Suape',
    codigo: 'SUAPE',
    latitude: -8.40,
    longitude: -34.98,
    calado_max_metros: 15.5,
    dias_operacao: 2.0,
    despesas_portuarias_usd: 15000,
    profundidade_canal_m: 15.5,
    amplitude_media_m: 2.1,
    restricao_noturna: false,
    referencial_datum: 'ZH',
    offset_mare_m: 0,
  },
  {
    id: 'PECÉM',
    nome: 'Terminal Portuário do Pecém',
    codigo: 'PECÉM',
    latitude: -3.54,
    longitude: -38.80,
    calado_max_metros: 15.0,
    dias_operacao: 2.0,
    despesas_portuarias_usd: 14000,
    profundidade_canal_m: 14.5,
    amplitude_media_m: 2.5,
    restricao_noturna: true,
    referencial_datum: 'ZH',
    offset_mare_m: 0,
  },
  {
    id: 'ITAQUI',
    nome: 'Porto do Itaqui',
    codigo: 'ITAQUI',
    latitude: -2.57,
    longitude: -44.36,
    calado_max_metros: 18.0,
    dias_operacao: 3.0,
    despesas_portuarias_usd: 18000,
    profundidade_canal_m: 19.0,
    amplitude_media_m: 5.2,
    restricao_noturna: false,
    referencial_datum: 'ZH',
    offset_mare_m: 0,
  },
  {
    id: 'SANTOS',
    nome: 'Porto de Santos',
    codigo: 'SANTOS',
    latitude: -23.96,
    longitude: -46.32,
    calado_max_metros: 14.5,
    dias_operacao: 2.5,
    despesas_portuarias_usd: 21000,
    profundidade_canal_m: 15.0,
    amplitude_media_m: 1.0,
    restricao_noturna: false,
    referencial_datum: 'ZH',
    offset_mare_m: 0,
  }
];

export const MATRIZ_DISTANCIAS_DEFAULT: MatrizDistancia[] = [
  { porto_origem_id: 'TEMADRE', porto_destino_id: 'SUAPE', distancia_nm: 450, dias_transito: 1.5 },
  { porto_origem_id: 'TEMADRE', porto_destino_id: 'PECÉM', distancia_nm: 750, dias_transito: 2.5 },
  { porto_origem_id: 'TEMADRE', porto_destino_id: 'ITAQUI', distancia_nm: 1250, dias_transito: 4.5 },
  { porto_origem_id: 'TEMADRE', porto_destino_id: 'SANTOS', distancia_nm: 850, dias_transito: 3.0 },
  { porto_origem_id: 'SUAPE', porto_destino_id: 'PECÉM', distancia_nm: 320, dias_transito: 1.0 },
  { porto_origem_id: 'SUAPE', porto_destino_id: 'ITAQUI', distancia_nm: 880, dias_transito: 3.0 },
  { porto_origem_id: 'PECÉM', porto_destino_id: 'ITAQUI', distancia_nm: 580, dias_transito: 2.0 },
  { porto_origem_id: 'SANTOS', porto_destino_id: 'TEMADRE', distancia_nm: 850, dias_transito: 3.0 },
];

export const NAVIOS_DEFAULT: Navio[] = [
  {
    id: 'NAV001',
    nome: 'Log-In Jatobá',
    tipo: 'TC',
    capacidade_cbm: 65000,
    calado_carregado_metros: 12.5,
    calado_vazio_metros: 8.5,
    custo_tc_diario_usd: 22000,
    perfil_consumo: {
      velocidade_no: 12,
      consumo_carregado_mt_dia: 35,
      consumo_vazio_mt_dia: 28,
      consumo_descarga_mt_dia: 5,
    },
    velocidade_referencia: 'ECO',
    ativo: true,
  },
  {
    id: 'NAV002',
    nome: 'CMA CGM Manaus',
    tipo: 'TC',
    capacidade_cbm: 45000,
    calado_carregado_metros: 10.8,
    calado_vazio_metros: 7.2,
    custo_tc_diario_usd: 18500,
    perfil_consumo: {
      velocidade_no: 14,
      consumo_carregado_mt_dia: 42,
      consumo_vazio_mt_dia: 34,
      consumo_descarga_mt_dia: 4,
    },
    velocidade_referencia: 'ECO',
    ativo: true,
  },
  {
    id: 'NAV003',
    nome: 'Spot Trader I',
    tipo: 'SPOT',
    capacidade_cbm: 32000,
    calado_carregado_metros: 9.5,
    calado_vazio_metros: 6.0,
    custo_spot_fixo_usd: 95000,
    laytime_dias: 2,
    demurrage_usd_dia: 12000,
    perfil_consumo: {
      velocidade_no: 13,
      consumo_carregado_mt_dia: 30,
      consumo_vazio_mt_dia: 24,
      consumo_descarga_mt_dia: 4,
    },
    velocidade_referencia: 'MIN',
    ativo: true,
  },
];

export const DEMANDAS_DEFAULT: Demanda[] = [
  {
    id: 'DEM001',
    porto_destino_id: 'SUAPE',
    produto: 'Diesel S10',
    volume_cbm: 12500,
    produtos: [{ id: 'P1', nome: 'Diesel S10', volume_cbm: 12500 }],
    data_necessidade: '2026-05-15',
    prioridade: 'ALTA',
    janela_min_dias: 5,
    janela_max_dias: 30,
  },
  {
    id: 'DEM002',
    porto_destino_id: 'PECÉM',
    produto: 'Gasolina C',
    volume_cbm: 8500,
    produtos: [{ id: 'P2', nome: 'Gasolina C', volume_cbm: 8500 }],
    data_necessidade: '2026-05-20',
    prioridade: 'MEDIA'
  },
  {
    id: 'DEM003',
    porto_destino_id: 'ITAQUI',
    produto: 'GLP',
    volume_cbm: 15000,
    produtos: [{ id: 'P3', nome: 'GLP', volume_cbm: 15000 }],
    data_necessidade: '2026-06-01',
    prioridade: 'ALTA'
  }
];

export const PREMISSAS_DEFAULT: Premissas = {
  porto_origem_id: 'TEMADRE',
  inicio_periodo: '2026-05-01',
  fim_periodo: '2026-06-15',
  ocupacao_minima_pct: 60,
  ocupacao_ideal_pct: 85,
  ocupacao_maxima_pct: 100,
  min_portos_por_viagem: 1,
  max_portos_por_viagem: 0,
  intervalo_minimo_dias: 7,
  viagens_mes_tc: 2,
  bunker_preco_usd_mt: 580,
  taxa_cambio_usd_brl: 5.15,
  percentil_performance: 50,
  origem_sempre_temadre: true,
  // ── Maré e Calado ─────────────────────────────────────────────
  usar_previsao_mare: false,
  margem_seguranca_mare_m: 0.50,
  margem_meteorologica_m: 0.50,
  worldtides_api_key: '',
  // ── Margens de Lucro ──────────────────────────────────────────
  margem_lucro_alvo_pct: 60,
};

export const CONFIGURACAO_DEFAULT: ConfiguracaoOtimizacao = {
  portos: PORTOS_DEFAULT,
  matriz_distancias: MATRIZ_DISTANCIAS_DEFAULT,
  navios: NAVIOS_DEFAULT,
  demandas: DEMANDAS_DEFAULT,
  premissas: PREMISSAS_DEFAULT,
};
