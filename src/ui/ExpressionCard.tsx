import type { ComponentRef, Ref } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { RenderedText } from '../renderer/RenderedText';
import type { ContentText, RenderVars } from '../renderer/render';
import type { Pronoun } from '../visitor/types';
import { Icon } from './icons';
import { color, edge, fontFamily, rounded, size, solid, spacing, typography } from './tokens';

/** O eyebrow do cartão de dicionário (DESIGN.md, Components). */
export const EXPRESSION_EYEBROW = 'USEFUL EXPRESSION';

/** O que o cartão mostra: a Expressão Útil da Unidade, crua. */
export type ExpressionEntry = {
  expressionKey: string;
  term: ContentText;
  meaning: ContentText;
  examples: ContentText[];
};

export type ExpressionCardProps = {
  expression: ExpressionEntry;
  vars?: RenderVars | null;
  pronoun?: Pronoun | null;
  /** O `Text` do termo (o título), para a folha mover o foco até ele. */
  headerRef?: Ref<ComponentRef<typeof Text>>;
  testID?: string;
};

/** Bloco do ícone de livro [ASSUMPTION: 40 dp, como no protótipo]. */
const BOOK_TILE = 40;
const BOOK_ICON = 22;
/** Marcador vermelho dos exemplos [ASSUMPTION: 6 dp, como no protótipo]. */
const BULLET = 6;

/**
 * Cartão de dicionário da Expressão Útil (UX-DR41): bloco azul com o ícone de
 * livro, eyebrow "USEFUL EXPRESSION", termo em 900, significado em 600 e
 * exemplos em itálico 700 com marcador vermelho. Todo o texto é do conteúdo
 * (`RenderedText`). Sem o botão "Ouvir": o áudio não entra no Lançamento 1.
 */
export function ExpressionCard({
  expression,
  vars,
  pronoun,
  headerRef,
  testID = 'expression-card',
}: ExpressionCardProps) {
  const examples = Array.isArray(expression.examples) ? expression.examples : [];
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.head}>
        <View style={[styles.tile, solid(color.blueDk, edge.chip)]}>
          <Icon name="book" size={BOOK_ICON} color={color.surface} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.eyebrow}>{EXPRESSION_EYEBROW}</Text>
          <RenderedText
            ref={headerRef}
            // No web, o título recebe o foco da folha sem entrar na ordem do Tab.
            {...(Platform.OS === 'web' ? ({ tabIndex: -1 } as object) : {})}
            style={styles.term}
            accessibilityRole="header"
            text={expression.term}
            vars={vars}
            pronoun={pronoun}
            testID={`${testID}-term`}
          />
        </View>
      </View>
      <RenderedText style={styles.meaning} text={expression.meaning} vars={vars} pronoun={pronoun} />
      {examples.length > 0 ? (
        <View style={styles.examples}>
          {examples.map((example, i) => (
            <View key={i} style={styles.example}>
              <View style={styles.bullet} />
              <RenderedText style={styles.exampleText} text={example} vars={vars} pronoun={pronoun} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.blueLt,
    borderWidth: size.border,
    borderColor: color.blueMd,
    borderRadius: rounded.lg,
    padding: size.cardPadding,
    gap: spacing.half,
    alignSelf: 'stretch',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.half },
  tile: {
    width: BOOK_TILE,
    height: BOOK_TILE,
    borderRadius: rounded.sm,
    backgroundColor: color.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headText: { flex: 1 },
  eyebrow: { ...typography.eyebrow, fontFamily: fontFamily[900], fontWeight: '900', color: color.blue },
  term: { ...typography.title, color: color.ink },
  meaning: { ...typography.bodyStrong, color: color.ink },
  examples: { gap: spacing[1] },
  example: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  bullet: {
    width: BULLET,
    height: BULLET,
    borderRadius: rounded.full,
    backgroundColor: color.red,
    marginTop: ((typography.body.lineHeight ?? BULLET) - BULLET) / 2,
  },
  exampleText: {
    ...typography.body,
    flex: 1,
    fontFamily: fontFamily[700],
    fontWeight: '700',
    fontStyle: 'italic',
    color: color.ink,
  },
});
