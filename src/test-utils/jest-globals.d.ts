// Ganchos que o jest.setup.js põe no `global` (mocks do expo-sqlite e do expo-network).
declare global {
  /** Apaga as linhas de todas as tabelas dos bancos em memória. */
  var __resetSqlite: () => void;
  /** Muda o estado da rede e avisa os ouvintes do expo-network. */
  var __setNetwork: (state: { isConnected?: boolean; isInternetReachable?: boolean }) => void;
  /** Volta a rede para online, sem avisar. */
  var __resetNetwork: () => void;
}

export {};
