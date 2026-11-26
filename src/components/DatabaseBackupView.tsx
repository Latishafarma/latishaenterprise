import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database,
  HardDriveDownload,
  HardDriveUpload,
  CheckCircle,
  AlertTriangle,
  FileJson,
  ShieldCheck,
  RefreshCw,
  Layers,
  FileText,
  Activity,
  Boxes,
  Users,
  Receipt,
  CalendarClock,
  FolderArchive,
  Download,
  RotateCcw,
  Trash2,
  Play,
  Clock,
  HardDrive,
  X
} from 'lucide-react';
import { demoGetItem, demoSetItem, isDemoMode } from '../utils/demoSandbox';
import {
  getSupabaseConfig,
  getSupabaseClient,
  fetchPatientsTotalCountFromSupabase,
  upsertPatientsBatchToSupabase,
  subscribePatientsRealtime,
  deduplicatePatients
} from '../utils/supabaseClient';
import {
  BACKUPS_FOLDER_NAME,
  AUTO_BACKUP_UPDATED_EVENT,
  AutoBackupConfig,
  BackupStorageBackend,
  StoredBackupFileMeta,
  getAutoBackupConfig,
  saveAutoBackupConfig,
  buildSystemBackupPayload,
  listBackupsInBrowserFolder,
  readBackupFileFromBrowserFolder,
  downloadStoredBackupFile,
  deleteStoredBackupFile,
  saveManualBackupToBrowserFolder,
  runAutoDailyBackupIfNeeded,
  getLocalDateYMD,
  formatBackupBytes
} from '../utils/autoBackupStorage';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { Patient } from '../types';

interface DatabaseBackupViewProps {
  onDatabaseRestored?: () => void;
  currentUserName?: string;
  onAuditLog?: (module: string, action: string) => void;
}

export const DatabaseBackupView: React.FC<DatabaseBackupViewProps> = ({
  onDatabaseRestored,
  currentUserName = 'APJ / Owner',
  onAuditLog
}) => {
  const isOwnerAdmin = useIsOwnerAdmin();

  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
  }>({ type: 'idle', message: '' });
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [transferProgressText, setTransferProgressText] = useState<string>('');
  const [supabasePatientCount, setSupabasePatientCount] = useState<number | null>(null);
  const [isSyncingPatientCount, setIsSyncingPatientCount] = useState(false);
  const isTransferringRef = useRef<boolean>(false);
  const realtimeCountTimerRef = useRef<number | null>(null);

  // Auto-backup schedule & browser storage 'Backups' folder state
  const [autoConfig, setAutoConfig] = useState<AutoBackupConfig>(() => getAutoBackupConfig());
  const [storedBackups, setStoredBackups] = useState<StoredBackupFileMeta[]>([]);
  const [storageBackend, setStorageBackend] = useState<BackupStorageBackend>('opfs');
  const [totalFolderBytes, setTotalFolderBytes] = useState<number>(0);
  const [isLoadingFolder, setIsLoadingFolder] = useState<boolean>(false);
  const [isRunningFolderBackup, setIsRunningFolderBackup] = useState<boolean>(false);
  const [folderProgressText, setFolderProgressText] = useState<string>('');
  const [busyFileName, setBusyFileName] = useState<string | null>(null);
  const [confirmRestoreFile, setConfirmRestoreFile] = useState<StoredBackupFileMeta | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<StoredBackupFileMeta | null>(null);

  const supabaseConf = getSupabaseConfig();
  const isSupabasePatientActive = Boolean(
    !isDemoMode() && supabaseConf.url && supabaseConf.key
  );

  const refreshBackupsFolder = useCallback(async () => {
    setIsLoadingFolder(true);
    try {
      setAutoConfig(getAutoBackupConfig());
      const result = await listBackupsInBrowserFolder();
      setStorageBackend(result.backend);
      setStoredBackups(result.files);
      setTotalFolderBytes(result.totalBytes);
    } finally {
      setIsLoadingFolder(false);
    }
  }, []);

  useEffect(() => {
    refreshBackupsFolder();
    const handleUpdated = () => {
      refreshBackupsFolder();
    };
    window.addEventListener(AUTO_BACKUP_UPDATED_EVENT, handleUpdated);
    return () => {
      window.removeEventListener(AUTO_BACKUP_UPDATED_EVENT, handleUpdated);
    };
  }, [refreshBackupsFolder]);

  // Quick stats from localStorage
  const getStorageCount = (key: string) => {
    try {
      const data = demoGetItem(key);
      if (!data) return 0;
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed.length : 1;
    } catch {
      return 0;
    }
  };

  const getLocalDedupedPatientCount = () => {
    try {
      const data = demoGetItem('latisha_patients');
      if (!data) return 0;
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? deduplicatePatients(parsed).length : 0;
    } catch {
      return 0;
    }
  };

  const loadSupabasePatientCount = useCallback(async () => {
    if (!isSupabasePatientActive) {
      setSupabasePatientCount(null);
      return;
    }
    setIsSyncingPatientCount(true);
    try {
      const res = await fetchPatientsTotalCountFromSupabase();
      if (typeof res.count === 'number') {
        setSupabasePatientCount(res.count);
      }
    } finally {
      setIsSyncingPatientCount(false);
    }
  }, [isSupabasePatientActive]);

  const scheduleRealtimeCountRefresh = useCallback(() => {
    if (isTransferringRef.current) return;
    if (realtimeCountTimerRef.current !== null) {
      window.clearTimeout(realtimeCountTimerRef.current);
    }
    realtimeCountTimerRef.current = window.setTimeout(() => {
      realtimeCountTimerRef.current = null;
      if (!isTransferringRef.current) {
        loadSupabasePatientCount();
      }
    }, 800);
  }, [loadSupabasePatientCount]);

  useEffect(() => {
    loadSupabasePatientCount();
    if (!isSupabasePatientActive) return;

    const channel = subscribePatientsRealtime(
      () => scheduleRealtimeCountRefresh(),
      () => scheduleRealtimeCountRefresh(),
      () => scheduleRealtimeCountRefresh()
    );

    return () => {
      if (realtimeCountTimerRef.current !== null) {
        window.clearTimeout(realtimeCountTimerRef.current);
        realtimeCountTimerRef.current = null;
      }
      if (channel) {
        const client = getSupabaseClient();
        if (client) {
          client.removeChannel(channel);
        } else if (typeof channel.unsubscribe === 'function') {
          channel.unsubscribe().catch(() => {});
        }
      }
    };
  }, [isSupabasePatientActive, loadSupabasePatientCount, scheduleRealtimeCountRefresh]);

  const medicineCount = getStorageCount('latisha_medicines');
  const localPatientCount = getLocalDedupedPatientCount();
  const patientCount =
    isSupabasePatientActive && supabasePatientCount !== null
      ? supabasePatientCount
      : localPatientCount;
  const transactionCount = getStorageCount('latisha_transactions');
  const invoiceCount = getStorageCount('latisha_purchase_invoices');
  const rmeCount = getStorageCount('latisha_rme_records');
  const queueCount = getStorageCount('latisha_queue');

  // Shared restore engine (used by both file upload & 1-click restore from 'Backups' folder)
  const restoreDatabaseFromJsonText = async (content: string, sourceLabel: string) => {
    setIsRestoring(true);
    isTransferringRef.current = true;
    setTransferProgressText('Memvalidasi berkas JSON...');
    try {
      const parsed = JSON.parse(content);
      const tables = parsed.tables || parsed;

      let restoredKeys = 0;
      let restoredSupabasePatients = 0;

      for (const key of Object.keys(tables)) {
        if (key.startsWith('latisha_')) {
          if (key === 'latisha_patients' && Array.isArray(tables[key])) {
            const dedupedPatients = deduplicatePatients(tables[key] as Patient[]);
            try {
              demoSetItem('latisha_patients', JSON.stringify(dedupedPatients.slice(0, 200)));
            } catch {
              // Ignore localStorage cache quota overflow for 5000+ records
            }
            if (isSupabasePatientActive && dedupedPatients.length > 0) {
              const syncRes = await upsertPatientsBatchToSupabase(dedupedPatients, {
                onProgress: (synced, total) => {
                  setTransferProgressText(
                    `Menyinkronkan pasien (${synced.toLocaleString('id-ID')}/${total.toLocaleString('id-ID')})...`
                  );
                }
              });
              if (!syncRes.success && syncRes.error) {
                throw new Error(`Gagal menyinkronkan data pasien ke Supabase: ${syncRes.error}`);
              }
              restoredSupabasePatients = syncRes.count;
              setSupabasePatientCount(syncRes.count);
            }
            restoredKeys++;
          } else {
            const val = typeof tables[key] === 'object' ? JSON.stringify(tables[key]) : tables[key];
            demoSetItem(key, val);
            restoredKeys++;
          }
        }
      }

      if (restoredKeys === 0) {
        throw new Error('Berkas JSON tidak memuat tabel data Latisha Farma yang valid.');
      }

      onAuditLog?.(
        'Restore Database',
        `Pemulihan database berhasil dari ${sourceLabel} (${restoredKeys} tabel dipulihkan).`
      );

      setImportStatus({
        type: 'success',
        message:
          restoredSupabasePatients > 0
            ? `Pemulihan dari ${sourceLabel} berhasil! ${restoredKeys} tabel data dipulihkan dan ${restoredSupabasePatients.toLocaleString('id-ID')} data pasien disinkronkan ke Supabase.`
            : `Pemulihan dari ${sourceLabel} berhasil! Sebanyak ${restoredKeys} tabel data telah dipulihkan ke sistem.`
      });

      if (onDatabaseRestored) {
        onDatabaseRestored();
      } else {
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (err) {
      setImportStatus({
        type: 'error',
        message:
          'Gagal memulihkan database. Pastikan berkas adalah file .json valid: ' +
          (err instanceof Error ? err.message : String(err))
      });
    } finally {
      isTransferringRef.current = false;
      setTransferProgressText('');
      setIsRestoring(false);
    }
  };

  // Export full database as downloadable JSON file
  const handleExportDatabase = async () => {
    setIsExporting(true);
    isTransferringRef.current = true;
    setTransferProgressText('Menyiapkan cadangan...');
    try {
      const databaseDump = await buildSystemBackupPayload({
        trigger: 'manual-storage',
        triggeredBy: currentUserName,
        includeSupabasePatients: true,
        onProgress: (text) => setTransferProgressText(text)
      });

      if (databaseDump.summary.supabasePatientsIncluded) {
        setSupabasePatientCount(databaseDump.summary.patientCount);
      }

      setTransferProgressText('Mengemas berkas JSON...');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const blob = new Blob([JSON.stringify(databaseDump)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = getLocalDateYMD();
      link.href = url;
      link.download = `LatishaFarma_Database_Backup_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onAuditLog?.(
        'Backup Database',
        `Ekspor manual cadangan JSON (${databaseDump.summary.tableCount} tabel) berhasil diunduh ke perangkat.`
      );

      setImportStatus({
        type: 'success',
        message: databaseDump.summary.supabasePatientsIncluded
          ? `Cadangan database (.json) berhasil diunduh beserta ${databaseDump.summary.patientCount.toLocaleString('id-ID')} data pasien sinkron Supabase.`
          : 'Cadangan database (.json) berhasil diunduh ke perangkat Anda.'
      });
    } catch (err) {
      setImportStatus({
        type: 'error',
        message:
          'Gagal membuat cadangan database: ' +
          (err instanceof Error ? err.message : String(err))
      });
    } finally {
      isTransferringRef.current = false;
      setTransferProgressText('');
      setIsExporting(false);
    }
  };

  // Import / Restore database from local JSON file upload
  const handleImportDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsRestoring(true);
    setTransferProgressText('Membaca berkas JSON...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = (event.target?.result as string) || '';
      await restoreDatabaseFromJsonText(content, `berkas "${file.name}"`);
    };
    reader.onerror = () => {
      setIsRestoring(false);
      setTransferProgressText('');
      setImportStatus({
        type: 'error',
        message: 'Gagal membaca berkas dari perangkat.'
      });
    };
    reader.readAsText(file);
  };

  // Auto-backup schedule configuration handlers
  const handleToggleAutoBackup = () => {
    const updated = saveAutoBackupConfig({ enabled: !autoConfig.enabled });
    setAutoConfig(updated);
    onAuditLog?.(
      'Auto Backup Harian',
      updated.enabled
        ? `Jadwal backup otomatis harian ke folder "${BACKUPS_FOLDER_NAME}/" diaktifkan.`
        : `Jadwal backup otomatis harian ke folder "${BACKUPS_FOLDER_NAME}/" dinonaktifkan.`
    );
  };

  const handleRetentionChange = (days: number) => {
    const updated = saveAutoBackupConfig({ retentionDays: days });
    setAutoConfig(updated);
  };

  const handleToggleIncludeSupabase = () => {
    const updated = saveAutoBackupConfig({
      includeSupabasePatients: !autoConfig.includeSupabasePatients
    });
    setAutoConfig(updated);
  };

  // Run immediate backup saved directly into Browser Storage folder 'Backups'
  const handleSaveSnapshotToBrowserFolder = async (asDailyAuto: boolean) => {
    setIsRunningFolderBackup(true);
    isTransferringRef.current = true;
    setFolderProgressText('Memulai backup ke folder Backups...');
    try {
      if (asDailyAuto) {
        const res = await runAutoDailyBackupIfNeeded({
          triggeredBy: currentUserName,
          force: true,
          onProgress: (text) => setFolderProgressText(text)
        });
        if (!res.success || !res.file) {
          throw new Error(res.error || 'Gagal menjalankan jadwal backup harian.');
        }
        onAuditLog?.(
          'Auto Backup Harian',
          `Backup harian berhasil disimpan ke "${res.file.folderPath}" (${formatBackupBytes(res.file.sizeBytes)}).`
        );
        setImportStatus({
          type: 'success',
          message: `Backup harian berhasil disimpan ke Browser Storage folder "${res.file.folderPath}" (${formatBackupBytes(res.file.sizeBytes)}, ${res.file.summary.tableCount} tabel).`
        });
      } else {
        const fileMeta = await saveManualBackupToBrowserFolder({
          triggeredBy: currentUserName,
          includeSupabasePatients: autoConfig.includeSupabasePatients,
          onProgress: (text) => setFolderProgressText(text)
        });
        onAuditLog?.(
          'Backup Browser Storage',
          `Backup manual JSON disimpan ke folder "${fileMeta.folderPath}" (${formatBackupBytes(fileMeta.sizeBytes)}).`
        );
        setImportStatus({
          type: 'success',
          message: `Snapshot JSON berhasil disimpan ke Browser Storage folder "${fileMeta.folderPath}" (${formatBackupBytes(fileMeta.sizeBytes)}).`
        });
      }
      await refreshBackupsFolder();
    } catch (err) {
      setImportStatus({
        type: 'error',
        message:
          'Gagal menyimpan cadangan ke folder Backups: ' +
          (err instanceof Error ? err.message : String(err))
      });
    } finally {
      isTransferringRef.current = false;
      setFolderProgressText('');
      setIsRunningFolderBackup(false);
    }
  };

  const handleDownloadFromFolder = async (file: StoredBackupFileMeta) => {
    setBusyFileName(file.fileName);
    try {
      await downloadStoredBackupFile(file.fileName);
    } catch (err) {
      setImportStatus({
        type: 'error',
        message:
          'Gagal mengunduh berkas dari folder Backups: ' +
          (err instanceof Error ? err.message : String(err))
      });
    } finally {
      setBusyFileName(null);
    }
  };

  const handleConfirmRestoreFromFolder = async () => {
    if (!confirmRestoreFile) return;
    const target = confirmRestoreFile;
    setConfirmRestoreFile(null);
    setBusyFileName(target.fileName);
    try {
      const content = await readBackupFileFromBrowserFolder(target.fileName);
      await restoreDatabaseFromJsonText(content, `folder "${target.folderPath}"`);
    } catch (err) {
      setImportStatus({
        type: 'error',
        message:
          'Gagal membaca berkas cadangan: ' +
          (err instanceof Error ? err.message : String(err))
      });
    } finally {
      setBusyFileName(null);
    }
  };

  const handleConfirmDeleteFromFolder = async () => {
    if (!confirmDeleteFile) return;
    const target = confirmDeleteFile;
    setConfirmDeleteFile(null);
    setBusyFileName(target.fileName);
    try {
      await deleteStoredBackupFile(target.fileName);
      onAuditLog?.(
        'Backup Browser Storage',
        `Menghapus berkas cadangan "${target.folderPath}" dari browser storage.`
      );
      await refreshBackupsFolder();
      setImportStatus({
        type: 'success',
        message: `Berkas "${target.folderPath}" telah dihapus dari browser storage.`
      });
    } catch (err) {
      setImportStatus({
        type: 'error',
        message:
          'Gagal menghapus berkas cadangan: ' +
          (err instanceof Error ? err.message : String(err))
      });
    } finally {
      setBusyFileName(null);
    }
  };

  const todayYMD = getLocalDateYMD();
  const isBackedUpToday = autoConfig.lastAutoBackupDate === todayYMD;

  const formatDateTimeID = (isoString: string | null) => {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Database className="w-5 h-5" />
            </span>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">
              Export, Import &amp; Jadwal Backup Otomatis
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Pusat manajemen pencadangan (backup) otomatis harian ke folder <strong className="font-mono text-slate-700">{BACKUPS_FOLDER_NAME}/</strong> pada browser storage serta ekspor/pemulihan basis data Latisha Farma dalam format JSON mandiri.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 border text-[11px] font-bold rounded-xl flex items-center gap-1.5 ${
              isDemoMode()
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <ShieldCheck
              className={`w-3.5 h-3.5 ${isDemoMode() ? 'text-amber-600' : 'text-emerald-600'}`}
            />
            {isDemoMode() ? 'Database Sandbox (Mode Demo Terisolasi)' : 'Sistem Database Lokal Aktif'}
          </span>
        </div>
      </div>

      {/* Status Alert */}
      {importStatus.message && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 font-bold text-xs shadow-xs animate-in fade-in ${
            importStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3">
            {importStatus.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="leading-relaxed">{importStatus.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportStatus({ type: 'idle', message: '' })}
            className="p-1 rounded-lg hover:bg-black/5 transition cursor-pointer shrink-0"
            aria-label="Tutup pesan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Database Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <Boxes className="w-4 h-4 text-sky-600" />
            <span>Master Obat</span>
          </div>
          <div className="text-xl font-black text-slate-900">{medicineCount}</div>
          <span className="text-[10px] text-slate-400">Item obat &amp; alkes</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between gap-1 text-slate-500 text-xs font-semibold mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">Pasien Terdaftar</span>
            </div>
            {isSupabasePatientActive && (
              <button
                type="button"
                onClick={loadSupabasePatientCount}
                disabled={isSyncingPatientCount}
                title="Sinkronkan ulang jumlah pasien dari Supabase"
                className="p-1 rounded-lg hover:bg-slate-100 text-emerald-600 transition cursor-pointer shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingPatientCount ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
          <div className="text-xl font-black text-slate-900 tabular-nums">
            {isSyncingPatientCount && supabasePatientCount === null
              ? '...'
              : patientCount.toLocaleString('id-ID')}
          </div>
          <span className="text-[10px] text-slate-400">
            {isSupabasePatientActive && supabasePatientCount !== null
              ? 'Berkas No. RM · Sinkron Supabase'
              : 'Berkas No. RM'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <Receipt className="w-4 h-4 text-violet-600" />
            <span>Transaksi POS</span>
          </div>
          <div className="text-xl font-black text-slate-900">{transactionCount}</div>
          <span className="text-[10px] text-slate-400">Riwayat penjualan</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <FileText className="w-4 h-4 text-teal-600" />
            <span>Faktur PBF</span>
          </div>
          <div className="text-xl font-black text-slate-900">{invoiceCount}</div>
          <span className="text-[10px] text-slate-400">Pembelian logistik</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <Activity className="w-4 h-4 text-rose-600" />
            <span>Rekam Medis</span>
          </div>
          <div className="text-xl font-black text-slate-900">{rmeCount}</div>
          <span className="text-[10px] text-slate-400">Catatan SOAP dokter</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <Layers className="w-4 h-4 text-amber-600" />
            <span>Antrean Aktif</span>
          </div>
          <div className="text-xl font-black text-slate-900">{queueCount}</div>
          <span className="text-[10px] text-slate-400">Pasien berkunjung</span>
        </div>
      </div>

      {/* SECTION: JADWAL BACKUP OTOMATIS HARIAN & FOLDER 'Backups' BROWSER STORAGE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Top Config Header */}
        <div className="p-6 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-emerald-500/20 text-emerald-300 rounded-2xl border border-emerald-400/30 shrink-0">
              <CalendarClock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-black text-base tracking-tight">
                  Jadwal Backup Otomatis Harian (Browser Storage)
                </h4>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                    !autoConfig.enabled
                      ? 'bg-slate-800 text-slate-300 border-slate-700'
                      : isBackedUpToday
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                      : 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                  }`}
                >
                  {!autoConfig.enabled
                    ? 'Jadwal Nonaktif'
                    : isBackedUpToday
                    ? `Sudah Backup Hari Ini (${todayYMD})`
                    : 'Menunggu Backup Hari Ini'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-2xl">
                Mengekspor seluruh data sistem ke format <strong className="text-white">JSON</strong> dan menyimpannya otomatis ke folder{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono font-bold">
                  {BACKUPS_FOLDER_NAME}/
                </code>{' '}
                pada browser storage setiap hari saat akun <strong className="text-white">APJ / Owner</strong> login pertama kali.
              </p>
            </div>
          </div>

          {/* Master Toggle */}
          <div className="flex items-center gap-3 shrink-0 bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-700">
            <div className="text-right">
              <div className="text-[11px] font-black text-white">
                {autoConfig.enabled ? 'Auto-Backup Aktif' : 'Auto-Backup Nonaktif'}
              </div>
              <div className="text-[10px] text-slate-400">
                1x/hari saat login pertama APJ / Owner
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoConfig.enabled}
              disabled={!isOwnerAdmin}
              onClick={handleToggleAutoBackup}
              title={
                isOwnerAdmin
                  ? 'Aktifkan atau nonaktifkan jadwal backup otomatis harian'
                  : 'Hanya akun APJ / Owner yang dapat mengubah jadwal backup otomatis'
              }
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                autoConfig.enabled ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                  autoConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Controls & Status Bar */}
        <div className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Status Terakhir */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-sky-600" />
              <span>Backup Otomatis Terakhir</span>
            </div>
            <div className="font-black text-slate-900 text-xs">
              {autoConfig.lastAutoBackupAt ? formatDateTimeID(autoConfig.lastAutoBackupAt) : 'Belum pernah dijalankan'}
            </div>
            <div className="text-[11px] text-slate-500 truncate" title={autoConfig.lastAutoBackupFileName || ''}>
              {autoConfig.lastAutoBackupFileName
                ? `${BACKUPS_FOLDER_NAME}/${autoConfig.lastAutoBackupFileName}`
                : 'Akan berjalan otomatis saat login pertama hari ini'}
            </div>
            {autoConfig.lastAutoBackupError && (
              <p className="text-[10px] text-rose-600 font-semibold">
                Error terakhir: {autoConfig.lastAutoBackupError}
              </p>
            )}
          </div>

          {/* Pengaturan Retensi & Opsi */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="backup-retention-select"
                className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
                <span>Retensi Otomatis</span>
              </label>
              <select
                id="backup-retention-select"
                value={autoConfig.retentionDays}
                disabled={!isOwnerAdmin}
                onChange={(e) => handleRetentionChange(Number(e.target.value))}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
              >
                <option value={7}>Simpan 7 hari terakhir</option>
                <option value={14}>Simpan 14 hari terakhir</option>
                <option value={30}>Simpan 30 hari terakhir</option>
                <option value={60}>Simpan 60 hari terakhir</option>
                <option value={0}>Simpan Tanpa Batas</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-700 font-semibold cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={autoConfig.includeSupabasePatients}
                disabled={!isOwnerAdmin}
                onChange={handleToggleIncludeSupabase}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Sertakan seluruh data pasien Supabase saat online</span>
            </label>
            <div className="text-[10px] text-slate-400">
              Engine storage:{' '}
              <strong className="text-slate-600">
                {storageBackend === 'opfs'
                  ? 'Origin Private File System (OPFS)'
                  : 'IndexedDB Browser Storage'}
              </strong>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-500 uppercase tracking-wider">Folder {BACKUPS_FOLDER_NAME}/</span>
              <span className="font-mono font-bold text-slate-800">
                {storedBackups.length} berkas · {formatBackupBytes(totalFolderBytes)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSaveSnapshotToBrowserFolder(!isBackedUpToday)}
                disabled={isRunningFolderBackup || isRestoring}
                className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                {isRunningFolderBackup ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>
                  {isRunningFolderBackup && folderProgressText
                    ? folderProgressText
                    : !isBackedUpToday
                    ? 'Jalankan Backup Harian Sekarang'
                    : 'Simpan Snapshot ke Backups/'}
                </span>
              </button>
              <button
                type="button"
                onClick={refreshBackupsFolder}
                disabled={isLoadingFolder}
                title="Muat ulang isi folder Backups"
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFolder ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Folder 'Backups' Explorer Table */}
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-amber-600" />
              <h5 className="font-black text-slate-800 text-xs uppercase tracking-wider">
                Isi Folder Browser Storage: <span className="font-mono text-sky-700">{BACKUPS_FOLDER_NAME}/</span>
              </h5>
            </div>
            <span className="text-[11px] text-slate-500">
              Klik <strong>Unduh</strong> untuk menyimpan salinan ke komputer atau <strong>Pulihkan</strong> langsung dari browser storage.
            </span>
          </div>

          {storedBackups.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-8 text-center space-y-2.5">
              <FolderArchive className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">
                Folder <span className="font-mono">{BACKUPS_FOLDER_NAME}/</span> pada browser storage masih kosong.
              </p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Saat akun <strong>APJ / Owner</strong> login pertama kali setiap hari, sistem otomatis mengekspor seluruh data ke format JSON dan menyimpannya di sini. Anda juga dapat menjalankan backup sekarang.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nama Berkas JSON</th>
                    <th className="px-3 py-3">Jenis &amp; Pelaksana</th>
                    <th className="px-3 py-3">Ringkasan Data</th>
                    <th className="px-3 py-3 text-right">Ukuran</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {storedBackups.map((file) => {
                    const isRowBusy = busyFileName === file.fileName;
                    return (
                      <tr key={file.fileName} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            <FileJson className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="font-mono font-bold text-slate-900 text-[11px] break-all">
                                {file.fileName}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span>{formatDateTimeID(file.createdAt)}</span>
                                <span>·</span>
                                <span className="font-mono text-slate-400">{file.folderPath}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                file.trigger === 'auto-daily-login'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-sky-50 text-sky-700 border-sky-200'
                              }`}
                            >
                              {file.trigger === 'auto-daily-login'
                                ? 'Otomatis (Login Harian)'
                                : 'Manual Snapshot'}
                            </span>
                            {file.isDemo && (
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Demo
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Oleh: <strong className="text-slate-700">{file.triggeredBy}</strong>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-slate-600">
                          {file.summary.tableCount > 0 ? (
                            <div className="space-y-0.5">
                              <div>
                                <strong className="text-slate-800">{file.summary.tableCount}</strong> tabel ·{' '}
                                <strong className="text-slate-800">{file.summary.medicineCount}</strong> obat ·{' '}
                                <strong className="text-slate-800">
                                  {file.summary.patientCount.toLocaleString('id-ID')}
                                </strong>{' '}
                                pasien
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {file.summary.transactionCount} transaksi · {file.summary.rmeCount} e-RME
                                {file.summary.supabasePatientsIncluded ? ' · +Supabase' : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Arsip JSON Latisha Farma</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                          {formatBackupBytes(file.sizeBytes)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDownloadFromFolder(file)}
                              disabled={isRowBusy || isRestoring}
                              title="Unduh file JSON ke komputer"
                              className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Unduh</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRestoreFile(file)}
                              disabled={isRowBusy || isRestoring}
                              title="Pulihkan database dari berkas cadangan ini"
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Pulihkan</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFile(file)}
                              disabled={isRowBusy || isRestoring}
                              title="Hapus berkas cadangan dari folder Backups"
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* Main Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. EXPORT DATABASE */}
        <div className="bg-white p-6 rounded-3xl border-2 border-dashed border-sky-300 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center font-bold shadow-sm">
              <HardDriveDownload className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-slate-900 text-base">
                Export Cadangan Database (Unduh ke Perangkat)
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed mt-1">
                Unduh seluruh data operasional apotek (master obat, stok, kartu stok FEFO, penjualan POS, faktur pembelian PBF, retur, rekam medis SOAP, profil fasilitas, jadwal, dan daftar mitra) ke dalam berkas <strong className="text-slate-800">.json</strong> yang terstruktur rapi.
              </p>
            </div>

            <div className="p-3 bg-sky-50 rounded-2xl border border-sky-100 text-[11px] text-sky-950 space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-700" />
                Format Data Terstandar
              </span>
              <p className="text-sky-800 text-[10px]">
                Berkas cadangan dapat disimpan di flashdisk, cloud drive, atau komputer cadangan untuk antisipasi kehilangan data perangkat.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportDatabase}
            disabled={isExporting || isRestoring}
            className="w-full py-3 bg-sky-700 hover:bg-sky-800 text-white font-extrabold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer active:scale-98 disabled:opacity-50"
          >
            {isExporting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <HardDriveDownload className="w-4 h-4" />
            )}
            <span>
              {isExporting && transferProgressText
                ? transferProgressText
                : 'Download Cadangan Database (.json)'}
            </span>
          </button>
        </div>

        {/* 2. IMPORT DATABASE */}
        <div className="bg-white p-6 rounded-3xl border-2 border-dashed border-indigo-300 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-sm">
              <HardDriveUpload className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-slate-900 text-base">
                Import &amp; Pulihkan Database (Restore)
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed mt-1">
                Pulihkan seluruh data sistem dari berkas cadangan <strong className="text-slate-800">.json</strong> yang telah diekspor sebelumnya. Sistem akan memvalidasi keutuhan data dan memperbarui seluruh tabel lokal secara otomatis.
              </p>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-[11px] text-amber-950 space-y-1">
              <span className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Perhatian Sebelum Pemulihan
              </span>
              <p className="text-amber-800 text-[10px]">
                Proses pemulihan akan menimpa data yang sedang aktif dengan data yang ada pada file cadangan. Disarankan mengunduh cadangan terbaru sebelum melakukan restore.
              </p>
            </div>
          </div>

          <div>
            <label className="w-full py-3 bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer active:scale-98">
              {isRestoring ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <HardDriveUpload className="w-4 h-4" />
              )}
              <span>
                {isRestoring && transferProgressText
                  ? transferProgressText
                  : 'Pilih Berkas Cadangan (.json)'}
              </span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportDatabase}
                className="hidden"
                disabled={isRestoring}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Pedoman Pemeliharaan Database */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs text-xs space-y-3">
        <h5 className="font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
          <FileJson className="w-4 h-4 text-slate-600" />
          <span>Panduan Pengelolaan Cadangan Database Kefarmasian</span>
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-600">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <strong className="text-slate-800 block text-[11px]">1. Backup Otomatis Harian</strong>
            <p className="text-[11px] leading-relaxed">
              Setiap kali akun APJ / Owner login pertama kali di hari baru, sistem otomatis membuat arsip JSON di folder <span className="font-mono">{BACKUPS_FOLDER_NAME}/</span> browser storage.
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <strong className="text-slate-800 block text-[11px]">2. Penyimpanan Eksternal</strong>
            <p className="text-[11px] leading-relaxed">
              Unduh secara berkala file JSON dari folder <span className="font-mono">{BACKUPS_FOLDER_NAME}/</span> ke flashdisk atau cloud drive terpisah untuk antisipasi kerusakan perangkat.
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <strong className="text-slate-800 block text-[11px]">3. Keamanan Data Pasien</strong>
            <p className="text-[11px] leading-relaxed">
              Berkas cadangan memuat data rekam medis pasien yang bersifat rahasia kedokteran. Jaga kerahasiaan file cadangan sesuai Permenkes RME.
            </p>
          </div>
        </div>
      </div>

      {/* Inline Confirmation Modal: Restore from Folder 'Backups' */}
      {confirmRestoreFile && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-2xl shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">
                  Pulihkan Database dari Folder {BACKUPS_FOLDER_NAME}/?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Seluruh data aktif saat ini akan ditimpa dengan isi berkas cadangan:
                </p>
                <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800 break-all">
                  {confirmRestoreFile.folderPath}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Dibuat pada {formatDateTimeID(confirmRestoreFile.createdAt)} ({formatBackupBytes(confirmRestoreFile.sizeBytes)})
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRestoreFile(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRestoreFromFolder}
                className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs cursor-pointer transition shadow-sm"
              >
                Ya, Pulihkan Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Confirmation Modal: Delete from Folder 'Backups' */}
      {confirmDeleteFile && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-2xl shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">
                  Hapus Berkas Cadangan?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Berkas cadangan berikut akan dihapus permanen dari browser storage:
                </p>
                <div className="mt-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 font-mono text-[11px] text-rose-900 break-all">
                  {confirmDeleteFile.folderPath}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteFile(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteFromFolder}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs cursor-pointer transition shadow-sm"
              >
                Hapus Berkas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
