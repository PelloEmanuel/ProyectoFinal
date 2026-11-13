import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { notFound, errorHandler } from './intermediarios/errores';
import rutasAcceso from './rutas/rutasAcceso';
import rutasUsuarios from './rutas/rutasUsuarios';
import rutasCursos from './rutas/rutasCursos';
import rutasArchivos from './rutas/rutasArchivos';
import rutasTareas from './rutas/rutasTareas';
import rutasAsistencia from './rutas/rutasAsistencia';
import rutasAdmin from './rutas/rutasAdmin';

// Configura la zona horaria predeterminada de Argentina para toda la aplicación.
process.env.TZ = 'America/Argentina/Buenos_Aires';

// Crea la instancia principal de la aplicación Express.
const app = express();
app.set('trust proxy', 1);

// Registra las políticas de seguridad HTTP mediante Helmet permitiendo recursos OAuth e imágenes externas.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          'https://*.google.com',
          'https://*.googleapis.com',
          'https://accounts.google.com',
          'https://*.onrender.com',
          'https://campus-58oe.onrender.com',
          'https://*.discord.com',
          'https://discord.com',
          'https://*.github.com',
          'https://api.github.com',
        ],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://*.googleusercontent.com',
          'https://*.gstatic.com',
          'https://cdn.discordapp.com',
          'https://*.githubusercontent.com',
          'https://api.qrserver.com',
        ],
        fontSrc: ["'self'", 'data:'],
      },
    },
  })
);

// Habilita CORS, el parseo de JSON/formularios de hasta 50 MB y el registro de peticiones HTTP.
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Sirve de forma estática los archivos subidos por docentes y estudiantes.
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Detecta y sirve la compilación web estática del Campus si se encuentra generada.
const publicWebPath = path.join(__dirname, '../public/web');
const mobileDistPath = path.join(__dirname, '../../mobile/dist');
const activeWebPath = fs.existsSync(publicWebPath)
  ? publicWebPath
  : fs.existsSync(mobileDistPath)
  ? mobileDistPath
  : null;

if (activeWebPath) {
  app.use(express.static(activeWebPath));
}

// Expone los endpoints de verificación de estado de salud del servicio.
app.get('/health', (_req: Request, res: Response) =>
  res.json({
    success: true,
    status: 'ok',
    service: 'Campus API',
    platform: 'Campus API',
    version: '1.0.0',
  })
);
app.get('/api/v1/health', (_req: Request, res: Response) =>
  res.json({
    success: true,
    status: 'ok',
    service: 'Campus API',
    platform: 'Campus API',
    version: '1.0.0',
  })
);

// Monta todos los módulos de rutas de la API REST v1.
app.use('/api/v1/auth', rutasAcceso);
app.use('/api/v1/users', rutasUsuarios);
app.use('/api/v1/courses', rutasCursos);
app.use('/api/v1/uploads', rutasArchivos);
app.use('/api/v1', rutasTareas);
app.use('/api/v1/attendance', rutasAsistencia);
app.use('/api/v1', rutasAdmin);

// Redirige cualquier ruta de navegación cliente hacia el archivo index.html de la aplicación web.
if (activeWebPath) {
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(activeWebPath, 'index.html'));
  });
}

// Registra los intermediarios de ruta no encontrada (404) y manejo centralizado de errores.
app.use(notFound);
app.use(errorHandler);

export default app;
