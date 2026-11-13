import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { API_URL } from '../configuracion/indice';

// Completa la sesión de navegador si el flujo OAuth regresó a la aplicación.
WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

// Determina la URL base del servidor backend para iniciar el flujo OAuth 2.0.
function getBackendBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    if (!window.location.origin.includes('localhost')) {
      return window.location.origin;
    }
  }
  const cleanApi = (API_URL || '').replace(/\/api\/v1\/?$/, '').trim();
  if (cleanApi && !cleanApi.includes('localhost') && !cleanApi.includes('10.0.2.2')) {
    return cleanApi;
  }
  return 'https://campus-58oe.onrender.com';
}

// Resuelve la URL de retorno adecuada según se ejecute en Web, Expo Go o aplicación nativa APK.
function resolveRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    String(Constants.executionEnvironment) === 'storeClient' ||
    String(Constants.executionEnvironment) === String(ExecutionEnvironment?.StoreClient);

  if (isExpoGo) {
    const linked = Linking.createURL('/');
    if (linked && (linked.startsWith('exp://') || linked.startsWith('exps://'))) {
      return linked;
    }
    if (Constants.linkingUri && (Constants.linkingUri.startsWith('exp://') || Constants.linkingUri.startsWith('exps://'))) {
      return Constants.linkingUri;
    }
    return makeRedirectUri({ preferLocalhost: false });
  }

  return makeRedirectUri({
    native: 'campus://',
    scheme: 'campus',
    preferLocalhost: false,
  });
}

// Gancho personalizado para iniciar la autenticación social OAuth 2.0 y recibir las credenciales resultantes.
export default function usarAccesoSocial({
  onCredential,
  onError,
}: {
  onCredential: (provider: string, data: any) => void;
  onError: (msg: string) => void;
}) {
  const handledRef = useRef<Set<string>>(new Set());

  // Escucha los parámetros de retorno en la URL cuando se ejecuta en el navegador web.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const parseUrl = (href: string) => {
      try {
        const u = new URL(href, window.location.origin);
        const search = u.search || '';
        const hash = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
        const sp = new URLSearchParams(search);
        const hp = new URLSearchParams(hash);

        const error = sp.get('error') || hp.get('error');
        if (error) {
          onError(`Error de autenticación: ${error}`);
          return true;
        }

        const token = sp.get('token') || hp.get('token') || sp.get('accessToken') || hp.get('accessToken');
        const refreshToken = sp.get('refreshToken') || hp.get('refreshToken');
        const key = token || sp.get('code');

        if (!key || handledRef.current.has(key)) return false;
        handledRef.current.add(key);

        if (token && refreshToken) {
          onCredential('oauth_proxy', { token, accessToken: token, refreshToken });
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {}
          return true;
        }
      } catch (e) {
        console.error('Campus OAuth parser error:', e);
      }
      return false;
    };

    if (
      window.location.search?.includes('token=') ||
      window.location.search?.includes('error=') ||
      window.location.hash?.includes('token=')
    ) {
      parseUrl(window.location.href);
    }
  }, [onCredential, onError]);

  // Devuelve la función disparadora del flujo OAuth para el proveedor indicado.
  return async (provider: string, options: Record<string, any> = {}) => {
    const backendBase = getBackendBase();
    const returnTo = resolveRedirectUri();

    const query = new URLSearchParams({
      return_to: returnTo,
    });

    if (options?.role) query.append('role', String(options.role));
    if (options?.instructorKey) query.append('instructorKey', String(options.instructorKey));
    if (options?.preceptorKey) query.append('preceptorKey', String(options.preceptorKey));
    if (options?.schoolYear) query.append('schoolYear', String(options.schoolYear));
    if (options?.courseDivision) query.append('courseDivision', String(options.courseDivision));

    const startUrl = `${backendBase}/api/v1/auth/oauth/${provider}/start?${query.toString()}`;

    // En navegador web, redirige la ventana actual hacia el inicio del flujo OAuth.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.location.href = startUrl;
      } catch (err) {
        console.error('Error al redirigir para autenticación web:', err);
        onError('No se pudo abrir el enlace de autenticación');
      }
      return;
    }

    // En dispositivos móviles, abre una sesión de navegador segura y captura el enlace de retorno.
    try {
      const result = await WebBrowser.openAuthSessionAsync(startUrl, returnTo);

      if (result.type === 'success' && result.url) {
        let search = '';
        let hash = '';
        try {
          const u = new URL(result.url);
          search = u.search || '';
          hash = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
        } catch {
          const parts = result.url.split('?');
          if (parts[1]) search = '?' + parts[1];
        }

        const sp = new URLSearchParams(search);
        const hp = new URLSearchParams(hash);

        const error = sp.get('error') || hp.get('error');
        if (error) {
          return onError(`Error de autenticación: ${error}`);
        }

        const twoFactor = sp.get('twoFactorRequired') || hp.get('twoFactorRequired');
        if (twoFactor === 'true') {
          const userId = sp.get('userId') || hp.get('userId');
          const email = sp.get('email') || hp.get('email');
          return onCredential(provider, { twoFactorRequired: true, userId, email });
        }

        const token = sp.get('token') || hp.get('token') || sp.get('accessToken') || hp.get('accessToken');
        const refreshToken = sp.get('refreshToken') || hp.get('refreshToken');

        if (token && refreshToken) {
          return onCredential(provider, { token, accessToken: token, refreshToken });
        }

        const code = sp.get('code') || hp.get('code');
        if (code) {
          return onCredential(provider, { code, redirectUri: returnTo });
        }

        onError('No se recibieron credenciales de sesión del servidor');
      }
    } catch (err: any) {
      console.error('Error en autenticación móvil con Expo Go:', err);
      onError(err.message || 'No se pudo completar la autenticación con el proveedor');
    }
  };
}
