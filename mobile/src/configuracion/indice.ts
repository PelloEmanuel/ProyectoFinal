import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

// Obtiene el origen de red actual desde el navegador web, el paquete de React Native o el manifiesto de Expo.
function getExpoOrigin(): string | null {
  // Si se ejecuta en web, utiliza el protocolo y host de la ventana actual.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.host}`;
  }

  // Extrae el origen desde la URL del script cargado por el motor nativo.
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (typeof scriptURL === 'string') {
    const match = scriptURL.match(/^(https?:\/\/[^/]+)/i);
    if (match) return match[1];
  }

  // Consulta el host de depuración informado por la configuración de Expo Go.
  const debuggerHost =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;
  if (debuggerHost) {
    const isTunnel = debuggerHost.includes('exp.direct') || debuggerHost.includes('ngrok');
    return `${isTunnel ? 'https' : 'http'}://${debuggerHost}`;
  }
  return null;
}

// Resuelve las direcciones URL principal y de respaldo para conectarse con la API REST v1.
export function resolveApiUrls(): { primary: string; fallback: string } {
  // Prioriza la variable de entorno pública si fue definida explícitamente.
  const envUrl = (process.env.EXPO_PUBLIC_API_URL || '').trim();
  if (envUrl) return { primary: envUrl, fallback: envUrl };

  // En entorno web, apunta al mismo origen del servidor que aloja el sitio.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    const sameOriginUrl = `${origin}/api/v1`;
    return { primary: sameOriginUrl, fallback: sameOriginUrl };
  }

  // En dispositivos móviles, calcula la dirección IP local en el puerto 3000 y el proxy de respaldo.
  const origin = getExpoOrigin();
  if (origin) {
    const hostOnly = origin.replace(/^https?:\/\//i, '').split(':')[0];
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostOnly);
    const directUrl = isIpv4 ? `http://${hostOnly}:3000/api/v1` : `${origin}/api/v1`;
    const proxyUrl = `${origin}/api/v1`;
    return { primary: directUrl, fallback: proxyUrl };
  }

  // Utiliza la URL de producción en Render como destino predeterminado.
  const def = 'https://campus-58oe.onrender.com/api/v1';
  return { primary: def, fallback: def };
}

// Exporta las constantes de URL activa y de respaldo de la API.
const urls = resolveApiUrls();
export const API_URL = urls.primary;
export const FALLBACK_API_URL = urls.fallback;

// Convierte una ruta relativa de un archivo subido en su dirección URL absoluta accesible.
export function resolveAssetUrl(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_URL.replace(/\/api\/v1\/?$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Define los identificadores de cliente públicos para los proveedores de autenticación OAuth 2.0.
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
