import openapi from '../../openapi.json';
import { randomUUID } from 'node:crypto';

import { MOCK_METHODS, MockProblem, mockRoutes, resetMockVisitorRecords } from '../routes';

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

  it('só trazem a visão do aluno, sem campos secretos', async () => {
    const secrets = secretFields();
    const leaked: string[] = [];
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
            : undefined;
        for (const key of keysOf(await resolve?.(new Request(`http://mock${path}`, init)))) {
          if (secrets.has(key)) leaked.push(`${method.toUpperCase()} ${path}: ${key}`);
        }
      }
    }
    expect(leaked).toEqual([]);
  });
});

const STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
type StageActivity = (typeof STAGE.activities)[number];
type ChoiceView = Extract<StageActivity, { type: 'choice' }>;
const CHOICES = STAGE.activities.filter((activity): activity is ChoiceView => activity.type === 'choice');
const DIALOGUE = STAGE.activities.find((activity) => activity.type === 'dialogue')!;
const THREE_ITEMS = CHOICES[0]!;

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
    expect(first.expected?.items).toHaveLength(3);
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
    const right = new Map(revealed.expected!.items.map((item) => [item.itemKey, item.optionKey]));
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
});
