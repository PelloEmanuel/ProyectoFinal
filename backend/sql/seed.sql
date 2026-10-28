-- ============================================================================
-- Archivo: backend/sql/seed.sql
-- Descripción: Datos iniciales para PostgreSQL (usuarios por rol, etiquetas,
-- tareas de ejemplo y asignaciones N:M en task_tags).
-- Se conecta con: backend/src/scripts/init-db.js.
-- Contraseñas de prueba:
--   admin@taskflow.test   -> Admin123!
--   manager@taskflow.test -> Manager123!
--   user@taskflow.test    -> User1234!
-- ============================================================================

-- 1. Usuarios iniciales (uno por cada rol requerido)
INSERT INTO users (name, email, password_hash, role, two_factor_enabled, is_active)
VALUES
  ('Admin TaskFlow', 'admin@taskflow.test', '$2a$10$X0e0AfMX1SU8xCfUhAxpzOHXdxaRc.0TrvA2Avv3qTrDMX293A6om', 'admin', 0, 1),
  ('Sofía Supervisora', 'manager@taskflow.test', '$2a$10$ZvdGoylBbOr8qiPX3pQ3ReEHhnes4UgqtxEe/JrZlCNStR.cmK6Ca', 'manager', 0, 1),
  ('Ulises Usuario', 'user@taskflow.test', '$2a$10$mdPk8RkbC8rxpv6MiRMrku81uzVQJzRidWffhlRf56amoJGVpRxe.', 'user', 0, 1)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active;

-- 2. Etiquetas iniciales (para relación N:M)
INSERT INTO tags (name, color)
VALUES
  ('Urgente', '#dc2626'),
  ('Backend', '#4f46e5'),
  ('Mobile UI', '#2563eb'),
  ('Documentación', '#16a34a')
ON CONFLICT (name) DO UPDATE SET
  color = EXCLUDED.color;

-- 3. Tareas iniciales de ejemplo (solo si aún no hay tareas cargadas)
INSERT INTO tasks (title, description, status, priority, due_date, created_by, assigned_to)
SELECT
  'Configurar base de datos PostgreSQL en Render',
  'Verificar conexión segura con variables de entorno y modelo en 3FN.',
  'done',
  'high',
  CURRENT_DATE + INTERVAL '2 days',
  (SELECT id FROM users WHERE email = 'admin@taskflow.test'),
  (SELECT id FROM users WHERE email = 'user@taskflow.test')
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Configurar base de datos PostgreSQL en Render');

INSERT INTO tasks (title, description, status, priority, due_date, created_by, assigned_to)
SELECT
  'Revisar pantallas y permisos por rol',
  'Comprobar accesos de Usuario, Supervisor y Administrador en la app móvil.',
  'in_progress',
  'medium',
  CURRENT_DATE + INTERVAL '5 days',
  (SELECT id FROM users WHERE email = 'manager@taskflow.test'),
  (SELECT id FROM users WHERE email = 'user@taskflow.test')
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Revisar pantallas y permisos por rol');

-- 4. Relaciones N:M en tabla intermedia task_tags
INSERT INTO task_tags (task_id, tag_id)
SELECT t.id, g.id
FROM tasks t
JOIN tags g ON g.name IN ('Backend', 'Urgente')
WHERE t.title = 'Configurar base de datos PostgreSQL en Render'
ON CONFLICT DO NOTHING;

INSERT INTO task_tags (task_id, tag_id)
SELECT t.id, g.id
FROM tasks t
JOIN tags g ON g.name IN ('Mobile UI', 'Documentación')
WHERE t.title = 'Revisar pantallas y permisos por rol'
ON CONFLICT DO NOTHING;
