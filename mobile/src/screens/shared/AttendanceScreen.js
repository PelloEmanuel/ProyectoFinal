import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { attendanceApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  SectionHeader,
} from '../../components/ui';

const MONTHS = [
  { id: 1, name: 'Enero' },
  { id: 2, name: 'Febrero' },
  { id: 3, name: 'Marzo' },
  { id: 4, name: 'Abril' },
  { id: 5, name: 'Mayo' },
  { id: 6, name: 'Junio' },
  { id: 7, name: 'Julio' },
  { id: 8, name: 'Agosto' },
  { id: 9, name: 'Septiembre' },
  { id: 10, name: 'Octubre' },
  { id: 11, name: 'Noviembre' },
  { id: 12, name: 'Diciembre' },
];

const ATTENDANCE_STATUSES = [
  {
    key: 'presente',
    label: 'Presente',
    short: 'P',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    icon: 'checkmark-circle',
    description: 'El alumno asistió a clases.',
  },
  {
    key: 'falta_completa',
    label: 'Falta Completa (1)',
    short: 'F',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    icon: 'close-circle',
    description: 'Ausente toda la jornada escolar (1 falta).',
  },
  {
    key: 'media_falta',
    label: 'Media Falta (0.5)',
    short: '½',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.15)',
    icon: 'time-outline',
    description: 'Llegada tarde o retiro anticipado (0.5 falta).',
  },
  {
    key: 'cuarto_falta',
    label: 'Cuarto de Falta (0.25)',
    short: '¼',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    icon: 'hourglass-outline',
    description: 'Tardanza menor a 15 minutos (0.25 falta).',
  },
  {
    key: 'justificada',
    label: 'Falta Justificada',
    short: 'FJ',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    icon: 'document-text-outline',
    description: 'Ausencia respaldada por certificado médico o nota.',
  },
  {
    key: 'nulo',
    label: 'Nulo (Sin registrar / Suspendido)',
    short: 'N',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.15)',
    icon: 'ban-outline',
    description: 'Día por defecto o no computable (suspensión de clases, feriado o sin registrar aún).',
  },
];

export default function AttendanceScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const isPreceptor = user?.role === 'preceptor';

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const [openCourses, setOpenCourses] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null); // { schoolYear, courseDivision }

  const [sheetData, setSheetData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal para editar asistencia de un alumno (Preceptor) o ver detalle (Docente/Admin)
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null); // { student, day, currentStatus, currentNotes }
  const [cellStatus, setCellStatus] = useState('presente');
  const [cellNotes, setCellNotes] = useState('');
  const [savingCell, setSavingCell] = useState(false);

  // Modal para suspender clases / día nulo
  const [nullDayModalVisible, setNullDayModalVisible] = useState(false);
  const [nullDayDate, setNullDayDate] = useState('');
  const [nullDayReason, setNullDayReason] = useState('Suspensión institucional de actividades');
  const [savingNullDay, setSavingNullDay] = useState(false);

  // Modal para confirmar asistencia de los alumnos (Preceptor)
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchDate, setBatchDate] = useState('');
  const [batchStatuses, setBatchStatuses] = useState({});
  const [savingBatch, setSavingBatch] = useState(false);

  // 1. Cargar lista de cursos abiertos
  const loadOpenCourses = useCallback(async () => {
    try {
      const res = await attendanceApi.getOpenCourses();
      const groups = Array.isArray(res) ? res : res?.data || [];
      setOpenCourses(groups);

      if (groups.length > 0) {
        setSelectedGroup((prev) => {
          if (prev) {
            const found = groups.find((g) => g.schoolYear === prev.schoolYear && g.courseDivision === prev.courseDivision);
            if (found) return found;
          }
          const sy = route?.params?.schoolYear ? Number(route.params.schoolYear) : groups[0].schoolYear;
          const cd = route?.params?.courseDivision ? Number(route.params.courseDivision) : groups[0].courseDivision;
          const match = groups.find((g) => g.schoolYear === sy && g.courseDivision === cd) || groups[0];
          return match;
        });
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [route?.params]);

  // 2. Cargar cuadrícula mensual de asistencia
  const loadAttendanceSheet = useCallback(
    async (isRefresh = false, groupToLoad = selectedGroup, monthToLoad = selectedMonth, yearToLoad = selectedYear) => {
      const grp = groupToLoad || selectedGroup;
      if (!grp) return;
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');

        const res = await attendanceApi.getSheet({
          schoolYear: grp.schoolYear,
          courseDivision: grp.courseDivision,
          month: monthToLoad,
          year: yearToLoad,
        });

        const raw = res?.days ? res : res?.data || res;
        const data = {
          ...raw,
          days: (raw?.days || []).filter((d) => d.dayOfWeek === undefined || (d.dayOfWeek >= 1 && d.dayOfWeek <= 5)),
        };
        setSheetData(data);
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedGroup, selectedMonth, selectedYear]
  );

  useEffect(() => {
    loadOpenCourses();
  }, [loadOpenCourses]);

  useEffect(() => {
    if (selectedGroup) {
      loadAttendanceSheet(false, selectedGroup, selectedMonth, selectedYear);
    }
  }, [selectedGroup, selectedMonth, selectedYear, loadAttendanceSheet]);

  useFocusEffect(
    useCallback(() => {
      if (selectedGroup) {
        loadAttendanceSheet(false, selectedGroup, selectedMonth, selectedYear);
      }
    }, [selectedGroup, selectedMonth, selectedYear, loadAttendanceSheet])
  );

  // Manejar click en una celda
  const handleCellPress = (student, day) => {
    const currentStatus = student.attendance[day.date] || 'nulo';
    setSelectedCell({
      student,
      day,
      currentStatus,
    });
    setCellStatus(currentStatus);
    setCellNotes('');
    setEditModalVisible(true);
  };

  // Guardar asistencia individual
  const handleSaveCell = async () => {
    if (!selectedCell || !isPreceptor) return;
    try {
      setSavingCell(true);
      setError('');
      setSuccess('');

      await attendanceApi.recordAttendance({
        schoolYear: selectedGroup.schoolYear,
        courseDivision: selectedGroup.courseDivision,
        studentId: selectedCell.student.id,
        date: selectedCell.day.date,
        status: cellStatus,
        notes: cellNotes.trim() || null,
      });

      setEditModalVisible(false);
      setSelectedCell(null);
      setSuccess(`Asistencia de ${selectedCell.student.fullName} actualizada.`);
      await loadAttendanceSheet(true, selectedGroup, selectedMonth, selectedYear);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingCell(false);
    }
  };

  // Declarar día Nulo (Suspensión de clases para todo el curso)
  const handleSaveNullDay = async () => {
    if (!nullDayDate || !isPreceptor) return;
    try {
      setSavingNullDay(true);
      setError('');
      setSuccess('');

      const res = await attendanceApi.setDayStatus({
        schoolYear: selectedGroup.schoolYear,
        courseDivision: selectedGroup.courseDivision,
        date: nullDayDate,
        status: 'nulo',
        notes: nullDayReason.trim() || 'Suspensión de clases',
      });

      setNullDayModalVisible(false);
      setSuccess(res?.message || `Día ${nullDayDate} establecido como Nulo.`);
      await loadAttendanceSheet(true, selectedGroup, selectedMonth, selectedYear);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingNullDay(false);
    }
  };

  // Abrir modal de confirmación masiva de asistencia
  const handleOpenBatchModal = () => {
    if (!sheetData?.students || sheetData.students.length === 0) return;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isTodayInDays = (sheetData.days || []).some((d) => d.date === todayStr);
    const initialDate = isTodayInDays ? todayStr : sheetData.days?.[0]?.date || '';
    setBatchDate(initialDate);

    const initialStatuses = {};
    for (const st of sheetData.students) {
      const cur = st.attendance[initialDate];
      initialStatuses[st.id] = cur && cur !== 'nulo' ? cur : 'presente';
    }
    setBatchStatuses(initialStatuses);
    setBatchModalVisible(true);
  };

  // Cambiar fecha en el modal masivo
  const handleBatchDateChange = (newDate) => {
    setBatchDate(newDate);
    const updated = {};
    for (const st of sheetData.students) {
      const cur = st.attendance[newDate];
      updated[st.id] = cur && cur !== 'nulo' ? cur : 'presente';
    }
    setBatchStatuses(updated);
  };

  // Marcar todos los alumnos como Presente
  const handleMarkAllPresent = () => {
    const updated = {};
    for (const st of sheetData.students) {
      updated[st.id] = 'presente';
    }
    setBatchStatuses(updated);
  };

  // Confirmar y guardar la asistencia masiva
  const handleConfirmBatch = async () => {
    if (!selectedGroup || !batchDate || !isPreceptor) return;
    try {
      setSavingBatch(true);
      setError('');
      setSuccess('');

      const updates = sheetData.students.map((st) => ({
        studentId: st.id,
        date: batchDate,
        status: batchStatuses[st.id] || 'presente',
      }));

      await attendanceApi.recordAttendance({
        schoolYear: selectedGroup.schoolYear,
        courseDivision: selectedGroup.courseDivision,
        updates,
      });

      setBatchModalVisible(false);
      setSuccess(`¡Asistencia confirmada exitosamente para ${updates.length} alumnos el ${batchDate}!`);
      await loadAttendanceSheet(true, selectedGroup, selectedMonth, selectedYear);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingBatch(false);
    }
  };

  const getStatusBadge = (statusKey) => {
    return (
      ATTENDANCE_STATUSES.find((s) => s.key === statusKey) || {
        short: 'N',
        label: 'Nulo (Sin registrar)',
        color: '#6b7280',
        bgColor: isDark ? 'rgba(107, 114, 128, 0.25)' : 'rgba(107, 114, 128, 0.15)',
      }
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadAttendanceSheet(true)}
          tintColor={colors.primary}
        />
      }
    >
      {/* Encabezado */}
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text }}>
          Planilla Oficial de Asistencia
        </Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
          {isPreceptor
            ? 'Panel de Preceptoría: Tocá una celda para registrar o modificar la asistencia.'
            : 'Modo Observador: Visualización de asistencias y cómputo de faltas en tiempo real.'}
        </Text>
      </View>

      <AlertBanner type="error" message={error} />
      <AlertBanner type="success" message={success} />

      {/* 1. Selector de Curso Escolar Abierto */}
      <Card style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
          1. Curso Escolar Abierto:
        </Text>
        {openCourses.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            No hay cursos abiertos actualmente en el sistema.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {openCourses.map((grp) => {
                const isSelected =
                  selectedGroup?.schoolYear === grp.schoolYear &&
                  selectedGroup?.courseDivision === grp.courseDivision;
                return (
                  <Chip
                    key={grp.id}
                    label={`${grp.fullLabel} (${grp.studentsCount} alumnos)`}
                    selected={isSelected}
                    onPress={() => setSelectedGroup(grp)}
                  />
                );
              })}
            </View>
          </ScrollView>
        )}
      </Card>

      {/* 2. Selector de Mes (Enero a Diciembre) */}
      <Card style={{ marginBottom: 14 }}>
        <View style={styles.rowBetween}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
            2. Mes del Ciclo Lectivo {selectedYear}:
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => setSelectedYear((y) => y - 1)}
              style={[styles.yearBtn, { borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={14} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 13 }}>
              {selectedYear}
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedYear((y) => y + 1)}
              style={[styles.yearBtn, { borderColor: colors.border }]}
            >
              <Ionicons name="chevron-forward" size={14} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {MONTHS.map((m) => (
              <Chip
                key={m.id}
                label={m.name}
                selected={selectedMonth === m.id}
                onPress={() => setSelectedMonth(m.id)}
              />
            ))}
          </View>
        </ScrollView>
      </Card>

      {/* Acciones del Preceptor */}
      {isPreceptor && selectedGroup && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <Button
            title="Confirmar Asistencia"
            icon="checkmark-circle-outline"
            variant="primary"
            style={{ flex: 1.2, marginBottom: 0 }}
            onPress={handleOpenBatchModal}
          />
          <Button
            title="Día Nulo"
            icon="ban-outline"
            variant="outline"
            small
            style={{ flex: 0.8, marginBottom: 0 }}
            onPress={() => {
              const firstDay = sheetData?.days?.[0]?.date || '';
              setNullDayDate(firstDay);
              setNullDayModalVisible(true);
            }}
          />
        </View>
      )}

      {/* 3. Cuadrícula de Asistencia */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
      ) : !sheetData || sheetData.students.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No hay alumnos inscriptos en este curso"
          message="Para registrar o ver asistencia, primero vinculá o matriculá alumnos a este Año y División escolar."
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          {/* Título de la tabla */}
          <View
            style={{
              padding: 12,
              backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(79, 70, 229, 0.06)',
              borderBottomWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 13 }}>
              Asistencia de {sheetData.monthName} {sheetData.year} • {selectedGroup?.fullLabel}
            </Text>
            <Badge label={`${sheetData.students.length} alumnos`} tone="primary" />
          </View>

          {/* Tabla horizontalmente deslizable */}
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View>
              {/* Encabezado de columnas: Alumno + Días Lun-Vie + Totales */}
              <View
                style={[
                  styles.tableRow,
                  {
                    backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                    borderBottomWidth: 2,
                    borderColor: colors.border,
                  },
                ]}
              >
                {/* Columna Alumno */}
                <View style={[styles.colStudentHeader, { borderColor: colors.border }]}>
                  <Text style={[styles.headerCellText, { color: colors.text }]}>
                    Nómina de Alumnos (A-Z)
                  </Text>
                </View>

                {/* Columnas de Días Lun-Vie */}
                {(sheetData.days || []).map((day) => (
                  <View key={day.date} style={[styles.colDayHeader, { borderColor: colors.border }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary }}>
                      {day.dayName}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: colors.text }}>
                      {day.dayNumber}
                    </Text>
                  </View>
                ))}

                {/* Columnas de Totales de Faltas */}
                <View style={[styles.colStatsHeader, { borderColor: colors.border }]}>
                  <Text style={[styles.headerCellText, { color: '#ef4444' }]}>Total Faltas</Text>
                </View>
                <View style={[styles.colStatsHeader, { borderColor: colors.border }]}>
                  <Text style={[styles.headerCellText, { color: '#10b981' }]}>Presentes</Text>
                </View>
              </View>

              {/* Filas de Alumnos */}
              {sheetData.students.map((student, idx) => {
                const isEven = idx % 2 === 0;
                return (
                  <View
                    key={student.id}
                    style={[
                      styles.tableRow,
                      {
                        backgroundColor: isEven
                          ? isDark
                            ? '#0f172a'
                            : '#ffffff'
                          : isDark
                          ? '#141e33'
                          : '#f8fafc',
                        borderBottomWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {/* Nombre del alumno */}
                    <View style={[styles.colStudent, { borderColor: colors.border }]}>
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: 13, fontWeight: '700', color: colors.text }}
                      >
                        {idx + 1}. {student.fullName}
                      </Text>
                    </View>

                    {/* Celdas de asistencia por día */}
                    {(sheetData.days || []).map((day) => {
                      const stKey = student.attendance[day.date];
                      const badge = getStatusBadge(stKey);

                      return (
                        <TouchableOpacity
                          key={day.date}
                          activeOpacity={isPreceptor ? 0.7 : 1}
                          onPress={() => handleCellPress(student, day)}
                          style={[
                            styles.cellBtn,
                            {
                              backgroundColor: badge.bgColor,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.cellText, { color: badge.color }]}>
                            {badge.short}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Totales */}
                    <View style={[styles.colStats, { borderColor: colors.border }]}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '900',
                          color: student.stats.totalFaltas > 10 ? '#ef4444' : colors.text,
                        }}
                      >
                        {student.stats.totalFaltas}
                      </Text>
                    </View>
                    <View style={[styles.colStats, { borderColor: colors.border }]}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#10b981' }}>
                        {student.stats.presente}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Card>
      )}

      {/* Leyenda explicativa de estados */}
      <Card style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
          Referencias y Cómputo de Asistencia:
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ATTENDANCE_STATUSES.map((st) => (
            <View
              key={st.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: st.bgColor,
              }}
            >
              <Text style={{ fontWeight: '900', color: st.color, fontSize: 12 }}>
                [{st.short}]
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }}>
                {st.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* ==================================================================== */}
      {/* MODAL 1: REGISTRAR ASISTENCIA DE UN ALUMNO (SOLO PRECEPTOR)         */}
      {/* ==================================================================== */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {isPreceptor ? 'Registrar Asistencia' : 'Detalle de Asistencia'}
              </Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                padding: 10,
                borderRadius: 10,
                marginVertical: 10,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>
                {selectedCell?.student?.fullName}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Fecha: {selectedCell?.day?.dayName} {selectedCell?.day?.dayNumber} de{' '}
                {sheetData?.monthName} {sheetData?.year} ({selectedCell?.day?.date})
              </Text>
            </View>

            {isPreceptor ? (
              <View style={{ flexShrink: 1, maxHeight: 480 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
                  Seleccioná el estado a registrar:
                </Text>

                {/* Contenido scrolleable para que nunca se desborde la pantalla */}
                <ScrollView
                  style={{ maxHeight: 250, marginBottom: 10 }}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <View style={{ gap: 6, paddingRight: 4 }}>
                    {ATTENDANCE_STATUSES.map((st) => {
                      const isSelected = cellStatus === st.key;
                      return (
                        <TouchableOpacity
                          key={st.key}
                          onPress={() => setCellStatus(st.key)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                            padding: 9,
                            borderRadius: 10,
                            backgroundColor: isSelected ? st.bgColor : colors.surfaceAlt,
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? st.color : colors.border,
                          }}
                        >
                          <Ionicons
                            name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={isSelected ? st.color : colors.textSecondary}
                          />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: st.color }}>
                                {st.label}
                              </Text>
                              <View
                                style={{
                                  backgroundColor: st.bgColor,
                                  paddingHorizontal: 6,
                                  paddingVertical: 1,
                                  borderRadius: 4,
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '900', color: st.color }}>
                                  [{st.short}]
                                </Text>
                              </View>
                            </View>
                            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                              {st.description}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 10, marginBottom: 4 }}>
                    Observación opcional:
                  </Text>
                  <TextInput
                    value={cellNotes}
                    onChangeText={setCellNotes}
                    placeholder="Ej. Justificada con certificado médico..."
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.textInput,
                      {
                        color: colors.text,
                        backgroundColor: colors.surfaceAlt,
                        borderColor: colors.border,
                        marginBottom: 6,
                      },
                    ]}
                  />
                </ScrollView>

                {/* BOTÓN FIJO EN EL PIE DEL MODAL - SIEMPRE VISIBLE */}
                <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}>
                  <Button
                    title="Confirmar Asistencia"
                    icon="checkmark-circle"
                    variant="primary"
                    loading={savingCell}
                    onPress={handleSaveCell}
                    style={{ marginBottom: 0 }}
                  />
                  <Button
                    title="Cancelar"
                    variant="outline"
                    small
                    onPress={() => setEditModalVisible(false)}
                    style={{ marginBottom: 0 }}
                  />
                </View>
              </View>
            ) : (
              <View style={{ paddingVertical: 10 }}>
                {(() => {
                  const b = getStatusBadge(selectedCell?.currentStatus);
                  return (
                    <View
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        backgroundColor: b.bgColor,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '900', color: b.color }}>
                        {b.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                        {b.description}
                      </Text>
                    </View>
                  );
                })()}
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 14, textAlign: 'center' }}>
                  Solo los preceptores están habilitados para modificar este registro.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL 2: SUSPENDER CLASES / DÍA NULO (CURSO COMPLETO)               */}
      {/* ==================================================================== */}
      <Modal visible={nullDayModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Suspender Clases (Día Nulo)
              </Text>
              <TouchableOpacity onPress={() => setNullDayModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: colors.textSecondary, marginVertical: 8 }}>
              Esta acción marcará el día completo como "Nulo" para todos los alumnos de{' '}
              {selectedGroup?.fullLabel}, indicando que no hubo cómputo de asistencia por suspensión de clases.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
              Elegí la fecha del mes actual:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(sheetData?.days || []).map((d) => (
                  <Chip
                    key={d.date}
                    label={`${d.dayName} ${d.dayNumber}`}
                    selected={nullDayDate === d.date}
                    onPress={() => setNullDayDate(d.date)}
                  />
                ))}
              </View>
            </ScrollView>

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 }}>
              Motivo de la suspensión:
            </Text>
            <TextInput
              value={nullDayReason}
              onChangeText={setNullDayReason}
              placeholder="Ej. Desinfección, paro de transporte, acto patrio..."
              placeholderTextColor={colors.textMuted}
              style={[
                styles.textInput,
                {
                  color: colors.text,
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.border,
                },
              ]}
            />

            <Button
              title={`Confirmar Día Nulo (${nullDayDate})`}
              variant="danger"
              icon="ban-outline"
              loading={savingNullDay}
              onPress={handleSaveNullDay}
              style={{ marginTop: 14, marginBottom: 0 }}
            />
          </View>
        </View>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL 3: CONFIRMAR ASISTENCIA DE LOS ALUMNOS (PANEL MASIVO DEL DÍA) */}
      {/* ==================================================================== */}
      <Modal visible={batchModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, maxHeight: '92%' }]}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Confirmar Asistencia de Alumnos
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  {selectedGroup?.fullLabel} • Ciclo Lectivo {selectedYear}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBatchModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Selector del día a confirmar */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text, marginTop: 12, marginBottom: 6 }}>
              Seleccionar Día del Mes:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, maxHeight: 42 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(sheetData?.days || []).map((day) => {
                  const isSelected = batchDate === day.date;
                  return (
                    <TouchableOpacity
                      key={day.date}
                      onPress={() => handleBatchDateChange(day.date)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: isSelected ? colors.primary : colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.primary : colors.border,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: isSelected ? '#ffffff' : colors.text,
                        }}
                      >
                        {day.dayName} {day.dayNumber}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Botón rápido para marcar todos como presentes */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }}>
                Nómina ({sheetData?.students?.length || 0} alumnos):
              </Text>
              <TouchableOpacity
                onPress={handleMarkAllPresent}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: '#10b981',
                }}
              >
                <Ionicons name="checkmark-done" size={14} color="#10b981" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#10b981' }}>
                  Todos Presentes
                </Text>
              </TouchableOpacity>
            </View>

            {/* Lista con scroll de alumnos */}
            <ScrollView style={{ maxHeight: 300, marginBottom: 12 }} showsVerticalScrollIndicator={true}>
              {(sheetData?.students || []).map((st, idx) => (
                <View
                  key={st.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 13, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 }}
                  >
                    {idx + 1}. {st.fullName}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {ATTENDANCE_STATUSES.map((status) => {
                      const isSelected = (batchStatuses[st.id] || 'presente') === status.key;
                      return (
                        <TouchableOpacity
                          key={status.key}
                          onPress={() => setBatchStatuses((prev) => ({ ...prev, [st.id]: status.key }))}
                          style={{
                            paddingHorizontal: 7,
                            paddingVertical: 5,
                            borderRadius: 6,
                            backgroundColor: isSelected ? status.color : colors.surfaceAlt,
                            borderWidth: 1,
                            borderColor: isSelected ? status.color : colors.border,
                            minWidth: 26,
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '900',
                              color: isSelected ? '#ffffff' : colors.textSecondary,
                            }}
                          >
                            {status.short}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            <Button
              title="Confirmar Asistencia"
              icon="checkmark-circle"
              variant="primary"
              loading={savingBatch}
              onPress={handleConfirmBatch}
              style={{ marginBottom: 6 }}
            />
            <Button
              title="Cancelar"
              variant="outline"
              small
              onPress={() => setBatchModalVisible(false)}
              style={{ marginBottom: 0 }}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yearBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colStudentHeader: {
    width: 200,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRightWidth: 1,
  },
  colDayHeader: {
    width: 44,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  colStatsHeader: {
    width: 68,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  headerCellText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  colStudent: {
    width: 200,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    justifyContent: 'center',
  },
  cellBtn: {
    width: 44,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  cellText: {
    fontSize: 12,
    fontWeight: '900',
  },
  colStats: {
    width: 68,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 18,
    padding: 18,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
  },
});
