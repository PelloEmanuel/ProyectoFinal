/**
 * Archivo: mobile/src/context/AuthContext.js
 * Descripción: Estado global de autenticación de SkillTrack (Context API + useReducer).
 * Expone estado de inicialización, usuario actual, rol, permisos, verificación de correo,
 * estado de segundo factor y acciones de sesión persistente en SecureStore.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
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
      if (data.user?.preferences?.theme) {
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
      const saved = await loadSession();
      if (!saved.accessToken || !saved.refreshToken) {
        return dispatch({ type: 'SIGN_OUT' });
      }
      setSessionTokens(saved);
      dispatch({ type: 'SET_REFRESHING', value: true });
      try {
        const fresh = await usersApi.me();
        await saveSession({ user: fresh });
        if (fresh?.preferences?.theme) {
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
  }, [signOutLocal, setThemeMode]);

  const actions = useMemo(
    () => ({
      async login(email, password) {
        const res = await authApi.login({ email: email.trim(), password });
        if (res.status === 202 || res.data?.twoFactorRequired) {
          return {
            twoFactorRequired: true,
            userId: res.data.userId,
            email: res.data.email || email.trim(),
          };
        }
        await startSession(res.data);
        return { twoFactorRequired: false };
      },
      async verifyTwoFactor(userId, code) {
        const res = await authApi.verify2fa({ userId, code });
        await startSession(res);
        return res;
      },
      async register(payload) {
        const res = await authApi.register(payload);
        await startSession(res);
        return res;
      },
      async socialLogin(provider, body) {
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
