import React, { useState, useMemo, useEffect } from 'react';
import {
  CreditCard,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Building2,
  User,
  FileText,
  Printer,
  X,
  Plus,
  RefreshCw,
  Wallet,
  Receipt,
  ExternalLink,
  Database,
  Copy,
  Check,
  Code2,
  AlertCircle,
  Edit2,
  Trash2,
  Landmark
} from 'lucide-react';
import {
  PurchaseInvoice,
  Transaction,
  DebtPaymentRecord,
  ReceivablePaymentRecord,
  CashFlowRecord,
  Supplier,
  Branch
} from '../types';
import { useFacilityProfiles, formatPharmacyAddress } from '../utils/facilityProfileHelper';
import { openPrintWindow } from '../utils/printHelper';
import { PaginationControls } from './PaginationControls';
import { demoGetItem, demoSetItem, isDemoMode } from '../utils/demoSandbox';
import {
  getSupabaseClient,
  fetchPurchaseInvoicesFromSupabase,
  syncPurchaseInvoiceToSupabase,
  seedPurchaseInvoicesToSupabase,
  deletePurchaseInvoiceFromSupabase,
  isDemoPurchaseInvoiceId,
  isOpeningDebtInvoice,
  fetchTransactionsFromSupabase,
  syncTransactionToSupabase,
  fetchDebtPaymentsFromSupabase,
  syncDebtPaymentToSupabase,
  seedDebtPaymentsToSupabase,
  subscribeDebtPaymentsRealtime,
  isDemoDebtPaymentId,
  fetchReceivablePaymentsFromSupabase,
  syncReceivablePaymentToSupabase,
  seedReceivablePaymentsToSupabase,
  subscribeReceivablePaymentsRealtime,
  isDemoReceivablePaymentId,
  fetchCashFlowsFromSupabase,
  syncCashFlowToSupabase,
  seedCashFlowsToSupabase,
  subscribeCashFlowsRealtime,
  isDemoCashFlowId,
  clearSupabaseTableSchemaCache,
  SUPABASE_DEBT_RECEIVABLE_SQL_SCHEMA
} from '../utils/supabaseClient';
import {
  confirmCloudDeletes,
  confirmCloudSync,
  getDeletedIdsSet,
  getPendingDeleteIds,
  getPendingSyncIdsSet,
  hasCompletedInitialCloudSync,
  markInitialCloudSyncCompleted,
  markIdsPendingSync
} from '../utils/deletionRegistry';
import { useIsOwnerAdmin } from '../utils/roleAccess';

interface DebtReceivableViewProps {
  purchaseInvoices: PurchaseInvoice[];
  transactions: Transaction[];
  suppliers?: Supplier[];
  branches?: Branch[];
  currentBranch?: Branch;
  onUpdatePurchaseInvoices: (
    invoices: PurchaseInvoice[],
    options?: { skipRemoteUpload?: boolean }
  ) => void;
  onDeleteOpeningDebtRecord?: (id: string) => void;
  onUpdateTransactions: (transactions: Transaction[]) => void;
  userName?: string;
  onAddAuditLog?: (module: string, action: string) => void;
  isDemoSandbox?: boolean;
}

export const DebtReceivableView: React.FC<DebtReceivableViewProps> = ({
  purchaseInvoices,
  transactions,
  suppliers = [],
  branches = [],
  currentBranch,
  onUpdatePurchaseInvoices,
  onDeleteOpeningDebtRecord,
  onUpdateTransactions,
  userName = 'apt. Mardin, S.Farm',
  onAddAuditLog,
  isDemoSandbox = false
}) => {
  const { pharmacyProfile } = useFacilityProfiles();
  const pharmacyFullAddress = formatPharmacyAddress(pharmacyProfile);
  // Navigation sub-tab
  const [activeTab, setActiveTab] = useState<'hutang' | 'piutang' | 'riwayat'>('hutang');

  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'belum_lunas' | 'sebagian' | 'lunas' | 'overdue'>('all');
  const [debtSourceFilter, setDebtSourceFilter] = useState<'all' | 'purchase' | 'opening'>('all');

  // Local storage for payment history and cash flow ledger
  const [debtPayments, setDebtPayments] = useState<DebtPaymentRecord[]>(() => {
    try {
      const saved = demoGetItem('latisha_debt_payments');
      if (saved) {
        const list: DebtPaymentRecord[] = JSON.parse(saved);
        return list.filter((p) => p.id !== 'PAY-HUTANG-001');
      }
    } catch (e) {}
    return [];
  });

  const [receivablePayments, setReceivablePayments] = useState<ReceivablePaymentRecord[]>(() => {
    try {
      const saved = demoGetItem('latisha_receivable_payments');
      if (saved) {
        const list: ReceivablePaymentRecord[] = JSON.parse(saved);
        return list.filter((p) => p.id !== 'PAY-PIUTANG-001');
      }
    } catch (e) {}
    return [];
  });

  const [cashFlowRecords, setCashFlowRecords] = useState<CashFlowRecord[]>(() => {
    try {
      const saved = demoGetItem('latisha_cash_flow');
      if (saved) {
        const list: CashFlowRecord[] = JSON.parse(saved);
        return list.filter((c) => !['CSH-001', 'CSH-002'].includes(c.id));
      }
    } catch (e) {}
    return [];
  });

  // Supabase Sync & Table Setup State
  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);
  const isOwnerAdmin = useIsOwnerAdmin();
  const [needsTableSetup, setNeedsTableSetup] = useState<boolean>(false);
  const [showSqlModal, setShowSqlModal] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Persist local ledger state
  useEffect(() => {
    try {
      demoSetItem('latisha_debt_payments', JSON.stringify(debtPayments));
    } catch {}
  }, [debtPayments]);

  useEffect(() => {
    try {
      demoSetItem('latisha_receivable_payments', JSON.stringify(receivablePayments));
    } catch {}
  }, [receivablePayments]);

  useEffect(() => {
    try {
      demoSetItem('latisha_cash_flow', JSON.stringify(cashFlowRecords));
    } catch {}
  }, [cashFlowRecords]);

  // Two-way Supabase Real-Time Integration for Hutang, Piutang & Buku Kas (disabled in Demo Mode)
  useEffect(() => {
    if (isDemoSandbox || isDemoMode()) return;
    const client = getSupabaseClient();
    if (!client) return;

    let cancelled = false;
    let debtPayChannel: ReturnType<typeof subscribeDebtPaymentsRealtime> = null;
    let recPayChannel: ReturnType<typeof subscribeReceivablePaymentsRealtime> = null;
    let cashFlowChannel: ReturnType<typeof subscribeCashFlowsRealtime> = null;

    // 1. Sync Riwayat Pembayaran Hutang PBF (pembayaran_hutang)
    fetchDebtPaymentsFromSupabase().then((res) => {
      if (cancelled || isDemoMode()) return;
      if (res.needsTableSetup) setNeedsTableSetup(true);

      const localValid = debtPayments.filter((d) => d.id && !isDemoDebtPaymentId(d.id));
      if (res.data && res.data.length > 0) {
        const remoteIds = new Set(res.data.map((r) => r.id));
        const localOnly = localValid.filter((d) => !remoteIds.has(d.id));
        if (localOnly.length > 0) {
          seedDebtPaymentsToSupabase(localOnly).catch(() => {});
        }
        setDebtPayments((prev) => {
          const map = new Map<string, DebtPaymentRecord>();
          prev.filter((d) => !isDemoDebtPaymentId(d.id)).forEach((d) => map.set(d.id, d));
          res.data!.forEach((d) => map.set(d.id, d));
          return Array.from(map.values()).sort((a, b) =>
            (b.createdAt || b.paymentDate).localeCompare(a.createdAt || a.paymentDate)
          );
        });
        setLastSyncedAt(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } else if (res.isEmpty && !res.needsTableSetup && localValid.length > 0) {
        seedDebtPaymentsToSupabase(localValid).catch(() => {});
      }

      if (!res.needsTableSetup && !cancelled) {
        debtPayChannel = subscribeDebtPaymentsRealtime(
          (newRec) => {
            if (isDemoMode() || isDemoDebtPaymentId(newRec.id)) return;
            setDebtPayments((prev) => {
              if (prev.some((r) => r.id === newRec.id)) {
                return prev.map((r) => (r.id === newRec.id ? newRec : r));
              }
              return [newRec, ...prev];
            });
          },
          (updatedRec) => {
            if (isDemoMode() || isDemoDebtPaymentId(updatedRec.id)) return;
            setDebtPayments((prev) => prev.map((r) => (r.id === updatedRec.id ? updatedRec : r)));
          },
          (delId) => {
            if (isDemoMode()) return;
            setDebtPayments((prev) => prev.filter((r) => r.id !== delId));
          }
        );
      }
    });

    // 2. Sync Riwayat Pelunasan Piutang POS (pelunasan_piutang)
    fetchReceivablePaymentsFromSupabase().then((res) => {
      if (cancelled || isDemoMode()) return;
      if (res.needsTableSetup) setNeedsTableSetup(true);

      const localValid = receivablePayments.filter((r) => r.id && !isDemoReceivablePaymentId(r.id));
      if (res.data && res.data.length > 0) {
        const remoteIds = new Set(res.data.map((r) => r.id));
        const localOnly = localValid.filter((r) => !remoteIds.has(r.id));
        if (localOnly.length > 0) {
          seedReceivablePaymentsToSupabase(localOnly).catch(() => {});
        }
        setReceivablePayments((prev) => {
          const map = new Map<string, ReceivablePaymentRecord>();
          prev.filter((r) => !isDemoReceivablePaymentId(r.id)).forEach((r) => map.set(r.id, r));
          res.data!.forEach((r) => map.set(r.id, r));
          return Array.from(map.values()).sort((a, b) =>
            (b.createdAt || b.paymentDate).localeCompare(a.createdAt || a.paymentDate)
          );
        });
        setLastSyncedAt(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } else if (res.isEmpty && !res.needsTableSetup && localValid.length > 0) {
        seedReceivablePaymentsToSupabase(localValid).catch(() => {});
      }

      if (!res.needsTableSetup && !cancelled) {
        recPayChannel = subscribeReceivablePaymentsRealtime(
          (newRec) => {
            if (isDemoMode() || isDemoReceivablePaymentId(newRec.id)) return;
            setReceivablePayments((prev) => {
              if (prev.some((r) => r.id === newRec.id)) {
                return prev.map((r) => (r.id === newRec.id ? newRec : r));
              }
              return [newRec, ...prev];
            });
          },
          (updatedRec) => {
            if (isDemoMode() || isDemoReceivablePaymentId(updatedRec.id)) return;
            setReceivablePayments((prev) => prev.map((r) => (r.id === updatedRec.id ? updatedRec : r)));
          },
          (delId) => {
            if (isDemoMode()) return;
            setReceivablePayments((prev) => prev.filter((r) => r.id !== delId));
          }
        );
      }
    });

    // 3. Sync Buku Kas & Mutasi (buku_kas_mutasi)
    fetchCashFlowsFromSupabase().then((res) => {
      if (cancelled || isDemoMode()) return;
      if (res.needsTableSetup) setNeedsTableSetup(true);

      const localValid = cashFlowRecords.filter((c) => c.id && !isDemoCashFlowId(c.id));
      if (res.data && res.data.length > 0) {
        const remoteIds = new Set(res.data.map((c) => c.id));
        const localOnly = localValid.filter((c) => !remoteIds.has(c.id));
        if (localOnly.length > 0) {
          seedCashFlowsToSupabase(localOnly).catch(() => {});
        }
        setCashFlowRecords((prev) => {
          const map = new Map<string, CashFlowRecord>();
          prev.filter((c) => !isDemoCashFlowId(c.id)).forEach((c) => map.set(c.id, c));
          res.data!.forEach((c) => map.set(c.id, c));
          return Array.from(map.values()).sort((a, b) =>
            (b.createdAt || `${b.date} ${b.time}`).localeCompare(a.createdAt || `${a.date} ${a.time}`)
          );
        });
        setLastSyncedAt(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } else if (res.isEmpty && !res.needsTableSetup && localValid.length > 0) {
        seedCashFlowsToSupabase(localValid).catch(() => {});
      }

      if (!res.needsTableSetup && !cancelled) {
        cashFlowChannel = subscribeCashFlowsRealtime(
          (newCf) => {
            if (isDemoMode() || isDemoCashFlowId(newCf.id)) return;
            setCashFlowRecords((prev) => {
              if (prev.some((c) => c.id === newCf.id)) {
                return prev.map((c) => (c.id === newCf.id ? newCf : c));
              }
              return [newCf, ...prev];
            });
          },
          (updatedCf) => {
            if (isDemoMode() || isDemoCashFlowId(updatedCf.id)) return;
            setCashFlowRecords((prev) => prev.map((c) => (c.id === updatedCf.id ? updatedCf : c)));
          },
          (delId) => {
            if (isDemoMode()) return;
            setCashFlowRecords((prev) => prev.filter((c) => c.id !== delId));
          }
        );
      }
    });

    return () => {
      cancelled = true;
      const activeClient = getSupabaseClient();
      if (activeClient) {
        if (debtPayChannel) activeClient.removeChannel(debtPayChannel);
        if (recPayChannel) activeClient.removeChannel(recPayChannel);
        if (cashFlowChannel) activeClient.removeChannel(cashFlowChannel);
      }
    };
  }, [isDemoSandbox]);

  // Manual 2-way synchronization handler for all Hutang & Piutang tables
  const handleManualSyncSupabase = async () => {
    if (isDemoSandbox || isDemoMode()) {
      showToast('Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan.');
      return;
    }

    setIsSyncingSupabase(true);
    try {
      clearSupabaseTableSchemaCache();

      // Replay pending purchase invoice deletes first so deleted records never resurrect
      const pendingDeleteInvIds = getPendingDeleteIds('purchase_invoices');
      if (pendingDeleteInvIds.length > 0) {
        for (const delId of pendingDeleteInvIds) {
          const delRes = await deletePurchaseInvoiceFromSupabase(delId).catch(() => ({
            success: false
          }));
          if (delRes.success) confirmCloudDeletes('purchase_invoices', [delId]);
        }
      }

      const [invRes, trxRes, debtPayRes, recPayRes, cfRes] = await Promise.all([
        fetchPurchaseInvoicesFromSupabase({ forceRefresh: true }),
        fetchTransactionsFromSupabase({ forceRefresh: true }),
        fetchDebtPaymentsFromSupabase({ forceRefresh: true }),
        fetchReceivablePaymentsFromSupabase({ forceRefresh: true }),
        fetchCashFlowsFromSupabase({ forceRefresh: true })
      ]);

      const anyMissingTable = Boolean(
        invRes.needsTableSetup ||
          debtPayRes.needsTableSetup ||
          recPayRes.needsTableSetup ||
          cfRes.needsTableSetup
      );
      setNeedsTableSetup(anyMissingTable);

      if (anyMissingTable) {
        setShowSqlModal(true);
        setIsSyncingSupabase(false);
        return;
      }

      // 1. Merge & seed PurchaseInvoices (faktur_pembelian) secara tombstone-safe
      const deletedInvSet = getDeletedIdsSet('purchase_invoices');
      const pendingInvSyncSet = getPendingSyncIdsSet('purchase_invoices');
      const syncedOnceBefore = hasCompletedInitialCloudSync('purchase_invoices');
      const remoteInvAll = invRes.data || [];

      const stubbornInvIds = remoteInvAll
        .filter((inv) => inv.id && deletedInvSet.has(inv.id))
        .map((inv) => inv.id);
      if (stubbornInvIds.length > 0) {
        await Promise.all(
          stubbornInvIds.map((sid) =>
            deletePurchaseInvoiceFromSupabase(sid)
              .then((dRes) => {
                if (dRes.success) confirmCloudDeletes('purchase_invoices', [sid]);
              })
              .catch(() => {})
          )
        );
      }

      const remoteInvClean = remoteInvAll.filter(
        (inv) => inv.id && !isDemoPurchaseInvoiceId(inv.id) && !deletedInvSet.has(inv.id)
      );
      const remoteInvIds = new Set(remoteInvClean.map((inv) => inv.id));
      const localInvValid = purchaseInvoices.filter(
        (inv) => inv.id && !isDemoPurchaseInvoiceId(inv.id) && !deletedInvSet.has(inv.id)
      );
      const localInvToUpload = localInvValid.filter(
        (inv) => pendingInvSyncSet.has(inv.id) || (!syncedOnceBefore && !remoteInvIds.has(inv.id))
      );

      if (localInvToUpload.length > 0) {
        const seedInvRes = await seedPurchaseInvoicesToSupabase(localInvToUpload);
        if (seedInvRes.needsTableSetup) {
          setNeedsTableSetup(true);
          setShowSqlModal(true);
          setIsSyncingSupabase(false);
          return;
        }
        if (seedInvRes.success) {
          confirmCloudSync(
            'purchase_invoices',
            localInvToUpload.map((inv) => inv.id)
          );
        }
      }

      const invMap = new Map<string, PurchaseInvoice>();
      remoteInvClean.forEach((inv) => invMap.set(inv.id, inv));
      localInvToUpload.forEach((inv) => {
        if (!invMap.has(inv.id) || pendingInvSyncSet.has(inv.id)) {
          invMap.set(inv.id, inv);
        }
      });
      const mergedInvoices = Array.from(invMap.values()).sort((a, b) =>
        (b.date || '').localeCompare(a.date || '')
      );
      onUpdatePurchaseInvoices(mergedInvoices, { skipRemoteUpload: true });
      markInitialCloudSyncCompleted('purchase_invoices');

      // 2. Merge & seed Transactions (riwayat_penjualan)
      if (trxRes.data && trxRes.data.length > 0) {
        const trxMap = new Map<string, Transaction>();
        transactions.forEach((t) => trxMap.set(t.id, t));
        trxRes.data.forEach((t) => trxMap.set(t.id, t));
        const mergedTrx = Array.from(trxMap.values());
        onUpdateTransactions(mergedTrx);
      }

      // 3. Merge & seed DebtPayments (pembayaran_hutang)
      const dpMap = new Map<string, DebtPaymentRecord>();
      debtPayments.filter((d) => !isDemoDebtPaymentId(d.id)).forEach((d) => dpMap.set(d.id, d));
      (debtPayRes.data || []).forEach((d) => dpMap.set(d.id, d));
      const mergedDebtPays = Array.from(dpMap.values()).sort((a, b) =>
        (b.createdAt || b.paymentDate).localeCompare(a.createdAt || a.paymentDate)
      );
      setDebtPayments(mergedDebtPays);
      if (mergedDebtPays.length > 0) {
        await seedDebtPaymentsToSupabase(mergedDebtPays);
      }

      // 4. Merge & seed ReceivablePayments (pelunasan_piutang)
      const rpMap = new Map<string, ReceivablePaymentRecord>();
      receivablePayments.filter((r) => !isDemoReceivablePaymentId(r.id)).forEach((r) => rpMap.set(r.id, r));
      (recPayRes.data || []).forEach((r) => rpMap.set(r.id, r));
      const mergedRecPays = Array.from(rpMap.values()).sort((a, b) =>
        (b.createdAt || b.paymentDate).localeCompare(a.createdAt || a.paymentDate)
      );
      setReceivablePayments(mergedRecPays);
      if (mergedRecPays.length > 0) {
        await seedReceivablePaymentsToSupabase(mergedRecPays);
      }

      // 5. Merge & seed CashFlowRecords (buku_kas_mutasi)
      const cfMap = new Map<string, CashFlowRecord>();
      cashFlowRecords.filter((c) => !isDemoCashFlowId(c.id)).forEach((c) => cfMap.set(c.id, c));
      (cfRes.data || []).forEach((c) => cfMap.set(c.id, c));
      const mergedCashFlows = Array.from(cfMap.values()).sort((a, b) =>
        (b.createdAt || `${b.date} ${b.time}`).localeCompare(a.createdAt || `${a.date} ${a.time}`)
      );
      setCashFlowRecords(mergedCashFlows);
      if (mergedCashFlows.length > 0) {
        await seedCashFlowsToSupabase(mergedCashFlows);
      }

      setLastSyncedAt(
        new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
      showToast(
        `Sinkronisasi Supabase berhasil! ${mergedInvoices.length} Hutang/Faktur PBF, ${mergedDebtPays.length} Bayar Hutang, ${mergedRecPays.length} Pelunasan Piutang & ${mergedCashFlows.length} Buku Kas tersinkronisasi.`
      );
    } catch (err: any) {
      showToast(`Gagal sinkronisasi Supabase: ${err?.message || String(err)}`);
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  // Modal States
  const [selectedInvoiceForPay, setSelectedInvoiceForPay] = useState<PurchaseInvoice | null>(null);
  const [selectedTrxForPay, setSelectedTrxForPay] = useState<Transaction | null>(null);
  const [receiptData, setReceiptData] = useState<{
    type: 'HUTANG' | 'PIUTANG';
    title: string;
    receiptNo: string;
    date: string;
    partyName: string;
    referenceNo: string;
    amount: number;
    paymentMethod: string;
    petugas: string;
    notes: string;
    previousBalance: number;
    remainingBalance: number;
  } | null>(null);

  // Opening Distributor Debt (Hutang Awal) Modal States
  const [isOpeningDebtModalOpen, setIsOpeningDebtModalOpen] = useState(false);
  const [editingOpeningDebtId, setEditingOpeningDebtId] = useState<string | null>(null);
  const [openingDebtError, setOpeningDebtError] = useState<string | null>(null);
  const [isSavingOpeningDebt, setIsSavingOpeningDebt] = useState(false);
  const [deleteOpeningTarget, setDeleteOpeningTarget] = useState<PurchaseInvoice | null>(null);
  const [openingDebtForm, setOpeningDebtForm] = useState<{
    supplierMode: 'master' | 'custom';
    selectedSupplierId: string;
    pbfName: string;
    invoiceNo: string;
    date: string;
    term: PurchaseInvoice['term'];
    dueDate: string;
    salesman: string;
    totalTagihan: number;
    priorPaidAmount: number;
    branchId: string;
    notes: string;
  }>({
    supplierMode: suppliers.length > 0 ? 'master' : 'custom',
    selectedSupplierId: '',
    pbfName: '',
    invoiceNo: '',
    date: new Date().toISOString().split('T')[0],
    term: '30 Hari',
    dueDate: '',
    salesman: '',
    totalTagihan: 0,
    priorPaidAmount: 0,
    branchId: currentBranch?.id || branches[0]?.id || 'BR-01',
    notes: ''
  });

  // Form State for Payment
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    paymentMethod: 'Kas Apotek (Tunai)',
    paymentDate: new Date().toISOString().split('T')[0],
    referenceNo: '',
    notes: ''
  });

  // Toast / Feedback notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Helper: check if a date is overdue
  const isOverdue = (dueDateStr?: string) => {
    if (!dueDateStr) return false;
    const due = new Date(dueDateStr).getTime();
    const today = new Date().setHours(0, 0, 0, 0);
    return due < today;
  };

  // Helper: days remaining
  const getDaysRemaining = (dueDateStr?: string) => {
    if (!dueDateStr) return null;
    const due = new Date(dueDateStr).getTime();
    const today = new Date().setHours(0, 0, 0, 0);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // 1. DATA HUTANG (Dari purchaseInvoices)
  const debtItems = useMemo(() => {
    return purchaseInvoices.map((inv) => {
      const total = inv.totalTagihan;
      let paid = inv.paidAmount;
      if (paid === undefined) {
        paid = inv.status === 'Lunas' ? total : 0;
      }
      const remaining = inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, total - paid);
      const overdue = remaining > 0 && isOverdue(inv.dueDate);
      const days = getDaysRemaining(inv.dueDate);

      return {
        ...inv,
        calculatedPaid: paid,
        calculatedRemaining: remaining,
        isOverdue: overdue,
        daysRemaining: days
      };
    });
  }, [purchaseInvoices]);

  // 2. DATA PIUTANG (Dari transactions)
  // Menangkap transaksi tempo, faktur penjualan mitra, atau transaksi dengan sisa piutang > 0
  const receivableItems = useMemo(() => {
    return transactions
      .filter((trx) => {
        const isTempoMethod =
          trx.paymentMethod?.toLowerCase().includes('tempo') ||
          trx.paymentMethod?.toLowerCase().includes('piutang') ||
          trx.paymentMethod?.toLowerCase().includes('kredit');
        const isFaktur = trx.type === 'FAKTUR_PENJUALAN' || trx.type === 'MITRA';
        const hasUnpaid = trx.paymentStatus === 'Belum Lunas' || trx.paymentStatus === 'Sebagian' || trx.paymentStatus === 'Tempo';
        const isNotFullyPaid = (trx.remainingAmount !== undefined && trx.remainingAmount > 0) || (trx.payAmount < trx.total && isTempoMethod);

        return isTempoMethod || isFaktur || hasUnpaid || isNotFullyPaid || trx.dueDate;
      })
      .map((trx) => {
        const total = trx.total;
        let paid = trx.paidAmount !== undefined ? trx.paidAmount : (trx.payAmount || 0);
        if (trx.paymentStatus === 'Lunas') {
          paid = total;
        }
        const remaining = trx.remainingAmount !== undefined ? trx.remainingAmount : Math.max(0, total - paid);
        const overdue = remaining > 0 && isOverdue(trx.dueDate);
        const days = getDaysRemaining(trx.dueDate);

        let finalStatus = trx.paymentStatus || 'Belum Lunas';
        if (remaining <= 0) {
          finalStatus = 'Lunas';
        } else if (paid > 0) {
          finalStatus = 'Sebagian';
        }

        return {
          ...trx,
          calculatedPaid: paid,
          calculatedRemaining: remaining,
          calculatedStatus: finalStatus,
          isOverdue: overdue,
          daysRemaining: days
        };
      });
  }, [transactions]);

  // KPI Calculations
  const totalDebtUnpaid = useMemo(() => {
    return debtItems.reduce((acc, it) => acc + (it.status !== 'Lunas' ? it.calculatedRemaining : 0), 0);
  }, [debtItems]);

  const totalDebtCount = useMemo(() => {
    return debtItems.filter((it) => it.status !== 'Lunas').length;
  }, [debtItems]);

  const debtOverdueCount = useMemo(() => {
    return debtItems.filter((it) => it.status !== 'Lunas' && it.isOverdue).length;
  }, [debtItems]);

  const totalReceivableUnpaid = useMemo(() => {
    return receivableItems.reduce((acc, it) => acc + (it.calculatedStatus !== 'Lunas' ? it.calculatedRemaining : 0), 0);
  }, [receivableItems]);

  const totalReceivableCount = useMemo(() => {
    return receivableItems.filter((it) => it.calculatedStatus !== 'Lunas').length;
  }, [receivableItems]);

  const receivableOverdueCount = useMemo(() => {
    return receivableItems.filter((it) => it.calculatedStatus !== 'Lunas' && it.isOverdue).length;
  }, [receivableItems]);

  const openingDebtCount = useMemo(() => {
    return debtItems.filter((it) => isOpeningDebtInvoice(it)).length;
  }, [debtItems]);

  const debtPaymentStatsByInvoiceId = useMemo(() => {
    const map = new Map<string, { count: number; totalPaid: number }>();
    debtPayments.forEach((p) => {
      if (!p.invoiceId) return;
      const cur = map.get(p.invoiceId) || { count: 0, totalPaid: 0 };
      map.set(p.invoiceId, {
        count: cur.count + 1,
        totalPaid: cur.totalPaid + (Number(p.amount) || 0)
      });
    });
    return map;
  }, [debtPayments]);

  // Filtered Debt List
  const filteredDebtList = useMemo(() => {
    return debtItems.filter((inv) => {
      if (debtSourceFilter === 'opening' && !isOpeningDebtInvoice(inv)) return false;
      if (debtSourceFilter === 'purchase' && isOpeningDebtInvoice(inv)) return false;

      const q = searchTerm.toLowerCase();
      const matchSearch =
        inv.invoiceNo.toLowerCase().includes(q) ||
        inv.pbfName.toLowerCase().includes(q) ||
        (inv.salesman && inv.salesman.toLowerCase().includes(q)) ||
        (inv.notes && inv.notes.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (statusFilter === 'all') return true;
      if (statusFilter === 'belum_lunas') return inv.status === 'Belum Lunas' && inv.calculatedPaid === 0;
      if (statusFilter === 'sebagian') return inv.status === 'Sebagian' || (inv.calculatedPaid > 0 && inv.calculatedRemaining > 0);
      if (statusFilter === 'lunas') return inv.status === 'Lunas';
      if (statusFilter === 'overdue') return inv.isOverdue && inv.status !== 'Lunas';

      return true;
    });
  }, [debtItems, debtSourceFilter, searchTerm, statusFilter]);

  // Filtered Receivable List
  const filteredReceivableList = useMemo(() => {
    return receivableItems.filter((trx) => {
      const matchSearch =
        trx.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trx.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (trx.kasir && trx.kasir.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchSearch) return false;

      if (statusFilter === 'all') return true;
      if (statusFilter === 'belum_lunas') return trx.calculatedStatus === 'Belum Lunas' || (trx.calculatedPaid === 0 && trx.calculatedRemaining > 0);
      if (statusFilter === 'sebagian') return trx.calculatedStatus === 'Sebagian' || (trx.calculatedPaid > 0 && trx.calculatedRemaining > 0);
      if (statusFilter === 'lunas') return trx.calculatedStatus === 'Lunas';
      if (statusFilter === 'overdue') return trx.isOverdue && trx.calculatedStatus !== 'Lunas';

      return true;
    });
  }, [receivableItems, searchTerm, statusFilter]);

  const [debtPage, setDebtPage] = useState(1);
  const [debtPageSize, setDebtPageSize] = useState<number>(25);
  const [receivablePage, setReceivablePage] = useState(1);
  const [receivablePageSize, setReceivablePageSize] = useState<number>(25);
  const [cashPage, setCashPage] = useState(1);
  const [cashPageSize, setCashPageSize] = useState<number>(25);

  useEffect(() => {
    setDebtPage(1);
    setReceivablePage(1);
  }, [searchTerm, statusFilter, debtSourceFilter]);

  const debtTotalPages = Math.max(1, Math.ceil(filteredDebtList.length / debtPageSize));
  const safeDebtPage = Math.min(debtPage, debtTotalPages);
  const paginatedDebtList = useMemo(() => {
    const start = (safeDebtPage - 1) * debtPageSize;
    return filteredDebtList.slice(start, start + debtPageSize);
  }, [filteredDebtList, safeDebtPage, debtPageSize]);

  const receivableTotalPages = Math.max(1, Math.ceil(filteredReceivableList.length / receivablePageSize));
  const safeReceivablePage = Math.min(receivablePage, receivableTotalPages);
  const paginatedReceivableList = useMemo(() => {
    const start = (safeReceivablePage - 1) * receivablePageSize;
    return filteredReceivableList.slice(start, start + receivablePageSize);
  }, [filteredReceivableList, safeReceivablePage, receivablePageSize]);

  const cashTotalPages = Math.max(1, Math.ceil(cashFlowRecords.length / cashPageSize));
  const safeCashPage = Math.min(cashPage, cashTotalPages);
  const paginatedCashFlowRecords = useMemo(() => {
    const start = (safeCashPage - 1) * cashPageSize;
    return cashFlowRecords.slice(start, start + cashPageSize);
  }, [cashFlowRecords, safeCashPage, cashPageSize]);

  // ACTION: Buka Modal Bayar Hutang (PBF)
  const handleOpenPayDebt = (inv: PurchaseInvoice & { calculatedRemaining: number; calculatedPaid: number }) => {
    setPaymentError(null);
    setSelectedInvoiceForPay(inv);
    setPaymentForm({
      amount: inv.calculatedRemaining,
      paymentMethod: 'Transfer Bank (BCA 827-092-1122)',
      paymentDate: new Date().toISOString().split('T')[0],
      referenceNo: `TRF-${Date.now().toString().slice(-6)}`,
      notes: `Pelunasan faktur pembelian #${inv.invoiceNo} ke ${inv.pbfName}`
    });
  };

  // ACTION: Buka Modal Bayar Piutang (POS / Pasien / Mitra)
  const handleOpenPayReceivable = (trx: Transaction & { calculatedRemaining: number; calculatedPaid: number }) => {
    setPaymentError(null);
    setSelectedTrxForPay(trx);
    setPaymentForm({
      amount: trx.calculatedRemaining,
      paymentMethod: 'Kas Apotek (Tunai)',
      paymentDate: new Date().toISOString().split('T')[0],
      referenceNo: `KWT-${Date.now().toString().slice(-6)}`,
      notes: `Penerimaan pelunasan piutang transaksi #${trx.id} a/n ${trx.customerName}`
    });
  };

  // EKSEKUSI PEMBAYARAN HUTANG (PBF)
  const handleProcessDebtPayment = () => {
    if (!selectedInvoiceForPay) return;
    setPaymentError(null);

    const payAmount = Number(paymentForm.amount);
    if (payAmount <= 0) {
      setPaymentError('Nominal pembayaran harus lebih dari 0!');
      return;
    }

    const currentRemaining = selectedInvoiceForPay.remainingAmount !== undefined
      ? selectedInvoiceForPay.remainingAmount
      : (selectedInvoiceForPay.totalTagihan - (selectedInvoiceForPay.paidAmount || (selectedInvoiceForPay.status === 'Lunas' ? selectedInvoiceForPay.totalTagihan : 0)));

    if (payAmount > currentRemaining) {
      setPaymentError(`Nominal pembayaran (Rp ${payAmount.toLocaleString('id-ID')}) melebihi sisa hutang (Rp ${currentRemaining.toLocaleString('id-ID')})!`);
      return;
    }

    const currentPaid = selectedInvoiceForPay.paidAmount || 0;
    const newPaid = currentPaid + payAmount;
    const newRemaining = Math.max(0, currentRemaining - payAmount);
    const newStatus: 'Lunas' | 'Sebagian' | 'Belum Lunas' = newRemaining <= 0 ? 'Lunas' : 'Sebagian';

    const updatedTargetInvoice: PurchaseInvoice = {
      ...selectedInvoiceForPay,
      status: newStatus,
      paidAmount: newPaid,
      remainingAmount: newRemaining
    };

    // 1. UPDATE TABEL UTAMA PEMBELIAN & FAKTUR PBF (with pending sync lock)
    const updatedInvoices = purchaseInvoices.map((inv) =>
      inv.id === selectedInvoiceForPay.id ? updatedTargetInvoice : inv
    );

    if (!isDemoSandbox && !isDemoMode() && !isDemoPurchaseInvoiceId(updatedTargetInvoice.id)) {
      markIdsPendingSync('purchase_invoices', [updatedTargetInvoice.id]);
    }
    onUpdatePurchaseInvoices(updatedInvoices, { skipRemoteUpload: true });

    // 2. CATAT KE RIWAYAT PEMBAYARAN HUTANG
    const paymentRecordId = `PAY-HUTANG-${Date.now().toString().slice(-6)}`;
    const newDebtPayment: DebtPaymentRecord = {
      id: paymentRecordId,
      invoiceId: selectedInvoiceForPay.id,
      invoiceNo: selectedInvoiceForPay.invoiceNo,
      pbfName: selectedInvoiceForPay.pbfName,
      paymentDate: paymentForm.paymentDate,
      amount: payAmount,
      paymentMethod: paymentForm.paymentMethod,
      referenceNo: paymentForm.referenceNo || undefined,
      notes: paymentForm.notes || undefined,
      petugas: userName,
      previousBalance: currentRemaining,
      remainingBalance: newRemaining,
      createdAt: new Date().toISOString()
    };

    const nextDebtPayments = [newDebtPayment, ...debtPayments];
    setDebtPayments(nextDebtPayments);
    try {
      demoSetItem('latisha_debt_payments', JSON.stringify(nextDebtPayments));
    } catch (e) {}

    // 3. CATAT KE BUKU KAS (CASH FLOW RECORD - KELUAR)
    const newCashFlow: CashFlowRecord = {
      id: `CSH-${Date.now().toString().slice(-6)}`,
      date: paymentForm.paymentDate,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      type: 'OUT',
      category: 'Pembayaran Hutang PBF',
      amount: payAmount,
      referenceId: selectedInvoiceForPay.id,
      referenceNo: selectedInvoiceForPay.invoiceNo,
      partyName: selectedInvoiceForPay.pbfName,
      paymentMethod: paymentForm.paymentMethod,
      description:
        paymentForm.notes ||
        `Pembayaran hutang ${isOpeningDebtInvoice(selectedInvoiceForPay) ? 'awal distributor' : 'faktur PBF'} #${selectedInvoiceForPay.invoiceNo}`,
      petugas: userName,
      createdAt: new Date().toISOString()
    };

    const nextCashFlow = [newCashFlow, ...cashFlowRecords];
    setCashFlowRecords(nextCashFlow);
    try {
      demoSetItem('latisha_cash_flow', JSON.stringify(nextCashFlow));
    } catch (e) {}

    // 3b. SINKRONISASI REAL-TIME KE SUPABASE
    if (!isDemoSandbox && !isDemoMode()) {
      syncPurchaseInvoiceToSupabase(updatedTargetInvoice)
        .then((res) => {
          if (res.needsTableSetup) setNeedsTableSetup(true);
          if (res.success && !isDemoPurchaseInvoiceId(updatedTargetInvoice.id)) {
            confirmCloudSync('purchase_invoices', [updatedTargetInvoice.id]);
          }
        })
        .catch(() => {});
      syncDebtPaymentToSupabase(newDebtPayment)
        .then((res) => {
          if (res.needsTableSetup) setNeedsTableSetup(true);
        })
        .catch(() => {});
      syncCashFlowToSupabase(newCashFlow)
        .then((res) => {
          if (res.needsTableSetup) setNeedsTableSetup(true);
        })
        .catch(() => {});
      setLastSyncedAt(
        new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    }

    // 4. CATAT AUDIT LOG
    if (onAddAuditLog) {
      onAddAuditLog(
        'Hutang & Piutang',
        `Pembayaran hutang faktur #${selectedInvoiceForPay.invoiceNo} (${selectedInvoiceForPay.pbfName}) sebesar Rp ${payAmount.toLocaleString('id-ID')} via ${paymentForm.paymentMethod}. Status: ${newStatus}`
      );
    }

    // 5. TAMPILKAN KUITANSI
    setReceiptData({
      type: 'HUTANG',
      title: 'BUKTI PENGELUARAN KAS / PEMBAYARAN HUTANG PBF',
      receiptNo: paymentRecordId,
      date: paymentForm.paymentDate,
      partyName: selectedInvoiceForPay.pbfName,
      referenceNo: selectedInvoiceForPay.invoiceNo,
      amount: payAmount,
      paymentMethod: paymentForm.paymentMethod,
      petugas: userName,
      notes: paymentForm.notes,
      previousBalance: currentRemaining,
      remainingBalance: newRemaining
    });

    setSelectedInvoiceForPay(null);
    showToast(
      `Pembayaran hutang faktur #${selectedInvoiceForPay.invoiceNo} sebesar Rp ${payAmount.toLocaleString('id-ID')} berhasil disimpan & disinkronkan! Status faktur diperbarui menjadi ${newStatus}.`
    );
  };

  // EKSEKUSI PENERIMAAN / PELUNASAN PIUTANG (POS)
  const handleProcessReceivablePayment = () => {
    if (!selectedTrxForPay) return;
    setPaymentError(null);

    const payAmount = Number(paymentForm.amount);
    if (payAmount <= 0) {
      setPaymentError('Nominal pelunasan piutang harus lebih dari 0!');
      return;
    }

    const currentRemaining = selectedTrxForPay.remainingAmount !== undefined
      ? selectedTrxForPay.remainingAmount
      : Math.max(0, selectedTrxForPay.total - (selectedTrxForPay.paidAmount !== undefined ? selectedTrxForPay.paidAmount : (selectedTrxForPay.payAmount || 0)));

    if (payAmount > currentRemaining) {
      setPaymentError(`Nominal pembayaran (Rp ${payAmount.toLocaleString('id-ID')}) melebihi sisa piutang (Rp ${currentRemaining.toLocaleString('id-ID')})!`);
      return;
    }

    const currentPaid = selectedTrxForPay.paidAmount !== undefined
      ? selectedTrxForPay.paidAmount
      : (selectedTrxForPay.payAmount || 0);

    const newPaid = currentPaid + payAmount;
    const newRemaining = Math.max(0, currentRemaining - payAmount);
    const newStatus: 'Lunas' | 'Sebagian' | 'Belum Lunas' = newRemaining <= 0 ? 'Lunas' : 'Sebagian';

    const updatedTargetTrx: Transaction = {
      ...selectedTrxForPay,
      paymentStatus: newStatus,
      paidAmount: newPaid,
      payAmount: newPaid,
      remainingAmount: newRemaining,
      status: newStatus === 'Lunas' ? ('Selesai' as const) : selectedTrxForPay.status
    };

    // 1. UPDATE TABEL UTAMA TRANSAKSI PENJUALAN POS
    const updatedTransactions = transactions.map((trx) =>
      trx.id === selectedTrxForPay.id ? updatedTargetTrx : trx
    );

    onUpdateTransactions(updatedTransactions);
    try {
      demoSetItem('latisha_transactions', JSON.stringify(updatedTransactions));
    } catch (e) {}

    // 2. CATAT KE RIWAYAT PENERIMAAN PIUTANG
    const paymentRecordId = `PAY-PIUTANG-${Date.now().toString().slice(-6)}`;
    const newReceivablePayment: ReceivablePaymentRecord = {
      id: paymentRecordId,
      transactionId: selectedTrxForPay.id,
      customerName: selectedTrxForPay.customerName,
      paymentDate: paymentForm.paymentDate,
      amount: payAmount,
      paymentMethod: paymentForm.paymentMethod,
      referenceNo: paymentForm.referenceNo || undefined,
      notes: paymentForm.notes || undefined,
      petugas: userName,
      previousBalance: currentRemaining,
      remainingBalance: newRemaining,
      createdAt: new Date().toISOString()
    };

    const nextReceivablePayments = [newReceivablePayment, ...receivablePayments];
    setReceivablePayments(nextReceivablePayments);
    try {
      demoSetItem('latisha_receivable_payments', JSON.stringify(nextReceivablePayments));
    } catch (e) {}

    // 3. CATAT KE BUKU KAS (CASH FLOW RECORD - MASUK)
    const newCashFlow: CashFlowRecord = {
      id: `CSH-${Date.now().toString().slice(-6)}`,
      date: paymentForm.paymentDate,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      type: 'IN',
      category: 'Pelunasan Piutang POS',
      amount: payAmount,
      referenceId: selectedTrxForPay.id,
      referenceNo: selectedTrxForPay.id,
      partyName: selectedTrxForPay.customerName,
      paymentMethod: paymentForm.paymentMethod,
      description: paymentForm.notes || `Penerimaan pelunasan piutang #${selectedTrxForPay.id}`,
      petugas: userName,
      createdAt: new Date().toISOString()
    };

    const nextCashFlow = [newCashFlow, ...cashFlowRecords];
    setCashFlowRecords(nextCashFlow);
    try {
      demoSetItem('latisha_cash_flow', JSON.stringify(nextCashFlow));
    } catch (e) {}

    // 3b. SINKRONISASI REAL-TIME KE SUPABASE
    if (!isDemoSandbox && !isDemoMode()) {
      syncTransactionToSupabase(updatedTargetTrx).catch(() => {});
      syncReceivablePaymentToSupabase(newReceivablePayment)
        .then((res) => {
          if (res.needsTableSetup) setNeedsTableSetup(true);
        })
        .catch(() => {});
      syncCashFlowToSupabase(newCashFlow)
        .then((res) => {
          if (res.needsTableSetup) setNeedsTableSetup(true);
        })
        .catch(() => {});
      setLastSyncedAt(
        new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    }

    // 4. CATAT AUDIT LOG
    if (onAddAuditLog) {
      onAddAuditLog(
        'Hutang & Piutang',
        `Penerimaan pelunasan piutang transaksi #${selectedTrxForPay.id} (${selectedTrxForPay.customerName}) sebesar Rp ${payAmount.toLocaleString('id-ID')} via ${paymentForm.paymentMethod}. Status: ${newStatus}`
      );
    }

    // 5. TAMPILKAN KUITANSI
    setReceiptData({
      type: 'PIUTANG',
      title: 'KUITANSI RESMI PENERIMAAN KAS / PELUNASAN PIUTANG',
      receiptNo: paymentRecordId,
      date: paymentForm.paymentDate,
      partyName: selectedTrxForPay.customerName,
      referenceNo: selectedTrxForPay.id,
      amount: payAmount,
      paymentMethod: paymentForm.paymentMethod,
      petugas: userName,
      notes: paymentForm.notes,
      previousBalance: currentRemaining,
      remainingBalance: newRemaining
    });

    setSelectedTrxForPay(null);
    showToast(
      `Pelunasan piutang transaksi #${selectedTrxForPay.id} sebesar Rp ${payAmount.toLocaleString('id-ID')} berhasil dicatat & disinkronkan! Status transaksi POS diperbarui menjadi ${newStatus}.`
    );
  };

  // Helper: Hitung jatuh tempo otomatis dari tanggal + termin
  const calculateDueDateByTerm = (baseDateStr: string, term: PurchaseInvoice['term']) => {
    const base = baseDateStr ? new Date(baseDateStr) : new Date();
    if (Number.isNaN(base.getTime())) return baseDateStr;
    const days = term === '14 Hari' ? 14 : term === '30 Hari' ? 30 : term === '60 Hari' ? 60 : 0;
    base.setDate(base.getDate() + days);
    return base.toISOString().split('T')[0];
  };

  const generateOpeningDebtRefNo = (baseDateStr?: string) => {
    const cleanDate = (baseDateStr || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    const suffix = Math.floor(100 + Math.random() * 900);
    return `AWAL-PBF-${cleanDate}-${suffix}`;
  };

  const handleOpenAddOpeningDebt = () => {
    const today = new Date().toISOString().split('T')[0];
    setOpeningDebtError(null);
    setEditingOpeningDebtId(null);
    setOpeningDebtForm({
      supplierMode: suppliers.length > 0 ? 'master' : 'custom',
      selectedSupplierId: '',
      pbfName: '',
      invoiceNo: '',
      date: today,
      term: '30 Hari',
      dueDate: calculateDueDateByTerm(today, '30 Hari'),
      salesman: '',
      totalTagihan: 0,
      priorPaidAmount: 0,
      branchId: currentBranch?.id || branches[0]?.id || 'BR-01',
      notes: ''
    });
    setIsOpeningDebtModalOpen(true);
  };

  const handleOpenEditOpeningDebt = (inv: PurchaseInvoice) => {
    setOpeningDebtError(null);
    setEditingOpeningDebtId(inv.id);
    const matchedSupplier = suppliers.find(
      (s) => s.name.trim().toLowerCase() === inv.pbfName.trim().toLowerCase()
    );
    const appPaid = debtPaymentStatsByInvoiceId.get(inv.id)?.totalPaid || 0;
    const totalPaid =
      inv.paidAmount !== undefined
        ? Number(inv.paidAmount)
        : inv.status === 'Lunas'
        ? Number(inv.totalTagihan)
        : 0;
    const priorPaid = Math.max(0, totalPaid - appPaid);

    setOpeningDebtForm({
      supplierMode: matchedSupplier ? 'master' : 'custom',
      selectedSupplierId: matchedSupplier?.id || '',
      pbfName: inv.pbfName || '',
      invoiceNo: inv.invoiceNo || '',
      date: inv.date || new Date().toISOString().split('T')[0],
      term: inv.term || '30 Hari',
      dueDate: inv.dueDate || inv.date || '',
      salesman: inv.salesman || '',
      totalTagihan: Number(inv.totalTagihan) || 0,
      priorPaidAmount: priorPaid,
      branchId: inv.branchId || currentBranch?.id || branches[0]?.id || 'BR-01',
      notes: inv.notes || ''
    });
    setIsOpeningDebtModalOpen(true);
  };

  const handleSaveOpeningDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpeningDebtError(null);

    const pbfNameClean = openingDebtForm.pbfName.trim();
    const invoiceNoClean = openingDebtForm.invoiceNo.trim();
    const totalVal = Math.round(Number(openingDebtForm.totalTagihan) || 0);
    const priorPaidVal = Math.max(0, Math.round(Number(openingDebtForm.priorPaidAmount) || 0));

    if (!pbfNameClean) {
      setOpeningDebtError('Nama Distributor / PBF wajib diisi atau dipilih.');
      return;
    }
    if (!invoiceNoClean) {
      setOpeningDebtError('No. Faktur / Nomor Referensi hutang awal wajib diisi.');
      return;
    }
    if (!openingDebtForm.date) {
      setOpeningDebtError('Tanggal hutang awal wajib diisi.');
      return;
    }
    if (totalVal <= 0) {
      setOpeningDebtError('Total nilai hutang awal harus lebih dari Rp 0.');
      return;
    }

    const appPaid = editingOpeningDebtId
      ? debtPaymentStatsByInvoiceId.get(editingOpeningDebtId)?.totalPaid || 0
      : 0;
    const combinedPaid = priorPaidVal + appPaid;

    if (combinedPaid > totalVal) {
      setOpeningDebtError(
        `Total sudah dibayar (Rp ${combinedPaid.toLocaleString('id-ID')}) melebihi total hutang awal (Rp ${totalVal.toLocaleString('id-ID')}).`
      );
      return;
    }
    if (!editingOpeningDebtId && priorPaidVal >= totalVal) {
      setOpeningDebtError(
        'Nominal sudah terbayar sebelumnya harus lebih kecil dari Total Hutang Awal agar masih ada sisa hutang aktif yang dicatat.'
      );
      return;
    }

    const duplicate = purchaseInvoices.find(
      (inv) =>
        inv.id !== editingOpeningDebtId &&
        inv.invoiceNo.trim().toLowerCase() === invoiceNoClean.toLowerCase() &&
        inv.pbfName.trim().toLowerCase() === pbfNameClean.toLowerCase()
    );
    if (duplicate) {
      setOpeningDebtError(
        `No. Faktur/Referensi "${invoiceNoClean}" untuk distributor "${pbfNameClean}" sudah tercatat sebelumnya.`
      );
      return;
    }

    const remainingVal = Math.max(0, totalVal - combinedPaid);
    const computedStatus: PurchaseInvoice['status'] =
      remainingVal <= 0 ? 'Lunas' : combinedPaid > 0 ? 'Sebagian' : 'Belum Lunas';

    const recordId =
      editingOpeningDebtId ||
      `HTG-AWAL-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .slice(2, 5)
        .toUpperCase()}`;

    const record: PurchaseInvoice = {
      id: recordId,
      pbfName: pbfNameClean,
      invoiceNo: invoiceNoClean,
      date: openingDebtForm.date,
      dueDate: openingDebtForm.dueDate || openingDebtForm.date,
      salesman: openingDebtForm.salesman.trim(),
      term: openingDebtForm.term,
      usePpn: false,
      items: [],
      grossDpp: 0,
      totalDiscountAmount: 0,
      dpp: 0,
      ppn: 0,
      totalTagihan: totalVal,
      paidAmount: combinedPaid,
      remainingAmount: remainingVal,
      status: computedStatus,
      branchId: openingDebtForm.branchId || currentBranch?.id || 'BR-01',
      recordType: 'OPENING_DEBT',
      notes: openingDebtForm.notes.trim() || undefined
    };

    const nextList = editingOpeningDebtId
      ? purchaseInvoices.map((inv) => (inv.id === editingOpeningDebtId ? record : inv))
      : [record, ...purchaseInvoices];

    setIsSavingOpeningDebt(true);
    try {
      if (!isDemoSandbox && !isDemoMode()) {
        markIdsPendingSync('purchase_invoices', [record.id]);
      }
      onUpdatePurchaseInvoices(nextList, { skipRemoteUpload: true });

      if (onAddAuditLog) {
        onAddAuditLog(
          'Hutang & Piutang',
          `${editingOpeningDebtId ? 'Edit' : 'Catat'} hutang awal distributor #${record.invoiceNo} (${record.pbfName}) total Rp ${totalVal.toLocaleString('id-ID')} · Sisa Rp ${remainingVal.toLocaleString('id-ID')}`
        );
      }

      if (!isDemoSandbox && !isDemoMode()) {
        const syncRes = await syncPurchaseInvoiceToSupabase(record);
        if (syncRes.needsTableSetup) {
          setNeedsTableSetup(true);
          showToast(
            `Hutang awal #${record.invoiceNo} disimpan lokal. Tabel Supabase belum tersedia — klik Setup Tabel SQL lalu Sinkronkan.`
          );
        } else if (syncRes.success) {
          confirmCloudSync('purchase_invoices', [record.id]);
          setLastSyncedAt(
            new Date().toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
          );
          showToast(
            `Hutang awal distributor ${record.pbfName} (#${record.invoiceNo}) berhasil ${editingOpeningDebtId ? 'diperbarui' : 'dicatat'} & tersinkron ke Supabase!`
          );
        } else {
          showToast(
            `Hutang awal #${record.invoiceNo} tersimpan lokal (antre sinkronisasi Supabase: ${syncRes.error || 'offline'}).`
          );
        }
      } else {
        showToast(
          `Hutang awal distributor ${record.pbfName} (#${record.invoiceNo}) berhasil ${editingOpeningDebtId ? 'diperbarui' : 'dicatat'}.`
        );
      }

      setIsOpeningDebtModalOpen(false);
      setEditingOpeningDebtId(null);
    } finally {
      setIsSavingOpeningDebt(false);
    }
  };

  const handleConfirmDeleteOpeningDebt = () => {
    if (!deleteOpeningTarget) return;
    const target = deleteOpeningTarget;
    if (onDeleteOpeningDebtRecord) {
      onDeleteOpeningDebtRecord(target.id);
    } else {
      const next = purchaseInvoices.filter((inv) => inv.id !== target.id);
      onUpdatePurchaseInvoices(next, { skipRemoteUpload: true });
      if (!isDemoSandbox && !isDemoMode()) {
        deletePurchaseInvoiceFromSupabase(target.id).catch(() => {});
      }
    }
    setDeleteOpeningTarget(null);
    showToast(`Pencatatan hutang awal #${target.invoiceNo} (${target.pbfName}) berhasil dihapus.`);
  };

  // Cetak Kuitansi
  const handlePrintReceiptWindow = () => {
    if (selectedTrxForPay) {
      openPrintWindow('kwitansi-penjualan', { trxId: selectedTrxForPay.id });
    } else if (typeof window !== 'undefined' && window.self === window.top) {
      try {
        window.print();
      } catch (e) {}
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-500 animate-slide-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
          <span className="text-xs font-bold leading-relaxed">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 hover:bg-emerald-800 p-1 rounded-lg text-emerald-200 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">Manajemen Hutang & Piutang</h1>
              <p className="text-xs text-slate-300">
                Pencatatan real-time hutang dagang faktur PBF, piutang penjualan POS/mitra, dan mutasi arus kas apotek
              </p>
            </div>
          </div>
        </div>

        {/* Action / Sync Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 ${
              isDemoSandbox || isDemoMode()
                ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                : needsTableSetup
                ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {isDemoSandbox || isDemoMode()
                ? 'Sandbox Lokal'
                : needsTableSetup
                ? 'Tabel Supabase Belum Dibuat'
                : `Supabase Live${lastSyncedAt ? ` · ${lastSyncedAt}` : ''}`}
            </span>
          </div>

          <button
            type="button"
            onClick={handleManualSyncSupabase}
            disabled={isSyncingSupabase}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 border border-indigo-400/30 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
            <span>{isSyncingSupabase ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
          </button>

          {isOwnerAdmin && (
            <button
              type="button"
              onClick={() => setShowSqlModal(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                needsTableSetup
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Skema SQL Tabel Hutang & Piutang Supabase"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Setup Tabel SQL</span>
            </button>
          )}

          <div className="px-3.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono flex items-center gap-2 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Petugas: <strong className="text-white">{userName}</strong></span>
          </div>
        </div>
      </div>

      {/* Banner peringatan jika tabel Supabase belum dibuat (APJ / Owner Only) */}
      {isOwnerAdmin && needsTableSetup && !isDemoSandbox && !isDemoMode() && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-amber-900">
                Tabel Database Hutang & Piutang Belum Tersedia di Supabase
              </p>
              <p className="text-amber-800 mt-0.5">
                Jalankan skrip SQL untuk membuat tabel <code className="font-mono font-bold">faktur_pembelian</code>,{' '}
                <code className="font-mono font-bold">pembayaran_hutang</code>,{' '}
                <code className="font-mono font-bold">pelunasan_piutang</code>, dan{' '}
                <code className="font-mono font-bold">buku_kas_mutasi</code> agar seluruh transaksi hutang & piutang tersimpan secara real-time di cloud.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSqlModal(true)}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Code2 className="w-4 h-4" />
            <span>Lihat Skrip SQL</span>
          </button>
        </div>
      )}

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Hutang PBF */}
        <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-xs relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-rose-700">Total Hutang PBF</p>
              <h3 className="text-xl font-black font-mono text-slate-900 mt-1">
                Rp {totalDebtUnpaid.toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-rose-100">
            <span className="text-slate-500 font-medium">{totalDebtCount} Faktur Belum Lunas</span>
            {debtOverdueCount > 0 ? (
              <span className="text-rose-600 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {debtOverdueCount} Lewat Tempo
              </span>
            ) : (
              <span className="text-emerald-600 font-semibold text-[11px]">Jatuh Tempo Aman</span>
            )}
          </div>
        </div>

        {/* KPI 2: Total Piutang POS */}
        <div className="bg-white p-5 rounded-2xl border border-teal-200 shadow-xs relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-teal-700">Total Piutang Penjualan</p>
              <h3 className="text-xl font-black font-mono text-slate-900 mt-1">
                Rp {totalReceivableUnpaid.toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl border border-teal-100">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-teal-100">
            <span className="text-slate-500 font-medium">{totalReceivableCount} Tagihan Piutang</span>
            {receivableOverdueCount > 0 ? (
              <span className="text-rose-600 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {receivableOverdueCount} Lewat Tempo
              </span>
            ) : (
              <span className="text-emerald-600 font-semibold text-[11px]">Tagihan Terkendali</span>
            )}
          </div>
        </div>

        {/* KPI 3: Mutasi Kas Keluar (Bayar Hutang) */}
        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">Realisasi Bayar Hutang</p>
              <h3 className="text-xl font-black font-mono text-slate-900 mt-1">
                Rp {debtPayments.reduce((acc, it) => acc + it.amount, 0).toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-amber-100 text-slate-500">
            <span>{debtPayments.length} Transaksi Pembayaran</span>
            <span className="text-amber-700 font-bold font-mono">Buku Kas Out</span>
          </div>
        </div>

        {/* KPI 4: Mutasi Kas Masuk (Pelunasan Piutang) */}
        <div className="bg-white p-5 rounded-2xl border border-indigo-200 shadow-xs">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-indigo-700">Realisasi Pelunasan Piutang</p>
              <h3 className="text-xl font-black font-mono text-slate-900 mt-1">
                Rp {receivablePayments.reduce((acc, it) => acc + it.amount, 0).toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-indigo-100 text-slate-500">
            <span>{receivablePayments.length} Transaksi Pelunasan</span>
            <span className="text-indigo-700 font-bold font-mono">Buku Kas In</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTab('hutang');
              setStatusFilter('all');
            }}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'hutang'
                ? 'bg-rose-700 text-white shadow-md'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>Manajemen Hutang (Faktur PBF)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'hutang' ? 'bg-rose-900 text-rose-100' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {totalDebtCount}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('piutang');
              setStatusFilter('all');
            }}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'piutang'
                ? 'bg-teal-700 text-white shadow-md'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Manajemen Piutang (Penjualan POS)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'piutang' ? 'bg-teal-900 text-teal-100' : 'bg-teal-100 text-teal-800'
              }`}
            >
              {totalReceivableCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('riwayat')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'riwayat'
                ? 'bg-indigo-700 text-white shadow-md'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Buku Kas & Riwayat Mutasi</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'riwayat' ? 'bg-indigo-900 text-indigo-100' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {cashFlowRecords.length}
            </span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        {activeTab !== 'riwayat' && (
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={
                  activeTab === 'hutang'
                    ? 'Cari No. Faktur / PBF / Sales...'
                    : 'Cari No. Trx / Pasien / Mitra...'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="all">Semua Status</option>
              <option value="belum_lunas">Belum Lunas (0%)</option>
              <option value="sebagian">Sebagian (Dicicil)</option>
              <option value="overdue">Lewat Jatuh Tempo</option>
              <option value="lunas">Lunas</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB CONTENT 1: MANAJEMEN HUTANG (FAKTUR PBF & HUTANG AWAL DISTRIBUTOR) */}
      {activeTab === 'hutang' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-rose-700" />
                <span>Daftar Hutang Pembelian & Saldo Awal Distributor / PBF</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Terintegrasi real-time dengan Faktur Pembelian PBF, Pencatatan Hutang Awal Distributor, dan Supabase Cloud
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setDebtSourceFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    debtSourceFilter === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Semua ({debtItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDebtSourceFilter('purchase')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    debtSourceFilter === 'purchase'
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Faktur PBF ({debtItems.length - openingDebtCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDebtSourceFilter('opening')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    debtSourceFilter === 'opening'
                      ? 'bg-indigo-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Hutang Awal ({openingDebtCount})
                </button>
              </div>

              <button
                type="button"
                onClick={handleOpenAddOpeningDebt}
                className="px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Catat Hutang Awal Distributor</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/75 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3 text-center w-10">No</th>
                  <th className="p-3">No. Faktur PBF</th>
                  <th className="p-3">Distributor / PBF</th>
                  <th className="p-3">Tgl Faktur</th>
                  <th className="p-3">Jatuh Tempo</th>
                  <th className="p-3 text-right">Total Tagihan</th>
                  <th className="p-3 text-right">Sudah Dibayar</th>
                  <th className="p-3 text-right">Sisa Hutang</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center w-32">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedDebtList.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-bold">Tidak ada data faktur hutang yang cocok dengan filter.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedDebtList.map((inv, idx) => {
                    const isFullyPaid = inv.status === 'Lunas' || inv.calculatedRemaining <= 0;
                    const rowNum = (safeDebtPage - 1) * debtPageSize + idx + 1;
                    const isOpening = isOpeningDebtInvoice(inv);
                    const payStat = debtPaymentStatsByInvoiceId.get(inv.id);
                    const hasAppPayments = (payStat?.count || 0) > 0;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 text-center font-mono text-slate-400">{rowNum}</td>
                        <td className="p-3 font-mono font-bold text-slate-900">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{inv.invoiceNo}</span>
                            {isOpening && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 font-sans text-[9px] font-black uppercase tracking-wide">
                                Hutang Awal
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-normal">ID: {inv.id}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{inv.pbfName}</div>
                          <div className="text-[10px] text-slate-500">Sales: {inv.salesman || '-'}</div>
                          {inv.notes && (
                            <div className="text-[10px] text-indigo-700 italic mt-0.5 line-clamp-1" title={inv.notes}>
                              {inv.notes}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-mono text-slate-600">{inv.date}</td>
                        <td className="p-3 font-mono">
                          <div className={inv.isOverdue ? 'text-rose-700 font-bold' : 'text-slate-800'}>
                            {inv.dueDate || '-'}
                          </div>
                          {!isFullyPaid && inv.daysRemaining !== null && (
                            <div className="text-[10px]">
                              {inv.daysRemaining < 0 ? (
                                <span className="text-rose-600 font-bold">
                                  Lewat {Math.abs(inv.daysRemaining)} hari!
                                </span>
                              ) : inv.daysRemaining <= 5 ? (
                                <span className="text-amber-600 font-bold">
                                  Sisa {inv.daysRemaining} hari
                                </span>
                              ) : (
                                <span className="text-slate-400">Sisa {inv.daysRemaining} hari</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          Rp {inv.totalTagihan.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-700 font-semibold">
                          Rp {inv.calculatedPaid.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-rose-700 text-sm">
                          Rp {inv.calculatedRemaining.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center">
                          {isFullyPaid ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Lunas
                            </span>
                          ) : inv.calculatedPaid > 0 ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                              Sebagian
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                              Belum Lunas
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isFullyPaid ? (
                              <button
                                type="button"
                                onClick={() => handleOpenPayDebt(inv)}
                                className="px-2.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-[11px] font-bold shadow-xs flex items-center gap-1 transition active:scale-95 cursor-pointer whitespace-nowrap"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>Bayar</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-bold flex items-center justify-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Selesai</span>
                              </span>
                            )}
                            {isOpening && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditOpeningDebt(inv)}
                                  title="Edit Hutang Awal Distributor"
                                  className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (hasAppPayments) {
                                      showToast(
                                        `Hutang awal #${inv.invoiceNo} sudah memiliki ${payStat?.count} riwayat pembayaran di Buku Kas dan tidak dapat dihapus demi integritas kas.`
                                      );
                                      return;
                                    }
                                    setDeleteOpeningTarget(inv);
                                  }}
                                  title={
                                    hasAppPayments
                                      ? 'Tidak dapat dihapus karena sudah ada transaksi pembayaran di Buku Kas'
                                      : 'Hapus Pencatatan Hutang Awal'
                                  }
                                  className={`p-1.5 rounded-lg border transition ${
                                    hasAppPayments
                                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 cursor-pointer'
                                  }`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
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
            currentPage={safeDebtPage}
            totalPages={debtTotalPages}
            totalCount={filteredDebtList.length}
            pageSize={debtPageSize}
            onPageChange={setDebtPage}
            onPageSizeChange={(sz) => {
              setDebtPageSize(sz);
              setDebtPage(1);
            }}
            itemLabel="faktur hutang"
          />
        </div>
      )}

      {/* TAB CONTENT 2: MANAJEMEN PIUTANG (PENJUALAN POS) */}
      {activeTab === 'piutang' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-teal-700" />
                <span>Daftar Piutang Pasien, Pelanggan, & Mitra Faskes (Penjualan POS)</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Terintegrasi langsung dengan tabel riwayat penjualan & kasir POS
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Menampilkan <strong>{filteredReceivableList.length}</strong> dari {receivableItems.length} transaksi
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/75 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3 text-center w-10">No</th>
                  <th className="p-3">No. Trx / Faktur</th>
                  <th className="p-3">Pelanggan / Pasien / Mitra</th>
                  <th className="p-3">Tgl Transaksi</th>
                  <th className="p-3">Jatuh Tempo</th>
                  <th className="p-3 text-right">Total Transaksi</th>
                  <th className="p-3 text-right">Sudah Diterima</th>
                  <th className="p-3 text-right">Sisa Piutang</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center w-36">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedReceivableList.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-bold">Tidak ada data piutang yang cocok dengan filter.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedReceivableList.map((trx, idx) => {
                    const isFullyPaid = trx.calculatedStatus === 'Lunas' || trx.calculatedRemaining <= 0;
                    const rowNum = (safeReceivablePage - 1) * receivablePageSize + idx + 1;
                    return (
                      <tr key={trx.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 text-center font-mono text-slate-400">{rowNum}</td>
                        <td className="p-3 font-mono font-bold text-slate-900">
                          <div>{trx.id}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{trx.type}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{trx.customerName}</div>
                          {trx.customerPhone && (
                            <div className="text-[10px] text-slate-500 font-mono">{trx.customerPhone}</div>
                          )}
                          <div className="text-[10px] text-slate-400">Kasir: {trx.kasir}</div>
                        </td>
                        <td className="p-3 font-mono text-slate-600">{trx.date.split(' ')[0]}</td>
                        <td className="p-3 font-mono">
                          <div className={trx.isOverdue ? 'text-rose-700 font-bold' : 'text-slate-800'}>
                            {trx.dueDate || '-'}
                          </div>
                          {!isFullyPaid && trx.daysRemaining !== null && (
                            <div className="text-[10px]">
                              {trx.daysRemaining < 0 ? (
                                <span className="text-rose-600 font-bold">
                                  Lewat {Math.abs(trx.daysRemaining)} hari!
                                </span>
                              ) : trx.daysRemaining <= 5 ? (
                                <span className="text-amber-600 font-bold">
                                  Sisa {trx.daysRemaining} hari
                                </span>
                              ) : (
                                <span className="text-slate-400">Sisa {trx.daysRemaining} hari</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          Rp {trx.total.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-700 font-semibold">
                          Rp {trx.calculatedPaid.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-teal-800 text-sm">
                          Rp {trx.calculatedRemaining.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center">
                          {isFullyPaid ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Lunas
                            </span>
                          ) : trx.calculatedPaid > 0 ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                              Sebagian
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-teal-100 text-teal-800 border border-teal-300">
                              Belum Lunas
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {!isFullyPaid ? (
                            <button
                              onClick={() => handleOpenPayReceivable(trx)}
                              className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 mx-auto transition active:scale-95 cursor-pointer"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Bayar Piutang</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-600 font-bold flex items-center justify-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Lunas</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={safeReceivablePage}
            totalPages={receivableTotalPages}
            totalCount={filteredReceivableList.length}
            pageSize={receivablePageSize}
            onPageChange={setReceivablePage}
            onPageSizeChange={(sz) => {
              setReceivablePageSize(sz);
              setReceivablePage(1);
            }}
            itemLabel="piutang"
          />
        </div>
      )}

      {/* TAB CONTENT 3: BUKU KAS & RIWAYAT MUTASI */}
      {activeTab === 'riwayat' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-indigo-700" />
                <span>Buku Kas & Log Mutasi Pelunasan Hutang-Piutang</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Catatan mutasi kas masuk (pelunasan piutang) dan kas keluar (pembayaran hutang PBF)
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Total <strong>{cashFlowRecords.length}</strong> transaksi kas tercatat
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/75 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3 text-center w-10">No</th>
                  <th className="p-3">Waktu & Tanggal</th>
                  <th className="p-3">Jenis Arus Kas</th>
                  <th className="p-3">Kategori</th>
                  <th className="p-3">Pihak Terkait</th>
                  <th className="p-3">No. Referensi</th>
                  <th className="p-3">Metode Pembayaran</th>
                  <th className="p-3 text-right">Nominal Mutasi</th>
                  <th className="p-3">Petugas</th>
                  <th className="p-3 text-center">Bukti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedCashFlowRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-bold">Belum ada riwayat mutasi pembayaran atau pelunasan.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedCashFlowRecords.map((cf, idx) => (
                    <tr key={cf.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-mono text-slate-400">
                        {(safeCashPage - 1) * cashPageSize + idx + 1}
                      </td>
                      <td className="p-3 font-mono">
                        <div className="font-bold text-slate-800">{cf.date}</div>
                        <div className="text-[10px] text-slate-400">{cf.time}</div>
                      </td>
                      <td className="p-3">
                        {cf.type === 'IN' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 w-max">
                            <ArrowUpRight className="w-3 h-3" />
                            <span>Kas Masuk</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 w-max">
                            <ArrowDownLeft className="w-3 h-3" />
                            <span>Kas Keluar</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{cf.category}</td>
                      <td className="p-3 font-bold text-slate-900">{cf.partyName}</td>
                      <td className="p-3 font-mono text-slate-600">{cf.referenceNo}</td>
                      <td className="p-3 text-slate-700">{cf.paymentMethod}</td>
                      <td
                        className={`p-3 text-right font-mono font-black text-sm ${
                          cf.type === 'IN' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {cf.type === 'IN' ? '+' : '-'} Rp {cf.amount.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-slate-600 font-mono text-[11px]">{cf.petugas}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            setReceiptData({
                              type: cf.type === 'IN' ? 'PIUTANG' : 'HUTANG',
                              title:
                                cf.type === 'IN'
                                  ? 'KUITANSI PENERIMAAN KAS / PELUNASAN PIUTANG'
                                  : 'BUKTI PENGELUARAN KAS / PEMBAYARAN HUTANG PBF',
                              receiptNo: cf.id,
                              date: cf.date,
                              partyName: cf.partyName,
                              referenceNo: cf.referenceNo,
                              amount: cf.amount,
                              paymentMethod: cf.paymentMethod,
                              petugas: cf.petugas,
                              notes: cf.description,
                              previousBalance: cf.amount,
                              remainingBalance: 0
                            });
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-300 flex items-center gap-1 mx-auto transition cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Kuitansi</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={safeCashPage}
            totalPages={cashTotalPages}
            totalCount={cashFlowRecords.length}
            pageSize={cashPageSize}
            onPageChange={setCashPage}
            onPageSizeChange={(sz) => {
              setCashPageSize(sz);
              setCashPage(1);
            }}
            itemLabel="mutasi kas"
          />
        </div>
      )}

      {/* MODAL 1: FORM PEMBAYARAN HUTANG PBF */}
      {selectedInvoiceForPay && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200 animate-scale-up">
            <div className="px-6 py-4 bg-rose-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-800 rounded-xl text-rose-200">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm">Pembayaran Hutang Faktur PBF</h3>
                  <p className="text-[11px] text-rose-200 font-mono">
                    Faktur #{selectedInvoiceForPay.invoiceNo} - {selectedInvoiceForPay.pbfName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedInvoiceForPay(null)}
                className="text-rose-300 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Ringkasan Hutang */}
              <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Distributor / PBF:</span>
                  <span className="font-bold text-slate-900">{selectedInvoiceForPay.pbfName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Tanggal Jatuh Tempo:</span>
                  <span className="font-bold font-mono text-slate-900">
                    {selectedInvoiceForPay.dueDate || '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-rose-200 pt-2">
                  <span className="text-slate-600 font-medium">Total Nilai Tagihan:</span>
                  <span className="font-mono font-bold text-slate-800">
                    Rp {selectedInvoiceForPay.totalTagihan.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Sudah Terbayar Sebelumnya:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    Rp {((selectedInvoiceForPay as any).calculatedPaid || 0).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t-2 border-rose-300 pt-2 text-sm">
                  <span className="font-black text-rose-900">SISA HUTANG HARUS DIBAYAR:</span>
                  <span className="font-black font-mono text-rose-700 text-base">
                    Rp {((selectedInvoiceForPay as any).calculatedRemaining || 0).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Opsi Cepat */}
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-bold text-[11px]">Pilihan Cepat:</span>
                <button
                  type="button"
                  onClick={() =>
                    setPaymentForm({
                      ...paymentForm,
                      amount: (selectedInvoiceForPay as any).calculatedRemaining || 0
                    })
                  }
                  className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-bold text-[11px] border border-rose-300 transition cursor-pointer"
                >
                  Bayar Lunas Sekaligus (100%)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPaymentForm({
                      ...paymentForm,
                      amount: Math.round(((selectedInvoiceForPay as any).calculatedRemaining || 0) / 2)
                    })
                  }
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] border border-slate-300 transition cursor-pointer"
                >
                  Cicilan 50%
                </button>
              </div>

              {/* Input Nominal Bayar */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nominal Pembayaran Sekarang (Rp) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={(selectedInvoiceForPay as any).calculatedRemaining || 0}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) || 0 })}
                  className="w-full p-3 border-2 border-rose-300 rounded-xl font-mono font-black text-base text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                />
              </div>

              {/* Metode Pembayaran */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Metode Pembayaran *</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="Transfer Bank (BCA 827-092-1122)">Transfer BCA (827-092-1122)</option>
                    <option value="Transfer Bank (Mandiri)">Transfer Mandiri</option>
                    <option value="Transfer Bank (BRI)">Transfer BRI</option>
                    <option value="Kas Apotek (Tunai)">Kas Apotek (Tunai)</option>
                    <option value="Giro / Cek Tempo">Giro / Cek Tempo</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Transaksi Bayar *</label>
                  <input
                    type="date"
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* No Bukti Transfer / Referensi */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  No. Bukti Transfer / Kuitansi (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Cth: TRF-BCA-88912 atau No. Kuitansi PBF"
                  value={paymentForm.referenceNo}
                  onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono text-xs"
                />
              </div>

              {/* Catatan */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Pembayaran</label>
                <input
                  type="text"
                  placeholder="Catatan tambahan (opsional)..."
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
                />
              </div>

              {paymentError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentError(null);
                    setSelectedInvoiceForPay(null);
                  }}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-slate-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleProcessDebtPayment}
                  className="px-6 py-2.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl font-black shadow-md flex items-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Proses & Simpan Pembayaran</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: FORM PENERIMAAN / PELUNASAN PIUTANG POS */}
      {selectedTrxForPay && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200 animate-scale-up">
            <div className="px-6 py-4 bg-teal-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-800 rounded-xl text-teal-200">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm">Penerimaan Pelunasan Piutang</h3>
                  <p className="text-[11px] text-teal-200 font-mono">
                    Transaksi #{selectedTrxForPay.id} - {selectedTrxForPay.customerName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTrxForPay(null)}
                className="text-teal-300 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Ringkasan Piutang */}
              <div className="bg-teal-50/70 p-4 rounded-2xl border border-teal-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Pelanggan / Pasien / Mitra:</span>
                  <span className="font-bold text-slate-900">{selectedTrxForPay.customerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Tanggal Transaksi:</span>
                  <span className="font-bold font-mono text-slate-900">
                    {selectedTrxForPay.date}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-teal-200 pt-2">
                  <span className="text-slate-600 font-medium">Total Nilai Tagihan:</span>
                  <span className="font-mono font-bold text-slate-800">
                    Rp {selectedTrxForPay.total.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Sudah Diterima Sebelumnya:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    Rp {((selectedTrxForPay as any).calculatedPaid || 0).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t-2 border-teal-300 pt-2 text-sm">
                  <span className="font-black text-teal-900">SISA PIUTANG YANG HARUS DITERIMA:</span>
                  <span className="font-black font-mono text-teal-800 text-base">
                    Rp {((selectedTrxForPay as any).calculatedRemaining || 0).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Opsi Cepat */}
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-bold text-[11px]">Pilihan Cepat:</span>
                <button
                  type="button"
                  onClick={() =>
                    setPaymentForm({
                      ...paymentForm,
                      amount: (selectedTrxForPay as any).calculatedRemaining || 0
                    })
                  }
                  className="px-3 py-1 bg-teal-100 hover:bg-teal-200 text-teal-800 rounded-lg font-bold text-[11px] border border-teal-300 transition cursor-pointer"
                >
                  Pelunasan Penuh (100%)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPaymentForm({
                      ...paymentForm,
                      amount: Math.round(((selectedTrxForPay as any).calculatedRemaining || 0) / 2)
                    })
                  }
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] border border-slate-300 transition cursor-pointer"
                >
                  Cicilan 50%
                </button>
              </div>

              {/* Input Nominal Terima */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nominal Diterima Sekarang (Rp) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={(selectedTrxForPay as any).calculatedRemaining || 0}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) || 0 })}
                  className="w-full p-3 border-2 border-teal-300 rounded-xl font-mono font-black text-base text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                />
              </div>

              {/* Metode Pembayaran */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Metode Penerimaan *</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="Kas Apotek (Tunai)">Kas Apotek (Tunai)</option>
                    <option value="Transfer Bank (BCA)">Transfer BCA</option>
                    <option value="Transfer Bank (Mandiri)">Transfer Mandiri</option>
                    <option value="QRIS / Digital">QRIS / Digital</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Penerimaan *</label>
                  <input
                    type="date"
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* No Bukti / Referensi */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  No. Bukti / Kuitansi (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Cth: KWT-POS-00123"
                  value={paymentForm.referenceNo}
                  onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-xs"
                />
              </div>

              {/* Catatan */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Penerimaan</label>
                <input
                  type="text"
                  placeholder="Catatan tambahan (opsional)..."
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
                />
              </div>

              {paymentError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentError(null);
                    setSelectedTrxForPay(null);
                  }}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-slate-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleProcessReceivablePayment}
                  className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-black shadow-md flex items-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Proses & Simpan Pelunasan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: KUITANSI & BUKTI BAYAR RESMI */}
      {receiptData && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-300 my-6 animate-scale-up">
            <div className="px-6 py-3 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs uppercase tracking-wide">
                  Pratinjau Kuitansi Pembayaran
                </span>
              </div>
              <button
                onClick={() => setReceiptData(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bagian Cetak Kuitansi */}
            <div id="receipt-print-area" className="p-8 text-slate-900 space-y-5 text-xs">
              {/* KOP APOTEK */}
              <div className="border-b-2 border-slate-900 pb-3">
                <div className="flex items-center justify-between gap-4">
                  {pharmacyProfile.logoUrl ? (
                    <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                      <img
                        src={pharmacyProfile.logoUrl}
                        alt="Logo Faskes"
                        className="w-14 h-14 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-14 shrink-0" />
                  )}
                  <div className="flex-1 text-center">
                    <h2 className="font-black text-lg tracking-wide uppercase text-slate-950">
                      {pharmacyProfile.name}
                    </h2>
                    <p className="text-[11px] text-slate-700 font-medium">
                      {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                    </p>
                    <p className="text-[10px] text-slate-600 font-mono">
                      {[
                        pharmacyProfile.sia ? `SIA: ${pharmacyProfile.sia}` : '',
                        pharmacyProfile.nib ? `NIB: ${pharmacyProfile.nib}` : '',
                        pharmacyProfile.npwp ? `NPWP: ${pharmacyProfile.npwp}` : ''
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="w-14 shrink-0" />
                </div>
                <div className="text-center">
                  <div className="inline-block mt-2 px-4 py-0.5 rounded-md bg-slate-900 text-white font-extrabold text-[11px] uppercase tracking-wider">
                    {receiptData.title}
                  </div>
                </div>
              </div>

              {/* Rincian Kuitansi */}
              <div className="grid grid-cols-2 gap-3 text-xs border-b border-slate-300 pb-3">
                <div>
                  <p className="text-slate-500 font-semibold text-[10px]">NO. KUITANSI BUKTI:</p>
                  <p className="font-mono font-bold text-slate-900">{receiptData.receiptNo}</p>
                  <p className="text-slate-500 font-semibold text-[10px] mt-2">TANGGAL TRANSAKSI:</p>
                  <p className="font-mono font-bold text-slate-900">{receiptData.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 font-semibold text-[10px]">
                    {receiptData.type === 'HUTANG' ? 'DIBAYARKAN KEPADA:' : 'DITERIMA DARI:'}
                  </p>
                  <p className="font-black text-sm text-slate-950">{receiptData.partyName}</p>
                  <p className="text-slate-500 font-semibold text-[10px] mt-2">NO. FAKTUR ASAL:</p>
                  <p className="font-mono font-bold text-indigo-700">{receiptData.referenceNo}</p>
                </div>
              </div>

              {/* Rincian Nominal */}
              <div className="bg-slate-50 border border-slate-300 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-semibold">Saldo Sebelum Pembayaran:</span>
                  <span className="font-mono font-bold text-slate-800">
                    Rp {receiptData.previousBalance.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm border-t border-slate-300 pt-2">
                  <span className="font-black text-slate-950">JUMLAH DIBAYARKAN / DITERIMA:</span>
                  <span
                    className={`font-black font-mono text-base ${
                      receiptData.type === 'HUTANG' ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    Rp {receiptData.amount.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-300 pt-2">
                  <span className="text-slate-600 font-semibold">Sisa Saldo Setelah Transaksi:</span>
                  <span className="font-mono font-bold text-slate-900">
                    Rp {receiptData.remainingBalance.toLocaleString('id-ID')}{' '}
                    {receiptData.remainingBalance === 0 && '(LUNAS 100%)'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                  <span>Metode Pembayaran:</span>
                  <span className="font-bold text-slate-800">{receiptData.paymentMethod}</span>
                </div>
                {receiptData.notes && (
                  <div className="text-[11px] text-slate-600 pt-1 border-t border-dashed border-slate-200">
                    <span>Keterangan: </span>
                    <span className="italic">{receiptData.notes}</span>
                  </div>
                )}
              </div>

              {/* Tanda Tangan */}
              <div className="grid grid-cols-2 pt-6 text-center text-xs">
                <div className="space-y-12">
                  <p className="font-bold text-slate-700">
                    {receiptData.type === 'HUTANG' ? 'Penerima (Sales / PBF),' : 'Penyetor (Pasien / Mitra),'}
                  </p>
                  <p className="font-bold text-slate-900">
                    ( {receiptData.partyName.slice(0, 25)} )
                  </p>
                </div>
                <div className="space-y-12">
                  <p className="font-bold text-slate-700">Kasir / Petugas Keuangan,</p>
                  <p className="font-bold text-slate-900 underline decoration-slate-400">
                    {receiptData.petugas}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="px-6 py-3 bg-slate-100 border-t border-slate-300 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setReceiptData(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handlePrintReceiptWindow}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Bukti Kuitansi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SKEMA SQL SUPABASE MANAJEMEN HUTANG & PIUTANG */}
      {isOwnerAdmin && showSqlModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm">
                    Skema SQL Supabase — Manajemen Hutang & Piutang
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Tabel: faktur_pembelian, pembayaran_hutang, pelunasan_piutang, buku_kas_mutasi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 text-indigo-950 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold">Petunjuk Integrasi Database:</p>
                  <p className="text-[11px] text-indigo-800 mt-0.5">
                    Salin skrip SQL di bawah ini, buka <strong>SQL Editor</strong> pada Dashboard Supabase Anda, lalu klik <strong>Run</strong>. Setelah selesai, klik tombol <strong>Sinkronkan Supabase</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_DEBT_RECEIVABLE_SQL_SCHEMA);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2500);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedSql ? 'Tersalin!' : 'Salin Skrip SQL'}</span>
                </button>
              </div>

              <pre className="bg-slate-950 text-emerald-300 p-4 rounded-2xl font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
                {SUPABASE_DEBT_RECEIVABLE_SQL_SCHEMA}
              </pre>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSqlModal(false);
                  handleManualSyncSupabase();
                }}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Cek & Sinkronkan Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 5: PENCATATAN & EDIT HUTANG AWAL DISTRIBUTOR */}
      {isOpeningDebtModalOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 my-6 animate-scale-up">
            <div className="px-6 py-4 bg-indigo-950 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-800/80 rounded-xl text-indigo-200 border border-indigo-600/40">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm">
                    {editingOpeningDebtId
                      ? 'Edit Pencatatan Hutang Awal Distributor'
                      : 'Catat Hutang Awal Distributor (Saldo Awal PBF)'}
                  </h3>
                  <p className="text-[11px] text-indigo-200">
                    Mencatat saldo hutang lama ke distributor tanpa mengubah stok barang saat ini & tersinkron ke Supabase
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpeningDebtModalOpen(false);
                  setOpeningDebtError(null);
                }}
                className="text-indigo-300 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOpeningDebt} className="p-6 space-y-4 text-xs">
              {/* Pilihan Distributor / PBF */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-black text-slate-800">
                    Distributor / PBF *
                  </label>
                  {suppliers.length > 0 && (
                    <div className="inline-flex rounded-lg bg-white border border-slate-300 p-0.5 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() =>
                          setOpeningDebtForm((prev) => ({
                            ...prev,
                            supplierMode: 'master'
                          }))
                        }
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          openingDebtForm.supplierMode === 'master'
                            ? 'bg-indigo-700 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Pilih Master PBF
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setOpeningDebtForm((prev) => ({
                            ...prev,
                            supplierMode: 'custom',
                            selectedSupplierId: ''
                          }))
                        }
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          openingDebtForm.supplierMode === 'custom'
                            ? 'bg-indigo-700 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Ketik Manual
                      </button>
                    </div>
                  )}
                </div>

                {openingDebtForm.supplierMode === 'master' && suppliers.length > 0 ? (
                  <select
                    value={openingDebtForm.selectedSupplierId}
                    onChange={(e) => {
                      const supId = e.target.value;
                      const found = suppliers.find((s) => s.id === supId);
                      setOpeningDebtForm((prev) => ({
                        ...prev,
                        selectedSupplierId: supId,
                        pbfName: found?.name || prev.pbfName,
                        salesman: prev.salesman || found?.picName || ''
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Pilih Distributor / PBF Terdaftar --</option>
                    {suppliers.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name} {sup.picName ? `(PIC: ${sup.picName})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Contoh: PT Bina San Prima / PT Enseval Putera Megatrading"
                    value={openingDebtForm.pbfName}
                    onChange={(e) =>
                      setOpeningDebtForm((prev) => ({ ...prev, pbfName: e.target.value }))
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>

              {/* No Referensi & Cabang */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">
                      No. Faktur / Referensi Hutang Awal *
                    </label>
                    {!editingOpeningDebtId && (
                      <button
                        type="button"
                        onClick={() =>
                          setOpeningDebtForm((prev) => ({
                            ...prev,
                            invoiceNo: generateOpeningDebtRefNo(prev.date)
                          }))
                        }
                        className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
                      >
                        Isi Nomor Otomatis
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Cth: FKT-LAMA-0012 / AWAL-PBF-01"
                    value={openingDebtForm.invoiceNo}
                    onChange={(e) =>
                      setOpeningDebtForm((prev) => ({ ...prev, invoiceNo: e.target.value }))
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Salesman / PIC Distributor
                  </label>
                  <input
                    type="text"
                    placeholder="Nama salesman / kontak tagihan (opsional)"
                    value={openingDebtForm.salesman}
                    onChange={(e) =>
                      setOpeningDebtForm((prev) => ({ ...prev, salesman: e.target.value }))
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Tanggal Hutang, Termin & Jatuh Tempo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Faktur / Hutang *</label>
                  <input
                    type="date"
                    value={openingDebtForm.date}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setOpeningDebtForm((prev) => ({
                        ...prev,
                        date: nextDate,
                        dueDate: calculateDueDateByTerm(nextDate, prev.term)
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Termin Tempo</label>
                  <select
                    value={openingDebtForm.term}
                    onChange={(e) => {
                      const nextTerm = e.target.value as PurchaseInvoice['term'];
                      setOpeningDebtForm((prev) => ({
                        ...prev,
                        term: nextTerm,
                        dueDate: calculateDueDateByTerm(prev.date, nextTerm)
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Cash / COD">Cash / COD</option>
                    <option value="14 Hari">14 Hari</option>
                    <option value="30 Hari">30 Hari</option>
                    <option value="60 Hari">60 Hari</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Jatuh Tempo *</label>
                  <input
                    type="date"
                    value={openingDebtForm.dueDate}
                    onChange={(e) =>
                      setOpeningDebtForm((prev) => ({ ...prev, dueDate: e.target.value }))
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Nominal Hutang & Sudah Dibayar */}
              {(() => {
                const appPaidSum = editingOpeningDebtId
                  ? debtPaymentStatsByInvoiceId.get(editingOpeningDebtId)?.totalPaid || 0
                  : 0;
                const totalNum = Math.round(Number(openingDebtForm.totalTagihan) || 0);
                const priorNum = Math.max(0, Math.round(Number(openingDebtForm.priorPaidAmount) || 0));
                const remainingPreview = Math.max(0, totalNum - priorNum - appPaidSum);
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Total Nilai Hutang Awal (Rp) *
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={openingDebtForm.totalTagihan || ''}
                          placeholder="0"
                          onChange={(e) =>
                            setOpeningDebtForm((prev) => ({
                              ...prev,
                              totalTagihan: Number(e.target.value) || 0
                            }))
                          }
                          className="w-full p-3 border-2 border-indigo-300 rounded-xl font-mono font-black text-base text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Sudah Terbayar Sebelumnya (Rp)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={openingDebtForm.priorPaidAmount || ''}
                          placeholder="0 (jika belum ada cicilan lama)"
                          onChange={(e) =>
                            setOpeningDebtForm((prev) => ({
                              ...prev,
                              priorPaidAmount: Math.max(0, Number(e.target.value) || 0)
                            }))
                          }
                          className="w-full p-3 border border-slate-300 rounded-xl font-mono font-bold text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                    </div>

                    <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-3.5 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Total Hutang Awal:</span>
                        <span className="font-mono font-bold text-slate-900">
                          Rp {totalNum.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Terbayar Sebelum Aplikasi:</span>
                        <span className="font-mono font-semibold text-emerald-700">
                          Rp {priorNum.toLocaleString('id-ID')}
                        </span>
                      </div>
                      {appPaidSum > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 font-medium">Pembayaran Tercatat di Buku Kas:</span>
                          <span className="font-mono font-semibold text-emerald-700">
                            Rp {appPaidSum.toLocaleString('id-ID')}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center border-t border-indigo-200 pt-2">
                        <span className="font-black text-indigo-950">SISA HUTANG AKTIF TERCATAT:</span>
                        <span className="font-mono font-black text-base text-rose-700">
                          Rp {remainingPreview.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Cabang & Catatan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {branches.length > 0 && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Cabang Apotek</label>
                    <select
                      value={openingDebtForm.branchId}
                      onChange={(e) =>
                        setOpeningDebtForm((prev) => ({ ...prev, branchId: e.target.value }))
                      }
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {branches.map((br) => (
                        <option key={br.id} value={br.id}>
                          {br.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={branches.length > 0 ? '' : 'sm:col-span-2'}>
                  <label className="block font-bold text-slate-700 mb-1">Catatan / Keterangan</label>
                  <input
                    type="text"
                    placeholder="Cth: Saldo awal hutang faktur sebelum cutover sistem"
                    value={openingDebtForm.notes}
                    onChange={(e) =>
                      setOpeningDebtForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {openingDebtError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{openingDebtError}</span>
                </div>
              )}

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpeningDebtModalOpen(false);
                    setOpeningDebtError(null);
                  }}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-slate-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingOpeningDebt}
                  className="px-6 py-2.5 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white rounded-xl font-black shadow-md flex items-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isSavingOpeningDebt
                      ? 'Menyimpan...'
                      : editingOpeningDebtId
                      ? 'Simpan Perubahan Hutang Awal'
                      : 'Simpan & Sinkronkan Hutang Awal'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: KONFIRMASI HAPUS HUTANG AWAL DISTRIBUTOR */}
      {deleteOpeningTarget && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-scale-up">
            <div className="px-6 py-4 bg-rose-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-300" />
                <h3 className="font-black text-sm">Hapus Pencatatan Hutang Awal?</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteOpeningTarget(null)}
                className="text-rose-200 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs text-slate-700">
              <p>
                Anda akan menghapus pencatatan hutang awal distributor{' '}
                <strong className="text-slate-900">{deleteOpeningTarget.pbfName}</strong> dengan No.
                Referensi <strong className="font-mono text-rose-700">#{deleteOpeningTarget.invoiceNo}</strong>{' '}
                sebesar{' '}
                <strong className="font-mono text-slate-900">
                  Rp {deleteOpeningTarget.totalTagihan.toLocaleString('id-ID')}
                </strong>.
              </p>
              <p className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                Penghapusan ini akan langsung tersinkronisasi ke database Supabase dan tidak mengubah stok obat di gudang.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteOpeningTarget(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteOpeningDebt}
                  className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Ya, Hapus Permanen</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

