import {
  DiscountBasis,
  DiscountChannelScope,
  Medicine,
  PromoAd,
  PromoBannerTheme,
  SalesDiscount
} from '../types';

export interface DiscountEvalCartLine {
  medicineId: string;
  category?: string;
  kelas?: string;
  qty: number;
  subtotal: number;
}

export interface DiscountEvaluationResult {
  discount: SalesDiscount;
  amount: number;
  eligibleSubtotal: number;
  eligibleQty: number;
}

export const DISCOUNT_BASIS_LABELS: Record<DiscountBasis, string> = {
  ALL_ITEMS: 'Semua Item / Nota Belanja',
  SPECIFIC_MEDICINE: 'Produk Obat Tertentu',
  CATEGORY: 'Kategori Obat',
  THERAPY_CLASS: 'Kelas Terapi Obat',
  MIN_PURCHASE: 'Minimal Total Belanja (Rp)',
  MIN_QTY: 'Minimal Qty Pembelian'
};

export const DISCOUNT_CHANNEL_LABELS: Record<DiscountChannelScope, string> = {
  ALL: 'Semua Jalur Penjualan',
  PORTAL_MITRA: 'Khusus Portal Order Mitra',
  MITRA: 'Mitra & Nakes (POS + Portal)',
  REGULER: 'Pasien Reguler / OTC',
  KLINIK: 'Pasien Klinik / Resep'
};

export interface PromoThemePreset {
  id: PromoBannerTheme;
  label: string;
  wrapperClass: string;
  accentPanelClass: string;
  eyebrowClass: string;
  ctaClass: string;
  codeBadgeClass: string;
}

export const PROMO_BANNER_THEMES: Record<PromoBannerTheme, PromoThemePreset> = {
  'emerald-clinical': {
    id: 'emerald-clinical',
    label: 'Emerald Klinis',
    wrapperClass: 'bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white border-emerald-700/60',
    accentPanelClass: 'bg-emerald-950/50 border-emerald-500/30',
    eyebrowClass: 'bg-emerald-400/20 text-emerald-100 border-emerald-300/30',
    ctaClass: 'bg-white text-emerald-950 hover:bg-emerald-50',
    codeBadgeClass: 'bg-emerald-950/70 border-emerald-400/40 text-emerald-200'
  },
  'navy-executive': {
    id: 'navy-executive',
    label: 'Navy Eksekutif',
    wrapperClass: 'bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 text-white border-slate-700',
    accentPanelClass: 'bg-slate-950/60 border-sky-400/25',
    eyebrowClass: 'bg-sky-400/20 text-sky-100 border-sky-300/30',
    ctaClass: 'bg-sky-400 text-slate-950 hover:bg-sky-300',
    codeBadgeClass: 'bg-slate-950/80 border-sky-400/40 text-sky-200'
  },
  'amber-flash': {
    id: 'amber-flash',
    label: 'Amber Flash Deal',
    wrapperClass: 'bg-gradient-to-br from-amber-600 via-orange-600 to-amber-800 text-white border-amber-500/60',
    accentPanelClass: 'bg-amber-950/40 border-amber-200/30',
    eyebrowClass: 'bg-slate-950/35 text-amber-100 border-amber-200/30',
    ctaClass: 'bg-slate-950 text-amber-300 hover:bg-slate-900',
    codeBadgeClass: 'bg-amber-950/60 border-amber-200/40 text-amber-100'
  },
  'indigo-network': {
    id: 'indigo-network',
    label: 'Indigo Jejaring',
    wrapperClass: 'bg-gradient-to-br from-indigo-900 via-indigo-800 to-blue-900 text-white border-indigo-700/60',
    accentPanelClass: 'bg-indigo-950/55 border-indigo-300/25',
    eyebrowClass: 'bg-indigo-300/20 text-indigo-100 border-indigo-200/30',
    ctaClass: 'bg-white text-indigo-950 hover:bg-indigo-50',
    codeBadgeClass: 'bg-indigo-950/75 border-indigo-300/40 text-indigo-100'
  },
  'rose-special': {
    id: 'rose-special',
    label: 'Rose Spesial',
    wrapperClass: 'bg-gradient-to-br from-rose-900 via-rose-800 to-slate-900 text-white border-rose-700/60',
    accentPanelClass: 'bg-rose-950/50 border-rose-300/25',
    eyebrowClass: 'bg-rose-400/20 text-rose-100 border-rose-200/30',
    ctaClass: 'bg-white text-rose-950 hover:bg-rose-50',
    codeBadgeClass: 'bg-rose-950/75 border-rose-300/40 text-rose-100'
  }
};

export function getTodayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isWithinDateWindow(startDate?: string, endDate?: string, refDate = getTodayIsoDate()): boolean {
  const s = (startDate || '').trim();
  const e = (endDate || '').trim();
  if (s && refDate < s) return false;
  if (e && refDate > e) return false;
  return true;
}

export function matchesChannelScope(
  scope: DiscountChannelScope,
  activeChannel: 'REGULER' | 'KLINIK' | 'MITRA' | 'PORTAL_MITRA'
): boolean {
  if (scope === 'ALL') return true;
  if (scope === 'MITRA') return activeChannel === 'MITRA' || activeChannel === 'PORTAL_MITRA';
  return scope === activeChannel;
}

export function isMedicineEligibleForDiscount(med: Medicine, discount: SalesDiscount): boolean {
  if (discount.basis === 'SPECIFIC_MEDICINE') {
    const ids = discount.targetMedicineIds || [];
    return ids.includes(med.id);
  }
  if (discount.basis === 'CATEGORY') {
    const cats = (discount.targetCategories || []).map((c) => c.trim().toLowerCase());
    return cats.includes((med.category || '').trim().toLowerCase());
  }
  if (discount.basis === 'THERAPY_CLASS') {
    const classes = (discount.targetTherapyClasses || []).map((c) => c.trim().toLowerCase());
    return classes.includes((med.kelas || '').trim().toLowerCase());
  }
  return true;
}

export function evaluateDiscountOnCart(
  discount: SalesDiscount,
  lines: DiscountEvalCartLine[],
  activeChannel: 'REGULER' | 'KLINIK' | 'MITRA' | 'PORTAL_MITRA',
  voucherCodeInput?: string
): DiscountEvaluationResult | null {
  if (!discount.isActive) return null;
  if (!isWithinDateWindow(discount.startDate, discount.endDate)) return null;
  if (!matchesChannelScope(discount.channelScope, activeChannel)) return null;

  const trimmedInput = (voucherCodeInput || '').trim().toUpperCase();
  const discountCode = (discount.code || '').trim().toUpperCase();
  if (!discount.autoApply && discountCode) {
    if (trimmedInput !== discountCode) return null;
  } else if (trimmedInput && discountCode && trimmedInput !== discountCode && !discount.autoApply) {
    return null;
  }

  let matchingLines = lines;
  if (discount.basis === 'SPECIFIC_MEDICINE') {
    const ids = new Set(discount.targetMedicineIds || []);
    matchingLines = lines.filter((l) => ids.has(l.medicineId));
  } else if (discount.basis === 'CATEGORY') {
    const cats = new Set((discount.targetCategories || []).map((c) => c.trim().toLowerCase()));
    matchingLines = lines.filter((l) => cats.has((l.category || '').trim().toLowerCase()));
  } else if (discount.basis === 'THERAPY_CLASS') {
    const classes = new Set((discount.targetTherapyClasses || []).map((c) => c.trim().toLowerCase()));
    matchingLines = lines.filter((l) => classes.has((l.kelas || '').trim().toLowerCase()));
  }

  const eligibleSubtotal = matchingLines.reduce((sum, l) => sum + Math.max(0, Number(l.subtotal) || 0), 0);
  const eligibleQty = matchingLines.reduce((sum, l) => sum + Math.max(0, Number(l.qty) || 0), 0);
  const overallSubtotal = lines.reduce((sum, l) => sum + Math.max(0, Number(l.subtotal) || 0), 0);
  const overallQty = lines.reduce((sum, l) => sum + Math.max(0, Number(l.qty) || 0), 0);

  if (eligibleSubtotal <= 0) return null;

  const minPurchase = Number(discount.minPurchaseAmount) || 0;
  if (minPurchase > 0 && overallSubtotal < minPurchase) return null;
  if (discount.basis === 'MIN_PURCHASE' && overallSubtotal < Math.max(minPurchase, 1)) return null;

  const minQty = Number(discount.minQty) || 0;
  const qtyToCheck =
    discount.basis === 'SPECIFIC_MEDICINE' || discount.basis === 'CATEGORY' || discount.basis === 'THERAPY_CLASS'
      ? eligibleQty
      : overallQty;
  if (minQty > 0 && qtyToCheck < minQty) return null;
  if (discount.basis === 'MIN_QTY' && qtyToCheck < Math.max(minQty, 1)) return null;

  let rawAmount = 0;
  if (discount.valueType === 'PERCENT') {
    const pct = Math.max(0, Math.min(100, Number(discount.value) || 0));
    rawAmount = Math.round((eligibleSubtotal * pct) / 100);
    const maxCap = Number(discount.maxDiscountAmount) || 0;
    if (maxCap > 0) {
      rawAmount = Math.min(rawAmount, maxCap);
    }
  } else {
    rawAmount = Math.max(0, Number(discount.value) || 0);
  }

  const finalAmount = Math.min(eligibleSubtotal, Math.max(0, Math.round(rawAmount)));
  if (finalAmount <= 0) return null;

  return {
    discount,
    amount: finalAmount,
    eligibleSubtotal,
    eligibleQty
  };
}

export function findBestCartDiscount(
  discounts: SalesDiscount[],
  lines: DiscountEvalCartLine[],
  activeChannel: 'REGULER' | 'KLINIK' | 'MITRA' | 'PORTAL_MITRA',
  voucherCodeInput?: string
): {
  bestAuto: DiscountEvaluationResult | null;
  matchedVoucher: DiscountEvaluationResult | null;
  activeApplied: DiscountEvaluationResult | null;
  allEligibleAuto: DiscountEvaluationResult[];
} {
  const allEligibleAuto: DiscountEvaluationResult[] = [];
  let matchedVoucher: DiscountEvaluationResult | null = null;
  const trimmedVoucher = (voucherCodeInput || '').trim().toUpperCase();

  for (const d of discounts) {
    if (trimmedVoucher && (d.code || '').trim().toUpperCase() === trimmedVoucher) {
      const resVoucher = evaluateDiscountOnCart(d, lines, activeChannel, trimmedVoucher);
      if (resVoucher && (!matchedVoucher || resVoucher.amount > matchedVoucher.amount)) {
        matchedVoucher = resVoucher;
      }
    }
    if (d.autoApply) {
      const resAuto = evaluateDiscountOnCart(d, lines, activeChannel);
      if (resAuto) {
        allEligibleAuto.push(resAuto);
      }
    }
  }

  allEligibleAuto.sort((a, b) => b.amount - a.amount);
  const bestAuto = allEligibleAuto[0] || null;
  const activeApplied =
    matchedVoucher && (!bestAuto || matchedVoucher.amount >= bestAuto.amount)
      ? matchedVoucher
      : bestAuto;

  return { bestAuto, matchedVoucher, activeApplied, allEligibleAuto };
}

export function getLivePortalPromos(promos: PromoAd[]): PromoAd[] {
  const today = getTodayIsoDate();
  return promos
    .filter((p) => p.isActive && p.showOnMitraPortal && isWithinDateWindow(p.startDate, p.endDate, today))
    .sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99));
}

export function formatDiscountShortBadge(d: SalesDiscount): string {
  return d.valueType === 'PERCENT'
    ? `Diskon ${d.value}%`
    : `Hemat Rp ${Math.round(d.value).toLocaleString('id-ID')}`;
}

export interface ProductUnitDiscountPreview {
  discount: SalesDiscount;
  originalPrice: number;
  discountAmount: number;
  discountedPrice: number;
  conditionHint?: string;
}

/**
 * Evaluate the best active discount for a product in Portal Reguler / Portal Mitra.
 * Supports PERCENT discounts (even when conditional on minQty or minPurchaseAmount, so buyers
 * clearly see the struck-through original price alongside the discounted price + condition note)
 * and NOMINAL discounts (guarding against cart-level nominal vouchers exceeding a single unit price).
 */
export function getBestProductUnitDiscount(
  med: Medicine,
  unitPrice: number,
  discounts: SalesDiscount[],
  activeChannel: 'REGULER' | 'KLINIK' | 'MITRA' | 'PORTAL_MITRA',
  voucherCodeInput?: string
): ProductUnitDiscountPreview | null {
  const cleanPrice = Math.max(0, Math.round(Number(unitPrice) || 0));
  if (cleanPrice <= 0 || !Array.isArray(discounts) || discounts.length === 0) return null;

  const trimmedVoucher = (voucherCodeInput || '').trim().toUpperCase();
  let best: ProductUnitDiscountPreview | null = null;

  for (const d of discounts) {
    if (!d.isActive) continue;
    if (!isWithinDateWindow(d.startDate, d.endDate)) continue;
    if (!matchesChannelScope(d.channelScope, activeChannel)) continue;
    if (!isMedicineEligibleForDiscount(med, d)) continue;

    const discountCode = (d.code || '').trim().toUpperCase();
    const voucherMatches = Boolean(trimmedVoucher && discountCode && trimmedVoucher === discountCode);
    if (!d.autoApply && discountCode && !voucherMatches) continue;

    const minPurchase = Math.max(0, Math.round(Number(d.minPurchaseAmount) || 0));
    const minQty = Math.max(0, Math.round(Number(d.minQty) || 0));

    let rawAmount = 0;
    if (d.valueType === 'PERCENT') {
      const pct = Math.max(0, Math.min(100, Number(d.value) || 0));
      rawAmount = Math.round((cleanPrice * pct) / 100);
      const maxCap = Math.max(0, Math.round(Number(d.maxDiscountAmount) || 0));
      if (maxCap > 0) {
        rawAmount = Math.min(rawAmount, maxCap);
      }
    } else {
      const nomVal = Math.max(0, Math.round(Number(d.value) || 0));
      // Prevent cart-wide nominal vouchers (e.g. Rp 50.000 off min purchase Rp 500.000) from zeroing a cheap unit
      if (nomVal >= cleanPrice && (minPurchase > cleanPrice || minQty > 1 || d.basis === 'MIN_PURCHASE' || d.basis === 'MIN_QTY')) {
        continue;
      }
      rawAmount = nomVal;
    }

    const finalAmount = Math.min(cleanPrice, Math.max(0, rawAmount));
    if (finalAmount <= 0) continue;

    const hints: string[] = [];
    if (minQty > 1) hints.push(`Min. ${minQty.toLocaleString('id-ID')} item`);
    if (minPurchase > 0 && minPurchase > cleanPrice) {
      hints.push(`Min. belanja Rp ${minPurchase.toLocaleString('id-ID')}`);
    }

    if (!best || finalAmount > best.discountAmount) {
      best = {
        discount: d,
        originalPrice: cleanPrice,
        discountAmount: finalAmount,
        discountedPrice: Math.max(0, cleanPrice - finalAmount),
        conditionHint: hints.length > 0 ? hints.join(' · ') : undefined
      };
    }
  }

  return best;
}

