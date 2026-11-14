// Comparação de versões X.Y.Z (AD-11: `minAppVersion` vem nesse formato).
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Só string no formato X.Y.Z; qualquer outra coisa (inclusive não string) é `null`. */
export function parseVersion(version: unknown): [number, number, number] | null {
  if (typeof version !== 'string') return null;
  const match = SEMVER.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** `a < b`. Uma versão fora do formato nunca é considerada menor. */
export function isBelow(a: unknown, b: unknown): boolean {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return false;
  const [aMajor, aMinor, aPatch] = left;
  const [bMajor, bMinor, bPatch] = right;
  if (aMajor !== bMajor) return aMajor < bMajor;
  if (aMinor !== bMinor) return aMinor < bMinor;
  return aPatch < bPatch;
}
