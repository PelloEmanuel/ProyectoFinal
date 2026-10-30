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
  { value: 'statistics', label: 'Estadísticas' },
  { value: 'calendar', label: 'Calendario' },
  { value: 'certificates', label: 'Certificados' },
  { value: 'notifications', label: 'Notificaciones' },
];

export default function StudentExtrasScreen({ navigation, route }) {
  const initialSection = route.params?.section || 'statistics';
  const { colors } = useTheme();
  const [section, setSection] = useState(initialSection);
  const [stats, setStats] = useState(null);
  const [calendar, setCalendar] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [st, cal, certs, notifs] = await Promise.all([
        usersApi.myStatistics(),
        usersApi.myCalendar(),
        usersApi.myCertificates(),
        notificationsApi.list(),
      ]);
      setStats(st);
      setCalendar(cal || []);
      setCertificates(certs || []);
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

  const handleVerifyCode = async () => {
    if (!verifyCode.trim()) return;
    setError('');
    setVerifyResult(null);
    try {
      const res = await certificatesApi.verifyPublic(verifyCode.trim());
      setVerifyResult(res.data);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const shareCertificate = (cert) => {
    Share.share({
      title: `Certificado SkillTrack - ${cert.courseTitle}`,
      message: `Certificado Oficial de Finalización SkillTrack\nEstudiante: ${cert.studentName}\nCurso: ${cert.courseTitle}\nInstructor: ${cert.instructorName}\nFecha de emisión: ${formatDate(cert.issuedAt)}\nCódigo único de verificación: ${cert.verificationCode}`,
    }).catch(() => {});
  };

  return (
    <Screen>
      <Chips options={SECTIONS} value={section} onChange={setSection} />
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={success} />

      {/* 7.14. Estadísticas y progreso personal */}
      {section === 'statistics' && stats && (
        <View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
            <StatCard label="Cursos matriculados" value={stats.startedCourses} icon="book-outline" color={colors.primary} />
            <StatCard label="Lecciones vistas" value={stats.completedLessons} icon="reader-outline" color={colors.secondary} />
            <StatCard label="Certificados obtenidos" value={stats.certificatesCount} icon="ribbon-outline" color={colors.success} />
          </View>

          <SectionHeader title="Habilidades en desarrollo" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {stats.skillsAcquired?.map((sk) => (
              <Badge key={sk.id} text={sk.name} color={colors.primary} />
            ))}
          </View>
        </View>
      )}

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

      {/* 8. Certificados de finalización y verificación de autenticidad */}
      {section === 'certificates' && (
        <View>
          <SectionHeader title="Mis Certificados Emitidos" subtitle="Emitidos al completar todas las lecciones obligatorias" />
          {certificates.length === 0 ? (
            <Empty
              icon="ribbon-outline"
              title="Todavía no tenés certificados"
              text="Completá el 100% de las lecciones obligatorias de un curso para emitir tu certificado verificable."
            />
          ) : (
            certificates.map((cert) => (
              <View
                key={cert.id}
                style={{
                  backgroundColor: colors.navy,
                  borderRadius: 18,
                  padding: 18,
                  marginBottom: 12,
                  borderWidth: 2,
                  borderColor: colors.success,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge text="CERTIFICADO OFICIAL SKILLTRACK" color="#4ade80" />
                  <Ionicons name="ribbon" size={26} color="#4ade80" />
                </View>
                <Text style={{ color: colors.mode === 'light' ? colors.text : '#ffffff', fontSize: 18, fontWeight: '800', marginTop: 10 }}>{cert.courseTitle}</Text>
                <Text style={{ color: colors.mode === 'light' ? colors.textSecondary : '#cbd5e1', fontSize: 13, marginTop: 4 }}>Otorgado a: {cert.studentName}</Text>
                <Text style={{ color: colors.mode === 'light' ? colors.textSecondary : '#cbd5e1', fontSize: 12, marginTop: 2 }}>
                  Instructor: {cert.instructorName} • Duración: {cert.estimatedDuration} h
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>
                  Fecha de emisión: {formatDate(cert.issuedAt)} • Código: {cert.verificationCode}
                </Text>
                <Button
                  title="Compartir / Exportar Certificado"
                  icon="share-social-outline"
                  variant="success"
                  small
                  style={{ marginTop: 12, marginBottom: 0 }}
                  onPress={() => shareCertificate(cert)}
                />
              </View>
            ))
          )}

          <SectionHeader title="Verificador Público de Certificados" subtitle="Comprobá la validez de cualquier código" />
          <Input
            label="Código de verificación"
            value={verifyCode}
            onChangeText={setVerifyCode}
            placeholder="Ej. SKT-2026-UXUI-0004"
            autoCapitalize="characters"
          />
          <Button title="Verificar autenticidad" icon="shield-checkmark-outline" variant="outline" onPress={handleVerifyCode} />
          {verifyResult && (
            <View
              style={{
                backgroundColor: colors.successLight,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.success,
              }}
            >
              <Text style={{ color: colors.success, fontWeight: '800' }}>
                ✓ Certificado Auténtico ({verifyResult.verificationCode})
              </Text>
              <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>
                Estudiante: {verifyResult.studentName} • Curso: {verifyResult.courseTitle} ({formatDate(verifyResult.issuedAt)})
              </Text>
            </View>
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
