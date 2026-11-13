// Importa los hooks de React para estado, memorización y callbacks.
import React, { useCallback, useMemo, useState } from 'react';
// Importa los componentes visuales nativos de React Native.
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
// Importa el hook de foco de navegación.
import { useFocusEffect } from '@react-navigation/native';
// Importa la librería de íconos Ionicons.
import { Ionicons } from '@expo/vector-icons';
// Importa los componentes reutilizables de la interfaz.
import { Button, ErrorBanner, Input, Loading, Screen, SectionHeader, StatCard, SuccessBanner } from '../../componentes/interfaz';
// Importa el servicio de API de usuarios.
import { usersApi } from '../../api/servicios';
// Importa el contexto de autenticación.
import { useAuth } from '../../contexto/ContextoAcceso';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa la utilidad para extraer mensajes de error.
import { getErrorMessage } from '../../utilidades/errores';
// Importa el componente de grilla horaria y el formateador de cursos.
import SchoolScheduleGrid, { formatSchoolGroupShort } from '../../componentes/GrillaHorarios';

// Define el orden secuencial de los días hábiles de la semana.
const DAYS_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

// Define las propiedades recibidas por la pantalla de inicio del alumno.
interface PropiedadesPantallaInicioAlumno {
  navigation: any;
}

// Renderiza la pantalla principal del alumno con su resumen académico, curso asignado y grilla horaria.
export default function StudentHomeScreen({ navigation }: PropiedadesPantallaInicioAlumno) {
  // Obtiene el usuario autenticado y la función para asignar su grupo escolar.
  const { user, setSchoolGroup } = useAuth();
  // Obtiene la paleta de colores del tema actual.
  const { colors } = useTheme();
  // Almacena los datos del tablero principal del alumno.
  const [data, setData] = useState<any>(null);
  // Almacena los mensajes de error y éxito de la pantalla.
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  // Controla el indicador de recarga manual de la vista.
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Almacena los cursos escolares abiertos y el estado del modal de selección de curso.
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [groupModalVisible, setGroupModalVisible] = useState<boolean>(false);
  const [selectedYear, setSelectedYear] = useState<number>(user?.schoolYear || 1);
  const [selectedDivision, setSelectedDivision] = useState<number>(user?.courseDivision || 1);
  const [groupAccessCode, setGroupAccessCode] = useState<string>('');
  const [modalError, setModalError] = useState<string>('');
  const [savingGroup, setSavingGroup] = useState<boolean>(false);

  // Calcula la lista ordenada de años escolares únicos abiertos en la institución.
  const availableYears = useMemo<number[]>(() => {
    if (!availableGroups || availableGroups.length === 0) return [];
    const years = Array.from(new Set(availableGroups.map((g: any) => Number(g.schoolYear))));
    return years.sort((a, b) => a - b);
  }, [availableGroups]);

  // Calcula las divisiones disponibles para el año escolar seleccionado.
  const availableDivisionsForYear = useMemo<number[]>(() => {
    if (!selectedYear || !availableGroups) return [];
    const divs = availableGroups
      .filter((g: any) => Number(g.schoolYear) === Number(selectedYear))
      .map((g: any) => Number(g.courseDivision));
    return Array.from(new Set(divs)).sort((a, b) => a - b);
  }, [availableGroups, selectedYear]);

  // Cambia el año seleccionado y ajusta automáticamente la división si es necesario.
  const handleSelectYear = (yr: number): void => {
    setSelectedYear(yr);
    const divsForYr = availableGroups
      .filter((g: any) => Number(g.schoolYear) === Number(yr))
      .map((g: any) => Number(g.courseDivision))
      .sort((a, b) => a - b);
    if (divsForYr.length > 0 && !divsForYr.includes(Number(selectedDivision))) {
      setSelectedDivision(divsForYr[0]);
    }
  };

  // Consulta al servidor los datos del panel del alumno y los grupos escolares abiertos.
  const load = useCallback(async () => {
    try {
      setError('');
      const res = await usersApi.studentDashboard();
      setData(res);
      const openGroups = res?.availableSchoolGroups || [];
      setAvailableGroups(openGroups);

      if (res?.schoolGroup?.schoolYear && res?.schoolGroup?.courseDivision) {
        setSelectedYear(res.schoolGroup.schoolYear);
        setSelectedDivision(res.schoolGroup.courseDivision);
      } else {
        if (openGroups.length > 0) {
          setSelectedYear(openGroups[0].schoolYear);
          setSelectedDivision(openGroups[0].courseDivision);
        }
        setGroupModalVisible(true);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Recarga la información cada vez que la pantalla gana foco.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Valida la contraseña del curso e inscribe al alumno en el año y división seleccionados.
  const handleConfirmSchoolGroup = async (): Promise<void> => {
    if (!groupAccessCode.trim()) {
      setModalError('Ingresá el código de acceso del curso provisto por la institución.');
      return;
    }
    try {
      setSavingGroup(true);
      setModalError('');
      setError('');
      setSuccess('');
      await setSchoolGroup(selectedYear, selectedDivision, groupAccessCode.trim().toUpperCase());
      setGroupModalVisible(false);
      setGroupAccessCode('');
      setSuccess(`¡Acceso concedido! Te asignaste a ${selectedYear}° Año - ${selectedDivision}° Curso. Se actualizaron tus materias y horarios.`);
      await load();
    } catch (e) {
      setModalError(getErrorMessage(e));
    } finally {
      setSavingGroup(false);
    }
  };

  // Muestra el indicador de carga mientras se obtienen los datos iniciales.
  if (!data && !error) return <Loading />;

  // Extrae los bloques de resumen, grupo escolar, materias y cronograma.
  const summary = data?.summary || {};
  const schoolGroup = data?.schoolGroup || {};
  const subjects = data?.subjects || data?.continueLearning || [];
  const schedule = data?.schedule || [];
  const currentSchoolYear = schoolGroup.schoolYear || user?.schoolYear || selectedYear || 1;
  const currentCourseDivision = schoolGroup.courseDivision || user?.courseDivision || selectedDivision || 1;

  // Renderiza la interfaz completa del panel del alumno.
  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View
          style={{
            backgroundColor: colors.navy,
            borderRadius: 18,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800' }}>
                  {user?.firstName?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase() || 'A'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.mode === 'light' ? colors.primary : '#93c5fd', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>
                  Campus Escolar • Alumno
                </Text>
                <Text style={{ color: colors.mode === 'light' ? colors.text : '#ffffff', fontSize: 19, fontWeight: '800' }} numberOfLines={1}>
                  ¡Hola, {user?.firstName || user?.name}!
                </Text>
                <Text style={{ color: colors.mode === 'light' ? colors.textSecondary : '#cbd5e1', fontSize: 13, marginTop: 2 }}>
                  {schoolGroup.label ? `Cursando: ${schoolGroup.label}` : 'Sin Año/Curso seleccionado'}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir notificaciones"
              onPress={() => navigation.navigate('StudentExtras', { section: 'notifications' })}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: colors.mode === 'light' ? colors.surfaceAlt : '#1e293b',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.mode === 'light' ? colors.text : '#ffffff'} />
              {summary.unreadNotifications > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    backgroundColor: colors.danger,
                    borderRadius: 10,
                    minWidth: 18,
                    height: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '800' }}>{summary.unreadNotifications}</Text>
                </View>
              )}
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable
              onPress={() =>
                navigation.navigate('CourseGroup', {
                  schoolYear: schoolGroup.schoolYear || user?.schoolYear || 6,
                  courseDivision: schoolGroup.courseDivision || user?.courseDivision || 1,
                })
              }
              style={{
                flex: 1,
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="grid-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>
                Ingresar al curso{' '}
                {formatSchoolGroupShort(
                  schoolGroup.schoolYear || user?.schoolYear || 6,
                  schoolGroup.courseDivision || user?.courseDivision || 1
                )}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setGroupModalVisible(true)}
              style={{
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Ionicons name="school-outline" size={16} color="#93c5fd" style={{ marginRight: 6 }} />
              <Text style={{ color: '#93c5fd', fontWeight: '800', fontSize: 12 }}>Cambiar Curso</Text>
            </Pressable>
          </View>
        </View>

        <ErrorBanner message={error} onRetry={load} />
        <SuccessBanner message={success} />

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
                Tu cuenta no está verificada. Completá la verificación en 2 pasos para proteger tu cuenta.
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

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' }}>
          <StatCard
            label="Materias inscriptas"
            value={subjects.length}
            icon="book-outline"
            color={colors.primary}
            onPress={() => navigation.navigate('MyLearning')}
          />
          <StatCard
            label="Bloques horarios"
            value={schedule.length}
            icon="time-outline"
            color={colors.secondary}
          />
          <StatCard
            label="Año y División"
            value={formatSchoolGroupShort(currentSchoolYear, currentCourseDivision)}
            icon="school-outline"
            color={colors.warning}
            onPress={() => setGroupModalVisible(true)}
          />
        </View>

        <View style={{ marginTop: 14 }}>
          <SectionHeader
            title={`Cuadrícula de Horarios de ${formatSchoolGroupShort(
              schoolGroup.schoolYear || currentSchoolYear,
              schoolGroup.courseDivision || currentCourseDivision
            )}`}
            subtitle="Lunes a Viernes • Turno Mañana (07:30-09:30, 09:40-11:40, Extra 11:50-12:50) y Turno Tarde (13:00-14:50, 15:10-17:10)"
          />
          <SchoolScheduleGrid
            schoolYear={schoolGroup.schoolYear || currentSchoolYear}
            courseDivision={schoolGroup.courseDivision || currentCourseDivision}
            schedule={schedule}
            editable={false}
            onPressOccupiedCell={(entry: any) =>
              navigation.navigate('CourseDetail', { courseId: entry.courseId })
            }
          />
          {schedule.length === 0 ? null : (
            DAYS_ORDER.map((day) => {
              const dayBlocks = schedule.filter((s: any) => s.dayOfWeek === day);
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
                    <Text style={{ color: colors.mode === 'light' ? colors.text : '#ffffff', fontWeight: '800', fontSize: 14 }}>{day}</Text>
                    <Text style={{ color: colors.mode === 'light' ? colors.primary : '#93c5fd', fontSize: 12, fontWeight: '700' }}>
                      {dayBlocks.length} {dayBlocks.length === 1 ? 'materia' : 'materias'}
                    </Text>
                  </View>

                  {dayBlocks.map((blk: any) => {
                    const hasTeacher =
                      blk.instructorId && blk.instructorName && blk.instructorName !== 'Sin profesor asignado';
                    return (
                      <Pressable
                        key={blk.id}
                        onPress={() => navigation.navigate('CourseDetail', { courseId: blk.courseId })}
                        style={{
                          backgroundColor: colors.card,
                          borderRadius: 14,
                          padding: 14,
                          marginBottom: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderLeftWidth: 4,
                          borderLeftColor: colors.primary,
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="time-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                            <Text style={{ fontWeight: '800', fontSize: 14, color: colors.primary }}>
                              {blk.startTime} a {blk.endTime} hs
                            </Text>
                          </View>
                        </View>

                        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 6 }}>
                          {blk.courseTitle}
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <Ionicons
                            name="easel-outline"
                            size={15}
                            color={hasTeacher ? colors.textSecondary : colors.warning}
                            style={{ marginRight: 6 }}
                          />
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: hasTeacher ? colors.textSecondary : colors.warning,
                            }}
                          >
                            Docente: {hasTeacher ? blk.instructorName : 'Sin docente asignado (Vacante)'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        visible={groupModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGroupModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.75)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, textAlign: 'center' }}>
              Elegí tu Año y Curso Escolar
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 16 }}>
              Seleccioná en qué año y en qué división te encontrás para aplicar tus materias y horarios:
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
              Año Escolar disponible:
            </Text>
            {availableYears.length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 16 }}>
                No hay cursos escolares abiertos actualmente en la institución.
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {availableYears.map((yr) => {
                  const active = Number(selectedYear) === yr;
                  return (
                    <Pressable
                      key={yr}
                      onPress={() => handleSelectYear(yr)}
                      style={{
                        flex: 1,
                        minWidth: 70,
                        paddingVertical: 10,
                        borderRadius: 10,
                        alignItems: 'center',
                        backgroundColor: active ? colors.primary : colors.surfaceAlt || colors.background,
                        borderWidth: 1.5,
                        borderColor: active ? colors.primary : colors.border,
                      }}
                    >
                      <Text style={{ fontWeight: '800', color: active ? '#ffffff' : colors.text }}>{yr}° Año</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {availableDivisionsForYear.length > 0 && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
                  Divisiones disponibles para {selectedYear}° Año:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  {availableDivisionsForYear.map((div) => {
                    const active = Number(selectedDivision) === div;
                    return (
                      <Pressable
                        key={div}
                        onPress={() => setSelectedDivision(div)}
                        style={{
                          flex: 1,
                          minWidth: 70,
                          paddingVertical: 12,
                          borderRadius: 10,
                          alignItems: 'center',
                          backgroundColor: active ? colors.primary : colors.surfaceAlt || colors.background,
                          borderWidth: 1.5,
                          borderColor: active ? colors.primary : colors.border,
                        }}
                      >
                        <Text style={{ fontWeight: '800', color: active ? '#ffffff' : colors.text }}>{div}° Curso</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <View style={{ marginBottom: 14 }}>
              <Input
                label="Contraseña del curso *"
                placeholder="EJ. 1RO8VA"
                value={groupAccessCode}
                onChangeText={(text: string) => {
                  setGroupAccessCode(String(text || '').toUpperCase());
                  setModalError('');
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                leftIcon="key-outline"
              />
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                🔒 Ingresá la contraseña provista por la institución para validar tu pertenencia a este curso.
              </Text>
            </View>

            {Boolean(modalError) && <ErrorBanner message={modalError} style={{ marginBottom: 12 }} />}

            <Button
              title={`Confirmar ${selectedYear}° Año - ${selectedDivision}° Curso`}
              icon="checkmark-circle-outline"
              loading={savingGroup}
              onPress={handleConfirmSchoolGroup}
            />
            {schoolGroup.label && (
              <Button
                title="Cancelar"
                variant="outline"
                onPress={() => setGroupModalVisible(false)}
                style={{ marginBottom: 0 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
