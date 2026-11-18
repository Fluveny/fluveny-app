// Embaralhamento estável do player: o mesmo sorteio a cada abertura, sem
// entregar o gabarito pela ordem do conteúdo. Usado pelo Associar (respostas,
// 1.16) e pelas Lacunas (banco, 1.17).

/** Hash FNV-1a de 32 bits: a semente do embaralhamento. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Embaralha de forma estável pela `activityKey` (a mesma ordem a cada abertura).
 * Se o sorteio repetir a ordem do conteúdo, gira uma posição: a ordem das
 * respostas nunca entrega o gabarito.
 */
export function stableShuffle<T>(list: readonly T[], seed: string): T[] {
  const out = [...list];
  let state = hash(seed) || 1;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  if (out.length > 1 && out.every((entry, i) => entry === list[i])) out.push(out.shift()!);
  return out;
}
