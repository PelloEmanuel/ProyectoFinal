# 🏫 Contexto Maestro del Proyecto: Campus Técnica 5

> **Documento de Traspaso y Referencia Técnica Integral para Inteligencias Artificiales y Desarrolladores.**  
> Este documento contiene la arquitectura completa, reglas de negocio, modelos de roles, flujos de seguridad, historial de cambios recientes, estado actual de despliegue y directivas de trabajo para continuar el desarrollo sin fricciones.
> **Última actualización:** 1 de Noviembre de 2026.

---

## 1. Visión General del Proyecto

- **Nombre oficial**: **Campus Técnica 5** (nombre técnico en base de código histórica: *SkillTrack*).
- **Institución destinataria**: Escuela de Educación Secundaria Técnica N° 5.
- **Objetivo**: Plataforma integral académica, campus virtual y gestión escolar para nivel secundario técnico, estructurada en **Años Escolares (1° a 6°)** y **Divisiones/Cursos (1° a 3°)**.
- **Entorno de Producción Oficial**: [https://campus-58oe.onrender.com](https://campus-58oe.onrender.com)
- **Repositorio Git**: `https://github.com/PelloEmanuel/ProyectoFinal.git` (rama activa de producción: `main`).
- **Bundle Web Activo en Producción**: `index-f6ce654db777bc4da1462c3290c440a3.js`.
- **APK Compilado Standalone**: `Campus.apk` (76.2 MB, EAS Build ID `ff8e2c11-1715-4559-8868-a38da07e04e9`, Package: `com.campustecnica5.app`, con icono oficial de la Técnica 5).
- **Enlace de instalación directa APK**: [https://expo.dev/accounts/pelloemanuel/projects/campus-tecnica-5/builds/ff8e2c11-1715-4559-8868-a38da07e04e9](https://expo.dev/accounts/pelloemanuel/projects/campus-tecnica-5/builds/ff8e2c11-1715-4559-8868-a38da07e04e9)
- **Descarga directa del archivo APK**: [https://expo.dev/artifacts/eas/nVEaKXH0kP421utP3TkakttY9K234WZBVrzpVIfuOSo.apk](https://expo.dev/artifacts/eas/nVEaKXH0kP421utP3TkakttY9K234WZBVrzpVIfuOSo.apk)
- **Archivo descargado localmente**: `c:\xampp\htdocs\ProyectoFinal\Campus.apk` (76.2 MB)

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
   - El usuario debe obligatoriamente abrir su casilla de correo y tipear el código de forma manual.
2. **Despacho desacoplado en segundo plano**:
   - `auth.controller.js` registra el token criptográfico en la BD y despacha el correo en segundo plano (`catch` silencioso con log).
   - La respuesta HTTP al usuario es instantánea (< 1.5s), eliminando de raíz cualquier error de timeout (`ECONNABORTED`).
3. **Borrado Total Definitivo de Cuentas y Eliminación de "Username" (`cca345a`)**:
   - **Borrado Total**: Al eliminar una cuenta (sea el propio usuario desde su perfil o el administrador), se realiza un **HARD DELETE** (`DELETE FROM users WHERE id = ?`), eliminando en cascada todos sus registros dependientes y desvinculando materias (`courses.instructor_id = NULL`). No quedan filas residuales ni registros fantasmas.
   - **Eliminación del campo "Nombre de usuario"**: Se eliminó conceptualmente y de los formularios (`RegisterScreen.js`, `ProfileScreen.js` y `UsersScreen.js`). La identidad visible del usuario es su **Nombre y Apellido**.
   - **Repetición libre de Nombre y Apellido**: Se eliminó el índice único `username` de la base de datos (`ALTER TABLE users DROP INDEX username`). Cualquier cantidad de usuarios pueden tener exactamente el mismo nombre y apellido (ej: dos "Juan Pérez"); el único identificador irrepetible es el correo electrónico (`email`).
4. **Transición Inmediata al Campus tras Verificación 2FA (`0c94acc`)**:
   - **Causa del bloqueo previo**: La pantalla de verificación (`VerifyCodeScreen.js`) invocaba `startSession(res)` tras validar el código en el backend, pero `startSession` no estaba expuesta en las acciones de `AuthContext.js`. Esto arrojaba un `TypeError` en el cliente justo después de que la base de datos ya había validado la cuenta, provocando simultáneamente el mensaje de éxito y un falso mensaje de error de conexión.
   - **Solución implementada**: Se expuso `startSession` en `actions` de `AuthContext.js` y se integró la llamada a través de `verifyEmail`, permitiendo que el estado de sesión se actualice de inmediato y la navegación redirija fluidamente al dashboard del rol correspondiente.
5. **Resolución de Entrega de Correos en Render (Resend API HTTPS + Brevo)**:
   - Render bloquea las conexiones salientes por los puertos SMTP (587 STARTTLS y 465 SSL sufren timeout de red).
   - `mailer.js` detecta automáticamente direcciones no verificadas y enruta el remitente de forma segura como `Campus Técnica 5 <onboarding@resend.dev>`.
   - Entrega verificada en vivo con éxito a `pelloemanuel@gmail.com` (IDs de entrega: `01a1922e-fe45-7350-9846-a0130cf8b7d4` y `01a1922f-166c-74f3-a6f9-7f4b4201e3f5`).
   - Soporte multinivel encadenado: Resend API HTTPS -> Brevo API HTTPS (`BREVO_API_KEY`) -> Nodemailer SMTP.
   - Endpoint de diagnóstico en tiempo real: `GET /api/v1/auth/mail-diagnostic?to=correo@ejemplo.com`.

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

### D. Asistencia Restringida a Cursos Asignados y Renombrado a "Docente" (`1658971`)
- **Archivos modificados**:
  - Backend: `backend/src/controllers/attendance.controller.js`, `backend/src/controllers/assignments.controller.js`, `backend/src/utils/school.js`.
  - Frontend: `mobile/src/screens/shared/AttendanceScreen.js`, `mobile/src/theme.js`, `mobile/src/screens/admin/UsersScreen.js`, `mobile/src/screens/admin/DashboardScreen.js`, `mobile/src/screens/admin/AdminReportsScreen.js`, `mobile/src/screens/admin/AdminCoursesScreen.js`, `mobile/src/screens/auth/WelcomeScreen.js`, `mobile/src/screens/student/AssignmentDetailScreen.js`, `mobile/src/screens/student/AssignmentsScreen.js`, `mobile/src/screens/student/StudentHomeScreen.js`, `mobile/src/screens/shared/CourseGroupScreen.js`, `mobile/src/components/CourseCard.js`, `mobile/src/components/SchoolScheduleGrid.js`, `mobile/src/components/TablonFeed.js`.
- **Comportamiento**:
  1. **Filtro Estricto de Asistencias**: Al ingresar a la Planilla Oficial de Asistencia, si el usuario es docente (`role === 'instructor'`), `listOpenCourses` solo lista aquellos cursos escolares (`school_groups`) en los que el docente tenga al menos una materia asignada (`c.instructor_id = req.user.id`).
  2. **Seguridad Backend (403 Forbidden)**: `getAttendanceSheet` y `getCourseStudents` validan que el docente tenga asignada una materia en ese Año y División (`(sy, cd)`). De lo contrario, arroja error 403 `COURSE_NOT_ASSIGNED`.
  3. **Estados vacíos amigables**: Si el docente no tiene materias escolares asignadas, la interfaz muestra `Sin cursos a tu cargo` en lugar de una tabla vacía o un indicador infinito.
  4. **Renombrado Integral a "Docente"**: Se reemplazó cualquier referencia visible de "Instructor", "Instructores" o "Profesor" por "Docente" / "Docentes" en badges de usuario, filtros de listado, modales de creación y edición, notificaciones de entrega de tareas, rúbricas, advertencias de superposición horaria y selector de personal a cargo.

### E. Eliminación Integral de "SkillTrack" y Renombrado a "Campus" (`16e7f34`)
- **Archivos modificados**:
  - Frontend: `mobile/src/utils/errors.js`, `mobile/src/screens/auth/LoginScreen.js`, `mobile/src/screens/auth/RegisterScreen.js`, `mobile/src/screens/auth/WelcomeScreen.js`, `mobile/src/screens/auth/VerifyCodeScreen.js`, `mobile/src/screens/ProfileScreen.js`, `mobile/src/screens/admin/AdminSettingsScreen.js`, `mobile/src/screens/admin/UsersScreen.js`, `mobile/src/components/CourseCard.js`, `mobile/src/components/TablonFeed.js`, `mobile/src/components/ui.js` (`CampusLogo`), `mobile/src/hooks/useSocialAuth.js`, `mobile/src/navigation/index.js`, `mobile/app.json`, `mobile/package.json`.
  - Backend: `backend/src/app.js`, `backend/src/server.js`, `backend/src/controllers/auth.controller.js`, `backend/src/controllers/admin.controller.js`, `backend/src/utils/mailer.js`, `backend/src/utils/social.js`, `backend/src/utils/totp.js`, `backend/src/utils/serializers.js`, `backend/src/config/db.js`, `backend/package.json`, `package.json`, `backend/sql/seed.sql`.
  - Base de Datos en la nube (TiDB Cloud): Actualizados registros de `platform_settings` (`platform_name` = `'Campus'`, `institution_name` = `'Campus Técnica 5'`, `certificate_issuer_title` = `'Dirección Académica del Campus'`, `support_email` = `'soporte@campus.edu'`) y tabla `roles` (`description` = `'Administrador general del Campus'`).
- **Comportamiento**:
  - Errores de conexión indican claramente: *"No se pudo conectar con el servidor del Campus. Verificá tu conexión a internet."*
  - Toda la interfaz de usuario, títulos, botones de acción, correos salientes y respuestas de salud de la API (`/health` y `/api/v1/health`) se identifican exclusivamente como **Campus** / **Campus Técnica 5**.

### F. Panel de Docente: Conteo Real de Estudiantes a Cargo (`b9cb585`)
- **Archivos modificados**: `backend/src/controllers/assignments.controller.js`.
- **Problema previo**: En el panel principal del docente, la tarjeta de métricas "Estudiantes" sumaba las inscripciones de cada materia individualmente mediante `courses.reduce(...)`, inflando el valor con duplicados si los mismos alumnos tenían varias materias con el mismo docente (ej: mostraba 7 cuando el docente solo tenía 3 alumnos).
- **Solución implementada**: Se reemplazó el conteo por una consulta SQL unificada con `COUNT(DISTINCT stu_id)` que cuenta exclusivamente a los alumnos únicos matriculados en las materias o en los cursos escolares a cargo del docente (`c.instructor_id = req.user.id`). Si el docente no tiene materias asignadas, muestra con precisión `0`.

### G. Eliminación de Avisos de Contraseña Débil/Vulnerable y Supresión Total de Alerts (`b35fd25`)
- **Archivos modificados**:
  - Frontend: `mobile/src/utils/validators.js`, `mobile/src/screens/auth/RegisterScreen.js`, `mobile/src/screens/auth/VerifyCodeScreen.js`, `mobile/src/screens/ProfileScreen.js`, `mobile/src/components/ui.js` (`Input`), `mobile/src/components/FileUploader.js`, `mobile/src/components/TablonFeed.js`, `mobile/App.js`.
  - Backend: `backend/src/routes/auth.routes.js`, `backend/src/routes/users.routes.js`, `backend/src/routes/admin.routes.js`, `backend/src/controllers/auth.controller.js`.
- **Comportamiento**:
  1. **Eliminación de advertencias y restricciones de contraseña débil/vulnerable**:
     - Se eliminó la obligatoriedad de tener 8 caracteres, números o letras. Tanto en el cliente (`validateRegister`) como en el servidor (`auth.routes.js`, `users.routes.js`, `admin.routes.js`), ahora solo se exige que el campo de contraseña no esté vacío (`.notEmpty()`).
     - Se limpiaron los textos de ayuda y placeholders (`placeholder="Ingresá tu contraseña"`) en registro, recuperación de clave y edición de perfil.
     - En el componente `Input` (`ui.js`), se configuró `autoComplete="new-password"` para campos con `secureTextEntry`, evitando que los gestores de contraseñas de los navegadores (Chrome/Edge) alerten sobre contraseñas poco seguras o vulnerables.
  2. **Prohibición y reemplazo total de Alerts nativos**:
     - Se eliminaron todas las llamadas a `Alert.alert` del proyecto (`FileUploader.js` y `TablonFeed.js`), sustituyéndolas por mensajes de error y banners inline visuales en pantalla (`setErrorMsg`, `setErrorBanner`).
     - En el punto de entrada de la aplicación (`mobile/App.js`), se instaló un escudo global que sobreescribe `window.alert` y `Alert.alert` en la web, garantizando que jamás aparezca ningún cuadro de diálogo nativo invasivo en el navegador.

### H. Título de la Pestaña del Navegador en Pantalla de Bienvenida (`f8aef88`)
- **Archivos modificados**: `mobile/src/navigation/index.js`, `mobile/src/screens/auth/WelcomeScreen.js`.
- **Problema previo**: La pestaña del navegador mostraba el nombre interno de la ruta ("Welcome") al estar en la pantalla inicial de bienvenida.
- **Solución implementada**: Se configuró `title: 'Bienvenidos'` en las opciones de `Stack.Screen` de la pantalla de bienvenida y se enlazó un `useFocusEffect` que actualiza `document.title = 'Bienvenidos'`, de modo que la pestaña en Chrome/navegador web indique claramente **"Bienvenidos"**.

### I. Eliminación del Filtro 'Pendientes 2FA' en Lista de Estudiantes (`9278682`)
- **Archivos modificados**: `mobile/src/screens/admin/UsersScreen.js`.
- **Comportamiento**: Se eliminó la pestaña/chip de filtro `{ key: 'pending_verification', label: 'Pendientes 2FA' }` de la barra de filtros por estado en el listado de estudiantes y usuarios, manteniendo únicamente las opciones relevantes (`Cualquier estado`, `Activos` y `Suspendidos`).

### J. Prevención de Alertas de Brecha de Seguridad de Google Password Manager (`5c049a5`)
- **Archivos modificados**: `mobile/src/components/ui.js` (`Input`).
- **Problema**: Al iniciar sesión con contraseñas de prueba conocidas (como `preceptor123`), Google Chrome y su gestor de contraseñas comparan las claves enviadas en inputs de tipo `password` contra bases de datos de brechas públicas de seguridad y disparan una ventana emergente nativa: *"La contraseña que acabas de usar se ha encontrado una brecha de seguridad en los datos. El gestor de contraseñas de Google te recomienda que cambies tu contraseña ahora"*.
- **Solución implementada**: En navegadores Web (Chromium/WebKit), el componente `Input` ahora utiliza la propiedad CSS `-webkit-text-security: disc` sobre un campo de tipo texto en lugar de exponer `<input type="password">`. Los caracteres continúan enmascarándose visualmente con discos/puntos (`●●●●●●●●`) y el botón de ver/ocultar contraseña sigue funcionando con normalidad, pero el motor de Chromium ignora el campo para la inspección de filtraciones, impidiendo que Google dispare el aviso de brecha de seguridad.

### K. Selector Dinámico de Años y Cursos Escolares para Alumnos (`75a54c1`)
- **Archivos modificados**:
  - Frontend: `mobile/src/screens/student/StudentHomeScreen.js`, `mobile/src/screens/auth/RegisterScreen.js`, `mobile/src/api/services.js`.
  - Backend: `backend/src/controllers/courses.controller.js`, `backend/src/controllers/users.controller.js`, `backend/src/routes/courses.routes.js`, `backend/src/utils/school.js`.
- **Comportamiento**:
  - Se eliminaron los listados estáticos hardcodeados `[1..6]` y `[1..3]`.
  - El backend expone los cursos escolares abiertos (`school_groups` con `status = 'open'`) mediante el endpoint `GET /courses/available-school-groups` y dentro de `usersApi.studentDashboard()`.
  - En la pantalla de alumnos y al cambiar de curso, se calculan únicamente los **Años Escolares** que realmente existen en el sistema (por ejemplo, si solo existen 1° 1°, 6° 1° y 7° 1°, únicamente se muestran los botones `1° Año`, `6° Año` y `7° Año`).
  - Al seleccionar un año específico, la interfaz filtra y presenta de manera reactiva **únicamente las divisiones que existen para ese año** (por ejemplo, `1° Curso`).
  - Se actualizó la validación del backend (`validateYearAndDivision`) para admitir formalmente 7° año de educación secundaria técnica.

### L. Persistencia del Estado de Navegación ante Recarga de Página Web (F5)
- **Archivos modificados**:
  - `mobile/src/navigation/index.js`
  - `mobile/src/context/AuthContext.js`
- **Problema**: Al recargar la página o presionar F5 en el navegador web, React Navigation reiniciaba el estado en memoria y enviaba al usuario a la pantalla predeterminada del inicio (panel principal), perdiendo la ubicación actual (por ejemplo, si un estudiante estaba dentro de la materia Matemática `CourseDetail` o en una lección).
- **Solución implementada**:
  1. **Serialización Continua de Rutas**: Se implementó `saveNavigationState(user, state)` conectado al evento `onStateChange` del `NavigationContainer`. Cada vez que el usuario navega a una materia, lección, entrega, perfil o cambia de pestaña, el árbol completo de rutas y sus parámetros (como `courseId`) se guarda de forma sincronizada en `sessionStorage` y `localStorage` bajo la clave scoped `CAMPUS_NAV_STATE_${user.id}_${user.role}`.
  2. **Restauración Instantánea al Iniciar**: Mediante `initialState={initialNavState}` en `NavigationContainer`, al recargar la página y resolverse la sesión del usuario, React Navigation restaura exactamente la pila de pantallas y parámetros donde se encontraba el usuario. Si estaba dentro de Matemática, vuelve a cargar directamente Matemática preservando la posibilidad de volver atrás con la flecha al panel.
  3. **Aislamiento y Sanitización**: Se valida que las rutas pertenezcan a pantallas válidas de la sesión y coincidan con el rol del usuario autenticado. Al cerrar sesión (`signOutLocal`), se purgan automáticamente todas las claves `CAMPUS_NAV_STATE*` para evitar transferencias de estado entre cuentas distintas.

### M. Título Superior de la Bandeja de Notificaciones para Alumnos
- **Archivos modificados**:
  - `mobile/src/navigation/index.js`
  - `mobile/src/screens/student/StudentExtrasScreen.js`
- **Problema**: Al presionar el botón de notificaciones (ícono de campana) en el panel del alumno, la barra superior del navegador mostraba el título genérico histórico *"Certificados, Estadísticas y Agenda"*.
- **Solución implementada**:
  - Se configuró la opción de título en `Stack.Screen` para evaluar dinámicamente `route.params.section`, mostrando **"Notificaciones"** de forma inmediata.
  - Se sincronizó el cambio dinámico de título en `StudentExtrasScreen` mediante `navigation.setOptions`, de modo que al alternar entre la sección de Calendario o Notificaciones, el título superior y el `document.title` del navegador reflejen con precisión "Notificaciones" o "Calendario".

### N. Selector Dinámico Estricto de Cursos en Registro de Alumnos
- **Archivos modificados**:
  - `mobile/src/screens/auth/RegisterScreen.js`
  - `backend/src/controllers/auth.controller.js`
- **Problema**: En la pantalla de registro, si la lista de grupos abiertos tardaba en responder o se renderizaba antes de la respuesta, se mostraban valores estáticos residuales (como 2° o 3° división para 1° año) que no existen en la institución.
- **Solución implementada**:
  - Se homogeneizó la interfaz y la lógica de cálculo con la del modal de cambio de curso de `StudentHomeScreen.js`.
  - Se eliminaron todos los fallbacks estáticos en `RegisterScreen.js`. `availableYears` y `availableDivisionsForYear` calculan de forma estricta los años y divisiones que realmente existen en `school_groups` con `status = 'open'`.
  - El backend ahora devuelve directamente los `availableSchoolGroups` en el endpoint `GET /api/v1/auth/registration-status` (además de `coursesApi.getAvailableSchoolGroups()`), cargando de forma instantánea los cursos abiertos desde el primer render del formulario.
  - La interfaz muestra los títulos y botones idénticos: *"Elegí tu Año y Curso Escolar"*, botones `{yr}° Año` y divisiones reactivas `{div}° Curso`. Si se selecciona 1° Año, únicamente se muestra 1° Curso; si se selecciona 7° Año, únicamente se muestran 1° y 2° Curso.

### O. Corrección y Unificación Integral de Zona Horaria (Buenos Aires UTC-3)
- **Archivos modificados**:
  - Backend: `backend/src/config/db.js`, `backend/src/server.js`, `backend/src/app.js`, `backend/src/controllers/courses.controller.js`, `backend/src/controllers/comments.controller.js`.
  - Frontend: `mobile/src/utils/dates.js`.
  - Base de datos: Ajuste de registros en `announcements`, `lessons` y `assignments`.
- **Problema**:
  - En la app / APK y en la web, las publicaciones, avisos del tablón y lecciones se mostraban 3 horas más tarde de la hora real de publicación (por ejemplo, publicado a las 15:36 hs figuraba como 18:36 hs).
  - Causa raíz dual: (1) El servidor de base de datos TiDB Cloud Serverless y el contenedor de Render operan por defecto en UTC (+00:00), insertando `CURRENT_TIMESTAMP` en UTC sin convertirlo. Al leer con `dateStrings: true`, se devolvía una cadena `YYYY-MM-DD HH:mm:ss` sin sufijo `Z`. (2) El motor JS de Android (Hermes) interpretaba dicha cadena en la zona horaria local sin restar el desfase UTC, produciendo un adelanto de 3 horas.
- **Solución implementada**:
  1. **Base de Datos y Backend**:
     - Se añadió el hook `pool.on('connection', conn => conn.query("SET time_zone = '-03:00'"))` en `backend/src/config/db.js`, forzando que todas las funciones SQL de fecha (`NOW()`, `CURRENT_TIMESTAMP`) evalúen estrictamente en la zona horaria oficial de Buenos Aires (UTC-3).
     - Se configuró `process.env.TZ = 'America/Argentina/Buenos_Aires'` en `server.js`, `app.js` y `db.js`.
     - En `courses.controller.js` y `comments.controller.js`, al crear anuncios, lecciones y comentarios, el backend consulta directamente la columna creada en la BD en lugar de devolver `new Date().toISOString()` en UTC.
     - Se corrigieron los registros existentes en la base de datos para sincronizarlos con la hora real de Argentina.
  2. **Frontend Móvil y Web (`mobile/src/utils/dates.js`)**:
     - Se rediseñaron `formatDateTime`, `formatDate` y `getBuenosAiresNow` con aritmética determinística basada en el desfase constante de Argentina (`UTC-3 = -180 minutos`).
     - No depende de la presencia de ICU en Hermes de Android ni de la zona horaria que tenga configurada el teléfono del usuario. Maneja de manera transparente strings directos de MySQL, cadenas ISO con `Z` o con offset, y objetos `Date`.

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
