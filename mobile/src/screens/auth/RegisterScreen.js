/**
 * Archivo: mobile/src/screens/auth/RegisterScreen.js
 * Descripción: Pantalla de registro de SkillTrack.
 * - El primer usuario registrado en el sistema se convierte automáticamente en Administrador.
 * - A partir del segundo usuario, permite elegir entre ingresar como Alumno (registro común)
 *   o como Docente (requiere introducir la clave de docente definida por el Administrador).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, ErrorBanner, Input, Screen, SkillTrackLogo } from '../../components/ui';
import { authApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import useSocialAuth from '../../hooks/useSocialAuth';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { validateRegister } from '../../utils/validators';

export default function RegisterScreen({ navigation }) {
  const { register, socialLogin } = useAuth();
  const { colors } = useTheme();
  const [isFirstUser, setIsFirstUser] = useState(false);
  const [form, setForm] = useState({
    role: 'student', // 'student' (Alumno) | 'preceptor' (Preceptor) | 'instructor' (Docente)
    instructorKey: '',
    preceptorKey: '',
    schoolYear: 1,
    courseDivision: 1,
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    confirm: '',
    acceptTerms: true,
  });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) {
      setErrors((prev) => ({ ...prev, [k]: undefined }));
    }
  };

  useEffect(() => {
    let mounted = true;
    authApi
      .registrationStatus()
      .then((res) => {
        if (mounted) {
          setIsFirstUser(Boolean(res?.isFirstUser ?? res?.data?.isFirstUser));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const startSocial = useSocialAuth({
    onCredential: async (provider, body) => {
      setBanner('');
      if (!isFirstUser && form.role === 'instructor' && !String(form.instructorKey || '').trim()) {
        setErrors((prev) => ({
          ...prev,
          instructorKey: 'Debés completar este campo con la clave de docente',
        }));
        setBanner('Debés completar el campo de clave de docente para poder iniciar sesión como docente.');
        return;
      }
      if (!isFirstUser && form.role === 'preceptor' && !String(form.preceptorKey || '').trim()) {
        setErrors((prev) => ({
          ...prev,
          preceptorKey: 'Debés completar este campo con la clave de preceptor',
        }));
        setBanner('Debés completar el campo de clave de preceptor para poder registrarte como preceptor.');
        return;
      }
      setLoading(true);
      try {
        await socialLogin(provider, {
          ...body,
          role: form.role,
          instructorKey: form.role === 'instructor' ? form.instructorKey.trim() : undefined,
          preceptorKey: form.role === 'preceptor' ? form.preceptorKey.trim() : undefined,
        });
      } catch (e) {
        setErrors(getFieldErrors(e));
        setBanner(getErrorMessage(e));
        setLoading(false);
      }
    },
    onError: setBanner,
  });

  const submit = async () => {
    const v = validateRegister({ ...form, isFirstUser });
    setErrors(v);
    setBanner('');
    if (Object.keys(v).length) {
      if (v.instructorKey) {
        setBanner('Debés completar el campo de clave de docente para poder registrarte e iniciar sesión como docente.');
      }
      return;
    }
    if (!isFirstUser && form.role === 'preceptor' && !String(form.preceptorKey || '').trim()) {
      setErrors((prev) => ({
        ...prev,
        preceptorKey: 'Debés completar este campo con la clave de preceptor',
      }));
      setBanner('Debés completar el campo de clave de preceptor dictada por el administrador.');
      return;
    }
    setLoading(true);
    try {
      await register({
        role: form.role,
        instructorKey: form.role === 'instructor' ? form.instructorKey.trim() : undefined,
        preceptorKey: form.role === 'preceptor' ? form.preceptorKey.trim() : undefined,
        schoolYear: form.role === 'student' ? form.schoolYear : undefined,
        courseDivision: form.role === 'student' ? form.courseDivision : undefined,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: form.username.trim() || undefined,
        email: form.email.trim().toLowerCase(),
        password: form.password,
        acceptTerms: form.acceptTerms,
      });
    } catch (e) {
      const fieldErrs = getFieldErrors(e);
      setErrors(fieldErrs);
      setBanner(getErrorMessage(e));
      // Conservamos los campos no sensibles y limpiamos contraseñas ante error recuperable
      setForm((f) => ({ ...f, password: '', confirm: '' }));
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={{ marginVertical: 10 }}>
        <SkillTrackLogo size="md" showSubtitle={false} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 8 }}>
          {isFirstUser ? 'Registro del Administrador Inicial' : 'Crear cuenta en SkillTrack'}
        </Text>
      </View>

      {isFirstUser && (
        <View
          style={{
            backgroundColor: colors.primarySoft || '#eef2ff',
            borderColor: colors.primary,
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="shield-checkmark" size={22} color={colors.primary} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>
              Primer usuario del sistema
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              Al no existir perfiles registrados, esta primera cuenta se convertirá automáticamente en el Administrador General.
            </Text>
          </View>
        </View>
      )}

      {/* Selector de Tipo de Ingreso: Alumno, Preceptor o Docente */}
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
          ¿Cómo deseas ingresar? *
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => {
              set('role')('student');
              setBanner('');
            }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              paddingHorizontal: 6,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: form.role === 'student' ? colors.primary : colors.border,
              backgroundColor: form.role === 'student' ? (colors.primarySoft || '#eef2ff') : colors.card,
            }}
          >
            <Ionicons
              name="school-outline"
              size={16}
              color={form.role === 'student' ? colors.primary : colors.muted}
              style={{ marginRight: 4 }}
            />
            <Text
              style={{
                fontWeight: '800',
                fontSize: 12,
                color: form.role === 'student' ? colors.primary : colors.text,
              }}
            >
              Alumno
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              set('role')('preceptor');
              setBanner('');
            }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              paddingHorizontal: 6,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: form.role === 'preceptor' ? colors.primary : colors.border,
              backgroundColor: form.role === 'preceptor' ? (colors.primarySoft || '#eef2ff') : colors.card,
            }}
          >
            <Ionicons
              name="clipboard-outline"
              size={16}
              color={form.role === 'preceptor' ? colors.primary : colors.muted}
              style={{ marginRight: 4 }}
            />
            <Text
              style={{
                fontWeight: '800',
                fontSize: 12,
                color: form.role === 'preceptor' ? colors.primary : colors.text,
              }}
            >
              Preceptor
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              set('role')('instructor');
              setBanner('');
            }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              paddingHorizontal: 6,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: form.role === 'instructor' ? colors.primary : colors.border,
              backgroundColor: form.role === 'instructor' ? (colors.primarySoft || '#eef2ff') : colors.card,
            }}
          >
            <Ionicons
              name="easel-outline"
              size={16}
              color={form.role === 'instructor' ? colors.primary : colors.muted}
              style={{ marginRight: 4 }}
            />
            <Text
              style={{
                fontWeight: '800',
                fontSize: 12,
                color: form.role === 'instructor' ? colors.primary : colors.text,
              }}
            >
              Docente
            </Text>
          </Pressable>
        </View>
      </View>

      <ErrorBanner message={banner} />

      {form.role === 'student' && !isFirstUser && (
        <View
          style={{
            backgroundColor: colors.surfaceAlt || colors.card,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
            Seleccioná tu Año Escolar (1° a 6°) *
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {[1, 2, 3, 4, 5, 6].map((yr) => {
              const selected = form.schoolYear === yr;
              return (
                <Pressable
                  key={yr}
                  onPress={() => set('schoolYear')(yr)}
                  style={{
                    flex: 1,
                    minWidth: 46,
                    paddingVertical: 8,
                    borderRadius: 10,
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary : colors.card,
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: 13, color: selected ? '#ffffff' : colors.text }}>
                    {yr}°
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
            Seleccioná tu Curso / División (1° a 3°) *
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3].map((div) => {
              const selected = form.courseDivision === div;
              return (
                <Pressable
                  key={div}
                  onPress={() => set('courseDivision')(div)}
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 10,
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary : colors.card,
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: 13, color: selected ? '#ffffff' : colors.text }}>
                    {div}° Curso
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>
            Se te asignarán automáticamente las materias y horarios de {form.schoolYear}° Año - {form.courseDivision}° Curso.
          </Text>
        </View>
      )}

      {form.role === 'preceptor' && !isFirstUser && (
        <View
          style={{
            backgroundColor: colors.surfaceAlt || colors.card,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: errors.preceptorKey ? colors.danger : colors.primary,
          }}
        >
          <Input
            label="Clave de Preceptor *"
            value={form.preceptorKey}
            onChangeText={set('preceptorKey')}
            error={errors.preceptorKey}
            placeholder="Ingresá la clave dictada por el administrador"
            autoCapitalize="characters"
          />
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: -4 }}>
            Esta clave institucional es dictada por el Administrador para que las personas de la institución puedan ser preceptores.
          </Text>
        </View>
      )}

      {form.role === 'instructor' && !isFirstUser && (
        <View
          style={{
            backgroundColor: colors.surfaceAlt || colors.card,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: errors.instructorKey ? colors.danger : colors.primary,
          }}
        >
          <Input
            label="Clave de Docente *"
            value={form.instructorKey}
            onChangeText={set('instructorKey')}
            error={errors.instructorKey}
            placeholder="Ingresá la clave asignada por el administrador"
            autoCapitalize="none"
            secureTextEntry
          />
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: -4 }}>
            Esta clave es elegida por el Administrador. Si no la completás o es incorrecta, no se permitirá iniciar sesión.
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input label="Nombre *" value={form.firstName} onChangeText={set('firstName')} error={errors.firstName} placeholder="Ej. Sofía" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Apellido *" value={form.lastName} onChangeText={set('lastName')} error={errors.lastName} placeholder="Ej. Gómez" />
        </View>
      </View>

      <Input
        label="Nombre de usuario (opcional)"
        value={form.username}
        onChangeText={set('username')}
        error={errors.username}
        placeholder="sofiagomez"
        autoCapitalize="none"
      />

      <Input
        label="Correo electrónico *"
        value={form.email}
        onChangeText={set('email')}
        error={errors.email}
        placeholder="sofia@universidad.edu.ar"
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Input
        label="Contraseña *"
        value={form.password}
        onChangeText={set('password')}
        error={errors.password}
        placeholder="Mínimo 8 caracteres, letras y números"
        secureTextEntry
      />

      <Input
        label="Confirmar contraseña *"
        value={form.confirm}
        onChangeText={set('confirm')}
        error={errors.confirm}
        placeholder="Repetí tu contraseña"
        secureTextEntry
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Switch
          value={form.acceptTerms}
          onValueChange={set('acceptTerms')}
          trackColor={{ true: colors.primary }}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            Acepto los Términos y Condiciones y la Política de Privacidad de SkillTrack.
          </Text>
          {!!errors.acceptTerms && <Text style={{ color: colors.danger, fontSize: 12 }}>{errors.acceptTerms}</Text>}
        </View>
      </View>

      <Button
        title={
          isFirstUser
            ? 'Registrarme como Administrador'
            : form.role === 'preceptor'
            ? 'Registrarme como Preceptor'
            : form.role === 'instructor'
            ? 'Registrarme como Docente'
            : 'Registrarme como Alumno'
        }
        icon="person-add-outline"
        onPress={submit}
        loading={loading}
      />

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Button
          title="Google"
          icon="logo-google"
          variant="outline"
          style={{ flex: 1 }}
          small
          onPress={() => {
            const meta = {
              role: form.role,
              instructorKey: form.instructorKey,
              preceptorKey: form.preceptorKey,
              schoolYear: form.schoolYear,
              courseDivision: form.courseDivision,
            };
            if (typeof window !== 'undefined' && window.sessionStorage) {
              sessionStorage.setItem('oauth_meta', JSON.stringify(meta));
            }
            startSocial('google', meta);
          }}
        />
        <Button
          title="GitHub"
          icon="logo-github"
          variant="outline"
          style={{ flex: 1 }}
          small
          onPress={() => {
            const meta = {
              role: form.role,
              instructorKey: form.instructorKey,
              preceptorKey: form.preceptorKey,
              schoolYear: form.schoolYear,
              courseDivision: form.courseDivision,
            };
            if (typeof window !== 'undefined' && window.sessionStorage) {
              sessionStorage.setItem('oauth_meta', JSON.stringify(meta));
            }
            startSocial('github', meta);
          }}
        />
        <Button
          title="Discord"
          icon="logo-discord"
          variant="outline"
          style={{ flex: 1 }}
          small
          onPress={() => {
            const meta = {
              role: form.role,
              instructorKey: form.instructorKey,
              preceptorKey: form.preceptorKey,
              schoolYear: form.schoolYear,
              courseDivision: form.courseDivision,
            };
            if (typeof window !== 'undefined' && window.sessionStorage) {
              sessionStorage.setItem('oauth_meta', JSON.stringify(meta));
            }
            startSocial('discord', meta);
          }}
        />
      </View>

      <Pressable onPress={() => navigation.navigate('Login')} style={{ padding: 12 }}>
        <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '700' }}>
          ¿Ya tenés una cuenta? Iniciá sesión
        </Text>
      </Pressable>
    </Screen>
  );
}
