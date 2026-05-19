import { NavLink, Link } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/types';
import { Anchor, Settings, Zap, BarChart3, Ship, Home, Crown, LogOut, User, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useTenant';
import { PLANOS, percentualUso, podeOtimizar, formatarPreco } from '@/lib/tenant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const navItems = [
  { path: ROUTE_PATHS.CONFIGURACAO, label: 'Configuração', icon: Settings },
  { path: ROUTE_PATHS.OTIMIZACAO, label: 'Otimização', icon: Zap },
  { path: ROUTE_PATHS.RESULTADOS, label: 'Resultados', icon: BarChart3 },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { tenant, user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const plano = tenant ? PLANOS[tenant.plano_id] : null;
  const pct = tenant ? percentualUso(tenant) : 0;
  const check = tenant ? podeOtimizar(tenant) : { pode: true, restam: 0 };
  const usoAtual = tenant?.uso_mensal.otimizacoes_usadas ?? 0;
  const limiteTotal = plano?.limite_otimizacoes_mes ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Alerta de limite */}
      {!check.pode && (
        <div className="bg-warning/15 border-b border-warning/30 px-6 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{check.motivo}</span>
          </div>
          <Link to={ROUTE_PATHS.PLANOS} className="underline text-warning hover:text-warning/80 font-semibold">
            Ver planos →
          </Link>
        </div>
      )}
      {check.pode && pct > 80 && (
        <div className="bg-orange-500/10 border-b border-orange-500/20 px-6 py-1.5 flex items-center justify-between text-xs">
          <span className="text-orange-400">
            ⚠️ {usoAtual} de {limiteTotal} otimizações usadas este mês ({pct.toFixed(0)}%)
          </span>
          <Link to={ROUTE_PATHS.PLANOS} className="underline text-orange-400 font-semibold">Fazer upgrade</Link>
        </div>
      )}

      {/* Header principal */}
      <header className="border-b border-border bg-card/80 sticky top-0 z-50"
        style={{ boxShadow: '0 1px 20px -4px color-mix(in srgb, var(--primary) 20%, transparent)' }}>
        <div className="flex items-center gap-3 px-6 py-3">
          {/* Logo */}
          <Link to={ROUTE_PATHS.LANDING} className="flex items-center gap-2 mr-3 hover:opacity-80 transition-opacity">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Ship className="w-5 h-5 text-primary" />
            </div>
            <div className="hidden sm:block">
              <div className="font-bold text-sm leading-tight font-mono text-primary">CABOTAGEM</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Otimizador de Rotas v2.0</div>
            </div>
          </Link>

          <div className="w-px h-8 bg-border" />

          {/* Nav */}
          <nav className="flex items-center gap-1">
            <Link to={ROUTE_PATHS.LANDING}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              <Home className="w-4 h-4" /> <span className="hidden md:inline">Início</span>
            </Link>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )
                }
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden md:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Barra de uso */}
            {plano && limiteTotal > 0 && (
              <Link to={ROUTE_PATHS.PLANOS} className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors group">
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground font-mono leading-tight">
                    {usoAtual}/{limiteTotal} runs
                  </div>
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
                    <div
                      className={cn('h-full rounded-full transition-all', pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-warning' : 'bg-success')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            )}
            {plano && limiteTotal === 0 && (
              <div className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground font-mono px-2">
                <span className="text-success">∞</span> runs/mês
              </div>
            )}

            {/* Badge do plano */}
            {plano && (
              <Link to={ROUTE_PATHS.PLANOS}>
                <Badge variant="outline" className="hidden sm:flex gap-1.5 px-2 py-1 text-[10px] font-mono cursor-pointer hover:border-primary/50 transition-colors"
                  style={{ borderColor: `${plano.cor}40`, color: plano.cor }}>
                  <Crown className="w-3 h-3" />
                  {plano.nome}
                </Badge>
              </Link>
            )}

            {/* Info empresa */}
            {tenant && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground font-mono border-l border-border pl-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: plano?.cor ?? '#3b82f6' }}>
                  {tenant.nome_empresa.slice(0, 2).toUpperCase()}
                </div>
                <span className="max-w-[120px] truncate">{tenant.nome_empresa}</span>
              </div>
            )}

            {/* Menu usuário */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-muted transition-colors border border-transparent hover:border-border"
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white bg-primary/80">
                  {user?.avatar_initials ?? 'U'}
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-border bg-card shadow-xl z-50 py-1">
                  {/* Info usuário */}
                  <div className="px-3 py-2.5 border-b border-border">
                    <div className="font-semibold text-sm text-foreground">{user?.nome}</div>
                    <div className="text-xs text-muted-foreground">{user?.email}</div>
                    <Badge variant="outline" className="text-[9px] mt-1 py-0">{user?.role}</Badge>
                  </div>

                  <Link to={ROUTE_PATHS.PLANOS}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Crown className="w-4 h-4" /> Planos e assinatura
                  </Link>

                  <Link to={ROUTE_PATHS.CONFIGURACAO}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Settings className="w-4 h-4" /> Configuração
                  </Link>

                  <div className="border-t border-border mt-1 pt-1">
                    <button onClick={() => { logout(); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-destructive/10 text-destructive transition-colors rounded-b-lg">
                      <LogOut className="w-4 h-4" /> Sair
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Overlay para fechar menu */}
      {userMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
