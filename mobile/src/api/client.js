import axios from 'axios';
import { API_URL } from '../config';

// Estado de sesión en memoria; AuthContext lo sincroniza con el almacenamiento seguro.
const session = { access: null, refresh: null, onTokens: null, onExpired: null };

export const setSessionTokens = ({ accessToken, refreshToken }) => {
  session.access = accessToken || null;
  session.refresh = refreshToken || null;
};
export const bindSessionHandlers = ({ onTokens, onExpired }) => {
  session.onTokens = onTokens;
  session.onExpired = onExpired;
};

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use((cfg) => {
  if (session.access) cfg.headers.Authorization = `Bearer ${session.access}`;
  return cfg;
});

let refreshing = null; // evita múltiples refresh simultáneos

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthCall = original?.url?.includes('/auth/');
    if (err.response?.status === 401 && session.refresh && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        refreshing =
          refreshing ||
          axios
            .post(`${API_URL}/auth/refresh`, { refreshToken: session.refresh }, { timeout: 15000 })
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
