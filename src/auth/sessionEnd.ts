// Fim da sessão no App (2.3, AD-12): o sair e a sessão que acaba no meio do uso.
//
// Sair: `POST /auth/logout`; com 204 (ou 401, a sessão já não existia), apaga o
// token (Android), a loja do aparelho (menos o `deviceId`) e todo o cache do
// TanStack Query. Sem rede ou outro erro, nada muda: no web, o cookie `HttpOnly`
// só sai pelo servidor, e apagar só o local deixaria a sessão viva.
//
// Sessão que acaba no meio: o `client.ts` avisa todo 401 de sessão num ponto só
// (`onUnauthenticated`). Com Aluno no cache, apaga a sessão local (token e Aluno,
// sem a loja) e leva a Entrar, com a rota atual em `volta`. Sem Aluno no cache (a
// abertura do App com a sessão vencida), nada: o `fetchStudent` já cai na boas-vindas.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { ApiError, onUnauthenticated, postNoContent } from '../api/client';
import { captureError } from '../observability/sentry';
import { visitorStore } from '../visitor/store';
import { clearVisitorCache } from '../visitor/useVisitor';
import { clearSessionToken } from './session';
import { markSessionExpired, STUDENT_QUERY_KEY, type StudentProfile } from './student';

/** A tela Entrar (2.3). */
export const SIGN_IN_PATH = '/entrar';

/** O `motivo` de Entrar quando a sessão venceu no meio do uso: só com ele a tela mostra o aviso. */
export const SESSION_ENDED_REASON = 'sessao';

/** Os destinos que o `volta` de Entrar aceita: caminhos internos, numa lista fechada. */
export const RETURN_PATHS = ['/', '/player'] as const;
export type ReturnPath = (typeof RETURN_PATHS)[number];

/** O destino depois de entrar: o `volta` se for um da lista fechada; senão, a raiz. */
export function returnPath(volta: string | string[] | undefined): ReturnPath {
  const value = Array.isArray(volta) ? volta[0] : volta;
  return RETURN_PATHS.find((path) => path === value) ?? '/';
}

async function forgetToken() {
  try {
    await clearSessionToken();
  } catch (error) {
    // A cópia em memória já foi esquecida: as próximas requisições saem sem o Bearer.
    captureError(error);
  }
}

/**
 * Apaga a sessão local do Aluno do cache, sem a loja: guarda o e-mail dele (se
 * outra conta entrar depois, o `signIn` limpa a loja e o cache), zera o Aluno e
 * apaga o token, esperando ele sair (um `clearSessionToken` atrasado apagaria o
 * de um login rápido). Usada pelo 401 no meio do uso (2.3) e depois da senha
 * redefinida (2.8). Resolve `false`, sem mexer em nada, sem Aluno no cache.
 */
export async function dropLocalSession(client: QueryClient): Promise<boolean> {
  const student = client.getQueryData<StudentProfile | null>(STUDENT_QUERY_KEY);
  if (!student) return false;
  markSessionExpired(student.email);
  client.setQueryData(STUDENT_QUERY_KEY, null);
  await forgetToken();
  return true;
}

/**
 * Sai da conta. Resolve depois de apagar tudo; sem rede ou com outro erro
 * do servidor, rejeita com o `ApiError` e a sessão continua.
 */
export async function signOut(client: QueryClient): Promise<void> {
  try {
    await postNoContent('/api/v1/auth/logout');
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
  // Sem Aluno no cache logo de cara: um 401 de outra requisição durante a limpeza não leva a Entrar.
  client.setQueryData(STUDENT_QUERY_KEY, null);
  await forgetToken();
  try {
    await visitorStore.clear();
  } catch (error) {
    captureError(error);
  }
  clearVisitorCache();
  client.clear();
  // Sem sessão, sem perguntar de novo à API.
  client.setQueryData(STUDENT_QUERY_KEY, null);
}

/**
 * Leva a Entrar quando a sessão acaba no meio do uso (um 401 de sessão com
 * Aluno no cache). Montado uma vez, na pilha raiz.
 */
export function useSessionExpiry() {
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const where = useRef(pathname);
  useEffect(() => {
    where.current = pathname;
  }, [pathname]);
  useEffect(
    () =>
      onUnauthenticated(() => {
        const volta = where.current;
        void dropLocalSession(client).then((dropped) => {
          if (dropped) router.replace({ pathname: SIGN_IN_PATH, params: { volta, motivo: SESSION_ENDED_REASON } });
        });
      }),
    [client, router],
  );
}
