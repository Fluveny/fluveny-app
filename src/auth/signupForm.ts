// Validação local do cadastro (2.1): as mesmas regras da API, conferidas antes
// de enviar para o aluno saber na hora o que falta. Quem decide no fim é a API
// (`RegisterStudent`, `PasswordPolicy`). Textos da tela em pt-BR.
// [ASSUMPTION] Textos dos campos propostos na 2.1, a revisar com UX.

export const NAME_MAX = 60;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;
/** O BCrypt da API só lê os primeiros 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;
/** O Fluveny é só para maiores de idade (FR-2, 2.12). */
export const MINIMUM_AGE = 18;

export const EMAIL_PROBLEM = 'Check your email: it needs to look like name@example.com.';
export const DATE_FORMAT_PROBLEM = 'Write the date as DD/MM/YYYY.';
export const DATE_PROBLEM = 'Check your date of birth.';
/** A mesma frase da `PasswordPolicy` da API. */
export const PASSWORD_PROBLEM =
  'Your password needs 8 to 64 characters, with at least one letter and one number. Passwords with many accents or emoji may need to be shorter.';
export const PASSWORD_HINT = '8 to 64 characters, with at least one letter and one number.';
/** Em inglês, como todo o App do Aluno (o resto da tela muda na 1.23). */
export const AGE_BELOW_TEXT = 'Fluveny is for people 18 and older.';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Só os dígitos, com as barras de `DD/MM/AAAA` no lugar (máscara do campo de nascimento). */
export function maskBirthDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export type BirthDate = { year: number; month: number; day: number };

/** `DD/MM/AAAA` que existe no calendário; `null` fora do formato ou data que não existe. */
export function parseBirthDate(text: string): BirthDate | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** `yyyy-MM-dd`, como a API recebe. */
export function isoDate({ year, month, day }: BirthDate): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

/**
 * A idade em anos completos em `today` (o dia do aparelho; a API usa o dia de
 * São Paulo e decide no fim); `null` para data futura ou antes de 1900.
 */
export function ageOn(birth: BirthDate, today: Date = new Date()): number | null {
  const [year, month, day] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  const future =
    birth.year > year || (birth.year === year && (birth.month > month || (birth.month === month && birth.day > day)));
  if (future || birth.year < 1900) return null;
  const beforeBirthday = month < birth.month || (month === birth.month && day < birth.day);
  return year - birth.year - (beforeBirthday ? 1 : 0);
}

/** Bytes em UTF-8, sem depender do `TextEncoder`. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** A senha segue a regra da API: 8 a 64 caracteres, letra e número, até 72 bytes [ASSUMPTION]. */
export function passwordOk(password: string): boolean {
  const length = [...password].length;
  return (
    length >= PASSWORD_MIN &&
    length <= PASSWORD_MAX &&
    /\p{L}/u.test(password) &&
    /\p{Nd}/u.test(password) &&
    utf8Length(password) <= PASSWORD_MAX_BYTES
  );
}

export function emailOk(email: string): boolean {
  const value = email.trim();
  return value.length <= EMAIL_MAX && EMAIL.test(value);
}

export type SignupValues = { name: string; email: string; birthDate: string; password: string; accepted: boolean };

/** A faixa de idade da data digitada, quando ela está completa e existe. */
export type AgeBand = 'below' | 'adult';

export function ageBand(birthDate: string, today?: Date): AgeBand | null {
  const birth = parseBirthDate(birthDate);
  const age = birth ? ageOn(birth, today) : null;
  if (age === null) return null;
  return age < MINIMUM_AGE ? 'below' : 'adult';
}

export type SignupProblems = Partial<Record<'email' | 'birthDate' | 'password', string>> & { accepted?: true };

/**
 * O que falta em cada campo; vazio quando dá para enviar. Menor de 18 não envia (2.12).
 * Sem aceite, `accepted` só barra o envio: a tela já deixa o CRIAR CONTA desabilitado.
 */
export function signupProblems(values: SignupValues, today?: Date): SignupProblems {
  const problems: SignupProblems = {};
  if (!emailOk(values.email)) problems.email = EMAIL_PROBLEM;
  const birth = parseBirthDate(values.birthDate);
  if (!birth) problems.birthDate = values.birthDate.length < 10 ? DATE_FORMAT_PROBLEM : DATE_PROBLEM;
  else {
    const band = ageBand(values.birthDate, today);
    if (band === null) problems.birthDate = DATE_PROBLEM;
    else if (band === 'below') problems.birthDate = AGE_BELOW_TEXT;
  }
  if (!passwordOk(values.password)) problems.password = PASSWORD_PROBLEM;
  if (!values.accepted) problems.accepted = true;
  return problems;
}
