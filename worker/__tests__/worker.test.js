/**
 * @jest-environment node
 */
// Matriz da spec da 1.6 (parte do App): o Worker de homologação.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as workerModule from '../index';

const PROXY_HEADER = 'X-Fluveny-Proxy';
const CLIENT_IP_HEADER = 'X-Fluveny-Client-IP';
const worker = workerModule.default;

const ORIGIN = 'https://fluveny-homolog.example.workers.dev';
const API_ORIGIN = 'https://api.example.test';
const SECRET = 'segredo-de-teste-gerado-so-aqui';

/** @type {jest.Mock} */
let upstream;

beforeEach(() => {
  upstream = jest.fn(async () => new Response('{"data":[]}', { status: 200 }));
  global.fetch = upstream;
});

function env(overrides = {}) {
  return {
    API_ORIGIN,
    PROXY_SECRET: SECRET,
    ASSETS: { fetch: jest.fn(async () => new Response('asset', { status: 200 })) },
    ...overrides,
  };
}

function sent() {
  expect(upstream).toHaveBeenCalledTimes(1);
  const [target, init] = upstream.mock.calls[0];
  return { target: String(target), init, headers: new Headers(init.headers) };
}

describe('Worker de homologação', () => {
  it('fora de /api/ entrega os assets, sem chamar a API', async () => {
    const e = env();
    for (const path of ['/', '/unit/x', '/_expo/static/js/web/entry.js', '/apix']) {
      const response = await worker.fetch(new Request(ORIGIN + path), e);
      expect(await response.text()).toBe('asset');
    }
    expect(e.ASSETS.fetch).toHaveBeenCalledTimes(4);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('GET /api/v1/units vai à API com o segredo e o IP do aluno', async () => {
    const request = new Request(`${ORIGIN}/api/v1/units?stage=1&x=a%20b`, {
      headers: {
        Host: 'fluveny-homolog.example.workers.dev',
        'CF-Connecting-IP': '203.0.113.7',
        'CF-Ray': 'abc123',
        'X-App-Version': '0.1.0',
      },
    });
    const response = await worker.fetch(request, env());

    expect(response.status).toBe(200);
    const { target, init, headers } = sent();
    expect(target).toBe(`${API_ORIGIN}/api/v1/units?stage=1&x=a%20b`);
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
    expect(init.body).toBeUndefined();
    expect(headers.get(PROXY_HEADER)).toBe(SECRET);
    expect(headers.get(CLIENT_IP_HEADER)).toBe('203.0.113.7');
    expect(headers.get('X-App-Version')).toBe('0.1.0');
    expect(headers.has('Host')).toBe(false);
    expect(headers.has('CF-Connecting-IP')).toBe(false);
    expect(headers.has('CF-Ray')).toBe(false);
  });

  it('não repassa cabeçalhos de borda e de encaminhamento; mantém os do App', async () => {
    const request = new Request(`${ORIGIN}/api/v1/units`, {
      headers: {
        'CF-Connecting-IP': '203.0.113.7',
        'CF-IPCountry': 'BR',
        'X-Forwarded-For': '1.2.3.4',
        'X-Forwarded-Proto': 'https',
        'X-Real-IP': '1.2.3.4',
        Forwarded: 'for=1.2.3.4',
        'True-Client-IP': '1.2.3.4',
        Cookie: 'a=b',
        Accept: 'application/json',
        'X-Fluveny-Client': 'app',
      },
    });
    await worker.fetch(request, env());

    const { headers } = sent();
    for (const name of [
      'CF-Connecting-IP',
      'CF-IPCountry',
      'X-Forwarded-For',
      'X-Forwarded-Proto',
      'X-Real-IP',
      'Forwarded',
      'True-Client-IP',
    ]) {
      expect(headers.has(name)).toBe(false);
    }
    expect(headers.get('Cookie')).toBe('a=b');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('X-Fluveny-Client')).toBe('app');
    expect(headers.get(CLIENT_IP_HEADER)).toBe('203.0.113.7');
  });

  it('POST repassa corpo e Content-Type', async () => {
    const body = JSON.stringify({ deviceId: 'd', answer: { value: 'x' } });
    const request = new Request(`${ORIGIN}/api/v1/visitor/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '2001:db8::7' },
      body,
    });
    await worker.fetch(request, env());

    const { init, headers } = sent();
    expect(init.method).toBe('POST');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get(CLIENT_IP_HEADER)).toBe('2001:db8::7');
    expect(await new Response(init.body).text()).toBe(body);
  });

  it('troca os cabeçalhos forjados pelo navegador pelos do Worker', async () => {
    const request = new Request(`${ORIGIN}/api/v1/units`, {
      headers: {
        'CF-Connecting-IP': '203.0.113.7',
        [CLIENT_IP_HEADER]: '1.2.3.4',
        [PROXY_HEADER]: 'x',
      },
    });
    await worker.fetch(request, env());

    const { headers } = sent();
    expect(headers.get(PROXY_HEADER)).toBe(SECRET);
    expect(headers.get(CLIENT_IP_HEADER)).toBe('203.0.113.7');
  });

  it('sem CF-Connecting-IP, não manda o IP forjado', async () => {
    const request = new Request(`${ORIGIN}/api/v1/units`, {
      headers: { [CLIENT_IP_HEADER]: '1.2.3.4' },
    });
    await worker.fetch(request, env());
    expect(sent().headers.has(CLIENT_IP_HEADER)).toBe(false);
  });

  it.each([undefined, '', '  '])('sem segredo (%p), 503 problem+json sem chamar a API', async (secret) => {
    const response = await worker.fetch(new Request(`${ORIGIN}/api/v1/units`), env({ PROXY_SECRET: secret }));
    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(await response.json()).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('não segue redirecionamento: devolve o 3xx da API', async () => {
    upstream.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: 'https://outro.example/' } }),
    );
    const response = await worker.fetch(new Request(`${ORIGIN}/api/v1/units`), env());
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://outro.example/');
  });

  it('o módulo só exporta o handler (o runtime recusa outro export)', () => {
    expect(Object.keys(workerModule)).toEqual(['default']);
  });

  it('API fora do ar: 502 problem+json', async () => {
    upstream.mockRejectedValueOnce(new TypeError('fetch failed'));
    const response = await worker.fetch(new Request(`${ORIGIN}/api/v1/units`), env());
    expect(response.status).toBe(502);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
  });
});

describe('Cron Trigger do Worker (ping da API)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('chama GET /api/v1/meta direto no API_ORIGIN, sem o segredo de proxy', async () => {
    await worker.scheduled({ cron: '*/10 * * * *' }, env());

    const { target, init, headers } = sent();
    expect(target).toBe(`${API_ORIGIN}/api/v1/meta`);
    expect(init.method).toBe('GET');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(headers.has(PROXY_HEADER)).toBe(false);
    expect(headers.has(CLIENT_IP_HEADER)).toBe(false);
  });

  it.each([429, 500, 503])('resposta %p lança erro com o status, sem o corpo', async (status) => {
    upstream.mockResolvedValueOnce(new Response('<html>desafio secreto</html>', { status }));
    const error = await worker.scheduled({ cron: '*/10 * * * *' }, env()).then(
      () => null,
      (e) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(String(status));
    expect(error.message).not.toContain('desafio');
  });

  it('não segue redirecionamento: 302 lança erro com o status', async () => {
    upstream.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: 'https://outro.example/' } }),
    );
    await expect(worker.scheduled({ cron: '*/10 * * * *' }, env())).rejects.toThrow('302');
    expect(sent().init.redirect).toBe('manual');
  });

  it('falha de rede lança erro sem o texto original', async () => {
    upstream.mockRejectedValueOnce(new TypeError('fetch failed'));
    const error = await worker.scheduled({ cron: '*/10 * * * *' }, env()).then(
      () => null,
      (e) => e,
    );
    expect(error.message).toMatch(/rede/);
    expect(error.message).not.toContain('fetch failed');
  });

  it('timeout lança erro citando TimeoutError', async () => {
    upstream.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
    await expect(worker.scheduled({ cron: '*/10 * * * *' }, env())).rejects.toThrow(/TimeoutError/);
  });

  it('o wrangler.jsonc declara o cron de 10 em 10 min', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'wrangler.jsonc'), 'utf8');
    const json = source.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
    expect(JSON.parse(json).triggers.crons).toEqual(['*/10 * * * *']);
  });

  it('não muda o proxy de /api/*', async () => {
    await worker.fetch(new Request(`${ORIGIN}/api/v1/units`), env());
    const { target, headers } = sent();
    expect(target).toBe(`${API_ORIGIN}/api/v1/units`);
    expect(headers.get(PROXY_HEADER)).toBe(SECRET);
  });
});
