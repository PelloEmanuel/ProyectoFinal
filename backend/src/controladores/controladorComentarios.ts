// Importa la conexión a la base de datos, el manejador de errores, el notificador en tiempo real y los tipos de solicitud autenticada.
import { Response } from 'express';
import db from '../configuracion/baseDatos';
import { AppError, asyncHandler } from '../utilidades/errores';
import { notificarCambioTiempoReal } from '../utilidades/tiempoReal';
import { SolicitudAutenticada } from '../tipos';

// Lista los comentarios públicos o privados asociados a un aviso, lección o tarea del tablón.
export const listFeedComments = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const courseId = Number(req.params.id);
  const { itemType, itemId, isPrivate, studentId } = req.query;

  if (!itemType || !itemId) {
    throw new AppError('itemType e itemId son requeridos', 400);
  }

  const isPriv = isPrivate === '1' || isPrivate === 'true';

  let targetStudentId: number | null = null;
  if (isPriv) {
    if (req.user?.role === 'student') {
      targetStudentId = req.user.id;
    } else if (studentId) {
      targetStudentId = Number(studentId);
    }
  }

  let query = `
    SELECT fc.id, fc.course_id AS courseId, fc.item_type AS itemType, fc.item_id AS itemId,
           fc.user_id AS userId, fc.is_private AS isPrivate, fc.student_id AS studentId,
           fc.message, fc.attachments, fc.created_at AS createdAt,
           u.first_name, u.last_name, r.name AS role
    FROM comentarios_tablon fc
    JOIN usuarios u ON u.id = fc.user_id
    JOIN roles r ON r.id = u.role_id
    WHERE fc.course_id = ? AND fc.item_type = ? AND fc.item_id = ? AND fc.is_private = ?
  `;
  const params: unknown[] = [courseId, itemType, Number(itemId), isPriv ? 1 : 0];

  if (isPriv && targetStudentId) {
    query += ' AND fc.student_id = ?';
    params.push(targetStudentId);
  }

  query += ' ORDER BY fc.created_at ASC';

  const [rows] = await db.execute(query, params);

  // Marca como leídos únicamente los comentarios de la interfaz específica (pública o privada) a la que ingresó el docente.
  const shouldMarkRead = req.query.markRead === '1' || req.query.markRead === 'true';
  if (shouldMarkRead && (req.user?.role === 'instructor' || req.user?.role === 'admin')) {
    try {
      let updResult: any = null;
      if (!isPriv) {
        const [upd] = await db.execute(
          'UPDATE comentarios_tablon SET read_by_instructor = 1 WHERE course_id = ? AND item_type = ? AND item_id = ? AND is_private = 0 AND read_by_instructor = 0',
          [courseId, itemType, Number(itemId)]
        );
        updResult = upd;
      } else if (targetStudentId) {
        const [upd] = await db.execute(
          'UPDATE comentarios_tablon SET read_by_instructor = 1 WHERE course_id = ? AND item_type = ? AND item_id = ? AND is_private = 1 AND student_id = ? AND read_by_instructor = 0',
          [courseId, itemType, Number(itemId), targetStudentId]
        );
        updResult = upd;
      }
      if (updResult?.affectedRows > 0) {
        notificarCambioTiempoReal('PATCH', `/api/v1/courses/${courseId}/comments/read`);
      }
    } catch {}
  }

  const formatted = rows.map((r: any) => ({
    id: r.id,
    courseId: r.courseId,
    itemType: r.itemType,
    itemId: r.itemId,
    userId: r.userId,
    userName: `${r.first_name} ${r.last_name}`.trim(),
    role: r.role,
    isPrivate: !!r.isPrivate,
    studentId: r.studentId,
    message: r.message,
    attachments: r.attachments
      ? typeof r.attachments === 'string'
        ? JSON.parse(r.attachments)
        : r.attachments
      : [],
    createdAt: r.createdAt,
  }));

  res.json({ success: true, data: formatted });
});

// Crea un nuevo comentario público o privado en el tablón y envía una notificación al destinatario.
export const createFeedComment = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const courseId = Number(req.params.id);
  const { itemType, itemId, isPrivate, studentId, message, attachments } = req.body;

  if (!itemType || !itemId || !message || !String(message).trim()) {
    throw new AppError('Comentario vacío o faltan datos requeridos', 400);
  }

  const isPriv = isPrivate === 1 || isPrivate === true || isPrivate === '1';
  let targetStudentId: number | null = null;

  if (isPriv) {
    if (req.user?.role === 'student') {
      targetStudentId = req.user.id;
    } else {
      if (!studentId) {
        throw new AppError('El profesor debe especificar el ID del alumno para el chat privado', 400);
      }
      targetStudentId = Number(studentId);
    }
  }

  const attJson = Array.isArray(attachments) && attachments.length > 0 ? JSON.stringify(attachments) : null;
  const readByInstructor = req.user?.role === 'student' ? 0 : 1;

  const [ins] = await db.execute(
    `INSERT INTO comentarios_tablon (course_id, item_type, item_id, user_id, is_private, read_by_instructor, student_id, message, attachments)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      courseId,
      itemType,
      Number(itemId),
      req.user!.id,
      isPriv ? 1 : 0,
      readByInstructor,
      targetStudentId,
      String(message).trim(),
      attJson,
    ]
  );

  // Envía una notificación automática al docente o alumno según el tipo de comentario publicado.
  try {
    const [cRows] = await db.execute('SELECT title, instructor_id FROM cursos WHERE id = ?', [courseId]);
    if (cRows.length) {
      const course = cRows[0];
      if (isPriv) {
        const recipientId = req.user?.role === 'student' ? course.instructor_id : targetStudentId;
        if (recipientId && Number(recipientId) !== Number(req.user!.id)) {
          await db.execute(
            `INSERT INTO notificaciones (user_id, type, title, body, resource_type, resource_id)
             VALUES (?, 'private_chat', 'Nuevo mensaje privado del docente/alumno', ?, 'course', ?)`,
            [recipientId, `${req.user!.name}: "${String(message).trim().slice(0, 100)}"`, courseId]
          );
        }
      } else if (req.user?.role === 'student' && course.instructor_id) {
        await db.execute(
          `INSERT INTO notificaciones (user_id, type, title, body, resource_type, resource_id)
           VALUES (?, 'public_comment', 'Nueva consulta pública en el tablón', ?, 'course', ?)`,
          [course.instructor_id, `${req.user!.name} comentó en el tablón de ${course.title}.`, courseId]
        );
      }
    }
  } catch (err: any) {
    console.error('Error enviando notificación de comentario:', err.message);
  }

  const [newRow] = await db.execute('SELECT created_at FROM comentarios_tablon WHERE id = ?', [ins.insertId]);
  const createdAt = newRow.length ? newRow[0].created_at : new Date().toISOString();

  res.status(201).json({
    success: true,
    data: {
      id: ins.insertId,
      courseId,
      itemType,
      itemId: Number(itemId),
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      isPrivate: isPriv,
      studentId: targetStudentId,
      message: String(message).trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      createdAt,
    },
  });
});

// Lista todos los estudiantes que han iniciado conversaciones privadas con el docente en un elemento del tablón.
export const listPrivateCommentStudents = asyncHandler(async (req: SolicitudAutenticada, res: Response) => {
  const courseId = Number(req.params.id);
  const { itemType, itemId } = req.query;

  if (!itemType || !itemId) {
    throw new AppError('itemType e itemId son requeridos', 400);
  }

  const [rows] = await db.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
            (SELECT COUNT(*) FROM comentarios_tablon WHERE course_id = ? AND item_type = ? AND item_id = ? AND is_private = 1 AND student_id = u.id) AS messageCount,
            (SELECT COUNT(*) FROM comentarios_tablon WHERE course_id = ? AND item_type = ? AND item_id = ? AND is_private = 1 AND student_id = u.id AND user_id = u.id AND read_by_instructor = 0) AS unreadCount,
            (SELECT MAX(created_at) FROM comentarios_tablon WHERE course_id = ? AND item_type = ? AND item_id = ? AND is_private = 1 AND student_id = u.id) AS lastMessageAt
     FROM usuarios u
     JOIN comentarios_tablon fc ON fc.student_id = u.id
     WHERE fc.course_id = ? AND fc.item_type = ? AND fc.item_id = ? AND fc.is_private = 1
     ORDER BY lastMessageAt DESC`,
    [
      courseId,
      itemType,
      Number(itemId),
      courseId,
      itemType,
      Number(itemId),
      courseId,
      itemType,
      Number(itemId),
      courseId,
      itemType,
      Number(itemId),
    ]
  );

  res.json({
    success: true,
    data: rows.map((r: any) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      email: r.email,
      messageCount: Number(r.messageCount) || 0,
      unreadCount: Number(r.unreadCount) || 0,
      lastMessageAt: r.lastMessageAt,
    })),
  });
});
