import { QueryClient } from '@tanstack/react-query';

import { REQUEST_TIMEOUT_MS } from '../../api/client';
import * as sentry from '../../observability/sentry';
import type { ProgressEntry, VisitorStore } from '../../visitor/types';
import { checkVisitorStageComplete } from '../stageComplete';
import { fetchVisitorActivityKeys } from '../useStage';

jest.mock('../../observability/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../useStage', () => ({ fetchVisitorActivityKeys: jest.fn() }));

const keys = fetchVisitorActivityKeys as jest.Mock;
const client = new QueryClient();
const entry = (activityKey: string): ProgressEntry => ({ activityKey, outcome: 'completed', xp: 10 });
const storeWith = (progress: () => Promise<ProgressEntry[]>) => ({ progress }) as unknown as VisitorStore;

beforeEach(() => {
  keys.mockReset();
  (sentry.captureError as jest.Mock).mockClear();
});

describe('checkVisitorStageComplete (1.20)', () => {
  it('com todas as Atividades do Estágio no Progresso, true; faltando uma, false', async () => {
    keys.mockResolvedValue(['a1', 'a2']);
    expect(
      await checkVisitorStageComplete(
        client,
        storeWith(async () => [entry('a1'), entry('a2')]),
      ),
    ).toBe(true);
    expect(
      await checkVisitorStageComplete(
        client,
        storeWith(async () => [entry('a1')]),
      ),
    ).toBe(false);
    expect(sentry.captureError).not.toHaveBeenCalled();
  });

  it('a API falha: false, sem Sentry (o player mostra o erro)', async () => {
    keys.mockRejectedValue(new Error('500'));
    expect(
      await checkVisitorStageComplete(
        client,
        storeWith(async () => [entry('a1')]),
      ),
    ).toBe(false);
    expect(sentry.captureError).not.toHaveBeenCalled();
  });

  it('a loja falha: false, e a falha vai ao Sentry', async () => {
    keys.mockResolvedValue(['a1']);
    const failure = new Error('loja quebrada');
    expect(
      await checkVisitorStageComplete(
        client,
        storeWith(async () => {
          throw failure;
        }),
      ),
    ).toBe(false);
    expect(sentry.captureError).toHaveBeenCalledWith(failure);
  });

  it('a conferência inteira passa do prazo único: false', async () => {
    jest.useFakeTimers();
    try {
      keys.mockReturnValue(new Promise(() => {}));
      const result = checkVisitorStageComplete(
        client,
        storeWith(async () => [entry('a1')]),
      );
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      expect(await result).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
