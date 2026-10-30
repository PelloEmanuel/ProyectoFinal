# 🏫 Contexto Maestro del Proyecto: Campus Técnica 5

> **Documento de Traspaso y Referencia Técnica Integral para Inteligencias Artificiales y Desarrolladores.**  
> Este documento contiene la arquitectura completa, reglas de negocio, modelos de roles, flujos de seguridad, historial de cambios recientes, estado actual de despliegue y directivas de trabajo para continuar el desarrollo sin fricciones.
> **Última actualización:** 30 de Octubre de 2026.

---

## 1. Visión General del Proyecto

- **Nombre oficial**: **Campus Técnica 5** (nombre técnico en base de código histórica: *SkillTrack*).
- **Institución destinataria**: Escuela de Educación Secundaria Técnica N° 5.
- **Objetivo**: Plataforma integral académica, campus virtual y gestión escolar para nivel secundario técnico, estructurada en **Años Escolares (1° a 6°)** y **Divisiones/Cursos (1° a 3°)**.
- **Entorno de Producción Oficial**: [https://campus-58oe.onrender.com](https://campus-58oe.onrender.com)
- **Repositorio Git**: `https://github.com/PelloEmanuel/ProyectoFinal.git` (rama activa de producción: `main`).

---

## 2. Pila Tecnológica (Tech Stack)

### Backend
- **Runtime**: Node.js v24+ con framework Express.js.
- **Base de Datos**: MySQL compatible (en producción corre sobre **TiDB Serverless Cloud** con TLS v1.2; localmente compatible con MySQL / XAMPP).
- **Seguridad y Criptografía**:
  - Hashing de contraseñas con `bcryptjs` (salt rounds: 10).
  - Tokens JWT de sesión dual (Access Token de 15 min + Refresh Token persistente en tabla `refresh_tokens`).
  - Criptografía simétrica AES-256-GCM para secretos TOTP y hashes SHA-256 para tokens de verificación.
- **Servicio de Correos (Mailing)**:
  - Soporte dual: **Resend API por HTTPS (puerto 443 estándar)** para sortear bloqueos de puertos SMTP en nubes como Render, y **Nodemailer SMTP tradicional** (Gmail/servidor propio en puertos 465 SSL o 587 STARTTLS).
  - Plantillas institucionales responsivas en HTML y texto plano de la E.E.S.T. N° 5.
  - Despacho desacoplado en segundo plano para garantizar respuestas HTTP ultrarrápidas (< 1.5s).
  - Endpoint de diagnóstico en vivo: `GET /api/v1/auth/mail-diagnostic`.
- **Hosting**: Servicio Web en **Render** conectado directamente a GitHub con auto-deploy.
- **Servidor Web Estático**: Express sirve directamente la compilación exportada de Expo Web desde `/backend/public/web` en la ruta `/` con soporte para SPA (Single Page Application).

### Frontend (Mobile & Web)
- **Framework**: React Native con **Expo SDK 58**.
- **Plataformas**:
  - **Web**: React Native Web (`npx expo export -p web`), servido en producción por Render.
  - **Móvil**: Compatible con **Expo Go** (Android / iOS) y compilable como Standalone APK / EAS Build (`com.skilltrack.app`). *Nota: El usuario decidió posponer la generación del APK definitivo para cuando el proyecto esté terminado en web.*
- **Navegación**: `@react-navigation/native-stack` + `@react-navigation/bottom-tabs`. Barra superior unificada (`UnifiedTopNavBar`) con vista adaptativa según viewport móvil o escritorio.
- **Estado Global**: React Context API (`AuthContext`, `ThemeContext`).
- **Persistencia**: `expo-secure-store` en entornos móviles y `localStorage` en Web.
- **Estilos e Iconografía**: `@expo/vector-icons` (Ionicons prioritario). Soporte fluido para **Modo Claro** y **Modo Oscuro** (paleta azul institucional `#1e2430` / `#283141` con alto contraste accesible).

---

## 3. Modelo de Roles y Permisos Institucionales

| Rol | Identificador BD | Propósito y Alcance |
| :--- | :---: | :--- |
| **Administrador** | `role_id: 1` (`admin`) | Control general del campus. Gestión de altas/bajas de usuarios, configuración de claves institucionales de registro para docentes y preceptores, creación de materias base en BD, apertura/cierre de cursos (ej: 6° 1ra), asignación de profesores a materias y diseño del cronograma de horarios por curso. |
| **Docente** | `role_id: 2` (`instructor`) | Gestión académica de materias asignadas. Vista de cronograma semanal propio (Lunes a Viernes), filtro de materias por Curso/División, publicación de lecciones/teoría en Tablón, creación de actividades y evaluaciones con recepción de entregas, calificación con devolución y comentarios privados por alumno. |
| **Preceptor** | `role_id: 4` (`preceptor`) | Seguimiento y asistencia escolar. **Único rol autorizado a asentar y modificar el Presente / Ausente de los alumnos**. Consulta de listas alfabéticas y planillas mensuales de asistencia (Lunes a Viernes). |
| **Alumno** | `role_id: 3` (`student`) | Visualización de materias correspondientes a su Año y Curso, cronograma semanal de clases, entrega de tareas, consulta de calificaciones y comentarios docentes. |

> [!IMPORTANT]
> **Regla de Primer Usuario**: El primer usuario que se registre en una base de datos vacía se convierte automáticamente en Administrador General del sistema (`role_id: 1`). Los siguientes usuarios se registran como Alumnos, o como Docentes/Preceptores si proporcionan la clave institucional vigente.

---

## 4. Reglas de Negocio Clave

1. **Días de Clase**: El cronograma de materias y el control de asistencia operan **estrictamente de Lunes a Viernes**. Sábado y domingo están completamente excluidos de la plataforma.
2. **Asistencia Escolar**: Ningún alumno ni docente puede marcar presente. La asistencia es potestad **exclusiva del preceptor**.
3. **Tablón de Docentes**: Los avisos y comunicados publicados por los profesores en el tablón son únicamente texto/mensaje (no llevan título).
4. **Estructura Interna de Materias**: Se eliminó la sección de "Material teórico" como módulo separado; dentro de cada curso solo figuran dos secciones: **Tablón** y **Personas**.
5. **Aulas Físicas**: Se eliminó todo concepto de "aula física asignada" para las materias.
6. **Historial de Sesiones**: Se eliminó en todos los perfiles el historial visible de sesiones activas y dispositivos conectados.

---

## 5. Arquitectura de Autenticación y Verificación de Seguridad

### Verificación en 2 Pasos y Recuperación de Contraseña 100% Real
1. **Sin autocompletado y sin códigos en pantalla**:
   - Se eliminaron por completo las propiedades `devVerificationCode` y `devResetCode` del backend y del frontend.
   - Los campos de ingreso de código siempre inician en blanco con `maxLength={6}`.
   - El código de 6 dígitos **nunca** aparece en la pantalla bajo ninguna circunstancia.
   - El usuario debe obligatoriamente abrir su bandeja de entrada de correo electrónico y tipear el código de forma manual.
2. **Despacho desacoplado en segundo plano**:
   - `auth.controller.js` registra el token criptográfico en la BD y despacha el correo en segundo plano (`catch` silencioso con log).
   - La respuesta HTTP al usuario es instantánea (< 1.5s), eliminando de raíz cualquier error de timeout (`ECONNABORTED`).
3. **Compatibilidad con Render (Resend API HTTPS vs SMTP)**:
   - Render Free Tier bloquea las conexiones salientes por los puertos SMTP 25, 465 y 587.
   - Por esta razón, el backend cuenta con soporte nativo para **Resend** vía HTTPS (puerto 443 estándar). Con solo configurar `RESEND_API_KEY` en Render, los correos se envían de forma instantánea a cualquier destinatario.
   - También mantiene soporte para SMTP estándar en caso de migrar a un plan con puertos abiertos.

---

## 6. Historial de Mejoras Recientes Implementadas

### A. General: Calendario de Horarios Centrado y Deslizable
- **Archivo modificado**: `mobile/src/components/SchoolScheduleGrid.js`.
- **Comportamiento**:
  - En pantallas más anchas que el calendario (computadoras y tablets grandes), la tarjeta adopta `maxWidth: 780`, `alignSelf: 'center'` y `marginHorizontal: 'auto'`, manteniéndose perfectamente centrada en la pantalla.
  - En pantallas más chicas (móviles y ventanas angostas), el contenedor se expande al 100% y el ScrollView horizontal adopta `justifyContent: 'flex-start'`, permitiendo deslizarse suavemente de Lunes a Viernes sin recortar el margen izquierdo.

### B. General: Grillas de 3 Cuadros por Fila Fijos (Sin ensanchamiento)
- **Problema previo**: Al usar `flexGrow: 1`, cuando una fila quedaba incompleta (por ejemplo, 4 cuadros en 2 filas, o 2 cuadros en total), los cuadros restantes se ensanchaban ocupando el 100% o 50% de la fila.
- **Solución implementada**: Se fijó `maxWidth: isDesktop ? 'calc((100% - 28px) / 3)' : '100%'` y `flexGrow: isDesktop ? 0 : 1` con `flexShrink: 0`. Los cuadros incompletos mantienen exactamente el mismo tamaño que los cuadros de las filas completas.
- **Pantallas ajustadas**:
  1. `mobile/src/screens/admin/AdminCoursesScreen.js` (Materias base, Materias del curso y Cursos escolares).
  2. `mobile/src/screens/admin/UsersScreen.js` (Listado de usuarios).
  3. `mobile/src/screens/instructor/InstructorCoursesScreen.js` (Materias del docente).
  4. `mobile/src/screens/instructor/InstructorDashboardScreen.js` (Materias recientes del docente).
  5. `mobile/src/screens/instructor/InstructorStudentsScreen.js` (Alumnos del docente).
  6. `mobile/src/screens/student/MyLearningScreen.js` (Materias del alumno).

### C. Administrador: Métricas del Panel Principal
- **Archivos modificados**: `mobile/src/screens/admin/DashboardScreen.js` y `backend/src/controllers/admin.controller.js`.
- **Cambios**:
  - Se eliminaron las tarjetas de **Inscripciones** y **Certificados**.
  - La tarjeta de **Cursos** ahora cuenta directamente los cursos escolares creados en la tabla `school_groups` (actualmente 2) y muestra los cursos abiertos, con enlace directo a la gestión de cursos.

---

## 7. Estructura del Repositorio

```text
ProyectoFinal/
├── backend/
│   ├── public/
│   │   └── web/                   # Build exportado de Expo Web servido en producción
│   │       ├── assets/            # Fuentes TTF vectoriales, logos e imágenes
│   │       ├── _expo/static/js/web# Bundle JavaScript compilado (index-*.js)
│   │       └── index.html         # HTML SPA con resets de viewport y overflow
│   ├── sql/
│   │   ├── schema.sql             # Esquema DDL relacional completo de MySQL
│   │   └── seed.sql               # Datos iniciales (roles, áreas académicas, materias)
│   ├── src/
│   │   ├── config/db.js           # Pool de conexiones MySQL (TIDB Cloud / Local)
│   │   ├── controllers/
│   │   │   ├── admin.controller.js       # CRUD de usuarios, cursos, materias y horarios
│   │   │   ├── attendance.controller.js  # Toma oficial de asistencia por preceptor
│   │   │   ├── auth.controller.js        # Registro, login, 2FA correo, OAuth proxy
│   │   │   ├── courses.controller.js     # Materias, tablón, lecciones, entregas
│   │   │   ├── instructor.controller.js  # Métricas docentes, cursos asignados
│   │   │   └── users.controller.js       # Perfil, preferencias, grupo escolar alumno
│   │   ├── middlewares/                  # Auth JWT, validación express-validator, roles
│   │   ├── routes/                       # Rutas de la API REST v1
│   │   └── utils/                        # Mailer (Resend HTTPS + SMTP), tokens, serializers
│   └── package.json
├── mobile/
│   ├── assets/                    # Logo oficial y recursos estáticos
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.js          # Cliente Axios (timeout 25s) con rotación automática
│   │   │   └── services.js        # SDK tipado de llamadas HTTP al backend
│   │   ├── components/
│   │   │   ├── ui.js              # Componentes visuales base (Button, Card, Input, etc.)
│   │   │   └── SchoolScheduleGrid.js # Cuadrícula interactiva de horarios (Lunes a Viernes)
│   │   ├── context/
│   │   │   ├── AuthContext.js     # Estado de sesión, login, registro y tokens
│   │   │   └── ThemeContext.js    # Modo Claro / Oscuro con persistencia
│   │   ├── hooks/
│   │   │   └── useSocialAuth.js   # Manejo de OAuth con detección de Expo Go / Standalone
│   │   ├── navigation/
│   │   │   └── index.js           # Barra superior unificada y stack por rol
│   │   └── screens/
│   │       ├── admin/             # DashboardScreen, AdminCoursesScreen, UsersScreen
│   │       ├── auth/              # LoginScreen, RegisterScreen, VerifyCodeScreen, WelcomeScreen
│   │       ├── instructor/        # Dashboard, Materias, Estudiantes, Entregas del Docente
│   │       ├── preceptor/         # PreceptorDashboardScreen
│   │       ├── shared/            # AttendanceScreen, CourseGroupScreen
│   │       └── student/           # StudentHomeScreen, MyLearningScreen
│   ├── app.json                   # Configuración de Expo (slug: campus-tecnica-5)
│   └── package.json
├── PROJECT_CONTEXT_HANDOVER.md    # Este documento maestro
└── README.md
```

---

## 8. Protocolo Estricto de Despliegue y Trabajo

> [!CAUTION]
> **PROHIBICIÓN ESTRICTA DE PRUEBAS EN LAN**:
> Está terminantemente prohibido realizar pruebas en red local (LAN) o iniciar servidores con `expo start --lan`. La aplicación ya se encuentra alojada en producción en Render y cualquier cambio debe validarse directamente sobre Render y GitHub.

### Ciclo de Entrega de Cambios (Workflow Obligatorio)

1. **Modificación de código**: Aplicar cambios en `backend/` o `mobile/`.
2. **Compilación Web (si hubo cambios en frontend)**:
   ```powershell
   cd mobile
   npx expo export -p web
   ```
3. **Sincronización de bundle estático**:
   Copiar el contenido generado en `mobile/dist/*` hacia `backend/public/web/` y eliminar el bundle `.js` anterior para no acumular archivos obsoletos:
   ```powershell
   Remove-Item -Path "backend\public\web\_expo\static\js\web\*.js" -Force
   Copy-Item -Path "mobile\dist\*" -Destination "backend\public\web" -Recurse -Force
   ```
4. **Commit y Push a GitHub**:
   ```powershell
   git add -A
   git commit -m "tipo(alcance): descripción clara del cambio"
   git push origin main
   ```
5. **Despliegue Automático**:
   Render detecta el commit en `main` y compila/despliega automáticamente el servicio.
6. **Verificación en Producción**:
   Comprobar la versión del bundle activo mediante:
   ```powershell
   curl.exe -s https://campus-58oe.onrender.com/ | Select-String "index-"
   ```
