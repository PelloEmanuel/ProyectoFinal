/**
 * Archivo: mobile/src/components/TablonFeed.js
 * Descripción: Componente central del Tablón con estética 100% Google Classroom.
 * Incluye:
 * - Gran Banner temático superior con portada degradé, títulos en tipografía limpia,
 *   subtítulo del curso (ej. "7 4ta") y birretes/formas académicas flotantes.
 * - Diseño de 2 columnas en pantallas medianas/grandes (tarjeta "Próximas entregas" a la izquierda
 *   con "¡Yuju! ¡No tienes que entregar nada pronto!" y el flujo del tablón a la derecha).
 * - Píldora interactiva "Anunciar algo a tu clase..." para publicación rápida.
 * - Tarjetas con estilo de Classroom: ícono circular a la izquierda, título tipo
 *   "[Profesor] ha publicado una nueva tarea: [Título]", fecha, menú de 3 puntos (⋮)
 *   para editar o eliminar, y estados visuales verde/rojo para entregas.
 * - Detalle completo, chat público y chat privado con el docente.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, ConfirmModal, Input, Loading } from './ui';
import FileUploader from './FileUploader';
import { assignmentsApi, commentsApi, coursesApi } from '../api/services';
import { useTheme } from '../context/ThemeContext';
import {
  formatDate,
  formatDateTime,
  formatNumericDateInput,
  formatNumericTimeInput,
  parseBuenosAiresDate,
} from '../utils/dates';
import { extractErrorMessage } from '../utils/errors';
import { resolveAssetUrl } from '../config';
import { formatSchoolGroupShort } from './SchoolScheduleGrid';

export default function TablonFeed({
  course,
  isInstructor,
  user,
  onRefreshCourse,
  enrolledStudents = [],
  hideHeroBanner = false,
}) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Filtros: all | assignment | lesson | announcement
  const [filter, setFilter] = useState('all');

  // Menú superior de creación "Anunciar algo a tu clase"
  const [showCreateBox, setShowCreateBox] = useState(false);
  const [createType, setCreateType] = useState('announcement'); // 'announcement' | 'lesson' | 'assignment'
  const [savingItem, setSavingItem] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  // Formularios de creación
  const [annForm, setAnnForm] = useState({ title: '', content: '', attachments: [] });
  const [lessonForm, setLessonForm] = useState({ title: '', content: '', attachments: [] });
  const [assignForm, setAssignForm] = useState({
    title: '',
    description: '',
    maxScore: '100',
    hasDueDate: true,
    dueDate: '',
    dueTime: '23:59',
    allowLateSubmissions: true,
    attachments: [],
  });

  // Ítem seleccionado para ver en detalle
  const [selectedItem, setSelectedItem] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Menú de opciones (⋮) y Edición / Borrado
  const [activeMenuActionItem, setActiveMenuActionItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);

  // Modal de información del curso (i)
  const [showCourseInfoModal, setShowCourseInfoModal] = useState(false);

  // Entrega de tarea por parte del alumno
  const [studentSubmissionText, setStudentSubmissionText] = useState('');
  const [studentAttachments, setStudentAttachments] = useState([]);
  const [submittingAttempt, setSubmittingAttempt] = useState(false);
  const [confirmSubmitModal, setConfirmSubmitModal] = useState(false);

  // Comentarios / Chats del ítem seleccionado
  const [commentsTab, setCommentsTab] = useState('public'); // 'public' | 'private'
  const [publicComments, setPublicComments] = useState([]);
  const [privateComments, setPrivateComments] = useState([]);
  const [privateStudents, setPrivateStudents] = useState([]);
  const [selectedStudentForPrivateChat, setSelectedStudentForPrivateChat] = useState(null);
  const [commentInput, setCommentInput] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  // --------------------------------------------------------------------------
  // 1. Construcción del Feed del Tablón
  // --------------------------------------------------------------------------
  const feedItems = useMemo(() => {
    if (!course) return [];
    const items = [];

    // Avisos
    if (Array.isArray(course.announcements)) {
      course.announcements.forEach((a) => {
        items.push({
          tablonId: `announcement-${a.id}`,
          id: a.id,
          itemType: 'announcement',
          title: a.title,
          content: a.content,
          attachments: Array.isArray(a.attachments)
            ? a.attachments
            : typeof a.attachments === 'string'
            ? JSON.parse(a.attachments || '[]')
            : [],
          authorName: a.authorName || 'Profesor de la materia',
          date: a.publishedAt || a.createdAt,
          raw: a,
        });
      });
    }

    // Material Teórico (Lecciones)
    if (Array.isArray(course.modules)) {
      course.modules.forEach((m) => {
        if (Array.isArray(m.lessons)) {
          m.lessons.forEach((l) => {
            items.push({
              tablonId: `lesson-${l.id}`,
              id: l.id,
              moduleId: m.id,
              moduleTitle: m.title,
              itemType: 'lesson',
              title: l.title,
              content: l.content || l.contentText,
              attachments: Array.isArray(l.attachments)
                ? l.attachments
                : typeof l.attachments === 'string'
                ? JSON.parse(l.attachments || '[]')
                : [],
              authorName: 'Profesor de la materia',
              date: l.createdAt,
              duration: l.estimatedDuration,
              raw: l,
            });
          });
        }
      });
    }

    return items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [course]);

  const filteredFeed = useMemo(() => {
    if (filter === 'all') return feedItems;
    return feedItems.filter((item) => item.itemType === filter);
  }, [feedItems, filter]);

  // --------------------------------------------------------------------------
  // 2. Comentarios y Detalle
  // --------------------------------------------------------------------------
  const loadComments = useCallback(
    async (item, targetStudentId = null) => {
      if (!item || !course) return;
      try {
        setLoadingComments(true);
        const pub = await commentsApi.list(course.id, {
          itemType: item.itemType,
          itemId: item.id,
          isPrivate: 0,
        });
        setPublicComments(Array.isArray(pub) ? pub : pub?.data || []);

        if (isInstructor) {
          const stuList = await commentsApi.students(course.id, {
            itemType: item.itemType,
            itemId: item.id,
          });
          const list = Array.isArray(stuList) ? stuList : stuList?.data || [];
          setPrivateStudents(list);

          const activeStudentId = targetStudentId || selectedStudentForPrivateChat?.id || (list[0]?.id ?? null);
          if (activeStudentId) {
            const priv = await commentsApi.list(course.id, {
              itemType: item.itemType,
              itemId: item.id,
              isPrivate: 1,
              studentId: activeStudentId,
            });
            setPrivateComments(Array.isArray(priv) ? priv : priv?.data || []);
            const matchStu = list.find((s) => s.id === activeStudentId);
            if (matchStu) setSelectedStudentForPrivateChat(matchStu);
          } else {
            setPrivateComments([]);
          }
        } else {
          const priv = await commentsApi.list(course.id, {
            itemType: item.itemType,
            itemId: item.id,
            isPrivate: 1,
          });
          setPrivateComments(Array.isArray(priv) ? priv : priv?.data || []);
        }
      } catch (err) {
        console.error('Error cargando comentarios:', err);
      } finally {
        setLoadingComments(false);
      }
    },
    [course, isInstructor, selectedStudentForPrivateChat]
  );

  const handleOpenDetail = async (item) => {
    setSelectedItem(item);
    setCommentsTab('public');
    setStudentSubmissionText('');
    setStudentAttachments([]);
    setSelectedStudentForPrivateChat(null);
    setErrorBanner('');
    setSuccessBanner('');

    if (item.itemType === 'assignment') {
      try {
        setLoadingDetail(true);
        const detailed = await assignmentsApi.get(item.id);
        const merged = {
          ...item,
          ...detailed,
          raw: { ...item.raw, ...detailed },
          attachments: Array.isArray(detailed.attachments)
            ? detailed.attachments
            : item.attachments,
          myAttempts: detailed.myAttempts || [],
        };
        setSelectedItem(merged);
        loadComments(merged);
      } catch (err) {
        console.error('Error obteniendo detalle de actividad:', err);
        loadComments(item);
      } finally {
        setLoadingDetail(false);
      }
    } else {
      loadComments(item);
    }
  };

  const handleSendComment = async () => {
    if (!commentInput.trim() || !selectedItem || !course) return;
    try {
      setSendingComment(true);
      setErrorBanner('');

      const isPriv = commentsTab === 'private';
      const studentId = isPriv && isInstructor ? selectedStudentForPrivateChat?.id : undefined;

      if (isPriv && isInstructor && !studentId) {
        Alert.alert('Chat privado', 'Seleccioná a qué alumno deseás responderle.');
        return;
      }

      await commentsApi.create(course.id, {
        itemType: selectedItem.itemType,
        itemId: selectedItem.id,
        isPrivate: isPriv,
        studentId,
        message: commentInput.trim(),
      });

      setCommentInput('');
      await loadComments(selectedItem, studentId);
    } catch (err) {
      setErrorBanner(extractErrorMessage(err));
    } finally {
      setSendingComment(false);
    }
  };

  // --------------------------------------------------------------------------
  // 3. Creación de publicaciones
  // --------------------------------------------------------------------------
  const handleCreateAnnouncement = async () => {
    if (!annForm.content.trim()) {
      setErrorBanner('Por favor escribí el mensaje del aviso.');
      return;
    }
    try {
      setSavingItem(true);
      setErrorBanner('');
      await coursesApi.createAnnouncement(course.id, {
        title: annForm.content.trim().slice(0, 50),
        content: annForm.content.trim(),
        attachments: annForm.attachments,
      });
      setSuccessBanner('Aviso publicado con éxito en el Tablón.');
      setAnnForm({ title: '', content: '', attachments: [] });
      setShowCreateBox(false);
      if (onRefreshCourse) onRefreshCourse();
    } catch (err) {
      setErrorBanner(extractErrorMessage(err));
    } finally {
      setSavingItem(false);
    }
  };

  const handleCreateLesson = async () => {
    if (!lessonForm.title.trim()) {
      setErrorBanner('Por favor completá el título del material teórico.');
      return;
    }
    try {
      setSavingItem(true);
      setErrorBanner('');

      let targetModuleId = course.modules?.[0]?.id;
      if (!targetModuleId) {
        const modRes = await coursesApi.createModule(course.id, {
          title: 'Módulo 1: Teoría y Material de Estudio',
          description: 'Material teórico y apuntes de la materia',
        });
        targetModuleId = modRes.data?.data?.id || modRes.data?.id || modRes.id;
      }

      const contentText = lessonForm.content.trim() || `Material teórico: ${lessonForm.title.trim()}`;
      await coursesApi.createLesson(targetModuleId, {
        title: lessonForm.title.trim(),
        content: contentText,
        contentText,
        contentType: 'text',
        estimatedDuration: 30,
        isRequired: true,
        attachments: lessonForm.attachments,
      });

      setSuccessBanner('Material teórico subido con éxito al Tablón.');
      setLessonForm({ title: '', content: '', attachments: [] });
      setShowCreateBox(false);
      if (onRefreshCourse) onRefreshCourse();
    } catch (err) {
      setErrorBanner(extractErrorMessage(err));
    } finally {
      setSavingItem(false);
    }
  };

  const handleCreateAssignment = async () => {
    if (!assignForm.title.trim()) {
      setErrorBanner('Por favor completá el título de la actividad.');
      return;
    }
    try {
      setSavingItem(true);
      setErrorBanner('');

      let dueDate = null;
      let dueTime = null;
      let dueAt = null;

      if (assignForm.hasDueDate && assignForm.dueDate.trim()) {
        dueDate = assignForm.dueDate.trim();
        dueTime = assignForm.dueTime.trim() || '23:59';
        if (dueDate.includes('/')) {
          const parts = dueDate.split('/');
          if (parts.length === 3) {
            dueAt = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')} ${dueTime.length === 5 ? `${dueTime}:00` : dueTime}`;
          }
        } else {
          dueAt = `${dueDate} ${dueTime.length === 5 ? `${dueTime}:00` : dueTime}`;
        }
      }

      await assignmentsApi.create(course.id, {
        title: assignForm.title.trim(),
        description: assignForm.description.trim() || `Consigna de la actividad: ${assignForm.title.trim()}`,
        maxScore: Number(assignForm.maxScore) || 100,
        passingScore: 60,
        dueAt,
        dueDate,
        dueTime,
        allowLateSubmissions: assignForm.hasDueDate ? assignForm.allowLateSubmissions : true,
        attachments: assignForm.attachments,
        assignmentType: 'file_submission',
      });

      setSuccessBanner('Actividad creada con éxito en el Tablón.');
      setAssignForm({
        title: '',
        description: '',
        maxScore: '100',
        hasDueDate: true,
        dueDate: '',
        dueTime: '23:59',
        allowLateSubmissions: true,
        attachments: [],
      });
      setShowCreateBox(false);
      if (onRefreshCourse) onRefreshCourse();
    } catch (err) {
      setErrorBanner(extractErrorMessage(err));
    } finally {
      setSavingItem(false);
    }
  };

  // --------------------------------------------------------------------------
  // 4. Edición y Borrado
  // --------------------------------------------------------------------------
  const openEditModal = (item) => {
    let dueDate = '';
    let dueTime = '23:59';
    let hasDueDate = false;
    if (item.dueAt) {
      hasDueDate = true;
      const str = String(item.dueAt).trim();
      const [dPart, tPart] = str.split(' ');
      if (dPart && dPart.includes('-')) {
        const [y, m, d] = dPart.split('-');
        dueDate = `${d}/${m}/${y}`;
      } else {
        dueDate = dPart || '';
      }
      dueTime = (tPart ? tPart.slice(0, 5) : '') || '23:59';
    }

    setEditingItem({
      id: item.id,
      itemType: item.itemType,
      title: item.title,
      content: item.content || item.description || '',
      description: item.content || item.description || '',
      maxScore: String(item.maxScore || 100),
      hasDueDate,
      dueAt: item.dueAt,
      dueDate,
      dueTime,
      allowLateSubmissions: item.allowLateSubmissions !== false,
      attachments: Array.isArray(item.attachments) ? [...item.attachments] : [],
    });
    setActiveMenuActionItem(null);
  };

  const handleSaveEditItem = async () => {
    if (!editingItem) return;
    if (editingItem.itemType !== 'announcement' && !editingItem.title?.trim()) return;
    if (editingItem.itemType === 'announcement' && !editingItem.content?.trim()) return;
    try {
      setSavingItem(true);
      setErrorBanner('');

      if (editingItem.itemType === 'announcement') {
        const finalTitle = (editingItem.title && editingItem.title.trim()) || editingItem.content.trim().slice(0, 50) || 'Aviso';
        await coursesApi.updateAnnouncement(editingItem.id, {
          title: finalTitle,
          content: editingItem.content.trim(),
          attachments: editingItem.attachments,
        });
        setSuccessBanner('Aviso actualizado correctamente.');
      } else if (editingItem.itemType === 'lesson') {
        await coursesApi.updateLesson(editingItem.id, {
          title: editingItem.title.trim(),
          content: editingItem.content.trim(),
          attachments: editingItem.attachments,
        });
        setSuccessBanner('Material teórico actualizado correctamente.');
      } else if (editingItem.itemType === 'assignment') {
        let dueAt = null;
        let dueDate = null;
        let dueTime = null;
        if (editingItem.hasDueDate && editingItem.dueDate && editingItem.dueDate.trim()) {
          dueDate = editingItem.dueDate.trim();
          dueTime = (editingItem.dueTime || '23:59').trim();
          if (dueDate.includes('/')) {
            const parts = dueDate.split('/');
            if (parts.length === 3) {
              dueAt = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')} ${dueTime.length === 5 ? `${dueTime}:00` : dueTime}`;
            }
          } else {
            dueAt = `${dueDate} ${dueTime.length === 5 ? `${dueTime}:00` : dueTime}`;
          }
        }
        await assignmentsApi.update(editingItem.id, {
          title: editingItem.title.trim(),
          description: editingItem.description.trim(),
          maxScore: Number(editingItem.maxScore) || 100,
          dueAt,
          dueDate,
          dueTime,
          allowLateSubmissions: editingItem.hasDueDate ? editingItem.allowLateSubmissions : true,
          attachments: editingItem.attachments,
        });
        setSuccessBanner('Actividad actualizada correctamente.');
      }

      setEditingItem(null);
      if (selectedItem?.id === editingItem.id) {
        setSelectedItem(null);
      }
      if (onRefreshCourse) onRefreshCourse();
    } catch (err) {
      setErrorBanner(extractErrorMessage(err));
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deletingItem) return;
    try {
      setSavingItem(true);
      setErrorBanner('');

      if (deletingItem.itemType === 'announcement') {
        await coursesApi.deleteAnnouncement(deletingItem.id);
        setSuccessBanner('Aviso eliminado del Tablón.');
      } else if (deletingItem.itemType === 'lesson') {
        await coursesApi.deleteLesson(deletingItem.id);
        setSuccessBanner('Material teórico eliminado del Tablón.');
      } else if (deletingItem.itemType === 'assignment') {
        await assignmentsApi.remove(deletingItem.id);
        setSuccessBanner('Actividad eliminada del Tablón.');
      }

      const deletedId = deletingItem.id;
      setDeletingItem(null);
      if (selectedItem?.id === deletedId) {
        setSelectedItem(null);
      }
      if (onRefreshCourse) onRefreshCourse();
    } catch (err) {
      setErrorBanner(extractErrorMessage(err));
    } finally {
      setSavingItem(false);
    }
  };

  // --------------------------------------------------------------------------
  // 5. Entrega de tarea por alumno
  // --------------------------------------------------------------------------
  const handleStudentSubmit = async () => {
    if (!selectedItem || selectedItem.itemType !== 'assignment') return;
    setConfirmSubmitModal(false);
    try {
      setSubmittingAttempt(true);
      setErrorBanner('');

      const attempt = await assignmentsApi.startAttempt(selectedItem.id);
      const payload = {
        submissionText: studentSubmissionText.trim() || undefined,
        attachments: studentAttachments,
        answers: [],
      };

      const res = await assignmentsApi.submitAttempt(attempt.id || attempt.data?.id, payload);
      setSuccessBanner(res.message || '¡Tarea entregada con éxito!');
      setStudentSubmissionText('');
      setStudentAttachments([]);

      await handleOpenDetail(selectedItem);
      if (onRefreshCourse) onRefreshCourse();
    } catch (err) {
      setErrorBanner(extractErrorMessage(err));
    } finally {
      setSubmittingAttempt(false);
    }
  };

  const getStudentDeliveryStatus = (item) => {
    if (item.itemType !== 'assignment') return null;

    const attempts = item.myAttempts || [];
    const submittedAttempt = attempts.find(
      (a) => a.status === 'submitted' || a.status === 'graded'
    );

    if (submittedAttempt) {
      if (submittedAttempt.isLate) {
        return {
          status: 'submitted_late',
          label: 'Entregado con retraso',
          bgColor: '#ef4444',
          textColor: '#ffffff',
          icon: 'alert-circle',
          attempt: submittedAttempt,
        };
      }
      return {
        status: 'submitted_on_time',
        label: 'Entregado',
        bgColor: '#10b981',
        textColor: '#ffffff',
        icon: 'checkmark-circle',
        attempt: submittedAttempt,
      };
    }

    const nowBA = new Date();
    const isPastDue = item.dueAt && parseBuenosAiresDate(item.dueAt) < nowBA;

    if (isPastDue) {
      if (!item.allowLateSubmissions) {
        return {
          status: 'closed_overdue',
          label: 'Plazo vencido (No admite entregas)',
          bgColor: '#7f1d1d',
          textColor: '#fca5a5',
          icon: 'close-circle',
          blocked: true,
        };
      }
      return {
        status: 'overdue_can_submit',
        label: 'Sin entregar (Vencido)',
        bgColor: '#dc2626',
        textColor: '#ffffff',
        icon: 'time',
        isLateSubmit: true,
      };
    }

    return {
      status: 'pending',
      label: 'Asignado',
      bgColor: '#3b82f6',
      textColor: '#ffffff',
      icon: 'document-text',
    };
  };

  return (
    <View style={styles.container}>
      {/* Mensajes de Alerta y Éxito */}
      {!!errorBanner && (
        <View style={[styles.bannerAlert, { backgroundColor: '#7f1d1d', borderColor: '#ef4444' }]}>
          <Ionicons name="alert-circle" size={18} color="#fecaca" />
          <Text style={styles.bannerAlertText}>{errorBanner}</Text>
          <TouchableOpacity onPress={() => setErrorBanner('')}>
            <Ionicons name="close" size={16} color="#fecaca" />
          </TouchableOpacity>
        </View>
      )}

      {!!successBanner && (
        <View style={[styles.bannerAlert, { backgroundColor: '#064e3b', borderColor: '#10b981' }]}>
          <Ionicons name="checkmark-circle" size={18} color="#a7f3d0" />
          <Text style={styles.bannerAlertText}>{successBanner}</Text>
          <TouchableOpacity onPress={() => setSuccessBanner('')}>
            <Ionicons name="close" size={16} color="#a7f3d0" />
          </TouchableOpacity>
        </View>
      )}

      {/* ==================================================================== */}
      {/* 1. GRAN PORTADA / BANNER DEL CURSO (ESTILO GOOGLE CLASSROOM)         */}
      {/* ==================================================================== */}
      {!hideHeroBanner && (
        <View
          style={[
            styles.heroBanner,
            course?.themeColor ? { backgroundColor: course.themeColor } : null,
          ]}
        >
          {/* Capas decorativas de birretes flotantes simuladas */}
          <View style={styles.floatingCap1}>
            <Ionicons name="school" size={130} color="rgba(255, 255, 255, 0.16)" />
          </View>
          <View style={styles.floatingCap2}>
            <Ionicons name="school" size={78} color="rgba(255, 255, 255, 0.12)" />
          </View>
          <View style={styles.floatingGoldTassel}>
            <View style={styles.goldDot} />
          </View>

          {/* Textos principales del Banner */}
          <View style={styles.heroBannerContent}>
            <Text style={styles.heroBannerTitle} numberOfLines={2}>
              {course?.title || 'Materia Académica'}
            </Text>
            <Text style={styles.heroBannerSubtitle}>
              {formatSchoolGroupShort(course?.schoolYear || 6, course?.courseDivision || 1)}
            </Text>

            {!!course?.shortDescription && (
              <Text style={styles.heroBannerDesc} numberOfLines={1}>
                {course.shortDescription}
              </Text>
            )}
          </View>

          {/* Botón de información (i) en la esquina inferior derecha */}
          <TouchableOpacity
            style={styles.heroInfoBtn}
            onPress={() => setShowCourseInfoModal(true)}
            accessibilityLabel="Información del curso"
          >
            <Ionicons name="information-circle-outline" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {/* ==================================================================== */}
      {/* 2. CUERPO PRINCIPAL (2 COLUMNAS EN DESKTOP / APILADO EN MOBILE)     */}
      {/* ==================================================================== */}
      <View style={[styles.mainLayout, isDesktop && styles.mainLayoutDesktop]}>
        {/* COLUMNA IZQUIERDA: INFORMACIÓN DE LA MATERIA */}
        <View style={[styles.leftColumn, isDesktop && styles.leftColumnDesktop]}>
          <View
            style={[
              styles.upcomingCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.upcomingTitle, { color: colors.text, marginBottom: 8 }]}>
              Información de la Materia
            </Text>

            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="book-outline" size={17} color="#10b981" />
                <Text style={{ fontSize: 13, color: colors.text, fontWeight: '600' }}>
                  {feedItems.filter((i) => i.itemType === 'lesson').length} Materiales teóricos
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="megaphone-outline" size={17} color="#f59e0b" />
                <Text style={{ fontSize: 13, color: colors.text, fontWeight: '600' }}>
                  {feedItems.filter((i) => i.itemType === 'announcement').length} Avisos publicados
                </Text>
              </View>

              {!!course?.instructorName && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <Ionicons name="person-outline" size={17} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                    Docente: {course.instructorName}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* COLUMNA DERECHA: STREAM / FLUJO DEL TABLÓN */}
        <View style={[styles.rightColumn, isDesktop && styles.rightColumnDesktop]}>
          {/* Píldora interactiva para Crear/Anunciar (Estilo Google Classroom) */}
          {isInstructor && (
            <View style={{ marginBottom: 14 }}>
              {!showCreateBox ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowCreateBox(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    alignSelf: 'flex-start',
                    backgroundColor: isDark ? '#1e293b' : '#c2e7ff',
                    borderColor: isDark ? '#334155' : '#7fcfff',
                    borderWidth: 1,
                    borderRadius: 24,
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    gap: 8,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.12,
                    shadowRadius: 3,
                    elevation: 2,
                  }}
                >
                  <Ionicons name="pencil-outline" size={17} color={isDark ? '#93c5fd' : '#001d35'} />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: isDark ? '#93c5fd' : '#001d35',
                    }}
                  >
                    Nuevo anuncio
                  </Text>
                </TouchableOpacity>
              ) : (
                <View
                  style={[
                    styles.createBoxExpanded,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  {/* Selector de tipo en la barra de creación */}
                  <View style={styles.createBoxTypeTabs}>
                    <TouchableOpacity
                      style={[
                        styles.createTypeTab,
                        createType === 'announcement' && [
                          styles.createTypeTabActive,
                          { borderBottomColor: '#f59e0b', backgroundColor: '#f59e0b15' },
                        ],
                      ]}
                      onPress={() => setCreateType('announcement')}
                    >
                      <Ionicons name="megaphone-outline" size={16} color="#f59e0b" />
                      <Text style={[styles.createTypeTabText, { color: colors.text }]}>Aviso</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.createTypeTab,
                        createType === 'lesson' && [
                          styles.createTypeTabActive,
                          { borderBottomColor: '#10b981', backgroundColor: '#10b98115' },
                        ],
                      ]}
                      onPress={() => setCreateType('lesson')}
                    >
                      <Ionicons name="book-outline" size={16} color="#10b981" />
                      <Text style={[styles.createTypeTabText, { color: colors.text }]}>Material Teórico</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Formulario 1: Aviso */}
                  {createType === 'announcement' && (
                    <View style={{ padding: 14 }}>
                      <Input
                        label="Mensaje para los alumnos *"
                        value={annForm.content}
                        onChangeText={(t) => setAnnForm((p) => ({ ...p, content: t }))}
                        placeholder="Escribí tu aviso para el curso..."
                        multiline
                        style={{ minHeight: 90 }}
                      />
                      <FileUploader
                        attachments={annForm.attachments}
                        onChange={(atts) => setAnnForm((p) => ({ ...p, attachments: atts }))}
                        label="Adjuntar archivos o enlaces"
                      />
                      <View style={styles.createBoxActions}>
                        <Button
                          title="Cancelar"
                          variant="outline"
                          small
                          onPress={() => setShowCreateBox(false)}
                        />
                        <Button
                          title="Publicar Aviso"
                          icon="send-outline"
                          small
                          loading={savingItem}
                          onPress={handleCreateAnnouncement}
                        />
                      </View>
                    </View>
                  )}

                  {/* Formulario 2: Material Teórico */}
                  {createType === 'lesson' && (
                    <View style={{ padding: 14 }}>
                      <Input
                        label="Título del material teórico"
                        value={lessonForm.title}
                        onChangeText={(t) => setLessonForm((p) => ({ ...p, title: t }))}
                        placeholder="Ej. Guía de Estudio Unidad 1"
                      />
                      <Input
                        label="Resumen o explicación"
                        value={lessonForm.content}
                        onChangeText={(t) => setLessonForm((p) => ({ ...p, content: t }))}
                        placeholder="Indicaciones para los alumnos..."
                        multiline
                        style={{ minHeight: 70 }}
                      />
                      <FileUploader
                        attachments={lessonForm.attachments}
                        onChange={(atts) => setLessonForm((p) => ({ ...p, attachments: atts }))}
                        label="Subir PDFs, presentaciones, imágenes o links"
                      />
                      <View style={styles.createBoxActions}>
                        <Button
                          title="Cancelar"
                          variant="outline"
                          small
                          onPress={() => setShowCreateBox(false)}
                        />
                        <Button
                          title="Subir Material"
                          icon="cloud-upload-outline"
                          small
                          loading={savingItem}
                          onPress={handleCreateLesson}
                        />
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Filtros de Categorías */}
          <View style={styles.filterBar}>
            {[
              {
                id: 'all',
                label: 'Todos',
                count: feedItems.length,
                icon: 'layers-outline',
                activeBg: '#2563eb',
                activeBorder: '#3b82f6',
              },
              {
                id: 'lesson',
                label: 'Material Teórico',
                count: feedItems.filter((i) => i.itemType === 'lesson').length,
                icon: 'book-outline',
                activeBg: '#059669',
                activeBorder: '#10b981',
              },
              {
                id: 'announcement',
                label: 'Avisos',
                count: feedItems.filter((i) => i.itemType === 'announcement').length,
                icon: 'megaphone-outline',
                activeBg: '#d97706',
                activeBorder: '#f59e0b',
              },
            ].map((f) => {
              const isActive = filter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  activeOpacity={0.8}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: isActive ? f.activeBg : '#0f172a',
                      borderColor: isActive ? f.activeBorder : '#334155',
                    },
                  ]}
                  onPress={() => setFilter(f.id)}
                >
                  <Ionicons
                    name={f.icon}
                    size={15}
                    color="#ffffff"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.filterPillText, { color: '#ffffff' }]}>
                    {f.label} ({f.count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* LISTADO DE TARJETAS (ESTILO GOOGLE CLASSROOM) */}
          {filteredFeed.length === 0 ? (
            <View
              style={[
                styles.emptyStreamCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Ionicons name="chatbox-ellipses-outline" size={38} color={colors.primary} />
              <Text style={[styles.emptyStreamTitle, { color: colors.text }]}>
                Este es el lugar donde verás las novedades de la clase
              </Text>
              <Text style={[styles.emptyStreamSub, { color: colors.muted }]}>
                Usa el tablón para comunicarte con la clase, compartir avisos y consultar tareas y materiales.
              </Text>
            </View>
          ) : (
            filteredFeed.map((item) => {
              const statusObj = !isInstructor ? getStudentDeliveryStatus(item) : null;

              // Caso 1: Material Teórico (Estilo Google Classroom con ícono circular)
              if (item.itemType === 'lesson') {
                const circleBg = '#059669';
                const circleIcon = 'book';
                const prefix = `${item.authorName} ha publicado nuevo material teórico:`;

                return (
                  <TouchableOpacity
                    key={item.tablonId}
                    activeOpacity={0.88}
                    onPress={() => handleOpenDetail(item)}
                    style={[
                      styles.classroomStreamCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    {/* Ícono circular redondeado a la izquierda */}
                    <View style={[styles.classroomCircleIcon, { backgroundColor: circleBg }]}>
                      <Ionicons name={circleIcon} size={18} color="#ffffff" />
                    </View>

                    {/* Texto central */}
                    <View style={{ flex: 1, marginHorizontal: 12 }}>
                      <Text style={[styles.classroomCardMainText, { color: colors.text }]}>
                        <Text style={{ fontWeight: '400' }}>{prefix} </Text>
                        <Text style={{ fontWeight: '700' }}>{item.title}</Text>
                      </Text>
                      <Text style={[styles.classroomCardDate, { color: colors.muted, fontSize: 12, marginTop: 4 }]}>
                        📅 Subido el {formatDateTime(item.date)}
                      </Text>
                    </View>

                    {/* Menú de opciones (⋮) para el docente */}
                    {isInstructor && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setActiveMenuActionItem(item);
                        }}
                        style={styles.threeDotsBtn}
                      >
                        <Ionicons name="ellipsis-vertical" size={18} color={colors.muted} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }

              // Caso 2: Aviso (Estilo Google Classroom con avatar, contenido expandido y comentarios)
              return (
                <TouchableOpacity
                  key={item.tablonId}
                  activeOpacity={0.88}
                  onPress={() => handleOpenDetail(item)}
                  style={[
                    styles.classroomStreamCardAnnouncement,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.announcementHeaderRow}>
                    {/* Avatar del autor */}
                    <View
                      style={[
                        styles.authorAvatarCircle,
                        { backgroundColor: isDark ? '#374151' : '#e2e8f0' },
                      ]}
                    >
                      <Ionicons name="person" size={18} color={colors.primary} />
                    </View>

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.announcementAuthorName, { color: colors.text }]}>
                        {item.authorName}
                      </Text>
                      <Text style={[styles.announcementDate, { color: colors.muted, fontSize: 12, marginTop: 2 }]}>
                        📢 Publicado el {formatDateTime(item.date)}
                      </Text>
                    </View>

                    {/* Menú de 3 puntos (⋮) para el docente */}
                    {isInstructor && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setActiveMenuActionItem(item);
                        }}
                        style={styles.threeDotsBtn}
                      >
                        <Ionicons name="ellipsis-vertical" size={18} color={colors.muted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Cuerpo del aviso */}
                  <Text style={[styles.announcementBody, { color: colors.textSecondary }]}>
                    {item.content}
                  </Text>

                  {/* Vista previa de adjuntos */}
                  {Array.isArray(item.attachments) && item.attachments.length > 0 && (
                    <View style={styles.announcementAttRow}>
                      {item.attachments.map((att, aIdx) => (
                        <View
                          key={aIdx}
                          style={[
                            styles.classroomAttPreviewChip,
                            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                          ]}
                        >
                          <Ionicons
                            name={
                              att.kind === 'link' || att.type === 'link'
                                ? 'link-outline'
                                : 'document-attach-outline'
                            }
                            size={16}
                            color={colors.primary}
                          />
                          <Text
                            style={[styles.classroomAttChipText, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {att.name || att.url}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Barra inferior: "Añadir un comentario de clase..." */}
                  <View style={[styles.announcementFooterBar, { borderTopColor: colors.border }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.muted} />
                    <Text style={[styles.announcementFooterText, { color: colors.muted }]}>
                      Comentarios de clase y consultas privadas...
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>

      {/* ==================================================================== */}
      {/* MODAL: ACCIONES DEL MENÚ DE 3 PUNTOS (⋮)                              */}
      {/* ==================================================================== */}
      <Modal
        visible={!!activeMenuActionItem}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveMenuActionItem(null)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setActiveMenuActionItem(null)}
        >
          <View
            style={[
              styles.menuActionsCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.menuActionsTitle, { color: colors.text }]}>
              {activeMenuActionItem?.title}
            </Text>

            <TouchableOpacity
              style={styles.menuActionRow}
              onPress={() => openEditModal(activeMenuActionItem)}
            >
              <Ionicons name="pencil-outline" size={18} color={colors.primary} />
              <Text style={[styles.menuActionText, { color: colors.text }]}>Editar publicación</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuActionRow}
              onPress={() => {
                const target = activeMenuActionItem;
                setActiveMenuActionItem(null);
                setDeletingItem({
                  id: target.id,
                  itemType: target.itemType,
                  title: target.title,
                });
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={[styles.menuActionText, { color: '#ef4444' }]}>Eliminar publicación</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: INFORMACIÓN DEL CURSO (BOTÓN (i) DE LA PORTADA)               */}
      {/* ==================================================================== */}
      <Modal
        visible={showCourseInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCourseInfoModal(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setShowCourseInfoModal(false)}
        >
          <View
            style={[
              styles.courseInfoCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.courseInfoTitle, { color: colors.text }]}>
                {course?.title}
              </Text>
              <TouchableOpacity onPress={() => setShowCourseInfoModal(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.courseInfoGroup, { color: colors.primary }]}>
              Curso: {formatSchoolGroupShort(course?.schoolYear || 6, course?.courseDivision || 1)}
            </Text>

            <Text style={[styles.courseInfoDesc, { color: colors.textSecondary }]}>
              {course?.description || course?.shortDescription || 'Materia académica del Campus Técnica 5.'}
            </Text>

            {course?.instructorName && (
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>
                Docente a cargo: {course.instructorName}
              </Text>
            )}

            <Button
              title="Cerrar"
              variant="outline"
              small
              onPress={() => setShowCourseInfoModal(false)}
              style={{ marginTop: 14, marginBottom: 0 }}
            />
          </View>
        </Pressable>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: DETALLE COMPLETO DEL ÍTEM + ENTREGA + CHATS                   */}
      {/* ==================================================================== */}
      <Modal
        visible={!!selectedItem}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.modalHeader,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
            ]}
          >
            <TouchableOpacity onPress={() => setSelectedItem(null)} style={styles.modalBackBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>

            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]} numberOfLines={1}>
                {selectedItem?.itemType === 'announcement'
                  ? 'Aviso del Docente'
                  : selectedItem?.title}
              </Text>
              <Text style={[styles.modalHeaderSubtitle, { color: colors.muted }]}>
                {selectedItem?.itemType === 'announcement'
                  ? `Publicado por ${selectedItem?.authorName}`
                  : 'Material Teórico'}
              </Text>
            </View>

            {isInstructor && selectedItem && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => openEditModal(selectedItem)}
                  style={[styles.iconActionBtn, { backgroundColor: `${colors.primary}20` }]}
                >
                  <Ionicons name="pencil" size={18} color={colors.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    setDeletingItem({
                      id: selectedItem.id,
                      itemType: selectedItem.itemType,
                      title: selectedItem.title,
                    })
                  }
                  style={[styles.iconActionBtn, { backgroundColor: '#ef444420' }]}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.modalScrollBody}>
            {loadingDetail ? (
              <Loading />
            ) : (
              selectedItem && (
                <>
                  {/* Tarjeta de Contenido */}
                  <View
                    style={[
                      styles.detailCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    {selectedItem.itemType !== 'announcement' && (
                      <Text style={[styles.detailTitle, { color: colors.text }]}>
                        {selectedItem.title}
                      </Text>
                    )}

                    <Text style={[styles.detailMeta, { color: colors.muted, fontSize: 13, marginTop: 4 }]}>
                      {selectedItem.itemType === 'lesson' ? '📚 Material Teórico' : '📢 Aviso'} • Publicado por {selectedItem.authorName} • 📅 Subido el {formatDateTime(selectedItem.date)}
                    </Text>

                    <Text style={[styles.detailBody, { color: colors.textSecondary }]}>
                      {selectedItem.content || 'Sin descripción adicional.'}
                    </Text>

                    {/* Adjuntos del ítem */}
                    {Array.isArray(selectedItem.attachments) && selectedItem.attachments.length > 0 && (
                      <View style={{ marginTop: 14 }}>
                        <Text style={[styles.attachmentsHeader, { color: colors.text }]}>
                          Archivos adjuntos ({selectedItem.attachments.length})
                        </Text>
                        <View style={{ gap: 8, marginTop: 6 }}>
                          {selectedItem.attachments.map((att, idx) => (
                            <TouchableOpacity
                              key={att.id || idx}
                              onPress={() => {
                                const full = resolveAssetUrl(att.url);
                                if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(full, '_blank');
                                else Linking.openURL(full);
                              }}
                              style={[
                                styles.attachmentFileRow,
                                { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                              ]}
                            >
                              <Ionicons
                                name={
                                  att.kind === 'link' || att.type === 'link'
                                    ? 'link-outline'
                                    : 'document-text-outline'
                                }
                                size={20}
                                color={colors.primary}
                              />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={[styles.attachmentFileName, { color: colors.text }]} numberOfLines={1}>
                                  {att.name || 'Archivo adjunto'}
                                </Text>
                                <Text style={[styles.attachmentFileAction, { color: colors.primary }]}>
                                  Abrir o descargar ↗
                                </Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Sección de Chats Públicos y Privados */}

                  {/* Sección de Chats Públicos y Privados */}
                  <View
                    style={[
                      styles.commentsCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.commentsTabSelector}>
                      <TouchableOpacity
                        style={[
                          styles.commentsTabBtn,
                          commentsTab === 'public' && [styles.commentsTabBtnActive, { borderBottomColor: colors.primary }],
                        ]}
                        onPress={() => setCommentsTab('public')}
                      >
                        <Ionicons
                          name="chatbubbles"
                          size={16}
                          color={commentsTab === 'public' ? colors.primary : colors.muted}
                        />
                        <Text
                          style={[
                            styles.commentsTabBtnText,
                            { color: commentsTab === 'public' ? colors.primary : colors.muted },
                          ]}
                        >
                          Comentarios de clase ({publicComments.length})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.commentsTabBtn,
                          commentsTab === 'private' && [styles.commentsTabBtnActive, { borderBottomColor: colors.primary }],
                        ]}
                        onPress={() => setCommentsTab('private')}
                      >
                        <Ionicons
                          name="lock-closed"
                          size={16}
                          color={commentsTab === 'private' ? colors.primary : colors.muted}
                        />
                        <Text
                          style={[
                            styles.commentsTabBtnText,
                            { color: commentsTab === 'private' ? colors.primary : colors.muted },
                          ]}
                        >
                          Comentarios privados
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {commentsTab === 'public' && (
                      <View style={{ marginTop: 10 }}>
                        {publicComments.length === 0 ? (
                          <Text style={[styles.noCommentsText, { color: colors.muted }]}>
                            No hay comentarios de clase todavía.
                          </Text>
                        ) : (
                          <View style={{ gap: 8, marginTop: 8 }}>
                            {publicComments.map((comm) => (
                              <View
                                key={comm.id}
                                style={[
                                  styles.commentBubble,
                                  comm.role === 'instructor' || comm.role === 'admin'
                                    ? [styles.commentBubbleTeacher, { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }]
                                    : [styles.commentBubbleStudent, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }],
                                ]}
                              >
                                <View style={styles.commentBubbleHeader}>
                                  <Text style={[styles.commentAuthorName, { color: colors.text }]}>
                                    {comm.userName}
                                  </Text>
                                  <Badge
                                    text={comm.role === 'instructor' || comm.role === 'admin' ? 'Docente' : 'Alumno'}
                                    color={comm.role === 'instructor' || comm.role === 'admin' ? colors.primary : colors.secondary}
                                    small
                                  />
                                  <Text style={[styles.commentBubbleTime, { color: colors.muted }]}>
                                    {formatDateTime(comm.createdAt)}
                                  </Text>
                                </View>
                                <Text style={[styles.commentBubbleMsg, { color: colors.text }]}>
                                  {comm.message}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    {commentsTab === 'private' && (
                      <View style={{ marginTop: 10 }}>
                        {isInstructor && (
                          <View style={{ marginTop: 8, marginBottom: 10 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                              Seleccionar alumno para ver su chat privado:
                            </Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 6 }}>
                              {privateStudents.length === 0 ? (
                                <Text style={{ fontSize: 12, color: colors.muted, fontStyle: 'italic' }}>
                                  Ningún alumno inició chat privado aún.
                                </Text>
                              ) : (
                                privateStudents.map((stu) => (
                                  <TouchableOpacity
                                    key={stu.id}
                                    onPress={() => {
                                      setSelectedStudentForPrivateChat(stu);
                                      loadComments(selectedItem, stu.id);
                                    }}
                                    style={[
                                      styles.studentFilterChip,
                                      selectedStudentForPrivateChat?.id === stu.id && {
                                        backgroundColor: colors.primary,
                                        borderColor: colors.primary,
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name="person-circle-outline"
                                      size={16}
                                      color={selectedStudentForPrivateChat?.id === stu.id ? '#ffffff' : colors.text}
                                    />
                                    <Text
                                      style={[
                                        styles.studentFilterChipText,
                                        { color: selectedStudentForPrivateChat?.id === stu.id ? '#ffffff' : colors.text },
                                      ]}
                                    >
                                      {stu.name} ({stu.messageCount})
                                    </Text>
                                  </TouchableOpacity>
                                ))
                              )}
                            </ScrollView>
                          </View>
                        )}

                        {privateComments.length === 0 ? (
                          <Text style={[styles.noCommentsText, { color: colors.muted }]}>
                            {isInstructor
                              ? selectedStudentForPrivateChat
                                ? `No hay mensajes privados con ${selectedStudentForPrivateChat.name}. Escribile un mensaje abajo.`
                                : 'Seleccioná un alumno para iniciar un chat privado.'
                              : 'No hay mensajes privados con el profesor todavía.'}
                          </Text>
                        ) : (
                          <View style={{ gap: 8, marginTop: 8 }}>
                            {privateComments.map((comm) => (
                              <View
                                key={comm.id}
                                style={[
                                  styles.commentBubble,
                                  comm.userId === user?.id
                                    ? [styles.commentBubbleTeacher, { backgroundColor: `${colors.primary}25`, borderColor: colors.primary }]
                                    : [styles.commentBubbleStudent, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }],
                                ]}
                              >
                                <View style={styles.commentBubbleHeader}>
                                  <Text style={[styles.commentAuthorName, { color: colors.text }]}>
                                    {comm.userName}
                                  </Text>
                                  <Badge
                                    text={comm.role === 'instructor' || comm.role === 'admin' ? 'Docente' : 'Alumno'}
                                    color={comm.role === 'instructor' || comm.role === 'admin' ? colors.primary : colors.secondary}
                                    small
                                  />
                                  <Text style={[styles.commentBubbleTime, { color: colors.muted }]}>
                                    {formatDateTime(comm.createdAt)}
                                  </Text>
                                </View>
                                <Text style={[styles.commentBubbleMsg, { color: colors.text }]}>
                                  {comm.message}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    <View style={[styles.chatInputRow, { borderTopColor: colors.border }]}>
                      <TextInput
                        style={[
                          styles.chatTextInput,
                          {
                            backgroundColor: colors.surfaceAlt,
                            color: colors.text,
                            borderColor: colors.border,
                          },
                        ]}
                        placeholder={
                          commentsTab === 'public'
                            ? 'Añadir un comentario de clase...'
                            : isInstructor
                            ? `Mensaje privado para ${selectedStudentForPrivateChat?.name || 'el alumno'}...`
                            : 'Añadir un comentario privado al profesor...'
                        }
                        placeholderTextColor={colors.muted}
                        value={commentInput}
                        onChangeText={setCommentInput}
                        multiline
                      />
                      <TouchableOpacity
                        style={[
                          styles.chatSendBtn,
                          { backgroundColor: commentInput.trim() ? colors.primary : colors.muted },
                        ]}
                        disabled={!commentInput.trim() || sendingComment}
                        onPress={handleSendComment}
                      >
                        <Ionicons name="send" size={16} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: EDICIÓN UNIVERSAL (AVISOS, TEORÍA Y ACTIVIDADES)              */}
      {/* ==================================================================== */}
      <Modal
        visible={!!editingItem}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setEditingItem(null)}
      >
        <View style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.modalHeader,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
            ]}
          >
            <TouchableOpacity onPress={() => setEditingItem(null)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalHeaderTitle, { color: colors.text, marginLeft: 10 }]}>
              {editingItem?.itemType === 'announcement'
                ? 'Editar Aviso'
                : editingItem?.itemType === 'lesson'
                ? 'Editar Material Teórico'
                : 'Editar Tarea / Actividad'}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.modalScrollBody}>
            {editingItem && (
              <View>
                {editingItem.itemType !== 'announcement' && (
                  <Input
                    label="Título de la publicación"
                    value={editingItem.title}
                    onChangeText={(t) => setEditingItem((p) => ({ ...p, title: t }))}
                  />
                )}

                <Input
                  label={
                    editingItem.itemType === 'announcement'
                      ? 'Mensaje del aviso'
                      : editingItem.itemType === 'lesson'
                      ? 'Guía o explicación'
                      : 'Instrucciones'
                  }
                  value={editingItem.content || editingItem.description || ''}
                  onChangeText={(t) =>
                    setEditingItem((p) => ({ ...p, content: t, description: t }))
                  }
                  multiline
                  style={{ minHeight: 90 }}
                />

                <FileUploader
                  attachments={editingItem.attachments}
                  onChange={(atts) => setEditingItem((p) => ({ ...p, attachments: atts }))}
                  label="Archivos adjuntos"
                />

                <View style={styles.createBoxActions}>
                  <Button
                    title="Cancelar"
                    variant="outline"
                    onPress={() => setEditingItem(null)}
                  />
                  <Button
                    title="Guardar Cambios"
                    icon="checkmark-outline"
                    loading={savingItem}
                    onPress={handleSaveEditItem}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Confirmación de Borrado */}
      <ConfirmModal
        visible={!!deletingItem}
        title={
          deletingItem?.itemType === 'announcement'
            ? 'Eliminar Aviso'
            : 'Eliminar Material Teórico'
        }
        message={`¿Estás seguro de que deseás eliminar "${deletingItem?.title}" del Tablón?`}
        confirmText="Eliminar"
        danger
        onConfirm={handleDeleteItem}
        onCancel={() => setDeletingItem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 28,
  },
  bannerAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  bannerAlertText: {
    flex: 1,
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
  },

  // ==========================================================================
  // ESTILO DE LA PORTADA / BANNER HERO (IDÉNTICO A GOOGLE CLASSROOM)
  // ==========================================================================
  heroBanner: {
    height: 180,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
    padding: 22,
    backgroundColor: '#1d4ed8', // Azul royal vibrante de fondo
    marginBottom: 20,
    // Sombra suave y moderna
    shadowColor: '#1d4ed8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  floatingCap1: {
    position: 'absolute',
    right: 28,
    top: -15,
    transform: [{ rotate: '-18deg' }],
  },
  floatingCap2: {
    position: 'absolute',
    right: 175,
    top: 25,
    transform: [{ rotate: '22deg' }],
  },
  floatingGoldTassel: {
    position: 'absolute',
    right: 95,
    bottom: 22,
  },
  goldDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fbbf24',
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  heroBannerContent: {
    zIndex: 2,
    maxWidth: '80%',
  },
  heroBannerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroBannerSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#dbeafe',
    marginTop: 4,
  },
  heroBannerDesc: {
    fontSize: 12,
    color: '#bfdbfe',
    marginTop: 2,
  },
  heroInfoBtn: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },

  // ==========================================================================
  // DISPOSICIÓN EN 2 COLUMNAS (DESKTOP) Y APILADO (MOBILE)
  // ==========================================================================
  mainLayout: {
    flexDirection: 'column',
  },
  mainLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  leftColumn: {
    width: '100%',
    marginBottom: 16,
  },
  leftColumnDesktop: {
    width: 220,
    marginBottom: 0,
  },
  rightColumn: {
    flex: 1,
    width: '100%',
  },
  rightColumnDesktop: {
    flex: 1,
  },

  // TARJETA DE "PRÓXIMAS ENTREGAS" (COLUMNA IZQUIERDA)
  upcomingCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  upcomingTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  upcomingEmptyBox: {
    marginVertical: 14,
  },
  upcomingYujuText: {
    fontSize: 13,
    lineHeight: 18,
  },
  upcomingItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  upcomingItemTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  upcomingItemDue: {
    fontSize: 11,
    marginTop: 1,
  },
  upcomingViewAllBtn: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
  upcomingViewAllText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // PÍLDORA "ANUNCIAR ALGO A TU CLASE..."
  createPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 1,
  },
  createPillIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  createPillText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  createBoxExpanded: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  createBoxTypeTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#24324f',
  },
  createTypeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  createTypeTabActive: {},
  createTypeTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  createBoxActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  switchRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  switchRowTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  switchRowDesc: {
    fontSize: 10,
    marginTop: 1,
  },

  // FILTROS
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: '#0f172a', // Fondo negro/oscuro elegante
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  filterPillActive: {
    borderWidth: 1.5,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff', // Letras en blanco nítido y de alto contraste
  },

  // STREAM VACÍO
  emptyStreamCard: {
    padding: 30,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  emptyStreamTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
  },
  emptyStreamSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 380,
  },

  // ==========================================================================
  // TARJETAS DEL TABLÓN (ESTILO GOOGLE CLASSROOM)
  // ==========================================================================
  classroomStreamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    // Sombra tenue y elegante
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  classroomCircleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classroomCardMainText: {
    fontSize: 14,
    lineHeight: 20,
  },
  classroomCardDate: {
    fontSize: 12,
    marginTop: 2,
  },
  deliveryStatusBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  deliveryStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  threeDotsBtn: {
    padding: 8,
  },

  // TARJETA DE AVISO (EXPANDIDA CON AVATAR)
  classroomStreamCardAnnouncement: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  announcementHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  authorAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementAuthorName: {
    fontSize: 14,
    fontWeight: '700',
  },
  announcementDate: {
    fontSize: 11,
    marginTop: 1,
  },
  announcementBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  announcementAttRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  classroomAttPreviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 240,
  },
  classroomAttChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  announcementFooterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  announcementFooterText: {
    fontSize: 12,
  },

  // MENÚ DE ACCIONES (⋮)
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuActionsCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  menuActionsTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  menuActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  menuActionText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // MODAL INFO CURSO (i)
  courseInfoCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  courseInfoTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  courseInfoGroup: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  courseInfoDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },

  // MODAL DETALLE
  modalScreen: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalBackBtn: {
    padding: 4,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalHeaderSubtitle: {
    fontSize: 12,
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollBody: {
    padding: 16,
    paddingBottom: 40,
  },
  statusBigBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  statusBigTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  statusBigSubtitle: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.95,
  },
  detailCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  detailMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  dueInfoBox: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  dueInfoTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  dueInfoDate: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
  dueInfoSub: {
    fontSize: 11,
    marginTop: 2,
  },
  detailBody: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  attachmentsHeader: {
    fontSize: 14,
    fontWeight: '700',
  },
  attachmentFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  attachmentFileName: {
    fontSize: 13,
    fontWeight: '700',
  },
  attachmentFileAction: {
    fontSize: 11,
    marginTop: 2,
  },
  submissionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  submissionCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  myAttemptBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  myAttemptStatus: {
    fontSize: 13,
    fontWeight: '800',
  },
  myAttemptText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  attChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 200,
  },
  feedbackBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  feedbackScore: {
    fontSize: 13,
    fontWeight: '800',
  },
  feedbackText: {
    fontSize: 12,
    marginTop: 2,
  },
  blockedBox: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ef4444',
    marginTop: 6,
  },
  blockedDesc: {
    fontSize: 12,
    color: '#fca5a5',
    textAlign: 'center',
    marginTop: 4,
  },
  lateSubmitWarning: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  commentsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  commentsTabSelector: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#24324f',
  },
  commentsTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginRight: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  commentsTabBtnActive: {},
  commentsTabBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  noCommentsText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 12,
  },
  commentBubble: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  commentBubbleStudent: {},
  commentBubbleTeacher: {},
  commentBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  commentAuthorName: {
    fontSize: 12,
    fontWeight: '800',
  },
  commentBubbleTime: {
    fontSize: 10,
    marginLeft: 'auto',
  },
  commentBubbleMsg: {
    fontSize: 13,
    lineHeight: 18,
  },
  studentFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#24324f',
    backgroundColor: '#131b2e',
  },
  studentFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 10,
  },
  chatTextInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    maxHeight: 90,
  },
  chatSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
