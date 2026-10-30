/**
 * Configuración global de la app móvil y versión Web.
 * Descubre en tiempo real la IP, navegador web o túnel con el que se conectó a Expo
 * (usando window.location en web, SourceCode.scriptURL y Constants de Expo en móvil),
 * para funcionar tanto en navegador como en cualquier red Wi-Fi o datos móviles.
 */
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

function getExpoOrigin() {
  // 0) Si se está ejecutando en el navegador web, usar el host actual del navegador
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.host}`;
  }
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

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    const sameOriginUrl = `${origin}/api/v1`;
    return { primary: sameOriginUrl, fallback: sameOriginUrl };
  }

  const origin = getExpoOrigin();
  if (origin) {
    // origin es por ejemplo "http://10.247.191.36:8081"
    const hostOnly = origin.replace(/^https?:\/\//i, '').split(':')[0];
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostOnly);
    const directUrl = isIpv4 ? `http://${hostOnly}:3000/api/v1` : `${origin}/api/v1`;
    const proxyUrl = `${origin}/api/v1`;
    return { primary: directUrl, fallback: proxyUrl };
  }

  const def = 'https://campus-58oe.onrender.com/api/v1';
  return { primary: def, fallback: def };
}

const urls = resolveApiUrls();
export const API_URL = urls.primary;
export const FALLBACK_API_URL = urls.fallback;

/**
 * Resuelve URLs relativas de archivos estáticos (ej. /uploads/archivo.pdf)
 * a su URL accesible completa.
 */
export function resolveAssetUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_URL.replace(/\/api\/v1\/?$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const OAUTH = {
  googleAndroid:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    '915967768938-96oivvmgdgv6id86i44ma4mi724njnr5.apps.googleusercontent.com',
  googleWeb:
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    '915967768938-96oivvmgdgv6id86i44ma4mi724njnr5.apps.googleusercontent.com',
  googleIos: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  discord: process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID || '1565140680416952535',
  facebook: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID,
  github: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || 'Ov23liadUCpECQvcaMnu',
};
