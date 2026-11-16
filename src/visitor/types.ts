// Tipos e peças comuns da loja do Visitante (histórias 1.10 e 1.12). A loja
// nativa (store.ts, expo-sqlite) e a do web (store.web.ts, localStorage) têm a
// mesma API. Só o `deviceId` vai para a API, nas rotas do Visitante
// (`/visitor/attempts`, `/attempts/reveal` e `/visitor/completions`). Variáveis
// (nome, país, texto livre), Progresso e recibos ficam só no aparelho até o
// cadastro (Épico 2).

/** Variante de pronome do conteúdo (`ContentText`). */
export type Pronoun = 'he' | 'she' | 'they';

/** Chaves conhecidas das Variáveis do Aluno; o conteúdo pode criar outras. */
export type VariableKey = 'name' | 'country' | 'pronoun' | (string & {});

/**
 * Como a Atividade terminou. `completed`: verificada; `viewed`: vista, sem
 * correção; `skipped`: pulada ("Não posso falar agora"). `viewed` e `skipped`
 * passam pela rota `completions` antes de entrar no Progresso (1.12).
 */
export type Outcome = 'completed' | 'viewed' | 'skipped';

/** Uma linha do Progresso: a primeira conclusão de uma Atividade. */
export type ProgressEntry = {
  activityKey: string;
  outcome: Outcome;
  xp: number;
};

/** Um recibo da API, guardado sem decodificar (o App não lê nem mostra). */
export type ReceiptEntry = {
  activityKey: string;
  receipt: string;
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
  /**
   * Guarda o recibo opaco que a API mandou para a Atividade. Só o primeiro
   * vale: um recibo já guardado não é trocado (a migração da 2.6 o usa).
   */
  recordReceipt(activityKey: string, receipt: string): Promise<void>;
  /** Os recibos guardados, na ordem em que chegaram. */
  receipts(): Promise<ReceiptEntry[]>;
  /** Avisa quando variáveis ou Progresso mudam. Devolve a função que cancela. */
  subscribe(listener: () => void): () => void;
};

export const OUTCOMES: readonly Outcome[] = ['completed', 'viewed', 'skipped'];

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
