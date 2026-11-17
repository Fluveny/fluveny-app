import { renderLabel } from '../label';

describe('renderLabel', () => {
  it('tira o negrito e a marcação da Expressão Útil, com as Variáveis do Aluno', () => {
    expect(renderLabel('**Nice to meet you**, {name}!', { name: 'Ana' })).toBe('Nice to meet you, Ana!');
    expect(renderLabel('Say [[hello|hi]] to Alex.')).toBe('Say hello to Alex.');
  });

  it('o valor do aluno fica como veio, mesmo com **', () => {
    expect(renderLabel('I am {name}.', { name: '**Ana**' })).toBe('I am **Ana**.');
  });

  it('escolhe a variante do pronome e mantém o placeholder sem valor (AD-8)', () => {
    expect(
      renderLabel({ he: 'He is **here**.', she: 'She is **here**.', they: 'They are **here**.' }, null, 'she'),
    ).toBe('She is here.');
    expect(renderLabel('Hi, {name}!')).toBe('Hi, {name}!');
  });
});
