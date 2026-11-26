import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ClipboardList,
  Printer,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  Database,
  RefreshCw,
  Code,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  X,
  Copy,
  Check,
  Filter,
  ChevronDown,
  FileSpreadsheet,
  Camera
} from 'lucide-react';
import {
  Medicine,
  PurchaseInvoice,
  StockMutation,
  StockOpnameRecord,
  Transaction,
  isOwnerAdminRole
} from '../types';
import { useFacilityProfiles, formatPharmacyAddress } from './PharmacySettingsModal';
import { openPrintWindow } from '../utils/printHelper';
import { PaginationControls } from './PaginationControls';
import { CameraBarcodeScannerModal, playBarcodeBeep } from './CameraBarcodeScannerModal';
import {
  SUPABASE_STOCK_CARD_SQL_SCHEMA,
  DEFAULT_STOCK_CARD_TABLE,
  getSupabaseConfig,
  setSupabaseConfig
} from '../utils/supabaseClient';
import {
  resolveMutationBatchDetails,
  getTransactionTypeShortLabel
} from '../utils/stockCardBatchHelper';

interface StockCardViewProps {
  medicines: Medicine[];
  stockMutations: StockMutation[];
  transactions?: Transaction[];
  purchaseInvoices?: PurchaseInvoice[];
  opnameRecords?: StockOpnameRecord[];
  activeRole?: string;
  onAddManualMutation?: (params: {
    medicineId: string;
    adjustType: 'MASUK' | 'KELUAR';
    qty: number;
    ket: string;
    refNo?: string;
    batchNo?: string;
    expDate?: string;
  }) => Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  onDeleteMutations?: (ids: string[]) => Promise<{
    success?: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> | void;
  onSyncSupabase?: () => Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    needsBatchColumnMigration?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  needsTableSetup?: boolean;
  needsBatchColumnMigration?: boolean;
  isDemoSandbox?: boolean;
}

const MUTATION_TYPE_LABELS: { value: string; label: string }[] = [
  { value: 'SEMUA', label: 'Semua Jenis Mutasi' },
  { value: 'STOK_AWAL', label: 'Stok Awal' },
  { value: 'PEMBELIAN', label: 'Pembelian PBF' },
  { value: 'PENJUALAN', label: 'Penjualan POS / Faktur' },
  { value: 'PENYESUAIAN', label: 'Penyesuaian / Retur Jual' },
  { value: 'STOK_OPNAME', label: 'Stok Opname' },
  { value: 'RETUR PEMBELIAN', label: 'Retur Pembelian' },
  { value: 'RESEP_DOKTER', label: 'Resep Dokter' },
  { value: 'TRANSFER_MASUK', label: 'Transfer Masuk' },
  { value: 'TRANSFER_KELUAR', label: 'Transfer Keluar' }
];

const getMutationBadgeClass = (type: StockMutation['type']): string => {
  switch (type) {
    case 'STOK_AWAL':
    case 'PEMBELIAN':
    case 'TRANSFER_MASUK':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'PENJUALAN':
    case 'RESEP_DOKTER':
    case 'TRANSFER_KELUAR':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'PENYESUAIAN':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'STOK_OPNAME':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'RETUR PEMBELIAN':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const StockCardView: React.FC<StockCardViewProps> = ({
  medicines,
  stockMutations,
  transactions = [],
  purchaseInvoices = [],
  opnameRecords = [],
  activeRole = 'APJ / Owner',
  onAddManualMutation,
  onDeleteMutations,
  onSyncSupabase,
  needsTableSetup = false,
  needsBatchColumnMigration = false,
  isDemoSandbox = false
}) => {
  const { pharmacyProfile, apjProfile } = useFacilityProfiles();
  const pharmacyFullAddress = formatPharmacyAddress(pharmacyProfile);
  const isSuperAdmin = isOwnerAdminRole(activeRole);

  const [activeSubView, setActiveSubView] = useState<'mutasi' | 'kartu-stok'>('mutasi');
  const [selectedMedId, setSelectedMedId] = useState<string>(medicines[0]?.id || 'ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('SEMUA');
  const [searchQuery, setSearchQuery] = useState('');

  // Searchable Combobox States for Pilih Obat / Tampilan Ledger
  const [isMedDropdownOpen, setIsMedDropdownOpen] = useState(false);
  const [medSearchTerm, setMedSearchTerm] = useState('');
  const [highlightedMedIdx, setHighlightedMedIdx] = useState<number>(0);
  const medComboboxRef = useRef<HTMLDivElement>(null);
  const medInputRef = useRef<HTMLInputElement>(null);

  // Searchable Combobox States for Penyesuaian Stok Modal Pilih Obat
  const [isAdjMedDropdownOpen, setIsAdjMedDropdownOpen] = useState(false);
  const [adjMedSearchTerm, setAdjMedSearchTerm] = useState('');
  const adjMedComboboxRef = useRef<HTMLDivElement>(null);

  // Close combobox dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (medComboboxRef.current && !medComboboxRef.current.contains(e.target as Node)) {
        setIsMedDropdownOpen(false);
      }
      if (adjMedComboboxRef.current && !adjMedComboboxRef.current.contains(e.target as Node)) {
        setIsAdjMedDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [showStockCardScanner, setShowStockCardScanner] = useState(false);

  // Ensure selectedMedId remains valid if medicines list loads asynchronously or switches demo/prod
  useEffect(() => {
    if (selectedMedId === 'ALL') return;
    if (!selectedMedId && medicines.length > 0) {
      setSelectedMedId(medicines[0].id);
      return;
    }
    if (selectedMedId && medicines.length > 0 && !medicines.some((m) => m.id === selectedMedId)) {
      setSelectedMedId(medicines[0].id);
    }
  }, [medicines, selectedMedId]);

  const medicineById = useMemo(() => {
    const map = new Map<string, Medicine>();
    medicines.forEach((m) => {
      if (m.id) map.set(m.id, m);
    });
    return map;
  }, [medicines]);

  const transactionById = useMemo(() => {
    const map = new Map<string, Transaction>();
    transactions.forEach((t) => {
      if (t.id) map.set(t.id, t);
    });
    return map;
  }, [transactions]);

  const purchaseByInvoiceNo = useMemo(() => {
    const map = new Map<string, PurchaseInvoice>();
    purchaseInvoices.forEach((inv) => {
      if (inv.invoiceNo) map.set(inv.invoiceNo, inv);
      if (inv.id) map.set(inv.id, inv);
    });
    return map;
  }, [purchaseInvoices]);

  const opnameByRefNo = useMemo(() => {
    const map = new Map<string, StockOpnameRecord>();
    opnameRecords.forEach((rec) => {
      if (rec.refNo) map.set(rec.refNo, rec);
      if (rec.id) map.set(rec.id, rec);
    });
    return map;
  }, [opnameRecords]);

  const resolvedBatchByMutId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveMutationBatchDetails>>();
    const ctx = {
      medicineById,
      transactionById,
      purchaseByInvoiceNo,
      opnameByRefNo
    };
    stockMutations.forEach((m) => {
      map.set(m.id, resolveMutationBatchDetails(m, ctx));
    });
    return map;
  }, [stockMutations, medicineById, transactionById, purchaseByInvoiceNo, opnameByRefNo]);

  const isAllMode = selectedMedId === 'ALL';
  const selectedMed = isAllMode
    ? undefined
    : medicineById.get(selectedMedId) || medicines[0];
  const resolvedMedId = isAllMode ? 'ALL' : selectedMed?.id || selectedMedId;

  // Filtered medicines for Pilih Obat autocomplete dropdown (capped for instant dropdown render)
  const filteredMedicinesForPicker = useMemo(() => {
    const q = medSearchTerm.trim().toLowerCase();
    const matched = !q
      ? medicines
      : medicines.filter((m) => {
          const hay = `${m.name} ${m.id} ${m.barcode || ''} ${m.batchNo || ''} ${m.kekuatan || ''} ${m.category || ''} ${m.rack || ''}`.toLowerCase();
          return hay.includes(q);
        });
    return matched.slice(0, 50);
  }, [medicines, medSearchTerm]);

  const filteredAdjMedicinesForPicker = useMemo(() => {
    const q = adjMedSearchTerm.trim().toLowerCase();
    const matched = !q
      ? medicines
      : medicines.filter((m) => {
          const hay = `${m.name} ${m.id} ${m.barcode || ''} ${m.batchNo || ''} ${m.kekuatan || ''}`.toLowerCase();
          return hay.includes(q);
        });
    return matched.slice(0, 50);
  }, [medicines, adjMedSearchTerm]);

  // Supabase Sync & Schema Modal States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [stockCardTableInput, setStockCardTableInput] = useState(
    () => getSupabaseConfig().stockCardTable || DEFAULT_STOCK_CARD_TABLE
  );

  // Bulk Selection & Delete States (APJ / Owner)
  const [selectedMutIds, setSelectedMutIds] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Manual Adjustment Modal States
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjMedId, setAdjMedId] = useState<string>('');
  const [adjType, setAdjType] = useState<'MASUK' | 'KELUAR'>('MASUK');
  const [adjQty, setAdjQty] = useState<string>('1');
  const [adjRefNo, setAdjRefNo] = useState<string>('');
  const [adjBatchNo, setAdjBatchNo] = useState<string>('');
  const [adjExpDate, setAdjExpDate] = useState<string>('');
  const [adjKet, setAdjKet] = useState<string>('');
  const [adjError, setAdjError] = useState<string | null>(null);
  const [isSavingAdjust, setIsSavingAdjust] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const filteredMutations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stockMutations.filter((m) => {
      if (!isAllMode && m.medicineId !== resolvedMedId) {
        return false;
      }
      if (startDate && m.date < startDate) return false;
      if (endDate && m.date > endDate) return false;
      if (typeFilter !== 'SEMUA' && m.type !== typeFilter) return false;
      if (q) {
        const med = medicineById.get(m.medicineId);
        const batchInfo = resolvedBatchByMutId.get(m.id);
        const batchText = batchInfo
          ? batchInfo.details.map((d) => `${d.batchNo} ${d.expDate}`).join(' ')
          : '';
        const hay = `${m.refNo} ${m.medicineName} ${m.medicineId} ${med?.batchNo || ''} ${med?.barcode || ''} ${batchText} ${m.ket} ${m.petugas} ${m.type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [stockMutations, medicineById, resolvedBatchByMutId, isAllMode, resolvedMedId, startDate, endDate, typeFilter, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [resolvedMedId, startDate, endDate, typeFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredMutations.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedMutations = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredMutations.slice(start, start + pageSize);
  }, [filteredMutations, safePage, pageSize]);

  // Clear invalid selection IDs when list changes
  useEffect(() => {
    const visibleSet = new Set(filteredMutations.map((m) => m.id));
    setSelectedMutIds((prev) => prev.filter((id) => visibleSet.has(id)));
  }, [filteredMutations]);

  const { totalIn, totalOut } = useMemo(() => {
    let sumIn = 0;
    let sumOut = 0;
    for (const m of filteredMutations) {
      sumIn += Number(m.inQty) || 0;
      sumOut += Number(m.outQty) || 0;
    }
    return { totalIn: sumIn, totalOut: sumOut };
  }, [filteredMutations]);

  const allFilteredIds = useMemo(() => filteredMutations.map((m) => m.id), [filteredMutations]);
  const isAllSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedMutIds.includes(id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMutIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      const merged = new Set([...selectedMutIds, ...allFilteredIds]);
      setSelectedMutIds(Array.from(merged));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedMutIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRunSupabaseSync = async () => {
    if (!onSyncSupabase) return;
    setIsSyncing(true);
    setSyncToast(null);
    try {
      const res = await onSyncSupabase();
      if (res.isDemo) {
        setSyncToast({
          type: 'warning',
          message:
            'Mode Demo / Sandbox aktif. Sinkronisasi ke Supabase produksi dinonaktifkan otomatis untuk isolasi data demo.'
        });
      } else if (res.success) {
        setSyncToast({
          type: res.needsBatchColumnMigration ? 'warning' : 'success',
          message: res.needsBatchColumnMigration
            ? `Sinkronisasi 2-arah berhasil (${res.count ?? stockMutations.length} mutasi), namun kolom batch_no/exp_date/batch_details belum ada di tabel Supabase "${stockCardTableInput || DEFAULT_STOCK_CARD_TABLE}". Jalankan Skema SQL (ALTER TABLE) agar kolom Batch & ED tersimpan di cloud.`
            : `Sinkronisasi 2-arah berhasil! Total ${res.count ?? stockMutations.length} catatan mutasi kartu stok tersinkron dengan Supabase.`
        });
      } else if (res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: `Tabel "${stockCardTableInput || DEFAULT_STOCK_CARD_TABLE}" belum dibuat di Supabase. Salin skrip SQL pada modal Skema SQL.`
        });
      } else {
        setSyncToast({
          type: 'error',
          message: res.error || 'Gagal melakukan sinkronisasi Kartu Stok ke Supabase.'
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveTableName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSandbox) {
      setSyncToast({
        type: 'warning',
        message: 'Konfigurasi Supabase tidak dapat diubah saat Mode Demo Sandbox aktif.'
      });
      return;
    }
    const cleaned = stockCardTableInput.trim() || DEFAULT_STOCK_CARD_TABLE;
    setStockCardTableInput(cleaned);
    setSupabaseConfig({ stockCardTable: cleaned });
    await handleRunSupabaseSync();
  };

  const handleCopySchema = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_STOCK_CARD_SQL_SCHEMA);
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2500);
    } catch {
      setSyncToast({
        type: 'warning',
        message: 'Gagal menyalin otomatis. Silakan blok dan salin teks SQL secara manual.'
      });
    }
  };

  const openAdjustModal = () => {
    const defaultMed = selectedMed || medicines[0];
    setAdjMedId(defaultMed?.id || '');
    setAdjMedSearchTerm('');
    setIsAdjMedDropdownOpen(false);
    setAdjType('MASUK');
    setAdjQty('1');
    setAdjRefNo('');
    setAdjBatchNo(defaultMed?.batchNo || '');
    setAdjExpDate(defaultMed?.expDate || '');
    setAdjKet('');
    setAdjError(null);
    setShowAdjustModal(true);
  };

  const handleAdjMedChange = (medId: string) => {
    setAdjMedId(medId);
    setAdjMedSearchTerm('');
    setIsAdjMedDropdownOpen(false);
    const target = medicines.find((m) => m.id === medId);
    if (target) {
      setAdjBatchNo(target.batchNo || '');
      setAdjExpDate(target.expDate || '');
    }
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjError(null);

    if (!onAddManualMutation) return;
    if (!adjMedId) {
      setAdjError('Pilih obat yang akan disesuaikan stoknya.');
      return;
    }

    const parsedQty = Math.round(Number(adjQty) || 0);
    if (parsedQty <= 0) {
      setAdjError('Jumlah penyesuaian stok harus lebih dari 0.');
      return;
    }

    const targetMed = medicines.find((m) => m.id === adjMedId);
    if (adjType === 'KELUAR' && targetMed && parsedQty > targetMed.stock) {
      setAdjError(
        `Stok keluar (${parsedQty} ${targetMed.unit}) melebihi saldo fisik saat ini (${targetMed.stock} ${targetMed.unit}).`
      );
      return;
    }

    if (!adjKet.trim()) {
      setAdjError('Alasan / keterangan penyesuaian stok wajib diisi untuk audit trail.');
      return;
    }

    setIsSavingAdjust(true);
    try {
      const res = await onAddManualMutation({
        medicineId: adjMedId,
        adjustType: adjType,
        qty: parsedQty,
        ket: adjKet.trim(),
        refNo: adjRefNo.trim() || undefined,
        batchNo: adjType === 'MASUK' ? adjBatchNo.trim() || undefined : undefined,
        expDate: adjType === 'MASUK' ? adjExpDate.trim() || undefined : undefined
      });

      if (!res.success && !res.isDemo) {
        if (res.needsTableSetup) {
          setShowAdjustModal(false);
          setSyncToast({
            type: 'warning',
            message: `Mutasi disimpan secara lokal, namun tabel "${stockCardTableInput}" belum dibuat di Supabase. Buka Skema SQL untuk setup.`
          });
          return;
        }
        setAdjError(res.error || 'Gagal menyimpan penyesuaian stok.');
        return;
      }

      setShowAdjustModal(false);
      if (isAllMode === false) {
        setSelectedMedId(adjMedId);
      }
      setSyncToast({
        type: 'success',
        message: res.isDemo
          ? 'Penyesuaian stok dicatat pada Mode Demo Sandbox (terisolasi lokal, tidak dikirim ke Supabase produksi).'
          : 'Penyesuaian stok dicatat & berhasil disinkronkan 2-arah ke tabel Kartu Stok Supabase!'
      });
    } finally {
      setIsSavingAdjust(false);
    }
  };

  const handleConfirmDeleteSelected = async () => {
    if (selectedMutIds.length === 0 || !onDeleteMutations) return;
    setIsDeleting(true);
    try {
      const countDeleted = selectedMutIds.length;
      const res = await onDeleteMutations(selectedMutIds);
      setSelectedMutIds([]);
      setConfirmDeleteOpen(false);

      if (res && 'isDemo' in res && res.isDemo) {
        setSyncToast({
          type: 'success',
          message: `${countDeleted} catatan mutasi dihapus dari penyimpanan Mode Demo Sandbox.`
        });
      } else if (res && 'needsTableSetup' in res && res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: `${countDeleted} mutasi dihapus lokal. Tabel "${stockCardTableInput}" belum aktif di Supabase.`
        });
      } else if (res && 'error' in res && res.error) {
        setSyncToast({
          type: 'error',
          message: `Dihapus lokal, namun sinkronisasi hapus ke Supabase gagal: ${res.error}`
        });
      } else {
        setSyncToast({
          type: 'success',
          message: `${countDeleted} catatan mutasi kartu stok dihapus & disinkronkan dengan Supabase.`
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePrint = () => {
    if (medicines.length === 0 && filteredMutations.length === 0) {
      setSyncToast({
        type: 'warning',
        message: 'Belum ada data obat atau mutasi stok untuk dicetak.'
      });
      return;
    }
    const printMode = activeSubView === 'kartu-stok' ? 'kartu-stok' : 'mutasi-stok';
    openPrintWindow(printMode, {
      medId: isAllMode ? 'ALL' : resolvedMedId || 'ALL',
      startDate,
      endDate,
      typeFilter,
      searchQuery
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Header, Sub-View Switcher & Supabase Sync Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`p-2 rounded-xl ${activeSubView === 'mutasi' ? 'bg-sky-50 text-sky-600' : 'bg-indigo-50 text-indigo-600'}`}>
                {activeSubView === 'mutasi' ? (
                  <ClipboardList className="w-5 h-5" />
                ) : (
                  <FileSpreadsheet className="w-5 h-5" />
                )}
              </span>
              <h1 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
                {activeSubView === 'mutasi' ? 'Mutasi Stok' : 'Kartu Stok Digital'}
              </h1>
              {isDemoSandbox ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                  <Database className="w-3 h-3" />
                  Mode Demo Sandbox
                </span>
              ) : needsTableSetup ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold">
                  <AlertCircle className="w-3 h-3" />
                  Tabel Supabase Perlu Setup
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  Supabase Live: {stockCardTableInput}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {activeSubView === 'mutasi'
                ? 'Audit pergerakan dan mutasi keluar-masuk stok obat (Pembelian PBF, Penjualan POS/Faktur, Retur, Stok Opname, dan Penyesuaian Manual) tersinkron 2-arah ke Supabase.'
                : 'Kartu pencatatan stok produk lengkap dengan nomor Batch & Expired Date (ED) secara real-time sesuai transaksi POS, Faktur Penjualan, Pembelian PBF, dan Stok Opname.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onSyncSupabase && (
              <button
                type="button"
                onClick={handleRunSupabaseSync}
                disabled={isSyncing}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
              </button>
            )}

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setShowSchemaModal(true)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Skema SQL</span>
              </button>
            )}

            {onAddManualMutation && (
              <button
                type="button"
                onClick={openAdjustModal}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Penyesuaian Stok</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className={`px-4 py-2.5 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                activeSubView === 'mutasi'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>{activeSubView === 'mutasi' ? 'Cetak Mutasi Stok' : 'Cetak Kartu'}</span>
            </button>
          </div>
        </div>

        {/* Dedicated Sub-View Switcher: Mutasi Stok vs Kartu Stok Digital */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveSubView('mutasi')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer border ${
              activeSubView === 'mutasi'
                ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Mutasi Stok</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('kartu-stok')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer border ${
              activeSubView === 'kartu-stok'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Kartu Stok Digital</span>
          </button>
        </div>
      </div>

      {/* Demo Mode Isolation Notice */}
      {isDemoSandbox && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950 no-print">
          <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Isolasi Mode Demo / Sandbox Aktif</p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Seluruh catatan mutasi Kartu Stok Digital pada sesi ini disimpan secara lokal di sandbox demo dan tidak pernah membaca atau menulis ke database Supabase produksi.
            </p>
          </div>
        </div>
      )}

      {/* Table Setup / Batch Column Migration Warning (APJ / Owner Only) */}
      {isSuperAdmin && needsTableSetup && !isDemoSandbox && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 no-print">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Tabel Supabase &ldquo;{stockCardTableInput}&rdquo; belum dibuat:
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Salin dan jalankan skrip SQL di Dashboard Supabase agar seluruh mutasi Mutasi &amp; Kartu Stok Digital tersinkronisasi 2-arah secara real-time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSchemaModal(true)}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shrink-0 cursor-pointer"
          >
            Buka Skema SQL Setup
          </button>
        </div>
      )}

      {isSuperAdmin && !needsTableSetup && needsBatchColumnMigration && !isDemoSandbox && (
        <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-sky-950 no-print">
          <div className="flex items-start gap-2.5">
            <Database className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Pembaruan Kolom Batch &amp; ED Tersedia untuk Tabel &ldquo;{stockCardTableInput}&rdquo;:
              </p>
              <p className="text-[11px] text-sky-800 mt-0.5">
                Tabel lama Anda belum memiliki kolom <code className="font-mono font-bold">batch_no</code>, <code className="font-mono font-bold">exp_date</code>, dan <code className="font-mono font-bold">batch_details</code>. Data tetap tersimpan aman, namun jalankan skrip <span className="font-bold">ALTER TABLE</span> pada Skema SQL agar rincian Batch &amp; ED ikut tersimpan di Supabase.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSchemaModal(true)}
            className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold text-xs shrink-0 cursor-pointer"
          >
            Jalankan Update SQL
          </button>
        </div>
      )}

      {/* Dismissible Sync Toast */}
      {syncToast && (
        <div
          className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 no-print ${
            syncToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : syncToast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{syncToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 shrink-0 cursor-pointer"
            aria-label="Tutup notifikasi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="lg:col-span-2 relative" ref={medComboboxRef}>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Pilih Obat / Tampilan Ledger (Pencarian Otomatis)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={medInputRef}
                type="text"
                value={
                  isMedDropdownOpen
                    ? medSearchTerm
                    : searchQuery
                    ? searchQuery
                    : isAllMode
                    ? 'Semua Obat (Audit Ledger Global)'
                    : selectedMed
                    ? `${selectedMed.name} (${selectedMed.stock} ${selectedMed.unit})`
                    : ''
                }
                onFocus={() => {
                  setIsMedDropdownOpen(true);
                  setMedSearchTerm(searchQuery);
                  setHighlightedMedIdx(0);
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setMedSearchTerm(val);
                  setSearchQuery(val);
                  setIsMedDropdownOpen(true);
                  setHighlightedMedIdx(0);
                  // When typing a search query, automatically switch to ALL mode if a specific medicine was locked
                  // so live search matches any medicine, refNo, keterangan, or petugas immediately
                  if (val.trim() && !isAllMode) {
                    const currentMatches =
                      selectedMed &&
                      `${selectedMed.name} ${selectedMed.id} ${selectedMed.batchNo || ''}`
                        .toLowerCase()
                        .includes(val.trim().toLowerCase());
                    if (!currentMatches) {
                      setSelectedMedId('ALL');
                    }
                  }
                }}
                onKeyDown={(e) => {
                  const totalOptions = 1 + filteredMedicinesForPicker.length;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setIsMedDropdownOpen(true);
                    setHighlightedMedIdx((prev) => (prev + 1) % Math.max(1, totalOptions));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setIsMedDropdownOpen(true);
                    setHighlightedMedIdx((prev) =>
                      prev - 1 < 0 ? Math.max(0, totalOptions - 1) : prev - 1
                    );
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!isMedDropdownOpen) {
                      setIsMedDropdownOpen(true);
                      return;
                    }
                    if (highlightedMedIdx === 0 && !medSearchTerm.trim()) {
                      setSelectedMedId('ALL');
                      setMedSearchTerm('');
                      setSearchQuery('');
                      setIsMedDropdownOpen(false);
                      medInputRef.current?.blur();
                    } else {
                      const medIdx = medSearchTerm.trim()
                        ? highlightedMedIdx
                        : highlightedMedIdx - 1;
                      const picked = filteredMedicinesForPicker[medIdx];
                      if (picked) {
                        setSelectedMedId(picked.id);
                        setMedSearchTerm('');
                        setSearchQuery('');
                        setIsMedDropdownOpen(false);
                        medInputRef.current?.blur();
                      } else {
                        setIsMedDropdownOpen(false);
                        medInputRef.current?.blur();
                      }
                    }
                  } else if (e.key === 'Escape') {
                    setIsMedDropdownOpen(false);
                    medInputRef.current?.blur();
                  }
                }}
                placeholder="Ketik nama obat, kode, No. Referensi, batch, keterangan, atau petugas..."
                className="w-full pl-9 pr-20 py-2.5 border border-slate-200 rounded-xl bg-white font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-sky-500 transition"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStockCardScanner(true);
                  }}
                  title="Scan Barcode Kartu Stok dengan Kamera"
                  className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 cursor-pointer"
                  aria-label="Scan barcode kartu stok"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                {(medSearchTerm || searchQuery || !isAllMode) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMedSearchTerm('');
                      setSearchQuery('');
                      setSelectedMedId('ALL');
                      setIsMedDropdownOpen(true);
                      medInputRef.current?.focus();
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                    title="Reset ke Semua Obat / Hapus Pencarian"
                    aria-label="Hapus pencarian obat"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isMedDropdownOpen) {
                      setIsMedDropdownOpen(false);
                    } else {
                      setIsMedDropdownOpen(true);
                      medInputRef.current?.focus();
                    }
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Buka daftar obat"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      isMedDropdownOpen ? 'rotate-180 text-sky-600' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {isMedDropdownOpen && (
              <div className="absolute z-40 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto divide-y divide-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMedId('ALL');
                    setMedSearchTerm('');
                    setSearchQuery('');
                    setIsMedDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                    isAllMode && !searchQuery
                      ? 'bg-sky-50 text-sky-900 font-black'
                      : 'hover:bg-slate-50 text-slate-700 font-bold'
                  }`}
                >
                  <div>
                    <div className="font-bold">Semua Obat (Audit Ledger Global)</div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      Tampilkan seluruh riwayat mutasi kartu stok lintas item ({medicines.length} obat)
                    </div>
                  </div>
                  {isAllMode && !searchQuery && (
                    <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-bold">
                      Aktif
                    </span>
                  )}
                </button>

                {filteredMedicinesForPicker.length > 0 ? (
                  filteredMedicinesForPicker.map((m, idx) => {
                    const isSelected = !isAllMode && resolvedMedId === m.id;
                    const isHighlighted =
                      (medSearchTerm.trim() ? idx : idx + 1) === highlightedMedIdx;
                    return (
                      <button
                        key={`${m.id}-${idx}`}
                        type="button"
                        onClick={() => {
                          setSelectedMedId(m.id);
                          setMedSearchTerm('');
                          setSearchQuery('');
                          setIsMedDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                          isSelected
                            ? 'bg-sky-50 text-sky-900 font-black'
                            : isHighlighted
                            ? 'bg-slate-100 text-slate-900'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold truncate text-slate-800">{m.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="font-mono">{m.id}</span>
                            {m.batchNo && <span>• Batch: {m.batchNo}</span>}
                            {m.rack && <span>• Rak: {m.rack}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-lg font-mono font-bold text-[11px] ${
                              m.stock <= m.minStock
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {m.stock} {m.unit}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-4 py-3 text-xs text-slate-500">
                    <p className="font-bold text-slate-700">
                      Obat "{medSearchTerm}" tidak ditemukan di daftar nama obat.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tabel di bawah tetap memfilter otomatis No. Referensi, keterangan, atau petugas
                      dengan kata kunci <span className="font-mono font-bold">"{medSearchTerm}"</span>.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Jenis Mutasi
            </label>
            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full pl-8 pr-2 py-2.5 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500"
              >
                {MUTATION_TYPE_LABELS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Dari Tanggal
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-700"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-700"
            />
          </div>
        </div>

        {(startDate ||
          endDate ||
          typeFilter !== 'SEMUA' ||
          searchQuery ||
          !isAllMode ||
          (isSuperAdmin && onDeleteMutations && selectedMutIds.length > 0)) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              {!isAllMode && selectedMed && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 font-bold">
                  <span>Obat: {selectedMed.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedMedId('ALL')}
                    className="hover:text-sky-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {searchQuery && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold">
                  <span>Kata Kunci: "{searchQuery}"</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setMedSearchTerm('');
                    }}
                    className="hover:text-indigo-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(startDate || endDate || typeFilter !== 'SEMUA' || searchQuery || !isAllMode) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setTypeFilter('SEMUA');
                    setSearchQuery('');
                    setMedSearchTerm('');
                    setSelectedMedId('ALL');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition cursor-pointer"
                >
                  Reset Filter
                </button>
              )}

              {isSuperAdmin && onDeleteMutations && selectedMutIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Terpilih ({selectedMutIds.length})</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print text-xs">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Total Mutasi Masuk
          </span>
          <div className="font-mono font-black text-xl text-emerald-600 mt-1 flex items-center gap-1">
            <ArrowDownRight className="w-5 h-5" /> +{totalIn.toLocaleString('id-ID')}{' '}
            {isAllMode ? 'Unit' : selectedMed?.unit}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Total Mutasi Keluar
          </span>
          <div className="font-mono font-black text-xl text-rose-600 mt-1 flex items-center gap-1">
            <ArrowUpRight className="w-5 h-5" /> -{totalOut.toLocaleString('id-ID')}{' '}
            {isAllMode ? 'Unit' : selectedMed?.unit}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {isAllMode ? 'Total Rekaman Audit Terfilter' : 'Saldo Fisik Saat Ini'}
          </span>
          <div className="font-mono font-black text-xl text-sky-800 mt-1">
            {isAllMode
              ? `${filteredMutations.length} Mutasi`
              : `${selectedMed?.stock ?? 0} ${selectedMed?.unit ?? ''}`}
          </div>
        </div>
      </div>

      {/* Printable Document Container */}
      <div
        id="printable-section"
        className="bg-white p-4 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4 text-xs text-slate-800"
      >
        <div className="border-b-2 border-slate-900 pb-3">
          <div className="flex items-center justify-between gap-4">
            {pharmacyProfile.logoUrl ? (
              <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                <img
                  src={pharmacyProfile.logoUrl}
                  alt="Logo Faskes"
                  className="w-14 h-14 object-contain"
                />
              </div>
            ) : (
              <div className="w-14 shrink-0" />
            )}
            <div className="flex-1 text-center">
              <h2 className="font-black text-base text-slate-900 uppercase">
                {pharmacyProfile.name}
              </h2>
              <p className="text-[11px] text-slate-600 font-medium">
                {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
              </p>
              <p className="text-[10px] text-slate-600 font-mono">
                {[
                  pharmacyProfile.sia ? `SIA: ${pharmacyProfile.sia}` : '',
                  pharmacyProfile.nib ? `NIB: ${pharmacyProfile.nib}` : '',
                  pharmacyProfile.npwp ? `NPWP: ${pharmacyProfile.npwp}` : ''
                ].filter(Boolean).join(' · ')}
              </p>
              <h3 className="font-black text-xs text-slate-900 uppercase tracking-wide mt-1.5">
                {activeSubView === 'mutasi'
                  ? 'LAPORAN MUTASI STOK FARMASI'
                  : 'KARTU STOK DIGITAL FARMASI (BATCH & EXPIRY DATE FEFO)'}
              </h3>
              {isAllMode ? (
                <p className="text-[10px] text-slate-500 font-semibold mt-1">
                  Cakupan: <strong className="text-slate-900">Semua Produk ({medicines.length} Item Terdaftar)</strong> · Total Catatan Ditampilkan:{' '}
                  <strong className="text-slate-900">{filteredMutations.length}</strong>
                  {(startDate || endDate) && (
                    <span>
                      {' '}
                      · Periode: <strong className="text-slate-900">{startDate || '...'} s/d {endDate || '...'}</strong>
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 font-semibold mt-1">
                  Nama Produk: <strong className="text-slate-900">{selectedMed?.name}</strong> · Batch Utama:{' '}
                  <strong className="text-slate-900">{selectedMed?.batchNo || '-'}</strong> · Exp Date:{' '}
                  <strong className="text-slate-900">{selectedMed?.expDate || '-'}</strong> · Lokasi:{' '}
                  <strong className="text-slate-900">{selectedMed?.rack || '-'}</strong>
                </p>
              )}
            </div>
            <div className="w-14 shrink-0" />
          </div>
        </div>

        <div className="overflow-x-auto w-full custom-scrollbar">
          {activeSubView === 'mutasi' ? (
            <table className="w-full min-w-[740px] text-left text-xs border border-collapse">
              <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-700">
                <tr>
                  {isSuperAdmin && onDeleteMutations && (
                    <th className="p-2 border text-center w-9 no-print">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Pilih semua baris mutasi"
                        className="rounded cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="p-2 border">Tanggal &amp; Jam</th>
                  <th className="p-2 border">No. Referensi</th>
                  {isAllMode && <th className="p-2 border">Nama Obat</th>}
                  <th className="p-2 border">Jenis Mutasi</th>
                  <th className="p-2 border text-center w-20">Masuk</th>
                  <th className="p-2 border text-center w-20">Keluar</th>
                  <th className="p-2 border text-center w-24">Saldo Akhir</th>
                  <th className="p-2 border">Keterangan</th>
                  <th className="p-2 border">Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y font-medium text-slate-700">
                {paginatedMutations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        8 + (isAllMode ? 1 : 0) + (isSuperAdmin && onDeleteMutations ? 1 : 0)
                      }
                      className="p-6 text-center text-slate-400 italic"
                    >
                      Belum ada catatan mutasi pergerakan stok untuk filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  paginatedMutations.map((m) => (
                    <tr key={m.id} className="border-b hover:bg-slate-50">
                      {isSuperAdmin && onDeleteMutations && (
                        <td className="p-2 border text-center no-print">
                          <input
                            type="checkbox"
                            checked={selectedMutIds.includes(m.id)}
                            onChange={() => handleToggleSelectOne(m.id)}
                            aria-label={`Pilih mutasi ${m.refNo}`}
                            className="rounded cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="p-2 border font-mono whitespace-nowrap">
                        <div>{m.date}</div>
                        {m.time && (
                          <div className="text-[10px] text-slate-400">{m.time}</div>
                        )}
                      </td>
                      <td className="p-2 border font-mono font-bold text-sky-700 whitespace-nowrap">
                        {m.refNo}
                      </td>
                      {isAllMode && (
                        <td className="p-2 border font-bold text-slate-800">
                          {m.medicineName}
                        </td>
                      )}
                      <td className="p-2 border whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md border font-bold text-[10px] uppercase ${getMutationBadgeClass(
                            m.type
                          )}`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td className="p-2 border text-center font-mono font-bold text-emerald-600">
                        {m.inQty > 0 ? `+${m.inQty}` : '-'}
                      </td>
                      <td className="p-2 border text-center font-mono font-bold text-rose-600">
                        {m.outQty > 0 ? `-${m.outQty}` : '-'}
                      </td>
                      <td className="p-2 border text-center font-mono font-black text-slate-900 bg-slate-50">
                        {m.balance}
                      </td>
                      <td className="p-2 border text-slate-600 text-[11px]">{m.ket}</td>
                      <td className="p-2 border text-slate-500 font-mono text-[10px] whitespace-nowrap">
                        {m.petugas}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[740px] text-left text-xs border border-collapse">
              <thead className="bg-indigo-50/80 font-bold uppercase text-[10px] text-slate-700">
                <tr>
                  <th className="p-2.5 border">Tanggal &amp; Jam</th>
                  <th className="p-2.5 border">Nama Produk (Lengkap Batch &amp; ED)</th>
                  <th className="p-2.5 border text-center w-24">Masuk</th>
                  <th className="p-2.5 border text-center w-24">Keluar</th>
                  <th className="p-2.5 border text-center w-28">Stok Akhir</th>
                  <th className="p-2.5 border">Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y font-medium text-slate-700">
                {paginatedMutations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                      Belum ada rekaman Kartu Stok Digital untuk filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  paginatedMutations.map((m) => {
                    const med = medicineById.get(m.medicineId);
                    const batchInfo = resolvedBatchByMutId.get(m.id);
                    const details = batchInfo?.details || [];
                    const trxSourceLabel = getTransactionTypeShortLabel(m.type, m.ket);
                    const unitLabel = med?.satuanKecil || med?.unit || '';
                    return (
                      <tr key={m.id} className="border-b hover:bg-slate-50/80 align-top">
                        <td className="p-2.5 border font-mono whitespace-nowrap">
                          <div className="font-bold text-slate-800">{m.date}</div>
                          {m.time && (
                            <div className="text-[10px] text-slate-400">{m.time}</div>
                          )}
                        </td>
                        <td className="p-2.5 border">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-extrabold text-slate-900">
                              {m.medicineName || med?.name || '-'}
                            </span>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded border font-bold text-[9px] uppercase ${getMutationBadgeClass(
                                m.type
                              )}`}
                            >
                              {trxSourceLabel}
                            </span>
                            {m.refNo && m.refNo !== '-' && (
                              <span className="font-mono text-[10px] font-bold text-sky-700">
                                #{m.refNo}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {details.map((bd, idx) => (
                              <span
                                key={`${m.id}-bd-${idx}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700"
                              >
                                <span className="font-bold text-slate-900">
                                  Batch: {bd.batchNo || '-'}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="font-semibold text-indigo-700">
                                  ED: {bd.expDate || '-'}
                                </span>
                                {details.length > 1 && bd.qty > 0 && (
                                  <span className="text-slate-500 font-bold">
                                    ({bd.qty} {unitLabel})
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-2.5 border text-center font-mono font-bold text-emerald-600 whitespace-nowrap">
                          {m.inQty > 0 ? `+${m.inQty}${unitLabel ? ` ${unitLabel}` : ''}` : '-'}
                        </td>
                        <td className="p-2.5 border text-center font-mono font-bold text-rose-600 whitespace-nowrap">
                          {m.outQty > 0 ? `-${m.outQty}${unitLabel ? ` ${unitLabel}` : ''}` : '-'}
                        </td>
                        <td className="p-2.5 border text-center font-mono font-black text-slate-900 bg-slate-50 whitespace-nowrap">
                          {m.balance}{unitLabel ? ` ${unitLabel}` : ''}
                        </td>
                        <td className="p-2.5 border text-slate-600 font-mono text-[10px] whitespace-nowrap">
                          {m.petugas || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
        <div className="no-print border border-t-0 border-slate-200 rounded-b-xl overflow-hidden">
          <PaginationControls
            currentPage={safePage}
            totalPages={totalPages}
            totalCount={filteredMutations.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            itemLabel="mutasi stok"
          />
        </div>

        <div className="grid grid-cols-2 pt-6 text-xs">
          <div />
          <div className="text-center space-y-12">
            <p className="font-semibold text-slate-700">
              {pharmacyProfile.city}, {new Date().toLocaleDateString('id-ID')}
              <br />
              Apoteker Penanggung Jawab (APJ),
            </p>
            <div>
              <p className="font-extrabold underline text-slate-900">{apjProfile.name}</p>
              <p className="text-[10px] text-slate-600 font-mono">SIPA: {apjProfile.sipa}</p>
              <p className="text-[10px] text-slate-500 font-mono">STRA: {apjProfile.stra}</p>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: Penyesuaian Stok Manual (MASUK / KELUAR) */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900">
                  Penyesuaian Stok Manual (Kartu Stok)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Catat koreksi stok masuk/keluar &amp; sinkronkan otomatis ke saldo obat FEFO.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAdjustment} className="p-5 space-y-4 text-xs">
              {adjError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{adjError}</span>
                </div>
              )}

              <div className="relative" ref={adjMedComboboxRef}>
                <label className="block font-bold text-slate-700 mb-1">
                  Pilih Obat (Ketik untuk Cari Otomatis)
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={
                      isAdjMedDropdownOpen
                        ? adjMedSearchTerm
                        : (() => {
                            const m = medicines.find((item) => item.id === adjMedId);
                            return m ? `${m.name} (Saldo: ${m.stock} ${m.unit})` : '';
                          })()
                    }
                    onFocus={() => {
                      setIsAdjMedDropdownOpen(true);
                      setAdjMedSearchTerm('');
                    }}
                    onChange={(e) => {
                      setAdjMedSearchTerm(e.target.value);
                      setIsAdjMedDropdownOpen(true);
                    }}
                    placeholder="Ketik nama obat, kode, atau nomor batch..."
                    className="w-full pl-8 pr-8 py-2.5 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsAdjMedDropdownOpen((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        isAdjMedDropdownOpen ? 'rotate-180 text-sky-600' : ''
                      }`}
                    />
                  </button>
                </div>

                {isAdjMedDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {filteredAdjMedicinesForPicker.length > 0 ? (
                      filteredAdjMedicinesForPicker.map((m, idx) => (
                        <button
                          key={`${m.id}-${idx}`}
                          type="button"
                          onClick={() => handleAdjMedChange(m.id)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                            adjMedId === m.id
                              ? 'bg-sky-50 text-sky-900 font-black'
                              : 'hover:bg-slate-50 text-slate-700 font-semibold'
                          }`}
                        >
                          <div className="truncate">
                            <div className="font-bold truncate">{m.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {m.id} {m.batchNo ? `• Batch: ${m.batchNo}` : ''}
                            </div>
                          </div>
                          <span className="font-mono font-bold text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md shrink-0">
                            {m.stock} {m.unit}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2.5 text-slate-400 text-center">
                        Tidak ada obat yang cocok dengan "{adjMedSearchTerm}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Arah Mutasi</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAdjType('MASUK')}
                      className={`py-2 rounded-lg font-bold transition cursor-pointer ${
                        adjType === 'MASUK'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      + Masuk
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjType('KELUAR')}
                      className={`py-2 rounded-lg font-bold transition cursor-pointer ${
                        adjType === 'KELUAR'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      - Keluar
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Jumlah ({medicines.find((m) => m.id === adjMedId)?.unit || 'Unit'})
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={adjQty}
                    onChange={(e) => setAdjQty(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  No. Referensi (Opsional)
                </label>
                <input
                  type="text"
                  value={adjRefNo}
                  onChange={(e) => setAdjRefNo(e.target.value)}
                  placeholder="Otomatis ADJ-... jika dikosongkan"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {adjType === 'MASUK' && (
                <div className="grid grid-cols-2 gap-3 bg-emerald-50/60 p-3 rounded-2xl border border-emerald-100">
                  <div>
                    <label className="block font-bold text-emerald-900 mb-1">No. Batch</label>
                    <input
                      type="text"
                      value={adjBatchNo}
                      onChange={(e) => setAdjBatchNo(e.target.value)}
                      className="w-full p-2 border border-emerald-200 rounded-xl bg-white font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-emerald-900 mb-1">Exp Date</label>
                    <input
                      type="date"
                      value={adjExpDate}
                      onChange={(e) => setAdjExpDate(e.target.value)}
                      className="w-full p-2 border border-emerald-200 rounded-xl bg-white font-mono text-slate-800"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Keterangan / Alasan Audit *
                </label>
                <textarea
                  rows={2}
                  value={adjKet}
                  onChange={(e) => setAdjKet(e.target.value)}
                  placeholder="Contoh: Koreksi selisih fisik rak / barang rusak / bonus supplier..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingAdjust}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  {isSavingAdjust ? 'Menyimpan...' : 'Simpan Mutasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Konfirmasi Hapus Terpilih */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">
                  Hapus Catatan Mutasi Terpilih
                </h3>
                <p className="text-xs text-slate-500">
                  Khusus otorisasi APJ / Owner
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Apakah Anda yakin ingin menghapus{' '}
              <strong className="text-rose-700">{selectedMutIds.length}</strong> baris log mutasi
              kartu stok terpilih?{' '}
              {isDemoSandbox
                ? 'Penghapusan hanya berlaku di penyimpanan lokal Mode Demo Sandbox.'
                : 'Penghapusan juga akan disinkronkan ke tabel Supabase kartu_stok (saldo stok master obat tidak berubah).'}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteSelected}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-extrabold rounded-xl text-xs shadow-md cursor-pointer"
              >
                {isDeleting ? 'Menghapus...' : `Hapus ${selectedMutIds.length} Mutasi`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Skema SQL Supabase Kartu Stok Digital (APJ / Owner Only) */}
      {isSuperAdmin && showSchemaModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-600" />
                  Skema SQL Supabase — Mutasi &amp; Kartu Stok Digital
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tabel <strong className="font-mono">{stockCardTableInput}</strong> untuk sinkronisasi log mutasi stok &amp; rincian Batch/ED (Pembelian, Penjualan POS/Faktur, Retur, Stok Opname, Penyesuaian) secara 2-arah &amp; real-time. Skrip sudah aman dijalankan ulang pada tabel yang sudah ada (<code className="font-mono">ADD COLUMN IF NOT EXISTS</code>).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSchemaModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <form
                onSubmit={handleSaveTableName}
                className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end bg-slate-50 p-3 rounded-2xl border border-slate-200"
              >
                <div className="flex-1">
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Tabel Kartu Stok di Supabase
                  </label>
                  <input
                    type="text"
                    value={stockCardTableInput}
                    onChange={(e) => setStockCardTableInput(e.target.value)}
                    disabled={isDemoSandbox}
                    className="w-full p-2 border rounded-xl font-mono font-bold bg-white disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isDemoSandbox || isSyncing}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer"
                >
                  Simpan &amp; Tes Koneksi
                </button>
              </form>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">
                    Salin &amp; jalankan pada Supabase Dashboard &rarr; SQL Editor:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySchema}
                    className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedSchema ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedSchema ? 'SQL Tersalin!' : 'Salin SQL'}</span>
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-80 leading-relaxed">
                  {SUPABASE_STOCK_CARD_SQL_SCHEMA}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      <CameraBarcodeScannerModal
        isOpen={showStockCardScanner}
        onClose={() => setShowStockCardScanner(false)}
        title="Scan Barcode Kartu Stok Digital"
        subtitle="Arahkan kamera ke barcode kemasan obat untuk langsung melihat riwayat mutasi dan saldo batch."
        scanMode="barcode"
        onScanSuccess={(decoded) => {
          const lower = decoded.trim().toLowerCase();
          const matched = medicines.find(
            (m) =>
              (m.barcode && m.barcode.trim().toLowerCase() === lower) ||
              m.id.trim().toLowerCase() === lower
          );
          if (matched) {
            playBarcodeBeep();
            setSelectedMedId(matched.id);
            setMedSearchTerm('');
            setSearchQuery('');
            setIsMedDropdownOpen(false);
          } else {
            setMedSearchTerm(decoded);
            setSearchQuery(decoded);
            setIsMedDropdownOpen(true);
          }
        }}
      />
    </div>
  );
};
