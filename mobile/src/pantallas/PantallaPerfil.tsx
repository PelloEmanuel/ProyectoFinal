// Importa React, componentes nativos, contextos de autenticación y utilidades de interfaz.
import React, { useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexto/ContextoAcceso';
import { useTheme } from '../contexto/ContextoTema';
import { authApi, usersApi } from '../api/servicios';
import { extractErrorMessage } from '../utilidades/errores';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  ConfirmModal,
  Input,
  SectionHeader,
} from '../componentes/interfaz';

// Renderiza la pantalla de perfil del usuario con edición de datos, tema, 2FA, contraseña y baja de cuenta.
export default function ProfileScreen() {
  const {
    user,
    updateProfile,
    changePassword,
    logout,
    deleteOwnAccount,
    refreshProfile,
  } = useAuth();
  const { colors, isDark, setThemePreference } = useTheme();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.notificationsEnabled !== false
  );
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [email2faStep, setEmail2faStep] = useState<'idle' | 'input'>('idle');
  const [email2faCode, setEmail2faCode] = useState('');
  const [loading2FA, setLoading2FA] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Guarda los cambios de datos personales y preferencias del usuario.
  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('El nombre, el apellido y el correo electrónico son obligatorios.');
      return;
    }
    try {
      setSavingProfile(true);
      setError('');
      setSuccess('');
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        bio: bio.trim(),
        notificationsEnabled,
        themePreference: isDark ? 'dark' : 'light',
      });
      setSuccess('Perfil académico y correo electrónico actualizados.');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  // Cambia entre modo claro y oscuro persistiendo la preferencia en el servidor.
  const handleToggleTheme = async (val: boolean) => {
    const nextPref = val ? 'dark' : 'light';
    await setThemePreference(nextPref);
    try {
      await usersApi.updatePreferences({ theme: nextPref });
      await updateProfile({ themePreference: nextPref });
    } catch {
      // Mantiene la preferencia local si falla la sincronización remota.
    }
  };

  // Actualiza la contraseña del usuario validando la clave actual.
  const handleChangePassword = async () => {
    if ((user?.hasPassword !== false && !currentPassword) || !newPassword) {
      setError('Completá tu contraseña actual y la nueva contraseña.');
      return;
    }
    try {
      setSavingPassword(true);
      setError('');
      setSuccess('');
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setSuccess('Contraseña actualizada correctamente.');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  // Solicita un código de verificación por correo para activar el segundo factor.
  const handleRequestEmail2FA = async () => {
    setError('');
    setSuccess('');
    setLoading2FA(true);
    try {
      const res = await authApi.resendVerification({ userId: user?.id, email: user?.email });
      setSuccess(res.message || 'Código de verificación enviado a tu correo.');
      setEmail2faStep('input');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading2FA(false);
    }
  };

  // Confirma el código de 6 dígitos recibido por correo para activar el segundo factor.
  const handleConfirmEmail2FA = async () => {
    if (!email2faCode.trim()) {
      setError('Ingresá el código de 6 dígitos recibido en tu correo.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading2FA(true);
    try {
      const res = await authApi.verifyEmail({ userId: user?.id, token: email2faCode.trim(), code: email2faCode.trim() });
      await refreshProfile();
      setSuccess(res.message || '¡Verificación en 2 pasos completada con éxito en tu cuenta!');
      setEmail2faStep('idle');
      setEmail2faCode('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading2FA(false);
    }
  };

  // Ejecuta la eliminación permanente de la cuenta del usuario actual.
  const handleDeleteAccount = async () => {
    try {
      await deleteOwnAccount({ password: deletePassword });
      setConfirmDelete(false);
    } catch (err) {
      setError(extractErrorMessage(err));
      setConfirmDelete(false);
    }
  };

  // Determina el nombre descriptivo del rol institucional del usuario.
  const roleName =
    user?.role === 'admin'
      ? 'Administrador Institucional'
      : user?.role === 'instructor'
      ? 'Docente'
      : user?.role === 'preceptor'
      ? 'Preceptor / Preceptora'
      : 'Estudiante';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            try {
              setRefreshing(true);
              if (refreshProfile) await refreshProfile();
            } catch {
              // Ignora errores de recarga silenciosa.
            } finally {
              setRefreshing(false);
            }
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={[styles.headerCard, { backgroundColor: colors.navy }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>
            {(user?.firstName?.[0] || 'S').toUpperCase()}
            {(user?.lastName?.[0] || 'T').toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerName, { color: colors.mode === 'light' ? colors.text : '#ffffff' }]}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={[styles.headerEmail, { color: colors.mode === 'light' ? colors.textSecondary : '#cbd5e1' }]}>{user?.email}</Text>
          <View style={styles.badgesRow}>
            <Badge label={roleName} tone="primary" />
            <Badge
              label={user?.emailVerified ? 'Email verificado' : 'Email pendiente'}
              tone={user?.emailVerified ? 'success' : 'warning'}
            />
          </View>
        </View>
      </View>

      <AlertBanner type="error" message={error} />
      <AlertBanner type="success" message={success} />

      <Card>
        <SectionHeader title="Datos personales y preferencias" />
        <Input
          label="Nombre"
          value={firstName}
          onChangeText={setFirstName}
          leftIcon="person-outline"
        />
        <Input
          label="Apellido"
          value={lastName}
          onChangeText={setLastName}
          leftIcon="person-outline"
        />
        <Input
          label="Correo electrónico (solo editable desde tu cuenta original)"
          value={email}
          onChangeText={setEmail}
          leftIcon="mail-outline"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Biografía académica / profesional"
          value={bio}
          onChangeText={setBio}
          placeholder="Contá brevemente tus intereses o especialidad..."
          multiline
          numberOfLines={3}
        />

        <View style={[styles.switchRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              Modo Oscuro del Campus
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Persiste tu preferencia visual en el dispositivo y en tu cuenta.
            </Text>
          </View>
          <Switch value={isDark} onValueChange={handleToggleTheme} />
        </View>

        <View style={[styles.switchRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              Notificaciones académicas
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Recibir avisos de entregas, calificaciones y anuncios.
            </Text>
          </View>
          <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
        </View>

        <Button
          title="Guardar cambios del perfil"
          icon="save-outline"
          loading={savingProfile}
          onPress={handleSaveProfile}
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Verificación en 2 pasos
          </Text>
          <Badge
            label={user?.twoFactorEnabled ? 'Activa y Verificada' : 'No verificada'}
            tone={user?.twoFactorEnabled ? 'success' : 'warning'}
          />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 14, lineHeight: 18 }}>
          {user?.twoFactorEnabled
            ? `Tu cuenta tiene activa la verificación en 2 pasos asociada a tu correo ${user?.email}. Tu acceso al Campus está protegido.`
            : `Tu cuenta no tiene la verificación en 2 pasos activa. Completala ahora recibiendo un código de 6 dígitos en tu correo (${user?.email}) para mantener tu cuenta segura.`}
        </Text>

        {!user?.twoFactorEnabled ? (
          email2faStep === 'idle' ? (
            <Button
              title="Verificación en 2 pasos"
              variant="primary"
              icon="shield-checkmark-outline"
              loading={loading2FA}
              onPress={handleRequestEmail2FA}
            />
          ) : (
            <View>
              <Input
                label="Código de 6 dígitos recibido por correo"
                value={email2faCode}
                onChangeText={setEmail2faCode}
                placeholder="Ingresá los 6 dígitos recibidos"
                keyboardType="numeric"
                autoCapitalize="none"
                maxLength={6}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Confirmar y Activar"
                    variant="success"
                    loading={loading2FA}
                    onPress={handleConfirmEmail2FA}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Reenviar código"
                    variant="outline"
                    loading={loading2FA}
                    onPress={handleRequestEmail2FA}
                  />
                </View>
              </View>
            </View>
          )
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Ionicons name="checkmark-done-circle" size={22} color="#16a34a" />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
              Identidad asegurada y verificada en 2 pasos
            </Text>
          </View>
        )}
      </Card>

      <Card>
        <SectionHeader title="Cambiar contraseña" />
        <Input
          label="Contraseña actual"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          leftIcon="lock-closed-outline"
        />
        <Input
          label="Nueva contraseña"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholder="Ingresá tu nueva contraseña"
          leftIcon="key-outline"
        />
        <Button
          title="Actualizar contraseña"
          variant="secondary"
          loading={savingPassword}
          onPress={handleChangePassword}
        />
      </Card>

      <Card>
        <SectionHeader title="Sesión y cuenta" />
        <Button
          title="Cerrar sesión en este dispositivo"
          variant="outline"
          icon="log-out-outline"
          onPress={() => setConfirmLogout(true)}
          style={{ marginBottom: 12 }}
        />
        <Input
          label="Contraseña para confirmar baja de cuenta (opcional si es OAuth)"
          value={deletePassword}
          onChangeText={setDeletePassword}
          secureTextEntry
        />
        <Button
          title="Eliminar mi cuenta permanentemente"
          variant="danger"
          icon="trash-outline"
          onPress={() => setConfirmDelete(true)}
        />
      </Card>

      <ConfirmModal
        visible={confirmLogout}
        title="Cerrar sesión"
        message="¿Querés cerrar tu sesión académica en este dispositivo?"
        confirmLabel="Cerrar sesión"
        variant="primary"
        onConfirm={async () => {
          setConfirmLogout(false);
          await logout();
        }}
        onCancel={() => setConfirmLogout(false)}
      />

      <ConfirmModal
        visible={confirmDelete}
        title="Eliminar cuenta"
        message="Esta acción eliminará permanentemente tu cuenta y revocará tus accesos en el Campus. ¿Confirmás la baja?"
        confirmLabel="Sí, eliminar"
        variant="danger"
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </ScrollView>
  );
}

// Define los estilos visuales de la pantalla de perfil.
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  headerCard: {
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  headerName: { color: '#ffffff', fontSize: 19, fontWeight: '800' },
  headerEmail: { color: '#cbd5e1', fontSize: 13, marginTop: 2 },
  badgesRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    marginTop: 6,
  },
});
