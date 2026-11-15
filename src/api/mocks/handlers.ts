// Handlers do MSW a partir de `mockRoutes`. O `*` no começo do caminho casa
// qualquer base (EXPO_PUBLIC_API_URL), e `{param}` do OpenAPI vira `:param`.
import { http, HttpResponse, type HttpHandler } from 'msw';

import { MOCK_METHODS, mockRoutes } from './routes';

type Resolver = (request: Request) => unknown;

export function mswPath(openApiPath: string): string {
  return `*${openApiPath.replace(/\{([^}]+)\}/g, ':$1')}`;
}

export const handlers: HttpHandler[] = Object.entries(mockRoutes).flatMap(([path, operations]) =>
  MOCK_METHODS.flatMap((method) => {
    const resolve = (operations as Partial<Record<string, Resolver>>)[method];
    if (!resolve) return [];
    return [http[method](mswPath(path), ({ request }) => HttpResponse.json(resolve(request) as never))];
  }),
);
