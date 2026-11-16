import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alex } from './art/Alex';
import { Button, type ButtonVariant } from './Button';
import { Icon, type IconName } from './icons';
import { color, edge, fontFamily, rounded, size, solid, spacing, typography } from './tokens';
import { XpChipLight } from './XpChip';

export type FeedbackTone = 'correct' | 'wrong' | 'review';

/** Títulos da folha (EXPERIENCE.md, Voice and Tone). O erro nunca diz "errado" no título. */
export const FEEDBACK_TITLES: Record<FeedbackTone, string> = {
  correct: 'Mandou bem!',
  wrong: 'Quase lá!',
  review: 'Vamos revisar',
};

/** Texto do Erro (tabela de copy oficial, UX-DR150). */
export const WRONG_MESSAGE =
  'Os itens marcados em vermelho estão errados. Tente de novo ou veja a resposta com a explicação.';

/** Rótulo da caixa da resposta esperada, em "Vamos revisar". */
export const EXPECTED_LABEL = 'RESPOSTA ESPERADA';

/** "Resultado: 2 de 3 itens · 67%". */
export const resultLine = (correct: number, total: number, pct: number) =>
  `Resultado: ${correct} de ${total} itens · ${pct}%`;

/**
 * Cores de cada tom (`feedback-sheet.tone-*` do DESIGN.md): o título na cor do
 * tom e o bloco do ícone com sombra sólida. No turquesa, o ícone vai em `ink` (AA).
 */
export const FEEDBACK_TONES: Record<
  FeedbackTone,
  { title: string; tile: string; tileEdge: string; icon: IconName; iconColor: string }
> = {
  correct: { title: color.tealDk, tile: color.teal, tileEdge: color.tealDk, icon: 'check', iconColor: color.ink },
  wrong: { title: color.red, tile: color.red, tileEdge: color.redDk, icon: 'x', iconColor: color.surface },
  review: { title: color.blue, tile: color.blue, tileEdge: color.blueDk, icon: 'eye', iconColor: color.surface },
};

/** Um botão da folha. Os botões ficam empilhados, com a largura toda. */
export type FeedbackAction = {
  label: string;
  variant?: ButtonVariant;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
};

export type FeedbackSheetProps = {
  tone: FeedbackTone;
  /** Linha de Resultado ("Resultado: n de m itens · x%"); só quando há mais de um item. */
  result?: string;
  /** Texto abaixo do título. No Erro, o padrão é {@link WRONG_MESSAGE}. */
  message?: string;
  /** XP da primeira tentativa: o selo "+XP" aparece só no Acerto e com valor acima de 0. */
  xpGain?: number;
  /** Conteúdo da caixa "RESPOSTA ESPERADA" (só no tom `review`). */
  expected?: ReactNode;
  /** As justificativas, já renderizadas. */
  children?: ReactNode;
  /** Falha da última ação (texto de `messageFor`), anunciada como alerta. */
  error?: string;
  actions: FeedbackAction[];
  testID?: string;
};

/** Distância de onde a folha parte, abaixo da posição final, antes da mola. */
const SHEET_START = 480;

/**
 * Folha de feedback (UX-DR35, UX-DR63 a UX-DR68): branca, cantos de 28 no topo,
 * sobe com mola (aparece direto com "remover animações"). Recebe o foco e
 * anuncia o título e o Resultado a cada tom. No Acerto, Alex `cheer` espia por
 * cima da borda direita; no Erro, Alex não aparece.
 */
export function FeedbackSheet({
  tone,
  result,
  message,
  xpGain,
  expected,
  children,
  error,
  actions,
  testID = 'feedback-sheet',
}: FeedbackSheetProps) {
  const look = FEEDBACK_TONES[tone];
  const title = FEEDBACK_TITLES[tone];
  const text = message ?? (tone === 'wrong' ? WRONG_MESSAGE : undefined);
  const gain = tone === 'correct' && xpGain !== undefined && xpGain > 0 ? xpGain : undefined;
  const announcement = result ? `${title} ${result}` : title;
  const header = useRef<ComponentRef<typeof View>>(null);

  // Sobe com mola; a leitura de "remover animações" vem antes, para nunca animar com ela ligada.
  const [offset] = useState(() => new Animated.Value(SHEET_START));
  useEffect(() => {
    let alive = true;
    let rise: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => true)
      .then((reduced) => {
        if (!alive) return;
        if (reduced) {
          offset.setValue(0);
          return;
        }
        rise = Animated.spring(offset, { toValue: 0, useNativeDriver: Platform.OS !== 'web', bounciness: 6 });
        rise.start();
      });
    return () => {
      alive = false;
      rise?.stop();
      offset.setValue(0);
    };
  }, [offset]);

  // O foco vai para o título, e o leitor anuncia título e Resultado (UX-DR135).
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(announcement);
    const node = header.current;
    if (!node) return;
    if (Platform.OS === 'web') (node as unknown as { focus?: () => void }).focus?.();
    else AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }, [announcement]);

  return (
    <Animated.View testID={testID} style={[styles.sheet, { transform: [{ translateY: offset }] }]}>
      {tone === 'correct' ? (
        <View style={styles.alex} pointerEvents="none">
          <Alex pose="cheer" size={size.sheetAlex} />
        </View>
      ) : null}
      <View style={styles.headRow}>
        <View style={[styles.tile, { backgroundColor: look.tile }, solid(look.tileEdge, edge.chip)]}>
          <Icon name={look.icon} size={size.stateIcon} color={look.iconColor} />
        </View>
        <View
          ref={header}
          accessible
          accessibilityRole="header"
          accessibilityLabel={announcement}
          focusable={Platform.OS === 'web'}
          testID="feedback-sheet-header"
          style={styles.headText}
        >
          <Text style={[styles.title, { color: look.title }]}>{title}</Text>
          {result ? <Text style={styles.result}>{result}</Text> : null}
        </View>
        {gain === undefined ? null : <XpChipLight gain={gain} />}
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {text ? <Text style={styles.message}>{text}</Text> : null}
        {tone === 'review' && expected ? (
          <View style={styles.expected} testID="feedback-expected">
            <Text style={styles.expectedLabel}>{EXPECTED_LABEL}</Text>
            {expected}
          </View>
        ) : null}
        {children}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.actions}>
        {actions.map((action, index) => (
          <Button
            key={index}
            label={action.label}
            variant={action.variant}
            onPress={action.onPress}
            disabled={action.disabled}
            busy={action.busy}
            fullWidth
            testID={action.testID}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // [ASSUMPTION] Sem a sombra desfocada do `feedback-sheet` (o kit não usa sombra
  // desfocada): uma borda de 2 dp em `line` separa a folha do conteúdo.
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: rounded.sheet,
    borderTopRightRadius: rounded.sheet,
    borderTopWidth: size.border,
    borderLeftWidth: size.border,
    borderRightWidth: size.border,
    borderColor: color.line,
    paddingTop: size.sheetPaddingTop,
    paddingHorizontal: size.sheetPaddingX,
    paddingBottom: size.sheetPaddingBottom,
    gap: spacing[3],
    maxHeight: '80%',
    flexShrink: 1,
  },
  alex: { position: 'absolute', right: spacing.screenX, top: -size.sheetAlex * 0.62 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  tile: {
    width: size.sheetIconTile,
    minHeight: size.sheetIconTile,
    borderRadius: rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headText: { flex: 1, gap: spacing[1] },
  title: { ...typography.title },
  result: { ...typography.meta, color: color.mutedStrong },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { gap: spacing[3] },
  message: { ...typography.body, color: color.ink },
  expected: { backgroundColor: color.blueLt, borderRadius: rounded.md, padding: size.cardPadding, gap: spacing[1] },
  expectedLabel: { ...typography.eyebrow, fontFamily: fontFamily[900], fontWeight: '900', color: color.blue },
  error: { ...typography.bodyStrong, color: color.red },
  actions: { gap: spacing[3] },
});
