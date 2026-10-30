/**
 * Archivo: mobile/src/hooks/useSocialAuth.js
 * Descripción: Hook para autenticación OAuth 2.0 (Google, GitHub, Discord, Facebook)
 * mediante el flujo proxy de Render:
 * 1) Inicia en https://campus-58oe.onrender.com/api/v1/auth/oauth/:provider/start
 * 2) El handshake con el proveedor se realiza de servidor a servidor usando URLs HTTPS autorizadas en Render.
 * 3) Render devuelve los tokens de sesión JWT directamente a Expo Go (scheme: 'skilltrack' o exp://...) o Web.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { API_URL } from '../config';

WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

function getBackendBase() {
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

function resolveRedirectUri() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return makeRedirectUri({
    scheme: 'skilltrack',
    preferLocalhost: false,
  });
}

export default function useSocialAuth({ onCredential, onError }) {
  const handledRef = useRef(new Set());

  // Escucha de retorno para Web (por si regresa a la misma pestaña o ventana)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const parseUrl = (href) => {
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
          } catch (e) {}
          return true;
        }
      } catch (e) {
        console.error('SkillTrack OAuth parser error:', e);
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

  return async (provider, options = {}) => {
    const backendBase = getBackendBase();
    const returnTo = resolveRedirectUri();

    const query = new URLSearchParams({
      return_to: returnTo,
    });

    if (options?.role) query.append('role', options.role);
    if (options?.instructorKey) query.append('instructorKey', options.instructorKey);
    if (options?.preceptorKey) query.append('preceptorKey', options.preceptorKey);
    if (options?.schoolYear) query.append('schoolYear', options.schoolYear);
    if (options?.courseDivision) query.append('courseDivision', options.courseDivision);

    const startUrl = `${backendBase}/api/v1/auth/oauth/${provider}/start?${query.toString()}`;

    // Flujo Web: redirección directa
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.location.href = startUrl;
      } catch (err) {
        console.error('Error al redirigir para autenticación web:', err);
        onError('No se pudo abrir el enlace de autenticación');
      }
      return;
    }

    // Flujo Nativo / Expo Go: abrir navegador seguro con retorno automático
    try {
      const result = await WebBrowser.openAuthSessionAsync(startUrl, returnTo);

      if (result.type === 'success' && result.url) {
        const u = new URL(result.url);
        const search = u.search || '';
        const hash = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
        const sp = new URLSearchParams(search);
        const hp = new URLSearchParams(hash);

        const error = sp.get('error') || hp.get('error');
        if (error) {
          return onError(`Error de autenticación: ${error}`);
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
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // Ventana cerrada por el usuario
      }
    } catch (err) {
      console.error('Error en autenticación móvil con Expo Go:', err);
      onError(err.message || 'No se pudo completar la autenticación con el proveedor');
    }
  };
}
