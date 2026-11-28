import { Medicine, MedicineBatch, MitraOrder, MitraOrderItem, PortalOrderRoom } from '../types';

export function sortBatchesFEFO(batches: MedicineBatch[]): MedicineBatch[] {
  return [...batches].sort((a, b) => {
    const expA = a.expDate ? a.expDate.trim() : '9999-12-31';
    const expB = b.expDate ? b.expDate.trim() : '9999-12-31';
    return expA.localeCompare(expB);
  });
}

export function getNormalizedBatches(
  med: Medicine,
  preserveNegative: boolean = false
): MedicineBatch[] {
  const clampStock = (val: number) => (preserveNegative ? Math.round(val) : Math.max(0, Math.round(val)));

  if (Array.isArray(med.batches) && med.batches.length > 0) {
    const sumBatches = med.batches.reduce((acc, b) => acc + (Number(b.stock) || 0), 0);
    // Keep batches consistent with med.stock if single batch or if sum matches
    if (med.batches.length === 1 && sumBatches !== med.stock) {
      return [
        {
          id: med.batches[0].id || `${med.id}-B1`,
          batchNo: med.batches[0].batchNo || med.batchNo || '-',
          expDate: med.batches[0].expDate || med.expDate || '',
          stock: clampStock(Number(med.stock) || 0)
        }
      ];
    }
    return sortBatchesFEFO(
      med.batches.map((b, idx) => ({
        id: b.id || `${med.id}-B${idx + 1}`,
        batchNo: b.batchNo || '-',
        expDate: b.expDate || '',
        stock: clampStock(Number(b.stock) || 0)
      }))
    );
  }

  return [
    {
      id: `${med.id}-B1`,
      batchNo: med.batchNo || '-',
      expDate: med.expDate || '',
      stock: clampStock(Number(med.stock) || 0)
    }
  ];
}

export function resolvePrimaryBatchAndStock(
  rawBatches: MedicineBatch[],
  fallbackBatchNo: string = '-',
  fallbackExpDate: string = '',
  removeEmptyWhenMultiple: boolean = true,
  allowNegativeStock: boolean = false
): {
  batches: MedicineBatch[];
  stock: number;
  batchNo: string;
  expDate: string;
} {
  const cleaned = rawBatches.map((b, idx) => ({
    id: b.id || `B-${Date.now()}-${idx + 1}`,
    batchNo: (b.batchNo || '').trim() || '-',
    expDate: (b.expDate || '').trim(),
    stock: allowNegativeStock
      ? Math.round(Number(b.stock) || 0)
      : Math.max(0, Math.round(Number(b.stock) || 0))
  }));

  const sorted = sortBatchesFEFO(cleaned);
  const nonZero = sorted.filter((b) => (allowNegativeStock ? b.stock !== 0 : b.stock > 0));
  const positive = sorted.filter((b) => b.stock > 0);

  let finalBatches = sorted;
  if (removeEmptyWhenMultiple && nonZero.length > 0) {
    finalBatches = nonZero;
  } else if (finalBatches.length === 0) {
    finalBatches = [
      {
        id: `B-${Date.now()}-1`,
        batchNo: fallbackBatchNo || '-',
        expDate: fallbackExpDate || '',
        stock: 0
      }
    ];
  }

  const totalStock = finalBatches.reduce((acc, b) => acc + b.stock, 0);
  const primary = positive[0] || nonZero[0] || finalBatches[0];

  return {
    batches: finalBatches,
    stock: totalStock,
    batchNo: primary?.batchNo || fallbackBatchNo || '-',
    expDate: primary?.expDate || fallbackExpDate || ''
  };
}

export interface BatchAllocation {
  batchNo: string;
  expDate: string;
  qty: number;
}

export function allocateBatchesFEFO(
  med: Medicine,
  qtyOut: number,
  preferredBatchNo?: string,
  preferredExpDate?: string,
  allowNegativeStock: boolean = false
): {
  allocations: BatchAllocation[];
  batches: MedicineBatch[];
  stock: number;
  batchNo: string;
  expDate: string;
} {
  const normalized = getNormalizedBatches(med, allowNegativeStock);
  const targetQty = Math.max(0, Math.round(Number(qtyOut) || 0));
  let remaining = targetQty;
  const allocations: BatchAllocation[] = [];

  // Optional preferred batch first (e.g. from explicit Faktur Penjualan batch selection)
  const cleanPrefBatch = (preferredBatchNo || '').trim().toLowerCase();
  const cleanPrefExp = (preferredExpDate || '').trim();
  const working = normalized.map((b) => ({ ...b }));

  if (cleanPrefBatch && cleanPrefBatch !== '-' && remaining > 0) {
    const prefIdx = working.findIndex(
      (b) =>
        b.stock > 0 &&
        b.batchNo.trim().toLowerCase() === cleanPrefBatch &&
        (!cleanPrefExp || !b.expDate || b.expDate.trim() === cleanPrefExp)
    );
    if (prefIdx >= 0) {
      const take = Math.min(working[prefIdx].stock, remaining);
      if (take > 0) {
        working[prefIdx].stock -= take;
        remaining -= take;
        allocations.push({
          batchNo: working[prefIdx].batchNo || '-',
          expDate: working[prefIdx].expDate || cleanPrefExp || '',
          qty: take
        });
      }
    }
  }

  // Remaining quantity deducted strictly FEFO (earliest expiry date first)
  for (let i = 0; i < working.length && remaining > 0; i++) {
    if (working[i].stock <= 0) continue;
    const take = Math.min(working[i].stock, remaining);
    if (take > 0) {
      working[i].stock -= take;
      remaining -= take;
      const existingAlloc = allocations.find(
        (a) =>
          a.batchNo.toLowerCase() === (working[i].batchNo || '-').toLowerCase() &&
          (a.expDate || '') === (working[i].expDate || '')
      );
      if (existingAlloc) {
        existingAlloc.qty += take;
      } else {
        allocations.push({
          batchNo: working[i].batchNo || '-',
          expDate: working[i].expDate || '',
          qty: take
        });
      }
    }
  }

  // If stock was insufficient / zero in system, preserve reference batch from medicine or preferred batch
  if (remaining > 0 && targetQty > 0) {
    const fallbackBatch = (preferredBatchNo || '').trim() || med.batchNo || normalized[0]?.batchNo || '-';
    const fallbackExp = (preferredExpDate || '').trim() || med.expDate || normalized[0]?.expDate || '';
    const existingFallback = allocations.find(
      (a) => a.batchNo === fallbackBatch && a.expDate === fallbackExp
    );
    if (existingFallback) {
      existingFallback.qty += remaining;
    } else {
      allocations.push({
        batchNo: fallbackBatch,
        expDate: fallbackExp,
        qty: remaining
      });
    }

    if (allowNegativeStock) {
      const targetIdx = working.findIndex(
        (b) =>
          b.batchNo.trim().toLowerCase() === fallbackBatch.trim().toLowerCase() &&
          (b.expDate || '').trim() === fallbackExp.trim()
      );
      if (targetIdx >= 0) {
        working[targetIdx].stock -= remaining;
      } else if (working.length > 0) {
        working[0].stock -= remaining;
      } else {
        working.push({
          id: `${med.id}-B1`,
          batchNo: fallbackBatch,
          expDate: fallbackExp,
          stock: -remaining
        });
      }
    }
  }

  const resolved = resolvePrimaryBatchAndStock(
    working,
    med.batchNo,
    med.expDate,
    true,
    allowNegativeStock
  );
  const summaryBatchNo =
    allocations.length > 0
      ? allocations.map((a) => a.batchNo || '-').join(', ')
      : med.batchNo || '-';
  const summaryExpDate =
    allocations.length > 0
      ? Array.from(new Set(allocations.map((a) => a.expDate).filter(Boolean))).join(', ') ||
        med.expDate ||
        ''
      : med.expDate || '';

  return {
    allocations,
    batches: resolved.batches,
    stock: resolved.stock,
    batchNo: summaryBatchNo,
    expDate: summaryExpDate
  };
}

export function deductBatchesFEFO(
  med: Medicine,
  qtyOut: number,
  allowNegativeStock: boolean = false
): {
  batches: MedicineBatch[];
  stock: number;
  batchNo: string;
  expDate: string;
} {
  const normalized = getNormalizedBatches(med, allowNegativeStock);
  let remaining = Math.max(0, Math.round(Number(qtyOut) || 0));

  const updated = normalized.map((b) => {
    if (remaining <= 0 || b.stock <= 0) return b;
    const take = Math.min(b.stock, remaining);
    remaining -= take;
    return {
      ...b,
      stock: Math.max(0, b.stock - take)
    };
  });

  if (allowNegativeStock && remaining > 0) {
    if (updated.length > 0) {
      updated[0] = {
        ...updated[0],
        stock: updated[0].stock - remaining
      };
    } else {
      updated.push({
        id: `${med.id}-B1`,
        batchNo: med.batchNo || '-',
        expDate: med.expDate || '',
        stock: -remaining
      });
    }
  }

  return resolvePrimaryBatchAndStock(
    updated,
    med.batchNo,
    med.expDate,
    true,
    allowNegativeStock
  );
}

function normalizeExpiryCompareKey(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const lastDay = new Date(y, mo, 0).getDate();
    return `${m[1]}-${m[2].padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    const y = Number(m[2]);
    const lastDay = new Date(y, mo, 0).getDate();
    return `${m[2]}-${m[1].padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  return s.toLowerCase();
}

/**
 * Deduct stock for disposal (pemusnahan) or supplier return (retur PBF) targeting a specific batch
 * (by batchId, batchNo, and/or normalized expDate) while reconciling with med.stock and returning
 * the remaining active primary batchNo/expDate for Master Obat.
 */
export function deductMedicineStockByBatch(
  med: Medicine,
  qtyOut: number,
  target?: {
    batchId?: string;
    batchNo?: string;
    expDate?: string;
  }
): {
  batches: MedicineBatch[];
  stock: number;
  batchNo: string;
  expDate: string;
  deductedQty: number;
  allocations: BatchAllocation[];
} {
  const prevStock = Math.max(0, Math.round(Number(med.stock) || 0));
  const requestedOut = Math.max(0, Math.round(Number(qtyOut) || 0));
  const targetFinalStock = Math.max(0, prevStock - requestedOut);
  const actualDeduct = prevStock - targetFinalStock;

  const working = getNormalizedBatches(med, false).map((b) => ({ ...b }));
  const cleanBatchId = (target?.batchId || '').trim();
  const cleanBatchNo = (target?.batchNo || '').trim().toLowerCase();
  const cleanExpKey = normalizeExpiryCompareKey(target?.expDate);

  const findTargetBatchIndex = (requirePositiveStock: boolean): number => {
    const eligible = (b: MedicineBatch) => !requirePositiveStock || b.stock > 0;
    if (cleanBatchId) {
      const idx = working.findIndex((b) => eligible(b) && (b.id || '').trim() === cleanBatchId);
      if (idx >= 0) return idx;
    }
    if (cleanBatchNo && cleanBatchNo !== '-' && cleanExpKey) {
      const idx = working.findIndex(
        (b) =>
          eligible(b) &&
          b.batchNo.trim().toLowerCase() === cleanBatchNo &&
          normalizeExpiryCompareKey(b.expDate) === cleanExpKey
      );
      if (idx >= 0) return idx;
    }
    if (cleanBatchNo && cleanBatchNo !== '-') {
      const idx = working.findIndex(
        (b) => eligible(b) && b.batchNo.trim().toLowerCase() === cleanBatchNo
      );
      if (idx >= 0) return idx;
    }
    if (cleanExpKey) {
      const idx = working.findIndex(
        (b) => eligible(b) && normalizeExpiryCompareKey(b.expDate) === cleanExpKey
      );
      if (idx >= 0) return idx;
    }
    return -1;
  };

  // Reconcile batch stocks with med.stock if legacy multi-batch sums drifted from med.stock
  const sumBatches = working.reduce((acc, b) => acc + b.stock, 0);
  if (sumBatches !== prevStock && working.length > 0) {
    if (sumBatches < prevStock) {
      const diff = prevStock - sumBatches;
      const targetIdx = findTargetBatchIndex(false);
      working[targetIdx >= 0 ? targetIdx : 0].stock += diff;
    } else {
      let excess = sumBatches - prevStock;
      for (let i = working.length - 1; i >= 0 && excess > 0; i--) {
        const trim = Math.min(working[i].stock, excess);
        working[i].stock -= trim;
        excess -= trim;
      }
    }
  }

  let remaining = actualDeduct;
  const allocations: BatchAllocation[] = [];

  // 1. Deduct from the specifically selected batch first
  if (remaining > 0) {
    const targetIdx = findTargetBatchIndex(true);
    if (targetIdx >= 0) {
      const take = Math.min(working[targetIdx].stock, remaining);
      if (take > 0) {
        working[targetIdx].stock -= take;
        remaining -= take;
        allocations.push({
          batchNo: working[targetIdx].batchNo || '-',
          expDate: working[targetIdx].expDate || target?.expDate || '',
          qty: take
        });
      }
    }
  }

  // 2. If requested quantity exceeds the single batch stock, spill over FEFO across remaining positive batches
  for (let i = 0; i < working.length && remaining > 0; i++) {
    if (working[i].stock <= 0) continue;
    const take = Math.min(working[i].stock, remaining);
    if (take > 0) {
      working[i].stock -= take;
      remaining -= take;
      const existing = allocations.find(
        (a) =>
          a.batchNo.toLowerCase() === (working[i].batchNo || '-').toLowerCase() &&
          (a.expDate || '') === (working[i].expDate || '')
      );
      if (existing) {
        existing.qty += take;
      } else {
        allocations.push({
          batchNo: working[i].batchNo || '-',
          expDate: working[i].expDate || '',
          qty: take
        });
      }
    }
  }

  const resolved = resolvePrimaryBatchAndStock(
    working,
    med.batchNo,
    med.expDate,
    true,
    false
  );

  return {
    batches: resolved.batches,
    stock: targetFinalStock,
    batchNo: resolved.batchNo,
    expDate: resolved.expDate,
    deductedQty: actualDeduct,
    allocations
  };
}

export function addBatchStock(
  med: Medicine,
  batchNo: string,
  expDate: string,
  qtyIn: number
): {
  batches: MedicineBatch[];
  stock: number;
  batchNo: string;
  expDate: string;
} {
  const hasNegativeStock = (Number(med.stock) || 0) < 0 || (med.batches || []).some((b) => (Number(b.stock) || 0) < 0);
  const normalized = getNormalizedBatches(med, hasNegativeStock);
  const cleanBatch = (batchNo || '').trim() || '-';
  const cleanExp = (expDate || '').trim();
  let addQty = Math.max(0, Math.round(Number(qtyIn) || 0));

  // Offset any prior negative deficit first so total stock reconciles accurately
  const reconciled = normalized.map((b) => {
    if (b.stock < 0 && addQty > 0) {
      const deficit = Math.abs(b.stock);
      const offset = Math.min(deficit, addQty);
      addQty -= offset;
      return { ...b, stock: b.stock + offset };
    }
    return b;
  });

  const existingIdx = reconciled.findIndex(
    (b) =>
      b.batchNo.trim().toLowerCase() === cleanBatch.toLowerCase() &&
      (b.expDate || '').trim() === cleanExp
  );

  let updated: MedicineBatch[];
  if (existingIdx >= 0) {
    updated = reconciled.map((b, idx) =>
      idx === existingIdx ? { ...b, stock: b.stock + addQty } : b
    );
  } else if (addQty > 0) {
    updated = [
      ...reconciled,
      {
        id: `${med.id}-B${Date.now().toString().slice(-5)}`,
        batchNo: cleanBatch,
        expDate: cleanExp,
        stock: addQty
      }
    ];
  } else {
    updated = reconciled;
  }

  const stillNegative = updated.some((b) => b.stock < 0);
  return resolvePrimaryBatchAndStock(updated, med.batchNo, med.expDate, true, stillNegative);
}

/**
 * Menghitung harga jual khusus mitra per satuan besar (kemasan utama) secara konsisten dengan Master Obat.
 */
export function getMitraBoxPrice(med: Medicine): number {
  const medRatio = Math.max(1, Number(med.rasioKonversi) || 1);
  const hnaBesar = Number(med.hnaBesar) || 0;
  const hppKecil = Number(med.hpp) || 0;
  const effectiveHppBesar = Math.round(
    (hnaBesar || (hppKecil * medRatio) / 1.11) * 1.11
  );

  const rawMitra = Number(med.sellPriceMitra) || 0;
  if (rawMitra > 0) {
    const isMitraAlreadyBesar = medRatio > 1 && effectiveHppBesar > 0 && rawMitra >= effectiveHppBesar * 0.75;
    return isMitraAlreadyBesar ? Math.round(rawMitra) : Math.round(rawMitra * medRatio);
  }

  const fallbackReguler = Number(med.sellPrice) || 0;
  return Math.round(fallbackReguler * medRatio);
}

/**
 * Menghitung HPP per satuan besar (Box/Pack) berdasarkan data master obat.
 */
export function getMedicineHppBox(med: Medicine): number {
  const medRatio = Math.max(1, Number(med.rasioKonversi) || 1);
  if (Number(med.hpp) > 0) {
    return Math.round(Number(med.hpp) * medRatio);
  }
  if (Number(med.hnaBesar) > 0) {
    return Math.round(Number(med.hnaBesar) * 1.11);
  }
  return Math.round(getMitraBoxPrice(med) * 0.8);
}

/**
 * Menghitung stok tersedia dalam satuan besar (kemasan utama).
 */
export function getAvailableBoxStock(med: Medicine): number {
  const medRatio = Math.max(1, Number(med.rasioKonversi) || 1);
  const totalKecil = Math.max(0, Number(med.stock) || 0);
  return Math.floor(totalKecil / medRatio);
}

export function resolveOrderRoomForPricing(
  order: Pick<MitraOrder, 'orderRoom' | 'orderCode' | 'mitraCategory'>
): PortalOrderRoom {
  if (order.orderRoom === 'REGULER' || order.orderRoom === 'MITRA') {
    return order.orderRoom;
  }
  const code = String(order.orderCode || '').toUpperCase();
  const cat = String(order.mitraCategory || '').toLowerCase();
  if (code.startsWith('REG-') || code.startsWith('PO-REG-') || cat.includes('reguler')) {
    return 'REGULER';
  }
  return 'MITRA';
}

export function getOrderItemUnitPriceFromMaster(
  med: Medicine,
  unitMode: 'KECIL' | 'BESAR'
): number {
  const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
  if (unitMode === 'KECIL') {
    const regUnit = Math.round(Number(med.sellPrice) || 0);
    if (regUnit > 0) return regUnit;
    return Math.round(getMitraBoxPrice(med) / ratio);
  }
  return getMitraBoxPrice(med);
}

export function getOrderItemHppFromMaster(
  med: Medicine,
  unitMode: 'KECIL' | 'BESAR'
): number {
  const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
  if (unitMode === 'KECIL') {
    return Number(med.hpp) || Math.round(getMedicineHppBox(med) / ratio);
  }
  return getMedicineHppBox(med);
}

export function hasMedicinePricingChanged(
  prevMed: Medicine | undefined,
  nextMed: Medicine
): boolean {
  if (!prevMed) return true;
  return (
    (Number(prevMed.sellPrice) || 0) !== (Number(nextMed.sellPrice) || 0) ||
    (Number(prevMed.sellPriceMitra) || 0) !== (Number(nextMed.sellPriceMitra) || 0) ||
    (Number(prevMed.sellPriceKlinik) || 0) !== (Number(nextMed.sellPriceKlinik) || 0) ||
    (Number(prevMed.hpp) || 0) !== (Number(nextMed.hpp) || 0) ||
    (Number(prevMed.hnaBesar) || 0) !== (Number(nextMed.hnaBesar) || 0) ||
    Math.max(1, Number(prevMed.rasioKonversi) || 1) !==
      Math.max(1, Number(nextMed.rasioKonversi) || 1)
  );
}

export function reconcilePendingOrdersWithMedicines(
  orders: MitraOrder[],
  medicines: Medicine[],
  targetMedicineIds?: Set<string>
): { nextOrders: MitraOrder[]; updatedOrders: MitraOrder[] } {
  if (!Array.isArray(orders) || orders.length === 0 || !Array.isArray(medicines) || medicines.length === 0) {
    return { nextOrders: orders || [], updatedOrders: [] };
  }

  const medById = new Map<string, Medicine>();
  const medByName = new Map<string, Medicine>();
  for (const med of medicines) {
    if (med.id) medById.set(med.id, med);
    const cleanName = String(med.name || '').trim().toLowerCase();
    if (cleanName && !medByName.has(cleanName)) medByName.set(cleanName, med);
  }

  const updatedOrders: MitraOrder[] = [];
  const nowIso = new Date().toISOString();

  const nextOrders = orders.map((order) => {
    if (String(order.status || '').trim().toLowerCase() !== 'pending') {
      return order;
    }
    if (!Array.isArray(order.items) || order.items.length === 0) {
      return order;
    }

    const resolvedRoom = resolveOrderRoomForPricing(order);
    let itemsChanged = false;

    const nextItems: MitraOrderItem[] = order.items.map((item) => {
      const med =
        (item.medicineId ? medById.get(item.medicineId) : undefined) ||
        medByName.get(String(item.name || '').trim().toLowerCase());
      if (!med) return item;
      if (targetMedicineIds && !targetMedicineIds.has(med.id)) {
        return item;
      }

      const unitMode: 'KECIL' | 'BESAR' =
        item.unitMode || (resolvedRoom === 'REGULER' ? 'KECIL' : 'BESAR');
      const nextPrice = getOrderItemUnitPriceFromMaster(med, unitMode);
      const nextHpp = getOrderItemHppFromMaster(med, unitMode);
      const medRatio = Math.max(1, Number(med.rasioKonversi) || 1);
      const nextRatio = unitMode === 'KECIL' ? 1 : medRatio;
      const qty = Number(item.qtyBox) || 0;
      const nextQtyTotalKecil = qty * nextRatio;
      const nextSubtotal = qty * nextPrice;

      if (
        nextPrice !== (Number(item.unitPriceBox) || 0) ||
        nextHpp !== (Number(item.hppBox) || 0) ||
        nextSubtotal !== (Number(item.subtotal) || 0) ||
        nextRatio !== (Number(item.rasioKonversi) || 1) ||
        nextQtyTotalKecil !== (Number(item.qtyTotalKecil) || 0)
      ) {
        itemsChanged = true;
        return {
          ...item,
          unitMode,
          satuanKecil: med.satuanKecil || med.unit || item.satuanKecil,
          satuanBesar:
            unitMode === 'KECIL'
              ? med.satuanKecil || med.unit || item.satuanKecil
              : med.satuanBesar || item.satuanBesar || 'Box',
          rasioKonversi: nextRatio,
          qtyTotalKecil: nextQtyTotalKecil,
          unitPriceBox: nextPrice,
          hppBox: nextHpp,
          subtotal: nextSubtotal
        };
      }
      return item;
    });

    if (!itemsChanged) {
      return order;
    }

    const nextSubtotalOrder = nextItems.reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0);
    const pctMatch = String(order.appliedDiscountLabel || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
    let nextDiscountAmount = 0;
    if (pctMatch) {
      const pct = Math.min(100, Math.max(0, parseFloat(pctMatch[1].replace(',', '.')) || 0));
      nextDiscountAmount = Math.min(nextSubtotalOrder, Math.round((nextSubtotalOrder * pct) / 100));
    } else if ((Number(order.discountAmount) || 0) > 0) {
      nextDiscountAmount = Math.min(nextSubtotalOrder, Math.round(Number(order.discountAmount) || 0));
    }
    const nextTotalAmount = Math.max(0, nextSubtotalOrder - nextDiscountAmount);

    const updatedOrder: MitraOrder = {
      ...order,
      items: nextItems,
      totalItems: nextItems.length,
      totalQtyBox: nextItems.reduce((sum, it) => sum + (Number(it.qtyBox) || 0), 0),
      discountAmount: nextDiscountAmount > 0 ? nextDiscountAmount : undefined,
      totalAmount: nextTotalAmount,
      updatedAt: nowIso
    };
    updatedOrders.push(updatedOrder);
    return updatedOrder;
  });

  return { nextOrders, updatedOrders };
}

