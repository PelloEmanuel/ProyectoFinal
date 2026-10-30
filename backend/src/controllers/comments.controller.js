/**
 * Archivo: backend/src/controllers/comments.controller.js
 * Descripción: Controlador para comentarios públicos (chat grupal del curso)
 * y comentarios privados (chat directo alumno-profesor) en avisos, material teórico y actividades.
 */
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');

exports.listFeedComments = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const { itemType, itemId, isPrivate, studentId } = req.query;

  if (!itemType || !itemId) {
    throw new AppError('itemType e itemId son requeridos', 400);
  }

  const isPriv = isPrivate === '1' || isPrivate === 'true';

  let targetStudentId = null;
  if (isPriv) {
    if (req.user.role === 'student') {
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
    FROM feed_comments fc
    JOIN users u ON u.id = fc.user_id
    JOIN roles r ON r.id = u.role_id
    WHERE fc.course_id = ? AND fc.item_type = ? AND fc.item_id = ? AND fc.is_private = ?
  `;
  const params = [courseId, itemType, Number(itemId), isPriv ? 1 : 0];

  if (isPriv && targetStudentId) {
    query += ' AND fc.student_id = ?';
    params.push(targetStudentId);
  }

  query += ' ORDER BY fc.created_at ASC';

  const [rows] = await db.execute(query, params);

  const formatted = rows.map((r) => ({
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

exports.createFeedComment = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const { itemType, itemId, isPrivate, studentId, message, attachments } = req.body;

  if (!itemType || !itemId || !message || !String(message).trim()) {
    throw new AppError('Comentario vacío o faltan datos requeridos', 400);
  }

  const isPriv = isPrivate === 1 || isPrivate === true || isPrivate === '1';
  let targetStudentId = null;

  if (isPriv) {
    if (req.user.role === 'student') {
      targetStudentId = req.user.id;
    } else {
      if (!studentId) {
        throw new AppError('El profesor debe especificar el ID del alumno para el chat privado', 400);
      }
      targetStudentId = Number(studentId);
    }
  }

  const attJson = Array.isArray(attachments) && attachments.length > 0 ? JSON.stringify(attachments) : null;

  const [ins] = await db.execute(
    `INSERT INTO feed_comments (course_id, item_type, item_id, user_id, is_private, student_id, message, attachments)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [courseId, itemType, Number(itemId), req.user.id, isPriv ? 1 : 0, targetStudentId, String(message).trim(), attJson]
  );

  // Notificación automática
  try {
    const [cRows] = await db.execute('SELECT title, instructor_id FROM courses WHERE id = ?', [courseId]);
    if (cRows.length) {
      const course = cRows[0];
      if (isPriv) {
        // Notificar al otro participante del chat privado
        const recipientId = req.user.role === 'student' ? course.instructor_id : targetStudentId;
        if (recipientId && Number(recipientId) !== Number(req.user.id)) {
          await db.execute(
            `INSERT INTO notifications (user_id, type, title, body, resource_type, resource_id)
             VALUES (?, 'private_chat', 'Nuevo mensaje privado del docente/alumno', ?, 'course', ?)`,
            [recipientId, `${req.user.name}: "${String(message).trim().slice(0, 100)}"`, courseId]
          );
        }
      } else {
        // Chat público: Si comenta el alumno, avisar al docente
        if (req.user.role === 'student' && course.instructor_id) {
          await db.execute(
            `INSERT INTO notifications (user_id, type, title, body, resource_type, resource_id)
             VALUES (?, 'public_comment', 'Nueva consulta pública en el tablón', ?, 'course', ?)`,
            [course.instructor_id, `${req.user.name} comentó en el tablón de ${course.title}.`, courseId]
          );
        }
      }
    }
  } catch (err) {
    console.error('Error enviando notificación de comentario:', err.message);
  }

  res.status(201).json({
    success: true,
    data: {
      id: ins.insertId,
      courseId,
      itemType,
      itemId: Number(itemId),
      userId: req.user.id,
      userName: req.user.name,
      role: req.user.role,
      isPrivate: isPriv,
      studentId: targetStudentId,
      message: String(message).trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      createdAt: new Date().toISOString(),
    },
  });
});

exports.listPrivateCommentStudents = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const { itemType, itemId } = req.query;

  if (!itemType || !itemId) {
    throw new AppError('itemType e itemId son requeridos', 400);
  }

  // Lista todos los alumnos que tienen mensajes privados con el docente para este ítem
  const [rows] = await db.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
            (SELECT COUNT(*) FROM feed_comments WHERE course_id = ? AND item_type = ? AND item_id = ? AND is_private = 1 AND student_id = u.id) AS messageCount,
            (SELECT MAX(created_at) FROM feed_comments WHERE course_id = ? AND item_type = ? AND item_id = ? AND is_private = 1 AND student_id = u.id) AS lastMessageAt
     FROM users u
     JOIN feed_comments fc ON fc.student_id = u.id
     WHERE fc.course_id = ? AND fc.item_type = ? AND fc.item_id = ? AND fc.is_private = 1
     ORDER BY lastMessageAt DESC`,
    [courseId, itemType, Number(itemId), courseId, itemType, Number(itemId), courseId, itemType, Number(itemId)]
  );

  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      email: r.email,
      messageCount: Number(r.messageCount) || 0,
      lastMessageAt: r.lastMessageAt,
    })),
  });
});
