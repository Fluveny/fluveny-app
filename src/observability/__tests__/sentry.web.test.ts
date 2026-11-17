// Sentry tardio no web (1.22): o SDK só entra pelo `import()` do `loadSentry`, que o
// `initSentry` agenda fora do React, e o que chega antes espera numa fila. Cada teste
// carrega o módulo do zero (`isolateModules`) e troca o `import()` (o jest não o
// roda) por um que conta as cargas. O ambiente do jest não tem `addEventListener`
// na janela: o teste põe um `EventTarget` no lugar.

const DSN = 'https://chave@o0.ingest.sentry.io/0';

type WebSentry = typeof import('../sentry.web');
type Win = { addEventListener?: unknown; removeEventListener?: unknown; requestIdleCallback?: unknown };

const win = window as unknown as Win;
let target: EventTarget;
let sdkLoads = 0;
let sdk: { init: jest.Mock; captureException: jest.Mock; wrap: jest.Mock };

function freshModule(options: { sdkFails?: boolean; initFails?: boolean } = {}): WebSentry {
  sdkLoads = 0;
  sdk = {
    init: jest.fn(() => {
      if (options.initFails) throw new Error('init quebrou');
    }),
    captureException: jest.fn(),
    wrap: jest.fn((c) => c),
  };
  let mod!: WebSentry;
  jest.isolateModules(() => {
    mod = jest.requireActual('../sentry.web');
  });
  mod.sdkImport.load = async () => {
    sdkLoads += 1;
    if (options.sdkFails) throw new Error('rede caiu');
    return sdk as unknown as Awaited<ReturnType<WebSentry['sdkImport']['load']>>;
  };
  return mod;
}

/** Um erro não tratado na janela, como o navegador dispara. */
function windowError(error: unknown) {
  target.dispatchEvent(Object.assign(new Event('error'), { error, message: String(error) }));
}

function windowRejection(reason: unknown) {
  target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason }));
}

function expectListenersRemoved() {
  const removed = (win.removeEventListener as jest.Mock).mock.calls.map(([type]) => type);
  expect(removed).toEqual(expect.arrayContaining(['error', 'unhandledrejection']));
}

/** Roda o carregamento agendado e espera o `import()`. */
async function runScheduled(sentry: WebSentry) {
  jest.runOnlyPendingTimers();
  await sentry.loadSentry();
}

beforeEach(() => {
  jest.useFakeTimers();
  target = new EventTarget();
  win.addEventListener = target.addEventListener.bind(target);
  win.removeEventListener = jest.fn(target.removeEventListener.bind(target));
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  delete win.addEventListener;
  delete win.removeEventListener;
  delete win.requestIdleCallback;
});

describe('Sentry no web', () => {
  it('importar o módulo não carrega o SDK', () => {
    freshModule();
    expect(sdkLoads).toBe(0);
  });

  it('sem DSN: initSentry devolve false, nada é agendado e nenhum import()', async () => {
    const sentry = freshModule();
    expect(sentry.initSentry(undefined)).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    sentry.captureError(new Error('x'));
    await sentry.loadSentry();
    expect(sdkLoads).toBe(0);
    expect(sentry.isSentryEnabled()).toBe(false);
  });

  it('com DSN: initSentry agenda o carregamento fora do React (setTimeout 0)', async () => {
    const sentry = freshModule();
    expect(sentry.initSentry(DSN)).toBe(true);
    expect(sdkLoads).toBe(0);
    expect(jest.getTimerCount()).toBe(1);
    jest.runOnlyPendingTimers();
    expect(sdkLoads).toBe(1);
    await sentry.loadSentry();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it('com requestIdleCallback, agenda por ele', () => {
    const idle = jest.fn();
    win.requestIdleCallback = idle;
    const sentry = freshModule();
    sentry.initSentry(DSN);
    expect(idle).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    idle.mock.calls[0][0]();
    expect(sdkLoads).toBe(1);
  });

  it('o SDK liga com as opções sem PII', async () => {
    const sentry = freshModule();
    sentry.initSentry(DSN);
    await runScheduled(sentry);
    const options = sdk.init.mock.calls[0][0];
    expect(options.dsn).toBe(DSN);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.beforeSend({ user: { id: '1' }, request: { data: 'x' } }, {})).toEqual({ request: {} });
    expect(options.beforeBreadcrumb({ message: 'm', data: { url: '/a?b=1' } })).toEqual({ data: { url: '/a' } });
  });

  it('erro antes do SDK vai para a fila e é enviado depois do import(); depois, direto', async () => {
    const sentry = freshModule();
    sentry.initSentry(DSN);
    const early = new Error('primeiro render');
    sentry.captureError(early);
    expect(sdk.captureException).not.toHaveBeenCalled();
    await runScheduled(sentry);
    expect(sdk.captureException.mock.calls).toEqual([[early]]);
    const late = new Error('depois');
    sentry.captureError(late);
    expect(sdk.captureException).toHaveBeenLastCalledWith(late);
  });

  it('erros não tratados da janela antes do SDK entram na fila; depois, os listeners saem', async () => {
    const sentry = freshModule();
    sentry.initSentry(DSN);
    const thrown = new Error('render quebrou');
    const rejected = new Error('promessa rejeitada');
    windowError(thrown);
    windowRejection(rejected);
    await runScheduled(sentry);
    expect(sdk.captureException.mock.calls).toEqual([[thrown], [rejected]]);
    // Com o SDK ligado, os handlers globais dele assumem: os nossos saem.
    expectListenersRemoved();
    windowError(new Error('depois'));
    windowRejection(new Error('depois'));
    expect(sdk.captureException).toHaveBeenCalledTimes(2);
  });

  it(`a fila guarda só os primeiros ${20}`, async () => {
    const sentry = freshModule();
    sentry.initSentry(DSN);
    for (let i = 0; i < 25; i += 1) sentry.captureError(new Error(`e${i}`));
    await runScheduled(sentry);
    expect(sentry.QUEUE_LIMIT).toBe(20);
    expect(sdk.captureException).toHaveBeenCalledTimes(20);
    expect(sdk.captureException.mock.calls[19][0].message).toBe('e19');
  });

  it('carregar mais de uma vez carrega e envia uma vez só', async () => {
    const sentry = freshModule();
    sentry.initSentry(DSN);
    sentry.initSentry(DSN);
    sentry.captureError(new Error('x'));
    expect(jest.getTimerCount()).toBe(1);
    await Promise.all([sentry.loadSentry(), sentry.loadSentry()]);
    await runScheduled(sentry);
    expect(sdkLoads).toBe(1);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
  });

  it('falha do import(): descarta a fila e tira os listeners, sem quebrar o App', async () => {
    const sentry = freshModule({ sdkFails: true });
    sentry.initSentry(DSN);
    sentry.captureError(new Error('x'));
    await expect(runScheduled(sentry)).resolves.toBeUndefined();
    expect(sentry.isSentryEnabled()).toBe(false);
    expect(() => sentry.captureError(new Error('y'))).not.toThrow();
    expectListenersRemoved();
    expect(() => windowError(new Error('z'))).not.toThrow();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('falha do init do SDK: sem rejeição, Sentry desligado, fila e listeners fora', async () => {
    const sentry = freshModule({ initFails: true });
    sentry.initSentry(DSN);
    sentry.captureError(new Error('x'));
    await expect(runScheduled(sentry)).resolves.toBeUndefined();
    expect(sentry.isSentryEnabled()).toBe(false);
    expectListenersRemoved();
    windowError(new Error('depois'));
    sentry.captureError(new Error('depois'));
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('wrapRoot não usa o Sentry.wrap', () => {
    const sentry = freshModule();
    sentry.initSentry(DSN);
    const Root = () => null;
    expect(sentry.wrapRoot(Root)).toBe(Root);
    expect(sdkLoads).toBe(0);
  });
});
