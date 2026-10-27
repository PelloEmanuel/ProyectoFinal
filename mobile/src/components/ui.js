import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import useResponsive from '../hooks/useResponsive';

/** Contenedor de pantalla: safe area, teclado y ancho máximo centrado (responsivo). */
export function Screen({ children, scroll = true, edges = ['left', 'right', 'bottom'], style }) {
  const { contentWidth } = useResponsive();
  const inner = { width: contentWidth, flex: scroll ? undefined : 1, padding: 16 };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={edges}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center', flexGrow: 1 }}>
            <View style={[inner, style]}>{children}</View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={[inner, style]}>{children}</View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style }) {
  const v = {
    primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
    outline: { bg: '#fff', fg: colors.text, border: colors.border },
    danger: { bg: colors.dangerLight, fg: colors.danger, border: colors.dangerLight },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [s.btn, { backgroundColor: v.bg, borderColor: v.border, opacity: off ? 0.6 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={20} color={v.fg} style={{ marginRight: 8 }} />}
          <Text style={[s.btnText, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Input({ label, error, style, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[s.input, error && { borderColor: colors.danger }, style]}
        accessibilityLabel={label}
        {...props}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={s.banner} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <Text style={s.bannerText}>{message}</Text>
    </View>
  );
}

/** Selector de opciones tipo "chips". options = [{ value, label }] */
export function Chips({ options, value, onChange, label }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[s.chip, active && s.chipActive]}>
              <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '500' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Badge({ text, color }) {
  return (
    <View style={{ backgroundColor: color + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginRight: 6 }}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', text }) {
  return (
    <View style={{ alignItems: 'center', padding: 40 }}>
      <Ionicons name={icon} size={48} color={colors.border} />
      <Text style={{ color: colors.muted, marginTop: 8, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export const Loading = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
    <ActivityIndicator size="large" color={colors.primary} />
  </View>
);

const s = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, marginBottom: 10 },
  btnText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dangerLight, borderRadius: 12, padding: 12, marginBottom: 14 },
  bannerText: { color: colors.danger, marginLeft: 8, flex: 1 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
});
