/**
 * Archivo: mobile/src/context/ThemeContext.js
 * Descripción: Proveedor global de Tema Claro / Oscuro con persistencia en almacenamiento
 * seguro y sincronización con la preferencia del sistema Android.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { colors as mutableColors, darkColors, lightColors } from '../theme';
import { loadThemePreference, saveThemePreference } from '../utils/storage';

const ThemeContext = createContext({
  mode: 'dark',
  isDark: true,
  colors: darkColors,
  toggleTheme: () => {},
  setThemeMode: () => {},
});

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('dark');

  useEffect(() => {
    (async () => {
      const saved = await loadThemePreference();
      if (saved === 'dark' || saved === 'light') {
        setMode(saved);
      } else {
        // Modo oscuro predeterminado siempre
        setMode('dark');
        await saveThemePreference('dark');
      }
    })();
  }, []);

  const palette = mode === 'dark' ? darkColors : lightColors;
  // Mantiene sincronizado el objeto compartido para componentes sin hook
  Object.assign(mutableColors, palette);

  const setThemeMode = useCallback(async (nextMode) => {
    const clean = nextMode === 'dark' ? 'dark' : 'light';
    setMode(clean);
    await saveThemePreference(clean);
  }, []);

  const toggleTheme = useCallback(async () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    await saveThemePreference(next);
  }, [mode]);

  const value = useMemo(
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

export const useTheme = () => useContext(ThemeContext);
