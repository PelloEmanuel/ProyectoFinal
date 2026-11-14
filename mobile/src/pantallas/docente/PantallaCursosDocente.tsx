// Importa React, componentes nativos, navegación, contextos, servicios y componentes del tablón.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexto/ContextoTema';
import { useAuth } from '../../contexto/ContextoAcceso';
import { assignmentsApi, coursesApi, instructorApi } from '../../api/servicios';
import { resolveAssetUrl } from '../../configuracion/indice';
import { extractErrorMessage } from '../../utilidades/errores';
import { formatDateAR } from '../../utilidades/fechas';
import { formatSchoolGroupShort } from '../../componentes/GrillaHorarios';
import FileUploader from '../../componentes/SubidorArchivos';
import TablonFeed from '../../componentes/MuroTablon';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Chip,
  ConfirmModal,
  EmptyState,
  Input,
  SectionHeader,
} from '../../componentes/interfaz';

// Define las familias de colores e intensidades configurables por el docente para cada materia.
export const COLOR_FAMILIES = [
  {
    id: 'red',
    name: 'Rojo',
    shades: [
      { id: 'lightest', label: 'Pastel', hex: '#f87171' },
      { id: 'light', label: 'Claro', hex: '#ef4444' },
      { id: 'vibrant', label: 'Vibrante', hex: '#dc2626' },
      { id: 'dark', label: 'Oscuro', hex: '#b91c1c' },
      { id: 'darkest', label: 'Profundo', hex: '#7f1d1d' },
    ],
  },
  {
    id: 'orange',
    name: 'Naranja',
    shades: [
      { id: 'lightest', label: 'Pastel', hex: '#fb923c' },
      { id: 'light', label: 'Claro', hex: '#f97316' },
      { id: 'vibrant', label: 'Vibrante', hex: '#ea580c' },
      { id: 'dark', label: 'Oscuro', hex: '#c2410c' },
      { id: 'darkest', label: 'Profundo', hex: '#7c2d12' },
    ],
  },
  {
    id: 'amber',
    name: 'Ámbar / Amarillo',
    shades: [
      { id: 'lightest', label: 'Pastel', hex: '#fcd34d' },
      { id: 'light', label: 'Claro', hex: '#fbbf24' },
      { id: 'vibrant', label: 'Vibrante', hex: '#f59e0b' },
      { id: 'dark', label: 'Oscuro', hex: '#d97706' },
      { id: 'darkest', label: 'Profundo', hex: '#92400e' },
    ],
  },
  {
    id: 'green',
    name: 'Verde',
    shades: [
      { id: 'lightest', label: 'Pastel', hex: '#4ade80' },
      { id: 'light', label: 'Claro', hex: '#22c55e' },
      { id: 'vibrant', label: 'Vibrante', hex: '#16a34a' },
      { id: 'dark', label: 'Oscuro', hex: '#15803d' },
      { id: 'darkest', label: 'Profundo', hex: '#14532d' },
    ],
  },
  {
    id: 'teal',
    name: 'Turquesa',
    shades: [
      { id: 'lightest', label: 'Pastel', hex: '#2dd4bf' },
      { id: 'light', label: 'Claro', hex: '#14b8a6' },
      { id: 'vibrant', label: 'Vibrante', hex: '#0d9488' },
      { id: 'dark', label: 'Oscuro', hex: '#0f766e' },
      { id: 'darkest', label: 'Profundo', hex: '#115e59' },
    ],
  },
  {
    id: 'blue',
    name: 'Azul',
    shades: [
      { id: 'lightest', label: 'Pastel', hex: '#60a5fa' },
      { id: 'light', label: 'Claro', hex: '#3b82f6' },
      { id: 'vibrant', label: 'Vibrante', hex: '#2563eb' },
      { id: 'dark', label: 'Oscuro', hex: '#1d4ed8' },
      { id: 'darkest', label: 'Profundo', hex: '#1e3a8a' },
    ],
  },
  {
    id: 'purple',
    name: 'Violeta',
    shades: [
      { id: 'lightest', label: 'Pastel', hex: '#c084fc' },
      { id: 'light', label: 'Claro', hex: '#a855f7' },
      { id: 'vibrant', label: 'Vibrante', hex: '#9333ea' },
      { id: 'dark', label: 'Oscuro', hex: '#7c3aed' },
      { id: 'darkest', label: 'Profundo', hex: '#581c87' },
    ],
  },
  {
    id: 'pink',
    name: 'Rosa',
    shades: [
      { id: 'lightest', label: 'Pastel', hex: '#f472b6' },
      { id: 'light', label: 'Claro', hex: '#ec4899' },
      { id: 'vibrant', label: 'Vibrante', hex: '#db2777' },
      { id: 'dark', label: 'Oscuro', hex: '#be185d' },
      { id: 'darkest', label: 'Profundo', hex: '#831843' },
    ],
  },
  {
    id: 'slate',
    name: 'Pizarra / Carbón',
    shades: [
      { id: 'lightest', label: 'Pastel', hex: '#94a3b8' },
      { id: 'light', label: 'Claro', hex: '#64748b' },
      { id: 'vibrant', label: 'Vibrante', hex: '#475569' },
      { id: 'dark', label: 'Oscuro', hex: '#334155' },
      { id: 'darkest', label: 'Profundo', hex: '#0f172a' },
    ],
  },
];

// Construye un objeto de paleta visual a partir de un código hexadecimal personalizado.
export function buildCoursePaletteFromHex(hex?: string | null) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
    return COURSE_THEME_PALETTES[0];
  }
  return {
    solidBg: hex,
    borderColor: 'rgba(0, 0, 0, 0.3)',
    accent: '#ffffff',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeBorder: 'rgba(255, 255, 255, 0.38)',
    descColor: '#f8fafc',
  };
}

// Declara la lista de paletas sólidas predeterminadas para encabezar las materias.
export const COURSE_THEME_PALETTES = [
  {
    solidBg: '#b91c1c',
    borderColor: '#991b1b',
    accent: '#f87171',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeBorder: 'rgba(255, 255, 255, 0.38)',
    descColor: '#fee2e2',
  },
  {
    solidBg: '#1d4ed8',
    borderColor: '#1e40af',
    accent: '#60a5fa',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeBorder: 'rgba(255, 255, 255, 0.38)',
    descColor: '#e0e7ff',
  },
  {
    solidBg: '#059669',
    borderColor: '#047857',
    accent: '#34d399',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeBorder: 'rgba(255, 255, 255, 0.38)',
    descColor: '#d1fae5',
  },
  {
    solidBg: '#7c3aed',
    borderColor: '#6d28d9',
    accent: '#c084fc',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeBorder: 'rgba(255, 255, 255, 0.38)',
    descColor: '#ede9fe',
  },
  {
    solidBg: '#d97706',
    borderColor: '#b45309',
    accent: '#fbbf24',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeBorder: 'rgba(255, 255, 255, 0.38)',
    descColor: '#fef3c7',
  },
  {
    solidBg: '#be185d',
    borderColor: '#9d174d',
    accent: '#f472b6',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeBorder: 'rgba(255, 255, 255, 0.38)',
    descColor: '#fce7f3',
  },
];

// Renderiza la pantalla de materias del docente con espacio de trabajo, módulos, teoría, avisos y tablón.
export default function InstructorCoursesScreen({ route, navigation }: { route: any; navigation: any }) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 768;
  const [courses, setCourses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [activeCourse, setActiveCourse] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('tablon');
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [, setCourseSubmissions] = useState<any[]>([]);

  const [selectedGroupFilter, setSelectedGroupFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Agrupa los cursos escolares únicos en los que el docente dicta materias.
  const courseGroups = useMemo(() => {
    const map = new Map<string, any>();
    (courses || []).forEach((c) => {
      const sy = Number(c.schoolYear) || 1;
      const cd = Number(c.courseDivision) || 1;
      const key = `${sy}-${cd}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          schoolYear: sy,
          courseDivision: cd,
          label: formatSchoolGroupShort(sy, cd),
          fullLabel: `${sy}° Año - ${cd}° Curso`,
          count: 0,
        });
      }
      map.get(key).count += 1;
    });
    return Array.from(map.values()).sort(
      (a, b) => a.schoolYear - b.schoolYear || a.courseDivision - b.courseDivision
    );
  }, [courses]);

  // Filtra las materias del docente según el grupo escolar y término de búsqueda.
  const filteredCourses = useMemo(() => {
    return (courses || []).filter((c) => {
      const sy = Number(c.schoolYear) || 1;
      const cd = Number(c.courseDivision) || 1;
      const key = `${sy}-${cd}`;

      if (selectedGroupFilter !== 'ALL' && key !== selectedGroupFilter) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = (c.title || '').toLowerCase().includes(q);
      const catMatch = (c.categoryName || '').toLowerCase().includes(q);
      const groupMatch = (c.schoolGroupLabel || '').toLowerCase().includes(q);
      return titleMatch || catMatch || groupMatch;
    });
  }, [courses, selectedGroupFilter, searchQuery]);

  const [colorModalOpen, setColorModalOpen] = useState(false);
  const [selectedColorFamily, setSelectedColorFamily] = useState('red');
  const [selectedIntensity, setSelectedIntensity] = useState('dark');
  const [draftHexColor, setDraftHexColor] = useState('#b91c1c');
  const [savingColor, setSavingColor] = useState(false);

  // Obtiene la paleta cromática activa de la materia seleccionada.
  const coursePalette = useMemo(() => {
    if (!activeCourse) return COURSE_THEME_PALETTES[0];
    if (activeCourse.themeColor) {
      return buildCoursePaletteFromHex(activeCourse.themeColor);
    }
    const idx = Math.abs(Number(activeCourse.id) || 0) % COURSE_THEME_PALETTES.length;
    return COURSE_THEME_PALETTES[idx];
  }, [activeCourse]);

  const [, setGradingInputs] = useState<Record<string | number, any>>({});

  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [courseForm, setCourseForm] = useState<any>({
    title: '',
    summary: '',
    description: '',
    categoryId: '',
    level: 'beginner',
    estimatedHours: '12',
    status: 'draft',
    skillIds: [],
  });
  const [savingCourse, setSavingCourse] = useState(false);

  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [moduleForm, setModuleForm] = useState({ title: '', description: '' });
  const [savingModule, setSavingModule] = useState(false);

  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [targetModuleId, setTargetModuleId] = useState<any>(null);
  const [lessonForm, setLessonForm] = useState<any>({
    title: '',
    lessonType: 'reading',
    estimatedMinutes: '20',
    contentText: '',
    videoUrl: '',
    attachments: [],
  });
  const [savingLesson, setSavingLesson] = useState(false);

  const [annForm, setAnnForm] = useState<any>({ title: '', content: '', isPinned: false, attachments: [] });
  const [savingAnn, setSavingAnn] = useState(false);

  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState<any>(null);

  // Carga las materias asignadas, categorías y habilidades desde la API.
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      const [coursesRes, catRes, skillsRes] = await Promise.all([
        instructorApi.getCourses(),
        coursesApi.getCategories(),
        coursesApi.getSkills(),
      ]);
      const list = coursesRes.data.data || [];
      setCourses(list);
      setCategories(catRes.data.data || []);
      setSkills(skillsRes.data.data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recarga la lista de materias al enfocar la pantalla.
  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [loadData])
  );

  // Abre el espacio de trabajo completo de una materia con sus módulos, entregas y avisos.
  const openCourseWorkspace = useCallback(async (courseId: number | string) => {
    try {
      setLoadingWorkspace(true);
      setError('');
      const [res, subs] = await Promise.all([
        coursesApi.getById(courseId),
        instructorApi.attempts({ courseId }).catch(() => []),
      ]);
      setActiveCourse(res.data.data);
      const listSubs = Array.isArray(subs) ? subs : subs?.data || [];
      setCourseSubmissions(listSubs);
      const initialGrades: Record<string | number, any> = {};
      listSubs.forEach((s: any) => {
        initialGrades[s.id] = {
          score: s.score !== null && s.score !== undefined ? String(s.score) : '',
          feedback: s.feedback || '',
        };
      });
      setGradingInputs(initialGrades);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  // Procesa parámetros de navegación para filtrar grupos o abrir la edición de un curso.
  useEffect(() => {
    if (route.params?.filterGroupKey) {
      setSelectedGroupFilter(route.params.filterGroupKey);
      navigation.setParams({ filterGroupKey: undefined });
    }
    if (route.params?.openCreate && categories.length > 0) {
      openCreateCourseModal();
      navigation.setParams({ openCreate: undefined });
    }
    if (route.params?.editCourseId) {
      const targetId = route.params.editCourseId;
      navigation.setParams({ editCourseId: undefined });
      navigation.navigate('CourseDetail', { courseId: targetId });
    }
  }, [route.params, categories, navigation, openCourseWorkspace]);

  // Inicializa el formulario modal para crear una nueva materia.
  const openCreateCourseModal = () => {
    setEditingCourse(null);
    setCourseForm({
      title: '',
      summary: '',
      description: '',
      categoryId: categories[0]?.id || 1,
      level: 'beginner',
      estimatedHours: '12',
      status: 'published',
      skillIds: skills.slice(0, 2).map((s: any) => s.id),
    });
    setCourseModalOpen(true);
  };

  // Guarda una materia nueva o actualiza una existente en el servidor.
  const handleSaveCourse = async () => {
    if (!courseForm.title.trim() || !courseForm.summary.trim()) {
      setError('Completá el título y el resumen del curso.');
      return;
    }
    try {
      setSavingCourse(true);
      setError('');
      const payload = {
        title: courseForm.title.trim(),
        summary: courseForm.summary.trim(),
        description: courseForm.description.trim() || courseForm.summary.trim(),
        categoryId: Number(courseForm.categoryId) || categories[0]?.id || 1,
        level: courseForm.level,
        estimatedHours: Number(courseForm.estimatedHours) || 10,
        status: courseForm.status,
        skillIds: courseForm.skillIds,
      };
      if (editingCourse) {
        await coursesApi.update(editingCourse.id, payload);
        setSuccess('Curso actualizado correctamente.');
        if (activeCourse?.id === editingCourse.id) {
          await openCourseWorkspace(editingCourse.id);
        }
      } else {
        const res = await coursesApi.create(payload);
        setSuccess('Curso creado exitosamente.');
        if (res.data?.data?.id) {
          await openCourseWorkspace(res.data.data.id);
        }
      }
      setCourseModalOpen(false);
      await loadData(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingCourse(false);
    }
  };

  // Elimina un curso tras confirmar la acción en el modal.
  const handleDeleteCourse = async () => {
    if (!confirmDeleteCourse) return;
    try {
      await coursesApi.remove(confirmDeleteCourse.id);
      setSuccess('Curso eliminado.');
      if (activeCourse?.id === confirmDeleteCourse.id) {
        setActiveCourse(null);
      }
      setConfirmDeleteCourse(null);
      await loadData(true);
    } catch (err) {
      setError(extractErrorMessage(err));
      setConfirmDeleteCourse(null);
    }
  };

  // Crea un nuevo módulo temático dentro de la materia activa.
  const handleCreateModule = async () => {
    if (!moduleForm.title.trim() || !activeCourse) return;
    try {
      setSavingModule(true);
      await coursesApi.createModule(activeCourse.id, {
        title: moduleForm.title.trim(),
        description: moduleForm.description.trim(),
      });
      setModuleForm({ title: '', description: '' });
      setModuleModalOpen(false);
      setSuccess('Módulo agregado al curso.');
      await openCourseWorkspace(activeCourse.id);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingModule(false);
    }
  };

  // Elimina un módulo de la materia activa.
  const handleDeleteModule = async (moduleId: number | string) => {
    try {
      await coursesApi.deleteModule(moduleId);
      setSuccess('Módulo eliminado.');
      await openCourseWorkspace(activeCourse.id);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  // Sube un nuevo material teórico o lección asegurando que exista un módulo contenedor.
  const handleCreateLesson = async () => {
    if (!activeCourse) return;
    if (!lessonForm.title.trim()) {
      setError('Por favor ingresá el título del material de teoría o lección.');
      return;
    }

    try {
      setSavingLesson(true);
      setError('');

      let moduleId = targetModuleId;
      if (!moduleId && Array.isArray(activeCourse.modules) && activeCourse.modules.length > 0) {
        moduleId = activeCourse.modules[0].id;
      }

      if (!moduleId) {
        const newModRes = await coursesApi.createModule(activeCourse.id, {
          title: 'Módulo 1: Teoría y Material de Estudio',
          description: 'Material de lectura y apuntes teóricos de la materia',
        });
        const createdMod = newModRes?.data?.data || newModRes?.data || newModRes;
        moduleId = createdMod?.id;
      }

      if (!moduleId) {
        throw new Error('No se pudo inicializar el módulo para este material.');
      }

      const lessonContent =
        lessonForm.contentText.trim() ||
        (lessonForm.attachments && lessonForm.attachments.length > 0
          ? `Material de estudio con ${lessonForm.attachments.length} archivo(s) adjunto(s).`
          : `Material de estudio y teoría de "${lessonForm.title.trim()}".`);

      await coursesApi.createLesson(moduleId, {
        title: lessonForm.title.trim(),
        lessonType: lessonForm.lessonType || 'reading',
        estimatedMinutes: Number(lessonForm.estimatedMinutes) || 15,
        content: lessonContent,
        contentText: lessonContent,
        videoUrl: lessonForm.videoUrl.trim() || null,
        attachments: lessonForm.attachments || [],
      });

      setLessonForm({
        title: '',
        lessonType: 'reading',
        estimatedMinutes: '20',
        contentText: '',
        videoUrl: '',
        attachments: [],
      });
      setLessonModalOpen(false);
      setSuccess('Material de teoría guardado y cargado en la materia.');
      await openCourseWorkspace(activeCourse.id);
    } catch (err) {
      console.error('Error al guardar material teórico:', err);
      setError(extractErrorMessage(err));
    } finally {
      setSavingLesson(false);
    }
  };

  // Elimina una lección o material teórico específico.
  const handleDeleteLesson = async (lessonId: number | string) => {
    try {
      await coursesApi.deleteLesson(lessonId);
      setSuccess('Lección eliminada.');
      await openCourseWorkspace(activeCourse.id);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  // Publica un nuevo aviso o comunicado oficial en la materia activa.
  const handlePostAnnouncement = async () => {
    if (!activeCourse) return;
    if (!annForm.content.trim()) {
      setError('Por favor ingresá el mensaje del aviso.');
      return;
    }
    try {
      setSavingAnn(true);
      setError('');
      const cleanContent = annForm.content.trim();
      const generatedTitle =
        cleanContent.length > 50 ? `${cleanContent.slice(0, 47)}...` : cleanContent;

      await coursesApi.createAnnouncement(activeCourse.id, {
        title: generatedTitle,
        content: cleanContent,
        isPinned: annForm.isPinned || false,
        attachments: annForm.attachments || [],
      });
      setAnnForm({ title: '', content: '', isPinned: false, attachments: [] });
      setSuccess('Aviso publicado con éxito y notificado a los alumnos.');
      await openCourseWorkspace(activeCourse.id);
    } catch (err) {
      console.error('Error al publicar anuncio:', err);
      setError(extractErrorMessage(err));
    } finally {
      setSavingAnn(false);
    }
  };

  // Abre el selector de color preseleccionando la tonalidad actual de la materia.
  const openColorPickerModal = () => {
    const currentHex = activeCourse?.themeColor || coursePalette.solidBg || '#b91c1c';
    setDraftHexColor(currentHex);
    const foundFam = COLOR_FAMILIES.find((fam) =>
      fam.shades.some((s) => s.hex.toLowerCase() === currentHex.toLowerCase())
    );
    if (foundFam) {
      setSelectedColorFamily(foundFam.id);
      const foundShade = foundFam.shades.find(
        (s) => s.hex.toLowerCase() === currentHex.toLowerCase()
      );
      if (foundShade) setSelectedIntensity(foundShade.id);
    }
    setColorModalOpen(true);
  };

  // Guarda el color personalizado elegido por el docente para la materia.
  const handleSaveCourseColor = async (colorToSave = draftHexColor) => {
    if (!activeCourse) return;
    const cleanHex = String(colorToSave || '').trim();
    if (!cleanHex.startsWith('#') || cleanHex.length < 4) {
      setError('Por favor ingresá un código hexadecimal de color válido (ej. #b91c1c).');
      return;
    }
    try {
      setSavingColor(true);
      setError('');
      setSuccess('');
      await coursesApi.update(activeCourse.id, { themeColor: cleanHex });
      setActiveCourse((prev: any) => (prev ? { ...prev, themeColor: cleanHex } : prev));
      setCourses((prev) =>
        prev.map((c) => (c.id === activeCourse.id ? { ...c, themeColor: cleanHex } : c))
      );
      setSuccess(`Color de "${activeCourse.title}" actualizado exitosamente.`);
      setColorModalOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingColor(false);
    }
  };

  if (loading && courses.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={colors.primary}
          />
        }
      >
        <AlertBanner type="error" message={error} />
        <AlertBanner type="success" message={success} />

        {activeCourse ? (
          <View>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setActiveCourse(null)}
            >
              <Ionicons name="arrow-back" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                Volver a la lista de mis cursos
              </Text>
            </TouchableOpacity>

            <View
              style={{
                backgroundColor: coursePalette.solidBg,
                borderColor: coursePalette.borderColor,
                borderWidth: 1.5,
                borderRadius: 18,
                padding: 18,
                marginBottom: 14,
                overflow: 'hidden',
                shadowColor: coursePalette.solidBg,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <View style={{ position: 'absolute', right: 28, top: -15, transform: [{ rotate: '-18deg' }], pointerEvents: 'none' }}>
                <Ionicons name="school" size={130} color="rgba(255, 255, 255, 0.16)" />
              </View>
              <View style={{ position: 'absolute', right: 175, top: 25, transform: [{ rotate: '22deg' }], pointerEvents: 'none' }}>
                <Ionicons name="school" size={78} color="rgba(255, 255, 255, 0.12)" />
              </View>
              <View style={{ position: 'absolute', right: 95, bottom: 22, pointerEvents: 'none' }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fbbf24' }} />
              </View>

              <View style={styles.rowBetween}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1, marginRight: 8 }}>
                  <View
                    style={{
                      backgroundColor: coursePalette.badgeBg,
                      borderColor: coursePalette.badgeBorder,
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>
                      {activeCourse.schoolGroupLabel ||
                        `${activeCourse.schoolYear || 1}° Año - ${activeCourse.courseDivision || 1}° Curso`}
                    </Text>
                  </View>

                  <View
                    style={{
                      backgroundColor: coursePalette.badgeBg,
                      borderColor: coursePalette.badgeBorder,
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                      👥 {activeCourse.enrolledCount || 0} alumnos
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={openColorPickerModal}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: 'rgba(0, 0, 0, 0.28)',
                    borderColor: 'rgba(255, 255, 255, 0.45)',
                    borderWidth: 1,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: 12,
                  }}
                >
                  <Ionicons name="color-palette" size={16} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>
                    Cambiar color
                  </Text>
                </TouchableOpacity>
              </View>

              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '800',
                  color: '#ffffff',
                  marginTop: 10,
                  letterSpacing: 0.2,
                }}
              >
                {activeCourse.title}
              </Text>

              {!!activeCourse.summary && (
                <Text
                  style={{
                    color: coursePalette.descColor,
                    fontSize: 13,
                    marginTop: 4,
                    lineHeight: 19,
                    fontWeight: '500',
                  }}
                >
                  {activeCourse.summary}
                </Text>
              )}

              {(activeCourse.schedules || []).length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {activeCourse.schedules.map((sch: any) => (
                    <View
                      key={sch.id}
                      style={{
                        backgroundColor: coursePalette.badgeBg,
                        borderColor: coursePalette.badgeBorder,
                        borderWidth: 1,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>
                        🕒 {sch.dayOfWeek} {sch.startTime} a {sch.endTime}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.tabsRow}>
              <Chip
                label="Tablón Principal"
                selected={activeTab === 'tablon'}
                onPress={() => setActiveTab('tablon')}
              />
              <Chip
                label={`Teoría (${(activeCourse.modules || []).length})`}
                selected={activeTab === 'modules'}
                onPress={() => setActiveTab('modules')}
              />
              <Chip
                label={`Avisos (${(activeCourse.announcements || []).length})`}
                selected={activeTab === 'announcements'}
                onPress={() => setActiveTab('announcements')}
              />
            </View>

            {loadingWorkspace && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
            )}

            {activeTab === 'tablon' && (
              <TablonFeed
                course={activeCourse}
                isInstructor={true}
                user={user}
                onRefreshCourse={() => openCourseWorkspace(activeCourse.id)}
                hideHeroBanner={true}
              />
            )}

            {activeTab === 'modules' && (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <Button
                    title="+ Subir material teórico"
                    icon="cloud-upload-outline"
                    onPress={() => {
                      if (activeCourse.modules && activeCourse.modules.length > 0) {
                        setTargetModuleId(activeCourse.modules[0].id);
                      } else {
                        setTargetModuleId(null);
                      }
                      setLessonModalOpen(true);
                    }}
                    style={{ flex: 1, marginBottom: 0 }}
                  />
                  <Button
                    title="+ Nuevo módulo"
                    icon="folder-outline"
                    variant="outline"
                    onPress={() => setModuleModalOpen(true)}
                    style={{ flex: 1, marginBottom: 0 }}
                  />
                </View>

                <SectionHeader
                  title="Estructura de módulos y lecciones"
                  subtitle="Organización de clases, apuntes y contenido teórico"
                />
                {(activeCourse.modules || []).length === 0 ? (
                  <EmptyState
                    icon="layers-outline"
                    title="Aún no hay módulos de teoría"
                    message="Podés subir material teórico directamente o crear módulos temáticos para organizarlo."
                    actionLabel="Subir primer material teórico"
                    onAction={() => {
                      setTargetModuleId(null);
                      setLessonModalOpen(true);
                    }}
                  />
                ) : (
                  (activeCourse.modules || []).map((mod: any, idx: number) => (
                    <Card key={mod.id}>
                      <View style={styles.rowBetween}>
                        <Text style={[styles.moduleTitle, { color: colors.text }]}>
                          Módulo {idx + 1}: {mod.title}
                        </Text>
                        <TouchableOpacity onPress={() => handleDeleteModule(mod.id)}>
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                      {mod.description ? (
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                          {mod.description}
                        </Text>
                      ) : null}

                      <View style={{ marginTop: 10 }}>
                        {(mod.lessons || []).map((lesson: any, lIdx: number) => (
                          <View
                            key={lesson.id}
                            style={[styles.lessonRow, { borderColor: colors.border }]}
                          >
                            <Ionicons
                              name={
                                lesson.lessonType === 'video'
                                  ? 'play-circle-outline'
                                  : lesson.lessonType === 'code_lab'
                                  ? 'code-slash-outline'
                                  : 'document-text-outline'
                              }
                              size={18}
                              color={colors.primary}
                            />
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
                                {lIdx + 1}. {lesson.title}
                              </Text>
                              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                                {lesson.estimatedMinutes} min • {lesson.lessonType}
                              </Text>
                              {Array.isArray(lesson.attachments) && lesson.attachments.length > 0 && (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                  {lesson.attachments.map((att: any, aIdx: number) => (
                                    <TouchableOpacity
                                      key={att.id || aIdx}
                                      onPress={() => {
                                        const u = resolveAssetUrl(att.url);
                                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                          window.open(u, '_blank');
                                        } else {
                                          Linking.openURL(u);
                                        }
                                      }}
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 3,
                                        paddingVertical: 2,
                                        paddingHorizontal: 6,
                                        borderRadius: 6,
                                        backgroundColor: `${colors.primary}15`,
                                      }}
                                    >
                                      <Ionicons name="document-attach" size={12} color={colors.primary} />
                                      <Text
                                        style={{ fontSize: 10, color: colors.primary, fontWeight: '700' }}
                                        numberOfLines={1}
                                      >
                                        {att.name || 'Adjunto'}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              )}
                            </View>
                            <TouchableOpacity
                              onPress={() =>
                                navigation.navigate('LessonViewer', {
                                  lessonId: lesson.id,
                                  courseId: activeCourse.id,
                                })
                              }
                              style={{ marginRight: 10 }}
                            >
                              <Ionicons name="eye-outline" size={18} color={colors.info} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteLesson(lesson.id)}>
                              <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>

                      <Button
                        title="+ Subir material a este módulo"
                        variant="outline"
                        onPress={() => {
                          setTargetModuleId(mod.id);
                          setLessonModalOpen(true);
                        }}
                        style={{ marginTop: 10, minHeight: 38, paddingVertical: 8 }}
                      />
                    </Card>
                  ))
                )}
              </View>
            )}

            {activeTab === 'announcements' && (
              <View style={{ marginTop: 12 }}>
                <Card>
                  <Text style={[styles.moduleTitle, { color: colors.text, marginBottom: 10 }]}>
                    Publicar aviso a la cursada
                  </Text>
                  <Input
                    label="Mensaje del comunicado"
                    value={annForm.content}
                    onChangeText={(v) => setAnnForm((p: any) => ({ ...p, content: v }))}
                    placeholder="Escribí el comunicado para los alumnos..."
                    multiline
                    numberOfLines={4}
                  />
                  <FileUploader
                    attachments={annForm.attachments || []}
                    onChange={(att) => setAnnForm((p: any) => ({ ...p, attachments: att }))}
                    label="Archivos adjuntos del comunicado (PDFs, DOCX, imágenes, links)"
                    description="Arrastrá o seleccioná archivos para acompañar este aviso"
                  />
                  <Button
                    title="Publicar y notificar"
                    icon="megaphone-outline"
                    loading={savingAnn}
                    onPress={handlePostAnnouncement}
                  />
                </Card>

                {(activeCourse.announcements || []).map((ann: any) => (
                  <Card key={ann.id}>
                    <View style={styles.rowBetween}>
                      <Badge label={ann.isPinned ? 'Destacado' : 'Aviso'} tone="info" />
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {formatDateAR(ann.createdAt || ann.publishedAt, true)}
                      </Text>
                    </View>
                    <Text style={[styles.moduleTitle, { color: colors.text, marginTop: 6 }]}>
                      {ann.title}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                      {ann.content}
                    </Text>
                    {Array.isArray(ann.attachments) && ann.attachments.length > 0 && (
                      <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {ann.attachments.map((att: any, i: number) => (
                          <TouchableOpacity
                            key={att.id || i}
                            onPress={() => {
                              const u = resolveAssetUrl(att.url);
                              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                window.open(u, '_blank');
                              } else {
                                Linking.openURL(u);
                              }
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              paddingVertical: 4,
                              paddingHorizontal: 8,
                              borderRadius: 8,
                              backgroundColor: `${colors.primary}15`,
                              borderWidth: 1,
                              borderColor: `${colors.primary}30`,
                            }}
                          >
                            <Ionicons
                              name={att.type === 'link' || att.kind === 'link' ? 'link' : 'document-attach'}
                              size={14}
                              color={colors.primary}
                            />
                            <Text
                              style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}
                              numberOfLines={1}
                            >
                              {att.name || 'Archivo adjunto'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </Card>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View>
            <SectionHeader
              title="Mis Materias Asignadas"
              subtitle="Materias y horarios asignados por el Administrador para subir teoría, actividades y evaluar"
            />

            {courses.length > 0 && (
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 16,
                  padding: 14,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="filter" size={16} color={colors.primary} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: colors.text,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Filtrar por Curso
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>
                    {filteredCourses.length} de {courses.length} materias
                  </Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                >
                  <TouchableOpacity
                    onPress={() => setSelectedGroupFilter('ALL')}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor:
                        selectedGroupFilter === 'ALL'
                          ? colors.primary
                          : colors.mode === 'light'
                          ? '#f1f5f9'
                          : '#1e293b',
                      borderWidth: 1.5,
                      borderColor: selectedGroupFilter === 'ALL' ? colors.primary : colors.border,
                    }}
                  >
                    <Ionicons
                      name="layers-outline"
                      size={15}
                      color={selectedGroupFilter === 'ALL' ? '#ffffff' : colors.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: selectedGroupFilter === 'ALL' ? '#ffffff' : colors.text,
                      }}
                    >
                      Todos ({courses.length})
                    </Text>
                  </TouchableOpacity>

                  {courseGroups.map((grp) => {
                    const isSelected = selectedGroupFilter === grp.key;
                    return (
                      <TouchableOpacity
                        key={grp.key}
                        onPress={() => setSelectedGroupFilter(grp.key)}
                        activeOpacity={0.8}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 20,
                          backgroundColor: isSelected
                            ? colors.primary
                            : colors.mode === 'light'
                            ? '#f1f5f9'
                            : '#1e293b',
                          borderWidth: 1.5,
                          borderColor: isSelected ? colors.primary : colors.border,
                        }}
                      >
                        <Ionicons
                          name="school-outline"
                          size={15}
                          color={isSelected ? '#ffffff' : colors.textSecondary}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '800',
                            color: isSelected ? '#ffffff' : colors.text,
                          }}
                        >
                          {grp.label} ({grp.count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.mode === 'light' ? '#ffffff' : '#0f172a',
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: Platform.OS === 'web' ? 8 : 4,
                    marginTop: 12,
                  }}
                >
                  <Ionicons
                    name="search-outline"
                    size={17}
                    color={colors.textSecondary}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    placeholder="Buscar materia por nombre o categoría..."
                    placeholderTextColor={colors.muted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={{
                      flex: 1,
                      color: colors.text,
                      fontSize: 13,
                    }}
                  />
                  {!!searchQuery && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                </View>

                {(selectedGroupFilter !== 'ALL' || !!searchQuery) && (
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 10,
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      Filtro:{' '}
                      <Text style={{ fontWeight: '800', color: colors.text }}>
                        {selectedGroupFilter === 'ALL'
                          ? 'Todos los cursos'
                          : `Curso ${
                              courseGroups.find((g) => g.key === selectedGroupFilter)?.label ||
                              selectedGroupFilter
                            }`}
                      </Text>
                      {!!searchQuery && ` • "${searchQuery}"`}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedGroupFilter('ALL');
                        setSearchQuery('');
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Ionicons name="refresh-outline" size={13} color={colors.primary} />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
                        Restablecer filtros
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {filteredCourses.length === 0 ? (
              <EmptyState
                icon="easel-outline"
                title={courses.length === 0 ? 'Aún no tenés materias asignadas' : 'No hay materias para este filtro'}
                message={
                  courses.length === 0
                    ? 'Cuando el Administrador te asigne una materia y horario en el cronograma escolar, aparecerá abierta aquí automáticamente.'
                    : `No encontramos materias asignadas que coincidan con ${
                        selectedGroupFilter !== 'ALL'
                          ? `el curso ${
                              courseGroups.find((g) => g.key === selectedGroupFilter)?.label ||
                              selectedGroupFilter
                            }`
                          : 'tu búsqueda'
                      }.`
                }
                actionLabel={courses.length > 0 ? 'Mostrar todas las materias' : undefined}
                onAction={
                  courses.length > 0
                    ? () => {
                        setSelectedGroupFilter('ALL');
                        setSearchQuery('');
                      }
                    : undefined
                }
              />
            ) : (
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: isDesktop ? 'wrap' : 'nowrap', gap: 14 }}>
                {filteredCourses.map((course) => (
                  <View
                    key={course.id}
                    style={{
                      width: (isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%') as any,
                      maxWidth: (isDesktop ? (Platform.OS === 'web' ? 'calc((100% - 28px) / 3)' : Math.floor((screenWidth - 60) / 3)) : '100%') as any,
                      flexGrow: isDesktop ? 0 : 1,
                      flexShrink: 0,
                      marginBottom: isDesktop ? 0 : 4,
                    }}
                  >
                    <Card
                      onPress={() => navigation.navigate('CourseDetail', { courseId: course.id })}
                      style={{ height: isDesktop ? '100%' : undefined, marginBottom: 0, justifyContent: 'space-between' }}
                    >
                      <View>
                        <View style={styles.rowBetween}>
                          <Badge
                            label={
                              course.schoolGroupLabel ||
                              `${course.schoolYear || 1}° Año - ${course.courseDivision || 1}° Curso`
                            }
                            tone="primary"
                          />
                          <Badge label={`${course.enrolledCount || 0} alumnos`} tone="success" />
                        </View>
                        <Text style={[styles.courseTitle, { color: colors.text, marginTop: 8 }]}>
                          {course.title}
                        </Text>
                        {(course.schedules || []).length > 0 && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                            {course.schedules.map((sch: any) => (
                              <Badge
                                key={sch.id}
                                label={`${sch.dayOfWeek} ${sch.startTime} a ${sch.endTime}`}
                                tone="info"
                              />
                            ))}
                          </View>
                        )}
                        <View style={[styles.rowBetween, { marginTop: 10 }]}>
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                            {course.modulesCount || 0} módulos • {course.assignmentsCount || 0} actividades
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.actionRow, { marginTop: 14, gap: 8 }]}>
                        <Button
                          title="Abrir tablón"
                          icon="chatbubbles-outline"
                          onPress={() => navigation.navigate('CourseDetail', { courseId: course.id })}
                          style={{ flex: 1, minHeight: 40, paddingVertical: 8, marginBottom: 0 }}
                        />
                      </View>
                    </Card>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={courseModalOpen} animationType="slide" transparent>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <ScrollView>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingCourse ? 'Editar curso' : 'Crear nuevo curso'}
              </Text>
              <Input
                label="Título del curso"
                value={courseForm.title}
                onChangeText={(v) => setCourseForm((p: any) => ({ ...p, title: v }))}
                placeholder="Ej. Arquitectura Backend con Node.js y MySQL"
              />
              <Input
                label="Resumen corto"
                value={courseForm.summary}
                onChangeText={(v) => setCourseForm((p: any) => ({ ...p, summary: v }))}
                placeholder="Síntesis de 1 o 2 oraciones"
              />
              <Input
                label="Descripción académica completa"
                value={courseForm.description}
                onChangeText={(v) => setCourseForm((p: any) => ({ ...p, description: v }))}
                placeholder="Objetivos, temario y metodología..."
                multiline
                numberOfLines={3}
              />
              <Input
                label="Horas estimadas"
                value={courseForm.estimatedHours}
                onChangeText={(v) => setCourseForm((p: any) => ({ ...p, estimatedHours: v }))}
                keyboardType="numeric"
              />

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Nivel</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {[
                  { key: 'beginner', label: 'Inicial' },
                  { key: 'intermediate', label: 'Intermedio' },
                  { key: 'advanced', label: 'Avanzado' },
                ].map((lvl) => (
                  <Chip
                    key={lvl.key}
                    label={lvl.label}
                    selected={courseForm.level === lvl.key}
                    onPress={() => setCourseForm((p: any) => ({ ...p, level: lvl.key }))}
                  />
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Estado de publicación</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {[
                  { key: 'published', label: 'Publicado' },
                  { key: 'draft', label: 'Borrador' },
                  { key: 'archived', label: 'Archivado' },
                ].map((st) => (
                  <Chip
                    key={st.key}
                    label={st.label}
                    selected={courseForm.status === st.key}
                    onPress={() => setCourseForm((p: any) => ({ ...p, status: st.key }))}
                  />
                ))}
              </View>

              <View style={styles.actionRow}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setCourseModalOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title={editingCourse ? 'Guardar cambios' : 'Crear curso'}
                  loading={savingCourse}
                  onPress={handleSaveCourse}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={moduleModalOpen} animationType="slide" transparent>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Nuevo módulo</Text>
            <Input
              label="Título del módulo"
              value={moduleForm.title}
              onChangeText={(v) => setModuleForm((p) => ({ ...p, title: v }))}
              placeholder="Ej. Unidad 1: Fundamentos y Arquitectura"
            />
            <Input
              label="Descripción (opcional)"
              value={moduleForm.description}
              onChangeText={(v) => setModuleForm((p) => ({ ...p, description: v }))}
              placeholder="Objetivos de aprendizaje del módulo"
            />
            <View style={styles.actionRow}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={() => setModuleModalOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Agregar módulo"
                loading={savingModule}
                onPress={handleCreateModule}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={lessonModalOpen} animationType="slide" transparent>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <ScrollView>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Subir material teórico / apunte
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
                Podés escribir el contenido o adjuntar archivos (PDFs, DOCX, imágenes, presentaciones, etc.) para que los alumnos los consulten.
              </Text>

              {Array.isArray(activeCourse?.modules) && activeCourse.modules.length > 1 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.fieldLabel, { color: colors.text, marginBottom: 6 }]}>
                    Módulo donde se publicará:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {activeCourse.modules.map((m: any) => {
                        const isSel = (targetModuleId || activeCourse.modules[0].id) === m.id;
                        return (
                          <Chip
                            key={m.id}
                            label={m.title}
                            selected={isSel}
                            onPress={() => setTargetModuleId(m.id)}
                          />
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              <Input
                label="Título del material teórico *"
                value={lessonForm.title}
                onChangeText={(v) => setLessonForm((p: any) => ({ ...p, title: v }))}
                placeholder="Ej. Apunte Unidad 1: Circuitos Lógicos"
              />
              <Input
                label="Desarrollo teórico / resumen explicativo (opcional si adjuntás archivos)"
                value={lessonForm.contentText}
                onChangeText={(v) => setLessonForm((p: any) => ({ ...p, contentText: v }))}
                placeholder="Escribí una introducción, conceptos clave o resumen del tema..."
                multiline
                numberOfLines={3}
              />
              <FileUploader
                attachments={lessonForm.attachments || []}
                onChange={(att) => setLessonForm((p: any) => ({ ...p, attachments: att }))}
                label="Archivos de teoría (PDF, DOCX, imágenes, links)"
                description="Arrastrá o seleccioná guías teóricas, apuntes en PDF o Word, fotos o links"
              />
              <View style={styles.actionRow}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setLessonModalOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Guardar y cargar material"
                  loading={savingLesson}
                  onPress={handleCreateLesson}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={colorModalOpen} animationType="slide" transparent onRequestClose={() => setColorModalOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.rowBetween, { marginBottom: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: draftHexColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: '#ffffff',
                    }}
                  >
                    <Ionicons name="color-palette" size={20} color="#ffffff" />
                  </View>
                  <View>
                    <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>
                      Color de la Materia
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {activeCourse?.title || 'Materia'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setColorModalOpen(false)}>
                  <Ionicons name="close-circle" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 14 }}>
                Seleccioná el tono y ajustá qué tan claro u oscuro querés el recuadro de tu materia:
              </Text>

              <View
                style={{
                  backgroundColor: draftHexColor,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 16,
                  borderWidth: 1.5,
                  borderColor: 'rgba(255, 255, 255, 0.35)',
                  shadowColor: draftHexColor,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
                      {activeCourse?.schoolGroupLabel || 'Curso Asignado'}
                    </Text>
                  </View>
                  <Text style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 11, fontWeight: '800' }}>
                    VISTA PREVIA
                  </Text>
                </View>
                <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '900', letterSpacing: 0.2 }}>
                  {activeCourse?.title || 'Nombre de la Materia'}
                </Text>
                <Text style={{ color: '#f8fafc', fontSize: 12, marginTop: 4, fontWeight: '600' }}>
                  Color seleccionado: {draftHexColor}
                </Text>
              </View>

              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
                1. Seleccioná el Tono de Color:
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                  {COLOR_FAMILIES.map((fam) => {
                    const isFamSelected = selectedColorFamily === fam.id;
                    const sampleHex = fam.shades[2].hex;
                    return (
                      <TouchableOpacity
                        key={fam.id}
                        onPress={() => {
                          setSelectedColorFamily(fam.id);
                          const matchingShade = fam.shades.find((s) => s.id === selectedIntensity) || fam.shades[2];
                          setDraftHexColor(matchingShade.hex);
                        }}
                        style={{
                          alignItems: 'center',
                          paddingVertical: 9,
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          backgroundColor: isFamSelected
                            ? isDark
                              ? 'rgba(99, 102, 241, 0.25)'
                              : 'rgba(79, 70, 229, 0.12)'
                            : colors.surfaceAlt || colors.background,
                          borderWidth: 2,
                          borderColor: isFamSelected ? colors.primary : colors.border,
                          minWidth: 74,
                        }}
                      >
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: sampleHex,
                            marginBottom: 4,
                            borderWidth: 1.5,
                            borderColor: 'rgba(255, 255, 255, 0.8)',
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isFamSelected ? '800' : '600',
                            color: isFamSelected ? colors.primary : colors.text,
                          }}
                        >
                          {fam.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
                2. Regulá la Intensidad (Qué tan claro u oscuro):
              </Text>
              <View style={{ gap: 8, marginBottom: 18 }}>
                {(COLOR_FAMILIES.find((f) => f.id === selectedColorFamily)?.shades || []).map((shd) => {
                  const isSelected = draftHexColor.toLowerCase() === shd.hex.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={shd.id}
                      onPress={() => {
                        setSelectedIntensity(shd.id);
                        setDraftHexColor(shd.hex);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 11,
                        borderRadius: 11,
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(99, 102, 241, 0.18)'
                            : 'rgba(79, 70, 229, 0.08)'
                          : colors.surfaceAlt || colors.background,
                        borderWidth: 1.5,
                        borderColor: isSelected ? colors.primary : colors.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            backgroundColor: shd.hex,
                            borderWidth: 1,
                            borderColor: 'rgba(0, 0, 0, 0.15)',
                          }}
                        />
                        <View>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>
                            {shd.label}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            {shd.hex}
                          </Text>
                        </View>
                      </View>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ marginBottom: 16 }}>
                <Input
                  label="Código HEX manual (opcional)"
                  value={draftHexColor}
                  onChangeText={(val) => setDraftHexColor(val)}
                  placeholder="#b91c1c"
                  maxLength={7}
                />
              </View>

              <View style={styles.actionRow}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setColorModalOpen(false)}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <Button
                  title={savingColor ? 'Guardando...' : 'Aplicar Color'}
                  icon="checkmark-outline"
                  loading={savingColor}
                  disabled={savingColor}
                  onPress={() => handleSaveCourseColor(draftHexColor)}
                  style={{ flex: 1.4, marginBottom: 0 }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={Boolean(confirmDeleteCourse)}
        title="Eliminar curso"
        message={`¿Estás seguro de que deseás eliminar el curso "${confirmDeleteCourse?.title}"? Esta acción borrará sus módulos y lecciones.`}
        confirmLabel="Eliminar"
        onConfirm={handleDeleteCourse}
        onCancel={() => setConfirmDeleteCourse(null)}
      />
    </View>
  );
}

// Define los estilos de la pantalla de cursos docentes.
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseTitle: { fontSize: 17, fontWeight: '800', marginTop: 8 },
  moduleTitle: { fontSize: 15, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tabsRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8, flexWrap: 'wrap' },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '88%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
});
