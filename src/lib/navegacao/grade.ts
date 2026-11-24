// ═══════════════════════════════════════════════════════════════
// GRADE DE NAVEGABILIDADE DA COSTA BRASILEIRA (1 minuto de arco)
// ═══════════════════════════════════════════════════════════════
// Arquivo: public/navegacao/grade_costa_br.bin — gerado por scripts/navegacao/gerar_grade_navegacao.py.
//
// FONTES (dados abertos) E LICENÇAS
//  • Batimetria: GEBCO_2021 Grid, 15 arc-segundos — GEBCO Compilation Group (2021),
//    doi:10.5285/c6612cbe-50b3-0cff-e053-6c86abc09f8f. Domínio público, uso livre com atribuição
//    (termos em https://www.gebco.net). Os termos da GEBCO dizem que a grade NÃO deve ser usada
//    para navegação nem para fins de segurança no mar.
//  • Linha de costa: Natural Earth 1:10m, camadas "land" e "minor_islands" — domínio público
//    (https://www.naturalearthdata.com/about/terms-of-use/).
//
// CONTEÚDO DE CADA CÉLULA (classe, 1 byte):
//   0      terra (polígono Natural Earth tocando a célula OU amostra GEBCO de 15" acima do mar)
//   c ≥ 1  água; c = 1 + nº de LIMIARES ≤ profundidade da amostra MAIS RASA da célula.
// Ex.: com LIMIARES [2,5,10,15,20,...], uma célula com 17 m no ponto mais raso tem classe 5.
// Navegável para a isóbata L ⇔ classe ≥ 2 + índice(L).
//
// Formato binário (little-endian): 'PHNV' | u16 versão | u16 nLimiares | f64 latMin | f64 lonMin |
// f64 célula(°) | u32 linhas | u32 colunas | u16[nLimiares] | RLE (u8 classe + comprimento LEB128).
// Linha 0 = sul; coluna 0 = oeste.

export const FONTES_DADOS_NAVEGACAO = [
  'Batimetria: GEBCO_2021 Grid (GEBCO Compilation Group, 2021; doi:10.5285/c6612cbe-50b3-0cff-e053-6c86abc09f8f) — domínio público; os termos da GEBCO vedam o uso para navegação.',
  'Linha de costa: Natural Earth 1:10m (land + minor islands) — domínio público.',
] as const;

export interface GradeNavegacao {
  latMin: number;
  lonMin: number;
  celulaDeg: number;
  linhas: number;
  colunas: number;
  /** Isóbatas disponíveis (m), em ordem crescente. */
  limiares: number[];
  /** Classe por célula, linha-major (linha 0 = sul). */
  classe: Uint8Array;
}

export function decodificarGrade(buf: ArrayBuffer): GradeNavegacao {
  const dv = new DataView(buf);
  const magia = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magia !== 'PHNV') throw new Error('Arquivo de grade de navegação inválido');
  const versao = dv.getUint16(4, true);
  if (versao !== 1) throw new Error(`Versão de grade não suportada: ${versao}`);
  const nLim = dv.getUint16(6, true);
  const latMin = dv.getFloat64(8, true);
  const lonMin = dv.getFloat64(16, true);
  const celulaDeg = dv.getFloat64(24, true);
  const linhas = dv.getUint32(32, true);
  const colunas = dv.getUint32(36, true);
  let p = 40;
  const limiares: number[] = [];
  for (let i = 0; i < nLim; i++, p += 2) limiares.push(dv.getUint16(p, true));

  const n = linhas * colunas;
  const classe = new Uint8Array(n);
  const bytes = new Uint8Array(buf);
  let k = 0;
  while (p < bytes.length && k < n) {
    const v = bytes[p++];
    let comp = 0;
    let desloc = 0;
    for (;;) {
      const b = bytes[p++];
      comp |= (b & 0x7f) << desloc;
      if ((b & 0x80) === 0) break;
      desloc += 7;
    }
    classe.fill(v, k, k + comp);
    k += comp;
  }
  if (k !== n) throw new Error(`Grade de navegação truncada (${k} de ${n} células)`);
  return { latMin, lonMin, celulaDeg, linhas, colunas, limiares, classe };
}

/** Índice da isóbata disponível igual ou imediatamente MAIS PROFUNDA que a pedida (como o ECDIS). */
export function isobataDisponivel(grade: GradeNavegacao, isobataM: number): { indice: number; valorM: number } {
  const i = grade.limiares.findIndex((l) => l >= isobataM - 1e-9);
  if (i < 0) {
    const ult = grade.limiares.length - 1;
    return { indice: ult, valorM: grade.limiares[ult] };
  }
  return { indice: i, valorM: grade.limiares[i] };
}

export function celulaDe(grade: GradeNavegacao, p: { lat: number; lon: number }): { linha: number; coluna: number } {
  return {
    linha: Math.floor((p.lat - grade.latMin) / grade.celulaDeg),
    coluna: Math.floor((p.lon - grade.lonMin) / grade.celulaDeg),
  };
}

export function dentroDaGrade(grade: GradeNavegacao, linha: number, coluna: number): boolean {
  return linha >= 0 && coluna >= 0 && linha < grade.linhas && coluna < grade.colunas;
}

export function centroDaCelula(grade: GradeNavegacao, linha: number, coluna: number): { lat: number; lon: number } {
  return {
    lat: grade.latMin + (linha + 0.5) * grade.celulaDeg,
    lon: grade.lonMin + (coluna + 0.5) * grade.celulaDeg,
  };
}

/** Profundidade mínima garantida (m) pela classe da célula; 0 = terra. */
export function profundidadeMinimaDaClasse(grade: GradeNavegacao, c: number): number {
  if (c <= 1) return 0;
  return grade.limiares[Math.min(c - 2, grade.limiares.length - 1)];
}

// ─── Carregamento (navegador: fetch em /navegacao; testes: injetar o ArrayBuffer) ───
let gradeEmCache: Promise<GradeNavegacao> | null = null;

export function carregarGradeNavegacao(url?: string): Promise<GradeNavegacao> {
  if (!gradeEmCache) {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const alvo = url ?? `${base}navegacao/grade_costa_br.bin`;
    gradeEmCache = fetch(alvo)
      .then((r) => {
        if (!r.ok) throw new Error(`Falha ao carregar a grade de navegação (${r.status})`);
        return r.arrayBuffer();
      })
      .then(decodificarGrade)
      .catch((e) => {
        gradeEmCache = null;
        throw e;
      });
  }
  return gradeEmCache;
}
