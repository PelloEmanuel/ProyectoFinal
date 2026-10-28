import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Button, Chips, ErrorBanner, Input, Screen } from '../../components/ui';
import { tasksApi, usersApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { validateTask } from '../../utils/validators';
import { PRIORITY, STATUS } from '../../theme';

const toOptions = (map) => Object.entries(map).map(([value, v]) => ({ value, label: v.label }));

/** Crea o edita una tarea. Si recibe route.params.task, es edición. */
export default function TaskFormScreen({ navigation, route }) {
  const { user } = useAuth();
  const task = route.params?.task;
  const staff = user.role !== 'user';
  const canDelete = staff || task?.createdBy === user.id;

  const [form, setForm] = useState({
    title: task?.title || '', description: task?.description || '', status: task?.status || 'pending',
    priority: task?.priority || 'medium', dueDate: task?.dueDate || '', assignedTo: task?.assignedTo ?? null,
  });
  const [people, setPeople] = useState([]);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useLayoutEffect(() => { navigation.setOptions({ title: task ? 'Editar tarea' : 'Nueva tarea' }); }, [navigation, task]);

  // Solo supervisor/admin pueden asignar a otras personas
  useEffect(() => {
    if (staff) usersApi.assignable().then(setPeople).catch((e) => setBanner(getErrorMessage(e)));
  }, [staff]);

  const save = async () => {
    const v = validateTask(form);
    setErrors(v); setBanner('');
    if (Object.keys(v).length) return;
    setLoading(true);
    const body = { ...form, title: form.title.trim(), dueDate: form.dueDate || null, assignedTo: staff ? form.assignedTo : undefined };
    try {
      if (task) await tasksApi.update(task.id, body); else await tasksApi.create(body);
      navigation.goBack();
    } catch (e) { setErrors(getFieldErrors(e)); setBanner(getErrorMessage(e)); setLoading(false); }
  };

  const remove = () =>
    Alert.alert('Eliminar tarea', '¿Seguro? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
          try { await tasksApi.remove(task.id); navigation.goBack(); } catch (e) { setBanner(getErrorMessage(e)); }
        } },
    ]);

  return (
    <Screen>
      <ErrorBanner message={banner} />
      <Input label="Título" value={form.title} onChangeText={set('title')} error={errors.title} placeholder="¿Qué hay que hacer?" />
      <Input label="Descripción" value={form.description} onChangeText={set('description')} error={errors.description}
        placeholder="Detalles (opcional)" multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
      <Chips label="Estado" options={toOptions(STATUS)} value={form.status} onChange={set('status')} />
      <Chips label="Prioridad" options={toOptions(PRIORITY)} value={form.priority} onChange={set('priority')} />
      <Input label="Fecha límite" value={form.dueDate} onChangeText={set('dueDate')} error={errors.dueDate}
        placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
      {staff && (
        <Chips label="Asignar a" value={form.assignedTo} onChange={set('assignedTo')}
          options={[{ value: null, label: 'Sin asignar' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
      )}
      <Button title={task ? 'Guardar cambios' : 'Crear tarea'} onPress={save} loading={loading} />
      {task && canDelete && <Button title="Eliminar tarea" variant="danger" icon="trash-outline" onPress={remove} />}
    </Screen>
  );
}
