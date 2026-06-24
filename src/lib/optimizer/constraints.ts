import type { ClasseIMO, Demanda, Navio, Porto, Premissas, PrevisaoMarePorto } from '../types';
import { resolverCaladoMaximoPorto, type CaladoEfetivoPorto } from '../mare';
import { preverMareHarmonico, validarChegadaPorto, calcularJanelasNavegacao, garantirPortoMare } from '../tideEngine';

/** Matriz simplificada: produtos incompatíveis não podem compartilhar a mesma viagem. */
const INCOMPATIVEL: Record<string, string[]> = {
  'Diesel S10': ['Gasolina C', 'GLP'],
  'Gasolina C': ['Diesel S10', 'GLP'],
  GLP: ['Diesel S10', 'Gasolina C'],
};

/**
 * Segregação simplificada de classes IMDG/IMO que NÃO podem dividir o mesmo
 * navio sem segregação dedicada. Inspirado na tabela de segregação IMDG.
 * Pares listados (em qualquer ordem) são considerados incompatíveis.
 */
const IMO_INCOMPATIVEL: Record<string, string[]> = {
  '1': ['2', '3', '4', '5', '6', '7', '8', '9'], // explosivos: longe de tudo
  '7': ['1', '3', '4', '5'],                       // radioativos
  '3': ['1', '5', '7'],                            // líquidos inflamáveis x oxidantes
  '4': ['1', '5', '7'],                            // sólidos inflamáveis x oxidantes
  '5': ['1', '3', '4', '7'],                       // oxidantes
  '8': ['1'],                                      // corrosivos
};

function imoCompativel(a: ClasseIMO, b: ClasseIMO): boolean {
  if (a === 'NAO_PERIGOSA' || b === 'NAO_PERIGOSA') return true;
  if (a === b) return true; // mesma classe pode dividir (estiva por classe)
  return !(IMO_INCOMPATIVEL[a]?.includes(b) || IMO_INCOMPATIVEL[b]?.includes(a));
}

export function produtosCompativeis(demandas: Demanda[]): boolean {
  const nomes = new Set<string>();
  const classes = new Set<ClasseIMO>();
  for (const d of demandas) {
    const lista =
      d.produtos?.length > 0 ? d.produtos.map((p) => p.nome) : d.produto ? [d.produto] : [];
    for (const nome of lista) {
      for (const existente of nomes) {
        if (INCOMPATIVEL[nome]?.includes(existente) || INCOMPATIVEL[existente]?.includes(nome)) {
          return false;
        }
      }
      nomes.add(nome);
    }
    // Segregação de carga perigosa (IMDG/IMO)
    for (const prod of d.produtos ?? []) {
      const classe = prod.classe_imo ?? 'NAO_PERIGOSA';
      if (classe === 'NAO_PERIGOSA') continue;
      for (const existente of classes) {
        if (!imoCompativel(classe, existente)) return false;
      }
      classes.add(classe);
    }
  }
  return true;
}

export function resolverCaladoPlanejamento(
  porto: Porto,
  caladoNavioM: number,
  dataRefIso: string,
  premissas: Premissas,
  previsoes?: PrevisaoMarePorto[]
): CaladoEfetivoPorto {
  const margemTotal =
    (premissas.margem_seguranca_mare_m ?? 0.5) + (premissas.margem_meteorologica_m ?? 0.5);

  if (premissas.usar_previsao_mare) {
    // Garante cobertura: portos sem harmônicas completas recebem síntese aproximada
    const fonteHarmonica = garantirPortoMare(porto);
    const dt = new Date(
      dataRefIso.length === 10 ? dataRefIso + 'T12:00:00Z' : dataRefIso
    );
    const pontos = preverMareHarmonico(porto.id, dt, 3, 30);
    const janelas = calcularJanelasNavegacao(
      porto.id,
      caladoNavioM,
      pontos,
      premissas.margem_seguranca_mare_m ?? 0.5,
      premissas.margem_meteorologica_m ?? 0.5
    );
    const val = validarChegadaPorto(
      porto.id,
      dt,
      caladoNavioM,
      pontos,
      premissas.margem_seguranca_mare_m ?? 0.5,
      premissas.margem_meteorologica_m ?? 0.5,
      janelas
    );
    const caladoHarm = val.calado_disponivel_m;
    const efetivo = Math.max(0, Math.min(porto.calado_max_metros, caladoHarm));
    return {
      calado_efetivo_m: efetivo,
      fonte: fonteHarmonica,
      calado_mare_min_na_janela_m: caladoHarm,
    };
  }

  return resolverCaladoMaximoPorto(
    porto.calado_max_metros,
    porto.id,
    dataRefIso,
    previsoes,
    margemTotal
  );
}

export function navioElegivelParaPorto(
  navio: Navio,
  porto: Porto,
  dataRef: string,
  premissas: Premissas,
  previsoes?: PrevisaoMarePorto[]
): boolean {
  const calado = resolverCaladoPlanejamento(
    porto,
    navio.calado_carregado_metros,
    dataRef,
    premissas,
    previsoes
  );
  return navio.calado_carregado_metros <= calado.calado_efetivo_m;
}
