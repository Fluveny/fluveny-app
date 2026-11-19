// O Aluno da sessão (2.1): o perfil de `GET /students/me` no cache do TanStack
// Query (`['student', 'me']`), o cadastro e a troca de pronomes. `null` no cache
// é "sem sessão" (401, ou o Android sem token guardado). O tratamento de 401 no
// meio do uso (levar a Entrar) é da 2.3.
import { QueryClientContext, useQuery, type QueryClient } from '@tanstack/react-query';
import { useCallback, useContext, useSyncExternalStore } from 'react';

import { ApiError, clientKind, get, patch, post, type GetData, type PatchBody, type PostBody } from '../api/client';
import type { Pronoun } from '../visitor/types';
import { clearSessionToken, saveSessionToken, storedSessionToken } from './session';

export type StudentProfile = GetData<'/api/v1/students/me'>;
export type SignupBody = PostBody<'/api/v1/auth/signup'>;
export type PronounSet = NonNullable<PatchBody<'/api/v1/students/me'>['pronounSet']>;

export const STUDENT_QUERY_KEY = ['student', 'me'] as const;

/**
 * Pode haver sessão: no web, sempre (o cookie é `HttpOnly`, só a API sabe); no
 * Android, só com um token guardado. Sem isso, nem pergunta à API.
 */
export function mayHaveSession(): boolean {
  return clientKind() === 'web' || storedSessionToken() !== null;
}

/**
 * O perfil do Aluno da sessão; `null` sem sessão (401). No Android, o 401 apaga
 * o token vencido do armazenamento seguro, para ele não sair em toda requisição.
 * Outro erro sobe.
 */
export async function fetchStudent(signal?: AbortSignal): Promise<StudentProfile | null> {
  if (!mayHaveSession()) return null;
  try {
    return await get('/api/v1/students/me', signal ? { signal } : undefined);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      if (clientKind() === 'android') await clearSessionToken();
      return null;
    }
    throw error;
  }
}

/** O Aluno da sessão, uma vez por abertura do App (a 2.3 cuida da sessão que acaba no meio). */
export function useStudent() {
  return useQuery({
    queryKey: STUDENT_QUERY_KEY,
    queryFn: ({ signal }) => fetchStudent(signal),
    retry: false,
    staleTime: Infinity,
    // Sem rede, falha na hora (NETWORK_ERROR) em vez de pausar: a raiz cai na boas-vindas.
    networkMode: 'always',
  });
}

const noSubscription = () => () => {};
/** O `queryHash` padrão do TanStack Query: o JSON da chave. */
const STUDENT_QUERY_HASH = JSON.stringify(STUDENT_QUERY_KEY);

/**
 * O perfil do Aluno que já está no cache, sem buscar nem observar a consulta.
 * Fora de um `QueryClientProvider` (testes de uma Atividade solta), é `null`.
 */
export function useCachedStudent(): StudentProfile | null {
  const client = useContext(QueryClientContext);
  // Só quando os dados do Aluno mudam: os outros eventos não acordam os textos do
  // player. Os de observador (`observerResultsUpdated`) saem durante o render de
  // quem chama `useStudent` e fariam a raiz se atualizar no meio dele.
  const subscribe = useCallback(
    (notify: () => void) =>
      client
        ? client.getQueryCache().subscribe((event) => {
            if (event.query.queryHash !== STUDENT_QUERY_HASH) return;
            if (event.type === 'updated' || event.type === 'removed') notify();
          })
        : noSubscription(),
    [client],
  );
  const snapshot = useCallback(() => client?.getQueryData<StudentProfile | null>(STUDENT_QUERY_KEY) ?? null, [client]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Cria a conta e já entra: no Android, guarda o `sessionToken` no armazenamento
 * seguro antes de tudo; no web, a sessão é o cookie que a API mandou. O perfil
 * vai para o cache.
 */
export async function signUp(client: QueryClient, body: SignupBody): Promise<StudentProfile> {
  const { student, sessionToken } = await post('/api/v1/auth/signup', body);
  if (sessionToken && clientKind() === 'android') await saveSessionToken(sessionToken);
  client.setQueryData(STUDENT_QUERY_KEY, student);
  return student;
}

/** Grava os pronomes do Aluno da sessão e atualiza o cache. */
export async function savePronouns(client: QueryClient, pronounSet: PronounSet): Promise<StudentProfile> {
  const student = await patch('/api/v1/students/me', { pronounSet });
  client.setQueryData(STUDENT_QUERY_KEY, student);
  return student;
}

const PRONOUNS: Record<PronounSet, Pronoun> = { HE: 'he', SHE: 'she', THEY: 'they' };

/** O pronome do renderizador para o Conjunto da conta; sem escolha (nulo), `they`. */
export function pronounOf(profile: Pick<StudentProfile, 'pronounSet'>): Pronoun {
  return profile.pronounSet ? (PRONOUNS[profile.pronounSet] ?? 'they') : 'they';
}
