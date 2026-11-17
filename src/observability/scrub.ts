// Remoção de PII e opções do Sentry (AD-11, Logs e erros), comuns ao nativo
// (`sentry.ts`) e ao web (`sentry.web.ts`). Só tipos do SDK: este arquivo não
// carrega o `@sentry/react-native`, para o web poder adiar o SDK (1.22).
import type * as Sentry from '@sentry/react-native';

type Event = Sentry.ErrorEvent;

/** Só estes cabeçalhos seguem para o Sentry (lista branca); o resto sai. */
const ALLOWED_HEADERS = new Set(['accept', 'content-type', 'user-agent', 'x-app-version']);

const URL_LIKE = /^(?:https?:\/\/|\/)/i;

/** Corta a query string e o fragmento de um texto que pareça URL (`http(s)://` ou `/`); o resto fica igual. */
export function stripQuery(value: string): string {
  if (!URL_LIKE.test(value)) return value;
  return value.split(/[?#]/, 1)[0] ?? '';
}

/** Remove PII do evento. Pura, para teste. */
export function scrubEvent<E extends Event>(event: E): E {
  delete event.user;
  delete event.extra;
  if (event.request) {
    const request = { ...event.request };
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (typeof request.url === 'string') request.url = stripQuery(request.url);
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => ALLOWED_HEADERS.has(name.toLowerCase())),
      );
    }
    if (request.env) {
      const env = { ...request.env };
      delete env.REMOTE_ADDR;
      request.env = env;
    }
    event.request = request;
  }
  return event;
}

/** Breadcrumb sem mensagem, sem corpo e sem query string nas URLs do `data`. */
export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  delete breadcrumb.message;
  if (breadcrumb.data) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(breadcrumb.data)) {
      if (key === 'body') continue;
      data[key] = typeof value === 'string' ? stripQuery(value) : value;
    }
    breadcrumb.data = data;
  }
  return breadcrumb;
}

export function sentryDsn(): string | undefined {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  return dsn ? dsn : undefined;
}

/** As opções do `Sentry.init`, iguais no nativo e no web: sem PII e com os scrubbers. */
export function sentryOptions(dsn: string): Sentry.ReactNativeOptions {
  return {
    dsn,
    sendDefaultPii: false,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT?.trim() || undefined,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  };
}
