// As rotas dos documentos legais, sem os textos: o layout raiz, a boas-vindas e o
// player as importam sem levar a política e os termos para o chunk deles.

export const PRIVACY_PATH = '/privacidade';
export const TERMS_PATH = '/termos';

/** Rótulos dos links para os documentos. */
export const PRIVACY_LINK = 'Política de privacidade';
export const TERMS_LINK = 'Termos de uso';

/** A rota é de um documento legal (texto estático: abre sem o `/meta` e fora do gate de versão). */
export function isLegalPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return path === PRIVACY_PATH || path === TERMS_PATH;
}
