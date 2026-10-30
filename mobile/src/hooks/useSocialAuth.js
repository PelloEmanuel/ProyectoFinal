/**
 * Archivo: mobile/src/hooks/useSocialAuth.js
 * Descripción: Hook para autenticación OAuth 2.0 / OpenID Connect en React Native
 * con Google (obligatorio), GitHub y Discord.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';
import { OAUTH } from '../config';

WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

function resolveRedirectUri(provider) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return makeRedirectUri({ scheme: 'skilltrack', path: `oauth/${provider}` });
}

const githubDiscovery = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
};

const discordDiscovery = {
  authorizationEndpoint: 'https://discord.com/api/oauth2/authorize',
  tokenEndpoint: 'https://discord.com/api/oauth2/token',
};

export default function useSocialAuth({ onCredential, onError }) {
  const googleRedirect = useMemo(() => resolveRedirectUri('google'), []);
  const githubRedirect = useMemo(() => resolveRedirectUri('github'), []);
  const discordRedirect = useMemo(() => resolveRedirectUri('discord'), []);
  const handledCodeRef = useRef(new Set());

  const [gReq, gRes, gPrompt] = Google.useAuthRequest({
    clientId: OAUTH.googleWeb,
    androidClientId: OAUTH.googleAndroid || OAUTH.googleWeb,
    webClientId: OAUTH.googleWeb,
    redirectUri: googleRedirect,
    scopes: ['profile', 'email', 'openid'],
  });
  const [fReq, fRes, fPrompt] = Facebook.useAuthRequest({
    clientId: OAUTH.facebook || 'missing',
  });
  const [hReq, hRes, hPrompt] = useAuthRequest(
    {
      clientId: OAUTH.github || 'missing',
      scopes: ['read:user', 'user:email'],
      redirectUri: githubRedirect,
    },
    githubDiscovery
  );
  const [dReq, dRes, dPrompt] = useAuthRequest(
    {
      clientId: OAUTH.discord || 'missing',
      scopes: ['identify', 'email'],
      redirectUri: discordRedirect,
      responseType: 'code',
    },
    discordDiscovery
  );

  // Escucha multicanal para Web (BroadcastChannel, LocalStorage, Polling, PostMessage)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const processOAuthUrl = (urlStr) => {
      try {
        const u = new URL(urlStr, window.location.origin);
        const searchParams = new URLSearchParams(u.search);
        const hashStr = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
        const hashParams = new URLSearchParams(hashStr);

        const error = searchParams.get('error') || hashParams.get('error');
        if (error) {
          onError(`Error de autenticación: ${error}`);
          return true;
        }

        const code = searchParams.get('code') || hashParams.get('code');
        const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
        const idToken = hashParams.get('id_token') || searchParams.get('id_token');

        const key = code || accessToken || idToken;
        if (!key || handledCodeRef.current.has(key)) return false;
        handledCodeRef.current.add(key);

        if (code) {
          onCredential('google', {
            code,
            redirectUri: googleRedirect,
            codeVerifier: gReq?.codeVerifier,
          });
          return true;
        } else if (accessToken) {
          onCredential('google', { accessToken });
          return true;
        } else if (idToken) {
          onCredential('google', { idToken });
          return true;
        }
      } catch (e) {
        console.error('SkillTrack OAuth parser error:', e);
      }
      return false;
    };

    // 1. Si la ventana actual tiene parámetros OAuth en URL (mismo tab / redirect)
    if (window.location.search?.includes('code=') || window.location.hash?.includes('access_token=') || window.location.hash?.includes('id_token=')) {
      const handled = processOAuthUrl(window.location.href);
      if (handled) {
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {}
      }
    }

    // 2. BroadcastChannel
    let bc = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('skilltrack_oauth_channel');
        bc.onmessage = (e) => {
          if (e.data?.url) processOAuthUrl(e.data.url);
        };
      }
    } catch (e) {}

    // 3. Storage event
    const handleStorage = (e) => {
      if (e.key === 'SKILLTRACK_OAUTH_RESULT' && e.newValue) {
        try {
          const payload = JSON.parse(e.newValue);
          if (payload?.url) {
            processOAuthUrl(payload.url);
            window.localStorage.removeItem('SKILLTRACK_OAUTH_RESULT');
          }
        } catch (err) {}
      }
    };

    // 4. Polling de respaldo cada 300ms
    const pollInterval = setInterval(() => {
      try {
        const raw = window.localStorage.getItem('SKILLTRACK_OAUTH_RESULT');
        if (raw) {
          const payload = JSON.parse(raw);
          if (payload?.url) {
            processOAuthUrl(payload.url);
            window.localStorage.removeItem('SKILLTRACK_OAUTH_RESULT');
          }
        }
      } catch (e) {}
    }, 300);

    // 5. PostMessage directo
    const handleMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.url && typeof e.data.url === 'string') {
        processOAuthUrl(e.data.url);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('message', handleMessage);

    return () => {
      clearInterval(pollInterval);
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('message', handleMessage);
    };
  }, [googleRedirect, gReq, onCredential, onError]);

  // Hook nativo de Expo Auth Session como vía primaria
  useEffect(() => {
    if (gRes?.type === 'success') {
      const code = gRes.params?.code;
      const accessToken = gRes.authentication?.accessToken || gRes.params?.access_token;
      const idToken = gRes.authentication?.idToken || gRes.params?.id_token;
      const key = code || accessToken || idToken;

      if (key && !handledCodeRef.current.has(key)) {
        handledCodeRef.current.add(key);
        if (code) {
          onCredential('google', {
            code,
            redirectUri: gReq?.redirectUri || googleRedirect,
            codeVerifier: gReq?.codeVerifier,
          });
        } else if (accessToken) {
          onCredential('google', { accessToken });
        } else if (idToken) {
          onCredential('google', { idToken });
        }
      }
    } else if (gRes?.type === 'error') {
      onError('No se pudo completar el inicio de sesión con Google.');
    }
  }, [gRes]);

  useEffect(() => {
    if (fRes?.type === 'success') onCredential('facebook', { accessToken: fRes.authentication.accessToken });
    else if (fRes?.type === 'error') onError('No se pudo completar el inicio de sesión con Facebook.');
  }, [fRes]);

  useEffect(() => {
    if (hRes?.type === 'success') {
      onCredential('github', {
        code: hRes.params.code,
        redirectUri: hReq?.redirectUri || githubRedirect,
        codeVerifier: hReq?.codeVerifier,
      });
    } else if (hRes?.type === 'error') {
      onError('No se pudo completar el inicio de sesión con GitHub.');
    }
  }, [hRes]);

  useEffect(() => {
    if (dRes?.type === 'success') {
      onCredential('discord', {
        code: dRes.params.code,
        redirectUri: dReq?.redirectUri || discordRedirect,
        codeVerifier: dReq?.codeVerifier,
      });
    } else if (dRes?.type === 'error') {
      onError('No se pudo completar el inicio de sesión con Discord.');
    }
  }, [dRes]);

  const configured = {
    google: !!(OAUTH.googleAndroid || OAUTH.googleWeb || OAUTH.googleIos),
    github: !!OAUTH.github,
    discord: !!OAUTH.discord,
    facebook: !!OAUTH.facebook,
  };
  const prompts = {
    google: [gReq, gPrompt],
    github: [hReq, hPrompt],
    discord: [dReq, dPrompt],
    facebook: [fReq, fPrompt],
  };

  return (provider) => {
    if (!configured[provider]) {
      const names = { google: 'Google', github: 'GitHub', discord: 'Discord', facebook: 'Facebook' };
      return onError(
        `El proveedor ${names[provider] || provider} requiere configurar su Client ID real en mobile/.env (ver docs/GUIA_INSTALACION.md).`
      );
    }
    const [req, prompt] = prompts[provider];
    if (req) prompt();
  };
}
