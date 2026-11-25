import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { captureError } from '../observability/sentry';
import { renderLabel } from '../renderer/label';

import type { RenderVars } from '../renderer/render';
import type { Pronoun } from '../visitor/types';
import { Button } from './Button';
import { EXPRESSION_EYEBROW, ExpressionCard, type ExpressionEntry } from './ExpressionCard';
import { SheetModal } from './SheetModal';

/** O botão que fecha a folha (EXPERIENCE.md, Voice and Tone). */
export const EXPRESSION_CLOSE_LABEL = 'GOT IT';
/** Rótulo do scrim para o leitor de tela: tocar fora fecha. */
export const EXPRESSION_SCRIM_LABEL = 'Close the meaning';

export type ExpressionSheetProps = {
  /** A Expressão Útil aberta; `null` fecha a folha. */
  expression: ExpressionEntry | null;
  vars?: RenderVars | null;
  pronoun?: Pronoun | null;
  onClose: () => void;
};

/**
 * Folha de dicionário da Expressão Útil (UX-DR41, UX-DR42, UX-DR129): `Modal`
 * transparente sobre o scrim, com a folha inferior que sobe com mola (direto
 * com "remover animações"). Fecha com ENTENDI, com toque no scrim e pelo
 * `onRequestClose` (voltar do Android; Esc no web). Ela fica por cima da
 * Atividade, que não remonta nem muda de estado.
 */
export function ExpressionSheet({ expression, vars, pronoun, onClose }: ExpressionSheetProps) {
  // O conteúdo fica na folha enquanto o Modal some; a próxima abertura o troca.
  const [shown, setShown] = useState<ExpressionEntry | null>(expression);
  if (expression && expression !== shown) setShown(expression);

  const open = expression !== null;

  // Ao abrir, o foco vai para o termo e o leitor o anuncia (UX-DR135, como a folha de feedback).
  // No web, sem rolar: a folha ainda está subindo com a mola.
  const header = useRef<ComponentRef<typeof Text>>(null);
  const announcement = useMemo(() => {
    if (!shown) return '';
    try {
      return `${EXPRESSION_EYEBROW}: ${renderLabel(shown.term, vars, pronoun)}`;
    } catch (error) {
      captureError(error);
      return EXPRESSION_EYEBROW;
    }
  }, [shown, vars, pronoun]);
  useEffect(() => {
    if (!open) return;
    AccessibilityInfo.announceForAccessibility(announcement);
    const node = header.current;
    if (!node) return;
    if (Platform.OS === 'web') {
      (node as unknown as { focus?: (options?: FocusOptions) => void }).focus?.({ preventScroll: true });
    } else AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }, [open, announcement]);

  return (
    <SheetModal
      open={open}
      onRequestClose={onClose}
      onScrimPress={onClose}
      scrimLabel={EXPRESSION_SCRIM_LABEL}
      testID="expression-sheet"
    >
      <ScrollView style={styles.body} testID="expression-sheet-body">
        {shown ? <ExpressionCard expression={shown} vars={vars} pronoun={pronoun} headerRef={header} /> : null}
      </ScrollView>
      <Button label={EXPRESSION_CLOSE_LABEL} onPress={onClose} fullWidth testID="expression-sheet-close" />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  // O cartão rola dentro da folha; ENTENDI fica fora, sempre visível.
  body: { flexGrow: 0, flexShrink: 1 },
});
