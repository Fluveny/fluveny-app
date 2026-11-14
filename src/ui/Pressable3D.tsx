import { useState, type ReactNode } from 'react';
import {
  Pressable,
  type AccessibilityRole,
  type AccessibilityState,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { size, solid, sunk, type SolidStyle } from './tokens';

/**
 * Sombra sólida de um elemento com borda: em pé, a borda inferior é a borda do
 * elemento mais a sombra, na cor da sombra; afundado, sobra só a borda, e a
 * margem e o translateY do `sunk()` guardam o espaço (o layout não se move).
 */
export function edgeStyle(
  state: 'raised' | 'sunk',
  edge: { color: string; height: number },
  border?: { color: string; width: number },
): SolidStyle {
  const borderWidth = border?.width ?? 0;
  if (state === 'raised') return solid(edge.color, edge.height + borderWidth);
  const pressed = sunk(edge.height);
  return border ? { ...pressed, borderBottomWidth: borderWidth, borderBottomColor: border.color } : pressed;
}

/** `hitSlop` que leva uma face de `faceHeight` até a área de toque mínima de 48 dp. */
export function touchSlop(faceHeight: number): Insets | undefined {
  const missing = Math.max(0, size.touchMin - faceHeight);
  if (missing === 0) return undefined;
  const side = Math.ceil(missing / 2);
  return { top: side, bottom: side, left: side, right: side };
}

export type Pressable3DProps = {
  children: ReactNode;
  onPress?: () => void;
  /** Sem toque e sem afundar; a sombra fica (botão desabilitado) ou não (ver `flat`). */
  disabled?: boolean;
  /** Sem sombra e assentado no lugar da sombra (chip `used`). */
  flat?: boolean;
  edge: { color: string; height: number };
  border?: { color: string; width: number };
  /** Altura mínima da face (sem a sombra); o elemento cresce com a fonte. */
  minHeight: number;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
};

/**
 * Base tocável do kit (UX-DR15/16): afunda exatamente a altura da sombra no
 * toque, sem mudar de cor; desabilitado não afunda nem dispara.
 */
export function Pressable3D({
  children,
  onPress,
  disabled = false,
  flat = false,
  edge,
  border,
  minHeight,
  style,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
}: Pressable3DProps) {
  const [pressed, setPressed] = useState(false);
  // Sem onPress, a peça não é um botão ativo: não dispara nem afunda.
  const inert = disabled || flat || !onPress;
  // Ficou inerte com o dedo em cima: esquece o toque, para não voltar afundada.
  if (inert && pressed) setPressed(false);
  const down = flat || (pressed && !inert);
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: inert }}
      disabled={inert}
      hitSlop={touchSlop(minHeight)}
      onPress={inert ? undefined : onPress}
      onPressIn={inert ? undefined : () => setPressed(true)}
      onPressOut={() => setPressed(false)}
      testID={testID}
      style={[
        style,
        border ? { borderWidth: border.width, borderColor: border.color } : null,
        { minHeight: minHeight + (down ? 0 : edge.height) },
        edgeStyle(down ? 'sunk' : 'raised', edge, border),
      ]}
    >
      {children}
    </Pressable>
  );
}
