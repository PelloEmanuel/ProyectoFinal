# Campus — Plataforma Educativa de Cursos, Habilidades y Seguimiento Académico

**Campus** es una plataforma integral de aprendizaje móvil (**React Native / Expo SDK 58**) respaldada por una **API RESTful en Node.js + Express** y una base de datos relacional **MySQL / MariaDB** normalizada en Tercera Forma Normal (3FN).

Permite conectar instituciones educativas, instructores y estudiantes para administrar cursos estructurados en módulos y lecciones, resolver evaluaciones interactivas, emitir certificados verificables y realizar un seguimiento detallado de la evolución académica.

---

## 1. Características Principales

### Autenticación y Seguridad Avanzada
- **Registro público controlado**: Asigna estrictamente el rol inicial `student` en el servidor (previniendo escalamiento de privilegios).
- **Inicio de sesión con JWT + Refresh Tokens rotativos**: Almacenamiento seguro en el dispositivo móvil mediante `expo-secure-store` y renovación transparente ante respuestas `401`.
- **Autenticación con 3 Redes Sociales (OAuth 2.0 / OIDC)**: Integración con **Google**, **GitHub** y **Facebook / Meta** con validación criptográfica de tokens en el backend.
- **Segundo Factor de Autenticación (2FA TOTP — RFC 6238)**: Compatible con *Google Authenticator*, *Authy* y *Microsoft Authenticator*, con secreto cifrado mediante **AES-256-GCM** y **6 códigos de recuperación de un solo uso**.
- **Verificación de correo electrónico y recuperación de contraseña** mediante códigos temporales hasheados con SHA-256.
- **Gestión de sesiones activas**: Visualización y cierre remoto de sesiones por dispositivo (`GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/:id`).

### Tres Roles con Permisos Diferenciados (RBAC + Ownership)
1. **Estudiante (`student`)**:
   - Inicio personalizado con resumen académico, racha de cursos en progreso, próximas entregas y recomendaciones.
   - Explorador de catálogo con búsqueda en tiempo real y filtros combinables por categoría, nivel y ordenamiento.
   - Inscripción a cursos, visor de lecciones (lectura, video, laboratorio) y cálculo automático de porcentaje de avance.
   - Resolución de **5 tipos de actividades** (opción múltiple, verdadero/falso, respuesta breve, entrega de desarrollo y archivo adjunto) con autocorrección o revisión docente con rúbrica.
   - Emisión automática de **Certificados Oficiales** al completar el 100% de las lecciones obligatorias, con código único y verificador público.
   - Estadísticas personales, calendario académico, cursos favoritos y bandeja de notificaciones.
2. **Instructor (`instructor`)**:
   - Panel docente con métricas de cursos propios, matrícula total, entregas pendientes y promedio de calificaciones.
   - Creación, edición, publicación y archivado de sus propios cursos (con validación de propiedad en el servidor).
   - Gestión de módulos, lecciones, recursos educativos, cuestionarios, actividades prácticas y anuncios del curso.
   - Seguimiento de estudiantes inscritos y panel de corrección con calificación numérica, devolución pedagógica escrita e historial (`grading_history`).
3. **Administrador (`admin`)**:
   - Panel institucional con métricas globales, distribución por rol, cursos con mayor matrícula y bitácora de auditoría (`audit_logs`).
   - Gestión integral de usuarios: búsqueda, filtros por rol y estado, alta administrativa, cambio de rol (`student`, `instructor`, `admin`), suspensión/reactivación y baja.
   - Administración completa del catálogo de cursos, categorías académicas y habilidades/competencias.
   - Reportes SQL verificables en tiempo real (rendimiento por curso, inscripciones, estado de cuentas y auditoría) y configuración global (`platform_settings`).

---

## 2. Arquitectura y Estructura del Proyecto

```text
ProyectoFinal/
├── backend/                     # API RESTful Node.js + Express + MySQL2
│   ├── sql/
│   │   ├── schema.sql           # Esquema relacional MySQL en 3FN (25 tablas)
│   │   └── seed.sql             # Datos iniciales reproducibles para los 3 roles
│   ├── src/
│   │   ├── config/db.js         # Pool MySQL2 con soporte de transacciones ACID
│   │   ├── controllers/         # Controladores (auth, users, courses, assignments, admin)
│   │   ├── middlewares/         # JWT auth, RBAC authorize, express-validator, errores
│   │   ├── routes/              # Rutas bajo /api/v1
│   │   ├── scripts/             # Scripts init-db.js y seed.js
│   │   ├── utils/               # TOTP RFC 6238, tokens, mailer, OAuth social, auditoría
│   │   ├── app.js               # Configuración Express, Helmet, CORS
│   │   └── server.js            # Punto de entrada con auto-inicialización de BD
│   ├── tests/
│   │   └── api.test.js          # Suite automatizada de pruebas de integración
│   └── README.md                # Documentación técnica completa de la API REST
├── mobile/                      # Aplicación móvil React Native (Expo SDK 58)
│   ├── src/
│   │   ├── api/                 # Cliente Axios con failover LAN/Proxy y refresh JWT
│   │   ├── components/          # Sistema de diseño UI reutilizable + CourseCard
│   │   ├── config/              # Detección automática del host de desarrollo
│   │   ├── context/             # AuthContext y ThemeContext (Claro / Oscuro)
│   │   ├── hooks/               # useResponsive y useSocialAuth
│   │   ├── navigation/          # Navegación dinámica por rol (Tabs + Native Stack)
│   │   ├── screens/             # Pantallas de Auth, Student, Instructor, Admin y Perfil
│   │   ├── utils/               # Fechas dd/mm/aaaa, validadores, errores, SecureStore
│   │   └── theme.js             # Tokens visuales de Campus (Claro y Oscuro)
│   ├── App.js                   # Raíz de la aplicación
│   ├── app.json                 # Configuración Expo / Android (com.skilltrack.app)
│   ├── eas.json                 # Perfiles de compilación APK para Android
│   └── metro.config.js          # Proxy reverso integrado en puerto 8081 -> 3000
└── docs/
    ├── GUIA_INSTALACION.md      # Guía paso a paso (Windows, PowerShell, MySQL, APK)
    └── MANUAL_USUARIO.md        # Manual de usuario ilustrado por rol
```

---

## 3. Inicio Rápido (Windows + PowerShell)

1. **Iniciar MySQL en XAMPP**: Abrí el Panel de Control de XAMPP y presioná **Start** en **MySQL** (puerto `3306`).
2. **Inicializar e iniciar el Backend**:
   ```powershell
   cd C:\xampp\htdocs\ProyectoFinal\backend
   npm install
   npm run init-db
   npm start
   ```
3. **Iniciar la App Móvil (Expo)**:
   ```powershell
   cd C:\xampp\htdocs\ProyectoFinal\mobile
   npm install
   npx expo start --lan
   ```
   > **Nota de conectividad inteligente**: El proyecto incluye un proxy reverso integrado en `mobile/metro.config.js`. Si tu teléfono se conecta por datos móviles o desde otra subred Wi-Fi (`npx expo start --tunnel`), todas las peticiones `/api/v1` se enrutan automáticamente a través del mismo túnel de Expo sin necesidad de configurar IPs manuales.

---

## 4. Cuentas de Prueba Preconfiguradas (`seed.sql`)

| Rol | Correo Electrónico | Contraseña | Permisos Destacados |
| :--- | :--- | :--- | :--- |
| **Estudiante** | `estudiante@skilltrack.edu` | `Estudiante123!` | Explorar, inscribirse, cursar lecciones, resolver quizzes/entregas, ver certificados |
| **Instructor** | `instructor@skilltrack.edu` | `Instructor123!` | Crear y publicar cursos, módulos, lecciones, actividades y calificar entregas |
| **Instructor 2** | `ana.docente@skilltrack.edu` | `Instructor123!` | Segunda cuenta docente para verificar aislamiento de propiedad entre instructores |
| **Administrador** | `admin@skilltrack.edu` | `Admin123!` | Gestión global de usuarios, roles, catálogo, reportes SQL, auditoría y ajustes |

---

## 5. Documentación Complementaria

- [Documentación de la API REST (`backend/README.md`)](file:///c:/xampp/htdocs/ProyectoFinal/backend/README.md)
- [Guía de Instalación, Configuración y Generación de APK (`docs/GUIA_INSTALACION.md`)](file:///c:/xampp/htdocs/ProyectoFinal/docs/GUIA_INSTALACION.md)
- [Manual de Usuario Completo (`docs/MANUAL_USUARIO.md`)](file:///c:/xampp/htdocs/ProyectoFinal/docs/MANUAL_USUARIO.md)
