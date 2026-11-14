import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Durações do kit (DESIGN.md, Components; EXPERIENCE.md, Interaction Primitives). */
export const motion = {
  progressMs: 450,
  /** Pulo do chip de XP: a escala parte daqui e volta a 1. */
  xpPopScale: 1.25,
} as const;

/**
 * `true` quando "remover animações" está ligado no sistema. Começa em `false`
 * (a leitura é assíncrona) e acompanha a mudança da configuração com o App aberto.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => setReduced(value));
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
