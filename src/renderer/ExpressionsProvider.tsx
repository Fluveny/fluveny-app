import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { ExpressionSheet } from '../ui/ExpressionSheet';
import { ExpressionContext, useExpressions, type ExpressionTaps, type UsefulExpression } from './expressions';
import { useRenderVars } from './useRenderVars';

export type ExpressionsProviderProps = {
  /** As `usefulExpressions` da Unidade. */
  expressions: readonly UsefulExpression[] | undefined;
  /**
   * Outra folha aberta (a de feedback): os trechos ficam sem toque e a folha
   * de dicionário não abre. Nunca duas folhas (UX-DR129).
   */
  disabled?: boolean;
  children: ReactNode;
};

/**
 * Torna tocáveis os trechos `[[rótulo|chave]]` do `RenderedText` abaixo dele,
 * quando a chave é uma Expressão Útil da Unidade, e mostra a folha de
 * dicionário no toque. A folha fica fora da árvore dos filhos: abrir e fechar
 * não remonta nem muda a Atividade.
 */
export function ExpressionsProvider({ expressions, disabled = false, children }: ExpressionsProviderProps) {
  const { vars, pronoun } = useRenderVars();
  const [openKey, setOpenKey] = useState<string | null>(null);
  // A outra folha abriu: esta não volta sozinha quando ela fechar.
  if (disabled && openKey !== null) setOpenKey(null);
  const byKey = useMemo(
    () => new Map((Array.isArray(expressions) ? expressions : []).map((entry) => [entry.expressionKey, entry])),
    [expressions],
  );
  const find = useCallback((key: string) => byKey.get(key), [byKey]);
  const value = useMemo<ExpressionTaps>(() => ({ find, press: disabled ? null : setOpenKey }), [find, disabled]);
  const close = useCallback(() => setOpenKey(null), []);
  const open = openKey === null ? null : (byKey.get(openKey) ?? null);
  return (
    <>
      <ExpressionContext.Provider value={value}>{children}</ExpressionContext.Provider>
      <ExpressionSheet expression={open} vars={vars} pronoun={pronoun} onClose={close} />
    </>
  );
}

/**
 * Dentro de um alvo de toque (a alternativa da Escolha), o trecho fica
 * destacado, mas sem toque: o toque vai para o alvo, não abre a folha.
 */
export function ExpressionsInert({ children }: { children: ReactNode }) {
  const taps = useExpressions();
  const inert = useMemo<ExpressionTaps | null>(() => (taps ? { find: taps.find, press: null } : null), [taps]);
  return <ExpressionContext.Provider value={inert}>{children}</ExpressionContext.Provider>;
}
