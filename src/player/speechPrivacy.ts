// O texto do aviso de privacidade do microfone (1.15), num módulo à parte: o
// catálogo `/kit` o usa sem levar a Fala (e o reconhecimento) para o bundle dele.
import { Platform } from 'react-native';

/**
 * Quem transcreve o áudio em cada plataforma (UX-DR112) [ASSUMPTION: copy]. No
 * Android, sempre cita o Google (Decisão 1 da 1.15): o reconhecedor sai do
 * aparelho sem reconhecimento local ou sem o modelo en-US.
 */
export const PRIVACY_TEXT = {
  web: "To check your speech, your browser's speech recognition turns the audio into text and may send it to Google or Apple. Fluveny doesn't record or keep the audio.",
  android:
    "To check your speech, Android's speech recognition turns the audio into text and may send it to Google. Fluveny doesn't record or keep the audio.",
} as const;

export const privacyText = () => (Platform.OS === 'web' ? PRIVACY_TEXT.web : PRIVACY_TEXT.android);
