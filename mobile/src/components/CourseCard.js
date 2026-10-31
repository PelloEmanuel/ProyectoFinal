/**
 * Archivo: mobile/src/components/CourseCard.js
 * Descripción: Tarjeta reutilizable de curso para el catálogo, recomendaciones,
 * "Mi aprendizaje" y paneles de Docente y Administrador.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, ProgressBar } from './ui';
import { useTheme } from '../context/ThemeContext';
import { COURSE_STATUS, LEVEL_LABELS } from '../theme';

export function CourseLevelBadge({ level }) {
  const info = LEVEL_LABELS[level] || LEVEL_LABELS.beginner;
  return <Badge text={info.label} color={info.color} />;
}

export function CourseStatusBadge({ status }) {
  const info = COURSE_STATUS[status] || COURSE_STATUS.published;
  return <Badge text={info.label} color={info.color} />;
}

export default function CourseCard({ course, onPress, showProgress = false, showStatus = false, actionLabel, onAction }) {
  const { colors } = useTheme();
  const levelInfo = LEVEL_LABELS[course.level] || LEVEL_LABELS.beginner;
  const statusInfo = COURSE_STATUS[course.status] || COURSE_STATUS.published;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {!!course.coverImage && (
        <Image source={{ uri: course.coverImage }} style={s.cover} resizeMode="cover" />
      )}
      <View style={s.body}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
          {!!course.categoryName && <Badge text={course.categoryName} color={colors.primary} />}
          <Badge text={levelInfo.label} color={levelInfo.color} />
          {showStatus && course.status && <Badge text={statusInfo.label} color={statusInfo.color} />}
        </View>

        <Text style={[s.title, { color: colors.text }]} numberOfLines={2}>
          {course.title}
        </Text>

        {!!course.shortDescription && (
          <Text style={[s.desc, { color: colors.muted }]} numberOfLines={2}>
            {course.shortDescription}
          </Text>
        )}

        <View style={s.metaRow}>
          <Ionicons name="person-outline" size={14} color={colors.muted} />
          <Text style={[s.metaText, { color: colors.muted }]} numberOfLines={1}>
            {course.instructorName || 'Docente del Campus'}
          </Text>
          {!!course.estimatedDuration && (
            <>
              <Ionicons name="time-outline" size={14} color={colors.muted} style={{ marginLeft: 12 }} />
              <Text style={[s.metaText, { color: colors.muted }]}>{course.estimatedDuration} h</Text>
            </>
          )}
          {course.studentsCount !== undefined && (
            <>
              <Ionicons name="people-outline" size={14} color={colors.muted} style={{ marginLeft: 12 }} />
              <Text style={[s.metaText, { color: colors.muted }]}>{course.studentsCount}</Text>
            </>
          )}
        </View>

        {showProgress && course.progressPercent !== undefined && (
          <View style={{ marginTop: 8 }}>
            <ProgressBar percent={course.progressPercent} />
            {!!course.lastLessonTitle && (
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                Última lección: {course.lastLessonTitle}
              </Text>
            )}
          </View>
        )}

        {actionLabel && (
          <Pressable
            onPress={onAction || onPress}
            style={{
              marginTop: 10,
              backgroundColor: colors.primaryLight,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginVertical: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: 135,
    backgroundColor: '#1e293b',
  },
  body: {
    padding: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  desc: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  metaText: {
    fontSize: 12,
    marginLeft: 4,
  },
});
