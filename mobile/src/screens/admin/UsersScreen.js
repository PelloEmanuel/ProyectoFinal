import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Badge, Button, Empty, ErrorBanner, Loading, Screen } from '../../components/ui';
import { usersApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/errors';
import { ROLE_LABEL, colors } from '../../theme';

/** Gestión de usuarios (solo administrador): cambiar rol, activar/desactivar y eliminar. */
export default function UsersScreen() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setError(''); setUsers(await usersApi.list()); } catch (e) { setError(getErrorMessage(e)); setUsers((u) => u || []); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (fn) => { try { setError(''); await fn(); await load(); } catch (e) { setError(getErrorMessage(e)); } };

  const changeRole = (u) =>
    Alert.alert(`Rol de ${u.name}`, 'Elegí el nuevo rol', [
      ...Object.entries(ROLE_LABEL).map(([role, label]) => ({ text: label, onPress: () => run(() => usersApi.setRole(u.id, role)) })),
      { text: 'Cancelar', style: 'cancel' },
    ]);

  const confirmDelete = (u) =>
    Alert.alert('Eliminar usuario', `Se eliminará a ${u.name} y sus tareas creadas.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => run(() => usersApi.remove(u.id)) },
    ]);

  if (!users) return <Loading />;
  return (
    <Screen scroll={false}>
      <ErrorBanner message={error} />
      <FlatList
        data={users}
        keyExtractor={(u) => String(u.id)}
        ListEmptyComponent={<Empty icon="people-outline" text="No hay usuarios" />}
        renderItem={({ item: u }) => (
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, opacity: u.isActive ? 1 : 0.6 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>{u.name}</Text>
            <Text style={{ color: colors.muted, marginBottom: 8 }}>{u.email}</Text>
            <View style={{ flexDirection: 'row' }}>
              <Badge text={ROLE_LABEL[u.role]} color={colors.primary} />
              <Badge text={u.isActive ? 'Activo' : 'Desactivado'} color={u.isActive ? colors.success : colors.danger} />
            </View>
            {u.id !== me.id && (
              <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
                <Button style={{ flex: 1, marginBottom: 0 }} variant="outline" title="Rol" onPress={() => changeRole(u)} />
                <Button style={{ flex: 1, marginBottom: 0 }} variant="outline" title={u.isActive ? 'Desactivar' : 'Activar'} onPress={() => run(() => usersApi.setStatus(u.id, !u.isActive))} />
                <Button style={{ flex: 1, marginBottom: 0 }} variant="danger" title="Borrar" onPress={() => confirmDelete(u)} />
              </View>
            )}
          </View>
        )}
      />
    </Screen>
  );
}
