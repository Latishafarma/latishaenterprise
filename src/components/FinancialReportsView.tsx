import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Boxes,
  Truck,
  Printer,
  Calendar,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Users,
  CheckCircle2,
  UserCheck,
  Award,
  Filter,
  Stethoscope,
  RotateCcw,
  ClipboardCheck,
  Wallet,
  Flame,
  Download
} from 'lucide-react';
import {
  Transaction,
  Medicine,
  PurchaseInvoice,
  RMERecord,
  Doctor,
  Staff,
  StaffFeeItem,
  StockOpnameRecord,
  StockOpnameItemRecord,
  ProductDisposalRecord,
  StockMutation,
  FeeConfig,
  DutySchedule,
  StaffAttendanceRecord,
  StaffFeeLedgerEntry,
  isOwnerAdminRole
} from '../types';
import {
  buildUnifiedDisposalLossRecords,
  computeDisposalRecordTotalLoss,
  summarizeDisposalLosses
} from '../utils/disposalLossHelper';
import { openPrintWindow } from '../utils/printHelper';
import { isOpeningDebtInvoice } from '../utils/supabaseClient';
import { PaginationControls } from './PaginationControls';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';
import { useFacilityProfiles, formatPharmacyAddress } from '../utils/facilityProfileHelper';
import {
  ATTENDANCE_UPDATED_EVENT,
  formatIsoToIdDate,
  formatMinutesDuration,
  loadLocalAttendanceRecords,
  syncAllAttendanceWithSupabase
} from '../utils/attendanceService';
import {
  PAYROLL_CONFIG_UPDATED_EVENT,
  PAYROLL_ROLE_LIST,
  buildStaffPayrollSummary,
  loadLocalPayrollConfig
} from '../utils/payrollService';
import { isDemoMode } from '../utils/demoSandbox';
import { isJasaCartItem } from '../utils/transactionPrintHelper';
import {
  loadLocalFeeLedger,
  resolveTransactionStaffFees,
  summarizeLedgerRevenueSplit
} from '../utils/serviceFeeHelper';
import { getDeletedIdsSet } from '../utils/deletionRegistry';

interface FinancialReportsViewProps {
  transactions: Transaction[];
  medicines: Medicine[];
  purchaseInvoices: PurchaseInvoice[];
  rmeRecords: RMERecord[];
  doctors: Doctor[];
  staffList?: Staff[];
  opnameRecords?: StockOpnameRecord[];
  disposalRecords?: ProductDisposalRecord[];
  stockMutations?: StockMutation[];
  feeConfig?: FeeConfig;
  schedules?: DutySchedule[];
  feeLedger?: StaffFeeLedgerEntry[];
  initialTab?: 'laba-rugi' | 'valuasi-aset' | 'fee-medis' | 'hutang-pbf' | 'hasil-stokopname' | 'kerugian-pemusnahan';
}

interface ClinicalServiceEvent {
  id: string;
  date: string;
  dateOnly: string;
  patientName: string;
  rmId?: string;
  source: 'Ruang Dokter & Kasir POS' | 'Ruang Periksa Dokter (RME)' | 'POS Kasir Langsung';
  status: 'Selesai di POS Kasir' | 'Pemeriksaan Selesai (RME Dokter)';
  assignedStaff: StaffFeeItem[];
  totalFee: number;
  trxId?: string;
  rmeId?: string;
}

export const FinancialReportsView: React.FC<FinancialReportsViewProps> = ({
  transactions,
  medicines,
  purchaseInvoices,
  rmeRecords,
  doctors,
  staffList = [],
  opnameRecords = [],
  disposalRecords = [],
  stockMutations = [],
  feeConfig,
  schedules = [],
  feeLedger: propFeeLedger,
  initialTab
}) => {
  const effectiveFeeLedger = useMemo(
    () => (propFeeLedger !== undefined ? propFeeLedger : loadLocalFeeLedger()),
    [propFeeLedger]
  );
  const { pharmacyProfile, apjProfile } = useFacilityProfiles();
  const pharmacyFullAddress = formatPharmacyAddress(pharmacyProfile);
  const toLocalYMD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const normalizeDateToYMD = (rawDate?: string): string => {
    if (!rawDate) return '';
    const trimmed = rawDate.trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return toLocalYMD(parsed);
    }
    return trimmed.split(' ')[0].split('T')[0];
  };

  const [activeTab, setActiveTab] = useState<'laba-rugi' | 'valuasi-aset' | 'fee-medis' | 'hutang-pbf' | 'hasil-stokopname' | 'kerugian-pemusnahan'>(
    initialTab || 'laba-rugi'
  );

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [startDate, setStartDate] = useState('2026-10-01');
  const [endDate, setEndDate] = useState(() => toLocalYMD(new Date()));
  const [valuationPage, setValuationPage] = useState(1);
  const [valuationPageSize, setValuationPageSize] = useState<number>(25);

  // Lazy-loaded Attendance & Payroll Config state (only syncs Supabase when tab 'fee-medis' is opened)
  const [attendanceRecords, setAttendanceRecords] = useState<StaffAttendanceRecord[]>(() =>
    loadLocalAttendanceRecords()
  );
  const [attendanceSyncedOnce, setAttendanceSyncedOnce] = useState(false);
  const [payrollRefreshTick, setPayrollRefreshTick] = useState(0);
  const [payrollRoleFilter, setPayrollRoleFilter] = useState<string>('SEMUA');
  const [salaryModeOverride, setSalaryModeOverride] = useState<'config' | 'full-month' | 'prorata-days'>('config');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onAttendanceUpdate = () => setAttendanceRecords(loadLocalAttendanceRecords());
    const onPayrollUpdate = () => setPayrollRefreshTick((t) => t + 1);
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, onAttendanceUpdate);
    window.addEventListener(PAYROLL_CONFIG_UPDATED_EVENT, onPayrollUpdate);
    return () => {
      window.removeEventListener(ATTENDANCE_UPDATED_EVENT, onAttendanceUpdate);
      window.removeEventListener(PAYROLL_CONFIG_UPDATED_EVENT, onPayrollUpdate);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'fee-medis' || attendanceSyncedOnce) return;
    setAttendanceSyncedOnce(true);
    setAttendanceRecords(loadLocalAttendanceRecords());
    if (!isDemoMode()) {
      syncAllAttendanceWithSupabase()
        .then((res) => {
          if (res.records) setAttendanceRecords(res.records);
        })
        .catch(() => {});
    }
  }, [activeTab, attendanceSyncedOnce]);

  const valuationTotalPages = Math.max(1, Math.ceil(medicines.length / valuationPageSize));
  const safeValuationPage = Math.min(valuationPage, valuationTotalPages);
  const paginatedValuationMedicines = useMemo(() => {
    const start = (safeValuationPage - 1) * valuationPageSize;
    return medicines.slice(start, start + valuationPageSize);
  }, [medicines, safeValuationPage, valuationPageSize]);

  const handleSetDatePreset = (preset: 'today' | '7days' | 'month' | 'all') => {
    const now = new Date();
    const todayStr = toLocalYMD(now);
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      setStartDate(toLocalYMD(d));
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toLocalYMD(firstDay));
      setEndDate(todayStr);
    } else if (preset === 'all') {
      setStartDate('2026-01-01');
      setEndDate(todayStr);
    }
  };

  // 1. Financial Calculations from Active Transactions (exclude cancelled/returned)
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.status === 'Dibatalkan' || t.status === 'Diretur') return false;
      const d = normalizeDateToYMD(t.date);
      return (!startDate || d >= startDate) && (!endDate || d <= endDate);
    });
  }, [transactions, startDate, endDate]);

  const totalOmzet = filteredTransactions.reduce((acc, t) => acc + t.total, 0);
  const totalHpp = filteredTransactions.reduce((acc, t) => acc + t.hppTotal, 0);
  const grossProfit = totalOmzet - totalHpp;

  // 2. Filtered RME Records from Ruang Periksa Dokter
  const filteredRmeRecords = useMemo(() => {
    return rmeRecords.filter((r) => {
      const d = normalizeDateToYMD(r.date);
      return (!startDate || d >= startDate) && (!endDate || d <= endDate);
    });
  }, [rmeRecords, startDate, endDate]);

  // 3. Active POS Fee Ledger rows in date range & Service Transactions across all POS tiers (REGULER / KLINIK / MITRA)
  const activeLedgerEntries = useMemo(() => {
    const deletedTrxIds = getDeletedIdsSet('transactions');
    const deletedLedgerIds = getDeletedIdsSet('fee_ledger');
    const activeTrxIds = new Set(
      transactions
        .filter(
          (t) =>
            t?.id &&
            t.status !== 'Dibatalkan' &&
            t.status !== 'Diretur' &&
            !deletedTrxIds.has(String(t.id).trim())
        )
        .map((t) => String(t.id).trim())
    );
    return effectiveFeeLedger.filter((e) => {
      if (!e?.id) return false;
      const cleanId = String(e.id).trim();
      const cleanTrxId = String(e.transaction_id || '').trim();
      if (deletedLedgerIds.has(cleanId) || (cleanTrxId && deletedTrxIds.has(cleanTrxId))) {
        return false;
      }
      if (!cleanTrxId || !activeTrxIds.has(cleanTrxId)) return false;
      if (e.status_pembayaran === 'dibatalkan') return false;
      if ((Number(e.total_fee_item) || 0) <= 0) return false;
      const d = normalizeDateToYMD(e.transaction_date || e.transaction_datetime);
      return (!startDate || d >= startDate) && (!endDate || d <= endDate);
    });
  }, [effectiveFeeLedger, transactions, startDate, endDate]);

  const ledgerStatusTotals = useMemo(() => {
    return activeLedgerEntries.reduce(
      (acc, e) => {
        const amt = Number(e.total_fee_item) || 0;
        if (e.status_pembayaran === 'dibayar') acc.paid += amt;
        else acc.unpaid += amt;
        return acc;
      },
      { unpaid: 0, paid: 0 }
    );
  }, [activeLedgerEntries]);

  const ledgerRevenueSplit = useMemo(
    () => summarizeLedgerRevenueSplit(activeLedgerEntries),
    [activeLedgerEntries]
  );

  const completedServiceTransactions = useMemo(() => {
    const activeLedgerTrxIds = new Set(activeLedgerEntries.map((e) => e.transaction_id));
    return filteredTransactions.filter(
      (t) =>
        t.type === 'KLINIK' ||
        (t.assignedStaff && t.assignedStaff.length > 0) ||
        (t.items || []).some(
          (it) =>
            isJasaCartItem(it) &&
            Boolean(it.petugas_id) &&
            (Number(it.total_fee_item) || 0) > 0
        ) ||
        activeLedgerTrxIds.has(t.id)
    );
  }, [filteredTransactions, activeLedgerEntries]);

  // 4. Unified Clinical & Service Events: Integrate Ruang Periksa Dokter (RME) + Multi-Tier POS Kasir + Fee Ledger
  const clinicalServiceEvents = useMemo(() => {
    const events: ClinicalServiceEvent[] = [];
    const matchedTrxIds = new Set<string>();

    // Step A: Process each examination from Ruang Periksa Dokter (RME)
    filteredRmeRecords.forEach((rme) => {
      const matchedTrx = completedServiceTransactions.find(
        (t) =>
          !matchedTrxIds.has(t.id) &&
          ((t.rmId && t.rmId === rme.rmId) ||
            t.customerName.toLowerCase() === rme.patientName.toLowerCase() ||
            (t.description && t.description.includes(rme.id)))
      );

      if (matchedTrx) {
        matchedTrxIds.add(matchedTrx.id);
      }

      const posResolved = matchedTrx
        ? resolveTransactionStaffFees(matchedTrx, effectiveFeeLedger, staffList)
        : [];

      let staffAssigned: StaffFeeItem[] = [];
      if (posResolved.length > 0) {
        staffAssigned = posResolved;
      } else if (rme.assignedStaff && rme.assignedStaff.length > 0) {
        staffAssigned = rme.assignedStaff;
      } else {
        const docName = rme.doctorName || matchedTrx?.doctorName || 'dr. Anis Prima Dewi';
        staffAssigned = [
          {
            staffId: staffList.find((s) => s.role === 'Dokter' || s.name === docName)?.id || 'STF-02',
            staffName: docName,
            role: 'Dokter',
            fee: rme.doctorFee || 20000
          }
        ];
        if (rme.medicalSupportFee) {
          staffAssigned.push({
            staffId: 'STF-03',
            staffName: 'Ns. Siti Nurhaliza, S.Kep',
            role: 'Perawat / Bidan',
            fee: rme.medicalSupportFee
          });
        }
        if (rme.adminFee) {
          staffAssigned.push({
            staffId: 'STF-04',
            staffName: 'Rina Kartika, A.Md.Farm',
            role: 'Apoteker',
            fee: rme.adminFee
          });
        }
      }

      const totalFee = staffAssigned.reduce((acc, s) => acc + s.fee, 0);

      events.push({
        id: matchedTrx ? `${rme.id} / ${matchedTrx.id}` : rme.id,
        date: rme.time ? `${rme.date} ${rme.time}` : rme.date,
        dateOnly: rme.date.split(' ')[0],
        patientName: rme.patientName,
        rmId: rme.rmId,
        source: matchedTrx ? 'Ruang Dokter & Kasir POS' : 'Ruang Periksa Dokter (RME)',
        status: matchedTrx ? 'Selesai di POS Kasir' : 'Pemeriksaan Selesai (RME Dokter)',
        assignedStaff: staffAssigned,
        totalFee,
        trxId: matchedTrx?.id,
        rmeId: rme.id
      });
    });

    // Step B: Add any POS transaction (KLINIK / REGULER / MITRA) with service fees not linked to an RME record
    completedServiceTransactions.forEach((trx) => {
      if (matchedTrxIds.has(trx.id)) return;
      matchedTrxIds.add(trx.id);

      const staffAssigned = resolveTransactionStaffFees(trx, effectiveFeeLedger, staffList);
      if (staffAssigned.length === 0) return;

      const totalFee = staffAssigned.reduce((acc, s) => acc + s.fee, 0);

      events.push({
        id: trx.id,
        date: trx.date,
        dateOnly: trx.date.split(' ')[0],
        patientName: trx.customerName,
        rmId: trx.rmId,
        source: 'POS Kasir Langsung',
        status: 'Selesai di POS Kasir',
        assignedStaff: staffAssigned,
        totalFee,
        trxId: trx.id
      });
    });

    // Step C: Any active ledger entries whose transaction_id isn't in completedServiceTransactions
    const orphanLedgerByTrx = new Map<string, StaffFeeLedgerEntry[]>();
    activeLedgerEntries.forEach((entry) => {
      if (matchedTrxIds.has(entry.transaction_id)) return;
      const list = orphanLedgerByTrx.get(entry.transaction_id) || [];
      list.push(entry);
      orphanLedgerByTrx.set(entry.transaction_id, list);
    });

    orphanLedgerByTrx.forEach((rows, trxId) => {
      const staffMap = new Map<string, StaffFeeItem>();
      rows.forEach((r) => {
        const prev = staffMap.get(r.petugas_id);
        if (prev) {
          prev.fee += Number(r.total_fee_item) || 0;
        } else {
          staffMap.set(r.petugas_id, {
            staffId: r.petugas_id,
            staffName: r.nama_petugas,
            role: r.role_petugas,
            fee: Number(r.total_fee_item) || 0
          });
        }
      });
      const assignedStaff = Array.from(staffMap.values());
      const first = rows[0];
      events.push({
        id: trxId,
        date: first.transaction_datetime || first.transaction_date,
        dateOnly: first.transaction_date,
        patientName: first.customer_name || 'Reguler',
        source: 'POS Kasir Langsung',
        status: 'Selesai di POS Kasir',
        assignedStaff,
        totalFee: assignedStaff.reduce((acc, s) => acc + s.fee, 0),
        trxId
      });
    });

    // Sort newest date first
    return events.sort((a, b) => b.date.localeCompare(a.date));
  }, [
    filteredRmeRecords,
    completedServiceTransactions,
    activeLedgerEntries,
    effectiveFeeLedger,
    staffList
  ]);

  // 5. Aggregated Fee per Staff Member (Data Pegawai) from Unified Clinical Events
  const staffFeeSummaries = useMemo(() => {
    const baseStaff: Staff[] =
      staffList.length > 0
        ? staffList
        : [
            { id: 'STF-01', name: 'apt. Mardin, S.Farm', role: 'APJ / Owner', phone: '0812-3456-7890', status: 'Aktif', branchId: 'BR-01' },
            { id: 'STF-02', name: 'dr. Anis Prima Dewi', role: 'Dokter', phone: '0813-4567-8901', status: 'Aktif', branchId: 'BR-01' },
            { id: 'STF-03', name: 'Ns. Siti Nurhaliza, S.Kep', role: 'Perawat / Bidan', phone: '0814-5678-9012', status: 'Aktif', branchId: 'BR-01' },
            { id: 'STF-04', name: 'Rina Kartika, A.Md.Farm', role: 'Apoteker', phone: '0815-6789-0123', status: 'Aktif', branchId: 'BR-01' }
          ];

    const map = new Map<
      string,
      {
        staffId: string;
        staffName: string;
        role: string;
        patientCount: number;
        totalFee: number;
        transactions: { refId: string; date: string; patientName: string; fee: number; status: string }[];
      }
    >();

    // Initialize all staff from master data pegawai
    baseStaff.forEach((s) => {
      map.set(s.id, {
        staffId: s.id,
        staffName: s.name,
        role: s.role,
        patientCount: 0,
        totalFee: 0,
        transactions: []
      });
    });

    // Accumulate fees from each clinical event
    clinicalServiceEvents.forEach((ev) => {
      ev.assignedStaff.forEach((st) => {
        let entry = map.get(st.staffId);
        if (!entry) {
          // Check by name
          const foundKey = Array.from(map.keys()).find((k) => map.get(k)?.staffName.toLowerCase() === st.staffName.toLowerCase());
          if (foundKey) entry = map.get(foundKey);
        }
        if (!entry) {
          entry = {
            staffId: st.staffId || `STF-${Math.random().toString().slice(2, 5)}`,
            staffName: st.staffName,
            role: st.role,
            patientCount: 0,
            totalFee: 0,
            transactions: []
          };
          map.set(entry.staffId, entry);
        }

        entry.patientCount += 1;
        entry.totalFee += st.fee;
        entry.transactions.push({
          refId: ev.id,
          date: ev.date,
          patientName: ev.patientName,
          fee: st.fee,
          status: ev.status
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => b.totalFee - a.totalFee || b.patientCount - a.patientCount);
  }, [clinicalServiceEvents, staffList]);

  // Total accumulated staff fees across all staff
  const totalStaffFeesAccumulated = useMemo(() => {
    return staffFeeSummaries.reduce((acc, s) => acc + s.totalFee, 0);
  }, [staffFeeSummaries]);

  // 5b. Unified Rekap Gaji, Fee, dan Lembur Hari Minggu per Pegawai
  const activePayrollConfig = useMemo(
    () => loadLocalPayrollConfig(feeConfig),
    [feeConfig, payrollRefreshTick]
  );

  const payrollSummary = useMemo(() => {
    const baseStaff: Staff[] =
      staffList.length > 0
        ? staffList
        : [
            { id: 'STF-01', name: 'apt. Mardin, S.Farm', role: 'APJ / Owner', phone: '0812-3456-7890', status: 'Aktif', branchId: 'BR-01' },
            { id: 'STF-02', name: 'dr. Anis Prima Dewi', role: 'Dokter', phone: '0813-4567-8901', status: 'Aktif', branchId: 'BR-01' },
            { id: 'STF-03', name: 'Ns. Siti Nurhaliza, S.Kep', role: 'Perawat / Bidan', phone: '0814-5678-9012', status: 'Aktif', branchId: 'BR-01' },
            { id: 'STF-04', name: 'Rina Kartika, A.Md.Farm', role: 'Apoteker', phone: '0815-6789-0123', status: 'Aktif', branchId: 'BR-01' }
          ];

    return buildStaffPayrollSummary({
      staffList: baseStaff,
      payrollConfig: activePayrollConfig,
      attendanceRecords,
      schedules,
      staffFeeInputs: staffFeeSummaries.map((s) => ({
        staffId: s.staffId,
        staffName: s.staffName,
        role: s.role,
        patientCount: s.patientCount,
        totalFee: s.totalFee
      })),
      startDate,
      endDate,
      salaryModeOverride
    });
  }, [
    staffList,
    activePayrollConfig,
    attendanceRecords,
    schedules,
    staffFeeSummaries,
    startDate,
    endDate,
    salaryModeOverride
  ]);

  const filteredPayrollRows = useMemo(() => {
    if (payrollRoleFilter === 'SEMUA') return payrollSummary.rows;
    return payrollSummary.rows.filter((r) => r.role === payrollRoleFilter);
  }, [payrollSummary.rows, payrollRoleFilter]);

  const filteredPayrollTotals = useMemo(() => {
    return filteredPayrollRows.reduce(
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
  }, [filteredPayrollRows]);

  const handleExportPayrollCsv = () => {
    const header = [
      'No',
      'ID Pegawai',
      'Nama Pegawai',
      'Peran',
      'Hadir (Hari)',
      'Cuti (Hari)',
      'Shift Aktif',
      'Gaji Pokok (Rp)',
      'Tunjangan Tetap (Rp)',
      'Total Gaji (Rp)',
      'Jumlah Pasien Fee',
      'Total Fee Layanan (Rp)',
      'Sesi Lembur Minggu',
      'Durasi Lembur (Menit)',
      'Lembur Terencana (Rp)',
      'Lembur di Luar Jadwal (Rp)',
      'Total Lembur Minggu (Rp)',
      'Total Keseluruhan Gaji + Fee + Lembur (Rp)'
    ];
    const escapeCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const bodyLines = filteredPayrollRows.map((r, i) =>
      [
        i + 1,
        r.staffId,
        r.staffName,
        r.role,
        r.presentDays,
        r.leaveDays,
        r.scheduledShiftCount,
        r.baseSalaryPay,
        r.fixedAllowancePay,
        r.totalSalaryPay,
        r.patientCount,
        r.totalFeePay,
        r.sundayOvertimeSessions,
        r.totalOvertimeMinutes,
        r.plannedOvertimePay,
        r.unscheduledOvertimePay,
        r.totalOvertimePay,
        r.grandTotal
      ]
        .map(escapeCell)
        .join(',')
    );
    const totalLine = [
      '',
      '',
      'TOTAL KESELURUHAN',
      '',
      '',
      '',
      '',
      filteredPayrollTotals.baseSalaryPay,
      filteredPayrollTotals.fixedAllowancePay,
      filteredPayrollTotals.totalSalaryPay,
      filteredPayrollTotals.totalPatients,
      filteredPayrollTotals.totalFeePay,
      filteredPayrollTotals.sundayOvertimeSessions,
      filteredPayrollTotals.totalOvertimeMinutes,
      filteredPayrollTotals.plannedOvertimePay,
      filteredPayrollTotals.unscheduledOvertimePay,
      filteredPayrollTotals.totalOvertimePay,
      filteredPayrollTotals.grandTotal
    ]
      .map(escapeCell)
      .join(',');

    const csv = '\uFEFF' + [header.map(escapeCell).join(','), ...bodyLines, totalLine].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_Gaji_Fee_Lembur_${startDate}_sd_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Categorical Breakdown for Laba Rugi Report
  const isDocFeeRole = (role?: string) => {
    const low = String(role || '').toLowerCase();
    return role === 'Dokter' || low.includes('dokter');
  };
  const isSupportFeeRole = (role?: string) => {
    const low = String(role || '').toLowerCase();
    return (
      role === 'Perawat / Bidan' ||
      role === 'Perawat / Nakes Lapangan' ||
      low.includes('perawat') ||
      low.includes('bidan') ||
      low.includes('nakes')
    );
  };
  const isPharmacistFeeRole = (role?: string) => {
    const low = String(role || '').toLowerCase();
    return (
      role === 'Apoteker' ||
      isOwnerAdminRole(role) ||
      low.includes('apoteker') ||
      low.includes('apj')
    );
  };

  const totalDoctorFee = useMemo(() => {
    if (totalStaffFeesAccumulated > 0) {
      return staffFeeSummaries
        .filter((s) => isDocFeeRole(s.role))
        .reduce((acc, s) => acc + s.totalFee, 0);
    }
    return filteredRmeRecords.reduce((acc, r) => acc + (r.doctorFee || 20000), 0);
  }, [staffFeeSummaries, totalStaffFeesAccumulated, filteredRmeRecords]);

  const totalSupportFee = useMemo(() => {
    if (totalStaffFeesAccumulated > 0) {
      return staffFeeSummaries
        .filter((s) => !isDocFeeRole(s.role) && isSupportFeeRole(s.role))
        .reduce((acc, s) => acc + s.totalFee, 0);
    }
    return filteredRmeRecords.reduce((acc, r) => acc + (r.medicalSupportFee || 5000), 0);
  }, [staffFeeSummaries, totalStaffFeesAccumulated, filteredRmeRecords]);

  const totalPharmacistFee = useMemo(() => {
    if (totalStaffFeesAccumulated > 0) {
      return staffFeeSummaries
        .filter((s) => !isDocFeeRole(s.role) && !isSupportFeeRole(s.role) && isPharmacistFeeRole(s.role))
        .reduce((acc, s) => acc + s.totalFee, 0);
    }
    return 0;
  }, [staffFeeSummaries, totalStaffFeesAccumulated]);

  const totalAdminFee = useMemo(() => {
    if (totalStaffFeesAccumulated > 0) {
      return staffFeeSummaries
        .filter(
          (s) =>
            !isDocFeeRole(s.role) &&
            !isSupportFeeRole(s.role) &&
            !isPharmacistFeeRole(s.role)
        )
        .reduce((acc, s) => acc + s.totalFee, 0);
    }
    return filteredRmeRecords.reduce((acc, r) => acc + (r.adminFee || 1000), 0);
  }, [staffFeeSummaries, totalStaffFeesAccumulated, filteredRmeRecords]);

  // Total medical fee expenses
  const totalMedicalExpenses = totalStaffFeesAccumulated > 0
    ? totalStaffFeesAccumulated
    : filteredRmeRecords.reduce((acc, r) => acc + (r.doctorFee || 20000) + (r.medicalSupportFee || 5000) + (r.adminFee || 1000), 0);

  // 6. Laporan Hasil Stokopname & Nominal Selisih Stokopname
  const allOpnameRecords = useMemo<StockOpnameRecord[]>(() => {
    const list: StockOpnameRecord[] = [...opnameRecords];
    const existingRefNos = new Set(list.map((r) => r.refNo));

    const opnameMuts = stockMutations.filter((m) => m.type === 'STOK_OPNAME' && !existingRefNos.has(m.refNo));
    if (opnameMuts.length > 0) {
      const grouped = new Map<string, StockMutation[]>();
      opnameMuts.forEach((m) => {
        const key = `${m.date}__${m.refNo}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(m);
      });

      grouped.forEach((muts, key) => {
        const first = muts[0];
        const items: StockOpnameItemRecord[] = muts.map((m) => {
          const med = medicines.find((item) => item.id === m.medicineId);
          const hpp = m.hpp ?? med?.hpp ?? 0;
          const sellPrice = med?.sellPrice ?? 0;
          const diff = m.inQty > 0 ? m.inQty : -m.outQty;
          const sysStock = m.balance - diff;
          return {
            medicineId: m.medicineId,
            medicineName: m.medicineName,
            unit: med?.unit || 'Unit',
            hpp,
            sellPrice,
            systemStock: sysStock,
            physicalStock: m.balance,
            difference: diff,
            nominalDiffHpp: diff * hpp,
            nominalDiffSell: diff * sellPrice,
            reason: m.ket
          };
        });

        const surplusItems = items.filter((i) => i.difference > 0);
        const deficitItems = items.filter((i) => i.difference < 0);
        const totalSurplusNominal = surplusItems.reduce((acc, i) => acc + i.nominalDiffHpp, 0);
        const totalDeficitNominal = deficitItems.reduce((acc, i) => acc + Math.abs(i.nominalDiffHpp), 0);

        list.push({
          id: `OPN-HIST-${key}`,
          refNo: first.refNo,
          date: normalizeDateToYMD(first.date),
          time: first.time,
          petugas: first.petugas,
          branchId: first.branchId,
          branchName: 'Apotek Latisha Farma',
          totalItemsCounted: items.length,
          matchCount: items.filter((i) => i.difference === 0).length,
          surplusCount: surplusItems.length,
          deficitCount: deficitItems.length,
          totalSurplusNominal,
          totalDeficitNominal,
          netNominalDiff: totalSurplusNominal - totalDeficitNominal,
          notes: 'Rekonsiliasi Kartu Stok Opname',
          items
        });
      });
    }

    return list.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  }, [opnameRecords, stockMutations, medicines]);

  const filteredOpnameRecords = useMemo(() => {
    return allOpnameRecords.filter((rec) => {
      const d = normalizeDateToYMD(rec.date);
      return (!startDate || d >= startDate) && (!endDate || d <= endDate);
    });
  }, [allOpnameRecords, startDate, endDate]);

  const totalOpnameSurplus = useMemo(() => {
    return filteredOpnameRecords.reduce((acc, r) => acc + r.totalSurplusNominal, 0);
  }, [filteredOpnameRecords]);

  const totalOpnameDeficit = useMemo(() => {
    return filteredOpnameRecords.reduce((acc, r) => acc + r.totalDeficitNominal, 0);
  }, [filteredOpnameRecords]);

  const netOpnameNominal = totalOpnameSurplus - totalOpnameDeficit;

  // 6b. Beban Kerugian Pemusnahan Obat ED / Rusak (HPP) — Terintegrasi Submenu Kelola Produk & Supabase
  const allDisposalRecords = useMemo<ProductDisposalRecord[]>(() => {
    return buildUnifiedDisposalLossRecords({
      disposalRecords,
      stockMutations,
      medicines
    });
  }, [disposalRecords, stockMutations, medicines]);

  const disposalLossSummary = useMemo(
    () => summarizeDisposalLosses(allDisposalRecords, startDate, endDate),
    [allDisposalRecords, startDate, endDate]
  );

  const filteredDisposalRecords = disposalLossSummary.filteredRecords;
  const totalDisposalLoss = disposalLossSummary.totalLoss;
  const totalDisposalQty = disposalLossSummary.totalQty;
  const totalDisposalItems = disposalLossSummary.totalItems;

  const estimatedNetProfit =
    grossProfit - totalMedicalExpenses + netOpnameNominal - totalDisposalLoss;

  // Central Inventory Valuation
  const totalAssetValue = medicines.reduce((acc, m) => acc + m.stock * m.hpp, 0);
  const totalRetailValue = medicines.reduce((acc, m) => acc + m.stock * m.sellPrice, 0);
  const totalStockItems = medicines.reduce((acc, m) => acc + m.stock, 0);

  // Accounts Payable to PBF (termasuk faktur pembelian yang sudah diproses & saldo hutang awal yang belum/sebagian lunas)
  const unpaidInvoices = purchaseInvoices.filter((i) => i.processingStatus !== 'DRAFT' && i.status !== 'Lunas');
  const totalHutangPbf = unpaidInvoices.reduce((acc, i) => {
    const paid = i.paidAmount !== undefined ? i.paidAmount : 0;
    const rem = i.remainingAmount !== undefined ? i.remainingAmount : Math.max(0, i.totalTagihan - paid);
    return acc + rem;
  }, 0);

  return (
    <div className="space-y-4">
      {/* Top Header & Sub-Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-3 no-print">
        <div>
          <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Laporan Keuangan Otomatis Terintegrasi Inventaris Pusat
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Laba rugi real-time, laporan hasil stokopname, beban kerugian pemusnahan obat, valuasi aset, rekap gaji, fee & lembur Minggu, serta hutang PBF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('laba-rugi')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'laba-rugi'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Laba Rugi Otomatis
          </button>
          <button
            onClick={() => setActiveTab('hasil-stokopname')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'hasil-stokopname'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Laporan Hasil Stokopname</span>
          </button>
          <button
            onClick={() => setActiveTab('kerugian-pemusnahan')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'kerugian-pemusnahan'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Beban Pemusnahan</span>
          </button>
          <button
            onClick={() => setActiveTab('valuasi-aset')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'valuasi-aset'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Valuasi Aset Inventaris
          </button>
          <button
            onClick={() => setActiveTab('fee-medis')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'fee-medis'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Rekap Gaji, Fee, dan Lembur</span>
          </button>
          <button
            onClick={() => setActiveTab('hutang-pbf')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'hutang-pbf'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Hutang Faktur PBF
          </button>

          <button
            onClick={() =>
              openPrintWindow('laporan-keuangan', {
                tab: activeTab,
                startDate,
                endDate,
                salaryMode: salaryModeOverride
              })
            }
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Laporan</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-xs no-print">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Total Penjualan Kasir (Omzet)
          </span>
          <div className="font-mono font-black text-lg text-slate-900 mt-1">
            Rp {totalOmzet.toLocaleString('id-ID')}
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">
            {filteredTransactions.length} Struk Transaksi
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            HPP Obat Terjual (COGS)
          </span>
          <div className="font-mono font-black text-lg text-amber-700 mt-1">
            Rp {totalHpp.toLocaleString('id-ID')}
          </div>
          <span className="text-[10px] text-slate-500 font-semibold mt-1 block">
            Margin Kotor: Rp {grossProfit.toLocaleString('id-ID')}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Nominal Selisih Stokopname
          </span>
          <div
            className={`font-mono font-black text-lg mt-1 ${
              netOpnameNominal > 0
                ? 'text-blue-700'
                : netOpnameNominal < 0
                ? 'text-rose-600'
                : 'text-slate-900'
            }`}
          >
            {netOpnameNominal >= 0 ? '+' : '-'}Rp {Math.abs(netOpnameNominal).toLocaleString('id-ID')}
          </div>
          <span className="text-[10px] text-slate-500 font-semibold mt-1 block">
            {filteredOpnameRecords.length} Sesi (+Rp {totalOpnameSurplus.toLocaleString('id-ID')} / -Rp {totalOpnameDeficit.toLocaleString('id-ID')})
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-200/80 shadow-xs">
          <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider block">
            Beban Kerugian Pemusnahan
          </span>
          <div
            className={`font-mono font-black text-lg mt-1 ${
              totalDisposalLoss > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {totalDisposalLoss > 0 ? '-' : ''}Rp {totalDisposalLoss.toLocaleString('id-ID')}
          </div>
          <span className="text-[10px] text-slate-500 font-semibold mt-1 block">
            {filteredDisposalRecords.length} Berita Acara · {totalDisposalQty.toLocaleString('id-ID')} Unit (HPP)
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Estimasi Laba Bersih
          </span>
          <div
            className={`font-mono font-black text-lg mt-1 ${
              estimatedNetProfit < 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {estimatedNetProfit < 0 ? '-' : ''}Rp {Math.abs(estimatedNetProfit).toLocaleString('id-ID')}
          </div>
          <span className="text-[10px] text-slate-500 font-semibold mt-1 block">
            Jasa Medis: Rp {totalMedicalExpenses.toLocaleString('id-ID')} · Musnah: Rp {totalDisposalLoss.toLocaleString('id-ID')}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Valuasi Stok Fisik Pusat (HPP)
          </span>
          <div className="font-mono font-black text-lg text-sky-800 mt-1">
            Rp {totalAssetValue.toLocaleString('id-ID')}
          </div>
          <span className="text-[10px] text-slate-500 font-semibold mt-1 block">
            {totalStockItems} Unit · Jual: Rp {totalRetailValue.toLocaleString('id-ID')}
          </span>
        </div>
      </div>

      {/* Main Printable Section */}
      <div
        id="printable-section"
        className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6 text-xs text-slate-800"
      >
        <div className="border-b-2 border-slate-900 pb-4">
          <div className="flex items-center justify-between gap-4">
            {pharmacyProfile.logoUrl ? (
              <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                <img
                  src={pharmacyProfile.logoUrl}
                  alt="Logo Faskes"
                  className="w-16 h-16 object-contain"
                />
              </div>
            ) : (
              <div className="w-16 shrink-0" />
            )}
            <div className="flex-1 text-center">
              <h2 className="font-black text-base text-slate-900 uppercase">
                {pharmacyProfile.name}
              </h2>
              <p className="text-[11px] text-slate-600">
                {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
              </p>
              <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                {[
                  pharmacyProfile.sia ? `SIA: ${pharmacyProfile.sia}` : '',
                  pharmacyProfile.nib ? `NIB: ${pharmacyProfile.nib}` : '',
                  pharmacyProfile.npwp ? `NPWP: ${pharmacyProfile.npwp}` : ''
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="w-16 shrink-0" />
          </div>
              <div className="text-center">
                <div className="mt-2 inline-block px-4 py-1 bg-emerald-50 text-emerald-900 rounded-full font-black text-xs uppercase border border-emerald-300">
                  {activeTab === 'laba-rugi' && 'LAPORAN LABA RUGI OPERASIONAL, HASIL STOKOPNAME & BEBAN PEMUSNAHAN'}
                  {activeTab === 'hasil-stokopname' && 'LAPORAN HASIL STOKOPNAME & NOMINAL SELISIH INVENTARIS'}
                  {activeTab === 'kerugian-pemusnahan' && 'LAPORAN BEBAN KERUGIAN PEMUSNAHAN OBAT ED / RUSAK (HPP)'}
                  {activeTab === 'valuasi-aset' && 'LAPORAN VALUASI ASET INVENTARIS SENTRAL'}
                  {activeTab === 'fee-medis' && 'REKAPITULASI GAJI, FEE LAYANAN MEDIS, DAN LEMBUR HARI MINGGU'}
                  {activeTab === 'hutang-pbf' && 'DAFTAR HUTANG FAKTUR PEMBELIAN SUPPLIER (PBF)'}
                </div>
              </div>

          {/* Flexible & Adjustable Date Range in Report Header (CSS selector 2) */}
          <p className="text-[11px] text-slate-700 font-bold mt-2.5 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 no-print" />
              <span>Periode Rentang Tanggal:</span>
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 text-xs outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              title="Pilih tanggal mulai periode laporan"
            />
            <span className="text-slate-500 font-extrabold">s.d.</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 text-xs outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              title="Pilih tanggal akhir periode laporan"
            />
            <span className="inline-flex items-center gap-1 ml-1 no-print">
              <button
                type="button"
                onClick={() => handleSetDatePreset('today')}
                className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-900 transition cursor-pointer"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => handleSetDatePreset('7days')}
                className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-900 transition cursor-pointer"
              >
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => handleSetDatePreset('month')}
                className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-900 transition cursor-pointer"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => handleSetDatePreset('all')}
                className="px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition cursor-pointer"
              >
                Semua
              </button>
            </span>
          </p>
        </div>

        {/* Tab 1: Laba Rugi Otomatis & Laporan Hasil Stokopname */}
        {activeTab === 'laba-rugi' && (
          <div className="space-y-4 max-w-3xl mx-auto font-mono text-xs">
            <div className="p-4 bg-slate-50 rounded-2xl border space-y-2">
              <div className="flex justify-between font-bold text-slate-900 text-sm border-b pb-2">
                <span>1. PENDAPATAN OPERASIONAL</span>
                <span>Rp {totalOmzet.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-600 pl-4">
                <span>- Penjualan Kasir Farmasi (OTC / Resep)</span>
                <span>Rp {totalOmzet.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border space-y-2">
              <div className="flex justify-between font-bold text-amber-900 text-sm border-b pb-2">
                <span>2. BEBAN POKOK PENJUALAN (HPP / COGS)</span>
                <span>(Rp {totalHpp.toLocaleString('id-ID')})</span>
              </div>
              <div className="flex justify-between text-slate-600 pl-4">
                <span>- Harga Pokok Obat Terjual (Batch Cost)</span>
                <span>Rp {totalHpp.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between font-black text-slate-900 pt-2 border-t">
                <span>LABA KOTOR (GROSS PROFIT)</span>
                <span>Rp {grossProfit.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border space-y-2">
              <div className="flex justify-between font-bold text-slate-900 text-sm border-b pb-2">
                <span>3. BIAYA JASA MEDIS & OPERASIONAL</span>
                <span>(Rp {totalMedicalExpenses.toLocaleString('id-ID')})</span>
              </div>
              <div className="flex justify-between text-slate-600 pl-4">
                <span>- Jasa Medis Pemeriksaan Dokter</span>
                <span>Rp {totalDoctorFee.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-600 pl-4">
                <span>- Jasa Penunjang Medis (Perawat / Bidan)</span>
                <span>Rp {totalSupportFee.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-600 pl-4">
                <span>- Jasa Pelayanan Kefarmasian (Apoteker / APJ)</span>
                <span>Rp {totalPharmacistFee.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-600 pl-4">
                <span>- Jasa Kasir / Front Office &amp; Petugas Lainnya</span>
                <span>Rp {totalAdminFee.toLocaleString('id-ID')}</span>
              </div>
              {ledgerRevenueSplit.serviceLineCount > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200/80 pl-4 text-[11px] flex flex-wrap justify-between gap-2 text-slate-500">
                  <span>
                    Info Bagi Hasil Jasa POS ({ledgerRevenueSplit.serviceLineCount} item layanan): Biaya Pasien{' '}
                    <strong className="text-slate-700">Rp {ledgerRevenueSplit.totalBiayaLayanan.toLocaleString('id-ID')}</strong>
                    {' − '}Fee Petugas{' '}
                    <strong className="text-indigo-700">Rp {ledgerRevenueSplit.totalFeePetugas.toLocaleString('id-ID')}</strong>
                  </span>
                  <span className="font-bold text-emerald-700">
                    Bagian Fasilitas: Rp {ledgerRevenueSplit.totalFeeFasilitas.toLocaleString('id-ID')}
                  </span>
                </div>
              )}
            </div>

            {/* 4. Laporan Hasil Stokopname (Mencatat & Menyimpan Nominal Selisih Stokopname) */}
            <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200 space-y-2.5">
              <div className="flex justify-between items-center font-bold text-indigo-950 text-sm border-b border-indigo-200 pb-2">
                <span className="flex items-center gap-2">
                  <span>4. LAPORAN HASIL STOKOPNAME (NOMINAL SELISIH STOK)</span>
                </span>
                <span
                  className={
                    netOpnameNominal > 0
                      ? 'text-blue-700'
                      : netOpnameNominal < 0
                      ? 'text-rose-700'
                      : 'text-emerald-700'
                  }
                >
                  {netOpnameNominal >= 0 ? '+' : '-'}Rp {Math.abs(netOpnameNominal).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex justify-between text-slate-700 pl-4">
                <span>- Selisih Lebih Stokopname / Surplus Fisik ({filteredOpnameRecords.reduce((a, r) => a + r.surplusCount, 0)} Item)</span>
                <span className="text-blue-700 font-bold">+Rp {totalOpnameSurplus.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-700 pl-4">
                <span>- Selisih Kurang Stokopname / Beban Susut Fisik ({filteredOpnameRecords.reduce((a, r) => a + r.deficitCount, 0)} Item)</span>
                <span className="text-rose-700 font-bold">(Rp {totalOpnameDeficit.toLocaleString('id-ID')})</span>
              </div>
              <div className="flex justify-between font-black text-indigo-950 pt-2 border-t border-indigo-200 pl-4">
                <span>TOTAL NOMINAL SELISIH STOKOPNAME BERSIH ({filteredOpnameRecords.length} Sesi Opname)</span>
                <span>
                  {netOpnameNominal >= 0 ? '+' : '-'}Rp {Math.abs(netOpnameNominal).toLocaleString('id-ID')}
                </span>
              </div>

              {filteredOpnameRecords.length > 0 && (
                <div className="pt-2 border-t border-indigo-200/80 font-sans">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase text-indigo-900">
                      Rincian Dokumen Hasil Stokopname Terimpan ({startDate} s.d. {endDate}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('hasil-stokopname')}
                      className="text-[10px] font-bold text-indigo-700 hover:underline no-print cursor-pointer"
                    >
                      Lihat Tabel Lengkap Hasil Stokopname →
                    </button>
                  </div>
                  <div className="overflow-x-auto bg-white rounded-xl border border-indigo-100">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="bg-indigo-100/60 text-indigo-950 font-bold text-[10px] uppercase">
                        <tr>
                          <th className="p-2 border">No. Ref Opname</th>
                          <th className="p-2 border">Tanggal & Waktu</th>
                          <th className="p-2 border">Petugas</th>
                          <th className="p-2 border text-center">Jml Obat</th>
                          <th className="p-2 border text-right">Surplus (+)</th>
                          <th className="p-2 border text-right">Defisit (-)</th>
                          <th className="p-2 border text-right">Nominal Selisih</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {filteredOpnameRecords.map((rec) => (
                          <tr key={rec.id} className="hover:bg-slate-50">
                            <td className="p-2 border font-bold text-indigo-700">{rec.refNo}</td>
                            <td className="p-2 border">{rec.date} {rec.time}</td>
                            <td className="p-2 border font-sans">{rec.petugas}</td>
                            <td className="p-2 border text-center">{rec.totalItemsCounted}</td>
                            <td className="p-2 border text-right text-blue-700">+Rp {rec.totalSurplusNominal.toLocaleString('id-ID')}</td>
                            <td className="p-2 border text-right text-rose-700">-Rp {rec.totalDeficitNominal.toLocaleString('id-ID')}</td>
                            <td className={`p-2 border text-right font-bold ${rec.netNominalDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {rec.netNominalDiff >= 0 ? '+' : '-'}Rp {Math.abs(rec.netNominalDiff).toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Beban Kerugian Pemusnahan Obat ED / Rusak (HPP) — Terintegrasi Kelola Produk */}
            <div className="p-4 bg-rose-50/70 rounded-2xl border border-rose-200 space-y-2.5">
              <div className="flex justify-between items-center font-bold text-rose-950 text-sm border-b border-rose-200 pb-2">
                <span className="flex items-center gap-2">
                  <span>5. BEBAN KERUGIAN PEMUSNAHAN OBAT ED / RUSAK (HPP)</span>
                </span>
                <span className={totalDisposalLoss > 0 ? 'text-rose-700' : 'text-slate-700'}>
                  {totalDisposalLoss > 0 ? `(Rp ${totalDisposalLoss.toLocaleString('id-ID')})` : 'Rp 0'}
                </span>
              </div>
              <div className="flex justify-between text-slate-700 pl-4">
                <span>
                  - Beban Kerugian Pemusnahan Produk ED / Rusak ({filteredDisposalRecords.length} Berita Acara · {totalDisposalItems} Item / {totalDisposalQty.toLocaleString('id-ID')} Unit)
                </span>
                <span className="text-rose-700 font-bold">
                  (Rp {totalDisposalLoss.toLocaleString('id-ID')})
                </span>
              </div>
              <div className="flex justify-between font-black text-rose-950 pt-2 border-t border-rose-200 pl-4">
                <span>TOTAL BEBAN KERUGIAN PEMUSNAHAN OBAT (HPP)</span>
                <span>
                  {totalDisposalLoss > 0 ? `-Rp ${totalDisposalLoss.toLocaleString('id-ID')}` : 'Rp 0'}
                </span>
              </div>

              {filteredDisposalRecords.length > 0 ? (
                <div className="pt-2 border-t border-rose-200/80 font-sans">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase text-rose-900">
                      Rincian Berita Acara Pemusnahan Obat ({startDate} s.d. {endDate}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('kerugian-pemusnahan')}
                      className="text-[10px] font-bold text-rose-700 hover:underline no-print cursor-pointer"
                    >
                      Lihat Tabel Lengkap Beban Pemusnahan →
                    </button>
                  </div>
                  <div className="overflow-x-auto bg-white rounded-xl border border-rose-100">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="bg-rose-100/60 text-rose-950 font-bold text-[10px] uppercase">
                        <tr>
                          <th className="p-2 border">No. Berita Acara</th>
                          <th className="p-2 border">Tanggal &amp; Waktu</th>
                          <th className="p-2 border">Metode &amp; Petugas</th>
                          <th className="p-2 border text-center">Item / Unit</th>
                          <th className="p-2 border text-right">Beban Kerugian (HPP)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {filteredDisposalRecords.map((rec) => {
                          const recLoss = computeDisposalRecordTotalLoss(rec);
                          return (
                            <tr key={rec.id} className="hover:bg-slate-50">
                              <td className="p-2 border font-bold text-rose-700">{rec.baNumber}</td>
                              <td className="p-2 border">{rec.date}{rec.time ? ` ${rec.time}` : ''}</td>
                              <td className="p-2 border font-sans">
                                <span className="font-semibold text-slate-800">{rec.method}</span>
                                <span className="block text-[10px] text-slate-500">Petugas: {rec.petugas}</span>
                              </td>
                              <td className="p-2 border text-center">
                                {rec.totalItems} / {rec.totalQty.toLocaleString('id-ID')}
                              </td>
                              <td className="p-2 border text-right font-bold text-rose-700">
                                -Rp {recLoss.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] font-sans text-rose-800/80 pl-4">
                  Setiap proses pemusnahan obat pada menu Inventaris &rarr; Kelola Produk otomatis tercatat di sini sebagai beban kerugian (HPP) yang mengurangi Laba Bersih Apotek.
                </p>
              )}
            </div>

            <div
              className={`p-5 rounded-2xl border-2 flex flex-wrap justify-between items-center gap-2 font-black text-base ${
                estimatedNetProfit < 0
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-950'
              }`}
            >
              <div>
                <span className="block">ESTIMASI LABA BERSIH (NET PROFIT):</span>
                <span className="block text-[10px] font-sans font-semibold opacity-75 mt-0.5">
                  Laba Kotor − Biaya Jasa Medis ± Selisih Stokopname − Beban Kerugian Pemusnahan (HPP)
                </span>
              </div>
              <span>
                {estimatedNetProfit < 0 ? '-' : ''}Rp {Math.abs(estimatedNetProfit).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        )}

        {/* Tab Laporan Hasil Stokopname Lengkap */}
        {activeTab === 'hasil-stokopname' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] font-sans font-bold uppercase text-slate-400 block">
                  Total Kegiatan Opname
                </span>
                <span className="text-lg font-black text-slate-900 mt-0.5 block">
                  {filteredOpnameRecords.length} Sesi Opname
                </span>
              </div>
              <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-2xl">
                <span className="text-[10px] font-sans font-bold uppercase text-blue-700 block">
                  Nominal Selisih Lebih (+)
                </span>
                <span className="text-lg font-black text-blue-800 mt-0.5 block">
                  +Rp {totalOpnameSurplus.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-2xl">
                <span className="text-[10px] font-sans font-bold uppercase text-rose-700 block">
                  Nominal Selisih Kurang (-)
                </span>
                <span className="text-lg font-black text-rose-800 mt-0.5 block">
                  -Rp {totalOpnameDeficit.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                <span className="text-[10px] font-sans font-bold uppercase text-emerald-800 block">
                  Nominal Selisih Bersih
                </span>
                <span className={`text-lg font-black mt-0.5 block ${netOpnameNominal >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                  {netOpnameNominal >= 0 ? '+' : '-'}Rp {Math.abs(netOpnameNominal).toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {filteredOpnameRecords.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-slate-500">
                <p className="font-bold text-slate-700">
                  Belum ada catatan Laporan Hasil Stokopname pada periode {startDate} s.d. {endDate}.
                </p>
                <p className="text-[11px] mt-1">
                  Setiap kegiatan stokopname yang diterapkan pada menu Inventaris &rarr; Stok Opname otomatis tercatat beserta nominal selisihnya di laporan ini.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOpnameRecords.map((rec) => (
                  <div key={rec.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="p-3.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-black text-indigo-700 mr-2">{rec.refNo}</span>
                        <span className="font-bold text-slate-800">{rec.date} · {rec.time}</span>
                        <span className="ml-2 text-[11px] text-slate-600">Petugas: <strong>{rec.petugas}</strong></span>
                      </div>
                      <div className="font-mono font-black text-xs">
                        Nominal Selisih Bersih:{' '}
                        <span className={rec.netNominalDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {rec.netNominalDiff >= 0 ? '+' : '-'}Rp {Math.abs(rec.netNominalDiff).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 font-bold uppercase text-[10px] text-slate-600">
                        <tr>
                          <th className="p-2.5 border">Nama Obat / Barang</th>
                          <th className="p-2.5 border text-center">Stok Sistem</th>
                          <th className="p-2.5 border text-center">Stok Fisik</th>
                          <th className="p-2.5 border text-center">Selisih Fisik</th>
                          <th className="p-2.5 border text-right">HPP Satuan</th>
                          <th className="p-2.5 border text-right">Nominal Selisih (HPP)</th>
                          <th className="p-2.5 border">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y font-medium text-slate-700">
                        {rec.items.map((it, idx) => (
                          <tr key={`${rec.id}-${idx}`} className="hover:bg-slate-50">
                            <td className="p-2.5 border font-bold text-slate-900">{it.medicineName}</td>
                            <td className="p-2.5 border text-center font-mono">{it.systemStock} {it.unit}</td>
                            <td className="p-2.5 border text-center font-mono font-bold">{it.physicalStock} {it.unit}</td>
                            <td className="p-2.5 border text-center font-mono font-bold">
                              <span className={it.difference > 0 ? 'text-blue-700' : it.difference < 0 ? 'text-rose-700' : 'text-emerald-700'}>
                                {it.difference > 0 ? `+${it.difference}` : it.difference} {it.unit}
                              </span>
                            </td>
                            <td className="p-2.5 border text-right font-mono">Rp {it.hpp.toLocaleString('id-ID')}</td>
                            <td className={`p-2.5 border text-right font-mono font-black ${it.nominalDiffHpp > 0 ? 'text-blue-700' : it.nominalDiffHpp < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {it.nominalDiffHpp >= 0 ? '+' : '-'}Rp {Math.abs(it.nominalDiffHpp).toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 border text-slate-600">{it.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Beban Kerugian Pemusnahan Obat ED / Rusak (HPP) */}
        {activeTab === 'kerugian-pemusnahan' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] font-sans font-bold uppercase text-slate-400 block">
                  Total Berita Acara
                </span>
                <span className="text-lg font-black text-slate-900 mt-0.5 block">
                  {filteredDisposalRecords.length} Dokumen BA
                </span>
              </div>
              <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl">
                <span className="text-[10px] font-sans font-bold uppercase text-amber-800 block">
                  Total Item / Unit Dimusnahkan
                </span>
                <span className="text-lg font-black text-amber-900 mt-0.5 block">
                  {totalDisposalItems} Item · {totalDisposalQty.toLocaleString('id-ID')} Unit
                </span>
              </div>
              <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl">
                <span className="text-[10px] font-sans font-bold uppercase text-rose-700 block">
                  Total Beban Kerugian (HPP)
                </span>
                <span className="text-lg font-black text-rose-800 mt-0.5 block">
                  -Rp {totalDisposalLoss.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] font-sans font-bold uppercase text-slate-500 block">
                  Rata-rata Beban per BA
                </span>
                <span className="text-lg font-black text-slate-800 mt-0.5 block">
                  Rp{' '}
                  {filteredDisposalRecords.length > 0
                    ? Math.round(totalDisposalLoss / filteredDisposalRecords.length).toLocaleString('id-ID')
                    : '0'}
                </span>
              </div>
            </div>

            {filteredDisposalRecords.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-slate-500">
                <p className="font-bold text-slate-700">
                  Belum ada beban kerugian pemusnahan obat pada periode {startDate} s.d. {endDate}.
                </p>
                <p className="text-[11px] mt-1">
                  Setiap proses pemusnahan obat ED/rusak pada menu Inventaris &rarr; Kelola Produk otomatis tercatat sebagai beban kerugian HPP di laporan ini dan memotong Laba Bersih Apotek.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredDisposalRecords.map((rec) => {
                  const recLoss = computeDisposalRecordTotalLoss(rec);
                  return (
                    <div key={rec.id} className="border border-rose-200/80 rounded-2xl overflow-hidden">
                      <div className="p-3.5 bg-rose-50/70 border-b border-rose-200/80 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-black text-rose-700 mr-2">{rec.baNumber}</span>
                          <span className="font-bold text-slate-800">
                            {rec.date}{rec.time ? ` · ${rec.time}` : ''}
                          </span>
                          <span className="ml-2 text-[11px] text-slate-600">
                            Petugas: <strong>{rec.petugas}</strong> · Metode: <strong>{rec.method}</strong>
                          </span>
                          {rec.witness && rec.witness !== '-' && (
                            <span className="ml-2 text-[11px] text-slate-500">
                              Saksi: {rec.witness}
                            </span>
                          )}
                        </div>
                        <div className="font-mono font-black text-xs text-rose-700">
                          Total Beban Kerugian HPP: -Rp {recLoss.toLocaleString('id-ID')}
                        </div>
                      </div>
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 font-bold uppercase text-[10px] text-slate-600">
                          <tr>
                            <th className="p-2.5 border">Nama Obat / Produk</th>
                            <th className="p-2.5 border text-center">No. Batch</th>
                            <th className="p-2.5 border text-center">Tgl ED</th>
                            <th className="p-2.5 border text-center">Jumlah Dimusnahkan</th>
                            <th className="p-2.5 border text-right">HPP Satuan</th>
                            <th className="p-2.5 border text-right">Beban Kerugian (HPP)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y font-medium text-slate-700">
                          {rec.items.map((it, idx) => (
                            <tr key={`${rec.id}-${idx}`} className="hover:bg-slate-50">
                              <td className="p-2.5 border font-bold text-slate-900">{it.name}</td>
                              <td className="p-2.5 border text-center font-mono">{it.batchNo || '-'}</td>
                              <td className="p-2.5 border text-center font-mono">{it.expDate || '-'}</td>
                              <td className="p-2.5 border text-center font-mono font-bold">
                                {it.qty.toLocaleString('id-ID')} {it.unit}
                              </td>
                              <td className="p-2.5 border text-right font-mono">
                                Rp {it.hpp.toLocaleString('id-ID')}
                              </td>
                              <td className="p-2.5 border text-right font-mono font-black text-rose-700">
                                -Rp {it.subtotal.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Valuasi Aset Inventaris */}
        {activeTab === 'valuasi-aset' && (
          <div className="space-y-4">
            <table className="w-full text-left text-xs border border-collapse">
              <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-700">
                <tr>
                  <th className="p-2.5 border">Nama Obat / Barang</th>
                  <th className="p-2.5 border text-center">Kategori</th>
                  <th className="p-2.5 border text-center w-20">Stok</th>
                  <th className="p-2.5 border text-right w-28">HPP Beli (+11%)</th>
                  <th className="p-2.5 border text-right w-28">Harga Jual</th>
                  <th className="p-2.5 border text-right w-36">Total Aset (HPP)</th>
                </tr>
              </thead>
              <tbody className="divide-y font-medium text-slate-700">
                {paginatedValuationMedicines.map((m) => {
                  const subTotalHpp = m.stock * m.hpp;
                  return (
                    <tr key={m.id} className="border-b hover:bg-slate-50">
                      <td className="p-2.5 border font-bold text-slate-900">{m.name}</td>
                      <td className="p-2.5 border text-center">
                        <div className="inline-flex items-center justify-center">
                          <MedicineCategorySymbol category={m.category} size="sm" />
                        </div>
                      </td>
                      <td className="p-2.5 border text-center font-mono font-bold">{m.stock} {m.unit}</td>
                      <td className="p-2.5 border text-right font-mono">Rp {m.hpp.toLocaleString('id-ID')}</td>
                      <td className="p-2.5 border text-right font-mono">Rp {m.sellPrice.toLocaleString('id-ID')}</td>
                      <td className="p-2.5 border text-right font-mono font-black text-sky-800">
                        Rp {subTotalHpp.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border border-slate-200 rounded-xl overflow-hidden no-print">
              <PaginationControls
                currentPage={safeValuationPage}
                totalPages={valuationTotalPages}
                totalCount={medicines.length}
                pageSize={valuationPageSize}
                onPageChange={setValuationPage}
                onPageSizeChange={(sz) => {
                  setValuationPageSize(sz);
                  setValuationPage(1);
                }}
                itemLabel="obat valuasi"
              />
            </div>
            <div className="text-right text-sm font-black font-mono text-slate-900 pt-2">
              Total Valuasi Nilai Aset Obat Sentral: <span className="text-sky-800">Rp {totalAssetValue.toLocaleString('id-ID')}</span>
            </div>
          </div>
        )}

        {/* Tab 3: Rekap Gaji, Fee, dan Lembur Per Pegawai */}
        {activeTab === 'fee-medis' && (
          <div className="space-y-6">
            {/* 1. Informational Banner & Filter Bar */}
            <div className="space-y-3">
              <div className="bg-gradient-to-r from-amber-50 via-emerald-50/50 to-indigo-50/60 p-4 rounded-2xl border border-amber-200 text-xs text-slate-700 flex items-start gap-3">
                <div className="p-2 bg-amber-500 text-slate-950 rounded-xl shrink-0 shadow-xs">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-slate-900 text-sm">
                      Rekap Gaji, Fee, dan Lembur Hari Minggu (Terintegrasi Otomatis)
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Gaji Tetap + Fee RME/POS + Lembur Minggu
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Menggabungkan secara otomatis <strong>Gaji Pokok & Tunjangan</strong> dari menu{' '}
                    <em>Gaji, Jasa, Fee & Lembur</em>, <strong>Fee Layanan Medis</strong> dari Ruang Dokter (SOAP/RME) & Kasir POS, serta{' '}
                    <strong>Lembur Khusus Hari Minggu</strong> (<em>Lembur Terencana</em> vs <em>Lembur di Luar Jadwal</em>) dari modul Kehadiran & Jadwal.
                  </p>
                </div>
              </div>

              {/* Filter Range Tanggal, Peran, Mode Gaji & Ekspor */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 no-print">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs shadow-2xs">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-500">Mulai:</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="font-mono font-bold text-slate-800 outline-none bg-transparent text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs shadow-2xs">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-500">Sampai:</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="font-mono font-bold text-slate-800 outline-none bg-transparent text-xs"
                    />
                  </div>

                  <select
                    value={payrollRoleFilter}
                    onChange={(e) => setPayrollRoleFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 outline-none"
                    title="Filter Peran Pegawai"
                  >
                    <option value="SEMUA">Semua Peran</option>
                    {PAYROLL_ROLE_LIST.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>

                  <select
                    value={salaryModeOverride}
                    onChange={(e) =>
                      setSalaryModeOverride(e.target.value as 'config' | 'full-month' | 'prorata-days')
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 outline-none"
                    title="Mode Perhitungan Gaji Periode"
                  >
                    <option value="config">
                      Gaji: Sesuai Pengaturan ({activePayrollConfig.salaryPeriodMode === 'prorata-days' ? 'Prorata' : 'Bulanan Penuh'})
                    </option>
                    <option value="full-month">Gaji: Penuh 1 Bulan</option>
                    <option value="prorata-days">Gaji: Prorata ({payrollSummary.periodDays} Hari)</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetDatePreset('today')}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDatePreset('7days')}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    7 Hari
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDatePreset('month')}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Bulan Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDatePreset('all')}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition cursor-pointer"
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPayrollCsv}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. KPI Summary Cards (4 Cards: Gaji, Fee, Lembur Minggu, Grand Total) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">
                  Total Gaji & Tunjangan
                </span>
                <span className="text-lg font-black font-mono text-slate-900 mt-0.5 block">
                  Rp {filteredPayrollTotals.totalSalaryPay.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-slate-500 font-medium mt-0.5 block">
                  Pokok: Rp {filteredPayrollTotals.baseSalaryPay.toLocaleString('id-ID')} · Tunj: Rp{' '}
                  {filteredPayrollTotals.fixedAllowancePay.toLocaleString('id-ID')}
                </span>
              </div>

              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl">
                <span className="text-[10px] uppercase font-bold text-indigo-700 block tracking-wider">
                  Total Fee Layanan Medis
                </span>
                <span className="text-lg font-black font-mono text-indigo-800 mt-0.5 block">
                  Rp {filteredPayrollTotals.totalFeePay.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-indigo-700/80 font-medium mt-0.5 block">
                  {filteredPayrollTotals.totalPatients} Alokasi Pasien · {clinicalServiceEvents.length} Layanan
                </span>
                {activeLedgerEntries.length > 0 && (
                  <span className="text-[9px] text-indigo-800 font-semibold mt-0.5 block">
                    Ledger POS — Belum: Rp {ledgerStatusTotals.unpaid.toLocaleString('id-ID')} · Lunas: Rp{' '}
                    {ledgerStatusTotals.paid.toLocaleString('id-ID')}
                  </span>
                )}
              </div>

              <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl">
                <span className="text-[10px] uppercase font-bold text-amber-800 block tracking-wider">
                  Total Lembur Hari Minggu
                </span>
                <span className="text-lg font-black font-mono text-amber-800 mt-0.5 block">
                  Rp {filteredPayrollTotals.totalOvertimePay.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-amber-900/80 font-medium mt-0.5 block">
                  {filteredPayrollTotals.sundayOvertimeSessions} Sesi ({formatMinutesDuration(filteredPayrollTotals.totalOvertimeMinutes)}) ·
                  Terencana Rp {filteredPayrollTotals.plannedOvertimePay.toLocaleString('id-ID')}
                </span>
              </div>

              <div className="p-3.5 bg-emerald-50 border-2 border-emerald-300 rounded-2xl">
                <span className="text-[10px] uppercase font-extrabold text-emerald-800 block tracking-wider">
                  Grand Total Gaji + Fee + Lembur
                </span>
                <span className="text-lg font-black font-mono text-emerald-800 mt-0.5 block">
                  Rp {filteredPayrollTotals.grandTotal.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">
                  {filteredPayrollRows.length} Pegawai · Mode{' '}
                  {payrollSummary.effectiveSalaryMode === 'prorata-days'
                    ? `Prorata (${payrollSummary.periodDays} hr)`
                    : 'Bulanan Penuh'}
                </span>
              </div>
            </div>

            {ledgerRevenueSplit.serviceLineCount > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Total Biaya Layanan POS (Pasien)
                  </span>
                  <span className="text-sm font-black font-mono text-slate-900 mt-0.5 block">
                    Rp {ledgerRevenueSplit.totalBiayaLayanan.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Dari {ledgerRevenueSplit.serviceLineCount} item jasa berpetugas
                  </span>
                </div>
                <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-indigo-700 block">
                    Total Hak Fee Petugas (Semua Role)
                  </span>
                  <span className="text-sm font-black font-mono text-indigo-800 mt-0.5 block">
                    Rp {ledgerRevenueSplit.totalFeePetugas.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-indigo-700/80">
                    Otomatis dibagi sesuai peran penerima di POS
                  </span>
                </div>
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                    Bagian / Fee Fasilitas (Bagi Hasil)
                  </span>
                  <span className="text-sm font-black font-mono text-emerald-800 mt-0.5 block">
                    Rp {ledgerRevenueSplit.totalFeeFasilitas.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-emerald-700">
                    Biaya Layanan − Total Fee Semua Petugas
                  </span>
                </div>
              </div>
            )}

            {/* 3. Tabel 1: Rekapitulasi Gaji, Fee, dan Lembur Per Pegawai */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  1. Rekapitulasi Gaji, Fee, dan Lembur Per Pegawai
                </h4>
                <span className="text-[10px] text-slate-500 font-medium">
                  Periode {startDate} s.d. {endDate} · Aturan Lembur:{' '}
                  {activePayrollConfig.sundayOvertime.calculationMode === 'per-sesi'
                    ? 'Tarif Per Sesi Minggu'
                    : 'Tarif Per Jam Minggu'}
                  {activePayrollConfig.sundayOvertime.requireApprovalForPayout
                    ? ' (Wajib Disetujui APJ / Owner)'
                    : ''}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-collapse">
                  <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-700">
                    <tr>
                      <th className="p-2.5 border w-8 text-center">No</th>
                      <th className="p-2.5 border">Pegawai & Peran</th>
                      <th className="p-2.5 border text-center w-28">Absensi & Shift</th>
                      <th className="p-2.5 border text-right w-36">Gaji & Tunjangan</th>
                      <th className="p-2.5 border text-right w-32">Fee Layanan</th>
                      <th className="p-2.5 border text-right w-40">Lembur Minggu</th>
                      <th className="p-2.5 border text-right w-40 bg-emerald-50/70 text-emerald-950">
                        Total Diterima
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-medium text-slate-700">
                    {filteredPayrollRows.map((row, idx) => (
                      <tr
                        key={row.staffId}
                        className="border-b hover:bg-slate-50 transition-colors bg-white"
                      >
                        <td className="p-2.5 border text-center font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-2.5 border">
                          <span className="font-bold text-slate-900 block">{row.staffName}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[9px] font-bold">
                              {row.role}
                            </span>
                            <span className="font-mono text-[9px] text-slate-400">{row.staffId}</span>
                          </div>
                        </td>
                        <td className="p-2.5 border text-center text-[10px]">
                          <div className="font-bold text-slate-800">
                            Hadir: {row.presentDays} · Cuti: {row.leaveDays}
                          </div>
                          <span className="text-[9px] text-slate-500 block">
                            {row.scheduledShiftCount} Shift Aktif
                          </span>
                        </td>
                        <td className="p-2.5 border text-right font-mono">
                          {row.salaryActive ? (
                            <>
                              <div className="font-bold text-slate-900">
                                Rp {row.totalSalaryPay.toLocaleString('id-ID')}
                              </div>
                              <div className="text-[9px] text-slate-500">
                                Pokok {row.baseSalaryPay.toLocaleString('id-ID')} + Tunj{' '}
                                {row.fixedAllowancePay.toLocaleString('id-ID')}
                              </div>
                            </>
                          ) : (
                            <span className="text-[10px] font-sans text-slate-400 italic">
                              Rp 0 (Mode Fee Saja)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 border text-right font-mono">
                          <div className="font-bold text-indigo-700">
                            Rp {row.totalFeePay.toLocaleString('id-ID')}
                          </div>
                          <div className="text-[9px] text-slate-500">
                            {row.patientCount} Pasien / Trx
                          </div>
                        </td>
                        <td className="p-2.5 border text-right font-mono">
                          <div className="font-bold text-amber-800">
                            Rp {row.totalOvertimePay.toLocaleString('id-ID')}
                          </div>
                          {row.sundayOvertimeSessions > 0 ? (
                            <div className="text-[9px] text-slate-500">
                              {row.sundayOvertimeSessions} Sesi ({formatMinutesDuration(row.totalOvertimeMinutes)})
                              {row.plannedOvertimeSessions > 0 && ` · Terencana ${row.plannedOvertimeSessions}`}
                              {row.unscheduledOvertimeSessions > 0 && ` · Luar Jadwal ${row.unscheduledOvertimeSessions}`}
                            </div>
                          ) : (
                            <div className="text-[9px] text-slate-400">
                              {row.pendingOvertimeSessions > 0
                                ? `${row.pendingOvertimeSessions} sesi menunggu APJ`
                                : '0 Sesi Minggu'}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 border text-right font-mono font-black text-emerald-800 text-sm bg-emerald-50/40">
                          Rp {row.grandTotal.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100/90 font-black border-t-2 border-slate-300">
                      <td colSpan={3} className="p-2.5 text-right uppercase text-[11px] text-slate-800">
                        Total Keseluruhan Periode ({startDate} s.d. {endDate}):
                      </td>
                      <td className="p-2.5 border text-right font-mono text-slate-900">
                        Rp {filteredPayrollTotals.totalSalaryPay.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2.5 border text-right font-mono text-indigo-800">
                        Rp {filteredPayrollTotals.totalFeePay.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2.5 border text-right font-mono text-amber-800">
                        Rp {filteredPayrollTotals.totalOvertimePay.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2.5 border text-right font-mono text-emerald-900 text-sm bg-emerald-100/60">
                        Rp {filteredPayrollTotals.grandTotal.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 4. Tabel 2: Rincian Sesi Lembur Khusus Hari Minggu */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-600" />
                  2. Rincian Sesi Lembur Khusus Hari Minggu (Terencana vs Di Luar Jadwal)
                </h4>
                <span className="text-[10px] text-slate-500 font-medium">
                  {payrollSummary.overtimeDetails.length} catatan lembur hari Minggu pada periode ini
                </span>
              </div>

              {payrollSummary.overtimeDetails.length === 0 ? (
                <div className="p-4 text-center bg-amber-50/40 border border-dashed border-amber-200 rounded-xl text-slate-500 text-[11px]">
                  Belum ada catatan sesi lembur hari Minggu pada periode {startDate} s.d. {endDate}. Lembur dicatat dari submenu{' '}
                  <strong>Jadwal Dokter & Petugas Apotek &rarr; Kehadiran, Cuti & Lembur Minggu</strong> atau Mode Mobile Lapangan.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-collapse">
                    <thead className="bg-amber-50 font-bold uppercase text-[10px] text-amber-950">
                      <tr>
                        <th className="p-2 border">Tanggal (Minggu)</th>
                        <th className="p-2 border">Nama Pegawai</th>
                        <th className="p-2 border">Kategori Lembur</th>
                        <th className="p-2 border text-center">Jam Aktual</th>
                        <th className="p-2 border text-center">Durasi Dihitung</th>
                        <th className="p-2 border text-right">Tarif</th>
                        <th className="p-2 border text-center">Status APJ</th>
                        <th className="p-2 border text-right">Nominal Lembur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-700">
                      {payrollSummary.overtimeDetails.map((item) => (
                        <tr key={item.record.id} className="hover:bg-slate-50 bg-white">
                          <td className="p-2 border font-mono font-bold text-slate-800">
                            {formatIsoToIdDate(item.record.date)}
                          </td>
                          <td className="p-2 border">
                            <span className="font-bold text-slate-900">{item.record.staffName}</span>
                            <span className="text-[10px] text-slate-500 block">{item.record.staffRole}</span>
                          </td>
                          <td className="p-2 border">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                item.category === 'Lembur Terencana'
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {item.category}
                            </span>
                          </td>
                          <td className="p-2 border text-center font-mono text-[11px]">
                            {item.record.checkInTime || '--:--'} – {item.record.checkOutTime || '--:--'}
                          </td>
                          <td className="p-2 border text-center font-mono font-bold">
                            {formatMinutesDuration(item.billedMinutes || item.record.overtimeMinutes)}
                          </td>
                          <td className="p-2 border text-right font-mono text-[11px] text-slate-600">
                            {item.rateLabel}
                          </td>
                          <td className="p-2 border text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                item.record.approvalStatus === 'Disetujui'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.record.approvalStatus === 'Ditolak'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.record.approvalStatus}
                            </span>
                          </td>
                          <td className="p-2 border text-right font-mono font-black text-amber-800">
                            {item.eligible ? (
                              `Rp ${item.amount.toLocaleString('id-ID')}`
                            ) : (
                              <span className="text-[10px] font-sans font-semibold text-slate-400">
                                Rp 0 ({item.reason})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 5. Tabel 3: Log Detail Transaksi Pasien Klinik & Alokasi Petugas yang Bertugas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-600" />
                  3. Log Detail Transaksi Pasien Klinik & Alokasi Fee Petugas
                </h4>
                <span className="text-[10px] text-slate-500 font-medium">
                  {clinicalServiceEvents.length} pelayanan pasien (Ruang Periksa Dokter & Kasir POS)
                </span>
              </div>

              {clinicalServiceEvents.length === 0 ? (
                <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl text-slate-400">
                  <p className="font-semibold">Belum ada data pemeriksaan pasien klinik pada periode ini ({startDate} s.d. {endDate}).</p>
                  <p className="text-[11px] mt-1">
                    Lakukan pemeriksaan di menu 'Ruang Dokter (SOAP)' atau selesaikan transaksi di 'POS Kasir' untuk melihat rincian alokasi fee di sini.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border border-collapse">
                  <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-700">
                    <tr>
                      <th className="p-2.5 border w-32">No. RME / Struk</th>
                      <th className="p-2.5 border w-32">Waktu Layanan</th>
                      <th className="p-2.5 border">Nama Pasien</th>
                      <th className="p-2.5 border">Petugas yang Bertugas (Multi-Petugas)</th>
                      <th className="p-2.5 border text-right">Rincian Alokasi Fee</th>
                      <th className="p-2.5 border text-right w-28">Total Fee</th>
                      <th className="p-2.5 border text-center w-36">Sumber & Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-medium text-slate-700">
                    {clinicalServiceEvents.map((ev) => {
                      return (
                        <tr key={ev.id} className="border-b hover:bg-slate-50">
                          <td className="p-2.5 border font-mono font-bold text-sky-700">
                            {ev.id}
                          </td>
                          <td className="p-2.5 border font-mono text-slate-600 text-[11px]">
                            {ev.date}
                          </td>
                          <td className="p-2.5 border">
                            <span className="font-bold text-slate-900 block">{ev.patientName}</span>
                            {ev.rmId && (
                              <span className="font-mono text-[10px] text-slate-400">{ev.rmId}</span>
                            )}
                          </td>
                          <td className="p-2.5 border">
                            <div className="flex flex-wrap gap-1">
                              {ev.assignedStaff.map((s, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 text-[10px] font-medium"
                                >
                                  <strong>{s.staffName}</strong>
                                  <span className="text-[9px] text-indigo-600">({s.role})</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-2.5 border text-right text-[11px] font-mono">
                            {ev.assignedStaff.map((s, sIdx) => (
                              <div key={sIdx} className="text-slate-700">
                                {s.staffName.split(',')[0].replace('dr. ', '')}:{' '}
                                <strong className="text-emerald-700">
                                  Rp {s.fee.toLocaleString('id-ID')}
                                </strong>
                              </div>
                            ))}
                          </td>
                          <td className="p-2.5 border text-right font-mono font-black text-emerald-800 text-xs">
                            Rp {ev.totalFee.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5 border text-center">
                            <div className="space-y-0.5">
                              <span
                                className={`px-2 py-0.5 rounded-full font-bold text-[9px] border inline-block ${
                                  ev.status === 'Selesai di POS Kasir'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                                }`}
                              >
                                {ev.status}
                              </span>
                              <span className="text-[9px] text-slate-400 block font-medium">
                                {ev.source}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Riwayat Catatan Pelayanan RME Referensi */}
            {filteredRmeRecords.length > 0 && (
              <details className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <summary className="font-bold text-slate-700 cursor-pointer select-none">
                  Lihat Riwayat Pemeriksaan SOAP / RME Dokter ({filteredRmeRecords.length} Catatan Pemeriksaan)
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs border border-collapse">
                    <thead className="bg-slate-200 font-bold uppercase text-[9px] text-slate-700">
                      <tr>
                        <th className="p-2 border">Waktu RME</th>
                        <th className="p-2 border">Pasien (RM)</th>
                        <th className="p-2 border">Dokter Pemeriksa</th>
                        <th className="p-2 border text-right">Fee Dokter</th>
                        <th className="p-2 border text-right">Fee Penunjang</th>
                        <th className="p-2 border text-right">Fee Admin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-700">
                      {filteredRmeRecords.map((r) => (
                        <tr key={r.id} className="border-b bg-white">
                          <td className="p-2 border font-mono text-[10px]">{r.date} {r.time}</td>
                          <td className="p-2 border font-bold">{r.patientName} ({r.rmId})</td>
                          <td className="p-2 border">{r.doctorName}</td>
                          <td className="p-2 border text-right font-mono text-emerald-700">
                            Rp {(r.doctorFee || 20000).toLocaleString('id-ID')}
                          </td>
                          <td className="p-2 border text-right font-mono text-indigo-700">
                            Rp {(r.medicalSupportFee || 5000).toLocaleString('id-ID')}
                          </td>
                          <td className="p-2 border text-right font-mono text-amber-700">
                            Rp {(r.adminFee || 1000).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}

        {/* Tab 4: Hutang Faktur PBF */}
        {activeTab === 'hutang-pbf' && (
          <div className="space-y-4">
            <table className="w-full text-left text-xs border border-collapse">
              <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-700">
                <tr>
                  <th className="p-2.5 border">No. Faktur</th>
                  <th className="p-2.5 border">Supplier PBF</th>
                  <th className="p-2.5 border">Tgl Faktur</th>
                  <th className="p-2.5 border text-rose-600">Jatuh Tempo</th>
                  <th className="p-2.5 border text-right">Total Tagihan</th>
                  <th className="p-2.5 border text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y font-medium text-slate-700">
                {purchaseInvoices
                  .filter((inv) => inv.processingStatus !== 'DRAFT')
                  .map((inv) => {
                  const paid = inv.paidAmount !== undefined ? inv.paidAmount : inv.status === 'Lunas' ? inv.totalTagihan : 0;
                  const rem = inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, inv.totalTagihan - paid);
                  return (
                    <tr key={inv.id} className="border-b hover:bg-slate-50">
                      <td className="p-2.5 border font-mono font-bold text-sky-700">
                        <span>{inv.invoiceNo}</span>
                        {isOpeningDebtInvoice(inv) && (
                          <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-extrabold uppercase">
                            Hutang Awal
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 border font-bold">{inv.pbfName}</td>
                      <td className="p-2.5 border font-mono">{inv.date}</td>
                      <td className="p-2.5 border font-mono font-bold text-rose-600">{inv.dueDate}</td>
                      <td className="p-2.5 border text-right font-mono font-black">
                        <div>Rp {inv.totalTagihan.toLocaleString('id-ID')}</div>
                        {inv.status !== 'Lunas' && rem !== inv.totalTagihan && (
                          <div className="text-[10px] font-semibold text-rose-600">
                            Sisa: Rp {rem.toLocaleString('id-ID')}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 border text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            inv.status === 'Lunas'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'Sebagian'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-right text-sm font-bold font-mono text-rose-700 pt-2">
              Total Hutang Dagang PBF Belum Lunas: Rp {totalHutangPbf.toLocaleString('id-ID')}
            </div>
          </div>
        )}

        {/* Signature Terintegrasi Profil Apotek */}
        {(() => {

          if (activeTab === 'laba-rugi') {
            return (
              <div className="grid grid-cols-2 pt-8 text-xs">
                <div />
                <div className="text-center space-y-14">
                  <p className="font-semibold text-slate-700">
                    {pharmacyProfile.city}, {new Date().toLocaleDateString('id-ID')}<br />
                    Pimpinan,
                  </p>
                  <div>
                    <p className="font-extrabold underline text-slate-900">
                      {apjProfile.name || 'apt. Mardin, S.Farm'}
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-2 pt-8 text-xs">
              <div />
              <div className="text-center space-y-12">
                <p className="font-semibold text-slate-700">
                  {pharmacyProfile.city}, {new Date().toLocaleDateString('id-ID')}<br />
                  Disahkan oleh Apoteker Penanggung Jawab (APJ),
                </p>
                <div>
                  <p className="font-extrabold underline text-slate-900">{apjProfile.name}</p>
                  <p className="text-[10px] text-slate-600 font-mono">SIPA: {apjProfile.sipa}</p>
                  <p className="text-[10px] text-slate-500 font-mono">STRA: {apjProfile.stra}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
