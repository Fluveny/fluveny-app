#!/usr/bin/env node
// npm run api:check (CI): falha se a cópia do contrato, o lock ou os tipos
// divergirem (AD-11). Avisa, sem falhar, se a cópia estiver atrás da `main` da API.
import { readFileSync } from 'node:fs';

import api from './lib/api.cjs';

const { COPY, TYPES, contractAt, mainSha, readLock, sha256, shaOnMain, typesFrom, warn } = api;

async function main() {
  const failures = [];
  const lock = readLock();
  const copy = readFileSync(COPY, 'utf8');

  if (sha256(copy) !== lock.sha256) {
    failures.push('src/api/openapi.json não bate com o sha256 do lock. Não edite a cópia: rode `npm run api:sync`.');
  }

  try {
    await shaOnMain(lock.sha);
  } catch (error) {
    failures.push(error.message);
  }

  try {
    const upstream = await contractAt(lock.sha);
    if (sha256(upstream) !== lock.sha256) {
      failures.push(`O contrato da API em ${lock.sha.slice(0, 12)} não é o do lock. Rode \`npm run api:sync ${lock.sha}\`.`);
    }
  } catch (error) {
    failures.push(error.message);
  }

  const committedTypes = readFileSync(TYPES, 'utf8');
  if (typesFrom(COPY) !== committedTypes) {
    failures.push('src/api/schema.d.ts não é o gerado da cópia. Rode `npm run api:types` e commite.');
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`✗ ${failure}`);
    process.exit(1);
  }

  try {
    const head = await mainSha();
    if (head !== lock.sha && sha256(await contractAt(head)) !== lock.sha256) {
      warn(`A cópia do contrato (${lock.sha.slice(0, 12)}) está atrás da main da API (${head.slice(0, 12)}). Rode \`npm run api:sync\` quando quiser os tipos novos.`);
    }
  } catch (error) {
    warn(`Não deu para comparar com a main da API: ${error.message}`);
  }

  console.log(`✓ Contrato ${lock.sha.slice(0, 12)}: cópia, lock e tipos conferem.`);
}

main().catch((error) => {
  console.error(`api:check falhou: ${error.message}`);
  process.exit(1);
});
