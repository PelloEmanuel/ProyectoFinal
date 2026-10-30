import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { attendanceApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  SectionHeader,
} from '../../components/ui';

export default function PreceptorDashboardScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const [openCourses, setOpenCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Modal para ver nómina de alumnos de un curso
  const [studentsModalVisible, setStudentsModalVisible] = useState(false);
  const [selectedCourseForStudents, setSelectedCourseForStudents] = useState(null);
  const [courseStudents, setCourseStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      const res = await attendanceApi.getOpenCourses();
      const groups = Array.isArray(res) ? res : res?.data || [];
      setOpenCourses(groups);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [loadData])
  );

  const handleOpenStudentsModal = async (course) => {
    try {
      setSelectedCourseForStudents(course);
      setStudentsModalVisible(true);
      setLoadingStudents(true);
      const res = await attendanceApi.getStudents({
        schoolYear: course.schoolYear,
        courseDivision: course.courseDivision,
      });
      const students = Array.isArray(res) ? res : res?.data || [];
      setCourseStudents(students);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingStudents(false);
    }
  };

  const totalStudents = openCourses.reduce((acc, c) => acc + (Number(c.studentsCount) || 0), 0);

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
      {/* Banner de Bienvenida del Preceptor */}
      <Card style={{ marginBottom: 14 }}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Badge label="Preceptoría Escolar" tone="primary" />
              <Badge label="Gestión de Asistencia" tone="info" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.text }}>
              ¡Hola, {user?.name || 'Preceptor'}!
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
              Panel de control de cursos abiertos, seguimiento de nóminas y registro diario de asistencia.
            </Text>
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="clipboard-outline" size={24} color={colors.primary} />
          </View>
        </View>
      </Card>

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
              Tu cuenta de preceptoría no está verificada. Completá la verificación en 2 pasos para proteger tu cuenta.
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

      {/* Métricas Rápidas */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <Card style={{ flex: 1, padding: 12, alignItems: 'center' }}>
          <Ionicons name="school-outline" size={20} color={colors.primary} />
          <Text style={{ fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 4 }}>
            {openCourses.length}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center' }}>
            Cursos Abiertos
          </Text>
        </Card>

        <Card style={{ flex: 1, padding: 12, alignItems: 'center' }}>
          <Ionicons name="people-outline" size={20} color={colors.success} />
          <Text style={{ fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 4 }}>
            {totalStudents}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center' }}>
            Alumnos Totales
          </Text>
        </Card>

        <Card style={{ flex: 1, padding: 12, alignItems: 'center' }}>
          <Ionicons name="calendar-outline" size={20} color={colors.warning} />
          <Text style={{ fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 4 }}>
            Lun - Vie
          </Text>
          <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center' }}>
            Planilla Mensual
          </Text>
        </Card>
      </View>

      {/* Listado de Cursos Abiertos */}
      <SectionHeader
        title={`Cursos Escolares Abiertos (${openCourses.length})`}
        subtitle="Seleccioná un curso para tomar asistencia o consultar la lista alfabética de sus alumnos"
      />

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
      ) : openCourses.length === 0 ? (
        <EmptyState
          icon="lock-closed-outline"
          title="No hay cursos abiertos actualmente"
          message="Los administradores deben abrir cursos escolares para que puedas tomar asistencia."
        />
      ) : (
        openCourses.map((grp) => (
          <Card key={grp.id} style={{ marginBottom: 12 }}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="school" size={20} color="#10b981" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: colors.text }}>
                    {grp.fullLabel}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {grp.studentsCount} {Number(grp.studentsCount) === 1 ? 'alumno inscripto' : 'alumnos inscriptos'}
                  </Text>
                </View>
              </View>

              <Badge label="Curso Abierto" tone="success" />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Button
                title="Confirmar Asistencia"
                icon="checkmark-circle-outline"
                variant="primary"
                small
                style={{ flex: 1, marginBottom: 0 }}
                onPress={() => {
                  navigation.navigate('PreceptorAttendance', {
                    schoolYear: grp.schoolYear,
                    courseDivision: grp.courseDivision,
                  });
                }}
              />
              <Button
                title="Ver Alumnos"
                icon="people-outline"
                variant="outline"
                small
                style={{ marginBottom: 0 }}
                onPress={() => handleOpenStudentsModal(grp)}
              />
            </View>
          </Card>
        ))
      )}

      {/* Modal Nómina de Alumnos de un Curso */}
      <Modal visible={studentsModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Alumnos de {selectedCourseForStudents?.fullLabel}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  Nómina oficial ordenada alfabéticamente (A-Z)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStudentsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loadingStudents ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
            ) : courseStudents.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Ionicons name="person-outline" size={36} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>
                  No hay alumnos inscriptos en este curso todavía.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 400, marginTop: 12 }}>
                {courseStudents.map((s, idx) => (
                  <View
                    key={s.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontWeight: '800', color: colors.primary, width: 22 }}>
                        {idx + 1}.
                      </Text>
                      <View>
                        <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14 }}>
                          {s.fullName}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                          {s.email}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <Button
              title="Cerrar Nómina"
              variant="secondary"
              onPress={() => setStudentsModalVisible(false)}
              style={{ marginTop: 14, marginBottom: 0 }}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 18,
    padding: 18,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
});
