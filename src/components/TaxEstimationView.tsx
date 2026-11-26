import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code,
  Copy,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  History,
  Info,
  Layers,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Users,
  X
} from 'lucide-react';
import {
  Branch,
  DutySchedule,
  FeeConfig,
  Pph21StaffBreakdown,
  PphAuditEntry,
  PphMonthlySnapshot,
  PtkpStatus,
  Staff,
  StaffFeeLedgerEntry,
  StaffTaxCategory,
  TaxScopeMode,
  Transaction,
  WpOpTaxConfig,
  WpOpTaxScheme
} from '../types';
import {
  PTKP_OPTIONS,
  UMKM_ANNUAL_LIMIT_48B,
  UMKM_FREE_THRESHOLD_500M,
  calculatePph21Breakdown,
  calculateWpOpProductTax,
  exportTaxEstimationCsv,
  loadLocalPphAuditLogs,
  loadLocalPphSnapshots,
  loadLocalWpOpTaxConfig,
  saveLocalPphAuditLogs,
  saveLocalPphSnapshots,
  saveLocalWpOpTaxConfig
} from '../utils/taxService';
import {
  SUPABASE_PPH_WPOP_SQL_SCHEMA,
  deletePphSnapshotFromSupabase,
  fetchPphAuditFromSupabase,
  fetchPphSnapshotsFromSupabase,
  fetchWpOpTaxConfigFromSupabase,
  insertPphAuditToSupabase,
  syncPphSnapshotToSupabase,
  syncWpOpTaxConfigToSupabase
} from '../utils/supabaseClient';
import { isDemoMode } from '../utils/demoSandbox';

interface TaxEstimationViewProps {
  transactions: Transaction[];
  staffList: Staff[];
  branches: Branch[];
  feeConfig: FeeConfig;
  schedules: DutySchedule[];
  feeLedger: StaffFeeLedgerEntry[];
  currentBranch: string;
  userName: string;
  isDemoSandbox?: boolean;
  onUpdateStaff: (updated: Staff) => void;
  onAddAuditLog?: (module: string, detail: string) => void;
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

const formatRp = (val: number): string =>
  `Rp ${Math.round(Number(val) || 0).toLocaleString('id-ID')}`;

const getSchemeLabel = (scheme: WpOpTaxScheme): string => {
  if (scheme === 'umkm_final') return 'PPh Final UMKM 0,5%';
  if (scheme === 'pasal_17_pembukuan') return 'Tarif Umum Pasal 17 (Pembukuan)';
  return 'NPPN (Norma Penghitungan Neto)';
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const getMonthBounds = (year: number, month: number): { start: string; end: string } => {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`
  };
};

export const TaxEstimationView: React.FC<TaxEstimationViewProps> = ({
  transactions,
  staffList,
  branches,
  feeConfig,
  schedules,
  feeLedger,
  currentBranch,
  userName,
  isDemoSandbox = false,
  onUpdateStaff,
  onAddAuditLog
}) => {
  const now = new Date();
  const [config, setConfig] = useState<WpOpTaxConfig>(() => loadLocalWpOpTaxConfig());
  const [snapshots, setSnapshots] = useState<PphMonthlySnapshot[]>(() => loadLocalPphSnapshots());
  const [auditLogs, setAuditLogs] = useState<PphAuditEntry[]>(() => loadLocalPphAuditLogs());

  // Period & scope filters
  const [periodMode, setPeriodMode] = useState<'monthly' | 'custom'>('monthly');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [customStart, setCustomStart] = useState<string>(
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`
  );
  const [customEnd, setCustomEnd] = useState<string>(now.toISOString().slice(0, 10));
  const [scopeMode, setScopeMode] = useState<TaxScopeMode>(config.scopeMode || 'gabungan_wpop');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    currentBranch && currentBranch !== 'ALL' ? currentBranch : branches[0]?.id || 'BR-01'
  );
  const [activeScheme, setActiveScheme] = useState<WpOpTaxScheme>(config.scheme || 'umkm_final');

  // Snapshot vs Live view toggle
  const [preferSnapshotView, setPreferSnapshotView] = useState<boolean>(true);

  // Navigation subtabs
  const [activeSubTab, setActiveSubTab] = useState<
    'produk' | 'pph21' | 'simulasi' | 'histori'
  >('produk');

  // Supabase & feedback states
  const [isLoadingCloud, setIsLoadingCloud] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [needsTableSetup, setNeedsTableSetup] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [showSqlModal, setShowSqlModal] = useState<boolean>(false);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [configDraft, setConfigDraft] = useState<WpOpTaxConfig>(config);

  // Mixed transactions inspection filter & pagination
  const [mixedSearch, setMixedSearch] = useState<string>('');
  const [showAllMixed, setShowAllMixed] = useState<boolean>(false);

  // Inline Staff Tax Quick Edit
  const [editingStaffRow, setEditingStaffRow] = useState<Pph21StaffBreakdown | null>(null);
  const [staffTaxDraft, setStaffTaxDraft] = useState<{
    npwpNik: string;
    ptkpStatus: PtkpStatus;
    taxCategory: StaffTaxCategory;
  }>({ npwpNik: '', ptkpStatus: 'TK/0', taxCategory: 'pegawai_tetap' });

  // Delete confirmation (no window.confirm)
  const [pendingDeleteSnapId, setPendingDeleteSnapId] = useState<string | null>(null);

  // "What-If" Simulation states (in-memory only)
  const [simScheme, setSimScheme] = useState<WpOpTaxScheme>('umkm_final');
  const [simTurnoverInput, setSimTurnoverInput] = useState<string>('');
  const [simExpenseInput, setSimExpenseInput] = useState<string>('');
  const [simNppnRateInput, setSimNppnRateInput] = useState<string>('30');
  const [simSalaryFeeScale, setSimSalaryFeeScale] = useState<number>(100);

  const hasMountedFetchRef = useRef<boolean>(false);

  const effectivePeriod = useMemo(() => {
    if (periodMode === 'monthly') {
      const bounds = getMonthBounds(selectedYear, selectedMonth);
      return {
        taxYear: selectedYear,
        taxMonth: selectedMonth,
        periodKey: `${selectedYear}-${pad2(selectedMonth)}`,
        periodLabel: `${MONTH_NAMES_ID[selectedMonth - 1]} ${selectedYear}`,
        start: bounds.start,
        end: bounds.end
      };
    }
    const safeStart = customStart || `${selectedYear}-01-01`;
    const safeEnd = customEnd && customEnd >= safeStart ? customEnd : safeStart;
    const yr = Number(safeStart.slice(0, 4)) || selectedYear;
    const mo = Number(safeStart.slice(5, 7)) || 1;
    return {
      taxYear: yr,
      taxMonth: mo,
      periodKey: `${safeStart}_to_${safeEnd}`,
      periodLabel: `${safeStart} s/d ${safeEnd}`,
      start: safeStart,
      end: safeEnd
    };
  }, [periodMode, selectedYear, selectedMonth, customStart, customEnd]);

  const effectiveBranchId = scopeMode === 'gabungan_wpop' ? 'ALL' : selectedBranchId;
  const effectiveBranchName = useMemo(() => {
    if (scopeMode === 'gabungan_wpop') return 'Gabungan WP OP (Semua Cabang)';
    return branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId;
  }, [scopeMode, selectedBranchId, branches]);

  // Lazy load config, snapshots & audit logs from Supabase only when view is opened
  const syncFromSupabase = async (silent = false) => {
    if (isDemoSandbox || isDemoMode()) return;
    setIsLoadingCloud(true);
    try {
      const [cfgRes, snapRes, auditRes] = await Promise.all([
        fetchWpOpTaxConfigFromSupabase(),
        fetchPphSnapshotsFromSupabase(),
        fetchPphAuditFromSupabase()
      ]);

      if (cfgRes.needsTableSetup || snapRes.needsTableSetup || auditRes.needsTableSetup) {
        setNeedsTableSetup(true);
      } else {
        setNeedsTableSetup(false);
      }

      if (cfgRes.data) {
        const mergedCfg = saveLocalWpOpTaxConfig(cfgRes.data);
        setConfig(mergedCfg);
        setConfigDraft(mergedCfg);
        setActiveScheme(mergedCfg.scheme);
        setScopeMode(mergedCfg.scopeMode);
      }
      if (snapRes.data) {
        setSnapshots(snapRes.data);
        saveLocalPphSnapshots(snapRes.data);
      }
      if (auditRes.data) {
        setAuditLogs(auditRes.data);
        saveLocalPphAuditLogs(auditRes.data);
      }
      if (!silent) {
        setStatusBanner({
          type: 'success',
          text: 'Konfigurasi pajak, histori snapshot bulanan, dan log audit berhasil disinkronkan dari Supabase.'
        });
      }
    } catch (err: any) {
      if (!silent) {
        setStatusBanner({
          type: 'error',
          text: err?.message || 'Gagal mengambil data estimasi PPh dari Supabase.'
        });
      }
    } finally {
      setIsLoadingCloud(false);
    }
  };

  useEffect(() => {
    if (hasMountedFetchRef.current) return;
    hasMountedFetchRef.current = true;
    syncFromSupabase(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Matching saved monthly snapshot for instant historical rendering
  const matchingSnapshot = useMemo(() => {
    if (periodMode !== 'monthly') return null;
    return (
      snapshots.find(
        (s) =>
          s.periodKey === effectivePeriod.periodKey &&
          s.scopeMode === scopeMode &&
          s.branchId === effectiveBranchId &&
          s.scheme === activeScheme
      ) ||
      snapshots.find(
        (s) =>
          s.periodKey === effectivePeriod.periodKey &&
          s.scopeMode === scopeMode &&
          s.branchId === effectiveBranchId
      ) ||
      null
    );
  }, [snapshots, periodMode, effectivePeriod.periodKey, scopeMode, effectiveBranchId, activeScheme]);

  const isUsingSnapshotPreview = Boolean(matchingSnapshot && preferSnapshotView);

  // Live PPh 21 calculation (computed from staff salaries + Sunday overtime + fee ledger/POS)
  const livePph21 = useMemo(() => {
    return calculatePph21Breakdown({
      staffList,
      transactions,
      feeLedger,
      feeConfig,
      schedules,
      periodStart: effectivePeriod.start,
      periodEnd: effectivePeriod.end,
      scopeMode,
      branchId: effectiveBranchId
    });
  }, [
    staffList,
    transactions,
    feeLedger,
    feeConfig,
    schedules,
    effectivePeriod.start,
    effectivePeriod.end,
    scopeMode,
    effectiveBranchId
  ]);

  // Live WP OP Product-Only tax calculation (strictly excludes jasa & serviceCharge)
  const liveProductTax = useMemo(() => {
    return calculateWpOpProductTax({
      transactions,
      taxYear: effectivePeriod.taxYear,
      periodStart: effectivePeriod.start,
      periodEnd: effectivePeriod.end,
      scopeMode,
      branchId: effectiveBranchId,
      config: { ...config, scheme: activeScheme },
      payrollSalaryAndOvertimeExpense: livePph21.totalPayrollSalaryAndOvertime
    });
  }, [
    transactions,
    effectivePeriod.taxYear,
    effectivePeriod.start,
    effectivePeriod.end,
    scopeMode,
    effectiveBranchId,
    config,
    activeScheme,
    livePph21.totalPayrollSalaryAndOvertime
  ]);

  // Displayed KPI numbers (from saved snapshot when instant-view active, otherwise live)
  const displayedSummary = useMemo(() => {
    if (isUsingSnapshotPreview && matchingSnapshot) {
      return {
        estimatedPphUsaha: matchingSnapshot.estimatedPphUsaha,
        estimatedPph21: matchingSnapshot.estimatedPph21,
        totalEstimatedPph: matchingSnapshot.totalEstimatedPph,
        productTurnoverPeriod: matchingSnapshot.productTurnoverPeriod,
        productTurnoverYtd: matchingSnapshot.productTurnoverYtd,
        excludedJasaTotal: matchingSnapshot.excludedJasaTotal,
        totalGrossTransactions: matchingSnapshot.totalGrossTransactions,
        productHppPeriod: matchingSnapshot.productHppPeriod,
        freeThreshold500mUsed: matchingSnapshot.freeThreshold500mUsed,
        freeThreshold500mRemaining: matchingSnapshot.freeThreshold500mRemaining,
        limit48bRemaining: matchingSnapshot.limit48bRemaining,
        pph21Rows: matchingSnapshot.staffPph21Details || livePph21.rows,
        scheme: matchingSnapshot.scheme
      };
    }
    return {
      estimatedPphUsaha: liveProductTax.estimatedPphUsaha,
      estimatedPph21: livePph21.totalPph21,
      totalEstimatedPph: liveProductTax.estimatedPphUsaha + livePph21.totalPph21,
      productTurnoverPeriod: liveProductTax.productTurnoverPeriod,
      productTurnoverYtd: liveProductTax.ytdProductTurnoverAfterPeriod,
      excludedJasaTotal: liveProductTax.totalExcludedJasaAndService,
      totalGrossTransactions: liveProductTax.totalGrossTransactions,
      productHppPeriod: liveProductTax.productHppPeriod,
      freeThreshold500mUsed: liveProductTax.freeThreshold500mUsed,
      freeThreshold500mRemaining: liveProductTax.freeThreshold500mRemaining,
      limit48bRemaining: liveProductTax.limit48bRemaining,
      pph21Rows: livePph21.rows,
      scheme: activeScheme
    };
  }, [isUsingSnapshotPreview, matchingSnapshot, liveProductTax, livePph21, activeScheme]);

  // Sync What-If baseline defaults when switching to simulation or changing live period
  useEffect(() => {
    setSimScheme(activeScheme);
    setSimTurnoverInput(String(liveProductTax.productTurnoverPeriod));
    setSimExpenseInput(String(liveProductTax.pembukuanOperationalExpense));
    setSimNppnRateInput(String(config.nppnRatePercent || 30));
    setSimSalaryFeeScale(100);
  }, [
    activeScheme,
    liveProductTax.productTurnoverPeriod,
    liveProductTax.pembukuanOperationalExpense,
    config.nppnRatePercent
  ]);

  const simulationResult = useMemo(() => {
    const simTurnover =
      simTurnoverInput.trim() === ''
        ? liveProductTax.productTurnoverPeriod
        : Math.max(0, Number(simTurnoverInput) || 0);
    const simExpense =
      simExpenseInput.trim() === ''
        ? liveProductTax.pembukuanOperationalExpense
        : Math.max(0, Number(simExpenseInput) || 0);
    const simNppn = Math.max(1, Math.min(100, Number(simNppnRateInput) || 30));

    const simPph21 = calculatePph21Breakdown({
      staffList,
      transactions,
      feeLedger,
      feeConfig,
      schedules,
      periodStart: effectivePeriod.start,
      periodEnd: effectivePeriod.end,
      scopeMode,
      branchId: effectiveBranchId,
      whatIfSalaryAndFeeScalePercent: simSalaryFeeScale
    });

    const simProductTax = calculateWpOpProductTax({
      transactions,
      taxYear: effectivePeriod.taxYear,
      periodStart: effectivePeriod.start,
      periodEnd: effectivePeriod.end,
      scopeMode,
      branchId: effectiveBranchId,
      config: { ...config, nppnRatePercent: simNppn },
      payrollSalaryAndOvertimeExpense: simPph21.totalPayrollSalaryAndOvertime,
      overridePeriodProductTurnover: simTurnover,
      overridePeriodOperationalExpense: simExpense,
      overrideScheme: simScheme
    });

    return {
      productTax: simProductTax,
      pph21: simPph21,
      totalPph: simProductTax.estimatedPphUsaha + simPph21.totalPph21
    };
  }, [
    simTurnoverInput,
    simExpenseInput,
    simNppnRateInput,
    simSalaryFeeScale,
    simScheme,
    liveProductTax.productTurnoverPeriod,
    liveProductTax.pembukuanOperationalExpense,
    staffList,
    transactions,
    feeLedger,
    feeConfig,
    schedules,
    effectivePeriod,
    scopeMode,
    effectiveBranchId,
    config
  ]);

  const recordTaxAudit = async (
    actionType: PphAuditEntry['actionType'],
    summary: string,
    payloadSnapshot?: Record<string, any>
  ) => {
    const entry: PphAuditEntry = {
      id: `PPH-AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      actionType,
      summary,
      actorName: userName || 'Admin',
      branchId: effectiveBranchId,
      payloadSnapshot,
      createdAt: new Date().toISOString()
    };
    const next = [entry, ...auditLogs].slice(0, 100);
    setAuditLogs(next);
    saveLocalPphAuditLogs(next);
    if (onAddAuditLog) onAddAuditLog('Estimasi PPh (WP OP)', summary);
    if (!isDemoSandbox && !isDemoMode()) {
      await insertPphAuditToSupabase(entry);
    }
  };

  const handleSaveSnapshot = async () => {
    if (periodMode !== 'monthly') {
      setStatusBanner({
        type: 'info',
        text: 'Snapshot bulanan hanya tersedia pada filter Mode Bulanan (YYYY-MM). Silakan pilih bulan terlebih dahulu.'
      });
      return;
    }

    setIsSaving(true);
    const snapId = `SNAP-${effectivePeriod.periodKey}-${scopeMode}-${effectiveBranchId}`;
    const nowIso = new Date().toISOString();
    const newSnap: PphMonthlySnapshot = {
      id: snapId,
      taxYear: effectivePeriod.taxYear,
      taxMonth: effectivePeriod.taxMonth,
      periodKey: effectivePeriod.periodKey,
      periodStart: effectivePeriod.start,
      periodEnd: effectivePeriod.end,
      scopeMode,
      branchId: effectiveBranchId,
      branchName: effectiveBranchName,
      scheme: activeScheme,
      totalGrossTransactions: liveProductTax.totalGrossTransactions,
      excludedJasaTotal: liveProductTax.totalExcludedJasaAndService,
      productTurnoverPeriod: liveProductTax.productTurnoverPeriod,
      productTurnoverYtd: liveProductTax.ytdProductTurnoverAfterPeriod,
      productHppPeriod: liveProductTax.productHppPeriod,
      freeThreshold500mUsed: liveProductTax.freeThreshold500mUsed,
      freeThreshold500mRemaining: liveProductTax.freeThreshold500mRemaining,
      limit48bRemaining: liveProductTax.limit48bRemaining,
      estimatedPphUsaha: liveProductTax.estimatedPphUsaha,
      estimatedPph21: livePph21.totalPph21,
      totalEstimatedPph: liveProductTax.estimatedPphUsaha + livePph21.totalPph21,
      staffPph21Details: livePph21.rows,
      configSnapshot: { ...config, scheme: activeScheme, scopeMode },
      savedBy: userName || 'Admin',
      savedAt: nowIso,
      updatedAt: nowIso
    };

    const nextSnapshots = [newSnap, ...snapshots.filter((s) => s.id !== snapId)];
    setSnapshots(nextSnapshots);
    saveLocalPphSnapshots(nextSnapshots);
    setPreferSnapshotView(true);

    let cloudMsg = 'Tersimpan di penyimpanan lokal.';
    if (!isDemoSandbox && !isDemoMode()) {
      const res = await syncPphSnapshotToSupabase(newSnap);
      if (res.success) {
        cloudMsg = 'Tersimpan lokal & tersinkron ke Supabase.';
      } else if (res.needsTableSetup) {
        setNeedsTableSetup(true);
        cloudMsg = 'Tersimpan lokal. Jalankan Skema SQL Supabase agar sinkronisasi cloud aktif.';
      } else if (res.error) {
        cloudMsg = `Tersimpan lokal (${res.error}).`;
      }
    }

    await recordTaxAudit(
      'SNAPSHOT_SAVE',
      `Simpan snapshot bulanan ${effectivePeriod.periodLabel} (${effectiveBranchName} · ${getSchemeLabel(activeScheme)}): Total PPh ${formatRp(newSnap.totalEstimatedPph)}`,
      {
        periodKey: newSnap.periodKey,
        estimatedPphUsaha: newSnap.estimatedPphUsaha,
        estimatedPph21: newSnap.estimatedPph21
      }
    );

    setIsSaving(false);
    setStatusBanner({
      type: 'success',
      text: `Snapshot ${effectivePeriod.periodLabel} berhasil disimpan. ${cloudMsg}`
    });
  };

  const handleDeleteSnapshot = async (snap: PphMonthlySnapshot) => {
    const next = snapshots.filter((s) => s.id !== snap.id);
    setSnapshots(next);
    saveLocalPphSnapshots(next);
    setPendingDeleteSnapId(null);

    if (!isDemoSandbox && !isDemoMode()) {
      await deletePphSnapshotFromSupabase(snap.id);
    }
    await recordTaxAudit(
      'SNAPSHOT_DELETE',
      `Hapus snapshot ${snap.periodKey} (${snap.branchName})`
    );
    setStatusBanner({
      type: 'info',
      text: `Snapshot periode ${snap.periodKey} (${snap.branchName}) telah dihapus.`
    });
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const saved = saveLocalWpOpTaxConfig({
      ...configDraft,
      updatedBy: userName || 'Admin'
    });
    setConfig(saved);
    setActiveScheme(saved.scheme);
    setScopeMode(saved.scopeMode);
    setShowConfigModal(false);

    let msg = 'Pengaturan WP OP diperbarui secara lokal.';
    if (!isDemoSandbox && !isDemoMode()) {
      const res = await syncWpOpTaxConfigToSupabase(saved);
      if (res.success) {
        msg = 'Pengaturan WP OP diperbarui & tersinkron ke Supabase.';
      } else if (res.needsTableSetup) {
        setNeedsTableSetup(true);
        msg = 'Pengaturan WP OP tersimpan lokal. Buat tabel Supabase lewat tombol Skema SQL.';
      }
    }

    await recordTaxAudit(
      'CONFIG_UPDATE',
      `Update pengaturan WP OP: Skema ${getSchemeLabel(saved.scheme)}, Cakupan ${saved.scopeMode === 'gabungan_wpop' ? 'Gabungan WP OP' : 'Per Unit/Cabang'}, PTKP ${saved.ownerPtkpStatus}`,
      { scheme: saved.scheme, scopeMode: saved.scopeMode, ownerPtkpStatus: saved.ownerPtkpStatus }
    );

    setIsSaving(false);
    setStatusBanner({ type: 'success', text: msg });
  };

  const handleSaveStaffTaxRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffRow) return;
    const target = staffList.find((s) => s.id === editingStaffRow.staffId);
    if (!target) return;

    const updatedStaff: Staff = {
      ...target,
      npwpNik: staffTaxDraft.npwpNik.trim(),
      ptkpStatus: staffTaxDraft.ptkpStatus,
      taxCategory: staffTaxDraft.taxCategory
    };
    onUpdateStaff(updatedStaff);
    await recordTaxAudit(
      'STAFF_TAX_UPDATE',
      `Update profil pajak ${updatedStaff.name}: PTKP ${updatedStaff.ptkpStatus}, Kategori ${updatedStaff.taxCategory === 'pegawai_tetap' ? 'Pegawai Tetap (TER)' : 'Bukan Pegawai (DPP 50%)'}`,
      { staffId: updatedStaff.id, ptkpStatus: updatedStaff.ptkpStatus, taxCategory: updatedStaff.taxCategory }
    );
    setEditingStaffRow(null);
    setStatusBanner({
      type: 'success',
      text: `Data pajak petugas ${updatedStaff.name} berhasil diperbarui.`
    });
  };

  const handleCopySql = () => {
    navigator.clipboard?.writeText(SUPABASE_PPH_WPOP_SQL_SCHEMA);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2500);
  };

  const filteredMixedItems = useMemo(() => {
    const q = mixedSearch.trim().toLowerCase();
    const list = liveProductTax.mixedAndExcludedItems;
    if (!q) return list;
    return list.filter(
      (it) =>
        it.transactionId.toLowerCase().includes(q) ||
        it.customerName.toLowerCase().includes(q) ||
        it.type.toLowerCase().includes(q)
    );
  }, [liveProductTax.mixedAndExcludedItems, mixedSearch]);

  const visibleMixedItems = showAllMixed
    ? filteredMixedItems
    : filteredMixedItems.slice(0, 15);

  // Progress percentages for Rp500M and Rp4.8B thresholds
  const pct500m = Math.min(
    100,
    Math.round((displayedSummary.productTurnoverYtd / UMKM_FREE_THRESHOLD_500M) * 100)
  );
  const pct48b = Math.min(
    100,
    Math.round((displayedSummary.productTurnoverYtd / UMKM_ANNUAL_LIMIT_48B) * 100)
  );
  const yearsOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  return (
    <div className="space-y-4">
      {/* Disclaimer Banner */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">Estimasi & Proyeksi Pajak Internal (WP Orang Pribadi) — Bukan Dokumen SPT Resmi.</span>{' '}
            PPh Usaha dihitung eksklusif dari <span className="font-semibold">penjualan produk saja</span> (seluruh komponen jasa medis, tindakan & biaya layanan dikeluarkan otomatis). PPh Pasal 21 dipisahkan dari dasar omzet produk.
          </div>
        </div>
        <div className="text-[11px] font-mono text-amber-800 whitespace-nowrap shrink-0">
          WP OP: {config.ownerName || 'Pemilik Usaha'} · {config.ownerPtkpStatus}
        </div>
      </div>

      {/* Supabase Schema Alert if missing */}
      {needsTableSetup && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-rose-900">
            <Database className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Tabel Estimasi PPh belum tersedia di Supabase.</span>{' '}
              Data saat ini tersimpan di browser lokal. Jalankan skema SQL untuk mengaktifkan penyimpanan snapshot & pengaturan lintas perangkat.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSqlModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-medium shrink-0 cursor-pointer"
          >
            <Code className="w-3.5 h-3.5" />
            Buka Skema SQL
          </button>
        </div>
      )}

      {/* Status feedback banner */}
      {statusBanner && (
        <div
          className={`rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 text-xs ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : statusBanner.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header & Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-sky-700" />
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Estimasi PPh (Wajib Pajak Orang Pribadi)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Periode {effectivePeriod.periodLabel} · {effectiveBranchName} · {getSchemeLabel(activeScheme)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setConfigDraft(config);
                setShowConfigModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              Pengaturan WP OP
            </button>
            <button
              type="button"
              onClick={() => setShowSqlModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <Code className="w-3.5 h-3.5 text-slate-500" />
              Skema SQL
            </button>
            {!isDemoSandbox && !isDemoMode() && (
              <button
                type="button"
                onClick={() => syncFromSupabase(false)}
                disabled={isLoadingCloud}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCloud ? 'animate-spin' : ''}`} />
                Sync Supabase
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                exportTaxEstimationCsv({
                  periodLabel: effectivePeriod.periodLabel,
                  scopeLabel: effectiveBranchName,
                  productTax: liveProductTax,
                  pph21Rows: displayedSummary.pph21Rows,
                  totalPph21: displayedSummary.estimatedPph21
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleSaveSnapshot}
              disabled={isSaving || periodMode !== 'monthly'}
              title={
                periodMode !== 'monthly'
                  ? 'Pilih mode Bulanan untuk menyimpan snapshot bulanan'
                  : 'Simpan ringkasan periode ini ke Supabase'
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Simpan Snapshot Bulanan
            </button>
          </div>
        </div>

        {/* Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Mode Periode</label>
            <select
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value as 'monthly' | 'custom')}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            >
              <option value="monthly">Bulanan (Snapshot)</option>
              <option value="custom">Rentang Tanggal Kustom</option>
            </select>
          </div>

          {periodMode === 'monthly' ? (
            <>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Bulan</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                >
                  {MONTH_NAMES_ID.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Tahun Pajak</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                >
                  {yearsOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Dari Tanggal</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Sampai Tanggal</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Cakupan Konsolidasi</label>
            <div className="grid grid-cols-2 rounded-lg border border-slate-200 p-0.5 bg-slate-50 h-9">
              <button
                type="button"
                onClick={() => setScopeMode('gabungan_wpop')}
                className={`rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  scopeMode === 'gabungan_wpop'
                    ? 'bg-white text-sky-800 shadow-2xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Gabungan WP OP
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('per_unit')}
                className={`rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  scopeMode === 'per_unit'
                    ? 'bg-white text-sky-800 shadow-2xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Unit
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Unit / Cabang</label>
            <select
              value={scopeMode === 'gabungan_wpop' ? 'ALL' : selectedBranchId}
              disabled={scopeMode === 'gabungan_wpop'}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {scopeMode === 'gabungan_wpop' ? (
                <option value="ALL">Semua Cabang (WP OP Gabungan)</option>
              ) : (
                branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Skema PPh Usaha</label>
            <select
              value={activeScheme}
              onChange={(e) => setActiveScheme(e.target.value as WpOpTaxScheme)}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            >
              <option value="umkm_final">PPh Final UMKM 0,5% (PP 55/2022)</option>
              <option value="pasal_17_pembukuan">Tarif Umum Pasal 17 (Pembukuan)</option>
              <option value="nppn">NPPN (Norma Penghitungan Neto)</option>
            </select>
          </div>
        </div>

        {/* Snapshot Instant View Switcher Banner */}
        {matchingSnapshot && (
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-sky-900">
              <History className="w-4 h-4 text-sky-700 shrink-0" />
              <span>
                Snapshot tersimpan ditemukan untuk <span className="font-semibold">{matchingSnapshot.periodKey}</span>{' '}
                (disimpan {new Date(matchingSnapshot.savedAt).toLocaleString('id-ID')} oleh {matchingSnapshot.savedBy}).{' '}
                Mode tampilan saat ini:{' '}
                <span className="font-semibold">
                  {isUsingSnapshotPreview ? 'Snapshot Tersimpan (Instan)' : 'Hitung Live dari Transaksi'}
                </span>
                .
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPreferSnapshotView((v) => !v)}
              className="px-2.5 py-1 rounded-md border border-sky-300 bg-white hover:bg-sky-50 text-sky-800 font-medium text-[11px] shrink-0 cursor-pointer"
            >
              {isUsingSnapshotPreview ? 'Ganti ke Hitung Live' : 'Lihat Snapshot Tersimpan'}
            </button>
          </div>
        )}
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Estimasi PPh Penjualan Produk</span>
            <Layers className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900">
            {formatRp(displayedSummary.estimatedPphUsaha)}
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 leading-snug">
            {isUsingSnapshotPreview ? 'Dari snapshot tersimpan' : liveProductTax.effectiveRateLabel}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Omzet Produk Murni</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {formatRp(displayedSummary.productTurnoverPeriod)}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Estimasi PPh Pasal 21 (Petugas)</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900">
            {formatRp(displayedSummary.estimatedPph21)}
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 leading-snug">
            TER PP 58/2023 (Tetap) & DPP 50% (Nakes/Dokter)
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Petugas Terhitung</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {displayedSummary.pph21Rows.length} orang
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Estimasi PPh Periode</span>
            <Calculator className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono tabular-nums text-sky-800">
            {formatRp(displayedSummary.totalEstimatedPph)}
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 leading-snug">
            PPh Penjualan Produk + PPh Pasal 21 (terpisah)
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Jasa Dikecualikan</span>
            <span className="font-mono tabular-nums font-semibold text-amber-700">
              {formatRp(displayedSummary.excludedJasaTotal)}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Akumulasi Produk YTD ({effectivePeriod.taxYear})</span>
            <Building2 className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900">
            {formatRp(displayedSummary.productTurnoverYtd)}
          </div>
          <div className="mt-2 space-y-1.5">
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                <span>Batas Bebas Rp 500 jt</span>
                <span className="font-mono tabular-nums">{pct500m}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    pct500m >= 100 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${pct500m}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                <span>Batas UMKM Rp 4,8 M</span>
                <span className="font-mono tabular-nums">{pct48b}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    pct48b >= 90 ? 'bg-rose-600' : 'bg-sky-600'
                  }`}
                  style={{ width: `${pct48b}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Banners for Rp500M / Rp4.8B / Per-Unit WP OP Consolidation */}
      {scopeMode === 'per_unit' && (
        <div className="bg-sky-50/70 border border-sky-200 rounded-xl px-4 py-2.5 flex items-start gap-2.5 text-xs text-sky-900">
          <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
          <div>
            Mode tampilan <span className="font-semibold">Per Unit ({effectiveBranchName})</span> aktif.{' '}
            Untuk kepatuhan batas bebas pajak Rp 500 juta & batas UMKM Rp 4,8 miliar WP Orang Pribadi secara nasional (satu NPWP/NIK), total akumulasi gabungan seluruh unit YTD tahun {effectivePeriod.taxYear} saat ini adalah{' '}
            <span className="font-mono font-semibold">
              {formatRp(liveProductTax.globalWpOpYtdProductTurnoverAfterPeriod)}
            </span>.
          </div>
        </div>
      )}

      {liveProductTax.exceedsUmkmLimit48b && activeScheme === 'umkm_final' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 flex items-start gap-2.5 text-xs text-rose-900">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Peringatan Batas Rp 4,8 Miliar Terlampaui:</span>{' '}
            Akumulasi penjualan produk YTD telah melebihi Rp 4,8 miliar. Sesuai PP 55/2022, pada tahun pajak berikutnya WP OP wajib menggunakan skema <span className="font-semibold">Tarif Umum Pasal 17 (Pembukuan)</span>.
          </div>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="border-b border-slate-200 px-3 sm:px-4 flex flex-wrap gap-1 bg-slate-50/70">
          {[
            { id: 'produk', label: '1. PPh Penjualan Produk (Eksklusi Jasa)', icon: FileSpreadsheet },
            { id: 'pph21', label: '2. PPh Pasal 21 (Gaji, Lembur & Fee)', icon: Users },
            { id: 'simulasi', label: '3. Simulasi "What-If"', icon: SlidersHorizontal },
            { id: 'histori', label: `4. Snapshot Bulanan & Audit (${snapshots.length})`, icon: History }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-sky-700 text-sky-800 bg-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-5">
          {/* TAB 1: PRODUCT-ONLY WP OP BREAKDOWN & JASA EXCLUSION AUDIT */}
          {activeSubTab === 'produk' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Step-by-Step Reconciliation */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                      Rekonsiliasi Dasar Omzet Produk Murni
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">
                      {liveProductTax.activeTransactionCount} trx aktif · {liveProductTax.cancelledOrReturnedExcludedCount} batal/retur diabaikan
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-600">Total Nilai Transaksi POS Bruto Aktif</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900">
                        {formatRp(liveProductTax.totalGrossTransactions)}
                      </span>
                    </div>
                    <div className="px-4 py-2.5 flex items-center justify-between bg-amber-50/40">
                      <span className="text-amber-900">
                        Dikurangi: Item Jasa Medis / Layanan POS (Dikecualikan)
                      </span>
                      <span className="font-mono tabular-nums font-medium text-amber-800">
                        - {formatRp(liveProductTax.excludedJasaServiceAmount)}
                      </span>
                    </div>
                    <div className="px-4 py-2.5 flex items-center justify-between bg-amber-50/40">
                      <span className="text-amber-900">
                        Dikurangi: Biaya Layanan / Service Charge Struk (Dikecualikan)
                      </span>
                      <span className="font-mono tabular-nums font-medium text-amber-800">
                        - {formatRp(liveProductTax.excludedServiceChargeAmount)}
                      </span>
                    </div>
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-600">
                        Dikurangi: Proporsi Diskon Global pada Produk
                      </span>
                      <span className="font-mono tabular-nums font-medium text-slate-700">
                        - {formatRp(liveProductTax.productDiscountAllocated)}
                      </span>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between bg-sky-50/60 font-semibold">
                      <span className="text-sky-950">Dasar Penjualan Produk Murni Periode Ini</span>
                      <span className="font-mono tabular-nums text-sky-900">
                        {formatRp(liveProductTax.productTurnoverPeriod)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Scheme Computation Details */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                      Perhitungan PPh Usaha ({getSchemeLabel(activeScheme)})
                    </h3>
                    <span className="text-[11px] font-medium text-sky-700">
                      PTKP WP OP: {config.ownerPtkpStatus}
                    </span>
                  </div>

                  {activeScheme === 'umkm_final' && (
                    <div className="divide-y divide-slate-100 text-xs">
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Akumulasi Penjualan Produk YTD Sebelum Periode</span>
                        <span className="font-mono tabular-nums text-slate-800">
                          {formatRp(liveProductTax.ytdProductTurnoverBeforePeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Akumulasi Penjualan Produk YTD s/d Periode Ini</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {formatRp(liveProductTax.ytdProductTurnoverAfterPeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Sisa Kuota Bebas Pajak Rp 500 Juta</span>
                        <span className="font-mono tabular-nums font-medium text-emerald-700">
                          {formatRp(liveProductTax.freeThreshold500mRemaining)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">DPP PPh Final Periode Ini (Bagian &gt; Rp 500 jt)</span>
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          {formatRp(liveProductTax.umkmTaxableBasePeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Sisa Batas Maksimal UMKM Rp 4,8 Miliar</span>
                        <span className="font-mono tabular-nums text-slate-700">
                          {formatRp(liveProductTax.limit48bRemaining)}
                        </span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between bg-sky-50/60 font-semibold">
                        <span className="text-sky-950">Estimasi PPh Final UMKM 0,5% Periode Ini</span>
                        <span className="font-mono tabular-nums text-sky-900">
                          {formatRp(liveProductTax.estimatedPphUsaha)}
                        </span>
                      </div>
                    </div>
                  )}

                  {activeScheme === 'pasal_17_pembukuan' && (
                    <div className="divide-y divide-slate-100 text-xs">
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Penjualan Produk Murni Periode</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatRp(liveProductTax.productTurnoverPeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Dikurangi: HPP Produk Terjual (Non-Jasa)</span>
                        <span className="font-mono tabular-nums text-slate-700">
                          - {formatRp(liveProductTax.productHppPeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Dikurangi: Beban Operasional & Gaji/Lembur</span>
                        <span className="font-mono tabular-nums text-slate-700">
                          - {formatRp(liveProductTax.pembukuanOperationalExpense + liveProductTax.pembukuanPayrollSalaryExpense)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Laba Neto Usaha Produk (Sebelum PTKP)</span>
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          {formatRp(liveProductTax.pembukuanNetIncomePeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">PTKP WP OP Prorata · PKP Periode</span>
                        <span className="font-mono tabular-nums text-slate-800">
                          -{formatRp(liveProductTax.ptkpPeriod)} · PKP {formatRp(liveProductTax.pkpPeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between bg-sky-50/60 font-semibold">
                        <span className="text-sky-950">Estimasi PPh Pasal 17 (Pembukuan)</span>
                        <span className="font-mono tabular-nums text-sky-900">
                          {formatRp(liveProductTax.estimatedPphUsaha)}
                        </span>
                      </div>
                    </div>
                  )}

                  {activeScheme === 'nppn' && (
                    <div className="divide-y divide-slate-100 text-xs">
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Penjualan Produk Murni Periode</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatRp(liveProductTax.productTurnoverPeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Persentase Norma (NPPN)</span>
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          {liveProductTax.nppnRatePercent}%
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">Penghasilan Neto Menurut Norma</span>
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          {formatRp(liveProductTax.nppnNetIncomePeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-slate-600">PTKP Prorata · PKP Periode</span>
                        <span className="font-mono tabular-nums text-slate-800">
                          -{formatRp(liveProductTax.ptkpPeriod)} · PKP {formatRp(liveProductTax.pkpPeriod)}
                        </span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between bg-sky-50/60 font-semibold">
                        <span className="text-sky-950">Estimasi PPh Pasal 17 (NPPN)</span>
                        <span className="font-mono tabular-nums text-sky-900">
                          {formatRp(liveProductTax.estimatedPphUsaha)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Mixed POS Transaction Separation Audit Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                      Audit Pemisahan Struk Campuran & Transaksi Bermuatan Jasa ({filteredMixedItems.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Menunjukkan transaksi POS yang memuat jasa/tindakan atau biaya layanan serta nilai produk murni yang diambil ke dasar PPh Usaha.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={mixedSearch}
                      onChange={(e) => setMixedSearch(e.target.value)}
                      placeholder="Cari No. Struk / Pasien..."
                      className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                    />
                  </div>
                </div>

                {filteredMixedItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Tidak ada transaksi campuran jasa/service charge pada periode & cakupan ini. Seluruh transaksi yang terhitung adalah penjualan produk murni.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3 font-medium">No. Transaksi</th>
                            <th className="py-2.5 px-3 font-medium">Tanggal</th>
                            <th className="py-2.5 px-3 font-medium">Pelanggan / Tipe</th>
                            <th className="py-2.5 px-3 font-medium text-right">Total Struk</th>
                            <th className="py-2.5 px-3 font-medium text-right text-amber-800">Jasa Dikecualikan</th>
                            <th className="py-2.5 px-3 font-medium text-right text-amber-800">Service Charge</th>
                            <th className="py-2.5 px-3 font-medium text-right text-sky-800">Produk Murni (Dasar PPh)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {visibleMixedItems.map((item) => (
                            <tr key={item.transactionId} className="hover:bg-slate-50/70">
                              <td className="py-2 px-3 font-mono font-medium text-slate-800">
                                {item.transactionId}
                              </td>
                              <td className="py-2 px-3 text-slate-600 font-mono">
                                {item.date.slice(0, 10)}
                              </td>
                              <td className="py-2 px-3 text-slate-700">
                                {item.customerName} · <span className="text-slate-500">{item.type}</span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                                {formatRp(item.grossTotal)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-700">
                                - {formatRp(item.excludedJasaAmount)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-700">
                                - {formatRp(item.excludedServiceCharge)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-sky-900">
                                {formatRp(item.productAmount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {filteredMixedItems.length > 15 && (
                      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowAllMixed((v) => !v)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 cursor-pointer"
                        >
                          {showAllMixed ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" /> Tampilkan Lebih Sedikit
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" /> Tampilkan Semua ({filteredMixedItems.length} transaksi)
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PPh PASAL 21 PER STAFF */}
          {activeSubTab === 'pph21' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="text-slate-600">
                  Sumber data: Gaji Pokok & Tunjangan Tetap + Lembur Minggu + Ledger Fee Layanan (<span className="font-mono">log_fee_petugas</span> / snapshot POS aktif).
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-slate-800">
                  <span>Gaji/Lembur: {formatRp(livePph21.totalPayrollSalaryAndOvertime)}</span>
                  <span>·</span>
                  <span>Fee Layanan: {formatRp(livePph21.totalServiceFeeLedgerAndPos)}</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Petugas / Peran</th>
                      <th className="py-2.5 px-3 font-medium">NPWP / NIK</th>
                      <th className="py-2.5 px-3 font-medium">PTKP / Kat.</th>
                      <th className="py-2.5 px-3 font-medium text-right">Gaji & Lembur</th>
                      <th className="py-2.5 px-3 font-medium text-right">Fee Layanan</th>
                      <th className="py-2.5 px-3 font-medium text-right">Bruto</th>
                      <th className="py-2.5 px-3 font-medium text-right">DPP</th>
                      <th className="py-2.5 px-3 font-medium">Skema / Tarif</th>
                      <th className="py-2.5 px-3 font-medium text-right">Estimasi PPh 21</th>
                      <th className="py-2.5 px-3 font-medium text-center">Pajak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedSummary.pph21Rows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-500">
                          Tidak ada data petugas aktif pada unit/periode yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      displayedSummary.pph21Rows.map((row) => (
                        <tr key={row.staffId} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{row.staffName}</div>
                            <div className="text-[11px] text-slate-500">
                              {row.role} ·{' '}
                              {row.taxCategory === 'pegawai_tetap'
                                ? 'Pegawai Tetap'
                                : 'Bukan Pegawai / Nakes'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                            {row.npwpNik || <span className="text-slate-400">Belum diisi</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800">
                            {row.ptkpStatus} {row.terCategory !== '-' ? `(${row.terCategory})` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                            {formatRp(row.salaryAndAllowance + row.sundayOvertimePay)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                            {formatRp(row.serviceFeeIncome)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                            {formatRp(row.grossIncome)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                            {formatRp(row.dppAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-600">
                            {row.rateFormulaLabel}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-800">
                            {formatRp(row.estimatedPph21)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const master = staffList.find((s) => s.id === row.staffId);
                                setEditingStaffRow(row);
                                setStaffTaxDraft({
                                  npwpNik: master?.npwpNik || row.npwpNik || '',
                                  ptkpStatus: master?.ptkpStatus || row.ptkpStatus || 'TK/0',
                                  taxCategory: master?.taxCategory || row.taxCategory
                                });
                              }}
                              title="Atur NPWP/NIK, PTKP, dan Kategori Pajak Petugas"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {displayedSummary.pph21Rows.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
                      <tr>
                        <td colSpan={3} className="py-2.5 px-3">
                          Total PPh Pasal 21 Periode Ini
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatRp(
                            displayedSummary.pph21Rows.reduce(
                              (s, r) => s + r.salaryAndAllowance + r.sundayOvertimePay,
                              0
                            )
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatRp(
                            displayedSummary.pph21Rows.reduce((s, r) => s + r.serviceFeeIncome, 0)
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatRp(
                            displayedSummary.pph21Rows.reduce((s, r) => s + r.grossIncome, 0)
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatRp(
                            displayedSummary.pph21Rows.reduce((s, r) => s + r.dppAmount, 0)
                          )}
                        </td>
                        <td className="py-2.5 px-3" />
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-900">
                          {formatRp(displayedSummary.estimatedPph21)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SIMULATOR WHAT-IF */}
          {activeSubTab === 'simulasi' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs text-slate-600">
                  Simulasi bersifat lokal (in-memory) dan tidak mengubah transaksi POS, ledger fee, atau snapshot resmi.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSimScheme(activeScheme);
                    setSimTurnoverInput(String(liveProductTax.productTurnoverPeriod));
                    setSimExpenseInput(String(liveProductTax.pembukuanOperationalExpense));
                    setSimNppnRateInput(String(config.nppnRatePercent || 30));
                    setSimSalaryFeeScale(100);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer self-start"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset ke Aktual
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5 border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
                  <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                    Parameter Simulasi "What-If"
                  </h3>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Skema PPh Usaha Simulasi
                    </label>
                    <select
                      value={simScheme}
                      onChange={(e) => setSimScheme(e.target.value as WpOpTaxScheme)}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                    >
                      <option value="umkm_final">PPh Final UMKM 0,5% (PP 55/2022)</option>
                      <option value="pasal_17_pembukuan">Tarif Umum Pasal 17 (Pembukuan)</option>
                      <option value="nppn">NPPN (Norma Penghitungan Neto)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Asumsi Omzet Penjualan Produk Periode Ini (Rp)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={simTurnoverInput}
                      onChange={(e) => setSimTurnoverInput(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-900"
                    />
                  </div>
                  {simScheme === 'pasal_17_pembukuan' && (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Asumsi Beban Operasional Periode Ini (Rp)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={simExpenseInput}
                        onChange={(e) => setSimExpenseInput(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-900"
                      />
                    </div>
                  )}
                  {simScheme === 'nppn' && (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Tarif Norma NPPN (%)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={0.5}
                        value={simNppnRateInput}
                        onChange={(e) => setSimNppnRateInput(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-900"
                      />
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between text-[11px] font-medium text-slate-600 mb-1">
                      <span>Skala Gaji, Lembur & Fee Petugas (PPh 21)</span>
                      <span className="font-mono text-slate-900">{simSalaryFeeScale}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={5}
                      value={simSalaryFeeScale}
                      onChange={(e) => setSimSalaryFeeScale(Number(e.target.value))}
                      className="w-full accent-sky-700"
                    />
                  </div>
                </div>

                <div className="lg:col-span-7 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                      Perbandingan Aktual vs Simulasi
                    </h3>
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50/70 text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Komponen Estimasi</th>
                        <th className="py-2.5 px-4 font-medium text-right">Aktual</th>
                        <th className="py-2.5 px-4 font-medium text-right text-sky-800">Simulasi</th>
                        <th className="py-2.5 px-4 font-medium text-right">Selisih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        {
                          label: 'Omzet Penjualan Produk Periode',
                          actual: liveProductTax.productTurnoverPeriod,
                          sim: simulationResult.productTax.productTurnoverPeriod
                        },
                        {
                          label: 'Akumulasi Produk YTD',
                          actual: liveProductTax.ytdProductTurnoverAfterPeriod,
                          sim: simulationResult.productTax.ytdProductTurnoverAfterPeriod
                        },
                        {
                          label: 'Estimasi PPh Usaha (Produk)',
                          actual: liveProductTax.estimatedPphUsaha,
                          sim: simulationResult.productTax.estimatedPphUsaha
                        },
                        {
                          label: 'Estimasi PPh Pasal 21 (Petugas)',
                          actual: livePph21.totalPph21,
                          sim: simulationResult.pph21.totalPph21
                        },
                        {
                          label: 'Total Beban Pajak Estimasi',
                          actual: liveProductTax.estimatedPphUsaha + livePph21.totalPph21,
                          sim: simulationResult.totalPph,
                          bold: true
                        }
                      ].map((row) => {
                        const diff = row.sim - row.actual;
                        return (
                          <tr key={row.label} className={row.bold ? 'bg-sky-50/50 font-semibold' : ''}>
                            <td className="py-2.5 px-4 text-slate-800">{row.label}</td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                              {formatRp(row.actual)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-sky-900">
                              {formatRp(row.sim)}
                            </td>
                            <td
                              className={`py-2.5 px-4 text-right font-mono tabular-nums ${
                                diff > 0
                                  ? 'text-rose-700'
                                  : diff < 0
                                  ? 'text-emerald-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {diff > 0 ? `+${formatRp(diff)}` : diff < 0 ? formatRp(diff) : 'Rp 0'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SNAPSHOTS & TAX AUDIT LOG */}
          {activeSubTab === 'histori' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-2">
                  Snapshot Estimasi Bulanan Tersimpan ({snapshots.length})
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 font-medium">Periode</th>
                        <th className="py-2.5 px-3 font-medium">Cakupan / Unit</th>
                        <th className="py-2.5 px-3 font-medium">Skema</th>
                        <th className="py-2.5 px-3 font-medium text-right">Omzet Produk</th>
                        <th className="py-2.5 px-3 font-medium text-right">Jasa Dikecualikan</th>
                        <th className="py-2.5 px-3 font-medium text-right">PPh Produk</th>
                        <th className="py-2.5 px-3 font-medium text-right">PPh 21</th>
                        <th className="py-2.5 px-3 font-medium text-right">Total PPh</th>
                        <th className="py-2.5 px-3 font-medium text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {snapshots.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-500">
                            Belum ada snapshot bulanan yang disimpan. Klik "Simpan Snapshot Bulanan" pada header untuk menyimpan histori periode aktif.
                          </td>
                        </tr>
                      ) : (
                        snapshots.map((snap) => (
                          <tr key={snap.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              {snap.periodKey}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{snap.branchName}</td>
                            <td className="py-2.5 px-3 text-slate-600">{getSchemeLabel(snap.scheme)}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                              {formatRp(snap.productTurnoverPeriod)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                              {formatRp(snap.excludedJasaTotal)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                              {formatRp(snap.estimatedPphUsaha)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                              {formatRp(snap.estimatedPph21)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-sky-900">
                              {formatRp(snap.totalEstimatedPph)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {pendingDeleteSnapId === snap.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSnapshot(snap)}
                                    className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-medium cursor-pointer"
                                  >
                                    Hapus
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteSnapId(null)}
                                    className="px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600 text-[11px] cursor-pointer"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPeriodMode('monthly');
                                      setSelectedYear(snap.taxYear);
                                      setSelectedMonth(snap.taxMonth);
                                      setScopeMode(snap.scopeMode);
                                      if (snap.scopeMode === 'per_unit') {
                                        setSelectedBranchId(snap.branchId);
                                      }
                                      setActiveScheme(snap.scheme);
                                      setPreferSnapshotView(true);
                                      setActiveSubTab('produk');
                                    }}
                                    className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-[11px] font-medium text-sky-700 cursor-pointer"
                                  >
                                    Muat
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteSnapId(snap.id)}
                                    className="p-1 rounded border border-slate-200 hover:bg-rose-50 text-rose-600 cursor-pointer"
                                    title="Hapus snapshot"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tax Audit Logs */}
              <div>
                <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-2">
                  Riwayat Perubahan Konfigurasi & Snapshot Pajak ({auditLogs.length})
                </h3>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {auditLogs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Belum ada aktivitas audit pajak yang tercatat.
                    </div>
                  ) : (
                    auditLogs.map((aud) => (
                      <div key={aud.id} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                        <div>
                          <span className="font-mono text-[11px] font-semibold text-sky-800 mr-2">
                            {aud.actionType}
                          </span>
                          <span className="text-slate-800">{aud.summary}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 whitespace-nowrap font-mono">
                          {aud.actorName} · {new Date(aud.createdAt).toLocaleString('id-ID')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Pengaturan WP OP */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Pengaturan Wajib Pajak Orang Pribadi (WP OP)
              </h3>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveConfig} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Pemilik (WP OP)</label>
                  <input
                    type="text"
                    value={configDraft.ownerName}
                    onChange={(e) => setConfigDraft({ ...configDraft, ownerName: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NPWP / NIK Pemilik</label>
                  <input
                    type="text"
                    value={configDraft.ownerNpwpNik}
                    onChange={(e) => setConfigDraft({ ...configDraft, ownerNpwpNik: e.target.value })}
                    placeholder="16 digit NIK / NPWP"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status PTKP WP OP</label>
                  <select
                    value={configDraft.ownerPtkpStatus}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, ownerPtkpStatus: e.target.value as PtkpStatus })
                    }
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white"
                  >
                    {PTKP_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Skema Default PPh Usaha</label>
                  <select
                    value={configDraft.scheme}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, scheme: e.target.value as WpOpTaxScheme })
                    }
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="umkm_final">PPh Final UMKM 0,5% (PP 55/2022)</option>
                    <option value="pasal_17_pembukuan">Tarif Umum Pasal 17 (Pembukuan)</option>
                    <option value="nppn">NPPN (Norma Penghitungan Neto)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Persentase NPPN (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={0.5}
                    value={configDraft.nppnRatePercent}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, nppnRatePercent: Number(e.target.value) || 30 })
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Beban Ops / Bulan (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    value={configDraft.monthlyOperationalExpense}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        monthlyOperationalExpense: Number(e.target.value) || 0
                      })
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Saldo Awal Omzet YTD (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    value={configDraft.manualYtdPriorTurnover}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        manualYtdPriorTurnover: Number(e.target.value) || 0
                      })
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={configDraft.includePayrollSalaryInPembukuanExpense}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      includePayrollSalaryInPembukuanExpense: e.target.checked
                    })
                  }
                  className="rounded border-slate-300 text-sky-700"
                />
                <span>Masukkan total Gaji & Lembur periode sebagai pengurang pada skema Pembukuan Pasal 17</span>
              </label>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-semibold cursor-pointer"
                >
                  Simpan Pengaturan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Inline Staff Tax Edit */}
      {editingStaffRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Profil Pajak Petugas — {editingStaffRow.staffName}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStaffRow(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveStaffTaxRow} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">NPWP / NIK Petugas</label>
                <input
                  type="text"
                  value={staffTaxDraft.npwpNik}
                  onChange={(e) => setStaffTaxDraft({ ...staffTaxDraft, npwpNik: e.target.value })}
                  placeholder="Contoh: 3201xxxxxxxxxxxx"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Status PTKP</label>
                <select
                  value={staffTaxDraft.ptkpStatus}
                  onChange={(e) =>
                    setStaffTaxDraft({ ...staffTaxDraft, ptkpStatus: e.target.value as PtkpStatus })
                  }
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white"
                >
                  {PTKP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Kategori Pemotongan PPh 21</label>
                <select
                  value={staffTaxDraft.taxCategory}
                  onChange={(e) =>
                    setStaffTaxDraft({
                      ...staffTaxDraft,
                      taxCategory: e.target.value as StaffTaxCategory
                    })
                  }
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white"
                >
                  <option value="pegawai_tetap">Pegawai Tetap (Skema TER Bulanan A/B/C)</option>
                  <option value="bukan_pegawai">Bukan Pegawai / Tenaga Medis & Nakes (DPP 50% × Pasal 17)</option>
                </select>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStaffRow(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-semibold cursor-pointer"
                >
                  Simpan Profil Pajak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: SQL Schema Supabase */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-sky-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Skema SQL Supabase — Estimasi PPh WP OP & Profil Pajak Petugas
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-slate-950 text-slate-100 font-mono text-[11px] leading-relaxed">
              <pre className="whitespace-pre-wrap">{SUPABASE_PPH_WPOP_SQL_SCHEMA}</pre>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="text-xs text-slate-600">
                Salin dan jalankan di SQL Editor Supabase untuk mengaktifkan tabel konfigurasi, snapshot, audit, dan kolom pajak pegawai.
              </span>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                {sqlCopied ? 'Tersalin!' : 'Salin SQL'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
