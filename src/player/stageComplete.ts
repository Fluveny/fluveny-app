import type { QueryClient } from '@tanstack/react-query';

import { REQUEST_TIMEOUT_MS } from '../api/client';
import { captureError } from '../observability/sentry';
import { visitorStore } from '../visitor/store';
import type { VisitorStore } from '../visitor/types';
import { isStageComplete } from './stageStats';
import { fetchVisitorActivityKeys } from './useStage';

/**
 * "O Estágio 1 está completo no aparelho?" (1.20), a conferência da
 * boas-vindas e do `/convite`: as Atividades do Estágio (pelo cache do
 * `useStage`) contra o Progresso da loja do Visitante. Qualquer falha dá
 * `false`: a da API fica para o player mostrar; a da loja vai ao Sentry. A
 * conferência inteira tem um prazo único (`timeoutMs`); estourado, também `false`.
 */
export async function checkVisitorStageComplete(
  client: QueryClient,
  store: VisitorStore = visitorStore,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const check = Promise.all([
    fetchVisitorActivityKeys(client).catch(() => null),
    store.progress().catch((failure: unknown) => {
      captureError(failure);
      return null;
    }),
  ]).then(([keys, progress]) => (keys && progress ? isStageComplete(progress, keys) : false));
  try {
    return await Promise.race([check, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
