import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { META_QUERY_KEY, reportMetaError, watchAppFocus } from './api/meta';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1 } },
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.queryKey[0] === META_QUERY_KEY[0]) reportMetaError(error);
      },
    }),
  });
}

/** Providers do App: estado do servidor (TanStack Query) e área segura. */
export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  useEffect(() => watchAppFocus(), []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}
