import { parseDisplayDateToIso } from './fechas';

// Comprueba si una cadena tiene formato válido de dirección de correo electrónico.
export const isEmail = (v?: string | null): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

// Valida los campos del formulario de inicio de sesión.
export function validateLogin({ email, password }: { email?: string; password?: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!String(email || '').trim()) e.email = 'Ingresá tu correo electrónico';
  else if (!isEmail(email)) e.email = 'El formato del correo no es válido';
  if (!password) e.password = 'Ingresá tu contraseña';
  return e;
}

// Valida los campos del formulario de registro de usuario según el rol elegido.
export function validateRegister({
  firstName,
  lastName,
  email,
  password,
  confirm,
  acceptTerms,
  role,
  instructorKey,
  accessCode,
  isFirstUser,
}: {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirm?: string;
  acceptTerms?: boolean;
  role?: string;
  instructorKey?: string;
  accessCode?: string;
  isFirstUser?: boolean;
}): Record<string, string> {
  const e: Record<string, string> = {};
  if (!String(firstName || '').trim() || String(firstName).trim().length < 2) {
    e.firstName = 'Ingresá tu nombre (mínimo 2 letras)';
  }
  if (!String(lastName || '').trim() || String(lastName).trim().length < 2) {
    e.lastName = 'Ingresá tu apellido (mínimo 2 letras)';
  }
  if (!isEmail(email)) {
    e.email = 'Ingresá un correo electrónico válido';
  }
  if (!password) {
    e.password = 'Ingresá una contraseña';
  }
  if (confirm !== password) {
    e.confirm = 'Las contraseñas no coinciden';
  }
  if (!isFirstUser && role === 'instructor' && !String(instructorKey || '').trim()) {
    e.instructorKey = 'Debés completar este campo con la clave de docente';
  }
  if (!isFirstUser && role === 'student' && !String(accessCode || '').trim()) {
    e.accessCode = 'Debés ingresar la contraseña del curso para poder ingresar';
  }
  if (!acceptTerms) {
    e.acceptTerms = 'Debés aceptar los términos y condiciones';
  }
  return e;
}

// Valida los campos principales al crear o editar un curso académico.
export function validateCourseForm({
  title,
  shortDescription,
  description,
  estimatedDuration,
}: {
  title?: string;
  shortDescription?: string;
  description?: string;
  estimatedDuration?: string | number;
}): Record<string, string> {
  const e: Record<string, string> = {};
  if (!String(title || '').trim() || String(title).trim().length < 4) {
    e.title = 'El título debe tener al menos 4 caracteres';
  }
  if (!String(shortDescription || '').trim() || String(shortDescription).trim().length < 10) {
    e.shortDescription = 'La descripción breve debe tener al menos 10 caracteres';
  }
  if (!String(description || '').trim() || String(description).trim().length < 20) {
    e.description = 'La descripción completa debe tener al menos 20 caracteres';
  }
  if (estimatedDuration && (Number.isNaN(Number(estimatedDuration)) || Number(estimatedDuration) <= 0)) {
    e.estimatedDuration = 'Ingresá una duración en horas válida';
  }
  return e;
}

// Valida los datos de creación o edición de una tarea o evaluación académica.
export function validateAssignmentForm({
  title,
  description,
  dueDateDisplay,
  maxScore,
  passingScore,
}: {
  title?: string;
  description?: string;
  dueDateDisplay?: string;
  maxScore?: string | number;
  passingScore?: string | number;
}): Record<string, string> {
  const e: Record<string, string> = {};
  if (!String(title || '').trim() || String(title).trim().length < 3) {
    e.title = 'El título de la actividad es obligatorio';
  }
  if (!String(description || '').trim() || String(description).trim().length < 5) {
    e.description = 'Las instrucciones son obligatorias';
  }
  if (dueDateDisplay && !parseDisplayDateToIso(dueDateDisplay)) {
    e.dueDateDisplay = 'Ingresá una fecha real en formato dd/mm/aaaa';
  }
  if (Number(passingScore) > Number(maxScore)) {
    e.passingScore = 'El puntaje de aprobación no puede superar al puntaje máximo';
  }
  return e;
}
