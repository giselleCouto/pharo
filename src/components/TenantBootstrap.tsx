import { useEffect } from 'react';
import { useAuth } from '@/hooks/useTenant';
import { useOtimizadorStore } from '@/hooks/useOtimizador';

/** Carrega configuração e histórico isolados ao trocar de tenant/sessão. */
export function TenantBootstrap(): null {
  const { tenant, isAutenticado } = useAuth();
  const carregarConfiguracaoTenant = useOtimizadorStore((s) => s.carregarConfiguracaoTenant);
  const resetar = useOtimizadorStore((s) => s.resetar);

  useEffect(() => {
    if (!isAutenticado || !tenant) return;
    carregarConfiguracaoTenant();
    resetar();
  }, [tenant?.id, isAutenticado, carregarConfiguracaoTenant, resetar]);

  return null;
}
