import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

type Host = { props: Record<string, unknown> };

export const styleOf = (el: Host): ViewStyle & TextStyle =>
  (StyleSheet.flatten(el.props.style as ViewStyle & TextStyle) ?? {}) as ViewStyle & TextStyle;

const translateY = (s: ViewStyle) =>
  (s.transform as { translateY?: number }[] | undefined)?.find((t) => 'translateY' in t)?.translateY ?? 0;

/** O que interessa da sombra sólida: borda inferior, margem, deslocamento e altura mínima. */
export function edgeOf(el: Host) {
  const s = styleOf(el);
  return {
    bottom: Number(s.borderBottomWidth ?? 0),
    margin: Number(s.marginBottom ?? 0),
    translateY: translateY(s),
    minHeight: Number(s.minHeight ?? 0),
    /** Espaço vertical mínimo ocupado: caixa (altura mínima) + margem inferior. */
    occupied: Number(s.minHeight ?? 0) + Number(s.marginBottom ?? 0),
  };
}

/**
 * Altura mínima da face, lida do estilo renderizado: `minHeight` menos a sombra
 * (borda inferior menos a borda da peça). Afundado ou sem sombra, a sombra é 0.
 */
export function faceHeight(el: Host) {
  const s = styleOf(el);
  const shadow = Number(s.borderBottomWidth ?? 0) - Number(s.borderWidth ?? 0);
  return Number(s.minHeight ?? 0) - Math.max(0, shadow);
}

/** Altura da área de toque: face mínima renderizada mais o `hitSlop` vertical. */
export function touchHeight(el: Host) {
  const slop = el.props.hitSlop as { top?: number; bottom?: number } | undefined;
  return faceHeight(el) + (slop?.top ?? 0) + (slop?.bottom ?? 0);
}
