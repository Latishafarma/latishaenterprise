import {
  FeeConfig,
  Pph21StaffBreakdown,
  PphAuditEntry,
  PphMixedTransactionExclusionItem,
  PphMonthlySnapshot,
  PphProductSalesBreakdown,
  PtkpStatus,
  Staff,
  StaffAttendanceRecord,
  StaffFeeLedgerEntry,
  StaffTaxCategory,
  TaxScopeMode,
  TerCategory,
  Transaction,
  WpOpTaxConfig,
  WpOpTaxScheme,
  DutySchedule
} from '../types';
import { demoGetItem, demoSetItem } from './demoSandbox';
import { isJasaCartItem } from './transactionPrintHelper';
import {
  normalizeTransactionDateToYMD,
  resolveTransactionStaffFees
} from './serviceFeeHelper';
import { getDeletedIdsSet } from './deletionRegistry';
import {
  buildStaffPayrollSummary,
  loadLocalPayrollConfig
} from './payrollService';
import { loadLocalAttendanceRecords } from './attendanceService';

export const PPH_CONFIG_STORAGE_KEY = 'latisha_pph_wpop_config';
export const PPH_SNAPSHOTS_STORAGE_KEY = 'latisha_pph_wpop_snapshots';
export const PPH_AUDIT_STORAGE_KEY = 'latisha_pph_wpop_audit';

export const UMKM_FREE_THRESHOLD_500M = 500_000_000;
export const UMKM_ANNUAL_LIMIT_48B = 4_800_000_000;
export const UMKM_FINAL_RATE = 0.005; // 0,5%

export const PTKP_OPTIONS: { value: PtkpStatus; label: string; annualAmount: number; terCategory: TerCategory }[] = [
  { value: 'TK/0', label: 'TK/0 — Tidak Kawin, 0 Tanggungan (Rp 54 jt)', annualAmount: 54_000_000, terCategory: 'A' },
  { value: 'TK/1', label: 'TK/1 — Tidak Kawin, 1 Tanggungan (Rp 58,5 jt)', annualAmount: 58_500_000, terCategory: 'A' },
  { value: 'TK/2', label: 'TK/2 — Tidak Kawin, 2 Tanggungan (Rp 63 jt)', annualAmount: 63_000_000, terCategory: 'B' },
  { value: 'TK/3', label: 'TK/3 — Tidak Kawin, 3 Tanggungan (Rp 67,5 jt)', annualAmount: 67_500_000, terCategory: 'B' },
  { value: 'K/0', label: 'K/0 — Kawin, 0 Tanggungan (Rp 58,5 jt)', annualAmount: 58_500_000, terCategory: 'A' },
  { value: 'K/1', label: 'K/1 — Kawin, 1 Tanggungan (Rp 63 jt)', annualAmount: 63_000_000, terCategory: 'B' },
  { value: 'K/2', label: 'K/2 — Kawin, 2 Tanggungan (Rp 67,5 jt)', annualAmount: 67_500_000, terCategory: 'B' },
  { value: 'K/3', label: 'K/3 — Kawin, 3 Tanggungan (Rp 72 jt)', annualAmount: 72_000_000, terCategory: 'C' }
];

export const DEFAULT_WPOP_TAX_CONFIG: WpOpTaxConfig = {
  id: 'MAIN-WPOP-TAX-CONFIG',
  scheme: 'umkm_final',
  scopeMode: 'gabungan_wpop',
  ownerName: 'apt. Mardin, S.Farm',
  ownerNpwpNik: '',
  ownerPtkpStatus: 'K/0',
  nppnRatePercent: 30,
  monthlyOperationalExpense: 0,
  includePayrollSalaryInPembukuanExpense: true,
  manualYtdPriorTurnover: 0,
  notes: ''
};

export function getPtkpAnnualAmount(status?: PtkpStatus | string): number {
  const found = PTKP_OPTIONS.find((o) => o.value === status);
  return found ? found.annualAmount : 54_000_000;
}

export function getTerCategoryForPtkp(status?: PtkpStatus | string): TerCategory {
  const found = PTKP_OPTIONS.find((o) => o.value === status);
  return found ? found.terCategory : 'A';
}

// Tabel TER Bulanan PP 58 Tahun 2023 jo. PMK 168 Tahun 2023 [maxGrossInclusive, ratePercent]
const TER_TABLE_A: [number, number][] = [
  [5_400_000, 0],
  [5_650_000, 0.25],
  [5_950_000, 0.5],
  [6_300_000, 0.75],
  [6_750_000, 1.0],
  [7_500_000, 1.25],
  [8_550_000, 1.5],
  [9_650_000, 1.75],
  [10_050_000, 2.0],
  [10_350_000, 2.25],
  [10_700_000, 2.5],
  [11_050_000, 3.0],
  [11_600_000, 3.5],
  [12_500_000, 4.0],
  [13_750_000, 5.0],
  [15_100_000, 6.0],
  [16_950_000, 7.0],
  [19_750_000, 8.0],
  [24_150_000, 9.0],
  [26_450_000, 10.0],
  [28_000_000, 11.0],
  [30_050_000, 12.0],
  [32_400_000, 13.0],
  [35_400_000, 14.0],
  [39_100_000, 15.0],
  [43_850_000, 16.0],
  [47_800_000, 17.0],
  [51_400_000, 18.0],
  [56_300_000, 19.0],
  [62_200_000, 20.0],
  [68_600_000, 21.0],
  [77_500_000, 22.0],
  [89_000_000, 23.0],
  [103_000_000, 24.0],
  [125_000_000, 25.0],
  [157_000_000, 26.0],
  [206_000_000, 27.0],
  [337_000_000, 28.0],
  [454_000_000, 29.0],
  [550_000_000, 30.0],
  [695_000_000, 31.0],
  [910_000_000, 32.0],
  [1_400_000_000, 33.0],
  [Number.POSITIVE_INFINITY, 34.0]
];

const TER_TABLE_B: [number, number][] = [
  [6_200_000, 0],
  [6_500_000, 0.25],
  [6_850_000, 0.5],
  [7_300_000, 0.75],
  [9_200_000, 1.0],
  [10_750_000, 1.5],
  [11_250_000, 2.0],
  [11_600_000, 2.5],
  [12_600_000, 3.0],
  [13_600_000, 4.0],
  [14_950_000, 5.0],
  [16_400_000, 6.0],
  [18_450_000, 7.0],
  [21_850_000, 8.0],
  [26_000_000, 9.0],
  [27_700_000, 10.0],
  [29_350_000, 11.0],
  [31_450_000, 12.0],
  [33_950_000, 13.0],
  [37_100_000, 14.0],
  [41_100_000, 15.0],
  [45_800_000, 16.0],
  [49_500_000, 17.0],
  [53_800_000, 18.0],
  [58_500_000, 19.0],
  [64_000_000, 20.0],
  [71_000_000, 21.0],
  [80_000_000, 22.0],
  [93_000_000, 23.0],
  [109_000_000, 24.0],
  [129_000_000, 25.0],
  [163_000_000, 26.0],
  [211_000_000, 27.0],
  [374_000_000, 28.0],
  [459_000_000, 29.0],
  [555_000_000, 30.0],
  [704_000_000, 31.0],
  [957_000_000, 32.0],
  [1_405_000_000, 33.0],
  [Number.POSITIVE_INFINITY, 34.0]
];

const TER_TABLE_C: [number, number][] = [
  [6_600_000, 0],
  [6_950_000, 0.25],
  [7_350_000, 0.5],
  [7_800_000, 0.75],
  [8_850_000, 1.0],
  [9_800_000, 1.25],
  [10_950_000, 1.5],
  [11_200_000, 1.75],
  [12_050_000, 2.0],
  [12_950_000, 3.0],
  [14_150_000, 4.0],
  [15_550_000, 5.0],
  [17_050_000, 6.0],
  [19_500_000, 7.0],
  [22_700_000, 8.0],
  [26_600_000, 9.0],
  [28_100_000, 10.0],
  [30_100_000, 11.0],
  [32_600_000, 12.0],
  [35_400_000, 13.0],
  [38_900_000, 14.0],
  [43_000_000, 15.0],
  [47_400_000, 16.0],
  [51_200_000, 17.0],
  [55_800_000, 18.0],
  [60_400_000, 19.0],
  [66_700_000, 20.0],
  [74_500_000, 21.0],
  [83_200_000, 22.0],
  [95_600_000, 23.0],
  [110_400_000, 24.0],
  [134_000_000, 25.0],
  [169_000_000, 26.0],
  [221_000_000, 27.0],
  [390_000_000, 28.0],
  [463_000_000, 29.0],
  [561_000_000, 30.0],
  [709_000_000, 31.0],
  [965_000_000, 32.0],
  [1_419_000_000, 33.0],
  [Number.POSITIVE_INFINITY, 34.0]
];

export function lookupTerRatePercent(monthlyGross: number, terCategory: TerCategory): number {
  const gross = Math.max(0, Number(monthlyGross) || 0);
  if (gross <= 0) return 0;
  const table =
    terCategory === 'C' ? TER_TABLE_C : terCategory === 'B' ? TER_TABLE_B : TER_TABLE_A;
  for (const [upper, rate] of table) {
    if (gross <= upper) return rate;
  }
  return 34.0;
}

/**
 * Tarif Progresif Pasal 17 UU HPP (UU No. 7 Tahun 2021)
 */
export function calculatePasal17AnnualTax(annualTaxableIncome: number): {
  tax: number;
  effectiveBracketLabel: string;
} {
  const roundedPkp = Math.max(0, Math.floor((Number(annualTaxableIncome) || 0) / 1000) * 1000);
  if (roundedPkp <= 0) {
    return { tax: 0, effectiveBracketLabel: 'PKP ≤ Rp 0 (0%)' };
  }

  let tax = 0;
  let remaining = roundedPkp;

  const layer1 = Math.min(remaining, 60_000_000);
  tax += layer1 * 0.05;
  remaining -= layer1;

  if (remaining > 0) {
    const layer2 = Math.min(remaining, 190_000_000); // 60jt - 250jt
    tax += layer2 * 0.15;
    remaining -= layer2;
  }

  if (remaining > 0) {
    const layer3 = Math.min(remaining, 250_000_000); // 250jt - 500jt
    tax += layer3 * 0.25;
    remaining -= layer3;
  }

  if (remaining > 0) {
    const layer4 = Math.min(remaining, 4_500_000_000); // 500jt - 5M
    tax += layer4 * 0.30;
    remaining -= layer4;
  }

  if (remaining > 0) {
    tax += remaining * 0.35; // > 5M
  }

  const label =
    roundedPkp <= 60_000_000
      ? 'Lapisan 1 (5%)'
      : roundedPkp <= 250_000_000
      ? 'Progresif 5%–15%'
      : roundedPkp <= 500_000_000
      ? 'Progresif 5%–25%'
      : roundedPkp <= 5_000_000_000
      ? 'Progresif 5%–30%'
      : 'Progresif 5%–35%';

  return { tax: Math.round(tax), effectiveBracketLabel: label };
}

export interface TransactionProductExtractionResult {
  grossTotal: number;
  productAmount: number;
  excludedJasaAmount: number;
  excludedServiceCharge: number;
  discountAllocatedToProduct: number;
  productHpp: number;
  hasMixedOrJasa: boolean;
}

/**
 * Memisahkan secara ketat penjualan produk dari komponen jasa/layanan pada 1 transaksi POS.
 * Komponen jasa (item JASA-* / unit Layanan) dan serviceCharge dikeluarkan sepenuhnya dari dasar PPh Penjualan Produk.
 */
export function extractProductSalesFromTransaction(
  trx: Transaction
): TransactionProductExtractionResult {
  const items = Array.isArray(trx.items) ? trx.items : [];
  const serviceCharge = Math.max(0, Number(trx.serviceCharge) || 0);
  const overallDiscount = Math.max(0, Number(trx.discount) || 0);

  if (items.length === 0) {
    // Fallback apabila ada transaksi ringkas tanpa detail items
    const grossFallback = Math.max(0, Number(trx.total) || Number(trx.subtotal) || 0);
    const assignedStaffFees = Array.isArray(trx.assignedStaff)
      ? trx.assignedStaff.reduce((s, a) => s + Math.max(0, Number(a.fee) || 0), 0)
      : 0;
    const excludedJasa = trx.type === 'KLINIK' ? assignedStaffFees : 0;
    const productAmount = Math.max(0, grossFallback - excludedJasa - serviceCharge);
    const hpp = Math.max(0, Number(trx.hppTotal) || 0);
    return {
      grossTotal: grossFallback,
      productAmount,
      excludedJasaAmount: excludedJasa,
      excludedServiceCharge: serviceCharge,
      discountAllocatedToProduct: 0,
      productHpp: hpp,
      hasMixedOrJasa: excludedJasa > 0 || serviceCharge > 0
    };
  }

  let productGross = 0;
  let jasaGross = 0;
  let productHpp = 0;
  let hasJasaItem = false;

  items.forEach((it) => {
    const qty = Math.max(1, Number(it.qty) || 1);
    const unitPrice = Math.max(0, Number(it.price) || 0);
    const lineSubtotal =
      it.subtotal !== undefined && it.subtotal !== null
        ? Math.max(0, Number(it.subtotal))
        : Math.max(0, unitPrice * qty + (Number(it.tuslah) || 0) - (Number(it.discount) || 0));

    if (isJasaCartItem(it)) {
      hasJasaItem = true;
      jasaGross += lineSubtotal;
    } else {
      productGross += lineSubtotal;
      productHpp += Math.max(0, (Number(it.hpp) || 0) * qty);
    }
  });

  const combinedLineGross = productGross + jasaGross;
  let discountAllocatedToProduct = 0;
  if (overallDiscount > 0 && productGross > 0) {
    if (jasaGross <= 0) {
      discountAllocatedToProduct = Math.min(productGross, overallDiscount);
    } else if (combinedLineGross > 0) {
      discountAllocatedToProduct = Math.min(
        productGross,
        Math.round(overallDiscount * (productGross / combinedLineGross))
      );
    }
  }

  const productNet = Math.max(0, productGross - discountAllocatedToProduct);
  const grossTotal = Math.max(0, Number(trx.total) || combinedLineGross + serviceCharge);

  return {
    grossTotal,
    productAmount: productNet,
    excludedJasaAmount: jasaGross,
    excludedServiceCharge: serviceCharge,
    discountAllocatedToProduct,
    productHpp,
    hasMixedOrJasa: hasJasaItem || serviceCharge > 0
  };
}

export function countMonthSpanInclusive(startDate: string, endDate: string): number {
  const s = startDate ? new Date(`${startDate.slice(0, 10)}T00:00:00`) : null;
  const e = endDate ? new Date(`${endDate.slice(0, 10)}T00:00:00`) : null;
  if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  const months =
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  return Math.max(1, Math.min(12, months));
}

export function calculateWpOpProductTax(params: {
  transactions: Transaction[];
  taxYear: number;
  periodStart: string;
  periodEnd: string;
  scopeMode: TaxScopeMode;
  branchId: string;
  config: WpOpTaxConfig;
  payrollSalaryAndOvertimeExpense?: number;
  overridePeriodProductTurnover?: number;
  overridePeriodOperationalExpense?: number;
  overrideScheme?: WpOpTaxScheme;
}): PphProductSalesBreakdown {
  const {
    transactions,
    taxYear,
    periodStart,
    periodEnd,
    scopeMode,
    branchId,
    config,
    payrollSalaryAndOvertimeExpense = 0,
    overridePeriodProductTurnover,
    overridePeriodOperationalExpense,
    overrideScheme
  } = params;

  const scheme = overrideScheme || config.scheme;
  const ytdStart = `${taxYear}-01-01`;
  const effectiveBranchFilter = scopeMode === 'per_unit' && branchId && branchId !== 'ALL';

  let activeTransactionCount = 0;
  let cancelledOrReturnedExcludedCount = 0;
  let totalGrossTransactions = 0;
  let excludedJasaServiceAmount = 0;
  let excludedServiceChargeAmount = 0;
  let productDiscountAllocated = 0;
  let computedProductTurnoverPeriod = 0;
  let productHppPeriod = 0;

  let ytdProductBeforePeriod = Math.max(0, Number(config.manualYtdPriorTurnover) || 0);
  let globalWpOpYtdBeforePeriod = Math.max(0, Number(config.manualYtdPriorTurnover) || 0);
  let globalWpOpProductPeriod = 0;

  const mixedAndExcludedItems: PphMixedTransactionExclusionItem[] = [];

  (transactions || []).forEach((trx) => {
    const trxYmd = normalizeTransactionDateToYMD(trx.date);
    if (!trxYmd) return;

    const isCancelledOrReturned =
      trx.status === 'Dibatalkan' || trx.status === 'Diretur';

    const trxBranch = trx.branchId || 'BR-01';
    const matchesBranch = !effectiveBranchFilter || trxBranch === branchId;
    const inPeriod = trxYmd >= periodStart && trxYmd <= periodEnd;
    const inYtdBeforePeriod = trxYmd >= ytdStart && trxYmd < periodStart;

    if (isCancelledOrReturned) {
      if (inPeriod && matchesBranch) {
        cancelledOrReturnedExcludedCount += 1;
      }
      return;
    }

    const extracted = extractProductSalesFromTransaction(trx);

    if (inYtdBeforePeriod) {
      globalWpOpYtdBeforePeriod += extracted.productAmount;
      if (matchesBranch) {
        ytdProductBeforePeriod += extracted.productAmount;
      }
    }

    if (inPeriod) {
      globalWpOpProductPeriod += extracted.productAmount;

      if (matchesBranch) {
        activeTransactionCount += 1;
        totalGrossTransactions += extracted.grossTotal;
        excludedJasaServiceAmount += extracted.excludedJasaAmount;
        excludedServiceChargeAmount += extracted.excludedServiceCharge;
        productDiscountAllocated += extracted.discountAllocatedToProduct;
        computedProductTurnoverPeriod += extracted.productAmount;
        productHppPeriod += extracted.productHpp;

        if (extracted.hasMixedOrJasa || extracted.productAmount !== extracted.grossTotal) {
          mixedAndExcludedItems.push({
            transactionId: trx.id,
            date: trx.date,
            branchId: trxBranch,
            customerName: trx.customerName || 'Reguler',
            type: trx.type || 'REGULER',
            grossTotal: extracted.grossTotal,
            productAmount: extracted.productAmount,
            excludedJasaAmount: extracted.excludedJasaAmount,
            excludedServiceCharge: extracted.excludedServiceCharge,
            discountAllocatedToProduct: extracted.discountAllocatedToProduct,
            productHpp: extracted.productHpp
          });
        }
      }
    }
  });

  const productTurnoverPeriod =
    overridePeriodProductTurnover !== undefined
      ? Math.max(0, Math.round(overridePeriodProductTurnover))
      : computedProductTurnoverPeriod;

  const ytdProductTurnoverAfterPeriod = ytdProductBeforePeriod + productTurnoverPeriod;
  const globalWpOpYtdProductTurnoverAfterPeriod =
    globalWpOpYtdBeforePeriod +
    (effectiveBranchFilter
      ? globalWpOpProductPeriod - computedProductTurnoverPeriod + productTurnoverPeriod
      : productTurnoverPeriod);

  // Gunakan YTD sesuai scope yang dipilih (dan apabila Per Unit, informasi Global WP OP tetap disajikan)
  const ytdUsedForThresholdBefore =
    scopeMode === 'gabungan_wpop' ? globalWpOpYtdBeforePeriod : ytdProductBeforePeriod;
  const ytdUsedForThresholdAfter =
    scopeMode === 'gabungan_wpop'
      ? globalWpOpYtdProductTurnoverAfterPeriod
      : ytdProductTurnoverAfterPeriod;

  const freeThreshold500mUsed = Math.min(UMKM_FREE_THRESHOLD_500M, ytdUsedForThresholdAfter);
  const freeThreshold500mRemaining = Math.max(
    0,
    UMKM_FREE_THRESHOLD_500M - ytdUsedForThresholdAfter
  );
  const limit48bRemaining = Math.max(0, UMKM_ANNUAL_LIMIT_48B - ytdUsedForThresholdAfter);
  const exceedsUmkmLimit48b = ytdUsedForThresholdAfter > UMKM_ANNUAL_LIMIT_48B;

  const taxableAfter = Math.max(0, ytdUsedForThresholdAfter - UMKM_FREE_THRESHOLD_500M);
  const taxableBefore = Math.max(0, ytdUsedForThresholdBefore - UMKM_FREE_THRESHOLD_500M);
  const umkmTaxableBasePeriod = Math.max(0, taxableAfter - taxableBefore);

  const monthSpan = countMonthSpanInclusive(periodStart, periodEnd);
  const ptkpAnnual = getPtkpAnnualAmount(config.ownerPtkpStatus);
  const ptkpPeriod = Math.round((ptkpAnnual * monthSpan) / 12);

  const pembukuanOperationalExpense =
    overridePeriodOperationalExpense !== undefined
      ? Math.max(0, Math.round(overridePeriodOperationalExpense))
      : Math.max(0, Number(config.monthlyOperationalExpense) || 0) * monthSpan;

  const pembukuanPayrollSalaryExpense = config.includePayrollSalaryInPembukuanExpense
    ? Math.max(0, Math.round(payrollSalaryAndOvertimeExpense))
    : 0;

  const pembukuanNetIncomePeriod =
    productTurnoverPeriod -
    productHppPeriod -
    pembukuanOperationalExpense -
    pembukuanPayrollSalaryExpense;

  const nppnRatePercent = Math.max(1, Math.min(100, Number(config.nppnRatePercent) || 30));
  const nppnNetIncomePeriod = Math.round((productTurnoverPeriod * nppnRatePercent) / 100);

  let estimatedPphUsaha = 0;
  let pkpPeriod = 0;
  let pkpAnnualized = 0;
  let effectiveRateLabel = '0%';

  if (scheme === 'umkm_final') {
    estimatedPphUsaha = Math.round(umkmTaxableBasePeriod * UMKM_FINAL_RATE);
    effectiveRateLabel =
      umkmTaxableBasePeriod <= 0
        ? '0% (Bebas Pajak ≤ Rp 500 jt YTD)'
        : '0,5% (PP 55/2022 jo. PP 20/2026)';
  } else if (scheme === 'pasal_17_pembukuan') {
    pkpPeriod = Math.max(0, Math.floor((pembukuanNetIncomePeriod - ptkpPeriod) / 1000) * 1000);
    pkpAnnualized = Math.round((pkpPeriod * 12) / monthSpan);
    const annualRes = calculatePasal17AnnualTax(pkpAnnualized);
    estimatedPphUsaha = Math.round((annualRes.tax * monthSpan) / 12);
    effectiveRateLabel = `${annualRes.effectiveBracketLabel} (Pembukuan)`;
  } else {
    // NPPN
    pkpPeriod = Math.max(0, Math.floor((nppnNetIncomePeriod - ptkpPeriod) / 1000) * 1000);
    pkpAnnualized = Math.round((pkpPeriod * 12) / monthSpan);
    const annualRes = calculatePasal17AnnualTax(pkpAnnualized);
    estimatedPphUsaha = Math.round((annualRes.tax * monthSpan) / 12);
    effectiveRateLabel = `NPPN ${nppnRatePercent}% × ${annualRes.effectiveBracketLabel}`;
  }

  mixedAndExcludedItems.sort((a, b) => b.date.localeCompare(a.date));

  return {
    taxYear,
    scopeMode,
    branchId: scopeMode === 'gabungan_wpop' ? 'ALL' : branchId,
    scheme,
    activeTransactionCount,
    cancelledOrReturnedExcludedCount,
    totalGrossTransactions,
    excludedJasaServiceAmount,
    excludedServiceChargeAmount,
    totalExcludedJasaAndService: excludedJasaServiceAmount + excludedServiceChargeAmount,
    productDiscountAllocated,
    productTurnoverPeriod,
    productHppPeriod,
    ytdProductTurnoverBeforePeriod: ytdUsedForThresholdBefore,
    ytdProductTurnoverAfterPeriod: ytdUsedForThresholdAfter,
    globalWpOpYtdProductTurnoverAfterPeriod,
    freeThreshold500mTotal: UMKM_FREE_THRESHOLD_500M,
    freeThreshold500mUsed,
    freeThreshold500mRemaining,
    umkmTaxableBasePeriod,
    limit48bTotal: UMKM_ANNUAL_LIMIT_48B,
    limit48bRemaining,
    exceedsUmkmLimit48b,
    pembukuanOperationalExpense,
    pembukuanPayrollSalaryExpense,
    pembukuanNetIncomePeriod,
    nppnRatePercent,
    nppnNetIncomePeriod,
    ptkpAnnual,
    ptkpPeriod,
    pkpPeriod,
    pkpAnnualized,
    effectiveRateLabel,
    estimatedPphUsaha,
    mixedAndExcludedItems
  };
}

export function inferStaffTaxCategory(
  staff: Pick<Staff, 'role' | 'taxCategory'>,
  salaryActive: boolean,
  monthlyBaseSalary: number
): StaffTaxCategory {
  if (staff.taxCategory === 'pegawai_tetap' || staff.taxCategory === 'bukan_pegawai') {
    return staff.taxCategory;
  }
  if (!salaryActive || monthlyBaseSalary <= 0) {
    return 'bukan_pegawai';
  }
  if (staff.role === 'Dokter' && monthlyBaseSalary <= 0) {
    return 'bukan_pegawai';
  }
  return 'pegawai_tetap';
}

export function calculatePph21Breakdown(params: {
  staffList: Staff[];
  transactions: Transaction[];
  feeLedger: StaffFeeLedgerEntry[];
  feeConfig?: FeeConfig | null;
  schedules: DutySchedule[];
  attendanceRecords?: StaffAttendanceRecord[];
  periodStart: string;
  periodEnd: string;
  scopeMode: TaxScopeMode;
  branchId: string;
  whatIfSalaryAndFeeScalePercent?: number;
}): {
  rows: Pph21StaffBreakdown[];
  totalPph21: number;
  totalGrossPegawaiTetap: number;
  totalGrossBukanPegawai: number;
  totalPayrollSalaryAndOvertime: number;
  totalServiceFeeLedgerAndPos: number;
} {
  const {
    staffList,
    transactions,
    feeLedger,
    feeConfig,
    schedules,
    attendanceRecords = loadLocalAttendanceRecords(),
    periodStart,
    periodEnd,
    scopeMode,
    branchId,
    whatIfSalaryAndFeeScalePercent = 100
  } = params;

  const filterByBranch = scopeMode === 'per_unit' && branchId && branchId !== 'ALL';
  const payrollConfig = loadLocalPayrollConfig(feeConfig);

  // 1. Ambil hak fee layanan aktif dari log_fee_petugas + snapshot transaksi POS aktif (non-batal/non-retur)
  const deletedTrxIds = getDeletedIdsSet('transactions');
  const deletedLedgerIds = getDeletedIdsSet('fee_ledger');
  const activeNonCancelledTrxIds = new Set(
    (transactions || [])
      .filter(
        (t) =>
          t?.id &&
          t.status !== 'Dibatalkan' &&
          t.status !== 'Diretur' &&
          !deletedTrxIds.has(String(t.id).trim())
      )
      .map((t) => String(t.id).trim())
  );

  const activeLedgerInPeriod = (feeLedger || []).filter((e) => {
    if (!e?.id) return false;
    const cleanId = String(e.id).trim();
    const cleanTrxId = String(e.transaction_id || '').trim();
    if (deletedLedgerIds.has(cleanId) || (cleanTrxId && deletedTrxIds.has(cleanTrxId))) {
      return false;
    }
    if (!cleanTrxId || !activeNonCancelledTrxIds.has(cleanTrxId)) return false;
    if (e.status_pembayaran === 'dibatalkan') return false;
    if ((Number(e.total_fee_item) || 0) <= 0) return false;
    const d = normalizeTransactionDateToYMD(e.transaction_date || e.transaction_datetime);
    if (d < periodStart || d > periodEnd) return false;
    if (filterByBranch && (e.branch_id || 'BR-01') !== branchId) return false;
    return true;
  });

  const feeByStaffId = new Map<string, { name: string; role: string; fee: number; count: number }>();
  const trxIdsCoveredByLedger = new Set<string>();

  activeLedgerInPeriod.forEach((entry) => {
    trxIdsCoveredByLedger.add(entry.transaction_id);
    const pid = String(entry.petugas_id || '').trim();
    if (!pid) return;
    const prev = feeByStaffId.get(pid);
    const feeAmt = Math.max(0, Number(entry.total_fee_item) || 0);
    if (prev) {
      prev.fee += feeAmt;
      prev.count += 1;
    } else {
      feeByStaffId.set(pid, {
        name: entry.nama_petugas || 'Petugas',
        role: entry.role_petugas || String(entry.penerima_role || 'Petugas'),
        fee: feeAmt,
        count: 1
      });
    }
  });

  // Fallback untuk transaksi POS aktif dalam periode yang belum tercatat di ledger
  (transactions || []).forEach((trx) => {
    if (trx.status === 'Dibatalkan' || trx.status === 'Diretur') return;
    if (trxIdsCoveredByLedger.has(trx.id)) return;
    const d = normalizeTransactionDateToYMD(trx.date);
    if (d < periodStart || d > periodEnd) return;
    if (filterByBranch && (trx.branchId || 'BR-01') !== branchId) return;

    const resolved = resolveTransactionStaffFees(trx, [], staffList);
    resolved.forEach((sf) => {
      if (!sf.staffId || sf.fee <= 0) return;
      const prev = feeByStaffId.get(sf.staffId);
      if (prev) {
        prev.fee += sf.fee;
        prev.count += 1;
      } else {
        feeByStaffId.set(sf.staffId, {
          name: sf.staffName,
          role: sf.role,
          fee: sf.fee,
          count: 1
        });
      }
    });
  });

  // Hanya pegawai aktif (atau yang punya fee/gaji aktif pada periode) & sesuai filter cabang
  const scopedStaff = (staffList || []).filter((st) => {
    if (st.status === 'Non-Aktif') return false;
    if (filterByBranch && (st.branchId || 'BR-01') !== branchId) return false;
    return true;
  });

  const staffFeeInputs = Array.from(feeByStaffId.entries()).map(([staffId, info]) => ({
    staffId,
    staffName: info.name,
    role: info.role,
    patientCount: info.count,
    totalFee: info.fee
  }));

  const payrollSummary = buildStaffPayrollSummary({
    staffList: scopedStaff,
    payrollConfig,
    attendanceRecords,
    schedules,
    staffFeeInputs,
    startDate: periodStart,
    endDate: periodEnd,
    salaryModeOverride: 'config'
  });

  const staffMasterById = new Map(staffList.map((s) => [s.id, s]));
  const scale = Math.max(0, Number(whatIfSalaryAndFeeScalePercent) || 0) / 100;
  const monthSpan = countMonthSpanInclusive(periodStart, periodEnd);

  let totalPph21 = 0;
  let totalGrossPegawaiTetap = 0;
  let totalGrossBukanPegawai = 0;
  let totalPayrollSalaryAndOvertime = 0;
  let totalServiceFeeLedgerAndPos = 0;

  const rows: Pph21StaffBreakdown[] = payrollSummary.rows.map((prow) => {
    const master = staffMasterById.get(prow.staffId);
    const ptkpStatus: PtkpStatus = master?.ptkpStatus || 'TK/0';
    const npwpNik = master?.npwpNik || '';
    const taxCategory = inferStaffTaxCategory(
      { role: prow.role, taxCategory: master?.taxCategory },
      prow.salaryActive,
      prow.monthlyBaseSalary
    );

    const salaryAndAllowance = Math.round(prow.totalSalaryPay * scale);
    const sundayOvertimePay = Math.round(prow.totalOvertimePay * scale);
    const serviceFeeIncome = Math.round(prow.totalFeePay * scale);
    const grossIncome = salaryAndAllowance + sundayOvertimePay + serviceFeeIncome;

    totalPayrollSalaryAndOvertime += salaryAndAllowance + sundayOvertimePay;
    totalServiceFeeLedgerAndPos += serviceFeeIncome;

    if (taxCategory === 'pegawai_tetap') {
      totalGrossPegawaiTetap += grossIncome;
      const terCategory = getTerCategoryForPtkp(ptkpStatus);
      const monthlyEquivalentGross = Math.round(grossIncome / monthSpan);
      const terRatePercent = lookupTerRatePercent(monthlyEquivalentGross, terCategory);
      const estimatedPph21 = Math.round((grossIncome * terRatePercent) / 100);
      totalPph21 += estimatedPph21;

      return {
        staffId: prow.staffId,
        staffName: prow.staffName,
        role: prow.role,
        branchId: master?.branchId || 'BR-01',
        npwpNik,
        ptkpStatus,
        taxCategory,
        terCategory,
        salaryAndAllowance,
        sundayOvertimePay,
        serviceFeeIncome,
        grossIncome,
        dppAmount: grossIncome,
        effectiveRatePercent: terRatePercent,
        rateFormulaLabel: `TER Kat. ${terCategory} (${terRatePercent}%)`,
        estimatedPph21
      };
    }

    // Bukan Pegawai (Tenaga Medis / Nakes / Dokter Jasa) -> PMK 168/2023: DPP = 50% * Bruto, lalu Tarif Pasal 17
    totalGrossBukanPegawai += grossIncome;
    const dppAmount = Math.round(grossIncome * 0.5);
    const psl17 = calculatePasal17AnnualTax(dppAmount);
    const estimatedPph21 = psl17.tax;
    const effectiveRatePercent =
      grossIncome > 0 ? Number(((estimatedPph21 / grossIncome) * 100).toFixed(2)) : 0;
    totalPph21 += estimatedPph21;

    return {
      staffId: prow.staffId,
      staffName: prow.staffName,
      role: prow.role,
      branchId: master?.branchId || 'BR-01',
      npwpNik,
      ptkpStatus,
      taxCategory,
      terCategory: '-',
      salaryAndAllowance,
      sundayOvertimePay,
      serviceFeeIncome,
      grossIncome,
      dppAmount,
      effectiveRatePercent,
      rateFormulaLabel: `50% × Bruto · ${psl17.effectiveBracketLabel}`,
      estimatedPph21
    };
  });

  return {
    rows,
    totalPph21,
    totalGrossPegawaiTetap,
    totalGrossBukanPegawai,
    totalPayrollSalaryAndOvertime,
    totalServiceFeeLedgerAndPos
  };
}

export function loadLocalWpOpTaxConfig(defaults?: Partial<WpOpTaxConfig>): WpOpTaxConfig {
  try {
    const raw = demoGetItem(PPH_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_WPOP_TAX_CONFIG,
        ...defaults,
        ...parsed,
        id: 'MAIN-WPOP-TAX-CONFIG'
      };
    }
  } catch {}
  return {
    ...DEFAULT_WPOP_TAX_CONFIG,
    ...defaults,
    id: 'MAIN-WPOP-TAX-CONFIG'
  };
}

export function saveLocalWpOpTaxConfig(cfg: WpOpTaxConfig): WpOpTaxConfig {
  const clean: WpOpTaxConfig = {
    ...DEFAULT_WPOP_TAX_CONFIG,
    ...cfg,
    id: 'MAIN-WPOP-TAX-CONFIG',
    updatedAt: new Date().toISOString()
  };
  try {
    demoSetItem(PPH_CONFIG_STORAGE_KEY, JSON.stringify(clean));
  } catch {}
  return clean;
}

export function loadLocalPphSnapshots(): PphMonthlySnapshot[] {
  try {
    const raw = demoGetItem(PPH_SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalPphSnapshots(list: PphMonthlySnapshot[]): void {
  try {
    demoSetItem(PPH_SNAPSHOTS_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function loadLocalPphAuditLogs(): PphAuditEntry[] {
  try {
    const raw = demoGetItem(PPH_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalPphAuditLogs(list: PphAuditEntry[]): void {
  try {
    demoSetItem(PPH_AUDIT_STORAGE_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}

export function exportTaxEstimationCsv(params: {
  periodLabel: string;
  scopeLabel: string;
  productTax: PphProductSalesBreakdown;
  pph21Rows: Pph21StaffBreakdown[];
  totalPph21: number;
}): void {
  const { periodLabel, scopeLabel, productTax, pph21Rows, totalPph21 } = params;
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const lines: string[] = [
    ['REKAP ESTIMASI PPh WAJIB PAJAK ORANG PRIBADI (WP OP) — LATISHA ENTERPRISE'].map(esc).join(','),
    ['Periode', periodLabel, 'Cakupan', scopeLabel].map(esc).join(','),
    ['Skema PPh Usaha', productTax.scheme.toUpperCase(), 'Tarif / Keterangan', productTax.effectiveRateLabel].map(esc).join(','),
    ['Catatan', 'Estimasi internal proyeksi pajak, bukan dokumen SPT resmi.'].map(esc).join(','),
    '',
    ['BAGIAN A: DASAR PPh USAHA (KHUSUS PENJUALAN PRODUK - EKSKLUSI JASA)'].map(esc).join(','),
    ['Total Transaksi Bruto Aktif', productTax.totalGrossTransactions].map(esc).join(','),
    ['Dikurangi: Jasa Medis/Layanan & Service Charge (Dikecualikan)', productTax.totalExcludedJasaAndService].map(esc).join(','),
    ['Dikurangi: Proporsi Diskon Penjualan Produk', productTax.productDiscountAllocated].map(esc).join(','),
    ['Dasar Omzet Penjualan Produk Periode', productTax.productTurnoverPeriod].map(esc).join(','),
    ['Akumulasi Omzet Penjualan Produk YTD', productTax.ytdProductTurnoverAfterPeriod].map(esc).join(','),
    ['Sisa Kuota Bebas Pajak Rp 500 Juta', productTax.freeThreshold500mRemaining].map(esc).join(','),
    ['Sisa Batas UMKM Rp 4,8 Miliar', productTax.limit48bRemaining].map(esc).join(','),
    ['Estimasi PPh Penjualan Produk (WP OP)', productTax.estimatedPphUsaha].map(esc).join(','),
    '',
    ['BAGIAN B: ESTIMASI PPh PASAL 21 (GAJI, LEMBUR & FEE PETUGAS)'].map(esc).join(','),
    [
      'ID Pegawai',
      'Nama Petugas',
      'Peran',
      'NPWP/NIK',
      'PTKP',
      'Kategori Pajak',
      'Gaji & Tunjangan',
      'Lembur Minggu',
      'Fee Layanan (POS/RME)',
      'Total Bruto',
      'DPP',
      'Tarif / TER',
      'Estimasi PPh 21'
    ]
      .map(esc)
      .join(','),
    ...pph21Rows.map((r) =>
      [
        r.staffId,
        r.staffName,
        r.role,
        r.npwpNik || '-',
        r.ptkpStatus,
        r.taxCategory === 'pegawai_tetap' ? 'Pegawai Tetap' : 'Bukan Pegawai / Nakes',
        r.salaryAndAllowance,
        r.sundayOvertimePay,
        r.serviceFeeIncome,
        r.grossIncome,
        r.dppAmount,
        r.rateFormulaLabel,
        r.estimatedPph21
      ]
        .map(esc)
        .join(',')
    ),
    ['', '', '', '', '', 'TOTAL ESTIMASI PPh PASAL 21', '', '', '', '', '', '', totalPph21]
      .map(esc)
      .join(','),
    ['', '', '', '', '', 'TOTAL GABUNGAN ESTIMASI PPh (PPh USAHA + PPh 21)', '', '', '', '', '', '', productTax.estimatedPphUsaha + totalPph21]
      .map(esc)
      .join(',')
  ];

  const csvContent = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Estimasi_PPh_WPOP_${periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
