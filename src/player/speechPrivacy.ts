// O texto do aviso de privacidade do microfone (1.15), num módulo à parte: o
// catálogo `/kit` o usa sem levar a Fala (e o reconhecimento) para o bundle dele.
import { Platform } from 'react-native';

/**
 * Quem transcreve o áudio em cada plataforma (UX-DR112) [ASSUMPTION: copy]. No
 * Android, sempre cita o Google (Decisão 1 da 1.15): o reconhecedor sai do
 * aparelho sem reconhecimento local ou sem o modelo en-US.
 */
export const PRIVACY_TEXT = {
  web: 'Para conferir sua fala, o áudio é transcrito pelo reconhecimento de voz do seu navegador, que pode enviá-lo ao Google ou à Apple. O Fluveny não grava nem guarda o áudio.',
  android:
    'Para conferir sua fala, o áudio é transcrito pelo reconhecimento de voz do Android, que pode enviá-lo ao Google. O Fluveny não grava nem guarda o áudio.',
} as const;

export const privacyText = () => (Platform.OS === 'web' ? PRIVACY_TEXT.web : PRIVACY_TEXT.android);
