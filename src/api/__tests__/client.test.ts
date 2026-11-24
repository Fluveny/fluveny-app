import { Platform } from 'react-native';

import { forgetCachedSession, saveSessionToken } from '../../auth/session';
import {
  ApiError,
  APP_VERSION_HEADER,
  CLIENT_HEADER,
  appVersion,
  fillPath,
  get,
  onUnauthenticated,
  patch,
  post,
  postAccepted,
  postNoContent,
  request,
  REQUEST_TIMEOUT_MS,
} from '../client';
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

  it('tem texto para os códigos do cadastro e da sessão (2.1)', () => {
    expect(messageFor('EMAIL_ALREADY_REGISTERED')).toMatch(/entrar ou recuperar a senha/);
    expect(messageFor('AGE_BELOW_MINIMUM')).toBe('O Fluveny é para quem tem 12 anos ou mais.');
    expect(messageFor('GUARDIAN_CONSENT_REQUIRED')).toMatch(/e-mail do seu responsável/);
    expect(ERROR_MESSAGES.CLIENT_HEADER_REQUIRED).toBe(GENERIC_MESSAGE);
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

describe('post', () => {
  const attempt = {
    attemptId: '6f1c2a4e-1b2c-4d3e-8f90-123456789abc',
    versionId: `sha256:${'0'.repeat(64)}`,
    activityKey: 'greeting-choice',
    type: 'choice',
    answer: { type: 'choice' as const, items: [{ itemKey: 'i1', optionKey: 'o1' }] },
    studyTimeMs: 1200,
  };

  it('manda o corpo em JSON com X-App-Version e devolve o data do envelope', async () => {
    const result = { outcome: 'GRADED', resultPct: 100, items: [{ itemKey: 'i1', correct: true }], xpAwarded: 10 };
    global.fetch = respond(200, JSON.stringify({ data: result }));
    await expect(post('/api/v1/visitor/attempts', attempt)).resolves.toEqual(result);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.exemplo.test/api/v1/visitor/attempts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(attempt);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get(APP_VERSION_HEADER)).toBe(appJson.expo.version);
  });

  it('erro do problem+json: ApiError com o code, como no get', async () => {
    global.fetch = respond(400, problem('INVALID_ANSWER'), 'application/problem+json');
    const error = await caught(post('/api/v1/visitor/attempts/reveal', attempt));
    expect(error.status).toBe(400);
    expect(error.code).toBe('INVALID_ANSWER');
    expect(error.userMessage).toBe(GENERIC_MESSAGE);
  });

  it('sem rede: NETWORK_ERROR', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    expect((await caught(post('/api/v1/visitor/attempts', attempt))).code).toBe(NETWORK_ERROR);
  });
});

describe('postAccepted() (1.20)', () => {
  const event = { type: 'VISITOR_SESSION_STARTED' as const, deviceId: '0b6a3f0e-4c1d-4e2a-9b3c-5d6e7f809a1b' };

  it('202 sem corpo: resolve sem valor, com o corpo em JSON e X-App-Version', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await expect(postAccepted('/api/v1/visitor/events', event)).resolves.toBeUndefined();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.exemplo.test/api/v1/visitor/events');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(event);
    expect(new Headers(init.headers).get(APP_VERSION_HEADER)).toBe(appJson.expo.version);
  });

  it('rota sem corpo de requisição (2.2): POST sem corpo e sem Content-Type', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await expect(postAccepted('/api/v1/students/me/email-confirmation')).resolves.toBeUndefined();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.exemplo.test/api/v1/students/me/email-confirmation');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('erro do problem+json: ApiError com o code; sem rede, NETWORK_ERROR', async () => {
    global.fetch = respond(500, problem('INTERNAL_ERROR'), 'application/problem+json');
    expect((await caught(postAccepted('/api/v1/visitor/events', event))).code).toBe('INTERNAL_ERROR');
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    expect((await caught(postAccepted('/api/v1/visitor/events', event))).code).toBe(NETWORK_ERROR);
  });
});

describe('postNoContent() e o 401 num ponto só (2.3)', () => {
  it('204 sem corpo: POST sem corpo e sem Content-Type, resolve sem valor', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(postNoContent('/api/v1/auth/logout')).resolves.toBeUndefined();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.exemplo.test/api/v1/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('204 de rota com corpo (2.8): POST com o corpo em JSON e Content-Type; 410 vira ApiError', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const body = { token: 't', password: 'segredo123' };
    await expect(postNoContent('/api/v1/auth/password-reset', body)).resolves.toBeUndefined();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.exemplo.test/api/v1/auth/password-reset');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    global.fetch = respond(410, problem('PASSWORD_RESET_LINK_INVALID'), 'application/problem+json');
    const error = await caught(postNoContent('/api/v1/auth/password-reset', body));
    expect([error.status, error.code]).toEqual([410, 'PASSWORD_RESET_LINK_INVALID']);
  });

  it('401 de sessão avisa quem se inscreveu; INVALID_CREDENTIALS, o entrar, o sair e outros status, não', async () => {
    const listener = jest.fn();
    const stop = onUnauthenticated(listener);
    const unauthorized = (code: string) => respond(401, problem(code), 'application/problem+json');
    global.fetch = unauthorized('UNAUTHENTICATED');
    expect((await caught(get('/api/v1/students/me'))).code).toBe('UNAUTHENTICATED');
    expect(listener).toHaveBeenCalledTimes(1);
    global.fetch = unauthorized('INVALID_CREDENTIALS');
    expect((await caught(post('/api/v1/auth/login', { email: 'a@b.c', password: 'x' }))).status).toBe(401);
    global.fetch = unauthorized('UNAUTHENTICATED');
    await caught(post('/api/v1/auth/login', { email: 'a@b.c', password: 'x' }));
    await caught(postNoContent('/api/v1/auth/logout'));
    global.fetch = respond(403, problem('ACCESS_DENIED'), 'application/problem+json');
    await caught(get('/api/v1/students/me'));
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    global.fetch = unauthorized('UNAUTHENTICATED');
    await caught(get('/api/v1/students/me'));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('sessão e X-Fluveny-Client (2.1)', () => {
  const PROFILE = {
    email: 'ana@exemplo.test',
    name: 'Ana',
    pronounSet: null,
    emailConfirmed: false,
    emailConfirmationOverdue: false,
  };
  const TOKEN = 'a'.repeat(43);
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
    global.__resetSecureStore();
    forgetCachedSession();
  });

  const sent = () => {
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    return { init, headers: new Headers(init.headers) };
  };

  it('web: toda requisição leva X-Fluveny-Client: web e credentials include, sem Authorization nem token salvo', async () => {
    Platform.OS = 'web';
    const setItem = jest.fn();
    Object.defineProperty(globalThis, 'localStorage', { value: { setItem, getItem: jest.fn() }, configurable: true });
    global.fetch = respond(200, JSON.stringify({ data: PROFILE }));
    await get('/api/v1/students/me');
    const { init, headers } = sent();
    expect(headers.get(CLIENT_HEADER)).toBe('web');
    expect(init.credentials).toBe('include');
    expect(headers.has('Authorization')).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('web: mesmo com um token no armazenamento seguro (que o web não usa), não manda Bearer', async () => {
    global.__secureStore.set('fluveny.session', TOKEN);
    Platform.OS = 'web';
    global.fetch = respond(202, '');
    await postAccepted('/api/v1/visitor/events', { type: 'VISITOR_SESSION_STARTED', deviceId: 'd' });
    expect(sent().headers.get(CLIENT_HEADER)).toBe('web');
    expect(sent().headers.has('Authorization')).toBe(false);
  });

  it('Android: X-Fluveny-Client: android; sem token, sem Authorization; com token, Bearer', async () => {
    Platform.OS = 'android';
    global.fetch = respond(200, JSON.stringify({ data: { minAppVersion: '0.0.0', activityTypes: [] } }));
    await get('/api/v1/meta');
    expect(sent().headers.get(CLIENT_HEADER)).toBe('android');
    expect(sent().headers.has('Authorization')).toBe(false);
    expect(sent().init.credentials).toBeUndefined();

    await saveSessionToken(TOKEN);
    global.fetch = respond(200, JSON.stringify({ data: PROFILE }));
    await get('/api/v1/students/me');
    expect(sent().headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('post() aceita 201 (cadastro) e devolve o data', async () => {
    const body = {
      email: 'ana@exemplo.test',
      password: 'segredo123',
      birthDate: '1990-05-20',
      acceptedTermsVersion: '0.2',
      acceptedPrivacyVersion: '0.3',
    };
    global.fetch = respond(201, JSON.stringify({ data: { student: PROFILE } }));
    await expect(post('/api/v1/auth/signup', body)).resolves.toEqual({ student: PROFILE });
  });

  it('patch() manda PATCH com JSON e devolve o data; erro vira ApiError', async () => {
    global.fetch = respond(200, JSON.stringify({ data: { ...PROFILE, pronounSet: 'SHE' } }));
    await expect(patch('/api/v1/students/me', { pronounSet: 'SHE' })).resolves.toMatchObject({ pronounSet: 'SHE' });
    const { init, headers } = sent();
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ pronounSet: 'SHE' });
    expect(headers.get('Content-Type')).toBe('application/json');
    global.fetch = respond(401, problem('UNAUTHENTICATED'), 'application/problem+json');
    expect((await caught(patch('/api/v1/students/me', { pronounSet: null }))).status).toBe(401);
  });
});
