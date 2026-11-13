import * as WebBrowser from 'expo-web-browser';
import { registerRootComponent } from 'expo';
import Aplicacion from './Aplicacion';

// Completa cualquier sesión pendiente de autenticación OAuth en el navegador del sistema.
WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

// Registra el componente raíz de la aplicación en el entorno de ejecución de Expo.
registerRootComponent(Aplicacion);
