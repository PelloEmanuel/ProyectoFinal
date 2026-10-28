/**
 * Configuración global de la app móvil.
 * Descubre en tiempo real la IP o túnel con el que el celular se conectó a Expo
 * (usando SourceCode.scriptURL y Constants de Expo), para funcionar en cualquier red Wi-Fi
 * o datos móviles sin necesidad de cambiar IPs manualmente.
 * Se conecta con src/api/client.js y src/hooks/useSocialAuth.js.
 */
import { NativeModules } from 'react-native';
import Constants from 'expo-constants';

function getExpoOrigin() {
  // 1) URL exacta desde donde React Native descargó el bundle en este instante
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (typeof scriptURL === 'string') {
    const match = scriptURL.match(/^(https?:\/\/[^/]+)/i);
    if (match) return match[1];
  }
  // 2) Host informado por el manifiesto de Expo Go
  const debuggerHost =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;
  if (debuggerHost) {
    const isTunnel = debuggerHost.includes('exp.direct') || debuggerHost.includes('ngrok');
    return `${isTunnel ? 'https' : 'http'}://${debuggerHost}`;
  }
  return null;
}

export function resolveApiUrls() {
  const envUrl = (process.env.EXPO_PUBLIC_API_URL || '').trim();
  if (envUrl) return { primary: envUrl, fallback: envUrl };

  const origin = getExpoOrigin();
  if (origin) {
    // origin es por ejemplo "http://10.247.191.36:8081"
    const hostOnly = origin.replace(/^https?:\/\//i, '').split(':')[0];
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostOnly);
    const directUrl = isIpv4 ? `http://${hostOnly}:3000/api/v1` : `${origin}/api/v1`;
    const proxyUrl = `${origin}/api/v1`;
    return { primary: directUrl, fallback: proxyUrl };
  }

  const def = 'http://10.0.2.2:3000/api/v1';
  return { primary: def, fallback: def };
}

const urls = resolveApiUrls();
export const API_URL = urls.primary;
export const FALLBACK_API_URL = urls.fallback;

export const OAUTH = {
  googleAndroid: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  googleWeb: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIos: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  facebook: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID,
  github: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID,
};
