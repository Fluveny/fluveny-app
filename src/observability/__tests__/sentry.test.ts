import * as Sentry from '@sentry/react-native';

import { initSentry, scrubBreadcrumb, scrubEvent } from '../sentry';

jest.mock('@sentry/react-native', () => ({ init: jest.fn(), captureException: jest.fn(), wrap: (c: unknown) => c }));

const init = Sentry.init as jest.Mock;

function eventWithPii(): Sentry.ErrorEvent {
  return {
    type: undefined,
    message: 'falhou',
    user: { id: '42', email: 'aluna@exemplo.com', ip_address: '200.1.2.3', username: 'aluna' },
    request: {
      url: 'https://api.exemplo.test/api/v1/meta',
      method: 'POST',
      query_string: 'token=abc',
      cookies: { session: 'abc' },
      data: { password: 'segredo', email: 'aluna@exemplo.com' },
      headers: {
        Authorization: 'Bearer abc',
        Cookie: 'session=abc',
        'X-Fluveny-Client': 'painel',
        'X-App-Version': '0.1.0',
      },
      env: { REMOTE_ADDR: '200.1.2.3' },
    },
  } as Sentry.ErrorEvent;
}

describe('scrubber do Sentry', () => {
  it('remove usuário, IP, cookies, cabeçalhos de autenticação e corpo', () => {
    const event = scrubEvent(eventWithPii());
    expect(event.user).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.query_string).toBeUndefined();
    expect(event.request?.env).toEqual({});
    expect(event.request?.headers).toEqual({ 'X-App-Version': '0.1.0' });
    expect(JSON.stringify(event)).not.toMatch(/aluna|200\.1\.2\.3|segredo|Bearer|session/);
  });

  it('mantém o resto do evento', () => {
    const event = scrubEvent(eventWithPii());
    expect(event.message).toBe('falhou');
    expect(event.request?.url).toBe('https://api.exemplo.test/api/v1/meta');
  });
});

describe('initSentry', () => {
  beforeEach(() => init.mockClear());

  it('sem EXPO_PUBLIC_SENTRY_DSN, não liga', () => {
    expect(initSentry(undefined)).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it('com DSN, liga sem PII e com o scrubber no beforeSend', () => {
    expect(initSentry('https://chave@o0.ingest.sentry.io/0')).toBe(true);
    const options = init.mock.calls[0][0];
    expect(options.sendDefaultPii).toBe(false);
    const sent = options.beforeSend(eventWithPii(), {});
    expect(sent.user).toBeUndefined();
    expect(sent.request.data).toBeUndefined();
  });
});

describe('Loop 1: query, cabeçalhos de IP, breadcrumbs e environment', () => {
  it('tira a query de request.url e os cabeçalhos de IP', () => {
    const event = eventWithPii();
    event.request!.url = 'https://api.exemplo.test/api/v1/x?email=aluna@exemplo.com#frag';
    event.request!.headers = {
      ...event.request!.headers,
      'X-Forwarded-For': '200.1.2.3',
      'X-Real-IP': '200.1.2.3',
      Forwarded: 'for=200.1.2.3',
    };
    const scrubbed = scrubEvent(event);
    expect(scrubbed.request?.url).toBe('https://api.exemplo.test/api/v1/x');
    expect(scrubbed.request?.headers).toEqual({ 'X-App-Version': '0.1.0' });
  });

  it('beforeBreadcrumb: sem corpo e sem query em nenhuma string do data', () => {
    const crumb = scrubBreadcrumb({
      category: 'fetch',
      data: {
        url: 'https://api.exemplo.test/a?token=abc',
        from: '/login?email=x',
        body: '{"senha":1}',
        status_code: 200,
      },
    });
    expect(crumb.data).toEqual({ url: 'https://api.exemplo.test/a', from: '/login', status_code: 200 });
  });

  it('beforeBreadcrumb: tira a mensagem; texto que não é URL fica igual', () => {
    const crumb = scrubBreadcrumb({
      message: 'console: aluna@exemplo.com entrou',
      data: { note: 'Quanto? Muito', method: 'GET' },
    });
    expect(crumb.message).toBeUndefined();
    expect(crumb.data).toEqual({ note: 'Quanto? Muito', method: 'GET' });
  });

  it('cabeçalhos: só a lista branca passa (desconhecidos saem)', () => {
    const event = eventWithPii();
    event.request!.headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Fluveny/0.1.0',
      'X-App-Version': '0.1.0',
      'X-Custom-Token': 'segredo',
      'CF-Connecting-IP': '200.1.2.3',
    };
    expect(scrubEvent(event).request?.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Fluveny/0.1.0',
      'X-App-Version': '0.1.0',
    });
  });

  it('remove o extra', () => {
    const event = eventWithPii();
    event.extra = { email: 'aluna@exemplo.com' };
    expect(scrubEvent(event).extra).toBeUndefined();
  });

  it('initSentry passa o scrubBreadcrumb e environment vazio vira undefined', () => {
    init.mockClear();
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = '  ';
    try {
      initSentry('https://chave@o0.ingest.sentry.io/0');
      const options = init.mock.calls[0][0];
      expect(options.environment).toBeUndefined();
      expect(options.beforeBreadcrumb({ data: { url: '/x?y=1' } }).data).toEqual({ url: '/x' });
    } finally {
      delete process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
    }
  });
});
