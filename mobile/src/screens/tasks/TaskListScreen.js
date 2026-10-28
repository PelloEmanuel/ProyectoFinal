import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chips, Empty, ErrorBanner, Input, Loading } from '../../components/ui';
import TaskCard from '../../components/TaskCard';
import { tasksApi } from '../../api/services';
import { getErrorMessage } from '../../utils/errors';
import useResponsive from '../../hooks/useResponsive';
import { colors } from '../../theme';

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'done', label: 'Hechas' },
];

export default function TaskListScreen({ navigation }) {
  const { columns, contentWidth } = useResponsive();
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await tasksApi.list({ status: status || undefined, q: q || undefined });
      setTasks(res.data);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [status, q]);

  // Recarga al volver a la pantalla (por ejemplo, después de crear/editar)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center' }} edges={['left', 'right']}>
      <View style={{ width: contentWidth, flex: 1 }}>
        <View style={{ padding: 12, paddingBottom: 0 }}>
          <Input value={q} onChangeText={setQ} placeholder="Buscar tareas..." returnKeyType="search" style={{ paddingVertical: 10 }} />
          <Chips options={FILTERS} value={status} onChange={setStatus} />
          <ErrorBanner message={error} />
        </View>
        <FlatList
          key={columns}
          numColumns={columns}
          data={tasks}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: 6, paddingBottom: 90, flexGrow: 1 }}
          renderItem={({ item }) => <TaskCard task={item} onPress={() => navigation.navigate('TaskForm', { task: item })} />}
          ListEmptyComponent={!error && <Empty text="No hay tareas para mostrar. Creá la primera con el botón +" />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        />
        <Pressable accessibilityLabel="Nueva tarea" style={s.fab} onPress={() => navigation.navigate('TaskForm', {})}>
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fab: { position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 5 },
});
