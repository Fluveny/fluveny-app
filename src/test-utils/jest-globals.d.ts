// Ganchos que o jest.setup.js põe no `global` (mocks do expo-sqlite, do expo-network e do
// expo-speech-recognition).
declare global {
  /** Apaga as linhas de todas as tabelas dos bancos em memória. */
  var __resetSqlite: () => void;
  /** Muda o estado da rede e avisa os ouvintes do expo-network. */
  var __setNetwork: (state: { isConnected?: boolean; isInternetReachable?: boolean }) => void;
  /** Volta a rede para online, sem avisar. */
  var __resetNetwork: () => void;
  /** O reconhecimento de fala simulado (expo-speech-recognition). */
  var __speech: {
    /** O módulo simulado (`start`, `stop`, `abort` são `jest.fn`). */
    module: Record<string, jest.Mock>;
    /** Muda a disponibilidade, o reconhecimento no aparelho e a permissão (e a resposta do pedido). */
    set: (state: {
      available?: boolean;
      onDevice?: boolean;
      permission?: { granted: boolean; canAskAgain: boolean; status: string; expires?: string };
      request?: { granted: boolean; canAskAgain: boolean; status: string; expires?: string } | null;
      /** `abort()` sem eventos na hora (o `end` atrasado vem por `emit`). */
      lateAbort?: boolean;
      /** `start()` lança. */
      startThrows?: boolean;
    }) => void;
    /** Se está ouvindo (entre o `start` e o `end`). */
    readonly listening: boolean;
    /** O que o reconhecedor ouviu: vira o resultado final no `stop()` (segundo toque). */
    hear: (transcript: string) => void;
    /** Fim pelo silêncio: o resultado final (se houver texto) e o `end`. */
    finish: (transcript?: string) => void;
    /** Um erro do reconhecedor, seguido do `end`. */
    error: (code: string) => void;
    /** Um evento solto do reconhecedor (`speechstart`, um `end` atrasado…). */
    emit: (event: string, payload?: unknown) => void;
    /** Volta ao padrão: disponível, permissão concedida, nada ouvido. */
    reset: () => void;
  };
}

export {};
