import { messageFor, NETWORK_ERROR } from '../api/errors';

/** Texto da faixa "Sem conexão" (EXPERIENCE.md, Estados), o mesmo do `NETWORK_ERROR`. */
export const OFFLINE_TEXT = messageFor(NETWORK_ERROR);
