import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { Icon } from './icons';
import { useReducedMotion } from './motion';
import { Pressable3D } from './Pressable3D';
import { color, edge, rounded, size, spacing, typography } from './tokens';

/** Rótulo do leitor de tela (UX-DR134). */
export const MIC_LABEL = 'Microfone: toque para falar';
/** Ouvindo, o toque encerra. */
export const MIC_STOP_LABEL = 'Microfone: toque para parar';
/** Legendas (DESIGN.md, Components; EXPERIENCE.md, State Patterns). */
export const MIC_IDLE_CAPTION = 'TOQUE PARA FALAR';
export const MIC_LISTENING_CAPTION = 'OUVINDO…';
export const MIC_UNAVAILABLE_CAPTION = 'O microfone não está disponível neste aparelho.';

/** Um ciclo do anel pulsante [ASSUMPTION: 1,6 s; o DESIGN.md não fixa]. */
const PULSE_MS = 1600;
/** Até onde o anel cresce, a partir do microfone. */
const PULSE_SCALE = 1.7;

export type MicButtonProps = {
  /** Ouvindo: vermelho, com os dois anéis pulsantes (parados com "remover animações"). */
  listening?: boolean;
  /** Indisponível: cinza, sem afundar nem disparar (UX-DR45). Sem `onPress` (ocupado), fica azul e inerte. */
  disabled?: boolean;
  onPress?: () => void;
  /** Um aviso no lugar da legenda ("Não ouvimos nada…"), em texto corrido. */
  message?: string;
  testID?: string;
};

/** Um anel que cresce e some, em laço; `delay` defasa o segundo. */
function PulseRing({ delay }: { delay: number }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const native = Platform.OS !== 'web';
    // Cresce e some, volta ao começo na hora, e de novo; o segundo anel começa defasado.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: PULSE_MS, useNativeDriver: native }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: native }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [progress, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      testID="mic-pulse"
      style={[
        styles.ring,
        {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, PULSE_SCALE] }) }],
        },
      ]}
    />
  );
}

/**
 * Microfone da Fala (UX-DR44, UX-DR45, `mic-button`): círculo de 132 dp azul
 * com sombra sólida de 8 em `blueDk`, dentro dos halos de 226 (`blueLt`) e 176
 * (`blueMd`). Ouvindo, fica vermelho com dois anéis pulsantes; indisponível,
 * cinza e sem afundar. Funciona por toque, clique e teclado (Enter ou espaço
 * no web), sem manter pressionado; a legenda fica abaixo, em eyebrow.
 */
export function MicButton({ listening = false, disabled = false, onPress, message, testID = 'mic' }: MicButtonProps) {
  const reduced = useReducedMotion();
  const face = disabled ? color.line : listening ? color.red : color.blue;
  const shadow = disabled ? color.lineDk : listening ? color.redDk : color.blueDk;
  const text = disabled ? MIC_UNAVAILABLE_CAPTION : listening ? MIC_LISTENING_CAPTION : (message ?? MIC_IDLE_CAPTION);
  const plain = disabled || (!listening && message !== undefined);
  return (
    <View style={styles.root} testID={`${testID}-root`}>
      <View style={[styles.haloOuter, disabled ? styles.haloOff : null]}>
        <View style={[styles.haloInner, disabled ? styles.haloOffInner : null]} />
        {listening && !disabled && !reduced ? (
          <>
            <PulseRing delay={0} />
            <PulseRing delay={PULSE_MS / 2} />
          </>
        ) : null}
        <Pressable3D
          accessibilityLabel={listening && !disabled ? MIC_STOP_LABEL : MIC_LABEL}
          accessibilityState={{ selected: listening, disabled: disabled || !onPress }}
          disabled={disabled}
          onPress={onPress}
          edge={{ color: shadow, height: edge.mic }}
          minHeight={size.mic}
          style={[styles.button, { backgroundColor: face }]}
          testID={testID}
        >
          <Icon name="mic" size={size.micIcon} color={disabled ? color.muted : color.surface} />
        </Pressable3D>
      </View>
      <Text
        style={[styles.caption, plain ? styles.captionPlain : null]}
        accessibilityLiveRegion="polite"
        testID={`${testID}-caption`}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing[3] },
  haloOuter: {
    width: size.micHaloOuter,
    height: size.micHaloOuter,
    borderRadius: rounded.full,
    backgroundColor: color.blueLt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloInner: {
    position: 'absolute',
    width: size.micHaloInner,
    height: size.micHaloInner,
    borderRadius: rounded.full,
    backgroundColor: color.blueMd,
  },
  haloOff: { backgroundColor: color.canvas },
  haloOffInner: { backgroundColor: color.surface },
  ring: {
    position: 'absolute',
    width: size.mic,
    height: size.mic,
    borderRadius: rounded.full,
    backgroundColor: color.red,
  },
  button: {
    width: size.mic,
    borderRadius: rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { ...typography.eyebrow, color: color.blue, textAlign: 'center' },
  captionPlain: { ...typography.bodyStrong, color: color.mutedStrong, maxWidth: size.micHaloOuter + spacing[8] },
});
