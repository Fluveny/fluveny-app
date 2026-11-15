import { useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { captureError } from '../observability/sentry';
import { color, fontFamily } from '../ui/tokens';
import type { Pronoun } from '../visitor/types';
import { format, type Run } from './format';
import { render, type ContentText, type RenderVars } from './render';

export type RenderedTextProps = Omit<TextProps, 'children' | 'style'> & {
  text: ContentText | undefined;
  vars?: RenderVars | null;
  pronoun?: Pronoun | null;
  style?: StyleProp<TextStyle>;
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
 * Texto do conteúdo renderizado: placeholders resolvidos com as Variáveis do
 * Aluno, `**negrito**` em Montserrat 800 e `[[rótulo|chave]]` só com o rótulo
 * (a folha da Expressão Útil é da 1.14). A Variável do Aluno vem em ouro, num
 * `Text` aninhado. Use para todo texto do conteúdo.
 */
export function RenderedText({ text, vars, pronoun, style, ...rest }: RenderedTextProps) {
  const runs = useMemo(() => runsOf(text, vars, pronoun), [text, vars, pronoun]);
  return (
    <Text style={style} {...rest}>
      {runs.map((run, i) =>
        run.bold || run.studentVar ? (
          <Text
            key={i}
            testID={run.studentVar ? 'student-var' : undefined}
            style={[run.bold && styles.bold, run.studentVar && styles.studentVar]}
          >
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontFamily: fontFamily[800], fontWeight: '800' },
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
