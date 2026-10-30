/**
 * Archivo: mobile/src/screens/shared/CourseGroupScreen.js
 * Descripción: Vista interior de un curso escolar (por ejemplo "Curso 6to 1ra").
 * Disponible para Alumnos, Docentes y Administradores:
 * - Muestra la Cuadrícula de Horarios de Lunes a Viernes con:
 *   • Turno Mañana: 07:30 a 09:30, 09:40 a 11:40 y Extra 11:50 a 12:50
 *   • Turno Tarde: 13:00 a 14:50 y 15:10 a 17:10
 * - Muestra todas las materias que se dictan en ese curso y qué profesor está a cargo.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { coursesApi, instructorApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import { AlertBanner, Badge, Button, Card, EmptyState, SectionHeader } from '../../components/ui';
import SchoolScheduleGrid, {
  formatSchoolGroupShort,
} from '../../components/SchoolScheduleGrid';

export default function CourseGroupScreen({ route, navigation }) {
  const { user } = useAuth();
  const { colors } = useTheme();

  const initialYear = Number(route?.params?.schoolYear || user?.schoolYear || 6);
  const initialDiv = Number(route?.params?.courseDivision || user?.courseDivision || 1);

  const [schoolYear, setSchoolYear] = useState(initialYear);
  const [courseDivision, setCourseDivision] = useState(initialDiv);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [instructorGroups, setInstructorGroups] = useState([]);

  useEffect(() => {
    if (user?.role === 'instructor') {
      instructorApi
        .getCourses()
        .then((res) => {
          const list = res.data?.data || [];
          const seen = new Set();
          const grps = [];
          list.forEach((c) => {
            const sy = Number(c.schoolYear);
            const cd = Number(c.courseDivision);
            if (sy && cd) {
              const k = `${sy}-${cd}`;
              if (!seen.has(k)) {
                seen.add(k);
                grps.push({
                  schoolYear: sy,
                  courseDivision: cd,
                  key: k,
                  label: formatSchoolGroupShort(sy, cd),
                });
              }
            }
          });
          setInstructorGroups(grps);
          if (
            grps.length > 0 &&
            !grps.some((g) => g.schoolYear === schoolYear && g.courseDivision === courseDivision)
          ) {
            setSchoolYear(grps[0].schoolYear);
            setCourseDivision(grps[0].courseDivision);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (route?.params?.schoolYear) setSchoolYear(Number(route.params.schoolYear));
    if (route?.params?.courseDivision) setCourseDivision(Number(route.params.courseDivision));
  }, [route?.params?.schoolYear, route?.params?.courseDivision]);

  const loadGroup = useCallback(
    async (isRefresh = false, yr = schoolYear, div = courseDivision) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');
        const res = await coursesApi.getSchoolGroupSchedule(yr, div);
        setData(res);
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
      loadGroup(false, schoolYear, courseDivision);
    }, [loadGroup, schoolYear, courseDivision])
  );

  const shortLabel = formatSchoolGroupShort(schoolYear, courseDivision);
  const courses = data?.courses || [];
  const schedule = data?.schedule || [];

  const handleOpenCourseItem = (courseId) => {
    if (!courseId) return;
    if (user?.role === 'instructor') {
      const target = courses.find((c) => Number(c.id) === Number(courseId));
      if (target && Number(target.instructorId) === Number(user.id)) {
        navigation.navigate('MainTabs', {
          screen: 'InstructorCourses',
          params: { editCourseId: courseId },
        });
        return;
      }
    }
    navigation.navigate('CourseDetail', { courseId });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadGroup(true, schoolYear, courseDivision)}
          tintColor={colors.primary}
        />
      }
    >
      {/* Encabezado del Curso (ej. Curso 6to 1ra) */}
      <View style={[styles.hero, { backgroundColor: colors.navy }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroTag, { color: colors.mode === 'light' ? colors.primary : '#93c5fd' }]}>CAMPUS ESCOLAR • VISTA DEL CURSO</Text>
          <Text style={[styles.heroTitle, { color: colors.mode === 'light' ? colors.text : '#ffffff' }]}>Curso {shortLabel}</Text>
          <Text style={[styles.heroSub, { color: colors.mode === 'light' ? colors.textSecondary : '#cbd5e1' }]}>
            {schoolYear}° Año - {courseDivision}° División • {courses.length}{' '}
            {courses.length === 1 ? 'materia' : 'materias'} • {schedule.length}{' '}
            {schedule.length === 1 ? 'bloque horario' : 'bloques horarios'}
          </Text>
        </View>
        {user?.role === 'admin' && (
          <Button
            title="Editar en Admin"
            icon="create-outline"
            small
            style={{ marginBottom: 0 }}
            onPress={() =>
              navigation.navigate('MainTabs', {
                screen: 'AdminCourses',
                params: {
                  initialSection: 'schedule',
                  schoolYear,
                  courseDivision,
                },
              })
            }
          />
        )}
      </View>

      {/* Selector de Curso (Docente: únicamente cursos asignados; Alumno/Admin: catálogo escolar) */}
      <Card style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary, marginBottom: 8 }}>
          {user?.role === 'instructor'
            ? 'Tus cursos asignados como docente:'
            : 'Cambiar de curso (ej. 6to 1ra):'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {user?.role === 'instructor' ? (
              instructorGroups.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Aún no tenés cursos asignados como docente.
                </Text>
              ) : (
                instructorGroups.map((g) => {
                  const active = schoolYear === g.schoolYear && courseDivision === g.courseDivision;
                  return (
                    <Pressable
                      key={g.key}
                      onPress={() => {
                        setSchoolYear(g.schoolYear);
                        setCourseDivision(g.courseDivision);
                      }}
                      style={{
                        paddingVertical: 7,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : colors.background,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: active ? '#ffffff' : colors.text,
                        }}
                      >
                        {g.label}
                      </Text>
                    </Pressable>
                  );
                })
              )
            ) : (
              [1, 2, 3, 4, 5, 6].map((yr) =>
                [1, 2, 3].map((div) => {
                  const active = schoolYear === yr && courseDivision === div;
                  const lbl = formatSchoolGroupShort(yr, div);
                  return (
                    <Pressable
                      key={`${yr}-${div}`}
                      onPress={() => {
                        setSchoolYear(yr);
                        setCourseDivision(div);
                      }}
                      style={{
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : colors.background,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: active ? '#ffffff' : colors.text,
                        }}
                      >
                        {lbl}
                      </Text>
                    </Pressable>
                  );
                })
              )
            )}
          </View>
        </ScrollView>
      </Card>

      <AlertBanner type="error" message={error} />

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 28 }} />
      ) : (
        <>
          {/* CUADRÍCULA DE HORARIOS DEL CURSO (LUNES A VIERNES, MAÑANA + EXTRA + TARDE) */}
          <SchoolScheduleGrid
            schoolYear={schoolYear}
            courseDivision={courseDivision}
            schedule={schedule}
            editable={false}
            highlightInstructorId={user?.role === 'instructor' ? user?.id : null}
            onPressOccupiedCell={(entry) => handleOpenCourseItem(entry.courseId)}
          />

          {/* Listado de Materias del Curso */}
          <SectionHeader
            title={`Materias de ${shortLabel} (${courses.length})`}
            subtitle="Tocá una materia para ingresar al aula virtual (teoría, actividades y evaluaciones)"
          />

          {courses.length === 0 ? (
            <EmptyState
              icon="book-outline"
              title={`Sin materias cargadas en ${shortLabel}`}
              message="El Administrador aún no asignó materias a este curso."
            />
          ) : (
            courses.map((course) => {
              const hasTeacher =
                course.instructorId &&
                course.instructorName &&
                course.instructorName !== 'Sin profesor asignado';
              return (
                <Card key={course.id} onPress={() => handleOpenCourseItem(course.id)}>
                  <View style={styles.rowBetween}>
                    <Badge label={shortLabel} tone="primary" />
                    <Badge label={`${course.studentsCount || 0} alumnos`} tone="success" />
                  </View>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{course.title}</Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: hasTeacher ? colors.textSecondary : colors.warning,
                      marginTop: 4,
                    }}
                  >
                    Profesor/a: {hasTeacher ? course.instructorName : 'Sin profesor asignado (Vacante)'}
                  </Text>
                  {(course.schedules || []).length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {course.schedules.map((s) => (
                        <Badge
                          key={s.id}
                          label={`${s.dayOfWeek} ${s.startTime} a ${s.endTime}`}
                          tone="info"
                        />
                      ))}
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  hero: {
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heroTag: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  heroSub: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
  },
});
