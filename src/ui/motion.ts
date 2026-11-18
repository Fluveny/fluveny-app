import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Durações do kit (DESIGN.md, Components; EXPERIENCE.md, Interaction Primitives). */
export const motion = {
  progressMs: 450,
  /** Transição entre Atividades no player: fade com subida. */
  activityMs: 260,
  /** Quanto a Atividade que entra sobe (dp) durante a transição. */
  activityRise: 12,
  /** Pulo do chip de XP: a escala parte daqui e volta a 1. */
  xpPopScale: 1.25,
  /** Intervalo entre as falas do Diálogo (EXPERIENCE.md, Tipos de Atividade). */
  dialogueLineMs: 650,
  /** Queda do confete (Resumo do Estágio, 1.20): a mais curta, o passo entre as durações e o atraso entre papéis [ASSUMPTION: protótipo]. */
  confettiMs: 1800,
  confettiStepMs: 300,
  confettiStaggerMs: 40,
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
