// Importa los hooks de React para estado y callbacks.
import React, { useCallback, useState } from 'react';
// Importa los componentes visuales nativos de React Native.
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
// Importa el hook de foco de navegación.
import { useFocusEffect } from '@react-navigation/native';
// Importa los componentes reutilizables de la interfaz.
import { Badge, Button, Chips, Empty, ErrorBanner, Loading, Screen } from '../../componentes/interfaz';
// Importa el servicio de API de actividades.
import { assignmentsApi } from '../../api/servicios';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa las etiquetas y estados de entrega desde el tema.
import { ASSIGNMENT_TYPE_LABEL, DELIVERY_STATUS } from '../../tema';
// Importa la utilidad para formatear fechas.
import { formatDate } from '../../utilidades/fechas';
// Importa la utilidad para extraer mensajes de error.
import { getErrorMessage } from '../../utilidades/errores';

// Define las opciones de filtrado por estado de entrega.
const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'submitted', label: 'Enviadas' },
  { value: 'graded', label: 'Corregidas' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'upcoming', label: 'Próximas' },
];

// Define las propiedades recibidas por la pantalla de listado de tareas.
interface PropiedadesPantallaTareas {
  navigation: any;
}

// Renderiza la lista de actividades, entregas y calificaciones del estudiante.
export default function AssignmentsScreen({ navigation }: PropiedadesPantallaTareas) {
  // Obtiene la paleta de colores activa.
  const { colors } = useTheme();
  // Estados para el filtro seleccionado, listado de actividades y banderas de carga.
  const [filter, setFilter] = useState<string>('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Consulta al servidor la lista de actividades del alumno según el filtro activo.
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

  // Recarga las actividades cada vez que la pantalla obtiene foco.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Muestra el indicador de carga mientras se obtienen los datos iniciales.
  if (loading) return <Loading />;

  // Renderiza la lista filtrable de actividades del alumno.
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
          !error ? (
            <Empty
              icon="clipboard-outline"
              title="No hay actividades en este filtro"
              text="Inscribite en nuevos cursos o cambiá el filtro superior para ver todas tus actividades."
            />
          ) : null
        }
      />
    </Screen>
  );
}
