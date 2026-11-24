// Matriz da 2.9 (o link da troca de e-mail no App): uma linha por teste.
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform } from 'react-native';

import {
  CHANGED_TITLE,
  GO_HOME_LABEL,
  INVALID_TITLE,
  RETRY_LABEL,
  TAKEN_TITLE,
} from '../../app/(public)/confirmar-novo-email';
import { messageFor } from '../api/errors';
import { mockEmailChangeToken, mockRoutes, resetMockStudents, seedMockAccount } from '../api/mocks/routes';
import { forgetEmailChange, holdChangeToken, rememberChangeToken, rememberedChangeToken } from '../auth/emailChange';
import { forgetCachedSession } from '../auth/session';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';
import { captureError } from '../observability/sentry';
import { ADULT, apiResponds, bodyOf, harness, json, mockAccount, ofRoute, openApp } from '../testing/accountHarness';
import { clearVisitorCache } from '../visitor/useVisitor';

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const CONFIRM = '/api/v1/account/email-change/confirm';
const NEW_EMAIL = 'bia@exemplo.test';

/** Conta com o pedido de troca feito no mock; devolve o token do link. */
async function pendingChange(): Promise<string> {
  await mockAccount();
  const bearer = global.__secureStore.get('fluveny.session');
  await mockRoutes['/api/v1/students/me/email'].post(
    new Request('http://mock/api/v1/students/me/email', {
      method: 'POST',
      headers: { 'X-Fluveny-Client': 'android', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ newEmail: NEW_EMAIL, currentPassword: ADULT.password }),
    }),
  );
  return mockEmailChangeToken()!;
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
  forgetEmailChange();
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

describe('Confirmar a troca de e-mail (2.9)', () => {
  it('token válido: URL sem token; 1 POST; "E-mail trocado."; perfil invalidado com sessão; IR PARA O INÍCIO', async () => {
    const token = await pendingChange();
    const client = await openApp(`/confirmar-novo-email?token=${token}`, {
      email: ADULT.email,
      name: 'Ana',
      pendingEmail: NEW_EMAIL,
      emailConfirmed: true,
      emailConfirmationOverdue: false,
      status: 'ACTIVE',
    });
    expect(await screen.findByRole('header', { name: CHANGED_TITLE })).toBeTruthy();
    expect(screen).toHavePathname('/confirmar-novo-email');
    expect(screen).toHaveSearchParams({});
    expect(ofRoute('POST', CONFIRM).map(bodyOf)).toEqual([{ token }]);
    // O perfil em cache fica invalidado: quem voltar à raiz o busca de novo.
    await waitFor(() => expect(client.getQueryState(STUDENT_QUERY_KEY)?.isInvalidated).toBe(true));
    expect(client.getQueryData<StudentProfile>(STUDENT_QUERY_KEY)?.pendingEmail).toBe(NEW_EMAIL);
    await fireEvent.press(screen.getByRole('button', { name: GO_HOME_LABEL }));
    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('link velho (410): o estado do link inválido', async () => {
    const token = await pendingChange();
    await mockRoutes[CONFIRM].post(new Request('http://mock', { method: 'POST', body: JSON.stringify({ token }) }));
    await openApp(`/confirmar-novo-email?token=${token}`);
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
  });

  it('sem token ou com mais de 128: o estado do link inválido, sem POST', async () => {
    await openApp('/confirmar-novo-email');
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(0);
  });

  it('token longo: inválido, sem POST', async () => {
    await openApp(`/confirmar-novo-email?token=${'a'.repeat(129)}`);
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(0);
  });

  it('400 VALIDATION_FAILED: o estado do link inválido; outro 400 vai ao erro comum', async () => {
    const token = await pendingChange();
    harness.override[`POST ${CONFIRM}`] = () => json({ code: 'VALIDATION_FAILED' }, 400);
    await openApp(`/confirmar-novo-email?token=${token}`);
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(INVALID_TITLE).toBe(messageFor('EMAIL_CHANGE_LINK_INVALID'));
  });

  it('outro 400 (CLIENT_HEADER_REQUIRED): o erro comum, com TENTAR DE NOVO', async () => {
    const token = await pendingChange();
    harness.override[`POST ${CONFIRM}`] = () => json({ code: 'CLIENT_HEADER_REQUIRED' }, 400);
    await openApp(`/confirmar-novo-email?token=${token}`);
    expect(await screen.findByRole('header', { name: messageFor('CLIENT_HEADER_REQUIRED') })).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY_LABEL })).toBeTruthy();
  });

  it('remonte durante o POST seguro: um POST só, e o resultado aparece', async () => {
    const token = await pendingChange();
    let answer!: (response: Response) => void;
    harness.override[`POST ${CONFIRM}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await openApp(`/confirmar-novo-email?token=${token}`);
    await waitFor(() => expect(ofRoute('POST', CONFIRM)).toHaveLength(1));
    // O mesmo caminho, sem o token na URL (já tirado): a tela monta de novo.
    await act(async () => router.replace('/confirmar-novo-email'));
    await act(async () => answer(new Response(null, { status: 204 })));
    expect(await screen.findByRole('header', { name: CHANGED_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(1);
  });

  it('a última tela que sai esquece o token; o remonte no mesmo commit o mantém', async () => {
    rememberChangeToken('t1');
    const first = holdChangeToken();
    const second = holdChangeToken();
    first();
    await Promise.resolve();
    expect(rememberedChangeToken()).toBe('t1');
    second();
    await Promise.resolve();
    expect(rememberedChangeToken()).toBeNull();
  });

  it('corrida (409): a mensagem do e-mail tomado', async () => {
    const token = await pendingChange();
    seedMockAccount(NEW_EMAIL, 'outra1234');
    await openApp(`/confirmar-novo-email?token=${token}`);
    expect(await screen.findByRole('header', { name: TAKEN_TITLE })).toBeTruthy();
  });

  it('sem rede: TENTAR DE NOVO reenvia o mesmo token', async () => {
    const token = await pendingChange();
    harness.override[`POST ${CONFIRM}`] = () => Promise.reject(new TypeError('Network request failed'));
    await openApp(`/confirmar-novo-email?token=${token}`);
    expect(await screen.findByRole('header', { name: messageFor('NETWORK_ERROR') })).toBeTruthy();
    delete harness.override[`POST ${CONFIRM}`];
    await act(async () => fireEvent.press(screen.getByRole('button', { name: RETRY_LABEL })));
    expect(await screen.findByRole('header', { name: CHANGED_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM).map(bodyOf)).toEqual([{ token }, { token }]);
  });

  it('o token não vai a log nem ao Sentry, e sai da URL', async () => {
    const log = jest.spyOn(console, 'log');
    const token = await pendingChange();
    await openApp(`/confirmar-novo-email?token=${token}`);
    await screen.findByRole('header', { name: CHANGED_TITLE });
    expect(JSON.stringify([log.mock.calls, (captureError as jest.Mock).mock.calls])).not.toContain(token);
    expect(screen).toHaveSearchParams({});
  });
});
