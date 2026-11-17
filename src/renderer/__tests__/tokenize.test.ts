import { tokenizeVariables } from '../tokenize';

describe('tokenizeVariables()', () => {
  it('troca o nome pelo token, sem diferenciar caixa', () => {
    expect(tokenizeVariables("hi alex i'm ana", { name: 'Ana' })).toBe("hi alex i'm {name}");
    expect(tokenizeVariables("Hi Alex, I'm ANA.", { name: 'ana' })).toBe("Hi Alex, I'm {name}.");
  });

  it('só em palavra inteira', () => {
    expect(tokenizeVariables('ana from anaheim, banana', { name: 'Ana' })).toBe('{name} from anaheim, banana');
    expect(tokenizeVariables("ana's room", { name: 'Ana' })).toBe("{name}'s room");
  });

  it('sem diferenciar acento: "julia" acha "Júlia", e o acento da fala também', () => {
    expect(tokenizeVariables("hi alex i'm julia", { name: 'Júlia' })).toBe("hi alex i'm {name}");
    expect(tokenizeVariables("i'm Júlia", { name: 'Julia' })).toBe("i'm {name}");
  });

  it('nome e país, todas as ocorrências, o valor mais longo primeiro', () => {
    expect(
      tokenizeVariables('i am states from united states, states', { name: 'States', country: 'United States' }),
    ).toBe('i am {name} from {country}, {name}');
    expect(tokenizeVariables("i'm ana from brazil", { name: 'Ana', country: 'Brazil' })).toBe(
      "i'm {name} from {country}",
    );
  });

  it('não troca dentro de um token já trocado', () => {
    expect(tokenizeVariables('i am name', { name: 'Name', country: 'Name Land' })).toBe('i am {name}');
  });

  it('sem variáveis, vazias ou de outra chave: a transcrição fica como veio', () => {
    expect(tokenizeVariables('hello there', null)).toBe('hello there');
    expect(tokenizeVariables('hello there', { name: '  ' })).toBe('hello there');
    expect(tokenizeVariables('i am she', { pronoun: 'she' })).toBe('i am she');
  });

  it('o valor que também é palavra literal do alvo: as ocorrências do alvo ficam, só o resto vira token', () => {
    const target = "Hi Alex, I'm {name}.";
    expect(tokenizeVariables("hi alex i'm alex", { name: 'Alex' }, undefined, target)).toBe("hi alex i'm {name}");
    expect(tokenizeVariables('hi alex', { name: 'Alex' }, undefined, target)).toBe('hi alex');
    expect(tokenizeVariables("i'm alex hi alex", { name: 'Alex' }, undefined, target)).toBe("i'm alex hi {name}");
    // O placeholder do alvo não conta como literal; sem alvo, troca tudo.
    expect(tokenizeVariables("hi ana i'm ana", { name: 'Ana' }, undefined, "Hi, I'm {name}.")).toBe(
      "hi {name} i'm {name}",
    );
    expect(tokenizeVariables("hi alex i'm alex", { name: 'Alex' })).toBe("hi {name} i'm {name}");
  });
});
