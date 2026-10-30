/**
 * Archivo: mobile/src/screens/student/StudentHomeScreen.js
 * Descripción: Pantalla principal del Alumno en el Campus Escolar SkillTrack.
 * - Permite elegir/cambiar en qué Año (1° a 6°) y en qué Curso (1° a 3°) se encuentra.
 * - Una vez elegido, aplica y muestra todas las materias a las que está inscripto en ese curso.
 * - Incluye la vista del Cronograma de Materias con sus horarios (ej. 07:30 a 09:30) y qué profesor dicta cada materia.
 * - Muestra las actividades, evaluaciones y calificaciones devueltas por los profesores.
 */
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Empty, ErrorBanner, Input, Loading, Screen, SectionHeader, StatCard, SuccessBanner } from '../../components/ui';
import { usersApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatDate } from '../../utils/dates';
import { getErrorMessage } from '../../utils/errors';
import SchoolScheduleGrid, { formatSchoolGroupShort } from '../../components/SchoolScheduleGrid';

const DAYS_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function StudentHomeScreen({ navigation }) {
  const { user, setSchoolGroup } = useAuth();
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Selector de Año (1° a 6°) y Curso (1° a 3°) + Código de acceso
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [selectedYear, setSelectedYear] = useState(user?.schoolYear || 1);
  const [selectedDivision, setSelectedDivision] = useState(user?.courseDivision || 1);
  const [groupAccessCode, setGroupAccessCode] = useState('');
  const [modalError, setModalError] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await usersApi.studentDashboard();
      setData(res);
      if (res?.schoolGroup?.schoolYear && res?.schoolGroup?.courseDivision) {
        setSelectedYear(res.schoolGroup.schoolYear);
        setSelectedDivision(res.schoolGroup.courseDivision);
      } else {
        setGroupModalVisible(true);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleConfirmSchoolGroup = async () => {
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

  if (!data && !error) return <Loading />;

  const summary = data?.summary || {};
  const schoolGroup = data?.schoolGroup || {};
  const subjects = data?.subjects || data?.continueLearning || [];
  const schedule = data?.schedule || [];
  const upcomingActivities = data?.upcomingActivities || [];
  const currentSchoolYear = schoolGroup.schoolYear || user?.schoolYear || selectedYear || 1;
  const currentCourseDivision = schoolGroup.courseDivision || user?.courseDivision || selectedDivision || 1;

  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Encabezado Campus Escolar con Año y Curso actual */}
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

        {/* Resumen rápido */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
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

        {/* CRONOGRAMA DE HORARIOS Y PROFESORES DEL CURSO (SIEMPRE VISIBLE) */}
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
            onPressOccupiedCell={(entry) =>
              navigation.navigate('CourseDetail', { courseId: entry.courseId })
            }
          />
          {schedule.length === 0 ? null : (
            DAYS_ORDER.map((day) => {
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
                    <Text style={{ color: colors.mode === 'light' ? colors.text : '#ffffff', fontWeight: '800', fontSize: 14 }}>{day}</Text>
                    <Text style={{ color: colors.mode === 'light' ? colors.primary : '#93c5fd', fontSize: 12, fontWeight: '700' }}>
                      {dayBlocks.length} {dayBlocks.length === 1 ? 'materia' : 'materias'}
                    </Text>
                  </View>

                  {dayBlocks.map((blk) => {
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
                            Profesor/a: {hasTeacher ? blk.instructorName : 'Sin profesor asignado (Vacante)'}
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

      {/* Modal para elegir Año (1° a 6°) y Curso (1° a 3°) */}
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
              Seleccioná en qué año (1° a 6°) y en qué curso (1° a 3°) te encontrás para aplicar tus materias y horarios:
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
              Año Escolar (1° a 6°):
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5, 6].map((yr) => {
                const active = selectedYear === yr;
                return (
                  <Pressable
                    key={yr}
                    onPress={() => setSelectedYear(yr)}
                    style={{
                      flex: 1,
                      minWidth: 44,
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

            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
              Curso / División (1° a 3°):
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {[1, 2, 3].map((div) => {
                const active = selectedDivision === div;
                return (
                  <Pressable
                    key={div}
                    onPress={() => setSelectedDivision(div)}
                    style={{
                      flex: 1,
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

            {/* Contraseña obligatoria del curso */}
            <View style={{ marginBottom: 14 }}>
              <Input
                label="Contraseña del curso *"
                placeholder="contraseña"
                value={groupAccessCode}
                onChangeText={(text) => {
                  setGroupAccessCode(text);
                  setModalError('');
                }}
                autoCapitalize="none"
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
