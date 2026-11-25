// Handlers do MSW a partir de `mockRoutes`. O `*` no começo do caminho casa
// qualquer base (EXPO_PUBLIC_API_URL), e `{param}` do OpenAPI vira `:param`.
import { http, HttpResponse, type HttpHandler } from 'msw';

import { MOCK_CREATED, MOCK_METHODS, MOCK_NO_CONTENT, MockProblem, mockRoutes, problemBody } from './routes';

type Resolver = (request: Request) => unknown;

export function mswPath(openApiPath: string): string {
  return `*${openApiPath.replace(/\{([^}]+)\}/g, ':$1')}`;
}

/**
 * A resposta do mock: o corpo de sucesso (com `status`, 200 por padrão; 201 nas
 * rotas de `MOCK_CREATED`), sem corpo quando o mock não devolve nada (`202`, os
 * eventos do Visitante; `204` com `noContent`, o sair da 2.3), ou o
 * problem+json de um `MockProblem`.
 */
export async function mockResponse(
  resolve: Resolver,
  request: Request,
  status = 200,
  noContent = false,
): Promise<Response> {
  try {
    const body = await resolve(request);
    if (body === undefined) return new HttpResponse(null, { status: noContent ? 204 : 202 });
    return HttpResponse.json(body as never, { status });
  } catch (error) {
    if (!(error instanceof MockProblem)) throw error;
    return HttpResponse.json(problemBody(error), {
      status: error.status,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }
}

export const handlers: HttpHandler[] = Object.entries(mockRoutes).flatMap(([path, operations]) =>
  MOCK_METHODS.flatMap((method) => {
    const resolve = (operations as Partial<Record<string, Resolver>>)[method];
    if (!resolve) return [];
    const key = `${method.toUpperCase()} ${path}`;
    const status = MOCK_CREATED.has(key) ? 201 : 200;
    const noContent = MOCK_NO_CONTENT.has(key);
    return [http[method](mswPath(path), ({ request }) => mockResponse(resolve, request, status, noContent))];
  }),
);
