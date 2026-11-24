import { useEffect, useMemo, useState } from 'react';
import { carregarCosta, CostaSimplificada } from '@/lib/navegacao/clienteRoteador';
import { mercatorY } from '@/lib/navegacao/geo';
import type { ResultadoRota } from '@/lib/navegacao/roteador';

interface PontoPorto {
  nome: string;
  porto: { lat: number; lon: number };
  aproximacao: { lat: number; lon: number };
}

const L = 760;
const A = 460;
const RAD = 180 / Math.PI;

/**
 * Mapa da rota em Mercator (as pernas loxodrômicas são retas). Linha de costa Natural Earth
 * simplificada — ilustração, não carta náutica.
 */
export function MapaRota({ rota, origem, destino }: { rota: ResultadoRota | null; origem?: PontoPorto; destino?: PontoPorto }) {
  const [costa, setCosta] = useState<CostaSimplificada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    carregarCosta().then(setCosta).catch((e: Error) => setErro(e.message));
  }, []);

  const pontos = useMemo(() => {
    const p: { lat: number; lon: number }[] = [];
    if (rota) p.push(...rota.waypoints);
    for (const x of [origem, destino]) if (x) p.push(x.porto, x.aproximacao);
    return p;
  }, [rota, origem, destino]);

  const proj = useMemo(() => {
    const base = pontos.length ? pontos : [{ lat: -35, lon: -54 }, { lat: 5, lon: -32 }];
    let x0 = Math.min(...base.map((p) => p.lon));
    let x1 = Math.max(...base.map((p) => p.lon));
    let y0 = Math.min(...base.map((p) => mercatorY(p.lat))) * RAD;
    let y1 = Math.max(...base.map((p) => mercatorY(p.lat))) * RAD;
    // Margem e área mínima de ~1,2° para pernas curtas.
    const mx = Math.max((x1 - x0) * 0.12, 0.6);
    const my = Math.max((y1 - y0) * 0.12, 0.6);
    x0 -= mx; x1 += mx; y0 -= my; y1 += my;
    // Mantém a proporção do quadro.
    const esc = Math.min(L / (x1 - x0), A / (y1 - y0));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return {
      esc,
      x: (lon: number) => L / 2 + (lon - cx) * esc,
      y: (lat: number) => A / 2 - (mercatorY(lat) * RAD - cy) * esc,
    };
  }, [pontos]);

  const terra = useMemo(() => {
    if (!costa) return '';
    const partes: string[] = [];
    for (const poly of costa.poligonos) {
      for (const anel of poly) {
        partes.push('M' + anel.map(([lon, lat]) => `${proj.x(lon).toFixed(1)},${proj.y(lat).toFixed(1)}`).join('L') + 'Z');
      }
    }
    return partes.join('');
  }, [costa, proj]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-border">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full block" style={{ background: '#eaf4fa' }} role="img"
        aria-label="Mapa da rota de planejamento">
        <path d={terra} fill="#efe4c8" stroke="#9c8b62" strokeWidth={0.6} fillRule="evenodd" />
        {/* Trechos de praticagem (fora da rota) */}
        {[origem, destino].map((p, i) => p && (
          <g key={`prat${i}`}>
            <line x1={proj.x(p.porto.lon)} y1={proj.y(p.porto.lat)} x2={proj.x(p.aproximacao.lon)} y2={proj.y(p.aproximacao.lat)}
              stroke="#64748b" strokeWidth={1.2} strokeDasharray="2 3" />
            <rect x={proj.x(p.porto.lon) - 3.5} y={proj.y(p.porto.lat) - 3.5} width={7} height={7} fill="#334155" />
            <text x={proj.x(p.porto.lon) + 7} y={proj.y(p.porto.lat) + 4} fontSize={11} fill="#1e293b" fontWeight={600}>{p.nome}</text>
          </g>
        ))}
        {rota && (
          <g>
            {rota.pernas.map((perna) => {
              const a = rota.waypoints[perna.indice];
              const b = rota.waypoints[perna.indice + 1];
              return (
                <line key={perna.indice} x1={proj.x(a.lon)} y1={proj.y(a.lat)} x2={proj.x(b.lon)} y2={proj.y(b.lat)}
                  stroke={perna.emZonaAproximacao ? '#d97706' : '#c026d3'} strokeWidth={2}
                  strokeDasharray={perna.emZonaAproximacao ? '5 3' : undefined} />
              );
            })}
            {rota.waypoints.map((w, i) => {
              const extremo = i === 0 || i === rota.waypoints.length - 1;
              return (
                <g key={i}>
                  <circle cx={proj.x(w.lon)} cy={proj.y(w.lat)} r={extremo ? 4.5 : 3} fill={extremo ? '#c026d3' : '#fff'}
                    stroke="#c026d3" strokeWidth={1.5} />
                  {!extremo && rota.waypoints.length <= 30 && (
                    <text x={proj.x(w.lon) + 5} y={proj.y(w.lat) - 4} fontSize={9} fill="#86198f">{i + 1}</text>
                  )}
                </g>
              );
            })}
          </g>
        )}
        <text x={L - 6} y={A - 6} textAnchor="end" fontSize={9} fill="#475569">
          Mercator · costa Natural Earth (ilustrativa) · não é carta náutica
        </text>
      </svg>
      <div className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground border-t border-border bg-card">
        <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-0.5" style={{ background: '#c026d3' }} /> Rota (loxodromias)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: '#d97706' }} /> Zona de aproximação (afastamento reduzido)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dotted" style={{ borderColor: '#64748b' }} /> Praticagem — fora da rota</span>
        {erro && <span className="text-destructive">Linha de costa indisponível: {erro}</span>}
      </div>
    </div>
  );
}
