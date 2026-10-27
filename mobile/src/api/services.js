import api from './client';

export const authApi = {
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  login: (body) => api.post('/auth/login', body).then((r) => r), // r.status 202 => 2FA
  verify2fa: (body) => api.post('/auth/2fa/verify', body).then((r) => r.data),
  resend2fa: (userId) => api.post('/auth/2fa/resend', { userId }).then((r) => r.data),
  social: (provider, body) => api.post(`/auth/social/${provider}`, body).then((r) => r.data),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
};

export const tasksApi = {
  list: (params) => api.get('/tasks', { params }).then((r) => r.data),
  create: (body) => api.post('/tasks', body).then((r) => r.data),
  update: (id, body) => api.put(`/tasks/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/tasks/${id}`),
  stats: () => api.get('/tasks/stats').then((r) => r.data),
};

export const usersApi = {
  me: () => api.get('/users/me').then((r) => r.data),
  updateMe: (body) => api.put('/users/me', body).then((r) => r.data),
  assignable: () => api.get('/users/assignable').then((r) => r.data),
  list: () => api.get('/users').then((r) => r.data),
  setRole: (id, role) => api.patch(`/users/${id}/role`, { role }).then((r) => r.data),
  setStatus: (id, isActive) => api.patch(`/users/${id}/status`, { isActive }).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`),
};
