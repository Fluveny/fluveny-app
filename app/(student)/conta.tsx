import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../../src/api/client';
import { messageFor } from '../../src/api/errors';
import { AccountScreen, BACK_LABEL } from '../../src/auth/AccountScreen';
import { useLeave } from '../../src/auth/FormFrame';
import { Button, TextLink } from '../../src/ui';
import { useStudent } from '../../src/auth/student';
import { color, spacing, typography } from '../../src/ui/tokens';

export const ACCOUNT_LOADING = 'Carregando a conta';
export const ACCOUNT_RETRY = 'TENTAR DE NOVO';

/** A Conta (2.9), logada: sem sessão, volta à raiz. */
export default function Account() {
  const { data, error, isPending, isFetching, refetch } = useStudent();
  const leave = useLeave();
  if (data === null) return <Redirect href="/" />;
  if (data) return <AccountScreen student={data} />;
  return (
    <SafeAreaView style={styles.screen} testID="account-loading">
      <View style={styles.center}>
        {isPending && !error ? (
          <ActivityIndicator size="large" color={color.blue} accessibilityLabel={ACCOUNT_LOADING} />
        ) : (
          <>
            <Text style={styles.error} accessibilityRole="alert">
              {messageFor(error instanceof ApiError ? error.code : undefined)}
            </Text>
            <Button
              label={ACCOUNT_RETRY}
              onPress={() => void refetch()}
              busy={isFetching}
              fullWidth
              testID="account-retry"
            />
            <TextLink label={BACK_LABEL} onPress={leave} testID="account-error-back" />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.screenX, gap: spacing[3] },
  error: { ...typography.bodyStrong, color: color.redDk, textAlign: 'center' },
});
