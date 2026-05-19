import { useState, useMemo } from 'react';
import { useOtimizadorStore } from '@/hooks/useOtimizador';
import { Porto, Navio, Demanda, MatrizDistancia, ProdutoEntrega } from '@/lib/types';
import { TideCalendar } from '@/components/TideCalendar';
import { PORTOS_MARE } from '@/lib/tideEngine';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  MapPin, Ship, Package, Settings, Plus, Trash2, Anchor, Grid3x3, AlertCircle, ChevronDown, ChevronRight
} from 'lucide-react';
import { cn, formatarUsd } from '@/lib/utils';

// ─── Componente Porto Form ─────────────────────────────────────
function PortoRow({ porto, onChange, onRemove }: {
  porto: Porto;
  onChange: (p: Porto) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-2 items-center p-3 rounded-lg bg-muted/30 border border-border hover:border-primary/30 transition-colors">
      <Input
        value={porto.nome}
        onChange={(e) => onChange({ ...porto, nome: e.target.value })}
        placeholder="Nome do porto"
        className="col-span-2 text-sm h-8"
      />
      <Input
        value={porto.codigo}
        onChange={(e) => onChange({ ...porto, codigo: e.target.value })}
        placeholder="Código"
        className="text-sm h-8 font-mono"
      />
      <Input
        type="number"
        value={porto.latitude}
        onChange={(e) => onChange({ ...porto, latitude: parseFloat(e.target.value) || 0 })}
        placeholder="Lat"
        className="text-sm h-8 font-mono"
        step="0.01"
      />
      <Input
        type="number"
        value={porto.longitude}
        onChange={(e) => onChange({ ...porto, longitude: parseFloat(e.target.value) || 0 })}
        placeholder="Lng"
        className="text-sm h-8 font-mono"
        step="0.01"
      />
      <Input
        type="number"
        value={porto.calado_max_metros}
        onChange={(e) => onChange({ ...porto, calado_max_metros: parseFloat(e.target.value) || 0 })}
        placeholder="Calado (m)"
        className="text-sm h-8"
        step="0.1"
      />
      <div className="flex items-center gap-1">
        <select 
          value={porto.referencial_datum || 'ZH'} 
          onChange={(e) => onChange({ ...porto, referencial_datum: e.target.value as any })}
          className="h-8 text-[10px] rounded-md border border-input bg-background px-1 w-12"
        >
          <option value="ZH">ZH</option>
          <option value="NR">NR</option>
          <option value="MSL">MSL</option>
        </select>
        <Input 
          type="number" 
          value={porto.offset_mare_m || 0} 
          onChange={(e) => onChange({ ...porto, offset_mare_m: parseFloat(e.target.value) || 0 })} 
          className="h-8 text-[10px] font-mono w-12" 
          step="0.1" 
          placeholder="±m"
        />
        <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8 text-destructive hover:bg-destructive/10">
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Componente Navio Form ─────────────────────────────────────
function NavioRow({ navio, onChange, onRemove }: {
  navio: Navio;
  onChange: (n: Navio) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4 rounded-lg bg-muted/30 border border-border hover:border-primary/30 transition-colors space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Nome</Label>
          <Input value={navio.nome} onChange={(e) => onChange({ ...navio, nome: e.target.value })} className="h-8 text-sm mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <select
            value={navio.tipo}
            onChange={(e) => onChange({ ...navio, tipo: e.target.value as 'TC' | 'SPOT' })}
            className="w-full h-8 mt-1 text-sm rounded-md border border-input bg-background px-2"
          >
            <option value="TC">TC (Time Charter)</option>
            <option value="SPOT">SPOT</option>
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Capacidade (CBM)</Label>
          <Input
            type="number"
            value={navio.capacidade_cbm}
            onChange={(e) => onChange({ ...navio, capacidade_cbm: parseFloat(e.target.value) || 0 })}
            className="h-8 text-sm mt-1 font-mono"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            {navio.tipo === 'TC' ? 'Custo TC/dia (USD)' : 'Custo SPOT fixo (USD)'}
          </Label>
          <Input
            type="number"
            value={navio.tipo === 'TC' ? (navio.custo_tc_diario_usd || 0) : (navio.custo_spot_fixo_usd || 0)}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              onChange(navio.tipo === 'TC'
                ? { ...navio, custo_tc_diario_usd: val }
                : { ...navio, custo_spot_fixo_usd: val }
              );
            }}
            className="h-8 text-sm mt-1 font-mono"
          />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Calado Carr. (m)</Label>
          <Input type="number" value={navio.calado_carregado_metros} onChange={(e) => onChange({ ...navio, calado_carregado_metros: parseFloat(e.target.value) || 0 })} className="h-8 text-sm mt-1" step="0.1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Vel. (nós)</Label>
          <Input type="number" value={navio.perfil_consumo.velocidade_no} onChange={(e) => onChange({ ...navio, perfil_consumo: { ...navio.perfil_consumo, velocidade_no: parseFloat(e.target.value) || 0 } })} className="h-8 text-sm mt-1" step="0.5" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Consumo Carr. (MT/d)</Label>
          <Input type="number" value={navio.perfil_consumo.consumo_carregado_mt_dia} onChange={(e) => onChange({ ...navio, perfil_consumo: { ...navio.perfil_consumo, consumo_carregado_mt_dia: parseFloat(e.target.value) || 0 } })} className="h-8 text-sm mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Consumo Vazio (MT/d)</Label>
          <Input type="number" value={navio.perfil_consumo.consumo_vazio_mt_dia} onChange={(e) => onChange({ ...navio, perfil_consumo: { ...navio.perfil_consumo, consumo_vazio_mt_dia: parseFloat(e.target.value) || 0 } })} className="h-8 text-sm mt-1" />
        </div>
        <div className="flex items-end gap-1">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Ativo</Label>
            <div className="mt-1 h-8 flex items-center">
              <input
                type="checkbox"
                checked={navio.ativo}
                onChange={(e) => onChange({ ...navio, ativo: e.target.checked })}
                className="w-4 h-4 rounded"
              />
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8 text-destructive hover:bg-destructive/10 mb-0.5">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componente Produtos da Demanda ───────────────────────
function ProdutosEditor({ produtos, onChange }: {
  produtos: ProdutoEntrega[];
  onChange: (p: ProdutoEntrega[]) => void;
}) {
  const addProduto = () => {
    const id = `P${Date.now()}`;
    onChange([...produtos, { id, nome: '', volume_cbm: 0 }]);
  };
  return (
    <div className="space-y-1.5 mt-2 ml-2 border-l-2 border-accent/30 pl-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-accent font-semibold uppercase tracking-wider flex items-center gap-1">
          <Package className="w-3 h-3" /> Produtos a entregar
        </span>
        <Button size="sm" variant="ghost" onClick={addProduto} className="h-6 text-[10px] px-2 gap-1 text-accent hover:text-accent hover:bg-accent/10">
          <Plus className="w-2.5 h-2.5" /> Produto
        </Button>
      </div>
      {produtos.length === 0 && (
        <div className="text-[10px] text-muted-foreground italic py-1">Nenhum produto. Clique em + Produto para adicionar.</div>
      )}
      {produtos.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2">
          <Input
            value={p.nome}
            onChange={(e) => {
              const next = [...produtos];
              next[i] = { ...p, nome: e.target.value };
              onChange(next);
            }}
            placeholder="Nome do produto"
            className="h-7 text-xs flex-1"
          />
          <Input
            type="number"
            value={p.volume_cbm || ''}
            onChange={(e) => {
              const next = [...produtos];
              next[i] = { ...p, volume_cbm: parseFloat(e.target.value) || 0 };
              onChange(next);
            }}
            placeholder="CBM"
            className="h-7 text-xs w-24 font-mono"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10"
            onClick={() => onChange(produtos.filter((_, j) => j !== i))}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Componente Demanda Form ───────────────────────────────────
function DemandaRow({ demanda, portos, onChange, onRemove }: {
  demanda: Demanda;
  portos: Porto[];
  onChange: (d: Demanda) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalProdutos = (demanda.produtos ?? []).reduce((s, p) => s + p.volume_cbm, 0);

  return (
    <div className="rounded-lg bg-muted/30 border border-border hover:border-primary/30 transition-colors">
      {/* Linha principal */}
      <div className="grid grid-cols-7 gap-2 items-center p-3">
        <select
          value={demanda.porto_destino_id}
          onChange={(e) => onChange({ ...demanda, porto_destino_id: e.target.value })}
          className="col-span-2 h-8 text-sm rounded-md border border-input bg-background px-2"
        >
          {portos.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        <Input
          value={demanda.produto}
          onChange={(e) => onChange({ ...demanda, produto: e.target.value })}
          placeholder="Descrição geral"
          className="text-sm h-8"
        />
        <Input
          type="number"
          value={demanda.volume_cbm}
          onChange={(e) => onChange({ ...demanda, volume_cbm: parseFloat(e.target.value) || 0 })}
          placeholder="CBM total"
          className="text-sm h-8 font-mono"
        />
        <Input
          type="date"
          value={demanda.data_necessidade}
          onChange={(e) => onChange({ ...demanda, data_necessidade: e.target.value })}
          className="text-sm h-8"
        />
        <select
          value={demanda.prioridade}
          onChange={(e) => onChange({ ...demanda, prioridade: e.target.value as 'ALTA' | 'MEDIA' | 'BAIXA' })}
          className="h-8 text-sm rounded-md border border-input bg-background px-2"
        >
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Média</option>
          <option value="BAIXA">Baixa</option>
        </select>
        <div className="flex items-center gap-1">
          <Button
            size="icon" variant="ghost"
            className={cn('h-8 w-8 transition-colors', expanded ? 'text-accent' : 'text-muted-foreground')}
            onClick={() => setExpanded(!expanded)}
            title="Expandir produtos"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8 text-destructive hover:bg-destructive/10">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {/* Badge resumo produtos */}
      {(demanda.produtos ?? []).length > 0 && !expanded && (
        <div className="flex items-center gap-2 px-3 pb-2 -mt-1">
          {(demanda.produtos ?? []).map((p) => (
            <Badge key={p.id} variant="outline" className="text-[9px] font-mono py-0.5 gap-1">
              <Package className="w-2 h-2 text-accent" />
              {p.nome} {p.volume_cbm > 0 && `(${p.volume_cbm} CBM)`}
            </Badge>
          ))}
        </div>
      )}
      {/* Editor de produtos */}
      {expanded && (
        <div className="px-3 pb-3">
          <ProdutosEditor
            produtos={demanda.produtos ?? []}
            onChange={(p) => {
              const total = p.reduce((s, x) => s + x.volume_cbm, 0);
              onChange({ ...demanda, produtos: p, volume_cbm: total > 0 ? total : demanda.volume_cbm });
            }}
          />
          {totalProdutos > 0 && Math.abs(totalProdutos - demanda.volume_cbm) > 1 && (
            <p className="text-[10px] text-warning mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Soma dos produtos ({totalProdutos} CBM) difere do volume total ({demanda.volume_cbm} CBM).
              O volume total será atualizado automaticamente.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente Matriz Distâncias ──────────────────────────────
function MatrizDistancias({ portos, matriz, onChange }: {
  portos: Porto[];
  matriz: MatrizDistancia[];
  onChange: (m: MatrizDistancia[]) => void;
}) {
  const portosDest = portos.filter((p) => p.id !== '');
  
  const getVal = (oriId: string, dstId: string) => {
    const r = matriz.find((m) => m.porto_origem_id === oriId && m.porto_destino_id === dstId);
    return r ? r.distancia_nm : 0;
  };

  const getDias = (oriId: string, dstId: string) => {
    const r = matriz.find((m) => m.porto_origem_id === oriId && m.porto_destino_id === dstId);
    return r ? r.dias_transito : 0;
  };

  const setVal = (oriId: string, dstId: string, distancia: number) => {
    const novo = matriz.filter((m) => !(m.porto_origem_id === oriId && m.porto_destino_id === dstId));
    const dias = getDias(oriId, dstId) || Math.ceil(distancia / 200);
    novo.push({ porto_origem_id: oriId, porto_destino_id: dstId, distancia_nm: distancia, dias_transito: dias });
    onChange(novo);
  };

  const setDias = (oriId: string, dstId: string, dias: number) => {
    const novo = matriz.filter((m) => !(m.porto_origem_id === oriId && m.porto_destino_id === dstId));
    const dist = getVal(oriId, dstId);
    novo.push({ porto_origem_id: oriId, porto_destino_id: dstId, distancia_nm: dist, dias_transito: dias });
    onChange(novo);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left p-2 text-muted-foreground font-mono">Origem → Destino</th>
            {portosDest.map((p) => (
              <th key={p.id} className="p-2 text-center text-muted-foreground font-mono min-w-[100px]">{p.codigo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {portos.map((ori) => (
            <tr key={ori.id} className="border-t border-border/50">
              <td className="p-2 font-mono text-primary font-medium">{ori.codigo}</td>
              {portosDest.map((dst) => (
                <td key={dst.id} className="p-1">
                  {ori.id === dst.id ? (
                    <div className="text-center text-muted-foreground font-mono">—</div>
                  ) : (
                    <div className="space-y-1">
                      <Input
                        type="number"
                        value={getVal(ori.id, dst.id) || ''}
                        onChange={(e) => setVal(ori.id, dst.id, parseFloat(e.target.value) || 0)}
                        placeholder="NM"
                        className="h-7 text-xs font-mono text-center px-1"
                      />
                      <Input
                        type="number"
                        value={getDias(ori.id, dst.id) || ''}
                        onChange={(e) => setDias(ori.id, dst.id, parseInt(e.target.value) || 0)}
                        placeholder="dias"
                        className="h-6 text-[10px] font-mono text-center px-1 text-muted-foreground"
                      />
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        Linha superior: distância em Milhas Náuticas (NM). Linha inferior: dias de trânsito.
      </p>
    </div>
  );
}

// ─── Página Principal ──────────────────────────────────────────
// ─── MaresTab ────────────────────────────────────────────────────────────────
function MaresTab({ config }: { config: { portos: Porto[]; premissas: { inicio_periodo: string; fim_periodo: string; margem_seguranca_mare_m?: number; margem_meteorologica_m?: number; worldtides_api_key?: string } } }) {
  const [portoSel, setPortoSel] = useState<string>(config.portos[0]?.id ?? 'TEMADRE');
  const [caladoNavio, setCaladonavio] = useState(14.0);

  const dataInicio = useMemo(() => {
    const d = new Date(config.premissas.inicio_periodo + 'T12:00:00Z');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [config.premissas.inicio_periodo]);

  // Portos que têm dados no PORTOS_MARE
  const portosComMare = config.portos.filter(p => PORTOS_MARE[p.id] || PORTOS_MARE[p.codigo]);

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            🌊 Previsão de Marés por Porto
          </CardTitle>
          <CardDescription>
            Síntese harmônica local (sem API key) com precisão ±10-20 cm. Para planejamento 2 meses à frente,
            use margem meteorológica ≥ 0.50 m para absorver surge de tempestades.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Porto para análise</Label>
              <select
                value={portoSel}
                onChange={e => setPortoSel(e.target.value)}
                className="w-full h-9 mt-1 text-sm rounded-md border border-input bg-background px-3"
              >
                {config.portos.map(p => {
                  const temDados = !!PORTOS_MARE[p.id];
                  return (
                    <option key={p.id} value={p.id}>
                      {p.nome} {temDados ? '✓' : '(sem dados locais)'}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Calado do navio (m)</Label>
              <Input type="number" step="0.5" min="5" max="22"
                value={caladoNavio}
                onChange={e => setCaladonavio(parseFloat(e.target.value) || 14)}
                className="mt-1 h-9 font-mono"
              />
            </div>
          </div>

          {PORTOS_MARE[portoSel] ? (
            <TideCalendar
              portoId={portoSel}
              caladoNavio={caladoNavio}
              dataInicio={dataInicio}
              dias={7}
              margemSeg={config.premissas.margem_seguranca_mare_m ?? 0.5}
              margemMet={config.premissas.margem_meteorologica_m ?? 0.5}
            />
          ) : (
            <div className="p-4 rounded-lg border border-warning/20 bg-warning/5 text-sm text-warning flex items-center gap-2">
              <span>⚠</span>
              Porto <strong>{portoSel}</strong> não encontrado na base de dados harmônicas.
              Configure um ID compatível (TEMADRE, SUAPE, PECÉM, MUCURIPE, ITAQUI, etc.) para usar a previsão de marés.
            </div>
          )}

          {portosComMare.length > 1 && (
            <div className="pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2">Todos os portos configurados:</div>
              <div className="flex gap-2 flex-wrap">
                {config.portos.map(p => {
                  const temDados = !!PORTOS_MARE[p.id];
                  return (
                    <button key={p.id} onClick={() => setPortoSel(p.id)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                        p.id === portoSel
                          ? 'bg-primary/10 border-primary/30 text-primary font-bold'
                          : 'border-border hover:border-primary/30 text-muted-foreground'
                      }`}>
                      {p.codigo} {temDados ? '🌊' : '–'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info sobre APIs */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fontes de Dados de Maré</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {[
              { nome: 'Síntese Harmônica Local', status: 'Ativo (padrão)', cor: 'text-success', desc: 'DHN 2026 · M2, S2, N2, K1, O1 · ±10-20 cm · Sem API key · 100% offline' },
              { nome: 'WorldTides API', status: 'Opcional', cor: 'text-blue-400', desc: 'Cobertura global · Resolução horária · Requer API key em Premissas' },
              { nome: 'NOAA CO-OPS', status: 'Metodologia', cor: 'text-muted-foreground', desc: 'Referência técnica para validação das harmônicas locais' },
            ].map(f => (
              <div key={f.nome} className="p-3 rounded-xl border border-border bg-muted/10">
                <div className={`text-xs font-bold mb-0.5 ${f.cor}`}>{f.status}</div>
                <div className="text-sm font-medium mb-1">{f.nome}</div>
                <div className="text-[11px] text-muted-foreground leading-tight">{f.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConfiguracaoPage() {
  const { configuracao, setConfiguracao } = useOtimizadorStore();
  const [config, setConfig] = useState(configuracao);

  const salvar = () => {
    setConfiguracao(config);
  };

  const addPorto = () => {
    const novo: Porto = {
      id: `P${Date.now()}`,
      nome: 'Novo Porto',
      codigo: 'NPT',
      latitude: 0,
      longitude: 0,
      calado_max_metros: 10,
      dias_operacao: 1,
      despesas_portuarias_usd: 10000,
    };
    setConfig((c) => ({ ...c, portos: [...c.portos, novo] }));
  };

  const addNavio = () => {
    const novo: Navio = {
      id: `N${Date.now()}`,
      nome: 'Novo Navio',
      tipo: 'TC',
      capacidade_cbm: 3000,
      calado_carregado_metros: 9.0,
      calado_vazio_metros: 5.5,
      custo_tc_diario_usd: 18000,
      perfil_consumo: { velocidade_no: 12, consumo_carregado_mt_dia: 22, consumo_vazio_mt_dia: 18, consumo_descarga_mt_dia: 5 },
      velocidade_referencia: 'ECO',
      ativo: true,
    };
    setConfig((c) => ({ ...c, navios: [...c.navios, novo] }));
  };

  const addDemanda = () => {
    const novo: Demanda = {
      id: `D${Date.now()}`,
      porto_destino_id: config.portos[1]?.id || '',
      produto: 'Novo Produto',
      volume_cbm: 500,
      produtos: [],
      data_necessidade: '2026-04-30',
      prioridade: 'MEDIA',
      janela_min_dias: 5,
      janela_max_dias: 30,
    };
    setConfig((c) => ({ ...c, demandas: [...c.demandas, novo] }));
  };

  const volTotal = config.demandas.reduce((s, d) => s + d.volume_cbm, 0);
  const capTotal = config.navios.filter((n) => n.ativo).reduce((s, n) => s + n.capacidade_cbm, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Configuração do Cenário
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Defina portos, navios, demandas e premissas para a otimização
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-sm">
            <div className="px-3 py-1.5 rounded-lg bg-muted border border-border font-mono">
              <span className="text-muted-foreground">Vol. Demanda: </span>
              <span className="text-foreground font-medium">{volTotal.toLocaleString('pt-BR')} CBM</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-muted border border-border font-mono">
              <span className="text-muted-foreground">Cap. Frota: </span>
              <span className="text-foreground font-medium">{capTotal.toLocaleString('pt-BR')} CBM</span>
            </div>
          </div>
          <Button onClick={salvar} className="gap-2">
            <Settings className="w-4 h-4" />
            Salvar Configuração
          </Button>
        </div>
      </div>

      <Tabs defaultValue="portos" className="space-y-4">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="portos" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <MapPin className="w-4 h-4" /> Portos ({config.portos.length})
          </TabsTrigger>
          <TabsTrigger value="distancias" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Grid3x3 className="w-4 h-4" /> Matriz Distâncias
          </TabsTrigger>
          <TabsTrigger value="navios" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Ship className="w-4 h-4" /> Navios ({config.navios.length})
          </TabsTrigger>
          <TabsTrigger value="demandas" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Package className="w-4 h-4" /> Demandas ({config.demandas.length})
          </TabsTrigger>
          <TabsTrigger value="premissas" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Anchor className="w-4 h-4" /> Premissas
          </TabsTrigger>
          <TabsTrigger value="mares" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <span>🌊</span> Marés & Calado
          </TabsTrigger>
        </TabsList>

        {/* ABA PORTOS */}
        <TabsContent value="portos">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Portos</CardTitle>
                  <CardDescription>Lat/Lng em graus decimais. Calado em metros. Despesas em USD.</CardDescription>
                </div>
                <Button size="sm" onClick={addPorto} variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" /> Adicionar Porto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-7 gap-2 px-3 py-1 text-xs text-muted-foreground font-mono">
                <span className="col-span-2">Nome</span>
                <span>Código</span>
                <span>Latitude</span>
                <span>Longitude</span>
                <span>Calado (m)</span>
                <span>Desp. Porto (USD)</span>
              </div>
              <div className="space-y-2">
                {config.portos.map((porto) => (
                  <PortoRow
                    key={porto.id}
                    porto={porto}
                    onChange={(p) => setConfig((c) => ({ ...c, portos: c.portos.map((x) => x.id === p.id ? p : x) }))}
                    onRemove={() => setConfig((c) => ({ ...c, portos: c.portos.filter((x) => x.id !== porto.id) }))}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA DISTÂNCIAS */}
        <TabsContent value="distancias">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Grid3x3 className="w-4 h-4 text-primary" />
                Matriz de Distâncias entre Portos
              </CardTitle>
              <CardDescription>Distância em Milhas Náuticas (NM) e dias de trânsito para cada par de portos.</CardDescription>
            </CardHeader>
            <CardContent>
              <MatrizDistancias
                portos={config.portos}
                matriz={config.matriz_distancias}
                onChange={(m) => setConfig((c) => ({ ...c, matriz_distancias: m }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA NAVIOS */}
        <TabsContent value="navios">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Frota de Navios</CardTitle>
                  <CardDescription>Configure os navios TC (Time Charter) e SPOT disponíveis.</CardDescription>
                </div>
                <Button size="sm" onClick={addNavio} variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" /> Adicionar Navio
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.navios.map((navio) => (
                <NavioRow
                  key={navio.id}
                  navio={navio}
                  onChange={(n) => setConfig((c) => ({ ...c, navios: c.navios.map((x) => x.id === n.id ? n : x) }))}
                  onRemove={() => setConfig((c) => ({ ...c, navios: c.navios.filter((x) => x.id !== navio.id) }))}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA DEMANDAS */}
        <TabsContent value="demandas">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Demandas por Porto</CardTitle>
                  <CardDescription>
                    Volume total: <span className="text-primary font-mono font-medium">{volTotal.toLocaleString('pt-BR')} CBM</span>
                  </CardDescription>
                </div>
                <Button size="sm" onClick={addDemanda} variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" /> Adicionar Demanda
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-7 gap-2 px-3 py-1 text-xs text-muted-foreground font-mono">
                <span className="col-span-2">Porto Destino</span>
                <span>Produto</span>
                <span>Volume (CBM)</span>
                <span>Data Necessidade</span>
                <span>Prioridade</span>
                <span></span>
              </div>
              <div className="space-y-2">
                {config.demandas.map((dem) => (
                  <DemandaRow
                    key={dem.id}
                    demanda={dem}
                    portos={config.portos}
                    onChange={(d) => setConfig((c) => ({ ...c, demandas: c.demandas.map((x) => x.id === d.id ? d : x) }))}
                    onRemove={() => setConfig((c) => ({ ...c, demandas: c.demandas.filter((x) => x.id !== dem.id) }))}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA PREMISSAS */}
        <TabsContent value="premissas">
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Período e Logística</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Porto Origem (Temadre)</Label>
                  <select
                    value={config.premissas.porto_origem_id}
                    onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, porto_origem_id: e.target.value } }))}
                    className="w-full h-9 mt-1 text-sm rounded-md border border-input bg-background px-3"
                  >
                    {config.portos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Início do Período</Label>
                    <Input type="date" value={config.premissas.inicio_periodo}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, inicio_periodo: e.target.value } }))}
                      className="mt-1 h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Fim do Período</Label>
                    <Input type="date" value={config.premissas.fim_periodo}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, fim_periodo: e.target.value } }))}
                      className="mt-1 h-9" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Min. Portos/Viagem</Label>
                    <Input type="number" value={config.premissas.min_portos_por_viagem}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, min_portos_por_viagem: parseInt(e.target.value) || 1 } }))}
                      className="mt-1 h-9 font-mono" min={1} max={5} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Máx. Portos/Viagem</Label>
                    <Input type="number" value={config.premissas.max_portos_por_viagem}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, max_portos_por_viagem: parseInt(e.target.value) || 3 } }))}
                      className="mt-1 h-9 font-mono" min={1} max={5} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Intervalo Mín. (dias)</Label>
                    <Input type="number" value={config.premissas.intervalo_minimo_dias}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, intervalo_minimo_dias: parseInt(e.target.value) || 7 } }))}
                      className="mt-1 h-9 font-mono" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Viagens/Mês TC</Label>
                    <Input type="number" value={config.premissas.viagens_mes_tc}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, viagens_mes_tc: parseInt(e.target.value) || 2 } }))}
                      className="mt-1 h-9 font-mono" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Parâmetros Financeiros e Ocupação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Preço Bunker (USD/MT)</Label>
                    <Input type="number" value={config.premissas.bunker_preco_usd_mt}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, bunker_preco_usd_mt: parseFloat(e.target.value) || 580 } }))}
                      className="mt-1 h-9 font-mono" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Câmbio USD/BRL</Label>
                    <Input type="number" value={config.premissas.taxa_cambio_usd_brl}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, taxa_cambio_usd_brl: parseFloat(e.target.value) || 5.15 } }))}
                      className="mt-1 h-9 font-mono" step="0.01" />
                  </div>
                </div>
                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Faixas de Ocupação do Navio</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Mínima (%)</Label>
                      <Input type="number" value={config.premissas.ocupacao_minima_pct}
                        onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, ocupacao_minima_pct: parseFloat(e.target.value) || 60 } }))}
                        className="mt-1 h-8 font-mono text-sm" min={0} max={100} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Ideal (%)</Label>
                      <Input type="number" value={config.premissas.ocupacao_ideal_pct}
                        onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, ocupacao_ideal_pct: parseFloat(e.target.value) || 85 } }))}
                        className="mt-1 h-8 font-mono text-sm" min={0} max={100} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Máxima (%)</Label>
                      <Input type="number" value={config.premissas.ocupacao_maxima_pct}
                        onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, ocupacao_maxima_pct: parseFloat(e.target.value) || 100 } }))}
                        className="mt-1 h-8 font-mono text-sm" min={0} max={100} />
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Percentil Performance</Label>
                    <Input type="number" value={config.premissas.percentil_performance}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, percentil_performance: parseInt(e.target.value) || 50 } }))}
                      className="mt-1 h-9 font-mono" min={0} max={100} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Margem Lucro Alvo (%)</Label>
                    <Input type="number" value={config.premissas.margem_lucro_alvo_pct}
                      onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, margem_lucro_alvo_pct: parseInt(e.target.value) || 60 } }))}
                      className="mt-1 h-9 font-mono text-primary font-bold" min={0} max={100} />
                  </div>
                </div>
                <div className="flex items-end pb-1 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.premissas.origem_sempre_temadre}
                        onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, origem_sempre_temadre: e.target.checked } }))}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-muted-foreground">Origem sempre Temadre</span>
                    </label>
                  </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Card Maré e Calado nas Premissas ──────────────────── */}
          <Card className="border-border bg-card mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span>🌊</span> Previsão de Maré e Calado
                <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 ml-1">2 meses à frente</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Restrições de calado e janelas de navegação são calculadas por síntese harmônica (offline) ou WorldTides API.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Margem de Segurança UKC (m)</Label>
                  <Input type="number" step="0.1"
                    value={config.premissas.margem_seguranca_mare_m ?? 0.5}
                    onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, margem_seguranca_mare_m: parseFloat(e.target.value) || 0.5 } }))}
                    className="mt-1 h-9 font-mono" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">PIANC recomenda ≥ 0.50 m</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Margem Meteorológica (m)</Label>
                  <Input type="number" step="0.1"
                    value={config.premissas.margem_meteorologica_m ?? 0.5}
                    onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, margem_meteorologica_m: parseFloat(e.target.value) || 0.5 } }))}
                    className="mt-1 h-9 font-mono" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Para planejo 2 meses à frente ≥ 0.50 m</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">WorldTides API Key (opcional)</Label>
                  <Input type="password"
                    value={config.premissas.worldtides_api_key ?? ''}
                    onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, worldtides_api_key: e.target.value } }))}
                    className="mt-1 h-9 font-mono" placeholder="sem chave = modelo harmônico local" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Sem chave → síntese offline (±15 cm)</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.premissas.usar_previsao_mare ?? false}
                    onChange={(e) => setConfig((c) => ({ ...c, premissas: { ...c.premissas, usar_previsao_mare: e.target.checked } }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Ativar validação de calado no otimizador</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  Quando ativo, o otimizador ajusta datas de chegada para coincidir com janelas de maré viáveis.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ─── Card Multi-Cloud Storage ──────────────────────────── */}
          <Card className="border-border bg-card mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span>☁</span> Integração Multi-Cloud Storage
                <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400 ml-1">Sem lock-in</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Selecione onde seu payload está armazenado. O Algoritmo Inteligente se conecta com qualquer provedor.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { sigla: 'AWS',   nome: 'Amazon Web Services', servico: 'S3 · Lambda · Glue',             cor: '#FF9900' },
                  { sigla: 'Azure', nome: 'Microsoft Azure',     servico: 'Blob Storage · Data Factory',    cor: '#0078D4' },
                  { sigla: 'GCP',   nome: 'Google Cloud',        servico: 'Cloud Storage · BigQuery',       cor: '#4285F4' },
                  { sigla: 'OCI',   nome: 'Oracle Cloud',        servico: 'Object Storage · Integration',  cor: '#F80000' },
                ].map((c) => (
                  <div key={c.sigla}
                    className="p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] select-none"
                    style={{ borderColor: `${c.cor}40`, background: `${c.cor}0A` }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black"
                        style={{ background: `${c.cor}20`, color: c.cor }}>
                        {c.sigla.slice(0,2)}
                      </div>
                      <span className="font-bold text-xs" style={{ color: c.cor }}>{c.sigla}</span>
                    </div>
                    <div className="text-xs text-foreground font-medium leading-tight">{c.nome}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{c.servico}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Bucket / Container de Entrada</Label>
                  <Input
                    className="mt-1 h-9 font-mono text-sm"
                    placeholder="ex: s3://minha-empresa/payloads/"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Webhook de Resposta (opcional)</Label>
                  <Input
                    className="mt-1 h-9 font-mono text-sm"
                    placeholder="ex: https://api.empresa.com/callback"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                💡 No plano <strong>Enterprise</strong>, configuramos a conexão segura com sua cloud e gerenciamos credenciais via secrets manager.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────────────────────────────────────── ABA MARÉS */}
        <TabsContent value="mares">
          <MaresTab config={config} />
        </TabsContent>
      </Tabs>

      {/* Resumo Rápido */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="text-xs text-muted-foreground font-mono">RESUMO DA CONFIGURAÇÃO:</div>
            {[
              { label: 'Portos', value: config.portos.length, icon: MapPin },
              { label: 'Navios Ativos', value: config.navios.filter(n => n.ativo).length, icon: Ship },
              { label: 'Demandas', value: config.demandas.length, icon: Package },
              { label: 'Navios TC', value: config.navios.filter(n => n.tipo === 'TC' && n.ativo).length, icon: Anchor },
              { label: 'Navios SPOT', value: config.navios.filter(n => n.tipo === 'SPOT' && n.ativo).length, icon: Ship },
            ].map((item) => (
              <Badge key={item.label} variant="outline" className="gap-1.5 px-3 py-1 text-xs font-mono border-primary/30">
                <item.icon className="w-3 h-3 text-primary" />
                {item.label}: <span className="text-primary font-bold">{item.value}</span>
              </Badge>
            ))}
            <div className="ml-auto">
              <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs font-mono border-accent/30 text-accent">
                {config.premissas.inicio_periodo} → {config.premissas.fim_periodo}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
