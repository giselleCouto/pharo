/**
 * ══════════════════════════════════════════════════════════════════════════
 *  WEB WORKER — ALGORITMO INTELIGENTE (Off-thread Execution)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Este worker executa o motor de otimização em uma thread separada para
 *  evitar o travamento da interface do usuário (Main Thread) durante o
 *  processamento intensivo de cenários.
 */

import { executarOtimizacao } from './optimizer';
import { TipoCenario, ConfiguracaoOtimizacao } from './types';

// Escuta mensagens da main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'EXECUTAR_OTIMIZACAO') {
    const { config, tipoCenarios } = payload as { 
      config: ConfiguracaoOtimizacao, 
      tipoCenarios: TipoCenario[] 
    };

    try {
      const resultados = [];
      
      for (let i = 0; i < tipoCenarios.length; i++) {
        const tipo = tipoCenarios[i];
        
        // Notifica progresso de início de cenário
        self.postMessage({ 
          type: 'PROGRESSO', 
          payload: { 
            pct: (i / tipoCenarios.length) * 100, 
            msg: `Processando ${tipo}...` 
          } 
        });

        const resultado = executarOtimizacao(config, tipo, (pct, msg) => {
          // Encaminha progresso interno do cenário
          const totalPct = ((i + (pct / 100)) / tipoCenarios.length) * 100;
          self.postMessage({ type: 'PROGRESSO', payload: { pct: totalPct, msg } });
        });

        resultados.push(resultado);
      }

      // Envia resultado final
      self.postMessage({ type: 'RESULTADO', payload: resultados });
    } catch (error) {
      self.postMessage({ 
        type: 'ERRO', 
        payload: error instanceof Error ? error.message : 'Erro desconhecido no worker' 
      });
    }
  }
};
