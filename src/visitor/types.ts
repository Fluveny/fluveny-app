// Tipos e peças comuns da loja do Visitante (história 1.10). A loja nativa
// (store.ts, expo-sqlite) e a do web (store.web.ts, localStorage) têm a mesma
// API. Nada daqui vai para a API: `deviceId`, variáveis e Progresso ficam só
// no aparelho até o cadastro (Épico 2).

/** Variante de pronome do conteúdo (`ContentText`). */
export type Pronoun = 'he' | 'she' | 'they';

/** Chaves conhecidas das Variáveis do Aluno; o conteúdo pode criar outras. */
export type VariableKey = 'name' | 'country' | 'pronoun' | (string & {});

/**
 * Como a Atividade terminou. `completed`: verificada (ou vista, se não é
 * avaliada); `skipped`: pulada ("Não posso falar agora"). [ASSUMPTION] Os
 * valores podem crescer com a folha de feedback (1.11).
 */
export type Outcome = 'completed' | 'skipped';

/** Uma linha do Progresso: a primeira conclusão de uma Atividade. */
export type ProgressEntry = {
  activityKey: string;
  outcome: Outcome;
  xp: number;
};

export type VisitorStore = {
  /** UUID do aparelho: gerado na primeira chamada e o mesmo daí em diante. */
  deviceId(): Promise<string>;
  getVariable(key: VariableKey): Promise<string | null>;
  setVariable(key: VariableKey, value: string): Promise<void>;
  variables(): Promise<Record<string, string>>;
  progress(): Promise<ProgressEntry[]>;
  /**
   * Grava a conclusão de uma Atividade. Só a primeira vale: refazer não muda
   * o Resultado nem o XP registrados (FR-26, FR-27).
   */
  recordProgress(entry: ProgressEntry): Promise<void>;
  /** Avisa quando variáveis ou Progresso mudam. Devolve a função que cancela. */
  subscribe(listener: () => void): () => void;
};

export const OUTCOMES: readonly Outcome[] = ['completed', 'skipped'];

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value);
}

/** XP total do Progresso. */
export function totalXp(progress: readonly ProgressEntry[]): number {
  return progress.reduce((sum, entry) => sum + entry.xp, 0);
}

/** XP inteiro e não negativo (o que vier torto vira 0). */
export function safeXp(xp: number): number {
  return Number.isFinite(xp) && xp > 0 ? Math.round(xp) : 0;
}

/** Lista de ouvintes das mudanças da loja. */
export function createEmitter() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      for (const listener of [...listeners]) listener();
    },
  };
}
