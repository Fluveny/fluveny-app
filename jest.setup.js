// O @sentry/react-native cria um setInterval no import (AsyncExpiringMap) que
// segura o processo do jest aberto. Nos testes, o SDK é um mock; o sentry.test.ts
// confere o que a nossa camada passa para ele.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  wrap: (component) => component,
}));
