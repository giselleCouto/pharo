import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useTenant';
import { ROUTE_PATHS } from '@/lib/types';
import { useTenantStore } from '@/hooks/useTenant';
import { PLANOS, formatarPreco, podeOtimizar, otimizacoesUsadas } from '@/lib/tenant';

// ─── AuthGuard ─────────────────────────────────────────────────
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { isAutenticado } = useAuth();
  const hasHydrated = useTenantStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAutenticado) navigate(ROUTE_PATHS.AUTH, { replace: true });
  }, [isAutenticado, hasHydrated, navigate]);

  if (!hasHydrated || !isAutenticado) return null;
  return <>{children}</>;
}

// ─── Hook para verificar limite antes de otimizar ──────────────
export function useVerificarOtimizacao() {
  const store = useTenantStore();
  return () => store.registrarOtimizacao();
}

// ─── Hook de informações do tenant para o Layout ──────────────
export function useTenantInfo() {
  const { tenant, user } = useAuth();
  if (!tenant || !user) return null;

  const plano = PLANOS[tenant.plano_id];
  const check = podeOtimizar(tenant);
  const mesAtual = tenant.uso_mensal.mes;

  return {
    tenant,
    user,
    plano,
    usoAtual: otimizacoesUsadas(tenant),
    limiteTotal: plano.limite_otimizacoes_mes,
    restam: check.restam,
    podeProsseguir: check.pode,
    motivoBloqueio: check.motivo,
    precoMensal: formatarPreco(plano.preco_mensal_brl),
    mesAtual,
  };
}

