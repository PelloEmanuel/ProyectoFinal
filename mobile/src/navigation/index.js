import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// Auth Screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import VerifyCodeScreen from '../screens/auth/VerifyCodeScreen';

// Student Screens
const TECNICA_5_LOGO = require('../../assets/logo.png');
import StudentHomeScreen from '../screens/student/StudentHomeScreen';
import ExploreCoursesScreen from '../screens/student/ExploreCoursesScreen';
import MyLearningScreen from '../screens/student/MyLearningScreen';
import AssignmentsScreen from '../screens/student/AssignmentsScreen';
import CourseDetailScreen from '../screens/student/CourseDetailScreen';
import LessonViewerScreen from '../screens/student/LessonViewerScreen';
import AssignmentDetailScreen from '../screens/student/AssignmentDetailScreen';
import StudentExtrasScreen from '../screens/student/StudentExtrasScreen';

// Instructor Screens
import InstructorDashboardScreen from '../screens/instructor/InstructorDashboardScreen';
import InstructorCoursesScreen from '../screens/instructor/InstructorCoursesScreen';
import InstructorStudentsScreen from '../screens/instructor/InstructorStudentsScreen';
import InstructorSubmissionsScreen from '../screens/instructor/InstructorSubmissionsScreen';

// Admin Screens
import DashboardScreen from '../screens/admin/DashboardScreen';
import UsersScreen from '../screens/admin/UsersScreen';
import AdminCoursesScreen from '../screens/admin/AdminCoursesScreen';
import AdminReportsScreen from '../screens/admin/AdminReportsScreen';
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen';

// Preceptor & Attendance Screens
import PreceptorDashboardScreen from '../screens/preceptor/PreceptorDashboardScreen';
import AttendanceScreen from '../screens/shared/AttendanceScreen';

// Shared Profile & Security Screen + Course Group Grid Screen
import ProfileScreen from '../screens/ProfileScreen';
import CourseGroupScreen from '../screens/shared/CourseGroupScreen';

const NAV_STATE_KEY_PREFIX = 'CAMPUS_NAV_STATE_';

const VALID_STACK_ROUTES = [
  'MainTabs',
  'Attendance',
  'CourseGroup',
  'CourseDetail',
  'LessonViewer',
  'AssignmentDetail',
  'StudentExtras',
  'Profile',
];

const ROLE_TAB_NAMES = {
  student: ['StudentHome', 'MyLearning', 'Profile'],
  instructor: ['InstructorDashboard', 'InstructorCourses', 'InstructorStudents', 'InstructorAttendance', 'Profile'],
  preceptor: ['PreceptorHome', 'PreceptorAttendance', 'PreceptorStudents', 'Profile'],
  admin: ['AdminDashboard', 'AdminCourses', 'Users', 'AdminReports', 'AdminSettings', 'AdminAttendance', 'Profile'],
};

function getSavedNavigationState(user) {
  if (!user || typeof window === 'undefined') return undefined;
  const key = `${NAV_STATE_KEY_PREFIX}${user.id}_${user.role}`;
  try {
    const raw = window.sessionStorage?.getItem(key) || window.localStorage?.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.routes) && parsed.routes.length > 0) {
      // Validar que todas las rutas del stack correspondan a pantallas válidas de la sesión
      const allValid = parsed.routes.every((r) => r && VALID_STACK_ROUTES.includes(r.name));
      if (!allValid) return undefined;

      // Si la primera ruta es MainTabs y tiene estado anidado, validar que las tabs correspondan al rol del usuario
      const mainTabRoute = parsed.routes.find((r) => r.name === 'MainTabs');
      if (mainTabRoute?.state?.routes) {
        const allowedTabs = ROLE_TAB_NAMES[user.role] || [];
        const activeTabIdx = mainTabRoute.state.index ?? 0;
        const activeTab = mainTabRoute.state.routes[activeTabIdx];
        if (activeTab && !allowedTabs.includes(activeTab.name)) {
          return undefined;
        }
      }

      return parsed;
    }
  } catch (e) {
    console.warn('[Campus Nav] Error leyendo estado guardado:', e);
  }
  return undefined;
}

function saveNavigationState(user, state) {
  if (!user || !state || typeof window === 'undefined') return;
  const key = `${NAV_STATE_KEY_PREFIX}${user.id}_${user.role}`;
  try {
    const serialized = JSON.stringify(state);
    window.sessionStorage?.setItem(key, serialized);
    window.localStorage?.setItem(key, serialized);
  } catch (e) {}
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/**
 * Barra de Navegación Única Superior del Campus:
 * - Versión Móvil:
 *   - Izquierda: "Campus Técnica 5" con flecha indicadora (hacia arriba si está cerrado, hacia abajo si está desplegado).
 *   - Derecha: Botón Modo Oscuro / Claro y Botón para la Cuenta.
 *   - Panel Desplegable: Al tocar Campus Técnica 5 se despliega un panel inferior con todos los apartados (Panel, Materias, Estudiantes, Entregas).
 * - Versión Escritorio / Tablet:
 *   - Los 4 apartados principales visibles en línea horizontal en el centro.
 */
function UnifiedTopNavBar({ state, descriptors, navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [menuOpen, setMenuOpen] = useState(false);

  const profileRoute = state.routes.find((r) => r.name === 'Profile');
  const isProfileFocused = profileRoute ? state.index === state.routes.indexOf(profileRoute) : false;
  const mainRoutes = state.routes.filter((r) => r.name !== 'Profile');

  const getRouteIcon = (routeName) => {
    switch (routeName) {
      case 'StudentHome':
      case 'InstructorDashboard':
      case 'AdminDashboard':
      case 'PreceptorHome':
        return 'grid-outline';
      case 'MyLearning':
      case 'InstructorCourses':
      case 'AdminCourses':
        return 'book-outline';
      case 'ExploreCourses':
      case 'InstructorStudents':
      case 'Users':
      case 'PreceptorStudents':
        return 'people-outline';
      case 'PreceptorAttendance':
      case 'InstructorAttendance':
      case 'AdminAttendance':
      case 'Attendance':
        return 'calendar-outline';
      case 'Assignments':
      case 'InstructorSubmissions':
      case 'AdminReports':
        return 'clipboard-outline';
      case 'AdminSettings':
        return 'settings-outline';
      default:
        return 'ellipse-outline';
    }
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingTop: Math.max(insets?.top || 0, 8),
        paddingBottom: 8,
        paddingHorizontal: isMobile ? 8 : 12,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.35 : 0.08,
        shadowRadius: 4,
        zIndex: 100,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobile ? 4 : 8,
        }}
      >
        {/* LADO IZQUIERDO: Nombre de la página Campus Técnica 5 con flecha en móvil */}
        <Pressable
          onPress={() => {
            if (isMobile) {
              setMenuOpen((prev) => !prev);
            } else {
              navigation.navigate(state.routes[0].name);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={
            isMobile
              ? menuOpen
                ? 'Cerrar panel de navegación'
                : 'Abrir panel de navegación'
              : 'Ir al inicio de Campus Técnica 5'
          }
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: isMobile ? 5 : 7,
            marginRight: 2,
            paddingVertical: 4,
            paddingHorizontal: isMobile ? 4 : 0,
            borderRadius: 8,
            flexShrink: 1,
            backgroundColor:
              isMobile && menuOpen
                ? isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.05)'
                : pressed
                ? isDark
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(0, 0, 0, 0.03)'
                : 'transparent',
          })}
        >
          <View
            style={{
              width: isMobile ? 30 : 36,
              height: isMobile ? 24 : 28,
              borderRadius: 6,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 2,
            }}
          >
            <Image
              source={TECNICA_5_LOGO}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontSize: isMobile ? 14.5 : 17,
              fontWeight: '900',
              color: colors.text,
              letterSpacing: isMobile ? 0 : 0.3,
            }}
          >
            Campus <Text style={{ color: colors.primary }}>Técnica 5</Text>
          </Text>

          {/* Flecha indicadora en versión celular:
              - Apunta hacia arriba cuando el panel NO está desplegado
              - Apunta hacia abajo cuando el panel SÍ está desplegado */}
          {isMobile && (
            <Ionicons
              name={menuOpen ? 'chevron-down' : 'chevron-up'}
              size={isMobile ? 15 : 18}
              color={colors.text}
              style={{ marginLeft: 1 }}
            />
          )}
        </Pressable>

        {/* CENTRO: Los 4 apartados para ir moviéndose por la página (Solo en versión escritorio / pantalla grande) */}
        {!isMobile && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 4,
            }}
            style={{ flexShrink: 1, marginHorizontal: 6 }}
          >
            {mainRoutes.map((route, index) => {
              const { options } = descriptors[route.key];
              const label =
                options.tabBarLabel !== undefined
                  ? options.tabBarLabel
                  : options.title !== undefined
                  ? options.title
                  : route.name;

              const isFocused = state.routes[state.index]?.key === route.key;

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              };

              return (
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingVertical: 6,
                    paddingHorizontal: 11,
                    borderRadius: 8,
                    backgroundColor: isFocused
                      ? isDark
                        ? 'rgba(99, 102, 241, 0.24)'
                        : 'rgba(79, 70, 229, 0.1)'
                      : 'transparent',
                    borderWidth: 1,
                    borderColor: isFocused ? colors.primary : 'transparent',
                  }}
                >
                  <Ionicons
                    name={getRouteIcon(route.name)}
                    size={15}
                    color={isFocused ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: isFocused ? '800' : '600',
                      color: isFocused ? colors.primary : colors.textSecondary,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* LADO DERECHO: Botón de Modo Oscuro / Claro + Botón para la Cuenta */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 4 : 6, flexShrink: 0 }}>
          {/* BOTÓN MODO OSCURO / CLARO ACCESIBLE */}
          <Pressable
            onPress={toggleTheme}
            accessibilityRole="button"
            accessibilityLabel="Cambiar tema claro / oscuro"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: isMobile ? 3.5 : 5,
              paddingVertical: isMobile ? 5 : 6,
              paddingHorizontal: isMobile ? 7 : 9,
              borderRadius: 18,
              backgroundColor: isDark ? 'rgba(251, 191, 36, 0.14)' : 'rgba(245, 158, 11, 0.12)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(251, 191, 36, 0.4)' : 'rgba(245, 158, 11, 0.4)',
            }}
          >
            <Ionicons
              name={isDark ? 'moon' : 'sunny'}
              size={isMobile ? 13 : 15}
              color={isDark ? '#fbbf24' : '#d97706'}
            />
            <Text
              style={{
                fontSize: isMobile ? 10 : 11,
                fontWeight: '800',
                color: isDark ? '#fbbf24' : '#d97706',
              }}
            >
              {isDark ? 'Oscuro' : 'Claro'}
            </Text>
          </Pressable>

          {/* BOTÓN PARA LA CUENTA */}
          {profileRoute && (
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                const event = navigation.emit({
                  type: 'tabPress',
                  target: profileRoute.key,
                  canPreventDefault: true,
                });
                if (!isProfileFocused && !event.defaultPrevented) {
                  navigation.navigate(profileRoute.name);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Ir a la cuenta y perfil"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: isMobile ? 3.5 : 5,
                paddingVertical: isMobile ? 5 : 6,
                paddingHorizontal: isMobile ? 7 : 9,
                borderRadius: 18,
                backgroundColor: isProfileFocused
                  ? isDark
                    ? 'rgba(99, 102, 241, 0.22)'
                    : 'rgba(79, 70, 229, 0.12)'
                  : isDark
                  ? 'rgba(255, 255, 255, 0.06)'
                  : 'rgba(0, 0, 0, 0.05)',
                borderWidth: 1,
                borderColor: isProfileFocused ? colors.primary : colors.border,
              }}
            >
              <Ionicons
                name="person-circle-outline"
                size={isMobile ? 14 : 16}
                color={isProfileFocused ? colors.primary : colors.textSecondary}
              />
              <Text
                style={{
                  fontSize: isMobile ? 10 : 11,
                  fontWeight: '700',
                  color: isProfileFocused ? colors.primary : colors.textSecondary,
                }}
              >
                Cuenta
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* PANEL DESPLEGABLE EN VERSIÓN CELULAR */}
      {isMobile && menuOpen && (
        <View
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <View style={{ gap: 6 }}>
            {mainRoutes.map((route, index) => {
              const { options } = descriptors[route.key];
              const label =
                options.tabBarLabel !== undefined
                  ? options.tabBarLabel
                  : options.title !== undefined
                  ? options.title
                  : route.name;

              const isFocused = state.routes[state.index]?.key === route.key;

              const onPress = () => {
                setMenuOpen(false);
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              };

              return (
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: isFocused
                      ? isDark
                        ? 'rgba(99, 102, 241, 0.24)'
                        : 'rgba(79, 70, 229, 0.12)'
                      : pressed
                      ? colors.surfaceAlt
                      : isDark
                      ? 'rgba(255, 255, 255, 0.04)'
                      : 'rgba(0, 0, 0, 0.03)',
                    borderWidth: 1,
                    borderColor: isFocused ? colors.primary : colors.border,
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: isFocused
                          ? colors.primary
                          : isDark
                          ? 'rgba(255, 255, 255, 0.08)'
                          : 'rgba(0, 0, 0, 0.06)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={getRouteIcon(route.name)}
                        size={17}
                        color={isFocused ? '#ffffff' : colors.textSecondary}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: isFocused ? '800' : '600',
                        color: isFocused ? colors.primary : colors.text,
                      }}
                    >
                      {label}
                    </Text>
                  </View>

                  {isFocused && (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 10,
                        backgroundColor: colors.primary,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#ffffff' }}>
                        Activo
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function StudentTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <UnifiedTopNavBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'top' }}
    >
      <Tab.Screen
        name="StudentHome"
        component={StudentHomeScreen}
        options={{ title: 'Panel' }}
      />
      <Tab.Screen
        name="MyLearning"
        component={MyLearningScreen}
        options={{ title: 'Materias' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Perfil' }}
      />
    </Tab.Navigator>
  );
}

function PreceptorTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <UnifiedTopNavBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'top' }}
    >
      <Tab.Screen
        name="PreceptorHome"
        component={PreceptorDashboardScreen}
        options={{ title: 'Panel' }}
      />
      <Tab.Screen
        name="PreceptorAttendance"
        component={AttendanceScreen}
        options={{ title: 'Asistencia' }}
      />
      <Tab.Screen
        name="PreceptorStudents"
        component={InstructorStudentsScreen}
        options={{ title: 'Estudiantes' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Perfil' }}
      />
    </Tab.Navigator>
  );
}

function InstructorTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <UnifiedTopNavBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'top' }}
    >
      <Tab.Screen
        name="InstructorDashboard"
        component={InstructorDashboardScreen}
        options={{ title: 'Panel' }}
      />
      <Tab.Screen
        name="InstructorCourses"
        component={InstructorCoursesScreen}
        options={{ title: 'Materias' }}
      />
      <Tab.Screen
        name="InstructorStudents"
        component={InstructorStudentsScreen}
        options={{ title: 'Estudiantes' }}
      />
      <Tab.Screen
        name="InstructorAttendance"
        component={AttendanceScreen}
        options={{ title: 'Asistencia' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Perfil' }}
      />
    </Tab.Navigator>
  );
}

function AdminTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <UnifiedTopNavBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'top' }}
    >
      <Tab.Screen
        name="AdminDashboard"
        component={DashboardScreen}
        options={{ title: 'Panel' }}
      />
      <Tab.Screen
        name="AdminCourses"
        component={AdminCoursesScreen}
        options={{ title: 'Materias' }}
      />
      <Tab.Screen
        name="Users"
        component={UsersScreen}
        options={{ title: 'Estudiantes' }}
      />
      <Tab.Screen
        name="AdminAttendance"
        component={AttendanceScreen}
        options={{ title: 'Asistencia' }}
      />
      <Tab.Screen
        name="AdminSettings"
        component={AdminSettingsScreen}
        options={{ title: 'Panel Admin' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Perfil' }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="Welcome"
        component={WelcomeScreen}
        options={{ headerShown: false, title: 'Bienvenidos' }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: 'Iniciar sesión en Campus Técnica 5' }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: 'Crear cuenta académica' }}
      />
      <Stack.Screen
        name="VerifyCode"
        component={VerifyCodeScreen}
        options={{ title: 'Verificación de seguridad' }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, isLoading } = useAuth();
  const { colors, isDark } = useTheme();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  const RoleTabsComponent =
    user?.role === 'admin'
      ? AdminTabs
      : user?.role === 'preceptor'
      ? PreceptorTabs
      : user?.role === 'instructor'
      ? InstructorTabs
      : StudentTabs;

  const containerKey = user ? `nav_auth_${user.id}_${user.role}` : 'nav_guest';
  const initialNavState = useMemo(() => getSavedNavigationState(user), [containerKey]);

  return (
    <NavigationContainer
      key={containerKey}
      theme={navTheme}
      initialState={initialNavState}
      onStateChange={(state) => saveNavigationState(user, state)}
    >
      {user ? (
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.navy },
            headerTintColor: '#ffffff',
            headerTitleStyle: { fontWeight: '800' },
          }}
        >
          <Stack.Screen
            name="MainTabs"
            component={RoleTabsComponent}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Attendance"
            component={AttendanceScreen}
            options={{ title: 'Planilla Oficial de Asistencia' }}
          />
          <Stack.Screen
            name="CourseGroup"
            component={CourseGroupScreen}
            options={{ title: 'Curso y Cuadrícula de Horarios' }}
          />
          <Stack.Screen
            name="CourseDetail"
            component={CourseDetailScreen}
            options={{ title: 'Detalle del Curso' }}
          />
          <Stack.Screen
            name="LessonViewer"
            component={LessonViewerScreen}
            options={{ title: 'Aula Virtual • Lección' }}
          />
          <Stack.Screen
            name="AssignmentDetail"
            component={AssignmentDetailScreen}
            options={{ title: 'Evaluación Académica' }}
          />
          <Stack.Screen
            name="StudentExtras"
            component={StudentExtrasScreen}
            options={{ title: 'Certificados, Estadísticas y Agenda' }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: 'Mi Perfil y Seguridad' }}
          />
        </Stack.Navigator>
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}
