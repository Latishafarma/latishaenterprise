import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  Copy,
  Printer,
  RotateCcw,
  Sparkles,
  Stethoscope,
  Pill,
  ShieldAlert,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Phone,
  Building,
  Check,
  X,
  Database,
  RefreshCw,
  Code,
  CheckCircle2,
  Repeat,
  UserCheck,
  FileBarChart2,
  Volume2,
  LogIn
} from 'lucide-react';
import { DutySchedule, ScheduleDay, Staff, StaffAttendanceRecord, isOwnerAdminRole } from '../types';
import {
  SUPABASE_SCHEDULES_SQL_SCHEMA,
  DEFAULT_SCHEDULE_TABLE,
  getSupabaseConfig,
  setSupabaseConfig
} from '../utils/supabaseClient';
import {
  useFacilityProfiles,
  resolvePharmacyOperationalHours
} from '../utils/facilityProfileHelper';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { StaffAttendancePanel } from './StaffAttendancePanel';
import {
  ATTENDANCE_UPDATED_EVENT,
  loadLocalAttendanceRecords,
  syncAllAttendanceWithSupabase,
  resolveScheduleAttendanceBadge,
  findOverdueUncheckedSchedules,
  hasTriggeredCheckInOverdueAlert,
  markTriggeredCheckInOverdueAlert
} from '../utils/attendanceService';
import { playCheckInOverdueAlarmAndVoice } from '../utils/audio';

interface DutyScheduleViewProps {
  schedules: DutySchedule[];
  staffList: Staff[];
  onAddSchedule: (schedule: DutySchedule) => void;
  onUpdateSchedule: (schedule: DutySchedule) => void;
  onDeleteSchedule: (id: string) => void;
  onResetDefault: () => void;
  onSyncSupabase?: () => Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  needsTableSetup?: boolean;
  isDemoSandbox?: boolean;
  currentUserName?: string;
  currentStaffId?: string;
  currentBranchId?: string;
  onAuditLog?: (module: string, action: string) => void;
}

const DAYS_OF_WEEK: ScheduleDay[] = [
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
  'Minggu'
];

const MONTH_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des'
];

interface WeekDayInfo {
  day: ScheduleDay;
  date: Date;
  iso: string; // YYYY-MM-DD
  dayNum: number;
  shortDate: string; // e.g. "21 Nov"
  fullDate: string; // e.g. "21 Nov 2026"
  isToday: boolean;
}

const toLocalIsoDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseLocalIsoDate = (iso?: string): Date | null => {
  if (!iso || typeof iso !== 'string') return null;
  const parts = iso.trim().slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
};

const getScheduleDayFromDate = (date: Date): ScheduleDay => {
  const dayMap: Record<number, ScheduleDay> = {
    0: 'Minggu',
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu'
  };
  return dayMap[date.getDay()] || 'Senin';
};

const getMondayOfWeek = (baseDate: Date): Date => {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12, 0, 0, 0);
  const jsDay = d.getDay(); // 0=Minggu, 1=Senin, ..., 6=Sabtu
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diffToMonday);
  return d;
};

const formatShortDateId = (date: Date): string => {
  return `${date.getDate()} ${MONTH_SHORT_ID[date.getMonth()]}`;
};

const formatFullDateId = (date: Date): string => {
  return `${date.getDate()} ${MONTH_SHORT_ID[date.getMonth()]} ${date.getFullYear()}`;
};

const formatIsoToFullDateId = (iso?: string): string => {
  const parsed = parseLocalIsoDate(iso);
  return parsed ? formatFullDateId(parsed) : '-';
};

const getWeekDaysForOffset = (weekOffset: number, todayRef: Date): WeekDayInfo[] => {
  const todayIso = toLocalIsoDate(todayRef);
  const monday = getMondayOfWeek(todayRef);
  monday.setDate(monday.getDate() + weekOffset * 7);

  return DAYS_OF_WEEK.map((day, idx) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + idx, 12, 0, 0, 0);
    const iso = toLocalIsoDate(d);
    return {
      day,
      date: d,
      iso,
      dayNum: d.getDate(),
      shortDate: formatShortDateId(d),
      fullDate: formatFullDateId(d),
      isToday: iso === todayIso
    };
  });
};

const getWeekOffsetForIso = (iso: string, todayRef: Date): number => {
  const parsed = parseLocalIsoDate(iso);
  if (!parsed) return 0;
  const targetMonday = getMondayOfWeek(parsed);
  const currentMonday = getMondayOfWeek(todayRef);
  const diffMs = targetMonday.getTime() - currentMonday.getTime();
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
};

const formatWeekRangeId = (weekDays: WeekDayInfo[]): string => {
  if (weekDays.length < 7) return '';
  const first = weekDays[0].date;
  const last = weekDays[6].date;
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} ${MONTH_SHORT_ID[last.getMonth()]} ${last.getFullYear()}`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${first.getDate()} ${MONTH_SHORT_ID[first.getMonth()]} – ${last.getDate()} ${MONTH_SHORT_ID[last.getMonth()]} ${last.getFullYear()}`;
  }
  return `${formatFullDateId(first)} – ${formatFullDateId(last)}`;
};

const scheduleMatchesWeekDay = (sch: DutySchedule, dayInfo: WeekDayInfo): boolean => {
  if (sch.scheduleDate && sch.scheduleDate.trim()) {
    return sch.scheduleDate.trim().slice(0, 10) === dayInfo.iso;
  }
  return sch.day === dayInfo.day;
};

export const DutyScheduleView: React.FC<DutyScheduleViewProps> = ({
  schedules,
  staffList,
  onAddSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  onResetDefault,
  onSyncSupabase,
  needsTableSetup = false,
  isDemoSandbox = false,
  currentUserName,
  currentStaffId,
  currentBranchId,
  onAuditLog
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'jadwal' | 'kehadiran' | 'laporan'>('jadwal');
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('SEMUA');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('SEMUA');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('SEMUA');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('matrix');
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Real-time Attendance Records + lightweight 30s minute tick for live status badges & overdue check
  const [attendanceRecords, setAttendanceRecords] = useState<StaffAttendanceRecord[]>(() =>
    loadLocalAttendanceRecords()
  );
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [dismissedOverdueBanner, setDismissedOverdueBanner] = useState<boolean>(false);

  useEffect(() => {
    const handleAttendanceUpdated = () => {
      setAttendanceRecords(loadLocalAttendanceRecords());
    };
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, handleAttendanceUpdated);

    if (!isDemoSandbox) {
      syncAllAttendanceWithSupabase()
        .then((res) => {
          if (res.records) setAttendanceRecords(res.records);
        })
        .catch(() => {});
    }

    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 30000);

    return () => {
      window.removeEventListener(ATTENDANCE_UPDATED_EVENT, handleAttendanceUpdated);
      window.clearInterval(timer);
    };
  }, [isDemoSandbox]);

  const nowDate = useMemo(() => new Date(nowTick), [nowTick]);

  const todayRef = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toLocalIsoDate(todayRef), [todayRef]);
  const todayFullDate = useMemo(() => formatFullDateId(todayRef), [todayRef]);
  const activeWeekDays = useMemo(
    () => getWeekDaysForOffset(weekOffset, todayRef),
    [weekOffset, todayRef]
  );
  const activeWeekDateByDay = useMemo(() => {
    const map = {} as Record<ScheduleDay, WeekDayInfo>;
    activeWeekDays.forEach((info) => {
      map[info.day] = info;
    });
    return map;
  }, [activeWeekDays]);
  const activeWeekRangeLabel = useMemo(
    () => formatWeekRangeId(activeWeekDays),
    [activeWeekDays]
  );

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Supabase sync & schema modal state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const isOwnerAdmin = useIsOwnerAdmin();
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [scheduleTableInput, setScheduleTableInput] = useState(() => getSupabaseConfig().scheduleTable);

  const handleRunSupabaseSync = async () => {
    if (!onSyncSupabase) return;
    setIsSyncing(true);
    setSyncToast(null);
    try {
      const res = await onSyncSupabase();
      if (res.isDemo) {
        setSyncToast({
          type: 'warning',
          message: 'Mode Demo / Sandbox aktif. Sinkronisasi ke Supabase produksi dinonaktifkan otomatis.'
        });
      } else if (res.success) {
        setSyncToast({
          type: 'success',
          message: `Sinkronisasi 2-arah jadwal berhasil! Total ${res.count ?? schedules.length} jadwal tersinkron dengan Supabase.`
        });
      } else if (res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: isOwnerAdmin
            ? `Tabel "${scheduleTableInput || DEFAULT_SCHEDULE_TABLE}" belum dibuat di Supabase. Salin skrip SQL pada modal Skema SQL untuk mengaktifkan sinkronisasi cloud.`
            : `Tabel "${scheduleTableInput || DEFAULT_SCHEDULE_TABLE}" belum tersedia di Supabase. Silakan hubungi APJ / Owner untuk aktivasi sinkronisasi cloud.`
        });
        if (isOwnerAdmin) setShowSchemaModal(true);
      } else {
        setSyncToast({
          type: 'error',
          message: res.error || 'Gagal menyinkronkan jadwal ke Supabase.'
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveTableName = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSandbox) return;
    const cleaned = scheduleTableInput.trim() || DEFAULT_SCHEDULE_TABLE;
    setScheduleTableInput(cleaned);
    setSupabaseConfig({ scheduleTable: cleaned });
    handleRunSupabaseSync();
  };

  const handleCopySchema = () => {
    navigator.clipboard?.writeText(SUPABASE_SCHEDULES_SQL_SCHEMA).then(() => {
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2500);
    }).catch(() => {});
  };

  // Form State
  const [formStaffId, setFormStaffId] = useState<string>('');
  const [formDay, setFormDay] = useState<ScheduleDay>('Senin');
  const [formScheduleDate, setFormScheduleDate] = useState<string>(() => toLocalIsoDate(new Date()));
  const [formIsRecurring, setFormIsRecurring] = useState<boolean>(false);
  const [formMultipleDays, setFormMultipleDays] = useState<ScheduleDay[]>(['Senin']);
  const [isBulkDays, setIsBulkDays] = useState(false);
  const [formStartTime, setFormStartTime] = useState<string>('08:00');
  const [formEndTime, setFormEndTime] = useState<string>('20:00');
  const [formServiceUnit, setFormServiceUnit] = useState<string>('');
  const [formSessionLabel, setFormSessionLabel] = useState<string>('');
  const [formQuota, setFormQuota] = useState<number | ''>('');
  const [formStatus, setFormStatus] = useState<'Aktif' | 'Cuti / Libur' | 'On-Call' | ''>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [presetAppliedManually, setPresetAppliedManually] = useState<boolean>(false);

  // Live Pharmacy Operational Schedule (synced with Profil Apotek)
  const { pharmacyProfile } = useFacilityProfiles();
  const pharmacyOpHours = useMemo(
    () => resolvePharmacyOperationalHours(pharmacyProfile),
    [pharmacyProfile]
  );

  // Selected staff details (do not fall back to first staff when formStaffId is empty)
  const selectedStaff = useMemo(() => {
    if (!formStaffId) return null;
    return staffList.find((s) => s.id === formStaffId) || null;
  }, [staffList, formStaffId]);

  // Helper: Resolve date for a chosen ScheduleDay within the week of the currently selected date (or active week)
  const resolveDateForDayInWeek = (targetDay: ScheduleDay, anchorIso?: string): string => {
    const parsedAnchor = parseLocalIsoDate(anchorIso);
    if (parsedAnchor) {
      const monday = getMondayOfWeek(parsedAnchor);
      const dayIdx = DAYS_OF_WEEK.indexOf(targetDay);
      const resultDate = new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + (dayIdx >= 0 ? dayIdx : 0),
        12,
        0,
        0,
        0
      );
      return toLocalIsoDate(resultDate);
    }
    return activeWeekDateByDay[targetDay]?.iso || todayIso;
  };

  const isNurseOrMidwifeRole = (role?: string): boolean => {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized.includes('perawat') || normalized.includes('bidan');
  };

  const getDefaultsForStaffRole = (role?: string) => {
    if (role === 'Dokter') {
      return {
        startTime: '08:00',
        endTime: '20:00',
        serviceUnit: 'Poli Umum',
        sessionLabel: 'Full Day (Fleksibel)',
        notes: 'Praktik Dokter Umum'
      };
    }
    if (isOwnerAdminRole(role)) {
      return {
        startTime: pharmacyOpHours.openTime,
        endTime: pharmacyOpHours.closeTime,
        serviceUnit: 'Konseling Farmasi',
        sessionLabel: 'Pelayanan Apotek',
        notes: 'Konseling Farmasi & Pengawasan APJ'
      };
    }
    if (role === 'Apoteker') {
      return {
        startTime: pharmacyOpHours.openTime,
        endTime: pharmacyOpHours.closeTime,
        serviceUnit: 'Konseling Farmasi',
        sessionLabel: 'Pelayanan Apotek',
        notes: 'Pelayanan Resep & Farmasi Klinis'
      };
    }
    if (isNurseOrMidwifeRole(role)) {
      return {
        startTime: pharmacyOpHours.openTime,
        endTime: pharmacyOpHours.closeTime,
        serviceUnit: 'Kasir & Front Office',
        sessionLabel: 'Pelayanan Apotek',
        notes: 'Pendaftaran & Pelayanan'
      };
    }
    return {
      startTime: pharmacyOpHours.openTime,
      endTime: pharmacyOpHours.closeTime,
      serviceUnit: 'Kasir & Front Office',
      sessionLabel: 'Pelayanan Apotek',
      notes: 'Pendaftaran & Kasir'
    };
  };

  // When opening modal for new (clear staff & marked fields until staff and/or preset cepat is chosen)
  const handleOpenNewModal = (presetDay?: ScheduleDay) => {
    const resolvedDay: ScheduleDay =
      presetDay ||
      (selectedDayFilter !== 'SEMUA'
        ? (selectedDayFilter as ScheduleDay)
        : weekOffset === 0
        ? getScheduleDayFromDate(todayRef)
        : 'Senin');
    const resolvedDateIso = activeWeekDateByDay[resolvedDay]?.iso || todayIso;

    setEditingScheduleId(null);
    setPresetAppliedManually(false);
    setFormStaffId('');
    setFormDay(resolvedDay);
    setFormScheduleDate(resolvedDateIso);
    setFormIsRecurring(false);
    setFormMultipleDays([resolvedDay]);
    setIsBulkDays(false);
    setFormStartTime(pharmacyOpHours.openTime || '08:00');
    setFormEndTime(pharmacyOpHours.closeTime || '20:00');
    setFormServiceUnit('');
    setFormSessionLabel('');
    setFormQuota('');
    setFormStatus('');
    setFormNotes('');
    setIsModalOpen(true);
  };

  // When editing
  const handleOpenEditModal = (sch: DutySchedule, contextualIso?: string) => {
    const hasSpecificDate = Boolean(sch.scheduleDate && sch.scheduleDate.trim());
    const initialDateIso = hasSpecificDate
      ? sch.scheduleDate!.trim().slice(0, 10)
      : contextualIso || activeWeekDateByDay[sch.day]?.iso || todayIso;
    const parsedInitial = parseLocalIsoDate(initialDateIso);
    const syncedDay = hasSpecificDate && parsedInitial ? getScheduleDayFromDate(parsedInitial) : sch.day;
    const matchedStaff = staffList.find((s) => s.id === sch.staffId);
    const isNurseMidwife = isNurseOrMidwifeRole(matchedStaff?.role || sch.staffRole);
    const trimmedNotes = (sch.notes || '').trim();
    const resolvedNotes =
      isNurseMidwife && (!trimmedNotes || trimmedNotes === 'Pendaftaran & Kasir')
        ? 'Pendaftaran & Pelayanan'
        : sch.notes || '';

    setEditingScheduleId(sch.id);
    setPresetAppliedManually(false);
    setFormStaffId(sch.staffId);
    setFormDay(syncedDay);
    setFormScheduleDate(initialDateIso);
    setFormIsRecurring(!hasSpecificDate);
    setFormMultipleDays([syncedDay]);
    setIsBulkDays(false);
    setFormStartTime(sch.startTime);
    setFormEndTime(sch.endTime);
    setFormServiceUnit(sch.serviceUnit);
    setFormSessionLabel(sch.sessionLabel);
    setFormQuota(sch.quotaPerDay || 40);
    setFormStatus(sch.status);
    setFormNotes(resolvedNotes);
    setIsModalOpen(true);
  };

  // Sync handlers between Date input and Day dropdown
  const handleFormDateChange = (nextIso: string) => {
    setFormScheduleDate(nextIso);
    const parsed = parseLocalIsoDate(nextIso);
    if (parsed) {
      setFormDay(getScheduleDayFromDate(parsed));
    }
    if (nextIso) {
      setFormIsRecurring(false);
    }
  };

  const handleFormDayChange = (nextDay: ScheduleDay) => {
    setFormDay(nextDay);
    const nextIso = resolveDateForDayInWeek(nextDay, formScheduleDate);
    setFormScheduleDate(nextIso);
  };

  // Quick Preset Helper
  const applyTimePreset = (start: string, end: string, label: string) => {
    setPresetAppliedManually(true);
    setFormStartTime(start);
    setFormEndTime(end);
    setFormSessionLabel(label);
    setFormStatus((prev) => prev || 'Aktif');
    setFormQuota((prev) => (prev === '' ? 40 : prev));
    setFormServiceUnit((prev) => {
      if (prev) return prev;
      if (selectedStaff) return getDefaultsForStaffRole(selectedStaff.role).serviceUnit;
      return label === 'Pelayanan Apotek' ? 'Konseling Farmasi' : 'Poli Umum';
    });
    setFormNotes((prev) => {
      if (label === 'Lembur Minggu') {
        const isAutoDefaultNote =
          !prev ||
          prev.startsWith('Praktik ') ||
          prev.startsWith('Pelayanan ') ||
          prev.startsWith('Konseling ') ||
          prev.startsWith('Pendaftaran ') ||
          prev.startsWith('Shift ') ||
          prev.startsWith('Full Day');
        return isAutoDefaultNote ? 'Lembur Hari Minggu (07.30 - 17.00 WIB)' : prev;
      }
      if (prev) return prev;
      if (selectedStaff) return getDefaultsForStaffRole(selectedStaff.role).notes;
      return `${label} (${start.replace(':', '.')} - ${end.replace(':', '.')} WIB)`;
    });
  };

  // Save Schedule
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const stf = staffList.find((s) => s.id === formStaffId);
    if (!stf) return;

    const resolvedStatus: 'Aktif' | 'Cuti / Libur' | 'On-Call' = formStatus || 'Aktif';
    const resolvedQuota = Number(formQuota) || 40;
    const resolvedServiceUnit =
      formServiceUnit || getDefaultsForStaffRole(stf.role).serviceUnit;

    if (editingScheduleId) {
      const safeDate =
        formScheduleDate && formScheduleDate.trim()
          ? formScheduleDate.trim().slice(0, 10)
          : resolveDateForDayInWeek(formDay, todayIso);
      const parsedDate = !formIsRecurring ? parseLocalIsoDate(safeDate) : null;
      const finalDay: ScheduleDay = parsedDate ? getScheduleDayFromDate(parsedDate) : formDay;
      const finalDate: string | undefined = !formIsRecurring ? safeDate : undefined;

      const updated: DutySchedule = {
        id: editingScheduleId,
        staffId: stf.id,
        staffName: stf.name,
        staffRole: stf.role,
        day: finalDay,
        scheduleDate: finalDate,
        startTime: formStartTime,
        endTime: formEndTime,
        serviceUnit: resolvedServiceUnit,
        sessionLabel: formSessionLabel || `${formStartTime} - ${formEndTime} WIB`,
        quotaPerDay: resolvedQuota,
        status: resolvedStatus,
        notes: formNotes,
        phone: stf.phone
      };
      onUpdateSchedule(updated);

      if (finalDate) {
        const targetWeekOffset = getWeekOffsetForIso(finalDate, todayRef);
        if (targetWeekOffset !== weekOffset) {
          setWeekOffset(targetWeekOffset);
        }
      }
    } else if (isBulkDays && formMultipleDays.length > 0) {
      const targetDays = formMultipleDays;
      targetDays.forEach((d, idx) => {
        const dayIso =
          activeWeekDateByDay[d]?.iso || resolveDateForDayInWeek(d, formScheduleDate);
        const newSch: DutySchedule = {
          id: `SCH-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
          staffId: stf.id,
          staffName: stf.name,
          staffRole: stf.role,
          day: d,
          scheduleDate: formIsRecurring ? undefined : dayIso,
          startTime: formStartTime,
          endTime: formEndTime,
          serviceUnit: resolvedServiceUnit,
          sessionLabel: formSessionLabel || `${formStartTime} - ${formEndTime} WIB`,
          quotaPerDay: resolvedQuota,
          status: resolvedStatus,
          notes: formNotes,
          phone: stf.phone
        };
        onAddSchedule(newSch);
      });
    } else {
      const safeDate =
        formScheduleDate && formScheduleDate.trim()
          ? formScheduleDate.trim().slice(0, 10)
          : resolveDateForDayInWeek(formDay, todayIso);
      const parsedDate = !formIsRecurring ? parseLocalIsoDate(safeDate) : null;
      const finalDay: ScheduleDay = parsedDate ? getScheduleDayFromDate(parsedDate) : formDay;
      const finalDate: string | undefined = !formIsRecurring ? safeDate : undefined;

      const newSch: DutySchedule = {
        id: `SCH-${Date.now()}-0-${Math.floor(Math.random() * 1000)}`,
        staffId: stf.id,
        staffName: stf.name,
        staffRole: stf.role,
        day: finalDay,
        scheduleDate: finalDate,
        startTime: formStartTime,
        endTime: formEndTime,
        serviceUnit: resolvedServiceUnit,
        sessionLabel: formSessionLabel || `${formStartTime} - ${formEndTime} WIB`,
        quotaPerDay: resolvedQuota,
        status: resolvedStatus,
        notes: formNotes,
        phone: stf.phone
      };
      onAddSchedule(newSch);

      if (finalDate) {
        const targetWeekOffset = getWeekOffsetForIso(finalDate, todayRef);
        if (targetWeekOffset !== weekOffset) {
          setWeekOffset(targetWeekOffset);
        }
      }
    }

    setIsModalOpen(false);
  };

  // Quick toggle status between Aktif and Cuti
  const handleToggleStatus = (sch: DutySchedule) => {
    const nextStatus = sch.status === 'Aktif' ? 'Cuti / Libur' : 'Aktif';
    onUpdateSchedule({ ...sch, status: nextStatus });
  };

  // Base filtered schedules (by role, unit, search)
  const baseFilteredSchedules = useMemo(() => {
    return schedules.filter((sch) => {
      const matchRole = selectedRoleFilter === 'SEMUA' || sch.staffRole === selectedRoleFilter;
      const matchUnit = selectedUnitFilter === 'SEMUA' || sch.serviceUnit === selectedUnitFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        sch.staffName.toLowerCase().includes(q) ||
        sch.serviceUnit.toLowerCase().includes(q) ||
        (sch.notes && sch.notes.toLowerCase().includes(q)) ||
        (sch.scheduleDate && sch.scheduleDate.includes(q)) ||
        sch.startTime.includes(q) ||
        sch.endTime.includes(q);

      return matchRole && matchUnit && matchSearch;
    });
  }, [schedules, selectedRoleFilter, selectedUnitFilter, searchQuery]);

  // Active week table rows (each schedule matched to its day & date in the active week)
  const activeWeekTableRows = useMemo(() => {
    const visibleDays = activeWeekDays.filter(
      (d) => selectedDayFilter === 'SEMUA' || selectedDayFilter === d.day
    );
    const rows: { schedule: DutySchedule; dayInfo: WeekDayInfo }[] = [];
    visibleDays.forEach((dayInfo) => {
      const dayMatches = baseFilteredSchedules
        .filter((sch) => scheduleMatchesWeekDay(sch, dayInfo))
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
      dayMatches.forEach((sch) => rows.push({ schedule: sch, dayInfo }));
    });
    return rows;
  }, [activeWeekDays, selectedDayFilter, baseFilteredSchedules]);

  // Statistics
  const stats = useMemo(() => {
    const activeWeekSlots = activeWeekDays.flatMap((dayInfo) =>
      schedules.filter((s) => s.status === 'Aktif' && scheduleMatchesWeekDay(s, dayInfo))
    );
    const doctorCount = new Set(
      activeWeekSlots.filter((s) => s.staffRole === 'Dokter').map((s) => s.staffId)
    ).size;
    const pharmacistCount = new Set(
      activeWeekSlots
        .filter((s) => isOwnerAdminRole(s.staffRole) || s.staffRole === 'Apoteker')
        .map((s) => s.staffId)
    ).size;
    const todayName = getScheduleDayFromDate(todayRef);
    const todayInfo: WeekDayInfo = {
      day: todayName,
      date: todayRef,
      iso: todayIso,
      dayNum: todayRef.getDate(),
      shortDate: formatShortDateId(todayRef),
      fullDate: todayFullDate,
      isToday: true
    };
    const todaySlots = schedules.filter(
      (s) => s.status === 'Aktif' && scheduleMatchesWeekDay(s, todayInfo)
    );

    return {
      totalActiveInWeek: activeWeekSlots.length,
      doctorCount,
      pharmacistCount,
      todayName,
      todaySlotsCount: todaySlots.length
    };
  }, [schedules, activeWeekDays, todayRef, todayIso, todayFullDate]);

  // Overdue Check-In detection (> 5 minutes after schedule start time)
  const overdueUncheckedSchedules = useMemo(
    () =>
      findOverdueUncheckedSchedules({
        schedules,
        records: attendanceRecords,
        now: nowDate,
        graceMinutes: 5
      }),
    [schedules, attendanceRecords, nowDate]
  );

  useEffect(() => {
    if (overdueUncheckedSchedules.length === 0) return;
    const unalerted = overdueUncheckedSchedules.filter(
      (sch) => !hasTriggeredCheckInOverdueAlert(todayIso, sch.id)
    );
    if (unalerted.length === 0) return;

    unalerted.forEach((sch) => markTriggeredCheckInOverdueAlert(todayIso, sch.id));
    setDismissedOverdueBanner(false);
    playCheckInOverdueAlarmAndVoice().catch(() => {});
  }, [overdueUncheckedSchedules, todayIso]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Banner / Integration Notice */}
      <div className="bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-sky-800/40">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[11px] font-bold">
            <Sparkles className="w-3.5 h-3.5 text-sky-300" />
            <span>Terintegrasi Otomatis Data Pegawai & Portal Pendaftaran Online Pasien</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            Jadwal Dokter & Petugas Apotek
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Atur jam praktik dokter umum/spesialis dan jadwal shift bertugas apoteker serta tenaga teknis kefarmasian secara fleksibel (misal Senin 08.00 - 20.00 WIB). Jadwal aktif otomatis tampil pada pilihan sesi pasien di Portal Pendaftaran Mandiri.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto shrink-0">
          {activeSubTab === 'jadwal' && (
            <>
              {onSyncSupabase && (
                <button
                  type="button"
                  onClick={handleRunSupabaseSync}
                  disabled={isSyncing}
                  className="px-3.5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-bold text-xs flex items-center gap-1.5 transition border border-emerald-500/30 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Sync...' : 'Sync Supabase'}</span>
                </button>
              )}
              {isOwnerAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setScheduleTableInput(getSupabaseConfig().scheduleTable);
                    setShowSchemaModal(true);
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition border border-white/10 cursor-pointer"
                >
                  <Code className="w-3.5 h-3.5 text-sky-300" />
                  <span className="hidden sm:inline">Skema SQL</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenNewModal()}
                className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 transition cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Jadwal</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition border border-white/10 cursor-pointer"
                title="Cetak Jadwal Mingguan"
              >
                <Printer className="w-4 h-4 text-slate-300" />
                <span className="hidden sm:inline">Cetak</span>
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold text-xs flex items-center gap-1.5 transition border border-rose-500/30 cursor-pointer"
                title="Reset ke Jadwal Default Klinik"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Submenu Navigation: Jadwal | Kehadiran, Cuti & Lembur Minggu | Laporan Absensi */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-1.5 print:hidden">
        <button
          type="button"
          onClick={() => setActiveSubTab('jadwal')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
            activeSubTab === 'jadwal'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Jadwal Shift & Praktik</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('kehadiran')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
            activeSubTab === 'kehadiran'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Kehadiran, Cuti & Lembur Minggu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('laporan')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
            activeSubTab === 'laporan'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <FileBarChart2 className="w-4 h-4" />
          <span>Laporan Absensi</span>
        </button>
      </div>

      {activeSubTab === 'kehadiran' && (
        <StaffAttendancePanel
          mode="kehadiran"
          staffList={staffList}
          schedules={schedules}
          currentUserName={currentUserName}
          currentStaffId={currentStaffId}
          currentBranchId={currentBranchId}
          isDemoSandbox={isDemoSandbox}
          onAuditLog={onAuditLog}
        />
      )}

      {activeSubTab === 'laporan' && (
        <StaffAttendancePanel
          mode="laporan"
          staffList={staffList}
          schedules={schedules}
          currentUserName={currentUserName}
          currentStaffId={currentStaffId}
          currentBranchId={currentBranchId}
          isDemoSandbox={isDemoSandbox}
          onAuditLog={onAuditLog}
        />
      )}

      {activeSubTab === 'jadwal' && (
        <>
      {/* Missing Table Notice or Sync Feedback (APJ / Owner Only) */}
      {(isOwnerAdmin && needsTableSetup && !syncToast && !isDemoSandbox) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Tabel <strong>{scheduleTableInput || DEFAULT_SCHEDULE_TABLE}</strong> belum dibuat di Supabase — saat ini jadwal berjalan aman menggunakan data lokal.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setScheduleTableInput(getSupabaseConfig().scheduleTable);
              setShowSchemaModal(true);
            }}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-[11px] transition cursor-pointer"
          >
            Setup Tabel SQL Supabase
          </button>
        </div>
      )}

      {syncToast && (
        <div
          className={`rounded-2xl px-4 py-3 border text-xs font-medium flex items-center justify-between gap-3 ${
            syncToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : syncToast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{syncToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overdue Check-In Alert (> 5 Menit Melewati Jam Mulai Jadwal) */}
      {overdueUncheckedSchedules.length > 0 && !dismissedOverdueBanner && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-extrabold text-rose-900">
                Peringatan Keterlambatan Check-In (&gt; 5 Menit dari Jam Jadwal)
              </div>
              <p className="text-rose-800 leading-relaxed">
                Petugas/Dokter berikut belum melakukan Check-In absensi hari ini:{' '}
                <strong className="font-bold">
                  {overdueUncheckedSchedules
                    .map((s) => `${s.staffName} (Jadwal ${s.startTime} WIB)`)
                    .join(', ')}
                </strong>
                . Anda belum checkin — silakan segera melakukan Check-In dalam radius 50 meter dari lokasi Apotek.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                playCheckInOverdueAlarmAndVoice().catch(() => {});
              }}
              className="px-3 py-2 rounded-xl bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Putar alarm dan pengumuman suara 'anda belum checkin'"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Putar Peringatan</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('kehadiran')}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Buka Absensi / Check-In</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissedOverdueBanner(true)}
              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 transition cursor-pointer"
              title="Tutup banner sementara"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center font-black">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Dokter Praktik</span>
            <strong className="text-xl font-black text-slate-800">{stats.doctorCount} Personel</strong>
            <span className="text-[10px] text-sky-600 font-bold block mt-0.5">Poli Umum Latisha</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
            <Pill className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Petugas Farmasi & APJ</span>
            <strong className="text-xl font-black text-slate-800">{stats.pharmacistCount} Personel</strong>
            <span className="text-[10px] text-indigo-600 font-bold block mt-0.5">Apoteker & TTK</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
            <CalendarCheck2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Jadwal Aktif Hari Ini</span>
            <strong className="text-xl font-black text-emerald-700">{stats.todaySlotsCount} Shift / Sesi</strong>
            <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
              {stats.todayName}, {todayFullDate}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Slot Pekan Aktif</span>
            <strong className="text-xl font-black text-slate-800">{stats.totalActiveInWeek} Slot Shift</strong>
            <span className="text-[10px] text-amber-600 font-bold block mt-0.5">{activeWeekRangeLabel}</span>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        {/* Week Navigator + View Mode Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 gap-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev - 1)}
                className="w-8 h-8 rounded-lg bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-200 flex items-center justify-center transition cursor-pointer active:scale-95"
                title="Geser ke Pekan Sebelumnya"
                aria-label="Pekan Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="px-3 py-1 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-600 shrink-0" />
                <div className="leading-tight">
                  <span className="text-xs font-black text-slate-900 block">
                    {activeWeekRangeLabel}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 block">
                    {weekOffset === 0
                      ? 'Pekan Ini (Senin – Minggu)'
                      : weekOffset > 0
                      ? `${weekOffset} Pekan Ke Depan (Senin – Minggu)`
                      : `${Math.abs(weekOffset)} Pekan Sebelumnya (Senin – Minggu)`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev + 1)}
                className="w-8 h-8 rounded-lg bg-sky-600 hover:bg-sky-500 text-white border border-sky-600 flex items-center justify-center transition cursor-pointer shadow-xs active:scale-95"
                title="Geser ke Pekan Berikutnya"
                aria-label="Pekan Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold transition cursor-pointer"
              >
                Kembali ke Pekan Ini
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                viewMode === 'matrix' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Kalender Mingguan
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Daftar Tabel
            </button>
          </div>
        </div>

        {/* Day of Week Tabs with Calendar Dates */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
          <button
            type="button"
            onClick={() => setSelectedDayFilter('SEMUA')}
            className={`px-3 py-1.5 rounded-xl font-bold transition text-xs cursor-pointer ${
              selectedDayFilter === 'SEMUA'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Semua Hari (7 Hari)
          </button>
          {activeWeekDays.map((dayInfo) => {
            const countForDay = schedules.filter(
              (s) => s.status === 'Aktif' && scheduleMatchesWeekDay(s, dayInfo)
            ).length;
            const isSelected = selectedDayFilter === dayInfo.day;
            return (
              <button
                key={dayInfo.iso}
                type="button"
                onClick={() => setSelectedDayFilter(dayInfo.day)}
                className={`px-2.5 py-1.5 rounded-xl font-bold transition text-xs flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-sky-600 text-white shadow-xs'
                    : dayInfo.isToday
                    ? 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{dayInfo.day}</span>
                <span
                  className={`text-[10px] font-medium ${
                    isSelected ? 'text-sky-100' : 'text-slate-400'
                  }`}
                >
                  {dayInfo.shortDate}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    isSelected ? 'bg-sky-700 text-white' : 'bg-white/80 text-slate-600'
                  }`}
                >
                  {countForDay}
                </span>
              </button>
            );
          })}
        </div>

        {/* Second Row Filters: Search & Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama dokter, petugas, tanggal, catatan jadwal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-sky-500 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white font-bold text-xs text-slate-700"
            >
              <option value="SEMUA">Semua Peran Pegawai</option>
              <option value="Dokter">Dokter</option>
              <option value="APJ / Owner">APJ / Owner</option>
              <option value="Apoteker">Apoteker / TTK</option>
              <option value="Perawat / Bidan">Perawat / Bidan</option>
              <option value="Kasir & Front Office">Kasir & Front Office</option>
            </select>

            <select
              value={selectedUnitFilter}
              onChange={(e) => setSelectedUnitFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white font-bold text-xs text-slate-700"
            >
              <option value="SEMUA">Semua Unit Layanan</option>
              <option value="Poli Umum">Poli Umum</option>
              <option value="Konseling Farmasi">Konseling Farmasi</option>
              <option value="Kasir & Front Office">Kasir & Front Office</option>
              <option value="Laboratorium">Laboratorium</option>
            </select>
          </div>
        </div>
      </div>

      {/* MATRIX / WEEKLY CALENDAR VIEW */}
      {viewMode === 'matrix' ? (
        <div
          className={
            selectedDayFilter === 'SEMUA'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3'
              : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
          }
        >
          {activeWeekDays
            .filter((dayInfo) => selectedDayFilter === 'SEMUA' || selectedDayFilter === dayInfo.day)
            .map((dayInfo) => {
              const daySchedules = baseFilteredSchedules
                .filter((s) => scheduleMatchesWeekDay(s, dayInfo))
                .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

              return (
                <div
                  key={dayInfo.iso}
                  className={`bg-white rounded-2xl border transition-all flex flex-col overflow-hidden shadow-xs ${
                    dayInfo.isToday ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-slate-200'
                  }`}
                >
                  {/* Day Header with Day Name + Calendar Date */}
                  <div
                    className={`p-3 border-b space-y-1 ${
                      dayInfo.isToday ? 'bg-sky-600 text-white' : 'bg-slate-50 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-xs font-black">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{dayInfo.day}</span>
                      </div>
                      {dayInfo.isToday ? (
                        <span className="text-[9px] bg-white text-sky-800 px-1.5 py-0.5 rounded-md font-extrabold uppercase shrink-0">
                          Hari Ini
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">
                          {daySchedules.length} Jadwal
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[11px] font-bold flex items-center justify-between ${
                        dayInfo.isToday ? 'text-sky-100' : 'text-slate-500'
                      }`}
                    >
                      <span>{dayInfo.fullDate}</span>
                      {dayInfo.isToday && (
                        <span className="text-[10px] text-sky-100 font-semibold">
                          {daySchedules.length} Jadwal
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Day Content */}
                  <div className="p-2.5 flex-1 space-y-2.5 overflow-y-auto max-h-[600px] custom-scrollbar bg-slate-50/50">
                    {daySchedules.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs space-y-1">
                        <Clock className="w-6 h-6 mx-auto opacity-30" />
                        <p className="text-[11px] font-bold">Tidak ada jadwal</p>
                        <p className="text-[10px] text-slate-400">{dayInfo.fullDate}</p>
                        <button
                          type="button"
                          onClick={() => handleOpenNewModal(dayInfo.day)}
                          className="text-[10px] text-sky-600 hover:underline font-bold mt-1 inline-block cursor-pointer"
                        >
                          + Tambah di {dayInfo.day}, {dayInfo.shortDate}
                        </button>
                      </div>
                    ) : (
                      daySchedules.map((sch) => {
                      const isDoctor = sch.staffRole === 'Dokter';
                      const isAPJ = isOwnerAdminRole(sch.staffRole);
                      const isPharmacist = sch.staffRole === 'Apoteker';
                      const attendanceBadge = resolveScheduleAttendanceBadge({
                        schedule: sch,
                        dayIso: dayInfo.iso,
                        isToday: dayInfo.isToday,
                        records: attendanceRecords,
                        now: nowDate
                      });

                      return (
                        <div
                          key={sch.id}
                          className={`bg-white rounded-xl p-3 border shadow-xs transition hover:shadow-md relative group ${
                            sch.status === 'Aktif'
                              ? 'border-slate-200'
                              : sch.status === 'On-Call'
                              ? 'border-amber-200 bg-amber-50/30'
                              : 'border-rose-200 bg-rose-50/30 opacity-70'
                          }`}
                        >
                          {/* Role & Status Tag */}
                          <div className="flex items-start justify-between gap-1 mb-1.5">
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full inline-block ${
                                isDoctor
                                  ? 'bg-sky-100 text-sky-800'
                                  : isAPJ
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : isPharmacist
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isAPJ ? 'Apoteker PJ' : sch.staffRole}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleToggleStatus(sch)}
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md transition cursor-pointer ${
                                sch.status === 'Aktif'
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : sch.status === 'On-Call'
                                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                              }`}
                              title="Klik untuk ubah status"
                            >
                              {sch.status}
                            </button>
                          </div>

                          {/* Staff Name + Real-Time Attendance Status */}
                          <div className="font-extrabold text-xs text-slate-900 leading-tight flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span>{sch.staffName}</span>
                            {attendanceBadge.kind === 'hadir' && (
                              <span className="font-bold text-[11px] text-emerald-600">
                                {attendanceBadge.label}
                              </span>
                            )}
                            {attendanceBadge.kind === 'belum_masuk' && (
                              <span className="font-bold text-[11px] text-rose-600">
                                {attendanceBadge.label}
                              </span>
                            )}
                          </div>

                          {/* Time Slot Highlight (Misal 08.00 - 20.00 WIB) */}
                          <div className="mt-2 p-2 rounded-lg bg-slate-900 text-white flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-mono font-black text-amber-300">
                              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>
                                {sch.startTime} - {sch.endTime} WIB
                              </span>
                            </div>
                            <span className="text-[9px] bg-slate-800 text-slate-300 px-1 py-0.5 rounded font-sans">
                              {sch.sessionLabel}
                            </span>
                          </div>

                          {/* Unit, Date Mode & Notes */}
                          <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                            <div className="flex items-center gap-1 font-bold text-slate-700">
                              <Building className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{sch.serviceUnit}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-semibold">
                              {sch.scheduleDate ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                                  <Calendar className="w-2.5 h-2.5" />
                                  {formatIsoToFullDateId(sch.scheduleDate)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                  <Repeat className="w-2.5 h-2.5" />
                                  Rutin Mingguan
                                </span>
                              )}
                            </div>
                            {sch.notes && (
                              <p className="text-[10px] text-slate-500 italic line-clamp-2">
                                &ldquo;{sch.notes}&rdquo;
                              </p>
                            )}
                          </div>

                          {/* Action Controls */}
                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[9px] text-slate-400 font-bold">
                              Kuota: {sch.quotaPerDay || 40} Pasien
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(sch, dayInfo.iso)}
                                className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded transition cursor-pointer"
                                title="Edit Jadwal"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Hapus jadwal ${sch.staffName} di hari ${sch.day}?`)) {
                                    onDeleteSchedule(sch.id);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                title="Hapus Jadwal"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {daySchedules.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleOpenNewModal(dayInfo.day)}
                      className="w-full py-1.5 px-2 rounded-xl border border-dashed border-slate-300 hover:border-sky-400 hover:bg-sky-50/70 text-[10px] font-bold text-slate-500 hover:text-sky-700 transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tambah ({dayInfo.shortDate})</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Hari & Tanggal</th>
                  <th className="p-3.5">Dokter / Petugas Apotek</th>
                  <th className="p-3.5">Peran Pegawai</th>
                  <th className="p-3.5">Jam Praktik / Shift</th>
                  <th className="p-3.5">Unit Layanan</th>
                  <th className="p-3.5">Keterangan / Sesi</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeWeekTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      Tidak ada jadwal pada pekan {activeWeekRangeLabel} yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  activeWeekTableRows.map(({ schedule: sch, dayInfo }) => (
                    <tr key={`${sch.id}-${dayInfo.iso}`} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-black text-slate-800 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1.5 ${
                              dayInfo.isToday
                                ? 'bg-sky-600 text-white'
                                : 'bg-sky-50 text-sky-700'
                            }`}
                          >
                            <span>{dayInfo.day}</span>
                            <span className={dayInfo.isToday ? 'text-sky-100 font-semibold' : 'text-sky-600/80 font-semibold'}>
                              • {dayInfo.fullDate}
                            </span>
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400 pl-1">
                            {sch.scheduleDate ? 'Jadwal Tanggal Spesifik' : 'Rutin Mingguan'}
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        {(() => {
                          const tableBadge = resolveScheduleAttendanceBadge({
                            schedule: sch,
                            dayIso: dayInfo.iso,
                            isToday: dayInfo.isToday,
                            records: attendanceRecords,
                            now: nowDate
                          });
                          return (
                            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                              <strong className="text-slate-900 font-bold">{sch.staffName}</strong>
                              {tableBadge.kind === 'hadir' && (
                                <span className="font-bold text-[11px] text-emerald-600">
                                  {tableBadge.label}
                                </span>
                              )}
                              {tableBadge.kind === 'belum_masuk' && (
                                <span className="font-bold text-[11px] text-rose-600">
                                  {tableBadge.label}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {sch.phone && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono mt-0.5">
                            <Phone className="w-2.5 h-2.5" />
                            {sch.phone}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {sch.staffRole}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono font-black text-slate-900 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          <span>
                            {sch.startTime} - {sch.endTime} WIB
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5 font-bold text-slate-700">{sch.serviceUnit}</td>
                      <td className="p-3.5 text-slate-600">
                        <span className="font-semibold block">{sch.sessionLabel}</span>
                        {sch.notes && <span className="text-[10px] text-slate-400 italic">{sch.notes}</span>}
                      </td>
                      <td className="p-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(sch)}
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] cursor-pointer transition ${
                            sch.status === 'Aktif'
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : sch.status === 'On-Call'
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                          }`}
                        >
                          {sch.status}
                        </button>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(sch, dayInfo.iso)}
                            className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Hapus jadwal ${sch.staffName} hari ${sch.day}?`)) {
                                onDeleteSchedule(sch.id);
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

      {/* MODAL: TAMBAH / EDIT JADWAL FLEKSIBEL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-black">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    {editingScheduleId ? 'Edit Jadwal Praktik / Shift' : 'Tambah Jadwal Dokter & Petugas Apotek'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Terintegrasi dengan master data pegawai Latisha Farma
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitForm} className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto custom-scrollbar">
              {/* Field 1: Nama Dokter / Petugas (Integrated with staffList) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pilih Dokter atau Petugas Apotek (Terintegrasi Pegawai) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formStaffId}
                  onChange={(e) => {
                    const stfId = e.target.value;
                    setFormStaffId(stfId);
                    if (!stfId) {
                      setPresetAppliedManually(false);
                      setFormServiceUnit('');
                      setFormSessionLabel('');
                      setFormStatus('');
                      setFormQuota('');
                      setFormNotes('');
                      return;
                    }
                    const stf = staffList.find((s) => s.id === stfId);
                    if (stf) {
                      const defaults = getDefaultsForStaffRole(stf.role);
                      setFormServiceUnit(defaults.serviceUnit);
                      setFormStatus((prev) => prev || 'Aktif');
                      setFormQuota((prev) => (prev === '' ? 40 : prev));
                      if (!editingScheduleId && !presetAppliedManually) {
                        setFormStartTime(defaults.startTime);
                        setFormEndTime(defaults.endTime);
                        setFormSessionLabel(defaults.sessionLabel);
                        setFormNotes(defaults.notes);
                      } else if (editingScheduleId) {
                        setFormNotes(defaults.notes);
                      } else {
                        setFormNotes((prev) => prev || defaults.notes);
                      }
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">-- Pilih Dokter atau Petugas Apotek --</option>
                  {staffList
                    .filter((s) => s.status === 'Aktif')
                    .map((stf) => (
                      <option key={stf.id} value={stf.id}>
                        {stf.name} — [{stf.role}] (ID: {stf.id})
                      </option>
                    ))}
                </select>
                {selectedStaff && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <User className="w-3.5 h-3.5 text-sky-600" />
                    <span>
                      Jabatan Resmi: <strong className="text-slate-800">{selectedStaff.role}</strong>
                    </span>
                    {selectedStaff.phone && (
                      <span className="ml-auto font-mono text-slate-600">{selectedStaff.phone}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Field 2: Pilihan Tanggal & Hari (Single or Bulk) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700">Tanggal & Hari Praktik / Shift *</label>
                  {!editingScheduleId && (
                    <button
                      type="button"
                      onClick={() => setIsBulkDays(!isBulkDays)}
                      className="text-[10px] text-sky-600 hover:underline font-bold cursor-pointer"
                    >
                      {isBulkDays ? 'Mode 1 Hari Saja' : '+ Terapkan ke Banyak Hari Sekaligus'}
                    </button>
                  )}
                </div>

                {!isBulkDays || editingScheduleId ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">
                        Tanggal Kalender {formIsRecurring ? '(Opsional - Mode Rutin)' : '*'}
                      </span>
                      <input
                        type="date"
                        required={!formIsRecurring}
                        value={formScheduleDate}
                        onChange={(e) => handleFormDateChange(e.target.value)}
                        className={`w-full p-2.5 border rounded-xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-sky-500 ${
                          formIsRecurring
                            ? 'bg-slate-100 border-slate-200 text-slate-500'
                            : 'bg-slate-50 border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">
                        Hari Praktik (Selaras Pekan)
                      </span>
                      <select
                        value={formDay}
                        onChange={(e) => handleFormDayChange(e.target.value as ScheduleDay)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-sky-500"
                      >
                        {DAYS_OF_WEEK.map((d) => {
                          const dayIso = resolveDateForDayInWeek(d, formScheduleDate);
                          return (
                            <option key={d} value={d}>
                              {d} ({formatIsoToFullDateId(dayIso)})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-1.5 flex items-center justify-between">
                      <span>Pekan Aktif: <strong>{activeWeekRangeLabel}</strong></span>
                      <span className="text-[10px] text-sky-600 font-bold">
                        {formIsRecurring ? 'Berlaku Rutin' : 'Sesuai Tanggal Pekan Ini'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {activeWeekDays.map((dayInfo) => {
                        const checked = formMultipleDays.includes(dayInfo.day);
                        return (
                          <button
                            key={dayInfo.iso}
                            type="button"
                            onClick={() => {
                              if (checked) {
                                if (formMultipleDays.length > 1) {
                                  setFormMultipleDays(formMultipleDays.filter((item) => item !== dayInfo.day));
                                }
                              } else {
                                setFormMultipleDays([...formMultipleDays, dayInfo.day]);
                              }
                            }}
                            className={`py-2 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                              checked
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <span className="flex items-center gap-1">
                              {checked && <Check className="w-3 h-3" />}
                              <span>{dayInfo.day}</span>
                            </span>
                            <span className={`text-[10px] font-medium ${checked ? 'text-sky-100' : 'text-slate-400'}`}>
                              {dayInfo.shortDate}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFormMultipleDays(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'])}
                        className="text-[10px] text-sky-700 font-bold hover:underline cursor-pointer"
                      >
                        Pilih Senin - Sabtu
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setFormMultipleDays([...DAYS_OF_WEEK])}
                        className="text-[10px] text-sky-700 font-bold hover:underline cursor-pointer"
                      >
                        Pilih Semua 7 Hari
                      </button>
                    </div>
                  </div>
                )}

                {/* Recurring Toggle */}
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition">
                  <input
                    type="checkbox"
                    checked={formIsRecurring}
                    onChange={(e) => setFormIsRecurring(e.target.checked)}
                    className="w-4 h-4 rounded accent-sky-600 cursor-pointer"
                  />
                  <div className="leading-tight">
                    <span className="text-[11px] font-bold text-slate-800 block">
                      Berlaku rutin setiap pekan (tanpa batas tanggal)
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {formIsRecurring
                        ? `Jadwal akan tampil otomatis setiap hari ${isBulkDays ? 'yang dipilih' : formDay} di seluruh pekan.`
                        : `Jadwal disimpan khusus untuk tanggal ${isBulkDays ? `pekan ${activeWeekRangeLabel}` : `${formDay}, ${formatIsoToFullDateId(formScheduleDate)}`}.`}
                    </span>
                  </div>
                </label>
              </div>

              {/* Field 3: Pengaturan Jam Fleksibel (e.g. 08:00 - 20:00 WIB) */}
              <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-sky-950 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-sky-600" />
                    <span>Pengaturan Jam Kerja Fleksibel</span>
                  </label>
                  <span className="text-[10px] text-sky-700 font-bold">WIB</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-600 block mb-1">Jam Mulai Praktik</span>
                    <input
                      type="time"
                      required
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-600 block mb-1">Jam Selesai Praktik</span>
                    <input
                      type="time"
                      required
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900"
                    />
                  </div>
                </div>

                {/* Preset Cepat */}
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-500 mr-1">Preset Cepat:</span>
                  <button
                    type="button"
                    onClick={() => applyTimePreset('08:00', '20:00', 'Full Day (Fleksibel)')}
                    className="px-2 py-1 rounded-lg bg-white border border-sky-300 text-sky-800 text-[10px] font-bold hover:bg-sky-100 cursor-pointer shadow-2xs"
                  >
                    08.00 - 20.00 (Full Day)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTimePreset('08:00', '14:00', 'Shift Pagi')}
                    className="px-2 py-1 rounded-lg bg-white border border-sky-300 text-sky-800 text-[10px] font-bold hover:bg-sky-100 cursor-pointer shadow-2xs"
                  >
                    08.00 - 14.00 (Pagi)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTimePreset('14:00', '20:00', 'Shift Sore/Malam')}
                    className="px-2 py-1 rounded-lg bg-white border border-sky-300 text-sky-800 text-[10px] font-bold hover:bg-sky-100 cursor-pointer shadow-2xs"
                  >
                    14.00 - 20.00 (Sore)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyTimePreset(
                        pharmacyOpHours.openTime,
                        pharmacyOpHours.closeTime,
                        'Pelayanan Apotek'
                      )
                    }
                    title={`Otomatis mengikuti Jadwal Operasional di Profil Apotek (${pharmacyOpHours.summary})`}
                    className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-bold hover:bg-emerald-100 cursor-pointer shadow-2xs inline-flex items-center gap-1"
                  >
                    <Building className="w-3 h-3 text-emerald-600" />
                    <span>{pharmacyOpHours.rangeLabel} (Apotek)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      applyTimePreset('07:30', '17:00', 'Lembur Minggu');
                      if (!isBulkDays || editingScheduleId) {
                        handleFormDayChange('Minggu');
                      }
                    }}
                    title="Terapkan jam Lembur Minggu 07.30 - 17.00 WIB"
                    className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-[10px] font-bold hover:bg-amber-100 cursor-pointer shadow-2xs"
                  >
                    07.30 - 17.00 (Lembur Minggu)
                  </button>
                </div>
                <p className="text-[10px] text-sky-800/80">
                  Preset jam Apotek otomatis tersinkron dengan Profil Apotek:{' '}
                  <strong className="text-sky-950">{pharmacyOpHours.summary}</strong>
                </p>
              </div>

              {/* Field 4: Unit Layanan & Label Sesi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit Layanan / Ruangan *</label>
                  <select
                    required
                    value={formServiceUnit}
                    onChange={(e) => setFormServiceUnit(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:bg-white"
                  >
                    <option value="">-- Pilih Unit Layanan / Ruangan --</option>
                    <option value="Poli Umum">Poli Umum (Ruang Dokter)</option>
                    <option value="Konseling Farmasi">Konseling Farmasi & PIO</option>
                    <option value="Kasir & Front Office">Kasir & Front Office</option>
                    <option value="Laboratorium">Laboratorium</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Label Shift / Sesi</label>
                  <input
                    type="text"
                    placeholder="Contoh: Full Day (Fleksibel), Shift Pagi..."
                    value={formSessionLabel}
                    onChange={(e) => setFormSessionLabel(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:bg-white"
                  />
                </div>
              </div>

              {/* Field 5: Status & Kuota */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status Praktik *</label>
                  <select
                    required
                    value={formStatus}
                    onChange={(e) =>
                      setFormStatus(e.target.value as 'Aktif' | 'Cuti / Libur' | 'On-Call' | '')
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:bg-white"
                  >
                    <option value="">-- Pilih Status Praktik --</option>
                    <option value="Aktif">Aktif (Melayani Pasien)</option>
                    <option value="Cuti / Libur">Cuti / Sedang Libur</option>
                    <option value="On-Call">On-Call (Sesuai Perjanjian)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Estimasi Kuota Pasien / Hari</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={200}
                    placeholder="Contoh: 40"
                    value={formQuota}
                    onChange={(e) =>
                      setFormQuota(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:bg-white"
                  />
                </div>
              </div>

              {/* Field 6: Catatan Tambahan */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Tambahan (Tampil ke Pasien)</label>
                <textarea
                  rows={2}
                  placeholder="Misal: Istirahat Sholat Jumat 11.30-13.30, Khusus Konsultasi Terapi Kronis..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 outline-none focus:bg-white"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold shadow-md shadow-sky-600/30 transition cursor-pointer"
                >
                  {editingScheduleId ? 'Simpan Perubahan' : 'Tambahkan ke Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-rose-600">
              <RotateCcw className="w-5 h-5" />
              <h3 className="font-black text-sm text-slate-900">Konfirmasi Reset Jadwal</h3>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Kembalikan jadwal dokter & petugas apotek ke format default resmi Latisha Farma?
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetDefault();
                  setShowResetConfirm(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition"
              >
                Reset ke Default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase SQL Schema & Table Config Modal (APJ / Owner Only) */}
      {isOwnerAdmin && showSchemaModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Integrasi Supabase Jadwal Praktik & Shift</h3>
                  <p className="text-[11px] text-slate-400">Sinkronisasi Real-time Dua Arah</p>
                </div>
              </div>
              <button
                onClick={() => setShowSchemaModal(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {!isDemoSandbox && (
                <form onSubmit={handleSaveTableName} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nama Tabel Jadwal di Supabase
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="schedules"
                      value={scheduleTableInput}
                      onChange={(e) => setScheduleTableInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white font-mono focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSyncing}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Simpan & Uji Koneksi</span>
                  </button>
                </form>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-slate-600" />
                    <h4 className="font-bold text-slate-800 text-xs">Skema DDL SQL Tabel Jadwal (schedules)</h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySchema}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                  >
                    {copiedSchema ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Skrip SQL</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-slate-500">
                  Jalankan skrip SQL berikut di <strong>SQL Editor</strong> Dashboard Supabase Anda agar tabel <code>schedules</code> tersedia dan error 404 teratasi:
                </p>

                <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-56">
                  <pre>{SUPABASE_SCHEDULES_SQL_SCHEMA}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
