#!/usr/bin/env node
// npm run api:sync [sha]
// Copia o openapi/openapi.json da API num sha da `main` (padrão: a ponta da
// `main`) para src/api/openapi.json, grava o lock (sha e sha256) e regenera
// src/api/schema.d.ts. É o único jeito de mudar esses arquivos (AD-11).
// Atômico: baixa e gera os tipos numa pasta temporária; só então grava os três
// arquivos como temporários na pasta de destino e os renomeia no fim (o rename
// na mesma pasta não deixa arquivo pela metade).
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import api from './lib/api.cjs';

const { API_REPO, CONTRACT_PATH, COPY, LOCK, TYPES, contractAt, mainSha, sha256, shaOnMain, typesFrom, withTempDir } = api;

async function main() {
  const ref = process.argv[2];
  const sha = ref ? await shaOnMain(ref) : await mainSha();
  const contract = await contractAt(sha);
  JSON.parse(contract); // falha cedo se não for JSON

  const types = withTempDir((dir) => {
    const copy = join(dir, 'openapi.json');
    writeFileSync(copy, contract);
    return typesFrom(copy);
  });
  const lock = { repo: API_REPO, path: CONTRACT_PATH, sha, sha256: sha256(contract) };

  const outputs = [
    [COPY, contract],
    [LOCK, JSON.stringify(lock, null, 2) + '\n'],
    [TYPES, types],
  ];
  const temps = outputs.map(([target]) => `${target}.${process.pid}.tmp`);
  try {
    outputs.forEach(([, content], i) => writeFileSync(temps[i], content));
    outputs.forEach(([target], i) => renameSync(temps[i], target));
  } finally {
    for (const temp of temps) rmSync(temp, { force: true });
  }
  console.log(`Contrato de ${API_REPO}@${sha.slice(0, 12)} copiado; tipos regenerados.`);
}

main().catch((error) => {
  console.error(`api:sync falhou: ${error.message}`);
  process.exit(1);
});
