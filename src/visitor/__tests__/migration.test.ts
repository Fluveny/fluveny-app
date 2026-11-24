// Montagem dos campos do cadastro (2.6): uma linha da matriz por teste.
import { QueryClient } from '@tanstack/react-query';

import { DASHBOARD_QUERY_KEY } from '../../dashboard/dashboard';
import { captureError } from '../../observability/sentry';
import { PROGRESS_QUERY_KEY } from '../../player/studentProgress';
import { finishVisitorMigration, MAX_RECEIPTS, visitorSignupFields } from '../migration';
import { createVisitorStore } from '../store';

jest.mock('../../observability/sentry', () => ({ captureError: jest.fn() }));

beforeEach(() => {
  global.__resetSqlite();
  jest.mocked(captureError).mockClear();
});

describe('campos do cadastro vindos do aparelho (2.6)', () => {
  it('com recibos e país da lista: visitor na ordem gravada e country', async () => {
    const store = createVisitorStore();
    await store.setVariable('country', 'Brazil');
    for (let i = 0; i < 13; i += 1) await store.recordReceipt(`a${i}`, `r${i}`);
    const fields = await visitorSignupFields(store);
    expect(fields.country).toBe('Brazil');
    expect(fields.visitor).toEqual({
      deviceId: await store.deviceId(),
      receipts: Array.from({ length: 13 }, (_, i) => `r${i}`),
    });
  });

  it('sem recibos: sem visitor', async () => {
    expect(await visitorSignupFields(createVisitorStore())).toEqual({});
  });

  it('país fora da lista: sem country', async () => {
    const store = createVisitorStore();
    await store.setVariable('country', 'Atlantis');
    await store.recordReceipt('a1', 'r1');
    const fields = await visitorSignupFields(store);
    expect(fields).not.toHaveProperty('country');
    expect(fields.visitor?.receipts).toEqual(['r1']);
  });

  it('250 recibos, um com 1100 caracteres: o longo sai, vão os 200 primeiros', async () => {
    const store = createVisitorStore();
    const long = 'x'.repeat(1100);
    for (let i = 0; i < 250; i += 1) await store.recordReceipt(`a${i}`, i === 3 ? long : `r${i}`);
    const receipts = (await visitorSignupFields(store)).visitor!.receipts;
    expect(receipts).toHaveLength(MAX_RECEIPTS);
    expect(receipts).not.toContain(long);
    expect(receipts[3]).toBe('r4');
    expect(receipts.at(-1)).toBe('r200');
  });

  it('recibos repetidos vão uma vez', async () => {
    const store = createVisitorStore();
    await store.recordReceipt('a1', 'r1');
    await store.recordReceipt('a2', 'r1');
    expect((await visitorSignupFields(store)).visitor!.receipts).toEqual(['r1']);
  });
});

describe('limpeza depois do 201 (2.6)', () => {
  it('apaga a loja menos o deviceId e invalida painel e Progresso', async () => {
    const store = createVisitorStore();
    const id = await store.deviceId();
    await store.setVariable('name', 'Ana');
    await store.recordReceipt('a1', 'r1');
    await store.recordProgress({ activityKey: 'a1', outcome: 'completed', xp: 10 });
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await finishVisitorMigration(client, store);
    expect(await store.receipts()).toEqual([]);
    expect(await store.progress()).toEqual([]);
    expect(await store.variables()).toEqual({});
    expect(await store.deviceId()).toBe(id);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: DASHBOARD_QUERY_KEY });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: PROGRESS_QUERY_KEY });
  });

  it('clear lança: vai ao Sentry sem dados do recibo e não bloqueia', async () => {
    const store = createVisitorStore();
    const deviceId = await store.deviceId();
    const receipt = 'v1.recibo-secreto-123';
    await store.recordReceipt('a1', receipt);
    store.clear = jest.fn(async () => {
      throw new Error('disco cheio');
    });
    await expect(finishVisitorMigration(new QueryClient(), store)).resolves.toBeUndefined();
    expect(captureError).toHaveBeenCalledTimes(1);
    const reported = jest
      .mocked(captureError)
      .mock.calls.map(([error]) => `${String(error)} ${(error as Error).stack ?? ''} ${JSON.stringify(error)}`)
      .join(' ');
    expect(reported).not.toContain(receipt);
    expect(reported).not.toContain(deviceId);
  });
});
