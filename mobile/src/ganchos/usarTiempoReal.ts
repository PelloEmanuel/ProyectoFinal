// Importa los hooks de React, utilidades de plataforma y estado de aplicación de React Native, y la configuración de API.
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import api from '../api/cliente';
import { API_URL } from '../configuracion/indice';

// Mantiene el conjunto global de funciones suscritas a las actualizaciones en tiempo real.
const suscriptores = new Set<() => void>();

// Almacena la última versión de estado conocida del servidor y las referencias de conexión activa.
let ultimaVersionConocida: number = 0;
let temporizadorSondeo: ReturnType<typeof setInterval> | null = null;
let fuenteEventosSse: any = null;
let escuchandoCicloVida = false;
let verificandoVersion = false;

// Notifica a todos los componentes React montados para que actualicen su estado silenciosamente.
function dispararActualizacionComponentes(): void {
  suscriptores.forEach((callback) => {
    try {
      callback();
    } catch (err) {
      console.warn('[TiempoReal] Error ejecutando callback de componente:', err);
    }
  });
}

// Consulta al servidor la versión de sincronización actual y dispara el re-renderizado si hubo cambios desde otro dispositivo.
async function verificarVersionServidor(forzarDisparo = false): Promise<void> {
  if (verificandoVersion || suscriptores.size === 0) return;
  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return;
  }
  try {
    verificandoVersion = true;
    const res = await api.get('/sync-version', {
      params: { _t: Date.now() },
    });
    const nuevaVersion = Number(res?.data?.version || res?.data?.data?.version || 0);
    if (nuevaVersion > 0) {
      if (ultimaVersionConocida === 0) {
        ultimaVersionConocida = nuevaVersion;
        if (forzarDisparo) dispararActualizacionComponentes();
      } else if (nuevaVersion !== ultimaVersionConocida) {
        ultimaVersionConocida = nuevaVersion;
        dispararActualizacionComponentes();
      } else if (forzarDisparo) {
        dispararActualizacionComponentes();
      }
    }
  } catch {
    // Ignora errores transitorios de red durante el sondeo silencioso en segundo plano.
  } finally {
    verificandoVersion = false;
  }
}

// Inicia la conexión Server-Sent Events (SSE) en navegadores web para recibir cambios instantáneos.
function iniciarConexionSseWeb(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof (window as any).EventSource === 'undefined') {
    return;
  }
  if (fuenteEventosSse) return;

  try {
    const cleanBase = String(API_URL || '/api/v1').replace(/\/+$/, '');
    const sseUrl = `${cleanBase}/events`;
    const es = new (window as any).EventSource(sseUrl);
    fuenteEventosSse = es;

    es.onmessage = (event: any) => {
      try {
        const parsed = JSON.parse(event.data);
        const ver = Number(parsed?.version || 0);
        if (ver > 0) {
          if (ultimaVersionConocida === 0) {
            ultimaVersionConocida = ver;
          } else if (ver !== ultimaVersionConocida) {
            ultimaVersionConocida = ver;
            dispararActualizacionComponentes();
          }
        }
      } catch {}
    };

    es.onerror = () => {
      try {
        es.close();
      } catch {}
      fuenteEventosSse = null;
    };
  } catch {
    fuenteEventosSse = null;
  }
}

// Configura los escuchadores de ciclo de vida de React Native (AppState) y del navegador web (focus / visibilitychange).
function asegurarMotorTiempoReal(): void {
  if (!temporizadorSondeo) {
    verificarVersionServidor(false);
    iniciarConexionSseWeb();
    temporizadorSondeo = setInterval(() => {
      if (Platform.OS === 'web' && !fuenteEventosSse) {
        iniciarConexionSseWeb();
      }
      verificarVersionServidor(false);
    }, 3500);
  }

  if (!escuchandoCicloVida) {
    escuchandoCicloVida = true;

    // En React Native (Android / iOS), verifica cambios apenas la aplicación vuelve a primer plano.
    AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        verificarVersionServidor(false);
      }
    });

    // En Web, verifica cambios cuando la ventana o pestaña recupera el foco.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        verificarVersionServidor(false);
      });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            verificarVersionServidor(false);
          }
        });
      }
    }
  }
}

// Detiene los temporizadores cuando ya no quedan pantallas suscritas.
function detenerMotorSiInactivo(): void {
  if (suscriptores.size > 0) return;
  if (temporizadorSondeo) {
    clearInterval(temporizadorSondeo);
    temporizadorSondeo = null;
  }
  if (fuenteEventosSse) {
    try {
      fuenteEventosSse.close();
    } catch {}
    fuenteEventosSse = null;
  }
}

// Gancho personalizado de React y React Native que re-renderiza automáticamente la pantalla cuando otro dispositivo realiza cambios.
export default function usarTiempoReal(alDetectarCambio: () => void, activo: boolean = true): void {
  const callbackRef = useRef(alDetectarCambio);
  callbackRef.current = alDetectarCambio;

  useEffect(() => {
    if (!activo) return;

    const manejador = () => {
      callbackRef.current();
    };

    suscriptores.add(manejador);
    asegurarMotorTiempoReal();

    return () => {
      suscriptores.delete(manejador);
      detenerMotorSiInactivo();
    };
  }, [activo]);
}
