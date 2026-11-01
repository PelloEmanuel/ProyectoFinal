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
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignorar fallback web
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (err) {
    console.warn(`SecureStore setItem error for key "${key}":`, err);
  }
}

async function getItem(key) {
  if (isWeb) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    console.warn(`SecureStore getItem error for key "${key}":`, err);
    return null;
  }
}

async function deleteItem(key) {
  if (isWeb) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignorar fallback web
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    console.warn(`SecureStore deleteItem error for key "${key}":`, err);
  }
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
    const clean = mode === 'light' ? 'light' : 'dark';
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(KEYS.theme, clean);
      } catch {}
    }
    await setItem(KEYS.theme, clean);
  } catch (err) {
    console.warn('saveThemePreference error:', err);
  }
}

export async function loadThemePreference() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const webSaved = window.localStorage.getItem(KEYS.theme);
      if (webSaved === 'dark' || webSaved === 'light') return webSaved;
    }
    const val = await getItem(KEYS.theme);
    if (val === 'dark' || val === 'light') return val;
    return null;
  } catch (err) {
    console.warn('loadThemePreference error:', err);
    return null;
  }
}
