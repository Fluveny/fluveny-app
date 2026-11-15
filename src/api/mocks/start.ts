// Mock da API no nativo (Android): intercepta o `fetch` global, que é o que o
// `request()` de client.ts usa. Requisição sem handler segue para a rede.
import 'react-native-url-polyfill/auto';
// Antes do MSW: globais que ele pede e o Hermes não tem (MessageEvent, BroadcastChannel…).
import './mswPolyfills';
// O build web do interceptor: patcha o `fetch` global. O padrão (`/fetch`) é o do
// Node, que intercepta no socket do Undici e não existe no React Native.
import { FetchInterceptor } from '@mswjs/interceptors/fetch/web';
import { defineNetwork, InterceptorSource } from 'msw/experimental';
import type { Interceptor } from '@mswjs/interceptors';

import { handlers } from './handlers';

export async function start(): Promise<void> {
  const network = defineNetwork({
    // O d.ts do build web declara a própria cópia da classe Interceptor; em runtime é a mesma.
    sources: [new InterceptorSource({ interceptors: [new FetchInterceptor() as unknown as Interceptor<never>] })],
    handlers,
    onUnhandledFrame: 'bypass',
  });
  await network.enable();
  console.info('[api] mock ligado (EXPO_PUBLIC_API_MOCK=1)');
}
