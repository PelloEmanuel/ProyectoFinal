import axios, { InternalAxiosRequestConfig } from 'axios';
import { API_URL, resolveApiUrls } from '../configuracion/indice';

// Define la estructura del estado de sesión en memoria utilizado por el cliente HTTP.
interface EstadoSesionMemoria {
  access: string | null;
  refresh: string | null;
  onTokens: ((tokens: { accessToken: string; refreshToken: string }) => Promise<void> | void) | null;
  onExpired: (() => Promise<void> | void) | null;
}

// Extiende la configuración de petición de Axios con banderas de reintento y conmutación.
interface ConfiguracionPeticionExtendida extends InternalAxiosRequestConfig {
  _triedFallback?: boolean;
  _retry?: boolean;
}

// Mantiene en memoria los tokens activos y los callbacks sincronizados con el contexto de autenticación.
const session: EstadoSesionMemoria = { access: null, refresh: null, onTokens: null, onExpired: null };
let preferProxy = false;

// Actualiza los tokens de acceso y renovación almacenados en memoria.
export const setSessionTokens = ({ accessToken, refreshToken }: { accessToken?: string | null; refreshToken?: string | null } = {}) => {
  session.access = accessToken || null;
  session.refresh = refreshToken || null;
};

// Vincula los manejadores para persistir tokens renovados o cerrar sesión ante expiración.
export const bindSessionHandlers = ({
  onTokens,
  onExpired,
}: {
  onTokens?: (tokens: { accessToken: string; refreshToken: string }) => Promise<void> | void;
  onExpired?: () => Promise<void> | void;
}) => {
  session.onTokens = onTokens || null;
  session.onExpired = onExpired || null;
};

// Crea la instancia principal de Axios con tiempo de espera de 25 segundos.
const api = axios.create({ baseURL: API_URL, timeout: 25000 });

// Intercepta cada petición saliente para adjuntar la URL activa y el encabezado Bearer JWT.
api.interceptors.request.use((cfg: ConfiguracionPeticionExtendida) => {
  const { primary, fallback } = resolveApiUrls();
  if (!cfg._triedFallback) {
    cfg.baseURL = preferProxy ? fallback : primary;
  }
  if (session.access && cfg.headers) {
    cfg.headers.Authorization = `Bearer ${session.access}`;
  }
  return cfg;
});

// Evita múltiples peticiones simultáneas de renovación de token cuando vencen varias llamadas a la vez.
let refreshing: Promise<any> | null = null;

// Intercepta las respuestas para gestionar la conmutación de red y la rotación automática del token JWT.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config as ConfiguracionPeticionExtendida | undefined;
    const { primary, fallback } = resolveApiUrls();

    // Si falla la conexión con la URL primaria y existe una URL alternativa, reintenta automáticamente.
    const alternateUrl = original?.baseURL === primary ? fallback : primary;
    const canFallback =
      original &&
      !original._triedFallback &&
      alternateUrl &&
      alternateUrl !== original.baseURL &&
      (!err.response || err.response.status === 404 || err.response.status === 502);

    if (canFallback && original) {
      original._triedFallback = true;
      preferProxy = alternateUrl === fallback;
      original.baseURL = alternateUrl;
      return api(original);
    }

    // Si el servidor responde 401 y hay un refreshToken disponible, solicita un nuevo par de tokens.
    const isAuthCall = original?.url?.includes('/auth/');
    if (err.response?.status === 401 && session.refresh && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        const activeBase = original.baseURL || primary;
        refreshing =
          refreshing ||
          axios
            .post(`${activeBase}/auth/refresh`, { refreshToken: session.refresh }, { timeout: 10000 })
            .finally(() => {
              refreshing = null;
            });
        const { data } = await refreshing;
        setSessionTokens(data);
        await session.onTokens?.(data);
        if (original.headers) {
          original.headers.Authorization = `Bearer ${data.accessToken}`;
        }
        return api(original);
      } catch (e: any) {
        if (e.response?.status === 401) session.onExpired?.();
        return Promise.reject(e.response ? err : e);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
