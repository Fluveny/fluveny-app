// Migração do Progresso do Visitante no cadastro (2.6, FR-2, FR-7, UX-DR115).
// Antes do POST, `visitorSignupFields` monta o bloco `visitor` e o `country` a
// partir da loja do aparelho; depois do 201, `finishVisitorMigration` limpa a
// loja (menos o `deviceId`), o cache do Visitante e relê o painel e o Progresso.
// O recibo é opaco: o App não lê nem valida; quem descarta é a API. Nenhum
// recibo, `deviceId` ou país vai para log ou Sentry.
import type { QueryClient } from '@tanstack/react-query';

import type { PostBody } from '../api/client';
import { DASHBOARD_QUERY_KEY } from '../dashboard/dashboard';
import { captureError } from '../observability/sentry';
import countries from '../player/countries.json';
import { PROGRESS_QUERY_KEY } from '../player/studentProgress';
import type { ReceiptEntry, VisitorStore } from './types';
import { clearVisitorCache } from './useVisitor';

type SignupBody = PostBody<'/api/v1/auth/signup'>;
export type VisitorSignupFields = Pick<SignupBody, 'country' | 'visitor'>;

/** O teto de recibos e de caracteres por recibo do contrato (`SignupVisitor`). */
export const MAX_RECEIPTS = 200;
export const MAX_RECEIPT_LENGTH = 1024;

const COUNTRY_NAMES: ReadonlySet<string> = new Set(countries.map((country: { name: string }) => country.name));

/**
 * Os recibos que vão para a API: na ordem gravada, sem repetidos, sem os de
 * mais de 1024 caracteres e no máximo 200 (o cadastro, 2.6, e a migração
 * depois do consentimento do responsável, 2.11).
 */
export function migrationReceipts(entries: readonly ReceiptEntry[]): string[] {
  const seen = new Set<string>();
  const receipts: string[] = [];
  for (const { receipt } of entries) {
    if (receipts.length >= MAX_RECEIPTS) break;
    if (!receipt || receipt.length > MAX_RECEIPT_LENGTH || seen.has(receipt)) continue;
    seen.add(receipt);
    receipts.push(receipt);
  }
  return receipts;
}

/**
 * Os campos do cadastro que vêm do aparelho: `country` só se for um `name` da
 * `countries.json`; `visitor` só com ao menos um recibo, na ordem gravada, sem
 * repetidos, sem os de mais de 1024 caracteres e no máximo 200.
 */
export async function visitorSignupFields(store: VisitorStore): Promise<VisitorSignupFields> {
  const [entries, variables] = await Promise.all([store.receipts(), store.variables()]);
  const receipts = migrationReceipts(entries);
  const country = variables.country;
  return {
    ...(country && COUNTRY_NAMES.has(country) ? { country } : {}),
    ...(receipts.length > 0 ? { visitor: { deviceId: await store.deviceId(), receipts } } : {}),
  };
}

/**
 * Depois do 201: apaga a loja (menos o `deviceId`), o cache do Visitante e
 * invalida o painel e o Progresso. Nunca rejeita: a conta já existe, e cada
 * passo que falha vai ao Sentry sem impedir os outros.
 */
export async function finishVisitorMigration(client: QueryClient, store: VisitorStore): Promise<void> {
  const steps: (() => unknown)[] = [
    () => store.clear(),
    () => clearVisitorCache(),
    () => client.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY }),
    () => client.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY }),
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      captureError(error);
    }
  }
}
