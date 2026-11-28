import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import {
  X,
  Plus,
  Search,
  Trash2,
  Building2,
  User,
  ClipboardPlus,
  Check,
  AlertTriangle,
  CheckCircle2,
  Package,
  Save,
  RefreshCw
} from 'lucide-react';
import {
  Medicine,
  Mitra,
  MitraOrder,
  MitraOrderItem,
  MitraOrderStatus,
  MitraPaymentStatus,
  Patient,
  PortalOrderRoom
} from '../types';
import {
  getAvailableBoxStock,
  getMedicineHppBox,
  getMitraBoxPrice
} from '../utils/batchHelper';

interface ManualCustomerPOModalProps {
  isOpen: boolean;
  editingOrder: MitraOrder | null;
  medicines: Medicine[];
  mitraList: Mitra[];
  patients: Patient[];
  currentBranchId?: string;
  userName?: string;
  onClose: () => void;
  onSaveOrder: (
    order: MitraOrder,
    isEdit: boolean
  ) => Promise<{ success: boolean; syncedToCloud?: boolean; needsMigration?: boolean; error?: string }>;
}

const formatRupiah = (num: number): string => {
  return `Rp ${Math.round(num || 0).toLocaleString('id-ID')}`;
};

const getDefaultOrderCode = (room: PortalOrderRoom, dateStr?: string) => {
  const cleanDate = (dateStr || new Date().toISOString().split('T')[0]).replace(/-/g, '').slice(2);
  const rand = Math.floor(100 + Math.random() * 900);
  return room === 'REGULER' ? `PO-REG-${cleanDate}-${rand}` : `PO-MTR-${cleanDate}-${rand}`;
};

const getRoomDefaultUnitPrice = (med: Medicine, unitMode: 'KECIL' | 'BESAR'): number => {
  const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
  if (unitMode === 'KECIL') {
    const regUnit = Math.round(Number(med.sellPrice) || 0);
    if (regUnit > 0) return regUnit;
    return Math.round(getMitraBoxPrice(med) / ratio);
  }
  return getMitraBoxPrice(med);
};

export const ManualCustomerPOModal: React.FC<ManualCustomerPOModalProps> = ({
  isOpen,
  editingOrder,
  medicines,
  mitraList,
  patients,
  currentBranchId = 'BR-01',
  userName = 'Admin',
  onClose,
  onSaveOrder
}) => {
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [orderRoom, setOrderRoom] = useState<PortalOrderRoom>('MITRA');
  const [orderCode, setOrderCode] = useState('');
  const [poDate, setPoDate] = useState(todayStr);

  // Customer identity fields
  const [selectedMitraId, setSelectedMitraId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCategory, setCustomerCategory] = useState('Klinik / Apotek Mitra');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [picName, setPicName] = useState('');

  // Customer autocomplete states
  const customerBoxRef = useRef<HTMLDivElement | null>(null);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const deferredCustomerQuery = useDeferredValue(customerName);

  // Order metadata
  const [status, setStatus] = useState<MitraOrderStatus>('Dikonfirmasi');
  const [paymentMethod, setPaymentMethod] = useState('Transfer Bank');
  const [paymentStatus, setPaymentStatus] = useState<MitraPaymentStatus>('Menunggu Pembayaran');
  const [discountType, setDiscountType] = useState<'RP' | 'PERCENT'>('RP');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // Items list
  const [items, setItems] = useState<MitraOrderItem[]>([]);

  // Fast medicine picker states
  const medSearchBoxRef = useRef<HTMLDivElement | null>(null);
  const [medSearch, setMedSearch] = useState('');
  const deferredMedSearch = useDeferredValue(medSearch);
  const [isMedDropdownOpen, setIsMedDropdownOpen] = useState(false);
  const [activeMedIndex, setActiveMedIndex] = useState(0);
  const [pickedMedicine, setPickedMedicine] = useState<Medicine | null>(null);
  const [pickedUnitMode, setPickedUnitMode] = useState<'KECIL' | 'BESAR'>('BESAR');
  const [pickedQty, setPickedQty] = useState<number>(1);
  const [pickedUnitPrice, setPickedUnitPrice] = useState<number>(0);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // O(1) medicine lookup map
  const medicineMap = useMemo(() => {
    const map = new Map<string, Medicine>();
    for (const m of medicines) {
      map.set(m.id, m);
    }
    return map;
  }, [medicines]);

  // Initialize / reset form whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setIsSaving(false);
    setIsCustomerDropdownOpen(false);
    setIsMedDropdownOpen(false);
    setMedSearch('');
    setPickedMedicine(null);
    setPickedQty(1);
    setPickedUnitPrice(0);

    if (editingOrder) {
      const resolvedRoom: PortalOrderRoom =
        editingOrder.orderRoom ||
        (String(editingOrder.orderCode || '').startsWith('REG-') ||
        String(editingOrder.orderCode || '').startsWith('PO-REG-') ||
        String(editingOrder.mitraCategory || '').toLowerCase().includes('reguler')
          ? 'REGULER'
          : 'MITRA');
      setOrderRoom(resolvedRoom);
      setOrderCode(editingOrder.orderCode || getDefaultOrderCode(resolvedRoom, todayStr));
      setPoDate(
        editingOrder.createdAt ? editingOrder.createdAt.split('T')[0] : todayStr
      );
      setSelectedMitraId(editingOrder.mitraId || '');
      setCustomerName(editingOrder.mitraName || '');
      setCustomerCategory(
        editingOrder.mitraCategory ||
          (resolvedRoom === 'REGULER' ? 'Pelanggan Reguler / Umum' : 'Mitra Faskes')
      );
      setCustomerPhone(editingOrder.mitraPhone || '');
      setCustomerAddress(editingOrder.mitraAddress || '');
      setPicName(editingOrder.picName || '');
      setStatus(editingOrder.status || 'Dikonfirmasi');
      setPaymentMethod(editingOrder.paymentMethod || 'Transfer Bank');
      setPaymentStatus(editingOrder.paymentStatus || 'Menunggu Pembayaran');
      const existingDiscAmount = Number(editingOrder.discountAmount) || 0;
      const existingItems = Array.isArray(editingOrder.items)
        ? editingOrder.items.map((it) => ({ ...it }))
        : [];
      const existingSubtotal = existingItems.reduce(
        (sum, it) => sum + (Number(it.subtotal) || 0),
        0
      );
      const pctMatch = (editingOrder.appliedDiscountLabel || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (pctMatch) {
        const parsedPct = Math.min(100, Math.max(0, parseFloat(pctMatch[1].replace(',', '.')) || 0));
        setDiscountType('PERCENT');
        setDiscountPercent(parsedPct);
        setDiscountAmount(
          existingDiscAmount > 0
            ? existingDiscAmount
            : Math.round((existingSubtotal * parsedPct) / 100)
        );
      } else {
        setDiscountType('RP');
        setDiscountAmount(existingDiscAmount);
        setDiscountPercent(
          existingSubtotal > 0 && existingDiscAmount > 0
            ? Number(((existingDiscAmount / existingSubtotal) * 100).toFixed(2))
            : 0
        );
      }
      setNotes(editingOrder.notes || '');
      setAdminNotes(editingOrder.adminNotes || '');
      setItems(existingItems);
      setPickedUnitMode(resolvedRoom === 'REGULER' ? 'KECIL' : 'BESAR');
    } else {
      const initialRoom: PortalOrderRoom = 'MITRA';
      setOrderRoom(initialRoom);
      setOrderCode(getDefaultOrderCode(initialRoom, todayStr));
      setPoDate(todayStr);
      setSelectedMitraId('');
      setCustomerName('');
      setCustomerCategory('Mitra Faskes');
      setCustomerPhone('');
      setCustomerAddress('');
      setPicName('');
      setStatus('Dikonfirmasi');
      setPaymentMethod('Transfer Bank');
      setPaymentStatus('Menunggu Pembayaran');
      setDiscountType('RP');
      setDiscountAmount(0);
      setDiscountPercent(0);
      setNotes('');
      setAdminNotes('');
      setItems([]);
      setPickedUnitMode('BESAR');
    }
  }, [isOpen, editingOrder, todayStr]);

  // Outside click handlers for lightweight dropdowns
  useEffect(() => {
    if (!isCustomerDropdownOpen && !isMedDropdownOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (isCustomerDropdownOpen && customerBoxRef.current && !customerBoxRef.current.contains(target)) {
        setIsCustomerDropdownOpen(false);
      }
      if (isMedDropdownOpen && medSearchBoxRef.current && !medSearchBoxRef.current.contains(target)) {
        setIsMedDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isCustomerDropdownOpen, isMedDropdownOpen]);

  // Capped customer suggestions (max 25 DOM items for zero-lag search)
  const customerSuggestions = useMemo(() => {
    const q = deferredCustomerQuery.trim().toLowerCase();
    if (orderRoom === 'MITRA') {
      const matches = q
        ? mitraList.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              (m.picName || '').toLowerCase().includes(q) ||
              (m.phone || '').toLowerCase().includes(q) ||
              (m.licenseNo || '').toLowerCase().includes(q)
          )
        : mitraList;
      return matches.slice(0, 25).map((m) => ({
        id: m.id,
        name: m.name,
        subtitle: [m.category, m.picName ? `PIC: ${m.picName}` : '', m.phone]
          .filter(Boolean)
          .join(' · '),
        category: m.category || 'Mitra Faskes',
        phone: m.phone || '',
        address: m.address || '',
        picName: m.picName || ''
      }));
    } else {
      const matches = q
        ? patients.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.phone || '').toLowerCase().includes(q) ||
              (p.nik || '').toLowerCase().includes(q)
          )
        : patients;
      return matches.slice(0, 25).map((p) => ({
        id: p.id,
        name: p.name,
        subtitle: [p.phone, p.address].filter(Boolean).join(' · ') || 'Pasien / Pelanggan Reguler',
        category: 'Pelanggan Reguler / Umum',
        phone: p.phone || '',
        address: p.address || '',
        picName: p.name
      }));
    }
  }, [orderRoom, deferredCustomerQuery, mitraList, patients]);

  // Capped medicine suggestions (max 35 DOM items so searching thousands of SKUs stays instant)
  const filteredMedicines = useMemo(() => {
    const q = deferredMedSearch.trim().toLowerCase();
    if (!q) return medicines.slice(0, 35);
    const results: Medicine[] = [];
    for (let i = 0; i < medicines.length; i++) {
      const med = medicines[i];
      if (
        med.name.toLowerCase().includes(q) ||
        med.id.toLowerCase().includes(q) ||
        (med.barcode || '').toLowerCase().includes(q) ||
        (med.category || '').toLowerCase().includes(q) ||
        (med.kekuatan || '').toLowerCase().includes(q)
      ) {
        results.push(med);
        if (results.length >= 35) break;
      }
    }
    return results;
  }, [medicines, deferredMedSearch]);

  const handleRoomSwitch = (nextRoom: PortalOrderRoom) => {
    if (nextRoom === orderRoom) return;
    setOrderRoom(nextRoom);
    setSelectedMitraId('');
    setCustomerCategory(nextRoom === 'REGULER' ? 'Pelanggan Reguler / Umum' : 'Mitra Faskes');
    setPickedUnitMode(nextRoom === 'REGULER' ? 'KECIL' : 'BESAR');
    if (pickedMedicine) {
      const nextMode = nextRoom === 'REGULER' ? 'KECIL' : 'BESAR';
      setPickedUnitPrice(getRoomDefaultUnitPrice(pickedMedicine, nextMode));
    }
    if (!editingOrder && (!orderCode.trim() || orderCode.startsWith('PO-REG-') || orderCode.startsWith('PO-MTR-'))) {
      setOrderCode(getDefaultOrderCode(nextRoom, poDate));
    }
  };

  const handlePickMedicine = (med: Medicine) => {
    const defaultMode: 'KECIL' | 'BESAR' = orderRoom === 'REGULER' ? 'KECIL' : 'BESAR';
    setPickedMedicine(med);
    setMedSearch(med.name);
    setPickedUnitMode(defaultMode);
    setPickedQty(1);
    setPickedUnitPrice(getRoomDefaultUnitPrice(med, defaultMode));
    setIsMedDropdownOpen(false);
    setFormError(null);
  };

  const handlePickUnitModeChange = (mode: 'KECIL' | 'BESAR') => {
    setPickedUnitMode(mode);
    if (pickedMedicine) {
      setPickedUnitPrice(getRoomDefaultUnitPrice(pickedMedicine, mode));
    }
  };

  const handleAddItemToPO = () => {
    if (!pickedMedicine) {
      setFormError('Pilih obat / produk terlebih dahulu dari kolom pencarian.');
      return;
    }
    const qty = Math.max(1, Math.round(Number(pickedQty) || 1));
    const unitPrice = Math.max(0, Math.round(Number(pickedUnitPrice) || 0));
    const medRatio = Math.max(1, Number(pickedMedicine.rasioKonversi) || 1);
    const isSmall = pickedUnitMode === 'KECIL';
    const ratioForLine = isSmall ? 1 : medRatio;
    const unitKecil = pickedMedicine.satuanKecil || pickedMedicine.unit || 'Tablet';
    const unitBesar = isSmall ? unitKecil : pickedMedicine.satuanBesar || 'Box';
    const hppBox = isSmall
      ? Number(pickedMedicine.hpp) || Math.round(getMedicineHppBox(pickedMedicine) / medRatio)
      : getMedicineHppBox(pickedMedicine);

    setFormError(null);
    setItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.medicineId === pickedMedicine.id && (it.unitMode || 'BESAR') === pickedUnitMode
      );
      if (existingIdx >= 0) {
        return prev.map((it, idx) => {
          if (idx !== existingIdx) return it;
          const nextQty = it.qtyBox + qty;
          return {
            ...it,
            qtyBox: nextQty,
            qtyTotalKecil: nextQty * ratioForLine,
            unitPriceBox: unitPrice,
            subtotal: nextQty * unitPrice
          };
        });
      }

      const newItem: MitraOrderItem = {
        medicineId: pickedMedicine.id,
        name: pickedMedicine.name,
        kekuatan: pickedMedicine.kekuatan || '-',
        kelas: pickedMedicine.kelas || '-',
        category: pickedMedicine.category || '-',
        satuanBesar: unitBesar,
        satuanKecil: unitKecil,
        rasioKonversi: ratioForLine,
        qtyBox: qty,
        qtyTotalKecil: qty * ratioForLine,
        unitPriceBox: unitPrice,
        subtotal: qty * unitPrice,
        hppBox,
        unitMode: pickedUnitMode
      };
      return [...prev, newItem];
    });

    setPickedMedicine(null);
    setMedSearch('');
    setPickedQty(1);
    setPickedUnitPrice(0);
  };

  const handleUpdateItemQty = (index: number, nextQtyRaw: number) => {
    const qty = Math.max(1, Math.round(Number(nextQtyRaw) || 1));
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        const ratio = it.unitMode === 'KECIL' ? 1 : Math.max(1, Number(it.rasioKonversi) || 1);
        return {
          ...it,
          qtyBox: qty,
          qtyTotalKecil: qty * ratio,
          subtotal: qty * (Number(it.unitPriceBox) || 0)
        };
      })
    );
  };

  const handleUpdateItemPrice = (index: number, nextPriceRaw: number) => {
    const price = Math.max(0, Math.round(Number(nextPriceRaw) || 0));
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        return {
          ...it,
          unitPriceBox: price,
          subtotal: (Number(it.qtyBox) || 0) * price
        };
      })
    );
  };

  const handleToggleItemUnitMode = (index: number, nextMode: 'KECIL' | 'BESAR') => {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        const med = medicineMap.get(it.medicineId);
        const medRatio = Math.max(1, Number(med?.rasioKonversi) || 1);
        const unitKecil = med?.satuanKecil || med?.unit || it.satuanKecil || 'Tablet';
        const unitBesar = nextMode === 'KECIL' ? unitKecil : med?.satuanBesar || 'Box';
        const nextPrice = med ? getRoomDefaultUnitPrice(med, nextMode) : it.unitPriceBox;
        const nextRatio = nextMode === 'KECIL' ? 1 : medRatio;
        const nextHpp = med
          ? nextMode === 'KECIL'
            ? Number(med.hpp) || Math.round(getMedicineHppBox(med) / medRatio)
            : getMedicineHppBox(med)
          : it.hppBox;
        return {
          ...it,
          unitMode: nextMode,
          satuanBesar: unitBesar,
          satuanKecil: unitKecil,
          rasioKonversi: nextRatio,
          qtyTotalKecil: (Number(it.qtyBox) || 1) * nextRatio,
          unitPriceBox: nextPrice,
          hppBox: nextHpp,
          subtotal: (Number(it.qtyBox) || 1) * nextPrice
        };
      })
    );
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const subtotalAmount = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0),
    [items]
  );
  const clampedPercent = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const rawCalculatedDiscount =
    discountType === 'PERCENT'
      ? Math.round((subtotalAmount * clampedPercent) / 100)
      : Math.max(0, Math.round(Number(discountAmount) || 0));
  const clampedDiscount = Math.min(subtotalAmount, rawCalculatedDiscount);
  const effectiveDiscountPercent =
    subtotalAmount > 0 && clampedDiscount > 0
      ? Number(((clampedDiscount / subtotalAmount) * 100).toFixed(2))
      : 0;
  const grandTotalAmount = Math.max(0, subtotalAmount - clampedDiscount);
  const totalQtySummary = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.qtyBox) || 0), 0),
    [items]
  );

  const handleSwitchDiscountType = (nextType: 'RP' | 'PERCENT') => {
    if (nextType === discountType) return;
    if (nextType === 'PERCENT') {
      const nextPct =
        subtotalAmount > 0 && clampedDiscount > 0
          ? Number(((clampedDiscount / subtotalAmount) * 100).toFixed(2))
          : discountPercent || 0;
      setDiscountPercent(Math.min(100, Math.max(0, nextPct)));
    } else {
      setDiscountAmount(clampedDiscount);
    }
    setDiscountType(nextType);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = customerName.trim();
    const cleanCode = orderCode.trim();

    if (!cleanName) {
      setFormError(
        orderRoom === 'MITRA'
          ? 'Nama Pelanggan Mitra / Faskes wajib diisi.'
          : 'Nama Pelanggan Reguler wajib diisi.'
      );
      return;
    }
    if (!cleanCode) {
      setFormError('Nomor PO / Referensi Pesanan wajib diisi.');
      return;
    }
    if (items.length === 0) {
      setFormError('Tambahkan minimal 1 item obat / produk ke dalam PO Pelanggan.');
      return;
    }

    const nowIso = new Date().toISOString();
    const createdTimestamp = poDate
      ? poDate === todayStr
        ? editingOrder?.createdAt || nowIso
        : `${poDate}T09:00:00.000Z`
      : editingOrder?.createdAt || nowIso;

    const recordId =
      editingOrder?.id ||
      `PO-${orderRoom === 'REGULER' ? 'REG' : 'MTR'}-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .slice(2, 5)
        .toUpperCase()}`;

    const isPaid = paymentStatus === 'Lunas';

    const orderRecord: MitraOrder = {
      ...(editingOrder || {}),
      id: recordId,
      orderCode: cleanCode,
      orderRoom,
      mitraId: orderRoom === 'MITRA' ? selectedMitraId || undefined : undefined,
      mitraName: cleanName,
      mitraCategory:
        orderRoom === 'REGULER'
          ? 'Pelanggan Reguler / Umum'
          : customerCategory.trim() || 'Mitra Faskes',
      mitraPhone: customerPhone.trim(),
      mitraAddress: customerAddress.trim(),
      picName: orderRoom === 'REGULER' ? picName.trim() || cleanName : picName.trim(),
      items,
      totalItems: items.length,
      totalQtyBox: totalQtySummary,
      discountAmount: clampedDiscount > 0 ? clampedDiscount : undefined,
      appliedDiscountLabel:
        clampedDiscount > 0
          ? discountType === 'PERCENT'
            ? `Diskon PO Manual (${clampedPercent}%)`
            : 'Diskon PO Manual (Rp)'
          : undefined,
      totalAmount: grandTotalAmount,
      status,
      paymentMethod: paymentMethod.trim() || 'Transfer Bank',
      paymentStatus,
      paymentVerifiedAt: isPaid ? editingOrder?.paymentVerifiedAt || nowIso : undefined,
      paymentVerifiedBy: isPaid ? editingOrder?.paymentVerifiedBy || userName : undefined,
      notes: notes.trim() || `PO Pelanggan ${orderRoom === 'REGULER' ? 'Reguler' : 'Mitra'} dicatat manual oleh ${userName}`,
      adminNotes: adminNotes.trim() || editingOrder?.adminNotes || `PO Manual (${cleanCode})`,
      createdAt: createdTimestamp,
      updatedAt: nowIso,
      branchId: editingOrder?.branchId || currentBranchId || 'BR-01'
    };

    setIsSaving(true);
    try {
      const res = await onSaveOrder(orderRecord, Boolean(editingOrder));
      if (!res.success) {
        setFormError(res.error || 'Gagal menyimpan PO Pelanggan.');
        setIsSaving(false);
        return;
      }
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Terjadi kesalahan saat menyimpan PO Pelanggan.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 my-4">
        {/* Header */}
        <div className="px-6 py-4 bg-indigo-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-800 rounded-xl text-indigo-200 border border-indigo-600/40">
              <ClipboardPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm">
                {editingOrder
                  ? `Edit PO Pelanggan (${editingOrder.orderCode})`
                  : 'Catat PO Pelanggan Manual (Reguler & Mitra)'}
              </h3>
              <p className="text-[11px] text-indigo-200">
                Pencatatan Purchase Order (PO) dari pelanggan Reguler maupun Mitra langsung ke sistem &amp; sinkron dua arah dengan Supabase
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-indigo-200 hover:text-white p-1.5 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
          {/* Row 1: Tipe Pelanggan + No. PO + Tanggal */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-black text-slate-800 block">Tipe Pelanggan / Kategori PO *</span>
                <span className="text-[11px] text-slate-500">
                  Pilih ruang Reguler (eceran/umum) atau Mitra (klinik/apotek jejaring/B2B)
                </span>
              </div>
              <div className="inline-flex rounded-xl bg-white border border-slate-300 p-1 text-xs font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => handleRoomSwitch('MITRA')}
                  className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                    orderRoom === 'MITRA'
                      ? 'bg-indigo-700 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Pelanggan Mitra</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRoomSwitch('REGULER')}
                  className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                    orderRoom === 'REGULER'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Pelanggan Reguler</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">No. PO Pelanggan / Kode Order *</label>
                  <button
                    type="button"
                    onClick={() => setOrderCode(getDefaultOrderCode(orderRoom, poDate))}
                    className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
                  >
                    Buat Nomor PO Otomatis
                  </button>
                </div>
                <input
                  type="text"
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  placeholder={orderRoom === 'REGULER' ? 'Cth: PO-REG-261127-101' : 'Cth: PO/KLINIK/2026/001'}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tanggal PO *</label>
                <input
                  type="date"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Identitas Pelanggan with Fast Autocomplete */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="relative" ref={customerBoxRef}>
                <label className="block font-bold text-slate-700 mb-1">
                  {orderRoom === 'MITRA'
                    ? 'Nama Pelanggan Mitra / Faskes *'
                    : 'Nama Pelanggan Reguler / Pembeli *'}
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={customerName}
                    onFocus={() => {
                      if (customerSuggestions.length > 0) setIsCustomerDropdownOpen(true);
                    }}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      if (selectedMitraId) setSelectedMitraId('');
                      setIsCustomerDropdownOpen(true);
                    }}
                    placeholder={
                      orderRoom === 'MITRA'
                        ? 'Ketik nama klinik / apotek mitra atau pilih dari daftar...'
                        : 'Ketik nama pelanggan / cari dari daftar pasien...'
                    }
                    className="w-full pl-9 pr-8 p-2.5 border border-slate-300 rounded-xl font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {customerName && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerName('');
                        setSelectedMitraId('');
                        setIsCustomerDropdownOpen(true);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {isCustomerDropdownOpen && customerSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {customerSuggestions.map((item) => {
                      const isSelected = selectedMitraId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedMitraId(orderRoom === 'MITRA' ? item.id : '');
                            setCustomerName(item.name);
                            setCustomerCategory(item.category);
                            setCustomerPhone(item.phone || customerPhone);
                            setCustomerAddress(item.address || customerAddress);
                            setPicName(item.picName || picName);
                            setIsCustomerDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-indigo-50 transition flex items-start justify-between gap-2 cursor-pointer ${
                            isSelected ? 'bg-indigo-50/80' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{item.name}</div>
                            {item.subtitle && (
                              <div className="text-[10px] text-slate-500 truncate">{item.subtitle}</div>
                            )}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {orderRoom === 'MITRA' ? (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori Mitra</label>
                  <select
                    value={customerCategory}
                    onChange={(e) => setCustomerCategory(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Mitra Faskes">Mitra Faskes</option>
                    <option value="Klinik Pratama">Klinik Pratama</option>
                    <option value="Klinik Utama">Klinik Utama</option>
                    <option value="Apotek Mitra">Apotek Mitra</option>
                    <option value="Praktik Dokter Mandiri">Praktik Dokter Mandiri</option>
                    <option value="Rumah Sakit">Rumah Sakit</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">No. HP / WhatsApp</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {orderRoom === 'MITRA' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nama PIC / Pemesan</label>
                    <input
                      type="text"
                      value={picName}
                      onChange={(e) => setPicName(e.target.value)}
                      placeholder="Nama Apoteker / Bagian Pembelian"
                      className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">No. HP / WhatsApp</label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Alamat Pengiriman</label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Alamat lengkap pengiriman atau keterangan ambil di apotek (opsional)"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Tambah Obat ke PO */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-emerald-950 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4 text-emerald-700" />
                Pilih &amp; Tambah Item Obat ke PO
              </span>
              <span className="text-[10px] font-semibold text-emerald-800">
                Harga default otomatis mengikuti tarif {orderRoom === 'REGULER' ? 'Reguler' : 'Mitra'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-5 relative" ref={medSearchBoxRef}>
                <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                  Cari Obat / Produk *
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={medSearch}
                    placeholder="Ketik nama obat, kategori, atau barcode..."
                    onFocus={() => setIsMedDropdownOpen(true)}
                    onChange={(e) => {
                      setMedSearch(e.target.value);
                      setPickedMedicine(null);
                      setActiveMedIndex(0);
                      setIsMedDropdownOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setIsMedDropdownOpen(true);
                        setActiveMedIndex((prev) =>
                          filteredMedicines.length > 0
                            ? Math.min(prev + 1, filteredMedicines.length - 1)
                            : 0
                        );
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveMedIndex((prev) => Math.max(prev - 1, 0));
                      } else if (e.key === 'Enter' && isMedDropdownOpen) {
                        const target = filteredMedicines[activeMedIndex] || filteredMedicines[0];
                        if (target) {
                          e.preventDefault();
                          handlePickMedicine(target);
                        }
                      } else if (e.key === 'Escape') {
                        setIsMedDropdownOpen(false);
                      }
                    }}
                    className="w-full pl-8 pr-7 p-2.5 border border-slate-300 rounded-xl font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {medSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setMedSearch('');
                        setPickedMedicine(null);
                        setIsMedDropdownOpen(true);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {isMedDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {filteredMedicines.length === 0 ? (
                      <div className="p-3 text-center text-slate-500 text-[11px]">
                        Tidak ditemukan obat yang cocok dengan &quot;{medSearch}&quot;.
                      </div>
                    ) : (
                      filteredMedicines.map((med, idx) => {
                        const boxStock = getAvailableBoxStock(med);
                        const mitraBox = getMitraBoxPrice(med);
                        const regUnit = getRoomDefaultUnitPrice(med, 'KECIL');
                        return (
                          <button
                            key={med.id}
                            type="button"
                            onMouseEnter={() => setActiveMedIndex(idx)}
                            onClick={() => handlePickMedicine(med)}
                            className={`w-full px-3 py-2 text-left transition cursor-pointer ${
                              idx === activeMedIndex ? 'bg-emerald-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 truncate">
                                {med.name} {med.kekuatan && med.kekuatan !== '-' ? med.kekuatan : ''}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-emerald-700 shrink-0">
                                {orderRoom === 'REGULER'
                                  ? `${formatRupiah(regUnit)}/${med.satuanKecil || 'Tab'}`
                                  : `${formatRupiah(mitraBox)}/${med.satuanBesar || 'Box'}`}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center justify-between mt-0.5">
                              <span>{med.category}</span>
                              <span className="font-mono">
                                Stok: {boxStock} {med.satuanBesar || 'Box'} ({Number(med.stock || 0).toLocaleString('id-ID')}{' '}
                                {med.satuanKecil || 'Tab'})
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1 text-[11px]">Satuan</label>
                <select
                  value={pickedUnitMode}
                  onChange={(e) => handlePickUnitModeChange(e.target.value as 'KECIL' | 'BESAR')}
                  disabled={!pickedMedicine}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                >
                  <option value="BESAR">{pickedMedicine?.satuanBesar || 'Box'}</option>
                  <option value="KECIL">{pickedMedicine?.satuanKecil || pickedMedicine?.unit || 'Tablet'}</option>
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="block font-bold text-slate-700 mb-1 text-[11px]">Qty *</label>
                <input
                  type="number"
                  min={1}
                  value={pickedQty}
                  onChange={(e) => setPickedQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1 text-[11px]">Harga Satuan</label>
                <input
                  type="number"
                  min={0}
                  value={pickedUnitPrice}
                  onChange={(e) => setPickedUnitPrice(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddItemToPO}
                  className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah</span>
                </button>
              </div>
            </div>

            {/* Daftar Item PO */}
            {items.length === 0 ? (
              <div className="py-6 text-center bg-white border border-dashed border-emerald-200 rounded-xl text-slate-400">
                Belum ada item obat di dalam PO. Cari dan tambahkan obat di atas.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2 px-3">Nama Obat</th>
                      <th className="py-2 px-3">Satuan</th>
                      <th className="py-2 px-3 text-center">Qty</th>
                      <th className="py-2 px-3 text-right">Harga Satuan (Rp)</th>
                      <th className="py-2 px-3 text-right">Subtotal</th>
                      <th className="py-2 px-2 text-center">Hapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => {
                      const med = medicineMap.get(it.medicineId);
                      const availKecil = med ? Number(med.stock) || 0 : 0;
                      const needKecil = Number(it.qtyTotalKecil) || Number(it.qtyBox) || 0;
                      const isEnough = med ? availKecil >= needKecil : true;

                      return (
                        <tr key={`${it.medicineId}-${it.unitMode || 'BESAR'}-${idx}`}>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900">
                              {it.name} {it.kekuatan && it.kekuatan !== '-' ? it.kekuatan : ''}
                            </div>
                            <div className="text-[10px] flex items-center gap-1.5 mt-0.5">
                              {med ? (
                                <span
                                  className={`font-semibold ${
                                    isEnough ? 'text-emerald-700' : 'text-amber-700'
                                  }`}
                                >
                                  {isEnough
                                    ? `Stok cukup (${availKecil.toLocaleString('id-ID')} ${it.satuanKecil})`
                                    : `Stok kurang: tersedia ${availKecil.toLocaleString('id-ID')} ${it.satuanKecil}, butuh ${needKecil.toLocaleString('id-ID')}`}
                                </span>
                              ) : (
                                <span className="text-slate-400">Item PO Manual</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            {med ? (
                              <select
                                value={it.unitMode || 'BESAR'}
                                onChange={(e) =>
                                  handleToggleItemUnitMode(idx, e.target.value as 'KECIL' | 'BESAR')
                                }
                                className="px-2 py-1 border border-slate-200 rounded-lg bg-slate-50 font-bold text-[11px] text-slate-700"
                              >
                                <option value="BESAR">{med.satuanBesar || 'Box'}</option>
                                <option value="KECIL">{med.satuanKecil || med.unit || 'Tablet'}</option>
                              </select>
                            ) : (
                              <span className="font-semibold text-slate-700">{it.satuanBesar}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              min={1}
                              value={it.qtyBox}
                              onChange={(e) => handleUpdateItemQty(idx, Number(e.target.value))}
                              className="w-16 p-1.5 border border-slate-300 rounded-lg text-center font-mono font-bold text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min={0}
                              value={it.unitPriceBox}
                              onChange={(e) => handleUpdateItemPrice(idx, Number(e.target.value))}
                              className="w-28 p-1.5 border border-slate-300 rounded-lg text-right font-mono font-bold text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-slate-900 tabular-nums">
                            {formatRupiah(it.subtotal)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Hapus item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Row 3: Status PO, Pembayaran, Diskon & Catatan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Status PO Awal</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MitraOrderStatus)}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Pending">Pending (Menunggu Konfirmasi)</option>
                <option value="Dikonfirmasi">Dikonfirmasi (PO Diterima)</option>
                <option value="Diproses">Diproses (Sedang Disiapkan)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Metode Pembayaran</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Transfer Bank">Transfer Bank</option>
                <option value="Cash / COD">Cash / COD</option>
                <option value="QRIS">QRIS</option>
                <option value="Tempo / Piutang Mitra">Tempo / Piutang Mitra</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Status Pembayaran</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as MitraPaymentStatus)}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Menunggu Pembayaran">Belum Bayar (Menunggu Pembayaran)</option>
                <option value="Lunas">Lunas (Terverifikasi / Siap Faktur POS)</option>
              </select>
            </div>

            <div>
              <label className="flex items-center justify-between gap-1 font-bold text-slate-700 mb-1">
                <span>Diskon PO ({discountType === 'PERCENT' ? '%' : 'Rp'})</span>
                <span className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => handleSwitchDiscountType('RP')}
                    className={`px-2 py-0.5 rounded-md font-extrabold transition cursor-pointer ${
                      discountType === 'RP'
                        ? 'bg-indigo-700 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Rp
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchDiscountType('PERCENT')}
                    className={`px-2 py-0.5 rounded-md font-extrabold transition cursor-pointer ${
                      discountType === 'PERCENT'
                        ? 'bg-indigo-700 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    %
                  </button>
                </span>
              </label>
              <input
                type="number"
                min={0}
                max={discountType === 'PERCENT' ? 100 : undefined}
                step={discountType === 'PERCENT' ? '0.1' : '1'}
                value={
                  discountType === 'PERCENT'
                    ? discountPercent || ''
                    : discountAmount || ''
                }
                onChange={(e) => {
                  const rawVal = Number(e.target.value);
                  if (discountType === 'PERCENT') {
                    const nextPct = Math.min(100, Math.max(0, Number.isFinite(rawVal) ? rawVal : 0));
                    setDiscountPercent(nextPct);
                    setDiscountAmount(Math.round((subtotalAmount * nextPct) / 100));
                  } else {
                    const nextRp = Math.max(0, Math.round(Number.isFinite(rawVal) ? rawVal : 0));
                    setDiscountAmount(nextRp);
                    if (subtotalAmount > 0) {
                      setDiscountPercent(
                        Math.min(100, Number(((nextRp / subtotalAmount) * 100).toFixed(2)))
                      );
                    }
                  }
                }}
                placeholder={discountType === 'PERCENT' ? '0 %' : '0'}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {clampedDiscount > 0 && (
                <div className="mt-1 text-[10px] font-mono font-semibold text-indigo-700 flex items-center justify-between">
                  <span>
                    {discountType === 'PERCENT'
                      ? `Potongan: ${formatRupiah(clampedDiscount)}`
                      : `Setara: ${effectiveDiscountPercent}%`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Catatan PO Pelanggan</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cth: PO via WhatsApp / Kirim hari ini sebelum jam 16.00"
                className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Catatan Admin Internal</label>
              <input
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Catatan persiapan / jadwal kirim kurir..."
                className="w-full p-2.5 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Summary Strip */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 text-[11px] text-slate-300">
              <div>
                Ringkasan PO:{' '}
                <strong className="text-white">
                  {items.length} jenis produk · {totalQtySummary.toLocaleString('id-ID')} kemasan/item
                </strong>
              </div>
              {clampedDiscount > 0 && (
                <div className="font-mono">
                  Subtotal {formatRupiah(subtotalAmount)} − Diskon{' '}
                  {discountType === 'PERCENT' ? `${clampedPercent}% (${formatRupiah(clampedDiscount)})` : formatRupiah(clampedDiscount)}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Total Nilai PO Pelanggan
              </div>
              <div className="text-xl font-black text-emerald-400 font-mono tabular-nums">
                {formatRupiah(grandTotalAmount)}
              </div>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white font-extrabold flex items-center gap-2 shadow-md cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyimpan &amp; Sinkron...</span>
                </>
              ) : (
                <>
                  {editingOrder ? <Save className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{editingOrder ? 'Simpan Perubahan PO' : 'Simpan PO Pelanggan'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
