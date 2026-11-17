import api from './cliente';

// Extrae la propiedad interna data de la respuesta HTTP si está presente.
const unwrap = (r: any) => (r.data?.data !== undefined ? r.data.data : r.data);

// Agrupa los servicios HTTP de autenticación, registro, recuperación de clave, OAuth, 2FA y sesiones.
export const authApi = {
  registrationStatus: () => api.get('/auth/registration-status').then((r) => r.data),
  register: (body: any) => api.post('/auth/register', body).then((r) => r.data),
  login: (body: any) => api.post('/auth/login', body),
  me: () => api.get('/auth/me').then(unwrap),
  verifyEmail: (body: any) => api.post('/auth/verify-email', body).then((r) => r.data),
  resendVerification: (body: any = {}) => api.post('/auth/resend-verification', body).then((r) => r.data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (body: any) => api.post('/auth/reset-password', body).then((r) => r.data),
  setup2fa: (currentPassword?: string) => api.post('/auth/2fa/setup', { currentPassword }).then(unwrap),
  verify2fa: (body: any) => api.post('/auth/2fa/verify', body).then((r) => r.data),
  disable2fa: (currentPassword?: string) => api.post('/auth/2fa/disable', { currentPassword }).then((r) => r.data),
  social: (provider: string, body: any) => api.post(`/auth/oauth/${provider}`, body).then((r) => r.data),
  sessions: () => api.get('/auth/sessions').then(unwrap),
  getSessions: () => api.get('/auth/sessions'),
  revokeSession: (id: number | string) => api.delete(`/auth/sessions/${id}`).then((r) => r.data),
  logout: (refreshToken?: string | null) => api.post('/auth/logout', { refreshToken }),
};

// Agrupa los servicios del perfil del usuario actual, progreso del alumno y administración de cuentas.
export const usersApi = {
  me: () => api.get('/users/me').then(unwrap),
  updateMe: (body: any) => api.patch('/users/me', body).then(unwrap),
  setSchoolGroup: (body: any) => api.patch('/users/me/school-group', body).then((r) => r.data),
  mySchedule: () => api.get('/users/me/schedule').then(unwrap),
  updatePreferences: (body: any) => api.patch('/users/me/preferences', body).then(unwrap),
  updatePassword: (body: any) => api.patch('/users/me/password', body).then((r) => r.data),
  deleteMe: () => api.delete('/users/me'),
  studentDashboard: () => api.get('/users/me/dashboard').then(unwrap),
  myEnrollments: () => api.get('/users/me/enrollments').then(unwrap),
  myStatistics: () => api.get('/users/me/statistics').then(unwrap),
  myFavorites: () => api.get('/users/me/favorites').then(unwrap),
  myCertificates: () => api.get('/users/me/certificates').then(unwrap),
  myCalendar: () => api.get('/users/me/calendar').then(unwrap),
  list: (params?: any) => api.get('/admin/users', { params: { ...params, q: params?.search || params?.q } }),
  create: (body: any) => api.post('/admin/users', body),
  update: (id: number | string, body: any) => api.patch(`/admin/users/${id}`, body),
  updateRole: (id: number | string, role: string) => api.patch(`/admin/users/${id}/role`, { role }),
  updateStatus: (id: number | string, status: string) => api.patch(`/admin/users/${id}/status`, { status }),
  remove: (id: number | string) => api.delete(`/admin/users/${id}`),
};

// Agrupa los servicios de cursos, módulos, lecciones, inscripciones, favoritos, anuncios y comentarios.
export const coursesApi = {
  categories: () => api.get('/categories').then(unwrap),
  getCategories: () => api.get('/categories'),
  skills: () => api.get('/skills').then(unwrap),
  getSkills: () => api.get('/skills'),
  list: (params?: any) =>
    api.get('/courses', { params }).then((r) => ({
      ...r.data,
      data: Object.assign(r.data?.data || [], { data: r.data?.data || [] }),
    })),
  get: (id: number | string) => api.get(`/courses/${id}`).then(unwrap),
  getById: (id: number | string) => api.get(`/courses/${id}`),
  getSchoolGroupSchedule: (schoolYear: number | string, courseDivision: number | string) =>
    api.get(`/courses/school-group/${schoolYear}/${courseDivision}`).then(unwrap),
  getAvailableSchoolGroups: () => api.get('/courses/available-school-groups').then(unwrap),
  create: (body: any) =>
    api.post('/courses', body).then((r) => ({
      ...unwrap(r),
      data: r.data,
    })),
  update: (id: number | string, body: any) => api.patch(`/courses/${id}`, body).then(unwrap),
  remove: (id: number | string) => api.delete(`/courses/${id}`),
  publish: (id: number | string) => api.post(`/courses/${id}/publish`).then(unwrap),
  archive: (id: number | string) => api.post(`/courses/${id}/archive`).then(unwrap),
  modules: (courseId: number | string) => api.get(`/courses/${courseId}/modules`).then(unwrap),
  createModule: (courseId: number | string, body: any) => api.post(`/courses/${courseId}/modules`, body).then(unwrap),
  updateModule: (moduleId: number | string, body: any) => api.patch(`/modules/${moduleId}`, body).then(unwrap),
  deleteModule: (moduleId: number | string) => api.delete(`/modules/${moduleId}`),
  createLesson: (moduleId: number | string, body: any) => api.post(`/modules/${moduleId}/lessons`, body).then(unwrap),
  getLesson: (lessonId: number | string) => api.get(`/lessons/${lessonId}`).then(unwrap),
  updateLesson: (lessonId: number | string, body: any) => api.patch(`/lessons/${lessonId}`, body).then(unwrap),
  deleteLesson: (lessonId: number | string) => api.delete(`/lessons/${lessonId}`),
  startLesson: (lessonId: number | string) => api.post(`/lessons/${lessonId}/start`).then((r) => r.data),
  completeLesson: (lessonId: number | string, body?: any) => api.post(`/lessons/${lessonId}/complete`, body).then((r) => r.data),
  enroll: (courseId: number | string) => api.post(`/courses/${courseId}/enroll`).then((r) => r.data),
  unenroll: (courseId: number | string) => api.delete(`/courses/${courseId}/enroll`),
  addFavorite: (courseId: number | string) => api.post(`/courses/${courseId}/favorite`).then((r) => r.data),
  removeFavorite: (courseId: number | string) => api.delete(`/courses/${courseId}/favorite`).then((r) => r.data),
  announcements: (courseId: number | string) => api.get(`/courses/${courseId}/announcements`).then(unwrap),
  createAnnouncement: (courseId: number | string, body: any) => api.post(`/courses/${courseId}/announcements`, body).then(unwrap),
  updateAnnouncement: (id: number | string, body: any) => api.patch(`/announcements/${id}`, body).then(unwrap),
  deleteAnnouncement: (id: number | string) => api.delete(`/announcements/${id}`),
  feedComments: (courseId: number | string, params?: any) => api.get(`/courses/${courseId}/feed-comments`, { params }).then(unwrap),
  createFeedComment: (courseId: number | string, body: any) => api.post(`/courses/${courseId}/feed-comments`, body).then(unwrap),
  privateCommentStudents: (courseId: number | string, params?: any) =>
    api.get(`/courses/${courseId}/feed-comments/students`, { params }).then(unwrap),
};

// Agrupa los servicios de comentarios públicos y privados del tablón de cada materia.
export const commentsApi = {
  list: (courseId: number | string, params?: any) => api.get(`/courses/${courseId}/feed-comments`, { params }).then(unwrap),
  create: (courseId: number | string, body: any) => api.post(`/courses/${courseId}/feed-comments`, body).then(unwrap),
  students: (courseId: number | string, params?: any) => api.get(`/courses/${courseId}/feed-comments/students`, { params }).then(unwrap),
};

// Agrupa los servicios de actividades académicas, intentos y entregas de alumnos.
export const assignmentsApi = {
  myList: (params?: any) => api.get('/assignments', { params }).then(unwrap),
  courseList: (courseId: number | string) => api.get(`/courses/${courseId}/assignments`).then(unwrap),
  get: (id: number | string) => api.get(`/assignments/${id}`).then(unwrap),
  create: (courseIdOrBody: any, maybeBody?: any) => {
    if (typeof courseIdOrBody === 'object' && courseIdOrBody !== null) {
      return api.post('/assignments', courseIdOrBody);
    }
    return api.post(`/courses/${courseIdOrBody}/assignments`, maybeBody).then(unwrap);
  },
  update: (id: number | string, body: any) => api.patch(`/assignments/${id}`, body).then(unwrap),
  remove: (id: number | string) => api.delete(`/assignments/${id}`),
  startAttempt: (assignmentId: number | string) => api.post(`/assignments/${assignmentId}/attempts`).then(unwrap),
  getAttempt: (attemptId: number | string) => api.get(`/attempts/${attemptId}`).then(unwrap),
  saveAnswers: (attemptId: number | string, body: any) => api.put(`/attempts/${attemptId}/answers`, body).then((r) => r.data),
  submitAttempt: (attemptId: number | string, body: any) => api.post(`/attempts/${attemptId}/submit`, body).then((r) => r.data),
  gradeAttempt: (attemptId: number | string, body: any) => api.patch(`/attempts/${attemptId}/grade`, body),
};

// Agrupa los servicios específicos para el panel docente, nómina de alumnos y corrección de entregas.
export const instructorApi = {
  dashboard: () => api.get('/instructor/dashboard').then(unwrap),
  getDashboard: () => api.get('/instructor/dashboard'),
  getCourses: () => api.get('/instructor/courses'),
  students: (params?: any) => api.get('/instructor/students', { params }).then(unwrap),
  getStudents: (params?: any) => api.get('/instructor/students', { params }),
  pendingAttempts: () => api.get('/instructor/assignments/pending').then(unwrap),
  attempts: (params?: any) => api.get('/instructor/attempts', { params }).then(unwrap),
  getSubmissions: (params?: any) => api.get('/instructor/attempts', { params }),
  gradeAttempt: (attemptId: number | string, body: any) => api.post(`/attempts/${attemptId}/grade`, body).then(unwrap),
};

// Provee el servicio para subir archivos adjuntos o enlaces web al servidor.
export const uploadsApi = {
  uploadFile: (data: any) => api.post('/uploads', data).then(unwrap),
};

// Agrupa los servicios de administración global, reportes, catálogo de materias, cronograma y divisiones.
export const adminApi = {
  dashboard: () => api.get('/admin/dashboard').then(unwrap),
  getDashboard: () => api.get('/admin/dashboard'),
  users: (params?: any) => api.get('/admin/users', { params }).then(unwrap),
  getUser: (id: number | string) => api.get(`/admin/users/${id}`).then(unwrap),
  createUser: (body: any) => api.post('/admin/users', body).then(unwrap),
  updateUser: (id: number | string, body: any) => api.patch(`/admin/users/${id}`, body).then(unwrap),
  setUserRole: (id: number | string, role: string) => api.patch(`/admin/users/${id}/role`, { role }).then(unwrap),
  setUserStatus: (id: number | string, status: string) => api.patch(`/admin/users/${id}/status`, { status }).then(unwrap),
  deleteUser: (id: number | string) => api.delete(`/admin/users/${id}`),
  createCategory: (body: any) => api.post('/categories', body).then(unwrap),
  updateCategory: (id: number | string, body: any) => api.patch(`/categories/${id}`, body).then(unwrap),
  deleteCategory: (id: number | string) => api.delete(`/categories/${id}`),
  createSkill: (body: any) => api.post('/skills', body).then(unwrap),
  updateSkill: (id: number | string, body: any) => api.patch(`/skills/${id}`, body).then(unwrap),
  deleteSkill: (id: number | string) => api.delete(`/skills/${id}`),
  getReports: (type?: string) => api.get('/admin/reports', { params: { type } }),
  reportUsers: () => api.get('/admin/reports/users').then(unwrap),
  reportCourses: () => api.get('/admin/reports/courses').then(unwrap),
  reportEnrollments: () => api.get('/admin/reports/enrollments').then(unwrap),
  reportCompletion: () => api.get('/admin/reports/completion').then(unwrap),
  auditLogs: (params?: any) => api.get('/admin/audit-logs', { params }).then(unwrap),
  getAuditLogs: (params?: any) => api.get('/admin/audit-logs', { params }),
  getSettings: () => api.get('/admin/settings').then(unwrap),
  updateSettings: (body: any) => api.put('/admin/settings', body).then(unwrap),
  listSubjects: () => api.get('/admin/subjects').then(unwrap),
  createSubject: (body: any) => api.post('/admin/subjects', body).then(unwrap),
  updateSubject: (id: number | string, body: any) => api.patch(`/admin/subjects/${id}`, body).then(unwrap),
  deleteSubject: (id: number | string) => api.delete(`/admin/subjects/${id}`),
  getSchedule: (params?: any) => api.get('/admin/schedule', { params }).then(unwrap),
  addScheduleEntry: (body: any) => api.post('/admin/schedule', body).then(unwrap),
  updateCourseSchedule: (courseId: number | string, body: any) => api.put(`/admin/courses/${courseId}/schedule`, body).then(unwrap),
  deleteCourseFromSchedule: (courseId: number | string) => api.delete(`/admin/courses/${courseId}/schedule`),
  deleteScheduleEntry: (id: number | string) => api.delete(`/admin/schedule/${id}`),
  assignCourseInstructor: (courseId: number | string, instructorId: number | null) =>
    api.patch(`/admin/courses/${courseId}/instructor`, { instructorId }).then(unwrap),
  getSchoolGroups: () => api.get('/admin/school-groups').then(unwrap),
  createSchoolGroup: (body: any) => api.post('/admin/school-groups', body).then(unwrap),
  updateSchoolGroupCode: (id: number | string, accessCode: string) =>
    api.patch(`/admin/school-groups/${id}/code`, { accessCode }).then(unwrap),
  toggleSchoolGroup: (id: number | string) => api.post(`/admin/school-groups/${id}/toggle`).then(unwrap),
  deleteSchoolGroup: (id: number | string) => api.delete(`/admin/school-groups/${id}`).then(unwrap),
};

// Agrupa los servicios de consulta y lectura de notificaciones del usuario.
export const notificationsApi = {
  list: () => api.get('/notifications').then(unwrap),
  markRead: (id: number | string) => api.patch(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/notifications/read-all').then((r) => r.data),
};

// Agrupa los servicios de consulta y verificación pública de certificados académicos.
export const certificatesApi = {
  get: (id: number | string) => api.get(`/certificates/${id}`).then(unwrap),
  verifyPublic: (code: string) => api.get(`/certificates/verify/${encodeURIComponent(code)}`).then((r) => r.data),
};

// Agrupa los servicios de planilla de asistencia escolar para preceptores, docentes y administradores.
export const attendanceApi = {
  getOpenCourses: () => api.get('/attendance/open-courses').then((r) => r.data?.data ?? r.data ?? []),
  getStudents: (params?: any) => api.get('/attendance/students', { params }).then((r) => r.data?.data ?? r.data ?? []),
  getSheet: (params?: any) => api.get('/attendance/sheet', { params }).then((r) => (r.data?.days ? r.data : r.data?.data ?? r.data)),
  recordAttendance: (body: any) => api.post('/attendance/record', body).then(unwrap),
  setDayStatus: (body: any) => api.post('/attendance/day-status', body).then(unwrap),
  getCourseRequests: (params?: any) => api.get('/attendance/course-requests', { params }).then((r) => r.data),
  approveCourseRequest: (id: number | string) => api.post(`/attendance/course-requests/${id}/approve`).then((r) => r.data),
  rejectCourseRequest: (id: number | string) => api.post(`/attendance/course-requests/${id}/reject`).then((r) => r.data),
};
