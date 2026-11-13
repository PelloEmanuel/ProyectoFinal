// Importa los hooks de React para estado y callbacks.
import React, { useCallback, useState } from 'react';
// Importa los componentes visuales nativos de React Native.
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
// Importa el hook de foco de navegación.
import { useFocusEffect } from '@react-navigation/native';
// Importa la librería de íconos Ionicons.
import { Ionicons } from '@expo/vector-icons';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa el servicio de API de administración.
import { adminApi } from '../../api/servicios';
// Importa la utilidad para extraer mensajes de error.
import { extractErrorMessage } from '../../utilidades/errores';
// Importa los componentes reutilizables de la interfaz.
import {
  AlertBanner,
  Button,
  Card,
  Input,
  SectionHeader,
} from '../../componentes/interfaz';

// Define las propiedades recibidas por la pantalla de ajustes administrativos.
interface PropiedadesPantallaAjustesAdmin {
  navigation: any;
}

// Renderiza el panel de configuración institucional y claves de alta de personal.
export default function AdminSettingsScreen({ navigation }: PropiedadesPantallaAjustesAdmin) {
  // Obtiene la paleta de colores y el indicador de modo oscuro.
  const { colors, isDark } = useTheme();
  // Almacena el mapa de ajustes institucionales del servidor.
  const [settings, setSettings] = useState<Record<string, string>>({
    instructor_registration_key: 'DOCENTE2026',
    preceptor_registration_key: 'PRECEPTOR2026',
    institution_name: 'Campus Técnica 5',
    support_email: 'soporte@campus.edu',
    allow_public_registration: 'true',
    require_email_verification: 'false',
    default_passing_score: '70',
    certificate_issuer_title: 'Dirección Académica del Campus',
  });
  // Estados para control de carga, guardado y mensajes.
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Consulta al servidor los parámetros actuales de configuración institucional.
  const loadSettings = useCallback(async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      const res = await adminApi.getSettings();
      const map = (res && typeof res === 'object' && res.data ? res.data : res) || {};
      setSettings((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(map).map(([k, v]: [string, any]) => [k, String(v?.value ?? v ?? '')])
        ),
      }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recarga la configuración cada vez que la pantalla gana foco.
  useFocusEffect(
    useCallback(() => {
      loadSettings(false);
    }, [loadSettings])
  );

  // Guarda los parámetros actualizados en el servidor.
  const handleSave = async (customMessage: string = 'Configuración académica guardada correctamente.'): Promise<void> => {
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

  // Muestra el indicador de carga mientras se obtienen los ajustes iniciales.
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Renderiza los formularios de claves institucionales y parámetros del campus.
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
        subtitle="Gestión de clave docente, institución y configuración del Campus"
      />

      <AlertBanner type="error" message={error} />
      <AlertBanner type="success" message={success} />

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
          onChangeText={(v: string) => setSettings((p) => ({ ...p, instructor_registration_key: String(v || '').toUpperCase() }))}
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
          onChangeText={(v: string) => setSettings((p) => ({ ...p, preceptor_registration_key: String(v || '').toUpperCase() }))}
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
          onChangeText={(v: string) => setSettings((p) => ({ ...p, institution_name: v }))}
          placeholder="Ej. Escuela de Educación Secundaria Técnica N° 5"
        />
        <Input
          label="Correo electrónico de soporte académico"
          value={settings.support_email}
          onChangeText={(v: string) => setSettings((p) => ({ ...p, support_email: v }))}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="soporte@escuela.edu.ar"
        />
        <Input
          label="Cargo firmante en actas y constancias"
          value={settings.certificate_issuer_title}
          onChangeText={(v: string) => setSettings((p) => ({ ...p, certificate_issuer_title: v }))}
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
            onValueChange={(val: boolean) =>
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

// Define la hoja de estilos visuales de la pantalla de ajustes administrativos.
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
