# Documentación Técnica de la API REST — SkillTrack (`/api/v1`)

La API de **SkillTrack** está construida con **Node.js**, **Express**, **MySQL2 (`mysql2/promise`)**, **JSON Web Tokens (`jsonwebtoken`)**, **bcryptjs**, **express-validator**, **Helmet** y **express-rate-limit**.

- **URL Base Local**: `http://localhost:3000/api/v1`
- **Formato de Intercambio**: `application/json`
- **Autenticación**: Header `Authorization: Bearer <accessToken>`

---

## 1. Convención de Respuestas y Códigos HTTP

### Respuesta Exitosa
```json
{
  "success": true,
  "message": "Operación exitosa",
  "data": { ... }
}
```

### Respuesta de Error
```json
{
  "success": false,
  "message": "Descripción clara del error en español",
  "code": "ERROR_CODE",
  "errors": [
    { "field": "email", "message": "Ingresá un correo electrónico válido" }
  ]
}
```

| Código HTTP | Significado en SkillTrack |
| :--- | :--- |
| `200 OK` | Consulta, actualización o calificación completada con éxito |
| `201 Created` | Recurso creado (registro, curso, módulo, lección, inscripción, intento) |
| `202 Accepted` | Credenciales válidas, pero requiere verificación de segundo factor (`twoFactorRequired: true`) |
| `204 No Content` | Eliminación o cierre de sesión exitoso |
| `400 Bad Request` | Regla de negocio incumplida (ej. curso incompleto al publicar, límite de intentos alcanzado) |
| `401 Unauthorized` | Token JWT ausente, vencido o credenciales incorrectas |
| `403 Forbidden` | El rol del usuario o la propiedad del recurso no autoriza la operación |
| `404 Not Found` | Recurso inexistente |
| `409 Conflict` | Duplicidad de datos (ej. email ya registrado, estudiante ya inscripto) |
| `422 Unprocessable Entity` | Error de validación de campos de entrada (`express-validator`) |
| `429 Too Many Requests` | Límite de intentos excedido en rutas sensibles de autenticación |
| `500 Internal Server Error` | Error interno controlado sin exponer trazas sensibles |

---

## 2. Endpoints de Autenticación y Seguridad (`/api/v1/auth`)

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Público | Registra un nuevo usuario (asigna obligatoriamente el rol `student`). Campos: `firstName`, `lastName`, `username` (opc.), `email`, `password`, `acceptTerms`. |
| `POST` | `/auth/login` | Público | Inicia sesión con `email` y `password`. Devuelve `200` con tokens o `202` si tiene 2FA activo. |
| `POST` | `/auth/refresh` | Público | Rota el `refreshToken` y emite un nuevo par `{ accessToken, refreshToken }`. |
| `POST` | `/auth/logout` | Autenticado / Público | Revoca el `refreshToken` en la tabla `refresh_tokens`. |
| `GET` | `/auth/me` | Autenticado | Devuelve el perfil completo del usuario autenticado y sus permisos. |
| `POST` | `/auth/verify-email` | Público / Autenticado | Confirma el correo electrónico mediante código de 6 dígitos (`email`, `code`). |
| `POST` | `/auth/resend-verification` | Público / Autenticado | Genera y envía un nuevo código de verificación de email. |
| `POST` | `/auth/forgot-password` | Público | Envía un código temporal de recuperación al correo indicado (`email`). |
| `POST` | `/auth/reset-password` | Público | Restablece la contraseña (`email`, `code`, `newPassword`) y revoca sesiones previas. |
| `POST` | `/auth/oauth/:provider` | Público | Inicio de sesión social con `google`, `github` o `facebook` (`idToken` / `accessToken` / `code`). |
| `POST` | `/auth/2fa/setup` | Autenticado | Genera secreto TOTP Base32 cifrado con AES-256-GCM, URI `otpauth://` y 6 códigos de recuperación. |
| `POST` | `/auth/2fa/verify` | Público / Autenticado | Verifica un código TOTP de 6 dígitos (RFC 6238) o código de recuperación para activar 2FA o completar el login. Alias: `/auth/2fa/confirm`. |
| `POST` | `/auth/2fa/disable` | Autenticado | Desactiva el segundo factor verificando `currentPassword`. |
| `GET` | `/auth/sessions` | Autenticado | Lista las sesiones activas (`refresh_tokens` vigentes) del usuario. |
| `DELETE` | `/auth/sessions/:id` | Autenticado | Revoca una sesión específica del usuario. |

---

## 3. Endpoints de Perfil y Estudiante (`/api/v1/users`)

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/users/me` | Autenticado | Obtiene los datos personales, rol, estado de verificación y preferencias. |
| `PATCH` | `/users/me` | Autenticado | Actualiza `firstName`, `lastName`, `username`, `bio`, `avatarUrl`. |
| `PATCH` | `/users/me/preferences` | Autenticado | Actualiza preferencias persistentes (`theme`: `light`/`dark`, `notifications`, `language`). |
| `PATCH` | `/users/me/password` | Autenticado | Cambia la contraseña validando `currentPassword` y `newPassword`. |
| `DELETE` | `/users/me` | Autenticado | Baja lógica (`deleted_at`) de la propia cuenta y revocación de tokens. |
| `GET` | `/users/me/dashboard` | Estudiante | Resumen académico, cursos en progreso, próximas entregas y recomendaciones. |
| `GET` | `/users/me/enrollments` | Estudiante | Lista las inscripciones del estudiante clasificadas en `in_progress`, `not_started`, `completed`. |
| `GET` | `/users/me/statistics` | Estudiante | Estadísticas reales de aprendizaje, desglose por curso y habilidades adquiridas. |
| `GET` | `/users/me/favorites` | Estudiante | Cursos guardados como favoritos por el estudiante. |
| `GET` | `/users/me/certificates` | Estudiante | Certificados oficiales emitidos al estudiante con su código único de verificación. |
| `GET` | `/users/me/calendar` | Estudiante | Eventos académicos (vencimientos de actividades y anuncios de cursos inscriptos). |

---

## 4. Endpoints de Cursos, Módulos, Lecciones e Inscripciones (`/api/v1`)

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/categories` | Público | Lista las categorías académicas activas con cantidad de cursos publicados. |
| `GET` | `/skills` | Público | Lista las habilidades registradas en la plataforma. |
| `GET` | `/courses` | Público / Opcional | Catálogo paginado con búsqueda (`q`), filtros (`categoryId`, `level`, `status`) y orden (`recent`, `popular`, `duration`). |
| `GET` | `/courses/:id` | Público / Autenticado | Detalle completo del curso: módulos, lecciones, recursos, habilidades, actividades, anuncios y estado de inscripción. |
| `POST` | `/courses` | `instructor`, `admin` | Crea un nuevo curso con transacción SQL para vincular `skillIds` y `prerequisiteIds`. |
| `PATCH` | `/courses/:id` | Dueño o `admin` | Actualiza datos del curso (verifica propiedad del instructor en el servidor). |
| `DELETE` | `/courses/:id` | Dueño o `admin` | Elimina un curso (impide borrar a instructores si ya posee estudiantes inscritos). |
| `POST` | `/courses/:id/publish` | Dueño o `admin` | Publica el curso tras verificar que tenga al menos 1 módulo y 1 lección. |
| `POST` | `/courses/:id/archive` | Dueño o `admin` | Archiva el curso preservando el historial de estudiantes inscritos. |
| `POST` | `/courses/:id/modules` | Dueño o `admin` | Agrega un módulo ordenado al curso. |
| `PATCH` | `/modules/:id` | Dueño o `admin` | Edita título, descripción o posición del módulo. |
| `DELETE` | `/modules/:id` | Dueño o `admin` | Elimina un módulo del curso. |
| `POST` | `/modules/:id/lessons` | Dueño o `admin` | Crea una lección dentro del módulo con recursos adjuntos opcionales. |
| `GET` | `/lessons/:id` | Autenticado | Obtiene el contenido completo de la lección, recursos y navegación anterior/siguiente. |
| `POST` | `/lessons/:id/start` | Estudiante inscripto | Registra el inicio de lectura (`in_progress`) en `lesson_progress`. |
| `POST` | `/lessons/:id/complete` | Estudiante inscripto | Marca la lección como `completed`, recalcula el porcentaje del curso y emite el certificado si llegó al 100%. |
| `POST` | `/courses/:id/enroll` | Autenticado | Inscribe al estudiante en un curso publicado. |
| `DELETE` | `/courses/:id/enroll` | Autenticado | Cancela la inscripción en el curso. |
| `POST` | `/courses/:id/favorite` | Autenticado | Marca el curso como favorito. |
| `DELETE` | `/courses/:id/favorite` | Autenticado | Quita el curso de favoritos. |
| `POST` | `/courses/:id/announcements` | Dueño o `admin` | Publica un anuncio en el curso y genera notificaciones para los estudiantes inscritos. |

---

## 5. Endpoints de Actividades, Evaluaciones y Panel Docente (`/api/v1`)

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/assignments` | Estudiante | Lista las actividades de los cursos en los que está inscripto (`filter`: `pending`, `submitted`, `graded`, `overdue`, `upcoming`). |
| `GET` | `/assignments/:id` | Inscripto / Dueño / `admin` | Detalle de la actividad, preguntas, opciones (sin revelar `isCorrect` al alumno), rúbrica e intentos propios. |
| `POST` | `/courses/:id/assignments` | Dueño o `admin` | Crea una actividad o cuestionario con preguntas, opciones y rúbrica en una transacción SQL. Alias: `POST /assignments`. |
| `POST` | `/assignments/:id/attempts` | Estudiante inscripto | Inicia un intento (verificando fecha límite y máximo de intentos) o envía respuestas directamente. |
| `POST` | `/attempts/:id/submit` | Estudiante dueño | Envía las respuestas o texto/archivo del intento. Autocalifica si es cuestionario objetivo o notifica al docente si es entrega abierta. |
| `GET` | `/instructor/dashboard` | `instructor`, `admin` | Métricas del instructor, cursos recientes y entregas pendientes de corrección. |
| `GET` | `/instructor/courses` | `instructor`, `admin` | Lista los cursos dictados por el instructor autenticado. |
| `GET` | `/instructor/students` | `instructor`, `admin` | Lista los estudiantes inscritos en los cursos del instructor con porcentaje de avance y nota promedio. |
| `GET` | `/instructor/attempts` | `instructor`, `admin` | Lista las entregas recibidas (`status=submitted` o `status=graded`) para corrección. |
| `PATCH` | `/attempts/:id/grade` | Dueño o `admin` | Registra la calificación numérica (`score`), la devolución escrita (`feedback`), guarda el historial en `grading_history` y notifica al estudiante. |

---

## 6. Endpoints de Administración, Reportes, Certificados y Notificaciones (`/api/v1`)

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/admin/dashboard` | `admin` | Métricas globales de la institución, distribución por rol, cursos más populares y auditoría reciente. |
| `GET` | `/admin/users` | `admin` | Lista usuarios con búsqueda (`q`/`search`) y filtros por `role` y `status`. |
| `POST` | `/admin/users` | `admin` | Crea un usuario con cualquier rol institucional (`student`, `instructor`, `admin`). |
| `PATCH` | `/admin/users/:id/role` | `admin` | Cambia el rol de un usuario y registra el evento en `audit_logs`. |
| `PATCH` | `/admin/users/:id/status` | `admin` | Suspende (`suspended`) o reactiva (`active`) una cuenta; si se suspende, revoca sus tokens activos. |
| `DELETE` | `/admin/users/:id` | `admin` | Baja lógica de un usuario (impide autoeliminación del propio administrador). |
| `GET` | `/admin/reports` | `admin` | Reportes verificables en tiempo real (`?type=completion`, `enrollments`, `users`). |
| `GET` | `/admin/audit-logs` | `admin` | Bitácora de auditoría del sistema ordenada cronológicamente. |
| `GET` | `/admin/settings` | `admin` | Obtiene los parámetros globales de `platform_settings`. |
| `PUT` | `/admin/settings` | `admin` | Actualiza los parámetros globales de la institución. |
| `GET` | `/certificates/verify/:code` | Público | Verifica públicamente la autenticidad de un certificado emitido por su código único (ej. `SKT-2026-UXUI-0004`). |
| `GET` | `/notifications` | Autenticado | Bandeja de notificaciones del usuario. |
| `PATCH` | `/notifications/:id/read` | Autenticado | Marca una notificación como leída. |
| `POST` | `/notifications/read-all` | Autenticado | Marca todas las notificaciones del usuario como leídas. |

---

## 7. Pruebas Automatizadas de Integración

Para ejecutar la suite completa de pruebas automatizadas contra la base de datos MySQL:

```powershell
cd C:\xampp\htdocs\ProyectoFinal\backend
npm test
```
