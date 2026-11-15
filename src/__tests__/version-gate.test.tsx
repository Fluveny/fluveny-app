// Uma linha da matriz da 1.3 por teste: versão ok, versão antiga e /meta falhando.
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { RootStack } from '../../app/_layout';
import Welcome, { WELCOME_TITLE } from '../../app/(public)/index';
import UpdateRequired, { UPDATE_BODY, UPDATE_BUTTON, UPDATE_TITLE } from '../../app/atualize';
import { appVersion } from '../api/client';
import { AppProviders, createQueryClient } from '../AppProviders';
import * as sentry from '../observability/sentry';

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

function metaResponds(minAppVersion: string) {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: { minAppVersion, activityTypes: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

async function openApp() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return renderRouter(
    {
      _layout: () => (
        <AppProviders client={client}>
          <RootStack />
        </AppProviders>
      ),
      '(public)/index': Welcome,
      atualize: UpdateRequired,
    },
    { initialUrl: '/' },
  );
}

let warn: jest.SpyInstance;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  (sentry.captureError as jest.Mock).mockClear();
});

afterEach(() => warn.mockRestore());

describe('versão do App na abertura (AD-11)', () => {
  it('versão ok: segue para a boas-vindas', async () => {
    metaResponds(appVersion());
    await openApp();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen.queryByText(UPDATE_TITLE)).toBeNull();
    expect(screen).toHavePathname('/');
  });

  it('versão antiga: tela "Atualize o app" bloqueante, sem rota para voltar', async () => {
    metaResponds('99.0.0');
    await openApp();
    expect(await screen.findByText(UPDATE_TITLE)).toBeTruthy();
    expect(screen.getByText(UPDATE_BODY)).toBeTruthy();
    expect(screen.getByRole('button', { name: UPDATE_BUTTON })).toBeTruthy();
    expect(screen).toHavePathname('/atualize');
    expect(screen.queryByText(WELCOME_TITLE)).toBeNull();
    expect(screen.getByTestId('alex-wave')).toBeTruthy();
  });

  it('/meta falha (5xx): o App segue sem bloquear, e o erro vai para o log e o Sentry', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 }));
    await openApp();
    await waitFor(() => expect(sentry.captureError).toHaveBeenCalled());
    expect(warn).toHaveBeenCalled();
    expect(screen.getByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen.queryByText(UPDATE_TITLE)).toBeNull();
  });

  it('/meta falha (rede): o App segue sem bloquear', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await openApp();
    await waitFor(() => expect(sentry.captureError).toHaveBeenCalled());
    expect(screen.getByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen.queryByText(UPDATE_TITLE)).toBeNull();
  });

  it('/meta malformado (sem minAppVersion): o App segue, sem quebrar', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { activityTypes: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await openApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen.queryByText(UPDATE_TITLE)).toBeNull();
  });

  it('volta ao primeiro plano: refaz o /meta e bloqueia se o mínimo subiu', async () => {
    const handlers: ((state: AppStateStatus) => void)[] = [];
    const listen = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') handlers.push(handler as (state: AppStateStatus) => void);
      return { remove: jest.fn() } as never;
    });
    try {
      const meta = (minAppVersion: string) =>
        new Response(JSON.stringify({ data: { minAppVersion, activityTypes: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      global.fetch = jest.fn().mockResolvedValueOnce(meta('0.0.0')).mockResolvedValueOnce(meta('99.0.0'));
      await openApp();
      expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
      expect(handlers.length).toBeGreaterThan(0);

      await act(async () => {
        for (const handler of handlers) handler('background');
        for (const handler of handlers) handler('active');
      });

      expect(await screen.findByText(UPDATE_TITLE)).toBeTruthy();
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(screen).toHavePathname('/atualize');
    } finally {
      listen.mockRestore();
    }
  });

  it('envia X-App-Version na consulta do /meta', async () => {
    metaResponds('0.0.0');
    await openApp();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.exemplo.test/api/v1/meta');
    expect(new Headers(init.headers).get('X-App-Version')).toBe(appVersion());
  });
});
