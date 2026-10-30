/**
 * Archivo: mobile/src/hooks/useSocialAuth.js
 * Descripción: Hook para autenticación OAuth 2.0 / OpenID Connect en React Native
 * con Google (obligatorio), GitHub y Discord.
 */
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';
import { OAUTH } from '../config';

WebBrowser.maybeCompleteAuthSession();

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

  useEffect(() => {
    if (gRes?.type === 'success') {
      const code = gRes.params?.code;
      const accessToken = gRes.authentication?.accessToken || gRes.params?.access_token;
      if (code) {
        onCredential('google', {
          code,
          redirectUri: gReq?.redirectUri || googleRedirect,
          codeVerifier: gReq?.codeVerifier,
        });
      } else if (accessToken) {
        onCredential('google', { accessToken });
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
