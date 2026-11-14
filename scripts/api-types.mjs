#!/usr/bin/env node
// npm run api:types: regenera src/api/schema.d.ts a partir da cópia do contrato,
// sem baixar nada. O api:sync já chama isto.
import api from './lib/api.cjs';

const { COPY, TYPES, generateTypes } = api;

generateTypes(COPY, TYPES);
console.log('src/api/schema.d.ts regenerado.');
