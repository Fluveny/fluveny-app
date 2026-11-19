// Handlers do MSW a partir de `mockRoutes`. O `*` no começo do caminho casa
// qualquer base (EXPO_PUBLIC_API_URL), e `{param}` do OpenAPI vira `:param`.
import { http, HttpResponse, type HttpHandler } from 'msw';

import { MOCK_CREATED, MOCK_METHODS, MockProblem, mockRoutes, problemBody } from './routes';

type Resolver = (request: Request) => unknown;

export function mswPath(openApiPath: string): string {
  return `*${openApiPath.replace(/\{([^}]+)\}/g, ':$1')}`;
}

/**
 * A resposta do mock: o corpo de sucesso (com `status`, 200 por padrão; 201 nas
 * rotas de `MOCK_CREATED`), `202` sem corpo quando o mock não devolve nada (os
 * eventos do Visitante), ou o problem+json de um `MockProblem`.
 */
export async function mockResponse(resolve: Resolver, request: Request, status = 200): Promise<Response> {
  try {
    const body = await resolve(request);
    if (body === undefined) return new HttpResponse(null, { status: 202 });
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
    const status = MOCK_CREATED.has(`${method.toUpperCase()} ${path}`) ? 201 : 200;
    return [http[method](mswPath(path), ({ request }) => mockResponse(resolve, request, status))];
  }),
);
