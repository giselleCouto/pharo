/**
 * Gera hash SHA-256 reproduzível do código-fonte Pharos para registro no INPI.
 * Uso: node scripts/generate-inpi-hash.mjs
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..');
const EXT = new Set(['.ts', '.tsx', '.py', '.html']);
const INCLUDE_ROOT = [
  'index.html',
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'assets']);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full, acc);
    } else if (EXT.has(name.slice(name.lastIndexOf('.')).toLowerCase())) {
      acc.push(full);
    }
  }
  return acc;
}

const files = [];
for (const f of INCLUDE_ROOT) {
  const p = join(ROOT, f);
  if (existsSync(p)) files.push(p);
}
walk(join(ROOT, 'src'), files);
files.sort((a, b) =>
  relative(ROOT, a).replace(/\\/g, '/').localeCompare(relative(ROOT, b).replace(/\\/g, '/'), 'en')
);

const hash = createHash('sha256');
let totalBytes = 0;
const manifest = [];

for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const buf = readFileSync(f);
  hash.update(`${rel}\n`);
  hash.update(buf);
  totalBytes += buf.length;
  manifest.push({ rel, bytes: buf.length });
}

const digest = hash.digest('hex');
const dataGeracao = new Date().toISOString();

const out = {
  programa: 'Pharos — Otimizador de Cabotagem',
  versao: '3.3',
  algoritmo: 'SHA-256',
  data_geracao: dataGeracao,
  arquivos: manifest.length,
  bytes_total: totalBytes,
  hash_sha256: digest,
};

const docsDir = join(ROOT, 'docs');
mkdirSync(docsDir, { recursive: true });

writeFileSync(join(docsDir, 'INPI_HASH_SOLUCAO.json'), JSON.stringify({ ...out, arquivos_lista: manifest.map((m) => m.rel) }, null, 2));

writeFileSync(
  join(docsDir, 'INPI_HASH_SOLUCAO.txt'),
  [
    'PHAROS v3.3 — Hash para registro INPI (Programa de Computador)',
    'Algoritmo: SHA-256',
    `Data de geração (UTC): ${dataGeracao}`,
    `Arquivos incluídos: ${out.arquivos}`,
    `Bytes totais: ${out.bytes_total}`,
    '',
    'HASH SHA-256:',
    digest,
    '',
    'Metodologia: para cada arquivo, concatena-se o caminho relativo (UTF-8) + LF + conteúdo bruto do arquivo, em ordem lexicográfica de caminho. Lista completa em docs/INPI_HASH_SOLUCAO.json',
    '',
    'Regenerar: node scripts/generate-inpi-hash.mjs',
  ].join('\n')
);

console.log(JSON.stringify(out, null, 2));
