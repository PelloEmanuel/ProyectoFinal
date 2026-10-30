/**
 * Archivo: mobile/src/components/FileUploader.js
 * Descripción: Componente universal para subir archivos (imágenes, PDFs, DOCX, ZIPs)
 * mediante arrastrar y soltar (Drag & Drop), explorador del sistema o enlaces web externos.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { uploadsApi } from '../api/services';
import { resolveAssetUrl } from '../config';
import { extractErrorMessage } from '../utils/errors';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(type, url, name) {
  const t = String(type || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (t === 'link' || u.startsWith('http://') || u.startsWith('https://')) {
    return { name: 'link-outline', color: '#38bdf8' };
  }
  if (t.includes('pdf') || u.endsWith('.pdf') || n.endsWith('.pdf')) {
    return { name: 'document-text', color: '#ef4444' };
  }
  if (t.includes('word') || /\.(docx?|odt|rtf)$/i.test(u) || /\.(docx?|odt|rtf)$/i.test(n)) {
    return { name: 'document-text-outline', color: '#2563eb' };
  }
  if (t.includes('sheet') || /\.(xlsx?|csv)$/i.test(u) || /\.(xlsx?|csv)$/i.test(n)) {
    return { name: 'stats-chart-outline', color: '#10b981' };
  }
  if (t.includes('image') || /\.(png|jpe?g|webp|gif|svg)$/i.test(u) || /\.(png|jpe?g|webp|gif|svg)$/i.test(n)) {
    return { name: 'image-outline', color: '#10b981' };
  }
  if (t.includes('zip') || t.includes('rar') || /\.(zip|rar|7z|tar)$/i.test(u) || /\.(zip|rar|7z|tar)$/i.test(n)) {
    return { name: 'archive-outline', color: '#f59e0b' };
  }
  return { name: 'document-outline', color: '#a855f7' };
}

export default function FileUploader({
  attachments = [],
  onChange,
  label = 'Archivos y recursos adjuntos',
  description = 'Arrastrá y soltá archivos aquí o hacé clic para explorar desde tu dispositivo (PDFs, DOCX, imágenes, etc.)',
  disabled = false,
}) {
  const { colors } = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const openFilePicker = () => {
    if (disabled || uploading) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '*/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          handleUploadFiles(Array.from(files));
        }
        try {
          document.body.removeChild(input);
        } catch {}
      };
      input.click();
    } else {
      Alert.alert('Subida', 'En navegador web podés seleccionar archivos directamente desde el explorador.');
    }
  };

  const handleUploadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0 || disabled) return;
    setErrorMsg('');
    setUploading(true);
    const newItems = [...(attachments || [])];

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setUploadProgress(`Subiendo (${i + 1}/${fileList.length}): ${file.name}...`);

        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Error al leer el archivo seleccionado.'));
          reader.readAsDataURL(file);
        });

        const res = await uploadsApi.uploadFile({
          name: file.name,
          type: file.type || 'application/octet-stream',
          data: base64Data,
        });

        // unwrap puede haber devuelto res.data o res directamente
        const item = (res && res.data && typeof res.data === 'object' && res.data.url) ? res.data : res;

        if (item && item.url) {
          newItems.push({
            id: item.id || `${Date.now()}-${i}`,
            name: item.name || file.name,
            url: item.url,
            size: item.size || file.size,
            type: item.type || file.type || 'application/octet-stream',
            kind: item.kind || 'file',
          });
        }
      }

      if (onChange) onChange(newItems);
    } catch (err) {
      console.error('Error subiendo archivo:', err);
      setErrorMsg(extractErrorMessage(err));
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleAddLink = () => {
    setErrorMsg('');
    const url = linkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setErrorMsg('El enlace debe comenzar con http:// o https://');
      return;
    }
    const title = linkTitle.trim() || url;
    const newItem = {
      id: `${Date.now()}-link`,
      name: title,
      url,
      type: 'link',
      kind: 'link',
    };
    if (onChange) onChange([...(attachments || []), newItem]);
    setLinkTitle('');
    setLinkUrl('');
    setShowLinkInput(false);
  };

  const handleRemove = (index) => {
    if (disabled) return;
    const filtered = (attachments || []).filter((_, i) => i !== index);
    if (onChange) onChange(filtered);
  };

  const handleOpenItem = (item) => {
    const fullUrl = resolveAssetUrl(item.url);
    if (fullUrl) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(fullUrl, '_blank');
      } else {
        Linking.openURL(fullUrl).catch(() => {
          Alert.alert('Error', 'No se pudo abrir el enlace o archivo.');
        });
      }
    }
  };

  // Props especiales para soporte Drag & Drop en React Native Web
  const webDragProps =
    Platform.OS === 'web'
      ? {
          onDragOver: (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDragging) setIsDragging(true);
          },
          onDragLeave: (e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          },
          onDrop: (e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleUploadFiles(Array.from(e.dataTransfer.files));
            }
          },
        }
      : {};

  return (
    <View style={styles.container}>
      {/* Etiqueta superior */}
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {(attachments || []).length} {(attachments || []).length === 1 ? 'adjunto' : 'adjuntos'}
        </Text>
      </View>

      {/* Zona Drag & Drop / Clic para explorar */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openFilePicker}
        {...webDragProps}
        style={[
          styles.dropZone,
          {
            backgroundColor: isDragging ? `${colors.primary}25` : colors.surface,
            borderColor: isDragging ? colors.primary : colors.border,
          },
        ]}
      >
        {uploading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.progressText, { color: colors.primary }]}>{uploadProgress}</Text>
          </View>
        ) : (
          <View style={styles.centerBlock}>
            <Ionicons
              name={isDragging ? 'cloud-download' : 'cloud-upload-outline'}
              size={36}
              color={isDragging ? colors.primary : colors.textSecondary}
            />
            <Text style={[styles.dropTitle, { color: colors.text }]}>
              {isDragging ? '¡Soltá los archivos aquí!' : 'Arrastrá y soltá archivos aquí'}
            </Text>
            <Text style={[styles.dropSub, { color: colors.textSecondary }]}>{description}</Text>

            <View style={styles.buttonsRow}>
              <View style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="folder-open-outline" size={16} color="#ffffff" />
                <Text style={styles.actionBtnText}>Explorador de archivos</Text>
              </View>

              <TouchableOpacity
                disabled={disabled || uploading}
                style={[
                  styles.actionBtn,
                  { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 },
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  setShowLinkInput((prev) => !prev);
                }}
              >
                <Ionicons name="link-outline" size={16} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  {showLinkInput ? 'Cerrar enlace' : 'Agregar link web'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Formulario desplegable para agregar Enlace Web */}
      {showLinkInput && (
        <View style={[styles.linkForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.linkFormTitle, { color: colors.text }]}>Agregar recurso web o enlace</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            placeholder="Título o nombre del enlace (ej. Repositorio GitHub, Guía externa)"
            placeholderTextColor={colors.textMuted}
            value={linkTitle}
            onChangeText={setLinkTitle}
          />
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.background, color: colors.text, borderColor: colors.border, marginTop: 8 },
            ]}
            placeholder="URL (https://...)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            value={linkUrl}
            onChangeText={setLinkUrl}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}
              onPress={() => setShowLinkInput(false)}
            >
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: colors.primary }]}
              onPress={handleAddLink}
            >
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Guardar enlace</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Alerta de error si hubo fallo en la subida */}
      {!!errorMsg && (
        <Text style={[styles.errorText, { color: colors.danger || '#ef4444' }]}>{errorMsg}</Text>
      )}

      {/* Lista de archivos y enlaces adjuntos */}
      {(attachments || []).length > 0 && (
        <View style={styles.list}>
          {(attachments || []).map((item, idx) => {
            const icon = getFileIcon(item.type, item.url, item.name);
            return (
              <View
                key={item.id || idx}
                style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${icon.color}20` }]}>
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                </View>
                <TouchableOpacity
                  style={{ flex: 1, marginRight: 8 }}
                  onPress={() => handleOpenItem(item)}
                >
                  <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.name || 'Archivo adjunto'}
                  </Text>
                  <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                    {item.type === 'link' || item.kind === 'link'
                      ? item.url
                      : `${formatBytes(item.size)} • Toque para abrir / descargar`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={disabled}
                  style={styles.deleteBtn}
                  onPress={() => handleRemove(idx)}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 12 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { fontSize: 13, fontWeight: '700' },
  count: { fontSize: 12, fontWeight: '600' },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBlock: { alignItems: 'center', width: '100%' },
  dropTitle: { fontSize: 14, fontWeight: '700', marginTop: 8 },
  dropSub: { fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 12 },
  progressText: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  buttonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    justifyContent: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  linkForm: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  linkFormTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  smallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  errorText: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  list: { marginTop: 10, gap: 8 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  itemTitle: { fontSize: 13, fontWeight: '700' },
  itemMeta: { fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 6 },
});
