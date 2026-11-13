import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { colors as mutableColors, darkColors, lightColors } from '../tema';
import { loadThemePreference, saveThemePreference } from '../utilidades/almacenamiento';
import { PaletaColores } from '../tipos';

// Define la estructura del valor provisto por el contexto de tema visual.
interface ValorContextoTema {
  mode: 'light' | 'dark';
  isDark: boolean;
  colors: PaletaColores;
  toggleTheme: () => Promise<void>;
  setThemeMode: (nextMode: 'light' | 'dark' | string) => Promise<void>;
  setThemePreference?: (nextMode: 'light' | 'dark' | string) => Promise<void>;
}

// Determina el modo de color inicial leyendo la preferencia almacenada en el navegador si está disponible.
const getInitialTheme = (): 'light' | 'dark' => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = window.localStorage.getItem('skt_theme_mode');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // Ignora errores de acceso a localStorage.
    }
  }
  return 'dark';
};

// Crea el contexto de React para el tema visual con valores predeterminados en modo oscuro.
const ThemeContext = createContext<ValorContextoTema>({
  mode: 'dark',
  isDark: true,
  colors: darkColors,
  toggleTheme: async () => {},
  setThemeMode: async () => {},
});

// Provee el estado global del tema claro/oscuro a todos los componentes de la aplicación.
export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  // Almacena el modo de color activo en el estado local.
  const [mode, setMode] = useState<'light' | 'dark'>(getInitialTheme);

  // Carga la preferencia guardada en SecureStore al montar el proveedor.
  useEffect(() => {
    (async () => {
      const saved = await loadThemePreference();
      if (saved === 'dark' || saved === 'light') {
        setMode(saved);
      }
    })();
  }, []);

  // Selecciona la paleta correspondiente y actualiza el objeto compartido de colores.
  const palette = mode === 'dark' ? darkColors : lightColors;
  Object.assign(mutableColors, palette);

  // Fija explícitamente un modo de tema y lo persiste en el almacenamiento del dispositivo.
  const setThemeMode = useCallback(async (nextMode: 'light' | 'dark' | string) => {
    const clean = nextMode === 'light' ? 'light' : 'dark';
    setMode(clean);
    await saveThemePreference(clean);
  }, []);

  // Alterna entre el modo oscuro y el modo claro guardando la elección del usuario.
  const toggleTheme = useCallback(async () => {
    setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      saveThemePreference(next).catch(() => {});
      return next;
    });
  }, []);

  // Memoriza el objeto de contexto para evitar renderizados innecesarios.
  const value = useMemo<ValorContextoTema>(
    () => ({
      mode,
      isDark: mode === 'dark',
      colors: palette,
      toggleTheme,
      setThemeMode,
      setThemePreference: setThemeMode,
    }),
    [mode, palette, toggleTheme, setThemeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Gancho personalizado para consumir el tema visual activo desde cualquier componente.
export const useTheme = (): ValorContextoTema => useContext(ThemeContext);
