import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ErrorBanner, Loading, Screen } from '../../components/ui';
import { tasksApi } from '../../api/services';
import { getErrorMessage } from '../../utils/errors';
import { STATUS, colors } from '../../theme';

const Stat = ({ label, value, color }) => (
  <View style={{ flexGrow: 1, flexBasis: 140, backgroundColor: '#fff', borderRadius: 14, padding: 16, margin: 6, borderWidth: 1, borderColor: colors.border }}>
    <Text style={{ fontSize: 30, fontWeight: '800', color }}>{value}</Text>
    <Text style={{ color: colors.muted }}>{label}</Text>
  </View>
);

/** Panel de métricas para supervisor y administrador. */
export default function DashboardScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setError(''); setData(await tasksApi.stats()); } catch (e) { setError(getErrorMessage(e)); }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data && !error) return <Loading />;
  return (
    <Screen scroll={false}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <ErrorBanner message={error} />
        {data && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Object.entries(STATUS).map(([k, v]) => <Stat key={k} label={v.label} value={data.byStatus[k]} color={v.color} />)}
              <Stat label="Vencidas" value={data.overdue} color={colors.danger} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', margin: 8, marginTop: 16, color: colors.text }}>Carga por persona</Text>
            {data.byUser.length === 0 && <Text style={{ color: colors.muted, margin: 8 }}>Todavía no hay tareas asignadas.</Text>}
            {data.byUser.map((u) => (
              <View key={u.id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, margin: 6, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{u.name}</Text>
                  <Text style={{ color: colors.muted }}>{u.done}/{u.total} hechas</Text>
                </View>
                <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, marginTop: 8 }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.success, width: `${(u.done / u.total) * 100}%` }} />
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
