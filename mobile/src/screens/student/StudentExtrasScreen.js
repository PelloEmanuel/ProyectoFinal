/**
 * Archivo: mobile/src/screens/student/StudentExtrasScreen.js
 * Descripción: Centro de seguimiento académico del estudiante (Secciones 7.14, 7.15, 7.17 y 8):
 * - Estadísticas personales y habilidades desarrolladas.
 * - Calendario de entregas y eventos.
 * - Certificados obtenidos y verificador público de autenticidad.
 * - Bandeja de notificaciones con marcado de lectura.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Badge,
  Button,
  Chips,
  Empty,
  ErrorBanner,
  Input,
  Loading,
  ProgressBar,
  Screen,
  SectionHeader,
  StatCard,
  SuccessBanner,
} from '../../components/ui';
import { certificatesApi, notificationsApi, usersApi } from '../../api/services';
import { useTheme } from '../../context/ThemeContext';
import { formatDate, formatDateTime } from '../../utils/dates';
import { getErrorMessage } from '../../utils/errors';

const SECTIONS = [
  { value: 'calendar', label: 'Calendario' },
  { value: 'notifications', label: 'Notificaciones' },
];

export default function StudentExtrasScreen({ navigation, route }) {
  const initialSection = route.params?.section || 'calendar';
  const { colors } = useTheme();
  const [section, setSection] = useState(initialSection);
  const [calendar, setCalendar] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading />;

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setSuccess('Todas las notificaciones fueron marcadas como leídas.');
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <Screen>
      <Chips options={SECTIONS} value={section} onChange={setSection} />
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={success} />

      {/* 7.15. Calendario */}
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

      {/* 7.17. Bandeja de notificaciones */}
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
