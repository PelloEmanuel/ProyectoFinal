// Importa los tipos base de Express para extender la solicitud HTTP con el usuario autenticado.
import { Request, Response, NextFunction } from 'express';

// Define los roles institucionales válidos dentro del Campus Escolar.
export type RolUsuario = 'admin' | 'preceptor' | 'instructor' | 'student';

// Define los estados posibles de una cuenta de usuario en la base de datos.
export type EstadoUsuario = 'active' | 'pending_verification' | 'suspended';

// Define la estructura de preferencias personalizadas almacenadas por usuario.
export interface PreferenciasUsuario {
  theme: 'light' | 'dark';
  notifications: boolean;
  language: string;
  acceptedTermsAt?: string;
}

// Define la fila de usuario proveniente de la tabla usuarios en MySQL / TiDB.
export interface FilaUsuarioBD {
  id: number;
  first_name: string;
  last_name: string;
  username?: string | null;
  email: string;
  password_hash?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  role_id: number;
  role_name?: RolUsuario;
  role?: RolUsuario;
  status: EstadoUsuario;
  email_verified_at?: string | Date | null;
  two_factor_enabled?: number | boolean;
  created_by_admin?: number | boolean;
  school_year?: number | null;
  course_division?: number | null;
  preferences?: string | PreferenciasUsuario | null;
  created_at?: string | Date;
  updated_at?: string | Date;
  deleted_at?: string | Date | null;
}

// Define la estructura pública y serializada de un usuario para respuestas de la API.
export interface UsuarioPublico {
  id: number;
  firstName: string;
  lastName: string;
  name: string;
  username: string | null;
  email: string;
  avatarUrl: string | null;
  bio: string;
  role: RolUsuario;
  roleId: number;
  schoolYear: number | null;
  courseDivision: number | null;
  schoolGroupLabel: string | null;
  status: EstadoUsuario;
  isActive: boolean;
  emailVerified: boolean;
  emailVerifiedAt: string | Date | null;
  twoFactorEnabled: boolean;
  createdByAdmin: boolean;
  hasPassword: boolean;
  preferences: PreferenciasUsuario;
  permissions: string[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// Define la información resumida del usuario adjunta al objeto Request tras autenticar el JWT.
export interface UsuarioAutenticado {
  id: number;
  role: RolUsuario;
  roleId: number;
  email: string;
  name: string;
}

// Extiende la interfaz Request de Express para incluir los datos del usuario autenticado.
export interface SolicitudAutenticada extends Request {
  user?: UsuarioAutenticado;
}

// Define la firma estándar de un controlador asíncrono de Express en el proyecto.
export type ControladorExpress = (
  req: SolicitudAutenticada,
  res: Response,
  next: NextFunction
) => Promise< unknown> | unknown;

// Define la estructura de un bloque horario escolar asociado a una materia.
export interface BloqueHorario {
  id?: number;
  courseId?: number;
  schoolYear: number;
  courseDivision: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  classroom?: string | null;
  courseTitle?: string;
  instructorId?: number | null;
  instructorName?: string;
  categoryName?: string;
}

// Define la estructura de un archivo o enlace adjunto en lecciones, avisos o entregas.
export interface ArchivoAdjunto {
  id?: string;
  name?: string;
  fileName?: string;
  url?: string;
  fileUrl?: string;
  type?: string;
  mimeType?: string;
  size?: number;
  fileSize?: number;
  kind?: 'file' | 'link';
  createdAt?: string;
}

// Define el par de tokens de sesión emitidos al iniciar o refrescar sesión.
export interface ParTokensSesion {
  accessToken: string;
  refreshToken: string;
}

// Define el perfil normalizado devuelto por un proveedor OAuth 2.0 (Google, GitHub, Facebook, Discord).
export interface PerfilOAuth {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  emailVerified: boolean;
  avatar: string | null;
}
