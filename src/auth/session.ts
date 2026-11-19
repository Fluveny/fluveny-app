// Sessão do Aluno no Android (AD-12, 2.1): o `sessionToken` do cadastro fica no
// `expo-secure-store` (Keystore do Android) e vai como `Authorization: Bearer`.
// No web, a sessão é o cookie `HttpOnly` da API e este módulo não guarda nada
// (`session.web.ts`). O token nunca vai para log, Sentry nem outra loja.
import * as SecureStore from 'expo-secure-store';

const KEY = 'fluveny.session';

/** Cópia em memória: `undefined` enquanto não leu o armazenamento seguro. */
let cached: string | null | undefined;

/** O token guardado, ou `null`. Leitura síncrona, para decidir a primeira tela sem esperar. */
export function storedSessionToken(): string | null {
  if (cached === undefined) {
    try {
      cached = SecureStore.getItem(KEY);
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Guarda o token do cadastro (e, na 2.3, do login). */
export async function saveSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
  cached = token;
}

/** Apaga o token (o sair da 2.3). */
export async function clearSessionToken(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(KEY);
}

/** Esquece a cópia em memória (testes: "reabrir o App"). */
export function forgetCachedSession(): void {
  cached = undefined;
}
