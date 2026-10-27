import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/ui';
import { colors } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import VerifyCodeScreen from '../screens/auth/VerifyCodeScreen';
import TaskListScreen from '../screens/tasks/TaskListScreen';
import TaskFormScreen from '../screens/tasks/TaskFormScreen';
import DashboardScreen from '../screens/admin/DashboardScreen';
import UsersScreen from '../screens/admin/UsersScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const headerStyle = { headerTintColor: colors.text, headerStyle: { backgroundColor: colors.card }, headerShadowVisible: false };

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ ...headerStyle, headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} options={{ headerShown: true, title: 'Verificación' }} />
    </Stack.Navigator>
  );
}

function TasksStack() {
  const { user } = useAuth();
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="TaskList" component={TaskListScreen} options={{ title: user.role === 'user' ? 'Mis tareas' : 'Tareas' }} />
      <Stack.Screen name="TaskForm" component={TaskFormScreen} />
    </Stack.Navigator>
  );
}

const icons = { TasksTab: 'checkbox-outline', Dashboard: 'stats-chart-outline', Users: 'people-outline', Profile: 'person-circle-outline' };

/** Las pestañas visibles dependen del rol: user < manager < admin. */
function MainTabs() {
  const { user } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...headerStyle,
        tabBarActiveTintColor: colors.primary,
        tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="TasksTab" component={TasksStack} options={{ title: 'Tareas', headerShown: false }} />
      {(user.role === 'manager' || user.role === 'admin') && (
        <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Panel' }} />
      )}
      {user.role === 'admin' && <Tab.Screen name="Users" component={UsersScreen} options={{ title: 'Usuarios' }} />}
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { loading, user } = useAuth();
  if (loading) return <Loading />;
  return <NavigationContainer>{user ? <MainTabs /> : <AuthStack />}</NavigationContainer>;
}
