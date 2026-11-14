import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { STATE_LABEL, withState } from './a11y';
import { Icon } from './icons';
import { Pressable3D } from './Pressable3D';
import { color, edge, rounded, size, solid, spacing } from './tokens';

export type CardTone = 'neutral' | 'selected' | 'wrong' | 'right' | 'reward';

/** Cores de cada tom (DESIGN.md `components.card*`). */
export const CARD_TONES: Record<CardTone, { background: string; border: string; edge: string }> = {
  neutral: { background: color.surface, border: color.line, edge: color.line },
  selected: { background: color.blueLt, border: color.blue, edge: color.blue },
  wrong: { background: color.redLt, border: color.red, edge: color.red },
  right: { background: color.tealLt, border: color.teal, edge: color.teal },
  reward: { background: color.goldLt, border: color.gold, edge: color.goldDk },
};

type Common = {
  children: ReactNode;
  tone?: CardTone;
  testID?: string;
};

export type CardProps =
  | (Common & { onPress?: undefined; accessibilityLabel?: undefined; disabled?: undefined })
  | (Common & {
      /** Cartão tocável: afunda como o botão. */
      onPress: () => void;
      /** Obrigatório quando tocável; o estado (certo/errado) é somado aqui. */
      accessibilityLabel: string;
      disabled?: boolean;
    });

function StateIcon({ tone, labelled }: { tone: CardTone; labelled: boolean }) {
  if (tone !== 'right' && tone !== 'wrong') return null;
  const icon =
    tone === 'right' ? (
      <Icon name="check" size={size.stateIcon} color={color.tealDk} />
    ) : (
      <Icon name="x" size={size.stateIcon} color={color.red} />
    );
  // No cartão sem toque, o ícone é quem diz o estado ao leitor de tela.
  return labelled ? (
    <View accessible accessibilityLabel={STATE_LABEL[tone]} style={styles.icon}>
      {icon}
    </View>
  ) : (
    <View style={styles.icon}>{icon}</View>
  );
}

/**
 * Cartão de borda grossa (UX-DR26 a UX-DR30). Tons `right` e `wrong` mostram
 * ✓/✕ além da cor; `selected` é anunciado como selecionado.
 */
export function Card(props: CardProps) {
  const { children, tone = 'neutral', testID } = props;
  const look = CARD_TONES[tone];
  const state = tone === 'right' || tone === 'wrong' ? tone : undefined;
  const body = (
    <View style={styles.row}>
      <View style={styles.content}>{children}</View>
      <StateIcon tone={tone} labelled={!props.onPress} />
    </View>
  );

  if (!props.onPress) {
    return (
      <View
        testID={testID}
        style={[
          styles.card,
          { backgroundColor: look.background, borderWidth: size.border, borderColor: look.border },
          solid(look.edge, edge.card + size.border),
        ]}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable3D
      accessibilityLabel={withState(props.accessibilityLabel, state)}
      accessibilityState={{ selected: tone === 'selected' }}
      disabled={props.disabled}
      onPress={props.onPress}
      edge={{ color: look.edge, height: edge.card }}
      border={{ color: look.border, width: size.border }}
      minHeight={size.touchMin}
      style={[styles.card, { backgroundColor: look.background }]}
      testID={testID}
    >
      {body}
    </Pressable3D>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: rounded.lg, padding: size.cardPadding, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.half },
  content: { flex: 1 },
  icon: { flexShrink: 0 },
});
