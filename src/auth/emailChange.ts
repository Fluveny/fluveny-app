// Troca de e-mail (2.9): confirmar pelo token do link enviado ao e-mail novo
// (pública, com ou sem sessão). O token fica só em memória, fora do componente,
// como o da confirmação (2.2): nunca na URL depois de lido, na loja, em log ou
// no Sentry. Com o 204, o perfil em cache (se houver) é buscado de novo.
import type { QueryClient } from '@tanstack/react-query';

import { ApiError, postNoContent } from '../api/client';
import { UNKNOWN_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';
import { refreshStudent } from './emailConfirmation';

export const CONFIRM_EMAIL_CHANGE_API_PATH = '/api/v1/account/email-change/confirm';

/** O maior token que a API aceita; acima disso, o link já é inválido e nem vai à API. */
export const MAX_EMAIL_CHANGE_TOKEN_LENGTH = 128;

/** Trocado (204), link que não vale mais (410/400), e-mail tomado (409) ou outro erro. */
export type EmailChangeOutcome =
  { kind: 'changed' } | { kind: 'invalid' } | { kind: 'taken' } | { kind: 'error'; code: string };

/** Confirma a troca com o token. Nunca rejeita. */
export async function confirmEmailChange(client: QueryClient, token: string): Promise<EmailChangeOutcome> {
  try {
    await postNoContent(CONFIRM_EMAIL_CHANGE_API_PATH, { token });
  } catch (error) {
    if (error instanceof ApiError) {
      // 400 só é link mexido com `VALIDATION_FAILED`; outro 400 (cabeçalho, etc.) é erro comum.
      if (error.status === 410 || (error.status === 400 && error.code === 'VALIDATION_FAILED')) {
        return { kind: 'invalid' };
      }
      if (error.status === 409) return { kind: 'taken' };
      return { kind: 'error', code: error.code };
    }
    captureError(error);
    return { kind: 'error', code: UNKNOWN_ERROR };
  }
  refreshStudent(client).catch(captureError);
  return { kind: 'changed' };
}

let current: { token: string; result?: Promise<EmailChangeOutcome>; settled?: boolean } | null = null;

/** O token guardado, só enquanto a confirmação dele não terminou (o remonte no meio do envio). */
export function rememberedChangeToken(): string | null {
  return current && !current.settled ? current.token : null;
}

/** Guarda o token do link; um token diferente começa uma confirmação nova. */
export function rememberChangeToken(token: string) {
  if (current?.token !== token) current = { token };
}

/** Confirma o token guardado uma vez só: chamadas repetidas recebem a mesma promessa. */
export function confirmChangeOnce(client: QueryClient, token: string): Promise<EmailChangeOutcome> {
  rememberChangeToken(token);
  const entry = current!;
  entry.result ??= confirmEmailChange(client, token).then((outcome) => {
    entry.settled = true;
    return outcome;
  });
  return entry.result;
}

/** Esquece o resultado (TENTAR DE NOVO manda outro POST com o mesmo token). */
export function forgetChangeResult() {
  if (current) current = { token: current.token };
}

/** Esquece o token e o resultado (ao sair da página e nos testes). */
export function forgetEmailChange() {
  current = null;
}

let holders = 0;

/**
 * A tela segura o token enquanto está montada. Quando a última instância
 * desmonta, ele é esquecido depois do commit: um remonte (desmonta e monta no
 * mesmo commit) o mantém, e o POST em curso não se repete.
 */
export function holdChangeToken(): () => void {
  holders += 1;
  return () => {
    holders -= 1;
    // Depois do commit (microtarefa): o remonte já segurou de novo.
    void Promise.resolve().then(() => {
      if (holders === 0) forgetEmailChange();
    });
  };
}
