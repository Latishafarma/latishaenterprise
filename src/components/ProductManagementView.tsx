import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Trash2,
  RotateCcw,
  Printer,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  FileText,
  Edit3
} from 'lucide-react';
import {
  Medicine,
  Supplier,
  PurchaseInvoice,
  Branch,
  EdAlertThreshold
} from '../types';
import {
  useFacilityProfiles,
  getSavedPharmacyProfile,
  getSavedAPJProfile,
  getSavedDPJProfile,
  syncFacilityProfileToServer,
  formatPharmacyAddress,
  formatPharmacyLegalInfo
} from '../utils/facilityProfileHelper';
import { syncFacilityProfilesToSupabase } from '../utils/supabaseClient';
import { demoGetItem, demoSetItem, isDemoMode } from '../utils/demoSandbox';
import { PaginationControls } from './PaginationControls';

export interface ProductExpiryRow {
  rowKey: string;
  medicineId: string;
  medicine: Medicine;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  rack: string;
  supplier: string;
  batchId?: string;
  batchNo: string;
  expDate: string;
  expDateIso: string;
  daysLeft: number;
  status: 'ED' | 'NEAR_ED';
  stock: number;
  hpp: number;
  assetValue: number;
}

export interface DisposalActionPayload {
  baNumber: string;
  method: string;
  witness: string;
  reason: string;
  disposalLocation?: string;
  witness1Name?: string;
  witness1Nip?: string;
  witness1Role?: string;
  witness2Name?: string;
  witness2Nip?: string;
  witness2Role?: string;
  items: {
    medicineId: string;
    name: string;
    batchId?: string;
    batchNo: string;
    expDate: string;
    qty: number;
    unit: string;
    hpp: number;
    subtotal: number;
  }[];
}

export interface ReturnActionPayload {
  pbfName: string;
  invoiceNo: string;
  reason: string;
  items: {
    medicineId: string;
    name: string;
    batchId?: string;
    batchNo: string;
    expDate: string;
    qty: number;
    unit: string;
    price: number;
    subtotal: number;
  }[];
}

export interface DisposalHistoryRecord {
  id: string;
  baNumber: string;
  date: string;
  time: string;
  method: string;
  witness: string;
  reason: string;
  petugas: string;
  disposalLocation?: string;
  witness1Name?: string;
  witness1Nip?: string;
  witness1Role?: string;
  witness2Name?: string;
  witness2Nip?: string;
  witness2Role?: string;
  apjName?: string;
  apjSipa?: string;
  pharmacyName?: string;
  pharmacyAddress?: string;
  pharmacyCity?: string;
  totalItems: number;
  totalQty: number;
  totalValue: number;
  items: DisposalActionPayload['items'];
}

interface ProductManagementViewProps {
  medicines: Medicine[];
  suppliers?: Supplier[];
  purchaseInvoices?: PurchaseInvoice[];
  currentBranch: Branch;
  userName: string;
  onProcessDisposal: (payload: DisposalActionPayload) => void;
  onProcessReturn: (payload: ReturnActionPayload) => void;
  onSyncMedicinesSupabase?: () => Promise<{ success: boolean; count?: number; error?: string }>;
  onNavigateTab?: (tab: string) => void;
}

const DEFAULT_ED_THRESHOLDS: EdAlertThreshold[] = [
  { id: 'ed-30', label: '≤ 1 Bulan (30 Hari)', value: 30, unit: 'hari', days: 30, isDefault: true },
  { id: 'ed-90', label: '≤ 3 Bulan (90 Hari)', value: 90, unit: 'hari', days: 90, isDefault: true },
  { id: 'ed-180', label: '≤ 6 Bulan (180 Hari)', value: 180, unit: 'hari', days: 180, isDefault: true }
];

const DISPOSAL_HISTORY_STORAGE_KEY = 'latisha_product_disposal_history';

const DISPOSAL_METHODS = [
  'Insinerasi / Pihak Ketiga Berizin',
  'Pengenceran & Pembuangan Limbah Cair',
  'Penghancuran Kemasan & Penguburan',
  'Penarikan & Pengembalian ke Distributor',
  'Lainnya (Sesuai SOP Apotek)'
];

/**
 * Parse various Master Obat expiry date formats (YYYY-MM-DD, YYYY-MM, DD/MM/YYYY, MM/YYYY)
 * into a local midnight Date and normalized YYYY-MM-DD string.
 */
function parseExpiryDate(raw?: string | null): { date: Date; iso: string } | null {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  if (!cleaned || cleaned === '-' || cleaned.toLowerCase() === 'null') return null;

  // YYYY-MM-DD or YYYY/MM/DD (with optional timestamp)
  let m = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (y >= 1990 && y <= 2150 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, mo - 1, d);
      if (!Number.isNaN(dt.getTime())) {
        return {
          date: dt,
          iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        };
      }
    }
  }

  // YYYY-MM (assume last day of month)
  m = cleaned.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (y >= 1990 && y <= 2150 && mo >= 1 && mo <= 12) {
      const lastDay = new Date(y, mo, 0).getDate();
      const dt = new Date(y, mo - 1, lastDay);
      return {
        date: dt,
        iso: `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      };
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  m = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (y >= 1990 && y <= 2150 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, mo - 1, d);
      if (!Number.isNaN(dt.getTime())) {
        return {
          date: dt,
          iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        };
      }
    }
  }

  // MM/YYYY or MM-YYYY (assume last day of month)
  m = cleaned.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    const y = Number(m[2]);
    if (y >= 1990 && y <= 2150 && mo >= 1 && mo <= 12) {
      const lastDay = new Date(y, mo, 0).getDate();
      const dt = new Date(y, mo - 1, lastDay);
      return {
        date: dt,
        iso: `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      };
    }
  }

  const fallback = new Date(cleaned);
  if (!Number.isNaN(fallback.getTime())) {
    const y = fallback.getFullYear();
    const mo = fallback.getMonth() + 1;
    const d = fallback.getDate();
    return {
      date: new Date(y, mo - 1, d),
      iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    };
  }
  return null;
}

function formatDateID(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${m[3]} ${months[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}

function parseIndonesianDateParts(iso?: string): {
  dayName: string;
  dayNum: string;
  monthName: string;
  year: string;
  fullDate: string;
} {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
  ];
  let dt = new Date();
  if (iso) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    } else {
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) dt = parsed;
    }
  }
  const dayName = days[dt.getDay()] || 'Senin';
  const dayNum = String(dt.getDate()).padStart(2, '0');
  const monthName = months[dt.getMonth()] || 'Januari';
  const year = String(dt.getFullYear());
  return {
    dayName,
    dayNum,
    monthName,
    year,
    fullDate: `${dayNum} ${monthName} ${year}`
  };
}

export const ProductManagementView: React.FC<ProductManagementViewProps> = ({
  medicines,
  suppliers = [],
  purchaseInvoices = [],
  currentBranch,
  userName,
  onProcessDisposal,
  onProcessReturn,
  onSyncMedicinesSupabase,
  onNavigateTab
}) => {
  const { pharmacyProfile, apjProfile } = useFacilityProfiles();

  // Merge built-in defaults with any custom ED thresholds persisted in PharmacyProfile / Supabase
  const edThresholds = useMemo<EdAlertThreshold[]>(() => {
    const customList = Array.isArray(pharmacyProfile.edAlertThresholds)
      ? pharmacyProfile.edAlertThresholds
      : [];
    const byDays = new Map<number, EdAlertThreshold>();
    DEFAULT_ED_THRESHOLDS.forEach((t) => byDays.set(t.days, t));
    customList.forEach((t) => {
      if (t && Number(t.days) > 0) {
        const cleanDays = Math.round(Number(t.days));
        if (!byDays.has(cleanDays)) {
          byDays.set(cleanDays, {
            ...t,
            days: cleanDays,
            isDefault: false
          });
        }
      }
    });
    return Array.from(byDays.values()).sort((a, b) => a.days - b.days);
  }, [pharmacyProfile.edAlertThresholds]);

  const [activeSubTab, setActiveSubTab] = useState<'produk' | 'riwayat-pemusnahan'>('produk');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ED' | 'NEAR_ED'>('ALL');
  const [activeWindowDays, setActiveWindowDays] = useState<number>(90);
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK'>('ALL');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Add custom ED threshold modal state (+ button)
  const [showAddThresholdModal, setShowAddThresholdModal] = useState<boolean>(false);
  const [newThresholdValue, setNewThresholdValue] = useState<string>('12');
  const [newThresholdUnit, setNewThresholdUnit] = useState<'hari' | 'bulan'>('bulan');
  const [newThresholdLabel, setNewThresholdLabel] = useState<string>('');
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  // Sync & notification banner
  const [isSyncingMaster, setIsSyncingMaster] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Row selection via checkboxes
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  // Action Modals (Pemusnahan & Retur)
  const [actionModalMode, setActionModalMode] = useState<'disposal' | 'return' | null>(null);
  const [actionItems, setActionItems] = useState<
    Array<{
      rowKey: string;
      medicineId: string;
      name: string;
      batchId?: string;
      batchNo: string;
      expDate: string;
      availableStock: number;
      qty: number;
      unit: string;
      hpp: number;
      supplier: string;
      status: 'ED' | 'NEAR_ED';
    }>
  >([]);
  const [disposalBaNumber, setDisposalBaNumber] = useState<string>('');
  const [disposalMethod, setDisposalMethod] = useState<string>(DISPOSAL_METHODS[0]);
  const [disposalLocation, setDisposalLocation] = useState<string>('');
  const [disposalWitness1Name, setDisposalWitness1Name] = useState<string>('');
  const [disposalWitness1Nip, setDisposalWitness1Nip] = useState<string>('');
  const [disposalWitness1Role, setDisposalWitness1Role] = useState<string>('Tenaga Teknis Kefarmasian (TTK)');
  const [disposalWitness2Name, setDisposalWitness2Name] = useState<string>('');
  const [disposalWitness2Nip, setDisposalWitness2Nip] = useState<string>('');
  const [disposalWitness2Role, setDisposalWitness2Role] = useState<string>('');
  const [disposalReason, setDisposalReason] = useState<string>('Obat Kadaluwarsa (ED)');
  const [returnPbfName, setReturnPbfName] = useState<string>('');
  const [returnInvoiceNo, setReturnInvoiceNo] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('Produk mendekati ED / sudah ED sesuai kesepakatan PBF');
  const [actionFormError, setActionFormError] = useState<string | null>(null);

  // In-app Print Preview Modal state (safe React rendering, zero raw HTML injection)
  const [printPreviewDoc, setPrintPreviewDoc] = useState<
    | { kind: 'list'; titleSuffix: string; rows: ProductExpiryRow[] }
    | { kind: 'disposal'; record: DisposalHistoryRecord }
    | null
  >(null);
  const [isEditingBaMeta, setIsEditingBaMeta] = useState<boolean>(false);

  // Local history of completed disposals for printing Berita Acara
  const [disposalHistory, setDisposalHistory] = useState<DisposalHistoryRecord[]>(() => {
    try {
      const raw = demoGetItem(DISPOSAL_HISTORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const persistDisposalHistory = (list: DisposalHistoryRecord[]) => {
    setDisposalHistory(list);
    try {
      demoSetItem(DISPOSAL_HISTORY_STORAGE_KEY, JSON.stringify(list));
    } catch {}
  };

  // Fallback supplier lookup from purchase invoices if Master Obat supplier is empty
  const supplierByMedId = useMemo(() => {
    const map = new Map<string, string>();
    purchaseInvoices.forEach((inv) => {
      const pbf = (inv.pbfName || '').trim();
      if (!pbf || pbf.toUpperCase() === 'DEFAULT') return;
      (inv.items || []).forEach((it) => {
        if (it.medicineId && !map.has(it.medicineId)) {
          map.set(it.medicineId, pbf);
        }
      });
    });
    return map;
  }, [purchaseInvoices]);

  // Persist updated custom ED thresholds to PharmacyProfile + localStorage + Backend + Supabase
  const saveCustomThresholdsToSystem = (nextCustomList: EdAlertThreshold[]) => {
    const currentPharm = getSavedPharmacyProfile();
    const updatedPharm = {
      ...currentPharm,
      edAlertThresholds: nextCustomList
    };
    const apj = getSavedAPJProfile();
    const dpj = getSavedDPJProfile();
    try {
      demoSetItem('latisha_pharmacy_profile', JSON.stringify(updatedPharm));
      syncFacilityProfileToServer({ pharmacy: updatedPharm, apj, dpj });
      window.dispatchEvent(new Event('latisha_profile_updated'));
      if (!isDemoMode()) {
        void syncFacilityProfilesToSupabase({ pharmacy: updatedPharm, apj, dpj });
      }
    } catch {}
  };

  const handleAddCustomThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    setThresholdError(null);
    const numericVal = Math.round(Number(newThresholdValue));
    if (!Number.isFinite(numericVal) || numericVal <= 0) {
      setThresholdError('Masukkan angka masa ED lebih dari 0.');
      return;
    }
    const computedDays = newThresholdUnit === 'bulan' ? numericVal * 30 : numericVal;
    if (computedDays > 3650) {
      setThresholdError('Masa ED maksimal adalah 10 tahun (3.650 hari).');
      return;
    }
    if (edThresholds.some((t) => t.days === computedDays)) {
      setThresholdError(`Masa ED ≤ ${computedDays} hari sudah tersedia pada filter.`);
      return;
    }

    const autoLabel =
      newThresholdLabel.trim() ||
      (newThresholdUnit === 'bulan'
        ? `≤ ${numericVal} Bulan (${computedDays} Hari)`
        : `≤ ${numericVal} Hari`);

    const newThreshold: EdAlertThreshold = {
      id: `ed-custom-${Date.now().toString(36)}`,
      label: autoLabel,
      value: numericVal,
      unit: newThresholdUnit,
      days: computedDays,
      isDefault: false
    };

    const existingCustom = Array.isArray(pharmacyProfile.edAlertThresholds)
      ? pharmacyProfile.edAlertThresholds
      : [];
    saveCustomThresholdsToSystem([...existingCustom, newThreshold]);
    setActiveWindowDays(computedDays);
    setCurrentPage(1);
    setShowAddThresholdModal(false);
    setNewThresholdValue('12');
    setNewThresholdUnit('bulan');
    setNewThresholdLabel('');
    setNotice({
      type: 'success',
      text: `Masa ED "${autoLabel}" berhasil ditambahkan dan langsung digunakan oleh sistem.`
    });
  };

  const handleRemoveCustomThreshold = (threshold: EdAlertThreshold) => {
    if (threshold.isDefault) return;
    const existingCustom = Array.isArray(pharmacyProfile.edAlertThresholds)
      ? pharmacyProfile.edAlertThresholds
      : [];
    const nextCustom = existingCustom.filter((t) => t.id !== threshold.id && t.days !== threshold.days);
    saveCustomThresholdsToSystem(nextCustom);
    if (activeWindowDays === threshold.days) {
      setActiveWindowDays(90);
    }
    setNotice({
      type: 'success',
      text: `Masa ED kustom "${threshold.label}" dihapus dari filter sistem.`
    });
  };

  // Compute all Master Obat rows that have a valid ED and fall into ED (<0) or Near-ED (<= activeWindowDays)
  const { allMonitoredRows, totalMedicinesWithEd } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const rows: ProductExpiryRow[] = [];
    let withEdCount = 0;

    medicines.forEach((med) => {
      const resolvedSupplier = (med.supplier || '').trim() || supplierByMedId.get(med.id) || '';
      const validBatches = Array.isArray(med.batches)
        ? med.batches.filter((b) => parseExpiryDate(b.expDate) !== null)
        : [];

      if (validBatches.length > 0) {
        withEdCount += 1;
        validBatches.forEach((b, idx) => {
          const parsed = parseExpiryDate(b.expDate);
          if (!parsed) return;
          const daysLeft = Math.round((parsed.date.getTime() - todayStart) / 86400000);
          if (daysLeft > activeWindowDays) return;
          const batchStock =
            validBatches.length === 1 && (Number(b.stock) || 0) !== (Number(med.stock) || 0)
              ? Number(med.stock) || 0
              : Number(b.stock) || 0;
          const hpp = Number(med.hpp) || 0;
          rows.push({
            rowKey: `${med.id}::${b.id || idx}::${parsed.iso}`,
            medicineId: med.id,
            medicine: med,
            barcode: (med.barcode || '').trim(),
            name: med.name,
            category: med.category || '-',
            unit: med.satuanKecil || med.unit || 'Pcs',
            rack: (med.rack || '').trim() || '-',
            supplier: resolvedSupplier,
            batchId: b.id,
            batchNo: (b.batchNo || med.batchNo || '-').trim() || '-',
            expDate: b.expDate,
            expDateIso: parsed.iso,
            daysLeft,
            status: daysLeft < 0 ? 'ED' : 'NEAR_ED',
            stock: batchStock,
            hpp,
            assetValue: Math.max(0, batchStock) * hpp
          });
        });
        return;
      }

      const parsedTop = parseExpiryDate(med.expDate);
      if (!parsedTop) return;
      withEdCount += 1;
      const daysLeft = Math.round((parsedTop.date.getTime() - todayStart) / 86400000);
      if (daysLeft > activeWindowDays) return;
      const medStock = Number(med.stock) || 0;
      const hpp = Number(med.hpp) || 0;
      rows.push({
        rowKey: `${med.id}::main::${parsedTop.iso}`,
        medicineId: med.id,
        medicine: med,
        barcode: (med.barcode || '').trim(),
        name: med.name,
        category: med.category || '-',
        unit: med.satuanKecil || med.unit || 'Pcs',
        rack: (med.rack || '').trim() || '-',
        supplier: resolvedSupplier,
        batchNo: (med.batchNo || '-').trim() || '-',
        expDate: med.expDate,
        expDateIso: parsedTop.iso,
        daysLeft,
        status: daysLeft < 0 ? 'ED' : 'NEAR_ED',
        stock: medStock,
        hpp,
        assetValue: Math.max(0, medStock) * hpp
      });
    });

    rows.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
    return { allMonitoredRows: rows, totalMedicinesWithEd: withEdCount };
  }, [medicines, activeWindowDays, supplierByMedId]);

  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    allMonitoredRows.forEach((r) => {
      if (r.supplier) set.add(r.supplier);
    });
    suppliers.forEach((s) => {
      if (s.name?.trim()) set.add(s.name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allMonitoredRows, suppliers]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allMonitoredRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (stockFilter === 'IN_STOCK' && row.stock <= 0) return false;
      if (supplierFilter === 'UNASSIGNED') {
        if (row.supplier) return false;
      } else if (supplierFilter !== 'ALL' && row.supplier !== supplierFilter) {
        return false;
      }
      if (q) {
        const hay = `${row.name} ${row.medicineId} ${row.barcode} ${row.batchNo} ${row.rack} ${row.supplier} ${row.expDateIso}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allMonitoredRows, statusFilter, stockFilter, supplierFilter, searchTerm]);

  // Summary metrics
  const metrics = useMemo(() => {
    let edCount = 0;
    let nearEdCount = 0;
    let totalAssetValue = 0;
    let totalUnits = 0;
    filteredRows.forEach((r) => {
      if (r.status === 'ED') edCount += 1;
      else nearEdCount += 1;
      totalAssetValue += r.assetValue;
      totalUnits += Math.max(0, r.stock);
    });
    return {
      total: filteredRows.length,
      edCount,
      nearEdCount,
      totalAssetValue,
      totalUnits
    };
  }, [filteredRows]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  // Keep selections scoped to currently available monitored rows
  useEffect(() => {
    setSelectedRowKeys((prev) => {
      if (prev.size === 0) return prev;
      const validKeys = new Set(allMonitoredRows.map((r) => r.rowKey));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((k) => {
        if (validKeys.has(k)) next.add(k);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [allMonitoredRows]);

  const selectedRows = useMemo(
    () => allMonitoredRows.filter((r) => selectedRowKeys.has(r.rowKey)),
    [allMonitoredRows, selectedRowKeys]
  );

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedRowKeys.has(r.rowKey));
  const someFilteredSelected =
    filteredRows.some((r) => selectedRowKeys.has(r.rowKey)) && !allFilteredSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedRowKeys((prev) => {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.delete(r.rowKey));
        return next;
      });
    } else {
      setSelectedRowKeys((prev) => {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.add(r.rowKey));
        return next;
      });
    }
  };

  const toggleSelectRow = (rowKey: string) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const openActionModal = (mode: 'disposal' | 'return', targetRows: ProductExpiryRow[]) => {
    if (targetRows.length === 0) return;
    setActionFormError(null);
    const mapped = targetRows.map((r) => ({
      rowKey: r.rowKey,
      medicineId: r.medicineId,
      name: r.name,
      batchId: r.batchId,
      batchNo: r.batchNo,
      expDate: r.expDateIso,
      availableStock: Math.max(0, r.stock),
      qty: r.stock > 0 ? r.stock : 1,
      unit: r.unit,
      hpp: r.hpp,
      supplier: r.supplier,
      status: r.status
    }));
    setActionItems(mapped);

    const todayCompact = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (mode === 'disposal') {
      const fullAddress = formatPharmacyAddress(pharmacyProfile);
      setDisposalBaNumber(`BA-MUSNAH-${todayCompact}-${Date.now().toString().slice(-3)}`);
      setDisposalMethod(DISPOSAL_METHODS[0]);
      setDisposalLocation(
        pharmacyProfile.name
          ? `${pharmacyProfile.name}${fullAddress ? `, ${fullAddress}` : ''}`
          : currentBranch.name
      );
      setDisposalWitness1Name(userName || '');
      setDisposalWitness1Nip('');
      setDisposalWitness1Role('Tenaga Teknis Kefarmasian (TTK)');
      setDisposalWitness2Name('');
      setDisposalWitness2Nip('');
      setDisposalWitness2Role('');
      setDisposalReason(
        targetRows.every((r) => r.status === 'ED')
          ? 'Kadaluwarsa (ED)'
          : 'Kadaluwarsa / Rusak (Tidak Layak Edar)'
      );
    } else {
      const firstSupplier = targetRows.find((r) => r.supplier)?.supplier || suppliers[0]?.name || '';
      setReturnPbfName(firstSupplier);
      setReturnInvoiceNo('');
      setReturnReason(
        targetRows.some((r) => r.status === 'ED')
          ? 'Retur produk ED / mendekati ED sesuai kebijakan PBF'
          : 'Retur produk mendekati ED ke PBF'
      );
    }
    setActionModalMode(mode);
  };

  const handleSubmitActionModal = (e: React.FormEvent) => {
    e.preventDefault();
    setActionFormError(null);

    const validItems = actionItems.filter((it) => Number(it.qty) > 0);
    if (validItems.length === 0) {
      setActionFormError('Minimal 1 produk harus memiliki jumlah (Qty) lebih dari 0.');
      return;
    }

    if (actionModalMode === 'disposal') {
      if (!disposalBaNumber.trim()) {
        setActionFormError('Nomor Berita Acara Pemusnahan wajib diisi.');
        return;
      }
      const w1Name = disposalWitness1Name.trim() || userName;
      const w2Name = disposalWitness2Name.trim();
      const combinedWitness = [w1Name, w2Name].filter(Boolean).join(', ');
      const fullAddress = formatPharmacyAddress(pharmacyProfile);
      const cleanLocation =
        disposalLocation.trim() ||
        `${pharmacyProfile.name}${fullAddress ? `, ${fullAddress}` : ''}`;

      const payloadItems = validItems.map((it) => ({
        medicineId: it.medicineId,
        name: it.name,
        batchId: it.batchId,
        batchNo: it.batchNo,
        expDate: it.expDate,
        qty: Math.round(Number(it.qty)),
        unit: it.unit,
        hpp: it.hpp,
        subtotal: Math.round(Number(it.qty)) * it.hpp
      }));
      const payload: DisposalActionPayload = {
        baNumber: disposalBaNumber.trim(),
        method: disposalMethod,
        witness: combinedWitness || apjProfile.name || userName,
        reason: disposalReason.trim() || 'Kadaluwarsa (ED)',
        disposalLocation: cleanLocation,
        witness1Name: w1Name,
        witness1Nip: disposalWitness1Nip.trim(),
        witness1Role: disposalWitness1Role.trim() || 'Tenaga Teknis Kefarmasian (TTK)',
        witness2Name: w2Name,
        witness2Nip: disposalWitness2Nip.trim(),
        witness2Role: disposalWitness2Role.trim(),
        items: payloadItems
      };

      onProcessDisposal(payload);

      const now = new Date();
      const historyEntry: DisposalHistoryRecord = {
        id: `DIS-${Date.now().toString().slice(-6)}`,
        baNumber: payload.baNumber,
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('id-ID'),
        method: payload.method,
        witness: payload.witness,
        reason: payload.reason,
        petugas: userName,
        disposalLocation: cleanLocation,
        witness1Name: payload.witness1Name,
        witness1Nip: payload.witness1Nip,
        witness1Role: payload.witness1Role,
        witness2Name: payload.witness2Name,
        witness2Nip: payload.witness2Nip,
        witness2Role: payload.witness2Role,
        apjName: apjProfile.name,
        apjSipa: apjProfile.sipa,
        pharmacyName: pharmacyProfile.name,
        pharmacyAddress: fullAddress,
        pharmacyCity: pharmacyProfile.city || currentBranch.name,
        totalItems: payloadItems.length,
        totalQty: payloadItems.reduce((s, it) => s + it.qty, 0),
        totalValue: payloadItems.reduce((s, it) => s + it.subtotal, 0),
        items: payloadItems
      };
      persistDisposalHistory([historyEntry, ...disposalHistory]);

      setSelectedRowKeys(new Set());
      setActionModalMode(null);
      setNotice({
        type: 'success',
        text: `Pemusnahan ${payload.baNumber} berhasil diproses (${payloadItems.length} item). Stok Master Obat & Kartu Stok telah diperbarui.`
      });
      return;
    }

    if (actionModalMode === 'return') {
      if (!returnPbfName.trim()) {
        setActionFormError('Nama PBF / Supplier tujuan retur wajib diisi.');
        return;
      }
      const payloadItems = validItems.map((it) => ({
        medicineId: it.medicineId,
        name: it.name,
        batchId: it.batchId,
        batchNo: it.batchNo,
        expDate: it.expDate,
        qty: Math.round(Number(it.qty)),
        unit: it.unit,
        price: it.hpp,
        subtotal: Math.round(Number(it.qty)) * it.hpp
      }));
      onProcessReturn({
        pbfName: returnPbfName.trim(),
        invoiceNo: returnInvoiceNo.trim(),
        reason: returnReason.trim() || 'Retur produk ED / mendekati ED',
        items: payloadItems
      });

      setSelectedRowKeys(new Set());
      setActionModalMode(null);
      setNotice({
        type: 'success',
        text: `Retur ke ${returnPbfName.trim()} berhasil dicatat (${payloadItems.length} item). Stok diperbarui dan arsip tersimpan di menu Retur Pembelian.`
      });
    }
  };

  const handlePrintProductList = (rowsToPrint: ProductExpiryRow[], titleSuffix: string) => {
    setPrintPreviewDoc({
      kind: 'list',
      titleSuffix,
      rows: rowsToPrint
    });
  };

  const handlePrintDisposalBA = (rec: DisposalHistoryRecord) => {
    setIsEditingBaMeta(false);
    setPrintPreviewDoc({
      kind: 'disposal',
      record: rec
    });
  };

  const handleUpdatePreviewBaMeta = (patch: Partial<DisposalHistoryRecord>) => {
    setPrintPreviewDoc((prev) => {
      if (!prev || prev.kind !== 'disposal') return prev;
      const updatedRecord: DisposalHistoryRecord = {
        ...prev.record,
        ...patch
      };
      const wCombined = [updatedRecord.witness1Name, updatedRecord.witness2Name]
        .map((s) => (s || '').trim())
        .filter(Boolean)
        .join(', ');
      if (wCombined) {
        updatedRecord.witness = wCombined;
      }
      const nextHistory = disposalHistory.map((item) =>
        item.id === updatedRecord.id ? updatedRecord : item
      );
      persistDisposalHistory(nextHistory);
      return { kind: 'disposal', record: updatedRecord };
    });
  };

  const handleDownloadCsv = (rowsToExport: ProductExpiryRow[]) => {
    const header = [
      'Kode Obat',
      'Barcode',
      'Nama Produk',
      'Kategori',
      'No. Batch',
      'Rak/Lokasi',
      'Tanggal ED',
      'Status ED',
      'Sisa Hari',
      'Stok',
      'Satuan',
      'HPP',
      'Nilai Aset HPP',
      'Supplier'
    ];
    const escapeCell = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const lines = [
      header.map(escapeCell).join(','),
      ...rowsToExport.map((r) =>
        [
          r.medicineId,
          r.barcode,
          r.name,
          r.category,
          r.batchNo,
          r.rack,
          r.expDateIso,
          r.status === 'ED' ? 'Sudah ED' : 'Mendekati ED',
          r.daysLeft,
          r.stock,
          r.unit,
          r.hpp,
          r.assetValue,
          r.supplier || '-'
        ]
          .map(escapeCell)
          .join(',')
      )
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kelola-produk-ed-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSyncMaster = async () => {
    if (!onSyncMedicinesSupabase) return;
    setIsSyncingMaster(true);
    setNotice(null);
    try {
      const res = await onSyncMedicinesSupabase();
      if (res.success) {
        setNotice({
          type: 'success',
          text: `Master Obat tersinkronisasi (${(res.count ?? medicines.length).toLocaleString('id-ID')} produk) sebagai acuan monitoring ED.`
        });
      } else {
        setNotice({
          type: 'error',
          text: res.error || 'Gagal menyinkronkan Master Obat dari Supabase.'
        });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Gagal menyinkronkan Master Obat.' });
    } finally {
      setIsSyncingMaster(false);
    }
  };

  const activeThresholdObj = edThresholds.find((t) => t.days === activeWindowDays);

  return (
    <div className="space-y-5">
      <div className={printPreviewDoc ? 'space-y-5 print:hidden' : 'space-y-5'}>
      {/* Header Row */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Inventaris &amp; Logistik Pusat</span>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-slate-700">Kelola Produk</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Acuan Master Obat ({totalMedicinesWithEd.toLocaleString('id-ID')} produk bertanggal ED)
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Kelola Produk — Monitoring ED &amp; Mendekati ED
          </h2>
          <p className="text-xs text-slate-500 max-w-2xl">
            Memfilter produk kedaluwarsa (ED) dan mendekati ED langsung dari Master Obat. Pilih produk dengan kotak centang untuk memproses pemusnahan atau retur ke PBF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSyncMedicinesSupabase && (
            <button
              type="button"
              onClick={handleSyncMaster}
              disabled={isSyncingMaster}
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMaster ? 'animate-spin' : ''}`} />
              <span>{isSyncingMaster ? 'Menyinkronkan...' : 'Sinkronkan Master Obat'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              handlePrintProductList(
                selectedRows.length > 0 ? selectedRows : filteredRows,
                selectedRows.length > 0
                  ? `Pilihan (${selectedRows.length} item)`
                  : `Filter: ${activeThresholdObj?.label || `≤ ${activeWindowDays} Hari`}`
              )
            }
            disabled={filteredRows.length === 0}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>
              {selectedRows.length > 0 ? `Cetak Terpilih (${selectedRows.length})` : 'Cetak Daftar ED'}
            </span>
          </button>
        </div>
      </div>

      {/* Inline Feedback Notice */}
      {notice && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Tutup pemberitahuan"
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4-Column Summary Strip (Single Elevation, Tabular Numerals) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Total Produk Terpantau</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.total.toLocaleString('id-ID')}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
            {metrics.totalUnits.toLocaleString('id-ID')} unit stok · batas ≤ {activeWindowDays} hari
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Sudah ED (Kedaluwarsa)</div>
          <div className="mt-1.5 text-2xl font-bold text-rose-700 font-mono tabular-nums">
            {metrics.edCount.toLocaleString('id-ID')}
          </div>
          <div className="mt-1 text-[11px] text-rose-700/80">
            Melewati tanggal kedaluwarsa · perlu pemusnahan / retur
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">
            Mendekati ED ({activeThresholdObj?.label || `≤ ${activeWindowDays} Hari`})
          </div>
          <div className="mt-1.5 text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {metrics.nearEdCount.toLocaleString('id-ID')}
          </div>
          <div className="mt-1 text-[11px] text-amber-700/80">
            Prioritas retur PBF atau pengeluaran FEFO
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Estimasi Nilai Aset (HPP)</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            Rp {metrics.totalAssetValue.toLocaleString('id-ID')}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Berdasarkan stok aktual × HPP Master Obat
          </div>
        </div>
      </div>

      {/* Primary Workspace Card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Top Mode Tabs */}
        <div className="px-4 pt-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveSubTab('produk')}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer whitespace-nowrap ${
                activeSubTab === 'produk'
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Data Kelola Produk ({filteredRows.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('riwayat-pemusnahan')}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer whitespace-nowrap ${
                activeSubTab === 'riwayat-pemusnahan'
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Riwayat Pemusnahan ({disposalHistory.length})
            </button>
          </div>

          {onNavigateTab && (
            <div className="pb-2 flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => onNavigateTab('inv-master')}
                className="text-slate-500 hover:text-sky-700 font-medium underline-offset-4 hover:underline cursor-pointer whitespace-nowrap"
              >
                Buka Master Obat
              </button>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onNavigateTab('inv-retur-riwayat')}
                className="text-slate-500 hover:text-sky-700 font-medium underline-offset-4 hover:underline cursor-pointer whitespace-nowrap"
              >
                Lihat Riwayat Retur Pembelian
              </button>
            </div>
          )}
        </div>

        {activeSubTab === 'produk' ? (
          <>
            {/* Filter ED & Custom Threshold Controls */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-3">
              {/* Row 1: Filter Masa ED + Button (+) */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mr-1">
                    <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Filter Masa ED:</span>
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter rentang masa ED">
                    {edThresholds.map((th) => {
                      const isActive = activeWindowDays === th.days;
                      return (
                        <div
                          key={th.id}
                          className={`inline-flex items-center rounded-lg border text-xs font-semibold transition ${
                            isActive
                              ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveWindowDays(th.days);
                              setCurrentPage(1);
                            }}
                            className="px-3 py-1.5 cursor-pointer whitespace-nowrap"
                          >
                            {th.label}
                          </button>
                          {!th.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomThreshold(th)}
                              title={`Hapus masa ED ${th.label}`}
                              aria-label={`Hapus masa ED ${th.label}`}
                              className={`pr-2 pl-0.5 py-1.5 cursor-pointer transition ${
                                isActive ? 'text-sky-100 hover:text-white' : 'text-slate-400 hover:text-rose-600'
                              }`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        setThresholdError(null);
                        setShowAddThresholdModal(true);
                      }}
                      title="Tambah masa ED baru yang dibaca sistem"
                      aria-label="Tambah masa ED baru"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-sky-400 bg-sky-50/70 hover:bg-sky-100 text-sky-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Masa ED</span>
                    </button>
                  </div>
                </div>

                {/* Status ED Segmented Control */}
                <div className="inline-flex items-center p-0.5 bg-slate-200/70 rounded-lg" role="group" aria-label="Filter status ED">
                  {[
                    { id: 'ALL' as const, label: 'Semua' },
                    { id: 'ED' as const, label: 'Sudah ED' },
                    { id: 'NEAR_ED' as const, label: 'Mendekati ED' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setStatusFilter(opt.id);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                        statusFilter === opt.id
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Search, Stock Filter, Supplier Filter */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                <div className="md:col-span-6 relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Cari nama produk, kode obat, barcode, no. batch, rak, atau supplier..."
                    className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setCurrentPage(1);
                      }}
                      aria-label="Hapus pencarian"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="md:col-span-3">
                  <select
                    value={stockFilter}
                    onChange={(e) => {
                      setStockFilter(e.target.value as 'ALL' | 'IN_STOCK');
                      setCurrentPage(1);
                    }}
                    aria-label="Filter ketersediaan stok"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
                  >
                    <option value="ALL">Stok: Semua (Termasuk Stok 0)</option>
                    <option value="IN_STOCK">Stok: Hanya Stok &gt; 0</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <select
                    value={supplierFilter}
                    onChange={(e) => {
                      setSupplierFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    aria-label="Filter supplier"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
                  >
                    <option value="ALL">Supplier: Semua PBF</option>
                    <option value="UNASSIGNED">Supplier: Belum Ditentukan</option>
                    {supplierOptions.map((sup) => (
                      <option key={sup} value={sup}>
                        {sup}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Bulk Action Bar (Active when checkboxes are ticked) */}
            {selectedRows.length > 0 && (
              <div className="px-4 py-3 bg-sky-50 border-b border-sky-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-800 flex flex-wrap items-center gap-2">
                  <strong className="font-bold text-sky-900 font-mono tabular-nums">
                    {selectedRows.length} produk dipilih
                  </strong>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    Total Stok: {selectedRows.reduce((s, r) => s + Math.max(0, r.stock), 0).toLocaleString('id-ID')}
                  </span>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    Estimasi HPP: Rp {selectedRows.reduce((s, r) => s + r.assetValue, 0).toLocaleString('id-ID')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openActionModal('return', selectedRows)}
                    className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Proses Retur ke PBF ({selectedRows.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openActionModal('disposal', selectedRows)}
                    className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Proses Pemusnahan ({selectedRows.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRowKeys(new Set())}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>
            )}

            {/* Data Kelola Produk Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 pl-4 pr-2 w-10 text-center">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        disabled={filteredRows.length === 0}
                        aria-label="Pilih semua produk pada tabel"
                        className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer accent-sky-600"
                      />
                    </th>
                    <th className="py-2.5 px-3">Produk (Acuan Master Obat)</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Batch &amp; Rak</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Tanggal ED &amp; Status</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Stok</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Nilai Aset (HPP)</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Supplier / PBF</th>
                    <th className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">Tindak Lanjut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <div className="max-w-md mx-auto space-y-2.5">
                          <div className="text-sm font-semibold text-slate-800">
                            Tidak ada produk ED atau mendekati ED pada rentang ≤ {activeWindowDays} hari
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {totalMedicinesWithEd > 0
                              ? `Terdapat ${totalMedicinesWithEd.toLocaleString('id-ID')} produk di Master Obat yang memiliki tanggal ED, namun seluruhnya berada di luar filter ≤ ${activeWindowDays} hari saat ini.`
                              : 'Belum ada produk di Master Obat yang memiliki tanggal ED (Expired Date). Lengkapi kolom Expired Date di Master Obat atau tambahkan masa ED lebih panjang untuk memantau.'}
                          </p>
                          <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setThresholdError(null);
                                setShowAddThresholdModal(true);
                              }}
                              className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Tambah Masa ED Lebih Panjang</span>
                            </button>
                            {statusFilter !== 'ALL' || stockFilter !== 'ALL' || supplierFilter !== 'ALL' || searchTerm ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setStatusFilter('ALL');
                                  setStockFilter('ALL');
                                  setSupplierFilter('ALL');
                                  setSearchTerm('');
                                  setCurrentPage(1);
                                }}
                                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition"
                              >
                                Reset Filter
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row) => {
                      const isChecked = selectedRowKeys.has(row.rowKey);
                      const isExpired = row.status === 'ED';
                      return (
                        <tr
                          key={row.rowKey}
                          className={`transition-colors ${
                            isChecked
                              ? 'bg-sky-50/70'
                              : isExpired
                              ? 'bg-rose-50/25 hover:bg-rose-50/50'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 pl-4 pr-2 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectRow(row.rowKey)}
                              aria-label={`Pilih ${row.name}`}
                              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer accent-sky-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 align-middle">
                            <div className="font-semibold text-slate-900">{row.name}</div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                              <span>{row.medicineId}</span>
                              {row.barcode ? (
                                <>
                                  <span className="mx-1.5" aria-hidden="true">·</span>
                                  <span>{row.barcode}</span>
                                </>
                              ) : null}
                              <span className="mx-1.5" aria-hidden="true">·</span>
                              <span className="font-sans">{row.category}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                            <div className="font-mono text-slate-800">{row.batchNo}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">Rak: {row.rack}</div>
                          </td>
                          <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                            <div className="font-mono tabular-nums font-semibold text-slate-900">
                              {formatDateID(row.expDateIso)}
                            </div>
                            <div
                              className={`text-[11px] font-semibold font-mono tabular-nums mt-0.5 ${
                                isExpired ? 'text-rose-700' : 'text-amber-700'
                              }`}
                            >
                              {isExpired
                                ? `Sudah ED · Lewat ${Math.abs(row.daysLeft)} hari`
                                : row.daysLeft === 0
                                ? 'Mendekati ED · Hari ini'
                                : `Mendekati ED · Sisa ${row.daysLeft} hari`}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap font-mono tabular-nums">
                            <span
                              className={`font-semibold ${
                                row.stock <= 0 ? 'text-slate-400' : 'text-slate-900'
                              }`}
                            >
                              {row.stock.toLocaleString('id-ID')}
                            </span>{' '}
                            <span className="text-slate-500 font-sans text-[11px]">{row.unit}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap font-mono tabular-nums text-slate-800">
                            Rp {row.assetValue.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 align-middle">
                            {row.supplier ? (
                              <span className="text-slate-800 font-medium">{row.supplier}</span>
                            ) : (
                              <span className="text-slate-400 italic">Belum ditentukan</span>
                            )}
                          </td>
                          <td className="py-2.5 pl-3 pr-4 text-right align-middle whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openActionModal('return', [row])}
                                className="px-2.5 py-1.5 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold transition cursor-pointer"
                              >
                                Retur
                              </button>
                              <button
                                type="button"
                                onClick={() => openActionModal('disposal', [row])}
                                className="px-2.5 py-1.5 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold transition cursor-pointer"
                              >
                                Musnahkan
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 0 && (
              <PaginationControls
                currentPage={safePage}
                totalPages={totalPages}
                totalCount={filteredRows.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setCurrentPage(1);
                }}
                itemLabel="produk"
              />
            )}
          </>
        ) : (
          /* Riwayat Pemusnahan Tab */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4 whitespace-nowrap">No. Berita Acara</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tanggal &amp; Petugas</th>
                  <th className="py-2.5 px-3">Metode &amp; Keterangan</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Item / Qty</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Nilai HPP</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Dokumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {disposalHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-xs">
                      Belum ada riwayat pemusnahan produk. Pilih produk pada tab Data Kelola Produk lalu klik Proses Pemusnahan.
                    </td>
                  </tr>
                ) : (
                  disposalHistory.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {rec.baNumber}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-mono tabular-nums text-slate-800">
                          {formatDateID(rec.date)} · {rec.time}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Petugas: {rec.petugas} · Saksi: {rec.witness}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{rec.method}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{rec.reason}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-800">
                        {rec.totalItems} item / {rec.totalQty.toLocaleString('id-ID')} unit
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap font-semibold text-rose-700">
                        Rp {rec.totalValue.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handlePrintDisposalBA(rec)}
                          className="px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Dokumen BA</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {/* Modal: Tambah Masa ED Baru (+) */}
      {showAddThresholdModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Tambah Masa ED Sistem</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Rentang masa ED baru akan dibaca oleh sistem dan tersimpan ke pengaturan fasilitas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddThresholdModal(false)}
                aria-label="Tutup modal tambah masa ED"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomThreshold} className="p-5 space-y-4 text-xs">
              {thresholdError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {thresholdError}
                </div>
              )}

              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-6">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Durasi Masa ED
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    required
                    value={newThresholdValue}
                    onChange={(e) => setNewThresholdValue(e.target.value)}
                    placeholder="Contoh: 12"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
                  />
                </div>
                <div className="col-span-6">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Satuan Waktu
                  </label>
                  <select
                    value={newThresholdUnit}
                    onChange={(e) => setNewThresholdUnit(e.target.value as 'hari' | 'bulan')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
                  >
                    <option value="hari">Hari</option>
                    <option value="bulan">Bulan (× 30 Hari)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Label Filter (Opsional)
                </label>
                <input
                  type="text"
                  value={newThresholdLabel}
                  onChange={(e) => setNewThresholdLabel(e.target.value)}
                  placeholder={
                    newThresholdUnit === 'bulan'
                      ? `Otomatis: ≤ ${newThresholdValue || '12'} Bulan (${(Number(newThresholdValue) || 0) * 30} Hari)`
                      : `Otomatis: ≤ ${newThresholdValue || '30'} Hari`
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddThresholdModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer"
                >
                  Simpan &amp; Terapkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Proses Pemusnahan / Retur ke PBF */}
      {actionModalMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {actionModalMode === 'disposal'
                    ? 'Proses Pemusnahan Produk ED / Mendekati ED'
                    : 'Proses Retur Produk ED / Mendekati ED ke PBF'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {actionModalMode === 'disposal'
                    ? 'Stok pada Master Obat akan dikurangi dan dicatat pada Kartu Stok sebagai mutasi PEMUSNAHAN.'
                    : 'Stok pada Master Obat akan dikurangi, dicatat pada Kartu Stok (RETUR PEMBELIAN), dan tersimpan di Riwayat Retur Pembelian.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionModalMode(null)}
                aria-label="Tutup modal proses"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitActionModal} className="flex flex-col flex-1 overflow-hidden text-xs">
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {actionFormError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                    {actionFormError}
                  </div>
                )}

                {actionModalMode === 'disposal' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Nomor Berita Acara
                        </label>
                        <input
                          type="text"
                          required
                          value={disposalBaNumber}
                          onChange={(e) => setDisposalBaNumber(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-semibold text-slate-900 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Cara / Metode Pemusnahan
                        </label>
                        <select
                          value={disposalMethod}
                          onChange={(e) => setDisposalMethod(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-sky-500"
                        >
                          {DISPOSAL_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Tempat Dilakukan Pemusnahan
                        </label>
                        <input
                          type="text"
                          value={disposalLocation}
                          onChange={(e) => setDisposalLocation(e.target.value)}
                          placeholder="Nama & alamat lokasi pemusnahan"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Alasan Pemusnahan (Kadaluwarsa / Rusak)
                        </label>
                        <input
                          type="text"
                          value={disposalReason}
                          onChange={(e) => setDisposalReason(e.target.value)}
                          placeholder="Contoh: Kadaluwarsa (ED) / Kemasan Rusak"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    {/* Saksi-Saksi sesuai Permenkes No. 73 Tahun 2016 */}
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                          Saksi-Saksi Pemusnahan (Formulir 1 Permenkes RI No. 73 Tahun 2016)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          APA/APJ: <strong className="text-slate-700">{apjProfile.name}</strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Saksi 1 — Nama
                          </label>
                          <input
                            type="text"
                            value={disposalWitness1Name}
                            onChange={(e) => setDisposalWitness1Name(e.target.value)}
                            placeholder="Nama tenaga kefarmasian"
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Saksi 1 — NIP / No. SIPTTK / SIPA
                          </label>
                          <input
                            type="text"
                            value={disposalWitness1Nip}
                            onChange={(e) => setDisposalWitness1Nip(e.target.value)}
                            placeholder="Opsional (NIP / SIPTTK)"
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Saksi 1 — Jabatan
                          </label>
                          <input
                            type="text"
                            value={disposalWitness1Role}
                            onChange={(e) => setDisposalWitness1Role(e.target.value)}
                            placeholder="Tenaga Teknis Kefarmasian"
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-800 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-200/80">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Saksi 2 — Nama (Opsional)
                          </label>
                          <input
                            type="text"
                            value={disposalWitness2Name}
                            onChange={(e) => setDisposalWitness2Name(e.target.value)}
                            placeholder="Petugas Dinkes / BPOM / TTK lain"
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Saksi 2 — NIP / No. SIPTTK / SIPA
                          </label>
                          <input
                            type="text"
                            value={disposalWitness2Nip}
                            onChange={(e) => setDisposalWitness2Nip(e.target.value)}
                            placeholder="NIP / No. Izin Praktik"
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Saksi 2 — Jabatan
                          </label>
                          <input
                            type="text"
                            value={disposalWitness2Role}
                            onChange={(e) => setDisposalWitness2Role(e.target.value)}
                            placeholder="Contoh: Petugas Dinkes Kab/Kota"
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-800 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Supplier / PBF Tujuan
                      </label>
                      <input
                        type="text"
                        list="kelola-produk-pbf-list"
                        required
                        value={returnPbfName}
                        onChange={(e) => setReturnPbfName(e.target.value)}
                        placeholder="Pilih atau ketik nama PBF..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                      <datalist id="kelola-produk-pbf-list">
                        {supplierOptions.map((sup) => (
                          <option key={sup} value={sup} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        No. Faktur Referensi (Opsional)
                      </label>
                      <input
                        type="text"
                        value={returnInvoiceNo}
                        onChange={(e) => setReturnInvoiceNo(e.target.value)}
                        placeholder="Contoh: INV-PBF-001"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Alasan Retur
                      </label>
                      <input
                        type="text"
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                )}

                {/* Selected Items Editable Table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2 px-3">Produk</th>
                        <th className="py-2 px-3 whitespace-nowrap">Batch · ED</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Stok</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap w-28">
                          {actionModalMode === 'disposal' ? 'Qty Musnah' : 'Qty Retur'}
                        </th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Subtotal HPP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {actionItems.map((it, idx) => (
                        <tr key={it.rowKey}>
                          <td className="py-2 px-3 font-semibold text-slate-900">{it.name}</td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {it.batchNo} · {formatDateID(it.expDate)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {it.availableStock.toLocaleString('id-ID')} {it.unit}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min={1}
                              value={it.qty}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                setActionItems((prev) =>
                                  prev.map((row, i) => (i === idx ? { ...row, qty: val } : row))
                                );
                              }}
                              className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-mono font-bold text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                            Rp {(Math.max(0, it.qty) * it.hpp).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="text-xs text-slate-600 font-mono tabular-nums">
                  Total:{' '}
                  <strong className="text-slate-900">
                    {actionItems.reduce((s, it) => s + Math.max(0, it.qty), 0).toLocaleString('id-ID')} unit
                  </strong>{' '}
                  · Estimasi HPP:{' '}
                  <strong className="text-slate-900">
                    Rp{' '}
                    {actionItems
                      .reduce((s, it) => s + Math.max(0, it.qty) * it.hpp, 0)
                      .toLocaleString('id-ID')}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActionModalMode(null)}
                    className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className={`px-4 py-2 rounded-lg text-white font-semibold cursor-pointer transition ${
                      actionModalMode === 'disposal'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    {actionModalMode === 'disposal'
                      ? 'Konfirmasi Pemusnahan'
                      : 'Konfirmasi Retur ke PBF'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pratinjau Dokumen Cetak (Daftar ED / Berita Acara Pemusnahan Permenkes 73/2016) */}
      {printPreviewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:static print:inset-auto print:bg-white print:p-0 print:block">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl overflow-hidden print:border-0 print:rounded-none print:shadow-none print:max-w-none print:max-h-none print:overflow-visible">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50 shrink-0 print:hidden">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {printPreviewDoc.kind === 'list'
                    ? 'Pratinjau Daftar Produk ED & Mendekati ED'
                    : `Berita Acara Pemusnahan Obat (Formulir 1 Permenkes RI No. 73 Tahun 2016)`}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {printPreviewDoc.kind === 'list'
                    ? 'Siap cetak atau ekspor CSV untuk dokumentasi apotek.'
                    : `No. ${printPreviewDoc.record.baNumber} · Dilengkapi Lampiran Daftar Obat yang Dimusnahkan (Format A4).`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {printPreviewDoc.kind === 'list' && (
                  <button
                    type="button"
                    onClick={() => handleDownloadCsv(printPreviewDoc.rows)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition"
                  >
                    Unduh CSV
                  </button>
                )}
                {printPreviewDoc.kind === 'disposal' && (
                  <button
                    type="button"
                    onClick={() => setIsEditingBaMeta((v) => !v)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${
                      isEditingBaMeta
                        ? 'border-sky-600 bg-sky-50 text-sky-700'
                        : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isEditingBaMeta ? 'Selesai Edit BA' : 'Lengkapi Data BA'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Dokumen</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingBaMeta(false);
                    setPrintPreviewDoc(null);
                  }}
                  aria-label="Tutup pratinjau cetak"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Inline Quick Editor for BA Metadata (Saksi 1, Saksi 2, Lokasi, Metode) */}
            {printPreviewDoc.kind === 'disposal' && isEditingBaMeta && (
              <div className="px-5 py-3.5 border-b border-slate-200 bg-sky-50/60 text-xs space-y-2.5 shrink-0 print:hidden">
                <div className="font-semibold text-slate-800">
                  Lengkapi Identitas Saksi &amp; Tempat Pemusnahan (Otomatis Tersimpan)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Tempat Dilakukan Pemusnahan
                    </label>
                    <input
                      type="text"
                      value={
                        printPreviewDoc.record.disposalLocation ??
                        `${pharmacyProfile.name}, ${formatPharmacyAddress(pharmacyProfile)}`
                      }
                      onChange={(e) =>
                        handleUpdatePreviewBaMeta({ disposalLocation: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Alasan Pemusnahan
                    </label>
                    <input
                      type="text"
                      value={printPreviewDoc.record.reason || ''}
                      onChange={(e) => handleUpdatePreviewBaMeta({ reason: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={printPreviewDoc.record.witness1Name ?? printPreviewDoc.record.witness ?? ''}
                    onChange={(e) => handleUpdatePreviewBaMeta({ witness1Name: e.target.value })}
                    placeholder="Saksi 1 — Nama"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                  <input
                    type="text"
                    value={printPreviewDoc.record.witness1Nip ?? ''}
                    onChange={(e) => handleUpdatePreviewBaMeta({ witness1Nip: e.target.value })}
                    placeholder="Saksi 1 — NIP / No. SIPTTK / SIPA"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono text-slate-900"
                  />
                  <input
                    type="text"
                    value={printPreviewDoc.record.witness1Role ?? 'Tenaga Teknis Kefarmasian (TTK)'}
                    onChange={(e) => handleUpdatePreviewBaMeta({ witness1Role: e.target.value })}
                    placeholder="Saksi 1 — Jabatan"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={printPreviewDoc.record.witness2Name ?? ''}
                    onChange={(e) => handleUpdatePreviewBaMeta({ witness2Name: e.target.value })}
                    placeholder="Saksi 2 — Nama (Opsional)"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                  <input
                    type="text"
                    value={printPreviewDoc.record.witness2Nip ?? ''}
                    onChange={(e) => handleUpdatePreviewBaMeta({ witness2Nip: e.target.value })}
                    placeholder="Saksi 2 — NIP / No. SIPTTK / SIPA"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono text-slate-900"
                  />
                  <input
                    type="text"
                    value={printPreviewDoc.record.witness2Role ?? ''}
                    onChange={(e) => handleUpdatePreviewBaMeta({ witness2Role: e.target.value })}
                    placeholder="Saksi 2 — Jabatan"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
              </div>
            )}

            <div
              id="printable-section"
              className="p-6 sm:p-8 overflow-y-auto flex-1 text-slate-900 space-y-6 bg-white print:p-0 print:overflow-visible"
            >
              {printPreviewDoc.kind === 'list' ? (
                <>
                  {/* Kop Apotek — Daftar Produk ED */}
                  <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-3">
                    {pharmacyProfile.logoUrl && (
                      <img
                        src={pharmacyProfile.logoUrl}
                        alt={pharmacyProfile.name}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 object-contain shrink-0"
                      />
                    )}
                    <div className="flex-1">
                      <div className="text-base font-extrabold uppercase tracking-wide text-slate-900">
                        {pharmacyProfile.name}
                      </div>
                      <div className="text-xs text-slate-600">
                        {formatPharmacyAddress(pharmacyProfile)} · Telp: {pharmacyProfile.phone}
                      </div>
                      {formatPharmacyLegalInfo(pharmacyProfile) && (
                        <div className="text-[11px] font-mono text-slate-500">
                          {formatPharmacyLegalInfo(pharmacyProfile)}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-bold text-slate-900">DAFTAR KELOLA PRODUK ED</div>
                      <div className="text-[11px] text-slate-600">
                        {printPreviewDoc.titleSuffix}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {new Date().toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>

                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-300 px-2.5 py-2 text-center w-10">No</th>
                        <th className="border border-slate-300 px-2.5 py-2">Nama Produk</th>
                        <th className="border border-slate-300 px-2.5 py-2">Batch &amp; Rak</th>
                        <th className="border border-slate-300 px-2.5 py-2 text-center">Tanggal ED</th>
                        <th className="border border-slate-300 px-2.5 py-2 text-center">Status</th>
                        <th className="border border-slate-300 px-2.5 py-2 text-right">Stok</th>
                        <th className="border border-slate-300 px-2.5 py-2 text-right">Nilai HPP</th>
                        <th className="border border-slate-300 px-2.5 py-2">Supplier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printPreviewDoc.rows.map((r, idx) => (
                        <tr key={r.rowKey}>
                          <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5">
                            <div className="font-semibold">{r.name}</div>
                            <div className="text-[10px] font-mono text-slate-500">
                              {r.medicineId}
                              {r.barcode ? ` · ${r.barcode}` : ''}
                            </div>
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 font-mono">
                            <div>{r.batchNo}</div>
                            <div className="text-[10px] font-sans text-slate-500">Rak: {r.rack}</div>
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono tabular-nums">
                            {formatDateID(r.expDateIso)}
                          </td>
                          <td
                            className={`border border-slate-300 px-2.5 py-1.5 text-center font-semibold font-mono tabular-nums ${
                              r.status === 'ED' ? 'text-rose-700' : 'text-amber-700'
                            }`}
                          >
                            {r.status === 'ED'
                              ? `Sudah ED (Lewat ${Math.abs(r.daysLeft)} hr)`
                              : `Mendekati ED (${r.daysLeft} hr)`}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                            {r.stock.toLocaleString('id-ID')} {r.unit}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                            Rp {r.assetValue.toLocaleString('id-ID')}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5">
                            {r.supplier || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold">
                        <td colSpan={6} className="border border-slate-300 px-2.5 py-2 text-right">
                          Total Estimasi Nilai Aset (HPP)
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 text-right font-mono tabular-nums">
                          Rp{' '}
                          {printPreviewDoc.rows
                            .reduce((s, r) => s + r.assetValue, 0)
                            .toLocaleString('id-ID')}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 font-mono tabular-nums">
                          {printPreviewDoc.rows.length} item
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Tanda Tangan Daftar ED */}
                  <div className="flex justify-between pt-6 text-xs">
                    <div className="text-center w-52">
                      <div>Petugas Pelaksana</div>
                      <div className="h-14" />
                      <div className="font-bold underline">{userName}</div>
                    </div>
                    <div className="text-center w-60">
                      <div>
                        {pharmacyProfile.city || currentBranch.name},{' '}
                        {new Date().toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </div>
                      <div>Apoteker Penanggung Jawab (APJ)</div>
                      <div className="h-12" />
                      <div className="font-bold underline">{apjProfile.name}</div>
                      <div className="text-[11px] text-slate-500">SIPA: {apjProfile.sipa}</div>
                    </div>
                  </div>
                </>
              ) : (
                (() => {
                  const rec = printPreviewDoc.record;
                  const dateParts = parseIndonesianDateParts(rec.date);
                  const docPharmacyName = rec.pharmacyName || pharmacyProfile.name;
                  const docPharmacyAddress =
                    rec.pharmacyAddress || formatPharmacyAddress(pharmacyProfile);
                  const docCity = rec.pharmacyCity || pharmacyProfile.city || currentBranch.name;
                  const docApjName = rec.apjName || apjProfile.name || '-';
                  const docApjSipa = rec.apjSipa || apjProfile.sipa || '-';
                  const docLocation =
                    rec.disposalLocation ||
                    `${docPharmacyName}${docPharmacyAddress ? `, ${docPharmacyAddress}` : ''}`;

                  const w1Name = (rec.witness1Name || rec.witness || rec.petugas || '').trim();
                  const w1Nip = (rec.witness1Nip || '').trim();
                  const w1Role = (rec.witness1Role || 'Tenaga Teknis Kefarmasian (TTK)').trim();
                  const w2Name = (rec.witness2Name || '').trim();
                  const w2Nip = (rec.witness2Nip || '').trim();
                  const w2Role = (rec.witness2Role || '').trim();

                  return (
                    <div className="space-y-6 text-[13px] leading-relaxed text-slate-900">
                      {/* ==================== HALAMAN 1: FORMULIR 1 PERMENKES 73/2016 ==================== */}
                      <div className="space-y-4">
                        {/* Kop Surat Apotek + Label Formulir 1 */}
                        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
                          <div className="flex items-center gap-3.5">
                            {pharmacyProfile.logoUrl && (
                              <img
                                src={pharmacyProfile.logoUrl}
                                alt={docPharmacyName}
                                referrerPolicy="no-referrer"
                                className="w-14 h-14 object-contain shrink-0"
                              />
                            )}
                            <div>
                              <div className="text-base font-extrabold uppercase tracking-wide text-slate-900">
                                {docPharmacyName}
                              </div>
                              <div className="text-xs text-slate-700">
                                {docPharmacyAddress}
                                {pharmacyProfile.phone ? ` · Telp: ${pharmacyProfile.phone}` : ''}
                              </div>
                              {formatPharmacyLegalInfo(pharmacyProfile) && (
                                <div className="text-[11px] font-mono text-slate-600">
                                  {formatPharmacyLegalInfo(pharmacyProfile)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 border border-slate-400 px-2.5 py-1 rounded">
                            <div className="text-xs font-bold text-slate-900 uppercase">
                              Formulir 1
                            </div>
                            <div className="text-[10px] text-slate-600">
                              Permenkes RI No. 73 Tahun 2016
                            </div>
                          </div>
                        </div>

                        {/* Judul Resmi Berita Acara */}
                        <div className="text-center pt-1 pb-1">
                          <h4 className="text-sm sm:text-[15px] font-extrabold uppercase tracking-wide text-slate-900 underline underline-offset-4">
                            BERITA ACARA PEMUSNAHAN OBAT KADALUWARSA/RUSAK
                          </h4>
                          <div className="text-xs font-mono text-slate-700 mt-1">
                            Nomor : {rec.baNumber}
                          </div>
                        </div>

                        {/* Paragraf Pembuka Resmi Permenkes RI Nomor 73 Tahun 2016 */}
                        <p className="text-justify">
                          Pada hari ini{' '}
                          <strong className="font-semibold">{dateParts.dayName}</strong> tanggal{' '}
                          <strong className="font-semibold">{dateParts.dayNum}</strong> bulan{' '}
                          <strong className="font-semibold">{dateParts.monthName}</strong> tahun{' '}
                          <strong className="font-semibold">{dateParts.year}</strong> sesuai dengan{' '}
                          <strong>
                            Peraturan Menteri Kesehatan Republik Indonesia Nomor 73 Tahun 2016
                          </strong>{' '}
                          tentang Standar Pelayanan Kefarmasian di Apotek, kami yang bertanda tangan
                          di bawah ini:
                        </p>

                        {/* Identitas Apoteker Pengelola Apotek (APA / APJ) */}
                        <div className="pl-4 sm:pl-6 space-y-1">
                          <div className="grid grid-cols-12 gap-1">
                            <div className="col-span-5 sm:col-span-4">
                              Nama Apoteker Pengelola Apotek
                            </div>
                            <div className="col-span-7 sm:col-span-8 font-semibold">
                              : {docApjName}
                            </div>
                          </div>
                          <div className="grid grid-cols-12 gap-1">
                            <div className="col-span-5 sm:col-span-4">Nomor SIPA</div>
                            <div className="col-span-7 sm:col-span-8 font-mono">
                              : {docApjSipa}
                            </div>
                          </div>
                          <div className="grid grid-cols-12 gap-1">
                            <div className="col-span-5 sm:col-span-4">Nama Apotek</div>
                            <div className="col-span-7 sm:col-span-8 font-semibold">
                              : {docPharmacyName}
                            </div>
                          </div>
                          <div className="grid grid-cols-12 gap-1">
                            <div className="col-span-5 sm:col-span-4">Alamat Apotek</div>
                            <div className="col-span-7 sm:col-span-8">
                              : {docPharmacyAddress || '-'}
                            </div>
                          </div>
                        </div>

                        {/* Bagian Saksi-Saksi */}
                        <div className="space-y-2 pt-1">
                          <div>Dengan disaksikan oleh:</div>
                          <div className="pl-4 sm:pl-6 space-y-2.5">
                            {/* Saksi 1 */}
                            <div className="space-y-0.5">
                              <div className="grid grid-cols-12 gap-1">
                                <div className="col-span-5 sm:col-span-4">1. Nama</div>
                                <div className="col-span-7 sm:col-span-8 font-semibold">
                                  : {w1Name || '........................................................'}
                                </div>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <div className="col-span-5 sm:col-span-4 pl-4">
                                  NIP / No. SIPTTK / SIPA
                                </div>
                                <div className="col-span-7 sm:col-span-8 font-mono">
                                  : {w1Nip || '........................................................'}
                                </div>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <div className="col-span-5 sm:col-span-4 pl-4">Jabatan</div>
                                <div className="col-span-7 sm:col-span-8">
                                  : {w1Role || '........................................................'}
                                </div>
                              </div>
                            </div>

                            {/* Saksi 2 */}
                            <div className="space-y-0.5">
                              <div className="grid grid-cols-12 gap-1">
                                <div className="col-span-5 sm:col-span-4">2. Nama</div>
                                <div className="col-span-7 sm:col-span-8 font-semibold">
                                  : {w2Name || '........................................................'}
                                </div>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <div className="col-span-5 sm:col-span-4 pl-4">
                                  NIP / No. SIPTTK / SIPA
                                </div>
                                <div className="col-span-7 sm:col-span-8 font-mono">
                                  : {w2Nip || '........................................................'}
                                </div>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <div className="col-span-5 sm:col-span-4 pl-4">Jabatan</div>
                                <div className="col-span-7 sm:col-span-8">
                                  : {w2Role || '........................................................'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Pernyataan Pelaksanaan Pemusnahan */}
                        <div className="space-y-1.5 pt-1">
                          <p>
                            Telah melakukan pemusnahan obat sebagaimana tercantum dalam daftar
                            terlampir.
                          </p>
                          <div className="grid grid-cols-12 gap-1">
                            <div className="col-span-5 sm:col-span-4">
                              Tempat dilakukan pemusnahan
                            </div>
                            <div className="col-span-7 sm:col-span-8 font-medium">
                              : {docLocation}
                            </div>
                          </div>
                          <div className="grid grid-cols-12 gap-1">
                            <div className="col-span-5 sm:col-span-4">Cara pemusnahan</div>
                            <div className="col-span-7 sm:col-span-8 font-medium">
                              : {rec.method}
                            </div>
                          </div>
                        </div>

                        {/* Kalimat Penutup & Tembusan 4 Rangkap Resmi */}
                        <div className="space-y-1.5 pt-1">
                          <p className="text-justify">
                            Demikianlah berita acara ini kami buat sesungguhnya dengan penuh
                            tanggung jawab. Berita acara ini dibuat rangkap 4 (empat) dan dikirim
                            kepada:
                          </p>
                          <ol className="list-decimal pl-8 space-y-0.5 text-xs sm:text-[13px]">
                            <li>Kepala Dinas Kesehatan Kabupaten/Kota</li>
                            <li>Kepala Balai Pemeriksaan Obat dan Makanan (BPOM)</li>
                            <li>Kepala Dinas Kesehatan Provinsi</li>
                            <li>Arsip di Apotek</li>
                          </ol>
                        </div>

                        {/* Blok Tanda Tangan Resmi Formulir 1 */}
                        <div className="grid grid-cols-2 gap-8 pt-6 text-xs sm:text-[13px]">
                          {/* Kolom Kiri: Saksi-Saksi */}
                          <div className="space-y-5">
                            <div className="font-semibold">Saksi-saksi:</div>
                            <div className="space-y-1">
                              <div>1. {w1Name ? '' : '...............................................'}</div>
                              <div className="h-12" />
                              <div className="font-bold underline">
                                {w1Name ? `( ${w1Name} )` : '( ............................................... )'}
                              </div>
                              <div className="text-[11px] font-mono text-slate-600">
                                NIP/SIPTTK/SIPA: {w1Nip || '..................................'}
                              </div>
                            </div>
                            <div className="space-y-1 pt-1">
                              <div>2. {w2Name ? '' : '...............................................'}</div>
                              <div className="h-12" />
                              <div className="font-bold underline">
                                {w2Name ? `( ${w2Name} )` : '( ............................................... )'}
                              </div>
                              <div className="text-[11px] font-mono text-slate-600">
                                NIP/SIPTTK/SIPA: {w2Nip || '..................................'}
                              </div>
                            </div>
                          </div>

                          {/* Kolom Kanan: Yang Membuat Berita Acara (APA / APJ) */}
                          <div className="flex flex-col justify-between text-center">
                            <div>
                              <div>
                                {docCity}, {dateParts.fullDate}
                              </div>
                              <div className="font-semibold mt-1">Yang Membuat Berita Acara,</div>
                              <div className="text-xs italic text-slate-600">
                                (Apoteker Pengelola Apotek)
                              </div>
                              <div className="h-24" />
                              <div className="font-bold underline">( {docApjName} )</div>
                              <div className="text-[11px] font-mono text-slate-700 mt-0.5">
                                SIPA. {docApjSipa}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pemisah Halaman Preview & Page Break Cetak untuk Lampiran */}
                      <div className="border-t-2 border-dashed border-slate-300 pt-6 print:border-t-0 print:pt-0 print:break-before-page">
                        {/* ==================== HALAMAN 2: LAMPIRAN DAFTAR OBAT YANG DIMUSNAHKAN ==================== */}
                        <div className="space-y-4">
                          <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-2.5">
                            <div>
                              <div className="text-xs font-bold uppercase text-slate-900">
                                LAMPIRAN BERITA ACARA PEMUSNAHAN OBAT KADALUWARSA/RUSAK
                              </div>
                              <div className="text-[11px] text-slate-600 mt-0.5">
                                {docPharmacyName} · Nomor BA:{' '}
                                <span className="font-mono font-semibold text-slate-800">
                                  {rec.baNumber}
                                </span>{' '}
                                · Tanggal: {dateParts.fullDate}
                              </div>
                            </div>
                            <div className="text-right text-[11px] font-semibold text-slate-600 shrink-0">
                              Formulir 1 (Lanjutan)
                            </div>
                          </div>

                          <div className="text-center">
                            <h5 className="text-sm font-extrabold uppercase tracking-wide underline underline-offset-4">
                              DAFTAR OBAT YANG DIMUSNAHKAN
                            </h5>
                          </div>

                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-100 text-slate-800">
                                <th className="border border-slate-400 px-2 py-2 text-center w-9">
                                  No.
                                </th>
                                <th className="border border-slate-400 px-2.5 py-2">
                                  Nama Obat / Bahan Obat
                                </th>
                                <th className="border border-slate-400 px-2.5 py-2 whitespace-nowrap">
                                  No. Batch &amp; Tgl. ED
                                </th>
                                <th className="border border-slate-400 px-2 py-2 text-center whitespace-nowrap">
                                  Satuan
                                </th>
                                <th className="border border-slate-400 px-2 py-2 text-right whitespace-nowrap">
                                  Jumlah
                                </th>
                                <th className="border border-slate-400 px-2.5 py-2">
                                  Alasan Pemusnahan (Kadaluwarsa/Rusak)
                                </th>
                                <th className="border border-slate-400 px-2.5 py-2">
                                  Cara Pemusnahan
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {rec.items.map((it, idx) => (
                                <tr key={`${it.medicineId}-${idx}`}>
                                  <td className="border border-slate-400 px-2 py-1.5 text-center font-mono tabular-nums">
                                    {idx + 1}.
                                  </td>
                                  <td className="border border-slate-400 px-2.5 py-1.5 font-semibold">
                                    {it.name}
                                  </td>
                                  <td className="border border-slate-400 px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap">
                                    <div>{it.batchNo || '-'}</div>
                                    <div className="text-slate-600">
                                      ED: {it.expDate ? formatDateID(it.expDate) : '-'}
                                    </div>
                                  </td>
                                  <td className="border border-slate-400 px-2 py-1.5 text-center">
                                    {it.unit}
                                  </td>
                                  <td className="border border-slate-400 px-2 py-1.5 text-right font-mono tabular-nums font-semibold">
                                    {it.qty.toLocaleString('id-ID')}
                                  </td>
                                  <td className="border border-slate-400 px-2.5 py-1.5">
                                    {rec.reason || 'Kadaluwarsa (ED)'}
                                  </td>
                                  <td className="border border-slate-400 px-2.5 py-1.5">
                                    {rec.method}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-50 font-bold">
                                <td
                                  colSpan={4}
                                  className="border border-slate-400 px-2.5 py-2 text-right"
                                >
                                  Total ({rec.totalItems} Jenis Obat)
                                </td>
                                <td className="border border-slate-400 px-2 py-2 text-right font-mono tabular-nums">
                                  {rec.totalQty.toLocaleString('id-ID')}
                                </td>
                                <td
                                  colSpan={2}
                                  className="border border-slate-400 px-2.5 py-2 text-[11px] font-mono font-normal text-slate-600"
                                >
                                  Estimasi Nilai Aset (HPP): Rp{' '}
                                  {rec.totalValue.toLocaleString('id-ID')}
                                </td>
                              </tr>
                            </tfoot>
                          </table>

                          {/* Blok Pengesahan Lampiran */}
                          <div className="grid grid-cols-2 gap-8 pt-6 text-xs sm:text-[13px]">
                            <div className="space-y-4">
                              <div className="font-semibold">Saksi-saksi:</div>
                              <div>
                                <div>1. {w1Name ? `( ${w1Name} )` : '( ............................................... )'}</div>
                                <div className="text-[11px] font-mono text-slate-600 pl-4 mt-0.5">
                                  NIP/SIPTTK/SIPA: {w1Nip || '..................................'}
                                </div>
                              </div>
                              <div>
                                <div>2. {w2Name ? `( ${w2Name} )` : '( ............................................... )'}</div>
                                <div className="text-[11px] font-mono text-slate-600 pl-4 mt-0.5">
                                  NIP/SIPTTK/SIPA: {w2Nip || '..................................'}
                                </div>
                              </div>
                            </div>

                            <div className="text-center">
                              <div>
                                {docCity}, {dateParts.fullDate}
                              </div>
                              <div className="font-semibold mt-1">Yang Membuat Berita Acara,</div>
                              <div className="text-xs italic text-slate-600">
                                (Apoteker Pengelola Apotek)
                              </div>
                              <div className="h-20" />
                              <div className="font-bold underline">( {docApjName} )</div>
                              <div className="text-[11px] font-mono text-slate-700 mt-0.5">
                                SIPA. {docApjSipa}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
