import { demoGetItem, demoSetItem, isDemoMode } from './demoSandbox';
import {
  getSupabaseConfig,
  fetchAllPatientsFromSupabase,
  deduplicatePatients
} from './supabaseClient';
import { Patient } from '../types';

export const BACKUPS_FOLDER_NAME = 'Backups';
export const AUTO_BACKUP_CONFIG_KEY = 'latisha_auto_backup_config';
export const AUTO_BACKUP_META_INDEX_KEY = 'latisha_auto_backup_meta_index';
export const AUTO_BACKUP_UPDATED_EVENT = 'latisha_auto_backup_updated';

export const SYSTEM_BACKUP_STORAGE_KEYS: string[] = [
  'latisha_medicines',
  'latisha_patients',
  'latisha_queue',
  'latisha_online_registrations',
  'latisha_rme_records',
  'latisha_prescriptions',
  'latisha_transactions',
  'latisha_purchase_invoices',
  'latisha_purchase_returns',
  'latisha_stock_mutations',
  'latisha_stock_opname_records',
  'latisha_transfers',
  'latisha_audit_logs',
  'latisha_fee_config',
  'latisha_fee_ledger',
  'latisha_payroll_overtime_config',
  'latisha_mitra',
  'latisha_mitra_orders',
  'latisha_suppliers',
  'latisha_branches',
  'latisha_staff',
  'latisha_role_permissions',
  'latisha_schedules',
  'latisha_staff_attendance',
  'latisha_lab_records',
  'latisha_morbidity_reports',
  'latisha_sales_discounts',
  'latisha_promo_ads',
  'latisha_marketing_campaigns',
  'latisha_portal_activity_logs',
  'latisha_cashier_shifts',
  'latisha_icd10_list',
  'latisha_pharmacy_profile',
  'latisha_apj_profile',
  'latisha_dpj_profile'
];

export type BackupStorageBackend = 'opfs' | 'indexeddb';
export type BackupTriggerKind = 'auto-daily-login' | 'manual-storage';

export interface AutoBackupConfig {
  enabled: boolean;
  folderName: string;
  retentionDays: number; // 0 = unlimited
  includeSupabasePatients: boolean;
  lastAutoBackupDate: string | null; // local YYYY-MM-DD
  lastAutoBackupAt: string | null; // ISO string
  lastAutoBackupFileName: string | null;
  lastAutoBackupBy: string | null;
  lastAutoBackupStatus: 'idle' | 'success' | 'error';
  lastAutoBackupError: string | null;
}

export interface BackupPayloadSummary {
  tableCount: number;
  medicineCount: number;
  patientCount: number;
  transactionCount: number;
  rmeCount: number;
  supabasePatientsIncluded: boolean;
}

export interface StoredBackupFileMeta {
  fileName: string;
  folderPath: string; // e.g. "Backups/LatishaFarma_AutoBackup_2026-11-21_051611.json"
  createdAt: string;
  backupDate: string; // local YYYY-MM-DD
  sizeBytes: number;
  trigger: BackupTriggerKind;
  triggeredBy: string;
  backend: BackupStorageBackend;
  isDemo?: boolean;
  summary: BackupPayloadSummary;
}

export interface AutoBackupExecutionResult {
  executed: boolean;
  skippedReason?: 'disabled' | 'already-done-today' | 'in-flight';
  success: boolean;
  file?: StoredBackupFileMeta;
  error?: string;
}

export interface SystemBackupDump {
  app: string;
  schemaVersion: string;
  exportedAt: string;
  backupDate: string;
  trigger: BackupTriggerKind;
  triggeredBy: string;
  storageFolder: string;
  isDemoSandbox: boolean;
  summary: BackupPayloadSummary;
  tables: Record<string, any>;
}

// Local minimal OPFS interfaces so TypeScript compiles cleanly regardless of DOM lib version
interface OpfsWritableStream {
  write: (data: string | Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface OpfsFileHandle {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<OpfsWritableStream>;
}

interface OpfsDirectoryHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<OpfsDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<OpfsFileHandle>;
  removeEntry: (name: string) => Promise<void>;
  entries?: () => AsyncIterableIterator<[string, OpfsFileHandle | OpfsDirectoryHandle]>;
  values?: () => AsyncIterableIterator<OpfsFileHandle | OpfsDirectoryHandle>;
}

interface IndexedDbBackupRecord {
  path: string; // "Backups/<fileName>"
  folder: string; // "Backups"
  fileName: string;
  content: string;
  meta: StoredBackupFileMeta;
}

const IDB_NAME = 'LatishaFarmaBrowserStorage';
const IDB_VERSION = 1;
const IDB_STORE_NAME = 'backups_folder';

let autoBackupInFlightPromise: Promise<AutoBackupExecutionResult> | null = null;

export const getLocalDateYMD = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getLocalTimeHMS = (date: Date = new Date()): string => {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}${mm}${ss}`;
};

export const formatBackupBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const DEFAULT_AUTO_BACKUP_CONFIG: AutoBackupConfig = {
  enabled: true,
  folderName: BACKUPS_FOLDER_NAME,
  retentionDays: 14,
  includeSupabasePatients: true,
  lastAutoBackupDate: null,
  lastAutoBackupAt: null,
  lastAutoBackupFileName: null,
  lastAutoBackupBy: null,
  lastAutoBackupStatus: 'idle',
  lastAutoBackupError: null
};

export const getAutoBackupConfig = (): AutoBackupConfig => {
  try {
    const raw = demoGetItem(AUTO_BACKUP_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_AUTO_BACKUP_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_AUTO_BACKUP_CONFIG,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      folderName: BACKUPS_FOLDER_NAME
    };
  } catch {
    return { ...DEFAULT_AUTO_BACKUP_CONFIG };
  }
};

export const saveAutoBackupConfig = (patch: Partial<AutoBackupConfig>): AutoBackupConfig => {
  const current = getAutoBackupConfig();
  const next: AutoBackupConfig = {
    ...current,
    ...patch,
    folderName: BACKUPS_FOLDER_NAME
  };
  try {
    demoSetItem(AUTO_BACKUP_CONFIG_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors on config write
  }
  dispatchAutoBackupUpdated();
  return next;
};

const dispatchAutoBackupUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTO_BACKUP_UPDATED_EVENT));
  }
};

const readMetaIndex = (): Record<string, StoredBackupFileMeta> => {
  try {
    const raw = demoGetItem(AUTO_BACKUP_META_INDEX_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeMetaIndex = (index: Record<string, StoredBackupFileMeta>) => {
  try {
    demoSetItem(AUTO_BACKUP_META_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Ignore storage quota issues for lightweight metadata cache
  }
};

// ---------------- OPFS Helpers (Browser Storage Folder: Backups/) ----------------

const getOpfsBackupsDirectory = async (): Promise<OpfsDirectoryHandle | null> => {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof (navigator.storage as any).getDirectory !== 'function'
    ) {
      return null;
    }
    const root: OpfsDirectoryHandle = await (navigator.storage as any).getDirectory();
    if (!root || typeof root.getDirectoryHandle !== 'function') return null;
    const backupsDir = await root.getDirectoryHandle(BACKUPS_FOLDER_NAME, { create: true });
    return backupsDir;
  } catch {
    return null;
  }
};

const writeFileToOpfs = async (fileName: string, content: string): Promise<boolean> => {
  try {
    const dir = await getOpfsBackupsDirectory();
    if (!dir) return false;
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    if (typeof fileHandle.createWritable !== 'function') return false;
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch {
    return false;
  }
};

const readFileFromOpfs = async (fileName: string): Promise<string | null> => {
  try {
    const dir = await getOpfsBackupsDirectory();
    if (!dir) return null;
    const fileHandle = await dir.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
};

const deleteFileFromOpfs = async (fileName: string): Promise<boolean> => {
  try {
    const dir = await getOpfsBackupsDirectory();
    if (!dir) return false;
    await dir.removeEntry(fileName);
    return true;
  } catch {
    return false;
  }
};

const listFilesFromOpfs = async (): Promise<
  Array<{ fileName: string; sizeBytes: number; lastModified: number }> | null
> => {
  try {
    const dir = await getOpfsBackupsDirectory();
    if (!dir) return null;
    const items: Array<{ fileName: string; sizeBytes: number; lastModified: number }> = [];

    if (typeof dir.values === 'function') {
      for await (const handle of dir.values()) {
        if (handle.kind === 'file' && handle.name.toLowerCase().endsWith('.json')) {
          const file = await (handle as OpfsFileHandle).getFile();
          items.push({
            fileName: handle.name,
            sizeBytes: file.size,
            lastModified: file.lastModified || Date.now()
          });
        }
      }
      return items;
    }

    if (typeof dir.entries === 'function') {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file' && name.toLowerCase().endsWith('.json')) {
          const file = await (handle as OpfsFileHandle).getFile();
          items.push({
            fileName: name,
            sizeBytes: file.size,
            lastModified: file.lastModified || Date.now()
          });
        }
      }
      return items;
    }

    return null;
  } catch {
    return null;
  }
};

// ---------------- IndexedDB Fallback Helpers (Virtual Folder: Backups/) ----------------

const openBackupIndexedDb = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME, { keyPath: 'path' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const writeRecordToIndexedDb = async (record: IndexedDbBackupRecord): Promise<boolean> => {
  const db = await openBackupIndexedDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
};

const readRecordFromIndexedDb = async (fileName: string): Promise<IndexedDbBackupRecord | null> => {
  const db = await openBackupIndexedDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.get(`${BACKUPS_FOLDER_NAME}/${fileName}`);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as IndexedDbBackupRecord) || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
};

const deleteRecordFromIndexedDb = async (fileName: string): Promise<boolean> => {
  const db = await openBackupIndexedDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      store.delete(`${BACKUPS_FOLDER_NAME}/${fileName}`);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
};

const listRecordsFromIndexedDb = async (): Promise<IndexedDbBackupRecord[]> => {
  const db = await openBackupIndexedDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const rows = Array.isArray(req.result) ? (req.result as IndexedDbBackupRecord[]) : [];
        resolve(rows.filter((r) => r && r.folder === BACKUPS_FOLDER_NAME));
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
};

// ---------------- System JSON Dump Builder ----------------

export const buildSystemBackupPayload = async (options: {
  trigger: BackupTriggerKind;
  triggeredBy: string;
  includeSupabasePatients?: boolean;
  onProgress?: (text: string) => void;
}): Promise<SystemBackupDump> => {
  const now = new Date();
  const backupDate = getLocalDateYMD(now);
  const demo = isDemoMode();
  const tables: Record<string, any> = {};

  options.onProgress?.('Mengumpulkan data sistem...');

  SYSTEM_BACKUP_STORAGE_KEYS.forEach((key) => {
    const raw = demoGetItem(key);
    if (raw !== null && raw !== undefined) {
      try {
        tables[key] = JSON.parse(raw);
      } catch {
        tables[key] = raw;
      }
    }
  });

  // Ensure local patients are deduplicated cleanly
  if (Array.isArray(tables.latisha_patients)) {
    tables.latisha_patients = deduplicatePatients(tables.latisha_patients as Patient[]);
  }

  let supabasePatientsIncluded = false;
  const supaConf = getSupabaseConfig();
  const canFetchSupabase = Boolean(
    options.includeSupabasePatients !== false && !demo && supaConf.url && supaConf.key
  );

  if (canFetchSupabase) {
    try {
      options.onProgress?.('Mengambil data pasien Supabase...');
      const remotePatientsRes = await fetchAllPatientsFromSupabase({
        onProgress: (loaded) => {
          options.onProgress?.(`Mengunduh pasien (${loaded.toLocaleString('id-ID')})...`);
        }
      });
      if (remotePatientsRes.data && remotePatientsRes.data.length > 0) {
        tables.latisha_patients = deduplicatePatients(remotePatientsRes.data);
        supabasePatientsIncluded = true;
      }
    } catch {
      // Fall back gracefully to local patient cache so auto-backup still succeeds offline
    }
  }

  const summary: BackupPayloadSummary = {
    tableCount: Object.keys(tables).length,
    medicineCount: Array.isArray(tables.latisha_medicines) ? tables.latisha_medicines.length : 0,
    patientCount: Array.isArray(tables.latisha_patients) ? tables.latisha_patients.length : 0,
    transactionCount: Array.isArray(tables.latisha_transactions)
      ? tables.latisha_transactions.length
      : 0,
    rmeCount: Array.isArray(tables.latisha_rme_records) ? tables.latisha_rme_records.length : 0,
    supabasePatientsIncluded
  };

  return {
    app: 'Latisha Farma Enterprise',
    schemaVersion: '8.3.0',
    exportedAt: now.toISOString(),
    backupDate,
    trigger: options.trigger,
    triggeredBy: options.triggeredBy || 'APJ / Owner',
    storageFolder: BACKUPS_FOLDER_NAME,
    isDemoSandbox: demo,
    summary,
    tables
  };
};

// ---------------- Core Storage Operations in Folder 'Backups' ----------------

const persistBackupToFolder = async (
  dump: SystemBackupDump,
  fileName: string
): Promise<StoredBackupFileMeta> => {
  const jsonContent = JSON.stringify(dump);
  const sizeBytes = new Blob([jsonContent]).size;
  const folderPath = `${BACKUPS_FOLDER_NAME}/${fileName}`;

  let backend: BackupStorageBackend = 'opfs';
  const opfsWritten = await writeFileToOpfs(fileName, jsonContent);

  if (!opfsWritten) {
    backend = 'indexeddb';
    const metaDraft: StoredBackupFileMeta = {
      fileName,
      folderPath,
      createdAt: dump.exportedAt,
      backupDate: dump.backupDate,
      sizeBytes,
      trigger: dump.trigger,
      triggeredBy: dump.triggeredBy,
      backend,
      isDemo: dump.isDemoSandbox,
      summary: dump.summary
    };
    const idbWritten = await writeRecordToIndexedDb({
      path: folderPath,
      folder: BACKUPS_FOLDER_NAME,
      fileName,
      content: jsonContent,
      meta: metaDraft
    });
    if (!idbWritten) {
      throw new Error(
        'Browser storage (OPFS & IndexedDB) tidak tersedia atau kuota penyimpanan penuh.'
      );
    }
  }

  const meta: StoredBackupFileMeta = {
    fileName,
    folderPath,
    createdAt: dump.exportedAt,
    backupDate: dump.backupDate,
    sizeBytes,
    trigger: dump.trigger,
    triggeredBy: dump.triggeredBy,
    backend,
    isDemo: dump.isDemoSandbox,
    summary: dump.summary
  };

  const index = readMetaIndex();
  index[fileName] = meta;
  writeMetaIndex(index);

  dispatchAutoBackupUpdated();
  return meta;
};

export const listBackupsInBrowserFolder = async (): Promise<{
  backend: BackupStorageBackend;
  folderName: string;
  files: StoredBackupFileMeta[];
  totalBytes: number;
}> => {
  const metaIndex = readMetaIndex();
  const byFileName = new Map<string, StoredBackupFileMeta>();
  let detectedBackend: BackupStorageBackend = 'indexeddb';

  // 1. Check OPFS Backups/ directory
  const opfsFiles = await listFilesFromOpfs();
  if (opfsFiles !== null) {
    detectedBackend = 'opfs';
    for (const item of opfsFiles) {
      const cached = metaIndex[item.fileName];
      const dateMatch = item.fileName.match(/(\d{4}-\d{2}-\d{2})/);
      const isAuto = item.fileName.includes('AutoBackup');
      byFileName.set(item.fileName, {
        fileName: item.fileName,
        folderPath: `${BACKUPS_FOLDER_NAME}/${item.fileName}`,
        createdAt: cached?.createdAt || new Date(item.lastModified).toISOString(),
        backupDate:
          cached?.backupDate ||
          (dateMatch ? dateMatch[1] : getLocalDateYMD(new Date(item.lastModified))),
        sizeBytes: item.sizeBytes || cached?.sizeBytes || 0,
        trigger: cached?.trigger || (isAuto ? 'auto-daily-login' : 'manual-storage'),
        triggeredBy: cached?.triggeredBy || 'APJ / Owner',
        backend: 'opfs',
        isDemo: cached?.isDemo,
        summary: cached?.summary || {
          tableCount: 0,
          medicineCount: 0,
          patientCount: 0,
          transactionCount: 0,
          rmeCount: 0,
          supabasePatientsIncluded: false
        }
      });
    }
  }

  // 2. Also include any files stored in IndexedDB fallback (e.g. if environment changed)
  const idbRecords = await listRecordsFromIndexedDb();
  for (const rec of idbRecords) {
    if (!byFileName.has(rec.fileName)) {
      byFileName.set(rec.fileName, {
        ...rec.meta,
        folderPath: `${BACKUPS_FOLDER_NAME}/${rec.fileName}`,
        backend: 'indexeddb'
      });
    }
  }

  const files = Array.from(byFileName.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const totalBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);

  return {
    backend: detectedBackend,
    folderName: BACKUPS_FOLDER_NAME,
    files,
    totalBytes
  };
};

export const readBackupFileFromBrowserFolder = async (fileName: string): Promise<string> => {
  const fromOpfs = await readFileFromOpfs(fileName);
  if (fromOpfs !== null) return fromOpfs;

  const fromIdb = await readRecordFromIndexedDb(fileName);
  if (fromIdb?.content) return fromIdb.content;

  throw new Error(`Berkas "${BACKUPS_FOLDER_NAME}/${fileName}" tidak ditemukan di browser storage.`);
};

export const downloadStoredBackupFile = async (fileName: string): Promise<void> => {
  const content = await readBackupFileFromBrowserFolder(fileName);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const deleteStoredBackupFile = async (fileName: string): Promise<void> => {
  await deleteFileFromOpfs(fileName);
  await deleteRecordFromIndexedDb(fileName);
  const index = readMetaIndex();
  if (index[fileName]) {
    delete index[fileName];
    writeMetaIndex(index);
  }
  dispatchAutoBackupUpdated();
};

const pruneOldAutoBackups = async (retentionDays: number): Promise<void> => {
  if (!retentionDays || retentionDays <= 0) return;
  try {
    const { files } = await listBackupsInBrowserFolder();
    const autoFiles = files.filter((f) => f.trigger === 'auto-daily-login');
    if (autoFiles.length <= retentionDays) return;

    const toRemove = autoFiles.slice(retentionDays);
    for (const stale of toRemove) {
      await deleteStoredBackupFile(stale.fileName);
    }
  } catch {
    // Non-fatal cleanup error
  }
};

// ---------------- Public Backup Runners ----------------

/**
 * Menjalankan jadwal backup otomatis harian saat admin (APJ / Owner) login pertama kali di hari tersebut.
 * Mengekspor seluruh data sistem ke format JSON dan menyimpannya ke folder 'Backups' pada browser storage.
 */
export const runAutoDailyBackupIfNeeded = (options: {
  triggeredBy: string;
  force?: boolean;
  onProgress?: (text: string) => void;
}): Promise<AutoBackupExecutionResult> => {
  if (autoBackupInFlightPromise) {
    return autoBackupInFlightPromise;
  }

  const task = (async (): Promise<AutoBackupExecutionResult> => {
    const config = getAutoBackupConfig();
    const todayYMD = getLocalDateYMD();

    if (!options.force && !config.enabled) {
      return { executed: false, skippedReason: 'disabled', success: true };
    }

    if (!options.force && config.lastAutoBackupDate === todayYMD) {
      return { executed: false, skippedReason: 'already-done-today', success: true };
    }

    try {
      const dump = await buildSystemBackupPayload({
        trigger: 'auto-daily-login',
        triggeredBy: options.triggeredBy || 'APJ / Owner',
        includeSupabasePatients: config.includeSupabasePatients,
        onProgress: options.onProgress
      });

      const fileName = `LatishaFarma_AutoBackup_${dump.backupDate}_${getLocalTimeHMS()}.json`;
      options.onProgress?.(`Menyimpan ke folder ${BACKUPS_FOLDER_NAME}/...`);
      const fileMeta = await persistBackupToFolder(dump, fileName);

      saveAutoBackupConfig({
        lastAutoBackupDate: dump.backupDate,
        lastAutoBackupAt: dump.exportedAt,
        lastAutoBackupFileName: fileMeta.fileName,
        lastAutoBackupBy: dump.triggeredBy,
        lastAutoBackupStatus: 'success',
        lastAutoBackupError: null
      });

      await pruneOldAutoBackups(config.retentionDays);

      return {
        executed: true,
        success: true,
        file: fileMeta
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      saveAutoBackupConfig({
        lastAutoBackupStatus: 'error',
        lastAutoBackupError: errorMessage
      });
      return {
        executed: true,
        success: false,
        error: errorMessage
      };
    }
  })();

  autoBackupInFlightPromise = task.finally(() => {
    autoBackupInFlightPromise = null;
  });

  return autoBackupInFlightPromise;
};

/**
 * Menyimpan backup manual ke folder 'Backups' pada browser storage kapan saja.
 */
export const saveManualBackupToBrowserFolder = async (options: {
  triggeredBy: string;
  includeSupabasePatients?: boolean;
  onProgress?: (text: string) => void;
}): Promise<StoredBackupFileMeta> => {
  const dump = await buildSystemBackupPayload({
    trigger: 'manual-storage',
    triggeredBy: options.triggeredBy || 'APJ / Owner',
    includeSupabasePatients: options.includeSupabasePatients ?? true,
    onProgress: options.onProgress
  });

  const fileName = `LatishaFarma_ManualBackup_${dump.backupDate}_${getLocalTimeHMS()}.json`;
  options.onProgress?.(`Menyimpan ke folder ${BACKUPS_FOLDER_NAME}/...`);
  return await persistBackupToFolder(dump, fileName);
};
