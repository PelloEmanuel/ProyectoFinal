import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { adminApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import {
  AlertBanner,
  Button,
  Card,
  Input,
  SectionHeader,
} from '../../components/ui';

export default function AdminSettingsScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const [settings, setSettings] = useState({
    instructor_registration_key: 'DOCENTE2026',
    preceptor_registration_key: 'PRECEPTOR2026',
    institution_name: 'SkillTrack Academy',
    support_email: 'soporte@skilltrack.edu',
    allow_public_registration: 'true',
    require_email_verification: 'false',
    default_passing_score: '70',
    certificate_issuer_title: 'Dirección Académica SkillTrack',
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadSettings = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      const res = await adminApi.getSettings();
      const map = (res && typeof res === 'object' && res.data ? res.data : res) || {};
      setSettings((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(map).map(([k, v]) => [k, String(v?.value ?? v ?? '')])
        ),
      }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings(false);
    }, [loadSettings])
  );

  const handleSave = async (customMessage = 'Configuración académica guardada correctamente.') => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await adminApi.updateSettings(settings);
      setSuccess(customMessage);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const passingScoreNum = Number(settings.default_passing_score) || 60;
  const passingScoreTen = (passingScoreNum / 10).toFixed(1);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadSettings(true)}
          tintColor={colors.primary}
        />
      }
    >
      <SectionHeader
        title="Panel de Administrador"
        subtitle="Gestión de clave docente, institución y configuración de SkillTrack"
      />

      <AlertBanner type="error" message={error} />
      <AlertBanner type="success" message={success} />

      {/* ==================================================================== */}
      {/* 1. CLAVE DE HABILITACIÓN PARA DOCENTES                                */}
      {/* ==================================================================== */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="key-outline" size={22} color="#d97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 2 }]}>
              Clave de Habilitación para Docentes
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Código institucional requerido para que los profesores puedan registrarse en la plataforma
            </Text>
          </View>
        </View>

        {/* Badge con la clave activa */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isDark ? '#1e293b' : '#fffbeb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: isDark ? '#d9770640' : '#fde68a',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="shield-checkmark" size={20} color="#d97706" />
            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                CLAVE VIGENTE EN EL SERVIDOR:
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#fbbf24' : '#b45309', letterSpacing: 1.2 }}>
                {settings.instructor_registration_key || 'SIN DEFINIR'}
              </Text>
            </View>
          </View>
        </View>

        <Input
          label="Nueva Clave de registro para Docentes *"
          value={settings.instructor_registration_key}
          onChangeText={(v) => setSettings((p) => ({ ...p, instructor_registration_key: v }))}
          placeholder="Ej. DOCENTE2026"
          autoCapitalize="characters"
        />

        <Button
          title="Guardar clave de docentes"
          icon="key-outline"
          loading={saving}
          onPress={() => handleSave('Clave de habilitación para docentes guardada con éxito.')}
          style={{ marginTop: 4 }}
        />
      </Card>

      {/* ==================================================================== */}
      {/* 2. CLAVE DE HABILITACIÓN PARA PRECEPTORES                            */}
      {/* ==================================================================== */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="clipboard-outline" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 2 }]}>
              Clave de Habilitación para Preceptores
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Código institucional requerido para que las personas de la institución puedan registrarse como preceptores
            </Text>
          </View>
        </View>

        {/* Badge con la clave activa */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isDark ? '#1e293b' : '#eff6ff',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: isDark ? '#6366f140' : '#bfdbfe',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                CLAVE VIGENTE EN EL SERVIDOR:
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#a5b4fc' : colors.primary, letterSpacing: 1.2 }}>
                {settings.preceptor_registration_key || 'SIN DEFINIR'}
              </Text>
            </View>
          </View>
        </View>

        <Input
          label="Nueva Clave de registro para Preceptores *"
          value={settings.preceptor_registration_key}
          onChangeText={(v) => setSettings((p) => ({ ...p, preceptor_registration_key: v }))}
          placeholder="Ej. PRECEPTOR2026"
          autoCapitalize="characters"
        />

        <Button
          title="Guardar clave de preceptores"
          icon="save-outline"
          loading={saving}
          onPress={() => handleSave('Clave de habilitación para preceptores guardada con éxito.')}
          style={{ marginTop: 4 }}
        />
      </Card>

      {/* ==================================================================== */}
      {/* 3. PARÁMETROS INSTITUCIONALES DEL CAMPUS                             */}
      {/* ==================================================================== */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="business-outline" size={22} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 2 }]}>
              Identidad y Parámetros del Campus
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Datos de la institución escolar y políticas de alta de usuarios
            </Text>
          </View>
        </View>

        <Input
          label="Nombre de la institución escolar"
          value={settings.institution_name}
          onChangeText={(v) => setSettings((p) => ({ ...p, institution_name: v }))}
          placeholder="Ej. Escuela de Educación Secundaria Técnica N° 5"
        />
        <Input
          label="Correo electrónico de soporte académico"
          value={settings.support_email}
          onChangeText={(v) => setSettings((p) => ({ ...p, support_email: v }))}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="soporte@escuela.edu.ar"
        />
        <Input
          label="Cargo firmante en actas y constancias"
          value={settings.certificate_issuer_title}
          onChangeText={(v) => setSettings((p) => ({ ...p, certificate_issuer_title: v }))}
          placeholder="Dirección y Regencia Académica"
        />

        <View style={[styles.switchRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              Permitir registro público de estudiantes
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Habilita a los alumnos a registrarse ellos mismos desde la portada.
            </Text>
          </View>
          <Switch
            value={settings.allow_public_registration === 'true'}
            onValueChange={(val) =>
              setSettings((p) => ({ ...p, allow_public_registration: val ? 'true' : 'false' }))
            }
          />
        </View>

        <Button
          title="Guardar datos del campus"
          icon="save-outline"
          loading={saving}
          onPress={() => handleSave('Datos institucionales actualizados correctamente.')}
          style={{ marginTop: 14 }}
        />
      </Card>

      {/* ==================================================================== */}
      {/* 4. MI CUENTA DE ADMINISTRADOR                                         */}
      {/* ==================================================================== */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          Mi cuenta de administrador y seguridad
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
          Accedé a tu perfil personal, configuración de doble factor TOTP (2FA), sesiones activas y cambio de contraseña.
        </Text>
        <Button
          title="Abrir mi Perfil y Seguridad (2FA / Sesiones)"
          variant="secondary"
          icon="person-circle-outline"
          onPress={() => navigation.navigate('Profile')}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    marginTop: 6,
  },
});
