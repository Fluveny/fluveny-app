import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { META_SPLASH_TIMEOUT_MS, queryClient, RootLayout } from '../../app/_layout';
import Root, { WELCOME_TITLE } from '../../app/(public)/index';
import UpdateRequired, { UPDATE_TITLE } from '../../app/atualize';
import KitScreen from '../../app/kit';
import { ApiError } from '../api/client';
import { COLD_START_RETRY_MS, COLD_START_TEXT } from '../ColdStartScreen';
import { OFFLINE_TEXT } from '../network/text';
import * as sentry from '../observability/sentry';

jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: jest.fn(() => [true, null]),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const openApp = () =>
  renderRouter({ _layout: RootLayout, '(public)/index': Root, atualize: UpdateRequired }, { initialUrl: '/' });

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
let warn: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  (useFonts as jest.Mock).mockReturnValue([true, null]);
  (SplashScreen.hideAsync as jest.Mock).mockClear();
  (sentry.captureError as jest.Mock).mockClear();
  global.__resetNetwork();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
});

afterAll(() => {
  // O cliente é do módulo: limpar tira os timers de gc e deixa o jest sair.
  queryClient.clear();
  process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
});

describe('RootLayout', () => {
  it('com falha de fonte: renderiza o App, manda o erro ao Sentry e esconde a splash', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, new Error('fonte não carregou')]);
    global.fetch = jest.fn().mockResolvedValue(json({ data: { minAppVersion: '0.0.0', activityTypes: [] } }));
    await openApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalled());
    expect(sentry.captureError).toHaveBeenCalledWith(expect.objectContaining({ message: 'fonte não carregou' }));
  });

  it('primeira abertura: /meta responde antes do teto e a boas-vindas aparece, sem a tela azul', async () => {
    global.fetch = jest.fn().mockResolvedValue(json({ data: { minAppVersion: '0.0.0', activityTypes: [] } }));
    await openApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen.queryByText(COLD_START_TEXT)).toBeNull();
  });

  it('partida a frio: /meta pendente no teto mostra a tela azul até ele responder', async () => {
    jest.useFakeTimers();
    let answer: (response: Response) => void = () => {};
    global.fetch = jest.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
    await openApp();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(META_SPLASH_TIMEOUT_MS - 1);
    });
    expect(screen.queryByText(WELCOME_TITLE)).toBeNull();
    expect(screen.queryByText(COLD_START_TEXT)).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText(COLD_START_TEXT)).toBeTruthy();
    expect(screen.getByTestId('alex-wave')).toBeTruthy();
    expect(screen.queryByText(WELCOME_TITLE)).toBeNull();
    expect(screen.queryByTestId('status-banner')).toBeNull();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();

    await act(async () => {
      answer(json({ data: { minAppVersion: '0.0.0', activityTypes: [] } }));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen.queryByText(COLD_START_TEXT)).toBeNull();
  });

  /** Abre o App com o /meta pendente até o teto: cada chamada do fetch espera `pending.shift()?.(...)`. */
  async function openCold() {
    jest.useFakeTimers();
    const pending: ((outcome: Response | Error) => void)[] = [];
    global.fetch = jest.fn(
      () =>
        new Promise<Response>((resolve, reject) =>
          pending.push((outcome) => (outcome instanceof Error ? reject(outcome) : resolve(outcome))),
        ),
    );
    await openApp();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(META_SPLASH_TIMEOUT_MS);
    });
    expect(screen.getByText(COLD_START_TEXT)).toBeTruthy();
    return pending;
  }

  /** A tentativa e o retry do TanStack terminam com `outcome`. */
  async function bothAttempts(pending: ((outcome: Response | Error) => void)[], outcome: () => Response | Error) {
    await act(async () => {
      pending.shift()?.(outcome());
      await jest.advanceTimersByTimeAsync(1000);
      pending.shift()?.(outcome());
      await jest.advanceTimersByTimeAsync(0);
    });
  }

  it('partida a frio sem rede: faixa sem conexão e o /meta é refeito até responder', async () => {
    const pending = await openCold();
    await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
    await bothAttempts(pending, () => new TypeError('Network request failed'));
    expect(screen.getByText(COLD_START_TEXT)).toBeTruthy();
    expect(screen.getByText(OFFLINE_TEXT)).toBeTruthy();
    const calls = (global.fetch as jest.Mock).mock.calls.length;

    await act(async () => {
      await jest.advanceTimersByTimeAsync(COLD_START_RETRY_MS);
    });
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(calls + 1);
    await act(async () => {
      global.__setNetwork({ isConnected: true, isInternetReachable: true });
      pending.shift()?.(json({ data: { minAppVersion: '0.0.0', activityTypes: [] } }));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen.queryByText(COLD_START_TEXT)).toBeNull();
  });

  it('partida a frio com tempo esgotado e o aparelho online: tela azul sem faixa, tentando de novo', async () => {
    const pending = await openCold();
    await bothAttempts(pending, () => new TypeError('Network request failed'));
    expect(screen.getByText(COLD_START_TEXT)).toBeTruthy();
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
    const calls = (global.fetch as jest.Mock).mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(COLD_START_RETRY_MS);
    });
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(calls + 1);
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
  });

  it('partida a frio e o servidor responde 5xx: segue para a boas-vindas', async () => {
    const pending = await openCold();
    await bothAttempts(pending, () => new Response('Bad Gateway', { status: 502 }));
    expect(screen.getByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen.queryByText(COLD_START_TEXT)).toBeNull();
  });

  it('minAppVersion 99.0.0: o logo nunca aparece, só a tela de atualizar', async () => {
    global.fetch = jest.fn().mockResolvedValue(json({ data: { minAppVersion: '99.0.0', activityTypes: [] } }));
    const seenLogo = jest.fn();
    await openApp();
    await waitFor(() => {
      if (screen.queryByText(WELCOME_TITLE)) seenLogo();
      expect(screen.getByText(UPDATE_TITLE)).toBeTruthy();
    });
    expect(seenLogo).not.toHaveBeenCalled();
    expect(screen.queryByText(WELCOME_TITLE)).toBeNull();
    expect(screen).toHavePathname('/atualize');
  });

  it('minAppVersion 99.0.0: /kit fica atrás do guard e leva a /atualize', async () => {
    global.fetch = jest.fn().mockResolvedValue(json({ data: { minAppVersion: '99.0.0', activityTypes: [] } }));
    await renderRouter(
      { _layout: RootLayout, '(public)/index': Root, atualize: UpdateRequired, kit: KitScreen },
      { initialUrl: '/kit' },
    );
    expect(await screen.findByText(UPDATE_TITLE)).toBeTruthy();
    expect(screen).toHavePathname('/atualize');
  });

  it('/meta falha: com o SplashGate e a pilha usando o /meta, o erro vai uma vez só ao log e ao Sentry', async () => {
    global.fetch = jest.fn(async () => new Response('Bad Gateway', { status: 502 }));
    await openApp();
    expect(await screen.findByText(WELCOME_TITLE, {}, { timeout: 4000 })).toBeTruthy();
    const apiErrors = (sentry.captureError as jest.Mock).mock.calls.filter(([e]) => e instanceof ApiError);
    expect(apiErrors).toHaveLength(1);
    expect(warn.mock.calls.filter(([m]) => String(m).includes('[meta]'))).toHaveLength(1);
    // Uma tentativa e um retry, sem refazer ao montar a pilha.
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
