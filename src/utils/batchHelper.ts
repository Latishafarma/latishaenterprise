import { Medicine, MedicineBatch } from '../types';

export function sortBatchesFEFO(batches: MedicineBatch[]): MedicineBatch[] {
  return [...batches].sort((a, b) => {
    const expA = a.expDate ? a.expDate.trim() : '9999-12-31';
    const expB = b.expDate ? b.expDate.trim() : '9999-12-31';
    return expA.localeCompare(expB);
  });
}

export function getNormalizedBatches(med: Medicine): MedicineBatch[] {
  if (Array.isArray(med.batches) && med.batches.length > 0) {
    const sumBatches = med.batches.reduce((acc, b) => acc + (Number(b.stock) || 0), 0);
    // Keep batches consistent with med.stock if single batch or if sum matches
    if (med.batches.length === 1 && sumBatches !== med.stock) {
      return [
        {
          id: med.batches[0].id || `${med.id}-B1`,
          batchNo: med.batches[0].batchNo || med.batchNo || '-',
          expDate: med.batches[0].expDate || med.expDate || '',
          stock: Math.max(0, Number(med.stock) || 0)
        }
      ];
    }
    return sortBatchesFEFO(
      med.batches.map((b, idx) => ({
        id: b.id || `${med.id}-B${idx + 1}`,
        batchNo: b.batchNo || '-',
        expDate: b.expDate || '',
        stock: Math.max(0, Number(b.stock) || 0)
      }))
    );
  }

  return [
    {
      id: `${med.id}-B1`,
      batchNo: med.batchNo || '-',
      expDate: med.expDate || '',
      stock: Math.max(0, Number(med.stock) || 0)
    }
  ];
}

export function resolvePrimaryBatchAndStock(
  rawBatches: MedicineBatch[],
  fallbackBatchNo: string = '-',
  fallbackExpDate: string = '',
  removeEmptyWhenMultiple: boolean = true
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
    stock: Math.max(0, Math.round(Number(b.stock) || 0))
  }));

  const sorted = sortBatchesFEFO(cleaned);
  const nonEmpty = sorted.filter((b) => b.stock > 0);

  let finalBatches = sorted;
  if (removeEmptyWhenMultiple && nonEmpty.length > 0) {
    finalBatches = nonEmpty;
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
  const primary = nonEmpty[0] || finalBatches[0];

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
  preferredExpDate?: string
): {
  allocations: BatchAllocation[];
  batches: MedicineBatch[];
  stock: number;
  batchNo: string;
  expDate: string;
} {
  const normalized = getNormalizedBatches(med);
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
  }

  const resolved = resolvePrimaryBatchAndStock(working, med.batchNo, med.expDate, true);
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
  qtyOut: number
): {
  batches: MedicineBatch[];
  stock: number;
  batchNo: string;
  expDate: string;
} {
  const normalized = getNormalizedBatches(med);
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

  return resolvePrimaryBatchAndStock(updated, med.batchNo, med.expDate, true);
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
  const normalized = getNormalizedBatches(med);
  const cleanBatch = (batchNo || '').trim() || '-';
  const cleanExp = (expDate || '').trim();
  const addQty = Math.max(0, Math.round(Number(qtyIn) || 0));

  const existingIdx = normalized.findIndex(
    (b) =>
      b.batchNo.trim().toLowerCase() === cleanBatch.toLowerCase() &&
      (b.expDate || '').trim() === cleanExp
  );

  let updated: MedicineBatch[];
  if (existingIdx >= 0) {
    updated = normalized.map((b, idx) =>
      idx === existingIdx ? { ...b, stock: b.stock + addQty } : b
    );
  } else {
    updated = [
      ...normalized,
      {
        id: `${med.id}-B${Date.now().toString().slice(-5)}`,
        batchNo: cleanBatch,
        expDate: cleanExp,
        stock: addQty
      }
    ];
  }

  return resolvePrimaryBatchAndStock(updated, med.batchNo, med.expDate, true);
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

