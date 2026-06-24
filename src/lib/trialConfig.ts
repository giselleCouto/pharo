import type { ConfiguracaoOtimizacao } from '@/lib/types';
import { CONFIGURACAO_DEFAULT } from '@/data/index';
import { tenantKey } from '@/lib/tenant';

/** Configuração inicial otimizada para primeira simulação de cabotagem. */
export function criarConfiguracaoTrial(): ConfiguracaoOtimizacao {
  return {
    ...CONFIGURACAO_DEFAULT,
    premissas: {
      ...CONFIGURACAO_DEFAULT.premissas,
      usar_previsao_mare: true,
      ocupacao_minima_pct: 50,
    },
  };
}

export function salvarConfiguracaoInicialTenant(tenantId: string): void {
  if (typeof window === 'undefined') return;
  const config = criarConfiguracaoTrial();
  localStorage.setItem(tenantKey(tenantId, 'config'), JSON.stringify(config));
}
