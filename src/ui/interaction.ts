// Aviso de interação do aluno (2.4): o player conta o tempo de estudo pelos
// intervalos entre interações, e digitar não passa pelo toque na moldura (no
// Android, o teclado é outra janela). Os campos do kit (`TextField` e a lacuna
// digitada do `GapSlot`) avisam aqui a cada mudança de texto. Fora do player,
// o aviso não faz nada.
import { createContext, useContext } from 'react';

export const InteractionContext = createContext<() => void>(() => {});

/** O aviso de interação de quem está em volta (o relógio de estudo do player). */
export const useInteraction = () => useContext(InteractionContext);
