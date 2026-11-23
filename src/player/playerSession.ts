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

import type { StudyClock } from './studyClock';

export type PlayerMode = 'visitor' | 'student';

export type PlayerSession = {
  mode: PlayerMode;
  /** O relógio de estudo da Atividade na tela; `null` fora do player. */
  clock: StudyClock | null;
  /** O servidor confirmou uma gravação do Aluno (Tentativa ou conclusão): o XP é relido. */
  onSaved: () => void;
};

const noop = () => {};

/** Fora do player: o Visitante, sem relógio do player. */
export const VISITOR_SESSION: PlayerSession = { mode: 'visitor', clock: null, onSaved: noop };

export const PlayerSessionContext = createContext<PlayerSession>(VISITOR_SESSION);

/** O modo, o relógio e o aviso de gravação do player em volta. */
export const usePlayerSession = () => useContext(PlayerSessionContext);
