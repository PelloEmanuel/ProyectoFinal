// Importa los tipos de solicitud, respuesta y siguiente middleware de Express.
import { Response, NextFunction } from 'express';
import { SolicitudAutenticada, ControladorExpress } from '../tipos';

// Define la estructura de un detalle individual de error de validación.
export interface DetalleErrorValidacion {
  field: string;
  message: string;
}

// Define la clase de error de aplicación con código de estado HTTP y metadatos estructurados.
export class AppError extends Error {
  status: number;
  code: string;
  details: unknown;
  errors?: DetalleErrorValidacion[];

  // Inicializa una instancia de error controlado con mensaje, estado HTTP, código interno y detalles.
  constructor(message: string, status: number = 400, code: string = 'BAD_REQUEST', details: unknown = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    if (Array.isArray(details)) {
      this.errors = details as DetalleErrorValidacion[];
    }
  }
}

// Envuelve un controlador asíncrono para capturar promesas rechazadas y delegarlas al middleware de errores.
export const asyncHandler =
  (fn: ControladorExpress) =>
  (req: SolicitudAutenticada, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
