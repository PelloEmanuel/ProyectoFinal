/**
 * Archivo: mobile/src/utils/dates.js
 * Descripción: Utilidad centralizada para formateo y cálculos de tiempo estrictamente
 * bajo la zona horaria oficial de Buenos Aires, Argentina (America/Argentina/Buenos_Aires - UTC-3),
 * sin depender del reloj ni la zona horaria del dispositivo del usuario.
 */

export const BUENOS_AIRES_TZ = 'America/Argentina/Buenos_Aires';

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
 */
export function getBuenosAiresNow() {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BUENOS_AIRES_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;

  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const second = Number(get('second'));

  // Día de la semana en español en Buenos Aires
  const dayFmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: BUENOS_AIRES_TZ,
    weekday: 'long',
  });
  const weekday = normalizeDayName(dayFmt.format(now));
  const dayIndex = DAYS_ORDER.indexOf(weekday); // 0 (Lunes) a 6 (Domingo)

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

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BUENOS_AIRES_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('day')}/${get('month')}/${get('year')}`;
}

/**
 * Formato dd/mm/aaaa HH:mm hs en zona horaria Buenos Aires.
 */
export function formatDateTime(value) {
  if (!value) return 'Sin fecha';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return formatDate(value);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BUENOS_AIRES_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')} hs`;
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
