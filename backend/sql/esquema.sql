-- ============================================================================
-- Campus - Esquema Relacional MySQL / MariaDB (3FN) con Tablas en Español
-- ============================================================================

CREATE DATABASE IF NOT EXISTS skilltrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE skilltrack;

-- ----------------------------------------------------------------------------
-- 9.1. Usuarios y Seguridad
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  username VARCHAR(160) NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  avatar_url VARCHAR(500) NULL,
  bio TEXT NULL,
  role_id INT UNSIGNED NOT NULL,
  status ENUM('active','pending_verification','suspended') NOT NULL DEFAULT 'active',
  email_verified_at DATETIME NULL,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_by_admin TINYINT(1) NOT NULL DEFAULT 0,
  school_year TINYINT UNSIGNED NULL,
  course_division TINYINT UNSIGNED NULL,
  preferences JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_users_role (role_id),
  INDEX idx_users_status (status),
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS identidades_usuario (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  provider ENUM('google','github','facebook') NOT NULL,
  provider_user_id VARCHAR(120) NOT NULL,
  provider_email VARCHAR(150) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_identity (provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tokens_renovacion (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  device_info VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_refresh_user (user_id),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tokens_verificacion_correo (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_evt_user (user_id),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tokens_recuperacion_clave (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prt_user (user_id),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS doble_factor_usuario (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  encrypted_secret VARCHAR(255) NOT NULL,
  recovery_codes_json TEXT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_used_step BIGINT NULL,
  enabled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9.2. Contenido Educativo
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categorias (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS habilidades (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  category_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS materias_escolares (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(300) NULL,
  category_id INT UNSIGNED NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cursos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instructor_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NULL,
  school_year TINYINT UNSIGNED NOT NULL DEFAULT 1,
  course_division TINYINT UNSIGNED NOT NULL DEFAULT 1,
  title VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  short_description VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  cover_image VARCHAR(500) NULL,
  level ENUM('beginner','intermediate','advanced') NOT NULL DEFAULT 'beginner',
  language VARCHAR(40) NOT NULL DEFAULT 'Español',
  estimated_duration INT UNSIGNED NOT NULL DEFAULT 10,
  objectives TEXT NULL,
  requirements TEXT NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  visibility ENUM('public','private') NOT NULL DEFAULT 'public',
  certificate_enabled TINYINT(1) NOT NULL DEFAULT 1,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  theme_color VARCHAR(30) NULL,
  INDEX idx_courses_instructor (instructor_id),
  INDEX idx_courses_category (category_id),
  INDEX idx_courses_school_group (school_year, course_division),
  INDEX idx_courses_status (status),
  INDEX idx_courses_level (level),
  FOREIGN KEY (instructor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categorias(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS horarios_curso (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id INT UNSIGNED NOT NULL,
  school_year TINYINT UNSIGNED NOT NULL DEFAULT 1,
  course_division TINYINT UNSIGNED NOT NULL DEFAULT 1,
  day_of_week ENUM('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado') NOT NULL DEFAULT 'Lunes',
  start_time CHAR(5) NOT NULL,
  end_time CHAR(5) NOT NULL,
  classroom VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sched_group (school_year, course_division, day_of_week, start_time),
  INDEX idx_sched_course (course_id),
  FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS habilidades_curso (
  course_id INT UNSIGNED NOT NULL,
  skill_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (course_id, skill_id),
  FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES habilidades(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS prerrequisitos_curso (
  course_id INT UNSIGNED NOT NULL,
  prerequisite_course_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (course_id, prerequisite_course_id),
  FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE,
  FOREIGN KEY (prerequisite_course_id) REFERENCES cursos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS modulos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  position INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_modules_course (course_id, position),
  FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lecciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  content_type ENUM('text','resource','code','guide') NOT NULL DEFAULT 'text',
  content LONGTEXT NOT NULL,
  attachments JSON NULL,
  position INT UNSIGNED NOT NULL DEFAULT 1,
  estimated_duration INT UNSIGNED NOT NULL DEFAULT 15,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lessons_module (module_id, position),
  FOREIGN KEY (module_id) REFERENCES modulos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recursos_lecciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lesson_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  resource_type ENUM('link','pdf','repo','doc') NOT NULL DEFAULT 'link',
  resource_url VARCHAR(500) NOT NULL,
  metadata JSON NULL,
  FOREIGN KEY (lesson_id) REFERENCES lecciones(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9.3. Inscripciones y Progreso
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inscripciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  course_id INT UNSIGNED NOT NULL,
  status ENUM('active','completed','archived') NOT NULL DEFAULT 'active',
  enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  last_accessed_at DATETIME NULL,
  UNIQUE KEY uq_student_course (student_id, course_id),
  INDEX idx_enrollments_course (course_id),
  FOREIGN KEY (student_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS progreso_lecciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  enrollment_id INT UNSIGNED NOT NULL,
  lesson_id INT UNSIGNED NOT NULL,
  status ENUM('not_started','in_progress','completed') NOT NULL DEFAULT 'in_progress',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollment_lesson (enrollment_id, lesson_id),
  FOREIGN KEY (enrollment_id) REFERENCES inscripciones(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lecciones(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cursos_favoritos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  course_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_favorite_course (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9.4. Actividades y Evaluaciones
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tareas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id INT UNSIGNED NOT NULL,
  module_id INT UNSIGNED NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  attachments JSON NULL,
  assignment_type ENUM('multiple_choice','true_false','short_answer','text_submission','file_submission') NOT NULL DEFAULT 'file_submission',
  max_score DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  passing_score DECIMAL(5,2) NOT NULL DEFAULT 60.00,
  due_at DATETIME NULL,
  allow_late_submissions TINYINT(1) NOT NULL DEFAULT 1,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 2,
  status ENUM('draft','published','closed') NOT NULL DEFAULT 'published',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_assignments_course (course_id),
  INDEX idx_assignments_due (due_at),
  FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE,
  FOREIGN KEY (module_id) REFERENCES modulos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS preguntas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT UNSIGNED NOT NULL,
  question_type ENUM('multiple_choice','true_false','short_answer') NOT NULL DEFAULT 'multiple_choice',
  prompt TEXT NOT NULL,
  expected_answer VARCHAR(500) NULL,
  points DECIMAL(5,2) NOT NULL DEFAULT 25.00,
  position INT UNSIGNED NOT NULL DEFAULT 1,
  FOREIGN KEY (assignment_id) REFERENCES tareas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS opciones_preguntas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question_id INT UNSIGNED NOT NULL,
  option_text VARCHAR(500) NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  position INT UNSIGNED NOT NULL DEFAULT 1,
  FOREIGN KEY (question_id) REFERENCES preguntas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rubricas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT UNSIGNED NOT NULL UNIQUE,
  title VARCHAR(150) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES tareas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS criterios_rubrica (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rubric_id INT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(300) NULL,
  max_points DECIMAL(5,2) NOT NULL DEFAULT 25.00,
  position INT UNSIGNED NOT NULL DEFAULT 1,
  FOREIGN KEY (rubric_id) REFERENCES rubricas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS entregas_tareas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  attempt_number INT UNSIGNED NOT NULL DEFAULT 1,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME NULL,
  status ENUM('in_progress','submitted','graded') NOT NULL DEFAULT 'in_progress',
  is_late TINYINT(1) NOT NULL DEFAULT 0,
  submission_text TEXT NULL,
  attachments JSON NULL,
  score DECIMAL(5,2) NULL,
  feedback TEXT NULL,
  graded_by INT UNSIGNED NULL,
  graded_at DATETIME NULL,
  INDEX idx_attempts_assignment (assignment_id, student_id),
  INDEX idx_attempts_status (status),
  FOREIGN KEY (assignment_id) REFERENCES tareas(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (graded_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS respuestas_intentos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT UNSIGNED NOT NULL,
  question_id INT UNSIGNED NOT NULL,
  answer_text TEXT NULL,
  selected_option_id INT UNSIGNED NULL,
  awarded_points DECIMAL(5,2) NULL,
  UNIQUE KEY uq_attempt_question (attempt_id, question_id),
  FOREIGN KEY (attempt_id) REFERENCES entregas_tareas(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES preguntas(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_option_id) REFERENCES opciones_preguntas(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS archivos_tareas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT UNSIGNED NOT NULL DEFAULT 0,
  file_url VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attempt_id) REFERENCES entregas_tareas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS historial_calificaciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT UNSIGNED NOT NULL,
  graded_by INT UNSIGNED NOT NULL,
  previous_score DECIMAL(5,2) NULL,
  new_score DECIMAL(5,2) NOT NULL,
  feedback TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attempt_id) REFERENCES entregas_tareas(id) ON DELETE CASCADE,
  FOREIGN KEY (graded_by) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9.5. Comunicación, Seguimiento, Certificados, Asistencia y Auditoría
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS anuncios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id INT UNSIGNED NOT NULL,
  instructor_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  content TEXT NOT NULL,
  attachments JSON NULL,
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('published','archived') NOT NULL DEFAULT 'published',
  INDEX idx_announcements_course (course_id),
  FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS comentarios_tablon (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id INT UNSIGNED NOT NULL,
  item_type ENUM('announcement','lesson','assignment') NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  student_id INT UNSIGNED NULL,
  message TEXT NOT NULL,
  attachments JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_feed_comm_item (item_type, item_id, is_private, student_id),
  INDEX idx_feed_comm_course (course_id),
  FOREIGN KEY (course_id) REFERENCES cursos(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notificaciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  resource_type VARCHAR(40) NULL,
  resource_id INT UNSIGNED NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user (user_id, read_at),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS certificados (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  enrollment_id INT UNSIGNED NOT NULL UNIQUE,
  verification_code VARCHAR(40) NOT NULL UNIQUE,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('valid','revoked') NOT NULL DEFAULT 'valid',
  FOREIGN KEY (enrollment_id) REFERENCES inscripciones(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registros_auditoria (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INT UNSIGNED NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  FOREIGN KEY (actor_user_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ajustes_plataforma (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grupos_escolares (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_year INT NOT NULL,
  course_division INT NOT NULL,
  status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  access_code VARCHAR(60) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_group (school_year, course_division)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registros_asistencia (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_year INT UNSIGNED NOT NULL,
  course_division INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  status ENUM('presente','falta_completa','media_falta','cuarto_falta','justificada','nulo') NOT NULL DEFAULT 'presente',
  notes VARCHAR(255) NULL,
  recorded_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_date (student_id, date),
  INDEX idx_group_date (school_year, course_division, date),
  FOREIGN KEY (recorded_by) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (student_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
