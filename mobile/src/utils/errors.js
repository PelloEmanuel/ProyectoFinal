/** Convierte cualquier error de axios en un mensaje claro para el usuario. */
export function getErrorMessage(err) {
  if (err?.code === 'ECONNABORTED') return 'El servidor tardó demasiado en responder. Intentá de nuevo.';
  if (!err?.response) return 'No hay conexión con el servidor. Revisá tu internet.';
  const { status, data } = err.response;
  if (data?.message) return data.message;
  if (status === 401) return 'Tu sesión venció. Iniciá sesión nuevamente.';
  if (status === 403) return 'No tenés permisos para realizar esta acción.';
  if (status === 404) return 'No se encontró lo que buscabas.';
  if (status >= 500) return 'Error del servidor. Intentá más tarde.';
  return 'Ocurrió un error inesperado.';
}

/** Errores por campo devueltos por la API (422) -> { campo: mensaje }. */
export function getFieldErrors(err) {
  const out = {};
  (err?.response?.data?.errors || []).forEach((e) => { if (!out[e.field]) out[e.field] = e.message; });
  return out;
}
