import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Copy,
  Check,
  Code,
  Database,
  Send,
  ShieldCheck,
  Eye,
  X,
  Loader2,
  Terminal
} from 'lucide-react';
import { Patient, SatuSehatLogEntry } from '../types';
import {
  SUPABASE_SATUSEHAT_SQL_SCHEMA,
  SATUSEHAT_CLI_DEPLOY_GUIDE,
  fetchSatuSehatLogsPaginated,
  retrySatuSehatLogEntry,
  invokeSatuSehatEdgeFunction
} from '../utils/satusehatService';
import { fetchPatientsPaginatedFromSupabase, getSupabaseConfig } from '../utils/supabaseClient';
import { PaginationControls, DEFAULT_PAGE_SIZE_OPTIONS } from './PaginationControls';
import { useIsOwnerAdmin } from '../utils/roleAccess';

interface SatuSehatViewProps {
  patients: Patient[];
  isDemoSandbox?: boolean;
  onPatientIhsUpdated?: (patientDbId: string, ihsNumber: string) => void;
}

export const SatuSehatView: React.FC<SatuSehatViewProps> = ({
  patients,
  isDemoSandbox = false,
  onPatientIhsUpdated
}) => {
  const isOwnerAdmin = useIsOwnerAdmin();
  const [subTab, setSubTab] = useState<'logs' | 'lookup' | 'setup'>('logs');

  useEffect(() => {
    if (!isOwnerAdmin && subTab === 'setup') {
      setSubTab('logs');
    }
  }, [isOwnerAdmin, subTab]);
  const [logs, setLogs] = useState<SatuSehatLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [needsTableSetup, setNeedsTableSetup] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ text: string; isError?: boolean } | null>(null);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const [inspectLog, setInspectLog] = useState<SatuSehatLogEntry | null>(null);

  // Patient NIK -> IHS lookup tester states
  const [patientQuery, setPatientQuery] = useState('');
  const [debouncedPatientQuery, setDebouncedPatientQuery] = useState('');
  const [lookupPatients, setLookupPatients] = useState<Patient[]>([]);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [syncingPatientKey, setSyncingPatientKey] = useState<string | null>(null);

  // Copy states
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);

  const supaCfg = getSupabaseConfig();
  const isSupabaseConfigured = Boolean(supaCfg.url && supaCfg.key);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPatientQuery(patientQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [patientQuery]);

  const loadLogs = useCallback(async () => {
    if (!isSupabaseConfigured || isDemoSandbox) return;
    setIsLoading(true);
    try {
      const res = await fetchSatuSehatLogsPaginated({
        page,
        pageSize,
        statusFilter,
        searchQuery: debouncedSearch
      });
      if (res.needsTableSetup) {
        setNeedsTableSetup(true);
        setLogs([]);
      } else if (res.data) {
        setNeedsTableSetup(false);
        setLogs(res.data);
        setTotalCount(res.totalCount);
        setTotalPages(res.totalPages);
      } else if (res.error) {
        setStatusBanner({ text: res.error, isError: true });
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSupabaseConfigured, isDemoSandbox, page, pageSize, statusFilter, debouncedSearch]);

  useEffect(() => {
    if (subTab === 'logs') {
      loadLogs();
    }
  }, [subTab, loadLogs]);

  useEffect(() => {
    if (subTab !== 'lookup' || !isSupabaseConfigured || isDemoSandbox) return;
    let cancelled = false;
    setIsLookupLoading(true);
    fetchPatientsPaginatedFromSupabase({
      page: 1,
      pageSize: 25,
      searchQuery: debouncedPatientQuery
    })
      .then((res) => {
        if (!cancelled && res.data) {
          setLookupPatients(res.data);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLookupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subTab, isSupabaseConfigured, isDemoSandbox, debouncedPatientQuery]);

  const handleRetryLog = async (entry: SatuSehatLogEntry) => {
    setRetryingLogId(entry.id);
    setStatusBanner(null);
    try {
      const res = await retrySatuSehatLogEntry(entry);
      if (res.success) {
        setStatusBanner({
          text: `Sinkronisasi ${entry.entityType} (${entry.localRecordId}) ke SATUSEHAT berhasil.`
        });
      } else {
        setStatusBanner({
          text: res.error || 'Pengiriman ulang SATUSEHAT gagal. Pastikan Edge Function & Secrets aktif.',
          isError: true
        });
      }
      await loadLogs();
    } finally {
      setRetryingLogId(null);
    }
  };

  const handleSyncPatientIhs = async (p: Patient) => {
    const key = p.dbId || p.id;
    const cleanNik = (p.nik || '').replace(/\D/g, '');
    if (cleanNik.length < 16) {
      setStatusBanner({
        text: `NIK pasien ${p.name} ("${p.nik || '-'}") harus 16 digit untuk pencarian IHS SATUSEHAT.`,
        isError: true
      });
      return;
    }
    setSyncingPatientKey(key);
    setStatusBanner(null);
    try {
      const res = await invokeSatuSehatEdgeFunction({
        action: 'sync_patient',
        localRecordId: p.noRm || p.id,
        patientDbId: key,
        nik: cleanNik,
        patientName: p.name
      });
      if (res.success && res.ihsNumber) {
        setStatusBanner({
          text: `IHS Number SATUSEHAT ditemukan untuk ${p.name}: ${res.ihsNumber}`
        });
        onPatientIhsUpdated?.(key, res.ihsNumber);
        setLookupPatients((prev) =>
          prev.map((item) =>
            (item.dbId || item.id) === key
              ? { ...item, ihsNumber: res.ihsNumber, syncSatusehat: 'sent' }
              : item
          )
        );
      } else {
        setStatusBanner({
          text: res.error || 'Gagal menghubungi Edge Function satusehat-sync.',
          isError: true
        });
      }
    } finally {
      setSyncingPatientKey(null);
    }
  };

  const displayedLookupPatients = isDemoSandbox || !isSupabaseConfigured
    ? patients
        .filter((p) => {
          const q = debouncedPatientQuery.toLowerCase();
          if (!q) return true;
          return (
            p.name.toLowerCase().includes(q) ||
            p.nik.includes(q) ||
            (p.noRm || p.id).toLowerCase().includes(q)
          );
        })
        .slice(0, 25)
    : lookupPatients;

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-base tracking-tight">
              Integrasi SATUSEHAT Kemenkes (FHIR R4 · Background Edge Worker)
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
              Autentikasi OAuth2 &amp; pengiriman resource FHIR (Patient, Encounter, Condition ICD-10, MedicationRequest/Dispense) dijalankan secara asinkron lewat Supabase Edge Function agar kasir dan RME tetap 0ms tanpa lag.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('logs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'logs' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            Log &amp; Status Antrean
          </button>
          <button
            type="button"
            onClick={() => setSubTab('lookup')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'lookup' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            Sinkron IHS Pasien
          </button>
          {isOwnerAdmin && (
            <button
              type="button"
              onClick={() => setSubTab('setup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                subTab === 'setup' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              SQL Migrasi &amp; Deploy Guide
            </button>
          )}
        </div>
      </div>

      {statusBanner && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 ${
            statusBanner.isError
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.isError ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 hover:bg-black/5 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB 1: LOG & ANTREAN SATUSEHAT */}
      {subTab === 'logs' && (
        <div className="space-y-4">
          {isOwnerAdmin && needsTableSetup && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-amber-900">
                <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Tabel `satusehat_logs` &amp; kolom `ihs_number` belum dimigrasi di Supabase.</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Buka tab <strong>SQL Migrasi &amp; Deploy Guide</strong> lalu jalankan skrip SQL di SQL Editor Supabase untuk mengaktifkan pencatatan status pengiriman.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('setup')}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs cursor-pointer"
              >
                Lihat Skrip SQL Migrasi &rarr;
              </button>
            </div>
          )}

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 max-w-md min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari ID Lokal / IHS Number / Resource FHIR..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-700 outline-none"
              >
                <option value="ALL">Semua Status</option>
                <option value="pending">Pending (Antrean)</option>
                <option value="sent">Sent (Terkirim)</option>
                <option value="failed">Failed (Gagal)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={loadLogs}
              disabled={isLoading}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Muat Ulang Log</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-3">Waktu</th>
                    <th className="p-3">Resource FHIR</th>
                    <th className="p-3">ID Rekaman Lokal</th>
                    <th className="p-3">IHS / Resource ID</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading && logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        <span className="inline-flex items-center gap-2 font-bold">
                          <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                          Memuat log SATUSEHAT dari Supabase...
                        </span>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                        {isDemoSandbox
                          ? 'Mode Demo Sandbox aktif — pengiriman SATUSEHAT diisolasi.'
                          : 'Belum ada riwayat pengiriman SATUSEHAT pada filter saat ini.'}
                      </td>
                    </tr>
                  ) : (
                    logs.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString('id-ID')}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-[10px]">
                            {entry.entityType}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-sky-700">
                          {entry.localRecordId}
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          <div className="text-slate-800">{entry.fhirResourceId || '-'}</div>
                          {entry.patientIhsNumber && (
                            <div className="text-[10px] text-emerald-700">
                              IHS: {entry.patientIhsNumber}
                            </div>
                          )}
                          {entry.errorMessage && (
                            <div className="text-[10px] text-rose-600 max-w-xs truncate" title={entry.errorMessage}>
                              {entry.errorMessage}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          {entry.status === 'sent' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                              <CheckCircle2 className="w-3 h-3" /> SENT
                            </span>
                          ) : entry.status === 'failed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]">
                              <AlertTriangle className="w-3 h-3" /> FAILED ({entry.retryCount}x)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">
                              <Clock className="w-3 h-3" /> PENDING
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectLog(entry)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                              title="Lihat Payload JSON"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {entry.status !== 'sent' && (
                              <button
                                type="button"
                                disabled={retryingLogId === entry.id}
                                onClick={() => handleRetryLog(entry)}
                                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Send className="w-3 h-3" />
                                <span>{retryingLogId === entry.id ? 'Mengirim...' : 'Kirim Ulang'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={page}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={pageSize}
              pageSizeOptions={[...DEFAULT_PAGE_SIZE_OPTIONS]}
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
              isLoading={isLoading}
              itemLabel="log SATUSEHAT"
            />
          </div>
        </div>
      )}

      {/* TAB 2: SINKRON IHS PASIEN */}
      {subTab === 'lookup' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
                placeholder="Cari Pasien di Supabase (Nama / NIK 16 Digit / No. RM)..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              Menampilkan maks. 25 hasil server per pencarian (total 5.300+ aman tanpa lag)
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                <tr>
                  <th className="p-3">No. RM</th>
                  <th className="p-3">Nama &amp; NIK</th>
                  <th className="p-3">IHS Number SATUSEHAT</th>
                  <th className="p-3 text-center">Sinkronisasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLookupLoading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      Mencari pasien di Supabase...
                    </td>
                  </tr>
                ) : displayedLookupPatients.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                      Pasien tidak ditemukan.
                    </td>
                  </tr>
                ) : (
                  displayedLookupPatients.map((p) => {
                    const key = p.dbId || p.id;
                    const busy = syncingPatientKey === key;
                    return (
                      <tr key={key} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-sky-700">{p.noRm || p.id}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{p.name}</div>
                          <div className="font-mono text-[10px] text-slate-500">NIK: {p.nik || '-'}</div>
                        </td>
                        <td className="p-3 font-mono">
                          {p.ihsNumber ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                              {p.ihsNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Belum tersinkronisasi</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleSyncPatientIhs(p)}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Activity className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                            <span>{busy ? 'Mencari IHS...' : 'Cek / Sync IHS via NIK'}</span>
                          </button>
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

      {/* TAB 3: SQL MIGRASI & DEPLOY GUIDE (APJ / Owner Only) */}
      {isOwnerAdmin && subTab === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                <Code className="w-4 h-4 text-sky-600" />
                <span>1. Skrip SQL Migrasi Supabase (`pasien` + `satusehat_logs`)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_SATUSEHAT_SQL_SCHEMA);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2000);
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Tersalin' : 'Salin SQL'}</span>
              </button>
            </div>
            <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-[11px] font-mono overflow-x-auto max-h-96">
              {SUPABASE_SATUSEHAT_SQL_SCHEMA}
            </pre>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                <Terminal className="w-4 h-4 text-emerald-600" />
                <span>2. Setup Supabase Secrets &amp; Deploy Edge Function</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(SATUSEHAT_CLI_DEPLOY_GUIDE);
                  setCopiedCli(true);
                  setTimeout(() => setCopiedCli(false), 2000);
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
              >
                {copiedCli ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCli ? 'Tersalin' : 'Salin Perintah'}</span>
              </button>
            </div>
            <pre className="bg-slate-900 text-sky-300 p-3 rounded-xl text-[11px] font-mono overflow-x-auto">
              {SATUSEHAT_CLI_DEPLOY_GUIDE}
            </pre>
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-[11px] text-sky-900 space-y-1">
              <p className="font-bold">Lokasi Berkas di Proyek:</p>
              <ul className="list-disc list-inside space-y-0.5 text-sky-800">
                <li>SQL Migrasi: <code>supabase/migrations/20261117_satusehat_integration.sql</code></li>
                <li>Edge Function (Deno): <code>supabase/functions/satusehat-sync/index.ts</code></li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Log JSON Modal */}
      {inspectLog && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider">
                Detail Payload FHIR · {inspectLog.entityType} ({inspectLog.localRecordId})
              </h3>
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-700 block mb-1">Request Payload:</span>
                <pre className="bg-slate-900 text-amber-300 p-3 rounded-xl text-[11px] font-mono overflow-x-auto max-h-52">
                  {JSON.stringify(inspectLog.requestPayload || {}, null, 2)}
                </pre>
              </div>
              <div>
                <span className="font-bold text-slate-700 block mb-1">Response / Error:</span>
                <pre className="bg-slate-900 text-emerald-300 p-3 rounded-xl text-[11px] font-mono overflow-x-auto max-h-52">
                  {JSON.stringify(
                    inspectLog.responsePayload || { error: inspectLog.errorMessage || 'Menunggu respons' },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
