import { create } from 'zustand';
import { 
  ConfiguracaoOtimizacao, 
  ResultadoOtimizacao, 
  TipoCenario, 
  CenarioOtimizacao 
} from '@/lib/types';
import { CONFIGURACAO_DEFAULT } from '@/data/index';
import { useTenantStore } from '@/hooks/useTenant';
import { tenantKey } from '@/lib/tenant';

// ─── Persistência isolada por tenant ──────────────────────────
function salvarConfigTenant(config: ConfiguracaoOtimizacao) {
  const { tenant } = useTenantStore.getState();
  if (!tenant) return;
  try {
    localStorage.setItem(tenantKey(tenant.id, 'config'), JSON.stringify(config));
  } catch { /* quota */ }
}

function carregarConfigTenant(): ConfiguracaoOtimizacao | null {
  const { tenant } = useTenantStore.getState();
  if (!tenant) return null;
  const raw = localStorage.getItem(tenantKey(tenant.id, 'config'));
  if (!raw) return null;
  try { return JSON.parse(raw) as ConfiguracaoOtimizacao; } catch { return null; }
}

// ─── Tipos ─────────────────────────────────────────────────────
interface ProgressoGlobal {
  pct: number;
  msg: string;
}

interface OtimizadorStore {
  configuracao: ConfiguracaoOtimizacao;
  resultado: ResultadoOtimizacao | null;
  executando: boolean;
  progressoGlobal: ProgressoGlobal;
  cenarioSelecionado: TipoCenario | null;
  abaAtiva: string;
  erroBloqueio: string | null;

  setConfiguracao: (config: ConfiguracaoOtimizacao) => void;
  setAbaAtiva: (aba: string) => void;
  setCenarioSelecionado: (tipo: TipoCenario) => void;
  executarOtimizacao: () => Promise<void>;
  resetar: () => void;
  carregarConfiguracaoTenant: () => void;
}

// ─── Store ─────────────────────────────────────────────────────
export const useOtimizadorStore = create<OtimizadorStore>((set, get) => ({
  configuracao: CONFIGURACAO_DEFAULT,
  resultado: null,
  executando: false,
  progressoGlobal: { pct: 0, msg: '' },
  cenarioSelecionado: null,
  abaAtiva: 'config',
  erroBloqueio: null,

  setConfiguracao: (config) => {
    set({ configuracao: config });
    salvarConfigTenant(config);
  },

  setAbaAtiva: (aba) => set({ abaAtiva: aba }),
  setCenarioSelecionado: (tipo) => set({ cenarioSelecionado: tipo }),

  carregarConfiguracaoTenant: () => {
    const saved = carregarConfigTenant();
    if (saved) set({ configuracao: saved });
    else set({ configuracao: CONFIGURACAO_DEFAULT });
  },

  executarOtimizacao: async () => {
    set({ erroBloqueio: null });

    const tenantStore = useTenantStore.getState();
    const { pode, motivo } = tenantStore.registrarOtimizacao();

    if (!pode) {
      set({ erroBloqueio: motivo ?? 'Limite de otimizações atingido.' });
      return;
    }

    set({ 
      executando: true, 
      resultado: null, 
      progressoGlobal: { pct: 0, msg: 'Iniciando Worker...' } 
    });

    try {
      // ─── Inicializa Web Worker ──────────────────────────────
      const worker = new Worker(
        new URL('../lib/optimizer.worker.ts', import.meta.url),
        { type: 'module' }
      );

      const promise = new Promise<ResultadoOtimizacao>((resolve, reject) => {
        worker.onmessage = (e) => {
          const { type, payload } = e.data;

          if (type === 'PROGRESSO') {
            set({ progressoGlobal: payload });
          } else if (type === 'RESULTADO') {
            const cenarios = payload as CenarioOtimizacao[];
            
            // Encontra o recomendado
            const recomendado = cenarios.reduce((prev, curr) => 
              curr.metricas.custo_total_usd < prev.metricas.custo_total_usd ? curr : prev
            );

            const res: ResultadoOtimizacao = {
              id: `RES-${Date.now()}`,
              timestamp: new Date().toISOString(),
              configuracao: get().configuracao,
              cenarios,
              cenario_recomendado: recomendado.tipo,
              status_geral: 'CONCLUIDO',
              comparativo: {
                melhor_custo: recomendado.tipo,
                melhor_demanda: cenarios.reduce((p, c) => 
                  c.metricas.demanda_atendida_pct > p.metricas.demanda_atendida_pct ? c : p
                ).tipo,
                custo_total_minimo_usd: recomendado.metricas.custo_total_usd,
              }
            };
            
            resolve(res);
            worker.terminate();
          } else if (type === 'ERRO') {
            reject(new Error(payload));
            worker.terminate();
          }
        };

        worker.onerror = (err) => {
          reject(err);
          worker.terminate();
        };

        // Dispara execução
        worker.postMessage({
          type: 'EXECUTAR_OTIMIZACAO',
          payload: {
            config: get().configuracao,
            tipoCenarios: ['OTIMISTA', 'BASE', 'CONSERVADOR', 'CUSTO_MINIMO'] as TipoCenario[]
          }
        });
      });

      const resultado = await promise;

      // Persistência do histórico
      const { tenant } = useTenantStore.getState();
      if (tenant) {
        try {
          const histRaw = localStorage.getItem(tenantKey(tenant.id, 'historico_resultados')) ?? '[]';
          const historico = JSON.parse(histRaw) as ResultadoOtimizacao[];
          historico.unshift(resultado);
          localStorage.setItem(
            tenantKey(tenant.id, 'historico_resultados'),
            JSON.stringify(historico.slice(0, 10))
          );
        } catch { /* quota */ }
      }

      set({
        resultado,
        executando: false,
        cenarioSelecionado: resultado.cenario_recomendado,
        abaAtiva: 'resultados',
      });
    } catch (err) {
      set({ executando: false, erroBloqueio: 'Erro interno no motor de otimização.' });
      console.error('Erro na otimização:', err);
    }
  },

  resetar: () =>
    set({
      resultado: null,
      progressoGlobal: { pct: 0, msg: '' },
      cenarioSelecionado: null,
      executando: false,
      erroBloqueio: null,
    }),
}));
