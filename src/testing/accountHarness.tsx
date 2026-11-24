// O App da Conta e da troca de e-mail (2.9) nos testes: a API pelos mocks de
// `routes.ts`, com cada requisição gravada em `sent` e as respostas trocáveis em `override`.
import type { QueryClient } from '@tanstack/react-query';
import { renderRouter } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import { RootStack } from '../../app/_layout';
import ConfirmEmailChange from '../../app/(public)/confirmar-novo-email';
import SignIn from '../../app/(public)/entrar';
import Root from '../../app/(public)/index';
import Account from '../../app/(student)/conta';
import Player from '../../app/(student)/player';
import { mockResponse } from '../api/mocks/handlers';
import { MOCK_CREATED, MOCK_NO_CONTENT, mockRoutes } from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import { forgetCachedSession } from '../auth/session';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });

export const harness: {
  override: Partial<Record<string, () => Response | Promise<Response>>>;
  sent: { method: string; url: string; path: string; headers: Headers; rawBody: string | undefined }[];
  client: QueryClient | null;
} = { override: {}, sent: [], client: null };

export function apiResponds() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    harness.sent.push({
      method,
      url,
      path,
      headers: new Headers(init?.headers),
      rawBody: typeof init?.body === 'string' ? init.body : undefined,
    });
    const forced = harness.override[`${method} ${path}`];
    if (forced) return forced();
    if (path === '/api/v1/meta') return json({ data: { minAppVersion: '0.0.0', activityTypes: [] } });
    const routes = mockRoutes as unknown as Record<string, Record<string, (request: Request) => unknown>>;
    const resolve = routes[path]?.[method.toLowerCase()];
    if (!resolve) return json({ code: 'NOT_FOUND' }, 404);
    const key = `${method} ${path}`;
    return mockResponse(resolve, new Request(url, init), MOCK_CREATED.has(key) ? 201 : 200, MOCK_NO_CONTENT.has(key));
  }) as jest.Mock;
}

export const ofRoute = (method: string, path: string) =>
  harness.sent.filter((request) => request.method === method && request.path === path);

export const bodyOf = (request: { rawBody: string | undefined }) =>
  request.rawBody === undefined ? undefined : (JSON.parse(request.rawBody) as Record<string, unknown>);

export const ADULT = {
  email: 'ana@exemplo.test',
  password: 'segredo123',
  birthDate: '1990-05-20',
  name: 'Ana',
  acceptedTermsVersion: '0.2',
  acceptedPrivacyVersion: '0.3',
};

/** Cria a conta no mock (Android, com o token no armazenamento seguro). */
export async function mockAccount(): Promise<StudentProfile> {
  const created = await mockRoutes['/api/v1/auth/signup'].post(
    new Request('http://mock/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'X-Fluveny-Client': Platform.OS === 'web' ? 'web' : 'android' },
      body: JSON.stringify(ADULT),
    }),
  );
  if (created.data.sessionToken) global.__secureStore.set('fluveny.session', created.data.sessionToken);
  forgetCachedSession();
  return created.data.student;
}

export async function openApp(initialUrl: string, student?: StudentProfile) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  if (student) client.setQueryData(STUDENT_QUERY_KEY, student);
  harness.client = client;
  await renderRouter(
    {
      _layout: () => (
        <AppProviders client={client}>
          <RootStack />
        </AppProviders>
      ),
      '(public)/index': Root,
      '(public)/entrar': SignIn,
      '(public)/confirmar-novo-email': ConfirmEmailChange,
      '(student)/conta': Account,
      '(student)/player': Player,
    },
    { initialUrl },
  );
  return client;
}
