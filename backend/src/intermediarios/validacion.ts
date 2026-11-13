// Importa el recolector de resultados de express-validator y los tipos de Express.
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

// Verifica si existen errores de validación en la solicitud y devuelve HTTP 422 en caso afirmativo.
const validar = (req: Request, res: Response, next: NextFunction): Response | void => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e: any) => ({ field: e.path, message: e.msg }));
  return res.status(422).json({
    success: false,
    message: errors[0].message,
    errors,
    error: {
      code: 'VALIDATION_ERROR',
      message: errors[0].message,
      details: errors,
    },
  });
};

export default validar;
