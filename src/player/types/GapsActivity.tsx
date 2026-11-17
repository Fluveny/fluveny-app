import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { captureError } from '../../observability/sentry';
import { chooseVariant, RenderedText, tokenizeVariables, useRenderVars, type ContentText } from '../../renderer';
import { ModeTag } from '../../ui';
import { color, spacing, typography } from '../../ui/tokens';
import { fillLines, GapFill, type GapMark, type GapWord } from '../GapFill';
import type { ActivityProps, ActivityView } from '../registry';
import { useEvaluation, type Answer, type AttemptResult } from '../useEvaluation';
import { stableShuffle } from './MatchActivity';

type GapsView = Extract<ActivityView, { type: 'gaps' }>;
type GapsItem = GapsView['items'][number];

/** Os valores da resposta esperada das Lacunas (o `expected` de outro Tipo não tem). */
function expectedValues(expected: Answer | undefined): { itemKey: string; value: string }[] {
  if (!expected || expected.type !== 'gaps' || !('items' in expected) || !Array.isArray(expected.items)) return [];
  return expected.items as { itemKey: string; value: string }[];
}

/**
 * Completar lacunas (Fill in the Gaps, FR-19, UX-DR83, UX-DR84): as linhas com
 * as lacunas, e o banco de palavras (`bank`) ou um campo por lacuna (`typed`).
 * A mecânica é o `GapFill`; aqui ficam a resposta e a avaliação. VERIFICAR
 * fica liberado sem lacuna vazia. No banco, a Answer leva o texto da palavra
 * com os tokens (`{name}`); digitada, o que o aluno escreveu, com o nome e o
 * país trocados pelos tokens (AD-10).
 */
export function GapsActivity({ activity, versionId, setFooter, setSheet, advance }: ActivityProps) {
  const context = useRenderVars();
  const view = activity as GapsView;
  const mode = view.mode === 'typed' ? 'typed' : 'bank';
  const lines = useMemo<ContentText[]>(() => (Array.isArray(view.lines) ? view.lines : []), [view.lines]);
  const items = useMemo<GapsItem[]>(() => (Array.isArray(view.items) ? view.items : []), [view.items]);
  // A ordem do banco no conteúdo segue as lacunas: embaralhada, ela não entrega o gabarito.
  const bank = useMemo<GapWord[]>(
    () => stableShuffle(Array.isArray(view.bank) ? view.bank : [], view.activityKey),
    [view.bank, view.activityKey],
  );
  /** O valor de cada lacuna, na ordem dos itens: a `wordKey` no banco, o texto no `typed`. */
  const [values, setValues] = useState<string[]>(() => items.map(() => ''));
  /** Lacunas certas mantidas e travadas depois de TENTAR DE NOVO. */
  const [kept, setKept] = useState<ReadonlySet<number>>(() => new Set());

  const answer = useMemo<Answer | null>(() => {
    if (items.length === 0 || items.some((_, i) => !values[i]?.trim())) return null;
    try {
      return {
        type: 'gaps',
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
  }, [items, values, mode, bank, context]);

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
      const given = expectedValues(expected);
      const filled = items.map((item) => given.find((entry) => entry.itemKey === item.itemKey)?.value ?? '');
      return fillLines(lines, filled, context.pronoun);
    },
    [items, lines, context.pronoun],
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

  return (
    <View style={styles.body} testID="gaps-activity">
      <ModeTag label="FILL IN THE GAPS" />
      <RenderedText
        style={styles.title}
        accessibilityRole="header"
        text={view.title}
        vars={context.vars}
        pronoun={context.pronoun}
      />
      {view.prompt ? (
        <RenderedText style={styles.prompt} text={view.prompt} vars={context.vars} pronoun={context.pronoun} />
      ) : null}
      <GapFill
        lines={lines}
        mode={mode}
        bank={bank}
        values={values}
        onChange={setValues}
        marks={marks}
        kept={kept}
        disabled={locked}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  title: { ...typography.title, color: color.ink },
  prompt: { ...typography.body, color: color.mutedStrong },
});
