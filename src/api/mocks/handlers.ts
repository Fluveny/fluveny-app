// Handlers do MSW a partir de `mockRoutes`. O `*` no começo do caminho casa
// qualquer base (EXPO_PUBLIC_API_URL), e `{param}` do OpenAPI vira `:param`.
import { http, HttpResponse, type HttpHandler } from 'msw';

import { MOCK_METHODS, MockProblem, mockRoutes, problemBody } from './routes';

type Resolver = (request: Request) => unknown;

export function mswPath(openApiPath: string): string {
  return `*${openApiPath.replace(/\{([^}]+)\}/g, ':$1')}`;
}

/** A resposta do mock: o corpo de sucesso, ou o problem+json de um `MockProblem`. */
export async function mockResponse(resolve: Resolver, request: Request): Promise<Response> {
  try {
    return HttpResponse.json((await resolve(request)) as never);
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
    return [http[method](mswPath(path), ({ request }) => mockResponse(resolve, request))];
  }),
);
