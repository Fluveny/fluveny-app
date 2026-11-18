import { createVisitorStore as createWebStore } from '../store.web';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('loja do Visitante no web (localStorage)', () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  }

  it('deviceId sobrevive a uma loja nova sobre o mesmo storage', async () => {
    const storage = memoryStorage();
    const id = await createWebStore(storage).deviceId();
    expect(id).toMatch(UUID);
    expect(await createWebStore(storage).deviceId()).toBe(id);
  });

  it('variáveis e Progresso com a mesma regra do nativo', async () => {
    const store = createWebStore(memoryStorage());
    await store.setVariable('pronoun', 'they');
    await store.recordProgress({ activityKey: 'a1', outcome: 'completed', xp: 10 });
    await store.recordProgress({ activityKey: 'a1', outcome: 'skipped', xp: 0 });
    expect(await store.variables()).toEqual({ pronoun: 'they' });
    expect(await store.progress()).toEqual([{ activityKey: 'a1', outcome: 'completed', xp: 10 }]);
  });

  it('storage que lança: segue em memória', async () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    const store = createWebStore(broken);
    const id = await store.deviceId();
    expect(await store.deviceId()).toBe(id);
  });

  it('getItem funciona e setItem lança: o deviceId fica o mesmo, vindo da memória', async () => {
    const readOnly = {
      getItem: () => null,
      setItem: () => {
        throw new Error('cota cheia');
      },
    };
    const store = createWebStore(readOnly);
    const id = await store.deviceId();
    expect(await store.deviceId()).toBe(id);
    await store.setVariable('name', 'Júlia');
    expect(await store.getVariable('name')).toBe('Júlia');
  });

  it('Progresso (1.20): Resultado e tempo saneados; entradas antigas sem eles continuam lidas', async () => {
    const storage = memoryStorage();
    storage.setItem(
      'fluveny:visitor:progress',
      JSON.stringify([
        { activityKey: 'antiga', outcome: 'completed', xp: 10 },
        { activityKey: 'torta', outcome: 'viewed', xp: 0, resultPct: 'x', studyTimeMs: null },
      ]),
    );
    const store = createWebStore(storage);
    await store.recordProgress({
      activityKey: 'nova',
      outcome: 'completed',
      xp: 7,
      resultPct: 66.6,
      studyTimeMs: 1500.2,
    });
    await store.recordProgress({ activityKey: 'nova', outcome: 'completed', xp: 10, resultPct: 100, studyTimeMs: 1 });
    const expected = [
      { activityKey: 'antiga', outcome: 'completed', xp: 10 },
      { activityKey: 'torta', outcome: 'viewed', xp: 0 },
      { activityKey: 'nova', outcome: 'completed', xp: 7, resultPct: 67, studyTimeMs: 1500 },
    ];
    expect(await store.progress()).toEqual(expected);
    expect(await createWebStore(storage).progress()).toEqual(expected);
  });

  it('dado torto no storage vira vazio', async () => {
    const storage = memoryStorage();
    storage.setItem('fluveny:visitor:progress', '{nope');
    storage.setItem('fluveny:visitor:variables', '[1,2]');
    const store = createWebStore(storage);
    expect(await store.progress()).toEqual([]);
    expect(await store.variables()).toEqual({});
  });

  it('recibos: só o primeiro por Atividade, na chave fluveny:visitor:receipts', async () => {
    const storage = memoryStorage();
    const store = createWebStore(storage);
    await store.recordReceipt('a1', 'v1.primeiro.x');
    await store.recordReceipt('a1', 'v1.segundo.x');
    await store.recordProgress({ activityKey: 'a2', outcome: 'viewed', xp: 0 });
    expect(await store.receipts()).toEqual([{ activityKey: 'a1', receipt: 'v1.primeiro.x' }]);
    expect(await createWebStore(storage).receipts()).toEqual([{ activityKey: 'a1', receipt: 'v1.primeiro.x' }]);
    expect(JSON.parse(storage.getItem('fluveny:visitor:receipts')!)).toEqual([
      { activityKey: 'a1', receipt: 'v1.primeiro.x', createdAt: expect.any(Number) },
    ]);
    expect(await store.progress()).toEqual([{ activityKey: 'a2', outcome: 'viewed', xp: 0 }]);
  });

  it('recibos tortos no storage viram vazio', async () => {
    const storage = memoryStorage();
    storage.setItem('fluveny:visitor:receipts', '[{"activityKey":1},"x"]');
    expect(await createWebStore(storage).receipts()).toEqual([]);
  });

  it('aviso visto (1.15): na chave fluveny:visitor:seen, sobrevive a uma loja nova e ignora dado torto', async () => {
    const storage = memoryStorage();
    const store = createWebStore(storage);
    expect(await store.seen('speech-privacy')).toBe(false);
    await store.markSeen('speech-privacy');
    await store.markSeen('speech-privacy');
    expect(await createWebStore(storage).seen('speech-privacy')).toBe(true);
    expect(JSON.parse(storage.getItem('fluveny:visitor:seen')!)).toEqual(['speech-privacy']);
    expect(await store.variables()).toEqual({});
    storage.setItem('fluveny:visitor:seen', '{"speech-privacy":true}');
    expect(await createWebStore(storage).seen('speech-privacy')).toBe(false);
  });
});
