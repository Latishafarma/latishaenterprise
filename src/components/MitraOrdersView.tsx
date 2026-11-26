import React, { useState, useMemo } from 'react';
import {
  ShoppingBag,
  Search,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Eye,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Receipt,
  Database,
  X,
  Clock,
  Building2,
  Phone,
  MapPin,
  User,
  AlertTriangle,
  Trash2,
  ShieldCheck,
  CreditCard,
  FileText,
  Download,
  Lock,
  Landmark,
  Image as ImageIcon,
  ZoomIn,
  QrCode
} from 'lucide-react';
import {
  Medicine,
  MitraOrder,
  MitraOrderStatus,
  MitraPaymentStatus,
  PortalOrderRoom
} from '../types';
import { getAvailableBoxStock } from '../utils/batchHelper';
import {
  SUPABASE_MITRA_ORDERS_SQL_SCHEMA,
  SUPABASE_MEDICINES_SQL_SCHEMA
} from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { isDemoMode } from '../utils/demoSandbox';
import { PortalQRGeneratorModal } from './PortalQRGeneratorModal';

export interface ConvertMitraOrderOptions {
  paymentMethod: string;
  term: 'Cash / COD' | '14 Hari' | '30 Hari';
  usePpn: boolean;
  notes: string;
}

interface MitraOrdersViewProps {
  orders: MitraOrder[];
  medicines: Medicine[];
  onUpdateStatus: (orderId: string, status: MitraOrderStatus, adminNotes?: string) => void;
  onValidatePayment: (orderId: string, decision: 'APPROVE' | 'REJECT', rejectionReason?: string) => void;
  onConvertToPOS: (order: MitraOrder, options: ConvertMitraOrderOptions) => { success: boolean; trxId?: string; error?: string };
  onDeleteOrder?: (orderId: string) => void;
  onRefreshSupabase: () => Promise<{ success: boolean; count?: number; error?: string }>;
  onOpenPublicPortal?: () => void;
  onNavigateToSalesHistory?: () => void;
}

const formatRupiah = (num: number): string => {
  return `Rp ${Math.round(num || 0).toLocaleString('id-ID')}`;
};

const getStatusBadgeStyle = (status: MitraOrderStatus): string => {
  switch (status) {
    case 'Pending':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Dikonfirmasi':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'Diproses':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'Selesai':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Dibatalkan':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const getEffectivePaymentStatus = (order: MitraOrder): MitraPaymentStatus => {
  return order.paymentStatus || 'Menunggu Pembayaran';
};

const getPaymentBadgeInfo = (
  paymentStatus: MitraPaymentStatus
): { label: string; className: string } => {
  switch (paymentStatus) {
    case 'Menunggu Verifikasi':
      return {
        label: 'Menunggu Validasi',
        className: 'bg-indigo-50 text-indigo-800 border-indigo-300'
      };
    case 'Lunas':
      return {
        label: 'Lunas',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200'
      };
    case 'Ditolak':
      return {
        label: 'Ditolak',
        className: 'bg-rose-50 text-rose-800 border-rose-200'
      };
    case 'Menunggu Pembayaran':
    default:
      return {
        label: 'Belum Bayar',
        className: 'bg-amber-50 text-amber-800 border-amber-200'
      };
  }
};

export const MitraOrdersView: React.FC<MitraOrdersViewProps> = ({
  orders,
  medicines,
  onUpdateStatus,
  onValidatePayment,
  onConvertToPOS,
  onDeleteOrder,
  onRefreshSupabase,
  onOpenPublicPortal: _onOpenPublicPortal,
  onNavigateToSalesHistory
}) => {
  const [statusFilter, setStatusFilter] = useState<'Semua' | MitraOrderStatus>('Semua');
  const [roomFilter, setRoomFilter] = useState<'Semua' | PortalOrderRoom>('Semua');
  const [paymentFilter, setPaymentFilter] = useState<'Semua' | MitraPaymentStatus>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [adminNotesDraft, setAdminNotesDraft] = useState('');

  const [validationOrderId, setValidationOrderId] = useState<string | null>(null);
  const [rejectionReasonDraft, setRejectionReasonDraft] = useState('');
  const [validationError, setValidationError] = useState('');
  const [zoomProofImage, setZoomProofImage] = useState(false);

  const [convertOrder, setConvertOrder] = useState<MitraOrder | null>(null);
  const [convertPaymentMethod, setConvertPaymentMethod] = useState('Transfer Bank');
  const [convertTerm, setConvertTerm] = useState<'Cash / COD' | '14 Hari' | '30 Hari'>('Cash / COD');
  const [convertUsePpn, setConvertUsePpn] = useState(false);
  const [convertNotes, setConvertNotes] = useState('');
  const [convertError, setConvertError] = useState('');

  const isOwnerAdmin = useIsOwnerAdmin();
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const portalUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/?view=portal-pelanggan';
    const demoQuery = isDemoMode() ? '&mode=demo' : '';
    return `${window.location.origin}/?view=portal-pelanggan${demoQuery}`;
  }, []);

  const detailOrder = useMemo(
    () => orders.find((o) => o.id === detailOrderId) || null,
    [orders, detailOrderId]
  );

  const validationOrder = useMemo(
    () => orders.find((o) => o.id === validationOrderId) || null,
    [orders, validationOrderId]
  );

  const openDetail = (order: MitraOrder) => {
    setDetailOrderId(order.id);
    setAdminNotesDraft(order.adminNotes || '');
  };

  const openValidationModal = (order: MitraOrder) => {
    setValidationOrderId(order.id);
    setRejectionReasonDraft(order.paymentRejectionReason || '');
    setValidationError('');
    setZoomProofImage(false);
  };

  const openConvertModal = (order: MitraOrder) => {
    if (getEffectivePaymentStatus(order) !== 'Lunas') {
      openValidationModal(order);
      return;
    }
    setConvertOrder(order);
    setConvertPaymentMethod(order.paymentMethod || 'Transfer Bank');
    setConvertTerm('Cash / COD');
    setConvertUsePpn(false);
    setConvertNotes(`Konversi Pesanan Portal Mitra ${order.orderCode} - ${order.mitraName}`);
    setConvertError('');
  };

  const handleCopyPortalUrl = () => {
    try {
      navigator.clipboard.writeText(portalUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {}
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshSupabase();
    setIsRefreshing(false);
  };

  const kpi = useMemo(() => {
    const pendingCount = orders.filter((o) => o.status === 'Pending').length;
    const waitingPaymentVerifyCount = orders.filter(
      (o) => getEffectivePaymentStatus(o) === 'Menunggu Verifikasi' && o.status !== 'Dibatalkan'
    ).length;
    const processingCount = orders.filter(
      (o) => o.status === 'Dikonfirmasi' || o.status === 'Diproses'
    ).length;
    const completedCount = orders.filter((o) => o.status === 'Selesai').length;
    const activeOrderValue = orders
      .filter((o) => o.status !== 'Dibatalkan' && o.status !== 'Selesai')
      .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    return {
      pendingCount,
      waitingPaymentVerifyCount,
      processingCount,
      completedCount,
      activeOrderValue
    };
  }, [orders]);

  const resolveOrderRoom = (ord: MitraOrder): PortalOrderRoom =>
    ord.orderRoom || (String(ord.orderCode || '').startsWith('REG-') ? 'REGULER' : 'MITRA');

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((ord) => {
      if (roomFilter !== 'Semua' && resolveOrderRoom(ord) !== roomFilter) return false;
      if (statusFilter !== 'Semua' && ord.status !== statusFilter) return false;
      if (paymentFilter !== 'Semua' && getEffectivePaymentStatus(ord) !== paymentFilter) return false;
      if (!q) return true;
      return (
        ord.orderCode.toLowerCase().includes(q) ||
        ord.mitraName.toLowerCase().includes(q) ||
        (ord.mitraPhone || '').toLowerCase().includes(q) ||
        (ord.picName || '').toLowerCase().includes(q) ||
        ord.items.some((it) => it.name.toLowerCase().includes(q))
      );
    });
  }, [orders, roomFilter, statusFilter, paymentFilter, searchQuery]);

  const getOrderStockIssues = (order: MitraOrder): string[] => {
    const issues: string[] = [];
    order.items.forEach((item) => {
      const med = medicines.find((m) => m.id === item.medicineId);
      if (!med) {
        issues.push(`"${item.name}" tidak ditemukan di Master Obat`);
        return;
      }
      const needKecil = Number(item.qtyTotalKecil) || (Number(item.qtyBox) || 0) * Math.max(1, Number(item.rasioKonversi) || 1);
      if ((Number(med.stock) || 0) < needKecil) {
        const availBox = getAvailableBoxStock(med);
        issues.push(
          `"${item.name}": butuh ${item.qtyBox} ${item.satuanBesar} (${needKecil} ${item.satuanKecil}), stok tersedia ${availBox} ${med.satuanBesar || 'Box'} (${med.stock} ${med.satuanKecil || 'Tab'})`
        );
      }
    });
    return issues;
  };

  const handleConfirmConvert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertOrder) return;
    setConvertError('');

    if (getEffectivePaymentStatus(convertOrder) !== 'Lunas') {
      setConvertError(
        'Pesanan hanya dapat dikonversi ke Faktur Penjualan (POS) setelah bukti pembayaran divalidasi dan disetujui (Lunas) oleh Admin.'
      );
      return;
    }

    const res = onConvertToPOS(convertOrder, {
      paymentMethod: convertPaymentMethod,
      term: convertTerm,
      usePpn: convertUsePpn,
      notes: convertNotes
    });

    if (!res.success) {
      setConvertError(res.error || 'Gagal mengonversi pesanan ke Faktur Penjualan.');
      return;
    }

    setConvertOrder(null);
    if (detailOrderId === convertOrder.id) {
      setDetailOrderId(null);
    }
  };

  const handleApprovePayment = () => {
    if (!validationOrder) return;
    setValidationError('');
    onValidatePayment(validationOrder.id, 'APPROVE');
    setValidationOrderId(null);
  };

  const handleRejectPayment = () => {
    if (!validationOrder) return;
    if (!rejectionReasonDraft.trim()) {
      setValidationError(
        'Harap isi alasan penolakan agar mitra dapat memperbaiki dan mengunggah ulang bukti transfer.'
      );
      return;
    }
    setValidationError('');
    onValidatePayment(validationOrder.id, 'REJECT', rejectionReasonDraft.trim());
    setValidationOrderId(null);
  };

  const statusTabs: Array<'Semua' | MitraOrderStatus> = [
    'Semua',
    'Pending',
    'Dikonfirmasi',
    'Diproses',
    'Selesai',
    'Dibatalkan'
  ];

  return (
    <div className="space-y-5">
      {/* Header & Portal Link Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Pesanan Portal Mandiri (Mitra &amp; Reguler)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manajemen pesanan masuk real-time dari Ruang Order Reguler/Umum (termasuk verifikasi resep) dan Ruang Order Mitra, hingga konversi ke Faktur Penjualan (POS).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 gap-2 text-xs">
            <span className="text-slate-500 font-semibold hidden sm:inline">Tautan Portal:</span>
            <code className="font-mono text-slate-800 font-bold text-[11px] max-w-[200px] truncate">
              {portalUrl}
            </code>
            <button
              type="button"
              onClick={handleCopyPortalUrl}
              className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
              title="Salin Tautan Portal Mitra"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'Tersalin' : 'Salin'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
            title="Buat, Unduh & Cetak QR Code Portal Pelanggan & Mitra untuk dipajang di Apotek"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>QR &amp; Poster Apotek</span>
          </button>

          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Buka Portal Pelanggan</span>
          </a>

          <button
            type="button"
            onClick={handleRefresh}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
            <span>Sync Supabase</span>
          </button>

          {isOwnerAdmin && (
            <button
              type="button"
              onClick={() => setShowSchemaModal(true)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
            >
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>SQL Tabel</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Menunggu Konfirmasi
          </div>
          <div className="text-2xl font-black text-amber-600 font-mono tabular-nums mt-1">
            {kpi.pendingCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Pesanan berstatus Pending</div>
        </div>

        <button
          type="button"
          onClick={() =>
            setPaymentFilter((prev) =>
              prev === 'Menunggu Verifikasi' ? 'Semua' : 'Menunggu Verifikasi'
            )
          }
          className={`text-left rounded-2xl border p-4 transition cursor-pointer ${
            paymentFilter === 'Menunggu Verifikasi'
              ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
              : 'bg-white border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 flex items-center justify-between">
            <span>Validasi Transfer</span>
            {kpi.waitingPaymentVerifyCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
            )}
          </div>
          <div className="text-2xl font-black text-indigo-700 font-mono tabular-nums mt-1">
            {kpi.waitingPaymentVerifyCount}
          </div>
          <div className="text-[11px] text-indigo-600/80 mt-0.5">
            Bukti bayar perlu dicek Admin
          </div>
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Dikonfirmasi / Diproses
          </div>
          <div className="text-2xl font-black text-sky-600 font-mono tabular-nums mt-1">
            {kpi.processingCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Siap diproses setelah Lunas</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Pesanan Selesai
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono tabular-nums mt-1">
            {kpi.completedCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Terkonversi / terkirim</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 col-span-2 lg:col-span-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Nilai Pesanan Aktif
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1 truncate">
            {formatRupiah(kpi.activeOrderValue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Belum terkonversi faktur</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0">
            {statusTabs.map((tab) => {
              const count =
                tab === 'Semua'
                  ? orders.length
                  : orders.filter((o) => o.status === tab).length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition border ${
                    statusFilter === tab
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab} ({count})
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value as 'Semua' | PortalOrderRoom)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
              title="Filter Ruang Order"
            >
              <option value="Semua">Semua Ruang Order</option>
              <option value="REGULER">Ruang Reguler / Umum</option>
              <option value="MITRA">Ruang Mitra (B2B)</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as 'Semua' | MitraPaymentStatus)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
              title="Filter Status Pembayaran"
            >
              <option value="Semua">Semua Pembayaran</option>
              <option value="Menunggu Verifikasi">Menunggu Validasi</option>
              <option value="Menunggu Pembayaran">Belum Bayar</option>
              <option value="Lunas">Lunas (Tervalidasi)</option>
              <option value="Ditolak">Pembayaran Ditolak</option>
            </select>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kode order, mitra, atau obat..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Orders Table */}
        {filteredOrders.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl space-y-2">
            <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">Belum Ada Pesanan Mitra</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Bagikan tautan Portal Order Mandiri Mitra kepada klinik, dokter, atau apotek jejaring untuk menerima pesanan secara real-time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Kode & Waktu</th>
                  <th className="py-3 px-3">Identitas Mitra</th>
                  <th className="py-3 px-3">Item Pesanan</th>
                  <th className="py-3 px-3 text-right">Total Nilai</th>
                  <th className="py-3 px-3">Pembayaran</th>
                  <th className="py-3 px-3">Status Order</th>
                  <th className="py-3 px-3 text-right">Aksi Manajemen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((ord) => {
                  const canConvertStatus = ord.status !== 'Selesai' && ord.status !== 'Dibatalkan';
                  const ordRoom = resolveOrderRoom(ord);
                  const pStatus = getEffectivePaymentStatus(ord);
                  const pBadge = getPaymentBadgeInfo(pStatus);
                  const isPaymentApproved = pStatus === 'Lunas';

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-extrabold text-slate-900">
                            {ord.orderCode}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              ordRoom === 'REGULER'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {ordRoom === 'REGULER' ? 'Reguler' : 'Mitra'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(ord.createdAt).toLocaleString('id-ID')}</span>
                        </div>
                        {ord.rxRequired && (
                          <div className="text-[10px] font-bold text-amber-800 mt-1">
                            {ord.rxRequirementLabel || 'Wajib Resep'}{ord.rxFileUrl ? ' · Resep OK' : ''}
                          </div>
                        )}
                        {ord.convertedTrxId && (
                          <div className="text-[10px] font-mono font-bold text-indigo-700 mt-1">
                            Faktur: {ord.convertedTrxId}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-slate-900">{ord.mitraName}</div>
                        <div className="text-[11px] text-slate-500">
                          {ord.mitraCategory}
                          {ord.picName && ordRoom === 'MITRA' ? ` · PIC: ${ord.picName}` : ''}
                        </div>
                        {ord.mitraPhone && (
                          <div className="text-[11px] font-mono text-slate-500">{ord.mitraPhone}</div>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-slate-800 font-mono tabular-nums">
                          {ord.totalItems} produk · {ord.totalQtyBox} {ordRoom === 'REGULER' ? 'item' : 'kemasan'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                          {ord.items.map((it) => `${it.name} (${it.qtyBox} ${it.unitMode === 'KECIL' ? it.satuanKecil : it.satuanBesar})`).join(', ')}
                        </div>
                      </td>

                      <td className="py-3 px-3 align-top text-right font-mono font-black text-slate-900 tabular-nums">
                        {formatRupiah(ord.totalAmount)}
                      </td>

                      <td className="py-3 px-3 align-top space-y-1">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${pBadge.className}`}
                        >
                          {pBadge.label}
                        </span>
                        {ord.paymentProofUrl && (
                          <div className="text-[10px] font-semibold text-indigo-700 flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" />
                            <span>Bukti terunggah</span>
                          </div>
                        )}
                        {ord.paymentBankTarget && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                            {ord.paymentBankTarget}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${getStatusBadgeStyle(ord.status)}`}
                        >
                          {ord.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openDetail(ord)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detail</span>
                          </button>

                          {ord.status !== 'Dibatalkan' && (
                            <button
                              type="button"
                              onClick={() => openValidationModal(ord)}
                              className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer border ${
                                pStatus === 'Menunggu Verifikasi'
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-xs'
                                  : isPaymentApproved
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                              }`}
                              title="Lihat bukti transfer & validasi pembayaran"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>
                                {pStatus === 'Menunggu Verifikasi'
                                  ? 'Validasi Bayar'
                                  : isPaymentApproved
                                  ? 'Bukti Lunas'
                                  : 'Cek Bayar'}
                              </span>
                            </button>
                          )}

                          {ord.status === 'Pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => onUpdateStatus(ord.id, 'Dikonfirmasi')}
                                className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Terima</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onUpdateStatus(ord.id, 'Dibatalkan')}
                                className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Tolak</span>
                              </button>
                            </>
                          )}

                          {ord.status === 'Dikonfirmasi' && (
                            <button
                              type="button"
                              onClick={() => onUpdateStatus(ord.id, 'Diproses')}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              <span>Proses</span>
                            </button>
                          )}

                          {canConvertStatus && (
                            <button
                              type="button"
                              disabled={!isPaymentApproved}
                              onClick={() => openConvertModal(ord)}
                              className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 ${
                                isPaymentApproved
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              }`}
                              title={
                                isPaymentApproved
                                  ? 'Konversi menjadi Faktur Penjualan & potong stok FEFO otomatis'
                                  : 'Terkunci: Pembayaran harus divalidasi (Lunas) oleh Admin terlebih dahulu'
                              }
                            >
                              {isPaymentApproved ? (
                                <Receipt className="w-3.5 h-3.5" />
                              ) : (
                                <Lock className="w-3.5 h-3.5" />
                              )}
                              <span>Buat Faktur POS</span>
                            </button>
                          )}

                          {ord.status === 'Selesai' && ord.convertedTrxId && onNavigateToSalesHistory && (
                            <button
                              type="button"
                              onClick={onNavigateToSalesHistory}
                              className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Lihat Faktur</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {detailOrder && (() => {
        const detailPaymentStatus = getEffectivePaymentStatus(detailOrder);
        const detailPaymentBadge = getPaymentBadgeInfo(detailPaymentStatus);
        const isDetailPaymentApproved = detailPaymentStatus === 'Lunas';

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900 font-mono">
                      {detailOrder.orderCode}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        resolveOrderRoom(detailOrder) === 'REGULER'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}
                    >
                      {resolveOrderRoom(detailOrder) === 'REGULER' ? 'Ruang Reguler / Umum' : 'Ruang Mitra'}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${getStatusBadgeStyle(detailOrder.status)}`}
                    >
                      {detailOrder.status}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${detailPaymentBadge.className}`}
                    >
                      Bayar: {detailPaymentBadge.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dikirim pada {new Date(detailOrder.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailOrderId(null)}
                  className="w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                {/* Partner Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <Building2 className="w-4 h-4 text-emerald-600" />
                      <span>{detailOrder.mitraName}</span>
                    </div>
                    <div className="text-slate-500 pl-6">{detailOrder.mitraCategory}</div>
                    {detailOrder.picName && (
                      <div className="flex items-center gap-2 text-slate-700">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>PIC: {detailOrder.picName}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-slate-700 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{detailOrder.mitraPhone || '-'}</span>
                    </div>
                    <div className="flex items-start gap-2 text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{detailOrder.mitraAddress || '-'}</span>
                    </div>
                  </div>

                  {detailOrder.notes && (
                    <div className="sm:col-span-2 pt-2 border-t border-slate-200 text-slate-700">
                      <strong className="text-slate-900">Catatan Mitra:</strong> {detailOrder.notes}
                    </div>
                  )}
                </div>

                {/* Payment Verification Summary Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px]">
                        Status Pembayaran & Bukti Transfer
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${detailPaymentBadge.className}`}
                      >
                        {detailPaymentBadge.label}
                      </span>
                    </div>

                    {detailOrder.status !== 'Dibatalkan' && (
                      <button
                        type="button"
                        onClick={() => openValidationModal(detailOrder)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Validasi Pembayaran</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <div>
                      <span className="text-slate-500 block">Bank Tujuan Transfer</span>
                      <span className="font-bold text-slate-900">
                        {detailOrder.paymentBankTarget || 'Belum dipilih mitra'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Waktu Unggah Bukti</span>
                      <span className="font-bold text-slate-900">
                        {detailOrder.paymentUploadedAt
                          ? new Date(detailOrder.paymentUploadedAt).toLocaleString('id-ID')
                          : 'Belum diunggah'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Verifikasi Admin</span>
                      <span className="font-bold text-slate-900">
                        {detailOrder.paymentVerifiedBy
                          ? `${detailOrder.paymentVerifiedBy} (${detailOrder.paymentVerifiedAt ? new Date(detailOrder.paymentVerifiedAt).toLocaleString('id-ID') : '-'})`
                          : 'Belum divalidasi'}
                      </span>
                    </div>
                  </div>

                  {detailOrder.paymentRejectionReason && detailPaymentStatus === 'Ditolak' && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                      <strong>Alasan Penolakan Pembayaran:</strong> {detailOrder.paymentRejectionReason}
                    </div>
                  )}

                  {detailOrder.paymentProofUrl ? (
                    <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ImageIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                        <div className="truncate">
                          <div className="font-bold text-slate-900 truncate">
                            {detailOrder.paymentProofName || 'bukti-pembayaran'}
                          </div>
                          <div className="text-[10px] text-indigo-700">
                            Klik &quot;Validasi Pembayaran&quot; untuk melihat pratinjau penuh dan menyetujui/menolak pembayaran.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openValidationModal(detailOrder)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 font-bold hover:bg-indigo-50 shrink-0 cursor-pointer"
                      >
                        Pratinjau Bukti
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                      Mitra belum mengunggah bukti transfer. Pesanan tidak dapat dikonversi menjadi Faktur Penjualan POS sebelum pembayaran berstatus <strong>Lunas</strong>.
                    </div>
                  )}
                </div>

                {/* Prescription File Verification Section (if Rx Required / Uploaded) */}
                {(detailOrder.rxRequired || detailOrder.rxFileUrl) && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-700" />
                        <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px]">
                          Lampiran Resep Dokter · {detailOrder.rxRequirementLabel || 'Wajib Resep'}
                        </h4>
                      </div>
                      {detailOrder.rxFileUrl && (
                        <a
                          href={detailOrder.rxFileUrl}
                          download={detailOrder.rxFileName || `resep-${detailOrder.orderCode}`}
                          className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-[11px] flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Unduh Resep</span>
                        </a>
                      )}
                    </div>
                    {detailOrder.rxFileUrl ? (
                      detailOrder.rxFileUrl.startsWith('data:application/pdf') ||
                      (detailOrder.rxFileName || '').toLowerCase().endsWith('.pdf') ? (
                        <iframe
                          src={detailOrder.rxFileUrl}
                          title="Pratinjau Resep Dokter PDF"
                          className="w-full h-64 rounded-xl border border-amber-200 bg-white"
                        />
                      ) : (
                        <img
                          src={detailOrder.rxFileUrl}
                          alt={`Resep ${detailOrder.orderCode}`}
                          className="w-full max-h-64 object-contain rounded-xl border border-amber-200 bg-white"
                        />
                      )
                    ) : (
                      <div className="text-[11px] text-amber-900 font-semibold">
                        Pesanan menandai item wajib resep, namun file resep belum terbaca.
                      </div>
                    )}
                  </div>
                )}

                {/* Ordered Items + Live Warehouse Stock Comparison */}
                <div className="space-y-2">
                  <h4 className="font-extrabold uppercase tracking-wider text-slate-500 text-[11px]">
                    Rincian Obat Dipesan &amp; Cek Ketersediaan Stok Gudang
                  </h4>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                          <th className="py-2.5 px-3">Nama Obat</th>
                          <th className="py-2.5 px-3 text-right">Qty Pesanan</th>
                          <th className="py-2.5 px-3 text-right">Stok Saat Ini</th>
                          <th className="py-2.5 px-3 text-right">Harga / Satuan</th>
                          <th className="py-2.5 px-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailOrder.items.map((it, idx) => {
                          const med = medicines.find((m) => m.id === it.medicineId);
                          const availKecil = med ? Number(med.stock) || 0 : 0;
                          const availBox = med ? getAvailableBoxStock(med) : 0;
                          const needKecil = Number(it.qtyTotalKecil) || it.qtyBox * Math.max(1, it.rasioKonversi || 1);
                          const isEnough = med ? availKecil >= needKecil : false;
                          const isSmallMode = it.unitMode === 'KECIL';
                          return (
                            <tr key={`${it.medicineId}-${idx}`}>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">
                                  {it.name} {it.kekuatan !== '-' ? it.kekuatan : ''}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {it.kelas}
                                  {it.rxRequirementLabel ? ` · ${it.rxRequirementLabel}` : ''}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                <div className="font-bold text-slate-900">
                                  {it.qtyBox} {isSmallMode ? it.satuanKecil : it.satuanBesar}
                                </div>
                                {!isSmallMode && (
                                  <div className="text-[10px] text-slate-400">
                                    ({needKecil.toLocaleString('id-ID')} {it.satuanKecil})
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                <span
                                  className={`font-bold ${
                                    isEnough ? 'text-emerald-700' : 'text-rose-600'
                                  }`}
                                >
                                  {availBox} {med?.satuanBesar || it.satuanBesar}
                                </span>
                                <div className="text-[10px] text-slate-400">
                                  ({availKecil.toLocaleString('id-ID')} {med?.satuanKecil || it.satuanKecil})
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                {formatRupiah(it.unitPriceBox)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                                {formatRupiah(it.subtotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t border-slate-200">
                          <td colSpan={4} className="py-3 px-3 text-right font-bold text-slate-700">
                            Total Estimasi Pesanan
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-base text-emerald-700 tabular-nums">
                            {formatRupiah(detailOrder.totalAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Admin Notes */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Catatan Admin / Konfirmasi Pengiriman (Terlihat oleh Mitra)
                  </label>
                  <textarea
                    rows={2}
                    value={adminNotesDraft}
                    onChange={(e) => setAdminNotesDraft(e.target.value)}
                    placeholder="Contoh: Pesanan sedang disiapkan, estimasi kurir berangkat pukul 14.00 WIB."
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-emerald-500 outline-none resize-none"
                  />
                </div>
              </div>

              {/* Footer Action Bar */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {onDeleteOrder && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteOrder(detailOrder.id);
                        setDetailOrderId(null);
                      }}
                      className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {detailOrder.status !== 'Dibatalkan' && detailOrder.status !== 'Selesai' && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateStatus(detailOrder.id, 'Dibatalkan', adminNotesDraft);
                      }}
                      className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                    >
                      Tolak / Batalkan
                    </button>
                  )}

                  {detailOrder.status === 'Pending' && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateStatus(detailOrder.id, 'Dikonfirmasi', adminNotesDraft);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Terima / Konfirmasi
                    </button>
                  )}

                  {(detailOrder.status === 'Pending' || detailOrder.status === 'Dikonfirmasi') && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateStatus(detailOrder.id, 'Diproses', adminNotesDraft);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Tandai Diproses
                    </button>
                  )}

                  {detailOrder.status !== 'Dibatalkan' && (
                    <button
                      type="button"
                      onClick={() => openValidationModal(detailOrder)}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Validasi Pembayaran</span>
                    </button>
                  )}

                  {detailOrder.status !== 'Selesai' && detailOrder.status !== 'Dibatalkan' && (
                    <button
                      type="button"
                      disabled={!isDetailPaymentApproved}
                      onClick={() => {
                        if (adminNotesDraft !== (detailOrder.adminNotes || '')) {
                          onUpdateStatus(detailOrder.id, detailOrder.status, adminNotesDraft);
                        }
                        openConvertModal(detailOrder);
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm ${
                        isDetailPaymentApproved
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                          : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      }`}
                      title={
                        isDetailPaymentApproved
                          ? 'Konversi ke Faktur Penjualan POS'
                          : 'Pembayaran wajib divalidasi (Lunas) oleh Admin terlebih dahulu'
                      }
                    >
                      {isDetailPaymentApproved ? (
                        <Receipt className="w-4 h-4" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                      <span>
                        {isDetailPaymentApproved
                          ? 'Konversi ke Faktur Penjualan (POS)'
                          : 'Faktur POS Terkunci (Belum Lunas)'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Payment Proof Preview & Admin Validation Modal */}
      {validationOrder && (() => {
        const valPaymentStatus = getEffectivePaymentStatus(validationOrder);
        const valBadge = getPaymentBadgeInfo(valPaymentStatus);
        const proofUrl = validationOrder.paymentProofUrl || '';
        const isPdf =
          proofUrl.startsWith('data:application/pdf') ||
          (validationOrder.paymentProofName || '').toLowerCase().endsWith('.pdf');
        const isLockedOrder =
          validationOrder.status === 'Selesai' || validationOrder.status === 'Dibatalkan';

        return (
          <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Validasi Bukti Pembayaran Mitra
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${valBadge.className}`}
                    >
                      {valBadge.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {validationOrder.orderCode} · {validationOrder.mitraName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setValidationOrderId(null)}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                {/* Transfer Details Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900 text-white rounded-2xl p-4">
                  <div>
                    <div className="text-[10px] uppercase text-slate-400 font-bold">
                      Total Tagihan
                    </div>
                    <div className="text-lg font-black text-emerald-400 font-mono tabular-nums mt-0.5">
                      {formatRupiah(validationOrder.totalAmount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-400 font-bold">
                      Rekening Tujuan
                    </div>
                    <div className="font-bold text-white mt-0.5 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">
                        {validationOrder.paymentBankTarget || 'Belum dipilih'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-400 font-bold">
                      Waktu Unggah
                    </div>
                    <div className="font-semibold text-slate-200 mt-0.5">
                      {validationOrder.paymentUploadedAt
                        ? new Date(validationOrder.paymentUploadedAt).toLocaleString('id-ID')
                        : 'Belum diunggah'}
                    </div>
                  </div>
                </div>

                {/* Proof Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px]">
                      Pratinjau Bukti Pembayaran
                    </span>
                    {proofUrl && (
                      <div className="flex items-center gap-2">
                        {!isPdf && (
                          <button
                            type="button"
                            onClick={() => setZoomProofImage((z) => !z)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                            <span>{zoomProofImage ? 'Perkecil' : 'Perbesar'}</span>
                          </button>
                        )}
                        <a
                          href={proofUrl}
                          download={
                            validationOrder.paymentProofName ||
                            `bukti-${validationOrder.orderCode}.${isPdf ? 'pdf' : 'jpg'}`
                          }
                          className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Unduh File</span>
                        </a>
                      </div>
                    )}
                  </div>

                  {proofUrl ? (
                    isPdf ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <div className="flex items-center gap-2.5 text-slate-800">
                          <FileText className="w-6 h-6 text-rose-600 shrink-0" />
                          <div>
                            <div className="font-bold">
                              {validationOrder.paymentProofName || 'Dokumen Bukti Transfer.pdf'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Dokumen PDF terlampir. Gunakan pratinjau di bawah atau klik Unduh File.
                            </div>
                          </div>
                        </div>
                        <iframe
                          src={proofUrl}
                          title="Pratinjau Bukti Pembayaran PDF"
                          className="w-full h-72 rounded-xl border border-slate-200 bg-white"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 flex flex-col items-center justify-center">
                        <img
                          src={proofUrl}
                          alt={`Bukti Transfer ${validationOrder.orderCode}`}
                          className={`rounded-xl object-contain transition-all border border-slate-200 bg-white ${
                            zoomProofImage ? 'max-h-[70vh] w-full' : 'max-h-72 w-auto'
                          }`}
                        />
                        {validationOrder.paymentProofName && (
                          <span className="text-[11px] text-slate-500 mt-2 font-mono">
                            {validationOrder.paymentProofName}
                          </span>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center space-y-1.5">
                      <AlertTriangle className="w-7 h-7 text-amber-600 mx-auto" />
                      <div className="font-bold text-amber-900">
                        Belum Ada File Bukti Transfer yang Diunggah
                      </div>
                      <p className="text-[11px] text-amber-800 max-w-md mx-auto">
                        Mitra belum mengunggah foto struk atau file PDF di Portal Mitra. Jika mutasi dana telah terkonfirmasi masuk ke rekening bank apotek, Admin tetap dapat menyetujui pembayaran secara manual.
                      </p>
                    </div>
                  )}
                </div>

                {/* Previous Verification / Rejection Info */}
                {validationOrder.paymentVerifiedBy && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                    Riwayat validasi terakhir: <strong>{valBadge.label}</strong> oleh{' '}
                    <strong>{validationOrder.paymentVerifiedBy}</strong> pada{' '}
                    {validationOrder.paymentVerifiedAt
                      ? new Date(validationOrder.paymentVerifiedAt).toLocaleString('id-ID')
                      : '-'}
                  </div>
                )}

                {/* Rejection Reason Input */}
                {!isLockedOrder && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Alasan Penolakan (Wajib diisi jika menolak bukti transfer)
                    </label>
                    <textarea
                      rows={2}
                      value={rejectionReasonDraft}
                      onChange={(e) => {
                        setRejectionReasonDraft(e.target.value);
                        if (validationError) setValidationError('');
                      }}
                      placeholder="Contoh: Nominal transfer kurang Rp 15.000 / Foto struk buram / Dana belum masuk mutasi BRI."
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>
                )}

                {validationError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                    {validationError}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setValidationOrderId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Tutup
                </button>

                {!isLockedOrder && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRejectPayment}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Tolak Pembayaran</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleApprovePayment}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Setujui Pembayaran / Lunas</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Convert to Faktur Penjualan (POS) Modal */}
      {convertOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmConvert}
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
          >
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Konversi ke Faktur Penjualan (POS)
                </h3>
                <p className="text-[11px] text-slate-500">
                  {convertOrder.orderCode} · {convertOrder.mitraName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConvertOrder(null)}
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Stock validation preview */}
              {(() => {
                const issues = getOrderStockIssues(convertOrder);
                if (issues.length === 0) {
                  return (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>
                        Semua stok obat tersedia dan siap dipotong otomatis menggunakan metode FEFO (batch ED terdekat keluar lebih dulu) serta tersinkron ke Supabase.
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Peringatan Ketersediaan Stok</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {issues.map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Metode Pembayaran</label>
                  <select
                    value={convertPaymentMethod}
                    onChange={(e) => setConvertPaymentMethod(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 outline-none"
                  >
                    <option value="Transfer Bank">Transfer Bank</option>
                    <option value="Cash / COD">Cash / COD</option>
                    <option value="QRIS">QRIS</option>
                    <option value="Tempo / Piutang Mitra">Tempo / Piutang Mitra</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Termin Pembayaran</label>
                  <select
                    value={convertTerm}
                    onChange={(e) => setConvertTerm(e.target.value as 'Cash / COD' | '14 Hari' | '30 Hari')}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 outline-none"
                  >
                    <option value="Cash / COD">Cash / COD (Lunas)</option>
                    <option value="14 Hari">Tempo 14 Hari</option>
                    <option value="30 Hari">Tempo 30 Hari</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={convertUsePpn}
                  onChange={(e) => setConvertUsePpn(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="font-bold text-slate-800">Tambahkan PPN 11% pada Faktur Penjualan</span>
              </label>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Keterangan Faktur</label>
                <input
                  type="text"
                  value={convertNotes}
                  onChange={(e) => setConvertNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-slate-800 outline-none"
                />
              </div>

              {/* Financial Summary */}
              {(() => {
                const dpp = convertOrder.totalAmount;
                const ppn = convertUsePpn ? Math.round(dpp * 0.11) : 0;
                const grand = dpp + ppn;
                return (
                  <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-1.5 font-mono tabular-nums">
                    <div className="flex justify-between text-slate-300">
                      <span>Subtotal (DPP)</span>
                      <span>{formatRupiah(dpp)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>PPN 11%</span>
                      <span>{formatRupiah(ppn)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-700 text-base font-black text-emerald-400">
                      <span>Total Faktur</span>
                      <span>{formatRupiah(grand)}</span>
                    </div>
                  </div>
                );
              })()}

              {convertError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                  {convertError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConvertOrder(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Terbitkan Faktur & Potong Stok</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SQL Schema Modal for Supabase Setup */}
      {isOwnerAdmin && showSchemaModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Skema SQL Supabase — Tabel pesanan_mitra & master_obat
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Salin & jalankan pada SQL Editor Dashboard Supabase untuk mengaktifkan tabel & Realtime.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSchemaModal(false)}
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <pre className="p-4 rounded-2xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto leading-relaxed">
                {`${SUPABASE_MITRA_ORDERS_SQL_SCHEMA}\n\n${SUPABASE_MEDICINES_SQL_SCHEMA}`}
              </pre>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(
                      `${SUPABASE_MITRA_ORDERS_SQL_SCHEMA}\n\n${SUPABASE_MEDICINES_SQL_SCHEMA}`
                    );
                    setCopiedSchema(true);
                    setTimeout(() => setCopiedSchema(false), 2000);
                  } catch {}
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedSchema ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSchema ? 'Skema Tersalin!' : 'Salin Skema SQL'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <PortalQRGeneratorModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        defaultTarget="unified"
        onOpenPortalPreview={_onOpenPublicPortal ? () => _onOpenPublicPortal() : undefined}
      />
    </div>
  );
};
