import { installMswPolyfills } from '../mswPolyfills';

/** Um `globalThis` de mentira, como o do Hermes: sem os globais que o MSW pede. */
function hermesLike() {
  class Headers {
    private readonly values = new Map<string, string>();
    constructor(init: Record<string, string> = {}) {
      for (const [key, value] of Object.entries(init)) this.values.set(key.toLowerCase(), value);
    }
    get(name: string): string | null {
      return this.values.get(name.toLowerCase()) ?? null;
    }
  }
  return { Headers } as Record<string, unknown>;
}

describe('polyfills do mock no Hermes', () => {
  it('MessageEvent estende Event, guarda data e aceita ser estendido como no rettime', () => {
    const target = hermesLike();
    installMswPolyfills(target);
    const MessageEvent = target.MessageEvent as new (
      type: string,
      init?: object,
    ) => {
      type: string;
      data: unknown;
      defaultPrevented: boolean;
      preventDefault(): void;
      stopImmediatePropagation(): void;
    };
    class TypedEvent extends MessageEvent {}
    const event = new TypedEvent('request', { data: 42, cancelable: true });
    expect(event).toBeInstanceOf(target.Event as never);
    expect(event.type).toBe('request');
    expect(event.data).toBe(42);
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);
    expect(() => event.stopImmediatePropagation()).not.toThrow();
  });

  it('BroadcastChannel existe e não faz nada', () => {
    const target = hermesLike();
    installMswPolyfills(target);
    const channel = new (
      target.BroadcastChannel as new (name: string) => {
        name: string;
        postMessage(message: unknown): void;
        close(): void;
      }
    )('msw:websocket-client-manager');
    expect(channel.name).toBe('msw:websocket-client-manager');
    expect(() => channel.postMessage({})).not.toThrow();
    expect(() => channel.close()).not.toThrow();
  });

  it('Headers ganha getSetCookie, com o set-cookie ou vazio', () => {
    const target = hermesLike();
    installMswPolyfills(target);
    const Headers = target.Headers as new (init?: Record<string, string>) => { getSetCookie(): string[] };
    expect(new Headers().getSetCookie()).toEqual([]);
    expect(new Headers({ 'Set-Cookie': 'a=1' }).getSetCookie()).toEqual(['a=1']);
  });

  it('não troca o que já existe (web e Node)', () => {
    const own = { Event: class {}, MessageEvent: class {}, BroadcastChannel: class {} };
    const target: Record<string, unknown> = { ...own };
    installMswPolyfills(target);
    expect(target.Event).toBe(own.Event);
    expect(target.MessageEvent).toBe(own.MessageEvent);
    expect(target.BroadcastChannel).toBe(own.BroadcastChannel);
  });
});
