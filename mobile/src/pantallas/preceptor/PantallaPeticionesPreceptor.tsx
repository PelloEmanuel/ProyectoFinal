// Importa React, componentes nativos, navegación, contextos y servicios de preceptoría.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
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
import { useTheme } from '../../contexto/ContextoTema';
import { attendanceApi } from '../../api/servicios';
import { extractErrorMessage } from '../../utilidades/errores';
import { formatDateAR } from '../../utilidades/fechas';
import usarTiempoReal from '../../ganchos/usarTiempoReal';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  EmptyState,
  SectionHeader,
} from '../../componentes/interfaz';

// Renderiza el panel exclusivo del Preceptor para autorizar o rechazar peticiones de ingreso o cambio de curso filtradas por curso.
export default function PreceptorRequestsScreen({ route, navigation }: { route?: any; navigation?: any }) {
  const { colors, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 768;

  const [requests, setRequests] = useState<any[]>([]);
  const [openCourses, setOpenCourses] = useState<any[]>([]);
  const [totalPending, setTotalPending] = useState<number>(0);

  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Aplica un filtro de curso inicial si fue enviado por parámetros de navegación.
  useEffect(() => {
    if (route?.params?.filterGroupKey) {
      setSelectedGroupFilter(String(route.params.filterGroupKey));
      if (navigation?.setParams) {
        navigation.setParams({ filterGroupKey: undefined });
      }
    }
  }, [route?.params?.filterGroupKey, navigation]);

  // Consulta al servidor todas las peticiones de ingreso y cambio de curso junto con los cursos abiertos.
  const loadRequests = useCallback(
    async (isRefresh = false, silent = false) => {
      try {
        if (!silent) {
          if (isRefresh) setRefreshing(true);
          else setLoading(true);
          setError('');
        }

        const res = await attendanceApi.getCourseRequests({
          status: statusFilter,
        });

        setRequests(Array.isArray(res?.data) ? res.data : []);
        setOpenCourses(Array.isArray(res?.openCourses) ? res.openCourses : []);
        setTotalPending(Number(res?.totalPending) || 0);
      } catch (err) {
        if (!silent) setError(extractErrorMessage(err));
      } finally {
        if (!silent) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [statusFilter]
  );

  // Recarga las peticiones cuando la pantalla obtiene foco o cambia el filtro de estado.
  useFocusEffect(
    useCallback(() => {
      loadRequests(false, false);
    }, [loadRequests])
  );

  // Actualiza automáticamente la lista en tiempo real cuando un alumno envía una nueva petición desde otro dispositivo.
  usarTiempoReal(() => {
    loadRequests(false, true);
  });

  // Construye la lista unificada de cursos disponibles para filtrar (ej. 1° 1ª, 6° 1ª).
  const courseFilterOptions = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        schoolYear: number;
        courseDivision: number;
        label: string;
        fullLabel: string;
        count: number;
      }
    >();

    (openCourses || []).forEach((g: any) => {
      const sy = Number(g.schoolYear);
      const cd = Number(g.courseDivision);
      if (sy && cd) {
        const key = `${sy}-${cd}`;
        map.set(key, {
          key,
          schoolYear: sy,
          courseDivision: cd,
          label: `${sy}° ${cd}ª`,
          fullLabel: `${sy}° Año - ${cd}° Curso`,
          count: 0,
        });
      }
    });

    (requests || []).forEach((r: any) => {
      const sy = Number(r.requestedSchoolYear);
      const cd = Number(r.requestedCourseDivision);
      if (sy && cd) {
        const key = `${sy}-${cd}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            schoolYear: sy,
            courseDivision: cd,
            label: `${sy}° ${cd}ª`,
            fullLabel: `${sy}° Año - ${cd}° Curso`,
            count: 0,
          });
        }
        map.get(key)!.count += 1;
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => a.schoolYear - b.schoolYear || a.courseDivision - b.courseDivision
    );
  }, [openCourses, requests]);

  // Filtra las peticiones para mostrar únicamente las que corresponden al curso seleccionado (ej. 1° 1ª).
  const filteredRequests = useMemo(() => {
    if (selectedGroupFilter === 'ALL') return requests;
    return (requests || []).filter((r: any) => {
      const key = `${Number(r.requestedSchoolYear)}-${Number(r.requestedCourseDivision)}`;
      return key === selectedGroupFilter;
    });
  }, [requests, selectedGroupFilter]);

  // Autoriza la petición seleccionada asignando al alumno a su nuevo curso escolar.
  const handleApprove = async (reqItem: any) => {
    try {
      setProcessingId(reqItem.id);
      setError('');
      setSuccess('');
      const res = await attendanceApi.approveCourseRequest(reqItem.id);
      setSuccess(
        res?.message ||
          `Se autorizó el ingreso de ${reqItem.studentName} al curso ${reqItem.requestedLabel}.`
      );
      await loadRequests(false, true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setProcessingId(null);
    }
  };

  // Rechaza la petición de ingreso o cambio de curso seleccionada.
  const handleReject = async (reqItem: any) => {
    try {
      setProcessingId(reqItem.id);
      setError('');
      setSuccess('');
      const res = await attendanceApi.rejectCourseRequest(reqItem.id);
      setSuccess(
        res?.message ||
          `Se rechazó la petición de ${reqItem.studentName} para el curso ${reqItem.requestedLabel}.`
      );
      await loadRequests(false, true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadRequests(true, false)}
          tintColor={colors.primary}
        />
      }
    >
      <Card style={{ marginBottom: 14 }}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Badge label="Preceptoría Escolar" tone="primary" />
              <Badge
                label={`${totalPending} ${totalPending === 1 ? 'pendiente' : 'pendientes'}`}
                tone={totalPending > 0 ? 'warning' : 'success'}
              />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.text }}>
              Peticiones de Ingreso y Cambio de Curso
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
              Autorizá o rechazá las solicitudes de los alumnos para inscribirse o cambiarse de curso escolar.
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
            <Ionicons name="git-pull-request-outline" size={24} color={colors.primary} />
          </View>
        </View>
      </Card>

      <AlertBanner type="error" message={error} />
      <AlertBanner type="success" message={success} />

      <Card style={{ marginBottom: 16 }}>
        <View style={[styles.rowBetween, { marginBottom: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="filter" size={16} color={colors.primary} />
            <Text
              style={{
                fontSize: 13,
                fontWeight: '800',
                color: colors.text,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Filtrar Peticiones por Curso
            </Text>
          </View>
          {selectedGroupFilter !== 'ALL' && (
            <TouchableOpacity onPress={() => setSelectedGroupFilter('ALL')}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
                Ver todos los cursos
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          <TouchableOpacity
            onPress={() => setSelectedGroupFilter('ALL')}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor:
                selectedGroupFilter === 'ALL'
                  ? colors.primary
                  : colors.mode === 'light'
                  ? '#f1f5f9'
                  : '#1e293b',
              borderWidth: 1.5,
              borderColor: selectedGroupFilter === 'ALL' ? colors.primary : colors.border,
            }}
          >
            <Ionicons
              name="layers-outline"
              size={15}
              color={selectedGroupFilter === 'ALL' ? '#ffffff' : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={{
                fontSize: 13,
                fontWeight: '800',
                color: selectedGroupFilter === 'ALL' ? '#ffffff' : colors.text,
              }}
            >
              Todos ({requests.length})
            </Text>
          </TouchableOpacity>

          {courseFilterOptions.map((grp) => {
            const isSelected = selectedGroupFilter === grp.key;
            return (
              <TouchableOpacity
                key={grp.key}
                onPress={() => setSelectedGroupFilter(grp.key)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: isSelected
                    ? colors.primary
                    : colors.mode === 'light'
                    ? '#f1f5f9'
                    : '#1e293b',
                  borderWidth: 1.5,
                  borderColor: isSelected ? colors.primary : colors.border,
                }}
              >
                <Ionicons
                  name="school-outline"
                  size={15}
                  color={isSelected ? '#ffffff' : colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '800',
                    color: isSelected ? '#ffffff' : colors.text,
                  }}
                >
                  {grp.label} ({grp.count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 12,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          {[
            { id: 'pending', label: 'Pendientes de autorizar' },
            { id: 'approved', label: 'Autorizadas' },
            { id: 'rejected', label: 'Rechazadas' },
            { id: 'all', label: 'Historial completo' },
          ].map((st) => {
            const active = statusFilter === st.id;
            return (
              <TouchableOpacity
                key={st.id}
                onPress={() => setStatusFilter(st.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 12,
                  backgroundColor: active ? `${colors.primary}20` : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: active ? '800' : '600',
                    color: active ? colors.primary : colors.textSecondary,
                  }}
                >
                  {st.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      <SectionHeader
        title={
          selectedGroupFilter === 'ALL'
            ? `Peticiones (${filteredRequests.length})`
            : `Peticiones para ingresar a ${
                courseFilterOptions.find((g) => g.key === selectedGroupFilter)?.label ||
                selectedGroupFilter
              } (${filteredRequests.length})`
        }
        subtitle="Revisá los datos del estudiante y elegí si autorizás o rechazás su ingreso al curso"
      />

      {loading && requests.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredRequests.length === 0 ? (
        <EmptyState
          icon="checkmark-done-circle-outline"
          title={
            selectedGroupFilter === 'ALL'
              ? 'No hay peticiones en este estado'
              : `Sin peticiones para el curso ${
                  courseFilterOptions.find((g) => g.key === selectedGroupFilter)?.label ||
                  selectedGroupFilter
                }`
          }
          message={
            selectedGroupFilter === 'ALL'
              ? 'Cuando un estudiante solicite inscribirse o cambiarse a un curso, aparecerá aquí para que lo autorices.'
              : 'No hay solicitudes de ingreso ni cambio para el curso seleccionado.'
          }
          actionLabel={selectedGroupFilter !== 'ALL' ? 'Mostrar todos los cursos' : undefined}
          onAction={selectedGroupFilter !== 'ALL' ? () => setSelectedGroupFilter('ALL') : undefined}
        />
      ) : (
        <View
          style={{
            flexDirection: isDesktop ? 'row' : 'column',
            flexWrap: isDesktop ? 'wrap' : 'nowrap',
            gap: 14,
          }}
        >
          {filteredRequests.map((reqItem) => {
            const isPending = reqItem.status === 'pending';
            const isApproved = reqItem.status === 'approved';
            const isProcessing = processingId === reqItem.id;

            return (
              <View
                key={reqItem.id}
                style={{
                  width: (isDesktop
                    ? Platform.OS === 'web'
                      ? 'calc((100% - 28px) / 3)'
                      : Math.floor((screenWidth - 60) / 3)
                    : '100%') as any,
                  maxWidth: (isDesktop
                    ? Platform.OS === 'web'
                      ? 'calc((100% - 28px) / 3)'
                      : Math.floor((screenWidth - 60) / 3)
                    : '100%') as any,
                  flexGrow: isDesktop ? 0 : 1,
                  flexShrink: 0,
                  marginBottom: isDesktop ? 0 : 4,
                }}
              >
                <Card
                  style={{
                    height: isDesktop ? '100%' : undefined,
                    marginBottom: 0,
                    justifyContent: 'space-between',
                  }}
                >
                  <View>
                    <View style={styles.rowBetween}>
                      <Badge
                        label={
                          reqItem.requestType === 'change'
                            ? 'Cambio de Curso'
                            : 'Inscripción a Curso'
                        }
                        tone={reqItem.requestType === 'change' ? 'warning' : 'info'}
                      />
                      <Badge
                        label={
                          isPending
                            ? 'Pendiente'
                            : isApproved
                            ? 'Autorizada'
                            : 'Rechazada'
                        }
                        tone={isPending ? 'warning' : isApproved ? 'success' : 'danger'}
                      />
                    </View>

                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '900',
                        color: colors.text,
                        marginTop: 10,
                      }}
                    >
                      {reqItem.studentName}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      {reqItem.email}
                    </Text>

                    <View
                      style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 10,
                        backgroundColor: colors.surfaceAlt || colors.background,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      {reqItem.currentLabel ? (
                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
                          Curso actual:{' '}
                          <Text style={{ fontWeight: '800', color: colors.text }}>
                            {reqItem.currentLabel}
                          </Text>
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 13, color: colors.text }}>
                        Solicita ingresar a:{' '}
                        <Text style={{ fontWeight: '900', color: colors.primary }}>
                          {reqItem.requestedFullLabel} ({reqItem.requestedLabel})
                        </Text>
                      </Text>
                    </View>

                    <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>
                      Enviada: {formatDateAR(reqItem.createdAt, true)}
                    </Text>
                  </View>

                  {isPending ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                      <Button
                        title="Autorizar"
                        icon="checkmark-circle-outline"
                        variant="success"
                        small
                        loading={isProcessing}
                        disabled={isProcessing}
                        onPress={() => handleApprove(reqItem)}
                        style={{ flex: 1, marginBottom: 0 }}
                      />
                      <Button
                        title="Rechazar"
                        icon="close-circle-outline"
                        variant="danger"
                        small
                        loading={isProcessing}
                        disabled={isProcessing}
                        onPress={() => handleReject(reqItem)}
                        style={{ flex: 1, marginBottom: 0 }}
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        marginTop: 12,
                        paddingTop: 8,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        {isApproved ? 'Autorizada' : 'Rechazada'}
                        {reqItem.reviewerName ? ` por ${reqItem.reviewerName}` : ''}
                        {reqItem.reviewedAt ? ` el ${formatDateAR(reqItem.reviewedAt, true)}` : ''}
                      </Text>
                    </View>
                  )}
                </Card>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// Define la hoja de estilos para el panel de peticiones del preceptor.
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
