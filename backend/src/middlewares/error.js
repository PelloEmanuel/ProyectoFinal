/** 404 para rutas inexistentes. */
exports.notFound = (req, res) => res.status(404).json({ message: 'Ruta no encontrada' });

/** Manejador global de errores. */
// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El registro ya existe' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON inválido' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 ? 'Error interno del servidor' : err.message,
    ...(err.errors && { errors: err.errors }),
  });
};
