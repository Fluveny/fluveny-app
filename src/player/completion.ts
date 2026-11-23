// Conclusão sem correção (história 1.12): uma Atividade vista ou pulada passa
// pela rota `completions` antes de entrar no Progresso, para o servidor emitir
// o recibo da primeira conclusão do aparelho. No modo Visitante, só o
// `deviceId` vai à API; variáveis, Progresso e recibos ficam no aparelho.
//
// No modo Aluno (2.4), a conclusão vai a `/students/me/completions`, sem
// `deviceId` e sem recibo: o servidor grava a primeira, e a falha vira o estado
// "salvar falhou" do player (o 4xx, fora o 401 e o 429, vai também ao Sentry;
// só a falha de rede, o 5xx e o 429 podem ser repetidos, `retryable`).
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, post, type PostBody, type PostData } from '../api/client';
import { UNKNOWN_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';
import type { Outcome, VisitorStore } from '../visitor/types';
import type { PlayerMode } from './playerSession';
import { isRetryableSave, reportSaveFailure } from './studentProgress';
import { createStudyClock, type StudyClock } from './studyClock';
import { keepReceipt } from './useEvaluation';

export const COMPLETION_PATH = '/api/v1/visitor/completions';
/** A conclusão do Aluno (2.4): o mesmo Resultado, sem `deviceId` nem recibo. */
export const STUDENT_COMPLETION_PATH = '/api/v1/students/me/completions';

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
  /** Padrão: o Visitante. */
  mode?: PlayerMode;
  store: VisitorStore;
  activityKey: string;
  versionId: string;
  outcome: UngradedOutcome;
  /** O mesmo id ao repetir o envio depois de uma falha (idempotência, AD-9). */
  attemptId: string;
  studyTimeMs: number;
};

/**
 * Registra a conclusão no servidor e guarda o recibo, se veio (só o Visitante).
 * Falha da rede, da API ou do `deviceId` sobe para quem chamou (a tela fica e
 * mostra o erro).
 */
export async function completeActivity({
  mode = 'visitor',
  store,
  activityKey,
  versionId,
  outcome,
  attemptId,
  studyTimeMs,
}: CompletionRequest): Promise<CompletionResult> {
  if (mode === 'student') {
    return post(STUDENT_COMPLETION_PATH, {
      attemptId,
      versionId,
      activityKey,
      outcome: OUTCOME[outcome],
      studyTimeMs: Math.max(0, Math.round(studyTimeMs)),
    });
  }
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

const noop = () => {};

/** O modo do player, o relógio de estudo e o aviso de gravação confirmada do Aluno. */
export type CompletionSession = { mode: PlayerMode | null; clock: StudyClock; onSaved: () => void };

/**
 * A conclusão `viewed`/`skipped` da Atividade exibida no player: o tempo de
 * estudo é o do relógio do player, o mesmo `attemptId` vai ao repetir depois
 * de uma falha, e o código da falha fica guardado (some com outra Atividade).
 * Sem o modo decidido (`mode: null`), nada é enviado. Sem `session` (fora do
 * player), o Visitante, com um relógio próprio.
 */
export function useCompletion(
  store: VisitorStore,
  activityKey: string | undefined,
  versionId: string | undefined,
  session?: CompletionSession,
) {
  const [ownClock] = useState(() => createStudyClock());
  const mode = session ? session.mode : 'visitor';
  const clock = session?.clock ?? ownClock;
  const onSaved = session?.onSaved ?? noop;
  const [completing, setCompleting] = useState(false);
  const [failure, setFailure] = useState<{ activityKey: string; code: string; retryable: boolean } | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  const pending = useRef<{ key: string; attemptId: string } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const complete = useCallback(
    async (outcome: UngradedOutcome): Promise<Completed> => {
      // Sem a Atividade ou o `versionId` do Estágio, não há o que registrar.
      if (running.current || !activityKey || !versionId || !mode) return { status: 'busy' };
      running.current = true;
      setCompleting(true);
      setFailure(null);
      const key = `${activityKey}:${outcome}`;
      if (pending.current?.key !== key) pending.current = { key, attemptId: randomUUID() };
      let result: CompletionResult;
      try {
        result = await completeActivity({
          mode,
          store,
          activityKey,
          versionId,
          outcome,
          attemptId: pending.current.attemptId,
          studyTimeMs: clock.elapsed(),
        });
        pending.current = null;
      } catch (error) {
        if (mode === 'student') reportSaveFailure(error);
        const code = mode === 'student' ? (error instanceof ApiError ? error.code : UNKNOWN_ERROR) : codeOf(error);
        if (alive.current) setFailure({ activityKey, code, retryable: isRetryableSave(error) });
        return { status: alive.current ? 'failed' : 'gone' };
      } finally {
        running.current = false;
        if (alive.current) setCompleting(false);
      }
      // O Aluno: o servidor gravou, e o XP é relido (também com o player já fechado).
      if (mode === 'student') onSaved();
      // Saiu durante o envio: o recibo ficou, o Progresso não (como o ✕ depois do Resultado).
      return alive.current ? { status: 'done', result } : { status: 'gone' };
    },
    [store, activityKey, versionId, mode, clock, onSaved],
  );

  /** Esquece a falha (a Resposta Livre trocou pelo Extra Help, 1.18: a mensagem do ENVIAR não vale mais). */
  const clearError = useCallback(() => setFailure(null), []);

  return {
    complete,
    clearError,
    completing,
    /** O código da última falha, só enquanto a Atividade em que ela aconteceu está na tela. */
    error: failure && failure.activityKey === activityKey ? failure.code : null,
    /** A última falha pode ser repetida (sem rede, 5xx ou 429); outro 4xx é recusa do servidor. */
    retryable: failure !== null && failure.activityKey === activityKey && failure.retryable,
  };
}
