import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Playlist, MediaFile, PlaylistRecurringRule } from '@/shared/media-schema';
import { validatePlaylistMediaScheduleItems } from '@/shared/playlistSchedule';
import MediaSelectionList from './MediaSelectionList';
import { couponAPI, playlistMediaFilesToUpdateItems, type PlaylistMediaUpdateItem } from '@/services/api';

type PlaylistLine = {
  file: MediaFile;
  scheduleEnabled: boolean;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  scheduleExactDates: string[];
  scheduleRecurringRules: PlaylistRecurringRule[];
};

const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function mediaFileToLine(f: MediaFile): PlaylistLine {
  return {
    file: f,
    scheduleEnabled: !!f.scheduleEnabled,
    scheduleStartDate: f.scheduleStartDate ?? null,
    scheduleEndDate: f.scheduleEndDate ?? null,
    scheduleExactDates: [...(f.scheduleExactDates || [])],
    scheduleRecurringRules: (f.scheduleRecurringRules || []).map((r) => ({
      kind: 'weekly' as const,
      weekdays: [...(r.weekdays || [])],
    })),
  };
}

function lineToUpdateItem(line: PlaylistLine): PlaylistMediaUpdateItem {
  return {
    mediaId: Number(line.file.id),
    scheduleEnabled: line.scheduleEnabled,
    scheduleStartDate: line.scheduleStartDate,
    scheduleEndDate: line.scheduleEndDate,
    scheduleExactDates: [...line.scheduleExactDates],
    scheduleRecurringRules: line.scheduleRecurringRules.map((r) => ({
      kind: 'weekly',
      weekdays: [...r.weekdays],
    })),
  };
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoToLocalDate(s: string | null): Date {
  if (!s) return new Date();
  const parts = s.split('-').map(Number);
  const y = parts[0];
  const mo = parts[1] || 1;
  const d = parts[2] || 1;
  return new Date(y, mo - 1, d);
}

function getWeeklyWeekdays(line: PlaylistLine): number[] {
  const w = line.scheduleRecurringRules.find((r) => r.kind === 'weekly');
  return w?.weekdays ? [...w.weekdays] : [];
}

interface EditPlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  onUpdatePlaylist: (playlist: Playlist) => void;
  playlist: Playlist | null;
  allMediaFiles: MediaFile[];
}

const EditPlaylistModal: React.FC<EditPlaylistModalProps> = ({
  visible,
  onClose,
  onUpdatePlaylist,
  playlist,
  allMediaFiles,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [playlistLines, setPlaylistLines] = useState<PlaylistLine[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'media' | 'add-media'>('details');
  const [previewCouponId, setPreviewCouponId] = useState('');
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [datePickerCtx, setDatePickerCtx] = useState<
    { mode: 'start' | 'end' | 'exact'; lineIndex: number } | null
  >(null);
  const [datePickerValue, setDatePickerValue] = useState(new Date());

  const getDefaultCouponId = (rows: any[]) => {
    const defaultCoupon = rows.find((row) => row?.isDefaultPreviewCoupon);
    return defaultCoupon?.id != null ? String(defaultCoupon.id) : '';
  };

  useEffect(() => {
    if (playlist && visible) {
      console.log('🔴 EDIT_PLAYLIST: Loading playlist data:', {
        id: playlist.id,
        name: playlist.name,
        mediaFiles: playlist.mediaFiles?.length || 0
      });
      
      setName(playlist.name || '');
      setDescription(playlist.description || '');
      setPlaylistLines((playlist.mediaFiles || []).map(mediaFileToLine));
      setPreviewCouponId(playlist.previewCouponId != null ? String(playlist.previewCouponId) : '');
    }
  }, [playlist, visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setCouponsLoading(true);
    couponAPI.list()
      .then((rows) => {
        if (active) {
          const nextCoupons = Array.isArray(rows) ? rows : [];
          setCoupons(nextCoupons);
          setPreviewCouponId((prev) => prev || getDefaultCouponId(nextCoupons));
        }
      })
      .catch(() => {
        if (active) setCoupons([]);
      })
      .finally(() => {
        if (active) setCouponsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const handleUpdatePlaylist = async () => {
    if (!playlist || !name.trim()) {
      Alert.alert('Error', 'Please enter a playlist name');
      return;
    }

    setIsUpdating(true);
    console.log('🔴 EDIT_PLAYLIST: Updating playlist with data:', {
      id: playlist.id,
      name: name.trim(),
      description: description.trim(),
      mediaFiles: playlistLines.length
    });

    try {
      const { playlistsAPI } = await import('@/services/api');

      // Update playlist details
      const updatedPlaylist = await playlistsAPI.update(playlist.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        previewCouponId: previewCouponId ? Number(previewCouponId) : null,
      });

      console.log('🔴 EDIT_PLAYLIST: Playlist details updated:', updatedPlaylist);

      const newItems = playlistLines.map(lineToUpdateItem);
      const oldItems = playlistMediaFilesToUpdateItems(playlist.mediaFiles || []);
      const mediaFilesChanged =
        JSON.stringify(newItems) !== JSON.stringify(oldItems);

      if (mediaFilesChanged) {
        console.log('🔴 EDIT_PLAYLIST: Media files, order, or schedules changed, updating...');
        const clientCheck = validatePlaylistMediaScheduleItems(
          newItems.map((it) => ({
            mediaId: it.mediaId,
            scheduleEnabled: it.scheduleEnabled,
            scheduleStartDate: it.scheduleStartDate,
            scheduleEndDate: it.scheduleEndDate,
            scheduleExactDates: it.scheduleExactDates,
            scheduleRecurringRules: it.scheduleRecurringRules,
          }))
        );
        if (!clientCheck.ok) {
          Alert.alert('Schedule', clientCheck.error);
          setIsUpdating(false);
          return;
        }
        await playlistsAPI.updateMedia(playlist.id, newItems);
        console.log('🔴 EDIT_PLAYLIST: Media files updated');
      } else {
        console.log('🔴 EDIT_PLAYLIST: No media file changes detected');
      }

      // Fetch the complete updated playlist from server to ensure consistency
      console.log('🔴 EDIT_PLAYLIST: Fetching complete updated playlist from server...');
      const completeUpdatedPlaylist = await playlistsAPI.getById(playlist.id);
      
      console.log('🔴 EDIT_PLAYLIST: Complete updated playlist from server:', completeUpdatedPlaylist);
      onUpdatePlaylist(completeUpdatedPlaylist);
      onClose();

    } catch (error: any) {
      console.error('🔴 EDIT_PLAYLIST: Error updating playlist:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update playlist';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setPlaylistLines([]);
    setActiveTab('details');
    setIsUpdating(false);
    setDatePickerCtx(null);
    onClose();
  };

  const moveMediaFile = (fromIndex: number, toIndex: number) => {
    console.log('🔴 EDIT_PLAYLIST: Moving media file from', fromIndex, 'to', toIndex);

    setPlaylistLines((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const removeMediaFile = (mediaId: number) => {
    console.log('🔴 EDIT_PLAYLIST: Removing media file:', mediaId);
    setPlaylistLines((prev) => prev.filter((l) => Number(l.file.id) !== mediaId));
  };

  const addMediaFiles = (mediaIds: number[]) => {
    console.log('🔴 EDIT_PLAYLIST: Adding media files:', mediaIds);

    const newLines = allMediaFiles
      .filter(
        (file) =>
          mediaIds.includes(Number(file.id)) &&
          !playlistLines.some((l) => Number(l.file.id) === Number(file.id))
      )
      .map((file) => mediaFileToLine({ ...file, scheduleEnabled: false }));

    setPlaylistLines((prev) => [...prev, ...newLines]);
    setActiveTab('media');
  };

  const updateLine = (index: number, patch: Partial<PlaylistLine>) => {
    setPlaylistLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  };

  const toggleWeekday = (lineIndex: number, weekday: number) => {
    setPlaylistLines((prev) =>
      prev.map((line, i) => {
        if (i !== lineIndex) return line;
        const rules = [...line.scheduleRecurringRules];
        let idx = rules.findIndex((r) => r.kind === 'weekly');
        let weekdays =
          idx >= 0 ? [...rules[idx].weekdays] : [];
        const set = new Set(weekdays);
        if (set.has(weekday)) set.delete(weekday);
        else set.add(weekday);
        weekdays = Array.from(set).sort((a, b) => a - b);
        const newRules =
          idx >= 0
            ? rules.map((r, j) =>
                j === idx ? { kind: 'weekly' as const, weekdays } : r
              )
            : [...rules, { kind: 'weekly' as const, weekdays }];
        return {
          ...line,
          scheduleRecurringRules: newRules.filter(
            (r) => r.kind !== 'weekly' || r.weekdays.length > 0
          ),
        };
      })
    );
  };

  const openDatePicker = (
    lineIndex: number,
    mode: 'start' | 'end' | 'exact'
  ) => {
    const line = playlistLines[lineIndex];
    let base = new Date();
    if (mode === 'start') base = parseIsoToLocalDate(line.scheduleStartDate);
    else if (mode === 'end') base = parseIsoToLocalDate(line.scheduleEndDate);
    setDatePickerValue(base);
    setDatePickerCtx({ lineIndex, mode });
  };

  const commitDatePickerValue = (date: Date) => {
    if (!datePickerCtx) return;
    const iso = toLocalIsoDate(date);
    const { lineIndex, mode } = datePickerCtx;
    if (mode === 'start') {
      updateLine(lineIndex, { scheduleStartDate: iso });
    } else if (mode === 'end') {
      updateLine(lineIndex, { scheduleEndDate: iso });
    } else {
      setPlaylistLines((prev) =>
        prev.map((line, i) => {
          if (i !== lineIndex) return line;
          if (line.scheduleExactDates.includes(iso)) return line;
          return {
            ...line,
            scheduleExactDates: [...line.scheduleExactDates, iso].sort(),
          };
        })
      );
    }
  };

  const onNativeDateChange = (event: { type?: string }, selected?: Date) => {
    if (!datePickerCtx) return;
    if (Platform.OS === 'android') {
      if (event?.type === 'dismissed') {
        setDatePickerCtx(null);
        return;
      }
      if (selected) {
        setDatePickerValue(selected);
        commitDatePickerValue(selected);
        setDatePickerCtx(null);
      }
      return;
    }
    if (selected) setDatePickerValue(selected);
  };

  const closeDatePickerIos = () => {
    if (!datePickerCtx) return;
    commitDatePickerValue(datePickerValue);
    setDatePickerCtx(null);
  };

  const removeExactDate = (lineIndex: number, iso: string) => {
    setPlaylistLines((prev) =>
      prev.map((line, i) =>
        i === lineIndex
          ? {
              ...line,
              scheduleExactDates: line.scheduleExactDates.filter((d) => d !== iso),
            }
          : line
      )
    );
  };

  const getMediaTypeIcon = (mediaFile: MediaFile) => {
    if (mediaFile.contentType?.startsWith('audio/')) return 'audiotrack';
    if (mediaFile.contentType?.startsWith('video/')) return 'videocam';
    if (mediaFile.contentType?.startsWith('image/')) return 'image';
    return 'insert-drive-file';
  };

  const availableMediaFiles = allMediaFiles.filter(
    (file) => !playlistLines.some((l) => Number(l.file.id) === Number(file.id))
  );

  const mediaTabCount = playlistLines.length;

  if (!playlist) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Playlist</Text>
          <TouchableOpacity 
            onPress={handleUpdatePlaylist}
            disabled={!name.trim() || isUpdating}
          >
            <Text style={[
              styles.saveButton,
              (!name.trim() || isUpdating) && styles.saveButtonDisabled
            ]}>
              {isUpdating ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          {[
            { key: 'details', label: 'Details', icon: 'info' },
            { key: 'media', label: `Media (${mediaTabCount})`, icon: 'queue-music' },
            { key: 'add-media', label: 'Add Media', icon: 'add' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                activeTab === tab.key && styles.activeTab,
              ]}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <MaterialIcons 
                name={tab.icon as any} 
                size={16} 
                color={activeTab === tab.key ? '#3b82f6' : '#6b7280'} 
              />
              <Text style={[
                styles.tabText,
                activeTab === tab.key && styles.activeTabText,
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {activeTab === 'details' && (
            <View style={styles.detailsTab}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Playlist Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter playlist name"
                  placeholderTextColor="#9ca3af"
                  maxLength={100}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Optional description"
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
              </View>

              <View style={styles.infoBox}>
                <MaterialIcons name="info" size={16} color="#3b82f6" />
                <Text style={styles.infoText}>
                  Use the Media tab to reorder tracks or the Add Media tab to add new files.
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Preview Coupon</Text>
                <View style={styles.pickerWrap}>
                  {couponsLoading ? (
                    <View style={styles.pickerLoading}>
                      <ActivityIndicator size="small" color="#3b82f6" />
                    </View>
                  ) : (
                    <Picker
                      selectedValue={previewCouponId}
                      onValueChange={(value) => setPreviewCouponId(String(value))}
                      style={styles.picker}
                    >
                      <Picker.Item label="None" value="" />
                      {coupons.map((coupon) => (
                        <Picker.Item
                          key={coupon.id}
                          label={`${coupon.code} (${coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : `$${coupon.discount_value}`} off)${coupon.isDefaultPreviewCoupon ? ' - Default' : ''}`}
                          value={String(coupon.id)}
                        />
                      ))}
                    </Picker>
                  )}
                </View>
                <Text style={styles.helperText}>
                  This coupon will be texted when someone enters a phone number before preview.
                </Text>
              </View>
            </View>
          )}

          {activeTab === 'media' && (
            <View style={styles.mediaTab}>
              <Text style={styles.sectionTitle}>Current Media Files</Text>
              <Text style={styles.scheduleHint}>
                Turn on the calendar to play an item only on chosen dates. At least one item must stay
                unscheduled if any item uses a schedule.
              </Text>

              {playlistLines.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="queue-music" size={48} color="#9ca3af" />
                  <Text style={styles.emptyText}>No media files in this playlist</Text>
                  <Text style={styles.emptySubtext}>Use the "Add Media" tab to add files</Text>
                </View>
              ) : (
                playlistLines.map((line, index) => {
                  const file = line.file;
                  const weekdays = getWeeklyWeekdays(line);
                  return (
                    <View key={String(file.id)} style={styles.mediaItemBlock}>
                      <View style={styles.mediaItem}>
                        <View style={styles.mediaItemLeft}>
                          <View style={styles.dragHandle}>
                            <MaterialIcons name="drag-handle" size={20} color="#9ca3af" />
                          </View>
                          <View style={styles.mediaItemContent}>
                            <MaterialIcons
                              name={getMediaTypeIcon(file)}
                              size={20}
                              color="#6b7280"
                            />
                            <View style={styles.mediaItemText}>
                              <Text style={styles.mediaItemTitle} numberOfLines={1}>
                                {file.title}
                              </Text>
                              <Text style={styles.mediaItemSubtitle} numberOfLines={1}>
                                {file.contentType}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.mediaItemActions}>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => moveMediaFile(index, Math.max(0, index - 1))}
                            disabled={index === 0}
                          >
                            <MaterialIcons
                              name="keyboard-arrow-up"
                              size={20}
                              color={index === 0 ? '#d1d5db' : '#6b7280'}
                            />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() =>
                              moveMediaFile(
                                index,
                                Math.min(playlistLines.length - 1, index + 1)
                              )
                            }
                            disabled={index === playlistLines.length - 1}
                          >
                            <MaterialIcons
                              name="keyboard-arrow-down"
                              size={20}
                              color={
                                index === playlistLines.length - 1 ? '#d1d5db' : '#6b7280'
                              }
                            />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionButton, styles.removeButton]}
                            onPress={() => removeMediaFile(Number(file.id))}
                          >
                            <MaterialIcons name="remove" size={20} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.scheduleRow}>
                        <Text style={styles.scheduleLabel}>Calendar</Text>
                        <Switch
                          value={line.scheduleEnabled}
                          onValueChange={(v) =>
                            updateLine(index, {
                              scheduleEnabled: v,
                              ...(!v
                                ? {
                                    scheduleStartDate: null,
                                    scheduleEndDate: null,
                                    scheduleExactDates: [],
                                    scheduleRecurringRules: [],
                                  }
                                : {}),
                            })
                          }
                          trackColor={{ false: '#e5e7eb', true: '#bfdbfe' }}
                          thumbColor={line.scheduleEnabled ? '#3b82f6' : '#9ca3af'}
                        />
                      </View>

                      {line.scheduleEnabled && (
                        <View style={styles.scheduleDetails}>
                          <View style={styles.dateRow}>
                            <Text style={styles.miniLabel}>Start</Text>
                            <TouchableOpacity
                              style={styles.dateChip}
                              onPress={() => openDatePicker(index, 'start')}
                            >
                              <Text style={styles.dateChipText}>
                                {line.scheduleStartDate || 'Set'}
                              </Text>
                            </TouchableOpacity>
                            <Text style={styles.miniLabel}>Expires</Text>
                            <TouchableOpacity
                              style={styles.dateChip}
                              onPress={() => openDatePicker(index, 'end')}
                            >
                              <Text style={styles.dateChipText}>
                                {line.scheduleEndDate || 'Set'}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          <Text style={styles.subLabel}>Exact dates</Text>
                          <View style={styles.exactDatesRow}>
                            {line.scheduleExactDates.map((d) => (
                              <TouchableOpacity
                                key={d}
                                style={styles.exactChip}
                                onPress={() => removeExactDate(index, d)}
                              >
                                <Text style={styles.exactChipText}>{d}</Text>
                                <MaterialIcons name="close" size={14} color="#6b7280" />
                              </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                              style={styles.addDateBtn}
                              onPress={() => openDatePicker(index, 'exact')}
                            >
                              <MaterialIcons name="add" size={18} color="#3b82f6" />
                              <Text style={styles.addDateBtnText}>Add date</Text>
                            </TouchableOpacity>
                          </View>

                          <Text style={styles.subLabel}>Weekly repeat</Text>
                          <View style={styles.weekdayRow}>
                            {WEEKDAY_SHORT.map((label, wd) => (
                              <TouchableOpacity
                                key={label + wd}
                                style={[
                                  styles.weekdayChip,
                                  weekdays.includes(wd) && styles.weekdayChipOn,
                                ]}
                                onPress={() => toggleWeekday(index, wd)}
                              >
                                <Text
                                  style={[
                                    styles.weekdayChipText,
                                    weekdays.includes(wd) && styles.weekdayChipTextOn,
                                  ]}
                                >
                                  {label}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              {datePickerCtx && Platform.OS === 'ios' && (
                <View style={styles.iosPickerSheet}>
                  <View style={styles.iosPickerHeader}>
                    <TouchableOpacity onPress={() => setDatePickerCtx(null)}>
                      <Text style={styles.iosPickerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.iosPickerTitle}>
                      {datePickerCtx.mode === 'exact' ? 'Add date' : 'Set date'}
                    </Text>
                    <TouchableOpacity onPress={closeDatePickerIos}>
                      <Text style={styles.iosPickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={datePickerValue}
                    mode="date"
                    display="spinner"
                    onChange={onNativeDateChange}
                    style={styles.iosPicker}
                  />
                </View>
              )}

              {datePickerCtx && Platform.OS === 'web' && (
                <View style={styles.iosPickerSheet}>
                  <View style={styles.iosPickerHeader}>
                    <TouchableOpacity onPress={() => setDatePickerCtx(null)}>
                      <Text style={styles.iosPickerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.iosPickerTitle}>
                      {datePickerCtx.mode === 'exact' ? 'Add date' : 'Set date'}
                    </Text>
                    <TouchableOpacity onPress={closeDatePickerIos}>
                      <Text style={styles.iosPickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.webDateInputWrap}>
                    <TextInput
                      style={styles.webDateInput}
                      value={toLocalIsoDate(datePickerValue)}
                      onChangeText={(text) => {
                        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                          setDatePickerValue(parseIsoToLocalDate(text));
                        }
                      }}
                      // @ts-expect-error react-native-web: DOM input type
                      type="date"
                    />
                  </View>
                </View>
              )}

              {datePickerCtx && Platform.OS === 'android' && (
                <DateTimePicker
                  value={datePickerValue}
                  mode="date"
                  display="default"
                  onChange={onNativeDateChange}
                />
              )}
            </View>
          )}

          {activeTab === 'add-media' && (
            <View style={styles.addMediaTab}>
              <Text style={styles.sectionTitle}>Available Media Files</Text>
              
              {availableMediaFiles.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="library-add" size={48} color="#9ca3af" />
                  <Text style={styles.emptyText}>No available media files</Text>
                  <Text style={styles.emptySubtext}>All your media files are already in this playlist</Text>
                </View>
              ) : (
                <MediaSelectionList
                  mediaFiles={availableMediaFiles}
                  selectedMediaIds={[]}
                  onToggleSelection={(mediaId) => addMediaFiles([mediaId])}
                />
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  saveButtonDisabled: {
    color: '#9ca3af',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#3b82f6',
  },
  content: {
    flex: 1,
  },
  detailsTab: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    width: '100%',
  },
  pickerLoading: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
  },
  mediaTab: {
    padding: 16,
  },
  addMediaTab: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  mediaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  mediaItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dragHandle: {
    marginRight: 12,
  },
  mediaItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  mediaItemText: {
    flex: 1,
  },
  mediaItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  mediaItemSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  mediaItemActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  removeButton: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  mediaItemBlock: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  scheduleHint: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 18,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  scheduleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  scheduleDetails: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: '#fff',
    gap: 8,
  },
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  miniLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  dateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  dateChipText: {
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '500',
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
    marginTop: 6,
  },
  exactDatesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  exactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
  },
  exactChipText: {
    fontSize: 12,
    color: '#374151',
  },
  addDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addDateBtnText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '500',
  },
  weekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  weekdayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  weekdayChipOn: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  weekdayChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  weekdayChipTextOn: {
    color: '#1d4ed8',
  },
  iosPickerSheet: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    marginTop: 8,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  iosPickerCancel: {
    fontSize: 16,
    color: '#6b7280',
  },
  iosPickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  iosPickerDone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  iosPicker: {
    height: 200,
  },
  webDateInputWrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  webDateInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1f2937',
  },
});

export default EditPlaylistModal; 