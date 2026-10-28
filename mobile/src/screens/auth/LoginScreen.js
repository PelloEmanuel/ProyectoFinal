import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, ErrorBanner, Input, Screen } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import useSocialAuth from '../../hooks/useSocialAuth';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { validateLogin } from '../../utils/validators';
import { colors } from '../../theme';

export default function LoginScreen({ navigation }) {
  const { login, socialLogin } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const startSocial = useSocialAuth({
    onCredential: async (provider, body) => {
      setBanner(''); setLoading(true);
      try { await socialLogin(provider, body); } catch (e) { setBanner(getErrorMessage(e)); setLoading(false); }
    },
    onError: setBanner,
  });

  const submit = async () => {
    const v = validateLogin(form);
    setErrors(v); setBanner('');
    if (Object.keys(v).length) return;
    setLoading(true);
    try {
      const res = await login(form.email, form.password);
      if (res.twoFactorRequired) navigation.navigate('VerifyCode', { userId: res.userId, email: form.email });
    } catch (e) {
      setErrors(getFieldErrors(e)); setBanner(getErrorMessage(e));
    } finally { setLoading(false); }
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={{ alignItems: 'center', marginVertical: 24 }}>
        <Ionicons name="checkmark-done-circle" size={72} color={colors.primary} />
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>TaskFlow</Text>
        <Text style={{ color: colors.muted }}>Organizá el trabajo de tu equipo</Text>
      </View>

      <ErrorBanner message={banner} />
      <Input label="Email" value={form.email} onChangeText={set('email')} error={errors.email} placeholder="tu@email.com"
        autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Input label="Contraseña" value={form.password} onChangeText={set('password')} error={errors.password}
        placeholder="••••••••" secureTextEntry autoComplete="password" />
      <Button title="Ingresar" onPress={submit} loading={loading} />

      <Text style={{ textAlign: 'center', color: colors.muted, marginVertical: 12 }}>o continuá con</Text>
      <Button title="Google" icon="logo-google" variant="outline" onPress={() => startSocial('google')} disabled={loading} />
      <Button title="Facebook" icon="logo-facebook" variant="outline" onPress={() => startSocial('facebook')} disabled={loading} />
      <Button title="GitHub" icon="logo-github" variant="outline" onPress={() => startSocial('github')} disabled={loading} />

      <Pressable onPress={() => navigation.navigate('Register')} style={{ padding: 14 }}>
        <Text style={{ textAlign: 'center', color: colors.muted }}>
          ¿No tenés cuenta? <Text style={{ color: colors.primary, fontWeight: '700' }}>Registrate</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}
