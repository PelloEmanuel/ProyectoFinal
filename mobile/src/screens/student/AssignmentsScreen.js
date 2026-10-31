/**
 * Archivo: mobile/src/screens/student/AssignmentsScreen.js
 * Descripción: Lista de actividades, cuestionarios, entregas, calificaciones y devoluciones
 * del estudiante (Secciones 7.11 y 7.13).
 */
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Badge, Button, Chips, Empty, ErrorBanner, Loading, Screen } from '../../components/ui';
import { assignmentsApi } from '../../api/services';
import { useTheme } from '../../context/ThemeContext';
import { ASSIGNMENT_TYPE_LABEL, DELIVERY_STATUS } from '../../theme';
import { formatDate } from '../../utils/dates';
import { getErrorMessage } from '../../utils/errors';

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'submitted', label: 'Enviadas' },
  { value: 'graded', label: 'Corregidas' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'upcoming', label: 'Próximas' },
];

export default function AssignmentsScreen({ navigation }) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await assignmentsApi.myList({ filter: filter || undefined });
      setItems(res || []);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <Loading />;

  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <FlatList
        data={items}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListHeaderComponent={
          <View>
            <Button
              title="Ver Calendario de Fechas Límite"
              icon="calendar-outline"
              variant="outline"
              small
              onPress={() => navigation.navigate('StudentExtras', { section: 'calendar' })}
            />
            <Chips label="Filtrar por estado" options={FILTERS} value={filter} onChange={setFilter} />
            <ErrorBanner message={error} onRetry={load} />
          </View>
        }
        renderItem={({ item }) => {
          const st = DELIVERY_STATUS[item.deliveryState] || DELIVERY_STATUS.pending;
          return (
            <Pressable
              onPress={() => navigation.navigate('AssignmentDetail', { assignmentId: item.id })}
              style={{
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 14,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Badge text={st.label} color={st.color} />
                  <Badge text={ASSIGNMENT_TYPE_LABEL[item.assignmentType] || item.assignmentType} color={colors.primary} />
                </View>
                {!!item.dueAt && (
                  <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>
                    Límite: {formatDate(item.dueAt)}
                  </Text>
                )}
              </View>

              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 6 }}>{item.title}</Text>
              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 2 }}>{item.courseTitle}</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }} numberOfLines={2}>
                {item.description}
              </Text>

              {/* Sección de calificación y devolución cuando está corregida */}
              {item.deliveryState === 'graded' && item.latestScore !== null && (
                <View
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: item.passed ? colors.successLight : colors.dangerLight,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '800', color: item.passed ? colors.success : colors.danger, fontSize: 13 }}>
                      {item.passed ? 'APROBADA' : 'DESAPROBADA'} • {item.latestScore}/{item.maxScore} pts ({item.percentage}%)
                    </Text>
                    {!!item.gradedAt && (
                      <Text style={{ fontSize: 11, color: colors.muted }}>{formatDate(item.gradedAt)}</Text>
                    )}
                  </View>
                  {!!item.latestFeedback && (
                    <Text style={{ color: colors.text, fontSize: 12, marginTop: 4 }}>
                      Devolución del docente: "{item.latestFeedback}"
                    </Text>
                  )}
                </View>
              )}

              {item.deliveryState === 'submitted' && (
                <Text style={{ fontSize: 12, color: colors.secondary, fontWeight: '600', marginTop: 8 }}>
                  Entregada • Pendiente de revisión y calificación del docente
                </Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !error && (
            <Empty
              icon="clipboard-outline"
              title="No hay actividades en este filtro"
              text="Inscribite en nuevos cursos o cambiá el filtro superior para ver todas tus actividades."
            />
          )
        }
      />
    </Screen>
  );
}
