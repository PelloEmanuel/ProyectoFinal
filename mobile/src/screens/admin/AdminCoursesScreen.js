/**
 * Archivo: mobile/src/screens/admin/AdminCoursesScreen.js
 * Descripción: Gestión de Materias en Base de Datos y Armador de Cronograma Escolar del Administrador:
 * 1) Apartado "Crear Materias (BD)": permite agregar, editar y eliminar materias directamente en la base de datos
 *    (`school_subjects`) sin asignarles día ni horario todavía.
 * 2) Apartado "Cronograma por Curso": permite elegir Año (1° a 6°) y Curso (1° a 3°), seleccionar una materia
 *    de las ya creadas en la base de datos y asignarla en múltiples días y/o distintos horarios
 *    (ej. Matemática Lunes y Miércoles de 07:30 a 09:30), con o sin profesor a cargo.
 * 3) Edición directa por curso: permite editar cualquier materia asignada a un curso para cambiar
 *    la materia elegida, modificar sus días, cambiar sus horarios o cambiar su profesor.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { adminApi, coursesApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Chip,
  ConfirmModal,
  EmptyState,
  Input,
  SectionHeader,
} from '../../components/ui';
import SchoolScheduleGrid, {
  formatSchoolGroupShort,
} from '../../components/SchoolScheduleGrid';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const QUICK_SLOTS = [
  { label: 'Mañana 1° (07:30 a 09:30)', start: '07:30', end: '09:30' },
  { label: 'Mañana 2° (09:40 a 11:40)', start: '09:40', end: '11:40' },
  { label: 'Extra Mañana (11:50 a 12:50)', start: '11:50', end: '12:50' },
  { label: 'Tarde 1° (13:00 a 14:50)', start: '13:00', end: '14:50' },
  { label: 'Tarde 2° (15:10 a 17:10)', start: '15:10', end: '17:10' },
  { label: 'Extra Tarde (17:20 a 18:20)', start: '17:20', end: '18:20' },
];

/**
 * Agrupa una lista de bloques individuales [{ dayOfWeek, startTime, endTime }]
 * que comparten el mismo rango horario en grupos [{ days: ['Lunes', 'Miércoles'], startTime: '07:30', endTime: '09:30' }]
 */
function groupSchedulesByTime(schedules = []) {
  if (!Array.isArray(schedules) || schedules.length === 0) {
    return [{ days: ['Lunes'], startTime: '07:30', endTime: '09:30' }];
  }
  const map = new Map();
  for (const s of schedules) {
    const start = String(s.startTime || '07:30').slice(0, 5);
    const end = String(s.endTime || '09:30').slice(0, 5);
    const key = `${start}-${end}`;
    if (!map.has(key)) {
      map.set(key, { days: [], startTime: start, endTime: end });
    }
    const grp = map.get(key);
    if (!grp.days.includes(s.dayOfWeek)) {
      grp.days.push(s.dayOfWeek);
    }
  }
  return Array.from(map.values());
}

/**
 * Convierte los grupos de horario del formulario [{ days: ['Lunes', 'Miércoles'], startTime, endTime }]
 * en la lista plana de slots [{ dayOfWeek, startTime, endTime }] para el backend.
 */
function expandGroupsToSlots(timeGroups = []) {
  const slots = [];
  for (const grp of timeGroups) {
    const startTime = String(grp.startTime || '').trim();
    const endTime = String(grp.endTime || '').trim();
    for (const day of grp.days || []) {
      slots.push({
        dayOfWeek: day,
        startTime,
        endTime,
      });
    }
  }
  return slots;
}

export default function AdminCoursesScreen({ route }) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 768;
  const initialMode = route?.params?.initialSection || 'schedule';
  const [section, setSection] = useState(initialMode); // 'catalog' | 'schedule'
  const [courseViewTab, setCourseViewTab] = useState('grid'); // 'grid' | 'courses' | 'byDay'

  const [schoolYear, setSchoolYear] = useState(Number(route?.params?.schoolYear) || 6);
  const [courseDivision, setCourseDivision] = useState(Number(route?.params?.courseDivision) || 1);
  const [yearInput, setYearInput] = useState(String(route?.params?.schoolYear || 6));
  const [divisionInput, setDivisionInput] = useState(String(route?.params?.courseDivision || 1));

  const [subjectsCatalog, setSubjectsCatalog] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [schoolGroups, setSchoolGroups] = useState([]);

  // Estado para abrir nuevos cursos / grupos escolares
  const [newGroupYear, setNewGroupYear] = useState('');
  const [newGroupDivision, setNewGroupDivision] = useState('');
  const [newGroupCode, setNewGroupCode] = useState('');
  const [savingNewGroup, setSavingNewGroup] = useState(false);
  const [togglingGroupId, setTogglingGroupId] = useState(null);
  const [deletingGroupId, setDeletingGroupId] = useState(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);
  const [editingCodeGroup, setEditingCodeGroup] = useState(null);
  const [editCodeValue, setEditCodeValue] = useState('');
  const [savingCode, setSavingCode] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // --- Estado del apartado "Crear Materias (Base de Datos)" ---
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectDesc, setNewSubjectDesc] = useState('');
  const [savingSubject, setSavingSubject] = useState(false);

  const [editingCatalogSubject, setEditingCatalogSubject] = useState(null);
  const [editCatalogName, setEditCatalogName] = useState('');
  const [editCatalogDesc, setEditCatalogDesc] = useState('');
  const [savingCatalogEdit, setSavingCatalogEdit] = useState(false);
  const [catalogSubjectToDelete, setCatalogSubjectToDelete] = useState(null);

  // --- Modal para ASIGNAR o EDITAR Materia + Días + Horarios + Profesor en un Curso ---
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null); // null = asignar nueva al curso; number = editar materia existente del curso
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [selectedInstructorId, setSelectedInstructorId] = useState(null);
  const [timeGroups, setTimeGroups] = useState([
    { days: ['Lunes', 'Miércoles'], startTime: '07:30', endTime: '09:30' },
  ]);
  const [savingCourseSchedule, setSavingCourseSchedule] = useState(false);

  // Confirmar eliminación de materia de un curso
  const [courseToDelete, setCourseToDelete] = useState(null);

  useEffect(() => {
    if (route?.params?.initialSection) {
      setSection(route.params.initialSection);
    }
    if (route?.params?.schoolYear) {
      setSchoolYear(Number(route.params.schoolYear));
      setYearInput(String(route.params.schoolYear));
    }
    if (route?.params?.courseDivision) {
      setCourseDivision(Number(route.params.courseDivision));
      setDivisionInput(String(route.params.courseDivision));
    }
  }, [route?.params?.initialSection, route?.params?.schoolYear, route?.params?.courseDivision]);

  const loadScheduleData = useCallback(
    async (isRefresh = false, yr = schoolYear, div = courseDivision) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');
        const schedData = await adminApi.getSchedule({ schoolYear: yr, courseDivision: div });
        const catalog = schedData?.subjectsCatalog || [];
        setSubjectsCatalog(catalog);
        setInstructors(schedData?.instructors || []);
        setCourses(schedData?.courses || []);
        setSchedule(schedData?.schedule || []);
        setSchoolGroups(schedData?.schoolGroups || []);
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [schoolYear, courseDivision]
  );

  useFocusEffect(
    useCallback(() => {
      loadScheduleData(false, schoolYear, courseDivision);
    }, [loadScheduleData, schoolYear, courseDivision])
  );

  // --------------------------------------------------------------------------
  // Funciones de selección y gestión de Cursos / Divisiones
  // --------------------------------------------------------------------------

  const handleApplyCourseFilter = () => {
    const yr = parseInt(yearInput, 10);
    const div = parseInt(divisionInput, 10);
    if (isNaN(yr) || yr < 1) {
      setError('Por favor ingresá un año escolar numérico válido (ej. 1, 6, 7, 9).');
      return;
    }
    if (isNaN(div) || div < 1) {
      setError('Por favor ingresá una división numérica válida (ej. 1, 2, 3, 4, 5).');
      return;
    }
    setError('');
    setSchoolYear(yr);
    setCourseDivision(div);
    loadScheduleData(false, yr, div);
  };

  const handleSelectGroupDirect = (grp) => {
    setError('');
    setSchoolYear(grp.schoolYear);
    setCourseDivision(grp.courseDivision);
    setYearInput(String(grp.schoolYear));
    setDivisionInput(String(grp.courseDivision));
    loadScheduleData(false, grp.schoolYear, grp.courseDivision);
  };

  const handleOpenNewGroup = async () => {
    const yr = parseInt(newGroupYear, 10);
    const div = parseInt(newGroupDivision, 10);
    if (isNaN(yr) || yr < 1) {
      setError('Ingresá el año escolar numérico que querés abrir (ej. 1, 6, 7, 9).');
      return;
    }
    if (isNaN(div) || div < 1) {
      setError('Ingresá la división numérica a abrir (ej. 1, 2, 3, 4, 5).');
      return;
    }
    try {
      setSavingNewGroup(true);
      setError('');
      setSuccess('');
      const cleanCode = newGroupCode.trim().toUpperCase() || undefined;
      const res = await adminApi.createSchoolGroup({ schoolYear: yr, courseDivision: div, accessCode: cleanCode });
      setSuccess(res?.data?.message || res?.message || `Curso ${yr}° ${div}ª abierto exitosamente.`);
      setNewGroupYear('');
      setNewGroupDivision('');
      setNewGroupCode('');
      setSchoolYear(yr);
      setCourseDivision(div);
      setYearInput(String(yr));
      setDivisionInput(String(div));
      await loadScheduleData(true, yr, div);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingNewGroup(false);
    }
  };

  const handleSaveEditedCode = async () => {
    if (!editingCodeGroup) return;
    if (!editCodeValue.trim()) {
      setError('El código de acceso no puede estar vacío.');
      return;
    }
    try {
      setSavingCode(true);
      setError('');
      setSuccess('');
      const upper = editCodeValue.trim().toUpperCase();
      const res = await adminApi.updateSchoolGroupCode(editingCodeGroup.id, upper);
      setSuccess(res?.message || 'Código de acceso actualizado exitosamente.');
      setSchoolGroups((prev) =>
        prev.map((g) =>
          g.id === editingCodeGroup.id
            ? { ...g, accessCode: upper }
            : g
        )
      );
      setEditingCodeGroup(null);
      setEditCodeValue('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingCode(false);
    }
  };

  const handleToggleGroup = async (grp) => {
    try {
      setTogglingGroupId(grp.id);
      setError('');
      setSuccess('');
      const res = await adminApi.toggleSchoolGroup(grp.id);
      const isNowClosed = grp.status === 'open';
      const actionMsg = isNowClosed
        ? `Curso ${grp.schoolYear}° ${grp.courseDivision}ª cerrado exitosamente.`
        : `Curso ${grp.schoolYear}° ${grp.courseDivision}ª reabierto exitosamente.`;
      setSuccess(res?.message || res?.data?.message || actionMsg);

      // Actualizar estado local inmediatamente para respuesta instantánea
      setSchoolGroups((prev) =>
        prev.map((g) =>
          g.id === grp.id
            ? { ...g, status: isNowClosed ? 'closed' : 'open', isOpen: !isNowClosed }
            : g
        )
      );

      await loadScheduleData(true, schoolYear, courseDivision);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setTogglingGroupId(null);
    }
  };

  const handleDeleteClosedGroup = async () => {
    if (!confirmDeleteGroup) return;
    try {
      setDeletingGroupId(confirmDeleteGroup.id);
      setError('');
      setSuccess('');
      const res = await adminApi.deleteSchoolGroup(confirmDeleteGroup.id);
      const msg = res?.message || `Curso ${confirmDeleteGroup.schoolYear}° ${confirmDeleteGroup.courseDivision}ª eliminado exitosamente.`;
      setSuccess(msg);

      // Actualizar lista local de cursos escolares
      const deletedId = confirmDeleteGroup.id;
      setSchoolGroups((prev) => prev.filter((g) => g.id !== deletedId));

      // Si el curso eliminado era el seleccionado actualmente, cambiar a otro curso disponible
      if (currentGroup?.id === deletedId) {
        const remaining = schoolGroups.filter((g) => g.id !== deletedId);
        if (remaining.length > 0) {
          handleSelectGroupDirect(remaining[0]);
        }
      }
      await loadScheduleData(true, schoolYear, courseDivision);
      setConfirmDeleteGroup(null);
    } catch (err) {
      setError(extractErrorMessage(err));
      setConfirmDeleteGroup(null);
    } finally {
      setDeletingGroupId(null);
    }
  };

  // --------------------------------------------------------------------------
  // Funciones del apartado 1: Catálogo de Materias en la Base de Datos
  // --------------------------------------------------------------------------

  const handleCreateSubjectInDb = async () => {
    const cleanName = String(newSubjectName || '').trim();
    if (!cleanName || cleanName.length < 2) {
      setError('Ingresá el nombre de la materia para guardarla en la base de datos (ej. Matemática).');
      return;
    }
    try {
      setSavingSubject(true);
      setError('');
      setSuccess('');
      await adminApi.createSubject({
        name: cleanName,
        description: newSubjectDesc.trim() || null,
      });
      setNewSubjectName('');
      setNewSubjectDesc('');
      setSuccess(`Materia "${cleanName}" creada en la base de datos. Ya podés elegirla en el Cronograma.`);
      await loadScheduleData(true, schoolYear, courseDivision);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingSubject(false);
    }
  };

  const openEditCatalogModal = (subj) => {
    setError('');
    setEditingCatalogSubject(subj);
    setEditCatalogName(subj.name || '');
    setEditCatalogDesc(subj.description || '');
  };

  const handleSaveCatalogSubjectEdit = async () => {
    if (!editingCatalogSubject) return;
    const cleanName = String(editCatalogName || '').trim();
    if (!cleanName || cleanName.length < 2) {
      setError('El nombre de la materia no puede quedar vacío.');
      return;
    }
    try {
      setSavingCatalogEdit(true);
      setError('');
      await adminApi.updateSubject(editingCatalogSubject.id, {
        name: cleanName,
        description: editCatalogDesc.trim() || null,
      });
      setEditingCatalogSubject(null);
      setSuccess(`Materia actualizada a "${cleanName}" en la base de datos y en los cursos asociados.`);
      await loadScheduleData(true, schoolYear, courseDivision);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingCatalogEdit(false);
    }
  };

  const handleDeleteCatalogSubject = async () => {
    if (!catalogSubjectToDelete) return;
    try {
      setError('');
      await adminApi.deleteSubject(catalogSubjectToDelete.id);
      setSuccess(`Materia "${catalogSubjectToDelete.name}" eliminada del catálogo de la base de datos.`);
      setCatalogSubjectToDelete(null);
      await loadScheduleData(true, schoolYear, courseDivision);
    } catch (err) {
      setError(extractErrorMessage(err));
      setCatalogSubjectToDelete(null);
    }
  };

  // --------------------------------------------------------------------------
  // Funciones del apartado 2: Cronograma por Curso (Asignar y Editar)
  // --------------------------------------------------------------------------

  const openAssignNewSubjectToCourse = (
    preselectedSubjectId = null,
    prefillDay = null,
    prefillStart = '07:30',
    prefillEnd = '09:30'
  ) => {
    setError('');
    setSuccess('');
    if (subjectsCatalog.length === 0) {
      setSection('catalog');
      setError('Primero creá al menos una materia en "1. Crear Materias (BD)" para poder elegirla en el cronograma.');
      return;
    }
    setEditingCourseId(null);
    setSelectedSubjectId(preselectedSubjectId || subjectsCatalog[0]?.id || null);
    setSelectedInstructorId(null);
    setTimeGroups([
      {
        days: prefillDay ? [prefillDay] : ['Lunes', 'Miércoles'],
        startTime: prefillStart || '07:30',
        endTime: prefillEnd || '09:30',
      },
    ]);
    setScheduleModalOpen(true);
  };

  const openEditCourseScheduleModal = (course) => {
    setError('');
    setSuccess('');
    setEditingCourseId(course.id);

    // Determinar subjectId correspondiente en el catálogo
    const matchingSubject =
      subjectsCatalog.find((s) => Number(s.id) === Number(course.subjectId)) ||
      subjectsCatalog.find((s) => s.name.toLowerCase() === String(course.title || '').toLowerCase());

    setSelectedSubjectId(matchingSubject ? matchingSubject.id : subjectsCatalog[0]?.id || null);
    setSelectedInstructorId(course.instructorId || null);
    setTimeGroups(groupSchedulesByTime(course.schedules || []));
    setScheduleModalOpen(true);
  };

  const toggleDayInGroup = (groupIndex, day) => {
    setTimeGroups((prev) =>
      prev.map((grp, idx) => {
        if (idx !== groupIndex) return grp;
        const exists = grp.days.includes(day);
        const nextDays = exists ? grp.days.filter((d) => d !== day) : [...grp.days, day];
        return { ...grp, days: nextDays };
      })
    );
  };

  const updateGroupTime = (groupIndex, field, value) => {
    setTimeGroups((prev) =>
      prev.map((grp, idx) => (idx === groupIndex ? { ...grp, [field]: value } : grp))
    );
  };

  const applyQuickSlotToGroup = (groupIndex, start, end) => {
    setTimeGroups((prev) =>
      prev.map((grp, idx) => (idx === groupIndex ? { ...grp, startTime: start, endTime: end } : grp))
    );
  };

  const addAnotherTimeGroup = () => {
    setTimeGroups((prev) => [...prev, { days: ['Viernes'], startTime: '09:40', endTime: '11:40' }]);
  };

  const removeTimeGroup = (groupIndex) => {
    setTimeGroups((prev) => prev.filter((_, idx) => idx !== groupIndex));
  };

  const handleSaveCourseSchedule = async () => {
    if (!selectedSubjectId) {
      setError('Seleccioná una materia de la lista.');
      return;
    }
    const slots = expandGroupsToSlots(timeGroups);
    if (slots.length === 0) {
      setError('Seleccioná al menos un día de la semana (ej. Lunes y Miércoles).');
      return;
    }

    try {
      setSavingCourseSchedule(true);
      setError('');
      setSuccess('');

      const chosenSubject = subjectsCatalog.find((s) => Number(s.id) === Number(selectedSubjectId));
      const subjectLabel = chosenSubject?.name || 'Materia';

      if (editingCourseId) {
        const res = await adminApi.updateCourseSchedule(editingCourseId, {
          subjectId: selectedSubjectId,
          instructorId: selectedInstructorId,
          slots,
        });
        setSubjectsCatalog(res?.subjectsCatalog || subjectsCatalog);
        setInstructors(res?.instructors || instructors);
        setCourses(res?.courses || []);
        setSchedule(res?.schedule || []);
        setScheduleModalOpen(false);
        setSuccess(
          `Se actualizaron la materia, días y horarios de "${subjectLabel}" en ${schoolYear}° Año - ${courseDivision}° Curso.`
        );
      } else {
        const res = await adminApi.addScheduleEntry({
          schoolYear,
          courseDivision,
          subjectId: selectedSubjectId,
          instructorId: selectedInstructorId,
          slots,
        });
        setSubjectsCatalog(res?.subjectsCatalog || subjectsCatalog);
        setInstructors(res?.instructors || instructors);
        setCourses(res?.courses || []);
        setSchedule(res?.schedule || []);
        setScheduleModalOpen(false);
        setSuccess(
          `Se asignó "${subjectLabel}" (${slots.map((s) => `${s.dayOfWeek} ${s.startTime}-${s.endTime}`).join(', ')}) a ${schoolYear}° Año - ${courseDivision}° Curso.`
        );
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingCourseSchedule(false);
    }
  };

  const handleDeleteCourseFromSchedule = async () => {
    if (!courseToDelete) return;
    try {
      setError('');
      await adminApi.deleteCourseFromSchedule(courseToDelete.id);
      setSuccess(
        `Materia "${courseToDelete.title}" y sus horarios eliminados de ${schoolYear}° Año - ${courseDivision}° Curso.`
      );
      setCourseToDelete(null);
      await loadScheduleData(true, schoolYear, courseDivision);
    } catch (err) {
      setError(extractErrorMessage(err));
      setCourseToDelete(null);
    }
  };

  const currentGroup = schoolGroups.find(
    (g) => Number(g.schoolYear) === Number(schoolYear) && Number(g.courseDivision) === Number(courseDivision)
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadScheduleData(true, schoolYear, courseDivision)}
            tintColor={colors.primary}
          />
        }
      >
        <SectionHeader
          title="Materias y Cronograma Escolar"
          subtitle="1) Creá las materias en la base de datos y 2) Asignalás o editalas por curso con sus días, horarios y profesores"
        />

        {/* Selector principal de apartado: 1. Materias (BD) | 2. Cronograma por Curso | 3. Abrir/Cerrar Cursos */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <Pressable
            onPress={() => {
              setError('');
              setSuccess('');
              setSection('catalog');
            }}
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 6,
              borderRadius: 12,
              alignItems: 'center',
              backgroundColor: section === 'catalog' ? colors.primary : colors.card,
              borderWidth: 1.5,
              borderColor: section === 'catalog' ? colors.primary : colors.border,
            }}
          >
            <Ionicons
              name="book-outline"
              size={18}
              color={section === 'catalog' ? '#ffffff' : colors.primary}
            />
            <Text
              style={{
                fontWeight: '800',
                fontSize: 12,
                marginTop: 4,
                color: section === 'catalog' ? '#ffffff' : colors.text,
                textAlign: 'center',
              }}
            >
              Gestionar Materias ({subjectsCatalog.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setError('');
              setSuccess('');
              setSection('schedule');
            }}
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 6,
              borderRadius: 12,
              alignItems: 'center',
              backgroundColor: section === 'schedule' ? colors.primary : colors.card,
              borderWidth: 1.5,
              borderColor: section === 'schedule' ? colors.primary : colors.border,
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={section === 'schedule' ? '#ffffff' : colors.primary}
            />
            <Text
              style={{
                fontWeight: '800',
                fontSize: 12,
                marginTop: 4,
                color: section === 'schedule' ? '#ffffff' : colors.text,
                textAlign: 'center',
              }}
            >
              Gestionar Horarios
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setError('');
              setSuccess('');
              setSection('groups');
            }}
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 6,
              borderRadius: 12,
              alignItems: 'center',
              backgroundColor: section === 'groups' ? colors.primary : colors.card,
              borderWidth: 1.5,
              borderColor: section === 'groups' ? colors.primary : colors.border,
            }}
          >
            <Ionicons
              name="school-outline"
              size={18}
              color={section === 'groups' ? '#ffffff' : colors.primary}
            />
            <Text
              style={{
                fontWeight: '800',
                fontSize: 12,
                marginTop: 4,
                color: section === 'groups' ? '#ffffff' : colors.text,
                textAlign: 'center',
              }}
            >
              3. Abrir / Cerrar Cursos ({schoolGroups.length})
            </Text>
          </Pressable>
        </View>

        <AlertBanner type="error" message={error} />
        <AlertBanner type="success" message={success} />

        {/* ====================================================================
            APARTADO 1: CREAR Y ADMINISTRAR MATERIAS EN LA BASE DE DATOS
           ==================================================================== */}
        {section === 'catalog' && (
          <View>
            <Card style={{ marginBottom: 14, borderColor: colors.primary, borderWidth: 1.5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="add-circle" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                  Agregar Nueva Materia a la Base de Datos
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
                Creá acá las materias de la institución (ej. Matemática, Lengua, Historia, Inglés, Física). Una vez creadas, podrás elegirlas desde el cronograma de cualquier curso.
              </Text>

              <Input
                label="Nombre de la Materia *"
                value={newSubjectName}
                onChangeText={setNewSubjectName}
                placeholder="Ej. Matemática, Lengua y Literatura, Historia..."
              />

              <Input
                label="Descripción opcional"
                value={newSubjectDesc}
                onChangeText={setNewSubjectDesc}
                placeholder="Ej. Álgebra, geometría y análisis matemático"
              />

              <Button
                title="Guardar Materia en la Base de Datos"
                icon="save-outline"
                loading={savingSubject}
                onPress={handleCreateSubjectInDb}
                style={{ marginBottom: 0 }}
              />
            </Card>

            <SectionHeader
              title={`Materias Registradas (${subjectsCatalog.length})`}
              subtitle="Tocá 'Editar' para cambiar el nombre de una materia o 'Usar en Cronograma' para asignarla a un curso"
            />

            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
            ) : subjectsCatalog.length === 0 ? (
              <EmptyState
                icon="book-outline"
                title="Aún no hay materias creadas en la base de datos"
                message="Usá el formulario de arriba para crear tus materias (ej. Matemática, Lengua, Historia) y luego asignarlas en el cronograma."
              />
            ) : (
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: isDesktop ? 'wrap' : 'nowrap', gap: 14 }}>
                {subjectsCatalog.map((subj) => (
                  <View
                    key={subj.id}
                    style={{
                      width: isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%',
                      maxWidth: isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%',
                      flexGrow: isDesktop ? 0 : 1,
                      flexShrink: 0,
                      marginBottom: isDesktop ? 0 : 4,
                    }}
                  >
                    <Card style={{ height: isDesktop ? '100%' : undefined, marginBottom: 0, justifyContent: 'space-between' }}>
                      <View>
                        <View style={styles.rowBetween}>
                          <Badge
                            label={
                              Number(subj.coursesCount) > 0
                                ? `Asignada en ${subj.coursesCount} ${Number(subj.coursesCount) === 1 ? 'curso' : 'cursos'}`
                                : 'Sin asignar aún'
                            }
                            tone={Number(subj.coursesCount) > 0 ? 'success' : 'neutral'}
                          />
                        </View>

                        <Text style={[styles.title, { color: colors.text, marginTop: 8 }]}>{subj.name}</Text>
                        {subj.description ? (
                          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                            {subj.description}
                          </Text>
                        ) : null}
                      </View>

                      <View style={[styles.actionsRow, { marginTop: 14 }]}>
                        <Button
                          title="Usar"
                          icon="calendar-outline"
                          variant="primary"
                          small
                          style={{ flex: 1, marginBottom: 0 }}
                          onPress={() => {
                            setSection('schedule');
                            openAssignNewSubjectToCourse(subj.id);
                          }}
                        />
                        <Button
                          title="Editar"
                          icon="create-outline"
                          variant="outline"
                          small
                          style={{ marginBottom: 0 }}
                          onPress={() => openEditCatalogModal(subj)}
                        />
                        <Button
                          title=""
                          icon="trash-outline"
                          variant="danger"
                          small
                          style={{ marginBottom: 0 }}
                          onPress={() => setCatalogSubjectToDelete(subj)}
                        />
                      </View>
                    </Card>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ====================================================================
            APARTADO 2: CRONOGRAMA POR CURSO (INGRESO POR TEXTO Y CHIPS RÁPIDOS)
           ==================================================================== */}
        {section === 'schedule' && (
          <View>
            <Card style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 4 }}>
                1. Seleccioná el Curso a Planificar (Ingreso por texto):
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10 }}>
                Escribí el año escolar (ej. 1, 6, 7, 9) y la división (ej. 1, 2, 4) para ver o armar su cuadrícula:
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Año Escolar"
                    value={yearInput}
                    onChangeText={setYearInput}
                    keyboardType="numeric"
                    placeholder="Ej. 6"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="División / Curso"
                    value={divisionInput}
                    onChangeText={setDivisionInput}
                    keyboardType="numeric"
                    placeholder="Ej. 1"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <Button
                  title="Cargar Cronograma"
                  icon="search-outline"
                  onPress={handleApplyCourseFilter}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <Button
                  title="+ Abrir Curso"
                  variant="outline"
                  icon="add-circle-outline"
                  onPress={() => setSection('groups')}
                  style={{ flex: 1, marginBottom: 0 }}
                />
              </View>

              {schoolGroups.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                    Acceso rápido a cursos creados:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {schoolGroups.map((grp) => {
                        const isCurrent =
                          Number(schoolYear) === Number(grp.schoolYear) &&
                          Number(courseDivision) === Number(grp.courseDivision);
                        const isOpen = grp.status === 'open';
                        return (
                          <Chip
                            key={grp.id}
                            label={`${grp.label || `${grp.schoolYear}° ${grp.courseDivision}ª`}${!isOpen ? ' (Cerrado)' : ''}`}
                            selected={isCurrent}
                            onPress={() => handleSelectGroupDirect(grp)}
                          />
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={[styles.rowBetween, { marginBottom: 10, alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>
                        Curso {formatSchoolGroupShort(schoolYear, courseDivision)} ({schoolYear}° Año - {courseDivision}° Curso)
                      </Text>
                      {currentGroup && (
                        <Badge
                          label={currentGroup.status === 'open' ? 'Abierto' : 'Cerrado'}
                          variant={currentGroup.status === 'open' ? 'success' : 'danger'}
                        />
                      )}
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {courses.length} materias asignadas • {schedule.length} bloques horarios
                    </Text>
                  </View>

                  {currentGroup && (
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <Button
                        title={currentGroup.status === 'open' ? 'Cerrar Curso' : 'Reabrir Curso'}
                        variant={currentGroup.status === 'open' ? 'danger' : 'success'}
                        small
                        loading={togglingGroupId === currentGroup.id}
                        disabled={togglingGroupId === currentGroup.id}
                        style={{ marginBottom: 0 }}
                        onPress={() => handleToggleGroup(currentGroup)}
                      />
                      {currentGroup.status === 'closed' && (
                        <Button
                          title="Eliminar Curso"
                          variant="danger"
                          small
                          loading={deletingGroupId === currentGroup.id}
                          disabled={deletingGroupId === currentGroup.id}
                          style={{ marginBottom: 0 }}
                          onPress={() => setConfirmDeleteGroup(currentGroup)}
                        />
                      )}
                    </View>
                  )}
                </View>

                <Button
                  title="+ Elegir Materia y Asignar Días y Horarios"
                  icon="add-circle-outline"
                  onPress={() => openAssignNewSubjectToCourse(null)}
                  style={{ marginBottom: 0 }}
                />
              </View>
            </Card>

            {/* Sub-pestañas dentro del curso: Cuadrícula de Horarios, Materias del Curso o Lista por Día */}
            <View style={styles.tabsRow}>
              <Chip
                label={`Cuadrícula ${formatSchoolGroupShort(schoolYear, courseDivision)}`}
                selected={courseViewTab === 'grid'}
                onPress={() => setCourseViewTab('grid')}
              />
              <Chip
                label={`Materias del Curso (${courses.length})`}
                selected={courseViewTab === 'courses'}
                onPress={() => setCourseViewTab('courses')}
              />
              <Chip
                label={`Lista por Día (${schedule.length})`}
                selected={courseViewTab === 'byDay'}
                onPress={() => setCourseViewTab('byDay')}
              />
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 28 }} />
            ) : courseViewTab === 'grid' ? (
              <View>
                <SchoolScheduleGrid
                  schoolYear={schoolYear}
                  courseDivision={courseDivision}
                  schedule={schedule}
                  editable
                  onPressOccupiedCell={(entry) => {
                    const parentCourse = courses.find((c) => Number(c.id) === Number(entry.courseId));
                    if (parentCourse) {
                      openEditCourseScheduleModal(parentCourse);
                    }
                  }}
                  onPressEmptyCell={(day, mod) =>
                    openAssignNewSubjectToCourse(null, day, mod.start, mod.end)
                  }
                />
              </View>
            ) : courseViewTab === 'courses' ? (
              <View>
                {courses.length === 0 ? (
                  <EmptyState
                    icon="calendar-outline"
                    title={`Sin materias asignadas en ${schoolYear}° Año - ${courseDivision}° Curso`}
                    message={
                      subjectsCatalog.length === 0
                        ? 'Primero creá las materias en la pestaña "1. Crear Materias" y luego asignalas a este curso.'
                        : 'Tocá el botón para elegir una materia ya creada, marcar en qué días y horarios se dicta y elegir su profesor.'
                    }
                    actionLabel={
                      subjectsCatalog.length === 0
                        ? 'Ir a Crear Materias'
                        : '+ Elegir Materia y Asignar Horarios'
                    }
                    onAction={() =>
                      subjectsCatalog.length === 0
                        ? setSection('catalog')
                        : openAssignNewSubjectToCourse(null)
                    }
                  />
                ) : (
                  <View style={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: isDesktop ? 'wrap' : 'nowrap', gap: 14 }}>
                    {courses.map((course) => {
                      const hasTeacher =
                        course.instructorId &&
                        course.instructorName &&
                        course.instructorName !== 'Sin profesor asignado';
                      return (
                        <View
                          key={course.id}
                          style={{
                            width: isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%',
                            maxWidth: isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%',
                            flexGrow: isDesktop ? 0 : 1,
                            flexShrink: 0,
                            marginBottom: isDesktop ? 0 : 4,
                          }}
                        >
                          <Card style={{ height: isDesktop ? '100%' : undefined, marginBottom: 0, justifyContent: 'space-between' }}>
                            <View>
                              <View style={styles.rowBetween}>
                                <Badge label={`${schoolYear}° Año - ${courseDivision}° Curso`} tone="info" />
                                <Badge label={`${course.studentsCount || 0} alumnos`} tone="success" />
                              </View>

                              <Text style={[styles.title, { color: colors.text, fontSize: 17, marginTop: 8 }]}>
                                {course.title}
                              </Text>

                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                                <Ionicons
                                  name="person-circle-outline"
                                  size={17}
                                  color={hasTeacher ? colors.primary : colors.warning}
                                  style={{ marginRight: 6 }}
                                />
                                <Text
                                  style={{
                                    color: hasTeacher ? colors.textSecondary : colors.warning,
                                    fontSize: 13,
                                    fontWeight: '700',
                                  }}
                                >
                                  Docente: {hasTeacher ? course.instructorName : 'Vacante'}
                                </Text>
                              </View>

                              {/* Días y horarios */}
                              <View style={{ marginTop: 10 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                                  Días y horarios:
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                  {(course.schedules || []).length === 0 ? (
                                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                                      Sin horarios asignados
                                    </Text>
                                  ) : (
                                    course.schedules.map((s) => (
                                      <Badge
                                        key={s.id}
                                        label={`${s.dayOfWeek}: ${s.startTime}-${s.endTime}`}
                                        tone="primary"
                                      />
                                    ))
                                  )}
                                </View>
                              </View>
                            </View>

                            <View style={[styles.actionsRow, { marginTop: 14 }]}>
                              <Button
                                title="Editar"
                                icon="create-outline"
                                variant="primary"
                                small
                                onPress={() => openEditCourseScheduleModal(course)}
                                style={{ flex: 1, marginBottom: 0 }}
                              />
                              <Button
                                title="Quitar"
                                variant="danger"
                                small
                                onPress={() => setCourseToDelete(course)}
                                style={{ marginBottom: 0 }}
                              />
                            </View>
                          </Card>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              /* Vista por día de la semana */
              <View>
                {schedule.length === 0 ? (
                  <EmptyState
                    icon="calendar-outline"
                    title={`Sin horarios en ${schoolYear}° Año - ${courseDivision}° Curso`}
                    message="Asigná materias con sus días y horarios para visualizar la grilla semanal."
                    actionLabel="+ Asignar Materia y Horarios"
                    onAction={() => openAssignNewSubjectToCourse(null)}
                  />
                ) : (
                  DAYS.map((day) => {
                    const dayBlocks = schedule.filter((s) => s.dayOfWeek === day);
                    if (dayBlocks.length === 0) return null;
                    return (
                      <View key={day} style={{ marginBottom: 14 }}>
                        <View
                          style={{
                            backgroundColor: colors.navy,
                            paddingVertical: 8,
                            paddingHorizontal: 14,
                            borderRadius: 10,
                            marginBottom: 8,
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: colors.mode === 'light' ? colors.text : '#ffffff', fontWeight: '800', fontSize: 14 }}>
                            {day} • {schoolYear}° Año {courseDivision}° Curso
                          </Text>
                          <Text style={{ color: colors.mode === 'light' ? colors.primary : '#93c5fd', fontSize: 12, fontWeight: '700' }}>
                            {dayBlocks.length} {dayBlocks.length === 1 ? 'bloque' : 'bloques'}
                          </Text>
                        </View>

                        {dayBlocks.map((blk) => {
                          const hasTeacher =
                            blk.instructorId &&
                            blk.instructorName &&
                            blk.instructorName !== 'Sin profesor asignado';
                          const parentCourse = courses.find((c) => Number(c.id) === Number(blk.courseId));
                          return (
                            <Card key={blk.id}>
                              <View style={styles.rowBetween}>
                                <Badge label={`${blk.startTime} a ${blk.endTime} hs`} tone="primary" />
                                <Button
                                  title="Editar Materia / Días / Horarios"
                                  variant="outline"
                                  small
                                  style={{ marginBottom: 0 }}
                                  onPress={() =>
                                    parentCourse && openEditCourseScheduleModal(parentCourse)
                                  }
                                />
                              </View>
                              <Text style={[styles.title, { color: colors.text }]}>{blk.courseTitle}</Text>
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: '700',
                                  marginTop: 4,
                                  color: hasTeacher ? colors.textSecondary : colors.warning,
                                }}
                              >
                                Docente: {hasTeacher ? blk.instructorName : 'Sin docente a cargo (Vacante)'}
                              </Text>
                            </Card>
                          );
                        })}
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        )}

        {/* ====================================================================
            APARTADO 3: APERTURA Y CIERRE DE CURSOS / DIVISIONES (ADMIN)
           ==================================================================== */}
        {section === 'groups' && (
          <View>
            <Card style={{ marginBottom: 14, borderColor: colors.primary, borderWidth: 1.5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="school" size={22} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                  Abrir Nuevo Curso / División
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10 }}>
                Podés abrir un curso de cualquier año escolar (ej. 1°, 7°, 9°) y cualquier división (1ª, 4ª, 5ª).
              </Text>

              <View
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(59, 130, 246, 0.25)',
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
                  📌 Requisito institucional:
                </Text>
                <Text style={{ fontSize: 12, color: colors.text, marginTop: 2 }}>
                  Antes de abrir la división N (ej: 4ª), debe existir y estar abierta la división previa N-1 (ej: 3ª) del mismo año escolar.
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Año Escolar *"
                    value={newGroupYear}
                    onChangeText={setNewGroupYear}
                    keyboardType="numeric"
                    placeholder="Ej. 7 ó 9"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="División / Curso *"
                    value={newGroupDivision}
                    onChangeText={setNewGroupDivision}
                    keyboardType="numeric"
                    placeholder="Ej. 4 ó 5"
                  />
                </View>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Input
                  label="Código de Acceso del Curso (para alumnos)"
                  value={newGroupCode}
                  onChangeText={setNewGroupCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="Ej. 6TO1RA (automático si se deja vacío)"
                  leftIcon="key-outline"
                />
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                  🔑 Los alumnos deberán ingresar este código para poder asignarse a este curso.
                </Text>
              </View>

              <Button
                title={savingNewGroup ? 'Abriendo Curso...' : '+ Abrir Curso'}
                icon="checkmark-circle-outline"
                loading={savingNewGroup}
                disabled={savingNewGroup}
                onPress={handleOpenNewGroup}
              />
            </Card>

            <SectionHeader
              title={`Cursos y Divisiones Institucionales (${schoolGroups.length})`}
              subtitle="Control de apertura y cierre de divisiones escolares"
            />

            {schoolGroups.length === 0 ? (
              <EmptyState
                icon="school-outline"
                title="Sin cursos registrados"
                description="Abrí el primer curso con el formulario superior."
              />
            ) : (
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: isDesktop ? 'wrap' : 'nowrap', gap: 14 }}>
                {schoolGroups.map((grp) => {
                  const isOpen = grp.status === 'open';
                  return (
                    <View
                      key={grp.id}
                      style={{
                        width: isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%',
                        maxWidth: isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%',
                        flexGrow: isDesktop ? 0 : 1,
                        flexShrink: 0,
                        marginBottom: isDesktop ? 0 : 4,
                      }}
                    >
                      <Card style={{ height: isDesktop ? '100%' : undefined, marginBottom: 0, justifyContent: 'space-between' }}>
                        <View>
                          <View style={styles.rowBetween}>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                              Curso {grp.label || `${grp.schoolYear}° ${grp.courseDivision}ª`}
                            </Text>
                            <Badge
                              label={isOpen ? 'Abierto' : 'Cerrado'}
                              variant={isOpen ? 'success' : 'danger'}
                            />
                          </View>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                            {grp.courseCount || 0} materias dictándose • {grp.studentCount || 0} alumnos
                          </Text>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: colors.surfaceAlt,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 8,
                              marginTop: 8,
                              alignSelf: 'flex-start',
                              gap: 6,
                            }}
                          >
                            <Ionicons name="key-outline" size={13} color={colors.primary} />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                              Código:{' '}
                              <Text style={{ color: colors.primary, fontWeight: '800' }}>
                                {grp.accessCode || `${grp.schoolYear}TO${grp.courseDivision}RA`}
                              </Text>
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                setEditingCodeGroup(grp);
                                setEditCodeValue(grp.accessCode || `${grp.schoolYear}TO${grp.courseDivision}RA`);
                              }}
                              style={{ padding: 2, marginLeft: 4 }}
                            >
                              <Ionicons name="pencil-outline" size={13} color={colors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
                          <Button
                            title="Horarios"
                            variant="outline"
                            small
                            style={{ flex: 1, marginBottom: 0 }}
                            onPress={() => {
                              handleSelectGroupDirect(grp);
                              setSection('schedule');
                            }}
                          />
                          {isOpen ? (
                            <Button
                              title="Cerrar"
                              variant="danger"
                              small
                              loading={togglingGroupId === grp.id}
                              disabled={togglingGroupId === grp.id}
                              style={{ marginBottom: 0 }}
                              onPress={() => handleToggleGroup(grp)}
                            />
                          ) : (
                            <>
                              <Button
                                title="Reabrir"
                                variant="success"
                                small
                                loading={togglingGroupId === grp.id}
                                disabled={togglingGroupId === grp.id}
                                style={{ marginBottom: 0 }}
                                onPress={() => handleToggleGroup(grp)}
                              />
                              <Button
                                title=""
                                icon="trash-outline"
                                variant="danger"
                                small
                                loading={deletingGroupId === grp.id}
                                disabled={deletingGroupId === grp.id}
                                style={{ marginBottom: 0 }}
                                onPress={() => setConfirmDeleteGroup(grp)}
                              />
                            </>
                          )}
                        </View>
                      </Card>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ====================================================================
          MODAL: ASIGNAR O EDITAR MATERIA + MÚLTIPLES DÍAS Y HORARIOS POR CURSO
         ==================================================================== */}
      <Modal
        visible={scheduleModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setScheduleModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>
                {editingCourseId
                  ? `Editar Materia y Horarios (${schoolYear}° Año - ${courseDivision}° Curso)`
                  : `Asignar Materia a ${schoolYear}° Año - ${courseDivision}° Curso`}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, marginBottom: 12 }}>
                Elegí la materia creada en la base de datos, marcá todos los días y horarios en los que se dicta (ej. Lunes y Miércoles de 07:30 a 09:30) y seleccioná el profesor.
              </Text>

              <AlertBanner type="error" message={error} />

              {/* PASO 1: Elegir Materia de la Base de Datos */}
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
                1. Elegí la Materia (del catálogo de la base de datos) *
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {subjectsCatalog.map((subj) => {
                  const selected = Number(selectedSubjectId) === Number(subj.id);
                  return (
                    <Pressable
                      key={subj.id}
                      onPress={() => setSelectedSubjectId(subj.id)}
                      style={{
                        paddingVertical: 9,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : colors.background,
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          fontSize: 13,
                          color: selected ? '#ffffff' : colors.text,
                        }}
                      >
                        {subj.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* PASO 2: Elegir Días y Horarios (soporta múltiples días por horario y múltiples rangos horarios) */}
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
                2. Elegí los Días y Horarios de cursada *
              </Text>

              {timeGroups.map((grp, idx) => (
                <View
                  key={idx}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    marginBottom: 10,
                  }}
                >
                  <View style={styles.rowBetween}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
                      Bloque de días y horario #{idx + 1}
                    </Text>
                    {timeGroups.length > 1 && (
                      <TouchableOpacity onPress={() => removeTimeGroup(idx)}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>
                          Quitar bloque
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6, marginBottom: 6 }}>
                    Tocá uno o varios días para este horario (ej. Lunes y Miércoles):
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {DAYS.map((d) => {
                      const activeDay = grp.days.includes(d);
                      return (
                        <Pressable
                          key={d}
                          onPress={() => toggleDayInGroup(idx, d)}
                          style={{
                            paddingVertical: 7,
                            paddingHorizontal: 11,
                            borderRadius: 8,
                            borderWidth: 1.5,
                            borderColor: activeDay ? colors.primary : colors.border,
                            backgroundColor: activeDay ? colors.primary : colors.card,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '800',
                              color: activeDay ? '#ffffff' : colors.text,
                            }}
                          >
                            {d}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                    Horarios rápidos (o escribí la hora manualmente abajo):
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {QUICK_SLOTS.map((slot) => (
                      <Chip
                        key={slot.label}
                        label={slot.label}
                        selected={grp.startTime === slot.start && grp.endTime === slot.end}
                        onPress={() => applyQuickSlotToGroup(idx, slot.start, slot.end)}
                      />
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Hora inicio (HH:MM)"
                        value={grp.startTime}
                        onChangeText={(v) => updateGroupTime(idx, 'startTime', v)}
                        placeholder="07:30"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Hora fin (HH:MM)"
                        value={grp.endTime}
                        onChangeText={(v) => updateGroupTime(idx, 'endTime', v)}
                        placeholder="09:30"
                      />
                    </View>
                  </View>
                </View>
              ))}

              <Button
                title="+ Agregar otro horario en distintos días"
                icon="time-outline"
                variant="outline"
                small
                onPress={addAnotherTimeGroup}
                style={{ marginBottom: 14 }}
              />

              {/* PASO 3: Docente a cargo */}
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
                3. Docente a cargo de la materia:
              </Text>
              <View style={{ gap: 6, marginBottom: 16 }}>
                <Pressable
                  onPress={() => setSelectedInstructorId(null)}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: selectedInstructorId === null ? colors.primary : colors.border,
                    backgroundColor:
                      selectedInstructorId === null ? colors.primarySoft || '#eef2ff' : colors.background,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontWeight: '800', color: colors.text, fontSize: 13 }}>
                    Sin docente a cargo (Dejar vacante por ahora)
                  </Text>
                  {selectedInstructorId === null && (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  )}
                </Pressable>

                {instructors.map((inst) => {
                  const selected = Number(selectedInstructorId) === Number(inst.id);
                  return (
                    <Pressable
                      key={inst.id}
                      onPress={() => setSelectedInstructorId(inst.id)}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primarySoft || '#eef2ff' : colors.background,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View>
                        <Text style={{ fontWeight: '800', color: colors.text, fontSize: 13 }}>
                          Docente: {inst.name}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{inst.email}</Text>
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>

              <Button
                title={editingCourseId ? 'Guardar Cambios de la Materia' : 'Asignar al Cronograma del Curso'}
                icon="save-outline"
                loading={savingCourseSchedule}
                onPress={handleSaveCourseSchedule}
              />
              <Button
                title="Cancelar"
                variant="outline"
                onPress={() => setScheduleModalOpen(false)}
                style={{ marginBottom: 0 }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: Editar nombre/descripción de una Materia en la Base de Datos */}
      <Modal
        visible={Boolean(editingCatalogSubject)}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingCatalogSubject(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
              Editar Materia en Base de Datos
            </Text>
            <AlertBanner type="error" message={error} />
            <Input
              label="Nombre de la Materia *"
              value={editCatalogName}
              onChangeText={setEditCatalogName}
              placeholder="Ej. Matemática"
            />
            <Input
              label="Descripción"
              value={editCatalogDesc}
              onChangeText={setEditCatalogDesc}
              placeholder="Descripción opcional"
            />
            <Button
              title="Guardar Cambios"
              icon="checkmark-circle-outline"
              loading={savingCatalogEdit}
              onPress={handleSaveCatalogSubjectEdit}
            />
            <Button
              title="Cancelar"
              variant="outline"
              onPress={() => setEditingCatalogSubject(null)}
              style={{ marginBottom: 0 }}
            />
          </View>
        </View>
      </Modal>

      {/* Confirmar eliminación de materia de un curso */}
      <ConfirmModal
        visible={Boolean(courseToDelete)}
        title="Quitar materia del curso"
        message={`¿Confirmás quitar "${courseToDelete?.title}" y sus horarios de ${schoolYear}° Año - ${courseDivision}° Curso?`}
        confirmLabel="Quitar del curso"
        onConfirm={handleDeleteCourseFromSchedule}
        onCancel={() => setCourseToDelete(null)}
      />

      {/* Confirmar eliminación de materia del catálogo general */}
      <ConfirmModal
        visible={Boolean(catalogSubjectToDelete)}
        title="Eliminar materia del catálogo"
        message={`¿Confirmás eliminar "${catalogSubjectToDelete?.name}" del catálogo de materias de la base de datos?`}
        confirmLabel="Eliminar"
        onConfirm={handleDeleteCatalogSubject}
        onCancel={() => setCatalogSubjectToDelete(null)}
      />

      {/* Modal para editar código de acceso de un curso */}
      <Modal visible={Boolean(editingCodeGroup)} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <SectionHeader
              title={`Código de Acceso • Curso ${editingCodeGroup?.label || ''}`}
              subtitle="Modificá la clave que deben ingresar los alumnos para ingresar a este curso"
            />
            <Input
              label="Código de Acceso *"
              value={editCodeValue}
              onChangeText={setEditCodeValue}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Ej. 6TO1RA"
              leftIcon="key-outline"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Button
                title="Cancelar"
                variant="outline"
                style={{ flex: 1, marginBottom: 0 }}
                onPress={() => setEditingCodeGroup(null)}
              />
              <Button
                title={savingCode ? 'Guardando...' : 'Guardar Código'}
                loading={savingCode}
                disabled={savingCode}
                style={{ flex: 1, marginBottom: 0 }}
                onPress={handleSaveEditedCode}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmar eliminación de curso escolar cerrado */}
      <ConfirmModal
        visible={Boolean(confirmDeleteGroup)}
        title="Eliminar Curso Cerrado"
        message={`¿Estás seguro de que deseás eliminar el curso ${confirmDeleteGroup?.label || `${confirmDeleteGroup?.schoolYear}° ${confirmDeleteGroup?.courseDivision}ª`}? Solo se pueden eliminar cursos que estén cerrados. Esta acción eliminará su estructura de horarios.`}
        confirmLabel="Eliminar Curso"
        variant="danger"
        loading={deletingGroupId === confirmDeleteGroup?.id}
        onConfirm={handleDeleteClosedGroup}
        onCancel={() => setConfirmDeleteGroup(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  tabsRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    borderRadius: 20,
    padding: 18,
    maxHeight: '92%',
  },
});
