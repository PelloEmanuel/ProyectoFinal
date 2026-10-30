/**
 * Archivo: mobile/src/screens/admin/UsersScreen.js
 * Descripción: Gestión de Usuarios desde el Panel de Administrador.
 * - Permite crear nuevos usuarios institucionales (`created_by_admin = 1`).
 * - Permite editar (nombre, apellido, correo electrónico, contraseña, rol) y eliminar
 *   ÚNICAMENTE a los usuarios que hayan sido creados por el administrador (`u.createdByAdmin === true`).
 * - Si el usuario se registró por su propia cuenta (`u.createdByAdmin === false`), no permite editarlo
 *   ni eliminarlo desde aquí, ya que únicamente el usuario original puede modificar su propio correo o contraseña.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usersApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import { formatDateAR } from '../../utils/dates';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Chip,
  ConfirmModal,
  EmptyState,
  Input,
  SectionHeader,
} from '../../components/ui';

export default function UsersScreen() {
  const { user: currentUser } = useAuth();
  const { colors } = useTheme();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create user modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: 'Password123!',
    role: 'instructor',
  });
  const [creating, setCreating] = useState(false);

  // Edit user modal
  const [editUserTarget, setEditUserTarget] = useState(null);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'student',
    status: 'active',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation (only for users created by Admin)
  const [userToDelete, setUserToDelete] = useState(null);

  const loadUsers = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      const res = await usersApi.list({
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      setUsers(res.data.data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, roleFilter, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      loadUsers(false);
    }, [loadUsers])
  );

  const handleCreateUser = async () => {
    if (!createForm.firstName.trim() || !createForm.lastName.trim() || !createForm.email.trim()) {
      setError('Completá nombre, apellido y correo electrónico.');
      return;
    }
    try {
      setCreating(true);
      setError('');
      await usersApi.create({
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
      });
      setSuccess(`Usuario ${createForm.email.trim()} creado por el administrador.`);
      setCreateOpen(false);
      setCreateForm({
        firstName: '',
        lastName: '',
        email: '',
        password: 'Password123!',
        role: 'instructor',
      });
      await loadUsers(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const openEditUserModal = (targetUser) => {
    setError('');
    setSuccess('');
    setEditUserTarget(targetUser);
    setEditForm({
      firstName: targetUser.firstName || '',
      lastName: targetUser.lastName || '',
      email: targetUser.email || '',
      password: '',
      role: targetUser.role || 'student',
      status: targetUser.status || 'active',
    });
  };

  const handleSaveEditUser = async () => {
    if (!editUserTarget) return;
    try {
      setSavingEdit(true);
      setError('');
      let payload = {};

      if (editUserTarget.createdByAdmin) {
        if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.email.trim()) {
          setError('El nombre, apellido y correo electrónico son obligatorios.');
          setSavingEdit(false);
          return;
        }
        payload = {
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          email: editForm.email.trim(),
          role: editForm.role,
          status: editForm.status,
        };
        if (editForm.password.trim()) {
          payload.password = editForm.password.trim();
        }
      } else {
        // Para usuarios de registro propio: se permite modificar rol y estado (activo/suspendido)
        payload = {
          role: editForm.role,
          status: editForm.status,
        };
      }

      await usersApi.update(editUserTarget.id, payload);
      setSuccess(`Usuario "${editUserTarget.email}" actualizado correctamente.`);
      setEditUserTarget(null);
      await loadUsers(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (targetUser) => {
    const nextStatus = targetUser.status === 'active' ? 'suspended' : 'active';
    try {
      setError('');
      await usersApi.updateStatus(targetUser.id, nextStatus);
      setSuccess(
        `Cuenta de ${targetUser.email} ${nextStatus === 'active' ? 'activada' : 'suspendida'}.`
      );
      await loadUsers(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      setError('');
      await usersApi.remove(userToDelete.id);
      setSuccess(`Usuario ${userToDelete.email} eliminado.`);
      setUserToDelete(null);
      await loadUsers(true);
    } catch (err) {
      setError(extractErrorMessage(err));
      setUserToDelete(null);
    }
  };

  const getRoleBadge = (role) => {
    if (role === 'admin') return { label: 'Administrador', tone: 'danger' };
    if (role === 'preceptor') return { label: 'Preceptor/a', tone: 'warning' };
    if (role === 'instructor') return { label: 'Instructor / Docente', tone: 'primary' };
    return { label: 'Estudiante', tone: 'info' };
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadUsers(true)}
            tintColor={colors.primary}
          />
        }
      >
        <SectionHeader
          title="Gestión de usuarios"
          subtitle="Creá cuentas institucionales y editá o eliminá aquellas creadas por administración"
          actionLabel="+ Nuevo usuario"
          onAction={() => setCreateOpen(true)}
        />

        <AlertBanner type="error" message={error} />
        <AlertBanner type="success" message={success} />

        <Input
          placeholder="Buscar por nombre, apellido, usuario o email..."
          value={search}
          onChangeText={setSearch}
          leftIcon="search-outline"
        />

        {/* Role filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={styles.filterRow}>
            {[
              { key: '', label: 'Todos los roles' },
              { key: 'student', label: 'Estudiantes' },
              { key: 'preceptor', label: 'Preceptores' },
              { key: 'instructor', label: 'Instructores' },
              { key: 'admin', label: 'Administradores' },
            ].map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                selected={roleFilter === item.key}
                onPress={() => setRoleFilter(item.key)}
              />
            ))}
          </View>
        </ScrollView>

        {/* Status filter */}
        <View style={[styles.filterRow, { marginBottom: 14 }]}>
          {[
            { key: '', label: 'Cualquier estado' },
            { key: 'active', label: 'Activos' },
            { key: 'suspended', label: 'Suspendidos' },
          ].map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              selected={statusFilter === item.key}
              onPress={() => setStatusFilter(item.key)}
            />
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 28 }} />
        ) : users.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Sin usuarios coincidentes"
            message="Ajustá los filtros de búsqueda o creá un nuevo usuario institucional."
          />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {users.map((u) => {
              const rBadge = getRoleBadge(u.role);
              const isSelf = u.id === currentUser?.id;
              const canAdminEditOrDelete = Boolean(u.createdByAdmin) && !isSelf;

              return (
                <View
                  key={u.id}
                  style={{
                    width: Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : '100%',
                    minWidth: 280,
                    flexGrow: 1,
                  }}
                >
                  <Card style={{ height: '100%', marginBottom: 0, justifyContent: 'space-between' }}>
                    <View>
                      <View style={[styles.rowBetween, { flexWrap: 'wrap', gap: 6 }]}>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          <Badge label={rBadge.label} tone={rBadge.tone} />
                          <Badge
                            label={u.createdByAdmin ? 'Creado por Admin' : 'Registro propio'}
                            tone={u.createdByAdmin ? 'primary' : 'neutral'}
                          />
                        </View>
                        <Badge
                          label={u.status === 'active' ? 'Activo' : 'Suspendido'}
                          tone={u.status === 'active' ? 'success' : 'danger'}
                        />
                      </View>

                      <Text style={[styles.name, { color: colors.text, marginTop: 8 }]}>
                        {u.firstName} {u.lastName} {isSelf ? '(Vos)' : ''}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{u.email}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                        Alta: {formatDateAR(u.createdAt)} • Verificado: {u.emailVerified ? 'Sí' : 'No'} • 2FA: {u.twoFactorEnabled ? 'Activo' : 'Inactivo'}
                      </Text>
                    </View>

                    {!isSelf && (
                      <View style={{ marginTop: 14 }}>
                        <View style={styles.actionsRow}>
                          <Button
                            title={u.createdByAdmin ? 'Editar' : 'Editar rol'}
                            variant="primary"
                            icon="create-outline"
                            onPress={() => openEditUserModal(u)}
                            style={{ flex: 1, minHeight: 38, paddingVertical: 8, marginBottom: 0 }}
                          />
                          <Button
                            title={u.status === 'active' ? 'Suspender' : 'Reactivar'}
                            variant={u.status === 'active' ? 'outline' : 'success'}
                            icon={u.status === 'active' ? 'ban-outline' : 'checkmark-circle-outline'}
                            onPress={() => handleToggleStatus(u)}
                            style={{ flex: 1, minHeight: 38, paddingVertical: 8, marginBottom: 0 }}
                          />
                          {canAdminEditOrDelete && (
                            <Button
                              title=""
                              variant="danger"
                              icon="trash-outline"
                              onPress={() => setUserToDelete(u)}
                              style={{ minHeight: 38, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 0 }}
                            />
                          )}
                        </View>
                        {!u.createdByAdmin && (
                          <View
                            style={{
                              marginTop: 8,
                              padding: 8,
                              borderRadius: 8,
                              backgroundColor: colors.surfaceAlt || colors.background,
                              borderWidth: 1,
                              borderColor: colors.border,
                              flexDirection: 'row',
                              alignItems: 'center',
                            }}
                          >
                            <Ionicons
                              name="information-circle-outline"
                              size={15}
                              color={colors.primary}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={{ flex: 1, fontSize: 11, color: colors.textSecondary }}>
                              Registro propio: solo rol y estado modificables.
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </Card>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal: Create User (Created by Admin = 1) */}
      <Modal visible={createOpen} animationType="slide" transparent>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <ScrollView>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Alta institucional de usuario (Creado por Admin)
              </Text>
              <Input
                label="Nombre *"
                value={createForm.firstName}
                onChangeText={(v) => setCreateForm((p) => ({ ...p, firstName: v }))}
                placeholder="Ej. Roberto"
              />
              <Input
                label="Apellido *"
                value={createForm.lastName}
                onChangeText={(v) => setCreateForm((p) => ({ ...p, lastName: v }))}
                placeholder="Ej. Gómez"
              />
              <Input
                label="Correo electrónico *"
                value={createForm.email}
                onChangeText={(v) => setCreateForm((p) => ({ ...p, email: v }))}
                placeholder="docente@skilltrack.edu"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Input
                label="Contraseña inicial *"
                value={createForm.password}
                onChangeText={(v) => setCreateForm((p) => ({ ...p, password: v }))}
              />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Rol asignado</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {[
                  { key: 'student', label: 'Estudiante' },
                  { key: 'preceptor', label: 'Preceptor/a' },
                  { key: 'instructor', label: 'Instructor' },
                  { key: 'admin', label: 'Administrador' },
                ].map((r) => (
                  <Chip
                    key={r.key}
                    label={r.label}
                    selected={createForm.role === r.key}
                    onPress={() => setCreateForm((p) => ({ ...p, role: r.key }))}
                  />
                ))}
              </View>
              <View style={styles.actionsRow}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setCreateOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Crear cuenta"
                  loading={creating}
                  onPress={handleCreateUser}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Edit User (Only for users created by Admin) */}
      <Modal
        visible={Boolean(editUserTarget)}
        animationType="slide"
        transparent
        onRequestClose={() => setEditUserTarget(null)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <ScrollView>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editUserTarget?.createdByAdmin
                  ? 'Editar usuario institucional'
                  : 'Gestionar rol y estado de usuario'}
              </Text>
              <AlertBanner type="error" message={error} />

              {!editUserTarget?.createdByAdmin ? (
                <View
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: colors.surfaceAlt || colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                    {editUserTarget?.firstName} {editUserTarget?.lastName}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    {editUserTarget?.email}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
                    ℹ️ Cuenta registrada por el propio usuario. Los datos personales, correo electrónico y contraseña son privados. Podés cambiar su rol institucional (estudiante/docente) y suspender o reactivar su acceso.
                  </Text>
                </View>
              ) : (
                <>
                  <Input
                    label="Nombre *"
                    value={editForm.firstName}
                    onChangeText={(v) => setEditForm((p) => ({ ...p, firstName: v }))}
                    placeholder="Nombre"
                  />
                  <Input
                    label="Apellido *"
                    value={editForm.lastName}
                    onChangeText={(v) => setEditForm((p) => ({ ...p, lastName: v }))}
                    placeholder="Apellido"
                  />
                  <Input
                    label="Correo electrónico *"
                    value={editForm.email}
                    onChangeText={(v) => setEditForm((p) => ({ ...p, email: v }))}
                    placeholder="correo@ejemplo.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Input
                    label="Nueva contraseña (dejar vacío para mantener la actual)"
                    value={editForm.password}
                    onChangeText={(v) => setEditForm((p) => ({ ...p, password: v }))}
                    placeholder="Ingresá solo si querés cambiarla"
                    secureTextEntry
                  />
                </>
              )}

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Rol institucional *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {[
                  { key: 'student', label: 'Estudiante' },
                  { key: 'preceptor', label: 'Preceptor/a' },
                  { key: 'instructor', label: 'Docente / Instructor' },
                  { key: 'admin', label: 'Administrador' },
                ].map((r) => (
                  <Chip
                    key={r.key}
                    label={r.label}
                    selected={editForm.role === r.key}
                    onPress={() => setEditForm((p) => ({ ...p, role: r.key }))}
                  />
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Estado de la cuenta *</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {[
                  { key: 'active', label: 'Activo' },
                  { key: 'suspended', label: 'Suspendido' },
                ].map((s) => (
                  <Chip
                    key={s.key}
                    label={s.label}
                    selected={editForm.status === s.key}
                    onPress={() => setEditForm((p) => ({ ...p, status: s.key }))}
                  />
                ))}
              </View>

              <View style={styles.actionsRow}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setEditUserTarget(null)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Guardar cambios"
                  loading={savingEdit}
                  onPress={handleSaveEditUser}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={Boolean(userToDelete)}
        title="Eliminar usuario"
        message={`¿Confirmás la eliminación permanente de la cuenta "${userToDelete?.email}" creada por el administrador?`}
        confirmLabel="Eliminar cuenta"
        onConfirm={handleDeleteUser}
        onCancel={() => setUserToDelete(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.7)' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
});
