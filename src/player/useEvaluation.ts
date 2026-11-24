// Fluxo de avaliação (EXPERIENCE.md, Verificar → Acerto | Erro → Tentar de
// novo | Ver resposta; UX-DR63 a UX-DR68). O servidor corrige: o App manda a
// Tentativa e mostra o Resultado, sem gabarito no cliente (FR-25, AD-7).
// Desde a 1.12, a Tentativa e o reveal do Visitante levam o `deviceId`, e o
// recibo que vem no Resultado é guardado no aparelho antes da folha. Desde a
// 2.4, no modo Aluno do player (`usePlayerSession`), as duas vão às rotas
// `/students/me/*`, sem `deviceId` e sem recibo, e o tempo de estudo é o do
// relógio do player.
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, post, type PostBody, type PostData } from '../api/client';
import { messageFor, UNKNOWN_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';
import type { ContentText } from '../renderer';
import { resultLine } from '../ui';
import { visitorStore } from '../visitor/store';
import type { VisitorStore } from '../visitor/types';
import { isGuardianPending, isStageLocked, usePlayerSession } from './playerSession';
import type { ActivityProps, SheetSpec } from './registry';
import { createStudyClock } from './studyClock';

export const CHECK_LABEL = 'VERIFICAR';
export const CONTINUE_LABEL = 'CONTINUAR';
export const RETRY_LABEL = 'TENTAR DE NOVO';
export const REVEAL_LABEL = 'VER RESPOSTA';

export const ATTEMPT_PATH = '/api/v1/visitor/attempts';
export const REVEAL_PATH = '/api/v1/visitor/attempts/reveal';
/** As rotas do Aluno (2.4): o mesmo Resultado, sem `deviceId` nem recibo. */
export const STUDENT_ATTEMPT_PATH = '/api/v1/students/me/attempts';
export const STUDENT_REVEAL_PATH = '/api/v1/students/me/attempts/reveal';

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
  /** Resultado da primeira tentativa, que o Progresso guarda para o resumo do Estágio (1.20). */
  firstPct: number | null;
  /** A última resposta enviada ao VERIFICAR, que o reveal reenvia. */
  lastAnswer: Answer | null;
};

const INITIAL: State = {
  phase: 'answering',
  result: null,
  error: null,
  attempts: 0,
  firstXp: null,
  firstPct: null,
  lastAnswer: null,
};

export type EvaluationOptions = Pick<ActivityProps, 'activity' | 'versionId' | 'setFooter' | 'setSheet' | 'advance'> & {
  /**
   * A resposta completa, ou `null` enquanto falta item (VERIFICAR desabilitado).
   * Com `trigger: 'activity'`, a resposta vem no `check(answer)`.
   */
  answer: Answer | null;
  /**
   * Quem dispara a Tentativa. `footer` (padrão): o VERIFICAR do rodapé.
   * `activity`: a própria Atividade chama `check(answer)` (o microfone da Fala,
   * 1.15) e cuida do rodapé enquanto o aluno responde; a falha do envio volta
   * em `error`, e a folha de feedback segue com o `useEvaluation`.
   */
  trigger?: 'footer' | 'activity';
  /** O que o aluno disse, para a folha: "A gente ouviu: “…”" (Fala). */
  heard?: string | null;
  /** TENTAR DE NOVO: a Atividade mantém e trava os itens certos e limpa os errados. */
  onRetry: (result: AttemptResult) => void;
  /** As linhas da caixa "RESPOSTA ESPERADA", a partir do `expected` do servidor. */
  expectedLines: (expected: Answer) => ContentText[];
  /** A loja do Visitante (`deviceId` e recibos); nos testes, outra. */
  store?: VisitorStore;
};

/** O `deviceId` do aparelho; se a loja falhar, a Tentativa vai sem ele (corrigida, sem recibo). */
async function deviceIdOf(store: VisitorStore): Promise<string | undefined> {
  try {
    return await store.deviceId();
  } catch (error) {
    captureError(error);
    return undefined;
  }
}

/**
 * Guarda o recibo opaco do Resultado, se veio. Falha da loja vai ao Sentry e
 * não segura a folha: o servidor já registrou a Tentativa.
 */
export async function keepReceipt(store: VisitorStore, activityKey: string, receipt: unknown): Promise<void> {
  if (typeof receipt !== 'string' || !receipt) return;
  try {
    await store.recordReceipt(activityKey, receipt);
  } catch (error) {
    captureError(error);
  }
}

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
  trigger = 'footer',
  heard = null,
  store = visitorStore,
}: EvaluationOptions) {
  const [state, setState] = useState<State>(INITIAL);
  const current = useRef(state);
  current.current = state;
  // O modo e o relógio de estudo do player; fora dele (Atividade solta), o Visitante e um relógio próprio.
  const session = usePlayerSession();
  const [ownClock] = useState(() => createStudyClock());
  const clock = session.clock ?? ownClock;
  const { mode, onSaved, onStageLocked, onGuardianPending, claimReplay } = session;
  const alive = useRef(true);
  const finished = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Um `attemptId` por resposta enviada (chave de idempotência da API, AD-9):
  // repetir o mesmo envio depois de uma falha reaproveita o id; ele só muda
  // quando a resposta muda ou quando chega um Resultado. O reveal tem o seu.
  const pendingAttempt = useRef<{ answer: string; attemptId: string } | null>(null);
  const pendingReveal = useRef<string | null>(null);

  const send = useCallback(
    async (kind: 'attempt' | 'reveal', sent: Answer, attemptId: string): Promise<AttemptResult> => {
      const fields = {
        attemptId,
        versionId,
        activityKey: activity.activityKey,
        type: activity.type,
        answer: sent,
        studyTimeMs: clock.elapsed(),
      };
      // O Aluno: sem `deviceId` (corpo fechado na API). O refazer (2.7): `replay` só na primeira
      // resposta da abertura (e nos reenvios dela); o reveal, nunca.
      if (mode === 'student') {
        if (kind === 'reveal') return post(STUDENT_REVEAL_PATH, fields);
        const replay = claimReplay(activity.activityKey, attemptId);
        return post(STUDENT_ATTEMPT_PATH, { ...fields, ...(replay ? { replay: true } : {}) });
      }
      const deviceId = await deviceIdOf(store);
      return post(kind === 'attempt' ? ATTEMPT_PATH : REVEAL_PATH, { ...fields, ...(deviceId ? { deviceId } : {}) });
    },
    [activity.activityKey, activity.type, versionId, clock, mode, store, claimReplay],
  );

  const check = useCallback(
    async (given?: Answer) => {
      const sent = given ?? answer;
      if (!sent || current.current.phase !== 'answering') return;
      current.current = { ...current.current, phase: 'checking' };
      setState((s) => ({ ...s, phase: 'checking', error: null }));
      const key = JSON.stringify(sent);
      if (pendingAttempt.current?.answer !== key) pendingAttempt.current = { answer: key, attemptId: randomUUID() };
      const { attemptId } = pendingAttempt.current;
      try {
        const result = await send('attempt', sent, attemptId);
        // Chegou um Resultado: o próximo VERIFICAR é outra Tentativa.
        if (pendingAttempt.current?.attemptId === attemptId) pendingAttempt.current = null;
        // O Aluno: o servidor gravou (a primeira vale), e o XP é relido. O Visitante: o recibo é
        // gravado antes da folha, e mesmo se o aluno já saiu: o ✕ não o perde.
        if (mode === 'student') onSaved();
        else await keepReceipt(store, activity.activityKey, result.receipt);
        if (!alive.current) return;
        setState((s) => ({
          ...s,
          phase: isHit(result) ? 'correct' : 'wrong',
          result,
          attempts: s.attempts + 1,
          firstXp: s.firstXp ?? Math.max(0, result.xpAwarded),
          // Só a primeira Tentativa: sem `resultPct` nela, fica sem Resultado.
          firstPct: s.attempts === 0 ? (result.resultPct ?? null) : s.firstPct,
          lastAnswer: sent,
        }));
      } catch (error) {
        // O Estágio travado (2.5): o player troca a tela; nada se repete.
        if (mode === 'student' && isStageLocked(error)) {
          onStageLocked();
          return;
        }
        // O adolescente pendente (2.11): o player passa a Visitante; a resposta destrava sem mensagem.
        if (mode === 'student' && isGuardianPending(error) && onGuardianPending) {
          onGuardianPending();
          if (alive.current) setState((s) => ({ ...s, phase: 'answering', error: null }));
          return;
        }
        if (!alive.current) return;
        // A resposta destrava e VERIFICAR volta.
        setState((s) => ({ ...s, phase: 'answering', error: codeOf(error) }));
      }
    },
    [answer, send, store, activity.activityKey, mode, onSaved, onStageLocked, onGuardianPending],
  );

  const reveal = useCallback(async () => {
    const { phase, lastAnswer } = current.current;
    if (phase !== 'wrong' || !lastAnswer) return;
    current.current = { ...current.current, phase: 'revealing' };
    setState((s) => ({ ...s, phase: 'revealing', error: null }));
    pendingReveal.current ??= randomUUID();
    try {
      const result = await send('reveal', lastAnswer, pendingReveal.current);
      pendingReveal.current = null;
      if (!alive.current) return;
      setState((s) => ({ ...s, phase: 'revealed', result }));
    } catch (error) {
      if (mode === 'student' && isStageLocked(error)) {
        onStageLocked();
        return;
      }
      if (mode === 'student' && isGuardianPending(error) && onGuardianPending) {
        onGuardianPending();
        if (alive.current) setState((s) => ({ ...s, phase: 'wrong', error: null }));
        return;
      }
      if (!alive.current) return;
      // A folha de Erro fica, com VER RESPOSTA de novo.
      setState((s) => ({ ...s, phase: 'wrong', error: codeOf(error) }));
    }
  }, [send, mode, onStageLocked, onGuardianPending]);

  const retry = useCallback(() => {
    const { phase, result } = current.current;
    if (phase !== 'wrong' || !result) return;
    onRetry(result);
    // A próxima resposta é outra: o reveal dela terá outro id.
    pendingReveal.current = null;
    setState((s) => ({ ...s, phase: 'answering', result: null, error: null }));
  }, [onRetry]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    const { firstXp, firstPct } = current.current;
    advance({ outcome: 'completed', xp: firstXp ?? 0, ...(firstPct === null ? {} : { resultPct: firstPct }) });
  }, [advance]);

  // Mudou a resposta depois de uma falha: a mensagem era da resposta anterior, que nem foi enviada.
  useEffect(() => {
    setState((s) => (s.phase === 'answering' && s.error ? { ...s, error: null } : s));
  }, [answer]);

  const { phase, result, error, attempts, firstXp } = state;

  useEffect(() => {
    if (phase === 'answering' || phase === 'checking') {
      setSheet(null);
      // Disparo pela Atividade: o rodapé é dela enquanto o aluno responde.
      if (trigger === 'activity') return;
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
    const shared = {
      result: resultOf(result),
      ...(error ? { error: messageFor(error) } : {}),
      ...(heard ? { heard } : {}),
    };
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
    trigger,
    heard,
  ]);

  return {
    phase,
    /** A resposta está travada (fora de `answering`). */
    locked: phase !== 'answering',
    /** O último Resultado (vazio depois de TENTAR DE NOVO). */
    result,
    /** Tentativas corrigidas pelo servidor. */
    attempts,
    /** Manda a Tentativa (com `trigger: 'activity'`, a resposta vem aqui). */
    check,
    /** Código da última falha do envio, enquanto o aluno responde (para `messageFor`). */
    error: phase === 'answering' ? error : null,
  };
}
