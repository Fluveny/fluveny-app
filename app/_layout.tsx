import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { useVersionStatus } from '../src/api/meta';
import { AppProviders, createQueryClient } from '../src/AppProviders';
import { captureError, initSentry, Sentry } from '../src/observability/sentry';
import { clearReloadMark } from './atualize';
import { Column } from '../src/ui/Column';
import { FONTS } from '../src/ui/fonts';
import { color } from '../src/ui/tokens';

const sentryOn = initSentry();
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Um só QueryClient para o App inteiro, fora do componente: o Router pode
 * remontar o layout raiz, e um cliente novo refaria o /meta (e o reportaria de novo).
 */
export const queryClient = createQueryClient();

/** Quanto a splash espera o /meta antes de mostrar o App mesmo assim. */
export const META_SPLASH_TIMEOUT_MS = 3000;

/**
 * Pilha raiz. Abaixo do `minAppVersion` (AD-11), só a tela "Atualize o app"
 * fica disponível: as outras rotas saem da pilha e não há para onde voltar.
 */
export function RootStack() {
  const status = useVersionStatus();
  const outdated = status === 'outdated';
  useEffect(() => {
    // Versão ok de novo: a próxima tela de atualizar pode recarregar na hora.
    if (status === 'ok') clearReloadMark();
  }, [status]);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }}>
      <Stack.Protected guard={!outdated}>
        <Stack.Screen name="(public)" />
      </Stack.Protected>
      <Stack.Protected guard={outdated}>
        <Stack.Screen name="atualize" options={{ gestureEnabled: false }} />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * Segura a splash até as fontes carregarem (ou falharem) e o /meta responder,
 * por no máximo {@link META_SPLASH_TIMEOUT_MS}. Com o /meta em dia, a Home não
 * aparece antes do bloqueio. Depois do teto, a Home pode aparecer; se o /meta
 * chegar depois dizendo que a versão está abaixo do mínimo, a troca para
 * "Atualize o app" acontece nessa hora.
 */
function SplashGate() {
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const fontsReady = fontsLoaded || fontError != null;
  const checking = useVersionStatus() === 'checking';
  const [timedOut, setTimedOut] = useState(false);
  const ready = fontsReady && (!checking || timedOut);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), META_SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fontError) captureError(fontError);
  }, [fontError]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <Column>
      <RootStack />
    </Column>
  );
}

export function RootLayout() {
  return (
    <AppProviders client={queryClient}>
      <StatusBar style="dark" />
      <SplashGate />
    </AppProviders>
  );
}

export default sentryOn ? Sentry.wrap(RootLayout) : RootLayout;
