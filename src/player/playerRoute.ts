// O endereço do player do Aluno (2.5): `/player?unidade=…&estagio=…&atividade=…`.
// Os três parâmetros são chaves do conteúdo (`^[a-z0-9]+(-[a-z0-9]+)*$`, até
// 128 caracteres); valor fora do formato é ignorado. Assim o `volta` de Entrar
// (UX-DR118) só leva a uma rota da lista fechada com chaves bem formadas.

export const PLAYER_PATH = '/player';

/** O formato das chaves do conteúdo (`unitKey`, `stageKey`, `activityKey`). */
const CONTENT_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONTENT_KEY_MAX = 128;

/** Os parâmetros do player, na ordem em que vão na URL. */
export const PLAYER_PARAMS = ['unidade', 'estagio', 'atividade'] as const;
export type PlayerParam = (typeof PLAYER_PARAMS)[number];
export type PlayerTarget = Partial<Record<PlayerParam, string>>;

/** A chave, se o valor for uma chave do conteúdo; senão, `undefined`. Lista vira o primeiro valor. */
export function contentKey(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string' || first.length > CONTENT_KEY_MAX || !CONTENT_KEY.test(first)) return undefined;
  return first;
}

/** Só os parâmetros válidos do player, de um objeto de parâmetros qualquer. */
export function playerTarget(params: Record<string, unknown>): PlayerTarget {
  const target: PlayerTarget = {};
  for (const name of PLAYER_PARAMS) {
    const key = contentKey(params[name]);
    if (key) target[name] = key;
  }
  return target;
}

/** `/player` com os parâmetros válidos, na ordem fixa (sem nenhum, só `/player`). */
export function playerHref(target: PlayerTarget): `/player` | `/player?${string}` {
  const query = PLAYER_PARAMS.flatMap((name) => {
    const key = contentKey(target[name]);
    return key ? [`${name}=${key}`] : [];
  }).join('&');
  return query ? `${PLAYER_PATH}?${query}` : PLAYER_PATH;
}
