// Utilidades do Plano de Viagem usadas pelos componentes (fora dos .tsx para o fast refresh do Vite).
import { PARAMETROS_ROTA_PADRAO } from './roteador';

/** Isóbatas oferecidas (m) — as disponíveis na grade, como os contornos de segurança de um ECDIS. */
export const ISOBATAS_OFERECIDAS = [5, 10, 15, 20, 25, 30, 40, 50];

/** Sugestão: 1,5 × calado, arredondada para a próxima isóbata oferecida, nunca abaixo de 20 m. */
export function isobataSugerida(caladoM?: number): number {
  if (!caladoM || caladoM <= 0) return PARAMETROS_ROTA_PADRAO.isobataM;
  return ISOBATAS_OFERECIDAS.find((i) => i >= Math.max(20, caladoM * 1.5)) ?? 50;
}

export function nomeRotaPadrao(origemId: string, destinoId: string, partidaUtc: Date, viagem?: string): string {
  const t = partidaUtc.toISOString().slice(0, 16).replace(/[-:]/g, '');
  return `PHAROS_${viagem ? `${viagem}_` : ''}${origemId}-${destinoId}_${t}Z`;
}

export function baixarArquivo(nome: string, conteudo: string): void {
  const blob = new Blob([conteudo], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
