#!/usr/bin/env node
// Copia o frontmatter YAML do DESIGN.md para src/ui/tokens/design.yaml.
// O DESIGN.md fica no repositório de planejamento (Fluveny/fluveny-planejamento),
// clonado como pasta pai deste repositório. O teste dos tokens compara
// src/ui/tokens/index.ts com essa cópia.
//
// Uso: npm run design:sync [caminho do DESIGN.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import design from './lib/design.cjs';

const source = resolve(process.argv[2] ?? design.DEFAULT_DESIGN);
const yaml = design.frontmatter(readFileSync(source, 'utf8'));
writeFileSync(design.COPY, design.HEADER + yaml);
console.log(`design.yaml atualizado a partir de ${source}`);
