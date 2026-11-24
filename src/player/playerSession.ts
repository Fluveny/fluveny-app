// Quem joga o player (2.4): o Visitante (rotas `/visitor/*`, `deviceId`,
// recibos e Progresso no aparelho) ou o Aluno com sessão (rotas
// `/students/me/*`, Progresso e XP no servidor). O modo é fixado quando o
// player abre e não muda até ele fechar: uma sessão que vence no meio nunca
// faz a próxima chamada sair pela rota do Visitante (o 401 leva a Entrar).
//
// O player põe o modo, o relógio de estudo e o aviso de gravação confirmada
// num contexto, que o `useEvaluation` lê dentro dos Tipos. Fora do player (os
// testes de uma Atividade solta), vale o Visitante, com o relógio próprio do
// `useEvaluation`.
import { createContext, useContext } from 'react';

import { ApiError } from '../api/client';
import { GUARDIAN_CONSENT_PENDING, STAGE_LOCKED } from '../api/errors';

import type { StudyClock } from './studyClock';

export type PlayerMode = 'visitor' | 'student';

export type PlayerSession = {
  mode: PlayerMode;
  /** O relógio de estudo da Atividade na tela; `null` fora do player. */
  clock: StudyClock | null;
  /** O servidor confirmou uma gravação do Aluno (Tentativa ou conclusão): o XP é relido. */
  onSaved: () => void;
  /** A API recusou a gravação do Aluno com `409 STAGE_LOCKED` (2.5): o player troca a tela pelo aviso. */
  onStageLocked: () => void;
  /**
   * A API recusou a gravação do Aluno com `403 GUARDIAN_CONSENT_PENDING` (2.11): o
   * player passa ao modo Visitante, na mesma Atividade, e relê o perfil.
   */
  onGuardianPending?: () => void;
  /**
   * O refazer (2.7): a resposta com este `attemptId` leva `replay: true`? Só na
   * primeira resposta de uma abertura de Atividade que já tinha registro do
   * Aluno (e nos reenvios dela, com o mesmo id). A primeira chamada da abertura
   * fixa o id; as outras respostas (Tentar de novo) e o Visitante dão `false`.
   */
  claimReplay: (activityKey: string, attemptId: string) => boolean;
};

const noop = () => {};

/** Fora do player: o Visitante, sem relógio do player. */
export const VISITOR_SESSION: PlayerSession = {
  mode: 'visitor',
  clock: null,
  onSaved: noop,
  onStageLocked: noop,
  claimReplay: () => false,
};

export const PlayerSessionContext = createContext<PlayerSession>(VISITOR_SESSION);

/** A recusa da sequência (2.5): só o Aluno a recebe, e ela não se repete nem vai ao Sentry. */
export function isStageLocked(error: unknown): boolean {
  return error instanceof ApiError && error.code === STAGE_LOCKED;
}

/** O modo, o relógio e o aviso de gravação do player em volta. */
export const usePlayerSession = () => useContext(PlayerSessionContext);

/** O adolescente à espera do responsável (2.11): a gravação do Aluno foi recusada; o player troca para Visitante. */
export function isGuardianPending(error: unknown): boolean {
  return error instanceof ApiError && error.code === GUARDIAN_CONSENT_PENDING;
}
