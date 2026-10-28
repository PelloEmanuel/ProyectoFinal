import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Button, ErrorBanner, Input, Screen } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/services';
import { getErrorMessage } from '../../utils/errors';
import { colors } from '../../theme';

export default function VerifyCodeScreen({ route }) {
  const { userId, email } = route.params;
  const { verifyTwoFactor } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(30);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) return setError('Ingresá los 6 dígitos del código');
    setError(''); setLoading(true);
    try { await verifyTwoFactor(userId, code); } catch (e) { setError(getErrorMessage(e)); setLoading(false); }
  };

  const resend = async () => {
    try { await authApi.resend2fa(userId); setInfo('Te enviamos un nuevo código'); setError(''); setWait(30); }
    catch (e) { setError(getErrorMessage(e)); }
  };

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 8 }}>Revisá tu email</Text>
      <Text style={{ color: colors.muted, marginVertical: 12 }}>Enviamos un código de 6 dígitos a {email}. Vence en 10 minutos.</Text>
      <ErrorBanner message={error} />
      {!!info && <Text style={{ color: colors.success, marginBottom: 12 }}>{info}</Text>}
      <Input label="Código" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad" placeholder="123456" maxLength={6} style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }} />
      <Button title="Verificar" onPress={submit} loading={loading} />
      <Button title={wait > 0 ? `Reenviar código (${wait}s)` : 'Reenviar código'} variant="outline" onPress={resend} disabled={wait > 0} />
    </Screen>
  );
}
