import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Tenant, TenantUser, Sessao, PlanoId, PLANOS,
  tenantKey, gerarTenantId, gerarToken, iniciais,
  verificarResetMensal, podeOtimizar, buscarTenantsPorEmail,
  registrarConsumoOtimizacao,
} from '@/lib/tenant';
import { salvarConfiguracaoInicialTenant } from '@/lib/trialConfig';

// ─── Tipos do Store ────────────────────────────────────────────

interface TenantStore {
  // Estado atual
  sessao: Sessao | null;
  tenant: Tenant | null;
  erro: string | null;
  /** true após reidratação do sessionStorage (evita race com login) */
  _hasHydrated: boolean;

  // Ações de autenticação
  registrar: (params: {
    nomeEmpresa: string;
    cnpj?: string;
    nomeUsuario: string;
    email: string;
    cargo: string;
    senha: string;
    plano_id: PlanoId;
    cobranca_anual: boolean;
  }) => { ok: boolean; mensagem: string };

  login: (tenantId: string, email: string, senha: string) => { ok: boolean; mensagem: string };
  loginPorEmail: (email: string, senha: string, tenantIdOpcional?: string) => { ok: boolean; mensagem: string };
  logout: () => void;
  limparErro: () => void;

  // Ações de tenant
  registrarOtimizacao: () => { pode: boolean; motivo?: string };
  atualizarTenant: (t: Partial<Tenant>) => void;
  adicionarUsuario: (u: Omit<TenantUser, 'id' | 'criado_em' | 'avatar_initials'> & { senha: string }) => { ok: boolean; mensagem: string };

  // Storage isolado por tenant
  getTenantStorage: () => Storage | null;
  setTenantData: (key: string, value: unknown) => void;
  getTenantData: <T>(key: string, fallback: T) => T;
}

// ─── Credenciais (armazenadas separado do tenant) ──────────────
// Mapa: tenantId+email → hash da senha (base64 simples)
function hashSenha(senha: string): string {
  // Hash simples para demo — em produção usar bcrypt/argon2 no backend
  return btoa(encodeURIComponent(senha + '_cab2026'));
}

function salvarCredencial(tenantId: string, email: string, senha: string) {
  const chave = `cab_cred_${tenantId}_${email.toLowerCase()}`;
  localStorage.setItem(chave, hashSenha(senha));
}

function verificarCredencial(tenantId: string, email: string, senha: string): boolean {
  const chave = `cab_cred_${tenantId}_${email.toLowerCase()}`;
  const stored = localStorage.getItem(chave);
  return stored === hashSenha(senha);
}

// ─── Tenant registry (lista de todos os tenants) ──────────────
function listarTenants(): Tenant[] {
  const raw = localStorage.getItem('cab_tenant_registry');
  if (!raw) return [];
  try { return JSON.parse(raw) as Tenant[]; } catch { return []; }
}

function salvarTenant(tenant: Tenant) {
  const lista = listarTenants().filter(t => t.id !== tenant.id);
  lista.push(tenant);
  localStorage.setItem('cab_tenant_registry', JSON.stringify(lista));
}

function buscarTenant(tenantId: string): Tenant | null {
  return listarTenants().find(t => t.id === tenantId) ?? null;
}

// ─── Tenant Store ──────────────────────────────────────────────
export const useTenantStore = create<TenantStore>()(
  persist(
    (set, get) => ({
      sessao: null as Sessao | null,
      tenant: null as Tenant | null,
      erro: null as string | null,
      _hasHydrated: false,

      // ── Registrar novo tenant ──────────────────────────────
      registrar: ({ nomeEmpresa, cnpj, nomeUsuario, email, cargo, senha, plano_id, cobranca_anual }) => {
        const tenantId = gerarTenantId(nomeEmpresa);
        const emailNorm = email.trim().toLowerCase();

        if (buscarTenantsPorEmail(emailNorm).length > 0) {
          return { ok: false, mensagem: 'Este e-mail já está cadastrado. Use Entrar com seu e-mail e senha.' };
        }

        // Verifica duplicidade de empresa
        if (buscarTenant(tenantId)) {
          return { ok: false, mensagem: `Empresa "${nomeEmpresa}" já cadastrada. Use o login com seu e-mail.` };
        }

        const userId = `usr_${Date.now()}`;
        const agora = new Date().toISOString();
        const vencimento = new Date();
        const planoEfetivo = plano_id ?? 'TRIAL';
        if (planoEfetivo === 'TRIAL') {
          vencimento.setDate(vencimento.getDate() + 14);
        } else {
          vencimento.setMonth(vencimento.getMonth() + 1);
        }

        const adminUser: TenantUser = {
          id: userId,
          nome: nomeUsuario,
          email: emailNorm,
          cargo,
          avatar_initials: iniciais(nomeUsuario),
          role: 'ADMIN',
          criado_em: agora,
        };

        const novoTenant: Tenant = {
          id: tenantId,
          nome_empresa: nomeEmpresa,
          cnpj,
          plano_id: planoEfetivo,
          plano_ativo: true,
          data_inicio: agora,
          data_vencimento: vencimento.toISOString(),
          cobranca_anual,
          uso_mensal: {
            mes: agora.slice(0, 7),
            otimizacoes_usadas: 0,
            ultimo_reset: agora,
          },
          usuarios: [adminUser],
        };

        salvarTenant(novoTenant);
        salvarCredencial(tenantId, emailNorm, senha);
        salvarConfiguracaoInicialTenant(tenantId);

        const sessao: Sessao = {
          tenant_id: tenantId,
          user_id: userId,
          token: gerarToken(),
          iniciada_em: agora,
          expira_em: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        };

        set({ tenant: novoTenant, sessao, erro: null, _hasHydrated: true });
        return { ok: true, mensagem: `Conta criada! Seu ID de empresa é "${tenantId}" (guarde para referência).` };
      },

      loginPorEmail: (email, senha, tenantIdOpcional) => {
        const emailNorm = email.trim().toLowerCase();
        const idOpcional = tenantIdOpcional?.trim().toLowerCase();

        if (idOpcional) {
          return get().login(idOpcional, emailNorm, senha);
        }

        const candidatos = buscarTenantsPorEmail(emailNorm);
        if (candidatos.length === 0) {
          return { ok: false, mensagem: 'E-mail não encontrado. Crie sua conta gratuita para começar.' };
        }

        const validos = candidatos.filter((t) => verificarCredencial(t.id, emailNorm, senha));
        if (validos.length === 0) {
          return { ok: false, mensagem: 'Senha incorreta.' };
        }
        if (validos.length > 1) {
          return {
            ok: false,
            mensagem: 'Este e-mail está em mais de uma empresa. Informe o ID da empresa no campo opcional.',
          };
        }

        return get().login(validos[0].id, emailNorm, senha);
      },

      // ── Login ──────────────────────────────────────────────
      login: (tenantId, email, senha) => {
        const id = tenantId.trim().toLowerCase();
        const emailNorm = email.trim().toLowerCase();

        const tenant = buscarTenant(id);
        if (!tenant) {
          return { ok: false, mensagem: 'Empresa não encontrada. Verifique o ID da empresa.' };
        }

        const user = tenant.usuarios.find(u => u.email === emailNorm);
        if (!user) {
          return { ok: false, mensagem: 'Usuário não encontrado nessa empresa.' };
        }

        if (!verificarCredencial(id, emailNorm, senha)) {
          return { ok: false, mensagem: 'Senha incorreta.' };
        }

        const usoAtualizado = verificarResetMensal(tenant.uso_mensal);
        let tenantAtual = tenant;
        if (usoAtualizado.mes !== tenant.uso_mensal.mes) {
          tenantAtual = { ...tenant, uso_mensal: usoAtualizado };
          salvarTenant(tenantAtual);
        }

        const sessao: Sessao = {
          tenant_id: id,
          user_id: user.id,
          token: gerarToken(),
          iniciada_em: new Date().toISOString(),
          expira_em: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        };

        set({ tenant: tenantAtual, sessao, erro: null, _hasHydrated: true });
        return { ok: true, mensagem: 'Login realizado com sucesso!' };
      },

      // ── Logout ─────────────────────────────────────────────
      logout: () => set({ sessao: null, tenant: null, erro: null }),

      limparErro: () => set({ erro: null }),

      // ── Registrar uso de otimização ────────────────────────
      registrarOtimizacao: () => {
        const { tenant } = get();
        if (!tenant) return { pode: false, motivo: 'Sessão inválida.' };

        const check = podeOtimizar(tenant);
        if (!check.pode) return check;

        const tenantAtualizado = registrarConsumoOtimizacao(tenant);
        salvarTenant(tenantAtualizado);
        set({ tenant: tenantAtualizado });

        return { pode: true, restam: check.restam - 1 };
      },

      // ── Atualizar dados do tenant ──────────────────────────
      atualizarTenant: (parcial) => {
        const { tenant } = get();
        if (!tenant) return;
        const atualizado = { ...tenant, ...parcial };
        salvarTenant(atualizado);
        set({ tenant: atualizado });
      },

      // ── Adicionar usuário ──────────────────────────────────
      adicionarUsuario: ({ nome, email, cargo, senha, role }) => {
        const { tenant } = get();
        if (!tenant) return { ok: false, mensagem: 'Sem sessão ativa.' };

        const plano = PLANOS[tenant.plano_id];
        if (plano.limite_usuarios > 0 && tenant.usuarios.length >= plano.limite_usuarios) {
          return { ok: false, mensagem: `Limite de ${plano.limite_usuarios} usuários atingido.` };
        }

        const existe = tenant.usuarios.find(u => u.email === email.toLowerCase());
        if (existe) return { ok: false, mensagem: 'E-mail já cadastrado.' };

        const novoUser: TenantUser = {
          id: `usr_${Date.now()}`,
          nome, email: email.toLowerCase(), cargo,
          avatar_initials: iniciais(nome),
          role,
          criado_em: new Date().toISOString(),
        };

        salvarCredencial(tenant.id, email, senha);
        const atualizado = { ...tenant, usuarios: [...tenant.usuarios, novoUser] };
        salvarTenant(atualizado);
        set({ tenant: atualizado });
        return { ok: true, mensagem: 'Usuário adicionado.' };
      },

      // ── Storage isolado por tenant ─────────────────────────
      getTenantStorage: () => {
        if (typeof window === 'undefined') return null;
        return localStorage;
      },

      setTenantData: (key, value) => {
        const { tenant } = get();
        if (!tenant) return;
        localStorage.setItem(tenantKey(tenant.id, key), JSON.stringify(value));
      },

      getTenantData: <T>(key: string, fallback: T): T => {
        const { tenant } = get();
        if (!tenant) return fallback;
        const raw = localStorage.getItem(tenantKey(tenant.id, key));
        if (!raw) return fallback;
        try { return JSON.parse(raw) as T; } catch { return fallback; }
      },
    }),
    {
      name: 'cab_sessao_v1',
      storage: createJSONStorage(() => sessionStorage), // sessão expira ao fechar aba
      partialize: (s) => ({ sessao: s.sessao, tenant: s.tenant }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          useTenantStore.setState({ _hasHydrated: true });
          return;
        }

        if (state.sessao) {
          if (new Date(state.sessao.expira_em) < new Date()) {
            state.logout();
          } else {
            const fresh = buscarTenant(state.sessao.tenant_id);
            if (fresh) {
              const uso = verificarResetMensal(fresh.uso_mensal);
              state.tenant = { ...fresh, uso_mensal: uso };
            } else {
              state.logout();
            }
          }
        }

        state._hasHydrated = true;
      },
    }
  )
);

// ─── Hook de conveniência ──────────────────────────────────────
export function useAuth() {
  const { sessao, tenant, erro, login, loginPorEmail, logout, registrar, limparErro } = useTenantStore();
  const user = tenant?.usuarios.find(u => u.id === sessao?.user_id);
  return { sessao, tenant, user, erro, isAutenticado: !!sessao && !!tenant, login, loginPorEmail, logout, registrar, limparErro };
}
