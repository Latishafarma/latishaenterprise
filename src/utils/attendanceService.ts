import {
  DutySchedule,
  ScheduleDay,
  Staff,
  StaffAttendanceRecord,
  AttendanceStatus,
  SundayOvertimeType,
  AttendanceApprovalStatus,
  normalizeStaffRole
} from '../types';
import { demoGetItem, demoSetItem, isDemoMode } from './demoSandbox';
import { getSupabaseClient, getSupabaseConfig } from './supabaseClient';

export const ATTENDANCE_STORAGE_KEY = 'latisha_staff_attendance';
export const ATTENDANCE_PENDING_OPS_KEY = 'latisha_staff_attendance_pending_ops';
export const ATTENDANCE_TABLE_STORAGE_KEY = 'latisha_supabase_attendance_table';
export const DEFAULT_ATTENDANCE_TABLE = 'staff_attendance';
export const ATTENDANCE_UPDATED_EVENT = 'latisha_attendance_updated';

const missingAttendanceTables = new Set<string>();

export const getAttendanceTableName = (): string => {
  if (typeof window === 'undefined') return DEFAULT_ATTENDANCE_TABLE;
  try {
    const saved = localStorage.getItem(ATTENDANCE_TABLE_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  return DEFAULT_ATTENDANCE_TABLE;
};

export const setAttendanceTableName = (tableName: string): string => {
  const clean = tableName.trim() || DEFAULT_ATTENDANCE_TABLE;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(ATTENDANCE_TABLE_STORAGE_KEY, clean);
    } catch {}
  }
  missingAttendanceTables.delete(clean);
  return clean;
};

export const SUPABASE_ATTENDANCE_SQL_SCHEMA = `-- SKEMA RINGAN TABEL KEHADIRAN, CUTI & LEMBUR KHUSUS HARI MINGGU
-- Apotek & Klinik Latisha Farma (Terindeks pada tanggal & pegawai agar tetap cepat)
-- Jalankan di SQL Editor Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS staff_attendance (
  id VARCHAR(100) PRIMARY KEY,
  staff_id VARCHAR(60) NOT NULL,
  staff_name VARCHAR(200) NOT NULL,
  staff_role VARCHAR(80) NOT NULL,
  attendance_date DATE NOT NULL,
  day_name VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Hadir', -- 'Hadir' | 'Cuti' | 'Lembur'
  schedule_id VARCHAR(100),
  scheduled_start_time VARCHAR(10),
  scheduled_end_time VARCHAR(10),
  service_unit VARCHAR(100),
  check_in_time VARCHAR(10),
  check_out_time VARCHAR(10),
  work_duration_minutes INT NOT NULL DEFAULT 0,
  is_sunday BOOLEAN NOT NULL DEFAULT FALSE,
  overtime_minutes INT NOT NULL DEFAULT 0, -- Khusus hari Minggu (Senin-Sabtu selalu 0)
  overtime_type VARCHAR(40), -- 'Lembur Terencana' | 'Lembur di Luar Jadwal'
  overtime_source VARCHAR(30), -- 'auto-checkout' | 'planned-session' | 'unscheduled-session'
  leave_reason TEXT,
  approval_status VARCHAR(30) NOT NULL DEFAULT 'Disetujui', -- 'Disetujui' | 'Menunggu Persetujuan' | 'Ditolak'
  approved_by VARCHAR(200),
  approved_at TIMESTAMPTZ,
  source_mode VARCHAR(20) DEFAULT 'desktop', -- 'desktop' | 'mobile'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sunday_only_overtime CHECK (is_sunday = TRUE OR overtime_minutes = 0)
);

-- Index ringan untuk performa query rekap bulanan, filter tanggal & pegawai
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance (attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff ON staff_attendance (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_date ON staff_attendance (staff_id, attendance_date DESC);

-- Aktifkan Realtime secara aman (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'staff_attendance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE staff_attendance;
  END IF;
END $$;

-- Kebijakan RLS single-tenant internal Latisha Farma
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_staff_attendance" ON staff_attendance;
CREATE POLICY "allow_all_staff_attendance"
  ON staff_attendance
  FOR ALL
  USING (true)
  WITH CHECK (true);
`;

// ==================== DATE & TIME HELPERS ====================

export const getTodayIsoLocal = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getCurrentTimeHHMM = (date: Date = new Date()): string => {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const parseLocalIso = (iso: string): Date | null => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
};

export const getScheduleDayFromIso = (iso: string): ScheduleDay => {
  const parsed = parseLocalIso(iso) || new Date();
  const map: ScheduleDay[] = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return map[parsed.getDay()] || 'Senin';
};

export const isSundayDate = (iso: string): boolean => {
  const parsed = parseLocalIso(iso);
  return parsed ? parsed.getDay() === 0 : new Date().getDay() === 0;
};

export const formatIsoToIdDate = (iso: string): string => {
  const parsed = parseLocalIso(iso);
  if (!parsed) return iso;
  return parsed.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const parseTimeToMinutes = (hhmm?: string | null): number | null => {
  if (!hhmm) return null;
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
};

export const computeDurationMinutes = (startHHMM?: string, endHHMM?: string): number => {
  const start = parseTimeToMinutes(startHHMM);
  const end = parseTimeToMinutes(endHHMM);
  if (start === null || end === null) return 0;
  if (end >= start) return end - start;
  // Cross-midnight safeguard
  return 24 * 60 - start + end;
};

export const formatMinutesDuration = (totalMinutes: number): string => {
  const safe = Math.max(0, Math.round(totalMinutes || 0));
  if (safe === 0) return '0 mnt';
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hrs === 0) return `${mins} mnt`;
  if (mins === 0) return `${hrs} jam`;
  return `${hrs} jam ${mins} mnt`;
};

// ==================== SCHEDULE MATCHING & SUNDAY OVERTIME ENGINE ====================

export const findMatchingShiftForStaffOnDate = (
  staffId: string,
  isoDate: string,
  schedules: DutySchedule[]
): DutySchedule | null => {
  if (!staffId || !isoDate || !Array.isArray(schedules)) return null;
  const dayName = getScheduleDayFromIso(isoDate);

  // 1. Exact dated shift match has highest priority
  const datedMatch = schedules.find(
    (s) =>
      s.staffId === staffId &&
      s.status !== 'Cuti / Libur' &&
      s.scheduleDate &&
      s.scheduleDate.trim().slice(0, 10) === isoDate.slice(0, 10)
  );
  if (datedMatch) return datedMatch;

  // 2. Recurring weekly shift match for that day of week
  const recurringMatch = schedules.find(
    (s) =>
      s.staffId === staffId &&
      s.status !== 'Cuti / Libur' &&
      (!s.scheduleDate || !s.scheduleDate.trim()) &&
      s.day === dayName
  );
  return recurringMatch || null;
};

export interface EvaluatedAttendanceMetrics {
  isSunday: boolean;
  dayName: ScheduleDay;
  status: AttendanceStatus;
  workDurationMinutes: number;
  overtimeMinutes: number;
  overtimeType?: SundayOvertimeType;
  overtimeSource?: 'auto-checkout' | 'planned-session' | 'unscheduled-session';
}

/**
 * Evaluates attendance status and overtime strictly adhering to the Sunday-Only Overtime rule:
 * - Monday-Saturday: overtime is ALWAYS 0 and status can never be 'Lembur'.
 * - Sunday:
 *   - Auto-detects overtime when checkOutTime > scheduledEndTime.
 *   - Distinguishes clearly between 'Lembur Terencana' vs 'Lembur di Luar Jadwal'.
 */
export const evaluateAttendanceMetrics = (params: {
  date: string;
  requestedStatus: AttendanceStatus;
  checkInTime?: string;
  checkOutTime?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  hasScheduledShift: boolean;
  requestedOvertimeType?: SundayOvertimeType;
}): EvaluatedAttendanceMetrics => {
  const sunday = isSundayDate(params.date);
  const dayName = getScheduleDayFromIso(params.date);

  // Leave ('Cuti') has 0 work/overtime duration
  if (params.requestedStatus === 'Cuti') {
    return {
      isSunday: sunday,
      dayName,
      status: 'Cuti',
      workDurationMinutes: 0,
      overtimeMinutes: 0,
      overtimeType: undefined,
      overtimeSource: undefined
    };
  }

  const workDurationMinutes = computeDurationMinutes(params.checkInTime, params.checkOutTime);

  // Monday - Saturday: STRICTLY NO OVERTIME
  if (!sunday) {
    return {
      isSunday: false,
      dayName,
      status: 'Hadir',
      workDurationMinutes,
      overtimeMinutes: 0,
      overtimeType: undefined,
      overtimeSource: undefined
    };
  }

  // Sunday (Minggu) rules:
  const outMin = parseTimeToMinutes(params.checkOutTime);
  const schedEndMin = parseTimeToMinutes(params.scheduledEndTime);
  const overrunMinutes =
    params.hasScheduledShift && outMin !== null && schedEndMin !== null && outMin > schedEndMin
      ? outMin - schedEndMin
      : 0;

  // Case A: Explicit 'Lembur' session on Sunday
  if (params.requestedStatus === 'Lembur') {
    const resolvedType: SundayOvertimeType =
      params.requestedOvertimeType ||
      (params.hasScheduledShift ? 'Lembur Terencana' : 'Lembur di Luar Jadwal');

    // If working an unscheduled Sunday shift or planned overtime session:
    // - If there is a scheduled shift and check-out exceeds scheduled end, overtime = overrun (or full session if check-in >= scheduled end)
    // - If there is NO scheduled shift (Lembur di Luar Jadwal) or explicit planned Sunday overtime session, overtime = full worked duration
    const inMin = parseTimeToMinutes(params.checkInTime);
    let overtimeMinutes = workDurationMinutes;
    if (
      params.hasScheduledShift &&
      schedEndMin !== null &&
      outMin !== null &&
      inMin !== null &&
      inMin < schedEndMin &&
      overrunMinutes > 0
    ) {
      overtimeMinutes = overrunMinutes;
    }

    return {
      isSunday: true,
      dayName,
      status: 'Lembur',
      workDurationMinutes,
      overtimeMinutes,
      overtimeType: resolvedType,
      overtimeSource:
        resolvedType === 'Lembur Terencana' ? 'planned-session' : 'unscheduled-session'
    };
  }

  // Case B: Normal check-in/check-out on Sunday -> Auto-detect overtime!
  // B1: Staff has a scheduled Sunday shift AND check-out passes scheduledEndTime
  if (params.hasScheduledShift && overrunMinutes > 0) {
    return {
      isSunday: true,
      dayName,
      status: 'Lembur',
      workDurationMinutes,
      overtimeMinutes: overrunMinutes,
      overtimeType: params.requestedOvertimeType || 'Lembur di Luar Jadwal',
      overtimeSource: 'auto-checkout'
    };
  }

  // B2: Staff checks in/out on Sunday WITHOUT any scheduled shift -> Unscheduled Sunday Overtime
  if (!params.hasScheduledShift && (params.checkInTime || params.checkOutTime)) {
    return {
      isSunday: true,
      dayName,
      status: 'Lembur',
      workDurationMinutes,
      overtimeMinutes: workDurationMinutes,
      overtimeType: params.requestedOvertimeType || 'Lembur di Luar Jadwal',
      overtimeSource: 'unscheduled-session'
    };
  }

  // B3: Normal Sunday scheduled shift within scheduled hours
  return {
    isSunday: true,
    dayName,
    status: 'Hadir',
    workDurationMinutes,
    overtimeMinutes: 0,
    overtimeType: undefined,
    overtimeSource: undefined
  };
};

// ==================== LOCAL STORAGE & PENDING OPS ====================

interface PendingAttendanceOps {
  upserts: string[];
  deletes: string[];
}

const dispatchAttendanceUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ATTENDANCE_UPDATED_EVENT));
  }
};

const readPendingAttendanceOps = (): PendingAttendanceOps => {
  if (typeof window === 'undefined' || isDemoMode()) return { upserts: [], deletes: [] };
  try {
    const raw = demoGetItem(ATTENDANCE_PENDING_OPS_KEY);
    if (!raw) return { upserts: [], deletes: [] };
    const parsed = JSON.parse(raw);
    return {
      upserts: Array.isArray(parsed?.upserts) ? parsed.upserts.filter(Boolean) : [],
      deletes: Array.isArray(parsed?.deletes) ? parsed.deletes.filter(Boolean) : []
    };
  } catch {
    return { upserts: [], deletes: [] };
  }
};

const writePendingAttendanceOps = (ops: PendingAttendanceOps) => {
  if (typeof window === 'undefined' || isDemoMode()) return;
  try {
    demoSetItem(
      ATTENDANCE_PENDING_OPS_KEY,
      JSON.stringify({
        upserts: Array.from(new Set(ops.upserts.filter(Boolean))),
        deletes: Array.from(new Set(ops.deletes.filter(Boolean)))
      })
    );
  } catch {}
};

const enqueueAttendanceUpsert = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingAttendanceOps();
  ops.deletes = ops.deletes.filter((d) => d !== id);
  if (!ops.upserts.includes(id)) ops.upserts.push(id);
  writePendingAttendanceOps(ops);
};

const dequeueAttendanceUpsert = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingAttendanceOps();
  const next = ops.upserts.filter((u) => u !== id);
  if (next.length !== ops.upserts.length) {
    writePendingAttendanceOps({ ...ops, upserts: next });
  }
};

const enqueueAttendanceDelete = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingAttendanceOps();
  ops.upserts = ops.upserts.filter((u) => u !== id);
  if (!ops.deletes.includes(id)) ops.deletes.push(id);
  writePendingAttendanceOps(ops);
};

const dequeueAttendanceDelete = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingAttendanceOps();
  const next = ops.deletes.filter((d) => d !== id);
  if (next.length !== ops.deletes.length) {
    writePendingAttendanceOps({ ...ops, deletes: next });
  }
};

export const normalizeAttendanceRecord = (raw: StaffAttendanceRecord): StaffAttendanceRecord => {
  const sunday = isSundayDate(raw.date);
  const dayName = getScheduleDayFromIso(raw.date);
  const status: AttendanceStatus =
    raw.status === 'Lembur' && !sunday ? 'Hadir' : raw.status || 'Hadir';
  return {
    ...raw,
    staffRole: normalizeStaffRole(raw.staffRole, 'Apoteker'),
    dayName,
    isSunday: sunday,
    status,
    workDurationMinutes: Math.max(0, Number(raw.workDurationMinutes || 0)),
    overtimeMinutes: sunday ? Math.max(0, Number(raw.overtimeMinutes || 0)) : 0,
    overtimeType: sunday ? raw.overtimeType : undefined,
    overtimeSource: sunday ? raw.overtimeSource : undefined,
    approvalStatus: raw.approvalStatus || 'Disetujui'
  };
};

export const loadLocalAttendanceRecords = (): StaffAttendanceRecord[] => {
  try {
    const raw = demoGetItem(ATTENDANCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.date === 'string')
      .map(normalizeAttendanceRecord)
      .sort((a, b) => {
        const cmp = b.date.localeCompare(a.date);
        if (cmp !== 0) return cmp;
        return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
      });
  } catch {
    return [];
  }
};

export const saveLocalAttendanceRecords = (records: StaffAttendanceRecord[]): void => {
  try {
    const sorted = [...records]
      .map(normalizeAttendanceRecord)
      .sort((a, b) => {
        const cmp = b.date.localeCompare(a.date);
        if (cmp !== 0) return cmp;
        return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
      });
    demoSetItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(sorted));
    dispatchAttendanceUpdated();
  } catch {}
};

// ==================== SUPABASE CONVERTERS & TWO-WAY SYNC ====================

const isMissingTableError = (message?: string, code?: string): boolean => {
  const msg = String(message || '').toLowerCase();
  const c = String(code || '').toUpperCase();
  return (
    c === '42P01' ||
    c === 'PGRST205' ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('relation') && msg.includes('not exist')
  );
};

export const attendanceToSupabaseRow = (rec: StaffAttendanceRecord): Record<string, any> => {
  const clean = normalizeAttendanceRecord(rec);
  return {
    id: clean.id,
    staff_id: clean.staffId,
    staff_name: clean.staffName,
    staff_role: clean.staffRole,
    attendance_date: clean.date,
    day_name: clean.dayName,
    status: clean.status,
    schedule_id: clean.scheduleId || null,
    scheduled_start_time: clean.scheduledStartTime || null,
    scheduled_end_time: clean.scheduledEndTime || null,
    service_unit: clean.serviceUnit || null,
    check_in_time: clean.checkInTime || null,
    check_out_time: clean.checkOutTime || null,
    work_duration_minutes: clean.workDurationMinutes || 0,
    is_sunday: clean.isSunday,
    overtime_minutes: clean.isSunday ? clean.overtimeMinutes || 0 : 0,
    overtime_type: clean.isSunday ? clean.overtimeType || null : null,
    overtime_source: clean.isSunday ? clean.overtimeSource || null : null,
    leave_reason: clean.leaveReason || null,
    approval_status: clean.approvalStatus || 'Disetujui',
    approved_by: clean.approvedBy || null,
    approved_at: clean.approvedAt || null,
    source_mode: clean.sourceMode || 'desktop',
    notes: clean.notes || '',
    created_at: clean.createdAt || new Date().toISOString(),
    updated_at: clean.updatedAt || new Date().toISOString()
  };
};

export const supabaseRowToAttendance = (row: Record<string, any>): StaffAttendanceRecord => {
  const dateStr = String(row.attendance_date || row.date || getTodayIsoLocal()).slice(0, 10);
  return normalizeAttendanceRecord({
    id: String(row.id || `ATT-${Date.now()}`),
    staffId: String(row.staff_id || row.staffId || ''),
    staffName: String(row.staff_name || row.staffName || ''),
    staffRole: normalizeStaffRole(row.staff_role || row.staffRole, 'Apoteker'),
    date: dateStr,
    dayName: (row.day_name || getScheduleDayFromIso(dateStr)) as ScheduleDay,
    status: (row.status || 'Hadir') as AttendanceStatus,
    scheduleId: row.schedule_id || undefined,
    scheduledStartTime: row.scheduled_start_time || undefined,
    scheduledEndTime: row.scheduled_end_time || undefined,
    serviceUnit: row.service_unit || undefined,
    checkInTime: row.check_in_time || undefined,
    checkOutTime: row.check_out_time || undefined,
    workDurationMinutes: Number(row.work_duration_minutes || 0),
    isSunday: isSundayDate(dateStr),
    overtimeMinutes: Number(row.overtime_minutes || 0),
    overtimeType: row.overtime_type || undefined,
    overtimeSource: row.overtime_source || undefined,
    leaveReason: row.leave_reason || undefined,
    approvalStatus: (row.approval_status || 'Disetujui') as AttendanceApprovalStatus,
    approvedBy: row.approved_by || undefined,
    approvedAt: row.approved_at || undefined,
    sourceMode: row.source_mode === 'mobile' ? 'mobile' : 'desktop',
    notes: row.notes || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  });
};

export const syncAttendanceRecordToSupabase = async (
  rec: StaffAttendanceRecord
): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
  if (isDemoMode()) return { success: false, isDemo: true };
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.key) return { success: false, error: 'Supabase belum dikonfigurasi' };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum siap' };

  const tableName = getAttendanceTableName();
  if (missingAttendanceTables.has(tableName)) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const { error } = await client
      .from(tableName)
      .upsert(attendanceToSupabaseRow(rec), { onConflict: 'id' });
    if (error) {
      const needsTableSetup = isMissingTableError(error.message, error.code);
      if (needsTableSetup) missingAttendanceTables.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
};

export const deleteAttendanceRecordFromSupabase = async (
  id: string
): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
  if (isDemoMode()) return { success: false, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum siap' };

  const tableName = getAttendanceTableName();
  if (missingAttendanceTables.has(tableName)) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      const needsTableSetup = isMissingTableError(error.message, error.code);
      if (needsTableSetup) missingAttendanceTables.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
};

export const syncAllAttendanceWithSupabase = async (options?: {
  forceRefresh?: boolean;
}): Promise<{
  success: boolean;
  records: StaffAttendanceRecord[];
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> => {
  const localRecords = loadLocalAttendanceRecords();
  if (isDemoMode()) {
    return {
      success: false,
      records: localRecords,
      isDemo: true,
      error: 'Mode Demo aktif. Kehadiran disimpan aman secara lokal di sandbox.'
    };
  }

  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.key) {
    return {
      success: false,
      records: localRecords,
      error: 'Supabase belum dikonfigurasi — data kehadiran tersimpan lokal.'
    };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, records: localRecords, error: 'Klien Supabase belum tersedia.' };
  }

  const tableName = getAttendanceTableName();
  if (options?.forceRefresh) {
    missingAttendanceTables.delete(tableName);
  }
  if (missingAttendanceTables.has(tableName)) {
    return {
      success: false,
      records: localRecords,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const pendingOps = readPendingAttendanceOps();
  const localById = new Map<string, StaffAttendanceRecord>(localRecords.map((r) => [r.id, r]));

  // 1. Flush pending deletes first
  const remainingDeletes: string[] = [];
  let hitTableSetup = false;
  for (const delId of pendingOps.deletes) {
    const res = await deleteAttendanceRecordFromSupabase(delId);
    if (res.needsTableSetup) {
      hitTableSetup = true;
      remainingDeletes.push(delId);
      break;
    } else if (!res.success) {
      remainingDeletes.push(delId);
    }
  }

  // 2. Flush pending upserts
  const remainingUpserts: string[] = [];
  if (!hitTableSetup) {
    for (const upId of pendingOps.upserts) {
      const rec = localById.get(upId);
      if (!rec) continue;
      const res = await syncAttendanceRecordToSupabase(rec);
      if (res.needsTableSetup) {
        hitTableSetup = true;
        remainingUpserts.push(upId);
        break;
      } else if (!res.success) {
        remainingUpserts.push(upId);
      }
    }
  } else {
    remainingUpserts.push(...pendingOps.upserts);
  }

  writePendingAttendanceOps({ upserts: remainingUpserts, deletes: remainingDeletes });

  if (hitTableSetup) {
    return {
      success: false,
      records: localRecords,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  // 3. Pull authoritative snapshot ordered by indexed attendance_date
  try {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .order('attendance_date', { ascending: false })
      .limit(1000);

    if (error) {
      const needsTableSetup = isMissingTableError(error.message, error.code);
      if (needsTableSetup) missingAttendanceTables.add(tableName);
      return {
        success: false,
        records: localRecords,
        needsTableSetup,
        error: error.message
      };
    }

    const remoteRecords = (data || []).map(supabaseRowToAttendance);
    const pendingDeleteSet = new Set(remainingDeletes);
    const pendingUpsertSet = new Set(remainingUpserts);

    const mergedMap = new Map<string, StaffAttendanceRecord>();
    for (const rec of remoteRecords) {
      if (!pendingDeleteSet.has(rec.id)) {
        mergedMap.set(rec.id, rec);
      }
    }
    for (const upId of pendingUpsertSet) {
      const localItem = localById.get(upId);
      if (localItem && !pendingDeleteSet.has(upId)) {
        mergedMap.set(upId, localItem);
      }
    }

    const finalList = Array.from(mergedMap.values());
    saveLocalAttendanceRecords(finalList);
    return { success: true, records: finalList };
  } catch (err: any) {
    return {
      success: false,
      records: localRecords,
      error: err?.message || String(err)
    };
  }
};

// ==================== HIGH-LEVEL MUTATION HELPERS ====================

export const upsertAttendanceRecord = (record: StaffAttendanceRecord): StaffAttendanceRecord[] => {
  const clean = normalizeAttendanceRecord({
    ...record,
    updatedAt: new Date().toISOString()
  });
  const prev = loadLocalAttendanceRecords();
  const exists = prev.some((r) => r.id === clean.id);
  const next = exists ? prev.map((r) => (r.id === clean.id ? clean : r)) : [clean, ...prev];
  saveLocalAttendanceRecords(next);

  if (!isDemoMode()) {
    enqueueAttendanceUpsert(clean.id);
    syncAttendanceRecordToSupabase(clean)
      .then((res) => {
        if (res.success) dequeueAttendanceUpsert(clean.id);
      })
      .catch(() => {});
  }
  return next;
};

export const removeAttendanceRecord = (id: string): StaffAttendanceRecord[] => {
  const prev = loadLocalAttendanceRecords();
  const next = prev.filter((r) => r.id !== id);
  saveLocalAttendanceRecords(next);

  if (!isDemoMode()) {
    enqueueAttendanceDelete(id);
    deleteAttendanceRecordFromSupabase(id)
      .then((res) => {
        if (res.success) dequeueAttendanceDelete(id);
      })
      .catch(() => {});
  }
  return next;
};

export const createQuickCheckInRecord = (params: {
  staff: Staff;
  date?: string;
  checkInTime?: string;
  schedules: DutySchedule[];
  sourceMode: 'desktop' | 'mobile';
  isOwnerAdmin: boolean;
  notes?: string;
}): StaffAttendanceRecord => {
  const date = params.date || getTodayIsoLocal();
  const checkInTime = params.checkInTime || getCurrentTimeHHMM();
  const shift = findMatchingShiftForStaffOnDate(params.staff.id, date, params.schedules);
  const sunday = isSundayDate(date);
  const hasShift = Boolean(shift);

  const metrics = evaluateAttendanceMetrics({
    date,
    requestedStatus: sunday && !hasShift ? 'Lembur' : 'Hadir',
    checkInTime,
    checkOutTime: undefined,
    scheduledStartTime: shift?.startTime,
    scheduledEndTime: shift?.endTime,
    hasScheduledShift: hasShift,
    requestedOvertimeType: sunday && !hasShift ? 'Lembur di Luar Jadwal' : undefined
  });

  const nowIso = new Date().toISOString();
  const needsApproval = metrics.status === 'Lembur' && !params.isOwnerAdmin;

  return {
    id: `ATT-${date.replace(/-/g, '')}-${params.staff.id}-${Date.now().toString().slice(-4)}`,
    staffId: params.staff.id,
    staffName: params.staff.name,
    staffRole: normalizeStaffRole(params.staff.role, 'Apoteker'),
    date,
    dayName: metrics.dayName,
    status: metrics.status,
    scheduleId: shift?.id,
    scheduledStartTime: shift?.startTime,
    scheduledEndTime: shift?.endTime,
    serviceUnit: shift?.serviceUnit,
    checkInTime,
    checkOutTime: undefined,
    workDurationMinutes: 0,
    isSunday: metrics.isSunday,
    overtimeMinutes: 0,
    overtimeType: metrics.overtimeType,
    overtimeSource: metrics.overtimeSource,
    approvalStatus: needsApproval ? 'Menunggu Persetujuan' : 'Disetujui',
    approvedBy: needsApproval ? undefined : params.isOwnerAdmin ? params.staff.name : 'Otomatis (Shift)',
    approvedAt: needsApproval ? undefined : nowIso,
    sourceMode: params.sourceMode,
    notes: params.notes || '',
    createdAt: nowIso,
    updatedAt: nowIso
  };
};

export const applyCheckOutOnRecord = (params: {
  record: StaffAttendanceRecord;
  checkOutTime?: string;
  isOwnerAdmin: boolean;
  approverName?: string;
}): StaffAttendanceRecord => {
  const checkOutTime = params.checkOutTime || getCurrentTimeHHMM();
  const hasShift = Boolean(params.record.scheduleId || params.record.scheduledEndTime);
  const metrics = evaluateAttendanceMetrics({
    date: params.record.date,
    requestedStatus: params.record.status === 'Lembur' ? 'Lembur' : 'Hadir',
    checkInTime: params.record.checkInTime,
    checkOutTime,
    scheduledStartTime: params.record.scheduledStartTime,
    scheduledEndTime: params.record.scheduledEndTime,
    hasScheduledShift: hasShift,
    requestedOvertimeType: params.record.overtimeType
  });

  const nowIso = new Date().toISOString();
  const becameSundayOvertime = metrics.isSunday && metrics.status === 'Lembur' && metrics.overtimeMinutes > 0;
  const approvalStatus: AttendanceApprovalStatus =
    becameSundayOvertime && !params.isOwnerAdmin
      ? 'Menunggu Persetujuan'
      : params.record.approvalStatus || 'Disetujui';

  return {
    ...params.record,
    status: metrics.status,
    checkOutTime,
    workDurationMinutes: metrics.workDurationMinutes,
    isSunday: metrics.isSunday,
    overtimeMinutes: metrics.overtimeMinutes,
    overtimeType: metrics.overtimeType,
    overtimeSource: metrics.overtimeSource,
    approvalStatus,
    approvedBy:
      approvalStatus === 'Disetujui'
        ? params.record.approvedBy || params.approverName || 'APJ / Owner'
        : undefined,
    approvedAt: approvalStatus === 'Disetujui' ? params.record.approvedAt || nowIso : undefined,
    updatedAt: nowIso
  };
};

// ==================== GPS RADIUS VALIDATION (MAX 50 METER) ====================

export const DEFAULT_CHECKIN_RADIUS_METERS = 50;

export interface AttendanceTargetLocation {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  sourceLabel: string;
}

export interface LocationVerificationResult {
  allowed: boolean;
  distanceMeters?: number;
  maxRadiusMeters: number;
  userLatitude?: number;
  userLongitude?: number;
  accuracyMeters?: number;
  targetSourceLabel?: string;
  reason?: string;
  errorCode?:
    | 'NO_CONFIG'
    | 'UNSUPPORTED'
    | 'PERMISSION_DENIED'
    | 'UNAVAILABLE'
    | 'TIMEOUT'
    | 'OUT_OF_RANGE';
}

export const haversineDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isValidCoord = (val: unknown, min: number, max: number): val is number => {
  return (
    typeof val === 'number' &&
    Number.isFinite(val) &&
    val >= min &&
    val <= max
  );
};

const hasValidCoords = (lat: unknown, lng: unknown): boolean => {
  return isValidCoord(lat, -90, 90) && isValidCoord(lng, -180, 180) && !(lat === 0 && lng === 0);
};

export const resolveAttendanceTargetLocation = (
  branchId?: string
): AttendanceTargetLocation | null => {
  try {
    const rawProfile = demoGetItem('latisha_pharmacy_profile');
    if (rawProfile) {
      const parsed = JSON.parse(rawProfile) as {
        name?: string;
        latitude?: number;
        longitude?: number;
        checkInRadiusMeters?: number;
        branchLocations?: Record<
          string,
          { latitude: number; longitude: number; radiusMeters?: number }
        >;
      };

      const branchLoc = branchId ? parsed?.branchLocations?.[branchId] : undefined;
      const branchLat = branchLoc?.latitude;
      const branchLng = branchLoc?.longitude;
      if (
        branchLoc &&
        isValidCoord(branchLat, -90, 90) &&
        isValidCoord(branchLng, -180, 180) &&
        hasValidCoords(branchLat, branchLng)
      ) {
        const radius =
          typeof branchLoc.radiusMeters === 'number' && branchLoc.radiusMeters > 0
            ? Math.min(branchLoc.radiusMeters, DEFAULT_CHECKIN_RADIUS_METERS)
            : DEFAULT_CHECKIN_RADIUS_METERS;
        return {
          latitude: branchLat,
          longitude: branchLng,
          radiusMeters: radius,
          sourceLabel: parsed?.name ? `${parsed.name} (${branchId})` : `Cabang ${branchId}`
        };
      }

      const mainLat = parsed?.latitude;
      const mainLng = parsed?.longitude;
      if (
        isValidCoord(mainLat, -90, 90) &&
        isValidCoord(mainLng, -180, 180) &&
        hasValidCoords(mainLat, mainLng)
      ) {
        const radius =
          typeof parsed.checkInRadiusMeters === 'number' && parsed.checkInRadiusMeters > 0
            ? Math.min(parsed.checkInRadiusMeters, DEFAULT_CHECKIN_RADIUS_METERS)
            : DEFAULT_CHECKIN_RADIUS_METERS;
        return {
          latitude: mainLat,
          longitude: mainLng,
          radiusMeters: radius,
          sourceLabel: parsed?.name?.trim() || 'Apotek / Cabang Aktif'
        };
      }
    }

    if (branchId) {
      const rawBranches = demoGetItem('latisha_branches');
      if (rawBranches) {
        const branches = JSON.parse(rawBranches) as Array<{
          id?: string;
          name?: string;
          latitude?: number;
          longitude?: number;
        }>;
        const match = Array.isArray(branches) ? branches.find((b) => b.id === branchId) : undefined;
        const matchLat = match?.latitude;
        const matchLng = match?.longitude;
        if (
          match &&
          isValidCoord(matchLat, -90, 90) &&
          isValidCoord(matchLng, -180, 180) &&
          hasValidCoords(matchLat, matchLng)
        ) {
          return {
            latitude: matchLat,
            longitude: matchLng,
            radiusMeters: DEFAULT_CHECKIN_RADIUS_METERS,
            sourceLabel: match.name || 'Cabang Aktif'
          };
        }
      }
    }
  } catch {
    // ignore parse failure
  }
  return null;
};

export const verifyAttendanceLocationWithinRadius = async (options?: {
  branchId?: string;
  timeoutMs?: number;
}): Promise<LocationVerificationResult> => {
  const target = resolveAttendanceTargetLocation(options?.branchId);
  if (!target) {
    return {
      allowed: false,
      maxRadiusMeters: DEFAULT_CHECKIN_RADIUS_METERS,
      errorCode: 'NO_CONFIG',
      reason:
        'Check-In ditolak: Titik koordinat GPS lokasi Apotek/Cabang belum diatur. Silakan atur Latitude & Longitude pada Pengaturan Apotek -> Profil Apotek terlebih dahulu.'
    };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      allowed: false,
      maxRadiusMeters: target.radiusMeters,
      targetSourceLabel: target.sourceLabel,
      errorCode: 'UNSUPPORTED',
      reason:
        'Check-In ditolak: Perangkat atau browser tidak mendukung verifikasi lokasi GPS (Geolocation).'
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const accuracyMeters = Math.round(position.coords.accuracy || 0);
        const distance = haversineDistanceMeters(
          userLat,
          userLng,
          target.latitude,
          target.longitude
        );
        const roundedDistance = Math.round(distance);

        if (distance > target.radiusMeters) {
          resolve({
            allowed: false,
            distanceMeters: roundedDistance,
            maxRadiusMeters: target.radiusMeters,
            userLatitude: userLat,
            userLongitude: userLng,
            accuracyMeters,
            targetSourceLabel: target.sourceLabel,
            errorCode: 'OUT_OF_RANGE',
            reason: `Check-In ditolak: Lokasi Anda berjarak ${roundedDistance} meter dari ${target.sourceLabel} (batas maksimal radius ${target.radiusMeters} meter).`
          });
          return;
        }

        resolve({
          allowed: true,
          distanceMeters: roundedDistance,
          maxRadiusMeters: target.radiusMeters,
          userLatitude: userLat,
          userLongitude: userLng,
          accuracyMeters,
          targetSourceLabel: target.sourceLabel
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({
            allowed: false,
            maxRadiusMeters: target.radiusMeters,
            targetSourceLabel: target.sourceLabel,
            errorCode: 'PERMISSION_DENIED',
            reason:
              'Check-In ditolak: Izin akses lokasi GPS ditolak oleh browser/perangkat. Mohon aktifkan izin lokasi lalu coba kembali.'
          });
          return;
        }
        if (err.code === err.TIMEOUT) {
          resolve({
            allowed: false,
            maxRadiusMeters: target.radiusMeters,
            targetSourceLabel: target.sourceLabel,
            errorCode: 'TIMEOUT',
            reason:
              'Check-In ditolak: Waktu verifikasi lokasi GPS habis (timeout). Pastikan GPS aktif lalu coba kembali.'
          });
          return;
        }
        resolve({
          allowed: false,
          maxRadiusMeters: target.radiusMeters,
          targetSourceLabel: target.sourceLabel,
          errorCode: 'UNAVAILABLE',
          reason:
            'Check-In ditolak: Titik lokasi GPS perangkat tidak dapat diverifikasi saat ini. Pastikan GPS aktif lalu coba lagi.'
        });
      },
      {
        enableHighAccuracy: true,
        timeout: options?.timeoutMs ?? 10000,
        maximumAge: 0
      }
    );
  });
};

// ==================== SCHEDULE-ATTENDANCE INTEGRATION & OVERDUE ALERT ====================

export const formatCheckInTimeDot = (hhmm?: string | null): string => {
  if (!hhmm) return '';
  const clean = String(hhmm).trim();
  const match = clean.match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) return clean.replace(':', '.');
  return `${String(Number(match[1])).padStart(2, '0')}.${match[2]}`;
};

export const doesScheduleApplyToDate = (schedule: DutySchedule, isoDate: string): boolean => {
  const dated = (schedule.scheduleDate || '').trim().slice(0, 10);
  if (dated) {
    return dated === isoDate.slice(0, 10);
  }
  return schedule.day === getScheduleDayFromIso(isoDate);
};

export type ScheduleAttendanceBadgeState =
  | { kind: 'hadir'; label: string; record: StaffAttendanceRecord }
  | { kind: 'belum_masuk'; label: 'Belum Masuk' }
  | { kind: 'none' };

export const resolveScheduleAttendanceBadge = (params: {
  schedule: DutySchedule;
  dayIso: string;
  isToday: boolean;
  records: StaffAttendanceRecord[];
  now?: Date;
}): ScheduleAttendanceBadgeState => {
  const { schedule, dayIso, isToday, records } = params;
  const now = params.now || new Date();
  const cleanIso = dayIso.slice(0, 10);
  const targetName = (schedule.staffName || '').trim().toLowerCase();

  const exactMatch = records.find(
    (r) => r.date === cleanIso && r.scheduleId && r.scheduleId === schedule.id
  );
  const staffMatch =
    exactMatch ||
    records.find(
      (r) =>
        r.date === cleanIso &&
        (r.staffId === schedule.staffId ||
          (targetName !== '' && (r.staffName || '').trim().toLowerCase() === targetName))
    );

  if (staffMatch) {
    if (staffMatch.status === 'Cuti') {
      return { kind: 'none' };
    }
    if (staffMatch.checkInTime && staffMatch.checkInTime.trim() !== '') {
      return {
        kind: 'hadir',
        label: `Hadir pkl ${formatCheckInTimeDot(staffMatch.checkInTime)}`,
        record: staffMatch
      };
    }
  }

  if (schedule.status === 'Cuti / Libur') {
    return { kind: 'none' };
  }

  if (isToday && schedule.status === 'Aktif') {
    const startMins = parseTimeToMinutes(schedule.startTime);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    if (startMins !== null && nowMins >= startMins) {
      return {
        kind: 'belum_masuk',
        label: 'Belum Masuk'
      };
    }
  }

  return { kind: 'none' };
};

export const findOverdueUncheckedSchedules = (params: {
  schedules: DutySchedule[];
  records: StaffAttendanceRecord[];
  now?: Date;
  graceMinutes?: number;
  targetStaffId?: string;
  targetStaffName?: string;
}): DutySchedule[] => {
  const now = params.now || new Date();
  const graceMinutes = params.graceMinutes ?? 5;
  const todayIso = getTodayIsoLocal(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const filterNameLower = (params.targetStaffName || '').trim().toLowerCase();

  return params.schedules.filter((sch) => {
    if (sch.status !== 'Aktif') return false;
    if (!doesScheduleApplyToDate(sch, todayIso)) return false;

    if (params.targetStaffId || filterNameLower) {
      const idMatch = params.targetStaffId ? sch.staffId === params.targetStaffId : false;
      const nameMatch = filterNameLower
        ? (sch.staffName || '').trim().toLowerCase() === filterNameLower
        : false;
      if (!idMatch && !nameMatch) return false;
    }

    const startMins = parseTimeToMinutes(sch.startTime);
    if (startMins === null) return false;
    if (nowMinutes < startMins + graceMinutes) return false;

    const endMins = parseTimeToMinutes(sch.endTime);
    if (endMins !== null && endMins > startMins && nowMinutes > endMins) {
      return false;
    }

    const badge = resolveScheduleAttendanceBadge({
      schedule: sch,
      dayIso: todayIso,
      isToday: true,
      records: params.records,
      now
    });
    return badge.kind === 'belum_masuk';
  });
};

const inMemoryOverdueAlertedKeys = new Set<string>();

export const hasTriggeredCheckInOverdueAlert = (isoDate: string, scheduleId: string): boolean => {
  const key = `${isoDate}::${scheduleId}`;
  if (inMemoryOverdueAlertedKeys.has(key)) return true;
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  try {
    const raw = window.sessionStorage.getItem(`latisha_checkin_overdue_alerted_${isoDate}`);
    if (!raw) return false;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.includes(scheduleId);
  } catch {
    return false;
  }
};

export const markTriggeredCheckInOverdueAlert = (isoDate: string, scheduleId: string): void => {
  const key = `${isoDate}::${scheduleId}`;
  inMemoryOverdueAlertedKeys.add(key);
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    const storageKey = `latisha_checkin_overdue_alerted_${isoDate}`;
    const raw = window.sessionStorage.getItem(storageKey);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(scheduleId)) {
      arr.push(scheduleId);
      window.sessionStorage.setItem(storageKey, JSON.stringify(arr));
    }
  } catch {
    // ignore sessionStorage failure
  }
};
