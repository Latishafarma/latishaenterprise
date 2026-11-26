import React, { useState, useMemo } from 'react';
import { demoSetItem } from '../utils/demoSandbox';
import {
  FileSpreadsheet,
  Users,
  Activity,
  Baby,
  Printer,
  Search,
  Stethoscope,
  Database,
  RefreshCw,
  Code,
  Save,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  X,
  TrendingUp,
  Archive
} from 'lucide-react';
import {
  RMERecord,
  MedicalMorbidityReportRecord,
  MorbidityTopDiagnosis
} from '../types';
import { openPrintWindow } from '../utils/printHelper';
import { useFacilityProfiles, formatPharmacyAddress } from './PharmacySettingsModal';
import {
  SUPABASE_MORBIDITY_REPORT_SQL_SCHEMA,
  SUPABASE_RME_SQL_SCHEMA,
  DEFAULT_MORBIDITY_REPORT_TABLE,
  getSupabaseConfig,
  setSupabaseConfig
} from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';

interface RMEReportsViewProps {
  rmeRecords: RMERecord[];
  morbidityReports?: MedicalMorbidityReportRecord[];
  onSaveMorbidityReport?: (report: MedicalMorbidityReportRecord) => Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  onDeleteMorbidityReport?: (id: string) => Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  onSyncSupabase?: () => Promise<{
    success: boolean;
    rmeCount?: number;
    reportCount?: number;
    needsTableSetup?: boolean;
    needsRmeTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  needsTableSetup?: boolean;
  needsRmeTableSetup?: boolean;
  isDemoSandbox?: boolean;
  currentUserName?: string;
  currentBranchId?: string;
}

export const RMEReportsView: React.FC<RMEReportsViewProps> = ({
  rmeRecords,
  morbidityReports = [],
  onSaveMorbidityReport,
  onDeleteMorbidityReport,
  onSyncSupabase,
  needsTableSetup = false,
  needsRmeTableSetup = false,
  isDemoSandbox = false,
  currentUserName = 'Petugas Klinik',
  currentBranchId = 'BR-01'
}) => {
  const { pharmacyProfile, apjProfile, dpjProfile } = useFacilityProfiles();
  const isOwnerAdmin = useIsOwnerAdmin();
  const pharmacyFullAddress = formatPharmacyAddress(pharmacyProfile);

  const [reportType, setReportType] = useState<'KUNJUNGAN' | 'KASUS'>('KUNJUNGAN');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('2026-10-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [minAge, setMinAge] = useState<string>('');
  const [maxAge, setMaxAge] = useState<string>('');

  // Supabase sync & archive state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingArchive, setIsSavingArchive] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Archive modal state
  const [showSaveArchiveModal, setShowSaveArchiveModal] = useState(false);
  const [archiveTitle, setArchiveTitle] = useState('');
  const [archiveNotes, setArchiveNotes] = useState('');
  const [confirmDeleteReport, setConfirmDeleteReport] =
    useState<MedicalMorbidityReportRecord | null>(null);

  // SQL Schema modal state
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [morbidityTableInput, setMorbidityTableInput] = useState(
    () => getSupabaseConfig().morbidityReportTable || DEFAULT_MORBIDITY_REPORT_TABLE
  );

  // Filter Kunjungan
  const filteredKunjungan = useMemo(() => {
    return rmeRecords.filter((ex) => {
      const matchDate = (!startDate || ex.date >= startDate) && (!endDate || ex.date <= endDate);
      const min = minAge !== '' ? parseInt(minAge, 10) : null;
      const max = maxAge !== '' ? parseInt(maxAge, 10) : null;
      const matchAge = (min === null || ex.age >= min) && (max === null || ex.age <= max);

      const q = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        ex.patientName.toLowerCase().includes(q) ||
        ex.rmId.toLowerCase().includes(q) ||
        ex.soapA.toLowerCase().includes(q);
      return matchDate && matchAge && matchSearch;
    });
  }, [rmeRecords, startDate, endDate, minAge, maxAge, searchQuery]);

  // Filter Kasus
  const filteredKasus = useMemo(() => {
    return rmeRecords.filter((ex) => {
      const matchDate = (!startDate || ex.date >= startDate) && (!endDate || ex.date <= endDate);
      const min = minAge !== '' ? parseInt(minAge, 10) : null;
      const max = maxAge !== '' ? parseInt(maxAge, 10) : null;
      const matchAge = (min === null || ex.age >= min) && (max === null || ex.age <= max);

      const q = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        ex.soapA.toLowerCase().includes(q) ||
        ex.icdCode.toLowerCase().includes(q) ||
        (ex.icdName || '').toLowerCase().includes(q);
      return matchDate && matchAge && matchSearch;
    });
  }, [rmeRecords, startDate, endDate, minAge, maxAge, searchQuery]);

  // Filter Anak (Pediatrik 0-18 tahun)
  const filteredAnak = useMemo(() => {
    return rmeRecords.filter((ex) => {
      const isPediatric = ex.age >= 0 && ex.age <= 18;
      const matchDate = (!startDate || ex.date >= startDate) && (!endDate || ex.date <= endDate);
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        ex.patientName.toLowerCase().includes(q) ||
        ex.rmId.toLowerCase().includes(q) ||
        ex.soapA.toLowerCase().includes(q) ||
        ex.icdCode.toLowerCase().includes(q);
      return isPediatric && matchDate && matchSearch;
    });
  }, [rmeRecords, startDate, endDate, searchQuery]);

  // Morbidity Top Diagnoses aggregation (berdasarkan data kasus terfilter)
  const topDiagnoses: MorbidityTopDiagnosis[] = useMemo(() => {
    const counts = new Map<string, MorbidityTopDiagnosis>();
    filteredKasus.forEach((item) => {
      const code = (item.icdCode || '-').trim() || '-';
      const diag = (item.icdName || item.soapA || 'Diagnosa Belum Tercatat').trim();
      const key = `${code}::${diag.toLowerCase()}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          icdCode: code,
          diagnosis: diag,
          count: 1
        });
      }
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredKasus]);

  const handleRunSupabaseSync = async () => {
    if (!onSyncSupabase) return;
    setIsSyncing(true);
    setSyncToast(null);
    try {
      const res = await onSyncSupabase();
      if (res.isDemo) {
        setSyncToast({
          type: 'warning',
          message: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan otomatis.'
        });
      } else if (res.success) {
        setSyncToast({
          type: 'success',
          message: `Sinkronisasi 2-arah berhasil! ${res.rmeCount ?? rmeRecords.length} e-RME & ${res.reportCount ?? morbidityReports.length} arsip laporan morbiditas tersinkron dengan Supabase.`
        });
      } else if (res.needsTableSetup || res.needsRmeTableSetup) {
        setSyncToast({
          type: 'warning',
          message: `Tabel Supabase (${res.needsTableSetup ? morbidityTableInput : ''}${res.needsTableSetup && res.needsRmeTableSetup ? ' & ' : ''}${res.needsRmeTableSetup ? 'medical_records' : ''}) belum dibuat. Salin skrip pada modal Skema SQL.`
        });
        setShowSchemaModal(true);
      } else {
        setSyncToast({
          type: 'error',
          message: res.error || 'Gagal menyinkronkan data laporan medis & morbiditas ke Supabase.'
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenSaveArchive = () => {
    const labelType = reportType === 'KUNJUNGAN' ? 'Rekap Kunjungan' : 'Distribusi Morbiditas ICD-10';
    setArchiveTitle(`Laporan ${labelType} (${startDate || 'Awal'} s.d. ${endDate || 'Sekarang'})`);
    setArchiveNotes('');
    setShowSaveArchiveModal(true);
  };

  const handleConfirmSaveArchive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveMorbidityReport) return;

    setIsSavingArchive(true);
    setSyncToast(null);

    const activeRecords = reportType === 'KUNJUNGAN' ? filteredKunjungan : filteredKasus;
    const nowIso = new Date().toISOString();
    const newReport: MedicalMorbidityReportRecord = {
      id: `LPM-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      title:
        archiveTitle.trim() ||
        `Laporan ${reportType === 'KUNJUNGAN' ? 'Kunjungan' : 'Morbiditas'} (${startDate} s.d. ${endDate})`,
      reportType,
      startDate,
      endDate,
      minAge: minAge !== '' ? parseInt(minAge, 10) : null,
      maxAge: maxAge !== '' ? parseInt(maxAge, 10) : null,
      searchQuery: searchQuery.trim(),
      totalVisits: filteredKunjungan.length,
      totalCases: filteredKasus.length,
      pediatricCount: filteredAnak.length,
      topDiagnoses,
      notes: archiveNotes.trim(),
      createdBy: currentUserName,
      dpjName: dpjProfile.name,
      apjName: apjProfile.name,
      branchId: currentBranchId,
      createdAt: nowIso,
      updatedAt: nowIso,
      recordsSnapshot: activeRecords.slice(0, 250)
    };

    try {
      const res = await onSaveMorbidityReport(newReport);
      setShowSaveArchiveModal(false);
      if (res.isDemo) {
        setSyncToast({
          type: 'success',
          message: `Arsip "${newReport.title}" tersimpan di penyimpanan lokal Demo Sandbox.`
        });
      } else if (res.success) {
        setSyncToast({
          type: 'success',
          message: `Arsip "${newReport.title}" berhasil disimpan ke lokal & tabel Supabase (${morbidityTableInput}).`
        });
      } else if (res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: `Arsip tersimpan lokal, namun tabel "${morbidityTableInput}" belum ada di Supabase. Buka Skema SQL untuk membuatnya.`
        });
      } else {
        setSyncToast({
          type: 'error',
          message: res.error || 'Arsip tersimpan lokal, namun gagal sinkron ke Supabase.'
        });
      }
    } finally {
      setIsSavingArchive(false);
    }
  };

  const handleConfirmDeleteArchive = async () => {
    if (!confirmDeleteReport || !onDeleteMorbidityReport) return;
    const target = confirmDeleteReport;
    setConfirmDeleteReport(null);
    const res = await onDeleteMorbidityReport(target.id);
    if (res.isDemo || res.success) {
      setSyncToast({
        type: 'success',
        message: `Arsip "${target.title}" berhasil dihapus.`
      });
    } else if (res.error) {
      setSyncToast({
        type: 'warning',
        message: `Arsip dihapus dari tampilan lokal (${res.error}).`
      });
    }
  };

  const handleApplyArchivedFilter = (rep: MedicalMorbidityReportRecord) => {
    setReportType(rep.reportType);
    if (rep.startDate) setStartDate(rep.startDate);
    if (rep.endDate) setEndDate(rep.endDate);
    setMinAge(rep.minAge !== null && rep.minAge !== undefined ? String(rep.minAge) : '');
    setMaxAge(rep.maxAge !== null && rep.maxAge !== undefined ? String(rep.maxAge) : '');
    setSearchQuery(rep.searchQuery || '');
    setSyncToast({
      type: 'success',
      message: `Filter dari arsip "${rep.title}" diterapkan.`
    });
  };

  const handlePrintArchive = (rep: MedicalMorbidityReportRecord) => {
    const records =
      rep.recordsSnapshot && rep.recordsSnapshot.length > 0
        ? rep.recordsSnapshot
        : rmeRecords.filter(
            (ex) => (!rep.startDate || ex.date >= rep.startDate) && (!rep.endDate || ex.date <= rep.endDate)
          );
    try {
      demoSetItem(
        'latisha_active_print_morbiditas',
        JSON.stringify({
          reportType: rep.reportType,
          startDate: rep.startDate,
          endDate: rep.endDate,
          kunjungan: records,
          kasus: records,
          anak: records.filter((ex) => ex.age >= 0 && ex.age <= 18)
        })
      );
    } catch {}
    openPrintWindow('laporan-morbiditas', {
      reportType: rep.reportType,
      startDate: rep.startDate,
      endDate: rep.endDate
    });
  };

  const handleSaveTableName = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSandbox) return;
    const cleaned = morbidityTableInput.trim() || DEFAULT_MORBIDITY_REPORT_TABLE;
    setMorbidityTableInput(cleaned);
    setSupabaseConfig({ morbidityReportTable: cleaned });
    handleRunSupabaseSync();
  };

  const combinedSqlSchema = `${SUPABASE_MORBIDITY_REPORT_SQL_SCHEMA}\n\n${SUPABASE_RME_SQL_SCHEMA}`;

  const handleCopySchema = () => {
    navigator.clipboard
      ?.writeText(combinedSqlSchema)
      .then(() => {
        setCopiedSchema(true);
        setTimeout(() => setCopiedSchema(false), 2500);
      })
      .catch(() => {});
  };

  const anyNeedsTableSetup = needsTableSetup || needsRmeTableSetup;

  return (
    <div className="space-y-4">
      {/* Top Header, Status Badge, Tabs & Supabase Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-500 shrink-0" />
                Laporan Rekam Medis &amp; Epidemiologi Morbiditas
              </h3>
              {isDemoSandbox ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                  <Database className="w-3 h-3" />
                  Mode Demo Sandbox
                </span>
              ) : anyNeedsTableSetup ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold">
                  <AlertCircle className="w-3 h-3" />
                  Tabel Supabase Perlu Setup
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  Supabase Live: medical_records &amp; {morbidityTableInput}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Rekapitulasi kunjungan, distribusi diagnosa ICD-10, dan arsip laporan morbiditas tersinkronisasi 2-arah ke Supabase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onSaveMorbidityReport && (
              <button
                type="button"
                onClick={handleOpenSaveArchive}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Arsip</span>
              </button>
            )}

            {onSyncSupabase && (
              <button
                type="button"
                onClick={handleRunSupabaseSync}
                disabled={isSyncing}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
              </button>
            )}

            {isOwnerAdmin && (
              <button
                type="button"
                onClick={() => setShowSchemaModal(true)}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Skema SQL</span>
              </button>
            )}
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setReportType('KUNJUNGAN')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                reportType === 'KUNJUNGAN'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>1. Rekap Kunjungan</span>
            </button>

            <button
              type="button"
              onClick={() => setReportType('KASUS')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                reportType === 'KASUS'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>2. Kasus &amp; Morbiditas ICD-10</span>
            </button>
          </div>

          <div className="text-[11px] font-semibold text-slate-500">
            Total Data e-RME Terhubung: <strong className="text-slate-900">{rmeRecords.length}</strong> catatan
          </div>
        </div>
      </div>

      {/* Warning banner when Supabase table needs creation (APJ / Owner Only) */}
      {isOwnerAdmin && anyNeedsTableSetup && !isDemoSandbox && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Tabel Supabase Laporan Medis &amp; Morbiditas belum aktif:</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {needsTableSetup && `• Tabel arsip "${morbidityTableInput}" belum ditemukan. `}
                {needsRmeTableSetup && '• Tabel sumber "medical_records" belum ditemukan. '}
                Jalankan skrip SQL di Dashboard Supabase agar data tersinkronisasi 2-arah tanpa error 404.
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

      {/* Non-blocking Toast Banner */}
      {syncToast && (
        <div
          className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
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

      {/* Date Range & Search Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end text-xs">
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="block font-bold text-slate-700 mb-1">Pencarian Otomatis</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={
                reportType === 'KASUS'
                  ? 'Ketik nama penyakit atau kode ICD-10...'
                  : 'Ketik nama pasien atau no RM...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-xl font-semibold bg-slate-50 focus:bg-white outline-none"
            />
          </div>
        </div>

        <div className="lg:col-span-1">
          <label className="block font-bold text-slate-700 mb-1">Min Umur</label>
          <input
            type="number"
            placeholder="Min"
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
            className="w-full p-2 border rounded-xl font-mono font-bold bg-slate-50"
          />
        </div>

        <div className="lg:col-span-1">
          <label className="block font-bold text-slate-700 mb-1">Max Umur</label>
          <input
            type="number"
            placeholder="Max"
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
            className="w-full p-2 border rounded-xl font-mono font-bold bg-slate-50"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="block font-bold text-slate-700 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full p-2 border rounded-xl font-bold bg-slate-50"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="block font-bold text-slate-700 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full p-2 border rounded-xl font-bold bg-slate-50"
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-2">
          <button
            type="button"
            onClick={() => {
              try {
                demoSetItem(
                  'latisha_active_print_morbiditas',
                  JSON.stringify({
                    reportType,
                    startDate,
                    endDate,
                    kunjungan: filteredKunjungan,
                    kasus: filteredKasus,
                    anak: filteredAnak
                  })
                );
              } catch {}
              openPrintWindow('laporan-morbiditas', {
                reportType,
                startDate,
                endDate
              });
            }}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Laporan</span>
          </button>
        </div>
      </div>

      {/* Ringkasan KPI Morbiditas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Kunjungan Periode Ini</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-xl font-black text-slate-900 mt-1">
            {filteredKunjungan.length} <span className="text-xs font-semibold text-slate-500">Pasien</span>
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Kasus ICD-10 Tercatat</span>
            <Activity className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-xl font-black text-slate-900 mt-1">
            {filteredKasus.length} <span className="text-xs font-semibold text-slate-500">Kasus</span>
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Pasien Anak (0-18 Th)</span>
            <Baby className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-slate-900 mt-1">
            {filteredAnak.length} <span className="text-xs font-semibold text-slate-500">Anak</span>
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Diagnosa Terbanyak</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xs font-black text-slate-900 mt-1.5 truncate" title={topDiagnoses[0]?.diagnosis}>
            {topDiagnoses[0] ? `${topDiagnoses[0].icdCode} · ${topDiagnoses[0].diagnosis}` : 'Belum ada data'}
          </p>
          {topDiagnoses[0] && (
            <p className="text-[10px] font-bold text-amber-700 mt-0.5">{topDiagnoses[0].count} kasus</p>
          )}
        </div>
      </div>

      {/* Printable Report Output */}
      <div
        id="printable-section"
        className="bg-white p-4 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 text-slate-900"
      >
        {/* Kop Surat Terintegrasi Profil Apotek, APJ, dan DPJ */}
        <div className="border-b-2 border-slate-900 pb-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            {pharmacyProfile.logoUrl ? (
              <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                <img
                  src={pharmacyProfile.logoUrl}
                  alt="Logo Faskes"
                  className="w-16 h-16 object-contain"
                />
              </div>
            ) : (
              <div className="hidden sm:block w-16 shrink-0" />
            )}
            <div className="flex-1 text-center">
              <h2 className="font-black text-sm sm:text-base text-slate-900 uppercase tracking-wider">
                {pharmacyProfile.name}
              </h2>
              <p className="text-[11px] text-slate-700 font-medium mt-0.5">
                {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
              </p>
              <p className="text-[10px] text-slate-600 font-mono mt-0.5 flex flex-wrap justify-center gap-x-2">
                {pharmacyProfile.sia && <span>SIA: <strong>{pharmacyProfile.sia}</strong></span>}
                {pharmacyProfile.nib && <span>· NIB: <strong>{pharmacyProfile.nib}</strong></span>}
                {pharmacyProfile.npwp && <span>· NPWP: <strong>{pharmacyProfile.npwp}</strong></span>}
              </p>
            </div>
            <div className="hidden sm:block w-16 shrink-0" />
          </div>
          <div className="text-center">
            <div className="mt-3 inline-block px-4 py-1 bg-sky-100 text-sky-900 rounded-md font-black text-xs uppercase">
              {reportType === 'KUNJUNGAN' && 'LAPORAN REKAPITULASI KUNJUNGAN PASIEN'}
              {reportType === 'KASUS' && 'LAPORAN DISTRIBUSI KASUS & MORBIDITAS PENYAKIT (ICD-10)'}
            </div>
            <p className="text-[10px] text-slate-500 font-bold mt-1">
              Periode: {startDate || '-'} s.d. {endDate || '-'}
            </p>
          </div>
        </div>

        {/* Kartu Profil DPJ (Dokter Penanggung Jawab) untuk Dokumen Laporan Medis */}
        <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200 flex flex-wrap justify-between items-center gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0">
              <Stethoscope className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">
                Dokter Penanggung Jawab (DPJ) Layanan Medis
              </span>
              <div className="font-black text-slate-900 text-xs mt-0.5">
                {dpjProfile.name}{' '}
                <span className="font-semibold text-emerald-800">({dpjProfile.specialization})</span>
              </div>
              <div className="font-mono text-[10px] text-slate-700 mt-0.5">
                SIP: <strong>{dpjProfile.sip}</strong> · {dpjProfile.idi} · Telp: {dpjProfile.phone}
              </div>
            </div>
          </div>
        </div>

        {/* Ranking 10 Besar Penyakit / Morbiditas (ditampilkan otomatis di tab Kasus atau saat ada data) */}
        {topDiagnoses.length > 0 && reportType === 'KASUS' && (
          <div className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-2">
            <h4 className="text-xs font-black text-indigo-950 flex items-center gap-1.5 uppercase tracking-wide">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              Pola Morbiditas Teratas ({topDiagnoses.length} Diagnosa Dominan)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {topDiagnoses.slice(0, 5).map((td, index) => (
                <div
                  key={`${td.icdCode}-${index}`}
                  className="bg-white p-2.5 rounded-xl border border-indigo-100 text-xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-black text-indigo-700 text-[11px]">
                      #{index + 1} · {td.icdCode}
                    </span>
                    <span className="font-black text-slate-900 text-[11px]">{td.count}x</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-700 mt-1 line-clamp-2">
                    {td.diagnosis}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 1: Kunjungan */}
        {reportType === 'KUNJUNGAN' && (
          <div className="space-y-3">
            <div className="overflow-x-auto w-full custom-scrollbar">
              <table className="w-full min-w-[680px] text-left text-xs border border-collapse">
                <thead>
                  <tr className="bg-slate-100 font-bold border">
                    <th className="p-2 border text-center w-10">No</th>
                    <th className="p-2 border w-24">Tanggal</th>
                    <th className="p-2 border w-24">No. RM</th>
                    <th className="p-2 border">Nama Pasien</th>
                    <th className="p-2 border text-center w-16">Umur</th>
                    <th className="p-2 border">Diagnosa Utama</th>
                    <th className="p-2 border w-32">Dokter</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-medium text-slate-700">
                  {filteredKunjungan.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                        Tidak ada data kunjungan pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    filteredKunjungan.map((item, idx) => (
                      <tr key={item.id} className="border-b">
                        <td className="p-2 border text-center">{idx + 1}</td>
                        <td className="p-2 border font-mono">{item.date}</td>
                        <td className="p-2 border font-mono font-bold text-sky-700">{item.rmId}</td>
                        <td className="p-2 border font-bold text-slate-900">{item.patientName}</td>
                        <td className="p-2 border text-center">{item.age} thn</td>
                        <td className="p-2 border font-semibold">{item.soapA}</td>
                        <td className="p-2 border">{item.doctorName || dpjProfile.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="text-right text-xs font-bold text-slate-700 pt-2">
              Total Pasien Terlayani:{' '}
              <span className="text-sky-700 font-black">{filteredKunjungan.length} Orang</span>
            </div>
          </div>
        )}

        {/* Tab 2: Kasus */}
        {reportType === 'KASUS' && (
          <div className="space-y-3">
            <div className="overflow-x-auto w-full custom-scrollbar">
              <table className="w-full min-w-[700px] text-left text-xs border border-collapse">
                <thead>
                  <tr className="bg-slate-100 font-bold border">
                    <th className="p-2 border text-center w-10">No</th>
                    <th className="p-2 border w-24 text-center">Kode ICD-10</th>
                    <th className="p-2 border">Deskripsi Diagnosis Penyakit</th>
                    <th className="p-2 border w-24 text-center">Tanggal</th>
                    <th className="p-2 border">Pasien</th>
                    <th className="p-2 border">Terapi yang Diberikan</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-medium text-slate-700">
                  {filteredKasus.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                        Tidak ditemukan kasus penyakit sesuai kriteria filter.
                      </td>
                    </tr>
                  ) : (
                    filteredKasus.map((item, idx) => (
                      <tr key={item.id} className="border-b">
                        <td className="p-2 border text-center">{idx + 1}</td>
                        <td className="p-2 border text-center font-mono font-black text-indigo-700">
                          {item.icdCode || '-'}
                        </td>
                        <td className="p-2 border font-bold">{item.soapA}</td>
                        <td className="p-2 border text-center font-mono">{item.date}</td>
                        <td className="p-2 border">
                          {item.patientName} ({item.rmId})
                        </td>
                        <td className="p-2 border text-[11px]">
                          {item.prescription?.map((p) => `${p.name} (${p.qty})`).join(', ') || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="text-right text-xs font-bold text-slate-700 pt-2">
              Total Kasus: <span className="text-sky-700 font-black">{filteredKasus.length} Kasus</span>
            </div>
          </div>
        )}

        {/* Signature Area Terintegrasi Profil DPJ */}
        <div className="flex justify-center sm:justify-end pt-6 sm:pt-8 text-xs">
          <div className="text-center space-y-10 sm:space-y-12 sm:w-1/2">
            <p className="font-semibold text-slate-700">
              {pharmacyProfile.city},{' '}
              {new Date().toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
              <br />
              Dokter Penanggung Jawab Klinis (DPJ),
            </p>
            <div>
              <p className="font-extrabold underline text-slate-900">{dpjProfile.name}</p>
              <p className="text-[10px] text-slate-600 font-mono">SIP: {dpjProfile.sip}</p>
              <p className="text-[10px] text-slate-500 font-mono">{dpjProfile.idi}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Arsip Laporan Morbiditas Tersimpan di Supabase */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <Archive className="w-4 h-4 text-emerald-600" />
              Arsip Laporan Medis &amp; Morbiditas ({morbidityReports.length})
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Snapshot laporan periode yang disimpan dan disinkronkan 2-arah ke tabel Supabase{' '}
              <span className="font-mono font-semibold">{morbidityTableInput}</span>.
            </p>
          </div>
          {onSaveMorbidityReport && (
            <button
              type="button"
              onClick={handleOpenSaveArchive}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Arsipkan Laporan Aktif</span>
            </button>
          )}
        </div>

        {morbidityReports.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
            Belum ada arsip laporan tersimpan. Klik <strong>Simpan Arsip</strong> di atas untuk menyimpan rekap periode aktif ke Supabase.
          </div>
        ) : (
          <div className="space-y-2.5">
            {morbidityReports.map((rep) => (
              <div
                key={rep.id}
                className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-bold text-[10px]">
                      {rep.reportType}
                    </span>
                    <h5 className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                      {rep.title}
                    </h5>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                    <span>
                      Periode: <strong className="font-mono">{rep.startDate || '-'}</strong> s.d.{' '}
                      <strong className="font-mono">{rep.endDate || '-'}</strong>
                    </span>
                    <span>
                      Kunjungan: <strong>{rep.totalVisits}</strong>
                    </span>
                    <span>
                      Kasus ICD-10: <strong>{rep.totalCases}</strong>
                    </span>
                    <span>
                      Anak: <strong>{rep.pediatricCount}</strong>
                    </span>
                    <span>Oleh: {rep.createdBy || 'Petugas'}</span>
                  </div>
                  {rep.topDiagnoses && rep.topDiagnoses.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {rep.topDiagnoses.slice(0, 3).map((td, idx) => (
                        <span
                          key={`${rep.id}-diag-${idx}`}
                          className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-semibold text-slate-700"
                        >
                          <strong className="font-mono text-indigo-700">{td.icdCode}</strong> {td.diagnosis} ({td.count}x)
                        </span>
                      ))}
                    </div>
                  )}
                  {rep.notes && (
                    <p className="text-[11px] text-slate-500 italic">Catatan: {rep.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleApplyArchivedFilter(rep)}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Muat Filter</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintArchive(rep)}
                    className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak</span>
                  </button>
                  {onDeleteMorbidityReport && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteReport(rep)}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Simpan Arsip Laporan ke Supabase */}
      {showSaveArchiveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <Save className="w-4 h-4 text-emerald-600" />
                Simpan Arsip Laporan ke Supabase
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveArchiveModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSaveArchive} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Judul Arsip Laporan</label>
                <input
                  type="text"
                  required
                  value={archiveTitle}
                  onChange={(e) => setArchiveTitle(e.target.value)}
                  className="w-full p-2.5 border rounded-xl font-semibold bg-slate-50 focus:bg-white outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block">Kunjungan</span>
                  <strong className="text-sm font-black text-sky-700">{filteredKunjungan.length}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block">Kasus ICD-10</span>
                  <strong className="text-sm font-black text-indigo-700">{filteredKasus.length}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block">Pediatrik</span>
                  <strong className="text-sm font-black text-emerald-700">{filteredAnak.length}</strong>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Catatan Evaluasi / KLB (Opsional)
                </label>
                <textarea
                  rows={3}
                  value={archiveNotes}
                  onChange={(e) => setArchiveNotes(e.target.value)}
                  placeholder="Contoh: Peningkatan kasus ISPA bulan ini, verifikasi DPJ & APJ selesai."
                  className="w-full p-2.5 border rounded-xl font-medium bg-slate-50 focus:bg-white outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSaveArchiveModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingArchive}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 font-bold text-white cursor-pointer"
                >
                  {isSavingArchive ? 'Menyimpan...' : 'Simpan & Sinkronkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Arsip */}
      {confirmDeleteReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600" />
              Hapus Arsip Laporan?
            </h3>
            <p className="text-xs text-slate-600">
              Anda yakin ingin menghapus arsip <strong>{confirmDeleteReport.title}</strong>? Data ini juga akan dihapus dari tabel Supabase.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteReport(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteArchive}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Skema SQL & Pengaturan Tabel Supabase (APJ / Owner Only) */}
      {isOwnerAdmin && showSchemaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-600" />
                  Skema SQL Supabase — Laporan Medis &amp; Morbiditas
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mencakup tabel arsip <strong>laporan_morbiditas</strong> dan tabel sumber{' '}
                  <strong>medical_records</strong> lengkap dengan Realtime &amp; RLS.
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
                    Nama Tabel Arsip Morbiditas di Supabase
                  </label>
                  <input
                    type="text"
                    value={morbidityTableInput}
                    onChange={(e) => setMorbidityTableInput(e.target.value)}
                    disabled={isDemoSandbox}
                    className="w-full p-2 border rounded-xl font-mono font-bold bg-white"
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
                    {copiedSchema ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSchema ? 'SQL Tersalin!' : 'Salin Semua SQL'}</span>
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-80 leading-relaxed">
                  {combinedSqlSchema}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
