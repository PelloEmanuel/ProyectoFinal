// Importa los hooks de React para estado, efectos y callbacks.
import React, { useCallback, useEffect, useState } from 'react';
// Importa los componentes y utilidades nativas de React Native.
import { Linking, Platform, Pressable, Text, TouchableOpacity, View } from 'react-native';
// Importa la librería de íconos Ionicons.
import { Ionicons } from '@expo/vector-icons';
// Importa los componentes reutilizables de la interfaz.
import {
  Badge,
  Button,
  ConfirmModal,
  ErrorBanner,
  Input,
  Loading,
  Screen,
  SectionHeader,
  SuccessBanner,
} from '../../componentes/interfaz';
// Importa el servicio de API de actividades.
import { assignmentsApi } from '../../api/servicios';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa las etiquetas descriptivas de tipos de actividades.
import { ASSIGNMENT_TYPE_LABEL } from '../../tema';
// Importa las utilidades de formato de fecha y hora.
import { formatDate, formatDateTime } from '../../utilidades/fechas';
// Importa la utilidad para extraer mensajes de error.
import { getErrorMessage } from '../../utilidades/errores';
// Importa el componente de carga de archivos.
import FileUploader from '../../componentes/SubidorArchivos';
// Importa la función para resolver URLs de recursos estáticos.
import { resolveAssetUrl } from '../../configuracion/indice';

// Define las propiedades recibidas por la pantalla de detalle de actividad.
interface PropiedadesPantallaDetalleTarea {
  route: any;
}

// Renderiza la pantalla para resolver y entregar una actividad o cuestionario académico.
export default function AssignmentDetailScreen({ route }: PropiedadesPantallaDetalleTarea) {
  // Extrae el identificador de la actividad desde los parámetros de navegación.
  const { assignmentId } = route.params;
  // Obtiene la paleta de colores activa.
  const { colors } = useTheme();

  // Estados para la actividad, respuestas de cuestionario, texto, adjuntos y envío.
  const [assignment, setAssignment] = useState<any>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, any>>({});
  const [shortAnswers, setShortAnswers] = useState<Record<string, string>>({});
  const [submissionText, setSubmissionText] = useState<string>('');
  const [submissionAttachments, setSubmissionAttachments] = useState<any[]>([]);
  const [confirmSubmit, setConfirmSubmit] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Consulta al servidor los detalles completos de la actividad y los intentos previos.
  const load = useCallback(async () => {
    try {
      setError('');
      const res = await assignmentsApi.get(assignmentId);
      setAssignment(res);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [assignmentId]);

  // Carga los datos al montar la pantalla.
  useEffect(() => {
    load();
  }, [load]);

  // Muestra el indicador de carga mientras se obtiene la actividad.
  if (!assignment && !error) return <Loading />;

  // Calcula la cantidad de intentos utilizados y si el alumno aún puede realizar una entrega.
  const attemptsUsed = assignment?.myAttempts?.filter((a: any) => a.status !== 'in_progress').length || 0;
  const isPastDue = assignment?.dueAt && new Date(assignment.dueAt) < new Date();
  const canAttempt =
    assignment &&
    assignment.status === 'published' &&
    attemptsUsed < assignment.maxAttempts &&
    (!isPastDue || assignment.allowLateSubmissions);

  // Registra un nuevo intento en el servidor y envía las respuestas o archivos adjuntos.
  const handleSubmit = async (): Promise<void> => {
    setConfirmSubmit(false);
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const attempt = await assignmentsApi.startAttempt(assignment.id);
      const answers = (assignment.questions || []).map((q: any) => ({
        questionId: q.id,
        selectedOptionId: selectedOptions[q.id] || null,
        answerText: shortAnswers[q.id] || null,
      }));

      const payload = {
        answers,
        submissionText: submissionText.trim() || undefined,
        attachments: submissionAttachments,
      };

      const res = await assignmentsApi.submitAttempt(attempt.id, payload);
      setSuccess(res.message || 'Entrega registrada correctamente.');
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // Determina si la actividad es de tipo cuestionario estructurado.
  const isQuiz = ['multiple_choice', 'true_false', 'short_answer'].includes(assignment?.assignmentType);

  // Renderiza la vista completa de la actividad y el historial de intentos.
  return (
    <Screen>
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={success} />

      {assignment && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Badge text={assignment.courseTitle} color={colors.primary} />
            <Badge text={ASSIGNMENT_TYPE_LABEL[assignment.assignmentType] || assignment.assignmentType} color={colors.secondary} />
            <Badge text={`Máx: ${assignment.maxScore} pts (Aprueba con ${assignment.passingScore})`} color={colors.success} />
          </View>

          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 8 }}>{assignment.title}</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
            Fecha límite: {formatDate(assignment.dueAt)} • Intentos utilizados: {attemptsUsed}/{assignment.maxAttempts}
          </Text>

          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 14,
              padding: 14,
              marginTop: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 4 }}>Instrucciones de la actividad</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>{assignment.description}</Text>
          </View>

          {Array.isArray(assignment.attachments) && assignment.attachments.length > 0 && (
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 14,
                padding: 14,
                marginTop: 10,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 8 }}>
                Archivos y recursos adjuntos del docente ({assignment.attachments.length})
              </Text>
              <View style={{ gap: 8 }}>
                {assignment.attachments.map((att: any, idx: number) => (
                  <TouchableOpacity
                    key={att.id || idx}
                    onPress={() => {
                      const full = resolveAssetUrl(att.url);
                      if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(full, '_blank');
                      else Linking.openURL(full);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      padding: 10,
                      borderRadius: 10,
                      backgroundColor: colors.background,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Ionicons
                      name={att.type === 'link' || att.kind === 'link' ? 'link-outline' : 'document-attach-outline'}
                      size={20}
                      color={colors.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                        {att.name || 'Archivo adjunto'}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.primary }}>
                        Tocar para abrir o descargar ↗
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {assignment.rubric && (
            <>
              <SectionHeader title={assignment.rubric.title} subtitle="Criterios de evaluación del docente" />
              <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                {assignment.rubric.criteria?.map((c: any) => (
                  <View key={c.id} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '700', color: colors.text, fontSize: 14 }}>{c.title}</Text>
                      <Text style={{ fontWeight: '700', color: colors.primary, fontSize: 13 }}>{c.maxPoints} pts</Text>
                    </View>
                    {!!c.description && <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{c.description}</Text>}
                  </View>
                ))}
              </View>
            </>
          )}

          {canAttempt ? (
            <View style={{ marginTop: 14 }}>
              <SectionHeader title="Tu resolución" subtitle="Completá los campos y confirmá el envío" />

              {isQuiz &&
                assignment.questions?.map((q: any, idx: number) => (
                  <View
                    key={q.id}
                    style={{
                      backgroundColor: colors.card,
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15, marginBottom: 8 }}>
                      {idx + 1}. {q.prompt} ({q.points} pts)
                    </Text>

                    {q.questionType === 'short_answer' ? (
                      <Input
                        label="Tu respuesta breve"
                        value={shortAnswers[q.id] || ''}
                        onChangeText={(v: string) => setShortAnswers((s) => ({ ...s, [q.id]: v }))}
                        placeholder="Escribí la respuesta exacta..."
                      />
                    ) : (
                      q.options?.map((opt: any) => {
                        const selected = selectedOptions[q.id] === opt.id;
                        return (
                          <Pressable
                            key={opt.id}
                            onPress={() => setSelectedOptions((s) => ({ ...s, [q.id]: opt.id }))}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              padding: 12,
                              borderRadius: 10,
                              marginBottom: 8,
                              borderWidth: 1,
                              borderColor: selected ? colors.primary : colors.border,
                              backgroundColor: selected ? colors.primaryLight : colors.bg,
                            }}
                          >
                            <Ionicons
                              name={selected ? 'radio-button-on' : 'radio-button-off'}
                              size={20}
                              color={selected ? colors.primary : colors.muted}
                            />
                            <Text style={{ color: colors.text, marginLeft: 10, flex: 1, fontWeight: selected ? '700' : '500' }}>
                              {opt.optionText}
                            </Text>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                ))}

              {!isQuiz && (
                <View>
                  <Input
                    label="Desarrollo o comentarios de tu entrega"
                    value={submissionText}
                    onChangeText={setSubmissionText}
                    placeholder="Redactá acá tu respuesta, comentarios o conclusiones para el profesor..."
                    multiline
                    style={{ minHeight: 100, textAlignVertical: 'top' }}
                  />
                  <FileUploader
                    attachments={submissionAttachments}
                    onChange={setSubmissionAttachments}
                    label="Subir archivo o enlace de tu resolución"
                    description="Arrastrá o seleccioná tus archivos resueltos (PDF, imágenes, ZIP, enlaces a repos)"
                  />
                </View>
              )}

              <Button
                title="Confirmar y entregar actividad"
                icon="paper-plane-outline"
                onPress={() => setConfirmSubmit(true)}
                loading={submitting}
              />
            </View>
          ) : (
            <View
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 12,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.muted, fontWeight: '600', textAlign: 'center' }}>
                Ya utilizaste todos los intentos disponibles o la fecha límite de esta actividad ha cerrado.
              </Text>
            </View>
          )}

          {assignment.myAttempts?.length > 0 && (
            <>
              <SectionHeader title="Historial de mis entregas y calificaciones" />
              {assignment.myAttempts.map((att: any) => (
                <View
                  key={att.id}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Intento #{att.attemptNumber}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      {att.isLate ? (
                        <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>ENTREGADO CON RETRASO</Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: '#10b981', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>ENTREGADO A TIEMPO</Text>
                        </View>
                      )}
                      <Badge
                        text={
                          att.status === 'graded'
                            ? `${att.passed ? 'Aprobado' : 'Desaprobado'} (${att.score}/${assignment.maxScore})`
                            : 'Enviado'
                        }
                        color={att.status === 'graded' ? (att.passed ? colors.success : colors.danger) : colors.secondary}
                      />
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                    Enviado: {formatDateTime(att.submittedAt || att.startedAt)}
                  </Text>
                  {!!att.submissionText && (
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 6 }}>
                      Respuesta: {att.submissionText}
                    </Text>
                  )}
                  {!!att.feedback && (
                    <View style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: colors.surfaceAlt }}>
                      <Text style={{ fontWeight: '700', color: colors.text, fontSize: 12 }}>Devolución del docente:</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{att.feedback}</Text>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
        </>
      )}

      <ConfirmModal
        visible={confirmSubmit}
        title="Confirmar entrega de actividad"
        message="¿Estás seguro de enviar tu resolución? Se contabilizará un intento oficial en tu historial académico."
        confirmText="Enviar entrega"
        onConfirm={handleSubmit}
        onCancel={() => setConfirmSubmit(false)}
      />
    </Screen>
  );
}
