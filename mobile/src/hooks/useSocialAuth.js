import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';
import { OAUTH } from '../config';

WebBrowser.maybeCompleteAuthSession();

const githubDiscovery = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
};
const githubRedirect = makeRedirectUri({ scheme: 'taskflow', path: 'oauth/github' });

/**
 * Login social con Google, Facebook y GitHub.
 * onCredential(provider, body) recibe lo que espera POST /auth/social/:provider.
 */
export default function useSocialAuth({ onCredential, onError }) {
  const [gReq, gRes, gPrompt] = Google.useAuthRequest({
    androidClientId: OAUTH.googleAndroid || 'missing',
    iosClientId: OAUTH.googleIos || 'missing',
    webClientId: OAUTH.googleWeb || 'missing',
  });
  const [fReq, fRes, fPrompt] = Facebook.useAuthRequest({ clientId: OAUTH.facebook || 'missing' });
  const [hReq, hRes, hPrompt] = useAuthRequest(
    { clientId: OAUTH.github || 'missing', scopes: ['read:user', 'user:email'], redirectUri: githubRedirect },
    githubDiscovery
  );

  useEffect(() => {
    if (gRes?.type === 'success') onCredential('google', { accessToken: gRes.authentication.accessToken });
    else if (gRes?.type === 'error') onError('No se pudo iniciar sesión con Google');
  }, [gRes]);

  useEffect(() => {
    if (fRes?.type === 'success') onCredential('facebook', { accessToken: fRes.authentication.accessToken });
    else if (fRes?.type === 'error') onError('No se pudo iniciar sesión con Facebook');
  }, [fRes]);

  useEffect(() => {
    if (hRes?.type === 'success') onCredential('github', { code: hRes.params.code, redirectUri: githubRedirect });
    else if (hRes?.type === 'error') onError('No se pudo iniciar sesión con GitHub');
  }, [hRes]);

  const configured = { google: !!(OAUTH.googleAndroid || OAUTH.googleWeb), facebook: !!OAUTH.facebook, github: !!OAUTH.github };
  const prompts = { google: [gReq, gPrompt], facebook: [fReq, fPrompt], github: [hReq, hPrompt] };

  return (provider) => {
    if (!configured[provider]) return onError('Este proveedor no está configurado. Revisá el archivo .env de la app.');
    const [req, prompt] = prompts[provider];
    if (req) prompt();
  };
}
