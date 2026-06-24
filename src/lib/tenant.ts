// ═══════════════════════════════════════════════════════════════
// SISTEMA MULTITENANT — TIPOS E UTILITÁRIOS
// Cada tenant é completamente isolado: config, histórico e uso
// ═══════════════════════════════════════════════════════════════

import { podeDemoBrowser, getDemoUsoBrowser, incrementDemoUsoBrowser, DEMO_LIMITE_BROWSER } from './demoUsage';

// ─── Planos de Assinatura ──────────────────────────────────────
// Margem de lucro alvo: 60%
// Custo estimado por run de otimização (infra + suporte): R$ 18
// Preço mínimo por run = R$ 18 / (1 - 0.60) = R$ 45
// Preços abaixo consideram volume e elasticidade de mercado

export type PlanoId = 'DEMO' | 'TRIAL' | 'STARTER' | 'PROFISSIONAL' | 'ENTERPRISE' | 'CUSTOM';

export interface Plano {
  id: PlanoId;
  nome: string;
  descricao: string;
  preco_mensal_brl: number;
  preco_anual_brl: number; // 20% desconto
  limite_otimizacoes_mes: number; // 0 = ilimitado
  limite_usuarios: number;        // 0 = ilimitado
  limite_portos: number;          // 0 = ilimitado
  limite_navios: number;          // 0 = ilimitado
  suporte: string;
  sla_horas: number;
  customizacao_modelo: boolean;
  integracao_api: boolean;
  relatorios_avancados: boolean;
  historico_meses: number;
  cor: string;
  destaque: boolean;
  custo_infra_estimado_brl: number;  // custo real estimado
  margem_pct: number;                // margem resultante
}

export const PLANOS: Record<PlanoId, Plano> = {
  DEMO: {
    id: 'DEMO',
    nome: 'Demonstração',
    descricao: 'Prévia rápida — conta compartilhada para conhecer o Pharos',
    preco_mensal_brl: 0,
    preco_anual_brl: 0,
    limite_otimizacoes_mes: 5,
    limite_usuarios: 1,
    limite_portos: 0,
    limite_navios: 0,
    suporte: 'Somente demo',
    sla_horas: 0,
    customizacao_modelo: false,
    integracao_api: false,
    relatorios_avancados: false,
    historico_meses: 1,
    cor: '#64748b',
    destaque: false,
    custo_infra_estimado_brl: 0,
    margem_pct: 0,
  },
  TRIAL: {
    id: 'TRIAL',
    nome: 'Trial Gratuito',
    descricao: '14 dias para simular cabotagem completa com seus dados',
    preco_mensal_brl: 0,
    preco_anual_brl: 0,
    limite_otimizacoes_mes: 10,
    limite_usuarios: 3,
    limite_portos: 0,
    limite_navios: 0,
    suporte: 'E-mail',
    sla_horas: 72,
    customizacao_modelo: false,
    integracao_api: false,
    relatorios_avancados: true,
    historico_meses: 1,
    cor: '#22c55e',
    destaque: false,
    custo_infra_estimado_brl: 0,
    margem_pct: 0,
  },
  STARTER: {
    id: 'STARTER',
    nome: 'Starter',
    descricao: 'Ideal para pequenas operações com frota reduzida',
    preco_mensal_brl: 1890,
    preco_anual_brl: 18144,    // 1890 * 12 * 0.80
    limite_otimizacoes_mes: 20,
    limite_usuarios: 3,
    limite_portos: 8,
    limite_navios: 4,
    suporte: 'E-mail (48h)',
    sla_horas: 48,
    customizacao_modelo: false,
    integracao_api: false,
    relatorios_avancados: false,
    historico_meses: 3,
    cor: '#3b82f6',
    destaque: false,
    custo_infra_estimado_brl: 756,    // 40% de 1890
    margem_pct: 60,
  },
  PROFISSIONAL: {
    id: 'PROFISSIONAL',
    nome: 'Profissional',
    descricao: 'Para operações médias com múltiplos navios e rotas',
    preco_mensal_brl: 4990,
    preco_anual_brl: 47904,   // 4990 * 12 * 0.80
    limite_otimizacoes_mes: 100,
    limite_usuarios: 10,
    limite_portos: 0,
    limite_navios: 0,
    suporte: 'Chat + E-mail (24h)',
    sla_horas: 24,
    customizacao_modelo: false,
    integracao_api: true,
    relatorios_avancados: true,
    historico_meses: 12,
    cor: '#8b5cf6',
    destaque: true,
    custo_infra_estimado_brl: 1996,   // 40%
    margem_pct: 60,
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    nome: 'Enterprise',
    descricao: 'Para grandes operadores com necessidades complexas',
    preco_mensal_brl: 12900,
    preco_anual_brl: 123840,  // 12900 * 12 * 0.80
    limite_otimizacoes_mes: 500,
    limite_usuarios: 0,
    limite_portos: 0,
    limite_navios: 0,
    suporte: 'Dedicado + Telefone (4h)',
    sla_horas: 4,
    customizacao_modelo: true,
    integracao_api: true,
    relatorios_avancados: true,
    historico_meses: 36,
    cor: '#f59e0b',
    destaque: false,
    custo_infra_estimado_brl: 5160,   // 40%
    margem_pct: 60,
  },
  CUSTOM: {
    id: 'CUSTOM',
    nome: 'Custom',
    descricao: 'Modelo completamente personalizado para sua operação',
    preco_mensal_brl: 0,
    preco_anual_brl: 0,
    limite_otimizacoes_mes: 0,
    limite_usuarios: 0,
    limite_portos: 0,
    limite_navios: 0,
    suporte: 'Equipe dedicada (1h)',
    sla_horas: 1,
    customizacao_modelo: true,
    integracao_api: true,
    relatorios_avancados: true,
    historico_meses: 0,
    cor: '#10b981',
    destaque: false,
    custo_infra_estimado_brl: 0,
    margem_pct: 60,
  },
};

// ─── Tenant (empresa / cliente) ────────────────────────────────

export interface TenantUser {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  avatar_initials: string;
  role: 'ADMIN' | 'ANALISTA' | 'VIEWER';
  criado_em: string;
}

export interface UsoMensal {
  mes: string;           // YYYY-MM
  otimizacoes_usadas: number;
  ultimo_reset: string;  // ISO
}

export interface Tenant {
  id: string;             // slug único ex: "petro-logistica"
  nome_empresa: string;
  cnpj?: string;
  plano_id: PlanoId;
  plano_ativo: boolean;
  data_inicio: string;    // ISO
  data_vencimento: string;
  cobranca_anual: boolean;
  uso_mensal: UsoMensal;
  usuarios: TenantUser[];
  configuracao_hash?: string;  // hash da última config salva
}

// ─── Sessão ────────────────────────────────────────────────────

export interface Sessao {
  tenant_id: string;
  user_id: string;
  token: string;          // token simples (hash local)
  iniciada_em: string;
  expira_em: string;
}

// ─── Utilitários ───────────────────────────────────────────────

/** Chave de storage isolada por tenant */
export function tenantKey(tenantId: string, key: string): string {
  return `cab_t_${tenantId}_${key}`;
}

/** Otimizações já consumidas (demo compartilhada usa contador por navegador). */
export function otimizacoesUsadas(tenant: Tenant): number {
  if (tenant.plano_id === 'DEMO') return getDemoUsoBrowser();
  return tenant.uso_mensal.otimizacoes_usadas;
}

/** Verifica se o tenant pode executar mais otimizações este mês */
export function podeOtimizar(tenant: Tenant): { pode: boolean; motivo?: string; restam: number } {
  const plano = PLANOS[tenant.plano_id];
  if (!plano) {
    return { pode: false, motivo: 'Plano inválido. Entre em contato com o suporte.', restam: 0 };
  }
  if (!tenant.plano_ativo) {
    return { pode: false, motivo: 'Plano inativo. Renove sua assinatura.', restam: 0 };
  }

  if (tenant.plano_id === 'TRIAL') {
    const vencimento = new Date(tenant.data_vencimento);
    if (vencimento < new Date()) {
      return {
        pode: false,
        motivo: 'Seu trial de 14 dias expirou. Assine um plano para continuar otimizando.',
        restam: 0,
      };
    }
  }

  if (tenant.plano_id === 'DEMO') {
    const demo = podeDemoBrowser();
    if (!demo.pode) {
      return {
        pode: false,
        motivo: `Limite da demonstração atingido (${DEMO_LIMITE_BROWSER} simulações neste navegador). Crie sua conta gratuita com seu e-mail para continuar.`,
        restam: 0,
      };
    }
    return { pode: true, restam: demo.restam };
  }

  if (plano.limite_otimizacoes_mes === 0) {
    return { pode: true, restam: 999999 };
  }
  const usadas = tenant.uso_mensal.otimizacoes_usadas;
  const restam = plano.limite_otimizacoes_mes - usadas;
  if (restam <= 0) {
    const motivo =
      tenant.plano_id === 'TRIAL'
        ? `Limite do trial atingido (${plano.limite_otimizacoes_mes} simulações). Assine um plano para continuar.`
        : `Limite de ${plano.limite_otimizacoes_mes} otimizações/mês atingido. Faça upgrade do seu plano.`;
    return { pode: false, motivo, restam: 0 };
  }
  return { pode: true, restam };
}

/** Registra consumo de uma otimização (demo usa contador local por navegador). */
export function registrarConsumoOtimizacao(tenant: Tenant): Tenant {
  if (tenant.plano_id === 'DEMO') {
    incrementDemoUsoBrowser();
    return tenant;
  }
  return {
    ...tenant,
    uso_mensal: {
      ...tenant.uso_mensal,
      otimizacoes_usadas: tenant.uso_mensal.otimizacoes_usadas + 1,
    },
  };
}

export function isPlanoDemo(tenant: Tenant): boolean {
  return tenant.plano_id === 'DEMO';
}

export function isPlanoTrial(tenant: Tenant): boolean {
  return tenant.plano_id === 'TRIAL';
}

export function isContaGratuita(tenant: Tenant): boolean {
  return tenant.plano_id === 'DEMO' || tenant.plano_id === 'TRIAL';
}

/** Busca tenant que contém o e-mail informado. */
export function buscarTenantsPorEmail(email: string): Tenant[] {
  const emailNorm = email.trim().toLowerCase();
  if (!emailNorm) return [];
  try {
    const raw = localStorage.getItem('cab_tenant_registry');
    if (!raw) return [];
    const lista = JSON.parse(raw) as Tenant[];
    return lista.filter((t) => t.usuarios.some((u) => u.email === emailNorm));
  } catch {
    return [];
  }
}

/** Gera um ID de tenant a partir do nome da empresa */
export function gerarTenantId(nomeEmpresa: string): string {
  return nomeEmpresa
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

/** Gera token de sessão simples */
export function gerarToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Retorna iniciais do nome */
export function iniciais(nome: string): string {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

/** Verifica se o mês mudou e reseta uso */
export function verificarResetMensal(uso: UsoMensal): UsoMensal {
  const mesAtual = new Date().toISOString().slice(0, 7);
  if (uso.mes !== mesAtual) {
    return { mes: mesAtual, otimizacoes_usadas: 0, ultimo_reset: new Date().toISOString() };
  }
  return uso;
}

/** Formata preço em BRL */
export function formatarPreco(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** Percentual de uso */
export function percentualUso(tenant: Tenant): number {
  const plano = PLANOS[tenant.plano_id];
  if (!plano || plano.limite_otimizacoes_mes === 0) return 0;
  return Math.min(100, (otimizacoesUsadas(tenant) / plano.limite_otimizacoes_mes) * 100);
}
