/**
 * Archivo: mobile/src/screens/auth/LoginScreen.js
 * Descripción: Pantalla de inicio de sesión del Campus (Sección 7.2).
 * Soporta correo/contraseña con control de visibilidad, recuperación de contraseña,
 * proveedores OAuth 2.0 (Google, GitHub, Facebook) y redirección a segundo factor TOTP.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, ErrorBanner, Input, Screen, CampusLogo } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import useSocialAuth from '../../hooks/useSocialAuth';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { validateLogin } from '../../utils/validators';

export default function LoginScreen({ navigation }) {
  const { login, socialLogin } = useAuth();
  const { colors } = useTheme();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const startSocial = useSocialAuth({
    onCredential: async (provider, body) => {
      setBanner('');
      if (body?.twoFactorRequired) {
        setLoading(false);
        navigation.navigate('VerifyCode', { mode: '2fa', userId: body.userId, email: body.email });
        return;
      }
      setLoading(true);
      try {
        await socialLogin(provider, body);
      } catch (e) {
        setBanner(getErrorMessage(e));
        setLoading(false);
      }
    },
    onError: setBanner,
  });

  const submit = async (customEmail, customPassword) => {
    const payload = {
      email: customEmail !== undefined ? customEmail : form.email,
      password: customPassword !== undefined ? customPassword : form.password,
    };
    const v = validateLogin(payload);
    setErrors(v);
    setBanner('');
    if (Object.keys(v).length) return;
    setLoading(true);
    try {
      const res = await login(payload.email, payload.password);
      if (res.requiresVerification) {
        navigation.navigate('VerifyCode', {
          mode: 'verify_email',
          userId: res.userId,
          email: res.email,
        });
        return;
      }
      if (res.twoFactorRequired) {
        navigation.navigate('VerifyCode', {
          mode: '2fa',
          userId: res.userId,
          email: res.email,
        });
        return;
      }
    } catch (e) {
      setErrors(getFieldErrors(e));
      setBanner(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (email, password) => {
    setForm({ email, password });
    submit(email, password);
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={{ marginVertical: 14 }}>
        <CampusLogo size="md" />
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 12 }}>
          Iniciar sesión
        </Text>
        <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13 }}>
          Ingresá a tu cuenta académica del Campus
        </Text>
      </View>

      <ErrorBanner message={banner} />

      <Input
        label="Correo electrónico"
        value={form.email}
        onChangeText={set('email')}
        error={errors.email}
        placeholder="nombre@campus.edu"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Input
        label="Contraseña"
        value={form.password}
        onChangeText={set('password')}
        error={errors.password}
        placeholder="••••••••"
        secureTextEntry
        autoComplete="off"
        textContentType="none"
        autoCorrect={false}
        spellCheck={false}
      />

      <Pressable
        onPress={() => navigation.navigate('VerifyCode', { mode: 'forgot_password', email: form.email })}
        style={{ alignSelf: 'flex-end', marginBottom: 12 }}
      >
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>¿Olvidaste tu contraseña?</Text>
      </Pressable>

      <Button title="Ingresar al Campus" icon="log-in-outline" onPress={() => submit()} loading={loading} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text style={{ marginHorizontal: 10, color: colors.muted, fontSize: 12, fontWeight: '600' }}>O CONTINUÁ CON</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          title="Google"
          icon="logo-google"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() => startSocial('google')}
          disabled={loading}
          small
        />
        <Button
          title="GitHub"
          icon="logo-github"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() => startSocial('github')}
          disabled={loading}
          small
        />
        <Button
          title="Discord"
          icon="logo-discord"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() => startSocial('discord')}
          disabled={loading}
          small
        />
      </View>

      <Pressable onPress={() => navigation.navigate('Register')} style={{ padding: 14, marginTop: 10 }}>
        <Text style={{ textAlign: 'center', color: colors.muted }}>
          ¿Todavía no tenés cuenta? <Text style={{ color: colors.primary, fontWeight: '700' }}>Crear una cuenta</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}
