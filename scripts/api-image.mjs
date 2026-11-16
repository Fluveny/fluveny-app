#!/usr/bin/env node
// mise run api: imprime a imagem da API no sha do lock (src/api/openapi.lock),
// para o docker-compose.local.yml. Usa a imagem local se já existir; senão, baixa.
// Sem a imagem, falha com o que fazer (api:sync, rede ou Docker).
import { spawnSync } from 'node:child_process';

import api from './lib/api.cjs';

const { apiImage, missingImageMessage, readLock } = api;

function docker(args, stdio = 'ignore') {
  const result = spawnSync('docker', args, { stdio });
  if (result.error) {
    console.error('O Docker não foi encontrado. Instale e ligue o Docker Desktop.');
    process.exit(1);
  }
  return result.status === 0;
}

function main() {
  let image;
  try {
    image = apiImage(readLock().sha);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!docker(['info'])) {
    console.error('O Docker não está no ar. Ligue o Docker Desktop e rode de novo.');
    process.exit(1);
  }
  const present = docker(['image', 'inspect', image]);
  // linux/amd64: a CI da API só publica essa plataforma; no Mac com Apple Silicon, roda emulada.
  if (!present && !docker(['pull', '--platform', 'linux/amd64', image], ['ignore', 'ignore', 'inherit'])) {
    console.error(missingImageMessage(image));
    process.exit(1);
  }
  process.stdout.write(`${image}\n`);
}

main();
