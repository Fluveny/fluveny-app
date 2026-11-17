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

// expo-speech-recognition (1.15): o reconhecimento simulado. Por padrão há
// reconhecimento, a permissão está concedida e não roda no aparelho. Nada é
// ouvido até o teste dizer: `global.__speech.hear(texto)` guarda o que o
// reconhecedor ouviu (sai como resultado final no `stop()`), e
// `global.__speech.finish(texto)` simula o fim pelo silêncio (resultado final e
// `end`). `global.__speech.set({...})` muda a disponibilidade e a permissão;
// `global.__speech.reset()` volta ao padrão.
jest.mock('expo-speech-recognition', () => {
  const listeners = new Map();
  const initial = () => ({
    available: true,
    onDevice: false,
    permission: { granted: true, canAskAgain: true, status: 'granted', expires: 'never' },
    request: null,
    listening: false,
    heard: null,
    // `abort()` sem eventos na hora: o `end` atrasado vem por `global.__speech.emit('end')`.
    lateAbort: false,
    // `start()` lança (o microfone não abriu).
    startThrows: false,
  });
  let state = initial();
  const emit = (event, payload) => {
    for (const listener of [...(listeners.get(event) ?? [])]) listener(payload);
  };
  const final = (transcript) =>
    emit('result', { isFinal: true, results: [{ transcript, confidence: 1, segments: [] }] });
  const end = () => {
    state.listening = false;
    state.heard = null;
    emit('end', null);
  };
  const module = {
    isRecognitionAvailable: jest.fn(() => state.available),
    supportsOnDeviceRecognition: jest.fn(() => state.onDevice),
    getPermissionsAsync: jest.fn(async () => state.permission),
    requestPermissionsAsync: jest.fn(async () => {
      if (state.request) state.permission = state.request;
      return state.permission;
    }),
    start: jest.fn(() => {
      if (state.startThrows) throw new Error('start falhou');
      state.listening = true;
      emit('start', null);
    }),
    stop: jest.fn(() => {
      if (!state.listening) return;
      if (state.heard) final(state.heard);
      end();
    }),
    abort: jest.fn(() => {
      if (!state.listening) return;
      if (state.lateAbort) {
        state.listening = false;
        return;
      }
      emit('error', { error: 'aborted', message: 'aborted' });
      end();
    }),
    addListener: jest.fn((event, listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
      return { remove: () => listeners.get(event)?.delete(listener) };
    }),
  };
  global.__speech = {
    module,
    set: (next) => {
      state = { ...state, ...next };
    },
    get listening() {
      return state.listening;
    },
    hear: (transcript) => {
      state.heard = transcript;
    },
    finish: (transcript) => {
      if (transcript) final(transcript);
      end();
    },
    error: (error) => {
      emit('error', { error, message: error });
      end();
    },
    /** Um evento solto do reconhecedor (`speechstart`, `soundstart`, um `end` atrasado…). */
    emit,
    reset: () => {
      state = initial();
    },
  };
  return { ExpoSpeechRecognitionModule: module };
});
// Carrega a simulação já agora: o App só a requer ao abrir a Fala, e os testes
// precisam do `global.__speech` antes disso.
require('expo-speech-recognition');
