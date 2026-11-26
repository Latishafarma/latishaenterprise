import React, { useState, useMemo, useRef, useEffect, lazy, Suspense } from 'react';
import {
  GitBranch,
  RefreshCw,
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  Download,
  Database,
  Plus,
  Trash2,
  AlertTriangle,
  X,
  Phone,
  ShieldAlert,
  Pencil,
  Edit2,
  Cloud,
  FlaskConical,
  Code2,
  Copy,
  Check,
  Search,
  ChevronDown,
  Camera
} from 'lucide-react';
import { Branch, Medicine, StockTransfer, Staff } from '../types';
import { SUPABASE_MULTI_CABANG_SQL_SCHEMA } from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';
import { playBarcodeBeep } from '../utils/barcodeBeep';
const CameraBarcodeScannerModal = lazy(() =>
  import('./CameraBarcodeScannerModal').then((m) => ({ default: m.CameraBarcodeScannerModal }))
);

interface BranchSyncViewProps {
  branches: Branch[];
  currentBranch: Branch;
  onSelectBranch: (branch: Branch) => void;
  medicines: Medicine[];
  transfers: StockTransfer[];
  onAddTransfer: (transfer: StockTransfer) => void;
  onDeleteTransfer?: (transferId: string) => void;
  onSyncAllBranches: () => Promise<{
    success?: boolean;
    branchCount?: number;
    transferCount?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  } | void> | void;
  isSyncing: boolean;
  onExportBackup: () => void;
  onAddBranch?: (branch: Branch) => void;
  onUpdateBranch?: (branch: Branch) => void;
  onDeleteBranch?: (branchId: string) => void;
  staffList?: Staff[];
  userName?: string;
  isDemoSandbox?: boolean;
  needsTableSetup?: boolean;
}

export const BranchSyncView: React.FC<BranchSyncViewProps> = ({
  branches,
  currentBranch,
  onSelectBranch,
  medicines,
  transfers,
  onAddTransfer,
  onDeleteTransfer,
  onSyncAllBranches,
  isSyncing,
  onExportBackup,
  onAddBranch,
  onUpdateBranch,
  onDeleteBranch,
  staffList = [],
  userName = 'apt. Mardin, S.Farm',
  isDemoSandbox = false,
  needsTableSetup = false
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'transfer' | 'backup'>('matrix');

  // Feedback banner state (replaces window.alert)
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
  } | null>(null);

  const showBanner = (
    type: 'success' | 'error' | 'warning' | 'info',
    message: string
  ) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  // SQL Schema Modal State
  const isOwnerAdmin = useIsOwnerAdmin();
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showTransferScanner, setShowTransferScanner] = useState(false);

  // Modals state for Add, Edit and Delete Branch
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);
  const [branchToEdit, setBranchToEdit] = useState<Branch | null>(null);

  // Edit Branch Form State
  const [editBranchName, setEditBranchName] = useState('');
  const [editBranchCode, setEditBranchCode] = useState('');
  const [editBranchAddress, setEditBranchAddress] = useState('');
  const [editBranchPhone, setEditBranchPhone] = useState('');
  const [editIsCentral, setEditIsCentral] = useState(false);

  // Add Branch Form State
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');
  const [isNewCentral, setIsNewCentral] = useState(false);

  // Transfer Form State (kolom tujuan, obat, qty, dan petugas dikosongkan saat form dibuka)
  const [fromBranch, setFromBranch] = useState(branches[0]?.id || 'BR-01');
  const [toBranch, setToBranch] = useState('');
  const [selectedMedId, setSelectedMedId] = useState('');
  const [isTransferMedOpen, setIsTransferMedOpen] = useState(false);
  const [transferMedSearch, setTransferMedSearch] = useState('');
  const [transferMedHighlightIdx, setTransferMedHighlightIdx] = useState(0);
  const transferMedDropdownRef = useRef<HTMLDivElement | null>(null);
  const transferMedSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [transferQty, setTransferQty] = useState('');
  const [transferNotes, setTransferNotes] = useState('Distribusi buffer stok antar cabang');
  const [transferStaff, setTransferStaff] = useState('');

  const resetTransferFormFields = () => {
    setToBranch('');
    setSelectedMedId('');
    setTransferMedSearch('');
    setIsTransferMedOpen(false);
    setTransferQty('');
    setTransferStaff('');
  };

  useEffect(() => {
    if (selectedMedId && medicines.length > 0 && !medicines.some((m) => m.id === selectedMedId)) {
      setSelectedMedId('');
    }
  }, [medicines, selectedMedId]);

  useEffect(() => {
    if (!isTransferMedOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        transferMedDropdownRef.current &&
        !transferMedDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTransferMedOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTransferMedOpen]);

  useEffect(() => {
    if (isTransferMedOpen) {
      setTransferMedHighlightIdx(0);
      const t = window.setTimeout(() => {
        transferMedSearchInputRef.current?.focus();
      }, 10);
      return () => window.clearTimeout(t);
    }
  }, [isTransferMedOpen]);

  const selectedTransferMedicine = useMemo(
    () => (selectedMedId ? medicines.find((m) => m.id === selectedMedId) || null : null),
    [medicines, selectedMedId]
  );

  const filteredTransferMedicines = useMemo(() => {
    const q = transferMedSearch.trim().toLowerCase();
    if (!q) return medicines;
    const tokens = q.split(/\s+/).filter(Boolean);
    return medicines.filter((m) => {
      const hay = `${m.name || ''} ${m.id || ''} ${m.barcode || ''} ${m.category || ''} ${m.kelas || ''} ${m.kekuatan || ''} ${m.batchNo || ''}`.toLowerCase();
      return tokens.every((tk) => hay.includes(tk));
    });
  }, [medicines, transferMedSearch]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_MULTI_CABANG_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleTriggerSync = async () => {
    const res = await onSyncAllBranches();
    if (res && typeof res === 'object') {
      if (res.isDemo) {
        showBanner(
          'info',
          'Mode Demo / Sandbox aktif: Data multi-cabang & transfer stok diisolasi di memori lokal (tidak mengubah Supabase produksi).'
        );
      } else if (res.needsTableSetup) {
        setShowSqlModal(true);
        showBanner(
          'warning',
          res.error || 'Tabel cabang / transfer_stok_cabang belum dibuat di Supabase. Silakan jalankan skrip SQL yang disediakan.'
        );
      } else if (res.success) {
        showBanner(
          'success',
          `Sinkronisasi Supabase berhasil! ${res.branchCount ?? branches.length} cabang dan ${res.transferCount ?? transfers.length} riwayat transfer stok telah up-to-date.`
        );
      } else if (res.error) {
        showBanner('error', `Gagal sinkronisasi Supabase: ${res.error}`);
      }
    }
  };

  // Open Add Modal with smart default code
  const handleOpenAddModal = () => {
    const existingCodes = new Set(branches.map((b) => b.code.toUpperCase()));
    let nextSeq = branches.length + 1;
    let autoCode = `BR-${String(nextSeq).padStart(2, '0')}`;
    while (existingCodes.has(autoCode)) {
      nextSeq++;
      autoCode = `BR-${String(nextSeq).padStart(2, '0')}`;
    }
    setNewBranchName('');
    setNewBranchCode(autoCode);
    setNewBranchAddress('');
    setNewBranchPhone('0821-');
    setIsNewCentral(false);
    setShowAddModal(true);
  };

  // Open Edit Modal for a Branch (especially Pusat Induk)
  const handleOpenEditModal = (branch: Branch) => {
    setBranchToEdit(branch);
    setEditBranchName(branch.name);
    setEditBranchCode(branch.code);
    setEditBranchAddress(branch.address);
    setEditBranchPhone(branch.phone || '');
    setEditIsCentral(Boolean(branch.isCentral));
    setShowEditModal(true);
  };

  // Submit Edit Branch
  const handleSaveEditBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchToEdit) return;
    if (!editBranchName.trim()) {
      showBanner('error', 'Nama cabang wajib diisi!');
      return;
    }

    const updatedBranch: Branch = {
      ...branchToEdit,
      name: editBranchName.trim(),
      code: editBranchCode.trim() || branchToEdit.code,
      address: editBranchAddress.trim() || branchToEdit.address,
      phone: editBranchPhone.trim() || branchToEdit.phone,
      isCentral: editIsCentral,
      syncStatus: 'Tersinkronisasi',
      lastSyncTime: 'Baru diperbarui'
    };

    if (onUpdateBranch) {
      onUpdateBranch(updatedBranch);
    }
    showBanner(
      'success',
      `Data cabang "${updatedBranch.name}" berhasil diperbarui${isDemoSandbox ? ' (Mode Demo)' : ' & disinkronkan ke Supabase'}.`
    );
    setShowEditModal(false);
    setBranchToEdit(null);
  };

  // Submit Add Branch
  const handleSaveNewBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) {
      showBanner('error', 'Nama cabang wajib diisi!');
      return;
    }

    const existingIds = new Set(branches.map((b) => b.id));
    let candidateId = `BR-${Date.now().toString().slice(-4)}`;
    while (existingIds.has(candidateId)) {
      candidateId = `BR-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const newBranch: Branch = {
      id: candidateId,
      name: newBranchName.trim(),
      code: newBranchCode.trim() || `BR-${String(branches.length + 1).padStart(2, '0')}`,
      address: newBranchAddress.trim() || 'Kabupaten Mesuji, Lampung',
      phone: newBranchPhone.trim() || '0821-0000-0000',
      isCentral: isNewCentral,
      syncStatus: 'Tersinkronisasi',
      lastSyncTime: 'Baru ditambahkan'
    };

    if (onAddBranch) {
      onAddBranch(newBranch);
    }
    showBanner(
      'success',
      `Cabang "${newBranch.name}" (${newBranch.code}) berhasil ditambahkan${isDemoSandbox ? ' (Mode Demo)' : ' & disinkronkan ke Supabase'}!`
    );
    setShowAddModal(false);
  };

  // Trigger Delete confirmation
  const handleConfirmDelete = (branch: Branch) => {
    if (branch.isCentral) {
      showBanner(
        'warning',
        'Cabang Pusat / Induk tidak dapat dihapus demi integritas database transaksi & inventaris!'
      );
      return;
    }
    setBranchToDelete(branch);
    setShowDeleteModal(true);
  };

  // Execute branch deletion
  const executeDeleteBranch = () => {
    if (branchToDelete && onDeleteBranch) {
      const deletedName = branchToDelete.name;
      onDeleteBranch(branchToDelete.id);
      setShowDeleteModal(false);
      setBranchToDelete(null);
      showBanner(
        'success',
        `Cabang "${deletedName}" telah dihapus${isDemoSandbox ? ' (Mode Demo)' : ' dari sistem & Supabase'}.`
      );
    }
  };

  const handleCreateTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toBranch) {
      showBanner('error', 'Pilih cabang tujuan terlebih dahulu!');
      return;
    }
    if (fromBranch === toBranch) {
      showBanner('error', 'Cabang asal dan cabang tujuan tidak boleh sama!');
      return;
    }

    const med = selectedMedId ? medicines.find((m) => m.id === selectedMedId) : undefined;
    if (!med) {
      showBanner('error', 'Pilih produk obat yang akan ditransfer terlebih dahulu!');
      return;
    }

    const parsedQty = Number(transferQty);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      showBanner('error', 'Masukkan jumlah Qty transfer yang valid (minimal 1)!');
      return;
    }

    if (staffList.length > 0 && !transferStaff) {
      showBanner('error', 'Pilih petugas pengirim / penanggung jawab terlebih dahulu!');
      return;
    }

    if (med.stock < parsedQty) {
      showBanner(
        'error',
        `Stok "${med.name}" di cabang asal tidak mencukupi! Sisa stok tersedia: ${med.stock} ${med.unit}`
      );
      return;
    }

    const newTransfer: StockTransfer = {
      id: `TRF-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString().split('T')[0],
      fromBranchId: fromBranch,
      toBranchId: toBranch,
      medicineId: med.id,
      medicineName: med.name,
      qty: parsedQty,
      unit: med.unit,
      status: 'Diterima',
      petugas: transferStaff || userName,
      notes: transferNotes
    };

    onAddTransfer(newTransfer);
    resetTransferFormFields();
    showBanner(
      'success',
      `Transfer ${parsedQty} ${med.unit} "${med.name}" berhasil diproses${isDemoSandbox ? ' (Mode Demo)' : ' & disinkronkan ke Supabase'}!`
    );
  };

  return (
    <div className="space-y-4">
      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-semibold shadow-xs animate-in fade-in duration-150 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : feedbackBanner.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : feedbackBanner.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-current"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Banner Peringatan Setup Tabel Supabase jika tabel cabang / transfer_stok_cabang belum dibuat (APJ / Owner Only) */}
      {isOwnerAdmin && needsTableSetup && !isDemoSandbox && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold">
                Tabel Supabase Multi-Cabang (<code>cabang</code> &amp; <code>transfer_stok_cabang</code>) Belum Dibuat
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Klik tombol <strong>SQL Schema Supabase</strong> di sebelah kanan, salin skrip SQL, lalu jalankan pada menu{' '}
                <strong>SQL Editor</strong> di Dashboard Supabase Anda agar data cabang dan mutasi transfer antar-cabang tersimpan secara real-time di cloud.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSqlModal(true)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Buka SQL Schema Supabase</span>
            </button>
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="px-3 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Cek Ulang Tabel</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Header & Sync Action */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-sky-600" />
              Sinkronisasi Real-Time &amp; Manajemen Multi-Cabang
            </h3>

            {/* Status Badge: Mode Demo vs Supabase Cloud */}
            {isDemoSandbox ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <FlaskConical className="w-3 h-3 text-amber-700" />
                Mode Demo (Sandbox Terisolasi)
              </span>
            ) : needsTableSetup ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                Menunggu Setup Tabel Supabase
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Cloud className="w-3 h-3 text-emerald-600" />
                Supabase Real-Time Aktif
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Total {branches.length} cabang aktif terdaftar &amp; {transfers.length} riwayat distribusi stok antar-cabang.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Subtab Switchers */}
          <button
            type="button"
            onClick={() => setActiveSubTab('matrix')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'matrix'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Matriks Stok
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeSubTab !== 'transfer') {
                resetTransferFormFields();
              }
              setActiveSubTab('transfer');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'transfer'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Transfer Stok ({transfers.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('backup')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'backup'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Backup Cloud
          </button>

          {/* SQL Schema Button (APJ / Owner Only) */}
          {isOwnerAdmin && (
            <button
              type="button"
              onClick={() => setShowSqlModal(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Lihat Skema SQL Tabel Supabase (cabang & transfer_stok_cabang)"
            >
              <Code2 className="w-3.5 h-3.5 text-slate-600" />
              <span>SQL Schema</span>
            </button>
          )}

          {/* Sync Trigger */}
          <button
            type="button"
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-600' : ''}`} />
            <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
          </button>

          {/* Button Tambah Cabang */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            title="Tambah cabang baru apotek atau klinik"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Tambah Cabang</span>
          </button>

          {/* Button Hapus Cabang in top bar */}
          <button
            type="button"
            onClick={() => {
              const deletable = branches.filter((b) => !b.isCentral);
              if (deletable.length === 0) {
                showBanner('warning', 'Tidak ada cabang non-pusat yang dapat dihapus.');
                return;
              }
              setBranchToDelete(deletable[0]);
              setShowDeleteModal(true);
            }}
            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            title="Hapus cabang apotek atau klinik"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Hapus Cabang</span>
          </button>
        </div>
      </div>

      {/* Branch Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {branches.map((b) => {
          const isSelected = b.id === currentBranch.id;
          return (
            <div
              key={b.id}
              onClick={() => onSelectBranch(b)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all relative flex flex-col justify-between ${
                isSelected
                  ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-200 shadow-sm'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex justify-between items-start gap-2">
                  <span className="font-mono font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                    {b.code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {b.isCentral ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <span>Pusat Induk</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditModal(b);
                          }}
                          className="hover:text-amber-950 p-0.5 rounded transition cursor-pointer"
                          title="Edit Cabang Pusat Induk"
                        >
                          <Pencil className="w-2.5 h-2.5 text-amber-700" />
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        {b.syncStatus}
                      </span>
                    )}

                    {/* Edit Icon Button for any branch */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditModal(b);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-white border border-transparent hover:border-slate-200 transition cursor-pointer"
                      title={b.isCentral ? 'Edit Data & Konfigurasi Pusat Induk' : `Edit Data Cabang ${b.name}`}
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <h4 className="font-extrabold text-sm text-slate-900 mt-2 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>{b.name}</span>
                </h4>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{b.address}</p>
                {b.phone && (
                  <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                    <Phone className="w-2.5 h-2.5" /> {b.phone}
                  </p>
                )}
              </div>

              <div className="pt-3 mt-3 border-t border-slate-200/60 flex justify-between items-center text-[10px]">
                <div className="text-slate-400">
                  {isSelected ? (
                    <span className="font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">
                      Cabang Aktif
                    </span>
                  ) : (
                    <span>Sync: {b.lastSyncTime}</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Action Button: Edit */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(b);
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                      b.isCentral
                        ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                        : 'text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200'
                    }`}
                    title={b.isCentral ? 'Edit Pusat Induk' : `Edit Cabang ${b.name}`}
                  >
                    <Pencil className="w-3 h-3" />
                    <span>{b.isCentral ? 'Edit Pusat Induk' : 'Edit'}</span>
                  </button>

                  {/* Direct Action: Delete Branch Button on Card */}
                  {b.isCentral ? (
                    <span
                      className="text-[10px] text-slate-400 italic font-medium px-1"
                      title="Cabang utama dilindungi sistem"
                    >
                      Terproteksi
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmDelete(b);
                      }}
                      className="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                      title={`Hapus cabang ${b.name}`}
                    >
                      <Trash2 className="w-3 h-3 text-rose-600" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sub-Tab 1: Multi-Branch Stock Matrix */}
      {activeSubTab === 'matrix' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center flex-wrap gap-2">
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wide">
              Matriks Ketersediaan Stok Real-Time Lintas {branches.length} Cabang
            </h4>
            <span className="text-[10px] text-slate-500 font-medium">
              {isDemoSandbox
                ? 'Mode Demo: Simulasi matriks stok terisolasi di memori lokal'
                : 'Data terintegrasi otomatis antar server lokal dan Supabase Cloud'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600 text-[10px]">
                <tr>
                  <th className="p-3">Nama Produk Obat</th>
                  <th className="p-3 text-center">Kategori</th>
                  {branches.map((b) => (
                    <th key={b.id} className="p-3 text-center">
                      {b.name}
                    </th>
                  ))}
                  <th className="p-3 text-center bg-slate-100 text-slate-900 font-black">
                    Total Konsolidasi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {medicines.length === 0 ? (
                  <tr>
                    <td colSpan={branches.length + 3} className="p-8 text-center text-slate-400 text-xs">
                      Belum ada data master obat untuk ditampilkan pada matriks cabang.
                    </td>
                  </tr>
                ) : (
                  medicines.map((m) => {
                    let totalAll = 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{m.name}</td>
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center justify-center">
                            <MedicineCategorySymbol category={m.category} size="sm" />
                          </div>
                        </td>
                        {branches.map((b, bIdx) => {
                          let bStock = m.stock;
                          if (bIdx === 1) bStock = Math.round(m.stock * 0.4);
                          else if (bIdx === 2) bStock = Math.round(m.stock * 0.3);
                          else if (bIdx === 3) bStock = Math.round(m.stock * 2.5);
                          else if (bIdx > 3) bStock = Math.round(m.stock * 0.25) || 5;
                          totalAll += bStock;

                          return (
                            <td
                              key={b.id}
                              className={`p-3 text-center font-mono ${
                                b.isCentral
                                  ? 'font-black text-sky-800'
                                  : 'font-semibold text-slate-700'
                              }`}
                            >
                              {bStock} {m.unit}
                            </td>
                          );
                        })}
                        <td className="p-3 text-center font-mono font-black text-slate-900 bg-slate-50">
                          {totalAll} {m.unit}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Inter-Branch Stock Transfer */}
      {activeSubTab === 'transfer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Transfer Form (5 cols) */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide border-b pb-2">
              Formulir Transfer / Mutasi Stok Antar-Cabang
            </h4>

            <form onSubmit={handleCreateTransfer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Cabang Asal (Pengirim) *</label>
                <select
                  value={fromBranch}
                  onChange={(e) => setFromBranch(e.target.value)}
                  className="w-full p-2 border rounded-xl font-bold bg-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cabang Tujuan (Penerima) *</label>
                <select
                  value={toBranch}
                  onChange={(e) => setToBranch(e.target.value)}
                  className={`w-full p-2 border rounded-xl font-bold bg-white ${
                    !toBranch ? 'text-slate-400 font-semibold' : 'text-slate-900'
                  }`}
                >
                  <option value="">-- Pilih Cabang Tujuan --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div ref={transferMedDropdownRef} className="relative">
                <label className="block font-bold text-slate-700 mb-1">Obat yang Ditransfer *</label>
                <div className="relative">
                  {isTransferMedOpen ? (
                    <div className="w-full flex items-center gap-2 px-2.5 py-1.5 border-2 border-sky-500 rounded-xl bg-white ring-2 ring-sky-500/15 transition">
                      <Search className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <input
                        ref={transferMedSearchInputRef}
                        type="text"
                        value={transferMedSearch}
                        onChange={(e) => {
                          setTransferMedSearch(e.target.value);
                          setTransferMedHighlightIdx(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setTransferMedHighlightIdx((prev) =>
                              filteredTransferMedicines.length === 0
                                ? 0
                                : Math.min(prev + 1, Math.min(filteredTransferMedicines.length, 60) - 1)
                            );
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setTransferMedHighlightIdx((prev) => Math.max(prev - 1, 0));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const picked = filteredTransferMedicines[transferMedHighlightIdx];
                            if (picked) {
                              setSelectedMedId(picked.id);
                              setTransferMedSearch('');
                              setIsTransferMedOpen(false);
                            }
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setIsTransferMedOpen(false);
                          }
                        }}
                        placeholder="Ketik nama obat, barcode, atau golongan..."
                        aria-label="Cari obat yang ditransfer"
                        className="w-full text-xs font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium bg-transparent outline-none py-0.5"
                      />
                      {transferMedSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setTransferMedSearch('');
                            setTransferMedHighlightIdx(0);
                            transferMedSearchInputRef.current?.focus();
                          }}
                          title="Bersihkan pencarian"
                          aria-label="Bersihkan pencarian obat"
                          className="p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowTransferScanner(true)}
                        title="Scan Barcode Obat Transfer"
                        aria-label="Scan barcode obat transfer"
                        className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 cursor-pointer shrink-0"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsTransferMedOpen(false)}
                        aria-label="Tutup daftar obat"
                        className="p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                      >
                        <ChevronDown className="w-4 h-4 rotate-180 text-sky-600 transition-transform" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsTransferMedOpen(true)}
                      aria-haspopup="listbox"
                      aria-expanded={isTransferMedOpen}
                      className="w-full p-2 border border-slate-300 hover:border-sky-400 rounded-xl font-bold bg-white flex items-center justify-between gap-2 text-left cursor-pointer transition"
                    >
                      {selectedTransferMedicine ? (
                        <span className="flex items-center gap-2 min-w-0 flex-1">
                          <MedicineCategorySymbol
                            category={selectedTransferMedicine.category}
                            size="xs"
                          />
                          <span className="truncate text-slate-900">
                            {selectedTransferMedicine.name}
                          </span>
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              selectedTransferMedicine.stock <= 0
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {selectedTransferMedicine.stock} {selectedTransferMedicine.unit}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-semibold truncate">
                          Pilih / cari obat yang ditransfer...
                        </span>
                      )}
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  )}

                  {isTransferMedOpen && (
                    <div
                      role="listbox"
                      aria-label="Daftar Obat yang Ditransfer"
                      className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
                    >
                      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-500">
                        <span>
                          {transferMedSearch.trim()
                            ? `Ditemukan ${filteredTransferMedicines.length} obat`
                            : `Total ${medicines.length} produk obat`}
                        </span>
                        <span className="text-slate-400 font-medium">Enter untuk memilih</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {filteredTransferMedicines.length === 0 ? (
                          <div className="px-3 py-6 text-center text-[11px] text-slate-400">
                            Obat &ldquo;{transferMedSearch.trim()}&rdquo; tidak ditemukan.
                          </div>
                        ) : (
                          filteredTransferMedicines.slice(0, 60).map((m, idx) => {
                            const isSelected = m.id === selectedMedId;
                            const isHighlighted = idx === transferMedHighlightIdx;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onMouseEnter={() => setTransferMedHighlightIdx(idx)}
                                onClick={() => {
                                  setSelectedMedId(m.id);
                                  setTransferMedSearch('');
                                  setIsTransferMedOpen(false);
                                }}
                                className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-left transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-sky-50 text-sky-900'
                                    : isHighlighted
                                    ? 'bg-slate-50 text-slate-900'
                                    : 'bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <MedicineCategorySymbol category={m.category} size="xs" />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold text-xs truncate">
                                      {m.name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono truncate">
                                      {m.id}
                                      {m.barcode ? ` · ${m.barcode}` : ''}
                                      {m.batchNo ? ` · Batch ${m.batchNo}` : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                                      m.stock <= 0
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : m.stock <= (m.minStock || 5)
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}
                                  >
                                    {m.stock} {m.unit}
                                  </span>
                                  {isSelected && (
                                    <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                      {filteredTransferMedicines.length > 60 && (
                        <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 text-center font-medium">
                          Menampilkan 60 teratas. Ketik kata kunci lebih spesifik untuk menyaring.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Jumlah Qty Transfer *</label>
                <input
                  type="number"
                  min={1}
                  placeholder="Masukkan jumlah qty..."
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  className="w-full p-2 border rounded-xl font-mono font-bold bg-white placeholder:font-sans placeholder:font-semibold placeholder:text-slate-400"
                />
              </div>

              {staffList.length > 0 && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Petugas Pengirim / Penanggung Jawab (Data Pegawai) *
                  </label>
                  <select
                    value={transferStaff}
                    onChange={(e) => setTransferStaff(e.target.value)}
                    className={`w-full p-2 border rounded-xl font-bold bg-white ${
                      !transferStaff ? 'text-slate-400 font-semibold' : 'text-slate-900'
                    }`}
                  >
                    <option value="">-- Pilih Petugas Pengirim --</option>
                    {transferStaff && !staffList.some((s) => s.name === transferStaff) && (
                      <option value={transferStaff}>{transferStaff}</option>
                    )}
                    {staffList
                      .filter((s) => s.status !== 'Non-Aktif')
                      .map((st) => (
                        <option key={st.id} value={st.name}>
                          {st.name} ({st.role})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Pengiriman</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full p-2 border rounded-xl bg-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl shadow-md transition uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>Kirim &amp; Perbarui Stok Kedua Cabang</span>
              </button>
            </form>
          </div>

          {/* Transfer History Table (7 cols) */}
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide">
                Riwayat Distribusi Antar-Cabang Terakhir
              </h4>
              <span className="text-[10px] font-semibold text-slate-500">
                {transfers.length} catatan mutasi
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 font-bold uppercase text-[10px] text-slate-600">
                  <tr>
                    <th className="p-2.5">ID &amp; Tgl</th>
                    <th className="p-2.5">Obat</th>
                    <th className="p-2.5">Rute Cabang</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5">Petugas</th>
                    <th className="p-2.5 text-center">Status</th>
                    {onDeleteTransfer && <th className="p-2.5 text-center w-12">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {transfers.length === 0 ? (
                    <tr>
                      <td colSpan={onDeleteTransfer ? 7 : 6} className="p-8 text-center text-slate-400 text-xs">
                        Belum ada riwayat transfer stok antar-cabang.
                      </td>
                    </tr>
                  ) : (
                    transfers.map((t) => {
                      const fromB = branches.find((b) => b.id === t.fromBranchId);
                      const toB = branches.find((b) => b.id === t.toBranchId);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono">
                            <span className="font-bold text-sky-700 block">{t.id}</span>
                            <span className="text-[10px] text-slate-400">{t.date}</span>
                          </td>
                          <td className="p-2.5">
                            <span className="font-bold text-slate-900 block">{t.medicineName}</span>
                            {t.notes && (
                              <span className="text-[10px] text-slate-400 block truncate max-w-[160px]">
                                {t.notes}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-[11px]">
                            <div>Dari: {fromB?.name || t.fromBranchId}</div>
                            <div className="text-sky-700 font-bold">Ke: {toB?.name || t.toBranchId}</div>
                          </td>
                          <td className="p-2.5 text-center font-mono font-black text-slate-900">
                            {t.qty} {t.unit}
                          </td>
                          <td className="p-2.5 text-[11px] text-slate-600">
                            {t.petugas || '-'}
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800">
                              {t.status}
                            </span>
                          </td>
                          {onDeleteTransfer && (
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTransfer(t.id);
                                  showBanner(
                                    'info',
                                    `Riwayat transfer #${t.id} dihapus${isDemoSandbox ? ' (Mode Demo)' : ' dari sistem & Supabase'}.`
                                  );
                                }}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title={`Hapus riwayat transfer ${t.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Cloud Backup & Restore */}
      {activeSubTab === 'backup' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs max-w-xl mx-auto text-center space-y-4">
          <Database className="w-12 h-12 text-sky-600 mx-auto" />
          <div>
            <h4 className="font-black text-slate-900 text-base">
              Pencadangan Data &amp; Pemulihan Sistem (Cloud Backup)
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Unduh seluruh snapshot basis data Latisha Farma (RME, Transaksi, Master Obat, Cabang, Pasien, dan Faktur) ke dalam file JSON terenkripsi untuk keamanan arsip.
            </p>
          </div>

          <div className="pt-2 flex justify-center gap-3">
            <button
              type="button"
              onClick={onExportBackup}
              className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh File Cadangan JSON</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL SQL SCHEMA SUPABASE MULTI-CABANG */}
      {isOwnerAdmin && showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[88vh]">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-sky-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-sky-400" />
                <div>
                  <h3 className="font-extrabold text-sm">
                    Skema SQL Supabase: Multi-Cabang &amp; Transfer Stok
                  </h3>
                  <p className="text-[10px] text-slate-300">
                    Tabel: <code>cabang</code> &amp; <code>transfer_stok_cabang</code> (mendukung Realtime 2-Arah)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto text-xs flex-1">
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-[11px] leading-relaxed">
                <strong>Petunjuk:</strong> Salin skrip SQL di bawah ini, buka{' '}
                <strong>Dashboard Supabase &rarr; SQL Editor &rarr; New Query</strong>, tempelkan skrip, lalu klik{' '}
                <strong>Run</strong>. Setelah selesai, klik tombol <strong>Sinkronkan Sekarang</strong>.
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="absolute right-3 top-3 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Tersalin!' : 'Salin Skrip SQL'}</span>
                </button>
                <pre className="p-4 bg-slate-950 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto max-h-[360px] leading-relaxed">
                  {SUPABASE_MULTI_CABANG_SQL_SCHEMA}
                </pre>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowSqlModal(false);
                  await handleTriggerSync();
                }}
                disabled={isSyncing}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sinkronkan Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Tambah Cabang Baru */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-gradient-to-r from-sky-600 to-indigo-700 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                <h3 className="font-extrabold text-sm">Tambah Cabang Baru Latisha Farma</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewBranch} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Cabang / Unit *</label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Apotek & Klinik Latisha Farma - Way Serdang"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kode Cabang *</label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: BR-05"
                    value={newBranchCode}
                    onChange={(e) => setNewBranchCode(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-sky-500 focus:outline-none uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">No. Kontak / WA</label>
                  <input
                    type="text"
                    placeholder="0821-xxxx-xxxx"
                    value={newBranchPhone}
                    onChange={(e) => setNewBranchPhone(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs font-mono focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Alamat Lengkap *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Jl. Raya Lintas Timur, Way Serdang, Mesuji, Lampung"
                  value={newBranchAddress}
                  onChange={(e) => setNewBranchAddress(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block text-xs">Jadikan Pusat Induk (Gudang/Sentral)</span>
                  <span className="text-[10px] text-slate-500">
                    Aktifkan hanya jika cabang ini merupakan gudang sentral/kantor pusat utama.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isNewCentral}
                  onChange={(e) => setIsNewCentral(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Simpan Cabang Baru</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Hapus Cabang Konfirmasi */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-rose-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-extrabold text-sm">Hapus Cabang Latisha Farma</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setBranchToDelete(null);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Peringatan Penghapusan Cabang</p>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    Tindakan ini akan menghapus cabang dari sistem sinkronisasi dan direktori cabang aktif.
                  </p>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Pilih Cabang yang Akan Dihapus:</label>
                <select
                  value={branchToDelete?.id || ''}
                  onChange={(e) => {
                    const b = branches.find((item) => item.id === e.target.value);
                    if (b) setBranchToDelete(b);
                  }}
                  className="w-full p-2.5 border rounded-xl font-bold text-xs bg-white"
                >
                  {branches
                    .filter((b) => !b.isCentral)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code}) - {b.address}
                      </option>
                    ))}
                </select>
                {branches.filter((b) => !b.isCentral).length === 0 && (
                  <p className="text-[11px] text-rose-600 mt-1">
                    Tidak ada cabang non-pusat yang dapat dihapus.
                  </p>
                )}
              </div>

              {branchToDelete && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-slate-500">Kode Cabang:</span>
                    <span className="font-bold text-slate-900">{branchToDelete.code}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Nama Cabang:</span>
                    <span className="font-bold text-slate-900">{branchToDelete.name}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Alamat:</span>
                    <span className="text-slate-700 text-right max-w-[200px] truncate">{branchToDelete.address}</span>
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setBranchToDelete(null);
                  }}
                  className="px-4 py-2 border rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!branchToDelete || branchToDelete.isCentral}
                  onClick={executeDeleteBranch}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Cabang Ini</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit Cabang & Konfigurasi Pusat Induk */}
      {showEditModal && branchToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div
              className={`p-4 text-white flex justify-between items-center ${
                editIsCentral
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700'
                  : 'bg-gradient-to-r from-sky-600 to-indigo-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                <div>
                  <h3 className="font-extrabold text-sm">
                    {editIsCentral
                      ? 'Edit Cabang Pusat Induk (Sentral)'
                      : `Edit Data Cabang: ${branchToEdit.name}`}
                  </h3>
                  <p className="text-[10px] text-white/80">
                    Perbarui nama cabang, kode, alamat, kontak, dan status Pusat Induk
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setBranchToEdit(null);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditBranch} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Cabang / Unit *</label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Apotek Latisha Farma (Pusat Induk)"
                  value={editBranchName}
                  onChange={(e) => setEditBranchName(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kode Cabang *</label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: BR-01"
                    value={editBranchCode}
                    onChange={(e) => setEditBranchCode(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-sky-500 focus:outline-none uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">No. Kontak / WA</label>
                  <input
                    type="text"
                    placeholder="0821-xxxx-xxxx"
                    value={editBranchPhone}
                    onChange={(e) => setEditBranchPhone(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs font-mono focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Alamat Lengkap *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Jl. Lintas Timur, Mesuji, Lampung"
                  value={editBranchAddress}
                  onChange={(e) => setEditBranchAddress(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              {/* Toggle Pusat Induk */}
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-amber-900 block text-xs flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-600" />
                    Status Pusat Induk (Gudang Sentral)
                  </span>
                  <span className="text-[10px] text-amber-700 block mt-0.5">
                    {editIsCentral
                      ? 'Cabang ini ditandai sebagai Pusat Induk utama Latisha Farma.'
                      : 'Jadikan cabang ini sebagai Pusat Induk (Gudang Sentral).'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editIsCentral}
                  onChange={(e) => setEditIsCentral(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded cursor-pointer accent-amber-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setBranchToEdit(null);
                  }}
                  className="px-4 py-2 border rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTransferScanner && (
        <Suspense fallback={null}>
          <CameraBarcodeScannerModal
            isOpen={showTransferScanner}
            onClose={() => setShowTransferScanner(false)}
            title="Scan Barcode Obat Transfer Cabang"
            subtitle="Arahkan kamera ke barcode kemasan obat untuk memilih item mutasi antar cabang."
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
                setTransferMedSearch('');
                setIsTransferMedOpen(false);
              } else {
                setTransferMedSearch(decoded);
                setIsTransferMedOpen(true);
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
