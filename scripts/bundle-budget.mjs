#!/usr/bin/env node
// node scripts/bundle-budget.mjs [dist] (no mise run check, depois do expo export -p web)
// Soma o gzip dos scripts do index.html do export e dos chunks das rotas da
// primeira tela (layout raiz e boas-vindas). Acima de 500 KB, sai com 1 (NFR11, 1.22).
// Imprime o total e o peso de cada arquivo. Também falha se o export perdeu o
// manifesto (o <link> no index.html ou o manifest.json no dist).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import budget from './lib/budget.cjs';

const { asyncChunksOf, measure, pwaProblems, report, routeChunks, scriptsOf } = budget;

function main() {
  const dist = process.argv[2] ?? 'dist';
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const scripts = scriptsOf(html);
  if (scripts.length === 0) throw new Error(`nenhum <script> em ${join(dist, 'index.html')}`);
  // Os chunks de rota estão no mapa do `entry` (o contexto de rotas do expo-router).
  const entries = scripts.filter((path) => /\/entry-[^/]+\.js$/.test(path));
  if (entries.length !== 1) throw new Error(`esperado um script entry-*.js no index.html; achei ${entries.length}`);
  const chunks = routeChunks(asyncChunksOf(readFileSync(join(dist, entries[0]), 'utf8')));
  const result = measure([...scripts, ...chunks], (path) => readFileSync(join(dist, path)));
  console.log(report(result));
  const problems = pwaProblems(html, existsSync(join(dist, 'manifest.json')));
  for (const problem of problems) console.error(`App web não instalável: ${problem}`);
  if (!result.ok || problems.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`bundle-budget falhou: ${error.message}`);
  process.exitCode = 1;
}
