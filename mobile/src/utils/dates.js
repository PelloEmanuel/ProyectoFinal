/**
 * Archivo: mobile/src/utils/dates.js
 * Descripción: Utilidad centralizada para formateo y cálculos de tiempo estrictamente
 * bajo la zona horaria oficial de Buenos Aires, Argentina (America/Argentina/Buenos_Aires - UTC-3),
 * sin depender del reloj ni la zona horaria del dispositivo del usuario.
 */

export const BUENOS_AIRES_TZ = 'America/Argentina/Buenos_Aires';
export const BUENOS_AIRES_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3 permanente (Argentina no utiliza horario de verano)

const DAYS_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/**
 * Normaliza nombres de días (elimina acentos para comparación tolerante).
 */
export function normalizeDayName(day) {
  if (!day) return '';
  const d = String(day).trim().toLowerCase();
  if (d.startsWith('lun')) return 'Lunes';
  if (d.startsWith('mar')) return 'Martes';
  if (d.startsWith('mi')) return 'Miércoles';
  if (d.startsWith('jue')) return 'Jueves';
  if (d.startsWith('vie')) return 'Viernes';
  if (d.startsWith('s')) return 'Sábado';
  if (d.startsWith('dom')) return 'Domingo';
  return 'Lunes';
}

/**
 * Obtiene la fecha y hora actual exacta de Buenos Aires, Argentina (UTC-3).
 * Cálculo determinístico independiente del reloj local y motor JS (Hermes/V8).
 */
export function getBuenosAiresNow() {
  const now = new Date();
  const baDate = new Date(now.getTime() + BUENOS_AIRES_OFFSET_MS);

  const year = baDate.getUTCFullYear();
  const month = baDate.getUTCMonth() + 1;
  const day = baDate.getUTCDate();
  const hour = baDate.getUTCHours();
  const minute = baDate.getUTCMinutes();
  const second = baDate.getUTCSeconds();

  // getUTCDay: 0=Domingo, 1=Lunes, 2=Martes... 6=Sábado
  const utcDay = baDate.getUTCDay();
  const dayIndex = utcDay === 0 ? 6 : utcDay - 1; // 0=Lunes ... 6=Domingo
  const weekday = DAYS_ORDER[dayIndex];

  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const dateString = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
    dayIndex: dayIndex >= 0 ? dayIndex : 0,
    timeString,
    dateString,
    totalMinutesToday: hour * 60 + minute,
  };
}

/**
 * Parsea una fecha/hora interpretándola estrictamente en zona horaria Buenos Aires (UTC-3).
 */
export function parseBuenosAiresDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (s.includes('Z') || s.includes('+') || (s.includes('-') && s.length > 20)) {
    return new Date(s);
  }
  const iso = s.includes(' ') ? s.replace(' ', 'T') : s.includes('T') ? s : `${s}T23:59:00`;
  return new Date(`${iso}-03:00`);
}

/**
 * Formato dd/mm/aaaa en zona horaria Buenos Aires.
 */
export function formatDate(value) {
  if (!value) return 'Sin fecha';
  const str = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;

  // Si viene de MySQL o formato local YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch && !str.includes('Z') && !str.includes('+')) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  // Si tiene Z o es objeto Date, convertir a Buenos Aires
  const ms = typeof value === 'number' ? value : value instanceof Date ? value.getTime() : new Date(str).getTime();
  if (Number.isNaN(ms)) return str;

  const ba = new Date(ms + BUENOS_AIRES_OFFSET_MS);
  const d = String(ba.getUTCDate()).padStart(2, '0');
  const m = String(ba.getUTCMonth() + 1).padStart(2, '0');
  const y = ba.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Formato dd/mm/aaaa HH:mm hs estrictamente bajo zona horaria Buenos Aires (UTC-3).
 * Maneja tanto strings directos de MySQL como ISO UTC y objetos Date.
 */
export function formatDateTime(value) {
  if (!value) return 'Sin fecha';

  // 1. Strings directos de base de datos (MySQL DATETIME en -03:00)
  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Coincidencia con YYYY-MM-DD HH:mm(:ss)? o YYYY-MM-DDTHH:mm(:ss)? sin Z ni +
    const matchBA = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:-03:00)?$/);
    if (matchBA && !trimmed.includes('Z') && !trimmed.includes('+')) {
      const [, y, m, d, hh, mm] = matchBA;
      return `${d}/${m}/${y} ${hh}:${mm} hs`;
    }

    // Formato ISO con Z o timezone
    if (trimmed.includes('Z') || trimmed.includes('+')) {
      const ms = new Date(trimmed).getTime();
      if (!Number.isNaN(ms)) {
        const ba = new Date(ms + BUENOS_AIRES_OFFSET_MS);
        const y = ba.getUTCFullYear();
        const m = String(ba.getUTCMonth() + 1).padStart(2, '0');
        const d = String(ba.getUTCDate()).padStart(2, '0');
        const hh = String(ba.getUTCHours()).padStart(2, '0');
        const mm = String(ba.getUTCMinutes()).padStart(2, '0');
        return `${d}/${m}/${y} ${hh}:${mm} hs`;
      }
    }
  }

  // 2. Objeto Date o timestamp numérico
  const ms = typeof value === 'number' ? value : value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(ms)) return formatDate(value);

  const ba = new Date(ms + BUENOS_AIRES_OFFSET_MS);
  const y = ba.getUTCFullYear();
  const m = String(ba.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ba.getUTCDate()).padStart(2, '0');
  const hh = String(ba.getUTCHours()).padStart(2, '0');
  const mm = String(ba.getUTCMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm} hs`;
}

export function formatDateAR(value, includeTime = false) {
  return includeTime ? formatDateTime(value) : formatDate(value);
}

/**
 * Formatea automáticamente la entrada numérica agregando barras dd/mm/aaaa.
 */
export function maskDateInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/**
 * Valida fecha dd/mm/aaaa y retorna formato ISO AAAA-MM-DD.
 */
export function parseDisplayDateToIso(input) {
  if (!input) return null;
  const clean = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10);

  const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Convierte "HH:MM" a minutos desde las 00:00.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calcula el próximo módulo a dictar (o el que está en curso ahora mismo)
 * para un docente, tomando estrictamente la hora y día de Buenos Aires.
 *
 * @param {Array} scheduleList Lista de bloques de horarios asignados al profesor
 * @returns {Object|null} Información del módulo próximo o en curso
 */
export function getNextScheduledClass(scheduleList = []) {
  if (!Array.isArray(scheduleList) || scheduleList.length === 0) {
    return null;
  }

  const now = getBuenosAiresNow();
  const currentWeekMinutes = now.dayIndex * 24 * 60 + now.totalMinutesToday;
  const TOTAL_WEEK_MINUTES = 7 * 24 * 60;

  let ongoingClass = null;
  const candidates = [];

  for (const item of scheduleList) {
    const itemDay = normalizeDayName(item.dayOfWeek);
    const dayIdx = DAYS_ORDER.indexOf(itemDay);
    if (dayIdx < 0) continue;

    const startMins = parseTimeToMinutes(item.startTime);
    const endMins = parseTimeToMinutes(item.endTime);

    // ¿Está en curso ahora mismo?
    if (dayIdx === now.dayIndex && now.totalMinutesToday >= startMins && now.totalMinutesToday < endMins) {
      ongoingClass = {
        item,
        isOngoing: true,
        minutesUntilEnd: endMins - now.totalMinutesToday,
        statusText: `¡Dictando en curso ahora! (hasta las ${item.endTime} hs)`,
        badgeText: 'EN CURSO AHORA',
        badgeTone: 'success',
      };
      break;
    }

    // Minutos dentro de la semana
    const itemWeekStart = dayIdx * 24 * 60 + startMins;
    let diffMinutes = itemWeekStart - currentWeekMinutes;
    if (diffMinutes <= 0) {
      // Ocurrirá la próxima semana
      diffMinutes += TOTAL_WEEK_MINUTES;
    }

    // Calcular etiqueta legible (Hoy, Mañana, etc.)
    let dayLabel = '';
    const daysAway = (dayIdx - now.dayIndex + 7) % 7;
    if (daysAway === 0 && diffMinutes < 24 * 60) {
      dayLabel = 'Hoy';
    } else if (daysAway === 1) {
      dayLabel = 'Mañana';
    } else {
      dayLabel = itemDay;
    }

    candidates.push({
      item,
      isOngoing: false,
      diffMinutes,
      daysAway,
      dayLabel,
      statusText: `${dayLabel} a las ${item.startTime} hs`,
      badgeText: daysAway === 0 ? 'HOY' : daysAway === 1 ? 'MAÑANA' : itemDay.toUpperCase(),
      badgeTone: daysAway === 0 ? 'warning' : 'primary',
    });
  }

  if (ongoingClass) {
    return ongoingClass;
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.diffMinutes - b.diffMinutes);
  return candidates[0];
}

/**
 * Formatea una entrada numérica de fecha al formato estricto Día/Mes/Año (DD/MM/AAAA).
 * Acepta únicamente números (0-9) e inserta automáticamente las barras separadoras "/".
 */
export function formatNumericDateInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Formatea una entrada numérica de horario al formato HH:MM (solo números 0-9).
 * Inserta automáticamente los dos puntos ":".
 */
export function formatNumericTimeInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
