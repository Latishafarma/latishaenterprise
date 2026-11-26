import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  CheckCircle2,
  Save,
  Plus,
  Edit2,
  Trash2,
  X,
  AlertTriangle,
  Stethoscope,
  RefreshCw,
  Database,
  Copy,
  Check,
  Wallet,
  Flame,
  Users,
  ShieldCheck,
  RotateCcw,
  Calculator,
  UserCheck,
  Calendar,
  Filter
} from 'lucide-react';
import {
  FeeConfig,
  DEFAULT_FEE_CONFIG,
  DEFAULT_ROLE_PERMISSIONS,
  TariffItem,
  Staff,
  PayrollOvertimeConfig,
  StaffSalarySetting,
  ServiceFeeRecipientRule,
  ServiceFeeRole,
  ServiceFeeType,
  StaffFeeLedgerEntry,
  Transaction,
  normalizeStaffRole
} from '../types';
import { RupiahInput } from './RupiahInput';
import { demoGetItem, demoSetItem } from '../utils/demoSandbox';
import {
  SUPABASE_FEE_CONFIG_SQL_SCHEMA,
  SUPABASE_FEE_LEDGER_SQL_SCHEMA,
  getSupabaseConfig,
  DEFAULT_FEE_CONFIG_TABLE,
  DEFAULT_FEE_LEDGER_TABLE
} from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import {
  PAYROLL_ROLE_LIST,
  loadLocalPayrollConfig,
  normalizePayrollConfig,
  resolveStaffSalarySetting,
  saveLocalPayrollConfig
} from '../utils/payrollService';
import {
  ResolvedTariffItem,
  calculateUnitServiceFee,
  getServiceFeeRoleMeta,
  getServiceFeeRoleOptions,
  getStaffRoleList,
  normalizeServiceFeeRole,
  normalizeServiceFeeType,
  normalizeTransactionDateToYMD,
  reconcileFeeLedgerWithTransactions,
  resolveAllTariffsWithRules,
  resolveEffectiveEntryRole,
  resolveStaffMatch,
  staffMatchesServiceRole,
  summarizeLedgerRevenueSplit
} from '../utils/serviceFeeHelper';

export interface FeeSettingsSyncResult {
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
  updatedAt?: string;
  action?: 'pushed' | 'pulled';
}

interface FeeSettingsViewProps {
  feeConfig?: FeeConfig;
  staffList?: Staff[];
  rolePermissions?: Record<string, string[]>;
  onSaveFeeConfig?: (newConfig: FeeConfig) => Promise<FeeSettingsSyncResult> | void;
  onSyncSupabase?: (mode?: 'auto' | 'push' | 'pull') => Promise<FeeSettingsSyncResult>;
  needsTableSetup?: boolean;
  isDemoSandbox?: boolean;
  feeLedger?: StaffFeeLedgerEntry[];
  transactions?: Transaction[];
  onUpdateFeeLedgerStatus?: (
    ids: string[],
    nextStatus: 'belum_dibayar' | 'dibayar',
    paidBy?: string
  ) => Promise<void> | void;
  onSyncFeeLedgerSupabase?: () => Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
    count?: number;
  }>;
  ledgerNeedsTableSetup?: boolean;
  currentUserName?: string;
}

export const FeeSettingsView: React.FC<FeeSettingsViewProps> = ({
  feeConfig: initialFeeConfig,
  staffList = [],
  rolePermissions = DEFAULT_ROLE_PERMISSIONS,
  onSaveFeeConfig,
  onSyncSupabase,
  needsTableSetup = false,
  isDemoSandbox = false,
  feeLedger = [],
  transactions = [],
  onUpdateFeeLedgerStatus,
  onSyncFeeLedgerSupabase,
  ledgerNeedsTableSetup = false,
  currentUserName = 'APJ / Owner'
}) => {
  const [activeSection, setActiveSection] = useState<'gaji-lembur' | 'jasa-fee' | 'rekap-fee'>('gaji-lembur');
  const serviceRoleOptions = useMemo(
    () => getServiceFeeRoleOptions(rolePermissions),
    [rolePermissions]
  );

  const [feeConfig, setFeeConfig] = useState<FeeConfig>(() => {
    if (initialFeeConfig) {
      return {
        ...initialFeeConfig,
        payrollConfig: loadLocalPayrollConfig(initialFeeConfig)
      };
    }
    const saved = demoGetItem('latisha_fee_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_FEE_CONFIG,
          ...parsed,
          payrollConfig: loadLocalPayrollConfig(parsed)
        };
      } catch {
        return {
          ...DEFAULT_FEE_CONFIG,
          payrollConfig: loadLocalPayrollConfig(null)
        };
      }
    }
    return {
      ...DEFAULT_FEE_CONFIG,
      payrollConfig: loadLocalPayrollConfig(null)
    };
  });

  const [payrollDraft, setPayrollDraft] = useState<PayrollOvertimeConfig>(() =>
    loadLocalPayrollConfig(initialFeeConfig || feeConfig)
  );
  const [payrollDirty, setPayrollDirty] = useState(false);

  useEffect(() => {
    if (initialFeeConfig) {
      const normalizedPayroll = loadLocalPayrollConfig(initialFeeConfig);
      setFeeConfig({
        ...initialFeeConfig,
        payrollConfig: normalizedPayroll
      });
      if (!payrollDirty) {
        setPayrollDraft(normalizedPayroll);
      }
    }
  }, [initialFeeConfig, payrollDirty]);

  const [isSaved, setIsSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const isOwnerAdmin = useIsOwnerAdmin();
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingTariff, setEditingTariff] = useState<ResolvedTariffItem | null>(null);
  const [confirmDeleteTariff, setConfirmDeleteTariff] = useState<ResolvedTariffItem | null>(null);
  const [formError, setFormError] = useState('');

  // Form states for Add / Edit Jasa & Tarif (Multi-Recipient + Bagi Hasil)
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Poli Umum');
  const [formPrice, setFormPrice] = useState<number>(10000);
  const [formDesc, setFormDesc] = useState('');
  const [formRecipients, setFormRecipients] = useState<ServiceFeeRecipientRule[]>([
    {
      id: 'RCP-1',
      penerima_role: 'Dokter',
      wajib_pilih_petugas: true,
      tipe_fee: 'nominal',
      nilai_fee: 10000
    }
  ]);

  // Filter states for Tab 3: Rekap Fee Petugas (Ledger POS)
  const todayYMD = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);
  const monthStartYMD = useMemo(() => `${todayYMD.slice(0, 7)}-01`, [todayYMD]);
  const [ledgerStartDate, setLedgerStartDate] = useState<string>(() => monthStartYMD);
  const [ledgerEndDate, setLedgerEndDate] = useState<string>(() => todayYMD);
  const [ledgerRoleFilter, setLedgerRoleFilter] = useState<string>('SEMUA');
  const [ledgerStaffFilter, setLedgerStaffFilter] = useState<string>('SEMUA');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<
    'aktif' | 'belum_dibayar' | 'dibayar' | 'dibatalkan' | 'semua'
  >('aktif');
  const [showZeroFeeStaff, setShowZeroFeeStaff] = useState<boolean>(true);

  const [customServiceCategories, setCustomServiceCategories] = useState<string[]>(() => {
    try {
      const saved = demoGetItem('latisha_custom_service_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
        }
      }
    } catch {}
    return [];
  });
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryInputError, setCategoryInputError] = useState('');

  const availableCategories = useMemo(() => {
    const base = [
      'Poli Umum',
      'Skrining & Nakes',
      'Administrasi',
      'Home Care',
      'Telaah & Konseling',
      'Tindakan Medis',
      'Lab & Penunjang',
      'Lainnya'
    ];
    const fromTariffs = (feeConfig.customTariffs || []).map((t) => (t.category || '').trim()).filter(Boolean);
    const merged = [...base, ...customServiceCategories, ...fromTariffs];
    if (formCategory && formCategory.trim()) {
      merged.push(formCategory.trim());
    }
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const cat of merged) {
      const key = cat.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        unique.push(cat.trim());
      }
    }
    return unique;
  }, [customServiceCategories, feeConfig.customTariffs, formCategory]);

  const feeTableName = getSupabaseConfig().feeConfigTable || DEFAULT_FEE_CONFIG_TABLE;
  const ledgerTableName = getSupabaseConfig().feeLedgerTable || DEFAULT_FEE_LEDGER_TABLE;

  const handleSaveAll = async (updatedConfig: FeeConfig, label = 'Pengaturan Gaji, Jasa, Fee & Lembur') => {
    const cleanPayroll = normalizePayrollConfig(
      updatedConfig.payrollConfig || payrollDraft
    );
    const fullConfig: FeeConfig = {
      ...updatedConfig,
      payrollConfig: {
        ...cleanPayroll,
        updatedAt: new Date().toISOString()
      }
    };

    setFeeConfig(fullConfig);
    setPayrollDraft(fullConfig.payrollConfig!);
    setPayrollDirty(false);
    demoSetItem('latisha_fee_config', JSON.stringify(fullConfig));
    saveLocalPayrollConfig(fullConfig.payrollConfig!);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);

    if (onSaveFeeConfig) {
      const res = await onSaveFeeConfig(fullConfig);
      if (res && !res.isDemo) {
        if (res.success) {
          setSyncNotice({
            type: 'ok',
            text: `${label} berhasil disimpan dan disinkronkan ke tabel Supabase "${feeTableName}".`
          });
          setTimeout(() => setSyncNotice(null), 4000);
        } else if (res.needsTableSetup) {
          setSyncNotice({
            type: 'err',
            text: `Data tersimpan lokal, namun tabel "${feeTableName}" belum dibuat di Supabase. Klik "Skema SQL" untuk menyiapkan tabel.`
          });
        } else if (res.error) {
          setSyncNotice({
            type: 'err',
            text: `Tersimpan lokal, gagal sync ke Supabase: ${res.error}`
          });
        }
      }
    }
  };

  const handleManualSync = async (mode: 'auto' | 'push' | 'pull' = 'auto') => {
    if (!onSyncSupabase && !onSyncFeeLedgerSupabase) return;
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      const cfgRes = onSyncSupabase ? await onSyncSupabase(mode) : null;
      const ledgerRes = onSyncFeeLedgerSupabase ? await onSyncFeeLedgerSupabase() : null;

      if (cfgRes?.needsTableSetup || ledgerRes?.needsTableSetup) {
        if (isOwnerAdmin) setShowSqlModal(true);
        const missingName = cfgRes?.needsTableSetup ? feeTableName : ledgerTableName;
        setSyncNotice({
          type: 'err',
          text: `Tabel "${missingName}" belum ditemukan di Supabase. Salin & jalankan skrip SQL di SQL Editor Supabase.`
        });
      } else if ((cfgRes && !cfgRes.success) || (ledgerRes && !ledgerRes.success)) {
        setSyncNotice({
          type: 'err',
          text: cfgRes?.error || ledgerRes?.error || 'Gagal menyinkronkan pengaturan & ledger fee dengan Supabase.'
        });
      } else {
        setPayrollDirty(false);
        const ledgerCountText =
          typeof ledgerRes?.count === 'number' ? ` (${ledgerRes.count} entri log fee petugas)` : '';
        setSyncNotice({
          type: 'ok',
          text:
            cfgRes?.action === 'pushed'
              ? `Sinkronisasi berhasil: master gaji, jasa, fee & ledger${ledgerCountText} dikirim ke Supabase.`
              : `Sinkronisasi berhasil: master gaji, jasa, fee & ledger${ledgerCountText} terbaru dimuat dari Supabase.`
        });
        setTimeout(() => setSyncNotice(null), 4000);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // ==================== PAYROLL & SUNDAY OVERTIME HANDLERS ====================

  const resolvedStaffRows = useMemo(() => {
    const baseList: Staff[] =
      staffList.length > 0
        ? staffList
        : [
            { id: 'STF-01', name: 'apt. Mardin, S.Farm', role: 'APJ / Owner', phone: '-', status: 'Aktif', branchId: 'BR-01' },
            { id: 'STF-02', name: 'dr. Anis Prima Dewi', role: 'Dokter', phone: '-', status: 'Aktif', branchId: 'BR-01' }
          ];
    return baseList.map((st) => ({
      staff: st,
      setting: resolveStaffSalarySetting(st, payrollDraft)
    }));
  }, [staffList, payrollDraft]);

  const updateStaffSalaryRow = (
    staff: Staff,
    patch: Partial<StaffSalarySetting>
  ) => {
    setPayrollDirty(true);
    setPayrollDraft((prev) => {
      const current = resolveStaffSalarySetting(staff, prev);
      const updatedRow: StaffSalarySetting = {
        ...current,
        ...patch,
        staffId: staff.id,
        staffName: staff.name,
        staffRole: normalizeStaffRole(staff.role, 'Apoteker')
      };
      const others = prev.staffSalaries.filter((s) => s.staffId !== staff.id);
      return {
        ...prev,
        staffSalaries: [...others, updatedRow]
      };
    });
  };

  const handleApplyRoleDefaultsToAllStaff = () => {
    setPayrollDirty(true);
    setPayrollDraft((prev) => {
      const nextSalaries: StaffSalarySetting[] = resolvedStaffRows.map(({ staff, setting }) => {
        const role = normalizeStaffRole(staff.role, 'Apoteker');
        const def = prev.roleDefaults[role] || { baseSalary: 0, fixedAllowance: 0 };
        return {
          ...setting,
          staffId: staff.id,
          staffName: staff.name,
          staffRole: role,
          baseSalary: def.baseSalary,
          fixedAllowance: def.fixedAllowance
        };
      });
      return {
        ...prev,
        staffSalaries: nextSalaries
      };
    });
  };

  const handleSavePayrollConfig = async () => {
    // Materialize every staff row into staffSalaries so config is explicit & portable
    const materializedSalaries: StaffSalarySetting[] = resolvedStaffRows.map(({ setting }) => setting);
    const nextPayroll: PayrollOvertimeConfig = normalizePayrollConfig({
      ...payrollDraft,
      staffSalaries: materializedSalaries,
      updatedAt: new Date().toISOString()
    });
    await handleSaveAll(
      {
        ...feeConfig,
        payrollConfig: nextPayroll
      },
      'Pengaturan Gaji & Lembur Minggu'
    );
  };

  const totalMonthlyPayrollEstimate = useMemo(() => {
    return resolvedStaffRows.reduce((acc, { setting }) => {
      if (!setting.active) return acc;
      return acc + (setting.baseSalary || 0) + (setting.fixedAllowance || 0);
    }, 0);
  }, [resolvedStaffRows]);

  // ==================== TARIFF & JASA HANDLERS ====================

  const handleOpenAddModal = () => {
    setEditingTariff(null);
    setFormError('');
    setFormName('');
    setFormCategory('Poli Umum');
    setFormPrice(50000);
    setFormDesc('');
    setFormRecipients([
      {
        id: 'RCP-1',
        penerima_role: 'Dokter',
        wajib_pilih_petugas: true,
        tipe_fee: 'nominal',
        nilai_fee: 20000
      }
    ]);
    setShowAddCategoryInput(false);
    setNewCategoryName('');
    setCategoryInputError('');
    setShowModal(true);
  };

  const handleOpenEditModal = (tariff: ResolvedTariffItem) => {
    setEditingTariff(tariff);
    setFormError('');
    setFormName(tariff.name);
    setFormCategory(tariff.category || 'Poli Umum');
    setFormPrice(tariff.price || 0);
    setFormDesc(tariff.description || '');
    const initialRules: ServiceFeeRecipientRule[] =
      Array.isArray(tariff.fee_recipients) && tariff.fee_recipients.length > 0
        ? tariff.fee_recipients.map((r, i) => ({
            id: r.id || `RCP-${i + 1}`,
            penerima_role: normalizeServiceFeeRole(r.penerima_role),
            wajib_pilih_petugas:
              normalizeServiceFeeRole(r.penerima_role) === 'non_petugas'
                ? false
                : Boolean(r.wajib_pilih_petugas),
            tipe_fee: normalizeServiceFeeType(r.tipe_fee),
            nilai_fee:
              normalizeServiceFeeRole(r.penerima_role) === 'non_petugas'
                ? 0
                : Math.max(0, Number(r.nilai_fee) || 0)
          }))
        : [
            {
              id: 'RCP-1',
              penerima_role: normalizeServiceFeeRole(tariff.penerima_role),
              wajib_pilih_petugas:
                normalizeServiceFeeRole(tariff.penerima_role) === 'non_petugas'
                  ? false
                  : Boolean(tariff.wajib_pilih_petugas),
              tipe_fee: normalizeServiceFeeType(tariff.tipe_fee),
              nilai_fee:
                normalizeServiceFeeRole(tariff.penerima_role) === 'non_petugas'
                  ? 0
                  : Math.max(0, Number(tariff.nilai_fee) || 0)
            }
          ];
    setFormRecipients(initialRules);
    setShowAddCategoryInput(false);
    setNewCategoryName('');
    setCategoryInputError('');
    setShowModal(true);
  };

  const handleUpdateRecipientRule = (
    idx: number,
    patch: Partial<ServiceFeeRecipientRule>
  ) => {
    setFormError('');
    setFormRecipients((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const nextRole =
          patch.penerima_role !== undefined
            ? normalizeServiceFeeRole(patch.penerima_role)
            : row.penerima_role;
        const nextType =
          patch.tipe_fee !== undefined
            ? normalizeServiceFeeType(patch.tipe_fee)
            : row.tipe_fee;
        let nextNilai =
          patch.nilai_fee !== undefined
            ? Math.max(0, Number(patch.nilai_fee) || 0)
            : row.nilai_fee;
        let nextWajib =
          patch.wajib_pilih_petugas !== undefined
            ? Boolean(patch.wajib_pilih_petugas)
            : row.wajib_pilih_petugas;

        if (nextRole === 'non_petugas') {
          nextWajib = false;
          nextNilai = 0;
        } else if (patch.penerima_role !== undefined && row.penerima_role === 'non_petugas') {
          nextWajib = true;
        }

        if (patch.tipe_fee === 'persen' && nextNilai > 100) {
          nextNilai = 100;
        } else if (patch.tipe_fee === 'nominal' && row.tipe_fee === 'persen' && nextNilai <= 100 && formPrice > 100) {
          nextNilai = Math.round((formPrice * nextNilai) / 100);
        }

        return {
          ...row,
          ...patch,
          penerima_role: nextRole,
          tipe_fee: nextType,
          nilai_fee: nextNilai,
          wajib_pilih_petugas: nextWajib
        };
      })
    );
  };

  const handleAddRecipientRule = () => {
    setFormError('');
    setFormRecipients((prev) => {
      const usedRoles = new Set(prev.map((r) => String(r.penerima_role).toLowerCase()));
      const candidateOption =
        serviceRoleOptions.find(
          (opt) => opt.value !== 'non_petugas' && !usedRoles.has(String(opt.value).toLowerCase())
        ) ||
        serviceRoleOptions.find((opt) => opt.value !== 'non_petugas') ||
        serviceRoleOptions[0];

      const usedUnitFee = prev.reduce((sum, r) => {
        if (normalizeServiceFeeRole(r.penerima_role) === 'non_petugas') return sum;
        return sum + calculateUnitServiceFee(formPrice, r.tipe_fee, r.nilai_fee);
      }, 0);
      const remainingFee = Math.max(0, formPrice - usedUnitFee);

      const newRule: ServiceFeeRecipientRule = {
        id: `RCP-${Date.now().toString().slice(-4)}-${prev.length + 1}`,
        penerima_role: candidateOption.value,
        wajib_pilih_petugas: candidateOption.value !== 'non_petugas',
        tipe_fee: 'nominal',
        nilai_fee: candidateOption.value === 'non_petugas' ? 0 : remainingFee
      };
      return [...prev, newRule];
    });
  };

  const handleRemoveRecipientRule = (idx: number) => {
    setFormError('');
    setFormRecipients((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const handleAddCustomCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setCategoryInputError('Nama kategori baru tidak boleh kosong.');
      return;
    }

    const existingMatch = availableCategories.find(
      (cat) => cat.toLowerCase() === trimmed.toLowerCase()
    );
    if (existingMatch) {
      setFormCategory(existingMatch);
      setShowAddCategoryInput(false);
      setNewCategoryName('');
      setCategoryInputError('');
      return;
    }

    const updatedCustom = [...customServiceCategories, trimmed];
    setCustomServiceCategories(updatedCustom);
    try {
      demoSetItem('latisha_custom_service_categories', JSON.stringify(updatedCustom));
    } catch {}
    setFormCategory(trimmed);
    setShowAddCategoryInput(false);
    setNewCategoryName('');
    setCategoryInputError('');
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Nama Jasa & Tarif harus diisi!');
      return;
    }

    for (let i = 0; i < formRecipients.length; i++) {
      const r = formRecipients[i];
      if (r.tipe_fee === 'persen' && (r.nilai_fee < 0 || r.nilai_fee > 100)) {
        setFormError(`Persentase fee Penerima #${i + 1} harus berada antara 0% sampai 100%!`);
        return;
      }
    }

    const cleanRecipients: ServiceFeeRecipientRule[] = formRecipients.map((r, i) => {
      const cleanRole = normalizeServiceFeeRole(r.penerima_role);
      const cleanTipe = normalizeServiceFeeType(r.tipe_fee);
      return {
        id: r.id || `RCP-${i + 1}`,
        penerima_role: cleanRole,
        wajib_pilih_petugas: cleanRole === 'non_petugas' ? false : Boolean(r.wajib_pilih_petugas),
        tipe_fee: cleanTipe,
        nilai_fee: cleanRole === 'non_petugas' ? 0 : Math.max(0, Number(r.nilai_fee) || 0)
      };
    });

    const totalUnitStaffFee = cleanRecipients.reduce((sum, r) => {
      if (r.penerima_role === 'non_petugas') return sum;
      return sum + calculateUnitServiceFee(formPrice, r.tipe_fee, r.nilai_fee);
    }, 0);

    if (totalUnitStaffFee > formPrice) {
      setFormError(
        `Total nominal fee seluruh penerima (Rp ${totalUnitStaffFee.toLocaleString(
          'id-ID'
        )}) melebihi Biaya Layanan (Rp ${formPrice.toLocaleString(
          'id-ID'
        )}). Kurangi nilai fee agar bagi hasil fasilitas tidak minus.`
      );
      return;
    }

    const primaryRule =
      cleanRecipients.find((r) => r.penerima_role !== 'non_petugas') || cleanRecipients[0];
    const cleanRole = primaryRule.penerima_role;
    const cleanWajib = primaryRule.wajib_pilih_petugas;
    const cleanTipe = primaryRule.tipe_fee;
    const cleanNilai = primaryRule.nilai_fee;

    const updatedConfig: FeeConfig = {
      ...feeConfig,
      payrollConfig: payrollDraft,
      systemTariffConfigs: { ...(feeConfig.systemTariffConfigs || {}) }
    };

    if (editingTariff) {
      if (editingTariff.isSystem) {
        if (editingTariff.id === 'JASA-DOKTER-UMUM') updatedConfig.doctorFee = formPrice;
        else if (editingTariff.id === 'JASA-PENUNJANG-MEDIS') updatedConfig.medicalSupportFee = formPrice;
        else if (editingTariff.id === 'JASA-ADMIN-LOKET') updatedConfig.adminFee = formPrice;
        else if (editingTariff.id === 'JASA-HOME-VISIT') updatedConfig.homeVisitFee = formPrice;
        else if (editingTariff.id === 'JASA-APOTEKER') updatedConfig.pharmacistFee = formPrice;

        updatedConfig.systemTariffConfigs![editingTariff.id] = {
          id: editingTariff.id,
          name: formName.trim(),
          category: formCategory,
          price: formPrice,
          description: formDesc.trim(),
          penerima_role: cleanRole,
          wajib_pilih_petugas: cleanWajib,
          tipe_fee: cleanTipe,
          nilai_fee: cleanNilai,
          fee_recipients: cleanRecipients
        };
      } else {
        const customs = updatedConfig.customTariffs ? [...updatedConfig.customTariffs] : [];
        const idx = customs.findIndex((c) => c.id === editingTariff.id);
        if (idx !== -1) {
          customs[idx] = {
            ...customs[idx],
            name: formName.trim(),
            category: formCategory,
            price: formPrice,
            description: formDesc.trim(),
            penerima_role: cleanRole,
            wajib_pilih_petugas: cleanWajib,
            tipe_fee: cleanTipe,
            nilai_fee: cleanNilai,
            fee_recipients: cleanRecipients
          };
          updatedConfig.customTariffs = customs;
        }
      }
    } else {
      const newItem: TariffItem = {
        id: `JASA-CUSTOM-${Date.now().toString().slice(-6)}`,
        name: formName.trim(),
        category: formCategory,
        price: formPrice,
        description: formDesc.trim(),
        isSystem: false,
        penerima_role: cleanRole,
        wajib_pilih_petugas: cleanWajib,
        tipe_fee: cleanTipe,
        nilai_fee: cleanNilai,
        fee_recipients: cleanRecipients
      };
      const customs = updatedConfig.customTariffs ? [...updatedConfig.customTariffs] : [];
      customs.push(newItem);
      updatedConfig.customTariffs = customs;
    }

    setShowModal(false);
    await handleSaveAll(updatedConfig, 'Pengaturan Jasa Medis & Fee Layanan');
  };

  const handleConfirmDeleteTariff = async () => {
    if (!confirmDeleteTariff) return;
    const tariff = confirmDeleteTariff;
    setConfirmDeleteTariff(null);

    const updatedConfig: FeeConfig = {
      ...feeConfig,
      payrollConfig: payrollDraft,
      systemTariffConfigs: { ...(feeConfig.systemTariffConfigs || {}) }
    };

    if (tariff.isSystem) {
      if (tariff.id === 'JASA-DOKTER-UMUM') updatedConfig.doctorFee = 0;
      else if (tariff.id === 'JASA-PENUNJANG-MEDIS') updatedConfig.medicalSupportFee = 0;
      else if (tariff.id === 'JASA-ADMIN-LOKET') updatedConfig.adminFee = 0;
      else if (tariff.id === 'JASA-HOME-VISIT') updatedConfig.homeVisitFee = 0;
      else if (tariff.id === 'JASA-APOTEKER') updatedConfig.pharmacistFee = 0;
      if (updatedConfig.systemTariffConfigs && updatedConfig.systemTariffConfigs[tariff.id]) {
        const prevSys = updatedConfig.systemTariffConfigs[tariff.id];
        updatedConfig.systemTariffConfigs[tariff.id] = {
          ...prevSys,
          price: 0,
          nilai_fee: 0,
          ...(Array.isArray(prevSys.fee_recipients)
            ? {
                fee_recipients: prevSys.fee_recipients.map((r) => ({
                  ...r,
                  nilai_fee: 0
                }))
              }
            : {})
        };
      }
    } else {
      const customs = (updatedConfig.customTariffs || []).filter((c) => c.id !== tariff.id);
      updatedConfig.customTariffs = customs;
    }

    await handleSaveAll(updatedConfig, 'Pengaturan Jasa Medis & Fee Layanan');
  };

  // Compile list of system & custom tariffs with resolved fee rules
  const allTariffs: ResolvedTariffItem[] = useMemo(
    () => resolveAllTariffsWithRules(feeConfig),
    [feeConfig]
  );

  // ==================== REKAP FEE PETUGAS (LEDGER POS + POS KASIR) ====================

  const effectiveFeeLedger = useMemo(
    () =>
      reconcileFeeLedgerWithTransactions(feeLedger, transactions, feeConfig, staffList, {
        pruneMissingTransactions: true
      }),
    [feeLedger, transactions, feeConfig, staffList]
  );

  const unpaidLedgerCount = useMemo(
    () => effectiveFeeLedger.filter((e) => e.status_pembayaran === 'belum_dibayar').length,
    [effectiveFeeLedger]
  );

  const ledgerRoleOptions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getServiceFeeRoleMeta>>();
    serviceRoleOptions
      .filter((opt) => opt.value !== 'non_petugas')
      .forEach((opt) => {
        map.set(String(opt.value).toLowerCase(), opt);
      });
    staffList.forEach((st) => {
      getStaffRoleList(st).forEach((r) => {
        const meta = getServiceFeeRoleMeta(r, rolePermissions);
        if (meta.value !== 'non_petugas' && !map.has(String(meta.value).toLowerCase())) {
          map.set(String(meta.value).toLowerCase(), meta);
        }
      });
    });
    effectiveFeeLedger.forEach((e) => {
      const effRole = resolveEffectiveEntryRole(e, staffList);
      if (effRole !== 'non_petugas') {
        const meta = getServiceFeeRoleMeta(effRole, rolePermissions);
        if (!map.has(String(meta.value).toLowerCase())) {
          map.set(String(meta.value).toLowerCase(), meta);
        }
      }
    });
    return Array.from(map.values());
  }, [serviceRoleOptions, staffList, effectiveFeeLedger, rolePermissions]);

  const ledgerStaffFilterOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string }>();
    staffList.forEach((s) => {
      if (s.id) map.set(s.id, { id: s.id, name: s.name, role: s.role });
    });
    effectiveFeeLedger.forEach((e) => {
      const matched = resolveStaffMatch(e.petugas_id, e.nama_petugas, staffList);
      const canonId = matched?.id || e.petugas_id || e.nama_petugas;
      if (canonId && !map.has(canonId)) {
        const effRole = resolveEffectiveEntryRole(e, staffList);
        map.set(canonId, {
          id: canonId,
          name: e.nama_petugas || canonId,
          role: e.role_petugas || getServiceFeeRoleMeta(effRole, rolePermissions).shortLabel
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [staffList, effectiveFeeLedger, rolePermissions]);

  const filteredFeeLedger = useMemo(() => {
    return effectiveFeeLedger
      .filter((entry) => {
        const ymd = normalizeTransactionDateToYMD(entry.transaction_date || entry.created_at);
        if (ledgerStartDate && ymd && ymd < ledgerStartDate) return false;
        if (ledgerEndDate && ymd && ymd > ledgerEndDate) return false;
        if (ledgerRoleFilter !== 'SEMUA') {
          const normEntryRole = resolveEffectiveEntryRole(entry, staffList);
          const normFilterRole = normalizeServiceFeeRole(ledgerRoleFilter);
          if (normEntryRole !== normFilterRole) return false;
        }
        if (ledgerStaffFilter !== 'SEMUA') {
          const matched = resolveStaffMatch(entry.petugas_id, entry.nama_petugas, staffList);
          const canonId = matched?.id || entry.petugas_id || entry.nama_petugas;
          if (entry.petugas_id !== ledgerStaffFilter && canonId !== ledgerStaffFilter) {
            return false;
          }
        }
        if (ledgerStatusFilter === 'aktif' && entry.status_pembayaran === 'dibatalkan') return false;
        if (
          ledgerStatusFilter !== 'aktif' &&
          ledgerStatusFilter !== 'semua' &&
          entry.status_pembayaran !== ledgerStatusFilter
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const da = `${b.transaction_date || ''} ${b.created_at || ''}`;
        const db = `${a.transaction_date || ''} ${a.created_at || ''}`;
        return da.localeCompare(db);
      });
  }, [
    effectiveFeeLedger,
    ledgerStartDate,
    ledgerEndDate,
    ledgerRoleFilter,
    ledgerStaffFilter,
    ledgerStatusFilter,
    staffList
  ]);

  const ledgerTotals = useMemo(() => {
    return filteredFeeLedger.reduce(
      (acc, entry) => {
        const feeAmount = Number(entry.total_fee_item) || 0;
        if (entry.status_pembayaran === 'belum_dibayar') {
          acc.belumDibayar += feeAmount;
          acc.totalAktif += feeAmount;
          acc.qtyAktif += entry.qty;
          acc.countAktif += 1;
        } else if (entry.status_pembayaran === 'dibayar') {
          acc.sudahDibayar += feeAmount;
          acc.totalAktif += feeAmount;
          acc.qtyAktif += entry.qty;
          acc.countAktif += 1;
        } else {
          acc.dibatalkan += feeAmount;
        }
        return acc;
      },
      {
        totalAktif: 0,
        belumDibayar: 0,
        sudahDibayar: 0,
        dibatalkan: 0,
        qtyAktif: 0,
        countAktif: 0
      }
    );
  }, [filteredFeeLedger]);

  const ledgerRevenueSplit = useMemo(
    () => summarizeLedgerRevenueSplit(filteredFeeLedger),
    [filteredFeeLedger]
  );

  // Ringkasan per Role (menggunakan filter tanggal, petugas & status saat ini tanpa filter role agar seluruh role terlihat)
  const ledgerPerRoleSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        roleValue: ServiceFeeRole;
        label: string;
        badgeClass: string;
        itemCount: number;
        totalFee: number;
        belumDibayar: number;
        sudahDibayar: number;
        staffIds: Set<string>;
      }
    >();

    ledgerRoleOptions.forEach((opt) => {
      map.set(String(opt.value), {
        roleValue: opt.value,
        label: opt.shortLabel || opt.label,
        badgeClass: opt.badgeClass,
        itemCount: 0,
        totalFee: 0,
        belumDibayar: 0,
        sudahDibayar: 0,
        staffIds: new Set<string>()
      });
    });

    effectiveFeeLedger.forEach((entry) => {
      const ymd = normalizeTransactionDateToYMD(entry.transaction_date || entry.created_at);
      if (ledgerStartDate && ymd && ymd < ledgerStartDate) return;
      if (ledgerEndDate && ymd && ymd > ledgerEndDate) return;
      if (ledgerStaffFilter !== 'SEMUA') {
        const matched = resolveStaffMatch(entry.petugas_id, entry.nama_petugas, staffList);
        const canonId = matched?.id || entry.petugas_id || entry.nama_petugas;
        if (entry.petugas_id !== ledgerStaffFilter && canonId !== ledgerStaffFilter) return;
      }
      if (ledgerStatusFilter === 'aktif' && entry.status_pembayaran === 'dibatalkan') return;
      if (
        ledgerStatusFilter !== 'aktif' &&
        ledgerStatusFilter !== 'semua' &&
        entry.status_pembayaran !== ledgerStatusFilter
      ) {
        return;
      }
      if (entry.status_pembayaran === 'dibatalkan') return;

      const effRole = resolveEffectiveEntryRole(entry, staffList);
      if (effRole === 'non_petugas') return;
      const meta = getServiceFeeRoleMeta(effRole, rolePermissions);
      const roleKey = String(meta.value);
      const bucket = map.get(roleKey) || {
        roleValue: meta.value,
        label: meta.shortLabel || meta.label,
        badgeClass: meta.badgeClass,
        itemCount: 0,
        totalFee: 0,
        belumDibayar: 0,
        sudahDibayar: 0,
        staffIds: new Set<string>()
      };
      const feeAmount = Number(entry.total_fee_item) || 0;
      bucket.itemCount += 1;
      bucket.totalFee += feeAmount;
      if (entry.status_pembayaran === 'belum_dibayar') bucket.belumDibayar += feeAmount;
      else if (entry.status_pembayaran === 'dibayar') bucket.sudahDibayar += feeAmount;
      const matched = resolveStaffMatch(entry.petugas_id, entry.nama_petugas, staffList);
      bucket.staffIds.add(matched?.id || entry.petugas_id || entry.nama_petugas);
      map.set(roleKey, bucket);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalFee !== a.totalFee) return b.totalFee - a.totalFee;
      return a.label.localeCompare(b.label);
    });
  }, [
    ledgerRoleOptions,
    effectiveFeeLedger,
    ledgerStartDate,
    ledgerEndDate,
    ledgerStaffFilter,
    ledgerStatusFilter,
    staffList,
    rolePermissions
  ]);

  const ledgerPerStaffSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        petugasId: string;
        namaPetugas: string;
        rolePetugas: string;
        penerimaRole: ServiceFeeRole;
        itemCount: number;
        totalQty: number;
        belumDibayar: number;
        sudahDibayar: number;
        totalFee: number;
        unpaidIds: string[];
        paidIds: string[];
      }
    >();

    filteredFeeLedger.forEach((entry) => {
      if (entry.status_pembayaran === 'dibatalkan') return;
      const matchedStaff = resolveStaffMatch(entry.petugas_id, entry.nama_petugas, staffList);
      const effRole = resolveEffectiveEntryRole(entry, staffList);
      const key = matchedStaff?.id || entry.petugas_id || entry.nama_petugas;
      const existing = map.get(key) || {
        petugasId: matchedStaff?.id || entry.petugas_id,
        namaPetugas: matchedStaff?.name || entry.nama_petugas,
        rolePetugas:
          matchedStaff?.role ||
          entry.role_petugas ||
          getServiceFeeRoleMeta(effRole, rolePermissions).shortLabel,
        penerimaRole: effRole,
        itemCount: 0,
        totalQty: 0,
        belumDibayar: 0,
        sudahDibayar: 0,
        totalFee: 0,
        unpaidIds: [],
        paidIds: []
      };
      const feeAmount = Number(entry.total_fee_item) || 0;
      existing.itemCount += 1;
      existing.totalQty += entry.qty || 1;
      existing.totalFee += feeAmount;
      if (entry.status_pembayaran === 'belum_dibayar') {
        existing.belumDibayar += feeAmount;
        existing.unpaidIds.push(entry.id);
      } else if (entry.status_pembayaran === 'dibayar') {
        existing.sudahDibayar += feeAmount;
        existing.paidIds.push(entry.id);
      }
      map.set(key, existing);
    });

    if (
      showZeroFeeStaff &&
      ledgerStaffFilter === 'SEMUA' &&
      (ledgerStatusFilter === 'aktif' || ledgerStatusFilter === 'semua')
    ) {
      staffList.forEach((st) => {
        if (!st || !st.id || st.status === 'Non-Aktif') return;
        if (map.has(st.id)) return;
        if (ledgerRoleFilter !== 'SEMUA') {
          const normFilter = normalizeServiceFeeRole(ledgerRoleFilter);
          if (!staffMatchesServiceRole(st, normFilter)) return;
        }
        const stRole = normalizeServiceFeeRole(st.role);
        map.set(st.id, {
          petugasId: st.id,
          namaPetugas: st.name,
          rolePetugas: st.role,
          penerimaRole: stRole,
          itemCount: 0,
          totalQty: 0,
          belumDibayar: 0,
          sudahDibayar: 0,
          totalFee: 0,
          unpaidIds: [],
          paidIds: []
        });
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalFee !== a.totalFee) return b.totalFee - a.totalFee;
      return a.namaPetugas.localeCompare(b.namaPetugas);
    });
  }, [
    filteredFeeLedger,
    staffList,
    rolePermissions,
    showZeroFeeStaff,
    ledgerStaffFilter,
    ledgerStatusFilter,
    ledgerRoleFilter
  ]);

  const previewRecipientBreakdown = useMemo(
    () =>
      formRecipients.map((r) => {
        const cleanRole = normalizeServiceFeeRole(r.penerima_role);
        const unitFee =
          cleanRole === 'non_petugas'
            ? 0
            : calculateUnitServiceFee(formPrice, r.tipe_fee, r.nilai_fee);
        return {
          ...r,
          penerima_role: cleanRole,
          unitFee
        };
      }),
    [formRecipients, formPrice]
  );

  const previewTotalStaffFee = useMemo(
    () => previewRecipientBreakdown.reduce((sum, r) => sum + r.unitFee, 0),
    [previewRecipientBreakdown]
  );

  const previewFacilityShare = formPrice - previewTotalStaffFee;

  const ot = payrollDraft.sundayOvertime;

  return (
    <div className="space-y-4 max-w-6xl mx-auto text-xs">
      {/* Top Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <span>Gaji, Jasa, Fee & Lembur</span>
          </h3>
          <p className="text-slate-500 mt-0.5 leading-relaxed">
            Pengaturan terstruktur yang memisahkan <strong>Gaji Pokok & Lembur Khusus Hari Minggu</strong> dari{' '}
            <strong>Tarif Jasa Medis & Pembagian Fee Layanan</strong>, tersinkron 2 arah ke Supabase dan backup sistem.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isSaved && (
            <span className="bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Tersimpan!
            </span>
          )}

          {!isDemoSandbox && (
            <>
              {isOwnerAdmin && (
                <button
                  type="button"
                  onClick={() => setShowSqlModal(true)}
                  className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition ${
                    needsTableSetup || ledgerNeedsTableSetup
                      ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Database
                    className={`w-3.5 h-3.5 ${
                      needsTableSetup || ledgerNeedsTableSetup ? 'text-amber-600' : 'text-slate-600'
                    }`}
                  />
                  <span>Skema SQL</span>
                </button>
              )}

              {(onSyncSupabase || onSyncFeeLedgerSupabase) && (
                <button
                  type="button"
                  onClick={() => handleManualSync('auto')}
                  disabled={isSyncing}
                  className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Menyinkronkan...' : 'Sync Supabase'}</span>
                </button>
              )}
            </>
          )}

          {activeSection === 'jasa-fee' ? (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="min-h-[40px] px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl shadow-md transition flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Jasa & Tarif</span>
            </button>
          ) : activeSection === 'gaji-lembur' ? (
            <button
              type="button"
              onClick={handleSavePayrollConfig}
              className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md transition flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{payrollDirty ? 'Simpan Perubahan Gaji & Lembur' : 'Simpan Gaji & Lembur'}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Clear 3-Tab Structural Separation */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveSection('gaji-lembur')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
            activeSection === 'gaji-lembur'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>1. Pengaturan Gaji & Lembur Minggu</span>
          {payrollDirty && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-300 text-amber-950 text-[10px] font-black">
              Belum Disimpan
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('jasa-fee')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
            activeSection === 'jasa-fee'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span>2. Pengaturan Jasa Medis & Fee Layanan ({allTariffs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('rekap-fee')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
            activeSection === 'rekap-fee'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>3. Rekap Fee Petugas (Ledger POS)</span>
          {unpaidLedgerCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                activeSection === 'rekap-fee'
                  ? 'bg-amber-300 text-amber-950'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {unpaidLedgerCount} Belum Bayar
            </span>
          )}
        </button>
      </div>

      {/* Warning banner when table needs setup in Supabase (APJ / Owner Only) */}
      {isOwnerAdmin && (needsTableSetup || ledgerNeedsTableSetup) && !isDemoSandbox && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold">
                Tabel Supabase "{needsTableSetup ? feeTableName : ledgerTableName}" Belum Siap / Perlu Pembaruan Kolom
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Perubahan sementara tersimpan di perangkat ini. Jalankan skrip SQL di Dashboard Supabase agar tabel <code>{feeTableName}</code> dan <code>{ledgerTableName}</code> tersinkron real-time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSqlModal(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Buka Skrip SQL</span>
          </button>
        </div>
      )}

      {/* Inline Sync Notice */}
      {syncNotice && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-semibold border flex items-center justify-between gap-2 ${
            syncNotice.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span>{syncNotice.text}</span>
          <button
            type="button"
            onClick={() => setSyncNotice(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ==================== SECTION 1: PENGATURAN GAJI & LEMBUR HARI MINGGU ==================== */}
      {activeSection === 'gaji-lembur' && (
        <div className="space-y-5">
          {/* Card A: Aturan & Tarif Lembur Khusus Hari Minggu */}
          <div className="bg-white rounded-2xl border border-amber-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-amber-50 via-orange-50/70 to-white border-b border-amber-200/70 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-amber-950">
                    A. Aturan & Tarif Lembur Khusus Hari Minggu
                  </h4>
                  <p className="text-[11px] text-amber-900/80 mt-0.5">
                    Terhubung otomatis dengan modul <strong>Kehadiran, Cuti & Lembur Minggu</strong>. Hari Senin–Sabtu selalu Rp 0 (non-lembur).
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-[10px] uppercase">
                Berlaku Khusus Hari Minggu
              </span>
            </div>

            <div className="p-5 space-y-4">
              {/* Rule Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Metode Hitung Lembur Minggu
                  </label>
                  <select
                    value={ot.calculationMode}
                    onChange={(e) => {
                      setPayrollDirty(true);
                      setPayrollDraft((prev) => ({
                        ...prev,
                        sundayOvertime: {
                          ...prev.sundayOvertime,
                          calculationMode: e.target.value as 'per-jam' | 'per-sesi'
                        }
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="per-jam">Per Jam (Berdasarkan Durasi Menit Lembur)</option>
                    <option value="per-sesi">Tarif Datar Per Sesi Lembur Minggu</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Pembulatan Durasi Lembur (Mode Per Jam)
                  </label>
                  <select
                    value={ot.roundingMinutes}
                    disabled={ot.calculationMode === 'per-sesi'}
                    onChange={(e) => {
                      setPayrollDirty(true);
                      setPayrollDraft((prev) => ({
                        ...prev,
                        sundayOvertime: {
                          ...prev.sundayOvertime,
                          roundingMinutes: Number(e.target.value) as 1 | 15 | 30 | 60
                        }
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value={1}>Tepat per Menit (Proporsional)</option>
                    <option value={15}>Pembulatan per 15 Menit</option>
                    <option value={30}>Pembulatan per 30 Menit</option>
                    <option value={60}>Pembulatan per 1 Jam (60 Menit)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={ot.requireApprovalForPayout}
                      onChange={(e) => {
                        setPayrollDirty(true);
                        setPayrollDraft((prev) => ({
                          ...prev,
                          sundayOvertime: {
                            ...prev.sundayOvertime,
                            requireApprovalForPayout: e.target.checked
                          }
                        }));
                      }}
                      className="w-4 h-4 rounded accent-emerald-600"
                    />
                    <span className="text-[11px] font-bold text-slate-800 leading-tight">
                      Wajib Persetujuan APJ / Owner agar masuk nominal lembur
                    </span>
                  </label>
                </div>
              </div>

              {/* Rate Inputs: Lembur Terencana vs Lembur di Luar Jadwal */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sky-950 text-xs uppercase">
                      1. Lembur Terencana (Hari Minggu)
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-bold">
                      Sesi Terjadwal / Direncanakan
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Tarif Per Jam (Rp)
                      </label>
                      <RupiahInput
                        value={ot.plannedHourlyRate}
                        onChangeValue={(val) => {
                          setPayrollDirty(true);
                          setPayrollDraft((prev) => ({
                            ...prev,
                            sundayOvertime: { ...prev.sundayOvertime, plannedHourlyRate: val }
                          }));
                        }}
                        className="w-full py-2 pr-3 border border-sky-200 rounded-xl font-mono font-black text-slate-900 bg-white outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Tarif Datar Per Sesi (Rp)
                      </label>
                      <RupiahInput
                        value={ot.plannedSessionRate}
                        onChangeValue={(val) => {
                          setPayrollDirty(true);
                          setPayrollDraft((prev) => ({
                            ...prev,
                            sundayOvertime: { ...prev.sundayOvertime, plannedSessionRate: val }
                          }));
                        }}
                        className="w-full py-2 pr-3 border border-sky-200 rounded-xl font-mono font-black text-slate-900 bg-white outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-950 text-xs uppercase">
                      2. Lembur di Luar Jadwal (Hari Minggu)
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">
                      Lewat Shift / Panggilan Mendadak
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Tarif Per Jam (Rp)
                      </label>
                      <RupiahInput
                        value={ot.unscheduledHourlyRate}
                        onChangeValue={(val) => {
                          setPayrollDirty(true);
                          setPayrollDraft((prev) => ({
                            ...prev,
                            sundayOvertime: { ...prev.sundayOvertime, unscheduledHourlyRate: val }
                          }));
                        }}
                        className="w-full py-2 pr-3 border border-amber-200 rounded-xl font-mono font-black text-slate-900 bg-white outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Tarif Datar Per Sesi (Rp)
                      </label>
                      <RupiahInput
                        value={ot.unscheduledSessionRate}
                        onChangeValue={(val) => {
                          setPayrollDirty(true);
                          setPayrollDraft((prev) => ({
                            ...prev,
                            sundayOvertime: { ...prev.sundayOvertime, unscheduledSessionRate: val }
                          }));
                        }}
                        className="w-full py-2 pr-3 border border-amber-200 rounded-xl font-mono font-black text-slate-900 bg-white outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Simulation Strip */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Calculator className="w-4 h-4 text-emerald-600" />
                  <span>Simulasi Aktif ({ot.calculationMode === 'per-jam' ? '2 Jam Lembur Minggu' : '1 Sesi Lembur Minggu'}):</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono">
                  <span>
                    Terencana:{' '}
                    <strong className="text-sky-700">
                      Rp{' '}
                      {(ot.calculationMode === 'per-jam'
                        ? ot.plannedHourlyRate * 2
                        : ot.plannedSessionRate
                      ).toLocaleString('id-ID')}
                    </strong>
                  </span>
                  <span>
                    Di Luar Jadwal:{' '}
                    <strong className="text-amber-700">
                      Rp{' '}
                      {(ot.calculationMode === 'per-jam'
                        ? ot.unscheduledHourlyRate * 2
                        : ot.unscheduledSessionRate
                      ).toLocaleString('id-ID')}
                    </strong>
                  </span>
                  <span className="text-slate-500">Senin–Sabtu: Rp 0</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card B: Standar Gaji Pokok & Tunjangan per Peran + Mode Periode */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>B. Standar Gaji Pokok & Tunjangan per Peran</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Menjadi acuan otomatis untuk pegawai baru atau pegawai yang belum diatur nominal khususnya.
                </p>
              </div>
              <button
                type="button"
                onClick={handleApplyRoleDefaultsToAllStaff}
                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Terapkan Standar Peran ke Semua Pegawai</span>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Period Mode Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-3 border-b border-slate-100">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Mode Perhitungan Gaji pada Laporan Keuangan
                  </label>
                  <select
                    value={payrollDraft.salaryPeriodMode}
                    onChange={(e) => {
                      setPayrollDirty(true);
                      setPayrollDraft((prev) => ({
                        ...prev,
                        salaryPeriodMode: e.target.value as 'full-month' | 'prorata-days'
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="full-month">Gaji Bulanan Penuh (Standar Penggajian Bulanan)</option>
                    <option value="prorata-days">Prorata Berdasarkan Jumlah Hari Rentang Tanggal</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Basis Hari Kerja/Kalender per Bulan (Untuk Mode Prorata)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={31}
                    value={payrollDraft.salaryBasisDaysPerMonth}
                    onChange={(e) => {
                      const val = Math.max(20, Math.min(31, Number(e.target.value) || 30));
                      setPayrollDirty(true);
                      setPayrollDraft((prev) => ({
                        ...prev,
                        salaryBasisDaysPerMonth: val
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Role Defaults Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {PAYROLL_ROLE_LIST.map((role) => {
                  const def = payrollDraft.roleDefaults[role] || { baseSalary: 0, fixedAllowance: 0 };
                  return (
                    <div
                      key={role}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900 text-xs">{role}</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-700">
                          Total: Rp {(def.baseSalary + def.fixedAllowance).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Gaji Pokok / Bln
                          </label>
                          <RupiahInput
                            value={def.baseSalary}
                            onChangeValue={(val) => {
                              setPayrollDirty(true);
                              setPayrollDraft((prev) => ({
                                ...prev,
                                roleDefaults: {
                                  ...prev.roleDefaults,
                                  [role]: { ...def, baseSalary: val }
                                }
                              }));
                            }}
                            className="w-full py-1.5 pr-2 border border-slate-300 rounded-lg font-mono font-bold text-[11px] bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Tunjangan Tetap
                          </label>
                          <RupiahInput
                            value={def.fixedAllowance}
                            onChangeValue={(val) => {
                              setPayrollDirty(true);
                              setPayrollDraft((prev) => ({
                                ...prev,
                                roleDefaults: {
                                  ...prev.roleDefaults,
                                  [role]: { ...def, fixedAllowance: val }
                                }
                              }));
                            }}
                            className="w-full py-1.5 pr-2 border border-slate-300 rounded-lg font-mono font-bold text-[11px] bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Card C: Pengaturan Gaji & Tarif Lembur Per Pegawai */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>C. Pengaturan Gaji & Komponen Tetap per Pegawai ({resolvedStaffRows.length} Pegawai)</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Atur gaji pokok, tunjangan tetap, atau tarif lembur Minggu khusus per pegawai. Nonaktifkan gaji tetap jika dokter/petugas hanya menerima fee pasien.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Estimasi Total Gaji Tetap / Bulan
                </span>
                <span className="font-mono font-black text-base text-emerald-700">
                  Rp {totalMonthlyPayrollEstimate.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100/80 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Pegawai & Peran</th>
                    <th className="p-3 w-44">Gaji Pokok / Bln (Rp)</th>
                    <th className="p-3 w-44">Tunjangan Tetap (Rp)</th>
                    <th className="p-3 w-44">Lembur Khusus/Jam (Opsional)</th>
                    <th className="p-3 text-right w-36">Total Tetap/Bln</th>
                    <th className="p-3 text-center w-28">Gaji Tetap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resolvedStaffRows.map(({ staff, setting }) => {
                    const rowTotal = setting.active
                      ? (setting.baseSalary || 0) + (setting.fixedAllowance || 0)
                      : 0;
                    return (
                      <tr
                        key={staff.id}
                        className={`hover:bg-slate-50/80 ${!setting.active ? 'opacity-60 bg-slate-50/40' : ''}`}
                      >
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900">{staff.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                              {setting.staffRole}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">{staff.id}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <RupiahInput
                            value={setting.baseSalary}
                            disabled={!setting.active}
                            onChangeValue={(val) => updateStaffSalaryRow(staff, { baseSalary: val })}
                            className="w-full py-1.5 pr-2 border border-slate-300 rounded-xl font-mono font-bold text-xs bg-white disabled:bg-slate-100"
                          />
                        </td>
                        <td className="p-3">
                          <RupiahInput
                            value={setting.fixedAllowance}
                            disabled={!setting.active}
                            onChangeValue={(val) => updateStaffSalaryRow(staff, { fixedAllowance: val })}
                            className="w-full py-1.5 pr-2 border border-slate-300 rounded-xl font-mono font-bold text-xs bg-white disabled:bg-slate-100"
                          />
                        </td>
                        <td className="p-3">
                          <RupiahInput
                            value={setting.customOvertimeHourlyRate || 0}
                            onChangeValue={(val) =>
                              updateStaffSalaryRow(staff, {
                                customOvertimeHourlyRate: val > 0 ? val : undefined
                              })
                            }
                            className="w-full py-1.5 pr-2 border border-slate-300 rounded-xl font-mono font-bold text-xs bg-white"
                          />
                          <span className="text-[9px] text-slate-400 block mt-0.5">
                            {setting.customOvertimeHourlyRate
                              ? 'Override tarif/jam'
                              : '0 = Ikuti tarif Minggu standar'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-emerald-700">
                          Rp {rowTotal.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => updateStaffSalaryRow(staff, { active: !setting.active })}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border cursor-pointer transition ${
                              setting.active
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {setting.active ? 'Aktif' : 'Fee Saja'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">
                Perubahan otomatis terhubung ke <strong>Laporan Keuangan &rarr; Rekap Gaji, Fee, dan Lembur</strong>.
              </span>
              <button
                type="button"
                onClick={handleSavePayrollConfig}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md transition flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Pengaturan Gaji & Lembur</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SECTION 2: PENGATURAN JASA MEDIS & FEE LAYANAN ==================== */}
      {activeSection === 'jasa-fee' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allTariffs.map((tariff) => {
            const categoryColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
              'Poli Umum': { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-900', badge: 'bg-sky-100 text-sky-800' },
              'Skrining & Nakes': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', badge: 'bg-emerald-100 text-emerald-800' },
              'Administrasi': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', badge: 'bg-amber-100 text-amber-800' },
              'Home Care': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', badge: 'bg-purple-100 text-purple-800' },
              'Telaah & Konseling': { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-900', badge: 'bg-teal-100 text-teal-800' }
            };

            const styling = categoryColors[tariff.category] || {
              bg: 'bg-slate-50',
              border: 'border-slate-200',
              text: 'text-slate-800',
              badge: 'bg-slate-200 text-slate-700'
            };
            const recipients = tariff.fee_recipients || [];
            const hasOnlyFacility = recipients.every((r) => r.penerima_role === 'non_petugas');
            const hasRequiredStaff = recipients.some(
              (r) => r.penerima_role !== 'non_petugas' && r.wajib_pilih_petugas
            );

            return (
              <div
                key={tariff.id}
                className={`p-4 rounded-2xl border ${styling.bg} ${styling.border} shadow-xs flex flex-col justify-between space-y-3 relative group transition hover:shadow-md`}
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide ${styling.badge}`}>
                      {tariff.category}
                    </span>
                    {tariff.isSystem && (
                      <span className="text-[10px] text-slate-400 font-medium">System Core</span>
                    )}
                  </div>

                  <div>
                    <h4 className={`font-black text-sm ${styling.text}`}>{tariff.name}</h4>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {tariff.description || 'Tidak ada deskripsi.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {recipients.map((rcp, rIdx) => {
                      const roleMeta = getServiceFeeRoleMeta(rcp.penerima_role, rolePermissions);
                      return (
                        <span
                          key={rcp.id || rIdx}
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${roleMeta.badgeClass}`}
                        >
                          {roleMeta.shortLabel}
                          {rcp.penerima_role !== 'non_petugas'
                            ? `: Rp ${rcp.nominal_fee_preview.toLocaleString('id-ID')}${
                                rcp.tipe_fee === 'persen' ? ` (${rcp.nilai_fee}%)` : ''
                              }`
                            : ''}
                        </span>
                      );
                    })}
                    {hasOnlyFacility ? (
                      <span className="px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-slate-500 text-[10px] font-bold">
                        Tanpa Petugas POS
                      </span>
                    ) : hasRequiredStaff ? (
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-extrabold">
                        Wajib Pilih Petugas di POS
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-slate-600 text-[10px] font-bold">
                        Petugas Opsional
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex justify-between items-end gap-2">
                  <div className="space-y-0.5">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">
                        Biaya Layanan (Pasien)
                      </span>
                      <span className="font-mono font-black text-base text-slate-900">
                        Rp {tariff.price.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="text-[10px] font-semibold text-slate-600 space-y-0.5">
                      <div>
                        Fee Petugas:{' '}
                        <strong className="font-mono text-emerald-700">
                          Rp {tariff.total_unit_fee_petugas.toLocaleString('id-ID')}
                        </strong>
                      </div>
                      <div>
                        Bagi Hasil Fasilitas:{' '}
                        <strong className="font-mono text-sky-700">
                          Rp {tariff.fee_fasilitas_preview.toLocaleString('id-ID')}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Edit & Delete Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(tariff)}
                      title="Edit Jasa & Tarif"
                      className="p-2 bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 rounded-xl font-bold transition shadow-xs flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTariff(tariff)}
                      title="Hapus Tarif"
                      className="p-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl font-bold transition shadow-xs flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== SECTION 3: REKAP FEE PETUGAS (LEDGER POS OTOMATIS) ==================== */}
      {activeSection === 'rekap-fee' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Dari Tanggal
                </label>
                <div className="flex items-center gap-1.5 border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={ledgerStartDate}
                    onChange={(e) => setLedgerStartDate(e.target.value)}
                    className="font-mono font-bold text-slate-800 outline-none text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Sampai Tanggal
                </label>
                <div className="flex items-center gap-1.5 border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={ledgerEndDate}
                    onChange={(e) => setLedgerEndDate(e.target.value)}
                    className="font-mono font-bold text-slate-800 outline-none text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Role Penerima
                </label>
                <select
                  value={ledgerRoleFilter}
                  onChange={(e) => setLedgerRoleFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 text-xs outline-none"
                >
                  <option value="SEMUA">Semua Role</option>
                  {ledgerRoleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Petugas
                </label>
                <select
                  value={ledgerStaffFilter}
                  onChange={(e) => setLedgerStaffFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 text-xs outline-none max-w-[200px]"
                >
                  <option value="SEMUA">Semua Petugas</option>
                  {ledgerStaffFilterOptions.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Status Pembayaran
                </label>
                <select
                  value={ledgerStatusFilter}
                  onChange={(e) =>
                    setLedgerStatusFilter(
                      e.target.value as 'aktif' | 'belum_dibayar' | 'dibayar' | 'dibatalkan' | 'semua'
                    )
                  }
                  className="px-3 py-1.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 text-xs outline-none"
                >
                  <option value="aktif">Aktif (Belum &amp; Sudah Dibayar)</option>
                  <option value="belum_dibayar">Belum Dibayar</option>
                  <option value="dibayar">Sudah Dibayar</option>
                  <option value="dibatalkan">Dibatalkan / Retur</option>
                  <option value="semua">Semua Status</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setLedgerStartDate(todayYMD);
                  setLedgerEndDate(todayYMD);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 font-bold text-[11px] text-slate-700 cursor-pointer"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => {
                  setLedgerStartDate(monthStartYMD);
                  setLedgerEndDate(todayYMD);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 font-bold text-[11px] text-slate-700 cursor-pointer"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => {
                  setLedgerStartDate('');
                  setLedgerEndDate('');
                }}
                className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 font-bold text-[11px] text-indigo-700 cursor-pointer"
              >
                Semua Tanggal
              </button>
            </div>
          </div>

          {/* KPI Cards (Termasuk Bagi Hasil Fasilitas vs Petugas) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Biaya Layanan (Pasien)
              </span>
              <div className="font-mono font-black text-lg text-slate-900 mt-1">
                Rp {ledgerRevenueSplit.totalBiayaLayanan.toLocaleString('id-ID')}
              </div>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                {ledgerRevenueSplit.serviceLineCount} Item Jasa Terbayar
              </span>
            </div>

            <div className="bg-sky-50/70 p-4 rounded-2xl border border-sky-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-sky-800 block">
                Bagi Hasil Fasilitas
              </span>
              <div className="font-mono font-black text-lg text-sky-800 mt-1">
                Rp {ledgerRevenueSplit.totalFeeFasilitas.toLocaleString('id-ID')}
              </div>
              <span className="text-[10px] text-sky-700 font-medium block mt-0.5">
                Biaya Layanan − Total Fee Petugas
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Total Hak Fee Petugas
              </span>
              <div className="font-mono font-black text-lg text-slate-900 mt-1">
                Rp {ledgerTotals.totalAktif.toLocaleString('id-ID')}
              </div>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                {ledgerTotals.countAktif} Alokasi ({ledgerTotals.qtyAktif} layanan)
              </span>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-amber-800 block">
                Fee Belum Dibayar
              </span>
              <div className="font-mono font-black text-lg text-amber-800 mt-1">
                Rp {ledgerTotals.belumDibayar.toLocaleString('id-ID')}
              </div>
              <span className="text-[10px] text-amber-700 font-medium block mt-0.5">
                Menunggu pelunasan ke petugas
              </span>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                Fee Sudah Dibayar
              </span>
              <div className="font-mono font-black text-lg text-emerald-700 mt-1">
                Rp {ledgerTotals.sudahDibayar.toLocaleString('id-ID')}
              </div>
              <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                Dibatalkan/Retur: Rp {ledgerTotals.dibatalkan.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Ringkasan per Role Petugas (Semua Role Sistem & POS Kasir) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-black text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>Rekap Fee per Role Petugas (Sistem &amp; POS Kasir)</span>
              </h4>
              {ledgerRoleFilter !== 'SEMUA' && (
                <button
                  type="button"
                  onClick={() => setLedgerRoleFilter('SEMUA')}
                  className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                >
                  Tampilkan Semua Role
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {ledgerPerRoleSummary.map((r) => {
                const isActiveFilter =
                  ledgerRoleFilter !== 'SEMUA' &&
                  normalizeServiceFeeRole(ledgerRoleFilter) === r.roleValue;
                return (
                  <button
                    key={String(r.roleValue)}
                    type="button"
                    onClick={() =>
                      setLedgerRoleFilter((prev) =>
                        normalizeServiceFeeRole(prev) === r.roleValue ? 'SEMUA' : String(r.roleValue)
                      )
                    }
                    className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                      isActiveFilter
                        ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-400'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-bold ${r.badgeClass}`}
                    >
                      {r.label}
                    </span>
                    <div className="font-mono font-black text-sm text-slate-900 mt-1.5">
                      Rp {r.totalFee.toLocaleString('id-ID')}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {r.itemCount} entri · {r.staffIds.size} petugas
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per-Staff Summary Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Akumulasi Otomatis Fee per Petugas &amp; Role ({ledgerPerStaffSummary.length})</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Merekap seluruh petugas &amp; role yang tercatat di transaksi POS Kasir (item jasa maupun petugas layanan klinik/e-resep) dan ledger <code>{ledgerTableName}</code>.
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showZeroFeeStaff}
                  onChange={(e) => setShowZeroFeeStaff(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Sertakan petugas terdaftar (Rp 0)</span>
              </label>
            </div>

            {ledgerPerStaffSummary.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic text-xs">
                Belum ada akumulasi fee petugas pada filter periode ini. Tambahkan item jasa atau pilih petugas layanan di POS Kasir untuk mencatat ledger otomatis.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100/80 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Nama Petugas &amp; Role</th>
                      <th className="p-3 text-center">Jml Transaksi / Qty</th>
                      <th className="p-3 text-right">Belum Dibayar</th>
                      <th className="p-3 text-right">Sudah Dibayar</th>
                      <th className="p-3 text-right">Total Hak Fee</th>
                      <th className="p-3 text-center">Aksi Pelunasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgerPerStaffSummary.map((row) => {
                      const roleMeta = getServiceFeeRoleMeta(row.penerimaRole, rolePermissions);
                      return (
                        <tr key={row.petugasId} className="hover:bg-slate-50/80">
                          <td className="p-3">
                            <div className="font-extrabold text-slate-900">{row.namaPetugas}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${roleMeta.badgeClass}`}>
                                {row.rolePetugas || roleMeta.shortLabel}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">{row.petugasId}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono">
                            <strong>{row.itemCount}</strong> item ({row.totalQty}x)
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-amber-700">
                            Rp {row.belumDibayar.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-700">
                            Rp {row.sudahDibayar.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-slate-900">
                            Rp {row.totalFee.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-center">
                            {row.unpaidIds.length > 0 && onUpdateFeeLedgerStatus ? (
                              <button
                                type="button"
                                onClick={() => onUpdateFeeLedgerStatus(row.unpaidIds, 'dibayar', currentUserName)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] cursor-pointer transition"
                              >
                                Tandai Semua Dibayar ({row.unpaidIds.length})
                              </button>
                            ) : row.itemCount > 0 ? (
                              <span className="text-[10px] font-bold text-emerald-700">Lunas</span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Belum ada fee</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail Ledger Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <Filter className="w-4 h-4 text-sky-600" />
                <span>Rincian Log Fee Petugas ({filteredFeeLedger.length} entri)</span>
              </h4>
            </div>

            {filteredFeeLedger.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic text-xs">
                Tidak ada rincian log fee petugas sesuai filter saat ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100/80 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3">No. Transaksi &amp; Tgl</th>
                      <th className="p-3">Pasien / Pelanggan</th>
                      <th className="p-3">Jasa Layanan</th>
                      <th className="p-3">Petugas Penerima</th>
                      <th className="p-3 text-right">Qty × Fee</th>
                      <th className="p-3 text-right">Total Fee</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFeeLedger.map((entry) => {
                      const effRole = resolveEffectiveEntryRole(entry, staffList);
                      const roleMeta = getServiceFeeRoleMeta(effRole, rolePermissions);
                      const rowSubtotal =
                        Number(entry.subtotal_layanan) ||
                        (Number(entry.tarif_biaya) || 0) * (Number(entry.qty) || 1);
                      const rowFacilityShare =
                        entry.fee_fasilitas !== undefined && entry.fee_fasilitas !== null
                          ? Number(entry.fee_fasilitas)
                          : Math.max(0, rowSubtotal - (Number(entry.total_fee_item) || 0));
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/80">
                          <td className="p-3">
                            <div className="font-mono font-bold text-sky-800">{entry.transaction_id}</div>
                            <div className="font-mono text-[10px] text-slate-500">{entry.transaction_date}</div>
                          </td>
                          <td className="p-3 font-semibold text-slate-800">{entry.customer_name || '-'}</td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{entry.service_name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Biaya Layanan: Rp {entry.tarif_biaya.toLocaleString('id-ID')}
                              {entry.tipe_fee === 'persen' ? ` (Fee ${entry.nilai_fee}%)` : ''}
                            </div>
                            <div className="text-[10px] text-sky-700 font-mono font-semibold">
                              Bagian Fasilitas: Rp {rowFacilityShare.toLocaleString('id-ID')}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{entry.nama_petugas}</div>
                            <span className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-bold mt-0.5 ${roleMeta.badgeClass}`}>
                              {entry.role_petugas || roleMeta.shortLabel}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono text-slate-700">
                            {entry.qty} × Rp {entry.nominal_fee_satuan.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-slate-900">
                            Rp {entry.total_fee_item.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-center">
                            {entry.status_pembayaran === 'dibayar' ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold">
                                Dibayar
                              </span>
                            ) : entry.status_pembayaran === 'dibatalkan' ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-extrabold">
                                Dibatalkan
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-extrabold">
                                Belum Dibayar
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {entry.status_pembayaran === 'dibatalkan' ? (
                              <span className="text-[10px] text-slate-400">-</span>
                            ) : onUpdateFeeLedgerStatus ? (
                              entry.status_pembayaran === 'belum_dibayar' ? (
                                <button
                                  type="button"
                                  onClick={() => onUpdateFeeLedgerStatus([entry.id], 'dibayar', currentUserName)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] cursor-pointer"
                                >
                                  Tandai Dibayar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateFeeLedgerStatus([entry.id], 'belum_dibayar', currentUserName)
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-[10px] cursor-pointer"
                                >
                                  Reset Belum
                                </button>
                              )
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Add / Edit Tariff & Jasa */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h3 className="font-extrabold text-sm uppercase tracking-wide flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-emerald-400" />
                {editingTariff ? 'Edit Jasa & Tarif' : 'Tambah Jasa & Tarif Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Jasa / Layanan *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Jasa Konsultasi Spesialis, Tindakan Nebulizer..."
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (formError) setFormError('');
                  }}
                  className="w-full p-2.5 border rounded-xl bg-white font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Kategori Layanan *</label>
                <div className="flex items-center gap-2">
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    disabled={Boolean(editingTariff?.isSystem)}
                    className="flex-1 p-2.5 border rounded-xl bg-white font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCategoryInput((prev) => !prev);
                      setNewCategoryName('');
                      setCategoryInputError('');
                    }}
                    disabled={Boolean(editingTariff?.isSystem)}
                    title="Tambah Kategori Layanan Baru"
                    aria-label="Tambah Kategori Layanan Baru"
                    className="p-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl font-bold transition shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {showAddCategoryInput && !editingTariff?.isSystem && (
                  <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => {
                          setNewCategoryName(e.target.value);
                          if (categoryInputError) setCategoryInputError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomCategory();
                          }
                        }}
                        placeholder="Ketik nama kategori layanan baru..."
                        autoFocus
                        className="flex-1 px-2.5 py-1.5 border rounded-lg bg-white font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomCategory}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg transition cursor-pointer shrink-0"
                      >
                        Tambah
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCategoryInput(false);
                          setNewCategoryName('');
                          setCategoryInputError('');
                        }}
                        title="Batal tambah kategori"
                        className="p-1.5 bg-white hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg transition cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {categoryInputError && (
                      <p className="text-[10px] text-rose-600 font-semibold">{categoryInputError}</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Biaya Layanan (Dibebankan ke Pasien) (Rp) *
                </label>
                <RupiahInput
                  value={formPrice}
                  onChangeValue={setFormPrice}
                  className="w-full py-2.5 pr-3 border rounded-xl font-mono font-black text-slate-900 bg-white outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Total biaya yang ditagihkan ke pasien. Fee petugas dipotong dari biaya layanan ini, dan sisanya menjadi bagian / fee fasilitas (bagi hasil).
                </p>
              </div>

              {/* Aturan Penerima Fee & Integrasi Petugas POS (Multi-Penerima + Bagi Hasil) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold text-[11px] uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-sky-600" />
                    <span>Aturan Penerima Fee &amp; Petugas di POS ({formRecipients.length} Penerima)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRecipientRule}
                    className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tambah Penerima / Role</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {formRecipients.map((rcp, rIdx) => {
                    const isFacilityOnly = rcp.penerima_role === 'non_petugas';
                    const otherRecipientsFee = previewRecipientBreakdown.reduce(
                      (s, item, i) => (i === rIdx ? s : s + item.unitFee),
                      0
                    );
                    const remainingAssignableFee = Math.max(0, formPrice - otherRecipientsFee);
                    const currentUnitFee = previewRecipientBreakdown[rIdx]?.unitFee || 0;

                    return (
                      <div
                        key={rcp.id || rIdx}
                        className="p-3 rounded-xl bg-white border border-slate-200 space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-extrabold text-[10px] uppercase">
                            Penerima #{rIdx + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            {!isFacilityOnly && (
                              <span className="text-[10px] font-mono font-bold text-emerald-700">
                                Fee: Rp {currentUnitFee.toLocaleString('id-ID')}
                              </span>
                            )}
                            {formRecipients.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRecipientRule(rIdx)}
                                title="Hapus Penerima Fee"
                                className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Penerima / Role Fee *
                          </label>
                          <select
                            value={rcp.penerima_role}
                            onChange={(e) =>
                              handleUpdateRecipientRule(rIdx, {
                                penerima_role: e.target.value as ServiceFeeRole
                              })
                            }
                            className="w-full p-2.5 border rounded-xl bg-white font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                          >
                            {serviceRoleOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <label
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${
                            isFacilityOnly
                              ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                              : 'bg-slate-50/70 border-slate-200 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isFacilityOnly ? false : rcp.wajib_pilih_petugas}
                            disabled={isFacilityOnly}
                            onChange={(e) =>
                              handleUpdateRecipientRule(rIdx, {
                                wajib_pilih_petugas: e.target.checked
                              })
                            }
                            className="mt-0.5 w-4 h-4 accent-sky-600"
                          />
                          <div>
                            <span className="font-bold text-slate-800 block">
                              Wajib Pilih Petugas di POS
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              Jika aktif, kasir wajib memilih petugas sesuai role ini sebelum transaksi disimpan.
                            </span>
                          </div>
                        </label>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">Tipe Fee *</label>
                            <select
                              value={rcp.tipe_fee}
                              disabled={isFacilityOnly}
                              onChange={(e) =>
                                handleUpdateRecipientRule(rIdx, {
                                  tipe_fee: e.target.value as ServiceFeeType
                                })
                              }
                              className="w-full p-2.5 border rounded-xl bg-white font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                            >
                              <option value="nominal">Nominal Tetap (Rp)</option>
                              <option value="persen">Persentase (%) dari Biaya Layanan</option>
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="font-bold text-slate-700">
                                Nilai Fee {rcp.tipe_fee === 'persen' ? '(%)' : '(Rp)'} *
                              </label>
                              {!isFacilityOnly && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateRecipientRule(rIdx, {
                                      nilai_fee:
                                        rcp.tipe_fee === 'persen'
                                          ? formPrice > 0
                                            ? Math.round((remainingAssignableFee / formPrice) * 100)
                                            : 100
                                          : remainingAssignableFee
                                    })
                                  }
                                  className="text-[10px] font-bold text-sky-700 hover:underline cursor-pointer"
                                >
                                  Sisa Biaya
                                </button>
                              )}
                            </div>
                            {rcp.tipe_fee === 'nominal' ? (
                              <RupiahInput
                                value={isFacilityOnly ? 0 : rcp.nilai_fee}
                                disabled={isFacilityOnly}
                                onChangeValue={(val) =>
                                  handleUpdateRecipientRule(rIdx, { nilai_fee: val })
                                }
                                className="w-full py-2 pr-3 border rounded-xl font-mono font-black text-slate-900 bg-white outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                              />
                            ) : (
                              <div className="relative">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.5}
                                  disabled={isFacilityOnly}
                                  value={isFacilityOnly ? 0 : rcp.nilai_fee}
                                  onChange={(e) =>
                                    handleUpdateRecipientRule(rIdx, {
                                      nilai_fee: Math.max(
                                        0,
                                        Math.min(100, Number(e.target.value) || 0)
                                      )
                                    })
                                  }
                                  className="w-full p-2.5 pr-8 border rounded-xl font-mono font-black text-slate-900 bg-white outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-500">
                                  %
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Simulasi Bagi Hasil Fasilitas vs Petugas */}
                <div
                  className={`p-3 rounded-xl border text-[11px] space-y-1.5 ${
                    previewFacilityShare < 0
                      ? 'bg-rose-50 border-rose-300'
                      : 'bg-emerald-50/80 border-emerald-200'
                  }`}
                >
                  <div className="font-extrabold uppercase tracking-wider text-[10px] text-slate-700">
                    Simulasi Bagi Hasil (Per 1 Layanan)
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span>Biaya Layanan (Pasien):</span>
                    <span className="font-mono font-bold">Rp {formPrice.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-800">
                    <span>Total Fee Semua Petugas ({formRecipients.length} penerima):</span>
                    <span className="font-mono font-bold">
                      - Rp {previewTotalStaffFee.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div
                    className={`flex items-center justify-between pt-1.5 border-t font-black ${
                      previewFacilityShare < 0
                        ? 'border-rose-200 text-rose-700'
                        : 'border-emerald-200 text-sky-900'
                    }`}
                  >
                    <span>Bagian / Fee Fasilitas:</span>
                    <span className="font-mono text-sm">
                      Rp {previewFacilityShare.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Keterangan / Deskripsi</label>
                <textarea
                  rows={2}
                  placeholder="Deskripsi singkat mengenai layanan atau kriteria tarif ini..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full p-2.5 border rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  {formError}
                </div>
              )}

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold transition cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl uppercase tracking-wider shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Jasa & Tarif</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirm Delete */}
      {confirmDeleteTariff && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-200 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  {confirmDeleteTariff.isSystem ? 'Reset Tarif ke Rp 0?' : 'Hapus Jasa & Tarif?'}
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  {confirmDeleteTariff.isSystem
                    ? `Tarif inti "${confirmDeleteTariff.name}" akan direset menjadi Rp 0 dan disinkronkan ke Supabase.`
                    : `Tarif layanan "${confirmDeleteTariff.name}" akan dihapus permanen dan disinkronkan ke Supabase.`}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteTariff(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTariff}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold cursor-pointer"
              >
                {confirmDeleteTariff.isSystem ? 'Reset Rp 0' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal SQL Schema Supabase (APJ / Owner Only) */}
      {isOwnerAdmin && showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  Skrip SQL Tabel {feeTableName} &amp; {ledgerTableName} (Supabase)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Salin dan jalankan skrip SQL di bawah ini pada <strong>SQL Editor Supabase</strong> agar tabel{' '}
                <code>{feeTableName}</code> (gaji, lembur, &amp; aturan tarif jasa <code>system_tariff_configs</code>) serta tabel{' '}
                <code>{ledgerTableName}</code> (ledger fee petugas dari POS) tersinkron 2 arah secara real-time.
              </p>
              <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto leading-relaxed">
                {`${SUPABASE_FEE_CONFIG_SQL_SCHEMA}\n\n${SUPABASE_FEE_LEDGER_SQL_SCHEMA}`}
              </pre>
            </div>
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
              {(onSyncSupabase || onSyncFeeLedgerSupabase) && !isDemoSandbox ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowSqlModal(false);
                    handleManualSync('push');
                  }}
                  className="min-h-[38px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Kirim Data Sekarang</span>
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      `${SUPABASE_FEE_CONFIG_SQL_SCHEMA}\n\n${SUPABASE_FEE_LEDGER_SQL_SCHEMA}`
                    );
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2000);
                  }}
                  className="min-h-[38px] px-4 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'SQL Tersalin' : 'Salin Skrip SQL'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSqlModal(false)}
                  className="min-h-[38px] px-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
