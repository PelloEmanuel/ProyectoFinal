// Importa los hooks de React para estado y callbacks.
import React, { useCallback, useState } from 'react';
// Importa los componentes visuales nativos de React Native.
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// Importa el hook de foco de navegación.
import { useFocusEffect } from '@react-navigation/native';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa el servicio de API de administración.
import { adminApi } from '../../api/servicios';
// Importa la utilidad para extraer mensajes de error.
import { extractErrorMessage } from '../../utilidades/errores';
// Importa el formateador de fechas al estándar argentino.
import { formatDateAR } from '../../utilidades/fechas';
// Importa los componentes reutilizables de la interfaz.
import {
  AlertBanner,
  Badge,
  Card,
  Chip,
  EmptyState,
  ProgressBar,
  SectionHeader,
} from '../../componentes/interfaz';

// Renderiza la pantalla de reportes estadísticos y bitácora de auditoría institucional.
export default function AdminReportsScreen() {
  // Obtiene la paleta de colores activa.
  const { colors } = useTheme();
  // Estados para el tipo de reporte seleccionado, filas de datos y registros de auditoría.
  const [reportType, setReportType] = useState<string>('completion');
  const [reportData, setReportData] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Consulta al servidor el reporte estadístico o los registros de auditoría solicitados.
  const loadReport = useCallback(async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      if (reportType === 'audit') {
        const res = await adminApi.getAuditLogs({ limit: 50 });
        setAuditLogs(res.data.data || []);
      } else {
        const res = await adminApi.getReports(reportType);
        setReportData(res.data.data);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reportType]);

  // Recarga el reporte cuando la pantalla obtiene foco.
  useFocusEffect(
    useCallback(() => {
      loadReport(false);
    }, [loadReport])
  );

  // Renderiza la vista de reportes y auditoría con selector de categorías.
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadReport(true)}
          tintColor={colors.primary}
        />
      }
    >
      <SectionHeader
        title="Reportes y auditoría"
        subtitle="Indicadores verificables basados en consultas SQL en tiempo real"
      />

      <AlertBanner type="error" message={error} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={styles.filterRow}>
          {[
            { key: 'completion', label: 'Rendimiento por curso' },
            { key: 'enrollments', label: 'Matrícula e inscripciones' },
            { key: 'users', label: 'Estado de cuentas' },
            { key: 'audit', label: 'Bitácora de auditoría' },
          ].map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              selected={reportType === item.key}
              onPress={() => setReportType(item.key)}
            />
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 28 }} />
      ) : reportType === 'audit' ? (
        auditLogs.length === 0 ? (
          <EmptyState
            icon="shield-outline"
            title="Sin registros de auditoría"
            message="Las acciones relevantes de seguridad y administración aparecerán aquí."
          />
        ) : (
          auditLogs.map((log) => (
            <Card key={log.id}>
              <View style={styles.rowBetween}>
                <Badge label={log.action} tone="primary" />
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {formatDateAR(log.createdAt, true)}
                </Text>
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                Entidad: {log.entityType} {log.entityId ? `#${log.entityId}` : ''}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Usuario: {log.actorEmail || 'Sistema'} • IP: {log.ipAddress || 'local'}
              </Text>
            </Card>
          ))
        )
      ) : reportType === 'completion' ? (
        (reportData?.rows || []).map((row: any) => (
          <Card key={row.courseId}>
            <View style={styles.rowBetween}>
              <Badge label={row.categoryName || 'General'} tone="info" />
              <Badge
                label={`${row.completedCount || 0}/${row.totalEnrolled || 0} graduados`}
                tone="success"
              />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{row.courseTitle}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              Docente: {row.instructorName}
            </Text>
          </Card>
        ))
      ) : reportType === 'enrollments' ? (
        (reportData?.rows || []).map((row: any, idx: number) => (
          <Card key={row.enrollmentId || idx}>
            <View style={styles.rowBetween}>
              <Badge label={row.courseTitle} tone="primary" />
              <Badge
                label={row.status === 'completed' ? 'Finalizado' : 'Activo'}
                tone={row.status === 'completed' ? 'success' : 'info'}
              />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>
              {row.studentName} ({row.studentEmail})
            </Text>
            <View style={{ marginTop: 8 }}>
              <ProgressBar progress={row.progressPercent || 0} label="Progreso" />
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
              Inscripto el: {formatDateAR(row.enrolledAt)}
            </Text>
          </Card>
        ))
      ) : (
        (reportData?.rows || []).map((row: any, idx: number) => (
          <Card key={idx}>
            <View style={styles.rowBetween}>
              <Badge label={`Rol: ${row.role}`} tone="primary" />
              <Badge
                label={`Estado: ${row.status}`}
                tone={row.status === 'active' ? 'success' : 'danger'}
              />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>
              Total de usuarios en este segmento: {row.totalUsers}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
              Con email verificado: {row.verifiedUsers || 0} • Con 2FA activo: {row.twoFactorUsers || 0}
            </Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

// Define la hoja de estilos visuales de la pantalla de reportes.
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  filterRow: { flexDirection: 'row', gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800', marginTop: 8 },
});
