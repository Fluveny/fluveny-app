import openapi from '../../openapi.json';
import { MOCK_METHODS, mockRoutes } from '../routes';

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

  it('só trazem a visão do aluno, sem campos secretos', () => {
    const secrets = secretFields();
    const leaked = Object.entries(routes).flatMap(([path, operations]) =>
      Object.entries(operations).flatMap(([method, resolve]) =>
        [...keysOf(resolve?.(new Request(`http://mock${path}`)))]
          .filter((key) => secrets.has(key))
          .map((key) => `${method.toUpperCase()} ${path}: ${key}`),
      ),
    );
    expect(leaked).toEqual([]);
  });
});
