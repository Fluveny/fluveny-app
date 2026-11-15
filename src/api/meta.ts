// `GET /api/v1/meta` na abertura do App (AD-11). Abaixo do `minAppVersion`, o App
// fica preso na tela "Atualize o app". Se o /meta falhar (rede ou 5xx), o App
// segue sem bloquear; o erro vai para o log e o Sentry.
import { focusManager, useQuery } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { captureError } from '../observability/sentry';
import { ApiError, appVersion, get, type GetData } from './client';
import { NETWORK_ERROR } from './errors';
import { isBelow } from './semver';

export type Meta = GetData<'/api/v1/meta'>;

export const META_QUERY_KEY = ['meta'] as const;

export function fetchMeta(): Promise<Meta> {
  return get('/api/v1/meta');
}

/**
 * Registro único de falha do /meta: chamado pelo `onError` do QueryCache
 * (AppProviders), uma vez por falha final, por mais componentes que usem o hook.
 */
let lastReportedNetwork = false;

/** Um /meta respondeu: o próximo NETWORK_ERROR volta a ser reportado. */
export function resetMetaErrorReport(): void {
  lastReportedNetwork = false;
}

export function reportMetaError(error: unknown): void {
  // Sem rede, a tela azul refaz o /meta a cada poucos segundos: um NETWORK_ERROR
  // seguido de outro não é reportado de novo (volta a valer depois de um sucesso).
  const network = error instanceof ApiError && error.code === NETWORK_ERROR;
  if (network && lastReportedNetwork) return;
  lastReportedNetwork = network;
  const message = error instanceof Error ? error.message : String(error);
  console.warn('[meta] falha ao consultar /api/v1/meta; seguindo sem checar a versão', message);
  captureError(error);
}

/**
 * No nativo, o TanStack Query não sabe quando o App volta ao primeiro plano:
 * o `AppState` avisa o `focusManager`. No web, ele já usa o `visibilitychange`.
 */
export function watchAppFocus(): () => void {
  if (Platform.OS === 'web') return () => {};
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => subscription?.remove();
  });
  return () => focusManager.setEventListener(() => () => {});
}

/** O /meta é refeito sempre que o App volta ao primeiro plano. */
export function useMeta() {
  const query = useQuery({
    queryKey: META_QUERY_KEY,
    queryFn: fetchMeta,
    staleTime: Infinity,
    // O SplashGate e a pilha usam o hook: montar a pilha não refaz o /meta,
    // nem depois de uma falha (retryOnMount); só a volta ao primeiro plano refaz.
    refetchOnMount: false,
    retryOnMount: false,
    refetchOnWindowFocus: 'always',
  });
  return query;
}

export type VersionStatus = 'checking' | 'ok' | 'outdated';

/**
 * `outdated` só com resposta do /meta e versão do App abaixo do mínimo. Um /meta
 * sem `minAppVersion` válido não bloqueia.
 */
export function versionStatus(meta: Meta | undefined, isPending: boolean, version = appVersion()): VersionStatus {
  if (meta && typeof meta === 'object') {
    const minAppVersion: unknown = (meta as { minAppVersion?: unknown }).minAppVersion;
    return typeof minAppVersion === 'string' && isBelow(version, minAppVersion) ? 'outdated' : 'ok';
  }
  return isPending ? 'checking' : 'ok';
}

export function useVersionStatus(): VersionStatus {
  const { data, isPending } = useMeta();
  return versionStatus(data, isPending);
}
