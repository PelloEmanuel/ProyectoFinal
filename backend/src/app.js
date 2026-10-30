/**
 * Archivo: backend/src/app.js
 * Descripción: Configuración principal de la aplicación Express para SkillTrack API REST v1.
 * Registra middlewares de seguridad (helmet, cors), parseo JSON y todas las rutas del dominio.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { notFound, errorHandler } = require('./middlewares/error');

const app = express();
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Servir archivos estáticos subidos (imágenes, PDFs, material)
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Servir la aplicación Web de SkillTrack si está disponible
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
    service: 'SkillTrack API',
    platform: 'SkillTrack API',
    version: '1.0.0',
  })
);
app.get('/api/v1/health', (req, res) =>
  res.json({
    success: true,
    status: 'ok',
    service: 'SkillTrack API',
    platform: 'SkillTrack API',
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
