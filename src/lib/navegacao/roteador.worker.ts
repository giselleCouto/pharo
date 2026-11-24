/**
 * WEB WORKER — roteador costeiro do Plano de Viagem.
 * Carrega a grade de navegação uma vez e calcula rotas fora da thread da interface
 * (a primeira rota calcula as transformadas de distância; as seguintes reaproveitam o cache).
 */
import { carregarGradeNavegacao } from './grade';
import { calcularRota, ExtremoRota, ParametrosRota } from './roteador';

interface PedidoRota {
  id: number;
  urlGrade: string;
  origem: ExtremoRota;
  destino: ExtremoRota;
  parametros: Partial<ParametrosRota>;
}

self.onmessage = async (e: MessageEvent<PedidoRota>) => {
  const { id, urlGrade, origem, destino, parametros } = e.data;
  try {
    const grade = await carregarGradeNavegacao(urlGrade);
    const rota = calcularRota(grade, origem, destino, parametros);
    self.postMessage({ id, ok: true, rota });
  } catch (err) {
    self.postMessage({ id, ok: false, erro: err instanceof Error ? err.message : String(err) });
  }
};
