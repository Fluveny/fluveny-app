import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { motion } from './motion';
import { color, size } from './tokens';

/** Cores dos papéis, só da marca (DESIGN.md, Colors). */
const COLORS = [color.red, color.gold, color.blue, color.teal] as const;

/** Quantos papéis caem [ASSUMPTION: 18, como no protótipo]. */
export const CONFETTI_PIECES = 18;

type Piece = {
  left: `${number}%`;
  duration: number;
  delay: number;
  color: string;
  turn: string;
  value: Animated.Value;
};

function pieces(): Piece[] {
  return Array.from({ length: CONFETTI_PIECES }, (_, i) => ({
    // Espalhados pela largura, sem sorteio: a mesma chuva em todo aparelho.
    left: `${((i * 53) % 97) + 1}%`,
    duration: motion.confettiMs + (i % 5) * motion.confettiStepMs,
    delay: i * motion.confettiStaggerMs,
    color: COLORS[i % COLORS.length]!,
    turn: `${180 + i * 40}deg`,
    value: new Animated.Value(0),
  }));
}

/**
 * Confete do Resumo do Estágio (UX-DR104, UX-DR132): papéis
 * chapados nas cores da marca caem uma vez do topo da caixa e somem. Decorativo
 * (oculto do leitor) e sem toque. Com "remover animações" ligado, ou enquanto
 * a configuração não foi lida, não desenha nada (UX-DR143): por isso lê o
 * `AccessibilityInfo` aqui, e não pelo `useReducedMotion()`, que começa em `false`.
 */
export function Confetti({ height = size.confettiFall, testID = 'confetti' }: { height?: number; testID?: string }) {
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [items] = useState(pieces);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduced(value);
      })
      .catch(() => {
        if (alive) setReduced(true);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => setReduced(value));
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduced !== false) return;
    const animations = items.map((piece) =>
      Animated.timing(piece.value, {
        toValue: 1,
        duration: piece.duration,
        delay: piece.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    const all = Animated.parallel(animations);
    all.start();
    return () => all.stop();
  }, [reduced, items]);

  if (reduced !== false) return null;
  return (
    <View
      testID={testID}
      style={[styles.box, { height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {items.map((piece, i) => (
        <Animated.View
          key={i}
          style={[
            styles.piece,
            {
              left: piece.left,
              backgroundColor: piece.color,
              opacity: piece.value.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: piece.value.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) },
                { rotate: piece.value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', piece.turn] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden', pointerEvents: 'none' },
  piece: {
    position: 'absolute',
    top: -size.confettiHeight,
    width: size.confettiWidth,
    height: size.confettiHeight,
    borderRadius: size.confettiRadius,
  },
});
