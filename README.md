# TaskFlow

App móvil de gestión de tareas con autenticación avanzada y roles. Proyecto integrador: **React Native (Expo) + Node.js/Express + MySQL**.

## Características

- Registro e inicio de sesión con email/contraseña
- Login social con **Google**, **Facebook** y **GitHub**
- Verificación en **2 pasos** por código enviado al email
- **3 roles** (Usuario, Supervisor, Administrador) con pantallas y permisos distintos
- API REST con CRUD, JWT (access + refresh con rotación), validaciones y middlewares
- Sesión persistente (almacenamiento cifrado), estado global con Context API
- UI responsiva (celulares, tablets, horizontal/vertical) y manejo de errores en formularios y red

## Estructura

```
taskflow/
├── backend/   API REST (Express + MySQL)   → ver backend/README.md (documentación de la API)
├── mobile/    App React Native (Expo)
└── docs/      Guía de instalación, manual de usuario
```

```
mobile/src/
├── api/          cliente axios (+ refresh automático) y servicios
├── components/   UI reutilizable (Screen, Button, Input, Chips, TaskCard...)
├── config/       URL del API y credenciales OAuth
├── context/      AuthContext (login, sesión persistente)
├── hooks/        useSocialAuth, useResponsive
├── navigation/   Auth stack + tabs según rol
├── screens/      auth/, tasks/, admin/, Profile
└── utils/        validadores, errores, almacenamiento seguro
```

## Inicio rápido

```bash
# 1) Base de datos y backend
mysql -u root -p < backend/sql/schema.sql
cd backend && npm install && cp .env.example .env && npm run seed && npm run dev

# 2) App (en otra terminal)
cd mobile && npm install && cp .env.example .env && npx expo install --fix && npx expo start
```

Detalle completo (variables de entorno, OAuth, APK): [`docs/GUIA_INSTALACION.md`](docs/GUIA_INSTALACION.md)

## Documentación

| Documento | Contenido |
|---|---|
| [`backend/README.md`](backend/README.md) | Endpoints, parámetros, respuestas, códigos de error, roles |
| [`docs/GUIA_INSTALACION.md`](docs/GUIA_INSTALACION.md) | Instalación, configuración, OAuth, generación del APK |
| [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) | Uso de la aplicación |

## Entregables

- [x] Código fuente (frontend + backend)
- [x] Manual de usuario
- [x] Guía de instalación y configuración
- [x] Documentación de la API
- [ ] APK → generar con `eas build -p android --profile preview` (ver guía) y enlazar aquí
- [ ] Video de demostración (opcional)

## Credenciales de prueba

`npm run seed` crea: `admin@taskflow.test / Admin123!`, `manager@taskflow.test / Manager123!`, `user@taskflow.test / User1234!`
