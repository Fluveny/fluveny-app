import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { Alex } from './art/Alex';
import { ALEX_VIEWBOX, type AlexPose } from './art/alexSvg';
import { Room } from './art/Room';
import { color, rounded, scene, size, spacing } from './tokens';

/** Altura da cena: 46% da tela, limitada a 300–420 dp (DESIGN.md, Layout & Spacing). */
export function sceneHeight(screenHeight: number): number {
  return Math.min(scene.max, Math.max(scene.min, Math.round(screenHeight * scene.ratio)));
}

export type SceneFrameProps = {
  /** Por cima da cena, no topo (o balão de fala de Alex). */
  children?: ReactNode;
  /** Alex em cena (205 dp, embaixo e no centro); `null` para a cena vazia. Padrão: `wave`. */
  pose?: AlexPose | null;
  testID?: string;
};

/**
 * Moldura da cena do Diálogo: cantos `xl`, recuo de 14 dp, o quarto ao fundo e
 * Alex embaixo. A altura é mínima: com a fonte ampliada, o balão empurra a
 * moldura em vez de ser cortado. Cena e Alex são decorativos (ocultos do leitor).
 */
export function SceneFrame({ children, pose = 'wave', testID = 'scene-frame' }: SceneFrameProps) {
  const { height } = useWindowDimensions();
  return (
    <View testID={testID} style={[styles.frame, { minHeight: sceneHeight(height) }]}>
      <Room />
      {pose ? (
        <View style={styles.alex}>
          <Alex pose={pose} size={size.alexInScene} />
        </View>
      ) : null}
      <View style={[styles.content, pose ? { paddingBottom: ALEX_RESERVE } : null]} testID={`${testID}-content`}>
        {children}
      </View>
    </View>
  );
}

// Alex desce um pouco além da borda de baixo e é recortado, como no protótipo.
const ALEX_DROP = spacing.half;

/** Linha das sobrancelhas de Alex no desenho (viewBox 200×222). */
const ALEX_BROW_Y = 70;

/**
 * Espaço que o conteúdo deixa embaixo quando Alex está em cena: o balão nunca
 * desce abaixo das sobrancelhas dele.
 */
export const ALEX_RESERVE = Math.round(
  ((size.alexInScene * ALEX_VIEWBOX.height) / ALEX_VIEWBOX.width) * (1 - ALEX_BROW_Y / ALEX_VIEWBOX.height) - ALEX_DROP,
);

const styles = StyleSheet.create({
  frame: {
    marginHorizontal: spacing.sceneInset,
    borderRadius: rounded.xl,
    overflow: 'hidden',
    backgroundColor: color.wall,
  },
  alex: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -ALEX_DROP,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  content: { padding: spacing[3], gap: spacing[3] },
});
