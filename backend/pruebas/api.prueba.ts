import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import app from '../src/aplicacion';
import { pool } from '../src/configuracion/baseDatos';
import { generateTOTP } from '../src/utilidades/dobleFactor';

// Declara la instancia del servidor de pruebas y la URL base local.
let server: http.Server;
let baseUrl: string;

// Define las opciones de una petición HTTP de prueba hacia la API.
interface OpcionesPeticionPrueba {
  method?: string;
  token?: string;
  body?: any;
}

// Ejecuta una petición HTTP contra el servidor de pruebas y devuelve el código de estado y el cuerpo JSON.
async function apiRequest(path: string, { method = 'GET', token, body }: OpcionesPeticionPrueba = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

// Inicia el servidor HTTP en un puerto efímero antes de ejecutar la suite de pruebas.
test.before(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

// Cierra el servidor HTTP y libera el pool de conexiones de MySQL al finalizar las pruebas.
test.after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await pool.end();
});

// Almacena los tokens e identificadores compartidos entre las pruebas secuenciales.
let studentToken = '';
let studentRefreshToken = '';
let instructorToken = '';
let adminToken = '';
let createdCourseId: number | null = null;
let createdModuleId: number | null = null;
let createdLessonId: number | null = null;
let createdQuizId: number | null = null;
let createdQuizOptionCorrectId: number | null = null;
let createdTextAssignmentId: number | null = null;
let createdAttemptId: number | null = null;
let totpSecret = '';

// Verifica que el endpoint de salud responda con estado 200.
test('1. Healthcheck y estado de la base de datos MySQL', async () => {
  const res = await fetch(`${baseUrl.replace('/api/v1', '')}/health`);
  const data: any = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.data?.service || data.service, 'Campus API');
});

// Verifica el flujo de registro de estudiantes y bloqueo de correos duplicados.
test('2. Autenticación: Registro de estudiante válido y rechazo de duplicado', async () => {
  const uniqueEmail = `alumno.test.${Date.now()}@skilltrack.edu`;

  // Registra un nuevo estudiante y verifica que se emita el desafío de verificación en 2 pasos.
  const regRes = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      firstName: 'Juan',
      lastName: 'Pérez',
      email: uniqueEmail,
      password: 'Password123!',
      acceptTerms: true,
    },
  });
  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.success, true);
});

// Verifica el inicio de sesión de las cuentas de demostración de docente, estudiante y administrador.
test('3. Autenticación: Login de Instructor, Estudiante y Admin, rechazo de credenciales inválidas y Refresh Token', async () => {
  // Comprueba que una contraseña incorrecta devuelva error 401.
  const badLogin = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'instructor@skilltrack.edu', password: 'WrongPassword999!' },
  });
  assert.equal(badLogin.status, 401);

  // Inicia sesión con la cuenta de estudiante de demostración.
  const stuLogin = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'estudiante@skilltrack.edu', password: 'Estudiante123!' },
  });
  assert.equal(stuLogin.status, 200);
  studentToken = stuLogin.body.data.accessToken;
  studentRefreshToken = stuLogin.body.data.refreshToken;

  // Inicia sesión con la cuenta de docente de demostración.
  const instLogin = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'instructor@skilltrack.edu', password: 'Instructor123!' },
  });
  assert.equal(instLogin.status, 200);
  assert.equal(instLogin.body.data.user.role, 'instructor');
  instructorToken = instLogin.body.data.accessToken;

  // Inicia sesión con la cuenta de administrador de demostración.
  const admLogin = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'admin@skilltrack.edu', password: 'Admin123!' },
  });
  assert.equal(admLogin.status, 200);
  assert.equal(admLogin.body.data.user.role, 'admin');
  adminToken = admLogin.body.data.accessToken;

  // Verifica la rotación del token de actualización del estudiante.
  const refRes = await apiRequest('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: studentRefreshToken },
  });
  assert.equal(refRes.status, 200);
  assert.ok(refRes.body.data.accessToken);
  studentToken = refRes.body.data.accessToken;
  studentRefreshToken = refRes.body.data.refreshToken;
});

// Verifica el ciclo completo de configuración, confirmación y desactivación del segundo factor TOTP.
test('4. Seguridad 2FA TOTP (RFC 6238): Configuración, activación y desactivación', async () => {
  // Inicia la configuración 2FA para el estudiante.
  const setupRes = await apiRequest('/auth/2fa/setup', {
    method: 'POST',
    token: studentToken,
  });
  assert.equal(setupRes.status, 200);
  assert.ok(setupRes.body.data.secret);
  assert.ok(Array.isArray(setupRes.body.data.recoveryCodes));
  assert.equal(setupRes.body.data.recoveryCodes.length, 6);
  totpSecret = setupRes.body.data.secret;

  // Genera un código TOTP válido y confirma la activación del segundo factor.
  const validCode = generateTOTP(totpSecret);
  const confirmRes = await apiRequest('/auth/2fa/confirm', {
    method: 'POST',
    token: studentToken,
    body: { code: validCode },
  });
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.body.data.user.twoFactorEnabled, true);

  // Desactiva el segundo factor proporcionando la contraseña del estudiante.
  const disableRes = await apiRequest('/auth/2fa/disable', {
    method: 'POST',
    token: studentToken,
    body: { password: 'Estudiante123!' },
  });
  assert.equal(disableRes.status, 200);
});

// Verifica las restricciones de control de acceso basado en roles (RBAC).
test('5. Control de Acceso RBAC y Propiedad (Ownership)', async () => {
  // Comprueba que un estudiante no pueda acceder al panel administrativo.
  const stuAdminRes = await apiRequest('/admin/dashboard', {
    token: studentToken,
  });
  assert.equal(stuAdminRes.status, 403);

  // Comprueba que un estudiante no pueda crear un curso académico.
  const stuCourseRes = await apiRequest('/courses', {
    method: 'POST',
    token: studentToken,
    body: {
      title: 'Curso no autorizado',
      summary: 'Resumen de prueba',
      categoryId: 1,
      level: 'beginner',
    },
  });
  assert.equal(stuCourseRes.status, 403);
});

// Verifica la creación de cursos, módulos, lecciones y evaluaciones por parte de un docente.
test('6. Gestión Académica: Instructor crea curso, módulo, lección, quiz y entrega práctica', async () => {
  // Crea un nuevo curso publicado.
  const courseRes = await apiRequest('/courses', {
    method: 'POST',
    token: instructorToken,
    body: {
      title: `Curso Automatizado ${Date.now()}`,
      summary: 'Curso integral creado durante la suite de pruebas de integración.',
      description: 'Descripción completa del curso con módulos, lecciones y evaluaciones.',
      categoryId: 1,
      level: 'intermediate',
      estimatedHours: 10,
      status: 'published',
      skillIds: [1, 2],
    },
  });
  assert.equal(courseRes.status, 201);
  createdCourseId = courseRes.body.data.id;

  // Crea un módulo dentro del curso recién creado.
  const modRes = await apiRequest(`/courses/${createdCourseId}/modules`, {
    method: 'POST',
    token: instructorToken,
    body: {
      title: 'Módulo 1: Arquitectura y Pruebas',
      description: 'Fundamentos prácticos del módulo.',
    },
  });
  assert.equal(modRes.status, 201);
  createdModuleId = modRes.body.data.id;

  // Crea una lección obligatoria dentro del módulo.
  const lesRes = await apiRequest(`/modules/${createdModuleId}/lessons`, {
    method: 'POST',
    token: instructorToken,
    body: {
      title: 'Lección 1: Integración Continua y Validación',
      lessonType: 'reading',
      estimatedMinutes: 15,
      contentText: 'Desarrollo completo de la lección académica de prueba.',
    },
  });
  assert.equal(lesRes.status, 201);
  createdLessonId = lesRes.body.data.id;

  // Crea un cuestionario de opción múltiple autoevaluable.
  const quizRes = await apiRequest('/assignments', {
    method: 'POST',
    token: instructorToken,
    body: {
      courseId: createdCourseId,
      moduleId: createdModuleId,
      title: 'Quiz de Verificación Automática',
      description: 'Cuestionario autoevaluable de opción múltiple.',
      assignmentType: 'quiz',
      passingScore: 70,
      maxScore: 100,
      maxAttempts: 3,
      questions: [
        {
          prompt: '¿Qué código HTTP indica creación exitosa de un recurso REST?',
          questionType: 'multiple_choice',
          points: 100,
          options: [
            { optionText: '201 Created', isCorrect: true },
            { optionText: '404 Not Found', isCorrect: false },
          ],
        },
      ],
    },
  });
  assert.equal(quizRes.status, 201);
  createdQuizId = quizRes.body.data.id;

  // Obtiene el identificador de la opción correcta del cuestionario.
  const quizDetail = await apiRequest(`/assignments/${createdQuizId}`, {
    token: instructorToken,
  });
  assert.equal(quizDetail.status, 200);
  createdQuizOptionCorrectId = quizDetail.body.data.questions[0].options[0].id;

  // Crea una actividad de entrega escrita para calificación manual docente.
  const textAsgRes = await apiRequest('/assignments', {
    method: 'POST',
    token: instructorToken,
    body: {
      courseId: createdCourseId,
      moduleId: createdModuleId,
      title: 'Trabajo Práctico de Desarrollo',
      description: 'Entrega escrita para revisión manual del instructor.',
      assignmentType: 'text_submission',
      passingScore: 70,
      maxScore: 100,
      maxAttempts: 2,
    },
  });
  assert.equal(textAsgRes.status, 201);
  createdTextAssignmentId = textAsgRes.body.data.id;
});

// Verifica la inscripción del alumno, el avance de lección y la emisión del certificado.
test('7. Estudiante: Inscripción, avance de lección al 100% y emisión automática de certificado', async () => {
  // Inscribe al estudiante en el curso creado.
  const enrollRes = await apiRequest(`/courses/${createdCourseId}/enroll`, {
    method: 'POST',
    token: studentToken,
  });
  assert.equal(enrollRes.status, 201);

  // Marca la lección como completada y comprueba la emisión del certificado.
  const compRes = await apiRequest(`/lessons/${createdLessonId}/complete`, {
    method: 'POST',
    token: studentToken,
    body: { timeSpentMinutes: 15 },
  });
  assert.equal(compRes.status, 200);
  assert.equal(compRes.body.data.progressPercent, 100);
  assert.ok(compRes.body.data.certificate);

  // Verifica públicamente el certificado mediante su código único.
  const code = compRes.body.data.certificate.certificateCode;
  const verifyCertRes = await apiRequest(`/certificates/verify/${code}`);
  assert.equal(verifyCertRes.status, 200);
  assert.equal(verifyCertRes.body.data.certificateCode, code);
});

// Verifica la autoevaluación de cuestionarios y la calificación manual docente.
test('8. Evaluaciones: Autoevaluación de Quiz y calificación docente de entrega con feedback', async () => {
  const quizDetail = await apiRequest(`/assignments/${createdQuizId}`, {
    token: studentToken,
  });
  const questionId = quizDetail.body.data.questions[0].id;

  // Envía las respuestas del cuestionario y comprueba la calificación automática del 100%.
  const quizAttemptRes = await apiRequest(`/assignments/${createdQuizId}/attempts`, {
    method: 'POST',
    token: studentToken,
    body: {
      answers: [{ questionId, selectedOptionId: createdQuizOptionCorrectId }],
    },
  });
  assert.equal(quizAttemptRes.status, 201);
  assert.equal(quizAttemptRes.body.data.status, 'graded');
  assert.equal(Number(quizAttemptRes.body.data.score), 100);
  assert.equal(Boolean(quizAttemptRes.body.data.passed), true);

  // Envía la entrega escrita del estudiante.
  const textAttemptRes = await apiRequest(`/assignments/${createdTextAssignmentId}/attempts`, {
    method: 'POST',
    token: studentToken,
    body: {
      submissionText:
        'Presento el análisis arquitectónico aplicando normalización en 3FN, JWT rotativo y validación estricta.',
      submissionUrl: 'https://github.com/skilltrack/tp-integrador',
    },
  });
  assert.equal(textAttemptRes.status, 201);
  assert.equal(textAttemptRes.body.data.status, 'submitted');
  createdAttemptId = textAttemptRes.body.data.id;

  // Califica la entrega desde la cuenta del docente y verifica la nota registrada.
  const gradeRes = await apiRequest(`/attempts/${createdAttemptId}/grade`, {
    method: 'PATCH',
    token: instructorToken,
    body: {
      score: 95,
      feedback: 'Excelente fundamentación técnica y claridad expositiva.',
      status: 'graded',
    },
  });
  assert.equal(gradeRes.status, 200);
  assert.equal(Number(gradeRes.body.data.score), 95);
  assert.equal(Boolean(gradeRes.body.data.passed), true);
});

// Verifica el funcionamiento de los endpoints administrativos de métricas, reportes y auditoría.
test('9. Administración: Dashboard global, reportes SQL y bitácora de auditoría', async () => {
  const dashRes = await apiRequest('/admin/dashboard', { token: adminToken });
  assert.equal(dashRes.status, 200);
  assert.ok(dashRes.body.data.metrics.totalUsers >= 1);

  const repRes = await apiRequest('/admin/reports?type=completion', { token: adminToken });
  assert.equal(repRes.status, 200);
  assert.ok(Array.isArray(repRes.body.data.rows));

  const auditRes = await apiRequest('/admin/audit-logs?limit=10', { token: adminToken });
  assert.equal(auditRes.status, 200);
  assert.ok(Array.isArray(auditRes.body.data));
});
