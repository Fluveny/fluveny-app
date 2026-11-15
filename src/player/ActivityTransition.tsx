import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

import { motion, useReducedMotion } from '../ui/motion';

/**
 * Entrada de cada Atividade: fade com subida de {@link motion.activityRise} dp
 * em {@link motion.activityMs} ms, a cada `id` novo. Instantânea com "remover
 * animações".
 */
export function ActivityTransition({ id, children }: { id: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(reduced ? 1 : 0));

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const enter = Animated.timing(progress, {
      toValue: 1,
      duration: motion.activityMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    enter.start();
    return () => {
      enter.stop();
      progress.setValue(1);
    };
  }, [id, reduced, progress]);

  return (
    <Animated.View
      testID="activity-transition"
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [motion.activityRise, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
