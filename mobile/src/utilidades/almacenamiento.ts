import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { UsuarioCliente } from '../tipos';

// Define las claves internas para almacenar tokens, perfil y tema visual.
const KEYS = {
  access: 'skt_access_token',
  refresh: 'skt_refresh_token',
  user: 'skt_user_profile',
  theme: 'skt_theme_mode',
};

// Detecta si el entorno de ejecución dispone de localStorage en navegador web.
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && Boolean(window.localStorage);

// Guarda un valor de texto de forma segura en localStorage (Web) o SecureStore (Android/iOS).
async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignora errores de cuota en almacenamiento web.
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (err) {
    console.warn(`SecureStore setItem error for key "${key}":`, err);
  }
}

// Recupera un valor almacenado por su clave desde localStorage o SecureStore.
async function getItem(key: string): Promise<string | null> {
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

// Elimina una clave almacenada tanto en entorno web como nativo.
async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignora errores de limpieza en navegador.
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    console.warn(`SecureStore deleteItem error for key "${key}":`, err);
  }
}

// Persiste los tokens de sesión y los datos del usuario autenticado.
export async function saveSession({
  accessToken,
  refreshToken,
  user,
}: {
  accessToken?: string | null;
  refreshToken?: string | null;
  user?: UsuarioCliente | null;
}): Promise<void> {
  try {
    if (accessToken) await setItem(KEYS.access, accessToken);
    if (refreshToken) await setItem(KEYS.refresh, refreshToken);
    if (user) await setItem(KEYS.user, JSON.stringify(user));
  } catch {
    // Continúa sin interrumpir si el llavero del dispositivo no responde.
  }
}

// Carga los tokens y el perfil de usuario almacenados localmente al iniciar la aplicación.
export async function loadSession(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  user: UsuarioCliente | null;
}> {
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

// Elimina todos los datos de sesión almacenados al cerrar la cuenta.
export async function clearSession(): Promise<void> {
  try {
    await Promise.all([
      deleteItem(KEYS.access),
      deleteItem(KEYS.refresh),
      deleteItem(KEYS.user),
    ]);
  } catch {
    // Ignora errores durante el borrado de sesión.
  }
}

// Guarda la preferencia de tema claro u oscuro seleccionada por el usuario.
export async function saveThemePreference(mode: 'light' | 'dark' | string): Promise<void> {
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

// Recupera la preferencia de tema visual guardada en el dispositivo.
export async function loadThemePreference(): Promise<'light' | 'dark' | null> {
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
