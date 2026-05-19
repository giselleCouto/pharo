import { useState, useMemo } from 'react';
import { useOtimizadorStore } from '@/hooks/useOtimizador';
import { TipoCenario, CenarioOtimizacao, Viagem } from '@/lib/types';
import { TideCalendar } from '@/components/TideCalendar';
import { PORTOS_MARE } from '@/lib/tideEngine';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  BarChart3, Download, Ship, MapPin, Package, TrendingDown,
  CheckCircle, Star, Navigation, Clock, Anchor, Copy, Check
} from 'lucide-react';
import { cn, formatarUsd, formatarBrl, formatarCbm, formatarPct, formatarNm, formatarData } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { gerarJsonSaida } from '@/lib/optimizer';
import GanttChart from '@/components/GanttChart';

// ─── Mapa SVG de Rotas ─────────────────────────────────────────
function MapaRotas({ cenario, portos }: { cenario: CenarioOtimizacao; portos: Array<{ id: string; nome: string; latitude: number; longitude: number }> }) {
  const minLat = Math.min(...portos.map(p => p.latitude));
  const maxLat = Math.max(...portos.map(p => p.latitude));
  const minLng = Math.min(...portos.map(p => p.longitude));
  const maxLng = Math.max(...portos.map(p => p.longitude));
  const padLat = (maxLat - minLat) * 0.2;
  const padLng = (maxLng - minLng) * 0.2;

  const toX = (lng: number) => ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * 560 + 20;
  const toY = (lat: number) => (1 - (lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * 280 + 20;

  const cores = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-border bg-slate-950/80">
      <div className="absolute inset-0 opacity-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="absolute border-t border-white/20" style={{ top: `${i * 10}%`, width: '100%' }} />
        ))}
      </div>
      <svg viewBox="0 0 600 320" className="w-full" style={{ minHeight: 200 }}>
        {/* Grid oceano */}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 40 + 20} x2="600" y2={i * 40 + 20} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 50 + 25} y1="0" x2={i * 50 + 25} y2="320" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}

        {/* Rotas das viagens */}
        {cenario.viagens.map((viagem, vi) => {
          const cor = cores[vi % cores.length];
          const portoOri = portos.find(p => p.id === cenario.viagens[vi]?.paradas[0]?.porto_id)
            || portos.find(p => p.id === useOtimizadorStore.getState().configuracao.premissas.porto_origem_id);

          if (!portoOri) return null;

          const paradas = viagem.paradas;
          const pontos = [
            { id: useOtimizadorStore.getState().configuracao.premissas.porto_origem_id, ...portos.find(p => p.id === useOtimizadorStore.getState().configuracao.premissas.porto_origem_id)! },
            ...paradas.map(p => ({ id: p.porto_id, ...portos.find(pt => pt.id === p.porto_id)! })),
            { id: useOtimizadorStore.getState().configuracao.premissas.porto_origem_id, ...portos.find(p => p.id === useOtimizadorStore.getState().configuracao.premissas.porto_origem_id)! },
          ].filter(p => p.latitude !== undefined);

          return pontos.slice(1).map((ponto, pi) => {
            const prev = pontos[pi];
            if (!prev || !ponto.latitude) return null;
            const x1 = toX(prev.longitude);
            const y1 = toY(prev.latitude);
            const x2 = toX(ponto.longitude);
            const y2 = toY(ponto.latitude);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2 - 20;
            return (
              <path
                key={`${vi}-${pi}`}
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                stroke={cor}
                strokeWidth="1.5"
                strokeOpacity="0.7"
                fill="none"
                strokeDasharray="4 2"
              />
            );
          });
        })}

        {/* Portos */}
        {portos.map((porto) => {
          const x = toX(porto.longitude);
          const y = toY(porto.latitude);
          const isOrigem = porto.id === useOtimizadorStore.getState().configuracao.premissas.porto_origem_id;
          const visitado = cenario.viagens.some(v => v.paradas.some(p => p.porto_id === porto.id));

          return (
            <g key={porto.id}>
              <circle cx={x} cy={y} r={isOrigem ? 8 : 5} fill={isOrigem ? '#3b82f6' : visitado ? '#10b981' : '#64748b'} opacity="0.9" />
              {isOrigem && <circle cx={x} cy={y} r={12} fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.4" />}
              <text x={x + 10} y={y + 4} fontSize="9" fill="#94a3b8" fontFamily="monospace">{porto.id}</text>
            </g>
          );
        })}
      </svg>
      <div className="px-3 pb-2 flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> Porto Base</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" /> Porto Visitado</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" /> Sem visita</span>
      </div>
    </div>
  );
}

// ─── Card de Métricas do Cenário ───────────────────────────────
function CardCenario({ cenario, selecionado, onSelect, recomendado }: {
  cenario: CenarioOtimizacao;
  selecionado: boolean;
  onSelect: () => void;
  recomendado: boolean;
}) {
  const INFO: Record<TipoCenario, string> = {
    OTIMISTA: '🚀', BASE: '⚖️', CONSERVADOR: '🛡️', CUSTO_MINIMO: '💰',
  };

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 rounded-xl border transition-all duration-200',
        selecionado
          ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
          : 'border-border bg-card hover:border-primary/30 hover:bg-card/80'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{INFO[cenario.tipo]}</span>
          <div>
            <div className="font-semibold text-sm">{cenario.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {recomendado && (
            <Star className="w-3.5 h-3.5 text-warning fill-warning" />
          )}
          {selecionado && <CheckCircle className="w-4 h-4 text-primary" />}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Custo Total</div>
          <div className="font-mono font-bold text-primary">{formatarUsd(cenario.metricas.custo_total_usd)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Demanda Atendida</div>
          <div className="font-mono font-bold text-success">{formatarPct(cenario.metricas.demanda_atendida_pct)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Viagens</div>
          <div className="font-mono font-bold">{cenario.metricas.total_viagens}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Ocupação Média</div>
          <div className="font-mono font-bold">{formatarPct(cenario.metricas.ocupacao_media_pct)}</div>
        </div>
      </div>
    </button>
  );
}

// ─── Tabela de Viagens ─────────────────────────────────────────
function TabelaViagens({ viagens }: { viagens: Viagem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {viagens.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhuma viagem neste cenário
        </div>
      )}
      {viagens.map((viagem) => (
        <div key={viagem.id} className="rounded-lg border border-border bg-muted/20 overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === viagem.id ? null : viagem.id)}
            className="w-full p-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Badge variant="outline" className={cn(
                'text-[10px] font-mono flex-shrink-0',
                viagem.tipo_navio === 'TC' ? 'border-primary/40 text-primary' : 'border-accent/40 text-accent'
              )}>
                {viagem.tipo_navio}
              </Badge>
              <div className="font-medium text-sm truncate">{viagem.navio_nome}</div>
              <div className="text-xs text-muted-foreground font-mono">{viagem.id}</div>
            </div>
            <div className="flex items-center gap-4 text-xs flex-shrink-0">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="font-mono">{formatarData(viagem.data_partida)} → {formatarData(viagem.data_retorno)}</span>
                <span>({viagem.duracao_dias}d)</span>
              </div>
              <div className="flex items-center gap-1">
                <Package className="w-3 h-3 text-success" />
                <span className="font-mono text-success">{viagem.volume_total_cbm.toLocaleString('pt-BR')} CBM</span>
                <span className="text-muted-foreground">({formatarPct(viagem.ocupacao_pct)})</span>
              </div>
              <div className="font-mono font-bold text-primary">{formatarUsd(viagem.custos.custo_total_usd)}</div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="w-3 h-3" />
                <span>{viagem.paradas.length} porto{viagem.paradas.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </button>

          {expanded === viagem.id && (
            <div className="border-t border-border">
              <div className="p-4 grid grid-cols-3 gap-4">
                {/* Paradas */}
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground font-mono mb-2">ROTEIRO DE PARADAS</div>
                  <div className="space-y-2">
                    {viagem.paradas.map((parada, i) => (
                      <div key={i} className="flex items-start gap-3 text-xs">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold text-[10px]">
                          {parada.ordem}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{parada.porto_nome}</div>
                          <div className="text-muted-foreground">
                            {formatarData(parada.data_chegada)} → {formatarData(parada.data_saida)} ({parada.dias_operacao}d op.)
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-success font-mono">{parada.volume_entregue_cbm.toLocaleString('pt-BR')} CBM</span>
                            {parada.produtos.map((p, pi) => (
                              <Badge key={pi} variant="secondary" className="text-[9px] px-1.5 py-0">{p}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-muted-foreground font-mono text-[10px]">
                          {formatarUsd(parada.despesas_portuarias_usd)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Breakdown Custos */}
                <div>
                  <div className="text-xs text-muted-foreground font-mono mb-2">BREAKDOWN DE CUSTOS</div>
                  <div className="space-y-2">
                    {[
                      { label: 'TC / Charter', value: viagem.custos.custo_tc_diario_usd, color: 'text-primary' },
                      { label: 'Bunker', value: viagem.custos.custo_bunker_usd, color: 'text-warning' },
                      { label: 'Despesas Porto', value: viagem.custos.despesas_portuarias_usd, color: 'text-accent' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className={cn('text-xs font-mono font-bold', item.color)}>
                          {formatarUsd(item.value)}
                        </span>
                      </div>
                    ))}
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Total USD</span>
                      <span className="text-xs font-mono font-bold text-primary">{formatarUsd(viagem.custos.custo_total_usd)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Total BRL</span>
                      <span className="text-xs font-mono text-muted-foreground">{formatarBrl(viagem.custos.custo_total_brl)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Custo/CBM</span>
                      <span className="text-xs font-mono text-muted-foreground">{formatarUsd(viagem.custos.custo_por_cbm_usd)}</span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Distância</span>
                      <span className="text-xs font-mono">{formatarNm(viagem.distancia_total_nm)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Gráfico Comparativo ───────────────────────────────────────
function GraficoComparativo({ cenarios }: { cenarios: CenarioOtimizacao[] }) {
  const dados = cenarios.map((c) => ({
    nome: c.tipo === 'CUSTO_MINIMO' ? 'Custo Mín.' : c.tipo === 'CONSERVADOR' ? 'Conserv.' : c.tipo,
    'Custo (kUSD)': Math.round(c.metricas.custo_total_usd / 1000),
    'Demanda (%)': Math.round(c.metricas.demanda_atendida_pct),
    'Ocupação (%)': Math.round(c.metricas.ocupacao_media_pct),
    'Viagens': c.metricas.total_viagens,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={dados} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'monospace' }} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
          labelStyle={{ color: '#e2e8f0', fontWeight: 700 }}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
        <Bar dataKey="Custo (kUSD)" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Demanda (%)" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Ocupação (%)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Página Principal ──────────────────────────────────────────
export default function ResultadosPage() {
  const { resultado, configuracao, setCenarioSelecionado } = useOtimizadorStore();
  const [cenarioAtivo, setCenarioAtivo] = useState<TipoCenario | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cenarioEfetivo = cenarioAtivo || resultado?.cenario_recomendado || null;
  const cenarioSelecionado = resultado?.cenarios.find((c) => c.tipo === cenarioEfetivo);

  const handleCopiarJson = () => {
    if (!resultado) return;
    navigator.clipboard.writeText(gerarJsonSaida(resultado));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  if (!resultado) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="p-4 rounded-full bg-muted">
          <BarChart3 className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Nenhum resultado disponível</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Execute a otimização primeiro para ver os resultados.
          </p>
        </div>
      </div>
    );
  }

  const { cenarios, cenario_recomendado } = resultado;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Resultados da Otimização
          </h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            ID: {resultado.id} · {new Date(resultado.timestamp).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopiarJson} className="gap-2">
            {copiado ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            {copiado ? 'Copiado!' : 'Copiar JSON API'}
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Seletor de Cenários */}
      <div className="grid grid-cols-4 gap-3">
        {cenarios.map((cenario) => (
          <CardCenario
            key={cenario.tipo}
            cenario={cenario}
            selecionado={cenarioEfetivo === cenario.tipo}
            recomendado={cenario_recomendado === cenario.tipo}
            onSelect={() => {
              setCenarioAtivo(cenario.tipo);
              setCenarioSelecionado(cenario.tipo);
            }}
          />
        ))}
      </div>

      {/* Tabs de Detalhamento */}
      {cenarioSelecionado && (
        <Tabs defaultValue="viagens" className="space-y-4">
          <TabsList className="bg-muted border border-border">
            <TabsTrigger value="viagens" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Navigation className="w-4 h-4" /> Viagens ({cenarioSelecionado.viagens.length})
            </TabsTrigger>
            <TabsTrigger value="gantt" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="w-4 h-4" /> Gantt de Viagens
            </TabsTrigger>
            <TabsTrigger value="mapa" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MapPin className="w-4 h-4" /> Mapa de Rotas
            </TabsTrigger>
            <TabsTrigger value="custos" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <TrendingDown className="w-4 h-4" /> Análise de Custos
            </TabsTrigger>
            <TabsTrigger value="comparativo" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="w-4 h-4" /> Comparativo
            </TabsTrigger>
            <TabsTrigger value="mares" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <span>🌊</span> Marés & Calado
            </TabsTrigger>
          </TabsList>

          {/* ABA VIAGENS */}
          <TabsContent value="viagens">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{cenarioSelecionado.label}</CardTitle>
                    <CardDescription>{cenarioSelecionado.descricao}</CardDescription>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <div className="px-3 py-1.5 rounded-lg bg-muted border border-border font-mono">
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-bold text-primary">{formatarUsd(cenarioSelecionado.metricas.custo_total_usd)}</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-muted border border-border font-mono">
                      <span className="text-muted-foreground">Atendido: </span>
                      <span className="font-bold text-success">{formatarPct(cenarioSelecionado.metricas.demanda_atendida_pct)}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <TabelaViagens viagens={cenarioSelecionado.viagens} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA GANTT */}
          <TabsContent value="gantt">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Cronograma de Viagens — {cenarioSelecionado.label}
                </CardTitle>
                <CardDescription>
                  Clique em uma viagem para expandir as paradas. Passe o mouse nas barras para detalhes de data/hora e produtos.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <GanttChart
                  viagens={cenarioSelecionado.viagens}
                  titulo={`${cenarioSelecionado.label} — ${cenarioSelecionado.viagens.length} viagens`}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA MAPA */}
          <TabsContent value="mapa">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Mapa de Rotas — {cenarioSelecionado.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MapaRotas cenario={cenarioSelecionado} portos={configuracao.portos} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA CUSTOS */}
          <TabsContent value="custos">
            <div className="grid grid-cols-3 gap-4">
              {/* KPIs */}
              <div className="col-span-3 grid grid-cols-4 gap-4">
                {[
                  { label: 'Custo Total USD', value: formatarUsd(cenarioSelecionado.metricas.custo_total_usd), icon: TrendingDown, color: 'text-primary' },
                  { label: 'Custo Total BRL', value: formatarBrl(cenarioSelecionado.metricas.custo_total_brl), icon: TrendingDown, color: 'text-accent' },
                  { label: 'Custo/CBM', value: formatarUsd(cenarioSelecionado.metricas.custo_medio_por_cbm_usd), icon: Package, color: 'text-warning' },
                  { label: 'Vol. Entregue', value: formatarCbm(cenarioSelecionado.metricas.volume_total_entregue_cbm), icon: Ship, color: 'text-success' },
                ].map((kpi) => (
                  <Card key={kpi.label} className="border-border bg-card">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <kpi.icon className={cn('w-4 h-4', kpi.color)} />
                        <span className="text-xs text-muted-foreground">{kpi.label}</span>
                      </div>
                      <div className={cn('text-lg font-bold font-mono', kpi.color)}>{kpi.value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Breakdown por viagem */}
              <Card className="col-span-3 border-border bg-card">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm">Breakdown de Custos por Viagem</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {['Viagem', 'Navio', 'Tipo', 'TC/Charter', 'Bunker', 'Porto', 'Total USD', 'Custo/CBM'].map(h => (
                            <th key={h} className="pb-2 text-left text-muted-foreground font-mono pr-4">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cenarioSelecionado.viagens.map((v) => (
                          <tr key={v.id} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="py-2 font-mono text-primary pr-4">{v.id}</td>
                            <td className="py-2 pr-4 max-w-[120px] truncate">{v.navio_nome}</td>
                            <td className="py-2 pr-4">
                              <Badge variant="outline" className={cn('text-[10px]', v.tipo_navio === 'TC' ? 'text-primary border-primary/30' : 'text-accent border-accent/30')}>
                                {v.tipo_navio}
                              </Badge>
                            </td>
                            <td className="py-2 font-mono pr-4">{formatarUsd(v.custos.custo_tc_diario_usd)}</td>
                            <td className="py-2 font-mono text-warning pr-4">{formatarUsd(v.custos.custo_bunker_usd)}</td>
                            <td className="py-2 font-mono text-accent pr-4">{formatarUsd(v.custos.despesas_portuarias_usd)}</td>
                            <td className="py-2 font-mono font-bold text-primary pr-4">{formatarUsd(v.custos.custo_total_usd)}</td>
                            <td className="py-2 font-mono text-muted-foreground">{formatarUsd(v.custos.custo_por_cbm_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border font-bold">
                          <td colSpan={3} className="py-2 text-muted-foreground">TOTAL</td>
                          <td className="py-2 font-mono text-primary">
                            {formatarUsd(cenarioSelecionado.viagens.reduce((s, v) => s + v.custos.custo_tc_diario_usd, 0))}
                          </td>
                          <td className="py-2 font-mono text-warning">
                            {formatarUsd(cenarioSelecionado.viagens.reduce((s, v) => s + v.custos.custo_bunker_usd, 0))}
                          </td>
                          <td className="py-2 font-mono text-accent">
                            {formatarUsd(cenarioSelecionado.viagens.reduce((s, v) => s + v.custos.despesas_portuarias_usd, 0))}
                          </td>
                          <td className="py-2 font-mono text-primary">
                            {formatarUsd(cenarioSelecionado.metricas.custo_total_usd)}
                          </td>
                          <td className="py-2 font-mono text-muted-foreground">
                            {formatarUsd(cenarioSelecionado.metricas.custo_medio_por_cbm_usd)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ABA COMPARATIVO */}
          <TabsContent value="comparativo">
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm">Comparativo dos 4 Cenários</CardTitle>
                </CardHeader>
                <CardContent>
                  <GraficoComparativo cenarios={cenarios} />
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm">Tabela Comparativa</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground font-mono">
                        <th className="pb-2 text-left">Métrica</th>
                        {cenarios.map((c) => <th key={c.tipo} className="pb-2 text-right">{c.tipo === 'CUSTO_MINIMO' ? 'CUSTO' : c.tipo.slice(0, 5)}</th>)}
                      </tr>
                    </thead>
                    <tbody className="space-y-1">
                      {[
                        { label: 'Custo Total', key: (c: CenarioOtimizacao) => formatarUsd(c.metricas.custo_total_usd) },
                        { label: 'Demanda (%)', key: (c: CenarioOtimizacao) => formatarPct(c.metricas.demanda_atendida_pct) },
                        { label: 'Viagens', key: (c: CenarioOtimizacao) => c.metricas.total_viagens.toString() },
                        { label: 'Ocupação', key: (c: CenarioOtimizacao) => formatarPct(c.metricas.ocupacao_media_pct) },
                        { label: 'Custo/CBM', key: (c: CenarioOtimizacao) => formatarUsd(c.metricas.custo_medio_por_cbm_usd) },
                        { label: 'Vol. Entregue', key: (c: CenarioOtimizacao) => formatarCbm(c.metricas.volume_total_entregue_cbm) },
                        { label: 'Navios TC', key: (c: CenarioOtimizacao) => c.metricas.total_navios_tc_usados.toString() },
                        { label: 'Navios SPOT', key: (c: CenarioOtimizacao) => c.metricas.total_navios_spot_usados.toString() },
                        { label: 'Tempo (ms)', key: (c: CenarioOtimizacao) => c.metricas.tempo_execucao_ms + 'ms' },
                      ].map((row) => (
                        <tr key={row.label} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="py-1.5 text-muted-foreground">{row.label}</td>
                          {cenarios.map((c) => (
                            <td key={c.tipo} className={cn(
                              'py-1.5 text-right font-mono',
                              c.tipo === cenario_recomendado ? 'text-primary font-bold' : 'text-foreground'
                            )}>
                              {row.key(c)}
                              {c.tipo === cenario_recomendado && <span className="ml-1 text-warning">★</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ABA MARÉS */}
          <TabsContent value="mares">
            <MaresResultados
              viagens={cenarioSelecionado.viagens}
              configuracao={configuracao}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── MaresResultados ──────────────────────────────────────────────────────────
function MaresResultados({
  viagens,
  configuracao,
}: {
  viagens: { paradas: { porto_id: string; data_chegada: string }[] }[];
  configuracao: { portos: { id: string; nome: string; codigo: string; calado_max_metros: number }[]; premissas: { inicio_periodo?: string; margem_seguranca_mare_m?: number; margem_meteorologica_m?: number } };
}) {
  const portoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const v of viagens) for (const p of v.paradas) ids.add(p.porto_id);
    return Array.from(ids);
  }, [viagens]);

  const [portoSel, setPortoSel] = useState<string>(portoIds[0] ?? 'TEMADRE');

  // Calado máx do navio da viagem que visita esse porto
  const caladoPorPorto = useMemo(() => {
    const m: Record<string, number> = {};
    for (const porto of configuracao.portos) {
      m[porto.id] = porto.calado_max_metros ?? 14.0;
    }
    return m;
  }, [configuracao.portos]);

  const caladoNavio = caladoPorPorto[portoSel] ?? 14.0;

  const dataInicio = useMemo(() => {
    const str = configuracao.premissas?.inicio_periodo;
    const d = str ? new Date(str + 'T12:00:00Z') : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  }, [configuracao.premissas]);

  // Chegadas nesse porto (para marcar no calendário)
  const chegadasNoPorto = useMemo(() => {
    return viagens
      .flatMap(v => v.paradas.filter(p => p.porto_id === portoSel))
      .map(p => new Date(p.data_chegada));
  }, [viagens, portoSel]);

  return (
    <div className="space-y-4">
      {/* Seletor de porto */}
      <div className="flex gap-2 flex-wrap">
        {portoIds.map(id => {
          const porto = configuracao.portos.find(p => p.id === id);
          const temDados = !!PORTOS_MARE[id];
          return (
            <button key={id} onClick={() => setPortoSel(id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                id === portoSel
                  ? 'bg-primary/10 border-primary/30 text-primary font-bold'
                  : 'border-border hover:border-primary/30 text-muted-foreground'
              }`}>
              {porto?.codigo ?? id} {temDados ? '🌊' : '–'}
            </button>
          );
        })}
      </div>

      {PORTOS_MARE[portoSel] ? (
        <>
          <TideCalendar
            portoId={portoSel}
            caladoNavio={caladoNavio}
            dataInicio={dataInicio}
            dias={14}
            margemSeg={configuracao.premissas?.margem_seguranca_mare_m ?? 0.5}
            margemMet={configuracao.premissas?.margem_meteorologica_m ?? 0.5}
          />
          {chegadasNoPorto.length > 0 && (
            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-sm">
              <div className="font-medium mb-1.5 text-primary">
                🚢 Chegadas planejadas neste porto ({chegadasNoPorto.length}):
              </div>
              <div className="flex flex-wrap gap-2">
                {chegadasNoPorto.map((d, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-muted border border-border font-mono text-xs">
                    {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {' '}
                    {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-4 rounded-lg border border-warning/20 bg-warning/5 text-sm text-warning flex items-center gap-2">
          <span>⚠</span>
          Porto <strong>{portoSel}</strong> sem dados harmônicos.
          IDs compatíveis: TEMADRE, SUAPE, PECÉM, MUCURIPE, ITAQUI, SANTOS, PARANAGUÁ, ITAJAÍ, RIO_GRANDE.
        </div>
      )}
    </div>
  );
}
