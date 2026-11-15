import { useEffect, useState } from 'react';

import { captureError } from '../observability/sentry';
import { visitorStore } from './store';
import { totalXp, type ProgressEntry, type VisitorStore } from './types';

type Snapshot = Omit<VisitorState, 'xp' | 'store'>;

async function read(store: VisitorStore): Promise<Snapshot> {
  try {
    const [deviceId, progress, variables] = await Promise.all([store.deviceId(), store.progress(), store.variables()]);
    return { ready: true, deviceId, progress, variables };
  } catch (error) {
    captureError(error);
    return { ready: true, deviceId: null, progress: [], variables: {} };
  }
}

export type VisitorState = {
  /** `false` até a primeira leitura da loja. */
  ready: boolean;
  deviceId: string | null;
  progress: ProgressEntry[];
  /** Soma do `xp` do Progresso (o chip de XP do player). */
  xp: number;
  variables: Record<string, string>;
  store: VisitorStore;
};

/**
 * O Visitante deste aparelho: garante o `deviceId` (gerado uma vez) e
 * acompanha o Progresso e as variáveis. Falha da loja vai ao Sentry, e a tela
 * segue com o estado vazio.
 */
export function useVisitor(store: VisitorStore = visitorStore): VisitorState {
  const [state, setState] = useState<Snapshot>({
    ready: false,
    deviceId: null,
    progress: [],
    variables: {},
  });

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      read(store).then((next) => {
        if (alive) setState(next);
      });
    refresh();
    const unsubscribe = store.subscribe(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [store]);

  return { ...state, xp: totalXp(state.progress), store };
}
