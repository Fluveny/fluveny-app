// Recuperação de senha (2.8): pedir o link (pública, sempre 202 na API, para
// e-mail cadastrado ou não) e criar a senha nova com o token do link (204, que
// encerra todas as sessões da conta e não abre outra). O token fica só em
// memória, fora do componente, como o da confirmação de e-mail (2.2): nunca na
// URL depois de lido, na loja, em log ou no Sentry.
import type { QueryClient } from '@tanstack/react-query';

import { ApiError, postAccepted, postNoContent } from '../api/client';
import { UNKNOWN_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';
import { clearSessionToken } from './session';
import { dropLocalSession } from './sessionEnd';
import { STUDENT_QUERY_KEY } from './student';

export const PASSWORD_RECOVERY_PATH = '/api/v1/auth/password-recovery';
export const PASSWORD_RESET_PATH = '/api/v1/auth/password-reset';

/** A tela de pedir o link (Entrar e o 409 do cadastro levam para cá). */
export const RECOVER_PASSWORD_SCREEN = '/recuperar-senha';

/** O `motivo` de Entrar depois da senha redefinida: só com ele a tela mostra o aviso. */
export const PASSWORD_CHANGED_REASON = 'senha';

/** O maior token que a API aceita; acima disso, o link já é inválido e nem vai à API. */
export const MAX_RESET_TOKEN_LENGTH = 128;

/** O resultado de pedir o link: aceito (202, igual para qualquer e-mail) ou erro (`code` para o `messageFor`). */
export type RecoveryOutcome = { kind: 'sent' } | { kind: 'error'; code: string };

/** Pede o link de redefinição para o e-mail. Nunca rejeita: o erro vira um `RecoveryOutcome`. */
export async function requestPasswordRecovery(email: string): Promise<RecoveryOutcome> {
  try {
    await postAccepted(PASSWORD_RECOVERY_PATH, { email });
    return { kind: 'sent' };
  } catch (error) {
    if (error instanceof ApiError) return { kind: 'error', code: error.code };
    captureError(error);
    return { kind: 'error', code: UNKNOWN_ERROR };
  }
}

/** O resultado de criar a senha nova: trocada (204), link que não vale mais (410) ou outro erro. */
export type ResetOutcome = { kind: 'reset' } | { kind: 'invalid' } | { kind: 'error'; code: string };

/**
 * Cria a senha nova com o token do link. Com o 204, esquece o token e apaga a
 * sessão local (a API já encerrou todas): cancela a busca do Aluno em curso (um
 * `/students/me` atrasado não volta ao cache), e, com Aluno no cache, lembra o
 * e-mail e o tira do cache; o token do aparelho sai sempre, mesmo sem Aluno no
 * cache (o link aberto na partida a frio). A loja fica.
 * O 400 (senha recusada) não gasta o token: ele fica para o próximo envio.
 * Nunca rejeita: o erro vira um `ResetOutcome`.
 */
export async function resetPassword(client: QueryClient, token: string, password: string): Promise<ResetOutcome> {
  try {
    await postNoContent(PASSWORD_RESET_PATH, { token, password });
  } catch (error) {
    if (error instanceof ApiError) {
      return error.status === 410 ? { kind: 'invalid' } : { kind: 'error', code: error.code };
    }
    captureError(error);
    return { kind: 'error', code: UNKNOWN_ERROR };
  }
  forgetResetToken();
  try {
    await client.cancelQueries({ queryKey: STUDENT_QUERY_KEY });
    if (!(await dropLocalSession(client))) {
      client.setQueryData(STUDENT_QUERY_KEY, null);
      await clearSessionToken();
    }
  } catch (error) {
    // A senha já foi trocada no servidor: a tela segue para Entrar mesmo assim.
    captureError(error);
  }
  return { kind: 'reset' };
}

/** O token do link, só em memória: a tela pode montar de novo (já sem ele na URL) e o envio seguinte usa o mesmo. */
let currentToken: string | null = null;

/** Guarda o token lido da URL. */
export function rememberResetToken(token: string) {
  currentToken = token;
}

/** O token guardado; `null` depois da senha trocada, do link inválido ou de sair da tela. */
export function rememberedResetToken(): string | null {
  return currentToken;
}

/** Quantas telas de redefinição estão montadas agora. */
let holders = 0;

/**
 * Chamada pela tela de redefinição ao montar; a função devolvida, ao desmontar.
 * Quando a última tela sai (voltar do aparelho, gesto, voltar do navegador), o
 * token é esquecido. A espera até o fim do commit deixa a mesma tela montar de novo (o
 * `replace` para ela mesma, o remonte) sem perder o token.
 */
export function holdResetToken(): () => void {
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    // Depois do commit inteiro: as limpezas e as montagens do mesmo commit já rodaram.
    void Promise.resolve().then(() => {
      if (holders === 0) forgetResetToken();
    });
  };
}

/** Esquece o token (senha trocada, link inválido, sair da tela e testes). */
export function forgetResetToken() {
  currentToken = null;
}
