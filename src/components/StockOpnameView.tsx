import React, { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { demoGetItem, demoSetItem, demoRemoveItem } from '../utils/demoSandbox';
import {
  ClipboardCheck,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Printer,
  Save,
  Clock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Boxes,
  Barcode,
  RotateCcw,
  Check,
  ShieldCheck,
  ShoppingCart,
  FileText,
  X,
  History,
  Calendar,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Plus,
  Database,
  Code,
  AlertCircle,
  Copy,
  Lock,
  Unlock,
  Users,
  Radio,
  User,
  Loader2,
  Camera
} from 'lucide-react';
import { Medicine, Transaction, StockMutation, Branch, StockOpnameRecord, StockOpnameItemRecord, StockOpnameKind, LiveOpnameItemActivity, Staff } from '../types';
import { openPrintWindow } from '../utils/printHelper';
import { getNormalizedBatches, resolvePrimaryBatchAndStock } from '../utils/batchHelper';
import {
  PaginationControls,
  DEFAULT_PAGE_SIZE_OPTIONS
} from './PaginationControls';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';
import { playBarcodeBeep } from '../utils/barcodeBeep';
const CameraBarcodeScannerModal = lazy(() =>
  import('./CameraBarcodeScannerModal').then((m) => ({ default: m.CameraBarcodeScannerModal }))
);
import {
  SUPABASE_OPNAME_SQL_SCHEMA,
  DEFAULT_OPNAME_TABLE,
  getSupabaseConfig,
  setSupabaseConfig,
  getClientOpnameSessionId,
  subscribeLiveOpnameActivityChannel,
  LiveOpnameActivityController,
  fetchMedicinesPaginatedFromSupabase,
  fetchMedicineFilterFacetsFromSupabase,
  fetchMedicineByBarcodeOrIdFromSupabase,
  fetchMedicinesByIdsFromSupabase,
  fetchOpnameRecordsPaginatedFromSupabase,
  deleteOpnameRecordsFromSupabase
} from '../utils/supabaseClient';
import {
  getDeletedIdsSet,
  getPendingDeleteIds,
  confirmCloudDeletes,
  getDeletedOpnameRefsSet
} from '../utils/deletionRegistry';
import { useIsOwnerAdmin } from '../utils/roleAccess';

interface StockOpnameViewProps {
  medicines: Medicine[];
  transactions: Transaction[];
  currentBranch: Branch;
  userName: string;
  staffList?: Staff[];
  onApplyStockOpname: (
    adjustments: {
      medicineId: string;
      medicineName: string;
      finalStock: number;
      difference: number;
      reason: string;
      systemStock?: number;
      hpp?: number;
      hppBesar?: number;
      hppUpdated?: boolean;
      sellPrice?: number;
      unit?: string;
      batchNo?: string;
      expDate?: string;
      batches?: {
        id?: string;
        batchNo: string;
        expDate: string;
        systemStock?: number;
        physicalStock?: number;
        stock?: number;
        difference?: number;
      }[];
    }[],
    notes?: string,
    customPetugas?: string,
    opnameKind?: StockOpnameKind
  ) => void;
  opnameRecords?: StockOpnameRecord[];
  stockMutations?: StockMutation[];
  onDeleteOpnameRecord?: (id: string, refNo?: string) => Promise<{
    success?: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> | void;
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

interface OpnameBatchEntry {
  id: string;
  batchNo: string;
  expDate: string;
  systemStock: number;
  physicalStock: string; // empty string = uncounted
  physicalBesar?: string;
  physicalKecil?: string;
}

interface OpnameItemState {
  physicalStock: string; // string for input handling (total in small unit)
  physicalBesar?: string; // string for input handling (large unit, e.g. Box)
  physicalKecil?: string; // string for input handling (small unit, e.g. Tablet)
  hppBesar?: string; // string for HPP per satuan besar (e.g. Box)
  hppKecil?: string; // string for HPP per satuan kecil (e.g. Tablet/Strip)
  batchEntries?: OpnameBatchEntry[]; // Multi-batch & multi-ED entries
  batchModified?: boolean;
  countedAt?: string;
  notes?: string;
}

export const StockOpnameView: React.FC<StockOpnameViewProps> = ({
  medicines,
  transactions,
  currentBranch,
  userName,
  staffList = [],
  onApplyStockOpname,
  opnameRecords = [],
  stockMutations = [],
  onDeleteOpnameRecord,
  onSyncSupabase,
  needsTableSetup = false,
  isDemoSandbox = false
}) => {
  const isOwnerAdmin = useIsOwnerAdmin();
  const [selectedOpnameStaff, setSelectedOpnameStaff] = useState(userName);
  const [opnameKind, setOpnameKind] = useState<StockOpnameKind>(() => {
    const saved = demoGetItem('latisha_opname_kind');
    return saved === 'STOK_AWAL' ? 'STOK_AWAL' : 'PENYESUAIAN_STOK';
  });

  useEffect(() => {
    demoSetItem('latisha_opname_kind', opnameKind);
  }, [opnameKind]);

  useEffect(() => {
    setSelectedOpnameStaff(userName);
  }, [userName]);
  const toLocalYMD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // View Mode: 'live' (Form Stokopname) or 'history' (Halaman Riwayat Opname)
  const [viewMode, setViewMode] = useState<'live' | 'history'>('live');

  // Date Range Filter & Pagination for Riwayat Opname
  const [historyPreset, setHistoryPreset] = useState<'all' | 'today' | '7days' | 'month' | 'custom'>('all');
  const [historyStartDate, setHistoryStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return toLocalYMD(d);
  });
  const [historyEndDate, setHistoryEndDate] = useState<string>(() => toLocalYMD(new Date()));
  const [historySearch, setHistorySearch] = useState('');
  const [debouncedHistorySearch, setDebouncedHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyPageSize, setHistoryPageSize] = useState<number>(() => {
    const saved = Number(demoGetItem('latisha_opname_history_page_size'));
    return (DEFAULT_PAGE_SIZE_OPTIONS as readonly number[]).includes(saved) ? saved : 25;
  });
  const [serverHistoryRecords, setServerHistoryRecords] = useState<StockOpnameRecord[]>([]);
  const [serverHistoryTotalCount, setServerHistoryTotalCount] = useState<number>(0);
  const [serverHistoryTotalPages, setServerHistoryTotalPages] = useState<number>(1);
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);
  const [historyRefreshTick, setHistoryRefreshTick] = useState<number>(0);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  const handleSelectHistoryPreset = (preset: 'all' | 'today' | '7days' | 'month' | 'custom') => {
    setHistoryPreset(preset);
    const now = new Date();
    const todayStr = toLocalYMD(now);
    if (preset === 'today') {
      setHistoryStartDate(todayStr);
      setHistoryEndDate(todayStr);
    } else if (preset === '7days') {
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 6);
      setHistoryStartDate(toLocalYMD(d7));
      setHistoryEndDate(todayStr);
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setHistoryStartDate(toLocalYMD(firstDay));
      setHistoryEndDate(todayStr);
    }
  };

  // Combine opnameRecords and any non-deleted legacy STOK_OPNAME mutations into unified history records
  const allOpnameHistory = useMemo<StockOpnameRecord[]>(() => {
    const deletedIdsSet = getDeletedIdsSet('opname_records');
    const deletedRefsSet = getDeletedOpnameRefsSet();

    const list: StockOpnameRecord[] = opnameRecords.filter(
      (r) => r?.id && !deletedIdsSet.has(String(r.id).trim())
    );
    const existingRefNos = new Set(list.map((r) => r.refNo));

    const opnameMuts = stockMutations.filter(
      (m) =>
        m.type === 'STOK_OPNAME' &&
        m.refNo &&
        !existingRefNos.has(m.refNo) &&
        !deletedRefsSet.has(String(m.refNo).trim())
    );
    if (opnameMuts.length > 0) {
      const grouped = new Map<string, StockMutation[]>();
      opnameMuts.forEach((m) => {
        const key = `${m.date}__${m.refNo}`;
        if (deletedIdsSet.has(`OPN-HIST-${key}`)) return;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(m);
      });

      grouped.forEach((muts, key) => {
        const first = muts[0];
        const items: StockOpnameItemRecord[] = muts.map((m) => {
          const med = medicines.find((item) => item.id === m.medicineId);
          const hpp = m.hpp ?? med?.hpp ?? 0;
          const sellPrice = med?.sellPrice ?? 0;
          const diff = m.inQty > 0 ? m.inQty : -m.outQty;
          const sysStock = m.balance - diff;
          return {
            medicineId: m.medicineId,
            medicineName: m.medicineName,
            unit: med?.unit || 'Unit',
            hpp,
            sellPrice,
            systemStock: sysStock,
            physicalStock: m.balance,
            difference: diff,
            nominalDiffHpp: diff * hpp,
            nominalDiffSell: diff * sellPrice,
            reason: m.ket
          };
        });

        const surplusItems = items.filter((i) => i.difference > 0);
        const deficitItems = items.filter((i) => i.difference < 0);
        const totalSurplusNominal = surplusItems.reduce((acc, i) => acc + i.nominalDiffHpp, 0);
        const totalDeficitNominal = deficitItems.reduce((acc, i) => acc + Math.abs(i.nominalDiffHpp), 0);

        list.push({
          id: `OPN-HIST-${key}`,
          refNo: first.refNo,
          date: first.date.split(' ')[0].split('T')[0],
          time: first.time,
          petugas: first.petugas,
          branchId: first.branchId,
          branchName: currentBranch.name,
          totalItemsCounted: items.length,
          matchCount: items.filter((i) => i.difference === 0).length,
          surplusCount: surplusItems.length,
          deficitCount: deficitItems.length,
          totalSurplusNominal,
          totalDeficitNominal,
          netNominalDiff: totalSurplusNominal - totalDeficitNominal,
          notes: 'Rekonsiliasi Kartu Stok Opname',
          items
        });
      });
    }

    return list.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  }, [opnameRecords, stockMutations, medicines, currentBranch.name, historyRefreshTick]);

  // Filtered History by Date Range and Search (used in local/demo/offline fallback)
  const filteredOpnameHistory = useMemo(() => {
    const now = new Date();
    const todayStr = toLocalYMD(now);
    const d7 = new Date(now);
    d7.setDate(d7.getDate() - 6);
    const d7Str = toLocalYMD(d7);
    const curMonth = todayStr.slice(0, 7);

    return allOpnameHistory.filter((rec) => {
      const recDate = rec.date ? rec.date.split('T')[0].split(' ')[0] : '';
      if (historyPreset === 'today') {
        if (recDate !== todayStr) return false;
      } else if (historyPreset === '7days') {
        if (recDate < d7Str || recDate > todayStr) return false;
      } else if (historyPreset === 'month') {
        if (!recDate.startsWith(curMonth)) return false;
      } else if (historyPreset === 'custom') {
        if (historyStartDate && recDate < historyStartDate) return false;
        if (historyEndDate && recDate > historyEndDate) return false;
      }

      if (debouncedHistorySearch.trim()) {
        const q = debouncedHistorySearch.toLowerCase();
        const matchRef = rec.refNo.toLowerCase().includes(q) || rec.id.toLowerCase().includes(q);
        const matchPetugas = rec.petugas.toLowerCase().includes(q);
        const matchNotes = (rec.notes || '').toLowerCase().includes(q);
        const matchMed = rec.items.some((i) => i.medicineName.toLowerCase().includes(q));
        if (!matchRef && !matchPetugas && !matchNotes && !matchMed) return false;
      }

      return true;
    });
  }, [allOpnameHistory, historyPreset, historyStartDate, historyEndDate, debouncedHistorySearch]);

  const supabaseConf = getSupabaseConfig();
  const [serverNeedsMedicineSetup, setServerNeedsMedicineSetup] = useState<boolean>(false);
  const useServerPagination = Boolean(
    supabaseConf.url && supabaseConf.key && !isDemoSandbox && !serverNeedsMedicineSetup
  );
  const useServerHistoryPagination = Boolean(
    supabaseConf.url && supabaseConf.key && !isDemoSandbox && !needsTableSetup
  );

  // Debounce history search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedHistorySearch(historySearch.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [historySearch]);

  useEffect(() => {
    setHistoryPage(1);
  }, [debouncedHistorySearch, historyPreset, historyStartDate, historyEndDate]);

  // Fetch paginated Riwayat Opname from Supabase when History tab is active (flushes pending deletes & filters tombstones)
  useEffect(() => {
    if (viewMode !== 'history' || !useServerHistoryPagination) return;

    let cancelled = false;
    setIsHistoryLoading(true);

    (async () => {
      try {
        const pendingDeletes = getPendingDeleteIds('opname_records');
        if (pendingDeletes.length > 0) {
          const delRes = await deleteOpnameRecordsFromSupabase(pendingDeletes).catch(() => ({
            success: false
          }));
          if (cancelled) return;
          if (delRes.success) {
            confirmCloudDeletes('opname_records', pendingDeletes);
          }
        }

        const res = await fetchOpnameRecordsPaginatedFromSupabase({
          page: historyPage,
          pageSize: historyPageSize,
          searchQuery: debouncedHistorySearch,
          preset: historyPreset,
          startDate: historyStartDate,
          endDate: historyEndDate
        });
        if (cancelled) return;

        if (res.data) {
          const deletedSet = getDeletedIdsSet('opname_records');
          const stubbornIds = res.data
            .filter((r) => r.id && deletedSet.has(String(r.id).trim()))
            .map((r) => String(r.id).trim());
          if (stubbornIds.length > 0) {
            deleteOpnameRecordsFromSupabase(stubbornIds)
              .then((cleanupRes) => {
                if (cleanupRes.success) {
                  confirmCloudDeletes('opname_records', stubbornIds);
                }
              })
              .catch(() => {});
          }

          const cleanPage = res.data.filter(
            (r) => r.id && !deletedSet.has(String(r.id).trim())
          );
          const removedOnPage = res.data.length - cleanPage.length;
          const adjustedTotal = Math.max(cleanPage.length, res.totalCount - removedOnPage);
          const adjustedTotalPages = Math.max(1, Math.ceil(adjustedTotal / historyPageSize));

          setServerHistoryRecords(cleanPage);
          setServerHistoryTotalCount(adjustedTotal);
          setServerHistoryTotalPages(adjustedTotalPages);
        }
      } finally {
        if (!cancelled) setIsHistoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    viewMode,
    useServerHistoryPagination,
    historyPage,
    historyPageSize,
    debouncedHistorySearch,
    historyPreset,
    historyStartDate,
    historyEndDate,
    historyRefreshTick,
    opnameRecords.length
  ]);

  const totalHistoryItems = useServerHistoryPagination
    ? serverHistoryTotalCount
    : filteredOpnameHistory.length;
  const totalHistoryPages = useServerHistoryPagination
    ? serverHistoryTotalPages
    : Math.max(1, Math.ceil(filteredOpnameHistory.length / historyPageSize));
  const safeHistoryPage = Math.min(Math.max(1, historyPage), totalHistoryPages);

  const paginatedOpnameHistory = useMemo(() => {
    if (useServerHistoryPagination) return serverHistoryRecords;
    const start = (safeHistoryPage - 1) * historyPageSize;
    return filteredOpnameHistory.slice(start, start + historyPageSize);
  }, [
    useServerHistoryPagination,
    serverHistoryRecords,
    filteredOpnameHistory,
    safeHistoryPage,
    historyPageSize
  ]);

  const handleHistoryPageSizeChange = (nextSize: number) => {
    setHistoryPageSize(nextSize);
    demoSetItem('latisha_opname_history_page_size', String(nextSize));
    setHistoryPage(1);
  };

  const historySummary = useMemo(() => {
    const sourceRecords = useServerHistoryPagination ? serverHistoryRecords : filteredOpnameHistory;
    const totalSessions = totalHistoryItems;
    const totalSurplus = sourceRecords.reduce((acc, r) => acc + r.totalSurplusNominal, 0);
    const totalDeficit = sourceRecords.reduce((acc, r) => acc + r.totalDeficitNominal, 0);
    const netNominal = totalSurplus - totalDeficit;
    const totalItemsEvaluated = sourceRecords.reduce((acc, r) => acc + r.totalItemsCounted, 0);
    return { totalSessions, totalSurplus, totalDeficit, netNominal, totalItemsEvaluated };
  }, [useServerHistoryPagination, serverHistoryRecords, filteredOpnameHistory, totalHistoryItems]);

  // 4-Month Cutoff Date & Historical Opname Tracking (per Medicine & per User Account)
  const fourMonthsAgoStr = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 4);
    return toLocalYMD(d);
  }, []);

  const medicineOpnameHistoryMap = useMemo(() => {
    const map: Record<
      string,
      { lastOpnameDate: string; lastPetugas: string; opnamedInLast4Months: boolean }
    > = {};

    allOpnameHistory.forEach((rec) => {
      const recDate = rec.date ? rec.date.split('T')[0].split(' ')[0] : '';
      if (!recDate) return;
      rec.items?.forEach((it) => {
        if (!it.medicineId) return;
        const existing = map[it.medicineId];
        if (!existing || recDate > existing.lastOpnameDate) {
          map[it.medicineId] = {
            lastOpnameDate: recDate,
            lastPetugas: rec.petugas || '-',
            opnamedInLast4Months: recDate >= fourMonthsAgoStr
          };
        } else if (recDate >= fourMonthsAgoStr && !existing.opnamedInLast4Months) {
          existing.opnamedInLast4Months = true;
        }
      });
    });

    stockMutations
      .filter((m) => m.type === 'STOK_OPNAME')
      .forEach((m) => {
        const mutDate = m.date ? m.date.split('T')[0].split(' ')[0] : '';
        if (!mutDate || !m.medicineId) return;
        const existing = map[m.medicineId];
        if (!existing || mutDate > existing.lastOpnameDate) {
          map[m.medicineId] = {
            lastOpnameDate: mutDate,
            lastPetugas: m.petugas || '-',
            opnamedInLast4Months: mutDate >= fourMonthsAgoStr
          };
        } else if (mutDate >= fourMonthsAgoStr && !existing.opnamedInLast4Months) {
          existing.opnamedInLast4Months = true;
        }
      });

    return map;
  }, [allOpnameHistory, stockMutations, fourMonthsAgoStr]);

  const userOpnameStatus = useMemo(() => {
    const normalizeOfficer = (name: string) =>
      name
        .replace(/\b(apt|dr|drg|ns|prof|hj|h)\b\.?\s*/gi, '')
        .replace(/,\s*(s\.?farm|m\.?farm|sp\.?pd|sp\.?a|sp\.?og|s\.?kep|a\.?md\.?far|a\.?md\.?kep|s\.?ked|m\.?kes|apt)\b.*/gi, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    const targetNorm = normalizeOfficer(userName || '');
    const isSameUser = (petugasName?: string) => {
      if (!petugasName || !targetNorm) return false;
      const pNorm = normalizeOfficer(petugasName);
      if (!pNorm) return false;
      return (
        pNorm === targetNorm ||
        (pNorm.length >= 3 &&
          targetNorm.length >= 3 &&
          (pNorm.includes(targetNorm) || targetNorm.includes(pNorm)))
      );
    };

    let lastUserOpnameDate = '';
    let hasOpnameInLast4Months = false;

    allOpnameHistory.forEach((rec) => {
      if (!isSameUser(rec.petugas)) return;
      const recDate = rec.date ? rec.date.split('T')[0].split(' ')[0] : '';
      if (!recDate) return;
      if (!lastUserOpnameDate || recDate > lastUserOpnameDate) {
        lastUserOpnameDate = recDate;
      }
      if (recDate >= fourMonthsAgoStr) {
        hasOpnameInLast4Months = true;
      }
    });

    stockMutations
      .filter((m) => m.type === 'STOK_OPNAME')
      .forEach((m) => {
        if (!isSameUser(m.petugas)) return;
        const mutDate = m.date ? m.date.split('T')[0].split(' ')[0] : '';
        if (!mutDate) return;
        if (!lastUserOpnameDate || mutDate > lastUserOpnameDate) {
          lastUserOpnameDate = mutDate;
        }
        if (mutDate >= fourMonthsAgoStr) {
          hasOpnameInLast4Months = true;
        }
      });

    return {
      hasOpnameInLast4Months,
      lastUserOpnameDate
    };
  }, [allOpnameHistory, stockMutations, userName, fourMonthsAgoStr]);

  // Session start timestamp (persisted in localStorage so refreshing doesn't lose live count)
  const [sessionStartTime, setSessionStartTime] = useState<string>(() => {
    const saved = demoGetItem('latisha_opname_session_time');
    if (saved) return saved;
    const now = new Date().toISOString();
    demoSetItem('latisha_opname_session_time', now);
    return now;
  });

  // Physical count state dictionary: { [medicineId]: { physicalStock, countedAt, notes } }
  const [counts, setCounts] = useState<Record<string, OpnameItemState>>(() => {
    try {
      const saved = demoGetItem('latisha_opname_counts');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Filters & Server-Side Pagination State (Live Opname)
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedRack, setSelectedRack] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COUNTED' | 'UNCOUNTED' | 'DISCREPANCY' | 'MATCH' | 'BEING_COUNTED_OTHER'>('ALL');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [isBarcodeSearching, setIsBarcodeSearching] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = Number(demoGetItem('latisha_opname_page_size'));
    return (DEFAULT_PAGE_SIZE_OPTIONS as readonly number[]).includes(saved) ? saved : 25;
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [serverMedicines, setServerMedicines] = useState<Medicine[]>([]);
  const [serverTotalCount, setServerTotalCount] = useState<number>(0);
  const [serverTotalPages, setServerTotalPages] = useState<number>(1);
  const [isServerLoading, setIsServerLoading] = useState<boolean>(false);
  const [serverRefreshTick, setServerRefreshTick] = useState<number>(0);
  const [serverFacets, setServerFacets] = useState<{
    categories: string[];
    racks: string[];
    totalCount: number;
  }>({ categories: [], racks: [], totalCount: 0 });
  const [cachedMedicinesById, setCachedMedicinesById] = useState<Record<string, Medicine>>({});

  // Real-time Multi-User In-Progress Counting State (Anti Double-Opname)
  const myOpnameSessionId = useMemo(() => getClientOpnameSessionId(), []);
  const [remoteOpnameActivities, setRemoteOpnameActivities] = useState<
    Record<string, LiveOpnameItemActivity[]>
  >({});
  const [focusedMedicineId, setFocusedMedicineId] = useState<string | null>(null);
  const [overriddenLocks, setOverriddenLocks] = useState<Record<string, boolean>>({});
  const activityControllerRef = useRef<LiveOpnameActivityController | null>(null);
  const prevOpnameIdsRef = useRef<Set<string> | null>(null);

  // Subscribe to Real-Time Multi-User Opname Activity Channel
  useEffect(() => {
    const controller = subscribeLiveOpnameActivityChannel({
      sessionId: myOpnameSessionId,
      onRemoteActivitiesChange: (grouped) => {
        setRemoteOpnameActivities(grouped);
      }
    });
    activityControllerRef.current = controller;
    return () => {
      controller.unsubscribe();
      activityControllerRef.current = null;
    };
  }, [myOpnameSessionId, isDemoSandbox]);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<StockOpnameRecord | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [lastAppliedCount, setLastAppliedCount] = useState(0);

  // Detect new real-time StockOpnameRecord arriving from Supabase (posted by another officer/device)
  useEffect(() => {
    const currentIds = new Set(opnameRecords.map((r) => r.id));
    if (prevOpnameIdsRef.current === null) {
      prevOpnameIdsRef.current = currentIds;
      return;
    }
    const addedRecords = opnameRecords.filter((r) => !prevOpnameIdsRef.current!.has(r.id));
    prevOpnameIdsRef.current = currentIds;

    if (addedRecords.length > 0 && !showSuccessToast) {
      const latest = addedRecords[0];
      setSyncToast({
        type: 'success',
        message: `Update Real-Time Supabase: Dokumen Stok Opname #${latest.refNo} (${latest.totalItemsCounted} produk) baru saja diterapkan oleh ${latest.petugas}!`
      });
    }
  }, [opnameRecords, showSuccessToast]);

  // Supabase Sync & Schema Modal States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [opnameTableInput, setOpnameTableInput] = useState(
    () => getSupabaseConfig().opnameTable || DEFAULT_OPNAME_TABLE
  );

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
        setServerRefreshTick((t) => t + 1);
        setHistoryRefreshTick((t) => t + 1);
        setSyncToast({
          type: 'success',
          message: `Sinkronisasi 2-arah berhasil! Total ${res.count ?? opnameRecords.length} dokumen Riwayat Stok Opname tersinkron dengan Supabase.`
        });
      } else if (res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: `Tabel "${opnameTableInput || DEFAULT_OPNAME_TABLE}" belum dibuat di Supabase. Salin skrip SQL pada modal Skema SQL.`
        });
      } else {
        setSyncToast({
          type: 'error',
          message: res.error || 'Gagal melakukan sinkronisasi Riwayat Opname ke Supabase.'
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
    const cleaned = opnameTableInput.trim() || DEFAULT_OPNAME_TABLE;
    setOpnameTableInput(cleaned);
    setSupabaseConfig({ opnameTable: cleaned });
    await handleRunSupabaseSync();
  };

  const handleCopySchema = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_OPNAME_SQL_SCHEMA);
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2500);
    } catch {
      setSyncToast({
        type: 'warning',
        message: 'Gagal menyalin otomatis. Silakan blok dan salin teks SQL secara manual.'
      });
    }
  };

  const handleConfirmDeleteRecord = async () => {
    if (!pendingDeleteRecord || !onDeleteOpnameRecord) return;
    setIsDeletingRecord(true);
    const targetId = pendingDeleteRecord.id;
    const targetRef = pendingDeleteRecord.refNo;

    // Optimistically remove from server-paginated history immediately so deleted row never lingers
    setServerHistoryRecords((prev) => prev.filter((r) => String(r.id).trim() !== String(targetId).trim()));
    setServerHistoryTotalCount((prev) => Math.max(0, prev - 1));
    if (expandedRecordId === targetId) {
      setExpandedRecordId(null);
    }

    try {
      const res = await onDeleteOpnameRecord(targetId, targetRef);
      setPendingDeleteRecord(null);
      setHistoryRefreshTick((t) => t + 1);

      if (res && 'isDemo' in res && res.isDemo) {
        setSyncToast({
          type: 'success',
          message: `Riwayat opname #${targetRef} dihapus dari Mode Demo Sandbox.`
        });
      } else if (res && 'needsTableSetup' in res && res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: `Riwayat opname #${targetRef} dihapus lokal. Tabel "${opnameTableInput}" belum aktif di Supabase.`
        });
      } else if (res && 'error' in res && res.error) {
        setSyncToast({
          type: 'warning',
          message: `Riwayat opname #${targetRef} dihapus lokal dan dijadwalkan dihapus dari Supabase (${res.error}).`
        });
      } else {
        setSyncToast({
          type: 'success',
          message: `Riwayat opname #${targetRef} berhasil dihapus & disinkronkan dengan Supabase.`
        });
      }
    } finally {
      setIsDeletingRecord(false);
    }
  };

  // Save counts to localStorage on change
  useEffect(() => {
    try {
      demoSetItem('latisha_opname_counts', JSON.stringify(counts));
    } catch (e) {}
  }, [counts]);

  // Debounce Live Opname search input (300ms) for server-side .ilike() queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset pagination back to page 1 when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, selectedCategory, selectedRack, statusFilter]);

  // Fetch lightweight Category & Rack facets + exact catalog total count from Supabase
  useEffect(() => {
    if (!useServerPagination) return;
    let cancelled = false;
    fetchMedicineFilterFacetsFromSupabase().then((res) => {
      if (cancelled || res.error) return;
      setServerFacets({
        categories: res.categories,
        racks: res.racks,
        totalCount: res.totalCount
      });
    });
    return () => {
      cancelled = true;
    };
  }, [useServerPagination, serverRefreshTick]);

  // Cache medicines seen across pages or in props so multi-page session counts & apply never lose medicine metadata
  useEffect(() => {
    if (serverMedicines.length === 0) return;
    setCachedMedicinesById((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const m of serverMedicines) {
        if (next[m.id] !== m) {
          next[m.id] = m;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [serverMedicines]);

  // Hydrate any saved localStorage count IDs not present in local cache / props
  useEffect(() => {
    if (!useServerPagination) return;
    const countIds = Object.keys(counts);
    if (countIds.length === 0) return;
    const missingIds = countIds.filter(
      (id) => !cachedMedicinesById[id] && !medicines.some((m) => m.id === id)
    );
    if (missingIds.length === 0) return;

    let cancelled = false;
    fetchMedicinesByIdsFromSupabase(missingIds).then((res) => {
      if (cancelled || res.data.length === 0) return;
      setCachedMedicinesById((prev) => {
        const next = { ...prev };
        for (const m of res.data) next[m.id] = m;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [useServerPagination, counts, cachedMedicinesById, medicines]);

  // Fast medicine lookup map merging props + cross-page cache
  const medicineLookupMap = useMemo(() => {
    const map = new Map<string, Medicine>();
    for (const m of medicines) {
      map.set(m.id, m);
    }
    for (const key of Object.keys(cachedMedicinesById)) {
      map.set(key, cachedMedicinesById[key]);
    }
    return map;
  }, [medicines, cachedMedicinesById]);

  // Extract unique categories and racks (prefers server facets when live pagination is active)
  const categories = useMemo(() => {
    if (useServerPagination && serverFacets.categories.length > 0) {
      return serverFacets.categories;
    }
    const set = new Set(medicines.map((m) => m.category).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [useServerPagination, serverFacets.categories, medicines]);

  const racks = useMemo(() => {
    if (useServerPagination && serverFacets.racks.length > 0) {
      return serverFacets.racks;
    }
    const set = new Set(medicines.map((m) => m.rack).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [useServerPagination, serverFacets.racks, medicines]);

  // Calculate live sales during this opname session per medicine
  const liveSalesMap = useMemo(() => {
    const sessionDate = new Date(sessionStartTime);
    const map: Record<string, number> = {};

    transactions.forEach((trx) => {
      if (trx.status !== 'Dibatalkan' && trx.status !== 'Diretur') {
        const trxDate = new Date(trx.date);
        const isAfterSession = !isNaN(trxDate.getTime())
          ? trxDate >= sessionDate
          : trx.date >= sessionStartTime.slice(0, 10);

        if (isAfterSession) {
          trx.items?.forEach((item) => {
            if (item.id) {
              map[item.id] = (map[item.id] || 0) + (item.qty || 0);
            }
          });
        }
      }
    });

    return map;
  }, [transactions, sessionStartTime]);

  // Pure single-medicine reconciliation helper (runs ONLY on active page items & counted session items, never 2,257+ rows per keystroke)
  const reconcileMedicineItem = useCallback(
    (med: Medicine) => {
      const liveSales = liveSalesMap[med.id] || 0;
      const systemStock = med.stock;
      const countState = counts[med.id];

      const ratio = Math.max(1, med.rasioKonversi || 1);
      const satuanBesar = med.satuanBesar || 'Box';
      const satuanKecil = med.satuanKecil || med.unit || 'Unit';
      const baseBatches = getNormalizedBatches(med);

      let batchEntries: OpnameBatchEntry[];
      if (countState?.batchEntries && countState.batchEntries.length > 0) {
        batchEntries = countState.batchEntries.map((be) => {
          const hasB = be.physicalStock !== '';
          const parsedB = hasB ? parseFloat(be.physicalStock) || 0 : be.systemStock;
          let curB = be.physicalBesar;
          let curK = be.physicalKecil;
          if (hasB && curB === undefined && curK === undefined) {
            if (ratio > 1) {
              curB = Math.floor(parsedB / ratio).toString();
              curK = (parsedB % ratio).toString();
            } else {
              curB = '';
              curK = parsedB.toString();
            }
          }
          return {
            ...be,
            physicalBesar: curB ?? '',
            physicalKecil: curK ?? ''
          };
        });
      } else {
        const legacyCounted = countState !== undefined && countState.physicalStock !== '';
        batchEntries = baseBatches.map((b, idx) => {
          const pStr = legacyCounted && idx === 0 ? countState.physicalStock : '';
          const pNum = pStr !== '' ? parseFloat(pStr) || 0 : b.stock;
          let bBesar = idx === 0 ? countState?.physicalBesar : undefined;
          let bKecil = idx === 0 ? countState?.physicalKecil : undefined;
          if (pStr !== '' && bBesar === undefined && bKecil === undefined) {
            if (ratio > 1) {
              bBesar = Math.floor(pNum / ratio).toString();
              bKecil = (pNum % ratio).toString();
            } else {
              bBesar = '';
              bKecil = pNum.toString();
            }
          }
          return {
            id: b.id,
            batchNo: b.batchNo,
            expDate: b.expDate,
            systemStock: b.stock,
            physicalStock: pStr,
            physicalBesar: bBesar ?? '',
            physicalKecil: bKecil ?? ''
          };
        });
      }

      const anyBatchCounted = batchEntries.some((b) => b.physicalStock !== '');
      const hasBatchModified = Boolean(countState?.batchModified);
      const hasCounted = anyBatchCounted || hasBatchModified;

      const medHistory = medicineOpnameHistoryMap[med.id];
      const opnamedInLast4Months = Boolean(medHistory?.opnamedInLast4Months);
      const lastOpnameDate = medHistory?.lastOpnameDate || '';
      const lastOpnamePetugas = medHistory?.lastPetugas || '';
      const isOpnamed4MonthsOrSession = hasCounted || opnamedInLast4Months;

      const parsedPhysical = hasCounted
        ? batchEntries.reduce((sum, b) => {
            const val = b.physicalStock !== '' ? parseFloat(b.physicalStock) || 0 : b.systemStock;
            return sum + Math.max(0, Math.round(val));
          }, 0)
        : systemStock;

      const currentHppBesar = Math.round(
        (med.hnaBesar || ((med.hpp || 0) * ratio) / 1.11) * 1.11
      );
      const currentHppKecil = Math.round(currentHppBesar / ratio);

      const hasHppBesarInput = countState?.hppBesar !== undefined;
      const hasHppKecilInput = countState?.hppKecil !== undefined;
      const parsedHppBesarInput =
        hasHppBesarInput && countState.hppBesar!.trim() !== ''
          ? Math.max(0, Math.round(parseFloat(countState.hppBesar!) || 0))
          : null;
      const parsedHppKecilInput =
        hasHppKecilInput && countState.hppKecil!.trim() !== ''
          ? Math.max(0, Math.round(parseFloat(countState.hppKecil!) || 0))
          : null;

      const effectiveHppBesar =
        parsedHppBesarInput !== null
          ? parsedHppBesarInput
          : parsedHppKecilInput !== null
          ? Math.round(parsedHppKecilInput * ratio)
          : currentHppBesar;
      const effectiveHppKecil =
        parsedHppKecilInput !== null
          ? parsedHppKecilInput
          : Math.round(effectiveHppBesar / ratio);
      const hasHppModified =
        (parsedHppBesarInput !== null || parsedHppKecilInput !== null) &&
        (effectiveHppBesar !== currentHppBesar || effectiveHppKecil !== currentHppKecil);

      const difference = hasCounted ? parsedPhysical - systemStock : 0;
      const diffValueHpp = difference * effectiveHppKecil;

      let status: 'MATCH' | 'SURPLUS' | 'DEFICIT' | 'UNCOUNTED' = 'UNCOUNTED';
      if (hasCounted) {
        if (difference === 0) status = 'MATCH';
        else if (difference > 0) status = 'SURPLUS';
        else status = 'DEFICIT';
      }

      const previewResolved = resolvePrimaryBatchAndStock(
        batchEntries.map((b) => ({
          id: b.id,
          batchNo: b.batchNo,
          expDate: b.expDate,
          stock: b.physicalStock !== '' ? parseFloat(b.physicalStock) || 0 : b.systemStock
        })),
        med.batchNo,
        med.expDate,
        true
      );

      return {
        ...med,
        systemStock,
        liveSales,
        hasCounted,
        opnamedInLast4Months,
        isOpnamed4MonthsOrSession,
        lastOpnameDate,
        lastOpnamePetugas,
        hasBatchModified,
        physicalStock: anyBatchCounted ? parsedPhysical.toString() : '',
        parsedPhysical,
        batchEntries,
        previewPrimaryBatchNo: previewResolved.batchNo,
        previewPrimaryExpDate: previewResolved.expDate,
        ratio,
        satuanBesar,
        satuanKecil,
        currentHppBesar,
        currentHppKecil,
        effectiveHppBesar,
        effectiveHppKecil,
        hppBesarInput: countState?.hppBesar,
        hppKecilInput: countState?.hppKecil,
        hasHppModified,
        difference,
        diffValueHpp,
        status,
        notes: countState?.notes || ''
      };
    },
    [counts, liveSalesMap, medicineOpnameHistoryMap]
  );

  // Reconcile ONLY items currently in session `counts` (fast O(counted) instead of O(all 2,257+))
  const countedReconciledItems = useMemo(() => {
    const result: ReturnType<typeof reconcileMedicineItem>[] = [];
    for (const medId of Object.keys(counts)) {
      const med = medicineLookupMap.get(medId);
      if (med) {
        result.push(reconcileMedicineItem(med));
      }
    }
    return result;
  }, [counts, medicineLookupMap, reconcileMedicineItem]);

  // ID sets used for server-side status filtering
  const fourMonthOpnamedIds = useMemo(() => {
    return Object.entries(medicineOpnameHistoryMap)
      .filter(([, v]) => v.opnamedInLast4Months)
      .map(([id]) => id);
  }, [medicineOpnameHistoryMap]);

  const opnamedOrCountedIds = useMemo(() => {
    const set = new Set<string>(fourMonthOpnamedIds);
    for (const r of countedReconciledItems) {
      if (r.hasCounted) set.add(r.id);
    }
    return Array.from(set);
  }, [fourMonthOpnamedIds, countedReconciledItems]);

  const matchSessionIds = useMemo(
    () => countedReconciledItems.filter((r) => r.status === 'MATCH').map((r) => r.id),
    [countedReconciledItems]
  );

  const discrepancySessionIds = useMemo(
    () =>
      countedReconciledItems
        .filter((r) => r.hasCounted && r.status !== 'MATCH')
        .map((r) => r.id),
    [countedReconciledItems]
  );

  const remoteLockedIds = useMemo(
    () =>
      Object.keys(remoteOpnameActivities).filter(
        (id) => (remoteOpnameActivities[id]?.length || 0) > 0
      ),
    [remoteOpnameActivities]
  );

  const statusFilterIdsRef = useRef({
    opnamedOrCountedIds,
    matchSessionIds,
    discrepancySessionIds,
    remoteLockedIds
  });
  statusFilterIdsRef.current = {
    opnamedOrCountedIds,
    matchSessionIds,
    discrepancySessionIds,
    remoteLockedIds
  };

  const remoteLockedFilterKey =
    statusFilter === 'BEING_COUNTED_OTHER' ? remoteLockedIds.join(',') : '';

  // Server-Side Pagination & Search Query against Supabase `master_obat` (.range() + .count('exact') + .ilike())
  useEffect(() => {
    if (viewMode !== 'live' || !useServerPagination) return;

    let cancelled = false;
    setIsServerLoading(true);

    const latestIds = statusFilterIdsRef.current;
    const statusParams: { includeIds?: string[]; excludeIds?: string[] } = {};
    if (statusFilter === 'COUNTED') {
      statusParams.includeIds = latestIds.opnamedOrCountedIds;
    } else if (statusFilter === 'UNCOUNTED') {
      statusParams.excludeIds = latestIds.opnamedOrCountedIds;
    } else if (statusFilter === 'MATCH') {
      statusParams.includeIds = latestIds.matchSessionIds;
    } else if (statusFilter === 'DISCREPANCY') {
      statusParams.includeIds = latestIds.discrepancySessionIds;
    } else if (statusFilter === 'BEING_COUNTED_OTHER') {
      statusParams.includeIds = latestIds.remoteLockedIds;
    }

    fetchMedicinesPaginatedFromSupabase({
      page: currentPage,
      pageSize,
      searchQuery: debouncedSearchTerm,
      categoryFilter: selectedCategory,
      rackFilter: selectedRack,
      ...statusParams
    })
      .then((res) => {
        if (cancelled) return;
        if (res.needsTableSetup) {
          setServerNeedsMedicineSetup(true);
          return;
        }
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
    viewMode,
    useServerPagination,
    currentPage,
    pageSize,
    debouncedSearchTerm,
    selectedCategory,
    selectedRack,
    statusFilter,
    serverRefreshTick,
    remoteLockedFilterKey
  ]);

  // Local fallback filter (used ONLY when offline / Demo Sandbox, then sliced to active page before reconciliation!)
  const localFilteredMedicines = useMemo(() => {
    if (useServerPagination) return [];
    const q = debouncedSearchTerm.toLowerCase();
    const fourMonthSet = new Set(fourMonthOpnamedIds);

    return medicines.filter((med) => {
      if (selectedCategory !== 'ALL' && med.category !== selectedCategory) return false;
      if (selectedRack !== 'ALL' && med.rack !== selectedRack) return false;

      if (q) {
        const matchSearch =
          med.name.toLowerCase().includes(q) ||
          med.id.toLowerCase().includes(q) ||
          (med.barcode && med.barcode.toLowerCase().includes(q)) ||
          med.rack.toLowerCase().includes(q) ||
          (med.batchNo && med.batchNo.toLowerCase().includes(q)) ||
          (med.batches && med.batches.some((b) => b.batchNo.toLowerCase().includes(q)));
        if (!matchSearch) return false;
      }

      if (statusFilter === 'BEING_COUNTED_OTHER') {
        return Boolean(remoteOpnameActivities[med.id] && remoteOpnameActivities[med.id].length > 0);
      }
      if (statusFilter === 'COUNTED' || statusFilter === 'UNCOUNTED') {
        const hasSessionCount = Boolean(
          counts[med.id] && (counts[med.id].physicalStock !== '' || counts[med.id].batchModified)
        );
        const isCounted4M = hasSessionCount || fourMonthSet.has(med.id);
        return statusFilter === 'COUNTED' ? isCounted4M : !isCounted4M;
      }
      if (statusFilter === 'MATCH' || statusFilter === 'DISCREPANCY') {
        const rec = reconcileMedicineItem(med);
        if (statusFilter === 'MATCH') return rec.status === 'MATCH';
        return rec.hasCounted && rec.status !== 'MATCH';
      }
      return true;
    });
  }, [
    useServerPagination,
    medicines,
    debouncedSearchTerm,
    selectedCategory,
    selectedRack,
    statusFilter,
    fourMonthOpnamedIds,
    counts,
    remoteOpnameActivities,
    reconcileMedicineItem
  ]);

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    demoSetItem('latisha_opname_page_size', String(nextSize));
    setCurrentPage(1);
  };

  const totalFilteredCount = useServerPagination
    ? serverTotalCount
    : localFilteredMedicines.length;
  const totalPages = useServerPagination
    ? serverTotalPages
    : Math.max(1, Math.ceil(localFilteredMedicines.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;

  // Paginated raw items (25 or 50 items max!)
  const paginatedRawMedicines = useMemo(() => {
    if (useServerPagination) return serverMedicines;
    return localFilteredMedicines.slice(pageStartIndex, pageStartIndex + pageSize);
  }, [useServerPagination, serverMedicines, localFilteredMedicines, pageStartIndex, pageSize]);

  // ONLY reconcile the 25/50 items rendered on the active page!
  const filteredList = useMemo(() => {
    return paginatedRawMedicines.map(reconcileMedicineItem);
  }, [paginatedRawMedicines, reconcileMedicineItem]);

  // Broadcast current officer's active in-progress opname items in real time (computed strictly from counted + focused items, never 2,257+)
  useEffect(() => {
    if (!activityControllerRef.current) return;
    const activeOfficer = (selectedOpnameStaff || userName || 'Petugas Apotek').trim();
    const nowIso = new Date().toISOString();
    const nowLabel = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const myItems: LiveOpnameItemActivity[] = [];
    const seenIds = new Set<string>();

    countedReconciledItems.forEach((r) => {
      const isCurrentlyFocused = focusedMedicineId === r.id;
      if (!r.hasCounted && !isCurrentlyFocused) return;
      seenIds.add(r.id);

      const countState = counts[r.id];
      const statusText = r.hasCounted
        ? `Input Fisik: ${r.parsedPhysical} ${r.unit}${
            r.batchEntries.length > 1 ? ` (${r.batchEntries.length} Batch)` : ''
          }`
        : 'Sedang mengisi angka hitung fisik...';

      myItems.push({
        medicineId: r.id,
        medicineName: r.name,
        staffName: activeOfficer,
        sessionId: myOpnameSessionId,
        branchId: currentBranch.id,
        physicalStock: r.hasCounted ? String(r.parsedPhysical) : '',
        unit: r.unit,
        batchCount: r.batchEntries.length,
        statusText,
        isFocused: isCurrentlyFocused,
        updatedAt: nowIso,
        updatedTimeLabel: countState?.countedAt || nowLabel
      });
    });

    if (focusedMedicineId && !seenIds.has(focusedMedicineId)) {
      const focusedMed = medicineLookupMap.get(focusedMedicineId);
      if (focusedMed) {
        const rec = reconcileMedicineItem(focusedMed);
        myItems.push({
          medicineId: rec.id,
          medicineName: rec.name,
          staffName: activeOfficer,
          sessionId: myOpnameSessionId,
          branchId: currentBranch.id,
          physicalStock: rec.hasCounted ? String(rec.parsedPhysical) : '',
          unit: rec.unit,
          batchCount: rec.batchEntries.length,
          statusText: 'Sedang mengisi angka hitung fisik...',
          isFocused: true,
          updatedAt: nowIso,
          updatedTimeLabel: nowLabel
        });
      }
    }

    activityControllerRef.current.publishMyActivities(myItems);
  }, [
    countedReconciledItems,
    counts,
    focusedMedicineId,
    medicineLookupMap,
    reconcileMedicineItem,
    selectedOpnameStaff,
    userName,
    myOpnameSessionId,
    currentBranch.id
  ]);

  // Flatten remote activities for banner summary
  const allRemoteActiveItemsList = useMemo(() => {
    const list: LiveOpnameItemActivity[] = [];
    Object.values(remoteOpnameActivities).forEach((arr) => {
      arr.forEach((act) => list.push(act));
    });
    return list;
  }, [remoteOpnameActivities]);

  // Overall statistics computed cleanly without iterating over 2,257+ items on every keystroke
  const stats = useMemo(() => {
    const totalItems =
      useServerPagination && serverFacets.totalCount > 0
        ? serverFacets.totalCount
        : medicines.length;
    const countedItems = countedReconciledItems.filter((r) => r.hasCounted).length;
    const hppUpdatedCount = countedReconciledItems.filter((r) => r.hasHppModified).length;
    const readyToApplyCount = countedReconciledItems.filter(
      (r) => r.hasCounted || r.hasHppModified
    ).length;

    const sudahOpname4MonthsCount = Math.min(totalItems, opnamedOrCountedIds.length);
    const belumOpname4MonthsCount = Math.max(0, totalItems - sudahOpname4MonthsCount);
    const beingCountedByOtherCount = remoteLockedIds.length;

    const matchCount = countedReconciledItems.filter((r) => r.status === 'MATCH').length;
    const surplusItems = countedReconciledItems.filter((r) => r.status === 'SURPLUS');
    const deficitItems = countedReconciledItems.filter((r) => r.status === 'DEFICIT');

    const totalSurplusValue = surplusItems.reduce((acc, r) => acc + r.diffValueHpp, 0);
    const totalDeficitValue = deficitItems.reduce((acc, r) => acc + Math.abs(r.diffValueHpp), 0);
    const netAdjustmentValue = totalSurplusValue - totalDeficitValue;

    const totalLiveSalesCount = Object.values(liveSalesMap).reduce((a, b) => a + b, 0);

    return {
      totalItems,
      countedItems,
      hppUpdatedCount,
      readyToApplyCount,
      belumOpname4MonthsCount,
      sudahOpname4MonthsCount,
      beingCountedByOtherCount,
      progressPercent: totalItems > 0 ? Math.round((sudahOpname4MonthsCount / totalItems) * 100) : 0,
      matchCount,
      surplusCount: surplusItems.length,
      deficitCount: deficitItems.length,
      totalSurplusValue,
      totalDeficitValue,
      netAdjustmentValue,
      totalLiveSalesCount
    };
  }, [
    useServerPagination,
    serverFacets.totalCount,
    medicines.length,
    countedReconciledItems,
    opnamedOrCountedIds.length,
    remoteLockedIds.length,
    liveSalesMap
  ]);

  // Helper to get current batch entries for a medicine when mutating
  const getMutableBatchEntries = (medId: string, prevCounts: Record<string, OpnameItemState>): OpnameBatchEntry[] => {
    const existing = prevCounts[medId]?.batchEntries;
    if (existing && existing.length > 0) return existing.map((b) => ({ ...b }));
    const med = medicineLookupMap.get(medId);
    if (!med) return [];
    return getNormalizedBatches(med).map((b) => ({
      id: b.id,
      batchNo: b.batchNo,
      expDate: b.expDate,
      systemStock: b.stock,
      physicalStock: '',
      physicalBesar: '',
      physicalKecil: ''
    }));
  };

  const computeSummaryFromEntries = (entries: OpnameBatchEntry[]) => {
    const anyFilled = entries.some((b) => b.physicalStock !== '');
    if (!anyFilled) return '';
    const total = entries.reduce((sum, b) => {
      const val = b.physicalStock !== '' ? parseFloat(b.physicalStock) || 0 : b.systemStock;
      return sum + Math.max(0, Math.round(val));
    }, 0);
    return total.toString();
  };

  // Handle batch metadata edit (Batch No or Expired Date)
  const handleBatchFieldChange = (
    medId: string,
    batchId: string,
    field: 'batchNo' | 'expDate',
    value: string
  ) => {
    setCounts((prev) => {
      const entries = getMutableBatchEntries(medId, prev);
      const updatedEntries = entries.map((b) =>
        b.id === batchId ? { ...b, [field]: value } : b
      );
      const summaryTotal = computeSummaryFromEntries(updatedEntries);
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: summaryTotal,
          batchEntries: updatedEntries,
          batchModified: true,
          countedAt: new Date().toLocaleTimeString('id-ID')
        }
      };
    });
  };

  // Add a new Batch & ED row to a product (when 1 product has >1 batch & ED on shelf)
  const handleAddBatchRow = (medId: string) => {
    setCounts((prev) => {
      const entries = getMutableBatchEntries(medId, prev);
      const newEntry: OpnameBatchEntry = {
        id: `${medId}-B-${Date.now().toString().slice(-5)}-${entries.length + 1}`,
        batchNo: '',
        expDate: '',
        systemStock: 0,
        physicalStock: '',
        physicalBesar: '',
        physicalKecil: ''
      };
      const updatedEntries = [...entries, newEntry];
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: computeSummaryFromEntries(updatedEntries),
          batchEntries: updatedEntries,
          batchModified: true,
          countedAt: new Date().toLocaleTimeString('id-ID')
        }
      };
    });
  };

  // Remove a Batch & ED row (only allowed when >1 batch exists)
  const handleRemoveBatchRow = (medId: string, batchId: string) => {
    setCounts((prev) => {
      const entries = getMutableBatchEntries(medId, prev);
      if (entries.length <= 1) return prev;
      const updatedEntries = entries.filter((b) => b.id !== batchId);
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: computeSummaryFromEntries(updatedEntries),
          batchEntries: updatedEntries,
          batchModified: true,
          countedAt: new Date().toLocaleTimeString('id-ID')
        }
      };
    });
  };

  // Handle dual physical stock change for a specific batch (Satuan Besar & Satuan Kecil)
  // Rumus: Total Fisik Batch = (Jumlah Satuan Besar × Rasio Konversi) + Jumlah Satuan Kecil
  const handleBatchDualStockChange = (
    medId: string,
    batchId: string,
    besarVal: string,
    kecilVal: string,
    ratio: number
  ) => {
    const safeRatio = Math.max(1, ratio);
    const isBesarFilled = besarVal.trim() !== '';
    const isKecilFilled = kecilVal.trim() !== '';

    setCounts((prev) => {
      const entries = getMutableBatchEntries(medId, prev);
      const updatedEntries = entries.map((b) => {
        if (b.id !== batchId) return b;
        if (!isBesarFilled && !isKecilFilled) {
          return {
            ...b,
            physicalStock: '',
            physicalBesar: '',
            physicalKecil: ''
          };
        }
        const numBesar = isBesarFilled ? parseFloat(besarVal) || 0 : 0;
        const numKecil = isKecilFilled ? parseFloat(kecilVal) || 0 : 0;
        const totalSmall = Math.round(numBesar * safeRatio + numKecil);
        return {
          ...b,
          physicalStock: totalSmall.toString(),
          physicalBesar: besarVal,
          physicalKecil: kecilVal
        };
      });

      const summaryTotal = computeSummaryFromEntries(updatedEntries);
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: summaryTotal,
          batchEntries: updatedEntries,
          countedAt: summaryTotal !== '' || prev[medId]?.batchModified ? new Date().toLocaleTimeString('id-ID') : undefined
        }
      };
    });
  };

  // Handle single physical stock change for a specific batch (untuk produk satuan tunggal 1:1)
  const handleBatchSingleStockChange = (medId: string, batchId: string, val: string) => {
    const isFilled = val.trim() !== '';
    setCounts((prev) => {
      const entries = getMutableBatchEntries(medId, prev);
      const updatedEntries = entries.map((b) =>
        b.id === batchId
          ? {
              ...b,
              physicalStock: isFilled ? val : '',
              physicalBesar: '',
              physicalKecil: isFilled ? val : ''
            }
          : b
      );
      const summaryTotal = computeSummaryFromEntries(updatedEntries);
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: summaryTotal,
          batchEntries: updatedEntries,
          countedAt: summaryTotal !== '' || prev[medId]?.batchModified ? new Date().toLocaleTimeString('id-ID') : undefined
        }
      };
    });
  };

  // Handle bidirectional HPP edit per medicine (Satuan Besar <-> Satuan Kecil)
  const handleHppChange = (
    medId: string,
    unitType: 'besar' | 'kecil',
    rawVal: string,
    ratio: number
  ) => {
    const safeRatio = Math.max(1, ratio || 1);
    const sanitized = rawVal.replace(/[^\d.]/g, '');
    setCounts((prev) => {
      const cur = prev[medId] || { physicalStock: '' };
      if (sanitized === '') {
        return {
          ...prev,
          [medId]: {
            ...cur,
            hppBesar: unitType === 'besar' ? '' : '',
            hppKecil: unitType === 'kecil' ? '' : ''
          }
        };
      }
      const numVal = Math.max(0, Math.round(parseFloat(sanitized) || 0));
      const nextBesar = unitType === 'besar' ? numVal : Math.round(numVal * safeRatio);
      const nextKecil = unitType === 'kecil' ? numVal : Math.round(numVal / safeRatio);
      return {
        ...prev,
        [medId]: {
          ...cur,
          hppBesar: unitType === 'besar' ? sanitized : nextBesar.toString(),
          hppKecil: unitType === 'kecil' ? sanitized : nextKecil.toString(),
          countedAt: cur.countedAt || new Date().toLocaleTimeString('id-ID')
        }
      };
    });
  };

  const handleResetHpp = (medId: string) => {
    setCounts((prev) => {
      const cur = prev[medId];
      if (!cur) return prev;
      const next = { ...cur };
      delete next.hppBesar;
      delete next.hppKecil;
      return {
        ...prev,
        [medId]: next
      };
    });
  };

  // Quick action: Set physical stock = system stock across all batches of the product
  const handleSetMatch = (medId: string, ratio: number = 1) => {
    const safeRatio = Math.max(1, ratio);
    setCounts((prev) => {
      const entries = getMutableBatchEntries(medId, prev);
      const updatedEntries = entries.map((b) => {
        const sStock = Math.max(0, Math.round(b.systemStock));
        return {
          ...b,
          physicalStock: sStock.toString(),
          physicalBesar: safeRatio > 1 ? Math.floor(sStock / safeRatio).toString() : '',
          physicalKecil: safeRatio > 1 ? (sStock % safeRatio).toString() : sStock.toString()
        };
      });
      return {
        ...prev,
        [medId]: {
          ...(prev[medId] || {}),
          physicalStock: computeSummaryFromEntries(updatedEntries),
          batchEntries: updatedEntries,
          countedAt: new Date().toLocaleTimeString('id-ID')
        }
      };
    });
  };

  // Quick action: Set all currently filtered uncounted items as match (skips items locked by other staff)
  const handleSetAllFilteredMatch = () => {
    let skippedLockedCount = 0;
    setCounts((prev) => {
      const newCounts = { ...prev };
      filteredList.forEach((item) => {
        const isLockedByOther =
          (remoteOpnameActivities[item.id]?.length || 0) > 0 && !overriddenLocks[item.id];
        if (isLockedByOther) {
          skippedLockedCount++;
          return;
        }
        if (!item.hasCounted) {
          const safeRatio = Math.max(1, item.ratio || 1);
          const entries = item.batchEntries.map((b) => {
            const sStock = Math.max(0, Math.round(b.systemStock));
            return {
              ...b,
              physicalStock: sStock.toString(),
              physicalBesar: safeRatio > 1 ? Math.floor(sStock / safeRatio).toString() : '',
              physicalKecil: safeRatio > 1 ? (sStock % safeRatio).toString() : sStock.toString()
            };
          });
          newCounts[item.id] = {
            ...(newCounts[item.id] || {}),
            physicalStock: computeSummaryFromEntries(entries),
            batchEntries: entries,
            countedAt: new Date().toLocaleTimeString('id-ID')
          };
        }
      });
      return newCounts;
    });
    if (skippedLockedCount > 0) {
      setSyncToast({
        type: 'warning',
        message: `${skippedLockedCount} produk dilewati otomatis karena sedang dalam proses hitung oleh petugas lain (mencegah double opname).`
      });
    }
  };

  // Reset Opname Session
  const handleResetSession = () => {
    setShowResetConfirmModal(true);
  };

  const handleExecuteResetSession = () => {
    setCounts({});
    setFocusedMedicineId(null);
    setOverriddenLocks({});
    activityControllerRef.current?.clearMyActivities();
    const newTime = new Date().toISOString();
    setSessionStartTime(newTime);
    demoSetItem('latisha_opname_session_time', newTime);
    demoRemoveItem('latisha_opname_counts');
    setShowResetConfirmModal(false);
    setSyncToast({
      type: 'success',
      message: 'Sesi hitungan fisik Stok Opname berhasil direset ke hitungan baru.'
    });
  };

  // Barcode quick search & focus (supports direct Supabase lookup when server-paginated + camera scanner)
  const processBarcodeScan = async (inputCode: string) => {
    const rawCode = inputCode.trim();
    if (!rawCode) return;

    const lowerCode = rawCode.toLowerCase();
    let found: Medicine | undefined =
      Array.from(medicineLookupMap.values()).find(
        (m) =>
          (m.barcode && m.barcode.trim().toLowerCase() === lowerCode) ||
          m.id.trim().toLowerCase() === lowerCode
      );

    if (!found && useServerPagination) {
      setIsBarcodeSearching(true);
      try {
        const res = await fetchMedicineByBarcodeOrIdFromSupabase(rawCode);
        if (res.data) {
          found = res.data;
          setCachedMedicinesById((prev) => ({ ...prev, [found!.id]: found! }));
        }
      } finally {
        setIsBarcodeSearching(false);
      }
    }

    if (found) {
      playBarcodeBeep();
      // Reset conflicting filters so the scanned medicine is immediately visible
      if (selectedCategory !== 'ALL' && found.category !== selectedCategory) {
        setSelectedCategory('ALL');
      }
      if (selectedRack !== 'ALL' && found.rack !== selectedRack) {
        setSelectedRack('ALL');
      }
      if (statusFilter !== 'ALL') {
        setStatusFilter('ALL');
      }
      setSearchTerm(found.barcode || found.id || found.name);
      setCurrentPage(1);
      setScannedBarcode('');
      setSyncToast({
        type: 'success',
        message: `Barcode terbaca: ${found.name} (${found.barcode || found.id})`
      });
    } else {
      setSyncToast({
        type: 'warning',
        message: `Obat dengan barcode / kode "${rawCode}" tidak ditemukan.`
      });
    }
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processBarcodeScan(scannedBarcode);
  };

  // Apply Reconciliation to System (Applies ALL counted/modified items across all pages!)
  const handleExecuteApplyOpname = () => {
    const adjustments = countedReconciledItems
      .filter((r) => r.hasCounted || r.hasHppModified)
      .map((r) => {
        const finalBatchPayload = r.batchEntries.map((b) => {
          const pStock = b.physicalStock !== '' ? Math.max(0, Math.round(parseFloat(b.physicalStock) || 0)) : b.systemStock;
          return {
            id: b.id,
            batchNo: (b.batchNo || '').trim() || '-',
            expDate: (b.expDate || '').trim(),
            systemStock: b.systemStock,
            physicalStock: pStock,
            stock: pStock,
            difference: pStock - b.systemStock
          };
        });

        const resolvedFEFO = resolvePrimaryBatchAndStock(
          finalBatchPayload.map((b) => ({
            id: b.id,
            batchNo: b.batchNo,
            expDate: b.expDate,
            stock: b.stock
          })),
          r.batchNo,
          r.expDate,
          true
        );

        const baseReason =
          opnameKind === 'STOK_AWAL'
            ? `Stok Awal (${resolvedFEFO.stock} ${r.unit}) · Stok Opname`
            : resolvedFEFO.stock - r.systemStock === 0
            ? r.hasHppModified
              ? 'Update HPP & Harga Jual via Stok Opname'
              : 'Penyesuaian Stok Opname Sesuai'
            : resolvedFEFO.stock - r.systemStock > 0
            ? `Penyesuaian Lebih (+${resolvedFEFO.stock - r.systemStock}) Stok Opname Live`
            : `Penyesuaian Kurang (${resolvedFEFO.stock - r.systemStock}) Stok Opname Live`;

        const hppNote = r.hasHppModified
          ? ` · Update HPP/${r.satuanBesar}: Rp ${r.effectiveHppBesar.toLocaleString('id-ID')}`
          : '';

        return {
          medicineId: r.id,
          medicineName: r.name,
          finalStock: resolvedFEFO.stock,
          difference: resolvedFEFO.stock - r.systemStock,
          systemStock: r.systemStock,
          hpp: r.effectiveHppKecil,
          hppBesar: r.effectiveHppBesar,
          hppUpdated: r.hasHppModified,
          sellPrice: r.sellPrice,
          unit: r.unit,
          batchNo: resolvedFEFO.batchNo,
          expDate: resolvedFEFO.expDate,
          batches: finalBatchPayload,
          reason: `${baseReason}${hppNote}`
        };
      });

    if (adjustments.length === 0) {
      setShowConfirmModal(false);
      setSyncToast({
        type: 'warning',
        message: 'Belum ada obat yang diisi hasil hitung fisik, perubahan HPP, atau perubahan Batch/ED.'
      });
      return;
    }

    onApplyStockOpname(adjustments, undefined, selectedOpnameStaff || userName, opnameKind);
    setLastAppliedCount(adjustments.length);
    setShowConfirmModal(false);
    setShowSuccessToast(true);

    // Clear completed counts & broadcast release of in-progress locks
    setCounts({});
    setFocusedMedicineId(null);
    setOverriddenLocks({});
    activityControllerRef.current?.clearMyActivities();
    const newTime = new Date().toISOString();
    setSessionStartTime(newTime);
    demoSetItem('latisha_opname_session_time', newTime);
    demoRemoveItem('latisha_opname_counts');

    // Refresh server pages cleanly after outbound sync finishes
    setTimeout(() => {
      setServerRefreshTick((t) => t + 1);
      setHistoryRefreshTick((t) => t + 1);
    }, 600);

    setTimeout(() => {
      setShowSuccessToast(false);
    }, 4000);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner: Live Operating Mode Information */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-md flex flex-wrap justify-between items-center gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Sistem Stok Opname Non-Stop (Apotek Tetap Beroperasi)
            </span>
            {isDemoSandbox ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[10px] font-bold">
                <Database className="w-3 h-3" />
                Mode Demo Sandbox
              </span>
            ) : needsTableSetup ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[10px] font-bold">
                <AlertCircle className="w-3 h-3" />
                Tabel Supabase Perlu Setup
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold">
                <CheckCircle2 className="w-3 h-3" />
                Supabase Live: {opnameTableInput}
              </span>
            )}
          </div>
          <h2 className="text-xl font-black tracking-tight text-white">
            {viewMode === 'history'
              ? 'Riwayat Kegiatan & Rekonsiliasi Stok Opname'
              : 'Rekonsiliasi Stok Opname Live (Real-Time POS Sync)'}
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            {viewMode === 'history'
              ? 'Arsip lengkap kegiatan stok opname beserta rincian selisih fisik, nominal selisih (HPP), dan petugas pemeriksa tersinkron 2-arah ke Supabase.'
              : 'Anda dapat menghitung stok fisik di rak tanpa harus menutup apotek. Setiap transaksi penjualan kasir POS yang terjadi selama sesi opname otomatis disinkronkan secara presisi sehingga tidak menimbulkan selisih semu.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Active Officer Selector for Real-Time Multi-User Broadcast */}
          <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/20 text-xs flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <div>
              <span className="text-[9px] text-slate-300 block font-mono uppercase">Petugas Menghitung:</span>
              {staffList.length > 0 ? (
                <select
                  value={selectedOpnameStaff}
                  onChange={(e) => setSelectedOpnameStaff(e.target.value)}
                  className="bg-transparent font-bold text-white text-xs outline-none cursor-pointer pr-1"
                  title="Pilih akun/nama petugas yang sedang menghitung pada perangkat ini"
                >
                  {!staffList.some((s) => s.name === selectedOpnameStaff) && (
                    <option value={selectedOpnameStaff} className="text-slate-900">
                      {selectedOpnameStaff}
                    </option>
                  )}
                  {staffList
                    .filter((s) => s.status !== 'Non-Aktif')
                    .map((st) => (
                      <option key={st.id} value={st.name} className="text-slate-900">
                        {st.name}
                      </option>
                    ))}
                </select>
              ) : (
                <span className="font-bold text-white">{selectedOpnameStaff || userName}</span>
              )}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/20 text-xs">
            <span className="text-[10px] text-slate-300 block font-mono">Sesi Dimulai:</span>
            <span className="font-bold text-white font-mono">
              {new Date(sessionStartTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
            </span>
          </div>

          {onSyncSupabase && (
            <button
              type="button"
              onClick={handleRunSupabaseSync}
              disabled={isSyncing}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-white/20"
              title="Sinkronkan Riwayat Opname 2-arah dengan Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
            </button>
          )}

          {isOwnerAdmin && (
            <button
              type="button"
              onClick={() => setShowSchemaModal(true)}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-slate-100 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-white/20"
              title="Lihat Skema SQL & konfigurasi tabel riwayat_opname Supabase"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Skema SQL</span>
            </button>
          )}

          {/* Button Riwayat Opname */}
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'history' ? 'live' : 'history')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer border shadow-sm ${
              viewMode === 'history'
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
            }`}
            title="Lihat halaman riwayat kegiatan stok opname"
          >
            <History className="w-4 h-4" />
            <span>{viewMode === 'history' ? 'Kembali ke Form Opname' : 'Riwayat Opname'}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${
              viewMode === 'history' ? 'bg-slate-950 text-amber-400' : 'bg-white/20 text-white'
            }`}>
              {useServerHistoryPagination && serverHistoryTotalCount > 0
                ? serverHistoryTotalCount
                : allOpnameHistory.length}
            </span>
          </button>

          {viewMode === 'live' && (
            <>
              <button
                type="button"
                onClick={handleResetSession}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-700"
                title="Reset hasil hitungan fisik sesi ini"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Sesi</span>
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={stats.readyToApplyCount === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>Terapkan Hasil Opname ({stats.readyToApplyCount})</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alarm Peringatan Akun User: Belum Melakukan Stok Opname 4 Bulan Terakhir */}
      {!userOpnameStatus.hasOpnameInLast4Months && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white border-2 border-rose-300 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl shrink-0 animate-bounce">
              <AlertTriangle className="w-6 h-6 text-amber-200" />
            </div>
            <div>
              <p className="font-black text-xs sm:text-sm tracking-wide uppercase text-white">
                PERINGATAN ! ANDA BELUM MELAKUKAN STOK OPNAME. SEGERA LAKUKAN OPNAME !!!
              </p>
              <p className="text-[11px] text-rose-100 mt-0.5">
                Akun petugas <strong>{userName}</strong> tercatat belum melakukan kegiatan Stok Opname dalam 4 bulan terakhir (sejak {fourMonthsAgoStr}
                {userOpnameStatus.lastUserOpnameDate ? ` · Opname terakhir Anda: ${userOpnameStatus.lastUserOpnameDate}` : ' · Belum pernah tercatat'}).
                Terdapat <strong>{stats.belumOpname4MonthsCount} obat</strong> dengan status <strong>Belum Opname</strong> dalam 4 bulan terakhir.
              </p>
            </div>
          </div>
          {viewMode === 'history' || statusFilter !== 'UNCOUNTED' ? (
            <button
              type="button"
              onClick={() => {
                setViewMode('live');
                setStatusFilter('UNCOUNTED');
              }}
              className="px-3.5 py-2 bg-white hover:bg-amber-100 text-rose-700 rounded-xl font-black text-xs shrink-0 shadow-sm cursor-pointer transition"
            >
              Filter Obat Belum Opname ({stats.belumOpname4MonthsCount})
            </button>
          ) : null}
        </div>
      )}

      {/* Mode Demo Sandbox Isolation Notice */}
      {isDemoSandbox && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
          <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Isolasi Mode Demo / Sandbox Aktif</p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Seluruh hasil Stok Opname dan Riwayat Opname pada sesi ini disimpan secara lokal di sandbox demo dan tidak pernah membaca atau menulis ke database Supabase produksi.
            </p>
          </div>
        </div>
      )}

      {/* Table Setup Warning (APJ / Owner Only) */}
      {isOwnerAdmin && needsTableSetup && !isDemoSandbox && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Tabel Supabase &ldquo;{opnameTableInput}&rdquo; belum dibuat:
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Salin dan jalankan skrip SQL di Dashboard Supabase agar seluruh dokumen Riwayat Stok Opname tersinkronisasi 2-arah secara real-time.
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

      {/* Dismissible Sync / Feedback Toast */}
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

      {/* Success Notification */}
      {showSuccessToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <strong className="block text-xs font-bold">Rekonsiliasi Stok Opname Berhasil Diterapkan!</strong>
              <span className="text-[11px] text-emerald-700">
                Sebanyak {lastAppliedCount} item obat telah diperbarui stoknya di master obat, tercatat resmi di Kartu Stok Digital,{' '}
                {isDemoSandbox ? 'dan disimpan di sandbox Mode Demo.' : 'serta disinkronkan ke Riwayat Opname Supabase.'}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowSuccessToast(false)}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Real-Time Multi-User In-Progress Counting Notification Banner (Cegah Double Opname) */}
      {stats.beingCountedByOtherCount > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white border-2 border-amber-200 shadow-lg space-y-2.5 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/20 rounded-xl shrink-0">
                <Radio className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 bg-slate-950/40 rounded-md text-[10px] font-mono font-black uppercase tracking-wider">
                    LIVE MULTI-USER LOCK
                  </span>
                  <p className="font-black text-xs sm:text-sm uppercase tracking-wide">
                    PERHATIAN: {stats.beingCountedByOtherCount} Produk Sedang Dihitung oleh Petugas Lain!
                  </p>
                </div>
                <p className="text-[11px] text-amber-50 mt-0.5 leading-relaxed">
                  Produk di bawah ini sedang dalam proses input hitung fisik oleh rekan kerja di perangkat lain namun <strong>belum mengklik tombol &ldquo;Terapkan Hasil Opname&rdquo;</strong>. Baris produk tersebut dikunci otomatis untuk mencegah terjadinya <strong>double opname (ganda perhitungan)</strong>.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setViewMode('live');
                setStatusFilter(statusFilter === 'BEING_COUNTED_OTHER' ? 'ALL' : 'BEING_COUNTED_OTHER');
              }}
              className="px-3.5 py-2 bg-white hover:bg-amber-50 text-amber-900 rounded-xl font-black text-xs shrink-0 shadow-sm cursor-pointer transition flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5 text-amber-700" />
              <span>
                {statusFilter === 'BEING_COUNTED_OTHER'
                  ? 'Tampilkan Semua Obat'
                  : `Lihat Obat Sedang Dihitung (${stats.beingCountedByOtherCount})`}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/20">
            {allRemoteActiveItemsList.slice(0, 8).map((act) => (
              <button
                key={`${act.sessionId}-${act.medicineId}`}
                type="button"
                onClick={() => {
                  setViewMode('live');
                  setSearchTerm(act.medicineName);
                }}
                className="px-2.5 py-1 bg-slate-950/30 hover:bg-slate-950/50 rounded-lg text-[11px] font-bold text-white flex items-center gap-1.5 border border-white/20 cursor-pointer transition"
                title="Klik untuk menuju baris obat ini"
              >
                <Lock className="w-3 h-3 text-amber-200 shrink-0" />
                <span>{act.medicineName}</span>
                <span className="text-amber-200 font-normal">·</span>
                <span className="underline decoration-amber-200/60">
                  Sedang dihitung oleh {act.staffName}
                </span>
                {act.physicalStock ? (
                  <span className="px-1.5 py-0.2 bg-white/20 rounded font-mono text-[10px]">
                    {act.physicalStock} {act.unit || ''}
                  </span>
                ) : null}
              </button>
            ))}
            {allRemoteActiveItemsList.length > 8 && (
              <span className="px-2.5 py-1 bg-slate-950/20 rounded-lg text-[10px] font-bold text-amber-100">
                +{allRemoteActiveItemsList.length - 8} obat lainnya
              </span>
            )}
          </div>
        </div>
      )}

      {viewMode === 'history' ? (
        <div className="space-y-4">
          {/* Filter Range Tanggal & Pencarian Riwayat Opname */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Cari No. Referensi Opname, Nama Petugas, atau Nama Obat..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectHistoryPreset('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    historyPreset === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua Waktu
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectHistoryPreset('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    historyPreset === 'today'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectHistoryPreset('7days')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    historyPreset === '7days'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  7 Hari Terakhir
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectHistoryPreset('month')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    historyPreset === 'month'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Bulan Ini
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectHistoryPreset('custom')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    historyPreset === 'custom'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Rentang Tanggal
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-600 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  Filter Range Tanggal:
                </span>
                <input
                  type="date"
                  value={historyStartDate}
                  onChange={(e) => {
                    setHistoryStartDate(e.target.value);
                    setHistoryPreset('custom');
                  }}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 bg-slate-50 focus:bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-slate-400 font-bold">s/d</span>
                <input
                  type="date"
                  value={historyEndDate}
                  onChange={(e) => {
                    setHistoryEndDate(e.target.value);
                    setHistoryPreset('custom');
                  }}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 bg-slate-50 focus:bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <span className="text-[11px] text-slate-500 font-semibold">
                Menampilkan <strong>{paginatedOpnameHistory.length}</strong> dari <strong>{totalHistoryItems}</strong> kegiatan stokopname
              </span>
            </div>
          </div>

          {/* KPI Summary Riwayat Opname */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Kegiatan Opname</span>
              <div className="font-mono font-black text-xl text-slate-900 mt-1">
                {historySummary.totalSessions} Sesi
              </div>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                {historySummary.totalItemsEvaluated} item obat diperiksa
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Selisih Lebih (+)</span>
              <div className="font-mono font-black text-xl text-blue-700 mt-1">
                +Rp {historySummary.totalSurplus.toLocaleString('id-ID')}
              </div>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                Valuasi Surplus (HPP)
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Selisih Kurang (-)</span>
              <div className="font-mono font-black text-xl text-rose-700 mt-1">
                -Rp {historySummary.totalDeficit.toLocaleString('id-ID')}
              </div>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                Valuasi Defisit / Susut (HPP)
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Nominal Selisih Bersih</span>
              <div
                className={`font-mono font-black text-xl mt-1 ${
                  historySummary.netNominal >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {historySummary.netNominal >= 0 ? '+' : '-'}Rp {Math.abs(historySummary.netNominal).toLocaleString('id-ID')}
              </div>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                Tercatat di Laporan Keuangan
              </span>
            </div>
          </div>

          {/* Tabel Daftar Riwayat Kegiatan Stok Opname */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                Daftar Riwayat Kegiatan Stok Opname
                {isHistoryLoading && (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                )}
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">
                Klik baris untuk melihat rincian obat & nominal selisih
              </span>
            </div>

            {isHistoryLoading && paginatedOpnameHistory.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <Loader2 className="w-8 h-8 mx-auto text-indigo-500 animate-spin" />
                <p className="font-bold text-slate-600 text-xs">
                  Memuat halaman riwayat stok opname dari Supabase...
                </p>
              </div>
            ) : paginatedOpnameHistory.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <ClipboardCheck className="w-10 h-10 mx-auto text-slate-300" />
                <p className="font-bold text-slate-600 text-xs">
                  Belum ada data riwayat kegiatan stokopname pada rentang tanggal ini.
                </p>
                <p className="text-[11px]">
                  Lakukan perhitungan di Form Opname lalu klik &quot;Terapkan Hasil Opname&quot; untuk menyimpan riwayat.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 text-xs">
                {paginatedOpnameHistory.map((rec) => {
                  const isExpanded = expandedRecordId === rec.id;
                  return (
                    <div key={rec.id} className="bg-white">
                      <div
                        onClick={() => setExpandedRecordId(isExpanded ? null : rec.id)}
                        className="p-4 hover:bg-slate-50 transition cursor-pointer flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-black text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200 text-xs">
                              {rec.refNo}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${
                                rec.opnameKind === 'STOK_AWAL' || /\[Jenis:\s*Stok Awal\]/i.test(rec.notes || '')
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-sky-50 text-sky-800 border-sky-200'
                              }`}
                            >
                              {rec.opnameKind === 'STOK_AWAL' || /\[Jenis:\s*Stok Awal\]/i.test(rec.notes || '')
                                ? 'Stok Awal'
                                : 'Penyesuaian Stok'}
                            </span>
                            <span className="font-bold text-slate-800">
                              {rec.date} · {rec.time}
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold">
                              Petugas: {rec.petugas}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                            <span>Total Diperiksa: <strong>{rec.totalItemsCounted} Obat</strong></span>
                            <span className="text-emerald-700 font-semibold">Cocok: {rec.matchCount}</span>
                            <span className="text-blue-700 font-semibold">Surplus (+): {rec.surplusCount}</span>
                            <span className="text-rose-700 font-semibold">Defisit (-): {rec.deficitCount}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right font-mono">
                            <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">
                              Nominal SelisihOpname
                            </span>
                            <span
                              className={`text-sm font-black ${
                                rec.netNominalDiff > 0
                                  ? 'text-blue-700'
                                  : rec.netNominalDiff < 0
                                  ? 'text-rose-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {rec.netNominalDiff >= 0 ? '+' : '-'}Rp {Math.abs(rec.netNominalDiff).toLocaleString('id-ID')}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedRecordId(isExpanded ? null : rec.id);
                              }}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{isExpanded ? 'Tutup' : 'Rincian'}</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>

                            {onDeleteOpnameRecord && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingDeleteRecord(rec);
                                }}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition cursor-pointer"
                                title="Hapus riwayat opname ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-[11px] border border-slate-200 bg-white rounded-xl overflow-hidden">
                              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                                <tr>
                                  <th className="p-2 border">Nama Obat</th>
                                  <th className="p-2 border">Batch &amp; ED (FEFO)</th>
                                  <th className="p-2 border text-center">Stok Sistem</th>
                                  <th className="p-2 border text-center">Stok Fisik</th>
                                  <th className="p-2 border text-center">Selisih Qty</th>
                                  <th className="p-2 border text-right">HPP / Unit</th>
                                  <th className="p-2 border text-right">Nominal Selisih (HPP)</th>
                                  <th className="p-2 border">Keterangan</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {rec.items.map((it, idx) => (
                                  <tr key={`${rec.id}-${idx}`} className="hover:bg-slate-50">
                                    <td className="p-2 border font-bold text-slate-900">{it.medicineName}</td>
                                    <td className="p-2 border font-mono text-[10px]">
                                      {it.batches && it.batches.length > 0 ? (
                                        <div className="space-y-1">
                                          {it.batches.map((b, bIdx) => (
                                            <div key={bIdx} className="flex items-center gap-1.5 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                              <span className="font-bold text-slate-800">{b.batchNo}</span>
                                              <span className="text-slate-400">·</span>
                                              <span className="text-slate-600">ED: {b.expDate || '-'}</span>
                                              <span className="ml-auto font-bold text-indigo-700">{b.physicalStock} {it.unit}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div>
                                          <span className="font-bold text-slate-800">{it.batchNo || '-'}</span>
                                          <span className="block text-slate-500">ED: {it.expDate || '-'}</span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2 border text-center font-mono">{it.systemStock} {it.unit}</td>
                                    <td className="p-2 border text-center font-mono font-bold">{it.physicalStock} {it.unit}</td>
                                    <td className="p-2 border text-center font-mono font-bold">
                                      <span
                                        className={
                                          it.difference > 0
                                            ? 'text-blue-700'
                                            : it.difference < 0
                                            ? 'text-rose-700'
                                            : 'text-emerald-700'
                                        }
                                      >
                                        {it.difference > 0 ? `+${it.difference}` : it.difference} {it.unit}
                                      </span>
                                    </td>
                                    <td className="p-2 border text-right font-mono">
                                      Rp {it.hpp.toLocaleString('id-ID')}
                                    </td>
                                    <td
                                      className={`p-2 border text-right font-mono font-bold ${
                                        it.nominalDiffHpp > 0
                                          ? 'text-blue-700'
                                          : it.nominalDiffHpp < 0
                                          ? 'text-rose-700'
                                          : 'text-emerald-700'
                                      }`}
                                    >
                                      {it.nominalDiffHpp >= 0 ? '+' : '-'}Rp {Math.abs(it.nominalDiffHpp).toLocaleString('id-ID')}
                                    </td>
                                    <td className="p-2 border text-slate-600">{it.reason}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <PaginationControls
              currentPage={safeHistoryPage}
              totalPages={totalHistoryPages}
              totalCount={totalHistoryItems}
              pageSize={historyPageSize}
              onPageChange={setHistoryPage}
              onPageSizeChange={handleHistoryPageSizeChange}
              isLoading={isHistoryLoading}
              itemLabel="kegiatan opname"
            />
          </div>
        </div>
      ) : (
        <>
          {/* 4 KPI Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Cakupan Opname (4 Bulan)</span>
                <Boxes className="w-4 h-4 text-sky-500" />
              </div>
          <div className="font-mono font-black text-xl text-slate-900">
            {stats.sudahOpname4MonthsCount} / {stats.totalItems}{' '}
            <span className="text-xs font-bold text-sky-600">({stats.progressPercent}%)</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-sky-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-amber-700 font-semibold block">
            Belum Opname (4 Bln): {stats.belumOpname4MonthsCount} Obat · Sesi Ini: {stats.countedItems}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Stok Cocok (Akurat)</span>
            <Check className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="font-mono font-black text-xl text-emerald-700">
            {stats.matchCount} <span className="text-xs font-bold text-slate-500">Obat</span>
          </div>
          <span className="text-[10px] text-slate-400 block">Fisik = Catatan Sistem</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Selisih Kurang (Minus)</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="font-mono font-black text-xl text-rose-600">
            {stats.deficitCount} <span className="text-xs font-bold text-slate-500">Obat</span>
          </div>
          <span className="text-[10px] font-mono font-bold text-rose-600 block">
            - Rp {stats.totalDeficitValue.toLocaleString('id-ID')}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Penjualan Kasir Live</span>
            <ShoppingCart className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="font-mono font-black text-xl text-indigo-700">
            {stats.totalLiveSalesCount} <span className="text-xs font-bold text-slate-500">Item Terjual</span>
          </div>
          <span className="text-[10px] text-indigo-600 font-semibold block">
            Otomatis dihitung tanpa tutup toko
          </span>
        </div>
      </div>

      {/* Control Bar: Jenis Stok Opname, Search, Category, Rack, Barcode Scanner, & Status Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        {/* Pilihan Jenis Stok Opname Dropdown: Stok Awal / Penyesuaian Stok */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5">
            <label
              htmlFor="jenis-stok-opname-select"
              className="text-xs font-extrabold text-slate-700 uppercase tracking-wide shrink-0"
            >
              Jenis Stok Opname :
            </label>
            <select
              id="jenis-stok-opname-select"
              value={opnameKind}
              onChange={(e) => setOpnameKind(e.target.value as StockOpnameKind)}
              className="px-3.5 py-2 border border-indigo-300 rounded-xl text-xs font-extrabold bg-indigo-50 text-indigo-950 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
            >
              <option value="STOK_AWAL">Stok Awal</option>
              <option value="PENYESUAIAN_STOK">Penyesuaian Stok</option>
            </select>
          </div>
          <p className="text-[11px] text-slate-600 font-medium">
            {opnameKind === 'STOK_AWAL'
              ? 'Otomatis memperbarui kolom Stok di tabel Master Obat & tercatat di Kartu Stok Digital sebagai mutasi Stok Awal.'
              : 'Otomatis memperbarui kolom Stok di tabel Master Obat & mencatat selisihnya di Kartu Stok Digital sebagai Penyesuaian Stok (Stok Opname).'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search by Name or Code */}
          <div className="sm:col-span-4 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama obat, kode, atau lokasi rak..."
              className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* Quick Barcode Scanner Form + Camera Button */}
          <form onSubmit={handleBarcodeSubmit} className="sm:col-span-3 flex gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Barcode className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                placeholder="Scan / Ketik Barcode..."
                className="w-full pl-9 pr-2 py-2 border rounded-xl text-xs font-mono font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowCameraScanner(true)}
              title="Scan Barcode Menggunakan Kamera"
              className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer transition inline-flex items-center gap-1"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Scan</span>
            </button>
            <button
              type="submit"
              disabled={isBarcodeSearching}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer transition inline-flex items-center gap-1"
            >
              {isBarcodeSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Cari</span>
            </button>
          </form>

          {/* Filter: Category */}
          <div className="sm:col-span-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-2 border rounded-xl text-xs font-bold bg-slate-50 text-slate-800"
            >
              <option value="ALL">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filter: Rack */}
          <div className="sm:col-span-2">
            <select
              value={selectedRack}
              onChange={(e) => setSelectedRack(e.target.value)}
              className="w-full p-2 border rounded-xl text-xs font-bold bg-slate-50 text-slate-800"
            >
              <option value="ALL">Semua Rak</option>
              {racks.map((r) => (
                <option key={r} value={r}>
                  Rak {r}
                </option>
              ))}
            </select>
          </div>

          {/* Action: Quick Match Filtered */}
          <div className="sm:col-span-1">
            <button
              type="button"
              onClick={handleSetAllFilteredMatch}
              title="Set semua obat pada halaman aktif menjadi sesuai stok sistem"
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold transition flex items-center justify-center cursor-pointer border border-slate-300"
            >
              Set Cocok
            </button>
          </div>
        </div>

        {/* Status Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold text-slate-400 mr-2">Status Opname (4 Bulan Terakhir):</span>
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 rounded-lg font-bold transition text-xs cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Semua ({stats.totalItems})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('UNCOUNTED')}
            title="Menampilkan obat yang belum pernah dilakukan stok opname dalam 4 bulan terakhir dan belum diinput pada sesi ini"
            className={`px-3 py-1 rounded-lg font-bold transition text-xs cursor-pointer ${
              statusFilter === 'UNCOUNTED'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            Belum Opname ({stats.belumOpname4MonthsCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('COUNTED')}
            title="Menampilkan obat yang sudah pernah dilakukan stok opname dalam 4 bulan terakhir atau sedang dihitung pada sesi ini"
            className={`px-3 py-1 rounded-lg font-bold transition text-xs cursor-pointer ${
              statusFilter === 'COUNTED'
                ? 'bg-sky-600 text-white'
                : 'bg-sky-50 text-sky-800 hover:bg-sky-100'
            }`}
          >
            Sudah Opname ({stats.sudahOpname4MonthsCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('DISCREPANCY')}
            className={`px-3 py-1 rounded-lg font-bold transition text-xs cursor-pointer ${
              statusFilter === 'DISCREPANCY'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            Ada Selisih ({stats.surplusCount + stats.deficitCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('MATCH')}
            className={`px-3 py-1 rounded-lg font-bold transition text-xs cursor-pointer ${
              statusFilter === 'MATCH'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            Cocok 100% ({stats.matchCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('BEING_COUNTED_OTHER')}
            title="Menampilkan obat yang saat ini sedang dalam proses hitung opname oleh pegawai/akun lain dan belum klik Terapkan Hasil Opname"
            className={`px-3 py-1 rounded-lg font-bold transition text-xs cursor-pointer inline-flex items-center gap-1.5 ${
              statusFilter === 'BEING_COUNTED_OTHER'
                ? 'bg-orange-600 text-white shadow-xs'
                : stats.beingCountedByOtherCount > 0
                ? 'bg-orange-100 text-orange-900 border border-orange-300 hover:bg-orange-200 animate-pulse'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <Lock className="w-3 h-3" />
            <span>Sedang Dihitung Petugas Lain ({stats.beingCountedByOtherCount})</span>
          </button>
        </div>

        {/* Tip & Informasi Hitung Fisik Dual-Satuan & Multi-Batch FEFO */}
        <div className="flex items-start gap-2 p-2.5 bg-indigo-50/80 border border-indigo-200/80 rounded-xl text-indigo-950 text-xs">
          <Boxes className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] leading-relaxed space-y-0.5">
            <div>
              <strong className="text-indigo-900">Hitung Fisik Dual-Satuan &amp; Multi-Batch FEFO:</strong> Isi jumlah kemasan utuh (Satuan Besar) dan eceran (Satuan Kecil) pada kolom masing-masing batch. Rumus:{' '}
              <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-800">
                (Satuan Besar × Rasio) + Satuan Kecil
              </span>.
            </div>
            <div className="text-indigo-800">
              Jika 1 produk memiliki lebih dari satu Batch &amp; ED di rak, klik <strong>+ Batch / ED</strong> untuk memecah atau menambah batch. Setelah opname selesai, Batch, ED (urut FEFO), dan total stok pada Master Obat otomatis menyesuaikan.
            </div>
          </div>
        </div>
      </div>

      {/* Main Stock Opname Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600 text-[11px]">
              <tr>
                <th className="p-3 w-12 text-center">No</th>
                <th className="p-3 min-w-[200px]">Produk Obat &amp; Rak</th>
                <th className="p-3 min-w-[230px]">Batch &amp; ED (FEFO)</th>
                <th className="p-3 text-center min-w-[125px]">Stok Sistem</th>
                <th className="p-3 text-center w-24">Terjual Live</th>
                <th className="p-3 text-center min-w-[240px]">HITUNG FISIK</th>
                <th className="p-3 text-center min-w-[180px]">HPP</th>
                <th className="p-3 text-center min-w-[130px]">Selisih</th>
                <th className="p-3 text-right w-32">Nilai Selisih (HPP)</th>
                <th className="p-3 text-center w-24">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {isServerLoading && filteredList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2 font-bold text-xs">
                      <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                      <span>Memuat halaman data stok opname dari Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-400 italic">
                    Tidak ada data obat yang sesuai dengan kriteria filter stok opname.
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => {
                  const remoteActivitiesForItem = remoteOpnameActivities[item.id] || [];
                  const isBeingCountedByOther = remoteActivitiesForItem.length > 0;
                  const isLockedByOther = isBeingCountedByOther && !overriddenLocks[item.id];

                  const rowBgClass = isBeingCountedByOther
                    ? 'bg-amber-50/70'
                    : item.status === 'DEFICIT'
                    ? 'bg-rose-50/50'
                    : item.status === 'SURPLUS'
                    ? 'bg-blue-50/50'
                    : item.status === 'MATCH'
                    ? 'bg-emerald-50/30'
                    : 'bg-white';

                  const batchCount = item.batchEntries.length;

                  return (
                    <React.Fragment key={item.id}>
                      {item.batchEntries.map((batch, bIdx) => {
                        const isFirstBatch = bIdx === 0;
                        const batchExpTime = batch.expDate ? new Date(batch.expDate).getTime() : NaN;
                        const isBatchExpired = !isNaN(batchExpTime) && batchExpTime < Date.now();
                        const isBatchNearExp = !isNaN(batchExpTime) && !isBatchExpired && batchExpTime <= Date.now() + 90 * 86400000;
                        const isBatchFilled = batch.physicalStock !== '';
                        const batchParsed = isBatchFilled ? parseFloat(batch.physicalStock) || 0 : batch.systemStock;

                        return (
                          <tr
                            key={`${item.id}-${batch.id}`}
                            className={`${rowBgClass} hover:bg-slate-50/80 transition-colors ${
                              bIdx > 0 ? 'border-t border-dashed border-slate-200' : 'border-t border-slate-200'
                            } ${isBeingCountedByOther && isFirstBatch ? 'border-l-4 border-l-amber-500' : ''}`}
                          >
                            {/* No */}
                            {isFirstBatch && (
                              <td rowSpan={batchCount} className="p-3 text-center text-slate-400 font-mono text-[10px] align-top">
                                {pageStartIndex + idx + 1}
                              </td>
                            )}

                            {/* Product Name & Details + Real-Time Multi-User Warning Badge */}
                            {isFirstBatch && (
                              <td rowSpan={batchCount} className="p-3 align-top">
                                <strong className="text-slate-900 block text-xs">{item.name}</strong>
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] text-slate-500 font-mono">
                                  <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-700 font-semibold">
                                    Rak: {item.rack || '-'}
                                  </span>
                                  <span>·</span>
                                  <MedicineCategorySymbol category={item.category} size="xs" />
                                </div>

                                {/* Real-Time Badge: Sedang dihitung oleh [Nama/Akun Petugas] */}
                                {isBeingCountedByOther && (
                                  <div className="mt-2 space-y-1">
                                    {remoteActivitiesForItem.map((act) => (
                                      <div
                                        key={`${act.sessionId}-${act.medicineId}`}
                                        className="p-2 rounded-xl bg-amber-100/90 border border-amber-300 text-amber-950 text-[10px] space-y-0.5 shadow-2xs"
                                      >
                                        <div className="flex items-center gap-1.5 font-black text-amber-900">
                                          <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping shrink-0" />
                                          <Lock className="w-3 h-3 text-amber-700 shrink-0" />
                                          <span>Sedang dihitung oleh {act.staffName}</span>
                                        </div>
                                        <div className="text-[9px] text-amber-800 pl-3.5 leading-snug">
                                          Belum klik &ldquo;Terapkan Hasil Opname&rdquo;
                                          {act.statusText ? ` · ${act.statusText}` : ''}
                                          {act.updatedTimeLabel ? ` (${act.updatedTimeLabel})` : ''}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isLockedByOther}
                                    onClick={() => handleAddBatchRow(item.id)}
                                    className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-700 border border-indigo-200 rounded-md text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                                    title={
                                      isLockedByOther
                                        ? `Terkunci sementara karena sedang dihitung oleh ${remoteActivitiesForItem[0]?.staffName}`
                                        : 'Tambah batch & ED lain untuk produk ini'
                                    }
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Batch / ED</span>
                                  </button>
                                  {batchCount > 1 && (
                                    <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md">
                                      {batchCount} Batch
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* Kolom Batch & ED (FEFO) */}
                            <td className="p-2.5 align-top">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`text-[9px] font-mono font-black px-1.5 py-0.2 rounded ${
                                    isFirstBatch
                                      ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}>
                                    {batchCount > 1 ? `Batch #${bIdx + 1}` : 'Batch Utama'}
                                  </span>

                                  <div className="flex items-center gap-1">
                                    {isBatchExpired && (
                                      <span className="text-[9px] font-bold bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded border border-rose-200">
                                        EXPIRED
                                      </span>
                                    )}
                                    {isBatchNearExp && (
                                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded border border-amber-200">
                                        ED Dekat
                                      </span>
                                    )}
                                    {batchCount > 1 && !isLockedByOther && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveBatchRow(item.id, batch.id)}
                                        className="p-0.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                                        title="Hapus baris batch ini"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-1.5">
                                  <div>
                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">
                                      No. Batch
                                    </label>
                                    <input
                                      type="text"
                                      disabled={isLockedByOther}
                                      value={batch.batchNo}
                                      onFocus={() => setFocusedMedicineId(item.id)}
                                      onBlur={() =>
                                        setFocusedMedicineId((prev) => (prev === item.id ? null : prev))
                                      }
                                      onChange={(e) =>
                                        handleBatchFieldChange(item.id, batch.id, 'batchNo', e.target.value)
                                      }
                                      placeholder="No. Batch"
                                      className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono font-bold text-[11px] bg-white disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">
                                      Exp. Date
                                    </label>
                                    <input
                                      type="date"
                                      disabled={isLockedByOther}
                                      value={batch.expDate}
                                      onFocus={() => setFocusedMedicineId(item.id)}
                                      onBlur={() =>
                                        setFocusedMedicineId((prev) => (prev === item.id ? null : prev))
                                      }
                                      onChange={(e) =>
                                        handleBatchFieldChange(item.id, batch.id, 'expDate', e.target.value)
                                      }
                                      className={`w-full px-1.5 py-1 border rounded-lg font-mono font-bold text-[11px] bg-white disabled:bg-slate-100 disabled:text-slate-400 outline-none focus:ring-1 focus:ring-indigo-500 ${
                                        isBatchExpired
                                          ? 'border-rose-400 text-rose-700 bg-rose-50/40'
                                          : isBatchNearExp
                                          ? 'border-amber-400 text-amber-800 bg-amber-50/40'
                                          : 'border-slate-300 text-slate-900'
                                      }`}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* System Stock (per batch + total if multi-batch) */}
                            <td className="p-3 text-center font-mono align-top">
                              <span className="font-extrabold text-slate-800 text-sm block">
                                {batch.systemStock} {item.unit}
                              </span>
                              {item.ratio > 1 && (
                                <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                                  ({Math.floor(batch.systemStock / item.ratio)} {item.satuanBesar} + {batch.systemStock % item.ratio} {item.satuanKecil})
                                </span>
                              )}
                              {batchCount > 1 && isFirstBatch && (
                                <span className="inline-block mt-1.5 px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-600 border border-slate-200">
                                  Total Sistem: {item.systemStock} {item.unit}
                                </span>
                              )}
                            </td>

                            {/* Live Sales during Opname */}
                            {isFirstBatch && (
                              <td rowSpan={batchCount} className="p-3 text-center font-mono align-top">
                                {item.liveSales > 0 ? (
                                  <div className="inline-block px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-[11px] font-bold">
                                    <span className="block text-[9px] uppercase text-indigo-600">POS Kasir</span>
                                    -{item.liveSales} {item.unit}
                                  </div>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            )}

                            {/* Physical Stock Input (Dual Satuan: Besar & Kecil per batch) + Conflict Lock Guard */}
                            <td className="p-3 align-top">
                              {isFirstBatch && isBeingCountedByOther && (
                                <div
                                  className={`mb-2 p-2 rounded-xl border text-[10px] flex items-center justify-between gap-2 ${
                                    isLockedByOther
                                      ? 'bg-amber-100/90 border-amber-300 text-amber-950'
                                      : 'bg-sky-50 border-sky-200 text-sky-900'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 font-bold">
                                    {isLockedByOther ? (
                                      <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                    ) : (
                                      <Unlock className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                                    )}
                                    <span>
                                      {isLockedByOther
                                        ? `Terkunci: Sedang dihitung oleh ${remoteActivitiesForItem[0]?.staffName}`
                                        : `Mode Ambil Alih Aktif (${remoteActivitiesForItem[0]?.staffName} juga sedang menghitung)`}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOverriddenLocks((prev) => ({
                                        ...prev,
                                        [item.id]: !prev[item.id]
                                      }))
                                    }
                                    className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-md font-extrabold text-[9px] shrink-0 cursor-pointer transition"
                                  >
                                    {isLockedByOther ? 'Ambil Alih' : 'Kunci Kembali'}
                                  </button>
                                </div>
                              )}

                              {item.ratio > 1 ? (
                                <div className="flex flex-col items-center gap-1.5 min-w-[220px]">
                                  <div className="flex items-center justify-center gap-1.5 w-full">
                                    {/* Input Satuan Besar */}
                                    <div className="flex flex-col items-center flex-1 max-w-[95px]">
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        disabled={isLockedByOther}
                                        value={batch.physicalBesar ?? ''}
                                        onFocus={() => setFocusedMedicineId(item.id)}
                                        onBlur={() =>
                                          setFocusedMedicineId((prev) => (prev === item.id ? null : prev))
                                        }
                                        onChange={(e) =>
                                          handleBatchDualStockChange(
                                            item.id,
                                            batch.id,
                                            e.target.value,
                                            batch.physicalKecil ?? '',
                                            item.ratio
                                          )
                                        }
                                        placeholder={Math.floor(batch.systemStock / item.ratio).toString()}
                                        className={`w-full py-1.5 px-2 text-center font-mono font-black text-xs rounded-xl border outline-none transition shadow-2xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
                                          isBatchFilled
                                            ? batchParsed === batch.systemStock
                                              ? 'bg-emerald-50 border-emerald-400 text-emerald-950 focus:ring-2 focus:ring-emerald-500'
                                              : batchParsed < batch.systemStock
                                              ? 'bg-rose-50 border-rose-400 text-rose-950 focus:ring-2 focus:ring-rose-500'
                                              : 'bg-blue-50 border-blue-400 text-blue-950 focus:ring-2 focus:ring-blue-500'
                                            : 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-indigo-500'
                                        }`}
                                      />
                                      <span className="text-[10px] font-bold text-slate-600 truncate max-w-[90px] mt-0.5" title={item.satuanBesar}>
                                        {item.satuanBesar}
                                      </span>
                                    </div>

                                    <span className="text-slate-400 font-black text-xs pb-4">+</span>

                                    {/* Input Satuan Kecil */}
                                    <div className="flex flex-col items-center flex-1 max-w-[95px]">
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        disabled={isLockedByOther}
                                        value={batch.physicalKecil ?? ''}
                                        onFocus={() => setFocusedMedicineId(item.id)}
                                        onBlur={() =>
                                          setFocusedMedicineId((prev) => (prev === item.id ? null : prev))
                                        }
                                        onChange={(e) =>
                                          handleBatchDualStockChange(
                                            item.id,
                                            batch.id,
                                            batch.physicalBesar ?? '',
                                            e.target.value,
                                            item.ratio
                                          )
                                        }
                                        placeholder={(batch.systemStock % item.ratio).toString()}
                                        className={`w-full py-1.5 px-2 text-center font-mono font-black text-xs rounded-xl border outline-none transition shadow-2xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
                                          isBatchFilled
                                            ? batchParsed === batch.systemStock
                                              ? 'bg-emerald-50 border-emerald-400 text-emerald-950 focus:ring-2 focus:ring-emerald-500'
                                              : batchParsed < batch.systemStock
                                              ? 'bg-rose-50 border-rose-400 text-rose-950 focus:ring-2 focus:ring-rose-500'
                                              : 'bg-blue-50 border-blue-400 text-blue-950 focus:ring-2 focus:ring-blue-500'
                                            : 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-indigo-500'
                                        }`}
                                      />
                                      <span className="text-[10px] font-bold text-slate-600 truncate max-w-[90px] mt-0.5" title={item.satuanKecil}>
                                        {item.satuanKecil}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Live Formula & Total Display */}
                                  {isBatchFilled ? (
                                    <div className="px-2 py-0.5 bg-slate-100 rounded-lg border border-slate-200 text-[10px] font-mono font-bold text-slate-700 flex flex-wrap items-center justify-center gap-1">
                                      <span className="text-slate-500 font-sans text-[9px]">
                                        {batchCount > 1 ? `Subtotal Batch #${bIdx + 1}:` : 'Total:'}
                                      </span>
                                      <strong className="text-slate-950">{batchParsed}</strong>
                                      <span>{item.unit}</span>
                                      <span className="text-[9px] text-slate-400 font-normal">
                                        ({batch.physicalBesar || 0}×{item.ratio} + {batch.physicalKecil || 0})
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 font-mono">
                                      1 {item.satuanBesar} = {item.ratio} {item.satuanKecil}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center gap-1 min-w-[100px]">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    disabled={isLockedByOther}
                                    value={batch.physicalStock}
                                    onFocus={() => setFocusedMedicineId(item.id)}
                                    onBlur={() =>
                                      setFocusedMedicineId((prev) => (prev === item.id ? null : prev))
                                    }
                                    onChange={(e) =>
                                      handleBatchSingleStockChange(item.id, batch.id, e.target.value)
                                    }
                                    placeholder={batch.systemStock.toString()}
                                    className={`w-24 p-2 text-center font-mono font-black text-sm rounded-xl border outline-none transition shadow-2xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
                                      isBatchFilled
                                        ? batchParsed === batch.systemStock
                                          ? 'bg-emerald-50 border-emerald-400 text-emerald-950 focus:ring-2 focus:ring-emerald-500'
                                          : batchParsed < batch.systemStock
                                          ? 'bg-rose-50 border-rose-400 text-rose-950 focus:ring-2 focus:ring-rose-500'
                                          : 'bg-blue-50 border-blue-400 text-blue-950 focus:ring-2 focus:ring-blue-500'
                                        : 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-indigo-500'
                                    }`}
                                  />
                                  <span className="text-[10px] font-bold text-slate-500">{item.unit}</span>
                                </div>
                              )}
                            </td>

                            {/* HPP Input (Satuan Besar & Satuan Kecil, auto-update Master Obat & Harga Jual = HPP + %Markup) */}
                            {isFirstBatch && (
                              <td rowSpan={batchCount} className="p-3 align-top">
                                <div className="space-y-1.5 min-w-[165px]">
                                  <div>
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase truncate">
                                        HPP / {item.satuanBesar}
                                      </label>
                                      {item.hasHppModified && (
                                        <button
                                          type="button"
                                          onClick={() => handleResetHpp(item.id)}
                                          className="text-[9px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                                          title="Kembalikan HPP ke Master Obat"
                                        >
                                          Reset
                                        </button>
                                      )}
                                    </div>
                                    <div className="relative">
                                      <span className="absolute left-2 top-1.5 text-[10px] font-bold text-slate-400">
                                        Rp
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        disabled={isLockedByOther}
                                        value={
                                          item.hppBesarInput !== undefined
                                            ? item.hppBesarInput
                                            : String(item.currentHppBesar)
                                        }
                                        onFocus={() => setFocusedMedicineId(item.id)}
                                        onBlur={() =>
                                          setFocusedMedicineId((prev) =>
                                            prev === item.id ? null : prev
                                          )
                                        }
                                        onChange={(e) =>
                                          handleHppChange(
                                            item.id,
                                            'besar',
                                            e.target.value,
                                            item.ratio
                                          )
                                        }
                                        placeholder={String(item.currentHppBesar)}
                                        className={`w-full pl-7 pr-2 py-1 text-right font-mono font-extrabold text-xs rounded-lg border outline-none transition disabled:bg-slate-100 disabled:text-slate-400 ${
                                          item.hasHppModified
                                            ? 'bg-amber-50 border-amber-400 text-amber-950 focus:ring-2 focus:ring-amber-500'
                                            : 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-indigo-500'
                                        }`}
                                      />
                                    </div>
                                  </div>

                                  {item.ratio > 1 && (
                                    <div>
                                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5 truncate">
                                        HPP / {item.satuanKecil}
                                      </label>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1.5 text-[10px] font-bold text-slate-400">
                                          Rp
                                        </span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          disabled={isLockedByOther}
                                          value={
                                            item.hppKecilInput !== undefined
                                              ? item.hppKecilInput
                                              : String(item.currentHppKecil)
                                          }
                                          onFocus={() => setFocusedMedicineId(item.id)}
                                          onBlur={() =>
                                            setFocusedMedicineId((prev) =>
                                              prev === item.id ? null : prev
                                            )
                                          }
                                          onChange={(e) =>
                                            handleHppChange(
                                              item.id,
                                              'kecil',
                                              e.target.value,
                                              item.ratio
                                            )
                                          }
                                          placeholder={String(item.currentHppKecil)}
                                          className={`w-full pl-7 pr-2 py-1 text-right font-mono font-bold text-[11px] rounded-lg border outline-none transition disabled:bg-slate-100 disabled:text-slate-400 ${
                                            item.hasHppModified
                                              ? 'bg-amber-50 border-amber-300 text-amber-900 focus:ring-2 focus:ring-amber-500'
                                              : 'bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500'
                                          }`}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {item.hasHppModified ? (
                                    <div className="px-1.5 py-1 rounded-md bg-amber-100/90 border border-amber-300 text-[9px] font-bold text-amber-900 leading-tight">
                                      Master HPP &amp; Harga Jual (+%Markup) akan diperbarui
                                    </div>
                                  ) : (
                                    <div className="text-[9px] text-slate-400 font-mono text-right">
                                      Awal: Rp {item.currentHppBesar.toLocaleString('id-ID')}/{item.satuanBesar}
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* Difference (Aggregate across all batches of product) */}
                            {isFirstBatch && (
                              <td rowSpan={batchCount} className="p-3 text-center font-mono font-bold text-xs align-top">
                                {item.hasCounted ? (
                                  <div className="space-y-1">
                                    {batchCount > 1 && (
                                      <div className="text-[10px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200 font-bold">
                                        Total Fisik: {item.parsedPhysical} {item.unit}
                                      </div>
                                    )}
                                    {item.difference === 0 ? (
                                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full inline-flex items-center gap-1 text-[11px]">
                                        <Check className="w-3 h-3 text-emerald-700" /> Cocok
                                      </span>
                                    ) : item.difference > 0 ? (
                                      <div className="space-y-0.5">
                                        <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full inline-flex items-center gap-1 text-[11px]">
                                          <TrendingUp className="w-3 h-3 text-blue-700" /> +{item.difference} {item.unit}
                                        </span>
                                        {item.ratio > 1 && (
                                          <span className="block text-[9px] text-blue-700 font-semibold">
                                            (+{Math.floor(item.difference / item.ratio)} {item.satuanBesar} +{item.difference % item.ratio} {item.satuanKecil})
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="space-y-0.5">
                                        <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-full inline-flex items-center gap-1 text-[11px]">
                                          <TrendingDown className="w-3 h-3 text-rose-700" /> {item.difference} {item.unit}
                                        </span>
                                        {item.ratio > 1 && (
                                          <span className="block text-[9px] text-rose-700 font-semibold">
                                            (-{Math.floor(Math.abs(item.difference) / item.ratio)} {item.satuanBesar} {Math.abs(item.difference) % item.ratio} {item.satuanKecil})
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <div className="text-[9px] text-indigo-700 font-semibold pt-0.5">
                                      FEFO Utama: {item.previewPrimaryBatchNo} ({item.previewPrimaryExpDate || '-'})
                                    </div>
                                  </div>
                                ) : isBeingCountedByOther ? (
                                  <div className="space-y-0.5">
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-900 border border-orange-300 rounded-full inline-flex items-center gap-1 text-[10px] font-bold">
                                      <Lock className="w-3 h-3 text-orange-700" /> Sedang Dihitung
                                    </span>
                                    <span className="block text-[9px] text-orange-800 font-semibold">
                                      Oleh: {remoteActivitiesForItem[0]?.staffName}
                                    </span>
                                  </div>
                                ) : item.opnamedInLast4Months ? (
                                  <div className="space-y-0.5">
                                    <span className="px-2 py-0.5 bg-sky-100 text-sky-800 border border-sky-200 rounded-full inline-flex items-center gap-1 text-[10px] font-bold">
                                      <Check className="w-3 h-3 text-sky-700" /> Sudah Opname
                                    </span>
                                    <span className="block text-[9px] text-slate-500 font-normal">
                                      Terakhir: {item.lastOpnameDate} ({item.lastOpnamePetugas})
                                    </span>
                                  </div>
                                ) : (
                                  <div className="space-y-0.5">
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full inline-flex items-center gap-1 text-[10px] font-bold">
                                      <AlertTriangle className="w-3 h-3 text-amber-700" /> Belum Opname
                                    </span>
                                    <span className="block text-[9px] text-amber-700 font-normal">
                                      {item.lastOpnameDate
                                        ? `>4 Bln (Terakhir: ${item.lastOpnameDate})`
                                        : 'Belum pernah opname (4 bln)'}
                                    </span>
                                  </div>
                                )}
                              </td>
                            )}

                            {/* Discrepancy Value (HPP) */}
                            {isFirstBatch && (
                              <td rowSpan={batchCount} className="p-3 text-right font-mono font-bold text-xs align-top">
                                {item.hasCounted ? (
                                  item.diffValueHpp === 0 ? (
                                    <span className="text-slate-400">Rp 0</span>
                                  ) : item.diffValueHpp > 0 ? (
                                    <span className="text-blue-700">+Rp {item.diffValueHpp.toLocaleString('id-ID')}</span>
                                  ) : (
                                    <span className="text-rose-700">
                                      -Rp {Math.abs(item.diffValueHpp).toLocaleString('id-ID')}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            )}

                            {/* Quick Actions */}
                            {isFirstBatch && (
                              <td rowSpan={batchCount} className="p-3 text-center align-top">
                                <button
                                  type="button"
                                  disabled={isLockedByOther}
                                  onClick={() => handleSetMatch(item.id, item.ratio)}
                                  title={
                                    isLockedByOther
                                      ? `Terkunci: Sedang dihitung oleh ${remoteActivitiesForItem[0]?.staffName}`
                                      : 'Set semua batch hitung fisik = stok sistem'
                                  }
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 rounded-lg text-[10px] font-bold transition cursor-pointer border border-slate-200"
                                >
                                  Cocok
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalCount={totalFilteredCount}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
          isLoading={isServerLoading}
          itemLabel="obat opname"
        />
      </div>
        </>
      )}

      {/* Confirmation Modal Before Applying Opname */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm uppercase tracking-wide">
                  Konfirmasi Posting Rekonsiliasi Stok Opname
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-800">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-600 uppercase text-[10px] block">
                  Ringkasan Hasil Perhitungan Fisik:
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Total Item Diproses:</span>
                    <strong className="block text-slate-900 font-mono text-sm">
                      {stats.readyToApplyCount} Produk
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Akurasi Cocok (0 Selisih):</span>
                    <strong className="block text-emerald-700 font-mono text-sm">
                      {stats.matchCount} Produk
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Selisih Lebih (Surplus):</span>
                    <strong className="block text-blue-700 font-mono text-sm">
                      +{stats.surplusCount} Produk (+Rp {stats.totalSurplusValue.toLocaleString('id-ID')})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Selisih Kurang (Minus):</span>
                    <strong className="block text-rose-700 font-mono text-sm">
                      -{stats.deficitCount} Produk (-Rp {stats.totalDeficitValue.toLocaleString('id-ID')})
                    </strong>
                  </div>
                </div>
                {stats.hppUpdatedCount > 0 && (
                  <div className="mt-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold">
                    Pembaruan HPP &amp; Harga Jual (+%Markup): {stats.hppUpdatedCount} Produk
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Jenis Stok Opname *
                </label>
                <select
                  value={opnameKind}
                  onChange={(e) => setOpnameKind(e.target.value as StockOpnameKind)}
                  className="w-full p-2.5 border border-indigo-300 rounded-xl font-extrabold bg-indigo-50/70 text-indigo-950 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="STOK_AWAL">Stok Awal</option>
                  <option value="PENYESUAIAN_STOK">Penyesuaian Stok</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Petugas Pelaksana Stok Opname (Data Pegawai) *
                </label>
                {staffList.length > 0 ? (
                  <select
                    value={selectedOpnameStaff}
                    onChange={(e) => setSelectedOpnameStaff(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {!staffList.some((s) => s.name === selectedOpnameStaff) && (
                      <option value={selectedOpnameStaff}>{selectedOpnameStaff}</option>
                    )}
                    {staffList
                      .filter((s) => s.status !== 'Non-Aktif')
                      .map((st) => (
                        <option key={st.id} value={st.name}>
                          {st.name} ({st.role})
                        </option>
                      ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedOpnameStaff}
                    onChange={(e) => setSelectedOpnameStaff(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-slate-900"
                  />
                )}
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-950 text-[11px] leading-relaxed">
                <strong>Ketentuan Posting ({opnameKind === 'STOK_AWAL' ? 'Stok Awal' : 'Penyesuaian Stok'}):</strong>{' '}
                Sistem akan langsung memperbarui kolom Stok, daftar Batch &amp; ED (FEFO), serta HPP (beserta form edit Master Obat) dan otomatis menghitung ulang Harga Jual berdasarkan <strong>HPP + %Markup</strong> pada Master Obat. Catatan mutasi otomatis terintegrasi ke <em>Kartu Stok Digital FEFO</em> dengan tipe{' '}
                <strong>{opnameKind === 'STOK_AWAL' ? 'STOK_AWAL' : 'STOK_OPNAME (Penyesuaian Stok)'}</strong> oleh petugas <strong>{selectedOpnameStaff || userName}</strong>.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteApplyOpname}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition"
                >
                  <Save className="w-4 h-4" />
                  <span>Ya, Terapkan Sekarang</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Reset Session */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">
                  Reset Sesi Stok Opname
                </h3>
                <p className="text-xs text-slate-500">
                  Kosongkan seluruh input hitungan sementara
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Apakah Anda yakin ingin mengatur ulang sesi Stok Opname ini? Semua data input hitungan fisik &amp; perubahan Batch/ED yang belum diposting akan dikosongkan.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteResetSession}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-xl text-xs shadow-md cursor-pointer"
              >
                Ya, Reset Sesi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Delete Opname History Record */}
      {pendingDeleteRecord && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">
                  Hapus Riwayat Stok Opname
                </h3>
                <p className="text-xs text-slate-500">
                  Ref: <span className="font-mono font-bold">{pendingDeleteRecord.refNo}</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Apakah Anda yakin ingin menghapus dokumen riwayat opname{' '}
              <strong className="text-rose-700">#{pendingDeleteRecord.refNo}</strong> tanggal{' '}
              <strong>{pendingDeleteRecord.date}</strong>?{' '}
              {isDemoSandbox
                ? 'Penghapusan hanya berlaku di penyimpanan lokal Mode Demo Sandbox.'
                : 'Penghapusan juga akan disinkronkan ke tabel Supabase riwayat_opname (saldo stok master obat tidak berubah).'}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingDeleteRecord(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingRecord}
                onClick={handleConfirmDeleteRecord}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-extrabold rounded-xl text-xs shadow-md cursor-pointer"
              >
                {isDeletingRecord ? 'Menghapus...' : 'Ya, Hapus Riwayat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Skema SQL Supabase Riwayat Opname (APJ / Owner Only) */}
      {isOwnerAdmin && showSchemaModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600" />
                  Skema SQL Supabase &mdash; Riwayat Stok Opname
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tabel <strong className="font-mono">{opnameTableInput}</strong> untuk sinkronisasi 2-arah &amp; real-time arsip rekonsiliasi stok opname dan rincian batch FEFO.
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
                    Nama Tabel Riwayat Opname di Supabase
                  </label>
                  <input
                    type="text"
                    value={opnameTableInput}
                    onChange={(e) => setOpnameTableInput(e.target.value)}
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
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
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
                  {SUPABASE_OPNAME_SQL_SCHEMA}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCameraScanner && (
        <Suspense fallback={null}>
          <CameraBarcodeScannerModal
            isOpen={showCameraScanner}
            onClose={() => setShowCameraScanner(false)}
            title="Scan Barcode Stok Opname"
            subtitle="Arahkan kamera ke barcode kemasan obat untuk langsung menampilkan obat dan menghitung stok fisik."
            scanMode="barcode"
            onScanSuccess={(code) => {
              processBarcodeScan(code);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
