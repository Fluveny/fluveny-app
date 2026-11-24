// Consentimento do responsável (2.11, FR-2, AD-10, UX-DR116). O adolescente de
// 12 a 17 anos se cadastra com o e-mail do responsável e a conta nasce
// `PENDING_GUARDIAN_CONSENT`: ele joga como Visitante (recibos na loja do
// aparelho), vê a faixa ouro com o reenvio e, quando o perfil volta `ACTIVE`,
// o App migra os recibos (`migrateAfterConsent`) e só depois do 200 limpa a loja.
// O e-mail do responsável nunca vai a log, Sentry, loja ou cache persistido:
// fica só no estado da tela até o envio.
// [ASSUMPTION: mecanismo a validar com a coordenação]
import type { QueryClient } from '@tanstack/react-query';

import { ApiError, post, postAccepted } from '../api/client';
import { GUARDIAN_CONSENT_TOKEN_INVALID, NETWORK_ERROR, UNKNOWN_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';
import { finishVisitorMigration, migrationReceipts } from '../visitor/migration';
import { visitorStore } from '../visitor/store';
import type { VisitorStore } from '../visitor/types';
import { refreshStudent } from './emailConfirmation';
import type { StudentProfile } from './student';

export const RESEND_GUARDIAN_PATH = '/api/v1/students/me/guardian-consent/resend';
export const CONFIRM_GUARDIAN_PATH = '/api/v1/account/guardian-consent/confirm';
export const VISITOR_MIGRATION_PATH = '/api/v1/students/me/visitor-migration';

/** O adolescente à espera do responsável: joga como Visitante e vê a faixa ouro. */
export function guardianPending(student: Pick<StudentProfile, 'status'> | null | undefined): boolean {
  return student?.status === 'PENDING_GUARDIAN_CONSENT';
}

/** O tempo do `Retry-After` em texto: segundos até 1 min, depois minutos para cima. [ASSUMPTION: copy] */
export function waitText(seconds: number): string {
  if (seconds <= 60) {
    const s = Math.max(1, seconds);
    return `Espere ${s} ${s === 1 ? 'segundo' : 'segundos'} para enviar de novo.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Espere ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} para enviar de novo.`;
}

/**
 * O resultado do reenvio: enviado (202); a conta já está ativa (409, o perfil é
 * relido e a migração corre); o e-mail do responsável recusado (400 no campo);
 * espera (429, com os segundos do `Retry-After` se vierem); outro erro.
 */
export type GuardianResendOutcome =
  | { kind: 'sent' }
  | { kind: 'not-pending' }
  | { kind: 'invalid-email' }
  | { kind: 'throttled'; retryAfter?: number }
  | { kind: 'error'; code: string };

/**
 * Reenvia o link ao responsável; com `guardianEmail`, troca o e-mail antes
 * (a correção pela faixa). Nunca rejeita.
 */
export async function resendGuardianConsent(
  client: QueryClient,
  guardianEmail?: string,
): Promise<GuardianResendOutcome> {
  try {
    if (guardianEmail === undefined) await postAccepted(RESEND_GUARDIAN_PATH);
    else await postAccepted(RESEND_GUARDIAN_PATH, { guardianEmail });
    return { kind: 'sent' };
  } catch (error) {
    if (!(error instanceof ApiError)) {
      captureError(error);
      return { kind: 'error', code: UNKNOWN_ERROR };
    }
    if (error.status === 409) {
      refreshStudent(client).catch(captureError);
      return { kind: 'not-pending' };
    }
    if (error.status === 429) {
      return error.retryAfter === undefined
        ? { kind: 'throttled' }
        : { kind: 'throttled', retryAfter: error.retryAfter };
    }
    if (error.status === 400 && error.code === 'VALIDATION_FAILED') return { kind: 'invalid-email' };
    return { kind: 'error', code: error.code };
  }
}

/** O resultado da confirmação do responsável: autorizada, link que não vale mais, outro erro. */
export type GuardianConfirmOutcome = { kind: 'confirmed' } | { kind: 'invalid' } | { kind: 'error'; code: string };

/** O maior token que a API aceita; acima disso, o link já é inválido e nem vai à API. */
export const MAX_GUARDIAN_TOKEN_LENGTH = 128;

/**
 * Confirma o consentimento com o token do link, sem sessão e sem mexer na
 * sessão de quem estiver logado no aparelho. Nunca rejeita.
 */
export async function confirmGuardianConsent(token: string): Promise<GuardianConfirmOutcome> {
  try {
    await post(CONFIRM_GUARDIAN_PATH, { token });
    return { kind: 'confirmed' };
  } catch (error) {
    if (error instanceof ApiError) {
      // Só o token recusado é link inválido; outro 400 vai ao ramo de erro.
      const invalid =
        error.status === 400 && (error.code === GUARDIAN_CONSENT_TOKEN_INVALID || error.code === 'VALIDATION_FAILED');
      return invalid ? { kind: 'invalid' } : { kind: 'error', code: error.code };
    }
    captureError(error);
    return { kind: 'error', code: UNKNOWN_ERROR };
  }
}

/**
 * Uma confirmação por token, fora do componente (o molde da 2.2): o remonte
 * não manda outro POST e o TENTAR DE NOVO reenvia o mesmo token, só em memória.
 */
let current: { token: string; result?: Promise<GuardianConfirmOutcome> } | null = null;

/**
 * O token guardado enquanto a página está na pilha: o remonte (mesmo depois do
 * resultado) reaproveita a mesma confirmação, sem outro POST.
 */
export function rememberedGuardianToken(): string | null {
  return current?.token ?? null;
}

let holders = 0;

/**
 * A página segura o token enquanto está montada; a última instância que
 * desmonta o esquece no fim do commit (o remonte do mesmo commit o mantém),
 * como o `holdResetToken` da 2.8.
 */
export function holdGuardianToken(): () => void {
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    void Promise.resolve().then(() => {
      if (holders === 0) forgetGuardianConfirmation();
    });
  };
}

/** Guarda o token do link; um token diferente começa uma confirmação nova. */
export function rememberGuardianToken(token: string) {
  if (current?.token !== token) current = { token };
}

/** Confirma o token guardado uma vez só: chamadas repetidas recebem a mesma promessa. */
export function confirmGuardianOnce(token: string): Promise<GuardianConfirmOutcome> {
  rememberGuardianToken(token);
  const entry = current!;
  entry.result ??= confirmGuardianConsent(token);
  return entry.result;
}

/** Esquece o resultado (TENTAR DE NOVO manda outro POST com o mesmo token). */
export function forgetGuardianResult() {
  if (current) current = { token: current.token };
}

/** Esquece o token e o resultado (ao sair da página e nos testes). */
export function forgetGuardianConfirmation() {
  current = null;
}

/**
 * A marca, na loja do aparelho, da conta que este aparelho viu à espera do
 * responsável: um hash do e-mail (FNV-1a), nunca o e-mail. Só essa conta migra
 * os recibos ao virar `ACTIVE`: o login de outra conta não leva o Progresso do
 * Visitante (2.6). Sai com a loja (`clear()`).
 */
export const GUARDIAN_MARKER = 'guardian-pending';

/** O hash da conta para a marca (FNV-1a de 32 bits do e-mail em minúsculas, em hex). */
export function accountMarker(email: string): string {
  let hash = 0x811c9dc5;
  for (const char of email.trim().toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Marca a conta pendente neste aparelho (no cadastro do adolescente e a cada leitura do perfil pendente). */
export async function markGuardianPending(email: string, store: VisitorStore = visitorStore): Promise<void> {
  try {
    const marker = accountMarker(email);
    if ((await store.getVariable(GUARDIAN_MARKER)) !== marker) await store.setVariable(GUARDIAN_MARKER, marker);
  } catch (error) {
    captureError(error);
  }
}

/**
 * A cada leitura do perfil: pendente, marca a conta; ativa e marcada neste
 * aparelho, migra os recibos. Nunca rejeita.
 */
export async function syncGuardianConsent(
  client: QueryClient,
  profile: Pick<StudentProfile, 'email' | 'status'>,
  store: VisitorStore = visitorStore,
): Promise<void> {
  if (profile.status === 'PENDING_GUARDIAN_CONSENT') return markGuardianPending(profile.email, store);
  if (profile.status !== 'ACTIVE') return;
  let marker: string | null;
  try {
    marker = await store.getVariable(GUARDIAN_MARKER);
  } catch (error) {
    captureError(error);
    return;
  }
  if (marker !== accountMarker(profile.email)) return;
  await migrateAfterConsent(client, store);
}

/** O resultado da migração depois do consentimento. */
export type ConsentMigrationOutcome =
  { kind: 'nothing' } | { kind: 'migrated'; migrated: number; discarded: number } | { kind: 'failed'; code: string };

/** A migração em curso: uma por vez (o perfil pode ser lido por várias telas ao mesmo tempo). */
let migrating: Promise<ConsentMigrationOutcome> | null = null;

/**
 * Com a conta `ACTIVE` e recibos no aparelho, manda `{deviceId, receipts}` (as
 * regras da 2.6) e, só depois do 200, limpa a loja (menos o `deviceId`), o
 * cache e relê o painel e o Progresso. Falha (403, rede, 5xx): a loja fica, e a
 * próxima leitura do perfil tenta de novo. Nunca rejeita; a rota é idempotente.
 */
export function migrateAfterConsent(
  client: QueryClient,
  store: VisitorStore = visitorStore,
): Promise<ConsentMigrationOutcome> {
  migrating ??= runMigration(client, store).finally(() => {
    migrating = null;
  });
  return migrating;
}

async function runMigration(client: QueryClient, store: VisitorStore): Promise<ConsentMigrationOutcome> {
  let receipts: string[];
  let deviceId: string;
  try {
    receipts = migrationReceipts(await store.receipts());
    if (receipts.length === 0) return { kind: 'nothing' };
    deviceId = await store.deviceId();
  } catch (error) {
    captureError(error);
    return { kind: 'failed', code: UNKNOWN_ERROR };
  }
  let result: { migrated?: number; discarded?: number };
  try {
    result = await post(VISITOR_MIGRATION_PATH, { deviceId, receipts });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      captureError(error);
      return { kind: 'failed', code: UNKNOWN_ERROR };
    }
    // Sem rede, 5xx, 401 (o ponto único da 2.3), 403 e 429: tenta na próxima leitura, sem Sentry.
    const expected = error.code === NETWORK_ERROR || error.status >= 500 || [401, 403, 429].includes(error.status);
    if (!expected) captureError(error);
    return { kind: 'failed', code: error.code };
  }
  await finishVisitorMigration(client, store);
  return { kind: 'migrated', migrated: result.migrated ?? 0, discarded: result.discarded ?? 0 };
}

/** Esquece a migração em curso (testes). */
export function resetConsentMigration() {
  migrating = null;
}
