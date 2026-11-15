// Respostas mockadas da API (EXPO_PUBLIC_API_MOCK=1), tipadas pelo contrato
// (schema.d.ts). O tipo exige uma resposta para cada rota e método do contrato:
// rota nova no `api:sync` sem mock aqui falha o tsc, e o routes.test.ts confere
// o mesmo contra o openapi.json.
//
// Só a visão do aluno: Atividade mockada usa os tipos `*StudentView`, nunca a
// Atividade com resposta e justificativa (campos `x-fluveny-secret` da API). O
// teste falha se algum mock trouxer um campo que só existe fora da StudentView.
import type { paths } from '../schema';

export const MOCK_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Method = (typeof MOCK_METHODS)[number];

type Json<R> = R extends { content: { 'application/json': infer B } } ? B : never;

/** Corpo da resposta de sucesso (200 ou 201) da operação. */
type SuccessBody<O> = O extends { responses: infer R }
  ? R extends { 200: infer S }
    ? Json<S>
    : R extends { 201: infer S }
      ? Json<S>
      : never
  : never;

export type MockRoutes = {
  [P in keyof paths]: {
    [M in Method as paths[P][M] extends { responses: unknown } ? M : never]: (
      request: Request,
    ) => SuccessBody<paths[P][M]>;
  };
};

export const mockRoutes: MockRoutes = {
  '/api/v1/meta': {
    get: () => ({ data: { minAppVersion: '0.0.0', activityTypes: [] } }),
  },
};
