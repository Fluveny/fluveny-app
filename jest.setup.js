// O @sentry/react-native cria um setInterval no import (AsyncExpiringMap) que
// segura o processo do jest aberto. Nos testes, o SDK é um mock; o sentry.test.ts
// confere o que a nossa camada passa para ele.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  wrap: (component) => component,
}));

// expo-sqlite: o mesmo SQL do App, num SQLite em memória do próprio Node
// (`node:sqlite`). Cada nome de banco é um banco só durante o teste inteiro, então
// "reabrir o App" (uma loja nova sobre o mesmo nome) acha os mesmos dados.
// `global.__resetSqlite()` apaga as linhas de todas as tabelas.
jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite');
  const databases = new Map();
  const flat = (params) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
  const adapter = (db) => ({
    execAsync: async (source) => db.exec(source),
    runAsync: async (source, ...params) => {
      const result = db.prepare(source).run(...flat(params));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getFirstAsync: async (source, ...params) => db.prepare(source).get(...flat(params)) ?? null,
    getAllAsync: async (source, ...params) => db.prepare(source).all(...flat(params)),
    closeAsync: async () => {},
  });
  global.__resetSqlite = () => {
    for (const db of databases.values()) {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      for (const { name } of tables) db.exec(`DELETE FROM "${name}"`);
    }
  };
  return {
    openDatabaseAsync: jest.fn(async (name) => {
      if (!databases.has(name)) databases.set(name, new DatabaseSync(':memory:'));
      return adapter(databases.get(name));
    }),
  };
});

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => require('node:crypto').randomUUID()),
}));

// expo-network: online por padrão. `global.__setNetwork(state)` muda o estado e
// avisa os ouvintes (como o sistema avisaria).
jest.mock('expo-network', () => {
  let state = { isConnected: true, isInternetReachable: true };
  const listeners = new Set();
  global.__setNetwork = (next) => {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener(state);
  };
  global.__resetNetwork = () => {
    state = { isConnected: true, isInternetReachable: true };
  };
  return {
    getNetworkStateAsync: jest.fn(async () => state),
    addNetworkStateListener: jest.fn((listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    }),
  };
});
