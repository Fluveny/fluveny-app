// No web, a sessão é só o cookie `fluveny_session` (HttpOnly; Secure;
// SameSite=Lax), que o navegador manda com `credentials: 'include'` (AD-12, 2.1).
// Nenhum token em `localStorage` nem em memória: o JavaScript nunca o vê.

export function storedSessionToken(): string | null {
  return null;
}

export async function saveSessionToken(_token: string): Promise<void> {}

export async function clearSessionToken(): Promise<void> {}

export function forgetCachedSession(): void {}
