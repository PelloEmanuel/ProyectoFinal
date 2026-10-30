/**
 * Archivo: mobile/src/components/SchoolScheduleGrid.js
 * Descripción: Cuadrícula visual de horarios por curso (ej. 6to 1ra) de Lunes a Viernes.
 * - Turno Mañana:
 *   • Módulo 1: 07:30 a 09:30
 *   • Módulo 2: 09:40 a 11:40
 *   • Módulo Extra: 11:50 a 12:50
 * - Turno Tarde:
 *   • Módulo 1: 13:00 a 14:50
 *   • Módulo 2: 15:10 a 17:10
 * Visible para Alumnos, Docentes y Administradores al ingresar a cualquier curso (ej. 6to 1ra).
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const GRID_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

export const OFFICIAL_MODULES = [
  {
    id: 'manana_1',
    shift: 'mañana',
    shiftLabel: 'Turno Mañana',
    title: '1° Módulo',
    label: '07:30 a 09:30',
    start: '07:30',
    end: '09:30',
    isExtra: false,
  },
  {
    id: 'manana_2',
    shift: 'mañana',
    shiftLabel: 'Turno Mañana',
    title: '2° Módulo',
    label: '09:40 a 11:40',
    start: '09:40',
    end: '11:40',
    isExtra: false,
  },
  {
    id: 'manana_extra',
    shift: 'mañana',
    shiftLabel: 'Turno Mañana (Extra)',
    title: 'Módulo Extra',
    label: '11:50 a 12:50',
    start: '11:50',
    end: '12:50',
    isExtra: true,
  },
  {
    id: 'tarde_1',
    shift: 'tarde',
    shiftLabel: 'Turno Tarde',
    title: '1° Módulo Tarde',
    label: '13:00 a 14:50',
    start: '13:00',
    end: '14:50',
    isExtra: false,
  },
  {
    id: 'tarde_2',
    shift: 'tarde',
    shiftLabel: 'Turno Tarde',
    title: '2° Módulo Tarde',
    label: '15:10 a 17:10',
    start: '15:10',
    end: '17:10',
    isExtra: false,
  },
  {
    id: 'tarde_extra',
    shift: 'tarde',
    shiftLabel: 'Turno Tarde (Extra)',
    title: 'Módulo Extra Tarde',
    label: '17:20 a 18:20',
    start: '17:20',
    end: '18:20',
    isExtra: true,
  },
];

const YEAR_NAMES = { 1: '1ro', 2: '2do', 3: '3ro', 4: '4to', 5: '5to', 6: '6to', 7: '7mo', 8: '8vo', 9: '9no' };
const DIV_NAMES = { 1: '1ra', 2: '2da', 3: '3ra', 4: '4ta', 5: '5ta', 6: '6ta', 7: '7ma', 8: '8va', 9: '9na' };

export function formatSchoolGroupShort(schoolYear = 1, courseDivision = 1) {
  const y = Number(schoolYear) || 1;
  const d = Number(courseDivision) || 1;
  return `${YEAR_NAMES[y] || `${y}°`} ${DIV_NAMES[d] || `${d}°`}`;
}

export function formatSchoolGroupFull(schoolYear = 1, courseDivision = 1) {
  const y = Number(schoolYear) || 1;
  const d = Number(courseDivision) || 1;
  return `${formatSchoolGroupShort(y, d)} (${y}° Año - ${d}° Curso)`;
}

/**
 * Encuentra el bloque horario asignado en un día y módulo dados
 * (coincidencia exacta o superposición dentro del rango del módulo).
 */
function findScheduleInCell(schedule = [], day, mod) {
  return schedule.find((item) => {
    if (item.dayOfWeek !== day) return false;
    const s = String(item.startTime || '').slice(0, 5);
    const e = String(item.endTime || '').slice(0, 5);
    if (s === mod.start && e === mod.end) return true;
    return s < mod.end && e > mod.start;
  });
}

export default function SchoolScheduleGrid({
  schoolYear = 6,
  courseDivision = 1,
  schedule = [],
  editable = false,
  highlightInstructorId = null,
  onPressOccupiedCell,
  onPressEmptyCell,
}) {
  const { colors } = useTheme();
  const [showExtraMorning, setShowExtraMorning] = useState(true);
  const [showAfternoon, setShowAfternoon] = useState(true);
  const [showExtraAfternoon, setShowExtraAfternoon] = useState(true);

  const shortCourseName = formatSchoolGroupShort(schoolYear, courseDivision);

  const morningModules = OFFICIAL_MODULES.filter(
    (m) => m.shift === 'mañana' && (!m.isExtra || showExtraMorning)
  );
  const afternoonModules = showAfternoon
    ? OFFICIAL_MODULES.filter(
        (m) => m.shift === 'tarde' && (!m.isExtra || showExtraAfternoon)
      )
    : [];

  // También detectar bloques con horarios personalizados fuera de los 5 módulos estándar
  const customBlocks = (schedule || []).filter((item) => {
    if (!GRID_DAYS.includes(item.dayOfWeek)) return true;
    return !OFFICIAL_MODULES.some((mod) => {
      const s = String(item.startTime || '').slice(0, 5);
      const e = String(item.endTime || '').slice(0, 5);
      return s < mod.end && e > mod.start;
    });
  });

  const renderModuleRow = (mod) => (
    <View
      key={mod.id}
      style={[
        styles.gridRow,
        {
          borderBottomColor: colors.border,
          backgroundColor: mod.isExtra
            ? colors.surfaceAlt || 'rgba(245, 158, 11, 0.06)'
            : colors.card,
        },
      ]}
    >
      {/* Columna izquierda: Horario del módulo */}
      <View
        style={[
          styles.timeCell,
          {
            borderRightColor: colors.border,
            backgroundColor: mod.isExtra
              ? 'rgba(245, 158, 11, 0.12)'
              : colors.surfaceAlt || colors.background,
          },
        ]}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '800',
            color: mod.isExtra ? colors.warning : colors.primary,
          }}
        >
          {mod.title}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text, marginTop: 2 }}>
          {mod.start} a {mod.end}
        </Text>
        {mod.isExtra && (
          <View
            style={{
              marginTop: 4,
              backgroundColor: colors.warning,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              alignSelf: 'flex-start',
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 9, fontWeight: '800' }}>EXTRA</Text>
          </View>
        )}
      </View>

      {/* Columnas Lunes a Viernes */}
      {GRID_DAYS.map((day) => {
        const entry = findScheduleInCell(schedule, day, mod);
        const hasTeacher =
          entry &&
          entry.instructorId &&
          entry.instructorName &&
          entry.instructorName !== 'Sin profesor asignado';
        const isHighlightedTeacher =
          entry &&
          highlightInstructorId &&
          Number(entry.instructorId) === Number(highlightInstructorId);

        if (entry) {
          return (
            <Pressable
              key={`${mod.id}-${day}`}
              onPress={() => onPressOccupiedCell && onPressOccupiedCell(entry, day, mod)}
              style={[
                styles.dayCell,
                {
                  borderRightColor: colors.border,
                  backgroundColor: isHighlightedTeacher
                    ? 'rgba(37, 99, 235, 0.16)'
                    : colors.primarySoft || 'rgba(37, 99, 235, 0.08)',
                },
              ]}
            >
              <View
                style={[
                  styles.subjectCardInCell,
                  {
                    borderLeftColor: isHighlightedTeacher
                      ? colors.success
                      : hasTeacher
                      ? colors.primary
                      : colors.warning,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={{ fontSize: 12, fontWeight: '800', color: colors.text }}
                  numberOfLines={2}
                >
                  {entry.courseTitle}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: hasTeacher ? colors.textSecondary : colors.warning,
                    marginTop: 3,
                  }}
                  numberOfLines={2}
                >
                  {hasTeacher ? `Prof. ${entry.instructorName}` : 'Sin profesor (Vacante)'}
                </Text>
                {editable && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Ionicons name="create-outline" size={11} color={colors.primary} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '800',
                        color: colors.primary,
                        marginLeft: 2,
                      }}
                    >
                      Editar
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={`${mod.id}-${day}`}
            disabled={!editable || !onPressEmptyCell}
            onPress={() => editable && onPressEmptyCell && onPressEmptyCell(day, mod)}
            style={[
              styles.dayCell,
              {
                borderRightColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            {editable ? (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 8,
                  alignItems: 'center',
                }}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: colors.primary,
                    marginTop: 2,
                  }}
                >
                  Asignar
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 11, color: colors.textMuted || '#94a3b8' }}>Libre</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Encabezado de la Cuadrícula del Curso */}
      <View style={[styles.banner, { backgroundColor: colors.navy }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTag, { color: colors.mode === 'light' ? colors.primary : '#93c5fd' }]}>CUADRÍCULA DE HORARIOS • LUNES A VIERNES</Text>
          <Text style={[styles.bannerTitle, { color: colors.mode === 'light' ? colors.text : '#ffffff' }]}>
            Curso {shortCourseName} ({schoolYear}° Año - {courseDivision}° División)
          </Text>
        </View>
      </View>

      {/* Controles rápidos para mostrar/ocultar Módulo Extra (11:50-12:50) y Turno Tarde */}
      <View
        style={[
          styles.filterBar,
          {
            borderBottomColor: colors.border,
            backgroundColor: colors.surfaceAlt || colors.background,
          },
        ]}
      >
        <Pressable
          onPress={() => setShowExtraMorning((v) => !v)}
          style={[
            styles.togglePill,
            {
              backgroundColor: showExtraMorning ? colors.primary : colors.card,
              borderColor: showExtraMorning ? colors.primary : colors.border,
            },
          ]}
        >
          <Ionicons
            name={showExtraMorning ? 'checkmark-circle' : 'add-circle-outline'}
            size={14}
            color={showExtraMorning ? '#ffffff' : colors.text}
            style={{ marginRight: 4 }}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: showExtraMorning ? '#ffffff' : colors.text,
            }}
          >
            Extra Mañana (11:50 a 12:50)
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setShowAfternoon((v) => !v)}
          style={[
            styles.togglePill,
            {
              backgroundColor: showAfternoon ? colors.primary : colors.card,
              borderColor: showAfternoon ? colors.primary : colors.border,
            },
          ]}
        >
          <Ionicons
            name={showAfternoon ? 'checkmark-circle' : 'add-circle-outline'}
            size={14}
            color={showAfternoon ? '#ffffff' : colors.text}
            style={{ marginRight: 4 }}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: showAfternoon ? '#ffffff' : colors.text,
            }}
          >
            Turno Tarde (13:00 a 17:10)
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setShowExtraAfternoon((v) => !v)}
          style={[
            styles.togglePill,
            {
              backgroundColor: showExtraAfternoon ? colors.primary : colors.card,
              borderColor: showExtraAfternoon ? colors.primary : colors.border,
            },
          ]}
        >
          <Ionicons
            name={showExtraAfternoon ? 'checkmark-circle' : 'add-circle-outline'}
            size={14}
            color={showExtraAfternoon ? '#ffffff' : colors.text}
            style={{ marginRight: 4 }}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: showExtraAfternoon ? '#ffffff' : colors.text,
            }}
          >
            Extra Tarde (17:20 a 18:20)
          </Text>
        </Pressable>
      </View>

      {/* Tabla desplazable horizontalmente para pantallas chicas y completa en Web/Tablet */}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.tableContainer}>
          {/* Cabecera de columnas: Horario | Lunes | Martes | Miércoles | Jueves | Viernes */}
          <View
            style={[
              styles.headerRow,
              {
                backgroundColor: '#1e293b',
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={[styles.timeHeaderCell, { borderRightColor: 'rgba(255,255,255,0.15)' }]}>
              <Text style={styles.headerText}>Módulo / Hora</Text>
            </View>
            {GRID_DAYS.map((day) => (
              <View
                key={day}
                style={[styles.dayHeaderCell, { borderRightColor: 'rgba(255,255,255,0.15)' }]}
              >
                <Text style={styles.headerText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Separador: TURNO MAÑANA */}
          <View style={[styles.shiftBanner, { backgroundColor: 'rgba(37, 99, 235, 0.12)' }]}>
            <Ionicons name="sunny-outline" size={15} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
              TURNO MAÑANA (07:30 a 09:30 • 09:40 a 11:40
              {showExtraMorning ? ' • Extra 11:50 a 12:50' : ''})
            </Text>
          </View>

          {morningModules.map(renderModuleRow)}

          {/* Separador: TURNO TARDE */}
          {showAfternoon && (
            <>
              <View style={[styles.shiftBanner, { backgroundColor: 'rgba(124, 58, 237, 0.12)' }]}>
                <Ionicons
                  name="partly-sunny-outline"
                  size={15}
                  color={colors.secondary || '#7c3aed'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '800',
                    color: colors.secondary || '#7c3aed',
                  }}
                >
                  TURNO TARDE (13:00 a 14:50 • 15:10 a 17:10)
                </Text>
              </View>
              {afternoonModules.map(renderModuleRow)}
            </>
          )}
        </View>
      </ScrollView>

      {/* Si hay bloques en horarios especiales fuera de los 5 módulos estándar */}
      {customBlocks.length > 0 && (
        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary, marginBottom: 6 }}>
            Otros horarios especiales cargados en {shortCourseName}:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {customBlocks.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => onPressOccupiedCell && onPressOccupiedCell(b, b.dayOfWeek, null)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }}>
                  {b.dayOfWeek} {b.startTime}-{b.endTime}: {b.courseTitle} ({b.instructorName})
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
  },
  banner: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerTag: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  filterBar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  tableContainer: {
    minWidth: 740,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  timeHeaderCell: {
    width: 125,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayHeaderCell: {
    width: 125,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
  },
  shiftBanner: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    minHeight: 82,
  },
  timeCell: {
    width: 125,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    justifyContent: 'center',
  },
  dayCell: {
    width: 125,
    padding: 6,
    borderRightWidth: 1,
    justifyContent: 'center',
  },
  subjectCardInCell: {
    flex: 1,
    borderRadius: 8,
    padding: 7,
    borderWidth: 1,
    borderLeftWidth: 4,
    justifyContent: 'center',
  },
});
