// Texto pt-BR por `code` do problem+json (AD-11). O App nunca mostra o `detail`
// nem a mensagem crua da resposta: só o texto deste catálogo. Os códigos são os
// da `platform` da API (ErrorCode.java); um `code` desconhecido usa o genérico.
// Tom: informal, direto, sem culpar o aluno (EXPERIENCE.md, Voice and Tone).
// [ASSUMPTION] Textos propostos na 1.3 (Decisão 1), a revisar com UX.

/** Código local, sem resposta do servidor (rede fora, tempo esgotado). */
export const NETWORK_ERROR = 'NETWORK_ERROR';

/** Código local, para resposta de erro sem `code` (corpo que não é problem+json). */
export const UNKNOWN_ERROR = 'UNKNOWN_ERROR';

export const GENERIC_MESSAGE = 'Tivemos um problema do nosso lado. Tente de novo daqui a pouco.';

export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  BAD_REQUEST: 'Não deu para concluir isso agora. Tente de novo.',
  VALIDATION_FAILED: 'Confira os dados e tente de novo.',
  INVALID_ID: 'Não encontramos o que você procurou. Tente voltar e abrir de novo.',
  UNAUTHENTICATED: 'Sua sessão terminou. Entre de novo para continuar de onde parou.',
  ACCESS_DENIED: 'Esta parte não está liberada para a sua conta.',
  NOT_FOUND: 'Não encontramos o que você procurou. Tente voltar e abrir de novo.',
  CONFLICT: 'Isso mudou enquanto você estava aqui. Atualize a tela e tente de novo.',
  PAYLOAD_TOO_LARGE: 'O envio ficou grande demais. Tente com menos conteúdo.',
  UNPROCESSABLE: 'Não deu para concluir isso agora. Tente de novo.',
  TOO_MANY_REQUESTS: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
  METHOD_NOT_ALLOWED: GENERIC_MESSAGE,
  NOT_ACCEPTABLE: GENERIC_MESSAGE,
  UNSUPPORTED_MEDIA_TYPE: GENERIC_MESSAGE,
  INTERNAL_ERROR: GENERIC_MESSAGE,
  [NETWORK_ERROR]: 'Sem conexão. Assim que a rede voltar, você continua daqui.',
};

/** O texto pt-BR para um `code`; o genérico para código desconhecido ou ausente. */
export function messageFor(code: string | undefined | null): string {
  if (!code || !Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code)) return GENERIC_MESSAGE;
  return ERROR_MESSAGES[code] ?? GENERIC_MESSAGE;
}
