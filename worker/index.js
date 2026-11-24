// Worker da Cloudflare de homologação (AD-18, história 1.6): serve o build web
// (`dist/`, com fallback de SPA, pela configuração de assets do wrangler.jsonc)
// e faz proxy de `/api/*` para a API, na mesma origem. Só `/api/*` passa por
// este código (`run_worker_first`); o resto vai direto para os assets.
//
// No proxy, o Worker repassa método, caminho, query, corpo e cabeçalhos do aluno,
// troca os `X-Fluveny-Proxy` e `X-Fluveny-Client-IP` que vierem do navegador
// pelos seus (o segredo de proxy e o `CF-Connecting-IP` que a borda escreveu) e
// não segue redirecionamento. O `CF-Connecting-IP` não serve para a API: o host
// dela também fica atrás do Cloudflare, que, na subrequisição, o troca pelo IP do
// Worker. Cabeçalhos de borda e de encaminhamento (`cf-*`, `x-forwarded-*`,
// `x-real-ip`, `forwarded`, `true-client-ip`) não seguem para a API.
//
// O Cron Trigger (`triggers.crons` do wrangler.jsonc) chama o handler `scheduled`,
// que faz `GET /api/v1/meta` direto no `API_ORIGIN` a cada 10 min, para a API do
// Render free nunca chegar aos ~15 min parada. Com ela dormindo, o Render barra o
// Worker com o desafio do Cloudflare (429), e quem a acorda é o `keep-warm.yml`
// da API. O `/api/v1/meta` é aberto: o ping vai sem o segredo de proxy. Se a API
// dormir mesmo assim (ping perdido, reinício do Render), as execuções falham até o
// próximo `keep-warm.yml` (só das 8h às 23h de Brasília; de madrugada, até as 8h)
// ou um deploy da API acordá-la; o `keep-warm.yml` também pode ser rodado à mão.

// Só o handler sai do módulo: o runtime de Workers trata todo export nomeado como
// handler e recusa a partida com uma constante exportada.
const PROXY_HEADER = 'X-Fluveny-Proxy';
const CLIENT_IP_HEADER = 'X-Fluveny-Client-IP';
const API_PREFIX = '/api/';
const DROPPED_HEADERS = ['host', 'x-real-ip', 'forwarded', 'true-client-ip'];
const DROPPED_PREFIXES = ['cf-', 'x-forwarded-'];
const PING_PATH = '/api/v1/meta';
const PING_TIMEOUT_MS = 60_000;

/**
 * @typedef {object} Env
 * @property {{ fetch: (request: Request) => Promise<Response> }} ASSETS binding dos assets do `dist/`
 * @property {string} API_ORIGIN origem da API, sem barra no fim (vars do wrangler.jsonc)
 * @property {string} [PROXY_SECRET] segredo de proxy (`wrangler secret put PROXY_SECRET`)
 */

/**
 * Resposta de erro em RFC 9457, no formato da API (`code` em SCREAMING_SNAKE).
 * @param {number} status
 * @param {string} code
 * @param {string} title
 * @param {string} detail
 * @returns {Response}
 */
function problem(status, code, title, detail) {
  return new Response(JSON.stringify({ type: 'about:blank', title, status, code, detail }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
  });
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function proxy(request, env) {
  const secret = env.PROXY_SECRET?.trim();
  if (!secret) {
    return problem(503, 'SERVICE_UNAVAILABLE', 'Service Unavailable', 'O proxy da API não está configurado.');
  }

  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env.API_ORIGIN);

  const headers = new Headers(request.headers);
  // O Host é o do destino; os cabeçalhos de borda e de encaminhamento ficam aqui; os
  // dois da borda do Fluveny só valem vindos do Worker.
  for (const name of [...headers.keys()]) {
    if (DROPPED_HEADERS.includes(name) || DROPPED_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      headers.delete(name);
    }
  }
  headers.delete(PROXY_HEADER);
  headers.delete(CLIENT_IP_HEADER);
  headers.set(PROXY_HEADER, secret);
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  try {
    return await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
    });
  } catch {
    return problem(502, 'BAD_GATEWAY', 'Bad Gateway', 'A API não respondeu.');
  }
}

/**
 * Ping do Cron Trigger. Lança fora de 2xx e na falha de rede, para o Cloudflare
 * marcar a execução como falha; a mensagem leva só o status, nunca o corpo.
 * @param {Env} env
 * @returns {Promise<void>}
 */
async function ping(env) {
  const target = new URL(PING_PATH, env.API_ORIGIN);
  let response;
  try {
    response = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'erro';
    throw new Error(`Ping de ${PING_PATH} falhou na rede (${reason}).`);
  }
  // Libera a conexão sem ler o corpo; um corpo com erro não esconde o status.
  await response.body?.cancel().catch(() => {});
  if (!response.ok) {
    throw new Error(`Ping de ${PING_PATH} respondeu ${response.status}.`);
  }
  console.log(`Ping de ${PING_PATH}: ${response.status}.`);
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(API_PREFIX)) return proxy(request, env);
    return env.ASSETS.fetch(request);
  },

  /**
   * @param {unknown} controller
   * @param {Env} env
   * @returns {Promise<void>}
   */
  async scheduled(controller, env) {
    await ping(env);
  },
};
