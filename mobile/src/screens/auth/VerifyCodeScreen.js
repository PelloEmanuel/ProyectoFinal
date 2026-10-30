/**
 * Archivo: mobile/src/screens/auth/VerifyCodeScreen.js
 * Descripción: Pantalla unificada de verificación de seguridad (Secciones 7.4 y 7.5):
 * 1) mode = '2fa': Verificación de segundo factor TOTP (o código de recuperación).
 * 2) mode = 'forgot_password': Solicitud de recuperación y definición de nueva contraseña.
 * 3) mode = 'verify_email': Confirmación de correo electrónico mediante código.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ErrorBanner, Input, Screen, SuccessBanner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authApi } from '../../api/services';
import { getErrorMessage } from '../../utils/errors';

export default function VerifyCodeScreen({ navigation, route }) {
  const mode = route.params?.mode || '2fa';
  const initialEmail = route.params?.email || '';
  const userId = route.params?.userId;

  const { verifyTwoFactor, refreshProfile } = useAuth();
  const { colors } = useTheme();

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState(mode === 'forgot_password' ? 'request' : 'verify');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

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
      setSuccess(
        res.devResetCode
          ? `${res.message} (Código de entorno de desarrollo: ${res.devResetCode})`
          : res.message
      );
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
    if (!code.trim()) return setError('Ingresá el código de verificación');
    setError('');
    setLoading(true);
    try {
      await authApi.verifyEmail({ userId, token: code.trim() });
      await refreshProfile();
      setSuccess('Correo electrónico verificado correctamente.');
      setTimeout(() => navigation.goBack(), 1000);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {mode === '2fa' && (
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
            Autenticación de Dos Factores
          </Text>
          <Text style={{ color: colors.muted, marginBottom: 16, lineHeight: 20 }}>
            Abrí tu aplicación autenticadora (Google Authenticator / Authy) e ingresá el código temporal de 6 dígitos para {email}, o bien un código de recuperación de un solo uso (XXXX-XXXX).
          </Text>
          <Input
            label="Código TOTP o de Recuperación"
            value={code}
            onChangeText={setCode}
            placeholder="123456 o A1B2-C3D4"
            autoCapitalize="characters"
          />
          <Button title="Verificar e ingresar" icon="shield-checkmark-outline" onPress={handle2FA} loading={loading} />
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

      {mode === 'verify_email' && (
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
            Verificar correo electrónico
          </Text>
          <Text style={{ color: colors.muted, marginBottom: 16 }}>
            Ingresá el código de 6 dígitos enviado a {email}.
          </Text>
          <Input label="Código de verificación" value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad" />
          <Button title="Confirmar correo" icon="checkmark-circle-outline" onPress={handleVerifyEmail} loading={loading} />
        </View>
      )}
    </Screen>
  );
}
