import openapi from '../../openapi.json';
import { MOCK_METHODS, mockRoutes } from '../routes';

type Schema = { properties?: Record<string, unknown> };

const components = (openapi as { components?: { schemas?: Record<string, Schema> } }).components?.schemas ?? {};

/** Campos que existem num schema `X` e não no `XStudentView` dele: os segredos da API. */
function secretFields(): Set<string> {
  const secrets = new Set<string>();
  for (const [name, schema] of Object.entries(components)) {
    if (!name.endsWith('StudentView')) continue;
    const full = components[name.slice(0, -'StudentView'.length)];
    if (!full?.properties) continue;
    const visible = new Set(Object.keys(schema.properties ?? {}));
    for (const key of Object.keys(full.properties)) if (!visible.has(key)) secrets.add(key);
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
