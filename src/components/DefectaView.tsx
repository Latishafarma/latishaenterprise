import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Printer,
  FileText,
  CheckCircle2,
  RefreshCw,
  ShoppingCart,
  Plus,
  Trash2,
  Edit2,
  Search,
  Calendar,
  Package,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  X,
  CheckSquare,
  Database,
  Code,
  AlertCircle,
  Copy,
  Check,
  History,
  Filter,
  RotateCcw,
  Clock,
  Loader2,
  Download,
  Eye,
  Phone,
  Send,
  Camera
} from 'lucide-react';
import {
  Branch,
  Medicine,
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  SPGroupType,
  SPPrintLogEntry,
  isOwnerAdminRole
} from '../types';
import { openPrintWindow } from '../utils/printHelper';
import {
  createPurchaseOrderPdfPreview,
  downloadPurchaseOrderPdf,
  normalizeWhatsappPhone,
  PurchaseOrderPdfPreviewData,
  sendPurchaseOrderViaWhatsapp
} from '../utils/purchaseOrderWhatsapp';
import { PaginationControls } from './PaginationControls';
import { CameraBarcodeScannerModal, playBarcodeBeep } from './CameraBarcodeScannerModal';
import { INITIAL_SUPPLIERS } from '../data/initialData';
import { demoGetItem, demoSetItem } from '../utils/demoSandbox';
import {
  SUPABASE_PURCHASE_ORDER_SQL_SCHEMA,
  DEFAULT_PURCHASE_ORDER_TABLE,
  getSupabaseConfig,
  setSupabaseConfig
} from '../utils/supabaseClient';

interface DefectaViewProps {
  medicines: Medicine[];
  suppliers?: Supplier[];
  purchaseOrders?: PurchaseOrder[];
  currentBranch?: Branch;
  userName?: string;
  activeRole?: string;
  onSavePurchaseOrder?: (
    po: PurchaseOrder,
    options?: { skipAudit?: boolean }
  ) => Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  onDeletePurchaseOrder?: (poId: string) => Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
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

interface SPHistoryEntry {
  key: string;
  po: PurchaseOrder;
  spType: SPGroupType | 'ALL';
  spNumber: string;
  items: PurchaseOrderItem[];
  totalQtyBesar: number;
  totalEstimatedCost: number;
  printLog?: SPPrintLogEntry;
  groupCountInPo: number;
}

const PO_STATUS_OPTIONS: PurchaseOrder['status'][] = [
  'Draft',
  'Diajukan',
  'Diproses',
  'Dikirim',
  'Selesai',
  'Dibatalkan'
];

const getStatusBadgeClass = (status: PurchaseOrder['status']): string => {
  switch (status) {
    case 'Selesai':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'Dikirim':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'Diproses':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Diajukan':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'Dibatalkan':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'Draft':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const detectSPGroup = (m: Partial<Medicine>): SPGroupType => {
  const nappza = (m.nappza || '').toLowerCase();
  const cat = (m.category || '').toLowerCase();

  if (nappza.includes('narkotik')) return 'NAR';
  if (nappza.includes('psikotropik')) return 'PSI';
  if (nappza.includes('prekursor')) return 'PRE';
  if (nappza.includes('oot') || nappza.includes('tertentu')) return 'OOT';
  if (cat.includes('alat') || cat.includes('alkes') || cat.includes('kesehatan')) return 'ALK';
  return 'REG';
};

export const getSPGroupMeta = (spType: SPGroupType | 'ALL') => {
  switch (spType) {
    case 'NAR':
      return {
        code: 'NAR',
        label: 'Narkotika',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        title: 'Surat Pesanan Narkotika (PMK 3/2015)'
      };
    case 'PSI':
      return {
        code: 'PSI',
        label: 'Psikotropika',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
        title: 'Surat Pesanan Psikotropika (PMK 3/2015)'
      };
    case 'PRE':
      return {
        code: 'PRE',
        label: 'Prekursor',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        title: 'Surat Pesanan Prekursor Farmasi (BPOM 24/2021)'
      };
    case 'OOT':
      return {
        code: 'OOT',
        label: 'Obat Tertentu (OOT)',
        badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
        title: 'Surat Pesanan Obat-Obat Tertentu (BPOM 10/2019)'
      };
    case 'ALK':
      return {
        code: 'ALK',
        label: 'Alkes & BMHP',
        badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-300',
        title: 'Surat Pesanan Alat Kesehatan & BMHP'
      };
    case 'ALL':
      return {
        code: 'ALL',
        label: 'Gabungan Semua Item',
        badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        title: 'Surat Pesanan Gabungan Seluruh Item PO'
      };
    case 'REG':
    default:
      return {
        code: 'REG',
        label: 'Reguler (OTC/Keras)',
        badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
        title: 'Surat Pesanan Obat Jadi Reguler'
      };
  }
};

export const generateSPNumber = (spType: SPGroupType, orderIndex: number, dateStr?: string): string => {
  const d = dateStr ? new Date(dateStr) : new Date();
  const validD = isNaN(d.getTime()) ? new Date() : d;
  const romanMonth = ROMAN_MONTHS[validD.getMonth()] || 'I';
  const year = validD.getFullYear();
  const seq = String(orderIndex).padStart(3, '0');
  return `ALF/${spType}/${romanMonth}/${year}/${seq}`;
};

const formatTimestampShort = (iso?: string): string => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
};

export const DefectaView: React.FC<DefectaViewProps> = ({
  medicines,
  suppliers = INITIAL_SUPPLIERS,
  purchaseOrders: propPurchaseOrders,
  currentBranch,
  userName = 'Petugas Apotek',
  activeRole = 'APJ / Owner',
  onSavePurchaseOrder,
  onDeletePurchaseOrder,
  onSyncSupabase,
  needsTableSetup = false,
  isDemoSandbox = false
}) => {
  const isSuperAdmin = isOwnerAdminRole(activeRole);

  const [activeTab, setActiveTab] = useState<'defecta' | 'orders' | 'sp-history'>('defecta');
  const [selectedPeriod, setSelectedPeriod] = useState<'1bulan' | '3bulan' | '6bulan' | '1tahun'>('1bulan');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('SEMUA');
  const [searchTerm, setSearchTerm] = useState('');
  const [checkedMedicineIds, setCheckedMedicineIds] = useState<Set<string>>(new Set());
  const [defectaScannerTarget, setDefectaScannerTarget] = useState<'defecta' | 'poModal' | null>(null);

  // Fallback local state if mounted standalone without App.tsx prop control
  const [localPurchaseOrders, setLocalPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    if (propPurchaseOrders !== undefined) return [];
    try {
      const saved = demoGetItem('latisha_purchase_orders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    if (propPurchaseOrders !== undefined) return;
    try {
      demoSetItem('latisha_purchase_orders', JSON.stringify(localPurchaseOrders));
    } catch {}
  }, [propPurchaseOrders, localPurchaseOrders]);

  const purchaseOrders = propPurchaseOrders !== undefined ? propPurchaseOrders : localPurchaseOrders;

  // Supabase Sync, Schema Modal & Toast States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [purchaseOrderTableInput, setPurchaseOrderTableInput] = useState(
    () => getSupabaseConfig().purchaseOrderTable || DEFAULT_PURCHASE_ORDER_TABLE
  );

  // Delete Confirmation Modal State (supports deleting full PO or specific SP group within multi-SP PO)
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{
    po: PurchaseOrder;
    spType?: SPGroupType | 'ALL';
    spNumber?: string;
    isPartialSp?: boolean;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sendingWaPoId, setSendingWaPoId] = useState<string | null>(null);
  const [waPreviewModal, setWaPreviewModal] = useState<PurchaseOrderPdfPreviewData | null>(null);
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waMessageInput, setWaMessageInput] = useState('');
  const [waPreviewTab, setWaPreviewTab] = useState<'pdf' | 'summary'>('pdf');
  const [waMessageEdited, setWaMessageEdited] = useState(false);
  const [isSendingWaPreview, setIsSendingWaPreview] = useState(false);

  useEffect(() => {
    const activeUrl = waPreviewModal?.previewUrl;
    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [waPreviewModal?.previewUrl]);

  // Persist / Update helper routed to App.tsx (2-way Supabase) or fallback local state
  const persistPurchaseOrder = async (
    po: PurchaseOrder,
    options?: { skipAudit?: boolean }
  ): Promise<boolean> => {
    if (onSavePurchaseOrder) {
      const res = await onSavePurchaseOrder(po, options);
      if (res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: `Tersimpan lokal. Tabel Supabase "${purchaseOrderTableInput}" belum siap — klik Skema SQL untuk membuat tabel.`
        });
      } else if (!res.success && !res.isDemo && res.error) {
        setSyncToast({
          type: 'warning',
          message: `Tersimpan lokal, namun gagal sinkron ke Supabase: ${res.error}`
        });
      }
      return res.success || Boolean(res.isDemo);
    }

    setLocalPurchaseOrders((prev) =>
      prev.some((p) => p.id === po.id) ? prev.map((p) => (p.id === po.id ? po : p)) : [po, ...prev]
    );
    return true;
  };

  const removePurchaseOrder = async (poId: string): Promise<boolean> => {
    if (onDeletePurchaseOrder) {
      const res = await onDeletePurchaseOrder(poId);
      if (res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: `Dihapus lokal. Tabel Supabase "${purchaseOrderTableInput}" belum siap.`
        });
      } else if (!res.success && !res.isDemo && res.error) {
        setSyncToast({
          type: 'warning',
          message: `Dihapus lokal, namun gagal menghapus di Supabase: ${res.error}`
        });
      }
      return res.success || Boolean(res.isDemo);
    }

    setLocalPurchaseOrders((prev) => prev.filter((p) => p.id !== poId));
    return true;
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
          message: res.error || 'Mode Demo aktif. Sinkronisasi produksi dinonaktifkan.'
        });
      } else if (res.needsTableSetup) {
        setSyncToast({
          type: 'error',
          message: `Tabel "${purchaseOrderTableInput}" belum tersedia di Supabase. Jalankan skrip pada tombol Skema SQL.`
        });
        if (isSuperAdmin) setShowSchemaModal(true);
      } else if (!res.success) {
        setSyncToast({
          type: 'error',
          message: res.error || 'Gagal menyinkronkan data Surat Pesanan dengan Supabase.'
        });
      } else {
        setSyncToast({
          type: 'success',
          message: `Sinkronisasi 2-arah berhasil! ${res.count ?? purchaseOrders.length} pesanan pembelian & riwayat SP tersinkron dengan Supabase.`
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveTableName = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = purchaseOrderTableInput.trim() || DEFAULT_PURCHASE_ORDER_TABLE;
    setPurchaseOrderTableInput(clean);
    setSupabaseConfig({ purchaseOrderTable: clean });
    await handleRunSupabaseSync();
  };

  const handleCopySchema = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_PURCHASE_ORDER_SQL_SCHEMA);
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2500);
    } catch {
      setSyncToast({
        type: 'warning',
        message: 'Gagal menyalin otomatis. Silakan blok & salin teks SQL secara manual.'
      });
    }
  };

  // Form Re-Order State
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderFormError, setOrderFormError] = useState<string | null>(null);

  const [orderForm, setOrderForm] = useState<{
    date: string;
    supplierId: string;
    supplierName: string;
    supplierAddress: string;
    supplierPhone: string;
    supplierLicenseNo: string;
    notes: string;
    items: PurchaseOrderItem[];
  }>({
    date: new Date().toISOString().split('T')[0],
    supplierId: '',
    supplierName: '',
    supplierAddress: '',
    supplierPhone: '',
    supplierLicenseNo: '',
    notes: '',
    items: []
  });

  // Supplier Autocomplete
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);

  // Medicine Search to Add Custom Item into PO
  const [isMedicineSearchOpen, setIsMedicineSearchOpen] = useState(false);
  const [medicineSearchQuery, setMedicineSearchQuery] = useState('');

  // Print SP Modal State
  const [printModalPo, setPrintModalPo] = useState<PurchaseOrder | null>(null);

  // Pesanan Pembelian Tab Filters & Pagination
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<string>('SEMUA');
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState<number>(25);

  // Riwayat Surat Pesanan Tab Filters, Expanded Rows & Pagination
  const [spSearch, setSpSearch] = useState('');
  const [spTypeFilter, setSpTypeFilter] = useState<string>('SEMUA');
  const [spStatusFilter, setSpStatusFilter] = useState<string>('SEMUA');
  const [spStartDate, setSpStartDate] = useState('');
  const [spEndDate, setSpEndDate] = useState('');
  const [expandedSpKey, setExpandedSpKey] = useState<string | null>(null);
  const [spPage, setSpPage] = useState(1);
  const [spPageSize, setSpPageSize] = useState<number>(25);

  // Close supplier dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setIsSupplierDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered suppliers for autocomplete
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.licenseNo && s.licenseNo.toLowerCase().includes(q))
    );
  }, [suppliers, supplierSearch]);

  // Defecta items calculation
  const defectaList = useMemo(() => {
    const periodMonths =
      selectedPeriod === '1bulan' ? 1 : selectedPeriod === '3bulan' ? 3 : selectedPeriod === '6bulan' ? 6 : 12;

    return medicines.map((m) => {
      const isDefecta = m.stock <= m.minStock;
      const spType = detectSPGroup(m);

      const monthlyUsage = Math.max(10, Math.round(m.minStock * 1.5));
      const pemakaianPeriode = monthlyUsage * periodMonths;
      const buffer10 = Math.round(pemakaianPeriode * 0.1);

      const netKecil = pemakaianPeriode + buffer10 - m.stock;
      const rekomendasiKecil = Math.max(0, netKecil);
      const ratio = Math.max(1, m.rasioKonversi || 1);
      const rekomendasiBesar = Math.max(1, Math.ceil(rekomendasiKecil / ratio));

      const hna = m.hnaBesar || (m.hpp ? Math.round(m.hpp * ratio * 0.9) : 40000);
      const totalEstimasi = rekomendasiBesar * hna;

      return {
        ...m,
        isDefecta,
        spType,
        monthlyUsage,
        pemakaianPeriode,
        buffer10,
        rekomendasiKecil,
        rekomendasiBesar,
        hnaBesarEstimate: hna,
        totalEstimasi
      };
    });
  }, [medicines, selectedPeriod]);

  // Distinct suppliers in defecta list
  const defectaSuppliers = useMemo(() => {
    const setSup = new Set(
      defectaList.filter((m) => m.isDefecta).map((m) => m.supplier || 'PT Kimia Farma Trading')
    );
    return Array.from(setSup);
  }, [defectaList]);

  // Filtered Defecta view
  const filteredDefecta = useMemo(() => {
    return defectaList.filter((item) => {
      if (!item.isDefecta) return false;

      const q = searchTerm.toLowerCase();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.barcode && item.barcode.toLowerCase().includes(q)) ||
        item.id.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.nappza && item.nappza.toLowerCase().includes(q));

      const matchSup =
        selectedSupplierFilter === 'SEMUA' || (item.supplier || 'PT Kimia Farma Trading') === selectedSupplierFilter;

      return matchSearch && matchSup;
    });
  }, [defectaList, searchTerm, selectedSupplierFilter]);

  const [defectaPage, setDefectaPage] = useState(1);
  const [defectaPageSize, setDefectaPageSize] = useState<number>(25);

  useEffect(() => {
    setDefectaPage(1);
  }, [searchTerm, selectedSupplierFilter, selectedPeriod]);

  const defectaTotalPages = Math.max(1, Math.ceil(filteredDefecta.length / defectaPageSize));
  const safeDefectaPage = Math.min(defectaPage, defectaTotalPages);
  const paginatedDefecta = useMemo(() => {
    const start = (safeDefectaPage - 1) * defectaPageSize;
    return filteredDefecta.slice(start, start + defectaPageSize);
  }, [filteredDefecta, safeDefectaPage, defectaPageSize]);

  // Sorted Purchase Orders (newest first)
  const sortedPurchaseOrders = useMemo(() => {
    return [...purchaseOrders].sort((a, b) =>
      `${b.date || ''} ${b.createdAt || ''}`.localeCompare(`${a.date || ''} ${a.createdAt || ''}`)
    );
  }, [purchaseOrders]);

  const filteredPurchaseOrders = useMemo(() => {
    const q = ordersSearch.trim().toLowerCase();
    return sortedPurchaseOrders.filter((po) => {
      if (ordersStatusFilter !== 'SEMUA' && po.status !== ordersStatusFilter) return false;
      if (!q) return true;
      const spNums = Object.values(po.spNumbers || {}).join(' ').toLowerCase();
      const itemsText = (po.items || []).map((it) => it.name).join(' ').toLowerCase();
      return (
        po.poNumber.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q) ||
        (po.petugas || '').toLowerCase().includes(q) ||
        spNums.includes(q) ||
        itemsText.includes(q)
      );
    });
  }, [sortedPurchaseOrders, ordersSearch, ordersStatusFilter]);

  useEffect(() => {
    setOrdersPage(1);
  }, [ordersSearch, ordersStatusFilter]);

  const ordersTotalPages = Math.max(1, Math.ceil(filteredPurchaseOrders.length / ordersPageSize));
  const safeOrdersPage = Math.min(ordersPage, ordersTotalPages);
  const paginatedPurchaseOrders = useMemo(() => {
    const start = (safeOrdersPage - 1) * ordersPageSize;
    return filteredPurchaseOrders.slice(start, start + ordersPageSize);
  }, [filteredPurchaseOrders, safeOrdersPage, ordersPageSize]);

  // Flattened Riwayat Surat Pesanan (1 entry per SP group in each PO + ALL if recorded)
  const spHistoryEntries = useMemo<SPHistoryEntry[]>(() => {
    const entries: SPHistoryEntry[] = [];
    const groupOrder: SPGroupType[] = ['NAR', 'PSI', 'PRE', 'OOT', 'ALK', 'REG'];

    sortedPurchaseOrders.forEach((po) => {
      const items = Array.isArray(po.items) ? po.items : [];
      const distinctTypes = Array.from(new Set(items.map((it) => it.spType))).sort(
        (a, b) => groupOrder.indexOf(a) - groupOrder.indexOf(b)
      );

      distinctTypes.forEach((spType) => {
        const groupItems = items.filter((it) => it.spType === spType);
        const spNumber =
          po.spNumbers?.[spType] || generateSPNumber(spType, 1, po.date);
        const totalQtyBesar = groupItems.reduce((s, it) => s + (Number(it.qtyBesar) || 0), 0);
        const totalEstimatedCost = groupItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
        entries.push({
          key: `${po.id}::${spType}`,
          po,
          spType,
          spNumber,
          items: groupItems,
          totalQtyBesar,
          totalEstimatedCost,
          printLog: po.spPrintLogs?.[spType],
          groupCountInPo: distinctTypes.length
        });
      });

      if (po.spPrintLogs?.ALL && items.length > 0) {
        const romanMonth = ROMAN_MONTHS[new Date(po.date).getMonth()] || 'I';
        const year = new Date(po.date).getFullYear() || new Date().getFullYear();
        const allSpNumber = po.spNumbers?.REG
          ? po.spNumbers.REG.replace('/REG/', '/ALL/')
          : `ALF/ALL/${romanMonth}/${year}/001`;
        entries.push({
          key: `${po.id}::ALL`,
          po,
          spType: 'ALL',
          spNumber: allSpNumber,
          items,
          totalQtyBesar: items.reduce((s, it) => s + (Number(it.qtyBesar) || 0), 0),
          totalEstimatedCost: items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0),
          printLog: po.spPrintLogs.ALL,
          groupCountInPo: distinctTypes.length
        });
      }
    });

    return entries;
  }, [sortedPurchaseOrders]);

  const filteredSpHistory = useMemo(() => {
    const q = spSearch.trim().toLowerCase();
    return spHistoryEntries.filter((entry) => {
      if (spTypeFilter !== 'SEMUA' && entry.spType !== spTypeFilter) return false;
      if (spStatusFilter !== 'SEMUA' && entry.po.status !== spStatusFilter) return false;
      if (spStartDate && entry.po.date < spStartDate) return false;
      if (spEndDate && entry.po.date > spEndDate) return false;
      if (q) {
        const itemsHay = entry.items.map((it) => `${it.name} ${it.ket || ''}`).join(' ').toLowerCase();
        const hay = `${entry.spNumber} ${entry.po.poNumber} ${entry.po.supplierName} ${entry.po.supplierLicenseNo || ''} ${entry.po.petugas || ''} ${itemsHay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [spHistoryEntries, spSearch, spTypeFilter, spStatusFilter, spStartDate, spEndDate]);

  useEffect(() => {
    setSpPage(1);
  }, [spSearch, spTypeFilter, spStatusFilter, spStartDate, spEndDate]);

  const spTotalPages = Math.max(1, Math.ceil(filteredSpHistory.length / spPageSize));
  const safeSpPage = Math.min(spPage, spTotalPages);
  const paginatedSpHistory = useMemo(() => {
    const start = (safeSpPage - 1) * spPageSize;
    return filteredSpHistory.slice(start, start + spPageSize);
  }, [filteredSpHistory, safeSpPage, spPageSize]);

  // SP History KPIs
  const spSpecialCount = useMemo(
    () =>
      filteredSpHistory.filter((e) =>
        ['NAR', 'PSI', 'PRE', 'OOT'].includes(e.spType)
      ).length,
    [filteredSpHistory]
  );
  const spPrintedCount = useMemo(
    () => filteredSpHistory.filter((e) => (e.printLog?.printCount || 0) > 0).length,
    [filteredSpHistory]
  );
  const spTotalCost = useMemo(() => {
    const seenPo = new Set<string>();
    let total = 0;
    filteredSpHistory.forEach((e) => {
      if (e.spType === 'ALL') return;
      const k = `${e.po.id}::${e.spType}`;
      if (!seenPo.has(k)) {
        seenPo.add(k);
        total += e.totalEstimatedCost;
      }
    });
    return total;
  }, [filteredSpHistory]);

  // Handle Checkbox Selection
  const handleToggleCheck = (id: string) => {
    setCheckedMedicineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (checkedMedicineIds.size === filteredDefecta.length) {
      setCheckedMedicineIds(new Set());
    } else {
      setCheckedMedicineIds(new Set(filteredDefecta.map((m) => m.id)));
    }
  };

  const resolveMedicineForm = (medicineId?: string, name?: string, fallbackForm?: string) => {
    const matched = medicines.find(
      (med) =>
        (medicineId && med.id === medicineId) ||
        (name && med.name.toLowerCase() === name.toLowerCase())
    );
    const resolved = String(matched?.form || fallbackForm || '').trim();
    return resolved || 'Tablet';
  };

  // Open Re-Order Form
  const handleOpenReOrderForm = (singleItem?: any) => {
    setEditingOrderId(null);
    setOrderFormError(null);

    let itemsToOrder: any[] = [];
    let detectedSupplierName = '';
    let matchedSup: Supplier | undefined = undefined;

    if (singleItem) {
      itemsToOrder = [singleItem];
      detectedSupplierName = singleItem.supplier || '';
      matchedSup = suppliers.find((s) => s.name.toLowerCase() === detectedSupplierName.toLowerCase());
    } else if (checkedMedicineIds.size > 0) {
      itemsToOrder = defectaList.filter((m) => checkedMedicineIds.has(m.id));
      detectedSupplierName = itemsToOrder[0]?.supplier || '';
      matchedSup = suppliers.find((s) => s.name.toLowerCase() === detectedSupplierName.toLowerCase());
    }

    const orderItems: PurchaseOrderItem[] = itemsToOrder.map((m, idx) => ({
      id: `ITEM-${Date.now()}-${idx}`,
      medicineId: m.id,
      name: m.name,
      category: m.category,
      nappza: m.nappza || 'Non-NAPPZA',
      spType: detectSPGroup(m),
      form: resolveMedicineForm(m.id, m.name, m.form),
      kekuatan: m.kekuatan || '',
      satuanBesar: m.satuanBesar || 'Box',
      satuanKecil: m.satuanKecil || m.unit || 'Strip',
      rasioKonversi: m.rasioKonversi || 10,
      currentStock: m.stock,
      minStock: m.minStock,
      qtyBesar: m.rekomendasiBesar || 1,
      qtyKecil: (m.rekomendasiBesar || 1) * (m.rasioKonversi || 10),
      estimatedHna: m.hnaBesar || m.hnaBesarEstimate || 50000,
      subtotal: (m.rekomendasiBesar || 1) * (m.hnaBesar || m.hnaBesarEstimate || 50000),
      ket: ''
    }));

    setOrderForm({
      date: new Date().toISOString().split('T')[0],
      supplierId: matchedSup?.id || '',
      supplierName: matchedSup?.name || detectedSupplierName,
      supplierAddress: matchedSup?.address || '',
      supplierPhone: matchedSup?.phone || '',
      supplierLicenseNo: matchedSup?.licenseNo || '',
      notes: '',
      items: orderItems
    });

    setSupplierSearch(matchedSup?.name || detectedSupplierName);
    setIsOrderModalOpen(true);
  };

  // Open Edit Order Form
  const handleOpenEditOrder = (po: PurchaseOrder) => {
    setEditingOrderId(po.id);
    setOrderFormError(null);
    const hydratedItems = (po.items || []).map((it) => {
      const matched = medicines.find(
        (m) =>
          (it.medicineId && m.id === it.medicineId) ||
          m.name.toLowerCase() === String(it.name || '').toLowerCase()
      );
      return {
        ...it,
        form: String(matched?.form || it.form || '').trim() || 'Tablet',
        kekuatan: it.kekuatan || matched?.kekuatan || ''
      };
    });
    setOrderForm({
      date: po.date,
      supplierId: po.supplierId || '',
      supplierName: po.supplierName,
      supplierAddress: po.supplierAddress || '',
      supplierPhone: po.supplierPhone || '',
      supplierLicenseNo: po.supplierLicenseNo || '',
      notes: po.notes || '',
      items: hydratedItems
    });
    setSupplierSearch(po.supplierName);
    setIsOrderModalOpen(true);
  };

  // Confirmed Delete Handler (Full PO or specific SP group)
  const handleConfirmDeleteTarget = async () => {
    if (!confirmDeleteTarget) return;
    setIsDeleting(true);
    try {
      const { po, spType, isPartialSp } = confirmDeleteTarget;
      if (isPartialSp && spType && spType !== 'ALL') {
        const remainingItems = po.items.filter((it) => it.spType !== spType);
        if (remainingItems.length === 0) {
          await removePurchaseOrder(po.id);
          setSyncToast({
            type: 'success',
            message: `Pesanan Pembelian #${po.poNumber} beserta Surat Pesanan berhasil dihapus.`
          });
        } else {
          const nextLogs = { ...(po.spPrintLogs || {}) };
          delete nextLogs[spType];
          const updatedPo: PurchaseOrder = {
            ...po,
            items: remainingItems,
            totalEstimatedCost: remainingItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0),
            spPrintLogs: nextLogs,
            updatedAt: new Date().toISOString()
          };
          await persistPurchaseOrder(updatedPo);
          setSyncToast({
            type: 'success',
            message: `Surat Pesanan kelompok ${spType} dari PO #${po.poNumber} berhasil dihapus dan disinkronkan.`
          });
        }
      } else {
        await removePurchaseOrder(po.id);
        setSyncToast({
          type: 'success',
          message: `Pesanan Pembelian #${po.poNumber} dan seluruh SP terkait berhasil dihapus.`
        });
      }
      setConfirmDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Update Order Status inline (synced 2-way to Supabase)
  const handleChangeOrderStatus = async (po: PurchaseOrder, nextStatus: PurchaseOrder['status']) => {
    if (po.status === nextStatus) return;
    const updatedPo: PurchaseOrder = {
      ...po,
      status: nextStatus,
      updatedAt: new Date().toISOString()
    };
    await persistPurchaseOrder(updatedPo);
    setSyncToast({
      type: 'success',
      message: `Status PO #${po.poNumber} diperbarui ke "${nextStatus}".`
    });
  };

  // Buka Modal Pratinjau PDF Pesanan Pembelian sebelum mengirim ke PBF via WhatsApp
  const handleSendPoViaWhatsapp = (po: PurchaseOrder) => {
    if (sendingWaPoId === po.id) return;
    setSendingWaPoId(po.id);
    try {
      const preview = createPurchaseOrderPdfPreview(po, suppliers);
      setWaPreviewModal(preview);
      setWaPhoneInput(preview.rawPhone);
      setWaMessageInput(preview.defaultMessage);
      setWaMessageEdited(false);
      setWaPreviewTab('pdf');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat pratinjau PDF pesanan pembelian.';
      setSyncToast({
        type: 'error',
        message: `Gagal menyiapkan pratinjau PDF: ${msg}`
      });
    } finally {
      setSendingWaPoId(null);
    }
  };

  const handleUpdateWaSpSelection = (nextGroups: SPGroupType[]) => {
    if (!waPreviewModal || nextGroups.length === 0) return;
    try {
      const updatedPreview = createPurchaseOrderPdfPreview(
        waPreviewModal.po,
        suppliers,
        nextGroups
      );
      setWaPreviewModal(updatedPreview);
      if (!waMessageEdited) {
        setWaMessageInput(updatedPreview.defaultMessage);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui filter SP PDF.';
      setSyncToast({
        type: 'error',
        message: `Gagal memperbarui pratinjau PDF: ${msg}`
      });
    }
  };

  const handleToggleWaSpGroup = (spType: SPGroupType) => {
    if (!waPreviewModal) return;
    const current = waPreviewModal.selectedSpGroups;
    const exists = current.includes(spType);
    if (exists && current.length <= 1) {
      return; // Pertahankan minimal 1 kelompok SP aktif agar PDF tidak kosong
    }
    const next = exists
      ? current.filter((g) => g !== spType)
      : [...current, spType];
    handleUpdateWaSpSelection(next);
  };

  const handleCloseWaPreviewModal = () => {
    if (isSendingWaPreview) return;
    setWaPreviewModal(null);
    setWaPhoneInput('');
    setWaMessageInput('');
    setWaMessageEdited(false);
  };

  const handleConfirmSendWaFromPreview = async () => {
    if (!waPreviewModal || isSendingWaPreview) return;
    setIsSendingWaPreview(true);
    try {
      const targetPo = waPreviewModal.po;
      const result = await sendPurchaseOrderViaWhatsapp(targetPo, suppliers, {
        customPhone: waPhoneInput,
        customMessage: waMessageInput,
        selectedSpGroups: waPreviewModal.selectedSpGroups,
        pregeneratedPdf: {
          blob: waPreviewModal.blob,
          file: waPreviewModal.file,
          fileName: waPreviewModal.fileName
        }
      });

      if (result.mode === 'cancelled') {
        return;
      }

      setWaPreviewModal(null);
      setWaPhoneInput('');
      setWaMessageInput('');

      if (result.mode === 'web-share') {
        setSyncToast({
          type: 'success',
          message: `PDF ${result.fileName} siap dibagikan ke ${targetPo.supplierName} melalui WhatsApp.`
        });
      } else if (result.phone) {
        setSyncToast({
          type: 'success',
          message: `PDF ${result.fileName} otomatis diunduh & WhatsApp ke ${targetPo.supplierName} (${result.displayPhone || result.phone}) dibuka. Lampirkan/seret file PDF ke chat PBF.`
        });
      } else {
        setSyncToast({
          type: 'warning',
          message: `PDF ${result.fileName} diunduh & WhatsApp dibuka, namun nomor HP/WA PBF "${targetPo.supplierName}" belum diisi. Pilih kontak PBF di WhatsApp lalu lampirkan PDF.`
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengirim pesanan pembelian ke WhatsApp.';
      setSyncToast({
        type: 'error',
        message: `Gagal mengirim ke WhatsApp: ${msg}`
      });
    } finally {
      setIsSendingWaPreview(false);
    }
  };

  // Save Order
  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderFormError(null);
    if (!orderForm.supplierName.trim()) {
      setOrderFormError('Nama Supplier / PBF wajib dipilih!');
      return;
    }
    if (orderForm.items.length === 0) {
      setOrderFormError('Pilih minimal 1 obat untuk pesanan pembelian!');
      return;
    }

    const orderDateObj = new Date(orderForm.date);
    const validOrderDate = isNaN(orderDateObj.getTime()) ? new Date() : orderDateObj;
    const yyyyMm = `${validOrderDate.getFullYear()}${String(validOrderDate.getMonth() + 1).padStart(2, '0')}`;

    const maxSeq = purchaseOrders.reduce((max, existingPo) => {
      const m = existingPo.poNumber?.match(/(\d{3,})$/);
      const num = m ? parseInt(m[1], 10) : 0;
      return Math.max(max, isNaN(num) ? 0 : num);
    }, 0);

    const orderIndex = editingOrderId
      ? parseInt(editingOrderId.replace(/\D/g, '').slice(-3), 10) || maxSeq + 1
      : maxSeq + 1;

    const spNumbers: Record<SPGroupType, string> = {
      REG: generateSPNumber('REG', orderIndex, orderForm.date),
      ALK: generateSPNumber('ALK', orderIndex, orderForm.date),
      PRE: generateSPNumber('PRE', orderIndex, orderForm.date),
      OOT: generateSPNumber('OOT', orderIndex, orderForm.date),
      PSI: generateSPNumber('PSI', orderIndex, orderForm.date),
      NAR: generateSPNumber('NAR', orderIndex, orderForm.date)
    };

    const totalCost = orderForm.items.reduce((sum, it) => sum + it.subtotal, 0);

    let savedPo: PurchaseOrder;
    if (editingOrderId) {
      const existing = purchaseOrders.find((p) => p.id === editingOrderId);
      savedPo = {
        ...(existing || ({} as PurchaseOrder)),
        id: editingOrderId,
        poNumber: existing?.poNumber || editingOrderId,
        date: orderForm.date,
        supplierId: orderForm.supplierId,
        supplierName: orderForm.supplierName,
        supplierAddress: orderForm.supplierAddress,
        supplierPhone: orderForm.supplierPhone,
        supplierLicenseNo: orderForm.supplierLicenseNo,
        spNumbers: existing?.spNumbers || spNumbers,
        status: existing?.status || 'Diproses',
        items: orderForm.items,
        notes: orderForm.notes,
        totalEstimatedCost: totalCost,
        branchId: existing?.branchId || currentBranch?.id || 'BR-01',
        petugas: existing?.petugas || userName,
        updatedAt: new Date().toISOString()
      };
    } else {
      const uniqueSuffix = isDemoSandbox ? `-DEMO-${String(Date.now()).slice(-4)}` : `-${String(Date.now()).slice(-4)}`;
      const generatedPoId = `PO-${yyyyMm}-${String(orderIndex).padStart(3, '0')}`;
      const existingSameId = purchaseOrders.some((p) => p.id === generatedPoId);
      const finalId = existingSameId ? `${generatedPoId}${uniqueSuffix}` : generatedPoId;

      savedPo = {
        id: finalId,
        poNumber: generatedPoId,
        date: orderForm.date,
        supplierId: orderForm.supplierId,
        supplierName: orderForm.supplierName,
        supplierAddress: orderForm.supplierAddress,
        supplierPhone: orderForm.supplierPhone,
        supplierLicenseNo: orderForm.supplierLicenseNo,
        spNumbers,
        status: 'Diproses',
        items: orderForm.items,
        notes: orderForm.notes,
        totalEstimatedCost: totalCost,
        branchId: currentBranch?.id || 'BR-01',
        petugas: userName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    await persistPurchaseOrder(savedPo);

    setIsOrderModalOpen(false);
    setCheckedMedicineIds(new Set());
    setActiveTab('orders');
    setPrintModalPo(savedPo);
  };

  // Change Qty in Order Form
  const handleUpdateItemQty = (index: number, newQtyBesar: number) => {
    const qty = Math.max(1, newQtyBesar);
    setOrderForm((prev) => {
      const updated = [...prev.items];
      const item = updated[index];
      const qtyKecil = qty * (item.rasioKonversi || 1);
      const subtotal = qty * item.estimatedHna;
      updated[index] = { ...item, qtyBesar: qty, qtyKecil, subtotal };
      return { ...prev, items: updated };
    });
  };

  const handleUpdateItemKet = (index: number, ket: string) => {
    setOrderForm((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], ket };
      return { ...prev, items: updated };
    });
  };

  const handleUpdateItemForm = (index: number, formValue: string) => {
    setOrderForm((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], form: formValue };
      return { ...prev, items: updated };
    });
  };

  // Remove Item from Order Form
  const handleRemoveOrderItem = (index: number) => {
    setOrderForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Add Item to Order Form
  const handleAddMedicineToOrder = (med: Medicine) => {
    const exists = orderForm.items.some((i) => i.medicineId === med.id);
    if (exists) {
      setOrderFormError(`Obat ${med.name} sudah ada dalam daftar pesanan.`);
      return;
    }

    const ratio = med.rasioKonversi || 10;
    const hna = med.hnaBesar || (med.hpp ? Math.round(med.hpp * ratio * 0.9) : 50000);

    const newItem: PurchaseOrderItem = {
      id: `ITEM-${Date.now()}-${orderForm.items.length}`,
      medicineId: med.id,
      name: med.name,
      category: med.category,
      nappza: med.nappza || 'Non-NAPPZA',
      spType: detectSPGroup(med),
      form: resolveMedicineForm(med.id, med.name, med.form),
      kekuatan: med.kekuatan || '',
      satuanBesar: med.satuanBesar || 'Box',
      satuanKecil: med.satuanKecil || med.unit || 'Strip',
      rasioKonversi: ratio,
      currentStock: med.stock,
      minStock: med.minStock,
      qtyBesar: 1,
      qtyKecil: ratio,
      estimatedHna: hna,
      subtotal: hna,
      ket: ''
    };

    setOrderFormError(null);
    setOrderForm((prev) => ({
      ...prev,
      items: [...prev.items, newItem]
    }));

    setIsMedicineSearchOpen(false);
    setMedicineSearchQuery('');
  };

  // Group items in Form by SP Group for preview
  const formSPGroups = useMemo(() => {
    const groups: Partial<Record<SPGroupType, PurchaseOrderItem[]>> = {};
    orderForm.items.forEach((item) => {
      if (!groups[item.spType]) groups[item.spType] = [];
      groups[item.spType]!.push(item);
    });
    return groups;
  }, [orderForm.items]);

  // Print SP Handler for a specific PO and category + update print log 2-way to Supabase
  const handlePrintSpecificSP = (po: PurchaseOrder, spType: SPGroupType | 'ALL') => {
    const isAll = spType === 'ALL';
    const filteredItems = isAll ? po.items : po.items.filter((it) => it.spType === spType);
    if (filteredItems.length === 0) {
      setSyncToast({
        type: 'warning',
        message: `Tidak ada obat dalam kelompok ${spType} pada pesanan ini.`
      });
      return;
    }

    const romanMonth = ROMAN_MONTHS[new Date(po.date).getMonth()] || 'I';
    const year = new Date(po.date).getFullYear() || new Date().getFullYear();
    const spNumber = isAll
      ? po.spNumbers?.REG
        ? po.spNumbers.REG.replace('/REG/', '/ALL/')
        : `ALF/ALL/${romanMonth}/${year}/001`
      : po.spNumbers[spType as SPGroupType] || generateSPNumber(spType as SPGroupType, 1, po.date);

    const spData = {
      spNumber,
      spType,
      supplierName: po.supplierName,
      supplierAddress: po.supplierAddress || '',
      supplierPhone: po.supplierPhone || '',
      orderDate: po.date,
      notes: po.notes || '',
      items: filteredItems.map((it) => ({
        id: it.id,
        medicineId: it.medicineId,
        name: it.name,
        category: it.category,
        nappza: it.nappza,
        kekuatan: it.kekuatan || '',
        form: it.form || (it.spType === 'ALK' ? '' : 'Tablet'),
        satuanBesar: it.satuanBesar || 'Box',
        satuanKecil: it.satuanKecil || 'Strip',
        rasioKonversi: it.rasioKonversi || 1,
        stock: it.currentStock,
        qtyBesar: it.qtyBesar,
        qtyKecil: it.qtyKecil,
        estimatedHna: it.estimatedHna,
        subtotal: it.subtotal,
        ket: it.ket || ''
      }))
    };

    try {
      demoSetItem('latisha_active_print_sp', JSON.stringify(spData));
    } catch (e) {
      console.warn('Storage error:', e);
    }

    // Record SP print log and sync 2-way to Supabase so Riwayat Surat Pesanan tracks print count & timestamp
    const existingLog = po.spPrintLogs?.[spType];
    const nextPrintLogs: Partial<Record<SPGroupType | 'ALL', SPPrintLogEntry>> = {
      ...(po.spPrintLogs || {}),
      [spType]: {
        printCount: (existingLog?.printCount || 0) + 1,
        lastPrintedAt: new Date().toISOString(),
        lastPrintedBy: userName
      }
    };
    const updatedPo: PurchaseOrder = {
      ...po,
      spPrintLogs: nextPrintLogs,
      updatedAt: new Date().toISOString()
    };
    void persistPurchaseOrder(updatedPo, { skipAudit: true });

    const serializedData = encodeURIComponent(JSON.stringify(spData));
    openPrintWindow('surat-pesanan', {
      poId: po.id,
      spType,
      supplier: po.supplierName,
      data: serializedData
    });
  };

  // Summary KPI Cards
  const totalDefectaCount = filteredDefecta.length;
  const criticalDefectaCount = filteredDefecta.filter((m) => m.stock === 0).length;
  const totalEstimatedReorder = filteredDefecta.reduce((sum, m) => sum + m.totalEstimasi, 0);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3 no-print">
        <div className="flex flex-wrap justify-between items-start gap-3">
          {/* div:nth-of-type(1) */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Buku Defecta, Pesanan Pembelian &amp; Riwayat Surat Pesanan (SP)
              </h3>
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
                  Supabase Live: {purchaseOrderTableInput}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Rekomendasi pesanan berbasis buffer stok minimum, pemilahan Surat Pesanan resmi BPOM, dan riwayat SP tersinkron 2-arah ke Supabase.
            </p>
          </div>

          {/* div:nth-of-type(2): button:nth-of-type(1) is Re-Order */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenReOrderForm()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              title="Buka Form Pesanan Pembelian (Re-Order)"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Re-Order</span>
              {checkedMedicineIds.size > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-white text-indigo-700 rounded-full text-[10px] font-black">
                  {checkedMedicineIds.size}
                </span>
              )}
            </button>

            {onSyncSupabase && (
              <button
                type="button"
                onClick={handleRunSupabaseSync}
                disabled={isSyncing}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
              </button>
            )}

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setShowSchemaModal(true)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Skema SQL</span>
              </button>
            )}
          </div>
        </div>

        {/* Submenu Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab('defecta')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer border ${
              activeTab === 'defecta'
                ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Rekomendasi Defecta ({totalDefectaCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer border ${
              activeTab === 'orders'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Pesanan Pembelian ({purchaseOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sp-history')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer border ${
              activeTab === 'sp-history'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Riwayat Surat Pesanan ({spHistoryEntries.length})</span>
          </button>
        </div>
      </div>

      {/* Demo Sandbox Notice */}
      {isDemoSandbox && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center gap-2.5 no-print">
          <Database className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Mode Demo / Sandbox Aktif:</strong> Pesanan pembelian &amp; riwayat Surat Pesanan tersimpan aman di penyimpanan lokal sandbox dan tidak mengubah database Supabase produksi.
          </span>
        </div>
      )}

      {/* Needs Table Setup Warning */}
      {!isDemoSandbox && needsTableSetup && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex flex-wrap items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Tabel Supabase <strong className="font-mono">{purchaseOrderTableInput}</strong> belum ditemukan atau RLS belum aktif. Data saat ini disimpan lokal.
            </span>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowSchemaModal(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-[11px] cursor-pointer"
            >
              Buka Skema SQL Supabase
            </button>
          )}
        </div>
      )}

      {/* Sync Toast Feedback */}
      {syncToast && (
        <div
          className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 no-print ${
            syncToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : syncToast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span className="font-semibold">{syncToast.message}</span>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Obat Defecta
            </span>
            <div className="text-xl font-black text-rose-600 mt-0.5">{totalDefectaCount} Item</div>
            <span className="text-[10px] text-slate-500 font-medium">Stok fisik ≤ batas minimum</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Stok Kosong (Kritis)
            </span>
            <div className="text-xl font-black text-orange-600 mt-0.5">{criticalDefectaCount} Item</div>
            <span className="text-[10px] text-slate-500 font-medium">Stok fisik tersisa 0 unit</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Estimasi Biaya Re-Order
            </span>
            <div className="text-xl font-black text-slate-900 mt-0.5">
              Rp {totalEstimatedReorder.toLocaleString('id-ID')}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Perkiraan HNA netto PBF</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {activeTab === 'sp-history' ? 'Total Arsip SP' : 'Produk Terpilih'}
            </span>
            <div className="text-xl font-black text-indigo-600 mt-0.5">
              {activeTab === 'sp-history'
                ? `${spHistoryEntries.length} Dokumen`
                : `${checkedMedicineIds.size} Obat`}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {activeTab === 'sp-history' ? 'Surat Pesanan terpilah BPOM' : 'Siap diproses Re-Order'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            {activeTab === 'sp-history' ? (
              <FileText className="w-5 h-5" />
            ) : (
              <CheckSquare className="w-5 h-5" />
            )}
          </div>
        </div>
      </div>

      {/* VIEW 1: REKOMENDASI DEFECTA */}
      {activeTab === 'defecta' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="flex items-center gap-1.5 flex-1 min-w-[220px] max-w-sm">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari obat defecta (Nama / Barcode)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDefectaScannerTarget('defecta')}
                  title="Scan Barcode Obat Defecta"
                  className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer transition"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Scan</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-600">Periode Pemakaian:</span>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value as any)}
                  className="p-2 border rounded-xl text-xs font-bold bg-white text-slate-800 outline-none"
                >
                  <option value="1bulan">1 Bulan (30 Hari)</option>
                  <option value="3bulan">3 Bulan (90 Hari)</option>
                  <option value="6bulan">6 Bulan (180 Hari)</option>
                  <option value="1tahun">1 Tahun (365 Hari)</option>
                </select>
              </div>

              <select
                value={selectedSupplierFilter}
                onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                className="p-2 border rounded-xl text-xs font-bold bg-white text-slate-800 outline-none"
              >
                <option value="SEMUA">Semua Supplier PBF</option>
                {defectaSuppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {checkedMedicineIds.size > 0 && (
                <button
                  onClick={() => handleOpenReOrderForm()}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Proses Re-Order ({checkedMedicineIds.size} Terpilih)</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">
                Formula Order = Pemakaian Rata-Rata ({selectedPeriod.replace('bulan', ' Bulan').replace('tahun', ' Tahun')}) + Buffer Stok 10% - Sisa Stok
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Menampilkan {filteredDefecta.length} obat defecta
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600 text-[10px]">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredDefecta.length > 0 && checkedMedicineIds.size === filteredDefecta.length}
                        onChange={handleToggleSelectAll}
                        className="rounded text-indigo-600 cursor-pointer w-4 h-4"
                        title="Pilih Semua"
                      />
                    </th>
                    <th className="p-3">Nama Obat &amp; Barcode</th>
                    <th className="p-3 text-center">Kelompok SP (BPOM)</th>
                    <th className="p-3">Kemasan &amp; Satuan</th>
                    <th className="p-3 text-center">Stok Fisik</th>
                    <th className="p-3 text-center">Batas Min</th>
                    <th className="p-3 text-center">Rata-rata Pemakaian</th>
                    <th className="p-3 text-center">Buffer 10%</th>
                    <th className="p-3 text-center bg-amber-50/70 text-amber-900">
                      Rekomendasi Order
                    </th>
                    <th className="p-3 text-right">Estimasi Biaya</th>
                    <th className="p-3">Supplier PBF</th>
                    <th className="p-3 text-center w-24">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {paginatedDefecta.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-10 text-center text-slate-400 italic">
                        Tidak ada produk defecta yang memerlukan re-order saat ini.
                      </td>
                    </tr>
                  ) : (
                    paginatedDefecta.map((item) => {
                      const isChecked = checkedMedicineIds.has(item.id);
                      const groupMeta = getSPGroupMeta(item.spType);

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50 transition-colors ${isChecked ? 'bg-indigo-50/40' : ''}`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleCheck(item.id)}
                              className="rounded text-indigo-600 cursor-pointer w-4 h-4"
                            />
                          </td>

                          <td className="p-3">
                            <strong className="text-slate-900 block">{item.name}</strong>
                            <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] text-slate-400">
                              <span>{item.barcode}</span>
                              {item.form && (
                                <span className="font-sans font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                  {item.form}
                                </span>
                              )}
                              {item.kekuatan && <span>· {item.kekuatan}</span>}
                            </div>
                          </td>

                          <td className="p-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border ${groupMeta.badgeClass}`}
                              title={groupMeta.title}
                            >
                              {groupMeta.code} ({groupMeta.label})
                            </span>
                          </td>

                          <td className="p-3 whitespace-nowrap">
                            <span className="font-bold text-slate-800">{item.satuanBesar}</span>
                            <span className="text-[10px] text-slate-400 block font-mono">
                              1 {item.satuanBesar} = {item.rasioKonversi} {item.satuanKecil || item.unit}
                            </span>
                          </td>

                          <td className="p-3 text-center font-mono font-black text-rose-600 whitespace-nowrap">
                            {item.stock} {item.unit}
                          </td>

                          <td className="p-3 text-center font-mono text-slate-500 whitespace-nowrap">
                            {item.minStock} {item.unit}
                          </td>

                          <td className="p-3 text-center font-mono text-slate-700 whitespace-nowrap">
                            {item.pemakaianPeriode} {item.unit}
                          </td>

                          <td className="p-3 text-center font-mono text-slate-500 whitespace-nowrap">
                            +{item.buffer10} {item.unit}
                          </td>

                          <td className="p-3 text-center font-mono bg-amber-50/50 whitespace-nowrap">
                            <strong className="text-sky-900 text-xs block">
                              +{item.rekomendasiBesar} {item.satuanBesar}
                            </strong>
                            <span className="text-[10px] text-slate-500">
                              ({item.rekomendasiKecil} {item.satuanKecil || item.unit})
                            </span>
                          </td>

                          <td className="p-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            Rp {item.totalEstimasi.toLocaleString('id-ID')}
                          </td>

                          <td className="p-3 text-slate-600 text-[11px] whitespace-nowrap">
                            {item.supplier || 'PT Kimia Farma Trading'}
                          </td>

                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleOpenReOrderForm(item)}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                              title="Buat Pesanan Re-Order khusus item ini"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Re-Order</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              currentPage={safeDefectaPage}
              totalPages={defectaTotalPages}
              totalCount={filteredDefecta.length}
              pageSize={defectaPageSize}
              onPageChange={setDefectaPage}
              onPageSizeChange={(sz) => {
                setDefectaPageSize(sz);
                setDefectaPage(1);
              }}
              itemLabel="item defecta"
            />
          </div>
        </div>
      )}

      {/* VIEW 2: PESANAN PEMBELIAN (RE-ORDER LIST) */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-3">
            <div>
              <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wide">
                Daftar Pesanan Pembelian &amp; Surat Pesanan (SP) Resmi
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Kelola pesanan pembelian, ubah status PO, edit rincian item, dan cetak Surat Pesanan (SP) terpilah per kelompok BPOM.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari No. PO / SP / Supplier..."
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white outline-none"
                />
              </div>
              <select
                value={ordersStatusFilter}
                onChange={(e) => setOrdersStatusFilter(e.target.value)}
                className="px-3 py-1.5 border rounded-xl text-xs font-bold bg-white text-slate-800 outline-none"
              >
                <option value="SEMUA">Semua Status</option>
                {PO_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleOpenReOrderForm()}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Pesanan Pembelian Baru</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600 text-[10px]">
                  <tr>
                    <th className="p-3 w-10 text-center">No</th>
                    <th className="p-3">No. PO &amp; Tanggal</th>
                    <th className="p-3">Supplier PBF</th>
                    <th className="p-3">Rincian Item</th>
                    <th className="p-3 text-center">Kelompok SP Terpilah</th>
                    <th className="p-3 text-right">Total Estimasi</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center w-48">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {paginatedPurchaseOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                        Belum ada pesanan pembelian yang sesuai filter. Klik tombol <strong>Re-Order</strong> untuk membuat pesanan baru.
                      </td>
                    </tr>
                  ) : (
                    paginatedPurchaseOrders.map((po, idx) => {
                      const spTypesInPo = Array.from(new Set(po.items.map((i) => i.spType)));

                      return (
                        <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-center font-mono text-slate-400">
                            {(safeOrdersPage - 1) * ordersPageSize + idx + 1}
                          </td>

                          <td className="p-3">
                            <strong className="font-mono text-slate-900 block">{po.poNumber}</strong>
                            <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {po.date}
                            </span>
                            {po.petugas && (
                              <span className="text-[10px] text-slate-400 block">
                                Petugas: {po.petugas}
                              </span>
                            )}
                          </td>

                          <td className="p-3">
                            <strong className="text-slate-900 block">{po.supplierName}</strong>
                            <span className="text-[10px] text-slate-400 block truncate max-w-[200px]">
                              {po.supplierAddress || 'Distributor Resmi'}
                            </span>
                          </td>

                          <td className="p-3">
                            <span className="font-bold text-slate-800">{po.items.length} Macam Obat</span>
                            <span className="text-[10px] text-slate-500 block truncate max-w-[240px]">
                              {po.items
                                .map(
                                  (it) =>
                                    `${it.name}${it.form ? ` [${it.form}]` : ''} (${it.qtyBesar} ${it.satuanBesar})`
                                )
                                .join(', ')}
                            </span>
                          </td>

                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {spTypesInPo.map((type) => {
                                const meta = getSPGroupMeta(type);
                                return (
                                  <span
                                    key={type}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${meta.badgeClass}`}
                                    title={po.spNumbers[type] || meta.title}
                                  >
                                    {type}
                                  </span>
                                );
                              })}
                            </div>
                            <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                              {spTypesInPo.length} Dokumen SP
                            </span>
                          </td>

                          <td className="p-3 text-right font-mono font-black text-slate-900">
                            Rp {po.totalEstimatedCost.toLocaleString('id-ID')}
                          </td>

                          <td className="p-3 text-center whitespace-nowrap">
                            <select
                              value={po.status}
                              onChange={(e) =>
                                handleChangeOrderStatus(po, e.target.value as PurchaseOrder['status'])
                              }
                              className={`px-2 py-1 rounded-full text-[10px] font-black border cursor-pointer outline-none ${getStatusBadgeClass(
                                po.status
                              )}`}
                            >
                              {PO_STATUS_OPTIONS.map((st) => (
                                <option key={st} value={st} className="bg-white text-slate-900">
                                  {st}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1 justify-center">
                              <button
                                onClick={() => setPrintModalPo(po)}
                                className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition inline-flex items-center gap-1 font-bold text-[10px] cursor-pointer"
                                title="Cetak Surat Pesanan (SP)"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Cetak SP</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSendPoViaWhatsapp(po)}
                                disabled={sendingWaPoId === po.id}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg transition cursor-pointer disabled:opacity-60 inline-flex items-center justify-center"
                                title="Kirim PDF Pesanan Pembelian ke PBF via WhatsApp"
                                aria-label="Kirim PDF Pesanan Pembelian ke PBF via WhatsApp"
                              >
                                {sendingWaPoId === po.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  >
                                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.98 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67ZM8.53 7.33C8.37 7.33 8.1 7.39 7.87 7.64C7.65 7.89 7 8.5 7 9.71C7 10.93 7.89 12.1 8 12.27C8.14 12.44 9.76 14.94 12.25 16C12.84 16.27 13.3 16.42 13.66 16.53C14.25 16.72 14.79 16.69 15.22 16.63C15.7 16.56 16.68 16.03 16.89 15.45C17.1 14.87 17.1 14.38 17.04 14.27C16.97 14.17 16.81 14.11 16.56 13.98C16.31 13.86 15.09 13.26 14.87 13.18C14.64 13.1 14.5 13.06 14.31 13.3C14.15 13.55 13.67 14.11 13.53 14.27C13.38 14.44 13.24 14.46 13 14.34C12.74 14.21 11.94 13.95 11 13.11C10.26 12.45 9.77 11.64 9.62 11.39C9.5 11.15 9.61 11 9.73 10.89C9.84 10.78 10 10.6 10.1 10.45C10.23 10.31 10.27 10.2 10.35 10.04C10.43 9.87 10.39 9.73 10.33 9.61C10.27 9.5 9.77 8.26 9.56 7.77C9.36 7.29 9.16 7.35 9 7.34C8.86 7.34 8.7 7.33 8.53 7.33Z" />
                                  </svg>
                                )}
                              </button>

                              <button
                                onClick={() => handleOpenEditOrder(po)}
                                className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg transition cursor-pointer"
                                title="Edit Pesanan Pembelian"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() =>
                                  setConfirmDeleteTarget({
                                    po,
                                    isPartialSp: false
                                  })
                                }
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition cursor-pointer"
                                title="Hapus Pesanan Pembelian"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
            <PaginationControls
              currentPage={safeOrdersPage}
              totalPages={ordersTotalPages}
              totalCount={filteredPurchaseOrders.length}
              pageSize={ordersPageSize}
              onPageChange={setOrdersPage}
              onPageSizeChange={(sz) => {
                setOrdersPageSize(sz);
                setOrdersPage(1);
              }}
              itemLabel="pesanan pembelian"
            />
          </div>
        </div>
      )}

      {/* VIEW 3: RIWAYAT SURAT PESANAN (BPOM & SUPABASE 2-ARAH) */}
      {activeTab === 'sp-history' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <History className="w-4 h-4 text-emerald-600" />
                  Arsip &amp; Riwayat Surat Pesanan (SP) Resmi BPOM
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Log dokumen SP resmi yang terbit per kelompok regulasi (REG, ALK, PRE, OOT, PSI, NAR), lengkap dengan riwayat cetak, status pengiriman PBF, dan sinkronisasi Supabase dua arah.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold">
                  Terfilter: {filteredSpHistory.length} Dokumen SP
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                  SP Khusus (NAR/PSI/PRE/OOT): {spSpecialCount}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                  Sudah Dicetak: {spPrintedCount}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold font-mono">
                  Est. Total: Rp {spTotalCost.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100">
              <div className="relative lg:col-span-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari No. SP, No. PO, PBF, Obat, Petugas..."
                  value={spSearch}
                  onChange={(e) => setSpSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white outline-none"
                />
              </div>

              <div className="relative">
                <Filter className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                <select
                  value={spTypeFilter}
                  onChange={(e) => setSpTypeFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border rounded-xl text-xs font-bold bg-white text-slate-800 outline-none"
                >
                  <option value="SEMUA">Semua Jenis SP</option>
                  <option value="REG">SP Reguler (REG)</option>
                  <option value="ALK">SP Alkes &amp; BMHP (ALK)</option>
                  <option value="PRE">SP Prekursor (PRE)</option>
                  <option value="OOT">SP OOT (OOT)</option>
                  <option value="PSI">SP Psikotropika (PSI)</option>
                  <option value="NAR">SP Narkotika (NAR)</option>
                  <option value="ALL">SP Gabungan (ALL)</option>
                </select>
              </div>

              <div>
                <select
                  value={spStatusFilter}
                  onChange={(e) => setSpStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white text-slate-800 outline-none"
                >
                  <option value="SEMUA">Semua Status SP</option>
                  {PO_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={spStartDate}
                  onChange={(e) => setSpStartDate(e.target.value)}
                  title="Tanggal Mulai"
                  className="w-full px-2 py-2 border rounded-xl text-[11px] font-mono font-bold bg-white outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={spEndDate}
                  onChange={(e) => setSpEndDate(e.target.value)}
                  title="Tanggal Akhir"
                  className="w-full px-2 py-2 border rounded-xl text-[11px] font-mono font-bold bg-white outline-none"
                />
                {(spSearch || spTypeFilter !== 'SEMUA' || spStatusFilter !== 'SEMUA' || spStartDate || spEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSpSearch('');
                      setSpTypeFilter('SEMUA');
                      setSpStatusFilter('SEMUA');
                      setSpStartDate('');
                      setSpEndDate('');
                    }}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer shrink-0"
                    title="Reset Filter Riwayat SP"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Riwayat Surat Pesanan Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600 text-[10px]">
                  <tr>
                    <th className="p-3 w-10 text-center">No</th>
                    <th className="p-3">Nomor SP &amp; Tanggal</th>
                    <th className="p-3 text-center">Kelompok SP</th>
                    <th className="p-3">Supplier / PBF</th>
                    <th className="p-3">Rincian Item Obat</th>
                    <th className="p-3 text-right">Estimasi Nilai</th>
                    <th className="p-3">Log Cetak</th>
                    <th className="p-3 text-center">Status SP</th>
                    <th className="p-3 text-center w-44">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {paginatedSpHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-10 text-center text-slate-400 italic">
                        Belum ada riwayat Surat Pesanan yang tercatat. Buat pesanan dari tab{' '}
                        <strong>Rekomendasi Defecta</strong> atau klik <strong>Re-Order</strong>.
                      </td>
                    </tr>
                  ) : (
                    paginatedSpHistory.map((entry, idx) => {
                      const meta = getSPGroupMeta(entry.spType);
                      const isExpanded = expandedSpKey === entry.key;

                      return (
                        <React.Fragment key={entry.key}>
                          <tr className="hover:bg-slate-50/90 transition-colors">
                            <td className="p-3 text-center font-mono text-slate-400">
                              {(safeSpPage - 1) * spPageSize + idx + 1}
                            </td>

                            <td className="p-3 whitespace-nowrap">
                              <strong className="font-mono text-slate-900 block">
                                {entry.spNumber}
                              </strong>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 font-mono">
                                <span>PO: {entry.po.poNumber}</span>
                                <span>·</span>
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  {entry.po.date}
                                </span>
                              </div>
                              {entry.po.petugas && (
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  Oleh: {entry.po.petugas}
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border ${meta.badgeClass}`}
                                title={meta.title}
                              >
                                {meta.code} · {meta.label}
                              </span>
                            </td>

                            <td className="p-3">
                              <strong className="text-slate-900 block">{entry.po.supplierName}</strong>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[200px]">
                                {entry.po.supplierLicenseNo
                                  ? `Izin: ${entry.po.supplierLicenseNo}`
                                  : entry.po.supplierAddress || 'Distributor Resmi PBF'}
                              </span>
                            </td>

                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-800">
                                  {entry.items.length} Item ({entry.totalQtyBesar} Kemasan)
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedSpKey(isExpanded ? null : entry.key)
                                  }
                                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer"
                                >
                                  <span>{isExpanded ? 'Tutup' : 'Detail'}</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                              <span className="text-[10px] text-slate-500 block truncate max-w-[240px] mt-0.5">
                                {entry.items
                                  .map((it) => `${it.name} (${it.qtyBesar} ${it.satuanBesar})`)
                                  .join(', ')}
                              </span>
                            </td>

                            <td className="p-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              Rp {entry.totalEstimatedCost.toLocaleString('id-ID')}
                            </td>

                            <td className="p-3 whitespace-nowrap">
                              {entry.printLog && entry.printLog.printCount > 0 ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Printer className="w-3 h-3" />
                                    Dicetak {entry.printLog.printCount}x
                                  </span>
                                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatTimestampShort(entry.printLog.lastPrintedAt)}
                                  </span>
                                  {entry.printLog.lastPrintedBy && (
                                    <span className="text-[10px] text-slate-400 block">
                                      Pencetak: {entry.printLog.lastPrintedBy}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                                  Belum Dicetak
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-center whitespace-nowrap">
                              <select
                                value={entry.po.status}
                                onChange={(e) =>
                                  handleChangeOrderStatus(
                                    entry.po,
                                    e.target.value as PurchaseOrder['status']
                                  )
                                }
                                className={`px-2 py-1 rounded-full text-[10px] font-black border cursor-pointer outline-none ${getStatusBadgeClass(
                                  entry.po.status
                                )}`}
                              >
                                {PO_STATUS_OPTIONS.map((st) => (
                                  <option key={st} value={st} className="bg-white text-slate-900">
                                    {st}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-3 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1 justify-center">
                                <button
                                  type="button"
                                  onClick={() => handlePrintSpecificSP(entry.po, entry.spType)}
                                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition inline-flex items-center gap-1 font-bold text-[10px] cursor-pointer shadow-xs"
                                  title={`Cetak ulang ${entry.spNumber}`}
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  <span>Cetak SP</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEditOrder(entry.po)}
                                  className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg transition cursor-pointer"
                                  title="Edit PO Terkait"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDeleteTarget({
                                      po: entry.po,
                                      spType: entry.spType,
                                      spNumber: entry.spNumber,
                                      isPartialSp:
                                        entry.spType !== 'ALL' && entry.groupCountInPo > 1
                                    })
                                  }
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition cursor-pointer"
                                  title="Hapus Surat Pesanan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={9} className="p-4 border-t border-slate-200">
                                <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                    <strong className="text-slate-800">
                                      Rincian Item Surat Pesanan {entry.spNumber} ({meta.title})
                                    </strong>
                                    {entry.po.notes && (
                                      <span className="text-slate-500 italic">
                                        Catatan PO: {entry.po.notes}
                                      </span>
                                    )}
                                  </div>
                                  <table className="w-full text-left text-[11px] border-collapse">
                                    <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                                      <tr>
                                        <th className="p-2 w-8 text-center">No</th>
                                        <th className="p-2">Nama Obat / Alkes</th>
                                        <th className="p-2">Bentuk &amp; Kemasan</th>
                                        <th className="p-2 text-center">Jumlah Pesan</th>
                                        <th className="p-2 text-right">Est. HNA</th>
                                        <th className="p-2 text-right">Subtotal</th>
                                        <th className="p-2">Ket</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {entry.items.map((it, i) => (
                                        <tr key={it.id || i}>
                                          <td className="p-2 text-center font-mono text-slate-400">
                                            {i + 1}
                                          </td>
                                          <td className="p-2 font-bold text-slate-800">
                                            {it.name}
                                            {entry.spType !== 'REG' &&
                                              entry.spType !== 'ALK' &&
                                              it.kekuatan && (
                                                <span className="ml-1 text-[10px] font-normal text-slate-500">
                                                  ({it.kekuatan})
                                                </span>
                                              )}
                                          </td>
                                          <td className="p-2 text-slate-600">
                                            {it.form ? `${it.form} · ` : ''}
                                            {it.satuanBesar} @ {it.rasioKonversi} {it.satuanKecil}
                                          </td>
                                          <td className="p-2 text-center font-mono font-bold text-indigo-800">
                                            {it.qtyBesar} {it.satuanBesar} ({it.qtyKecil}{' '}
                                            {it.satuanKecil})
                                          </td>
                                          <td className="p-2 text-right font-mono">
                                            Rp {(Number(it.estimatedHna) || 0).toLocaleString('id-ID')}
                                          </td>
                                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                                            Rp {(Number(it.subtotal) || 0).toLocaleString('id-ID')}
                                          </td>
                                          <td className="p-2 text-slate-500 italic">
                                            {it.ket || '-'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={safeSpPage}
              totalPages={spTotalPages}
              totalCount={filteredSpHistory.length}
              pageSize={spPageSize}
              onPageChange={setSpPage}
              onPageSizeChange={(sz) => {
                setSpPageSize(sz);
                setSpPage(1);
              }}
              itemLabel="surat pesanan"
            />
          </div>
        </div>
      )}

      {/* MODAL: FORM RE-ORDER / PESANAN PEMBELIAN */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden border border-slate-200 my-6">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-sm uppercase tracking-wide">
                  {editingOrderId ? 'Edit Pesanan Pembelian (Re-Order)' : 'Form Pesanan Pembelian Baru (Re-Order)'}
                </h3>
              </div>
              <button onClick={() => setIsOrderModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOrder} className="p-6 space-y-4 text-xs max-h-[82vh] overflow-y-auto custom-scrollbar">
              {orderFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{orderFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="relative sm:col-span-2" ref={supplierRef}>
                  <label className="block font-bold text-slate-700 mb-1">
                    Pilih Supplier / PBF *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="Ketik untuk mencari Supplier / PBF..."
                      value={supplierSearch}
                      onChange={(e) => {
                        setSupplierSearch(e.target.value);
                        setIsSupplierDropdownOpen(true);
                        setOrderForm((prev) => ({ ...prev, supplierName: e.target.value }));
                      }}
                      onFocus={() => setIsSupplierDropdownOpen(true)}
                      className="w-full p-2.5 border rounded-xl font-bold bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>

                  {isSupplierDropdownOpen && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                      {filteredSuppliers.length === 0 ? (
                        <div className="p-3 text-slate-400 text-xs italic">
                          Tidak ditemukan supplier. Anda dapat menggunakan nama &quot;{supplierSearch}&quot; sebagai nama supplier baru.
                        </div>
                      ) : (
                        filteredSuppliers.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => {
                              setOrderForm((prev) => ({
                                ...prev,
                                supplierId: s.id,
                                supplierName: s.name,
                                supplierAddress: s.address,
                                supplierPhone: s.phone,
                                supplierLicenseNo: s.licenseNo || ''
                              }));
                              setSupplierSearch(s.name);
                              setIsSupplierDropdownOpen(false);
                            }}
                            className="p-2.5 hover:bg-slate-50 border-b border-slate-100 cursor-pointer transition flex items-center justify-between"
                          >
                            <div>
                              <strong className="text-slate-900 block text-xs">{s.name}</strong>
                              <span className="text-[10px] text-slate-500 block truncate">{s.address}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{s.phone}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {orderForm.supplierAddress && (
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Alamat: {orderForm.supplierAddress} · Kontak: {orderForm.supplierPhone}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Pesanan *</label>
                  <input
                    type="date"
                    required
                    value={orderForm.date}
                    onChange={(e) => setOrderForm({ ...orderForm, date: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-black text-slate-800 text-xs uppercase tracking-wide">
                    Daftar Produk Pesanan Pembelian ({orderForm.items.length} Item)
                  </span>

                  <button
                    type="button"
                    onClick={() => setIsMedicineSearchOpen(true)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Obat Lain</span>
                  </button>
                </div>

                <datalist id="poBentukSediaanList">
                  {Array.from(
                    new Set([
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
                      'Alat Kesehatan',
                      ...medicines.map((m) => m.form).filter((f): f is string => Boolean(f && f.trim()))
                    ])
                  )
                    .sort()
                    .map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                </datalist>

                <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-700">
                      <tr>
                        <th className="p-2.5 w-8 text-center">No</th>
                        <th className="p-2.5">Nama Obat</th>
                        <th className="p-2.5 text-center whitespace-nowrap">Bentuk Sediaan</th>
                        <th className="p-2.5 text-center">Kelompok SP</th>
                        <th className="p-2.5 text-center">Stok Sisa</th>
                        <th className="p-2.5 text-center w-28 bg-amber-50 text-amber-900">Qty Pesan (Besar)</th>
                        <th className="p-2.5 text-center">Total Satuan</th>
                        <th className="p-2.5">Ket (Opsional)</th>
                        <th className="p-2.5 text-right">Estimasi HNA</th>
                        <th className="p-2.5 text-right">Subtotal</th>
                        <th className="p-2.5 text-center w-12">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {orderForm.items.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-6 text-center text-slate-400 italic">
                            Belum ada obat dalam pesanan ini. Klik &quot;Tambah Obat Lain&quot; untuk memilih obat.
                          </td>
                        </tr>
                      ) : (
                        orderForm.items.map((it, idx) => {
                          const meta = getSPGroupMeta(it.spType);

                          return (
                            <tr key={it.id || idx} className="hover:bg-slate-50">
                              <td className="p-2.5 text-center font-mono text-slate-400">{idx + 1}</td>

                              <td className="p-2.5">
                                <strong className="text-slate-900 block">{it.name}</strong>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {it.kekuatan ? `${it.kekuatan} · ` : ''}({it.satuanBesar} isi {it.rasioKonversi} {it.satuanKecil})
                                </span>
                              </td>

                              <td className="p-2.5 text-center whitespace-nowrap">
                                <input
                                  type="text"
                                  list="poBentukSediaanList"
                                  value={it.form || ''}
                                  placeholder="Tablet"
                                  onChange={(e) => handleUpdateItemForm(idx, e.target.value)}
                                  title="Bentuk sediaan tersinkron dari Master Obat (dapat disesuaikan)"
                                  className="w-24 px-2 py-1 text-center text-[11px] font-bold text-indigo-800 bg-indigo-50/70 border border-indigo-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                                />
                              </td>

                              <td className="p-2.5 text-center whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${meta.badgeClass}`}>
                                  {meta.code}
                                </span>
                              </td>

                              <td className="p-2.5 text-center font-mono text-rose-600 font-bold whitespace-nowrap">
                                {it.currentStock} {it.satuanKecil}
                              </td>

                              <td className="p-2.5 text-center bg-amber-50/50 whitespace-nowrap">
                                <div className="inline-flex items-center gap-1 justify-center">
                                  <input
                                    type="number"
                                    min={1}
                                    value={it.qtyBesar}
                                    onChange={(e) => handleUpdateItemQty(idx, parseInt(e.target.value, 10) || 1)}
                                    className="w-16 p-1 text-center font-mono font-black border rounded-lg bg-white text-indigo-900 focus:ring-1 focus:ring-indigo-500 outline-none"
                                  />
                                  <span className="text-[10px] font-bold text-slate-600">{it.satuanBesar}</span>
                                </div>
                              </td>

                              <td className="p-2.5 text-center font-mono font-semibold text-slate-700 whitespace-nowrap">
                                {it.qtyKecil} {it.satuanKecil}
                              </td>

                              <td className="p-2.5">
                                <input
                                  type="text"
                                  placeholder="Terbilang / Catatan item..."
                                  value={it.ket || ''}
                                  onChange={(e) => handleUpdateItemKet(idx, e.target.value)}
                                  className="w-32 px-2 py-1 border rounded-lg text-[11px] bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </td>

                              <td className="p-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
                                Rp {it.estimatedHna.toLocaleString('id-ID')}
                              </td>

                              <td className="p-2.5 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                                Rp {it.subtotal.toLocaleString('id-ID')}
                              </td>

                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOrderItem(idx)}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition cursor-pointer"
                                  title="Hapus dari pesanan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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

              <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-black text-indigo-950 text-xs flex items-center gap-1.5 uppercase tracking-wide">
                    <ShieldAlert className="w-4 h-4 text-indigo-600" />
                    Analisis &amp; Pemilahan Surat Pesanan Otomatis (Standar BPOM)
                  </span>
                  <span className="text-[10px] font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-full border border-indigo-200">
                    Format No: ALF/jenis SP/BLN/THN/No. Urut
                  </span>
                </div>

                <p className="text-[11px] text-indigo-900/80">
                  Sistem menganalisis data master obat dan secara otomatis memilah pesanan ke dalam kelompok Surat Pesanan resmi yang terpisah sesuai regulasi BPOM RI:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(['REG', 'ALK', 'PRE', 'OOT', 'PSI', 'NAR'] as SPGroupType[]).map((type) => {
                    const items = formSPGroups[type] || [];
                    const meta = getSPGroupMeta(type);
                    const d = new Date(orderForm.date);
                    const validD = isNaN(d.getTime()) ? new Date() : d;
                    const currentMonthRoman = ROMAN_MONTHS[validD.getMonth()] || 'I';
                    const currentYear = validD.getFullYear();
                    const previewSpNumber = `ALF/${type}/${currentMonthRoman}/${currentYear}/${String(purchaseOrders.length + 1).padStart(3, '0')}`;

                    if (items.length === 0) return null;

                    return (
                      <div key={type} className="p-2.5 bg-white border border-indigo-200 rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${meta.badgeClass}`}>
                            {type} ({meta.label})
                          </span>
                          <span className="text-[10px] font-bold text-indigo-900">{items.length} Obat</span>
                        </div>
                        <div className="text-[10px] font-mono font-bold text-slate-800 truncate" title={previewSpNumber}>
                          {previewSpNumber}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Tambahan Pesanan</label>
                <textarea
                  rows={2}
                  value={orderForm.notes}
                  onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                  placeholder="Catatan pesanan, instruksi khusus pengiriman, dsb..."
                  className="w-full p-2.5 border rounded-xl font-medium bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                />
              </div>

              <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t sticky bottom-0 bg-white py-2">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Perkiraan Biaya:</span>
                  <strong className="text-base font-black text-indigo-950 font-mono">
                    Rp {orderForm.items.reduce((s, it) => s + it.subtotal, 0).toLocaleString('id-ID')}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsOrderModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md uppercase tracking-wider text-xs cursor-pointer"
                  >
                    {editingOrderId ? 'Simpan Perubahan Pesanan' : 'Proses & Simpan Pesanan Pembelian'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CARI OBAT UNTUK DITAMBAHKAN KE PESANAN */}
      {isMedicineSearchOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex justify-between items-center">
              <h4 className="font-bold text-xs">Pilih Obat dari Master Data</h4>
              <button onClick={() => setIsMedicineSearchOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Ketik nama obat / bentuk sediaan / kategori / barcode..."
                    value={medicineSearchQuery}
                    onChange={(e) => setMedicineSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && medicineSearchQuery.trim()) {
                        const q = medicineSearchQuery.trim().toLowerCase();
                        const exact = medicines.find(
                          (m) =>
                            (m.barcode && m.barcode.trim().toLowerCase() === q) ||
                            m.id.trim().toLowerCase() === q
                        );
                        if (exact) {
                          e.preventDefault();
                          playBarcodeBeep();
                          handleAddMedicineToOrder(exact);
                        }
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white outline-none"
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDefectaScannerTarget('poModal')}
                  title="Scan Barcode untuk Tambah ke PO"
                  className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer transition"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Scan</span>
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
                {medicines
                  .filter((m) => {
                    const q = medicineSearchQuery.toLowerCase();
                    return (
                      !q ||
                      m.name.toLowerCase().includes(q) ||
                      (m.form && m.form.toLowerCase().includes(q)) ||
                      (m.barcode && m.barcode.toLowerCase().includes(q)) ||
                      m.id.toLowerCase().includes(q) ||
                      m.category.toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 15)
                  .map((med) => {
                    const spType = detectSPGroup(med);
                    const meta = getSPGroupMeta(spType);

                    return (
                      <div
                        key={med.id}
                        onClick={() => handleAddMedicineToOrder(med)}
                        className="p-2.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer transition"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <strong className="text-slate-900">{med.name}</strong>
                            <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                              {med.form || 'Tablet'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Stok: {med.stock} {med.unit} · {med.satuanBesar} isi {med.rasioKonversi} {med.satuanKecil}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${meta.badgeClass}`}>
                          {meta.code}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CETAK SP RESMI TERPILAH PER KELOMPOK BPOM */}
      {printModalPo && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 my-6">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-400" />
                <div>
                  <h4 className="font-extrabold text-sm uppercase tracking-wide">
                    Cetak Surat Pesanan (SP) Resmi BPOM
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    Pesanan #{printModalPo.poNumber} · {printModalPo.items.length} Macam Obat
                  </span>
                </div>
              </div>
              <button onClick={() => setPrintModalPo(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs max-h-[82vh] overflow-y-auto custom-scrollbar">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap justify-between items-center gap-2">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Tujuan Pemesanan PBF:
                  </span>
                  <strong className="text-sm font-black text-slate-900 block">{printModalPo.supplierName}</strong>
                  <span className="text-[11px] text-slate-500">{printModalPo.supplierAddress || 'Distributor Resmi Farmasi'}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Tanggal Pesanan:
                  </span>
                  <strong className="text-xs font-mono font-bold text-slate-800">{printModalPo.date}</strong>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-800 mb-2">
                  Pilih Dokumen Surat Pesanan yang Ingin Dicetak:
                </p>

                <div className="space-y-3">
                  <div className="p-3.5 border-2 border-indigo-500 bg-indigo-50/40 rounded-2xl shadow-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-600 text-white">
                          SEMUA OBAT
                        </span>
                        <div>
                          <strong className="text-slate-900 text-xs">Cetak Seluruh Pesanan Pembelian</strong>
                          <span className="text-[10px] text-slate-500 block">
                            Memuat seluruh {printModalPo.items.length} macam obat yang diinput
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          handlePrintSpecificSP(printModalPo, 'ALL');
                          setPrintModalPo(null);
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Cetak Seluruh Obat</span>
                      </button>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100 max-h-36 overflow-y-auto">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Daftar Obat yang Dicetak:
                      </div>
                      <div className="divide-y divide-slate-100 font-medium">
                        {printModalPo.items.map((it, i) => (
                          <div key={it.id || i} className="py-1 flex items-center justify-between text-[11px]">
                            <span>
                              <strong className="text-slate-900">{it.name}</strong> {it.kekuatan && `(${it.kekuatan})`}
                            </span>
                            <span className="font-mono font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded">
                              {it.qtyBesar} {it.satuanBesar} ({it.qtyKecil} {it.satuanKecil})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                      Atau Cetak Surat Pesanan Khusus Terpilah (Aturan Regulasi BPOM):
                    </span>

                    <div className="space-y-2.5">
                      {(Array.from(new Set(printModalPo.items.map((i) => i.spType))) as SPGroupType[]).map((type) => {
                        const meta = getSPGroupMeta(type);
                        const itemsInGroup = printModalPo.items.filter((i) => i.spType === type);
                        const spNumber =
                          printModalPo.spNumbers[type] || generateSPNumber(type, 1, printModalPo.date);

                        return (
                          <div
                            key={type}
                            className="p-3 border border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-slate-50 transition space-y-2 bg-white"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${meta.badgeClass}`}>
                                    {type}
                                  </span>
                                  <strong className="text-slate-900 text-xs">{meta.title}</strong>
                                </div>
                                <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                                  No. SP: <strong>{spNumber}</strong> ({itemsInGroup.length} Item Obat)
                                </p>
                              </div>

                              <button
                                onClick={() => {
                                  handlePrintSpecificSP(printModalPo, type);
                                  setPrintModalPo(null);
                                }}
                                className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                              >
                                <Printer className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Cetak SP {type}</span>
                              </button>
                            </div>

                            <div className="bg-slate-50 p-2 rounded-xl text-[10px] text-slate-600 flex flex-wrap gap-2">
                              {itemsInGroup.map((it) => (
                                <span key={it.id} className="bg-white px-2 py-0.5 rounded border border-slate-200 font-medium">
                                  {it.name}: <strong>{it.qtyBesar} {it.satuanBesar}</strong>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => setPrintModalPo(null)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: KONFIRMASI HAPUS PO / SURAT PESANAN */}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">
                  {confirmDeleteTarget.isPartialSp
                    ? `Hapus Surat Pesanan (${confirmDeleteTarget.spType})`
                    : 'Hapus Pesanan Pembelian'}
                </h3>
                <p className="text-xs text-slate-500">
                  {confirmDeleteTarget.spNumber || confirmDeleteTarget.po.poNumber}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              {confirmDeleteTarget.isPartialSp ? (
                <>
                  Apakah Anda yakin ingin menghapus kelompok{' '}
                  <strong>SP {confirmDeleteTarget.spType}</strong> ({confirmDeleteTarget.spNumber}) dari PO{' '}
                  <strong>#{confirmDeleteTarget.po.poNumber}</strong>? Item obat kelompok SP lain pada PO yang sama tetap dipertahankan.
                </>
              ) : (
                <>
                  Apakah Anda yakin ingin menghapus pesanan pembelian{' '}
                  <strong>#{confirmDeleteTarget.po.poNumber}</strong> ({confirmDeleteTarget.po.supplierName}) beserta seluruh riwayat Surat Pesanannya?
                </>
              )}{' '}
              {!isDemoSandbox && (
                <span>Perubahan ini akan disinkronkan 2-arah ke tabel Supabase.</span>
              )}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteTarget}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-extrabold rounded-xl text-xs shadow-md cursor-pointer"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SKEMA SQL SUPABASE SURAT PESANAN (APJ / OWNER ONLY) */}
      {isSuperAdmin && showSchemaModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  Skema SQL Supabase — Defecta, PO &amp; Riwayat Surat Pesanan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tabel <strong className="font-mono">{purchaseOrderTableInput}</strong> untuk sinkronisasi Pesanan Pembelian dan Riwayat Surat Pesanan (SP) BPOM secara 2-arah &amp; real-time.
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
                    Nama Tabel Surat Pesanan di Supabase
                  </label>
                  <input
                    type="text"
                    value={purchaseOrderTableInput}
                    onChange={(e) => setPurchaseOrderTableInput(e.target.value)}
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
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
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
                  {SUPABASE_PURCHASE_ORDER_SQL_SCHEMA}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRATINJAU PDF PESANAN PEMBELIAN SEBELUM KIRIM WHATSAPP KE PBF */}
      {waPreviewModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 no-print">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header Modal */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-2xl bg-emerald-500/20 text-emerald-400 shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-sm sm:text-base tracking-wide truncate">
                    Pratinjau PDF Pesanan Pembelian — {waPreviewModal.po.poNumber}
                  </h3>
                  <p className="text-[11px] text-slate-300 truncate">
                    Pastikan seluruh item, jumlah, dan kontak PBF sesuai sebelum mengirim ke WhatsApp.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseWaPreviewModal}
                disabled={isSendingWaPreview}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl transition cursor-pointer disabled:opacity-50"
                title="Tutup Pratinjau"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body: Kiri Pratinjau PDF / Ringkasan, Kanan Detail Tujuan & Pesan WhatsApp */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50 grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Panel Kiri: Pratinjau Dokumen PDF */}
              <div className="lg:col-span-7 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-3.5 py-2.5 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setWaPreviewTab('pdf')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        waPreviewTab === 'pdf'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pratinjau PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setWaPreviewTab('summary')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        waPreviewTab === 'summary'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Ringkasan Tabel ({waPreviewModal.filteredItems.length} Item)
                    </button>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500 truncate max-w-[220px]">
                    {waPreviewModal.fileName}
                  </span>
                </div>

                {/* Pemilih Kelompok SP untuk PDF */}
                <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 mr-1">
                      Filter SP PDF:
                    </span>
                    {waPreviewModal.availableSpGroups.map((spType) => {
                      const isSelected = waPreviewModal.selectedSpGroups.includes(spType);
                      const countInGroup = waPreviewModal.po.items.filter(
                        (it) => it.spType === spType
                      ).length;
                      const meta = getSPGroupMeta(spType);
                      const spNumber = waPreviewModal.po.spNumbers?.[spType] || '-';

                      return (
                        <button
                          key={spType}
                          type="button"
                          onClick={() => handleToggleWaSpGroup(spType)}
                          title={`${meta.title} · No. SP: ${spNumber}`}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition inline-flex items-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <span>{spType}</span>
                          <span
                            className={`px-1 rounded text-[9px] font-mono ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {countInGroup}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {waPreviewModal.availableSpGroups.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      {waPreviewModal.selectedSpGroups.length <
                      waPreviewModal.availableSpGroups.length ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateWaSpSelection(waPreviewModal.availableSpGroups)
                          }
                          className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer"
                        >
                          Pilih Semua SP
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateWaSpSelection([waPreviewModal.availableSpGroups[0]])
                          }
                          className="text-[10px] font-bold text-slate-600 hover:underline cursor-pointer"
                        >
                          SP Utama Saja
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {waPreviewTab === 'pdf' ? (
                  <div className="flex-1 min-h-[420px] sm:min-h-[520px] bg-slate-200/70">
                    <iframe
                      src={waPreviewModal.previewUrl}
                      title={`Pratinjau PDF ${waPreviewModal.po.poNumber}`}
                      className="w-full h-[460px] sm:h-[540px] border-0 bg-white"
                    />
                  </div>
                ) : (
                  <div className="p-4 space-y-3 max-h-[540px] overflow-y-auto text-xs">
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Nomor PO &amp; Tanggal
                        </span>
                        <strong className="font-mono text-slate-900 block">
                          {waPreviewModal.po.poNumber}
                        </strong>
                        <span className="text-[11px] text-slate-600">{waPreviewModal.po.date}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          PBF Tujuan
                        </span>
                        <strong className="text-slate-900 block">
                          {waPreviewModal.po.supplierName}
                        </strong>
                        <span className="text-[11px] text-slate-600 line-clamp-2">
                          {waPreviewModal.po.supplierAddress ||
                            waPreviewModal.matchedSupplier?.address ||
                            'Distributor Resmi'}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-600">
                          <tr>
                            <th className="p-2 border-b text-center w-8">No</th>
                            <th className="p-2 border-b">Nama Obat &amp; Sediaan</th>
                            <th className="p-2 border-b text-center">SP</th>
                            <th className="p-2 border-b text-center">Qty</th>
                            <th className="p-2 border-b text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {waPreviewModal.filteredItems.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-slate-50">
                              <td className="p-2 text-center font-mono text-slate-400">{idx + 1}</td>
                              <td className="p-2">
                                <span className="font-bold text-slate-900 block">{item.name}</span>
                                <span className="text-[10px] text-slate-500">
                                  {item.form || '-'}
                                  {item.kekuatan ? ` · ${item.kekuatan}` : ''}
                                </span>
                              </td>
                              <td className="p-2 text-center font-bold">{item.spType}</td>
                              <td className="p-2 text-center font-mono font-bold text-slate-800">
                                {item.qtyBesar} {item.satuanBesar}
                              </td>
                              <td className="p-2 text-right font-mono font-bold text-slate-900">
                                Rp {(item.subtotal || 0).toLocaleString('id-ID')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200 font-bold text-emerald-950">
                      <span>Total Estimasi Pembelian ({waPreviewModal.selectedSpGroups.join(', ')}):</span>
                      <span className="font-mono text-sm">
                        Rp {waPreviewModal.filteredTotalCost.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel Kanan: Detail Pengiriman PBF & Pesan WhatsApp */}
              <div className="lg:col-span-5 flex flex-col gap-3 text-xs">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Distributor / PBF Tujuan
                      </span>
                      <h4 className="font-extrabold text-sm text-slate-900">
                        {waPreviewModal.po.supplierName}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {waPreviewModal.po.supplierAddress ||
                          waPreviewModal.matchedSupplier?.address ||
                          'Alamat distributor belum diisi'}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px] shrink-0">
                      {waPreviewModal.filteredItems.length} Item ({waPreviewModal.selectedSpGroups.join(', ')})
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Nomor WhatsApp PBF</span>
                    </label>
                    <input
                      type="text"
                      value={waPhoneInput}
                      onChange={(e) => setWaPhoneInput(e.target.value)}
                      placeholder="Contoh: 081234567890 atau 6281234567890"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {(() => {
                      const normalized = normalizeWhatsappPhone(waPhoneInput);
                      return normalized ? (
                        <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                          Siap dikirim ke WhatsApp: <span className="font-mono">+{normalized}</span>
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-700 font-semibold mt-1">
                          Nomor belum diisi/valid. Anda tetap bisa mengirim dan memilih kontak PBF secara manual di WhatsApp.
                        </p>
                      );
                    })()}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700">
                        Pesan Pengantar WhatsApp
                      </label>
                      {waMessageEdited && (
                        <button
                          type="button"
                          onClick={() => {
                            setWaMessageInput(waPreviewModal.defaultMessage);
                            setWaMessageEdited(false);
                          }}
                          className="text-[10px] font-bold text-sky-700 hover:underline cursor-pointer"
                        >
                          Sesuaikan Pesan Otomatis
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={8}
                      value={waMessageInput}
                      onChange={(e) => {
                        setWaMessageInput(e.target.value);
                        setWaMessageEdited(true);
                      }}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white text-[11px] font-sans text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-[11px] text-emerald-950 space-y-1">
                  <p className="font-bold">Info Pengiriman PDF via WhatsApp:</p>
                  <p className="leading-relaxed text-emerald-900">
                    Saat menekan <strong>Kirim via WhatsApp</strong>, perangkat mobile yang mendukung akan langsung melampirkan file PDF ke WhatsApp, sedangkan pada komputer file PDF otomatis terunduh dan chat WhatsApp PBF langsung terbuka agar Anda tinggal melampirkan file PDF tersebut.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  downloadPurchaseOrderPdf(waPreviewModal.blob, waPreviewModal.fileName)
                }
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh PDF</span>
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleCloseWaPreviewModal}
                  disabled={isSendingWaPreview}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSendWaFromPreview}
                  disabled={isSendingWaPreview}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-extrabold rounded-xl text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isSendingWaPreview ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>{isSendingWaPreview ? 'Menyiapkan...' : 'Kirim via WhatsApp'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CameraBarcodeScannerModal
        isOpen={defectaScannerTarget !== null}
        onClose={() => setDefectaScannerTarget(null)}
        title="Scan Barcode Obat Defecta / PO"
        subtitle="Arahkan kamera ke barcode kemasan obat untuk mencari atau menambah ke Surat Pesanan."
        scanMode="barcode"
        onScanSuccess={(decoded) => {
          const lower = decoded.trim().toLowerCase();
          if (defectaScannerTarget === 'poModal') {
            const exact = medicines.find(
              (m) =>
                (m.barcode && m.barcode.trim().toLowerCase() === lower) ||
                m.id.trim().toLowerCase() === lower
            );
            if (exact) {
              handleAddMedicineToOrder(exact);
            } else {
              setMedicineSearchQuery(decoded);
            }
          } else {
            setSelectedSupplierFilter('SEMUA');
            setSearchTerm(decoded);
          }
        }}
      />
    </div>
  );
};
