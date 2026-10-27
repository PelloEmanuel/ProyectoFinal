import React, { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Button, ErrorBanner, Input, Screen } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { validateRegister } from '../../utils/validators';
import { colors } from '../../theme';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [twoFactor, setTwoFactor] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const v = validateRegister(form);
    setErrors(v); setBanner('');
    if (Object.keys(v).length) return;
    setLoading(true);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, twoFactorEnabled: twoFactor });
    } catch (e) {
      setErrors(getFieldErrors(e)); setBanner(getErrorMessage(e)); setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginVertical: 16 }}>Crear cuenta</Text>
      <ErrorBanner message={banner} />
      <Input label="Nombre" value={form.name} onChangeText={set('name')} error={errors.name} placeholder="Tu nombre" />
      <Input label="Email" value={form.email} onChangeText={set('email')} error={errors.email} placeholder="tu@email.com"
        autoCapitalize="none" keyboardType="email-address" />
      <Input label="Contraseña" value={form.password} onChangeText={set('password')} error={errors.password}
        placeholder="Mínimo 8 caracteres, letras y números" secureTextEntry />
      <Input label="Repetir contraseña" value={form.confirm} onChangeText={set('confirm')} error={errors.confirm} secureTextEntry />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontWeight: '600', color: colors.text }}>Verificación en 2 pasos</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Pedir un código por email en cada inicio de sesión</Text>
        </View>
        <Switch value={twoFactor} onValueChange={setTwoFactor} trackColor={{ true: colors.primary }} />
      </View>
      <Button title="Registrarme" onPress={submit} loading={loading} />
      <Pressable onPress={() => navigation.goBack()} style={{ padding: 14 }}>
        <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '700' }}>Ya tengo cuenta</Text>
      </Pressable>
    </Screen>
  );
}
