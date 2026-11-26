import React, { useMemo, useState } from 'react';
import {
  BadgePercent,
  Check,
  Copy,
  Database,
  Edit3,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Layers,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  TicketPercent,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import {
  DiscountBasis,
  DiscountChannelScope,
  DiscountValueType,
  Medicine,
  PromoAd,
  PromoBannerTheme,
  SalesDiscount
} from '../types';
import {
  DISCOUNT_BASIS_LABELS,
  DISCOUNT_CHANNEL_LABELS,
  PROMO_BANNER_THEMES,
  formatDiscountShortBadge,
  getTodayIsoDate,
  isWithinDateWindow
} from '../utils/discountHelper';
import { SUPABASE_PROMO_DISCOUNT_SQL_SCHEMA } from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';

interface DiscountPromoViewProps {
  discounts: SalesDiscount[];
  promos: PromoAd[];
  medicines: Medicine[];
  onSaveDiscount: (d: SalesDiscount, isEdit: boolean) => void;
  onDeleteDiscount: (id: string) => void;
  onToggleDiscountActive: (id: string) => void;
  onSavePromo: (p: PromoAd, isEdit: boolean) => void;
  onDeletePromo: (id: string) => void;
  onTogglePromoActive: (id: string) => void;
  onSyncSupabase: () => Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  needsTableSetup?: boolean;
  isDemoSandbox?: boolean;
  onOpenPortalPreview?: () => void;
}

const DEFAULT_CATEGORIES = [
  'Obat Bebas',
  'Obat Bebas Terbatas',
  'Obat Keras',
  'Psikotropika',
  'Narkotika',
  'Vitamin & Suplemen',
  'Alkes & BMHP',
  'Herbal / Fitofarmaka'
];

const compressBannerImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Format gambar harus JPG, PNG, atau WEBP.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar banner.'));
    reader.onload = () => {
      const raw = reader.result as string;
      const img = new window.Image();
      img.onerror = () => resolve(raw);
      img.onload = () => {
        const maxW = 1280;
        const maxH = 540;
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(raw);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
};

export const DiscountPromoView: React.FC<DiscountPromoViewProps> = ({
  discounts,
  promos,
  medicines,
  onSaveDiscount,
  onDeleteDiscount,
  onToggleDiscountActive,
  onSavePromo,
  onDeletePromo,
  onTogglePromoActive,
  onSyncSupabase,
  needsTableSetup = false,
  isDemoSandbox = false,
  onOpenPortalPreview
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'ALL' | 'DISCOUNT' | 'PROMO'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Sync feedback & SQL setup modal
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const isOwnerAdmin = useIsOwnerAdmin();
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Discount Modal State
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [medPickerSearch, setMedPickerSearch] = useState('');
  const [discountFormError, setDiscountFormError] = useState('');
  const [discountForm, setDiscountForm] = useState<{
    name: string;
    code: string;
    autoApply: boolean;
    basis: DiscountBasis;
    targetMedicineIds: string[];
    targetCategories: string[];
    targetTherapyClasses: string[];
    valueType: DiscountValueType;
    value: number;
    maxDiscountAmount: number;
    minPurchaseAmount: number;
    minQty: number;
    channelScope: DiscountChannelScope;
    startDate: string;
    endDate: string;
    description: string;
    isActive: boolean;
  }>({
    name: '',
    code: '',
    autoApply: true,
    basis: 'ALL_ITEMS',
    targetMedicineIds: [],
    targetCategories: [],
    targetTherapyClasses: [],
    valueType: 'PERCENT',
    value: 10,
    maxDiscountAmount: 0,
    minPurchaseAmount: 0,
    minQty: 1,
    channelScope: 'ALL',
    startDate: getTodayIsoDate(),
    endDate: '',
    description: '',
    isActive: true
  });

  // Promo Modal State
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [promoFormError, setPromoFormError] = useState('');
  const [promoForm, setPromoForm] = useState<{
    title: string;
    badgeText: string;
    subtitle: string;
    description: string;
    highlightText: string;
    promoCode: string;
    linkedDiscountId: string;
    ctaText: string;
    ctaFilterCategory: string;
    ctaFilterKelas: string;
    ctaSearchQuery: string;
    theme: PromoBannerTheme;
    bannerImageUrl: string;
    priority: number;
    startDate: string;
    endDate: string;
    showOnMitraPortal: boolean;
    isActive: boolean;
  }>({
    title: '',
    badgeText: 'PROMO MITRA',
    subtitle: '',
    description: '',
    highlightText: 'HEMAT 15%',
    promoCode: '',
    linkedDiscountId: '',
    ctaText: 'Lihat Produk Promo',
    ctaFilterCategory: '',
    ctaFilterKelas: '',
    ctaSearchQuery: '',
    theme: 'emerald-clinical',
    bannerImageUrl: '',
    priority: 1,
    startDate: getTodayIsoDate(),
    endDate: '',
    showOnMitraPortal: true,
    isActive: true
  });

  // Derive master categories & therapy classes
  const availableCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    medicines.forEach((m) => {
      if (m.category && m.category.trim()) set.add(m.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [medicines]);

  const availableTherapyClasses = useMemo(() => {
    const set = new Set<string>();
    medicines.forEach((m) => {
      if (m.kelas && m.kelas.trim() && m.kelas.trim() !== '-') set.add(m.kelas.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [medicines]);

  const pickerMedicines = useMemo(() => {
    const q = medPickerSearch.trim().toLowerCase();
    const list = q
      ? medicines.filter(
          (m) =>
            (m.name || '').toLowerCase().includes(q) ||
            (m.kekuatan || '').toLowerCase().includes(q) ||
            (m.kelas || '').toLowerCase().includes(q) ||
            (m.id || '').toLowerCase().includes(q)
        )
      : medicines;
    return list.slice(0, 60);
  }, [medicines, medPickerSearch]);

  // Metrics
  const today = getTodayIsoDate();
  const activeDiscountsCount = useMemo(
    () => discounts.filter((d) => d.isActive && isWithinDateWindow(d.startDate, d.endDate, today)).length,
    [discounts, today]
  );
  const livePromosCount = useMemo(
    () =>
      promos.filter((p) => p.isActive && p.showOnMitraPortal && isWithinDateWindow(p.startDate, p.endDate, today))
        .length,
    [promos, today]
  );
  const mitraTargetedDiscountsCount = useMemo(
    () =>
      discounts.filter(
        (d) => d.isActive && (d.channelScope === 'ALL' || d.channelScope === 'MITRA' || d.channelScope === 'PORTAL_MITRA')
      ).length,
    [discounts]
  );

  // Filtered Lists
  const filteredDiscounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return discounts.filter((d) => {
      const activeNow = d.isActive && isWithinDateWindow(d.startDate, d.endDate, today);
      if (statusFilter === 'ACTIVE' && !activeNow) return false;
      if (statusFilter === 'INACTIVE' && activeNow) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.code || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q) ||
        DISCOUNT_BASIS_LABELS[d.basis].toLowerCase().includes(q)
      );
    });
  }, [discounts, searchQuery, statusFilter, today]);

  const filteredPromos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...promos]
      .sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99))
      .filter((p) => {
        const liveNow = p.isActive && isWithinDateWindow(p.startDate, p.endDate, today);
        if (statusFilter === 'ACTIVE' && !liveNow) return false;
        if (statusFilter === 'INACTIVE' && liveNow) return false;
        if (!q) return true;
        return (
          p.title.toLowerCase().includes(q) ||
          p.subtitle.toLowerCase().includes(q) ||
          (p.promoCode || '').toLowerCase().includes(q) ||
          (p.badgeText || '').toLowerCase().includes(q)
        );
      });
  }, [promos, searchQuery, statusFilter, today]);

  const openAddDiscountModal = () => {
    setEditingDiscountId(null);
    setDiscountFormError('');
    setMedPickerSearch('');
    setDiscountForm({
      name: '',
      code: '',
      autoApply: true,
      basis: 'ALL_ITEMS',
      targetMedicineIds: [],
      targetCategories: [],
      targetTherapyClasses: [],
      valueType: 'PERCENT',
      value: 10,
      maxDiscountAmount: 0,
      minPurchaseAmount: 0,
      minQty: 1,
      channelScope: 'ALL',
      startDate: getTodayIsoDate(),
      endDate: '',
      description: '',
      isActive: true
    });
    setShowDiscountModal(true);
  };

  const openEditDiscountModal = (d: SalesDiscount) => {
    setEditingDiscountId(d.id);
    setDiscountFormError('');
    setMedPickerSearch('');
    setDiscountForm({
      name: d.name,
      code: d.code || '',
      autoApply: d.autoApply,
      basis: d.basis,
      targetMedicineIds: d.targetMedicineIds || [],
      targetCategories: d.targetCategories || [],
      targetTherapyClasses: d.targetTherapyClasses || [],
      valueType: d.valueType,
      value: d.value,
      maxDiscountAmount: d.maxDiscountAmount || 0,
      minPurchaseAmount: d.minPurchaseAmount || 0,
      minQty: d.minQty || 1,
      channelScope: d.channelScope,
      startDate: d.startDate || getTodayIsoDate(),
      endDate: d.endDate || '',
      description: d.description || '',
      isActive: d.isActive
    });
    setShowDiscountModal(true);
  };

  const handleSaveDiscountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountForm.name.trim()) {
      setDiscountFormError('Nama program diskon wajib diisi.');
      return;
    }
    if (discountForm.value <= 0) {
      setDiscountFormError('Nilai potongan harus lebih besar dari 0.');
      return;
    }
    if (discountForm.valueType === 'PERCENT' && discountForm.value > 100) {
      setDiscountFormError('Potongan persentase maksimal 100%.');
      return;
    }
    if (discountForm.basis === 'SPECIFIC_MEDICINE' && discountForm.targetMedicineIds.length === 0) {
      setDiscountFormError('Pilih minimal 1 produk obat untuk basis "Produk Obat Tertentu".');
      return;
    }
    if (discountForm.basis === 'CATEGORY' && discountForm.targetCategories.length === 0) {
      setDiscountFormError('Pilih minimal 1 kategori obat untuk basis "Kategori Obat".');
      return;
    }
    if (discountForm.basis === 'THERAPY_CLASS' && discountForm.targetTherapyClasses.length === 0) {
      setDiscountFormError('Pilih minimal 1 kelas terapi untuk basis "Kelas Terapi Obat".');
      return;
    }
    if (discountForm.basis === 'MIN_PURCHASE' && discountForm.minPurchaseAmount <= 0) {
      setDiscountFormError('Masukkan nominal minimal total belanja (Rp).');
      return;
    }
    if (discountForm.basis === 'MIN_QTY' && discountForm.minQty < 2) {
      setDiscountFormError('Masukkan minimal Qty pembelian (minimal 2).');
      return;
    }
    if (!discountForm.autoApply && !discountForm.code.trim()) {
      setDiscountFormError('Isi Kode Voucher jika mode Terapkan Otomatis dimatikan.');
      return;
    }

    const existing = editingDiscountId ? discounts.find((x) => x.id === editingDiscountId) : null;
    const nowIso = new Date().toISOString();
    const record: SalesDiscount = {
      id: existing ? existing.id : `DSC-${Date.now().toString().slice(-6)}`,
      name: discountForm.name.trim(),
      code: discountForm.code.trim().toUpperCase(),
      autoApply: discountForm.autoApply,
      basis: discountForm.basis,
      targetMedicineIds: discountForm.basis === 'SPECIFIC_MEDICINE' ? discountForm.targetMedicineIds : [],
      targetCategories: discountForm.basis === 'CATEGORY' ? discountForm.targetCategories : [],
      targetTherapyClasses: discountForm.basis === 'THERAPY_CLASS' ? discountForm.targetTherapyClasses : [],
      valueType: discountForm.valueType,
      value: Number(discountForm.value) || 0,
      maxDiscountAmount: discountForm.valueType === 'PERCENT' ? Number(discountForm.maxDiscountAmount) || 0 : 0,
      minPurchaseAmount: Number(discountForm.minPurchaseAmount) || 0,
      minQty: Number(discountForm.minQty) || 0,
      channelScope: discountForm.channelScope,
      startDate: discountForm.startDate,
      endDate: discountForm.endDate,
      description: discountForm.description.trim(),
      isActive: discountForm.isActive,
      createdAt: existing ? existing.createdAt : nowIso,
      updatedAt: nowIso
    };

    onSaveDiscount(record, Boolean(existing));
    setShowDiscountModal(false);
    setSyncNotice({
      type: 'ok',
      text: `Diskon "${record.name}" berhasil disimpan & aktif di sistem.`
    });
    setTimeout(() => setSyncNotice(null), 4000);
  };

  const openAddPromoModal = () => {
    setEditingPromoId(null);
    setPromoFormError('');
    setPromoForm({
      title: '',
      badgeText: 'PROMO MITRA',
      subtitle: '',
      description: '',
      highlightText: 'HEMAT 15%',
      promoCode: '',
      linkedDiscountId: '',
      ctaText: 'Pesan Sekarang',
      ctaFilterCategory: '',
      ctaFilterKelas: '',
      ctaSearchQuery: '',
      theme: 'emerald-clinical',
      bannerImageUrl: '',
      priority: promos.length + 1,
      startDate: getTodayIsoDate(),
      endDate: '',
      showOnMitraPortal: true,
      isActive: true
    });
    setShowPromoModal(true);
  };

  const openEditPromoModal = (p: PromoAd) => {
    setEditingPromoId(p.id);
    setPromoFormError('');
    setPromoForm({
      title: p.title,
      badgeText: p.badgeText || 'PROMO MITRA',
      subtitle: p.subtitle,
      description: p.description || '',
      highlightText: p.highlightText || '',
      promoCode: p.promoCode || '',
      linkedDiscountId: p.linkedDiscountId || '',
      ctaText: p.ctaText || 'Pesan Sekarang',
      ctaFilterCategory: p.ctaFilterCategory || '',
      ctaFilterKelas: p.ctaFilterKelas || '',
      ctaSearchQuery: p.ctaSearchQuery || '',
      theme: p.theme || 'emerald-clinical',
      bannerImageUrl: p.bannerImageUrl || '',
      priority: p.priority || 1,
      startDate: p.startDate || getTodayIsoDate(),
      endDate: p.endDate || '',
      showOnMitraPortal: p.showOnMitraPortal,
      isActive: p.isActive
    });
    setShowPromoModal(true);
  };

  const handleLinkDiscountToPromo = (discountId: string) => {
    const matched = discounts.find((d) => d.id === discountId);
    setPromoForm((prev) => ({
      ...prev,
      linkedDiscountId: discountId,
      promoCode: matched?.code ? matched.code : prev.promoCode,
      highlightText: matched ? formatDiscountShortBadge(matched).toUpperCase() : prev.highlightText
    }));
  };

  const handleUploadBannerImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPromoFormError('');
    try {
      const dataUrl = await compressBannerImage(file);
      setPromoForm((prev) => ({ ...prev, bannerImageUrl: dataUrl }));
    } catch (err: any) {
      setPromoFormError(err?.message || 'Gagal memuat gambar banner.');
    }
  };

  const handleSavePromoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoForm.title.trim()) {
      setPromoFormError('Judul iklan promo wajib diisi.');
      return;
    }
    if (!promoForm.subtitle.trim()) {
      setPromoFormError('Subjudul / headline penawaran promo wajib diisi.');
      return;
    }

    const existing = editingPromoId ? promos.find((x) => x.id === editingPromoId) : null;
    const nowIso = new Date().toISOString();
    const record: PromoAd = {
      id: existing ? existing.id : `PRM-${Date.now().toString().slice(-6)}`,
      title: promoForm.title.trim(),
      badgeText: promoForm.badgeText.trim() || 'PROMO MITRA',
      subtitle: promoForm.subtitle.trim(),
      description: promoForm.description.trim(),
      highlightText: promoForm.highlightText.trim(),
      promoCode: promoForm.promoCode.trim().toUpperCase(),
      linkedDiscountId: promoForm.linkedDiscountId || '',
      ctaText: promoForm.ctaText.trim() || 'Lihat Katalog Promo',
      ctaFilterCategory: promoForm.ctaFilterCategory || '',
      ctaFilterKelas: promoForm.ctaFilterKelas || '',
      ctaSearchQuery: promoForm.ctaSearchQuery.trim(),
      theme: promoForm.theme,
      bannerImageUrl: promoForm.bannerImageUrl || '',
      priority: Math.max(1, Number(promoForm.priority) || 1),
      startDate: promoForm.startDate,
      endDate: promoForm.endDate,
      showOnMitraPortal: promoForm.showOnMitraPortal,
      isActive: promoForm.isActive,
      createdAt: existing ? existing.createdAt : nowIso,
      updatedAt: nowIso
    };

    onSavePromo(record, Boolean(existing));
    setShowPromoModal(false);
    setSyncNotice({
      type: 'ok',
      text: record.isActive && record.showOnMitraPortal
        ? `Iklan Promo "${record.title}" tersimpan & langsung tayang LIVE di Portal Order Mitra!`
        : `Iklan Promo "${record.title}" berhasil disimpan.`
    });
    setTimeout(() => setSyncNotice(null), 5000);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncNotice(null);
    const res = await onSyncSupabase();
    setIsSyncing(false);
    if (res.success) {
      setSyncNotice({
        type: 'ok',
        text: `Sinkronisasi Supabase berhasil (${res.count || 0} program tersinkron).`
      });
    } else if (res.needsTableSetup) {
      if (isOwnerAdmin) setShowSqlModal(true);
      setSyncNotice({
        type: 'err',
        text: isOwnerAdmin
          ? 'Tabel "promo_diskon" belum dibuat di Supabase. Gunakan tombol Setup Tabel SQL untuk menyiapkannya.'
          : 'Tabel "promo_diskon" belum tersedia di Supabase. Silakan hubungi APJ / Owner untuk konfigurasi database.'
      });
    } else {
      setSyncNotice({
        type: 'err',
        text: res.error || 'Gagal sinkronisasi ke Supabase.'
      });
    }
  };

  const toggleMultiPick = (arr: string[], item: string): string[] => {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  };

  const previewTheme = PROMO_BANNER_THEMES[promoForm.theme] || PROMO_BANNER_THEMES['emerald-clinical'];

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
              <BadgePercent className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Manajemen Diskon & Promo
              </h2>
              <p className="text-xs text-slate-500">
                Atur potongan penjualan fleksibel (Kasir & Mitra) serta tayangkan banner iklan promo live di Portal Order Mitra.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onOpenPortalPreview && (
            <button
              type="button"
              onClick={onOpenPortalPreview}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
              <span>Lihat Portal Mitra</span>
            </button>
          )}

          {!isDemoSandbox && (isOwnerAdmin || !needsTableSetup) && (
            <button
              type="button"
              onClick={needsTableSetup && isOwnerAdmin ? () => setShowSqlModal(true) : handleManualSync}
              disabled={isSyncing}
              className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition ${
                needsTableSetup && isOwnerAdmin
                  ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              {needsTableSetup && isOwnerAdmin ? (
                <>
                  <Database className="w-3.5 h-3.5 text-amber-600" />
                  <span>Setup Tabel Supabase</span>
                </>
              ) : (
                <>
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Menyinkronkan...' : 'Sync Supabase'}</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={openAddDiscountModal}
            className="min-h-[40px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Diskon</span>
          </button>

          <button
            type="button"
            onClick={openAddPromoModal}
            className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Promo</span>
          </button>
        </div>
      </div>

      {syncNotice && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-semibold border flex items-center justify-between gap-2 ${
            syncNotice.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span>{syncNotice.text}</span>
          <button
            type="button"
            onClick={() => setSyncNotice(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 Single-Elevation KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1.5">
            <span>Diskon Penjualan Aktif</span>
            <TicketPercent className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
            {activeDiscountsCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Dari total {discounts.length} program diskon
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1.5">
            <span>Promo Tayang Live</span>
            <Megaphone className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono tabular-nums">
            {livePromosCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Banner aktif di Portal Order Mitra
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1.5">
            <span>Cakupan Mitra & Portal</span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
            {mitraTargetedDiscountsCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Program berlaku untuk jalur mitra
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1.5">
            <span>Total Iklan Banner</span>
            <Sparkles className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
            {promos.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Siap tayang & terjadwal
          </p>
        </div>
      </div>

      {/* Filter & View Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              { id: 'ALL', label: `Semua (${discounts.length + promos.length})` },
              { id: 'DISCOUNT', label: `Diskon Penjualan (${discounts.length})` },
              { id: 'PROMO', label: `Iklan Promo Portal (${promos.length})` }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`min-h-[36px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition ${
                activeSubTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 md:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama diskon, kode, judul promo..."
              className="w-full min-h-[36px] pl-8 pr-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium text-slate-800 outline-none focus:border-sky-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
            className="min-h-[36px] px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Sedang Aktif / Tayang</option>
            <option value="INACTIVE">Nonaktif / Berakhir</option>
          </select>
        </div>
      </div>

      {/* SECTION A: IKLAN PROMO PORTAL ORDER MITRA */}
      {(activeSubTab === 'ALL' || activeSubTab === 'PROMO') && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-emerald-600" />
              <span>Iklan Promo Live di Portal Order Mitra</span>
            </h3>
            <button
              type="button"
              onClick={openAddPromoModal}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Promo Baru</span>
            </button>
          </div>

          {filteredPromos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-2">
              <Megaphone className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">Belum Ada Banner Iklan Promo</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Buat iklan promo dengan gambar, kode kupon, dan tombol aksi agar langsung tampil menarik secara live di halaman Portal Order Mitra.
              </p>
              <button
                type="button"
                onClick={openAddPromoModal}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buat Banner Promo Pertama</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredPromos.map((promo) => {
                const theme = PROMO_BANNER_THEMES[promo.theme] || PROMO_BANNER_THEMES['emerald-clinical'];
                const isLiveNow =
                  promo.isActive &&
                  promo.showOnMitraPortal &&
                  isWithinDateWindow(promo.startDate, promo.endDate, today);

                return (
                  <div
                    key={promo.id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col justify-between shadow-xs"
                  >
                    {/* Live Visual Mini Banner */}
                    <div className={`relative p-5 border-b ${theme.wrapperClass}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${theme.eyebrowClass}`}
                            >
                              {promo.badgeText || 'PROMO MITRA'}
                            </span>
                            {promo.highlightText && (
                              <span className="text-xs font-black text-amber-300 tracking-wide">
                                {promo.highlightText}
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-extrabold leading-snug line-clamp-2">
                            {promo.title}
                          </h4>
                          <p className="text-xs text-white/85 line-clamp-2 leading-relaxed">
                            {promo.subtitle}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {promo.promoCode && (
                              <span
                                className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold ${theme.codeBadgeClass}`}
                              >
                                Kode: {promo.promoCode}
                              </span>
                            )}
                            <span className={`px-3 py-1 rounded-lg text-[11px] font-extrabold ${theme.ctaClass}`}>
                              {promo.ctaText || 'Pesan Sekarang'}
                            </span>
                          </div>
                        </div>

                        {promo.bannerImageUrl && (
                          <div className="w-full sm:w-28 h-24 rounded-xl overflow-hidden border border-white/20 shrink-0 bg-black/20">
                            <img
                              src={promo.bannerImageUrl}
                              alt={promo.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Promo Controls & Metadata */}
                    <div className="p-4 flex flex-wrap items-center justify-between gap-3 bg-white">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              isLiveNow
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {isLiveNow ? 'Tayang Live di Portal Mitra' : promo.isActive ? 'Terjadwal / Tersembunyi' : 'Nonaktif'}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                            Urutan #{promo.priority || 1}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          Periode: {promo.startDate || 'Sekarang'} s/d {promo.endDate || 'Tanpa Batas'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onTogglePromoActive(promo.id)}
                          className={`min-h-[34px] px-3 rounded-lg border text-xs font-bold cursor-pointer transition whitespace-nowrap ${
                            promo.isActive
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {promo.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditPromoModal(promo)}
                          title="Edit Promo"
                          className="min-h-[34px] min-w-[34px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePromo(promo.id)}
                          title="Hapus Promo"
                          className="min-h-[34px] min-w-[34px] rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* SECTION B: DAFTAR DISKON PENJUALAN FLEKSIBEL */}
      {(activeSubTab === 'ALL' || activeSubTab === 'DISCOUNT') && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <TicketPercent className="w-4 h-4 text-sky-600" />
              <span>Daftar Program Diskon Penjualan Fleksibel</span>
            </h3>
            <button
              type="button"
              onClick={openAddDiscountModal}
              className="text-xs font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Diskon Baru</span>
            </button>
          </div>

          {filteredDiscounts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-2">
              <TicketPercent className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">Belum Ada Program Diskon Penjualan</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Tambahkan diskon fleksibel berdasarkan produk obat tertentu, kategori, kelas terapi, minimal belanja, atau kode kupon untuk Kasir POS dan Portal Mitra.
              </p>
              <button
                type="button"
                onClick={openAddDiscountModal}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buat Diskon Pertama</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">Program Diskon & Kode</th>
                      <th className="p-3.5">Basis Potongan Fleksibel</th>
                      <th className="p-3.5">Nilai Potongan</th>
                      <th className="p-3.5">Target Jalur</th>
                      <th className="p-3.5">Periode & Status</th>
                      <th className="p-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDiscounts.map((d) => {
                      const activeNow = d.isActive && isWithinDateWindow(d.startDate, d.endDate, today);
                      let basisDetail = DISCOUNT_BASIS_LABELS[d.basis];
                      if (d.basis === 'SPECIFIC_MEDICINE') {
                        basisDetail = `${d.targetMedicineIds?.length || 0} Produk Obat Dipilih`;
                      } else if (d.basis === 'CATEGORY') {
                        basisDetail = `Kategori: ${(d.targetCategories || []).join(', ') || '-'}`;
                      } else if (d.basis === 'THERAPY_CLASS') {
                        basisDetail = `Kelas Terapi: ${(d.targetTherapyClasses || []).join(', ') || '-'}`;
                      } else if (d.basis === 'MIN_PURCHASE') {
                        basisDetail = `Min. Belanja Rp ${(d.minPurchaseAmount || 0).toLocaleString('id-ID')}`;
                      } else if (d.basis === 'MIN_QTY') {
                        basisDetail = `Min. Qty ${d.minQty || 0} item`;
                      }

                      return (
                        <tr key={d.id} className="hover:bg-slate-50/70 transition">
                          <td className="p-3.5 align-top">
                            <div className="font-extrabold text-slate-900">{d.name}</div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {d.autoApply && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                  Otomatis
                                </span>
                              )}
                              {d.code && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[10px] font-bold">
                                  {d.code}
                                </span>
                              )}
                            </div>
                            {d.description && (
                              <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{d.description}</p>
                            )}
                          </td>

                          <td className="p-3.5 align-top">
                            <div className="font-semibold text-slate-800">{DISCOUNT_BASIS_LABELS[d.basis]}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5 max-w-[240px] truncate" title={basisDetail}>
                              {basisDetail}
                            </div>
                            {(d.minPurchaseAmount || 0) > 0 && d.basis !== 'MIN_PURCHASE' && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5 tabular-nums">
                                Syarat Min: Rp {(d.minPurchaseAmount || 0).toLocaleString('id-ID')}
                              </div>
                            )}
                          </td>

                          <td className="p-3.5 align-top font-mono tabular-nums">
                            <div className="text-sm font-black text-sky-700">
                              {d.valueType === 'PERCENT'
                                ? `${d.value}%`
                                : `Rp ${Math.round(d.value).toLocaleString('id-ID')}`}
                            </div>
                            {d.valueType === 'PERCENT' && (d.maxDiscountAmount || 0) > 0 && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Maks. Rp {Math.round(d.maxDiscountAmount || 0).toLocaleString('id-ID')}
                              </div>
                            )}
                          </td>

                          <td className="p-3.5 align-top">
                            <span className="font-semibold text-slate-700">
                              {DISCOUNT_CHANNEL_LABELS[d.channelScope]}
                            </span>
                          </td>

                          <td className="p-3.5 align-top">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                activeNow
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {activeNow ? 'Aktif' : d.isActive ? 'Di Luar Periode' : 'Nonaktif'}
                            </span>
                            <div className="text-[10px] text-slate-500 font-mono mt-1 tabular-nums">
                              {d.startDate || 'Now'} — {d.endDate || '∞'}
                            </div>
                          </td>

                          <td className="p-3.5 align-top text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onToggleDiscountActive(d.id)}
                                className={`min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer transition ${
                                  d.isActive
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {d.isActive ? 'Aktif' : 'Off'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditDiscountModal(d)}
                                title="Edit Diskon"
                                className="min-h-[32px] min-w-[32px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteDiscount(d.id)}
                                title="Hapus Diskon"
                                className="min-h-[32px] min-w-[32px] rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* MODAL: FORM DISKON FLEKSIBEL */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center">
                  <TicketPercent className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {editingDiscountId ? 'Edit Program Diskon Penjualan' : 'Tambah Diskon Penjualan Fleksibel'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Konfigurasi potongan penjualan otomatis atau kode promo untuk POS Kasir & Portal Mitra.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDiscountSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Nama Program Diskon *</label>
                  <input
                    type="text"
                    required
                    value={discountForm.name}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Contoh: Diskon Pengadaan Antibiotik Mitra 10%"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 font-semibold text-slate-900 focus:border-sky-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Basis Potongan Fleksibel *</label>
                  <select
                    value={discountForm.basis}
                    onChange={(e) =>
                      setDiscountForm((p) => ({ ...p, basis: e.target.value as DiscountBasis }))
                    }
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:border-sky-500 outline-none"
                  >
                    {(Object.keys(DISCOUNT_BASIS_LABELS) as DiscountBasis[]).map((key) => (
                      <option key={key} value={key}>
                        {DISCOUNT_BASIS_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Jalur Penjualan</label>
                  <select
                    value={discountForm.channelScope}
                    onChange={(e) =>
                      setDiscountForm((p) => ({
                        ...p,
                        channelScope: e.target.value as DiscountChannelScope
                      }))
                    }
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:border-sky-500 outline-none"
                  >
                    {(Object.keys(DISCOUNT_CHANNEL_LABELS) as DiscountChannelScope[]).map((key) => (
                      <option key={key} value={key}>
                        {DISCOUNT_CHANNEL_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Basis Selector */}
              {discountForm.basis === 'SPECIFIC_MEDICINE' && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      Pilih Produk Obat Tertentu ({discountForm.targetMedicineIds.length} dipilih)
                    </span>
                    {discountForm.targetMedicineIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDiscountForm((p) => ({ ...p, targetMedicineIds: [] }))}
                        className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Reset Pilihan
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={medPickerSearch}
                      onChange={(e) => setMedPickerSearch(e.target.value)}
                      placeholder="Cari nama obat / zat aktif..."
                      className="w-full min-h-[36px] pl-8 pr-3 rounded-xl border border-slate-300 bg-white text-xs font-medium outline-none"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
                    {pickerMedicines.map((med) => {
                      const checked = discountForm.targetMedicineIds.includes(med.id);
                      return (
                        <label
                          key={med.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-sky-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setDiscountForm((p) => ({
                                  ...p,
                                  targetMedicineIds: toggleMultiPick(p.targetMedicineIds, med.id)
                                }))
                              }
                              className="w-4 h-4 rounded text-sky-600"
                            />
                            <span className="font-semibold text-slate-800 truncate">
                              {med.name} {med.kekuatan && med.kekuatan !== '-' ? med.kekuatan : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <MedicineCategorySymbol category={med.category} size="xs" />
                            {med.kelas && (
                              <span className="text-[10px] text-slate-500">{med.kelas}</span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {discountForm.basis === 'CATEGORY' && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-800 block">
                    Pilih Kategori Obat ({discountForm.targetCategories.length} dipilih)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {availableCategories.map((cat) => {
                      const active = discountForm.targetCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() =>
                            setDiscountForm((p) => ({
                              ...p,
                              targetCategories: toggleMultiPick(p.targetCategories, cat)
                            }))
                          }
                          className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition flex items-center gap-1.5 ${
                            active
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {active && <Check className="w-3 h-3" />}
                          <span>{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {discountForm.basis === 'THERAPY_CLASS' && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-800 block">
                    Pilih Kelas Terapi ({discountForm.targetTherapyClasses.length} dipilih)
                  </span>
                  {availableTherapyClasses.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      Belum ada data kelas terapi pada Master Obat.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {availableTherapyClasses.map((kl) => {
                        const active = discountForm.targetTherapyClasses.includes(kl);
                        return (
                          <button
                            key={kl}
                            type="button"
                            onClick={() =>
                              setDiscountForm((p) => ({
                                ...p,
                                targetTherapyClasses: toggleMultiPick(p.targetTherapyClasses, kl)
                              }))
                            }
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition flex items-center gap-1.5 ${
                              active
                                ? 'bg-sky-600 text-white border-sky-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {active && <Check className="w-3 h-3" />}
                            <span>{kl}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Value & Cap */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipe Potongan</label>
                  <select
                    value={discountForm.valueType}
                    onChange={(e) =>
                      setDiscountForm((p) => ({ ...p, valueType: e.target.value as DiscountValueType }))
                    }
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 outline-none"
                  >
                    <option value="PERCENT">Persentase (%)</option>
                    <option value="NOMINAL">Nominal Tetap (Rp)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {discountForm.valueType === 'PERCENT' ? 'Besaran Diskon (%)' : 'Nominal Potongan (Rp)'} *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={discountForm.valueType === 'PERCENT' ? 100 : undefined}
                    value={discountForm.value}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, value: Number(e.target.value) || 0 }))}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 tabular-nums outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {discountForm.valueType === 'PERCENT'
                      ? 'Maks. Potongan (Rp, Opsional)'
                      : 'Min. Belanja (Rp)'}
                  </label>
                  {discountForm.valueType === 'PERCENT' ? (
                    <input
                      type="number"
                      min={0}
                      value={discountForm.maxDiscountAmount}
                      onChange={(e) =>
                        setDiscountForm((p) => ({ ...p, maxDiscountAmount: Number(e.target.value) || 0 }))
                      }
                      placeholder="0 = tanpa batas"
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 tabular-nums outline-none"
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      value={discountForm.minPurchaseAmount}
                      onChange={(e) =>
                        setDiscountForm((p) => ({ ...p, minPurchaseAmount: Number(e.target.value) || 0 }))
                      }
                      placeholder="0 = tanpa syarat"
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 tabular-nums outline-none"
                    />
                  )}
                </div>
              </div>

              {/* Additional Min Purchase / Qty & Code */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Syarat Min. Belanja (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    value={discountForm.minPurchaseAmount}
                    onChange={(e) =>
                      setDiscountForm((p) => ({ ...p, minPurchaseAmount: Number(e.target.value) || 0 }))
                    }
                    placeholder="0"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 tabular-nums outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Syarat Min. Qty Beli</label>
                  <input
                    type="number"
                    min={0}
                    value={discountForm.minQty}
                    onChange={(e) =>
                      setDiscountForm((p) => ({ ...p, minQty: Number(e.target.value) || 0 }))
                    }
                    placeholder="0"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 tabular-nums outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kode Kupon / Voucher</label>
                  <input
                    type="text"
                    value={discountForm.code}
                    onChange={(e) =>
                      setDiscountForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))
                    }
                    placeholder="Opsional (mis: MITRA10)"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono font-bold uppercase text-slate-900 outline-none"
                  />
                </div>
              </div>

              {/* Schedule & Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={discountForm.startDate}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono text-slate-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Berakhir (Kosong = Selamanya)</label>
                  <input
                    type="date"
                    value={discountForm.endDate}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Keterangan Internal / Syarat</label>
                <input
                  type="text"
                  value={discountForm.description}
                  onChange={(e) => setDiscountForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Catatan syarat & ketentuan diskon..."
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-slate-800 outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1">
                <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={discountForm.autoApply}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, autoApply: e.target.checked }))}
                    className="w-4 h-4 rounded text-sky-600"
                  />
                  <span>Terapkan Otomatis saat syarat terpenuhi</span>
                </label>

                <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={discountForm.isActive}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span>Aktifkan Program Diskon Ini</span>
                </label>
              </div>

              {discountFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  {discountFormError}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscountModal(false)}
                  className="min-h-[42px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold cursor-pointer shadow-xs"
                >
                  Simpan Program Diskon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: FORM PROMO PORTAL ORDER MITRA + LIVE PREVIEW */}
      {showPromoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {editingPromoId ? 'Edit Iklan Promo Portal Mitra' : 'Buat Iklan Promo Portal Order Mitra'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Sesuaikan tampilan banner iklan — saat disimpan langsung tampil live di halaman Portal Order Mitra.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPromoModal(false)}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePromoSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Live Banner Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Live Preview Banner Portal Order Mitra</span>
                  </span>
                </div>
                <div className={`rounded-2xl border p-5 sm:p-6 shadow-sm ${previewTheme.wrapperClass}`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="space-y-2.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${previewTheme.eyebrowClass}`}
                        >
                          {promoForm.badgeText || 'PROMO MITRA'}
                        </span>
                        {promoForm.highlightText && (
                          <span className="text-xs font-black text-amber-300 tracking-wide">
                            {promoForm.highlightText}
                          </span>
                        )}
                      </div>
                      <h4 className="text-lg sm:text-xl font-black tracking-tight leading-snug">
                        {promoForm.title || 'Judul Iklan Promo Spesial Mitra'}
                      </h4>
                      <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
                        {promoForm.subtitle ||
                          'Subjudul penawaran menarik akan tampil di sini secara real-time kepada seluruh mitra faskes.'}
                      </p>
                      {promoForm.description && (
                        <p className="text-[11px] text-white/75">{promoForm.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <span className={`px-4 py-2 rounded-xl text-xs font-extrabold ${previewTheme.ctaClass}`}>
                          {promoForm.ctaText || 'Lihat Produk Promo'}
                        </span>
                        {promoForm.promoCode && (
                          <span
                            className={`px-3 py-1.5 rounded-xl border font-mono text-xs font-bold ${previewTheme.codeBadgeClass}`}
                          >
                            Kode: {promoForm.promoCode}
                          </span>
                        )}
                      </div>
                    </div>

                    {promoForm.bannerImageUrl && (
                      <div className="w-full md:w-48 h-32 rounded-2xl overflow-hidden border border-white/20 shrink-0 bg-black/20">
                        <img
                          src={promoForm.bannerImageUrl}
                          alt="Preview Banner"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Judul Utama Promo *</label>
                  <input
                    type="text"
                    required
                    value={promoForm.title}
                    onChange={(e) => setPromoForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Contoh: Promo Stok Awal Bulan Klinik Mitra"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 font-semibold text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Label Tag</label>
                    <input
                      type="text"
                      value={promoForm.badgeText}
                      onChange={(e) => setPromoForm((p) => ({ ...p, badgeText: e.target.value }))}
                      placeholder="PROMO MITRA"
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-bold uppercase text-slate-800 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Highlight Penawaran</label>
                    <input
                      type="text"
                      value={promoForm.highlightText}
                      onChange={(e) => setPromoForm((p) => ({ ...p, highlightText: e.target.value }))}
                      placeholder="HEMAT 15%"
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-extrabold text-amber-700 outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Subjudul / Headline Penawaran *</label>
                  <input
                    type="text"
                    required
                    value={promoForm.subtitle}
                    onChange={(e) => setPromoForm((p) => ({ ...p, subtitle: e.target.value }))}
                    placeholder="Contoh: Dapatkan potongan langsung untuk pengadaan obat generik & antibiotik minimal 5 Box."
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 font-medium text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Detail / Syarat Promo (Opsional)</label>
                  <input
                    type="text"
                    value={promoForm.description}
                    onChange={(e) => setPromoForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Contoh: Berlaku untuk seluruh Klinik Pratama & Apotek Jejaring dengan pengiriman hari yang sama."
                    className="w-full min-h-[40px] px-3.5 rounded-xl border border-slate-300 text-slate-800 outline-none"
                  />
                </div>
              </div>

              {/* Linked Discount & Promo Code */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hubungkan Program Diskon</label>
                  <select
                    value={promoForm.linkedDiscountId}
                    onChange={(e) => handleLinkDiscountToPromo(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 outline-none"
                  >
                    <option value="">-- Tanpa Tautan Diskon --</option>
                    {discounts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({formatDiscountShortBadge(d)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kode Promo (Bisa Disalin Mitra)</label>
                  <input
                    type="text"
                    value={promoForm.promoCode}
                    onChange={(e) =>
                      setPromoForm((p) => ({ ...p, promoCode: e.target.value.toUpperCase() }))
                    }
                    placeholder="Contoh: MITRA15"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 bg-white font-mono font-bold uppercase text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Teks Tombol Aksi (CTA)</label>
                  <input
                    type="text"
                    value={promoForm.ctaText}
                    onChange={(e) => setPromoForm((p) => ({ ...p, ctaText: e.target.value }))}
                    placeholder="Lihat Produk Promo"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Klik CTA Filter Kategori</label>
                  <select
                    value={promoForm.ctaFilterCategory}
                    onChange={(e) => setPromoForm((p) => ({ ...p, ctaFilterCategory: e.target.value }))}
                    className="w-full min-h-[38px] px-3 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 outline-none"
                  >
                    <option value="">Semua Kategori</option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Klik CTA Filter Kelas Terapi</label>
                  <select
                    value={promoForm.ctaFilterKelas}
                    onChange={(e) => setPromoForm((p) => ({ ...p, ctaFilterKelas: e.target.value }))}
                    className="w-full min-h-[38px] px-3 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 outline-none"
                  >
                    <option value="">Semua Kelas Terapi</option>
                    {availableTherapyClasses.map((kl) => (
                      <option key={kl} value={kl}>{kl}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Klik CTA Kata Kunci Obat</label>
                  <input
                    type="text"
                    value={promoForm.ctaSearchQuery}
                    onChange={(e) => setPromoForm((p) => ({ ...p, ctaSearchQuery: e.target.value }))}
                    placeholder="Opsional (mis: Paracetamol)"
                    className="w-full min-h-[38px] px-3 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 outline-none"
                  />
                </div>
              </div>

              {/* Theme & Optional Image */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Tema Warna Banner</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.values(PROMO_BANNER_THEMES)).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPromoForm((p) => ({ ...p, theme: t.id }))}
                        className={`px-3 py-2 rounded-xl border text-left font-bold flex items-center gap-2 cursor-pointer transition ${
                          promoForm.theme === t.id
                            ? 'border-slate-900 ring-2 ring-slate-900/15 bg-slate-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-md shrink-0 ${t.wrapperClass}`} />
                        <span className="truncate text-[11px] text-slate-800">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Gambar Visual Banner (Opsional)
                  </label>
                  <div className="p-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="min-h-[36px] px-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Upload Gambar Banner</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUploadBannerImage}
                          className="hidden"
                        />
                      </label>
                      {promoForm.bannerImageUrl && (
                        <button
                          type="button"
                          onClick={() => setPromoForm((p) => ({ ...p, bannerImageUrl: '' }))}
                          className="min-h-[36px] px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold cursor-pointer"
                        >
                          Hapus Gambar
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>Disarankan rasio landscape (16:9 / 3:1), dikompresi otomatis agar cepat dimuat.</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Priority & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Urutan Tampil</label>
                  <input
                    type="number"
                    min={1}
                    value={promoForm.priority}
                    onChange={(e) => setPromoForm((p) => ({ ...p, priority: Number(e.target.value) || 1 }))}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 tabular-nums outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mulai Tayang</label>
                  <input
                    type="date"
                    value={promoForm.startDate}
                    onChange={(e) => setPromoForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono text-slate-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Selesai Tayang</label>
                  <input
                    type="date"
                    value={promoForm.endDate}
                    onChange={(e) => setPromoForm((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 font-mono text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1">
                <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={promoForm.showOnMitraPortal}
                    onChange={(e) =>
                      setPromoForm((p) => ({ ...p, showOnMitraPortal: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span>Tampilkan Live di Portal Order Mitra</span>
                </label>

                <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={promoForm.isActive}
                    onChange={(e) => setPromoForm((p) => ({ ...p, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span>Aktif / Siap Tayang</span>
                </label>
              </div>

              {promoFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  {promoFormError}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPromoModal(false)}
                  className="min-h-[42px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Tag className="w-4 h-4" />
                  <span>Simpan & Tayangkan Promo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUPABASE SQL SETUP */}
      {isOwnerAdmin && showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  Skrip SQL Tabel promo_diskon (Supabase)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Salin dan jalankan skrip SQL di bawah ini pada <strong>SQL Editor Supabase</strong> agar seluruh Diskon dan Promo Portal Mitra tersinkron 2 arah secara real-time di semua perangkat.
              </p>
              <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto leading-relaxed">
                {SUPABASE_PROMO_DISCOUNT_SQL_SCHEMA}
              </pre>
            </div>
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(SUPABASE_PROMO_DISCOUNT_SQL_SCHEMA);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2000);
                }}
                className="min-h-[38px] px-4 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'SQL Tersalin' : 'Salin Skrip SQL'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="min-h-[38px] px-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
