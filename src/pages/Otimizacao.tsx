import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOtimizadorStore } from '@/hooks/useOtimizador';
import { ROUTE_PATHS, TipoCenario } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Zap, CheckCircle, Clock, AlertCircle, Ship, Package, MapPin, Anchor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatarUsd } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useTenant';
import { podeOtimizar, PLANOS, percentualUso, isPlanoDemo } from '@/lib/tenant';
import { DEMO_LIMITE_OTIMIZACOES } from '@/lib/demoAccount';
import { LimitePlanoAlert } from '@/components/LimitePlanoAlert';

const CENARIO_INFO: Record<TipoCenario, { cor: string; descricao: string; icon: string }> = {
  OTIMISTA: { cor: 'text-success border-success/30 bg-success/5', descricao: 'Maximiza atendimento de demanda', icon: '🚀' },
  BASE: { cor: 'text-primary border-primary/30 bg-primary/5', descricao: 'Equilíbrio custo × cobertura', icon: '⚖️' },
  CONSERVADOR: { cor: 'text-warning border-warning/30 bg-warning/5', descricao: 'Minimiza riscos operacionais', icon: '🛡️' },
  CUSTO_MINIMO: { cor: 'text-accent border-accent/30 bg-accent/5', descricao: 'Foco em custo mínimo', icon: '💰' },
};

export default function OtimizacaoPage() {
  const { configuracao, resultado, executando, progressoGlobal, executarOtimizacao, resetar, erroBloqueio } = useOtimizadorStore();
  const navigate = useNavigate();
  const { tenant } = useAuth();

  const { portos, navios, demandas, premissas } = configuracao;
  const naviosAtivos = navios.filter((n) => n.ativo);
  const volTotal = demandas.reduce((s, d) => s + d.volume_cbm, 0);
  const plano = tenant ? PLANOS[tenant.plano_id] : null;
  const demo = tenant ? isPlanoDemo(tenant) : false;
  const check = tenant ? podeOtimizar(tenant) : { pode: true, restam: 999 };
  const pct = tenant ? percentualUso(tenant) : 0;
  const usoAtual = tenant?.uso_mensal.otimizacoes_usadas ?? 0;

  const handleExecutar = async () => {
    resetar();
    await executarOtimizacao();
  };

  useEffect(() => {
    if (resultado) {
      const timer = setTimeout(() => navigate(ROUTE_PATHS.RESULTADOS), 2000);
      return () => clearTimeout(timer);
    }
  }, [resultado, navigate]);

  const tiposCenario: TipoCenario[] = ['OTIMISTA', 'BASE', 'CONSERVADOR', 'CUSTO_MINIMO'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 max-w-6xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Motor — Algoritmo Inteligente
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            4 cenários simultâneos executados em Web Worker (Off-thread)
          </p>
        </div>
        <Button
          onClick={handleExecutar}
          disabled={executando || !check.pode}
          size="lg"
          className={cn(
            'gap-2 font-semibold transition-all duration-300',
            (executando || !check.pode) && 'opacity-75 cursor-not-allowed'
          )}
          style={{ boxShadow: '0 4px 16px color-mix(in srgb, var(--primary) 30%, transparent)' }}
        >
          {executando ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
              Otimizando...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Calcular Cenários
            </>
          )}
        </Button>
      </div>

      {/* Uso demo / limite de plano */}
      {tenant && demo && check.pode && (
        <div className="p-4 rounded-xl border border-border bg-muted/30 text-sm">
          <p className="font-medium text-foreground">Conta demonstração</p>
          <p className="text-muted-foreground text-xs mt-1">
            Você usou <strong>{usoAtual}</strong> de <strong>{DEMO_LIMITE_OTIMIZACOES}</strong> planos de
            cabotagem permitidos. Restam <strong>{check.restam}</strong> execução
            {check.restam !== 1 ? 'ões' : ''} (cada uma gera 4 cenários de rota).
          </p>
        </div>
      )}

      {tenant && (erroBloqueio || !check.pode) && (
        <LimitePlanoAlert
          tenant={tenant}
          motivo={erroBloqueio ?? check.motivo ?? 'Limite atingido.'}
        />
      )}

      {/* Progresso Global */}
      <AnimatePresence>
        {executando && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3"
          >
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-primary font-bold uppercase tracking-wider">{progressoGlobal.msg}</span>
              <span className="text-muted-foreground">{progressoGlobal.pct.toFixed(0)}%</span>
            </div>
            <Progress value={progressoGlobal.pct} className="h-2 bg-primary/10" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resumo Configuração */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Portos', value: portos.length, sub: 'cadastrados', icon: MapPin, color: 'text-primary' },
          { label: 'Navios Ativos', value: naviosAtivos.length, sub: `TC: ${naviosAtivos.filter(n => n.tipo === 'TC').length} | SPOT: ${naviosAtivos.filter(n => n.tipo === 'SPOT').length}`, icon: Ship, color: 'text-accent' },
          { label: 'Demandas', value: demandas.length, sub: `${volTotal.toLocaleString('pt-BR')} CBM total`, icon: Package, color: 'text-success' },
          {
            label: 'Período', value: premissas.fim_periodo.split('-').slice(0, 2).join('/'),
            sub: `${premissas.inicio_periodo} → ${premissas.fim_periodo}`,
            icon: Anchor, color: 'text-warning'
          },
        ].map((item) => (
          <Card key={item.label} className="border-border bg-card">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <div className={cn('p-2 rounded-lg bg-muted', item.color)}>
                  <item.icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="text-xl font-bold font-mono">{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.sub}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cards de Cenários */}
      <div className="grid grid-cols-2 gap-4">
        {tiposCenario.map((tipo, i) => {
          const info = CENARIO_INFO[tipo];
          const cenarioResultado = resultado?.cenarios.find((c) => c.tipo === tipo);
          const eConcluido = !!cenarioResultado;
          const eRecomendado = resultado?.cenario_recomendado === tipo;

          return (
            <motion.div
              key={tipo}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            >
              <Card className={cn(
                'border transition-all duration-300 h-full',
                eConcluido ? 'border-primary/30' : 'border-border',
                eRecomendado && 'border-success/50 ring-1 ring-success/20 bg-success/5'
              )}>
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{info.icon}</span>
                      <div>
                        <CardTitle className="text-sm font-bold">
                          {cenarioResultado?.label || tipo.replace('_', ' ')}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">{info.descricao}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {eRecomendado && (
                        <Badge className="text-[10px] bg-success/20 text-success border-success/30 border">
                          ⭐ Recomendado
                        </Badge>
                      )}
                      {eConcluido ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : executando ? (
                        <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  {eConcluido && cenarioResultado ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="grid grid-cols-2 gap-3 mt-2"
                    >
                      <div className="p-2 rounded-lg bg-background border border-border">
                        <div className="text-[10px] text-muted-foreground font-mono">Custo Total</div>
                        <div className="text-sm font-bold font-mono text-primary">
                          {formatarUsd(cenarioResultado.metricas.custo_total_usd)}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-background border border-border">
                        <div className="text-[10px] text-muted-foreground font-mono">Demanda Atendida</div>
                        <div className="text-sm font-bold font-mono text-success">
                          {cenarioResultado.metricas.demanda_atendida_pct.toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-background border border-border">
                        <div className="text-[10px] text-muted-foreground font-mono">Viagens</div>
                        <div className="text-sm font-bold font-mono">
                          {cenarioResultado.metricas.total_viagens}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-background border border-border">
                        <div className="text-[10px] text-muted-foreground font-mono">Ocup. Média</div>
                        <div className="text-sm font-bold font-mono">
                          {cenarioResultado.metricas.ocupacao_media_pct.toFixed(1)}%
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs py-4">
                      {executando ? (
                        <span className="animate-pulse">Calculando métricas...</span>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3" />
                          Aguardando execução
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Mensagem de conclusão */}
      <AnimatePresence>
        {resultado && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-success/30 bg-success/5 shadow-lg shadow-success/10">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-success" />
                  <div>
                    <div className="font-bold text-success text-lg">Otimização Concluída!</div>
                    <div className="text-sm text-muted-foreground">
                      Analisando {resultado.cenarios.length} cenários. Recomendado: <span className="font-mono font-bold text-success">{resultado.cenario_recomendado}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
