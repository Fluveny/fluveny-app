// Progresso do Aluno no servidor (2.4, FR-9, FR-10, FR-26, AD-9, AD-14): a
// leitura `GET /students/me/progress` (XP total e a primeira conclusão de cada
// Atividade), o `ACTIVITY_STARTED` do Aluno e o que vai ao Sentry quando uma
// gravação falha. O Progresso do Aluno nunca vai para a loja do aparelho.
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { ApiError, get, getAt, postAccepted, type GetData } from '../api/client';
import { GUARDIAN_CONSENT_PENDING, NETWORK_ERROR, STAGE_LOCKED } from '../api/errors';
import { captureError } from '../observability/sentry';
import type { Outcome, ProgressEntry } from '../visitor/types';

export const PROGRESS_PATH = '/api/v1/students/me/progress';
export const STUDENT_EVENTS_PATH = '/api/v1/students/me/events';

/** O Progresso no cache do TanStack Query; o sair (`client.clear()`) o apaga com o resto. */
export const PROGRESS_QUERY_KEY = ['student', 'progress'] as const;

export type StudentProgress = GetData<typeof PROGRESS_PATH>;

/** A consulta do Progresso do Aluno da sessão. */
export function progressQuery() {
  return {
    queryKey: PROGRESS_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) => get(PROGRESS_PATH, { signal }),
    retry: false,
    // Sem rede, falha na hora em vez de pausar: o chip fica como está.
    networkMode: 'always' as const,
    refetchOnWindowFocus: false,
  };
}

/** O Progresso do Aluno (o chip de XP do player); só com `enabled`, o modo Aluno. */
export function useStudentProgress(enabled: boolean) {
  return useQuery({ ...progressQuery(), enabled });
}

/** O servidor confirmou uma gravação: o Progresso é relido (o chip sobe com o número do servidor). */
export function invalidateProgress(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY });
}

/** Relê o Progresso no servidor, sem cache (o resumo do Estágio, depois da última gravação). */
export function fetchProgress(client: QueryClient): Promise<StudentProgress> {
  return client.fetchQuery({ ...progressQuery(), staleTime: 0 });
}

export const STAGE_SUMMARY_PATH = '/api/v1/students/me/units/{unitKey}/stages/{stageKey}/summary';

export type StudentStageSummary = GetData<typeof STAGE_SUMMARY_PATH>;

/** O resumo do Estágio do Aluno no servidor (2.7): XP, média, puladas e tempo da primeira conclusão. */
export function fetchStageSummary(unitKey: string, stageKey: string): Promise<StudentStageSummary> {
  return getAt(STAGE_SUMMARY_PATH, { unitKey, stageKey });
}

/** As Atividades da Unidade que já têm registro do Aluno no Progresso (o refazer, 2.7). */
export function recordedKeys(progress: StudentProgress | undefined, unitKey: string): Set<string> {
  return new Set(progressEntries(progress, unitKey).map((entry) => entry.activityKey));
}

const OUTCOMES: Record<string, Outcome> = { GRADED: 'completed', VIEWED: 'viewed', SKIPPED: 'skipped' };

/**
 * Os resultados da Unidade como entradas do Progresso, para o `summarizeStage`
 * (o resumo local, fallback do Aluno desde a 2.7): `GRADED` é `completed`, e o
 * XP é o `xpAwarded`. Resposta fora do contrato vira lista vazia.
 */
export function progressEntries(progress: StudentProgress | undefined, unitKey: string): ProgressEntry[] {
  const results = Array.isArray(progress?.results) ? progress.results : [];
  return results.flatMap((result) => {
    const outcome = OUTCOMES[result?.outcome];
    if (!outcome || result.unitKey !== unitKey) return [];
    return [
      {
        activityKey: result.activityKey,
        outcome,
        xp: Number.isFinite(result.xpAwarded) ? result.xpAwarded : 0,
        ...(outcome === 'completed' && typeof result.resultPct === 'number' ? { resultPct: result.resultPct } : {}),
        ...(Number.isFinite(result.studyTimeMs) ? { studyTimeMs: result.studyTimeMs } : {}),
      },
    ];
  });
}

/** Sem rede ou sessão que venceu (o ponto único da 2.3 cuida do 401): nada a reportar. */
function expected(error: unknown): boolean {
  return error instanceof ApiError && (error.code === NETWORK_ERROR || error.status === 401);
}

/**
 * Uma gravação do Aluno falhou: o 4xx (fora o 401, o 429 e o `STAGE_LOCKED`
 * da sequência, 2.5) e a falha que não é da API vão ao Sentry. Sem rede, 5xx,
 * 401 e 429, não.
 */
export function reportSaveFailure(error: unknown): void {
  if (!(error instanceof ApiError)) {
    captureError(error);
    return;
  }
  if (error.code === STAGE_LOCKED || error.code === GUARDIAN_CONSENT_PENDING) return;
  if (error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429) captureError(error);
}

/**
 * A gravação que falhou pode ser repetida: sem rede, 5xx ou 429. Outro 4xx é
 * uma recusa do servidor (repetir dá o mesmo), e a falha que não é da API, também não.
 */
export function isRetryableSave(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.code === NETWORK_ERROR || error.status >= 500 || error.status === 429;
}

/** Falha inesperada de uma leitura do Aluno: vai ao Sentry, menos sem rede e o 401. */
export function reportReadFailure(error: unknown): void {
  if (!expected(error)) captureError(error);
}

export type StudentEvent = { type: 'ACTIVITY_STARTED'; versionId: string; activityKey: string };

/**
 * O `ACTIVITY_STARTED` do Aluno, com as regras do Visitante (1.20): sem esperar,
 * sem repetir e sem fila. Sem rede, descartado; o 401 fica com o ponto único da
 * 2.3; outra falha vai ao Sentry. Nunca `deviceId`: o servidor põe o
 * identificador de métricas da conta.
 */
export function sendStudentEvent(event: StudentEvent, online = true): void {
  if (!online) return;
  postAccepted(STUDENT_EVENTS_PATH, {
    type: event.type,
    versionId: event.versionId,
    activityKey: event.activityKey,
  }).catch((error: unknown) => {
    // O adolescente pendente (2.11) não grava eventos de Aluno: a recusa é esperada.
    if (!expected(error) && !(error instanceof ApiError && error.code === GUARDIAN_CONSENT_PENDING)) {
      captureError(error);
    }
  });
}
