/**
 * Archivo: backend/src/app.js
 * Descripción: Configuración principal de la aplicación Express para Campus API REST v1.
 * Registra middlewares de seguridad (helmet, cors), parseo JSON y todas las rutas del dominio.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { notFound, errorHandler } = require('./middlewares/error');

const app = express();
app.set('trust proxy', 1);
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
          'https://api.github.com'
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
          'https://api.qrserver.com'
        ],
        fontSrc: ["'self'", 'data:'],
      },
    },
  })
);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Servir archivos estáticos subidos (imágenes, PDFs, material)
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Servir la aplicación Web del Campus si está disponible
const fs = require('fs');
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

app.get('/health', (req, res) =>
  res.json({
    success: true,
    status: 'ok',
    service: 'Campus API',
    platform: 'Campus API',
    version: '1.0.0',
  })
);
app.get('/api/v1/health', (req, res) =>
  res.json({
    success: true,
    status: 'ok',
    service: 'Campus API',
    platform: 'Campus API',
    version: '1.0.0',
  })
);

app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/users', require('./routes/users.routes'));
app.use('/api/v1/courses', require('./routes/courses.routes'));
app.use('/api/v1/uploads', require('./routes/uploads.routes'));
app.use('/api/v1', require('./routes/assignments.routes'));
app.use('/api/v1/attendance', require('./routes/attendance.routes'));
app.use('/api/v1', require('./routes/admin.routes'));

// Si no es una ruta de API ni upload, y existe la app web, servir index.html
if (activeWebPath) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(activeWebPath, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
