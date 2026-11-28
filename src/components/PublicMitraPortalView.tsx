import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Package,
  Store,
  RefreshCw,
  Clock,
  Phone,
  MapPin,
  User,
  FileText,
  X,
  AlertCircle,
  ClipboardList,
  Building2,
  Check,
  Database,
  CreditCard,
  Copy,
  Upload,
  FileCheck2,
  Image as ImageIcon,
  ShieldCheck,
  QrCode,
  Download,
  ZoomIn,
  Handshake,
  CheckCircle,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  TicketPercent,
  ArrowRight,
  Lock,
  Unlock,
  ShieldAlert,
  UserCheck,
  Users,
  Eye,
  KeyRound
} from 'lucide-react';
import { safeBackendFetch } from '../utils/serverBridgeHelper';
import {
  Medicine,
  Mitra,
  MitraOrder,
  MitraOrderItem,
  MitraOrderStatus,
  MitraPaymentStatus,
  PharmacyBankAccount,
  PortalOrderRoom,
  PromoAd,
  SalesDiscount
} from '../types';
import {
  getMitraBoxPrice,
  getMedicineHppBox,
  getAvailableBoxStock
} from '../utils/batchHelper';
import {
  getMedicinePrescriptionRequirement,
  evaluateCartPrescriptionRequirement,
  PRESCRIPTION_STATUS_UPDATED_EVENT,
  PrescriptionStatusConfig,
  getPrescriptionStatusConfigs
} from '../utils/medicineRegulation';
import { recordPortalActivity } from '../utils/portalActivityLogger';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';
import {
  fetchPublicMedicinesCatalog,
  subscribeMedicinesRealtime,
  syncMitraOrderToSupabase,
  fetchMitraOrdersFromSupabase,
  subscribeMitraOrdersRealtime,
  fetchFacilityProfilesFromSupabase,
  fetchMitraFromSupabase,
  verifyMitraLoginFromSupabase,
  syncMitraToSupabase,
  subscribeMitraRealtime,
  fetchDiscountsPromosFromSupabase,
  subscribeDiscountsPromosRealtime,
  fetchDiscountsPromosFromServerBridge,
  getSupabaseConfig
} from '../utils/supabaseClient';
import {
  PROMO_BANNER_THEMES,
  findBestCartDiscount,
  formatDiscountShortBadge,
  getBestProductUnitDiscount,
  getLivePortalPromos,
  isMedicineEligibleForDiscount,
  isWithinDateWindow,
  matchesChannelScope
} from '../utils/discountHelper';
import {
  DEFAULT_BANK_ACCOUNTS,
  getOfficialBankAccounts,
  applyRemoteFacilityProfiles
} from '../utils/facilityProfileHelper';
import {
  isDemoMode,
  demoGetItem,
  demoSetItem,
  demoRemoveItem,
  getDemoBroadcastChannelName
} from '../utils/demoSandbox';
import { processMitraLicenseFile, isPdfLicenseFile } from '../utils/mitraLicenseFile';

interface PublicMitraPortalViewProps {
  onBackToAdmin?: () => void;
  mitraList?: Mitra[];
  onRegisterMitra?: (mitra: Mitra) => void;
  onOrderSubmitted?: (order: MitraOrder) => void;
  initialMedicines?: Medicine[];
  initialPromos?: PromoAd[];
  initialDiscounts?: SalesDiscount[];
  isDemoSandbox?: boolean;
  onResetDemo?: () => void;
  onExitDemo?: () => void;
  embeddedInUnifiedApp?: boolean;
  initialRoomOverride?: PortalOrderRoom;
}

interface PortalCartEntry {
  medicine: Medicine;
  qtyBox: number; // Represents satuanKecil qty in REGULER room, satuanBesar qty in MITRA room
}

const QRIS_PRIMARY_PATH = '/assets/aistudio/QRIS_GOPAY_cb0eb6e7.jpeg';
const QRIS_FALLBACK_PATH = './assets/aistudio/QRIS_GOPAY_cb0eb6e7.jpeg';
const QRIS_PAYMENT_TARGET_LABEL = 'QRIS - APOTEK LATISHA FARMA (NMID: ID1026634857274)';

const filterPortalBankAccounts = (accounts: PharmacyBankAccount[]): PharmacyBankAccount[] => {
  return accounts.filter(
    (b) =>
      (b.bankName || '').trim().toUpperCase() !== 'BCA' &&
      (b.accountNumber || '').trim() !== '827-092-1122'
  );
};

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

const getPaymentBadgeStyle = (paymentStatus?: MitraPaymentStatus): string => {
  switch (paymentStatus) {
    case 'Lunas':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    case 'Menunggu Verifikasi':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'Ditolak':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'Menunggu Pembayaran':
    default:
      return 'bg-amber-50 text-amber-800 border-amber-200';
  }
};

const compressPaymentProofFile = (file: File): Promise<{ dataUrl: string; fileName: string }> => {
  return new Promise((resolve, reject) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (!isPdf && !isImage) {
      reject(new Error('Format file harus berupa JPG, PNG, WEBP, atau PDF.'));
      return;
    }

    if (isPdf && file.size > 2.5 * 1024 * 1024) {
      reject(new Error('Ukuran file PDF maksimal 2,5 MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file bukti pembayaran.'));
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      if (isPdf) {
        resolve({ dataUrl: rawDataUrl, fileName: file.name });
        return;
      }

      const img = new window.Image();
      img.onerror = () => resolve({ dataUrl: rawDataUrl, fileName: file.name });
      img.onload = () => {
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: rawDataUrl, fileName: file.name });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.78);
        resolve({ dataUrl: compressed, fileName: file.name });
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
};

export const PublicMitraPortalView: React.FC<PublicMitraPortalViewProps> = ({
  mitraList = [],
  onRegisterMitra,
  onOrderSubmitted,
  initialMedicines = [],
  initialPromos,
  initialDiscounts,
  isDemoSandbox,
  onResetDemo,
  onExitDemo,
  embeddedInUnifiedApp = false,
  initialRoomOverride
}) => {
  const demoActive = isDemoSandbox ?? isDemoMode();
  const [portalDemoToast, setPortalDemoToast] = useState<string>('');
  const [rxStatusConfigs, setRxStatusConfigs] = useState<PrescriptionStatusConfig[]>(() =>
    getPrescriptionStatusConfigs()
  );

  useEffect(() => {
    const handleRxConfigUpdate = () => {
      setRxStatusConfigs(getPrescriptionStatusConfigs());
    };
    window.addEventListener(PRESCRIPTION_STATUS_UPDATED_EVENT, handleRxConfigUpdate);
    window.addEventListener('storage', handleRxConfigUpdate);
    return () => {
      window.removeEventListener(PRESCRIPTION_STATUS_UPDATED_EVENT, handleRxConfigUpdate);
      window.removeEventListener('storage', handleRxConfigUpdate);
    };
  }, []);

  // Ensure standalone /?view=portal-mitra&mode=demo has demo seed data ready lazily
  useEffect(() => {
    if (!demoActive || typeof window === 'undefined') return;
    let cancelled = false;
    import('../data/demoData')
      .then(({ seedDemoSandboxStorage }) => {
        if (cancelled) return;
        const seeded = seedDemoSandboxStorage(false);
        setCatalog((prev) => (prev.length > 0 ? prev : seeded.medicines));
        setMyOrders((prev) => (prev.length > 0 ? prev : seeded.mitraOrders));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [demoActive]);

  // Integrated Mitra Directory state (synced with main app localStorage + Supabase)
  const [registeredMitraList, setRegisteredMitraList] = useState<Mitra[]>(() => {
    if (mitraList && mitraList.length > 0) return mitraList;
    try {
      const saved = demoGetItem('latisha_mitra');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    if (mitraList && mitraList.length > 0) {
      setRegisteredMitraList((prev) => {
        const map = new Map<string, Mitra>();
        prev.forEach((m) => map.set(m.id, m));
        mitraList.forEach((m) => map.set(m.id, m));
        return Array.from(map.values());
      });
    }
  }, [mitraList]);

  // "Jadi Mitra" Modal & Form State (matches SetupMitraView in main app)
  const [showJadiMitraModal, setShowJadiMitraModal] = useState<boolean>(false);
  const [jadiMitraError, setJadiMitraError] = useState<string>('');
  const [jadiMitraSuccessToast, setJadiMitraSuccessToast] = useState<string>('');
  const [isSavingMitra, setIsSavingMitra] = useState<boolean>(false);
  const [isProcessingMitraLicense, setIsProcessingMitraLicense] = useState<boolean>(false);
  const [mitraFormData, setMitraFormData] = useState<{
    name: string;
    phone: string;
    licenseNo: string;
    licenseFileUrl: string;
    licenseFileName: string;
    licenseFileType: string;
    licenseUploadedAt: string;
    address: string;
    category: Mitra['category'];
    picName: string;
  }>({
    name: '',
    phone: '',
    licenseNo: '',
    licenseFileUrl: '',
    licenseFileName: '',
    licenseFileType: '',
    licenseUploadedAt: '',
    address: '',
    category: 'Klinik Pratama',
    picName: ''
  });

  const [catalog, setCatalog] = useState<Medicine[]>(initialMedicines);
  const [catalogSource, setCatalogSource] = useState<'supabase' | 'local'>('local');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');

  const [activeRoom, setActiveRoom] = useState<PortalOrderRoom>(() => {
    if (initialRoomOverride) return initialRoomOverride;
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search || '');
      if (sp.get('room')?.toLowerCase() === 'mitra') return 'MITRA';
      if (sp.get('room')?.toLowerCase() === 'reguler') return 'REGULER';
    }
    return 'REGULER';
  });

  useEffect(() => {
    if (initialRoomOverride) {
      setActiveRoom(initialRoomOverride);
    }
  }, [initialRoomOverride]);

  const [activePortalTab, setActivePortalTab] = useState<'katalog' | 'riwayat'>('katalog');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [selectedKelasTerapi, setSelectedKelasTerapi] = useState<string>('Semua');
  const [selectedStatusResep, setSelectedStatusResep] = useState<string>('Semua');
  const [onlyAvailableStock, setOnlyAvailableStock] = useState<boolean>(false);
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const CATALOG_PAGE_SIZE = 24;

  useEffect(() => {
    setCatalogPage(1);
  }, [deferredSearchQuery, selectedCategory, selectedKelasTerapi, selectedStatusResep, onlyAvailableStock, activeRoom]);

  const [cartByRoom, setCartByRoom] = useState<Record<PortalOrderRoom, Record<string, PortalCartEntry>>>({
    REGULER: {},
    MITRA: {}
  });
  const cart = cartByRoom[activeRoom];
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [inspectProduct, setInspectProduct] = useState<Medicine | null>(null);

  // Live Promos & Sales Discounts synced from Manajemen Diskon & Promo
  const [promos, setPromos] = useState<PromoAd[]>(() => {
    if (initialPromos && initialPromos.length > 0) return initialPromos;
    try {
      const saved = demoGetItem('latisha_promo_ads');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [discounts, setDiscounts] = useState<SalesDiscount[]>(() => {
    if (initialDiscounts && initialDiscounts.length > 0) return initialDiscounts;
    try {
      const saved = demoGetItem('latisha_sales_discounts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [activePromoSlide, setActivePromoSlide] = useState<number>(0);
  const [isBannerHovered, setIsBannerHovered] = useState<boolean>(false);
  const [copiedPromoCode, setCopiedPromoCode] = useState<string>('');
  const [portalVoucherInput, setPortalVoucherInput] = useState<string>('');

  useEffect(() => {
    if (initialPromos) setPromos(initialPromos);
  }, [initialPromos]);

  useEffect(() => {
    if (initialDiscounts) setDiscounts(initialDiscounts);
  }, [initialDiscounts]);

  // Per-mount random token to prevent browser form history & autofill matching across sessions
  const mountNonce = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  // Identitas Pelanggan Reguler / Umum (terisolasi per tab via sessionStorage, tanpa registrasi)
  const [regulerName, setRegulerName] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem('latisha_portal_reguler_name') || '';
    } catch {
      return '';
    }
  });
  const [regulerPhone, setRegulerPhone] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem('latisha_portal_reguler_phone') || '';
    } catch {
      return '';
    }
  });
  const [regulerAddress, setRegulerAddress] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem('latisha_portal_reguler_address') || '';
    } catch {
      return '';
    }
  });

  // Upload Resep Wajib untuk Ruang Reguler/Umum
  const [rxFileUrl, setRxFileUrl] = useState<string>('');
  const [rxFileName, setRxFileName] = useState<string>('');
  const [rxUploadedAt, setRxUploadedAt] = useState<string>('');
  const [rxFileError, setRxFileError] = useState<string>('');
  const [isProcessingRxFile, setIsProcessingRxFile] = useState<boolean>(false);

  // Login & Verifikasi Akun Mitra (Nama Mitra + ID Mitra) — strictly in-session, no browser autofill/localStorage leak
  const [verifiedMitraSession, setVerifiedMitraSession] = useState<Mitra | null>(null);
  const [loginMitraName, setLoginMitraName] = useState<string>('');
  const [loginMitraId, setLoginMitraId] = useState<string>('');
  const [mitraInputsUnlocked, setMitraInputsUnlocked] = useState<boolean>(false);
  const [mitraLoginError, setMitraLoginError] = useState<string>('');
  const [isVerifyingMitra, setIsVerifyingMitra] = useState<boolean>(false);
  const [newlyRegisteredCredential, setNewlyRegisteredCredential] = useState<{
    name: string;
    id: string;
  } | null>(null);
  const [copiedNewMitraId, setCopiedNewMitraId] = useState<boolean>(false);
  const [mitraLockAlert, setMitraLockAlert] = useState<{ medicineName: string } | null>(null);

  const [mitraName, setMitraName] = useState<string>('');
  const [mitraCategory, setMitraCategory] = useState<string>('Klinik Pratama');
  const [picName, setPicName] = useState<string>('');
  const [mitraPhone, setMitraPhone] = useState<string>('');
  const [mitraAddress, setMitraAddress] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [selectedMitraId, setSelectedMitraId] = useState<string>('');

  // Orders submitted in THIS browser tab session (isolated per user/device/tab)
  const [sessionOrderIds, setSessionOrderIds] = useState<string[]>(() => {
    try {
      const raw = window.sessionStorage.getItem('latisha_portal_session_orders');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [confirmedOrder, setConfirmedOrder] = useState<MitraOrder | null>(null);

  // Official bank accounts & payment proof upload states
  const [bankAccounts, setBankAccounts] = useState<PharmacyBankAccount[]>(() =>
    filterPortalBankAccounts(getOfficialBankAccounts())
  );
  const [copiedBankId, setCopiedBankId] = useState<string | null>(null);
  const [copiedNominal, setCopiedNominal] = useState<boolean>(false);
  const [selectedBankTarget, setSelectedBankTarget] = useState<string>('');
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string>('');
  const [proofFileName, setProofFileName] = useState<string>('');
  const [proofError, setProofError] = useState<string>('');
  const [isUploadingProof, setIsUploadingProof] = useState<boolean>(false);
  const [proofSuccessMessage, setProofSuccessMessage] = useState<string>('');
  const [qrisImgSrc, setQrisImgSrc] = useState<string>(QRIS_PRIMARY_PATH);
  const [qrisLoadError, setQrisLoadError] = useState<boolean>(false);
  const [zoomQrisModal, setZoomQrisModal] = useState<boolean>(false);

  // Riwayat pesanan portal (realtime synced, isolated in Demo Mode)
  const [myOrders, setMyOrders] = useState<MitraOrder[]>(() => {
    try {
      const saved = demoGetItem('latisha_mitra_orders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderRoomFilter, setOrderRoomFilter] = useState<'ALL' | PortalOrderRoom>('ALL');

  const loadBankAccounts = async () => {
    const localBanks = filterPortalBankAccounts(getOfficialBankAccounts());
    setBankAccounts(localBanks);
    if (demoActive) return;
    try {
      const sbRes = await fetchFacilityProfilesFromSupabase();
      if (sbRes.data) {
        const applied = applyRemoteFacilityProfiles(sbRes.data);
        const sbBanks = filterPortalBankAccounts(getOfficialBankAccounts(applied.pharmacy));
        if (sbBanks.length > 0) {
          setBankAccounts(sbBanks);
          return;
        }
      }
      const res = await safeBackendFetch('/api/facility-profile');
      if (res && res.ok) {
        const data = await res.json();
        const serverBanks = data?.pharmacy?.bankAccounts;
        if (Array.isArray(serverBanks) && serverBanks.length > 0) {
          const valid = filterPortalBankAccounts(serverBanks).filter(
            (b: PharmacyBankAccount) => (b.bankName || '').trim() && (b.accountNumber || '').trim()
          );
          if (valid.length > 0) setBankAccounts(valid);
        }
      }
    } catch {}
  };

  const loadCatalog = async () => {
    setIsLoadingCatalog(true);
    const res = await fetchPublicMedicinesCatalog();
    if (res.data && res.data.length > 0) {
      setCatalog(res.data);
      setCatalogSource(res.source);
    } else if (initialMedicines.length > 0) {
      setCatalog(initialMedicines);
      setCatalogSource('local');
    }
    setLastSyncedAt(
      new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
    setIsLoadingCatalog(false);
  };

  useEffect(() => {
    if (initialMedicines.length > 0 && catalog.length === 0) {
      setCatalog(initialMedicines);
    }
  }, [initialMedicines]);

  useEffect(() => {
    // Clean up legacy shared localStorage mitra credentials so browser never leaks prior partner info
    try {
      demoRemoveItem('latisha_portal_mitra_name');
      demoRemoveItem('latisha_portal_mitra_pic');
      demoRemoveItem('latisha_portal_mitra_phone');
      demoRemoveItem('latisha_portal_mitra_address');
      demoRemoveItem('latisha_portal_reguler_name');
      demoRemoveItem('latisha_portal_reguler_phone');
      demoRemoveItem('latisha_portal_reguler_address');
    } catch {}

    loadCatalog();
    loadBankAccounts();

    const handleProfileUpdated = () => loadBankAccounts();
    window.addEventListener('latisha_profile_updated', handleProfileUpdated);

    // Load initial orders from Supabase (blocked automatically when Demo Mode active)
    if (!demoActive) {
      fetchMitraOrdersFromSupabase().then((res) => {
        if (res.data && res.data.length > 0) {
          setMyOrders((prev) => {
            const map = new Map<string, MitraOrder>();
            prev.forEach((o) => map.set(o.id, o));
            res.data!.forEach((o) => map.set(o.id, o));
            const merged = Array.from(map.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            try {
              demoSetItem('latisha_mitra_orders', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      });
      // Fetch registered Mitra into React memory only (do NOT expose full list to localStorage/autofill)
      fetchMitraFromSupabase().then((res) => {
        if (res.data && res.data.length > 0) {
          setRegisteredMitraList((prev) => {
            const map = new Map<string, Mitra>();
            prev.forEach((m) => map.set(m.id, m));
            res.data!.forEach((m) => map.set(m.id, m));
            return Array.from(map.values());
          });
        }
      });

      // Fetch live promos & discounts from server bridge and Supabase
      fetchDiscountsPromosFromServerBridge().then((bridgeRes) => {
        if (bridgeRes) {
          if (bridgeRes.promos.length > 0) {
            setPromos(bridgeRes.promos);
            try {
              demoSetItem('latisha_promo_ads', JSON.stringify(bridgeRes.promos));
            } catch {}
          }
          if (bridgeRes.discounts.length > 0) {
            setDiscounts(bridgeRes.discounts);
            try {
              demoSetItem('latisha_sales_discounts', JSON.stringify(bridgeRes.discounts));
            } catch {}
          }
        }
      });

      fetchDiscountsPromosFromSupabase().then((sbPromoRes) => {
        if (!sbPromoRes.error) {
          if (sbPromoRes.promos.length > 0) {
            setPromos(sbPromoRes.promos);
            try {
              demoSetItem('latisha_promo_ads', JSON.stringify(sbPromoRes.promos));
            } catch {}
          }
          if (sbPromoRes.discounts.length > 0) {
            setDiscounts(sbPromoRes.discounts);
            try {
              demoSetItem('latisha_sales_discounts', JSON.stringify(sbPromoRes.discounts));
            } catch {}
          }
        }
      });
    }

    const promoDiscountChannel = subscribeDiscountsPromosRealtime(
      (item) => {
        if (item.kind === 'PROMO' && item.promo) {
          setPromos((prev) => {
            const exists = prev.some((p) => p.id === item.promo!.id);
            const updated = exists
              ? prev.map((p) => (p.id === item.promo!.id ? item.promo! : p))
              : [item.promo!, ...prev];
            try {
              demoSetItem('latisha_promo_ads', JSON.stringify(updated));
            } catch {}
            return updated;
          });
        } else if (item.kind === 'DISCOUNT' && item.discount) {
          setDiscounts((prev) => {
            const exists = prev.some((d) => d.id === item.discount!.id);
            const updated = exists
              ? prev.map((d) => (d.id === item.discount!.id ? item.discount! : d))
              : [item.discount!, ...prev];
            try {
              demoSetItem('latisha_sales_discounts', JSON.stringify(updated));
            } catch {}
            return updated;
          });
        }
      },
      (deletedId) => {
        setPromos((prev) => prev.filter((p) => p.id !== deletedId));
        setDiscounts((prev) => prev.filter((d) => d.id !== deletedId));
      }
    );

    // Realtime subscription for Master Data Mitra
    const mitraChannel = subscribeMitraRealtime(
      (newM) => {
        setRegisteredMitraList((prev) => {
          const exists = prev.some((m) => m.id === newM.id);
          const updated = exists
            ? prev.map((m) => (m.id === newM.id ? newM : m))
            : [newM, ...prev];
          try {
            demoSetItem('latisha_mitra', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      },
      (updatedM) => {
        setRegisteredMitraList((prev) => {
          const updated = prev.map((m) => (m.id === updatedM.id ? updatedM : m));
          try {
            demoSetItem('latisha_mitra', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      },
      (deletedId) => {
        setRegisteredMitraList((prev) => {
          const updated = prev.filter((m) => m.id !== deletedId);
          try {
            demoSetItem('latisha_mitra', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
    );

    // Realtime subscription for medicine catalog (stock & price changes in real time)
    const medChannel = subscribeMedicinesRealtime(
      (newMed) => {
        setCatalog((prev) => {
          const exists = prev.some((m) => m.id === newMed.id);
          if (exists) return prev.map((m) => (m.id === newMed.id ? newMed : m));
          return [newMed, ...prev].sort((a, b) => a.name.localeCompare(b.name));
        });
        setCatalogSource('supabase');
        setLastSyncedAt(
          new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      },
      (updatedMed) => {
        setCatalog((prev) => prev.map((m) => (m.id === updatedMed.id ? updatedMed : m)));
        setCatalogSource('supabase');
        setLastSyncedAt(
          new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      },
      (deletedId) => {
        setCatalog((prev) => prev.filter((m) => m.id !== deletedId));
      }
    );

    // Realtime subscription for partner order status updates
    const orderChannel = subscribeMitraOrdersRealtime(
      (newOrd) => {
        setMyOrders((prev) => {
          if (prev.some((o) => o.id === newOrd.id)) {
            return prev.map((o) => (o.id === newOrd.id ? newOrd : o));
          }
          return [newOrd, ...prev];
        });
      },
      (updatedOrd) => {
        setMyOrders((prev) => prev.map((o) => (o.id === updatedOrd.id ? updatedOrd : o)));
        setConfirmedOrder((curr) => (curr && curr.id === updatedOrd.id ? updatedOrd : curr));
      },
      (deletedId) => {
        setMyOrders((prev) => prev.filter((o) => o.id !== deletedId));
      }
    );

    // Cross-tab BroadcastChannel sync for offline/local-first environments (isolated in Demo Mode)
    let bc: BroadcastChannel | null = null;
    let mitraBc: BroadcastChannel | null = null;
    let promoBc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_mitra_orders_channel'));
      bc.onmessage = (event) => {
        const msg = event.data;
        if (!msg) return;
        if (msg.type === 'ORDER_UPSERT' && msg.order) {
          setMyOrders((prev) => {
            const exists = prev.some((o) => o.id === msg.order.id);
            if (exists) return prev.map((o) => (o.id === msg.order.id ? msg.order : o));
            return [msg.order, ...prev];
          });
        } else if (msg.type === 'ORDER_DELETE' && msg.id) {
          setMyOrders((prev) => prev.filter((o) => o.id !== msg.id));
        }
      };

      mitraBc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_mitra_channel'));
      mitraBc.onmessage = (event) => {
        const msg = event.data;
        if (!msg) return;
        if (msg.type === 'MITRA_ADD' && msg.mitra) {
          setRegisteredMitraList((prev) => {
            if (prev.some((m) => m.id === msg.mitra.id)) return prev;
            return [msg.mitra, ...prev];
          });
        }
      };

      promoBc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_promo_discount_channel'));
      promoBc.onmessage = (event) => {
        const msg = event.data;
        if (!msg) return;
        if (msg.type === 'PROMO_DISCOUNT_SYNC') {
          if (Array.isArray(msg.promos)) setPromos(msg.promos);
          if (Array.isArray(msg.discounts)) setDiscounts(msg.discounts);
        }
      };
    }

    const handleStorageSync = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      if (e.key.endsWith('latisha_promo_ads')) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setPromos(parsed);
        } catch {}
      } else if (e.key.endsWith('latisha_sales_discounts')) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setDiscounts(parsed);
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageSync);

    return () => {
      window.removeEventListener('latisha_profile_updated', handleProfileUpdated);
      window.removeEventListener('storage', handleStorageSync);
      if (mitraChannel) mitraChannel.unsubscribe();
      if (medChannel) medChannel.unsubscribe();
      if (orderChannel) orderChannel.unsubscribe();
      if (promoDiscountChannel) promoDiscountChannel.unsubscribe();
      if (bc) bc.close();
      if (mitraBc) mitraBc.close();
      if (promoBc) promoBc.close();
    };
  }, []);

  // Keep cart item medicine references synced with live catalog stock/prices per room
  useEffect(() => {
    setCartByRoom((prevByRoom) => {
      let overallChanged = false;
      const syncRoomCart = (
        roomKey: PortalOrderRoom,
        roomCart: Record<string, PortalCartEntry>
      ): Record<string, PortalCartEntry> => {
        let changed = false;
        const next: Record<string, PortalCartEntry> = {};
        Object.entries(roomCart).forEach(([id, entry]) => {
          const latestMed = catalog.find((m) => m.id === id);
          if (latestMed) {
            const maxQty =
              roomKey === 'MITRA'
                ? getAvailableBoxStock(latestMed)
                : Math.max(0, Number(latestMed.stock) || 0);
            const adjustedQty = maxQty <= 0 ? 0 : Math.min(entry.qtyBox, maxQty);
            if (adjustedQty > 0) {
              if (latestMed !== entry.medicine || adjustedQty !== entry.qtyBox) changed = true;
              next[id] = { medicine: latestMed, qtyBox: adjustedQty };
            } else {
              changed = true;
            }
          } else {
            next[id] = entry;
          }
        });
        if (changed) overallChanged = true;
        return changed ? next : roomCart;
      };

      const nextReg = syncRoomCart('REGULER', prevByRoom.REGULER);
      const nextMitra = syncRoomCart('MITRA', prevByRoom.MITRA);
      return overallChanged ? { REGULER: nextReg, MITRA: nextMitra } : prevByRoom;
    });
  }, [catalog]);

  // Verified Mitra strictly bound to explicit Nama Mitra + ID Mitra login in this session
  const verifiedMitraRecord = useMemo(() => {
    if (!verifiedMitraSession) return undefined;
    return (
      registeredMitraList.find((m) => m.id === verifiedMitraSession.id) ||
      verifiedMitraSession
    );
  }, [verifiedMitraSession, registeredMitraList]);

  const isVerifiedMitra = Boolean(verifiedMitraRecord);

  // Sync verified mitra checkout fields in React memory when logged in
  useEffect(() => {
    if (verifiedMitraRecord) {
      if (selectedMitraId !== verifiedMitraRecord.id) {
        setSelectedMitraId(verifiedMitraRecord.id);
      }
      if (mitraName !== verifiedMitraRecord.name) {
        setMitraName(verifiedMitraRecord.name);
      }
      if (verifiedMitraRecord.category) setMitraCategory(verifiedMitraRecord.category);
      if (verifiedMitraRecord.phone && !mitraPhone) setMitraPhone(verifiedMitraRecord.phone);
      if (verifiedMitraRecord.address && !mitraAddress) setMitraAddress(verifiedMitraRecord.address);
      if (verifiedMitraRecord.picName && !picName) setPicName(verifiedMitraRecord.picName);
    }
  }, [verifiedMitraRecord]);

  const getRoomUnitPrice = (med: Medicine, room: PortalOrderRoom = activeRoom): number => {
    if (room === 'REGULER') {
      const regUnit = Math.round(Number(med.sellPrice) || 0);
      if (regUnit > 0) return regUnit;
      const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
      return Math.round(getMitraBoxPrice(med) / ratio);
    }
    return getMitraBoxPrice(med);
  };

  const getRoomUnitLabel = (med: Medicine, room: PortalOrderRoom = activeRoom): string => {
    return room === 'REGULER'
      ? med.satuanKecil || med.unit || 'Tablet'
      : med.satuanBesar || 'Box';
  };

  const getRoomAvailableStock = (med: Medicine, room: PortalOrderRoom = activeRoom): number => {
    return room === 'REGULER'
      ? Math.max(0, Number(med.stock) || 0)
      : getAvailableBoxStock(med);
  };

  const handleSwitchRoom = (nextRoom: PortalOrderRoom) => {
    if (nextRoom === activeRoom) return;
    setActiveRoom(nextRoom);
    setSubmitError('');
    setMitraLockAlert(null);
    recordPortalActivity({
      room: nextRoom,
      eventType: 'ROOM_SWITCH',
      mitraVerified: nextRoom === 'MITRA' ? isVerifiedMitra : undefined,
      mitraName: nextRoom === 'MITRA' && verifiedMitraRecord ? verifiedMitraRecord.name : undefined
    });
  };

  const categories = useMemo(() => {
    const set = new Set<string>(['Semua']);
    catalog.forEach((m) => {
      if (m.category && m.category.trim()) set.add(m.category.trim());
    });
    return Array.from(set);
  }, [catalog]);

  const kelasTerapiOptions = useMemo(() => {
    const set = new Set<string>(['Semua']);
    catalog.forEach((m) => {
      if (m.kelas && m.kelas.trim()) set.add(m.kelas.trim());
    });
    return Array.from(set).sort((a, b) => (a === 'Semua' ? -1 : b === 'Semua' ? 1 : a.localeCompare(b)));
  }, [catalog]);

  const statusResepOptions = useMemo(() => {
    const set = new Set<string>(['Semua']);
    catalog.forEach((m) => {
      const req = getMedicinePrescriptionRequirement(m, rxStatusConfigs);
      if (req.badgeLabel) set.add(req.badgeLabel);
    });
    return Array.from(set);
  }, [catalog, rxStatusConfigs]);

  const filteredCatalog = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    return catalog.filter((m) => {
      if (selectedCategory !== 'Semua' && (m.category || '').trim() !== selectedCategory) {
        return false;
      }
      if (selectedKelasTerapi !== 'Semua' && (m.kelas || '').trim() !== selectedKelasTerapi) {
        return false;
      }
      const rxReq = getMedicinePrescriptionRequirement(m, rxStatusConfigs);
      if (selectedStatusResep !== 'Semua' && rxReq.badgeLabel !== selectedStatusResep) {
        return false;
      }
      if (onlyAvailableStock && getRoomAvailableStock(m, activeRoom) <= 0) {
        return false;
      }
      if (!q) return true;
      return (
        (m.name || '').toLowerCase().includes(q) ||
        (m.kekuatan || '').toLowerCase().includes(q) ||
        (m.kelas || '').toLowerCase().includes(q) ||
        (m.category || '').toLowerCase().includes(q) ||
        rxReq.badgeLabel.toLowerCase().includes(q) ||
        (m.barcode || '').toLowerCase().includes(q) ||
        (m.id || '').toLowerCase().includes(q)
      );
    });
  }, [
    catalog,
    rxStatusConfigs,
    deferredSearchQuery,
    selectedCategory,
    selectedKelasTerapi,
    selectedStatusResep,
    onlyAvailableStock,
    activeRoom
  ]);

  const totalCatalogPages = Math.max(1, Math.ceil(filteredCatalog.length / CATALOG_PAGE_SIZE));
  const safeCatalogPage = Math.min(catalogPage, totalCatalogPages);
  const paginatedCatalog = useMemo(() => {
    const startIdx = (safeCatalogPage - 1) * CATALOG_PAGE_SIZE;
    return filteredCatalog.slice(startIdx, startIdx + CATALOG_PAGE_SIZE);
  }, [filteredCatalog, safeCatalogPage]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalCartItemsCount = cartItems.length;
  const totalCartBoxes = useMemo(
    () => cartItems.reduce((sum, entry) => sum + entry.qtyBox, 0),
    [cartItems]
  );
  const totalCartAmount = useMemo(
    () =>
      cartItems.reduce(
        (sum, entry) => sum + getRoomUnitPrice(entry.medicine, activeRoom) * entry.qtyBox,
        0
      ),
    [cartItems, activeRoom]
  );

  // Evaluate Prescription Requirement for current active room cart (mandatory in Ruang Reguler/Umum)
  const cartRxEval = useMemo(
    () =>
      evaluateCartPrescriptionRequirement(
        cartItems.map((entry) => entry.medicine),
        rxStatusConfigs
      ),
    [cartItems, rxStatusConfigs]
  );

  // Evaluate live portal promos & eligible sales discounts for the active room
  const activeChannelScope = activeRoom === 'REGULER' ? 'REGULER' : 'PORTAL_MITRA';
  const livePromos = useMemo(() => getLivePortalPromos(promos), [promos]);

  useEffect(() => {
    if (livePromos.length <= 1 || isBannerHovered) return;
    const timer = setInterval(() => {
      setActivePromoSlide((prev) => (prev + 1) % livePromos.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [livePromos.length, isBannerHovered]);

  useEffect(() => {
    if (activePromoSlide >= livePromos.length && livePromos.length > 0) {
      setActivePromoSlide(0);
    }
  }, [livePromos.length, activePromoSlide]);

  const activePortalDiscounts = useMemo(
    () =>
      discounts.filter(
        (d) =>
          d.isActive &&
          isWithinDateWindow(d.startDate, d.endDate) &&
          matchesChannelScope(d.channelScope, activeChannelScope)
      ),
    [discounts, activeChannelScope]
  );

  const portalDiscountEval = useMemo(() => {
    const lines = cartItems.map((entry) => ({
      medicineId: entry.medicine.id,
      category: entry.medicine.category,
      kelas: entry.medicine.kelas,
      qty: entry.qtyBox,
      subtotal: getRoomUnitPrice(entry.medicine, activeRoom) * entry.qtyBox
    }));
    return findBestCartDiscount(discounts, lines, activeChannelScope, portalVoucherInput);
  }, [discounts, cartItems, activeRoom, activeChannelScope, portalVoucherInput]);

  const appliedPortalDiscount = portalDiscountEval.activeApplied;
  const portalDiscountAmount = appliedPortalDiscount?.amount || 0;
  const netCartAmount = Math.max(0, totalCartAmount - portalDiscountAmount);

  const handleApplyPromoCta = (promo: PromoAd) => {
    if (promo.ctaFilterCategory) {
      setSelectedCategory(promo.ctaFilterCategory);
    } else {
      setSelectedCategory('Semua');
    }
    if (promo.ctaFilterKelas) {
      setSelectedKelasTerapi(promo.ctaFilterKelas);
    } else {
      setSelectedKelasTerapi('Semua');
    }
    if (promo.ctaSearchQuery) {
      setSearchQuery(promo.ctaSearchQuery);
    }
    if (promo.promoCode) {
      setPortalVoucherInput(promo.promoCode);
      setCopiedPromoCode(promo.promoCode);
      setTimeout(() => setCopiedPromoCode(''), 2500);
    }
    const el = document.getElementById('portal-katalog-filters');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleInspectProduct = (med: Medicine) => {
    setInspectProduct(med);
    const rxReq = getMedicinePrescriptionRequirement(med);
    recordPortalActivity({
      room: activeRoom,
      eventType: 'VIEW_PRODUCT',
      medicineId: med.id,
      medicineName: med.name,
      medicineCategory: med.category,
      unitPrice: getRoomUnitPrice(med, activeRoom),
      rxRequired: rxReq.requiresRx,
      rxRequirementLabel: rxReq.requiresRx ? rxReq.badgeLabel : undefined,
      mitraVerified: activeRoom === 'MITRA' ? isVerifiedMitra : undefined,
      mitraName: activeRoom === 'MITRA' && verifiedMitraRecord ? verifiedMitraRecord.name : undefined
    });
  };

  const handleOpenCartDrawer = () => {
    setIsCartOpen(true);
    if (cartItems.length > 0) {
      recordPortalActivity({
        room: activeRoom,
        eventType: 'CHECKOUT_STARTED',
        qty: totalCartBoxes,
        unitPrice: netCartAmount,
        rxRequired: activeRoom === 'REGULER' ? cartRxEval.requiresRx : false,
        rxRequirementLabel:
          activeRoom === 'REGULER' && cartRxEval.requiresRx ? cartRxEval.badgeLabel : undefined,
        mitraVerified: activeRoom === 'MITRA' ? isVerifiedMitra : undefined,
        mitraName: activeRoom === 'MITRA' && verifiedMitraRecord ? verifiedMitraRecord.name : undefined
      });
    }
  };

  const handleSetCartQty = (med: Medicine, nextQty: number) => {
    // Hard guard in Ruang Order Mitra: ONLY active for registered/verified Mitra
    if (activeRoom === 'MITRA' && !isVerifiedMitra && nextQty > 0) {
      setMitraLockAlert({ medicineName: med.name });
      recordPortalActivity({
        room: 'MITRA',
        eventType: 'LOCKED_MITRA_ATTEMPT',
        medicineId: med.id,
        medicineName: med.name,
        medicineCategory: med.category,
        unitPrice: getRoomUnitPrice(med, 'MITRA'),
        mitraVerified: false
      });
      return;
    }

    const availableStock = getRoomAvailableStock(med, activeRoom);
    if (availableStock <= 0 && nextQty > 0) return;
    const clamped = Math.max(0, Math.min(availableStock, Math.floor(nextQty)));
    const prevQty = cartByRoom[activeRoom][med.id]?.qtyBox || 0;

    setCartByRoom((prev) => {
      const roomCart = prev[activeRoom];
      if (clamped <= 0) {
        const copy = { ...roomCart };
        delete copy[med.id];
        return { ...prev, [activeRoom]: copy };
      }
      return {
        ...prev,
        [activeRoom]: {
          ...roomCart,
          [med.id]: { medicine: med, qtyBox: clamped }
        }
      };
    });

    const rxReq = getMedicinePrescriptionRequirement(med);
    if (clamped > prevQty) {
      recordPortalActivity({
        room: activeRoom,
        eventType: 'ADD_TO_CART',
        medicineId: med.id,
        medicineName: med.name,
        medicineCategory: med.category,
        qty: clamped - prevQty,
        unitPrice: getRoomUnitPrice(med, activeRoom),
        rxRequired: rxReq.requiresRx,
        rxRequirementLabel: rxReq.requiresRx ? rxReq.badgeLabel : undefined,
        mitraVerified: activeRoom === 'MITRA' ? isVerifiedMitra : undefined,
        mitraName: activeRoom === 'MITRA' && verifiedMitraRecord ? verifiedMitraRecord.name : undefined
      });
    } else if (clamped === 0 && prevQty > 0) {
      recordPortalActivity({
        room: activeRoom,
        eventType: 'REMOVE_FROM_CART',
        medicineId: med.id,
        medicineName: med.name,
        medicineCategory: med.category,
        qty: prevQty,
        mitraVerified: activeRoom === 'MITRA' ? isVerifiedMitra : undefined
      });
    }
  };

  const handleMitraLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMitraLoginError('');

    const cleanName = loginMitraName.trim().toLowerCase().replace(/\s+/g, ' ');
    const cleanId = loginMitraId.trim().toUpperCase();

    if (!cleanName || !cleanId) {
      setMitraLoginError(
        'Masukkan Nama Mitra dan ID Mitra secara lengkap untuk masuk ke Ruang Order Mitra.'
      );
      return;
    }

    setIsVerifyingMitra(true);
    try {
      let matched = registeredMitraList.find(
        (m) =>
          m.name.trim().toLowerCase().replace(/\s+/g, ' ') === cleanName &&
          m.id.trim().toUpperCase() === cleanId
      );

      if (!matched && !demoActive) {
        const sbRes = await verifyMitraLoginFromSupabase(loginMitraName, loginMitraId);
        if (sbRes.mitra) {
          matched = sbRes.mitra;
          setRegisteredMitraList((prev) => {
            if (prev.some((m) => m.id === sbRes.mitra!.id)) return prev;
            return [sbRes.mitra!, ...prev];
          });
        }
      }

      if (!matched) {
        recordPortalActivity({
          room: 'MITRA',
          eventType: 'MITRA_LOGIN_FAILED',
          mitraVerified: false
        });
        setMitraLoginError(
          'Kombinasi Nama Mitra dan ID Mitra tidak cocok atau belum terdaftar. Pastikan penulisan sesuai data pendaftaran atau hubungi admin Apotek Latisha Farma.'
        );
        return;
      }

      setVerifiedMitraSession(matched);
      setSelectedMitraId(matched.id);
      setMitraName(matched.name);
      setMitraCategory(matched.category || 'Klinik Pratama');
      setMitraPhone(matched.phone || '');
      setMitraAddress(matched.address || '');
      setPicName(matched.picName || '');
      setLoginMitraName('');
      setLoginMitraId('');
      setMitraInputsUnlocked(false);
      setMitraLockAlert(null);
      setMitraLoginError('');

      recordPortalActivity({
        room: 'MITRA',
        eventType: 'MITRA_LOGIN_SUCCESS',
        mitraVerified: true,
        mitraName: matched.name
      });
    } finally {
      setIsVerifyingMitra(false);
    }
  };

  const handleResetMitraSession = () => {
    setVerifiedMitraSession(null);
    setSelectedMitraId('');
    setMitraName('');
    setLoginMitraName('');
    setLoginMitraId('');
    setMitraLoginError('');
    setMitraInputsUnlocked(false);
    setMitraPhone('');
    setMitraAddress('');
    setPicName('');
    setNewlyRegisteredCredential(null);
    setCartByRoom((prev) => ({ ...prev, MITRA: {} }));
    try {
      demoRemoveItem('latisha_portal_mitra_name');
      demoRemoveItem('latisha_portal_mitra_pic');
      demoRemoveItem('latisha_portal_mitra_phone');
      demoRemoveItem('latisha_portal_mitra_address');
    } catch {}
  };

  const handleSelectRxFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRxFileError('');
    setIsProcessingRxFile(true);
    try {
      const { dataUrl, fileName } = await compressPaymentProofFile(file);
      const uploadedAt = new Date().toISOString();
      setRxFileUrl(dataUrl);
      setRxFileName(fileName);
      setRxUploadedAt(uploadedAt);
      recordPortalActivity({
        room: 'REGULER',
        eventType: 'RX_UPLOADED',
        rxRequired: true,
        rxRequirementLabel: cartRxEval.badgeLabel,
        qty: cartRxEval.flaggedItems.length
      });
    } catch (err: any) {
      setRxFileError(err?.message || 'Gagal membaca file resep. Gunakan format JPG, PNG, WEBP, atau PDF.');
    } finally {
      setIsProcessingRxFile(false);
    }
  };

  const handleOpenJadiMitraModal = (prefillFromCheckout = false) => {
    setJadiMitraError('');
    const allowedCategories: Array<NonNullable<Mitra['category']>> = [
      'Klinik Pratama',
      'Klinik Utama',
      'Apotek Mitra',
      'Praktik Dokter Mandiri',
      'Rumah Sakit',
      'Lainnya'
    ];
    const resolvedPrefillCat = allowedCategories.includes(mitraCategory as NonNullable<Mitra['category']>)
      ? (mitraCategory as Mitra['category'])
      : 'Klinik Pratama';
    setMitraFormData({
      name: prefillFromCheckout ? mitraName.trim() : '',
      phone: prefillFromCheckout ? mitraPhone.trim() : '',
      licenseNo: '',
      licenseFileUrl: '',
      licenseFileName: '',
      licenseFileType: '',
      licenseUploadedAt: '',
      address: prefillFromCheckout ? mitraAddress.trim() : '',
      category: prefillFromCheckout ? resolvedPrefillCat : 'Klinik Pratama',
      picName: prefillFromCheckout ? picName.trim() : ''
    });
    setShowJadiMitraModal(true);
  };

  const handleSelectMitraLicenseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setJadiMitraError('');
    setIsProcessingMitraLicense(true);
    try {
      const processed = await processMitraLicenseFile(file);
      setMitraFormData((prev) => ({
        ...prev,
        licenseFileUrl: processed.dataUrl,
        licenseFileName: processed.fileName,
        licenseFileType: processed.fileType,
        licenseUploadedAt: processed.uploadedAt
      }));
    } catch (err: any) {
      setJadiMitraError(err?.message || 'Gagal memproses file izin fasilitas.');
    } finally {
      setIsProcessingMitraLicense(false);
    }
  };

  const handleSubmitJadiMitra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !mitraFormData.name.trim() ||
      !mitraFormData.phone.trim() ||
      !mitraFormData.licenseNo.trim() ||
      !mitraFormData.address.trim()
    ) {
      setJadiMitraError(
        'Harap lengkapi semua kolom wajib (Nama Faskes, No. Tlp, No. Izin, Alamat).'
      );
      return;
    }
    if (!mitraFormData.licenseFileUrl) {
      setJadiMitraError(
        'File izin fasilitas (format PDF atau JPG) wajib diunggah sebelum mendaftar sebagai Mitra.'
      );
      return;
    }

    setJadiMitraError('');
    setIsSavingMitra(true);

    const randTwo = Math.floor(10 + Math.random() * 90);
    const newMitra: Mitra = {
      id: `MTR-${String(Date.now()).slice(-4)}${randTwo}`,
      name: mitraFormData.name.trim(),
      phone: mitraFormData.phone.trim(),
      licenseNo: mitraFormData.licenseNo.trim(),
      licenseFileUrl: mitraFormData.licenseFileUrl,
      licenseFileName: mitraFormData.licenseFileName || 'izin-fasilitas',
      licenseFileType: mitraFormData.licenseFileType || undefined,
      licenseUploadedAt: mitraFormData.licenseUploadedAt || new Date().toISOString(),
      address: mitraFormData.address.trim(),
      category: mitraFormData.category,
      picName: mitraFormData.picName.trim(),
      createdAt: new Date().toISOString().split('T')[0]
    };

    try {
      // 1. Update local state & localStorage (latisha_mitra)
      setRegisteredMitraList((prev) => {
        const updated = [newMitra, ...prev.filter((m) => m.id !== newMitra.id)];
        try {
          demoSetItem('latisha_mitra', JSON.stringify(updated));
        } catch {}
        return updated;
      });

      // 2. Notify parent main app state if mounted inside App.tsx
      if (onRegisterMitra) {
        onRegisterMitra(newMitra);
      } else if (!demoActive) {
        // Standalone portal mode: sync directly to Supabase mitra table
        await syncMitraToSupabase(newMitra);
      }

      // 3. Broadcast to any open main app tab
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const mitraBc = new BroadcastChannel(
            getDemoBroadcastChannelName('latisha_mitra_channel')
          );
          mitraBc.postMessage({ type: 'MITRA_ADD', mitra: newMitra });
          mitraBc.close();
        } catch {}
      }

      // 4. Auto-login newly registered Mitra strictly in this tab's session & show ID Mitra
      setVerifiedMitraSession(newMitra);
      setSelectedMitraId(newMitra.id);
      setMitraName(newMitra.name);
      setLoginMitraName('');
      setLoginMitraId('');
      setMitraLoginError('');
      setMitraLockAlert(null);
      setMitraCategory(newMitra.category || 'Klinik Pratama');
      setPicName(newMitra.picName || '');
      setMitraPhone(newMitra.phone);
      setMitraAddress(newMitra.address);
      setNewlyRegisteredCredential({ name: newMitra.name, id: newMitra.id });
      setCopiedNewMitraId(false);

      recordPortalActivity({
        room: 'MITRA',
        eventType: 'MITRA_LOGIN_SUCCESS',
        mitraVerified: true,
        mitraName: newMitra.name
      });

      setShowJadiMitraModal(false);
      setJadiMitraSuccessToast(
        demoActive
          ? `Pendaftaran Mitra "${newMitra.name}" berhasil (ID Mitra: ${newMitra.id}) di Mode Demo!`
          : `Pendaftaran Mitra "${newMitra.name}" berhasil! Simpan ID Mitra Anda: ${newMitra.id} untuk login berikutnya.`
      );
      setTimeout(() => setJadiMitraSuccessToast(''), 8000);
    } finally {
      setIsSavingMitra(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (cartItems.length === 0) {
      setSubmitError('Keranjang masih kosong. Pilih minimal 1 produk obat terlebih dahulu.');
      return;
    }

    if (activeRoom === 'MITRA') {
      if (!isVerifiedMitra || !verifiedMitraRecord) {
        setSubmitError(
          'Pemesanan di Ruang Order Mitra hanya aktif untuk Mitra terregistrasi. Silakan verifikasi Mitra terdaftar atau daftar melalui tombol "Jadi Mitra".'
        );
        return;
      }
      if (!mitraPhone.trim()) {
        setSubmitError('Nomor WhatsApp / Telepon Mitra wajib diisi agar admin dapat mengonfirmasi pengiriman.');
        return;
      }
    } else {
      if (!regulerName.trim()) {
        setSubmitError('Nama Lengkap Pemesan / Pasien wajib diisi.');
        return;
      }
      if (!regulerPhone.trim()) {
        setSubmitError('Nomor WhatsApp / Telepon wajib diisi agar apotek dapat menghubungi Anda.');
        return;
      }
      if (cartRxEval.requiresRx && !rxFileUrl) {
        setSubmitError(
          `Keranjang memuat obat dengan status "${cartRxEval.badgeLabel}". Anda wajib mengunggah foto/file resep terlebih dahulu sebelum mengirim pesanan.`
        );
        recordPortalActivity({
          room: 'REGULER',
          eventType: 'RX_REQUIRED_PROMPT',
          rxRequired: true,
          rxRequirementLabel: cartRxEval.badgeLabel,
          qty: cartRxEval.flaggedItems.length
        });
        return;
      }
    }

    setIsSubmitting(true);

    // Live concurrent stock validation against Supabase before creating order
    let liveCatalogCheck = catalog;
    if (!demoActive && getSupabaseConfig().url && getSupabaseConfig().key) {
      try {
        const freshRes = await fetchPublicMedicinesCatalog();
        if (freshRes.data && freshRes.data.length > 0) {
          liveCatalogCheck = freshRes.data;
          setCatalog(freshRes.data);
        }
      } catch {}
    }

    for (const entry of cartItems) {
      const latestMed = liveCatalogCheck.find((m) => m.id === entry.medicine.id) || entry.medicine;
      const avail = getRoomAvailableStock(latestMed, activeRoom);
      const unitLabel = getRoomUnitLabel(latestMed, activeRoom);
      if (entry.qtyBox > avail) {
        setSubmitError(
          `Stok "${latestMed.name}" baru saja diperbarui oleh transaksi lain dan hanya tersisa ${avail} ${unitLabel}. Harap sesuaikan jumlah pesanan.`
        );
        setIsSubmitting(false);
        return;
      }
    }

    const now = new Date();
    const ymd = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const entropy =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
        : `${Math.floor(100 + Math.random() * 900)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const orderId = `ORD-${Date.now()}-${entropy}`;
    const orderCode = activeRoom === 'REGULER' ? `REG-${ymd}-${entropy}` : `MTR-${ymd}-${entropy}`;

    const items: MitraOrderItem[] = cartItems.map((entry) => {
      const med = liveCatalogCheck.find((m) => m.id === entry.medicine.id) || entry.medicine;
      const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
      const rxReq = getMedicinePrescriptionRequirement(med);

      if (activeRoom === 'REGULER') {
        const unitPriceSmall = getRoomUnitPrice(med, 'REGULER');
        const unitKecil = med.satuanKecil || med.unit || 'Tablet';
        const hppKecil = Number(med.hpp) || Math.round(getMedicineHppBox(med) / ratio);
        return {
          medicineId: med.id,
          name: med.name,
          kekuatan: med.kekuatan || '-',
          kelas: med.kelas || '-',
          category: med.category || '-',
          satuanBesar: unitKecil,
          satuanKecil: unitKecil,
          rasioKonversi: 1,
          qtyBox: entry.qtyBox,
          qtyTotalKecil: entry.qtyBox,
          unitPriceBox: unitPriceSmall,
          hppBox: hppKecil,
          subtotal: unitPriceSmall * entry.qtyBox,
          unitMode: 'KECIL',
          rxRequirementLabel: rxReq.requiresRx ? rxReq.badgeLabel : undefined
        };
      }

      const pricePerBox = getMitraBoxPrice(med);
      const hppPerBox = getMedicineHppBox(med);
      return {
        medicineId: med.id,
        name: med.name,
        kekuatan: med.kekuatan || '-',
        kelas: med.kelas || '-',
        category: med.category || '-',
        satuanBesar: med.satuanBesar || 'Box',
        satuanKecil: med.satuanKecil || 'Tablet',
        rasioKonversi: ratio,
        qtyBox: entry.qtyBox,
        qtyTotalKecil: entry.qtyBox * ratio,
        unitPriceBox: pricePerBox,
        hppBox: hppPerBox,
        subtotal: pricePerBox * entry.qtyBox,
        unitMode: 'BESAR',
        rxRequirementLabel: rxReq.requiresRx ? rxReq.badgeLabel : undefined
      };
    });

    const subtotalOrder = items.reduce((sum, it) => sum + it.subtotal, 0);
    const evalLines = items.map((it) => ({
      medicineId: it.medicineId,
      category: it.category,
      kelas: it.kelas,
      qty: it.qtyBox,
      subtotal: it.subtotal
    }));
    const finalDiscountEval = findBestCartDiscount(
      discounts,
      evalLines,
      activeChannelScope,
      portalVoucherInput
    ).activeApplied;
    const finalDiscountAmount = finalDiscountEval ? finalDiscountEval.amount : 0;
    const finalTotalAmount = Math.max(0, subtotalOrder - finalDiscountAmount);

    const newOrder: MitraOrder = {
      id: orderId,
      orderCode,
      orderRoom: activeRoom,
      mitraId: activeRoom === 'MITRA' ? verifiedMitraRecord?.id : undefined,
      mitraName: activeRoom === 'REGULER' ? regulerName.trim() : verifiedMitraRecord!.name,
      mitraCategory:
        activeRoom === 'REGULER'
          ? 'Pelanggan Reguler / Umum'
          : (verifiedMitraRecord?.category || mitraCategory.trim() || 'Mitra Faskes'),
      mitraPhone: activeRoom === 'REGULER' ? regulerPhone.trim() : mitraPhone.trim(),
      mitraAddress: activeRoom === 'REGULER' ? regulerAddress.trim() : mitraAddress.trim(),
      picName: activeRoom === 'REGULER' ? regulerName.trim() : picName.trim(),
      items,
      totalItems: items.length,
      totalQtyBox: items.reduce((sum, it) => sum + it.qtyBox, 0),
      discountAmount: finalDiscountAmount > 0 ? finalDiscountAmount : undefined,
      appliedDiscountLabel: finalDiscountEval
        ? `${finalDiscountEval.discount.name}${
            finalDiscountEval.discount.code ? ` (${finalDiscountEval.discount.code})` : ''
          }`
        : undefined,
      totalAmount: finalTotalAmount,
      status: 'Pending',
      paymentMethod: 'Transfer Bank',
      paymentStatus: 'Menunggu Pembayaran',
      rxRequired: activeRoom === 'REGULER' ? cartRxEval.requiresRx : false,
      rxRequirementLabel:
        activeRoom === 'REGULER' && cartRxEval.requiresRx ? cartRxEval.badgeLabel : undefined,
      rxFileUrl: activeRoom === 'REGULER' && cartRxEval.requiresRx ? rxFileUrl : undefined,
      rxFileName: activeRoom === 'REGULER' && cartRxEval.requiresRx ? rxFileName : undefined,
      rxUploadedAt: activeRoom === 'REGULER' && cartRxEval.requiresRx ? rxUploadedAt : undefined,
      notes: orderNotes.trim(),
      createdAt: now.toISOString(),
      branchId: 'BR-01'
    };

    // Keep Reguler customer convenience info ONLY in tab-scoped sessionStorage (never leak across tabs/users)
    try {
      if (activeRoom === 'REGULER') {
        window.sessionStorage.setItem('latisha_portal_reguler_name', newOrder.mitraName);
        window.sessionStorage.setItem('latisha_portal_reguler_phone', newOrder.mitraPhone || '');
        window.sessionStorage.setItem('latisha_portal_reguler_address', newOrder.mitraAddress || '');
      }
    } catch {}

    // Track this order in current tab session for isolated status tracking
    setSessionOrderIds((prev) => {
      const nextIds = prev.includes(newOrder.id) ? prev : [newOrder.id, ...prev].slice(0, 100);
      try {
        window.sessionStorage.setItem('latisha_portal_session_orders', JSON.stringify(nextIds));
      } catch {}
      return nextIds;
    });

    // Save locally + broadcast
    setMyOrders((prev) => {
      const updated = [newOrder, ...prev];
      try {
        demoSetItem('latisha_mitra_orders', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_mitra_orders_channel'));
        bc.postMessage({ type: 'ORDER_UPSERT', order: newOrder });
        bc.close();
      } catch {}
    }

    // Log checkout submission per room & item to Strategi Marketing activity logs
    recordPortalActivity({
      room: activeRoom,
      eventType: 'CHECKOUT_SUBMITTED',
      orderCode: newOrder.orderCode,
      qty: newOrder.totalQtyBox,
      unitPrice: newOrder.totalAmount,
      rxRequired: newOrder.rxRequired,
      rxRequirementLabel: newOrder.rxRequirementLabel,
      mitraVerified: activeRoom === 'MITRA' ? true : undefined,
      mitraName: newOrder.mitraName
    });

    // Sync to Supabase
    await syncMitraOrderToSupabase(newOrder);

    onOrderSubmitted?.(newOrder);
    setCartByRoom((prev) => ({ ...prev, [activeRoom]: {} }));
    if (activeRoom === 'REGULER') {
      setRxFileUrl('');
      setRxFileName('');
      setRxUploadedAt('');
      setRxFileError('');
    }
    setOrderNotes('');
    setIsCartOpen(false);
    openOrderPaymentScreen(newOrder);
    setIsSubmitting(false);
  };

  const activePortalBanks = useMemo(() => {
    const filtered = filterPortalBankAccounts(
      bankAccounts.length > 0 ? bankAccounts : DEFAULT_BANK_ACCOUNTS
    );
    return filtered.length > 0 ? filtered : filterPortalBankAccounts(DEFAULT_BANK_ACCOUNTS);
  }, [bankAccounts]);

  const openOrderPaymentScreen = (ord: MitraOrder) => {
    setConfirmedOrder(ord);
    setProofPreviewUrl(ord.paymentProofUrl || '');
    setProofFileName(ord.paymentProofName || '');
    const defaultBank =
      ord.paymentBankTarget ||
      (activePortalBanks[0]
        ? `${activePortalBanks[0].bankName} - ${activePortalBanks[0].accountNumber} a/n ${activePortalBanks[0].accountHolder}`
        : QRIS_PAYMENT_TARGET_LABEL);
    setSelectedBankTarget(defaultBank);
    setQrisImgSrc(QRIS_PRIMARY_PATH);
    setQrisLoadError(false);
    setZoomQrisModal(false);
    setProofError('');
    setProofSuccessMessage('');
  };

  const handleSelectProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofError('');
    setProofSuccessMessage('');
    try {
      const { dataUrl, fileName } = await compressPaymentProofFile(file);
      setProofPreviewUrl(dataUrl);
      setProofFileName(fileName);
    } catch (err: any) {
      setProofError(err?.message || 'Gagal memproses file bukti pembayaran.');
    }
  };

  const handleUploadPaymentProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmedOrder) return;
    if (!proofPreviewUrl) {
      setProofError('Silakan pilih atau unggah foto / file PDF bukti transfer atau QRIS terlebih dahulu.');
      return;
    }

    setIsUploadingProof(true);
    setProofError('');
    setProofSuccessMessage('');

    const nowIso = new Date().toISOString();
    const isQrisPayment = selectedBankTarget.toUpperCase().startsWith('QRIS');
    const updatedOrder: MitraOrder = {
      ...confirmedOrder,
      paymentMethod: isQrisPayment ? 'QRIS' : 'Transfer Bank',
      paymentStatus: 'Menunggu Verifikasi',
      paymentProofUrl: proofPreviewUrl,
      paymentProofName: proofFileName || 'bukti-pembayaran.jpg',
      paymentUploadedAt: nowIso,
      paymentBankTarget: selectedBankTarget,
      paymentRejectionReason: undefined,
      updatedAt: nowIso
    };

    setMyOrders((prev) => {
      const updated = prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
      try {
        demoSetItem('latisha_mitra_orders', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setConfirmedOrder(updatedOrder);
    onOrderSubmitted?.(updatedOrder);

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_mitra_orders_channel'));
        bc.postMessage({ type: 'ORDER_UPSERT', order: updatedOrder });
        bc.close();
      } catch {}
    }

    const res = await syncMitraOrderToSupabase(updatedOrder);
    if (res.needsMigration) {
      setProofSuccessMessage('Bukti transfer tersimpan! Menunggu validasi Admin apotek.');
    } else if (!res.success && res.error) {
      setProofSuccessMessage('Bukti transfer tersimpan lokal. Menunggu verifikasi Admin apotek.');
    } else {
      setProofSuccessMessage('Bukti pembayaran berhasil dikirim ke sistem & menunggu validasi Admin!');
    }
    setIsUploadingProof(false);
  };

  const filteredOrders = useMemo(() => {
    const q = orderSearchQuery.trim().toLowerCase();
    return myOrders.filter((ord) => {
      const ordRoom: PortalOrderRoom =
        ord.orderRoom || (String(ord.orderCode || '').startsWith('REG-') ? 'REGULER' : 'MITRA');

      // Session & privacy isolation: show current tab session orders, verified logged-in Mitra orders, or exact Order Code lookup
      const inSession = sessionOrderIds.includes(ord.id);
      const belongsToVerifiedMitra = Boolean(
        isVerifiedMitra &&
          verifiedMitraRecord &&
          ordRoom === 'MITRA' &&
          ((ord.mitraId && ord.mitraId === verifiedMitraRecord.id) ||
            ord.mitraName.trim().toLowerCase() === verifiedMitraRecord.name.trim().toLowerCase())
      );
      const exactCodeLookup = q.length >= 6 && ord.orderCode.toLowerCase() === q;

      if (!inSession && !belongsToVerifiedMitra && !exactCodeLookup) {
        return false;
      }

      if (orderRoomFilter !== 'ALL' && ordRoom !== orderRoomFilter) return false;
      if (!q) return true;
      return (
        ord.orderCode.toLowerCase().includes(q) ||
        ord.mitraName.toLowerCase().includes(q) ||
        (ord.picName || '').toLowerCase().includes(q) ||
        ord.items.some((it) => it.name.toLowerCase().includes(q))
      );
    });
  }, [myOrders, orderSearchQuery, orderRoomFilter, sessionOrderIds, isVerifiedMitra, verifiedMitraRecord]);

  const visibleOrdersCount = useMemo(() => {
    return myOrders.filter((ord) => {
      const ordRoom: PortalOrderRoom =
        ord.orderRoom || (String(ord.orderCode || '').startsWith('REG-') ? 'REGULER' : 'MITRA');
      if (sessionOrderIds.includes(ord.id)) return true;
      if (
        isVerifiedMitra &&
        verifiedMitraRecord &&
        ordRoom === 'MITRA' &&
        ((ord.mitraId && ord.mitraId === verifiedMitraRecord.id) ||
          ord.mitraName.trim().toLowerCase() === verifiedMitraRecord.name.trim().toLowerCase())
      ) {
        return true;
      }
      return false;
    }).length;
  }, [myOrders, sessionOrderIds, isVerifiedMitra, verifiedMitraRecord]);

  const supabaseConfigured = Boolean(getSupabaseConfig().url && getSupabaseConfig().key);

  const handlePortalResetDemo = async () => {
    if (onResetDemo) {
      onResetDemo();
    }
    const { seedDemoSandboxStorage } = await import('../data/demoData');
    const fresh = seedDemoSandboxStorage(true);
    setCatalog(fresh.medicines);
    setMyOrders(fresh.mitraOrders);
    setCartByRoom({ REGULER: {}, MITRA: {} });
    setConfirmedOrder(null);
    setPortalDemoToast('Data Demo Portal Order Mandiri berhasil direset ke kondisi awal!');
    setTimeout(() => setPortalDemoToast(''), 3500);
  };

  return (
    <div className={`${embeddedInUnifiedApp ? 'flex-1 pb-24 sm:pb-12' : 'min-h-screen pb-24 sm:pb-12'} bg-slate-50 text-slate-900 flex flex-col`}>
      {demoActive && !embeddedInUnifiedApp && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 border-b border-amber-600/30">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <span className="px-2 py-0.5 rounded bg-slate-950 text-amber-400 text-[10px] font-black tracking-wider uppercase">
                MODE DEMO / SANDBOX
              </span>
              <span>
                Simulasi Portal Order Mitra terisolasi — pesanan &amp; upload bukti bayar tidak mengubah database asli.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePortalResetDemo}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset Demo</span>
              </button>
              {onExitDemo && (
                <button
                  type="button"
                  onClick={onExitDemo}
                  className="px-2.5 py-1 rounded-lg bg-white/80 hover:bg-white text-slate-900 font-bold text-[11px] cursor-pointer transition"
                >
                  Keluar Demo
                </button>
              )}
            </div>
          </div>
          {portalDemoToast && (
            <div className="max-w-6xl mx-auto mt-1.5 text-[11px] font-extrabold text-emerald-950 bg-emerald-100 border border-emerald-300 rounded-lg px-2.5 py-1">
              {portalDemoToast}
            </div>
          )}
        </div>
      )}

      {/* Top Sticky Portal Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white p-1 border border-slate-200 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
              <img
                src={`${import.meta.env.BASE_URL}assets/aistudio/logo_resmi_apotek_673c56f0.png`}
                alt="Logo Apotek Latisha Farma"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight truncate">
                  Portal Order Mandiri · Latisha Farma
                </h1>
                {demoActive && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase shrink-0">
                    SANDBOX
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                <Database className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>
                  {demoActive
                    ? 'Mode Demo Terisolasi (Dummy Data Lokal)'
                    : catalogSource === 'supabase'
                    ? 'Tersinkron Real-time Supabase'
                    : supabaseConfigured
                    ? 'Sinkronisasi Lokal & Supabase Siap'
                    : 'Mode Katalog Lokal'}
                  {lastSyncedAt ? ` · ${lastSyncedAt}` : ''}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadCatalog}
              title="Refresh Katalog & Stok Real-time"
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingCatalog ? 'animate-spin text-emerald-600' : ''}`} />
              <span className="hidden md:inline">Refresh Stok</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCartDrawer}
              className="min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition shadow-sm"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="font-mono tabular-nums">
                {totalCartBoxes > 0
                  ? `${totalCartBoxes} ${activeRoom === 'REGULER' ? 'Item' : 'Box'}`
                  : 'Keranjang'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenJadiMitraModal(false)}
              className="min-h-[40px] px-3.5 rounded-xl border border-indigo-200 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-sm active:scale-95"
            >
              <Handshake className="w-4 h-4" />
              <span>Jadi Mitra</span>
            </button>
          </div>
        </div>

        {jadiMitraSuccessToast && (
          <div className="max-w-6xl mx-auto px-4 pb-2">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs font-bold text-emerald-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{jadiMitraSuccessToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setJadiMitraSuccessToast('')}
                className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Dual-Chamber Room Switcher + Portal Navigation Tabs */}
        <div className="max-w-6xl mx-auto px-4 pb-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                handleSwitchRoom('REGULER');
                setActivePortalTab('katalog');
              }}
              className={`text-left px-3.5 py-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                activeRoom === 'REGULER'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Users className={`w-4 h-4 shrink-0 ${activeRoom === 'REGULER' ? 'text-emerald-100' : 'text-emerald-600'}`} />
                <div className="min-w-0">
                  <div className="text-xs font-extrabold truncate">
                    Ruang Order Reguler / Umum
                  </div>
                  <div className={`text-[11px] truncate ${activeRoom === 'REGULER' ? 'text-emerald-100' : 'text-slate-500'}`}>
                    Order bebas tanpa registrasi · Harga eceran &amp; unggah resep bila wajib
                  </div>
                </div>
              </div>
              {Object.keys(cartByRoom.REGULER).length > 0 && (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 ${
                  activeRoom === 'REGULER' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {Object.keys(cartByRoom.REGULER).length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                handleSwitchRoom('MITRA');
                setActivePortalTab('katalog');
              }}
              className={`text-left px-3.5 py-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                activeRoom === 'MITRA'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {isVerifiedMitra ? (
                  <Unlock className={`w-4 h-4 shrink-0 ${activeRoom === 'MITRA' ? 'text-emerald-400' : 'text-emerald-600'}`} />
                ) : (
                  <Lock className={`w-4 h-4 shrink-0 ${activeRoom === 'MITRA' ? 'text-amber-300' : 'text-slate-500'}`} />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-extrabold truncate">
                    Ruang Order Mitra (B2B / Faskes)
                  </div>
                  <div className={`text-[11px] truncate ${activeRoom === 'MITRA' ? 'text-slate-300' : 'text-slate-500'}`}>
                    {isVerifiedMitra && verifiedMitraRecord
                      ? `Aktif: ${verifiedMitraRecord.name}`
                      : 'Harga grosir per Box · Khusus mitra terregistrasi'}
                  </div>
                </div>
              </div>
              {Object.keys(cartByRoom.MITRA).length > 0 && (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 ${
                  activeRoom === 'MITRA' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-800'
                }`}>
                  {Object.keys(cartByRoom.MITRA).length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActivePortalTab('katalog')}
              className={`min-h-[36px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                activePortalTab === 'katalog'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>
                Katalog {activeRoom === 'REGULER' ? 'Reguler/Umum' : 'Mitra'} ({catalog.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActivePortalTab('riwayat')}
              className={`min-h-[36px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                activePortalTab === 'riwayat'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Status Pesanan ({visibleOrdersCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-4 space-y-4">
        {activePortalTab === 'katalog' ? (
          <>
            {/* Room-Specific Status / Verification Banner */}
            {activeRoom === 'REGULER' ? (
              <section className="bg-white rounded-2xl border border-emerald-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Ruang Order Reguler / Umum — Langsung Pesan Tanpa Registrasi Akun</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Harga tampil dalam satuan eceran (Tablet / Kaplet / Botol / Pcs). Status resep tiap produk mengikuti pengaturan <strong>Status Resep</strong> pada Master Data Obat: produk <strong className="text-rose-700">Wajib Resep</strong> mensyaratkan unggahan foto/file resep saat checkout, sedangkan <strong className="text-emerald-700">Tanpa Resep</strong> dapat dipesan langsung.
                  </p>
                </div>
                {cartRxEval.requiresRx && (
                  <div className="shrink-0 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                    <div className="font-bold text-amber-900">{cartRxEval.badgeLabel}</div>
                    <div className="text-[11px] text-amber-800">
                      {rxFileUrl
                        ? `Resep terunggah: ${rxFileName}`
                        : `${cartRxEval.flaggedItems.length} item di keranjang wajib unggah resep`}
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-xs">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isVerifiedMitra ? (
                        <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <h2 className="text-xs sm:text-sm font-extrabold text-slate-900">
                        {isVerifiedMitra && verifiedMitraRecord
                          ? `Akun Mitra Aktif: ${verifiedMitraRecord.name}`
                          : 'Login Akun Mitra Terdaftar (Nama Mitra & ID Mitra)'}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          isVerifiedMitra
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {isVerifiedMitra ? 'Akses Order Aktif' : 'Terkunci — Khusus Mitra'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {isVerifiedMitra && verifiedMitraRecord
                        ? `ID Mitra: ${verifiedMitraRecord.id} · ${verifiedMitraRecord.category || 'Mitra Faskes'} · No. Izin: ${verifiedMitraRecord.licenseNo || '-'} · Sesi keranjang & order terisolasi per perangkat.`
                        : 'Ketik manual Nama Mitra dan ID Mitra yang terdaftar untuk mengaktifkan tombol "Pilih Produk". Kolom ini tidak menyimpan riwayat ketik browser maupun menampilkan daftar mitra secara terbuka.'}
                    </p>
                  </div>

                  {isVerifiedMitra ? (
                    <button
                      type="button"
                      onClick={handleResetMitraSession}
                      className="min-h-[38px] px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Keluar Akun Mitra
                    </button>
                  ) : (
                    <form
                      onSubmit={handleMitraLoginSubmit}
                      autoComplete="off"
                      className="flex flex-col gap-2 w-full lg:w-[540px] shrink-0"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="portal-mitra-login-name-input"
                            name={`mtr_org_${mountNonce}`}
                            type="text"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            aria-autocomplete="none"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-form-type="other"
                            readOnly={!mitraInputsUnlocked}
                            onFocus={() => setMitraInputsUnlocked(true)}
                            onMouseDown={() => setMitraInputsUnlocked(true)}
                            onTouchStart={() => setMitraInputsUnlocked(true)}
                            value={loginMitraName}
                            onChange={(e) => {
                              setLoginMitraName(e.target.value);
                              if (mitraLoginError) setMitraLoginError('');
                            }}
                            placeholder="Ketik Nama Mitra..."
                            className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 outline-none"
                          />
                        </div>

                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="portal-mitra-login-id-input"
                            name={`mtr_code_${mountNonce}`}
                            type="text"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            aria-autocomplete="none"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-form-type="other"
                            readOnly={!mitraInputsUnlocked}
                            onFocus={() => setMitraInputsUnlocked(true)}
                            onMouseDown={() => setMitraInputsUnlocked(true)}
                            onTouchStart={() => setMitraInputsUnlocked(true)}
                            value={loginMitraId}
                            onChange={(e) => {
                              setLoginMitraId(e.target.value);
                              if (mitraLoginError) setMitraLoginError('');
                            }}
                            placeholder="Ketik ID Mitra (mis. MTR-XXXX)..."
                            className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs font-mono font-bold uppercase text-slate-900 focus:border-slate-900 outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={isVerifyingMitra}
                            className="min-h-[38px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{isVerifyingMitra ? 'Memverifikasi...' : 'Verifikasi & Masuk Mitra'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenJadiMitraModal(false)}
                            className="min-h-[38px] px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Handshake className="w-3.5 h-3.5" />
                            <span>Daftar Jadi Mitra</span>
                          </button>
                        </div>

                        {demoActive && (
                          <button
                            type="button"
                            onClick={() => {
                              setMitraInputsUnlocked(true);
                              setLoginMitraName('Klinik Pratama Harapan');
                              setLoginMitraId('MTR-DEMO-001');
                              setMitraLoginError('');
                            }}
                            className="text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg cursor-pointer"
                          >
                            Isi Contoh Akun Demo (MTR-DEMO-001)
                          </button>
                        )}
                      </div>

                      {mitraLoginError && (
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold flex items-start gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                          <span>{mitraLoginError}</span>
                        </div>
                      )}
                    </form>
                  )}
                </div>

                {newlyRegisteredCredential && isVerifiedMitra && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="text-emerald-900">
                      <span className="font-bold">Simpan Kredensial Login Mitra Anda:</span>{' '}
                      Nama Mitra: <strong>{newlyRegisteredCredential.name}</strong> · ID Mitra:{' '}
                      <strong className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300">
                        {newlyRegisteredCredential.id}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          navigator.clipboard?.writeText(newlyRegisteredCredential.id);
                        } catch {}
                        setCopiedNewMitraId(true);
                        window.setTimeout(() => setCopiedNewMitraId(false), 2500);
                      }}
                      className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      {copiedNewMitraId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedNewMitraId ? 'ID Mitra Disalin' : 'Salin ID Mitra'}</span>
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Live Promo Banner Showcase */}
            {livePromos.length > 0 && (() => {
              const currentPromo = livePromos[activePromoSlide % livePromos.length] || livePromos[0];
              const theme =
                PROMO_BANNER_THEMES[currentPromo.theme] || PROMO_BANNER_THEMES['emerald-clinical'];

              return (
                <section
                  onMouseEnter={() => setIsBannerHovered(true)}
                  onMouseLeave={() => setIsBannerHovered(false)}
                  aria-label="Banner Promo Portal"
                  className={`relative rounded-3xl border overflow-hidden shadow-md transition-all ${theme.wrapperClass}`}
                >
                  <div className="p-5 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="space-y-3 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${theme.eyebrowClass}`}
                        >
                          <Megaphone className="w-3 h-3" />
                          <span>{currentPromo.badgeText || (activeRoom === 'REGULER' ? 'PROMO REGULER' : 'PROMO MITRA')}</span>
                        </span>
                        {currentPromo.highlightText && (
                          <span className="text-xs sm:text-sm font-black text-amber-300 tracking-wide">
                            {currentPromo.highlightText}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
                          {currentPromo.title}
                        </h2>
                        <p className="text-xs sm:text-sm text-white/90 leading-relaxed max-w-2xl">
                          {currentPromo.subtitle}
                        </p>
                        {currentPromo.description && (
                          <p className="text-[11px] text-white/75 leading-relaxed max-w-2xl">
                            {currentPromo.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleApplyPromoCta(currentPromo)}
                          className={`min-h-[40px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition shadow-xs whitespace-nowrap shrink-0 ${theme.ctaClass}`}
                        >
                          <span>{currentPromo.ctaText || 'Lihat Produk Promo'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {currentPromo.promoCode && (
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                navigator.clipboard?.writeText(currentPromo.promoCode!);
                              } catch {}
                              setPortalVoucherInput(currentPromo.promoCode!);
                              setCopiedPromoCode(currentPromo.promoCode!);
                              setTimeout(() => setCopiedPromoCode(''), 2500);
                            }}
                            className={`min-h-[40px] px-3.5 rounded-xl border font-mono text-xs font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap shrink-0 ${theme.codeBadgeClass}`}
                          >
                            <span>
                              {copiedPromoCode === currentPromo.promoCode
                                ? `Kode ${currentPromo.promoCode} Dipakai!`
                                : `Kode: ${currentPromo.promoCode}`}
                            </span>
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {(currentPromo.startDate || currentPromo.endDate) && (
                          <span className="text-[11px] text-white/70 font-mono tabular-nums">
                            Periode: {currentPromo.startDate || 'Sekarang'} s/d{' '}
                            {currentPromo.endDate || 'Seterusnya'}
                          </span>
                        )}
                      </div>
                    </div>

                    {currentPromo.bannerImageUrl && (
                      <div className="w-full md:w-64 h-36 sm:h-40 rounded-2xl overflow-hidden border border-white/20 shrink-0 bg-black/20 shadow-inner">
                        <img
                          src={currentPromo.bannerImageUrl}
                          alt={currentPromo.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  {livePromos.length > 1 && (
                    <div className="px-5 sm:px-7 py-2.5 bg-black/20 border-t border-white/10 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        {livePromos.map((p, idx) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setActivePromoSlide(idx)}
                            aria-label={`Promo ${idx + 1}: ${p.title}`}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                              idx === activePromoSlide % livePromos.length
                                ? 'w-7 bg-white'
                                : 'w-2 bg-white/40 hover:bg-white/60'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono text-white/75 tabular-nums mr-1">
                          {(activePromoSlide % livePromos.length) + 1} / {livePromos.length}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setActivePromoSlide(
                              (prev) => (prev - 1 + livePromos.length) % livePromos.length
                            )
                          }
                          aria-label="Promo sebelumnya"
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActivePromoSlide((prev) => (prev + 1) % livePromos.length)
                          }
                          aria-label="Promo berikutnya"
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })()}

            {/* Search & Filters */}
            <section id="portal-katalog-filters" className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-6 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama obat, zat aktif &amp; kekuatan, atau kelas terapi..."
                    className="w-full min-h-[44px] pl-10 pr-9 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm font-medium text-slate-800 placeholder:text-slate-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="sm:col-span-4">
                  <select
                    value={selectedKelasTerapi}
                    onChange={(e) => setSelectedKelasTerapi(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 focus:border-emerald-500 outline-none"
                  >
                    {kelasTerapiOptions.map((kl) => (
                      <option key={kl} value={kl}>
                        {kl === 'Semua' ? 'Semua Kelas Terapi' : kl}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 flex items-center">
                  <button
                    type="button"
                    onClick={() => setOnlyAvailableStock((v) => !v)}
                    className={`w-full min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      onlyAvailableStock
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 ${onlyAvailableStock ? 'opacity-100' : 'opacity-30'}`} />
                    <span>Ready Stok</span>
                  </button>
                </div>
              </div>

              {/* Category Filter Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition border ${
                      selectedCategory === cat
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Status Resep Filter Strip */}
              {statusResepOptions.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500 mr-1">Status Resep:</span>
                  {statusResepOptions.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSelectedStatusResep(st)}
                      className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition border ${
                        selectedStatusResep === st
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {st === 'Semua' ? 'Semua Status Resep' : st}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Results Counter & Page Info */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
              <span>
                Menampilkan <strong className="text-slate-800 font-mono tabular-nums">{paginatedCatalog.length}</strong> dari{' '}
                <strong className="text-slate-800 font-mono tabular-nums">{filteredCatalog.length}</strong> produk obat (
                {activeRoom === 'REGULER'
                  ? 'Harga Reguler/Umum per satuan eceran'
                  : 'Harga Khusus Mitra per satuan kemasan besar'}
                )
              </span>
              {totalCatalogPages > 1 && (
                <span className="font-mono text-[11px] font-bold text-slate-600">
                  Halaman {safeCatalogPage} / {totalCatalogPages}
                </span>
              )}
            </div>

            {/* Catalog Cards */}
            {filteredCatalog.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
                <Package className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">Produk Tidak Ditemukan</h3>
                <p className="text-xs text-slate-500">
                  Coba ubah kata kunci pencarian atau reset filter kategori &amp; kelas terapi.
                </p>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {paginatedCatalog.map((med) => {
                  const roomPrice = getRoomUnitPrice(med, activeRoom);
                  const unitLabel = getRoomUnitLabel(med, activeRoom);
                  const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
                  const unitBesar = med.satuanBesar || 'Box';
                  const unitKecil = med.satuanKecil || med.unit || 'Tablet';
                  const availStock = getRoomAvailableStock(med, activeRoom);
                  const totalKecil = Math.max(0, Number(med.stock) || 0);
                  const isOutOfStock = availStock <= 0;
                  const isLowStock =
                    activeRoom === 'REGULER'
                      ? availStock > 0 && availStock <= Math.max(5, Number(med.minStock) || 0)
                      : availStock > 0 && availStock <= 2;
                  const qtyInCart = cart[med.id]?.qtyBox || 0;
                  const rxReq = getMedicinePrescriptionRequirement(med, rxStatusConfigs);
                  const isMitraLocked = activeRoom === 'MITRA' && !isVerifiedMitra;
                  const unitDisc = getBestProductUnitDiscount(
                    med,
                    roomPrice,
                    activePortalDiscounts,
                    activeChannelScope,
                    portalVoucherInput
                  );
                  const matchedMedDisc =
                    unitDisc?.discount ||
                    activePortalDiscounts.find((d) => isMedicineEligibleForDiscount(med, d));

                  return (
                    <article
                      key={med.id}
                      className={`mobile-card-cv bg-white rounded-2xl border p-4 flex flex-col justify-between gap-3 transition ${
                        isOutOfStock
                          ? 'border-slate-200 opacity-75'
                          : qtyInCart > 0
                          ? 'border-emerald-500 ring-1 ring-emerald-500/20 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 shadow-xs'
                      }`}
                    >
                      <div className="space-y-2">
                        {/* Top row: Nama Produk & Kekuatan + Live Stock Indicator */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h2 className="text-sm font-extrabold text-slate-900 leading-snug">
                              {med.name}{' '}
                              {med.kekuatan && med.kekuatan !== '-' && (
                                <span className="text-emerald-700 font-bold">{med.kekuatan}</span>
                              )}
                            </h2>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-semibold text-slate-500">
                              <MedicineCategorySymbol category={med.category} size="xs" />
                              <span className="truncate">{med.kelas || 'Umum'}</span>
                            </div>
                          </div>

                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold border font-mono tabular-nums ${
                              isOutOfStock
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : isLowStock
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {isOutOfStock ? 'Stok Habis' : `Stok ${availStock.toLocaleString('id-ID')} ${unitLabel}`}
                          </span>
                        </div>

                        {/* Single Authoritative Prescription Status Marker (sourced from master_obat.status_resep & Status Resep Settings) */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${rxReq.colorTheme.portalBadgeClass}`}
                          >
                            {rxReq.requiresRx ? (
                              <ShieldAlert className="w-3 h-3 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                            )}
                            <span>{rxReq.badgeLabel}</span>
                          </span>

                          <button
                            type="button"
                            onClick={() => handleInspectProduct(med)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detail</span>
                          </button>
                        </div>

                        {/* Active Room Price & Pack Info */}
                        <div className="pt-2 border-t border-slate-100 flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
                              {activeRoom === 'REGULER'
                                ? `Harga Reguler / ${unitLabel}`
                                : `Harga Khusus Mitra / ${unitBesar}`}
                            </span>
                            {unitDisc ? (
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-tight mt-0.5">
                                <span className="text-xs font-semibold text-slate-400 line-through decoration-slate-400 decoration-[1.5px] font-mono tabular-nums">
                                  {formatRupiah(unitDisc.originalPrice)}
                                </span>
                                <span className="text-lg font-black text-emerald-600 font-mono tabular-nums">
                                  {formatRupiah(unitDisc.discountedPrice)}
                                </span>
                              </div>
                            ) : (
                              <div className="text-lg font-black text-slate-900 font-mono tabular-nums leading-tight">
                                {formatRupiah(roomPrice)}
                              </div>
                            )}
                            {matchedMedDisc && (
                              <span
                                className={`inline-flex flex-wrap items-center gap-1 mt-1 text-[11px] font-bold ${
                                  unitDisc ? 'text-emerald-700' : 'text-sky-700'
                                }`}
                              >
                                <TicketPercent
                                  className={`w-3 h-3 shrink-0 ${unitDisc ? 'text-emerald-600' : 'text-sky-600'}`}
                                />
                                <span>{formatDiscountShortBadge(matchedMedDisc)}</span>
                                {unitDisc?.conditionHint && (
                                  <span className="text-[10px] font-medium text-slate-500">
                                    ({unitDisc.conditionHint})
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                          <div className="text-right text-[11px] text-slate-500 font-mono tabular-nums">
                            {activeRoom === 'REGULER' ? (
                              <>
                                <div>Satuan: {unitKecil}</div>
                                {ratio > 1 && (
                                  <div className="text-[10px] text-slate-400">
                                    (1 {unitBesar} = {ratio} {unitKecil})
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <div>Isi {ratio} {unitKecil}</div>
                                {!isOutOfStock && (
                                  <div className="text-[10px] text-slate-400">
                                    ({totalKecil.toLocaleString('id-ID')} {unitKecil})
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Add to Cart / Quantity Stepper / Mitra Lock */}
                      <div className="pt-1">
                        {isOutOfStock ? (
                          <button
                            type="button"
                            disabled
                            className="w-full min-h-[44px] rounded-xl bg-slate-100 text-slate-400 font-bold text-xs cursor-not-allowed flex items-center justify-center gap-1.5"
                          >
                            <AlertCircle className="w-4 h-4" />
                            <span>Stok Kosong</span>
                          </button>
                        ) : isMitraLocked ? (
                          <button
                            type="button"
                            onClick={() => handleSetCartQty(med, 1)}
                            className="w-full min-h-[44px] rounded-xl bg-slate-100 hover:bg-amber-50 border border-slate-300 hover:border-amber-300 text-slate-600 hover:text-amber-900 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                            title="Khusus Mitra terregistrasi — klik untuk info registrasi/verifikasi"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Pilih Produk (Khusus Mitra)</span>
                          </button>
                        ) : qtyInCart > 0 ? (
                          <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => handleSetCartQty(med, qtyInCart - 1)}
                              aria-label="Kurangi jumlah"
                              className="min-h-[40px] min-w-[44px] rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center cursor-pointer transition"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={availStock}
                                value={qtyInCart}
                                onChange={(e) => handleSetCartQty(med, Number(e.target.value) || 0)}
                                className="w-14 text-center font-mono font-extrabold text-sm text-emerald-900 bg-transparent outline-none tabular-nums"
                              />
                              <span className="text-xs font-bold text-emerald-700">{unitLabel}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSetCartQty(med, qtyInCart + 1)}
                              disabled={qtyInCart >= availStock}
                              aria-label="Tambah jumlah"
                              className="min-h-[40px] min-w-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white flex items-center justify-center cursor-pointer transition"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetCartQty(med, 1)}
                            className="w-full min-h-[44px] rounded-xl bg-slate-900 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.99]"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Pilih Produk ({unitLabel})</span>
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {totalCatalogPages > 1 && (
                <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 mt-3">
                  <button
                    type="button"
                    disabled={safeCatalogPage <= 1}
                    onClick={() => {
                      setCatalogPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Sebelumnya</span>
                  </button>
                  <span className="text-xs font-mono font-bold text-slate-700">
                    Hal {safeCatalogPage} / {totalCatalogPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeCatalogPage >= totalCatalogPages}
                    onClick={() => {
                      setCatalogPage((p) => Math.min(totalCatalogPages, p + 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              </>
            )}
          </>
        ) : (
          /* Riwayat & Pelacakan Status Pesanan Portal (Reguler & Mitra) */
          <section className="space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['ALL', 'REGULER', 'MITRA'] as const).map((rm) => (
                  <button
                    key={rm}
                    type="button"
                    onClick={() => setOrderRoomFilter(rm)}
                    className={`min-h-[36px] px-3 rounded-xl text-xs font-bold border cursor-pointer transition ${
                      orderRoomFilter === rm
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {rm === 'ALL' ? 'Semua Ruang' : rm === 'REGULER' ? 'Ruang Reguler' : 'Ruang Mitra'}
                  </button>
                ))}
              </div>

              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoComplete="off"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  placeholder="Lacak status pesanan dengan Kode Pesanan lengkap (REG-... / MTR-...)..."
                  className="w-full min-h-[42px] pl-10 pr-4 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs sm:text-sm font-medium outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (demoActive) return;
                  fetchMitraOrdersFromSupabase().then((res) => {
                    if (res.data) {
                      setMyOrders((prev) => {
                        const map = new Map<string, MitraOrder>();
                        prev.forEach((o) => map.set(o.id, o));
                        res.data!.forEach((o) => map.set(o.id, o));
                        return Array.from(map.values()).sort(
                          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                        );
                      });
                    }
                  });
                }}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Perbarui Status</span>
              </button>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
                <ClipboardList className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">Belum Ada Pesanan pada Sesi Ini</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Pesanan yang Anda kirim pada sesi ini atau melalui akun Mitra yang sedang login tampil di sini. Untuk melacak pesanan sebelumnya, ketik <strong>Kode Pesanan lengkap</strong> (contoh: <span className="font-mono">REG-...</span> atau <span className="font-mono">MTR-...</span>).
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((ord) => {
                  const ordRoom: PortalOrderRoom =
                    ord.orderRoom || (String(ord.orderCode || '').startsWith('REG-') ? 'REGULER' : 'MITRA');
                  const payStatus: MitraPaymentStatus =
                    ord.paymentStatus || (ord.status === 'Selesai' ? 'Lunas' : 'Menunggu Pembayaran');
                  const needsUpload =
                    ord.status !== 'Dibatalkan' &&
                    (payStatus === 'Menunggu Pembayaran' || payStatus === 'Ditolak');

                  return (
                    <div
                      key={ord.id}
                      className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-extrabold text-sm text-slate-900">
                              {ord.orderCode}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                ordRoom === 'REGULER'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}
                            >
                              {ordRoom === 'REGULER' ? 'Ruang Reguler' : 'Ruang Mitra'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusBadgeStyle(ord.status)}`}
                            >
                              {ord.status}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getPaymentBadgeStyle(payStatus)}`}
                            >
                              Bayar: {payStatus}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-700 mt-1">
                            {ord.mitraName} · <span className="font-normal text-slate-500">{ord.mitraCategory}</span>
                          </p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(ord.createdAt).toLocaleString('id-ID')}</span>
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Total Tagihan ({ord.totalQtyBox} {ordRoom === 'REGULER' ? 'item' : 'kemasan'})
                          </span>
                          <span className="text-base font-black text-emerald-700 font-mono tabular-nums">
                            {formatRupiah(ord.totalAmount)}
                          </span>
                          {ord.convertedTrxId && (
                            <div className="text-[10px] font-mono text-indigo-700 font-bold mt-0.5">
                              Faktur: {ord.convertedTrxId}
                            </div>
                          )}
                        </div>
                      </div>

                      {ord.rxRequired && (
                        <div className="text-[11px] px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-2">
                          <span className="font-bold flex items-center gap-1.5">
                            <FileCheck2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span>{ord.rxRequirementLabel || 'Wajib Resep'}</span>
                          </span>
                          <span className="text-amber-800 truncate">
                            {ord.rxFileName ? `Resep terlampir: ${ord.rxFileName}` : 'File resep terlampir'}
                          </span>
                        </div>
                      )}

                      <div className="border-t border-slate-100 pt-2.5 space-y-1">
                        {ord.items.map((it, idx) => (
                          <div
                            key={`${ord.id}-${it.medicineId}-${idx}`}
                            className="flex items-center justify-between text-xs text-slate-700"
                          >
                            <span className="truncate pr-2">
                              {it.name} {it.kekuatan !== '-' ? it.kekuatan : ''}{' '}
                              <span className="text-slate-400 font-mono">
                                × {it.qtyBox} {it.unitMode === 'KECIL' ? it.satuanKecil : it.satuanBesar}
                              </span>
                            </span>
                            <span className="font-mono font-bold text-slate-900 shrink-0 tabular-nums">
                              {formatRupiah(it.subtotal)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {payStatus === 'Ditolak' && ord.paymentRejectionReason && (
                        <div className="text-xs bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-rose-900 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold">Bukti Pembayaran Ditolak:</strong>{' '}
                            {ord.paymentRejectionReason}
                          </div>
                        </div>
                      )}

                      {ord.adminNotes && (
                        <div className="text-xs bg-sky-50 border border-sky-200 rounded-xl p-2.5 text-sky-900">
                          <strong className="font-bold">Catatan Apotek:</strong> {ord.adminNotes}
                        </div>
                      )}

                      {/* Tombol Aksi Pembayaran / Upload Bukti */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-500">
                          {ord.paymentProofUrl ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>Bukti diunggah: {ord.paymentProofName || 'struk-transfer'}</span>
                            </span>
                          ) : (
                            <span>Metode: {ord.paymentMethod || 'Transfer Bank'}</span>
                          )}
                        </div>

                        {ord.status !== 'Dibatalkan' && (
                          <button
                            type="button"
                            onClick={() => openOrderPaymentScreen(ord)}
                            className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                              needsUpload
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {needsUpload ? (
                              <>
                                <Upload className="w-3.5 h-3.5" />
                                <span>
                                  {payStatus === 'Ditolak'
                                    ? 'Upload Ulang Bukti Bayar'
                                    : 'Info Rekening & Upload Bukti'}
                                </span>
                              </>
                            ) : (
                              <>
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Detail &amp; Bukti Bayar</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Sticky Bottom Summary Bar when cart has items */}
      {totalCartItemsCount > 0 && !isCartOpen && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-slate-900 text-white border-t border-slate-800 px-4 py-3 shadow-2xl">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-300 font-semibold">
                {activeRoom === 'REGULER' ? 'Ruang Reguler' : 'Ruang Mitra'} · {totalCartItemsCount} produk ·{' '}
                <span className="font-mono tabular-nums">
                  {totalCartBoxes} {activeRoom === 'REGULER' ? 'item' : 'Box'}
                </span>
                {activeRoom === 'REGULER' && cartRxEval.requiresRx && (
                  <span className="ml-2 text-amber-300 font-bold">
                    · {rxFileUrl ? 'Resep Terunggah' : cartRxEval.badgeLabel}
                  </span>
                )}
                {portalDiscountAmount > 0 && (
                  <span className="ml-2 text-emerald-300 font-bold">
                    · Diskon -{formatRupiah(portalDiscountAmount)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 leading-tight truncate">
                {portalDiscountAmount > 0 && (
                  <span className="text-xs font-semibold text-slate-400 line-through decoration-slate-400 font-mono tabular-nums">
                    {formatRupiah(totalCartAmount)}
                  </span>
                )}
                <span className="text-base sm:text-lg font-black text-emerald-400 font-mono tabular-nums">
                  {formatRupiah(netCartAmount)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenCartDrawer}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition shrink-0"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Checkout Pesanan</span>
            </button>
          </div>
        </div>
      )}

      {/* Mitra Lock Notification Modal (triggered if unregistered user clicks Pilih Produk in Ruang Mitra) */}
      {mitraLockAlert && (
        <div className="fixed inset-0 z-[65] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 bg-amber-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Pilih Produk Terkunci di Ruang Mitra
                  </h3>
                  <p className="text-[11px] text-amber-900">Khusus mitra fasilitas kesehatan terregistrasi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMitraLockAlert(null)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700 leading-relaxed">
              <p>
                Produk <strong className="text-slate-900">{mitraLockAlert.medicineName}</strong> dengan harga
                grosir Mitra hanya dapat dipesan oleh Mitra yang sudah terregistrasi dan terverifikasi di sistem
                Latisha Farma.
              </p>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-[11px] text-slate-600">
                <div className="font-bold text-slate-800">Langkah aktivasi Ruang Order Mitra:</div>
                <div>1. Jika sudah terdaftar, login menggunakan kombinasi <strong>Nama Mitra</strong> dan <strong>ID Mitra</strong> pada panel verifikasi di atas.</div>
                <div>2. Jika belum terdaftar, lengkapi formulir &ldquo;Jadi Mitra&rdquo; beserta unggahan izin fasilitas (PDF/JPG) untuk memperoleh ID Mitra.</div>
                <div>3. Untuk pembelian perorangan tanpa registrasi akun, silakan gunakan Ruang Order Reguler/Umum.</div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMitraLockAlert(null);
                    handleOpenJadiMitraModal(false);
                  }}
                  className="w-full min-h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Handshake className="w-4 h-4" />
                  <span>Daftar Jadi Mitra Sekarang</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMitraLockAlert(null);
                    const el = document.getElementById('portal-mitra-login-name-input');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    window.setTimeout(() => el?.focus(), 200);
                  }}
                  className="w-full min-h-[42px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Saya Sudah Terdaftar · Login Mitra</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMitraLockAlert(null);
                    handleSwitchRoom('REGULER');
                  }}
                  className="w-full min-h-[40px] rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>Pindah ke Ruang Reguler / Umum (Tanpa Daftar)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Inspection Modal */}
      {inspectProduct && (() => {
        const med = inspectProduct;
        const rxReq = getMedicinePrescriptionRequirement(med, rxStatusConfigs);
        const roomPrice = getRoomUnitPrice(med, activeRoom);
        const unitLabel = getRoomUnitLabel(med, activeRoom);
        const availStock = getRoomAvailableStock(med, activeRoom);
        const qtyInCart = cart[med.id]?.qtyBox || 0;
        const isMitraLocked = activeRoom === 'MITRA' && !isVerifiedMitra;
        const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
        const inspectUnitDisc = getBestProductUnitDiscount(
          med,
          roomPrice,
          activePortalDiscounts,
          activeChannelScope,
          portalVoucherInput
        );

        return (
          <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <h3 className="text-sm font-extrabold text-slate-900 truncate">
                    {med.name} {med.kekuatan && med.kekuatan !== '-' ? med.kekuatan : ''}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                    <MedicineCategorySymbol category={med.category} size="xs" />
                    <span>{med.kelas || 'Umum'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectProduct(null)}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-600 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2.5 bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {activeRoom === 'REGULER' ? `Harga Reguler / ${unitLabel}` : `Harga Mitra / ${unitLabel}`}
                    </span>
                    {inspectUnitDisc ? (
                      <>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5">
                          <span className="text-xs font-semibold text-slate-400 line-through decoration-slate-400 decoration-[1.5px] font-mono tabular-nums">
                            {formatRupiah(inspectUnitDisc.originalPrice)}
                          </span>
                          <span className="text-lg font-black text-emerald-600 font-mono tabular-nums">
                            {formatRupiah(inspectUnitDisc.discountedPrice)}
                          </span>
                        </div>
                        <span className="inline-flex flex-wrap items-center gap-1 mt-0.5 text-[11px] font-bold text-emerald-700">
                          <TicketPercent className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{formatDiscountShortBadge(inspectUnitDisc.discount)}</span>
                          {inspectUnitDisc.conditionHint && (
                            <span className="text-[10px] font-medium text-slate-500">
                              ({inspectUnitDisc.conditionHint})
                            </span>
                          )}
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-black text-slate-900 font-mono tabular-nums">
                        {formatRupiah(roomPrice)}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Stok Tersedia
                    </span>
                    <span className="text-sm font-extrabold text-emerald-700 font-mono tabular-nums">
                      {availStock.toLocaleString('id-ID')} {unitLabel}
                    </span>
                    {ratio > 1 && (
                      <div className="text-[10px] text-slate-500 font-mono">
                        1 {med.satuanBesar || 'Box'} = {ratio} {med.satuanKecil || 'Tab'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Golongan / NAPPZA</span>
                    <span className="font-bold text-slate-900">{med.nappza || 'Non-NAPPZA'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Kategori Regulasi</span>
                    <MedicineCategorySymbol category={med.category} size="sm" />
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Status Penanda Resep</span>
                    <span className={`font-bold ${rxReq.colorTheme.textClass}`}>
                      {rxReq.badgeLabel}
                    </span>
                  </div>
                </div>

                {rxReq.requiresRx && (
                  <div
                    className={`p-3 rounded-xl border text-[11px] leading-relaxed ${rxReq.colorTheme.alertBoxClass}`}
                  >
                    <strong>Aturan Penyerahan:</strong> {rxReq.reason}
                  </div>
                )}

                <button
                  type="button"
                  disabled={availStock <= 0}
                  onClick={() => {
                    if (isMitraLocked) {
                      setInspectProduct(null);
                      handleSetCartQty(med, 1);
                      return;
                    }
                    handleSetCartQty(med, Math.max(1, qtyInCart + 1));
                    setInspectProduct(null);
                  }}
                  className={`w-full min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition ${
                    availStock <= 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : isMitraLocked
                      ? 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-amber-50'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {isMitraLocked ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>
                    {availStock <= 0
                      ? 'Stok Kosong'
                      : isMitraLocked
                      ? 'Pilih Produk (Verifikasi Mitra Terlebih Dahulu)'
                      : `Pilih Produk (+1 ${unitLabel})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cart & Self-Checkout Modal / Bottom Sheet */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:max-w-xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    {activeRoom === 'REGULER'
                      ? 'Keranjang & Checkout Reguler / Umum'
                      : 'Keranjang & Checkout Mitra'}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {totalCartItemsCount} produk · Total {totalCartBoxes}{' '}
                    {activeRoom === 'REGULER' ? 'item eceran' : 'Box'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Item List */}
              {cartItems.length === 0 ? (
                <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 rounded-2xl">
                  <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-500">
                    Keranjang {activeRoom === 'REGULER' ? 'Ruang Reguler' : 'Ruang Mitra'} masih kosong.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Rincian Item Pesanan
                  </h3>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {cartItems.map((entry) => {
                      const med = entry.medicine;
                      const unitLabel = getRoomUnitLabel(med, activeRoom);
                      const unitPrice = getRoomUnitPrice(med, activeRoom);
                      const availStock = getRoomAvailableStock(med, activeRoom);
                      const rxReq = getMedicinePrescriptionRequirement(med, rxStatusConfigs);
                      const cartItemDisc = getBestProductUnitDiscount(
                        med,
                        unitPrice,
                        activePortalDiscounts,
                        activeChannelScope,
                        portalVoucherInput
                      );

                      return (
                        <div key={med.id} className="p-3 bg-white flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-xs font-extrabold text-slate-900 truncate">
                              {med.name} {med.kekuatan && med.kekuatan !== '-' ? med.kekuatan : ''}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono tabular-nums flex flex-wrap items-baseline gap-x-1.5">
                              {cartItemDisc ? (
                                <>
                                  <span className="line-through text-slate-400">
                                    {formatRupiah(cartItemDisc.originalPrice)}
                                  </span>
                                  <span className="font-bold text-emerald-600">
                                    {formatRupiah(cartItemDisc.discountedPrice)}
                                  </span>
                                </>
                              ) : (
                                <span>{formatRupiah(unitPrice)}</span>
                              )}
                              <span>
                                / {unitLabel} · Stok: {availStock.toLocaleString('id-ID')}
                              </span>
                            </p>
                            {rxReq.requiresRx && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${rxReq.colorTheme.portalBadgeClass}`}
                              >
                                <ShieldAlert className="w-2.5 h-2.5" />
                                <span>{rxReq.badgeLabel}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSetCartQty(med, entry.qtyBox - 1)}
                              className="w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center font-mono font-bold text-xs tabular-nums">
                              {entry.qtyBox}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSetCartQty(med, entry.qtyBox + 1)}
                              disabled={entry.qtyBox >= availStock}
                              className="w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center text-slate-700 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetCartQty(med, 0)}
                              className="w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center cursor-pointer ml-1"
                              title="Hapus item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Room-Specific Checkout Form */}
              {activeRoom === 'REGULER' ? (
                <div className="space-y-4 pt-2 border-t border-slate-200">
                  {/* Mandatory Prescription Upload Section for Reguler/Umum */}
                  {cartRxEval.requiresRx && (
                    <div
                      className={`rounded-2xl border p-4 space-y-3 ${
                        cartRxEval.highestLevel === 'WAJIB_RESEP_ASLI'
                          ? 'bg-rose-50/70 border-rose-200'
                          : 'bg-amber-50/70 border-amber-200'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <ShieldAlert
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            cartRxEval.highestLevel === 'WAJIB_RESEP_ASLI' ? 'text-rose-600' : 'text-amber-700'
                          }`}
                        />
                        <div className="space-y-1">
                          <div className="text-xs font-extrabold text-slate-900">
                            Unggah Resep Wajib · {cartRxEval.badgeLabel}
                          </div>
                          <p className="text-[11px] text-slate-700 leading-relaxed">
                            {cartRxEval.requiresOriginalRx
                              ? `Pesanan mengandung obat dengan status "${cartRxEval.badgeLabel}": wajib mengunggah foto/file resep dan menyerahkan resep asli fisik saat pengambilan/pengiriman.`
                              : `Pesanan mengandung obat dengan status "${cartRxEval.badgeLabel}": wajib melampirkan foto/file resep sebelum checkout.`}
                          </p>
                          <div className="text-[11px] font-semibold text-slate-800">
                            Obat terdeteksi: {cartRxEval.flaggedItems.map((f) => f.medicine.name).join(', ')}
                          </div>
                        </div>
                      </div>

                      {!rxFileUrl ? (
                        <label className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-white cursor-pointer transition text-center">
                          <Upload className="w-5 h-5 text-emerald-600" />
                          <span className="text-xs font-bold text-slate-800">
                            {isProcessingRxFile
                              ? 'Memproses foto / file resep...'
                              : 'Ketuk untuk Unggah Foto Resep (JPG/PNG/WEBP) atau PDF *'}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Wajib dilampirkan sebelum mengirim pesanan
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={handleSelectRxFile}
                            disabled={isProcessingRxFile}
                            className="hidden"
                          />
                        </label>
                      ) : (
                        <div className="rounded-xl border border-emerald-200 bg-white p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-emerald-800 flex items-center gap-1.5 truncate">
                              <FileCheck2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span className="truncate">{rxFileName || 'resep-terlampir'}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setRxFileUrl('');
                                setRxFileName('');
                                setRxUploadedAt('');
                              }}
                              className="text-rose-600 font-bold text-[11px] hover:underline cursor-pointer shrink-0"
                            >
                              Ganti / Hapus
                            </button>
                          </div>
                          {!rxFileUrl.startsWith('data:application/pdf') && (
                            <img
                              src={rxFileUrl}
                              alt="Pratinjau Resep Dokter"
                              className="w-full max-h-40 object-contain rounded-lg border border-slate-200 bg-slate-50"
                            />
                          )}
                        </div>
                      )}

                      {rxFileError && (
                        <div className="text-[11px] font-bold text-rose-700">{rxFileError}</div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      Identitas Pemesan (Tanpa Registrasi Akun)
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Nama Lengkap Pemesan / Pasien *
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            type="text"
                            required
                            value={regulerName}
                            onChange={(e) => setRegulerName(e.target.value)}
                            placeholder="Contoh: Ibu Siti Aminah"
                            className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-500 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          No. WhatsApp / Telepon *
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            type="tel"
                            required
                            value={regulerPhone}
                            onChange={(e) => setRegulerPhone(e.target.value)}
                            placeholder="0812xxxxxxxx"
                            className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:border-emerald-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Alamat Pengiriman / Keterangan Ambil di Apotek
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={regulerAddress}
                          onChange={(e) => setRegulerAddress(e.target.value)}
                          placeholder="Alamat kirim atau tulis: Ambil langsung di apotek"
                          className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Catatan Pesanan (Opsional)
                      </label>
                      <div className="relative">
                        <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <textarea
                          rows={2}
                          value={orderNotes}
                          onChange={(e) => setOrderNotes(e.target.value)}
                          placeholder="Contoh: Mohon diantar sore atau info aturan pakai obat..."
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-500 outline-none resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Form Identitas Mitra */
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Identitas Instansi Mitra Terverifikasi
                  </h3>

                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                    {verifiedMitraRecord ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-emerald-700 shrink-0" />
                            <span>{verifiedMitraRecord.name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-white border border-emerald-300 font-mono text-[11px] font-bold text-emerald-800">
                            ID: {verifiedMitraRecord.id}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Terverifikasi · No. Izin: {verifiedMitraRecord.licenseNo || '-'}</span>
                          </span>
                          {verifiedMitraRecord.licenseFileUrl && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-bold">
                              <FileCheck2 className="w-3 h-3" />
                              <span>File Izin Terlampir</span>
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs font-semibold text-rose-700">
                        Sesi Mitra belum terverifikasi. Silakan login menggunakan Nama Mitra &amp; ID Mitra terlebih dahulu.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Kategori Mitra
                      </label>
                      <select
                        value={mitraCategory}
                        onChange={(e) => setMitraCategory(e.target.value)}
                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500"
                      >
                        <option value="Klinik Pratama">Klinik Pratama</option>
                        <option value="Klinik Utama">Klinik Utama</option>
                        <option value="Apotek Mitra">Apotek Mitra</option>
                        <option value="Praktik Dokter Mandiri">Praktik Dokter Mandiri</option>
                        <option value="Rumah Sakit">Rumah Sakit</option>
                        <option value="Apotek Jejaring">Apotek Jejaring</option>
                        <option value="Dokter Praktek Mandiri">Dokter Praktek Mandiri</option>
                        <option value="Bidan / Nakes">Bidan / Nakes</option>
                        <option value="RS / Puskesmas">RS / Puskesmas</option>
                        <option value="Lainnya">Lainnya</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        No. WhatsApp / Telepon *
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="tel"
                          required
                          value={mitraPhone}
                          onChange={(e) => setMitraPhone(e.target.value)}
                          placeholder="0812xxxxxxxx"
                          className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nama PIC / Pemesan
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={picName}
                          onChange={(e) => setPicName(e.target.value)}
                          placeholder="Nama apoteker / admin"
                          className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Alamat Pengiriman
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={mitraAddress}
                          onChange={(e) => setMitraAddress(e.target.value)}
                          placeholder="Alamat lengkap pengiriman"
                          className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Catatan Pesanan (Opsional)
                    </label>
                    <div className="relative">
                      <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <textarea
                        rows={2}
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Contoh: Kirim hari ini sebelum jam 15.00, sertakan faktur PBF/Mitra..."
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Kode Promo / Voucher + Footer Summary inside Form */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                {activePortalDiscounts.length > 0 && (
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <TicketPercent className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          Kode Promo / Diskon {activeRoom === 'REGULER' ? 'Reguler' : 'Mitra'} (Opsional)
                        </span>
                      </label>
                      {portalVoucherInput && (
                        <button
                          type="button"
                          onClick={() => setPortalVoucherInput('')}
                          className="text-[11px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer"
                        >
                          Hapus Kode
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={portalVoucherInput}
                      onChange={(e) => setPortalVoucherInput(e.target.value.toUpperCase())}
                      placeholder="Masukkan kode promo jika ada..."
                      className="w-full min-h-[38px] px-3 rounded-xl border border-slate-300 bg-white font-mono text-xs font-bold uppercase text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Subtotal Pesanan</span>
                    <span className="font-mono font-bold tabular-nums">{formatRupiah(totalCartAmount)}</span>
                  </div>
                  {appliedPortalDiscount && portalDiscountAmount > 0 && (
                    <div className="flex items-center justify-between text-emerald-700 font-bold">
                      <span>Potongan: {appliedPortalDiscount.discount.name}</span>
                      <span className="font-mono tabular-nums">-{formatRupiah(portalDiscountAmount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Estimasi Total Tagihan ({activeRoom === 'REGULER' ? 'Reguler/Umum' : 'Mitra'})
                    </span>
                    <div className="flex flex-wrap items-baseline justify-end gap-x-2">
                      {portalDiscountAmount > 0 && (
                        <span className="text-xs font-semibold text-slate-400 line-through decoration-slate-400 font-mono tabular-nums">
                          {formatRupiah(totalCartAmount)}
                        </span>
                      )}
                      <span className="text-xl font-black text-emerald-600 font-mono tabular-nums">
                        {formatRupiah(netCartAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    cartItems.length === 0 ||
                    (activeRoom === 'REGULER' && cartRxEval.requiresRx && !rxFileUrl) ||
                    (activeRoom === 'MITRA' && !isVerifiedMitra)
                  }
                  className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Mengirim Pesanan...'
                      : activeRoom === 'REGULER' && cartRxEval.requiresRx && !rxFileUrl
                      ? 'Unggah File Resep Terlebih Dahulu'
                      : 'Konfirmasi & Kirim Pesanan'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Halaman Sukses Pesanan, Informasi Rekening Resmi & Upload Bukti Pembayaran */}
      {confirmedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-xl w-full max-h-[94vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Ringkasan Pesanan & Pembayaran (Transfer / QRIS)
                  </h2>
                  <p className="text-[11px] text-slate-500 font-mono font-bold">
                    {confirmedOrder.orderCode} · {confirmedOrder.mitraName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmedOrder(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Total Tagihan Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-300 font-semibold">Total Tagihan Pembayaran</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getPaymentBadgeStyle(
                      confirmedOrder.paymentStatus || 'Menunggu Pembayaran'
                    )}`}
                  >
                    {confirmedOrder.paymentStatus || 'Menunggu Pembayaran'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xl font-black text-emerald-400 font-mono tabular-nums">
                    {formatRupiah(confirmedOrder.totalAmount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(String(Math.round(confirmedOrder.totalAmount)));
                        setCopiedNominal(true);
                        setTimeout(() => setCopiedNominal(false), 2000);
                      } catch {}
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedNominal ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedNominal ? 'Tersalin' : 'Salin Nominal'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Lakukan pembayaran tepat sesuai nominal di atas melalui <strong>Transfer Bank</strong> atau scan <strong>QRIS Resmi Apotek Latisha Farma</strong> di bawah ini, lalu unggah bukti pembayarannya agar pesanan dapat diverifikasi Admin.
                </p>
              </div>

              {/* Nomor Rekening Resmi & QRIS Apotek */}
              <div className="space-y-3">
                <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Rekening Transfer Resmi Apotek Latisha Farma</span>
                </h3>
                <div className="space-y-2">
                  {activePortalBanks.map((bank) => {
                    const bankTargetValue = `${bank.bankName} - ${bank.accountNumber} a/n ${bank.accountHolder}`;
                    const isSelectedBank = selectedBankTarget === bankTargetValue;
                    return (
                      <div
                        key={bank.id}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition ${
                          isSelectedBank
                            ? 'border-emerald-500 bg-emerald-50/50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider">
                              {bank.bankName}
                            </span>
                            <span className="font-mono font-black text-sm text-slate-900 tabular-nums">
                              {bank.accountNumber}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 font-semibold mt-1">
                            a/n {bank.accountHolder}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBankTarget(bankTargetValue);
                            try {
                              navigator.clipboard.writeText(bank.accountNumber.replace(/[^0-9]/g, '') || bank.accountNumber);
                              setCopiedBankId(bank.id);
                              setTimeout(() => setCopiedBankId(null), 2000);
                            } catch {}
                          }}
                          className="min-h-[38px] px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-[11px] flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          {copiedBankId === bank.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedBankId === bank.id ? 'Tersalin' : 'Salin'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* QRIS GoPay Merchant Card (Pengganti BCA) */}
                <div
                  className={`rounded-2xl border p-4 space-y-3 transition ${
                    selectedBankTarget === QRIS_PAYMENT_TARGET_LABEL
                      ? 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-300'
                      : 'border-sky-200 bg-sky-50/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white font-black text-[10px] uppercase tracking-wider flex items-center gap-1">
                        <QrCode className="w-3 h-3" />
                        <span>QRIS</span>
                      </span>
                      <div>
                        <div className="font-extrabold text-slate-900 text-xs">
                          APOTEK LATISHA FARMA, PERLENGKAPAN OBAT
                        </div>
                        <div className="text-[10px] font-mono text-slate-600">
                          NMID: ID1026634857274 · GoPay / BCA / Mandiri / BNI / BRI / E-Wallet
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedBankTarget(QRIS_PAYMENT_TARGET_LABEL)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer border transition ${
                        selectedBankTarget === QRIS_PAYMENT_TARGET_LABEL
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white text-sky-700 border-sky-300 hover:bg-sky-50'
                      }`}
                    >
                      {selectedBankTarget === QRIS_PAYMENT_TARGET_LABEL ? 'Dipilih: QRIS' : 'Pilih Bayar QRIS'}
                    </button>
                  </div>

                  {!qrisLoadError ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setZoomQrisModal(true)}
                        className="group relative rounded-xl overflow-hidden border border-slate-100 cursor-pointer focus:outline-none"
                        title="Ketuk untuk memperbesar QRIS"
                      >
                        <img
                          src={qrisImgSrc}
                          alt="QRIS Apotek Latisha Farma"
                          onLoad={() => setQrisLoadError(false)}
                          onError={() => {
                            if (qrisImgSrc === QRIS_PRIMARY_PATH) {
                              setQrisImgSrc(QRIS_FALLBACK_PATH);
                            } else {
                              setQrisLoadError(true);
                            }
                          }}
                          className="w-full max-w-[260px] h-auto object-contain mx-auto rounded-lg"
                        />
                      </button>
                      <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                        <button
                          type="button"
                          onClick={() => setZoomQrisModal(true)}
                          className="min-h-[36px] px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>Perbesar QRIS</span>
                        </button>
                        <a
                          href={qrisImgSrc}
                          download="QRIS-Apotek-Latisha-Farma.jpeg"
                          className="min-h-[36px] px-3 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold text-[11px] flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Simpan / Unduh QRIS</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-white border border-amber-200 text-center space-y-2">
                      <p className="text-[11px] text-amber-800 font-semibold">
                        Gambar QRIS sedang dimuat ulang. Anda dapat mencoba memuat ulang atau gunakan transfer ke SEABANK / BRI di atas.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setQrisLoadError(false);
                          setQrisImgSrc(QRIS_PRIMARY_PATH);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Muat Ulang QRIS
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Verifikasi / Penolakan */}
              {confirmedOrder.paymentStatus === 'Lunas' && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-extrabold">Pembayaran Valid & Lunas</div>
                    <p className="text-[11px] text-emerald-800">
                      Bukti pembayaran telah diverifikasi oleh apotek{confirmedOrder.paymentVerifiedBy ? ` (${confirmedOrder.paymentVerifiedBy})` : ''}. Pesanan siap diproses & dikirim.
                    </p>
                  </div>
                </div>
              )}

              {confirmedOrder.paymentStatus === 'Ditolak' && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-extrabold">Bukti Pembayaran Ditolak Admin</div>
                    <p className="text-[11px] text-rose-800">
                      Alasan: {confirmedOrder.paymentRejectionReason || 'Bukti pembayaran tidak terbaca / nominal belum sesuai. Silakan unggah ulang bukti pembayaran yang valid.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Form Upload Bukti Pembayaran */}
              {confirmedOrder.paymentStatus !== 'Lunas' && (
                <form onSubmit={handleUploadPaymentProof} className="space-y-3 pt-2 border-t border-slate-200">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      {confirmedOrder.paymentStatus === 'Menunggu Verifikasi'
                        ? 'Perbarui Bukti Pembayaran (Menunggu Verifikasi Admin)'
                        : 'Upload Bukti Pembayaran (JPG / PNG / PDF)'}
                    </span>
                  </h3>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Tujuan Pembayaran (Bank / QRIS)
                    </label>
                    <select
                      value={selectedBankTarget}
                      onChange={(e) => setSelectedBankTarget(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 outline-none focus:border-emerald-500"
                    >
                      {activePortalBanks.map((bank) => {
                        const label = `${bank.bankName} - ${bank.accountNumber} a/n ${bank.accountHolder}`;
                        return (
                          <option key={bank.id} value={label}>
                            {label}
                          </option>
                        );
                      })}
                      <option value={QRIS_PAYMENT_TARGET_LABEL}>
                        QRIS - Apotek Latisha Farma (GoPay / Semua Bank &amp; E-Wallet)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Foto Struk / Screenshot Transfer atau QRIS *
                    </label>
                    <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/40 cursor-pointer transition text-center">
                      <ImageIcon className="w-6 h-6 text-emerald-600" />
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-800 block">
                          {proofFileName ? `File terpilih: ${proofFileName}` : 'Ketuk untuk pilih foto struk (JPG/PNG) atau PDF'}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Bisa langsung ambil foto dari kamera smartphone atau galeri
                        </span>
                      </div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleSelectProofFile}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {proofPreviewUrl && (
                    <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>Pratinjau Bukti Pembayaran</span>
                        <button
                          type="button"
                          onClick={() => {
                            setProofPreviewUrl('');
                            setProofFileName('');
                          }}
                          className="text-rose-600 hover:underline cursor-pointer"
                        >
                          Ganti File
                        </button>
                      </div>
                      {proofPreviewUrl.startsWith('data:application/pdf') ? (
                        <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center gap-2 text-slate-700 font-semibold">
                          <FileText className="w-5 h-5 text-rose-600 shrink-0" />
                          <span className="truncate">{proofFileName || 'bukti-pembayaran.pdf'}</span>
                        </div>
                      ) : (
                        <img
                          src={proofPreviewUrl}
                          alt="Pratinjau Bukti Transfer"
                          className="w-full max-h-56 object-contain rounded-xl border border-slate-200 bg-white"
                        />
                      )}
                    </div>
                  )}

                  {proofError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{proofError}</span>
                    </div>
                  )}

                  {proofSuccessMessage && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{proofSuccessMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isUploadingProof || !proofPreviewUrl}
                    className="w-full min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {isUploadingProof
                        ? 'Mengunggah Bukti...'
                        : confirmedOrder.paymentProofUrl
                        ? 'Kirim / Perbarui Bukti Pembayaran'
                        : 'Kirim Bukti Pembayaran'}
                    </span>
                  </button>
                </form>
              )}

              {/* Pratinjau saat Lunas */}
              {confirmedOrder.paymentStatus === 'Lunas' && confirmedOrder.paymentProofUrl && (
                <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    Bukti Transfer Terverifikasi
                  </span>
                  {confirmedOrder.paymentProofUrl.startsWith('data:application/pdf') ? (
                    <a
                      href={confirmedOrder.paymentProofUrl}
                      download={confirmedOrder.paymentProofName || 'bukti-transfer.pdf'}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-indigo-700 font-bold"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Unduh PDF Bukti Transfer</span>
                    </a>
                  ) : (
                    <img
                      src={confirmedOrder.paymentProofUrl}
                      alt="Bukti Transfer Terverifikasi"
                      className="w-full max-h-56 object-contain rounded-xl border border-slate-200 bg-white"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 grid grid-cols-2 gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null);
                  setActivePortalTab('riwayat');
                }}
                className="min-h-[42px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs cursor-pointer"
              >
                Lihat Status Pesanan
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null);
                  setActivePortalTab('katalog');
                }}
                className="min-h-[42px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                Kembali ke Katalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen QRIS Zoom Modal */}
      {zoomQrisModal && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setZoomQrisModal(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  QRIS Resmi Apotek Latisha Farma
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  NMID: ID1026634857274
                </p>
              </div>
              <button
                type="button"
                onClick={() => setZoomQrisModal(false)}
                className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={qrisImgSrc}
              alt="QRIS Apotek Latisha Farma"
              className="w-full h-auto rounded-2xl border border-slate-200 object-contain"
            />
            <div className="flex items-center justify-between gap-2">
              <a
                href={qrisImgSrc}
                download="QRIS-Apotek-Latisha-Farma.jpeg"
                className="flex-1 min-h-[42px] rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Simpan / Unduh QRIS</span>
              </a>
              <button
                type="button"
                onClick={() => setZoomQrisModal(false)}
                className="px-4 min-h-[42px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORM TAMBAH MITRA (Sama dengan Form Tambah Mitra di Aplikasi Utama) */}
      {showJadiMitraModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Handshake className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">
                  Form Mitra (Fasilitas Kesehatan Baru)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowJadiMitraModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitJadiMitra} autoComplete="off" className="p-6 space-y-4 text-xs overflow-y-auto">
              {jadiMitraError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{jadiMitraError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Faskes *
                </label>
                <input
                  type="text"
                  name={`jadi_mitra_org_${mountNonce}`}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  required
                  placeholder="Contoh: Klinik Pratama Sehat Bersama / Apotek Mandiri"
                  value={mitraFormData.name}
                  onChange={(e) => setMitraFormData({ ...mitraFormData, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    No. Tlp *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0812-xxxx-xxxx"
                    value={mitraFormData.phone}
                    onChange={(e) => setMitraFormData({ ...mitraFormData, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    No. Izin *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="503/014/KLINIK/2023"
                    value={mitraFormData.licenseNo}
                    onChange={(e) =>
                      setMitraFormData({ ...mitraFormData, licenseNo: e.target.value })
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Upload Wajib File Izin Fasilitas (PDF / JPG) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  File Izin Fasilitas (Format PDF / JPG) *
                </label>
                {!mitraFormData.licenseFileUrl ? (
                  <label className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/40 cursor-pointer transition text-center">
                    <Upload className="w-5 h-5 text-emerald-600" />
                    <span className="font-bold text-slate-700">
                      {isProcessingMitraLicense
                        ? 'Memproses dokumen izin...'
                        : 'Klik untuk unggah file izin fasilitas (PDF / JPG)'}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Wajib diisi · Format PDF (maks. 2,5 MB) atau JPG/JPEG
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
                      onChange={handleSelectMitraLicenseFile}
                      disabled={isProcessingMitraLicense}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isPdfLicenseFile(
                          mitraFormData.licenseFileUrl,
                          mitraFormData.licenseFileType,
                          mitraFormData.licenseFileName
                        ) ? (
                          <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                        <span
                          className="font-bold text-slate-800 truncate"
                          title={mitraFormData.licenseFileName}
                        >
                          {mitraFormData.licenseFileName || 'Dokumen Izin Fasilitas'}
                        </span>
                      </div>
                      <label className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer shrink-0 transition">
                        {isProcessingMitraLicense ? 'Memproses...' : 'Ganti File'}
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
                          onChange={handleSelectMitraLicenseFile}
                          disabled={isProcessingMitraLicense}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {!isPdfLicenseFile(
                      mitraFormData.licenseFileUrl,
                      mitraFormData.licenseFileType,
                      mitraFormData.licenseFileName
                    ) && (
                      <img
                        src={mitraFormData.licenseFileUrl}
                        alt="Pratinjau File Izin Fasilitas"
                        className="w-full max-h-40 object-contain rounded-lg border border-slate-200 bg-white"
                      />
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Alamat *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Jl. Poros Simpang Pematang No. 12, Kab. Mesuji, Lampung"
                  value={mitraFormData.address}
                  onChange={(e) =>
                    setMitraFormData({ ...mitraFormData, address: e.target.value })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Kategori Faskes
                  </label>
                  <select
                    value={mitraFormData.category}
                    onChange={(e) =>
                      setMitraFormData({
                        ...mitraFormData,
                        category: e.target.value as Mitra['category']
                      })
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Klinik Pratama">Klinik Pratama</option>
                    <option value="Klinik Utama">Klinik Utama</option>
                    <option value="Apotek Mitra">Apotek Mitra</option>
                    <option value="Praktik Dokter Mandiri">Praktik Dokter Mandiri</option>
                    <option value="Rumah Sakit">Rumah Sakit</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Penanggung Jawab / PIC
                  </label>
                  <input
                    type="text"
                    placeholder="dr. Hendra Pratama"
                    value={mitraFormData.picName}
                    onChange={(e) =>
                      setMitraFormData({ ...mitraFormData, picName: e.target.value })
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowJadiMitraModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingMitra || isProcessingMitraLicense}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isSavingMitra ? 'Menyimpan...' : 'Simpan Mitra'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
