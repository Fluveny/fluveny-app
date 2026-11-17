import { useQuery } from '@tanstack/react-query';

import { getAt, type GetData } from '../api/client';

/** A Unidade do Lançamento 1. */
export const UNIT_KEY = 'unit-1';
/** O Visitante joga o Estágio da posição 0 (o Estágio 1). */
export const VISITOR_STAGE_INDEX = 0;

/** Sem Expressões Úteis: a mesma lista a cada render. */
const EMPTY: Unit['usefulExpressions'] = [];

export type Unit = GetData<'/api/v1/units/{unitKey}'>;
export type Stage = GetData<'/api/v1/units/{unitKey}/stages/{stageKey}'>;

/**
 * Carrega `GET /units/{unitKey}` e, dele, o Estágio da posição `stageIndex`
 * e as Expressões Úteis da Unidade.
 * O `error` é o primeiro que aparecer; `retry` refaz o que falhou.
 */
export function useStage(unitKey = UNIT_KEY, stageIndex = VISITOR_STAGE_INDEX) {
  const unit = useQuery({
    queryKey: ['unit', unitKey],
    queryFn: ({ signal }) => getAt('/api/v1/units/{unitKey}', { unitKey }, { signal }),
    // O conteúdo publicado não muda durante o Estágio: sem nova busca em segundo plano.
    staleTime: Infinity,
  });
  // Resposta fora do contrato (sem `stages`) vira "Estágio ausente", sem quebrar a tela.
  const stages = Array.isArray(unit.data?.stages) ? unit.data.stages : [];
  const stageKey = stages[stageIndex]?.stageKey;
  const stage = useQuery({
    queryKey: ['stage', unitKey, stageKey],
    queryFn: ({ signal }) =>
      getAt('/api/v1/units/{unitKey}/stages/{stageKey}', { unitKey, stageKey: stageKey ?? '' }, { signal }),
    enabled: stageKey !== undefined,
    staleTime: Infinity,
  });

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
