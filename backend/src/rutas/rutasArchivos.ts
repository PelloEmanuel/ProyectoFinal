import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { authenticate } from '../intermediarios/autenticacion';
import { AppError, asyncHandler } from '../utilidades/errores';

// Inicializa el enrutador para la subida de archivos y enlaces externos.
const router = Router();

// Asegura que el directorio público de almacenamiento de archivos exista en el disco.
const UPLOADS_DIR = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Procesa la subida de un archivo codificado en Base64 o el registro de un enlace web externo.
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, type, data, url, kind } = req.body;

    // Si se trata de un enlace externo, valida su protocolo HTTP/HTTPS y devuelve su descriptor.
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

    // Verifica que se hayan enviado los datos binarios del archivo en Base64.
    if (!data) {
      throw new AppError('No se proporcionaron datos de archivo ni enlace.', 400);
    }

    let fileBuffer: Buffer;
    let mimeType = type || 'application/octet-stream';

    // Decodifica el contenido Base64 extrayendo el tipo MIME si incluye prefijo Data URI.
    if (typeof data === 'string' && data.includes(';base64,')) {
      const parts = data.split(';base64,');
      mimeType = parts[0].replace('data:', '') || mimeType;
      fileBuffer = Buffer.from(parts[1], 'base64');
    } else if (typeof data === 'string') {
      fileBuffer = Buffer.from(data, 'base64');
    } else {
      throw new AppError('Formato de datos de archivo inválido.', 400);
    }

    // Valida que el tamaño del archivo no supere el límite máximo de 50 MB.
    const MAX_BYTES = 50 * 1024 * 1024;
    if (fileBuffer.length > MAX_BYTES) {
      throw new AppError('El archivo supera el tamaño máximo permitido (50 MB).', 413);
    }

    // Genera un nombre de archivo seguro y único y lo guarda en el directorio de subidas.
    const rawExt = path.extname(name || '') || '';
    const rawBase = path.basename(name || 'archivo', rawExt) || 'archivo';
    const safeBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'adjunto';
    const safeExt = rawExt.replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBase}${safeExt}`;
    const filePath = path.join(UPLOADS_DIR, uniqueName);

    await fs.promises.writeFile(filePath, fileBuffer);

    const fileUrl = `/uploads/${uniqueName}`;

    // Devuelve los metadatos y la URL pública del archivo almacenado.
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

export default router;
