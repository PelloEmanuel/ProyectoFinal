// Traduce errores de red y respuestas HTTP de la API en mensajes comprensibles en español para el usuario.
export function getErrorMessage(err: any): string {
  if (!err) return 'Ocurrió un error inesperado.';
  if (err.code === 'ECONNABORTED') {
    return 'El servidor tardó demasiado en responder. Verificá tu conexión e intentá nuevamente.';
  }
  if (err instanceof Error && !(err as any).isAxiosError && !(err as any).response) {
    return err.message || 'Ocurrió un error inesperado en la aplicación.';
  }
  if (!err.response) {
    return 'No se pudo conectar con el servidor del Campus. Verificá tu conexión a internet.';
  }
  const { status, data } = err.response;
  if (data?.message) return data.message;
  if (data?.error?.message) return data.error.message;
  if (status === 401) return 'Tu sesión venció o las credenciales son incorrectas.';
  if (status === 403) return 'No tenés permisos para realizar esta acción.';
  if (status === 404) return 'El recurso solicitado no existe.';
  if (status === 409) return 'Conflicto de datos: el registro ya existe.';
  if (status === 429) return 'Demasiados intentos seguidos. Esperá unos minutos.';
  if (status >= 500) return 'Error temporal del servidor. Intentá nuevamente en unos instantes.';
  return 'Ocurrió un error al procesar la solicitud.';
}

// Extrae un diccionario de errores por campo a partir de la respuesta de validación del servidor.
export function getFieldErrors(err: any): Record<string, string> {
  const out: Record<string, string> = {};
  const list = err?.response?.data?.errors || err?.response?.data?.error?.details || [];
  if (Array.isArray(list)) {
    list.forEach((e: any) => {
      if (e?.field && !out[e.field]) out[e.field] = e.message;
    });
  }
  return out;
}

// Alias compatible para extracción directa de mensajes de error.
export const extractErrorMessage = getErrorMessage;
