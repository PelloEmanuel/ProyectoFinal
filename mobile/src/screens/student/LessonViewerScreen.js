/**
 * Archivo: mobile/src/screens/student/LessonViewerScreen.js
 * Descripción: Visor centrado en el aprendizaje de una lección (Sección 7.10).
 * Registra el inicio de la lectura, muestra el contenido formateado, recursos externos,
 * navegación entre lecciones del módulo y persiste la finalización en MySQL.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, ErrorBanner, Loading, Screen, SectionHeader, SuccessBanner } from '../../components/ui';
import { coursesApi } from '../../api/services';
import { useTheme } from '../../context/ThemeContext';
import { getErrorMessage } from '../../utils/errors';
import { resolveAssetUrl } from '../../config';

export default function LessonViewerScreen({ navigation, route }) {
  const { lessonId, courseId } = route.params;
  const { colors } = useTheme();
  const [lesson, setLesson] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setSuccess('');
      const res = await coursesApi.getLesson(lessonId);
      setLesson(res);
      // Registra en el backend que la lección fue iniciada (no la marca como completada automáticamente)
      coursesApi.startLesson(lessonId).catch(() => {});
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!lesson && !error) return <Loading />;

  const markComplete = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await coursesApi.completeLesson(lesson.id);
      setLesson((l) => ({ ...l, completed: true }));
      setSuccess(res.message || 'Lección marcada como completada.');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const siblings = lesson?.moduleLessons || [];
  const currentIdx = siblings.findIndex((s) => Number(s.id) === Number(lesson?.id));
  const prevLesson = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextLesson = currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;

  return (
    <Screen>
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={success} />

      {lesson && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
            <Badge text={lesson.courseTitle} color={colors.primary} />
            <Badge text={lesson.moduleTitle} color={colors.secondary} />
            <Badge
              text={lesson.completed ? 'Completada' : 'En lectura'}
              color={lesson.completed ? colors.success : colors.warning}
            />
          </View>

          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 4 }}>{lesson.title}</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
            Duración estimada: {lesson.estimatedDuration} min • {lesson.isRequired ? 'Lección obligatoria' : 'Lectura complementaria'}
          </Text>

          {/* Contenido principal legible */}
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 18,
              marginTop: 14,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 15, lineHeight: 24 }}>{lesson.content}</Text>
          </View>

          {/* Recursos educativos de la lección */}
          {lesson.resources?.length > 0 && (
            <>
              <SectionHeader title="Recursos y material de apoyo" />
              {lesson.resources.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    const target = resolveAssetUrl(r.resourceUrl);
                    Linking.openURL(target).catch(() => {});
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Ionicons name="link-outline" size={20} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{r.title}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                      {r.resourceUrl}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={18} color={colors.muted} />
                </Pressable>
              ))}
            </>
          )}

          {/* Acción de finalización */}
          <View style={{ marginTop: 18 }}>
            <Button
              title={lesson.completed ? 'Lección completada ✓' : 'Marcar lección como completada'}
              variant={lesson.completed ? 'success' : 'primary'}
              icon="checkmark-done-outline"
              onPress={markComplete}
              loading={saving}
              disabled={lesson.completed}
            />
          </View>

          {/* Navegación anterior / siguiente */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button
              title="Anterior"
              icon="arrow-back-outline"
              variant="outline"
              disabled={!prevLesson}
              style={{ flex: 1 }}
              onPress={() => navigation.replace('LessonViewer', { lessonId: prevLesson.id, courseId })}
            />
            <Button
              title="Siguiente"
              icon="arrow-forward-outline"
              variant="outline"
              disabled={!nextLesson}
              style={{ flex: 1 }}
              onPress={() => navigation.replace('LessonViewer', { lessonId: nextLesson.id, courseId })}
            />
          </View>

          {/* Lista de lecciones del módulo */}
          {siblings.length > 1 && (
            <>
              <SectionHeader title="Lecciones de este módulo" />
              {siblings.map((sib) => {
                const isCurrent = Number(sib.id) === Number(lesson.id);
                return (
                  <Pressable
                    key={sib.id}
                    onPress={() => {
                      if (!isCurrent) navigation.replace('LessonViewer', { lessonId: sib.id, courseId });
                    }}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      marginBottom: 6,
                      backgroundColor: isCurrent ? colors.primaryLight : colors.card,
                      borderWidth: 1,
                      borderColor: isCurrent ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ color: isCurrent ? colors.primary : colors.text, fontWeight: isCurrent ? '800' : '600' }}>
                      {sib.position}. {sib.title}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
