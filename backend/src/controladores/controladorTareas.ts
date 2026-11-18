// Importa la conexión a la base de datos, el manejador de errores, la auditoría y los tipos del sistema.
import { Response } from 'express';
import db from '../configuracion/baseDatos';
import { AppError, asyncHandler } from '../utilidades/errores';
import { logAudit } from '../utilidades/auditoria';
import { SolicitudAutenticada, UsuarioAutenticado } from '../tipos';

// Normaliza fechas y horas de vencimiento al formato DATETIME compatible con MySQL / TiDB.
function formatDueAt(dueAt?: unknown, dueDate?: unknown, dueTime?: unknown): string | null {
  if (dueDate && String(dueDate).trim()) {
    let cleanDate = String(dueDate).trim();
    if (cleanDate.includes('/')) {
      const parts = cleanDate.split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        cleanDate = `${year}-${month}-${day}`;
      }
    }
    const time = dueTime && String(dueTime).trim() ? String(dueTime).trim() : '23:59';
    const timeFormatted = time.length === 5 ? `${time}:00` : time;
    return `${cleanDate} ${timeFormatted}`;
  }
  if (!dueAt) return null;
  const str = String(dueAt).trim();
  if (str.includes('/')) {
    const [dPart, tPart] = str.split(' ');
    const parts = dPart.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      const time = tPart || '23:59:00';
      return `${year}-${month}-${day} ${time.length === 5 ? `${time}:00` : time}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str} 23:59:00`;
  }
  if (str.includes('T')) {
    const [d, t] = str.split('T');
    const timePart = t.replace('Z', '').split('.')[0];
    const timeFormatted = timePart.length === 5 ? `${timePart}:00` : timePart || '23:59:00';
    return `${d} ${timeFormatted}`;
  }
  return str;
}

// Recupera una tarea desde la tabla tareas junto con el título e instructor de su curso.
async function getAssignmentOrFail(id: number | string | string[]): Promise<any> {
  const [rows] = await db.execute(
    `SELECT a.*, c.title AS course_title, c.instructor_id AS instructor_id
     FROM tareas a
     JOIN cursos c ON c.id = a.course_id
     WHERE a.id = ?`,
    [Number(id)]
  );
  if (!rows.length) throw new AppError('Actividad no encontrada', 404, 'ASSIGNMENT_NOT_FOUND');
  return rows[0];
}

// Verifica que el usuario sea administrador o el docente titular del curso al que pertenece la actividad.
function assertInstructorOwnerOrAdmin(user: UsuarioAutenticado, instructorId: number | null): void {
  if (user.role === 'admin') return;
  if (user.role === 'instructor' && Number(instructorId) === Number(user.id)) return;
  throw new AppError('No tenés autorización para administrar actividades de un curso ajeno', 403, 'FORBIDDEN_INSTRUCTOR');
}

// Lista todas las actividades de las materias en las que está inscrito el alumno con filtros de estado.
export const listMyAssignments = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const studentId = req.user!.id;
  const filter = String(req.query.filter || '');

  const [rows] = await db.execute(
    `SELECT a.id, a.course_id AS courseId, a.module_id AS moduleId, a.title, a.description,
            a.assignment_type AS assignmentType, a.max_score AS maxScore, a.passing_score AS passingScore,
            a.due_at AS dueAt, a.max_attempts AS maxAttempts, a.status, a.created_at AS createdAt,
            c.title AS courseTitle,
            (SELECT COUNT(*) FROM entregas_tareas att WHERE att.assignment_id = a.id AND att.student_id = ?) AS attemptsUsed,
            (SELECT att.id FROM entregas_tareas att WHERE att.assignment_id = a.id AND att.student_id = ? ORDER BY att.id DESC LIMIT 1) AS latestAttemptId,
            (SELECT att.status FROM entregas_tareas att WHERE att.assignment_id = a.id AND att.student_id = ? ORDER BY att.id DESC LIMIT 1) AS latestStatus,
            (SELECT att.score FROM entregas_tareas att WHERE att.assignment_id = a.id AND att.student_id = ? ORDER BY att.id DESC LIMIT 1) AS latestScore,
            (SELECT att.feedback FROM entregas_tareas att WHERE att.assignment_id = a.id AND att.student_id = ? ORDER BY att.id DESC LIMIT 1) AS latestFeedback,
            (SELECT att.graded_at FROM entregas_tareas att WHERE att.assignment_id = a.id AND att.student_id = ? ORDER BY att.id DESC LIMIT 1) AS gradedAt
     FROM tareas a
     JOIN inscripciones e ON e.course_id = a.course_id AND e.student_id = ?
     JOIN cursos c ON c.id = a.course_id
     WHERE a.status = 'published'
     ORDER BY a.due_at ASC, a.id DESC`,
    [studentId, studentId, studentId, studentId, studentId, studentId, studentId]
  );

  const now = new Date();
  const enriched = rows.map((r: any) => {
    const maxScore = Number(r.maxScore) || 100;
    const passingScore = Number(r.passingScore) || 60;
    const latestScore = r.latestScore !== null && r.latestScore !== undefined ? Number(r.latestScore) : null;
    const isOverdue = r.dueAt && new Date(r.dueAt) < now && (!r.latestStatus || r.latestStatus === 'in_progress');
    let deliveryState = 'pending';
    if (r.latestStatus === 'graded') deliveryState = 'graded';
    else if (r.latestStatus === 'submitted') deliveryState = 'submitted';
    else if (isOverdue) deliveryState = 'overdue';

    return {
      ...r,
      maxScore,
      passingScore,
      attemptsUsed: Number(r.attemptsUsed) || 0,
      latestScore,
      percentage: latestScore !== null ? Math.round((latestScore / maxScore) * 100) : null,
      passed: latestScore !== null ? latestScore >= passingScore : null,
      deliveryState,
    };
  });

  const filtered = enriched.filter((item: any) => {
    if (!filter) return true;
    if (filter === 'pending') return item.deliveryState === 'pending';
    if (filter === 'submitted') return item.deliveryState === 'submitted';
    if (filter === 'graded') return item.deliveryState === 'graded';
    if (filter === 'overdue') return item.deliveryState === 'overdue';
    if (filter === 'upcoming') return item.deliveryState === 'pending' && item.dueAt && new Date(item.dueAt) >= now;
    return true;
  });

  res.json({ success: true, data: filtered });
});

// Lista las actividades pertenecientes a un curso específico.
export const listCourseAssignments = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const courseId = Number(req.params.id);
  const [rows] = await db.execute(
    `SELECT id, course_id AS courseId, module_id AS moduleId, title, description, attachments,
            assignment_type AS assignmentType, max_score AS maxScore, passing_score AS passingScore,
            due_at AS dueAt, allow_late_submissions AS allowLateSubmissions, max_attempts AS maxAttempts, status, created_at AS createdAt
     FROM tareas
     WHERE course_id = ?
     ORDER BY due_at ASC, id ASC`,
    [courseId]
  );
  const formatted = rows.map((r: any) => ({
    ...r,
    allowLateSubmissions: r.allowLateSubmissions !== 0 && r.allowLateSubmissions !== false,
    attachments: r.attachments
      ? typeof r.attachments === 'string'
        ? JSON.parse(r.attachments)
        : r.attachments
      : [],
  }));
  res.json({ success: true, data: formatted });
});

// Obtiene el detalle completo de una actividad ocultando respuestas correctas a los estudiantes.
export const getAssignment = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const a = await getAssignmentOrFail(req.params.id);
  const isOwnerOrAdmin =
    req.user!.role === 'admin' || (req.user!.role === 'instructor' && Number(a.instructor_id) === Number(req.user!.id));

  if (!isOwnerOrAdmin) {
    const [enr] = await db.execute('SELECT id FROM inscripciones WHERE course_id = ? AND student_id = ?', [
      a.course_id,
      req.user!.id,
    ]);
    if (!enr.length) {
      throw new AppError('Debés estar inscrito en el curso para acceder a esta actividad', 403, 'NOT_ENROLLED');
    }
  }

  const [questions] = await db.execute(
    'SELECT id, assignment_id AS assignmentId, question_type AS questionType, prompt, expected_answer, points, position FROM preguntas WHERE assignment_id = ? ORDER BY position ASC, id ASC',
    [a.id]
  );

  const [options] = await db.execute(
    `SELECT qo.id, qo.question_id AS questionId, qo.option_text AS optionText, qo.is_correct, qo.position
     FROM opciones_preguntas qo
     JOIN preguntas q ON q.id = qo.question_id
     WHERE q.assignment_id = ?
     ORDER BY qo.position ASC, qo.id ASC`,
    [a.id]
  );

  const [rubricRows] = await db.execute('SELECT id, title FROM rubricas WHERE assignment_id = ?', [a.id]);
  let rubric: any = null;
  if (rubricRows.length) {
    const [criteria] = await db.execute(
      'SELECT id, title, description, max_points AS maxPoints, position FROM criterios_rubrica WHERE rubric_id = ? ORDER BY position ASC',
      [rubricRows[0].id]
    );
    rubric = { id: rubricRows[0].id, title: rubricRows[0].title, criteria };
  }

  const [attempts] = await db.execute(
    `SELECT id, attempt_number AS attemptNumber, started_at AS startedAt, submitted_at AS submittedAt,
            status, is_late, attachments, submission_text AS submissionText, score, feedback, graded_at AS gradedAt
     FROM entregas_tareas
     WHERE assignment_id = ? AND student_id = ?
     ORDER BY attempt_number DESC`,
    [a.id, req.user!.id]
  );

  const safeQuestions = questions.map((q: any) => ({
    id: q.id,
    assignmentId: q.assignmentId,
    questionType: q.questionType,
    prompt: q.prompt,
    points: Number(q.points),
    position: q.position,
    ...(isOwnerOrAdmin && { expectedAnswer: q.expected_answer }),
    options: options
      .filter((o: any) => o.questionId === q.id)
      .map((o: any) => ({
        id: o.id,
        questionId: o.questionId,
        optionText: o.optionText,
        position: o.position,
        ...(isOwnerOrAdmin && { isCorrect: !!o.is_correct }),
      })),
  }));

  const detail = {
    id: a.id,
    courseId: a.course_id,
    courseTitle: a.course_title,
    moduleId: a.module_id,
    title: a.title,
    description: a.description,
    assignmentType: a.assignment_type,
    maxScore: Number(a.max_score),
    passingScore: Number(a.passing_score),
    dueAt: a.due_at,
    allowLateSubmissions: a.allow_late_submissions !== 0 && a.allow_late_submissions !== false,
    maxAttempts: Number(a.max_attempts),
    status: a.status,
    questions: safeQuestions,
    rubric,
    attachments: a.attachments
      ? typeof a.attachments === 'string'
        ? JSON.parse(a.attachments)
        : a.attachments
      : [],
    myAttempts: attempts.map((att: any) => ({
      ...att,
      isLate: att.is_late === 1,
      attachments: att.attachments
        ? typeof att.attachments === 'string'
          ? JSON.parse(att.attachments)
          : att.attachments
        : [],
      score: att.score !== null ? Number(att.score) : null,
      passed: att.score !== null ? Number(att.score) >= Number(a.passing_score) : null,
    })),
  };

  res.json({ success: true, data: detail, ...detail });
});

// Crea una nueva actividad académica con sus preguntas, opciones y rúbrica dentro de una transacción.
export const createAssignment = asyncHandler(async (req: SolicitudAutenticada, res: Response, next) => {
  const courseId = Number(req.params.id || req.body.courseId);
  const [cRows] = await db.execute('SELECT * FROM cursos WHERE id = ?', [courseId]);
  if (!cRows.length) throw new AppError('Curso no encontrado', 404);
  assertInstructorOwnerOrAdmin(req.user!, cRows[0].instructor_id);

  const {
    moduleId = null,
    title,
    description,
    instructions,
    assignmentType: rawType = 'file_submission',
    attachments = [],
    maxScore = 100,
    dueAt = null,
    dueDate = null,
    dueTime = null,
    allowLateSubmissions = true,
    maxAttempts = 2,
    status = 'published',
    questions = [],
    rubric = null,
  } = req.body;

  const validTypes = ['multiple_choice', 'true_false', 'short_answer', 'text_submission', 'file_submission'];
  const assignmentType =
    rawType === 'quiz' ? 'multiple_choice' : validTypes.includes(rawType) ? rawType : 'file_submission';
  const finalDescription = String(description || instructions || title || 'Actividad evaluativa').trim();
  const attachmentsJson = Array.isArray(attachments) ? JSON.stringify(attachments) : null;
  const finalDueAt = formatDueAt(dueAt, dueDate, dueTime);
  const allowLate =
    allowLateSubmissions === true ||
    allowLateSubmissions === 1 ||
    allowLateSubmissions === '1' ||
    allowLateSubmissions === 'true';

  let finalPassingScore =
    req.body.passingScore !== undefined && req.body.passingScore !== null ? Number(req.body.passingScore) : null;
  if (finalPassingScore === null || isNaN(finalPassingScore)) {
    try {
      const [psRows] = await db.execute(
        "SELECT setting_value FROM ajustes_plataforma WHERE setting_key = 'default_passing_score' LIMIT 1"
      );
      if (psRows.length > 0 && psRows[0].setting_value) {
        finalPassingScore = Number(psRows[0].setting_value) || 60;
      } else {
        finalPassingScore = 60;
      }
    } catch {
      finalPassingScore = 60;
    }
  }

  const createdId = await db.withTransaction(async (conn) => {
    const [ins]: any = await conn.execute(
      `INSERT INTO tareas (course_id, module_id, title, description, attachments, assignment_type, max_score, passing_score, due_at, allow_late_submissions, max_attempts, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        courseId,
        moduleId ? Number(moduleId) : null,
        String(title).trim(),
        finalDescription,
        attachmentsJson,
        assignmentType,
        Number(maxScore) || 100,
        finalPassingScore,
        finalDueAt || null,
        allowLate ? 1 : 0,
        Number(maxAttempts) || 2,
        status,
      ]
    );

    if (Array.isArray(questions)) {
      let qPos = 1;
      for (const q of questions) {
        const [qIns]: any = await conn.execute(
          'INSERT INTO preguntas (assignment_id, question_type, prompt, expected_answer, points, position) VALUES (?, ?, ?, ?, ?, ?)',
          [
            ins.insertId,
            q.questionType ||
              (assignmentType === 'true_false'
                ? 'true_false'
                : assignmentType === 'short_answer'
                ? 'short_answer'
                : 'multiple_choice'),
            String(q.prompt).trim(),
            q.expectedAnswer ? String(q.expectedAnswer).trim() : null,
            Number(q.points) || 25,
            qPos++,
          ]
        );
        if (Array.isArray(q.options)) {
          let oPos = 1;
          for (const opt of q.options) {
            await conn.execute(
              'INSERT INTO opciones_preguntas (question_id, option_text, is_correct, position) VALUES (?, ?, ?, ?)',
              [qIns.insertId, String(opt.optionText).trim(), opt.isCorrect ? 1 : 0, oPos++]
            );
          }
        }
      }
    }

    if (rubric && rubric.title && Array.isArray(rubric.criteria)) {
      const [rIns]: any = await conn.execute('INSERT INTO rubricas (assignment_id, title) VALUES (?, ?)', [
        ins.insertId,
        String(rubric.title).trim(),
      ]);
      let cPos = 1;
      for (const crit of rubric.criteria) {
        await conn.execute(
          'INSERT INTO criterios_rubrica (rubric_id, title, description, max_points, position) VALUES (?, ?, ?, ?, ?)',
          [rIns.insertId, String(crit.title).trim(), crit.description || '', Number(crit.maxPoints) || 25, cPos++]
        );
      }
    }

    return ins.insertId;
  });

  await logAudit(req.user!.id, 'ASSIGNMENT_CREATED', 'assignment', createdId, { courseId, title });
  req.params.id = String(createdId);
  res.status(201);
  return getAssignment(req, res, next);
});

// Actualiza los datos, plazos y archivos adjuntos de una actividad existente.
export const updateAssignment = asyncHandler(async (req: SolicitudAutenticada, res: Response, next) => {
  const a = await getAssignmentOrFail(req.params.id);
  assertInstructorOwnerOrAdmin(req.user!, a.instructor_id);

  const map: Record<string, string> = {
    title: 'title',
    description: 'description',
    assignmentType: 'assignment_type',
    maxScore: 'max_score',
    passingScore: 'passing_score',
    maxAttempts: 'max_attempts',
    status: 'status',
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(req.body[k]);
    }
  }
  if (req.body.dueAt !== undefined || req.body.dueDate !== undefined) {
    const finalDue = formatDueAt(req.body.dueAt, req.body.dueDate, req.body.dueTime);
    sets.push('due_at = ?');
    vals.push(finalDue);
  }
  if (req.body.allowLateSubmissions !== undefined) {
    const allowLate =
      req.body.allowLateSubmissions === true ||
      req.body.allowLateSubmissions === 1 ||
      req.body.allowLateSubmissions === '1' ||
      req.body.allowLateSubmissions === 'true';
    sets.push('allow_late_submissions = ?');
    vals.push(allowLate ? 1 : 0);
  }
  if (req.body.attachments !== undefined) {
    sets.push('attachments = ?');
    vals.push(Array.isArray(req.body.attachments) ? JSON.stringify(req.body.attachments) : null);
  }
  if (sets.length) {
    await db.execute(`UPDATE tareas SET ${sets.join(', ')} WHERE id = ?`, [...vals, a.id]);
  }
  return getAssignment(req, res, next);
});

// Elimina una actividad de la tabla tareas verificando la propiedad del curso.
export const deleteAssignment = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const a = await getAssignmentOrFail(req.params.id);
  assertInstructorOwnerOrAdmin(req.user!, a.instructor_id);
  await db.execute('DELETE FROM tareas WHERE id = ?', [a.id]);
  res.status(204).end();
});

// Inicia o retoma un intento de resolución de actividad para el estudiante autenticado.
export const startAttempt = asyncHandler(async (req: SolicitudAutenticada, res: Response, next) => {
  const a = await getAssignmentOrFail(req.params.id);
  if (a.status !== 'published') {
    throw new AppError('Esta actividad se encuentra cerrada y no admite nuevas entregas', 400, 'ASSIGNMENT_CLOSED');
  }
  const isPastDue = a.due_at && new Date(a.due_at) < new Date();
  if (isPastDue && !a.allow_late_submissions) {
    throw new AppError(
      'La fecha límite de entrega para esta actividad ya ha vencido y el profesor no permite entregas fuera de término.',
      400,
      'ASSIGNMENT_OVERDUE'
    );
  }

  const [enr] = await db.execute('SELECT id FROM inscripciones WHERE course_id = ? AND student_id = ?', [
    a.course_id,
    req.user!.id,
  ]);
  if (!enr.length) {
    throw new AppError('Debés inscribirte en el curso antes de realizar sus actividades', 403, 'NOT_ENROLLED');
  }

  const [prevAttempts] = await db.execute(
    'SELECT * FROM entregas_tareas WHERE assignment_id = ? AND student_id = ? ORDER BY attempt_number DESC',
    [a.id, req.user!.id]
  );

  const inProgress = prevAttempts.find((att: any) => att.status === 'in_progress');
  if (inProgress) {
    if (req.body && (Array.isArray(req.body.answers) || req.body.submissionText !== undefined)) {
      req.params.id = String(inProgress.id);
      res.status(201);
      return submitAttempt(req, res, next);
    }
    return res.json({ success: true, data: inProgress });
  }

  if (prevAttempts.length >= Number(a.max_attempts)) {
    throw new AppError(
      `Ya alcanzaste el límite máximo de ${a.max_attempts} intento(s) para esta actividad`,
      400,
      'MAX_ATTEMPTS_REACHED'
    );
  }

  const nextNumber = prevAttempts.length + 1;
  const [ins] = await db.execute(
    "INSERT INTO entregas_tareas (assignment_id, student_id, attempt_number, status, started_at) VALUES (?, ?, ?, 'in_progress', NOW())",
    [a.id, req.user!.id, nextNumber]
  );

  if (req.body && (Array.isArray(req.body.answers) || req.body.submissionText !== undefined)) {
    req.params.id = String(ins.insertId);
    res.status(201);
    return submitAttempt(req, res, next);
  }

  const [[created]] = await db.execute('SELECT * FROM entregas_tareas WHERE id = ?', [ins.insertId]);
  res.status(201).json({ success: true, data: created });
});

// Obtiene el detalle completo de una entrega junto con sus respuestas y archivos adjuntos.
export const getAttempt = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const [rows] = await db.execute(
    `SELECT att.*, a.title AS assignmentTitle, a.max_score AS maxScore, a.passing_score AS passingScore,
            a.assignment_type AS assignmentType, a.course_id AS courseId, c.title AS courseTitle,
            c.instructor_id AS instructorId,
            CONCAT(stu.first_name, ' ', stu.last_name) AS studentName, stu.email AS studentEmail
     FROM entregas_tareas att
     JOIN tareas a ON a.id = att.assignment_id
     JOIN cursos c ON c.id = a.course_id
     JOIN usuarios stu ON stu.id = att.student_id
     WHERE att.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Entrega no encontrada', 404);
  const att = rows[0];

  const isAllowed =
    req.user!.role === 'admin' ||
    Number(att.student_id) === Number(req.user!.id) ||
    (req.user!.role === 'instructor' && Number(att.instructorId) === Number(req.user!.id));

  if (!isAllowed) {
    throw new AppError('No tenés autorización para consultar una entrega privada ajena', 403, 'FORBIDDEN_ATTEMPT');
  }

  const [answers] = await db.execute(
    `SELECT aa.id, aa.question_id AS questionId, aa.answer_text AS answerText,
            aa.selected_option_id AS selectedOptionId, aa.awarded_points AS awardedPoints,
            q.prompt, q.points AS maxPoints, qo.option_text AS selectedOptionText
     FROM respuestas_intentos aa
     JOIN preguntas q ON q.id = aa.question_id
     LEFT JOIN opciones_preguntas qo ON qo.id = aa.selected_option_id
     WHERE aa.attempt_id = ?`,
    [att.id]
  );

  const [files] = await db.execute(
    'SELECT id, file_name AS fileName, mime_type AS mimeType, file_size AS fileSize, file_url AS fileUrl FROM archivos_tareas WHERE attempt_id = ?',
    [att.id]
  );

  const parsedAttachments = att.attachments
    ? typeof att.attachments === 'string'
      ? JSON.parse(att.attachments)
      : att.attachments
    : [];

  res.json({
    success: true,
    data: {
      ...att,
      isLate: att.is_late === 1,
      score: att.score !== null ? Number(att.score) : null,
      maxScore: Number(att.maxScore),
      passingScore: Number(att.passingScore),
      passed: att.score !== null ? Number(att.score) >= Number(att.passingScore) : null,
      attachments: parsedAttachments,
      answers,
      files,
    },
  });
});

// Guarda un borrador parcial de respuestas para un intento que aún está en curso.
export const saveAttemptAnswers = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const [rows] = await db.execute('SELECT * FROM entregas_tareas WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new AppError('Intento no encontrado', 404);
  const att = rows[0];

  if (Number(att.student_id) !== Number(req.user!.id)) {
    throw new AppError('No podés modificar un intento de otro estudiante', 403);
  }
  if (att.status !== 'in_progress') {
    throw new AppError('Este intento ya fue entregado y no puede modificarse', 400);
  }

  const { answers = [], submissionText } = req.body;
  await db.withTransaction(async (conn) => {
    if (submissionText !== undefined) {
      await conn.execute('UPDATE entregas_tareas SET submission_text = ? WHERE id = ?', [submissionText, att.id]);
    }
    if (Array.isArray(answers)) {
      for (const ans of answers) {
        await conn.execute(
          `INSERT INTO respuestas_intentos (attempt_id, question_id, answer_text, selected_option_id)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text), selected_option_id = VALUES(selected_option_id)`,
          [att.id, Number(ans.questionId), ans.answerText || null, ans.selectedOptionId ? Number(ans.selectedOptionId) : null]
        );
      }
    }
  });

  res.json({ success: true, message: 'Borrador de respuestas guardado' });
});

// Envía definitivamente la entrega de una actividad ejecutando autocorrección si es un cuestionario objetivo.
export const submitAttempt = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const [rows] = await db.execute('SELECT * FROM entregas_tareas WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new AppError('Intento no encontrado', 404);
  const att = rows[0];

  if (Number(att.student_id) !== Number(req.user!.id)) {
    throw new AppError('No podés enviar un intento de otro estudiante', 403);
  }
  if (att.status !== 'in_progress') {
    throw new AppError('Esta entrega ya fue enviada anteriormente', 400, 'ALREADY_SUBMITTED');
  }

  const a = await getAssignmentOrFail(att.assignment_id);
  if (a.status !== 'published') {
    throw new AppError('La actividad se encuentra cerrada', 400);
  }
  const now = new Date();
  const isPastDue = a.due_at && new Date(a.due_at) < now;
  if (isPastDue && !a.allow_late_submissions) {
    throw new AppError(
      'El plazo de entrega para esta actividad venció y el profesor no permite entregas fuera de término.',
      400,
      'ASSIGNMENT_OVERDUE_LATE_FORBIDDEN'
    );
  }

  const { answers = [], submissionText, attachments = [], fileAttachment } = req.body;

  const result = await db.withTransaction(async (conn) => {
    const finalText = submissionText !== undefined ? String(submissionText).trim() : att.submission_text;
    const finalAttachments = Array.isArray(attachments) ? [...attachments] : [];

    if (Array.isArray(answers) && answers.length > 0) {
      for (const ans of answers) {
        await conn.execute(
          `INSERT INTO respuestas_intentos (attempt_id, question_id, answer_text, selected_option_id)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text), selected_option_id = VALUES(selected_option_id)`,
          [att.id, Number(ans.questionId), ans.answerText || null, ans.selectedOptionId ? Number(ans.selectedOptionId) : null]
        );
      }
    }

    if (fileAttachment && fileAttachment.fileName && fileAttachment.fileUrl) {
      finalAttachments.push({
        id: fileAttachment.id || `att-${Date.now()}`,
        name: fileAttachment.fileName,
        url: fileAttachment.fileUrl,
        type: fileAttachment.mimeType || 'application/octet-stream',
        size: Number(fileAttachment.fileSize) || 1024,
        kind: 'file',
      });
      const safeName = String(fileAttachment.fileName)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 180);
      await conn.execute(
        'INSERT INTO archivos_tareas (attempt_id, file_name, mime_type, file_size, file_url) VALUES (?, ?, ?, ?, ?)',
        [
          att.id,
          safeName,
          fileAttachment.mimeType || 'application/octet-stream',
          Number(fileAttachment.fileSize) || 1024,
          String(fileAttachment.fileUrl).trim(),
        ]
      );
    }

    const attachmentsJson = finalAttachments.length > 0 ? JSON.stringify(finalAttachments) : null;
    const isLate = isPastDue ? 1 : 0;

    // Evalúa automáticamente las respuestas cuando el tipo de tarea es de opción múltiple, verdadero/falso o respuesta corta.
    const isAutoGradable = ['multiple_choice', 'true_false', 'short_answer'].includes(a.assignment_type);
    if (isAutoGradable) {
      const [questions]: any = await conn.execute('SELECT * FROM preguntas WHERE assignment_id = ?', [a.id]);
      const [savedAnswers]: any = await conn.execute('SELECT * FROM respuestas_intentos WHERE attempt_id = ?', [att.id]);
      let totalScore = 0;

      for (const q of questions) {
        const stuAns = savedAnswers.find((sa: any) => Number(sa.question_id) === Number(q.id));
        let awarded = 0;
        if (stuAns) {
          if (q.question_type === 'short_answer' && q.expected_answer) {
            const expected = String(q.expected_answer).trim().toLowerCase();
            const given = String(stuAns.answer_text || '').trim().toLowerCase();
            if (given === expected) awarded = Number(q.points);
          } else if (stuAns.selected_option_id) {
            const [optRows]: any = await conn.execute(
              'SELECT is_correct FROM opciones_preguntas WHERE id = ? AND question_id = ?',
              [stuAns.selected_option_id, q.id]
            );
            if (optRows[0]?.is_correct) awarded = Number(q.points);
          }
          await conn.execute('UPDATE respuestas_intentos SET awarded_points = ? WHERE id = ?', [awarded, stuAns.id]);
        }
        totalScore += awarded;
      }

      const feedback =
        totalScore >= Number(a.passing_score)
          ? '¡Evaluación aprobada! Revisá el detalle de tus respuestas.'
          : 'No alcanzaste el puntaje mínimo de aprobación. Podés repasar las lecciones e intentar nuevamente si te quedan intentos.';

      await conn.execute(
        `UPDATE entregas_tareas
         SET submitted_at = NOW(), status = 'graded', submission_text = ?, attachments = ?, is_late = ?, score = ?, feedback = ?, graded_at = NOW()
         WHERE id = ?`,
        [finalText, attachmentsJson, isLate, totalScore, feedback, att.id]
      );

      return {
        status: 'graded',
        score: totalScore,
        maxScore: Number(a.max_score),
        passed: totalScore >= Number(a.passing_score),
        feedback,
        isLate: isLate === 1,
      };
    } else {
      await conn.execute(
        "UPDATE entregas_tareas SET submitted_at = NOW(), status = 'submitted', submission_text = ?, attachments = ?, is_late = ? WHERE id = ?",
        [finalText, attachmentsJson, isLate, att.id]
      );
      if (a.instructor_id) {
        await conn.execute(
          `INSERT INTO notificaciones (user_id, type, title, body, resource_type, resource_id)
           VALUES (?, 'submission_received', 'Nueva entrega para corregir', ?, 'attempt', ?)`,
          [a.instructor_id, `${req.user!.name} entregó "${a.title}".`, att.id]
        );
      }
      return { status: 'submitted', score: null, maxScore: Number(a.max_score), passed: null, feedback: null };
    }
  });

  await logAudit(req.user!.id, 'ASSIGNMENT_SUBMITTED', 'attempt', att.id, {
    assignmentId: a.id,
    status: result.status,
  });
  const statusCode = res.statusCode === 201 ? 201 : 200;
  res.status(statusCode).json({
    success: true,
    message:
      result.status === 'graded'
        ? `Evaluación completada. Puntaje: ${result.score}/${result.maxScore}`
        : 'Entrega enviada correctamente. El docente recibirá una notificación para evaluarla.',
    data: { id: att.id, attemptId: att.id, ...result },
  });
});

// Lista todas las materias a cargo del docente autenticado con sus horarios y contadores.
export const listInstructorCourses = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const instructorId = req.user!.id;
  const isAdminOrPreceptor = req.user!.role === 'admin' || req.user!.role === 'preceptor';
  const filterSql = isAdminOrPreceptor ? '1=1' : 'c.instructor_id = ?';
  const filterParams = isAdminOrPreceptor ? [] : [instructorId];

  const [courses] = await db.execute(
    `SELECT c.id, c.title, c.short_description AS shortDescription, c.short_description AS summary,
            c.description, c.category_id AS categoryId, c.status, c.level,
            c.school_year AS schoolYear, c.course_division AS courseDivision,
            c.estimated_duration AS estimatedDuration, c.estimated_duration AS estimatedHours,
            cat.name AS categoryName,
            (SELECT COUNT(DISTINCT stu.id) 
             FROM usuarios stu 
             LEFT JOIN inscripciones e ON e.student_id = stu.id AND e.course_id = c.id
             WHERE (e.id IS NOT NULL OR (stu.school_year = c.school_year AND stu.course_division = c.course_division))
               AND stu.role_id = 3 AND stu.deleted_at IS NULL) AS studentsCount,
            (SELECT COUNT(DISTINCT stu.id) 
             FROM usuarios stu 
             LEFT JOIN inscripciones e ON e.student_id = stu.id AND e.course_id = c.id
             WHERE (e.id IS NOT NULL OR (stu.school_year = c.school_year AND stu.course_division = c.course_division))
               AND stu.role_id = 3 AND stu.deleted_at IS NULL) AS enrolledCount,
            (SELECT COUNT(*) FROM modulos m WHERE m.course_id = c.id) AS modulesCount,
            (SELECT COUNT(*) FROM lecciones l JOIN modulos m ON m.id = l.module_id WHERE m.course_id = c.id) AS lessonsCount,
            (SELECT COUNT(*) FROM tareas a WHERE a.course_id = c.id) AS assignmentsCount,
            (SELECT COUNT(*) FROM entregas_tareas att JOIN tareas a ON a.id = att.assignment_id WHERE a.course_id = c.id AND att.status = 'submitted') AS pendingSubmissionsCount,
            (SELECT COUNT(*) FROM comentarios_tablon fc JOIN usuarios u ON u.id = fc.user_id WHERE fc.course_id = c.id AND u.role_id = 3 AND fc.read_by_instructor = 0) AS unreadCommentsCount,
            (SELECT COUNT(*) FROM comentarios_tablon fc JOIN usuarios u ON u.id = fc.user_id WHERE fc.course_id = c.id AND u.role_id = 3) AS studentCommentsCount
     FROM cursos c
     LEFT JOIN categorias cat ON cat.id = c.category_id
     WHERE ${filterSql}
     ORDER BY c.school_year ASC, c.course_division ASC, c.title ASC`,
    filterParams
  );

  const courseIds = courses.map((c: any) => c.id);
  const schedulesByCourse: Record<number, any[]> = {};
  if (courseIds.length > 0) {
    const [schedRows] = await db.query(
      `SELECT id, course_id AS courseId, school_year AS schoolYear, course_division AS courseDivision,
              day_of_week AS dayOfWeek, start_time AS startTime, end_time AS endTime, classroom
       FROM horarios_curso
       WHERE course_id IN (${courseIds.map(() => '?').join(',')})
       ORDER BY FIELD(day_of_week, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'), start_time ASC`,
      courseIds
    );
    for (const s of schedRows) {
      if (!schedulesByCourse[s.courseId]) schedulesByCourse[s.courseId] = [];
      schedulesByCourse[s.courseId].push(s);
    }
  }

  res.json({
    success: true,
    data: courses.map((c: any) => ({
      ...c,
      schoolYear: Number(c.schoolYear) || 1,
      courseDivision: Number(c.courseDivision) || 1,
      schoolGroupLabel: `${Number(c.schoolYear) || 1}° Año - ${Number(c.courseDivision) || 1}° Curso`,
      unreadCommentsCount: Number(c.unreadCommentsCount) || 0,
      studentCommentsCount: Number(c.studentCommentsCount) || 0,
      schedules: schedulesByCourse[c.id] || [],
    })),
  });
});

// Construye y devuelve el panel de control del docente con métricas, horarios y entregas pendientes.
export const instructorDashboard = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const instructorId = req.user!.id;
  const isAdminOrPreceptor = req.user!.role === 'admin' || req.user!.role === 'preceptor';
  const filterSql = isAdminOrPreceptor ? '1=1' : 'c.instructor_id = ?';
  const filterParams = isAdminOrPreceptor ? [] : [instructorId];

  const [courses] = await db.execute(
    `SELECT c.id, c.title, c.short_description AS summary, c.status, c.level,
            c.school_year AS schoolYear, c.course_division AS courseDivision,
            c.estimated_duration AS estimatedDuration,
            cat.name AS categoryName,
            (SELECT COUNT(DISTINCT stu.id) 
             FROM usuarios stu 
             LEFT JOIN inscripciones e ON e.student_id = stu.id AND e.course_id = c.id
             WHERE (e.id IS NOT NULL OR (stu.school_year = c.school_year AND stu.course_division = c.course_division))
               AND stu.role_id = 3 AND stu.deleted_at IS NULL) AS studentsCount,
            (SELECT COUNT(*) FROM modulos m WHERE m.course_id = c.id) AS modulesCount,
            (SELECT COUNT(*) FROM lecciones l JOIN modulos m ON m.id = l.module_id WHERE m.course_id = c.id) AS lessonsCount,
            (SELECT COUNT(*) FROM tareas a WHERE a.course_id = c.id) AS assignmentsCount,
            (SELECT COUNT(*) FROM comentarios_tablon fc JOIN usuarios u ON u.id = fc.user_id WHERE fc.course_id = c.id AND u.role_id = 3 AND fc.read_by_instructor = 0) AS unreadCommentsCount,
            (SELECT COUNT(*) FROM comentarios_tablon fc JOIN usuarios u ON u.id = fc.user_id WHERE fc.course_id = c.id AND u.role_id = 3) AS studentCommentsCount
     FROM cursos c
     LEFT JOIN categorias cat ON cat.id = c.category_id
     WHERE ${filterSql}
     ORDER BY c.school_year ASC, c.course_division ASC, c.title ASC`,
    filterParams
  );

  const courseIds = courses.map((c: any) => c.id);
  const schedulesByCourse: Record<number, any[]> = {};
  let mySchedule: any[] = [];
  if (courseIds.length > 0) {
    const [schedRows] = await db.query(
      `SELECT cs.id, cs.course_id AS courseId, cs.school_year AS schoolYear, cs.course_division AS courseDivision,
              cs.day_of_week AS dayOfWeek, cs.start_time AS startTime, cs.end_time AS endTime, cs.classroom,
              c.title AS courseTitle
       FROM horarios_curso cs
       JOIN cursos c ON c.id = cs.course_id
       WHERE cs.course_id IN (${courseIds.map(() => '?').join(',')})
       ORDER BY FIELD(cs.day_of_week, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'), cs.start_time ASC`,
      courseIds
    );
    mySchedule = schedRows;
    for (const s of schedRows) {
      if (!schedulesByCourse[s.courseId]) schedulesByCourse[s.courseId] = [];
      schedulesByCourse[s.courseId].push(s);
    }
  }

  const [pendingSubmissions] = await db.execute(
    `SELECT att.id AS attemptId, att.submitted_at AS submittedAt, att.attempt_number AS attemptNumber,
            a.id AS assignmentId, a.title AS assignmentTitle, a.max_score AS maxScore,
            c.id AS courseId, c.title AS courseTitle,
            c.school_year AS schoolYear, c.course_division AS courseDivision,
            CONCAT(stu.first_name, ' ', stu.last_name) AS studentName, stu.email AS studentEmail
     FROM entregas_tareas att
     JOIN tareas a ON a.id = att.assignment_id
     JOIN cursos c ON c.id = a.course_id
     JOIN usuarios stu ON stu.id = att.student_id
     WHERE (${filterSql}) AND att.status = 'submitted'
     ORDER BY att.submitted_at ASC`,
    filterParams
  );

  const [[avgRow]] = await db.execute(
    `SELECT AVG(att.score) AS avgScore, COUNT(att.id) AS gradedCount
     FROM entregas_tareas att
     JOIN tareas a ON a.id = att.assignment_id
     JOIN cursos c ON c.id = a.course_id
     WHERE (${filterSql}) AND att.status = 'graded' AND att.score IS NOT NULL`,
    filterParams
  );

  const publishedCourses = courses.filter((c: any) => c.status === 'published').length;
  const draftCourses = courses.filter((c: any) => c.status === 'draft').length;

  const studentCountParams = isAdminOrPreceptor ? [] : [instructorId, instructorId];
  const studentCountSql = isAdminOrPreceptor
    ? `SELECT COUNT(DISTINCT stu_id) AS totalStudents
       FROM (
         SELECT e.student_id AS stu_id FROM inscripciones e
         UNION
         SELECT u.id AS stu_id FROM usuarios u WHERE u.role_id = 3 AND u.deleted_at IS NULL
       ) AS assigned_students`
    : `SELECT COUNT(DISTINCT stu_id) AS totalStudents
       FROM (
         SELECT e.student_id AS stu_id
         FROM inscripciones e
         JOIN cursos c ON c.id = e.course_id
         WHERE c.instructor_id = ?
         UNION
         SELECT u.id AS stu_id
         FROM usuarios u
         JOIN cursos c ON c.school_year = u.school_year AND c.course_division = u.course_division
         WHERE c.instructor_id = ? AND u.role_id = 3 AND u.deleted_at IS NULL
       ) AS assigned_students`;

  const [studentCountRows] = await db.execute(studentCountSql, studentCountParams);
  const totalStudents = Number(studentCountRows[0]?.totalStudents || 0);

  const summaryObj = {
    totalCourses: courses.length,
    publishedCourses,
    draftCourses,
    totalStudents,
    pendingSubmissionsCount: pendingSubmissions.length,
    averageScore: Number(avgRow.gradedCount) > 0 ? Number(Number(avgRow.avgScore).toFixed(1)) : null,
  };

  const enrichedCourses = courses.map((c: any) => ({
    ...c,
    schoolYear: Number(c.schoolYear) || 1,
    courseDivision: Number(c.courseDivision) || 1,
    schoolGroupLabel: `${Number(c.schoolYear) || 1}° Año - ${Number(c.courseDivision) || 1}° Curso`,
    enrolledCount: Number(c.studentsCount) || 0,
    studentsCount: Number(c.studentsCount) || 0,
    modulesCount: Number(c.modulesCount) || 0,
    lessonsCount: Number(c.lessonsCount) || 0,
    assignmentsCount: Number(c.assignmentsCount) || 0,
    unreadCommentsCount: Number(c.unreadCommentsCount) || 0,
    studentCommentsCount: Number(c.studentCommentsCount) || 0,
    schedules: schedulesByCourse[c.id] || [],
  }));

  res.json({
    success: true,
    data: {
      summary: summaryObj,
      metrics: summaryObj,
      courses: enrichedCourses,
      recentCourses: enrichedCourses,
      mySchedule,
      pendingSubmissions,
    },
  });
});

// Lista de forma unificada a los estudiantes inscritos en los cursos del docente sin duplicar filas por alumno.
export const listInstructorStudents = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const isAdminOrPreceptor = req.user!.role === 'admin' || req.user!.role === 'preceptor';
  const { q, courseId, schoolYear, courseDivision } = req.query;

  let querySql = '';
  const params: unknown[] = [];

  if (isAdminOrPreceptor) {
    const where = ['stu.role_id = 3'];

    if (courseId) {
      where.push('c.id = ?');
      params.push(Number(courseId));
    }
    if (schoolYear) {
      where.push('(stu.school_year = ? OR c.school_year = ?)');
      params.push(Number(schoolYear), Number(schoolYear));
    }
    if (courseDivision) {
      where.push('(stu.course_division = ? OR c.course_division = ?)');
      params.push(Number(courseDivision), Number(courseDivision));
    }
    const searchTerm = q || req.query.search;
    if (searchTerm) {
      where.push('(stu.first_name LIKE ? OR stu.last_name LIKE ? OR stu.email LIKE ? OR c.title LIKE ?)');
      params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
    }

    querySql = `
      SELECT stu.id AS studentId, stu.first_name AS firstName, stu.last_name AS lastName, stu.email,
             CONCAT(stu.first_name, ' ', stu.last_name) AS studentName, stu.avatar_url AS avatarUrl,
             stu.school_year AS studentSchoolYear, stu.course_division AS studentCourseDivision,
             stu.created_at AS userCreatedAt,
             e.id AS enrollmentId, e.enrolled_at AS enrolledAt, e.status AS enrollmentStatus,
             e.last_accessed_at AS lastAccessedAt,
             c.id AS courseId, c.title AS courseTitle,
             c.school_year AS courseSchoolYear, c.course_division AS courseCourseDivision
      FROM usuarios stu
      LEFT JOIN inscripciones e ON e.student_id = stu.id
      LEFT JOIN cursos c ON c.id = e.course_id
      WHERE ${where.join(' AND ')}
      ORDER BY stu.last_name ASC, stu.first_name ASC, c.title ASC
    `;
  } else {
    const where = ['c.instructor_id = ?'];
    params.push(req.user!.id);

    if (courseId) {
      where.push('c.id = ?');
      params.push(Number(courseId));
    }
    if (schoolYear) {
      where.push('c.school_year = ?');
      params.push(Number(schoolYear));
    }
    if (courseDivision) {
      where.push('c.course_division = ?');
      params.push(Number(courseDivision));
    }
    const searchTerm = q || req.query.search;
    if (searchTerm) {
      where.push('(stu.first_name LIKE ? OR stu.last_name LIKE ? OR stu.email LIKE ? OR c.title LIKE ?)');
      params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
    }

    querySql = `
      SELECT stu.id AS studentId, stu.first_name AS firstName, stu.last_name AS lastName, stu.email,
             CONCAT(stu.first_name, ' ', stu.last_name) AS studentName, stu.avatar_url AS avatarUrl,
             stu.school_year AS studentSchoolYear, stu.course_division AS studentCourseDivision,
             stu.created_at AS userCreatedAt,
             e.id AS enrollmentId, e.enrolled_at AS enrolledAt, e.status AS enrollmentStatus,
             e.last_accessed_at AS lastAccessedAt,
             c.id AS courseId, c.title AS courseTitle,
             c.school_year AS courseSchoolYear, c.course_division AS courseCourseDivision
      FROM inscripciones e
      JOIN cursos c ON c.id = e.course_id
      JOIN usuarios stu ON stu.id = e.student_id
      WHERE ${where.join(' AND ')}
      ORDER BY stu.last_name ASC, stu.first_name ASC, c.title ASC
    `;
  }

  const [rows] = await db.execute(querySql, params);
  const studentMap = new Map<number, any>();

  for (const r of rows) {
    if (!studentMap.has(r.studentId)) {
      const sy = r.courseSchoolYear || r.studentSchoolYear || null;
      const cd = r.courseCourseDivision || r.studentCourseDivision || null;
      studentMap.set(r.studentId, {
        studentId: r.studentId,
        id: r.studentId,
        enrollmentId: r.enrollmentId || r.studentId,
        firstName: r.firstName,
        lastName: r.lastName,
        studentName: r.studentName || `${r.firstName} ${r.lastName}`,
        email: r.email,
        avatarUrl: r.avatarUrl,
        schoolYear: sy,
        courseDivision: cd,
        schoolGroupLabel: sy && cd ? `${sy}° ${cd}ª` : 'Sin curso asignado',
        enrolledAt: r.enrolledAt || r.userCreatedAt,
        lastAccessedAt: r.lastAccessedAt,
        status: r.enrollmentStatus || 'active',
        subjects: [],
        subjectsCount: 0,
      });
    }

    const st = studentMap.get(r.studentId);
    if (r.courseId) {
      if (!st.subjects.some((sub: any) => sub.id === r.courseId)) {
        st.subjects.push({
          id: r.courseId,
          title: r.courseTitle,
          enrollmentId: r.enrollmentId,
          enrollmentStatus: r.enrollmentStatus,
          enrolledAt: r.enrolledAt,
          schoolYear: r.courseSchoolYear,
          courseDivision: r.courseCourseDivision,
        });
      }
      st.subjectsCount = st.subjects.length;
      if (!st.schoolYear && r.courseSchoolYear) {
        st.schoolYear = r.courseSchoolYear;
        st.courseDivision = r.courseCourseDivision;
        st.schoolGroupLabel = `${r.courseSchoolYear}° ${r.courseCourseDivision}ª`;
      }
    }
  }

  const uniqueStudents = Array.from(studentMap.values()).map((s: any) => ({
    ...s,
    courseTitle: s.subjects.length > 0 ? s.subjects.map((sub: any) => sub.title).join(', ') : 'Sin materias',
  }));

  res.json({
    success: true,
    data: uniqueStudents,
  });
});

// Lista las entregas de actividades recibidas por el docente filtradas por curso o estado de corrección.
export const listInstructorAttempts = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const isAdmin = req.user!.role === 'admin';
  const { status } = req.query;
  const where = [isAdmin ? '1=1' : 'c.instructor_id = ?'];
  const params: unknown[] = isAdmin ? [] : [req.user!.id];

  if (req.query.courseId) {
    where.push('c.id = ?');
    params.push(Number(req.query.courseId));
  }
  if (status) {
    where.push('att.status = ?');
    params.push(status);
  } else {
    where.push("att.status IN ('submitted','graded')");
  }

  const [rows] = await db.execute(
    `SELECT att.id, att.id AS attemptId, att.assignment_id AS assignmentId, att.student_id AS studentId,
            att.attempt_number AS attemptNumber, att.submitted_at AS submittedAt,
            att.status, att.is_late AS isLate, att.submission_text AS submissionText, att.attachments AS attachments,
            att.score, att.feedback, att.graded_at AS gradedAt,
            a.title AS assignmentTitle, a.max_score AS maxScore, a.passing_score AS passingScore,
            a.assignment_type AS assignmentType, a.due_at AS dueAt,
            c.id AS courseId, c.title AS courseTitle,
            CONCAT(stu.first_name, ' ', stu.last_name) AS studentName,
            stu.email AS studentEmail
     FROM entregas_tareas att
     JOIN tareas a ON a.id = att.assignment_id
     JOIN cursos c ON c.id = a.course_id
     JOIN usuarios stu ON stu.id = att.student_id
     WHERE ${where.join(' AND ')}
     ORDER BY FIELD(att.status, 'submitted', 'graded'), att.submitted_at DESC`,
    params
  );

  res.json({
    success: true,
    data: rows.map((r: any) => ({
      ...r,
      isLate: r.isLate === 1,
      attachments: r.attachments
        ? typeof r.attachments === 'string'
          ? JSON.parse(r.attachments)
          : r.attachments
        : [],
      score: r.score !== null ? Number(r.score) : null,
      maxScore: Number(r.maxScore),
      passingScore: Number(r.passingScore),
      passed: r.score !== null ? Number(r.score) >= Number(r.passingScore) : null,
    })),
  });
});

// Califica manualmente una entrega, guarda el historial en historial_calificaciones y notifica al alumno.
export const gradeAttempt = asyncHandler(async (req: SolicitudAutenticada, res: Response, next) => {
  const [rows] = await db.execute(
    `SELECT att.*, a.title AS assignmentTitle, a.max_score AS maxScore, a.course_id AS courseId,
            c.instructor_id AS instructorId
     FROM entregas_tareas att
     JOIN tareas a ON a.id = att.assignment_id
     JOIN cursos c ON c.id = a.course_id
     WHERE att.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Entrega no encontrada', 404);
  const att = rows[0];

  assertInstructorOwnerOrAdmin(req.user!, att.instructorId);

  const numScore = Number(req.body.score);
  const maxScore = Number(att.maxScore) || 100;
  if (Number.isNaN(numScore) || numScore < 0 || numScore > maxScore) {
    throw new AppError(`La calificación debe estar entre 0 y ${maxScore}`, 400, 'INVALID_SCORE');
  }
  const feedback = req.body.feedback ? String(req.body.feedback).trim() : '';

  await db.withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE entregas_tareas
       SET status = 'graded', score = ?, feedback = ?, graded_by = ?, graded_at = NOW()
       WHERE id = ?`,
      [numScore, feedback, req.user!.id, att.id]
    );

    await conn.execute(
      'INSERT INTO historial_calificaciones (attempt_id, graded_by, previous_score, new_score, feedback) VALUES (?, ?, ?, ?, ?)',
      [att.id, req.user!.id, att.score, numScore, feedback]
    );

    await conn.execute(
      `INSERT INTO notificaciones (user_id, type, title, body, resource_type, resource_id)
       VALUES (?, 'grade_published', ?, ?, 'attempt', ?)`,
      [
        att.student_id,
        `Calificación publicada: ${att.assignmentTitle}`,
        `Obtuviste ${numScore}/${maxScore} puntos.${feedback ? ' Comentario: ' + feedback : ''}`,
        att.id,
      ]
    );
  });

  await logAudit(req.user!.id, 'ATTEMPT_GRADED', 'attempt', att.id, { score: numScore });
  return getAttempt(req, res, next);
});
