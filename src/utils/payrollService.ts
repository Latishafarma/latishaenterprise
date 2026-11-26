import {
  DEFAULT_PAYROLL_OVERTIME_CONFIG,
  DutySchedule,
  FeeConfig,
  PayrollOvertimeConfig,
  RoleSalaryDefault,
  Staff,
  StaffAttendanceRecord,
  StaffRole,
  StaffSalarySetting,
  SundayOvertimeRuleConfig,
  normalizeStaffRole
} from '../types';
import { demoGetItem, demoSetItem } from './demoSandbox';
import { isSundayDate, parseLocalIso } from './attendanceService';

export const PAYROLL_CONFIG_STORAGE_KEY = 'latisha_payroll_overtime_config';
export const PAYROLL_CONFIG_UPDATED_EVENT = 'latisha_payroll_config_updated';

export const PAYROLL_ROLE_LIST: StaffRole[] = [
  'APJ / Owner',
  'Dokter',
  'Apoteker',
  'Perawat / Bidan',
  'Kasir & Front Office'
];

const toSafeMoney = (val: any, fallback = 0): number => {
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : fallback;
};

export const normalizePayrollConfig = (raw?: Partial<PayrollOvertimeConfig> | null): PayrollOvertimeConfig => {
  const defaults = DEFAULT_PAYROLL_OVERTIME_CONFIG;
  const rawRoles = raw?.roleDefaults && typeof raw.roleDefaults === 'object' ? raw.roleDefaults : {};
  const roleDefaults: Record<string, RoleSalaryDefault> = {};

  PAYROLL_ROLE_LIST.forEach((role) => {
    const def = defaults.roleDefaults[role] || { baseSalary: 0, fixedAllowance: 0 };
    const incoming = (rawRoles as Record<string, any>)[role];
    roleDefaults[role] = {
      baseSalary: toSafeMoney(incoming?.baseSalary, def.baseSalary),
      fixedAllowance: toSafeMoney(incoming?.fixedAllowance, def.fixedAllowance)
    };
  });

  const rawSalaries = Array.isArray(raw?.staffSalaries) ? raw!.staffSalaries : [];
  const staffSalaries: StaffSalarySetting[] = rawSalaries
    .filter((s) => s && typeof s.staffId === 'string' && s.staffId.trim())
    .map((s) => {
      const role = normalizeStaffRole(s.staffRole, 'Apoteker');
      const roleDef = roleDefaults[role] || { baseSalary: 0, fixedAllowance: 0 };
      const customRate = toSafeMoney(s.customOvertimeHourlyRate, 0);
      return {
        staffId: String(s.staffId).trim(),
        staffName: String(s.staffName || '').trim(),
        staffRole: role,
        baseSalary: toSafeMoney(s.baseSalary, roleDef.baseSalary),
        fixedAllowance: toSafeMoney(s.fixedAllowance, roleDef.fixedAllowance),
        customOvertimeHourlyRate: customRate > 0 ? customRate : undefined,
        active: s.active !== false,
        notes: s.notes ? String(s.notes) : ''
      };
    });

  const rawOt: Partial<SundayOvertimeRuleConfig> = raw?.sundayOvertime || {};
  const roundingRaw = Number(rawOt.roundingMinutes);
  const roundingMinutes: 1 | 15 | 30 | 60 =
    roundingRaw === 1 || roundingRaw === 15 || roundingRaw === 30 || roundingRaw === 60
      ? roundingRaw
      : defaults.sundayOvertime.roundingMinutes;

  const sundayOvertime: SundayOvertimeRuleConfig = {
    sundayOnly: true,
    calculationMode: rawOt.calculationMode === 'per-sesi' ? 'per-sesi' : 'per-jam',
    plannedHourlyRate: toSafeMoney(rawOt.plannedHourlyRate, defaults.sundayOvertime.plannedHourlyRate),
    unscheduledHourlyRate: toSafeMoney(rawOt.unscheduledHourlyRate, defaults.sundayOvertime.unscheduledHourlyRate),
    plannedSessionRate: toSafeMoney(rawOt.plannedSessionRate, defaults.sundayOvertime.plannedSessionRate),
    unscheduledSessionRate: toSafeMoney(rawOt.unscheduledSessionRate, defaults.sundayOvertime.unscheduledSessionRate),
    roundingMinutes,
    requireApprovalForPayout:
      rawOt.requireApprovalForPayout !== undefined
        ? Boolean(rawOt.requireApprovalForPayout)
        : defaults.sundayOvertime.requireApprovalForPayout
  };

  const basisDaysRaw = Number(raw?.salaryBasisDaysPerMonth);
  const salaryBasisDaysPerMonth =
    Number.isFinite(basisDaysRaw) && basisDaysRaw >= 20 && basisDaysRaw <= 31
      ? Math.round(basisDaysRaw)
      : defaults.salaryBasisDaysPerMonth;

  return {
    salaryBasisDaysPerMonth,
    salaryPeriodMode: raw?.salaryPeriodMode === 'prorata-days' ? 'prorata-days' : 'full-month',
    roleDefaults,
    staffSalaries,
    sundayOvertime,
    updatedAt: raw?.updatedAt
  };
};

export const loadLocalPayrollConfig = (feeConfig?: FeeConfig | null): PayrollOvertimeConfig => {
  if (feeConfig?.payrollConfig) {
    return normalizePayrollConfig(feeConfig.payrollConfig);
  }
  try {
    const saved = demoGetItem(PAYROLL_CONFIG_STORAGE_KEY);
    if (saved) {
      return normalizePayrollConfig(JSON.parse(saved));
    }
  } catch {}
  try {
    const feeRaw = demoGetItem('latisha_fee_config');
    if (feeRaw) {
      const parsed = JSON.parse(feeRaw);
      if (parsed?.payrollConfig) {
        return normalizePayrollConfig(parsed.payrollConfig);
      }
    }
  } catch {}
  return normalizePayrollConfig(DEFAULT_PAYROLL_OVERTIME_CONFIG);
};

export const saveLocalPayrollConfig = (config: PayrollOvertimeConfig): PayrollOvertimeConfig => {
  const clean = normalizePayrollConfig({
    ...config,
    updatedAt: new Date().toISOString()
  });
  try {
    demoSetItem(PAYROLL_CONFIG_STORAGE_KEY, JSON.stringify(clean));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PAYROLL_CONFIG_UPDATED_EVENT));
    }
  } catch {}
  return clean;
};

export const resolveStaffSalarySetting = (
  staff: Pick<Staff, 'id' | 'name' | 'role'>,
  config: PayrollOvertimeConfig
): StaffSalarySetting => {
  const role = normalizeStaffRole(staff.role, 'Apoteker');
  const existing =
    config.staffSalaries.find((s) => s.staffId === staff.id) ||
    config.staffSalaries.find(
      (s) => s.staffName.trim().toLowerCase() === staff.name.trim().toLowerCase()
    );
  if (existing) {
    return {
      ...existing,
      staffId: staff.id,
      staffName: staff.name,
      staffRole: role
    };
  }
  const roleDef = config.roleDefaults[role] || { baseSalary: 0, fixedAllowance: 0 };
  return {
    staffId: staff.id,
    staffName: staff.name,
    staffRole: role,
    baseSalary: roleDef.baseSalary,
    fixedAllowance: roleDef.fixedAllowance,
    active: true,
    notes: ''
  };
};

export const countInclusivePeriodDays = (startDate?: string, endDate?: string): number => {
  const s = startDate ? parseLocalIso(startDate) : null;
  const e = endDate ? parseLocalIso(endDate) : null;
  if (!s || !e) return 30;
  const diffMs = e.getTime() - s.getTime();
  if (diffMs < 0) return 1;
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
};

export const roundOvertimeMinutes = (minutes: number, step: 1 | 15 | 30 | 60): number => {
  const safe = Math.max(0, Math.round(minutes || 0));
  if (safe === 0 || step <= 1) return safe;
  return Math.ceil(safe / step) * step;
};

export interface SundayOvertimePayResult {
  eligible: boolean;
  reason?: string;
  billedMinutes: number;
  amount: number;
  category: 'Lembur Terencana' | 'Lembur di Luar Jadwal' | null;
  rateLabel: string;
}

export const calculateSundayOvertimePay = (
  record: StaffAttendanceRecord,
  config: PayrollOvertimeConfig,
  staffSetting?: StaffSalarySetting
): SundayOvertimePayResult => {
  // Strictly Sunday only!
  const sunday = record.isSunday && isSundayDate(record.date);
  if (!sunday || record.status !== 'Lembur') {
    return {
      eligible: false,
      reason: 'Bukan lembur hari Minggu',
      billedMinutes: 0,
      amount: 0,
      category: null,
      rateLabel: '-'
    };
  }

  const rule = config.sundayOvertime;
  if (rule.requireApprovalForPayout && record.approvalStatus !== 'Disetujui') {
    return {
      eligible: false,
      reason: record.approvalStatus === 'Ditolak' ? 'Ditolak APJ / Owner' : 'Menunggu persetujuan APJ / Owner',
      billedMinutes: 0,
      amount: 0,
      category: record.overtimeType || 'Lembur di Luar Jadwal',
      rateLabel: 'Belum disetujui'
    };
  }

  const category: 'Lembur Terencana' | 'Lembur di Luar Jadwal' =
    record.overtimeType === 'Lembur Terencana' ? 'Lembur Terencana' : 'Lembur di Luar Jadwal';

  if (rule.calculationMode === 'per-sesi') {
    const rate = category === 'Lembur Terencana' ? rule.plannedSessionRate : rule.unscheduledSessionRate;
    return {
      eligible: true,
      billedMinutes: Math.max(0, record.overtimeMinutes || 0),
      amount: Math.round(rate),
      category,
      rateLabel: `Rp ${rate.toLocaleString('id-ID')}/sesi`
    };
  }

  // Per-jam calculation
  const rawMinutes = Math.max(0, record.overtimeMinutes || 0);
  if (rawMinutes <= 0) {
    return {
      eligible: false,
      reason: 'Durasi lembur 0 menit',
      billedMinutes: 0,
      amount: 0,
      category,
      rateLabel: '0 mnt'
    };
  }

  const billedMinutes = roundOvertimeMinutes(rawMinutes, rule.roundingMinutes);
  const defaultHourly =
    category === 'Lembur Terencana' ? rule.plannedHourlyRate : rule.unscheduledHourlyRate;
  const appliedHourly =
    staffSetting?.customOvertimeHourlyRate && staffSetting.customOvertimeHourlyRate > 0
      ? staffSetting.customOvertimeHourlyRate
      : defaultHourly;

  const amount = Math.round((billedMinutes / 60) * appliedHourly);

  return {
    eligible: true,
    billedMinutes,
    amount,
    category,
    rateLabel: `Rp ${appliedHourly.toLocaleString('id-ID')}/jam`
  };
};

export interface StaffClinicalFeeInput {
  staffId: string;
  staffName: string;
  role: string;
  patientCount: number;
  totalFee: number;
}

export interface SundayOvertimeDetailRow {
  record: StaffAttendanceRecord;
  category: 'Lembur Terencana' | 'Lembur di Luar Jadwal';
  eligible: boolean;
  reason?: string;
  billedMinutes: number;
  rateLabel: string;
  amount: number;
}

export interface StaffPayrollFeeOvertimeRow {
  staffId: string;
  staffName: string;
  role: StaffRole;
  salaryActive: boolean;
  monthlyBaseSalary: number;
  monthlyAllowance: number;
  periodFactor: number;
  baseSalaryPay: number;
  fixedAllowancePay: number;
  totalSalaryPay: number;
  patientCount: number;
  totalFeePay: number;
  presentDays: number;
  leaveDays: number;
  scheduledShiftCount: number;
  sundayOvertimeSessions: number;
  plannedOvertimeSessions: number;
  unscheduledOvertimeSessions: number;
  plannedOvertimeMinutes: number;
  unscheduledOvertimeMinutes: number;
  totalOvertimeMinutes: number;
  plannedOvertimePay: number;
  unscheduledOvertimePay: number;
  totalOvertimePay: number;
  pendingOvertimeSessions: number;
  grandTotal: number;
}

export const buildStaffPayrollSummary = (params: {
  staffList: Staff[];
  payrollConfig: PayrollOvertimeConfig;
  attendanceRecords: StaffAttendanceRecord[];
  schedules: DutySchedule[];
  staffFeeInputs: StaffClinicalFeeInput[];
  startDate: string;
  endDate: string;
  salaryModeOverride?: 'config' | 'full-month' | 'prorata-days';
}): {
  rows: StaffPayrollFeeOvertimeRow[];
  overtimeDetails: SundayOvertimeDetailRow[];
  periodDays: number;
  effectiveSalaryMode: 'full-month' | 'prorata-days';
  totals: {
    baseSalaryPay: number;
    fixedAllowancePay: number;
    totalSalaryPay: number;
    totalFeePay: number;
    totalPatients: number;
    plannedOvertimePay: number;
    unscheduledOvertimePay: number;
    totalOvertimePay: number;
    totalOvertimeMinutes: number;
    sundayOvertimeSessions: number;
    pendingOvertimeSessions: number;
    grandTotal: number;
  };
} => {
  const {
    staffList,
    payrollConfig,
    attendanceRecords,
    schedules,
    staffFeeInputs,
    startDate,
    endDate,
    salaryModeOverride = 'config'
  } = params;

  const periodDays = countInclusivePeriodDays(startDate, endDate);
  const effectiveSalaryMode: 'full-month' | 'prorata-days' =
    salaryModeOverride === 'config' ? payrollConfig.salaryPeriodMode : salaryModeOverride;
  const basisDays = Math.max(1, payrollConfig.salaryBasisDaysPerMonth || 30);
  const periodFactor = effectiveSalaryMode === 'prorata-days' ? periodDays / basisDays : 1;

  // Build unified staff registry from master staffList + any historical staff in fees/attendance
  const staffMap = new Map<string, { id: string; name: string; role: StaffRole }>();
  staffList.forEach((s) => {
    staffMap.set(s.id, {
      id: s.id,
      name: s.name,
      role: normalizeStaffRole(s.role, 'Apoteker')
    });
  });

  const findStaffKey = (staffId?: string, staffName?: string): string | null => {
    if (staffId && staffMap.has(staffId)) return staffId;
    if (staffName) {
      const target = staffName.trim().toLowerCase();
      for (const [key, val] of staffMap.entries()) {
        if (val.name.trim().toLowerCase() === target) return key;
      }
    }
    return null;
  };

  staffFeeInputs.forEach((f) => {
    const existingKey = findStaffKey(f.staffId, f.staffName);
    if (!existingKey) {
      staffMap.set(f.staffId, {
        id: f.staffId,
        name: f.staffName,
        role: normalizeStaffRole(f.role, 'Dokter')
      });
    }
  });

  // Filter attendance in date range
  const periodAttendance = attendanceRecords.filter((rec) => {
    const d = (rec.date || '').slice(0, 10);
    return (!startDate || d >= startDate) && (!endDate || d <= endDate);
  });

  periodAttendance.forEach((rec) => {
    const existingKey = findStaffKey(rec.staffId, rec.staffName);
    if (!existingKey) {
      staffMap.set(rec.staffId, {
        id: rec.staffId,
        name: rec.staffName,
        role: normalizeStaffRole(rec.staffRole, 'Apoteker')
      });
    }
  });

  // Prepare result map
  const rowMap = new Map<string, StaffPayrollFeeOvertimeRow>();
  const settingByStaffId = new Map<string, StaffSalarySetting>();

  staffMap.forEach((st) => {
    const setting = resolveStaffSalarySetting(st, payrollConfig);
    settingByStaffId.set(st.id, setting);

    const baseSalaryPay = setting.active ? Math.round(setting.baseSalary * periodFactor) : 0;
    const fixedAllowancePay = setting.active ? Math.round(setting.fixedAllowance * periodFactor) : 0;
    const totalSalaryPay = baseSalaryPay + fixedAllowancePay;

    // Count active shift templates / date-bound shifts in range for this staff
    const scheduledShiftCount = schedules.filter((sch) => {
      if (sch.staffId !== st.id || sch.status !== 'Aktif') return false;
      if (sch.scheduleDate) {
        const sd = sch.scheduleDate.slice(0, 10);
        return (!startDate || sd >= startDate) && (!endDate || sd <= endDate);
      }
      return true;
    }).length;

    rowMap.set(st.id, {
      staffId: st.id,
      staffName: st.name,
      role: st.role,
      salaryActive: setting.active,
      monthlyBaseSalary: setting.baseSalary,
      monthlyAllowance: setting.fixedAllowance,
      periodFactor,
      baseSalaryPay,
      fixedAllowancePay,
      totalSalaryPay,
      patientCount: 0,
      totalFeePay: 0,
      presentDays: 0,
      leaveDays: 0,
      scheduledShiftCount,
      sundayOvertimeSessions: 0,
      plannedOvertimeSessions: 0,
      unscheduledOvertimeSessions: 0,
      plannedOvertimeMinutes: 0,
      unscheduledOvertimeMinutes: 0,
      totalOvertimeMinutes: 0,
      plannedOvertimePay: 0,
      unscheduledOvertimePay: 0,
      totalOvertimePay: 0,
      pendingOvertimeSessions: 0,
      grandTotal: totalSalaryPay
    });
  });

  // Merge clinical fees
  staffFeeInputs.forEach((fee) => {
    const key = findStaffKey(fee.staffId, fee.staffName);
    if (!key) return;
    const row = rowMap.get(key);
    if (!row) return;
    row.patientCount += fee.patientCount;
    row.totalFeePay += fee.totalFee;
  });

  // Merge attendance & Sunday overtime
  const overtimeDetails: SundayOvertimeDetailRow[] = [];

  periodAttendance.forEach((rec) => {
    const key = findStaffKey(rec.staffId, rec.staffName);
    if (!key) return;
    const row = rowMap.get(key);
    if (!row) return;

    if (rec.status === 'Cuti') {
      if (rec.approvalStatus !== 'Ditolak') {
        row.leaveDays += 1;
      }
      return;
    }

    if (rec.status === 'Hadir') {
      row.presentDays += 1;
      return;
    }

    if (rec.status === 'Lembur') {
      row.presentDays += 1;
      if (rec.isSunday && isSundayDate(rec.date)) {
        const staffSetting = settingByStaffId.get(key);
        const calc = calculateSundayOvertimePay(rec, payrollConfig, staffSetting);
        const category = calc.category || 'Lembur di Luar Jadwal';

        overtimeDetails.push({
          record: rec,
          category,
          eligible: calc.eligible,
          reason: calc.reason,
          billedMinutes: calc.billedMinutes,
          rateLabel: calc.rateLabel,
          amount: calc.amount
        });

        if (rec.approvalStatus === 'Menunggu Persetujuan') {
          row.pendingOvertimeSessions += 1;
        }

        if (calc.eligible) {
          row.sundayOvertimeSessions += 1;
          row.totalOvertimeMinutes += calc.billedMinutes;
          row.totalOvertimePay += calc.amount;
          if (category === 'Lembur Terencana') {
            row.plannedOvertimeSessions += 1;
            row.plannedOvertimeMinutes += calc.billedMinutes;
            row.plannedOvertimePay += calc.amount;
          } else {
            row.unscheduledOvertimeSessions += 1;
            row.unscheduledOvertimeMinutes += calc.billedMinutes;
            row.unscheduledOvertimePay += calc.amount;
          }
        }
      }
    }
  });

  // Finalize grand total & sort
  const rows = Array.from(rowMap.values())
    .map((r) => ({
      ...r,
      grandTotal: r.totalSalaryPay + r.totalFeePay + r.totalOvertimePay
    }))
    .sort((a, b) => b.grandTotal - a.grandTotal || a.staffName.localeCompare(b.staffName));

  overtimeDetails.sort((a, b) => b.record.date.localeCompare(a.record.date));

  const totals = rows.reduce(
    (acc, r) => {
      acc.baseSalaryPay += r.baseSalaryPay;
      acc.fixedAllowancePay += r.fixedAllowancePay;
      acc.totalSalaryPay += r.totalSalaryPay;
      acc.totalFeePay += r.totalFeePay;
      acc.totalPatients += r.patientCount;
      acc.plannedOvertimePay += r.plannedOvertimePay;
      acc.unscheduledOvertimePay += r.unscheduledOvertimePay;
      acc.totalOvertimePay += r.totalOvertimePay;
      acc.totalOvertimeMinutes += r.totalOvertimeMinutes;
      acc.sundayOvertimeSessions += r.sundayOvertimeSessions;
      acc.pendingOvertimeSessions += r.pendingOvertimeSessions;
      acc.grandTotal += r.grandTotal;
      return acc;
    },
    {
      baseSalaryPay: 0,
      fixedAllowancePay: 0,
      totalSalaryPay: 0,
      totalFeePay: 0,
      totalPatients: 0,
      plannedOvertimePay: 0,
      unscheduledOvertimePay: 0,
      totalOvertimePay: 0,
      totalOvertimeMinutes: 0,
      sundayOvertimeSessions: 0,
      pendingOvertimeSessions: 0,
      grandTotal: 0
    }
  );

  return {
    rows,
    overtimeDetails,
    periodDays,
    effectiveSalaryMode,
    totals
  };
};
