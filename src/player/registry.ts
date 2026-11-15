// Registro dos Tipos de Atividade do player (história 1.10). Cada Tipo (1.11 a
// 1.19) troca o seu `PENDING` por um componente. Um `type` sem componente, ou
// que o App não conhece, cai no cartão "Atividade em preparação".
import type { ComponentType } from 'react';

import type { GetData } from '../api/client';
import type { Outcome } from '../visitor/types';
import { PendingActivity } from './PendingActivity';

/** Uma Atividade da visão do aluno, como vem do `GET` do Estágio. */
export type ActivityView = GetData<'/api/v1/units/{unitKey}/stages/{stageKey}'>['activities'][number];

/** Os `type` que o contrato conhece. */
export type ActivityType = ActivityView['type'];

/** A ação única do rodapé do player. */
export type FooterAction = {
  /** Verbo curto ("CONTINUAR", "VERIFICAR"); o `Button` põe em caixa alta. */
  label: string;
  /** Resposta incompleta: o botão fica cinza e não dispara. */
  disabled?: boolean;
  /** Ação em andamento ("SALVANDO…"). */
  busy?: boolean;
  onPress: () => void;
};

/** O que a Atividade concluída grava no Progresso. */
export type ActivityResult = { outcome: Outcome; xp: number };

/**
 * Contrato entre o player e um Tipo. A Atividade desenha o conteúdo e chama
 * `setFooter` sempre que a ação do rodapé muda; a moldura aplica a regra de
 * rede por cima ("SEM CONEXÃO"), então nenhum Tipo trata a rede. `advance`
 * passa para a próxima Atividade; com `result`, grava o Progresso antes.
 */
export type ActivityProps = {
  activity: ActivityView;
  setFooter: (footer: FooterAction) => void;
  advance: (result?: ActivityResult) => void;
};

export type ActivityComponent = ComponentType<ActivityProps>;

/** Tipo ainda sem componente no App. */
export const PENDING = 'PENDING' as const;

export type ActivityRegistry = Record<string, ActivityComponent | typeof PENDING>;

/** Todos os Tipos do contrato. Nesta história, todos são `PENDING`. */
export const registry: { [T in ActivityType]: ActivityComponent | typeof PENDING } & ActivityRegistry = {
  choice: PENDING,
};

/** O componente do Tipo, ou o cartão "Atividade em preparação". */
export function resolveActivity(type: string, from: ActivityRegistry = registry): ActivityComponent {
  const entry = Object.prototype.hasOwnProperty.call(from, type) ? from[type] : undefined;
  return entry && entry !== PENDING ? entry : PendingActivity;
}
