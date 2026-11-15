// Liga o mock da API (MSW) com EXPO_PUBLIC_API_MOCK=1, para abrir o App sem a
// API. O app/_layout.tsx chama `startApiMocks()` no topo do módulo e só monta o
// App quando a promessa resolve, então nenhuma requisição sai antes do mock.
export const API_MOCK = process.env.EXPO_PUBLIC_API_MOCK === '1';

export function startApiMocks(): Promise<void> {
  // A comparação fica aqui, literal: no build, o Expo troca a variável pelo
  // valor e o Metro corta o ramo morto, então sem o mock o MSW nem entra no bundle.
  if (process.env.EXPO_PUBLIC_API_MOCK === '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { start } = require('./start') as typeof import('./start');
    return start();
  }
  return Promise.resolve();
}
