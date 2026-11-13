import React from 'react';
import { Alert, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Ionicons, MaterialCommunityIcons, MaterialIcons, FontAwesome, Feather } from '@expo/vector-icons';
import { ThemeProvider } from './src/contexto/ContextoTema';
import { AuthProvider } from './src/contexto/ContextoAcceso';
import AppNavigator from './src/navegacion/indice';

// Desactiva las ventanas emergentes nativas del navegador web para mantener todos los avisos integrados en la interfaz.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.alert = (msg?: any) => {
    console.warn('[Campus UI] Se bloqueó una alerta emergente de ventana:', msg);
  };
}

// Intercepta las llamadas a Alert.alert en dispositivos móviles para evitar diálogos intrusivos del sistema.
if (Alert && Alert.alert) {
  Alert.alert = (title: string, message?: string) => {
    console.warn('[Campus UI] Se bloqueó una llamada a Alert.alert:', title, message);
  };
}

// Finaliza sesiones de navegador web iniciadas por flujos de autenticación externa.
WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

// Renderiza el árbol principal de proveedores de contexto, fuentes de iconos y navegación de la aplicación.
export default function Aplicacion(): React.JSX.Element {
  // Precarga las familias de iconos vectoriales utilizadas en las pantallas del Campus.
  useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    ...MaterialIcons.font,
    ...FontAwesome.font,
    ...Feather.font,
  });

  // Envuelve la aplicación con los proveedores de área segura, tema visual y sesión de usuario.
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <AppNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
