import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { demoGetItem, demoSetItem } from '../utils/demoSandbox';
import {
  Search,
  UserPlus,
  QrCode,
  Edit2,
  Trash2,
  AlertTriangle,
  Printer,
  X,
  Send,
  ShieldAlert,
  Database,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  Code,
  Loader2
} from 'lucide-react';
import { Patient } from '../types';
import { openPrintWindow } from '../utils/printHelper';
import { useFacilityProfiles, formatPharmacyAddress } from './PharmacySettingsModal';
import {
  getSupabaseConfig,
  setSupabaseConfig,
  fetchPatientsPaginatedFromSupabase,
  SUPABASE_PATIEN_SQL_SCHEMA,
  isSamePatientRecord,
  deduplicatePatients
} from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { PaginationControls, DEFAULT_PAGE_SIZE_OPTIONS } from './PaginationControls';

interface PatientMasterViewProps {
  patients: Patient[];
  isDemoSandbox?: boolean;
  onAddPatient: (patient: Patient) => void | Promise<any>;
  onUpdatePatient: (patient: Patient) => void | Promise<any>;
  onDeletePatient: (id: string) => void | Promise<any>;
  onSendToQueue: (patient: Patient) => void;
  onReloadFromSupabase?: () => Promise<{ success: boolean; count?: number; error?: string }>;
}

export const PatientMasterView: React.FC<PatientMasterViewProps> = ({
  patients,
  isDemoSandbox = false,
  onAddPatient,
  onUpdatePatient,
  onDeletePatient,
  onSendToQueue,
  onReloadFromSupabase
}) => {
  const { pharmacyProfile } = useFacilityProfiles();
  const pharmacyFullAddress = formatPharmacyAddress(pharmacyProfile);

  // Search & Filter states (debounced for server-side query)
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('SEMUA');

  // Pagination states (default 25 rows/page)
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = Number(demoGetItem('latisha_master_pasien_page_size'));
    return (DEFAULT_PAGE_SIZE_OPTIONS as readonly number[]).includes(saved) ? saved : 25;
  });
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Server-side query states
  const [supabaseConfig, setConfigState] = useState(getSupabaseConfig());
  const isSupabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.key);
  const [serverPatients, setServerPatients] = useState<Patient[]>([]);
  const [serverTotalCount, setServerTotalCount] = useState<number>(0);
  const [serverTotalPages, setServerTotalPages] = useState<number>(1);
  const [isServerLoading, setIsServerLoading] = useState<boolean>(false);
  const [serverNeedsTableSetup, setServerNeedsTableSetup] = useState<boolean>(false);
  const [serverRefreshTick, setServerRefreshTick] = useState<number>(0);

  const useServerPagination = isSupabaseConfigured && !isDemoSandbox && !serverNeedsTableSetup;

  // Modals & UI feedback states
  const [selectedCardPatient, setSelectedCardPatient] = useState<Patient | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editPatientId, setEditPatientId] = useState<string | null>(null);
  const [editTargetPatient, setEditTargetPatient] = useState<Patient | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);

  const isOwnerAdmin = useIsOwnerAdmin();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

  const [formData, setFormData] = useState({
    nik: '',
    name: '',
    birthDate: '',
    gender: 'Laki-laki' as 'Laki-laki' | 'Perempuan',
    phone: '',
    address: '',
    allergy: '',
    category: 'Pasien Praktik' as Patient['category'],
    bpjsNo: ''
  });

  // Debounce search input 300ms so Supabase .ilike() is not called on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset back to page 1 when search or category filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, categoryFilter]);

  const triggerServerRefresh = useCallback(() => {
    setServerRefreshTick((t) => t + 1);
  }, []);

  // Server-Side Pagination + Server-Side Search (.range() + .ilike())
  useEffect(() => {
    if (!useServerPagination) return;

    let cancelled = false;
    setIsServerLoading(true);

    fetchPatientsPaginatedFromSupabase({
      page: currentPage,
      pageSize,
      searchQuery: debouncedSearchTerm,
      categoryFilter
    })
      .then((res) => {
        if (cancelled) return;
        if (res.needsTableSetup) {
          setServerNeedsTableSetup(true);
          return;
        }
        if (res.data) {
          setServerPatients(deduplicatePatients(res.data));
          setServerTotalCount(res.totalCount);
          setServerTotalPages(res.totalPages);
        } else if (res.error) {
          setSyncStatusMsg({ text: res.error, isError: true });
        }
      })
      .finally(() => {
        if (!cancelled) setIsServerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    useServerPagination,
    currentPage,
    pageSize,
    debouncedSearchTerm,
    categoryFilter,
    serverRefreshTick
  ]);

  // Local fallback filtering & pagination when Supabase is offline or Demo Sandbox is active
  const dedupedLocalPatients = useMemo(() => {
    if (useServerPagination) return [];
    return deduplicatePatients(patients);
  }, [useServerPagination, patients]);

  const localFilteredPatients = useMemo(() => {
    if (useServerPagination) return [];
    const q = debouncedSearchTerm.toLowerCase();
    return dedupedLocalPatients.filter((p) => {
      const matchCat = categoryFilter === 'SEMUA' || p.category === categoryFilter;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.noRm || '').toLowerCase().includes(q) ||
        p.nik.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q)
      );
    });
  }, [useServerPagination, dedupedLocalPatients, debouncedSearchTerm, categoryFilter]);

  const totalCount = useServerPagination ? serverTotalCount : localFilteredPatients.length;
  const totalPages = useServerPagination
    ? serverTotalPages
    : Math.max(1, Math.ceil(localFilteredPatients.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const displayedPatients = useMemo(() => {
    if (useServerPagination) return serverPatients;
    const start = (safeCurrentPage - 1) * pageSize;
    return localFilteredPatients.slice(start, start + pageSize);
  }, [useServerPagination, serverPatients, localFilteredPatients, safeCurrentPage, pageSize]);

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    demoSetItem('latisha_master_pasien_page_size', String(nextSize));
    setCurrentPage(1);
  };

  const handleOpenAdd = () => {
    setEditPatientId(null);
    setEditTargetPatient(null);
    setFormError(null);
    setFormData({
      nik: '',
      name: '',
      birthDate: '',
      gender: 'Laki-laki',
      phone: '',
      address: '',
      allergy: '',
      category: 'Pasien Praktik',
      bpjsNo: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (p: Patient) => {
    setEditPatientId(p.dbId || p.id);
    setEditTargetPatient(p);
    setFormError(null);
    setFormData({
      nik: p.nik,
      name: p.name,
      birthDate: p.birthDate || '1990-01-01',
      gender: p.gender,
      phone: p.phone,
      address: p.address,
      allergy: p.allergy,
      category: p.category,
      bpjsNo: p.bpjsNo || '-'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!formData.name.trim() || !formData.nik.trim()) {
      setFormError('Nama lengkap dan NIK pasien wajib diisi.');
      return;
    }

    const birthYear = formData.birthDate
      ? new Date(formData.birthDate).getFullYear()
      : new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    const calculatedAge = isNaN(birthYear) ? 0 : Math.max(0, currentYear - birthYear);

    setIsSaving(true);
    setFormError(null);
    try {
      if (editPatientId !== null || editTargetPatient !== null) {
        const targetKey = editTargetPatient ? (editTargetPatient.dbId || editTargetPatient.id) : editPatientId;
        const existing =
          editTargetPatient ||
          serverPatients.find((p) => (p.dbId || p.id) === targetKey || p.id === targetKey || p.noRm === targetKey) ||
          patients.find((p) => (p.dbId || p.id) === targetKey || p.id === targetKey || p.noRm === targetKey);
        if (!existing) {
          setFormError('Data pasien yang dipilih untuk diedit tidak ditemukan.');
          return;
        }
        const updatedPatient: Patient = {
          ...existing,
          ...formData,
          id: existing.id,
          dbId: existing.dbId || existing.id,
          noRm: existing.noRm || existing.id,
          name: formData.name.trim(),
          nik: formData.nik.trim(),
          age: calculatedAge
        };
        const res = await Promise.resolve(onUpdatePatient(updatedPatient));
        if (res && typeof res === 'object' && res.success === false && res.error) {
          setFormError(`Gagal memperbarui data pasien ke Supabase: ${res.error}`);
          return;
        }
        if (useServerPagination) {
          setServerPatients((prev) =>
            deduplicatePatients(
              prev.map((item) => (isSamePatientRecord(item, updatedPatient) ? updatedPatient : item))
            )
          );
        }
        setSyncStatusMsg({ text: `Data pasien ${formData.name.trim()} berhasil diperbarui.` });
      } else {
        // Collision-safe RM ID generation even when only a single page of 25 rows is loaded in memory
        const combined = [...serverPatients, ...patients];
        const maxSeq = combined.reduce((max, p) => {
          const match = /^RM-?(\d+)$/i.exec((p.noRm || p.id).trim());
          if (match) {
            const num = parseInt(match[1], 10);
            return num > max ? num : max;
          }
          return max;
        }, Math.max(totalCount, combined.length));
        const newId = `RM-${String(maxSeq + 1).padStart(4, '0')}`;

        const newPatient: Patient = {
          id: newId,
          dbId: newId,
          noRm: newId,
          ...formData,
          name: formData.name.trim(),
          nik: formData.nik.trim(),
          age: calculatedAge,
          registrationDate: new Date().toISOString().split('T')[0]
        };
        const res = await Promise.resolve(onAddPatient(newPatient));
        if (res && typeof res === 'object' && res.success === false && res.error) {
          setFormError(`Gagal menyimpan pasien baru ke Supabase: ${res.error}`);
          return;
        }
        setSyncStatusMsg({
          text: `Pasien baru ${newPatient.name} (${newPatient.id}) berhasil didaftarkan.`
        });
      }

      setShowModal(false);
      setEditPatientId(null);
      setEditTargetPatient(null);
      if (useServerPagination) {
        triggerServerRefresh();
      }
      setTimeout(() => setSyncStatusMsg(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const targetDbId = target.dbId || target.id;
    setDeleteTarget(null);
    await Promise.resolve(onDeletePatient(targetDbId));
    setSyncStatusMsg({ text: `Data pasien ${target.name} (${target.id}) berhasil dihapus.` });
    if (useServerPagination) {
      triggerServerRefresh();
    }
    setTimeout(() => setSyncStatusMsg(null), 4000);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      if (useServerPagination) {
        const res = await fetchPatientsPaginatedFromSupabase({
          page: currentPage,
          pageSize,
          searchQuery: debouncedSearchTerm,
          categoryFilter
        });
        if (res.needsTableSetup) {
          setServerNeedsTableSetup(true);
          setSyncStatusMsg({
            text: 'Tabel pasien belum dibuat di Supabase. Buka ikon Database untuk melihat Skema SQL.',
            isError: true
          });
        } else if (res.data) {
          setServerPatients(deduplicatePatients(res.data));
          setServerTotalCount(res.totalCount);
          setServerTotalPages(res.totalPages);
          setSyncStatusMsg({
            text: `Sinkronisasi halaman ${res.page} berhasil! Total ${res.totalCount.toLocaleString('id-ID')} data pasien tersedia di Supabase.`
          });
        } else {
          setSyncStatusMsg({
            text: res.error || 'Gagal menarik data dari Supabase',
            isError: true
          });
        }
      } else if (onReloadFromSupabase) {
        const res = await onReloadFromSupabase();
        if (res.success) {
          setSyncStatusMsg({
            text: `Sinkronisasi berhasil! Memuat ${res.count ?? 0} data pasien terbaru.`
          });
        } else {
          setSyncStatusMsg({
            text: res.error || 'Gagal menarik data dari Supabase',
            isError: true
          });
        }
      }
    } catch (err: any) {
      setSyncStatusMsg({ text: err?.message || 'Koneksi ke Supabase gagal', isError: true });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setSupabaseConfig(supabaseConfig);
    setServerNeedsTableSetup(false);
    setShowConfigModal(false);
    if (supabaseConfig.url && supabaseConfig.key) {
      setCurrentPage(1);
      triggerServerRefresh();
    }
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(SUPABASE_PATIEN_SQL_SCHEMA);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Search, Filter and Action Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={
                useServerPagination
                  ? 'Cari di server (Nama / NIK / No. RM / Kontak)...'
                  : 'Cari pasien (Nama / NIK / No. RM / Telepon)...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                title="Bersihkan pencarian"
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            aria-label="Filter kategori pasien"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
          >
            <option value="SEMUA">Semua Kategori</option>
            <option value="Pasien Praktik">Pasien Praktik</option>
            <option value="Pasien Umum">Pasien Umum</option>
            <option value="Mitra Perusahaan">Mitra Perusahaan</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Supabase Pagination & Realtime Status */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <span
              className={`inline-flex rounded-full h-2.5 w-2.5 ${
                useServerPagination
                  ? 'bg-emerald-500'
                  : isSupabaseConfigured
                  ? 'bg-amber-400'
                  : 'bg-slate-300'
              }`}
            ></span>
            <span className="text-[11px] font-bold text-slate-700">
              {useServerPagination
                ? 'Supabase Server-Side'
                : isDemoSandbox
                ? 'Mode Demo Sandbox'
                : 'Supabase Offline'}
            </span>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing || (!isSupabaseConfigured && !onReloadFromSupabase)}
              title="Muat ulang halaman aktif dari Supabase"
              className={`ml-1 p-1 rounded-md text-slate-600 hover:text-sky-600 hover:bg-white transition ${
                isSyncing ? 'animate-spin text-sky-600' : ''
              } ${!isSupabaseConfigured ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {isOwnerAdmin && (
              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                title="Pengaturan Koneksi & Skema SQL Supabase"
                className="p-1 rounded-md text-slate-600 hover:text-sky-600 hover:bg-white transition cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Registrasi Pasien Baru</span>
          </button>
        </div>
      </div>

      {/* Sync / Action Status Banner */}
      {syncStatusMsg && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition ${
            syncStatusMsg.isError
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncStatusMsg.isError ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{syncStatusMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncStatusMsg(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
            aria-label="Tutup notifikasi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Patient Table with Server-Side Pagination */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3 w-16 text-center">Aksi</th>
                <th className="p-3">No. RM &amp; NIK</th>
                <th className="p-3">Nama Pasien</th>
                <th className="p-3">Kategori</th>
                <th className="p-3">Kontak &amp; Alamat</th>
                <th className="p-3">Flag Alergi Obat</th>
                <th className="p-3 text-center">Kartu QR</th>
                <th className="p-3 text-center">Antrean</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {isServerLoading && displayedPatients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2 font-bold text-xs">
                      <Loader2 className="w-4 h-4 text-sky-600 animate-spin" />
                      <span>Mengambil data pasien halaman {safeCurrentPage} dari Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : displayedPatients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 italic">
                    {debouncedSearchTerm || categoryFilter !== 'SEMUA'
                      ? 'Tidak ada data pasien yang sesuai dengan pencarian / filter di server.'
                      : 'Belum ada data pasien terdaftar.'}
                  </td>
                </tr>
              ) : (
                displayedPatients.map((patient) => (
                  <tr
                    key={patient.dbId || patient.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isServerLoading ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-center">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(patient)}
                          title="Edit Pasien"
                          className="p-1.5 text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition inline-flex items-center cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(patient)}
                          title="Hapus Pasien"
                          className="p-1.5 text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition inline-flex items-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="p-3 font-mono tabular-nums">
                      <span className="font-extrabold text-sky-700 block">{patient.noRm || patient.id}</span>
                      {patient.dbId && patient.dbId !== (patient.noRm || patient.id) && (
                        <span className="text-[9px] text-slate-400 font-normal block">
                          ID: {patient.dbId}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-normal block">
                        NIK: {patient.nik}
                      </span>
                      {patient.ihsNumber && (
                        <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-extrabold">
                          IHS: {patient.ihsNumber}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-slate-800 block">{patient.name}</span>
                      <span className="text-[10px] text-slate-500">
                        {patient.gender}, {patient.age} thn · Tgl Lahir: {patient.birthDate || '-'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px]">
                        {patient.category}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="block font-mono text-[11px] tabular-nums">
                        {patient.phone || '-'}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate block max-w-[180px]">
                        {patient.address || '-'}
                      </span>
                    </td>
                    <td className="p-3">
                      {patient.allergy && patient.allergy !== 'Tidak Ada' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-200 text-[10px]">
                          <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                          {patient.allergy}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Tidak Ada Alergi</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedCardPatient(patient)}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                      >
                        <QrCode className="w-3 h-3" />
                        <span>Cetak QR</span>
                      </button>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => onSendToQueue(patient)}
                        title="Kirim pasien langsung ke antrean poli"
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>+ Antrean</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
          isLoading={isServerLoading}
          itemLabel="pasien"
        />
      </div>

      {/* Registration & Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-extrabold text-sm uppercase tracking-wide">
                {(editPatientId !== null || editTargetPatient !== null) ? 'Edit Data Pasien' : 'Registrasi Pasien Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs">
              {formError && (
                <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    NIK Pasien (16 Digit KTP) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={16}
                    placeholder="160100..."
                    value={formData.nik}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl font-mono font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori Pasien *</label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value as Patient['category'] })
                    }
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  >
                    <option value="Pasien Praktik">Pasien Praktik Dokter</option>
                    <option value="Pasien Umum">Pasien Umum / OTC</option>
                    <option value="Mitra Perusahaan">Mitra Perusahaan / Nakes</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Lengkap Pasien *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Tn. Bambang Irawan"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Lahir *</label>
                  <input
                    type="date"
                    required
                    value={formData.birthDate}
                    onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={formData.gender}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gender: e.target.value as 'Laki-laki' | 'Perempuan'
                      })
                    }
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-white"
                  >
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">No. HP / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="0812-..."
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl font-mono font-bold bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Alamat Domisili Lengkap</label>
                <input
                  type="text"
                  placeholder="Nama jalan, RT/RW, Desa, Kecamatan..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl bg-white"
                />
              </div>

              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-1">
                <label className="block font-bold text-rose-900 text-xs flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  Flag Riwayat Alergi Obat Spesifik
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Amoxicillin, Paracetamol, Sulfonamida (Ketik 'Tidak Ada' bila aman)"
                  value={formData.allergy}
                  onChange={(e) => setFormData({ ...formData, allergy: e.target.value })}
                  className="w-full px-3 py-2 border border-rose-300 rounded-xl font-bold text-rose-900 bg-white"
                />
                <span className="text-[10px] text-rose-600 block">
                  Peringatan ini akan muncul otomatis saat dokter meresepkan obat di ruang periksa.
                </span>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-xl font-black shadow-md uppercase tracking-wider cursor-pointer"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Pasien'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-100 text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">Hapus Data Pasien?</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Pasien <strong className="text-slate-900">{deleteTarget.name}</strong> (
                  <span className="font-mono font-bold">{deleteTarget.id}</span>) akan dihapus
                  permanen dari daftar master pasien.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Ya, Hapus Pasien
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient QR Card Modal & Print Area */}
      {selectedCardPatient && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center space-y-4 border border-slate-300">
            <div id="printable-section" className="space-y-3">
              <div className="border-b border-slate-300 pb-2">
                <div className="flex items-center justify-between gap-2">
                  {pharmacyProfile.logoUrl ? (
                    <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                      <img
                        src={pharmacyProfile.logoUrl}
                        alt="Logo Faskes"
                        className="w-10 h-10 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-10 shrink-0" />
                  )}
                  <div className="flex-1 text-center">
                    <h2 className="font-black text-slate-900 text-sm tracking-wide uppercase">
                      {pharmacyProfile.name}
                    </h2>
                    <p className="text-[10px] text-slate-600 font-medium">
                      {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                    </p>
                    <p className="text-[9px] text-slate-500 font-mono">
                      {[
                        pharmacyProfile.sia ? `SIA: ${pharmacyProfile.sia}` : '',
                        pharmacyProfile.nib ? `NIB: ${pharmacyProfile.nib}` : '',
                        pharmacyProfile.npwp ? `NPWP: ${pharmacyProfile.npwp}` : ''
                      ].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-[10px] text-sky-800 font-bold uppercase mt-0.5">
                      Kartu Rekam Medis Berobat Pasien
                    </p>
                  </div>
                  <div className="w-10 shrink-0" />
                </div>
              </div>

              <div className="bg-slate-50 border-2 border-slate-800 p-4 rounded-2xl text-left space-y-1.5">
                <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-widest">
                  Nomor Rekam Medis (RM)
                </span>
                <div className="text-2xl font-black font-mono text-sky-800 tracking-wider">
                  {selectedCardPatient.id}
                </div>
                <div className="font-extrabold text-sm text-slate-900">{selectedCardPatient.name}</div>
                <div className="text-[10px] text-slate-600 font-mono">
                  NIK: {selectedCardPatient.nik} · {selectedCardPatient.gender}
                </div>
                {selectedCardPatient.allergy !== 'Tidak Ada' && (
                  <div className="text-[10px] font-bold text-rose-700 pt-1">
                    Alergi: {selectedCardPatient.allergy}
                  </div>
                )}
              </div>

              <div className="w-36 h-36 mx-auto bg-white border border-slate-200 rounded-2xl p-2 flex items-center justify-center shadow-xs">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=LATISHA-RM-${selectedCardPatient.id}-${selectedCardPatient.nik}`}
                  alt="QR Code Pasien"
                  className="w-full h-full object-contain"
                />
              </div>

              <p className="text-[10px] text-slate-400 font-medium italic">
                Harap membawa kartu ini setiap kali berkunjung atau berobat.
              </p>
            </div>

            <div className="flex gap-2 pt-2 border-t no-print">
              <button
                type="button"
                onClick={() => {
                  if (selectedCardPatient) {
                    try {
                      demoSetItem('latisha_active_print_patient', JSON.stringify(selectedCardPatient));
                    } catch (e) {}
                    openPrintWindow('kartu-pasien', { patientId: selectedCardPatient.id });
                  }
                }}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" /> Cetak Kartu
              </button>
              <button
                type="button"
                onClick={() => setSelectedCardPatient(null)}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 font-bold rounded-xl text-xs text-slate-800 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Connection & SQL Schema Modal */}
      {isOwnerAdmin && showConfigModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Integrasi Supabase Master Pasien</h3>
                  <p className="text-[11px] text-slate-400">
                    Pagination Bertahap (.range) &amp; Pencarian Server-Side (.ilike)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sky-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-600" />
                  Optimasi Query Skala Ribuan Pasien (5000+ Baris)
                </p>
                <ul className="list-disc list-inside text-[11px] space-y-1 text-sky-800 pl-1">
                  <li>
                    <strong>Pagination Bertahap (.range):</strong> Hanya mengambil {pageSize} baris per halaman agar penggunaan memori browser tetap ringan.
                  </li>
                  <li>
                    <strong>Server-Side Search (.ilike):</strong> Pencarian Nama, NIK, No. RM, dan Kontak dijalankan langsung pada index PostgreSQL Supabase.
                  </li>
                </ul>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Kredensial Project Supabase</h4>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://xyzcompany.supabase.co"
                    value={supabaseConfig.url}
                    onChange={(e) => setConfigState({ ...supabaseConfig, url: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Supabase Anon / Public API Key
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    value={supabaseConfig.key}
                    onChange={(e) => setConfigState({ ...supabaseConfig, key: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nama Tabel Pasien di Supabase
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="pasien"
                    value={supabaseConfig.patientTable}
                    onChange={(e) => setConfigState({ ...supabaseConfig, patientTable: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-500 outline-none font-mono"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Simpan &amp; Aktifkan Sync</span>
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-slate-600" />
                    <h4 className="font-bold text-slate-800 text-xs">Skema DDL SQL Tabel Pasien</h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySchema}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
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
                  Salin skrip SQL berikut dan jalankan di <strong>SQL Editor</strong> Supabase Dashboard Anda. Skrip ini sudah mencakup index pencarian cepat serta aktivasi <code>supabase_realtime</code>:
                </p>

                <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-48">
                  <pre>{SUPABASE_PATIEN_SQL_SCHEMA}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
