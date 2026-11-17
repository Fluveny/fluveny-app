// Sentry no web (AD-11, Logs e erros; 1.22): a mesma API do `sentry.ts`, mas o
// SDK sai da primeira tela (NFR11, 500 KB). O `initSentry` guarda o DSN e agenda o
// `loadSentry` fora do React (`requestIdleCallback`, ou `setTimeout` 0), que carrega
// o SDK por `import()` (um chunk à parte) e envia os erros que chegaram antes:
// os do `captureError` e os não tratados da janela (`error`, `unhandledrejection`),
// numa fila de até {@link QUEUE_LIMIT}. Com o SDK ligado, os handlers globais dele
// assumem. Sem DSN, nada é carregado. Se o `import()` ou o `init` falhar, a fila é
// descartada e o App segue sem Sentry. A remoção de PII é a mesma (`scrub.ts`).
import type { ComponentType } from 'react';

import { sentryDsn, sentryOptions } from './scrub';

export { scrubBreadcrumb, scrubEvent, sentryDsn, stripQuery } from './scrub';

/** Quantos erros esperam o SDK; os seguintes são descartados. */
export const QUEUE_LIMIT = 20;

type Sdk = typeof import('@sentry/react-native');

/**
 * O `import()` do SDK, num objeto para o teste trocar: o jest não roda `import()`
 * sem `--experimental-vm-modules`. No App, nunca muda.
 */
export const sdkImport = { load: (): Promise<Sdk> => import('@sentry/react-native') };

let dsn: string | undefined;
let sdk: Sdk | undefined;
let loading: Promise<void> | undefined;
let queue: unknown[] = [];

function enqueue(error: unknown): void {
  if (queue.length < QUEUE_LIMIT) queue.push(error);
}

const onError = (event: ErrorEvent) => enqueue(event.error ?? event.message);
const onRejection = (event: PromiseRejectionEvent) => enqueue(event.reason);

function listen(): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
}

function unlisten(): void {
  if (typeof window === 'undefined' || typeof window.removeEventListener !== 'function') return;
  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onRejection);
}

/** Desliga o Sentry: sem DSN, sem fila e sem os listeners da janela. */
function giveUp(): void {
  dsn = undefined;
  queue = [];
  unlisten();
}

/** Roda `task` depois do que está na fila do navegador (o primeiro render), fora do React. */
function schedule(task: () => void): void {
  const idle = typeof window !== 'undefined' ? window.requestIdleCallback : undefined;
  if (typeof idle === 'function') idle.call(window, task, { timeout: 2000 });
  else setTimeout(task, 0);
}

/** Guarda o DSN, escuta os erros da janela e agenda o {@link loadSentry}. Devolve se ligou. */
export function initSentry(value = sentryDsn()): boolean {
  if (!value) return false;
  const first = dsn === undefined && loading === undefined;
  dsn = value;
  if (first) {
    listen();
    schedule(() => void loadSentry());
  }
  return true;
}

/** Carrega o SDK (uma vez), liga e envia a fila. Sem DSN, não faz nada; nunca rejeita. */
export function loadSentry(): Promise<void> {
  if (!dsn) return Promise.resolve();
  const options = sentryOptions(dsn);
  loading ??= sdkImport.load().then(
    (loaded) => {
      try {
        loaded.init(options);
      } catch {
        giveUp();
        return;
      }
      sdk = loaded;
      unlisten();
      const pending = queue;
      queue = [];
      for (const error of pending) loaded.captureException(error);
    },
    () => giveUp(),
  );
  return loading;
}

export function isSentryEnabled(): boolean {
  return dsn !== undefined;
}

export function captureError(error: unknown): void {
  if (!dsn) return;
  if (sdk) sdk.captureException(error);
  else enqueue(error);
}

/** Sem `Sentry.wrap` no web: ele puxaria o SDK para a primeira tela. */
export function wrapRoot<P extends Record<string, unknown>>(component: ComponentType<P>): ComponentType<P> {
  return component;
}
