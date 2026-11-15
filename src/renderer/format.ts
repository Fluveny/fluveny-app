// Formatação do texto renderizado: interpreta `**negrito**` e
// `[[rótulo|chave]]` só nos segmentos do conteúdo. O valor do aluno
// (`studentVar`) é sempre texto, mesmo que tenha `**` ou `[[`. Um `**` aberto
// num segmento e fechado em outro vale (`I am **{name}**.`); marcador sem par
// fica como texto.
import type { Segment } from './render';

/** Um trecho para desenhar. `expression`: a chave da Expressão Útil cujo rótulo é este trecho. */
export type Run = { text: string; studentVar: boolean; bold: boolean; expression?: string };

type Token =
  { kind: 'text'; text: string; studentVar: boolean } | { kind: 'bold' | 'open' | 'pipe' | 'close'; text: string };

const MARKER = /\*\*|\[\[|\]\]|\|/g;
const KIND: Record<string, Token['kind']> = { '**': 'bold', '[[': 'open', '|': 'pipe', ']]': 'close' };

function tokenize(segments: readonly Segment[]): Token[] {
  const tokens: Token[] = [];
  for (const segment of segments) {
    if (segment.studentVar) {
      tokens.push({ kind: 'text', text: segment.text, studentVar: true });
      continue;
    }
    let cursor = 0;
    for (const match of segment.text.matchAll(MARKER)) {
      if (match.index > cursor)
        tokens.push({ kind: 'text', text: segment.text.slice(cursor, match.index), studentVar: false });
      tokens.push({ kind: KIND[match[0]]!, text: match[0] } as Token);
      cursor = match.index + match[0].length;
    }
    if (cursor < segment.text.length)
      tokens.push({ kind: 'text', text: segment.text.slice(cursor), studentVar: false });
  }
  return tokens;
}

/** `[[`, rótulo não vazio, `|`, chave só de texto do conteúdo, `]]`. Devolve o fim e a chave, ou `null`. */
function matchExpression(tokens: readonly Token[], open: number): { pipe: number; close: number; key: string } | null {
  let pipe = -1;
  for (let i = open + 1; i < tokens.length; i++) {
    const kind = tokens[i]!.kind;
    if (kind === 'open' || kind === 'close') return null;
    if (kind === 'pipe') {
      pipe = i;
      break;
    }
  }
  if (pipe < 0) return null;
  let key = '';
  for (let i = pipe + 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind === 'close')
      return key.trim() === '' || pipe === open + 1 ? null : { pipe, close: i, key: key.trim() };
    if (token.kind !== 'text' || token.studentVar) return null;
    key += token.text;
  }
  return null;
}

/** Formata os segmentos em trechos com negrito, Variável do Aluno e Expressão Útil. */
export function format(segments: readonly Segment[]): Run[] {
  const tokens = tokenize(segments);
  // Papel de cada marcador: `hidden` some da tela; o resto vira texto.
  const hidden = new Set<number>();
  const expressionOf = new Map<number, string>();

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.kind !== 'open') continue;
    const match = matchExpression(tokens, i);
    if (!match) continue;
    for (let j = i + 1; j < match.pipe; j++) expressionOf.set(j, match.key);
    for (let j = match.pipe; j <= match.close; j++) hidden.add(j);
    hidden.add(i);
    i = match.close;
  }

  const bolds = tokens.flatMap((token, i) => (token.kind === 'bold' && !hidden.has(i) ? [i] : []));
  const pairs = bolds.length - (bolds.length % 2);
  for (let k = 0; k < pairs; k++) hidden.add(bolds[k]!);
  const toggles = new Set(bolds.slice(0, pairs));

  const runs: Run[] = [];
  let bold = false;
  tokens.forEach((token, i) => {
    if (toggles.has(i)) {
      bold = !bold;
      return;
    }
    if (hidden.has(i)) return;
    const studentVar = token.kind === 'text' && token.studentVar;
    const expression = expressionOf.get(i);
    const last = runs[runs.length - 1];
    if (last && !last.studentVar && !studentVar && last.bold === bold && last.expression === expression) {
      last.text += token.text;
      return;
    }
    runs.push({ text: token.text, studentVar, bold, ...(expression === undefined ? {} : { expression }) });
  });
  return runs;
}
