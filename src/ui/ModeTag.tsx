import { StyleSheet, Text, View } from 'react-native';

import { color, edge, fontFamily, rounded, size, solid, typography } from './tokens';

/** As tags de modo do Lançamento 1 (UX-DR37), em inglês. */
export const MODE_TAGS = [
  'GAME TIME',
  'GRAMMAR TIME',
  'VOCAB MODE',
  'Q&A',
  'GUESS WHO',
  'FILL IN THE GAPS',
  'BUILD A SENTENCE',
  'READING TIME',
  'VIDEO',
  'EXTRA HELP',
  'FINAL CHALLENGE',
] as const;

export type ModeTagLabel = (typeof MODE_TAGS)[number];

/** Tag de modo no topo da Atividade: diz que mecânica vem pela frente. Não é tocável. */
export function ModeTag({ label, testID = 'mode-tag' }: { label: ModeTagLabel; testID?: string }) {
  return (
    <View accessible accessibilityLabel={label} testID={testID} style={[styles.tag, solid(color.blueDk, edge.chip)]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: color.blue,
    borderRadius: rounded.sm,
    paddingVertical: size.modeTagPaddingY,
    paddingHorizontal: size.modeTagPaddingX,
  },
  text: {
    ...typography.eyebrow,
    fontFamily: fontFamily[900],
    fontWeight: '900',
    letterSpacing: size.modeTagLetterSpacing,
    color: color.surface,
    textTransform: 'uppercase',
  },
});
