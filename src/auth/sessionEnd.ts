// Fim da sessão no App (2.3, AD-12): o sair e a sessão que acaba no meio do uso.
//
// Sair: `POST /auth/logout`; com 204 (ou 401, a sessão já não existia), apaga o
// token (Android), a loja do aparelho (menos o `deviceId`) e todo o cache do
// TanStack Query. Sem rede ou outro erro, nada muda: no web, o cookie `HttpOnly`
// só sai pelo servidor, e apagar só o local deixaria a sessão viva.
//
// Sessão que acaba no meio: o `client.ts` avisa todo 401 de sessão num ponto só
// (`onUnauthenticated`). Com Aluno no cache, apaga a sessão local (token e Aluno,
// sem a loja) e leva a Entrar, com a rota atual em `volta` (no player, com a
// Unidade, o Estágio e a Atividade na tela, 2.5). Sem Aluno no cache (a
// abertura do App com a sessão vencida), nada: o `fetchStudent` já cai na boas-vindas.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { ApiError, onUnauthenticated, postNoContent } from '../api/client';
import { captureError } from '../observability/sentry';
import { PLAYER_PATH, playerHref, playerTarget } from '../player/playerRoute';
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

/** Um destino de Entrar: a raiz, ou o player com os parâmetros válidos (2.5). */
export type ReturnHref = ReturnPath | `/player?${string}`;

/** Lê a query de um `volta` (`a=1&b=2`), sem depender do `URLSearchParams`; valor mal codificado fica de fora. */
function queryOf(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    const at = pair.indexOf('=');
    if (at <= 0) continue;
    try {
      const name = decodeURIComponent(pair.slice(0, at));
      if (!(name in params)) params[name] = decodeURIComponent(pair.slice(at + 1));
    } catch {
      // Sequência % inválida: o parâmetro é ignorado.
    }
  }
  return params;
}

/**
 * O destino depois de entrar: o `volta` se o caminho for um da lista fechada;
 * senão, a raiz. No player, só ficam `unidade`, `estagio` e `atividade` no
 * formato de chave do conteúdo (UX-DR118); o resto da query cai.
 */
export function returnPath(volta: string | string[] | undefined): ReturnHref {
  const value = Array.isArray(volta) ? volta[0] : volta;
  if (typeof value !== 'string') return '/';
  const mark = value.indexOf('?');
  const path = mark === -1 ? value : value.slice(0, mark);
  const known = RETURN_PATHS.find((entry) => entry === path);
  if (known !== PLAYER_PATH) return known ?? '/';
  return mark === -1 ? PLAYER_PATH : playerHref(playerTarget(queryOf(value.slice(mark + 1))));
}

/** O `volta` da rota atual: no player, com os parâmetros válidos da Atividade na tela. */
function returnFor(pathname: string, params: Record<string, unknown>): string {
  return pathname === PLAYER_PATH ? playerHref(playerTarget(params)) : pathname;
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
  await clearLocalAccount(client);
}

/**
 * Apaga tudo o que a conta deixou no aparelho, sem falar com a API: o Aluno do
 * cache (antes de tudo), o token, a loja (menos o `deviceId`) e todo o cache.
 * Usada pelo sair (2.3) e pela exclusão da conta (2.10).
 */
export async function clearLocalAccount(client: QueryClient): Promise<void> {
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
  // O `usePathname` não traz a query: os parâmetros do player vêm da rota global.
  const params = useGlobalSearchParams();
  const where = useRef(returnFor(pathname, params));
  useEffect(() => {
    where.current = returnFor(pathname, params);
  }, [pathname, params]);
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
