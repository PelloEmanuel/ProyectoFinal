# Guía de instalación y configuración

## Requisitos

- Node.js 18 o superior
- MySQL 8
- Git
- Para probar la app: Android Studio (emulador) o un celular con la app **Expo Go** / el APK
- Para generar el APK: cuenta gratuita en [expo.dev](https://expo.dev)

## 1. Clonar

```bash
git clone <URL_DEL_REPOSITORIO> taskflow
cd taskflow
```

## 2. Base de datos

```bash
mysql -u root -p < backend/sql/schema.sql
```

Crea la base `taskflow` con las tablas `users`, `social_accounts`, `refresh_tokens`, `otp_codes` y `tasks`.

## 3. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Editar `.env`:

| Variable | Descripción |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a MySQL |
| `JWT_ACCESS_SECRET` | Cadena larga y aleatoria (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Credenciales OAuth de GitHub (ver paso 5) |
| `SMTP_*`, `MAIL_FROM` | Envío del código de 2 pasos. **Si se dejan vacíos, el código aparece en la consola del backend** (útil para desarrollo y demo) |

Luego:

```bash
npm run seed     # usuarios de prueba (admin, manager, user)
npm run dev      # API en http://localhost:3000  (probar: /health)
```

## 4. App móvil

```bash
cd mobile
npm install
cp .env.example .env
```

Editar `.env`:

- `EXPO_PUBLIC_API_URL`
  - Emulador Android → `http://10.0.2.2:3000/api/v1`
  - Celular físico (misma wifi) → `http://<IP_DE_TU_PC>:3000/api/v1`
  - Backend desplegado → `https://tu-dominio/api/v1`
- Client IDs de OAuth (paso 5).

Iniciar:

```bash
npx expo install --fix     # alinea versiones de dependencias con el SDK
npx expo start
```

> **Login social:** Google y Facebook no funcionan dentro de Expo Go por restricciones de redirección. Para probarlos, usar un *development build* (`npx expo run:android`) o el APK generado. Login con email/contraseña y 2 pasos funcionan en Expo Go.

## 5. Configurar los proveedores sociales

### Google (obligatorio)
1. [Google Cloud Console](https://console.cloud.google.com) → crear proyecto → *APIs y servicios* → *Pantalla de consentimiento OAuth* (externo).
2. *Credenciales* → crear **ID de cliente OAuth** de tipo **Android**: paquete `com.taskflow.app` y la huella **SHA-1** del keystore (con EAS: `eas credentials`; en debug: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`).
3. Crear también uno de tipo **Web** (necesario para Expo Go / web).
4. Copiar a `.env` → `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` y `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

### Facebook
1. [developers.facebook.com](https://developers.facebook.com) → crear app (tipo *Consumer*) → agregar producto **Facebook Login**.
2. Copiar el *App ID* a `EXPO_PUBLIC_FACEBOOK_APP_ID`. Agregar la plataforma Android con el paquete `com.taskflow.app`.
3. En modo desarrollo solo pueden iniciar sesión los usuarios agregados como testers de la app.

### GitHub
1. GitHub → *Settings* → *Developer settings* → *OAuth Apps* → *New OAuth App*.
2. *Authorization callback URL*: `taskflow://oauth/github`.
3. `Client ID` → `EXPO_PUBLIC_GITHUB_CLIENT_ID` (app) y `GITHUB_CLIENT_ID` (backend). `Client secret` → `GITHUB_CLIENT_SECRET` (**solo backend**).

## 6. Generar el APK (Android)

```bash
cd mobile
npm install -g eas-cli
eas login
eas build:configure                 # primera vez
eas secret:create --name EXPO_PUBLIC_API_URL --value https://tu-backend/api/v1
# (repetir para los demás EXPO_PUBLIC_* o definirlos en eas.json > build.preview.env)
eas build -p android --profile preview
```

Al terminar, EAS entrega un enlace de descarga del `.apk`. Para que el APK funcione en cualquier celular, el backend debe estar accesible por internet (Render, Railway, VPS, etc.) y usar **HTTPS**. Para probar en red local se puede usar la IP de la PC.

Alternativa local (requiere Android SDK + JDK 17): `npx expo prebuild -p android && cd android && ./gradlew assembleRelease` → `android/app/build/outputs/apk/release/`.

## 7. Verificación rápida

1. `GET http://localhost:3000/health` → `{"status":"ok"}`.
2. En la app, ingresar con `admin@taskflow.test` / `Admin123!`.
3. Debe verse la pestaña **Usuarios** (solo admin). Con `user@taskflow.test` solo se ven *Tareas* y *Perfil*.

## Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| "No hay conexión con el servidor" | URL incorrecta en `EXPO_PUBLIC_API_URL`, backend apagado, o firewall. En celular físico usar la IP de la PC, no `localhost` |
| `No se pudo conectar a MySQL` al iniciar | Revisar credenciales en `.env` y que se ejecutó `schema.sql` |
| No llega el código de 2 pasos | Sin SMTP el código se imprime en la consola del backend (`[DEV] Código 2FA...`) |
| Google falla en Expo Go | Usar development build o APK (ver paso 4) |
| `ER_NOT_SUPPORTED_AUTH_MODE` | Usar MySQL 8 con `mysql2` actual; o crear el usuario con `mysql_native_password` |
