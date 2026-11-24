// Consentimento do responsável (2.11): reenvio, confirmação e migração, uma linha da matriz por teste.
import { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { captureError } from '../../observability/sentry';
import { createVisitorStore } from '../../visitor/store';
import {
  confirmGuardianConsent,
  guardianPending,
  migrateAfterConsent,
  resendGuardianConsent,
  resetConsentMigration,
  waitText,
} from '../guardianConsent';

jest.mock('../../observability/sentry', () => ({ captureError: jest.fn() }));

const problem = (code: string, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  });

type Call = { url: string; body: unknown };
let calls: Call[] = [];
let respond: () => Response | Promise<Response>;

const os = Platform.OS;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  Platform.OS = 'web';
  global.__resetSqlite();
  resetConsentMigration();
  jest.mocked(captureError).mockClear();
  calls = [];
  respond = () => new Response(null, { status: 202 });
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    return respond();
  }) as jest.Mock;
});

afterEach(() => {
  Platform.OS = os;
});

describe('guardianPending', () => {
  it('só o PENDING_GUARDIAN_CONSENT', () => {
    expect(guardianPending({ status: 'PENDING_GUARDIAN_CONSENT' })).toBe(true);
    expect(guardianPending({ status: 'ACTIVE' })).toBe(false);
    expect(guardianPending(null)).toBe(false);
  });
});

describe('reenviar ao responsável', () => {
  const client = new QueryClient();

  it('202 sem corpo: enviado', async () => {
    expect(await resendGuardianConsent(client)).toEqual({ kind: 'sent' });
    expect(calls[0]!.url).toMatch(/\/students\/me\/guardian-consent\/resend$/);
    expect(calls[0]!.body).toBeUndefined();
  });

  it('corrigir: manda {guardianEmail}', async () => {
    await resendGuardianConsent(client, 'pai@exemplo.test');
    expect(calls[0]!.body).toEqual({ guardianEmail: 'pai@exemplo.test' });
  });

  it('429 com Retry-After: a espera em segundos', async () => {
    respond = () => problem('TOO_MANY_REQUESTS', 429, { 'Retry-After': '42' });
    expect(await resendGuardianConsent(client)).toEqual({ kind: 'throttled', retryAfter: 42 });
    expect(waitText(42)).toBe('Espere 42 segundos para enviar de novo.');
    expect(waitText(90)).toBe('Espere 2 minutos para enviar de novo.');
  });

  it('409: a conta já está ativa e o perfil é relido', async () => {
    respond = () => problem('GUARDIAN_CONSENT_NOT_PENDING', 409);
    const spy = jest.spyOn(client, 'invalidateQueries');
    expect(await resendGuardianConsent(client)).toEqual({ kind: 'not-pending' });
    expect(spy).toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED: o e-mail recusado', async () => {
    respond = () => problem('VALIDATION_FAILED', 400);
    expect(await resendGuardianConsent(client, 'x@y.z')).toEqual({ kind: 'invalid-email' });
  });
});

describe('confirmar (página do responsável)', () => {
  it('200: confirmado; 400: link inválido; rede: erro', async () => {
    respond = () => new Response(JSON.stringify({ data: { status: 'CONFIRMED' } }), { status: 200 });
    expect(await confirmGuardianConsent('t')).toEqual({ kind: 'confirmed' });
    respond = () => problem('GUARDIAN_CONSENT_TOKEN_INVALID', 400);
    expect(await confirmGuardianConsent('t')).toEqual({ kind: 'invalid' });
    respond = () => Promise.reject(new TypeError('rede'));
    expect(await confirmGuardianConsent('t')).toEqual({ kind: 'error', code: 'NETWORK_ERROR' });
  });
});

describe('migração depois do consentimento', () => {
  const migrated = () => new Response(JSON.stringify({ data: { migrated: 2, discarded: 0 } }), { status: 200 });

  it('sem recibos: nenhuma chamada', async () => {
    expect(await migrateAfterConsent(new QueryClient(), createVisitorStore())).toEqual({ kind: 'nothing' });
    expect(calls).toHaveLength(0);
  });

  it('com recibos: {deviceId, receipts} sem repetidos; depois do 200, a loja fica só com o deviceId', async () => {
    const store = createVisitorStore();
    const deviceId = await store.deviceId();
    await store.recordReceipt('a1', 'r1');
    await store.recordReceipt('a2', 'r2');
    await store.recordProgress({ activityKey: 'a1', outcome: 'completed', xp: 10 });
    respond = migrated;
    expect(await migrateAfterConsent(new QueryClient(), store)).toEqual({
      kind: 'migrated',
      migrated: 2,
      discarded: 0,
    });
    expect(calls[0]!.body).toEqual({ deviceId, receipts: ['r1', 'r2'] });
    expect(await store.receipts()).toEqual([]);
    expect(await store.progress()).toEqual([]);
    expect(await store.deviceId()).toBe(deviceId);
  });

  it('duas leituras ao mesmo tempo: um POST só (trava)', async () => {
    const store = createVisitorStore();
    await store.recordReceipt('a1', 'r1');
    respond = migrated;
    const client = new QueryClient();
    await Promise.all([migrateAfterConsent(client, store), migrateAfterConsent(client, store)]);
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['rede', () => Promise.reject(new TypeError('rede'))],
    ['403', () => problem('GUARDIAN_CONSENT_PENDING', 403)],
    ['500', () => problem('INTERNAL_ERROR', 500)],
  ])('%s: a loja fica intacta, sem Sentry, e a próxima tenta de novo', async (_name, fail) => {
    const store = createVisitorStore();
    await store.recordReceipt('a1', 'r1');
    respond = fail as () => Response;
    expect((await migrateAfterConsent(new QueryClient(), store)).kind).toBe('failed');
    expect(await store.receipts()).toHaveLength(1);
    expect(captureError).not.toHaveBeenCalled();
    respond = migrated;
    expect((await migrateAfterConsent(new QueryClient(), store)).kind).toBe('migrated');
    expect(calls).toHaveLength(2);
  });
});
