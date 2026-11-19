import openapi from '../../openapi.json';
import { randomUUID } from 'node:crypto';

import {
  MOCK_CREATED,
  MOCK_METHODS,
  MockProblem,
  mockRoutes,
  resetMockStudents,
  resetMockVisitorRecords,
} from '../routes';

type Schema = {
  $ref?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  additionalProperties?: Schema | boolean;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
};

type Components = Record<string, Schema>;

const contractComponents = (openapi as { components?: { schemas?: Components } }).components?.schemas ?? {};

const REF = '#/components/schemas/';

/**
 * As propriedades do próprio objeto, seguindo `$ref`, `allOf`, `oneOf` e `anyOf` (a união de
 * Atividades é `oneOf` das variantes). Não desce em `properties`: cada objeto aninhado é outro
 * componente, com o próprio par `X`/`XStudentView`.
 */
function ownProperties(schema: Schema | undefined, components: Components, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (!schema) return names;
  if (schema.$ref?.startsWith(REF)) {
    const name = schema.$ref.slice(REF.length);
    if (seen.has(name)) return names;
    seen.add(name);
    return ownProperties(components[name], components, seen);
  }
  for (const key of Object.keys(schema.properties ?? {})) names.add(key);
  for (const sub of [...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]) {
    for (const key of ownProperties(sub, components, seen)) names.add(key);
  }
  return names;
}

/**
 * Campos que existem num schema `X` e não no `XStudentView` dele: os segredos da API (os
 * `x-fluveny-secret` do JSON Schema, que a visão do aluno tira).
 */
function secretFields(components: Components = contractComponents): Set<string> {
  const secrets = new Set<string>();
  for (const name of Object.keys(components)) {
    if (!name.endsWith('StudentView')) continue;
    const full = components[name.slice(0, -'StudentView'.length)];
    if (!full) continue;
    const visible = ownProperties(components[name], components);
    for (const key of ownProperties(full, components)) if (!visible.has(key)) secrets.add(key);
  }
  return secrets;
}

function keysOf(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, keys));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      keysOf(item, keys);
    }
  }
  return keys;
}

const routes = mockRoutes as unknown as Record<string, Partial<Record<string, (request: Request) => unknown>>>;

describe('segredos do contrato', () => {
  it('detecta o segredo de um par X/XStudentView, também por oneOf, allOf e $ref', () => {
    const components: Components = {
      Activity: { oneOf: [{ $ref: `${REF}QuizActivity` }] },
      ActivityStudentView: { oneOf: [{ $ref: `${REF}QuizActivityStudentView` }] },
      QuizActivity: { allOf: [{ $ref: `${REF}Base` }, { properties: { answerKey: {}, items: {} } }] },
      QuizActivityStudentView: { allOf: [{ $ref: `${REF}Base` }, { properties: { items: {} } }] },
      Base: { properties: { activityKey: {}, type: {} } },
      QuizItem: { properties: { itemKey: {}, justification: {} } },
      QuizItemStudentView: { properties: { itemKey: {} } },
    };
    expect([...secretFields(components)].sort()).toEqual(['answerKey', 'justification']);
  });

  it('acha os segredos reais da Escolha no contrato', () => {
    // Os campos x-fluveny-secret da Escolha (história 1.7): resposta aceita e justificativa.
    expect([...secretFields()]).toEqual(expect.arrayContaining(['correctOptionKey', 'justification']));
  });
});

describe('mocks da API', () => {
  it('têm uma resposta para cada rota e método do openapi.json', () => {
    const missing: string[] = [];
    for (const [path, item] of Object.entries(openapi.paths as Record<string, Record<string, unknown>>)) {
      for (const method of MOCK_METHODS) {
        if (item[method] && !routes[path]?.[method]) missing.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('não têm rota fora do contrato', () => {
    const paths = openapi.paths as Record<string, Record<string, unknown>>;
    const extra = Object.entries(routes).flatMap(([path, operations]) =>
      Object.keys(operations)
        .filter((method) => !paths[path]?.[method])
        .map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(extra).toEqual([]);
  });

  it('as rotas só 201 (sem 200) do contrato estão em MOCK_CREATED, e só elas', () => {
    const created = Object.entries(openapi.paths as Record<string, Record<string, { responses?: object }>>).flatMap(
      ([path, item]) =>
        MOCK_METHODS.filter(
          (method) =>
            item[method]?.responses && '201' in item[method].responses! && !('200' in item[method].responses!),
        ).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect([...MOCK_CREATED].sort()).toEqual(created.sort());
  });

  it('só trazem a visão do aluno, sem campos secretos', async () => {
    const secrets = secretFields();
    const leaked: string[] = [];
    // As rotas do Aluno pedem uma sessão do mock: um cadastro antes.
    resetMockStudents();
    await signupMock({ ...ADULT, email: 'antes@exemplo.test' });
    for (const [path, operations] of Object.entries(routes)) {
      for (const [method, resolve] of Object.entries(operations)) {
        if (path.startsWith('/api/v1/visitor/attempts')) continue;
        const init =
          path === '/api/v1/visitor/completions'
            ? {
                method: 'POST',
                body: JSON.stringify({
                  attemptId: '6f1c2a4e-1b2c-4d3e-8f90-123456789abc',
                  deviceId: '0b6a3f0e-4c1d-4e2a-9b3c-5d6e7f809a1b',
                  versionId: 'v',
                  activityKey: 'meet-alex-dialogue',
                  outcome: 'VIEWED',
                  studyTimeMs: 0,
                }),
              }
            : path === '/api/v1/visitor/events'
              ? {
                  method: 'POST',
                  body: JSON.stringify({
                    type: 'VISITOR_SESSION_STARTED',
                    deviceId: '0b6a3f0e-4c1d-4e2a-9b3c-5d6e7f809a1b',
                  }),
                }
              : path === '/api/v1/auth/signup'
                ? { method: 'POST', headers: { 'X-Fluveny-Client': 'web' }, body: JSON.stringify(ADULT) }
                : path === '/api/v1/students/me' && method === 'patch'
                  ? { method: 'PATCH', body: JSON.stringify({ pronounSet: 'SHE' }) }
                  : undefined;
        for (const key of keysOf(await resolve?.(new Request(`http://mock${path}`, init)))) {
          if (secrets.has(key)) leaked.push(`${method.toUpperCase()} ${path}: ${key}`);
        }
      }
    }
    expect(leaked).toEqual([]);
  });
});

/** Um cadastro de adulto válido para o mock (2.1). */
const ADULT = {
  email: 'ana@exemplo.test',
  password: 'segredo123',
  birthDate: '1990-05-20',
  name: 'Ana',
  acceptedTermsVersion: '0.2',
  acceptedPrivacyVersion: '0.3',
};

function signupMock(body: unknown, client: string | null = 'web') {
  const headers: Record<string, string> = client ? { 'X-Fluveny-Client': client } : {};
  return Promise.resolve(
    mockRoutes['/api/v1/auth/signup'].post(
      new Request('http://mock/api/v1/auth/signup', { method: 'POST', headers, body: JSON.stringify(body) }),
    ),
  );
}

async function problemOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof MockProblem) return `${error.status} ${error.code}`;
    throw error;
  }
  return 'sem erro';
}

describe('mock do cadastro e da sessão (2.1)', () => {
  beforeEach(() => resetMockStudents());
  const me = (headers: Record<string, string> = {}) =>
    Promise.resolve().then(() => mockRoutes['/api/v1/students/me'].get(new Request('http://mock', { headers })));

  it('web: 201 sem token, e o perfil da sessão; e-mail repetido (em outra caixa) é 409', async () => {
    const created = await signupMock(ADULT);
    expect(created.data).toEqual({ student: { email: ADULT.email, name: 'Ana', pronounSet: null } });
    expect((await me()).data.email).toBe(ADULT.email);
    expect(await problemOf(signupMock({ ...ADULT, email: 'ANA@exemplo.test' }))).toBe('409 EMAIL_ALREADY_REGISTERED');
  });

  it('Android: token de 43 caracteres, e o perfil só com o Bearer dele', async () => {
    const { data } = await signupMock(ADULT, 'android');
    expect(data.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await problemOf(me())).toBe('401 UNAUTHENTICATED');
    expect((await me({ Authorization: `Bearer ${data.sessionToken}` })).data.name).toBe('Ana');
  });

  it('as regras da API: cabeçalho, campo desconhecido, senha, data, 12 e 18 anos', async () => {
    const today = new Date();
    const yearsAgo = (years: number, days = 0) => {
      const date = new Date(today.getFullYear() - years, today.getMonth(), today.getDate() + days);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };
    expect(await problemOf(signupMock(ADULT, null))).toBe('400 CLIENT_HEADER_REQUIRED');
    expect(await problemOf(signupMock({ ...ADULT, extra: 1 }))).toBe('400 VALIDATION_FAILED');
    expect(await problemOf(signupMock({ ...ADULT, password: 'semnumero' }))).toBe('400 VALIDATION_FAILED');
    expect(await problemOf(signupMock({ ...ADULT, password: 'a1'.repeat(33) }))).toBe('400 VALIDATION_FAILED');
    expect(await problemOf(signupMock({ ...ADULT, birthDate: '2001-02-30' }))).toBe('400 VALIDATION_FAILED');
    expect(await problemOf(signupMock({ ...ADULT, birthDate: yearsAgo(12, 1) }))).toBe('422 AGE_BELOW_MINIMUM');
    expect(await problemOf(signupMock({ ...ADULT, birthDate: yearsAgo(12) }))).toBe('422 GUARDIAN_CONSENT_REQUIRED');
    expect(await problemOf(signupMock({ ...ADULT, birthDate: yearsAgo(18, 1) }))).toBe('422 GUARDIAN_CONSENT_REQUIRED');
    expect((await signupMock({ ...ADULT, birthDate: yearsAgo(18) })).data.student.email).toBe(ADULT.email);
  });

  it('PATCH /students/me grava os pronomes; sem sessão, 401; valor de fora, 400', async () => {
    const patchMe = (body: unknown) =>
      Promise.resolve(
        mockRoutes['/api/v1/students/me'].patch(
          new Request('http://mock', { method: 'PATCH', body: JSON.stringify(body) }),
        ),
      );
    expect(await problemOf(patchMe({ pronounSet: 'SHE' }))).toBe('401 UNAUTHENTICATED');
    await signupMock(ADULT);
    expect(await problemOf(patchMe({ pronounSet: 'IT' }))).toBe('400 VALIDATION_FAILED');
    expect((await patchMe({ pronounSet: 'SHE' })).data.pronounSet).toBe('SHE');
    expect((await me()).data.pronounSet).toBe('SHE');
  });
});

const STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
type StageActivity = (typeof STAGE.activities)[number];
type ChoiceView = Extract<StageActivity, { type: 'choice' }>;
const CHOICES = STAGE.activities.filter((activity): activity is ChoiceView => activity.type === 'choice');
const DIALOGUE = STAGE.activities.find((activity) => activity.type === 'dialogue')!;
const THREE_ITEMS = CHOICES[0]!;
const SPEECH = STAGE.activities.find(
  (activity): activity is Extract<StageActivity, { type: 'speech' }> => activity.type === 'speech',
)!;

/** Os itens da resposta esperada da Escolha. */
const expectedItems = (expected: unknown) =>
  (expected as { items?: { itemKey: string; optionKey: string }[] } | undefined)?.items;

/** Uma Tentativa da Atividade de 3 itens, com a opção `pick(item)` em cada um. */
function attempt(
  pick: (item: (typeof THREE_ITEMS)['items'][number]) => string,
  activity = THREE_ITEMS,
  ids: { attemptId?: string; deviceId?: string } = {},
) {
  return {
    attemptId: ids.attemptId ?? randomUUID(),
    deviceId: ids.deviceId ?? DEVICE,
    versionId: STAGE.versionId,
    activityKey: activity.activityKey,
    type: 'choice',
    answer: { type: 'choice', items: activity.items.map((item) => ({ itemKey: item.itemKey, optionKey: pick(item) })) },
    studyTimeMs: 1000,
  };
}

const DEVICE = '0b6a3f0e-4c1d-4e2a-9b3c-5d6e7f809a1b';

type VisitorRoute = '/api/v1/visitor/attempts' | '/api/v1/visitor/attempts/reveal';

const send = (route: VisitorRoute, body: unknown) =>
  Promise.resolve(
    mockRoutes[route].post(new Request(`http://mock${route}`, { method: 'POST', body: JSON.stringify(body) })),
  ).then((response) => response.data);

/** As chaves do Resultado, tirando só a exceção da API: `expected` e o `justification` do `ItemResult`. */
function resultKeys(result: Record<string, unknown>): Set<string> {
  const { expected: _expected, items, ...rest } = result;
  const stripped = (items as Record<string, unknown>[]).map(({ justification: _justification, ...item }) => item);
  return keysOf({ ...rest, items: stripped });
}

const complete = (body: unknown) =>
  Promise.resolve(
    mockRoutes['/api/v1/visitor/completions'].post(
      new Request('http://mock/api/v1/visitor/completions', { method: 'POST', body: JSON.stringify(body) }),
    ),
  ).then((response) => response.data);

beforeEach(() => resetMockVisitorRecords());

describe('corretor do mock', () => {
  it('uma Escolha mockada tem 3 itens', () => {
    expect(THREE_ITEMS.items).toHaveLength(3);
  });

  it('reveal: devolve expected e as justificativas, sem XP; fora da exceção, nada secreto', async () => {
    await send(
      '/api/v1/visitor/attempts',
      attempt((item) => item.options[0]!.optionKey),
    );
    const first = await send(
      '/api/v1/visitor/attempts/reveal',
      attempt((item) => item.options[0]!.optionKey),
    );
    expect(first.xpAwarded).toBe(0);
    expect(expectedItems(first.expected)).toHaveLength(3);
    expect(first.items.every((item) => item.justification !== undefined)).toBe(true);
    const secrets = secretFields();
    expect([...resultKeys(first)].filter((key) => secrets.has(key))).toEqual([]);
  });

  it('Acerto: 100, xp 10, expected e justificativas; Erro: n de m, xp proporcional, sem gabarito', async () => {
    await send(
      '/api/v1/visitor/attempts',
      attempt((item) => item.options[0]!.optionKey),
    );
    const revealed = await send(
      '/api/v1/visitor/attempts/reveal',
      attempt((item) => item.options[0]!.optionKey),
    );
    const right = new Map(expectedItems(revealed.expected)!.map((item) => [item.itemKey, item.optionKey]));
    const correct = await send(
      '/api/v1/visitor/attempts',
      attempt((item) => right.get(item.itemKey)!),
    );
    expect(correct).toMatchObject({ outcome: 'GRADED', resultPct: 100, xpAwarded: 10 });
    expect(correct.expected).toBeDefined();
    expect(correct.items.every((item) => item.correct && item.justification !== undefined)).toBe(true);
    expect([...resultKeys(correct)].filter((key) => secretFields().has(key))).toEqual([]);

    const wrongOf = (item: (typeof THREE_ITEMS)['items'][number]) =>
      item.options.find((option) => option.optionKey !== right.get(item.itemKey))!.optionKey;
    const [firstItem] = THREE_ITEMS.items;
    const partial = await send(
      '/api/v1/visitor/attempts',
      attempt((item) => (item === firstItem ? wrongOf(item) : right.get(item.itemKey)!)),
    );
    expect(partial).toMatchObject({ resultPct: 67, xpAwarded: 7 });
    expect(partial.expected).toBeUndefined();
    expect(partial.items.some((item) => 'justification' in item)).toBe(false);
    const secrets = secretFields();
    expect([...keysOf(partial)].filter((key) => secrets.has(key))).toEqual([]);
  });

  it('resposta inválida é 400 INVALID_ANSWER; Atividade desconhecida, 404', async () => {
    const valid = attempt((item) => item.options[0]!.optionKey);
    const missing = { ...valid, answer: { ...valid.answer, items: valid.answer.items.slice(1) } };
    await expect(send('/api/v1/visitor/attempts', missing)).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_ANSWER',
    });
    await expect(send('/api/v1/visitor/attempts', { ...valid, activityKey: 'nope' })).rejects.toBeInstanceOf(
      MockProblem,
    );
    await expect(send('/api/v1/visitor/attempts', { ...valid, activityKey: 'nope' })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('recibos do mock (1.12)', () => {
  const firstOption = (item: (typeof THREE_ITEMS)['items'][number]) => item.options[0]!.optionKey;

  it('só a primeira Tentativa do aparelho na Atividade traz receipt; outra Tentativa, não', async () => {
    const first = await send('/api/v1/visitor/attempts', attempt(firstOption));
    expect(first.receipt).toEqual(expect.stringMatching(/^v1\./));
    const second = await send('/api/v1/visitor/attempts', attempt(firstOption));
    expect(second.receipt).toBeUndefined();
    // Outro aparelho, outro recibo.
    const other = await send('/api/v1/visitor/attempts', attempt(firstOption, THREE_ITEMS, { deviceId: randomUUID() }));
    expect(other.receipt).toEqual(expect.any(String));
    expect(other.receipt).not.toBe(first.receipt);
  });

  it('reenvio do mesmo attemptId com o mesmo Resultado devolve o mesmo recibo; com outro Resultado, nenhum', async () => {
    const attemptId = randomUUID();
    const first = await send('/api/v1/visitor/attempts', attempt(firstOption, THREE_ITEMS, { attemptId }));
    const again = await send('/api/v1/visitor/attempts', attempt(firstOption, THREE_ITEMS, { attemptId }));
    expect(again.receipt).toBe(first.receipt);
    const changed = await send(
      '/api/v1/visitor/attempts',
      attempt((item) => item.options[1]!.optionKey, THREE_ITEMS, { attemptId }),
    );
    expect(changed.resultPct).not.toBe(first.resultPct);
    expect(changed.receipt).toBeUndefined();
  });

  it('sem deviceId: corrige sem receipt; deviceId malformado é 400', async () => {
    const { deviceId: _deviceId, ...anonymous } = attempt(firstOption);
    expect((await send('/api/v1/visitor/attempts', anonymous)).receipt).toBeUndefined();
    await expect(
      send('/api/v1/visitor/attempts', attempt(firstOption, THREE_ITEMS, { deviceId: 'nope' })),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  it('reveal sem Tentativa do aparelho é 409 ATTEMPT_REQUIRED; depois dela, 200 sem receipt', async () => {
    await expect(send('/api/v1/visitor/attempts/reveal', attempt(firstOption))).rejects.toMatchObject({
      status: 409,
      code: 'ATTEMPT_REQUIRED',
    });
    const { deviceId: _deviceId, ...anonymous } = attempt(firstOption);
    await expect(send('/api/v1/visitor/attempts/reveal', anonymous)).rejects.toMatchObject({ status: 409 });
    await send('/api/v1/visitor/attempts', attempt(firstOption));
    const revealed = await send('/api/v1/visitor/attempts/reveal', attempt(firstOption));
    expect(revealed.receipt).toBeUndefined();
  });

  it('completions: VIEWED do Diálogo sem XP, recibo só na primeira, reenvio devolve o mesmo', async () => {
    const attemptId = randomUUID();
    const body = {
      attemptId,
      deviceId: DEVICE,
      versionId: STAGE.versionId,
      activityKey: DIALOGUE.activityKey,
      outcome: 'VIEWED',
      studyTimeMs: 1000,
    };
    const first = await complete(body);
    expect(first).toEqual({ outcome: 'VIEWED', xpAwarded: 0, receipt: expect.any(String) });
    expect(Object.keys(first).sort()).toEqual(['outcome', 'receipt', 'xpAwarded']);
    expect((await complete(body)).receipt).toBe(first.receipt);
    expect((await complete({ ...body, attemptId: randomUUID() })).receipt).toBeUndefined();
  });

  it('completions: cada Tipo aceita a sua conclusão; o resto é 409 COMPLETION_NOT_ALLOWED, sem recibo', async () => {
    const body = {
      attemptId: randomUUID(),
      deviceId: DEVICE,
      versionId: STAGE.versionId,
      activityKey: CHOICES[1]!.activityKey,
      outcome: 'VIEWED',
      studyTimeMs: 0,
    };
    await expect(complete(body)).rejects.toMatchObject({ status: 409, code: 'COMPLETION_NOT_ALLOWED' });
    await expect(complete({ ...body, outcome: 'SKIPPED' })).rejects.toMatchObject({
      status: 409,
      code: 'COMPLETION_NOT_ALLOWED',
    });
    await expect(complete({ ...body, activityKey: DIALOGUE.activityKey, outcome: 'SKIPPED' })).rejects.toMatchObject({
      status: 409,
      code: 'COMPLETION_NOT_ALLOWED',
    });
    // A recusa não ocupa a vaga do recibo: a Tentativa depois dela ainda traz.
    const after = await send(
      '/api/v1/visitor/attempts',
      attempt((item) => item.options[0]!.optionKey, CHOICES[1]!),
    );
    expect(after.receipt).toEqual(expect.any(String));
  });

  it('o Estágio abre com um Diálogo que pergunta o nome e o país', () => {
    expect(STAGE.activities[0]!.type).toBe('dialogue');
    const asks = (DIALOGUE as Extract<StageActivity, { type: 'dialogue' }>).lines.map((line) => line.ask);
    expect(asks).toEqual(expect.arrayContaining(['name', 'country']));
  });

  it('Expressões Úteis (1.14): os Cartões e a Expressão vêm depois do Diálogo e aceitam VIEWED, com recibo', async () => {
    expect(STAGE.activities.slice(0, 3).map((activity) => activity.type)).toEqual(['dialogue', 'cards', 'expression']);
    for (const activity of STAGE.activities.filter((entry) => entry.type === 'cards' || entry.type === 'expression')) {
      const body = {
        attemptId: randomUUID(),
        deviceId: DEVICE,
        versionId: STAGE.versionId,
        activityKey: activity.activityKey,
        outcome: 'VIEWED',
        studyTimeMs: 0,
      };
      await expect(complete({ ...body, outcome: 'SKIPPED' })).rejects.toMatchObject({
        status: 409,
        code: 'COMPLETION_NOT_ALLOWED',
      });
      expect(await complete(body)).toEqual({ outcome: 'VIEWED', xpAwarded: 0, receipt: expect.any(String) });
    }
  });

  it('Grammar Time (1.19): antes da Fala, com {name} e variantes de pronome em used; VIEWED com recibo, SKIPPED 409', async () => {
    const grammar = STAGE.activities.find(
      (activity): activity is Extract<StageActivity, { type: 'grammar' }> => activity.type === 'grammar',
    )!;
    expect(STAGE.activities.indexOf(grammar)).toBe(STAGE.activities.indexOf(SPEECH) - 1);
    expect(JSON.stringify(grammar.used)).toContain('{name}');
    expect(grammar.used.some((entry) => typeof entry.sentence === 'object')).toBe(true);
    expect(grammar.rules.length).toBeGreaterThan(0);
    expect(grammar.examples.length).toBeGreaterThan(0);
    const body = {
      attemptId: randomUUID(),
      deviceId: DEVICE,
      versionId: STAGE.versionId,
      activityKey: grammar.activityKey,
      outcome: 'VIEWED',
      studyTimeMs: 0,
    };
    await expect(complete({ ...body, outcome: 'SKIPPED' })).rejects.toMatchObject({
      status: 409,
      code: 'COMPLETION_NOT_ALLOWED',
    });
    expect(await complete(body)).toEqual({ outcome: 'VIEWED', xpAwarded: 0, receipt: expect.any(String) });
  });

  it('Expressões Úteis (1.14): toda chave [[…|chave]] do Estágio está nas usefulExpressions da Unidade', () => {
    const unit = mockRoutes['/api/v1/units/{unitKey}'].get(new Request('http://mock')).data;
    const known = new Set(unit.usefulExpressions.map((entry) => entry.expressionKey));
    const used = [...JSON.stringify(STAGE.activities).matchAll(/\[\[[^|\]]+\|([^\]]+)\]\]/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThanOrEqual(2);
    expect(used.filter((key) => !known.has(key!))).toEqual([]);
    // Uma Atividade que não é a Expressão destacada também tem trecho (a folha abre nela).
    const others = STAGE.activities.filter((activity) => activity.type !== 'expression');
    expect(JSON.stringify(others)).toMatch(/\[\[[^\]]+\|[^\]]+\]\]/);
  });

  it('completions inválida: sem deviceId ou outcome fora de VIEWED/SKIPPED é 400; Atividade desconhecida, 404', async () => {
    const body = {
      attemptId: randomUUID(),
      deviceId: DEVICE,
      versionId: STAGE.versionId,
      activityKey: DIALOGUE.activityKey,
      outcome: 'VIEWED',
      studyTimeMs: 0,
    };
    const { deviceId: _deviceId, ...anonymous } = body;
    await expect(complete(anonymous)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    await expect(complete({ ...body, outcome: 'GRADED' })).rejects.toMatchObject({ status: 400 });
    await expect(complete({ ...body, activityKey: 'nope' })).rejects.toMatchObject({ status: 404 });
  });

  describe('eventos do Visitante (1.20)', () => {
    const send = (body: unknown) =>
      mockRoutes['/api/v1/visitor/events'].post(
        new Request('http://mock/api/v1/visitor/events', { method: 'POST', body: JSON.stringify(body) }),
      );

    it('VISITOR_SESSION_STARTED e ACTIVITY_STARTED de uma Atividade do Estágio: 202 sem corpo', async () => {
      await expect(send({ type: 'VISITOR_SESSION_STARTED', deviceId: DEVICE })).resolves.toBeUndefined();
      await expect(
        send({
          type: 'ACTIVITY_STARTED',
          deviceId: DEVICE,
          versionId: STAGE.versionId,
          activityKey: DIALOGUE.activityKey,
        }),
      ).resolves.toBeUndefined();
    });

    it('corpo fechado, deviceId UUID e Atividade conhecida, como a API', async () => {
      await expect(send({ type: 'VISITOR_SESSION_STARTED', deviceId: DEVICE, name: 'Ana' })).rejects.toMatchObject({
        status: 400,
      });
      await expect(send({ type: 'VISITOR_SESSION_STARTED' })).rejects.toMatchObject({ status: 400 });
      await expect(send({ type: 'VISITOR_SESSION_STARTED', deviceId: 'nope' })).rejects.toMatchObject({ status: 400 });
      await expect(send({ type: 'STAGE_COMPLETED', deviceId: DEVICE })).rejects.toMatchObject({ status: 400 });
      await expect(send({ type: 'ACTIVITY_STARTED', deviceId: DEVICE })).rejects.toMatchObject({ status: 400 });
      await expect(
        send({ type: 'ACTIVITY_STARTED', deviceId: DEVICE, versionId: STAGE.versionId, activityKey: 'nope' }),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('o Estágio traz a frase do resumo com {name}', () => {
      expect(STAGE.completion).toContain('{name}');
    });
  });

  describe('Fala (1.15)', () => {
    const speak = (transcript: unknown, ids: { attemptId?: string; deviceId?: string } = {}) => ({
      attemptId: ids.attemptId ?? randomUUID(),
      deviceId: ids.deviceId ?? DEVICE,
      versionId: STAGE.versionId,
      activityKey: SPEECH.activityKey,
      type: 'speech',
      answer: { type: 'speech', transcript },
      studyTimeMs: 1000,
    });

    it('o Estágio fecha com a Fala, com {name} no alvo e sem as alternativas (segredo)', () => {
      expect(STAGE.activities[STAGE.activities.length - 1]).toBe(SPEECH);
      expect(SPEECH.target).toContain('{name}');
      expect(Object.keys(SPEECH)).not.toContain('alternatives');
    });

    it('Acerto com o token no lugar do nome, em qualquer caixa e com a contração expandida; um item; recibo', async () => {
      const right = await send('/api/v1/visitor/attempts', speak("hi alex i'm {name}"));
      expect(right).toMatchObject({ outcome: 'GRADED', resultPct: 100, xpAwarded: 10 });
      expect(right.items).toEqual([{ itemKey: SPEECH.activityKey, correct: true }]);
      expect(right.expected).toEqual({ type: 'speech', transcript: SPEECH.target });
      expect(right.receipt).toEqual(expect.any(String));
      expect((await send('/api/v1/visitor/attempts', speak('Hello Alex my name is {name}'))).resultPct).toBe(100);
      expect((await send('/api/v1/visitor/attempts', speak('alex hi I am'))).resultPct).toBe(100);
    });

    it('Erro com a transcrição curta: 0, sem XP; o reveal pede uma Tentativa e não dá XP', async () => {
      await expect(send('/api/v1/visitor/attempts/reveal', speak('hi'))).rejects.toMatchObject({ status: 409 });
      const wrong = await send('/api/v1/visitor/attempts', speak('hi'));
      expect(wrong).toMatchObject({ resultPct: 0, xpAwarded: 0, items: [{ correct: false }] });
      const revealed = await send('/api/v1/visitor/attempts/reveal', speak('hi'));
      expect(revealed).toMatchObject({ xpAwarded: 0, expected: { transcript: SPEECH.target } });
      expect(revealed.receipt).toBeUndefined();
    });

    it('transcrição em branco, longa demais ou de outro Tipo é 400 INVALID_ANSWER', async () => {
      for (const transcript of ['   ', 'a'.repeat(501), 3]) {
        await expect(send('/api/v1/visitor/attempts', speak(transcript))).rejects.toMatchObject({
          status: 400,
          code: 'INVALID_ANSWER',
        });
      }
      await expect(
        send('/api/v1/visitor/attempts', { ...speak('hi'), answer: { type: 'choice', items: [] } }),
      ).rejects.toMatchObject({ code: 'INVALID_ANSWER' });
    });

    it('completions: a Fala aceita SKIPPED, sem XP e com recibo; VIEWED é 409', async () => {
      const body = {
        attemptId: randomUUID(),
        deviceId: DEVICE,
        versionId: STAGE.versionId,
        activityKey: SPEECH.activityKey,
        outcome: 'VIEWED',
        studyTimeMs: 0,
      };
      await expect(complete(body)).rejects.toMatchObject({ status: 409, code: 'COMPLETION_NOT_ALLOWED' });
      expect(await complete({ ...body, outcome: 'SKIPPED' })).toEqual({
        outcome: 'SKIPPED',
        xpAwarded: 0,
        receipt: expect.any(String),
      });
    });
  });

  describe('Associar (1.16)', () => {
    const MATCH = STAGE.activities.find(
      (activity): activity is Extract<StageActivity, { type: 'match' }> => activity.type === 'match',
    )!;
    /** As respostas certas, na ordem das falas (o mock lista o distrator por último). */
    const RIGHT = MATCH.items.map((item, i) => ({
      itemKey: item.itemKey,
      responseKey: MATCH.responses[i]!.responseKey,
    }));
    const pairUp = (items: unknown, ids: { attemptId?: string } = {}) => ({
      attemptId: ids.attemptId ?? randomUUID(),
      deviceId: DEVICE,
      versionId: STAGE.versionId,
      activityKey: MATCH.activityKey,
      type: 'match',
      answer: { type: 'match', items },
      studyTimeMs: 1000,
    });

    it('o Estágio tem um Associar antes da Fala, com um distrator, {name} numa resposta e sem gabarito', () => {
      // Entre o Associar e a Fala ficam as duas Lacunas (1.17), a Resposta Livre (1.18) e o Grammar Time (1.19).
      expect(STAGE.activities.indexOf(MATCH)).toBe(STAGE.activities.indexOf(SPEECH) - 5);
      expect(MATCH.responses.length - MATCH.items.length).toBe(1);
      expect(MATCH.responses.some((response) => String(response.text).includes('{name}'))).toBe(true);
      expect(Object.keys(MATCH.items[0]!).sort()).toEqual(['itemKey', 'line']);
    });

    it('Acerto: 100, xp 9, um item por fala, expected com os pares e recibo', async () => {
      const right = await send('/api/v1/visitor/attempts', pairUp(RIGHT));
      expect(right).toMatchObject({ outcome: 'GRADED', resultPct: 100, xpAwarded: 9 });
      expect(right.items.map((item) => item.itemKey)).toEqual(MATCH.items.map((item) => item.itemKey));
      expect(right.expected).toEqual({ type: 'match', items: RIGHT });
      // Justificativas no Acerto: as de `hi` e `from`; a de `nice` não existe no conteúdo.
      const justified = (result: { items: { itemKey: string; justification?: unknown }[] }) =>
        result.items.filter((item) => item.justification !== undefined).map((item) => item.itemKey);
      expect(justified(right)).toEqual(['speech-bubbles-hi', 'speech-bubbles-from']);
      expect(right.items.find((item) => item.itemKey === 'speech-bubbles-nice')).not.toHaveProperty('justification');
      expect(right.receipt).toEqual(expect.any(String));
      expect([...resultKeys(right)].filter((key) => secretFields().has(key))).toEqual([]);
    });

    it('Erro (2 de 3, distrator no lugar): 67, xp 6, sem gabarito; o reveal devolve os pares sem XP', async () => {
      const partial = RIGHT.map((pair, i) => (i === 0 ? { ...pair, responseKey: 'goodbye' } : pair));
      const wrong = await send('/api/v1/visitor/attempts', pairUp(partial));
      expect(wrong).toMatchObject({ resultPct: 67, xpAwarded: 6 });
      expect(wrong.items.map((item) => item.correct)).toEqual([false, true, true]);
      expect(wrong.expected).toBeUndefined();
      expect(wrong.items.some((item) => 'justification' in item)).toBe(false);
      const revealed = await send('/api/v1/visitor/attempts/reveal', pairUp(partial));
      expect(revealed).toMatchObject({ xpAwarded: 0, expected: { type: 'match', items: RIGHT } });
      expect(revealed.items.filter((item) => item.justification !== undefined).map((item) => item.itemKey)).toEqual([
        'speech-bubbles-hi',
        'speech-bubbles-from',
      ]);
      expect(revealed.items.find((item) => item.itemKey === 'speech-bubbles-nice')).not.toHaveProperty('justification');
      expect(revealed.receipt).toBeUndefined();
    });

    it.each([
      ['fala faltando', RIGHT.slice(1)],
      ['fala repetida', [...RIGHT, RIGHT[0]]],
      ['resposta repetida', RIGHT.map((pair) => ({ ...pair, responseKey: RIGHT[0]!.responseKey }))],
      ['resposta desconhecida', RIGHT.map((pair, i) => (i === 0 ? { ...pair, responseKey: 'nope' } : pair))],
      ['fala desconhecida', RIGHT.map((pair, i) => (i === 0 ? { ...pair, itemKey: 'nope' } : pair))],
      ['sem lista', undefined],
    ])('%s é 400 INVALID_ANSWER', async (_case, items) => {
      await expect(send('/api/v1/visitor/attempts', pairUp(items))).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_ANSWER',
      });
    });

    it('resposta de outro Tipo é 400; o Associar não aceita conclusão', async () => {
      await expect(
        send('/api/v1/visitor/attempts', { ...pairUp(RIGHT), answer: { type: 'choice', items: [] } }),
      ).rejects.toMatchObject({ code: 'INVALID_ANSWER' });
      const body = {
        attemptId: randomUUID(),
        deviceId: DEVICE,
        versionId: STAGE.versionId,
        activityKey: MATCH.activityKey,
        outcome: 'VIEWED',
        studyTimeMs: 0,
      };
      for (const outcome of ['VIEWED', 'SKIPPED']) {
        await expect(complete({ ...body, outcome })).rejects.toMatchObject({
          status: 409,
          code: 'COMPLETION_NOT_ALLOWED',
        });
      }
    });
  });

  describe('Lacunas (1.17)', () => {
    type Gaps = Extract<StageActivity, { type: 'gaps' }>;
    const ALL = STAGE.activities.filter((activity): activity is Gaps => activity.type === 'gaps');
    const BANK = ALL.find((activity) => activity.mode === 'bank')!;
    const TYPED = ALL.find((activity) => activity.mode === 'typed')!;
    const fill = (activity: Gaps, values: unknown) => ({
      attemptId: randomUUID(),
      deviceId: DEVICE,
      versionId: STAGE.versionId,
      activityKey: activity.activityKey,
      type: 'gaps',
      answer: {
        type: 'gaps',
        items: Array.isArray(values)
          ? values.map((value, i) => ({ itemKey: activity.items[i]?.itemKey ?? 'nope', value }))
          : values,
      },
      studyTimeMs: 1000,
    });

    it('o Estágio tem as Lacunas do banco e as digitadas antes da Fala, sem gabarito', () => {
      expect(STAGE.activities.indexOf(TYPED)).toBe(STAGE.activities.indexOf(SPEECH) - 3);
      expect(STAGE.activities.indexOf(BANK)).toBe(STAGE.activities.indexOf(TYPED) - 1);
      // Um distrator no banco; nada de banco no digitado.
      expect(BANK.bank!.length - BANK.items.length).toBe(1);
      expect(TYPED).not.toHaveProperty('bank');
      expect(Object.keys(BANK.items[0]!)).toEqual(['itemKey']);
      expect(TYPED.lines.some((line) => String(line).includes('{name}'))).toBe(true);
    });

    it('Acerto no banco: 100, xp 6, expected com a primeira aceita e recibo', async () => {
      const right = await send('/api/v1/visitor/attempts', fill(BANK, ['am', 'meet']));
      expect(right).toMatchObject({ outcome: 'GRADED', resultPct: 100, xpAwarded: 6 });
      expect(right.expected).toEqual({
        type: 'gaps',
        items: [
          { itemKey: 'gaps-bank-am', value: 'am' },
          { itemKey: 'gaps-bank-meet', value: 'meet' },
        ],
      });
      expect(right.items.filter((item) => item.justification !== undefined)).toHaveLength(1);
      expect(right.receipt).toEqual(expect.any(String));
      expect([...resultKeys(right)].filter((key) => secretFields().has(key))).toEqual([]);
    });

    it.each([
      ["I'm", true],
      ['i am', true],
      ["I'm.", true],
      ['I’m', true],
      ['Im', false],
      ['I', false],
    ])('digitado: "%s" na primeira lacuna é certo? %s', async (value, correct) => {
      const result = await send('/api/v1/visitor/attempts', fill(TYPED, [value, '{name}']));
      expect(result.items[0]!.correct).toBe(correct);
      expect(result.items[1]!.correct).toBe(true);
    });

    it('o token vale como palavra: {name} é certo, o nome literal não', async () => {
      const wrong = await send('/api/v1/visitor/attempts', fill(TYPED, ["I'm", 'Ana']));
      expect(wrong).toMatchObject({ resultPct: 50, xpAwarded: 3 });
      expect(wrong.expected).toBeUndefined();
      const revealed = await send('/api/v1/visitor/attempts/reveal', fill(TYPED, ["I'm", 'Ana']));
      expect(revealed).toMatchObject({
        xpAwarded: 0,
        expected: {
          type: 'gaps',
          items: [
            { itemKey: 'gaps-typed-im', value: "I'm" },
            { itemKey: 'gaps-typed-name', value: '{name}' },
          ],
        },
      });
    });

    it.each([
      ['item faltando', ['am']],
      [
        'item repetido',
        [
          { itemKey: 'gaps-bank-am', value: 'am' },
          { itemKey: 'gaps-bank-am', value: 'am' },
        ],
      ],
      [
        'item desconhecido',
        [
          { itemKey: 'gaps-bank-am', value: 'am' },
          { itemKey: 'nope', value: 'meet' },
        ],
      ],
      ['valor em branco', ['am', '  ']],
      ['valor longo demais', ['am', 'a'.repeat(101)]],
      ['sem lista', undefined],
    ])('%s é 400 INVALID_ANSWER', async (_case, values) => {
      const body = fill(BANK, values);
      if (Array.isArray(values) && typeof values[0] === 'object') body.answer.items = values;
      await expect(send('/api/v1/visitor/attempts', body)).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_ANSWER',
      });
    });

    it('as Lacunas não aceitam conclusão', async () => {
      for (const outcome of ['VIEWED', 'SKIPPED']) {
        await expect(
          complete({
            attemptId: randomUUID(),
            deviceId: DEVICE,
            versionId: STAGE.versionId,
            activityKey: BANK.activityKey,
            outcome,
            studyTimeMs: 0,
          }),
        ).rejects.toMatchObject({ status: 409, code: 'COMPLETION_NOT_ALLOWED' });
      }
    });
  });
  describe('Resposta Livre (1.18)', () => {
    type Free = Extract<StageActivity, { type: 'free' }>;
    const FREE = STAGE.activities.find((activity): activity is Free => activity.type === 'free')!;
    const viewed = (attemptId: string = randomUUID()) => ({
      attemptId,
      deviceId: DEVICE,
      versionId: STAGE.versionId,
      activityKey: FREE.activityKey,
      outcome: 'VIEWED',
      studyTimeMs: 1000,
    });
    const help = (values: string[]) => ({
      attemptId: randomUUID(),
      deviceId: DEVICE,
      versionId: STAGE.versionId,
      activityKey: FREE.activityKey,
      type: 'free',
      answer: {
        type: 'free',
        items: values.map((value, i) => ({ itemKey: FREE.extraHelp.items[i]?.itemKey ?? 'nope', value })),
      },
      studyTimeMs: 1000,
    });

    it('o Estágio tem a Resposta Livre antes do Grammar Time, sem a resposta-modelo nem o gabarito do Extra Help', () => {
      expect(STAGE.activities.indexOf(FREE)).toBe(STAGE.activities.indexOf(SPEECH) - 2);
      expect(FREE).not.toHaveProperty('modelAnswer');
      expect(Object.keys(FREE.extraHelp.items[0]!)).toEqual(['itemKey']);
      expect(FREE.extraHelp.bank.length - FREE.extraHelp.items.length).toBe(1);
    });

    it('VIEWED devolve a resposta-modelo com {name} e o recibo; a repetição, a resposta-modelo sem recibo', async () => {
      const first = await complete(viewed());
      expect(first).toMatchObject({ outcome: 'VIEWED', xpAwarded: 0, receipt: expect.any(String) });
      expect(String(first.modelAnswer)).toContain('{name}');
      const again = await complete(viewed());
      expect(again.modelAnswer).toEqual(first.modelAnswer);
      expect(again.receipt).toBeUndefined();
    });

    it('SKIPPED é 409 COMPLETION_NOT_ALLOWED; a conclusão de outro Tipo não traz resposta-modelo', async () => {
      await expect(complete({ ...viewed(), outcome: 'SKIPPED' })).rejects.toMatchObject({
        status: 409,
        code: 'COMPLETION_NOT_ALLOWED',
      });
      const dialogue = STAGE.activities.find((activity) => activity.type === 'dialogue')!;
      const other = await complete({ ...viewed(), activityKey: dialogue.activityKey });
      expect(other).not.toHaveProperty('modelAnswer');
    });

    it('Extra Help certo: extraHelp, xp 6, expected do Tipo free e recibo', async () => {
      const right = await send('/api/v1/visitor/attempts', help(["I'm", 'from']));
      expect(right).toMatchObject({ outcome: 'GRADED', resultPct: 100, xpAwarded: 6, extraHelp: true });
      expect(right.expected).toEqual({
        type: 'free',
        items: [
          { itemKey: 'about-you-im', value: "I'm" },
          { itemKey: 'about-you-from', value: 'from' },
        ],
      });
      expect(right.receipt).toEqual(expect.any(String));
    });

    it('Extra Help parcial: 50, xp 3, sem expected', async () => {
      const partial = await send('/api/v1/visitor/attempts', help(["I'm", 'is']));
      expect(partial).toMatchObject({ resultPct: 50, xpAwarded: 3, extraHelp: true });
      expect(partial.expected).toBeUndefined();
    });

    it('depois da conclusão, a Tentativa é corrigida sem recibo', async () => {
      await complete(viewed());
      const later = await send('/api/v1/visitor/attempts', help(["I'm", 'from']));
      expect(later).toMatchObject({ resultPct: 100 });
      expect(later.receipt).toBeUndefined();
    });

    it('o reveal do Extra Help exige uma Tentativa corrigida: depois do VIEWED, 409 ATTEMPT_REQUIRED', async () => {
      await complete(viewed());
      await expect(send('/api/v1/visitor/attempts/reveal', help(['is', 'is']))).rejects.toMatchObject({
        status: 409,
        code: 'ATTEMPT_REQUIRED',
      });
      resetMockVisitorRecords();
      await send('/api/v1/visitor/attempts', help(['is', 'from']));
      const revealed = await send('/api/v1/visitor/attempts/reveal', help(['is', 'from']));
      expect(revealed).toMatchObject({ expected: { type: 'free' } });
    });

    it('a Answer das Lacunas não vale no Extra Help', async () => {
      const body = help(["I'm", 'from']);
      await expect(
        send('/api/v1/visitor/attempts', { ...body, type: 'gaps', answer: { ...body.answer, type: 'gaps' } }),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_ANSWER' });
    });
  });
});
