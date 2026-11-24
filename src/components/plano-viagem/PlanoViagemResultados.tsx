import { useMemo, useState } from 'react';
import type { CenarioOtimizacao, ConfiguracaoOtimizacao } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Navigation } from 'lucide-react';
import { PainelPlanoViagem, PernaInicial, AvisoPlanejamento } from './PainelPlanoViagem';
import { baixarArquivo, isobataSugerida, nomeRotaPadrao } from '@/lib/navegacao/utilidadesPlano';
import { pernasDaViagem, extremoDoPorto, horaLocalParaUtc, nomePorto } from '@/lib/navegacao/planoViagem';
import { calcularRotaAsync } from '@/lib/navegacao/clienteRoteador';
import { PARAMETROS_ROTA_PADRAO } from '@/lib/navegacao/roteador';
import { gerarRTZ } from '@/lib/navegacao/rtz';
import { cn } from '@/lib/utils';

const fmtLocal = (s?: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '—');

/** Aba "Plano de Viagem" dos Resultados: uma rota e um RTZ por perna de cada viagem. */
export function PlanoViagemResultados({ cenario, configuracao }: { cenario: CenarioOtimizacao; configuracao: ConfiguracaoOtimizacao }) {
  const [viagemId, setViagemId] = useState(cenario.viagens[0]?.id ?? '');
  const [pernaSel, setPernaSel] = useState<number | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);
  const [erros, setErros] = useState<string[]>([]);

  const viagem = cenario.viagens.find((v) => v.id === viagemId) ?? cenario.viagens[0];
  const navio = configuracao.navios.find((n) => n.id === viagem?.navio_id);
  const base = configuracao.premissas.porto_origem_id;
  const pernas = useMemo(() => (viagem ? pernasDaViagem(viagem, base) : []), [viagem, base]);

  if (!viagem) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma viagem neste cenário.</div>;
  }

  const inicialDe = (i: number): PernaInicial => ({
    origemId: pernas[i].origemId,
    destinoId: pernas[i].destinoId,
    partidaLocal: pernas[i].partidaLocal,
    navioId: navio?.id,
    velocidadeNos: navio?.perfil_consumo.velocidade_no,
    viagem: `${viagem.id}-P${i + 1}`,
  });

  const exportarTodas = async () => {
    setErros([]);
    const falhas: string[] = [];
    for (let i = 0; i < pernas.length; i++) {
      const p = pernas[i];
      setExportando(`Perna ${i + 1} de ${pernas.length}…`);
      try {
        const rota = await calcularRotaAsync(
          extremoDoPorto(p.origemId, configuracao.portos).extremo,
          extremoDoPorto(p.destinoId, configuracao.portos).extremo,
          { ...PARAMETROS_ROTA_PADRAO, isobataM: isobataSugerida(navio?.calado_carregado_metros) },
        );
        const partida = horaLocalParaUtc(p.partidaLocal);
        const { nomeArquivo, conteudo } = gerarRTZ({
          nomeRota: nomeRotaPadrao(p.origemId, p.destinoId, partida, `${viagem.id}-P${i + 1}`),
          rota, partida, velocidadeNos: navio?.perfil_consumo.velocidade_no ?? 12,
          navio: { nome: navio?.nome, caladoM: navio?.calado_carregado_metros }, viagem: `${viagem.id}-P${i + 1}`,
        });
        baixarArquivo(nomeArquivo, conteudo);
      } catch (e) {
        falhas.push(`Perna ${i + 1} (${p.origemId}→${p.destinoId}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setErros(falhas);
    setExportando(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Viagem</div>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={viagem.id}
            onChange={(e) => { setViagemId(e.target.value); setPernaSel(null); }}>
            {cenario.viagens.map((v) => <option key={v.id} value={v.id}>{v.id} — {v.navio_nome} ({fmtLocal(v.data_partida)})</option>)}
          </select>
        </div>
        <Button size="sm" variant="outline" className="gap-2" disabled={!!exportando || pernas.length === 0} onClick={exportarTodas}>
          {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exportando ?? `RTZ de todas as pernas (${pernas.length})`}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Em lote: {PARAMETROS_ROTA_PADRAO.distanciaMinCostaNm} NM da costa, isóbata {isobataSugerida(navio?.calado_carregado_metros)} m,
          {' '}{PARAMETROS_ROTA_PADRAO.distanciaMinIsobataNm} NM da isóbata, {navio?.perfil_consumo.velocidade_no ?? 12} nós. Para ajustar, abra a perna.
        </span>
      </div>
      {erros.length > 0 && <div className="text-xs text-destructive space-y-0.5">{erros.map((e) => <div key={e}>{e}</div>)}</div>}

      {pernaSel === null && <AvisoPlanejamento compacto />}

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground font-mono">
            {['Perna', 'Origem → Destino', 'Partida (Brasília)', 'Chegada pelo otimizador', ''].map((h) => (
              <th key={h} className="pb-2 pr-3 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pernas.map((p, i) => (
            <tr key={i} className={cn('border-b border-border/40', pernaSel === i ? 'bg-primary/5' : 'hover:bg-muted/20')}>
              <td className="py-1.5 pr-3 font-mono text-primary">P{i + 1}</td>
              <td className="py-1.5 pr-3">{nomePorto(p.origemId, configuracao.portos)} → {nomePorto(p.destinoId, configuracao.portos)}</td>
              <td className="py-1.5 pr-3 font-mono">{fmtLocal(p.partidaLocal)}</td>
              <td className="py-1.5 pr-3 font-mono text-muted-foreground">{fmtLocal(p.chegadaOtimizadorLocal)}</td>
              <td className="py-1.5 pr-3 text-right">
                <Button size="sm" variant={pernaSel === i ? 'default' : 'outline'} className="h-7 gap-1.5 text-xs" onClick={() => setPernaSel(i)}>
                  <Navigation className="w-3.5 h-3.5" /> Planejar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted-foreground">
        A chegada do otimizador vem da matriz de distâncias do cenário; a do plano de viagem vem da rota calculada.
      </p>

      {pernaSel !== null && pernas[pernaSel] && (
        <PainelPlanoViagem key={`${viagem.id}-${pernaSel}`} portos={configuracao.portos} navios={configuracao.navios}
          inicial={inicialDe(pernaSel)} autoCalcular />
      )}
    </div>
  );
}
