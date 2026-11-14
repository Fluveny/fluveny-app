import { StyleSheet, Text, View } from 'react-native';

import { Card } from './Card';
import { color, fontFamily, rounded, size, spacing, typography } from './tokens';

export type ChoiceState = 'neutral' | 'selected' | 'wrong' | 'right';

/** Até quatro alternativas por Item (Escolha, Vocab Mode, Guess Who). */
export const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Letra da alternativa; fora de A–D é erro em desenvolvimento. */
export function choiceLetter(index: number): string | undefined {
  const letter = CHOICE_LETTERS[index];
  if (letter === undefined && __DEV__) {
    throw new Error(`ChoiceCard: índice ${index} fora de A–D (máximo de ${CHOICE_LETTERS.length} alternativas)`);
  }
  return letter;
}

/** Selo da letra: neutro em branco com borda; nos outros estados, a cor do tom (texto em `ink` no turquesa, AA). */
const BADGE: Record<ChoiceState, { background: string; border: string; label: string }> = {
  neutral: { background: color.surface, border: color.line, label: color.muted },
  selected: { background: color.blue, border: color.blue, label: color.surface },
  wrong: { background: color.red, border: color.red, label: color.surface },
  right: { background: color.teal, border: color.teal, label: color.ink },
};

export type ChoiceCardProps = {
  /** Posição da alternativa, de 0 (A) a 3 (D). */
  index: number;
  /** Texto da alternativa, em inglês. */
  label: string;
  state?: ChoiceState;
  /** Resposta travada (depois de Verificar): não dispara. */
  locked?: boolean;
  onPress: () => void;
  testID?: string;
};

/**
 * Cartão de alternativa A–D: o `Card` tocável com a letra num selo. O leitor de
 * tela ouve a letra, o texto e o estado ("B, I'm from Brazil., errado").
 */
export function ChoiceCard({ index, label, state = 'neutral', locked = false, onPress, testID }: ChoiceCardProps) {
  const letter = choiceLetter(index);
  const badge = BADGE[state];
  return (
    <Card
      tone={state}
      accessibilityLabel={letter ? `${letter}, ${label}` : label}
      onPress={onPress}
      disabled={locked}
      testID={testID ?? `choice-${letter ?? index}`}
    >
      <View style={styles.row}>
        {letter ? (
          <View style={[styles.badge, { backgroundColor: badge.background, borderColor: badge.border }]}>
            <Text style={[styles.letter, { color: badge.label }]}>{letter}</Text>
          </View>
        ) : null}
        <Text style={[styles.text, state === 'wrong' ? styles.textWrong : null]}>{label}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  badge: {
    minWidth: size.choiceLetter,
    minHeight: size.choiceLetter,
    borderRadius: rounded.sm,
    borderWidth: size.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  letter: { ...typography.meta, fontFamily: fontFamily[900], fontWeight: '900' },
  text: { ...typography.item, color: color.ink, flex: 1 },
  textWrong: { color: color.redDk },
});
