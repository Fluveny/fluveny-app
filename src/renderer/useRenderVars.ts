import { useMemo } from 'react';

import { pronounOf, useCachedStudent, type StudentProfile } from '../auth/student';
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

/**
 * Com o Aluno da sessão (2.1), o nome, o país (2.9) e o pronome da conta vencem
 * os do aparelho: o pronome sempre (sem escolha, `they`), o nome e o país
 * quando a conta tem um.
 */
export function withStudent(context: RenderContext, student: StudentProfile | null | undefined): RenderContext {
  if (!student) return context;
  const name = student.name?.trim();
  const country = student.country?.trim();
  const vars = { ...context.vars, ...(name ? { name } : {}), ...(country ? { country } : {}) };
  return { vars, pronoun: pronounOf(student) };
}

/** As Variáveis do Aluno (do `useVisitor()`, com o nome e o pronome da conta) para o renderizador. */
export function useRenderVars(store?: VisitorStore): RenderContext {
  const { variables } = useVisitor(store);
  const student = useCachedStudent();
  return useMemo(() => withStudent(toRenderContext(variables), student), [variables, student]);
}
