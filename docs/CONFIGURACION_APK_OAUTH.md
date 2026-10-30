# Guía de Compilación de APK y OAuth para SkillTrack

Esta guía contiene la configuración oficial y los pasos para compilar el **APK instalable de SkillTrack en Android** y activar la autenticación nativa de Google, Discord y GitHub.

---

## 1. Identificadores Oficiales de la Aplicación
- **Nombre**: `SkillTrack`
- **Paquete de Android (Package Name)**: `com.skilltrack.app`
- **Esquema de deep linking**: `skilltrack://`
- **Huella digital SHA-1 (Keystore Debug/Local)**:
  `97:BF:F6:C1:11:91:8A:2F:4B:56:CE:A4:FD:03:85:7D:42:86:B3:DE`
- **Ubicación del Keystore**: `C:\Users\Pello\.android\debug.keystore`
  - Alias: `androiddebugkey`
  - Contraseña: `android`

---

## 2. Configuración en Proveedores OAuth

### A. Google Cloud Console (Para el APK de Android)
1. Ir a [Google Cloud Console > Credenciales](https://console.cloud.google.com/apis/credentials).
2. Crear credenciales > **ID de cliente de OAuth**.
3. Tipo: **Android**.
4. Completar:
   - Nombre: `SkillTrack Android APK`
   - Nombre del paquete: `com.skilltrack.app`
   - Huella digital SHA-1: `97:BF:F6:C1:11:91:8A:2F:4B:56:CE:A4:FD:03:85:7D:42:86:B3:DE`
5. Guardar el nuevo Client ID de Android en `mobile/.env` como:
   `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=tu-id-android.apps.googleusercontent.com`

### B. Discord Developer Portal
En [Discord Developer Portal](https://discord.com/developers/applications) > SkillTrack > **OAuth2 > Redirects**, tener registradas:
- `http://localhost:8081` (Para desarrollo Web)
- `skilltrack://oauth/discord` (Para la app móvil / APK)

### C. GitHub Developer Settings
En [GitHub Developer Settings](https://github.com/settings/developers) > SkillTrack:
- Authorization callback URL: `http://localhost:8081` (Para web) o `skilltrack://oauth/github` (Para APK)

---

## 3. Comandos para Generar el APK Instalable

### Opción 1: Compilación Local de Android con Gradle
```powershell
cd mobile
npx expo run:android --variant release
```
El archivo `.apk` instalable se genera en:
`mobile/android/app/build/outputs/apk/release/app-release.apk`

### Opción 2: Compilación con EAS CLI (Nube o Local)
```powershell
cd mobile
npx eas build -p android --profile preview
```
Genera un archivo `.apk` directamente descargable e instalable en cualquier teléfono Android.
