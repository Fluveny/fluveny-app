import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { captureError } from '../../observability/sentry';
import {
  ExpressionContext,
  format,
  render,
  RenderedText,
  renderLabel,
  useExpressions,
  useRenderVars,
  type ContentText,
  type ExpressionTaps,
  type RenderContext,
} from '../../renderer';
import { ExpressionCard, SpeechBubble, WordChip } from '../../ui';
import { color, fontFamily, spacing, typography } from '../../ui/tokens';
import type { ActivityProps, ActivityView } from '../registry';

type ExpressionView = Extract<ActivityView, { type: 'expression' }>;

export const EXPRESSION_EYEBROW_TITLE = 'USEFUL EXPRESSIONS';
export const CONTINUE_LABEL = 'CONTINUAR';

/** As chaves `[[…|chave]]` da frase, na ordem e sem repetir; conteúdo malformado vai ao Sentry. */
function keysOf(text: ContentText | undefined, { vars, pronoun }: RenderContext): string[] {
  if (text === undefined || text === null) return [];
  try {
    const keys = format(render(text, vars, pronoun)).flatMap((run) => (run.expression ? [run.expression] : []));
    return [...new Set(keys)];
  } catch (error) {
    captureError(error);
    return [];
  }
}

/** Texto puro do termo, para o chip; conteúdo malformado vai ao Sentry. */
function plain(text: ContentText, { vars, pronoun }: RenderContext): string {
  try {
    return renderLabel(text, vars, pronoun);
  } catch (error) {
    captureError(error);
    return '';
  }
}

/**
 * Expressão Útil destacada (FR-14, UX-DR73): Alex (avatar) diz a frase num
 * balão, com os termos da Unidade tocáveis. Com mais de um termo, um chip por
 * termo, na ordem da frase, alterna o termo ativo. O cartão de dicionário do
 * termo ativo fica fixo abaixo. Tocar num termo da frase só troca o termo
 * ativo, sem abrir a folha. CONTINUAR conclui com `viewed`.
 */
export function ExpressionActivity({ activity, setFooter, advance }: ActivityProps) {
  const context = useRenderVars();
  const view = activity as ExpressionView;
  const taps = useExpressions();

  // Só os termos que a Unidade conhece; chave desconhecida fica como texto comum.
  const terms = useMemo(
    () =>
      keysOf(view.sentence, context).flatMap((key) => {
        const entry = taps?.find(key);
        return entry ? [entry] : [];
      }),
    [view.sentence, context, taps],
  );
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const active = terms.find((entry) => entry.expressionKey === chosen) ?? terms[0];

  // Na frase, o toque troca o termo ativo em vez de abrir a folha (sem toque com outra folha aberta).
  const sentenceTaps = useMemo<ExpressionTaps | null>(
    () => (taps ? { find: taps.find, press: taps.press ? setChosen : null } : null),
    [taps],
  );

  // A troca do termo ativo é anunciada; o termo da entrada, não.
  const activeKey = active?.expressionKey;
  const shownKey = useRef(activeKey);
  useEffect(() => {
    if (shownKey.current === activeKey) return;
    shownKey.current = activeKey;
    if (active) AccessibilityInfo.announceForAccessibility(plain(active.term, context));
  }, [activeKey, active, context]);

  useEffect(() => {
    setFooter({ label: CONTINUE_LABEL, onPress: () => advance({ outcome: 'viewed', xp: 0 }) });
  }, [setFooter, advance]);

  return (
    <View style={styles.body} testID="expression-activity">
      <View>
        <Text style={styles.eyebrow}>{EXPRESSION_EYEBROW_TITLE}</Text>
        <RenderedText
          style={styles.title}
          accessibilityRole="header"
          text={view.title}
          vars={context.vars}
          pronoun={context.pronoun}
        />
      </View>
      <SpeechBubble avatar="wave" speaker={view.speaker} testID="expression-sentence">
        <ExpressionContext.Provider value={sentenceTaps}>
          <RenderedText style={styles.sentence} text={view.sentence} vars={context.vars} pronoun={context.pronoun} />
        </ExpressionContext.Provider>
      </SpeechBubble>
      {terms.length > 1 ? (
        <View style={styles.chips} testID="expression-chips">
          {terms.map((entry) => (
            <WordChip
              key={entry.expressionKey}
              label={plain(entry.term, context)}
              state={entry === active ? 'placed' : 'idle'}
              onPress={() => setChosen(entry.expressionKey)}
              testID={`expression-chip-${entry.expressionKey}`}
            />
          ))}
        </View>
      ) : null}
      {active ? (
        <ExpressionCard
          key={active.expressionKey}
          expression={active}
          vars={context.vars}
          pronoun={context.pronoun}
          testID="expression-activity-card"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  eyebrow: { ...typography.eyebrow, fontFamily: fontFamily[900], fontWeight: '900', color: color.blue },
  title: { ...typography.title, color: color.ink, marginTop: spacing[1] },
  sentence: { ...typography.bubble, color: color.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
