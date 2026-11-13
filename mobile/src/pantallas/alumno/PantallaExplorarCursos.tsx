// Importa los hooks de React para estado, efectos y callbacks.
import React, { useCallback, useEffect, useState } from 'react';
// Importa los componentes visuales nativos de React Native.
import { FlatList, Platform, RefreshControl, Text, View } from 'react-native';
// Importa el hook de foco de navegación.
import { useFocusEffect } from '@react-navigation/native';
// Importa los componentes reutilizables de la interfaz.
import { Button, Chips, Empty, ErrorBanner, Input, Loading, Screen } from '../../componentes/interfaz';
// Importa el componente de tarjeta de curso.
import CourseCard from '../../componentes/TarjetaCurso';
// Importa el servicio de API de cursos.
import { coursesApi } from '../../api/servicios';
// Importa el contexto de tema visual.
import { useTheme } from '../../contexto/ContextoTema';
// Importa la utilidad para extraer mensajes de error.
import { getErrorMessage } from '../../utilidades/errores';

// Define las opciones de filtrado por nivel de dificultad.
const LEVEL_OPTIONS = [
  { value: '', label: 'Todos los niveles' },
  { value: 'beginner', label: 'Inicial' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
];

// Define las opciones de ordenamiento del catálogo.
const SORT_OPTIONS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'popular', label: 'Más populares' },
  { value: 'duration', label: 'Menor duración' },
];

// Define las propiedades recibidas por la pantalla de exploración de cursos.
interface PropiedadesPantallaExplorarCursos {
  navigation: any;
}

// Renderiza el catálogo de cursos publicados con filtros de búsqueda, categoría y nivel.
export default function ExploreCoursesScreen({ navigation }: PropiedadesPantallaExplorarCursos) {
  // Obtiene la paleta de colores activa.
  const { colors } = useTheme();
  // Estados para categorías, cursos, filtros y carga.
  const [categories, setCategories] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [q, setQ] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const [sort, setSort] = useState<string>('recent');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Obtiene la lista de categorías disponibles al iniciar la pantalla.
  useEffect(() => {
    coursesApi.categories().then(setCategories).catch(() => {});
  }, []);

  // Consulta al servidor los cursos publicados que coinciden con los filtros activos.
  const load = useCallback(async () => {
    try {
      setError('');
      const res = await coursesApi.list({
        q: q.trim() || undefined,
        categoryId: categoryId || undefined,
        level: level || undefined,
        sort,
      });
      setCourses(res.data || []);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, categoryId, level, sort]);

  // Recarga el listado cuando la pantalla obtiene foco.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Restablece todos los filtros de búsqueda a sus valores por defecto.
  const clearFilters = (): void => {
    setQ('');
    setCategoryId('');
    setLevel('');
    setSort('recent');
  };

  // Muestra el indicador de carga mientras se obtienen los datos iniciales.
  if (loading) return <Loading />;

  // Construye las opciones de categorías para el selector de chips.
  const categoryOptions = [
    { value: '', label: 'Todas las categorías' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // Determina si hay algún filtro activo distinto al predeterminado.
  const hasFilters = !!(q || categoryId || level || sort !== 'recent');

  // Renderiza la grilla de cursos y la barra de filtros.
  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <FlatList
        key={Platform.OS === 'web' ? 'grid-3' : 'list-1'}
        numColumns={Platform.OS === 'web' ? 3 : 1}
        columnWrapperStyle={Platform.OS === 'web' ? { gap: 14 } : undefined}
        data={courses}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListHeaderComponent={
          <View>
            <Input
              value={q}
              onChangeText={setQ}
              placeholder="Buscar cursos por título, tema o habilidad..."
              returnKeyType="search"
            />
            <Chips label="Categoría" options={categoryOptions} value={categoryId} onChange={setCategoryId} />
            <Chips label="Nivel de dificultad" options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
            <Chips label="Ordenar por" options={SORT_OPTIONS} value={sort} onChange={setSort} />

            {hasFilters && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{courses.length} curso(s) encontrados</Text>
                <Button title="Limpiar filtros" variant="outline" small onPress={clearFilters} style={{ marginBottom: 0 }} />
              </View>
            )}

            <ErrorBanner message={error} onRetry={load} />
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1, minWidth: 280 }}>
            <CourseCard
              course={item}
              actionLabel="Ver detalles y programa"
              onPress={() => navigation.navigate('CourseDetail', { courseId: item.id })}
            />
          </View>
        )}
        ListEmptyComponent={
          !error ? (
            <Empty
              icon="search-outline"
              title="No se encontraron cursos"
              text="Probá cambiando las palabras de búsqueda o limpiando los filtros seleccionados."
              actionLabel="Restablecer filtros"
              onAction={clearFilters}
            />
          ) : null
        }
      />
    </Screen>
  );
}
