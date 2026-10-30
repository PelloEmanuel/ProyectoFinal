/**
 * Archivo: backend/src/routes/uploads.routes.js
 * Descripción: Endpoint para subida universal de archivos (PDFs, imágenes, documentos, etc.)
 * y registro de enlaces externos para materias, teoría y actividades.
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { authenticate } = require('../middlewares/auth');
const { AppError, asyncHandler } = require('../utils/errors');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { name, type, data, url, kind } = req.body;

    // Caso 1: Enlace web externo
    if (url && (kind === 'link' || type === 'link' || !data)) {
      const cleanUrl = String(url).trim();
      if (!/^https?:\/\//i.test(cleanUrl)) {
        throw new AppError('El enlace debe comenzar con http:// o https://', 422);
      }
      return res.status(201).json({
        success: true,
        data: {
          id: crypto.randomUUID(),
          name: (name || cleanUrl).trim(),
          url: cleanUrl,
          type: 'link',
          kind: 'link',
          createdAt: new Date().toISOString(),
        },
      });
    }

    // Caso 2: Archivo binario codificado en Base64
    if (!data) {
      throw new AppError('No se proporcionaron datos de archivo ni enlace.', 400);
    }

    let fileBuffer;
    let mimeType = type || 'application/octet-stream';

    if (typeof data === 'string' && data.includes(';base64,')) {
      const parts = data.split(';base64,');
      mimeType = parts[0].replace('data:', '') || mimeType;
      fileBuffer = Buffer.from(parts[1], 'base64');
    } else if (typeof data === 'string') {
      fileBuffer = Buffer.from(data, 'base64');
    } else {
      throw new AppError('Formato de datos de archivo inválido.', 400);
    }

    // Limitar tamaño a 50MB
    const MAX_BYTES = 50 * 1024 * 1024;
    if (fileBuffer.length > MAX_BYTES) {
      throw new AppError('El archivo supera el tamaño máximo permitido (50 MB).', 413);
    }

    const rawExt = path.extname(name || '') || '';
    const rawBase = path.basename(name || 'archivo', rawExt) || 'archivo';
    const safeBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'adjunto';
    const safeExt = rawExt.replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBase}${safeExt}`;
    const filePath = path.join(UPLOADS_DIR, uniqueName);

    await fs.promises.writeFile(filePath, fileBuffer);

    const fileUrl = `/uploads/${uniqueName}`;

    res.status(201).json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        name: name || uniqueName,
        url: fileUrl,
        size: fileBuffer.length,
        type: mimeType,
        kind: 'file',
        createdAt: new Date().toISOString(),
      },
    });
  })
);

module.exports = router;
