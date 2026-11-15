// Renderização do texto do conteúdo (AD-8), com as mesmas regras do
// ContentRenderer.java da API: escolhe a variante de pronome e troca os
// placeholders pelas Variáveis do Aluno. Não conjuga, não mexe em maiúsculas e
// deixa `**negrito**` e `[[rótulo|chave]]` como texto (a formatação é do
// `format.ts`). Os casos de referência são os `render-vectors.json` da API.
import type { components } from '../api/schema';
import type { Pronoun } from '../visitor/types';

/** Texto do conteúdo: uma string ou as variantes `{he, she, they}`. */
export type ContentText = components['schemas']['ContentText'];

/** Valores por placeholder, sem as chaves (`name`, `avatar.hair`). */
export type RenderVars = Readonly<Record<string, string>>;

/** Um trecho do texto renderizado. `studentVar`: veio de uma Variável do Aluno. */
export type Segment = { text: string; studentVar: boolean };

// O mesmo padrão do Java (`\{([^{}\s]+)}`), com o `\s` do Java (só espaços ASCII).
const PLACEHOLDER = /\{([^{} \t\n\x0B\f\r]+)\}/g;

/** A string como veio, ou a variante do pronome (`null` ou ausente vale `they`). Variante ausente lança. */
export function chooseVariant(text: ContentText, pronoun?: Pronoun | null): string {
  if (typeof text === 'string') return text;
  if (text === null || typeof text !== 'object') throw new TypeError('O texto do conteúdo não é string nem variantes');
  const chosen = pronoun ?? 'they';
  const variant = (text as Partial<Record<Pronoun, unknown>>)[chosen];
  if (typeof variant !== 'string') {
    throw new Error(`O texto não tem a variante ${chosen}: ${JSON.stringify(text)}`);
  }
  return variant;
}

function valueOf(vars: RenderVars | null | undefined, key: string): string | undefined {
  if (!vars || !Object.prototype.hasOwnProperty.call(vars, key)) return undefined;
  const value = vars[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Renderiza `text` em segmentos. Placeholder com valor vira um segmento
 * `studentVar` (o valor não é expandido de novo); sem valor, o `{nome}` fica
 * literal num segmento comum. Segmentos vazios não entram.
 */
export function render(text: ContentText, vars?: RenderVars | null, pronoun?: Pronoun | null): Segment[] {
  const chosen = chooseVariant(text, pronoun);
  const segments: Segment[] = [];
  const pushText = (piece: string) => {
    if (piece === '') return;
    const last = segments[segments.length - 1];
    if (last && !last.studentVar) last.text += piece;
    else segments.push({ text: piece, studentVar: false });
  };

  let cursor = 0;
  for (const match of chosen.matchAll(PLACEHOLDER)) {
    const start = match.index;
    pushText(chosen.slice(cursor, start));
    const value = valueOf(vars, match[1]!);
    if (value === undefined) pushText(match[0]);
    else if (value !== '') segments.push({ text: value, studentVar: true });
    cursor = start + match[0].length;
  }
  pushText(chosen.slice(cursor));
  return segments;
}

/** A junção dos segmentos: o texto renderizado, como o `expected` dos vetores. */
export function joinSegments(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.text).join('');
}

/** Texto puro renderizado (com `**` e `[[…]]` como vieram). */
export function renderPlain(text: ContentText, vars?: RenderVars | null, pronoun?: Pronoun | null): string {
  return joinSegments(render(text, vars, pronoun));
}
