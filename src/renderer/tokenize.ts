// Tokenização da transcrição da Fala (história 1.15, AD-10): antes de mandar a
// Tentativa, cada valor das Variáveis do Aluno vira o token do placeholder
// ("hi alex i'm ana" → "hi alex i'm {name}"). Assim o nome e o país não vão
// para a API, e o servidor não conta essas palavras (elas saem da conferência).
// É o possível, não uma garantia: um nome que o reconhecedor ouviu com outra
// grafia ("Ana" → "anna") não é achado e vai como veio.
import type { RenderVars } from './render';

/** As Variáveis do Aluno que podem aparecer na fala. */
export const SPOKEN_VARIABLES = ['name', 'country'] as const;

/** Letra (com caixa) ou dígito: o que emenda uma palavra. O apóstrofo não emenda ("Ana's"). */
function isWordChar(char: string | undefined): boolean {
  if (!char) return false;
  return char.toLowerCase() !== char.toUpperCase() || (char >= '0' && char <= '9');
}

/** Sem acento e em minúsculas, caractere por caractere. */
function foldChar(char: string): string {
  let base = char;
  try {
    base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    // Sem `normalize` (motor sem Intl): compara com o acento.
  }
  return base.toLowerCase();
}

/**
 * O texto dobrado (sem acento, minúsculas) e, para cada caractere dele, o
 * índice do caractere de origem; o último item é o tamanho do original.
 */
function fold(text: string): { folded: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    for (const char of foldChar(text[i]!)) {
      folded += char;
      origin.push(i);
    }
  }
  origin.push(text.length);
  return { folded, origin };
}

/** Placeholders do conteúdo (`{name}`), o mesmo padrão do `render.ts`. */
const PLACEHOLDER = /\{[^{} \t\n\x0B\f\r]+\}/g;

/** Quantas vezes `needle` (dobrado) aparece como palavra inteira em `folded`. */
function countWhole(folded: string, needle: string): number {
  let count = 0;
  for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + 1)) {
    if (!isWordChar(folded[at - 1]) && !isWordChar(folded[at + needle.length])) count += 1;
  }
  return count;
}

/**
 * Troca, em `text`, as ocorrências de palavra inteira de `value` pelo `token`,
 * menos as `keep` primeiras (as que a frase-alvo tem como palavra literal).
 */
function replaceWhole(text: string, value: string, token: string, keep = 0): string {
  const { folded: needle } = fold(value);
  if (!needle) return text;
  let result = text;
  let from = 0;
  let kept = 0;
  for (;;) {
    const { folded, origin } = fold(result);
    const at = folded.indexOf(needle, from);
    if (at === -1) return result;
    const end = at + needle.length;
    const before = folded[at - 1];
    const after = folded[end];
    // Palavra inteira, e nunca dentro de um token já trocado ("{name}").
    const whole = !isWordChar(before) && !isWordChar(after) && !(before === '{' && after === '}');
    if (!whole || kept < keep) {
      // A palavra que a frase-alvo também tem fica como veio.
      if (whole) kept += 1;
      from = at + 1;
      continue;
    }
    const start = origin[at]!;
    const stop = origin[end]!;
    result = `${result.slice(0, start)}${token}${result.slice(stop)}`;
    from = fold(`${result.slice(0, start)}${token}`).folded.length;
  }
}

/**
 * Troca cada valor das Variáveis do Aluno (`name`, `country`) da transcrição
 * pelo token (`{name}`), sem diferenciar caixa nem acento ("julia" acha
 * "Júlia") e só em palavra inteira ("Ana" não troca o começo de "Anaheim").
 * Valores mais longos primeiro: "United States" antes de um nome "States".
 *
 * `target` (a frase-alvo crua, com os placeholders): quando o valor também é
 * palavra literal dela (o aluno se chama Alex e o alvo é "Hi Alex, I'm
 * {name}."), as primeiras ocorrências, tantas quantas o alvo tem fora dos
 * placeholders, ficam como vieram; só as outras viram token. Senão o servidor
 * tiraria o "Alex" do cumprimento e a resposta certa falharia.
 */
export function tokenizeVariables(
  transcript: string,
  vars: RenderVars | null | undefined,
  keys: readonly string[] = SPOKEN_VARIABLES,
  target?: string,
): string {
  if (!vars) return transcript;
  const entries = keys
    .flatMap((key) => {
      const value = Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : undefined;
      return typeof value === 'string' && value.trim() ? [[key, value.trim()] as const] : [];
    })
    .sort((a, b) => b[1].length - a[1].length);
  const literal = target ? fold(target.replace(PLACEHOLDER, ' ')).folded : '';
  return entries.reduce(
    (text, [key, value]) =>
      replaceWhole(text, value, `{${key}}`, literal ? countWhole(literal, fold(value).folded) : 0),
    transcript,
  );
}
