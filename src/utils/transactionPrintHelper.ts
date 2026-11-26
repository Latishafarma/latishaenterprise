import { CartItem, Transaction } from '../types';

export interface DocumentTransactionSummary {
  isKlinikPath: boolean;
  productItems: CartItem[];
  jasaItems: CartItem[];
  jasaItemsCount: number;
  jasaItemsTotal: number;
  serviceChargeAmount: number;
  totalJasaPelayanan: number;
  displayedSubtotal: number;
}

export function isJasaCartItem(item?: Partial<CartItem> | null): boolean {
  if (!item) return false;
  const id = String(item.id || '').trim().toUpperCase();
  const unit = String(item.unit || '').trim().toLowerCase();
  return id.startsWith('JASA-') || unit === 'layanan';
}

export function summarizeTransactionForDocument(trx?: Transaction | null): DocumentTransactionSummary {
  if (!trx) {
    return {
      isKlinikPath: false,
      productItems: [],
      jasaItems: [],
      jasaItemsCount: 0,
      jasaItemsTotal: 0,
      serviceChargeAmount: 0,
      totalJasaPelayanan: 0,
      displayedSubtotal: 0
    };
  }

  const items = Array.isArray(trx.items) ? trx.items : [];
  const hasJasaItem = items.some(isJasaCartItem);
  const isKlinikPath = trx.type === 'KLINIK' || hasJasaItem;

  if (!isKlinikPath) {
    return {
      isKlinikPath: false,
      productItems: items,
      jasaItems: [],
      jasaItemsCount: 0,
      jasaItemsTotal: 0,
      serviceChargeAmount: Number(trx.serviceCharge) || 0,
      totalJasaPelayanan: 0,
      displayedSubtotal: Number(trx.subtotal) || 0
    };
  }

  const jasaItems = items.filter(isJasaCartItem);
  const productItems = items.filter((it) => !isJasaCartItem(it));
  const jasaItemsTotal = jasaItems.reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0);
  const serviceChargeAmount = Number(trx.serviceCharge) || 0;
  const totalJasaPelayanan = jasaItemsTotal + serviceChargeAmount;
  const productSubtotal = productItems.reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0);
  const displayedSubtotal = Math.max(Number(trx.subtotal) || 0, productSubtotal + totalJasaPelayanan);

  return {
    isKlinikPath: true,
    productItems,
    jasaItems,
    jasaItemsCount: jasaItems.length + (serviceChargeAmount > 0 ? 1 : 0),
    jasaItemsTotal,
    serviceChargeAmount,
    totalJasaPelayanan,
    displayedSubtotal
  };
}

export function getDefaultKwitansiKeterangan(trx?: Transaction | null): string {
  if (!trx) return '';
  const desc = (trx.description || '').trim();
  if (desc) return desc;

  const summary = summarizeTransactionForDocument(trx);
  if (summary.isKlinikPath) {
    if (summary.totalJasaPelayanan > 0 && summary.productItems.length > 0) {
      return 'Pembayaran Obat Resep & Jasa Pelayanan Klinik';
    }
    if (summary.totalJasaPelayanan > 0) {
      return 'Pembayaran Jasa Pelayanan Klinik';
    }
    return 'Pembayaran Obat Resep Pasien Klinik';
  }
  if (trx.type === 'FAKTUR_PENJUALAN') {
    return `Pembayaran Faktur Penjualan ${trx.id}`;
  }
  return 'Pembayaran Pembelian Obat / Alat Kesehatan';
}
