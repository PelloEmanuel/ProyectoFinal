/**
 * Archivo: mobile/src/screens/auth/VerifyCodeScreen.js
 * Descripción: Pantalla unificada de verificación de seguridad:
 * 1) mode = 'verify_email': Verificación en 2 pasos por correo electrónico (requisito previo para entrar).
 * 2) mode = '2fa': Verificación de segundo factor (correo o TOTP/recuperación).
 * 3) mode = 'forgot_password': Solicitud de recuperación y definición de nueva contraseña.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, ErrorBanner, Input, Screen, SuccessBanner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authApi } from '../../api/services';
import { getErrorMessage } from '../../utils/errors';

export default function VerifyCodeScreen({ navigation, route }) {
  const mode = route.params?.mode || 'verify_email';
  const initialEmail = route.params?.email || '';
  const userId = route.params?.userId;
  const initialDevCode = route.params?.devCode || route.params?.devVerificationCode || '';

  const { verifyTwoFactor, refreshProfile, startSession } = useAuth();
  const { colors } = useTheme();

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialDevCode);
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState(mode === 'forgot_password' ? 'request' : 'verify');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handle2FA = async () => {
    if (!code.trim()) return setError('Ingresá el código de 6 dígitos o un código de recuperación');
    setError('');
    setLoading(true);
    try {
      await verifyTwoFactor(userId, code.trim());
    } catch (e) {
      setError(getErrorMessage(e));
      setLoading(false);
    }
  };

  const handleRequestReset = async () => {
    if (!email.trim()) return setError('Ingresá tu correo electrónico');
    setError('');
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setSuccess(res.message);
      if (res.devResetCode) {
        setCode(res.devResetCode);
      }
      setStep('reset');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!code.trim() || newPassword.length < 8) {
      return setError('Ingresá el código recibido y una contraseña nueva de al menos 8 caracteres');
    }
    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword({ email: email.trim(), code: code.trim(), newPassword });
      setSuccess('¡Contraseña actualizada! Ya podés iniciar sesión.');
      setTimeout(() => navigation.navigate('Login'), 1200);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!code.trim()) return setError('Ingresá el código de 6 dígitos enviado a tu correo');
    setError('');
    setLoading(true);
    try {
      const res = await authApi.verifyEmail({ userId, token: code.trim(), code: code.trim() });
      setSuccess('¡Verificación en 2 pasos completada! Accediendo al Campus...');
      if (res?.accessToken || res?.data?.accessToken) {
        await startSession(res);
      } else {
        await refreshProfile().catch(() => {});
        setTimeout(() => navigation.navigate('Login'), 1200);
      }
    } catch (e) {
      setError(getErrorMessage(e));
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    setError('');
    setResending(true);
    try {
      const res = await authApi.resendVerification({ userId, email });
      setSuccess(res.message || 'Código de verificación reenviado a tu correo');
      if (res.devVerificationCode) {
        setCode(res.devVerificationCode);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {mode === 'verify_email' && (
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
            Verificación en 2 Pasos
          </Text>
          <Text style={{ color: colors.muted, marginBottom: 16, lineHeight: 20 }}>
            Para completar tu registro y acceder al Campus Escolar, ingresá el código de 6 dígitos que enviamos a tu correo electrónico ({email || 'tu casilla'}).
          </Text>

          {initialDevCode ? (
            <View style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.primary, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                CÓDIGO DE VERIFICACIÓN:
              </Text>
              <Text selectable style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 4 }}>
                {initialDevCode}
              </Text>
            </View>
          ) : null}

          <Input
            label="Código de 6 dígitos"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            autoCapitalize="none"
          />

          <Button
            title="Verificar y Acceder al Campus"
            icon="shield-checkmark-outline"
            onPress={handleVerifyEmail}
            loading={loading}
            style={{ marginBottom: 10 }}
          />

          <Button
            title="Reenviar código de verificación"
            icon="mail-outline"
            variant="outline"
            onPress={handleResendEmail}
            loading={resending}
            style={{ marginBottom: 16 }}
          />

          <Pressable onPress={() => navigation.navigate('Login')} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
              ¿Querés ingresar con otra cuenta? Iniciar sesión
            </Text>
          </Pressable>
        </View>
      )}

      {mode === '2fa' && (
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
            Verificación en 2 Pasos
          </Text>
          <Text style={{ color: colors.muted, marginBottom: 16, lineHeight: 20 }}>
            Ingresá el código de verificación de 6 dígitos enviado a tu correo ({email}), o el código temporal de tu aplicación autenticadora.
          </Text>

          {initialDevCode ? (
            <View style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.primary, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                CÓDIGO DE VERIFICACIÓN:
              </Text>
              <Text selectable style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 4 }}>
                {initialDevCode}
              </Text>
            </View>
          ) : null}

          <Input
            label="Código de Verificación (6 dígitos)"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            autoCapitalize="characters"
          />

          <Button
            title="Verificar e ingresar"
            icon="shield-checkmark-outline"
            onPress={handle2FA}
            loading={loading}
            style={{ marginBottom: 10 }}
          />

          <Button
            title="Reenviar código por correo"
            icon="mail-outline"
            variant="outline"
            onPress={handleResendEmail}
            loading={resending}
            style={{ marginBottom: 16 }}
          />

          <Pressable onPress={() => navigation.navigate('Login')} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
              Volver a Iniciar sesión
            </Text>
          </Pressable>
        </View>
      )}

      {mode === 'forgot_password' && step === 'request' && (
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
            Recuperar contraseña
          </Text>
          <Text style={{ color: colors.muted, marginBottom: 16, lineHeight: 20 }}>
            Ingresá el correo electrónico asociado a tu cuenta de SkillTrack y te enviaremos un código temporal de recuperación.
          </Text>
          <Input
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.edu"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Button title="Enviar código de recuperación" icon="mail-outline" onPress={handleRequestReset} loading={loading} />
        </View>
      )}

      {mode === 'forgot_password' && step === 'reset' && (
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
            Definir nueva contraseña
          </Text>
          <Input label="Código temporal de 6 dígitos" value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad" />
          <Input
            label="Nueva contraseña"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Mínimo 8 caracteres, letras y números"
            secureTextEntry
          />
          <Button title="Guardar nueva contraseña" icon="key-outline" onPress={handleConfirmReset} loading={loading} />
        </View>
      )}
    </Screen>
  );
}
