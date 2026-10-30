/**
 * Archivo: mobile/src/utils/storage.js
 * Descripción: Almacenamiento cifrado mediante Expo SecureStore en Android/iOS
 * y compatibilidad automática con localStorage cuando se abre desde el navegador web.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  access: 'skt_access_token',
  refresh: 'skt_refresh_token',
  user: 'skt_user_profile',
  theme: 'skt_theme_mode',
};

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage;

async function setItem(key, value) {
  if (isWeb) {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key) {
  if (isWeb) {
    return window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key) {
  if (isWeb) {
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveSession({ accessToken, refreshToken, user }) {
  try {
    if (accessToken) await setItem(KEYS.access, accessToken);
    if (refreshToken) await setItem(KEYS.refresh, refreshToken);
    if (user) await setItem(KEYS.user, JSON.stringify(user));
  } catch {
    // Fallback silencioso si el llavero del dispositivo no está disponible
  }
}

export async function loadSession() {
  try {
    const [accessToken, refreshToken, user] = await Promise.all([
      getItem(KEYS.access),
      getItem(KEYS.refresh),
      getItem(KEYS.user),
    ]);
    return {
      accessToken: accessToken || null,
      refreshToken: refreshToken || null,
      user: user ? JSON.parse(user) : null,
    };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

export async function clearSession() {
  try {
    await Promise.all([
      deleteItem(KEYS.access),
      deleteItem(KEYS.refresh),
      deleteItem(KEYS.user),
    ]);
  } catch {
    // Ignorar error de limpieza
  }
}

export async function saveThemePreference(mode) {
  try {
    await setItem(KEYS.theme, mode);
  } catch {
    // Ignorar
  }
}

export async function loadThemePreference() {
  try {
    const val = await getItem(KEYS.theme);
    return val || 'dark';
  } catch {
    return 'dark';
  }
}
