// Fluxo de avaliação (EXPERIENCE.md, Verificar → Acerto | Erro → Tentar de
// novo | Ver resposta; UX-DR63 a UX-DR68). O servidor corrige: o App manda a
// Tentativa e mostra o Resultado, sem gabarito no cliente (FR-25, AD-7).
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, post, type PostBody, type PostData } from '../api/client';
import { messageFor, UNKNOWN_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';
import type { ContentText } from '../renderer';
import { resultLine } from '../ui';
import type { ActivityProps, SheetSpec } from './registry';

export const CHECK_LABEL = 'VERIFICAR';
export const CONTINUE_LABEL = 'CONTINUAR';
export const RETRY_LABEL = 'TENTAR DE NOVO';
export const REVEAL_LABEL = 'VER RESPOSTA';

export const ATTEMPT_PATH = '/api/v1/visitor/attempts';
export const REVEAL_PATH = '/api/v1/visitor/attempts/reveal';

export type Answer = PostBody<typeof ATTEMPT_PATH>['answer'];
export type AttemptResult = PostData<typeof ATTEMPT_PATH>;

/**
 * `answering`: o aluno responde. `checking`: a Tentativa foi enviada. `correct`
 * e `wrong`: a folha do Resultado. `revealing`: "Ver resposta" foi pedido.
 * `revealed`: a folha "Vamos revisar"; as tentativas acabaram.
 */
export type EvaluationPhase = 'answering' | 'checking' | 'correct' | 'wrong' | 'revealing' | 'revealed';

type State = {
  phase: EvaluationPhase;
  /** O último Resultado mostrado (do VERIFICAR ou do reveal). */
  result: AttemptResult | null;
  /** Código da última falha de rede ou da API. */
  error: string | null;
  /** Tentativas corrigidas pelo servidor. */
  attempts: number;
  /** XP da primeira tentativa: o único que vale (FR-26). */
  firstXp: number | null;
  /** A última resposta enviada ao VERIFICAR, que o reveal reenvia. */
  lastAnswer: Answer | null;
};

const INITIAL: State = { phase: 'answering', result: null, error: null, attempts: 0, firstXp: null, lastAnswer: null };

export type EvaluationOptions = Pick<ActivityProps, 'activity' | 'versionId' | 'setFooter' | 'setSheet' | 'advance'> & {
  /** A resposta completa, ou `null` enquanto falta item (VERIFICAR desabilitado). */
  answer: Answer | null;
  /** TENTAR DE NOVO: a Atividade mantém e trava os itens certos e limpa os errados. */
  onRetry: (result: AttemptResult) => void;
  /** As linhas da caixa "RESPOSTA ESPERADA", a partir do `expected` do servidor. */
  expectedLines: (expected: Answer) => ContentText[];
};

const codeOf = (error: unknown) => {
  if (error instanceof ApiError) return error.code;
  captureError(error);
  return UNKNOWN_ERROR;
};

/** Acerto é todo item certo: o `resultPct` arredonda (com muitos itens, um erro ainda dá 100). */
function isHit(result: AttemptResult): boolean {
  const items = Array.isArray(result.items) ? result.items : [];
  return items.length > 0 ? items.every((item) => item.correct) : result.resultPct === 100;
}

/** A linha "Resultado: n de m itens · x%", só com mais de um item. */
function resultOf(result: AttemptResult): string | undefined {
  const items = Array.isArray(result.items) ? result.items : [];
  if (items.length <= 1) return undefined;
  return resultLine(items.filter((item) => item.correct).length, items.length, result.resultPct);
}

function justificationsOf(result: AttemptResult): ContentText[] {
  return (Array.isArray(result.items) ? result.items : []).flatMap((item) =>
    item.justification === undefined || item.justification === null ? [] : [item.justification],
  );
}

/**
 * Liga a Atividade avaliada ao servidor: monta o rodapé (VERIFICAR) e a folha
 * de feedback, e guarda o XP da primeira tentativa, que o CONTINUAR grava no
 * Progresso. Falha de rede ou da API mostra `messageFor(code)` e devolve a ação.
 */
export function useEvaluation({
  activity,
  versionId,
  setFooter,
  setSheet,
  advance,
  answer,
  onRetry,
  expectedLines,
}: EvaluationOptions) {
  const [state, setState] = useState<State>(INITIAL);
  const current = useRef(state);
  current.current = state;
  // O tempo de estudo conta desde a montagem da Atividade.
  const [startedAt] = useState(() => Date.now());
  const alive = useRef(true);
  const finished = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const send = useCallback(
    (path: typeof ATTEMPT_PATH | typeof REVEAL_PATH, sent: Answer) =>
      post(path, {
        attemptId: randomUUID(),
        versionId,
        activityKey: activity.activityKey,
        type: activity.type,
        answer: sent,
        studyTimeMs: Math.max(0, Math.round(Date.now() - startedAt)),
      }),
    [activity.activityKey, activity.type, versionId, startedAt],
  );

  const check = useCallback(async () => {
    if (!answer || current.current.phase !== 'answering') return;
    current.current = { ...current.current, phase: 'checking' };
    setState((s) => ({ ...s, phase: 'checking', error: null }));
    try {
      const result = await send(ATTEMPT_PATH, answer);
      if (!alive.current) return;
      setState((s) => ({
        ...s,
        phase: isHit(result) ? 'correct' : 'wrong',
        result,
        attempts: s.attempts + 1,
        firstXp: s.firstXp ?? Math.max(0, result.xpAwarded),
        lastAnswer: answer,
      }));
    } catch (error) {
      if (!alive.current) return;
      // A resposta destrava e VERIFICAR volta.
      setState((s) => ({ ...s, phase: 'answering', error: codeOf(error) }));
    }
  }, [answer, send]);

  const reveal = useCallback(async () => {
    const { phase, lastAnswer } = current.current;
    if (phase !== 'wrong' || !lastAnswer) return;
    current.current = { ...current.current, phase: 'revealing' };
    setState((s) => ({ ...s, phase: 'revealing', error: null }));
    try {
      const result = await send(REVEAL_PATH, lastAnswer);
      if (!alive.current) return;
      setState((s) => ({ ...s, phase: 'revealed', result }));
    } catch (error) {
      if (!alive.current) return;
      // A folha de Erro fica, com VER RESPOSTA de novo.
      setState((s) => ({ ...s, phase: 'wrong', error: codeOf(error) }));
    }
  }, [send]);

  const retry = useCallback(() => {
    const { phase, result } = current.current;
    if (phase !== 'wrong' || !result) return;
    onRetry(result);
    setState((s) => ({ ...s, phase: 'answering', result: null, error: null }));
  }, [onRetry]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    advance({ outcome: 'completed', xp: current.current.firstXp ?? 0 });
  }, [advance]);

  // Mudou a resposta depois de uma falha: a mensagem era da resposta anterior, que nem foi enviada.
  useEffect(() => {
    setState((s) => (s.phase === 'answering' && s.error ? { ...s, error: null } : s));
  }, [answer]);

  const { phase, result, error, attempts, firstXp } = state;

  useEffect(() => {
    if (phase === 'answering' || phase === 'checking') {
      setSheet(null);
      setFooter({
        label: CHECK_LABEL,
        disabled: !answer,
        busy: phase === 'checking',
        onPress: () => void check(),
        ...(error ? { message: messageFor(error) } : {}),
      });
      return;
    }
    if (!result) return;
    const shared = { result: resultOf(result), ...(error ? { error: messageFor(error) } : {}) };
    let sheet: SheetSpec;
    if (phase === 'correct') {
      sheet = {
        ...shared,
        tone: 'correct',
        // O selo "+XP" só na primeira tentativa, e se ela rendeu XP.
        ...(attempts === 1 && firstXp ? { xpGain: firstXp } : {}),
        justifications: justificationsOf(result),
        actions: [{ label: CONTINUE_LABEL, variant: 'success', onPress: finish }],
      };
    } else if (phase === 'revealed') {
      sheet = {
        ...shared,
        tone: 'review',
        expected: result.expected ? expectedLines(result.expected) : [],
        justifications: justificationsOf(result),
        actions: [{ label: CONTINUE_LABEL, variant: 'primary', onPress: finish }],
      };
    } else {
      sheet = {
        ...shared,
        tone: 'wrong',
        actions: [
          { label: RETRY_LABEL, variant: 'primary', onPress: retry },
          {
            label: REVEAL_LABEL,
            variant: 'ghost',
            onPress: () => void reveal(),
            busy: phase === 'revealing',
            network: true,
          },
        ],
      };
    }
    setSheet(sheet);
  }, [
    phase,
    result,
    error,
    attempts,
    firstXp,
    answer,
    check,
    reveal,
    retry,
    finish,
    expectedLines,
    setFooter,
    setSheet,
  ]);

  return {
    phase,
    /** A resposta está travada (fora de `answering`). */
    locked: phase !== 'answering',
    /** O último Resultado (vazio depois de TENTAR DE NOVO). */
    result,
  };
}
