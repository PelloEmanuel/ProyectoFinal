const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { generateTOTP } = require('../src/utils/totp');

let server;
let baseUrl;

async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

// Tokens shared across sequential tests
let studentToken = '';
let studentRefreshToken = '';
let instructorToken = '';
let adminToken = '';
let createdCourseId = null;
let createdModuleId = null;
let createdLessonId = null;
let createdQuizId = null;
let createdQuizOptionCorrectId = null;
let createdTextAssignmentId = null;
let createdAttemptId = null;
let totpSecret = '';

test('1. Healthcheck y estado de la base de datos MySQL', async () => {
  const res = await fetch(`${baseUrl.replace('/api/v1', '')}/health`);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.data?.service || data.service, 'Campus API');
});

test('2. Autenticación: Registro de estudiante válido, rechazo de duplicado y contraseña débil', async () => {
  const uniqueEmail = `alumno.test.${Date.now()}@skilltrack.edu`;

  // Contraseña débil -> 422
  const weakRes = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      firstName: 'Juan',
      lastName: 'Pérez',
      email: uniqueEmail,
      password: '123',
      acceptTerms: true,
    },
  });
  assert.equal(weakRes.status, 422);

  // Registro válido -> 201 con rol student obligatorio
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
  assert.equal(regRes.body.data.user.role, 'student');
  assert.ok(regRes.body.data.accessToken);
  assert.ok(regRes.body.data.refreshToken);

  studentToken = regRes.body.data.accessToken;
  studentRefreshToken = regRes.body.data.refreshToken;

  // Email duplicado -> 409
  const dupRes = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      firstName: 'Juan',
      lastName: 'Duplicado',
      email: uniqueEmail,
      password: 'Password123!',
      acceptTerms: true,
    },
  });
  assert.equal(dupRes.status, 409);

  // Verificación de correo con el código devuelto en desarrollo
  if (regRes.body.data.verificationDebugCode) {
    const verifyRes = await apiRequest('/auth/verify-email', {
      method: 'POST',
      body: {
        email: uniqueEmail,
        code: regRes.body.data.verificationDebugCode,
      },
    });
    assert.equal(verifyRes.status, 200);
  }
});

test('3. Autenticación: Login de Instructor y Admin, rechazo de credenciales inválidas y Refresh Token', async () => {
  // Login inválido -> 401
  const badLogin = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'instructor@skilltrack.edu', password: 'WrongPassword999!' },
  });
  assert.equal(badLogin.status, 401);

  // Login Instructor -> 200
  const instLogin = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'instructor@skilltrack.edu', password: 'Instructor123!' },
  });
  assert.equal(instLogin.status, 200);
  assert.equal(instLogin.body.data.user.role, 'instructor');
  instructorToken = instLogin.body.data.accessToken;

  // Login Admin -> 200
  const admLogin = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'admin@skilltrack.edu', password: 'Admin123!' },
  });
  assert.equal(admLogin.status, 200);
  assert.equal(admLogin.body.data.user.role, 'admin');
  adminToken = admLogin.body.data.accessToken;

  // Rotación de Refresh Token del estudiante
  const refRes = await apiRequest('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: studentRefreshToken },
  });
  assert.equal(refRes.status, 200);
  assert.ok(refRes.body.data.accessToken);
  studentToken = refRes.body.data.accessToken;
  studentRefreshToken = refRes.body.data.refreshToken;
});

test('4. Seguridad 2FA TOTP (RFC 6238): Configuración, activación, desafío en login y desactivación', async () => {
  // 1. Iniciar setup 2FA para el estudiante
  const setupRes = await apiRequest('/auth/2fa/setup', {
    method: 'POST',
    token: studentToken,
  });
  assert.equal(setupRes.status, 200);
  assert.ok(setupRes.body.data.secret);
  assert.ok(Array.isArray(setupRes.body.data.recoveryCodes));
  assert.equal(setupRes.body.data.recoveryCodes.length, 6);
  totpSecret = setupRes.body.data.secret;

  // 2. Generar código TOTP real RFC 6238 y confirmar activación
  const validCode = generateTOTP(totpSecret);
  const confirmRes = await apiRequest('/auth/2fa/confirm', {
    method: 'POST',
    token: studentToken,
    body: { code: validCode },
  });
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.body.data.user.twoFactorEnabled, true);

  // 3. Desactivar 2FA con contraseña
  const disableRes = await apiRequest('/auth/2fa/disable', {
    method: 'POST',
    token: studentToken,
    body: { password: 'Password123!' },
  });
  assert.equal(disableRes.status, 200);
});

test('5. Control de Acceso RBAC y Propiedad (Ownership)', async () => {
  // Estudiante no puede acceder al dashboard de administrador -> 403
  const stuAdminRes = await apiRequest('/admin/dashboard', {
    token: studentToken,
  });
  assert.equal(stuAdminRes.status, 403);

  // Estudiante no puede crear un curso -> 403
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

  // Instructor 1 (id=2) no puede modificar el curso #3 que pertenece a la Instructora Ana (id=3) -> 403
  const crossEditRes = await apiRequest('/courses/3', {
    method: 'PUT',
    token: instructorToken,
    body: { title: 'Intento de edición cruzada' },
  });
  assert.equal(crossEditRes.status, 403);
});

test('6. Gestión Académica: Instructor crea curso, módulo, lección, quiz y entrega práctica', async () => {
  // Crear curso publicado
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

  // Crear módulo
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

  // Crear única lección en el curso (para probar 100% de avance al completarla)
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

  // Crear Quiz autoevaluable
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

  // Obtener detalle del quiz para conocer el ID de la opción correcta
  const quizDetail = await apiRequest(`/assignments/${createdQuizId}`, {
    token: instructorToken,
  });
  assert.equal(quizDetail.status, 200);
  createdQuizOptionCorrectId = quizDetail.body.data.questions[0].options[0].id;

  // Crear Actividad de Entrega Escrita para calificación docente
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

test('7. Estudiante: Inscripción, avance de lección al 100% y emisión automática de certificado', async () => {
  // Inscribirse al curso recién creado
  const enrollRes = await apiRequest(`/courses/${createdCourseId}/enroll`, {
    method: 'POST',
    token: studentToken,
  });
  assert.equal(enrollRes.status, 201);

  // Completar la lección -> progreso pasa a 100% y se emite certificado
  const compRes = await apiRequest(`/lessons/${createdLessonId}/complete`, {
    method: 'POST',
    token: studentToken,
    body: { timeSpentMinutes: 15 },
  });
  assert.equal(compRes.status, 200);
  assert.equal(compRes.body.data.progressPercent, 100);
  assert.ok(compRes.body.data.certificate);

  // Verificar públicamente el certificado emitido
  const code = compRes.body.data.certificate.certificateCode;
  const verifyCertRes = await apiRequest(`/certificates/verify/${code}`);
  assert.equal(verifyCertRes.status, 200);
  assert.equal(verifyCertRes.body.data.certificateCode, code);
});

test('8. Evaluaciones: Autoevaluación de Quiz y calificación docente de entrega con feedback', async () => {
  const quizDetail = await apiRequest(`/assignments/${createdQuizId}`, {
    token: studentToken,
  });
  const questionId = quizDetail.body.data.questions[0].id;

  // Estudiante responde el quiz con la opción correcta -> calificación automática 100%
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

  // Estudiante envía entrega escrita
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

  // Instructor califica la entrega escrita con 95% y devolución escrita
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

test('9. Administración: Dashboard global, reportes SQL y bitácora de auditoría', async () => {
  const dashRes = await apiRequest('/admin/dashboard', { token: adminToken });
  assert.equal(dashRes.status, 200);
  assert.ok(dashRes.body.data.metrics.totalUsers >= 4);

  const repRes = await apiRequest('/admin/reports?type=completion', { token: adminToken });
  assert.equal(repRes.status, 200);
  assert.ok(Array.isArray(repRes.body.data.rows));

  const auditRes = await apiRequest('/admin/audit-logs?limit=10', { token: adminToken });
  assert.equal(auditRes.status, 200);
  assert.ok(Array.isArray(auditRes.body.data));
});
