/**
 * Archivo: mobile/src/screens/instructor/InstructorDashboardScreen.js
 * Descripción: Panel de control intuitivo del docente en el Campus:
 * - Horario oficial sincronizado con Buenos Aires, Argentina (UTC-3).
 * - Próximo módulo a dictar (o clase en curso) con cuenta regresiva / horario.
 * - Métricas clave: Cursos asignados, Alumnos a cargo, Tareas pendientes de corregir.
 * - Cuadrícula de Horarios por Curso Asignado:
 *   • Botones selector arriba de la cuadrícula ÚNICAMENTE para los cursos donde dicta clases (ej. 6° 1° y 6° 2°).
 *   • Al presionar un botón, se despliega abajo la cuadrícula semanal completa de ese curso con sus materias destacadas.
 * - Listado de materias asignadas para subir teoría y actividades prácticas.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { coursesApi, instructorApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import {
  formatDateAR,
  getBuenosAiresNow,
  getNextScheduledClass,
} from '../../utils/dates';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  EmptyState,
  MetricCard,
  SectionHeader,
} from '../../components/ui';
import SchoolScheduleGrid, {
  formatSchoolGroupShort,
} from '../../components/SchoolScheduleGrid';

export default function InstructorDashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 768;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Hora actual de Buenos Aires para cálculos internos del próximo módulo
  const [baTime, setBaTime] = useState(getBuenosAiresNow());

  // Control para mostrar u ocultar la cuadrícula del cronograma en el panel principal
  const [showScheduleSection, setShowScheduleSection] = useState(false);

  // Curso seleccionado para la cuadrícula interactiva
  const [selectedGroup, setSelectedGroup] = useState(null); // { schoolYear, courseDivision, key, label }
  const [groupScheduleData, setGroupScheduleData] = useState(null);
  const [loadingGroupSchedule, setLoadingGroupSchedule] = useState(false);

  // Actualizar hora de Buenos Aires cada 30 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      setBaTime(getBuenosAiresNow());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      setBaTime(getBuenosAiresNow());

      const res = await instructorApi.getDashboard();
      const dashData = res.data.data;
      setData(dashData);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboard(false);
    }, [loadDashboard])
  );

  const metrics = data?.metrics || {};
  const recentCourses = data?.recentCourses || [];
  const mySchedule = data?.mySchedule || [];
  const pendingSubmissions = data?.pendingSubmissions || [];

  // 1. Extraer ÚNICAMENTE los cursos escolares (Año y División) donde el docente está asignado
  const assignedGroups = useMemo(() => {
    const map = new Map();

    (recentCourses || []).forEach((c) => {
      const sy = Number(c.schoolYear);
      const cd = Number(c.courseDivision);
      if (sy && cd) {
        const key = `${sy}-${cd}`;
        if (!map.has(key)) {
          map.set(key, {
            schoolYear: sy,
            courseDivision: cd,
            key,
            label: formatSchoolGroupShort(sy, cd),
            fullLabel: `${sy}° Año - ${cd}° División`,
          });
        }
      }
    });

    (mySchedule || []).forEach((s) => {
      const sy = Number(s.schoolYear);
      const cd = Number(s.courseDivision);
      if (sy && cd) {
        const key = `${sy}-${cd}`;
        if (!map.has(key)) {
          map.set(key, {
            schoolYear: sy,
            courseDivision: cd,
            key,
            label: formatSchoolGroupShort(sy, cd),
            fullLabel: `${sy}° Año - ${cd}° División`,
          });
        }
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => b.schoolYear - a.schoolYear || a.courseDivision - b.courseDivision
    );
  }, [recentCourses, mySchedule]);

  // Filtro por curso escolar para la lista de materias en el dashboard
  const [dashboardGroupFilter, setDashboardGroupFilter] = useState('ALL');

  const filteredRecentCourses = useMemo(() => {
    if (dashboardGroupFilter === 'ALL') return recentCourses;
    return (recentCourses || []).filter((c) => {
      const sy = Number(c.schoolYear) || 1;
      const cd = Number(c.courseDivision) || 1;
      return `${sy}-${cd}` === dashboardGroupFilter;
    });
  }, [recentCourses, dashboardGroupFilter]);

  // Si no hay grupo seleccionado o cambió la lista, preseleccionar el primero
  useEffect(() => {
    if (assignedGroups.length > 0) {
      if (!selectedGroup || !assignedGroups.some((g) => g.key === selectedGroup.key)) {
        setSelectedGroup(assignedGroups[0]);
      }
    } else {
      setSelectedGroup(null);
    }
  }, [assignedGroups]);

  // Cargar cuadrícula completa para el grupo seleccionado
  useEffect(() => {
    if (!selectedGroup) {
      setGroupScheduleData(null);
      return;
    }

    let isMounted = true;
    setLoadingGroupSchedule(true);
    coursesApi
      .getSchoolGroupSchedule(selectedGroup.schoolYear, selectedGroup.courseDivision)
      .then((res) => {
        if (isMounted) setGroupScheduleData(res);
      })
      .catch((err) => {
        if (isMounted) {
          console.log('Error cargando horario de grupo asignado:', err);
          setGroupScheduleData(null);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingGroupSchedule(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedGroup]);

  // 2. Calcular Próximo Módulo a Dictar (o en curso) en hora de Buenos Aires
  const nextClassInfo = useMemo(() => {
    return getNextScheduledClass(mySchedule);
  }, [mySchedule, baTime]);

  if (loading && !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadDashboard(true)}
          tintColor={colors.primary}
        />
      }
    >
      {/* Hero Banner del Docente */}
      <View style={[styles.hero, { backgroundColor: colors.navy }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroName, { color: colors.mode === 'light' ? colors.text : '#ffffff' }]}>
            Prof. {user?.firstName} {user?.lastName}
          </Text>
          <Text style={[styles.heroSub, { color: colors.mode === 'light' ? colors.textSecondary : '#cbd5e1' }]}>
            Panel docente para dictado de clases, gestión de materias y corrección de actividades.
          </Text>
        </View>
        <View style={[styles.roleBadge, { backgroundColor: colors.primary }]}>
          <Ionicons name="easel" size={24} color="#ffffff" />
        </View>
      </View>

      <AlertBanner type="error" message={error} />

      {!user?.twoFactorEnabled && !user?.createdByAdmin && (
        <View
          style={{
            marginBottom: 16,
            backgroundColor: colors.warningSoft || '#fef3c7',
            borderColor: colors.warning || '#f59e0b',
            borderWidth: 1,
            borderRadius: 12,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Ionicons name="shield-outline" size={24} color={colors.warning || '#b45309'} />
          <View style={{ flex: 1, minWidth: 200 }}>
            <Text style={{ fontWeight: '800', color: colors.mode === 'light' ? '#78350f' : '#fef3c7', fontSize: 13 }}>
              Verificación en 2 pasos pendiente
            </Text>
            <Text style={{ fontSize: 12, color: colors.mode === 'light' ? '#92400e' : '#fde68a', marginTop: 2 }}>
              Tu cuenta docente no está verificada. Completá la verificación en 2 pasos para proteger tu cuenta.
            </Text>
          </View>
          <Button
            title="Verificación en 2 pasos"
            small
            variant="warning"
            icon="shield-checkmark-outline"
            onPress={() => navigation.navigate('Profile')}
          />
        </View>
      )}

      {/* PRÓXIMO MÓDULO A DICTAR (Hora Buenos Aires) */}
      <Card
        style={[
          styles.nextClassCard,
          {
            borderColor: nextClassInfo?.isOngoing ? '#10b981' : colors.primary,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name={nextClassInfo?.isOngoing ? 'radio-button-on' : 'calendar-outline'}
              size={18}
              color={nextClassInfo?.isOngoing ? '#10b981' : colors.primary}
            />
            <Text style={[styles.nextClassHeading, { color: colors.text }]}>
              {nextClassInfo?.isOngoing ? 'Dictando en curso ahora' : 'Próximo módulo a dictar'}
            </Text>
          </View>
          {nextClassInfo && (
            <Badge
              label={nextClassInfo.badgeText}
              tone={nextClassInfo.badgeTone}
            />
          )}
        </View>

        {nextClassInfo ? (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.nextClassTitle, { color: colors.text }]}>
              {nextClassInfo.item.courseTitle}
            </Text>
            <View style={styles.nextClassMetaRow}>
              <Badge
                label={`Curso ${formatSchoolGroupShort(nextClassInfo.item.schoolYear, nextClassInfo.item.courseDivision)}`}
                tone="primary"
              />
              <Badge
                label={`${nextClassInfo.item.dayOfWeek} ${nextClassInfo.item.startTime} a ${nextClassInfo.item.endTime} hs`}
                tone="info"
              />
            </View>

            <View style={[styles.rowBetween, { marginTop: 12 }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                {nextClassInfo.statusText}
              </Text>
              <TouchableOpacity
                style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  navigation.navigate('InstructorCourses', {
                    editCourseId: nextClassInfo.item.courseId,
                  });
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>
                  Abrir materia →
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              No tenés módulos de clase asignados pendientes para esta semana escolar.
            </Text>
          </View>
        )}
      </Card>

      {/* MÉTRICAS INTUITIVAS */}
      <View style={styles.metricsRow}>
        <MetricCard
          label="Materias a cargo"
          value={metrics.totalCourses ?? assignedGroups.length}
          icon="book-outline"
          tone="primary"
          subtitle={`${assignedGroups.length} cursos asignados`}
        />
        <MetricCard
          label="Estudiantes"
          value={metrics.totalStudents ?? 0}
          icon="people-outline"
          tone="info"
          subtitle="Alumnos a cargo"
        />
      </View>

      {/* ACCIONES RÁPIDAS */}
      <View style={[styles.quickRow, { marginTop: 14 }]}>
        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: colors.primary, flex: 1 }]}
          onPress={() => navigation.navigate('InstructorCourses')}
        >
          <Ionicons name="folder-outline" size={18} color="#ffffff" />
          <Text style={styles.quickBtnTextPrimary}>Mis Materias ({metrics.totalCourses || 0})</Text>
        </TouchableOpacity>
      </View>

      {/* SECCIÓN: CUADRÍCULA DE CADA CURSO ASIGNADO (CON BOTÓN PARA MOSTRAR U OCULTAR) */}
      <View style={styles.section}>
        <View style={[styles.rowBetween, { marginBottom: 10, alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
              Cuadrícula de Horarios por Curso Asignado
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
              {showScheduleSection
                ? 'Tocá "Ocultar" para no ocupar espacio visual en el panel'
                : 'Oculta para despejar la vista. Tocá "Mostrar" para consultar horarios'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setShowScheduleSection((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 10,
              backgroundColor: showScheduleSection ? colors.card : colors.primary,
              borderWidth: 1.5,
              borderColor: showScheduleSection ? colors.border : colors.primary,
            }}
          >
            <Ionicons
              name={showScheduleSection ? 'eye-off-outline' : 'calendar-outline'}
              size={16}
              color={showScheduleSection ? colors.text : '#ffffff'}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '800',
                color: showScheduleSection ? colors.text : '#ffffff',
              }}
            >
              {showScheduleSection ? 'Ocultar Cuadrícula' : 'Mostrar Cuadrícula'}
            </Text>
          </TouchableOpacity>
        </View>

        {showScheduleSection && (
          assignedGroups.length === 0 ? (
            <Card>
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 8 }}>
                Aún no tenés cursos asignados por el Administrador escolar. Cuando te asignen materias y horarios en el cronograma, aparecerán aquí sus cuadrículas.
              </Text>
            </Card>
          ) : (
            <Card style={{ borderColor: colors.primary, borderWidth: 1.5 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: colors.textSecondary,
                  marginBottom: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Cursos donde dictás clases (Elegí uno para ver su cuadrícula):
              </Text>

              {/* BOTONES SELECTORES: ÚNICAMENTE LOS CURSOS ASIGNADOS */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {assignedGroups.map((grp) => {
                    const isSelected = selectedGroup?.key === grp.key;
                    return (
                      <TouchableOpacity
                        key={grp.key}
                        onPress={() => setSelectedGroup(grp)}
                        style={{
                          paddingVertical: 9,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.primary : colors.background,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'grid-outline'}
                          size={16}
                          color={isSelected ? '#ffffff' : colors.textSecondary}
                        />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '800',
                            color: isSelected ? '#ffffff' : colors.text,
                          }}
                        >
                          {grp.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* DESPLIEGUE DE LA CUADRÍCULA DEL CURSO ELEGIDO */}
              {selectedGroup && (
                <View style={{ marginTop: 4 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                      paddingBottom: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
                        Cuadrícula Oficial del Curso {selectedGroup.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {selectedGroup.fullLabel} • Tus materias están destacadas
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('CourseGroup', {
                          schoolYear: selectedGroup.schoolYear,
                          courseDivision: selectedGroup.courseDivision,
                        })
                      }
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                        Ver pantalla completa →
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {loadingGroupSchedule ? (
                    <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
                        Cargando horarios de {selectedGroup.label}...
                      </Text>
                    </View>
                  ) : (
                    <SchoolScheduleGrid
                      schoolYear={selectedGroup.schoolYear}
                      courseDivision={selectedGroup.courseDivision}
                      schedule={groupScheduleData?.schedule || []}
                      highlightInstructorId={user?.id}
                    />
                  )}
                </View>
              )}
            </Card>
          )
        )}
      </View>

      {/* SECCIÓN: MIS MATERIAS ASIGNADAS */}
      <View style={styles.section}>
        <SectionHeader
          title="Mis materias a cargo"
          subtitle="Subí material teórico y avisos oficiales para tus alumnos"
          actionLabel="Ver todas"
          onAction={() =>
            navigation.navigate('InstructorCourses', {
              filterGroupKey: dashboardGroupFilter !== 'ALL' ? dashboardGroupFilter : undefined,
            })
          }
        />

        {/* Chips de cursos si tiene más de 1 curso asignado */}
        {assignedGroups.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, marginBottom: 12, paddingVertical: 2 }}
          >
            <TouchableOpacity
              onPress={() => setDashboardGroupFilter('ALL')}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor:
                  dashboardGroupFilter === 'ALL'
                    ? colors.primary
                    : colors.mode === 'light'
                    ? '#f1f5f9'
                    : '#1e293b',
                borderWidth: 1.5,
                borderColor: dashboardGroupFilter === 'ALL' ? colors.primary : colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: dashboardGroupFilter === 'ALL' ? '#ffffff' : colors.text,
                }}
              >
                Todos ({recentCourses.length})
              </Text>
            </TouchableOpacity>

            {assignedGroups.map((grp) => {
              const isSelected = dashboardGroupFilter === grp.key;
              const count = (recentCourses || []).filter(
                (c) => `${Number(c.schoolYear) || 1}-${Number(c.courseDivision) || 1}` === grp.key
              ).length;
              return (
                <TouchableOpacity
                  key={grp.key}
                  onPress={() => setDashboardGroupFilter(grp.key)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: isSelected
                      ? colors.primary
                      : colors.mode === 'light'
                      ? '#f1f5f9'
                      : '#1e293b',
                    borderWidth: 1.5,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: isSelected ? '#ffffff' : colors.text,
                    }}
                  >
                    {grp.label} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {recentCourses.length === 0 ? (
          <EmptyState
            icon="school-outline"
            title="Aún no tenés materias asignadas"
            message="Cuando el Administrador te asigne materias y horarios en el cronograma escolar, aparecerán abiertas aquí para que subas material teórico y avisos."
          />
        ) : filteredRecentCourses.length === 0 ? (
          <EmptyState
            icon="school-outline"
            title="Sin materias para este curso"
            message="No tenés materias asignadas en el curso seleccionado."
            actionLabel="Ver todas las materias"
            onAction={() => setDashboardGroupFilter('ALL')}
          />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {filteredRecentCourses.map((course) => (
              <View
                key={course.id}
                style={{
                  width: isDesktop ? 'calc((100% - 28px) / 3)' : '100%',
                  maxWidth: isDesktop ? 'calc((100% - 28px) / 3)' : '100%',
                  flexGrow: isDesktop ? 0 : 1,
                  flexShrink: 0,
                }}
              >
                <Card
                  onPress={() => navigation.navigate('InstructorCourses', { editCourseId: course.id })}
                  style={{ height: '100%', marginBottom: 0, justifyContent: 'space-between' }}
                >
                  <View>
                    <View style={styles.rowBetween}>
                      <Badge
                        label={
                          course.schoolGroupLabel ||
                          `${course.schoolYear || 1}° Año - ${course.courseDivision || 1}° Curso`
                        }
                        tone="primary"
                      />
                      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                        {course.enrolledCount || 0} alumnos
                      </Text>
                    </View>
                    <Text style={[styles.itemTitle, { color: colors.text, marginTop: 8 }]}>
                      {course.title}
                    </Text>
                    {(course.schedules || []).length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {course.schedules.map((sch) => (
                          <Badge
                            key={sch.id}
                            label={`${sch.dayOfWeek} ${sch.startTime} a ${sch.endTime} hs`}
                            tone="info"
                          />
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={[styles.rowBetween, { marginTop: 14 }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {course.modulesCount || 0} módulos
                    </Text>
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>
                      Abrir materia →
                    </Text>
                  </View>
                </Card>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: {
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  tzBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  tzText: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroName: { color: '#ffffff', fontSize: 21, fontWeight: '800', marginTop: 2 },
  heroSub: { color: '#cbd5e1', fontSize: 13, marginTop: 4, lineHeight: 18 },
  roleBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  nextClassCard: {
    borderWidth: 2,
    marginBottom: 16,
  },
  nextClassHeading: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  nextClassTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  nextClassMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  smallActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  quickBtnTextPrimary: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  quickBtnText: { fontWeight: '700', fontSize: 13 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  section: { marginTop: 20 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  itemSub: { fontSize: 13, marginTop: 3 },
});
