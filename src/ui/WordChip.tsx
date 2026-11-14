import { StyleSheet, Text, View } from 'react-native';

import { withState } from './a11y';
import { Icon } from './icons';
import { Pressable3D } from './Pressable3D';
import { color, edge, rounded, size, spacing, typography } from './tokens';

export type WordChipState = 'idle' | 'placed' | 'used' | 'right' | 'wrong';

/** Cores de cada estado (DESIGN.md `components.word-chip*`). */
export const WORD_CHIP_STATES: Record<
  WordChipState,
  { background: string; border: string; label: string; edge: string | null }
> = {
  idle: { background: color.surface, border: color.line, label: color.ink, edge: color.line },
  placed: { background: color.surface, border: color.blue, label: color.blue, edge: color.blue },
  // Fantasma no banco: o texto some (mesma cor do fundo) e não há sombra.
  used: { background: color.line, border: color.line, label: color.line, edge: null },
  right: { background: color.tealLt, border: color.teal, label: color.tealDk, edge: color.line },
  wrong: { background: color.redLt, border: color.red, label: color.redDk, edge: color.line },
};

export type WordChipProps = {
  /** A palavra (conteúdo em inglês). */
  label: string;
  state?: WordChipState;
  onPress?: () => void;
  /** Resposta travada (depois de Verificar): sem toque. */
  disabled?: boolean;
  testID?: string;
};

/**
 * Chip de palavra (UX-DR34). 44 px de face, área de toque estendida a 48 dp.
 * `used` não responde nem afunda; `right`/`wrong` mostram ✓/✕ e dizem o estado
 * ao leitor de tela; `placed` é anunciado como selecionado.
 */
export function WordChip({ label, state = 'idle', onPress, disabled = false, testID }: WordChipProps) {
  const look = WORD_CHIP_STATES[state];
  const stateWord = state === 'right' || state === 'wrong' || state === 'used' ? state : undefined;
  return (
    <Pressable3D
      accessibilityLabel={withState(label, stateWord)}
      accessibilityState={{ selected: state === 'placed' }}
      disabled={disabled}
      flat={state === 'used'}
      onPress={onPress}
      edge={{ color: look.edge ?? look.border, height: edge.chip }}
      border={{ color: look.border, width: size.border }}
      minHeight={size.wordChipHeight}
      style={[styles.chip, { backgroundColor: look.background }]}
      testID={testID}
    >
      <View style={styles.row}>
        {state === 'right' ? <Icon name="check" size={size.stateIconSmall} color={color.tealDk} /> : null}
        {state === 'wrong' ? <Icon name="x" size={size.stateIconSmall} color={color.red} /> : null}
        <Text style={[styles.label, { color: look.label }]}>{label}</Text>
      </View>
    </Pressable3D>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minWidth: size.wordChipHeight,
    borderRadius: rounded.chip,
    paddingHorizontal: size.wordChipPaddingX,
    paddingVertical: spacing[1],
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1] },
  label: { ...typography.item, textAlign: 'center', flexShrink: 1 },
});
