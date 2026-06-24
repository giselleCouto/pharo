import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useTenant';
import { tenantKey, otimizacoesUsadas, isContaGratuita } from '@/lib/tenant';
import { ROUTE_PATHS } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sparkles, X, MapPin, Ship, Package, Settings, Zap, CheckCircle2, ArrowRight, Anchor,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PASSOS = [
  {
    num: 1,
    titulo: 'Revise portos, navios e demandas',
    desc: 'Os dados de exemplo já estão carregados. Ajuste volumes, datas ou portos se quiser testar seu cenário.',
    icon: Package,
    aba: 'demandas',
  },
  {
    num: 2,
    titulo: 'Confira premissas e maré',
    desc: 'Validação de calado (UKC) e maré já vêm ativadas. Revise o período e margens de segurança.',
    icon: Settings,
    aba: 'premissas',
  },
  {
    num: 3,
    titulo: 'Salve a configuração',
    desc: 'Clique em "Salvar Configuração" no topo da página antes de otimizar.',
    icon: CheckCircle2,
    aba: null,
  },
  {
    num: 4,
    titulo: 'Execute a otimização',
    desc: 'Vá para Otimização e clique em "Calcular Cenários" — o motor gera 4 cenários em paralelo.',
    icon: Zap,
    aba: null,
  },
] as const;

function guiaFoiDispensado(tenantId: string): boolean {
  try {
    return localStorage.getItem(tenantKey(tenantId, 'onboarding_guia_dismissed')) === '1';
  } catch {
    return false;
  }
}

function dispensarGuia(tenantId: string): void {
  localStorage.setItem(tenantKey(tenantId, 'onboarding_guia_dismissed'), '1');
}

interface WelcomeGuideBannerProps {
  onIrParaAba?: (aba: string) => void;
  onSalvar?: () => void;
}

export function WelcomeGuideBanner({ onIrParaAba, onSalvar }: WelcomeGuideBannerProps) {
  const { tenant, user } = useAuth();
  const [dispensado, setDispensado] = useState(false);
  const [passoAtivo, setPassoAtivo] = useState(1);

  if (!tenant || !user) return null;

  const jaSimulou = otimizacoesUsadas(tenant) > 0;
  if (jaSimulou || dispensado || guiaFoiDispensado(tenant.id)) return null;

  const contaGratuita = isContaGratuita(tenant);
  const passo = PASSOS[passoAtivo - 1];

  function handleDispensar() {
    dispensarGuia(tenant!.id);
    setDispensado(true);
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/15">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">
                    Bem-vindo{user.nome ? `, ${user.nome.split(' ')[0]}` : ''}!
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {contaGratuita
                      ? 'Siga os 4 passos abaixo para sua primeira simulação de cabotagem completa.'
                      : 'Guia rápido para rodar sua primeira otimização no Pharos.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDispensar}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                aria-label="Fechar guia"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1.5">
              {PASSOS.map((p) => (
                <button
                  key={p.num}
                  type="button"
                  onClick={() => setPassoAtivo(p.num)}
                  className={cn(
                    'flex-1 h-1.5 rounded-full transition-all',
                    passoAtivo >= p.num ? 'bg-primary' : 'bg-muted',
                    passoAtivo === p.num && 'ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
                  )}
                  aria-label={`Passo ${p.num}`}
                />
              ))}
            </div>

            <div className="p-4 rounded-xl border border-border bg-card/80 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <passo.icon className="w-4 h-4 text-primary" />
                Passo {passo.num} — {passo.titulo}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{passo.desc}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {passo.aba && onIrParaAba && (
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
                    onClick={() => onIrParaAba(passo.aba!)}>
                    Ir para aba <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
                {passo.num === 3 && onSalvar && (
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onSalvar}>
                    <Settings className="w-3 h-3" /> Salvar agora
                  </Button>
                )}
                {passo.num === 4 && (
                  <Link to={ROUTE_PATHS.OTIMIZACAO}>
                    <Button size="sm" className="gap-1.5 h-8 text-xs">
                      <Zap className="w-3 h-3" /> Ir para Otimização
                    </Button>
                  </Link>
                )}
                {passoAtivo < 4 && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs"
                    onClick={() => setPassoAtivo((p) => Math.min(4, p + 1))}>
                    Próximo passo →
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Portos configurados</span>
              <span className="flex items-center gap-1"><Ship className="w-3 h-3" /> Frota ativa</span>
              <span className="flex items-center gap-1"><Package className="w-3 h-3" /> Demandas de exemplo</span>
              <span className="flex items-center gap-1 text-primary"><Anchor className="w-3 h-3" /> Maré + UKC ativos</span>
            </div>
          </div>

          <div className="lg:w-56 border-t lg:border-t-0 lg:border-l border-border bg-muted/20 p-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Checklist
            </p>
            {PASSOS.map((p) => (
              <button
                key={p.num}
                type="button"
                onClick={() => setPassoAtivo(p.num)}
                className={cn(
                  'w-full text-left flex items-start gap-2 p-2 rounded-lg text-xs transition-colors',
                  passoAtivo === p.num ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold',
                  passoAtivo > p.num ? 'bg-success/20 text-success' :
                  passoAtivo === p.num ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}>
                  {passoAtivo > p.num ? '✓' : p.num}
                </span>
                <span className="leading-tight pt-0.5">{p.titulo}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
