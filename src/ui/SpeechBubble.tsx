import { Children, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AlexAvatar } from './AlexAvatar';
import type { AlexPose } from './art/alexSvg';
import { Card } from './Card';
import { color, fontFamily, size, spacing, typography } from './tokens';

export type SpeechBubbleTail = 'top' | 'left';

export type SpeechBubbleProps = {
  /**
   * A fala, em inglês. Texto (string, número ou lista deles) vira `bubble` e é
   * lido junto com o falante; um nó (Expressões Úteis tocáveis) entra como veio.
   */
  children: ReactNode;
  /** Nome do falante, no eyebrow vermelho em caixa alta. Padrão: Alex. */
  speaker?: string;
  /**
   * Onde o personagem está. `top`: o balão ocupa o topo da cena e o rabicho sai
   * da borda de baixo, apontando para Alex embaixo. `left`: o personagem fica à
   * esquerda e o rabicho sai da borda esquerda. Com `avatar`, é sempre `left`.
   */
  tail?: SpeechBubbleTail;
  /** Fora da cena: avatar circular de Alex (60 dp) à esquerda, nesta pose. */
  avatar?: AlexPose;
  testID?: string;
};

/** Texto puro: string, número ou lista só deles (`Hi, {name}!` chega como lista). */
function textOf(children: ReactNode): string | null {
  const parts = Children.toArray(children);
  if (parts.length === 0 || !parts.every((p) => typeof p === 'string' || typeof p === 'number')) return null;
  return parts.join('');
}

/** Meia diagonal do quadrado girado: quanto o rabicho sai para fora do balão. */
const TAIL_OUT = Math.round((size.bubbleTail * Math.SQRT2) / 2);

/**
 * Balão de fala (DESIGN.md `speech-bubble`): o `Card` neutro (borda de 2, cantos
 * de 20, sombra de 4) com o falante em eyebrow vermelho e a fala em `bubble`.
 * O rabicho é um quadrado girado 45° que aponta para o personagem. Sem botão de
 * áudio no Lançamento 1 (EXPERIENCE.md, Component Patterns).
 */
export function SpeechBubble({
  children,
  speaker = 'Alex',
  tail = 'top',
  avatar,
  testID = 'speech-bubble',
}: SpeechBubbleProps) {
  const side: SpeechBubbleTail = avatar ? 'left' : tail;
  const line = textOf(children);
  const bubble = (
    <View style={[styles.bubble, side === 'top' ? styles.roomBelow : styles.roomLeft]} testID={testID}>
      <Card>
        {line !== null ? (
          // Fala de texto: o leitor ouve falante e fala de uma vez ("Alex: Hi!").
          <View accessible accessibilityLabel={`${speaker}: ${line}`} testID={`${testID}-line`}>
            <Text style={styles.speaker}>{speaker}</Text>
            <Text style={styles.text}>{line}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.speaker}>{speaker}</Text>
            {children}
          </>
        )}
      </Card>
      <View
        testID={`${testID}-tail-${side}`}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={[styles.tail, side === 'top' ? styles.tailDown : styles.tailLeft]}
      />
    </View>
  );
  if (!avatar) return bubble;
  return (
    <View style={styles.row}>
      <AlexAvatar pose={avatar} />
      {bubble}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3] },
  bubble: { alignSelf: 'stretch', flexGrow: 1, flexShrink: 1 },
  // Espaço para o rabicho que sai do balão, para ele não cobrir o vizinho.
  roomBelow: { marginBottom: TAIL_OUT },
  roomLeft: { marginLeft: TAIL_OUT - spacing[1] },
  speaker: {
    ...typography.eyebrow,
    fontFamily: fontFamily[900],
    fontWeight: '900',
    color: color.red,
    textTransform: 'uppercase',
    marginBottom: spacing[1],
  },
  text: { ...typography.bubble, color: color.ink },
  tail: {
    position: 'absolute',
    width: size.bubbleTail,
    height: size.bubbleTail,
    backgroundColor: color.surface,
    borderColor: color.line,
    transform: [{ rotate: '45deg' }],
  },
  // Girado 45°, o canto de baixo era o canto inferior direito: bordas de baixo e da direita.
  tailDown: {
    bottom: -TAIL_OUT + size.border,
    alignSelf: 'center',
    borderBottomWidth: size.border,
    borderRightWidth: size.border,
  },
  // O canto da esquerda era o canto inferior esquerdo: bordas da esquerda e de baixo.
  // Fica na altura do meio do avatar, que está alinhado por baixo.
  tailLeft: {
    left: -TAIL_OUT + size.border,
    bottom: size.avatar / 2 - size.bubbleTail / 2,
    borderLeftWidth: size.border,
    borderBottomWidth: size.border,
  },
});
