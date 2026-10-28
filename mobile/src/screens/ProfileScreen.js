import React, { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { Badge, Button, ErrorBanner, Input, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../api/services';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { ROLE_LABEL, colors } from '../theme';

export default function ProfileScreen() {
  const { user, updateUser, logout } = useAuth();
  const [name, setName] = useState(user.name);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async (changes, okMsg) => {
    setBanner(''); setErrors({}); setLoading(true);
    try {
      await updateUser(await usersApi.updateMe(changes));
      Alert.alert('Listo', okMsg);
      if (changes.newPassword) { setCurrent(''); setNext(''); }
    } catch (e) { setErrors(getFieldErrors(e)); setBanner(getErrorMessage(e)); }
    finally { setLoading(false); }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: colors.primary }}>{user.name[0]?.toUpperCase()}</Text>
        </View>
        <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 8, color: colors.text }}>{user.email}</Text>
        <View style={{ marginTop: 6 }}><Badge text={ROLE_LABEL[user.role]} color={colors.primary} /></View>
      </View>

      <ErrorBanner message={banner} />
      <Input label="Nombre" value={name} onChangeText={setName} error={errors.name} />
      <Button title="Guardar nombre" variant="outline" loading={loading} onPress={() => save({ name: name.trim() }, 'Nombre actualizado')} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontWeight: '600', color: colors.text }}>Verificación en 2 pasos</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Código por email al iniciar sesión con contraseña</Text>
        </View>
        <Switch value={user.twoFactorEnabled} trackColor={{ true: colors.primary }}
          onValueChange={(v) => save({ twoFactorEnabled: v }, v ? '2 pasos activado' : '2 pasos desactivado')} />
      </View>

      <Text style={{ fontWeight: '700', fontSize: 16, marginVertical: 8, color: colors.text }}>Cambiar contraseña</Text>
      <Input label="Contraseña actual" value={current} onChangeText={setCurrent} secureTextEntry />
      <Input label="Nueva contraseña" value={next} onChangeText={setNext} error={errors.newPassword} secureTextEntry />
      <Button title="Cambiar contraseña" variant="outline" disabled={!next} onPress={() => save({ currentPassword: current, newPassword: next }, 'Contraseña actualizada')} />

      <Button title="Cerrar sesión" variant="danger" icon="log-out-outline" style={{ marginTop: 16 }} onPress={logout} />
    </Screen>
  );
}
