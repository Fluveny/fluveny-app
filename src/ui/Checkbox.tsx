import { StyleSheet, Text, View } from 'react-native';

import { Icon } from './icons';
import { Pressable3D } from './Pressable3D';
import { color, rounded, size, spacing, typography } from './tokens';

export type CheckboxProps = {
  /** O texto ao lado da caixa, em português; é também o rótulo do leitor de tela. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testID?: string;
};

/**
 * Caixa de seleção (2.1, aceite dos termos): caixa de 28 dp com borda de 2 em
 * `line-dk`, marcada em `blue` com o ✓ branco, e o texto ao lado. A linha toda
 * é a área de toque (mínimo de 48 dp), com papel `checkbox` e o estado
 * `checked`. Sem sombra: não é um botão. Links (termos, política) ficam fora
 * dela, para o leitor de tela chegar a cada um.
 */
export function Checkbox({ label, checked, onChange, disabled = false, testID = 'checkbox' }: CheckboxProps) {
  return (
    <Pressable3D
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      edge={{ color: color.surface, height: 0 }}
      minHeight={size.touchMin}
      style={styles.row}
      testID={testID}
    >
      <View
        style={[styles.box, checked ? styles.checked : null, disabled ? styles.off : null]}
        testID={`${testID}-box`}
      >
        {checked ? <Icon name="check" size={size.checkboxIcon} color={color.surface} /> : null}
      </View>
      <Text style={styles.label} importantForAccessibility="no" aria-hidden>
        {label}
      </Text>
    </Pressable3D>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], alignSelf: 'stretch' },
  box: {
    width: size.checkbox,
    height: size.checkbox,
    borderRadius: rounded.sm,
    borderWidth: size.border,
    borderColor: color.lineDk,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checked: { backgroundColor: color.blue, borderColor: color.blue },
  off: { borderColor: color.line, backgroundColor: color.canvas },
  label: { ...typography.bodyStrong, color: color.ink, flex: 1 },
});
