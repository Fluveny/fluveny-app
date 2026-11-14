import { isBelow, parseVersion } from '../semver';

describe('semver', () => {
  it('compara X.Y.Z numericamente', () => {
    expect(isBelow('1.2.3', '1.2.4')).toBe(true);
    expect(isBelow('1.9.0', '1.10.0')).toBe(true);
    expect(isBelow('2.0.0', '1.99.99')).toBe(false);
    expect(isBelow('1.2.3', '1.2.3')).toBe(false);
  });

  it('versão fora do formato nunca bloqueia', () => {
    expect(parseVersion('1.2')).toBeNull();
    expect(isBelow('0.1.0', 'latest')).toBe(false);
    expect(isBelow('abc', '1.0.0')).toBe(false);
  });
});
