/**
 * TideCalendar — visualizador de janelas de maré por porto/dia
 * Exibe: curva de maré SVG · janelas de navegação · calado disponível · alertas
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Waves, AlertTriangle, CheckCircle, Clock, ChevronLeft, ChevronRight, Anchor } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  preverMareHarmonico, calcularJanelasNavegacao, calcularCaladoDisponivel,
  PORTOS_MARE,
} from '@/lib/tideEngine';
import type { PontoMare, JanelaMare } from '@/lib/types';

interface TideCalendarProps {
  portoId: string;
  caladoNavio: number;
  dataInicio: Date;
  dias?: number;
  margemSeg?: number;
  margemMet?: number;
  className?: string;
}

// ─── Paleta por status ───────────────────────────────────────────────────────
const STATUS_COR = {
  ok:       { bg: 'bg-success/15', border: 'border-success/30', text: 'text-success', dot: '#22c55e' },
  restrito: { bg: 'bg-warning/15', border: 'border-warning/30', text: 'text-warning', dot: '#f59e0b' },
  bloq:     { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', dot: '#ef4444' },
};

// ─── Mini curva de maré SVG (24h) ────────────────────────────────────────────
function CurvaMare({
  pontos, janelas, caladoNavio, prof, margemSeg, margemMet, data,
}: {
  pontos: PontoMare[]; janelas: JanelaMare[];
  caladoNavio: number; prof: number; margemSeg: number; margemMet: number; data: string;
}) {
  const W = 320, H = 80;

  const pts24 = pontos.filter(p => p.dt.startsWith(data));
  if (pts24.length < 2) return <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>;

  const alturas = pts24.map(p => p.altura_m);
  const minH = Math.min(...alturas);
  const maxH = Math.max(...alturas);
  const rng = maxH - minH || 1;

  // Escala
  const xOf = (i: number) => (i / (pts24.length - 1)) * W;
  const yOf = (h: number) => H - 4 - ((h - minH) / rng) * (H - 16);

  // Linha SVG
  const path = pts24
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.altura_m).toFixed(1)}`)
    .join(' ');

  // Calado disponível mínimo como linha horizontal
  const caladoMinParaNavio = caladoNavio + margemSeg + margemMet - prof;
  const yCalado = yOf(caladoMinParaNavio);

  // Janelas coloridas do dia
  const janelasDia = janelas.filter(j => j.data === data);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* Janelas viáveis (fundo verde) */}
      {janelasDia.map((j, i) => {
        const inicio = new Date(j.inicio);
        const fim    = new Date(j.fim);
        const x1 = (inicio.getUTCHours() * 60 + inicio.getUTCMinutes()) / (24 * 60) * W;
        const x2 = (fim.getUTCHours() * 60 + fim.getUTCMinutes()) / (24 * 60) * W;
        return <rect key={i} x={x1} y={0} width={x2 - x1} height={H}
          fill="#22c55e14" stroke="#22c55e30" strokeWidth={0.5} rx={2} />;
      })}

      {/* Área sob a curva */}
      <path
        d={`${path} L${W},${H} L0,${H} Z`}
        fill="url(#tideGrad)" opacity={0.25}
      />
      <defs>
        <linearGradient id="tideGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#3b82f600" />
        </linearGradient>
      </defs>

      {/* Linha de calado mínimo */}
      <line x1={0} y1={yCalado} x2={W} y2={yCalado}
        stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
      <text x={W - 2} y={yCalado - 2} fontSize={7} fill="#ef4444" textAnchor="end">
        calado {caladoNavio}m
      </text>

      {/* Curva principal */}
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" />

      {/* Marcadores preamar/baixamar */}
      {pts24.filter((_, i) => i > 0 && i < pts24.length - 1).map((p, i) => {
        const prev = alturas[i];
        const next = alturas[i + 2];
        const isPeak = p.altura_m > prev && p.altura_m > next;
        const isVal  = p.altura_m < prev && p.altura_m < next;
        if (!isPeak && !isVal) return null;
        return (
          <g key={i}>
            <circle cx={xOf(i + 1)} cy={yOf(p.altura_m)} r={3}
              fill={isPeak ? '#22c55e' : '#f59e0b'} />
            <text x={xOf(i + 1)} y={yOf(p.altura_m) + (isPeak ? -5 : 10)}
              fontSize={7} fill={isPeak ? '#22c55e' : '#f59e0b'} textAnchor="middle">
              {p.altura_m.toFixed(1)}m
            </text>
          </g>
        );
      })}

      {/* Escala de horas */}
      {[0, 6, 12, 18, 24].map(h => (
        <g key={h}>
          <line x1={(h / 24) * W} y1={H - 4} x2={(h / 24) * W} y2={H}
            stroke="#ffffff30" strokeWidth={0.5} />
          {h < 24 && (
            <text x={(h / 24) * W + 2} y={H - 1} fontSize={7} fill="#ffffff50">
              {String(h).padStart(2, '0')}h
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export function TideCalendar({
  portoId, caladoNavio, dataInicio, dias = 7,
  margemSeg = 0.50, margemMet = 0.50, className,
}: TideCalendarProps) {
  const [pontos, setPontos] = useState<PontoMare[]>([]);
  const [janelas, setJanelas] = useState<JanelaMare[]>([]);
  const [diaAtivo, setDiaAtivo] = useState(0);
  const [carregando, setCarregando] = useState(true);

  const porto = PORTOS_MARE[portoId];
  const prof = porto?.profundidade_m ?? 12.0;

  useEffect(() => {
    setCarregando(true);
    // Geração síncrona — harmônico local
    const pts = preverMareHarmonico(portoId, dataInicio, dias);
    const jans = calcularJanelasNavegacao(portoId, caladoNavio, pts, margemSeg, margemMet);
    setPontos(pts);
    setJanelas(jans);
    setCarregando(false);
  }, [portoId, caladoNavio, dataInicio.toISOString(), dias, margemSeg, margemMet]);

  const diasArray = useMemo(() =>
    Array.from({ length: dias }, (_, i) => {
      const d = new Date(dataInicio.getTime() + i * 86_400_000);
      return d.toISOString().slice(0, 10);
    }),
    [dataInicio, dias]
  );

  const dataAtiva = diasArray[diaAtivo];

  const janelasDia = useMemo(
    () => janelas.filter(j => j.data === dataAtiva),
    [janelas, dataAtiva]
  );

  const maiorCalado = janelasDia.length
    ? Math.max(...janelasDia.map(j => j.calado_max_disponivel_m))
    : calcularCaladoDisponivel(1.0, prof, margemSeg, margemMet);

  const statusDia = (data: string): 'ok' | 'restrito' | 'bloq' => {
    const jans = janelas.filter(j => j.data === data);
    if (!jans.length) return 'bloq';
    const hViavel = jans.reduce((s, j) => s + j.duracao_horas, 0);
    return hViavel >= 4 ? 'ok' : 'restrito';
  };

  if (!porto) return (
    <Card className={className}>
      <CardContent className="p-4 text-sm text-muted-foreground">
        Porto {portoId} não encontrado na base de dados de maré.
      </CardContent>
    </Card>
  );

  return (
    <Card className={cn('border-border bg-card', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Waves className="w-4 h-4 text-blue-400" />
          Previsão de Marés — {porto.nome}
          <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 ml-1">
            {porto.amplitude_media_m}m amplitude
          </Badge>
          {porto.restricao_noturna && (
            <Badge variant="outline" className="text-[10px] border-warning/30 text-warning ml-1">
              🌙 Restrição noturna
            </Badge>
          )}
        </CardTitle>
        <div className="text-xs text-muted-foreground mt-0.5">
          Calado do navio: <strong>{caladoNavio}m</strong> ·
          Profundidade canal: <strong>{prof}m</strong> ·
          Margem segurança: <strong>{margemSeg}m</strong> ·
          Margem meteorológica: <strong>{margemMet}m</strong>
          <span className="ml-2 text-blue-400">(planejamento 2 meses à frente)</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {carregando ? (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            <div className="w-5 h-5 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin mr-2" />
            Calculando previsão harmônica...
          </div>
        ) : (
          <>
            {/* ── Calendário de dias ──────────────────────────────── */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                onClick={() => setDiaAtivo(d => Math.max(0, d - 1))}
                disabled={diaAtivo === 0}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(dias, 7)}, 1fr)` }}>
                {diasArray.slice(0, 7).map((data, i) => {
                  const st = statusDia(data);
                  const cor = STATUS_COR[st];
                  const ativo = i === diaAtivo;
                  return (
                    <button key={data} onClick={() => setDiaAtivo(i)}
                      className={cn(
                        'flex flex-col items-center p-1.5 rounded-lg text-[10px] border transition-all',
                        ativo ? `${cor.bg} ${cor.border} font-bold` : 'border-border hover:border-primary/30 hover:bg-muted/30'
                      )}>
                      <span className="text-muted-foreground">
                        {new Date(data + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase()}
                      </span>
                      <span className={cn('font-mono font-bold', ativo ? cor.text : 'text-foreground')}>
                        {data.slice(8)}
                      </span>
                      <div className="w-2 h-2 rounded-full mt-0.5" style={{ background: cor.dot }} />
                    </button>
                  );
                })}
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                onClick={() => setDiaAtivo(d => Math.min(dias - 1, d + 1))}
                disabled={diaAtivo === dias - 1}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* ── Curva de maré do dia ────────────────────────────── */}
            <div className="rounded-xl border border-border bg-muted/10 p-3">
              <div className="text-xs text-muted-foreground mb-2 font-mono">
                {new Date(dataAtiva + 'T12:00:00Z').toLocaleDateString('pt-BR', {
                  weekday: 'long', day: '2-digit', month: 'long',
                })}
              </div>
              <CurvaMare
                pontos={pontos} janelas={janelas} caladoNavio={caladoNavio}
                prof={prof} margemSeg={margemSeg} margemMet={margemMet} data={dataAtiva}
              />
              <div className="flex items-center gap-3 mt-2 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-1.5 rounded-full bg-blue-400 inline-block" /> Altura maré
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0 border-t border-dashed border-red-400 inline-block" /> Calado mínimo navio
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-success/20 border border-success/30 inline-block" /> Janela viável
                </span>
              </div>
            </div>

            {/* ── Janelas do dia ──────────────────────────────────── */}
            {janelasDia.length === 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Nenhuma janela de navegação viável neste dia para calado {caladoNavio}m.
                  Profundidade disponível máxima:{' '}
                  <strong>{calcularCaladoDisponivel(
                    Math.max(...pontos.filter(p => p.dt.startsWith(dataAtiva)).map(p => p.altura_m), 0),
                    prof, margemSeg, margemMet
                  ).toFixed(2)}m</strong>
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-mono">
                  {janelasDia.length} janela(s) — calado máx disponível:{' '}
                  <strong className="text-success">{maiorCalado.toFixed(2)}m</strong>
                </div>
                {janelasDia.map((j, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-success/20 bg-success/5">
                    <CheckCircle className="w-4 h-4 text-success shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm font-mono">
                        <span className="text-success font-bold">
                          {new Date(j.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                          {' – '}
                          {new Date(j.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                        </span>
                        <Badge variant="outline" className="text-[10px] border-success/30 text-success px-1.5 py-0">
                          {j.duracao_horas}h
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Maré: {j.altura_mare_min_m.toFixed(2)}m – {j.altura_mare_max_m.toFixed(2)}m ·
                        Calado máx: <strong>{j.calado_max_disponivel_m.toFixed(2)}m</strong>
                      </div>
                    </div>
                    <Anchor className="w-3.5 h-3.5 text-success/50" />
                  </div>
                ))}
              </div>
            )}

            {/* ── Resumo 7 dias ──────────────────────────────────── */}
            <div className="pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2">Resumo 7 dias:</div>
              <div className="flex gap-3 flex-wrap">
                {['ok', 'restrito', 'bloq'].map(st => {
                  const count = diasArray.filter(d => statusDia(d) === st).length;
                  const cor = STATUS_COR[st as keyof typeof STATUS_COR];
                  const label = { ok: 'Viável', restrito: 'Restrito', bloq: 'Bloqueado' }[st];
                  return (
                    <div key={st} className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border', cor.bg, cor.border, cor.text)}>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: cor.dot }} />
                      {count} {label}
                    </div>
                  );
                })}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border border-blue-500/20 bg-blue-500/5 text-blue-400">
                  <Clock className="w-3 h-3" />
                  {janelas.reduce((s, j) => s + j.duracao_horas, 0).toFixed(0)}h totais viáveis
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
