// Registro dos Tipos de Atividade do player (história 1.10). Cada Tipo (1.11 a
// 1.19) troca o seu `PENDING` por um componente. Um `type` sem componente, ou
// que o App não conhece, cai no cartão "Atividade em preparação".
import type { ComponentType } from 'react';

import type { GetData } from '../api/client';
import type { ContentText } from '../renderer';
import type { ButtonVariant, FeedbackTone } from '../ui';
import type { Outcome } from '../visitor/types';
import type { CompletionResult, UngradedOutcome } from './completion';
import { CardsActivity } from './types/CardsActivity';
import { ChoiceActivity } from './types/ChoiceActivity';
import { DialogueActivity } from './types/DialogueActivity';
import { ExpressionActivity } from './types/ExpressionActivity';
import { FreeActivity } from './types/FreeActivity';
import { GapsActivity } from './types/GapsActivity';
import { MatchActivity } from './types/MatchActivity';
import { SpeechActivity } from './types/SpeechActivity';
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
  /** Falha da última ação (texto de `messageFor`), acima do botão. */
  message?: string;
  /**
   * `link`: a ação secundária como link de texto, sem botão primário no rodapé
   * ("NÃO POSSO FALAR AGORA" da Fala, 1.15). Padrão: o botão primário.
   */
  variant?: 'primary' | 'link';
};

/** Um botão da folha de feedback. */
export type SheetAction = {
  label: string;
  variant: Extract<ButtonVariant, 'primary' | 'success' | 'ghost'>;
  onPress: () => void;
  busy?: boolean;
  /** A ação chama o servidor: sem rede, a moldura a troca por "SEM CONEXÃO". */
  network?: boolean;
};

/**
 * A folha de feedback que a Atividade pede. Ela entra no lugar do rodapé; a
 * moldura renderiza as justificativas e a resposta esperada com as Variáveis
 * do Aluno.
 */
export type SheetSpec = {
  tone: FeedbackTone;
  /** "Resultado: n de m itens · x%", quando há mais de um item. */
  result?: string;
  /** XP da primeira tentativa, para o selo "+XP" do Acerto. */
  xpGain?: number;
  /** As linhas da caixa "RESPOSTA ESPERADA" (tom `review`). */
  expected?: ContentText[];
  /** Justificativas dos itens, cruas. */
  justifications?: ContentText[];
  /** Falha da última ação (texto de `messageFor`). */
  error?: string;
  /** A transcrição da Fala, como o aluno disse: "A gente ouviu: “…”" (1.15). */
  heard?: string;
  actions: SheetAction[];
};

/**
 * O que a Atividade concluída grava no Progresso. `recorded`: a conclusão
 * `viewed`/`skipped` já passou pela rota `completions` (`complete`, 1.18), e o
 * player só grava o Progresso, sem concluir de novo.
 */
export type ActivityResult = { outcome: Outcome; xp: number; recorded?: boolean };

/**
 * Contrato entre o player e um Tipo. A Atividade desenha o conteúdo e chama
 * `setFooter` sempre que a ação do rodapé muda, e `setSheet` para abrir (ou,
 * com `null`, fechar) a folha de feedback no lugar do rodapé. A moldura aplica
 * a regra de rede por cima ("SEM CONEXÃO"), então nenhum Tipo trata a rede.
 * `advance` passa para a próxima Atividade; com `result`, grava o Progresso
 * antes. `versionId` é o do Estágio exibido (vai na Tentativa).
 */
export type ActivityProps = {
  activity: ActivityView;
  versionId: string;
  setFooter: (footer: FooterAction | null) => void;
  setSheet: (sheet: SheetSpec | null) => void;
  /** Termina quando o player avançou ou desistiu (falha da conclusão: a tela fica). */
  advance: (result?: ActivityResult) => void | Promise<void>;
  /**
   * Conclui (`viewed`/`skipped`) pela rota `completions` sem avançar e devolve
   * o Resultado (a Resposta Livre mostra a `modelAnswer` antes do CONTINUAR,
   * 1.18). Sem Resultado, `null`: na falha da API, a moldura mostra
   * `messageFor(code)` no rodapé; com outra conclusão em curso ou com o player
   * já fechado, volta `null` sem mensagem. Quem usa avança depois com
   * `recorded: true`.
   */
  complete?: (outcome: UngradedOutcome) => Promise<CompletionResult | null>;
  /** Esquece a falha da conclusão mostrada no rodapé (a Resposta Livre ao entrar no Extra Help, 1.18). */
  clearCompletionError?: () => void;
};

/**
 * O componente de um Tipo. `bleed`: o conteúdo ocupa a largura toda, sem o
 * recuo lateral da moldura (a cena do Diálogo tem o próprio recuo).
 */
export type ActivityComponent = ComponentType<ActivityProps> & { bleed?: boolean };

/** Tipo ainda sem componente no App. */
export const PENDING = 'PENDING' as const;

export type ActivityRegistry = Record<string, ActivityComponent | typeof PENDING>;

/** Todos os Tipos do contrato; o teste do registro confere contra o `openapi.json`. */
export const registry: { [T in ActivityType]: ActivityComponent | typeof PENDING } & ActivityRegistry = {
  cards: CardsActivity,
  choice: ChoiceActivity,
  dialogue: DialogueActivity,
  expression: ExpressionActivity,
  free: FreeActivity,
  match: MatchActivity,
  gaps: GapsActivity,
  speech: SpeechActivity,
};

/** O componente do Tipo, ou o cartão "Atividade em preparação". */
export function resolveActivity(type: string, from: ActivityRegistry = registry): ActivityComponent {
  const entry = Object.prototype.hasOwnProperty.call(from, type) ? from[type] : undefined;
  return entry && entry !== PENDING ? entry : PendingActivity;
}
