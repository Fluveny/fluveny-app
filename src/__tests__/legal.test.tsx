// Matriz da 1.21 (política e termos provisórios): uma linha por teste.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useFonts } from 'expo-font';

import { META_SPLASH_TIMEOUT_MS, queryClient, RootLayout } from '../../app/_layout';
import Root, { WELCOME_TITLE } from '../../app/(public)/index';
import PrivacyPolicy from '../../app/(public)/privacidade';
import TermsOfUse from '../../app/(public)/termos';
import UpdateRequired, { UPDATE_TITLE } from '../../app/atualize';
import { META_QUERY_KEY } from '../api/meta';
import { COLD_START_TEXT } from '../ColdStartScreen';
import { LEGAL_BACK, versionLine } from '../legal/LegalScreen';
import { PRIVACY_LINK, TERMS_LINK } from '../legal/paths';
import { PRIVACY_POLICY } from '../legal/privacy';
import { TERMS_OF_USE } from '../legal/terms';
import { PROVISIONAL_NOTICE } from '../legal/types';

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

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const meta = (minAppVersion: string) =>
  jest.fn().mockResolvedValue(json({ data: { minAppVersion, activityTypes: [] } }));

const routes = {
  _layout: RootLayout,
  '(public)/index': Root,
  '(public)/privacidade': PrivacyPolicy,
  '(public)/termos': TermsOfUse,
  atualize: UpdateRequired,
};

const open = (initialUrl: string) => renderRouter(routes, { initialUrl });

let warn: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  (useFonts as jest.Mock).mockReturnValue([true, null]);
  global.__resetNetwork();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
});

afterAll(() => queryClient.clear());

describe('política e termos (1.21)', () => {
  it('boas-vindas: os links da política e dos termos abaixo das três ações', async () => {
    global.fetch = meta('0.0.0');
    await open('/');
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: PRIVACY_LINK })).toBeTruthy();
    expect(screen.getByRole('button', { name: TERMS_LINK })).toBeTruthy();
  });

  it('abrir a política: aviso provisório, versão e data, e as seções', async () => {
    global.fetch = meta('0.0.0');
    await open('/');
    await fireEvent.press(await screen.findByRole('button', { name: PRIVACY_LINK }));
    expect(screen).toHavePathname('/privacidade');
    expect(screen.getByRole('header', { name: PRIVACY_POLICY.title })).toBeTruthy();
    expect(screen.getByText(PROVISIONAL_NOTICE)).toBeTruthy();
    expect(screen.getByTestId('legal-version')).toHaveTextContent(versionLine(PRIVACY_POLICY));
    for (const section of PRIVACY_POLICY.sections) expect(screen.getByText(section.title)).toBeTruthy();
  });

  it('abrir os termos: aviso provisório, versão e data', async () => {
    global.fetch = meta('0.0.0');
    await open('/');
    await fireEvent.press(await screen.findByRole('button', { name: TERMS_LINK }));
    expect(screen).toHavePathname('/termos');
    expect(screen.getByRole('header', { name: TERMS_OF_USE.title })).toBeTruthy();
    expect(screen.getByText(PROVISIONAL_NOTICE)).toBeTruthy();
    expect(screen.getByTestId('legal-version')).toHaveTextContent(versionLine(TERMS_OF_USE));
  });

  it('link direto: a política abre sem esperar o /meta', async () => {
    // O /meta nunca responde: sem o atalho, a splash seguraria a tela até o teto.
    global.fetch = jest.fn(() => new Promise<Response>(() => {}));
    await open('/privacidade');
    expect(screen.getByRole('header', { name: PRIVACY_POLICY.title })).toBeTruthy();
    expect(screen.getByText(PROVISIONAL_NOTICE)).toBeTruthy();
  });

  it('link direto com o /meta pendente: VOLTAR para a boas-vindas volta a esperar o /meta', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(() => new Promise<Response>(() => {}));
    await open('/privacidade');
    expect(screen.getByRole('header', { name: PRIVACY_POLICY.title })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: LEGAL_BACK }));
    expect(screen.queryByText(WELCOME_TITLE)).toBeNull();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(META_SPLASH_TIMEOUT_MS);
    });
    expect(screen.getByText(COLD_START_TEXT)).toBeTruthy();
    expect(screen.queryByText(WELCOME_TITLE)).toBeNull();
  });

  it('desatualizado: a política e os termos continuam abrindo', async () => {
    global.fetch = meta('99.0.0');
    await open('/privacidade');
    await waitFor(() => expect(queryClient.getQueryData(META_QUERY_KEY)).toBeDefined());
    await act(async () => {});
    expect(screen.getByRole('header', { name: PRIVACY_POLICY.title })).toBeTruthy();
    expect(screen).toHavePathname('/privacidade');
    expect(screen.queryByText(UPDATE_TITLE)).toBeNull();
    // O /meta chegou e bloqueia o resto: VOLTAR leva à tela de atualizar.
    await fireEvent.press(screen.getByRole('button', { name: LEGAL_BACK }));
    expect(await screen.findByText(UPDATE_TITLE)).toBeTruthy();
  });

  it('desatualizado: os termos continuam abrindo', async () => {
    global.fetch = meta('99.0.0');
    await open('/termos');
    await waitFor(() => expect(queryClient.getQueryData(META_QUERY_KEY)).toBeDefined());
    await act(async () => {});
    expect(screen.getByRole('header', { name: TERMS_OF_USE.title })).toBeTruthy();
    expect(screen).toHavePathname('/termos');
  });

  it('VOLTAR: volta à tela anterior', async () => {
    global.fetch = meta('0.0.0');
    await open('/');
    await fireEvent.press(await screen.findByRole('button', { name: TERMS_LINK }));
    expect(screen).toHavePathname('/termos');
    await fireEvent.press(screen.getByRole('button', { name: LEGAL_BACK }));
    expect(screen).toHavePathname('/');
    expect(screen.getByText(WELCOME_TITLE)).toBeTruthy();
  });

  it('VOLTAR sem tela anterior: vai à boas-vindas', async () => {
    global.fetch = meta('0.0.0');
    await open('/privacidade');
    await fireEvent.press(screen.getByRole('button', { name: LEGAL_BACK }));
    expect(screen).toHavePathname('/');
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
  });
});
