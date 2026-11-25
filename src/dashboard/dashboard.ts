// O painel do Aluno (2.5, FR-8 a FR-10, AD-9): a leitura `GET
// /students/me/dashboard` e a escolha da Unidade em foco. Todo número do painel
// (XP, Badges, Estágios n de total, Resultado médio, estado de cada Estágio e o
// `next`) vem da API: o App não calcula posição, desbloqueio nem média.
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { get, type GetData } from '../api/client';

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
