import {
  DrugInteractionRecord,
  MarketingCampaign,
  Medicine,
  Mitra,
  MitraOrder,
  Patient,
  PortalActivityEvent,
  PortalOrderRoom,
  PromoAd,
  RMERecord,
  SalesDiscount,
  Transaction
} from '../types';
import { INITIAL_INTERAKSI_OBAT, checkDrugPairInteractionQuiet } from '../data/drugInteractions';
import {
  isAntibiotikRxDokter,
  isNappzaRxAsli,
  getMedicinePrescriptionRequirement
} from './medicineRegulation';

export type MarketingPeriodPreset = '7d' | '30d' | '90d' | 'month' | 'all' | 'custom';
export type MarketingChannelFilter = 'ALL' | 'REGULER' | 'KLINIK' | 'MITRA' | 'FAKTUR_PENJUALAN';
export type ProductMovementClass = 'FAST' | 'SLOW' | 'DEAD';
export type ProductQuadrant = 'STAR' | 'TRAFFIC_DRIVER' | 'POTENTIAL' | 'STOCK_BURDEN';

export interface MarketingFilterOptions {
  periodPreset: MarketingPeriodPreset;
  customStartDate?: string;
  customEndDate?: string;
  branchId: string; // 'ALL' or specific branchId
  channel: MarketingChannelFilter;
  nearEdWindowDays?: number;
}

export interface DataGapItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  label: string;
  count: number;
  detail: string;
}

export interface MarketingReliabilityMeta {
  snapshotAt: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  dayCount: number;
  totalTransactionsRaw: number;
  validTransactionsCount: number;
  excludedCancelledCount: number;
  excludedReturnedCount: number;
  totalLineItems: number;
  productLineItemsCount: number;
  serviceLineItemsCount: number;
  uniqueProductsSold: number;
  totalMedicinesInScope: number;
  missingHppCount: number;
  missingExpDateCount: number;
  missingBatchNoCount: number;
  missingCategoryCount: number;
  unlinkedPatientTxCount: number;
  totalPatientsCount: number;
  totalMitraCount: number;
  pendingMitraOrdersCount: number;
  activeDiscountsCount: number;
  activePromosCount: number;
  completenessPct: number;
  statusLabel: 'Data Lengkap & Andal' | 'Sebagian Data Master Perlu Dilengkapi' | 'Sampel Transaksi Terbatas';
  dataGaps: DataGapItem[];
  movementRuleSummary: {
    fastQtyThreshold: number;
    fastFreqThreshold: number;
    medianMarginPct: number;
    velocityThreshold: number;
  };
}

export interface MarketingKPIs {
  totalRevenue: number;
  productRevenue: number;
  serviceRevenue: number;
  totalCogs: number;
  totalGrossProfit: number;
  grossMarginPct: number;
  txCount: number;
  avgBasketValue: number;
  totalUnitsSoldSmall: number;
  clinicVisitCount: number;
  mitraRevenue: number;
  repeatPatientRatePct: number;
  uniqueIdentifiedCustomers: number;
  repeatIdentifiedCustomers: number;
  nearEdAssetValueHpp: number;
  deadStockAssetValueHpp: number;
}

export interface ProductPerformanceRow {
  id: string;
  name: string;
  category: string;
  kelas: string;
  nappza: string;
  supplier: string;
  branchId: string;
  unitSmall: string;
  unitLarge: string;
  rasioKonversi: number;
  stock: number;
  minStock: number;
  maxStock: number;
  nearestExpDate: string;
  daysToNearestExp: number | null;
  hppSmall: number;
  hasValidHpp: boolean;
  sellPrice: number;
  sellPriceKlinik: number;
  sellPriceMitra: number;
  tierSpreadKlinikPct: number;
  tierSpreadMitraPct: number;
  qtySoldSmall: number;
  txFrequency: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  turnoverRate: number;
  avgDailyQtySmall: number;
  daysOfInventory: number | null;
  movementClass: ProductMovementClass;
  quadrant: ProductQuadrant;
  isRestrictedRx: boolean;
  stockAssetValueHpp: number;
}

export interface BasketPairRow {
  pairKey: string;
  itemAId: string;
  itemAName: string;
  itemACategory: string;
  itemBId: string;
  itemBName: string;
  itemBCategory: string;
  coCount: number;
  supportPct: number;
  confidenceAtoB: number;
  confidenceBtoA: number;
  combinedAvgRevenue: number;
  combinedUnitMarginRp: number;
  clinicalSafety: {
    safeForOtcBundling: boolean;
    reason: string;
    interactionSeverity?: string;
    interactionDetail?: string;
  };
}

export interface DailyTrendPoint {
  date: string;
  revenue: number;
  grossProfit: number;
  txCount: number;
  avgBasket: number;
}

export interface DayOfWeekTrendPoint {
  dayIndex: number; // 0 = Minggu ... 6 = Sabtu
  dayLabel: string;
  txCount: number;
  revenue: number;
  avgBasket: number;
}

export interface HourBucketPoint {
  bucketLabel: string;
  txCount: number;
  revenue: number;
}

export interface BreakdownRow {
  label: string;
  txCount: number;
  unitsSold: number;
  revenue: number;
  grossProfit: number;
  marginPct: number;
  sharePct: number;
}

export interface PatientInsightRow {
  key: string;
  rmId: string;
  name: string;
  phone: string;
  category: string;
  txCount: number;
  rmeVisits: number;
  totalSpent: number;
  lastVisitDate: string;
  daysSinceLastVisit: number | null;
  topDiagnosis: string;
  isChronicCandidate: boolean;
  isRepeat: boolean;
  needsControlFollowUp: boolean;
}

export interface MitraInsightRow {
  id: string;
  name: string;
  category: string;
  phone: string;
  orderCount: number;
  invoiceCount: number;
  totalSpent: number;
  lastOrderDate: string;
  daysSinceLastOrder: number | null;
  topOrderedItems: string[];
  segmentStatus: 'Aktif Rutin' | 'Perlu Follow-Up (>30 Hari)' | 'Belum Ada Transaksi';
}

export interface MarketingRecommendation {
  id: string;
  strategyType: MarketingCampaign['strategyType'];
  priority: 'Tinggi' | 'Sedang' | 'Observasi';
  title: string;
  subtitle: string;
  dataBasis: string;
  targetChannel: MarketingCampaign['targetChannel'];
  targetMedicineIds: string[];
  targetMedicineNames: string[];
  targetMitraIds?: string[];
  targetPatientRmIds?: string[];
  suggestedDiscountPct?: number;
  suggestedPromoTitle?: string;
  suggestedFollowUpText?: string;
  actionKind: 'PROMO_DISKON' | 'DRAFT_PO' | 'FOLLOWUP_CHAT' | 'PORTAL_MITRA';
}

export interface CampaignImpactSnapshot {
  revenue: number;
  txCount: number;
  avgBasket: number;
  grossProfit: number;
  grossMarginPct: number;
  dailyRunRateRevenue: number;
  daysObserved: number;
  startDate: string;
  endDate: string;
}

export interface CampaignImpactEvaluation {
  campaignId: string;
  before: CampaignImpactSnapshot;
  after: CampaignImpactSnapshot;
  revenueDeltaRp: number;
  revenueDeltaPct: number | null;
  dailyRunRateDeltaPct: number | null;
  txDeltaPct: number | null;
  aovDeltaPct: number | null;
  marginPctPointDelta: number;
  hasSufficientComparisonData: boolean;
}

export interface PortalRoomAnalyticsSummary {
  room: PortalOrderRoom;
  roomLabel: string;
  views: number;
  cartAdds: number;
  checkoutStarts: number;
  rxPrompts: number;
  rxUploads: number;
  lockedAttempts: number;
  ordersSubmitted: number;
  convertedOrders: number;
  pendingOrders: number;
  portalRevenue: number;
  unconvertedRevenue: number;
}

export interface TopPortalProductRow {
  medicineId: string;
  medicineName: string;
  category: string;
  regulerViews: number;
  regulerCartAdds: number;
  regulerOrderedQty: number;
  mitraViews: number;
  mitraCartAdds: number;
  mitraLockedClicks: number;
  mitraOrderedQty: number;
  totalInteractions: number;
  rxRequirementLabel?: string;
}

export interface PortalMarketingMetrics {
  totalEventsInPeriod: number;
  totalOrdersInPeriod: number;
  totalPortalRevenue: number;
  reguler: PortalRoomAnalyticsSummary;
  mitra: PortalRoomAnalyticsSummary;
  topPortalProducts: TopPortalProductRow[];
}

export interface MarketingAnalyticsResult {
  reliability: MarketingReliabilityMeta;
  kpis: MarketingKPIs;
  products: ProductPerformanceRow[];
  movementCounts: Record<ProductMovementClass, number>;
  quadrantCounts: Record<ProductQuadrant, number>;
  basketPairs: BasketPairRow[];
  dailyTrends: DailyTrendPoint[];
  dayOfWeekTrends: DayOfWeekTrendPoint[];
  hourTrends: HourBucketPoint[];
  hasTimestampHours: boolean;
  channelBreakdown: BreakdownRow[];
  categoryBreakdown: BreakdownRow[];
  patientInsights: PatientInsightRow[];
  mitraInsights: MitraInsightRow[];
  portalMetrics: PortalMarketingMetrics;
  recommendations: MarketingRecommendation[];
}

const INDONESIAN_DOW_LABELS = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu'
];

const CHRONIC_ICD_PREFIXES = ['I10', 'I11', 'E10', 'E11', 'E14', 'E78', 'J45', 'I25', 'M10'];

export function toLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function extractDateOnly(raw?: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  // Match YYYY-MM-DD at start or embedded
  const isoMatch = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  // Match DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return toLocalDateString(parsed);
  }
  return '';
}

export function extractHourFromDateStr(raw?: string): number | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const timeMatch = s.match(/(?:T|\s)(\d{2}):(\d{2})/);
  if (timeMatch) {
    const h = Number(timeMatch[1]);
    if (Number.isFinite(h) && h >= 0 && h <= 23) return h;
  }
  return null;
}

export function diffDaysBetween(earlierYmd: string, laterYmd: string): number | null {
  if (!earlierYmd || !laterYmd) return null;
  const d1 = new Date(`${earlierYmd}T00:00:00`);
  const d2 = new Date(`${laterYmd}T00:00:00`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
  return Math.round((d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000));
}

export function addDaysYmd(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateString(d);
}

export function getPeriodDateRange(
  preset: MarketingPeriodPreset,
  customStartDate?: string,
  customEndDate?: string,
  referenceTodayYmd: string = toLocalDateString(),
  allTransactionDates: string[] = []
): { startDate: string; endDate: string; dayCount: number; label: string } {
  const endToday = referenceTodayYmd;
  if (preset === '7d') {
    const start = addDaysYmd(endToday, -6);
    return { startDate: start, endDate: endToday, dayCount: 7, label: '7 Hari Terakhir' };
  }
  if (preset === '30d') {
    const start = addDaysYmd(endToday, -29);
    return { startDate: start, endDate: endToday, dayCount: 30, label: '30 Hari Terakhir' };
  }
  if (preset === '90d') {
    const start = addDaysYmd(endToday, -89);
    return { startDate: start, endDate: endToday, dayCount: 90, label: '90 Hari Terakhir' };
  }
  if (preset === 'month') {
    const start = `${endToday.slice(0, 7)}-01`;
    const days = Math.max(1, (diffDaysBetween(start, endToday) ?? 0) + 1);
    return { startDate: start, endDate: endToday, dayCount: days, label: 'Bulan Berjalan' };
  }
  if (preset === 'custom') {
    const s = customStartDate || addDaysYmd(endToday, -29);
    const e = customEndDate || endToday;
    const start = s <= e ? s : e;
    const end = s <= e ? e : s;
    const days = Math.max(1, (diffDaysBetween(start, end) ?? 0) + 1);
    return { startDate: start, endDate: end, dayCount: days, label: `${start} s.d. ${end}` };
  }

  // 'all'
  const sortedDates = allTransactionDates.filter(Boolean).sort();
  const minDate = sortedDates[0] || addDaysYmd(endToday, -29);
  const maxDate = sortedDates[sortedDates.length - 1] || endToday;
  const end = maxDate > endToday ? maxDate : endToday;
  const days = Math.max(1, (diffDaysBetween(minDate, end) ?? 29) + 1);
  return {
    startDate: minDate,
    endDate: end,
    dayCount: days,
    label: sortedDates.length > 0 ? `Semua Data (${minDate} s.d. ${end})` : 'Semua Data'
  };
}

function isServiceFeeLineItem(item: { id?: string; name?: string }): boolean {
  const id = String(item.id || '').toUpperCase();
  const name = String(item.name || '').trim();
  if (id.startsWith('JASA-') || id.startsWith('LAB-FEE-') || id.startsWith('ADMIN-FEE')) return true;
  if (/^(biaya|jasa|tarif)\s+(dokter|konsultasi|tindakan|admin|penunjang|perawat|apoteker|lab|visit)/i.test(name)) {
    return true;
  }
  return false;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function resolveNearestMedicineExpDate(med: Medicine): string {
  const batchDates = Array.isArray(med.batches)
    ? med.batches
        .filter((b) => (Number(b.stock) || 0) > 0 && Boolean(b.expDate))
        .map((b) => extractDateOnly(b.expDate))
        .filter(Boolean)
        .sort()
    : [];
  if (batchDates.length > 0) return batchDates[0];
  return extractDateOnly(med.expDate);
}

function computeLineItemSmallQtyAndCogs(
  item: { id?: string; name?: string; qty?: number; unit?: string; price?: number; subtotal?: number; hpp?: number },
  matchedMed: Medicine | undefined
): { qtySmall: number; lineRevenue: number; lineCogs: number; hasValidCogs: boolean } {
  const rawQty = Math.max(0, Number(item.qty) || 0);
  const lineRevenue = Math.max(0, Number(item.subtotal) || rawQty * (Number(item.price) || 0));

  let qtySmall = rawQty;
  let soldInLargeUnit = false;
  if (matchedMed) {
    const ratio = Math.max(1, Number(matchedMed.rasioKonversi) || 1);
    const unitLower = String(item.unit || '').trim().toLowerCase();
    const largeLower = String(matchedMed.satuanBesar || '').trim().toLowerCase();
    const smallLower = String(matchedMed.satuanKecil || '').trim().toLowerCase();
    if (ratio > 1 && unitLower && largeLower && unitLower === largeLower && unitLower !== smallLower) {
      qtySmall = rawQty * ratio;
      soldInLargeUnit = true;
    }
  }

  const itemUnitHpp = Number(item.hpp) || 0;
  if (itemUnitHpp > 0) {
    return {
      qtySmall,
      lineRevenue,
      lineCogs: itemUnitHpp * rawQty,
      hasValidCogs: true
    };
  }

  if (matchedMed && Number(matchedMed.hpp) > 0) {
    const ratio = Math.max(1, Number(matchedMed.rasioKonversi) || 1);
    const unitHppSmall = Number(matchedMed.hpp);
    const lineCogs = soldInLargeUnit ? unitHppSmall * ratio * rawQty : unitHppSmall * rawQty;
    return {
      qtySmall,
      lineRevenue,
      lineCogs,
      hasValidCogs: true
    };
  }

  return {
    qtySmall,
    lineRevenue,
    lineCogs: 0,
    hasValidCogs: false
  };
}

export function computeMarketingAnalytics(params: {
  transactions: Transaction[];
  medicines: Medicine[];
  patients: Patient[];
  mitraList: Mitra[];
  mitraOrders: MitraOrder[];
  portalActivityLogs?: PortalActivityEvent[];
  rmeRecords: RMERecord[];
  salesDiscounts: SalesDiscount[];
  promoAds: PromoAd[];
  interactionRules?: DrugInteractionRecord[];
  filters: MarketingFilterOptions;
  referenceTodayYmd?: string;
}): MarketingAnalyticsResult {
  const {
    transactions,
    medicines,
    patients,
    mitraList,
    mitraOrders,
    portalActivityLogs = [],
    rmeRecords,
    salesDiscounts,
    promoAds,
    interactionRules = INITIAL_INTERAKSI_OBAT,
    filters,
    referenceTodayYmd = toLocalDateString()
  } = params;

  const nearEdWindowDays = filters.nearEdWindowDays ?? 90;
  const allTxDates = transactions.map((t) => extractDateOnly(t.date)).filter(Boolean);
  const period = getPeriodDateRange(
    filters.periodPreset,
    filters.customStartDate,
    filters.customEndDate,
    referenceTodayYmd,
    allTxDates
  );

  const scopedMedicines = medicines.filter(
    (m) => filters.branchId === 'ALL' || !m.branchId || m.branchId === filters.branchId
  );

  // Build deterministic lookups for medicines by id & normalized name
  const medById = new Map<string, Medicine>();
  const medByNormName = new Map<string, Medicine>();
  for (const m of scopedMedicines) {
    if (m.id) medById.set(m.id, m);
    if (m.name) medByNormName.set(m.name.trim().toLowerCase(), m);
  }
  // Fallback lookups across all branches in case transaction references another branch medicine id
  for (const m of medicines) {
    if (m.id && !medById.has(m.id)) medById.set(m.id, m);
    if (m.name && !medByNormName.has(m.name.trim().toLowerCase())) {
      medByNormName.set(m.name.trim().toLowerCase(), m);
    }
  }

  const resolveMed = (itemId?: string, itemName?: string): Medicine | undefined => {
    if (itemId && medById.has(itemId)) return medById.get(itemId);
    const norm = String(itemName || '').trim().toLowerCase();
    if (norm && medByNormName.has(norm)) return medByNormName.get(norm);
    return undefined;
  };

  // Filter transactions in date + branch + channel scope
  let totalTransactionsRaw = 0;
  let excludedCancelledCount = 0;
  let excludedReturnedCount = 0;
  const validTxs: Array<{ trx: Transaction; ymd: string; hour: number | null }> = [];

  for (const trx of transactions) {
    if (!trx) continue;
    if (filters.branchId !== 'ALL' && trx.branchId && trx.branchId !== filters.branchId) continue;
    if (filters.channel !== 'ALL' && trx.type !== filters.channel) continue;
    const ymd = extractDateOnly(trx.date);
    if (!ymd || ymd < period.startDate || ymd > period.endDate) continue;

    totalTransactionsRaw += 1;
    if (trx.status === 'Dibatalkan') {
      excludedCancelledCount += 1;
      continue;
    }
    if (trx.status === 'Diretur') {
      excludedReturnedCount += 1;
      continue;
    }
    validTxs.push({ trx, ymd, hour: extractHourFromDateStr(trx.date) });
  }

  // Aggregation accumulators
  let totalRevenue = 0;
  let productRevenue = 0;
  let serviceRevenue = 0;
  let totalCogs = 0;
  let totalUnitsSoldSmall = 0;
  let totalLineItems = 0;
  let productLineItemsCount = 0;
  let serviceLineItemsCount = 0;
  let unlinkedPatientTxCount = 0;
  let clinicVisitCount = 0;
  let mitraRevenue = 0;
  let hasTimestampHours = false;

  interface ProdAcc {
    qtySoldSmall: number;
    txIds: Set<string>;
    revenue: number;
    cogs: number;
    hasAnyValidCogs: boolean;
    fallbackName: string;
  }
  const prodAccMap = new Map<string, ProdAcc>();
  const dailyMap = new Map<string, { revenue: number; cogs: number; txCount: number }>();
  const dowAcc = INDONESIAN_DOW_LABELS.map((label, idx) => ({
    dayIndex: idx,
    dayLabel: label,
    txCount: 0,
    revenue: 0
  }));
  const hourBuckets = [
    { label: '06:00–10:59 (Pagi)', min: 6, max: 10, txCount: 0, revenue: 0 },
    { label: '11:00–14:59 (Siang)', min: 11, max: 14, txCount: 0, revenue: 0 },
    { label: '15:00–18:59 (Sore)', min: 15, max: 18, txCount: 0, revenue: 0 },
    { label: '19:00–23:59 (Malam)', min: 19, max: 23, txCount: 0, revenue: 0 },
    { label: '00:00–05:59 (Dini Hari)', min: 0, max: 5, txCount: 0, revenue: 0 }
  ];

  const channelMap = new Map<string, { txCount: number; unitsSold: number; revenue: number; cogs: number }>();
  const categoryMap = new Map<string, { txIds: Set<string>; unitsSold: number; revenue: number; cogs: number }>();

  // Basket pair accumulator
  interface PairAcc {
    itemAId: string;
    itemAName: string;
    itemACategory: string;
    itemBId: string;
    itemBName: string;
    itemBCategory: string;
    coCount: number;
    sumCombinedPrice: number;
    sumCombinedMargin: number;
  }
  const pairAccMap = new Map<string, PairAcc>();
  const itemTxPresenceCount = new Map<string, number>();

  for (const { trx, ymd, hour } of validTxs) {
    const trxTotal = Math.max(0, Number(trx.total) || 0);
    totalRevenue += trxTotal;
    if (trx.type === 'KLINIK') clinicVisitCount += 1;
    if (trx.type === 'MITRA' || trx.type === 'FAKTUR_PENJUALAN') mitraRevenue += trxTotal;
    if (!trx.rmId && trx.type !== 'MITRA' && trx.type !== 'FAKTUR_PENJUALAN') {
      unlinkedPatientTxCount += 1;
    }

    const trxTypeKey = trx.type || 'REGULER';
    const chEntry = channelMap.get(trxTypeKey) || { txCount: 0, unitsSold: 0, revenue: 0, cogs: 0 };
    chEntry.txCount += 1;
    chEntry.revenue += trxTotal;

    const items = Array.isArray(trx.items) ? trx.items : [];
    let trxProductCogsSum = 0;
    let trxItemsRevenueSum = 0;
    let trxProductUnits = 0;

    // Track distinct physical products in this transaction for Market Basket
    const distinctBasketProducts: Array<{
      key: string;
      id: string;
      name: string;
      category: string;
      unitRevenue: number;
      unitMargin: number;
    }> = [];
    const seenKeysInTrx = new Set<string>();

    for (const item of items) {
      totalLineItems += 1;
      if (isServiceFeeLineItem(item)) {
        serviceLineItemsCount += 1;
        serviceRevenue += Math.max(0, Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.price) || 0));
        continue;
      }

      productLineItemsCount += 1;
      const med = resolveMed(item.id, item.name);
      const { qtySmall, lineRevenue, lineCogs, hasValidCogs } = computeLineItemSmallQtyAndCogs(item, med);

      // Proportional transaction-level discount allocation is applied later via ratio if needed; keep line net here
      trxItemsRevenueSum += lineRevenue;
      trxProductCogsSum += lineCogs;
      trxProductUnits += qtySmall;
      totalUnitsSoldSmall += qtySmall;

      const prodKey = med?.id || `NAME:${String(item.name || '').trim().toLowerCase()}`;
      const prodDisplayName = med?.name || item.name || 'Produk Tanpa Nama';
      const prodCategory = med?.category || 'Belum Berkategori';

      const acc = prodAccMap.get(prodKey) || {
        qtySoldSmall: 0,
        txIds: new Set<string>(),
        revenue: 0,
        cogs: 0,
        hasAnyValidCogs: false,
        fallbackName: prodDisplayName
      };
      acc.qtySoldSmall += qtySmall;
      acc.txIds.add(trx.id);
      acc.revenue += lineRevenue;
      acc.cogs += lineCogs;
      if (hasValidCogs) acc.hasAnyValidCogs = true;
      prodAccMap.set(prodKey, acc);

      const catAcc = categoryMap.get(prodCategory) || {
        txIds: new Set<string>(),
        unitsSold: 0,
        revenue: 0,
        cogs: 0
      };
      catAcc.txIds.add(trx.id);
      catAcc.unitsSold += qtySmall;
      catAcc.revenue += lineRevenue;
      catAcc.cogs += lineCogs;
      categoryMap.set(prodCategory, catAcc);

      if (!seenKeysInTrx.has(prodKey) && qtySmall > 0) {
        seenKeysInTrx.add(prodKey);
        const unitSell = qtySmall > 0 ? lineRevenue / qtySmall : Number(item.price) || 0;
        const unitCost = qtySmall > 0 ? lineCogs / qtySmall : 0;
        distinctBasketProducts.push({
          key: prodKey,
          id: med?.id || item.id || prodKey,
          name: prodDisplayName,
          category: prodCategory,
          unitRevenue: unitSell,
          unitMargin: hasValidCogs ? Math.max(0, unitSell - unitCost) : 0
        });
      }
    }

    // If transaction.hppTotal exists and items lacked cogs, use authoritative trx.hppTotal
    const effectiveTrxCogs =
      trxProductCogsSum > 0 ? trxProductCogsSum : Math.max(0, Number(trx.hppTotal) || 0);
    totalCogs += effectiveTrxCogs;
    productRevenue += trxItemsRevenueSum > 0 ? trxItemsRevenueSum : Math.max(0, trxTotal - serviceRevenue);

    chEntry.unitsSold += trxProductUnits;
    chEntry.cogs += effectiveTrxCogs;
    channelMap.set(trxTypeKey, chEntry);

    const dEntry = dailyMap.get(ymd) || { revenue: 0, cogs: 0, txCount: 0 };
    dEntry.revenue += trxTotal;
    dEntry.cogs += effectiveTrxCogs;
    dEntry.txCount += 1;
    dailyMap.set(ymd, dEntry);

    const dateObj = new Date(`${ymd}T00:00:00`);
    if (!Number.isNaN(dateObj.getTime())) {
      const dow = dateObj.getDay();
      if (dowAcc[dow]) {
        dowAcc[dow].txCount += 1;
        dowAcc[dow].revenue += trxTotal;
      }
    }

    if (hour !== null) {
      hasTimestampHours = true;
      const hb = hourBuckets.find((b) => hour >= b.min && hour <= b.max);
      if (hb) {
        hb.txCount += 1;
        hb.revenue += trxTotal;
      }
    }

    // Update single-item tx presence & pairwise basket combinations
    for (const bp of distinctBasketProducts) {
      itemTxPresenceCount.set(bp.key, (itemTxPresenceCount.get(bp.key) || 0) + 1);
    }
    if (distinctBasketProducts.length >= 2) {
      const sortedBasket = [...distinctBasketProducts].sort((a, b) => a.key.localeCompare(b.key));
      for (let i = 0; i < sortedBasket.length; i += 1) {
        for (let j = i + 1; j < sortedBasket.length; j += 1) {
          const a = sortedBasket[i];
          const b = sortedBasket[j];
          const pk = `${a.key}::${b.key}`;
          const existing = pairAccMap.get(pk) || {
            itemAId: a.id,
            itemAName: a.name,
            itemACategory: a.category,
            itemBId: b.id,
            itemBName: b.name,
            itemBCategory: b.category,
            coCount: 0,
            sumCombinedPrice: 0,
            sumCombinedMargin: 0
          };
          existing.coCount += 1;
          existing.sumCombinedPrice += a.unitRevenue + b.unitRevenue;
          existing.sumCombinedMargin += a.unitMargin + b.unitMargin;
          pairAccMap.set(pk, existing);
        }
      }
    }
  }

  // Build product list combining all scoped medicines + any sold uncataloged items
  interface RawProductStats {
    med?: Medicine;
    key: string;
    name: string;
    qtySoldSmall: number;
    txFrequency: number;
    revenue: number;
    cogs: number;
    hasValidHpp: boolean;
  }
  const rawProductStats: RawProductStats[] = [];
  const handledKeys = new Set<string>();

  for (const med of scopedMedicines) {
    const acc = prodAccMap.get(med.id) || prodAccMap.get(`NAME:${med.name.trim().toLowerCase()}`);
    handledKeys.add(med.id);
    if (med.name) handledKeys.add(`NAME:${med.name.trim().toLowerCase()}`);
    rawProductStats.push({
      med,
      key: med.id,
      name: med.name,
      qtySoldSmall: acc?.qtySoldSmall || 0,
      txFrequency: acc?.txIds.size || 0,
      revenue: acc?.revenue || 0,
      cogs: acc?.cogs || 0,
      hasValidHpp: Number(med.hpp) > 0 || Boolean(acc?.hasAnyValidCogs)
    });
  }

  for (const [key, acc] of prodAccMap.entries()) {
    if (handledKeys.has(key)) continue;
    const fallbackMed = key.startsWith('NAME:') ? undefined : medById.get(key);
    rawProductStats.push({
      med: fallbackMed,
      key,
      name: fallbackMed?.name || acc.fallbackName,
      qtySoldSmall: acc.qtySoldSmall,
      txFrequency: acc.txIds.size,
      revenue: acc.revenue,
      cogs: acc.cogs,
      hasValidHpp: acc.hasAnyValidCogs || Number(fallbackMed?.hpp || 0) > 0
    });
  }

  // Compute deterministic classification thresholds from actual selling items in the period
  const sellingRows = rawProductStats.filter((r) => r.qtySoldSmall > 0);
  const soldQtys = sellingRows.map((r) => r.qtySoldSmall);
  const soldFreqs = sellingRows.map((r) => r.txFrequency);
  const sellingMargins = sellingRows
    .filter((r) => r.revenue > 0 && r.hasValidHpp)
    .map((r) => ((r.revenue - r.cogs) / r.revenue) * 100);

  const medianQty = computeMedian(soldQtys);
  const medianFreq = computeMedian(soldFreqs);
  const fastQtyThreshold = Math.max(3, Math.ceil(medianQty * 1.25));
  const fastFreqThreshold = Math.max(2, Math.ceil(medianFreq * 1.25));
  const medianMarginPct = sellingMargins.length > 0 ? computeMedian(sellingMargins) : 20;

  let missingHppCount = 0;
  let missingExpDateCount = 0;
  let missingBatchNoCount = 0;
  let missingCategoryCount = 0;
  let nearEdAssetValueHpp = 0;
  let deadStockAssetValueHpp = 0;

  const products: ProductPerformanceRow[] = rawProductStats.map((r) => {
    const med = r.med;
    const stock = Math.max(0, Number(med?.stock) || 0);
    const minStock = Math.max(0, Number(med?.minStock) || 0);
    const maxStock = Math.max(0, Number(med?.maxStock) || 0);
    const hppSmall = Math.max(0, Number(med?.hpp) || 0);
    const sellPrice = Math.max(0, Number(med?.sellPrice) || 0);
    const sellPriceKlinik = Math.max(0, Number(med?.sellPriceKlinik) || 0);
    const sellPriceMitra = Math.max(0, Number(med?.sellPriceMitra) || 0);
    const ratio = Math.max(1, Number(med?.rasioKonversi) || 1);
    const nearestExpDate = med ? resolveNearestMedicineExpDate(med) : '';
    const daysToNearestExp = nearestExpDate ? diffDaysBetween(referenceTodayYmd, nearestExpDate) : null;

    if (med) {
      if (hppSmall <= 0) missingHppCount += 1;
      if (!nearestExpDate) missingExpDateCount += 1;
      if (!med.batchNo || med.batchNo === '-') missingBatchNoCount += 1;
      if (!med.category) missingCategoryCount += 1;
    }

    const grossProfit = r.hasValidHpp ? r.revenue - r.cogs : 0;
    const grossMarginPct =
      r.revenue > 0 && r.hasValidHpp
        ? (grossProfit / r.revenue) * 100
        : sellPrice > 0 && hppSmall > 0
        ? ((sellPrice - hppSmall) / sellPrice) * 100
        : 0;

    const avgInvBase = Math.max(1, stock + r.qtySoldSmall / 2);
    const turnoverRate = r.qtySoldSmall > 0 ? r.qtySoldSmall / avgInvBase : 0;
    const avgDailyQtySmall = r.qtySoldSmall / Math.max(1, period.dayCount);
    const daysOfInventory =
      avgDailyQtySmall > 0 ? Math.round(stock / avgDailyQtySmall) : null;

    let movementClass: ProductMovementClass;
    if (r.qtySoldSmall === 0) {
      movementClass = 'DEAD';
    } else if (
      r.qtySoldSmall >= fastQtyThreshold ||
      r.txFrequency >= fastFreqThreshold ||
      turnoverRate >= 0.45
    ) {
      movementClass = 'FAST';
    } else {
      movementClass = 'SLOW';
    }

    const isHighVelocity = movementClass === 'FAST';
    const isHighMargin = grossMarginPct >= medianMarginPct;
    const isNearEdRisk = daysToNearestExp !== null && daysToNearestExp <= nearEdWindowDays && stock > 0;

    let quadrant: ProductQuadrant;
    if (movementClass === 'DEAD' || (movementClass === 'SLOW' && isNearEdRisk)) {
      quadrant = 'STOCK_BURDEN';
    } else if (isHighVelocity && isHighMargin) {
      quadrant = 'STAR';
    } else if (isHighVelocity && !isHighMargin) {
      quadrant = 'TRAFFIC_DRIVER';
    } else if (!isHighVelocity && isHighMargin) {
      quadrant = 'POTENTIAL';
    } else {
      quadrant = 'STOCK_BURDEN';
    }

    const stockAssetValueHpp = stock * hppSmall;
    if (isNearEdRisk) nearEdAssetValueHpp += stockAssetValueHpp;
    if (movementClass === 'DEAD' && stock > 0) deadStockAssetValueHpp += stockAssetValueHpp;

    const tierSpreadKlinikPct =
      sellPrice > 0 && sellPriceKlinik > 0 ? ((sellPriceKlinik - sellPrice) / sellPrice) * 100 : 0;
    const tierSpreadMitraPct =
      sellPrice > 0 && sellPriceMitra > 0
        ? ((sellPriceMitra / ratio - sellPrice) / sellPrice) * 100
        : 0;

    const isRestrictedRx = med
      ? getMedicinePrescriptionRequirement(med).requiresRx ||
        isAntibiotikRxDokter(med) ||
        isNappzaRxAsli(med)
      : false;

    return {
      id: r.key,
      name: r.name,
      category: med?.category || 'Lainnya',
      kelas: med?.kelas || '-',
      nappza: med?.nappza || 'Non-NAPPZA',
      supplier: med?.supplier || '-',
      branchId: med?.branchId || 'BR-01',
      unitSmall: med?.satuanKecil || med?.unit || 'Pcs',
      unitLarge: med?.satuanBesar || med?.unit || 'Box',
      rasioKonversi: ratio,
      stock,
      minStock,
      maxStock,
      nearestExpDate,
      daysToNearestExp,
      hppSmall,
      hasValidHpp: r.hasValidHpp,
      sellPrice,
      sellPriceKlinik,
      sellPriceMitra,
      tierSpreadKlinikPct,
      tierSpreadMitraPct,
      qtySoldSmall: r.qtySoldSmall,
      txFrequency: r.txFrequency,
      revenue: r.revenue,
      cogs: r.cogs,
      grossProfit,
      grossMarginPct,
      turnoverRate,
      avgDailyQtySmall,
      daysOfInventory,
      movementClass,
      quadrant,
      isRestrictedRx,
      stockAssetValueHpp
    };
  });

  products.sort((a, b) => b.revenue - a.revenue || b.qtySoldSmall - a.qtySoldSmall || b.stock - a.stock);

  const movementCounts: Record<ProductMovementClass, number> = { FAST: 0, SLOW: 0, DEAD: 0 };
  const quadrantCounts: Record<ProductQuadrant, number> = {
    STAR: 0,
    TRAFFIC_DRIVER: 0,
    POTENTIAL: 0,
    STOCK_BURDEN: 0
  };
  for (const p of products) {
    movementCounts[p.movementClass] += 1;
    quadrantCounts[p.quadrant] += 1;
  }

  // Market Basket Pairs + Clinical Safety check
  const validTxCount = validTxs.length;
  const candidatePairs = Array.from(pairAccMap.values())
    .filter((p) => p.coCount >= 1)
    .sort((a, b) => b.coCount - a.coCount || b.sumCombinedMargin - a.sumCombinedMargin)
    .slice(0, 20);

  const basketPairs: BasketPairRow[] = candidatePairs.map((pair) => {
    const medA = resolveMed(pair.itemAId, pair.itemAName);
    const medB = resolveMed(pair.itemBId, pair.itemBName);
    const keyA = medA?.id || `NAME:${pair.itemAName.trim().toLowerCase()}`;
    const keyB = medB?.id || `NAME:${pair.itemBName.trim().toLowerCase()}`;
    const countA = itemTxPresenceCount.get(keyA) || pair.coCount;
    const countB = itemTxPresenceCount.get(keyB) || pair.coCount;

    const restrictedA = medA
      ? getMedicinePrescriptionRequirement(medA).requiresRx ||
        isAntibiotikRxDokter(medA) ||
        isNappzaRxAsli(medA)
      : false;
    const restrictedB = medB
      ? getMedicinePrescriptionRequirement(medB).requiresRx ||
        isAntibiotikRxDokter(medB) ||
        isNappzaRxAsli(medB)
      : false;
    const interaction = checkDrugPairInteractionQuiet(
      pair.itemAName,
      pair.itemBName,
      interactionRules,
      medicines
    );

    let clinicalSafety: BasketPairRow['clinicalSafety'];
    if (interaction) {
      clinicalSafety = {
        safeForOtcBundling: false,
        reason: `Terdeteksi Interaksi Obat (${interaction.severity.toUpperCase()})`,
        interactionSeverity: interaction.severity,
        interactionDetail: `${interaction.obatA} × ${interaction.obatB}: ${interaction.manajemenKlinis}`
      };
    } else if (restrictedA || restrictedB) {
      clinicalSafety = {
        safeForOtcBundling: false,
        reason: 'Mengandung Antibiotik / NAPPZA / Obat Keras Wajib Resep — dilarang promo bundling bebas'
      };
    } else if (medA?.category === 'Obat Keras' || medB?.category === 'Obat Keras') {
      clinicalSafety = {
        safeForOtcBundling: false,
        reason: 'Mengandung Obat Keras (Daftar G) — hanya untuk edukasi terapi dokter/apoteker'
      };
    } else {
      clinicalSafety = {
        safeForOtcBundling: true,
        reason: 'Aman secara klinis (OTC / Vitamin / Alkes bebas interaksi)'
      };
    }

    return {
      pairKey: `${pair.itemAId}__${pair.itemBId}`,
      itemAId: pair.itemAId,
      itemAName: pair.itemAName,
      itemACategory: pair.itemACategory,
      itemBId: pair.itemBId,
      itemBName: pair.itemBName,
      itemBCategory: pair.itemBCategory,
      coCount: pair.coCount,
      supportPct: validTxCount > 0 ? (pair.coCount / validTxCount) * 100 : 0,
      confidenceAtoB: countA > 0 ? (pair.coCount / countA) * 100 : 0,
      confidenceBtoA: countB > 0 ? (pair.coCount / countB) * 100 : 0,
      combinedAvgRevenue: pair.coCount > 0 ? pair.sumCombinedPrice / pair.coCount : 0,
      combinedUnitMarginRp: pair.coCount > 0 ? pair.sumCombinedMargin / pair.coCount : 0,
      clinicalSafety
    };
  });

  // Trends & Breakdowns
  const dailyTrends: DailyTrendPoint[] = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({
      date,
      revenue: d.revenue,
      grossProfit: d.revenue - d.cogs,
      txCount: d.txCount,
      avgBasket: d.txCount > 0 ? d.revenue / d.txCount : 0
    }));

  const dayOfWeekTrends: DayOfWeekTrendPoint[] = dowAcc.map((d) => ({
    ...d,
    avgBasket: d.txCount > 0 ? d.revenue / d.txCount : 0
  }));

  const hourTrends: HourBucketPoint[] = hourBuckets.map((h) => ({
    bucketLabel: h.label,
    txCount: h.txCount,
    revenue: h.revenue
  }));

  const channelBreakdown: BreakdownRow[] = Array.from(channelMap.entries())
    .map(([label, c]) => {
      const gp = c.revenue - c.cogs;
      return {
        label,
        txCount: c.txCount,
        unitsSold: c.unitsSold,
        revenue: c.revenue,
        grossProfit: gp,
        marginPct: c.revenue > 0 ? (gp / c.revenue) * 100 : 0,
        sharePct: totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalCatRev = Array.from(categoryMap.values()).reduce((s, c) => s + c.revenue, 0);
  const categoryBreakdown: BreakdownRow[] = Array.from(categoryMap.entries())
    .map(([label, c]) => {
      const gp = c.revenue - c.cogs;
      return {
        label,
        txCount: c.txIds.size,
        unitsSold: c.unitsSold,
        revenue: c.revenue,
        grossProfit: gp,
        marginPct: c.revenue > 0 ? (gp / c.revenue) * 100 : 0,
        sharePct: totalCatRev > 0 ? (c.revenue / totalCatRev) * 100 : 0
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // Customer & Repeat Behavior (from ALL non-cancelled/returned transactions + RME for accurate lifetime repeat patterns)
  const patientMap = new Map<
    string,
    {
      rmId: string;
      name: string;
      phone: string;
      category: string;
      txCount: number;
      rmeVisits: number;
      totalSpent: number;
      lastVisitDate: string;
      diagnoses: Map<string, number>;
      isChronicCandidate: boolean;
    }
  >();

  const patientByRm = new Map<string, Patient>();
  for (const p of patients) {
    if (p.id) patientByRm.set(p.id, p);
    if (p.noRm) patientByRm.set(p.noRm, p);
  }

  for (const trx of transactions) {
    if (!trx || trx.status === 'Dibatalkan' || trx.status === 'Diretur') continue;
    if (trx.type === 'MITRA' || trx.type === 'FAKTUR_PENJUALAN') continue;
    if (filters.branchId !== 'ALL' && trx.branchId && trx.branchId !== filters.branchId) continue;

    const cleanName = String(trx.customerName || '').trim();
    const isAnonWalkin = !trx.rmId && (!cleanName || /^(pasien\s+umum|pelanggan\s+umum|umum|walk-in|-)$/i.test(cleanName));
    if (isAnonWalkin) continue;

    const patMaster = trx.rmId ? patientByRm.get(trx.rmId) : undefined;
    const key = trx.rmId ? `RM:${trx.rmId}` : `NAME:${cleanName.toLowerCase()}`;
    const ymd = extractDateOnly(trx.date);

    const entry = patientMap.get(key) || {
      rmId: trx.rmId || '-',
      name: patMaster?.name || cleanName || 'Pasien',
      phone: patMaster?.phone || trx.customerPhone || '',
      category: patMaster?.category || (trx.type === 'KLINIK' ? 'Pasien Praktik' : 'Pasien Umum'),
      txCount: 0,
      rmeVisits: 0,
      totalSpent: 0,
      lastVisitDate: '',
      diagnoses: new Map<string, number>(),
      isChronicCandidate: false
    };
    entry.txCount += 1;
    entry.totalSpent += Math.max(0, Number(trx.total) || 0);
    if (ymd && ymd > entry.lastVisitDate) entry.lastVisitDate = ymd;
    patientMap.set(key, entry);
  }

  for (const rme of rmeRecords) {
    if (!rme) continue;
    if (filters.branchId !== 'ALL' && rme.branchId && rme.branchId !== filters.branchId) continue;
    const key = rme.rmId ? `RM:${rme.rmId}` : `NAME:${String(rme.patientName || '').trim().toLowerCase()}`;
    if (!key || key === 'NAME:') continue;
    const patMaster = rme.rmId ? patientByRm.get(rme.rmId) : undefined;
    const ymd = extractDateOnly(rme.date);
    const entry = patientMap.get(key) || {
      rmId: rme.rmId || '-',
      name: patMaster?.name || rme.patientName || 'Pasien',
      phone: patMaster?.phone || '',
      category: patMaster?.category || 'Pasien Praktik',
      txCount: 0,
      rmeVisits: 0,
      totalSpent: 0,
      lastVisitDate: '',
      diagnoses: new Map<string, number>(),
      isChronicCandidate: false
    };
    entry.rmeVisits += 1;
    if (ymd && ymd > entry.lastVisitDate) entry.lastVisitDate = ymd;
    const icdLabel = rme.icdCode ? `${rme.icdCode} ${rme.icdName || ''}`.trim() : rme.icdName || '';
    if (icdLabel) {
      entry.diagnoses.set(icdLabel, (entry.diagnoses.get(icdLabel) || 0) + 1);
    }
    if (
      rme.icdCode &&
      CHRONIC_ICD_PREFIXES.some((prefix) => rme.icdCode.toUpperCase().startsWith(prefix))
    ) {
      entry.isChronicCandidate = true;
    }
    patientMap.set(key, entry);
  }

  const patientInsights: PatientInsightRow[] = Array.from(patientMap.entries())
    .map(([key, p]) => {
      const daysSince = p.lastVisitDate ? diffDaysBetween(p.lastVisitDate, referenceTodayYmd) : null;
      const sortedDx = Array.from(p.diagnoses.entries()).sort((a, b) => b[1] - a[1]);
      const isRepeat = p.txCount >= 2 || p.rmeVisits >= 2;
      const needsControlFollowUp =
        daysSince !== null && ((p.isChronicCandidate && daysSince >= 21) || (isRepeat && daysSince >= 30));
      return {
        key,
        rmId: p.rmId,
        name: p.name,
        phone: p.phone,
        category: p.category,
        txCount: p.txCount,
        rmeVisits: p.rmeVisits,
        totalSpent: p.totalSpent,
        lastVisitDate: p.lastVisitDate,
        daysSinceLastVisit: daysSince,
        topDiagnosis: sortedDx[0]?.[0] || '-',
        isChronicCandidate: p.isChronicCandidate,
        isRepeat,
        needsControlFollowUp
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent || b.txCount - a.txCount);

  const uniqueIdentifiedCustomers = patientInsights.length;
  const repeatIdentifiedCustomers = patientInsights.filter((p) => p.isRepeat).length;
  const repeatPatientRatePct =
    uniqueIdentifiedCustomers > 0 ? (repeatIdentifiedCustomers / uniqueIdentifiedCustomers) * 100 : 0;

  // Mitra B2B Insights
  const mitraAccMap = new Map<
    string,
    {
      id: string;
      name: string;
      category: string;
      phone: string;
      orderCount: number;
      invoiceCount: number;
      totalSpent: number;
      lastOrderDate: string;
      itemCounts: Map<string, number>;
    }
  >();

  for (const m of mitraList) {
    mitraAccMap.set(m.id, {
      id: m.id,
      name: m.name,
      category: m.category || 'Mitra Faskes',
      phone: m.phone || '',
      orderCount: 0,
      invoiceCount: 0,
      totalSpent: 0,
      lastOrderDate: '',
      itemCounts: new Map<string, number>()
    });
  }

  for (const ord of mitraOrders) {
    if (!ord || ord.status === 'Dibatalkan') continue;
    if (filters.branchId !== 'ALL' && ord.branchId && ord.branchId !== filters.branchId) continue;
    const matched =
      (ord.mitraId && mitraAccMap.get(ord.mitraId)) ||
      Array.from(mitraAccMap.values()).find(
        (m) => m.name.toLowerCase() === String(ord.mitraName || '').trim().toLowerCase()
      );
    const idKey = matched?.id || ord.mitraId || `MTR-NAME:${ord.mitraName}`;
    const entry = matched || {
      id: idKey,
      name: ord.mitraName || 'Mitra',
      category: ord.mitraCategory || 'Mitra Faskes',
      phone: ord.mitraPhone || '',
      orderCount: 0,
      invoiceCount: 0,
      totalSpent: 0,
      lastOrderDate: '',
      itemCounts: new Map<string, number>()
    };
    entry.orderCount += 1;
    // Avoid double count with converted invoice if already converted to Trx
    if (!ord.convertedTrxId) {
      entry.totalSpent += Math.max(0, Number(ord.totalAmount) || 0);
    }
    const ymd = extractDateOnly(ord.createdAt);
    if (ymd && ymd > entry.lastOrderDate) entry.lastOrderDate = ymd;
    for (const it of ord.items || []) {
      entry.itemCounts.set(it.name, (entry.itemCounts.get(it.name) || 0) + (Number(it.qtyBox) || 1));
    }
    mitraAccMap.set(idKey, entry);
  }

  for (const trx of transactions) {
    if (!trx || trx.status === 'Dibatalkan' || trx.status === 'Diretur') continue;
    if (trx.type !== 'MITRA' && trx.type !== 'FAKTUR_PENJUALAN') continue;
    if (filters.branchId !== 'ALL' && trx.branchId && trx.branchId !== filters.branchId) continue;
    const matched = Array.from(mitraAccMap.values()).find(
      (m) => m.name.toLowerCase() === String(trx.customerName || '').trim().toLowerCase()
    );
    const idKey = matched?.id || `MTR-NAME:${trx.customerName}`;
    const entry = matched || {
      id: idKey,
      name: trx.customerName || 'Mitra',
      category: 'Mitra B2B',
      phone: trx.customerPhone || '',
      orderCount: 0,
      invoiceCount: 0,
      totalSpent: 0,
      lastOrderDate: '',
      itemCounts: new Map<string, number>()
    };
    entry.invoiceCount += 1;
    entry.totalSpent += Math.max(0, Number(trx.total) || 0);
    const ymd = extractDateOnly(trx.date);
    if (ymd && ymd > entry.lastOrderDate) entry.lastOrderDate = ymd;
    for (const it of trx.items || []) {
      if (!isServiceFeeLineItem(it)) {
        entry.itemCounts.set(it.name, (entry.itemCounts.get(it.name) || 0) + (Number(it.qty) || 1));
      }
    }
    mitraAccMap.set(idKey, entry);
  }

  const mitraInsights: MitraInsightRow[] = Array.from(mitraAccMap.values())
    .map((m) => {
      const daysSince = m.lastOrderDate ? diffDaysBetween(m.lastOrderDate, referenceTodayYmd) : null;
      const topOrderedItems = Array.from(m.itemCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);
      const segmentStatus: MitraInsightRow['segmentStatus'] =
        m.orderCount === 0 && m.invoiceCount === 0
          ? 'Belum Ada Transaksi'
          : daysSince !== null && daysSince > 30
          ? 'Perlu Follow-Up (>30 Hari)'
          : 'Aktif Rutin';
      return {
        id: m.id,
        name: m.name,
        category: m.category,
        phone: m.phone,
        orderCount: m.orderCount,
        invoiceCount: m.invoiceCount,
        totalSpent: m.totalSpent,
        lastOrderDate: m.lastOrderDate,
        daysSinceLastOrder: daysSince,
        topOrderedItems,
        segmentStatus
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent || b.orderCount - a.orderCount);

  // Build Data Reliability Metadata & Gap Alerts
  const totalMedicinesInScope = scopedMedicines.length;
  const masterCompletenessRatio =
    totalMedicinesInScope > 0
      ? ((totalMedicinesInScope - missingHppCount / 2 - missingExpDateCount / 2) / totalMedicinesInScope) * 100
      : 0;
  const txSampleWeight = validTxCount >= 5 ? 100 : (validTxCount / 5) * 100;
  const completenessPct = Math.max(
    0,
    Math.min(100, Math.round(masterCompletenessRatio * 0.6 + txSampleWeight * 0.4))
  );

  const dataGaps: DataGapItem[] = [];
  if (missingHppCount > 0) {
    dataGaps.push({
      id: 'missing-hpp',
      severity: 'warning',
      label: 'Item Master Obat Belum Memiliki HPP (> 0)',
      count: missingHppCount,
      detail: 'Margin kotor produk terkait dihitung 0% atau mengandalkan HPP pada riwayat keranjang POS hingga HPP master diisi.'
    });
  }
  if (missingExpDateCount > 0 || missingBatchNoCount > 0) {
    dataGaps.push({
      id: 'missing-batch-ed',
      severity: 'warning',
      label: 'Produk Belum Memiliki Batch / Tanggal Kedaluwarsa',
      count: Math.max(missingExpDateCount, missingBatchNoCount),
      detail: 'Analisis risiko ED & strategi clearance tidak dapat mendeteksi kedaluwarsa item yang belum memiliki tanggal ED.'
    });
  }
  if (unlinkedPatientTxCount > 0) {
    dataGaps.push({
      id: 'unlinked-rm',
      severity: 'info',
      label: 'Transaksi Walk-In / Reguler Tanpa No. RM Pasien',
      count: unlinkedPatientTxCount,
      detail: 'Transaksi tetap dihitung pada omset & pergerakan produk, namun tidak masuk metrik tingkat repeat pasien.'
    });
  }
  if (excludedCancelledCount + excludedReturnedCount > 0) {
    dataGaps.push({
      id: 'excluded-void',
      severity: 'info',
      label: 'Transaksi Batal / Retur Dikecualikan Otomatis',
      count: excludedCancelledCount + excludedReturnedCount,
      detail: `${excludedCancelledCount} transaksi Dibatalkan dan ${excludedReturnedCount} Diretur dikeluarkan dari omset bersih agar bebas salah hitung.`
    });
  }
  if (validTxCount === 0) {
    dataGaps.push({
      id: 'empty-tx',
      severity: 'critical',
      label: 'Belum Ada Transaksi Penjualan Valid pada Periode Ini',
      count: 0,
      detail: 'Perluas rentang tanggal atau cek koneksi sinkronisasi Supabase / transaksi kasir POS.'
    });
  }

  const pendingMitraOrdersCount = mitraOrders.filter(
    (o) => o.status === 'Pending' || o.status === 'Dikonfirmasi' || o.status === 'Diproses'
  ).length;
  const activeDiscountsCount = salesDiscounts.filter((d) => d.isActive).length;
  const activePromosCount = promoAds.filter((p) => p.isActive).length;

  const statusLabel: MarketingReliabilityMeta['statusLabel'] =
    validTxCount < 3
      ? 'Sampel Transaksi Terbatas'
      : missingHppCount > totalMedicinesInScope * 0.25 || missingExpDateCount > totalMedicinesInScope * 0.25
      ? 'Sebagian Data Master Perlu Dilengkapi'
      : 'Data Lengkap & Andal';

  // Deterministic Actionable Recommendations
  const recommendations: MarketingRecommendation[] = [];

  // 1. Safe Clinical Bundling Recommendations
  const safePairs = basketPairs.filter((b) => b.clinicalSafety.safeForOtcBundling).slice(0, 3);
  for (const pair of safePairs) {
    recommendations.push({
      id: `REC-BUNDLE-${pair.pairKey}`,
      strategyType: 'BUNDLING_KLINIS',
      priority: 'Tinggi',
      title: `Paket Bundling Aman: ${pair.itemAName} + ${pair.itemBName}`,
      subtitle: `Dibeli bersamaan pada ${pair.coCount} transaksi (Support ${pair.supportPct.toFixed(1)}%, Confidence ${Math.max(pair.confidenceAtoB, pair.confidenceBtoA).toFixed(0)}%)`,
      dataBasis: `Pasangan produk bebas interaksi obat & non-antibiotik/NAPPZA dengan rata-rata margin Rp ${Math.round(pair.combinedUnitMarginRp).toLocaleString('id-ID')}/paket.`,
      targetChannel: 'REGULER',
      targetMedicineIds: [pair.itemAId, pair.itemBId].filter(Boolean),
      targetMedicineNames: [pair.itemAName, pair.itemBName],
      suggestedDiscountPct: 5,
      suggestedPromoTitle: `Paket Hemat ${pair.itemAName.split(' ')[0]} & ${pair.itemBName.split(' ')[0]}`,
      actionKind: 'PROMO_DISKON'
    });
  }

  // 2. Near-ED / Slow Moving Clearance
  const nearEdTargets = products
    .filter(
      (p) =>
        p.stock > 0 &&
        !p.isRestrictedRx &&
        ((p.daysToNearestExp !== null && p.daysToNearestExp > 0 && p.daysToNearestExp <= nearEdWindowDays) ||
          (p.movementClass === 'DEAD' && p.stockAssetValueHpp > 0))
    )
    .sort((a, b) => (a.daysToNearestExp ?? 9999) - (b.daysToNearestExp ?? 9999) || b.stockAssetValueHpp - a.stockAssetValueHpp)
    .slice(0, 4);

  if (nearEdTargets.length > 0) {
    const first = nearEdTargets[0];
    const totalValueAtRisk = nearEdTargets.reduce((s, p) => s + p.stockAssetValueHpp, 0);
    recommendations.push({
      id: `REC-CLEARANCE-${first.id}`,
      strategyType: 'CLEARANCE_SLOW_ED',
      priority: first.daysToNearestExp !== null && first.daysToNearestExp <= 60 ? 'Tinggi' : 'Sedang',
      title: `Akselerasi Slow/Near-ED (${nearEdTargets.length} Item Non-Resep)`,
      subtitle: `${first.name} (${first.stock} ${first.unitSmall}${first.daysToNearestExp !== null ? `, ED ${first.daysToNearestExp} hari lagi` : ', Stagnan'}) · Nilai aset Rp ${Math.round(totalValueAtRisk).toLocaleString('id-ID')}`,
      dataBasis: `Hanya menyertakan produk OTC/Alkes/Suplemen bebas regulasi resep dengan stok aktif dan perputaran lambat/mendekati ED.`,
      targetChannel: 'ALL',
      targetMedicineIds: nearEdTargets.map((t) => t.id),
      targetMedicineNames: nearEdTargets.map((t) => t.name),
      suggestedDiscountPct: 10,
      suggestedPromoTitle: `Penawaran Khusus Stok Terbatas (${nearEdTargets.length} Item)`,
      actionKind: 'PROMO_DISKON'
    });
  }

  // 3. Fast-Moving Critical Restock
  const criticalFastItems = products
    .filter(
      (p) =>
        p.movementClass === 'FAST' &&
        (p.stock <= p.minStock || (p.daysOfInventory !== null && p.daysOfInventory <= 10))
    )
    .sort((a, b) => (a.daysOfInventory ?? 999) - (b.daysOfInventory ?? 999) || b.revenue - a.revenue)
    .slice(0, 8);

  if (criticalFastItems.length > 0) {
    const topFast = criticalFastItems[0];
    recommendations.push({
      id: 'REC-RESTOK-FAST',
      strategyType: 'RESTOK_FAST_MOVING',
      priority: 'Tinggi',
      title: `Cegah Lost Sales: ${criticalFastItems.length} Produk Fast Moving Stok Menipis`,
      subtitle: `${topFast.name} tersisa ${topFast.stock} ${topFast.unitSmall}${topFast.daysOfInventory !== null ? ` (estimasi habis ${topFast.daysOfInventory} hari)` : ''}`,
      dataBasis: `Dihitung dari laju penjualan harian (${topFast.avgDailyQtySmall.toFixed(1)} ${topFast.unitSmall}/hari) dibanding stok aktual.`,
      targetChannel: 'ALL',
      targetMedicineIds: criticalFastItems.map((i) => i.id),
      targetMedicineNames: criticalFastItems.map((i) => i.name),
      actionKind: 'DRAFT_PO'
    });
  }

  // 4. Repeat Patient & Chronic Control Reminder
  const followUpPatients = patientInsights.filter((p) => p.needsControlFollowUp).slice(0, 5);
  if (followUpPatients.length > 0) {
    const topPat = followUpPatients[0];
    recommendations.push({
      id: 'REC-REPEAT-PASIEN',
      strategyType: 'REPEAT_PASIEN',
      priority: 'Sedang',
      title: `Pengingat Kontrol & Repeat Terapi (${followUpPatients.length} Pasien)`,
      subtitle: `Prioritas: ${topPat.name} (${topPat.rmId}) · terakhir berkunjung ${topPat.daysSinceLastVisit} hari lalu`,
      dataBasis: `Pasien kunjungan berulang/indikasi kronis (${topPat.topDiagnosis}) yang melewati siklus 21–30 hari.`,
      targetChannel: 'KLINIK',
      targetMedicineIds: [],
      targetMedicineNames: [],
      targetPatientRmIds: followUpPatients.map((p) => p.rmId),
      suggestedFollowUpText: `Halo Bapak/Ibu ${topPat.name}, dari Klinik & Apotek kami mengingatkan jadwal kontrol/evaluasi terapi rutin Anda. Bila ingin menjadwalkan kunjungan atau konsultasi ketersediaan obat, silakan balas pesan ini.`,
      actionKind: 'FOLLOWUP_CHAT'
    });
  }

  // 5. Mitra Re-Order Outreach
  const targetMitraList = mitraInsights
    .filter((m) => m.segmentStatus !== 'Aktif Rutin' || m.orderCount > 0)
    .sort((a, b) => (b.daysSinceLastOrder ?? 999) - (a.daysSinceLastOrder ?? 999))
    .slice(0, 5);
  if (targetMitraList.length > 0) {
    const firstMitra = targetMitraList[0];
    recommendations.push({
      id: 'REC-MITRA-REORDER',
      strategyType: 'REORDER_MITRA',
      priority: firstMitra.segmentStatus === 'Perlu Follow-Up (>30 Hari)' ? 'Tinggi' : 'Sedang',
      title: `Aktivasi Order Mitra B2B (${targetMitraList.length} Faskes Target)`,
      subtitle: `${firstMitra.name} · ${firstMitra.segmentStatus}${firstMitra.daysSinceLastOrder !== null ? ` (${firstMitra.daysSinceLastOrder} hari sejak order terakhir)` : ''}`,
      dataBasis: `Analisis riwayat pesanan Portal Mitra & Faktur Penjualan B2B terhadap harga tier Mitra aktif.`,
      targetChannel: 'PORTAL_MITRA',
      targetMedicineIds: [],
      targetMedicineNames: firstMitra.topOrderedItems,
      targetMitraIds: targetMitraList.map((m) => m.id),
      suggestedPromoTitle: 'Program Re-Order Mitra Faskes',
      suggestedFollowUpText: `Halo Tim Pengadaan ${firstMitra.name}, kami informasikan stok & penawaran harga khusus Mitra di Portal Order Mitra Online sudah diperbarui${firstMitra.topOrderedItems.length > 0 ? ` termasuk ${firstMitra.topOrderedItems.join(', ')}` : ''}. Silakan lakukan pemesanan melalui Portal Mitra.`,
      actionKind: 'PORTAL_MITRA'
    });
  }

  // Portal Order Mandiri Dual-Room Analytics (Ruang Order Reguler/Umum vs Ruang Order Mitra)
  const makeEmptyRoomSummary = (room: PortalOrderRoom, roomLabel: string): PortalRoomAnalyticsSummary => ({
    room,
    roomLabel,
    views: 0,
    cartAdds: 0,
    checkoutStarts: 0,
    rxPrompts: 0,
    rxUploads: 0,
    lockedAttempts: 0,
    ordersSubmitted: 0,
    convertedOrders: 0,
    pendingOrders: 0,
    portalRevenue: 0,
    unconvertedRevenue: 0
  });

  const regulerPortal = makeEmptyRoomSummary('REGULER', 'Ruang Order Reguler / Umum');
  const mitraPortal = makeEmptyRoomSummary('MITRA', 'Ruang Order Mitra');
  const portalProdMap = new Map<string, TopPortalProductRow>();

  const ensurePortalProd = (
    medId: string,
    medName: string,
    category?: string,
    rxLabel?: string
  ): TopPortalProductRow => {
    const key = medId || `NAME:${medName.trim().toLowerCase()}`;
    const existing = portalProdMap.get(key);
    if (existing) {
      if (rxLabel && !existing.rxRequirementLabel) existing.rxRequirementLabel = rxLabel;
      return existing;
    }
    const matched = resolveMed(medId, medName);
    const created: TopPortalProductRow = {
      medicineId: matched?.id || medId || key,
      medicineName: matched?.name || medName || 'Produk Portal',
      category: category || matched?.category || 'Umum',
      regulerViews: 0,
      regulerCartAdds: 0,
      regulerOrderedQty: 0,
      mitraViews: 0,
      mitraCartAdds: 0,
      mitraLockedClicks: 0,
      mitraOrderedQty: 0,
      totalInteractions: 0,
      rxRequirementLabel: rxLabel
    };
    portalProdMap.set(key, created);
    return created;
  };

  let totalEventsInPeriod = 0;
  for (const ev of portalActivityLogs) {
    if (!ev) continue;
    const evYmd = extractDateOnly(ev.createdAt);
    if (!evYmd || evYmd < period.startDate || evYmd > period.endDate) continue;
    totalEventsInPeriod += 1;
    const target = ev.room === 'MITRA' ? mitraPortal : regulerPortal;
    if (ev.eventType === 'VIEW_PRODUCT') target.views += 1;
    else if (ev.eventType === 'ADD_TO_CART') target.cartAdds += 1;
    else if (ev.eventType === 'CHECKOUT_STARTED') target.checkoutStarts += 1;
    else if (ev.eventType === 'RX_REQUIRED_PROMPT') target.rxPrompts += 1;
    else if (ev.eventType === 'RX_UPLOADED') target.rxUploads += 1;
    else if (ev.eventType === 'LOCKED_MITRA_ATTEMPT') target.lockedAttempts += 1;

    if (ev.medicineId || ev.medicineName) {
      const row = ensurePortalProd(
        ev.medicineId || '',
        ev.medicineName || '',
        ev.medicineCategory,
        ev.rxRequirementLabel
      );
      if (ev.room === 'MITRA') {
        if (ev.eventType === 'VIEW_PRODUCT') row.mitraViews += 1;
        else if (ev.eventType === 'ADD_TO_CART') row.mitraCartAdds += Math.max(1, Number(ev.qty) || 1);
        else if (ev.eventType === 'LOCKED_MITRA_ATTEMPT') row.mitraLockedClicks += 1;
      } else {
        if (ev.eventType === 'VIEW_PRODUCT') row.regulerViews += 1;
        else if (ev.eventType === 'ADD_TO_CART') row.regulerCartAdds += Math.max(1, Number(ev.qty) || 1);
      }
      row.totalInteractions += 1;
    }
  }

  let totalPortalOrdersInPeriod = 0;
  for (const ord of mitraOrders) {
    if (!ord || ord.status === 'Dibatalkan') continue;
    if (filters.branchId !== 'ALL' && ord.branchId && ord.branchId !== filters.branchId) continue;
    const ordYmd = extractDateOnly(ord.createdAt);
    if (!ordYmd || ordYmd < period.startDate || ordYmd > period.endDate) continue;
    totalPortalOrdersInPeriod += 1;

    const ordRoom: PortalOrderRoom =
      ord.orderRoom || (String(ord.orderCode || '').startsWith('REG-') ? 'REGULER' : 'MITRA');
    const target = ordRoom === 'MITRA' ? mitraPortal : regulerPortal;
    const ordAmt = Math.max(0, Number(ord.totalAmount) || 0);
    target.ordersSubmitted += 1;
    target.portalRevenue += ordAmt;
    if (ord.convertedTrxId || ord.status === 'Selesai') {
      target.convertedOrders += 1;
    } else {
      target.pendingOrders += 1;
      target.unconvertedRevenue += ordAmt;
    }

    for (const it of ord.items || []) {
      const row = ensurePortalProd(it.medicineId, it.name, it.category, it.rxRequirementLabel);
      const qty = Math.max(1, Number(it.qtyBox) || 1);
      if (ordRoom === 'MITRA') {
        row.mitraOrderedQty += qty;
      } else {
        row.regulerOrderedQty += qty;
      }
      row.totalInteractions += qty;
    }
  }

  const topPortalProducts = Array.from(portalProdMap.values())
    .sort((a, b) => b.totalInteractions - a.totalInteractions || (b.regulerOrderedQty + b.mitraOrderedQty) - (a.regulerOrderedQty + a.mitraOrderedQty))
    .slice(0, 12);

  const portalMetrics: PortalMarketingMetrics = {
    totalEventsInPeriod,
    totalOrdersInPeriod: totalPortalOrdersInPeriod,
    totalPortalRevenue: regulerPortal.portalRevenue + mitraPortal.portalRevenue,
    reguler: regulerPortal,
    mitra: mitraPortal,
    topPortalProducts
  };

  if (mitraPortal.lockedAttempts > 0) {
    recommendations.push({
      id: 'REC-PORTAL-MITRA-LEADS',
      strategyType: 'REORDER_MITRA',
      priority: mitraPortal.lockedAttempts >= 3 ? 'Tinggi' : 'Sedang',
      title: `Konversi Prospek Mitra Portal (${mitraPortal.lockedAttempts} Klik Produk Terkunci)`,
      subtitle: `Tercatat ${mitraPortal.lockedAttempts} percobaan pilih produk di Ruang Order Mitra oleh pengunjung belum terverifikasi`,
      dataBasis: `Data interaksi langsung Ruang Order Mitra pada periode ${period.label}. Fasilitasi onboarding mitra baru melalui tautan "Jadi Mitra".`,
      targetChannel: 'PORTAL_MITRA',
      targetMedicineIds: [],
      targetMedicineNames: topPortalProducts
        .filter((p) => p.mitraLockedClicks > 0)
        .slice(0, 3)
        .map((p) => p.medicineName),
      suggestedPromoTitle: 'Program Onboarding Mitra Faskes Baru',
      suggestedFollowUpText:
        'Halo Klinik/Apotek Mitra, terima kasih telah mengunjungi Portal Order Mitra Latisha Farma. Silakan lengkapi registrasi mitra melalui tombol "Jadi Mitra" untuk mengaktifkan harga khusus grosir & tombol Pilih Produk.',
      actionKind: 'PORTAL_MITRA'
    });
  }

  const highInterestPortalOtc = topPortalProducts.filter((p) => {
    const med = medById.get(p.medicineId);
    const restricted = med
      ? getMedicinePrescriptionRequirement(med).requiresRx
      : Boolean(p.rxRequirementLabel);
    return !restricted && p.regulerViews + p.regulerCartAdds >= 2 && p.regulerOrderedQty === 0;
  });
  if (highInterestPortalOtc.length > 0) {
    const firstP = highInterestPortalOtc[0];
    recommendations.push({
      id: `REC-PORTAL-REG-${firstP.medicineId}`,
      strategyType: 'PROMO_UMUM',
      priority: 'Sedang',
      title: `Dorong Konversi Portal Reguler: ${firstP.medicineName}`,
      subtitle: `Diminati (${firstP.regulerViews} lihat, ${firstP.regulerCartAdds} keranjang) namun belum checkout pada periode ini`,
      dataBasis: `Sinyal minat produk non-resep dari Ruang Order Reguler/Umum Portal Order Mandiri.`,
      targetChannel: 'REGULER',
      targetMedicineIds: highInterestPortalOtc.slice(0, 3).map((p) => p.medicineId),
      targetMedicineNames: highInterestPortalOtc.slice(0, 3).map((p) => p.medicineName),
      suggestedDiscountPct: 5,
      suggestedPromoTitle: `Promo Checkout Portal Reguler (${firstP.medicineName.split(' ')[0]})`,
      actionKind: 'PROMO_DISKON'
    });
  }

  const totalGrossProfit = totalRevenue - totalCogs;
  const avgBasketValue = validTxCount > 0 ? totalRevenue / validTxCount : 0;
  const grossMarginPct = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

  return {
    reliability: {
      snapshotAt: new Date().toISOString(),
      periodStart: period.startDate,
      periodEnd: period.endDate,
      periodLabel: period.label,
      dayCount: period.dayCount,
      totalTransactionsRaw,
      validTransactionsCount: validTxCount,
      excludedCancelledCount,
      excludedReturnedCount,
      totalLineItems,
      productLineItemsCount,
      serviceLineItemsCount,
      uniqueProductsSold: sellingRows.length,
      totalMedicinesInScope,
      missingHppCount,
      missingExpDateCount,
      missingBatchNoCount,
      missingCategoryCount,
      unlinkedPatientTxCount,
      totalPatientsCount: patients.length,
      totalMitraCount: mitraList.length,
      pendingMitraOrdersCount,
      activeDiscountsCount,
      activePromosCount,
      completenessPct,
      statusLabel,
      dataGaps,
      movementRuleSummary: {
        fastQtyThreshold,
        fastFreqThreshold,
        medianMarginPct,
        velocityThreshold: fastQtyThreshold
      }
    },
    kpis: {
      totalRevenue,
      productRevenue,
      serviceRevenue,
      totalCogs,
      totalGrossProfit,
      grossMarginPct,
      txCount: validTxCount,
      avgBasketValue,
      totalUnitsSoldSmall,
      clinicVisitCount,
      mitraRevenue,
      repeatPatientRatePct,
      uniqueIdentifiedCustomers,
      repeatIdentifiedCustomers,
      nearEdAssetValueHpp,
      deadStockAssetValueHpp
    },
    products,
    movementCounts,
    quadrantCounts,
    basketPairs,
    dailyTrends,
    dayOfWeekTrends,
    hourTrends,
    hasTimestampHours,
    channelBreakdown,
    categoryBreakdown,
    patientInsights,
    mitraInsights,
    portalMetrics,
    recommendations
  };
}

export function evaluateCampaignImpact(params: {
  campaign: MarketingCampaign;
  transactions: Transaction[];
  medicines: Medicine[];
  branchId?: string;
  referenceTodayYmd?: string;
}): CampaignImpactEvaluation {
  const {
    campaign,
    transactions,
    medicines,
    branchId = 'ALL',
    referenceTodayYmd = toLocalDateString()
  } = params;

  const activatedYmd = extractDateOnly(campaign.activatedAt) || referenceTodayYmd;
  const windowDays = Math.max(1, Math.min(90, Number(campaign.baselineDays) || 14));

  const beforeStart = addDaysYmd(activatedYmd, -windowDays);
  const beforeEnd = addDaysYmd(activatedYmd, -1);
  const afterStart = activatedYmd;
  const theoreticalAfterEnd = addDaysYmd(activatedYmd, windowDays - 1);
  const afterEnd = theoreticalAfterEnd < referenceTodayYmd ? theoreticalAfterEnd : referenceTodayYmd;

  const medById = new Map<string, Medicine>();
  for (const m of medicines) {
    if (m.id) medById.set(m.id, m);
  }

  const targetChannelMatch = (trxType: string): boolean => {
    if (!campaign.targetChannel || campaign.targetChannel === 'ALL') return true;
    if (campaign.targetChannel === 'PORTAL_MITRA') {
      return trxType === 'MITRA' || trxType === 'FAKTUR_PENJUALAN';
    }
    return trxType === campaign.targetChannel;
  };

  const aggregateWindow = (startYmd: string, endYmd: string): CampaignImpactSnapshot => {
    let revenue = 0;
    let cogs = 0;
    let txCount = 0;

    if (startYmd <= endYmd) {
      for (const trx of transactions) {
        if (!trx || trx.status === 'Dibatalkan' || trx.status === 'Diretur') continue;
        if (branchId !== 'ALL' && trx.branchId && trx.branchId !== branchId) continue;
        if (!targetChannelMatch(trx.type)) continue;
        const ymd = extractDateOnly(trx.date);
        if (!ymd || ymd < startYmd || ymd > endYmd) continue;

        txCount += 1;
        revenue += Math.max(0, Number(trx.total) || 0);

        let trxCogs = 0;
        for (const item of trx.items || []) {
          if (isServiceFeeLineItem(item)) continue;
          const med = item.id ? medById.get(item.id) : undefined;
          trxCogs += computeLineItemSmallQtyAndCogs(item, med).lineCogs;
        }
        cogs += trxCogs > 0 ? trxCogs : Math.max(0, Number(trx.hppTotal) || 0);
      }
    }

    const daysObserved =
      startYmd <= endYmd ? Math.max(1, (diffDaysBetween(startYmd, endYmd) ?? 0) + 1) : 0;
    const grossProfit = revenue - cogs;
    const avgBasket = txCount > 0 ? revenue / txCount : 0;
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const dailyRunRateRevenue = daysObserved > 0 ? revenue / daysObserved : 0;

    return {
      revenue,
      txCount,
      avgBasket,
      grossProfit,
      grossMarginPct,
      dailyRunRateRevenue,
      daysObserved,
      startDate: startYmd,
      endDate: endYmd
    };
  };

  const before = aggregateWindow(beforeStart, beforeEnd);
  const after = aggregateWindow(afterStart, afterEnd);

  const revenueDeltaRp = after.revenue - before.revenue;
  const revenueDeltaPct = before.revenue > 0 ? ((after.revenue - before.revenue) / before.revenue) * 100 : null;
  const dailyRunRateDeltaPct =
    before.dailyRunRateRevenue > 0
      ? ((after.dailyRunRateRevenue - before.dailyRunRateRevenue) / before.dailyRunRateRevenue) * 100
      : null;
  const txDeltaPct = before.txCount > 0 ? ((after.txCount - before.txCount) / before.txCount) * 100 : null;
  const aovDeltaPct =
    before.avgBasket > 0 ? ((after.avgBasket - before.avgBasket) / before.avgBasket) * 100 : null;
  const marginPctPointDelta = after.grossMarginPct - before.grossMarginPct;

  return {
    campaignId: campaign.id,
    before,
    after,
    revenueDeltaRp,
    revenueDeltaPct,
    dailyRunRateDeltaPct,
    txDeltaPct,
    aovDeltaPct,
    marginPctPointDelta,
    hasSufficientComparisonData: before.txCount > 0 || after.txCount > 0
  };
}
