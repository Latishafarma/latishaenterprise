import {
  Medicine,
  PurchaseInvoice,
  StockMutation,
  StockMutationBatchDetail,
  StockOpnameRecord,
  Transaction
} from '../types';

export interface StockCardLookupContext {
  medicineById: Map<string, Medicine>;
  transactionById?: Map<string, Transaction>;
  purchaseByInvoiceNo?: Map<string, PurchaseInvoice>;
  opnameByRefNo?: Map<string, StockOpnameRecord>;
}

const parseOpnameBatchNote = (ket?: string): StockMutationBatchDetail[] => {
  const text = String(ket || '');
  const multiMatch = text.match(/Multi-Batch\s*\(([^)]+)\)/i);
  if (multiMatch && multiMatch[1]) {
    const parts = multiMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
    const parsed: StockMutationBatchDetail[] = [];
    for (const part of parts) {
      const m = part.match(/^(.+?)\s+ED:([^\s\[]+)(?:\s*\[(\d+)\])?/i);
      if (m) {
        parsed.push({
          batchNo: m[1].trim() || '-',
          expDate: m[2].trim() === '-' ? '' : m[2].trim(),
          qty: m[3] ? Number(m[3]) || 0 : 0
        });
      }
    }
    if (parsed.length > 0) return parsed;
  }

  const singleMatch = text.match(/Batch:\s*([^\s·]+)\s*\(ED:\s*([^)]+)\)/i);
  if (singleMatch) {
    return [
      {
        batchNo: singleMatch[1].trim() || '-',
        expDate: singleMatch[2].trim() === '-' ? '' : singleMatch[2].trim(),
        qty: 0
      }
    ];
  }
  return [];
};

export function resolveMutationBatchDetails(
  m: StockMutation,
  ctx: StockCardLookupContext
): {
  details: StockMutationBatchDetail[];
  sourceLabel: string;
} {
  const med = ctx.medicineById.get(m.medicineId);

  // 1. Real-time batchDetails attached directly on the mutation record
  if (Array.isArray(m.batchDetails) && m.batchDetails.length > 0) {
    const cleaned = m.batchDetails
      .filter((d) => (d.batchNo && d.batchNo.trim()) || (d.expDate && d.expDate.trim()))
      .map((d) => ({
        batchNo: (d.batchNo || '-').trim() || '-',
        expDate: (d.expDate || '').trim(),
        qty: Number(d.qty) || 0
      }));
    if (cleaned.length > 0) {
      return { details: cleaned, sourceLabel: 'Real-Time Transaksi' };
    }
  }

  // 2. Direct batchNo / expDate stored on StockMutation
  if ((m.batchNo && m.batchNo.trim() && m.batchNo.trim() !== '-') || (m.expDate && m.expDate.trim())) {
    const rawBatches = (m.batchNo || '-')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const rawExps = (m.expDate || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawBatches.length > 1) {
      const details: StockMutationBatchDetail[] = rawBatches.map((b, idx) => ({
        batchNo: b,
        expDate: rawExps[idx] || rawExps[0] || '',
        qty: 0
      }));
      return { details, sourceLabel: 'Mutasi Tercatat' };
    }

    return {
      details: [
        {
          batchNo: rawBatches[0] || med?.batchNo || '-',
          expDate: rawExps[0] || med?.expDate || '',
          qty: Number(m.inQty || m.outQty) || 0
        }
      ],
      sourceLabel: 'Mutasi Tercatat'
    };
  }

  // 3. Cross-reference source documents (POS / Faktur Penjualan / Pembelian PBF / Stok Opname)
  if (m.type === 'PENJUALAN' || m.type === 'RESEP_DOKTER') {
    const trx = ctx.transactionById?.get(m.refNo);
    if (trx && Array.isArray(trx.items)) {
      const directMatches = trx.items.filter(
        (it) =>
          it.id === m.medicineId ||
          (it.name || '').trim().toLowerCase() === (m.medicineName || '').trim().toLowerCase()
      );
      if (directMatches.length > 0) {
        const details: StockMutationBatchDetail[] = [];
        directMatches.forEach((it) => {
          const bNo = (it.batchNo || '').trim() || med?.batchNo || '-';
          const eDate = (it.expDate || '').trim() || med?.expDate || '';
          details.push({
            batchNo: bNo,
            expDate: eDate,
            qty: Number(it.qty) || 0
          });
        });
        if (details.length > 0) {
          return { details, sourceLabel: trx.type === 'FAKTUR_PENJUALAN' ? 'Faktur Penjualan' : 'POS Kasir' };
        }
      }
    }
  }

  if (m.type === 'PEMBELIAN' || m.type === 'BATAL_BELI' || m.type === 'RETUR PEMBELIAN') {
    const cleanRef = (m.refNo || '').replace(/^RET-/i, '').trim();
    const inv = ctx.purchaseByInvoiceNo?.get(m.refNo) || ctx.purchaseByInvoiceNo?.get(cleanRef);
    if (inv && Array.isArray(inv.items)) {
      const matched = inv.items.filter(
        (it) =>
          it.medicineId === m.medicineId ||
          (it.name || '').trim().toLowerCase() === (m.medicineName || '').trim().toLowerCase()
      );
      if (matched.length > 0) {
        return {
          details: matched.map((it) => ({
            batchNo: (it.batchNo || '').trim() || med?.batchNo || '-',
            expDate: (it.expDate || '').trim() || med?.expDate || '',
            qty: Number(m.inQty || m.outQty) || Number(it.qty) || 0
          })),
          sourceLabel: 'Faktur Pembelian'
        };
      }
    }
  }

  if (m.type === 'STOK_OPNAME' || m.type === 'STOK_AWAL') {
    const opn = ctx.opnameByRefNo?.get(m.refNo);
    if (opn && Array.isArray(opn.items)) {
      const matchedItem = opn.items.find((it) => it.medicineId === m.medicineId);
      if (matchedItem) {
        if (Array.isArray(matchedItem.batches) && matchedItem.batches.length > 0) {
          const changed = matchedItem.batches.filter((b) => Number(b.difference) !== 0);
          const targetBatches = changed.length > 0 ? changed : matchedItem.batches;
          return {
            details: targetBatches.map((b) => ({
              batchNo: (b.batchNo || '-').trim() || '-',
              expDate: (b.expDate || '').trim(),
              qty:
                Math.abs(Number(b.difference) || 0) ||
                Number(b.physicalStock) ||
                0
            })),
            sourceLabel: 'Stok Opname'
          };
        }
        if (matchedItem.batchNo || matchedItem.expDate) {
          return {
            details: [
              {
                batchNo: (matchedItem.batchNo || '-').trim() || '-',
                expDate: (matchedItem.expDate || '').trim(),
                qty: Number(m.inQty || m.outQty) || 0
              }
            ],
            sourceLabel: 'Stok Opname'
          };
        }
      }
    }
    const parsedNote = parseOpnameBatchNote(m.ket);
    if (parsedNote.length > 0) {
      return { details: parsedNote, sourceLabel: 'Stok Opname' };
    }
  }

  // 4. Fallback to Master Obat active primary batch/ED
  if (med && ((med.batchNo && med.batchNo !== '-') || med.expDate)) {
    return {
      details: [
        {
          batchNo: med.batchNo || '-',
          expDate: med.expDate || '',
          qty: Number(m.inQty || m.outQty) || 0
        }
      ],
      sourceLabel: 'Master Produk'
    };
  }

  return {
    details: [{ batchNo: '-', expDate: '-', qty: 0 }],
    sourceLabel: '-'
  };
}

export function formatBatchDetailsInline(details: StockMutationBatchDetail[]): string {
  if (!details || details.length === 0) return 'Batch: - · ED: -';
  return details
    .map((d) => {
      const b = d.batchNo || '-';
      const ed = d.expDate || '-';
      return d.qty > 0 && details.length > 1
        ? `Batch ${b} (ED: ${ed}) [${d.qty}]`
        : `Batch ${b} (ED: ${ed})`;
    })
    .join(' | ');
}

export function getTransactionTypeShortLabel(type: StockMutation['type'], ket?: string): string {
  const ketLower = String(ket || '').toLowerCase();
  if (type === 'PENJUALAN') {
    if (ketLower.includes('faktur')) return 'Faktur Penjualan';
    if (ketLower.includes('pos') || ketLower.includes('kasir')) return 'Penjualan POS';
    return 'Penjualan';
  }
  switch (type) {
    case 'RESEP_DOKTER':
      return 'POS Resep Klinik';
    case 'PEMBELIAN':
      return 'Pembelian PBF';
    case 'STOK_OPNAME':
      return 'Stok Opname';
    case 'STOK_AWAL':
      return 'Stok Awal';
    case 'RETUR PEMBELIAN':
      return 'Retur Pembelian';
    case 'PENYESUAIAN':
      return 'Penyesuaian';
    case 'TRANSFER_MASUK':
      return 'Transfer Masuk';
    case 'TRANSFER_KELUAR':
      return 'Transfer Keluar';
    case 'BATAL_BELI':
      return 'Batal Pembelian';
    default:
      return type;
  }
}
