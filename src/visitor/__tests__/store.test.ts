import { createVisitorStore, visitorStore } from '../store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => global.__resetSqlite());

describe('loja do Visitante (expo-sqlite)', () => {
  it('primeira vez: gera e grava um deviceId UUID v4', async () => {
    const id = await visitorStore.deviceId();
    expect(id).toMatch(UUID);
    expect(await visitorStore.deviceId()).toBe(id);
  });

  it('segunda abertura: uma loja nova sobre o mesmo banco acha o mesmo deviceId', async () => {
    const first = await createVisitorStore().deviceId();
    const reopened = await createVisitorStore().deviceId();
    expect(reopened).toBe(first);
  });

  it('chamadas ao mesmo tempo ficam com um deviceId só', async () => {
    const store = createVisitorStore();
    const ids = await Promise.all([store.deviceId(), store.deviceId(), createVisitorStore().deviceId()]);
    expect(new Set(ids).size).toBe(1);
  });

  it('variáveis: grava, troca e lê, inclusive o pronome', async () => {
    const store = createVisitorStore();
    await store.setVariable('name', 'Júlia');
    await store.setVariable('pronoun', 'she');
    await store.setVariable('name', 'Ju');
    expect(await store.getVariable('name')).toBe('Ju');
    expect(await store.getVariable('pronoun')).toBe('she');
    expect(await store.getVariable('country')).toBeNull();
    expect(await store.variables()).toEqual({ name: 'Ju', pronoun: 'she' });
  });

  it('Progresso: só a primeira conclusão vale, e avisa quem escuta', async () => {
    const store = createVisitorStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    await store.recordProgress({ activityKey: 'a1', outcome: 'completed', xp: 10 });
    await store.recordProgress({ activityKey: 'a1', outcome: 'completed', xp: 0 });
    await store.recordProgress({ activityKey: 'a2', outcome: 'skipped', xp: 0 });
    expect(await store.progress()).toEqual([
      { activityKey: 'a1', outcome: 'completed', xp: 10 },
      { activityKey: 'a2', outcome: 'skipped', xp: 0 },
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('Progresso aceita viewed', async () => {
    const store = createVisitorStore();
    await store.recordProgress({ activityKey: 'a1', outcome: 'viewed', xp: 0 });
    expect(await store.progress()).toEqual([{ activityKey: 'a1', outcome: 'viewed', xp: 0 }]);
  });

  it('recibos: só o primeiro por Atividade vale, e sobrevivem a uma loja nova', async () => {
    const store = createVisitorStore();
    expect(await store.receipts()).toEqual([]);
    await store.recordReceipt('a1', 'v1.primeiro.x');
    await store.recordReceipt('a1', 'v1.segundo.x');
    await store.recordReceipt('a2', 'v1.outro.x');
    const expected = [
      { activityKey: 'a1', receipt: 'v1.primeiro.x' },
      { activityKey: 'a2', receipt: 'v1.outro.x' },
    ];
    expect(await store.receipts()).toEqual(expected);
    expect(await createVisitorStore().receipts()).toEqual(expected);
  });

  it('banco antigo, sem a tabela receipts: a tabela nasce na abertura e o resto fica', async () => {
    const { openDatabaseAsync } = jest.requireMock('expo-sqlite') as {
      openDatabaseAsync: (name: string) => Promise<{ execAsync: (sql: string) => Promise<void> }>;
    };
    const legacy = await openDatabaseAsync('legado.db');
    await legacy.execAsync(`
      DROP TABLE IF EXISTS receipts;
      CREATE TABLE IF NOT EXISTS progress (activity_key TEXT PRIMARY KEY NOT NULL, outcome TEXT NOT NULL, xp INTEGER NOT NULL);
      INSERT OR IGNORE INTO progress VALUES ('a1', 'completed', 10);
    `);
    const store = createVisitorStore(() => openDatabaseAsync('legado.db') as never);
    await store.recordReceipt('a1', 'v1.r.x');
    expect(await store.receipts()).toEqual([{ activityKey: 'a1', receipt: 'v1.r.x' }]);
    expect(await store.progress()).toEqual([{ activityKey: 'a1', outcome: 'completed', xp: 10 }]);
  });
});
