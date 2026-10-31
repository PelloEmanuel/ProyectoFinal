import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { adminApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import { formatDateAR } from '../../utils/dates';
import {
  AlertBanner,
  Badge,
  Card,
  Chip,
  EmptyState,
  ProgressBar,
  SectionHeader,
} from '../../components/ui';

export default function AdminReportsScreen() {
  const { colors } = useTheme();
  const [reportType, setReportType] = useState('completion'); // completion | enrollments | users | audit
  const [reportData, setReportData] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadReport = useCallback(async (isRefresh = false) => {
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

  useFocusEffect(
    useCallback(() => {
      loadReport(false);
    }, [loadReport])
  );

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
        (reportData?.rows || []).map((row) => (
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
        (reportData?.rows || []).map((row, idx) => (
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
        (reportData?.rows || []).map((row, idx) => (
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  filterRow: { flexDirection: 'row', gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800', marginTop: 8 },
});
