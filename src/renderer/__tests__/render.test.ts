// Renderizador (1.10, parte 2): os vetores da API e a matriz da spec.
import vectorsFile from '../render-vectors.json';
import { format } from '../format';
import { chooseVariant, joinSegments, render, renderPlain, type ContentText, type RenderVars } from '../render';
import { toPronoun, toRenderContext } from '../useRenderVars';
import type { Pronoun } from '../../visitor/types';

type Vector = {
  name: string;
  text: ContentText;
  vars?: RenderVars | null;
  pronoun: Pronoun | null;
  expected: string;
};

const vectors = (vectorsFile as { vectors: Vector[] }).vectors;

describe('render-vectors.json da API', () => {
  it('a lista não é vazia e os nomes são únicos', () => {
    expect(vectors.length).toBeGreaterThan(0);
    expect(new Set(vectors.map((vector) => vector.name)).size).toBe(vectors.length);
  });

  it.each(vectors.map((vector) => [vector.name, vector] as const))('%s', (_, vector) => {
    expect(joinSegments(render(vector.text, vector.vars, vector.pronoun))).toBe(vector.expected);
  });
});

describe('render()', () => {
  it('variável preenchida: 3 segmentos, o valor com studentVar', () => {
    expect(render('Hi, {name}!', { name: 'Ana' })).toEqual([
      { text: 'Hi, ', studentVar: false },
      { text: 'Ana', studentVar: true },
      { text: '!', studentVar: false },
    ]);
  });

  it('variável vazia: o {country} fica literal num segmento comum', () => {
    expect(render('From {country}.', {})).toEqual([{ text: 'From {country}.', studentVar: false }]);
  });

  it('o valor não é expandido de novo', () => {
    expect(render('I am {name}.', { name: '{country}', country: 'Brazil' })).toEqual([
      { text: 'I am ', studentVar: false },
      { text: '{country}', studentVar: true },
      { text: '.', studentVar: false },
    ]);
  });

  it('chave do protótipo do objeto não conta como variável', () => {
    expect(renderPlain('{toString} {constructor}', {})).toBe('{toString} {constructor}');
  });

  it('pronome sem valor salvo: variante they', () => {
    const text = { he: 'He is', she: 'She is', they: 'They are' };
    expect(renderPlain(text, {}, null)).toBe('They are');
    expect(renderPlain(text, {}, undefined)).toBe('They are');
    expect(renderPlain(text, {}, toRenderContext({}).pronoun)).toBe('They are');
  });

  it('variante ausente lança erro', () => {
    const text = { he: 'He is', she: 'She is' } as unknown as ContentText;
    expect(() => chooseVariant(text, 'they')).toThrow('variante they');
    expect(() => render(text, {}, null)).toThrow('variante they');
  });
});

describe('toPronoun()', () => {
  it('pronome inválido ou ausente vale they', () => {
    expect(toPronoun('she')).toBe('she');
    expect(toPronoun('he')).toBe('he');
    expect(toRenderContext({ pronoun: 'she' }).pronoun).toBe('she');
    expect(toPronoun('it')).toBe('they');
    expect(toPronoun(undefined)).toBe('they');
    expect(toRenderContext({ pronoun: 'SHE', name: 'Ana' })).toEqual({
      vars: { pronoun: 'SHE', name: 'Ana' },
      pronoun: 'they',
    });
  });
});

describe('format()', () => {
  const runs = (text: string, vars: RenderVars = {}) => format(render(text, vars));

  it('var em negrito: o ** fecha em outro segmento, sem ** visível', () => {
    expect(runs('I am **{name}**.', { name: 'Ana' })).toEqual([
      { text: 'I am ', studentVar: false, bold: false },
      { text: 'Ana', studentVar: true, bold: true },
      { text: '.', studentVar: false, bold: false },
    ]);
  });

  it('valor com markup: fica literal, sem negrito nem expressão', () => {
    expect(runs('I am {name}.', { name: '**x** [[a|b]]' })).toEqual([
      { text: 'I am ', studentVar: false, bold: false },
      { text: '**x** [[a|b]]', studentVar: true, bold: false },
      { text: '.', studentVar: false, bold: false },
    ]);
  });

  it('expressão: só o rótulo, com o {name} resolvido, e a chave guardada', () => {
    expect(runs('[[Nice to meet you, {name}|nice-to-meet-you]]!', { name: 'Ana' })).toEqual([
      { text: 'Nice to meet you, ', studentVar: false, bold: false, expression: 'nice-to-meet-you' },
      { text: 'Ana', studentVar: true, bold: false, expression: 'nice-to-meet-you' },
      { text: '!', studentVar: false, bold: false },
    ]);
  });

  it('marcador sem par fica como texto', () => {
    expect(runs('a ** b [[c d|e f')).toEqual([{ text: 'a ** b [[c d|e f', studentVar: false, bold: false }]);
    expect(runs('**a** b **')).toEqual([
      { text: 'a', studentVar: false, bold: true },
      { text: ' b **', studentVar: false, bold: false },
    ]);
  });

  it('rótulo vazio não é expressão: fica como texto', () => {
    expect(runs('[[|be-from]] x')).toEqual([{ text: '[[|be-from]] x', studentVar: false, bold: false }]);
  });

  it('chave com espaço em volta é guardada sem os espaços', () => {
    expect(runs('[[a| be-from ]]')).toEqual([{ text: 'a', studentVar: false, bold: false, expression: 'be-from' }]);
  });

  it('chave com variável não é expressão', () => {
    expect(runs('[[a|{name}]]', { name: 'Ana' }).map((run) => run.text)).toEqual(['[[a|', 'Ana', ']]']);
  });

  it('negrito dentro do rótulo e pipe fora de expressão', () => {
    expect(runs('[[**from**|be-from]] a|b')).toEqual([
      { text: 'from', studentVar: false, bold: true, expression: 'be-from' },
      { text: ' a|b', studentVar: false, bold: false },
    ]);
  });
});
