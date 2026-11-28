import React, { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Edit2,
  Trash2,
  AlertTriangle,
  Download,
  Upload,
  X,
  ShieldAlert,
  LayoutGrid,
  Table2,
  CheckCircle2,
  Smartphone,
  Lock,
  RefreshCw,
  Code,
  Database,
  AlertCircle,
  Copy,
  Check,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  RotateCcw,
  Palette,
  SlidersHorizontal,
  Camera,
  ScanBarcode
} from 'lucide-react';
import { Medicine, MedicineBatch, isOwnerAdminRole } from '../types';
import { getNormalizedBatches, resolvePrimaryBatchAndStock } from '../utils/batchHelper';
import { demoGetItem, demoSetItem } from '../utils/demoSandbox';
import {
  PRESCRIPTION_STATUS_COLOR_PALETTE,
  PRESCRIPTION_STATUS_UPDATED_EVENT,
  PrescriptionStatusColorKey,
  PrescriptionStatusConfig,
  getPrescriptionStatusConfigs,
  upsertPrescriptionStatusConfig,
  deletePrescriptionStatusConfig,
  resetPrescriptionStatusConfigs,
  getPrescriptionStatusColorTheme,
  getDefaultPrescriptionStatusSuggestion,
  getMedicinePrescriptionRequirement,
  classifyPrescriptionStatusLabel
} from '../utils/medicineRegulation';
import {
  SUPABASE_MEDICINES_SQL_SCHEMA,
  DEFAULT_MEDICINE_TABLE,
  getSupabaseConfig,
  setSupabaseConfig,
  fetchMedicinesPaginatedFromSupabase,
  fetchMedicineByBarcodeOrIdFromSupabase,
  isMedicineFormColumnMissingInSupabase
} from '../utils/supabaseClient';
import { PaginationControls, DEFAULT_PAGE_SIZE_OPTIONS } from './PaginationControls';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';
import { playBarcodeBeep } from '../utils/barcodeBeep';
const CameraBarcodeScannerModal = lazy(() =>
  import('./CameraBarcodeScannerModal').then((m) => ({ default: m.CameraBarcodeScannerModal }))
);

const PAGE_SIZE_OPTIONS = DEFAULT_PAGE_SIZE_OPTIONS;

const DEFAULT_MEDICINE_CATEGORIES = [
  'Obat Bebas',
  'Obat Bebas Terbatas',
  'Obat Keras',
  'Psikotropika',
  'Narkotika',
  'Prekursor',
  'OOT',
  'Alat Kesehatan',
  'Vitamin/Suplemen',
  'Makanan/Minuman',
  'Kosmetic',
  'Skincare',
  'Jamu/Herbal'
] as const;

const CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  'Obat Bebas': 'Obat Bebas',
  'Obat Bebas Terbatas': 'Obat Bebas Terbatas',
  'Obat Keras': 'Obat Keras',
  Psikotropika: 'Psikotropika',
  Narkotika: 'Narkotika',
  Prekursor: 'Prekursor',
  OOT: 'OOT (Obat-Obat Tertentu)',
  'Vitamin/Suplemen': 'Vitamin / Suplemen',
  'Makanan/Minuman': 'Makanan / Minuman',
  'Jamu/Herbal': 'Jamu / Herbal'
};

type MasterObatColumnKey =
  | 'aksi'
  | 'name'
  | 'barcode'
  | 'kekuatan'
  | 'bentukSediaan'
  | 'category'
  | 'kelas'
  | 'nappza'
  | 'statusResep'
  | 'satuan'
  | 'hna'
  | 'hpp'
  | 'sellPrice'
  | 'sellPriceKlinik'
  | 'sellPriceMitra'
  | 'batch'
  | 'rack'
  | 'stock';

const MASTER_OBAT_TABLE_COLUMNS: readonly {
  key: MasterObatColumnKey;
  label: string;
}[] = [
  { key: 'aksi', label: 'Aksi' },
  { key: 'name', label: 'Nama Produk' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'kekuatan', label: 'Zat Aktif & Kekuatan' },
  { key: 'bentukSediaan', label: 'Bentuk Sediaan' },
  { key: 'category', label: 'Kategori / Golongan' },
  { key: 'kelas', label: 'Kelas Terapi' },
  { key: 'nappza', label: 'NAPPZA' },
  { key: 'statusResep', label: 'Status Resep' },
  { key: 'satuan', label: 'Satuan' },
  { key: 'hna', label: 'HNA' },
  { key: 'hpp', label: 'HPP' },
  { key: 'sellPrice', label: 'Jual Reguler' },
  { key: 'sellPriceKlinik', label: 'Jual Klinik' },
  { key: 'sellPriceMitra', label: 'Jual Mitra' },
  { key: 'batch', label: 'Batch & Exp (FEFO)' },
  { key: 'rack', label: 'Rak / Lokasi' },
  { key: 'stock', label: 'Stock' }
] as const;

const DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS: MasterObatColumnKey[] =
  MASTER_OBAT_TABLE_COLUMNS.map((c) => c.key);

const MASTER_OBAT_VISIBLE_COLUMNS_STORAGE_KEY = 'latisha_master_obat_visible_columns';
const MASTER_OBAT_KNOWN_COLUMNS_STORAGE_KEY = 'latisha_master_obat_known_columns';

const COMMON_BENTUK_SEDIAAN_OPTIONS = [
  'Tablet',
  'Kaplet',
  'Kapsul',
  'Sirup',
  'Suspensi',
  'Drop / Tetes',
  'Salep',
  'Krim',
  'Gel',
  'Injeksi',
  'Infus',
  'Suppositoria',
  'Inhaler',
  'Spray',
  'Serbuk / Sachet',
  'Plester / Patch',
  'Alat Kesehatan'
] as const;

interface InventoryViewProps {
  medicines: Medicine[];
  activeRole?: string;
  onAddMedicine: (med: Medicine, options?: { recordInitialStock?: boolean }) => void | Promise<any>;
  onUpdateMedicine: (med: Medicine, options?: { recordInitialStock?: boolean }) => void | Promise<any>;
  onDeleteMedicine: (id: string) => void | Promise<any>;
  onClearMedicines?: () => void;
  onSyncSupabase?: () => Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  needsTableSetup?: boolean;
  isDemoSandbox?: boolean;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  medicines,
  activeRole = 'APJ / Owner',
  onAddMedicine,
  onUpdateMedicine,
  onDeleteMedicine,
  onClearMedicines,
  onSyncSupabase,
  needsTableSetup = false,
  isDemoSandbox = false
}) => {
  const isSuperAdmin = isOwnerAdminRole(activeRole);
  const [isInitialStockEnabled, setIsInitialStockEnabled] = useState<boolean>(() => {
    const saved = demoGetItem('latisha_master_stok_awal_enabled');
    if (saved === null) return true;
    return saved === 'true';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('SEMUA');
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const saved = demoGetItem('latisha_custom_medicine_categories');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        : [];
    } catch {
      return [];
    }
  });
  const [hiddenCategories, setHiddenCategories] = useState<string[]>(() => {
    try {
      const saved = demoGetItem('latisha_hidden_medicine_categories');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        : [];
    } catch {
      return [];
    }
  });
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [categoryValidationError, setCategoryValidationError] = useState('');
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [statusResepConfigs, setStatusResepConfigs] = useState<PrescriptionStatusConfig[]>(() =>
    getPrescriptionStatusConfigs()
  );
  const [isStatusResepDropdownOpen, setIsStatusResepDropdownOpen] = useState(false);
  const [statusResepSearchQuery, setStatusResepSearchQuery] = useState('');
  const statusResepDropdownRef = useRef<HTMLDivElement>(null);
  const statusResepManuallyEditedRef = useRef<boolean>(false);
  const [isStatusResepModalOpen, setIsStatusResepModalOpen] = useState(false);
  const [statusResepForm, setStatusResepForm] = useState<{
    id?: string;
    previousName?: string;
    name: string;
    requiresRx: boolean;
    requiresOriginalRx: boolean;
    color: PrescriptionStatusColorKey;
  }>({
    name: '',
    requiresRx: false,
    requiresOriginalRx: false,
    color: 'emerald'
  });
  const [statusResepFormError, setStatusResepFormError] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('SEMUA');
  const [viewLayout, setViewLayout] = useState<'auto' | 'table' | 'cards'>('auto');
  const [visibleColumns, setVisibleColumns] = useState<MasterObatColumnKey[]>(() => {
    try {
      const saved = demoGetItem(MASTER_OBAT_VISIBLE_COLUMNS_STORAGE_KEY);
      const validSet = new Set<string>(DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS);
      if (!saved) {
        try {
          demoSetItem(
            MASTER_OBAT_KNOWN_COLUMNS_STORAGE_KEY,
            JSON.stringify(DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS)
          );
        } catch {}
        return DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS;
      }
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS;
      const sanitized = parsed.filter(
        (k): k is MasterObatColumnKey => typeof k === 'string' && validSet.has(k)
      );
      const knownRaw = demoGetItem(MASTER_OBAT_KNOWN_COLUMNS_STORAGE_KEY);
      let knownSet: Set<string>;
      if (knownRaw) {
        try {
          const parsedKnown = JSON.parse(knownRaw);
          knownSet = Array.isArray(parsedKnown)
            ? new Set(parsedKnown.filter((k): k is string => typeof k === 'string'))
            : new Set<string>();
        } catch {
          knownSet = new Set<string>();
        }
      } else {
        // Legacy saved state prior to adding 'barcode' and 'rack'
        knownSet = new Set(
          DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS.filter((k) => k !== 'barcode' && k !== 'rack')
        );
      }
      const newlyIntroduced = DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS.filter(
        (k) => !knownSet.has(k)
      );
      if (newlyIntroduced.length > 0) {
        try {
          demoSetItem(
            MASTER_OBAT_KNOWN_COLUMNS_STORAGE_KEY,
            JSON.stringify(DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS)
          );
        } catch {}
        if (sanitized.length > 0) {
          const mergedSet = new Set<MasterObatColumnKey>([...sanitized, ...newlyIntroduced]);
          const ordered = DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS.filter((k) => mergedSet.has(k));
          try {
            demoSetItem(MASTER_OBAT_VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(ordered));
          } catch {}
          return ordered;
        }
      }
      return sanitized;
    } catch {
      return DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS;
    }
  });
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = Number(demoGetItem('latisha_master_obat_page_size'));
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(saved) ? saved : 25;
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<
    'name' | 'hpp' | 'sellPrice' | 'sellPriceKlinik' | 'sellPriceMitra' | 'stock' | null
  >(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTargetMed, setEditTargetMed] = useState<Medicine | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Medicine | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [medicineTableInput, setMedicineTableInput] = useState<string>(
    () => getSupabaseConfig().medicineTable || DEFAULT_MEDICINE_TABLE
  );
  const [serverMedicines, setServerMedicines] = useState<Medicine[]>([]);
  const [serverTotalCount, setServerTotalCount] = useState<number>(0);
  const [serverTotalPages, setServerTotalPages] = useState<number>(1);
  const [isServerLoading, setIsServerLoading] = useState<boolean>(false);
  const [serverRefreshTick, setServerRefreshTick] = useState<number>(0);
  const [inventoryScannerTarget, setInventoryScannerTarget] = useState<'search' | 'form' | null>(
    null
  );

  const supabaseConf = getSupabaseConfig();
  const useServerPagination = Boolean(
    supabaseConf.url && supabaseConf.key && !isDemoSandbox && !needsTableSetup
  );
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  const showBanner = (type: 'success' | 'error' | 'warning', message: string) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.message === message ? null : prev));
    }, 5500);
  };

  const triggerServerRefresh = useCallback(() => {
    setServerRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!isCategoryDropdownOpen) {
      setCategorySearchQuery('');
      return;
    }
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCategoryDropdownOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCategoryDropdownOpen]);

  useEffect(() => {
    if (!isColumnPickerOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        columnPickerRef.current &&
        !columnPickerRef.current.contains(event.target as Node)
      ) {
        setIsColumnPickerOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsColumnPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isColumnPickerOpen]);

  const visibleColumnsSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const visibleColumnCount = visibleColumnsSet.size;
  const isColVisible = useCallback(
    (key: MasterObatColumnKey) => visibleColumnsSet.has(key),
    [visibleColumnsSet]
  );

  const persistVisibleColumns = useCallback((next: MasterObatColumnKey[]) => {
    setVisibleColumns(next);
    try {
      demoSetItem(MASTER_OBAT_VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(next));
      demoSetItem(
        MASTER_OBAT_KNOWN_COLUMNS_STORAGE_KEY,
        JSON.stringify(DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS)
      );
    } catch {}
  }, []);

  const handleToggleColumn = useCallback(
    (key: MasterObatColumnKey) => {
      const nextSet = new Set(visibleColumns);
      if (nextSet.has(key)) {
        nextSet.delete(key);
      } else {
        nextSet.add(key);
      }
      const ordered = DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS.filter((colKey) => nextSet.has(colKey));
      persistVisibleColumns(ordered);
    },
    [visibleColumns, persistVisibleColumns]
  );

  const handleShowAllColumns = useCallback(() => {
    persistVisibleColumns([...DEFAULT_MASTER_OBAT_VISIBLE_COLUMNS]);
  }, [persistVisibleColumns]);

  const handleHideAllColumns = useCallback(() => {
    persistVisibleColumns([]);
  }, [persistVisibleColumns]);

  useEffect(() => {
    if (!isStatusResepDropdownOpen) {
      setStatusResepSearchQuery('');
      return;
    }
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        statusResepDropdownRef.current &&
        !statusResepDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStatusResepDropdownOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsStatusResepDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isStatusResepDropdownOpen]);

  const hiddenCategorySet = useMemo(
    () => new Set(hiddenCategories.map((c) => c.trim().toLowerCase()).filter(Boolean)),
    [hiddenCategories]
  );

  const allCategoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    const addOpt = (raw?: string) => {
      const val = String(raw || '').trim();
      if (!val) return;
      const key = val.toLowerCase();
      if (hiddenCategorySet.has(key)) return;
      if (!seen.has(key)) seen.set(key, val);
    };
    DEFAULT_MEDICINE_CATEGORIES.forEach(addOpt);
    customCategories.forEach(addOpt);
    medicines.forEach((m) => addOpt(m.category));
    serverMedicines.forEach((m) => addOpt(m.category));
    return Array.from(seen.values());
  }, [customCategories, hiddenCategorySet, medicines, serverMedicines]);

  const filteredCategoryOptions = useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    if (!q) return allCategoryOptions;
    return allCategoryOptions.filter((cat) => {
      const displayLabel = CATEGORY_DISPLAY_LABELS[cat] || cat;
      return cat.toLowerCase().includes(q) || displayLabel.toLowerCase().includes(q);
    });
  }, [allCategoryOptions, categorySearchQuery]);

  const handleConfirmAddCategory = useCallback(
    (overrideName?: string) => {
      const cleaned = (typeof overrideName === 'string' ? overrideName : newCategoryInput).trim();
      if (!cleaned) return;
      const lower = cleaned.toLowerCase();
      if (hiddenCategorySet.has(lower)) {
        setHiddenCategories((prev) => {
          const next = prev.filter((c) => c.trim().toLowerCase() !== lower);
          demoSetItem('latisha_hidden_medicine_categories', JSON.stringify(next));
          return next;
        });
      }
      const existingDefault = DEFAULT_MEDICINE_CATEGORIES.find(
        (d) => d.toLowerCase() === lower
      );
      const existingOpt = allCategoryOptions.find((opt) => opt.toLowerCase() === lower);
      const finalCat = existingDefault || existingOpt || cleaned;
      if (!existingDefault && !existingOpt) {
        setCustomCategories((prev) => {
          if (prev.some((c) => c.trim().toLowerCase() === lower)) return prev;
          const next = [...prev, finalCat];
          demoSetItem('latisha_custom_medicine_categories', JSON.stringify(next));
          return next;
        });
      }
      setForm((prev) => ({ ...prev, category: finalCat as Medicine['category'] }));
      setCategoryValidationError('');
      setCategorySearchQuery('');
      setNewCategoryInput('');
      setIsAddingCategory(false);
      setIsCategoryDropdownOpen(false);
    },
    [newCategoryInput, allCategoryOptions, hiddenCategorySet]
  );

  const handleDeleteCategoryOption = useCallback(
    (catToDelete: string) => {
      const lower = catToDelete.trim().toLowerCase();
      if (!lower) return;

      const remaining = allCategoryOptions.filter((opt) => opt.toLowerCase() !== lower);

      setCustomCategories((prev) => {
        const next = prev.filter((c) => c.trim().toLowerCase() !== lower);
        demoSetItem('latisha_custom_medicine_categories', JSON.stringify(next));
        return next;
      });

      setHiddenCategories((prev) => {
        if (prev.some((c) => c.trim().toLowerCase() === lower)) return prev;
        const next = [...prev, catToDelete.trim()];
        demoSetItem('latisha_hidden_medicine_categories', JSON.stringify(next));
        return next;
      });

      setForm((prev) => {
        if (String(prev.category || '').trim().toLowerCase() === lower) {
          return {
            ...prev,
            category: (remaining[0] || '') as Medicine['category']
          };
        }
        return prev;
      });

      if (categoryFilter.toLowerCase() === lower) {
        setCategoryFilter('SEMUA');
      }
    },
    [allCategoryOptions, categoryFilter]
  );

  useEffect(() => {
    const refreshConfigs = () => {
      setStatusResepConfigs(getPrescriptionStatusConfigs());
    };
    window.addEventListener(PRESCRIPTION_STATUS_UPDATED_EVENT, refreshConfigs);
    window.addEventListener('storage', refreshConfigs);
    return () => {
      window.removeEventListener(PRESCRIPTION_STATUS_UPDATED_EVENT, refreshConfigs);
      window.removeEventListener('storage', refreshConfigs);
    };
  }, []);

  const allStatusResepOptions = useMemo(() => {
    const seen = new Map<string, string>();
    const addOpt = (raw?: string) => {
      const val = String(raw || '').trim();
      if (!val) return;
      const key = val.toLowerCase();
      if (!seen.has(key)) seen.set(key, val);
    };
    statusResepConfigs.forEach((cfg) => addOpt(cfg.name));
    medicines.forEach((m) => addOpt(m.statusResep));
    serverMedicines.forEach((m) => addOpt(m.statusResep));
    return Array.from(seen.values());
  }, [statusResepConfigs, medicines, serverMedicines]);

  const filteredStatusResepOptions = useMemo(() => {
    const q = statusResepSearchQuery.trim().toLowerCase();
    if (!q) return allStatusResepOptions;
    return allStatusResepOptions.filter((opt) => opt.toLowerCase().includes(q));
  }, [allStatusResepOptions, statusResepSearchQuery]);

  const openAddStatusResepModal = useCallback((prefillName?: string) => {
    setIsStatusResepDropdownOpen(false);
    setStatusResepSearchQuery('');
    setStatusResepFormError('');
    setStatusResepForm({
      name: typeof prefillName === 'string' ? prefillName.trim() : '',
      requiresRx: false,
      requiresOriginalRx: false,
      color: 'emerald'
    });
    setIsStatusResepModalOpen(true);
  }, []);

  const openEditStatusResepModal = useCallback(
    (target: PrescriptionStatusConfig | string) => {
      setIsStatusResepDropdownOpen(false);
      setStatusResepSearchQuery('');
      setStatusResepFormError('');
      if (typeof target === 'string') {
        const matched = statusResepConfigs.find(
          (c) => c.name.trim().toLowerCase() === target.trim().toLowerCase()
        );
        if (matched) {
          setStatusResepForm({
            id: matched.id,
            previousName: matched.name,
            name: matched.name,
            requiresRx: Boolean(matched.requiresRx),
            requiresOriginalRx: Boolean(matched.requiresRx && matched.requiresOriginalRx),
            color: matched.color
          });
        } else {
          const inferred = classifyPrescriptionStatusLabel(target, statusResepConfigs);
          setStatusResepForm({
            previousName: target,
            name: target,
            requiresRx: inferred.requiresRx,
            requiresOriginalRx: inferred.requiresOriginalRx,
            color: inferred.color
          });
        }
      } else {
        setStatusResepForm({
          id: target.id,
          previousName: target.name,
          name: target.name,
          requiresRx: Boolean(target.requiresRx),
          requiresOriginalRx: Boolean(target.requiresRx && target.requiresOriginalRx),
          color: target.color
        });
      }
      setIsStatusResepModalOpen(true);
    },
    [statusResepConfigs]
  );

  const handleSaveStatusResepConfig = useCallback(() => {
    const cleanedName = statusResepForm.name.trim();
    if (!cleanedName) {
      setStatusResepFormError('Nama jenis status resep wajib diisi.');
      return;
    }

    const { configs, saved } = upsertPrescriptionStatusConfig({
      id: statusResepForm.id,
      previousName: statusResepForm.previousName,
      name: cleanedName,
      requiresRx: statusResepForm.requiresRx,
      requiresOriginalRx: statusResepForm.requiresRx && statusResepForm.requiresOriginalRx,
      color: statusResepForm.color
    });

    setStatusResepConfigs(configs);
    statusResepManuallyEditedRef.current = true;
    setForm((prev) => ({ ...prev, statusResep: saved.name }));
    setStatusResepFormError('');
    setIsStatusResepModalOpen(false);
  }, [statusResepForm]);

  const handleDeleteStatusResepOption = useCallback(
    (optToDelete: string) => {
      const lower = optToDelete.trim().toLowerCase();
      if (!lower) return;
      const nextConfigs = deletePrescriptionStatusConfig(optToDelete);
      setStatusResepConfigs(nextConfigs);

      if (
        statusResepForm.id &&
        statusResepForm.name.trim().toLowerCase() === lower
      ) {
        setStatusResepForm({
          name: '',
          requiresRx: false,
          requiresOriginalRx: false,
          color: 'emerald'
        });
      }

      setForm((prev) => {
        if (String(prev.statusResep || '').trim().toLowerCase() === lower) {
          return {
            ...prev,
            statusResep: nextConfigs[0]?.name || 'Tanpa Resep'
          };
        }
        return prev;
      });
    },
    [statusResepForm.id, statusResepForm.name]
  );

  const handleResetStatusResepConfigs = useCallback(() => {
    const defaults = resetPrescriptionStatusConfigs();
    setStatusResepConfigs(defaults);
    setStatusResepFormError('');
  }, []);

  const handleToggleSort = useCallback(
    (field: 'name' | 'hpp' | 'sellPrice' | 'sellPriceKlinik' | 'sellPriceMitra' | 'stock') => {
      if (sortBy === field) {
        if (sortOrder === 'asc') {
          setSortOrder('desc');
        } else {
          setSortBy(null);
          setSortOrder('asc');
        }
      } else {
        setSortBy(field);
        setSortOrder('asc');
      }
    },
    [sortBy, sortOrder]
  );

  const handleRunSupabaseSync = async () => {
    if (!onSyncSupabase) return;
    setIsSyncing(true);
    try {
      const res = await onSyncSupabase();
      if (res.isDemo) {
        showBanner(
          'warning',
          'Mode Demo / Sandbox aktif. Sinkronisasi ke Supabase produksi dinonaktifkan otomatis untuk isolasi data demo.'
        );
      } else if (res.success) {
        triggerServerRefresh();
        showBanner(
          'success',
          `Sinkronisasi 2-arah Master Obat berhasil! Total ${res.count ?? medicines.length} item obat tersinkron dengan tabel "${medicineTableInput || DEFAULT_MEDICINE_TABLE}".`
        );
      } else if (res.needsTableSetup) {
        showBanner(
          'warning',
          `Tabel "${medicineTableInput || DEFAULT_MEDICINE_TABLE}" belum dibuat di Supabase. Buka Skema SQL untuk setup.`
        );
      } else {
        showBanner('error', res.error || 'Gagal melakukan sinkronisasi Master Obat ke Supabase.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveTableName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSandbox) {
      showBanner('warning', 'Konfigurasi Supabase tidak dapat diubah saat Mode Demo Sandbox aktif.');
      return;
    }
    const cleaned = medicineTableInput.trim() || DEFAULT_MEDICINE_TABLE;
    setMedicineTableInput(cleaned);
    setSupabaseConfig({ medicineTable: cleaned });
    await handleRunSupabaseSync();
  };

  const handleCopySchema = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_MEDICINES_SQL_SCHEMA);
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2500);
    } catch {
      showBanner('warning', 'Gagal menyalin otomatis. Silakan blok dan salin teks SQL secara manual.');
    }
  };

  const handleToggleInitialStock = () => {
    if (!isSuperAdmin) {
      showBanner(
        'error',
        'Akses ditolak: Pengaturan ON/OFF Stok Awal hanya dapat diaktifkan atau dinonaktifkan oleh akun APJ / Owner.'
      );
      return;
    }
    const next = !isInitialStockEnabled;
    setIsInitialStockEnabled(next);
    demoSetItem('latisha_master_stok_awal_enabled', String(next));
    showBanner(
      'success',
      `Input Stok Awal pada Master Data Obat ${next ? 'DIAKTIFKAN (ON)' : 'DINONAKTIFKAN (OFF)'} oleh APJ / Owner.`
    );
  };

  const [form, setForm] = useState({
    name: '',
    barcode: '',
    category: '' as Medicine['category'],
    kelas: '',
    nappza: 'Non-NAPPZA',
    statusResep: 'Tanpa Resep',
    kekuatan: '',
    form: 'Tablet',
    satuanBesar: '',
    satuanKecil: '',
    rasioKonversi: 1,
    hnaBesar: 0,
    hppBesar: 0,
    hppKecil: 0,
    markupReguler: 100,
    sellPriceReguler: 0,
    markupKlinik: 100,
    sellPriceKlinik: 0,
    markupMitra: 25,
    sellPriceMitra: 0,
    minStock: 0,
    maxStock: 0,
    batchNo: '',
    stock: 0,
    expDate: '',
    batches: [] as MedicineBatch[],
    rack: '',
    supplier: ''
  });

  // Live HNA & HPP (+11% PPN)
  const hna = Number(form.hnaBesar) || 0;
  const ratio = Math.max(1, Number(form.rasioKonversi) || 1);
  const hppBesar = Number(form.hppBesar) || 0;
  const hppKecil = Number(form.hppKecil) || 0;

  const deriveHnaFromHppBesar = (safeHppBesar: number): number => {
    if (safeHppBesar <= 0) return 0;
    const intHna = Math.round(safeHppBesar / 1.11);
    return Math.round(intHna * 1.11) === safeHppBesar
      ? intHna
      : Math.round((safeHppBesar / 1.11) * 100) / 100;
  };

  // Bidirectional updates: HNA change recalculates HPP (+11% PPN) and tier selling prices
  const updateHna = (newHna: number) => {
    const safeHna = Math.max(0, newHna);
    const safeRatio = Math.max(1, Number(form.rasioKonversi) || 1);
    const newHppBesar = Math.round(safeHna * 1.11);
    const newHppKecil = Math.round(newHppBesar / safeRatio);
    setForm((prev) => ({
      ...prev,
      hnaBesar: safeHna,
      hppBesar: newHppBesar,
      hppKecil: newHppKecil,
      sellPriceReguler: Math.round(newHppKecil * (1 + (Number(prev.markupReguler) || 0) / 100)),
      sellPriceKlinik: Math.round(newHppKecil * (1 + (Number(prev.markupKlinik) || 0) / 100)),
      sellPriceMitra: Math.round(newHppKecil * (1 + (Number(prev.markupMitra) || 0) / 100))
    }));
  };

  // Manual HPP (Satuan Besar) input automatically adjusts HNA (selisih PPN 11%), HPP Kecil & tier prices
  const updateHppBesar = (newHppBesar: number) => {
    const safeHppBesar = Math.max(0, newHppBesar);
    const safeRatio = Math.max(1, Number(form.rasioKonversi) || 1);
    const derivedHna = deriveHnaFromHppBesar(safeHppBesar);
    const newHppKecil = Math.round(safeHppBesar / safeRatio);
    setForm((prev) => ({
      ...prev,
      hnaBesar: derivedHna,
      hppBesar: safeHppBesar,
      hppKecil: newHppKecil,
      sellPriceReguler: Math.round(newHppKecil * (1 + (Number(prev.markupReguler) || 0) / 100)),
      sellPriceKlinik: Math.round(newHppKecil * (1 + (Number(prev.markupKlinik) || 0) / 100)),
      sellPriceMitra: Math.round(newHppKecil * (1 + (Number(prev.markupMitra) || 0) / 100))
    }));
  };

  // Manual HPP (Satuan Kecil) input automatically adjusts HPP Besar, HNA (selisih PPN 11%) & tier prices
  const updateHppKecil = (newHppKecil: number) => {
    const safeHppKecil = Math.max(0, newHppKecil);
    const safeRatio = Math.max(1, Number(form.rasioKonversi) || 1);
    const derivedHppBesar = Math.round(safeHppKecil * safeRatio);
    const derivedHna = deriveHnaFromHppBesar(derivedHppBesar);
    setForm((prev) => ({
      ...prev,
      hnaBesar: derivedHna,
      hppBesar: derivedHppBesar,
      hppKecil: safeHppKecil,
      sellPriceReguler: Math.round(safeHppKecil * (1 + (Number(prev.markupReguler) || 0) / 100)),
      sellPriceKlinik: Math.round(safeHppKecil * (1 + (Number(prev.markupKlinik) || 0) / 100)),
      sellPriceMitra: Math.round(safeHppKecil * (1 + (Number(prev.markupMitra) || 0) / 100))
    }));
  };

  // Changing ratio updates small unit HPP and recalculates tier selling prices
  const updateRasio = (newRatio: number) => {
    const safeRatio = Math.max(1, newRatio);
    const currentHppBesar = Math.max(
      0,
      Number(form.hppBesar) || Math.round((Number(form.hnaBesar) || 0) * 1.11)
    );
    const newHppKecil = Math.round(currentHppBesar / safeRatio);
    setForm((prev) => ({
      ...prev,
      rasioKonversi: safeRatio,
      hppBesar: currentHppBesar,
      hppKecil: newHppKecil,
      sellPriceReguler: Math.round(newHppKecil * (1 + (Number(prev.markupReguler) || 0) / 100)),
      sellPriceKlinik: Math.round(newHppKecil * (1 + (Number(prev.markupKlinik) || 0) / 100)),
      sellPriceMitra: Math.round(newHppKecil * (1 + (Number(prev.markupMitra) || 0) / 100))
    }));
  };

  // Changing % Markup calculates Harga Jual: Harga Jual = HPP * (1 + markup/100)
  const handleMarkupChange = (tier: 'reguler' | 'klinik' | 'mitra', markupVal: number) => {
    const currentHppKecil = hppKecil;
    const newPrice = Math.round(currentHppKecil * (1 + markupVal / 100));

    if (tier === 'reguler') {
      setForm((prev) => ({ ...prev, markupReguler: markupVal, sellPriceReguler: newPrice }));
    } else if (tier === 'klinik') {
      setForm((prev) => ({ ...prev, markupKlinik: markupVal, sellPriceKlinik: newPrice }));
    } else {
      setForm((prev) => ({ ...prev, markupMitra: markupVal, sellPriceMitra: newPrice }));
    }
  };

  // Changing Harga Jual calculates % Markup: % Markup = ((Harga Jual - HPP) / HPP) * 100
  const handlePriceChange = (tier: 'reguler' | 'klinik' | 'mitra', priceVal: number) => {
    const currentHppKecil = hppKecil;
    let newMarkup = 0;
    if (currentHppKecil > 0) {
      newMarkup = Math.round(((priceVal - currentHppKecil) / currentHppKecil) * 1000) / 10;
    }

    if (tier === 'reguler') {
      setForm((prev) => ({ ...prev, sellPriceReguler: priceVal, markupReguler: newMarkup }));
    } else if (tier === 'klinik') {
      setForm((prev) => ({ ...prev, sellPriceKlinik: priceVal, markupKlinik: newMarkup }));
    } else {
      setForm((prev) => ({ ...prev, sellPriceMitra: priceVal, markupMitra: newMarkup }));
    }
  };

  // Debounce search input 300ms for efficient server-side .ilike() queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, categoryFilter, stockStatusFilter, sortBy, sortOrder]);

  // Server-Side Pagination & Search against Supabase `master_obat` (.range() + .ilike() + .order())
  useEffect(() => {
    if (!useServerPagination) return;

    let cancelled = false;
    setIsServerLoading(true);

    fetchMedicinesPaginatedFromSupabase({
      page: currentPage,
      pageSize,
      searchQuery: debouncedSearchTerm,
      categoryFilter,
      stockStatusFilter,
      sortBy,
      sortOrder
    })
      .then((res) => {
        if (cancelled) return;
        if (res.data) {
          setServerMedicines(res.data);
          setServerTotalCount(res.totalCount);
          setServerTotalPages(res.totalPages);
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
    stockStatusFilter,
    sortBy,
    sortOrder,
    serverRefreshTick
  ]);

  // Local fallback filter & pagination (Demo Sandbox / Supabase Offline)
  const localFilteredMedicines = useMemo(() => {
    if (useServerPagination) return [];
    const q = debouncedSearchTerm.toLowerCase();
    return medicines.filter((m) => {
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.batchNo.toLowerCase().includes(q) ||
        (m.batches && m.batches.some((b) => b.batchNo.toLowerCase().includes(q))) ||
        (m.kelas && m.kelas.toLowerCase().includes(q)) ||
        (m.nappza && m.nappza.toLowerCase().includes(q)) ||
        (m.statusResep && m.statusResep.toLowerCase().includes(q)) ||
        (m.kekuatan && m.kekuatan.toLowerCase().includes(q)) ||
        (m.form && m.form.toLowerCase().includes(q)) ||
        (m.rack && m.rack.toLowerCase().includes(q)) ||
        (m.barcode || '').toLowerCase().includes(q);

      const matchCat = categoryFilter === 'SEMUA' || m.category === categoryFilter;

      let matchStock = true;
      if (stockStatusFilter === 'MENIPIS') {
        matchStock = m.stock <= m.minStock;
      } else if (stockStatusFilter === 'EXP_NEAR') {
        const expTime = new Date(m.expDate).getTime();
        const threeMonthsFromNow = Date.now() + 90 * 86400000;
        matchStock = expTime <= threeMonthsFromNow;
      }

      return matchSearch && matchCat && matchStock;
    });
  }, [useServerPagination, medicines, debouncedSearchTerm, categoryFilter, stockStatusFilter]);

  const localSortedMedicines = useMemo(() => {
    if (useServerPagination || !sortBy) return localFilteredMedicines;
    const getEffectiveHpp = (m: Medicine) => {
      const medRatio = Math.max(1, m.rasioKonversi || 1);
      return Math.round((m.hnaBesar || ((m.hpp || 0) * medRatio) / 1.11) * 1.11);
    };
    const getEffectiveJualMitra = (m: Medicine) => {
      const medRatio = Math.max(1, m.rasioKonversi || 1);
      const effectiveHppBesar = getEffectiveHpp(m);
      const effectiveHppKecil = Math.round(effectiveHppBesar / medRatio);
      const isMitraAlreadyBesar =
        medRatio > 1 &&
        (m.sellPriceMitra || 0) >= effectiveHppBesar * 0.75 &&
        (m.sellPriceMitra || 0) >
          effectiveHppKecil * (1 + ((m.markupMitra ?? 25) / 100)) * medRatio * 0.6;
      return isMitraAlreadyBesar
        ? Number(m.sellPriceMitra) || 0
        : Math.round((Number(m.sellPriceMitra) || 0) * medRatio);
    };
    const dir = sortOrder === 'desc' ? -1 : 1;
    return [...localFilteredMedicines].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }) * dir;
      }
      if (sortBy === 'hpp') {
        return (getEffectiveHpp(a) - getEffectiveHpp(b)) * dir;
      }
      if (sortBy === 'sellPrice') {
        return ((Number(a.sellPrice) || 0) - (Number(b.sellPrice) || 0)) * dir;
      }
      if (sortBy === 'sellPriceKlinik') {
        return ((Number(a.sellPriceKlinik) || 0) - (Number(b.sellPriceKlinik) || 0)) * dir;
      }
      if (sortBy === 'sellPriceMitra') {
        return (getEffectiveJualMitra(a) - getEffectiveJualMitra(b)) * dir;
      }
      return ((Number(a.stock) || 0) - (Number(b.stock) || 0)) * dir;
    });
  }, [useServerPagination, localFilteredMedicines, sortBy, sortOrder]);

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    demoSetItem('latisha_master_obat_page_size', String(nextSize));
    setCurrentPage(1);
  };

  const totalFilteredItems = useServerPagination ? serverTotalCount : localSortedMedicines.length;
  const totalPages = useServerPagination
    ? serverTotalPages
    : Math.max(1, Math.ceil(localSortedMedicines.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, totalFilteredItems);

  const paginatedMedicines = useMemo(() => {
    if (useServerPagination) return serverMedicines;
    return localSortedMedicines.slice(pageStartIndex, pageEndIndex);
  }, [useServerPagination, serverMedicines, localSortedMedicines, pageStartIndex, pageEndIndex]);

  const handleOpenAdd = () => {
    setEditId(null);
    setEditTargetMed(null);
    setIsCategoryDropdownOpen(false);
    setCategorySearchQuery('');
    setCategoryValidationError('');
    setIsAddingCategory(false);
    setNewCategoryInput('');
    setIsStatusResepDropdownOpen(false);
    setStatusResepSearchQuery('');
    setIsStatusResepModalOpen(false);
    setStatusResepFormError('');
    statusResepManuallyEditedRef.current = false;
    setForm({
      name: '',
      barcode: '',
      category: '' as Medicine['category'],
      kelas: '',
      nappza: 'Non-NAPPZA',
      statusResep:
        statusResepConfigs.find((c) => !c.requiresRx)?.name ||
        statusResepConfigs[0]?.name ||
        'Tanpa Resep',
      kekuatan: '',
      form: 'Tablet',
      satuanBesar: '',
      satuanKecil: '',
      rasioKonversi: 1,
      hnaBesar: 0,
      hppBesar: 0,
      hppKecil: 0,
      markupReguler: 100,
      sellPriceReguler: 0,
      markupKlinik: 100,
      sellPriceKlinik: 0,
      markupMitra: 25,
      sellPriceMitra: 0,
      minStock: 0,
      maxStock: 0,
      batchNo: '',
      stock: 0,
      expDate: '',
      batches: [{ id: `B-${Date.now()}-1`, batchNo: '', expDate: '', stock: 0 }],
      rack: '',
      supplier: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m: Medicine) => {
    setEditId(m.id);
    setEditTargetMed(m);
    setIsCategoryDropdownOpen(false);
    setCategorySearchQuery('');
    setCategoryValidationError('');
    setIsAddingCategory(false);
    setNewCategoryInput('');
    setIsStatusResepDropdownOpen(false);
    setStatusResepSearchQuery('');
    setIsStatusResepModalOpen(false);
    setStatusResepFormError('');
    statusResepManuallyEditedRef.current = Boolean(String(m.statusResep || '').trim());
    const medRatio = Math.max(1, m.rasioKonversi || 1);
    const medHna = m.hnaBesar || Math.round(((m.hpp || 0) * medRatio) / 1.11);
    const hppBesarFromMed = Math.round(medHna * 1.11);
    const hpp = Math.round(hppBesarFromMed / medRatio);

    const calcMarkup = (price: number, baseHpp: number, fallback: number) => {
      if (baseHpp > 0 && price > 0) {
        return Math.round(((price - baseHpp) / baseHpp) * 1000) / 10;
      }
      return fallback;
    };

    const resolveInitialMarkup = (
      savedMarkup: number | undefined,
      price: number,
      baseHpp: number,
      fallback: number
    ) => {
      if (typeof savedMarkup === 'number' && !isNaN(savedMarkup)) {
        if (savedMarkup === 0 && baseHpp > 0 && price > baseHpp * 1.02) {
          return calcMarkup(price, baseHpp, fallback);
        }
        return savedMarkup;
      }
      return calcMarkup(price, baseHpp, fallback);
    };

    const sellReguler = m.sellPrice || Math.round(hpp * 2);
    const sellKlinik = m.sellPriceKlinik || Math.round(hpp * 2);
    const rawSellMitra = m.sellPriceMitra || Math.round(hpp * 1.25);
    // Normalize if rawSellMitra was stored as satuanBesar
    const expectedMitraKecil = hpp * (1 + ((m.markupMitra ?? 25) / 100));
    const sellMitraKecil =
      medRatio > 1 &&
      rawSellMitra >= hppBesarFromMed * 0.75 &&
      rawSellMitra > expectedMitraKecil * medRatio * 0.6
        ? Math.round(rawSellMitra / medRatio)
        : rawSellMitra;

    setForm({
      name: m.name,
      barcode: m.barcode || '',
      category: m.category,
      kelas: m.kelas || 'Analgesik / Antipiretik',
      nappza: m.nappza || 'Non-NAPPZA',
      statusResep: String(m.statusResep || '').trim() || getDefaultPrescriptionStatusSuggestion(m),
      kekuatan: m.kekuatan || '',
      form: String(m.form || '').trim() || 'Tablet',
      satuanBesar: m.satuanBesar || 'Box',
      satuanKecil: m.satuanKecil || m.unit || 'Strip',
      rasioKonversi: medRatio,
      hnaBesar: medHna,
      hppBesar: hppBesarFromMed,
      hppKecil: hpp,
      markupReguler: resolveInitialMarkup(m.markupReguler, sellReguler, hpp, 100),
      sellPriceReguler: sellReguler,
      markupKlinik: resolveInitialMarkup(m.markupKlinik, sellKlinik, hpp, 100),
      sellPriceKlinik: sellKlinik,
      markupMitra: resolveInitialMarkup(m.markupMitra, sellMitraKecil, hpp, 25),
      sellPriceMitra: sellMitraKecil,
      minStock: m.minStock,
      maxStock: m.maxStock,
      batchNo: m.batchNo,
      stock: m.stock,
      expDate: m.expDate,
      batches: getNormalizedBatches(m),
      rack: m.rack || '',
      supplier: m.supplier
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!form.name.trim()) {
      showBanner('error', 'Nama produk obat wajib diisi!');
      return;
    }
    if (!String(form.category || '').trim()) {
      const msg = 'Kategori / Golongan obat wajib dipilih atau ditambahkan!';
      setCategoryValidationError(msg);
      setIsCategoryDropdownOpen(true);
      showBanner('error', msg);
      return;
    }
    setCategoryValidationError('');

    const ratioVal = Math.max(1, Number(form.rasioKonversi) || 1);
    const hnaVal = Number(form.hnaBesar) || 0;
    const hppBesarVal = Math.max(0, Number(form.hppBesar) || Math.round(hnaVal * 1.11));
    const hppKecilVal = Math.max(0, Number(form.hppKecil) || Math.round(hppBesarVal / ratioVal));

    const isEditMode = Boolean(editTargetMed) || editId !== null;
    const resolvedEditId = editTargetMed?.id ?? editId;
    const existingMedForEdit = isEditMode
      ? editTargetMed ||
        serverMedicines.find((m) => m.id === resolvedEditId) ||
        medicines.find((m) => m.id === resolvedEditId)
      : undefined;

    const rawBatches =
      form.batches && form.batches.length > 0
        ? form.batches
        : [
            {
              id: `B-${Date.now()}-1`,
              batchNo: form.batchNo || '-',
              expDate: form.expDate || '',
              stock: Number(form.stock) || 0
            }
          ];

    // If Stok Awal is OFF, preserve existing stock per batch (on edit) or keep 0 (on add)
    const existingBatches = existingMedForEdit ? getNormalizedBatches(existingMedForEdit) : [];
    const activeBatches = !isInitialStockEnabled
      ? rawBatches.map((b, idx) => ({
          ...b,
          stock: existingMedForEdit ? (existingBatches[idx]?.stock ?? 0) : 0
        }))
      : rawBatches;

    const resolvedFEFO = resolvePrimaryBatchAndStock(
      activeBatches,
      form.batchNo || '-',
      form.expDate || '',
      true
    );

    const getNextUniqueIdentity = (extraUsedIds?: Set<string>) => {
      const combined = [...serverMedicines, ...medicines];
      const existingIds = new Set(combined.map((m) => m.id));
      if (extraUsedIds) {
        extraUsedIds.forEach((id) => existingIds.add(id));
      }
      let maxSeq = combined.reduce((max, m) => {
        const match = /^OBT-(\d+)$/i.exec(m.id.trim());
        if (match) {
          const num = parseInt(match[1], 10);
          return num > max ? num : max;
        }
        return max;
      }, Math.max(totalFilteredItems, combined.length));

      let nextSeq = maxSeq + 1;
      let candidateId = `OBT-${String(nextSeq).padStart(3, '0')}`;
      while (existingIds.has(candidateId)) {
        nextSeq++;
        candidateId = `OBT-${String(nextSeq).padStart(3, '0')}`;
      }
      return {
        id: candidateId,
        barcode: `899123456${String(nextSeq).padStart(3, '0')}`
      };
    };

    const nextIdentity = isEditMode
      ? {
          id: existingMedForEdit?.id ?? resolvedEditId!,
          barcode: form.barcode.trim() || existingMedForEdit?.barcode || ''
        }
      : getNextUniqueIdentity();

    const payload: Medicine = {
      id: nextIdentity.id,
      barcode: form.barcode.trim() || nextIdentity.barcode,
      name: form.name.trim(),
      category: form.category,
      kelas: form.kelas || 'Umum',
      nappza: form.nappza || 'Non-NAPPZA',
      statusResep:
        String(form.statusResep || '').trim() ||
        getDefaultPrescriptionStatusSuggestion({
          category: form.category,
          kelas: form.kelas,
          nappza: form.nappza
        }),
      kekuatan: form.kekuatan || '-',
      form: String(form.form || '').trim() || 'Tablet',
      unit: form.satuanKecil,
      satuanKecil: form.satuanKecil,
      satuanBesar: form.satuanBesar,
      rasioKonversi: ratioVal,
      hnaBesar: hnaVal,
      hpp: hppKecilVal,
      sellPrice: Number(form.sellPriceReguler) || 0,
      sellPriceKlinik: Number(form.sellPriceKlinik) || 0,
      sellPriceMitra: Number(form.sellPriceMitra) || 0,
      markupReguler: Number(form.markupReguler) || 0,
      markupKlinik: Number(form.markupKlinik) || 0,
      markupMitra: Number(form.markupMitra) || 0,
      stock: !isInitialStockEnabled && existingMedForEdit ? existingMedForEdit.stock : resolvedFEFO.stock,
      minStock: Number(form.minStock) || 10,
      maxStock: Number(form.maxStock) || 100,
      batchNo: resolvedFEFO.batchNo,
      expDate: resolvedFEFO.expDate,
      batches: resolvedFEFO.batches,
      rack: (form.rack || '').trim(),
      supplier: form.supplier,
      branchId: existingMedForEdit?.branchId || 'cabang-pusat'
    };

    setIsSaving(true);
    try {
      if (isEditMode) {
        const res = await Promise.resolve(
          onUpdateMedicine(payload, { recordInitialStock: isInitialStockEnabled })
        );
        if (res && typeof res === 'object' && res.success === false && res.error) {
          showBanner('error', `Gagal memperbarui obat ke Supabase: ${res.error}`);
          return;
        }
        if (useServerPagination) {
          setServerMedicines((prev) =>
            prev.map((item) => (item.id === payload.id ? payload : item))
          );
        }
        const pendingSyncNotice =
          res && typeof res === 'object' && Number((res as any).syncedPendingOrdersCount) > 0
            ? ` Harga jual pada ${Number((res as any).syncedPendingOrdersCount)} PO berstatus Pending otomatis diperbarui.`
            : '';
        if (!isDemoSandbox && isMedicineFormColumnMissingInSupabase(medicineTableInput)) {
          showBanner(
            'warning',
            `Obat "${payload.name}" tersimpan, namun kolom "form" (Bentuk Sediaan) belum ada di tabel Supabase "${medicineTableInput}". Jalankan skrip Skema SQL agar kolom bentuk sediaan ikut tersimpan ke Supabase.${pendingSyncNotice}`
          );
        } else {
          showBanner('success', `Data master obat "${payload.name}" berhasil diperbarui.${pendingSyncNotice}`);
        }
      } else {
        const res = await Promise.resolve(
          onAddMedicine(payload, { recordInitialStock: isInitialStockEnabled })
        );
        if (res && typeof res === 'object' && res.success === false && res.error) {
          showBanner('error', `Gagal menyimpan obat baru ke Supabase: ${res.error}`);
          return;
        }
        if (!isDemoSandbox && isMedicineFormColumnMissingInSupabase(medicineTableInput)) {
          showBanner(
            'warning',
            `Obat "${payload.name}" ditambahkan, namun kolom "form" (Bentuk Sediaan) belum ada di tabel Supabase "${medicineTableInput}". Jalankan skrip Skema SQL agar kolom bentuk sediaan ikut tersimpan ke Supabase.`
          );
        } else {
          showBanner('success', `Produk baru "${payload.name}" berhasil ditambahkan ke Master Obat.`);
        }
      }

      setIsModalOpen(false);
      setEditId(null);
      setEditTargetMed(null);
      if (useServerPagination) {
        triggerServerRefresh();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length <= 1) {
          showBanner('error', 'File kosong atau format CSV/Excel tidak valid.');
          return;
        }

        const headerCols = lines[0]
          .split(',')
          .map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
        const hasBentukSediaanCol = headerCols.some(
          (h) => h === 'bentuksediaan' || h === 'bentuk sediaan' || h === 'form'
        );

        let importedCount = 0;
        const usedImportIds = new Set<string>(medicines.map((m) => m.id));
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const parts = line.split(',').map((p) => p.replace(/^"|"$/g, '').trim());

          if (parts.length >= 3) {
            let rawId = parts[0] || `OBT-${Date.now()}-${i}`;
            if (usedImportIds.has(rawId)) {
              let maxSeq = Array.from(usedImportIds).reduce((max, existingId) => {
                const match = /^OBT-(\d+)$/i.exec(existingId.trim());
                if (match) {
                  const num = parseInt(match[1], 10);
                  return num > max ? num : max;
                }
                return max;
              }, medicines.length + i);
              let nextSeq = maxSeq + 1;
              rawId = `OBT-${String(nextSeq).padStart(3, '0')}`;
              while (usedImportIds.has(rawId)) {
                nextSeq++;
                rawId = `OBT-${String(nextSeq).padStart(3, '0')}`;
              }
            }
            usedImportIds.add(rawId);
            const use15Cols = hasBentukSediaanCol || parts.length >= 15;
            const id = rawId;
            const barcode = parts[1] || `899${Math.floor(100000000 + Math.random() * 900000000)}`;
            const name = parts[2] || `Obat Baru ${i}`;
            const kekuatan = parts[3] || '500 mg';
            const formVal = use15Cols ? parts[4] || 'Tablet' : 'Tablet';
            const offset = use15Cols ? 1 : 0;
            const category = (parts[4 + offset] as Medicine['category']) || 'Obat Bebas';
            const kelas = parts[5 + offset] || 'Umum';
            const nappza = parts[6 + offset] || 'Non-NAPPZA';
            const unit = parts[7 + offset] || 'Strip';
            const stock = parseFloat(parts[8 + offset]) || 10;
            const minStock = parseFloat(parts[9 + offset]) || 5;
            const hpp = parseFloat(parts[10 + offset]) || 5000;
            const sellPrice = parseFloat(parts[11 + offset]) || 7000;
            const batchNo = parts[12 + offset] || 'BATCH-001';
            const expDate =
              parts[13 + offset] || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];

            const newMed: Medicine = {
              id,
              barcode,
              name,
              kekuatan,
              category,
              kelas,
              nappza,
              form: formVal,
              unit,
              satuanKecil: 'Tablet',
              satuanBesar: 'Box',
              rasioKonversi: 10,
              hnaBesar: hpp * 10,
              hpp,
              sellPrice,
              sellPriceKlinik: Math.round(sellPrice * 0.95),
              sellPriceMitra: Math.round(sellPrice * 0.9),
              stock,
              minStock,
              maxStock: stock * 5,
              batchNo,
              expDate,
              rack: 'R-01',
              supplier: 'PBF Utama',
              branchId: 'cabang-pusat'
            };

            onAddMedicine(newMed);
            importedCount++;
          }
        }

        showBanner('success', `Berhasil mengimpor ${importedCount} data obat dari file.`);
        if (e.target) e.target.value = '';
      } catch (err: any) {
        showBanner('error', 'Gagal membaca file: ' + (err?.message || String(err)));
      }
    };
    reader.readAsText(file);
  };

  const exportExcel = () => {
    const headers =
      'ID,Barcode,Nama,ZatAktifDanKekuatan,BentukSediaan,Kategori,KelasTerapi,NAPPZA,RakLokasi,Satuan,Stok,MinStok,HPP,HargaJual,Batch,ExpDate\n';
    const rows = medicines
      .map((m) => {
        const { effectiveHppBesar } = computeMedicineDisplayMetrics(m);
        return `"${m.id}","${m.barcode}","${m.name}","${m.kekuatan || ''}","${m.form || 'Tablet'}","${m.category}","${m.kelas || 'Umum'}","${m.nappza || 'Non-NAPPZA'}","${m.rack || ''}","${m.unit}",${m.stock},${m.minStock},${effectiveHppBesar},${m.sellPrice},"${m.batchNo}","${m.expDate}"`;
      })
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Master_Obat_Latisha_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showBanner('success', `Berhasil mengekspor ${medicines.length} data produk obat.`);
  };

  const lowMarkupMedicines = useMemo(() => {
    return medicines.filter((m) => {
      const medRatio = Math.max(1, m.rasioKonversi || 1);
      const effectiveHppBesar = Math.round(
        (m.hnaBesar || ((m.hpp || 0) * medRatio) / 1.11) * 1.11
      );
      const effectiveHppKecil = Math.round(effectiveHppBesar / medRatio);
      const isMitraAlreadyBesar =
        medRatio > 1 &&
        (m.sellPriceMitra || 0) >= effectiveHppBesar * 0.75 &&
        (m.sellPriceMitra || 0) >
          effectiveHppKecil * (1 + ((m.markupMitra ?? 25) / 100)) * medRatio * 0.6;
      const sellMitraKecil = isMitraAlreadyBesar
        ? Math.round((m.sellPriceMitra || 0) / medRatio)
        : m.sellPriceMitra || 0;

      const resolveM = (saved?: number, price?: number) => {
        if (typeof saved === 'number' && !isNaN(saved)) {
          if (saved === 0 && effectiveHppKecil > 0 && price && price > effectiveHppKecil * 1.02) {
            return ((price - effectiveHppKecil) / effectiveHppKecil) * 100;
          }
          return saved;
        }
        if (effectiveHppKecil > 0 && price && price > 0) {
          return ((price - effectiveHppKecil) / effectiveHppKecil) * 100;
        }
        return 0;
      };

      const mReg = resolveM(m.markupReguler, m.sellPrice);
      const mKli = resolveM(m.markupKlinik, m.sellPriceKlinik);
      const mMit = resolveM(m.markupMitra, sellMitraKecil);

      return mReg < 10 || mKli < 10 || mMit < 10;
    });
  }, [medicines]);

  // Shared helper for pricing, markup & batch calculation per row/card
  const computeMedicineDisplayMetrics = (m: Medicine) => {
    const isLowStock = m.stock <= m.minStock;
    const isNearExp = m.expDate ? new Date(m.expDate).getTime() <= Date.now() + 90 * 86400000 : false;

    const medRatio = Math.max(1, m.rasioKonversi || 1);
    const effectiveHppBesar = Math.round(
      (m.hnaBesar || ((m.hpp || 0) * medRatio) / 1.11) * 1.11
    );
    const effectiveHppKecil = Math.round(effectiveHppBesar / medRatio);

    const isMitraAlreadyBesar =
      medRatio > 1 &&
      (m.sellPriceMitra || 0) >= effectiveHppBesar * 0.75 &&
      (m.sellPriceMitra || 0) >
        effectiveHppKecil * (1 + ((m.markupMitra ?? 25) / 100)) * medRatio * 0.6;
    const jualMitraBesar = isMitraAlreadyBesar
      ? m.sellPriceMitra
      : Math.round((m.sellPriceMitra || 0) * medRatio);
    const sellMitraKecilForMarkup = isMitraAlreadyBesar
      ? Math.round((m.sellPriceMitra || 0) / medRatio)
      : m.sellPriceMitra || 0;

    const resolveMarkup = (
      savedMarkup: number | undefined,
      priceKecil: number,
      baseHpp: number
    ): number => {
      if (typeof savedMarkup === 'number' && !isNaN(savedMarkup)) {
        if (savedMarkup === 0 && baseHpp > 0 && priceKecil > baseHpp * 1.02) {
          return Math.round(((priceKecil - baseHpp) / baseHpp) * 1000) / 10;
        }
        return Math.round(savedMarkup * 10) / 10;
      }
      if (baseHpp > 0 && priceKecil > 0) {
        return Math.round(((priceKecil - baseHpp) / baseHpp) * 1000) / 10;
      }
      return 0;
    };

    return {
      isLowStock,
      isNearExp,
      effectiveHppBesar,
      jualMitraBesar,
      markupRegulerVal: resolveMarkup(m.markupReguler, m.sellPrice, effectiveHppKecil),
      markupKlinikVal: resolveMarkup(m.markupKlinik, m.sellPriceKlinik, effectiveHppKecil),
      markupMitraVal: resolveMarkup(m.markupMitra, sellMitraKecilForMarkup, effectiveHppKecil)
    };
  };

  const renderMarkupBadge = (markupVal: number) => {
    const formatted = Number.isInteger(markupVal)
      ? `${markupVal}%`
      : `${markupVal.toFixed(1).replace(/\.0$/, '')}%`;

    if (markupVal < 10) {
      return (
        <div
          className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-700 border border-rose-300 tabular-nums"
          title="Alert: Markup rendah (< 10%)"
        >
          <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
          <span>{formatted}</span>
        </div>
      );
    }
    if (markupVal <= 20) {
      return (
        <div
          className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-100 text-blue-700 border border-blue-300 tabular-nums"
          title="Markup standar (10% - 20%)"
        >
          <span>{formatted}</span>
        </div>
      );
    }
    return (
      <div
        className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-700 border border-emerald-300 tabular-nums"
        title="Markup optimal (> 20%)"
      >
        <span>{formatted}</span>
      </div>
    );
  };

  const showTableClass =
    viewLayout === 'table' ? 'block' : viewLayout === 'cards' ? 'hidden' : 'hidden md:block';
  const showCardsClass =
    viewLayout === 'cards' ? 'block' : viewLayout === 'table' ? 'hidden' : 'block md:hidden';

  const renderPaginationBar = () => (
    <PaginationControls
      currentPage={safeCurrentPage}
      totalPages={totalPages}
      totalCount={totalFilteredItems}
      pageSize={pageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      onPageChange={setCurrentPage}
      onPageSizeChange={handlePageSizeChange}
      isLoading={isServerLoading}
      itemLabel="produk obat"
    />
  );

  return (
    <div className="space-y-4 min-w-0">
      {/* Inline Feedback Banner (Replaces window.alert) */}
      {feedbackBanner && (
        <div
          className={`px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold shadow-xs ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : feedbackBanner.type === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : feedbackBanner.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="break-words">{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
            aria-label="Tutup notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Demo Mode Isolation Notice */}
      {isDemoSandbox && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
          <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Isolasi Mode Demo / Sandbox Aktif</p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Perubahan pada Master Data Obat di sesi demo ini disimpan secara lokal di sandbox dan tidak pernah membaca atau menulis ke tabel Supabase produksi.
            </p>
          </div>
        </div>
      )}

      {/* Table Setup or Missing `form` Column Warning (APJ / Owner Only) */}
      {isSuperAdmin &&
        !isDemoSandbox &&
        (needsTableSetup || isMedicineFormColumnMissingInSupabase(medicineTableInput)) && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {needsTableSetup
                    ? `Tabel Supabase "${medicineTableInput}" belum dibuat:`
                    : `Kolom "form" (Bentuk Sediaan) belum tersedia di tabel Supabase "${medicineTableInput}":`}
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  {needsTableSetup
                    ? 'Salin dan jalankan skrip SQL di Dashboard Supabase agar seluruh Master Data Obat tersinkronisasi 2-arah secara real-time.'
                    : 'Jalankan skrip Skema SQL terbaru di Dashboard Supabase agar perubahan kolom Bentuk Sediaan tersimpan langsung ke Supabase.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSchemaModal(true)}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shrink-0 cursor-pointer"
            >
              {needsTableSetup ? 'Buka Skema SQL Setup' : 'Perbarui Kolom via Skema SQL'}
            </button>
          </div>
        )}

      {/* Top Filter, Actions & Responsive View Switcher */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
        {/* Header Bar + Layout Mode Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                  Master Obat &amp; Harga Bertingkat
                </h2>
                {isDemoSandbox ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                    <Database className="w-3 h-3" />
                    Mode Demo Sandbox
                  </span>
                ) : needsTableSetup ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold">
                    <AlertCircle className="w-3 h-3" />
                    Tabel Supabase Perlu Setup
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    {useServerPagination ? `Server-Side · ${medicineTableInput}` : `Supabase Live: ${medicineTableInput}`}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 tabular-nums">
                Menampilkan{' '}
                <strong className="text-slate-700">
                  {totalFilteredItems === 0 ? 0 : pageStartIndex + 1}–{pageEndIndex}
                </strong>{' '}
                dari <strong className="text-slate-700">{totalFilteredItems.toLocaleString('id-ID')}</strong> produk
                {!useServerPagination && totalFilteredItems !== medicines.length
                  ? ` (total ${medicines.length} terdaftar)`
                  : ' terdaftar'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            {/* APJ / Owner ON/OFF Toggle for Stok Awal */}
            <button
              type="button"
              onClick={handleToggleInitialStock}
              disabled={!isSuperAdmin}
              title={
                isSuperAdmin
                  ? 'Klik untuk mengaktifkan atau menonaktifkan pengisian Stok Awal pada Master Data Obat'
                  : 'Hanya APJ / Owner yang dapat mengaktifkan atau menonaktifkan Stok Awal'
              }
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition ${
                !isSuperAdmin
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : isInitialStockEnabled
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer'
                  : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 cursor-pointer'
              }`}
            >
              {!isSuperAdmin && <Lock className="w-3 h-3 shrink-0" />}
              <span>Stok Awal:</span>
              <span
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                  isInitialStockEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    isInitialStockEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <span className="font-black">{isInitialStockEnabled ? 'ON' : 'OFF'}</span>
            </button>

            {/* Segmented View Switcher: Auto / Full Table / Compact Cards */}
            <div
              className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200"
              role="group"
              aria-label="Mode tampilan data master obat"
            >
              <button
                type="button"
                onClick={() => setViewLayout('auto')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewLayout === 'auto'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Sesuaikan otomatis dengan ukuran layar perangkat"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Otomatis</span>
              </button>
              <button
                type="button"
                onClick={() => setViewLayout('table')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewLayout === 'table'
                    ? 'bg-white text-sky-700 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={`Tampilkan tabel (${visibleColumnCount} kolom aktif)`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setViewLayout('cards')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewLayout === 'cards'
                    ? 'bg-white text-sky-700 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilkan daftar kartu ringkas ramah sentuhan"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Kartu</span>
              </button>
            </div>

            {/* Atur Tabel (Filter Kolom Master Obat) */}
            <div ref={columnPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setIsColumnPickerOpen((prev) => !prev)}
                aria-expanded={isColumnPickerOpen}
                aria-haspopup="true"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                  isColumnPickerOpen
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : visibleColumnCount < MASTER_OBAT_TABLE_COLUMNS.length
                    ? 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="Atur kolom yang ditampilkan pada tabel Master Obat"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span>Atur Tabel</span>
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-black tabular-nums ${
                    isColumnPickerOpen
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {visibleColumnCount}/{MASTER_OBAT_TABLE_COLUMNS.length}
                </span>
              </button>

              {isColumnPickerOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-40 overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="text-xs font-extrabold truncate">
                        Atur Kolom Tabel Master Obat
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsColumnPickerOpen(false)}
                      aria-label="Tutup pengaturan kolom tabel"
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-slate-600 tabular-nums">
                      {visibleColumnCount} dari {MASTER_OBAT_TABLE_COLUMNS.length} kolom aktif
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleShowAllColumns}
                        className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold text-[10px] transition cursor-pointer"
                      >
                        Tampilkan Semua
                      </button>
                      <button
                        type="button"
                        onClick={handleHideAllColumns}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 font-bold text-[10px] transition cursor-pointer"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 max-h-72 overflow-y-auto custom-scrollbar grid grid-cols-1 gap-1">
                    {MASTER_OBAT_TABLE_COLUMNS.map((col) => {
                      const checked = isColVisible(col.key);
                      return (
                        <label
                          key={col.key}
                          className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-xs font-bold cursor-pointer transition select-none ${
                            checked
                              ? 'bg-sky-50/70 border-sky-200 text-slate-900'
                              : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleColumn(col.key)}
                              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer shrink-0"
                            />
                            <span className="truncate">{col.label}</span>
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              checked
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {checked ? 'Tampil' : 'Sembunyi'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search, Filter Selects & Action Buttons */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Search + Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:col-span-2 lg:flex-1 lg:min-w-[240px] lg:max-w-md">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari obat (Nama / Zat Aktif / Barcode / Batch)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && searchTerm.trim()) {
                      const code = searchTerm.trim();
                      const lower = code.toLowerCase();
                      const localMatch = [...serverMedicines, ...medicines].find(
                        (m) =>
                          (m.barcode && m.barcode.trim().toLowerCase() === lower) ||
                          m.id.trim().toLowerCase() === lower
                      );
                      if (localMatch) {
                        playBarcodeBeep();
                        setSearchTerm(localMatch.barcode || localMatch.id);
                      } else if (useServerPagination) {
                        const res = await fetchMedicineByBarcodeOrIdFromSupabase(code);
                        if (res.data) {
                          playBarcodeBeep();
                          setSearchTerm(res.data.barcode || res.data.id);
                        }
                      }
                    }
                  }}
                  className="w-full min-h-[40px] pl-9 pr-8 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white focus:border-sky-400 outline-none transition"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Hapus pencarian obat"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInventoryScannerTarget('search')}
                title="Scan Barcode Obat dengan Kamera"
                className="min-h-[40px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">Scan</span>
              </button>
            </div>

            <div className="w-full lg:w-auto flex items-center gap-1.5">
              {categoryFilter !== 'SEMUA' && (
                <MedicineCategorySymbol category={categoryFilter} size="sm" />
              )}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full lg:w-auto min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 outline-none focus:border-sky-400"
              >
                <option value="SEMUA">Semua Golongan</option>
                {allCategoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
              className="w-full lg:w-auto min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 outline-none focus:border-sky-400"
            >
              <option value="SEMUA">Semua Status Stok</option>
              <option value="MENIPIS">Stok Kritis / Defecta (≤ Min)</option>
              <option value="EXP_NEAR">Expired Dekat (&lt; 3 Bulan)</option>
            </select>

            <select
              aria-label="Jumlah baris per halaman"
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="w-full lg:w-auto min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 outline-none focus:border-sky-400 cursor-pointer"
              title="Atur jumlah baris per halaman"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  Tampilkan {size} baris
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
            {onSyncSupabase && (
              <button
                type="button"
                onClick={handleRunSupabaseSync}
                disabled={isSyncing}
                className="min-h-[40px] px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                title="Sinkronkan 2-arah Master Data Obat dengan Supabase"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="truncate">{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
              </button>
            )}

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setShowSchemaModal(true)}
                className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                title="Lihat skema SQL & konfigurasi tabel master_obat Supabase"
              >
                <Code className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span className="truncate">Skema SQL</span>
              </button>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv, .xlsx, .xls"
              className="hidden"
            />
            <button
              type="button"
              onClick={handleImportClick}
              className="min-h-[40px] px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">Import Excel</span>
            </button>

            <button
              type="button"
              onClick={exportExcel}
              className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-600 shrink-0" />
              <span className="truncate">Export Excel</span>
            </button>

            {onClearMedicines && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="min-h-[40px] px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="truncate">Bersihkan</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenAdd}
              className="min-h-[40px] px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer col-span-2 sm:col-span-1"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Tambah Obat</span>
            </button>
          </div>
        </div>

        {/* Notifikasi Indikator Markup <10% */}
        <div className="w-full pt-2.5 border-t border-slate-100 text-xs">
          {lowMarkupMedicines.length > 0 ? (
            <div className="w-full p-2.5 sm:p-3 bg-rose-50 border border-rose-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-rose-800">
              <div className="flex items-start sm:items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0 text-xs leading-relaxed">
                  <span className="text-rose-700 font-black tracking-wide uppercase mr-1.5">
                    Ada Obat Markup &lt;10%:
                  </span>
                  <span className="text-rose-900 font-mono text-[11px] font-semibold break-words">
                    {lowMarkupMedicines.map((m) => m.name).join(', ')}
                  </span>
                </div>
              </div>
              <span className="self-start sm:self-center px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[10px] uppercase font-mono font-black shrink-0 tabular-nums">
                {lowMarkupMedicines.length} Produk
              </span>
            </div>
          ) : (
            <div className="w-full p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-[11px] font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Indikator Markup: Semua produk obat memiliki markup ≥ 10% (Aman)</span>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE / COMPACT CARD VIEW (Default on < md, or forced via 'Kartu') */}
      <div className={showCardsClass}>
        {isServerLoading && paginatedMedicines.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2 shadow-xs">
            <Loader2 className="w-7 h-7 text-sky-600 animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-600">
              Mengambil data obat halaman {safeCurrentPage} dari Supabase...
            </p>
          </div>
        ) : paginatedMedicines.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2 shadow-xs">
            <Boxes className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Tidak ada data obat ditemukan</p>
            <p className="text-xs text-slate-500">
              Coba ubah kata kunci pencarian atau atur ulang filter golongan &amp; status stok.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {paginatedMedicines.map((m) => {
              const {
                isLowStock,
                isNearExp,
                effectiveHppBesar,
                jualMitraBesar,
                markupRegulerVal,
                markupKlinikVal,
                markupMitraVal
              } = computeMedicineDisplayMetrics(m);

              return (
                <div
                  key={m.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 flex flex-col justify-between gap-3"
                >
                  {/* Top Info */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-slate-900 text-sm leading-snug break-words">
                          {m.name}
                        </h3>
                        <p className="font-mono text-[10px] text-slate-400 tabular-nums mt-0.5">
                          {m.barcode} · ID: {m.id}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-black font-mono tabular-nums px-2.5 py-1 rounded-full text-[11px] border ${
                          isLowStock
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {m.stock} {m.unit}
                      </span>
                    </div>

                    {/* Badges: Zat Aktif & Kekuatan, Kategori, Kelas Terapi, NAPPZA, Status Resep */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      {(() => {
                        const rxReq = getMedicinePrescriptionRequirement(m, statusResepConfigs);
                        return (
                          <>
                            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {m.kekuatan || '-'}
                            </span>
                            <span className="font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              {m.form || '-'}
                            </span>
                            <MedicineCategorySymbol category={m.category} size="sm" />
                            <span className="font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                              {m.kelas || 'Umum'}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-black border ${rxReq.colorTheme.badgeClass}`}
                            >
                              {rxReq.requiresRx ? (
                                <ShieldAlert className="w-3 h-3 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                              )}
                              {rxReq.badgeLabel}
                            </span>
                            {m.nappza && m.nappza !== 'Non-NAPPZA' ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black border ${
                                  m.nappza === 'Narkotik'
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : m.nappza === 'Psikotropik'
                                    ? 'bg-purple-100 text-purple-800 border-purple-300'
                                    : m.nappza === 'OOT'
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : 'bg-orange-100 text-orange-800 border-orange-300'
                                }`}
                              >
                                <ShieldAlert className="w-3 h-3" />
                                {m.nappza}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium px-1.5 py-0.5">Non-NAPPZA</span>
                            )}
                            {m.rack && (
                              <span className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Rak: {m.rack}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Satuan & HNA/HPP + 3-Tier Harga Jual */}
                  <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-2.5 space-y-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-200/70">
                      <span className="text-slate-600 font-semibold">
                        Satuan: <strong className="text-slate-900">{m.satuanBesar}</strong> / {m.satuanKecil} (1:{m.rasioKonversi})
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        Min Stok: <strong className="text-slate-800">{m.minStock}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                        <span className="text-[10px] text-slate-500 block font-semibold">HNA</span>
                        <span className="font-mono font-bold text-slate-700 tabular-nums">
                          Rp {m.hnaBesar.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="bg-amber-50/70 p-2 rounded-lg border border-amber-200">
                        <span className="text-[10px] text-amber-800 block font-semibold">HPP</span>
                        <span className="font-mono font-bold text-amber-800 tabular-nums">
                          Rp {effectiveHppBesar.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                        <span className="text-[10px] text-slate-500 block font-bold">Reguler</span>
                        <div className="font-mono font-black text-slate-900 tabular-nums text-[11px]">
                          Rp {m.sellPrice.toLocaleString('id-ID')}
                        </div>
                        {renderMarkupBadge(markupRegulerVal)}
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-indigo-200/80">
                        <span className="text-[10px] text-indigo-700 block font-bold">Klinik</span>
                        <div className="font-mono font-bold text-indigo-700 tabular-nums text-[11px]">
                          Rp {m.sellPriceKlinik.toLocaleString('id-ID')}
                        </div>
                        {renderMarkupBadge(markupKlinikVal)}
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-emerald-200/80">
                        <span className="text-[10px] text-emerald-700 block font-bold">Mitra (Besar)</span>
                        <div className="font-mono font-bold text-emerald-700 tabular-nums text-[11px]">
                          Rp {jualMitraBesar.toLocaleString('id-ID')}
                        </div>
                        {renderMarkupBadge(markupMitraVal)}
                      </div>
                    </div>
                  </div>

                  {/* Batch & FEFO */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Batch &amp; Exp (FEFO)
                    </span>
                    {m.batches && m.batches.length > 1 ? (
                      <div className="space-y-1 font-mono">
                        {m.batches.map((b, bIdx) => {
                          const bNearExp =
                            b.expDate && new Date(b.expDate).getTime() <= Date.now() + 90 * 86400000;
                          return (
                            <div
                              key={b.id || bIdx}
                              className={`px-2 py-1 rounded-lg border text-[10px] flex items-center justify-between gap-2 tabular-nums ${
                                bIdx === 0
                                  ? 'bg-sky-50 border-sky-200 text-sky-950'
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <div className="min-w-0 truncate">
                                <span className="font-bold">{b.batchNo}</span>{' '}
                                <span className={bNearExp ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                                  (ED: {b.expDate || '-'})
                                </span>
                              </div>
                              <span className="font-black text-slate-900 shrink-0">{b.stock}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] tabular-nums">
                        <span className="font-bold text-slate-700 truncate">{m.batchNo || '-'}</span>
                        <span
                          className={`text-[10px] font-bold shrink-0 ${
                            isNearExp
                              ? 'text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200'
                              : 'text-slate-500'
                          }`}
                        >
                          ED: {m.expDate || '-'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer Touch Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(m)}
                      className="min-h-[42px] px-3 py-2 text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Obat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(m)}
                      className="min-h-[42px] px-3 py-2 text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {renderPaginationBar()}
            </div>
          </div>
        )}
      </div>

      {/* FULL ADAPTIVE TABLE (Filtered dynamically via Atur Tabel, sticky Aksi on scroll) */}
      <div className={showTableClass}>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="md:hidden px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 flex items-center justify-between">
            <span>Geser tabel ke kanan/kiri untuk melihat {visibleColumnCount} kolom aktif</span>
            <span className="font-mono font-bold text-slate-700 tabular-nums">
              {totalFilteredItems === 0 ? 0 : pageStartIndex + 1}–{pageEndIndex} / {totalFilteredItems} item
            </span>
          </div>

          <div className="overflow-auto max-h-[72vh] w-full custom-scrollbar">
            <table
              className={`w-full ${
                visibleColumnCount > 7 ? 'min-w-[960px]' : 'min-w-full'
              } text-left text-[11px] xl:text-xs border-collapse`}
            >
              {visibleColumnCount > 0 && (
                <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600 text-[10px] leading-tight sticky top-0 z-20 shadow-2xs">
                  <tr>
                    {isColVisible('aksi') && (
                      <th className="px-2 py-2.5 w-16 text-center font-bold sticky left-0 z-30 bg-slate-50 border-r border-slate-200/80">
                        Aksi
                      </th>
                    )}
                    {isColVisible('name') && (
                      <th className="px-2 py-2.5 min-w-[140px]">
                        <button
                          type="button"
                          onClick={() => handleToggleSort('name')}
                          className={`inline-flex items-center gap-1 uppercase font-bold cursor-pointer hover:text-sky-700 transition-colors ${
                            sortBy === 'name' ? 'text-sky-700' : ''
                          }`}
                          title="Urutkan berdasarkan Nama Produk (A-Z / Z-A)"
                        >
                          <span>Nama Produk</span>
                          {sortBy === 'name' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-sky-600 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-sky-600 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </button>
                      </th>
                    )}
                    {isColVisible('barcode') && (
                      <th className="px-2 py-2.5 min-w-[115px] whitespace-nowrap">Barcode</th>
                    )}
                    {isColVisible('kekuatan') && (
                      <th className="px-2 py-2.5 text-center min-w-[130px]">Zat Aktif &amp; Kekuatan</th>
                    )}
                    {isColVisible('bentukSediaan') && (
                      <th className="px-2 py-2.5 text-center min-w-[110px]">Bentuk Sediaan</th>
                    )}
                    {isColVisible('category') && (
                      <th className="px-2 py-2.5 text-center min-w-[82px]">Kategori / Golongan</th>
                    )}
                    {isColVisible('kelas') && (
                      <th className="px-2 py-2.5 min-w-[95px]">Kelas Terapi</th>
                    )}
                    {isColVisible('nappza') && (
                      <th className="px-2 py-2.5 text-center">NAPPZA</th>
                    )}
                    {isColVisible('statusResep') && (
                      <th className="px-2 py-2.5 text-center min-w-[115px]">Status Resep</th>
                    )}
                    {isColVisible('satuan') && (
                      <th className="px-2 py-2.5 min-w-[90px]">Satuan</th>
                    )}
                    {isColVisible('hna') && (
                      <th className="px-2 py-2.5 text-right whitespace-nowrap">HNA</th>
                    )}
                    {isColVisible('hpp') && (
                      <th className="px-2 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleSort('hpp')}
                          className={`inline-flex items-center justify-end gap-1 ml-auto uppercase font-bold cursor-pointer hover:text-sky-700 transition-colors ${
                            sortBy === 'hpp' ? 'text-sky-700' : ''
                          }`}
                          title="Urutkan berdasarkan HPP (Terendah / Tertinggi)"
                        >
                          <span>HPP</span>
                          {sortBy === 'hpp' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-sky-600 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-sky-600 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </button>
                      </th>
                    )}
                    {isColVisible('sellPrice') && (
                      <th className="px-2 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleSort('sellPrice')}
                          className={`inline-flex items-center justify-end gap-1 ml-auto uppercase font-bold cursor-pointer hover:text-sky-700 transition-colors ${
                            sortBy === 'sellPrice' ? 'text-sky-700' : ''
                          }`}
                          title="Urutkan berdasarkan Jual Reguler (Terendah / Tertinggi)"
                        >
                          <span>Jual Reguler</span>
                          {sortBy === 'sellPrice' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-sky-600 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-sky-600 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </button>
                      </th>
                    )}
                    {isColVisible('sellPriceKlinik') && (
                      <th className="px-2 py-2.5 text-right whitespace-nowrap text-indigo-700">
                        <button
                          type="button"
                          onClick={() => handleToggleSort('sellPriceKlinik')}
                          className={`inline-flex items-center justify-end gap-1 ml-auto uppercase font-bold cursor-pointer hover:text-indigo-900 transition-colors ${
                            sortBy === 'sellPriceKlinik' ? 'text-indigo-900' : 'text-indigo-700'
                          }`}
                          title="Urutkan berdasarkan Jual Klinik (Terendah / Tertinggi)"
                        >
                          <span>Jual Klinik</span>
                          {sortBy === 'sellPriceKlinik' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-indigo-700 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-indigo-700 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          )}
                        </button>
                      </th>
                    )}
                    {isColVisible('sellPriceMitra') && (
                      <th className="px-2 py-2.5 text-right whitespace-nowrap text-emerald-700">
                        <button
                          type="button"
                          onClick={() => handleToggleSort('sellPriceMitra')}
                          className={`inline-flex items-center justify-end gap-1 ml-auto uppercase font-bold cursor-pointer hover:text-emerald-900 transition-colors ${
                            sortBy === 'sellPriceMitra' ? 'text-emerald-900' : 'text-emerald-700'
                          }`}
                          title="Urutkan berdasarkan Jual Mitra (Terendah / Tertinggi)"
                        >
                          <span>Jual Mitra</span>
                          {sortBy === 'sellPriceMitra' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-emerald-700 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-emerald-700 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-emerald-400 shrink-0" />
                          )}
                        </button>
                      </th>
                    )}
                    {isColVisible('batch') && (
                      <th className="px-2 py-2.5 text-center min-w-[115px]">Batch &amp; Exp (FEFO)</th>
                    )}
                    {isColVisible('rack') && (
                      <th className="px-2 py-2.5 text-center min-w-[95px] whitespace-nowrap">
                        Rak / Lokasi
                      </th>
                    )}
                    {isColVisible('stock') && (
                      <th className="px-2 py-2.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleSort('stock')}
                          className={`inline-flex items-center justify-center gap-1 mx-auto uppercase font-bold cursor-pointer hover:text-sky-700 transition-colors ${
                            sortBy === 'stock' ? 'text-sky-700' : ''
                          }`}
                          title="Urutkan berdasarkan Stock (Terkecil / Terbanyak)"
                        >
                          <span>Stock</span>
                          {sortBy === 'stock' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-sky-600 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-sky-600 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </button>
                      </th>
                    )}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {visibleColumnCount === 0 ? (
                  <tr>
                    <td colSpan={1} className="px-4 py-12 text-center">
                      <SlidersHorizontal className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700">
                        Semua kolom tabel Master Obat sedang disembunyikan
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
                        Aktifkan minimal satu kolom melalui menu <strong>Atur Tabel</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={handleShowAllColumns}
                        className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition cursor-pointer"
                      >
                        Tampilkan Semua Kolom
                      </button>
                    </td>
                  </tr>
                ) : isServerLoading && paginatedMedicines.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="px-4 py-12 text-center text-slate-500">
                      <div className="inline-flex items-center gap-2 font-bold text-xs">
                        <Loader2 className="w-4 h-4 text-sky-600 animate-spin" />
                        <span>Mengambil data master obat halaman {safeCurrentPage} dari Supabase...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedMedicines.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="px-4 py-12 text-center">
                      <Boxes className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700">Tidak ada data obat ditemukan</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Sesuaikan pencarian atau filter golongan &amp; status stok di atas.
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedMedicines.map((m) => {
                    const {
                      isLowStock,
                      isNearExp,
                      effectiveHppBesar,
                      jualMitraBesar,
                      markupRegulerVal,
                      markupKlinikVal,
                      markupMitraVal
                    } = computeMedicineDisplayMetrics(m);

                    return (
                      <tr key={m.id} className="group hover:bg-slate-50 transition-colors">
                        {isColVisible('aksi') && (
                          <td className="px-2 py-2.5 text-center whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100">
                            <div className="inline-flex items-center gap-1 justify-center">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(m)}
                                className="p-1.5 text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition inline-flex items-center cursor-pointer"
                                title={`Edit obat ${m.name}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(m)}
                                className="p-1.5 text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition inline-flex items-center cursor-pointer"
                                title={`Hapus obat ${m.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}

                        {isColVisible('name') && (
                          <td className="px-2 py-2.5">
                            <strong className="text-slate-900 block leading-snug">{m.name}</strong>
                            <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                              ID: {m.id}
                            </span>
                          </td>
                        )}

                        {isColVisible('barcode') && (
                          <td className="px-2 py-2.5 font-mono text-[11px] tabular-nums whitespace-nowrap">
                            {m.barcode ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 font-bold">
                                {m.barcode}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        )}

                        {isColVisible('kekuatan') && (
                          <td className="px-2 py-2.5 text-center">
                            <span className="font-mono font-bold text-slate-800 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 inline-block max-w-[175px] break-words leading-snug">
                              {m.kekuatan || '-'}
                            </span>
                          </td>
                        )}

                        {isColVisible('bentukSediaan') && (
                          <td className="px-2 py-2.5 text-center whitespace-nowrap">
                            <span className="text-[11px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 inline-block">
                              {m.form || '-'}
                            </span>
                          </td>
                        )}

                        {isColVisible('category') && (
                          <td className="px-2 py-2.5 text-center">
                            <div className="inline-flex items-center justify-center">
                              <MedicineCategorySymbol category={m.category} size="md" />
                            </div>
                          </td>
                        )}

                        {isColVisible('kelas') && (
                          <td className="px-2 py-2.5">
                            <span className="text-[10px] font-semibold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded-md border border-sky-200 inline-block leading-tight">
                              {m.kelas || 'Umum'}
                            </span>
                          </td>
                        )}

                        {isColVisible('nappza') && (
                          <td className="px-2 py-2.5 text-center">
                            {m.nappza && m.nappza !== 'Non-NAPPZA' ? (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${
                                  m.nappza === 'Narkotik'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : m.nappza === 'Psikotropik'
                                    ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                    : m.nappza === 'OOT'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-orange-100 text-orange-800 border border-orange-300'
                                }`}
                              >
                                <ShieldAlert className="w-3 h-3" />
                                {m.nappza}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                Bukan NAPPZA
                              </span>
                            )}
                          </td>
                        )}

                        {isColVisible('statusResep') && (
                          <td className="px-2 py-2.5 text-center">
                            {(() => {
                              const rxReq = getMedicinePrescriptionRequirement(m, statusResepConfigs);
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black border whitespace-nowrap ${rxReq.colorTheme.badgeClass}`}
                                >
                                  {rxReq.requiresRx ? (
                                    <ShieldAlert className="w-2.5 h-2.5 shrink-0" />
                                  ) : (
                                    <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                                  )}
                                  <span>{rxReq.badgeLabel}</span>
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {isColVisible('satuan') && (
                          <td className="px-2 py-2.5 leading-tight">
                            <span className="font-bold text-slate-800">{m.satuanBesar}</span> /{' '}
                            {m.satuanKecil}
                            <span className="block text-[10px] text-slate-400 font-mono tabular-nums">
                              1 : {m.rasioKonversi}
                            </span>
                          </td>
                        )}

                        {isColVisible('hna') && (
                          <td className="px-2 py-2.5 text-right font-mono text-slate-500 whitespace-nowrap tabular-nums">
                            Rp {m.hnaBesar.toLocaleString('id-ID')}
                          </td>
                        )}

                        {isColVisible('hpp') && (
                          <td className="px-2 py-2.5 text-right font-mono font-bold text-amber-700 whitespace-nowrap tabular-nums">
                            Rp {effectiveHppBesar.toLocaleString('id-ID')}
                          </td>
                        )}

                        {isColVisible('sellPrice') && (
                          <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">
                            <div className="font-black text-slate-900">
                              Rp {m.sellPrice.toLocaleString('id-ID')}
                            </div>
                            {renderMarkupBadge(markupRegulerVal)}
                          </td>
                        )}

                        {isColVisible('sellPriceKlinik') && (
                          <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">
                            <div className="font-bold text-indigo-700">
                              Rp {m.sellPriceKlinik.toLocaleString('id-ID')}
                            </div>
                            {renderMarkupBadge(markupKlinikVal)}
                          </td>
                        )}

                        {isColVisible('sellPriceMitra') && (
                          <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">
                            <div className="font-bold text-emerald-700">
                              Rp {jualMitraBesar.toLocaleString('id-ID')}
                            </div>
                            {renderMarkupBadge(markupMitraVal)}
                          </td>
                        )}

                        {isColVisible('batch') && (
                          <td className="px-2 py-2.5 text-center font-mono tabular-nums">
                            {m.batches && m.batches.length > 1 ? (
                              <div className="space-y-1 text-left">
                                {m.batches.map((b, bIdx) => {
                                  const bNearExp =
                                    b.expDate &&
                                    new Date(b.expDate).getTime() <= Date.now() + 90 * 86400000;
                                  return (
                                    <div
                                      key={b.id || bIdx}
                                      className={`px-1.5 py-0.5 rounded border text-[10px] flex items-center justify-between gap-1 ${
                                        bIdx === 0
                                          ? 'bg-sky-50 border-sky-200 text-sky-950'
                                          : 'bg-slate-50 border-slate-200 text-slate-700'
                                      }`}
                                    >
                                      <div>
                                        <span className="font-bold block">{b.batchNo}</span>
                                        <span
                                          className={bNearExp ? 'text-rose-600 font-bold' : 'text-slate-500'}
                                        >
                                          ED: {b.expDate || '-'}
                                        </span>
                                      </div>
                                      <span className="font-black text-slate-900 shrink-0">{b.stock}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <>
                                <span className="block text-slate-700 font-bold">{m.batchNo}</span>
                                <span
                                  className={`text-[10px] font-bold ${
                                    isNearExp
                                      ? 'text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {m.expDate}
                                </span>
                              </>
                            )}
                          </td>
                        )}

                        {isColVisible('rack') && (
                          <td className="px-2 py-2.5 text-center whitespace-nowrap">
                            {m.rack ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-bold text-[10px]">
                                {m.rack}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        )}

                        {isColVisible('stock') && (
                          <td className="px-2 py-2.5 text-center whitespace-nowrap">
                            <span
                              className={`inline-block font-black font-mono tabular-nums px-2 py-0.5 rounded-full text-[11px] ${
                                isLowStock
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {m.stock} {m.unit}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {renderPaginationBar()}
        </div>
      </div>

      {/* Add / Edit Modal (Responsive for Phone, Tablet, Desktop) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 my-auto max-h-[94vh] flex flex-col">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h3 className="font-extrabold text-xs sm:text-sm uppercase tracking-wide">
                {editId ? 'Edit Master Data Obat' : 'Tambah Obat Baru ke Master List'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="Tutup form master obat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSave}
              className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto custom-scrollbar flex-1"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nama Produk Obat *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Paracetamol 500mg"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Barcode / Kode EAN
                  </label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1 min-w-0">
                      <ScanBarcode className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Scan / otomatis jika kosong"
                        value={form.barcode}
                        onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                        className="w-full pl-8 pr-2 py-2.5 border rounded-xl font-mono font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setInventoryScannerTarget('form')}
                      title="Scan Barcode dari Kemasan Obat"
                      className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer shrink-0 transition"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Scan</span>
                    </button>
                  </div>
                </div>
                <div ref={categoryDropdownRef} className="relative">
                  <label className="block font-bold text-slate-700 mb-1">Kategori / Golongan *</label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCategory(false);
                          setIsCategoryDropdownOpen((prev) => !prev);
                        }}
                        aria-haspopup="listbox"
                        aria-expanded={isCategoryDropdownOpen}
                        className={`w-full p-2.5 border rounded-xl font-bold bg-white hover:bg-slate-50 focus:ring-2 outline-none flex items-center justify-between gap-2 text-left cursor-pointer transition ${
                          categoryValidationError
                            ? 'border-rose-400 focus:ring-rose-500'
                            : 'focus:ring-sky-500'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {form.category && (
                            <MedicineCategorySymbol category={form.category} size="xs" />
                          )}
                          <span
                            className={`truncate ${
                              form.category ? 'text-slate-800' : 'text-slate-400 font-semibold'
                            }`}
                          >
                            {form.category
                              ? CATEGORY_DISPLAY_LABELS[form.category] || form.category
                              : 'Pilih / cari kategori...'}
                          </span>
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
                            isCategoryDropdownOpen ? 'rotate-180 text-sky-600' : ''
                          }`}
                        />
                      </button>

                      {isCategoryDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
                            <div className="relative flex items-center">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                              <input
                                type="text"
                                autoFocus
                                placeholder="Cari kategori / golongan..."
                                value={categorySearchQuery}
                                onChange={(e) => setCategorySearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (filteredCategoryOptions.length > 0) {
                                      const firstMatch = filteredCategoryOptions[0];
                                      const nextAutoStatus = !statusResepManuallyEditedRef.current
                                        ? getDefaultPrescriptionStatusSuggestion({
                                            category: firstMatch,
                                            kelas: form.kelas,
                                            nappza: form.nappza
                                          })
                                        : form.statusResep;
                                      setForm({
                                        ...form,
                                        category: firstMatch as Medicine['category'],
                                        statusResep: nextAutoStatus
                                      });
                                      setCategoryValidationError('');
                                      setCategorySearchQuery('');
                                      setIsCategoryDropdownOpen(false);
                                    } else if (categorySearchQuery.trim()) {
                                      handleConfirmAddCategory(categorySearchQuery);
                                    }
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setIsCategoryDropdownOpen(false);
                                  }
                                }}
                                className="w-full pl-8 pr-7 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-400 outline-none text-slate-800 placeholder:text-slate-400 placeholder:font-semibold"
                              />
                              {categorySearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setCategorySearchQuery('')}
                                  aria-label="Bersihkan pencarian kategori"
                                  className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div
                            role="listbox"
                            aria-label="Daftar Kategori / Golongan"
                            className="max-h-52 overflow-y-auto custom-scrollbar py-1"
                          >
                            {allCategoryOptions.length === 0 ? (
                              <div className="px-3 py-2.5 text-[11px] text-slate-400 text-center">
                                Daftar kategori kosong. Klik tombol + untuk menambah.
                              </div>
                            ) : filteredCategoryOptions.length === 0 ? (
                              <div className="px-3 py-2.5 text-center space-y-2">
                                <p className="text-[11px] text-slate-400">
                                  Kategori &ldquo;{categorySearchQuery.trim()}&rdquo; tidak ditemukan.
                                </p>
                                {categorySearchQuery.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmAddCategory(categorySearchQuery)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 font-extrabold text-[11px] border border-sky-200 transition cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Tambah &ldquo;{categorySearchQuery.trim()}&rdquo;
                                  </button>
                                )}
                              </div>
                            ) : (
                              filteredCategoryOptions.map((cat) => {
                                const isSelected =
                                  String(form.category || '').toLowerCase() === cat.toLowerCase();
                                return (
                                  <div
                                    key={cat}
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => {
                                      const nextAutoStatus = !statusResepManuallyEditedRef.current
                                        ? getDefaultPrescriptionStatusSuggestion({
                                            category: cat,
                                            kelas: form.kelas,
                                            nappza: form.nappza
                                          })
                                        : form.statusResep;
                                      setForm({
                                        ...form,
                                        category: cat as Medicine['category'],
                                        statusResep: nextAutoStatus
                                      });
                                      setCategoryValidationError('');
                                      setCategorySearchQuery('');
                                      setIsCategoryDropdownOpen(false);
                                    }}
                                    className={`px-2.5 py-2 flex items-center justify-between gap-2 text-xs font-bold cursor-pointer transition-colors ${
                                      isSelected
                                        ? 'bg-sky-50 text-sky-800'
                                        : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2 min-w-0 truncate">
                                      <MedicineCategorySymbol category={cat} size="xs" />
                                      <span className="truncate">
                                        {CATEGORY_DISPLAY_LABELS[cat] || cat}
                                      </span>
                                      {isSelected && (
                                        <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                      )}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCategoryOption(cat);
                                      }}
                                      title={`Hapus kategori ${cat}`}
                                      aria-label={`Hapus kategori ${cat}`}
                                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0 inline-flex items-center justify-center"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCategoryDropdownOpen(false);
                        setIsAddingCategory((prev) => !prev);
                        setNewCategoryInput('');
                      }}
                      title="Tambah nama kategori / golongan baru"
                      aria-label="Tambah nama kategori / golongan baru"
                      className={`p-2.5 rounded-xl border font-black transition cursor-pointer shrink-0 inline-flex items-center justify-center ${
                        isAddingCategory
                          ? 'bg-slate-200 border-slate-300 text-slate-700 hover:bg-slate-300'
                          : 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'
                      }`}
                    >
                      {isAddingCategory ? (
                        <X className="w-4 h-4" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {categoryValidationError && (
                    <p className="mt-1 text-[11px] font-bold text-rose-600">
                      {categoryValidationError}
                    </p>
                  )}
                  {isAddingCategory && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <MedicineCategorySymbol
                        category={newCategoryInput.trim() || 'Baru'}
                        size="sm"
                      />
                      <input
                        type="text"
                        autoFocus
                        placeholder="Nama kategori / golongan baru..."
                        value={newCategoryInput}
                        onChange={(e) => setNewCategoryInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleConfirmAddCategory();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setIsAddingCategory(false);
                            setNewCategoryInput('');
                          }
                        }}
                        className="flex-1 min-w-0 px-2.5 py-2 border border-sky-300 rounded-xl font-bold text-xs bg-sky-50/40 focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleConfirmAddCategory()}
                        disabled={!newCategoryInput.trim()}
                        className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-[11px] transition cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        Simpan
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kelas Terapi *</label>
                  <input
                    type="text"
                    list="kelasTerapiList"
                    required
                    placeholder="Contoh: Analgesik / Antipiretik, Antibiotik, dll"
                    value={form.kelas}
                    onChange={(e) => {
                      const nextKelas = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        kelas: nextKelas,
                        statusResep: !statusResepManuallyEditedRef.current
                          ? getDefaultPrescriptionStatusSuggestion({
                              category: prev.category,
                              kelas: nextKelas,
                              nappza: prev.nappza
                            })
                          : prev.statusResep
                      }));
                    }}
                    className="w-full p-2.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <datalist id="kelasTerapiList">
                    {Array.from(
                      new Set([
                        'Analgesik / Antipiretik',
                        'Antibiotik / Antimikroba',
                        'Antiinflamasi / NSAID',
                        'Antihipertensi (CCB / ACE-I / ARB)',
                        'Antidiabetes Oral',
                        'Antihistamin / Antialergi',
                        'Antitusif & Ekspektoran (Batuk / Flu)',
                        'Gastrointestinal (Antasida / PPI / H2 Blocker)',
                        'Antikolesterol / Statin',
                        'Kortikosteroid',
                        'Sedatif / Anxiolitik',
                        'Vitamin, Mineral & Suplemen',
                        'Herbal & Fitofarmaka',
                        'Alat Kesehatan Habis Pakai',
                        ...medicines.map((m) => m.kelas).filter((k): k is string => !!k)
                      ])
                    )
                      .sort()
                      .map((k) => (
                        <option key={k} value={k} />
                      ))}
                  </datalist>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Rak / Lokasi Penyimpanan
                  </label>
                  <input
                    type="text"
                    list="rackLocationList"
                    placeholder="Contoh: Rak A-1, Etalase Depan, Kulkas"
                    value={form.rack}
                    onChange={(e) => setForm({ ...form, rack: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <datalist id="rackLocationList">
                    {Array.from(
                      new Set([
                        'Rak A-1',
                        'Rak A-2',
                        'Rak B-1',
                        'Rak B-2',
                        'Rak C-1',
                        'Rak Obat Bebas',
                        'Rak Obat Keras',
                        'Etalase Depan',
                        'Lemari Narkotik & Psikotropik',
                        'Kulkas (2-8°C)',
                        ...medicines.map((m) => m.rack).filter((r): r is string => Boolean(r && r.trim()))
                      ])
                    )
                      .sort()
                      .map((r) => (
                        <option key={r} value={r} />
                      ))}
                  </datalist>
                </div>
              </div>

              {/* Rincian Zat Aktif & Kekuatan, Bentuk Sediaan, NAPPZA & Status Resep */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Zat Aktif &amp; Kekuatan *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Paracetamol 500 mg"
                    value={form.kekuatan}
                    onChange={(e) => setForm({ ...form, kekuatan: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-mono font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Nama zat aktif generik beserta dosis
                  </span>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Bentuk Sediaan *
                  </label>
                  <input
                    type="text"
                    list="bentukSediaanList"
                    required
                    placeholder="Contoh: Tablet, Kapsul, Sirup, Salep"
                    value={form.form}
                    onChange={(e) => setForm({ ...form, form: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <datalist id="bentukSediaanList">
                    {Array.from(
                      new Set([
                        ...COMMON_BENTUK_SEDIAAN_OPTIONS,
                        ...medicines.map((m) => m.form).filter((f): f is string => Boolean(f && f.trim()))
                      ])
                    )
                      .sort()
                      .map((opt) => (
                        <option key={opt} value={opt} />
                      ))}
                  </datalist>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Otomatis terbawa ke Form Pesanan Pembelian (PO)
                  </span>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori NAPPZA *</label>
                  <select
                    value={form.nappza}
                    onChange={(e) => {
                      const nextNappza = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        nappza: nextNappza,
                        statusResep: !statusResepManuallyEditedRef.current
                          ? getDefaultPrescriptionStatusSuggestion({
                              category: prev.category,
                              kelas: prev.kelas,
                              nappza: nextNappza
                            })
                          : prev.statusResep
                      }));
                    }}
                    className="w-full p-2.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  >
                    <option value="Non-NAPPZA">Non-NAPPZA (Bukan NAPPZA)</option>
                    <option value="Prekursor">Prekursor Farmasi (Wajib SIPNAP)</option>
                    <option value="OOT">OOT - Obat-Obat Tertentu (BPOM)</option>
                    <option value="Psikotropik">Psikotropik (Wajib SIPNAP)</option>
                    <option value="Narkotik">Narkotik (Wajib SIPNAP)</option>
                  </select>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Klasifikasi pelaporan regulasi BPOM &amp; SIPNAP
                  </span>
                </div>

                <div ref={statusResepDropdownRef} className="relative">
                  <label className="block font-bold text-slate-700 mb-1">
                    Status Resep (Order Portal) *
                  </label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsStatusResepDropdownOpen((prev) => !prev);
                        }}
                        aria-haspopup="listbox"
                        aria-expanded={isStatusResepDropdownOpen}
                        className="w-full p-2.5 border rounded-xl font-bold bg-white hover:bg-slate-50 focus:ring-2 focus:ring-sky-500 outline-none flex items-center justify-between gap-2 text-left cursor-pointer transition"
                      >
                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                          {(() => {
                            const statusEval = classifyPrescriptionStatusLabel(
                              form.statusResep || 'Tanpa Resep',
                              statusResepConfigs
                            );
                            return (
                              <>
                                <span
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusEval.colorTheme.dotClass}`}
                                />
                                <span className="truncate text-slate-800">
                                  {form.statusResep || 'Tanpa Resep'}
                                </span>
                              </>
                            );
                          })()}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
                            isStatusResepDropdownOpen ? 'rotate-180 text-sky-600' : ''
                          }`}
                        />
                      </button>

                      {isStatusResepDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
                            <div className="relative flex items-center">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                              <input
                                type="text"
                                autoFocus
                                placeholder="Cari status resep..."
                                value={statusResepSearchQuery}
                                onChange={(e) => setStatusResepSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (filteredStatusResepOptions.length > 0) {
                                      statusResepManuallyEditedRef.current = true;
                                      setForm({
                                        ...form,
                                        statusResep: filteredStatusResepOptions[0]
                                      });
                                      setStatusResepSearchQuery('');
                                      setIsStatusResepDropdownOpen(false);
                                    } else if (statusResepSearchQuery.trim()) {
                                      openAddStatusResepModal(statusResepSearchQuery);
                                    }
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setIsStatusResepDropdownOpen(false);
                                  }
                                }}
                                className="w-full pl-8 pr-7 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-400 outline-none text-slate-800 placeholder:text-slate-400 placeholder:font-semibold"
                              />
                              {statusResepSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setStatusResepSearchQuery('')}
                                  aria-label="Bersihkan pencarian status resep"
                                  className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div
                            role="listbox"
                            aria-label="Daftar Status Resep"
                            className="max-h-56 overflow-y-auto custom-scrollbar py-1"
                          >
                            {allStatusResepOptions.length === 0 ? (
                              <div className="px-3 py-2.5 text-[11px] text-slate-400 text-center">
                                Daftar status resep kosong. Klik tombol + untuk menambah.
                              </div>
                            ) : filteredStatusResepOptions.length === 0 ? (
                              <div className="px-3 py-2.5 text-center space-y-2">
                                <p className="text-[11px] text-slate-400">
                                  Status &ldquo;{statusResepSearchQuery.trim()}&rdquo; tidak ditemukan.
                                </p>
                                {statusResepSearchQuery.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => openAddStatusResepModal(statusResepSearchQuery)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 font-extrabold text-[11px] border border-sky-200 transition cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Tambah &ldquo;{statusResepSearchQuery.trim()}&rdquo;
                                  </button>
                                )}
                              </div>
                            ) : (
                              filteredStatusResepOptions.map((opt) => {
                                const isSelected =
                                  String(form.statusResep || '').trim().toLowerCase() ===
                                  opt.toLowerCase();
                                const optClass = classifyPrescriptionStatusLabel(
                                  opt,
                                  statusResepConfigs
                                );
                                return (
                                  <div
                                    key={opt}
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => {
                                      statusResepManuallyEditedRef.current = true;
                                      setForm({ ...form, statusResep: opt });
                                      setStatusResepSearchQuery('');
                                      setIsStatusResepDropdownOpen(false);
                                    }}
                                    className={`px-2.5 py-2 flex items-center justify-between gap-2 text-xs font-bold cursor-pointer transition-colors ${
                                      isSelected
                                        ? 'bg-sky-50 text-sky-900'
                                        : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      {isSelected ? (
                                        <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                      ) : (
                                        <span
                                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${optClass.colorTheme.dotClass}`}
                                        />
                                      )}
                                      <span className="truncate">{opt}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${optClass.colorTheme.portalBadgeClass}`}
                                      >
                                        {optClass.requiresRx ? 'Wajib Rx' : 'Tanpa Rx'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEditStatusResepModal(opt);
                                        }}
                                        title={`Atur / edit status ${opt}`}
                                        aria-label={`Atur status ${opt}`}
                                        className="p-1 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition cursor-pointer inline-flex items-center justify-center"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteStatusResepOption(opt);
                                        }}
                                        title={`Hapus status ${opt}`}
                                        aria-label={`Hapus status ${opt}`}
                                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer inline-flex items-center justify-center"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openAddStatusResepModal()}
                      title="Tambah / atur jenis status resep baru"
                      aria-label="Tambah jenis status resep baru"
                      className="p-2.5 rounded-xl border font-black transition cursor-pointer shrink-0 inline-flex items-center justify-center bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {(() => {
                    const previewReq = classifyPrescriptionStatusLabel(
                      form.statusResep || 'Tanpa Resep',
                      statusResepConfigs
                    );
                    return (
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-semibold ${previewReq.colorTheme.textClass}`}>
                          {previewReq.requiresRx
                            ? previewReq.requiresOriginalRx
                              ? 'Wajib unggah resep & serahkan resep asli'
                              : 'Wajib unggah foto/file resep (Rx) saat checkout'
                            : 'Order langsung tanpa wajib unggah resep'}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditStatusResepModal(form.statusResep || 'Tanpa Resep')}
                          className="text-[10px] font-bold text-sky-600 hover:text-sky-800 underline shrink-0 cursor-pointer"
                        >
                          Atur Status
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Satuan & Konversi */}
              <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider block">
                  Satuan &amp; Aturan Konversi
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Satuan Besar</label>
                    <input
                      type="text"
                      placeholder="Contoh: Box / Karton"
                      value={form.satuanBesar}
                      onChange={(e) => setForm({ ...form, satuanBesar: e.target.value })}
                      className="w-full p-2.5 border rounded-xl font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Satuan Terkecil</label>
                    <input
                      type="text"
                      placeholder="Contoh: Strip / Tablet / Botol"
                      value={form.satuanKecil}
                      onChange={(e) => setForm({ ...form, satuanKecil: e.target.value })}
                      className="w-full p-2.5 border rounded-xl font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Rasio Konversi</label>
                    <input
                      type="number"
                      min={1}
                      value={form.rasioKonversi}
                      onChange={(e) => updateRasio(parseInt(e.target.value) || 1)}
                      className="w-full p-2.5 border rounded-xl font-mono font-bold bg-white text-sky-700"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing & Markup */}
              <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div>
                    <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider block">
                      Perhitungan Harga: HNA, HPP (+11%), &amp; Harga Jual Bertingkat
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Ubah % Markup untuk menghitung Harga Jual otomatis, atau isi Harga Jual untuk
                      menghitung % Markup otomatis terhadap HPP.
                    </span>
                  </div>
                  <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-2.5 py-1 rounded-full border border-sky-200">
                    PPN 11% Standar
                  </span>
                </div>

                {/* Kolom 1 (HNA) & Kolom 2 (HPP Otomatis Terisi) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Kolom 1: HNA (Satuan Terbesar) */}
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
                    <div className="flex items-center justify-between gap-1">
                      <label className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-white inline-flex items-center justify-center text-[10px] font-black shrink-0">
                          1
                        </span>
                        <span>HNA ({form.satuanBesar || 'Box'}) *</span>
                      </label>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        Harga Netto Apotek
                      </span>
                    </div>

                    <div className="relative">
                      <span className="absolute left-3 top-2.5 font-bold text-slate-400 text-xs">
                        Rp
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={form.hnaBesar}
                        onChange={(e) => updateHna(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full pl-9 pr-3 py-2 border rounded-xl font-mono font-bold text-slate-900 text-sm bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                        placeholder="0"
                      />
                    </div>

                    <div className="text-[10px] text-slate-500 flex flex-wrap justify-between gap-1 pt-0.5 tabular-nums">
                      <span>
                        Rasio: 1 {form.satuanBesar || 'Box'} = {form.rasioKonversi}{' '}
                        {form.satuanKecil || 'Strip'}
                      </span>
                      <span className="font-mono font-semibold text-slate-700">
                        HNA/{form.satuanKecil || 'Satuan'}: Rp{' '}
                        {Math.round(
                          (Number(form.hnaBesar) || 0) /
                            Math.max(1, Number(form.rasioKonversi) || 1)
                        ).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>

                  {/* Kolom 2: HPP */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2 shadow-xs">
                    <div className="flex items-center justify-between gap-1">
                      <label className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-amber-600 text-white inline-flex items-center justify-center text-[10px] font-black shrink-0">
                          2
                        </span>
                        <span>HPP (HNA + 11%)</span>
                      </label>
                      <span className="text-[10px] font-black text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded border border-amber-300">
                        Input Manual / Otomatis
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 tabular-nums">
                      <div className="p-2 bg-white rounded-lg border border-amber-200 focus-within:ring-2 focus-within:ring-amber-400">
                        <span className="text-[10px] text-amber-800/80 font-bold block mb-1">
                          HPP / {form.satuanBesar || 'Box'}
                        </span>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 font-bold text-amber-600 text-[11px]">
                            Rp
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={form.hppBesar}
                            onChange={(e) =>
                              updateHppBesar(Math.max(0, parseFloat(e.target.value) || 0))
                            }
                            aria-label={`HPP per ${form.satuanBesar || 'Box'}`}
                            className="w-full pl-7 pr-2 py-1 border border-amber-200 rounded-md font-mono font-black text-amber-900 text-sm bg-amber-50/30 focus:bg-white outline-none"
                            placeholder="0"
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 block font-mono mt-1">
                          = Rp {Number(form.hnaBesar).toLocaleString('id-ID')} + 11%
                        </span>
                      </div>

                      <div className="p-2 bg-white rounded-lg border border-amber-300 ring-1 ring-amber-300 focus-within:ring-2 focus-within:ring-amber-500">
                        <span className="text-[10px] text-amber-800 font-bold block mb-1">
                          HPP / {form.satuanKecil || 'Strip'}
                        </span>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 font-bold text-amber-600 text-[11px]">
                            Rp
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={form.hppKecil}
                            onChange={(e) =>
                              updateHppKecil(Math.max(0, parseFloat(e.target.value) || 0))
                            }
                            aria-label={`HPP per ${form.satuanKecil || 'Strip'}`}
                            className="w-full pl-7 pr-2 py-1 border border-amber-200 rounded-md font-mono font-black text-amber-900 text-sm bg-amber-50/30 focus:bg-white outline-none"
                            placeholder="0"
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 block font-mono mt-1">
                          = HPP {form.satuanBesar || 'Box'} ÷ {form.rasioKonversi}
                        </span>
                      </div>
                    </div>

                    <div className="text-[10px] text-amber-800 flex items-center justify-between pt-0.5 font-medium tabular-nums">
                      <span>
                        PPN 11%: Rp{' '}
                        {Math.max(0, Math.round(hppBesar - hna)).toLocaleString('id-ID')}
                      </span>
                      <span className="font-bold text-amber-900">HNA ↔ HPP Dua Arah</span>
                    </div>
                  </div>
                </div>

                {/* Kolom 3: Harga Jual */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-sky-600 text-white inline-flex items-center justify-center text-[10px] font-black shrink-0">
                        3
                      </span>
                      <span>Harga Jual Bertingkat (% Markup &amp; Nominal Jual)</span>
                    </label>
                    <span className="text-[10px] text-slate-500 italic">
                      * % Markup &amp; Harga Jual saling menghitung otomatis
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* 1. Jual Reguler (OTC) */}
                    <div className="p-3 bg-white border-2 border-sky-200 rounded-xl space-y-2 shadow-xs">
                      <div className="flex items-center justify-between border-b border-sky-100 pb-1.5">
                        <span className="text-xs font-black text-sky-900">1. Jual Reguler (OTC)</span>
                        <span className="text-[9px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">
                          Umum
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            % Markup
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              value={form.markupReguler}
                              onChange={(e) =>
                                handleMarkupChange('reguler', parseFloat(e.target.value) || 0)
                              }
                              className="w-full pl-2 pr-6 py-1.5 border rounded-lg font-mono font-bold text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-sky-500 outline-none text-slate-800"
                            />
                            <span className="absolute right-2 top-1.5 text-[10px] font-bold text-slate-400">
                              %
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Harga Jual (Rp)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={form.sellPriceReguler}
                            onChange={(e) =>
                              handlePriceChange('reguler', parseInt(e.target.value) || 0)
                            }
                            className="w-full px-2 py-1.5 border rounded-lg font-mono font-black text-xs bg-white text-sky-900 focus:ring-1 focus:ring-sky-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="p-1.5 bg-slate-50 rounded-lg flex items-center justify-between text-[10px] tabular-nums">
                        <span className="text-slate-500 font-medium">
                          Margin/{form.satuanKecil || 'Satuan'}:
                        </span>
                        <span className="font-mono font-bold text-emerald-700">
                          +Rp{' '}
                          {Math.max(0, (Number(form.sellPriceReguler) || 0) - hppKecil).toLocaleString(
                            'id-ID'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* 2. Jual Pasien Klinik */}
                    <div className="p-3 bg-white border-2 border-indigo-200 rounded-xl space-y-2 shadow-xs">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5">
                        <span className="text-xs font-black text-indigo-900">
                          2. Jual Pasien Klinik
                        </span>
                        <span className="text-[9px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                          Klinik
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            % Markup
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              value={form.markupKlinik}
                              onChange={(e) =>
                                handleMarkupChange('klinik', parseFloat(e.target.value) || 0)
                              }
                              className="w-full pl-2 pr-6 py-1.5 border rounded-lg font-mono font-bold text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                            />
                            <span className="absolute right-2 top-1.5 text-[10px] font-bold text-slate-400">
                              %
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Harga Jual (Rp)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={form.sellPriceKlinik}
                            onChange={(e) =>
                              handlePriceChange('klinik', parseInt(e.target.value) || 0)
                            }
                            className="w-full px-2 py-1.5 border rounded-lg font-mono font-black text-xs bg-white text-indigo-900 focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="p-1.5 bg-slate-50 rounded-lg flex items-center justify-between text-[10px] tabular-nums">
                        <span className="text-slate-500 font-medium">
                          Margin/{form.satuanKecil || 'Satuan'}:
                        </span>
                        <span className="font-mono font-bold text-emerald-700">
                          +Rp{' '}
                          {Math.max(0, (Number(form.sellPriceKlinik) || 0) - hppKecil).toLocaleString(
                            'id-ID'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* 3. Jual Khusus Mitra */}
                    <div className="p-3 bg-white border-2 border-emerald-200 rounded-xl space-y-2 shadow-xs">
                      <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5">
                        <span className="text-xs font-black text-emerald-900">
                          3. Jual Khusus Mitra
                        </span>
                        <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Mitra
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            % Markup
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              value={form.markupMitra}
                              onChange={(e) =>
                                handleMarkupChange('mitra', parseFloat(e.target.value) || 0)
                              }
                              className="w-full pl-2 pr-6 py-1.5 border rounded-lg font-mono font-bold text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                            />
                            <span className="absolute right-2 top-1.5 text-[10px] font-bold text-slate-400">
                              %
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Harga Jual (Rp)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={form.sellPriceMitra}
                            onChange={(e) =>
                              handlePriceChange('mitra', parseInt(e.target.value) || 0)
                            }
                            className="w-full px-2 py-1.5 border rounded-lg font-mono font-black text-xs bg-white text-emerald-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="p-1.5 bg-slate-50 rounded-lg space-y-1 text-[10px] tabular-nums">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">
                            Harga/{form.satuanBesar || 'Box'}:
                          </span>
                          <span className="font-mono font-black text-emerald-800">
                            Rp{' '}
                            {Math.round((Number(form.sellPriceMitra) || 0) * ratio).toLocaleString(
                              'id-ID'
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">
                            Margin/{form.satuanKecil || 'Satuan'}:
                          </span>
                          <span className="font-mono font-bold text-emerald-700">
                            +Rp{' '}
                            {Math.max(0, (Number(form.sellPriceMitra) || 0) - hppKecil).toLocaleString(
                              'id-ID'
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Batch & FEFO Stock */}
              <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider block">
                      Informasi Stok Awal, Multi-Batch &amp; FEFO (First Expired First Out)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {isInitialStockEnabled
                        ? 'Pengisian kolom Stok Awal otomatis tercatat di Kartu Stok Digital (Obat Masuk · Ket: Stok Awal).'
                        : 'Input Stok Awal sedang DINONAKTIFKAN (OFF) oleh APJ / Owner.'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleInitialStock}
                      disabled={!isSuperAdmin}
                      title={
                        isSuperAdmin
                          ? 'Aktifkan/Nonaktifkan pengisian Stok Awal'
                          : 'Hanya dapat diaktifkan/dinonaktifkan oleh akun APJ / Owner'
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition ${
                        !isSuperAdmin
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : isInitialStockEnabled
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer'
                          : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 cursor-pointer'
                      }`}
                    >
                      {!isSuperAdmin && <Lock className="w-3 h-3 shrink-0" />}
                      <span>Stok Awal:</span>
                      <span
                        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                          isInitialStockEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            isInitialStockEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                          }`}
                        />
                      </span>
                      <span className="font-black">{isInitialStockEnabled ? 'ON' : 'OFF'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          batches: [
                            ...prev.batches,
                            {
                              id: `B-${Date.now().toString().slice(-5)}-${prev.batches.length + 1}`,
                              batchNo: '',
                              expDate: '',
                              stock: 0
                            }
                          ]
                        }))
                      }
                      className="px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-800 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Batch / ED</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {form.batches.map((b, bIdx) => (
                    <div
                      key={b.id || bIdx}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-white p-2.5 rounded-xl border border-slate-200"
                    >
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          Nomor Batch {form.batches.length > 1 ? `#${bIdx + 1}` : ''}
                        </label>
                        <input
                          type="text"
                          value={b.batchNo}
                          onChange={(e) => {
                            const val = e.target.value;
                            setForm((prev) => {
                              const nextBatches = prev.batches.map((item, idx) =>
                                idx === bIdx ? { ...item, batchNo: val } : item
                              );
                              const resolved = resolvePrimaryBatchAndStock(
                                nextBatches,
                                val,
                                prev.expDate,
                                false
                              );
                              return {
                                ...prev,
                                batches: nextBatches,
                                batchNo: resolved.batchNo,
                                expDate: resolved.expDate,
                                stock: resolved.stock
                              };
                            });
                          }}
                          placeholder="No. Batch"
                          className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-xs"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          Expired Date
                        </label>
                        <input
                          type="date"
                          value={b.expDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            setForm((prev) => {
                              const nextBatches = prev.batches.map((item, idx) =>
                                idx === bIdx ? { ...item, expDate: val } : item
                              );
                              const resolved = resolvePrimaryBatchAndStock(
                                nextBatches,
                                prev.batchNo,
                                val,
                                false
                              );
                              return {
                                ...prev,
                                batches: nextBatches,
                                batchNo: resolved.batchNo,
                                expDate: resolved.expDate,
                                stock: resolved.stock
                              };
                            });
                          }}
                          className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-xs"
                        />
                      </div>
                      <div className={form.batches.length > 1 ? 'sm:col-span-3' : 'sm:col-span-4'}>
                        <label className="flex items-center justify-between gap-1 text-[10px] font-bold text-slate-600 mb-1">
                          <span>Stok Awal ({form.satuanKecil || 'Unit'})</span>
                          {!isInitialStockEnabled && (
                            <span className="text-[9px] font-black text-rose-600 uppercase">
                              OFF
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          min={0}
                          disabled={!isInitialStockEnabled}
                          value={b.stock}
                          onChange={(e) => {
                            if (!isInitialStockEnabled) return;
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setForm((prev) => {
                              const nextBatches = prev.batches.map((item, idx) =>
                                idx === bIdx ? { ...item, stock: val } : item
                              );
                              const resolved = resolvePrimaryBatchAndStock(
                                nextBatches,
                                prev.batchNo,
                                prev.expDate,
                                false
                              );
                              return {
                                ...prev,
                                batches: nextBatches,
                                batchNo: resolved.batchNo,
                                expDate: resolved.expDate,
                                stock: resolved.stock
                              };
                            });
                          }}
                          className={`w-full p-2 border rounded-xl font-mono font-bold text-xs ${
                            isInitialStockEnabled
                              ? 'bg-white text-slate-900'
                              : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                          }`}
                        />
                      </div>
                      {form.batches.length > 1 && (
                        <div className="sm:col-span-1 flex justify-end pb-1">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => {
                                const nextBatches = prev.batches.filter((_, idx) => idx !== bIdx);
                                const resolved = resolvePrimaryBatchAndStock(
                                  nextBatches,
                                  prev.batchNo,
                                  prev.expDate,
                                  false
                                );
                                return {
                                  ...prev,
                                  batches: nextBatches,
                                  batchNo: resolved.batchNo,
                                  expDate: resolved.expDate,
                                  stock: resolved.stock
                                };
                              });
                            }}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Hapus Batch ini"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      Total Stok Awal (Semua Batch)
                    </label>
                    <input
                      type="number"
                      readOnly
                      value={form.stock}
                      className="w-full p-2.5 border rounded-xl font-mono font-black bg-slate-100 text-slate-800 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Buffer Minimum</label>
                    <input
                      type="number"
                      value={form.minStock}
                      onChange={(e) =>
                        setForm({ ...form, minStock: parseInt(e.target.value) || 0 })
                      }
                      className="w-full p-2.5 border rounded-xl font-mono font-bold bg-white tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t sticky bottom-0 bg-white py-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[42px] px-4 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-[42px] px-6 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-black rounded-xl shadow-md uppercase tracking-wider cursor-pointer"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Master Obat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Medicine Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-slate-900">Hapus Data Obat?</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Anda yakin ingin menghapus <strong>{deleteTarget.name}</strong> ({deleteTarget.id})
                  dari Master Obat? Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteMedicine(deleteTarget.id);
                  showBanner('success', `Obat "${deleteTarget.name}" telah dihapus.`);
                  setDeleteTarget(null);
                  if (useServerPagination) {
                    setTimeout(triggerServerRefresh, 350);
                  }
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
              >
                Ya, Hapus Obat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Medicines Confirmation Modal */}
      {showClearConfirm && onClearMedicines && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-slate-900">Bersihkan Seluruh Master Obat?</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Seluruh data obat dan harga bertingkat akan dihapus dari daftar aktif. Pastikan
                  Anda telah melakukan Export/Backup sebelum melanjutkan.
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearMedicines();
                  showBanner('success', 'Seluruh data master obat telah dibersihkan.');
                  setShowClearConfirm(false);
                  if (useServerPagination) {
                    setTimeout(triggerServerRefresh, 350);
                  }
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
              >
                Ya, Bersihkan Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skema SQL Supabase Master Data Obat Modal (APJ / Owner Only) */}
      {isSuperAdmin && showSchemaModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-600" />
                  Skema SQL Supabase — Master Data Obat &amp; Harga Bertingkat
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tabel <strong className="font-mono">{medicineTableInput}</strong> untuk sinkronisasi 2-arah &amp; real-time stok, batch FEFO, zat aktif &amp; kekuatan, bentuk sediaan (<span className="font-mono">form</span>), serta harga bertingkat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSchemaModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer"
                aria-label="Tutup modal skema SQL"
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
                    Nama Tabel Master Obat di Supabase
                  </label>
                  <input
                    type="text"
                    value={medicineTableInput}
                    onChange={(e) => setMedicineTableInput(e.target.value)}
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
                  {SUPABASE_MEDICINES_SQL_SCHEMA}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form Tambah / Edit & Pengaturan Jenis Status Resep */}
      {isStatusResepModalOpen && (
        <div
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-[70] p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Pengaturan Jenis Status Resep"
        >
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="px-4 sm:px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Palette className="w-4 h-4 text-sky-400 shrink-0" />
                <h3 className="font-extrabold text-xs sm:text-sm uppercase tracking-wide truncate">
                  {statusResepForm.id || statusResepForm.previousName
                    ? 'Edit Jenis Status Resep'
                    : 'Tambah Jenis Status Resep'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStatusResepModalOpen(false)}
                aria-label="Tutup pengaturan status resep"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar text-xs">
              {/* Input Nama / Jenis Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama / Jenis Status Resep *
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Contoh: Wajib Resep Dokter, Bebas / OTC, Resep Khusus..."
                  value={statusResepForm.name}
                  onChange={(e) => {
                    setStatusResepForm({ ...statusResepForm, name: e.target.value });
                    if (statusResepFormError) setStatusResepFormError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveStatusResepConfig();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsStatusResepModalOpen(false);
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-400 outline-none"
                />
                {statusResepFormError && (
                  <p className="text-[11px] font-bold text-rose-600 mt-1">{statusResepFormError}</p>
                )}
              </div>

              {/* Pengaturan Wajib Upload Rx */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <span className="font-black text-[11px] uppercase tracking-wider text-slate-700 block">
                  Aturan Order di Ruang Reguler
                </span>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={statusResepForm.requiresRx}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setStatusResepForm((prev) => ({
                        ...prev,
                        requiresRx: checked,
                        requiresOriginalRx: checked ? prev.requiresOriginalRx : false
                      }));
                    }}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-extrabold text-slate-900 block">
                      Wajib Upload Resep (Rx)
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Jika dicentang, pembeli di Ruang Order Reguler wajib mengunggah foto/file resep sebelum checkout. Jika tidak dicentang, produk dapat diorder langsung tanpa resep.
                    </span>
                  </div>
                </label>

                {statusResepForm.requiresRx && (
                  <label className="flex items-start gap-2.5 pl-6 pt-2 border-t border-slate-200/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={statusResepForm.requiresOriginalRx}
                      onChange={(e) =>
                        setStatusResepForm((prev) => ({
                          ...prev,
                          requiresOriginalRx: e.target.checked
                        }))
                      }
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-slate-800 block">
                        Wajib Serahkan Resep Asli Fisik
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Tandai khusus untuk obat yang memerlukan penyerahan resep fisik asli saat pengambilan/pengiriman (mis. Narkotik / Psikotropik).
                      </span>
                    </div>
                  </label>
                )}
              </div>

              {/* Pilihan Warna Penanda */}
              <div className="space-y-2">
                <span className="block font-bold text-slate-700">Pilihan Warna Penanda</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESCRIPTION_STATUS_COLOR_PALETTE.map((theme) => {
                    const isPicked = statusResepForm.color === theme.key;
                    return (
                      <button
                        key={theme.key}
                        type="button"
                        onClick={() =>
                          setStatusResepForm((prev) => ({ ...prev, color: theme.key }))
                        }
                        className={`px-2.5 py-2 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                          isPicked
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full shrink-0 border border-white/60 shadow-2xs ${theme.dotClass}`}
                        />
                        <span className="font-bold text-[11px] truncate">{theme.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pratinjau Penanda */}
              {(() => {
                const selectedTheme = getPrescriptionStatusColorTheme(statusResepForm.color);
                const previewName = statusResepForm.name.trim() || 'Nama Status Resep';
                return (
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-600">Pratinjau Penanda:</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black border ${selectedTheme.badgeClass}`}
                    >
                      {statusResepForm.requiresRx ? (
                        <ShieldAlert className="w-3 h-3 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                      )}
                      <span>{previewName}</span>
                    </span>
                  </div>
                );
              })()}

              {/* Tombol Simpan / Batal */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsStatusResepModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveStatusResepConfig}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold shadow-xs cursor-pointer"
                >
                  Simpan &amp; Gunakan Status
                </button>
              </div>

              {/* Daftar Pengaturan Status Resep Tersimpan */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-[11px] uppercase tracking-wider text-slate-600">
                    Daftar Status Resep ({statusResepConfigs.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleResetStatusResepConfigs}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                    title="Kembalikan pengaturan default"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Default</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto custom-scrollbar">
                  {statusResepConfigs.length === 0 ? (
                    <div className="p-3 text-center text-[11px] text-slate-400">
                      Belum ada status resep terkonfigurasi.
                    </div>
                  ) : (
                    statusResepConfigs.map((cfg) => {
                      const theme = getPrescriptionStatusColorTheme(cfg.color);
                      const isEditingThis =
                        statusResepForm.id === cfg.id ||
                        (statusResepForm.previousName &&
                          statusResepForm.previousName.toLowerCase() === cfg.name.toLowerCase());
                      return (
                        <div
                          key={cfg.id}
                          className={`px-3 py-2 flex items-center justify-between gap-2 ${
                            isEditingThis ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${theme.dotClass}`} />
                            <div className="min-w-0">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black border ${theme.badgeClass}`}
                              >
                                {cfg.requiresRx ? (
                                  <ShieldAlert className="w-2.5 h-2.5 shrink-0" />
                                ) : (
                                  <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                                )}
                                <span className="truncate">{cfg.name}</span>
                              </span>
                              <span className="block text-[10px] text-slate-500 mt-0.5">
                                {cfg.requiresRx
                                  ? cfg.requiresOriginalRx
                                    ? 'Wajib Upload Rx + Resep Asli Fisik'
                                    : 'Wajib Upload Foto/File Resep (Rx)'
                                  : 'Order Langsung Tanpa Upload Resep'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditStatusResepModal(cfg)}
                              title={`Edit ${cfg.name}`}
                              aria-label={`Edit ${cfg.name}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStatusResepOption(cfg.id)}
                              title={`Hapus ${cfg.name}`}
                              aria-label={`Hapus ${cfg.name}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {inventoryScannerTarget !== null && (
        <Suspense fallback={null}>
          <CameraBarcodeScannerModal
            isOpen={true}
            onClose={() => setInventoryScannerTarget(null)}
            title={
              inventoryScannerTarget === 'form'
                ? 'Scan Barcode Kemasan Obat'
                : 'Scan Barcode Master Obat'
            }
            subtitle={
              inventoryScannerTarget === 'form'
                ? 'Arahkan kamera ke barcode kemasan pabrik untuk mengisinya ke form obat.'
                : 'Arahkan kamera ke barcode obat untuk langsung mencari di daftar Master Obat.'
            }
            scanMode="barcode"
            onScanSuccess={(decoded) => {
              if (inventoryScannerTarget === 'form') {
                setForm((prev) => ({ ...prev, barcode: decoded }));
              } else {
                setCategoryFilter('SEMUA');
                setStockStatusFilter('SEMUA');
                setSearchTerm(decoded);
                setCurrentPage(1);
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
