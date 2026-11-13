// Define los roles institucionales posibles para un usuario en la plataforma.
export type RolUsuario = 'admin' | 'instructor' | 'preceptor' | 'student';

// Define la estructura del perfil de un usuario autenticado en el cliente.
export interface UsuarioCliente {
  id: number;
  firstName: string;
  lastName: string;
  name?: string;
  email: string;
  role: RolUsuario;
  status?: string;
  schoolYear?: number | null;
  courseDivision?: number | null;
  schoolGroupLabel?: string | null;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  createdByAdmin?: boolean;
  avatarUrl?: string | null;
  bio?: string | null;
  preferences?: {
    theme?: 'light' | 'dark';
    notifications?: boolean;
    language?: string;
    [clave: string]: any;
  };
  permissions?: string[];
  [clave: string]: any;
}

// Define la estructura de una paleta de colores del sistema de diseño.
export interface PaletaColores {
  mode: 'light' | 'dark';
  navy: string;
  navySurface: string;
  primary: string;
  primaryLight: string;
  primarySoft?: string;
  secondary: string;
  secondaryLight: string;
  accent: string;
  info: string;
  bg: string;
  background: string;
  card: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  muted: string;
  textMuted: string;
  border: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  warningSoft: string;
  danger: string;
  dangerLight: string;
  overlay: string;
  amber: string;
  emerald: string;
  violet: string;
  cyan: string;
  rose: string;
}

// Define la estructura de un curso o materia académica.
export interface CursoAcademico {
  id: number;
  title: string;
  shortDescription?: string;
  summary?: string;
  description?: string;
  categoryId?: number;
  categoryName?: string;
  subjectId?: number | null;
  schoolYear?: number;
  courseDivision?: number;
  schoolGroupLabel?: string;
  instructorId?: number | null;
  instructorName?: string;
  status?: string;
  level?: string;
  estimatedDuration?: number;
  schedules?: BloqueHorario[];
  [clave: string]: any;
}

// Define la estructura de un bloque horario dentro del cronograma escolar.
export interface BloqueHorario {
  id?: number;
  courseId?: number;
  schoolYear?: number;
  courseDivision?: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  classroom?: string | null;
  courseTitle?: string;
  instructorName?: string;
  [clave: string]: any;
}

// Define la estructura de un archivo o enlace adjunto subido en la plataforma.
export interface ArchivoAdjunto {
  id?: string | number;
  name?: string;
  url: string;
  type?: string;
  kind?: string;
  mimeType?: string;
  size?: number;
  [clave: string]: any;
}

