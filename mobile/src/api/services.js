/**
 * Archivo: mobile/src/api/services.js
 * Descripción: Servicios HTTP para todos los módulos de la API REST v1 de SkillTrack.
 */
import api from './client';

const unwrap = (r) => (r.data?.data !== undefined ? r.data.data : r.data);

export const authApi = {
  registrationStatus: () => api.get('/auth/registration-status').then((r) => r.data),
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  login: (body) => api.post('/auth/login', body), // status 202 => twoFactorRequired
  me: () => api.get('/auth/me').then(unwrap),
  verifyEmail: (body) => api.post('/auth/verify-email', body).then((r) => r.data),
  resendVerification: (body = {}) => api.post('/auth/resend-verification', body).then((r) => r.data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (body) => api.post('/auth/reset-password', body).then((r) => r.data),
  setup2fa: (currentPassword) => api.post('/auth/2fa/setup', { currentPassword }).then(unwrap),
  verify2fa: (body) => api.post('/auth/2fa/verify', body).then((r) => r.data),
  disable2fa: (currentPassword) => api.post('/auth/2fa/disable', { currentPassword }).then((r) => r.data),
  social: (provider, body) => api.post(`/auth/oauth/${provider}`, body).then((r) => r.data),
  sessions: () => api.get('/auth/sessions').then(unwrap),
  getSessions: () => api.get('/auth/sessions'),
  revokeSession: (id) => api.delete(`/auth/sessions/${id}`).then((r) => r.data),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
};

export const usersApi = {
  me: () => api.get('/users/me').then(unwrap),
  updateMe: (body) => api.patch('/users/me', body).then(unwrap),
  setSchoolGroup: (body) => api.patch('/users/me/school-group', body).then(unwrap),
  mySchedule: () => api.get('/users/me/schedule').then(unwrap),
  updatePreferences: (body) => api.patch('/users/me/preferences', body).then(unwrap),
  updatePassword: (body) => api.patch('/users/me/password', body).then((r) => r.data),
  deleteMe: () => api.delete('/users/me'),
  studentDashboard: () => api.get('/users/me/dashboard').then(unwrap),
  myEnrollments: () => api.get('/users/me/enrollments').then(unwrap),
  myStatistics: () => api.get('/users/me/statistics').then(unwrap),
  myFavorites: () => api.get('/users/me/favorites').then(unwrap),
  myCertificates: () => api.get('/users/me/certificates').then(unwrap),
  myCalendar: () => api.get('/users/me/calendar').then(unwrap),
  // Métodos administrativos de usuarios
  list: (params) => api.get('/admin/users', { params: { ...params, q: params?.search || params?.q } }),
  create: (body) => api.post('/admin/users', body),
  update: (id, body) => api.patch(`/admin/users/${id}`, body),
  updateRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }),
  updateStatus: (id, status) => api.patch(`/admin/users/${id}/status`, { status }),
  remove: (id) => api.delete(`/admin/users/${id}`),
};

export const coursesApi = {
  categories: () => api.get('/categories').then(unwrap),
  getCategories: () => api.get('/categories'),
  skills: () => api.get('/skills').then(unwrap),
  getSkills: () => api.get('/skills'),
  list: (params) =>
    api.get('/courses', { params }).then((r) => ({
      ...r.data,
      data: Object.assign(r.data?.data || [], { data: r.data?.data || [] }),
    })),
  get: (id) => api.get(`/courses/${id}`).then(unwrap),
  getById: (id) => api.get(`/courses/${id}`),
  getSchoolGroupSchedule: (schoolYear, courseDivision) =>
    api.get(`/courses/school-group/${schoolYear}/${courseDivision}`).then(unwrap),
  create: (body) =>
    api.post('/courses', body).then((r) => ({
      ...unwrap(r),
      data: r.data,
    })),
  update: (id, body) => api.patch(`/courses/${id}`, body).then(unwrap),
  remove: (id) => api.delete(`/courses/${id}`),
  publish: (id) => api.post(`/courses/${id}/publish`).then(unwrap),
  archive: (id) => api.post(`/courses/${id}/archive`).then(unwrap),
  modules: (courseId) => api.get(`/courses/${courseId}/modules`).then(unwrap),
  createModule: (courseId, body) => api.post(`/courses/${courseId}/modules`, body).then(unwrap),
  updateModule: (moduleId, body) => api.patch(`/modules/${moduleId}`, body).then(unwrap),
  deleteModule: (moduleId) => api.delete(`/modules/${moduleId}`),
  createLesson: (moduleId, body) => api.post(`/modules/${moduleId}/lessons`, body).then(unwrap),
  getLesson: (lessonId) => api.get(`/lessons/${lessonId}`).then(unwrap),
  updateLesson: (lessonId, body) => api.patch(`/lessons/${lessonId}`, body).then(unwrap),
  deleteLesson: (lessonId) => api.delete(`/lessons/${lessonId}`),
  startLesson: (lessonId) => api.post(`/lessons/${lessonId}/start`).then((r) => r.data),
  completeLesson: (lessonId, body) => api.post(`/lessons/${lessonId}/complete`, body).then((r) => r.data),
  enroll: (courseId) => api.post(`/courses/${courseId}/enroll`).then((r) => r.data),
  unenroll: (courseId) => api.delete(`/courses/${courseId}/enroll`),
  addFavorite: (courseId) => api.post(`/courses/${courseId}/favorite`).then((r) => r.data),
  removeFavorite: (courseId) => api.delete(`/courses/${courseId}/favorite`).then((r) => r.data),
  announcements: (courseId) => api.get(`/courses/${courseId}/announcements`).then(unwrap),
  createAnnouncement: (courseId, body) => api.post(`/courses/${courseId}/announcements`, body).then(unwrap),
  updateAnnouncement: (id, body) => api.patch(`/announcements/${id}`, body).then(unwrap),
  deleteAnnouncement: (id) => api.delete(`/announcements/${id}`),
  feedComments: (courseId, params) => api.get(`/courses/${courseId}/feed-comments`, { params }).then(unwrap),
  createFeedComment: (courseId, body) => api.post(`/courses/${courseId}/feed-comments`, body).then(unwrap),
  privateCommentStudents: (courseId, params) => api.get(`/courses/${courseId}/feed-comments/students`, { params }).then(unwrap),
};

export const commentsApi = {
  list: (courseId, params) => api.get(`/courses/${courseId}/feed-comments`, { params }).then(unwrap),
  create: (courseId, body) => api.post(`/courses/${courseId}/feed-comments`, body).then(unwrap),
  students: (courseId, params) => api.get(`/courses/${courseId}/feed-comments/students`, { params }).then(unwrap),
};

export const assignmentsApi = {
  myList: (params) => api.get('/assignments', { params }).then(unwrap),
  courseList: (courseId) => api.get(`/courses/${courseId}/assignments`).then(unwrap),
  get: (id) => api.get(`/assignments/${id}`).then(unwrap),
  create: (courseIdOrBody, maybeBody) => {
    if (typeof courseIdOrBody === 'object' && courseIdOrBody !== null) {
      return api.post('/assignments', courseIdOrBody);
    }
    return api.post(`/courses/${courseIdOrBody}/assignments`, maybeBody).then(unwrap);
  },
  update: (id, body) => api.patch(`/assignments/${id}`, body).then(unwrap),
  remove: (id) => api.delete(`/assignments/${id}`),
  startAttempt: (assignmentId) => api.post(`/assignments/${assignmentId}/attempts`).then(unwrap),
  getAttempt: (attemptId) => api.get(`/attempts/${attemptId}`).then(unwrap),
  saveAnswers: (attemptId, body) => api.put(`/attempts/${attemptId}/answers`, body).then((r) => r.data),
  submitAttempt: (attemptId, body) => api.post(`/attempts/${attemptId}/submit`, body).then((r) => r.data),
  gradeAttempt: (attemptId, body) => api.patch(`/attempts/${attemptId}/grade`, body),
};

export const instructorApi = {
  dashboard: () => api.get('/instructor/dashboard').then(unwrap),
  getDashboard: () => api.get('/instructor/dashboard'),
  getCourses: () => api.get('/instructor/courses'),
  students: (params) => api.get('/instructor/students', { params }).then(unwrap),
  getStudents: (params) => api.get('/instructor/students', { params }),
  pendingAttempts: () => api.get('/instructor/assignments/pending').then(unwrap),
  attempts: (params) => api.get('/instructor/attempts', { params }).then(unwrap),
  getSubmissions: (params) => api.get('/instructor/attempts', { params }),
  gradeAttempt: (attemptId, body) => api.post(`/attempts/${attemptId}/grade`, body).then(unwrap),
};

export const uploadsApi = {
  uploadFile: (data) => api.post('/uploads', data).then(unwrap),
};

export const adminApi = {
  dashboard: () => api.get('/admin/dashboard').then(unwrap),
  getDashboard: () => api.get('/admin/dashboard'),
  users: (params) => api.get('/admin/users', { params }).then(unwrap),
  getUser: (id) => api.get(`/admin/users/${id}`).then(unwrap),
  createUser: (body) => api.post('/admin/users', body).then(unwrap),
  updateUser: (id, body) => api.patch(`/admin/users/${id}`, body).then(unwrap),
  setUserRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }).then(unwrap),
  setUserStatus: (id, status) => api.patch(`/admin/users/${id}/status`, { status }).then(unwrap),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  createCategory: (body) => api.post('/categories', body).then(unwrap),
  updateCategory: (id, body) => api.patch(`/categories/${id}`, body).then(unwrap),
  deleteCategory: (id) => api.delete(`/categories/${id}`),
  createSkill: (body) => api.post('/skills', body).then(unwrap),
  updateSkill: (id, body) => api.patch(`/skills/${id}`, body).then(unwrap),
  deleteSkill: (id) => api.delete(`/skills/${id}`),
  getReports: (type) => api.get('/admin/reports', { params: { type } }),
  reportUsers: () => api.get('/admin/reports/users').then(unwrap),
  reportCourses: () => api.get('/admin/reports/courses').then(unwrap),
  reportEnrollments: () => api.get('/admin/reports/enrollments').then(unwrap),
  reportCompletion: () => api.get('/admin/reports/completion').then(unwrap),
  auditLogs: (params) => api.get('/admin/audit-logs', { params }).then(unwrap),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  getSettings: () => api.get('/admin/settings').then(unwrap),
  updateSettings: (body) => api.put('/admin/settings', body).then(unwrap),
  listSubjects: () => api.get('/admin/subjects').then(unwrap),
  createSubject: (body) => api.post('/admin/subjects', body).then(unwrap),
  updateSubject: (id, body) => api.patch(`/admin/subjects/${id}`, body).then(unwrap),
  deleteSubject: (id) => api.delete(`/admin/subjects/${id}`),
  getSchedule: (params) => api.get('/admin/schedule', { params }).then(unwrap),
  addScheduleEntry: (body) => api.post('/admin/schedule', body).then(unwrap),
  updateCourseSchedule: (courseId, body) => api.put(`/admin/courses/${courseId}/schedule`, body).then(unwrap),
  deleteCourseFromSchedule: (courseId) => api.delete(`/admin/courses/${courseId}/schedule`),
  deleteScheduleEntry: (id) => api.delete(`/admin/schedule/${id}`),
  assignCourseInstructor: (courseId, instructorId) =>
    api.patch(`/admin/courses/${courseId}/instructor`, { instructorId }).then(unwrap),
  getSchoolGroups: () => api.get('/admin/school-groups').then(unwrap),
  createSchoolGroup: (body) => api.post('/admin/school-groups', body).then(unwrap),
  updateSchoolGroupCode: (id, accessCode) => api.patch(`/admin/school-groups/${id}/code`, { accessCode }).then(unwrap),
  toggleSchoolGroup: (id) => api.post(`/admin/school-groups/${id}/toggle`).then(unwrap),
  deleteSchoolGroup: (id) => api.delete(`/admin/school-groups/${id}`).then(unwrap),
};

export const notificationsApi = {
  list: () => api.get('/notifications').then(unwrap),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/notifications/read-all').then((r) => r.data),
};

export const certificatesApi = {
  get: (id) => api.get(`/certificates/${id}`).then(unwrap),
  verifyPublic: (code) => api.get(`/certificates/verify/${encodeURIComponent(code)}`).then((r) => r.data),
};

export const attendanceApi = {
  getOpenCourses: () => api.get('/attendance/open-courses').then((r) => r.data?.data ?? r.data ?? []),
  getStudents: (params) => api.get('/attendance/students', { params }).then((r) => r.data?.data ?? r.data ?? []),
  getSheet: (params) => api.get('/attendance/sheet', { params }).then((r) => (r.data?.days ? r.data : r.data?.data ?? r.data)),
  recordAttendance: (body) => api.post('/attendance/record', body).then(unwrap),
  setDayStatus: (body) => api.post('/attendance/day-status', body).then(unwrap),
};
