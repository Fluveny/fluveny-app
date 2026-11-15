import type { components } from '../api/schema';
import type { Pronoun } from '../visitor/types';

export type ContentText = components['schemas']['ContentText'];

/**
 * Texto do conteúdo como texto puro, até o renderizador chegar (segunda spec
 * da 1.10): a string como veio, ou a variante do pronome (`they` por padrão).
 * Placeholders como `{name}` ainda aparecem crus.
 */
export function plainText(text: ContentText | undefined, pronoun: Pronoun = 'they'): string {
  if (text === undefined || text === null) return '';
  if (typeof text === 'string') return text;
  return text[pronoun] ?? text.they ?? '';
}
