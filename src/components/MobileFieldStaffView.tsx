import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Smartphone,
  Stethoscope,
  Boxes,
  Volume2,
  Search,
  User,
  HeartPulse,
  Send,
  CheckCircle,
  Pill,
  ArrowLeft,
  AlertTriangle,
  ClipboardCheck,
  Check,
  Plus,
  Minus,
  RotateCcw,
  Sparkles,
  Save,
  Filter,
  CheckCheck,
  Building,
  TrendingDown,
  TrendingUp,
  FileCheck2,
  RefreshCw,
  X,
  Calendar,
  Trash2,
  Lock,
  Unlock,
  Radio,
  UserCheck,
  Clock,
  LogIn,
  LogOut,
  CalendarOff,
  Flame,
  MapPin
} from 'lucide-react';
import {
  Patient,
  Medicine,
  PatientQueue,
  RMERecord,
  Transaction,
  StockOpnameRecord,
  StockMutation,
  LiveOpnameItemActivity,
  Staff,
  DutySchedule,
  StaffAttendanceRecord,
  SundayOvertimeType,
  Branch,
  normalizeStaffRole
} from '../types';
import { announceQueueVoice } from '../utils/audio';
import { getNormalizedBatches, resolvePrimaryBatchAndStock } from '../utils/batchHelper';
import {
  getClientOpnameSessionId,
  subscribeLiveOpnameActivityChannel,
  LiveOpnameActivityController,
  fetchPatientsPaginatedFromSupabase,
  getSupabaseConfig,
  deduplicatePatients
} from '../utils/supabaseClient';
import { isDemoMode } from '../utils/demoSandbox';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import {
  ATTENDANCE_UPDATED_EVENT,
  loadLocalAttendanceRecords,
  syncAllAttendanceWithSupabase,
  upsertAttendanceRecord,
  createQuickCheckInRecord,
  applyCheckOutOnRecord,
  findMatchingShiftForStaffOnDate,
  evaluateAttendanceMetrics,
  getTodayIsoLocal,
  getCurrentTimeHHMM,
  getScheduleDayFromIso,
  isSundayDate,
  formatIsoToIdDate,
  formatMinutesDuration,
  verifyAttendanceLocationWithinRadius
} from '../utils/attendanceService';

interface MobileBatchEntry {
  id: string;
  batchNo: string;
  expDate: string;
  systemStock: number;
  physicalStock: string;
  physicalBesar?: string;
  physicalKecil?: string;
}

interface MobileCountState {
  physicalStock: string;
  physicalBesar?: string;
  physicalKecil?: string;
  batchEntries?: MobileBatchEntry[];
  batchModified?: boolean;
  notes?: string;
}

interface MobileFieldStaffViewProps {
  patients: Patient[];
  medicines: Medicine[];
  queue: PatientQueue[];
  transactions?: Transaction[];
  onApplyStockOpname?: (
    adjustments: {
      medicineId: string;
      medicineName: string;
      finalStock: number;
      difference: number;
      reason: string;
      systemStock?: number;
      hpp?: number;
      sellPrice?: number;
      unit?: string;
      batchNo?: string;
      expDate?: string;
      batches?: {
        id?: string;
        batchNo: string;
        expDate: string;
        systemStock?: number;
        physicalStock?: number;
        stock?: number;
        difference?: number;
      }[];
    }[]
  ) => void;
  onCloseMobileMode: () => void;
  onSaveMobileRME: (record: RMERecord) => void;
  staffName?: string;
  opnameRecords?: StockOpnameRecord[];
  stockMutations?: StockMutation[];
  staffList?: Staff[];
  schedules?: DutySchedule[];
  currentStaffId?: string;
  currentBranch?: Branch;
  onAuditLog?: (module: string, action: string) => void;
}

export const MobileFieldStaffView: React.FC<MobileFieldStaffViewProps> = ({
  patients,
  medicines,
  queue,
  transactions = [],
  onApplyStockOpname,
  onCloseMobileMode,
  onSaveMobileRME,
  staffName = 'dr. Anis Prima Dewi (Home Visit)',
  opnameRecords = [],
  stockMutations = [],
  staffList = [],
  schedules = [],
  currentStaffId,
  currentBranch,
  onAuditLog
}) => {
  // Mobile Tab: default to 'stokopname' as requested by user
  const [mobileTab, setMobileTab] = useState<'stokopname' | 'cekstok' | 'homevisit' | 'antrean' | 'absensi'>('stokopname');
  const isOwnerAdmin = useIsOwnerAdmin();

  // ================= MOBILE ATTENDANCE (KEHADIRAN, CUTI & LEMBUR MINGGU) STATE =================
  const [mobileAttendanceRecords, setMobileAttendanceRecords] = useState<StaffAttendanceRecord[]>(() =>
    loadLocalAttendanceRecords()
  );
  const [mobileAttendanceSynced, setMobileAttendanceSynced] = useState(false);
  const [mobileAttendanceStaffId, setMobileAttendanceStaffId] = useState<string>('');
  const [mobileRequestMode, setMobileRequestMode] = useState<'none' | 'cuti' | 'lembur'>('none');
  const [mobileReqDate, setMobileReqDate] = useState<string>(() => getTodayIsoLocal());
  const [mobileReqStart, setMobileReqStart] = useState<string>('08:00');
  const [mobileReqEnd, setMobileReqEnd] = useState<string>('12:00');
  const [mobileReqOvertimeType, setMobileReqOvertimeType] = useState<SundayOvertimeType>('Lembur Terencana');
  const [mobileReqReason, setMobileReqReason] = useState<string>('');
  const [mobileAttendanceNotice, setMobileAttendanceNotice] = useState<string | null>(null);
  const [mobileAttendanceNoticeType, setMobileAttendanceNoticeType] = useState<'success' | 'error'>('success');
  const [isVerifyingMobileLocation, setIsVerifyingMobileLocation] = useState(false);

  const resolvedMobileStaff: Staff | null = useMemo(() => {
    if (mobileAttendanceStaffId) {
      const picked = staffList.find((s) => s.id === mobileAttendanceStaffId);
      if (picked) return picked;
    }
    if (currentStaffId) {
      const byId = staffList.find((s) => s.id === currentStaffId);
      if (byId) return byId;
    }
    const cleanName = (staffName || '').trim().toLowerCase();
    const byName = staffList.find(
      (s) => s.name.trim().toLowerCase() === cleanName || cleanName.includes(s.name.trim().toLowerCase())
    );
    if (byName) return byName;
    if (staffList.length > 0) return staffList[0];
    return {
      id: currentStaffId || 'STF-MOBILE',
      name: staffName || 'Petugas Lapangan',
      role: 'Apoteker',
      phone: '',
      branchId: 'BR-01',
      status: 'Aktif'
    };
  }, [mobileAttendanceStaffId, currentStaffId, staffName, staffList]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUpdated = () => setMobileAttendanceRecords(loadLocalAttendanceRecords());
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, handleUpdated);
    return () => window.removeEventListener(ATTENDANCE_UPDATED_EVENT, handleUpdated);
  }, []);

  // Lazy-sync attendance from Supabase ONLY when user opens the Absensi tab
  useEffect(() => {
    if (mobileTab !== 'absensi' || mobileAttendanceSynced) return;
    setMobileAttendanceSynced(true);
    if (!isDemoMode()) {
      syncAllAttendanceWithSupabase()
        .then((res) => {
          if (res.records) setMobileAttendanceRecords(res.records);
        })
        .catch(() => {});
    }
  }, [mobileTab, mobileAttendanceSynced]);

  const todayIsoMobile = useMemo(() => getTodayIsoLocal(), []);
  const isTodaySundayMobile = useMemo(() => isSundayDate(todayIsoMobile), [todayIsoMobile]);
  const todayDayNameMobile = useMemo(() => getScheduleDayFromIso(todayIsoMobile), [todayIsoMobile]);

  const todayMatchedShiftMobile = useMemo(() => {
    if (!resolvedMobileStaff) return null;
    return findMatchingShiftForStaffOnDate(resolvedMobileStaff.id, todayIsoMobile, schedules);
  }, [resolvedMobileStaff, todayIsoMobile, schedules]);

  const todayStaffRecordMobile = useMemo(() => {
    if (!resolvedMobileStaff) return null;
    return (
      mobileAttendanceRecords.find(
        (r) => r.staffId === resolvedMobileStaff.id && r.date === todayIsoMobile
      ) || null
    );
  }, [mobileAttendanceRecords, resolvedMobileStaff, todayIsoMobile]);

  const recentStaffRecordsMobile = useMemo(() => {
    if (!resolvedMobileStaff) return [];
    return mobileAttendanceRecords
      .filter((r) => r.staffId === resolvedMobileStaff.id)
      .slice(0, 8);
  }, [mobileAttendanceRecords, resolvedMobileStaff]);

  const handleMobileCheckIn = async () => {
    if (!resolvedMobileStaff || isVerifyingMobileLocation) return;

    setIsVerifyingMobileLocation(true);
    try {
      const locRes = await verifyAttendanceLocationWithinRadius({
        branchId: currentBranch?.id || resolvedMobileStaff.branchId
      });
      if (!locRes.allowed) {
        setMobileAttendanceNoticeType('error');
        setMobileAttendanceNotice(
          locRes.reason ||
            'Check-In ditolak: Lokasi berada di luar radius maksimal 50 meter dari lokasi Apotek.'
        );
        onAuditLog?.(
          'Kehadiran Pegawai',
          `Check-In Mobile ditolak (GPS): ${resolvedMobileStaff.name} — ${locRes.reason || 'Di luar radius 50 m'}`
        );
        return;
      }

      const gpsNote =
        typeof locRes.distanceMeters === 'number'
          ? `Check-In dari Mode Mobile Lapangan • GPS Terverifikasi (${locRes.distanceMeters} m dari ${locRes.targetSourceLabel || 'Apotek'})`
          : 'Check-In dari Mode Mobile Lapangan • GPS Terverifikasi';

      const newRec = createQuickCheckInRecord({
        staff: resolvedMobileStaff,
        date: todayIsoMobile,
        schedules,
        sourceMode: 'mobile',
        isOwnerAdmin,
        notes: gpsNote
      });
      const updated = upsertAttendanceRecord(newRec);
      setMobileAttendanceRecords(updated);
      setMobileAttendanceNoticeType('success');
      setMobileAttendanceNotice(
        newRec.status === 'Lembur'
          ? `Check-In Lembur Minggu tercatat (${newRec.checkInTime} WIB) — ${newRec.overtimeType} (Jarak ${locRes.distanceMeters ?? 0} m).`
          : `Check-In berhasil tercatat pukul ${newRec.checkInTime} WIB (Jarak ${locRes.distanceMeters ?? 0} m dari Apotek).`
      );
      onAuditLog?.(
        'Kehadiran Pegawai',
        `Check-In Mobile: ${resolvedMobileStaff.name} (${newRec.checkInTime} WIB • Jarak ${locRes.distanceMeters ?? 0} m)`
      );
      setTimeout(() => setMobileAttendanceNotice(null), 5000);
    } finally {
      setIsVerifyingMobileLocation(false);
    }
  };

  const handleMobileCheckOut = () => {
    if (!todayStaffRecordMobile || !resolvedMobileStaff) return;
    const checkedOut = applyCheckOutOnRecord({
      record: todayStaffRecordMobile,
      isOwnerAdmin,
      approverName: staffName
    });
    const updated = upsertAttendanceRecord(checkedOut);
    setMobileAttendanceRecords(updated);
    setMobileAttendanceNoticeType('success');
    setMobileAttendanceNotice(
      checkedOut.isSunday && checkedOut.overtimeMinutes > 0
        ? `Check-Out ${checkedOut.checkOutTime} WIB — Terdeteksi Lembur Minggu ${formatMinutesDuration(checkedOut.overtimeMinutes)} (${checkedOut.overtimeType}).`
        : `Check-Out berhasil pukul ${checkedOut.checkOutTime} WIB (${formatMinutesDuration(checkedOut.workDurationMinutes)}).`
    );
    onAuditLog?.('Kehadiran Pegawai', `Check-Out Mobile: ${resolvedMobileStaff.name} (${checkedOut.checkOutTime} WIB)`);
    setTimeout(() => setMobileAttendanceNotice(null), 5500);
  };

  const handleSubmitMobileRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedMobileStaff || mobileRequestMode === 'none') return;

    const reqIsSunday = isSundayDate(mobileReqDate);
    if (mobileRequestMode === 'lembur' && !reqIsSunday) {
      setMobileAttendanceNoticeType('error');
      setMobileAttendanceNotice('Lembur hanya berlaku pada hari Minggu. Pilih tanggal hari Minggu.');
      return;
    }

    const matchedShift = findMatchingShiftForStaffOnDate(resolvedMobileStaff.id, mobileReqDate, schedules);
    const hasShift = Boolean(matchedShift);
    const metrics = evaluateAttendanceMetrics({
      date: mobileReqDate,
      requestedStatus: mobileRequestMode === 'cuti' ? 'Cuti' : 'Lembur',
      checkInTime: mobileRequestMode === 'cuti' ? undefined : mobileReqStart,
      checkOutTime: mobileRequestMode === 'cuti' ? undefined : mobileReqEnd,
      scheduledStartTime: matchedShift?.startTime,
      scheduledEndTime: matchedShift?.endTime,
      hasScheduledShift: hasShift,
      requestedOvertimeType: mobileRequestMode === 'lembur' ? mobileReqOvertimeType : undefined
    });

    const nowIso = new Date().toISOString();
    const approvalStatus = isOwnerAdmin ? 'Disetujui' : 'Menunggu Persetujuan';
    const record: StaffAttendanceRecord = {
      id: `ATT-${mobileReqDate.replace(/-/g, '')}-${resolvedMobileStaff.id}-${Date.now().toString().slice(-4)}`,
      staffId: resolvedMobileStaff.id,
      staffName: resolvedMobileStaff.name,
      staffRole: normalizeStaffRole(resolvedMobileStaff.role, 'Apoteker'),
      date: mobileReqDate,
      dayName: metrics.dayName,
      status: metrics.status,
      scheduleId: matchedShift?.id,
      scheduledStartTime: matchedShift?.startTime,
      scheduledEndTime: matchedShift?.endTime,
      serviceUnit: matchedShift?.serviceUnit,
      checkInTime: mobileRequestMode === 'cuti' ? undefined : mobileReqStart,
      checkOutTime: mobileRequestMode === 'cuti' ? undefined : mobileReqEnd,
      workDurationMinutes: metrics.workDurationMinutes,
      isSunday: metrics.isSunday,
      overtimeMinutes: metrics.overtimeMinutes,
      overtimeType: metrics.overtimeType,
      overtimeSource: metrics.overtimeSource,
      leaveReason: mobileRequestMode === 'cuti' ? mobileReqReason.trim() || 'Cuti / Izin Pegawai' : undefined,
      approvalStatus,
      approvedBy: isOwnerAdmin ? staffName : undefined,
      approvedAt: isOwnerAdmin ? nowIso : undefined,
      sourceMode: 'mobile',
      notes: mobileRequestMode === 'lembur' ? mobileReqReason.trim() : '',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const updated = upsertAttendanceRecord(record);
    setMobileAttendanceRecords(updated);
    setMobileRequestMode('none');
    setMobileReqReason('');
    setMobileAttendanceNoticeType('success');
    setMobileAttendanceNotice(
      mobileRequestMode === 'cuti'
        ? `Pengajuan Cuti tanggal ${formatIsoToIdDate(mobileReqDate)} tersimpan (${approvalStatus}).`
        : `Catatan ${metrics.overtimeType} Minggu (${formatMinutesDuration(metrics.overtimeMinutes)}) tersimpan (${approvalStatus}).`
    );
    onAuditLog?.(
      'Kehadiran Pegawai',
      `${mobileRequestMode === 'cuti' ? 'Pengajuan Cuti' : `Catat ${metrics.overtimeType}`} Mobile: ${resolvedMobileStaff.name} (${mobileReqDate})`
    );
    setTimeout(() => setMobileAttendanceNotice(null), 5500);
  };
  
  // ================= STOK OPNAME (LIVE) STATE =================
  const [sessionStartTime] = useState<string>(() => new Date().toISOString());
  const [opnameSearch, setOpnameSearch] = useState('');
  const [selectedRack, setSelectedRack] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNCOUNTED' | 'COUNTED' | 'DIFF' | 'BEING_COUNTED_OTHER'>('ALL');
  
  // Physical count + Multi-Batch storage
  const [mobileCounts, setMobileCounts] = useState<Record<string, MobileCountState>>({});
  const [showPostingConfirmModal, setShowPostingConfirmModal] = useState(false);
  const [postingSuccessMessage, setPostingSuccessMessage] = useState<string | null>(null);

  // Real-Time Multi-User Opname Activity (Anti Double-Opname)
  const myMobileSessionId = useMemo(() => `${getClientOpnameSessionId()}-MOB`, []);
  const [remoteOpnameActivities, setRemoteOpnameActivities] = useState<
    Record<string, LiveOpnameItemActivity[]>
  >({});
  const [focusedMedicineId, setFocusedMedicineId] = useState<string | null>(null);
  const [overriddenLocks, setOverriddenLocks] = useState<Record<string, boolean>>({});
  const activityControllerRef = useRef<LiveOpnameActivityController | null>(null);

  useEffect(() => {
    const controller = subscribeLiveOpnameActivityChannel({
      sessionId: myMobileSessionId,
      onRemoteActivitiesChange: (grouped) => {
        setRemoteOpnameActivities(grouped);
      }
    });
    activityControllerRef.current = controller;
    return () => {
      controller.unsubscribe();
      activityControllerRef.current = null;
    };
  }, [myMobileSessionId]);

  // List of unique racks
  const availableRacks = useMemo(() => {
    const set = new Set(medicines.map((m) => m.rack).filter(Boolean));
    return Array.from(set);
  }, [medicines]);

  // Live sales map during this opname session from POS transactions
  const liveSalesMap = useMemo(() => {
    const sessionDate = new Date(sessionStartTime);
    const map: Record<string, number> = {};

    transactions.forEach((trx) => {
      if (trx.status !== 'Dibatalkan' && trx.status !== 'Diretur') {
        const trxDate = new Date(trx.date);
        const isAfterSession = !isNaN(trxDate.getTime())
          ? trxDate >= sessionDate
          : trx.date >= sessionStartTime.slice(0, 10);

        if (isAfterSession) {
          trx.items?.forEach((item) => {
            if (item.id) {
              map[item.id] = (map[item.id] || 0) + (item.qty || 0);
            }
          });
        }
      }
    });

    return map;
  }, [transactions, sessionStartTime]);

  const getMutableMobileBatchEntries = (
    medId: string,
    prevCounts: Record<string, MobileCountState>
  ): MobileBatchEntry[] => {
    const existing = prevCounts[medId]?.batchEntries;
    if (existing && existing.length > 0) return existing.map((b) => ({ ...b }));
    const med = medicines.find((m) => m.id === medId);
    if (!med) return [];
    return getNormalizedBatches(med).map((b) => ({
      id: b.id,
      batchNo: b.batchNo,
      expDate: b.expDate,
      systemStock: b.stock,
      physicalStock: '',
      physicalBesar: '',
      physicalKecil: ''
    }));
  };

  const computeMobileSummaryFromEntries = (entries: MobileBatchEntry[]) => {
    const anyFilled = entries.some((b) => b.physicalStock !== '');
    if (!anyFilled) return '';
    const total = entries.reduce((sum, b) => {
      const val = b.physicalStock !== '' ? parseFloat(b.physicalStock) || 0 : b.systemStock;
      return sum + Math.max(0, Math.round(val));
    }, 0);
    return total.toString();
  };

  // Handle batch field edit (Batch No or Expired Date)
  const handleBatchFieldChange = (
    medId: string,
    batchId: string,
    field: 'batchNo' | 'expDate',
    value: string
  ) => {
    setMobileCounts((prev) => {
      const entries = getMutableMobileBatchEntries(medId, prev);
      const updatedEntries = entries.map((b) =>
        b.id === batchId ? { ...b, [field]: value } : b
      );
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: computeMobileSummaryFromEntries(updatedEntries),
          batchEntries: updatedEntries,
          batchModified: true,
          notes: prev[medId]?.notes || ''
        }
      };
    });
  };

  // Add new Batch & ED row
  const handleAddBatchRow = (medId: string) => {
    setMobileCounts((prev) => {
      const entries = getMutableMobileBatchEntries(medId, prev);
      const newEntry: MobileBatchEntry = {
        id: `${medId}-MB-${Date.now().toString().slice(-5)}-${entries.length + 1}`,
        batchNo: '',
        expDate: '',
        systemStock: 0,
        physicalStock: '',
        physicalBesar: '',
        physicalKecil: ''
      };
      const updatedEntries = [...entries, newEntry];
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: computeMobileSummaryFromEntries(updatedEntries),
          batchEntries: updatedEntries,
          batchModified: true,
          notes: prev[medId]?.notes || ''
        }
      };
    });
  };

  // Remove Batch & ED row (when >1 exists)
  const handleRemoveBatchRow = (medId: string, batchId: string) => {
    setMobileCounts((prev) => {
      const entries = getMutableMobileBatchEntries(medId, prev);
      if (entries.length <= 1) return prev;
      const updatedEntries = entries.filter((b) => b.id !== batchId);
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: computeMobileSummaryFromEntries(updatedEntries),
          batchEntries: updatedEntries,
          batchModified: true,
          notes: prev[medId]?.notes || ''
        }
      };
    });
  };

  // Handle single count change per batch
  const handleBatchCountChange = (medId: string, batchId: string, val: string) => {
    setMobileCounts((prev) => {
      const entries = getMutableMobileBatchEntries(medId, prev);
      const updatedEntries = entries.map((b) =>
        b.id === batchId
          ? { ...b, physicalStock: val, physicalBesar: '', physicalKecil: val }
          : b
      );
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: computeMobileSummaryFromEntries(updatedEntries),
          batchEntries: updatedEntries,
          notes: prev[medId]?.notes || ''
        }
      };
    });
  };

  // Handle dual count change per batch (Satuan Besar & Satuan Kecil)
  // Rumus: Total Fisik = (Satuan Besar × Rasio) + Satuan Kecil
  const handleBatchDualCountChange = (
    medId: string,
    batchId: string,
    besarVal: string,
    kecilVal: string,
    ratio: number
  ) => {
    const safeRatio = Math.max(1, ratio);
    const isBesarFilled = besarVal.trim() !== '';
    const isKecilFilled = kecilVal.trim() !== '';

    setMobileCounts((prev) => {
      const entries = getMutableMobileBatchEntries(medId, prev);
      const updatedEntries = entries.map((b) => {
        if (b.id !== batchId) return b;
        if (!isBesarFilled && !isKecilFilled) {
          return { ...b, physicalStock: '', physicalBesar: '', physicalKecil: '' };
        }
        const numBesar = isBesarFilled ? parseFloat(besarVal) || 0 : 0;
        const numKecil = isKecilFilled ? parseFloat(kecilVal) || 0 : 0;
        const total = Math.round(numBesar * safeRatio + numKecil);
        return {
          ...b,
          physicalStock: total.toString(),
          physicalBesar: besarVal,
          physicalKecil: kecilVal
        };
      });

      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: computeMobileSummaryFromEntries(updatedEntries),
          batchEntries: updatedEntries,
          notes: prev[medId]?.notes || ''
        }
      };
    });
  };

  // Adjust count by step (+1, -1, +5, etc.) per batch
  const handleBatchStepCount = (
    medId: string,
    batchId: string,
    step: number,
    fallbackSystemStock: number
  ) => {
    const entries = getMutableMobileBatchEntries(medId, mobileCounts);
    const target = entries.find((b) => b.id === batchId);
    const currentValStr = target?.physicalStock;
    const currentNum =
      currentValStr !== undefined && currentValStr !== ''
        ? parseFloat(currentValStr) || 0
        : fallbackSystemStock;
    const nextVal = Math.max(0, currentNum + step);
    handleBatchCountChange(medId, batchId, String(nextVal));
  };

  // Quick Match all batches with system stock
  const handleMatchWithSystem = (med: Medicine) => {
    const ratio = Math.max(1, med.rasioKonversi || 1);
    const baseBatches = getNormalizedBatches(med);

    setMobileCounts((prev) => {
      const existing = prev[med.id]?.batchEntries;
      const source = existing && existing.length > 0 ? existing : baseBatches.map((b) => ({
        id: b.id,
        batchNo: b.batchNo,
        expDate: b.expDate,
        systemStock: b.stock,
        physicalStock: '',
        physicalBesar: '',
        physicalKecil: ''
      }));

      const matchedEntries: MobileBatchEntry[] = source.map((b) => {
        const sStock = Math.max(0, b.systemStock);
        return {
          ...b,
          physicalStock: sStock.toString(),
          physicalBesar: ratio > 1 ? Math.floor(sStock / ratio).toString() : '',
          physicalKecil: ratio > 1 ? (sStock % ratio).toString() : sStock.toString()
        };
      });

      return {
        ...prev,
        [med.id]: {
          ...(prev[med.id] || {}),
          physicalStock: computeMobileSummaryFromEntries(matchedEntries),
          batchEntries: matchedEntries,
          notes: prev[med.id]?.notes || ''
        }
      };
    });
  };

  // Reset count for single med
  const handleResetCount = (medId: string) => {
    setMobileCounts((prev) => {
      const copy = { ...prev };
      delete copy[medId];
      return copy;
    });
  };

  // 4-Month Cutoff Date & Historical Opname Tracking (per Medicine & per User Account)
  const fourMonthsAgoStr = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 4);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const medicineOpnameHistoryMap = useMemo(() => {
    const map: Record<
      string,
      { lastOpnameDate: string; lastPetugas: string; opnamedInLast4Months: boolean }
    > = {};

    opnameRecords.forEach((rec) => {
      const recDate = rec.date ? rec.date.split('T')[0].split(' ')[0] : '';
      if (!recDate) return;
      rec.items?.forEach((it) => {
        if (!it.medicineId) return;
        const existing = map[it.medicineId];
        if (!existing || recDate > existing.lastOpnameDate) {
          map[it.medicineId] = {
            lastOpnameDate: recDate,
            lastPetugas: rec.petugas || '-',
            opnamedInLast4Months: recDate >= fourMonthsAgoStr
          };
        } else if (recDate >= fourMonthsAgoStr && !existing.opnamedInLast4Months) {
          existing.opnamedInLast4Months = true;
        }
      });
    });

    stockMutations
      .filter((m) => m.type === 'STOK_OPNAME')
      .forEach((m) => {
        const mutDate = m.date ? m.date.split('T')[0].split(' ')[0] : '';
        if (!mutDate || !m.medicineId) return;
        const existing = map[m.medicineId];
        if (!existing || mutDate > existing.lastOpnameDate) {
          map[m.medicineId] = {
            lastOpnameDate: mutDate,
            lastPetugas: m.petugas || '-',
            opnamedInLast4Months: mutDate >= fourMonthsAgoStr
          };
        } else if (mutDate >= fourMonthsAgoStr && !existing.opnamedInLast4Months) {
          existing.opnamedInLast4Months = true;
        }
      });

    return map;
  }, [opnameRecords, stockMutations, fourMonthsAgoStr]);

  const userOpnameStatus = useMemo(() => {
    const normalizeOfficer = (name: string) =>
      name
        .replace(/\b(apt|dr|drg|ns|prof|hj|h)\b\.?\s*/gi, '')
        .replace(/,\s*(s\.?farm|m\.?farm|sp\.?pd|sp\.?a|sp\.?og|s\.?kep|a\.?md\.?far|a\.?md\.?kep|s\.?ked|m\.?kes|apt)\b.*/gi, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    const targetNorm = normalizeOfficer(staffName || '');
    const isSameUser = (petugasName?: string) => {
      if (!petugasName || !targetNorm) return false;
      const pNorm = normalizeOfficer(petugasName);
      if (!pNorm) return false;
      return (
        pNorm === targetNorm ||
        (pNorm.length >= 3 &&
          targetNorm.length >= 3 &&
          (pNorm.includes(targetNorm) || targetNorm.includes(pNorm)))
      );
    };

    let lastUserOpnameDate = '';
    let hasOpnameInLast4Months = false;

    opnameRecords.forEach((rec) => {
      if (!isSameUser(rec.petugas)) return;
      const recDate = rec.date ? rec.date.split('T')[0].split(' ')[0] : '';
      if (!recDate) return;
      if (!lastUserOpnameDate || recDate > lastUserOpnameDate) {
        lastUserOpnameDate = recDate;
      }
      if (recDate >= fourMonthsAgoStr) {
        hasOpnameInLast4Months = true;
      }
    });

    stockMutations
      .filter((m) => m.type === 'STOK_OPNAME')
      .forEach((m) => {
        if (!isSameUser(m.petugas)) return;
        const mutDate = m.date ? m.date.split('T')[0].split(' ')[0] : '';
        if (!mutDate) return;
        if (!lastUserOpnameDate || mutDate > lastUserOpnameDate) {
          lastUserOpnameDate = mutDate;
        }
        if (mutDate >= fourMonthsAgoStr) {
          hasOpnameInLast4Months = true;
        }
      });

    return {
      hasOpnameInLast4Months,
      lastUserOpnameDate
    };
  }, [opnameRecords, stockMutations, staffName, fourMonthsAgoStr]);

  // Reconciled items for mobile (Multi-Batch & Dual-Satuan)
  const reconciledItems = useMemo(() => {
    return medicines.map((med) => {
      const liveSales = liveSalesMap[med.id] || 0;
      const systemStock = med.stock;
      const countState = mobileCounts[med.id];

      const ratio = Math.max(1, med.rasioKonversi || 1);
      const satuanBesar = med.satuanBesar || 'Box';
      const satuanKecil = med.satuanKecil || med.unit || 'Unit';
      const baseBatches = getNormalizedBatches(med);

      let batchEntries: MobileBatchEntry[];
      if (countState?.batchEntries && countState.batchEntries.length > 0) {
        batchEntries = countState.batchEntries.map((be) => {
          const hasB = be.physicalStock !== '';
          const parsedB = hasB ? parseFloat(be.physicalStock) || 0 : be.systemStock;
          let curB = be.physicalBesar;
          let curK = be.physicalKecil;
          if (hasB && curB === undefined && curK === undefined) {
            if (ratio > 1) {
              curB = Math.floor(parsedB / ratio).toString();
              curK = (parsedB % ratio).toString();
            } else {
              curB = '';
              curK = parsedB.toString();
            }
          }
          return {
            ...be,
            physicalBesar: curB ?? '',
            physicalKecil: curK ?? ''
          };
        });
      } else {
        batchEntries = baseBatches.map((b) => ({
          id: b.id,
          batchNo: b.batchNo,
          expDate: b.expDate,
          systemStock: b.stock,
          physicalStock: '',
          physicalBesar: '',
          physicalKecil: ''
        }));
      }

      const anyBatchCounted = batchEntries.some((b) => b.physicalStock !== '');
      const hasBatchModified = Boolean(countState?.batchModified);
      const hasCounted = anyBatchCounted || hasBatchModified;

      const medHistory = medicineOpnameHistoryMap[med.id];
      const opnamedInLast4Months = Boolean(medHistory?.opnamedInLast4Months);
      const lastOpnameDate = medHistory?.lastOpnameDate || '';
      const isOpnamed4MonthsOrSession = hasCounted || opnamedInLast4Months;

      const parsedPhysical = hasCounted
        ? batchEntries.reduce((sum, b) => {
            const val = b.physicalStock !== '' ? parseFloat(b.physicalStock) || 0 : b.systemStock;
            return sum + Math.max(0, Math.round(val));
          }, 0)
        : systemStock;

      const difference = hasCounted ? parsedPhysical - systemStock : 0;
      const diffHpp = difference * med.hpp;

      let status: 'MATCH' | 'SURPLUS' | 'DEFICIT' | 'UNCOUNTED' = 'UNCOUNTED';
      if (hasCounted) {
        if (difference === 0) status = 'MATCH';
        else if (difference > 0) status = 'SURPLUS';
        else status = 'DEFICIT';
      }

      const previewResolved = resolvePrimaryBatchAndStock(
        batchEntries.map((b) => ({
          id: b.id,
          batchNo: b.batchNo,
          expDate: b.expDate,
          stock: b.physicalStock !== '' ? parseFloat(b.physicalStock) || 0 : b.systemStock
        })),
        med.batchNo,
        med.expDate,
        true
      );

      return {
        ...med,
        systemStock,
        liveSales,
        hasCounted,
        opnamedInLast4Months,
        isOpnamed4MonthsOrSession,
        lastOpnameDate,
        hasBatchModified,
        physicalStock: parsedPhysical,
        batchEntries,
        previewPrimaryBatchNo: previewResolved.batchNo,
        previewPrimaryExpDate: previewResolved.expDate,
        ratio,
        satuanBesar,
        satuanKecil,
        notes: countState?.notes || '',
        difference,
        diffHpp,
        status
      };
    });
  }, [medicines, mobileCounts, liveSalesMap, medicineOpnameHistoryMap]);

  // Filtered items based on search, rack, and status
  const filteredOpnameItems = useMemo(() => {
    return reconciledItems.filter((item) => {
      const q = opnameSearch.toLowerCase();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        (item.rack && item.rack.toLowerCase().includes(q)) ||
        item.batchEntries.some((b) => b.batchNo.toLowerCase().includes(q));

      const matchRack = selectedRack === 'ALL' || item.rack === selectedRack;

      let matchStatus = true;
      if (statusFilter === 'UNCOUNTED') matchStatus = !item.isOpnamed4MonthsOrSession;
      if (statusFilter === 'COUNTED') matchStatus = item.isOpnamed4MonthsOrSession;
      if (statusFilter === 'DIFF') matchStatus = item.hasCounted && item.difference !== 0;
      if (statusFilter === 'BEING_COUNTED_OTHER') {
        matchStatus = (remoteOpnameActivities[item.id]?.length || 0) > 0;
      }

      return matchSearch && matchRack && matchStatus;
    });
  }, [reconciledItems, opnameSearch, selectedRack, statusFilter, remoteOpnameActivities]);

  // Publish active mobile opname counts in real time to other devices/tabs
  useEffect(() => {
    if (!activityControllerRef.current) return;
    const nowIso = new Date().toISOString();
    const nowLabel = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const myItems: LiveOpnameItemActivity[] = [];
    reconciledItems.forEach((r) => {
      const isFocused = focusedMedicineId === r.id;
      if (!r.hasCounted && !isFocused) return;
      myItems.push({
        medicineId: r.id,
        medicineName: r.name,
        staffName: `${staffName} (Mobile)`,
        sessionId: myMobileSessionId,
        physicalStock: r.hasCounted ? String(r.physicalStock) : '',
        unit: r.unit,
        batchCount: r.batchEntries.length,
        statusText: r.hasCounted
          ? `Input Fisik: ${r.physicalStock} ${r.unit}`
          : 'Sedang mengisi angka fisik...',
        isFocused,
        updatedAt: nowIso,
        updatedTimeLabel: nowLabel
      });
    });
    activityControllerRef.current.publishMyActivities(myItems);
  }, [reconciledItems, focusedMedicineId, staffName, myMobileSessionId]);

  // Opname KPI summary metrics
  const opnameMetrics = useMemo(() => {
    const totalItems = medicines.length;
    const countedItems = reconciledItems.filter((i) => i.hasCounted).length;
    const sudahOpnameCount = reconciledItems.filter((i) => i.isOpnamed4MonthsOrSession).length;
    const belumOpnameCount = reconciledItems.filter((i) => !i.isOpnamed4MonthsOrSession).length;
    const beingCountedByOtherCount = reconciledItems.filter(
      (i) => (remoteOpnameActivities[i.id]?.length || 0) > 0
    ).length;
    const matchCount = reconciledItems.filter((i) => i.hasCounted && i.difference === 0).length;
    const diffItems = reconciledItems.filter((i) => i.hasCounted && i.difference !== 0);
    const deficitCount = diffItems.filter((i) => i.difference < 0).length;
    const surplusCount = diffItems.filter((i) => i.difference > 0).length;
    const totalDiffHpp = diffItems.reduce((acc, curr) => acc + curr.diffHpp, 0);

    return {
      totalItems,
      countedItems,
      sudahOpnameCount,
      belumOpnameCount,
      beingCountedByOtherCount,
      matchCount,
      diffCount: diffItems.length,
      deficitCount,
      surplusCount,
      totalDiffHpp
    };
  }, [medicines.length, reconciledItems, remoteOpnameActivities]);

  // Execute Posting Opname from Mobile (with Multi-Batch & FEFO Auto-Adjust)
  const handleExecutePostingOpname = () => {
    if (!onApplyStockOpname) {
      alert('Fungsi posting stok opname belum terhubung.');
      return;
    }

    const countedItems = reconciledItems.filter((i) => i.hasCounted);
    if (countedItems.length === 0) {
      alert('Belum ada item obat yang dihitung atau diubah Batch/ED-nya.');
      return;
    }

    const adjustments = countedItems.map((item) => {
      const finalBatchPayload = item.batchEntries.map((b) => {
        const pStock =
          b.physicalStock !== '' ? Math.max(0, Math.round(parseFloat(b.physicalStock) || 0)) : b.systemStock;
        return {
          id: b.id,
          batchNo: (b.batchNo || '').trim() || '-',
          expDate: (b.expDate || '').trim(),
          systemStock: b.systemStock,
          physicalStock: pStock,
          stock: pStock,
          difference: pStock - b.systemStock
        };
      });

      const resolvedFEFO = resolvePrimaryBatchAndStock(
        finalBatchPayload.map((b) => ({
          id: b.id,
          batchNo: b.batchNo,
          expDate: b.expDate,
          stock: b.stock
        })),
        item.batchNo,
        item.expDate,
        true
      );

      const finalDiff = resolvedFEFO.stock - item.systemStock;

      return {
        medicineId: item.id,
        medicineName: item.name,
        finalStock: resolvedFEFO.stock,
        difference: finalDiff,
        systemStock: item.systemStock,
        hpp: item.hpp,
        sellPrice: item.sellPrice,
        unit: item.unit,
        batchNo: resolvedFEFO.batchNo,
        expDate: resolvedFEFO.expDate,
        batches: finalBatchPayload,
        reason:
          item.notes ||
          (finalDiff === 0
            ? 'Stok opname cocok'
            : `Penyesuaian SO Mobile (${finalDiff > 0 ? '+' : ''}${finalDiff} ${item.unit})`)
      };
    });

    onApplyStockOpname(adjustments);
    setMobileCounts({});
    setFocusedMedicineId(null);
    setOverriddenLocks({});
    activityControllerRef.current?.clearMyActivities();
    setShowPostingConfirmModal(false);
    setPostingSuccessMessage(
      `Berhasil memposting ${adjustments.length} item (stok & Batch/ED FEFO otomatis diperbarui)!`
    );
    setTimeout(() => {
      setPostingSuccessMessage(null);
    }, 4500);
  };

  // ================= HOME VISIT STATE =================
  const [searchPatient, setSearchPatient] = useState('');
  const [remoteVisitPatients, setRemoteVisitPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(patients[0] || null);

  useEffect(() => {
    const clean = searchPatient.trim();
    if (clean.length < 2 || isDemoMode()) {
      setRemoteVisitPatients([]);
      return;
    }
    const cfg = getSupabaseConfig();
    if (!cfg.url || !cfg.key) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchPatientsPaginatedFromSupabase({
        page: 1,
        pageSize: 25,
        searchQuery: clean
      }).then((res) => {
        if (!cancelled && res.data) {
          setRemoteVisitPatients(res.data);
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchPatient]);

  const homeVisitPatientOptions = useMemo(() => {
    const q = searchPatient.trim().toLowerCase();
    let list: Patient[];
    if (!q) {
      list = patients.slice(0, 50);
    } else {
      const localMatches = patients.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.noRm || '').toLowerCase().includes(q) ||
          (p.nik && p.nik.includes(q))
      );
      list =
        remoteVisitPatients.length > 0
          ? deduplicatePatients([...remoteVisitPatients, ...localMatches]).slice(0, 50)
          : localMatches.slice(0, 50);
    }
    if (selectedPatient && !list.some((p) => p.id === selectedPatient.id)) {
      return [selectedPatient, ...list].slice(0, 50);
    }
    return list;
  }, [patients, remoteVisitPatients, searchPatient, selectedPatient]);
  const [td, setTd] = useState('120/80');
  const [suhu, setSuhu] = useState('36.5');
  const [nadi, setNadi] = useState('80');
  const [spo2, setSpo2] = useState('98');
  const [gds, setGds] = useState('110');
  const [soapS, setSoapS] = useState('');
  const [soapA, setSoapA] = useState('J00 - Common Cold');

  // ================= CEK STOK CEPAT STATE =================
  const [stockSearch, setStockSearch] = useState('');

  const currentQueuePatient = queue[0] || null;

  const handleSaveHomeVisit = () => {
    if (!selectedPatient) return;

    const newRecord: RMERecord = {
      id: `RME-HV-${Date.now().toString().slice(-5)}`,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      rmId: selectedPatient.id,
      patientName: selectedPatient.name,
      nik: selectedPatient.nik,
      age: selectedPatient.age,
      gender: selectedPatient.gender,
      doctorName: staffName,
      doctorId: 'DOC-001',
      vitalSign: {
        td,
        suhu: parseFloat(suhu) || 36.5,
        nadi: parseInt(nadi) || 80,
        spo2: parseInt(spo2) || 98
      },
      soapS: soapS || 'Kunjungan home visit medis ke rumah pasien.',
      soapO: `TD: ${td}, Suhu: ${suhu}C, Nadi: ${nadi}, GDS: ${gds} mg/dL`,
      soapA,
      icdCode: 'J00',
      icdName: soapA,
      prescription: [],
      doctorFee: 35000,
      medicalSupportFee: 15000,
      adminFee: 0,
      notes: 'Pemeriksaan rawat jalan luar gedung (Home Care)',
      branchId: 'BR-01'
    };

    onSaveMobileRME(newRecord);
    alert(`Rekam Medis Home Visit untuk ${selectedPatient.name} berhasil disimpan!`);
    setSoapS('');
  };

  const filteredMeds = medicines.filter(
    (m) =>
      m.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
      m.barcode.includes(stockSearch)
  );

  return (
    <div className="max-w-md mx-auto bg-slate-100 min-h-[780px] rounded-3xl border-4 border-slate-800 shadow-2xl overflow-hidden flex flex-col font-sans relative">
      {/* Mobile Smartphone Header */}
      <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between shadow-md shrink-0">
        <button
          onClick={onCloseMobileMode}
          className="flex items-center gap-1 text-xs text-sky-400 font-bold hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>

        <div className="text-center">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
            Aplikasi Lapangan & Mobile
          </span>
          <span className="font-extrabold text-xs text-white flex items-center justify-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-sky-400" />
            Latisha Mobile
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-emerald-400 font-mono font-bold">ONLINE</span>
        </div>
      </div>

      {/* Staff ID & Live Opname Active Strip */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-900 to-indigo-900 text-white px-3.5 py-2 text-xs flex justify-between items-center border-b border-slate-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-sky-300" />
          <span className="font-bold truncate max-w-[190px] text-[11px]">{staffName}</span>
        </div>
        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded-full font-bold border border-emerald-500/30 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          Opname Live Aktif
        </span>
      </div>

      {/* Success Notification Banner */}
      {postingSuccessMessage && (
        <div className="bg-emerald-600 text-white p-3 text-xs font-bold flex items-center justify-between shadow-md animate-fade-in shrink-0">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 shrink-0" />
            <span>{postingSuccessMessage}</span>
          </div>
          <button onClick={() => setPostingSuccessMessage(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 5 Navigation Tabs */}
      <div className="grid grid-cols-5 bg-white border-b text-[10px] font-bold shrink-0">
        <button
          onClick={() => setMobileTab('stokopname')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
            mobileTab === 'stokopname'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/60'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardCheck className={`w-4 h-4 ${mobileTab === 'stokopname' ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span>Opname</span>
        </button>

        <button
          onClick={() => setMobileTab('cekstok')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
            mobileTab === 'cekstok'
              ? 'border-sky-600 text-sky-700 bg-sky-50/60'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className={`w-4 h-4 ${mobileTab === 'cekstok' ? 'text-sky-600' : 'text-slate-400'}`} />
          <span>Cek Stok</span>
        </button>

        <button
          onClick={() => setMobileTab('absensi')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
            mobileTab === 'absensi'
              ? 'border-teal-600 text-teal-700 bg-teal-50/60'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck className={`w-4 h-4 ${mobileTab === 'absensi' ? 'text-teal-600' : 'text-slate-400'}`} />
          <span>Absensi</span>
        </button>

        <button
          onClick={() => setMobileTab('homevisit')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
            mobileTab === 'homevisit'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/60'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <HeartPulse className={`w-4 h-4 ${mobileTab === 'homevisit' ? 'text-indigo-600' : 'text-slate-400'}`} />
          <span>Home Care</span>
        </button>

        <button
          onClick={() => setMobileTab('antrean')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
            mobileTab === 'antrean'
              ? 'border-amber-600 text-amber-700 bg-amber-50/60'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Volume2 className={`w-4 h-4 ${mobileTab === 'antrean' ? 'text-amber-600' : 'text-slate-400'}`} />
          <span>Panggil</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs custom-scrollbar">
        {/* ================= TAB 1: STOK OPNAME (LIVE) ================= */}
        {mobileTab === 'stokopname' && (
          <div className="space-y-3">
            {/* Alarm Peringatan Akun User: Belum Melakukan Stok Opname 4 Bulan Terakhir */}
            {!userOpnameStatus.hasOpnameInLast4Months && (
              <div className="p-3 bg-gradient-to-r from-rose-600 to-red-700 text-white rounded-2xl border-2 border-rose-300 shadow-md flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-200 shrink-0 mt-0.5 animate-bounce" />
                <div>
                  <p className="font-black text-[11px] uppercase tracking-wide">
                    PERINGATAN ! ANDA BELUM MELAKUKAN STOK OPNAME. SEGERA LAKUKAN OPNAME !!!
                  </p>
                  <p className="text-[10px] text-rose-100 mt-0.5">
                    Akun <strong>{staffName}</strong> belum melakukan stok opname pada 4 bulan terakhir. Terdapat <strong>{opnameMetrics.belumOpnameCount} obat Belum Opname</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Real-Time Multi-User In-Progress Counting Banner (Anti Double-Opname) */}
            {opnameMetrics.beingCountedByOtherCount > 0 && (
              <div className="p-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl border-2 border-amber-200 shadow-md space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Radio className="w-4 h-4 text-white shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <p className="font-black text-[11px] uppercase">
                        LIVE LOCK: {opnameMetrics.beingCountedByOtherCount} Obat Sedang Dihitung Petugas Lain
                      </p>
                      <p className="text-[10px] text-amber-50">
                        Item yang ditandai sedang diinput oleh rekan kerja lain (belum klik Terapkan Hasil Opname). Dikunci otomatis agar tidak double opname.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setStatusFilter(
                      statusFilter === 'BEING_COUNTED_OTHER' ? 'ALL' : 'BEING_COUNTED_OTHER'
                    )
                  }
                  className="w-full py-1.5 bg-white text-amber-900 rounded-xl font-black text-[10px] shadow-xs"
                >
                  {statusFilter === 'BEING_COUNTED_OTHER'
                    ? 'Tampilkan Semua Obat'
                    : `Filter Obat Sedang Dihitung Petugas Lain (${opnameMetrics.beingCountedByOtherCount})`}
                </button>
              </div>
            )}

            {/* Live Counter Info Pill */}
            <div className="p-3 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-900 text-white rounded-2xl shadow-sm border border-emerald-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Stok Opname Tanpa Tutup Apotek</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-2 py-0.5 rounded-full">
                  Live Sync
                </span>
              </div>
              <p className="text-[10px] text-slate-300 leading-relaxed">
                Kasir tetap bebas bertransaksi. Penjualan aktif otomatis dihitung secara *real-time* sehingga stok akhir apotek tetap akurat 100%.
              </p>

              {/* Opname Mini KPIs */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-800 text-center font-mono">
                <div className="bg-slate-800/70 p-1.5 rounded-xl">
                  <span className="text-[9px] text-slate-400 block font-sans">Sudah Opname</span>
                  <strong className="text-white text-xs">{opnameMetrics.sudahOpnameCount}/{opnameMetrics.totalItems}</strong>
                </div>
                <div className="bg-slate-800/70 p-1.5 rounded-xl">
                  <span className="text-[9px] text-emerald-400 block font-sans">Cocok</span>
                  <strong className="text-emerald-400 text-xs">{opnameMetrics.matchCount}</strong>
                </div>
                <div className="bg-slate-800/70 p-1.5 rounded-xl">
                  <span className="text-[9px] text-rose-400 block font-sans">Kurang</span>
                  <strong className="text-rose-400 text-xs">{opnameMetrics.deficitCount}</strong>
                </div>
                <div className="bg-slate-800/70 p-1.5 rounded-xl">
                  <span className="text-[9px] text-sky-400 block font-sans">Lebih</span>
                  <strong className="text-sky-400 text-xs">{opnameMetrics.surplusCount}</strong>
                </div>
              </div>
            </div>

            {/* Search & Rack Filter Row */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari obat / barcode rak..."
                  value={opnameSearch}
                  onChange={(e) => setOpnameSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-xs outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                />
              </div>

              <div className="flex gap-2 items-center">
                <select
                  value={selectedRack}
                  onChange={(e) => setSelectedRack(e.target.value)}
                  className="flex-1 p-2 bg-white border border-slate-200 rounded-xl font-bold text-[11px] text-slate-700 outline-none shadow-xs"
                >
                  <option value="ALL">Semua Lokasi Rak ({availableRacks.length})</option>
                  {availableRacks.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-36 p-2 bg-white border border-slate-200 rounded-xl font-bold text-[11px] text-slate-700 outline-none shadow-xs"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="UNCOUNTED">Belum Opname ({opnameMetrics.belumOpnameCount})</option>
                  <option value="COUNTED">Sudah Opname ({opnameMetrics.sudahOpnameCount})</option>
                  <option value="DIFF">Ada Selisih</option>
                  <option value="BEING_COUNTED_OTHER">
                    Sedang Dihitung Petugas Lain ({opnameMetrics.beingCountedByOtherCount})
                  </option>
                </select>
              </div>
            </div>

            {/* List of Medicines for Stock Opname */}
            <div className="space-y-2.5 pb-20">
              {filteredOpnameItems.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
                  <Boxes className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-600 text-xs">Tidak ada obat yang cocok dengan filter.</p>
                  <button
                    onClick={() => {
                      setOpnameSearch('');
                      setSelectedRack('ALL');
                      setStatusFilter('ALL');
                    }}
                    className="text-[11px] text-emerald-600 font-bold underline"
                  >
                    Reset Filter
                  </button>
                </div>
              ) : (
                filteredOpnameItems.map((med) => {
                  const isCounted = med.hasCounted;
                  const diff = med.difference;
                  const remoteActs = remoteOpnameActivities[med.id] || [];
                  const isBeingCountedByOther = remoteActs.length > 0;
                  const isLockedByOther = isBeingCountedByOther && !overriddenLocks[med.id];

                  return (
                    <div
                      key={med.id}
                      className={`p-3 rounded-2xl border transition shadow-xs space-y-2.5 ${
                        isBeingCountedByOther
                          ? 'bg-amber-50/70 border-amber-400 ring-1 ring-amber-300'
                          : !isCounted
                          ? 'bg-white border-slate-200'
                          : diff === 0
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : diff < 0
                          ? 'bg-rose-50/40 border-rose-200'
                          : 'bg-sky-50/40 border-sky-200'
                      }`}
                    >
                      {/* Real-time Warning Banner if another staff is currently counting this item */}
                      {isBeingCountedByOther && (
                        <div className="p-2 rounded-xl bg-amber-100 border border-amber-300 text-amber-950 text-[10px] space-y-1">
                          {remoteActs.map((act) => (
                            <div key={`${act.sessionId}-${act.medicineId}`} className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-black text-amber-900 flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping" />
                                  <Lock className="w-3 h-3 text-amber-700" />
                                  <span>Sedang dihitung oleh {act.staffName}</span>
                                </div>
                                <div className="text-[9px] text-amber-800 pl-3.5">
                                  Belum klik &ldquo;Terapkan Hasil Opname&rdquo;
                                  {act.statusText ? ` · ${act.statusText}` : ''}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setOverriddenLocks((prev) => ({
                                    ...prev,
                                    [med.id]: !prev[med.id]
                                  }))
                                }
                                className="px-2 py-0.5 bg-white border border-amber-300 rounded-md font-extrabold text-[9px] text-amber-900 shrink-0"
                              >
                                {isLockedByOther ? 'Ambil Alih' : 'Kunci'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Medicine Info Header */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-0.5">
                          <h4 className="font-extrabold text-slate-900 text-xs leading-snug">
                            {med.name}
                          </h4>
                          <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-1.5 gap-y-0.5 items-center">
                            <span className="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.2 rounded font-mono">
                              {med.rack || 'Tanpa Rak'}
                            </span>
                            {med.batchEntries.length > 1 ? (
                              <span className="bg-sky-100 text-sky-800 px-1.5 py-0.2 rounded font-bold">
                                {med.batchEntries.length} Batch (FEFO)
                              </span>
                            ) : (
                              <span>FEFO: {med.previewPrimaryBatchNo}</span>
                            )}
                            {med.previewPrimaryExpDate && (
                              <span>· ED {med.previewPrimaryExpDate}</span>
                            )}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {!isCounted ? (
                            med.opnamedInLast4Months ? (
                              <span className="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                Sudah Opname
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                                Belum Opname
                              </span>
                            )
                          ) : diff === 0 ? (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Cocok
                            </span>
                          ) : diff < 0 ? (
                            <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 font-mono">
                              <Minus className="w-3 h-3" />
                              {diff} {med.unit}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 font-mono">
                              <Plus className="w-3 h-3" />
                              +{diff} {med.unit}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Live Counter Sales Warning */}
                      {med.liveSales > 0 && (
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[10px] font-bold flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <RefreshCw className="w-3 h-3 text-amber-600 animate-spin" />
                            <span>Terjual di Kasir POS Sesi Ini:</span>
                          </span>
                          <span className="font-mono bg-amber-200/80 px-1.5 py-0.2 rounded">
                            +{med.liveSales} {med.unit}
                          </span>
                        </div>
                      )}

                      {/* Stock Comparison Summary Grid */}
                      <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50/80 rounded-xl border border-slate-200/60 font-mono text-[11px]">
                        <div>
                          <span className="text-[9px] text-slate-500 font-sans block">Total Stok Sistem:</span>
                          <strong className="text-slate-800">{med.systemStock} {med.unit}</strong>
                          {med.ratio > 1 && (
                            <span className="text-[9px] text-slate-500 block">
                              ({Math.floor(med.systemStock / med.ratio)} {med.satuanBesar} + {med.systemStock % med.ratio} {med.satuanKecil})
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 font-sans block">Total Fisik Dihitung:</span>
                          <strong className={isCounted ? (diff === 0 ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-400'}>
                            {isCounted ? `${med.physicalStock} ${med.unit}` : 'Belum diisi'}
                          </strong>
                          {med.hasBatchModified && (
                            <span className="text-[9px] text-sky-700 font-sans block font-bold">
                              FEFO Utama: {med.previewPrimaryBatchNo}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Multi-Batch & ED Per-Batch Cards */}
                      <div className="space-y-2">
                        {med.batchEntries.map((batch, bIdx) => {
                          const isBatchCounted = batch.physicalStock !== '';
                          const batchPhysNum = isBatchCounted
                            ? parseFloat(batch.physicalStock) || 0
                            : batch.systemStock;

                          return (
                            <div
                              key={batch.id}
                              className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-extrabold text-slate-700 uppercase">
                                  Batch #{bIdx + 1}{' '}
                                  <span className="font-mono text-slate-500 font-normal">
                                    (Sis: {batch.systemStock} {med.unit})
                                  </span>
                                </span>
                                {med.batchEntries.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBatchRow(med.id, batch.id)}
                                    className="text-rose-500 hover:text-rose-700 p-1 rounded"
                                    title="Hapus baris batch"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* Editable Batch No & ED */}
                              <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <label className="text-[9px] font-bold text-slate-500 block mb-0.5">
                                    No. Batch
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="No. Batch..."
                                    value={batch.batchNo}
                                    onChange={(e) =>
                                      handleBatchFieldChange(med.id, batch.id, 'batchNo', e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-sky-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-slate-500 flex items-center gap-1 mb-0.5">
                                    <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                    <span>Expired Date</span>
                                  </label>
                                  <input
                                    type="date"
                                    value={batch.expDate}
                                    onChange={(e) =>
                                      handleBatchFieldChange(med.id, batch.id, 'expDate', e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-sky-500"
                                  />
                                </div>
                              </div>

                                  {/* Physical Count Input Controls for this Batch */}
                              {med.ratio > 1 ? (
                                <div className="space-y-1">
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <div>
                                      <label className="text-[9px] font-bold text-slate-600 block mb-0.5">
                                        {med.satuanBesar} (Utuh)
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        disabled={isLockedByOther}
                                        onFocus={() => setFocusedMedicineId(med.id)}
                                        onBlur={() =>
                                          setFocusedMedicineId((prev) => (prev === med.id ? null : prev))
                                        }
                                        placeholder={Math.floor(batch.systemStock / med.ratio).toString()}
                                        value={batch.physicalBesar ?? ''}
                                        onChange={(e) =>
                                          handleBatchDualCountChange(
                                            med.id,
                                            batch.id,
                                            e.target.value,
                                            batch.physicalKecil ?? '',
                                            med.ratio
                                          )
                                        }
                                        className="w-full p-1.5 bg-white disabled:bg-slate-100 disabled:text-slate-400 border border-slate-300 rounded-lg font-mono font-extrabold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 text-center"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] font-bold text-slate-600 block mb-0.5">
                                        {med.satuanKecil} (Eceran)
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        disabled={isLockedByOther}
                                        onFocus={() => setFocusedMedicineId(med.id)}
                                        onBlur={() =>
                                          setFocusedMedicineId((prev) => (prev === med.id ? null : prev))
                                        }
                                        placeholder={(batch.systemStock % med.ratio).toString()}
                                        value={batch.physicalKecil ?? ''}
                                        onChange={(e) =>
                                          handleBatchDualCountChange(
                                            med.id,
                                            batch.id,
                                            batch.physicalBesar ?? '',
                                            e.target.value,
                                            med.ratio
                                          )
                                        }
                                        className="w-full p-1.5 bg-white disabled:bg-slate-100 disabled:text-slate-400 border border-slate-300 rounded-lg font-mono font-extrabold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 text-center"
                                      />
                                    </div>
                                  </div>
                                  <div className="text-[9px] text-slate-500 font-mono text-center">
                                    1 {med.satuanBesar} = {med.ratio} {med.satuanKecil}
                                    {isBatchCounted && ` ➔ ${batchPhysNum} ${med.unit}`}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    disabled={isLockedByOther}
                                    onFocus={() => setFocusedMedicineId(med.id)}
                                    onBlur={() =>
                                      setFocusedMedicineId((prev) => (prev === med.id ? null : prev))
                                    }
                                    placeholder={`Fisik (${batch.systemStock})...`}
                                    value={batch.physicalStock}
                                    onChange={(e) =>
                                      handleBatchCountChange(med.id, batch.id, e.target.value)
                                    }
                                    className="flex-1 p-1.5 bg-white disabled:bg-slate-100 disabled:text-slate-400 border border-slate-300 rounded-lg font-mono font-extrabold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={isLockedByOther}
                                      onClick={() =>
                                        handleBatchStepCount(med.id, batch.id, -1, batch.systemStock)
                                      }
                                      className="w-7 h-7 flex items-center justify-center bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-800 rounded-lg font-bold transition"
                                    >
                                      -1
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isLockedByOther}
                                      onClick={() =>
                                        handleBatchStepCount(med.id, batch.id, 1, batch.systemStock)
                                      }
                                      className="w-7 h-7 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg font-bold transition"
                                    >
                                      +1
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isLockedByOther}
                                      onClick={() =>
                                        handleBatchStepCount(med.id, batch.id, 5, batch.systemStock)
                                      }
                                      className="px-2 h-7 flex items-center justify-center bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-lg font-bold text-[10px] transition"
                                    >
                                      +5
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Action Shortcuts: + Batch / ED, Match with system, Reset */}
                        <div className="flex items-center justify-between text-[10px] pt-0.5 flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              disabled={isLockedByOther}
                              onClick={() => handleAddBatchRow(med.id)}
                              className="flex items-center gap-1 text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md font-bold hover:bg-sky-100 disabled:opacity-40"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Batch / ED</span>
                            </button>
                            <button
                              type="button"
                              disabled={isLockedByOther}
                              onClick={() => handleMatchWithSystem(med)}
                              className="flex items-center gap-1 text-emerald-700 font-bold hover:underline disabled:opacity-40"
                            >
                              <CheckCheck className="w-3 h-3" />
                              <span>Sesuai ({med.systemStock})</span>
                            </button>
                          </div>

                          {isCounted && (
                            <button
                              type="button"
                              onClick={() => handleResetCount(med.id)}
                              className="flex items-center gap-1 text-slate-400 hover:text-rose-600 font-medium"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Fixed Action Bar for Mobile Posting */}
            <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-xl flex items-center justify-between gap-3 z-30">
              <div className="font-mono text-[11px]">
                <div className="text-[10px] text-slate-500 font-sans">Total Dihitung:</div>
                <strong className="text-slate-900 text-xs">
                  {opnameMetrics.countedItems} / {opnameMetrics.totalItems} Obat
                </strong>
                {opnameMetrics.diffCount > 0 && (
                  <span className="text-rose-600 text-[10px] font-bold block">
                    Selisih: {opnameMetrics.diffCount} item
                  </span>
                )}
              </div>

              <button
                onClick={() => setShowPostingConfirmModal(true)}
                disabled={opnameMetrics.countedItems === 0}
                className={`py-2.5 px-4 rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-md transition ${
                  opnameMetrics.countedItems > 0
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white hover:from-emerald-700 hover:to-teal-800'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>Posting Hasil Opname</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= TAB 2: CEK STOK OBAT ================= */}
        {mobileTab === 'cekstok' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Cari obat di apotek..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border rounded-xl bg-white font-semibold outline-none"
              />
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
              {filteredMeds.map((m) => (
                <div key={m.id} className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <div className="flex justify-between items-start">
                    <strong className="text-slate-900">{m.name}</strong>
                    <span
                      className={`font-black font-mono px-2 py-0.5 rounded-full text-[10px] ${
                        m.stock <= m.minStock ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {m.stock} {m.unit}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Lokasi: <span className="font-bold text-slate-700">{m.rack}</span> · Batch: {m.batchNo}
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t text-[11px] font-mono">
                    <span className="text-slate-500">Jual Reguler:</span>
                    <strong className="text-sky-800">Rp {m.sellPrice.toLocaleString('id-ID')}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 3: HOME CARE / VISIT ================= */}
        {mobileTab === 'homevisit' && (
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">Pilih Pasien Kunjungan Rumah</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter cepat Nama / No. RM / NIK..."
                  value={searchPatient}
                  onChange={(e) => setSearchPatient(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <select
                value={selectedPatient?.id || ''}
                onChange={(e) => {
                  const p = homeVisitPatientOptions.find((item) => item.id === e.target.value);
                  if (p) setSelectedPatient(p);
                }}
                className="w-full p-2.5 border rounded-xl font-bold bg-white outline-none"
              >
                {homeVisitPatientOptions.map((p) => (
                  <option key={p.dbId || p.id} value={p.id}>
                    {p.name} ({p.id} - {p.gender})
                  </option>
                ))}
              </select>
            </div>

            {selectedPatient && (
              <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <div className="font-extrabold text-slate-900 text-sm">{selectedPatient.name}</div>
                <div className="text-slate-500 text-[11px] font-mono">
                  NIK: {selectedPatient.nik} · {selectedPatient.phone}
                </div>
                <div className="text-slate-600 text-[11px]">{selectedPatient.address}</div>

                {selectedPatient.allergy !== 'Tidak Ada' && (
                  <div className="mt-1 p-1.5 bg-rose-50 border border-rose-200 text-rose-800 font-bold text-[10px] rounded-lg">
                    Alergi: {selectedPatient.allergy}
                  </div>
                )}
              </div>
            )}

            {/* Vital Signs Grid */}
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <span className="font-black text-slate-700 text-[10px] uppercase">
                Input Tanda Vital Lapangan
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold">TD (mmHg)</label>
                  <input
                    type="text"
                    value={td}
                    onChange={(e) => setTd(e.target.value)}
                    className="w-full p-2 border rounded-xl font-mono font-bold bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold">Suhu (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={suhu}
                    onChange={(e) => setSuhu(e.target.value)}
                    className="w-full p-2 border rounded-xl font-mono font-bold bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold">Nadi (bpm)</label>
                  <input
                    type="number"
                    value={nadi}
                    onChange={(e) => setNadi(e.target.value)}
                    className="w-full p-2 border rounded-xl font-mono font-bold bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold">Gula Darah GDS (mg/dL)</label>
                  <input
                    type="number"
                    value={gds}
                    onChange={(e) => setGds(e.target.value)}
                    className="w-full p-2 border rounded-xl font-mono font-bold bg-slate-50"
                  />
                </div>
              </div>
            </div>

            {/* Anamnesis & Diagnosis */}
            <div className="space-y-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Keluhan Pasien</label>
                <textarea
                  rows={2}
                  placeholder="Kondisi pasien di rumah..."
                  value={soapS}
                  onChange={(e) => setSoapS(e.target.value)}
                  className="w-full p-2.5 border rounded-xl bg-white outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Diagnosis Lapangan</label>
                <input
                  type="text"
                  value={soapA}
                  onChange={(e) => setSoapA(e.target.value)}
                  className="w-full p-2.5 border rounded-xl font-bold bg-white"
                />
              </div>
            </div>

            <button
              onClick={handleSaveHomeVisit}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-sky-600 text-white font-extrabold rounded-xl shadow-md uppercase tracking-wider text-xs flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Simpan RME Kunjungan Rumah</span>
            </button>
          </div>
        )}

        {/* ================= TAB 4: PANGGIL ANTREAN ================= */}
        {mobileTab === 'antrean' && (
          <div className="text-center space-y-6 py-6">
            <div className="p-6 bg-slate-900 text-white rounded-3xl space-y-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold">Antrean Sekarang</span>
              <div className="text-6xl font-black font-mono text-amber-400">
                {currentQueuePatient ? currentQueuePatient.nomor : '---'}
              </div>
              <div className="text-base font-bold text-white">
                {currentQueuePatient ? currentQueuePatient.name : 'Antrean Kosong'}
              </div>
            </div>

            <button
              onClick={() => {
                if (currentQueuePatient) {
                  announceQueueVoice(currentQueuePatient.nomor, currentQueuePatient.name, 'Ruang Periksa');
                }
              }}
              disabled={!currentQueuePatient}
              className="w-full py-4 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-2xl shadow-lg transition text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <Volume2 className="w-5 h-5" />
              <span>Panggil Suara dari HP</span>
            </button>

            <div className="text-left bg-white p-4 rounded-2xl border space-y-2 text-xs">
              <span className="font-bold text-slate-700 uppercase text-[10px]">Daftar Antrean Hari Ini:</span>
              <div className="space-y-1.5">
                {queue.slice(0, 5).map((q) => (
                  <div key={q.nomor} className="flex justify-between p-2 bg-slate-50 rounded-xl">
                    <span className="font-mono font-bold text-sky-800">{q.nomor} — {q.name}</span>
                    <span className="text-[10px] font-bold text-slate-500">{q.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 5: ABSENSI, CUTI & LEMBUR MINGGU ================= */}
        {mobileTab === 'absensi' && resolvedMobileStaff && (
          <div className="space-y-3">
            {/* Notice */}
            {mobileAttendanceNotice && (
              <div
                className={`p-3 rounded-2xl text-[11px] font-bold flex items-center justify-between gap-2 border ${
                  mobileAttendanceNoticeType === 'error'
                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <span>{mobileAttendanceNotice}</span>
                <button type="button" onClick={() => setMobileAttendanceNotice(null)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Policy Card */}
            <div
              className={`p-3 rounded-2xl border text-[11px] flex items-start gap-2.5 ${
                isTodaySundayMobile
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-sky-50 border-sky-200 text-sky-900'
              }`}
            >
              <Flame className={`w-4 h-4 shrink-0 mt-0.5 ${isTodaySundayMobile ? 'text-amber-600' : 'text-sky-600'}`} />
              <div>
                <p className="font-extrabold">
                  {todayDayNameMobile}, {formatIsoToIdDate(todayIsoMobile)} •{' '}
                  {isTodaySundayMobile ? 'Lembur Hari Minggu Aktif' : 'Hari Kerja Reguler (Non-Lembur)'}
                </p>
                <p className="text-[10px] opacity-85 mt-0.5 leading-relaxed">
                  {isTodaySundayMobile
                    ? 'Check-out melewati akhir shift atau hadir di luar jadwal hari Minggu otomatis tercatat sebagai Lembur Minggu.'
                    : 'Status dan perhitungan lembur hanya berlaku pada hari Minggu. Senin–Sabtu dicatat sebagai Hadir atau Cuti.'}
                </p>
              </div>
            </div>

            {/* Staff Selector (APJ / Owner can switch staff; regular staff locked to own account) */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase text-slate-400">Petugas Aktif</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {resolvedMobileStaff.role}
                </span>
              </div>

              {isOwnerAdmin && staffList.length > 1 ? (
                <select
                  value={resolvedMobileStaff.id}
                  onChange={(e) => setMobileAttendanceStaffId(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm font-black text-slate-900">{resolvedMobileStaff.name}</div>
              )}

              {/* Matched Shift Info */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-teal-600" />
                  <span>Shift Hari Ini:</span>
                </div>
                {todayMatchedShiftMobile ? (
                  <span className="font-mono font-bold text-teal-800">
                    {todayMatchedShiftMobile.startTime}–{todayMatchedShiftMobile.endTime} ({todayMatchedShiftMobile.serviceUnit})
                  </span>
                ) : (
                  <span className="font-bold text-amber-700">
                    {isTodaySundayMobile ? 'Di Luar Jadwal (Lembur Minggu)' : 'Tidak Ada Shift Terjadwal'}
                  </span>
                )}
              </div>

              {/* Quick Check-In / Check-Out Action */}
              <div className="pt-1">
                {!todayStaffRecordMobile ? (
                  <button
                    type="button"
                    onClick={handleMobileCheckIn}
                    disabled={isVerifyingMobileLocation}
                    className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-extrabold rounded-xl shadow-md flex items-center justify-center gap-2 text-xs transition active:scale-95"
                  >
                    {isVerifyingMobileLocation ? (
                      <MapPin className="w-4 h-4 animate-pulse" />
                    ) : (
                      <LogIn className="w-4 h-4" />
                    )}
                    <span>
                      {isVerifyingMobileLocation
                        ? 'Memverifikasi Lokasi GPS...'
                        : `Check-In Sekarang (${getCurrentTimeHHMM()} WIB • GPS ≤ 50m)`}
                    </span>
                  </button>
                ) : todayStaffRecordMobile.status === 'Cuti' ? (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-center text-indigo-800 font-bold text-[11px]">
                    Status Hari Ini: Cuti ({todayStaffRecordMobile.approvalStatus})
                  </div>
                ) : !todayStaffRecordMobile.checkOutTime ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold">
                      <span>Masuk: {todayStaffRecordMobile.checkInTime} WIB</span>
                      <span>{todayStaffRecordMobile.status}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleMobileCheckOut}
                      className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl shadow-md flex items-center justify-center gap-2 text-xs transition active:scale-95"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Check-Out Sekarang ({getCurrentTimeHHMM()} WIB)</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 text-[11px] text-emerald-900">
                    <div className="flex items-center justify-between font-extrabold">
                      <span>Absensi Hari Ini Selesai</span>
                      <span className="font-mono">
                        {todayStaffRecordMobile.checkInTime} – {todayStaffRecordMobile.checkOutTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span>Durasi Kerja: {formatMinutesDuration(todayStaffRecordMobile.workDurationMinutes)}</span>
                      {todayStaffRecordMobile.isSunday && todayStaffRecordMobile.overtimeMinutes > 0 && (
                        <span className="font-bold text-amber-700">
                          Lembur: +{formatMinutesDuration(todayStaffRecordMobile.overtimeMinutes)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Buttons for Cuti & Sunday Overtime */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMobileRequestMode(mobileRequestMode === 'cuti' ? 'none' : 'cuti');
                    setMobileReqDate(todayIsoMobile);
                  }}
                  className={`py-2 px-2.5 rounded-xl font-bold text-[11px] border flex items-center justify-center gap-1.5 transition ${
                    mobileRequestMode === 'cuti'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  }`}
                >
                  <CalendarOff className="w-3.5 h-3.5" />
                  <span>Ajukan Cuti</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileRequestMode(mobileRequestMode === 'lembur' ? 'none' : 'lembur');
                    // Default to today if Sunday, else next Sunday
                    if (isSundayDate(todayIsoMobile)) {
                      setMobileReqDate(todayIsoMobile);
                    } else {
                      const d = new Date();
                      const daysUntilSun = (7 - d.getDay()) % 7 || 7;
                      d.setDate(d.getDate() + daysUntilSun);
                      setMobileReqDate(getTodayIsoLocal(d));
                    }
                  }}
                  className={`py-2 px-2.5 rounded-xl font-bold text-[11px] border flex items-center justify-center gap-1.5 transition ${
                    mobileRequestMode === 'lembur'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Lembur Minggu</span>
                </button>
              </div>
            </div>

            {/* Collapsible Request Form (Cuti / Lembur Minggu) */}
            {mobileRequestMode !== 'none' && (
              <form
                onSubmit={handleSubmitMobileRequest}
                className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2.5 shadow-sm"
              >
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="font-extrabold text-slate-800 text-xs">
                    {mobileRequestMode === 'cuti' ? 'Form Pengajuan Cuti' : 'Form Lembur Khusus Hari Minggu'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileRequestMode('none')}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    Tanggal ({getScheduleDayFromIso(mobileReqDate)})
                  </label>
                  <input
                    type="date"
                    required
                    value={mobileReqDate}
                    onChange={(e) => setMobileReqDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  />
                  {mobileRequestMode === 'lembur' && !isSundayDate(mobileReqDate) && (
                    <p className="text-[10px] text-rose-600 font-bold mt-1">
                      Tanggal terpilih bukan hari Minggu. Lembur hanya diizinkan pada hari Minggu.
                    </p>
                  )}
                </div>

                {mobileRequestMode === 'lembur' && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Kategori Lembur Minggu</label>
                      <select
                        value={mobileReqOvertimeType}
                        onChange={(e) => setMobileReqOvertimeType(e.target.value as SundayOvertimeType)}
                        className="w-full p-2 bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold text-amber-900"
                      >
                        <option value="Lembur Terencana">Lembur Terencana</option>
                        <option value="Lembur di Luar Jadwal">Lembur di Luar Jadwal</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">Jam Mulai</label>
                        <input
                          type="time"
                          required
                          value={mobileReqStart}
                          onChange={(e) => setMobileReqStart(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">Jam Selesai</label>
                        <input
                          type="time"
                          required
                          value={mobileReqEnd}
                          onChange={(e) => setMobileReqEnd(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    {mobileRequestMode === 'cuti' ? 'Alasan Cuti / Izin' : 'Keterangan Tugas Lembur'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      mobileRequestMode === 'cuti'
                        ? 'Contoh: Cuti tahunan / urusan keluarga'
                        : 'Contoh: Stok opname / piket pelayanan Minggu'
                    }
                    value={mobileReqReason}
                    onChange={(e) => setMobileReqReason(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={mobileRequestMode === 'lembur' && !isSundayDate(mobileReqDate)}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs transition"
                >
                  Simpan & Kirim {isOwnerAdmin ? '(Langsung Disetujui)' : 'ke APJ / Owner'}
                </button>
              </form>
            )}

            {/* Recent Mobile Attendance History */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase text-slate-500">Riwayat Absensi Terakhir</span>
                <span className="text-[10px] font-bold text-slate-400">{recentStaffRecordsMobile.length} catatan</span>
              </div>

              {recentStaffRecordsMobile.length === 0 ? (
                <p className="text-center py-4 text-[11px] text-slate-400">
                  Belum ada riwayat kehadiran tercatat.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {recentStaffRecordsMobile.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 text-[11px]">
                            {rec.dayName}, {formatIsoToIdDate(rec.date)}
                          </span>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                              rec.status === 'Lembur'
                                ? 'bg-amber-100 text-amber-800'
                                : rec.status === 'Cuti'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {rec.status === 'Cuti'
                            ? rec.leaveReason || 'Cuti / Izin'
                            : `${rec.checkInTime || '--:--'} – ${rec.checkOutTime || 'Aktif'}${
                                rec.isSunday && rec.overtimeMinutes > 0
                                  ? ` • ${rec.overtimeType} (+${formatMinutesDuration(rec.overtimeMinutes)})`
                                  : ''
                              }`}
                        </div>
                      </div>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          rec.approvalStatus === 'Disetujui'
                            ? 'bg-emerald-100 text-emerald-700'
                            : rec.approvalStatus === 'Ditolak'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {rec.approvalStatus === 'Menunggu Persetujuan' ? 'Menunggu' : rec.approvalStatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Posting Stock Opname */}
      {showPostingConfirmModal && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-4.5 space-y-3.5 shadow-2xl animate-fade-in border border-slate-200">
            <div className="flex items-center gap-2.5 text-emerald-800 font-extrabold text-sm border-b pb-2">
              <ClipboardCheck className="w-5 h-5 text-emerald-600" />
              <span>Konfirmasi Posting Stok Opname</span>
            </div>

            <p className="text-slate-600 text-[11px] leading-relaxed">
              Anda akan memposting hasil hitung fisik untuk{' '}
              <strong className="text-slate-900">{opnameMetrics.countedItems} item obat</strong>.
              Sistem akan otomatis memperbarui master stok dan mencatat kartu mutasi stok (FEFO).
            </p>

            <div className="p-3 bg-slate-50 rounded-2xl border space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Item Cocok:</span>
                <strong className="text-emerald-700">{opnameMetrics.matchCount} item</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Item Selisih Kurang:</span>
                <strong className="text-rose-700">{opnameMetrics.deficitCount} item</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Item Selisih Lebih:</span>
                <strong className="text-sky-700">{opnameMetrics.surplusCount} item</strong>
              </div>
              <div className="flex justify-between pt-1 border-t text-xs">
                <span className="text-slate-600 font-bold">Nilai Selisih HPP:</span>
                <strong className={opnameMetrics.totalDiffHpp < 0 ? 'text-rose-700' : 'text-emerald-700'}>
                  Rp {Math.round(opnameMetrics.totalDiffHpp).toLocaleString('id-ID')}
                </strong>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowPostingConfirmModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Batal
              </button>
              <button
                onClick={handleExecutePostingOpname}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Posting Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
