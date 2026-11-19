import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlexWave, Button } from '../ui';
import { color, spacing, typography } from '../ui/tokens';
import type { StudentProfile } from './student';

// Copy da tela inicial do Aluno (2.1). [ASSUMPTION] Textos propostos na 2.1, a revisar com UX.
/** A saudação, em inglês como no painel ("Hi, {nome}!"). */
export const studentGreeting = (name: string | null | undefined) =>
  name?.trim() ? `Hi, ${name.trim()}!` : 'Hi, friend!';
export const HOME_BODY = 'Sua conta está pronta. Por enquanto, o seu progresso continua só neste aparelho.';
export const HOME_STUDY = 'ESTUDAR AGORA';

const ALEX_SIZE = 180;

/**
 * Tela inicial simples do Aluno com sessão (2.1), na raiz `/`: a saudação e o
 * botão do player de hoje, com o Progresso só no aparelho até a 2.4. Sem o
 * `VISITOR_SESSION_STARTED` do `openPlayer`: o Aluno não é uma sessão de
 * Visitante. A 2.5
 * troca esta tela pelo painel (AD-12).
 */
export function StudentHome({ student }: { student: StudentProfile }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']} testID="student-home">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grow} />
        <View style={styles.alex}>
          <AlexWave size={ALEX_SIZE} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {studentGreeting(student.name)}
        </Text>
        <Text style={styles.body}>{HOME_BODY}</Text>
        <View style={styles.grow} />
      </ScrollView>
      <View style={styles.footer}>
        <Button label={HOME_STUDY} onPress={() => router.navigate('/player')} fullWidth testID="student-home-study" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { flexGrow: 1, gap: spacing[4], paddingHorizontal: spacing.screenX },
  grow: { flexGrow: 1 },
  alex: { alignItems: 'center' },
  title: { ...typography.display, color: color.ink, textAlign: 'center' },
  body: { ...typography.body, color: color.mutedStrong, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.screenX, paddingVertical: spacing[3] },
});
