/**
 * Archivo: mobile/src/screens/student/CourseDetailScreen.js
 * Descripción: Pantalla de Detalle de Curso (Sección 7.8).
 * Muestra portada, descripción completa, objetivos, habilidades, requisitos previos,
 * perfil del instructor, módulos y lecciones, actividades, anuncios, favoritos e inscripción.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Badge,
  Button,
  ConfirmModal,
  ErrorBanner,
  Loading,
  ProgressBar,
  Screen,
  SectionHeader,
  SuccessBanner,
} from '../../components/ui';
import { coursesApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LEVEL_LABELS } from '../../theme';
import { formatDate } from '../../utils/dates';
import { getErrorMessage } from '../../utils/errors';
import { formatSchoolGroupShort } from '../../components/SchoolScheduleGrid';
import TablonFeed from '../../components/TablonFeed';
import { COURSE_THEME_PALETTES, buildCoursePaletteFromHex } from '../instructor/InstructorCoursesScreen';

export default function CourseDetailScreen({ navigation, route }) {
  const { courseId } = route.params;
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [course, setCourse] = useState(null);
  const [mainTab, setMainTab] = useState('tablon'); // 'tablon' | 'trabajo' | 'personas'
  const [showCourseGrid, setShowCourseGrid] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmUnenroll, setConfirmUnenroll] = useState(false);

  const coursePalette = useMemo(() => {
    if (!course) return COURSE_THEME_PALETTES[0];
    if (course.themeColor) {
      return buildCoursePaletteFromHex(course.themeColor);
    }
    const idx = Math.abs(Number(course.id) || 0) % COURSE_THEME_PALETTES.length;
    return COURSE_THEME_PALETTES[idx];
  }, [course]);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await coursesApi.get(courseId);
      setCourse(res);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [courseId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!course && !error) return <Loading />;

  const handleEnroll = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await coursesApi.enroll(courseId);
      setSuccess('¡Te inscribiste en el curso! Ya podés comenzar la primera lección.');
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUnenroll = async () => {
    setConfirmUnenroll(false);
    setBusy(true);
    try {
      await coursesApi.unenroll(courseId);
      setSuccess('Se canceló tu inscripción al curso.');
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async () => {
    try {
      if (course.isFavorite) {
        await coursesApi.removeFavorite(course.id);
        setCourse((c) => ({ ...c, isFavorite: false }));
      } else {
        await coursesApi.addFavorite(course.id);
        setCourse((c) => ({ ...c, isFavorite: true }));
      }
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const levelInfo = LEVEL_LABELS[course?.level] || LEVEL_LABELS.beginner;
  const enrollment = course?.enrollment;
  const firstLesson = course?.modules?.[0]?.lessons?.[0];

  return (
    <Screen>
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={success} />

      {course && (
        <>
          {/* Recuadro de la materia: COLOR COMPLETAMENTE LLENO Y SÓLIDO (Sin transparencias, Estilo Banner Google Classroom) */}
          <View
            style={{
              backgroundColor: coursePalette.solidBg, // Color 100% lleno y opaco
              borderColor: coursePalette.borderColor,
              borderRadius: 18,
              padding: 18,
              borderWidth: 1.5,
              marginBottom: 14,
              overflow: 'hidden',
              shadowColor: coursePalette.solidBg,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            {/* Capas decorativas de birretes flotantes simuladas (Estilo Google Classroom) */}
            <View style={{ position: 'absolute', right: 28, top: -15, transform: [{ rotate: '-18deg' }], pointerEvents: 'none' }}>
              <Ionicons name="school" size={130} color="rgba(255, 255, 255, 0.16)" />
            </View>
            <View style={{ position: 'absolute', right: 175, top: 25, transform: [{ rotate: '22deg' }], pointerEvents: 'none' }}>
              <Ionicons name="school" size={78} color="rgba(255, 255, 255, 0.12)" />
            </View>
            <View style={{ position: 'absolute', right: 95, bottom: 22, pointerEvents: 'none' }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fbbf24' }} />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View
                style={{
                  backgroundColor: coursePalette.badgeBg,
                  borderColor: coursePalette.badgeBorder,
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>
                  {formatSchoolGroupShort(course.schoolYear || 6, course.courseDivision || 1)}
                </Text>
              </View>

              <View
                style={{
                  backgroundColor: coursePalette.badgeBg,
                  borderColor: coursePalette.badgeBorder,
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                  👥 {course.studentsCount || 0} alumnos
                </Text>
              </View>
            </View>

            <Text
              style={{
                fontSize: 22,
                fontWeight: '800',
                color: '#ffffff',
                marginTop: 10,
                letterSpacing: 0.2,
              }}
            >
              {course.title}
            </Text>

            {!!course.description && (
              <Text
                style={{
                  fontSize: 13,
                  color: coursePalette.descColor,
                  marginTop: 4,
                  lineHeight: 19,
                  fontWeight: '500',
                }}
              >
                {course.description}
              </Text>
            )}

            {!!course.instructorName && (
              <View style={{ marginTop: 8 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: '#ffffff',
                    fontWeight: '700',
                  }}
                >
                  👨‍🏫 Docente a cargo: {course.instructorName}
                </Text>
              </View>
            )}
          </View>

          {/* BARRA SUPERIOR DE PESTAÑAS (BOTONES DEBAJO DE LA MATERIA) */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 16,
              overflow: 'hidden',
            }}
          >
            {[
              { id: 'tablon', label: 'Tablón', icon: 'chatbubbles-outline' },
              { id: 'trabajo', label: 'Material Teórico', icon: 'book-outline' },
              { id: 'personas', label: 'Personas', icon: 'people-outline' },
            ].map((t) => {
              const active = mainTab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setMainTab(t.id)}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 12,
                    borderBottomWidth: 3,
                    borderBottomColor: active ? colors.primary : 'transparent',
                    backgroundColor: active ? `${colors.primary}12` : 'transparent',
                  }}
                >
                  <Ionicons
                    name={t.icon}
                    size={16}
                    color={active ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: active ? '700' : '600',
                      color: active ? colors.primary : colors.textSecondary,
                    }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ================================================================ */}
          {/* PESTAÑA 1: TABLÓN (ESTÉTICA 100% GOOGLE CLASSROOM)               */}
          {/* ================================================================ */}
          {mainTab === 'tablon' && (
            <View>
              {/* Banner suave de inscripción si todavía no se inscribió */}
              {!enrollment && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.card,
                    padding: 12,
                    borderRadius: 14,
                    marginBottom: 14,
                    borderWidth: 1,
                    borderColor: colors.primary,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                      ¿Aún no te inscribiste en esta materia?
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                      Inscribite para acceder a todo el material teórico y avisos de la materia.
                    </Text>
                  </View>
                  <Button
                    title="Inscribirme"
                    icon="school-outline"
                    small
                    onPress={handleEnroll}
                    loading={busy}
                    style={{ marginBottom: 0 }}
                  />
                </View>
              )}

              {/* Feed unificado del Tablón */}
              <TablonFeed
                course={course}
                isInstructor={user?.role === 'instructor' || user?.role === 'admin'}
                user={user}
                onRefreshCourse={load}
                hideHeroBanner={true}
              />
            </View>
          )}

          {/* ================================================================ */}
          {/* PESTAÑA 2: TRABAJO DE CLASE (PROGRAMA Y ACTIVIDADES)              */}
          {/* ================================================================ */}
          {mainTab === 'trabajo' && (
            <View>
              {/* Progreso del estudiante */}
              {enrollment && (
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {firstLesson && (
                    <Button
                      title="Ver material y lecciones"
                      icon="play-circle-outline"
                      onPress={() =>
                        navigation.navigate('LessonViewer', {
                          lessonId: firstLesson.id,
                          courseId: course.id,
                        })
                      }
                      style={{ marginTop: 0 }}
                    />
                  )}
                </View>
              )}

              {/* Programa de Módulos y Lecciones */}
              <SectionHeader
                title="Programa del curso"
                subtitle={`${course.modules?.length || 0} módulo(s) estructurados`}
              />
              {course.modules?.map((mod) => (
                <View
                  key={mod.id}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                    {mod.title}
                  </Text>
                  {!!mod.description && (
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      {mod.description}
                    </Text>
                  )}

                  <View style={{ marginTop: 10 }}>
                    {mod.lessons?.map((les) => (
                      <Pressable
                        key={les.id}
                        onPress={() => {
                          if (!enrollment && user?.role === 'student') {
                            setError('Inscribite en el curso para acceder al visor de lecciones.');
                            return;
                          }
                          navigation.navigate('LessonViewer', {
                            lessonId: les.id,
                            courseId: course.id,
                          });
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 10,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        <Ionicons
                          name={les.completed ? 'checkmark-circle' : 'play-circle-outline'}
                          size={20}
                          color={les.completed ? colors.success : colors.primary}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
                            {les.title}
                          </Text>
                          <Text style={{ color: colors.muted, fontSize: 12 }}>
                            {les.estimatedDuration} min • {les.isRequired ? 'Obligatoria' : 'Opcional'}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ================================================================ */}
          {/* PESTAÑA 3: PERSONAS E INFORMACIÓN ACADÉMICA                       */}
          {/* ================================================================ */}
          {mainTab === 'personas' && (
            <View>
              {/* Tarjeta de Instructor */}
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 14,
                }}
              >
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '800' }}>
                  DOCENTE A CARGO
                </Text>
                <Text
                  style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4 }}
                >
                  {course.instructorName}
                </Text>
                {!!course.instructorBio && (
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.textSecondary,
                      marginTop: 4,
                      lineHeight: 19,
                    }}
                  >
                    {course.instructorBio}
                  </Text>
                )}
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
                  👥 {course.studentsCount || 0} estudiante(s) inscritos • Curso:{' '}
                  {formatSchoolGroupShort(course.schoolYear || 6, course.courseDivision || 1)}
                </Text>
              </View>

              {/* Detalles y objetivos */}
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 14,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
                  Acerca de la materia
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.textSecondary,
                    marginTop: 6,
                    lineHeight: 20,
                  }}
                >
                  {course.description || course.shortDescription || 'Sin descripción detallada.'}
                </Text>

                {/* Habilidades */}
                {course.skills?.length > 0 && (
                  <View style={{ marginTop: 14 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: colors.muted,
                        marginBottom: 6,
                      }}
                    >
                      HABILIDADES QUE DESARROLLARÁS
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {course.skills.map((sk) => (
                        <Badge key={sk.id} text={sk.name} color={colors.primary} />
                      ))}
                    </View>
                  </View>
                )}

                {/* Objetivos */}
                {course.objectives?.length > 0 && (
                  <View style={{ marginTop: 14 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: colors.muted,
                        marginBottom: 6,
                      }}
                    >
                      OBJETIVOS DE APRENDIZAJE
                    </Text>
                    {course.objectives.map((obj, idx) => (
                      <View
                        key={idx}
                        style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={colors.success}
                          style={{ marginTop: 2, marginRight: 6 }}
                        />
                        <Text
                          style={{ color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 }}
                        >
                          {obj}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Botón de baja */}
              {enrollment && (
                <Pressable
                  onPress={() => setConfirmUnenroll(true)}
                  style={{
                    alignItems: 'center',
                    paddingVertical: 12,
                    backgroundColor: `${colors.danger}15`,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: `${colors.danger}30`,
                  }}
                >
                  <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>
                    Dar de baja mi inscripción en este curso
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </>
      )}

      <ConfirmModal
        visible={confirmUnenroll}
        title="Cancelar inscripción"
        message="¿Estás seguro de que querés darte de baja de este curso? Se perderá el registro de avance de esta inscripción."
        confirmText="Dar de baja"
        danger
        onConfirm={handleUnenroll}
        onCancel={() => setConfirmUnenroll(false)}
      />
    </Screen>
  );
}
