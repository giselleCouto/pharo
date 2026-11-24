// ═══════════════════════════════════════════════════════════════
// PLANO DE VIAGEM — pernas de uma viagem do otimizador → rotas e RTZ
// ═══════════════════════════════════════════════════════════════
import type { Porto, Viagem } from '@/lib/types';
import { ExtremoRota } from './roteador';
import { PORTOS_NAVEGACAO } from './portosAproximacao';

export interface PernaViagem {
  indice: number;
  origemId: string;
  destinoId: string;
  /** Saída do porto de origem, hora local de Brasília (YYYY-MM-DDTHH:mm), como no otimizador. */
  partidaLocal: string;
  /** Chegada planejada pelo otimizador (pela matriz de distâncias), se houver. */
  chegadaOtimizadorLocal?: string;
}

/** Pernas na ordem: base → 1ª parada → … → última parada → base. */
export function pernasDaViagem(viagem: Viagem, portoBaseId: string): PernaViagem[] {
  const pernas: PernaViagem[] = [];
  let origem = portoBaseId;
  let partida = viagem.data_partida;
  viagem.paradas.forEach((p, i) => {
    pernas.push({ indice: i, origemId: origem, destinoId: p.porto_id, partidaLocal: partida, chegadaOtimizadorLocal: p.data_chegada });
    origem = p.porto_id;
    partida = p.data_saida;
  });
  if (viagem.paradas.length > 0) {
    pernas.push({
      indice: viagem.paradas.length, origemId: origem, destinoId: portoBaseId,
      partidaLocal: partida, chegadaOtimizadorLocal: viagem.data_retorno,
    });
  }
  return pernas.filter((p) => p.origemId !== p.destinoId);
}

/**
 * Os horários do Pharos são hora legal de Brasília, sem fuso no texto. O Brasil não adota horário de
 * verão desde 2019: UTC−3 em toda a costa coberta (Fernando de Noronha, UTC−2, não é porto do catálogo).
 */
export const FUSO_BRASILIA_MIN = -180;

export function horaLocalParaUtc(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local);
  if (!m) throw new Error(`Data/hora inválida: ${local}`);
  const [, a, me, d, h = '00', mi = '00'] = m;
  return new Date(Date.UTC(+a, +me - 1, +d, +h, +mi) - FUSO_BRASILIA_MIN * 60_000);
}

export function utcParaHoraLocal(d: Date): string {
  const l = new Date(d.getTime() + FUSO_BRASILIA_MIN * 60_000);
  return l.toISOString().slice(0, 16);
}

/**
 * Extremo da rota para um porto: o ponto de aproximação do catálogo ou, para porto cadastrado pelo
 * usuário, a própria posição do porto (o roteador desloca até a água navegável mais próxima e avisa).
 */
export function extremoDoPorto(portoId: string, portos: Pick<Porto, 'id' | 'nome' | 'latitude' | 'longitude'>[] = []):
  { extremo: ExtremoRota; catalogado: boolean } {
  const cat = PORTOS_NAVEGACAO[portoId];
  if (cat) return { extremo: { ...cat.aproximacao, nome: `${cat.nome} (aprox.)` }, catalogado: true };
  const p = portos.find((x) => x.id === portoId);
  if (!p) throw new Error(`Porto ${portoId} sem posição cadastrada`);
  return { extremo: { lat: p.latitude, lon: p.longitude, nome: p.nome }, catalogado: false };
}

export function nomePorto(portoId: string, portos: Pick<Porto, 'id' | 'nome'>[] = []): string {
  return PORTOS_NAVEGACAO[portoId]?.nome ?? portos.find((p) => p.id === portoId)?.nome ?? portoId;
}
