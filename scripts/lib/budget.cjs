// Orçamento da primeira tela do web (NFR11, 1.22): o gzip dos scripts do
// index.html mais os chunks das rotas que a primeira tela carrega. Puro, para teste;
// o scripts/bundle-budget.mjs lê o dist e imprime.
const { gzipSync } = require('node:zlib');

/** Limite da primeira tela, em bytes com gzip (500 KB). */
const LIMIT = 500 * 1000;

/** Rotas da primeira tela: o layout raiz e as boas-vindas (`app/(public)/index.tsx`). */
const FIRST_SCREEN_ROUTES = ['_layout', 'index'];

const CHUNK_DIR = '_expo/static/js/web';

/** Os `src` dos `<script>` do index.html, sem a barra inicial, na ordem. */
function scriptsOf(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1].replace(/^\//, ''));
}

/**
 * Os chunks assíncronos que um bundle referencia (o mapa `"<id>":"/_expo/…/x.js"` do
 * Metro), só o nome do arquivo. No `entry`, são os chunks das rotas (o contexto do
 * expo-router); o `import()` do Sentry, por exemplo, fica no mapa do `__common`.
 */
function asyncChunksOf(bundle) {
  const pattern = new RegExp(`"\\d+":"/${CHUNK_DIR}/([^"/]+\\.js)"`, 'g');
  return [...new Set([...bundle.matchAll(pattern)].map((match) => match[1]))];
}

/**
 * O chunk de cada rota da primeira tela, pelo nome que o Metro dá (`<rota>-<hash>.js`),
 * entre os chunks de rota (`asyncChunksOf` do `entry`). Falha se uma rota não tem
 * chunk ou tem mais de um: aí o nome não basta e o script precisa de outro critério,
 * em vez de medir errado.
 */
function routeChunks(files, routes = FIRST_SCREEN_ROUTES) {
  return routes.map((route) => {
    const pattern = new RegExp(`^${route}-[0-9a-f]+\\.js$`);
    const found = files.filter((file) => pattern.test(file));
    if (found.length !== 1) {
      throw new Error(
        `Rota "${route}": ${found.length} chunks em ${CHUNK_DIR} (${found.join(', ') || 'nenhum'}); esperado 1.`,
      );
    }
    return `${CHUNK_DIR}/${found[0]}`;
  });
}

function gzipSize(content) {
  return gzipSync(content).length;
}

/** Peso de cada arquivo (gzip), o total e se passa do limite. `read(path)` devolve o conteúdo. */
function measure(paths, read, limit = LIMIT) {
  const files = [...new Set(paths)].map((path) => ({ path, gzip: gzipSize(read(path)) }));
  const total = files.reduce((sum, file) => sum + file.gzip, 0);
  return { files, total, limit, ok: total <= limit };
}

/**
 * O que o export precisa para o App web ser instalável (1.22): o `<link>` do
 * manifesto no index.html e o `manifest.json` no dist. Devolve as falhas (vazio: ok).
 */
function pwaProblems(html, hasManifest) {
  const problems = [];
  if (!/<link\s+rel="manifest"\s+href="\/manifest\.json"/.test(html)) {
    problems.push('index.html sem <link rel="manifest" href="/manifest.json">: confira o public/index.html.');
  }
  if (!hasManifest) problems.push('manifest.json fora do dist: confira o public/manifest.json.');
  return problems;
}

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;

/** O relatório que o script imprime. */
function report({ files, total, limit, ok }) {
  const lines = files.map((file) => `  ${kb(file.gzip).padStart(10)}  ${file.path}`);
  lines.push(`  ${kb(total).padStart(10)}  total da primeira tela (limite ${kb(limit)}, gzip)`);
  lines.unshift(ok ? 'Orçamento do web: dentro do limite.' : 'Orçamento do web: ESTOUROU o limite.');
  return lines.join('\n');
}

module.exports = {
  asyncChunksOf,
  CHUNK_DIR,
  FIRST_SCREEN_ROUTES,
  LIMIT,
  gzipSize,
  measure,
  pwaProblems,
  report,
  routeChunks,
  scriptsOf,
};
