# TaskFlow – API REST (Backend)

API en **Node.js + Express + MySQL**, autenticación **JWT** (access + refresh con rotación), login social (Google, Facebook, GitHub), verificación en 2 pasos por email y control de acceso por roles.

## Estructura

```
backend/
├── sql/schema.sql            # Esquema MySQL
└── src/
    ├── config/db.js          # Pool MySQL
    ├── middlewares/          # auth (JWT + roles), validate, error
    ├── routes/               # Definición de endpoints + validaciones
    ├── controllers/          # Lógica de negocio
    ├── utils/                # tokens, mailer, social, errores
    ├── scripts/seed.js       # Usuarios de prueba
    ├── app.js                # Express app
    └── server.js             # Arranque
```

## Ejecutar

```bash
cd backend
npm install
cp .env.example .env          # completar credenciales
mysql -u root -p < sql/schema.sql
npm run seed                  # crea admin / manager / user de prueba
npm run dev                   # http://localhost:3000
```

Usuarios de prueba (`npm run seed`):

| Rol | Email | Contraseña |
|---|---|---|
| admin | admin@taskflow.test | Admin123! |
| manager | manager@taskflow.test | Manager123! |
| user | user@taskflow.test | User1234! |

## Convenciones

- Base URL: `http://localhost:3000/api/v1`
- Formato: JSON. Rutas protegidas: header `Authorization: Bearer <accessToken>`.
- Access token: 15 min. Refresh token: 30 días, de un solo uso (se rota en cada `/auth/refresh`).
- Errores: `{ "message": "texto", "errors": [{ "field": "email", "message": "..." }] }` (`errors` solo en 422).

### Códigos de error

| Código | Significado |
|---|---|
| 400 | Solicitud inválida / proveedor sin email |
| 401 | Sin token, token vencido, credenciales incorrectas |
| 403 | Rol sin permiso o cuenta desactivada |
| 404 | Recurso inexistente |
| 409 | Duplicado (email ya registrado) |
| 422 | Falla de validación de campos |
| 429 | Demasiados intentos (rate limit / código 2FA) |
| 500 | Error interno |

## Roles y permisos

| Acción | user | manager | admin |
|---|:-:|:-:|:-:|
| Ver tareas | solo propias/asignadas | todas | todas |
| Crear tareas | sí (se asignan a sí mismo) | sí (asigna a cualquiera) | sí |
| Editar tareas | propias/asignadas (sin reasignar) | todas | todas |
| Eliminar tareas | solo las que creó | todas | todas |
| Panel de métricas (`/tasks/stats`) | no | sí | sí |
| Listar usuarios asignables | no | sí | sí |
| Gestionar usuarios (rol, estado, borrar) | no | no | sí |

## Endpoints

### Auth (`/auth`) – públicos

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/auth/register` | `name`, `email`, `password` (≥8, letras y número), `twoFactorEnabled?` | **201** `{ user, accessToken, refreshToken }` · 409 · 422 |
| POST | `/auth/login` | `email`, `password` | **200** `{ user, accessToken, refreshToken }` · **202** `{ twoFactorRequired: true, userId, message }` si tiene 2FA · 401 · 403 |
| POST | `/auth/2fa/verify` | `userId`, `code` (6 dígitos) | **200** sesión · 401 (código incorrecto/vencido) · 429 (5 intentos) |
| POST | `/auth/2fa/resend` | `userId` | **200** `{ message }` |
| POST | `/auth/social/google` | `accessToken` | **200** sesión · 401 |
| POST | `/auth/social/facebook` | `accessToken` | **200** sesión · 401 |
| POST | `/auth/social/github` | `code`, `redirectUri` | **200** sesión · 401 |
| POST | `/auth/refresh` | `refreshToken` | **200** `{ accessToken, refreshToken }` · 401 |
| POST | `/auth/logout` | `refreshToken` | **204** |

Login social: si el email ya existe, se vincula la cuenta; si no, se crea con rol `user`. El código de 2 pasos vence en 10 minutos y los anteriores se invalidan al pedir uno nuevo.

**Ejemplo**

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@taskflow.test","password":"Admin123!"}'
```
```json
{
  "user": { "id": 1, "name": "Admin TaskFlow", "email": "admin@taskflow.test", "role": "admin", "isActive": true, "twoFactorEnabled": false },
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "9f2c..."
}
```

### Usuarios (`/users`) – requieren token

| Método | Ruta | Rol | Body / descripción | Respuestas |
|---|---|---|---|---|
| GET | `/users/me` | todos | Perfil propio | 200 |
| PUT | `/users/me` | todos | `name?`, `twoFactorEnabled?`, `currentPassword?` + `newPassword?` | 200 · 400 · 422 |
| GET | `/users/assignable` | manager, admin | `[{ id, name, role }]` usuarios activos | 200 · 403 |
| GET | `/users` | admin | Lista completa | 200 · 403 |
| PATCH | `/users/:id/role` | admin | `role`: `admin` \| `manager` \| `user` | 200 · 400 · 404 |
| PATCH | `/users/:id/status` | admin | `isActive`: boolean (desactivar revoca sus sesiones) | 200 · 404 |
| DELETE | `/users/:id` | admin | Elimina usuario | 204 · 404 |

Un administrador no puede modificar ni borrar su propio usuario desde estos endpoints (400).

### Tareas (`/tasks`) – requieren token

| Método | Ruta | Descripción | Respuestas |
|---|---|---|---|
| GET | `/tasks` | Lista. Query: `status`, `priority`, `q`, `assignedTo` (solo staff), `page`, `limit` (máx. 100) | 200 `{ data, page, limit, total }` |
| GET | `/tasks/stats` | Métricas (manager, admin) | 200 `{ byStatus, overdue, byUser }` · 403 |
| GET | `/tasks/:id` | Detalle | 200 · 403 · 404 |
| POST | `/tasks` | Crear | 201 · 422 |
| PUT | `/tasks/:id` | Actualizar (campos parciales) | 200 · 403 · 404 · 422 |
| DELETE | `/tasks/:id` | Eliminar | 204 · 403 · 404 |

Body de creación/edición:

```json
{
  "title": "Preparar informe",          // 3-150 caracteres (obligatorio al crear)
  "description": "Detalle opcional",    // máx. 2000
  "status": "pending",                  // pending | in_progress | done
  "priority": "medium",                 // low | medium | high
  "dueDate": "2026-11-15",              // AAAA-MM-DD o null
  "assignedTo": 3                       // id de usuario (solo manager/admin)
}
```

Respuesta de una tarea:

```json
{
  "id": 12, "title": "Preparar informe", "description": null,
  "status": "pending", "priority": "medium", "dueDate": "2026-11-15",
  "createdBy": 2, "createdByName": "Sofía Supervisora",
  "assignedTo": 3, "assignedToName": "Ulises Usuario",
  "createdAt": "2026-10-27 10:00:00", "updatedAt": "2026-10-27 10:00:00"
}
```

### Otros

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio (`{ "status": "ok" }`) |

## Seguridad aplicada

Contraseñas con bcrypt · refresh tokens guardados como hash SHA-256 y rotados · códigos 2FA hasheados con límite de intentos · rol leído de la BD en cada request · `helmet`, CORS, rate limiting en `/auth` · consultas parametrizadas (sin SQL injection) · el `client_secret` de GitHub vive solo en el backend.
