import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { captureError } from '../../observability/sentry';
import {
  chooseVariant,
  ExpressionsInert,
  RenderedText,
  renderLabel,
  useRenderVars,
  type ContentText,
  type RenderContext,
} from '../../renderer';
import { MatchCard, ModeTag, type MatchState } from '../../ui';
import { color, spacing, typography } from '../../ui/tokens';
import type { ActivityProps, ActivityView } from '../registry';
import { stableShuffle } from '../shuffle';
import { useEvaluation, type Answer, type AttemptResult } from '../useEvaluation';

type MatchView = Extract<ActivityView, { type: 'match' }>;
type MatchItem = MatchView['items'][number];
type MatchResponse = MatchView['responses'][number];

/** O cartão tocado, esperando o outro lado do par. */
type Selection = { side: 'item' | 'response'; key: string } | null;

const PRONOUNS = ['he', 'she', 'they'] as const;
const SPELLED = ['', 'One', 'Two', 'Three'] as const;

/** O aviso dos distratores (respostas − falas): "One answer is left over.", "Two answers are left over."… */
export function spareNotice(spare: number): string | null {
  if (spare <= 0) return null;
  if (spare === 1) return 'One answer is left over.';
  return `${SPELLED[spare] ?? spare} answers are left over.`;
}

/** Rótulo do cartão para o leitor de tela, sem `**`; conteúdo malformado vai ao Sentry. */
function plain(text: ContentText | undefined, { vars, pronoun }: RenderContext): string {
  if (text === undefined || text === null) return '';
  try {
    return renderLabel(text, vars, pronoun);
  } catch (error) {
    captureError(error);
    return '';
  }
}

/** Junta pedaços do conteúdo numa linha, por variante de pronome quando algum tem variantes. */
function joined(parts: (string | ContentText)[]): ContentText {
  if (parts.every((part) => typeof part === 'string')) return parts.join('');
  return Object.fromEntries(
    PRONOUNS.map((pronoun) => [pronoun, parts.map((part) => chooseVariant(part, pronoun)).join('')]),
  ) as ContentText;
}

/** Os pares da resposta esperada do Associar (o `expected` de outro Tipo não tem). */
function expectedPairs(expected: Answer | undefined): { itemKey: string; responseKey: string }[] {
  if (!expected || expected.type !== 'match' || !('items' in expected) || !Array.isArray(expected.items)) return [];
  return expected.items as { itemKey: string; responseKey: string }[];
}

/**
 * Associar (Match the Speech Bubbles, FR-20, UX-DR76): as falas de Alex em cima
 * e as respostas embaixo, embaralhadas. O par se forma por toque e toque (fala
 * e resposta, em qualquer ordem) e se desfaz tocando num dos dois. VERIFICAR
 * fica liberado com todas as falas ligadas; a Answer leva só as chaves.
 */
export function MatchActivity({ activity, versionId, setFooter, setSheet, advance }: ActivityProps) {
  const context = useRenderVars();
  const view = activity as MatchView;
  const items = useMemo<MatchItem[]>(() => (Array.isArray(view.items) ? view.items : []), [view.items]);
  const responses = useMemo<MatchResponse[]>(
    () => stableShuffle(Array.isArray(view.responses) ? view.responses : [], view.activityKey),
    [view.responses, view.activityKey],
  );
  /** `itemKey` → `responseKey` ligada. */
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<Selection>(null);
  /** Pares certos mantidos e travados depois de TENTAR DE NOVO. */
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());

  const answer = useMemo<Answer | null>(() => {
    if (items.length === 0 || !items.every((item) => pairs[item.itemKey])) return null;
    return {
      type: 'match',
      items: items.map((item) => ({ itemKey: item.itemKey, responseKey: pairs[item.itemKey]! })),
    };
  }, [items, pairs]);

  const onRetry = useCallback((result: AttemptResult) => {
    const right = new Set(result.items.filter((item) => item.correct).map((item) => item.itemKey));
    setKept(right);
    setSelection(null);
    setPairs((previous) => Object.fromEntries(Object.entries(previous).filter(([itemKey]) => right.has(itemKey))));
  }, []);

  const expectedLines = useCallback(
    (expected: Answer): ContentText[] =>
      items.flatMap((item, i) => {
        const responseKey = expectedPairs(expected).find((entry) => entry.itemKey === item.itemKey)?.responseKey;
        const response = view.responses?.find((entry) => entry.responseKey === responseKey);
        if (!response?.text || !item.line) return [];
        try {
          return [joined([`${i + 1}. `, item.line, ' → ', response.text])];
        } catch (error) {
          captureError(error);
          return [];
        }
      }),
    [items, view.responses],
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

  /** A fala ligada a cada resposta. */
  const ownerOf = useMemo(
    () => new Map(Object.entries(pairs).map(([itemKey, responseKey]) => [responseKey, itemKey])),
    [pairs],
  );
  const numberOf = (itemKey: string) => items.findIndex((item) => item.itemKey === itemKey) + 1;

  const unpair = (itemKey: string) => {
    setPairs(({ [itemKey]: _removed, ...rest }) => rest);
    setSelection(null);
  };

  const pressItem = (itemKey: string) => {
    if (pairs[itemKey]) return unpair(itemKey);
    if (selection?.side === 'item' && selection.key === itemKey) return setSelection(null);
    if (selection?.side === 'response') {
      setPairs((previous) => ({ ...previous, [itemKey]: selection.key }));
      return setSelection(null);
    }
    setSelection({ side: 'item', key: itemKey });
  };

  const pressResponse = (responseKey: string) => {
    const owner = ownerOf.get(responseKey);
    if (owner) return unpair(owner);
    if (selection?.side === 'response' && selection.key === responseKey) return setSelection(null);
    if (selection?.side === 'item') {
      setPairs((previous) => ({ ...previous, [selection.key]: responseKey }));
      return setSelection(null);
    }
    setSelection({ side: 'response', key: responseKey });
  };

  const graded = phase !== 'answering' && phase !== 'checking';
  /** O estado do par da fala `itemKey` (e da resposta ligada a ela). */
  const pairState = (itemKey: string): MatchState => {
    if (graded) {
      const entry = result?.items.find((item) => item.itemKey === itemKey);
      if (entry) return entry.correct ? 'right' : 'wrong';
    }
    if (kept.has(itemKey)) return 'right';
    return 'paired';
  };

  const itemState = (itemKey: string): MatchState => {
    if (pairs[itemKey]) return pairState(itemKey);
    return selection?.side === 'item' && selection.key === itemKey ? 'selected' : 'neutral';
  };

  const responseState = (responseKey: string): MatchState => {
    const owner = ownerOf.get(responseKey);
    if (owner) return pairState(owner);
    return selection?.side === 'response' && selection.key === responseKey ? 'selected' : 'neutral';
  };

  const notice = spareNotice(responses.length - items.length);
  const responseText = (responseKey: string | undefined) =>
    plain(view.responses?.find((entry) => entry.responseKey === responseKey)?.text, context);
  const itemText = (itemKey: string | undefined) =>
    plain(items.find((entry) => entry.itemKey === itemKey)?.line, context);

  return (
    <View style={styles.body} testID="match-activity">
      <ModeTag label="GAME TIME" />
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
      <View style={styles.cards}>
        {items.map((item) => {
          const responseKey = pairs[item.itemKey];
          return (
            <MatchCard
              key={item.itemKey}
              label={plain(item.line, context)}
              text={
                // O toque no trecho de Expressão Útil liga o cartão, não abre a folha.
                <ExpressionsInert>
                  <RenderedText text={item.line} vars={context.vars} pronoun={context.pronoun} />
                </ExpressionsInert>
              }
              {...(responseKey ? { pair: numberOf(item.itemKey), pairedWith: responseText(responseKey) } : {})}
              state={itemState(item.itemKey)}
              locked={locked || kept.has(item.itemKey)}
              onPress={() => pressItem(item.itemKey)}
              testID={`match-item-${item.itemKey}`}
            />
          );
        })}
      </View>
      <View style={styles.cards}>
        {responses.map((response) => {
          const owner = ownerOf.get(response.responseKey);
          return (
            <MatchCard
              key={response.responseKey}
              label={plain(response.text, context)}
              text={
                <ExpressionsInert>
                  <RenderedText text={response.text} vars={context.vars} pronoun={context.pronoun} />
                </ExpressionsInert>
              }
              {...(owner ? { pair: numberOf(owner), pairedWith: itemText(owner) } : {})}
              state={responseState(response.responseKey)}
              locked={locked || (owner !== undefined && kept.has(owner))}
              onPress={() => pressResponse(response.responseKey)}
              testID={`match-response-${response.responseKey}`}
            />
          );
        })}
      </View>
      {notice ? (
        <Text style={styles.notice} testID="match-spare">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  title: { ...typography.title, color: color.ink },
  prompt: { ...typography.body, color: color.mutedStrong },
  cards: { gap: spacing[3] },
  notice: { ...typography.body, color: color.mutedStrong },
});
