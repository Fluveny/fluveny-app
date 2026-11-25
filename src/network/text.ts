import { messageFor, NETWORK_ERROR } from '../api/errors';

/** Texto da faixa "Sem conexão" (EXPERIENCE.md, Estados), o mesmo do `NETWORK_ERROR`. */
export const OFFLINE_TEXT = messageFor(NETWORK_ERROR);

/** A ação que precisa da rede, sem ela (o rodapé do player, o botão do painel, 2.5). */
export const OFFLINE_LABEL = 'NO CONNECTION';
