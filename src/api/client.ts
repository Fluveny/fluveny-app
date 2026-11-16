// Cliente HTTP da API (AD-11). Toda requisição leva `X-App-Version` (versão do
// app.json). Sucesso sai de `{data}`; erro vira `ApiError{status, code}` a partir
// do problem+json. O `detail` e a mensagem crua nunca chegam à tela: o texto
// vem de `messageFor(code)` (errors.ts).
import Constants from 'expo-constants';

import appConfig from '../../app.json';
import { captureError } from '../observability/sentry';
import { messageFor, NETWORK_ERROR, UNKNOWN_ERROR } from './errors';
import type { paths } from './schema';

export const APP_VERSION_HEADER = 'X-App-Version';

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

type PostPaths = {
  [P in keyof paths]: paths[P] extends {
    post: { requestBody?: unknown; responses: { 200: unknown } };
  }
    ? P
    : never;
}[keyof paths];

/** O `data` do envelope `{data, message?}` da resposta 200 de `POST path`. */
export type PostData<P extends PostPaths> =
  JsonOf<paths[P]['post']['responses'][200]> extends { data: infer D } ? D : never;

/** O corpo JSON de `POST path`, como o contrato pede. */
export type PostBody<P extends PostPaths> = paths[P]['post'] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set(APP_VERSION_HEADER, appVersion());
  if (!headers.has('Accept')) headers.set('Accept', 'application/json, application/problem+json');

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
      response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers, signal: controller.signal });
    } catch (error) {
      if (callerSignal?.aborted) throw error;
      throw new ApiError(0, NETWORK_ERROR);
    }
    try {
      return await readData<T>(response, controller.signal);
    } catch (error) {
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

/** `POST` tipado pelo contrato: manda `body` como JSON e devolve o `data` da resposta 200. */
export function post<P extends PostPaths>(path: P, body: PostBody<P>, init?: RequestInit): Promise<PostData<P>> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  return request<PostData<P>>(path, { ...init, method: 'POST', headers, body: JSON.stringify(body) });
}
