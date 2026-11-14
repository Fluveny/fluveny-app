import Constants from 'expo-constants';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import appConfig from '../app.json';
import { captureError } from '../src/observability/sentry';
import { AlexWave } from '../src/ui/art/Alex';
import { Button } from '../src/ui/Button';
import { color, spacing, typography } from '../src/ui/tokens';

// [ASSUMPTION] Proposta mínima da 1.3 (Decisão 1): texto e forma a revisar com UX.
export const UPDATE_TITLE = 'Tem versão nova do Fluveny';
export const UPDATE_BODY = 'Atualize o app para continuar de onde parou.';
export const UPDATE_BUTTON = 'ATUALIZAR';
// [ASSUMPTION] Loop 1: o reload no web já foi tentado há pouco (a versão nova ainda não chegou).
export const UPDATE_PENDING = 'Ainda estamos publicando a versão nova. Tente de novo em alguns minutos.';
// [ASSUMPTION] Loop 2: a loja não abriu no Android.
export const STORE_FAILED = 'Não conseguimos abrir a loja. Procure Fluveny na Google Play.';

/** Chave do `sessionStorage` com o horário (ms) do último reload tentado nesta sessão. */
export const RELOAD_KEY = 'fluveny:update-reloaded';

/** Depois deste intervalo, o botão pode recarregar de novo. */
export const RELOAD_RETRY_MS = 5 * 60 * 1000;

const ALEX_SIZE = 180;

/** Endereço da loja: `EXPO_PUBLIC_STORE_URL` ou a página do pacote na Play. */
export function storeUrl(): string {
  const configured = process.env.EXPO_PUBLIC_STORE_URL?.trim();
  if (configured) return configured;
  const pkg = Constants.expoConfig?.android?.package ?? appConfig.expo.android.package;
  return `https://play.google.com/store/apps/details?id=${pkg}`;
}

type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Marca em memória, quando o `sessionStorage` lança (modo privado, bloqueado). */
let memoryMark: number | null = null;

function webStorage(): SessionStore | undefined {
  return typeof window !== 'undefined' ? window.sessionStorage : undefined;
}

function readMark(storage: SessionStore | undefined): number | null {
  try {
    const value = storage?.getItem(RELOAD_KEY);
    return value ? Number(value) : null;
  } catch {
    return memoryMark;
  }
}

function writeMark(storage: SessionStore | undefined, at: number): void {
  try {
    if (!storage) throw new Error('sem sessionStorage');
    storage.setItem(RELOAD_KEY, String(at));
  } catch {
    memoryMark = at;
  }
}

/** Limpa a marca de reload; chamado quando o /meta volta a dizer que a versão está ok. */
export function clearReloadMark(storage: SessionStore | undefined = webStorage()): void {
  memoryMark = null;
  try {
    storage?.removeItem(RELOAD_KEY);
  } catch {
    // Sem storage: a marca em memória já foi limpa.
  }
}

/**
 * Web: recarrega, no máximo uma vez a cada {@link RELOAD_RETRY_MS}. Devolve
 * `false` quando o último reload foi há pouco (a versão nova ainda não chegou).
 */
export function reloadOnce(storage: SessionStore | undefined, reload: () => void, now = Date.now()): boolean {
  const last = readMark(storage);
  if (last !== null && Number.isFinite(last) && now - last < RELOAD_RETRY_MS) return false;
  writeMark(storage, now);
  reload();
  return true;
}

type UpdateResult = 'ok' | 'pending' | 'store-failed';

/** Abre a loja ou recarrega; diz o que mostrar quando não deu. */
export async function update(): Promise<UpdateResult> {
  if (Platform.OS === 'web') {
    return reloadOnce(webStorage(), () => window.location.reload()) ? 'ok' : 'pending';
  }
  try {
    await Linking.openURL(storeUrl());
    return 'ok';
  } catch (error) {
    captureError(error);
    return 'store-failed';
  }
}

const NOTICE: Record<Exclude<UpdateResult, 'ok'>, string> = {
  pending: UPDATE_PENDING,
  'store-failed': STORE_FAILED,
};

/** Tela bloqueante quando a versão do App está abaixo do `minAppVersion` (AD-11). */
export default function UpdateRequired() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await update();
      setNotice(result === 'ok' ? null : NOTICE[result]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <AlexWave size={ALEX_SIZE} />
        <Text style={styles.title} accessibilityRole="header">
          {UPDATE_TITLE}
        </Text>
        <Text style={styles.body}>{UPDATE_BODY}</Text>
        {notice ? (
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Button label={UPDATE_BUTTON} busy={busy} onPress={onPress} fullWidth />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas, paddingHorizontal: spacing.screenX },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  title: { ...typography.h1, color: color.ink, textAlign: 'center' },
  body: { ...typography.body, color: color.mutedStrong, textAlign: 'center' },
  footer: { paddingBottom: spacing[6] },
});
