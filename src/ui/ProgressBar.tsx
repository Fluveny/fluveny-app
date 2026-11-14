import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { motion, useReducedMotion } from './motion';
import { color, overlay, rounded, size, spacing } from './tokens';

/** Limita o valor a 0–1 (NaN vira 0). */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

type Props = {
  /** De 0 a 1; fora disso é limitado. */
  value: number;
  /** Rótulo do leitor de tela, por exemplo "Posição no Estágio". */
  accessibilityLabel?: string;
  testID?: string;
  /** Só layout (ex.: `flex: 1` na linha do topo do player). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Barra de progresso (UX-DR33): 16 px, preenchimento mínimo de 26 px para
 * nunca parecer vazia, brilho no terço superior, anima em 450 ms (sem animação
 * com "remover animações").
 */
export function ProgressBar({ value, accessibilityLabel = 'Progresso', testID = 'progress-bar', style }: Props) {
  const target = clampProgress(value);
  const [width] = useState(() => new Animated.Value(target));
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      width.setValue(target);
      return;
    }
    const run = Animated.timing(width, { toValue: target, duration: motion.progressMs, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [target, reduced, width]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
      testID={testID}
      style={[styles.track, style]}
    >
      <Animated.View
        testID={`${testID}-fill`}
        style={[styles.fill, { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      >
        <View style={styles.highlight} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    height: size.progressHeight,
    borderRadius: rounded.full,
    backgroundColor: color.line,
    overflow: 'hidden',
  },
  fill: {
    height: size.progressHeight,
    minWidth: size.progressMinFill,
    borderRadius: rounded.full,
    backgroundColor: color.blue,
  },
  // Faixa de brilho dentro do terço superior da barra.
  highlight: {
    position: 'absolute',
    left: spacing[2],
    right: spacing[2],
    top: size.progressHeight / 12,
    height: size.progressHeight / 4,
    borderRadius: rounded.full,
    backgroundColor: overlay.progressHighlight,
  },
});
