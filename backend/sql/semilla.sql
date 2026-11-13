-- ============================================================================
-- Campus Técnica 5 - Datos Base del Sistema (Tablas en Español)
-- ============================================================================

INSERT INTO roles (id, name, description) VALUES
  (1, 'admin', 'Administrador general del Campus'),
  (2, 'instructor', 'Docente a cargo de materias, teoría, actividades y evaluaciones'),
  (3, 'student', 'Alumno inscripto por Año (1° a 6°) y Curso (1° a 3°)'),
  (4, 'preceptor', 'Preceptor - Gestión de cursos, grupos y asistencias')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO categorias (id, name, description, status) VALUES
  (1, 'Ciencias Exactas y Matemática', 'Matemática, Álgebra, Análisis Matemático, Física y Estadística', 'active'),
  (2, 'Lengua, Literatura y Humanidades', 'Lengua y Literatura, Historia, Geografía, Filosofía y Ciudadanía', 'active'),
  (3, 'Ciencias Naturales', 'Biología, Química, Salud y Ambiente', 'active'),
  (4, 'Informática e Idiomas', 'Programación, Sistemas, Tecnología e Inglés', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), status = 'active';

INSERT INTO habilidades (id, name, description, category_id) VALUES
  (1, 'Resolución de Problemas', 'Razonamiento lógico-matemático y modelado analítico', 1),
  (2, 'Comprensión y Redacción', 'Análisis de textos, argumentación y expresión escrita', 2),
  (3, 'Método Científico', 'Experimentación, formulación de hipótesis y análisis de datos', 3),
  (4, 'Pensamiento Computacional', 'Algoritmos, desarrollo de software y herramientas digitales', 4),
  (5, 'Trabajo Colaborativo', 'Investigación en equipo y proyectos interdisciplinarios', 2)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT IGNORE INTO ajustes_plataforma (setting_key, setting_value) VALUES
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
