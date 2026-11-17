// Preenchimento de lacunas (FR-19, UX-DR83, UX-DR84): as linhas com as lacunas
// no lugar, o banco de palavras ou os campos digitados. É só a mecânica, sem
// rede nem avaliação: o Completar lacunas (1.17) e o Extra Help (1.18) montam
// a Atividade em volta dele.
import { Fragment, useRef, type ComponentRef, type ReactNode } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';

import { captureError } from '../observability/sentry';
import {
  chooseVariant,
  ExpressionsInert,
  RenderedText,
  renderLabel,
  useRenderVars,
  type ContentText,
} from '../renderer';
import { GapSlot, WordChip, type GapState } from '../ui';
import { color, spacing, typography } from '../ui/tokens';
import type { Pronoun } from '../visitor/types';
import { useRevealField } from './PlayerFrame';

/** Uma lacuna: três ou mais `_` (a mesma regra do `ContentValidator` da API). */
export const GAP = /_{3,}/;

/** Uma palavra do banco. */
export type GapWord = { wordKey: string; text: ContentText };

/** O Resultado de uma lacuna depois de Verificar. */
export type GapMark = 'right' | 'wrong';

/** Os trechos de texto de uma linha, em volta das lacunas (n lacunas, n + 1 trechos). */
export function splitLine(line: string): string[] {
  return line.split(GAP);
}

/** A variante da linha; conteúdo malformado vai ao Sentry e conta como linha vazia. */
function variantOf(line: ContentText, pronoun: Pronoun | null | undefined): string {
  try {
    return chooseVariant(line, pronoun);
  } catch (error) {
    captureError(error);
    return '';
  }
}

/** Quantas lacunas as linhas têm, na variante do pronome. */
export function gapCount(lines: readonly ContentText[], pronoun?: Pronoun | null): number {
  return lines.reduce((total, line) => total + splitLine(variantOf(line, pronoun)).length - 1, 0);
}

/**
 * Toque numa palavra do banco: ela vai para a primeira lacuna vazia que não
 * está travada. Sem lacuna vazia (banco cheio), devolve `null` e nada muda.
 */
export function placeWord(values: readonly string[], wordKey: string, kept: ReadonlySet<number>): string[] | null {
  const at = values.findIndex((value, i) => !value && !kept.has(i));
  if (at < 0) return null;
  return values.map((value, i) => (i === at ? wordKey : value));
}

/**
 * As linhas completas: cada lacuna, na ordem, trocada pelo valor em negrito
 * (a "RESPOSTA ESPERADA" do "Vamos revisar"). Os tokens (`{name}`) ficam para
 * o renderizador da folha.
 */
export function fillLines(
  lines: readonly ContentText[],
  values: readonly string[],
  pronoun?: Pronoun | null,
): string[] {
  let next = 0;
  return lines.map((line) =>
    splitLine(variantOf(line, pronoun)).reduce((text, piece, i) => {
      if (i === 0) return piece;
      const value = values[next++];
      return `${text}${value ? `**${value}**` : '___'}${piece}`;
    }, ''),
  );
}

/**
 * As palavras de um trecho, cada uma com o espaço que vem depois. Negrito e
 * Expressão Útil com espaço dentro (`**Nice to meet**`, `[[a b|c]]`) ficam
 * inteiros, para o formato não se partir.
 */
export function wordsOf(piece: string): string[] {
  return piece.match(/(?:\[\[[^\]]*\]\]|\*\*(?:(?!\*\*)[^])*\*\*|\S)+\s*/g) ?? [];
}

export type GapFillProps = {
  /** As linhas do conteúdo, com as lacunas (`___`). */
  lines: readonly ContentText[];
  /** `bank`: o aluno toca nas palavras; `typed`: o aluno digita cada lacuna. */
  mode: 'bank' | 'typed';
  /** As palavras do banco, na ordem de exibição (quem chama decide se embaralha). */
  bank?: readonly GapWord[];
  /** O valor de cada lacuna, na ordem: a `wordKey` no banco, o texto digitado no `typed`; `''` é vazia. */
  values: readonly string[];
  onChange: (values: string[]) => void;
  /** Depois de Verificar: o Resultado de cada lacuna. */
  marks?: readonly (GapMark | null | undefined)[];
  /** As lacunas certas mantidas por TENTAR DE NOVO: `right` e travadas. */
  kept?: ReadonlySet<number>;
  /** Tudo travado (a folha de feedback aberta). */
  disabled?: boolean;
  testID?: string;
};

const NONE: ReadonlySet<number> = new Set();

/**
 * Lacunas no lugar, dentro das linhas. No banco, tocar numa palavra a põe na
 * primeira lacuna vazia, e ela fica fantasma (`used`); tocar numa lacuna
 * preenchida a esvazia e devolve a palavra. Digitada, cada lacuna é um campo
 * curto, que vai para a área visível acima do teclado ao receber o foco.
 * Sem arrastar.
 */
export function GapFill({
  lines,
  mode,
  bank = [],
  values,
  onChange,
  marks = [],
  kept = NONE,
  disabled = false,
  testID = 'gap-fill',
}: GapFillProps) {
  const context = useRenderVars();
  const reveal = useRevealField();
  const inputs = useRef(new Map<number, ComponentRef<typeof TextInput>>());
  const used = new Set(mode === 'bank' ? values.filter(Boolean) : []);
  const labelOf = (text: ContentText | undefined) => {
    if (text === undefined || text === null) return '';
    try {
      return renderLabel(text, context.vars, context.pronoun);
    } catch (error) {
      captureError(error);
      return '';
    }
  };
  const wordLabel = (wordKey: string) => labelOf(bank.find((word) => word.wordKey === wordKey)?.text);

  const stateOf = (index: number): GapState => {
    const mark = marks[index] ?? (kept.has(index) ? 'right' : null);
    if (mark) return mark;
    return values[index] ? 'filled' : 'empty';
  };
  const lockedAt = (index: number) => disabled || kept.has(index);

  const setAt = (index: number, value: string) => onChange(values.map((entry, i) => (i === index ? value : entry)));

  const slot = (index: number): ReactNode => {
    const common = {
      index: index + 1,
      state: stateOf(index),
      locked: lockedAt(index),
      testID: `${testID}-gap-${index}`,
    };
    if (mode === 'typed') {
      return (
        <GapSlot
          key={`gap-${index}`}
          {...common}
          kind="typed"
          value={values[index] ?? ''}
          onChangeText={(text) => setAt(index, text)}
          onFocus={() => reveal(inputs.current.get(index))}
          inputRef={(node) => {
            if (node) inputs.current.set(index, node);
            else inputs.current.delete(index);
          }}
        />
      );
    }
    const wordKey = values[index] ?? '';
    return (
      <GapSlot
        key={`gap-${index}`}
        {...common}
        kind="bank"
        value={wordKey ? wordLabel(wordKey) : null}
        onPress={() => setAt(index, '')}
      />
    );
  };

  let next = 0;
  const rendered = lines.map((line, lineIndex) => {
    const pieces = splitLine(variantOf(line, context.pronoun));
    return (
      <View key={lineIndex} style={styles.line} testID={`${testID}-line-${lineIndex}`}>
        {pieces.map((piece, i) => (
          <Fragment key={i}>
            {i > 0 ? (
              <>
                {slot(next++)}
                {/* O espaço depois da lacuna, quando o texto segue com um. */}
                {/^\s/.test(piece) ? <Text style={styles.text}> </Text> : null}
              </>
            ) : null}
            {wordsOf(piece).map((word, w) => (
              // O toque no trecho de Expressão Útil não abre a folha no meio do preenchimento.
              <ExpressionsInert key={w}>
                <RenderedText style={styles.text} text={word} vars={context.vars} pronoun={context.pronoun} />
              </ExpressionsInert>
            ))}
          </Fragment>
        ))}
      </View>
    );
  });

  return (
    <View style={styles.body} testID={testID}>
      <View style={styles.lines}>{rendered}</View>
      {mode === 'bank' ? (
        <View style={styles.bank} testID={`${testID}-bank`}>
          {bank.map((word) => {
            const isUsed = used.has(word.wordKey);
            return (
              <WordChip
                key={word.wordKey}
                label={labelOf(word.text)}
                state={isUsed ? 'used' : 'idle'}
                disabled={disabled || isUsed}
                onPress={() => {
                  const placed = placeWord(values, word.wordKey, kept);
                  if (placed) onChange(placed);
                }}
                testID={`${testID}-word-${word.wordKey}`}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[6] },
  lines: { gap: spacing[3] },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: spacing[2] },
  text: { ...typography.reading, color: color.ink },
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
