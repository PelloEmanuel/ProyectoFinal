import React from 'react';
import { Alert, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Ionicons, MaterialCommunityIcons, MaterialIcons, FontAwesome, Feather } from '@expo/vector-icons';
import { ThemeProvider } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation';

// Bloqueo total de popups y alertas nativas en la web (NO SE PERMITEN ALERTS DE NINGÚN TIPO)
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.alert = (msg) => {
    console.warn('[Campus UI] Se bloqueó una alerta emergente de ventana:', msg);
  };
}
if (Alert && Alert.alert) {
  Alert.alert = (title, message) => {
    console.warn('[Campus UI] Se bloqueó una llamada a Alert.alert:', title, message);
  };
}

WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

export default function App() {
  useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    ...MaterialIcons.font,
    ...FontAwesome.font,
    ...Feather.font,
  });

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
