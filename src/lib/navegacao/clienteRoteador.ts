// Cliente do roteador: envia pedidos ao Web Worker (ou calcula na thread principal, se não houver Worker).
import { ExtremoRota, ParametrosRota, ResultadoRota, calcularRota } from './roteador';
import { carregarGradeNavegacao } from './grade';

const urlGrade = () => new URL(`${import.meta.env.BASE_URL}navegacao/grade_costa_br.bin`, window.location.href).href;

let worker: Worker | null = null;
let seq = 0;
const pendentes = new Map<number, { resolve: (r: ResultadoRota) => void; reject: (e: Error) => void }>();

function obterWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./roteador.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; rota?: ResultadoRota; erro?: string }>) => {
      const p = pendentes.get(e.data.id);
      if (!p) return;
      pendentes.delete(e.data.id);
      if (e.data.ok && e.data.rota) p.resolve(e.data.rota);
      else p.reject(new Error(e.data.erro ?? 'Falha ao calcular a rota'));
    };
    worker.onerror = (ev) => {
      for (const p of pendentes.values()) p.reject(new Error(ev.message || 'Falha no roteador'));
      pendentes.clear();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

export function calcularRotaAsync(
  origem: ExtremoRota, destino: ExtremoRota, parametros: Partial<ParametrosRota>,
): Promise<ResultadoRota> {
  const w = obterWorker();
  if (!w) {
    return carregarGradeNavegacao(urlGrade()).then((g) => calcularRota(g, origem, destino, parametros));
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve, reject });
    w.postMessage({ id, urlGrade: urlGrade(), origem, destino, parametros });
  });
}

/** Linha de costa simplificada (Natural Earth) para o mapa. */
export interface CostaSimplificada {
  bbox: [number, number, number, number];
  poligonos: [number, number][][][];
}
let costa: Promise<CostaSimplificada> | null = null;
export function carregarCosta(): Promise<CostaSimplificada> {
  if (!costa) {
    costa = fetch(`${import.meta.env.BASE_URL}navegacao/costa_br.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Falha ao carregar a linha de costa (${r.status})`);
        return r.json() as Promise<CostaSimplificada>;
      })
      .catch((e) => {
        costa = null;
        throw e;
      });
  }
  return costa;
}
