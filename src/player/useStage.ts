import { useQuery, type QueryClient } from '@tanstack/react-query';

import { getAt, type GetData } from '../api/client';

/** A Unidade do Lançamento 1. */
export const UNIT_KEY = 'unit-1';
/** O Visitante joga o Estágio da posição 0 (o Estágio 1). */
export const VISITOR_STAGE_INDEX = 0;

/** Sem Expressões Úteis: a mesma lista a cada render. */
const EMPTY: Unit['usefulExpressions'] = [];

export type Unit = GetData<'/api/v1/units/{unitKey}'>;
export type Stage = GetData<'/api/v1/units/{unitKey}/stages/{stageKey}'>;

/** A consulta da Unidade, a mesma do player e da boas-vindas (o cache é um só). */
function unitQuery(unitKey: string) {
  return {
    queryKey: ['unit', unitKey] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => getAt('/api/v1/units/{unitKey}', { unitKey }, { signal }),
    // O conteúdo publicado não muda durante o Estágio: sem nova busca em segundo plano.
    staleTime: Infinity,
  };
}

/** A consulta do Estágio `stageKey` da Unidade. */
function stageQuery(unitKey: string, stageKey: string | undefined) {
  return {
    queryKey: ['stage', unitKey, stageKey] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      getAt('/api/v1/units/{unitKey}/stages/{stageKey}', { unitKey, stageKey: stageKey ?? '' }, { signal }),
    staleTime: Infinity,
  };
}

/**
 * As `activityKey` do Estágio do Visitante, pelo mesmo cache do `useStage`
 * (a boas-vindas confere se o Estágio 1 já está completo, 1.20). Falha da API
 * ou Unidade sem o Estágio sobe para quem chamou.
 */
export async function fetchVisitorActivityKeys(
  client: QueryClient,
  unitKey = UNIT_KEY,
  stageIndex = VISITOR_STAGE_INDEX,
): Promise<string[]> {
  // `always`: sem rede, a consulta falha (com o timeout do cliente) em vez de pausar para sempre.
  const unit = await client.fetchQuery({ ...unitQuery(unitKey), networkMode: 'always' });
  const stageKey = Array.isArray(unit?.stages) ? unit.stages[stageIndex]?.stageKey : undefined;
  if (stageKey === undefined) throw new Error('Unidade sem o Estágio do Visitante');
  const stage = await client.fetchQuery({ ...stageQuery(unitKey, stageKey), networkMode: 'always' });
  return Array.isArray(stage?.activities) ? stage.activities.map((activity) => activity.activityKey) : [];
}

/**
 * Carrega `GET /units/{unitKey}` e, dele, o Estágio da posição `stageIndex`
 * e as Expressões Úteis da Unidade.
 * O `error` é o primeiro que aparecer; `retry` refaz o que falhou.
 */
export function useStage(unitKey = UNIT_KEY, stageIndex = VISITOR_STAGE_INDEX) {
  const unit = useQuery(unitQuery(unitKey));
  // Resposta fora do contrato (sem `stages`) vira "Estágio ausente", sem quebrar a tela.
  const stages = Array.isArray(unit.data?.stages) ? unit.data.stages : [];
  const stageKey = stages[stageIndex]?.stageKey;
  const stage = useQuery({ ...stageQuery(unitKey, stageKey), enabled: stageKey !== undefined });

  // Unidade sem o Estágio pedido: não há o que jogar.
  const missingStage = unit.isSuccess && stageKey === undefined;
  const expressions = unit.data?.usefulExpressions;
  return {
    stage: stage.data,
    /** As Expressões Úteis da Unidade (1.14), para o `ExpressionsProvider`. */
    usefulExpressions: Array.isArray(expressions) ? expressions : EMPTY,
    stageNumber: stageIndex + 1,
    error: unit.error ?? stage.error ?? null,
    missingStage,
    loading: !missingStage && (unit.isPending || stage.isPending) && !unit.error && !stage.error,
    /** A consulta que falhou está buscando de novo (TENTAR DE NOVO ocupado). */
    fetching: unit.isError || missingStage ? unit.isFetching : stage.isFetching,
    retry: () => {
      if (unit.isError || missingStage) void unit.refetch();
      else void stage.refetch();
    },
  };
}
