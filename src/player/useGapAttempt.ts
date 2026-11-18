// A resposta e a avaliação das lacunas, em volta do `GapFill`: o Completar
// lacunas (1.17) e o Extra Help da Resposta Livre (1.18) usam as mesmas, só com
// o `type` da Answer e a origem das linhas, dos itens e do banco diferentes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

import { captureError } from '../observability/sentry';
import { chooseVariant, tokenizeVariables, useRenderVars, type ContentText } from '../renderer';
import { fillLines, type GapMark, type GapWord } from './GapFill';
import type { ActivityProps } from './registry';
import { stableShuffle } from './shuffle';
import { useEvaluation, type Answer, type AttemptResult } from './useEvaluation';

/** Os `type` cuja Answer é `{type, items: [{itemKey, value}]}`. */
export type GapAnswerType = Extract<Answer['type'], 'gaps' | 'free'>;

/** Os valores da resposta esperada das lacunas (o `expected` de outro Tipo não tem). */
function expectedValues(expected: Answer | undefined, type: GapAnswerType): { itemKey: string; value: string }[] {
  if (!expected || expected.type !== type || !('items' in expected) || !Array.isArray(expected.items)) return [];
  return expected.items as { itemKey: string; value: string }[];
}

export type GapAttemptOptions = Pick<ActivityProps, 'activity' | 'versionId' | 'setFooter' | 'setSheet' | 'advance'> & {
  /** O `type` da Answer: o da Atividade (`gaps` ou `free`). */
  type: GapAnswerType;
  mode: 'bank' | 'typed';
  lines: unknown;
  items: unknown;
  /** O banco do conteúdo; sai embaralhado pela `activityKey` (a ordem do conteúdo segue as lacunas). */
  bank: unknown;
};

/**
 * Os valores das lacunas, a Answer, TENTAR DE NOVO (mantém e trava as certas),
 * a resposta esperada e as marcas depois de VERIFICAR, com o `useEvaluation`.
 * No banco, a Answer leva o texto da palavra com os tokens (`{name}`); digitada,
 * o que o aluno escreveu, com o nome e o país trocados pelos tokens (AD-10).
 */
export function useGapAttempt({
  activity,
  versionId,
  setFooter,
  setSheet,
  advance,
  type,
  mode,
  lines: rawLines,
  items: rawItems,
  bank: rawBank,
}: GapAttemptOptions) {
  const context = useRenderVars();
  const lines = useMemo<ContentText[]>(() => (Array.isArray(rawLines) ? rawLines : []), [rawLines]);
  const items = useMemo<{ itemKey: string }[]>(() => (Array.isArray(rawItems) ? rawItems : []), [rawItems]);
  const bank = useMemo<GapWord[]>(
    () => stableShuffle(Array.isArray(rawBank) ? (rawBank as GapWord[]) : [], activity.activityKey),
    [rawBank, activity.activityKey],
  );
  /** O valor de cada lacuna, na ordem dos itens: a `wordKey` no banco, o texto no `typed`. */
  const [values, setValues] = useState<string[]>(() => items.map(() => ''));
  /** Lacunas certas mantidas e travadas depois de TENTAR DE NOVO. */
  const [kept, setKept] = useState<ReadonlySet<number>>(() => new Set());

  const answer = useMemo<Answer | null>(() => {
    if (items.length === 0 || items.some((_, i) => !values[i]?.trim())) return null;
    try {
      return {
        type,
        items: items.map((item, i) => {
          const value = values[i]!;
          if (mode === 'typed') return { itemKey: item.itemKey, value: tokenizeVariables(value.trim(), context.vars) };
          const word = bank.find((entry) => entry.wordKey === value);
          return { itemKey: item.itemKey, value: word ? chooseVariant(word.text, context.pronoun) : value };
        }),
      };
    } catch (error) {
      captureError(error);
      return null;
    }
  }, [items, values, mode, bank, context, type]);

  const onRetry = useCallback(
    (result: AttemptResult) => {
      const right = new Set(result.items.filter((item) => item.correct).map((item) => item.itemKey));
      const keep = new Set(items.flatMap((item, i) => (right.has(item.itemKey) ? [i] : [])));
      setKept(keep);
      setValues((previous) => previous.map((value, i) => (keep.has(i) ? value : '')));
    },
    [items],
  );

  const expectedLines = useCallback(
    (expected: Answer): ContentText[] => {
      const given = expectedValues(expected, type);
      const filled = items.map((item) => given.find((entry) => entry.itemKey === item.itemKey)?.value ?? '');
      return fillLines(lines, filled, context.pronoun);
    },
    [items, lines, context.pronoun, type],
  );

  const { phase, locked, result } = useEvaluation({
    activity,
    versionId,
    setFooter,
    setSheet,
    advance,
    answer,
    onRetry,
    expectedLines,
  });

  // A Tentativa saiu: o teclado das lacunas digitadas não fica por cima da folha.
  useEffect(() => {
    if (phase === 'checking' && mode === 'typed') Keyboard.dismiss();
  }, [phase, mode]);

  const graded = phase !== 'answering' && phase !== 'checking';
  const marks = useMemo<(GapMark | null)[]>(
    () =>
      items.map((item) => {
        if (!graded) return null;
        const entry = result?.items.find((each) => each.itemKey === item.itemKey);
        return entry ? (entry.correct ? 'right' : 'wrong') : null;
      }),
    [items, graded, result],
  );

  return { lines, bank, values, setValues, kept, marks, locked };
}
