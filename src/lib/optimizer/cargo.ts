// ═══════════════════════════════════════════════════════════════
//  ABSTRAÇÃO DE UNIDADE DE CARGA — PHAROS
//  Suporta granel (CBM) e contêiner (TEU) de forma intercambiável,
//  mantendo retrocompatibilidade total com o modelo CBM legado.
// ═══════════════════════════════════════════════════════════════
import type { Demanda, Navio, ProdutoEntrega, UnidadeCarga } from '../types';

/** Unidade efetiva de uma demanda (default 'CBM'). */
export function unidadeDemanda(d: Demanda): UnidadeCarga {
  return d.unidade_carga ?? 'CBM';
}

/** Unidade efetiva de um navio (default 'CBM'). */
export function unidadeNavio(n: Navio): UnidadeCarga {
  return n.unidade_carga ?? 'CBM';
}

/** Quantidade da demanda na sua unidade (TEU se conteinerizada, senão CBM). */
export function quantidadeDemanda(d: Demanda): number {
  if (unidadeDemanda(d) === 'TEU') {
    if (d.volume_teu != null && d.volume_teu > 0) return d.volume_teu;
    // fallback: soma dos TEU dos produtos
    return (d.produtos ?? []).reduce((s, p) => s + (p.volume_teu ?? 0), 0);
  }
  return d.volume_cbm;
}

/** Capacidade do navio na sua unidade (TEU ou CBM). */
export function capacidadeNavio(n: Navio): number {
  if (unidadeNavio(n) === 'TEU') {
    return n.capacidade_teu ?? 0;
  }
  return n.capacidade_cbm;
}

/** Verifica se navio e demanda operam na mesma unidade de carga. */
export function unidadeCompativel(n: Navio, d: Demanda): boolean {
  return unidadeNavio(n) === unidadeDemanda(d);
}

/** Peso total (toneladas) de uma demanda, somando os lotes. */
export function pesoDemanda(d: Demanda): number {
  return (d.produtos ?? []).reduce((s, p) => s + (p.peso_t ?? 0), 0);
}

/** Total de TEU refrigerados (reefer) de uma demanda. */
export function teuReeferDemanda(d: Demanda): number {
  if (unidadeDemanda(d) !== 'TEU') return 0;
  return (d.produtos ?? []).reduce(
    (s, p) => s + (p.reefer ? p.volume_teu ?? 0 : 0),
    0
  );
}

/** Soma de TEU refrigerados de uma lista de produtos. */
export function teuReeferProdutos(produtos: ProdutoEntrega[]): number {
  return produtos.reduce((s, p) => s + (p.reefer ? p.volume_teu ?? 0 : 0), 0);
}

/** Maior altura de empilhamento exigida entre os produtos de uma demanda. */
export function alturaEmpilhamentoDemanda(d: Demanda): number {
  return (d.produtos ?? []).reduce(
    (m, p) => Math.max(m, p.altura_empilhamento ?? 0),
    0
  );
}

/**
 * Fraciona uma demanda para uma nova quantidade (na unidade da demanda),
 * escalando proporcionalmente volume CBM, TEU, peso e os lotes de produtos.
 */
export function fracionarDemanda(d: Demanda, novaQuantidade: number): Demanda {
  const atual = quantidadeDemanda(d);
  if (atual <= 0 || novaQuantidade >= atual) return d;
  const frac = novaQuantidade / atual;
  const produtos = (d.produtos ?? []).map((p) => ({
    ...p,
    volume_cbm: +(p.volume_cbm * frac).toFixed(2),
    volume_teu: p.volume_teu != null ? +(p.volume_teu * frac).toFixed(2) : p.volume_teu,
    peso_t: p.peso_t != null ? +(p.peso_t * frac).toFixed(2) : p.peso_t,
  }));
  return {
    ...d,
    volume_cbm: +(d.volume_cbm * frac).toFixed(2),
    volume_teu: d.volume_teu != null ? +(d.volume_teu * frac).toFixed(2) : d.volume_teu,
    produtos,
  };
}
