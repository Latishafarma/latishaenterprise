import React, { useState, useEffect, useMemo, useRef, useDeferredValue, lazy, Suspense } from 'react';
import { demoGetItem, demoSetItem } from '../utils/demoSandbox';
import { summarizeTransactionForDocument } from '../utils/transactionPrintHelper';
import {
  Receipt,
  Search,
  Plus,
  Trash2,
  CreditCard,
  Printer,
  X,
  CheckCircle,
  FileCheck,
  User,
  ShoppingBag,
  Stethoscope,
  Users,
  FlaskConical,
  Play,
  Square,
  Wallet,
  Calculator,
  AlertTriangle,
  ShieldCheck,
  Clock,
  History,
  Check,
  Ban,
  Banknote,
  Database,
  RefreshCw,
  Code,
  Copy,
  AlertCircle,
  TicketPercent,
  ChevronDown,
  Camera,
  ScanBarcode,
  ClipboardList,
  Pill
} from 'lucide-react';
import {
  Medicine,
  Patient,
  Doctor,
  Transaction,
  CartItem,
  LabConsumedProduct,
  EPrescription,
  StockMutation,
  FeeConfig,
  DEFAULT_FEE_CONFIG,
  Mitra,
  Staff,
  StaffFeeItem,
  LabTestRecord,
  CashierShiftSession,
  CashDenominationItem,
  CASH_DENOMINATIONS_LIST,
  SalesDiscount,
  ServiceFeeRole,
  ServiceFeeType,
  CartServiceFeeAllocation,
  isOwnerAdminRole
} from '../types';
import { openPrintWindow } from '../utils/printHelper';
import { findBestCartDiscount } from '../utils/discountHelper';
import { RupiahInput } from './RupiahInput';
import { useFacilityProfiles, formatPharmacyAddress } from '../utils/facilityProfileHelper';
import { playBarcodeBeep } from '../utils/barcodeBeep';
const CameraBarcodeScannerModal = lazy(() =>
  import('./CameraBarcodeScannerModal').then((m) => ({ default: m.CameraBarcodeScannerModal }))
);
import {
  SUPABASE_CASHIER_SHIFT_SQL_SCHEMA,
  DEFAULT_CASHIER_SHIFT_TABLE,
  getSupabaseConfig,
  setSupabaseConfig,
  fetchPatientsPaginatedFromSupabase,
  fetchMedicineByBarcodeOrIdFromSupabase,
  deduplicatePatients
} from '../utils/supabaseClient';
import { isDemoMode } from '../utils/demoSandbox';
import {
  ResolvedTariffItem,
  calculateFacilityShareForCartItem,
  calculateTotalServiceFee,
  calculateUnitServiceFee,
  filterEligibleStaffForService,
  getServiceFeeRoleMeta,
  normalizeServiceFeeRole,
  normalizeServiceFeeType,
  resolveAllTariffsWithRules
} from '../utils/serviceFeeHelper';
import { isJasaCartItem } from '../utils/transactionPrintHelper';
import { isPrescriptionInPosQueue } from '../utils/prescriptionQueueHelper';

const normalizeTrxDateToYMD = (dateStr: string): string => {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10);
  const idMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (idMatch) {
    const [, d, m, y] = idMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return clean.slice(0, 10);
};

interface POSCashierViewProps {
  medicines: Medicine[];
  patients: Patient[];
  doctors: Doctor[];
  mitraList: Mitra[];
  staffList?: Staff[];
  transactions: Transaction[];
  onSaveTransaction: (trx: Transaction, mutations: StockMutation[]) => void;
  activePrescription: EPrescription | null;
  onClearActivePrescription: () => void;
  currentCashierName?: string;
  activeRole?: string;
  branchId?: string;
  feeConfig?: FeeConfig;
  labRecords?: LabTestRecord[];
  cashierShifts?: CashierShiftSession[];
  onOpenShift?: (shift: CashierShiftSession) => void;
  onCloseShift?: (shift: CashierShiftSession) => void;
  onApproveRejectShift?: (shiftId: string, action: 'APPROVE' | 'REJECT', notes: string) => void;
  onDeleteShift?: (shiftId: string) => Promise<{
    success?: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> | void;
  onClearShiftHistory?: () => Promise<{
    success?: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> | void;
  onSyncShiftsSupabase?: () => Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  shiftsNeedsTableSetup?: boolean;
  isDemoSandbox?: boolean;
  salesDiscounts?: SalesDiscount[];
  prescriptions?: EPrescription[];
  onSelectPrescriptionFromQueue?: (rx: EPrescription) => void;
  onSyncPrescriptionsSupabase?: () => Promise<{
    success: boolean;
    count?: number;
    uploadedCount?: number;
    deletedFlushedCount?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
}

export const POSCashierView: React.FC<POSCashierViewProps> = ({
  medicines,
  patients,
  doctors,
  mitraList,
  staffList = [],
  transactions,
  onSaveTransaction,
  activePrescription,
  onClearActivePrescription,
  currentCashierName = 'apt. Mardin, S.Farm',
  activeRole = 'APJ / Owner',
  branchId = 'BR-01',
  feeConfig,
  labRecords = [],
  cashierShifts = [],
  onOpenShift,
  onCloseShift,
  onApproveRejectShift,
  onDeleteShift,
  onClearShiftHistory,
  onSyncShiftsSupabase,
  shiftsNeedsTableSetup = false,
  isDemoSandbox = false,
  salesDiscounts = [],
  prescriptions = [],
  onSelectPrescriptionFromQueue,
  onSyncPrescriptionsSupabase
}) => {
  const { pharmacyProfile } = useFacilityProfiles();
  const [posJalur, setPosJalur] = useState<'REGULER' | 'KLINIK' | 'MITRA'>('REGULER');
  const [customer, setCustomer] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [remoteCustomerPatients, setRemoteCustomerPatients] = useState<Patient[]>([]);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [doctor, setDoctor] = useState('Internal');
  const [assignedStaff, setAssignedStaff] = useState<StaffFeeItem[]>([]);

  useEffect(() => {
    const q = customer.trim();
    if (posJalur === 'MITRA' || q.length < 2 || q.toLowerCase() === 'pelanggan umum' || isDemoMode()) {
      setRemoteCustomerPatients([]);
      return;
    }
    const cfg = getSupabaseConfig();
    if (!cfg.url || !cfg.key) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchPatientsPaginatedFromSupabase({
        page: 1,
        pageSize: 15,
        searchQuery: q
      }).then((res) => {
        if (!cancelled && res.data) {
          setRemoteCustomerPatients(res.data);
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customer, posJalur]);

  // Cashier Shift Management States
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showShiftHistoryModal, setShowShiftHistoryModal] = useState(false);

  // Supabase Riwayat Shift Sync & Schema States
  const [isSyncingShifts, setIsSyncingShifts] = useState(false);
  const [shiftSyncToast, setShiftSyncToast] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [showShiftSchemaModal, setShowShiftSchemaModal] = useState(false);
  const [copiedShiftSchema, setCopiedShiftSchema] = useState(false);
  const [shiftTableInput, setShiftTableInput] = useState(
    () => getSupabaseConfig().cashierShiftTable || DEFAULT_CASHIER_SHIFT_TABLE
  );
  const [confirmClearShifts, setConfirmClearShifts] = useState(false);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);

  const [openShiftName, setOpenShiftName] = useState('Shift Pagi (07:00 - 14:00)');
  const [selectedShiftCashier, setSelectedShiftCashier] = useState(currentCashierName);
  const [openingFloatInput, setOpeningFloatInput] = useState<number>(200000);
  const [openingNotesInput, setOpeningNotesInput] = useState('');

  useEffect(() => {
    setSelectedShiftCashier(currentCashierName);
  }, [currentCashierName]);

  // Physical Denomination Input State (Lembar/Keping per Nominal: 1.000 s/d 100.000)
  const [denominationSheets, setDenominationSheets] = useState<Record<number, number>>({
    1000: 0,
    2000: 0,
    5000: 0,
    10000: 0,
    20000: 0,
    50000: 0,
    100000: 0
  });
  const [closingNotesInput, setClosingNotesInput] = useState('');
  const [approvalNotesInput, setApprovalNotesInput] = useState<Record<string, string>>({});

  const isSuperAdmin = isOwnerAdminRole(activeRole);

  // Active Shift (Status: 'Aktif' or 'Ditolak (Hitung Ulang)')
  const activeShift = useMemo(() => {
    return cashierShifts.find(
      (s) => s.status === 'Aktif' || s.status === 'Ditolak (Hitung Ulang)'
    );
  }, [cashierShifts]);

  // Shifts waiting for Super Admin Approval
  const pendingApprovalShifts = useMemo(() => {
    return cashierShifts.filter((s) => s.status === 'Menunggu Approval Tutup Kasir');
  }, [cashierShifts]);

  // Calculate Today's / Active Shift's Cash & Non-Cash Sales from System Transactions
  const shiftSalesSummary = useMemo(() => {
    const now = new Date();
    const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Valid transactions from today
    const validTodayTrx = transactions.filter(
      (t) =>
        t.status !== 'Dibatalkan' &&
        t.status !== 'Diretur' &&
        normalizeTrxDateToYMD(t.date) === todayYMD
    );

    let cashSales = 0;
    let nonCashSales = 0;

    validTodayTrx.forEach((t) => {
      const pm = (t.paymentMethod || '').toLowerCase();
      if (pm.includes('tunai')) {
        cashSales += t.total;
      } else {
        nonCashSales += t.total;
      }
    });

    // Deduct cash sales already accounted for in closed/pending shifts from today
    const closedTodayShifts = cashierShifts.filter(
      (s) =>
        s.openDate === todayYMD &&
        s.id !== activeShift?.id &&
        (s.status === 'Ditutup (Sesuai)' ||
          s.status === 'Ditutup (Approved APJ / Owner)' ||
          s.status === 'Ditutup (Approved Super Admin)' ||
          s.status === 'Menunggu Approval Tutup Kasir')
    );

    const alreadyAccountedCash = closedTodayShifts.reduce(
      (acc, s) => acc + (s.systemCashSales || 0),
      0
    );

    const currentShiftCashSales = Math.max(0, cashSales - alreadyAccountedCash);
    const openingFloat = activeShift ? activeShift.openingFloat : openingFloatInput;
    const expectedCashInDrawer = openingFloat + currentShiftCashSales;

    return {
      cashSales: currentShiftCashSales,
      nonCashSales,
      openingFloat,
      expectedCashInDrawer,
      trxCount: validTodayTrx.length
    };
  }, [transactions, cashierShifts, activeShift, openingFloatInput]);

  // Denomination rows calculation
  const denominationRows = useMemo<CashDenominationItem[]>(() => {
    return CASH_DENOMINATIONS_LIST.map((d) => {
      const sheets = Math.max(0, Number(denominationSheets[d.nominal]) || 0);
      return {
        nominal: d.nominal,
        label: d.label,
        sheets,
        subtotal: d.nominal * sheets
      };
    });
  }, [denominationSheets]);

  const totalPhysicalCash = useMemo(() => {
    return denominationRows.reduce((acc, row) => acc + row.subtotal, 0);
  }, [denominationRows]);

  const cashDifference = useMemo(() => {
    return totalPhysicalCash - shiftSalesSummary.expectedCashInDrawer;
  }, [totalPhysicalCash, shiftSalesSummary.expectedCashInDrawer]);

  const cashDifferenceStatus = useMemo<'Sesuai' | 'Surplus (Lebih)' | 'Defisit (Kurang)'>(() => {
    if (cashDifference === 0) return 'Sesuai';
    if (cashDifference > 0) return 'Surplus (Lebih)';
    return 'Defisit (Kurang)';
  }, [cashDifference]);

  const handleConfirmOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const newShift: CashierShiftSession = {
      id: `SHIFT-${todayYMD.replace(/-/g, '')}-${String(cashierShifts.length + 1).padStart(2, '0')}`,
      branchId,
      cashierName: selectedShiftCashier || currentCashierName,
      shiftName: openShiftName,
      openDate: todayYMD,
      openTime: `${timeStr} WIB`,
      openTimestamp: Date.now(),
      openingFloat: Math.max(0, Number(openingFloatInput) || 0),
      openingNotes: openingNotesInput.trim() || 'Pembukaan kasir normal',
      systemCashSales: 0,
      systemNonCashSales: 0,
      expectedCashInDrawer: Math.max(0, Number(openingFloatInput) || 0),
      physicalCashInDrawer: 0,
      difference: 0,
      differenceStatus: 'Sesuai',
      denominations: CASH_DENOMINATIONS_LIST.map((d) => ({
        nominal: d.nominal,
        label: d.label,
        sheets: 0,
        subtotal: 0
      })),
      status: 'Aktif',
      transactionCount: 0
    };

    onOpenShift?.(newShift);
    setShowOpenShiftModal(false);
    setOpeningNotesInput('');
  };

  const handleOpenCloseShiftModal = () => {
    if (activeShift && activeShift.denominations && activeShift.status === 'Ditolak (Hitung Ulang)') {
      const nextMap: Record<number, number> = {
        1000: 0,
        2000: 0,
        5000: 0,
        10000: 0,
        20000: 0,
        50000: 0,
        100000: 0
      };
      activeShift.denominations.forEach((d) => {
        nextMap[d.nominal] = d.sheets;
      });
      setDenominationSheets(nextMap);
      setClosingNotesInput(activeShift.closingNotes || '');
    } else {
      setDenominationSheets({
        1000: 0,
        2000: 0,
        5000: 0,
        10000: 0,
        20000: 0,
        50000: 0,
        100000: 0
      });
      setClosingNotesInput('');
    }
    setShowCloseShiftModal(true);
  };

  const handleConfirmCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const baseShift: CashierShiftSession = activeShift || {
      id: `SHIFT-${todayYMD.replace(/-/g, '')}-${String(cashierShifts.length + 1).padStart(2, '0')}`,
      branchId,
      cashierName: currentCashierName,
      shiftName: openShiftName,
      openDate: todayYMD,
      openTime: `${timeStr} WIB`,
      openTimestamp: Date.now(),
      openingFloat: shiftSalesSummary.openingFloat,
      openingNotes: 'Auto-buka saat tutup kasir',
      systemCashSales: shiftSalesSummary.cashSales,
      systemNonCashSales: shiftSalesSummary.nonCashSales,
      expectedCashInDrawer: shiftSalesSummary.expectedCashInDrawer,
      physicalCashInDrawer: totalPhysicalCash,
      difference: cashDifference,
      differenceStatus: cashDifferenceStatus,
      denominations: denominationRows,
      status: 'Aktif',
      transactionCount: shiftSalesSummary.trxCount
    };

    const hasDiscrepancy = cashDifference !== 0;

    const closedShift: CashierShiftSession = {
      ...baseShift,
      closeDate: todayYMD,
      closeTime: `${timeStr} WIB`,
      systemCashSales: shiftSalesSummary.cashSales,
      systemNonCashSales: shiftSalesSummary.nonCashSales,
      expectedCashInDrawer: shiftSalesSummary.expectedCashInDrawer,
      physicalCashInDrawer: totalPhysicalCash,
      difference: cashDifference,
      differenceStatus: cashDifferenceStatus,
      closingNotes:
        closingNotesInput.trim() ||
        (hasDiscrepancy
          ? `Terdapat selisih ${cashDifferenceStatus} Rp ${Math.abs(cashDifference).toLocaleString('id-ID')}`
          : 'Kas fisik sesuai dengan sistem'),
      denominations: denominationRows,
      status: hasDiscrepancy ? 'Menunggu Approval Tutup Kasir' : 'Ditutup (Sesuai)',
      transactionCount: shiftSalesSummary.trxCount
    };

    onCloseShift?.(closedShift);
    setShowCloseShiftModal(false);
  };

  const handleRunShiftSupabaseSync = async () => {
    if (!onSyncShiftsSupabase) return;
    setIsSyncingShifts(true);
    setShiftSyncToast(null);
    try {
      const res = await onSyncShiftsSupabase();
      if (res.isDemo) {
        setShiftSyncToast({
          type: 'warning',
          message:
            'Mode Demo / Sandbox aktif. Sinkronisasi Riwayat Shift ke Supabase produksi dinonaktifkan otomatis untuk menjaga isolasi data demo.'
        });
      } else if (res.success) {
        setShiftSyncToast({
          type: 'success',
          message: `Sinkronisasi 2-arah berhasil! Total ${res.count ?? cashierShifts.length} riwayat sesi shift kasir tersinkron dengan tabel "${shiftTableInput || DEFAULT_CASHIER_SHIFT_TABLE}" di Supabase.`
        });
      } else if (res.needsTableSetup) {
        setShiftSyncToast({
          type: 'warning',
          message: `Tabel "${shiftTableInput || DEFAULT_CASHIER_SHIFT_TABLE}" belum dibuat di Supabase. Silakan salin skrip SQL pada modal Skema SQL.`
        });
      } else {
        setShiftSyncToast({
          type: 'error',
          message: res.error || 'Gagal melakukan sinkronisasi Riwayat Shift ke Supabase.'
        });
      }
    } finally {
      setIsSyncingShifts(false);
    }
  };

  const handleSaveShiftTableName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSandbox) {
      setShiftSyncToast({
        type: 'warning',
        message: 'Konfigurasi tabel Supabase tidak dapat diubah saat Mode Demo Sandbox aktif.'
      });
      return;
    }
    const cleaned = shiftTableInput.trim() || DEFAULT_CASHIER_SHIFT_TABLE;
    setShiftTableInput(cleaned);
    setSupabaseConfig({ cashierShiftTable: cleaned });
    await handleRunShiftSupabaseSync();
  };

  const handleCopyShiftSchema = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_CASHIER_SHIFT_SQL_SCHEMA);
      setCopiedShiftSchema(true);
      setTimeout(() => setCopiedShiftSchema(false), 2500);
    } catch {
      setShiftSyncToast({
        type: 'warning',
        message: 'Gagal menyalin otomatis. Silakan blok dan salin teks SQL secara manual.'
      });
    }
  };

  // Helper: check if a LabTestRecord has already been paid/transacted in POS Kasir
  const isLabRecordPaidInPOS = useMemo(() => {
    const activeTrxs = (transactions || []).filter(
      (t) => t.status !== 'Dibatalkan' && t.status !== 'Diretur'
    );

    return (rec: LabTestRecord) => {
      const targetCartItemId = `LAB-FEE-${rec.id}`;
      const recPatientLower = (rec.patientName || '').trim().toLowerCase();

      return activeTrxs.some((trx) => {
        // 1. Exact match by LAB-FEE-{rec.id} item ID in transaction items
        const hasExactId = (trx.items || []).some((item) => item.id === targetCartItemId);
        if (hasExactId) return true;

        // 2. Fallback match: if transaction belongs to the same patient and contains a 'Biaya Cek Lab' item
        const trxCustLower = (trx.customerName || '').trim().toLowerCase();
        const isSamePatient =
          recPatientLower &&
          (trxCustLower === recPatientLower ||
            trxCustLower.includes(recPatientLower) ||
            recPatientLower.includes(trxCustLower));

        if (isSamePatient) {
          const hasLabFeeItem = (trx.items || []).some(
            (item) =>
              item.id === targetCartItemId ||
              (item.name &&
                item.name.toLowerCase().includes('biaya cek lab') &&
                (!item.id.startsWith('LAB-FEE-') || item.id === targetCartItemId))
          );
          if (hasLabFeeItem) return true;
        }
        return false;
      });
    };
  }, [transactions]);

  // Match only UNPAID lab test records for the currently selected customer / patient
  const matchingCustomerLabRecords = useMemo(() => {
    if (!labRecords || labRecords.length === 0 || !customer) return [];
    const q = customer.trim().toLowerCase();
    if (!q || q === 'pelanggan umum' || q === 'reguler') return [];

    return labRecords.filter((rec) => {
      const pName = (rec.patientName || '').trim().toLowerCase();
      const rm = (rec.rmId || '').trim().toLowerCase();
      const matchesCustomer =
        pName === q || (rm && rm === q) || pName.includes(q) || (rm && q.includes(rm));
      if (!matchesCustomer) return false;

      // Hanya tampilkan jika belum pernah dilakukan pembayaran di POS Kasir
      return !isLabRecordPaidInPOS(rec);
    });
  }, [labRecords, customer, isLabRecordPaidInPOS]);

  const [pluInput, setPluInput] = useState('');
  const deferredPluInput = useDeferredValue(pluInput);
  const [selectedMed, setSelectedMed] = useState<Medicine | null>(null);
  const [showMedDropdown, setShowMedDropdown] = useState(false);
  const medDropdownRef = useRef<HTMLDivElement>(null);
  const [showPosBarcodeScanner, setShowPosBarcodeScanner] = useState(false);
  const [posScanNotice, setPosScanNotice] = useState<{
    type: 'success' | 'warning';
    text: string;
  } | null>(null);
  const [extraScannedPosMeds, setExtraScannedPosMeds] = useState<Medicine[]>([]);

  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const staffDropdownRef = useRef<HTMLDivElement>(null);

  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);

  // Close customer, medicine, staff, and service dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(target)) {
        setShowCustomerDropdown(false);
      }
      if (medDropdownRef.current && !medDropdownRef.current.contains(target)) {
        setShowMedDropdown(false);
      }
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(target)) {
        setShowStaffSelector(false);
      }
      if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(target)) {
        setShowServiceDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const [tuslah, setTuslah] = useState(0);
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('Strip');
  const [choosePrice, setChoosePrice] = useState<'Harga Jual 1' | 'Harga Jual 2' | 'Harga Jual 3'>('Harga Jual 1');
  const [price, setPrice] = useState(0);
  const [itemDiscount, setItemDiscount] = useState(0);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [description, setDescription] = useState('');
  const [posVoucherCode, setPosVoucherCode] = useState('');
  const [invoiceNo, setInvoiceNo] = useState(`INV-${Date.now().toString().slice(-6)}`);
  const [overallDiscount, setOverallDiscount] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [chargeCC, setChargeCC] = useState(0);

  const isLabFeeAlreadyInCart = useMemo(() => {
    if (matchingCustomerLabRecords.length === 0) return false;
    return matchingCustomerLabRecords.every((rec) =>
      cart.some((c) => c.id === `LAB-FEE-${rec.id}`)
    );
  }, [cart, matchingCustomerLabRecords]);

  const handleAddLabFeeToCart = () => {
    if (matchingCustomerLabRecords.length === 0) {
      return;
    }

    const unpaidNotInCart = matchingCustomerLabRecords.filter(
      (rec) => !cart.some((c) => c.id === `LAB-FEE-${rec.id}`)
    );

    if (unpaidNotInCart.length === 0) {
      return;
    }

    const newLabCartItems: CartItem[] = unpaidNotInCart.map((rec) => {
      const feeAmount =
        rec.cost && rec.cost > 0
          ? rec.cost
          : rec.items.reduce((s, it) => s + (Number(it.price) || 0), 0) || 50000;

      const consumedMap = new Map<string, LabConsumedProduct>();
      rec.items.forEach((it) => {
        if (!it.productId) return;
        const itemQty = Math.max(1, Number(it.productQty) || 1);
        const med = medicines.find((m) => m.id === it.productId);
        const existing = consumedMap.get(it.productId);
        if (existing) {
          existing.qty += itemQty;
        } else {
          consumedMap.set(it.productId, {
            medicineId: it.productId,
            medicineName: it.productName || med?.name || 'Produk Lab',
            qty: itemQty,
            unit: it.productUnit || med?.satuanKecil || med?.unit || 'Pcs',
            unitPrice:
              it.productUnitPrice !== undefined && it.productUnitPrice > 0
                ? it.productUnitPrice
                : Number(med?.sellPriceKlinik) || Number(med?.sellPrice) || 0,
            hpp: med?.hpp || 0
          });
        }
      });
      const labConsumedProducts = Array.from(consumedMap.values());
      const totalLabHpp = labConsumedProducts.reduce(
        (sum, lp) => sum + (Number(lp.hpp) || 0) * (Number(lp.qty) || 0),
        0
      );

      const paramSummary = rec.items
        .map((i) => i.parameter)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
      const itemName = `Biaya Cek Lab: ${paramSummary || 'Pemeriksaan POCT'}${
        rec.items.length > 3 ? '...' : ''
      } (${rec.patientName})`;

      return {
        id: `LAB-FEE-${rec.id}`,
        name: itemName,
        qty: 1,
        unit: 'Pemeriksaan',
        tuslah: 0,
        price: feeAmount,
        discount: 0,
        subtotal: feeAmount,
        hpp: totalLabHpp,
        labConsumedProducts: labConsumedProducts.length > 0 ? labConsumedProducts : undefined
      };
    });

    setCart((prev) => [...prev, ...newLabCartItems]);
  };

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [subMethod, setSubMethod] = useState('Tunai (Cash)');
  const [payAmount, setPayAmount] = useState(0);
  const [lastFinishedTrx, setLastFinishedTrx] = useState<Transaction | null>(null);

  const handlePrintReceipt = () => {
    if (lastFinishedTrx) {
      try {
        demoSetItem('latisha_active_print_receipt', JSON.stringify(lastFinishedTrx));
      } catch (e) {
        console.warn('Storage save failed:', e);
      }
      openPrintWindow('struk-pos', { trxId: lastFinishedTrx.id });
    } else {
      openPrintWindow('struk-pos');
    }
  };

  // Fee configuration from Settings Submenu (or localStorage fallback)
  const currentFees = useMemo<FeeConfig>(() => {
    if (feeConfig) return feeConfig;
    const saved = demoGetItem('latisha_fee_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_FEE_CONFIG;
      }
    }
    return DEFAULT_FEE_CONFIG;
  }, [feeConfig]);

  // Filtered customer/mitra for autocomplete based on path (bounded to max 25 items to keep DOM fast)
  const filteredCustomers = useMemo(() => {
    const q = customer.trim().toLowerCase();
    if (!q || q === 'pelanggan umum') return [];
    if (posJalur === 'MITRA') {
      return mitraList
        .filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
        .slice(0, 25);
    } else {
      const cleanTrim = customer.trim();
      const localMatches: Patient[] = [];
      for (const p of patients) {
        if (
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.noRm || '').toLowerCase().includes(q) ||
          p.nik?.includes(cleanTrim)
        ) {
          localMatches.push(p);
          if (localMatches.length >= 25 && remoteCustomerPatients.length === 0) break;
        }
      }
      if (remoteCustomerPatients.length === 0) {
        return localMatches.slice(0, 25);
      }
      return deduplicatePatients([...remoteCustomerPatients, ...localMatches]).slice(0, 25);
    }
  }, [posJalur, customer, mitraList, patients, remoteCustomerPatients]);

  // List of medical services corresponding to Submenu Pengaturan Jasa Medis & Fee Layanan
  const availableServices: ResolvedTariffItem[] = useMemo(
    () => resolveAllTariffsWithRules(currentFees),
    [currentFees]
  );

  const [checkoutValidationError, setCheckoutValidationError] = useState<string | null>(null);

  // State Modal Antrian E-Resep di POS Kasir (Terintegrasi 2-arah dengan Supabase)
  const [showPrescriptionQueueModal, setShowPrescriptionQueueModal] = useState(false);
  const [rxQueueSearch, setRxQueueSearch] = useState('');
  const [isSyncingRxQueue, setIsSyncingRxQueue] = useState(false);
  const [rxQueueSyncNotice, setRxQueueSyncNotice] = useState<string | null>(null);
  const [pendingConfirmLoadRx, setPendingConfirmLoadRx] = useState<EPrescription | null>(null);

  const posPrescriptionQueue = useMemo(
    () => prescriptions.filter((rx) => isPrescriptionInPosQueue(rx)),
    [prescriptions]
  );

  const filteredPosPrescriptionQueue = useMemo(() => {
    const q = rxQueueSearch.trim().toLowerCase();
    if (!q) return posPrescriptionQueue;
    return posPrescriptionQueue.filter(
      (rx) =>
        rx.id.toLowerCase().includes(q) ||
        rx.patientName.toLowerCase().includes(q) ||
        (rx.rmId || '').toLowerCase().includes(q) ||
        (rx.doctorName || '').toLowerCase().includes(q) ||
        (rx.originFacility || '').toLowerCase().includes(q) ||
        rx.items.some((it) => it.name.toLowerCase().includes(q))
    );
  }, [posPrescriptionQueue, rxQueueSearch]);

  const handleSyncRxQueueFromSupabase = async (silent = false) => {
    if (!onSyncPrescriptionsSupabase) return;
    if (isDemoSandbox || isDemoMode()) {
      if (!silent) {
        setRxQueueSyncNotice('Mode Demo aktif: antrian E-Resep menggunakan data sandbox lokal.');
      }
      return;
    }
    setIsSyncingRxQueue(true);
    try {
      const res = await onSyncPrescriptionsSupabase();
      if (!silent) {
        if (res.needsTableSetup) {
          setRxQueueSyncNotice('Tabel riwayat_skrining_resep belum siap di Supabase.');
        } else if (!res.success) {
          setRxQueueSyncNotice(`Gagal sinkronisasi Supabase: ${res.error || 'Koneksi terganggu'}`);
        } else {
          setRxQueueSyncNotice(
            `Tersinkron dengan Supabase (${posPrescriptionQueue.length} resep siap diproses di POS).`
          );
        }
      }
    } finally {
      setIsSyncingRxQueue(false);
    }
  };

  const handleOpenPrescriptionQueueModal = () => {
    setPendingConfirmLoadRx(null);
    setRxQueueSyncNotice(null);
    setShowPrescriptionQueueModal(true);
    void handleSyncRxQueueFromSupabase(true);
  };

  const handlePickRxFromQueue = (rx: EPrescription, forceReplace = false) => {
    if (!forceReplace && cart.length > 0 && activePrescription?.id !== rx.id) {
      setPendingConfirmLoadRx(rx);
      return;
    }
    setPendingConfirmLoadRx(null);
    setShowPrescriptionQueueModal(false);
    onSelectPrescriptionFromQueue?.(rx);
  };

  const missingRequiredStaffServices = useMemo(() => {
    return cart.filter((item) => {
      if (!isJasaCartItem(item)) return false;
      if (Array.isArray(item.fee_allocations) && item.fee_allocations.length > 0) {
        return item.fee_allocations.some(
          (alloc) =>
            Boolean(alloc.wajib_pilih_petugas) &&
            normalizeServiceFeeRole(alloc.penerima_role) !== 'non_petugas' &&
            !String(alloc.petugas_id || '').trim()
        );
      }
      return (
        Boolean(item.wajib_pilih_petugas) &&
        normalizeServiceFeeRole(item.penerima_role) !== 'non_petugas' &&
        !String(item.petugas_id || '').trim()
      );
    });
  }, [cart]);

  useEffect(() => {
    if (missingRequiredStaffServices.length === 0 && checkoutValidationError) {
      setCheckoutValidationError(null);
    }
  }, [missingRequiredStaffServices.length, checkoutValidationError]);

  const recomputeServiceCartSnapshot = (
    item: CartItem,
    nextAllocations: CartServiceFeeAllocation[],
    nextQty: number
  ): CartItem => {
    const cleanQty = Math.max(1, Number(nextQty) || 1);
    const price = Math.max(0, Number(item.price) || 0);
    const subtotal = Math.max(
      0,
      price * cleanQty + (Number(item.tuslah) || 0) - (Number(item.discount) || 0)
    );

    const updatedAllocations = nextAllocations.map((alloc) => {
      const role = normalizeServiceFeeRole(alloc.penerima_role);
      const tipeFee = normalizeServiceFeeType(alloc.tipe_fee);
      const nilaiFee = role === 'non_petugas' ? 0 : Math.max(0, Number(alloc.nilai_fee) || 0);
      const unitFee = role === 'non_petugas' ? 0 : calculateUnitServiceFee(price, tipeFee, nilaiFee);
      const totalFee = role === 'non_petugas' ? 0 : calculateTotalServiceFee(unitFee, cleanQty);
      return {
        ...alloc,
        penerima_role: role,
        tipe_fee: tipeFee,
        nilai_fee: nilaiFee,
        nominal_fee_satuan: unitFee,
        total_fee_item: totalFee
      };
    });

    const selectedAllocs = updatedAllocations.filter(
      (a) => normalizeServiceFeeRole(a.penerima_role) !== 'non_petugas' && Boolean(String(a.petugas_id || '').trim())
    );
    const primaryAlloc =
      selectedAllocs[0] ||
      updatedAllocations.find((a) => normalizeServiceFeeRole(a.penerima_role) !== 'non_petugas') ||
      updatedAllocations[0];

    const totalStaffUnitFee = selectedAllocs.reduce((sum, a) => sum + a.nominal_fee_satuan, 0);
    const totalStaffFeeItem = selectedAllocs.reduce((sum, a) => sum + a.total_fee_item, 0);
    const feeFasilitasSatuan = Math.max(0, price - totalStaffUnitFee);
    const totalFeeFasilitas = Math.max(0, subtotal - totalStaffFeeItem);

    const selectedNames = Array.from(
      new Set(selectedAllocs.map((a) => a.nama_petugas).filter(Boolean))
    ).join(', ');
    const selectedRoles = Array.from(
      new Set(selectedAllocs.map((a) => a.role_petugas).filter(Boolean))
    ).join(', ');

    return {
      ...item,
      qty: cleanQty,
      subtotal,
      fee_allocations: updatedAllocations,
      penerima_role: primaryAlloc?.penerima_role || item.penerima_role || 'non_petugas',
      wajib_pilih_petugas: updatedAllocations.some(
        (a) => a.wajib_pilih_petugas && a.penerima_role !== 'non_petugas'
      ),
      tipe_fee: primaryAlloc?.tipe_fee || item.tipe_fee || 'nominal',
      nilai_fee: primaryAlloc?.nilai_fee ?? item.nilai_fee ?? 0,
      petugas_id: selectedAllocs[0]?.petugas_id || '',
      nama_petugas: selectedNames,
      role_petugas: selectedRoles,
      nominal_fee_satuan: totalStaffUnitFee,
      total_fee_item: totalStaffFeeItem,
      fee_fasilitas_satuan: feeFasilitasSatuan,
      total_fee_fasilitas: totalFeeFasilitas
    };
  };

  const handleToggleService = (srv: ResolvedTariffItem) => {
    const exists = cart.some((c) => c.id === srv.id);
    if (exists) {
      setCart(cart.filter((c) => c.id !== srv.id));
      return;
    }

    const rules =
      Array.isArray(srv.fee_recipients) && srv.fee_recipients.length > 0
        ? srv.fee_recipients
        : [
            {
              id: 'RCP-1',
              penerima_role: srv.penerima_role,
              wajib_pilih_petugas: srv.wajib_pilih_petugas,
              tipe_fee: srv.tipe_fee,
              nilai_fee: srv.nilai_fee
            }
          ];

    const initialAllocations: CartServiceFeeAllocation[] = rules.map((r, rIdx) => {
      const role = normalizeServiceFeeRole(r.penerima_role || 'non_petugas');
      const tipeFee = normalizeServiceFeeType(r.tipe_fee || 'nominal');
      const nilaiFee = role === 'non_petugas' ? 0 : Math.max(0, Number(r.nilai_fee) || 0);
      const unitFee = role === 'non_petugas' ? 0 : calculateUnitServiceFee(srv.price, tipeFee, nilaiFee);
      const totalFee = role === 'non_petugas' ? 0 : calculateTotalServiceFee(unitFee, 1);
      const eligibleStaff =
        role !== 'non_petugas' ? filterEligibleStaffForService(staffList, role) : [];
      const preMatched =
        role !== 'non_petugas'
          ? eligibleStaff.find((st) => assignedStaff.some((a) => a.staffId === st.id))
          : undefined;

      return {
        rule_id: r.id || `RCP-${rIdx + 1}`,
        penerima_role: role,
        wajib_pilih_petugas: role === 'non_petugas' ? false : Boolean(r.wajib_pilih_petugas),
        tipe_fee: tipeFee,
        nilai_fee: nilaiFee,
        nominal_fee_satuan: unitFee,
        total_fee_item: totalFee,
        petugas_id: preMatched?.id || '',
        nama_petugas: preMatched?.name || '',
        role_petugas: preMatched?.role || ''
      };
    });

    const baseItem: CartItem = {
      id: srv.id,
      name: srv.name,
      qty: 1,
      unit: 'Layanan',
      tuslah: 0,
      price: srv.price,
      discount: 0,
      subtotal: srv.price,
      hpp: 0
    };

    const newItem = recomputeServiceCartSnapshot(baseItem, initialAllocations, 1);
    setCart([...cart, newItem]);
    setCheckoutValidationError(null);
  };

  const handleUpdateServiceAllocationStaff = (
    cartIdx: number,
    allocIdx: number,
    selectedStaffId: string
  ) => {
    setCart((prev) =>
      prev.map((item, i) => {
        if (i !== cartIdx) return item;
        const allocations: CartServiceFeeAllocation[] =
          Array.isArray(item.fee_allocations) && item.fee_allocations.length > 0
            ? item.fee_allocations
            : [
                {
                  rule_id: 'RCP-1',
                  penerima_role: normalizeServiceFeeRole(item.penerima_role || 'Dokter'),
                  wajib_pilih_petugas: Boolean(item.wajib_pilih_petugas),
                  tipe_fee: normalizeServiceFeeType(item.tipe_fee || 'nominal'),
                  nilai_fee: Number(item.nilai_fee ?? item.nominal_fee_satuan ?? 0),
                  nominal_fee_satuan: Number(item.nominal_fee_satuan) || 0,
                  total_fee_item: Number(item.total_fee_item) || 0,
                  petugas_id: item.petugas_id || '',
                  nama_petugas: item.nama_petugas || '',
                  role_petugas: item.role_petugas || ''
                }
              ];

        const nextAllocations = allocations.map((alloc, aIdx) => {
          if (aIdx !== allocIdx) return alloc;
          const eligible = filterEligibleStaffForService(staffList, alloc.penerima_role);
          const matched = eligible.find((s) => s.id === selectedStaffId);
          return {
            ...alloc,
            petugas_id: matched?.id || '',
            nama_petugas: matched?.name || '',
            role_petugas: matched?.role || ''
          };
        });

        return recomputeServiceCartSnapshot(item, nextAllocations, item.qty);
      })
    );
    setCheckoutValidationError(null);
  };

  const handleUpdateCartItemQty = (cartIdx: number, nextQty: number) => {
    const cleanQty = Math.max(1, Math.floor(Number(nextQty) || 1));
    setCart((prev) =>
      prev.map((item, i) => {
        if (i !== cartIdx) return item;
        const nextSubtotal = Math.max(
          0,
          Number(item.price) * cleanQty + (Number(item.tuslah) || 0) - (Number(item.discount) || 0)
        );
        if (!isJasaCartItem(item)) {
          return { ...item, qty: cleanQty, subtotal: nextSubtotal };
        }
        if (Array.isArray(item.fee_allocations) && item.fee_allocations.length > 0) {
          return recomputeServiceCartSnapshot(item, item.fee_allocations, cleanQty);
        }
        const role = normalizeServiceFeeRole(item.penerima_role || 'non_petugas');
        const tipeFee = normalizeServiceFeeType(item.tipe_fee || 'nominal');
        const nilaiFee =
          role === 'non_petugas' ? 0 : Number(item.nilai_fee ?? item.nominal_fee_satuan ?? 0);
        const unitFee = role === 'non_petugas' ? 0 : calculateUnitServiceFee(item.price, tipeFee, nilaiFee);
        const totalFee = role === 'non_petugas' ? 0 : calculateTotalServiceFee(unitFee, cleanQty);
        const feeFasilitasSatuan = Math.max(0, Number(item.price) - unitFee);
        const totalFeeFasilitas = Math.max(0, nextSubtotal - totalFee);
        return {
          ...item,
          qty: cleanQty,
          subtotal: nextSubtotal,
          nominal_fee_satuan: unitFee,
          total_fee_item: totalFee,
          fee_fasilitas_satuan: feeFasilitasSatuan,
          total_fee_fasilitas: totalFeeFasilitas
        };
      })
    );
  };

  // Price Resolver
  const resolvePrice = (med: Medicine, priceType: string, targetUnit: string) => {
    if (!med) return 0;
    const isBesar = targetUnit && med.satuanBesar && targetUnit.trim().toLowerCase() === med.satuanBesar.trim().toLowerCase();
    const ratio = med.rasioKonversi || 1;

    let baseKecil = med.sellPrice;
    if (priceType === 'Harga Jual 3') {
      baseKecil = med.sellPriceMitra || Math.round(med.sellPrice * 0.9);
    } else if (priceType === 'Harga Jual 2') {
      baseKecil = med.sellPriceKlinik || Math.round(med.sellPrice * 0.95);
    }

    if (isBesar) {
      return baseKecil * ratio;
    }
    return baseKecil;
  };

  // Sync pricing tier when posJalur changes
  useEffect(() => {
    let pType: 'Harga Jual 1' | 'Harga Jual 2' | 'Harga Jual 3' = 'Harga Jual 1';
    if (posJalur === 'MITRA') pType = 'Harga Jual 3';
    else if (posJalur === 'KLINIK') pType = 'Harga Jual 2';

    setChoosePrice(pType);
    if (selectedMed) {
      setPrice(resolvePrice(selectedMed, pType, unit));
    }
  }, [posJalur]);

  // Helper to calculate fee rate per staff role based on feeConfig
  const getStaffFee = (staff: Staff): number => {
    const config = currentFees;
    if (staff.role === 'Dokter') {
      return config.doctorFee || 20000;
    }
    if (staff.role === 'Apoteker' || isOwnerAdminRole(staff.role)) {
      return config.pharmacistFee || 10000;
    }
    if (staff.role === 'Perawat / Bidan' || staff.role === 'Perawat / Nakes Lapangan') {
      return config.medicalSupportFee || 5000;
    }
    if (staff.role === 'Kasir & Front Office') {
      return config.adminFee || 1000;
    }
    return 5000;
  };

  const [showStaffSelector, setShowStaffSelector] = useState(false);

  const selectableStaffOptions = useMemo(() => {
    const baseList =
      staffList.length > 0
        ? staffList
        : ([
            { id: 'STF-01', name: 'apt. Mardin, S.Farm', role: 'APJ / Owner' },
            { id: 'STF-02', name: 'dr. Anis Prima Dewi', role: 'Dokter' },
            { id: 'STF-03', name: 'Ns. Siti Nurhaliza, S.Kep', role: 'Perawat / Bidan' },
            { id: 'STF-04', name: 'Rina Kartika, A.Md.Farm', role: 'Apoteker' }
          ] as Staff[]);
    const q = staffSearchQuery.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (st) =>
        st.name.toLowerCase().includes(q) ||
        (st.role || '').toLowerCase().includes(q)
    );
  }, [staffList, staffSearchQuery]);

  const filteredServices = useMemo(() => {
    const q = serviceSearchQuery.trim().toLowerCase();
    if (!q) return availableServices;
    return availableServices.filter(
      (srv) =>
        srv.name.toLowerCase().includes(q) ||
        (srv.category || '').toLowerCase().includes(q)
    );
  }, [availableServices, serviceSearchQuery]);

  const selectedServicesCount = useMemo(() => {
    const serviceIds = new Set(availableServices.map((s) => s.id));
    return cart.filter((c) => serviceIds.has(c.id)).length;
  }, [availableServices, cart]);

  const handleToggleAssignedStaff = (st: Staff) => {
    const isSelected = assignedStaff.some((s) => s.staffId === st.id);
    if (isSelected) {
      setAssignedStaff(assignedStaff.filter((s) => s.staffId !== st.id));
    } else {
      setAssignedStaff([
        ...assignedStaff,
        {
          staffId: st.id,
          staffName: st.name,
          role: st.role,
          fee: getStaffFee(st)
        }
      ]);
      setStaffSearchQuery('');
    }
  };

  const handleSelectServiceFromDropdown = (srv: ResolvedTariffItem) => {
    handleToggleService(srv);
    setServiceSearchQuery('');
    setShowServiceDropdown(false);
  };

  // Load Incoming E-Prescription from POS Antrian E-Resep / Doctor's SOAP
  useEffect(() => {
    if (activePrescription) {
      setPosJalur(activePrescription.isExternalRx ? 'REGULER' : 'KLINIK');
      setCustomer(activePrescription.patientName || 'Pasien Klinik');
      setDoctor(activePrescription.doctorName || 'dr. Anis Prima Dewi');
      setDescription(`E-Resep #${activePrescription.id}`);

      if (activePrescription.assignedStaff && activePrescription.assignedStaff.length > 0) {
        setAssignedStaff(activePrescription.assignedStaff);
      } else if (!activePrescription.isExternalRx) {
        const foundDoc = staffList.find(
          (s) => s.role === 'Dokter' || s.name.toLowerCase().includes('dr.')
        );
        setAssignedStaff([
          {
            staffId: foundDoc?.id || 'STF-02',
            staffName: activePrescription.doctorName || foundDoc?.name || 'dr. Anis Prima Dewi',
            role: 'Dokter',
            fee: currentFees.doctorFee || 20000
          }
        ]);
      } else {
        setAssignedStaff([]);
      }

      const loadedCart: CartItem[] = activePrescription.items.flatMap((it, itemIdx) => {
        if (it.isRacikan && it.racikanIngredients && it.racikanIngredients.length > 0) {
          const racikanTitle = it.racikanName || it.racikanType || 'Racikan';
          return it.racikanIngredients.map((ing, ingIdx) => {
            const med = medicines.find(
              (m) =>
                m.id === ing.medicineId ||
                m.name.toLowerCase().trim() === ing.name.toLowerCase().trim()
            );
            const targetUnit = ing.unit || med?.satuanKecil || med?.unit || 'Tablet';
            const p =
              ing.price > 0
                ? ing.price
                : med
                ? resolvePrice(med, 'Harga Jual 2', targetUnit)
                : 0;
            const itemQty = Math.max(1, Number(ing.totalQty) || 1);
            const tuslahFee = ingIdx === 0 ? 2000 : 0;

            return {
              id: med?.id || ing.medicineId || `EXT-RACIK-${itemIdx}-${ingIdx}`,
              name: `${ing.name} [Racikan: ${racikanTitle}]`,
              qty: itemQty,
              unit: targetUnit,
              tuslah: tuslahFee,
              price: p,
              discount: 0,
              subtotal: p * itemQty + tuslahFee,
              hpp: ing.hpp ?? med?.hpp ?? 0
            };
          });
        }

        const med = medicines.find(
          (m) =>
            m.id === it.medicineId ||
            m.name.toLowerCase().trim() === it.name.toLowerCase().trim() ||
            m.name.toLowerCase().includes(it.name.toLowerCase().trim())
        );

        const targetUnit = it.unit || med?.satuanKecil || med?.unit || 'Strip';
        const priceTier = activePrescription.isExternalRx ? 'Harga Jual 1' : 'Harga Jual 2';
        const p = med
          ? resolvePrice(med, priceTier, targetUnit)
          : Number(it.price) || 0;
        const itemQty = Math.max(1, Number(it.qty) || 1);

        return [
          {
            id: med?.id || it.medicineId || `EXT-MED-${itemIdx + 1}`,
            name: it.name,
            qty: itemQty,
            unit: targetUnit,
            tuslah: 1000, // standard tuslah per prescription item
            price: p,
            discount: 0,
            subtotal: p * itemQty + 1000,
            hpp: med?.hpp || 0
          }
        ];
      });

      setCart(loadedCart);
    }
  }, [activePrescription, medicines, staffList, currentFees]);

  const handleMedSelect = (med: Medicine) => {
    setSelectedMed(med);
    setPluInput(med.name);
    const defUnit = med.satuanKecil || med.unit || 'Strip';
    setUnit(defUnit);
    setPrice(resolvePrice(med, choosePrice, defUnit));
    setShowMedDropdown(false);
  };

  const posMedPool = useMemo(() => {
    if (extraScannedPosMeds.length === 0) return medicines;
    const seen = new Set(medicines.map((m) => m.id));
    return [...medicines, ...extraScannedPosMeds.filter((em) => !seen.has(em.id))];
  }, [medicines, extraScannedPosMeds]);

  const processPosBarcodeScan = async (rawCode: string, fromCamera = false) => {
    const cleaned = rawCode.trim();
    if (!cleaned) return;
    const lower = cleaned.toLowerCase();

    let exactFound = posMedPool.find(
      (m) =>
        (m.barcode && m.barcode.trim().toLowerCase() === lower) ||
        m.id.trim().toLowerCase() === lower
    );

    if (!exactFound && !isDemoMode()) {
      try {
        const res = await fetchMedicineByBarcodeOrIdFromSupabase(cleaned);
        if (res.data) {
          exactFound = res.data;
          setExtraScannedPosMeds((prev) =>
            prev.some((x) => x.id === exactFound!.id) ? prev : [exactFound!, ...prev]
          );
        }
      } catch {
        // Ignore network error and fall back to text match
      }
    }

    if (exactFound) {
      playBarcodeBeep();
      const targetUnit = exactFound.satuanKecil || exactFound.unit || 'Strip';
      const resolvedUnitPrice = resolvePrice(exactFound, choosePrice, targetUnit);

      setCart((prevCart) => {
        const existingIdx = prevCart.findIndex(
          (item) => item.id === exactFound!.id && item.unit === targetUnit && !item.id.startsWith('JASA-')
        );
        if (existingIdx >= 0) {
          return prevCart.map((item, idx) => {
            if (idx !== existingIdx) return item;
            const nextQty = item.qty + 1;
            return {
              ...item,
              qty: nextQty,
              subtotal: Math.max(0, item.price * nextQty + item.tuslah - item.discount)
            };
          });
        }
        const newItem: CartItem = {
          id: exactFound!.id,
          name: exactFound!.name,
          qty: 1,
          unit: targetUnit,
          tuslah: 0,
          price: resolvedUnitPrice,
          discount: 0,
          subtotal: resolvedUnitPrice,
          hpp: exactFound!.hpp || 2000
        };
        return [...prevCart, newItem];
      });

      setPluInput('');
      setSelectedMed(null);
      setShowMedDropdown(false);
      setPosScanNotice({
        type: 'success',
        text: `Ditambahkan: ${exactFound.name} (+1 ${targetUnit})`
      });
      setTimeout(() => setPosScanNotice(null), 3200);
      return;
    }

    if (!fromCamera) {
      const textMatches = posMedPool.filter(
        (m) =>
          m.name.toLowerCase().includes(lower) ||
          (m.kekuatan || '').toLowerCase().includes(lower) ||
          (m.barcode || '').toLowerCase().includes(lower) ||
          m.id.toLowerCase().includes(lower)
      );
      if (textMatches.length === 1) {
        playBarcodeBeep();
        handleMedSelect(textMatches[0]);
        return;
      }
    }

    setPosScanNotice({
      type: 'warning',
      text: `Obat dengan barcode / kode "${cleaned}" tidak ditemukan.`
    });
    setTimeout(() => setPosScanNotice(null), 3500);
  };

  const handleUnitChange = (newUnit: string) => {
    setUnit(newUnit);
    if (selectedMed) {
      setPrice(resolvePrice(selectedMed, choosePrice, newUnit));
    }
  };

  const computedSubtotalInput = useMemo(() => {
    return Math.max(0, Number(price) * Number(qty) + Number(tuslah) - Number(itemDiscount));
  }, [price, qty, tuslah, itemDiscount]);

  const handleAddItem = () => {
    if (!selectedMed && !pluInput) {
      alert('Pilih atau ketik obat terlebih dahulu!');
      return;
    }

    const med =
      selectedMed ||
      medicines.find((m) => m.name.toLowerCase().includes(pluInput.toLowerCase())) ||
      medicines[0];

    const fallbackUnit = unit || med.satuanKecil || med.unit || 'Strip';
    const finalPrice = price > 0 ? price : resolvePrice(med, choosePrice, fallbackUnit);

    const newItem: CartItem = {
      id: med.id,
      name: med.name,
      qty: Number(qty) || 1,
      unit: fallbackUnit,
      tuslah: Number(tuslah) || 0,
      price: finalPrice,
      discount: Number(itemDiscount) || 0,
      subtotal: Math.max(0, finalPrice * (Number(qty) || 1) + Number(tuslah) - Number(itemDiscount)),
      hpp: med.hpp || 2000
    };

    setCart([...cart, newItem]);

    // Reset line inputs
    setPluInput('');
    setSelectedMed(null);
    setShowMedDropdown(false);
    setTuslah(0);
    setQty(1);
    setPrice(0);
    setItemDiscount(0);
  };

  const handleRemoveItem = (idx: number) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  const cartSubtotal = cart.reduce((acc, i) => acc + i.subtotal, 0);

  const posDiscountEval = useMemo(() => {
    if (!salesDiscounts || salesDiscounts.length === 0 || cart.length === 0) return null;
    const lines = cart
      .filter((c) => !c.id.startsWith('JASA-') && !c.id.startsWith('LAB-FEE-'))
      .map((c) => {
        const med = medicines.find((m) => m.id === c.id);
        return {
          medicineId: c.id,
          category: med?.category,
          kelas: med?.kelas,
          qty: c.qty,
          subtotal: c.subtotal
        };
      });
    return findBestCartDiscount(salesDiscounts, lines, posJalur, posVoucherCode);
  }, [salesDiscounts, cart, medicines, posJalur, posVoucherCode]);

  const totalAfterDiscount = Math.max(0, cartSubtotal - Number(overallDiscount));
  const totalBeforeRounding = totalAfterDiscount + Number(serviceCharge) + Number(chargeCC);

  // Pembulatan Otomatis ke atas ke ribuan terdekat (misal 15.230 -> 16.000)
  const pembulatan = totalBeforeRounding > 0 && totalBeforeRounding % 1000 !== 0
    ? (Math.ceil(totalBeforeRounding / 1000) * 1000) - totalBeforeRounding
    : 0;

  const grandTotal = totalBeforeRounding + pembulatan;
  const totalItemsCount = cart.reduce((acc, i) => acc + i.qty, 0);
  const change = Math.max(0, payAmount - grandTotal);

  const handleSaveTransaction = () => {
    if (cart.length === 0) {
      setCheckoutValidationError('Keranjang kasir masih kosong!');
      return;
    }

    if (missingRequiredStaffServices.length > 0) {
      const names = missingRequiredStaffServices.map((s) => s.name).join(', ');
      setCheckoutValidationError(
        `Transaksi belum dapat disimpan! Harap pilih petugas pelaksana pada item jasa wajib: ${names}.`
      );
      setShowPaymentModal(false);
      return;
    }

    const isTempo = paymentMethod === 'Tempo / Piutang';
    if (payAmount < grandTotal && paymentMethod !== 'Kredit / Debit' && !isTempo) {
      setCheckoutValidationError('Nominal uang bayar kurang dari total belanja!');
      return;
    }

    setCheckoutValidationError(null);
    const newTrxId = invoiceNo || `TRX-${Date.now().toString().slice(-6)}`;
    const nowTime = new Date().toLocaleString('id-ID');
    const today = new Date().toISOString().split('T')[0];

    const hppTotal = cart.reduce((acc, i) => acc + i.hpp * i.qty, 0);
    const profit = grandTotal - hppTotal;
    const effectivePaid = isTempo ? Math.min(grandTotal, Number(payAmount) || 0) : Number(payAmount);
    const remaining = isTempo ? Math.max(0, grandTotal - effectivePaid) : 0;
    const paymentStatus: 'Lunas' | 'Belum Lunas' | 'Sebagian' | 'Tempo' = isTempo
      ? remaining <= 0
        ? 'Lunas'
        : effectivePaid > 0
        ? 'Sebagian'
        : 'Belum Lunas'
      : 'Lunas';

    const resolvedCustomerName = customer.trim() || 'Reguler';

    // Aggregate service fee snapshots from cart items (single or multi-recipient) for assignedStaff consistency
    const serviceFeeAggMap = new Map<string, StaffFeeItem>();
    const addToStaffAgg = (
      pid: string,
      name: string,
      roleLabel: string,
      feeAmt: number
    ) => {
      if (!pid || feeAmt <= 0) return;
      const existing = serviceFeeAggMap.get(pid);
      if (existing) {
        existing.fee += feeAmt;
      } else {
        serviceFeeAggMap.set(pid, {
          staffId: pid,
          staffName: name || 'Petugas',
          role: roleLabel,
          fee: feeAmt
        });
      }
    };

    cart.forEach((item) => {
      if (!isJasaCartItem(item)) return;
      if (Array.isArray(item.fee_allocations) && item.fee_allocations.length > 0) {
        item.fee_allocations.forEach((alloc) => {
          if (normalizeServiceFeeRole(alloc.penerima_role) === 'non_petugas') return;
          addToStaffAgg(
            String(alloc.petugas_id || '').trim(),
            alloc.nama_petugas || 'Petugas',
            alloc.role_petugas || getServiceFeeRoleMeta(alloc.penerima_role).shortLabel,
            Math.max(0, Number(alloc.total_fee_item) || 0)
          );
        });
        return;
      }
      addToStaffAgg(
        String(item.petugas_id || '').trim(),
        item.nama_petugas || 'Petugas',
        item.role_petugas || getServiceFeeRoleMeta(item.penerima_role).shortLabel,
        Math.max(0, Number(item.total_fee_item) || 0)
      );
    });

    // Combine cart-level service fees with any non-overlapping header assignedStaff
    const combinedAssignedStaff: StaffFeeItem[] = Array.from(serviceFeeAggMap.values());
    if (posJalur === 'KLINIK') {
      assignedStaff.forEach((st) => {
        if (!serviceFeeAggMap.has(st.staffId)) {
          combinedAssignedStaff.push(st);
        }
      });
      if (combinedAssignedStaff.length === 0) {
        const fallbackDoc = staffList.find(
          (s) => s.status === 'Aktif' && (s.role === 'Dokter' || s.name === doctor)
        );
        combinedAssignedStaff.push({
          staffId: fallbackDoc?.id || 'STF-02',
          staffName: doctor || fallbackDoc?.name || 'dr. Anis Prima Dewi',
          role: 'Dokter',
          fee: currentFees.doctorFee || 20000
        });
      }
    }

    const newTrx: Transaction = {
      id: newTrxId,
      date: nowTime,
      type: posJalur,
      kasir: currentCashierName,
      customerName: resolvedCustomerName,
      doctorName: doctor,
      dueDate: isTempo ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : undefined,
      term: isTempo ? 'Tempo 30 Hari' : undefined,
      paymentStatus,
      paidAmount: effectivePaid,
      remainingAmount: remaining,
      assignedStaff: combinedAssignedStaff.length > 0 ? combinedAssignedStaff : undefined,
      subtotal: cartSubtotal,
      discount: Number(overallDiscount),
      serviceCharge: Number(serviceCharge),
      pembulatan: Number(pembulatan),
      chargeCC: Number(chargeCC),
      total: grandTotal,
      payAmount: effectivePaid,
      change: isTempo ? 0 : change,
      hppTotal,
      profit,
      paymentMethod: isTempo ? 'Tempo / Piutang Pasien' : `${paymentMethod} (${subMethod})`,
      description,
      items: cart,
      branchId
    };

    const runningStock = new Map<string, number>();
    const getNextBalance = (medId: string, deductQty: number): number => {
      const current =
        runningStock.has(medId)
          ? runningStock.get(medId)!
          : medicines.find((m) => m.id === medId)?.stock || 0;
      const nextBal = Math.max(0, current - deductQty);
      runningStock.set(medId, nextBal);
      return nextBal;
    };

    const nowClock = new Date().toLocaleTimeString('id-ID');
    const newMutations: StockMutation[] = [];

    // 1. Mutasi stok item penjualan obat/alkes reguler & resep (hanya untuk item yang terdaftar di katalog inventori)
    cart
      .filter(
        (c) =>
          !c.id.startsWith('JASA-') &&
          !c.id.startsWith('LAB-FEE-') &&
          medicines.some((m) => m.id === c.id)
      )
      .forEach((c) => {
        newMutations.push({
          id: `MUT-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
          date: today,
          time: nowClock,
          medicineId: c.id,
          medicineName: c.name,
          refNo: newTrxId,
          type: posJalur === 'KLINIK' ? 'RESEP_DOKTER' : 'PENJUALAN',
          inQty: 0,
          outQty: c.qty,
          balance: getNextBalance(c.id, c.qty),
          ket: `Penjualan Kasir Jalur ${posJalur} (${resolvedCustomerName})`,
          petugas: currentCashierName,
          branchId
        });
      });

    // 2. Mutasi stok otomatis untuk produk Master Data Produk yang dipakai pada Cek Lab
    cart
      .filter((c) => c.id.startsWith('LAB-FEE-'))
      .forEach((c) => {
        const labRecId = c.id.replace('LAB-FEE-', '');
        let consumedList: LabConsumedProduct[] = c.labConsumedProducts || [];
        if (consumedList.length === 0) {
          const matchedLab = labRecords.find((r) => r.id === labRecId);
          if (matchedLab) {
            const agg = new Map<string, LabConsumedProduct>();
            matchedLab.items.forEach((it) => {
              if (!it.productId) return;
              const q = Math.max(1, Number(it.productQty) || 1);
              const med = medicines.find((m) => m.id === it.productId);
              const prevEntry = agg.get(it.productId);
              if (prevEntry) {
                prevEntry.qty += q;
              } else {
                agg.set(it.productId, {
                  medicineId: it.productId,
                  medicineName: it.productName || med?.name || 'Produk Lab',
                  qty: q,
                  unit: it.productUnit || med?.satuanKecil || med?.unit || 'Pcs',
                  unitPrice: it.productUnitPrice ?? (Number(med?.sellPriceKlinik) || Number(med?.sellPrice) || 0),
                  hpp: med?.hpp || 0
                });
              }
            });
            consumedList = Array.from(agg.values());
            if (consumedList.length > 0) {
              c.labConsumedProducts = consumedList;
            }
          }
        }

        consumedList.forEach((lp) => {
          const deductQty = Math.max(1, Number(lp.qty) || 1) * Math.max(1, Number(c.qty) || 1);
          const med = medicines.find((m) => m.id === lp.medicineId);
          newMutations.push({
            id: `MUT-LAB-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
            date: today,
            time: nowClock,
            medicineId: lp.medicineId,
            medicineName: lp.medicineName || med?.name || 'Produk Lab',
            refNo: newTrxId,
            type: posJalur === 'KLINIK' ? 'RESEP_DOKTER' : 'PENJUALAN',
            inQty: 0,
            outQty: deductQty,
            balance: getNextBalance(lp.medicineId, deductQty),
            ket: `Pemakaian Produk Cek Lab (${labRecId}) - ${resolvedCustomerName}`,
            petugas: currentCashierName,
            branchId,
            hpp: (lp.hpp || med?.hpp || 0) * deductQty
          });
        });
      });

    onSaveTransaction(newTrx, newMutations);
    setLastFinishedTrx(newTrx);

    // Reset Form
    setCart([]);
    setCustomer('');
    setAssignedStaff([]);
    onClearActivePrescription();
    setInvoiceNo(`INV-${Date.now().toString().slice(-6)}`);
    setPayAmount(0);
    setOverallDiscount(0);
    setPosVoucherCode('');
    setServiceCharge(0);
    setDescription('');
    setShowPaymentModal(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col min-h-[580px] text-xs font-sans overflow-hidden">
      {/* Top Cashier Shift & Session Management Bar (Buka & Tutup Kasir) */}
      <div className="px-4 py-3 bg-slate-900 text-white border-b border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Shift & Ringkasan Kas Laci */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                  activeShift
                    ? activeShift.status === 'Ditolak (Hitung Ulang)'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-400/40'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40'
                    : pendingApprovalShifts.length > 0
                    ? 'bg-amber-500/20 text-amber-400 border-amber-400/40 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-xs uppercase tracking-wide">
                    Manajemen Sesi &amp; Shift Kasir
                  </span>
                  {activeShift ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        activeShift.status === 'Ditolak (Hitung Ulang)'
                          ? 'bg-rose-500 text-white'
                          : 'bg-emerald-500 text-slate-950'
                      }`}
                    >
                      {activeShift.status === 'Ditolak (Hitung Ulang)'
                        ? 'DITOLAK APJ / OWNER — HITUNG ULANG'
                        : `SHIFT AKTIF: ${activeShift.shiftName}`}
                    </span>
                  ) : pendingApprovalShifts.length > 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 animate-pulse">
                      MENUNGGU APPROVAL TUTUP KASIR ({pendingApprovalShifts.length})
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      BELUM BUKA SHIFT
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300 mt-0.5">
                  <span>
                    Kasir: <strong className="text-white">{activeShift?.cashierName || currentCashierName}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Modal Awal:{' '}
                    <strong className="font-mono text-sky-300">
                      Rp {shiftSalesSummary.openingFloat.toLocaleString('id-ID')}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Omset Tunai Sistem:{' '}
                    <strong className="font-mono text-emerald-300">
                      Rp {shiftSalesSummary.cashSales.toLocaleString('id-ID')}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Kas Seharusnya di Laci:{' '}
                    <strong className="font-mono text-amber-300">
                      Rp {shiftSalesSummary.expectedCashInDrawer.toLocaleString('id-ID')}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Buttons: Buka Kasir, Tutup Kasir, Riwayat Shift */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOpenShiftModal(true)}
              disabled={Boolean(activeShift)}
              className={`px-3.5 py-2 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition shadow-sm ${
                activeShift
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer active:scale-95'
              }`}
              title={
                activeShift
                  ? `Shift sedang aktif (${activeShift.id})`
                  : 'Buka sesi shift kasir & input modal awal laci (cash float)'
              }
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Buka Kasir</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCloseShiftModal}
              className="px-3.5 py-2 rounded-xl font-extrabold text-xs bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition shadow-sm cursor-pointer active:scale-95"
              title="Tutup kasir & input rincian lembar denominasi uang fisik di laci"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Tutup Kasir</span>
            </button>

            <button
              type="button"
              onClick={() => setShowShiftHistoryModal(true)}
              className="px-3 py-2 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
              title="Lihat Riwayat Buka-Tutup Kasir & Sinkronisasi Supabase"
            >
              <History className="w-3.5 h-3.5 text-sky-400" />
              <span>Riwayat Shift ({cashierShifts.length})</span>
              {pendingApprovalShifts.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black text-[10px]">
                  {pendingApprovalShifts.length}
                </span>
              )}
            </button>

            {onSyncShiftsSupabase && (
              <button
                type="button"
                onClick={handleRunShiftSupabaseSync}
                disabled={isSyncingShifts}
                className="px-2.5 py-2 rounded-xl font-bold text-[11px] bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
                title="Sinkronisasi 2-arah Riwayat Shift Kasir ke Supabase"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingShifts ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync Shift</span>
              </button>
            )}

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setShowShiftSchemaModal(true)}
                className={`px-2.5 py-2 rounded-xl font-bold text-[11px] border flex items-center gap-1.5 transition cursor-pointer ${
                  shiftsNeedsTableSetup && !isDemoSandbox
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Skema SQL Tabel riwayat_shift_kasir Supabase"
              >
                <Code className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden md:inline">SQL Shift</span>
              </button>
            )}
          </div>
        </div>

        {/* Real-Time Alert & Approval Panel for Shifts with Discrepancy (Menunggu Approval Tutup Kasir) */}
        {pendingApprovalShifts.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/90 via-slate-900 to-rose-950/80 border border-amber-500/50 text-amber-100 space-y-3 animate-in fade-in">
            {pendingApprovalShifts.map((pShift) => (
              <div key={pShift.id} className="space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-xs uppercase tracking-wide text-amber-300">
                          [NOTIFIKASI REAL-TIME] Menunggu Approval Tutup Kasir #{pShift.id}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] ${
                            pShift.difference > 0
                              ? 'bg-sky-500/30 text-sky-200 border border-sky-400/40'
                              : 'bg-rose-500/30 text-rose-200 border border-rose-400/40'
                          }`}
                        >
                          Selisih {pShift.differenceStatus}:{' '}
                          {pShift.difference > 0 ? '+' : '-'}Rp{' '}
                          {Math.abs(pShift.difference).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        Petugas: <strong>{pShift.cashierName}</strong> ({pShift.shiftName}) · Waktu Tutup:{' '}
                        <span className="font-mono">{pShift.closeTime}</span> · Kas Sistem Seharusnya:{' '}
                        <strong className="font-mono text-white">
                          Rp {pShift.expectedCashInDrawer.toLocaleString('id-ID')}
                        </strong>{' '}
                        (Modal Rp {pShift.openingFloat.toLocaleString('id-ID')} + Omset Tunai Rp{' '}
                        {pShift.systemCashSales.toLocaleString('id-ID')}) vs Kas Fisik di Laci:{' '}
                        <strong className="font-mono text-amber-300">
                          Rp {pShift.physicalCashInDrawer.toLocaleString('id-ID')}
                        </strong>
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {pShift.denominations.map((d) => (
                          <span
                            key={d.nominal}
                            className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-[10px] font-mono text-slate-200"
                          >
                            {d.label}: <strong>{d.sheets} lbr</strong> (Rp{' '}
                            {d.subtotal.toLocaleString('id-ID')})
                          </span>
                        ))}
                      </div>
                      {pShift.closingNotes && (
                        <p className="text-[11px] text-amber-200/90 italic mt-1">
                          Catatan Kasir: "{pShift.closingNotes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* APJ / Owner Approval Controls */}
                  {isSuperAdmin ? (
                    <div className="flex flex-wrap items-center gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-amber-500/30">
                      <input
                        type="text"
                        placeholder="Catatan APJ / Owner..."
                        value={approvalNotesInput[pShift.id] || ''}
                        onChange={(e) =>
                          setApprovalNotesInput({
                            ...approvalNotesInput,
                            [pShift.id]: e.target.value
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs w-48 outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onApproveRejectShift?.(
                            pShift.id,
                            'APPROVE',
                            approvalNotesInput[pShift.id] || 'Selisih telah diverifikasi & disetujui APJ / Owner'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer transition shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve Tutup Kasir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onApproveRejectShift?.(
                            pShift.id,
                            'REJECT',
                            approvalNotesInput[pShift.id] || 'Ditolak APJ / Owner — mohon hitung ulang uang fisik di laci'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer transition shadow-xs"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Reject (Hitung Ulang)</span>
                      </button>
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200 font-bold">
                      Menunggu verifikasi &amp; persetujuan dari akun <strong>APJ / Owner</strong>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Jalur & Customer Selector */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-700 text-xs uppercase tracking-wider">
              JENIS TRANSAKSI:
            </span>
            <button
              onClick={() => setPosJalur('REGULER')}
              className={`px-3 py-1.5 rounded-xl font-bold transition text-xs cursor-pointer ${
                posJalur === 'REGULER'
                  ? 'bg-green-600 text-white border border-green-700 shadow-xs ring-2 ring-green-300'
                  : 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
              }`}
            >
              REGULER
            </button>
            <button
              onClick={() => setPosJalur('KLINIK')}
              className={`px-3 py-1.5 rounded-xl font-bold transition text-xs cursor-pointer ${
                posJalur === 'KLINIK'
                  ? 'bg-red-600 text-white border border-red-700 shadow-xs ring-2 ring-red-300'
                  : 'bg-red-100 text-red-800 border border-red-300 hover:bg-red-200'
              }`}
            >
              DPM INTERNAL
            </button>
            <button
              onClick={() => setPosJalur('MITRA')}
              className={`px-3 py-1.5 rounded-xl font-bold transition text-xs cursor-pointer ${
                posJalur === 'MITRA'
                  ? 'bg-blue-600 text-white border border-blue-700 shadow-xs ring-2 ring-blue-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200'
              }`}
            >
              MITRA
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenPrescriptionQueueModal}
              className={`px-3.5 py-1.5 rounded-xl font-extrabold text-xs flex items-center gap-2 cursor-pointer transition shadow-xs border ${
                posPrescriptionQueue.length > 0
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-600 ring-2 ring-amber-300/70'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title="Buka daftar Antrian E-Resep yang sudah lolos skrining & dikirim ke POS Kasir"
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Antrian E-Resep</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black font-mono ${
                  posPrescriptionQueue.length > 0
                    ? 'bg-slate-900 text-amber-300'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {posPrescriptionQueue.length}
              </span>
            </button>

            <div className="text-[11px] font-bold text-sky-800 bg-sky-50 px-3 py-1 rounded-xl border border-sky-200">
              Skema Aktif: <strong>{choosePrice}</strong>
            </div>
          </div>
        </div>

        {/* Active Loaded E-Resep Banner */}
        {activePrescription && (
          <div className="p-2.5 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-sky-50 border border-emerald-300 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <FileCheck className="w-4 h-4" />
              </span>
              <div>
                <div className="font-black text-emerald-950 flex flex-wrap items-center gap-1.5">
                  <span>Memproses E-Resep #{activePrescription.id}</span>
                  {activePrescription.isExternalRx && (
                    <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 text-[9px] uppercase">
                      Rx Luar
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-emerald-800">
                  Pasien: <strong>{activePrescription.patientName}</strong> · Dokter:{' '}
                  <strong>{activePrescription.doctorName}</strong> ({activePrescription.items.length} item R/)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenPrescriptionQueueModal}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[11px] cursor-pointer transition"
              >
                Ganti E-Resep
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearActivePrescription();
                  setCart([]);
                  setCustomer('');
                  setDoctor('Internal');
                  setAssignedStaff([]);
                  setDescription('');
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition"
                title="Batalkan pemuatan E-Resep ini dan kembalikan ke antrian"
              >
                <X className="w-3.5 h-3.5" />
                <span>Batal / Kembalikan</span>
              </button>
            </div>
          </div>
        )}

        {/* Customer & Doctor Input */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 flex gap-3 min-w-[300px]">
            <div className="flex-1 relative" ref={customerDropdownRef}>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Pelanggan / Pasien
              </label>
              <input
                type="text"
                value={customer}
                onChange={(e) => {
                  setCustomer(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => {
                  if (customer.trim().length > 0) setShowCustomerDropdown(true);
                }}
                className="w-full p-2 border rounded-xl font-bold bg-white text-slate-800"
              />
              {showCustomerDropdown && customer.trim().length > 0 && (
                <div className="absolute z-40 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 italic">
                      Tidak ditemukan...
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setCustomer(c.name);
                          setShowCustomerDropdown(false);
                        }}
                        className="p-2.5 hover:bg-sky-50 cursor-pointer transition-colors"
                      >
                        <div className="font-bold text-slate-800 flex items-center justify-between">
                          <span>{c.name}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                            {c.id}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {posJalur === 'MITRA' 
                            ? (c as Mitra).address 
                            : `${(c as Patient).category} · ${(c as Patient).phone || 'No Phone'}`}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Dokter Peresep
              </label>
              <select
                value={doctor}
                onChange={(e) => setDoctor(e.target.value)}
                className="w-full p-2 border rounded-xl font-bold bg-white text-slate-800"
              >
                <option value="Internal">Internal Apotek / OTC</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tombol + Biaya Cek Lab (Hanya ditampilkan jika ada pemeriksaan Lab yang belum pernah dibayar di POS Kasir) */}
            {matchingCustomerLabRecords.length > 0 && (
              <div className="shrink-0 flex items-end">
                <button
                  type="button"
                  onClick={handleAddLabFeeToCart}
                  className={`h-[38px] px-3.5 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-xs ${
                    isLabFeeAlreadyInCart
                      ? 'bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-200 cursor-pointer'
                      : 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer ring-2 ring-purple-300'
                  }`}
                  title={`Tambahkan biaya cek lab ${matchingCustomerLabRecords[0].patientName} (Rp ${(
                    matchingCustomerLabRecords[0].cost || 50000
                  ).toLocaleString('id-ID')})`}
                >
                  <FlaskConical className="w-4 h-4" />
                  <span>+ Biaya Cek Lab</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-purple-800 text-white font-black">
                    {matchingCustomerLabRecords.length}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Grand Total Display */}
          <div className="text-right pl-6 border-l border-slate-200">
            <span className="text-xs font-bold text-slate-400 block">
              {cart.length} Jenis / {totalItemsCount} Item
            </span>
            <div className="text-3xl font-black font-mono text-slate-900 tracking-tight">
              Rp {grandTotal.toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        {/* Notifikasi Cek Lab Pasien jika ada */}
        {matchingCustomerLabRecords.length > 0 && (
          <div className="p-2.5 bg-gradient-to-r from-purple-50 via-purple-50/70 to-indigo-50 border border-purple-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <FlaskConical className="w-4 h-4" />
              </span>
              <div>
                <span className="font-extrabold text-purple-950">
                  Tersedia Hasil Cek Lab Pasien ({matchingCustomerLabRecords[0].patientName}):
                </span>
                <span className="text-slate-600 ml-1.5 text-[11px]">
                  {matchingCustomerLabRecords[0].items.map((i) => i.parameter).filter(Boolean).slice(0, 3).join(', ')}
                  {' · '}
                  <strong className="text-purple-700 font-mono">
                    Rp {(matchingCustomerLabRecords[0].cost || 50000).toLocaleString('id-ID')}
                  </strong>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddLabFeeToCart}
              className={`px-3 py-1 rounded-lg font-extrabold text-[11px] transition shadow-xs flex items-center gap-1 cursor-pointer ${
                isLabFeeAlreadyInCart
                  ? 'bg-purple-100 text-purple-800 border border-purple-300'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isLabFeeAlreadyInCart ? 'Sudah di Keranjang' : '+ Masukkan ke Keranjang Kasir'}</span>
            </button>
          </div>
        )}

        {/* Compact Bar: Petugas Layanan (Jalur Klinik) & Daftar Jasa Layanan (Semua Tier POS) */}
        <div className={`grid grid-cols-1 ${posJalur === 'KLINIK' ? 'md:grid-cols-2' : ''} gap-2.5`}>
          {posJalur === 'KLINIK' && (
            <div className="p-2.5 bg-gradient-to-r from-indigo-50/80 via-white to-sky-50/70 rounded-xl border border-indigo-200/90 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 font-extrabold text-slate-800 text-[11px] uppercase tracking-wide">
                  <Users className="w-3.5 h-3.5 text-indigo-700" />
                  <span>Petugas Layanan Klinik (Header)</span>
                </label>
                {assignedStaff.length > 0 && (
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                    {assignedStaff.length} dipilih
                  </span>
                )}
              </div>

              <div className="relative" ref={staffDropdownRef}>
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={staffSearchQuery}
                  onFocus={() => setShowStaffSelector(true)}
                  onChange={(e) => {
                    setStaffSearchQuery(e.target.value);
                    setShowStaffSelector(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowStaffSelector(false);
                    } else if (e.key === 'Enter' && selectableStaffOptions.length > 0) {
                      e.preventDefault();
                      handleToggleAssignedStaff(selectableStaffOptions[0] as Staff);
                    }
                  }}
                  placeholder="Cari & pilih nama petugas layanan..."
                  className="w-full pl-8 pr-12 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {staffSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStaffSearchQuery('')}
                      className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Bersihkan pencarian"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowStaffSelector((prev) => !prev)}
                    className="p-1 text-slate-500 hover:text-indigo-700 cursor-pointer"
                    title="Buka/tutup daftar petugas"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${showStaffSelector ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>

                {showStaffSelector && (
                  <div className="absolute z-40 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                    {selectableStaffOptions.length === 0 ? (
                      <div className="px-3 py-2.5 text-xs text-slate-400 italic text-center">
                        Petugas tidak ditemukan
                      </div>
                    ) : (
                      selectableStaffOptions.map((st) => {
                        const isSelected = assignedStaff.some((s) => s.staffId === st.id);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => handleToggleAssignedStaff(st as Staff)}
                            className={`w-full text-left px-3 py-2 text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50 text-indigo-900 font-bold'
                                : 'hover:bg-slate-50 text-slate-800 font-semibold'
                            }`}
                          >
                            <span className="truncate">{st.name}</span>
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 shrink-0">
                                <Check className="w-3.5 h-3.5" />
                                Dipilih
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 shrink-0">Pilih</span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {assignedStaff.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {assignedStaff.map((st) => (
                    <span
                      key={st.staffId}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-[11px] font-semibold text-slate-800 shadow-2xs"
                    >
                      <span className="truncate max-w-[180px]">{st.staffName}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setAssignedStaff(assignedStaff.filter((s) => s.staffId !== st.staffId))
                        }
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Hapus petugas dari transaksi ini"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Kolom Daftar Jasa Layanan (Tersedia untuk semua tier POS: Reguler, DPM Internal/Klinik, Mitra) */}
          <div className="p-2.5 bg-gradient-to-r from-indigo-50/80 via-white to-sky-50/70 rounded-xl border border-indigo-200/90 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 font-extrabold text-slate-800 text-[11px] uppercase tracking-wide">
                <Stethoscope className="w-3.5 h-3.5 text-indigo-700" />
                <span>Daftar Jasa Layanan ({posJalur})</span>
              </label>
              {selectedServicesCount > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  {selectedServicesCount} di Tabel POS
                </span>
              )}
            </div>

            <div className="relative" ref={serviceDropdownRef}>
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={serviceSearchQuery}
                onFocus={() => setShowServiceDropdown(true)}
                onChange={(e) => {
                  setServiceSearchQuery(e.target.value);
                  setShowServiceDropdown(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowServiceDropdown(false);
                  } else if (e.key === 'Enter' && filteredServices.length > 0) {
                    e.preventDefault();
                    handleSelectServiceFromDropdown(filteredServices[0]);
                  }
                }}
                placeholder="Cari & klik jasa/tindakan/konseling untuk masuk tabel POS..."
                className="w-full pl-8 pr-12 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {serviceSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setServiceSearchQuery('')}
                    className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Bersihkan pencarian"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowServiceDropdown((prev) => !prev)}
                  className="p-1 text-slate-500 hover:text-indigo-700 cursor-pointer"
                  title="Buka/tutup daftar jasa layanan"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${showServiceDropdown ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              {showServiceDropdown && (
                <div className="absolute z-40 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {filteredServices.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-400 italic text-center">
                      Jasa layanan tidak ditemukan
                    </div>
                  ) : (
                    filteredServices.map((srv) => {
                      const isSelected = cart.some((c) => c.id === srv.id);
                      const recipients = srv.fee_recipients || [];
                      const hasRequired = recipients.some(
                        (r) => r.penerima_role !== 'non_petugas' && r.wajib_pilih_petugas
                      );
                      return (
                        <button
                          key={srv.id}
                          type="button"
                          onClick={() => handleSelectServiceFromDropdown(srv)}
                          className={`w-full text-left px-3 py-2 text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50 text-indigo-900'
                              : 'hover:bg-sky-50/70 text-slate-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold truncate flex items-center gap-1.5">
                              <span className="truncate">{srv.name}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[10px]">
                              <span className="text-slate-400">{srv.category}</span>
                              {recipients.map((rcp, rIdx) => {
                                const roleMeta = getServiceFeeRoleMeta(rcp.penerima_role);
                                return (
                                  <span
                                    key={rcp.id || rIdx}
                                    className={`px-1.5 py-0 rounded border text-[9px] font-bold ${roleMeta.badgeClass}`}
                                  >
                                    {roleMeta.shortLabel}
                                  </span>
                                );
                              })}
                              {hasRequired && (
                                <span className="px-1.5 py-0 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-bold">
                                  Wajib Petugas
                                </span>
                              )}
                              {isSuperAdmin && srv.total_unit_fee_petugas > 0 && (
                                <span className="text-emerald-700 font-mono font-semibold">
                                  Fee Rp {srv.total_unit_fee_petugas.toLocaleString('id-ID')}
                                </span>
                              )}
                              {isSuperAdmin && (
                                <span className="text-sky-700 font-mono font-semibold">
                                  · Fasilitas Rp {srv.fee_fasilitas_preview.toLocaleString('id-ID')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-[11px] text-slate-700">
                              Rp {srv.price.toLocaleString('id-ID')}
                            </span>
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold">
                                <Check className="w-3 h-3" />
                                Di POS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                <Plus className="w-3 h-3" />
                                Tambah
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Item Input Row */}
      <div className="p-3 border-b border-slate-200 bg-slate-100 grid grid-cols-12 gap-2 items-end text-[11px]">
        {/* PLU / Medicine search & Barcode Scanner */}
        <div className="col-span-4 relative" ref={medDropdownRef}>
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <label className="block font-bold text-slate-600 text-[10px]">
              Pencarian Obat (PLU / Barcode)
            </label>
            {posScanNotice && (
              <span
                className={`text-[10px] font-bold truncate ${
                  posScanNotice.type === 'success' ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {posScanNotice.text}
              </span>
            )}
          </div>
          <div className="flex gap-1.5 items-center">
            <div className="relative flex-1 min-w-0">
              <ScanBarcode className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Ketik nama atau scan barcode + Enter..."
                value={pluInput}
                onChange={(e) => {
                  setPluInput(e.target.value);
                  setShowMedDropdown(true);
                }}
                onFocus={() => setShowMedDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowMedDropdown(false);
                  } else if (e.key === 'Enter' && pluInput.trim()) {
                    e.preventDefault();
                    processPosBarcodeScan(pluInput, false);
                  }
                }}
                className="w-full pl-8 pr-2 py-2 border rounded-xl bg-white font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowPosBarcodeScanner(true)}
              title="Scan Barcode Menggunakan Kamera"
              className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1 shrink-0 cursor-pointer transition"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden xl:inline text-[10px]">Scan</span>
            </button>
          </div>

          {showMedDropdown && (() => {
            const qLower = deferredPluInput.toLowerCase();
            const matchedPool = posMedPool.filter(
              (m) =>
                !qLower ||
                m.name.toLowerCase().includes(qLower) ||
                (m.kekuatan || '').toLowerCase().includes(qLower) ||
                (m.barcode || '').toLowerCase().includes(qLower) ||
                m.id.toLowerCase().includes(qLower)
            );
            const visiblePool = matchedPool.slice(0, 40);
            return (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y">
                {visiblePool.map((m, idx) => (
                  <div
                    key={`${m.id}-${idx}`}
                    onClick={() => handleMedSelect(m)}
                    className="p-2 hover:bg-sky-50 cursor-pointer text-xs flex justify-between items-center"
                  >
                    <div>
                      <strong className="text-slate-800 block">
                        {m.name}{' '}
                        {m.kekuatan && m.kekuatan !== '-' ? (
                          <span className="font-mono font-semibold text-slate-500 text-[10px]">
                            ({m.kekuatan})
                          </span>
                        ) : null}
                      </strong>
                      <span className="text-[10px] text-slate-500">
                        Stok: {m.stock} {m.unit} · {m.rack}
                        {m.barcode ? ` · ${m.barcode}` : ''}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-sky-700">
                      Rp {resolvePrice(m, choosePrice, m.satuanKecil || m.unit).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
                {matchedPool.length > 40 && (
                  <div className="px-2.5 py-1.5 bg-slate-50 text-[10px] font-semibold text-slate-500 text-center">
                    Menampilkan 40 dari {matchedPool.length} obat. Ketik lebih spesifik atau scan barcode.
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Satuan */}
        <div className="col-span-2">
          <label className="block font-bold text-slate-600 text-[10px] mb-0.5">Satuan</label>
          <select
            value={unit}
            onChange={(e) => handleUnitChange(e.target.value)}
            className="w-full p-2 border rounded-xl bg-white font-bold"
          >
            {selectedMed ? (
              <>
                <option value={selectedMed.satuanKecil || selectedMed.unit}>
                  {selectedMed.satuanKecil || selectedMed.unit} (Kecil)
                </option>
                {selectedMed.satuanBesar && (
                  <option value={selectedMed.satuanBesar}>
                    {selectedMed.satuanBesar} (Besar / 1:{selectedMed.rasioKonversi})
                  </option>
                )}
              </>
            ) : (
              <option value="Strip">Strip</option>
            )}
          </select>
        </div>

        {/* Qty */}
        <div className="col-span-1">
          <label className="block font-bold text-slate-600 text-[10px] mb-0.5">Qty</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full p-2 border rounded-xl bg-white font-mono font-bold text-center"
          />
        </div>

        {/* Tuslah */}
        <div className="col-span-1">
          <label className="block font-bold text-slate-600 text-[10px] mb-0.5">Tuslah (Rp)</label>
          <input
            type="number"
            value={tuslah}
            onChange={(e) => setTuslah(parseInt(e.target.value) || 0)}
            className="w-full p-2 border rounded-xl bg-white font-mono font-bold text-center"
          />
        </div>

        {/* Harga @ */}
        <div className="col-span-2">
          <label className="block font-bold text-slate-600 text-[10px] mb-0.5">Harga @ (Rp)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
            className="w-full p-2 border rounded-xl bg-white font-mono font-bold text-right text-sky-900"
          />
        </div>

        {/* Subtotal Item & Add button */}
        <div className="col-span-2 flex gap-1.5 items-end">
          <div className="flex-1">
            <label className="block font-bold text-slate-600 text-[10px] mb-0.5">Subtotal</label>
            <input
              type="text"
              readOnly
              value={`Rp ${computedSubtotalInput.toLocaleString('id-ID')}`}
              className="w-full p-2 border rounded-xl bg-slate-200 text-right font-black font-mono text-slate-800"
            />
          </div>
          <button
            onClick={handleAddItem}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cart Items Table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-2.5 border-r">Nama Obat / Barang</th>
              <th className="p-2.5 border-r text-center w-16">Qty</th>
              <th className="p-2.5 border-r text-center w-20">Satuan</th>
              <th className="p-2.5 border-r text-right w-24">Tuslah</th>
              <th className="p-2.5 border-r text-right w-28">Harga Satuan</th>
              <th className="p-2.5 border-r text-right w-24">Diskon</th>
              <th className="p-2.5 text-right w-36">Subtotal Netto</th>
              <th className="p-2.5 text-center w-12">#</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
            {cart.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-slate-400 italic">
                  <ShoppingBag className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  Keranjang belanja kasir masih kosong.
                </td>
              </tr>
            ) : (
              cart.map((item, idx) => {
                const isJasa = isJasaCartItem(item);
                const itemAllocations: CartServiceFeeAllocation[] =
                  isJasa && Array.isArray(item.fee_allocations) && item.fee_allocations.length > 0
                    ? item.fee_allocations
                    : isJasa
                    ? [
                        {
                          rule_id: 'RCP-1',
                          penerima_role: normalizeServiceFeeRole(item.penerima_role || 'non_petugas'),
                          wajib_pilih_petugas: Boolean(item.wajib_pilih_petugas),
                          tipe_fee: normalizeServiceFeeType(item.tipe_fee || 'nominal'),
                          nilai_fee: Number(item.nilai_fee ?? item.nominal_fee_satuan ?? 0),
                          nominal_fee_satuan: Number(item.nominal_fee_satuan) || 0,
                          total_fee_item: Number(item.total_fee_item) || 0,
                          petugas_id: item.petugas_id || '',
                          nama_petugas: item.nama_petugas || '',
                          role_petugas: item.role_petugas || ''
                        }
                      ]
                    : [];

                const missingStaff = itemAllocations.some(
                  (alloc) =>
                    Boolean(alloc.wajib_pilih_petugas) &&
                    normalizeServiceFeeRole(alloc.penerima_role) !== 'non_petugas' &&
                    !String(alloc.petugas_id || '').trim()
                );

                const { totalServiceFee, facilityShare } = isJasa
                  ? calculateFacilityShareForCartItem(item)
                  : { totalServiceFee: 0, facilityShare: 0 };

                return (
                  <tr key={`${item.id}-${idx}`} className={`hover:bg-slate-50 transition ${missingStaff ? 'bg-rose-50/40' : ''}`}>
                    <td className="p-2.5 border-r font-bold text-slate-900">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{item.name}</span>
                        {isJasa && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                            Jasa Layanan
                          </span>
                        )}
                        {itemAllocations.map((alloc, aIdx) => {
                          const roleMeta = getServiceFeeRoleMeta(alloc.penerima_role);
                          return (
                            <span
                              key={alloc.rule_id || aIdx}
                              className={`px-1.5 py-0.2 rounded border text-[9px] font-bold shrink-0 ${roleMeta.badgeClass}`}
                            >
                              {roleMeta.shortLabel}
                            </span>
                          );
                        })}
                        {item.id.startsWith('LAB-FEE-') && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                            Cek Lab
                          </span>
                        )}
                      </div>

                      {isJasa && itemAllocations.some((a) => normalizeServiceFeeRole(a.penerima_role) !== 'non_petugas') && (
                        <div className="mt-1.5 space-y-1.5 font-normal">
                          {itemAllocations.map((alloc, aIdx) => {
                            const allocRole = normalizeServiceFeeRole(alloc.penerima_role);
                            if (allocRole === 'non_petugas') return null;
                            const allocRoleMeta = getServiceFeeRoleMeta(allocRole);
                            const eligibleStaff = filterEligibleStaffForService(staffList, allocRole);
                            const allocMissing =
                              Boolean(alloc.wajib_pilih_petugas) && !String(alloc.petugas_id || '').trim();
                            const allocUnitFee = Number(alloc.nominal_fee_satuan) || 0;
                            const allocTotalFee = Number(alloc.total_fee_item) || 0;

                            return (
                              <div key={alloc.rule_id || aIdx} className="flex flex-wrap items-center gap-2">
                                <select
                                  value={alloc.petugas_id || ''}
                                  onChange={(e) =>
                                    handleUpdateServiceAllocationStaff(idx, aIdx, e.target.value)
                                  }
                                  className={`px-2 py-1 rounded-lg border text-[11px] font-bold outline-none max-w-[260px] ${
                                    allocMissing
                                      ? 'border-rose-400 bg-rose-50 text-rose-900 ring-1 ring-rose-300'
                                      : alloc.petugas_id
                                      ? 'border-emerald-300 bg-emerald-50/50 text-slate-900'
                                      : 'border-slate-300 bg-white text-slate-700'
                                  }`}
                                >
                                  <option value="">
                                    -- Pilih {allocRoleMeta.shortLabel} {alloc.wajib_pilih_petugas ? '(Wajib)' : '(Opsional)'} --
                                  </option>
                                  {eligibleStaff.map((st) => (
                                    <option key={st.id} value={st.id}>
                                      {st.name} ({st.role})
                                    </option>
                                  ))}
                                </select>
                                {allocMissing && (
                                  <span className="text-[10px] font-extrabold text-rose-600 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Wajib pilih {allocRoleMeta.shortLabel}!
                                  </span>
                                )}
                                {isSuperAdmin && !allocMissing && allocUnitFee > 0 && alloc.petugas_id && (
                                  <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    Fee {allocRoleMeta.shortLabel}: Rp {allocTotalFee.toLocaleString('id-ID')}
                                    {item.qty > 1 ? ` (@ Rp ${allocUnitFee.toLocaleString('id-ID')} × ${item.qty})` : ''}
                                  </span>
                                )}
                                {eligibleStaff.length === 0 && (
                                  <span className="text-[10px] text-amber-700 font-semibold">
                                    Belum ada petugas aktif dengan role {allocRoleMeta.shortLabel}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {isSuperAdmin && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <span className="text-[10px] font-mono font-bold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                                Bagi Hasil Fasilitas: Rp {facilityShare.toLocaleString('id-ID')}
                              </span>
                              {totalServiceFee > 0 && (
                                <span className="text-[10px] font-mono text-slate-500">
                                  (Total Fee Petugas: Rp {totalServiceFee.toLocaleString('id-ID')})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {isSuperAdmin && isJasa && itemAllocations.every((a) => normalizeServiceFeeRole(a.penerima_role) === 'non_petugas') && (
                        <div className="mt-1 text-[10px] font-normal text-slate-400">
                          Komponen sarana/administrasi (100% Fasilitas · Fee petugas Rp 0)
                        </div>
                      )}

                      {item.labConsumedProducts && item.labConsumedProducts.length > 0 && (
                        <div className="mt-0.5 text-[10px] font-medium text-purple-700">
                          Potong Stok Otomatis:{' '}
                          {item.labConsumedProducts
                            .map((lp) => `${lp.medicineName} ×${lp.qty}`)
                            .join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 border-r text-center font-mono font-bold">
                      {isJasa ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartItemQty(idx, item.qty - 1)}
                            disabled={item.qty <= 1}
                            className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-bold text-xs cursor-pointer"
                          >
                            -
                          </button>
                          <span className="min-w-[18px] text-center">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartItemQty(idx, item.qty + 1)}
                            className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-xs cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        item.qty
                      )}
                    </td>
                    <td className="p-2.5 border-r text-center text-[11px] font-semibold">{item.unit}</td>
                    <td className="p-2.5 border-r text-right font-mono">Rp {item.tuslah.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 border-r text-right font-mono">Rp {item.price.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 border-r text-right font-mono text-rose-600">Rp {item.discount.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 text-right font-mono font-black text-sky-800">Rp {item.subtotal.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-400 hover:text-rose-600 transition"
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

      {/* Inline Checkout Validation Warning */}
      {(checkoutValidationError || missingRequiredStaffServices.length > 0) && (
        <div className="px-4 py-2.5 bg-rose-50 border-t border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              {checkoutValidationError ||
                `Pilih petugas pelaksana untuk item jasa wajib (${missingRequiredStaffServices
                  .map((s) => s.name)
                  .join(', ')}) sebelum melakukan pembayaran.`}
            </span>
          </div>
          {checkoutValidationError && (
            <button
              type="button"
              onClick={() => setCheckoutValidationError(null)}
              className="p-1 rounded hover:bg-rose-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Footer Controls & Payment Trigger */}
      <div className="border-t border-slate-200 bg-slate-50 grid grid-cols-12 gap-3 p-3 items-center">
        <div className="col-span-8 grid grid-cols-12 gap-2 text-xs">
          <div className="col-span-4">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
              Catatan Transaksi
            </label>
            <input
              type="text"
              placeholder="Keterangan opsional..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-1.5 border rounded-lg bg-white"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 flex items-center gap-1">
              <TicketPercent className="w-3 h-3 text-sky-600" />
              <span>Kode Promo</span>
            </label>
            <div className="flex gap-1">
              <input
                type="text"
                placeholder="KODE..."
                value={posVoucherCode}
                onChange={(e) => setPosVoucherCode(e.target.value.toUpperCase())}
                className="w-full p-1.5 border rounded-lg bg-white font-mono font-bold uppercase text-slate-800"
              />
              {posDiscountEval?.activeApplied && posDiscountEval.activeApplied.amount > 0 && (
                <button
                  type="button"
                  onClick={() => setOverallDiscount(posDiscountEval.activeApplied!.amount)}
                  title={`Terapkan ${posDiscountEval.activeApplied.discount.name} (-Rp ${posDiscountEval.activeApplied.amount.toLocaleString('id-ID')})`}
                  className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  -Rp {posDiscountEval.activeApplied.amount.toLocaleString('id-ID')}
                </button>
              )}
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
              Diskon (Rp)
            </label>
            <RupiahInput
              value={overallDiscount}
              onChangeValue={setOverallDiscount}
              className="w-full py-1 pr-2 border rounded-lg bg-white font-mono font-bold text-rose-600 outline-none"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
              Service Charge (Rp)
            </label>
            <RupiahInput
              value={serviceCharge}
              onChangeValue={setServiceCharge}
              className="w-full py-1 pr-2 border rounded-lg bg-white font-mono font-bold text-indigo-700 outline-none"
            />
          </div>
        </div>

        <div className="col-span-4 flex justify-end gap-2">
          <button
            onClick={() => {
              if (missingRequiredStaffServices.length > 0) {
                setCheckoutValidationError(
                  `Checkout diblokir: wajib memilih petugas untuk item jasa (${missingRequiredStaffServices
                    .map((s) => s.name)
                    .join(', ')}).`
                );
                return;
              }
              setCheckoutValidationError(null);
              setPayAmount(grandTotal);
              setShowPaymentModal(true);
            }}
            disabled={cart.length === 0}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CreditCard className="w-4 h-4" />
            <span>Bayar & Simpan (Rp {grandTotal.toLocaleString('id-ID')})</span>
          </button>
        </div>
      </div>

      {/* Payment Modal & Receipt Form */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-extrabold text-sm uppercase tracking-wide">
                Pembayaran Transaksi Kasir
              </h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Metode Pembayaran</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Tunai', 'Kredit / Debit', 'Digital QRIS', 'Tempo / Piutang'].map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setPaymentMethod(m);
                        setSubMethod(m);
                        if (m === 'Tempo / Piutang') {
                          setPayAmount(0);
                        }
                      }}
                      className={`py-2 px-3 rounded-xl font-bold border transition text-center ${
                        paymentMethod === m
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tagihan Breakdown Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border space-y-2">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Subtotal Belanja:</span>
                  <span className="font-mono font-bold">Rp {cartSubtotal.toLocaleString('id-ID')}</span>
                </div>

                {overallDiscount > 0 && (
                  <div className="flex justify-between items-center text-rose-600 font-bold">
                    <span>Potongan Diskon:</span>
                    <span className="font-mono">-Rp {overallDiscount.toLocaleString('id-ID')}</span>
                  </div>
                )}

                {serviceCharge > 0 && (
                  <div className="flex justify-between items-center text-indigo-700 font-bold">
                    <span>Service Charge:</span>
                    <span className="font-mono">+Rp {serviceCharge.toLocaleString('id-ID')}</span>
                  </div>
                )}

                {pembulatan > 0 && (
                  <div className="flex justify-between items-center text-amber-800 font-bold">
                    <span>Pembulatan Otomatis (Ribuan Ke Atas):</span>
                    <span className="font-mono">+Rp {pembulatan.toLocaleString('id-ID')}</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-2 font-black text-slate-900">
                  <span className="font-bold text-slate-700">Total Tagihan Akhir:</span>
                  <span className="font-mono text-sky-900 text-lg">
                    Rp {grandTotal.toLocaleString('id-ID')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Uang Diterima (Rp) *
                    </label>
                    <RupiahInput
                      value={payAmount}
                      onChangeValue={setPayAmount}
                      className="w-full py-2 pr-2 border rounded-xl font-black font-mono text-base bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Kembalian (Rp)</label>
                    <input
                      type="text"
                      readOnly
                      value={`Rp ${change.toLocaleString('id-ID')}`}
                      className="w-full p-2 border rounded-xl font-black font-mono text-base bg-slate-200 text-emerald-800"
                    />
                  </div>
                </div>

                {/* Quick Cash Presets */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-bold self-center mr-1">Uang Pas:</span>
                  {[grandTotal, 20000, 50000, 100000, 200000].map((val) => (
                    <button
                      key={val}
                      onClick={() => setPayAmount(val)}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-[10px] font-mono font-bold hover:bg-sky-50"
                    >
                      Rp {val.toLocaleString('id-ID')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveTransaction}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black shadow-lg uppercase tracking-wider"
                >
                  Selesaikan & Cetak Struk
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Finished Transaction Receipt Modal & Print Format */}
      {lastFinishedTrx && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center space-y-4 border border-slate-300">
            <div id="printable-section" className="space-y-3 font-mono text-xs text-left">
              {(() => {
                const docSummary = summarizeTransactionForDocument(lastFinishedTrx);
                return (
                  <>
                    <div className="text-center border-b pb-2">
                      {pharmacyProfile.logoUrl && (
                        <div className="flex justify-center mb-1.5">
                          <img
                            src={pharmacyProfile.logoUrl}
                            alt="Logo Faskes"
                            className="h-11 w-auto max-w-[110px] object-contain"
                          />
                        </div>
                      )}
                      <h3 className="font-extrabold text-sm uppercase">{pharmacyProfile.name}</h3>
                      <p className="text-[10px] text-slate-500">{formatPharmacyAddress(pharmacyProfile)}</p>
                      <p className="text-[10px] text-slate-500">Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}</p>
                      <p className="text-[9px] text-slate-500 font-mono">
                        {[
                          pharmacyProfile.sia ? `SIA: ${pharmacyProfile.sia}` : '',
                          pharmacyProfile.nib ? `NIB: ${pharmacyProfile.nib}` : '',
                          pharmacyProfile.npwp ? `NPWP: ${pharmacyProfile.npwp}` : ''
                        ].filter(Boolean).join(' · ')}
                      </p>
                      <div className="mt-1 text-[10px] border-t border-dashed pt-1">
                        <div>No: {lastFinishedTrx.id}</div>
                        <div>Tgl: {lastFinishedTrx.date}</div>
                        <div>Kasir: {lastFinishedTrx.kasir}</div>
                        <div>
                          Pelanggan:{' '}
                          {!lastFinishedTrx.customerName || lastFinishedTrx.customerName === 'Pelanggan Umum'
                            ? 'Reguler'
                            : lastFinishedTrx.customerName}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 border-b border-dashed pb-2">
                      {docSummary.productItems.map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <div>
                            <div>{it.name}</div>
                            <div className="text-[10px] text-slate-500">
                              {it.qty} {it.unit} x Rp {it.price.toLocaleString('id-ID')}
                            </div>
                          </div>
                          <div className="font-bold">Rp {it.subtotal.toLocaleString('id-ID')}</div>
                        </div>
                      ))}
                      {docSummary.totalJasaPelayanan > 0 && (
                        <div className="flex justify-between">
                          <div>
                            <div>Jasa Pelayanan</div>
                            <div className="text-[10px] text-slate-500">
                              1 Layanan x Rp {docSummary.totalJasaPelayanan.toLocaleString('id-ID')}
                            </div>
                          </div>
                          <div className="font-bold">
                            Rp {docSummary.totalJasaPelayanan.toLocaleString('id-ID')}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 text-right border-b border-dashed pb-2 font-bold">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>Rp {docSummary.displayedSubtotal.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Diskon:</span>
                        <span>-Rp {lastFinishedTrx.discount.toLocaleString('id-ID')}</span>
                      </div>
                      {!docSummary.isKlinikPath &&
                        Boolean(lastFinishedTrx.serviceCharge) &&
                        lastFinishedTrx.serviceCharge! > 0 && (
                          <div className="flex justify-between">
                            <span>Service Charge:</span>
                            <span>+Rp {lastFinishedTrx.serviceCharge!.toLocaleString('id-ID')}</span>
                          </div>
                        )}
                      {Boolean(lastFinishedTrx.pembulatan) && lastFinishedTrx.pembulatan! > 0 && (
                        <div className="flex justify-between">
                          <span>Pembulatan:</span>
                          <span>+Rp {lastFinishedTrx.pembulatan!.toLocaleString('id-ID')}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span>TOTAL:</span>
                        <span>Rp {lastFinishedTrx.total.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Bayar:</span>
                        <span>Rp {lastFinishedTrx.payAmount.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-emerald-800">
                        <span>Kembali:</span>
                        <span>Rp {lastFinishedTrx.change.toLocaleString('id-ID')}</span>
                      </div>
                    </div>

                    <div className="text-center text-[10px] text-slate-500 pt-1">
                      Terima kasih atas kunjungan Anda.<br />
                      Semoga lekas sembuh!
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex gap-2 pt-2 border-t no-print">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Struk</span>
              </button>
              <button
                type="button"
                onClick={() => setLastFinishedTrx(null)}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 font-bold rounded-xl text-xs text-slate-800 cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: BUKA KASIR (MULAI SHIFT & MODAL AWAL / CASH FLOAT) */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-400/30">
                  <Play className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wide">
                    Buka Kasir &amp; Mulai Shift Baru
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Masukkan modal awal laci kasir (Cash Float)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOpenShiftModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmOpenShift} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Petugas Kasir Bertugas (Data Pegawai) *
                </label>
                {staffList.length > 0 ? (
                  <select
                    value={selectedShiftCashier}
                    onChange={(e) => setSelectedShiftCashier(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {!staffList.some((s) => s.name === selectedShiftCashier) && (
                      <option value={selectedShiftCashier}>{selectedShiftCashier}</option>
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
                    value={selectedShiftCashier}
                    onChange={(e) => setSelectedShiftCashier(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-bold bg-slate-100 text-slate-700"
                  />
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pilih Sesi / Jadwal Shift *
                </label>
                <select
                  value={openShiftName}
                  onChange={(e) => setOpenShiftName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="Shift Pagi (07:00 - 14:00)">Shift Pagi (07:00 - 14:00)</option>
                  <option value="Shift Siang (14:00 - 21:00)">Shift Siang (14:00 - 21:00)</option>
                  <option value="Shift Malam (21:00 - 07:00)">Shift Malam (21:00 - 07:00)</option>
                  <option value="Shift Reguler / Full Day">Shift Reguler / Full Day</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Modal Awal Laci Kasir (Cash Float) (Rp) *
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  required
                  value={openingFloatInput}
                  onChange={(e) => setOpeningFloatInput(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-black font-mono text-base bg-white text-emerald-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[0, 100000, 200000, 300000, 500000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setOpeningFloatInput(preset)}
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[10px] border transition cursor-pointer ${
                        openingFloatInput === preset
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      Rp {preset.toLocaleString('id-ID')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Catatan Pembukaan Laci Kasir
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Uang kembalian pecahan lengkap..."
                  value={openingNotesInput}
                  onChange={(e) => setOpeningNotesInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOpenShiftModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Buka Laci Kasir &amp; Mulai Shift</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: FORMULIR TUTUP KASIR & RINCIAN NOMINAL UANG FISIK (DENOMINASI) */}
      {showCloseShiftModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-400/30">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wide">
                    Formulir Tutup Kasir &amp; Audit Fisik Uang Laci (Denominasi)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Hitung jumlah lembar fisik uang Rupiah di laci dari pecahan Rp 1.000 hingga Rp 100.000
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCloseShiftModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleConfirmCloseShift}
              className="p-6 overflow-y-auto space-y-5 text-xs flex-1"
            >
              {/* Info Sesi Shift */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Petugas Kasir
                  </span>
                  <strong className="text-slate-900 text-xs">
                    {activeShift?.cashierName || currentCashierName}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Sesi Shift
                  </span>
                  <strong className="text-slate-900 text-xs">
                    {activeShift?.shiftName || openShiftName}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Modal Awal (Cash Float)
                  </span>
                  <strong className="font-mono text-sky-700 text-xs">
                    Rp {shiftSalesSummary.openingFloat.toLocaleString('id-ID')}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Total Omset Sistem (Tunai)
                  </span>
                  <strong className="font-mono text-emerald-700 text-xs">
                    Rp {shiftSalesSummary.cashSales.toLocaleString('id-ID')}
                  </strong>
                </div>
              </div>

              {/* Tabel Rincian Denominasi Uang Fisik */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-400" />
                    <span className="font-extrabold text-xs uppercase tracking-wide">
                      Tabel Rincian Nominal Uang Fisik (Denominasi Rupiah)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDenominationSheets({
                        1000: 0,
                        2000: 0,
                        5000: 0,
                        10000: 0,
                        20000: 0,
                        50000: 0,
                        100000: 0
                      })
                    }
                    className="text-[10px] text-slate-300 hover:text-white underline cursor-pointer"
                  >
                    Reset Lembar ke 0
                  </button>
                </div>

                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-extrabold uppercase text-[11px]">
                    <tr>
                      <th className="p-3 border-r border-slate-200">Kolom Nominal Uang (Pecahan)</th>
                      <th className="p-3 border-r border-slate-200 text-center w-44">
                        Kolom Lembar / Keping
                      </th>
                      <th className="p-3 text-right w-52">
                        Kolom Baris Total (Nominal x Lembar)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {denominationRows.map((row) => (
                      <tr key={row.nominal} className="hover:bg-sky-50/40 transition">
                        <td className="p-3 border-r border-slate-200">
                          <div className="flex items-center gap-2.5">
                            <span className="w-20 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 font-mono font-black text-emerald-900 text-center">
                              {row.label}
                            </span>
                            <span className="text-slate-600 font-bold">
                              Pecahan {row.label}
                            </span>
                          </div>
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setDenominationSheets((prev) => ({
                                  ...prev,
                                  [row.nominal]: Math.max(0, (prev[row.nominal] || 0) - 1)
                                }))
                              }
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-slate-700 cursor-pointer"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={row.sheets}
                              onChange={(e) =>
                                setDenominationSheets((prev) => ({
                                  ...prev,
                                  [row.nominal]: Math.max(0, parseInt(e.target.value) || 0)
                                }))
                              }
                              className="w-20 p-1.5 border border-slate-300 rounded-xl font-mono font-black text-center text-sm bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setDenominationSheets((prev) => ({
                                  ...prev,
                                  [row.nominal]: (prev[row.nominal] || 0) + 1
                                }))
                              }
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 font-black text-slate-700 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-sm text-slate-900 bg-slate-50/60">
                          Rp {row.subtotal.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Baris Ringkasan: Total Kas Fisik di Laci, Total Omset Sistem (Tunai), & Kolom Keterangan Selisih */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 space-y-1">
                  <span className="text-[10px] font-extrabold text-sky-800 uppercase block">
                    1. Total Kas Fisik di Laci
                  </span>
                  <div className="text-xl font-black font-mono text-sky-950">
                    Rp {totalPhysicalCash.toLocaleString('id-ID')}
                  </div>
                  <p className="text-[10px] text-sky-700">
                    Total dari {denominationRows.reduce((a, b) => a + b.sheets, 0)} lembar uang fisik
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-100 border border-slate-300 space-y-1">
                  <span className="text-[10px] font-extrabold text-slate-700 uppercase block">
                    2. Total Omset Sistem (Tunai) &amp; Modal
                  </span>
                  <div className="text-xl font-black font-mono text-slate-900">
                    Rp {shiftSalesSummary.expectedCashInDrawer.toLocaleString('id-ID')}
                  </div>
                  <p className="text-[10px] text-slate-600 font-mono">
                    Omset Tunai: Rp {shiftSalesSummary.cashSales.toLocaleString('id-ID')} + Modal: Rp{' '}
                    {shiftSalesSummary.openingFloat.toLocaleString('id-ID')}
                  </p>
                </div>

                <div
                  className={`p-4 rounded-2xl border-2 space-y-1 ${
                    cashDifference === 0
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                      : cashDifference > 0
                      ? 'bg-amber-50 border-amber-400 text-amber-950'
                      : 'bg-rose-50 border-rose-400 text-rose-950'
                  }`}
                >
                  <span className="text-[10px] font-extrabold uppercase block">
                    3. Kolom Keterangan Selisih
                  </span>
                  <div className="text-xl font-black font-mono">
                    {cashDifference === 0
                      ? 'Rp 0 (SESUAI)'
                      : `${cashDifference > 0 ? '+' : '-'}Rp ${Math.abs(cashDifference).toLocaleString('id-ID')}`}
                  </div>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        cashDifference === 0
                          ? 'bg-emerald-600 text-white'
                          : cashDifference > 0
                          ? 'bg-amber-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {cashDifference === 0
                        ? 'BALANCE / SESUAI'
                        : cashDifference > 0
                        ? 'SELISIH LEBIH (SURPLUS)'
                        : 'SELISIH KURANG (DEFISIT)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Warning jika ada selisih -> Wajib Approval Super Admin */}
              {cashDifference !== 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="font-extrabold text-xs block uppercase">
                      Peringatan Selisih Kas ({cashDifferenceStatus}:{' '}
                      {cashDifference > 0 ? '+' : '-'}Rp {Math.abs(cashDifference).toLocaleString('id-ID')}) — Wajib Approval APJ / Owner
                    </strong>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      Terdapat selisih antara kas fisik di laci dengan pencatatan sistem. Saat tombol konfirmasi diklik, status shift akan otomatis berubah menjadi{' '}
                      <strong className="underline">"Menunggu Approval Tutup Kasir"</strong> dan sistem akan mengirimkan notifikasi peringatan real-time ke akun{' '}
                      <strong>APJ / Owner</strong> untuk ditinjau (Approve / Reject).
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Catatan Tutup Kasir / Penjelasan Selisih {cashDifference !== 0 ? '*' : '(Opsional)'}
                </label>
                <input
                  type="text"
                  required={cashDifference !== 0}
                  placeholder={
                    cashDifference !== 0
                      ? 'Wajib isi alasan/keterangan selisih kas untuk ditinjau APJ / Owner...'
                      : 'Catatan penutupan shift kasir...'
                  }
                  value={closingNotesInput}
                  onChange={(e) => setClosingNotesInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCloseShiftModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 text-white font-black rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition ${
                    cashDifference === 0
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {cashDifference === 0
                      ? 'Simpan & Tutup Kasir (Sesuai)'
                      : 'Ajukan Tutup Kasir (Kirim ke APJ / Owner)'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RIWAYAT SHIFT KASIR & PANEL APPROVAL SUPER ADMIN */}
      {showShiftHistoryModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap justify-between items-center gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-sky-400" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-sm uppercase tracking-wide">
                      Riwayat Sesi Buka-Tutup Kasir &amp; Persetujuan Selisih
                    </h3>
                    {isDemoSandbox ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                        <Database className="w-3 h-3" />
                        <span>Mode Demo Sandbox (Lokal)</span>
                      </span>
                    ) : shiftsNeedsTableSetup ? (
                      isSuperAdmin ? (
                        <button
                          type="button"
                          onClick={() => setShowShiftSchemaModal(true)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 cursor-pointer"
                        >
                          <AlertCircle className="w-3 h-3" />
                          <span>Tabel "{shiftTableInput}" Belum Dibuat — Klik Skema SQL</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                          <AlertCircle className="w-3 h-3" />
                          <span>Mode Penyimpanan Lokal</span>
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                        <Database className="w-3 h-3" />
                        <span>Supabase Realtime ({shiftTableInput})</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Log audit fisik lembaran uang Rupiah, status verifikasi APJ / Owner, &amp; sinkronisasi cloud Supabase
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onSyncShiftsSupabase && (
                  <button
                    type="button"
                    onClick={handleRunShiftSupabaseSync}
                    disabled={isSyncingShifts}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingShifts ? 'animate-spin' : ''}`} />
                    <span>{isSyncingShifts ? 'Menyinkronkan...' : 'Sync Supabase'}</span>
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowShiftSchemaModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Code className="w-3.5 h-3.5 text-sky-400" />
                    <span>Skema SQL</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowShiftHistoryModal(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {shiftSyncToast && (
              <div
                className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 border-b ${
                  shiftSyncToast.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : shiftSyncToast.type === 'warning'
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{shiftSyncToast.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShiftSyncToast(null)}
                  className="p-1 hover:bg-black/5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {cashierShifts.length === 0 ? (
                <div className="p-10 text-center text-slate-400 italic border border-dashed border-slate-200 rounded-2xl">
                  Belum ada riwayat sesi buka-tutup kasir yang tercatat.
                </div>
              ) : (
                cashierShifts.map((sh) => (
                  <div
                    key={sh.id}
                    className={`p-4 rounded-2xl border space-y-3 ${
                      sh.status === 'Menunggu Approval Tutup Kasir'
                        ? 'bg-amber-50/70 border-amber-300'
                        : sh.status === 'Ditolak (Hitung Ulang)'
                        ? 'bg-rose-50/60 border-rose-300'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-sky-800 bg-sky-50 px-2.5 py-0.5 rounded border border-sky-200">
                          {sh.id}
                        </span>
                        <span className="font-extrabold text-slate-900">{sh.shiftName}</span>
                        <span className="text-slate-500">
                          · Petugas: <strong>{sh.cashierName}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase ${
                            sh.status === 'Menunggu Approval Tutup Kasir'
                              ? 'bg-amber-500 text-slate-950'
                              : sh.status === 'Ditutup (Sesuai)' ||
                                sh.status === 'Ditutup (Approved APJ / Owner)' ||
                                sh.status === 'Ditutup (Approved Super Admin)'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : sh.status === 'Ditolak (Hitung Ulang)'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-sky-100 text-sky-800 border border-sky-300'
                          }`}
                        >
                          {sh.status === 'Ditutup (Approved Super Admin)'
                            ? 'Ditutup (Approved APJ / Owner)'
                            : sh.status}
                        </span>
                        {isSuperAdmin && onDeleteShift && (
                          <button
                            type="button"
                            disabled={deletingShiftId === sh.id}
                            onClick={async () => {
                              setDeletingShiftId(sh.id);
                              try {
                                const res = await onDeleteShift(sh.id);
                                if (res?.needsTableSetup) {
                                  setShiftSyncToast({
                                    type: 'warning',
                                    message:
                                      res.error ||
                                      'Shift dihapus lokal, tetapi kebijakan DELETE di Supabase belum aktif. Jalankan ulang Skema SQL.'
                                  });
                                } else if (res && !res.success && !res.isDemo) {
                                  setShiftSyncToast({
                                    type: 'warning',
                                    message: `Shift #${sh.id} dihapus lokal. Penghapusan Supabase tertunda (${res.error || 'koneksi'}) dan akan diulang otomatis.`
                                  });
                                } else {
                                  setShiftSyncToast({
                                    type: 'success',
                                    message: `Riwayat shift #${sh.id} berhasil dihapus secara permanen${
                                      res?.isDemo ? ' (Mode Demo).' : ' & tersinkron ke Supabase.'
                                    }`
                                  });
                                }
                              } finally {
                                setDeletingShiftId(null);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title={`Hapus riwayat shift ${sh.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Waktu Buka / Tutup</span>
                        <strong className="font-mono text-[11px]">
                          {sh.openDate} {sh.openTime} {sh.closeTime ? `— ${sh.closeTime}` : '(Masih Buka)'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Modal Awal</span>
                        <strong className="font-mono text-slate-800">
                          Rp {sh.openingFloat.toLocaleString('id-ID')}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Omset Tunai Sistem</span>
                        <strong className="font-mono text-emerald-700">
                          Rp {sh.systemCashSales.toLocaleString('id-ID')}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Total Kas Fisik Laci</span>
                        <strong className="font-mono text-sky-800">
                          Rp {sh.physicalCashInDrawer.toLocaleString('id-ID')}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Keterangan Selisih</span>
                        <strong
                          className={`font-mono ${
                            sh.difference === 0
                              ? 'text-emerald-700'
                              : sh.difference > 0
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {sh.difference === 0
                            ? 'Rp 0 (Sesuai)'
                            : `${sh.difference > 0 ? '+' : '-'}Rp ${Math.abs(sh.difference).toLocaleString('id-ID')} (${sh.differenceStatus})`}
                        </strong>
                      </div>
                    </div>

                    {/* Rincian Denominasi */}
                    {sh.denominations && sh.denominations.some((d) => d.sheets > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {sh.denominations.map((d) => (
                          <span
                            key={d.nominal}
                            className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] text-slate-700"
                          >
                            {d.label} x {d.sheets} = <strong>Rp {d.subtotal.toLocaleString('id-ID')}</strong>
                          </span>
                        ))}
                      </div>
                    )}

                    {sh.approvedBy && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                        Diverifikasi oleh <strong>{sh.approvedBy}</strong> pada {sh.approvalTime} · Catatan:{' '}
                        <em>{sh.approvalNotes || '-'}</em>
                      </div>
                    )}

                    {/* Tombol Approve / Reject untuk Super Admin jika status Menunggu Approval */}
                    {sh.status === 'Menunggu Approval Tutup Kasir' && isSuperAdmin && (
                      <div className="pt-2 border-t border-amber-200 flex flex-wrap items-center justify-between gap-2">
                        <input
                          type="text"
                          placeholder="Catatan persetujuan / penolakan APJ / Owner..."
                          value={approvalNotesInput[sh.id] || ''}
                          onChange={(e) =>
                            setApprovalNotesInput({
                              ...approvalNotesInput,
                              [sh.id]: e.target.value
                            })
                          }
                          className="flex-1 min-w-[220px] p-2 rounded-xl border border-amber-300 bg-white text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onApproveRejectShift?.(
                                sh.id,
                                'APPROVE',
                                approvalNotesInput[sh.id] || 'Disetujui APJ / Owner'
                              )
                            }
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            <span>Approve Tutup Kasir</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onApproveRejectShift?.(
                                sh.id,
                                'REJECT',
                                approvalNotesInput[sh.id] || 'Ditolak — hitung ulang fisik uang di laci'
                              )
                            }
                            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Ban className="w-4 h-4" />
                            <span>Reject Tutup Kasir</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2 shrink-0">
              {cashierShifts.length > 0 && onClearShiftHistory ? (
                confirmClearShifts ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-rose-700">
                      Hapus seluruh riwayat shift ({cashierShifts.length} data)?
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await onClearShiftHistory();
                        setConfirmClearShifts(false);
                        if (res?.needsTableSetup) {
                          setShiftSyncToast({
                            type: 'warning',
                            message:
                              res.error ||
                              'Riwayat shift dikosongkan lokal, tetapi kebijakan DELETE Supabase belum aktif. Jalankan ulang Skema SQL.'
                          });
                        } else if (res && !res.success && !res.isDemo) {
                          setShiftSyncToast({
                            type: 'warning',
                            message: `Riwayat shift dikosongkan lokal. Penghapusan Supabase tertunda (${res.error || 'koneksi'}) dan akan diulang otomatis.`
                          });
                        } else {
                          setShiftSyncToast({
                            type: 'success',
                            message: `Seluruh riwayat shift berhasil dihapus permanen${
                              res?.isDemo ? ' (Mode Demo).' : ' & tersinkron ke Supabase.'
                            }`
                          });
                        }
                      }}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs cursor-pointer"
                    >
                      Ya, Hapus Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearShifts(false)}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearShifts(true)}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Kosongkan Riwayat Shift</span>
                  </button>
                )
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setShowShiftHistoryModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SKEMA SQL & KONFIGURASI SUPABASE RIWAYAT SHIFT KASIR (APJ / Owner Only) */}
      {isSuperAdmin && showShiftSchemaModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wide">
                    Integrasi Supabase — Riwayat Shift Kasir ({shiftTableInput || DEFAULT_CASHIER_SHIFT_TABLE})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Sinkronisasi 2-arah Real-Time Buka-Tutup Kasir &amp; Approval APJ / Owner
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShiftSchemaModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <form onSubmit={handleSaveShiftTableName} className="space-y-2">
                <label className="block font-bold text-slate-700">
                  Nama Tabel Riwayat Shift Kasir di Supabase
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shiftTableInput}
                    onChange={(e) => setShiftTableInput(e.target.value)}
                    placeholder={DEFAULT_CASHIER_SHIFT_TABLE}
                    disabled={isDemoSandbox}
                    className="flex-1 p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={isDemoSandbox || isSyncingShifts}
                    className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    Simpan &amp; Sync
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">
                    Skrip SQL Pembuatan Tabel &amp; Realtime Publication
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyShiftSchema}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedShiftSchema ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Skrip SQL</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-72 leading-relaxed">
                  {SUPABASE_CASHIER_SHIFT_SQL_SCHEMA}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowShiftSchemaModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ANTRIAN E-RESEP DI POS KASIR (Terintegrasi 2-Arah Supabase) */}
      {showPrescriptionQueueModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap justify-between items-center gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-sm uppercase tracking-wide">
                      Antrian E-Resep POS Kasir
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black font-mono">
                      {posPrescriptionQueue.length} Antrian
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Daftar resep yang sudah lolos skrining apoteker &amp; siap diproses menjadi transaksi POS (terintegrasi Supabase).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onSyncPrescriptionsSupabase && (
                  <button
                    type="button"
                    disabled={isSyncingRxQueue}
                    onClick={() => handleSyncRxQueueFromSupabase(false)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingRxQueue ? 'animate-spin' : ''}`} />
                    <span>{isSyncingRxQueue ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowPrescriptionQueueModal(false);
                    setPendingConfirmLoadRx(null);
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-2.5 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={rxQueueSearch}
                  onChange={(e) => setRxQueueSearch(e.target.value)}
                  placeholder="Cari No. Resep, Nama Pasien, No. RM, Dokter, atau Nama Obat..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              {rxQueueSyncNotice && (
                <div className="px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-[11px] font-semibold flex items-center justify-between gap-2">
                  <span>{rxQueueSyncNotice}</span>
                  <button
                    type="button"
                    onClick={() => setRxQueueSyncNotice(null)}
                    className="text-sky-600 hover:text-sky-900 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {pendingConfirmLoadRx && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>
                    Keranjang POS saat ini berisi <strong>{cart.length} item</strong>. Ganti isi keranjang dengan E-Resep{' '}
                    <strong className="font-mono">#{pendingConfirmLoadRx.id}</strong> ({pendingConfirmLoadRx.patientName})?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingConfirmLoadRx(null)}
                      className="px-3 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-[11px] cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePickRxFromQueue(pendingConfirmLoadRx, true)}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black text-[11px] cursor-pointer"
                    >
                      Ya, Muat E-Resep Ini
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-slate-100/70">
              {filteredPosPrescriptionQueue.length === 0 ? (
                <div className="p-10 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 space-y-2">
                  <ClipboardList className="w-9 h-9 mx-auto text-slate-300" />
                  <p className="font-bold text-slate-600 text-xs">
                    {posPrescriptionQueue.length === 0
                      ? 'Belum ada resep di Antrian E-Resep POS saat ini.'
                      : 'Resep tidak ditemukan dengan kata kunci tersebut.'}
                  </p>
                  <p className="text-[11px]">
                    Resep yang telah lolos skrining di submenu Antrean E-Resep &amp; Skrining akan otomatis muncul di sini.
                  </p>
                </div>
              ) : (
                filteredPosPrescriptionQueue.map((rx) => {
                  const isCurrentlyActive = activePrescription?.id === rx.id;
                  return (
                    <div
                      key={rx.id}
                      className={`p-4 rounded-2xl border bg-white shadow-2xs space-y-2.5 transition ${
                        isCurrentlyActive
                          ? 'border-emerald-400 ring-2 ring-emerald-200'
                          : 'border-slate-200 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-black text-sky-800 text-xs">{rx.id}</span>
                            <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold">
                              {rx.status}
                            </span>
                            {rx.isExternalRx && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-bold">
                                Rx Luar
                              </span>
                            )}
                            {isCurrentlyActive && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black">
                                Sedang Aktif di Kasir
                              </span>
                            )}
                          </div>
                          <div className="font-black text-slate-900 text-sm">
                            {rx.patientName}{' '}
                            <span className="text-[11px] font-mono font-semibold text-slate-500">
                              (RM: {rx.rmId})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Dokter: <strong>{rx.doctorName}</strong>
                            {rx.screenedBy ? ` · Skrining: ${rx.screenedBy}` : ''}
                            {rx.timestamp ? ` · ${rx.timestamp}` : ''}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePickRxFromQueue(rx)}
                          className={`px-4 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 cursor-pointer transition shrink-0 ${
                            isCurrentlyActive
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{isCurrentlyActive ? 'Muat Ulang ke Kasir' : 'Proses di Kasir POS'}</span>
                        </button>
                      </div>

                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 space-y-1">
                        <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                          <Pill className="w-3 h-3 text-sky-600" />
                          <span>Daftar Obat Resep ({rx.items.length} item):</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                          {rx.items.map((it, idx) => (
                            <div
                              key={`${rx.id}-it-${idx}`}
                              className="px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800 truncate">{it.name}</div>
                                {it.dosage && (
                                  <div className="text-[10px] text-slate-500 italic truncate">
                                    ∫ {it.dosage}
                                  </div>
                                )}
                              </div>
                              <span className="font-mono font-bold text-sky-800 shrink-0">
                                {it.qty} {it.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {rx.screeningNotes && (
                        <div className="text-[11px] text-slate-600 italic line-clamp-2">
                          Catatan Skrining: {rx.screeningNotes}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowPrescriptionQueueModal(false);
                  setPendingConfirmLoadRx(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {showPosBarcodeScanner && (
        <Suspense fallback={null}>
          <CameraBarcodeScannerModal
            isOpen={true}
            onClose={() => setShowPosBarcodeScanner(false)}
            title="Scan Barcode Kasir POS"
            subtitle="Arahkan kamera ke barcode obat untuk langsung memasukkan item ke keranjang belanja kasir."
            scanMode="barcode"
            allowContinuous={true}
            onScanSuccess={(code) => {
              processPosBarcodeScan(code, true);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
