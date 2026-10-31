/**
 * Archivo: mobile/src/screens/auth/WelcomeScreen.js
 * Descripción: Pantalla de bienvenida de SkillTrack (Sección 7.1).
 * Incluye logotipo, propósito, composición visual de aprendizaje, accesos a Login/Registro
 * y consulta de Términos y Política de Privacidad.
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen, SkillTrackLogo } from '../../components/ui';
import { useTheme } from '../../context/ThemeContext';

export default function WelcomeScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const [legalModal, setLegalModal] = useState(false);

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} contentContainerStyle={{ justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar tema claro u oscuro"
          onPress={toggleTheme}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
          }}
        >
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={16} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginLeft: 6 }}>
            {isDark ? 'Modo Claro' : 'Modo Oscuro'}
          </Text>
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', marginVertical: 18 }}>
        <SkillTrackLogo size="lg" />
      </View>

      <View
        style={{
          backgroundColor: colors.navy,
          borderRadius: 20,
          padding: 20,
          marginBottom: 20,
          borderWidth: 1,
          borderColor: colors.primary,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#4f46e533', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="book-outline" size={24} color="#818cf8" />
            </View>
            <Text style={{ color: colors.mode === 'light' ? colors.text : '#e2e8f0', fontSize: 12, fontWeight: '700', marginTop: 6 }}>Cursos y Módulos</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#16a34a33', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-done-circle-outline" size={24} color="#4ade80" />
            </View>
            <Text style={{ color: colors.mode === 'light' ? colors.text : '#e2e8f0', fontSize: 12, fontWeight: '700', marginTop: 6 }}>Evaluaciones</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#d9770633', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="school-outline" size={24} color="#fbbf24" />
            </View>
            <Text style={{ color: colors.mode === 'light' ? colors.text : '#e2e8f0', fontSize: 12, fontWeight: '700', marginTop: 6 }}>Seguimiento</Text>
          </View>
        </View>

        <Text style={{ color: colors.mode === 'light' ? colors.text : '#ffffff', fontSize: 17, fontWeight: '800', textAlign: 'center' }}>
          Impulsá tu formación académica en un entorno conectado
        </Text>
        <Text style={{ color: colors.mode === 'light' ? colors.textSecondary : '#cbd5e1', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
          Estudiá mediante lecciones estructuradas, entregá actividades, recibí devoluciones de tus docentes y seguí tu evolución en tiempo real.
        </Text>
      </View>

      <Button title="Iniciar sesión" icon="log-in-outline" onPress={() => navigation.navigate('Login')} />
      <Button title="Crear una cuenta nueva" variant="outline" icon="person-add-outline" onPress={() => navigation.navigate('Register')} />

      <Pressable onPress={() => setLegalModal(true)} style={{ paddingVertical: 12, alignItems: 'center' }}>
        <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>
          Consultá nuestros <Text style={{ color: colors.primary, fontWeight: '700' }}>Términos de Uso y Política de Privacidad</Text>
        </Text>
      </Pressable>

      <Modal visible={legalModal} transparent animationType="slide" onRequestClose={() => setLegalModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, maxHeight: '80%' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 10 }}>
              Términos y Política de Privacidad de SkillTrack
            </Text>
            <ScrollView style={{ marginBottom: 14 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                1. Propósito Académico: SkillTrack protege tus datos personales, progreso de aprendizaje, entregas y calificaciones bajo controles de acceso estrictos por rol.{'\n\n'}
                2. Seguridad de Credenciales: Las contraseñas se almacenan con hash criptográfico (bcrypt) y las sesiones utilizan tokens JWT con rotación segura en Android Keystore.{'\n\n'}
                3. Privacidad por Rol: Tus entregas y calificaciones solo pueden ser consultadas por vos y por el docente responsable del curso.{'\n\n'}
                4. Eliminación de Cuenta: Podés solicitar la baja de tu cuenta y revocar tus sesiones activas desde la pantalla de Perfil en cualquier momento.
              </Text>
            </ScrollView>
            <Button title="Entendido" onPress={() => setLegalModal(false)} style={{ marginBottom: 0 }} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
