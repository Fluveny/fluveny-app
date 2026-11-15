// Mock da API no web: service worker do MSW (public/mockServiceWorker.js, que
// o `expo start --web` serve na raiz). Requisição sem handler segue para a rede.
import { setupWorker } from 'msw/browser';

import { handlers } from './handlers';

export async function start(): Promise<void> {
  await setupWorker(...handlers).start({ onUnhandledFrame: 'bypass', quiet: true });
  console.info('[api] mock ligado (EXPO_PUBLIC_API_MOCK=1)');
}
