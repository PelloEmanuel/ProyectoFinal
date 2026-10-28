import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { authApi, usersApi } from '../api/services';
import { bindSessionHandlers, setSessionTokens } from '../api/client';
import { clearSession, loadSession, saveSession } from '../utils/storage';

const AuthContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER': return { loading: false, user: action.user };
    case 'SIGN_OUT': return { loading: false, user: null };
    default: return state;
  }
}

/** Estado global de autenticación (Context API + useReducer) con sesión persistente. */
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { loading: true, user: null });

  const signOutLocal = useCallback(async () => {
    setSessionTokens({});
    await clearSession();
    dispatch({ type: 'SIGN_OUT' });
  }, []);

  const startSession = useCallback(async (data) => {
    setSessionTokens(data);
    await saveSession(data);
    dispatch({ type: 'SET_USER', user: data.user });
  }, []);

  // Restaurar sesión al abrir la app
  useEffect(() => {
    bindSessionHandlers({
      onTokens: (t) => saveSession(t),
      onExpired: () => signOutLocal(),
    });
    (async () => {
      const saved = await loadSession();
      if (!saved.accessToken || !saved.refreshToken) return dispatch({ type: 'SIGN_OUT' });
      setSessionTokens(saved);
      try {
        const fresh = await usersApi.me(); // valida el token (y renueva si hace falta)
        await saveSession({ user: fresh });
        dispatch({ type: 'SET_USER', user: fresh });
      } catch (e) {
        if (!e.response) dispatch({ type: 'SET_USER', user: saved.user }); // sin red: modo offline con datos guardados
        else await signOutLocal();
      }
    })();
  }, [signOutLocal]);

  const actions = useMemo(() => ({
    /** Devuelve { twoFactorRequired, userId } si falta el código; si no, inicia sesión. */
    async login(email, password) {
      const res = await authApi.login({ email: email.trim(), password });
      if (res.status === 202) return res.data;
      await startSession(res.data);
      return { twoFactorRequired: false };
    },
    async verifyTwoFactor(userId, code) { await startSession(await authApi.verify2fa({ userId, code })); },
    async register(payload) { await startSession(await authApi.register(payload)); },
    async socialLogin(provider, body) { await startSession(await authApi.social(provider, body)); },
    async updateUser(user) { await saveSession({ user }); dispatch({ type: 'SET_USER', user }); },
    async logout() {
      const { refreshToken } = await loadSession();
      try { if (refreshToken) await authApi.logout(refreshToken); } catch { /* sin red: se cierra igual */ }
      await signOutLocal();
    },
  }), [startSession, signOutLocal]);

  return <AuthContext.Provider value={{ ...state, ...actions }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
