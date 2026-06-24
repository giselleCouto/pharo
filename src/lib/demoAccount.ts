/**
 * Conta demo — garante tenant e credencial sempre consistentes no localStorage.
 */
import type { Tenant, TenantUser } from '@/lib/tenant';
import { verificarResetMensal, tenantKey } from '@/lib/tenant';
import { DEMO_LIMITE_BROWSER } from '@/lib/demoUsage';
import { salvarConfiguracaoInicialTenant } from '@/lib/trialConfig';

export const DEMO_TENANT_ID = 'demo-pharos';
export const DEMO_EMAIL = 'demo@pharos.app';
export const DEMO_SENHA = 'demo123';

/** Limite exibido na UI da conta demo compartilhada (por navegador). */
export const DEMO_LIMITE_OTIMIZACOES = DEMO_LIMITE_BROWSER;

const REGISTRY_KEY = 'cab_tenant_registry';
const LEGACY_TENANT_ID = 'demo-cabotagem';
const LEGACY_EMAIL = 'demo@cabotagem.com';

function hashSenha(senha: string): string {
  return btoa(encodeURIComponent(senha + '_cab2026'));
}

function credKey(tenantId: string, email: string): string {
  return `cab_cred_${tenantId}_${email.toLowerCase()}`;
}

function listarTenants(): Tenant[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Tenant[];
  } catch {
    return [];
  }
}

function salvarRegistry(tenants: Tenant[]): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(tenants));
}

function salvarCredencial(tenantId: string, email: string, senha: string): void {
  localStorage.setItem(credKey(tenantId, email), hashSenha(senha));
}

export function isContaDemo(tenantId: string): boolean {
  return tenantId === DEMO_TENANT_ID;
}

/** Cria ou atualiza a conta demo (idempotente, preserva contador de uso). */
export function ensureDemoAccount(): void {
  if (typeof window === 'undefined') return;

  const agora = new Date().toISOString();
  const venc = new Date();
  venc.setMonth(venc.getMonth() + 1);

  const existente = listarTenants().find((t) => t.id === DEMO_TENANT_ID);
  const usoPreservado = verificarResetMensal(
    existente?.uso_mensal ?? {
      mes: agora.slice(0, 7),
      otimizacoes_usadas: 0,
      ultimo_reset: agora,
    }
  );

  const demoUser: TenantUser = {
    id: 'usr_demo_001',
    nome: 'Usuário Demo',
    email: DEMO_EMAIL,
    cargo: 'Analista de Logística',
    avatar_initials: 'UD',
    role: 'ADMIN',
    criado_em: existente?.usuarios[0]?.criado_em ?? agora,
  };

  const demoTenant: Tenant = {
    id: DEMO_TENANT_ID,
    nome_empresa: 'Demo Pharos',
    plano_id: 'DEMO',
    plano_ativo: true,
    data_inicio: existente?.data_inicio ?? agora,
    data_vencimento: venc.toISOString(),
    cobranca_anual: false,
    uso_mensal: usoPreservado,
    usuarios: [demoUser],
  };

  const lista = listarTenants().filter(
    (t) => t.id !== DEMO_TENANT_ID && t.id !== LEGACY_TENANT_ID
  );
  lista.push(demoTenant);
  salvarRegistry(lista);

  salvarCredencial(DEMO_TENANT_ID, DEMO_EMAIL, DEMO_SENHA);

  localStorage.removeItem(credKey(LEGACY_TENANT_ID, LEGACY_EMAIL));
  localStorage.removeItem(credKey(DEMO_TENANT_ID, LEGACY_EMAIL));

  if (typeof window !== 'undefined' && !localStorage.getItem(tenantKey(DEMO_TENANT_ID, 'config'))) {
    salvarConfiguracaoInicialTenant(DEMO_TENANT_ID);
  }
}

/** Retorna tenant demo atualizado (após ensure). */
export function getDemoTenant(): Tenant | null {
  ensureDemoAccount();
  return listarTenants().find((t) => t.id === DEMO_TENANT_ID) ?? null;
}
