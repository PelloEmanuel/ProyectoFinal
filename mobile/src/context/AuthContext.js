/**
 * Archivo: mobile/src/context/AuthContext.js
 * Descripción: Estado global de autenticación de SkillTrack (Context API + useReducer).
 * Expone estado de inicialización, usuario actual, rol, permisos, verificación de correo,
 * estado de segundo factor y acciones de sesión persistente en SecureStore.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { Platform } from 'react-native';
import { authApi, usersApi } from '../api/services';
import { bindSessionHandlers, setSessionTokens } from '../api/client';
import { clearSession, loadSession, saveSession } from '../utils/storage';
import { useTheme } from './ThemeContext';

const AuthContext = createContext(null);

const initialState = {
  initialized: false,
  loading: true,
  refreshingSession: false,
  user: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        initialized: true,
        loading: false,
        refreshingSession: false,
        user: action.user,
      };
    case 'SIGN_OUT':
      return {
        ...state,
        initialized: true,
        loading: false,
        refreshingSession: false,
        user: null,
      };
    case 'SET_REFRESHING':
      return { ...state, refreshingSession: action.value };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { setThemeMode } = useTheme();

  const signOutLocal = useCallback(async () => {
    setSessionTokens({});
    await clearSession();
    dispatch({ type: 'SIGN_OUT' });
  }, []);

  const startSession = useCallback(
    async (payload) => {
      const data = payload?.data || payload;
      setSessionTokens(data);
      await saveSession(data);
      const localSavedTheme =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem('skt_theme_mode')
          : null;
      if (!localSavedTheme && data.user?.preferences?.theme) {
        await setThemeMode(data.user.preferences.theme);
      }
      dispatch({ type: 'SET_USER', user: data.user });
      return data;
    },
    [setThemeMode]
  );

  useEffect(() => {
    bindSessionHandlers({
      onTokens: (t) => saveSession(t),
      onExpired: () => signOutLocal(),
    });
    (async () => {
      // 1. Interceptar retorno de OAuth en Web (flujo de redirección estándar o proxy)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const search = window.location.search || '';
        const hash = window.location.hash || '';
        const hasDirectToken = search.includes('token=') || hash.includes('token=');
        const hasCode = search.includes('code=') || hash.includes('code=');
        const hasToken = hash.includes('access_token=') || search.includes('access_token=') || hasDirectToken;
        const hasIdToken = hash.includes('id_token=') || search.includes('id_token=');

        if (hasCode || hasToken || hasIdToken) {
          try {
            const searchParams = new URLSearchParams(search);
            const hashStr = hash.startsWith('#') ? hash.slice(1) : hash;
            const hashParams = new URLSearchParams(hashStr);

            const directToken = searchParams.get('token') || searchParams.get('accessToken') || searchParams.get('access_token') || hashParams.get('token') || hashParams.get('access_token');
            const directRefresh = searchParams.get('refreshToken') || searchParams.get('refresh_token') || hashParams.get('refreshToken') || hashParams.get('refresh_token');

            if (directToken && directRefresh) {
              try {
                window.history.replaceState({}, document.title, window.location.pathname);
              } catch (e) {}
              setSessionTokens({ accessToken: directToken, refreshToken: directRefresh });
              const fresh = await usersApi.me();
              await startSession({ accessToken: directToken, refreshToken: directRefresh, user: fresh });
              return;
            }

            const code = searchParams.get('code') || hashParams.get('code');
            const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
            const idToken = hashParams.get('id_token') || searchParams.get('id_token');

            let provider = 'google';
            try {
              provider = sessionStorage.getItem('oauth_provider') || 'google';
              sessionStorage.removeItem('oauth_provider');
              sessionStorage.removeItem('oauth_state');
            } catch (e) {}

            let meta = {};
            try {
              const rawMeta = sessionStorage.getItem('oauth_meta');
              if (rawMeta) {
                meta = JSON.parse(rawMeta);
                sessionStorage.removeItem('oauth_meta');
              }
            } catch (e) {}

            // Limpiar los parámetros de la URL inmediatamente
            try {
              window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) {}

            const payload = {
              redirectUri: window.location.origin,
              ...meta,
            };
            if (code) payload.code = code;
            if (accessToken) payload.accessToken = accessToken;
            if (idToken) payload.idToken = idToken;

            const res = await authApi.social(provider, payload);
            await startSession(res);
            return;
          } catch (err) {
            console.error('Error procesando autenticación social en inicio:', err);
            try {
              window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) {}
            return dispatch({ type: 'SIGN_OUT' });
          }
        }
      }

      // 2. Cargar sesión local previa
      const saved = await loadSession();
      if (!saved.accessToken || !saved.refreshToken) {
        return dispatch({ type: 'SIGN_OUT' });
      }
      setSessionTokens(saved);
      dispatch({ type: 'SET_REFRESHING', value: true });
      try {
        const fresh = await usersApi.me();
        await saveSession({ user: fresh });
        const localSavedTheme =
          typeof window !== 'undefined' && window.localStorage
            ? window.localStorage.getItem('skt_theme_mode')
            : null;
        if (!localSavedTheme && fresh?.preferences?.theme) {
          await setThemeMode(fresh.preferences.theme);
        }
        dispatch({ type: 'SET_USER', user: fresh });
      } catch (e) {
        if (!e.response && saved.user) {
          dispatch({ type: 'SET_USER', user: saved.user });
        } else {
          await signOutLocal();
        }
      }
    })();
  }, [signOutLocal, setThemeMode, startSession]);

  const actions = useMemo(
    () => ({
      startSession,
      async login(email, password) {
        const res = await authApi.login({ email: email.trim(), password });
        const data = res.data || res;
        if (res.status === 202 || data?.twoFactorRequired || data?.requiresVerification) {
          return {
            twoFactorRequired: Boolean(data?.twoFactorRequired),
            requiresVerification: Boolean(data?.requiresVerification),
            userId: data?.userId,
            email: data?.email || email.trim(),
            message: data?.message,
          };
        }
        await startSession(data);
        return { twoFactorRequired: false, requiresVerification: false };
      },
      async verifyTwoFactor(userId, code) {
        const res = await authApi.verify2fa({ userId, code });
        await startSession(res);
        return res;
      },
      async verifyEmail(userId, token) {
        const res = await authApi.verifyEmail({ userId, token, code: token });
        const data = res?.data || res;
        if (data?.accessToken || res?.accessToken) {
          await startSession(res);
        } else {
          const fresh = await usersApi.me().catch(() => null);
          if (fresh) {
            await saveSession({ user: fresh });
            dispatch({ type: 'SET_USER', user: fresh });
          }
        }
        return res;
      },
      async register(payload) {
        const res = await authApi.register(payload);
        const data = res.data || res;
        if (data?.requiresVerification || data?.twoFactorRequired) {
          return data;
        }
        await startSession(res);
        return data;
      },
      async socialLogin(provider, body) {
        if (body?.token || body?.accessToken) {
          const tokens = {
            accessToken: body.token || body.accessToken,
            refreshToken: body.refreshToken,
          };
          setSessionTokens(tokens);
          const fresh = await usersApi.me();
          const sessionData = { ...tokens, user: fresh };
          await startSession(sessionData);
          return sessionData;
        }
        const res = await authApi.social(provider, body);
        await startSession(res);
        return res;
      },
      async refreshProfile() {
        const fresh = await usersApi.me();
        await saveSession({ user: fresh });
        dispatch({ type: 'SET_USER', user: fresh });
        return fresh;
      },
      async setSchoolGroup(schoolYear, courseDivision, accessCode) {
        const updated = await usersApi.setSchoolGroup({ schoolYear, courseDivision, accessCode });
        await saveSession({ user: updated });
        dispatch({ type: 'SET_USER', user: updated });
        return updated;
      },
      async updateProfile(body) {
        const updated = await usersApi.updateMe(body);
        if (body.themePreference || body.notificationsEnabled !== undefined) {
          await usersApi.updatePreferences({
            theme: body.themePreference,
            notifications: body.notificationsEnabled,
          }).catch(() => {});
        }
        await saveSession({ user: updated });
        dispatch({ type: 'SET_USER', user: updated });
        return updated;
      },
      async changePassword(body) {
        return usersApi.updatePassword(body);
      },
      async setup2FA(currentPassword) {
        return authApi.setup2fa(currentPassword);
      },
      async confirm2FA(code) {
        const res = await authApi.verify2fa({ code });
        const fresh = await usersApi.me();
        await saveSession({ user: fresh });
        dispatch({ type: 'SET_USER', user: fresh });
        return res.data || res;
      },
      async disable2FA(body) {
        const pwd = typeof body === 'string' ? body : body?.password || body?.currentPassword;
        const res = await authApi.disable2fa(pwd);
        const fresh = await usersApi.me();
        await saveSession({ user: fresh });
        dispatch({ type: 'SET_USER', user: fresh });
        return res;
      },
      async deleteOwnAccount() {
        await usersApi.deleteMe();
        await signOutLocal();
      },
      async updateUser(user) {
        await saveSession({ user });
        dispatch({ type: 'SET_USER', user });
      },
      async logout() {
        const { refreshToken } = await loadSession();
        try {
          if (refreshToken) await authApi.logout(refreshToken);
        } catch {
          // Si no hay conexión, limpiamos localmente de forma segura
        }
        await signOutLocal();
      },
    }),
    [startSession, signOutLocal]
  );

  const contextValue = useMemo(
    () => ({
      ...state,
      isLoading: state.loading,
      isAuthenticated: !!state.user,
      role: state.user?.role || null,
      permissions: state.user?.permissions || [],
      emailVerified: !!state.user?.emailVerified,
      twoFactorEnabled: !!state.user?.twoFactorEnabled,
      ...actions,
    }),
    [state, actions]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
