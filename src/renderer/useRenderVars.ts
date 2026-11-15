import { useMemo } from 'react';

import type { Pronoun, VisitorStore } from '../visitor/types';
import { useVisitor } from '../visitor/useVisitor';
import type { RenderVars } from './render';

const PRONOUNS: readonly Pronoun[] = ['he', 'she', 'they'];

export type RenderContext = { vars: RenderVars; pronoun: Pronoun };

/** O pronome salvo, ou `they` quando falta ou não é um dos três. */
export function toPronoun(value: string | null | undefined): Pronoun {
  return (PRONOUNS as readonly (string | null | undefined)[]).includes(value) ? (value as Pronoun) : 'they';
}

/** `vars` e `pronoun` do renderizador a partir das Variáveis do Aluno. */
export function toRenderContext(variables: Readonly<Record<string, string>>): RenderContext {
  return { vars: variables, pronoun: toPronoun(variables.pronoun) };
}

/** As Variáveis do Aluno (do `useVisitor()`) para o renderizador. */
export function useRenderVars(store?: VisitorStore): RenderContext {
  const { variables } = useVisitor(store);
  return useMemo(() => toRenderContext(variables), [variables]);
}
