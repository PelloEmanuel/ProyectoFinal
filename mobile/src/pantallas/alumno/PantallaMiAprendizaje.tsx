// Importa los hooks de React para estado y callbacks.
import React, { useCallback, useState } from 'react';
// Importa los componentes visuales y de dimensiones de React Native.
import { Platform, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
// Importa el hook de foco de navegación.
import { useFocusEffect } from '@react-navigation/native';
// Importa la librería de íconos Ionicons.
import { Ionicons } from '@expo/vector-icons';
// Importa los componentes reutilizables de la interfaz.
import { Empty, ErrorBanner, Input, Loading, Screen } from '../../componentes/interfaz';
// Importa el servicio de API de usuarios.
import { usersApi } from '../../api/servicios';
// Importa el contexto de autenticación.
import { useAuth } from '../../contexto/ContextoAcceso';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa la utilidad para extraer mensajes de error.
import { getErrorMessage } from '../../utilidades/errores';
// Importa el formateador de grupos escolares.
import { formatSchoolGroupShort } from '../../componentes/GrillaHorarios';
// Importa el gancho de sincronización automática en tiempo real.
import usarTiempoReal from '../../ganchos/usarTiempoReal';
// Importa las paletas de colores de materias y el constructor hexadecimal.
import {
  COURSE_THEME_PALETTES,
  buildCoursePaletteFromHex,
} from '../docente/PantallaCursosDocente';

// Define las propiedades recibidas por la pantalla de mis materias.
interface PropiedadesPantallaMiAprendizaje {
  navigation: any;
}

// Renderiza el listado de materias en las que está inscripto el alumno con su diseño personalizado.
export default function MyLearningScreen({ navigation }: PropiedadesPantallaMiAprendizaje) {
  // Obtiene el usuario autenticado.
  const { user } = useAuth();
  // Obtiene la paleta de colores activa.
  const { colors } = useTheme();
  // Obtiene el ancho de la ventana para adaptar el diseño en escritorio o móvil.
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 768;
  // Estados para inscripciones, búsqueda y carga.
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [q, setQ] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Consulta al servidor las materias asignadas e inscriptas del alumno.
  const load = useCallback(async () => {
    try {
      setError('');
      const enr = await usersApi.myEnrollments();
      setEnrollments(enr || []);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recarga las materias cuando la pantalla obtiene foco.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Actualiza automáticamente la lista y colores de materias cuando un docente o administrador realiza cambios en otro dispositivo.
  usarTiempoReal(() => {
    load();
  });

  // Muestra el indicador de carga mientras se obtienen las inscripciones.
  if (loading) return <Loading />;

  // Filtra las materias según el texto ingresado en el buscador.
  const filteredSubjects = enrollments.filter((item) =>
    !q.trim() ? true : item.title?.toLowerCase().includes(q.trim().toLowerCase())
  );

  // Renderiza la vista de materias del alumno.
  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View
          style={{
            backgroundColor: colors.navy,
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: colors.mode === 'light' ? colors.primary : '#93c5fd',
              fontSize: 11,
              fontWeight: '800',
              textTransform: 'uppercase',
            }}
          >
            Curso actual del alumno
          </Text>
          <Text
            style={{
              color: colors.mode === 'light' ? colors.text : '#ffffff',
              fontSize: 17,
              fontWeight: '800',
              marginTop: 4,
            }}
          >
            {user?.schoolYear && user?.courseDivision
              ? `${formatSchoolGroupShort(user.schoolYear, user.courseDivision)} (${user.schoolYear}° Año - ${user.courseDivision}° Curso)`
              : 'Sin curso seleccionado'}
          </Text>
          <Text style={{ color: '#cbd5e1', fontSize: 13, marginTop: 4 }}>
            Materias asignadas a tu curso. Cada materia se muestra con el color elegido por el docente.
          </Text>
        </View>

        <ErrorBanner message={error} onRetry={load} />

        <Input
          value={q}
          onChangeText={setQ}
          placeholder="Buscar materia por nombre..."
        />

        {filteredSubjects.length === 0 ? (
          <Empty
            icon="library-outline"
            title="No hay materias asignadas"
            text="Las materias asignadas a tu curso aparecerán automáticamente aquí."
          />
        ) : (
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: isDesktop ? 'wrap' : 'nowrap', gap: 14 }}>
            {filteredSubjects.map((item) => {
              const hasTeacher =
                item.instructorId &&
                item.instructorName &&
                item.instructorName !== 'Sin profesor asignado';

              const palette = item.themeColor
                ? buildCoursePaletteFromHex(item.themeColor)
                : COURSE_THEME_PALETTES[
                    Math.abs(Number(item.courseId || item.id || 0)) %
                      COURSE_THEME_PALETTES.length
                  ];

              return (
                <View
                  key={item.courseId}
                  style={{
                    width: (isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%') as any,
                    maxWidth: (isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%') as any,
                    flexGrow: isDesktop ? 0 : 1,
                    flexShrink: 0,
                    marginBottom: isDesktop ? 0 : 4,
                  }}
                >
                  <Pressable
                    onPress={() =>
                      navigation.navigate('CourseDetail', { courseId: item.courseId })
                    }
                    style={{
                      backgroundColor: palette.solidBg,
                      borderRadius: 18,
                      padding: 18,
                      borderWidth: 1.5,
                      borderColor: palette.borderColor,
                      overflow: 'hidden',
                      shadowColor: palette.solidBg,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.28,
                      shadowRadius: 8,
                      elevation: 4,
                      height: isDesktop ? '100%' : undefined,
                      justifyContent: 'space-between',
                    }}
                  >
                    <View
                      style={{
                        position: 'absolute',
                        right: 14,
                        top: -10,
                        transform: [{ rotate: '-18deg' }],
                        pointerEvents: 'none',
                      }}
                    >
                      <Ionicons
                        name="school"
                        size={90}
                        color="rgba(255, 255, 255, 0.16)"
                      />
                    </View>

                    <View>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: palette.badgeBg,
                            borderColor: palette.badgeBorder,
                            borderWidth: 1,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 10,
                          }}
                        >
                          <Text
                            style={{
                              color: '#ffffff',
                              fontWeight: '800',
                              fontSize: 12,
                            }}
                          >
                            {item.categoryName || 'Materia'}
                          </Text>
                        </View>
                        <View
                          style={{
                            backgroundColor: palette.badgeBg,
                            borderColor: palette.badgeBorder,
                            borderWidth: 1,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 10,
                          }}
                        >
                          <Text
                            style={{
                              color: '#ffffff',
                              fontWeight: '800',
                              fontSize: 12,
                            }}
                          >
                            {formatSchoolGroupShort(
                              item.schoolYear || user?.schoolYear || 6,
                              item.courseDivision || user?.courseDivision || 1
                            )}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={{
                          fontSize: 19,
                          fontWeight: '900',
                          color: '#ffffff',
                          marginTop: 10,
                        }}
                      >
                        {item.title}
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginTop: 6,
                        }}
                      >
                        <Ionicons
                          name="person-circle-outline"
                          size={18}
                          color="#ffffff"
                          style={{ marginRight: 6, opacity: 0.9 }}
                        />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            color: '#f8fafc',
                          }}
                        >
                          Profesor/a:{' '}
                          {hasTeacher
                            ? item.instructorName
                            : 'Sin profesor asignado (Vacante)'}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        marginTop: 14,
                        paddingTop: 10,
                        borderTopWidth: 1,
                        borderTopColor: 'rgba(255, 255, 255, 0.2)',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '800',
                          color: '#ffffff',
                        }}
                      >
                        Entrar al tablón de la materia →
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
