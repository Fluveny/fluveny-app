// Matriz da 2.10 (excluir a conta no App): uma linha por teste.
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform } from 'react-native';

import { messageFor, NETWORK_ERROR } from '../api/errors';
import { forceMockAccount, forceMockDeletion, mockAccountExists, resetMockStudents } from '../api/mocks/routes';
import {
  DELETE_BODY,
  DELETE_CANCEL,
  DELETE_LABEL,
  DELETE_PASSWORD_FIELD,
  DELETE_SHEET_TEXT,
} from '../auth/DeleteAccount';
import { forgetCachedSession } from '../auth/session';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';
import { SIGN_OUT_LABEL } from '../auth/StudentHome';
import { captureError } from '../observability/sentry';
import { ADULT, apiResponds, bodyOf, harness, json, mockAccount, ofRoute, openApp } from '../testing/accountHarness';
import { visitorStore } from '../visitor/store';
import { clearVisitorCache } from '../visitor/useVisitor';
import { ACCOUNT_DELETED } from '../../app/(public)/index';

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const DELETION = '/api/v1/students/me/deletion';
const LOGOUT = '/api/v1/auth/logout';

const passwordField = () => screen.getByTestId('account-deletion-password');
const submit = () => screen.getByTestId('account-deletion-submit');

async function openAccount(): Promise<StudentProfile> {
  const student = await mockAccount();
  await openApp('/conta', student);
  await screen.findByTestId('account-screen');
  return student;
}

async function confirmDeletion(password = ADULT.password) {
  await fireEvent.changeText(passwordField(), password);
  await fireEvent.press(submit());
  expect(await screen.findByText(DELETE_SHEET_TEXT)).toBeTruthy();
  await fireEvent.press(await screen.findByTestId('account-deletion-sheet-confirm'));
}

async function expectStillSignedIn() {
  expect(screen).toHavePathname('/conta');
  expect(harness.client!.getQueryData(STUDENT_QUERY_KEY)).toBeTruthy();
  expect(global.__secureStore.size).toBe(1);
  expect(passwordField().props.value).toBe(ADULT.password);
}

const os = Platform.OS;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  Platform.OS = 'android';
  global.__resetSqlite();
  global.__resetSecureStore();
  global.__resetNetwork();
  forgetCachedSession();
  clearVisitorCache();
  resetMockStudents();
  harness.override = {};
  harness.sent.length = 0;
  apiResponds();
  (captureError as jest.Mock).mockClear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = os;
  jest.restoreAllMocks();
});

describe('Excluir conta (2.10)', () => {
  it('senha vazia: a seção aparece com o texto e EXCLUIR CONTA desabilitado', async () => {
    await openAccount();
    expect(screen.getByText(DELETE_BODY)).toBeTruthy();
    expect(screen.getByRole('button', { name: DELETE_LABEL })).toBeDisabled();
    expect(screen.getAllByLabelText(DELETE_PASSWORD_FIELD).length).toBeGreaterThan(0);
  });

  it('exclui: 1 POST com a senha; sem logout; token, cache e loja limpos (deviceId fica); boas-vindas com aviso', async () => {
    const deviceId = await visitorStore.deviceId();
    await visitorStore.setVariable('name', 'Ana');
    await openAccount();
    await confirmDeletion();
    expect(await screen.findByText(ACCOUNT_DELETED)).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(ofRoute('POST', DELETION).map(bodyOf)).toEqual([{ currentPassword: ADULT.password }]);
    expect(ofRoute('POST', LOGOUT)).toHaveLength(0);
    expect(mockAccountExists(ADULT.email)).toBe(false);
    expect(harness.client!.getQueryData(STUDENT_QUERY_KEY)).toBeNull();
    expect(global.__secureStore.size).toBe(0);
    expect(await visitorStore.variables()).toEqual({});
    expect(await visitorStore.deviceId()).toBe(deviceId);
  });

  it('cancela: nenhuma requisição e a senha fica', async () => {
    await openAccount();
    await fireEvent.changeText(passwordField(), ADULT.password);
    await fireEvent.press(submit());
    await fireEvent.press(await screen.findByRole('button', { name: DELETE_CANCEL }));
    await waitFor(() => expect(screen.queryByText(DELETE_SHEET_TEXT)).toBeNull());
    expect(ofRoute('POST', DELETION)).toHaveLength(0);
    expect(passwordField().props.value).toBe(ADULT.password);
  });

  it('senha errada: 400 no campo; continua logado', async () => {
    await openAccount();
    await confirmDeletion('errada123');
    expect(await screen.findByText(messageFor('CURRENT_PASSWORD_INVALID'))).toBeTruthy();
    expect(screen.queryByTestId('account-deletion-failure')).toBeNull();
    expect(screen).toHavePathname('/conta');
    expect(global.__secureStore.size).toBe(1);
    expect(mockAccountExists(ADULT.email)).toBe(true);
  });

  it('muitas tentativas: 429 no rodapé; campos mantidos', async () => {
    await openAccount();
    forceMockAccount('TOO_MANY_REQUESTS');
    await confirmDeletion();
    expect(await screen.findByTestId('account-deletion-failure')).toHaveTextContent(messageFor('TOO_MANY_REQUESTS'));
    await expectStillSignedIn();
  });

  it('falha da API: 503 no rodapé; conta e sessão intactas', async () => {
    await openAccount();
    forceMockDeletion('ACCOUNT_DELETION_FAILED');
    await confirmDeletion();
    expect(await screen.findByTestId('account-deletion-failure')).toHaveTextContent(
      messageFor('ACCOUNT_DELETION_FAILED'),
    );
    expect(messageFor('ACCOUNT_DELETION_FAILED')).toBe('Não conseguimos excluir sua conta agora. Tente de novo.');
    expect(mockAccountExists(ADULT.email)).toBe(true);
    await expectStillSignedIn();
  });

  it('sem rede: rodapé; nada muda', async () => {
    await openAccount();
    harness.override[`POST ${DELETION}`] = () => Promise.reject(new TypeError('Network request failed'));
    await confirmDeletion();
    expect(await screen.findByTestId('account-deletion-failure')).toHaveTextContent(messageFor(NETWORK_ERROR));
    await expectStillSignedIn();
  });

  it('já excluída: 404 é tratado como excluída (limpa e vai à boas-vindas)', async () => {
    await openAccount();
    forceMockDeletion('NOT_FOUND');
    await confirmDeletion();
    expect(await screen.findByText(ACCOUNT_DELETED)).toBeTruthy();
    expect(global.__secureStore.size).toBe(0);
    expect(harness.client!.getQueryData(STUDENT_QUERY_KEY)).toBeNull();
  });

  it('toque duplo no EXCLUIR: 1 requisição', async () => {
    await openAccount();
    let answer: (response: Response) => void = () => {};
    harness.override[`POST ${DELETION}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await fireEvent.changeText(passwordField(), ADULT.password);
    await fireEvent.press(submit());
    const confirm = await screen.findByTestId('account-deletion-sheet-confirm');
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    await fireEvent.press(submit());
    expect(ofRoute('POST', DELETION)).toHaveLength(1);
    await act(async () => answer(new Response(null, { status: 204 })));
    expect(await screen.findByText(ACCOUNT_DELETED)).toBeTruthy();
    expect(ofRoute('POST', DELETION)).toHaveLength(1);
  });

  it('voltar: depois da exclusão, a pilha é só a boas-vindas e /conta volta para /', async () => {
    await openAccount();
    await confirmDeletion();
    await screen.findByText(ACCOUNT_DELETED);
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
    await act(async () => router.push('/conta'));
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(screen.queryByTestId('account-screen')).toBeNull();
  });

  it('o sair da 2.3 segue chamando o logout e limpando tudo', async () => {
    await openAccount();
    await fireEvent.press(screen.getByRole('button', { name: SIGN_OUT_LABEL }));
    await fireEvent.press(await screen.findByTestId('sign-out-sheet-confirm'));
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(ofRoute('POST', LOGOUT)).toHaveLength(1);
    expect(global.__secureStore.size).toBe(0);
    expect(screen.queryByText(ACCOUNT_DELETED)).toBeNull();
  });

  it('privacidade: a senha nunca vai à URL, a log, ao Sentry, à loja nem ao localStorage', async () => {
    const log = jest.spyOn(console, 'log');
    const warn = jest.spyOn(console, 'warn');
    const error = jest.spyOn(console, 'error');
    await openAccount();
    harness.override[`POST ${DELETION}`] = () => json({ code: 'ACCOUNT_DELETION_FAILED' }, 503);
    await confirmDeletion();
    await screen.findByTestId('account-deletion-failure');
    delete harness.override[`POST ${DELETION}`];
    await fireEvent.press(submit());
    await fireEvent.press(await screen.findByTestId('account-deletion-sheet-confirm'));
    await screen.findByText(ACCOUNT_DELETED);
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    const outside = JSON.stringify([
      harness.sent.map((request) => request.url),
      log.mock.calls,
      warn.mock.calls,
      error.mock.calls,
      (captureError as jest.Mock).mock.calls,
      [...global.__secureStore.entries()],
      await visitorStore.variables(),
      storage ? Object.entries(storage) : [],
    ]);
    expect(outside).not.toContain(ADULT.password);
  });
  it('outro 404 (rota ausente, proxy): erro no rodapé; nada é apagado', async () => {
    await openAccount();
    harness.override[`POST ${DELETION}`] = () => json({ code: 'ROUTE_MISSING' }, 404);
    await confirmDeletion();
    expect(await screen.findByTestId('account-deletion-failure')).toHaveTextContent(messageFor('ROUTE_MISSING'));
    await expectStillSignedIn();
  });

  it('a limpeza local falha depois do 204: vai ao Sentry sem a senha e a tela segue para a boas-vindas', async () => {
    await openAccount();
    jest.spyOn(harness.client!, 'clear').mockImplementationOnce(() => {
      throw new Error('limpeza falhou');
    });
    await confirmDeletion();
    expect(await screen.findByText(ACCOUNT_DELETED)).toBeTruthy();
    expect(captureError).toHaveBeenCalled();
    expect(JSON.stringify((captureError as jest.Mock).mock.calls)).not.toContain(ADULT.password);
  });

  it('o aviso da boas-vindas é anunciado e o motivo sai da URL (aparece uma vez)', async () => {
    await openAccount();
    await confirmDeletion();
    expect(await screen.findByText(ACCOUNT_DELETED)).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(ACCOUNT_DELETED);
    await waitFor(() => expect(screen).toHaveSearchParams({}));
    expect(screen.getByText(ACCOUNT_DELETED)).toBeTruthy();
  });

  it('web: exclui pelo cookie, sem Bearer; a senha nunca vai ao localStorage', async () => {
    Platform.OS = 'web';
    const win = window as unknown as Record<string, unknown>;
    win.addEventListener ??= () => {};
    win.removeEventListener ??= () => {};
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    storage?.clear();
    await openAccount();
    await confirmDeletion();
    expect(await screen.findByText(ACCOUNT_DELETED)).toBeTruthy();
    const [request] = ofRoute('POST', DELETION);
    expect(request!.headers.get('Authorization')).toBeNull();
    expect(request!.headers.get('X-Fluveny-Client')).toBe('web');
    expect(harness.client!.getQueryData(STUDENT_QUERY_KEY)).toBeNull();
    expect(JSON.stringify(storage ? Object.entries(storage) : [])).not.toContain(ADULT.password);
    expect(JSON.stringify(harness.sent.map((r) => r.url))).not.toContain(ADULT.password);
  });
});
