import { Fragment, useMemo, type ComponentRef, type Ref } from 'react';
import { Platform, StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { captureError } from '../observability/sentry';
import { color, fontFamily } from '../ui/tokens';
import type { Pronoun } from '../visitor/types';
import { EXPRESSION_HINT, useExpressions } from './expressions';
import { format, type Run } from './format';
import { render, type ContentText, type RenderVars } from './render';

export type RenderedTextProps = Omit<TextProps, 'children' | 'style'> & {
  text: ContentText | undefined;
  vars?: RenderVars | null;
  pronoun?: Pronoun | null;
  style?: StyleProp<TextStyle>;
  /**
   * Estilo somado ao `**negrito**` (o destaque da forma no Grammar Time, 1.19).
   * Só muda a aparência: a gramática do conteúdo é a mesma (AD-8).
   */
  strongStyle?: StyleProp<TextStyle>;
  /** O `Text` de fora (para mover o foco até ele). */
  ref?: Ref<ComponentRef<typeof Text>>;
};

/** Os trechos de `text`; conteúdo malformado (variante ausente) vai ao Sentry e não desenha nada. */
function runsOf(text: ContentText | undefined, vars?: RenderVars | null, pronoun?: Pronoun | null): Run[] {
  if (text === undefined || text === null) return [];
  try {
    return format(render(text, vars, pronoun));
  } catch (error) {
    captureError(error);
    return [];
  }
}

/**
 * No web, um `Text` com papel de botão vira `<button>`, que fica em
 * `inline-block` (o trecho não quebra com a frase e a pontuação pula de linha).
 * Lá, o trecho é um `<span>` em linha, com o papel `button` posto no nó, na
 * ordem do Tab (`focusable`) e ativado por Enter e Espaço.
 */
const WEB = Platform.OS === 'web';

/** Props do trecho tocável só no web (o `Text` do RN não tipa `onKeyDown`). */
function webButtonProps(onPress: () => void): Partial<TextProps> {
  return {
    ref: (node: unknown) =>
      (node as { setAttribute?: (name: string, value: string) => void } | null)?.setAttribute?.('role', 'button'),
    focusable: true,
    onKeyDown: (event: { key?: string; preventDefault?: () => void }) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault?.();
      onPress();
    },
  } as unknown as Partial<TextProps>;
}

/** Trechos seguidos da mesma Expressão Útil (o rótulo pode ter negrito ou variável no meio). */
type Group = { expression?: string; runs: Run[] };

function groupsOf(runs: readonly Run[]): Group[] {
  const groups: Group[] = [];
  for (const run of runs) {
    const last = groups[groups.length - 1];
    if (last && run.expression !== undefined && last.expression === run.expression) last.runs.push(run);
    else groups.push({ ...(run.expression === undefined ? {} : { expression: run.expression }), runs: [run] });
  }
  return groups;
}

function RunText({ run, strongStyle }: { run: Run; strongStyle?: StyleProp<TextStyle> }) {
  // O `strongStyle` não vale na Expressão Útil (fica o azul pontilhado) nem na Variável do Aluno (fica o ouro).
  const strong = run.bold && run.expression === undefined && !run.studentVar;
  return run.bold || run.studentVar ? (
    <Text
      testID={run.studentVar ? 'student-var' : undefined}
      style={[run.bold && styles.bold, strong && strongStyle, run.studentVar && styles.studentVar]}
    >
      {run.text}
    </Text>
  ) : (
    <>{run.text}</>
  );
}

/**
 * Texto do conteúdo renderizado: placeholders resolvidos com as Variáveis do
 * Aluno, `**negrito**` em Montserrat 800 e `[[rótulo|chave]]` só com o rótulo.
 * A Variável do Aluno vem em ouro, num `Text` aninhado. Use para todo texto do
 * conteúdo.
 *
 * Dentro de um `ExpressionsProvider` (1.14), o rótulo de uma chave da Unidade
 * vira um `Text` aninhado em azul, com papel de botão e a dica
 * {@link EXPRESSION_HINT}, que abre a folha de dicionário. Fora dele, ou com
 * chave desconhecida, sai como texto comum.
 */
export function RenderedText({ text, vars, pronoun, style, strongStyle, ...rest }: RenderedTextProps) {
  const runs = useMemo(() => runsOf(text, vars, pronoun), [text, vars, pronoun]);
  const groups = useMemo(() => groupsOf(runs), [runs]);
  const taps = useExpressions();
  return (
    <Text style={style} {...rest}>
      {groups.map((group, i) => {
        const key = group.expression;
        const children = group.runs.map((run, j) => <RunText key={j} run={run} strongStyle={strongStyle} />);
        if (key === undefined || !taps?.find(key)) return <Fragment key={i}>{children}</Fragment>;
        const press = taps.press;
        return press ? (
          <Text
            key={i}
            testID={`expression-${key}`}
            accessibilityRole={WEB ? undefined : 'button'}
            accessibilityHint={EXPRESSION_HINT}
            onPress={() => press(key)}
            style={styles.expression}
            {...(WEB ? webButtonProps(() => press(key)) : {})}
          >
            {children}
          </Text>
        ) : (
          // Outra folha aberta: o destaque fica, sem toque.
          <Text key={i} testID={`expression-${key}`} style={styles.expression}>
            {children}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontFamily: fontFamily[800], fontWeight: '800' },
  // UX-DR40. [ASSUMPTION] O sublinhado pontilhado (`textDecorationStyle`) só vale no
  // iOS e no web; no Android ele sai contínuo, na cor do texto (azul).
  expression: {
    backgroundColor: color.blueLt,
    color: color.blue,
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: color.blue,
  },
  // [ASSUMPTION] O sublinhado ouro de 3 px do DESIGN.md: o React Native não tem
  // `textDecorationThickness`. `borderBottom` não aparece em `Text` aninhado.
  // [ASSUMPTION] `textDecorationColor` só vale no iOS e no web: no Android o
  // sublinhado sai na cor do texto (`goldText`).
  studentVar: {
    backgroundColor: color.goldLt,
    color: color.goldText,
    textDecorationLine: 'underline',
    textDecorationColor: color.gold,
  },
});
