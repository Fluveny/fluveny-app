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

  it('dado torto no storage vira vazio', async () => {
    const storage = memoryStorage();
    storage.setItem('fluveny:visitor:progress', '{nope');
    storage.setItem('fluveny:visitor:variables', '[1,2]');
    const store = createWebStore(storage);
    expect(await store.progress()).toEqual([]);
    expect(await store.variables()).toEqual({});
  });
});
