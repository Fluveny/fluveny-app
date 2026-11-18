// Conclusão sem correção (história 1.12): uma Atividade vista ou pulada passa
// pela rota `completions` antes de entrar no Progresso, para o servidor emitir
// o recibo da primeira conclusão do aparelho. Só o `deviceId` vai à API;
// variáveis, Progresso e recibos ficam no aparelho.
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, post, type PostBody, type PostData } from '../api/client';
import { UNKNOWN_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';
import type { Outcome, VisitorStore } from '../visitor/types';
import { keepReceipt } from './useEvaluation';

export const COMPLETION_PATH = '/api/v1/visitor/completions';

export type CompletionOutcome = PostBody<typeof COMPLETION_PATH>['outcome'];
export type CompletionResult = PostData<typeof COMPLETION_PATH>;

/** O `Outcome` do Progresso que precisa da rota `completions`. */
export type UngradedOutcome = Extract<Outcome, 'viewed' | 'skipped'>;

const OUTCOME: Record<UngradedOutcome, CompletionOutcome> = { viewed: 'VIEWED', skipped: 'SKIPPED' };

/** `viewed` e `skipped` passam pela rota `completions`; `completed` já passou pela Tentativa. */
export function needsCompletion(outcome: Outcome): outcome is UngradedOutcome {
  return Object.prototype.hasOwnProperty.call(OUTCOME, outcome);
}

export type CompletionRequest = {
  store: VisitorStore;
  activityKey: string;
  versionId: string;
  outcome: UngradedOutcome;
  /** O mesmo id ao repetir o envio depois de uma falha (idempotência, AD-9). */
  attemptId: string;
  studyTimeMs: number;
};

/**
 * Registra a conclusão no servidor e guarda o recibo, se veio. Falha da rede,
 * da API ou do `deviceId` sobe para quem chamou (a tela fica e mostra o erro).
 */
export async function completeActivity({
  store,
  activityKey,
  versionId,
  outcome,
  attemptId,
  studyTimeMs,
}: CompletionRequest): Promise<CompletionResult> {
  const deviceId = await store.deviceId();
  const result = await post(COMPLETION_PATH, {
    attemptId,
    deviceId,
    versionId,
    activityKey,
    outcome: OUTCOME[outcome],
    studyTimeMs: Math.max(0, Math.round(studyTimeMs)),
  });
  await keepReceipt(store, activityKey, result.receipt);
  return result;
}

/** Como terminou `complete`: registrado, falhou (a tela fica), ocupado ou o player saiu. */
export type CompletionStatus = 'done' | 'failed' | 'busy' | 'gone';

/** O fim de `complete`, com o Resultado da API quando registrou (a `modelAnswer` da Resposta Livre, 1.18). */
export type Completed = { status: CompletionStatus; result?: CompletionResult };

/** O `code` da falha da API; outra falha vai ao Sentry e vira o genérico. */
function codeOf(failure: unknown): string {
  if (failure instanceof ApiError) return failure.code;
  captureError(failure);
  return UNKNOWN_ERROR;
}

/**
 * A conclusão `viewed`/`skipped` da Atividade exibida no player: conta o tempo
 * de estudo desde que ela apareceu, mantém o mesmo `attemptId` ao repetir
 * depois de uma falha e guarda o código da falha (que some com outra Atividade).
 */
export function useCompletion(store: VisitorStore, activityKey: string | undefined, versionId: string | undefined) {
  const [completing, setCompleting] = useState(false);
  const [failure, setFailure] = useState<{ activityKey: string; code: string } | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  const startedAt = useRef(0);
  const pending = useRef<{ key: string; attemptId: string } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    startedAt.current = Date.now();
  }, [activityKey]);

  const complete = useCallback(
    async (outcome: UngradedOutcome): Promise<Completed> => {
      // Sem a Atividade ou o `versionId` do Estágio, não há o que registrar.
      if (running.current || !activityKey || !versionId) return { status: 'busy' };
      running.current = true;
      setCompleting(true);
      setFailure(null);
      const key = `${activityKey}:${outcome}`;
      if (pending.current?.key !== key) pending.current = { key, attemptId: randomUUID() };
      let result: CompletionResult;
      try {
        result = await completeActivity({
          store,
          activityKey,
          versionId,
          outcome,
          attemptId: pending.current.attemptId,
          studyTimeMs: Date.now() - startedAt.current,
        });
        pending.current = null;
      } catch (error) {
        const code = codeOf(error);
        if (alive.current) setFailure({ activityKey, code });
        return { status: alive.current ? 'failed' : 'gone' };
      } finally {
        running.current = false;
        if (alive.current) setCompleting(false);
      }
      // Saiu durante o envio: o recibo ficou, o Progresso não (como o ✕ depois do Resultado).
      return alive.current ? { status: 'done', result } : { status: 'gone' };
    },
    [store, activityKey, versionId],
  );

  /** Esquece a falha (a Resposta Livre trocou pelo Extra Help, 1.18: a mensagem do ENVIAR não vale mais). */
  const clearError = useCallback(() => setFailure(null), []);

  /** O tempo de estudo da Atividade na tela, desde que ela apareceu (o Progresso o guarda, 1.20). */
  const elapsedMs = useCallback(() => Math.max(0, Date.now() - startedAt.current), []);

  return {
    complete,
    clearError,
    elapsedMs,
    completing,
    /** O código da última falha, só enquanto a Atividade em que ela aconteceu está na tela. */
    error: failure && failure.activityKey === activityKey ? failure.code : null,
  };
}
