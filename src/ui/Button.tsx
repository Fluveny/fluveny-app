import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './icons';
import { Pressable3D } from './Pressable3D';
import { color, edge, rounded, size, spacing, typography } from './tokens';

export type ButtonVariant = 'primary' | 'ghost' | 'success' | 'danger' | 'reward' | 'disabled';

/** Cores de cada variante (DESIGN.md `components.button-*`). */
export const BUTTON_VARIANTS: Record<
  ButtonVariant,
  { background: string; label: string; edge: string; border?: string }
> = {
  primary: { background: color.blue, label: color.surface, edge: color.blueDk },
  ghost: { background: color.surface, label: color.blue, edge: color.line, border: color.line },
  success: { background: color.teal, label: color.ink, edge: color.tealDk },
  danger: { background: color.red, label: color.surface, edge: color.redDk },
  reward: { background: color.gold, label: color.ink, edge: color.goldDk },
  disabled: { background: color.line, label: color.muted, edge: color.lineDk },
};

export type ButtonProps = {
  /** Verbo curto; aparece em caixa alta. O leitor de tela lê este texto. */
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  small?: boolean;
  disabled?: boolean;
  /** Ação em andamento: desabilitado e anunciado como ocupado. */
  busy?: boolean;
  icon?: IconName;
  /** Largura toda (rodapé). */
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

/**
 * Botão "de borracha" (UX-DR18 a UX-DR24). Um só primário por tela, no rodapé;
 * dois lado a lado só no swipe (ver src/ui/README.md).
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  small = false,
  disabled = false,
  busy = false,
  icon,
  fullWidth = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const off = disabled || busy || variant === 'disabled';
  const look = BUTTON_VARIANTS[off ? 'disabled' : variant];
  // A espessura da borda é da variante base: o ghost desabilitado não encolhe nem pula.
  const borderWidth = BUTTON_VARIANTS[variant].border ? size.border : 0;
  return (
    <Pressable3D
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy }}
      disabled={off}
      onPress={onPress}
      edge={{ color: look.edge, height: small ? edge.buttonSmall : edge.button }}
      border={borderWidth ? { color: look.border ?? look.background, width: borderWidth } : undefined}
      minHeight={small ? size.buttonSmallHeight : size.buttonHeight}
      style={[styles.button, { backgroundColor: look.background }, fullWidth ? styles.full : styles.hug]}
      testID={testID}
    >
      <View style={styles.row}>
        {icon ? <Icon name={icon} size={size.buttonIcon} color={look.label} /> : null}
        <Text style={[small ? styles.labelSmall : styles.label, { color: look.label }]}>{label}</Text>
      </View>
    </Pressable3D>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: size.buttonPaddingX,
    paddingVertical: spacing[2],
  },
  full: { alignSelf: 'stretch' },
  hug: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], flexShrink: 1 },
  label: { ...typography.button, textTransform: 'uppercase', textAlign: 'center', flexShrink: 1 },
  labelSmall: { ...typography.buttonSmall, textTransform: 'uppercase', textAlign: 'center', flexShrink: 1 },
});
