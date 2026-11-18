// Eventos do Visitante (história 1.20, AD-14): o App avisa cada toque que abre o
// player (`VISITOR_SESSION_STARTED`, `openPlayer`) e de cada Atividade (`ACTIVITY_STARTED`) pela rota
// `POST /api/v1/visitor/events`. Só o `deviceId`, o `versionId` e a
// `activityKey` saem do aparelho: nunca nome, país, texto livre, Resultado,
// tempo, `unitKey`, `stageKey` ou hora (a hora é a do servidor).
//
// O envio não espera nem bloqueia a tela, e não repete: sem rede, o evento é
// descartado (sem fila); outra falha vai ao Sentry e não aparece ao Visitante.
import { ApiError, postAccepted, type AcceptedBody } from '../api/client';
import { NETWORK_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';
import { visitorStore } from './store';
import type { VisitorStore } from './types';

export const EVENTS_PATH = '/api/v1/visitor/events';

type Body = AcceptedBody<typeof EVENTS_PATH>;

/** Um evento do Visitante, sem o `deviceId` (a loja o põe). */
export type VisitorEvent =
  { type: 'VISITOR_SESSION_STARTED' } | { type: 'ACTIVITY_STARTED'; versionId: string; activityKey: string };

/** O corpo da rota, só com os campos do contrato (corpo fechado). */
function bodyOf(event: VisitorEvent, deviceId: string): Body {
  return event.type === 'ACTIVITY_STARTED'
    ? { type: event.type, deviceId, versionId: event.versionId, activityKey: event.activityKey }
    : { type: event.type, deviceId };
}

/**
 * Envia o evento sem esperar. `online: false` descarta na hora; uma falha de
 * rede também é descartada em silêncio; o resto (API, loja) vai ao Sentry.
 */
export function sendVisitorEvent(store: VisitorStore, event: VisitorEvent, online = true): void {
  if (!online) return;
  void (async () => {
    try {
      const deviceId = await store.deviceId();
      await postAccepted(EVENTS_PATH, bodyOf(event, deviceId));
    } catch (error) {
      if (error instanceof ApiError && error.code === NETWORK_ERROR) return;
      captureError(error);
    }
  })();
}

/**
 * Abre o player do Estágio do Visitante. Cada toque que o abre (EXPERIMENTAR
 * AGORA, "Refazer o Estágio 1") é uma sessão (AD-14): o `VISITOR_SESSION_STARTED`
 * sai antes de navegar. Recarregar a página ou abrir o link direto não conta.
 * Sem checar a rede antes: uma falha de rede do envio o descarta.
 */
export function openPlayer(
  router: { navigate: (path: '/player') => void; replace: (path: '/player') => void },
  how: 'navigate' | 'replace' = 'navigate',
  store: VisitorStore = visitorStore,
): void {
  sendVisitorEvent(store, { type: 'VISITOR_SESSION_STARTED' });
  router[how]('/player');
}
