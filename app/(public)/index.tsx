import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PRIVACY_LINK, PRIVACY_PATH, TERMS_LINK, TERMS_PATH } from '../../src/legal/paths';
import { useOnline } from '../../src/network/useOnline';
import { OFFLINE_TEXT } from '../../src/network/text';
import { AlexWave, Button, Room, StatusBanner, sceneHeight, TextLink } from '../../src/ui';
import { color, size, spacing, typography } from '../../src/ui/tokens';

// Copy da boas-vindas (EXPERIENCE.md, Voice and Tone).
export const WELCOME_TITLE = 'Seu primeiro dia na universidade. Em inglês.';
export const WELCOME_BODY =
  'Conheça o Alex, seu colega de quarto, e aprenda a se apresentar falando, escrevendo e jogando. Grátis.';
/** Objetivo da Unit 1, em inglês, fixo no App [ASSUMPTION: Decisão 2 da 1.10; o conteúdo não tem `goal`]. */
export const WELCOME_GOAL = 'Learn how to introduce yourself, talk about yourself, and meet new people.';
export const TRY_NOW = 'EXPERIMENTAR AGORA';
export const SIGN_UP = 'CRIAR CONTA';
export const SIGN_IN = 'ENTRAR';

/**
 * Boas-vindas, a raiz do Visitante (FR-1): o quarto com Alex acenando e a
 * folha branca com o título, o objetivo da Unit 1 e as três ações. Rola com a
 * fonte ampliada.
 */
export default function Welcome() {
  const router = useRouter();
  const online = useOnline();
  const { height } = useWindowDimensions();
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {online ? null : (
        <View style={styles.banner}>
          <StatusBanner tone="offline" text={OFFLINE_TEXT} />
        </View>
      )}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} bounces={false}>
        <View style={[styles.scene, { minHeight: Math.round(sceneHeight(height) * SCENE_SHARE) }]}>
          <Room />
          <View style={styles.alex}>
            <AlexWave size={ALEX_SIZE} />
          </View>
        </View>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <Text style={styles.title} accessibilityRole="header">
            {WELCOME_TITLE}
          </Text>
          <Text style={styles.body}>{WELCOME_BODY}</Text>
          <Text style={styles.goal} lang="en">
            {WELCOME_GOAL}
          </Text>
          <View style={styles.actions}>
            <Button label={TRY_NOW} onPress={() => router.navigate('/player')} fullWidth />
            <Button label={SIGN_UP} variant="ghost" onPress={() => router.navigate('/em-breve')} fullWidth />
            <Button label={SIGN_IN} variant="ghost" small onPress={() => router.navigate('/em-breve')} fullWidth />
          </View>
          <View style={styles.legal}>
            <TextLink
              label={PRIVACY_LINK}
              small
              onPress={() => router.navigate(PRIVACY_PATH)}
              testID="welcome-privacy"
            />
            <TextLink label={TERMS_LINK} small onPress={() => router.navigate(TERMS_PATH)} testID="welcome-terms" />
          </View>
        </SafeAreaView>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A cena começa em 57% da do Diálogo e cresce com a tela: a folha com as três
 * ações e os links da política e dos termos (1.21) precisa caber sem rolar num
 * celular de 360×740.
 */
const SCENE_SHARE = 0.57;
/** Alex um pouco menor que em cena (205), para caber na cena reduzida [ASSUMPTION]. */
const ALEX_SIZE = 180;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.blue },
  banner: { paddingHorizontal: spacing.screenX, paddingVertical: spacing[2] },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  scene: { flexGrow: 1, overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'center' },
  alex: { pointerEvents: 'none', marginBottom: -spacing[6] },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: size.welcomeSheetRadius,
    borderTopRightRadius: size.welcomeSheetRadius,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
    paddingBottom: spacing[1],
    gap: spacing[3],
  },
  title: { ...typography.display, color: color.ink },
  body: { ...typography.body, color: color.muted },
  goal: { ...typography.item, color: color.blue },
  actions: { gap: spacing.half, marginTop: spacing[2] },
  // Os links da política e dos termos (1.21), numa linha abaixo das ações; quebram com a fonte ampliada.
  legal: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: -spacing[3] },
});
