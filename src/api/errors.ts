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

export const GENERIC_MESSAGE = 'Something went wrong on our side. Try again in a moment.';

export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  BAD_REQUEST: "We couldn't finish this right now. Try again.",
  VALIDATION_FAILED: 'Check what you typed and try again.',
  INVALID_ID: "We couldn't find what you were looking for. Go back and open it again.",
  UNAUTHENTICATED: 'Your session ended. Sign in again to pick up where you left off.',
  ACCESS_DENIED: "This part isn't available for your account.",
  NOT_FOUND: "We couldn't find what you were looking for. Go back and open it again.",
  CONFLICT: 'This changed while you were here. Refresh the screen and try again.',
  PAYLOAD_TOO_LARGE: 'What you sent is too big. Try with less.',
  UNPROCESSABLE: "We couldn't finish this right now. Try again.",
  ATTEMPT_REQUIRED: 'Answer the activity before you see the answer.',
  COMPLETION_NOT_ALLOWED: "We couldn't finish this activity like this. Go back and open it again.",
  TOO_MANY_REQUESTS: 'Too many tries in a row. Wait a bit and try again.',
  // Cadastro (2.1). [ASSUMPTION] Textos propostos na 2.1, a revisar com UX.
  EMAIL_ALREADY_REGISTERED: 'This email already has an account. You can sign in or reset your password.',
  AGE_BELOW_MINIMUM: 'Fluveny is for people 18 and older.',
  // Confirmação de e-mail (2.2). [ASSUMPTION] Textos propostos na 2.2, a revisar com UX.
  CONFIRMATION_LINK_INVALID:
    "This link doesn't work anymore. Ask for a new confirmation email on the Fluveny home screen.",
  EMAIL_ALREADY_CONFIRMED: 'Your email is already confirmed.',
  // Entrar (2.3). [ASSUMPTION] Textos propostos na 2.3, a revisar com UX.
  [INVALID_CREDENTIALS]: "The email or password isn't right.",
  ACCOUNT_DEACTIVATED: 'This account is deactivated.',
  LOGIN_THROTTLED: 'Too many tries in a row. Wait a bit and try again.',
  // Recuperação de senha (2.8). [ASSUMPTION] Texto proposto na 2.8, a revisar com UX.
  PASSWORD_RESET_LINK_INVALID: "This reset link doesn't work anymore. Ask for a new one.",
  // Conta (2.9). [ASSUMPTION: copy] Textos propostos na 2.9, a revisar com UX.
  CURRENT_PASSWORD_INVALID: "Your current password isn't right.",
  EMAIL_CHANGE_LINK_INVALID: "This link doesn't work anymore. Ask for the change again.",
  // Exclusão da conta (2.10). [ASSUMPTION: copy] Texto proposto na 2.10, a revisar com UX.
  ACCOUNT_DELETION_FAILED: "We couldn't delete your account right now. Try again.",
  // Painel e sequência (2.5). [ASSUMPTION: copy] Texto proposto na 2.5, a revisar com UX.
  [STAGE_LOCKED]: 'This stage is still locked. Finish the previous stage to unlock it.',
  CLIENT_HEADER_REQUIRED: GENERIC_MESSAGE,
  METHOD_NOT_ALLOWED: GENERIC_MESSAGE,
  NOT_ACCEPTABLE: GENERIC_MESSAGE,
  UNSUPPORTED_MEDIA_TYPE: GENERIC_MESSAGE,
  INTERNAL_ERROR: GENERIC_MESSAGE,
  [NETWORK_ERROR]: "No connection. You'll pick up right here when you're back online.",
};

/** O texto pt-BR para um `code`; o genérico para código desconhecido ou ausente. */
export function messageFor(code: string | undefined | null): string {
  if (!code || !Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code)) return GENERIC_MESSAGE;
  return ERROR_MESSAGES[code] ?? GENERIC_MESSAGE;
}
