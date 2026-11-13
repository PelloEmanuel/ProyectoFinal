// Importa los hooks de React para estado, efectos y callbacks.
import React, { useCallback, useEffect, useState } from 'react';
// Importa los componentes visuales y enlaces nativos de React Native.
import { Linking, Pressable, Text, View } from 'react-native';
// Importa la librería de íconos Ionicons.
import { Ionicons } from '@expo/vector-icons';
// Importa los componentes reutilizables de la interfaz.
import { Badge, Button, ErrorBanner, Loading, Screen, SectionHeader, SuccessBanner } from '../../componentes/interfaz';
// Importa el servicio de API de cursos.
import { coursesApi } from '../../api/servicios';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa la utilidad para extraer mensajes de error.
import { getErrorMessage } from '../../utilidades/errores';
// Importa la función para resolver rutas de recursos estáticos.
import { resolveAssetUrl } from '../../configuracion/indice';

// Define las propiedades recibidas por el visor de lecciones.
interface PropiedadesPantallaVisorLeccion {
  navigation: any;
  route: any;
}

// Renderiza el visor de lectura de una lección con seguimiento de avance y recursos de apoyo.
export default function LessonViewerScreen({ navigation, route }: PropiedadesPantallaVisorLeccion) {
  // Extrae el identificador de la lección y del curso desde los parámetros de ruta.
  const { lessonId, courseId } = route.params;
  // Obtiene la paleta de colores activa.
  const { colors } = useTheme();
  // Estados para la lección actual, mensajes y guardado de avance.
  const [lesson, setLesson] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Carga el contenido de la lección y registra el inicio de su lectura en el servidor.
  const load = useCallback(async () => {
    try {
      setError('');
      setSuccess('');
      const res = await coursesApi.getLesson(lessonId);
      setLesson(res);
      coursesApi.startLesson(lessonId).catch(() => {});
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [lessonId]);

  // Ejecuta la carga al montar la pantalla o cambiar de lección.
  useEffect(() => {
    load();
  }, [load]);

  // Muestra el indicador de carga mientras se obtiene la lección.
  if (!lesson && !error) return <Loading />;

  // Marca la lección actual como completada en la base de datos.
  const markComplete = async (): Promise<void> => {
    setSaving(true);
    setError('');
    try {
      const res = await coursesApi.completeLesson(lesson.id);
      setLesson((l: any) => ({ ...l, completed: true }));
      setSuccess(res.message || 'Lección marcada como completada.');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // Identifica la lección anterior y siguiente dentro del mismo módulo.
  const siblings = lesson?.moduleLessons || [];
  const currentIdx = siblings.findIndex((s: any) => Number(s.id) === Number(lesson?.id));
  const prevLesson = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextLesson = currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;

  // Renderiza el contenido de la lección y los controles de navegación.
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

          {lesson.resources?.length > 0 && (
            <>
              <SectionHeader title="Recursos y material de apoyo" />
              {lesson.resources.map((r: any) => (
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

          {siblings.length > 1 && (
            <>
              <SectionHeader title="Lecciones de este módulo" />
              {siblings.map((sib: any) => {
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
