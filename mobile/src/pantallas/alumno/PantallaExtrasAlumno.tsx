// Importa los hooks de React para estado, efectos y callbacks.
import React, { useCallback, useEffect, useState } from 'react';
// Importa los componentes visuales nativos de React Native.
import { Pressable, Text, View } from 'react-native';
// Importa los componentes reutilizables de la interfaz.
import {
  Badge,
  Chips,
  Empty,
  ErrorBanner,
  Loading,
  Screen,
  SectionHeader,
  SuccessBanner,
} from '../../componentes/interfaz';
// Importa los servicios de API de notificaciones y usuarios.
import { notificationsApi, usersApi } from '../../api/servicios';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa las funciones de formato de fechas.
import { formatDate, formatDateTime } from '../../utilidades/fechas';
// Importa la utilidad para extraer mensajes de error.
import { getErrorMessage } from '../../utilidades/errores';

// Define las secciones disponibles dentro de la pantalla de extras del alumno.
const SECTIONS = [
  { value: 'calendar', label: 'Calendario' },
  { value: 'notifications', label: 'Notificaciones' },
];

// Define las propiedades recibidas por la pantalla de extras del estudiante.
interface PropiedadesPantallaExtrasAlumno {
  navigation: any;
  route: any;
}

// Renderiza el calendario académico de entregas y la bandeja de notificaciones del alumno.
export default function StudentExtrasScreen({ navigation, route }: PropiedadesPantallaExtrasAlumno) {
  // Determina la sección inicial solicitada por parámetros de navegación.
  const initialSection = route.params?.section || 'calendar';
  // Obtiene la paleta de colores activa.
  const { colors } = useTheme();
  // Estados para la sección activa, eventos del calendario, notificaciones y carga.
  const [section, setSection] = useState<string>(initialSection);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Consulta en paralelo el calendario del estudiante y sus notificaciones.
  const load = useCallback(async () => {
    try {
      setError('');
      const [cal, notifs] = await Promise.all([
        usersApi.myCalendar(),
        notificationsApi.list(),
      ]);
      setCalendar(cal || []);
      setNotifications(notifs || []);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Ejecuta la carga inicial al montar el componente.
  useEffect(() => {
    load();
  }, [load]);

  // Actualiza el título de la barra de navegación según la sección seleccionada.
  useEffect(() => {
    navigation.setOptions({
      title: section === 'calendar' ? 'Calendario' : 'Notificaciones',
    });
  }, [navigation, section]);

  // Muestra el indicador de carga mientras se obtienen los datos.
  if (loading) return <Loading />;

  // Marca todas las notificaciones del alumno como leídas.
  const handleMarkAllRead = async (): Promise<void> => {
    try {
      await notificationsApi.markAllRead();
      setSuccess('Todas las notificaciones fueron marcadas como leídas.');
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  // Renderiza la interfaz del calendario o de las notificaciones según la pestaña activa.
  return (
    <Screen>
      <Chips options={SECTIONS} value={section} onChange={setSection} />
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={success} />

      {section === 'calendar' && (
        <View>
          <SectionHeader title="Calendario académico" subtitle="Fechas límite de actividades y anuncios" />
          {calendar.length === 0 ? (
            <Empty icon="calendar-outline" text="No tenés fechas programadas en tu calendario." />
          ) : (
            calendar.map((ev, idx) => (
              <View
                key={`${ev.eventType}-${ev.id}-${idx}`}
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderLeftWidth: 4,
                  borderLeftColor: ev.eventType === 'assignment_due' ? colors.warning : colors.primary,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Badge
                    text={ev.eventType === 'assignment_due' ? 'Entrega de Actividad' : 'Anuncio de Curso'}
                    color={ev.eventType === 'assignment_due' ? colors.warning : colors.primary}
                  />
                  <Text style={{ fontWeight: '700', color: colors.text, fontSize: 12 }}>{formatDate(ev.eventDate)}</Text>
                </View>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15, marginTop: 4 }}>{ev.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{ev.courseTitle}</Text>
              </View>
            ))
          )}
        </View>
      )}

      {section === 'notifications' && (
        <View>
          <SectionHeader
            title="Bandeja de Notificaciones"
            actionLabel="Marcar todas como leídas"
            onAction={handleMarkAllRead}
          />
          {notifications.length === 0 ? (
            <Empty icon="notifications-off-outline" text="No tenés notificaciones registradas." />
          ) : (
            notifications.map((n) => (
              <Pressable
                key={n.id}
                onPress={async () => {
                  if (!n.isRead) {
                    await notificationsApi.markRead(n.id).catch(() => {});
                    load();
                  }
                  if (n.resourceType === 'course' && n.resourceId) {
                    navigation.navigate('CourseDetail', { courseId: n.resourceId });
                  } else if (n.resourceType === 'assignment' && n.resourceId) {
                    navigation.navigate('AssignmentDetail', { assignmentId: n.resourceId });
                  }
                }}
                style={{
                  backgroundColor: n.isRead ? colors.card : colors.primaryLight,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: n.isRead ? colors.border : colors.primary,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14, flex: 1 }}>{n.title}</Text>
                  {!n.isRead && <Badge text="Nueva" color={colors.primary} />}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>{n.body}</Text>
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>{formatDateTime(n.createdAt)}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </Screen>
  );
}
