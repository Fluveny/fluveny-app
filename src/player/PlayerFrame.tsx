import { createContext, useCallback, useContext, useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OFFLINE_LABEL, OFFLINE_TEXT } from '../network/text';
import { Button, Icon, InteractionContext, Pressable3D, ProgressBar, StatusBanner, TextLink, XpChip } from '../ui';
import { color, size, spacing, typography } from '../ui/tokens';
import { PlayerSheet } from './PlayerSheet';
import type { FooterAction, SheetSpec } from './registry';

export const CLOSE_LABEL = 'Sair';
export { OFFLINE_LABEL };
export const PROGRESS_LABEL = 'Posição no Estágio';

/** O teclado empurra o conteúdo e o rodapé só no nativo; no web, o navegador cuida. */
const KEYBOARD_AVOIDING = Platform.OS !== 'web';

/** Folga entre o campo focado e a borda da área visível (o teclado ou o topo). */
const REVEAL_MARGIN = spacing[4];

/** Um nó que sabe a própria posição na janela (o `TextInput`, a `ScrollView`). */
type Measurable = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

/**
 * Leva um campo para a área visível acima do teclado (UX-DR131). O campo chama
 * no `onFocus`; com o teclado fechado, nada acontece, e a moldura cuida quando
 * ele abre. Fora do player, não faz nada.
 */
export type RevealField = (field: Measurable | null | undefined) => void;

const RevealFieldContext = createContext<RevealField>(() => {});

/** O `RevealField` da moldura do player. */
export const useRevealField = () => useContext(RevealFieldContext);

/**
 * Quanto rolar para o campo (`field`, na janela) caber na área visível
 * (`top`..`bottom`), com a folga: positivo desce, negativo sobe, 0 já cabe.
 */
export function revealDelta(field: { y: number; height: number }, top: number, bottom: number): number {
  const below = field.y + field.height - (bottom - REVEAL_MARGIN);
  if (below > 0) return Math.min(below, field.y - (top + REVEAL_MARGIN));
  const above = field.y - (top + REVEAL_MARGIN);
  return above < 0 ? above : 0;
}

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

/**
 * Rodapé fixo com o único botão primário, ou com um link de texto (`variant:
 * 'link'`). Sem rede, vira "SEM CONEXÃO" desabilitado, e a mensagem some
 * (menos a de `messageOffline`, o "salvar falhou" do Aluno, 2.4).
 */
export function PlayerFooter({ footer, online }: { footer: FooterAction | null; online: boolean }) {
  if (!footer) return <View style={styles.footer} testID="player-footer" />;
  return (
    <View style={styles.footer} testID="player-footer">
      {(online || footer.messageOffline) && footer.message ? (
        <Text style={styles.message} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {footer.message}
        </Text>
      ) : null}
      {online && footer.variant === 'link' ? (
        <TextLink
          label={footer.label}
          caps
          disabled={footer.disabled}
          busy={footer.busy}
          onPress={footer.onPress}
          testID="player-action"
        />
      ) : online ? (
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
  /** O XP do chip; sem ele (o Aluno antes da primeira leitura do servidor, 2.4), o chip some. */
  xp?: number;
  online: boolean;
  footer: FooterAction | null;
  /** A folha de feedback; aberta, ela entra no lugar do rodapé. */
  sheet?: SheetSpec | null;
  onClose: () => void;
  /** Muda a cada Atividade: a rolagem volta ao topo. */
  contentKey: string;
  /** Sem o recuo lateral do conteúdo (a cena do Diálogo, que tem o próprio recuo). */
  bleed?: boolean;
  /**
   * Uma interação do aluno, para o relógio de estudo (2.4): todo toque que
   * começa na moldura (sem tomar o toque de ninguém) e toda mudança de texto
   * num campo do kit dentro dela.
   */
  onInteraction?: () => void;
  children: ReactNode;
};

const noInteraction = () => {};

/**
 * Moldura do player (EXPERIENCE.md, Moldura comum do player): topo fixo (✕,
 * barra de posição e chip de XP), linha de posição, conteúdo rolável e rodapé
 * fixo com a ação que a Atividade define.
 *
 * No nativo, conteúdo e rodapé sobem com o teclado, e o campo focado vai para
 * a área visível acima dele, mesmo no meio do conteúdo (as lacunas digitadas,
 * 1.17): quando o teclado abre e quando o foco passa a outro campo com ele
 * aberto (`useRevealField`). Sem campo focado, a rolagem vai ao fim.
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
  bleed = false,
  onInteraction = noInteraction,
  children,
}: PlayerFrameProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  /** A rolagem atual e o topo do teclado na janela (`null` com ele fechado). */
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);

  const reveal = useCallback<RevealField>((field) => {
    if (!KEYBOARD_AVOIDING || keyboardTop.current === null || !field?.measureInWindow) return;
    // No quadro seguinte: o KeyboardAvoidingView aplica o padding no próprio listener.
    requestAnimationFrame(() => {
      const view = scroll.current as unknown as (Measurable & { getNativeScrollRef?: () => Measurable }) | null;
      // A instância pública da ScrollView já mede; a nativa fica de reserva.
      const host: Measurable | null | undefined = view?.measureInWindow ? view : view?.getNativeScrollRef?.();
      if (!host?.measureInWindow) return;
      host.measureInWindow((_x, top, _width, height) => {
        field.measureInWindow!((_fx, y, _fw, fieldHeight) => {
          const bottom = Math.min(top + height, keyboardTop.current ?? top + height);
          const delta = revealDelta({ y, height: fieldHeight }, top, bottom);
          if (delta !== 0) scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
        });
      });
    });
  }, []);

  // A rolagem nova (outra Atividade) começa no topo.
  useEffect(() => {
    offset.current = 0;
  }, [contentKey]);

  useEffect(() => {
    if (!KEYBOARD_AVOIDING) return;
    let frame: number | null = null;
    const shown = Keyboard.addListener('keyboardDidShow', (event?: KeyboardEvent) => {
      keyboardTop.current = event?.endCoordinates?.screenY ?? Number.POSITIVE_INFINITY;
      const focused = TextInput.State?.currentlyFocusedInput?.() as Measurable | null | undefined;
      if (focused?.measureInWindow) return reveal(focused);
      frame = requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
    });
    return () => {
      shown.remove();
      hidden.remove();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [reveal]);
  return (
    <SafeAreaView
      style={styles.screen}
      edges={['top', 'bottom', 'left', 'right']}
      testID="player-frame"
      // Na captura, todo toque passa por aqui antes do alvo; `false` deixa o toque seguir.
      onStartShouldSetResponderCapture={() => {
        onInteraction();
        return false;
      }}
    >
      <InteractionContext.Provider value={onInteraction}>
        <PlayerTop onClose={onClose} online={online} progress={total > 0 ? position / total : 0} xp={xp} />
        <View style={styles.positionRow}>
          <Text style={[styles.position, styles.stage]}>{stageLine(stageNumber, stageTitle)}</Text>
          <Text style={styles.position}>{positionLine(position, total)}</Text>
        </View>
        {/* No nativo (Android de ponta a ponta), o teclado não encolhe a janela: o
          conteúdo e o rodapé sobem com ele, e o campo focado vai para a área
          visível. No web, nada muda. */}
        <KeyboardAvoidingView
          style={styles.grow}
          behavior="padding"
          enabled={KEYBOARD_AVOIDING}
          testID="player-keyboard"
        >
          <ScrollView
            key={contentKey}
            ref={scroll}
            testID="player-content"
            style={styles.grow}
            contentContainerStyle={[styles.content, bleed ? styles.bleed : null]}
            keyboardShouldPersistTaps="handled"
            onScroll={(event) => {
              offset.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            <RevealFieldContext.Provider value={reveal}>{children}</RevealFieldContext.Provider>
          </ScrollView>
          {sheet ? (
            <PlayerSheet sheet={sheet} online={online} offlineLabel={OFFLINE_LABEL} />
          ) : (
            <PlayerFooter footer={footer} online={online} />
          )}
        </KeyboardAvoidingView>
      </InteractionContext.Provider>
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
  bleed: { paddingHorizontal: 0 },
  message: { ...typography.bodyStrong, color: color.red, paddingBottom: spacing[2] },
  footer: { paddingHorizontal: spacing.screenX, paddingTop: spacing[2], paddingBottom: spacing[4] },
});
