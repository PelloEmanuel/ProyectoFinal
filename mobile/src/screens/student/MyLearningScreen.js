/**
 * Archivo: mobile/src/screens/student/MyLearningScreen.js
 * Descripción: Pantalla "Mis Materias" del Alumno en el Campus Escolar.
 * Muestra las materias en las que el alumno está inscripto con el color
 * personalizado que el profesor configuró para cada materia.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Empty, ErrorBanner, Input, Loading, Screen } from '../../components/ui';
import { usersApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getErrorMessage } from '../../utils/errors';
import { formatSchoolGroupShort } from '../../components/SchoolScheduleGrid';
import {
  COURSE_THEME_PALETTES,
  buildCoursePaletteFromHex,
} from '../instructor/InstructorCoursesScreen';

export default function MyLearningScreen({ navigation }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [enrollments, setEnrollments] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <Loading />;

  const filteredSubjects = enrollments.filter((item) =>
    !q.trim() ? true : item.title?.toLowerCase().includes(q.trim().toLowerCase())
  );

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
          filteredSubjects.map((item) => {
            const hasTeacher =
              item.instructorId &&
              item.instructorName &&
              item.instructorName !== 'Sin profesor asignado';

            // Obtener paleta de color elegida por el profesor para esta materia
            const palette = item.themeColor
              ? buildCoursePaletteFromHex(item.themeColor)
              : COURSE_THEME_PALETTES[
                  Math.abs(Number(item.courseId || item.id || 0)) %
                    COURSE_THEME_PALETTES.length
                ];

            return (
              <Pressable
                key={item.courseId}
                onPress={() =>
                  navigation.navigate('CourseDetail', { courseId: item.courseId })
                }
                style={{
                  backgroundColor: palette.solidBg,
                  borderRadius: 18,
                  padding: 18,
                  marginBottom: 14,
                  borderWidth: 1.5,
                  borderColor: palette.borderColor,
                  overflow: 'hidden',
                  shadowColor: palette.solidBg,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.28,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                {/* Birrete decorativo marca de agua */}
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

                {/* Encabezado con insignias */}
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

                {/* Título de la materia */}
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

                {/* Docente a cargo */}
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

                {/* Pie de tarjeta con llamado a la acción */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    marginTop: 12,
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
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
