import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexto/ContextoAcceso';
import { useTheme } from '../contexto/ContextoTema';

// Importa las pantallas del flujo de autenticación.
import PantallaBienvenida from '../pantallas/acceso/PantallaBienvenida';
import PantallaInicioSesion from '../pantallas/acceso/PantallaInicioSesion';
import PantallaRegistro from '../pantallas/acceso/PantallaRegistro';
import PantallaVerificarCodigo from '../pantallas/acceso/PantallaVerificarCodigo';

// Importa el logotipo institucional y las pantallas del módulo de estudiantes.
const TECNICA_5_LOGO = require('../../assets/logo.png');
import PantallaInicioAlumno from '../pantallas/alumno/PantallaInicioAlumno';
import PantallaExplorarCursos from '../pantallas/alumno/PantallaExplorarCursos';
import PantallaMiAprendizaje from '../pantallas/alumno/PantallaMiAprendizaje';
import PantallaTareas from '../pantallas/alumno/PantallaTareas';
import PantallaDetalleCurso from '../pantallas/alumno/PantallaDetalleCurso';
import PantallaVisorLeccion from '../pantallas/alumno/PantallaVisorLeccion';
import PantallaDetalleTarea from '../pantallas/alumno/PantallaDetalleTarea';
import PantallaExtrasAlumno from '../pantallas/alumno/PantallaExtrasAlumno';

// Importa las pantallas del módulo de docentes.
import PantallaPanelDocente from '../pantallas/docente/PantallaPanelDocente';
import PantallaCursosDocente from '../pantallas/docente/PantallaCursosDocente';
import PantallaAlumnosDocente from '../pantallas/docente/PantallaAlumnosDocente';
import PantallaEntregasDocente from '../pantallas/docente/PantallaEntregasDocente';

// Importa las pantallas del módulo de administración.
import PantallaPanelAdmin from '../pantallas/admin/PantallaPanelAdmin';
import PantallaUsuarios from '../pantallas/admin/PantallaUsuarios';
import PantallaCursosAdmin from '../pantallas/admin/PantallaCursosAdmin';
import PantallaReportesAdmin from '../pantallas/admin/PantallaReportesAdmin';
import PantallaAjustesAdmin from '../pantallas/admin/PantallaAjustesAdmin';

// Importa las pantallas de preceptoría, asistencia, perfil y cuadrícula de horarios.
import PantallaPanelPreceptor from '../pantallas/preceptor/PantallaPanelPreceptor';
import PantallaAsistencia from '../pantallas/compartido/PantallaAsistencia';
import PantallaPerfil from '../pantallas/PantallaPerfil';
import PantallaGrupoCurso from '../pantallas/compartido/PantallaGrupoCurso';

// Define el prefijo de clave para persistir el estado de navegación en el navegador.
const NAV_STATE_KEY_PREFIX = 'CAMPUS_NAV_STATE_';

// Lista las rutas válidas de la pila principal autenticada.
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

// Define las pestañas permitidas según el rol institucional del usuario.
const ROLE_TAB_NAMES: Record<string, string[]> = {
  student: ['StudentHome', 'MyLearning', 'Profile'],
  instructor: ['InstructorDashboard', 'InstructorCourses', 'InstructorStudents', 'InstructorAttendance', 'Profile'],
  preceptor: ['PreceptorHome', 'PreceptorAttendance', 'PreceptorStudents', 'Profile'],
  admin: ['AdminDashboard', 'AdminCourses', 'Users', 'AdminReports', 'AdminSettings', 'AdminAttendance', 'Profile'],
};

// Recupera y valida el estado de navegación guardado para el usuario actual.
function getSavedNavigationState(user: any): any {
  if (!user || typeof window === 'undefined') return undefined;
  const key = `${NAV_STATE_KEY_PREFIX}${user.id}_${user.role}`;
  try {
    const raw = window.sessionStorage?.getItem(key) || window.localStorage?.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.routes) && parsed.routes.length > 0) {
      const allValid = parsed.routes.every((r: any) => r && VALID_STACK_ROUTES.includes(r.name));
      if (!allValid) return undefined;

      const mainTabRoute = parsed.routes.find((r: any) => r.name === 'MainTabs');
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

// Guarda el estado de navegación actual en sessionStorage y localStorage.
function saveNavigationState(user: any, state: any): void {
  if (!user || !state || typeof window === 'undefined') return;
  const key = `${NAV_STATE_KEY_PREFIX}${user.id}_${user.role}`;
  try {
    const serialized = JSON.stringify(state);
    window.sessionStorage?.setItem(key, serialized);
    window.localStorage?.setItem(key, serialized);
  } catch {}
}

// Crea las instancias de los navegadores de pila y de pestañas.
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Renderiza la barra superior unificada de navegación adaptable a dispositivos móviles y escritorio.
function UnifiedTopNavBar({ state, descriptors, navigation }: any): React.JSX.Element {
  const { colors, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [menuOpen, setMenuOpen] = useState(false);

  const profileRoute = state.routes.find((r: any) => r.name === 'Profile');
  const isProfileFocused = profileRoute ? state.index === state.routes.indexOf(profileRoute) : false;
  const mainRoutes = state.routes.filter((r: any) => r.name !== 'Profile');

  // Asigna el icono correspondiente a cada ruta de pestaña.
  const getRouteIcon = (routeName: string): any => {
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
        {/* Muestra el logotipo de Campus Técnica 5 y despliega el menú en pantallas móviles. */}
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

          {isMobile && (
            <Ionicons
              name={menuOpen ? 'chevron-down' : 'chevron-up'}
              size={isMobile ? 15 : 18}
              color={colors.text}
              style={{ marginLeft: 1 }}
            />
          )}
        </Pressable>

        {/* Renderiza las pestañas horizontales en pantallas de escritorio y tablet. */}
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
            {mainRoutes.map((route: any) => {
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

        {/* Renderiza los botones de cambio de tema visual y acceso a la cuenta del usuario. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 4 : 6, flexShrink: 0 }}>
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

      {/* Renderiza el menú desplegable vertical cuando se abre en pantallas móviles. */}
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
            {mainRoutes.map((route: any) => {
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

// Configura las pestañas de navegación para el rol de estudiante.
function StudentTabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      id="StudentTabs"
      tabBar={(props) => <UnifiedTopNavBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'top' }}
    >
      <Tab.Screen name="StudentHome" component={PantallaInicioAlumno} options={{ title: 'Panel' }} />
      <Tab.Screen name="MyLearning" component={PantallaMiAprendizaje} options={{ title: 'Materias' }} />
      <Tab.Screen name="Profile" component={PantallaPerfil} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

// Configura las pestañas de navegación para el rol de preceptor.
function PreceptorTabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      id="PreceptorTabs"
      tabBar={(props) => <UnifiedTopNavBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'top' }}
    >
      <Tab.Screen name="PreceptorHome" component={PantallaPanelPreceptor} options={{ title: 'Panel' }} />
      <Tab.Screen name="PreceptorAttendance" component={PantallaAsistencia} options={{ title: 'Asistencia' }} />
      <Tab.Screen name="PreceptorStudents" component={PantallaAlumnosDocente} options={{ title: 'Estudiantes' }} />
      <Tab.Screen name="Profile" component={PantallaPerfil} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

// Configura las pestañas de navegación para el rol de docente.
function InstructorTabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      id="InstructorTabs"
      tabBar={(props) => <UnifiedTopNavBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'top' }}
    >
      <Tab.Screen name="InstructorDashboard" component={PantallaPanelDocente} options={{ title: 'Panel' }} />
      <Tab.Screen name="InstructorCourses" component={PantallaCursosDocente} options={{ title: 'Materias' }} />
      <Tab.Screen name="InstructorStudents" component={PantallaAlumnosDocente} options={{ title: 'Estudiantes' }} />
      <Tab.Screen name="InstructorAttendance" component={PantallaAsistencia} options={{ title: 'Asistencia' }} />
      <Tab.Screen name="Profile" component={PantallaPerfil} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

// Configura las pestañas de navegación para el rol de administrador.
function AdminTabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      id="AdminTabs"
      tabBar={(props) => <UnifiedTopNavBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'top' }}
    >
      <Tab.Screen name="AdminDashboard" component={PantallaPanelAdmin} options={{ title: 'Panel' }} />
      <Tab.Screen name="AdminCourses" component={PantallaCursosAdmin} options={{ title: 'Materias' }} />
      <Tab.Screen name="Users" component={PantallaUsuarios} options={{ title: 'Estudiantes' }} />
      <Tab.Screen name="AdminAttendance" component={PantallaAsistencia} options={{ title: 'Asistencia' }} />
      <Tab.Screen name="AdminSettings" component={PantallaAjustesAdmin} options={{ title: 'Panel Admin' }} />
      <Tab.Screen name="Profile" component={PantallaPerfil} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

// Configura la pila de pantallas públicas de bienvenida, inicio de sesión, registro y verificación.
function AuthStack(): React.JSX.Element {
  const { colors } = useTheme();
  const { pendingVerification, oauthError } = useAuth();
  const initialRoute = pendingVerification
    ? 'VerifyCode'
    : oauthError
    ? 'Register'
    : 'Welcome';
  return (
    <Stack.Navigator
      id="AuthStack"
      key={`auth_stack_${initialRoute}_${pendingVerification?.userId || 0}`}
      initialRouteName={initialRoute}
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="Welcome" component={PantallaBienvenida} options={{ headerShown: false, title: 'Bienvenidos' }} />
      <Stack.Screen name="Login" component={PantallaInicioSesion} options={{ title: 'Iniciar sesión en Campus Técnica 5' }} />
      <Stack.Screen name="Register" component={PantallaRegistro} options={{ title: 'Crear cuenta académica' }} />
      <Stack.Screen
        name="VerifyCode"
        component={PantallaVerificarCodigo}
        initialParams={pendingVerification || undefined}
        options={{ title: 'Verificación de seguridad' }}
      />
    </Stack.Navigator>
  );
}

// Renderiza el contenedor principal de navegación seleccionando la pila correspondiente al estado de sesión.
export default function AppNavigator(): React.JSX.Element {
  const { user, isLoading } = useAuth();
  const { colors, isDark } = useTheme();

  // Muestra un indicador de carga mientras se restaura la sesión del dispositivo.
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

  // Construye el tema visual de React Navigation sincronizado con la paleta activa.
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

  // Selecciona el navegador de pestañas acorde al rol del usuario autenticado.
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
          id="MainStack"
          screenOptions={{
            headerStyle: { backgroundColor: colors.navy },
            headerTintColor: '#ffffff',
            headerTitleStyle: { fontWeight: '800' },
          }}
        >
          <Stack.Screen name="MainTabs" component={RoleTabsComponent} options={{ headerShown: false }} />
          <Stack.Screen name="Attendance" component={PantallaAsistencia} options={{ title: 'Planilla Oficial de Asistencia' }} />
          <Stack.Screen name="CourseGroup" component={PantallaGrupoCurso} options={{ title: 'Curso y Cuadrícula de Horarios' }} />
          <Stack.Screen name="CourseDetail" component={PantallaDetalleCurso} options={{ title: 'Detalle del Curso' }} />
          <Stack.Screen name="LessonViewer" component={PantallaVisorLeccion} options={{ title: 'Aula Virtual • Lección' }} />
          <Stack.Screen name="AssignmentDetail" component={PantallaDetalleTarea} options={{ title: 'Evaluación Académica' }} />
          <Stack.Screen
            name="StudentExtras"
            component={PantallaExtrasAlumno}
            options={({ route }: any) => ({
              title: route?.params?.section === 'calendar' ? 'Calendario' : 'Notificaciones',
            })}
          />
          <Stack.Screen name="Profile" component={PantallaPerfil} options={{ title: 'Mi Perfil y Seguridad' }} />
        </Stack.Navigator>
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}
