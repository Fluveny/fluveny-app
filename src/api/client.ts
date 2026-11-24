// Cliente HTTP da API (AD-11). Toda requisição leva `X-App-Version` (versão do
// app.json) e `X-Fluveny-Client` (`web` ou `android`, AD-12). Sucesso sai de
// `{data}`; erro vira `ApiError{status, code}` a partir do problem+json. O
// `detail` e a mensagem crua nunca chegam à tela: o texto vem de
// `messageFor(code)` (errors.ts).
//
// Sessão (2.1): no web, o cookie `HttpOnly` da API vai com `credentials:
// 'include'` e o App nunca vê o token; no Android, o token do `expo-secure-store`
// vai como `Authorization: Bearer`.
//
// Sessão que acaba no meio do uso (2.3, AD-12): todo `ApiError` nasce em
// `request()`, e é ali, num ponto só, que um 401 avisa quem se inscreveu em
// `onUnauthenticated` (o `useSessionExpiry` da pilha raiz). O 401 de senha
// errada (`INVALID_CREDENTIALS`) também leva `WWW-Authenticate`: o `code` separa.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import appConfig from '../../app.json';
import { storedSessionToken } from '../auth/session';
import { captureError } from '../observability/sentry';
import { INVALID_CREDENTIALS, messageFor, NETWORK_ERROR, UNKNOWN_ERROR } from './errors';
import type { paths } from './schema';

export const APP_VERSION_HEADER = 'X-App-Version';
export const CLIENT_HEADER = 'X-Fluveny-Client';

export type ClientKind = 'web' | 'android';

/** Qual App faz a requisição: o build web ou o App Android (o único nativo). */
export function clientKind(): ClientKind {
  return Platform.OS === 'web' ? 'web' : 'android';
}

/** Versão do App, do `version` do app.json (a do binário, quando houver). */
export function appVersion(): string {
  return Constants.expoConfig?.version ?? appConfig.expo.version;
}

/** Tempo máximo de uma requisição. */
export const REQUEST_TIMEOUT_MS = 10_000;

let warnedMissingUrl = false;

/** Base da API, de `EXPO_PUBLIC_API_URL` (sem barra no fim). Ausente: avisa uma vez, fora dos testes. */
export function apiBaseUrl(): string {
  const url = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
  if (!url && !warnedMissingUrl && process.env.NODE_ENV !== 'test') {
    warnedMissingUrl = true;
    const error = new Error('EXPO_PUBLIC_API_URL não definida; as requisições vão para a origem atual');
    console.warn(`[api] ${error.message}`);
    captureError(error);
  }
  return url;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    // A mensagem é só para log e Sentry: status e código, nunca o corpo.
    super(`API ${status} ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** Texto pt-BR para mostrar ao aluno. */
  get userMessage(): string {
    return messageFor(this.code);
  }
}

type GetPaths = {
  [P in keyof paths]: paths[P] extends { get: { responses: { 200: unknown } } } ? P : never;
}[keyof paths];

type JsonOf<R> = R extends { content: { 'application/json': infer B } } ? B : never;

/** O `data` do envelope `{data, message?}` da resposta 200 de `GET path`. */
export type GetData<P extends GetPaths> =
  JsonOf<paths[P]['get']['responses'][200]> extends { data: infer D } ? D : never;

/** A resposta de sucesso com corpo de uma operação: a 200 ou, sem ela, a 201. */
type SuccessOf<O> = O extends { responses: infer R }
  ? R extends { 200: infer S }
    ? S
    : R extends { 201: infer S }
      ? S
      : never
  : never;

type PostPaths = {
  [P in keyof paths]: paths[P] extends {
    post: { requestBody?: unknown; responses: { 200: unknown } | { 201: unknown } };
  }
    ? P
    : never;
}[keyof paths];

/** O `data` do envelope `{data, message?}` da resposta 200 (ou 201) de `POST path`. */
export type PostData<P extends PostPaths> = JsonOf<SuccessOf<paths[P]['post']>> extends { data: infer D } ? D : never;

type PatchPaths = {
  [P in keyof paths]: paths[P] extends { patch: { requestBody?: unknown; responses: { 200: unknown } } } ? P : never;
}[keyof paths];

/** O `data` do envelope `{data, message?}` da resposta 200 de `PATCH path`. */
export type PatchData<P extends PatchPaths> =
  JsonOf<paths[P]['patch']['responses'][200]> extends { data: infer D } ? D : never;

/** O corpo JSON de `PATCH path`, como o contrato pede. */
export type PatchBody<P extends PatchPaths> = paths[P]['patch'] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

type AcceptedPaths = {
  [P in keyof paths]: paths[P] extends { post: { requestBody?: unknown; responses: { 202: unknown } } } ? P : never;
}[keyof paths];

/** O corpo JSON de `POST path` de uma rota que responde 202 sem corpo; `never` se a rota não pede corpo. */
export type AcceptedBody<P extends AcceptedPaths> = paths[P]['post'] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** Os argumentos de `postAccepted` depois do caminho: o corpo, se a rota pede um, e o `init`. */
type AcceptedArgs<P extends AcceptedPaths> = [AcceptedBody<P>] extends [never]
  ? [body?: undefined, init?: RequestInit]
  : [body: AcceptedBody<P>, init?: RequestInit];

/** O corpo JSON de `POST path`, como o contrato pede. */
export type PostBody<P extends PostPaths> = paths[P]['post'] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

type NoContentPaths = {
  [P in keyof paths]: paths[P] extends { post: { requestBody?: unknown; responses: { 204: unknown } } } ? P : never;
}[keyof paths];

/** O corpo JSON de `POST path` de uma rota que responde 204 sem corpo; `never` se a rota não pede corpo. */
export type NoContentBody<P extends NoContentPaths> = paths[P]['post'] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** Os argumentos de `postNoContent` depois do caminho: o corpo, se a rota pede um, e o `init`. */
type NoContentArgs<P extends NoContentPaths> = [NoContentBody<P>] extends [never]
  ? [body?: undefined, init?: RequestInit]
  : [body: NoContentBody<P>, init?: RequestInit];

type PutNoContentPaths = {
  [P in keyof paths]: paths[P] extends {
    put: { requestBody: { content: { 'application/json': unknown } }; responses: { 204: unknown } };
  }
    ? P
    : never;
}[keyof paths];

/** O corpo JSON de `PUT path` de uma rota que responde 204 sem corpo. */
export type PutBody<P extends PutNoContentPaths> = paths[P]['put'] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/**
 * Entrar e sair (2.3): o 401 deles não é sessão que acabou no meio. Entrar
 * mostra o próprio erro; o sair cuida da sessão local.
 */
const SESSION_PATHS: ReadonlySet<string> = new Set(['/api/v1/auth/login', '/api/v1/auth/logout']);

let unauthenticatedListener: (() => void) | null = null;

/**
 * Inscreve quem reage a um 401 de sessão (código diferente de
 * `INVALID_CREDENTIALS`, fora do entrar e do sair). Um só por vez: a inscrição nova troca a
 * anterior. Devolve a função que cancela.
 */
export function onUnauthenticated(listener: () => void): () => void {
  unauthenticatedListener = listener;
  return () => {
    if (unauthenticatedListener === listener) unauthenticatedListener = null;
  };
}

function notifyUnauthenticated(path: string, error: ApiError) {
  if (error.status !== 401 || error.code === INVALID_CREDENTIALS || SESSION_PATHS.has(path)) return;
  try {
    unauthenticatedListener?.();
  } catch (failure) {
    captureError(failure);
  }
}

const CODE = /^[A-Z][A-Z0-9_]*$/;

/** Rejeita assim que `signal` abortar, mesmo que a leitura do corpo não reaja ao abort. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** O `code` do problem+json; `UNKNOWN_ERROR` se o corpo não tiver. Abort sobe. */
async function problemCode(response: Response, signal: AbortSignal): Promise<string> {
  let body: unknown;
  try {
    body = await untilAborted(response.json() as Promise<unknown>, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    // Corpo vazio ou que não é JSON: cai no genérico.
    return UNKNOWN_ERROR;
  }
  if (body && typeof body === 'object' && 'code' in body) {
    const code = (body as { code: unknown }).code;
    if (typeof code === 'string' && CODE.test(code)) return code;
  }
  return UNKNOWN_ERROR;
}

async function readData<T>(response: Response, signal: AbortSignal): Promise<T> {
  if (!response.ok) {
    throw new ApiError(response.status, await problemCode(response, signal));
  }
  let body: unknown;
  try {
    body = await untilAborted(response.json() as Promise<unknown>, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError(response.status, UNKNOWN_ERROR);
  }
  if (!body || typeof body !== 'object' || !('data' in body)) {
    throw new ApiError(response.status, UNKNOWN_ERROR);
  }
  return (body as { data: T }).data;
}

/** Resposta sem corpo (202 ou 204): só confere o status; erro vira `ApiError` como em `readData`. */
async function readNothing(response: Response, signal: AbortSignal): Promise<void> {
  if (!response.ok) throw new ApiError(response.status, await problemCode(response, signal));
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  read: (response: Response, signal: AbortSignal) => Promise<T> = readData,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set(APP_VERSION_HEADER, appVersion());
  if (!headers.has('Accept')) headers.set('Accept', 'application/json, application/problem+json');
  const client = clientKind();
  // Sempre, inclusive nas rotas do Visitante: com o cookie, escrita sem ele dá 403.
  headers.set(CLIENT_HEADER, client);
  let credentials: RequestCredentials | undefined = init.credentials;
  if (client === 'web') {
    credentials = 'include';
  } else {
    const token = storedSessionToken();
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  }

  // Timeout próprio, somado ao `signal` de quem chamou, valendo até o fim da
  // leitura do corpo. Cancelamento de quem chamou sai como o AbortError
  // original; o timeout e a rede, como NETWORK_ERROR.
  const callerSignal = init.signal ?? undefined;
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener('abort', onCallerAbort);
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl()}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
        ...(credentials ? { credentials } : {}),
      });
    } catch (error) {
      if (callerSignal?.aborted) throw error;
      throw new ApiError(0, NETWORK_ERROR);
    }
    try {
      return await read(response, controller.signal);
    } catch (error) {
      if (error instanceof ApiError) notifyUnauthenticated(path, error);
      if (error instanceof ApiError || callerSignal?.aborted) throw error;
      // Timeout durante a leitura do corpo.
      throw new ApiError(0, NETWORK_ERROR);
    }
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

/** Os `{param}` do caminho do contrato: `'/units/{unitKey}'` → `'unitKey'`. */
type PathParamNames<P extends string> = P extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PathParamNames<Rest>
  : never;

export type PathParams<P extends string> = Record<PathParamNames<P>, string>;

/** Troca os `{param}` do caminho pelos valores, codificados para URL. */
export function fillPath<P extends string>(path: P, params: PathParams<P>): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = (params as Record<string, string | undefined>)[name];
    if (value === undefined) throw new Error(`parâmetro ${name} ausente em ${path}`);
    return encodeURIComponent(value);
  });
}

/** `GET` de uma rota com parâmetros: `getAt('/api/v1/units/{unitKey}', { unitKey: 'unit-1' })`. */
export function getAt<P extends GetPaths>(path: P, params: PathParams<P>, init?: RequestInit): Promise<GetData<P>> {
  return request<GetData<P>>(fillPath(path, params), { ...init, method: 'GET' });
}

/** `GET` tipado pelo contrato: devolve o `data` da resposta 200. */
export function get<P extends GetPaths>(path: P, init?: RequestInit): Promise<GetData<P>> {
  return request<GetData<P>>(path, { ...init, method: 'GET' });
}

/** `POST` tipado pelo contrato: manda `body` como JSON e devolve o `data` da resposta 200 (ou 201). */
export function post<P extends PostPaths>(path: P, body: PostBody<P>, init?: RequestInit): Promise<PostData<P>> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  return request<PostData<P>>(path, { ...init, method: 'POST', headers, body: JSON.stringify(body) });
}

/**
 * `POST` de uma rota que responde `202` sem corpo (os eventos do Visitante, 1.20).
 * Rota sem corpo de requisição (o reenvio da confirmação, 2.2) vai sem corpo e
 * sem `Content-Type`.
 */
export function postAccepted<P extends AcceptedPaths>(path: P, ...[body, init]: AcceptedArgs<P>): Promise<void> {
  const headers = new Headers(init?.headers);
  if (body === undefined) return request<void>(path, { ...init, method: 'POST', headers }, readNothing);
  headers.set('Content-Type', 'application/json');
  return request<void>(path, { ...init, method: 'POST', headers, body: JSON.stringify(body) }, readNothing);
}

/**
 * `POST` de uma rota que responde `204` sem corpo. Rota sem corpo de requisição
 * (o sair, 2.3) vai sem corpo e sem `Content-Type`; com corpo (a redefinição de
 * senha, 2.8), como JSON.
 */
export function postNoContent<P extends NoContentPaths>(path: P, ...[body, init]: NoContentArgs<P>): Promise<void> {
  const headers = new Headers(init?.headers);
  if (body === undefined) return request<void>(path, { ...init, method: 'POST', headers }, readNothing);
  headers.set('Content-Type', 'application/json');
  return request<void>(path, { ...init, method: 'POST', headers, body: JSON.stringify(body) }, readNothing);
}

/** `PATCH` tipado pelo contrato: manda `body` como JSON e devolve o `data` da resposta 200. */
export function patch<P extends PatchPaths>(path: P, body: PatchBody<P>, init?: RequestInit): Promise<PatchData<P>> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  return request<PatchData<P>>(path, { ...init, method: 'PATCH', headers, body: JSON.stringify(body) });
}

/** `PUT` de uma rota que responde `204` sem corpo (as respostas do Diálogo do Aluno, 2.9), com o corpo como JSON. */
export function putNoContent<P extends PutNoContentPaths>(
  path: P,
  body: PutBody<P>,
  init?: RequestInit,
): Promise<void> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  return request<void>(path, { ...init, method: 'PUT', headers, body: JSON.stringify(body) }, readNothing);
}
