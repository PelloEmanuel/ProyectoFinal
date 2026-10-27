export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function validateLogin({ email, password }) {
  const e = {};
  if (!email.trim()) e.email = 'Ingresá tu email';
  else if (!isEmail(email)) e.email = 'El email no es válido';
  if (!password) e.password = 'Ingresá tu contraseña';
  return e;
}

export function validateRegister({ name, email, password, confirm }) {
  const e = {};
  if (name.trim().length < 2) e.name = 'Ingresá tu nombre (mínimo 2 letras)';
  if (!isEmail(email)) e.email = 'El email no es válido';
  if (password.length < 8) e.password = 'Mínimo 8 caracteres';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) e.password = 'Debe incluir letras y números';
  if (confirm !== password) e.confirm = 'Las contraseñas no coinciden';
  return e;
}

export function validateTask({ title, dueDate }) {
  const e = {};
  if (title.trim().length < 3) e.title = 'El título debe tener al menos 3 caracteres';
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) e.dueDate = 'Formato AAAA-MM-DD';
  return e;
}
