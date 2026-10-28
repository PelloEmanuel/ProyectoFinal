/**
 * Cliente HTTP Axios para comunicarse con el backend.
 * Incluye rotación automática de JWT (Access + Refresh) y conmutación automática
 * entre el puerto directo (3000) y el proxy de Expo (8081) si el firewall o la red cambia.
 */
import axios from 'axios';
import { API_URL, resolveApiUrls } from '../config';

// Estado de sesión en memoria; AuthContext lo sincroniza con el almacenamiento seguro.
const session = { access: null, refresh: null, onTokens: null, onExpired: null };
let preferProxy = false;

export const setSessionTokens = ({ accessToken, refreshToken }) => {
  session.access = accessToken || null;
  session.refresh = refreshToken || null;
};
export const bindSessionHandlers = ({ onTokens, onExpired }) => {
  session.onTokens = onTokens;
  session.onExpired = onExpired;
};

const api = axios.create({ baseURL: API_URL, timeout: 10000 });

api.interceptors.request.use((cfg) => {
  const { primary, fallback } = resolveApiUrls();
  if (!cfg._triedFallback) {
    cfg.baseURL = preferProxy ? fallback : primary;
  }
  if (session.access) cfg.headers.Authorization = `Bearer ${session.access}`;
  return cfg;
});

let refreshing = null; // evita múltiples refresh simultáneos

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const { primary, fallback } = resolveApiUrls();

    // Si falla por red o ruta en el puerto principal y existe el proxy de Expo (o viceversa), reintenta automáticamente
    const alternateUrl = original?.baseURL === primary ? fallback : primary;
    const canFallback =
      original &&
      !original._triedFallback &&
      alternateUrl &&
      alternateUrl !== original.baseURL &&
      (!err.response || err.response.status === 404 || err.response.status === 502);

    if (canFallback) {
      original._triedFallback = true;
      preferProxy = alternateUrl === fallback;
      original.baseURL = alternateUrl;
      return api(original);
    }

    const isAuthCall = original?.url?.includes('/auth/');
    if (err.response?.status === 401 && session.refresh && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        const activeBase = original.baseURL || primary;
        refreshing =
          refreshing ||
          axios
            .post(`${activeBase}/auth/refresh`, { refreshToken: session.refresh }, { timeout: 10000 })
            .finally(() => { refreshing = null; });
        const { data } = await refreshing;
        setSessionTokens(data);
        await session.onTokens?.(data);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (e) {
        if (e.response?.status === 401) session.onExpired?.(); // refresh inválido: cerrar sesión
        return Promise.reject(e.response ? err : e);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
