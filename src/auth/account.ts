// Conta do Aluno (2.9): dados (nome, país, pronomes), troca de senha e pedido
// de troca de e-mail. Senha e e-mail digitados só passam pelo corpo da
// requisição: nunca na URL, na loja, em log ou no Sentry.
import type { QueryClient } from '@tanstack/react-query';

import { ApiError, patch, postAccepted, postNoContent, type PatchBody } from '../api/client';
import { UNKNOWN_ERROR } from '../api/errors';
import { DASHBOARD_QUERY_KEY } from '../dashboard/dashboard';
import { captureError } from '../observability/sentry';
import { NAME_MAX } from './signupForm';
import { STUDENT_QUERY_KEY, type StudentProfile } from './student';

export const PROFILE_PATH = '/api/v1/students/me';
export const CHANGE_PASSWORD_PATH = '/api/v1/students/me/password';
export const EMAIL_CHANGE_PATH = '/api/v1/students/me/email';

export type ProfileChanges = Pick<PatchBody<'/api/v1/students/me'>, 'name' | 'country'>;

/** O resultado de uma ação da Conta: feita, ou o `code` do erro para o `messageFor`. */
export type AccountOutcome = { kind: 'ok' } | { kind: 'error'; code: string };

/** O nome da Conta: vazio ou só espaços limpa (vai `null`); senão, até 60 caracteres depois do `trim` (o limite da API). */
export function accountNameOk(value: string): boolean {
  return value.trim().length <= NAME_MAX;
}

/** Só o que mudou em relação ao perfil: nome (vazio é `null`) e país. */
export function profileChanges(
  student: Pick<StudentProfile, 'name' | 'country'>,
  name: string,
  country: string | null,
): ProfileChanges {
  const changes: ProfileChanges = {};
  const nextName = name.trim() === '' ? null : name.trim();
  if (nextName !== (student.name?.trim() || null)) changes.name = nextName;
  if (country !== (student.country ?? null)) changes.country = country;
  return changes;
}

function failure(error: unknown): AccountOutcome {
  if (error instanceof ApiError) return { kind: 'error', code: error.code };
  captureError(error);
  return { kind: 'error', code: UNKNOWN_ERROR };
}

/** O perfil devolvido vai para o cache; o painel (que traz o nome) é relido. */
function storeProfile(client: QueryClient, student: StudentProfile) {
  client.setQueryData(STUDENT_QUERY_KEY, student);
  void client.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
}

/** Grava só os campos mudados (`PATCH /students/me`). Nunca rejeita. */
export async function updateProfile(client: QueryClient, changes: ProfileChanges): Promise<AccountOutcome> {
  try {
    storeProfile(client, await patch(PROFILE_PATH, changes));
    return { kind: 'ok' };
  } catch (error) {
    return failure(error);
  }
}

/** Troca a senha com a senha atual (204; os outros aparelhos saem, este segue). Nunca rejeita. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<AccountOutcome> {
  try {
    await postNoContent(CHANGE_PASSWORD_PATH, { currentPassword, newPassword });
    return { kind: 'ok' };
  } catch (error) {
    return failure(error);
  }
}

/** Pede a troca de e-mail (202) e relê o perfil, que passa a trazer o `pendingEmail`. Nunca rejeita. */
export async function requestEmailChange(
  client: QueryClient,
  newEmail: string,
  currentPassword: string,
): Promise<AccountOutcome> {
  try {
    await postAccepted(EMAIL_CHANGE_PATH, { newEmail: newEmail.trim(), currentPassword });
  } catch (error) {
    return failure(error);
  }
  await client.refetchQueries({ queryKey: STUDENT_QUERY_KEY }).catch(captureError);
  return { kind: 'ok' };
}
