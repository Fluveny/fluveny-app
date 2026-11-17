// Sentry no App nativo (AD-11, Logs e erros): só liga com
// `EXPO_PUBLIC_SENTRY_DSN`, sem PII. O `beforeSend` remove usuário, IP, cookies,
// `extra`, corpo e todo cabeçalho fora da lista branca (`scrub.ts`).
// No web, o Metro usa o `sentry.web.ts`, com a mesma API e o SDK carregado depois
// do primeiro render (1.22).
import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

import { sentryDsn, sentryOptions } from './scrub';

export { scrubBreadcrumb, scrubEvent, sentryDsn, stripQuery } from './scrub';

let enabled = false;

/** Liga o Sentry só com DSN. Devolve se ligou. */
export function initSentry(dsn = sentryDsn()): boolean {
  if (!dsn) return false;
  Sentry.init(sentryOptions(dsn));
  enabled = true;
  return true;
}

/** No nativo, o SDK já carregou no `initSentry`; nada a esperar. Existe pela API comum com o web. */
export function loadSentry(): Promise<void> {
  return Promise.resolve();
}

export function isSentryEnabled(): boolean {
  return enabled;
}

export function captureError(error: unknown): void {
  if (enabled) Sentry.captureException(error);
}

/** O componente raiz embrulhado pelo `Sentry.wrap` (só no nativo), se o Sentry ligou. */
export function wrapRoot<P extends Record<string, unknown>>(component: ComponentType<P>): ComponentType<P> {
  return enabled ? Sentry.wrap(component) : component;
}
