# Guía de Instalación, Configuración y Despliegue — Campus

Esta guía explica paso a paso cómo instalar, configurar y ejecutar **Campus** en **Windows con PowerShell**, incluyendo la base de datos **MySQL / MariaDB (XAMPP)**, el servidor **Backend (Node.js + Express)**, la aplicación móvil **React Native (Expo)** y la generación del archivo instalable **APK para Android**.

---

## 1. Requisitos del Sistema

1. **Sistema Operativo**: Windows 10 o Windows 11 (con PowerShell).
2. **Node.js**: Versión 18 LTS o 20 LTS instalada (`node -v` y `npm -v`).
3. **XAMPP (MySQL / MariaDB)**: Instalado en `C:\xampp` con el servicio **MySQL** corriendo en el puerto `3306`.
4. **Dispositivo Android físico** (con la app **Expo Go** instalada desde Google Play Store o para instalar el APK) o **Android Studio Emulator**.

---

## 2. Configuración de la Base de Datos MySQL (XAMPP)

1. Abrí el **XAMPP Control Panel** (`C:\xampp\xampp-control.exe`).
2. Presioná el botón **Start** junto a **MySQL** hasta que el indicador se ponga en verde (puerto `3306`).
3. Abrí PowerShell y ubicáte en la carpeta del backend:
   ```powershell
   cd C:\xampp\htdocs\ProyectoFinal\backend
   ```
4. Instalá las dependencias del backend:
   ```powershell
   npm install
   ```
5. Inicializá el esquema relacional (`backend/sql/schema.sql`, 25 tablas en 3FN) y cargá los datos semilla (`backend/sql/seed.sql`):
   ```powershell
   npm run init-db
   ```
   > **Nota**: Además del comando manual `npm run init-db`, el servidor backend cuenta con la variable `AUTO_INIT_DB=true` en `backend/.env` que verifica y crea automáticamente las tablas si la base `skilltrack` aún no existe al arrancar.

---

## 3. Variables de Entorno

### 3.1. Backend (`backend/.env`)

Podés partir del archivo `backend/.env.example`:

```env
PORT=3000
NODE_ENV=development

# Conexión MySQL / MariaDB (XAMPP)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=skilltrack
AUTO_INIT_DB=true

# Seguridad JWT y Cifrado AES-256-GCM para TOTP (2FA)
JWT_ACCESS_SECRET=skilltrack_jwt_secret_key_2026_segura
JWT_ACCESS_EXPIRES=15m
REFRESH_DAYS=30
TOTP_ENCRYPTION_KEY=skilltrack_totp_aes256_secret_key_2026

# Credenciales OAuth 2.0 Reales (Opcionales en desarrollo; documentadas abajo)
GOOGLE_CLIENT_ID=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

# Servidor SMTP para envío de correos reales (En desarrollo se imprimen en consola)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Campus <no-reply@skilltrack.edu>"
APP_PUBLIC_URL=http://localhost:3000
```

### 3.2. Aplicación Móvil (`mobile/.env`)

```env
# Dejalo vacío para que Campus detecte automáticamente la IP Wi-Fi o el túnel de Expo:
EXPO_PUBLIC_API_URL=

# Credenciales públicas OAuth 2.0 (cuando configures proveedores externos reales)
EXPO_PUBLIC_GOOGLE_CLIENT_ID=
EXPO_PUBLIC_GITHUB_CLIENT_ID=
EXPO_PUBLIC_FACEBOOK_APP_ID=
```

---

## 4. Configuración de Proveedores OAuth 2.0 Reales (Google, GitHub y Facebook)

La arquitectura OAuth 2.0 / OpenID Connect está implementada de punta a punta en `mobile/src/hooks/useSocialAuth.js` y `backend/src/utils/social.js`. Para usar credenciales productivas propias:

1. **Google Cloud Console**:
   - Creá un proyecto en `https://console.cloud.google.com/`, habilitá *Google Identity* y creá un **OAuth 2.0 Client ID**.
   - Copiá el Client ID en `GOOGLE_CLIENT_ID` (`backend/.env`) y en `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (`mobile/.env`).
2. **GitHub Developer Settings**:
   - Ingresá a *Settings -> Developer settings -> OAuth Apps -> New OAuth App*.
   - Configurá el callback de Expo AuthSession y copiá `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` en `backend/.env` y `EXPO_PUBLIC_GITHUB_CLIENT_ID` en `mobile/.env`.
3. **Meta / Facebook for Developers**:
   - Creá una aplicación de tipo *Consumer* en `https://developers.facebook.com/`, activá *Facebook Login* y copiá `FACEBOOK_APP_ID` y `FACEBOOK_APP_SECRET` en `backend/.env` y `EXPO_PUBLIC_FACEBOOK_APP_ID` en `mobile/.env`.

---

## 5. Ejecución en Entorno de Desarrollo

### Paso 1: Levantar el Backend
```powershell
cd C:\xampp\htdocs\ProyectoFinal\backend
npm start
```
Verás en consola: `Campus API escuchando en http://0.0.0.0:3000`.

### Paso 2: Levantar la Aplicación Móvil (Expo)
En una segunda ventana de PowerShell:
```powershell
cd C:\xampp\htdocs\ProyectoFinal\mobile
npm install
npx expo start --lan
```
- **Si el celular y la PC están en el mismo Wi-Fi**: Escaneá el código QR desde **Expo Go**. La app detectará automáticamente la IP LAN actual sin importar si cambiaste de red Wi-Fi.
- **Si usás Datos Móviles (4G/5G) o una red con aislamiento AP**: Ejecutá `npx expo start --tunnel`. Gracias al proxy integrado en `mobile/metro.config.js`, todas las llamadas `/api/v1` viajarán por el mismo túnel de Expo (`:8081`) directo hacia tu backend local (`:3000`).

---

## 6. Ejecución de las Pruebas Automatizadas

Para verificar los 9 escenarios de integración (autenticación, RBAC, propiedad de cursos, progreso, emisión de certificados y autoevaluación/calificación):

```powershell
cd C:\xampp\htdocs\ProyectoFinal\backend
npm test
```

---

## 7. Generación del Archivo APK Instalable para Android

El proyecto incluye el archivo `mobile/eas.json` y `mobile/app.json` (`package: "com.skilltrack.app"`) listos para generar un **APK instalable** en Android (`buildType: "apk"`).

### Opción A: Compilación en la nube con EAS Build (Recomendada en Windows sin Android Studio)
1. Instalá EAS CLI globalmente e iniciá sesión en tu cuenta de Expo:
   ```powershell
   npm install -g eas-cli
   cd C:\xampp\htdocs\ProyectoFinal\mobile
   eas login
   ```
2. Antes de compilar un APK que se conectará desde fuera de tu red local, definí en `mobile/.env` la URL pública de tu backend (por ejemplo, un túnel o servidor desplegado) en `EXPO_PUBLIC_API_URL`.
3. Ejecutá el perfil `preview` o `production` (ambos configurados para producir `.apk` directo):
   ```powershell
   eas build --platform android --profile preview
   ```
4. Al finalizar, EAS te entregará un enlace directo y un código QR para descargar e instalar el archivo `.apk` en cualquier teléfono Android.

### Opción B: Compilación Local con Gradle (Requiere Android SDK + JDK 17)
Si contás con Android Studio y las variables `ANDROID_HOME` y `JAVA_HOME` configuradas en Windows:
```powershell
cd C:\xampp\htdocs\ProyectoFinal\mobile
npx expo prebuild --platform android
cd android
.\gradlew.bat assembleRelease
```
El APK firmado se generará en `mobile\android\app\build\outputs\apk\release\app-release.apk`.
