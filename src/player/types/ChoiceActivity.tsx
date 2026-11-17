import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { captureError } from '../../observability/sentry';
import { RenderedText, renderLabel, useRenderVars, type ContentText, type RenderContext } from '../../renderer';
import { ChoiceCard, CHOICE_LETTERS, ModeTag, type ChoiceState } from '../../ui';
import { color, spacing, typography } from '../../ui/tokens';
import type { ActivityProps, ActivityView } from '../registry';
import { useEvaluation, type Answer, type AttemptResult } from '../useEvaluation';

type ChoiceView = Extract<ActivityView, { type: 'choice' }>;
type ChoiceItem = ChoiceView['items'][number];

/** Rótulo da alternativa para o leitor de tela, sem `**`; conteúdo malformado vai ao Sentry. */
function plain(text: ContentText | undefined, { vars, pronoun }: RenderContext): string {
  if (text === undefined || text === null) return '';
  try {
    return renderLabel(text, vars, pronoun);
  } catch (error) {
    captureError(error);
    return '';
  }
}

/** Põe um prefixo em todas as variantes do texto ("1. Good morning"). */
function prefixed(prefix: string, text: ContentText): ContentText {
  if (typeof text === 'string') return `${prefix}${text}`;
  return Object.fromEntries(Object.entries(text).map(([key, value]) => [key, `${prefix}${value}`])) as ContentText;
}

/**
 * Escolha (Vocab Mode, UX-DR80): cada item tem a pergunta e as alternativas
 * A–D, com escolha única por item. VERIFICAR fica desabilitado até todo item
 * ter resposta; a correção vem do servidor pelo `useEvaluation`.
 */
export function ChoiceActivity({ activity, versionId, setFooter, setSheet, advance }: ActivityProps) {
  const context = useRenderVars();
  const view = activity as ChoiceView;
  const items = useMemo<ChoiceItem[]>(() => (Array.isArray(view.items) ? view.items : []), [view.items]);
  /** `itemKey` → `optionKey` escolhida. */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  /** Itens certos mantidos e travados depois de TENTAR DE NOVO. */
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());

  const answer = useMemo<Answer | null>(() => {
    if (items.length === 0 || !items.every((item) => chosen[item.itemKey])) return null;
    return {
      type: 'choice',
      items: items.map((item) => ({ itemKey: item.itemKey, optionKey: chosen[item.itemKey]! })),
    };
  }, [items, chosen]);

  const onRetry = useCallback((result: AttemptResult) => {
    const right = new Set(result.items.filter((item) => item.correct).map((item) => item.itemKey));
    setKept(right);
    setChosen((previous) => Object.fromEntries(Object.entries(previous).filter(([itemKey]) => right.has(itemKey))));
  }, []);

  const expectedLines = useCallback(
    (expected: Answer): ContentText[] =>
      items.flatMap((item, i) => {
        const optionKey = expected.items.find((entry) => entry.itemKey === item.itemKey)?.optionKey;
        const option = item.options.find((entry) => entry.optionKey === optionKey);
        if (!option?.text) return [];
        const letter = CHOICE_LETTERS[item.options.indexOf(option)] ?? '';
        const lead = items.length > 1 ? `${i + 1}. ` : '';
        return [prefixed(`${lead}${letter ? `${letter}, ` : ''}`, option.text)];
      }),
    [items],
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

  const stateOf = (item: ChoiceItem, optionKey: string): ChoiceState => {
    const picked = chosen[item.itemKey] === optionKey;
    const graded = result?.items.find((entry) => entry.itemKey === item.itemKey);
    if (phase === 'revealed') {
      const right = result?.expected?.items.find((entry) => entry.itemKey === item.itemKey)?.optionKey;
      if (optionKey === right) return 'right';
      return picked && graded && !graded.correct ? 'wrong' : 'neutral';
    }
    if (graded && phase !== 'answering' && phase !== 'checking') {
      // Erro sem gabarito: só a escolhida recebe certo ou errado.
      return picked ? (graded.correct ? 'right' : 'wrong') : 'neutral';
    }
    if (picked) return kept.has(item.itemKey) ? 'right' : 'selected';
    return 'neutral';
  };

  return (
    <View style={styles.body} testID="choice-activity">
      <ModeTag label="VOCAB MODE" />
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
      {items.map((item) => (
        <View key={item.itemKey} style={styles.item} testID={`choice-item-${item.itemKey}`}>
          <RenderedText style={styles.question} text={item.question} vars={context.vars} pronoun={context.pronoun} />
          <View style={styles.options}>
            {(Array.isArray(item.options) ? item.options : []).map((option, index) => (
              <ChoiceCard
                key={option.optionKey}
                index={index}
                label={plain(option.text, context)}
                text={<RenderedText text={option.text} vars={context.vars} pronoun={context.pronoun} />}
                state={stateOf(item, option.optionKey)}
                locked={locked || kept.has(item.itemKey)}
                onPress={() => setChosen((previous) => ({ ...previous, [item.itemKey]: option.optionKey }))}
                testID={`choice-${item.itemKey}-${CHOICE_LETTERS[index] ?? index}`}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  title: { ...typography.title, color: color.ink },
  prompt: { ...typography.body, color: color.mutedStrong },
  item: { gap: spacing[3] },
  question: { ...typography.item, color: color.ink },
  options: { gap: spacing[3] },
});
