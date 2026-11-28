import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgePercent,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCopy,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Globe,
  Layers,
  Megaphone,
  MessageCircle,
  PackageCheck,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Target,
  Trash2,
  TrendingUp,
  Truck,
  Users,
  X
} from 'lucide-react';
import { PortalQRGeneratorModal } from './PortalQRGeneratorModal';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';
import {
  Branch,
  DrugInteractionRecord,
  MarketingCampaign,
  MarketingCampaignStatus,
  MarketingStrategyType,
  Medicine,
  Mitra,
  MitraOrder,
  Patient,
  PortalActivityEvent,
  PromoAd,
  PurchaseOrder,
  PurchaseOrderItem,
  RMERecord,
  SalesDiscount,
  SPGroupType,
  Supplier,
  Transaction
} from '../types';
import {
  BasketPairRow,
  CampaignImpactEvaluation,
  MarketingChannelFilter,
  MarketingPeriodPreset,
  MarketingRecommendation,
  ProductMovementClass,
  ProductPerformanceRow,
  ProductQuadrant,
  computeMarketingAnalytics,
  evaluateCampaignImpact,
  toLocalDateString
} from '../utils/marketingAnalytics';
import { SUPABASE_MARKETING_SQL_SCHEMA } from '../utils/supabaseClient';

interface MarketingStrategyViewProps {
  transactions: Transaction[];
  medicines: Medicine[];
  patients: Patient[];
  mitraList: Mitra[];
  mitraOrders: MitraOrder[];
  rmeRecords: RMERecord[];
  salesDiscounts: SalesDiscount[];
  promoAds: PromoAd[];
  purchaseOrders: PurchaseOrder[];
  branches: Branch[];
  currentBranch: Branch;
  suppliers: Supplier[];
  interactionRules: DrugInteractionRecord[];
  marketingCampaigns: MarketingCampaign[];
  portalActivityLogs?: PortalActivityEvent[];
  needsTableSetup?: boolean;
  isDemoSandbox?: boolean;
  userName: string;
  onSaveCampaign: (
    campaign: MarketingCampaign,
    isEdit: boolean
  ) => Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }>;
  onDeleteCampaign: (
    id: string
  ) => Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }>;
  onSyncCampaignsSupabase: () => Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
    count?: number;
  }>;
  onSaveDiscount: (d: SalesDiscount, isEdit: boolean) => void;
  onSavePromo: (p: PromoAd, isEdit: boolean) => void;
  onSavePurchaseOrder: (
    po: PurchaseOrder
  ) => Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }>;
  onNavigateTab: (tabId: string) => void;
  onOpenMitraPortal: () => void;
}

type InternalTabId = 'overview' | 'movement' | 'basket' | 'customers' | 'campaigns';

const formatRp = (val: number): string =>
  `Rp ${Math.round(Number(val) || 0).toLocaleString('id-ID')}`;

const formatPct = (val: number | null, digits = 1): string => {
  if (val === null || !Number.isFinite(val)) return '—';
  return `${val.toFixed(digits)}%`;
};

const resolveSPGroupFromMed = (med: Medicine): SPGroupType => {
  const nappza = String(med.nappza || '').toLowerCase();
  const cat = String(med.category || '').toLowerCase();
  if (nappza.includes('narkotik')) return 'NAR';
  if (nappza.includes('psikotropik')) return 'PSI';
  if (nappza.includes('prekursor')) return 'PRE';
  if (nappza.includes('oot') || nappza.includes('tertentu')) return 'OOT';
  if (cat.includes('alat') || cat.includes('alkes') || cat.includes('kesehatan')) return 'ALK';
  return 'REG';
};

const STRATEGY_TYPE_LABELS: Record<MarketingStrategyType, string> = {
  BUNDLING_KLINIS: 'Bundling Aman Klinis',
  CLEARANCE_SLOW_ED: 'Clearance Slow / Near-ED',
  RESTOK_FAST_MOVING: 'Restok Fast Moving',
  REPEAT_PASIEN: 'Repeat Order & Kontrol Pasien',
  REORDER_MITRA: 'Aktivasi Re-Order Mitra B2B',
  PROMO_UMUM: 'Kampanye Promo Penjualan'
};

const QUADRANT_META: Record<
  ProductQuadrant,
  { title: string; rule: string; actionHint: string; tone: 'emerald' | 'sky' | 'amber' | 'rose' }
> = {
  STAR: {
    title: 'Produk Bintang',
    rule: 'Kecepatan Fast · Margin >= Median',
    actionHint: 'Jaga ketersediaan stok (anti stock-out) & prioritaskan di etalase/Portal Mitra.',
    tone: 'emerald'
  },
  TRAFFIC_DRIVER: {
    title: 'Penarik Trafik',
    rule: 'Kecepatan Fast · Margin < Median',
    actionHint: 'Pasangkan cross-selling dengan vitamin/alkes margin sehat yang bebas interaksi.',
    tone: 'sky'
  },
  POTENTIAL: {
    title: 'Potensial Dikembangkan',
    rule: 'Kecepatan Slow · Margin >= Median',
    actionHint: 'Tingkatkan edukasi manfaat & tampilkan di banner penawaran khusus pelanggan/mitra.',
    tone: 'amber'
  },
  STOCK_BURDEN: {
    title: 'Beban Stok & Risiko ED',
    rule: 'Dead Stock / Slow Mendekati ED',
    actionHint: 'Evaluasi clearance non-resep, hentikan order berlebih, & pantau tanggal ED ketat.',
    tone: 'rose'
  }
};

export const MarketingStrategyView: React.FC<MarketingStrategyViewProps> = ({
  transactions,
  medicines,
  patients,
  mitraList,
  mitraOrders,
  rmeRecords,
  salesDiscounts,
  promoAds,
  purchaseOrders,
  branches,
  currentBranch,
  suppliers,
  interactionRules,
  marketingCampaigns,
  portalActivityLogs = [],
  needsTableSetup = false,
  isDemoSandbox = false,
  userName,
  onSaveCampaign,
  onDeleteCampaign,
  onSyncCampaignsSupabase,
  onSaveDiscount,
  onSavePromo,
  onSavePurchaseOrder,
  onNavigateTab,
  onOpenMitraPortal
}) => {
  const todayYmd = toLocalDateString();
  const [activeSubTab, setActiveSubTab] = useState<InternalTabId>('overview');

  // Filter states
  const [periodPreset, setPeriodPreset] = useState<MarketingPeriodPreset>('30d');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return toLocalDateString(d);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(todayYmd);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(currentBranch?.id || 'ALL');
  const [selectedChannel, setSelectedChannel] = useState<MarketingChannelFilter>('ALL');
  const [nearEdWindowDays, setNearEdWindowDays] = useState<number>(90);

  // Sub-tab product filters & pagination
  const [productSearch, setProductSearch] = useState('');
  const [movementFilter, setMovementFilter] = useState<'ALL' | ProductMovementClass | 'NEAR_ED' | 'LOW_STOCK'>('ALL');
  const [quadrantFilter, setQuadrantFilter] = useState<'ALL' | ProductQuadrant>('ALL');
  const [productSortBy, setProductSortBy] = useState<'revenue' | 'qty' | 'margin' | 'turnover' | 'ed'>('revenue');
  const [productPage, setProductPage] = useState(1);
  const PAGE_SIZE = 20;

  // UI feedback / modals
  const [showReliabilityDrawer, setShowReliabilityDrawer] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Action Execution Modal (Promo POS + Banner Portal + Campaign Tracker)
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftStrategyType, setDraftStrategyType] = useState<MarketingStrategyType>('PROMO_UMUM');
  const [draftChannel, setDraftChannel] = useState<MarketingCampaign['targetChannel']>('ALL');
  const [draftMedicineIds, setDraftMedicineIds] = useState<string[]>([]);
  const [draftMedicineNames, setDraftMedicineNames] = useState<string[]>([]);
  const [draftMitraIds, setDraftMitraIds] = useState<string[]>([]);
  const [draftPatientRmIds, setDraftPatientRmIds] = useState<string[]>([]);
  const [draftDiscountPct, setDraftDiscountPct] = useState<number>(5);
  const [draftPromoCode, setDraftPromoCode] = useState<string>('');
  const [draftStartDate, setDraftStartDate] = useState<string>(todayYmd);
  const [draftEndDate, setDraftEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return toLocalDateString(d);
  });
  const [draftBaselineDays, setDraftBaselineDays] = useState<number>(14);
  const [draftCreateDiscount, setDraftCreateDiscount] = useState<boolean>(true);
  const [draftCreatePortalBanner, setDraftCreatePortalBanner] = useState<boolean>(false);
  const [draftFollowUpMessage, setDraftFollowUpMessage] = useState<string>('');
  const [draftNotes, setDraftNotes] = useState<string>('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Follow-up Message Modal
  const [followUpModal, setFollowUpModal] = useState<{
    title: string;
    recipientName: string;
    phone: string;
    message: string;
    strategyType: MarketingStrategyType;
    targetChannel: MarketingCampaign['targetChannel'];
    mitraId?: string;
    rmId?: string;
  } | null>(null);

  const showNotice = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMsg({ type, text });
    window.setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  // Core Deterministic Analytics Engine (Memoized cleanly per filter state)
  const analytics = useMemo(() => {
    return computeMarketingAnalytics({
      transactions,
      medicines,
      patients,
      mitraList,
      mitraOrders,
      rmeRecords,
      salesDiscounts,
      promoAds,
      interactionRules,
      portalActivityLogs,
      filters: {
        periodPreset,
        customStartDate,
        customEndDate,
        branchId: selectedBranchId,
        channel: selectedChannel,
        nearEdWindowDays
      },
      referenceTodayYmd: todayYmd
    });
  }, [
    transactions,
    medicines,
    patients,
    mitraList,
    mitraOrders,
    rmeRecords,
    salesDiscounts,
    promoAds,
    interactionRules,
    portalActivityLogs,
    periodPreset,
    customStartDate,
    customEndDate,
    selectedBranchId,
    selectedChannel,
    nearEdWindowDays,
    todayYmd
  ]);

  // Filtered & sorted products for Movement Tab
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = analytics.products.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.category} ${p.kelas} ${p.supplier}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (quadrantFilter !== 'ALL' && p.quadrant !== quadrantFilter) return false;
      if (movementFilter === 'FAST' || movementFilter === 'SLOW' || movementFilter === 'DEAD') {
        if (p.movementClass !== movementFilter) return false;
      } else if (movementFilter === 'NEAR_ED') {
        if (p.daysToNearestExp === null || p.daysToNearestExp > nearEdWindowDays || p.stock <= 0) {
          return false;
        }
      } else if (movementFilter === 'LOW_STOCK') {
        if (p.stock > p.minStock && !(p.daysOfInventory !== null && p.daysOfInventory <= 10)) {
          return false;
        }
      }
      return true;
    });

    list.sort((a, b) => {
      if (productSortBy === 'qty') return b.qtySoldSmall - a.qtySoldSmall;
      if (productSortBy === 'margin') return b.grossProfit - a.grossProfit;
      if (productSortBy === 'turnover') return b.turnoverRate - a.turnoverRate;
      if (productSortBy === 'ed') {
        return (a.daysToNearestExp ?? 99999) - (b.daysToNearestExp ?? 99999);
      }
      return b.revenue - a.revenue || b.qtySoldSmall - a.qtySoldSmall;
    });

    return list;
  }, [analytics.products, productSearch, movementFilter, quadrantFilter, productSortBy, nearEdWindowDays]);

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pagedProducts = useMemo(() => {
    const safePage = Math.min(productPage, totalProductPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, productPage, totalProductPages]);

  // Campaign Before vs After impact map
  const campaignEvaluations = useMemo(() => {
    const map = new Map<string, CampaignImpactEvaluation>();
    for (const c of marketingCampaigns) {
      map.set(
        c.id,
        evaluateCampaignImpact({
          campaign: c,
          transactions,
          medicines,
          branchId: selectedBranchId,
          referenceTodayYmd: todayYmd
        })
      );
    }
    return map;
  }, [marketingCampaigns, transactions, medicines, selectedBranchId, todayYmd]);

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      showNotice('error', 'Gagal menyalin teks ke clipboard browser.');
    }
  };

  // Pre-fill Action Modal from Recommendation, Basket Pair, or Product Row
  const openActionModalFromRecommendation = (rec: MarketingRecommendation) => {
    setDraftTitle(rec.suggestedPromoTitle || rec.title);
    setDraftStrategyType(rec.strategyType);
    setDraftChannel(rec.targetChannel);
    setDraftMedicineIds(rec.targetMedicineIds || []);
    setDraftMedicineNames(rec.targetMedicineNames || []);
    setDraftMitraIds(rec.targetMitraIds || []);
    setDraftPatientRmIds(rec.targetPatientRmIds || []);
    setDraftDiscountPct(rec.suggestedDiscountPct ?? 5);
    setDraftPromoCode(
      `MKT${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    );
    setDraftStartDate(todayYmd);
    const end = new Date();
    end.setDate(end.getDate() + 14);
    setDraftEndDate(toLocalDateString(end));
    setDraftBaselineDays(14);
    setDraftCreateDiscount(rec.actionKind === 'PROMO_DISKON' || rec.strategyType === 'BUNDLING_KLINIS' || rec.strategyType === 'CLEARANCE_SLOW_ED');
    setDraftCreatePortalBanner(rec.targetChannel === 'PORTAL_MITRA' || rec.targetChannel === 'MITRA' || rec.targetChannel === 'ALL');
    setDraftFollowUpMessage(rec.suggestedFollowUpText || '');
    setDraftNotes(rec.dataBasis);
    setActionModalOpen(true);
  };

  const openActionModalForProduct = (prod: ProductPerformanceRow) => {
    if (prod.isRestrictedRx || prod.category === 'Obat Keras') {
      showNotice(
        'error',
        `${prod.name} adalah Obat Keras / Antibiotik / NAPPZA sehingga tidak diperbolehkan dibuat promo diskon bebas.`
      );
      return;
    }
    setDraftTitle(`Penawaran ${prod.name}`);
    setDraftStrategyType(prod.movementClass === 'FAST' ? 'PROMO_UMUM' : 'CLEARANCE_SLOW_ED');
    setDraftChannel('ALL');
    setDraftMedicineIds([prod.id]);
    setDraftMedicineNames([prod.name]);
    setDraftMitraIds([]);
    setDraftPatientRmIds([]);
    setDraftDiscountPct(prod.daysToNearestExp !== null && prod.daysToNearestExp <= 90 ? 10 : 5);
    setDraftPromoCode(`PROMO-${prod.name.replace(/[^A-Z0-9]/gi, '').slice(0, 5).toUpperCase()}`);
    setDraftStartDate(todayYmd);
    const end = new Date();
    end.setDate(end.getDate() + 14);
    setDraftEndDate(toLocalDateString(end));
    setDraftBaselineDays(14);
    setDraftCreateDiscount(true);
    setDraftCreatePortalBanner(true);
    setDraftFollowUpMessage('');
    setDraftNotes(
      `Target produk ${prod.name} (Stok: ${prod.stock} ${prod.unitSmall}, Margin: ${prod.grossMarginPct.toFixed(1)}%).`
    );
    setActionModalOpen(true);
  };

  const openActionModalForBasketPair = (pair: BasketPairRow) => {
    if (!pair.clinicalSafety.safeForOtcBundling) {
      showNotice('error', `Pasangan ini tidak aman untuk bundling bebas: ${pair.clinicalSafety.reason}`);
      return;
    }
    setDraftTitle(`Bundling ${pair.itemAName.split(' ')[0]} + ${pair.itemBName.split(' ')[0]}`);
    setDraftStrategyType('BUNDLING_KLINIS');
    setDraftChannel('REGULER');
    setDraftMedicineIds([pair.itemAId, pair.itemBId]);
    setDraftMedicineNames([pair.itemAName, pair.itemBName]);
    setDraftMitraIds([]);
    setDraftPatientRmIds([]);
    setDraftDiscountPct(5);
    setDraftPromoCode(`BND${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
    setDraftStartDate(todayYmd);
    const end = new Date();
    end.setDate(end.getDate() + 14);
    setDraftEndDate(toLocalDateString(end));
    setDraftBaselineDays(14);
    setDraftCreateDiscount(true);
    setDraftCreatePortalBanner(false);
    setDraftFollowUpMessage('');
    setDraftNotes(
      `Bundling aman klinis dari analisis keranjang belanja (Co-occurrence: ${pair.coCount}x, Support: ${pair.supportPct.toFixed(1)}%).`
    );
    setActionModalOpen(true);
  };

  // Execute Creating Draft PO from Fast-Moving Restock Targets
  const handleCreateDraftPoFromMarketing = async (targetMedIds: string[], contextTitle: string) => {
    const selectedMeds = targetMedIds
      .map((id) => medicines.find((m) => m.id === id))
      .filter((m): m is Medicine => Boolean(m));

    if (selectedMeds.length === 0) {
      showNotice('error', 'Tidak ada item obat master yang cocok untuk dibuat draf Surat Pesanan.');
      return;
    }

    // Group by primary supplier of first item or default supplier
    const primaryMed = selectedMeds[0];
    const matchedSupplier = suppliers.find(
      (s) =>
        s.name.toLowerCase() === String(primaryMed.supplier || '').trim().toLowerCase()
    ) || suppliers[0];

    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const nextSeq = String(purchaseOrders.length + 1).padStart(3, '0');
    const timeSlug = Date.now().toString(36).toUpperCase();
    const randSlug = Math.random().toString(36).slice(2, 6).toUpperCase();
    const poId = `${isDemoSandbox ? 'PO-DEMO-' : 'PO-'}${ym}-${nextSeq}-${timeSlug}-${randSlug}`;
    const poNumber = `PO-MKT-${ym}-${nextSeq}`;

    const spNumbers: Record<SPGroupType, string> = {
      REG: '',
      ALK: '',
      PRE: '',
      OOT: '',
      PSI: '',
      NAR: ''
    };

    const poItems: PurchaseOrderItem[] = selectedMeds.map((med) => {
      const spType = resolveSPGroupFromMed(med);
      if (!spNumbers[spType]) {
        spNumbers[spType] = `SP-${spType}-${ym}-${nextSeq}`;
      }
      const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
      const targetMax = Math.max(Number(med.maxStock) || 0, (Number(med.minStock) || 10) * 2);
      const deficitSmall = Math.max(ratio, targetMax - (Number(med.stock) || 0));
      const qtyBesar = Math.max(1, Math.ceil(deficitSmall / ratio));
      const qtyKecil = qtyBesar * ratio;
      const estHna = Number(med.hnaBesar) > 0 ? Number(med.hnaBesar) : Math.round((Number(med.hpp) || 0) * ratio / 1.11);
      return {
        id: `POI-${med.id}-${Date.now().toString().slice(-4)}`,
        medicineId: med.id,
        name: med.name,
        category: med.category || 'Obat Bebas',
        nappza: med.nappza || 'Non-NAPPZA',
        spType,
        form: med.form || 'Tablet',
        kekuatan: med.kekuatan || '',
        satuanBesar: med.satuanBesar || 'Box',
        satuanKecil: med.satuanKecil || med.unit || 'Pcs',
        rasioKonversi: ratio,
        currentStock: Number(med.stock) || 0,
        minStock: Number(med.minStock) || 0,
        qtyBesar,
        qtyKecil,
        estimatedHna: estHna,
        subtotal: qtyBesar * estHna,
        ket: 'Rekomendasi Fast Moving Strategi Marketing'
      };
    });

    const totalEstimatedCost = poItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
    const newPo: PurchaseOrder = {
      id: poId,
      poNumber,
      date: todayYmd,
      supplierId: matchedSupplier?.id,
      supplierName: matchedSupplier?.name || primaryMed.supplier || 'Supplier Utama (Pilih di Defecta)',
      supplierAddress: matchedSupplier?.address || '',
      supplierPhone: matchedSupplier?.phone || '',
      supplierLicenseNo: matchedSupplier?.licenseNo || '',
      spNumbers,
      status: 'Draft',
      items: poItems,
      notes: `Dibuat otomatis dari Strategi Marketing (${contextTitle}). Tinjau dan cetak SP di menu Defecta & Re-Order.`,
      totalEstimatedCost,
      branchId: currentBranch?.id || 'BR-01',
      petugas: userName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const poRes = await onSavePurchaseOrder(newPo);
    if (!poRes.success && !poRes.isDemo) {
      showNotice('error', poRes.error || 'Gagal menyimpan draf PO ke Surat Pesanan.');
      return;
    }

    // Log campaign execution for restock tracking
    const campaign: MarketingCampaign = {
      id: `${isDemoSandbox ? 'MKT-DEMO-' : 'MKT-'}${Date.now()}`,
      title: contextTitle,
      strategyType: 'RESTOK_FAST_MOVING',
      status: 'Aktif',
      targetChannel: 'ALL',
      targetMedicineIds: selectedMeds.map((m) => m.id),
      targetMedicineNames: selectedMeds.map((m) => m.name),
      linkedPoId: newPo.id,
      activatedAt: todayYmd,
      baselineDays: 14,
      baselineSnapshot: {
        revenue: analytics.kpis.totalRevenue,
        txCount: analytics.kpis.txCount,
        avgBasket: analytics.kpis.avgBasketValue,
        grossProfit: analytics.kpis.totalGrossProfit,
        grossMarginPct: analytics.kpis.grossMarginPct,
        periodLabel: analytics.reliability.periodLabel
      },
      notes: `Draf Surat Pesanan #${newPo.poNumber} dibuat (${poItems.length} item Fast Moving).`,
      createdBy: userName,
      branchId: currentBranch?.id || 'BR-01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await onSaveCampaign(campaign, false);

    showNotice(
      'success',
      `Draf Surat Pesanan #${newPo.poNumber} (${poItems.length} item) tersimpan di Defecta & Riwayat SP.`
    );
  };

  // Submit Unified Action Modal (Discount POS + Portal Banner + Campaign Tracker)
  const handleSubmitActionCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) {
      showNotice('error', 'Judul strategi/kampanye wajib diisi.');
      return;
    }

    // Clinical compliance guard before creating promo/discount on medicines
    const validDiscountMedIds: string[] = [];
    const blockedRestrictedNames: string[] = [];
    for (const id of draftMedicineIds) {
      const m = medicines.find((med) => med.id === id);
      if (m && (m.category === 'Obat Keras' || m.nappza !== 'Non-NAPPZA' && m.nappza)) {
        // Double check via helper in case nappza is empty string
        if (m.category === 'Obat Keras' || (m.nappza && m.nappza !== 'Non-NAPPZA')) {
          blockedRestrictedNames.push(m.name);
          continue;
        }
      }
      validDiscountMedIds.push(id);
    }

    if (draftCreateDiscount && draftMedicineIds.length > 0 && validDiscountMedIds.length === 0) {
      showNotice(
        'error',
        `Seluruh item target (${blockedRestrictedNames.join(', ')}) termasuk Obat Keras/NAPPZA sehingga tidak dapat dibuat aturan diskon bebas.`
      );
      return;
    }

    setIsSubmittingAction(true);
    try {
      let createdDiscountId: string | undefined;
      let createdPromoId: string | undefined;
      const nowIso = new Date().toISOString();

      if (draftCreateDiscount) {
        const discId = `DSC-MKT-${Date.now().toString().slice(-6)}`;
        const hasSpecificMeds = validDiscountMedIds.length > 0;
        const newDiscount: SalesDiscount = {
          id: discId,
          name: draftTitle.trim(),
          code: draftPromoCode.trim().toUpperCase() || undefined,
          autoApply: true,
          basis: hasSpecificMeds ? 'SPECIFIC_MEDICINE' : 'ALL_ITEMS',
          targetMedicineIds: hasSpecificMeds ? validDiscountMedIds : undefined,
          valueType: 'PERCENT',
          value: Math.max(1, Math.min(50, Number(draftDiscountPct) || 5)),
          channelScope:
            draftChannel === 'PORTAL_MITRA'
              ? 'PORTAL_MITRA'
              : draftChannel === 'MITRA'
              ? 'MITRA'
              : draftChannel === 'KLINIK'
              ? 'KLINIK'
              : draftChannel === 'REGULER'
              ? 'REGULER'
              : 'ALL',
          startDate: draftStartDate,
          endDate: draftEndDate,
          description: `Dibuat dari Strategi Marketing: ${STRATEGY_TYPE_LABELS[draftStrategyType]}`,
          isActive: true,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        onSaveDiscount(newDiscount, false);
        createdDiscountId = discId;
      }

      if (draftCreatePortalBanner) {
        const promoId = `PRM-MKT-${Date.now().toString().slice(-6)}`;
        const newPromo: PromoAd = {
          id: promoId,
          title: draftTitle.trim(),
          badgeText: STRATEGY_TYPE_LABELS[draftStrategyType],
          subtitle: `Hemat ${draftDiscountPct}% · Berlaku ${draftStartDate} s.d. ${draftEndDate}`,
          description: draftNotes.trim() || 'Program penawaran terukur dari Strategi Marketing.',
          highlightText: draftPromoCode ? `Kode: ${draftPromoCode.trim().toUpperCase()}` : undefined,
          promoCode: draftPromoCode.trim().toUpperCase() || undefined,
          linkedDiscountId: createdDiscountId,
          ctaText: 'Lihat Penawaran',
          ctaSearchQuery: draftMedicineNames[0]?.split(' ')[0] || undefined,
          theme: draftStrategyType === 'CLEARANCE_SLOW_ED' ? 'amber-flash' : 'emerald-clinical',
          priority: 10,
          startDate: draftStartDate,
          endDate: draftEndDate,
          showOnMitraPortal: true,
          isActive: true,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        onSavePromo(newPromo, false);
        createdPromoId = promoId;
      }

      const newCampaign: MarketingCampaign = {
        id: `${isDemoSandbox ? 'MKT-DEMO-' : 'MKT-'}${Date.now()}`,
        title: draftTitle.trim(),
        strategyType: draftStrategyType,
        status: 'Aktif',
        targetChannel: draftChannel,
        targetMedicineIds: draftMedicineIds,
        targetMedicineNames: draftMedicineNames,
        targetMitraIds: draftMitraIds,
        targetPatientRmIds: draftPatientRmIds,
        linkedDiscountId: createdDiscountId,
        linkedPromoId: createdPromoId,
        discountCode: draftCreateDiscount ? draftPromoCode.trim().toUpperCase() : undefined,
        followUpMessage: draftFollowUpMessage.trim() || undefined,
        activatedAt: draftStartDate,
        baselineDays: Math.max(1, Math.min(90, Number(draftBaselineDays) || 14)),
        baselineSnapshot: {
          revenue: analytics.kpis.totalRevenue,
          txCount: analytics.kpis.txCount,
          avgBasket: analytics.kpis.avgBasketValue,
          grossProfit: analytics.kpis.totalGrossProfit,
          grossMarginPct: analytics.kpis.grossMarginPct,
          periodLabel: analytics.reliability.periodLabel
        },
        notes: draftNotes.trim(),
        createdBy: userName,
        branchId: selectedBranchId === 'ALL' ? currentBranch?.id || 'BR-01' : selectedBranchId,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const saveRes = await onSaveCampaign(newCampaign, false);
      if (!saveRes.success && !saveRes.isDemo) {
        showNotice('error', saveRes.error || 'Kampanye tersimpan lokal, namun gagal sinkron ke Supabase.');
      } else {
        const createdExtras: string[] = [];
        if (createdDiscountId) createdExtras.push('Aturan Diskon POS');
        if (createdPromoId) createdExtras.push('Banner Portal Mitra');
        showNotice(
          'success',
          `Strategi "${newCampaign.title}" aktif & dilacak${createdExtras.length > 0 ? ` (+ ${createdExtras.join(' & ')})` : ''}.`
        );
      }

      setActionModalOpen(false);
      setActiveSubTab('campaigns');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Trigger Obrolan Interaktif widget with drafted message
  const handleSendToInteractiveChat = (draftText: string) => {
    window.dispatchEvent(
      new CustomEvent('latisha_open_live_chat', {
        detail: { mode: 'live', draft: draftText }
      })
    );
    showNotice('info', 'Panel Obrolan Interaktif dibuka dengan draf pesan tindak lanjut.');
  };

  // Save follow-up campaign log when user sends or copies follow-up
  const handleLogFollowUpCampaign = async () => {
    if (!followUpModal) return;
    const newCampaign: MarketingCampaign = {
      id: `${isDemoSandbox ? 'MKT-DEMO-' : 'MKT-'}${Date.now()}`,
      title: followUpModal.title,
      strategyType: followUpModal.strategyType,
      status: 'Aktif',
      targetChannel: followUpModal.targetChannel,
      targetMitraIds: followUpModal.mitraId ? [followUpModal.mitraId] : undefined,
      targetPatientRmIds: followUpModal.rmId ? [followUpModal.rmId] : undefined,
      followUpMessage: followUpModal.message,
      activatedAt: todayYmd,
      baselineDays: 14,
      baselineSnapshot: {
        revenue: analytics.kpis.totalRevenue,
        txCount: analytics.kpis.txCount,
        avgBasket: analytics.kpis.avgBasketValue,
        grossProfit: analytics.kpis.totalGrossProfit,
        grossMarginPct: analytics.kpis.grossMarginPct,
        periodLabel: analytics.reliability.periodLabel
      },
      notes: `Follow-up disiapkan untuk ${followUpModal.recipientName}`,
      createdBy: userName,
      branchId: selectedBranchId === 'ALL' ? currentBranch?.id || 'BR-01' : selectedBranchId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await onSaveCampaign(newCampaign, false);
    showNotice('success', `Aktivitas tindak lanjut "${followUpModal.recipientName}" dicatat ke Pelacak Kampanye.`);
  };

  // Export Analytics JSON / CSV
  const handleExportReport = (format: 'json' | 'csv') => {
    const stamp = todayYmd;
    if (format === 'json') {
      const payload = {
        exportedAt: new Date().toISOString(),
        exportedBy: userName,
        filters: { periodPreset, branchId: selectedBranchId, channel: selectedChannel },
        reliability: analytics.reliability,
        kpis: analytics.kpis,
        movementCounts: analytics.movementCounts,
        quadrantCounts: analytics.quadrantCounts,
        products: analytics.products,
        basketPairs: analytics.basketPairs,
        portalMetrics: analytics.portalMetrics,
        recommendations: analytics.recommendations,
        campaigns: marketingCampaigns
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `strategi-marketing-latisha-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotice('success', 'Laporan analitik lengkap (JSON) berhasil diunduh.');
      return;
    }

    const escapeCsv = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'ID Produk',
      'Nama Produk',
      'Kategori',
      'Klasifikasi Pergerakan',
      'Kuadran',
      'Stok Aktual',
      'Min Stok',
      'ED Terdekat',
      'Sisa Hari ED',
      'Qty Terjual (Satuan Kecil)',
      'Frekuensi Transaksi',
      'Omset (Rp)',
      'HPP Terhitung (Rp)',
      'Margin Kotor (Rp)',
      'Margin (%)',
      'Perputaran Stok',
      'Estimasi Hari Habis (DoI)',
      'Harga Reguler',
      'Harga Klinik',
      'Harga Mitra'
    ];
    const rows = analytics.products.map((p) => [
      p.id,
      p.name,
      p.category,
      p.movementClass,
      QUADRANT_META[p.quadrant].title,
      p.stock,
      p.minStock,
      p.nearestExpDate || '-',
      p.daysToNearestExp ?? '-',
      p.qtySoldSmall,
      p.txFrequency,
      Math.round(p.revenue),
      Math.round(p.cogs),
      Math.round(p.grossProfit),
      p.grossMarginPct.toFixed(1),
      p.turnoverRate.toFixed(2),
      p.daysOfInventory ?? '-',
      p.sellPrice,
      p.sellPriceKlinik,
      p.sellPriceMitra
    ]);
    const csv = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analisis-pergerakan-produk-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('success', 'Tabel pergerakan & margin produk (CSV) berhasil diunduh.');
  };

  const handleManualSync = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await onSyncCampaignsSupabase();
      if (res.isDemo) {
        showNotice('info', 'Mode Demo Sandbox aktif: data disimpan lokal tanpa menyentuh Supabase produksi.');
      } else if (res.needsTableSetup) {
        showNotice('error', 'Tabel strategi_marketing belum dibuat di Supabase. Buka tombol Skema SQL untuk menyalin query.');
        setShowSqlModal(true);
      } else if (res.success) {
        showNotice('success', `Sinkronisasi Supabase Strategi Marketing berhasil (${res.count ?? marketingCampaigns.length} kampanye).`);
      } else {
        showNotice('error', res.error || 'Gagal sinkronisasi Supabase.');
      }
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const maxDailyRevenue = useMemo(
    () => Math.max(1, ...analytics.dailyTrends.map((d) => d.revenue)),
    [analytics.dailyTrends]
  );

  const maxDowRevenue = useMemo(
    () => Math.max(1, ...analytics.dayOfWeekTrends.map((d) => d.revenue)),
    [analytics.dayOfWeekTrends]
  );

  const activeScopeBranchLabel =
    selectedBranchId === 'ALL'
      ? 'Semua Cabang'
      : branches.find((b) => b.id === selectedBranchId)?.name || currentBranch?.name || 'Cabang Aktif';

  const snapshotFormatted = useMemo(() => {
    try {
      return new Date(analytics.reliability.snapshotAt).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return analytics.reliability.snapshotAt;
    }
  }, [analytics.reliability.snapshotAt]);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto pb-10">
      {/* Inline Notification Banner */}
      {toastMsg && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs font-medium ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : toastMsg.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : toastMsg.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-sky-600 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="p-1 rounded-lg hover:bg-black/5 shrink-0"
            aria-label="Tutup notifikasi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header & Single-line Global Action Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Strategi Marketing & Akselerasi Omset
              </h1>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                  analytics.reliability.statusLabel === 'Data Lengkap & Andal'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : analytics.reliability.statusLabel === 'Sebagian Data Master Perlu Dilengkapi'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {analytics.reliability.statusLabel} ({analytics.reliability.completenessPct}%)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              Kalkulasi deterministik dari data transaksi nyata · Cabang: {activeScopeBranchLabel} · Periode:{' '}
              {analytics.reliability.periodStart} s.d. {analytics.reliability.periodEnd} ({analytics.reliability.validTransactionsCount} transaksi valid) · Snapshot: {snapshotFormatted}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowReliabilityDrawer((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
              <span>Audit Data ({analytics.reliability.dataGaps.length})</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportReport('csv')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ekspor CSV</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportReport('json')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Ekspor JSON</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSqlModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                needsTableSetup
                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Skema SQL</span>
            </button>

            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncingCloud}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span>Sinkron Supabase</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDraftTitle('');
                setDraftStrategyType('PROMO_UMUM');
                setDraftChannel('ALL');
                setDraftMedicineIds([]);
                setDraftMedicineNames([]);
                setDraftMitraIds([]);
                setDraftPatientRmIds([]);
                setDraftDiscountPct(5);
                setDraftPromoCode(`MKT${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
                setDraftCreateDiscount(true);
                setDraftCreatePortalBanner(false);
                setDraftFollowUpMessage('');
                setDraftNotes('');
                setActionModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Strategi / Promo</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Rentang Periode
            </label>
            <select
              value={periodPreset}
              onChange={(e) => {
                setPeriodPreset(e.target.value as MarketingPeriodPreset);
                setProductPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-sky-500"
            >
              <option value="7d">7 Hari Terakhir</option>
              <option value="30d">30 Hari Terakhir</option>
              <option value="90d">90 Hari Terakhir</option>
              <option value="month">Bulan Berjalan</option>
              <option value="all">Semua Riwayat Data</option>
              <option value="custom">Rentang Tanggal Kustom</option>
            </select>
          </div>

          {periodPreset === 'custom' ? (
            <div className="sm:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Dari Tanggal
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 tabular-nums"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Cabang Analisis
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  setProductPage(1);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-sky-500"
              >
                <option value="ALL">Semua Cabang ({branches.length})</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {periodPreset === 'custom' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Cabang Analisis
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-sky-500"
              >
                <option value="ALL">Semua Cabang ({branches.length})</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Channel Penjualan
            </label>
            <select
              value={selectedChannel}
              onChange={(e) => {
                setSelectedChannel(e.target.value as MarketingChannelFilter);
                setProductPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Semua Channel (POS + Klinik + Mitra)</option>
              <option value="REGULER">Reguler / OTC POS</option>
              <option value="KLINIK">Pasien Klinik & Resep</option>
              <option value="MITRA">Pesanan Mitra</option>
              <option value="FAKTUR_PENJUALAN">Faktur Penjualan B2B</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Ambang Risiko ED
            </label>
            <select
              value={nearEdWindowDays}
              onChange={(e) => setNearEdWindowDays(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-sky-500"
            >
              <option value={60}>ED &le; 60 Hari</option>
              <option value={90}>ED &le; 90 Hari (Standar)</option>
              <option value={180}>ED &le; 180 Hari</option>
            </select>
          </div>
        </div>

        {/* Collapsible Data Reliability Audit Panel */}
        {showReliabilityDrawer && (
          <div className="mt-4 pt-4 border-t border-slate-200 bg-slate-50/70 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Metadata Keandalan & Audit Sumber Data Analitik
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Sumber: {isDemoSandbox ? 'Mode Demo Sandbox Lokal' : 'Operasional Aktif (Lokal + Sinkronisasi Supabase)'} ·{' '}
                  {analytics.reliability.totalTransactionsRaw} transaksi mentah ({analytics.reliability.validTransactionsCount} valid, {analytics.reliability.excludedCancelledCount} batal, {analytics.reliability.excludedReturnedCount} retur) ·{' '}
                  {analytics.reliability.productLineItemsCount} item produk + {analytics.reliability.serviceLineItemsCount} item jasa/lab
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg tabular-nums">
                Fast Rule: qty &ge; {analytics.reliability.movementRuleSummary.fastQtyThreshold} atau frek &ge; {analytics.reliability.movementRuleSummary.fastFreqThreshold}x · Median Margin: {analytics.reliability.movementRuleSummary.medianMarginPct.toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[11px] text-slate-500">Produk Master</p>
                <p className="font-bold text-slate-900 tabular-nums mt-0.5">
                  {analytics.reliability.totalMedicinesInScope} item
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[11px] text-slate-500">HPP Kosong (0)</p>
                <p className={`font-bold tabular-nums mt-0.5 ${analytics.reliability.missingHppCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {analytics.reliability.missingHppCount} item
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[11px] text-slate-500">ED / Batch Kosong</p>
                <p className={`font-bold tabular-nums mt-0.5 ${analytics.reliability.missingExpDateCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {analytics.reliability.missingExpDateCount} / {analytics.reliability.missingBatchNoCount}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[11px] text-slate-500">Pasien & Mitra</p>
                <p className="font-bold text-slate-900 tabular-nums mt-0.5">
                  {analytics.reliability.totalPatientsCount} / {analytics.reliability.totalMitraCount}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[11px] text-slate-500">Diskon / Promo Aktif</p>
                <p className="font-bold text-slate-900 tabular-nums mt-0.5">
                  {analytics.reliability.activeDiscountsCount} / {analytics.reliability.activePromosCount}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[11px] text-slate-500">Order Mitra Pending</p>
                <p className="font-bold text-slate-900 tabular-nums mt-0.5">
                  {analytics.reliability.pendingMitraOrdersCount} order
                </p>
              </div>
            </div>

            {analytics.reliability.dataGaps.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {analytics.reliability.dataGaps.map((gap) => (
                  <div
                    key={gap.id}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      gap.severity === 'critical'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : gap.severity === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="font-semibold flex items-center justify-between gap-2">
                      <span>{gap.label}</span>
                      <span className="font-mono tabular-nums">{gap.count}</span>
                    </div>
                    <p className="text-[11px] opacity-85 mt-0.5">{gap.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Internal Section Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'overview' as const, label: 'Ringkasan & Kuadran', icon: BarChart3 },
          {
            id: 'movement' as const,
            label: `Pergerakan Produk (${analytics.products.length})`,
            icon: Layers
          },
          {
            id: 'basket' as const,
            label: `Keranjang & Bundling Klinis (${analytics.basketPairs.length})`,
            icon: PackageCheck
          },
          { id: 'customers' as const, label: 'Pelanggan, Mitra & Tren', icon: Users },
          {
            id: 'campaigns' as const,
            label: `Eksekusi & Dampak Omset (${marketingCampaigns.length})`,
            icon: Target
          }
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* TAB 1: RINGKASAN, KUADRAN MARGIN VS VELOCITY & REKOMENDASI          */}
      {/* =================================================================== */}
      {activeSubTab === 'overview' && (
        <div className="space-y-5">
          {/* 4 Primary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Omset Valid Periode
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {formatRp(analytics.kpis.totalRevenue)}
              </p>
              <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
                {analytics.kpis.txCount} transaksi · {analytics.kpis.totalUnitsSoldSmall.toLocaleString('id-ID')} unit terjual
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Estimasi Margin Kotor
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-2xl font-bold text-emerald-700 tabular-nums">
                  {formatRp(analytics.kpis.totalGrossProfit)}
                </p>
                <span className="text-xs font-bold text-emerald-700 tabular-nums">
                  ({analytics.kpis.grossMarginPct.toFixed(1)}%)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
                HPP terhitung: {formatRp(analytics.kpis.totalCogs)} · Jasa Klinik: {formatRp(analytics.kpis.serviceRevenue)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Rata-Rata Nilai Transaksi (AOV)
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {formatRp(analytics.kpis.avgBasketValue)}
              </p>
              <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
                Visit Klinik: {analytics.kpis.clinicVisitCount}x · Omset Mitra: {formatRp(analytics.kpis.mitraRevenue)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Repeat Pasien & Risiko Stok
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {analytics.kpis.repeatPatientRatePct.toFixed(1)}% Repeat
              </p>
              <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
                Near-ED (&le;{nearEdWindowDays}h): {formatRp(analytics.kpis.nearEdAssetValueHpp)} · Dead Stock: {formatRp(analytics.kpis.deadStockAssetValueHpp)}
              </p>
            </div>
          </div>

          {/* Movement Summary Strip + Margin vs Velocity Quadrant */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Kuadran Margin vs. Kecepatan Jual
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Pembagian kuadran menggunakan ambang median margin ({analytics.reliability.movementRuleSummary.medianMarginPct.toFixed(1)}%) &amp; ambang Fast Moving (qty &ge; {analytics.reliability.movementRuleSummary.fastQtyThreshold} atau frekuensi &ge; {analytics.reliability.movementRuleSummary.fastFreqThreshold}x).
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold tabular-nums">
                <span className="text-emerald-700">Fast: {analytics.movementCounts.FAST}</span>
                <span className="text-slate-300">·</span>
                <span className="text-amber-700">Slow: {analytics.movementCounts.SLOW}</span>
                <span className="text-slate-300">·</span>
                <span className="text-rose-700">Dead: {analytics.movementCounts.DEAD}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['STAR', 'TRAFFIC_DRIVER', 'POTENTIAL', 'STOCK_BURDEN'] as ProductQuadrant[]).map((qKey) => {
                const meta = QUADRANT_META[qKey];
                const itemsInQuad = analytics.products.filter((p) => p.quadrant === qKey);
                const top3 = itemsInQuad.slice(0, 3);
                const totalQuadRevenue = itemsInQuad.reduce((s, p) => s + p.revenue, 0);
                const totalQuadAsset = itemsInQuad.reduce((s, p) => s + p.stockAssetValueHpp, 0);

                const badgeTone =
                  meta.tone === 'emerald'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : meta.tone === 'sky'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : meta.tone === 'amber'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200';

                return (
                  <div
                    key={qKey}
                    className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${badgeTone}`}>
                          {meta.title}
                        </span>
                        <span className="text-xs font-bold text-slate-900 tabular-nums">
                          {itemsInQuad.length} produk
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5">{meta.rule}</p>
                      <p className="text-xs text-slate-700 mt-1">{meta.actionHint}</p>
                    </div>

                    <div className="space-y-1.5 border-t border-slate-200/80 pt-2.5">
                      {top3.length > 0 ? (
                        top3.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-800 font-medium truncate">{item.name}</span>
                            <span className="text-slate-600 font-mono tabular-nums shrink-0">
                              {item.qtySoldSmall > 0
                                ? `${item.qtySoldSmall} ${item.unitSmall} · ${item.grossMarginPct.toFixed(0)}%`
                                : `Stok ${item.stock} · ${formatRp(item.stockAssetValueHpp)}`}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400">Belum ada produk di kuadran ini.</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 tabular-nums">
                      <span>
                        {qKey === 'STOCK_BURDEN'
                          ? `Nilai Aset HPP: ${formatRp(totalQuadAsset)}`
                          : `Kontribusi Omset: ${formatRp(totalQuadRevenue)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setQuadrantFilter(qKey);
                          setMovementFilter('ALL');
                          setProductPage(1);
                          setActiveSubTab('movement');
                        }}
                        className="font-semibold text-sky-700 hover:text-sky-800 whitespace-nowrap cursor-pointer"
                      >
                        Lihat Daftar &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prioritized Actionable Recommendations */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Rekomendasi Tindakan Peningkatan Omset (Siap Eksekusi)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Setiap rekomendasi disertai dasar data terukur dan verifikasi kepatuhan klinis/regulasi obat.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                  <span>QR Portal Pelanggan</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenMitraPortal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5 text-sky-600" />
                  <span>Buka Portal Pelanggan</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendToInteractiveChat('Halo, apakah ada penawaran promo atau jadwal layanan klinik hari ini?')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Obrolan Interaktif</span>
                </button>
              </div>
            </div>

            {analytics.recommendations.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                Belum cukup data transaksi atau master stok pada periode ini untuk menyusun rekomendasi otomatis. Coba perluas rentang tanggal ke &ldquo;Semua Riwayat Data&rdquo;.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {analytics.recommendations.map((rec) => {
                  const priorityBadge =
                    rec.priority === 'Tinggi'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-sky-50 text-sky-700 border-sky-200';
                  return (
                    <div
                      key={rec.id}
                      className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 bg-white hover:border-slate-300 transition"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-500">
                            {STRATEGY_TYPE_LABELS[rec.strategyType]} · Channel: {rec.targetChannel}
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${priorityBadge}`}>
                            Prioritas {rec.priority}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">{rec.title}</h3>
                        <p className="text-xs font-medium text-slate-700">{rec.subtitle}</p>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{rec.dataBasis}</p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500 truncate max-w-[260px]">
                          {rec.targetMedicineNames.length > 0
                            ? `Target: ${rec.targetMedicineNames.slice(0, 2).join(', ')}${rec.targetMedicineNames.length > 2 ? ` +${rec.targetMedicineNames.length - 2}` : ''}`
                            : rec.targetMitraIds?.length
                            ? `${rec.targetMitraIds.length} Mitra B2B`
                            : `${rec.targetPatientRmIds?.length || 0} Pasien`}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          {rec.actionKind === 'DRAFT_PO' ? (
                            <button
                              type="button"
                              onClick={() => handleCreateDraftPoFromMarketing(rec.targetMedicineIds, rec.title)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Buat Draf PO Restok</span>
                            </button>
                          ) : rec.actionKind === 'FOLLOWUP_CHAT' ? (
                            <button
                              type="button"
                              onClick={() =>
                                setFollowUpModal({
                                  title: rec.title,
                                  recipientName: `${rec.targetPatientRmIds?.length || 0} Pasien Kontrol Rutin`,
                                  phone: '',
                                  message: rec.suggestedFollowUpText || '',
                                  strategyType: 'REPEAT_PASIEN',
                                  targetChannel: 'KLINIK',
                                  rmId: rec.targetPatientRmIds?.[0]
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Siapkan Pesan Kontrol</span>
                            </button>
                          ) : rec.actionKind === 'PORTAL_MITRA' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openActionModalFromRecommendation(rec)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                              >
                                <Megaphone className="w-3.5 h-3.5" />
                                <span>Banner Portal Mitra</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setFollowUpModal({
                                    title: rec.title,
                                    recipientName: 'Mitra Faskes B2B',
                                    phone: '',
                                    message: rec.suggestedFollowUpText || '',
                                    strategyType: 'REORDER_MITRA',
                                    targetChannel: 'PORTAL_MITRA',
                                    mitraId: rec.targetMitraIds?.[0]
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                              >
                                <span>Pesan WA</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openActionModalFromRecommendation(rec)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                            >
                              <BadgePercent className="w-3.5 h-3.5" />
                              <span>Aktifkan Promo POS</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: PERGERAKAN PRODUK (FAST / SLOW / DEAD + MULTI-TIER + ED)     */}
      {/* =================================================================== */}
      {activeSubTab === 'movement' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Klasifikasi Pergerakan Produk (Fast · Slow · Dead Moving)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Menampilkan {filteredProducts.length} dari {analytics.products.length} item · Fast: terjual &ge; {analytics.reliability.movementRuleSummary.fastQtyThreshold} unit atau &ge; {analytics.reliability.movementRuleSummary.fastFreqThreshold}x transaksi atau turnover &ge; 0.45
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setProductPage(1);
                  }}
                  placeholder="Cari nama, kategori, supplier..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 w-56 focus:outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={quadrantFilter}
                onChange={(e) => {
                  setQuadrantFilter(e.target.value as 'ALL' | ProductQuadrant);
                  setProductPage(1);
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="ALL">Semua Kuadran</option>
                <option value="STAR">Produk Bintang ({analytics.quadrantCounts.STAR})</option>
                <option value="TRAFFIC_DRIVER">Penarik Trafik ({analytics.quadrantCounts.TRAFFIC_DRIVER})</option>
                <option value="POTENTIAL">Potensial ({analytics.quadrantCounts.POTENTIAL})</option>
                <option value="STOCK_BURDEN">Beban Stok/ED ({analytics.quadrantCounts.STOCK_BURDEN})</option>
              </select>

              <select
                value={productSortBy}
                onChange={(e) => setProductSortBy(e.target.value as any)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="revenue">Urut: Omset Tertinggi</option>
                <option value="qty">Urut: Qty Terjual</option>
                <option value="margin">Urut: Margin Kotor (Rp)</option>
                <option value="turnover">Urut: Perputaran Stok</option>
                <option value="ed">Urut: ED Terdekat</option>
              </select>
            </div>
          </div>

          {/* Movement Quick Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL' as const, label: `Semua (${analytics.products.length})` },
              { id: 'FAST' as const, label: `Fast Moving (${analytics.movementCounts.FAST})` },
              { id: 'SLOW' as const, label: `Slow Moving (${analytics.movementCounts.SLOW})` },
              { id: 'DEAD' as const, label: `Dead / Stagnant (${analytics.movementCounts.DEAD})` },
              { id: 'NEAR_ED' as const, label: `Mendekati ED <=${nearEdWindowDays}h` },
              { id: 'LOW_STOCK' as const, label: 'Stok Menipis / Kritis' }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setMovementFilter(f.id);
                  setProductPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap cursor-pointer ${
                  movementFilter === f.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Dense Scannable Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Produk &amp; Kategori</th>
                  <th className="py-2.5 px-2.5">Gerak / Kuadran</th>
                  <th className="py-2.5 px-2.5 text-right">Stok / Min</th>
                  <th className="py-2.5 px-2.5">ED Terdekat</th>
                  <th className="py-2.5 px-2.5 text-right">Terjual / Tx</th>
                  <th className="py-2.5 px-2.5 text-right">Omset</th>
                  <th className="py-2.5 px-2.5 text-right">Margin</th>
                  <th className="py-2.5 px-2.5 text-right">Perputaran / DoI</th>
                  <th className="py-2.5 px-2.5 text-right">Harga Tier (Reg / Klk / Mtr)</th>
                  <th className="py-2.5 px-3 text-right">Eksekusi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      Tidak ada produk yang sesuai filter pencarian.
                    </td>
                  </tr>
                ) : (
                  pagedProducts.map((p) => {
                    const moveBadge =
                      p.movementClass === 'FAST'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : p.movementClass === 'SLOW'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200';
                    const isEdUrgent = p.daysToNearestExp !== null && p.daysToNearestExp <= nearEdWindowDays && p.stock > 0;
                    const isLowStock = p.stock <= p.minStock;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 max-w-[230px]">
                          <div className="font-semibold text-slate-900 truncate" title={p.name}>
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <MedicineCategorySymbol category={p.category} size="xs" />
                            <span className="truncate">{p.supplier}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${moveBadge}`}>
                              {p.movementClass}
                            </span>
                            <span className="text-[11px] text-slate-600">
                              {QUADRANT_META[p.quadrant].title}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap">
                          <span className={`font-bold ${isLowStock ? 'text-rose-700' : 'text-slate-900'}`}>
                            {p.stock.toLocaleString('id-ID')}
                          </span>
                          <span className="text-slate-400"> / {p.minStock} {p.unitSmall}</span>
                        </td>
                        <td className="py-2.5 px-2.5 tabular-nums whitespace-nowrap">
                          {p.nearestExpDate ? (
                            <div>
                              <span className={isEdUrgent ? 'font-bold text-rose-700' : 'text-slate-700'}>
                                {p.nearestExpDate}
                              </span>
                              <div className="text-[10px] text-slate-500">
                                {p.daysToNearestExp !== null
                                  ? p.daysToNearestExp <= 0
                                    ? 'Kedaluwarsa'
                                    : `${p.daysToNearestExp} hari lagi`
                                  : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-amber-600 text-[11px]">Belum diisi</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {p.qtySoldSmall.toLocaleString('id-ID')} {p.unitSmall}
                          </div>
                          <div className="text-[10px] text-slate-500">{p.txFrequency}x tx</div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatRp(p.revenue)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap">
                          {p.hasValidHpp ? (
                            <div>
                              <div className="font-semibold text-emerald-700">{formatRp(p.grossProfit)}</div>
                              <div className="text-[10px] text-slate-500">{p.grossMarginPct.toFixed(1)}%</div>
                            </div>
                          ) : (
                            <span className="text-amber-600 text-[11px]">HPP = 0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap">
                          <div className="font-mono text-slate-800">{p.turnoverRate.toFixed(2)}x</div>
                          <div className="text-[10px] text-slate-500">
                            {p.daysOfInventory !== null ? `~${p.daysOfInventory} hari stok` : 'Stagnan'}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap text-[11px] text-slate-700">
                          <div>{p.sellPrice.toLocaleString('id-ID')}</div>
                          <div className="text-slate-500">
                            Klk {p.sellPriceKlinik.toLocaleString('id-ID')} · Mtr {p.sellPriceMitra.toLocaleString('id-ID')}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {p.movementClass === 'FAST' && isLowStock && (
                              <button
                                type="button"
                                onClick={() => handleCreateDraftPoFromMarketing([p.id], `Restok Fast Moving: ${p.name}`)}
                                className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-800 cursor-pointer"
                                title="Buat Draf PO di Defecta"
                              >
                                + Draf PO
                              </button>
                            )}
                            {!p.isRestrictedRx && p.category !== 'Obat Keras' ? (
                              <button
                                type="button"
                                onClick={() => openActionModalForProduct(p)}
                                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-semibold text-white cursor-pointer"
                              >
                                Promo
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 px-1.5" title="Obat Keras / Antibiotik / NAPPZA dilindungi aturan resep">
                                Resep
                              </span>
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

          {totalProductPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
              <span className="tabular-nums">
                Halaman {Math.min(productPage, totalProductPages)} dari {totalProductPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={productPage <= 1}
                  onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={productPage >= totalProductPages}
                  onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: KERANJANG BELANJA & BUNDLING AMAN KLINIS                     */}
      {/* =================================================================== */}
      {activeSubTab === 'basket' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Analisis Keranjang Belanja (Co-Purchase) &amp; Skrining Keamanan Bundling Klinis
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Setiap pasangan produk yang sering dibeli bersamaan disaring otomatis terhadap database {interactionRules.length} aturan interaksi obat serta regulasi Antibiotik / NAPPZA / Obat Keras.
              </p>
            </div>
          </div>

          {analytics.basketPairs.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Belum ditemukan transaksi multi-item yang memadai pada rentang periode ini. Perluas rentang periode atau pilih &ldquo;Semua Riwayat Data&rdquo; untuk membaca pola keranjang belanja historis.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Pasangan Produk Dibeli Bersamaan</th>
                    <th className="py-2.5 px-2.5 text-right">Frek. Bersama</th>
                    <th className="py-2.5 px-2.5 text-right">Support / Confidence</th>
                    <th className="py-2.5 px-2.5 text-right">Nilai &amp; Margin Unit</th>
                    <th className="py-2.5 px-3">Skrining Klinis &amp; Regulasi</th>
                    <th className="py-2.5 px-3 text-right">Aksi Bundling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.basketPairs.map((pair) => (
                    <tr key={pair.pairKey} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">
                          {pair.itemAName} <span className="text-slate-400">+</span> {pair.itemBName}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {pair.itemACategory} · {pair.itemBCategory}
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {pair.coCount}x
                      </td>
                      <td className="py-3 px-2.5 text-right tabular-nums whitespace-nowrap">
                        <div>Support {pair.supportPct.toFixed(1)}%</div>
                        <div className="text-[11px] text-slate-500">
                          Conf {Math.max(pair.confidenceAtoB, pair.confidenceBtoA).toFixed(0)}%
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-right tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{formatRp(pair.combinedAvgRevenue)}</div>
                        <div className="text-[11px] text-emerald-700">
                          Margin ~{formatRp(pair.combinedUnitMarginRp)}
                        </div>
                      </td>
                      <td className="py-3 px-3 max-w-[320px]">
                        {pair.clinicalSafety.safeForOtcBundling ? (
                          <div className="inline-flex items-start gap-1.5 text-emerald-700">
                            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{pair.clinicalSafety.reason}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-start gap-1.5 text-rose-700">
                            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-semibold">{pair.clinicalSafety.reason}</div>
                              {pair.clinicalSafety.interactionDetail && (
                                <div className="text-[11px] text-rose-600 mt-0.5">
                                  {pair.clinicalSafety.interactionDetail}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {pair.clinicalSafety.safeForOtcBundling ? (
                          <button
                            type="button"
                            onClick={() => openActionModalForBasketPair(pair)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            <BadgePercent className="w-3.5 h-3.5" />
                            <span>Buat Bundling POS</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400">
                            Tidak Layak Promo Bebas
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: PELANGGAN, MITRA B2B & TREN WAKTU                            */}
      {/* =================================================================== */}
      {activeSubTab === 'customers' && (
        <div className="space-y-5">
          {/* Time Trends + Channel & Category Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Day of Week & Daily Trend */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Pola Hari Tersibuk &amp; Tren Harian Periode
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Distribusi omset nyata per hari dalam sepekan untuk penjadwalan promo &amp; shift petugas.
                </p>
              </div>

              <div className="space-y-2">
                {analytics.dayOfWeekTrends.map((d) => {
                  const pct = (d.revenue / maxDowRevenue) * 100;
                  return (
                    <div key={d.dayIndex} className="grid grid-cols-[70px_1fr_115px] items-center gap-3 text-xs">
                      <span className="font-semibold text-slate-700">{d.dayLabel}</span>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-800 rounded-full"
                          style={{ width: `${Math.max(d.revenue > 0 ? 3 : 0, pct)}%` }}
                        />
                      </div>
                      <span className="text-right font-mono tabular-nums text-slate-800">
                        {formatRp(d.revenue)} ({d.txCount})
                      </span>
                    </div>
                  );
                })}
              </div>

              {analytics.dailyTrends.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Tren Omset Harian ({analytics.dailyTrends.length} hari aktif)
                  </p>
                  <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1">
                    {analytics.dailyTrends.slice(-30).map((pt) => {
                      const hPct = Math.max(6, Math.round((pt.revenue / maxDailyRevenue) * 100));
                      return (
                        <div
                          key={pt.date}
                          className="flex-1 min-w-[10px] max-w-[26px] flex flex-col items-center justify-end h-full group"
                          title={`${pt.date}: ${formatRp(pt.revenue)} (${pt.txCount} tx)`}
                        >
                          <div
                            className="w-full bg-sky-600 group-hover:bg-slate-900 rounded-t transition-colors"
                            style={{ height: `${hPct}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {analytics.hasTimestampHours && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Jam Puncak Transaksi
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {analytics.hourTrends
                      .filter((h) => h.txCount > 0)
                      .map((h) => (
                        <div
                          key={h.bucketLabel}
                          className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 tabular-nums"
                        >
                          <span className="text-slate-700 font-medium">{h.bucketLabel}</span>
                          <span className="font-bold text-slate-900">
                            {h.txCount} tx · {formatRp(h.revenue)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Channel & Category Mix */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Kontribusi Channel Penjualan &amp; Kategori Produk
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Perbandingan omset dan margin bersih antar tier harga (Reguler, Klinik, Mitra, Faktur).
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Per Channel</p>
                {analytics.channelBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400">Belum ada transaksi di periode ini.</p>
                ) : (
                  analytics.channelBreakdown.map((ch) => (
                    <div
                      key={ch.label}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-xs tabular-nums"
                    >
                      <div>
                        <span className="font-bold text-slate-900">{ch.label}</span>
                        <span className="text-slate-500 ml-2">
                          {ch.txCount} tx · porsi {ch.sharePct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900">{formatRp(ch.revenue)}</div>
                        <div className="text-[11px] text-emerald-700">Margin {ch.marginPct.toFixed(1)}%</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Top Kategori Produk
                </p>
                {analytics.categoryBreakdown.slice(0, 6).map((cat) => (
                  <div key={cat.label} className="flex items-center justify-between text-xs tabular-nums">
                    <span className="text-slate-700 font-medium truncate pr-2">{cat.label}</span>
                    <span className="text-slate-900 font-semibold shrink-0">
                      {formatRp(cat.revenue)} ({cat.sharePct.toFixed(1)}%) · Margin {cat.marginPct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Patient Repeat & Control Reminder Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Perilaku Pasien, Repeat Order &amp; Kandidat Pengingat Kontrol Rutin
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  {analytics.kpis.repeatIdentifiedCustomers} dari {analytics.kpis.uniqueIdentifiedCustomers} pasien teridentifikasi melakukan kunjungan/pembelian berulang ({analytics.kpis.repeatPatientRatePct.toFixed(1)}%).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Pasien &amp; No. RM</th>
                    <th className="py-2.5 px-2.5">Diagnosis / Terapi Terbanyak</th>
                    <th className="py-2.5 px-2.5 text-right">Kunjungan / Tx</th>
                    <th className="py-2.5 px-2.5 text-right">Total Belanja</th>
                    <th className="py-2.5 px-2.5">Kunjungan Terakhir</th>
                    <th className="py-2.5 px-2.5">Status Follow-Up</th>
                    <th className="py-2.5 px-3 text-right">Tindak Lanjut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.patientInsights.slice(0, 15).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Belum ada data riwayat pasien teridentifikasi (No. RM / Nama).
                      </td>
                    </tr>
                  ) : (
                    analytics.patientInsights.slice(0, 15).map((pat) => (
                      <tr key={pat.key} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{pat.name}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {pat.rmId} · {pat.category} {pat.phone ? `· ${pat.phone}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-700 max-w-[220px] truncate" title={pat.topDiagnosis}>
                          {pat.topDiagnosis}
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums">
                          {pat.txCount} tx / {pat.rmeVisits} RME
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-semibold text-slate-900 tabular-nums">
                          {formatRp(pat.totalSpent)}
                        </td>
                        <td className="py-2.5 px-2.5 tabular-nums whitespace-nowrap">
                          {pat.lastVisitDate || '-'}
                          {pat.daysSinceLastVisit !== null && (
                            <span className="text-slate-500 ml-1">({pat.daysSinceLastVisit}h lalu)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          {pat.needsControlFollowUp ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              Perlu Pengingat Kontrol
                            </span>
                          ) : pat.isRepeat ? (
                            <span className="text-[11px] font-semibold text-emerald-700">Loyal / Repeat</span>
                          ) : (
                            <span className="text-[11px] text-slate-500">Kunjungan Tunggal</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setFollowUpModal({
                                title: `Pengingat Kontrol Rutin: ${pat.name}`,
                                recipientName: pat.name,
                                phone: pat.phone,
                                message: `Halo Bapak/Ibu ${pat.name}, dari Klinik & Apotek kami ingin mengingatkan jadwal kontrol/evaluasi terapi rutin Anda. Bila ingin mendaftar antrean atau menanyakan ketersediaan obat, silakan balas pesan ini.`,
                                strategyType: 'REPEAT_PASIEN',
                                targetChannel: 'KLINIK',
                                rmId: pat.rmId
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-800 cursor-pointer"
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-600" />
                            <span>Siapkan Pesan</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mitra B2B Insights Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Perilaku Pembelian Mitra &amp; Faskes B2B
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pantau frekuensi pesanan dari Portal Mitra Online dan faktur B2B untuk dorongan order berulang.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onOpenMitraPortal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Buka Portal Mitra Online</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('pos-mitra-orders')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Lihat Pesanan Mitra</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Nama Mitra Faskes</th>
                    <th className="py-2.5 px-2.5 text-right">Order Portal / Faktur</th>
                    <th className="py-2.5 px-2.5 text-right">Total Nilai Order</th>
                    <th className="py-2.5 px-2.5">Order Terakhir</th>
                    <th className="py-2.5 px-2.5">Item Paling Sering Dipesan</th>
                    <th className="py-2.5 px-2.5">Status</th>
                    <th className="py-2.5 px-3 text-right">Penawaran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.mitraInsights.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Belum ada data mitra terdaftar.
                      </td>
                    </tr>
                  ) : (
                    analytics.mitraInsights.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{m.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {m.category} {m.phone ? `· ${m.phone}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums">
                          {m.orderCount} portal · {m.invoiceCount} faktur
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-semibold text-slate-900 tabular-nums">
                          {formatRp(m.totalSpent)}
                        </td>
                        <td className="py-2.5 px-2.5 tabular-nums whitespace-nowrap">
                          {m.lastOrderDate || '-'}
                          {m.daysSinceLastOrder !== null && (
                            <span className="text-slate-500 ml-1">({m.daysSinceLastOrder}h)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 max-w-[230px] truncate text-slate-700">
                          {m.topOrderedItems.length > 0 ? m.topOrderedItems.join(', ') : '-'}
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                              m.segmentStatus === 'Aktif Rutin'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : m.segmentStatus === 'Perlu Follow-Up (>30 Hari)'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {m.segmentStatus}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setFollowUpModal({
                                title: `Penawaran Re-Order Mitra: ${m.name}`,
                                recipientName: m.name,
                                phone: m.phone,
                                message: `Halo Tim Pengadaan ${m.name}, kami informasikan ketersediaan stok & harga khusus tier Mitra di Portal Order Mitra Online telah diperbarui${m.topOrderedItems.length > 0 ? ` termasuk ${m.topOrderedItems.join(', ')}` : ''}. Silakan sampaikan kebutuhan pengadaan bulan ini agar dapat langsung kami siapkan.`,
                                strategyType: 'REORDER_MITRA',
                                targetChannel: 'PORTAL_MITRA',
                                mitraId: m.id
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-800 cursor-pointer"
                          >
                            <MessageCircle className="w-3 h-3 text-sky-600" />
                            <span>Siapkan Penawaran</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Portal Order Mandiri Dual-Room Funnel & Product Analytics */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Aktivitas &amp; Performa Portal Order Mandiri (2 Ruang)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rekaman interaksi nyata pelanggan Ruang Reguler/Umum (termasuk kebutuhan unggah resep) dan Ruang Order Mitra (termasuk klik kunci non-terdaftar).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold tabular-nums">
                  {analytics.portalMetrics.totalEventsInPeriod.toLocaleString('id-ID')} interaksi portal
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold tabular-nums">
                  {analytics.portalMetrics.totalOrdersInPeriod} order ·{' '}
                  {formatRp(analytics.portalMetrics.totalPortalRevenue)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              {[analytics.portalMetrics.reguler, analytics.portalMetrics.mitra].map((roomSummary) => {
                const isReguler = roomSummary.room === 'REGULER';
                return (
                  <div
                    key={roomSummary.room}
                    className={`rounded-xl border p-4 ${
                      isReguler
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-sky-200 bg-sky-50/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${
                            isReguler
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-sky-100 text-sky-700'
                          }`}
                        >
                          {isReguler ? <ShoppingBag className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                        </span>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900">{roomSummary.roomLabel}</h3>
                          <p className="text-[11px] text-slate-500">
                            {isReguler
                              ? 'Tanpa registrasi · Harga satuan kecil · Gate resep wajib'
                              : 'Khusus Mitra Terverifikasi · Harga Box/Karton'}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-900 tabular-nums">
                        {formatRp(roomSummary.portalRevenue)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                      <div className="bg-white border border-slate-200 rounded-lg p-2">
                        <p className="text-[10px] font-semibold text-slate-500">Lihat Produk</p>
                        <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                          {roomSummary.views}
                        </p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2">
                        <p className="text-[10px] font-semibold text-slate-500">+ Keranjang</p>
                        <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                          {roomSummary.cartAdds}
                        </p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2">
                        <p className="text-[10px] font-semibold text-slate-500">
                          {isReguler ? 'Unggah Resep' : 'Klik Terkunci'}
                        </p>
                        <p
                          className={`text-sm font-bold tabular-nums mt-0.5 ${
                            isReguler
                              ? 'text-emerald-700'
                              : roomSummary.lockedAttempts > 0
                              ? 'text-amber-700'
                              : 'text-slate-900'
                          }`}
                        >
                          {isReguler
                            ? `${roomSummary.rxUploads}/${roomSummary.rxPrompts}`
                            : roomSummary.lockedAttempts}
                        </p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2">
                        <p className="text-[10px] font-semibold text-slate-500">Order Masuk</p>
                        <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                          {roomSummary.ordersSubmitted}
                        </p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2">
                        <p className="text-[10px] font-semibold text-slate-500">Jadi Faktur/POS</p>
                        <p className="text-sm font-bold text-emerald-700 tabular-nums mt-0.5">
                          {roomSummary.convertedOrders}
                        </p>
                      </div>
                    </div>

                    {roomSummary.unconvertedRevenue > 0 && (
                      <p className="text-[11px] text-amber-800 mt-2.5 font-medium">
                        Potensi nilai order menunggu proses/verifikasi:{' '}
                        <span className="font-bold tabular-nums">
                          {formatRp(roomSummary.unconvertedRevenue)}
                        </span>{' '}
                        ({roomSummary.pendingOrders} order aktif)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Produk Diminati di Portal</th>
                    <th className="py-2.5 px-2.5">Penanda Resep</th>
                    <th className="py-2.5 px-2.5 text-right">Reguler (Lihat / Keranjang / Qty)</th>
                    <th className="py-2.5 px-2.5 text-right">Mitra (Lihat / Keranjang / Box)</th>
                    <th className="py-2.5 px-2.5 text-right">Klik Terkunci</th>
                    <th className="py-2.5 px-3 text-right">Total Interaksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.portalMetrics.topPortalProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        Belum ada aktivitas produk di Portal Order Mandiri pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    analytics.portalMetrics.topPortalProducts.map((row) => (
                      <tr key={row.medicineId} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{row.medicineName}</div>
                          <div className="text-[11px] text-slate-500">{row.category}</div>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          {row.rxRequirementLabel ? (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">
                              {row.rxRequirementLabel}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">Bebas / OTC</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums text-slate-700">
                          {row.regulerViews} / {row.regulerCartAdds} / {row.regulerOrderedQty}
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums text-slate-700">
                          {row.mitraViews} / {row.mitraCartAdds} / {row.mitraOrderedQty}
                        </td>
                        <td className="py-2.5 px-2.5 text-right tabular-nums">
                          {row.mitraLockedClicks > 0 ? (
                            <span className="font-semibold text-amber-700">{row.mitraLockedClicks}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                          {row.totalInteractions}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: EKSEKUSI KAMPANYE & PELACAKAN DAMPAK OMSET (BEFORE VS AFTER) */}
      {/* =================================================================== */}
      {activeSubTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Pelacak Eksekusi Strategi &amp; Perbandingan Omset (Sebelum vs. Sesudah)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Membandingkan jendela hari setara sebelum tanggal aktivasi vs sesudah aktivasi langsung dari transaksi nyata (Omset, Run-Rate Harian, Jumlah Transaksi, AOV, dan Margin Kotor).
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateTab('setup-diskon-promo')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <BadgePercent className="w-3.5 h-3.5" />
                <span>Kelola Diskon &amp; Promo</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('inv-defecta')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Riwayat PO Defecta</span>
              </button>
            </div>
          </div>

          {marketingCampaigns.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-2">
              <p className="text-sm font-bold text-slate-800">Belum Ada Kampanye Strategi Marketing Tercatat</p>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                Buat kampanye baru dari tombol &ldquo;Buat Strategi / Promo&rdquo; atau eksekusi langsung rekomendasi di tab Ringkasan untuk mulai melacak dampak omset dan margin sebelum vs. sesudah.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {marketingCampaigns.map((camp) => {
                const evalRes = campaignEvaluations.get(camp.id);
                const linkedDisc = camp.linkedDiscountId
                  ? salesDiscounts.find((d) => d.id === camp.linkedDiscountId)
                  : undefined;
                const linkedPromo = camp.linkedPromoId
                  ? promoAds.find((p) => p.id === camp.linkedPromoId)
                  : undefined;
                const linkedPo = camp.linkedPoId
                  ? purchaseOrders.find((po) => po.id === camp.linkedPoId)
                  : undefined;

                return (
                  <div
                    key={camp.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {STRATEGY_TYPE_LABELS[camp.strategyType]}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                              camp.status === 'Aktif'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : camp.status === 'Selesai'
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {camp.status}
                          </span>
                          <span className="text-xs text-slate-500 tabular-nums">
                            Aktivasi: {camp.activatedAt} · Jendela: {camp.baselineDays} hari · Channel: {camp.targetChannel}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900">{camp.title}</h3>
                        {camp.notes && <p className="text-xs text-slate-600">{camp.notes}</p>}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
                          {linkedDisc && (
                            <span className="text-emerald-700 font-semibold">
                              Diskon POS: {linkedDisc.name} ({linkedDisc.isActive ? 'Aktif' : 'Nonaktif'})
                            </span>
                          )}
                          {linkedPromo && (
                            <span className="text-sky-700 font-semibold">
                              Banner Portal: {linkedPromo.title}
                            </span>
                          )}
                          {linkedPo && (
                            <span className="text-amber-800 font-semibold">
                              Surat Pesanan: #{linkedPo.poNumber} ({linkedPo.status})
                            </span>
                          )}
                          {camp.discountCode && (
                            <span className="font-mono text-slate-700">Kode: {camp.discountCode}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={camp.status}
                          onChange={(e) =>
                            onSaveCampaign(
                              {
                                ...camp,
                                status: e.target.value as MarketingCampaignStatus,
                                updatedAt: new Date().toISOString()
                              },
                              true
                            )
                          }
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white"
                        >
                          <option value="Aktif">Status: Aktif</option>
                          <option value="Selesai">Status: Selesai</option>
                          <option value="Draf">Status: Draf</option>
                          <option value="Diarsipkan">Status: Diarsipkan</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => onDeleteCampaign(camp.id)}
                          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                          title="Hapus kampanye dari pelacak"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {evalRes && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs tabular-nums">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Omset ({evalRes.before.daysObserved}h vs {evalRes.after.daysObserved}h)</span>
                            {evalRes.revenueDeltaPct !== null && (
                              <span
                                className={`font-bold ${
                                  evalRes.revenueDeltaPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {evalRes.revenueDeltaPct >= 0 ? '+' : ''}
                                {evalRes.revenueDeltaPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="mt-1 font-bold text-slate-900">
                            {formatRp(evalRes.before.revenue)} &rarr; {formatRp(evalRes.after.revenue)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Run-rate/hari: {formatRp(evalRes.before.dailyRunRateRevenue)} &rarr; {formatRp(evalRes.after.dailyRunRateRevenue)}
                            {evalRes.dailyRunRateDeltaPct !== null &&
                              ` (${evalRes.dailyRunRateDeltaPct >= 0 ? '+' : ''}${evalRes.dailyRunRateDeltaPct.toFixed(1)}%)`}
                          </div>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Jumlah Transaksi</span>
                            {evalRes.txDeltaPct !== null && (
                              <span
                                className={`font-bold ${
                                  evalRes.txDeltaPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {evalRes.txDeltaPct >= 0 ? '+' : ''}
                                {evalRes.txDeltaPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="mt-1 font-bold text-slate-900">
                            {evalRes.before.txCount} tx &rarr; {evalRes.after.txCount} tx
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Periode: {evalRes.before.startDate}..{evalRes.before.endDate} vs {evalRes.after.startDate}..{evalRes.after.endDate}
                          </div>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Rata-Rata Transaksi (AOV)</span>
                            {evalRes.aovDeltaPct !== null && (
                              <span
                                className={`font-bold ${
                                  evalRes.aovDeltaPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {evalRes.aovDeltaPct >= 0 ? '+' : ''}
                                {evalRes.aovDeltaPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="mt-1 font-bold text-slate-900">
                            {formatRp(evalRes.before.avgBasket)} &rarr; {formatRp(evalRes.after.avgBasket)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Nilai keranjang rata-rata</div>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Margin Kotor (Rp &amp; %)</span>
                            <span
                              className={`font-bold ${
                                evalRes.marginPctPointDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {evalRes.marginPctPointDelta >= 0 ? '+' : ''}
                              {evalRes.marginPctPointDelta.toFixed(1)} pp
                            </span>
                          </div>
                          <div className="mt-1 font-bold text-slate-900">
                            {formatRp(evalRes.before.grossProfit)} ({evalRes.before.grossMarginPct.toFixed(1)}%) &rarr;{' '}
                            {formatRp(evalRes.after.grossProfit)} ({evalRes.after.grossMarginPct.toFixed(1)}%)
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Setelah HPP item terjual</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL EKSEKUSI STRATEGI / PROMO POS / BANNER PORTAL                 */}
      {/* =================================================================== */}
      {actionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Eksekusi Strategi &amp; Aktivasi Penawaran Terukur
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aturan diskon langsung terbaca otomatis di Form POS Kasir &amp; Portal Mitra Online.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitActionCampaign} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Judul Kampanye / Promo *</label>
                <input
                  type="text"
                  required
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Contoh: Paket Imun Vitamin + Masker 5%"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipe Strategi</label>
                  <select
                    value={draftStrategyType}
                    onChange={(e) => setDraftStrategyType(e.target.value as MarketingStrategyType)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
                  >
                    {Object.entries(STRATEGY_TYPE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Channel</label>
                  <select
                    value={draftChannel}
                    onChange={(e) => setDraftChannel(e.target.value as MarketingCampaign['targetChannel'])}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="ALL">Semua Channel</option>
                    <option value="REGULER">Kasir Reguler / OTC</option>
                    <option value="KLINIK">Pasien Klinik</option>
                    <option value="MITRA">Mitra / Faktur</option>
                    <option value="PORTAL_MITRA">Portal Order Mitra Online</option>
                  </select>
                </div>
              </div>

              {draftMedicineNames.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="font-semibold text-slate-700 mb-1">Produk Target ({draftMedicineNames.length})</p>
                  <p className="text-slate-600">{draftMedicineNames.join(', ')}</p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={draftStartDate}
                    onChange={(e) => setDraftStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Berakhir</label>
                  <input
                    type="date"
                    value={draftEndDate}
                    onChange={(e) => setDraftEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 tabular-nums"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block font-semibold text-slate-700 mb-1">Jendela Evaluasi (Hari)</label>
                  <input
                    type="number"
                    min={3}
                    max={90}
                    value={draftBaselineDays}
                    onChange={(e) => setDraftBaselineDays(Number(e.target.value) || 14)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50/50">
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftCreateDiscount}
                    onChange={(e) => setDraftCreateDiscount(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Aktifkan Aturan Diskon Otomatis di POS Kasir &amp; Portal</span>
                </label>

                {draftCreateDiscount && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Besaran Diskon (%)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={draftDiscountPct}
                        onChange={(e) => setDraftDiscountPct(Number(e.target.value) || 0)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Kode Promo (Opsional)
                      </label>
                      <input
                        type="text"
                        value={draftPromoCode}
                        onChange={(e) => setDraftPromoCode(e.target.value.toUpperCase())}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={draftCreatePortalBanner}
                    onChange={(e) => setDraftCreatePortalBanner(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Terbitkan Banner Penawaran ke Portal Order Mitra Online</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan &amp; Dasar Analitik</label>
                <textarea
                  rows={2}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
                  placeholder="Ringkasan dasar analitik strategi ini..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActionModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAction}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingAction ? 'Menyimpan...' : 'Aktifkan Strategi & Lacak Dampak'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL PESAN TINDAK LANJUT (WHATSAPP / OBROLAN INTERAKTIF)            */}
      {/* =================================================================== */}
      {followUpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{followUpModal.title}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Penerima: {followUpModal.recipientName} {followUpModal.phone ? `(${followUpModal.phone})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFollowUpModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Draf Pesan Tindak Lanjut</label>
              <textarea
                rows={4}
                value={followUpModal.message}
                onChange={(e) =>
                  setFollowUpModal((prev) => (prev ? { ...prev, message: e.target.value } : null))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={async () => {
                  await handleCopyText('followup-copy', followUpModal.message);
                  await handleLogFollowUpCampaign();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                <span>{copiedId === 'followup-copy' ? 'Tersalin!' : 'Salin Pesan & Catat'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await handleLogFollowUpCampaign();
                    handleSendToInteractiveChat(followUpModal.message);
                    setFollowUpModal(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Buka di Obrolan Interaktif</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL SKEMA SQL SUPABASE (strategi_marketing)                       */}
      {/* =================================================================== */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Skema SQL Tabel Supabase (strategi_marketing)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Jalankan skrip SQL ini di SQL Editor Dashboard Supabase untuk mengaktifkan sinkronisasi dua arah &amp; realtime pelacakan kampanye.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-[11px] font-mono overflow-x-auto leading-relaxed">
                {SUPABASE_MARKETING_SQL_SCHEMA}
              </pre>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleCopyText('sql-marketing', SUPABASE_MARKETING_SQL_SCHEMA)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                <span>{copiedId === 'sql-marketing' ? 'SQL Tersalin!' : 'Salin Skema SQL'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <PortalQRGeneratorModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        defaultTarget="unified"
        onOpenPortalPreview={() => onOpenMitraPortal()}
      />
    </div>
  );
};
