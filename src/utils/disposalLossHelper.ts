import { Medicine, ProductDisposalItem, ProductDisposalRecord, StockMutation } from '../types';
import { demoGetItem, demoSetItem } from './demoSandbox';
import { getDeletedIdsSet } from './deletionRegistry';

export const DELETED_DISPOSAL_BA_STORAGE_KEY = 'latisha_deleted_disposal_ba_nos';

const normalizeDateToYMD = (rawDate?: string): string => {
  if (!rawDate) return '';
  const trimmed = rawDate.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return trimmed.split(' ')[0].split('T')[0];
};

export function getDeletedDisposalBaSet(): Set<string> {
  try {
    const raw = demoGetItem(DELETED_DISPOSAL_BA_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .map((v) => String(v || '').trim().toUpperCase())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

export function markDisposalBaDeleted(baNumber?: string): void {
  const clean = String(baNumber || '').trim().toUpperCase();
  if (!clean) return;
  try {
    const current = getDeletedDisposalBaSet();
    current.add(clean);
    demoSetItem(DELETED_DISPOSAL_BA_STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch {}
}

export function unmarkDisposalBaDeleted(baNumber?: string): void {
  const clean = String(baNumber || '').trim().toUpperCase();
  if (!clean) return;
  try {
    const current = getDeletedDisposalBaSet();
    if (current.delete(clean)) {
      demoSetItem(DELETED_DISPOSAL_BA_STORAGE_KEY, JSON.stringify(Array.from(current)));
    }
  } catch {}
}

export function computeDisposalItemSubtotal(item: {
  qty?: number;
  hpp?: number;
  subtotal?: number;
}): number {
  const explicitSubtotal = Number(item.subtotal);
  if (Number.isFinite(explicitSubtotal) && explicitSubtotal > 0) {
    return Math.round(explicitSubtotal);
  }
  const qty = Math.max(0, Number(item.qty) || 0);
  const hpp = Math.max(0, Number(item.hpp) || 0);
  return Math.round(qty * hpp);
}

export function computeDisposalRecordTotalLoss(rec: ProductDisposalRecord): number {
  const items = Array.isArray(rec.items) ? rec.items : [];
  const itemsSum = items.reduce((acc, it) => acc + computeDisposalItemSubtotal(it), 0);
  const storedTotal = Math.round(Number(rec.totalValue) || 0);
  if (storedTotal > 0) return storedTotal;
  return itemsSum;
}

export function buildUnifiedDisposalLossRecords(params: {
  disposalRecords?: ProductDisposalRecord[];
  stockMutations?: StockMutation[];
  medicines?: Medicine[];
}): ProductDisposalRecord[] {
  const { disposalRecords = [], stockMutations = [], medicines = [] } = params;
  const deletedIds = getDeletedIdsSet('disposal_records');
  const deletedBaSet = getDeletedDisposalBaSet();

  const normalizedList: ProductDisposalRecord[] = [];
  const existingBaNumbers = new Set<string>();

  disposalRecords.forEach((rec) => {
    if (!rec || !rec.id) return;
    if (deletedIds.has(String(rec.id).trim())) return;
    const normalizedItems: ProductDisposalItem[] = (Array.isArray(rec.items) ? rec.items : []).map(
      (it) => {
        const qty = Math.max(0, Math.round(Number(it.qty) || 0));
        const hpp = Math.max(0, Number(it.hpp) || 0);
        const subtotal = computeDisposalItemSubtotal({ qty, hpp, subtotal: it.subtotal });
        return {
          ...it,
          qty,
          hpp,
          subtotal
        };
      }
    );
    const totalQty =
      Number(rec.totalQty) > 0
        ? Math.round(Number(rec.totalQty))
        : normalizedItems.reduce((acc, it) => acc + it.qty, 0);
    const totalItems =
      Number(rec.totalItems) > 0 ? Math.round(Number(rec.totalItems)) : normalizedItems.length;
    const totalValue = computeDisposalRecordTotalLoss({
      ...rec,
      items: normalizedItems
    });
    const cleanBa = String(rec.baNumber || rec.id).trim();
    if (cleanBa) existingBaNumbers.add(cleanBa.toUpperCase());

    normalizedList.push({
      ...rec,
      baNumber: cleanBa,
      date: normalizeDateToYMD(rec.date),
      totalItems,
      totalQty,
      totalValue,
      items: normalizedItems
    });
  });

  // Fallback reconciliation from Kartu Stok (PEMUSNAHAN) for legacy/historical records not yet in pemusnahan_obat
  const disposalMuts = stockMutations.filter((m) => {
    if (m.type !== 'PEMUSNAHAN') return false;
    const refKey = String(m.refNo || '').trim().toUpperCase();
    if (refKey && (existingBaNumbers.has(refKey) || deletedBaSet.has(refKey))) return false;
    return true;
  });

  if (disposalMuts.length > 0) {
    const medMap = new Map<string, Medicine>();
    medicines.forEach((m) => medMap.set(m.id, m));

    const grouped = new Map<string, StockMutation[]>();
    disposalMuts.forEach((m) => {
      const dateYmd = normalizeDateToYMD(m.date);
      const refNo = String(m.refNo || m.id).trim();
      const key = `${dateYmd}__${refNo}`;
      const bucket = grouped.get(key) || [];
      bucket.push(m);
      grouped.set(key, bucket);
    });

    grouped.forEach((muts, key) => {
      const first = muts[0];
      const items: ProductDisposalItem[] = muts.map((m) => {
        const med = medMap.get(m.medicineId);
        const qty = Math.max(0, Math.round(Number(m.outQty) || 0));
        const medHpp = Math.max(0, Number(med?.hpp) || 0);
        const rawMutHpp = Number(m.hpp);

        let unitHpp = medHpp;
        let subtotal = Math.round(qty * medHpp);

        if (Number.isFinite(rawMutHpp) && rawMutHpp > 0) {
          if (qty > 1 && medHpp > 0) {
            const diffAsTotal = Math.abs(rawMutHpp - medHpp * qty);
            const diffAsUnit = Math.abs(rawMutHpp - medHpp);
            if (diffAsTotal <= diffAsUnit) {
              subtotal = Math.round(rawMutHpp);
              unitHpp = Math.round(rawMutHpp / qty);
            } else {
              unitHpp = Math.round(rawMutHpp);
              subtotal = Math.round(rawMutHpp * qty);
            }
          } else {
            // In handleProcessExpiryDisposal, StockMutation.hpp stores line total (it.hpp * qty)
            subtotal = Math.round(rawMutHpp);
            unitHpp = qty > 0 ? Math.round(rawMutHpp / qty) : Math.round(rawMutHpp);
          }
        }

        return {
          medicineId: m.medicineId,
          name: m.medicineName,
          batchNo: m.batchNo || '-',
          expDate: m.expDate || '',
          qty,
          unit: med?.unit || 'Unit',
          hpp: unitHpp,
          subtotal
        };
      });

      const totalQty = items.reduce((acc, it) => acc + it.qty, 0);
      const totalValue = items.reduce((acc, it) => acc + it.subtotal, 0);

      normalizedList.push({
        id: `DIS-MUT-${key}`,
        baNumber: String(first.refNo || first.id).trim(),
        date: normalizeDateToYMD(first.date),
        time: first.time || '',
        method: 'Pemusnahan Produk ED',
        witness: '-',
        reason: first.ket || 'Rekonsiliasi Kartu Stok (PEMUSNAHAN)',
        petugas: first.petugas || 'Apoteker',
        branchId: first.branchId || 'BR-01',
        totalItems: items.length,
        totalQty,
        totalValue,
        items
      });
    });
  }

  return normalizedList.sort((a, b) =>
    `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`)
  );
}

export interface DisposalLossSummary {
  filteredRecords: ProductDisposalRecord[];
  recordCount: number;
  totalItems: number;
  totalQty: number;
  totalLoss: number;
}

export function summarizeDisposalLosses(
  records: ProductDisposalRecord[],
  startDate?: string,
  endDate?: string
): DisposalLossSummary {
  const filteredRecords = records.filter((rec) => {
    const d = normalizeDateToYMD(rec.date);
    return (!startDate || d >= startDate) && (!endDate || d <= endDate);
  });

  let totalItems = 0;
  let totalQty = 0;
  let totalLoss = 0;

  filteredRecords.forEach((rec) => {
    totalItems += Number(rec.totalItems) || rec.items?.length || 0;
    totalQty += Number(rec.totalQty) || (rec.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
    totalLoss += computeDisposalRecordTotalLoss(rec);
  });

  return {
    filteredRecords,
    recordCount: filteredRecords.length,
    totalItems,
    totalQty,
    totalLoss
  };
}
