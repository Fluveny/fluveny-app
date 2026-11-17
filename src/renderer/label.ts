// Texto puro para rótulo (leitor de tela, `accessibilityLabel`): o texto
// renderizado e já formatado, sem os marcadores `**` e `[[…|…]]`. Na tela, o
// conteúdo usa o `RenderedText`; este é só o texto que ele mostra.
import type { Pronoun } from '../visitor/types';
import { format } from './format';
import { render, type ContentText, type RenderVars } from './render';

/** O texto que o `RenderedText` desenharia, sem formatação. Variante ausente lança, como o `render`. */
export function renderLabel(text: ContentText, vars?: RenderVars | null, pronoun?: Pronoun | null): string {
  return format(render(text, vars, pronoun))
    .map((run) => run.text)
    .join('');
}
