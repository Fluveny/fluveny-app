import { ApiError, APP_VERSION_HEADER, appVersion, fillPath, get, request, REQUEST_TIMEOUT_MS } from '../client';
import { ERROR_MESSAGES, GENERIC_MESSAGE, messageFor, NETWORK_ERROR, UNKNOWN_ERROR } from '../errors';

const appJson = require('../../../app.json');

function respond(status: number, body: string, contentType = 'application/json') {
  return jest.fn().mockResolvedValue(new Response(body, { status, headers: { 'Content-Type': contentType } }));
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('a requisição não falhou');
}

const problem = (code: string, detail = 'Detalhe interno que não pode aparecer') =>
  JSON.stringify({ type: `urn:fluveny:problem:${code}`, title: 'Título', status: 404, detail, code });

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test/';
});

afterAll(() => {
  process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
});

describe('cliente da API', () => {
  it('a versão do App é a do app.json', () => {
    expect(appVersion()).toBe(appJson.expo.version);
  });

  it('envia X-App-Version na base de EXPO_PUBLIC_API_URL e devolve o data do envelope', async () => {
    global.fetch = respond(200, JSON.stringify({ data: { minAppVersion: '1.0.0', activityTypes: [] } }));
    const data = await get('/api/v1/meta');
    expect(data).toEqual({ minAppVersion: '1.0.0', activityTypes: [] });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.exemplo.test/api/v1/meta');
    expect(new Headers(init.headers).get(APP_VERSION_HEADER)).toBe(appJson.expo.version);
  });

  it('code conhecido: ApiError com status e code, e texto do catálogo pt-BR', async () => {
    global.fetch = respond(404, problem('NOT_FOUND'), 'application/problem+json');
    const error = await caught(request('/api/v1/qualquer'));
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.userMessage).toBe(ERROR_MESSAGES.NOT_FOUND);
    expect(error.userMessage).not.toContain('Detalhe interno');
    expect(error.message).not.toContain('Detalhe interno');
  });

  it('code desconhecido: texto genérico, sem o detail', async () => {
    global.fetch = respond(409, problem('STAGE_FROM_THE_FUTURE'), 'application/problem+json');
    const error = await caught(request('/api/v1/qualquer'));
    expect(error.code).toBe('STAGE_FROM_THE_FUTURE');
    expect(error.userMessage).toBe(GENERIC_MESSAGE);
  });

  it('corpo cru (não problem+json): texto genérico, sem a mensagem crua', async () => {
    global.fetch = respond(502, '<html>Bad Gateway: upstream 10.0.0.3 caiu</html>', 'text/html');
    const error = await caught(request('/api/v1/qualquer'));
    expect(error.status).toBe(502);
    expect(error.code).toBe(UNKNOWN_ERROR);
    expect(error.userMessage).toBe(GENERIC_MESSAGE);
    expect(error.message).not.toContain('upstream');
  });

  it('sem rede: NETWORK_ERROR, com o texto de sem conexão', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const error = await caught(request('/api/v1/meta'));
    expect(error.status).toBe(0);
    expect(error.code).toBe(NETWORK_ERROR);
    expect(error.userMessage).toBe(ERROR_MESSAGES[NETWORK_ERROR]);
  });

  it('sucesso sem envelope {data}: erro, não um valor indefinido', async () => {
    global.fetch = respond(200, JSON.stringify({ minAppVersion: '1.0.0' }));
    const error = await caught(request('/api/v1/meta'));
    expect(error.code).toBe(UNKNOWN_ERROR);
  });
});

describe('catálogo de erros', () => {
  it('tem texto para todos os códigos da platform', () => {
    const platform = [
      'BAD_REQUEST',
      'VALIDATION_FAILED',
      'INVALID_ID',
      'UNAUTHENTICATED',
      'ACCESS_DENIED',
      'NOT_FOUND',
      'CONFLICT',
      'PAYLOAD_TOO_LARGE',
      'UNPROCESSABLE',
      'TOO_MANY_REQUESTS',
      'METHOD_NOT_ALLOWED',
      'NOT_ACCEPTABLE',
      'UNSUPPORTED_MEDIA_TYPE',
      'INTERNAL_ERROR',
    ];
    for (const code of platform) expect(ERROR_MESSAGES[code]).toEqual(expect.any(String));
  });

  it('nunca culpa o aluno nem usa "errado" ou "inválido"', () => {
    for (const text of [...Object.values(ERROR_MESSAGES), GENERIC_MESSAGE]) {
      expect(text).not.toMatch(/errad|inválid|culpa|você err/i);
    }
  });

  it('código ausente ou desconhecido usa o genérico', () => {
    expect(messageFor(undefined)).toBe(GENERIC_MESSAGE);
    expect(messageFor('')).toBe(GENERIC_MESSAGE);
    expect(messageFor('toString')).toBe(GENERIC_MESSAGE);
  });
});

describe('cliente da API: Loop 1', () => {
  afterEach(() => jest.useRealTimers());

  it('o Accept de quem chama é mantido', async () => {
    global.fetch = respond(200, JSON.stringify({ data: 1 }));
    await request('/api/v1/x', { headers: { Accept: 'text/plain' } });
    expect(new Headers((global.fetch as jest.Mock).mock.calls[0][1].headers).get('Accept')).toBe('text/plain');
  });

  it('sem Accept de quem chama, pede JSON e problem+json', async () => {
    global.fetch = respond(200, JSON.stringify({ data: 1 }));
    await request('/api/v1/x');
    expect(new Headers((global.fetch as jest.Mock).mock.calls[0][1].headers).get('Accept')).toContain(
      'application/json',
    );
  });

  it('timeout de 10 s: aborta e vira NETWORK_ERROR', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    ) as jest.Mock;
    const pending = caught(request('/api/v1/meta'));
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
    const error = await pending;
    expect(error.code).toBe(NETWORK_ERROR);
  });

  it('cancelamento de quem chamou: repassa o AbortError, sem virar NETWORK_ERROR', async () => {
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    ) as jest.Mock;
    const controller = new AbortController();
    const pending = request('/api/v1/meta', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });

  it('EXPO_PUBLIC_API_URL ausente: avisa e manda para o Sentry uma vez, fora dos testes', () => {
    const env = process.env.NODE_ENV;
    const url = process.env.EXPO_PUBLIC_API_URL;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      delete process.env.EXPO_PUBLIC_API_URL;
      jest.isolateModules(() => {
        /* eslint-disable @typescript-eslint/no-require-imports -- módulo novo, isolado, para o aviso único */
        const sentry = require('../../observability/sentry');
        const capture = jest.spyOn(sentry, 'captureError').mockImplementation(() => {});
        const client = require('../client');
        /* eslint-enable @typescript-eslint/no-require-imports */
        // NODE_ENV é 'test' aqui: não avisa.
        client.apiBaseUrl();
        expect(warn).not.toHaveBeenCalled();
        (process.env as Record<string, string>).NODE_ENV = 'development';
        client.apiBaseUrl();
        client.apiBaseUrl();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(capture).toHaveBeenCalledTimes(1);
      });
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = env;
      process.env.EXPO_PUBLIC_API_URL = url;
      warn.mockRestore();
    }
  });

  /** Resposta cujo corpo nunca termina (e não reage ao abort, como num mock). */
  const hangingBody = (status = 200) =>
    jest.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: () => new Promise(() => {}),
    });

  it('timeout durante a leitura do corpo: NETWORK_ERROR', async () => {
    jest.useFakeTimers();
    global.fetch = hangingBody();
    const pending = caught(request('/api/v1/meta'));
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect((await pending).code).toBe(NETWORK_ERROR);
  });

  it('timeout durante a leitura de um problem+json: NETWORK_ERROR', async () => {
    jest.useFakeTimers();
    global.fetch = hangingBody(500);
    const pending = caught(request('/api/v1/meta'));
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect((await pending).code).toBe(NETWORK_ERROR);
  });

  it('abort de quem chamou durante a leitura do corpo: repassa o AbortError', async () => {
    global.fetch = hangingBody();
    const controller = new AbortController();
    const pending = request('/api/v1/meta', { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });
});

describe('fillPath', () => {
  it('troca os {param} pelos valores, codificados para URL', () => {
    expect(fillPath('/api/v1/units/{unitKey}/stages/{stageKey}', { unitKey: 'unit-1', stageKey: 'a b/c' })).toBe(
      '/api/v1/units/unit-1/stages/a%20b%2Fc',
    );
  });

  it('parâmetro ausente é erro', () => {
    expect(() => fillPath('/api/v1/units/{unitKey}', {} as { unitKey: string })).toThrow('unitKey');
  });
});
