import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { Platform } from 'react-native';
import { authApi, usersApi } from '../api/servicios';
import { bindSessionHandlers, setSessionTokens } from '../api/cliente';
import { clearSession, loadSession, saveSession, loadThemePreference } from '../utilidades/almacenamiento';
import { useTheme } from './ContextoTema';
import { UsuarioCliente } from '../tipos';

// Define la estructura del estado interno del reductor de autenticación.
interface EstadoAutenticacion {
  initialized: boolean;
  loading: boolean;
  refreshingSession: boolean;
  user: UsuarioCliente | null;
}

// Define las acciones soportadas por el reductor de sesión.
type AccionAutenticacion =
  | { type: 'SET_USER'; user: UsuarioCliente | null }
  | { type: 'SIGN_OUT' }
  | { type: 'SET_REFRESHING'; value: boolean };

// Crea el contexto de autenticación de React.
const AuthContext = createContext<any>(null);

// Define el estado inicial antes de verificar la sesión almacenada en el dispositivo.
const initialState: EstadoAutenticacion = {
  initialized: false,
  loading: true,
  refreshingSession: false,
  user: null,
};

// Gestiona las transiciones de estado de la sesión del usuario.
function reducer(state: EstadoAutenticacion, action: AccionAutenticacion): EstadoAutenticacion {
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

// Provee el estado global de sesión y las acciones de acceso a toda la aplicación.
export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { setThemeMode } = useTheme();

  // Limpia los tokens en memoria, el almacenamiento seguro y el historial de navegación guardado.
  const signOutLocal = useCallback(async () => {
    setSessionTokens({});
    await clearSession();
    if (typeof window !== 'undefined') {
      try {
        const removeKeys: string[] = [];
        for (let i = 0; i < (window.sessionStorage?.length || 0); i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith('CAMPUS_NAV_STATE')) removeKeys.push(k);
        }
        removeKeys.forEach((k) => window.sessionStorage?.removeItem(k));
        const removeLocalKeys: string[] = [];
        for (let i = 0; i < (window.localStorage?.length || 0); i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith('CAMPUS_NAV_STATE')) removeLocalKeys.push(k);
        }
        removeLocalKeys.forEach((k) => window.localStorage?.removeItem(k));
      } catch {}
    }
    dispatch({ type: 'SIGN_OUT' });
  }, []);

  // Inicia una sesión activa guardando los tokens, sincronizando el tema y actualizando el usuario.
  const startSession = useCallback(
    async (payload: any) => {
      const data = payload?.data || payload;
      setSessionTokens(data);
      await saveSession(data);
      const localSavedTheme = await loadThemePreference();
      if (localSavedTheme === 'dark' || localSavedTheme === 'light') {
        await setThemeMode(localSavedTheme);
      } else if (data.user?.preferences?.theme) {
        await setThemeMode(data.user.preferences.theme);
      }
      dispatch({ type: 'SET_USER', user: data.user });
      return data;
    },
    [setThemeMode]
  );

  // Restaura la sesión previa al montar la aplicación o procesa el retorno de autenticación OAuth en web.
  useEffect(() => {
    bindSessionHandlers({
      onTokens: (t) => saveSession(t),
      onExpired: () => signOutLocal(),
    });
    (async () => {
      // Intercepta los parámetros de retorno OAuth en el navegador web si están presentes en la URL.
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

            const directToken =
              searchParams.get('token') ||
              searchParams.get('accessToken') ||
              searchParams.get('access_token') ||
              hashParams.get('token') ||
              hashParams.get('access_token');
            const directRefresh =
              searchParams.get('refreshToken') ||
              searchParams.get('refresh_token') ||
              hashParams.get('refreshToken') ||
              hashParams.get('refresh_token');

            if (directToken && directRefresh) {
              try {
                window.history.replaceState({}, document.title, window.location.pathname);
              } catch {}
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
            } catch {}

            let meta: Record<string, any> = {};
            try {
              const rawMeta = sessionStorage.getItem('oauth_meta');
              if (rawMeta) {
                meta = JSON.parse(rawMeta);
                sessionStorage.removeItem('oauth_meta');
              }
            } catch {}

            try {
              window.history.replaceState({}, document.title, window.location.pathname);
            } catch {}

            const payload: Record<string, any> = {
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
            } catch {}
            return dispatch({ type: 'SIGN_OUT' });
          }
        }
      }

      // Carga los tokens guardados localmente y actualiza los datos del usuario desde el servidor.
      const saved = await loadSession();
      if (!saved.accessToken || !saved.refreshToken) {
        return dispatch({ type: 'SIGN_OUT' });
      }
      setSessionTokens(saved);
      dispatch({ type: 'SET_REFRESHING', value: true });
      try {
        const fresh = await usersApi.me();
        await saveSession({ user: fresh });
        const localSavedTheme = await loadThemePreference();
        if (localSavedTheme === 'dark' || localSavedTheme === 'light') {
          await setThemeMode(localSavedTheme);
        } else if (fresh?.preferences?.theme) {
          await setThemeMode(fresh.preferences.theme);
        }
        dispatch({ type: 'SET_USER', user: fresh });
      } catch (e: any) {
        if (!e.response && saved.user) {
          dispatch({ type: 'SET_USER', user: saved.user });
        } else {
          await signOutLocal();
        }
      }
    })();
  }, [signOutLocal, setThemeMode, startSession]);

  // Define las acciones de autenticación disponibles para las pantallas de la aplicación.
  const actions = useMemo(
    () => ({
      startSession,
      async login(email: string, password: string) {
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
      async verifyTwoFactor(userId: number, code: string) {
        const res = await authApi.verify2fa({ userId, code });
        await startSession(res);
        return res;
      },
      async verifyEmail(userId: number, token: string) {
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
      async register(payload: any) {
        const res = await authApi.register(payload);
        const data = res.data || res;
        if (data?.requiresVerification || data?.twoFactorRequired) {
          return data;
        }
        await startSession(res);
        return data;
      },
      async socialLogin(provider: string, body: any) {
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
      async setSchoolGroup(schoolYear: number, courseDivision: number, accessCode?: string) {
        const updated = await usersApi.setSchoolGroup({ schoolYear, courseDivision, accessCode });
        await saveSession({ user: updated });
        dispatch({ type: 'SET_USER', user: updated });
        return updated;
      },
      async updateProfile(body: any) {
        const updated = await usersApi.updateMe(body);
        if (body.themePreference || body.notificationsEnabled !== undefined) {
          await usersApi
            .updatePreferences({
              theme: body.themePreference,
              notifications: body.notificationsEnabled,
            })
            .catch(() => {});
        }
        await saveSession({ user: updated });
        dispatch({ type: 'SET_USER', user: updated });
        return updated;
      },
      async changePassword(body: any) {
        return usersApi.updatePassword(body);
      },
      async setup2FA(currentPassword?: string) {
        return authApi.setup2fa(currentPassword);
      },
      async confirm2FA(code: string) {
        const res = await authApi.verify2fa({ code });
        const fresh = await usersApi.me();
        await saveSession({ user: fresh });
        dispatch({ type: 'SET_USER', user: fresh });
        return res.data || res;
      },
      async disable2FA(body: any) {
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
      async updateUser(user: UsuarioCliente) {
        await saveSession({ user });
        dispatch({ type: 'SET_USER', user });
      },
      async logout() {
        const { refreshToken } = await loadSession();
        try {
          if (refreshToken) await authApi.logout(refreshToken);
        } catch {
          // Si no hay conexión con el servidor, procede con el cierre de sesión local.
        }
        await signOutLocal();
      },
    }),
    [startSession, signOutLocal]
  );

  // Construye el valor expuesto por el proveedor de autenticación.
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

// Gancho personalizado para acceder al estado y acciones de autenticación.
export const useAuth = () => useContext(AuthContext);
