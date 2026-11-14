/** Palavras de estado que vão no rótulo do leitor de tela (Decisão 2 da história 1.8). */
export const STATE_LABEL = {
  right: 'certo',
  wrong: 'errado',
  used: 'usado',
} as const;

/** Junta o rótulo e o estado: "coffee, certo". */
export function withState(label: string, state?: keyof typeof STATE_LABEL): string {
  return state ? `${label}, ${STATE_LABEL[state]}` : label;
}
