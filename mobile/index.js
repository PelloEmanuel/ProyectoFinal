import * as WebBrowser from 'expo-web-browser';
import { registerRootComponent } from 'expo';
import App from './App';

WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

registerRootComponent(App);
