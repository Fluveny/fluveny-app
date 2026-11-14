// Mock da API no nativo (Android): intercepta o `fetch` global, que é o que o
// `request()` de client.ts usa. Requisição sem handler segue para a rede.
import 'react-native-url-polyfill/auto';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { defineNetwork, InterceptorSource } from 'msw/experimental';

import { handlers } from './handlers';

export async function start(): Promise<void> {
  const network = defineNetwork({
    sources: [new InterceptorSource({ interceptors: [new FetchInterceptor()] })],
    handlers,
    onUnhandledFrame: 'bypass',
  });
  await network.enable();
  console.info('[api] mock ligado (EXPO_PUBLIC_API_MOCK=1)');
}
