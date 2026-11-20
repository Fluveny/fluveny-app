// Confirmação de e-mail (2.2): confirmar pelo token do link (pública, com ou sem
// sessão) e reenviar o link ao Aluno da sessão. Depois de confirmar, ou de saber
// que já estava confirmado (409), o perfil em cache é buscado de novo: a faixa da
// tela inicial some com `emailConfirmed: true`.
import type { QueryClient } from '@tanstack/react-query';

import { ApiError, post, postAccepted } from '../api/client';
import { UNKNOWN_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';
import { STUDENT_QUERY_KEY } from './student';

export const CONFIRM_EMAIL_PATH = '/api/v1/account/email-confirmation';
export const RESEND_CONFIRMATION_PATH = '/api/v1/students/me/email-confirmation';

/**
 * Marca o perfil do Aluno como desatualizado e o busca de novo, mesmo sem tela
 * observando (`refetchType: 'all'`): quem voltar à tela inicial já o encontra
 * novo. Sem perfil em cache, não faz nada.
 */
export function refreshStudent(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: STUDENT_QUERY_KEY, refetchType: 'all' });
}

/** O resultado de confirmar: confirmado, link que não vale mais (410) ou outro erro (`code` para o `messageFor`). */
export type ConfirmOutcome = { kind: 'confirmed' } | { kind: 'invalid' } | { kind: 'error'; code: string };

/** Confirma o e-mail com o token do link. Nunca rejeita: o erro vira um `ConfirmOutcome`. */
export async function confirmEmail(client: QueryClient, token: string): Promise<ConfirmOutcome> {
  try {
    await post(CONFIRM_EMAIL_PATH, { token });
  } catch (error) {
    if (error instanceof ApiError) {
      // 400 é link truncado ou mexido: repetir não adianta, vale como o vencido (410).
      return error.status === 410 || error.status === 400 ? { kind: 'invalid' } : { kind: 'error', code: error.code };
    }
    captureError(error);
    return { kind: 'error', code: UNKNOWN_ERROR };
  }
  refreshStudent(client).catch(captureError);
  return { kind: 'confirmed' };
}

/**
 * Uma confirmação por token, fora do componente: a tela pode montar duas vezes
 * (remonte, efeito duplo) e o token já saiu da URL. Guarda o token e a promessa
 * só em memória, para o TENTAR DE NOVO reenviar o mesmo token.
 */
let current: { token: string; result?: Promise<ConfirmOutcome>; settled?: boolean } | null = null;

/** O maior token que a API aceita; acima disso, o link já é inválido e nem vai à API. */
export const MAX_TOKEN_LENGTH = 128;

/**
 * O token guardado, só enquanto a confirmação dele não terminou (o remonte no
 * meio do envio). Depois do resultado, `/confirmar-email` sem token na URL é a
 * tela do link inválido, não o resultado antigo.
 */
export function rememberedToken(): string | null {
  return current && !current.settled ? current.token : null;
}

/** Guarda o token do link; um token diferente começa uma confirmação nova. */
export function rememberToken(token: string) {
  if (current?.token !== token) current = { token };
}

/** Confirma o token guardado uma vez só: chamadas repetidas recebem a mesma promessa. */
export function confirmOnce(client: QueryClient, token: string): Promise<ConfirmOutcome> {
  rememberToken(token);
  const entry = current!;
  entry.result ??= confirmEmail(client, token).then((outcome) => {
    entry.settled = true;
    return outcome;
  });
  return entry.result;
}

/** Esquece o resultado do token guardado (TENTAR DE NOVO manda outro POST com o mesmo token). */
export function forgetResult() {
  if (current) current = { token: current.token };
}

/** Esquece o token e o resultado (ao sair da página e nos testes). */
export function forgetConfirmation() {
  current = null;
}

/** O resultado do reenvio: 202 enviado, já confirmado (409) ou outro erro. */
export type ResendOutcome = { kind: 'sent' } | { kind: 'already-confirmed' } | { kind: 'error'; code: string };

/** Reenvia o link de confirmação ao Aluno da sessão. No 409, busca o perfil de novo (a faixa some). */
export async function resendConfirmation(client: QueryClient): Promise<ResendOutcome> {
  try {
    await postAccepted(RESEND_CONFIRMATION_PATH);
    return { kind: 'sent' };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        refreshStudent(client).catch(captureError);
        return { kind: 'already-confirmed' };
      }
      return { kind: 'error', code: error.code };
    }
    captureError(error);
    return { kind: 'error', code: UNKNOWN_ERROR };
  }
}
