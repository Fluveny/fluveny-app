import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, type CardTone } from './Card';
import { color, fontFamily, rounded, size, spacing, typography } from './tokens';

export type MatchState = 'neutral' | 'selected' | 'paired' | 'right' | 'wrong';

export const MATCH_STATES: MatchState[] = ['neutral', 'selected', 'paired', 'right', 'wrong'];

/** O que o leitor de tela ouve antes do outro lado do par: "Hi!, ligada a Hi Alex!". */
export const MATCH_LINKED = 'ligada a';

/** O tom do `Card` em cada estado: o par formado fica branco, e a marca é o número no selo. */
const TONE: Record<MatchState, CardTone> = {
  neutral: 'neutral',
  selected: 'selected',
  paired: 'neutral',
  right: 'right',
  wrong: 'wrong',
};

export type MatchCardProps = {
  /** Texto do cartão, em inglês, sem formatação: é o que o leitor de tela ouve. */
  label: string;
  /** O texto desenhado, quando difere do rótulo (o `RenderedText` do conteúdo). Sem ele, desenha o `label`. */
  text?: ReactNode;
  /**
   * O número do par (1, 2, 3…), igual na fala e na resposta ligadas. Sem ele,
   * o selo fica vazio. O par nunca depende só de cor.
   */
  pair?: number;
  /** O outro lado do par, sem formatação, para o leitor: "ligada a …". */
  pairedWith?: string;
  state?: MatchState;
  /** Cartão travado (depois de Verificar, ou par certo mantido): não dispara. */
  locked?: boolean;
  onPress: () => void;
  testID?: string;
};

/**
 * Cartão ligável do Associar (Match the Speech Bubbles, UX-DR76): o `Card`
 * tocável com o número do par num selo azul claro, como o selo de letra do
 * `ChoiceCard`. O leitor ouve o texto, o par e o estado ("Hi!, ligada a Hi
 * Alex!, certo"); a seleção vai no `accessibilityState`.
 */
export function MatchCard({
  label,
  text,
  pair,
  pairedWith,
  state = 'neutral',
  locked = false,
  onPress,
  testID,
}: MatchCardProps) {
  const linked = pairedWith ? `${label}, ${MATCH_LINKED} ${pairedWith}` : label;
  return (
    <Card tone={TONE[state]} accessibilityLabel={linked} onPress={onPress} disabled={locked} testID={testID}>
      <View style={styles.row}>
        <View
          style={[styles.badge, pair === undefined ? styles.badgeEmpty : styles.badgePaired]}
          testID={testID ? `${testID}-badge` : undefined}
        >
          {pair === undefined ? null : <Text style={styles.number}>{pair}</Text>}
        </View>
        <Text style={[styles.text, state === 'wrong' ? styles.textWrong : null]}>{text ?? label}</Text>
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
  badgeEmpty: { backgroundColor: color.surface, borderColor: color.line },
  badgePaired: { backgroundColor: color.blueLt, borderColor: color.blueMd },
  number: { ...typography.meta, fontFamily: fontFamily[900], fontWeight: '900', color: color.blueDk },
  text: { ...typography.item, color: color.ink, flex: 1 },
  textWrong: { color: color.redDk },
});
