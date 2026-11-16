import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OFFLINE_TEXT } from '../network/text';
import { Button, Icon, Pressable3D, ProgressBar, StatusBanner, XpChip } from '../ui';
import { color, size, spacing, typography } from '../ui/tokens';
import { PlayerSheet } from './PlayerSheet';
import type { FooterAction, SheetSpec } from './registry';

export const CLOSE_LABEL = 'Sair';
export const OFFLINE_LABEL = 'SEM CONEXÃO';
export const PROGRESS_LABEL = 'Posição no Estágio';

/** Ícone ✕ do topo [ASSUMPTION: 22 dp, como no protótipo]. */
const CLOSE_ICON = 22;

/** "ESTÁGIO 1 · Meet & Greet". */
export const stageLine = (number: number, title: string) =>
  title ? `ESTÁGIO ${number} · ${title}` : `ESTÁGIO ${number}`;
/** "2 DE 13". */
export const positionLine = (position: number, total: number) => `${position} DE ${total}`;

/** ✕ do topo do player: `muted` (não `faint`, que reprova no AA), área de 48 dp. */
export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable3D
      accessibilityLabel={CLOSE_LABEL}
      onPress={onPress}
      edge={{ color: color.surface, height: 0 }}
      minHeight={size.touchMin}
      style={styles.close}
      testID="player-close"
    >
      <Icon name="x" size={CLOSE_ICON} color={color.muted} />
    </Pressable3D>
  );
}

/** A linha do topo e o banner, comuns ao player e aos estados de carregar e de erro. */
export function PlayerTop({
  onClose,
  online,
  progress,
  xp,
}: {
  onClose: () => void;
  online: boolean;
  progress?: number;
  xp?: number;
}) {
  return (
    <View testID="player-top">
      {online ? null : (
        <View style={styles.banner}>
          <StatusBanner tone="offline" text={OFFLINE_TEXT} />
        </View>
      )}
      <View style={styles.topRow}>
        <CloseButton onPress={onClose} />
        {progress === undefined ? (
          <View style={styles.grow} />
        ) : (
          <ProgressBar value={progress} accessibilityLabel={PROGRESS_LABEL} style={styles.bar} />
        )}
        {xp === undefined ? null : (
          // O chip se alinha ao início por padrão; aqui, ao meio da linha.
          <View style={styles.chip}>
            <XpChip xp={xp} />
          </View>
        )}
      </View>
    </View>
  );
}

/** Rodapé fixo com o único botão primário. Sem rede, vira "SEM CONEXÃO" desabilitado. */
export function PlayerFooter({ footer, online }: { footer: FooterAction | null; online: boolean }) {
  if (!footer) return <View style={styles.footer} testID="player-footer" />;
  return (
    <View style={styles.footer} testID="player-footer">
      {online && footer.message ? (
        <Text style={styles.message} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {footer.message}
        </Text>
      ) : null}
      {online ? (
        <Button
          label={footer.label}
          disabled={footer.disabled}
          busy={footer.busy}
          onPress={footer.onPress}
          fullWidth
          testID="player-action"
        />
      ) : (
        <Button label={OFFLINE_LABEL} disabled fullWidth testID="player-action" />
      )}
    </View>
  );
}

export type PlayerFrameProps = {
  stageNumber: number;
  /** Título do Estágio, em texto puro. */
  stageTitle: string;
  /** Posição da Atividade, a partir de 1. */
  position: number;
  total: number;
  xp: number;
  online: boolean;
  footer: FooterAction | null;
  /** A folha de feedback; aberta, ela entra no lugar do rodapé. */
  sheet?: SheetSpec | null;
  onClose: () => void;
  /** Muda a cada Atividade: a rolagem volta ao topo. */
  contentKey: string;
  children: ReactNode;
};

/**
 * Moldura do player (EXPERIENCE.md, Moldura comum do player): topo fixo (✕,
 * barra de posição e chip de XP), linha de posição, conteúdo rolável e rodapé
 * fixo com a ação que a Atividade define.
 */
export function PlayerFrame({
  stageNumber,
  stageTitle,
  position,
  total,
  xp,
  online,
  footer,
  sheet = null,
  onClose,
  contentKey,
  children,
}: PlayerFrameProps) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <PlayerTop onClose={onClose} online={online} progress={total > 0 ? position / total : 0} xp={xp} />
      <View style={styles.positionRow}>
        <Text style={[styles.position, styles.stage]}>{stageLine(stageNumber, stageTitle)}</Text>
        <Text style={styles.position}>{positionLine(position, total)}</Text>
      </View>
      <ScrollView
        key={contentKey}
        testID="player-content"
        style={styles.grow}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {sheet ? (
        <PlayerSheet sheet={sheet} online={online} offlineLabel={OFFLINE_LABEL} />
      ) : (
        <PlayerFooter footer={footer} online={online} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  banner: { paddingHorizontal: spacing.screenX, paddingTop: spacing[2] },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingLeft: spacing[2],
    paddingRight: spacing.screenX,
    paddingTop: spacing[2],
  },
  close: { width: size.touchMin, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  // A trilha da barra estica por padrão; na linha do topo, ela fica no meio da altura.
  bar: { flex: 1, alignSelf: 'center' },
  chip: { alignSelf: 'center' },
  positionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing[2],
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
  },
  position: { ...typography.eyebrow, color: color.muted, textTransform: 'uppercase' },
  stage: { flexShrink: 1, color: color.blue },
  content: { flexGrow: 1, padding: spacing.screenX, gap: spacing[4] },
  message: { ...typography.bodyStrong, color: color.red, paddingBottom: spacing[2] },
  footer: { paddingHorizontal: spacing.screenX, paddingTop: spacing[2], paddingBottom: spacing[4] },
});
