import { ALEX_WAVE_XML } from '../art/alexWave';

describe('Alex wave (SVG)', () => {
  it('nenhum elemento repete atributo', () => {
    const repeated: string[] = [];
    for (const [tag] of ALEX_WAVE_XML.matchAll(/<[a-zA-Z]+\s[^>]*>/g)) {
      const names = [...tag.matchAll(/\s([a-zA-Z:-]+)=/g)].map((m) => m[1]);
      if (new Set(names).size !== names.length) repeated.push(tag);
    }
    expect(repeated).toEqual([]);
  });
});
