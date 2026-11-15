// O que o MSW pede e o Hermes/React Native não têm. Só entra pelo start.ts
// (mock nativo), antes do MSW; no web e no Node tudo já existe e nada é trocado.
// - `MessageEvent` (e `Event`): o `rettime` declara `class extends MessageEvent`
//   ao ser importado ("Property 'MessageEvent' doesn't exist").
// - `BroadcastChannel`: o MSW cria um ao carregar, para WebSocket.
// - `Headers.prototype.getSetCookie`: o `HttpResponse` do MSW chama ao montar a
//   resposta, e o `Headers` do React Native (whatwg-fetch) não tem.

type EventInit = { bubbles?: boolean; cancelable?: boolean; composed?: boolean };
type MessageEventInit = EventInit & { data?: unknown; origin?: string; lastEventId?: string };

class EventShim {
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly composed: boolean;
  readonly timeStamp = Date.now();
  defaultPrevented = false;
  target: unknown = null;
  currentTarget: unknown = null;

  constructor(type: string, init: EventInit = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
    this.composed = init.composed ?? false;
  }

  preventDefault(): void {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation(): void {}

  stopImmediatePropagation(): void {}
}

class MessageEventShim extends EventShim {
  readonly data: unknown;
  readonly origin: string;
  readonly lastEventId: string;

  constructor(type: string, init: MessageEventInit = {}) {
    super(type, init);
    this.data = init.data;
    this.origin = init.origin ?? '';
    this.lastEventId = init.lastEventId ?? '';
  }
}

/**
 * `BroadcastChannel` inerte: o MSW cria um ao carregar (`msw:websocket-client-manager`)
 * para coordenar WebSocket entre abas. O mock nativo só intercepta `fetch`, então
 * mensagens não vão a lugar nenhum.
 */
class BroadcastChannelShim {
  readonly name: string;
  onmessage: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;

  constructor(name: string) {
    this.name = name;
  }

  postMessage(): void {}

  addEventListener(): void {}

  removeEventListener(): void {}

  close(): void {}
}

/** Define os globais e o método que faltam, só quando faltam. */
export function installMswPolyfills(target: Record<string, unknown> = globalThis as Record<string, unknown>): void {
  const headers = target.Headers as { prototype: Record<string, unknown> } | undefined;
  if (headers && typeof headers.prototype.getSetCookie !== 'function') {
    headers.prototype.getSetCookie = function getSetCookie(this: { get(name: string): string | null }): string[] {
      const value = this.get('set-cookie');
      return value ? [value] : [];
    };
  }
  if (typeof target.BroadcastChannel !== 'function') target.BroadcastChannel = BroadcastChannelShim;
  if (typeof target.Event !== 'function') target.Event = EventShim;
  if (typeof target.MessageEvent !== 'function') {
    // Herda do `Event` que existir (nativo ou o shim), como no navegador.
    const Base = target.Event as typeof EventShim;
    target.MessageEvent =
      Base === EventShim
        ? MessageEventShim
        : class extends Base {
            readonly data: unknown;
            readonly origin: string;
            readonly lastEventId: string;
            constructor(type: string, init: MessageEventInit = {}) {
              super(type, init);
              this.data = init.data;
              this.origin = init.origin ?? '';
              this.lastEventId = init.lastEventId ?? '';
            }
          };
  }
}

installMswPolyfills();
