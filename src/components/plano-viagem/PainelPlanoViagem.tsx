import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Navio, Porto } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Compass, Download, Loader2, Navigation, ShieldAlert } from 'lucide-react';
import { MapaRota } from './MapaRota';
import { calcularRotaAsync } from '@/lib/navegacao/clienteRoteador';
import { PARAMETROS_ROTA_PADRAO, ResultadoRota, AFASTAMENTO_APROXIMACAO_NM } from '@/lib/navegacao/roteador';
import { PORTOS_NAVEGACAO, AVISO_PONTO_APROXIMACAO } from '@/lib/navegacao/portosAproximacao';
import { extremoDoPorto, horaLocalParaUtc, nomePorto, utcParaHoraLocal } from '@/lib/navegacao/planoViagem';
import { AVISO_PLANEJAMENTO, VersaoRTZ, calcularCronograma, gerarRTZ } from '@/lib/navegacao/rtz';
import { FONTES_DADOS_NAVEGACAO } from '@/lib/navegacao/grade';
import { formatarLatLonDM } from '@/lib/navegacao/geo';
import { cn } from '@/lib/utils';
import { ISOBATAS_OFERECIDAS as ISOBATAS, baixarArquivo, isobataSugerida, nomeRotaPadrao } from '@/lib/navegacao/utilidadesPlano';

export interface PernaInicial {
  origemId: string;
  destinoId: string;
  /** Hora de Brasília, YYYY-MM-DDTHH:mm. */
  partidaLocal: string;
  navioId?: string;
  velocidadeNos?: number;
  /** Identificação da viagem para o nome do arquivo (ex.: V001-P2). */
  viagem?: string;
}

const fmtNum = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtLocal = (d: Date) => {
  const s = utcParaHoraLocal(d);
  return `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;
};
const fmtUtc = (d: Date) => `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)} ${d.toISOString().slice(11, 16)}Z`;

/** Aviso de planejamento — sempre visível no módulo. */
export function AvisoPlanejamento({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm flex gap-3">
      <ShieldAlert className="w-5 h-5 text-warning shrink-0 mt-0.5" />
      <div className="space-y-1">
        <div className="font-semibold text-foreground">Rota para planejamento — a autoridade de navegação é o ECDIS com ENC oficial</div>
        {!compacto && (
          <>
            <p className="text-muted-foreground text-xs leading-relaxed">{AVISO_PLANEJAMENTO}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">{AVISO_PONTO_APROXIMACAO}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** O que a fase 1 cobre das quatro etapas da Res. IMO A.893(21). */
function CoberturaA893() {
  const etapas: { etapa: string; feito: string; falta: string }[] = [
    { etapa: 'Avaliação', feito: 'Maré e calado nos portos (constantes DHN), UKC', falta: 'avisos METAREA V e previsão do tempo na rota' },
    { etapa: 'Planejamento', feito: 'Rota por waypoints com afastamento da costa e da isóbata', falta: 'sobreposições de ECA, pirataria e áreas de exclusão' },
    { etapa: 'Execução', feito: 'Velocidade e ETA por perna; exportação RTZ para o ECDIS', falta: '—' },
    { etapa: 'Monitoramento', feito: 'Feito a bordo, no ECDIS', falta: 'acompanhamento em terra pelo Pharos' },
  ];
  return (
    <div className="rounded-lg border border-border">
      <div className="px-3 py-2 text-xs font-semibold border-b border-border bg-muted/40">Res. IMO A.893(21) — o que esta fase cobre</div>
      <table className="w-full text-xs">
        <tbody>
          {etapas.map((e) => (
            <tr key={e.etapa} className="border-b border-border/50 last:border-0 align-top">
              <td className="px-3 py-1.5 font-medium whitespace-nowrap">{e.etapa}</td>
              <td className="px-3 py-1.5 text-success">{e.feito}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{e.falta === '—' ? '—' : `Próxima fase: ${e.falta}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PainelPlanoViagem({
  portos, navios, inicial, autoCalcular = false,
}: { portos: Porto[]; navios: Navio[]; inicial?: PernaInicial; autoCalcular?: boolean }) {
  const opcoesPortos = useMemo(() => {
    const cat = Object.values(PORTOS_NAVEGACAO).map((p) => ({ id: p.id, nome: p.nome, catalogado: true }));
    const extras = portos.filter((p) => !PORTOS_NAVEGACAO[p.id]).map((p) => ({ id: p.id, nome: p.nome, catalogado: false }));
    return [...cat, ...extras];
  }, [portos]);

  const navioInicial = navios.find((n) => n.id === inicial?.navioId) ?? navios.find((n) => n.ativo) ?? navios[0];
  const [origemId, setOrigemId] = useState(inicial?.origemId ?? 'SANTOS');
  const [destinoId, setDestinoId] = useState(inicial?.destinoId ?? 'SUAPE');
  const [partidaLocal, setPartidaLocal] = useState(inicial?.partidaLocal ?? utcParaHoraLocal(new Date()).slice(0, 13) + ':00');
  const [navioId, setNavioId] = useState(navioInicial?.id ?? '');
  const navio = navios.find((n) => n.id === navioId);
  const [velocidade, setVelocidade] = useState(inicial?.velocidadeNos ?? navioInicial?.perfil_consumo.velocidade_no ?? 12);
  const [calado, setCalado] = useState(navioInicial?.calado_carregado_metros ?? 0);
  const [distCosta, setDistCosta] = useState(PARAMETROS_ROTA_PADRAO.distanciaMinCostaNm);
  const [isobata, setIsobata] = useState(isobataSugerida(navioInicial?.calado_carregado_metros));
  const [distIso, setDistIso] = useState(PARAMETROS_ROTA_PADRAO.distanciaMinIsobataNm);
  const [rota, setRota] = useState<ResultadoRota | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const trocarNavio = (id: string) => {
    setNavioId(id);
    const n = navios.find((x) => x.id === id);
    if (n) {
      setVelocidade(n.perfil_consumo.velocidade_no);
      setCalado(n.calado_carregado_metros);
      setIsobata(isobataSugerida(n.calado_carregado_metros));
    }
  };

  const partidaUtc = useMemo(() => {
    try { return horaLocalParaUtc(partidaLocal); } catch { return null; }
  }, [partidaLocal]);

  const calcular = useCallback(async () => {
    setErro(null);
    if (origemId === destinoId) { setErro('Origem e destino iguais.'); return; }
    setCalculando(true);
    try {
      const o = extremoDoPorto(origemId, portos);
      const d = extremoDoPorto(destinoId, portos);
      const r = await calcularRotaAsync(o.extremo, d.extremo, {
        distanciaMinCostaNm: distCosta, isobataM: isobata, distanciaMinIsobataNm: distIso,
      });
      setRota(r);
    } catch (e) {
      setRota(null);
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCalculando(false);
    }
  }, [origemId, destinoId, portos, distCosta, isobata, distIso]);

  useEffect(() => {
    if (autoCalcular) void calcular();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A rota exibida deixa de valer se a origem/destino mudarem.
  useEffect(() => { setRota(null); }, [origemId, destinoId]);

  const crono = useMemo(() => {
    if (!rota || !partidaUtc || !(velocidade > 0)) return null;
    try { return calcularCronograma(rota, partidaUtc, velocidade); } catch { return null; }
  }, [rota, partidaUtc, velocidade]);

  const exportar = (versao: VersaoRTZ) => {
    if (!rota || !partidaUtc) return;
    const { nomeArquivo, conteudo } = gerarRTZ({
      nomeRota: nomeRotaPadrao(origemId, destinoId, partidaUtc, inicial?.viagem) + (versao === '1.2' ? '_RTZ12' : ''),
      rota, partida: partidaUtc, velocidadeNos: velocidade, versao,
      navio: { nome: navio?.nome, caladoM: calado || undefined },
      viagem: inicial?.viagem,
    });
    baixarArquivo(nomeArquivo, conteudo);
  };

  const pontoPorto = (id: string) => {
    const c = PORTOS_NAVEGACAO[id];
    if (c) return { nome: c.nome, porto: c.porto, aproximacao: c.aproximacao };
    const p = portos.find((x) => x.id === id);
    return p ? { nome: p.nome, porto: { lat: p.latitude, lon: p.longitude }, aproximacao: { lat: p.latitude, lon: p.longitude } } : undefined;
  };

  const acimaDireta = rota ? (rota.distanciaTotalNm / rota.distanciaDiretaNm - 1) * 100 : 0;
  const temZona = rota?.pernas.some((p) => p.emZonaAproximacao);

  return (
    <div className="space-y-4">
      <AvisoPlanejamento />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Parâmetros */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base flex items-center gap-2"><Compass className="w-4 h-4 text-primary" /> Perna</CardTitle>
            <CardDescription>De ponto de aproximação a ponto de aproximação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Origem</Label>
                <select className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm" value={origemId}
                  onChange={(e) => setOrigemId(e.target.value)}>
                  {opcoesPortos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.catalogado ? '' : ' *'}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Destino</Label>
                <select className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm" value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}>
                  {opcoesPortos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.catalogado ? '' : ' *'}</option>)}
                </select>
              </div>
            </div>
            {opcoesPortos.some((p) => !p.catalogado) && (
              <p className="text-[11px] text-muted-foreground">* Porto sem ponto de aproximação no catálogo: a rota parte da água navegável mais próxima da posição cadastrada.</p>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Partida do ponto de aproximação (hora de Brasília, UTC−3)</Label>
              <Input type="datetime-local" value={partidaLocal} onChange={(e) => setPartidaLocal(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Navio</Label>
                <select className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm" value={navioId}
                  onChange={(e) => trocarNavio(e.target.value)}>
                  <option value="">—</option>
                  {navios.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Velocidade planejada (nós)</Label>
                <Input type="number" min={1} max={30} step={0.5} value={velocidade} onChange={(e) => setVelocidade(+e.target.value)} className="h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Calado (m)</Label>
                <Input type="number" min={0} max={25} step={0.1} value={calado} onChange={(e) => setCalado(+e.target.value)} className="h-8 text-sm mt-1" />
              </div>
            </div>
            <div className="pt-1 border-t border-border">
              <div className="text-xs font-semibold mt-2 mb-1">Afastamentos mínimos</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Costa (NM)</Label>
                  <Input type="number" min={0.5} max={30} step={0.5} value={distCosta} onChange={(e) => setDistCosta(+e.target.value)} className="h-8 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Isóbata (m)</Label>
                  <select className="mt-1 w-full h-8 rounded-md border border-input bg-background px-1 text-sm" value={isobata}
                    onChange={(e) => setIsobata(+e.target.value)}>
                    {ISOBATAS.map((i) => <option key={i} value={i}>{i} m</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Da isóbata (NM)</Label>
                  <Input type="number" min={0} max={20} step={0.5} value={distIso} onChange={(e) => setDistIso(+e.target.value)} className="h-8 text-sm mt-1" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Sugestão para o calado de {fmtNum(calado || 0)} m: isóbata de {isobataSugerida(calado)} m (1,5 × calado, mínimo 20 m).
                {isobata < calado * 1.3 && <span className="text-destructive"> A isóbata escolhida é menor que 1,3 × calado.</span>}
              </p>
            </div>
            <Button onClick={calcular} disabled={calculando || !partidaUtc} className="w-full gap-2">
              {calculando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              {calculando ? 'Calculando…' : 'Calcular rota'}
            </Button>
            {erro && <div className="text-xs text-destructive flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{erro}</div>}
          </CardContent>
        </Card>

        {/* Mapa e resumo */}
        <div className="space-y-3 min-w-0">
          <MapaRota rota={rota} origem={pontoPorto(origemId)} destino={pontoPorto(destinoId)} />
          {rota && crono && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { r: 'Distância', v: `${fmtNum(rota.distanciaTotalNm, 0)} NM`, s: `${fmtNum(acimaDireta)}% acima da loxodromia direta` },
                { r: 'Duração', v: `${fmtNum(crono.duracaoHoras)} h`, s: `${fmtNum(crono.duracaoHoras / 24, 2)} dias a ${fmtNum(velocidade)} nós` },
                { r: 'ETA no destino', v: fmtLocal(crono.horarios[crono.horarios.length - 1]), s: `hora de Brasília · ${fmtUtc(crono.horarios[crono.horarios.length - 1])}` },
                { r: 'Waypoints', v: String(rota.waypoints.length), s: `isóbata ${rota.isobataUsadaM} m · ${fmtNum(rota.parametros.distanciaMinCostaNm)} NM da costa` },
              ].map((k) => (
                <div key={k.r} className="rounded-lg border border-border bg-card px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{k.r}</div>
                  <div className="font-mono font-bold text-primary">{k.v}</div>
                  <div className="text-[10px] text-muted-foreground">{k.s}</div>
                </div>
              ))}
            </div>
          )}
          {rota && rota.avisos.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs space-y-1">
              {rota.avisos.map((a, i) => <div key={i} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />{a}</div>)}
            </div>
          )}
        </div>
      </div>

      {rota && crono && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2 pt-4 flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Waypoints — {nomePorto(origemId, portos)} → {nomePorto(destinoId, portos)}</CardTitle>
              <CardDescription>Pernas loxodrômicas · posições WGS-84 · rumo verdadeiro</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <Button size="sm" className="gap-2" onClick={() => exportar('1.0')}><Download className="w-4 h-4" /> RTZ 1.0 (IEC 61174 ed. 4)</Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => exportar('1.2')}><Download className="w-4 h-4" /> RTZ 1.2</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-mono">
                  {['WP', 'Nome', 'Posição', 'Rumo', 'Perna', 'Acumulado', 'ETA (Brasília)', 'ETA (UTC)'].map((h) => (
                    <th key={h} className="pb-2 pr-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rota.waypoints.map((w, i) => {
                  const perna = i > 0 ? rota.pernas[i - 1] : null;
                  const acum = rota.pernas.slice(0, i).reduce((s, p) => s + p.distanciaNm, 0);
                  return (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="py-1.5 pr-3 font-mono text-primary">{i + 1}</td>
                      <td className="py-1.5 pr-3">{w.nome}</td>
                      <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{formatarLatLonDM(w)}</td>
                      <td className="py-1.5 pr-3 font-mono">{perna ? `${perna.rumoDeg.toFixed(1).padStart(5, '0')}°` : '—'}</td>
                      <td className="py-1.5 pr-3 font-mono whitespace-nowrap">
                        {perna ? `${fmtNum(perna.distanciaNm)} NM` : '—'}
                        {perna?.emZonaAproximacao && <Badge variant="outline" className="ml-1.5 text-[9px] py-0 border-warning/50 text-warning">aprox.</Badge>}
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{fmtNum(acum)} NM</td>
                      <td className={cn('py-1.5 pr-3 font-mono', i === 0 && 'text-muted-foreground')}>{i === 0 ? `ETD ${fmtLocal(crono.horarios[0])}` : fmtLocal(crono.horarios[i])}</td>
                      <td className="py-1.5 pr-3 font-mono text-muted-foreground">{fmtUtc(crono.horarios[i])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {temZona && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Pernas “aprox.” cruzam a zona de aproximação: ali o afastamento de terra é reduzido para {fmtNum(AFASTAMENTO_APROXIMACAO_NM)} NM
                (a isóbata é mantida). No RTZ elas levam XTD menor e uma nota.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              ETD = saída do ponto de aproximação; o tempo de praticagem até o berço não está incluído.
              Pernas com rumo constante (loxodromias). Velocidade planejada constante, sem corrente nem tempo.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <CoberturaA893 />
        <div className="rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground space-y-1">
          <div className="text-xs font-semibold text-foreground">Fontes e método</div>
          {FONTES_DADOS_NAVEGACAO.map((f) => <div key={f}>{f}</div>)}
          <div>
            Grade de 1′ (~1 NM): célula com terra se qualquer parte toca a costa; profundidade = ponto mais raso da célula.
            Os afastamentos incluem a margem da discretização. Cabeços de coral e perigos isolados menores que a grade
            podem não aparecer: confira no ECDIS.
          </div>
        </div>
      </div>
    </div>
  );
}
