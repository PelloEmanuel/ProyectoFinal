// Define las constantes de huso horario y desplazamiento fijo para Buenos Aires, Argentina (UTC-3).
export const BUENOS_AIRES_TZ = 'America/Argentina/Buenos_Aires';
export const BUENOS_AIRES_OFFSET_MS = -3 * 60 * 60 * 1000;

// Define el orden oficial de los días de la semana comenzando por el lunes.
const DAYS_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Normaliza el nombre de un día de la semana a su formato estándar con mayúscula inicial y tilde.
export function normalizeDayName(day?: string | null): string {
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

// Calcula la fecha, hora y día de la semana actuales exactamente en la zona horaria de Buenos Aires (UTC-3).
export function getBuenosAiresNow() {
  const now = new Date();
  const baDate = new Date(now.getTime() + BUENOS_AIRES_OFFSET_MS);

  const year = baDate.getUTCFullYear();
  const month = baDate.getUTCMonth() + 1;
  const day = baDate.getUTCDate();
  const hour = baDate.getUTCHours();
  const minute = baDate.getUTCMinutes();
  const second = baDate.getUTCSeconds();

  const utcDay = baDate.getUTCDay();
  const dayIndex = utcDay === 0 ? 6 : utcDay - 1;
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

// Convierte una cadena de fecha y hora en un objeto Date interpretado bajo el huso horario UTC-3.
export function parseBuenosAiresDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (s.includes('Z') || s.includes('+') || (s.includes('-') && s.length > 20)) {
    return new Date(s);
  }
  const iso = s.includes(' ') ? s.replace(' ', 'T') : s.includes('T') ? s : `${s}T23:59:00`;
  return new Date(`${iso}-03:00`);
}

// Formatea un valor de fecha al formato argentino DD/MM/AAAA.
export function formatDate(value?: string | number | Date | null): string {
  if (!value) return 'Sin fecha';
  const str = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch && !str.includes('Z') && !str.includes('+')) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const ms = typeof value === 'number' ? value : value instanceof Date ? value.getTime() : new Date(str).getTime();
  if (Number.isNaN(ms)) return str;

  const ba = new Date(ms + BUENOS_AIRES_OFFSET_MS);
  const d = String(ba.getUTCDate()).padStart(2, '0');
  const m = String(ba.getUTCMonth() + 1).padStart(2, '0');
  const y = ba.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

// Formatea un valor de fecha y hora al formato DD/MM/AAAA HH:mm hs en hora de Buenos Aires.
export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return 'Sin fecha';

  // Procesa cadenas provenientes directamente de MySQL o en formato ISO.
  if (typeof value === 'string') {
    const trimmed = value.trim();

    const matchBA = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:-03:00)?$/);
    if (matchBA && !trimmed.includes('Z') && !trimmed.includes('+')) {
      const [, y, m, d, hh, mm] = matchBA;
      return `${d}/${m}/${y} ${hh}:${mm} hs`;
    }

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

  // Procesa instancias Date o marcas de tiempo numéricas.
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

// Formatea una fecha en estilo argentino incluyendo opcionalmente el horario.
export function formatDateAR(value?: string | number | Date | null, includeTime = false): string {
  return includeTime ? formatDateTime(value) : formatDate(value);
}

// Aplica una máscara automática DD/MM/AAAA mientras el usuario escribe dígitos numéricos.
export function maskDateInput(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

// Valida una fecha en formato DD/MM/AAAA y la convierte al estándar ISO AAAA-MM-DD.
export function parseDisplayDateToIso(input?: string | null): string | null {
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

// Convierte una cadena horaria HH:MM en la cantidad total de minutos desde la medianoche.
function parseTimeToMinutes(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Determina qué clase del cronograma se está dictando en este instante o cuál es la próxima en comenzar.
export function getNextScheduledClass(scheduleList: any[] = []): any | null {
  if (!Array.isArray(scheduleList) || scheduleList.length === 0) {
    return null;
  }

  const now = getBuenosAiresNow();
  const currentWeekMinutes = now.dayIndex * 24 * 60 + now.totalMinutesToday;
  const TOTAL_WEEK_MINUTES = 7 * 24 * 60;

  let ongoingClass: any = null;
  const candidates: any[] = [];

  for (const item of scheduleList) {
    const itemDay = normalizeDayName(item.dayOfWeek);
    const dayIdx = DAYS_ORDER.indexOf(itemDay);
    if (dayIdx < 0) continue;

    const startMins = parseTimeToMinutes(item.startTime);
    const endMins = parseTimeToMinutes(item.endTime);

    // Verifica si el bloque horario se encuentra en curso en este momento.
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

    // Calcula la diferencia en minutos hasta el próximo inicio del bloque en la semana.
    const itemWeekStart = dayIdx * 24 * 60 + startMins;
    let diffMinutes = itemWeekStart - currentWeekMinutes;
    if (diffMinutes <= 0) {
      diffMinutes += TOTAL_WEEK_MINUTES;
    }

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

// Formatea la entrada numérica de fecha agregando barras separadoras DD/MM/AAAA.
export function formatNumericDateInput(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// Formatea la entrada numérica de hora insertando dos puntos HH:MM.
export function formatNumericTimeInput(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
