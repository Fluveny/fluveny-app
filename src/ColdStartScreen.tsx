import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from './api/client';
import { NETWORK_ERROR } from './api/errors';
import { useMeta } from './api/meta';
import { useOnline } from './network/useOnline';
import { OFFLINE_TEXT } from './network/text';
import { AlexWave, StatusBanner } from './ui';
import { color, spacing, typography } from './ui/tokens';

// [ASSUMPTION] Copy da partida a frio do servidor (EXPERIENCE.md, Estados; PRD §8.4).
export const COLD_START_TEXT = 'Acordando o campus… isso pode levar alguns segundos.';

/** Intervalo entre as novas tentativas do /meta quando ele falha sem resposta [ASSUMPTION]. */
export const COLD_START_RETRY_MS = 3000;

const ALEX_SIZE = 220;

/** O /meta falhou sem resposta do servidor (rede fora ou tempo esgotado). */
export function isNoResponse(error: unknown): boolean {
  return error instanceof ApiError && error.code === NETWORK_ERROR;
}

/**
 * Tela azul da partida a frio: aparece quando o /meta não responde no teto da
 * splash e fica até ele responder. Sem resposta (NETWORK_ERROR, inclusive o
 * tempo esgotado), refaz o /meta a cada {@link COLD_START_RETRY_MS}. A faixa sem
 * conexão aparece só quando o aparelho está offline.
 */
export function ColdStartScreen() {
  const meta = useMeta();
  const online = useOnline();
  const { refetch, isFetching } = meta;

  useEffect(() => {
    if (!meta.isError || isFetching) return;
    const timer = setTimeout(() => void refetch(), COLD_START_RETRY_MS);
    return () => clearTimeout(timer);
  }, [meta.isError, isFetching, refetch, meta.errorUpdatedAt]);

  return (
    <SafeAreaView style={styles.screen} testID="cold-start">
      {!online ? (
        <View style={styles.banner}>
          <StatusBanner tone="offline" text={OFFLINE_TEXT} />
        </View>
      ) : null}
      <View style={styles.content}>
        <AlexWave size={ALEX_SIZE} />
        <Text style={styles.text} accessibilityRole="header" accessibilityLiveRegion="polite">
          {COLD_START_TEXT}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.blue },
  banner: { paddingHorizontal: spacing.screenX, paddingTop: spacing[2] },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
    paddingHorizontal: spacing.screenX,
  },
  text: { ...typography.title, color: color.surface, textAlign: 'center' },
});
