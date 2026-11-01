import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { instructorApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import { formatDateAR } from '../../utils/dates';
import { formatSchoolGroupShort } from '../../components/SchoolScheduleGrid';
import {
  AlertBanner,
  Badge,
  Card,
  Chip,
  EmptyState,
  Input,
  SectionHeader,
} from '../../components/ui';

export default function InstructorStudentsScreen() {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 768;
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);

  // Filtro por curso: 'all' (Lista completa) o clave de curso 'año-division' (ej. '6-1')
  const [selectedGroupKey, setSelectedGroupKey] = useState('all');
  const [selectedCourseId, setSelectedCourseId] = useState(''); // Filtro opcional por materia específica

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      let syParam = undefined;
      let cdParam = undefined;
      if (selectedGroupKey && selectedGroupKey !== 'all') {
        const [sy, cd] = selectedGroupKey.split('-');
        syParam = Number(sy);
        cdParam = Number(cd);
      }

      const [studentsRes, coursesRes] = await Promise.all([
        instructorApi.getStudents({
          courseId: selectedCourseId || undefined,
          schoolYear: syParam,
          courseDivision: cdParam,
          search: search.trim() || undefined,
        }),
        instructorApi.getCourses(),
      ]);

      setStudents(studentsRes.data.data || []);
      setCourses(coursesRes.data.data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedGroupKey, selectedCourseId, search]);

  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [loadData])
  );

  // Lista de cursos/divisiones disponibles detectados a partir de las materias y estudiantes
  const schoolGroups = useMemo(() => {
    const map = new Map();

    // Cursos derivados de las materias
    courses.forEach((c) => {
      const y = c.schoolYear || 1;
      const d = c.courseDivision || 1;
      const key = `${y}-${d}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          schoolYear: y,
          courseDivision: d,
          label: formatSchoolGroupShort(y, d),
          fullLabel: `${y}° Año - ${d}° Curso`,
        });
      }
    });

    // Cursos derivados de los estudiantes
    students.forEach((s) => {
      if (s.schoolYear && s.courseDivision) {
        const key = `${s.schoolYear}-${s.courseDivision}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            schoolYear: s.schoolYear,
            courseDivision: s.courseDivision,
            label: formatSchoolGroupShort(s.schoolYear, s.courseDivision),
            fullLabel: `${s.schoolYear}° Año - ${s.courseDivision}° Curso`,
          });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.schoolYear !== b.schoolYear) return a.schoolYear - b.schoolYear;
      return a.courseDivision - b.courseDivision;
    });
  }, [courses, students]);

  // Filtrado de alumnos en memoria (apoyo instantáneo a la búsqueda)
  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((stu) => {
      // Filtro por curso si está seleccionado
      if (selectedGroupKey && selectedGroupKey !== 'all') {
        const [sy, cd] = selectedGroupKey.split('-');
        const matchesGroup =
          Number(stu.schoolYear) === Number(sy) && Number(stu.courseDivision) === Number(cd);
        if (!matchesGroup) return false;
      }

      // Filtro por materia específica si está seleccionada
      if (selectedCourseId) {
        const hasCourse = (stu.subjects || []).some(
          (sub) => String(sub.id) === String(selectedCourseId)
        );
        if (!hasCourse) return false;
      }

      // Búsqueda por texto (nombre, apellido, email, curso o nombre de materia)
      if (term) {
        const nameMatch = `${stu.firstName || ''} ${stu.lastName || ''}`.toLowerCase().includes(term);
        const emailMatch = (stu.email || '').toLowerCase().includes(term);
        const groupMatch = (stu.schoolGroupLabel || '').toLowerCase().includes(term);
        const subjectMatch = (stu.subjects || []).some((sub) =>
          (sub.title || '').toLowerCase().includes(term)
        );
        return nameMatch || emailMatch || groupMatch || subjectMatch;
      }

      return true;
    });
  }, [students, selectedGroupKey, selectedCourseId, search]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadData(true)}
          tintColor={colors.primary}
        />
      }
    >
      <SectionHeader
        title="Listado de Estudiantes"
        subtitle="Consultá alumnos por curso o visualizá la nómina completa sin duplicados"
      />

      <AlertBanner type="error" message={error} />

      {/* Buscador de alumnos */}
      <Input
        placeholder="Buscar por nombre, apellido, correo o materia..."
        value={search}
        onChangeText={setSearch}
        leftIcon="search-outline"
      />

      {/* SELECTOR DE CURSO / LISTA COMPLETA */}
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
          Filtrar por Curso:
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {/* Opción: Lista completa / Todos los cursos */}
            <TouchableOpacity
              onPress={() => setSelectedGroupKey('all')}
              style={[
                styles.courseChip,
                {
                  backgroundColor: selectedGroupKey === 'all' ? colors.primary : colors.card,
                  borderColor: selectedGroupKey === 'all' ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={16}
                color={selectedGroupKey === 'all' ? '#ffffff' : colors.text}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.courseChipText,
                  { color: selectedGroupKey === 'all' ? '#ffffff' : colors.text },
                ]}
              >
                Todos los cursos ({students.length})
              </Text>
            </TouchableOpacity>

            {/* Chips de cursos específicos */}
            {schoolGroups.map((grp) => {
              const active = selectedGroupKey === grp.key;
              const countInGroup = students.filter(
                (s) =>
                  Number(s.schoolYear) === Number(grp.schoolYear) &&
                  Number(s.courseDivision) === Number(grp.courseDivision)
              ).length;

              return (
                <TouchableOpacity
                  key={grp.key}
                  onPress={() => setSelectedGroupKey(grp.key)}
                  style={[
                    styles.courseChip,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="school-outline"
                    size={15}
                    color={active ? '#ffffff' : colors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.courseChipText,
                      { color: active ? '#ffffff' : colors.text },
                    ]}
                  >
                    Curso {grp.label} ({countInGroup})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Barra de estado / conteo de alumnos */}
      <View style={[styles.summaryBar, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
        <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
          {selectedGroupKey === 'all'
            ? `Mostrando nómina completa: ${filteredStudents.length} ${filteredStudents.length === 1 ? 'estudiante' : 'estudiantes'}`
            : `Mostrando Curso ${schoolGroups.find((g) => g.key === selectedGroupKey)?.label || ''}: ${filteredStudents.length} ${filteredStudents.length === 1 ? 'estudiante' : 'estudiantes'}`}
        </Text>
      </View>

      {/* LISTADO DE ESTUDIANTES ÚNICOS */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 28 }} />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No se encontraron estudiantes"
          message={
            search
              ? 'No hay estudiantes que coincidan con la búsqueda.'
              : 'No hay estudiantes inscriptos en este curso.'
          }
        />
      ) : (
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: isDesktop ? 'wrap' : 'nowrap', gap: 14 }}>
          {filteredStudents.map((item) => {
            const subjects = item.subjects || [];
            return (
              <View
                key={item.studentId}
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
                    {/* Encabezado de la tarjeta: Curso y total de materias */}
                    <View style={styles.rowBetween}>
                      <View
                        style={{
                          backgroundColor: '#1d4ed8',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 10,
                        }}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>
                          🎓 Curso: {item.schoolGroupLabel || formatSchoolGroupShort(item.schoolYear, item.courseDivision)}
                        </Text>
                      </View>

                      <Badge
                        label={subjects.length > 0 ? `${subjects.length} ${subjects.length === 1 ? 'materia' : 'materias'}` : 'Sin materias'}
                        tone={subjects.length > 0 ? 'success' : 'neutral'}
                      />
                    </View>

                    {/* Datos personales del estudiante */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: colors.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                        }}
                      >
                        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '800' }}>
                          {(item.firstName?.[0] || 'A').toUpperCase()}
                          {(item.lastName?.[0] || '').toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.studentName, { color: colors.text }]}>
                          {item.firstName} {item.lastName}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                          {item.email}
                        </Text>
                      </View>
                    </View>

                    {/* Materias a las que está inscripto */}
                    <View style={[styles.subjectsContainer, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, marginTop: 12 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Ionicons name="book-outline" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                          Materias inscriptas ({subjects.length}):
                        </Text>
                      </View>

                      {subjects.length === 0 ? (
                        <Text style={{ fontSize: 12, color: colors.textMuted, fontStyle: 'italic' }}>
                          El estudiante aún no tiene materias asignadas.
                        </Text>
                      ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {subjects.map((sub) => (
                            <View
                              key={sub.id}
                              style={[
                                styles.subjectBadge,
                                {
                                  backgroundColor: colors.card,
                                  borderColor: colors.border,
                                },
                              ]}
                            >
                              <Text style={[styles.subjectBadgeText, { color: colors.text }]}>
                                {sub.title}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Fecha de registro */}
                  {item.enrolledAt && (
                    <View style={{ marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        Registrado en el campus: {formatDateAR(item.enrolledAt)}
                      </Text>
                    </View>
                  )}
                </Card>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  courseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  courseChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
    gap: 8,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  studentName: {
    fontSize: 16,
    fontWeight: '800',
  },
  subjectsContainer: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  subjectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  subjectBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
