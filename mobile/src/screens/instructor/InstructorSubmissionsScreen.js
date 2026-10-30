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
import { useTheme } from '../../context/ThemeContext';
import { assignmentsApi, instructorApi } from '../../api/services';
import { extractErrorMessage } from '../../utils/errors';
import { formatDateAR } from '../../utils/dates';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  SectionHeader,
} from '../../components/ui';

export default function InstructorSubmissionsScreen() {
  const { colors } = useTheme();
  const [submissions, setSubmissions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('submitted'); // '' | 'submitted' | 'graded'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Grading modal state
  const [gradingItem, setGradingItem] = useState(null);
  const [score, setScore] = useState('85');
  const [feedback, setFeedback] = useState('');
  const [gradeStatus, setGradeStatus] = useState('graded');
  const [submittingGrade, setSubmittingGrade] = useState(false);

  const loadSubmissions = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      const res = await instructorApi.getSubmissions({
        status: statusFilter || undefined,
      });
      setSubmissions(res.data.data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      loadSubmissions(false);
    }, [loadSubmissions])
  );

  const openGradeModal = (sub) => {
    setGradingItem(sub);
    setScore(sub.score !== null && sub.score !== undefined ? String(sub.score) : '85');
    setFeedback(
      sub.feedback ||
        'Excelente desarrollo conceptual y aplicación práctica de los criterios evaluados.'
    );
    setGradeStatus('graded');
  };

  const handleSaveGrade = async () => {
    if (!gradingItem) return;
    const numericScore = Number(score);
    if (Number.isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
      setError('Ingresá una calificación numérica válida entre 0 y 100.');
      return;
    }
    try {
      setSubmittingGrade(true);
      setError('');
      await assignmentsApi.gradeAttempt(gradingItem.attemptId, {
        score: numericScore,
        feedback: feedback.trim() || 'Actividad evaluada por el docente.',
        status: gradeStatus,
      });
      setSuccess(`Entrega de ${gradingItem.studentName} calificada con ${numericScore}%.`);
      setGradingItem(null);
      await loadSubmissions(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmittingGrade(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadSubmissions(true)}
            tintColor={colors.primary}
          />
        }
      >
        <SectionHeader
          title="Corrección de entregas"
          subtitle="Revisá y calificá las actividades de tus estudiantes"
        />

        <AlertBanner type="error" message={error} />
        <AlertBanner type="success" message={success} />

        {/* Filter Chips */}
        <View style={styles.filterRow}>
          {[
            { key: 'submitted', label: 'Pendientes de corrección' },
            { key: 'graded', label: 'Calificadas' },
            { key: '', label: 'Todas' },
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
        ) : submissions.length === 0 ? (
          <EmptyState
            icon="checkmark-done-circle-outline"
            title="No hay entregas en esta vista"
            message="Cambiá el filtro o esperá a que tus estudiantes envíen nuevas actividades."
          />
        ) : (
          submissions.map((sub) => (
            <Card key={sub.attemptId}>
              <View style={styles.rowBetween}>
                <Badge label={sub.courseTitle} tone="primary" />
                <Badge
                  label={
                    sub.status === 'graded'
                      ? `Calificada: ${sub.score}%`
                      : sub.status === 'returned'
                      ? 'Reentrega solicitada'
                      : 'Pendiente'
                  }
                  tone={
                    sub.status === 'graded'
                      ? sub.passed
                        ? 'success'
                        : 'danger'
                      : 'warning'
                  }
                />
              </View>

              <Text style={[styles.title, { color: colors.text }]}>{sub.assignmentTitle}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                Estudiante: {sub.studentName} ({sub.studentEmail}) • Intento #{sub.attemptNumber}
              </Text>

              {sub.submissionText ? (
                <View style={[styles.submissionBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                    RESPUESTA DEL ESTUDIANTE:
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 13 }}>{sub.submissionText}</Text>
                </View>
              ) : null}

              {sub.submissionUrl ? (
                <Text style={{ color: colors.info, fontSize: 12, marginTop: 6 }}>
                  Enlace adjunto: {sub.submissionUrl}
                </Text>
              ) : null}

              {sub.feedback ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
                  Devolución docente: "{sub.feedback}"
                </Text>
              ) : null}

              <View style={[styles.rowBetween, { marginTop: 12 }]}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  Enviado: {formatDateAR(sub.submittedAt, true)}
                </Text>
                <Button
                  title={sub.status === 'graded' ? 'Recalificar' : 'Calificar entrega'}
                  icon="create-outline"
                  onPress={() => openGradeModal(sub)}
                  style={{ minHeight: 38, paddingVertical: 8, paddingHorizontal: 14 }}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Grading Modal */}
      <Modal visible={Boolean(gradingItem)} animationType="slide" transparent>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <ScrollView>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Evaluar entrega académica
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10 }}>
                {gradingItem?.assignmentTitle} — {gradingItem?.studentName}
              </Text>

              {gradingItem?.submissionText ? (
                <View style={[styles.submissionBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, marginBottom: 12 }]}>
                  <Text style={{ color: colors.text, fontSize: 13 }}>
                    {gradingItem.submissionText}
                  </Text>
                </View>
              ) : null}

              <Input
                label={`Calificación (0 a 100 — Mínimo aprobación: ${gradingItem?.passingScore || 70}%)`}
                value={score}
                onChangeText={setScore}
                keyboardType="numeric"
              />

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Dictamen</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <Chip
                  label="Calificación definitiva"
                  selected={gradeStatus === 'graded'}
                  onPress={() => setGradeStatus('graded')}
                />
                <Chip
                  label="Solicitar reentrega"
                  selected={gradeStatus === 'returned'}
                  onPress={() => setGradeStatus('returned')}
                />
              </View>

              <Input
                label="Devolución pedagógica para el estudiante"
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Escribí comentarios constructivos sobre la entrega..."
                multiline
                numberOfLines={4}
              />

              <View style={styles.actionRow}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setGradingItem(null)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Guardar nota"
                  variant="success"
                  loading={submittingGrade}
                  onPress={handleSaveGrade}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  submissionBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '88%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
});
