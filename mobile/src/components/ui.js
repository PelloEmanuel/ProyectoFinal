/**
 * Archivo: mobile/src/components/ui.js
 * Descripción: Biblioteca de componentes UI reutilizables de SkillTrack.
 * Soporta Tema Claro y Oscuro, áreas táctiles accesibles, logotipo institucional,
 * barras de progreso, tarjetas, chips, banners de éxito/error y modal de confirmación propio.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import useResponsive from '../hooks/useResponsive';

// Logotipo oficial de Técnica 5
const TECNICA_5_LOGO = require('../../assets/logo.png');

/**
 * Logotipo institucional de Campus Técnica 5.
 */
export function SkillTrackLogo({ size = 'md', showSubtitle = true }) {
  const { colors } = useTheme();
  const isLg = size === 'lg';
  const boxWidth = isLg ? 110 : 70;
  const boxHeight = isLg ? 75 : 48;

  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: boxWidth,
          height: boxHeight,
          borderRadius: isLg ? 16 : 10,
          backgroundColor: '#ffffff',
          borderWidth: 1.5,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <Image
          source={TECNICA_5_LOGO}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </View>
      <Text
        style={{
          fontSize: isLg ? 26 : 19,
          fontWeight: '900',
          color: colors.text,
          marginTop: 10,
          letterSpacing: 0.4,
        }}
      >
        Campus <Text style={{ color: colors.primary }}>Técnica 5</Text>
      </Text>
      {showSubtitle && (
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 2 }}>
          Plataforma Institucional y Académica
        </Text>
      )}
    </View>
  );
}

/**
 * Contenedor responsivo de pantalla con soporte de SafeArea, teclado y Tema Claro/Oscuro.
 */
export function Screen({ children, scroll = true, edges = ['left', 'right', 'bottom'], style, contentContainerStyle }) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, width: '100%', backgroundColor: colors.bg }} edges={edges}>
      <KeyboardAvoidingView style={{ flex: 1, width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1, width: '100%' }}
            contentContainerStyle={[
              { width: '100%', flexGrow: 1, padding: 16 },
              contentContainerStyle,
            ]}
          >
            <View style={[{ width: '100%', maxWidth: '100%' }, style]}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[{ flex: 1, width: '100%' }, contentContainerStyle]}>
            <View style={[{ flex: 1, width: '100%', maxWidth: '100%' }, style]}>{children}</View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, onPress, style }) {
  const { colors } = useTheme();
  const cardStyle = [
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },
    style,
  ];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [...cardStyle, { opacity: pressed ? 0.9 : 1 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, small = false }) {
  const { colors } = useTheme();
  const variants = {
    primary: { bg: colors.primary, fg: '#ffffff', border: colors.primary },
    navy: { bg: colors.navy, fg: '#ffffff', border: colors.navy },
    secondary: { bg: colors.surfaceAlt, fg: colors.text, border: colors.border },
    success: { bg: colors.success, fg: '#ffffff', border: colors.success },
    outline: { bg: colors.card, fg: colors.text, border: colors.border },
    danger: { bg: colors.dangerLight, fg: colors.danger, border: colors.danger },
  };
  const v = variants[variant] || variants.primary;
  const off = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title || 'Botón'}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.btn,
        small && { minHeight: 38, paddingHorizontal: 12, marginBottom: 6, borderRadius: 10 },
        { backgroundColor: v.bg, borderColor: v.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 20} color={v.fg} style={{ marginRight: title ? 8 : 0 }} />}
          {!!title && <Text style={[s.btnText, small && { fontSize: 13 }, { color: v.fg }]}>{title}</Text>}
        </>
      )}
    </Pressable>
  );
}

export function Input({ label, error, helperText, secureTextEntry, leftIcon, style, ...props }) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(!!secureTextEntry);

  return (
    <View style={{ marginBottom: 14 }}>
      {label && <Text style={[s.label, { color: colors.text }]}>{label}</Text>}
      <View style={{ position: 'relative', justifyContent: 'center' }}>
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={18}
            color={colors.muted}
            style={{ position: 'absolute', left: 12, zIndex: 2 }}
          />
        )}
        <TextInput
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry ? hidden : false}
          autoComplete={props.autoComplete || (secureTextEntry ? 'off' : undefined)}
          autoCorrect={props.autoCorrect ?? false}
          spellCheck={props.spellCheck ?? false}
          style={[
            s.input,
            {
              backgroundColor: colors.card,
              borderColor: error ? colors.danger : colors.border,
              color: colors.text,
              paddingLeft: leftIcon ? 38 : 14,
              paddingRight: secureTextEntry ? 44 : 14,
            },
            style,
          ]}
          accessibilityLabel={label}
          {...props}
        />
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            onPress={() => setHidden((h) => !h)}
            style={{ position: 'absolute', right: 12, padding: 6 }}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {!!helperText && !error && <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{helperText}</Text>}
      {!!error && <Text style={[s.error, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      style={[s.banner, { backgroundColor: colors.dangerLight, borderColor: colors.danger, borderWidth: 1 }]}
      accessibilityRole="alert"
    >
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <Text style={[s.bannerText, { color: colors.danger }]}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Reintentar</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SuccessBanner({ message }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      style={[s.banner, { backgroundColor: colors.successLight, borderColor: colors.success, borderWidth: 1 }]}
      accessibilityRole="alert"
    >
      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
      <Text style={[s.bannerText, { color: colors.success }]}>{message}</Text>
    </View>
  );
}

export function AlertBanner({ type = 'info', message, onRetry }) {
  if (!message) return null;
  if (type === 'error' || type === 'danger') {
    return <ErrorBanner message={message} onRetry={onRetry} />;
  }
  return <SuccessBanner message={message} />;
}

export function Chip({ label, selected, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        s.chip,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primary : colors.card,
        },
      ]}
    >
      <Text style={{ color: selected ? '#ffffff' : colors.text, fontWeight: '600', fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chips({ options, value, onChange, label }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      {label && <Text style={[s.label, { color: colors.text }]}>{label}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="button"
              onPress={() => onChange(o.value)}
              style={[
                s.chip,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : colors.card,
                },
              ]}
            >
              <Text style={{ color: active ? '#ffffff' : colors.text, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Badge({ text, label, color, tone = 'primary', style }) {
  const { colors } = useTheme();
  const toneMap = {
    primary: colors.primary,
    info: colors.secondary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    neutral: colors.muted,
  };
  const c = color || toneMap[tone] || colors.primary;
  const content = text !== undefined ? text : label;
  return (
    <View
      style={[
        {
          backgroundColor: c + '22',
          paddingHorizontal: 9,
          paddingVertical: 4,
          borderRadius: 10,
          marginRight: 6,
          marginBottom: 4,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text style={{ color: c, fontSize: 12, fontWeight: '700' }}>{content}</Text>
    </View>
  );
}

export function ProgressBar({ percent, progress, label = 'Avance del curso', color, showLabel = true }) {
  const { colors } = useTheme();
  const raw = percent !== undefined ? percent : progress;
  const safe = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
  const fill = color || (safe >= 100 ? colors.success : colors.primary);

  return (
    <View style={{ marginVertical: 6 }}>
      {showLabel && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>{label}</Text>
          <Text style={{ fontSize: 12, color: fill, fontWeight: '700' }}>{safe}%</Text>
        </View>
      )}
      <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ height: 8, width: `${safe}%`, backgroundColor: fill, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export function StatCard({ label, value, subtitle, icon, color, tone, onPress }) {
  const { colors } = useTheme();
  const toneMap = {
    primary: colors.primary,
    info: colors.secondary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  };
  const accent = color || toneMap[tone] || colors.primary;
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={{
        flex: 1,
        flexGrow: 1,
        flexBasis: 145,
        backgroundColor: colors.card,
        borderRadius: 14,
        padding: 14,
        margin: 3,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: accent }}>{value}</Text>
        {icon && <Ionicons name={icon.toLowerCase()} size={22} color={accent} />}
      </View>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 }}>{label}</Text>
      {!!subtitle && <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>}
    </Pressable>
  );
}

export const MetricCard = StatCard;

export function SectionHeader({ title, subtitle, actionLabel, onAction }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{title}</Text>
        {!!subtitle && <Text style={{ fontSize: 12, color: colors.muted }}>{subtitle}</Text>}
      </View>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={{ paddingVertical: 4, paddingLeft: 10 }}>
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Empty({ icon = 'school-outline', title, text, message, actionLabel, onAction }) {
  const { colors } = useTheme();
  const bodyText = text || message;
  return (
    <View style={{ alignItems: 'center', padding: 28 }}>
      <Ionicons name={icon} size={46} color={colors.muted} />
      {!!title && <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 10, textAlign: 'center' }}>{title}</Text>}
      {!!bodyText && <Text style={{ color: colors.muted, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>{bodyText}</Text>}
      {actionLabel && onAction && (
        <Button title={actionLabel} onPress={onAction} style={{ marginTop: 14, paddingHorizontal: 20 }} small />
      )}
    </View>
  );
}

export const EmptyState = Empty;

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText,
  confirmLabel,
  cancelText = 'Cancelar',
  danger = false,
  variant,
  onConfirm,
  onCancel,
}) {
  const { colors } = useTheme();
  if (!visible) return null;
  const isDanger = danger || variant === 'danger';
  const finalConfirmLabel = confirmLabel || confirmText || 'Confirmar';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 }}>{title}</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 18 }}>{message}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title={cancelText} variant="outline" onPress={onCancel} style={{ flex: 1, marginBottom: 0 }} />
            <Button
              title={finalConfirmLabel}
              variant={isDanger ? 'danger' : 'primary'}
              onPress={onConfirm}
              style={{ flex: 1, marginBottom: 0 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const Loading = () => {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
};

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  btnText: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  bannerText: { marginLeft: 8, flex: 1, fontSize: 13, fontWeight: '600' },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
});
