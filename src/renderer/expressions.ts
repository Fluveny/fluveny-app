// Contexto das Expressões Úteis tocáveis (história 1.14). Fica num arquivo sem
// peças do kit: o `RenderedText` o lê, e a folha (no kit) usa o `RenderedText`.
import { createContext, useContext } from 'react';

import type { components } from '../api/schema';

/** Uma Expressão Útil da Unidade, como vem do `GET /units/{unitKey}`. */
export type UsefulExpression = components['schemas']['UsefulExpressionStudentView'];

/** A dica do trecho tocável para o leitor de tela (UX-DR136). */
export const EXPRESSION_HINT = 'Abre o significado da expressão';

/**
 * O que o `RenderedText` precisa para tornar um trecho `[[rótulo|chave]]`
 * tocável: a Expressão Útil da chave e o que fazer no toque. `press` nulo
 * (folha de feedback aberta) deixa o trecho destacado, mas sem toque.
 */
export type ExpressionTaps = {
  find: (expressionKey: string) => UsefulExpression | undefined;
  press: ((expressionKey: string) => void) | null;
};

/** Fora de um `ExpressionsProvider`, `null`: o trecho sai como texto comum. */
export const ExpressionContext = createContext<ExpressionTaps | null>(null);

/** As Expressões Úteis em volta, ou `null` fora de um `ExpressionsProvider`. */
export function useExpressions(): ExpressionTaps | null {
  return useContext(ExpressionContext);
}
