// Importa los hooks de React para estado y callbacks.
import React, { useCallback, useState } from 'react';
// Importa los componentes visuales y de estilos nativos de React Native.
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
// Importa el hook de foco de navegación.
import { useFocusEffect } from '@react-navigation/native';
// Importa la librería de íconos Ionicons.
import { Ionicons } from '@expo/vector-icons';
// Importa el contexto de autenticación.
import { useAuth } from '../../contexto/ContextoAcceso';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa los servicios de API de administración y asistencia.
import { adminApi, attendanceApi } from '../../api/servicios';
// Importa la utilidad para extraer mensajes de error.
import { extractErrorMessage } from '../../utilidades/errores';
// Importa los componentes reutilizables de la interfaz.
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  MetricCard,
  ProgressBar,
  SectionHeader,
} from '../../componentes/interfaz';
// Importa el componente de grilla horaria escolar.
import SchoolScheduleGrid from '../../componentes/GrillaHorarios';
// Importa el gancho de sincronización automática en tiempo real.
import usarTiempoReal from '../../ganchos/usarTiempoReal';

// Define las propiedades recibidas por el panel principal de administración.
interface PropiedadesPantallaPanelAdmin {
  navigation: any;
}

// Renderiza el panel de administración institucional con métricas, cursos abiertos y cronogramas.
export default function DashboardScreen({ navigation }: PropiedadesPantallaPanelAdmin) {
  // Obtiene el usuario autenticado.
  const { user } = useAuth();
  // Obtiene la paleta de colores activa.
  const { colors } = useTheme();
  // Estados para los datos del panel, banderas de carga y errores.
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Estados para el listado de cursos abiertos y su grilla horaria individual.
  const [openCourses, setOpenCourses] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(false);

  // Carga el cronograma horario del curso escolar seleccionado.
  const loadScheduleForGroup = useCallback(async (grp: any, silent: boolean = false) => {
    if (!grp) {
      setSchedule([]);
      return;
    }
    try {
      if (!silent) setLoadingSchedule(true);
      const res = await adminApi.getSchedule({
        schoolYear: grp.schoolYear,
        courseDivision: grp.courseDivision,
      });
      const sched = res?.data?.schedule || res?.schedule || [];
      setSchedule(sched);
    } catch (err) {
      console.error('Error cargando cronograma de curso:', err);
    } finally {
      if (!silent) setLoadingSchedule(false);
    }
  }, []);

  // Consulta en paralelo las métricas globales y los cursos abiertos de la institución.
  const loadDashboard = useCallback(
    async (isRefresh: boolean = false, silent: boolean = false) => {
      try {
        if (!silent) {
          if (isRefresh) setRefreshing(true);
          else setLoading(true);
          setError('');
        }

        const [dashRes, openCoursesRes] = await Promise.all([
          adminApi.getDashboard(),
          attendanceApi.getOpenCourses(),
        ]);

        const d = dashRes?.data?.data || dashRes?.data || dashRes;
        setData(d);

        const openList = Array.isArray(openCoursesRes)
          ? openCoursesRes
          : openCoursesRes?.data || [];
        setOpenCourses(openList);

        if (openList.length > 0) {
          setSelectedGroup((prev: any) => {
            const found = prev
              ? openList.find(
                  (g: any) =>
                    g.schoolYear === prev.schoolYear &&
                    g.courseDivision === prev.courseDivision
                )
              : null;
            const target = found || openList[0];
            loadScheduleForGroup(target, silent);
            return target;
          });
        } else {
          setSelectedGroup(null);
          setSchedule([]);
        }
      } catch (err) {
        if (!silent) setError(extractErrorMessage(err));
      } finally {
        if (!silent) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [loadScheduleForGroup]
  );

  // Actualiza automáticamente los datos del panel cuando otro dispositivo realiza cambios.
  usarTiempoReal(() => {
    loadDashboard(false, true);
  });

  // Cambia el curso seleccionado y carga su cronograma correspondiente.
  const handleSelectGroup = (grp: any): void => {
    setSelectedGroup(grp);
    loadScheduleForGroup(grp);
  };

  // Recarga el tablero cuando la pantalla obtiene foco.
  useFocusEffect(
    useCallback(() => {
      loadDashboard(false);
    }, [loadDashboard])
  );

  // Muestra el indicador de carga inicial si aún no hay datos disponibles.
  if (loading && !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Extrae los bloques de métricas y distribución de roles.
  const metrics = data?.metrics || {};
  const roleDistribution = data?.roleDistribution || [];

  // Renderiza el panel completo del administrador.
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
      <View style={[styles.hero, { backgroundColor: colors.navy }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: colors.mode === 'light' ? colors.primary : '#93c5fd' }]}>Administración Institucional</Text>
          <Text style={[styles.heroName, { color: colors.mode === 'light' ? colors.text : '#ffffff' }]}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={[styles.heroSub, { color: colors.mode === 'light' ? colors.textSecondary : '#cbd5e1' }]}>
            Supervisión integral de usuarios, oferta académica, métricas y cronogramas.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.profileBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('Profile')}
        >
          <Ionicons name="shield-checkmark" size={22} color="#ffffff" />
        </TouchableOpacity>
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
              Completá la verificación en 2 pasos por correo para proteger el acceso administrativo.
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

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('AdminCourses', { initialSection: 'groups' })
          }
          activeOpacity={0.8}
          style={{
            flex: 1,
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1.5,
            borderColor: colors.primary,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: `${colors.primary}18`,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <Ionicons name="school" size={20} color={colors.primary} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
            Gestión de Cursos
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: colors.textSecondary,
              marginTop: 4,
              lineHeight: 15,
            }}
          >
            Abrir, cerrar o eliminar cursos escolares (1° a 6° Año, 1° a 3° Curso).
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}
            >
              Ingresar →
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() =>
            navigation.navigate('AdminCourses', { initialSection: 'catalog' })
          }
          activeOpacity={0.8}
          style={{
            flex: 1,
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1.5,
            borderColor: colors.secondary || '#3b82f6',
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: `${colors.secondary || '#3b82f6'}18`,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <Ionicons
              name="book"
              size={20}
              color={colors.secondary || '#3b82f6'}
            />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
            Gestión de Materias
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: colors.textSecondary,
              marginTop: 4,
              lineHeight: 15,
            }}
          >
            Crear, editar y dar de alta materias en la base de datos institucional.
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '800',
                color: colors.secondary || '#3b82f6',
              }}
            >
              Ingresar →
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.metricsRow}>
        <MetricCard
          label="Usuarios totales"
          value={metrics.totalUsers ?? 0}
          icon="people-outline"
          tone="primary"
          subtitle={`${metrics.activeUsers ?? 0} activos`}
          onPress={() => navigation.navigate('Users')}
        />
        <MetricCard
          label="Cursos"
          value={metrics.totalCourses ?? metrics.totalSchoolGroups ?? openCourses.length ?? 0}
          icon="library-outline"
          tone="info"
          subtitle={`${metrics.openSchoolGroups ?? openCourses.length ?? 0} abiertos`}
          onPress={() => navigation.navigate('AdminCourses', { initialSection: 'groups' })}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Distribución por rol institucional"
          actionLabel="Gestionar usuarios"
          onAction={() => navigation.navigate('Users')}
        />
        <Card>
          {roleDistribution.map((r: any) => {
            const total = metrics.totalUsers || 1;
            const pct = Math.round(((r.count || 0) / total) * 100);
            const roleLabel =
              r.role === 'admin'
                ? 'Administradores'
                : r.role === 'instructor'
                ? 'Docentes'
                : r.role === 'preceptor'
                ? 'Preceptores'
                : 'Estudiantes';
            return (
              <View key={r.role} style={{ marginBottom: 12 }}>
                <View style={styles.rowBetween}>
                  <Text
                    style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}
                  >
                    {roleLabel}
                  </Text>
                  <Badge label={`${r.count} (${pct}%)`} tone="primary" />
                </View>
                <View style={{ marginTop: 6 }}>
                  <ProgressBar progress={pct} showLabel={false} />
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Cronogramas de Cursos Abiertos"
          subtitle="Elegí un curso abierto para ver su cuadrícula horaria y materias asignadas"
          actionLabel="Armador Completo"
          onAction={() =>
            navigation.navigate('AdminCourses', { initialSection: 'schedule' })
          }
        />

        {openCourses.length === 0 ? (
          <EmptyState
            icon="school-outline"
            title="No hay cursos abiertos actualmente"
            message="Abrí cursos escolares (ej. 6° 1ª) desde 'Gestión de Cursos' para poder cargar y visualizar sus cronogramas."
            actionLabel="Ir a Gestión de Cursos"
            onAction={() =>
              navigation.navigate('AdminCourses', { initialSection: 'groups' })
            }
          />
        ) : (
          <Card style={{ padding: 14, overflow: 'hidden' }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '800',
                color: colors.textSecondary,
                marginBottom: 8,
                textTransform: 'uppercase',
              }}
            >
              Seleccionar Curso Abierto:
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
            >
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {openCourses.map((grp) => {
                  const isSelected =
                    selectedGroup?.schoolYear === grp.schoolYear &&
                    selectedGroup?.courseDivision === grp.courseDivision;
                  return (
                    <Chip
                      key={grp.id}
                      label={`${grp.fullLabel} (${grp.subjectsCount || 0} materias)`}
                      selected={isSelected}
                      onPress={() => handleSelectGroup(grp)}
                    />
                  );
                })}
              </View>
            </ScrollView>

            {loadingSchedule ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  Cargando cuadrícula de horarios...
                </Text>
              </View>
            ) : selectedGroup ? (
              <View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <View>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '900',
                        color: colors.text,
                      }}
                    >
                      Horarios de {selectedGroup.fullLabel}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: colors.textSecondary,
                        marginTop: 2,
                      }}
                    >
                      {schedule.length}{' '}
                      {schedule.length === 1
                        ? 'bloque horario asignado'
                        : 'bloques horarios asignados'}{' '}
                      • {selectedGroup.studentsCount || 0} alumnos inscriptos
                    </Text>
                  </View>
                  <Badge label="Curso Abierto" tone="success" />
                </View>

                <SchoolScheduleGrid
                  schoolYear={selectedGroup.schoolYear}
                  courseDivision={selectedGroup.courseDivision}
                  schedule={schedule}
                  editable={true}
                  onPressOccupiedCell={(entry: any) =>
                    navigation.navigate('AdminCourses', {
                      initialSection: 'schedule',
                      schoolYear: selectedGroup.schoolYear,
                      courseDivision: selectedGroup.courseDivision,
                      editCourseId: entry.courseId,
                      t: Date.now(),
                    })
                  }
                  onPressEmptyCell={(day: string, mod: any) =>
                    navigation.navigate('AdminCourses', {
                      initialSection: 'schedule',
                      schoolYear: selectedGroup.schoolYear,
                      courseDivision: selectedGroup.courseDivision,
                      assignDay: day,
                      assignStart: mod.start,
                      assignEnd: mod.end,
                      t: Date.now(),
                    })
                  }
                />

                <Button
                  title={`Modificar horarios de ${selectedGroup.label || selectedGroup.fullLabel}`}
                  icon="calendar-outline"
                  variant="outline"
                  small
                  onPress={() =>
                    navigation.navigate('AdminCourses', {
                      initialSection: 'schedule',
                      schoolYear: selectedGroup.schoolYear,
                      courseDivision: selectedGroup.courseDivision,
                    })
                  }
                  style={{ marginTop: 12, marginBottom: 0 }}
                />
              </View>
            ) : null}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

// Define la hoja de estilos visuales del panel de administración.
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
  greeting: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroName: { color: '#ffffff', fontSize: 21, fontWeight: '800', marginTop: 2 },
  heroSub: { color: '#cbd5e1', fontSize: 13, marginTop: 4, lineHeight: 18 },
  profileBtn: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  metricsRow: { flexDirection: 'row', gap: 10 },
  section: { marginTop: 22 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
