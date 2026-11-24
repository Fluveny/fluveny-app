// Texto pt-BR por `code` do problem+json (AD-11). O App nunca mostra o `detail`
// nem a mensagem crua da resposta: só o texto deste catálogo. Os códigos são os
// da `platform` da API (ErrorCode.java); um `code` desconhecido usa o genérico.
// Tom: informal, direto, sem culpar o aluno (EXPERIENCE.md, Voice and Tone).
// [ASSUMPTION] Textos propostos na 1.3 (Decisão 1), a revisar com UX.

/** Código local, sem resposta do servidor (rede fora, tempo esgotado). */
export const NETWORK_ERROR = 'NETWORK_ERROR';

/** Código local, para resposta de erro sem `code` (corpo que não é problem+json). */
export const UNKNOWN_ERROR = 'UNKNOWN_ERROR';

/** Senha errada ou e-mail desconhecido no login (2.3): o 401 que não é sessão vencida. */
export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';

/** Tentativa, reveal ou conclusão do Aluno num Estágio que a sequência ainda não liberou (2.5). */
export const STAGE_LOCKED = 'STAGE_LOCKED';

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
  ATTEMPT_REQUIRED: 'Responda a Atividade antes de ver a resposta.',
  COMPLETION_NOT_ALLOWED: 'Não deu para concluir esta Atividade assim. Volte e abra de novo.',
  TOO_MANY_REQUESTS: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
  // Cadastro (2.1). [ASSUMPTION] Textos propostos na 2.1, a revisar com UX.
  EMAIL_ALREADY_REGISTERED: 'Este e-mail já tem uma conta. Você pode entrar ou recuperar a senha.',
  AGE_BELOW_MINIMUM: 'O Fluveny é para quem tem 12 anos ou mais.',
  GUARDIAN_CONSENT_REQUIRED: 'Por enquanto, o cadastro é só para quem tem 18 anos ou mais.',
  // Confirmação de e-mail (2.2). [ASSUMPTION] Textos propostos na 2.2, a revisar com UX.
  CONFIRMATION_LINK_INVALID: 'Este link não vale mais. Peça um novo e-mail de confirmação na tela inicial do Fluveny.',
  EMAIL_ALREADY_CONFIRMED: 'Seu e-mail já está confirmado.',
  // Entrar (2.3). [ASSUMPTION] Textos propostos na 2.3, a revisar com UX.
  [INVALID_CREDENTIALS]: 'E-mail ou senha incorretos.',
  ACCOUNT_DEACTIVATED: 'Esta conta está desativada.',
  LOGIN_THROTTLED: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
  // Recuperação de senha (2.8). [ASSUMPTION] Texto proposto na 2.8, a revisar com UX.
  PASSWORD_RESET_LINK_INVALID: 'Este link de redefinição não vale mais. Peça outro.',
  // Conta (2.9). [ASSUMPTION: copy] Textos propostos na 2.9, a revisar com UX.
  CURRENT_PASSWORD_INVALID: 'A senha atual está incorreta.',
  EMAIL_CHANGE_LINK_INVALID: 'Este link não vale mais. Peça a troca de novo.',
  // Exclusão da conta (2.10). [ASSUMPTION: copy] Texto proposto na 2.10, a revisar com UX.
  ACCOUNT_DELETION_FAILED: 'Não conseguimos excluir sua conta agora. Tente de novo.',
  // Painel e sequência (2.5). [ASSUMPTION: copy] Texto proposto na 2.5, a revisar com UX.
  [STAGE_LOCKED]: 'Este Estágio ainda está bloqueado. Conclua o Estágio anterior para desbloquear.',
  CLIENT_HEADER_REQUIRED: GENERIC_MESSAGE,
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
