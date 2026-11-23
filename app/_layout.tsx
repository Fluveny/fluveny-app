import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { useMeta, useVersionStatus } from '../src/api/meta';
import { API_MOCK, startApiMocks } from '../src/api/mocks';
import { AppProviders, createQueryClient } from '../src/AppProviders';
import { useSessionExpiry } from '../src/auth/sessionEnd';
import { ColdStartScreen, isNoResponse } from '../src/ColdStartScreen';
import { isLegalPath } from '../src/legal/paths';
import { captureError, initSentry, wrapRoot } from '../src/observability/sentry';
import { clearReloadMark } from './atualize';
import { Column } from '../src/ui/Column';
import { FONTS } from '../src/ui/fonts';
import { color } from '../src/ui/tokens';

// No web, o initSentry agenda o SDK para depois do primeiro render (1.22).
initSentry();
SplashScreen.preventAutoHideAsync().catch(() => {});
// Com EXPO_PUBLIC_API_MOCK=1, o MSW sobe antes do primeiro render (MockGate):
// o /meta do SplashGate já sai para o mock.
const mocksReady = startApiMocks();

/**
 * Um só QueryClient para o App inteiro, fora do componente: o Router pode
 * remontar o layout raiz, e um cliente novo refaria o /meta (e o reportaria de novo).
 */
export const queryClient = createQueryClient();

/** Quanto a splash espera o /meta antes de mostrar o App mesmo assim. */
export const META_SPLASH_TIMEOUT_MS = 3000;

/**
 * Pilha raiz. Abaixo do `minAppVersion` (AD-11), só a tela "Atualize o app"
 * fica disponível: as outras rotas saem da pilha e não há para onde voltar. A
 * política e os termos (1.21) ficam fora dos dois guards: são texto estático e
 * abrem mesmo com o App desatualizado. Aqui também mora a reação ao 401 de
 * sessão no meio do uso (2.3): leva a Entrar.
 */
export function RootStack() {
  useSessionExpiry();
  const status = useVersionStatus();
  const outdated = status === 'outdated';
  useEffect(() => {
    // Versão ok de novo: a próxima tela de atualizar pode recarregar na hora.
    if (status === 'ok') clearReloadMark();
  }, [status]);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }}>
      <Stack.Protected guard={!outdated}>
        {/* Boas-vindas na raiz; pilha sem abas e sem cabeçalho (EXPERIENCE.md, Information Architecture). */}
        <Stack.Screen name="(public)" />
        <Stack.Screen name="(public)/em-breve" />
        <Stack.Screen name="(student)/player" />
        {/* O convite ao cadastro no lugar do Estágio 2 do Visitante (1.20). */}
        <Stack.Screen name="(student)/convite" />
        {/* Cadastro do Aluno adulto e os pronomes (2.1). */}
        <Stack.Screen name="(student)/cadastro" />
        {/* Entrar (2.3): pública; o 401 no meio do uso também leva para cá. */}
        <Stack.Screen name="(public)/entrar" />
        {/* O link do e-mail de confirmação (2.2): pública, com ou sem sessão. */}
        <Stack.Screen name="(public)/confirmar-email" />
        {/* Catálogo do kit (1.8): só abre com __DEV__; no release, redireciona para /. */}
        <Stack.Screen name="kit" />
      </Stack.Protected>
      <Stack.Protected guard={outdated}>
        <Stack.Screen name="atualize" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Screen name="(public)/privacidade" />
      <Stack.Screen name="(public)/termos" />
    </Stack>
  );
}

/** Fase da abertura: splash nativa, tela azul da partida a frio ou o App. */
export type StartPhase = 'splash' | 'cold' | 'app';

/**
 * Segura a splash até as fontes carregarem (ou falharem) e o /meta responder,
 * por no máximo {@link META_SPLASH_TIMEOUT_MS}. Com o /meta em dia, a
 * boas-vindas não aparece antes do bloqueio. Se o /meta falha antes do teto, o
 * App segue sem checar a versão. Se no teto ele ainda não respondeu, entra a
 * tela azul da partida a frio, que fica até o /meta responder (com dados ou com
 * um erro do servidor); sem resposta (NETWORK_ERROR), ela refaz o /meta.
 * Na política ou nos termos (1.21), a pilha aparece sem esperar o /meta, só as
 * fontes; a dispensa vale só enquanto a rota for legal: saindo dela com o /meta
 * pendente, volta a espera (a splash e, no teto, a tela azul).
 */
function SplashGate() {
  const legal = isLegalPath(usePathname());
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const fontsReady = fontsLoaded || fontError != null;
  const meta = useMeta();
  const [timedOut, setTimedOut] = useState(false);
  const [phase, setPhase] = useState<StartPhase>('splash');
  // "Respondeu": chegou o /meta ou um erro do servidor. Sem resposta ainda: pendente ou NETWORK_ERROR.
  const answered = meta.isSuccess || (meta.isError && !isNoResponse(meta.error));

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), META_SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fontError) captureError(fontError);
  }, [fontError]);

  // A fase só avança (splash → cold → app); ajustada no render, sem efeito.
  let next = phase;
  if (fontsReady && phase === 'splash') next = !meta.isPending ? 'app' : timedOut && !legal ? 'cold' : 'splash';
  else if (phase === 'cold' && answered) next = 'app';
  if (next !== phase) setPhase(next);
  // Página legal com o /meta pendente: a pilha aparece, sem mudar a fase.
  const legalBypass = legal && fontsReady && phase === 'splash';
  const visible = phase !== 'splash' || legalBypass;

  useEffect(() => {
    if (visible) SplashScreen.hideAsync().catch(() => {});
  }, [visible]);

  if (!visible) return null;

  return <Column>{phase === 'cold' ? <ColdStartScreen /> : <RootStack />}</Column>;
}

/**
 * Com o mock da API ligado, só monta o App depois que o MSW está no ar (a
 * splash continua na tela). Sem o mock, renderiza direto. Se o MSW falhar, o
 * App segue contra a API de verdade.
 */
function MockGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!API_MOCK);
  useEffect(() => {
    if (ready) return;
    mocksReady.then(
      () => setReady(true),
      (error: unknown) => {
        captureError(error);
        setReady(true);
      },
    );
  }, [ready]);
  return ready ? children : null;
}

export function RootLayout() {
  return (
    <AppProviders client={queryClient}>
      <StatusBar style="dark" />
      <MockGate>
        <SplashGate />
      </MockGate>
    </AppProviders>
  );
}

// O `Sentry.wrap` só no nativo; no web, o componente segue como está.
export default wrapRoot(RootLayout);
