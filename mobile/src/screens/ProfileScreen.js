import React, { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authApi } from '../api/services';
import { extractErrorMessage } from '../utils/errors';
import { formatDateAR } from '../utils/dates';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  ConfirmModal,
  Input,
  SectionHeader,
} from '../components/ui';

export default function ProfileScreen({ navigation }) {
  const {
    user,
    updateProfile,
    changePassword,
    setup2FA,
    confirm2FA,
    disable2FA,
    logout,
    deleteOwnAccount,
    refreshProfile,
  } = useAuth();
  const { colors, isDark, setThemePreference } = useTheme();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.notificationsEnabled !== false
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // 2FA TOTP state
  const [totpSetup, setTotpSetup] = useState(null); // { secret, otpauthUrl }
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [loading2FA, setLoading2FA] = useState(false);

  // Modals & messages
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
        username: username.trim() || undefined,
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

  const handleToggleTheme = async (val) => {
    const nextPref = val ? 'dark' : 'light';
    await setThemePreference(nextPref);
    try {
      await updateProfile({ themePreference: nextPref });
    } catch {
      // local preference already saved
    }
  };

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

  const handleStart2FA = async () => {
    try {
      setLoading2FA(true);
      setError('');
      setSuccess('');
      const data = await setup2FA();
      setTotpSetup(data);
      setRecoveryCodes(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading2FA(false);
    }
  };

  const handleConfirm2FA = async () => {
    if (!totpCode.trim()) {
      setError('Ingresá el código de 6 dígitos generado por tu app autenticadora.');
      return;
    }
    try {
      setLoading2FA(true);
      setError('');
      const data = await confirm2FA(totpCode.trim());
      setRecoveryCodes(data?.recoveryCodes || []);
      setTotpSetup(null);
      setTotpCode('');
      setSuccess('Autenticación en 2 pasos (TOTP) activada. Guardá tus códigos de respaldo.');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disablePassword.trim()) {
      setError('Ingresá tu contraseña o código TOTP para desactivar 2FA.');
      return;
    }
    try {
      setLoading2FA(true);
      setError('');
      await disable2FA({ password: disablePassword.trim(), code: disablePassword.trim() });
      setDisablePassword('');
      setRecoveryCodes(null);
      setSuccess('Autenticación de dos factores desactivada.');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading2FA(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteOwnAccount({ password: deletePassword });
      setConfirmDelete(false);
    } catch (err) {
      setError(extractErrorMessage(err));
      setConfirmDelete(false);
    }
  };

  const roleName =
    user?.role === 'admin'
      ? 'Administrador Institucional'
      : user?.role === 'instructor'
      ? 'Instructor / Docente'
      : 'Estudiante';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            await refreshProfile();
            await loadSessions(true);
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Profile Header */}
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

      {/* Personal Data & Preferences */}
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
          label="Nombre de usuario (opcional)"
          value={username}
          onChangeText={setUsername}
          leftIcon="at-outline"
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
              Modo Oscuro de SkillTrack
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

      {/* Two-Factor Authentication (RFC 6238 TOTP) */}
      <Card>
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Verificación en 2 pasos (TOTP 2FA)
          </Text>
          <Badge
            label={user?.twoFactorEnabled ? 'Activo' : 'Inactivo'}
            tone={user?.twoFactorEnabled ? 'success' : 'neutral'}
          />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 12 }}>
          Protegé tu cuenta con códigos temporales RFC 6238 compatibles con Google Authenticator, Authy o Microsoft Authenticator.
        </Text>

        {!user?.twoFactorEnabled ? (
          totpSetup ? (
            <View>
              <View style={[styles.secretBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>
                  CLAVE SECRETA MANUAL (BASE32):
                </Text>
                <Text selectable style={{ color: colors.primary, fontSize: 16, fontWeight: '800', marginTop: 4 }}>
                  {totpSetup.secret}
                </Text>
                <Text selectable style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
                  URI: {totpSetup.otpauthUrl}
                </Text>
              </View>
              <Input
                label="Código de 6 dígitos generado por tu app"
                value={totpCode}
                onChangeText={setTotpCode}
                placeholder="123456"
                keyboardType="numeric"
              />
              <Button
                title="Confirmar y activar 2FA"
                variant="success"
                loading={loading2FA}
                onPress={handleConfirm2FA}
              />
            </View>
          ) : (
            <Button
              title="Configurar 2FA (TOTP)"
              variant="outline"
              icon="shield-checkmark-outline"
              loading={loading2FA}
              onPress={handleStart2FA}
            />
          )
        ) : (
          <View>
            <Input
              label="Contraseña o código actual para desactivar 2FA"
              value={disablePassword}
              onChangeText={setDisablePassword}
              secureTextEntry
            />
            <Button
              title="Desactivar 2FA"
              variant="danger"
              loading={loading2FA}
              onPress={handleDisable2FA}
            />
          </View>
        )}

        {recoveryCodes && recoveryCodes.length > 0 && (
          <View style={[styles.secretBox, { backgroundColor: colors.warningSoft, borderColor: colors.warning, marginTop: 12 }]}>
            <Text style={{ color: colors.warning, fontWeight: '800', fontSize: 13 }}>
              Códigos de recuperación de un solo uso (guardalos en un lugar seguro):
            </Text>
            <Text selectable style={{ color: colors.text, fontWeight: '700', marginTop: 6 }}>
              {recoveryCodes.join('   •   ')}
            </Text>
          </View>
        )}
      </Card>

      {/* Change Password */}
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
          label="Nueva contraseña (mín. 8 caracteres, mayús., minús., número y símbolo)"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          leftIcon="key-outline"
        />
        <Button
          title="Actualizar contraseña"
          variant="secondary"
          loading={savingPassword}
          onPress={handleChangePassword}
        />
      </Card>

      {/* Account Actions */}
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
        message="Esta acción eliminará permanentemente tu cuenta y revocará tus accesos en SkillTrack. ¿Confirmás la baja?"
        confirmLabel="Sí, eliminar"
        variant="danger"
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </ScrollView>
  );
}

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
  secretBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
