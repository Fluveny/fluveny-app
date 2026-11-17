import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { color, layout, rounded, size, spacing } from './tokens';

/** Distância de onde a folha parte, abaixo da posição final, antes da mola. */
const SHEET_START = 480;
/** Alça da folha [ASSUMPTION: 44 × 5, como no protótipo]. */
const HANDLE = { width: 44, height: 5 };

export type SheetModalProps = {
  open: boolean;
  /** Voltar do Android e Esc no web. */
  onRequestClose: () => void;
  /** Toque no scrim; sem ele, o scrim não fecha a folha (ela pede uma decisão). */
  onScrimPress?: () => void;
  /** Rótulo do scrim para o leitor de tela, quando ele fecha. */
  scrimLabel?: string;
  children: ReactNode;
  /** Base dos `testID`: `<base>`, `<base>-root` e `<base>-scrim`. */
  testID: string;
};

/**
 * O casco das folhas por cima da tela (a `ExpressionSheet`, 1.14, e a
 * `NoticeSheet`, 1.15): `Modal` transparente sobre o scrim, com a folha
 * inferior (cantos de 28 no topo, coluna de até 440 dp) que sobe com mola
 * (direto com "remover animações").
 */
export function SheetModal({ open, onRequestClose, onScrimPress, scrimLabel, children, testID }: SheetModalProps) {
  const [offset] = useState(() => new Animated.Value(SHEET_START));
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

  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onRequestClose} statusBarTranslucent>
      <View style={styles.root} testID={`${testID}-root`}>
        {onScrimPress ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onScrimPress}
            accessibilityRole="button"
            accessibilityLabel={scrimLabel}
            testID={`${testID}-scrim`}
          />
        ) : null}
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: offset }] }]}
          accessibilityViewIsModal
          testID={testID}
        >
          <View style={styles.handle} />
          {children}
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
  handle: {
    alignSelf: 'center',
    width: HANDLE.width,
    height: HANDLE.height,
    borderRadius: rounded.full,
    backgroundColor: color.line,
  },
});
