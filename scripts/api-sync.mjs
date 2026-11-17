#!/usr/bin/env node
// npm run api:sync [sha]
// Copia o openapi/openapi.json da API num sha da `main` (padrão: a ponta da
// `main`) para src/api/openapi.json, grava o lock (sha e sha256) e regenera
// src/api/schema.d.ts. No mesmo sha, copia o content/schema/render-vectors.json
// para src/renderer/render-vectors.json, com o lock dele (AD-8), e o
// content/schema/countries.json para src/player/countries.json (1.13). É o único
// jeito de mudar esses arquivos (AD-11).
// Atômico: baixa e gera os tipos numa pasta temporária; só então grava os sete
// arquivos como temporários na pasta de destino e os renomeia no fim (o rename
// na mesma pasta não deixa arquivo pela metade).
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import api from './lib/api.cjs';

const {
  API_REPO,
  CONTRACT_PATH,
  COPY,
  LOCK,
  TYPES,
  VECTORS_COPY,
  VECTORS_LOCK,
  VECTORS_PATH,
  COUNTRIES_COPY,
  COUNTRIES_LOCK,
  COUNTRIES_PATH,
  contractAt,
  countriesAt,
  mainSha,
  sha256,
  shaOnMain,
  typesFrom,
  vectorsAt,
  withTempDir,
} = api;

async function main() {
  const ref = process.argv[2];
  const sha = ref ? await shaOnMain(ref) : await mainSha();
  const contract = await contractAt(sha);
  JSON.parse(contract); // falha cedo se não for JSON
  const vectors = await vectorsAt(sha);
  JSON.parse(vectors);
  const countries = await countriesAt(sha);
  JSON.parse(countries);

  const types = withTempDir((dir) => {
    const copy = join(dir, 'openapi.json');
    writeFileSync(copy, contract);
    return typesFrom(copy);
  });
  const lock = { repo: API_REPO, path: CONTRACT_PATH, sha, sha256: sha256(contract) };
  const vectorsLock = { repo: API_REPO, path: VECTORS_PATH, sha, sha256: sha256(vectors) };
  const countriesLock = { repo: API_REPO, path: COUNTRIES_PATH, sha, sha256: sha256(countries) };

  const outputs = [
    [COPY, contract],
    [LOCK, JSON.stringify(lock, null, 2) + '\n'],
    [TYPES, types],
    [VECTORS_COPY, vectors],
    [VECTORS_LOCK, JSON.stringify(vectorsLock, null, 2) + '\n'],
    [COUNTRIES_COPY, countries],
    [COUNTRIES_LOCK, JSON.stringify(countriesLock, null, 2) + '\n'],
  ];
  const temps = outputs.map(([target]) => `${target}.${process.pid}.tmp`);
  try {
    outputs.forEach(([, content], i) => writeFileSync(temps[i], content));
    outputs.forEach(([target], i) => renameSync(temps[i], target));
  } finally {
    for (const temp of temps) rmSync(temp, { force: true });
  }
  console.log(
    `Contrato de ${API_REPO}@${sha.slice(0, 12)} copiado; tipos regenerados; vetores de renderização e países copiados.`,
  );
}

main().catch((error) => {
  console.error(`api:sync falhou: ${error.message}`);
  process.exit(1);
});
