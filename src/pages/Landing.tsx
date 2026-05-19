import { useNavigate, Link } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/types';
import { PLANOS, formatarPreco } from '@/lib/tenant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Ship, Anchor, BarChart3, Zap, Shield, Settings, ArrowRight,
  CheckCircle, TrendingDown, Clock, Globe, Crown, Star,
  Fuel, Package, Navigation, ChevronRight, Waves, Wind,
  DollarSign, Activity, Lock, Users, Code2, LayoutDashboard
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Mini Gantt Demo ───────────────────────────────────────────
function MiniGantt() {
  const viagens = [
    { navio: 'NV Nordeste', tipo: 'TC', inicio: 0, fim: 22, cor: '#3b82f6', paradas: ['STS', 'MCP', 'VIX'] },
    { navio: 'NV Atlântico', tipo: 'TC', inicio: 3, fim: 19, cor: '#8b5cf6', paradas: ['STS', 'SDL'] },
    { navio: 'MV Cabral', tipo: 'SPOT', inicio: 8, fim: 26, cor: '#f59e0b', paradas: ['MCP', 'GUA', 'VIX'] },
    { navio: 'NV Meridional', tipo: 'TC', inicio: 12, fim: 28, cor: '#10b981', paradas: ['STS', 'NAT'] },
  ];
  const diasLabels = [1, 5, 10, 15, 20, 25, 30];
  const total = 30;

  return (
    <div className="w-full bg-slate-900/80 rounded-xl border border-slate-700/50 p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-blue-400" /> Cronograma — Cenário Otimista · Abril/2026
        </span>
        <div className="flex gap-2">
          {[{ l: 'TC', c: '#3b82f6' }, { l: 'SPOT', c: '#f59e0b' }].map(x => (
            <span key={x.l} className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: x.c }} /> {x.l}
            </span>
          ))}
        </div>
      </div>

      {/* Escala de dias */}
      <div className="relative mb-1" style={{ paddingLeft: '100px' }}>
        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
          {diasLabels.map(d => <span key={d}>{d}</span>)}
        </div>
      </div>

      {/* Barras */}
      <div className="space-y-2">
        {viagens.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-[96px] shrink-0 text-right">
              <span className="text-[10px] text-slate-300 font-mono leading-tight">{v.navio.replace('NV ', '').replace('MV ', '')}</span>
              <Badge variant="outline" className="text-[8px] py-0 px-1 ml-1 border-slate-600 text-slate-400">{v.tipo}</Badge>
            </div>
            <div className="flex-1 relative h-6 bg-slate-800/60 rounded">
              {/* Linha de hoje */}
              <div className="absolute top-0 bottom-0 w-px bg-red-500/60 z-10" style={{ left: `${(10 / total) * 100}%` }} />
              {/* Barra da viagem */}
              <div
                className="absolute top-0.5 bottom-0.5 rounded flex items-center justify-center gap-1 overflow-hidden"
                style={{
                  left: `${(v.inicio / total) * 100}%`,
                  width: `${((v.fim - v.inicio) / total) * 100}%`,
                  background: `${v.cor}22`,
                  border: `1px solid ${v.cor}66`,
                }}
              >
                {v.paradas.map((p, pi) => (
                  <span key={pi} className="text-[8px] font-mono px-0.5 rounded"
                    style={{ background: `${v.cor}44`, color: v.cor }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-700/50">
        {[
          { label: 'Custo Total', value: 'USD 284K', delta: '−18%', ok: true },
          { label: 'Ocupação Média', value: '87,4%', delta: '+12%', ok: true },
          { label: 'Emissão CO₂', value: '1.240t', delta: '−22%', ok: true },
        ].map(m => (
          <div key={m.label} className="text-center">
            <div className="text-[10px] text-slate-500 font-mono">{m.label}</div>
            <div className="text-sm font-bold text-slate-200 font-mono">{m.value}</div>
            <div className={cn('text-[10px] font-mono', m.ok ? 'text-emerald-400' : 'text-red-400')}>{m.delta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Card de Rota Mini ─────────────────────────────────────────
function MiniRouteMap() {
  const portos = [
    { id: 'TEM', x: 50, y: 200, cor: '#3b82f6', label: 'Temadre' },
    { id: 'STS', x: 120, y: 160, cor: '#10b981', label: 'Santos' },
    { id: 'MCP', x: 200, y: 140, cor: '#10b981', label: 'Mucuripe' },
    { id: 'VIX', x: 280, y: 170, cor: '#10b981', label: 'Vitória' },
    { id: 'GUA', x: 160, y: 200, cor: '#f59e0b', label: 'Guamaré' },
    { id: 'NAT', x: 240, y: 110, cor: '#8b5cf6', label: 'Natal' },
  ];
  const rotas = [
    [0, 1, '#3b82f6'], [1, 2, '#3b82f6'], [2, 3, '#3b82f6'],
    [0, 4, '#f59e0b'], [4, 5, '#f59e0b'],
  ];

  return (
    <div className="bg-slate-900/80 rounded-xl border border-slate-700/50 p-4">
      <div className="text-xs font-semibold text-slate-300 font-mono uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Navigation className="w-3.5 h-3.5 text-blue-400" /> Mapa de Rotas — 2 viagens ativas
      </div>
      <svg viewBox="0 0 340 240" className="w-full h-32 opacity-90">
        {/* Linhas de rota */}
        {rotas.map(([a, b, cor], i) => (
          <line key={i}
            x1={portos[a as number].x} y1={portos[a as number].y}
            x2={portos[b as number].x} y2={portos[b as number].y}
            stroke={cor as string} strokeWidth="1.5" strokeDasharray="4,3" opacity="0.8"
          />
        ))}
        {/* Pontos */}
        {portos.map(p => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y} r={5} fill={p.cor} opacity="0.85" />
            <circle cx={p.x} cy={p.y} r={9} fill={p.cor} opacity="0.15" />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="7" fill="#94a3b8" fontFamily="monospace">{p.id}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Seção de Preço ────────────────────────────────────────────
function CardPlano({ planoId, destaque }: { planoId: string; destaque?: boolean }) {
  const navigate = useNavigate();
  const plano = PLANOS[planoId as keyof typeof PLANOS];
  if (!plano || planoId === 'CUSTOM') return null;

  return (
    <div className={cn(
      'relative rounded-2xl border p-6 flex flex-col transition-all duration-300 hover:scale-[1.02]',
      destaque
        ? 'border-purple-500/50 bg-gradient-to-b from-purple-950/40 to-slate-900/80 shadow-xl shadow-purple-500/10'
        : 'border-slate-700/50 bg-slate-900/50 hover:border-slate-600/70'
    )}>
      {destaque && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-purple-500 text-white gap-1 px-3 shadow-lg">
            <Crown className="w-3 h-3" /> Mais Popular
          </Badge>
        </div>
      )}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl font-bold" style={{ color: plano.cor }}>{plano.nome}</span>
          {plano.customizacao_modelo && (
            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">Modelo custom</Badge>
          )}
        </div>
        <p className="text-sm text-slate-400">{plano.descricao}</p>
      </div>

      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-white font-mono">{formatarPreco(plano.preco_mensal_brl)}</span>
          <span className="text-slate-400 text-sm">/mês</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          ou {formatarPreco(plano.preco_anual_brl / 12)}/mês no plano anual (20% off)
        </div>
      </div>

      <ul className="space-y-2.5 mb-6 flex-1">
        {[
          [`${plano.limite_otimizacoes_mes === 0 ? 'Ilimitadas' : plano.limite_otimizacoes_mes} otimizações/mês`, true],
          [`${plano.limite_usuarios === 0 ? 'Ilimitados' : plano.limite_usuarios} usuários`, true],
          [`${plano.limite_portos === 0 ? 'Ilimitados' : plano.limite_portos} portos`, true],
          [`Histórico ${plano.historico_meses === 0 ? 'ilimitado' : plano.historico_meses + ' meses'}`, true],
          [plano.suporte, true],
          ['SLA ' + plano.sla_horas + 'h', true],
          ['Modelo personalizado', plano.customizacao_modelo],
          ['Integração API REST', plano.integracao_api],
          ['Relatórios avançados', plano.relatorios_avancados],
        ].map(([label, ok], i) => (
          <li key={i} className={cn('flex items-center gap-2 text-sm', ok ? 'text-slate-200' : 'text-slate-600 line-through')}>
            <CheckCircle className={cn('w-4 h-4 shrink-0', ok ? 'text-emerald-400' : 'text-slate-700')} />
            {label as string}
          </li>
        ))}
      </ul>

      <Button
        className={cn('w-full gap-2 font-semibold', destaque ? 'bg-purple-600 hover:bg-purple-700' : '')}
        variant={destaque ? 'default' : 'outline'}
        onClick={() => navigate(ROUTE_PATHS.AUTH)}
      >
        Começar agora <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Componente Principal ──────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">

      {/* ══════════════════════════════════════════════════════
          HEADER NAV
      ══════════════════════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/80 backdrop-blur-xl bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Anchor className="w-5 h-5 text-blue-400" />
            </div>
            <span className="font-bold text-white font-mono tracking-widest text-sm">CABOTAGEM<span className="text-blue-400">OPT</span></span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            {['Funcionalidades', 'Resultados', 'Tecnologia', 'Planos'].map(l => (
              <a key={l} href={`#${l.toLowerCase()}`} className="hover:text-white transition-colors">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white"
              onClick={() => navigate(ROUTE_PATHS.AUTH)}>
              Entrar
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5"
              onClick={() => navigate(ROUTE_PATHS.AUTH)}>
              Teste grátis <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════
          HERO — com imagem de navio real
      ══════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center pt-20">
        {/* Background: navio de carga real */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=1920&q=80&auto=format&fit=crop"
            alt="Navio de carga em operação portuária"
            className="w-full h-full object-cover object-center opacity-25"
            onError={(e) => {
              // fallback para segunda imagem
              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&q=80';
            }}
          />
          {/* Gradientes sobre a imagem */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/60" />
        </div>

        {/* Efeito de ondas animadas */}
        <div className="absolute bottom-0 left-0 right-0 h-32 opacity-20">
          <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0,50 C360,100 720,0 1080,50 C1260,75 1380,60 1440,50 L1440,100 L0,100 Z" fill="#1e40af" />
          </svg>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Texto hero */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 gap-1.5 px-3 py-1">
                <Activity className="w-3 h-3" /> v2.0 · Produção
              </Badge>
              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 gap-1.5 px-3 py-1">
                <Shield className="w-3 h-3" /> Multitenant
              </Badge>
            </div>

            <h1 className="text-4xl lg:text-5xl xl:text-6xl font-black leading-tight">
              Reduza{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                23% do custo
              </span>{' '}
              de combustível na cabotagem
            </h1>

            <p className="text-lg text-slate-300 leading-relaxed max-w-lg">
              Algoritmo Inteligente com <strong className="text-white">4 cenários simultâneos</strong> — Otimista, Base, Conservador e
              Custo Mínimo. Compatível com <strong className="text-white">AWS S3, Azure Blob, GCP Storage e Oracle OCI</strong>.
              Heurística de produção v2.0 com fracionamento de demandas e rotação de frota TC.
            </p>

            {/* Stats rápidas */}
            <div className="grid grid-cols-3 gap-4 py-2">
              {[
                { val: '23%', label: 'economia média', icon: Fuel, cor: '#34d399' },
                { val: '4×', label: 'cenários/execução', icon: Zap, cor: '#60a5fa' },
                { val: '∞', label: 'portos por viagem', icon: Globe, cor: '#c084fc' },
              ].map(s => (
                <div key={s.val} className="text-center p-3 rounded-xl border border-slate-700/50 bg-slate-900/50 backdrop-blur">
                  <s.icon className="w-5 h-5 mx-auto mb-1" style={{ color: s.cor }} />
                  <div className="text-2xl font-black font-mono" style={{ color: s.cor }}>{s.val}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 gap-2 text-base font-semibold px-8 shadow-lg shadow-blue-500/20"
                onClick={() => navigate(ROUTE_PATHS.AUTH)}>
                Começar teste grátis <ArrowRight className="w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline" className="border-slate-600 text-slate-200 hover:bg-slate-800 gap-2"
                onClick={() => navigate(ROUTE_PATHS.AUTH)}>
                Ver demonstração
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              14 dias grátis · Sem cartão de crédito · Isolamento total por empresa
            </p>
          </div>

          {/* Preview do Gantt no Hero */}
          <div className="space-y-4">
            <MiniGantt />
            <MiniRouteMap />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          BANNER IMPACTO — Métricas reais
      ══════════════════════════════════════════════════════ */}
      <section className="border-y border-slate-800/50 bg-slate-900/30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { val: 'R$ 280K', label: 'economia média/mês por operador', sub: 'vs planejamento manual', icon: DollarSign, cor: '#34d399' },
            { val: '87%', label: 'ocupação média de carga', sub: 'acima dos 60% do mercado', icon: Package, cor: '#60a5fa' },
            { val: '22%', label: 'redução de emissão CO₂', sub: 'por otimização de rota', icon: Wind, cor: '#a78bfa' },
            { val: '<2min', label: 'tempo para 4 cenários', sub: 'vs dias no Excel', icon: Zap, cor: '#fbbf24' },
          ].map(m => (
            <div key={m.val} className="space-y-1">
              <m.icon className="w-6 h-6 mx-auto" style={{ color: m.cor }} />
              <div className="text-3xl font-black font-mono" style={{ color: m.cor }}>{m.val}</div>
              <div className="text-sm text-slate-200 font-medium">{m.label}</div>
              <div className="text-xs text-slate-500">{m.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FUNCIONALIDADES
      ══════════════════════════════════════════════════════ */}
      <section id="funcionalidades" className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <Badge variant="outline" className="border-blue-500/30 text-blue-400 mb-4">Funcionalidades</Badge>
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Tudo que sua operação precisa, em uma plataforma
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            De qualquer cloud (AWS, Azure, GCP, Oracle) ao JSON de saída API type 4, sem código adicional.
            Modelo configurável para cada empresa.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Zap,
              cor: '#3b82f6',
              titulo: 'Algoritmo Inteligente Multi-cenário',
              desc: '4 cenários simultâneos: Otimista (máx capacidade), Base (balanceado), Conservador (risco mínimo) e Custo Mínimo (foco em bunker). Cada um com parâmetros distintos de ocupação, rotação e janelas.',
              tags: ['Heurística v2.0', 'Paralelo', 'IA Avançada'],
            },
            {
              icon: Fuel,
              cor: '#34d399',
              titulo: 'Otimização de Combustível (Bunker)',
              desc: 'Cálculo dinâmico de consumo de bunker por velocidade (ECO, NORMAL, RAPIDO) e tipo de navio. Redução de até 23% pelo agrupamento inteligente de demandas e sequenciamento de rotas.',
              tags: ['Bunker dinâmico', 'Eco-speed', 'CO₂'],
            },
            {
              icon: Navigation,
              cor: '#8b5cf6',
              titulo: 'Gantt Interativo de Viagens',
              desc: 'Cronograma visual com data e hora de partida/chegada em cada porto. Expansão por viagem mostrando paradas, produtos entregues, volumes e tempo de operação portuária.',
              tags: ['SVG interativo', 'Datetime', 'Multi-porto'],
            },
            {
              icon: Package,
              cor: '#f59e0b',
              titulo: 'Segregação Multi-produto',
              desc: 'Cada porto recebe produtos específicos com volumes independentes. Suporte a múltiplos produtos por demanda com validação de capacidade de tanque e restrições de segregação.',
              tags: ['Multi-produto', 'Tanques', 'Segregação'],
            },
            {
              icon: Clock,
              cor: '#ec4899',
              titulo: 'Janelas de Ressuprimento',
              desc: 'Respeito obrigatório às janelas de ressuprimento por porto. Fracionamento de demandas quando o volume excede capacidade. Controle de intervalo mínimo entre viagens.',
              tags: ['Janelas', 'Fracionamento', 'Programação'],
            },
            {
              icon: Settings,
              cor: '#06b6d4',
              titulo: 'Modelo 100% Customizável',
              desc: 'No plano Enterprise, o modelo é adaptado à sua operação: pesos de otimização, restrições de calado, produtos proprietários, integração com sistemas legados e pipeline multi-cloud personalizado (AWS, Azure, GCP, Oracle).',
              tags: ['Custom', 'Enterprise', 'API REST'],
            },
            {
              icon: Lock,
              cor: '#f97316',
              titulo: 'Isolamento Total por Empresa',
              desc: 'Arquitetura multitenant com isolamento completo. Cada empresa tem seus próprios dados, configurações, histórico e usuários. Nenhuma empresa acessa dados de outra.',
              tags: ['Multitenant', 'LGPD', 'Segurança'],
            },
            {
              icon: Users,
              cor: '#a3e635',
              titulo: 'Controle de Usuários por Empresa',
              desc: 'Adicione múltiplos usuários com roles (Admin, Analista, Viewer). Cada usuário tem acesso apenas aos dados de sua empresa. Logs de auditoria por ação.',
              tags: ['RBAC', 'Auditoria', 'Multi-user'],
            },
            {
              icon: Code2,
              cor: '#e879f9',
              titulo: 'Multi-Cloud & API',
              desc: 'Conecte com AWS S3, Azure Blob Storage, Google Cloud Storage ou Oracle OCI. Saída em JSON API type 4. Webhooks e SDK disponíveis no plano Enterprise. Sem lock-in de fornecedor.',
              tags: ['AWS', 'Azure', 'GCP', 'Oracle', 'API'],
            },
          ].map((f, i) => (
            <div key={i} className="group p-6 rounded-2xl border border-slate-800/50 bg-slate-900/30 hover:border-slate-700/70 hover:bg-slate-900/60 transition-all duration-300">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl shrink-0" style={{ background: `${f.cor}18`, border: `1px solid ${f.cor}30` }}>
                  <f.icon className="w-5 h-5" style={{ color: f.cor }} />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1.5 group-hover:text-blue-300 transition-colors">{f.titulo}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-3">{f.desc}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {f.tags.map(t => (
                      <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                        style={{ background: `${f.cor}15`, color: f.cor, border: `1px solid ${f.cor}25` }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SEÇÃO COMBUSTÍVEL — destaque especial
      ══════════════════════════════════════════════════════ */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/40 via-slate-950 to-slate-950" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 gap-1.5">
              <Fuel className="w-3 h-3" /> Economia de Combustível
            </Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-white leading-tight">
              Menos bunker.<br />
              <span className="text-emerald-400">Mais eficiência.</span><br />
              Rota a rota.
            </h2>
            <p className="text-slate-300 leading-relaxed">
              O algoritmo considera o consumo específico de cada navio nas velocidades ECO, NORMAL e RÁPIDO.
              Ao consolidar múltiplos portos em uma única viagem e ajustar a velocidade de cruzeiro,
              reduzimos o bunker consumido por tonelada transportada.
            </p>
            <div className="space-y-3">
              {[
                { label: 'Agrupamento inteligente de demandas por rota', pct: 92 },
                { label: 'Ajuste de velocidade por trecho (ECO vs NORMAL)', pct: 78 },
                { label: 'Eliminação de viagens desnecessárias', pct: 85 },
                { label: 'Otimização de calado e ocupação de carga', pct: 87 },
              ].map(({ label, pct }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">{label}</span>
                    <span className="text-emerald-400 font-mono font-bold">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {/* Card visual de economia */}
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-6">
              <div className="flex items-center gap-2 mb-5">
                <TrendingDown className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-white">Comparativo mensal — exemplo real</span>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Planejamento manual (Excel)', custo: 380000, cor: '#ef4444', pct: 100 },
                  { label: 'Cenário Conservador', custo: 320000, cor: '#f59e0b', pct: 84 },
                  { label: 'Cenário Base', custo: 298000, cor: '#3b82f6', pct: 78 },
                  { label: 'Cenário Otimista', custo: 284000, cor: '#34d399', pct: 75 },
                ].map(({ label, custo, cor, pct }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">{label}</span>
                      <span className="font-mono font-bold" style={{ color: cor }}>
                        USD {(custo / 1000).toFixed(0)}K
                      </span>
                    </div>
                    <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: cor, opacity: 0.85 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700/50 flex justify-between items-center">
                <span className="text-sm text-slate-400">Economia com Cenário Otimista:</span>
                <span className="text-xl font-black text-emerald-400 font-mono">USD 96K/mês</span>
              </div>
            </div>

            {/* CO2 */}
            <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <Wind className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-white">22% menos CO₂</div>
                <div className="text-sm text-slate-400">por tonelada·milha náutica transportada</div>
                <div className="text-xs text-blue-300/70 mt-0.5">Contribuição ambiental direta da otimização de rota</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          TECNOLOGIA
      ══════════════════════════════════════════════════════ */}
      <section id="tecnologia" className="py-20 border-y border-slate-800/50 bg-slate-900/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="border-purple-500/30 text-purple-400 mb-4">Tecnologia</Badge>
            <h2 className="text-3xl font-bold text-white">Stack de produção</h2>
            <p className="text-slate-400 mt-2">Tecnologia validada em ambiente real. Modelo adaptável sob demanda.</p>
          </div>

          {/* ─── Bloco Multi-Cloud ─────────────────────────────────── */}
          <div className="mb-8 p-6 rounded-2xl border border-slate-700/40 bg-slate-900/50">
            <div className="flex items-center gap-2 mb-5">
              <Globe className="w-5 h-5 text-blue-400" />
              <span className="font-semibold text-white">Compatível com qualquer provedor de cloud</span>
              <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400 ml-1">Sem lock-in</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  nome: 'Amazon Web Services',
                  sigla: 'AWS',
                  servico: 'S3 · Glue · Athena · Lambda',
                  cor: '#FF9900',
                  bg: '#FF990015',
                  icon: '☁',
                },
                {
                  nome: 'Microsoft Azure',
                  sigla: 'Azure',
                  servico: 'Blob Storage · Databricks · Data Factory',
                  cor: '#0078D4',
                  bg: '#0078D415',
                  icon: '☁',
                },
                {
                  nome: 'Google Cloud',
                  sigla: 'GCP',
                  servico: 'Cloud Storage · BigQuery · Dataflow',
                  cor: '#4285F4',
                  bg: '#4285F415',
                  icon: '☁',
                },
                {
                  nome: 'Oracle Cloud',
                  sigla: 'OCI',
                  servico: 'Object Storage · Data Integration',
                  cor: '#F80000',
                  bg: '#F8000015',
                  icon: '☁',
                },
              ].map(c => (
                <div key={c.sigla} className="p-4 rounded-xl border transition-all hover:scale-[1.02]"
                  style={{ borderColor: `${c.cor}30`, background: c.bg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black"
                      style={{ background: `${c.cor}20`, color: c.cor }}>
                      {c.sigla.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-white">{c.sigla}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 font-medium leading-tight">{c.nome}</div>
                  <div className="text-[10px] text-slate-500 mt-1 leading-tight">{c.servico}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-4 text-center">
              O payload é lido do bucket/container configurado e os resultados retornam via API REST ou webhook para seu pipeline existente.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { nome: 'Algoritmo Inteligente', desc: 'Heurística multi-objetivo com 4 cenários', cor: '#3b82f6' },
              { nome: 'Multi-Cloud Storage', desc: 'AWS S3 · Azure Blob · GCP · Oracle OCI', cor: '#0078d4' },
              { nome: 'API type 4 (JSON)', desc: 'Saída metaheurística compatível', cor: '#10b981' },
              { nome: 'React + Vite', desc: 'Interface rápida e responsiva', cor: '#61dafb' },
              { nome: 'Multitenant SaaS', desc: 'Isolamento completo por empresa', cor: '#8b5cf6' },
              { nome: 'Zustand State', desc: 'Store persistente por tenant', cor: '#f59e0b' },
              { nome: 'TypeScript', desc: 'Tipagem estrita em todo o modelo', cor: '#3178c6' },
              { nome: 'Tailwind CSS v4', desc: 'UI moderna e customizável', cor: '#38bdf8' },
            ].map(t => (
              <div key={t.nome} className="p-4 rounded-xl border border-slate-800/60 bg-slate-900/40 hover:border-slate-700/70 transition-colors">
                <div className="w-2 h-2 rounded-full mb-2" style={{ background: t.cor }} />
                <div className="font-semibold text-sm text-white">{t.nome}</div>
                <div className="text-xs text-slate-400 mt-1">{t.desc}</div>
              </div>
            ))}
          </div>

          {/* Customização */}
          <div className="mt-12 p-8 rounded-2xl border border-dashed border-purple-500/30 bg-purple-950/10 text-center">
            <Code2 className="w-8 h-8 text-purple-400 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">Modelo 100% customizável no Enterprise</h3>
            <p className="text-slate-300 max-w-2xl mx-auto text-sm leading-relaxed">
              No plano Enterprise, nossa equipe adapta os parâmetros do algoritmo à sua operação específica:
              pesos de custo, restrições de produto, velocidades por rota, integração com seu sistema TMS/ERP,
              e pipeline multi-cloud personalizado (AWS S3, Azure Blob, GCP Storage, Oracle OCI) com qualquer orquestrador de dados.
            </p>
            <Button className="mt-5 bg-purple-600 hover:bg-purple-700 gap-2" onClick={() => navigate(ROUTE_PATHS.AUTH)}>
              Falar com especialista <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          PLANOS
      ══════════════════════════════════════════════════════ */}
      <section id="planos" className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 mb-4">Planos e Preços</Badge>
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Escolha o plano certo para sua operação
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Todos os planos incluem 14 dias grátis. Pague somente pelo que usar.
            Upgrades instantâneos. Isolamento total de dados por empresa.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <CardPlano planoId="STARTER" />
          <CardPlano planoId="PROFISSIONAL" destaque />
          <CardPlano planoId="ENTERPRISE" />
        </div>

        {/* Custom */}
        <div className="p-8 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-950/30 to-slate-900/80 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Star className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white">Plano Custom</h3>
                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs">Sob medida</Badge>
              </div>
              <p className="text-slate-400 text-sm mt-1">
                Otimizações ilimitadas · Modelo personalizado · Integração com seus sistemas · SLA 1h · Treinamento dedicado · SDK proprietário
              </p>
            </div>
          </div>
          <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 gap-2 shrink-0 px-8"
            onClick={() => navigate(ROUTE_PATHS.AUTH)}>
            Solicitar proposta <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CTA FINAL
      ══════════════════════════════════════════════════════ */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1494412651409-8963ce7935a7?w=1920&q=80&auto=format&fit=crop"
            alt="Porto com navios de carga"
            className="w-full h-full object-cover opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center space-y-6">
          <div className="flex justify-center gap-3 mb-4">
            <Anchor className="w-8 h-8 text-blue-400" />
            <Waves className="w-8 h-8 text-cyan-400" />
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-white leading-tight">
            Pronto para otimizar<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              sua cabotagem?
            </span>
          </h2>
          <p className="text-xl text-slate-300">
            Comece gratuitamente. Configure em minutos. Resultados no primeiro dia.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 gap-2 text-lg px-10 py-6 shadow-xl shadow-blue-500/25"
              onClick={() => navigate(ROUTE_PATHS.AUTH)}>
              Criar conta grátis <ArrowRight className="w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" className="border-slate-500 text-slate-200 hover:bg-slate-800 gap-2 text-lg px-10 py-6"
              onClick={() => navigate(ROUTE_PATHS.AUTH)}>
              Acessar plataforma
            </Button>
          </div>
          <p className="text-slate-500 text-sm">14 dias grátis · Cancele quando quiser · LGPD compliant</p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════ */}
      <footer className="border-t border-slate-800/50 py-10 bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-slate-500 text-sm">
          <div className="flex items-center gap-2">
            <Anchor className="w-4 h-4 text-blue-500/50" />
            <span className="font-mono">CabotagemOpt v2.0 · Multitenant SaaS · 2026</span>
          </div>
          <div className="flex gap-6">
            {['Planos', 'Privacidade', 'Termos', 'Suporte'].map(l => (
              <a key={l} href="#" className="hover:text-slate-300 transition-colors">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Todos os sistemas operacionais</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
