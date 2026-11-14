import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Icon } from './icons';
import { motion, useReducedMotion } from './motion';
import { color, edge, fontFamily, size, solid, spacing, typography } from './tokens';

/** Rótulo do leitor de tela: "30 XP". */
export const xpLabel = (xp: number) => `${xp} XP`;
/** Rótulo da variante clara: "+10 XP". */
export const xpGainLabel = (gain: number) => `+${gain} XP`;

/**
 * Chip de XP (UX-DR31): mostra o total e dá um pulo (escala 1,25 → 1) só
 * quando o XP sobe. Sem pulo com "remover animações".
 */
export function XpChip({ xp, testID = 'xp-chip' }: { xp: number; testID?: string }) {
  const [scale] = useState(() => new Animated.Value(1));
  const previous = useRef(xp);
  const reduced = useReducedMotion();

  useEffect(() => {
    const rose = xp > previous.current;
    previous.current = xp;
    if (!rose || reduced) return;
    scale.setValue(motion.xpPopScale);
    const pop = Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 });
    pop.start();
    return () => {
      pop.stop();
      scale.setValue(1);
    };
  }, [xp, reduced, scale]);

  return (
    <Animated.View
      accessible
      accessibilityLabel={xpLabel(xp)}
      testID={testID}
      style={[styles.chip, styles.red, solid(color.redDk, edge.chip), { transform: [{ scale }] }]}
    >
      <Icon name="star" size={size.xpChipIcon} color={color.gold} />
      <Text style={[styles.text, { color: color.surface }]}>{xpLabel(xp)}</Text>
    </Animated.View>
  );
}

/** Variante clara da folha de Acerto (UX-DR32): "+N" em `gold-text` sobre `gold-lt`, anunciado como "+N XP". */
export function XpChipLight({ gain, testID = 'xp-chip-light' }: { gain: number; testID?: string }) {
  return (
    <View
      accessible
      accessibilityLabel={xpGainLabel(gain)}
      accessibilityLiveRegion="polite"
      testID={testID}
      style={[styles.chip, styles.light]}
    >
      <Icon name="star" size={size.xpChipIcon} color={color.gold} />
      <Text style={[styles.text, { color: color.goldText }]}>{`+${gain}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[1],
    borderRadius: size.xpChipRadius,
    paddingTop: size.xpChipPaddingTop,
    paddingRight: size.xpChipPaddingRight,
    paddingBottom: size.xpChipPaddingBottom,
    paddingLeft: size.xpChipPaddingLeft,
  },
  red: { backgroundColor: color.red },
  light: { backgroundColor: color.goldLt },
  text: { ...typography.meta, fontFamily: fontFamily[900], fontWeight: '900' },
});
