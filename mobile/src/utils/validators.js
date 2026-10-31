/**
 * Archivo: mobile/src/utils/validators.js
 * Descripción: Validaciones compartidas de formularios en el cliente para el Campus.
 */
import { parseDisplayDateToIso } from './dates';

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

export function validateLogin({ email, password }) {
  const e = {};
  if (!String(email || '').trim()) e.email = 'Ingresá tu correo electrónico';
  else if (!isEmail(email)) e.email = 'El formato del correo no es válido';
  if (!password) e.password = 'Ingresá tu contraseña';
  return e;
}

export function validateRegister({ firstName, lastName, email, password, confirm, acceptTerms, role, instructorKey, isFirstUser }) {
  const e = {};
  if (!String(firstName || '').trim() || String(firstName).trim().length < 2) {
    e.firstName = 'Ingresá tu nombre (mínimo 2 letras)';
  }
  if (!String(lastName || '').trim() || String(lastName).trim().length < 2) {
    e.lastName = 'Ingresá tu apellido (mínimo 2 letras)';
  }
  if (!isEmail(email)) {
    e.email = 'Ingresá un correo electrónico válido';
  }
  if (!password || password.length < 8) {
    e.password = 'La contraseña debe tener al menos 8 caracteres';
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    e.password = 'Debe incluir letras y al menos un número';
  }
  if (confirm !== password) {
    e.confirm = 'Las contraseñas no coinciden';
  }
  if (!isFirstUser && role === 'instructor' && !String(instructorKey || '').trim()) {
    e.instructorKey = 'Debés completar este campo con la clave de docente';
  }
  if (!acceptTerms) {
    e.acceptTerms = 'Debés aceptar los términos y condiciones';
  }
  return e;
}

export function validateCourseForm({ title, shortDescription, description, estimatedDuration }) {
  const e = {};
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

export function validateAssignmentForm({ title, description, dueDateDisplay, maxScore, passingScore }) {
  const e = {};
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
