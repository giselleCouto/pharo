import { useMemo, useState } from 'react';
import { Viagem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Ship, MapPin, Clock, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Helpers ────────────────────────────────────────────────────

function parseDT(s: string): Date {
  if (!s) return new Date();
  return new Date(s.length === 10 ? s + 'T08:00' : s);
}

function fmtDT(s: string): string {
  const d = parseDT(s);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtHoraSimples(s: string): string {
  return parseDT(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function daysDiff(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86400000;
}

// ─── Tooltip ────────────────────────────────────────────────────

interface TooltipData {
  label: string;
  tipo: 'TRECHO' | 'PARADA' | 'RETORNO';
  chegada?: string;
  saida?: string;
  porto?: string;
  volume?: number;
  produtos?: string[];
  nm?: number;
}

function GanttTooltip({ data, x, y }: { data: TooltipData; x: number; y: number }) {
  return (
    <foreignObject x={x + 10} y={Math.max(4, y - 60)} width={240} height={180} style={{ pointerEvents: 'none', overflow: 'visible' }}>
      <div className="p-3 rounded-lg border border-border bg-card shadow-xl text-xs leading-relaxed"
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        <div className="font-bold text-sm mb-2 flex items-center gap-1.5">
          {data.tipo === 'PARADA' && <MapPin className="w-3.5 h-3.5 text-warning" />}
          {data.tipo === 'TRECHO' && <Ship className="w-3.5 h-3.5 text-primary" />}
          {data.tipo === 'RETORNO' && <Ship className="w-3.5 h-3.5 text-muted-foreground" />}
          {data.label}
        </div>
        {data.chegada && (
          <div className="text-muted-foreground">
            <span className="text-foreground">↓ Chegada:</span> {fmtDT(data.chegada)}
          </div>
        )}
        {data.saida && (
          <div className="text-muted-foreground">
            <span className="text-foreground">↑ Saída:</span> {fmtDT(data.saida)}
          </div>
        )}
        {data.nm !== undefined && (
          <div className="text-muted-foreground">
            <span className="text-foreground">Distância:</span> {data.nm.toLocaleString('pt-BR')} NM
          </div>
        )}
        {data.volume !== undefined && (
          <div className="text-muted-foreground">
            <span className="text-foreground">Volume:</span> {data.volume.toLocaleString('pt-BR')} CBM
          </div>
        )}
        {data.produtos && data.produtos.length > 0 && (
          <div className="mt-1.5 border-t border-border pt-1.5">
            <div className="text-muted-foreground mb-0.5">Produtos:</div>
            {data.produtos.slice(0, 4).map((p) => (
              <div key={p} className="text-foreground truncate">• {p}</div>
            ))}
            {data.produtos.length > 4 && (
              <div className="text-muted-foreground">+{data.produtos.length - 4} mais</div>
            )}
          </div>
        )}
      </div>
    </foreignObject>
  );
}

// ─── Legenda ────────────────────────────────────────────────────

function Legenda() {
  const items = [
    { color: '#3b82f6', label: 'Trânsito carregado (TC)' },
    { color: '#22c55e', label: 'Operação no porto' },
    { color: '#f59e0b', label: 'Trânsito SPOT' },
    { color: '#6b7280', label: 'Retorno vazio' },
    { color: '#8b5cf6', label: 'Aguardando (intervalo)' },
  ];
  return (
    <div className="flex flex-wrap gap-3 mb-4 text-xs text-muted-foreground">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: it.color, opacity: 0.85 }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}

// ─── Linha de Escala de Datas ────────────────────────────────────

function EscalaData({ minDate, maxDate, labelW, totalW }: {
  minDate: Date; maxDate: Date; labelW: number; totalW: number;
}) {
  const totalDays = daysDiff(minDate, maxDate) || 1;
  const scale = totalW / totalDays;
  const marks: { day: Date; x: number }[] = [];

  const d = new Date(minDate);
  d.setDate(d.getDate() + 1);
  while (d <= maxDate) {
    const x = daysDiff(minDate, d) * scale;
    if (x < totalW) marks.push({ day: new Date(d), x });
    d.setDate(d.getDate() + 1);
  }

  return (
    <div className="flex text-[10px] text-muted-foreground mb-1 font-mono overflow-hidden" style={{ marginLeft: labelW }}>
      <div style={{ width: totalW, position: 'relative', height: 24 }}>
        {marks.map(({ day, x }, i) => {
          const label = day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          return (
            <div key={i} style={{ position: 'absolute', left: x, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
              <div className="w-px h-2 bg-border mx-auto mb-0.5" />
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── GanttBar (SVG por linha) ────────────────────────────────────

const CORES_TC = { transito: '#3b82f6', porto: '#22c55e', retorno: '#6b7280' };
const CORES_SPOT = { transito: '#f59e0b', porto: '#22c55e', retorno: '#6b7280' };

function GanttBarViagem({
  viagem, minDate, scale, height, onHover, hoveredId
}: {
  viagem: Viagem;
  minDate: Date;
  scale: number;
  height: number;
  onHover: (d: TooltipData | null, x: number, y: number) => void;
  hoveredId: string | null;
}) {
  const cores = viagem.tipo_navio === 'TC' ? CORES_TC : CORES_SPOT;
  const yMid = height / 2;
  const barH = Math.max(14, height * 0.55);
  const barY = yMid - barH / 2;
  const segments: React.ReactNode[] = [];

  const x0 = daysDiff(minDate, parseDT(viagem.data_partida)) * scale;

  let xCursor = x0;
  let portoAnterior: string | null = viagem.paradas.length > 0 ? null : null;
  let dtAnterior = viagem.data_partida;

  for (let i = 0; i < viagem.paradas.length; i++) {
    const p = viagem.paradas[i];
    const xChegada = daysDiff(minDate, parseDT(p.data_chegada)) * scale;
    const xSaida = daysDiff(minDate, parseDT(p.data_saida)) * scale;
    const wTransit = Math.max(1, xChegada - xCursor);
    const wPorto = Math.max(2, xSaida - xChegada);

    const tooltipTransit: TooltipData = {
      tipo: 'TRECHO',
      label: `Trânsito → ${p.porto_nome}`,
      chegada: dtAnterior,
      saida: p.data_chegada,
    };
    const tooltipPorto: TooltipData = {
      tipo: 'PARADA',
      label: p.porto_nome,
      chegada: p.data_chegada,
      saida: p.data_saida,
      volume: p.volume_entregue_cbm,
      produtos: p.produtos_detalhados?.map(pd => `${pd.nome} (${pd.volume_cbm} CBM)`) ?? p.produtos,
    };

    // Trecho de trânsito
    segments.push(
      <rect key={`tr${i}`}
        x={xCursor} y={barY} width={wTransit} height={barH}
        fill={cores.transito} rx={3} opacity={0.85}
        style={{ cursor: 'pointer' }}
        onMouseEnter={(e) => onHover(tooltipTransit, xCursor + wTransit / 2, barY)}
        onMouseLeave={() => onHover(null, 0, 0)}
      />
    );

    // Parada no porto
    segments.push(
      <rect key={`po${i}`}
        x={xChegada} y={barY - 3} width={wPorto} height={barH + 6}
        fill={cores.porto} rx={4} opacity={0.9}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => onHover(tooltipPorto, xChegada + wPorto / 2, barY - 3)}
        onMouseLeave={() => onHover(null, 0, 0)}
      />
    );

    // Rótulo do porto (se largo o suficiente)
    if (wPorto > 28) {
      segments.push(
        <text key={`lb${i}`}
          x={xChegada + wPorto / 2} y={barY + barH / 2 + 1}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={9} fill="white" fontWeight="600" style={{ pointerEvents: 'none' }}>
          {p.porto_nome.length > 6 ? p.porto_nome.slice(0, 5) + '…' : p.porto_nome}
        </text>
      );
    }

    xCursor = xSaida;
    dtAnterior = p.data_saida;
    portoAnterior = p.porto_id;
  }

  // Retorno
  const xRetorno = daysDiff(minDate, parseDT(viagem.data_retorno)) * scale;
  const wRetorno = Math.max(1, xRetorno - xCursor);
  segments.push(
    <rect key="ret"
      x={xCursor} y={barY} width={wRetorno} height={barH}
      fill={cores.retorno} rx={3} opacity={0.6}
      style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover({ tipo: 'RETORNO', label: 'Retorno ao porto base', chegada: dtAnterior, saida: viagem.data_retorno }, xCursor + wRetorno / 2, barY)}
      onMouseLeave={() => onHover(null, 0, 0)}
    />
  );

  // Ícone de navio no início
  segments.push(
    <text key="icon" x={x0} y={yMid} textAnchor="middle" dominantBaseline="middle" fontSize={12} style={{ pointerEvents: 'none' }}>
      🚢
    </text>
  );

  return <>{segments}</>;
}

// ─── GanttChart Principal ────────────────────────────────────────

interface GanttChartProps {
  viagens: Viagem[];
  titulo?: string;
}

export default function GanttChart({ viagens, titulo }: GanttChartProps) {
  const [tooltip, setTooltip] = useState<{ data: TooltipData; x: number; y: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<Set<string>>(new Set());

  const LABEL_W = 180;
  const ROW_H = 44;
  const BAR_H = ROW_H - 8;
  const CHART_W = 900;
  const BAR_W = CHART_W - LABEL_W;

  const { minDate, maxDate } = useMemo(() => {
    let min = new Date('2099-01-01');
    let max = new Date('2000-01-01');
    for (const v of viagens) {
      const p = parseDT(v.data_partida);
      const r = parseDT(v.data_retorno);
      if (p < min) min = p;
      if (r > max) max = r;
    }
    // Adiciona margem de 1 dia
    min.setDate(min.getDate() - 1);
    max.setDate(max.getDate() + 1);
    return { minDate: min, maxDate: max };
  }, [viagens]);

  const totalDays = Math.max(1, daysDiff(minDate, maxDate));
  const scale = BAR_W / totalDays;

  if (viagens.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Nenhuma viagem para exibir no Gantt
      </div>
    );
  }

  const totalH = viagens.length * ROW_H + 8;

  const toggleExpand = (id: string) => {
    setExpandida(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div>
      {titulo && (
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">{titulo}</h3>
          <Badge variant="outline" className="text-[10px] font-mono">{viagens.length} viagens</Badge>
        </div>
      )}
      <Legenda />

      {/* Escala datas */}
      <EscalaData minDate={minDate} maxDate={maxDate} labelW={LABEL_W} totalW={BAR_W} />

      {/* SVG Gantt */}
      <div className="overflow-x-auto rounded-lg border border-border bg-background/60">
        <svg
          width={CHART_W}
          height={totalH + 4}
          style={{ minWidth: CHART_W, display: 'block' }}
        >
          {/* Grid de dias */}
          {Array.from({ length: Math.ceil(totalDays) }, (_, i) => {
            const x = LABEL_W + i * scale;
            const d = new Date(minDate);
            d.setDate(d.getDate() + i);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <rect
                key={i}
                x={x}
                y={0}
                width={scale}
                height={totalH + 4}
                fill={isWeekend ? 'rgba(255,255,255,0.02)' : 'transparent'}
              />
            );
          })}

          {/* Linhas de separação horizontal */}
          {viagens.map((_, i) => (
            <line
              key={i}
              x1={0}
              y1={(i + 1) * ROW_H}
              x2={CHART_W}
              y2={(i + 1) * ROW_H}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.5}
            />
          ))}

          {/* Linha vertical "hoje" */}
          {(() => {
            const hoje = new Date();
            if (hoje >= minDate && hoje <= maxDate) {
              const x = LABEL_W + daysDiff(minDate, hoje) * scale;
              return (
                <>
                  <line x1={x} y1={0} x2={x} y2={totalH + 4} stroke="var(--destructive)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
                  <text x={x + 3} y={10} fontSize={9} fill="var(--destructive)" opacity={0.8} fontWeight="600">HOJE</text>
                </>
              );
            }
            return null;
          })()}

          {/* Rows */}
          {viagens.map((v, i) => {
            const y = i * ROW_H;
            const isExpanded = expandida.has(v.id);
            const tipoBadge = v.tipo_navio === 'TC' ? '#3b82f6' : '#f59e0b';

            return (
              <g key={v.id}>
                {/* Label */}
                <rect x={0} y={y} width={LABEL_W} height={ROW_H}
                  fill={i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'} />
                <foreignObject x={2} y={y + 2} width={LABEL_W - 4} height={ROW_H - 4}
                  style={{ overflow: 'visible' }}>
                  <div
                    className="flex items-center gap-1.5 h-full cursor-pointer select-none"
                    onClick={() => toggleExpand(v.id)}
                  >
                    <div style={{ width: 3, height: 24, backgroundColor: tipoBadge, borderRadius: 2, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-[11px] font-semibold truncate">
                        {isExpanded
                          ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                        <span className="font-mono text-primary">{v.id}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{v.navio_nome}</div>
                    </div>
                    <div className="text-[9px] font-mono px-1 py-0.5 rounded"
                      style={{ backgroundColor: tipoBadge + '25', color: tipoBadge, flexShrink: 0 }}>
                      {v.tipo_navio}
                    </div>
                  </div>
                </foreignObject>

                {/* Bar */}
                <g transform={`translate(${LABEL_W}, ${y})`}>
                  <GanttBarViagem
                    viagem={v}
                    minDate={minDate}
                    scale={scale}
                    height={ROW_H}
                    onHover={(d, x, y) => {
                      if (d) setTooltip({ data: d, x: LABEL_W + x, y: i * ROW_H + y });
                      else setTooltip(null);
                    }}
                    hoveredId={hoveredId}
                  />
                </g>

                {/* Expanded: paradas detail */}
                {isExpanded && (
                  <foreignObject x={LABEL_W + 4} y={y + 2} width={BAR_W - 8} height={ROW_H - 4}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}>
                    <div className="flex items-center gap-1 h-full text-[9px] text-muted-foreground font-mono">
                      {v.paradas.map((p, pi) => (
                        <span key={pi} className="whitespace-nowrap">
                          📍 {p.porto_nome}: {fmtDT(p.data_chegada)} – {fmtHoraSimples(p.data_saida)}
                          {pi < v.paradas.length - 1 && ' → '}
                        </span>
                      ))}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Tooltip */}
          {tooltip && (
            <GanttTooltip data={tooltip.data} x={tooltip.x} y={tooltip.y} />
          )}
        </svg>
      </div>

      {/* Tabela resumo abaixo */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Viagem</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Navio</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Tipo</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Partida</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Retorno</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Duração</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Portos</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Volume (CBM)</th>
            </tr>
          </thead>
          <tbody>
            {viagens.map((v, i) => (
              <>
                <tr key={v.id}
                  className={cn('border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer', expandida.has(v.id) && 'bg-muted/10')}
                  onClick={() => toggleExpand(v.id)}>
                  <td className="py-2 px-3 font-mono text-primary font-semibold">{v.id}</td>
                  <td className="py-2 px-3">{v.navio_nome}</td>
                  <td className="py-2 px-3">
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold',
                      v.tipo_navio === 'TC' ? 'bg-primary/15 text-primary' : 'bg-warning/15 text-warning')}>
                      {v.tipo_navio}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono">{fmtDT(v.data_partida)}</td>
                  <td className="py-2 px-3 font-mono">{fmtDT(v.data_retorno)}</td>
                  <td className="py-2 px-3 font-mono">{v.duracao_dias}d</td>
                  <td className="py-2 px-3">{v.paradas.length} porto{v.paradas.length !== 1 ? 's' : ''}</td>
                  <td className="py-2 px-3 font-mono">{v.volume_total_cbm.toLocaleString('pt-BR')}</td>
                </tr>
                {expandida.has(v.id) && v.paradas.map((p) => (
                  <tr key={`${v.id}-${p.porto_id}`} className="bg-muted/10 border-b border-border/30">
                    <td className="py-1.5 px-3 text-muted-foreground pl-6" colSpan={1}>↳ Parada {p.ordem}</td>
                    <td className="py-1.5 px-3 font-semibold" colSpan={2}>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5 text-warning" />
                        {p.porto_nome}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 font-mono text-[10px]">{fmtDT(p.data_chegada)}</td>
                    <td className="py-1.5 px-3 font-mono text-[10px]">{fmtDT(p.data_saida)}</td>
                    <td className="py-1.5 px-3 font-mono">{p.dias_operacao}d op.</td>
                    <td className="py-1.5 px-3" colSpan={1}>
                      <div className="flex flex-wrap gap-1">
                        {(p.produtos_detalhados ?? p.produtos.map(n => ({ id: n, nome: n, volume_cbm: 0 }))).slice(0, 3).map((pd) => (
                          <span key={typeof pd === 'string' ? pd : pd.id}
                            className="inline-flex items-center gap-0.5 bg-muted/40 border border-border px-1 py-0.5 rounded text-[9px]">
                            <Package className="w-2 h-2 text-accent" />
                            {typeof pd === 'string' ? pd : pd.nome}
                            {typeof pd !== 'string' && pd.volume_cbm > 0 && (
                              <span className="text-muted-foreground ml-0.5">({pd.volume_cbm} CBM)</span>
                            )}
                          </span>
                        ))}
                        {(p.produtos_detalhados?.length ?? p.produtos.length) > 3 && (
                          <span className="text-muted-foreground text-[9px]">
                            +{(p.produtos_detalhados?.length ?? p.produtos.length) - 3} mais
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 font-mono">{p.volume_entregue_cbm.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
