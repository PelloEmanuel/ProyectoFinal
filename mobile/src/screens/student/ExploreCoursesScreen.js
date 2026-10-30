/**
 * Archivo: mobile/src/screens/student/ExploreCoursesScreen.js
 * Descripción: Catálogo educativo de cursos publicados (Sección 7.7).
 * Permite búsqueda por texto, filtros por categoría, nivel, duración y ordenamiento.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Platform, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Chips, Empty, ErrorBanner, Input, Loading, Screen } from '../../components/ui';
import CourseCard from '../../components/CourseCard';
import { coursesApi } from '../../api/services';
import { useTheme } from '../../context/ThemeContext';
import { getErrorMessage } from '../../utils/errors';

const LEVEL_OPTIONS = [
  { value: '', label: 'Todos los niveles' },
  { value: 'beginner', label: 'Inicial' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'popular', label: 'Más populares' },
  { value: 'duration', label: 'Menor duración' },
];

export default function ExploreCoursesScreen({ navigation }) {
  const { colors } = useTheme();
  const [categories, setCategories] = useState([]);
  const [courses, setCourses] = useState([]);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [level, setLevel] = useState('');
  const [sort, setSort] = useState('recent');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    coursesApi.categories().then(setCategories).catch(() => {});
  }, []);

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const clearFilters = () => {
    setQ('');
    setCategoryId('');
    setLevel('');
    setSort('recent');
  };

  if (loading) return <Loading />;

  const categoryOptions = [
    { value: '', label: 'Todas las categorías' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const hasFilters = !!(q || categoryId || level || sort !== 'recent');

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
          !error && (
            <Empty
              icon="search-outline"
              title="No se encontraron cursos"
              text="Probá cambiando las palabras de búsqueda o limpiando los filtros seleccionados."
              actionLabel="Restablecer filtros"
              onAction={clearFilters}
            />
          )
        }
      />
    </Screen>
  );
}
