-- ============================================================================
-- Campus Técnica 5 - Datos Base del Sistema (Sin perfiles de prueba)
-- Inicializa roles institucionales, áreas académicas base y parámetros
-- iniciales de configuración (con INSERT IGNORE para preservar cambios del Admin).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Roles del sistema (1: admin, 2: instructor, 3: student)
-- ----------------------------------------------------------------------------
INSERT INTO roles (id, name, description) VALUES
  (1, 'admin', 'Administrador general del Campus'),
  (2, 'instructor', 'Docente a cargo de materias, teoría, actividades y evaluaciones'),
  (3, 'student', 'Alumno inscripto por Año (1° a 6°) y Curso (1° a 3°)')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- ----------------------------------------------------------------------------
-- 2. Áreas / Categorías y Habilidades base para las materias escolares
-- ----------------------------------------------------------------------------
INSERT INTO categories (id, name, description, status) VALUES
  (1, 'Ciencias Exactas y Matemática', 'Matemática, Álgebra, Análisis Matemático, Física y Estadística', 'active'),
  (2, 'Lengua, Literatura y Humanidades', 'Lengua y Literatura, Historia, Geografía, Filosofía y Ciudadanía', 'active'),
  (3, 'Ciencias Naturales', 'Biología, Química, Salud y Ambiente', 'active'),
  (4, 'Informática e Idiomas', 'Programación, Sistemas, Tecnología e Inglés', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), status = 'active';

INSERT INTO skills (id, name, description, category_id) VALUES
  (1, 'Resolución de Problemas', 'Razonamiento lógico-matemático y modelado analítico', 1),
  (2, 'Comprensión y Redacción', 'Análisis de textos, argumentación y expresión escrita', 2),
  (3, 'Método Científico', 'Experimentación, formulación de hipótesis y análisis de datos', 3),
  (4, 'Pensamiento Computacional', 'Algoritmos, desarrollo de software y herramientas digitales', 4),
  (5, 'Trabajo Colaborativo', 'Investigación en equipo y proyectos interdisciplinarios', 2)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- ----------------------------------------------------------------------------
-- 3. Configuración global de la plataforma
-- Se usa INSERT IGNORE para que los cambios del Administrador (como la clave
-- para registro de docentes) persistan siempre tras reiniciar el servidor.
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO platform_settings (setting_key, setting_value) VALUES
  ('platform_name', 'Campus'),
  ('institution_name', 'Campus Técnica 5'),
  ('platform_description', 'Campus escolar de seguimiento académico de 1° a 6° Año (Cursos 1° a 3°)'),
  ('enrollment_policy', 'open'),
  ('allow_public_registration', 'true'),
  ('require_email_verification', 'false'),
  ('certificates_enabled', 'true'),
  ('default_passing_score', '60'),
  ('certificate_issuer_title', 'Dirección Académica del Campus'),
  ('support_email', 'preceptoria@campus.edu'),
  ('instructor_registration_key', 'DOCENTE2026');
