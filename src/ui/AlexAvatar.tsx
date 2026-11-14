import { StyleSheet, View } from 'react-native';

import { Alex } from './art/Alex';
import type { AlexPose } from './art/alexSvg';
import { color, rounded, size } from './tokens';

export type AlexAvatarProps = {
  pose?: AlexPose;
  /** Diâmetro em dp, de 58 a 64 (DESIGN.md, Components). Padrão: 60. */
  diameter?: number;
  /** Decorativo por padrão (oculto do leitor); ver `Alex`. */
  accessibilityLabel?: string;
  testID?: string;
};

/** Alex escala 1,2× o círculo e desce um pouco: o rosto fica no centro e o corpo é recortado. */
const ALEX_SCALE = 1.2;

/**
 * Avatar circular de Alex ao lado de um balão (Expressão Útil, Resposta Livre,
 * Fala com `listen`): círculo em `wall` com anel branco e Alex recortado.
 */
export function AlexAvatar({ pose = 'wave', diameter = size.avatar, accessibilityLabel, testID = 'alex-avatar' }: AlexAvatarProps) {
  const alex = Math.round(diameter * ALEX_SCALE);
  return (
    <View testID={testID} style={[styles.circle, { width: diameter, height: diameter }]}>
      <View style={{ marginTop: Math.round(diameter * 0.06), marginLeft: (diameter - alex) / 2 - size.avatarRing }}>
        <Alex pose={pose} size={alex} accessibilityLabel={accessibilityLabel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: rounded.full,
    backgroundColor: color.wall,
    borderWidth: size.avatarRing,
    borderColor: color.surface,
    overflow: 'hidden',
    flexShrink: 0,
  },
});
