import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarCheck2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Code,
  Copy,
  Check,
  Search,
  Download,
  Printer,
  UserCheck,
  CalendarOff,
  Sparkles,
  LogIn,
  LogOut,
  Smartphone,
  Monitor,
  ShieldCheck,
  BarChart3,
  X,
  Info,
  MapPin
} from 'lucide-react';
import {
  DutySchedule,
  Staff,
  StaffAttendanceRecord,
  AttendanceStatus,
  SundayOvertimeType,
  normalizeStaffRole
} from '../types';
import {
  ATTENDANCE_UPDATED_EVENT,
  DEFAULT_ATTENDANCE_TABLE,
  SUPABASE_ATTENDANCE_SQL_SCHEMA,
  getAttendanceTableName,
  setAttendanceTableName,
  getTodayIsoLocal,
  getCurrentTimeHHMM,
  getScheduleDayFromIso,
  isSundayDate,
  formatIsoToIdDate,
  formatMinutesDuration,
  findMatchingShiftForStaffOnDate,
  evaluateAttendanceMetrics,
  loadLocalAttendanceRecords,
  upsertAttendanceRecord,
  removeAttendanceRecord,
  syncAllAttendanceWithSupabase,
  createQuickCheckInRecord,
  applyCheckOutOnRecord,
  verifyAttendanceLocationWithinRadius
} from '../utils/attendanceService';
import { useIsOwnerAdmin } from '../utils/roleAccess';

interface StaffAttendancePanelProps {
  mode: 'kehadiran' | 'laporan';
  staffList: Staff[];
  schedules: DutySchedule[];
  currentUserName?: string;
  currentStaffId?: string;
  currentBranchId?: string;
  isDemoSandbox?: boolean;
  onAuditLog?: (module: string, action: string) => void;
}

const getMonthRangeIso = (yearMonth: string): { from: string; to: string } => {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const m = Number(mStr) || new Date().getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${String(m).padStart(2, '0')}-01`,
    to: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  };
};

export const StaffAttendancePanel: React.FC<StaffAttendancePanelProps> = ({
  mode,
  staffList,
  schedules,
  currentUserName = 'APJ / Owner',
  currentStaffId,
  currentBranchId,
  isDemoSandbox = false,
  onAuditLog
}) => {
  const isOwnerAdmin = useIsOwnerAdmin();
  const todayIso = useMemo(() => getTodayIsoLocal(), []);
  const currentYearMonth = useMemo(() => todayIso.slice(0, 7), [todayIso]);

  const [records, setRecords] = useState<StaffAttendanceRecord[]>(() =>
    loadLocalAttendanceRecords()
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVerifyingLocation, setIsVerifyingLocation] = useState(false);
  const [needsTableSetup, setNeedsTableSetup] = useState(false);
  const [toast, setToast] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // SQL Modal (APJ / Owner Only)
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [attendanceTableInput, setAttendanceTableInput] = useState(() =>
    getAttendanceTableName()
  );

  // Quick Check-in / Check-out Staff Selector (defaults to logged-in staff)
  const activeStaffOptions = useMemo(
    () => staffList.filter((s) => s.status === 'Aktif'),
    [staffList]
  );

  const defaultSelectedStaffId = useMemo(() => {
    if (currentStaffId && activeStaffOptions.some((s) => s.id === currentStaffId)) {
      return currentStaffId;
    }
    const byName = activeStaffOptions.find(
      (s) => s.name.trim().toLowerCase() === currentUserName.trim().toLowerCase()
    );
    return byName?.id || activeStaffOptions[0]?.id || '';
  }, [currentStaffId, currentUserName, activeStaffOptions]);

  const [quickStaffId, setQuickStaffId] = useState<string>(defaultSelectedStaffId);

  useEffect(() => {
    if (!quickStaffId && defaultSelectedStaffId) {
      setQuickStaffId(defaultSelectedStaffId);
    }
  }, [quickStaffId, defaultSelectedStaffId]);

  // Filters for Attendance Log
  const [filterMonth, setFilterMonth] = useState<string>(currentYearMonth);
  const [filterStatus, setFilterStatus] = useState<string>('SEMUA');
  const [filterOvertimeType, setFilterOvertimeType] = useState<string>('SEMUA');
  const [filterStaffId, setFilterStaffId] = useState<string>('SEMUA');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filters for Report ('laporan') mode
  const initialRange = useMemo(() => getMonthRangeIso(currentYearMonth), [currentYearMonth]);
  const [reportDateFrom, setReportDateFrom] = useState<string>(initialRange.from);
  const [reportDateTo, setReportDateTo] = useState<string>(initialRange.to);
  const [reportRoleFilter, setReportRoleFilter] = useState<string>('SEMUA');
  const [reportIncludePending, setReportIncludePending] = useState<boolean>(false);

  // Add / Edit Attendance Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formStaffId, setFormStaffId] = useState<string>(defaultSelectedStaffId);
  const [formDate, setFormDate] = useState<string>(todayIso);
  const [formStatus, setFormStatus] = useState<AttendanceStatus>('Hadir');
  const [formCheckIn, setFormCheckIn] = useState<string>('08:00');
  const [formCheckOut, setFormCheckOut] = useState<string>('17:00');
  const [formOvertimeType, setFormOvertimeType] =
    useState<SundayOvertimeType>('Lembur Terencana');
  const [formLeaveReason, setFormLeaveReason] = useState<string>('Cuti Tahunan');
  const [formNotes, setFormNotes] = useState<string>('');

  const showNotice = useCallback(
    (type: 'success' | 'warning' | 'error', message: string) => {
      setToast({ type, message });
      window.setTimeout(() => {
        setToast((prev) => (prev?.message === message ? null : prev));
      }, 4500);
    },
    []
  );

  // Lazy initial Supabase sync only when this panel is actually opened
  const runSupabaseSync = useCallback(
    async (forceRefresh = false, showFeedback = false) => {
      setIsSyncing(true);
      try {
        const res = await syncAllAttendanceWithSupabase({ forceRefresh });
        setRecords(res.records);
        setNeedsTableSetup(Boolean(res.needsTableSetup));
        if (showFeedback) {
          if (res.success) {
            showNotice(
              'success',
              `Sinkronisasi Supabase berhasil (${res.records.length} catatan kehadiran).`
            );
          } else if (res.needsTableSetup) {
            showNotice(
              'warning',
              isOwnerAdmin
                ? `Tabel "${getAttendanceTableName()}" belum dibuat di Supabase. Buka Skema SQL untuk setup ringan.`
                : 'Berjalan aman menggunakan penyimpanan lokal.'
            );
          } else if (res.isDemo) {
            showNotice('warning', res.error || 'Mode Demo aktif: data tersimpan di sandbox lokal.');
          } else {
            showNotice('error', res.error || 'Gagal sinkronisasi kehadiran dengan Supabase.');
          }
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [isOwnerAdmin, showNotice]
  );

  useEffect(() => {
    // Reload local records whenever Desktop/Mobile updates attendance
    const onUpdated = () => setRecords(loadLocalAttendanceRecords());
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, onUpdated);
    if (!isDemoSandbox) {
      runSupabaseSync(false, false);
    }
    return () => window.removeEventListener(ATTENDANCE_UPDATED_EVENT, onUpdated);
  }, [isDemoSandbox, runSupabaseSync]);

  // Quick Check-in / Check-out context
  const quickStaff = useMemo(
    () => activeStaffOptions.find((s) => s.id === quickStaffId) || activeStaffOptions[0] || null,
    [activeStaffOptions, quickStaffId]
  );

  const quickTodayShift = useMemo(
    () => (quickStaff ? findMatchingShiftForStaffOnDate(quickStaff.id, todayIso, schedules) : null),
    [quickStaff, todayIso, schedules]
  );

  const quickTodayRecord = useMemo(
    () =>
      quickStaff
        ? records.find((r) => r.staffId === quickStaff.id && r.date === todayIso) || null
        : null,
    [records, quickStaff, todayIso]
  );

  const isTodaySunday = useMemo(() => isSundayDate(todayIso), [todayIso]);

  const handleQuickCheckIn = async () => {
    if (!quickStaff || isVerifyingLocation) return;
    if (quickTodayRecord) {
      showNotice(
        'warning',
        `${quickStaff.name} sudah tercatat ${quickTodayRecord.status} pada hari ini (${formatIsoToIdDate(todayIso)}).`
      );
      return;
    }

    setIsVerifyingLocation(true);
    try {
      const locRes = await verifyAttendanceLocationWithinRadius({
        branchId: currentBranchId || quickStaff.branchId
      });
      if (!locRes.allowed) {
        showNotice(
          'error',
          locRes.reason ||
            'Check-In ditolak: Lokasi berada di luar radius maksimal 50 meter dari lokasi Apotek.'
        );
        onAuditLog?.(
          'Kehadiran Pegawai',
          `Check-In ditolak (GPS): ${quickStaff.name} — ${locRes.reason || 'Di luar radius 50 m'}`
        );
        return;
      }

      const gpsNote =
        typeof locRes.distanceMeters === 'number'
          ? `GPS Terverifikasi (${locRes.distanceMeters} m dari ${locRes.targetSourceLabel || 'Apotek'})`
          : 'GPS Terverifikasi';

      const created = createQuickCheckInRecord({
        staff: quickStaff,
        date: todayIso,
        checkInTime: getCurrentTimeHHMM(),
        schedules,
        sourceMode: 'desktop',
        isOwnerAdmin,
        notes: gpsNote
      });
      const next = upsertAttendanceRecord(created);
      setRecords(next);
      onAuditLog?.(
        'Kehadiran Pegawai',
        `Check-In ${quickStaff.name} (${created.date} ${created.checkInTime} WIB • ${gpsNote} • Status: ${created.status}${created.overtimeType ? ` - ${created.overtimeType}` : ''})`
      );
      showNotice(
        'success',
        created.status === 'Lembur'
          ? `Check-In hari Minggu tercatat sebagai ${created.overtimeType} pukul ${created.checkInTime} WIB (${gpsNote}).`
          : `Check-In ${quickStaff.name} berhasil pukul ${created.checkInTime} WIB (${gpsNote}).`
      );
    } finally {
      setIsVerifyingLocation(false);
    }
  };

  const handleQuickCheckOut = (targetRecord?: StaffAttendanceRecord) => {
    const rec = targetRecord || quickTodayRecord;
    if (!rec) return;
    if (rec.status === 'Cuti') return;
    const updated = applyCheckOutOnRecord({
      record: rec,
      checkOutTime: getCurrentTimeHHMM(),
      isOwnerAdmin,
      approverName: currentUserName
    });
    const next = upsertAttendanceRecord(updated);
    setRecords(next);
    onAuditLog?.(
      'Kehadiran Pegawai',
      `Check-Out ${updated.staffName} (${updated.date} ${updated.checkOutTime} WIB • Durasi ${formatMinutesDuration(updated.workDurationMinutes)}${updated.overtimeMinutes > 0 ? ` • Lembur Minggu ${formatMinutesDuration(updated.overtimeMinutes)} (${updated.overtimeType})` : ''})`
    );
    if (updated.isSunday && updated.overtimeMinutes > 0) {
      showNotice(
        'success',
        `Check-Out berhasil! Lembur Hari Minggu terdeteksi otomatis: ${formatMinutesDuration(updated.overtimeMinutes)} (${updated.overtimeType}).`
      );
    } else {
      showNotice(
        'success',
        `Check-Out ${updated.staffName} berhasil pukul ${updated.checkOutTime} WIB (Total kerja: ${formatMinutesDuration(updated.workDurationMinutes)}).`
      );
    }
  };

  // Approval actions (APJ / Owner only)
  const handleApprovalAction = (
    rec: StaffAttendanceRecord,
    decision: 'Disetujui' | 'Ditolak'
  ) => {
    if (!isOwnerAdmin) return;
    const nowIso = new Date().toISOString();
    const updated: StaffAttendanceRecord = {
      ...rec,
      approvalStatus: decision,
      approvedBy: currentUserName,
      approvedAt: nowIso,
      updatedAt: nowIso
    };
    const next = upsertAttendanceRecord(updated);
    setRecords(next);
    onAuditLog?.(
      'Persetujuan Absensi',
      `${decision} pengajuan ${rec.status}${rec.overtimeType ? ` (${rec.overtimeType})` : ''} untuk ${rec.staffName} tanggal ${rec.date} oleh ${currentUserName}.`
    );
    showNotice(
      decision === 'Disetujui' ? 'success' : 'warning',
      `Pengajuan ${rec.status} untuk ${rec.staffName} (${formatIsoToIdDate(rec.date)}) telah ${decision.toLowerCase()}.`
    );
  };

  // Modal Open Helpers
  const openNewFormModal = (presetStatus: AttendanceStatus = 'Hadir') => {
    const initialDate = todayIso;
    const sunday = isSundayDate(initialDate);
    const safeStatus: AttendanceStatus =
      presetStatus === 'Lembur' && !sunday ? 'Hadir' : presetStatus;
    const targetStaffId = quickStaffId || defaultSelectedStaffId;
    const matchedShift = findMatchingShiftForStaffOnDate(targetStaffId, initialDate, schedules);

    setEditingId(null);
    setFormStaffId(targetStaffId);
    setFormDate(initialDate);
    setFormStatus(safeStatus);
    setFormCheckIn(matchedShift?.startTime || '08:00');
    setFormCheckOut(matchedShift?.endTime || '17:00');
    setFormOvertimeType(matchedShift ? 'Lembur Terencana' : 'Lembur di Luar Jadwal');
    setFormLeaveReason('Cuti Tahunan');
    setFormNotes('');
    setIsFormOpen(true);
  };

  const openEditFormModal = (rec: StaffAttendanceRecord) => {
    setEditingId(rec.id);
    setFormStaffId(rec.staffId);
    setFormDate(rec.date);
    setFormStatus(rec.status);
    setFormCheckIn(rec.checkInTime || rec.scheduledStartTime || '08:00');
    setFormCheckOut(rec.checkOutTime || rec.scheduledEndTime || '17:00');
    setFormOvertimeType(rec.overtimeType || 'Lembur Terencana');
    setFormLeaveReason(rec.leaveReason || 'Cuti Tahunan');
    setFormNotes(rec.notes || '');
    setIsFormOpen(true);
  };

  // Live preview of form date/shift/Sunday overtime calculation
  const formDateIsSunday = useMemo(() => isSundayDate(formDate), [formDate]);
  const formDayName = useMemo(() => getScheduleDayFromIso(formDate), [formDate]);
  const formMatchedShift = useMemo(
    () => findMatchingShiftForStaffOnDate(formStaffId, formDate, schedules),
    [formStaffId, formDate, schedules]
  );

  // If user switches formDate to a weekday while formStatus is 'Lembur', reset status to 'Hadir'
  useEffect(() => {
    if (!formDateIsSunday && formStatus === 'Lembur') {
      setFormStatus('Hadir');
    }
  }, [formDateIsSunday, formStatus]);

  const formLiveMetrics = useMemo(
    () =>
      evaluateAttendanceMetrics({
        date: formDate,
        requestedStatus: formStatus,
        checkInTime: formStatus === 'Cuti' ? undefined : formCheckIn,
        checkOutTime: formStatus === 'Cuti' ? undefined : formCheckOut,
        scheduledStartTime: formMatchedShift?.startTime,
        scheduledEndTime: formMatchedShift?.endTime,
        hasScheduledShift: Boolean(formMatchedShift),
        requestedOvertimeType: formDateIsSunday ? formOvertimeType : undefined
      }),
    [
      formDate,
      formStatus,
      formCheckIn,
      formCheckOut,
      formMatchedShift,
      formDateIsSunday,
      formOvertimeType
    ]
  );

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const stf = staffList.find((s) => s.id === formStaffId);
    if (!stf || !formDate) return;

    if (formStatus === 'Lembur' && !isSundayDate(formDate)) {
      showNotice(
        'error',
        'Status Lembur hanya berlaku khusus pada hari Minggu. Pada hari Senin–Sabtu, sistem mencatat sebagai Hadir.'
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const existing = editingId ? records.find((r) => r.id === editingId) : null;
    const requiresApproval =
      (formLiveMetrics.status === 'Cuti' || formLiveMetrics.status === 'Lembur') &&
      !isOwnerAdmin;

    const approvalStatus = existing
      ? isOwnerAdmin
        ? existing.approvalStatus
        : requiresApproval
        ? 'Menunggu Persetujuan'
        : 'Disetujui'
      : requiresApproval
      ? 'Menunggu Persetujuan'
      : 'Disetujui';

    const payload: StaffAttendanceRecord = {
      id:
        editingId ||
        `ATT-${formDate.replace(/-/g, '')}-${stf.id}-${Date.now().toString().slice(-4)}`,
      staffId: stf.id,
      staffName: stf.name,
      staffRole: normalizeStaffRole(stf.role, 'Apoteker'),
      date: formDate,
      dayName: formLiveMetrics.dayName,
      status: formLiveMetrics.status,
      scheduleId: formMatchedShift?.id,
      scheduledStartTime: formMatchedShift?.startTime,
      scheduledEndTime: formMatchedShift?.endTime,
      serviceUnit: formMatchedShift?.serviceUnit,
      checkInTime: formLiveMetrics.status === 'Cuti' ? undefined : formCheckIn || undefined,
      checkOutTime: formLiveMetrics.status === 'Cuti' ? undefined : formCheckOut || undefined,
      workDurationMinutes: formLiveMetrics.workDurationMinutes,
      isSunday: formLiveMetrics.isSunday,
      overtimeMinutes: formLiveMetrics.overtimeMinutes,
      overtimeType: formLiveMetrics.overtimeType,
      overtimeSource: formLiveMetrics.overtimeSource,
      leaveReason: formLiveMetrics.status === 'Cuti' ? formLeaveReason : undefined,
      approvalStatus,
      approvedBy:
        approvalStatus === 'Disetujui'
          ? existing?.approvedBy || currentUserName
          : undefined,
      approvedAt:
        approvalStatus === 'Disetujui' ? existing?.approvedAt || nowIso : undefined,
      sourceMode: existing?.sourceMode || 'desktop',
      notes: formNotes.trim(),
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso
    };

    const next = upsertAttendanceRecord(payload);
    setRecords(next);
    setIsFormOpen(false);
    onAuditLog?.(
      'Kehadiran Pegawai',
      `${editingId ? 'Ubah' : 'Catat'} absensi ${stf.name} (${formDate} • ${payload.status}${payload.overtimeType ? ` - ${payload.overtimeType} ${formatMinutesDuration(payload.overtimeMinutes)}` : ''})`
    );
    showNotice(
      'success',
      `Data ${payload.status} untuk ${stf.name} (${formatIsoToIdDate(formDate)}) berhasil disimpan.`
    );
  };

  const handleDeleteRecord = (rec: StaffAttendanceRecord) => {
    if (
      !window.confirm(
        `Hapus catatan ${rec.status} untuk ${rec.staffName} pada tanggal ${formatIsoToIdDate(rec.date)}?`
      )
    ) {
      return;
    }
    const next = removeAttendanceRecord(rec.id);
    setRecords(next);
    onAuditLog?.(
      'Kehadiran Pegawai',
      `Hapus catatan absensi ${rec.staffName} (${rec.date} • ${rec.status})`
    );
  };

  // Pending Approvals Queue
  const pendingApprovalRecords = useMemo(
    () => records.filter((r) => r.approvalStatus === 'Menunggu Persetujuan'),
    [records]
  );

  // Filtered Daily Attendance Log (for 'kehadiran' mode)
  const filteredAttendanceLog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((rec) => {
      if (filterMonth && !rec.date.startsWith(filterMonth)) return false;
      if (filterStatus !== 'SEMUA' && rec.status !== filterStatus) return false;
      if (filterOvertimeType !== 'SEMUA' && rec.overtimeType !== filterOvertimeType) return false;
      if (filterStaffId !== 'SEMUA' && rec.staffId !== filterStaffId) return false;
      if (q) {
        const hay = `${rec.staffName} ${rec.staffRole} ${rec.dayName} ${rec.status} ${rec.overtimeType || ''} ${rec.leaveReason || ''} ${rec.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, filterMonth, filterStatus, filterOvertimeType, filterStaffId, searchQuery]);

  // Quick KPI stats for 'kehadiran' mode (active month)
  const monthKpi = useMemo(() => {
    const inMonth = records.filter(
      (r) => (!filterMonth || r.date.startsWith(filterMonth)) && r.approvalStatus !== 'Ditolak'
    );
    let hadir = 0;
    let cuti = 0;
    let lemburPlanned = 0;
    let lemburUnscheduled = 0;
    let lemburMinutes = 0;
    for (const r of inMonth) {
      if (r.status === 'Hadir') hadir++;
      else if (r.status === 'Cuti') cuti++;
      else if (r.status === 'Lembur' && r.isSunday) {
        if (r.overtimeType === 'Lembur Terencana') lemburPlanned++;
        else lemburUnscheduled++;
        lemburMinutes += r.overtimeMinutes || 0;
      }
    }
    return {
      hadir,
      cuti,
      lemburTotal: lemburPlanned + lemburUnscheduled,
      lemburPlanned,
      lemburUnscheduled,
      lemburMinutes
    };
  }, [records, filterMonth]);

  // ==================== REPORT ('laporan') COMPUTATION ====================
  const reportPeriodRecords = useMemo(() => {
    return records.filter((r) => {
      if (reportDateFrom && r.date < reportDateFrom) return false;
      if (reportDateTo && r.date > reportDateTo) return false;
      if (r.approvalStatus === 'Ditolak') return false;
      if (!reportIncludePending && r.approvalStatus === 'Menunggu Persetujuan') return false;
      return true;
    });
  }, [records, reportDateFrom, reportDateTo, reportIncludePending]);

  interface StaffReportRow {
    staffId: string;
    staffName: string;
    staffRole: string;
    hadirCount: number;
    cutiCount: number;
    lemburTerencanaCount: number;
    lemburTerencanaMinutes: number;
    lemburLuarJadwalCount: number;
    lemburLuarJadwalMinutes: number;
    totalLemburCount: number;
    totalLemburMinutes: number;
    totalWorkMinutes: number;
    pendingCount: number;
  }

  const staffReportRows = useMemo<StaffReportRow[]>(() => {
    const map = new Map<string, StaffReportRow>();

    // Seed with all active staff (matching role filter)
    for (const st of staffList) {
      if (reportRoleFilter !== 'SEMUA' && st.role !== reportRoleFilter) continue;
      map.set(st.id, {
        staffId: st.id,
        staffName: st.name,
        staffRole: st.role,
        hadirCount: 0,
        cutiCount: 0,
        lemburTerencanaCount: 0,
        lemburTerencanaMinutes: 0,
        lemburLuarJadwalCount: 0,
        lemburLuarJadwalMinutes: 0,
        totalLemburCount: 0,
        totalLemburMinutes: 0,
        totalWorkMinutes: 0,
        pendingCount: 0
      });
    }

    // Count pending per staff in period regardless of toggle for transparency
    for (const rec of records) {
      if (reportDateFrom && rec.date < reportDateFrom) continue;
      if (reportDateTo && rec.date > reportDateTo) continue;
      if (rec.approvalStatus === 'Menunggu Persetujuan') {
        const row = map.get(rec.staffId);
        if (row) row.pendingCount++;
      }
    }

    // Accumulate approved (or included) attendance metrics
    for (const rec of reportPeriodRecords) {
      if (reportRoleFilter !== 'SEMUA' && rec.staffRole !== reportRoleFilter) continue;
      let row = map.get(rec.staffId);
      if (!row) {
        row = {
          staffId: rec.staffId,
          staffName: rec.staffName,
          staffRole: rec.staffRole,
          hadirCount: 0,
          cutiCount: 0,
          lemburTerencanaCount: 0,
          lemburTerencanaMinutes: 0,
          lemburLuarJadwalCount: 0,
          lemburLuarJadwalMinutes: 0,
          totalLemburCount: 0,
          totalLemburMinutes: 0,
          totalWorkMinutes: 0,
          pendingCount: 0
        };
        map.set(rec.staffId, row);
      }

      row.totalWorkMinutes += rec.workDurationMinutes || 0;
      if (rec.status === 'Hadir') {
        row.hadirCount++;
      } else if (rec.status === 'Cuti') {
        row.cutiCount++;
      } else if (rec.status === 'Lembur' && rec.isSunday) {
        // Sunday overtime session counts as present + overtime
        row.hadirCount++;
        row.totalLemburCount++;
        row.totalLemburMinutes += rec.overtimeMinutes || 0;
        if (rec.overtimeType === 'Lembur Terencana') {
          row.lemburTerencanaCount++;
          row.lemburTerencanaMinutes += rec.overtimeMinutes || 0;
        } else {
          row.lemburLuarJadwalCount++;
          row.lemburLuarJadwalMinutes += rec.overtimeMinutes || 0;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.staffId.localeCompare(b.staffId));
  }, [staffList, reportPeriodRecords, records, reportDateFrom, reportDateTo, reportRoleFilter]);

  const reportTotals = useMemo(() => {
    return staffReportRows.reduce(
      (acc, r) => ({
        hadir: acc.hadir + r.hadirCount,
        cuti: acc.cuti + r.cutiCount,
        lemburTerencana: acc.lemburTerencana + r.lemburTerencanaCount,
        lemburLuarJadwal: acc.lemburLuarJadwal + r.lemburLuarJadwalCount,
        totalLembur: acc.totalLembur + r.totalLemburCount,
        totalLemburMinutes: acc.totalLemburMinutes + r.totalLemburMinutes,
        totalWorkMinutes: acc.totalWorkMinutes + r.totalWorkMinutes,
        pending: acc.pending + r.pendingCount
      }),
      {
        hadir: 0,
        cuti: 0,
        lemburTerencana: 0,
        lemburLuarJadwal: 0,
        totalLembur: 0,
        totalLemburMinutes: 0,
        totalWorkMinutes: 0,
        pending: 0
      }
    );
  }, [staffReportRows]);

  const handleApplyReportPreset = (preset: 'this-month' | 'last-month' | 'last-7') => {
    const now = new Date();
    if (preset === 'this-month') {
      const range = getMonthRangeIso(getTodayIsoLocal(now).slice(0, 7));
      setReportDateFrom(range.from);
      setReportDateTo(range.to);
    } else if (preset === 'last-month') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const range = getMonthRangeIso(getTodayIsoLocal(prev).slice(0, 7));
      setReportDateFrom(range.from);
      setReportDateTo(range.to);
    } else {
      const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      setReportDateFrom(getTodayIsoLocal(fromDate));
      setReportDateTo(getTodayIsoLocal(now));
    }
  };

  const handleExportReportCsv = () => {
    const headers = [
      'ID Pegawai',
      'Nama Pegawai',
      'Peran',
      'Periode Dari',
      'Periode Sampai',
      'Jumlah Hadir (Hari)',
      'Jumlah Cuti (Hari)',
      'Lembur Minggu Terencana (Sesi)',
      'Durasi Lembur Terencana (Menit)',
      'Lembur Minggu di Luar Jadwal (Sesi)',
      'Durasi Lembur di Luar Jadwal (Menit)',
      'Total Lembur Minggu (Sesi)',
      'Total Durasi Lembur (Menit)',
      'Total Jam Kerja (Menit)'
    ];

    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
      headers.map(escapeCsv).join(','),
      ...staffReportRows.map((r) =>
        [
          r.staffId,
          r.staffName,
          r.staffRole,
          reportDateFrom,
          reportDateTo,
          r.hadirCount,
          r.cutiCount,
          r.lemburTerencanaCount,
          r.lemburTerencanaMinutes,
          r.lemburLuarJadwalCount,
          r.lemburLuarJadwalMinutes,
          r.totalLemburCount,
          r.totalLemburMinutes,
          r.totalWorkMinutes
        ]
          .map(escapeCsv)
          .join(',')
      )
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_Absensi_LatishaFarma_${reportDateFrom}_sd_${reportDateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Feedback Toast */}
      {toast && (
        <div
          className={`rounded-2xl px-4 py-3 border text-xs font-semibold flex items-center justify-between gap-3 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : toast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Missing Table Notice (APJ / Owner Only) */}
      {isOwnerAdmin && needsTableSetup && !isDemoSandbox && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Tabel <strong>{attendanceTableInput || DEFAULT_ATTENDANCE_TABLE}</strong> belum dibuat di Supabase — kehadiran tetap berjalan lancar & tersimpan lokal.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSqlModal(true)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-[11px] transition cursor-pointer"
          >
            Lihat Skema SQL Kehadiran
          </button>
        </div>
      )}

      {/* ==================== MODE 1: KEHADIRAN, CUTI & LEMBUR MINGGU ==================== */}
      {mode === 'kehadiran' && (
        <>
          {/* Policy & Quick Check-In/Out Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>Presensi Harian, Cuti &amp; Lembur Khusus Hari Minggu</span>
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      isTodaySunday
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {isTodaySunday
                      ? 'Hari Ini Minggu • Aturan Lembur Aktif'
                      : `Hari Ini ${getScheduleDayFromIso(todayIso)} • Lembur Nonaktif (Khusus Minggu)`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Lembur hanya berlaku pada hari <strong>Minggu</strong> (deteksi otomatis saat check-out melewati jam selesai shift, atau pengajuan sesi <strong>Lembur Terencana</strong> / <strong>Lembur di Luar Jadwal</strong>). Terintegrasi penuh dengan Desktop &amp; Mode Mobile Lapangan.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => runSupabaseSync(true, true)}
                  disabled={isSyncing}
                  className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Sync...' : 'Sync Absensi'}</span>
                </button>
                {isOwnerAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowSqlModal(true)}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Code className="w-3.5 h-3.5 text-sky-600" />
                    <span>Skema SQL Absensi</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openNewFormModal('Hadir')}
                  className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Catat / Ajukan</span>
                </button>
              </div>
            </div>

            {/* Live Quick Check-In / Check-Out Bar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center bg-slate-50/80 border border-slate-200 rounded-2xl p-3.5">
              <div className="lg:col-span-4 space-y-1">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Petugas Check-In / Check-Out Hari Ini ({formatIsoToIdDate(todayIso)})
                </label>
                <select
                  value={quickStaffId}
                  onChange={(e) => setQuickStaffId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {activeStaffOptions.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} — [{st.role}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Jadwal Shift Terdaftar Hari Ini
                </span>
                {quickTodayShift ? (
                  <div className="font-bold text-slate-800 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-sky-700 font-mono">
                      {quickTodayShift.startTime}–{quickTodayShift.endTime} WIB
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>{quickTodayShift.serviceUnit}</span>
                  </div>
                ) : (
                  <div className="text-slate-500 font-semibold mt-0.5">
                    Tidak ada shift terjadwal hari ini
                    {isTodaySunday && (
                      <span className="text-amber-700 font-bold"> (Check-in Minggu = Lembur di Luar Jadwal)</span>
                    )}
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 flex flex-wrap items-center justify-end gap-2">
                {!quickTodayRecord ? (
                  <>
                    <button
                      type="button"
                      onClick={handleQuickCheckIn}
                      disabled={isVerifyingLocation}
                      title="Validasi titik lokasi GPS maksimal radius 50 meter dari lokasi Apotek"
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      {isVerifyingLocation ? (
                        <MapPin className="w-4 h-4 animate-pulse" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                      <span>
                        {isVerifyingLocation ? 'Memverifikasi GPS...' : 'Check-In Sekarang (GPS ≤ 50m)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openNewFormModal('Cuti')}
                      className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <CalendarOff className="w-3.5 h-3.5" />
                      <span>Cuti</span>
                    </button>
                  </>
                ) : quickTodayRecord.status === 'Cuti' ? (
                  <span className="px-3.5 py-2 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold">
                    Status Hari Ini: Cuti ({quickTodayRecord.leaveReason || 'Izin'})
                  </span>
                ) : !quickTodayRecord.checkOutTime ? (
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl">
                      Masuk: {quickTodayRecord.checkInTime} WIB
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickCheckOut(quickTodayRecord)}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Check-Out Sekarang</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-right text-[11px]">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        Selesai: {quickTodayRecord.checkInTime}–{quickTodayRecord.checkOutTime} WIB
                        {quickTodayRecord.overtimeMinutes > 0 &&
                          ` (Lembur ${formatMinutesDuration(quickTodayRecord.overtimeMinutes)})`}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* KPI Summary Cards (Active Month) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                Total Hadir ({filterMonth})
              </span>
              <div className="text-xl font-black text-emerald-700 mt-1">{monthKpi.hadir}</div>
              <span className="text-[10px] text-slate-500">Sesi kehadiran normal</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                Total Cuti ({filterMonth})
              </span>
              <div className="text-xl font-black text-amber-600 mt-1">{monthKpi.cuti}</div>
              <span className="text-[10px] text-slate-500">Hari cuti / izin tercatat</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                Lembur Khusus Minggu
              </span>
              <div className="text-xl font-black text-indigo-700 mt-1">
                {monthKpi.lemburTotal} sesi
              </div>
              <span className="text-[10px] text-slate-500">
                Terencana: <strong>{monthKpi.lemburPlanned}</strong> • Di Luar Jadwal:{' '}
                <strong>{monthKpi.lemburUnscheduled}</strong> ({formatMinutesDuration(monthKpi.lemburMinutes)})
              </span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                Persetujuan APJ / Owner
              </span>
              <div className="text-xl font-black text-rose-600 mt-1">
                {pendingApprovalRecords.length}
              </div>
              <span className="text-[10px] text-slate-500">Pengajuan menunggu verifikasi</span>
            </div>
          </div>

          {/* Pending Approvals Queue (APJ / Owner Approval Box) */}
          {pendingApprovalRecords.length > 0 && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                  <span>
                    Antrean Persetujuan Cuti &amp; Lembur Minggu ({pendingApprovalRecords.length})
                  </span>
                </h4>
                {!isOwnerAdmin && (
                  <span className="text-[10px] font-bold text-amber-800 bg-white px-2.5 py-1 rounded-lg border border-amber-200">
                    Hanya APJ / Owner yang dapat menyetujui
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {pendingApprovalRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-white border border-amber-200/80 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="text-slate-900">{rec.staffName}</strong>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                          {rec.staffRole}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                            rec.status === 'Lembur'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {rec.status}
                          {rec.overtimeType ? ` • ${rec.overtimeType}` : ''}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {rec.dayName}, {formatIsoToIdDate(rec.date)}
                        {rec.status === 'Lembur'
                          ? ` • ${rec.checkInTime || '-'}–${rec.checkOutTime || '-'} WIB (Lembur: ${formatMinutesDuration(rec.overtimeMinutes)})`
                          : ` • Alasan: ${rec.leaveReason || '-'}`}
                        {rec.notes ? ` • Catatan: ${rec.notes}` : ''}
                      </div>
                    </div>

                    {isOwnerAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleApprovalAction(rec, 'Disetujui')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Setujui</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprovalAction(rec, 'Ditolak')}
                          className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Tolak</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter Bar for Daily Attendance Log */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">Bulan:</span>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="Hadir">Hadir</option>
              <option value="Cuti">Cuti</option>
              <option value="Lembur">Lembur (Minggu)</option>
            </select>

            <select
              value={filterOvertimeType}
              onChange={(e) => setFilterOvertimeType(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
            >
              <option value="SEMUA">Semua Kategori Lembur</option>
              <option value="Lembur Terencana">Lembur Terencana</option>
              <option value="Lembur di Luar Jadwal">Lembur di Luar Jadwal</option>
            </select>

            <select
              value={filterStaffId}
              onChange={(e) => setFilterStaffId(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
            >
              <option value="SEMUA">Semua Pegawai</option>
              {staffList.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>

            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, catatan, alasan cuti..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Daily Attendance Log Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-3">Tanggal &amp; Hari</th>
                    <th className="p-3">Pegawai &amp; Peran</th>
                    <th className="p-3">Jadwal Shift</th>
                    <th className="p-3">Check-In / Out</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Lembur Hari Minggu</th>
                    <th className="p-3">Persetujuan APJ / Owner</th>
                    <th className="p-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAttendanceLog.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-400">
                        Belum ada catatan kehadiran pada periode filter ini. Gunakan tombol{' '}
                        <strong className="text-slate-600">Check-In Sekarang</strong> atau{' '}
                        <strong className="text-slate-600">Catat / Ajukan</strong> untuk mulai mencatat.
                      </td>
                    </tr>
                  ) : (
                    filteredAttendanceLog.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 whitespace-nowrap">
                          <div className="font-bold text-slate-800">{formatIsoToIdDate(rec.date)}</div>
                          <span
                            className={`text-[10px] font-extrabold ${
                              rec.isSunday ? 'text-indigo-700' : 'text-slate-500'
                            }`}
                          >
                            {rec.dayName}
                            {rec.isSunday ? ' (Minggu)' : ''}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{rec.staffName}</div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                            <span>{rec.staffRole}</span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-0.5">
                              {rec.sourceMode === 'mobile' ? (
                                <>
                                  <Smartphone className="w-3 h-3 text-emerald-600" /> Mobile
                                </>
                              ) : (
                                <>
                                  <Monitor className="w-3 h-3 text-slate-400" /> Desktop
                                </>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap text-[11px]">
                          {rec.scheduledStartTime && rec.scheduledEndTime ? (
                            <div>
                              <span className="font-mono font-bold text-sky-700">
                                {rec.scheduledStartTime}–{rec.scheduledEndTime}
                              </span>
                              <div className="text-[10px] text-slate-500">{rec.serviceUnit || '-'}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Di luar jadwal shift</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {rec.status === 'Cuti' ? (
                            <span className="text-[11px] text-amber-700 font-semibold">
                              {rec.leaveReason || 'Cuti'}
                            </span>
                          ) : (
                            <div>
                              <span className="font-mono font-bold text-slate-800">
                                {rec.checkInTime || '--:--'} → {rec.checkOutTime || 'Aktif'}
                              </span>
                              {rec.workDurationMinutes > 0 && (
                                <div className="text-[10px] text-slate-500">
                                  Kerja: {formatMinutesDuration(rec.workDurationMinutes)}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              rec.status === 'Hadir'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : rec.status === 'Cuti'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-3">
                          {rec.isSunday && rec.status === 'Lembur' ? (
                            <div className="space-y-0.5">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                  rec.overtimeType === 'Lembur Terencana'
                                    ? 'bg-sky-100 text-sky-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {rec.overtimeType || 'Lembur di Luar Jadwal'}
                              </span>
                              <div className="text-[11px] font-bold text-indigo-700">
                                {formatMinutesDuration(rec.overtimeMinutes)}
                                {rec.overtimeSource === 'auto-checkout' && (
                                  <span className="text-[9px] text-slate-400 font-normal ml-1">
                                    (Otomatis)
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              rec.approvalStatus === 'Disetujui'
                                ? 'bg-emerald-50 text-emerald-700'
                                : rec.approvalStatus === 'Ditolak'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {rec.approvalStatus}
                          </span>
                          {rec.approvedBy && rec.approvalStatus !== 'Menunggu Persetujuan' && (
                            <div className="text-[9px] text-slate-400 mt-0.5">{rec.approvedBy}</div>
                          )}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            {rec.status !== 'Cuti' && !rec.checkOutTime && (
                              <button
                                type="button"
                                onClick={() => handleQuickCheckOut(rec)}
                                className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] cursor-pointer"
                                title="Check-Out Sekarang"
                              >
                                Check-Out
                              </button>
                            )}
                            {isOwnerAdmin && rec.approvalStatus === 'Menunggu Persetujuan' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApprovalAction(rec, 'Disetujui')}
                                  className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 cursor-pointer"
                                  title="Setujui"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApprovalAction(rec, 'Ditolak')}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                                  title="Tolak"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditFormModal(rec)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 cursor-pointer"
                              title="Edit Catatan"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(rec)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Hapus Catatan"
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
        </>
      )}

      {/* ==================== MODE 2: LAPORAN ABSENSI (REKAP HADIR, CUTI, LEMBUR) ==================== */}
      {mode === 'laporan' && (
        <>
          {/* Report Header & Period Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-sky-600" />
                  <span>Laporan Rekap Absensi Pegawai &amp; Petugas Apotek</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Ringkasan jumlah <strong>Kehadiran (Hadir)</strong>, <strong>Cuti</strong>, dan{' '}
                  <strong>Lembur Khusus Hari Minggu</strong> (Terencana &amp; di Luar Jadwal) per pegawai untuk kebutuhan evaluasi &amp; payroll.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => runSupabaseSync(true, true)}
                  disabled={isSyncing}
                  className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sync</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportReportCsv}
                  className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh CSV (Excel)</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">Periode:</span>
                <input
                  type="date"
                  value={reportDateFrom}
                  onChange={(e) => setReportDateFrom(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                />
                <span className="text-slate-400">s/d</span>
                <input
                  type="date"
                  value={reportDateTo}
                  onChange={(e) => setReportDateTo(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                />
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleApplyReportPreset('this-month')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                >
                  Bulan Ini
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyReportPreset('last-month')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                >
                  Bulan Lalu
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyReportPreset('last-7')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                >
                  7 Hari
                </button>
              </div>

              <select
                value={reportRoleFilter}
                onChange={(e) => setReportRoleFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
              >
                <option value="SEMUA">Semua Peran</option>
                <option value="APJ / Owner">APJ / Owner</option>
                <option value="Dokter">Dokter</option>
                <option value="Apoteker">Apoteker</option>
                <option value="Perawat / Bidan">Perawat / Bidan</option>
                <option value="Kasir & Front Office">Kasir &amp; Front Office</option>
              </select>

              <label className="inline-flex items-center gap-1.5 ml-auto text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reportIncludePending}
                  onChange={(e) => setReportIncludePending(e.target.checked)}
                  className="w-3.5 h-3.5 accent-sky-600 rounded"
                />
                <span>Sertakan yang Menunggu Persetujuan</span>
              </label>
            </div>
          </div>

          {/* Report KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-emerald-700 uppercase block">
                Total Kehadiran (Hadir)
              </span>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {reportTotals.hadir} <span className="text-xs font-bold">hari</span>
              </div>
              <span className="text-[10px] text-slate-500">
                Total kerja: {formatMinutesDuration(reportTotals.totalWorkMinutes)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-amber-700 uppercase block">
                Total Cuti
              </span>
              <div className="text-2xl font-black text-amber-600 mt-1">
                {reportTotals.cuti} <span className="text-xs font-bold">hari</span>
              </div>
              <span className="text-[10px] text-slate-500">Cuti / izin disetujui di periode ini</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-indigo-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-indigo-700 uppercase block">
                Total Lembur (Khusus Minggu)
              </span>
              <div className="text-2xl font-black text-indigo-700 mt-1">
                {reportTotals.totalLembur} <span className="text-xs font-bold">sesi</span>
              </div>
              <span className="text-[10px] text-slate-500">
                Durasi: <strong>{formatMinutesDuration(reportTotals.totalLemburMinutes)}</strong>
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">
                Rincian Kategori Lembur Minggu
              </span>
              <div className="mt-1.5 space-y-1 text-xs font-bold">
                <div className="flex items-center justify-between text-sky-700">
                  <span>Lembur Terencana:</span>
                  <span>{reportTotals.lemburTerencana} sesi</span>
                </div>
                <div className="flex items-center justify-between text-purple-700">
                  <span>Lembur di Luar Jadwal:</span>
                  <span>{reportTotals.lemburLuarJadwal} sesi</span>
                </div>
              </div>
            </div>
          </div>

          {/* Per-Staff Attendance Summary Report Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-black text-slate-800">
                Rekap Jumlah Kehadiran, Cuti &amp; Lembur per Pegawai ({formatIsoToIdDate(reportDateFrom)} – {formatIsoToIdDate(reportDateTo)})
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                {staffReportRows.length} Pegawai
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-3">Pegawai &amp; Peran</th>
                    <th className="p-3 text-center">Jumlah Hadir</th>
                    <th className="p-3 text-center">Jumlah Cuti</th>
                    <th className="p-3 text-center">Lembur Terencana (Minggu)</th>
                    <th className="p-3 text-center">Lembur di Luar Jadwal (Minggu)</th>
                    <th className="p-3 text-center">Total Lembur (Minggu)</th>
                    <th className="p-3 text-right">Total Jam Kerja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffReportRows.map((row) => (
                    <tr key={row.staffId} className="hover:bg-slate-50/70">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{row.staffName}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                          <span className="font-mono text-sky-700 font-bold">{row.staffId}</span>
                          <span>•</span>
                          <span>{row.staffRole}</span>
                          {row.pendingCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                              {row.pendingCount} pending
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-black">
                          {row.hadirCount} hari
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-black ${
                            row.cutiCount > 0
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-50 text-slate-400'
                          }`}
                        >
                          {row.cutiCount} hari
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {row.lemburTerencanaCount > 0 ? (
                          <div>
                            <span className="font-extrabold text-sky-700">
                              {row.lemburTerencanaCount} sesi
                            </span>
                            <div className="text-[10px] text-slate-500">
                              {formatMinutesDuration(row.lemburTerencanaMinutes)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {row.lemburLuarJadwalCount > 0 ? (
                          <div>
                            <span className="font-extrabold text-purple-700">
                              {row.lemburLuarJadwalCount} sesi
                            </span>
                            <div className="text-[10px] text-slate-500">
                              {formatMinutesDuration(row.lemburLuarJadwalMinutes)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {row.totalLemburCount > 0 ? (
                          <span className="inline-flex flex-col items-center px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-black">
                            <span>{row.totalLemburCount} sesi</span>
                            <span className="text-[9px] font-bold">
                              {formatMinutesDuration(row.totalLemburMinutes)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700">
                        {formatMinutesDuration(row.totalWorkMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900 text-white font-extrabold text-xs">
                  <tr>
                    <td className="p-3">TOTAL KESELURUHAN</td>
                    <td className="p-3 text-center text-emerald-300">{reportTotals.hadir} hari</td>
                    <td className="p-3 text-center text-amber-300">{reportTotals.cuti} hari</td>
                    <td className="p-3 text-center text-sky-300">
                      {reportTotals.lemburTerencana} sesi
                    </td>
                    <td className="p-3 text-center text-purple-300">
                      {reportTotals.lemburLuarJadwal} sesi
                    </td>
                    <td className="p-3 text-center text-indigo-200">
                      {reportTotals.totalLembur} sesi ({formatMinutesDuration(reportTotals.totalLemburMinutes)})
                    </td>
                    <td className="p-3 text-right font-mono text-slate-200">
                      {formatMinutesDuration(reportTotals.totalWorkMinutes)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== MODAL TAMBAH / EDIT KEHADIRAN, CUTI & LEMBUR MINGGU ==================== */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarCheck2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <h4 className="font-black text-sm">
                    {editingId ? 'Edit Catatan Kehadiran' : 'Catat / Ajukan Kehadiran, Cuti & Lembur'}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Terintegrasi Jadwal Shift • Lembur khusus hari Minggu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pegawai *</label>
                  <select
                    required
                    value={formStaffId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setFormStaffId(nextId);
                      const matched = findMatchingShiftForStaffOnDate(nextId, formDate, schedules);
                      if (matched && !editingId) {
                        setFormCheckIn(matched.startTime);
                        setFormCheckOut(matched.endTime);
                        setFormOvertimeType('Lembur Terencana');
                      } else if (!matched && !editingId) {
                        setFormOvertimeType('Lembur di Luar Jadwal');
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:bg-white"
                  >
                    {activeStaffOptions.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} — [{st.role}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tanggal ({formDayName}) *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setFormDate(nextDate);
                      const matched = findMatchingShiftForStaffOnDate(formStaffId, nextDate, schedules);
                      if (matched && !editingId) {
                        setFormCheckIn(matched.startTime);
                        setFormCheckOut(matched.endTime);
                        setFormOvertimeType('Lembur Terencana');
                      } else if (!matched && !editingId) {
                        setFormOvertimeType('Lembur di Luar Jadwal');
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:bg-white"
                  />
                </div>
              </div>

              {/* Matched Shift & Sunday Policy Info */}
              <div
                className={`p-3 rounded-xl border text-[11px] flex items-start gap-2 ${
                  formDateIsSunday
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                <div className="space-y-0.5">
                  <div>
                    <strong>Jadwal Shift ({formDayName}):</strong>{' '}
                    {formMatchedShift
                      ? `${formMatchedShift.startTime}–${formMatchedShift.endTime} WIB (${formMatchedShift.serviceUnit})`
                      : 'Tidak ada shift terjadwal di hari ini'}
                  </div>
                  <div className="text-[10px]">
                    {formDateIsSunday
                      ? 'Hari Minggu terdeteksi: Aturan Lembur aktif (otomatis jika check-out melewati jam selesai shift, atau pencatatan Lembur Terencana / di Luar Jadwal).'
                      : 'Hari kerja biasa (Senin–Sabtu): Perhitungan & status Lembur dinonaktifkan (hanya berlaku khusus hari Minggu).'}
                  </div>
                </div>
              </div>

              {/* Status Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Status Kehadiran *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Hadir', 'Cuti', 'Lembur'] as AttendanceStatus[]).map((st) => {
                    const disabled = st === 'Lembur' && !formDateIsSunday;
                    const active = formStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={disabled}
                        onClick={() => setFormStatus(st)}
                        className={`py-2.5 px-2 rounded-xl border font-extrabold text-xs transition ${
                          disabled
                            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                            : active
                            ? st === 'Hadir'
                              ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs cursor-pointer'
                              : st === 'Cuti'
                              ? 'bg-amber-500 border-amber-600 text-white shadow-xs cursor-pointer'
                              : 'bg-indigo-600 border-indigo-700 text-white shadow-xs cursor-pointer'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        {st === 'Lembur' ? 'Lembur (Minggu)' : st}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time inputs for Hadir / Lembur */}
              {formStatus !== 'Cuti' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Jam Check-In *</label>
                      <input
                        type="time"
                        required
                        value={formCheckIn}
                        onChange={(e) => setFormCheckIn(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-800 outline-none focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Jam Check-Out</label>
                      <input
                        type="time"
                        value={formCheckOut}
                        onChange={(e) => setFormCheckOut(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-800 outline-none focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Sunday Overtime Category Selector */}
                  {formDateIsSunday && (formStatus === 'Lembur' || formLiveMetrics.status === 'Lembur') && (
                    <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-2">
                      <label className="block font-extrabold text-indigo-950 text-[11px]">
                        Kategori Lembur Hari Minggu *
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['Lembur Terencana', 'Lembur di Luar Jadwal'] as SundayOvertimeType[]).map(
                          (cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setFormOvertimeType(cat)}
                              className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                                formOvertimeType === cat
                                  ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
                                  : 'bg-white border-indigo-200 text-indigo-800 hover:bg-indigo-100/60'
                              }`}
                            >
                              {cat}
                            </button>
                          )
                        )}
                      </div>
                      <div className="text-[11px] text-indigo-800 font-semibold flex items-center justify-between pt-1">
                        <span>Estimasi Durasi Lembur Minggu:</span>
                        <strong className="text-indigo-950 font-mono">
                          {formatMinutesDuration(formLiveMetrics.overtimeMinutes)}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Jenis / Alasan Cuti *</label>
                  <select
                    value={formLeaveReason}
                    onChange={(e) => setFormLeaveReason(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:bg-white"
                  >
                    <option value="Cuti Tahunan">Cuti Tahunan</option>
                    <option value="Cuti Sakit">Cuti Sakit</option>
                    <option value="Izin Keperluan Keluarga">Izin Keperluan Keluarga</option>
                    <option value="Cuti Melahirkan / Khusus">Cuti Melahirkan / Khusus</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Misal: Tambahan jam jaga resep Minggu sore, atau keterangan cuti..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 outline-none focus:bg-white"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold shadow-xs cursor-pointer"
                >
                  {editingId ? 'Simpan Perubahan' : 'Simpan Kehadiran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL SKEMA SQL KEHADIRAN (KHUSUS APJ / OWNER) ==================== */}
      {isOwnerAdmin && showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-sky-400" />
                <div>
                  <h4 className="font-black text-sm">
                    Skema DDL SQL Ringan — Kehadiran, Cuti &amp; Lembur Minggu
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Khusus APJ / Owner • Terindeks pada tanggal &amp; pegawai
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600">Nama Tabel Supabase:</span>
                  <input
                    type="text"
                    value={attendanceTableInput}
                    onChange={(e) => setAttendanceTableInput(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 text-xs w-44"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const saved = setAttendanceTableName(attendanceTableInput);
                      setAttendanceTableInput(saved);
                      showNotice('success', `Nama tabel absensi disimpan: ${saved}`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-sky-600 text-white font-bold text-[11px] cursor-pointer"
                  >
                    Simpan
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_ATTENDANCE_SQL_SCHEMA);
                    setCopiedSql(true);
                    window.setTimeout(() => setCopiedSql(false), 2500);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Skema SQL</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 rounded-2xl bg-slate-950 text-sky-200 font-mono text-[11px] overflow-x-auto max-h-[360px] overflow-y-auto leading-relaxed">
                {SUPABASE_ATTENDANCE_SQL_SCHEMA}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
