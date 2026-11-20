import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { color, rounded, spacing, typography } from './tokens';

export type StatusBannerTone = 'offline' | 'notice' | 'quiet';

/**
 * Cores de cada tom (Decisão 2 da história 1.9). `quiet` usa `muted-strong`:
 * o `muted` sobre `canvas` fica abaixo de 4,5:1 (DESIGN.md, Colors).
 */
export const STATUS_BANNER_TONES: Record<StatusBannerTone, { background: string; text: string }> = {
  offline: { background: color.ink, text: color.surface },
  notice: { background: color.goldLt, text: color.goldText },
  quiet: { background: color.canvas, text: color.mutedStrong },
};

export type StatusBannerProps = {
  tone: StatusBannerTone;
  /** Texto da faixa, em português (vem de quem usa). */
  text: string;
  /** Ação opcional: botão pequeno ghost ("REENVIAR"); `busy` desabilita e anuncia como ocupado. */
  action?: { label: string; onPress: () => void; busy?: boolean };
  testID?: string;
};

/**
 * Faixa de estado global (sem conexão, aviso, lembrete discreto). Só a peça
 * visual: quem mostra e esconde a faixa é a tela. O tom `offline` é anunciado
 * como alerta; os outros, não.
 */
export function StatusBanner({ tone, text, action, testID = 'status-banner' }: StatusBannerProps) {
  const look = STATUS_BANNER_TONES[tone];
  // A região viva só anuncia mudanças: a faixa de sem conexão é anunciada ao aparecer e quando o texto muda.
  useEffect(() => {
    if (tone === 'offline') AccessibilityInfo.announceForAccessibility(text);
  }, [tone, text]);
  return (
    <View testID={testID} style={[styles.banner, { backgroundColor: look.background }]}>
      <Text
        style={[styles.text, { color: look.text }]}
        accessibilityRole={tone === 'offline' ? 'alert' : undefined}
        accessibilityLiveRegion={tone === 'offline' ? 'polite' : undefined}
      >
        {text}
      </Text>
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} small variant="ghost" onPress={action.onPress} busy={action.busy} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: rounded.md,
    alignSelf: 'stretch',
  },
  action: { alignSelf: 'center' },
  text: { ...typography.bodyStrong, flexGrow: 1, flexShrink: 1, flexBasis: 160 },
});
