// Importa los hooks de React para estado, memorización y callbacks.
import React, { useCallback, useMemo, useState } from 'react';
// Importa los componentes visuales nativos de React Native.
import { Pressable, Text, View } from 'react-native';
// Importa el hook de foco de navegación.
import { useFocusEffect } from '@react-navigation/native';
// Importa la librería de íconos Ionicons.
import { Ionicons } from '@expo/vector-icons';
// Importa los componentes reutilizables de la interfaz.
import {
  Badge,
  Button,
  ConfirmModal,
  ErrorBanner,
  Loading,
  Screen,
  SuccessBanner,
} from '../../componentes/interfaz';
// Importa el servicio de API de cursos.
import { coursesApi } from '../../api/servicios';
// Importa el contexto de autenticación.
import { useAuth } from '../../contexto/ContextoAcceso';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa la utilidad para extraer mensajes de error.
import { getErrorMessage } from '../../utilidades/errores';
// Importa el formateador abreviado de grupos escolares.
import { formatSchoolGroupShort } from '../../componentes/GrillaHorarios';
// Importa el componente de muro y tablón de la materia.
import TablonFeed from '../../componentes/MuroTablon';
// Importa las paletas cromáticas y constructor de colores de materias.
import { COURSE_THEME_PALETTES, buildCoursePaletteFromHex } from '../docente/PantallaCursosDocente';

// Define las propiedades recibidas por la pantalla de detalle de curso.
interface PropiedadesPantallaDetalleCurso {
  navigation: any;
  route: any;
}

// Renderiza la pantalla de detalle de una materia con su portada, tablón e información académica.
export default function CourseDetailScreen({ navigation, route }: PropiedadesPantallaDetalleCurso) {
  // Extrae el identificador de la materia desde los parámetros de la ruta.
  const { courseId } = route.params;
  // Obtiene el usuario autenticado.
  const { user } = useAuth();
  // Obtiene la paleta de colores del tema actual.
  const { colors } = useTheme();

  // Estados para la información del curso, pestaña activa y banderas de operación.
  const [course, setCourse] = useState<any>(null);
  const [mainTab, setMainTab] = useState<string>('tablon');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [confirmUnenroll, setConfirmUnenroll] = useState<boolean>(false);

  // Calcula la paleta visual de la materia a partir de su color personalizado o su identificador.
  const coursePalette = useMemo(() => {
    if (!course) return COURSE_THEME_PALETTES[0];
    if (course.themeColor) {
      return buildCoursePaletteFromHex(course.themeColor);
    }
    const idx = Math.abs(Number(course.id) || 0) % COURSE_THEME_PALETTES.length;
    return COURSE_THEME_PALETTES[idx];
  }, [course]);

  // Carga los datos completos de la materia desde el servidor.
  const load = useCallback(async () => {
    try {
      setError('');
      const res = await coursesApi.get(courseId);
      setCourse(res);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [courseId]);

  // Recarga la materia cuando la pantalla obtiene foco.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Muestra el indicador de carga mientras se obtiene la materia.
  if (!course && !error) return <Loading />;

  // Inscribe al alumno actual en la materia.
  const handleEnroll = async (): Promise<void> => {
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

  // Cancela la inscripción del alumno en la materia.
  const handleUnenroll = async (): Promise<void> => {
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

  // Obtiene la información de inscripción del usuario en la materia.
  const enrollment = course?.enrollment;

  // Renderiza la pantalla completa de detalle de la materia.
  return (
    <Screen>
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={success} />

      {course && (
        <>
          <View
            style={{
              backgroundColor: coursePalette.solidBg,
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
                    name={t.icon as any}
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

          {mainTab === 'tablon' && (
            <View>
              {!enrollment && (user?.role === 'student' || !user) && (
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

              <TablonFeed
                course={course}
                isInstructor={user?.role === 'instructor' || user?.role === 'admin'}
                user={user}
                onRefreshCourse={load}
                hideHeroBanner={true}
              />
            </View>
          )}

          {mainTab === 'personas' && (
            <View>
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
                      {course.skills.map((sk: any) => (
                        <Badge key={sk.id} text={sk.name} color={colors.primary} />
                      ))}
                    </View>
                  </View>
                )}

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
                    {course.objectives.map((obj: string, idx: number) => (
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
