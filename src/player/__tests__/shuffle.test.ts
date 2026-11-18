import { stableShuffle } from '../shuffle';

describe('stableShuffle', () => {
  it('estável pela activityKey, nunca na ordem do conteúdo, e é uma permutação', () => {
    const list = ['a', 'b', 'c', 'd'];
    for (const seed of ['speech-bubbles-match', 'x', 'y', 'z', 'outra']) {
      const once = stableShuffle(list, seed);
      expect(stableShuffle(list, seed)).toEqual(once);
      expect(once).not.toEqual(list);
      expect([...once].sort()).toEqual(list);
    }
    expect(stableShuffle(['a', 'b'], 'qualquer')).toEqual(['b', 'a']);
    expect(stableShuffle(['a'], 'qualquer')).toEqual(['a']);
  });
});
