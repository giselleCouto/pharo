import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useTenant';
import { PLANOS, formatarPreco, percentualUso, podeOtimizar, isPlanoDemo } from '@/lib/tenant';
import { ROUTE_PATHS } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Crown, CheckCircle, Zap, ArrowRight, AlertTriangle,
  TrendingUp, Users, Settings, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PlanosPage() {
  const navigate = useNavigate();
  const { tenant } = useAuth();

  if (!tenant) {
    navigate(ROUTE_PATHS.AUTH);
    return null;
  }

  const planoAtual = PLANOS[tenant.plano_id];
  const usoAtual = tenant.uso_mensal.otimizacoes_usadas;
  const pct = percentualUso(tenant);
  const check = podeOtimizar(tenant);
  const demo = isPlanoDemo(tenant);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400" />
          Planos e Assinatura
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie seu plano atual e veja o uso do período
        </p>
      </div>

      {demo && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Você está na <strong className="text-foreground">conta demonstração</strong>. Para gerar novos planos
            de cabotagem após o limite, crie sua empresa e assine um plano pago.
          </p>
          <Link to={ROUTE_PATHS.AUTH} state={{ modo: 'REGISTRO' }}>
            <Button size="sm" className="gap-1.5 shrink-0">
              Criar conta <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      )}

      {/* Status atual */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="pt-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-muted-foreground font-mono uppercase">Plano atual</div>
              <div className="text-xl font-bold mt-0.5 flex items-center gap-2">
                <span style={{ color: planoAtual.cor }}>{planoAtual.nome}</span>
                {tenant.plano_ativo
                  ? <Badge className="bg-success/20 text-success border-success/30 text-[10px]">Ativo</Badge>
                  : <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">Inativo</Badge>}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-mono uppercase">Otimizações este mês</div>
              <div className="text-xl font-bold mt-0.5 font-mono">
                {usoAtual}<span className="text-muted-foreground text-base">/{planoAtual.limite_otimizacoes_mes === 0 ? '∞' : planoAtual.limite_otimizacoes_mes}</span>
              </div>
              {planoAtual.limite_otimizacoes_mes > 0 && (
                <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-warning' : 'bg-success')}
                    style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-mono uppercase">Usuários</div>
              <div className="text-xl font-bold mt-0.5 font-mono flex items-center gap-1.5">
                <Users className="w-4 h-4 text-muted-foreground" />
                {tenant.usuarios.length}
                <span className="text-muted-foreground text-base">/{planoAtual.limite_usuarios === 0 ? '∞' : planoAtual.limite_usuarios}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-mono uppercase">Vencimento</div>
              <div className="text-sm font-semibold mt-0.5">
                {new Date(tenant.data_vencimento).toLocaleDateString('pt-BR')}
              </div>
              <div className="text-xs text-muted-foreground">{tenant.cobranca_anual ? 'Anual' : 'Mensal'}</div>
            </div>
          </div>

          {!check.pode && (
            <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {check.motivo}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grid de planos */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Alterar plano</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {(['STARTER', 'PROFISSIONAL', 'ENTERPRISE'] as const).map((pid) => {
            const pl = PLANOS[pid];
            const isCurrent = tenant.plano_id === pid;
            return (
              <Card key={pid} className={cn(
                'border transition-all',
                isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/30',
                pl.destaque ? 'shadow-lg shadow-purple-500/10' : ''
              )}>
                {pl.destaque && !isCurrent && (
                  <div className="flex justify-center -mt-3 mb-1">
                    <Badge className="bg-purple-500 text-white gap-1"><Crown className="w-3 h-3" /> Mais popular</Badge>
                  </div>
                )}
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="flex items-center justify-between">
                    <span style={{ color: pl.cor }}>{pl.nome}</span>
                    {isCurrent && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Plano atual</Badge>}
                  </CardTitle>
                  <div className="text-2xl font-black font-mono text-foreground">
                    {formatarPreco(pl.preco_mensal_brl)}
                    <span className="text-sm text-muted-foreground font-normal">/mês</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {[
                      `${pl.limite_otimizacoes_mes === 0 ? '∞' : pl.limite_otimizacoes_mes} otimizações/mês`,
                      `${pl.limite_usuarios === 0 ? '∞' : pl.limite_usuarios} usuários`,
                      `${pl.limite_portos === 0 ? '∞' : pl.limite_portos} portos`,
                      pl.suporte,
                      pl.customizacao_modelo ? '✦ Modelo personalizado' : '',
                      pl.integracao_api ? '✦ API REST' : '',
                    ].filter(Boolean).map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full gap-2"
                    variant={isCurrent ? 'secondary' : 'default'}
                    disabled={isCurrent}
                  >
                    {isCurrent ? 'Plano atual' : 'Fazer upgrade'} {!isCurrent && <ArrowRight className="w-4 h-4" />}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Custom */}
      <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-950/20 to-transparent">
        <CardContent className="pt-5 pb-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Settings className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Plano Custom — Modelo personalizado</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Nossa equipe adapta o algoritmo à sua operação. Parâmetros customizados, integrações específicas e SLA de 1h.
              </p>
            </div>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2 shrink-0">
            Solicitar proposta <ArrowRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
