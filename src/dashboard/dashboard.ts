// O painel do Aluno (2.5, FR-8 a FR-10, AD-9): a leitura `GET
// /students/me/dashboard` e a escolha da Unidade em foco. Todo número do painel
// (XP, Badges, Estágios n de total, Resultado médio, estado de cada Estágio e o
// `next`) vem da API: o App não calcula posição, desbloqueio nem média.
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { get, type GetData } from '../api/client';
import { totalXp, type ProgressEntry } from '../visitor/types';

export const DASHBOARD_PATH = '/api/v1/students/me/dashboard';

/** O painel no cache do TanStack Query; o sair (`client.clear()`) o apaga com o resto. */
export const DASHBOARD_QUERY_KEY = ['student', 'dashboard'] as const;

export type Dashboard = GetData<typeof DASHBOARD_PATH>;
export type DashboardUnit = Dashboard['units'][number];
export type DashboardStage = DashboardUnit['stages'][number];
export type DashboardNext = NonNullable<DashboardUnit['next']>;

/** A consulta do painel: relida ao montar a raiz e na volta ao primeiro plano, sem `retry`. */
export function dashboardQuery() {
  return {
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) => get(DASHBOARD_PATH, { signal }),
    retry: false,
    // Sem rede, falha na hora em vez de pausar: o painel do cache fica na tela.
    networkMode: 'always' as const,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: 'always' as const,
    // A volta da rede é do painel (`useOnline`, que também vale no nativo): uma releitura só.
    refetchOnReconnect: false,
  };
}

/** O painel do Aluno da sessão. */
export function useDashboard() {
  return useQuery(dashboardQuery());
}

/** Uma gravação do Aluno foi confirmada (ou recusada pela sequência): o painel é relido. */
export function invalidateDashboard(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
}

/** As Unidades da resposta, por `order`; fora do contrato, nenhuma. */
function unitsOf(dashboard: Dashboard | undefined): DashboardUnit[] {
  const units = Array.isArray(dashboard?.units) ? dashboard.units.filter(Boolean) : [];
  return [...units].sort((a, b) => a.order - b.order);
}

/**
 * A Unidade em foco: a primeira por `order` liberada (`comingSoon: false`) e
 * com `next`; se nenhuma tiver `next`, a última liberada. Sem Unidade liberada,
 * `undefined`. As outras liberadas esperam a sequência de Unidades (3.9).
 */
export function focusUnit(dashboard: Dashboard | undefined): DashboardUnit | undefined {
  const open = unitsOf(dashboard).filter((unit) => !unit.comingSoon);
  return open.find((unit) => unit.next) ?? open[open.length - 1];
}

/** As Unidades "em breve", por `order`. */
export function comingSoonUnits(dashboard: Dashboard | undefined): DashboardUnit[] {
  return unitsOf(dashboard).filter((unit) => unit.comingSoon);
}

/**
 * O painel do adolescente à espera do responsável (2.11): a estrutura vem da
 * API (que não tem Progresso dele), e os números saem da loja do aparelho, onde
 * ele joga como Visitante. Só o Estágio 1 da Unidade em foco abre; os outros
 * Estágios ficam travados [ASSUMPTION: limite ao Estágio 1]. Contam só as
 * entradas das Atividades do Estágio 1 (`stageOneKeys`, do conteúdo); o Estágio
 * conclui quando todas estão na loja. Sem as chaves ainda, nada conta.
 */
export function pendingDashboard(
  data: Dashboard,
  progress: readonly ProgressEntry[],
  stageOneKeys: readonly string[] | undefined,
): Dashboard {
  const focus = focusUnit(data);
  const keys = new Set(stageOneKeys ?? []);
  const entries = progress.filter((entry) => keys.has(entry.activityKey));
  const done = entries.length;
  const total = keys.size;
  const complete = total > 0 && done >= total;
  const graded = entries.filter((entry) => entry.outcome === 'completed' && typeof entry.resultPct === 'number');
  const average =
    graded.length > 0
      ? Math.round(graded.reduce((sum, entry) => sum + (entry.resultPct ?? 0), 0) / graded.length)
      : undefined;
  const firstPending = stageOneKeys?.find((key) => !entries.some((entry) => entry.activityKey === key));
  const units = (Array.isArray(data.units) ? data.units : []).map((unit): DashboardUnit => {
    if (unit.comingSoon) return unit;
    const stages = Array.isArray(unit.stages) ? unit.stages : [];
    const { next: _next, averageResultPct: _avg, ...rest } = unit;
    if (unit !== focus || stages.length === 0) {
      return { ...rest, stages: stages.map((stage) => ({ ...stage, state: 'LOCKED' as const })) };
    }
    const first = stages[0]!;
    return {
      ...rest,
      ...(average === undefined ? {} : { averageResultPct: average }),
      started: done > 0,
      stagesCompleted: complete ? 1 : 0,
      stages: stages.map((stage, index) => ({
        ...stage,
        state: index === 0 ? (complete ? ('COMPLETED' as const) : ('CURRENT' as const)) : ('LOCKED' as const),
      })),
      ...(complete
        ? {}
        : {
            next: {
              stageKey: first.stageKey,
              activityKey: firstPending ?? unit.next?.activityKey ?? '',
              position: Math.min(done + 1, Math.max(total, 1)),
              total: total || (unit.next?.total ?? 0),
            },
          }),
    };
  });
  return { ...data, units, xpTotal: totalXp(entries) };
}
