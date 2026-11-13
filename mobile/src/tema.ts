import { PaletaColores } from './tipos';

// Define la paleta de colores institucional para el modo visual claro.
export const lightColors: PaletaColores = {
  mode: 'light',
  navy: '#f1f5f9',
  navySurface: '#e2e8f0',
  primary: '#b91c1c',
  primaryLight: '#fef2f2',
  secondary: '#15803d',
  secondaryLight: '#f0fdf4',
  accent: '#15803d',
  info: '#15803d',
  bg: '#ffffff',
  background: '#ffffff',
  card: '#f8fafc',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  text: '#0f172a',
  textSecondary: '#334155',
  muted: '#64748b',
  textMuted: '#64748b',
  border: '#e2e8f0',
  success: '#15803d',
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  warningSoft: '#fef3c7',
  danger: '#b91c1c',
  dangerLight: '#fee2e2',
  overlay: 'rgba(15, 23, 42, 0.45)',
  amber: '#d97706',
  emerald: '#15803d',
  violet: '#b91c1c',
  cyan: '#15803d',
  rose: '#b91c1c',
};

// Define la paleta de colores institucional para el modo visual oscuro.
export const darkColors: PaletaColores = {
  mode: 'dark',
  navy: '#222b38',
  navySurface: '#2f3a4c',
  primary: '#ef4444',
  primaryLight: '#450a0a',
  secondary: '#22c55e',
  secondaryLight: '#052e16',
  accent: '#22c55e',
  info: '#22c55e',
  bg: '#1e2430',
  background: '#1e2430',
  card: '#283141',
  surface: '#283141',
  surfaceAlt: '#333e52',
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  muted: '#94a3b8',
  textMuted: '#94a3b8',
  border: '#3a4659',
  success: '#22c55e',
  successLight: '#064e3b',
  warning: '#f59e0b',
  warningLight: '#451a03',
  warningSoft: '#451a03',
  danger: '#ef4444',
  dangerLight: '#4c0519',
  overlay: 'rgba(18, 22, 30, 0.75)',
  amber: '#fbbf24',
  emerald: '#22c55e',
  violet: '#ef4444',
  cyan: '#22c55e',
  rose: '#ef4444',
};

// Expone el objeto mutable de colores activos para compatibilidad con estilos estáticos.
export const colors: PaletaColores = { ...lightColors };

// Define la escala de espaciados estándar de la interfaz.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

// Define los radios de redondeo de bordes utilizados en tarjetas, botones e insignias.
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

// Mapea los identificadores de rol con sus etiquetas legibles en español.
export const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  instructor: 'Docente',
  student: 'Estudiante',
  preceptor: 'Preceptor/a',
};

// Define las etiquetas y colores asociados al nivel de dificultad de un curso.
export const LEVEL_LABELS: Record<string, { label: string; color: string }> = {
  beginner: { label: 'Inicial', color: '#16a34a' },
  intermediate: { label: 'Intermedio', color: '#d97706' },
  advanced: { label: 'Avanzado', color: '#dc2626' },
};

// Define las etiquetas y colores para el estado de publicación de un curso.
export const COURSE_STATUS: Record<string, { label: string; color: string }> = {
  published: { label: 'Publicado', color: '#16a34a' },
  draft: { label: 'Borrador', color: '#d97706' },
  archived: { label: 'Archivado', color: '#64748b' },
};

// Mapea los tipos de actividad evaluable con su descripción en español.
export const ASSIGNMENT_TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Cuestionario Opción Múltiple',
  quiz: 'Cuestionario Opción Múltiple',
  true_false: 'Verdadero o Falso',
  short_answer: 'Respuesta Breve',
  text_submission: 'Entrega de Desarrollo',
  file_submission: 'Entrega con Archivo',
};

// Define las etiquetas y colores para el estado de entrega de una actividad.
export const DELIVERY_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: '#d97706' },
  submitted: { label: 'Enviada', color: '#0284c7' },
  graded: { label: 'Corregida', color: '#16a34a' },
  overdue: { label: 'Vencida', color: '#dc2626' },
};
