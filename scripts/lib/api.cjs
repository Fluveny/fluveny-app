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

/** O contrato no sha, como texto (raw do GitHub; o repositório é público). */
async function contractAt(sha) {
  const url = `https://raw.githubusercontent.com/${API_REPO}/${sha}/${CONTRACT_PATH}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'fluveny-app-api-sync' } });
  if (!response.ok) {
    throw new Error(`Não deu para baixar ${CONTRACT_PATH} em ${sha}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/** Confere o formato do lock; lança com o motivo. */
function validateLock(lock) {
  const problems = [];
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) throw new Error('o lock não é um objeto JSON');
  if (lock.repo !== API_REPO) problems.push(`repo deveria ser ${API_REPO}`);
  if (lock.path !== CONTRACT_PATH) problems.push(`path deveria ser ${CONTRACT_PATH}`);
  if (typeof lock.sha !== 'string' || !/^[0-9a-f]{40}$/.test(lock.sha)) problems.push('sha deveria ter 40 hex');
  if (typeof lock.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(lock.sha256)) problems.push('sha256 deveria ter 64 hex');
  if (problems.length > 0) throw new Error(`src/api/openapi.lock inválido: ${problems.join('; ')}. Rode \`npm run api:sync\`.`);
  return lock;
}

function readLock() {
  if (!existsSync(LOCK)) {
    throw new Error('src/api/openapi.lock não existe. Rode `npm run api:sync`.');
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  } catch {
    throw new Error('src/api/openapi.lock não é JSON. Rode `npm run api:sync`.');
  }
  return validateLock(lock);
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

/** Avisa na CI (GitHub Actions) ou no terminal. */
function warn(message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`);
  else console.warn(`aviso: ${message}`);
}

module.exports = {
  ROOT,
  API_REPO,
  CONTRACT_PATH,
  COPY,
  LOCK,
  TYPES,
  OPENAPI_TYPESCRIPT_CLI,
  sha256,
  mainSha,
  shaOnMain,
  contractAt,
  validateLock,
  readLock,
  generateTypes,
  withTempDir,
  typesFrom,
  warn,
};
