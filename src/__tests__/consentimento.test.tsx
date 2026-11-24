// Página do responsável (2.11): `/consentimento?token=…`, pública. Uma linha da matriz por teste.
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform } from 'react-native';

import { RootStack } from '../../app/_layout';
import GuardianConsent, {
  CONSENT_DONE_BODY,
  CONSENT_DONE_TITLE,
  CONSENT_INVALID_TITLE,
  CONSENT_RETRY,
} from '../../app/(public)/consentimento';
import Root from '../../app/(public)/index';
import PrivacyPolicy from '../../app/(public)/privacidade';
import TermsOfUse from '../../app/(public)/termos';
import { messageFor } from '../api/errors';
import { mockResponse } from '../api/mocks/handlers';
import { mockGuardianToken, mockRoutes, resetMockStudents } from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import { forgetGuardianConfirmation } from '../auth/guardianConsent';
import { forgetCachedSession } from '../auth/session';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';
import { PRIVACY_LINK, TERMS_LINK } from '../legal/paths';

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const CONFIRM = '/api/v1/account/guardian-consent/confirm';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });

let override: Partial<Record<string, () => Response | Promise<Response>>> = {};
const sent: { method: string; path: string; body: unknown }[] = [];
const ofRoute = (method: string, path: string) => sent.filter((r) => r.method === method && r.path === path);

function apiResponds() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    sent.push({ method, path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    const forced = override[`${method} ${path}`];
    if (forced) return forced();
    if (path === '/api/v1/meta') return json({ data: { minAppVersion: '0.0.0', activityTypes: [] } });
    const routes = mockRoutes as unknown as Record<string, Record<string, (request: Request) => unknown>>;
    const resolve = routes[path]?.[method.toLowerCase()];
    if (!resolve) return json({ code: 'NOT_FOUND' }, 404);
    return mockResponse(resolve, new Request(url, init));
  }) as jest.Mock;
}

async function openApp(initialUrl: string, student?: StudentProfile) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  if (student) client.setQueryData(STUDENT_QUERY_KEY, student);
  await renderRouter(
    {
      _layout: () => (
        <AppProviders client={client}>
          <RootStack />
        </AppProviders>
      ),
      '(public)/index': Root,
      '(public)/consentimento': GuardianConsent,
      '(public)/privacidade': PrivacyPolicy,
      '(public)/termos': TermsOfUse,
    },
    { initialUrl },
  );
  return client;
}

/** Uma conta de 15 anos pendente no mock (o `valido` autoriza a última). */
async function teenPending() {
  const birth = `${new Date().getFullYear() - 15}-01-01`;
  await mockRoutes['/api/v1/auth/signup'].post(
    new Request('http://mock/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'X-Fluveny-Client': 'web' },
      body: JSON.stringify({
        email: 'bia@exemplo.test',
        password: 'segredo123',
        birthDate: birth,
        guardianEmail: 'mae@exemplo.test',
        acceptedTermsVersion: '0.2',
        acceptedPrivacyVersion: '0.3',
      }),
    }),
  );
}

const os = Platform.OS;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  Platform.OS = 'android';
  global.__resetSqlite();
  global.__resetSecureStore();
  forgetCachedSession();
  forgetGuardianConfirmation();
  resetMockStudents();
  override = {};
  sent.length = 0;
  apiResponds();
  await teenPending();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = os;
  jest.restoreAllMocks();
});

describe('página do responsável (2.11)', () => {
  it('link válido: o token sai da URL, um POST só, "Pronto!" e os links legais', async () => {
    await openApp('/consentimento?token=valido');
    expect(await screen.findByRole('header', { name: CONSENT_DONE_TITLE })).toBeTruthy();
    expect(screen.getByText(CONSENT_DONE_BODY)).toBeTruthy();
    expect(screen).toHavePathname('/consentimento');
    expect(screen).toHaveSearchParams({});
    expect(ofRoute('POST', CONFIRM)).toEqual([{ method: 'POST', path: CONFIRM, body: { token: 'valido' } }]);
    expect(screen.getByRole('button', { name: TERMS_LINK })).toBeTruthy();
    expect(screen.getByRole('button', { name: PRIVACY_LINK })).toBeTruthy();
  });

  it('link do mock emitido no cadastro do adolescente: autoriza', async () => {
    await openApp(`/consentimento?token=${mockGuardianToken()}`);
    expect(await screen.findByRole('header', { name: CONSENT_DONE_TITLE })).toBeTruthy();
  });

  it('link inválido (400): a mensagem para pedir outro e-mail', async () => {
    await openApp('/consentimento?token=usado');
    expect(await screen.findByRole('header', { name: CONSENT_INVALID_TITLE })).toBeTruthy();
  });

  it('remonte depois do resultado: o mesmo resultado, sem outro POST', async () => {
    await openApp('/consentimento?token=valido');
    expect(await screen.findByRole('header', { name: CONSENT_DONE_TITLE })).toBeTruthy();
    await act(async () => router.replace('/consentimento'));
    expect(await screen.findByRole('header', { name: CONSENT_DONE_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(1);
  });

  it('token maior que o limite: link inválido direto, sem POST', async () => {
    await openApp(`/consentimento?token=${'x'.repeat(129)}`);
    expect(await screen.findByRole('header', { name: CONSENT_INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(0);
  });

  it('outro 400 (não é o token): o ramo de erro com TENTAR DE NOVO', async () => {
    override[`POST ${CONFIRM}`] = () => json({ code: 'BAD_REQUEST' }, 400);
    await openApp('/consentimento?token=valido');
    expect(await screen.findByRole('header', { name: messageFor('BAD_REQUEST') })).toBeTruthy();
    expect(screen.getByRole('button', { name: CONSENT_RETRY })).toBeTruthy();
  });

  it('mock: `valido` sem conta pendente é 400', async () => {
    resetMockStudents();
    await openApp('/consentimento?token=valido');
    expect(await screen.findByRole('header', { name: CONSENT_INVALID_TITLE })).toBeTruthy();
  });

  it('sem token: link inválido, sem POST', async () => {
    await openApp('/consentimento');
    expect(await screen.findByRole('header', { name: CONSENT_INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(0);
  });

  it('sem rede: a mensagem e TENTAR DE NOVO com o mesmo token', async () => {
    override[`POST ${CONFIRM}`] = () => Promise.reject(new TypeError('rede'));
    await openApp('/consentimento?token=valido');
    expect(await screen.findByRole('header', { name: messageFor('NETWORK_ERROR') })).toBeTruthy();
    delete override[`POST ${CONFIRM}`];
    await fireEvent.press(screen.getByRole('button', { name: CONSENT_RETRY }));
    expect(await screen.findByRole('header', { name: CONSENT_DONE_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM).map((r) => r.body)).toEqual([{ token: 'valido' }, { token: 'valido' }]);
  });

  it('com alguém logado: não mexe na sessão nem relê o perfil', async () => {
    const student: StudentProfile = {
      email: 'ana@exemplo.test',
      name: 'Ana',
      pronounSet: null,
      emailConfirmed: true,
      emailConfirmationOverdue: false,
      status: 'ACTIVE',
    };
    global.__secureStore.set('fluveny.session', 'token-da-ana');
    const client = await openApp('/consentimento?token=valido', student);
    expect(await screen.findByRole('header', { name: CONSENT_DONE_TITLE })).toBeTruthy();
    await act(async () => {});
    expect(client.getQueryData(STUDENT_QUERY_KEY)).toEqual(student);
    expect(global.__secureStore.get('fluveny.session')).toBe('token-da-ana');
    expect(ofRoute('GET', '/api/v1/students/me')).toHaveLength(0);
  });
});
