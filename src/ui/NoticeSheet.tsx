import { useEffect, useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { SheetModal } from './SheetModal';
import { color, spacing, typography } from './tokens';

export type NoticeSheetProps = {
  open: boolean;
  /** O texto do aviso. */
  text: string;
  /** A ação que aceita (botão primário). */
  confirmLabel: string;
  onConfirm: () => void;
  /** A ação que recusa (botão ghost). */
  declineLabel: string;
  onDecline: () => void;
  /** Voltar do Android e Esc no web: fecha sem decidir. O scrim não fecha. */
  onRequestClose: () => void;
  testID?: string;
};

/**
 * Folha de aviso com duas ações (o aviso de privacidade do microfone,
 * UX-DR112): o casco da `ExpressionSheet`, com o texto e os dois botões
 * empilhados. Pede uma decisão: tocar no scrim não fecha. Ao abrir, o foco vai
 * para o texto e o leitor de tela o anuncia.
 */
export function NoticeSheet({
  open,
  text,
  confirmLabel,
  onConfirm,
  declineLabel,
  onDecline,
  onRequestClose,
  testID = 'notice-sheet',
}: NoticeSheetProps) {
  const body = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!open) return;
    AccessibilityInfo.announceForAccessibility(text);
    const node = body.current;
    if (!node) return;
    if (Platform.OS === 'web') {
      (node as unknown as { focus?: (options?: FocusOptions) => void }).focus?.({ preventScroll: true });
    } else AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }, [open, text]);

  return (
    <SheetModal open={open} onRequestClose={onRequestClose} testID={testID}>
      <ScrollView style={styles.body}>
        <View ref={body} accessible focusable={Platform.OS === 'web'} testID={`${testID}-text`}>
          <Text style={styles.text}>{text}</Text>
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Button label={confirmLabel} onPress={onConfirm} fullWidth testID={`${testID}-confirm`} />
        <Button label={declineLabel} variant="ghost" onPress={onDecline} fullWidth testID={`${testID}-decline`} />
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 0, flexShrink: 1 },
  text: { ...typography.bodyStrong, color: color.ink },
  actions: { gap: spacing[3] },
});
