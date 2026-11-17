import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { RenderedText, useRenderVars } from '../../renderer';
import { Card } from '../../ui';
import { color, fontFamily, rounded, size, spacing, typography } from '../../ui/tokens';
import type { ActivityProps, ActivityView } from '../registry';

type CardsView = Extract<ActivityView, { type: 'cards' }>;
type CardBlock = CardsView['blocks'][number];

export const CARDS_EYEBROW = 'USEFUL EXPRESSIONS';
export const NEXT_BLOCK_LABEL = 'PRÓXIMO BLOCO';
export const CONTINUE_LABEL = 'CONTINUAR';

/** "Bloco 2 de 3". */
export const blockLine = (position: number, total: number) => `Bloco ${position} de ${total}`;

/** Segmento do indicador [ASSUMPTION: 8 dp de altura, como no protótipo]. */
const SEGMENT_HEIGHT = 8;
/** Bloco do emoji [ASSUMPTION: 56 dp, como no protótipo]. */
const EMOJI_TILE = 56;
const EMOJI_SIZE = 30;

/**
 * Cartões de expressões (FR-14, UX-DR72, UX-DR52): um bloco por vez, com o
 * emoji, o título e os itens. O indicador segmentado mostra "Bloco n de m"; os
 * segmentos já vistos são tocáveis para voltar. PRÓXIMO BLOCO avança e, no
 * último bloco, CONTINUAR conclui com `viewed`. Sem correção, sem áudio.
 */
export function CardsActivity({ activity, setFooter, advance }: ActivityProps) {
  const context = useRenderVars();
  const view = activity as CardsView;
  const blocks = useMemo<CardBlock[]>(() => (Array.isArray(view.blocks) ? view.blocks : []), [view.blocks]);
  const total = blocks.length;
  const [index, setIndex] = useState(0);
  /** Quantos blocos já apareceram (o primeiro, de cara). */
  const [seen, setSeen] = useState(1);
  const block = blocks[index];
  const last = index >= total - 1;

  const onPress = useCallback(() => {
    if (last) {
      advance({ outcome: 'viewed', xp: 0 });
      return;
    }
    setIndex(index + 1);
    setSeen((value) => Math.max(value, index + 2));
  }, [last, index, advance]);

  // A troca de bloco é anunciada (a região viva só vale no Android); a entrada, não.
  const shownIndex = useRef(index);
  useEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    AccessibilityInfo.announceForAccessibility(blockLine(index + 1, total));
  }, [index, total]);

  useEffect(() => {
    setFooter({ label: last ? CONTINUE_LABEL : NEXT_BLOCK_LABEL, onPress });
  }, [setFooter, last, onPress]);

  const items = Array.isArray(block?.items) ? block.items : [];
  return (
    <View style={styles.body} testID="cards-activity">
      <View>
        <Text style={styles.eyebrow}>{CARDS_EYEBROW}</Text>
        <RenderedText
          style={styles.title}
          accessibilityRole="header"
          text={view.title}
          vars={context.vars}
          pronoun={context.pronoun}
        />
      </View>
      {total > 1 ? (
        <View style={styles.segments} testID="cards-segments">
          {blocks.map((entry, k) => {
            const reachable = k < seen;
            const current = k === index;
            return (
              <Pressable
                key={entry.blockKey}
                onPress={reachable && !current ? () => setIndex(k) : undefined}
                disabled={!reachable}
                accessibilityRole="button"
                accessibilityLabel={blockLine(k + 1, total)}
                accessibilityState={{ selected: current, disabled: !reachable }}
                style={styles.segmentHit}
                testID={`cards-segment-${k + 1}`}
              >
                <View
                  style={[
                    styles.segment,
                    { backgroundColor: current ? color.blue : reachable ? color.blueMd : color.line },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {block ? (
        <Card testID={`cards-block-${block.blockKey}`}>
          <View style={styles.block}>
            <View style={styles.head}>
              {block.emoji ? (
                <View style={styles.emojiTile} accessible={false} importantForAccessibility="no-hide-descendants">
                  <Text style={styles.emoji}>{block.emoji}</Text>
                </View>
              ) : null}
              <View style={styles.headText}>
                <Text style={styles.position} accessibilityLiveRegion="polite" testID="cards-position">
                  {blockLine(index + 1, total)}
                </Text>
                <RenderedText
                  style={styles.blockTitle}
                  accessibilityRole="header"
                  text={block.title}
                  vars={context.vars}
                  pronoun={context.pronoun}
                />
              </View>
            </View>
            {items.map((item) => (
              <View key={item.itemKey} style={styles.item} testID={`cards-item-${item.itemKey}`}>
                <RenderedText style={styles.itemText} text={item.text} vars={context.vars} pronoun={context.pronoun} />
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  eyebrow: { ...typography.eyebrow, fontFamily: fontFamily[900], fontWeight: '900', color: color.blue },
  title: { ...typography.title, color: color.ink, marginTop: spacing[1] },
  segments: { flexDirection: 'row', gap: spacing[2] },
  // A barra tem 8 dp; a área de toque, 48 (UX-DR137).
  segmentHit: { flex: 1, minHeight: size.touchMin, justifyContent: 'center' },
  segment: { height: SEGMENT_HEIGHT, borderRadius: rounded.full },
  block: { gap: spacing[3] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  emojiTile: {
    width: EMOJI_TILE,
    height: EMOJI_TILE,
    borderRadius: rounded.md,
    backgroundColor: color.blueLt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emoji: { fontSize: EMOJI_SIZE },
  headText: { flex: 1, gap: spacing[1] },
  position: { ...typography.eyebrow, color: color.muted },
  blockTitle: { ...typography.title, color: color.ink },
  item: { borderTopWidth: size.border, borderTopColor: color.line, paddingTop: spacing.half },
  itemText: { ...typography.item, color: color.ink },
});
