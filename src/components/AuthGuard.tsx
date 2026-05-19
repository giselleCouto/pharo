import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useTenant';
import { ROUTE_PATHS } from '@/lib/types';
import { useTenantStore } from '@/hooks/useTenant';
import { PLANOS, formatarPreco, podeOtimizar } from '@/lib/tenant';

// ─── AuthGuard ─────────────────────────────────────────────────
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { isAutenticado } = useAuth();

  useEffect(() => {
    if (!isAutenticado) navigate(ROUTE_PATHS.AUTH, { replace: true });
  }, [isAutenticado, navigate]);

  if (!isAutenticado) return null;
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
    usoAtual: tenant.uso_mensal.otimizacoes_usadas,
    limiteTotal: plano.limite_otimizacoes_mes,
    restam: check.restam,
    podeProsseguir: check.pode,
    motivoBloqueio: check.motivo,
    precoMensal: formatarPreco(plano.preco_mensal_brl),
    mesAtual,
  };
}

