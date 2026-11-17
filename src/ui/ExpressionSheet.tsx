import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { captureError } from '../observability/sentry';
import { renderLabel } from '../renderer/label';

import type { RenderVars } from '../renderer/render';
import type { Pronoun } from '../visitor/types';
import { Button } from './Button';
import { EXPRESSION_EYEBROW, ExpressionCard, type ExpressionEntry } from './ExpressionCard';
import { color, layout, rounded, size, spacing } from './tokens';

/** O botão que fecha a folha (EXPERIENCE.md, Voice and Tone). */
export const EXPRESSION_CLOSE_LABEL = 'ENTENDI';
/** Rótulo do scrim para o leitor de tela: tocar fora fecha. */
export const EXPRESSION_SCRIM_LABEL = 'Fechar o significado';

export type ExpressionSheetProps = {
  /** A Expressão Útil aberta; `null` fecha a folha. */
  expression: ExpressionEntry | null;
  vars?: RenderVars | null;
  pronoun?: Pronoun | null;
  onClose: () => void;
};

/** Distância de onde a folha parte, abaixo da posição final, antes da mola. */
const SHEET_START = 480;
/** Alça da folha [ASSUMPTION: 44 × 5, como no protótipo]. */
const HANDLE = { width: 44, height: 5 };

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

  const [offset] = useState(() => new Animated.Value(SHEET_START));
  const open = expression !== null;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let rise: Animated.CompositeAnimation | undefined;
    offset.setValue(SHEET_START);
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => true)
      .then((reduced) => {
        if (!alive) return;
        if (reduced) {
          offset.setValue(0);
          return;
        }
        rise = Animated.spring(offset, { toValue: 0, useNativeDriver: Platform.OS !== 'web', bounciness: 6 });
        rise.start();
      });
    return () => {
      alive = false;
      rise?.stop();
      offset.setValue(0);
    };
  }, [open, offset]);

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
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root} testID="expression-sheet-root">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={EXPRESSION_SCRIM_LABEL}
          testID="expression-sheet-scrim"
        />
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: offset }] }]}
          accessibilityViewIsModal
          testID="expression-sheet"
        >
          <View style={styles.handle} />
          <ScrollView style={styles.body} testID="expression-sheet-body">
            {shown ? <ExpressionCard expression={shown} vars={vars} pronoun={pronoun} headerRef={header} /> : null}
          </ScrollView>
          <Button label={EXPRESSION_CLOSE_LABEL} onPress={onClose} fullWidth testID="expression-sheet-close" />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.scrim, justifyContent: 'flex-end', alignItems: 'center' },
  // [ASSUMPTION] Sem a sombra desfocada da folha: a borda de 2 dp em `line`, como a folha de feedback.
  sheet: {
    width: '100%',
    maxWidth: layout.columnMax,
    maxHeight: '85%',
    backgroundColor: color.surface,
    borderTopLeftRadius: rounded.sheet,
    borderTopRightRadius: rounded.sheet,
    borderTopWidth: size.border,
    borderLeftWidth: size.border,
    borderRightWidth: size.border,
    borderColor: color.line,
    paddingTop: spacing[3],
    paddingHorizontal: size.sheetPaddingX,
    paddingBottom: size.sheetPaddingBottom + spacing[2],
    gap: spacing[4],
  },
  // O cartão rola dentro da folha; ENTENDI fica fora, sempre visível.
  body: { flexGrow: 0, flexShrink: 1 },
  handle: {
    alignSelf: 'center',
    width: HANDLE.width,
    height: HANDLE.height,
    borderRadius: rounded.full,
    backgroundColor: color.line,
  },
});
