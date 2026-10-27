import * as SecureStore from 'expo-secure-store';

// Almacenamiento cifrado (Keychain / Keystore) para la sesión persistente.
const KEYS = { access: 'tf_access', refresh: 'tf_refresh', user: 'tf_user' };

export async function saveSession({ accessToken, refreshToken, user }) {
  if (accessToken) await SecureStore.setItemAsync(KEYS.access, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(KEYS.refresh, refreshToken);
  if (user) await SecureStore.setItemAsync(KEYS.user, JSON.stringify(user));
}

export async function loadSession() {
  const [accessToken, refreshToken, user] = await Promise.all([
    SecureStore.getItemAsync(KEYS.access),
    SecureStore.getItemAsync(KEYS.refresh),
    SecureStore.getItemAsync(KEYS.user),
  ]);
  return { accessToken, refreshToken, user: user ? JSON.parse(user) : null };
}

export async function clearSession() {
  await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k)));
}
