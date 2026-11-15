// Estado da rede para a faixa "Sem conexão" (EXPERIENCE.md, Estados). No
// nativo, o expo-network; no web, `navigator.onLine` e os eventos
// `online`/`offline`. Sem resposta ainda, considera online: a faixa só aparece
// quando o sistema diz que caiu. Não existe modo offline (FR-10).
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Online, a menos que o sistema diga que não há conexão ou internet. */
export function isOnline(state: NetworkState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

function webOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function useOnline(): boolean {
  const web = Platform.OS === 'web';
  const [online, setOnline] = useState(() => (web ? webOnline() : true));

  useEffect(() => {
    if (web) {
      if (typeof window === 'undefined') return;
      const update = () => setOnline(webOnline());
      update();
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      return () => {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      };
    }
    let alive = true;
    // Um evento que chega antes da leitura inicial é mais novo do que ela.
    let heard = false;
    const subscription = addNetworkStateListener((state) => {
      heard = true;
      setOnline(isOnline(state));
    });
    getNetworkStateAsync()
      .then((state) => {
        if (alive && !heard) setOnline(isOnline(state));
      })
      .catch(() => {});
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [web]);

  return online;
}
