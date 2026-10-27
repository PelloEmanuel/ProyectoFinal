import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from './ui';
import { PRIORITY, STATUS, colors } from '../theme';

export default function TaskCard({ task, onPress }) {
  const overdue = task.dueDate && task.status !== 'done' && task.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
      <Text style={s.title} numberOfLines={2}>{task.title}</Text>
      {!!task.description && <Text style={s.desc} numberOfLines={2}>{task.description}</Text>}
      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        <Badge text={STATUS[task.status].label} color={STATUS[task.status].color} />
        <Badge text={PRIORITY[task.priority].label} color={PRIORITY[task.priority].color} />
      </View>
      <View style={s.meta}>
        <Ionicons name="person-outline" size={14} color={colors.muted} />
        <Text style={s.metaText}>{task.assignedToName || 'Sin asignar'}</Text>
        {!!task.dueDate && (
          <>
            <Ionicons name="calendar-outline" size={14} color={overdue ? colors.danger : colors.muted} style={{ marginLeft: 12 }} />
            <Text style={[s.metaText, overdue && { color: colors.danger }]}>{task.dueDate}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, margin: 6, flex: 1, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  desc: { color: colors.muted, marginTop: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  metaText: { color: colors.muted, fontSize: 13, marginLeft: 4 },
});
