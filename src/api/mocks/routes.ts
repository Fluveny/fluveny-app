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

const VERSION_ID = 'sha256:0000000000000000000000000000000000000000000000000000000000000001';

// Uma Unidade com um Estágio de três Escolhas (o player da 1.10 percorre 1 de 3,
// 2 de 3, 3 de 3), e a Unit 2 "em breve" (sem Estágios).
const unit1 = { unitKey: 'unit-1', order: 1, title: 'Unit 1', comingSoon: false, versionId: VERSION_ID };
const unit2 = {
  unitKey: 'unit-2',
  order: 2,
  title: 'Unit 2',
  comingSoon: true,
  versionId: 'sha256:0000000000000000000000000000000000000000000000000000000000000002',
};

const choice = (activityKey: string, title: string, question: string, options: [string, string][]) => ({
  activityKey,
  type: 'choice' as const,
  title,
  xp: 10,
  items: [
    {
      itemKey: `${activityKey}-1`,
      question,
      options: options.map(([optionKey, text]) => ({ optionKey, text })),
    },
  ],
});

const stage1Activities = [
  choice('greeting-choice', 'Choose the greeting', 'How do you greet someone in the morning?', [
    ['good-morning', 'Good morning'],
    ['good-night', 'Good night'],
  ]),
  choice('name-choice', 'Say your name', 'How do you tell someone your name?', [
    ['im-julia', "I'm Júlia."],
    ['im-from-brazil', "I'm from Brazil."],
  ]),
  choice('nice-to-meet-you-choice', 'Nice to meet you', 'Alex says "Nice to meet you!". What do you answer?', [
    ['nice-to-meet-you-too', 'Nice to meet you too!'],
    ['good-night', 'Good night!'],
  ]),
];

export const mockRoutes: MockRoutes = {
  '/api/v1/meta': {
    get: () => ({ data: { minAppVersion: '0.0.0', activityTypes: [] } }),
  },
  '/api/v1/units': {
    get: () => ({ data: [unit1, unit2] }),
  },
  '/api/v1/units/{unitKey}': {
    get: () => ({
      data: {
        ...unit1,
        stages: [{ stageKey: 'stage-1', title: 'Meet & Greet', activityCount: stage1Activities.length }],
        usefulExpressions: [
          {
            expressionKey: 'nice-to-meet-you',
            term: 'Nice to meet you',
            meaning: 'Prazer em conhecer você',
            examples: ['Hi, {name}! Nice to meet you.'],
          },
        ],
      },
    }),
  },
  '/api/v1/units/{unitKey}/stages/{stageKey}': {
    get: () => ({
      data: {
        versionId: VERSION_ID,
        stageKey: 'stage-1',
        title: 'Meet & Greet',
        activities: stage1Activities,
      },
    }),
  },
  // Rotas do job de publicação: o App não as chama, mas o tipo exige um mock por rota.
  '/api/v1/admin/content/units/{unitKey}/versions': {
    post: () => ({ data: { versionId: VERSION_ID, created: false, published: true } }),
  },
  '/api/v1/admin/content/units/{unitKey}/versions/{versionId}': {
    get: () => ({
      data: {
        versionId: VERSION_ID,
        unitKey: 'unit-1',
        schemaVersion: 1,
        order: 1,
        createdAt: '2026-11-14T00:00:00Z',
        published: true,
      },
    }),
  },
};
