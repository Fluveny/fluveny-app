// Funções comuns de api:sync, api:check e api:types (AD-11). Em CommonJS para o
// jest importar sem transformação.
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const API_REPO = 'Fluveny/fluveny-api';
const CONTRACT_PATH = 'openapi/openapi.json';
const COPY = join(ROOT, 'src/api/openapi.json');
const LOCK = join(ROOT, 'src/api/openapi.lock');
const TYPES = join(ROOT, 'src/api/schema.d.ts');
// Vetores de renderização (AD-8): copiados no mesmo sha do contrato e rodados no jest.
const VECTORS_PATH = 'content/schema/render-vectors.json';
const VECTORS_COPY = join(ROOT, 'src/renderer/render-vectors.json');
const VECTORS_LOCK = join(ROOT, 'src/renderer/render-vectors.lock');

// openapi-typescript 7.13 pede typescript ^5; o App usa o 6. O gerador fica
// isolado em tools/openapi-types, com as versões presas no package-lock dele.
const TOOLS = join(ROOT, 'tools/openapi-types');
const OPENAPI_TYPESCRIPT_CLI = join(TOOLS, 'node_modules/openapi-typescript/bin/cli.js');

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function githubHeaders() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'fluveny-app-api-sync' };
  // Opcional, só para o limite de taxa (a CI passa o GITHUB_TOKEN). Nunca é gravado.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${API_REPO}${path}`, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** O sha completo da ponta da `main` da API. */
async function mainSha() {
  const commit = await github('/commits/main');
  return commit.sha;
}

/**
 * O sha completo de `ref`, se ele estiver na `main` da API (igual a ela ou
 * ancestral dela). Senão, lança.
 */
async function shaOnMain(ref) {
  if (!/^[0-9a-f]{7,40}$/i.test(ref)) throw new Error(`"${ref}" não é um sha de commit`);
  const compare = await github(`/compare/${ref}...main`);
  if (compare.status !== 'identical' && compare.status !== 'ahead') {
    throw new Error(`O sha ${ref} não está na main de ${API_REPO} (compare: ${compare.status}).`);
  }
  return compare.base_commit.sha;
}

/** Um arquivo da API no sha, como texto (raw do GitHub; o repositório é público). */
async function fileAt(sha, path) {
  const url = `https://raw.githubusercontent.com/${API_REPO}/${sha}/${path}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'fluveny-app-api-sync' } });
  if (!response.ok) {
    throw new Error(`Não deu para baixar ${path} em ${sha}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/** O contrato no sha, como texto. */
function contractAt(sha) {
  return fileAt(sha, CONTRACT_PATH);
}

/** Os vetores de renderização no sha, como texto. */
function vectorsAt(sha) {
  return fileAt(sha, VECTORS_PATH);
}

/** Caminho relativo à raiz, para as mensagens. */
function relative(file) {
  return file.slice(ROOT.length + 1);
}

/**
 * Confere o formato do lock; lança com o motivo. Padrão: o lock do contrato;
 * `{ path, file }` confere outro (o dos vetores).
 */
function validateLock(lock, { path = CONTRACT_PATH, file = LOCK } = {}) {
  const problems = [];
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) throw new Error('o lock não é um objeto JSON');
  if (lock.repo !== API_REPO) problems.push(`repo deveria ser ${API_REPO}`);
  if (lock.path !== path) problems.push(`path deveria ser ${path}`);
  if (typeof lock.sha !== 'string' || !/^[0-9a-f]{40}$/.test(lock.sha)) problems.push('sha deveria ter 40 hex');
  if (typeof lock.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(lock.sha256))
    problems.push('sha256 deveria ter 64 hex');
  if (problems.length > 0)
    throw new Error(`${relative(file)} inválido: ${problems.join('; ')}. Rode \`npm run api:sync\`.`);
  return lock;
}

function readLockAt(file, path) {
  const name = relative(file);
  if (!existsSync(file)) {
    throw new Error(`${name} não existe. Rode \`npm run api:sync\`.`);
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${name} não é JSON. Rode \`npm run api:sync\`.`);
  }
  return validateLock(lock, { path, file });
}

function readLock() {
  return readLockAt(LOCK, CONTRACT_PATH);
}

function readVectorsLock() {
  return readLockAt(VECTORS_LOCK, VECTORS_PATH);
}

/**
 * Conferências dos vetores de renderização (api:check): a cópia bate com o
 * lock, o lock está no sha do contrato e o arquivo da API nesse sha é o do
 * lock. Devolve as falhas (vazio quando confere). `lock` e `copy` vêm dos
 * arquivos; os testes passam outros.
 */
async function checkVectors(contractLock, overrides = {}) {
  const failures = [];
  let lock;
  try {
    lock =
      'lock' in overrides
        ? validateLock(overrides.lock, { path: VECTORS_PATH, file: VECTORS_LOCK })
        : readVectorsLock();
  } catch (error) {
    return [error.message];
  }
  let copy = overrides.copy;
  if (copy === undefined) {
    copy = existsSync(VECTORS_COPY) ? readFileSync(VECTORS_COPY, 'utf8') : null;
  }
  if (copy === null) {
    failures.push('src/renderer/render-vectors.json não existe. Rode `npm run api:sync`.');
  } else if (sha256(copy) !== lock.sha256) {
    failures.push(
      'src/renderer/render-vectors.json não bate com o sha256 do lock. Não edite a cópia: rode `npm run api:sync`.',
    );
  }
  if (lock.sha !== contractLock.sha) {
    failures.push(
      `O lock dos vetores (${lock.sha.slice(0, 12)}) não está no sha do contrato (${contractLock.sha.slice(0, 12)}). Rode \`npm run api:sync ${contractLock.sha}\`.`,
    );
  }
  try {
    const upstream = await vectorsAt(lock.sha);
    if (sha256(upstream) !== lock.sha256) {
      failures.push(
        `Os vetores da API em ${lock.sha.slice(0, 12)} não são os do lock. Rode \`npm run api:sync ${lock.sha}\`.`,
      );
    }
  } catch (error) {
    failures.push(error.message);
  }
  return failures;
}

/** Gera os tipos de `input` em `output` com o openapi-typescript de tools/openapi-types. */
function generateTypes(input, output) {
  if (!existsSync(OPENAPI_TYPESCRIPT_CLI)) {
    throw new Error('Gerador de tipos não instalado. Rode `npm run api:tools` (npm ci em tools/openapi-types).');
  }
  execFileSync(process.execPath, [OPENAPI_TYPESCRIPT_CLI, input, '-o', output], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

/** Roda `fn` com uma pasta temporária, apagada no fim. */
function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'fluveny-api-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Os tipos que sairiam de `input` (padrão: a cópia), sem tocar no schema.d.ts. */
function typesFrom(input = COPY) {
  return withTempDir((dir) => {
    const out = join(dir, 'schema.d.ts');
    generateTypes(input, out);
    return readFileSync(out, 'utf8');
  });
}

/** Imagem da API publicada pela CI dela no GHCR. */
const API_IMAGE = 'ghcr.io/fluveny/fluveny-api';

/** A imagem da API no sha do lock: a CI da API publica `sha-<sha completo>` a cada push na main. */
function apiImage(sha) {
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('sha deveria ter 40 hex');
  return `${API_IMAGE}:sha-${sha}`;
}

/** Mensagem quando a imagem do lock não existe ou não está acessível. */
function missingImageMessage(image) {
  return [
    `A imagem ${image} não existe ou não foi baixada.`,
    '- Se o lock aponta para um sha anterior ao perfil local da API (história 1.4), rode `npm run api:sync`.',
    '- A imagem é pública no GHCR e não pede login: se o download falhou, confira a rede e se o Docker está rodando.',
  ].join('\n');
}

/** Avisa na CI (GitHub Actions) ou no terminal. */
function warn(message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`);
  else console.warn(`aviso: ${message}`);
}

module.exports = {
  ROOT,
  API_IMAGE,
  apiImage,
  missingImageMessage,
  API_REPO,
  CONTRACT_PATH,
  COPY,
  LOCK,
  TYPES,
  VECTORS_PATH,
  VECTORS_COPY,
  VECTORS_LOCK,
  OPENAPI_TYPESCRIPT_CLI,
  sha256,
  mainSha,
  shaOnMain,
  fileAt,
  contractAt,
  vectorsAt,
  validateLock,
  readLock,
  readVectorsLock,
  checkVectors,
  generateTypes,
  withTempDir,
  typesFrom,
  warn,
};
