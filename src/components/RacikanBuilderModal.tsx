import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FlaskConical,
  Pill,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react';
import {
  CompoundIngredientItem,
  Medicine,
  PrescriptionItem
} from '../types';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';
import {
  calculateRacikanBud,
  formatDateDDMMYYYY,
  resolveMedicineEarliestExpDate
} from '../utils/racikanBudHelper';

type RacikanType = 'Puyer' | 'Kapsul Racikan' | 'Salep Racikan' | 'Sirup Racikan';

interface RacikanBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicines: Medicine[];
  patientAllergy?: string;
  initialItem?: PrescriptionItem | null;
  onSaveRacikan: (item: PrescriptionItem) => void;
}

const RACIKAN_TYPE_OPTIONS: {
  value: RacikanType;
  label: string;
  defaultUnit: string;
  defaultDosage: string;
  latinNote: string;
}[] = [
  {
    value: 'Puyer',
    label: 'Puyer (Serbuk Bagi)',
    defaultUnit: 'Bungkus',
    defaultDosage: '3x1 Bungkus Sesudah Makan',
    latinNote: 'm.f. pulv. d.t.d.'
  },
  {
    value: 'Kapsul Racikan',
    label: 'Kapsul Racikan',
    defaultUnit: 'Kapsul',
    defaultDosage: '3x1 Kapsul Sesudah Makan',
    latinNote: 'm.f. caps. d.t.d.'
  },
  {
    value: 'Salep Racikan',
    label: 'Salep / Krim Racikan',
    defaultUnit: 'Pot',
    defaultDosage: '2x1 Oles Tipis (Obat Luar)',
    latinNote: 'm.f. ungt. u.e.'
  },
  {
    value: 'Sirup Racikan',
    label: 'Sirup / Larutan Racikan',
    defaultUnit: 'Botol',
    defaultDosage: '3x1 Sendok Takar (5 ml) Sesudah Makan',
    latinNote: 'm.f. potio'
  }
];

const QUICK_DOSAGE_BY_TYPE: Record<RacikanType, string[]> = {
  Puyer: [
    '3x1 Bungkus Sesudah Makan',
    '2x1 Bungkus Sesudah Makan',
    '3x1 Bungkus Sebelum Makan',
    'Bila Demam 1 Bungkus'
  ],
  'Kapsul Racikan': [
    '3x1 Kapsul Sesudah Makan',
    '2x1 Kapsul Sesudah Makan',
    '1x1 Kapsul Malam Hari'
  ],
  'Salep Racikan': [
    '2x1 Oles Tipis Pada Area Sakit',
    '3x1 Oles Tipis (Obat Luar)',
    'Oleskan Malam Sebelum Tidur'
  ],
  'Sirup Racikan': [
    '3x1 Sendok Takar (5 ml) Sesudah Makan',
    '2x1 Sendok Takar (5 ml) Sesudah Makan',
    '3x1/2 Sendok Takar (2,5 ml)'
  ]
};

export const RacikanBuilderModal: React.FC<RacikanBuilderModalProps> = ({
  isOpen,
  onClose,
  medicines,
  patientAllergy = '',
  initialItem = null,
  onSaveRacikan
}) => {
  const [racikanType, setRacikanType] = useState<RacikanType>('Puyer');
  const [racikanName, setRacikanName] = useState('');
  const [qty, setQty] = useState<number>(10);
  const [unit, setUnit] = useState('Bungkus');
  const [method, setMethod] = useState<'dtd' | 'non-dtd'>('dtd');
  const [dosage, setDosage] = useState('3x1 Bungkus Sesudah Makan');
  const [notes, setNotes] = useState('m.f. pulv. d.t.d. — gerus halus, bagi rata');
  const [ingredients, setIngredients] = useState<CompoundIngredientItem[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [allergyWarningMed, setAllergyWarningMed] = useState<Medicine | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [budEnabled, setBudEnabled] = useState<boolean>(true);
  const [manualBudDate, setManualBudDate] = useState<string>('');
  const [budPanelExpanded, setBudPanelExpanded] = useState<boolean>(false);
  const manualBudInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setAllergyWarningMed(null);
    setIngredientSearch('');
    setShowDropdown(false);

    if (initialItem && initialItem.isRacikan) {
      const rType = initialItem.racikanType || 'Puyer';
      setRacikanType(rType);
      setRacikanName(initialItem.racikanName || '');
      setQty(initialItem.qty > 0 ? initialItem.qty : 10);
      setUnit(initialItem.unit || 'Bungkus');
      setMethod(initialItem.racikanMethod || 'dtd');
      setDosage(initialItem.dosage || '3x1 Bungkus Sesudah Makan');
      setNotes(initialItem.notes || '');
      setIngredients(initialItem.racikanIngredients ? [...initialItem.racikanIngredients] : []);
      setManualBudDate(rType === 'Sirup Racikan' ? initialItem.budDate || '' : '');
      setBudEnabled(rType === 'Sirup Racikan' ? Boolean(initialItem.budDate) : true);
      setBudPanelExpanded(Boolean(initialItem.budDate));
    } else {
      setRacikanType('Puyer');
      setRacikanName('');
      setQty(10);
      setUnit('Bungkus');
      setMethod('dtd');
      setDosage('3x1 Bungkus Sesudah Makan');
      setNotes('m.f. pulv. d.t.d. — gerus halus, bagi rata');
      setIngredients([]);
      setManualBudDate('');
      setBudEnabled(true);
      setBudPanelExpanded(false);
    }
  }, [isOpen, initialItem]);

  const filteredIngredients = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();
    const list = q
      ? medicines.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.kekuatan || '').toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q)
        )
      : medicines.slice(0, 8);
    return list.slice(0, 40);
  }, [medicines, ingredientSearch]);

  const handleSelectRacikanType = (newType: RacikanType) => {
    const meta = RACIKAN_TYPE_OPTIONS.find((o) => o.value === newType) || RACIKAN_TYPE_OPTIONS[0];
    setRacikanType(newType);
    setUnit(meta.defaultUnit);
    setDosage(meta.defaultDosage);
    if (newType !== 'Sirup Racikan') {
      setBudEnabled(true);
    }
    if (
      !notes ||
      RACIKAN_TYPE_OPTIONS.some((o) => notes.toLowerCase().includes(o.latinNote.toLowerCase()))
    ) {
      setNotes(
        newType === 'Puyer'
          ? 'm.f. pulv. d.t.d. — gerus halus, bagi rata'
          : newType === 'Kapsul Racikan'
          ? 'm.f. caps. d.t.d. — masukkan kapsul sama rata'
          : newType === 'Salep Racikan'
          ? 'm.f. ungt. u.e. — campur homogen dalam pot salep'
          : 'm.f. potio — kocok dahulu sebelum dipakai'
      );
    }
  };

  const handleQtyChange = (newQtyRaw: number) => {
    const nextQty = Math.max(1, Math.round(newQtyRaw || 1));
    setQty(nextQty);
    if (method === 'dtd') {
      setIngredients((prev) =>
        prev.map((ing) => {
          const perDose = Number(ing.qtyPerDose) || 0.5;
          const computed = Math.max(1, Math.ceil(perDose * nextQty));
          return { ...ing, totalQty: computed };
        })
      );
    }
  };

  const handleMethodChange = (nextMethod: 'dtd' | 'non-dtd') => {
    setMethod(nextMethod);
    if (nextMethod === 'dtd') {
      setIngredients((prev) =>
        prev.map((ing) => {
          const perDose =
            ing.qtyPerDose && ing.qtyPerDose > 0
              ? ing.qtyPerDose
              : Math.max(0.25, Number((ing.totalQty / Math.max(1, qty)).toFixed(2)));
          return {
            ...ing,
            qtyPerDose: perDose,
            totalQty: Math.max(1, Math.ceil(perDose * Math.max(1, qty)))
          };
        })
      );
    }
  };

  const addMedicineIngredient = (med: Medicine, bypassAllergyCheck = false) => {
    if (
      !bypassAllergyCheck &&
      patientAllergy &&
      patientAllergy !== 'Tidak Ada' &&
      med.name.toLowerCase().includes(patientAllergy.toLowerCase())
    ) {
      setAllergyWarningMed(med);
      return;
    }

    setAllergyWarningMed(null);
    setFormError(null);

    const existingIdx = ingredients.findIndex((i) => i.medicineId === med.id);
    if (existingIdx >= 0) {
      setIngredients((prev) =>
        prev.map((ing, idx) => {
          if (idx !== existingIdx) return ing;
          if (method === 'dtd') {
            const nextPerDose = Number(((ing.qtyPerDose || 0.5) + 0.5).toFixed(2));
            return {
              ...ing,
              qtyPerDose: nextPerDose,
              totalQty: Math.max(1, Math.ceil(nextPerDose * Math.max(1, qty)))
            };
          }
          return { ...ing, totalQty: ing.totalQty + 1 };
        })
      );
    } else {
      const defaultPerDose = 0.5;
      const initialTotal =
        method === 'dtd' ? Math.max(1, Math.ceil(defaultPerDose * Math.max(1, qty))) : 5;
      setIngredients((prev) => [
        ...prev,
        {
          medicineId: med.id,
          name: med.name,
          qtyPerDose: defaultPerDose,
          totalQty: initialTotal,
          unit: med.satuanKecil || med.unit || 'Tablet',
          price: med.sellPriceKlinik || med.sellPrice || 0,
          hpp: med.hpp || 0,
          expDate: resolveMedicineEarliestExpDate(med)
        }
      ]);
    }

    setIngredientSearch('');
    setShowDropdown(false);
  };

  const updateIngredientPerDose = (idx: number, rawVal: string) => {
    const val = Math.max(0.05, parseFloat(rawVal) || 0.25);
    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === idx
          ? {
              ...ing,
              qtyPerDose: val,
              totalQty: Math.max(1, Math.ceil(val * Math.max(1, qty)))
            }
          : ing
      )
    );
  };

  const updateIngredientTotalQty = (idx: number, rawVal: string) => {
    const val = Math.max(1, Math.round(parseFloat(rawVal) || 1));
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? { ...ing, totalQty: val } : ing))
    );
  };

  const removeIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalIngredientCost = useMemo(
    () => ingredients.reduce((sum, ing) => sum + (ing.price || 0) * (ing.totalQty || 0), 0),
    [ingredients]
  );

  const unitPriceEquivalent = useMemo(() => {
    const safeQty = Math.max(1, qty || 1);
    return Math.round(totalIngredientCost / safeQty);
  }, [totalIngredientCost, qty]);

  const autoBudResult = useMemo(
    () => calculateRacikanBud(racikanType, ingredients, medicines),
    [racikanType, ingredients, medicines]
  );

  const effectiveBudDate = useMemo(() => {
    if (!budEnabled) return '';
    if (racikanType === 'Sirup Racikan') {
      return manualBudDate.trim();
    }
    return autoBudResult.budDate;
  }, [budEnabled, racikanType, manualBudDate, autoBudResult.budDate]);

  const handleBudButtonClick = () => {
    setBudEnabled(true);
    setBudPanelExpanded(true);
    if (racikanType === 'Sirup Racikan') {
      setTimeout(() => {
        manualBudInputRef.current?.focus();
      }, 60);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ingredients.length === 0) {
      setFormError('Tambahkan minimal 1 bahan obat ke dalam komposisi puyer/racikan.');
      return;
    }
    if (!qty || qty <= 0) {
      setFormError('Jumlah sediaan racikan minimal 1.');
      return;
    }
    if (!dosage.trim()) {
      setFormError('Isi aturan pakai (signa) racikan terlebih dahulu.');
      return;
    }

    const compSummary = ingredients
      .map((ing) => `${ing.name} (${ing.totalQty} ${ing.unit})`)
      .join(' + ');
    const cleanTitle = racikanName.trim() || `${racikanType} Kombinasi`;
    const fullName = `${cleanTitle} [${compSummary}]`;

    const builtItem: PrescriptionItem = {
      medicineId:
        initialItem?.medicineId && initialItem.medicineId.startsWith('RACIKAN-')
          ? initialItem.medicineId
          : `RACIKAN-${Date.now()}`,
      name: fullName,
      qty: Math.max(1, Math.round(qty)),
      unit: unit.trim() || 'Bungkus',
      price: unitPriceEquivalent,
      dosage: dosage.trim(),
      notes: notes.trim(),
      isRacikan: true,
      racikanType,
      racikanMethod: method,
      racikanName: cleanTitle,
      racikanIngredients: ingredients,
      budDate: effectiveBudDate || undefined
    };

    onSaveRacikan(builtItem);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-4 animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-700 to-sky-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-2xl">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wide">
                {initialItem ? 'Edit Resep Puyer / Racikan' : 'Form Buat Puyer / Racikan Obat'}
              </h3>
              <p className="text-[11px] text-sky-100">
                Susun komposisi bahan obat dari stok apotek, jumlah bungkus/sediaan, &amp; signa pakai
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          {allergyWarningMed && (
            <div className="p-3.5 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-2">
              <div className="flex items-start gap-2 text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-black">
                    PERINGATAN ALERGI OBAT: Pasien tercatat alergi terhadap "{patientAllergy}"!
                  </strong>
                  <span className="text-[11px]">
                    Yakin tetap ingin menambahkan <strong>{allergyWarningMed.name}</strong> ke dalam racikan?
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAllergyWarningMed(null)}
                  className="px-3 py-1 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 cursor-pointer"
                >
                  Batalkan
                </button>
                <button
                  type="button"
                  onClick={() => addMedicineIngredient(allergyWarningMed, true)}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer"
                >
                  Tetap Tambahkan
                </button>
              </div>
            </div>
          )}

          {/* 1. Jenis Sediaan & Identitas Racikan */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                1. Bentuk Sediaan &amp; Jumlah Racikan
              </span>
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleMethodChange('dtd')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                    method === 'dtd'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  d.t.d. (Dosis per Bungkus)
                </button>
                <button
                  type="button"
                  onClick={() => handleMethodChange('non-dtd')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                    method === 'non-dtd'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Non-d.t.d. (Total Bahan)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {RACIKAN_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectRacikanType(opt.value)}
                  className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                    racikanType === opt.value
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-950 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="font-extrabold text-[11px] block">{opt.label}</span>
                  <span className="text-[10px] font-mono text-slate-500">{opt.latinNote}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Nama / Label Racikan
                </label>
                <input
                  type="text"
                  value={racikanName}
                  onChange={(e) => setRacikanName(e.target.value)}
                  placeholder="Contoh: Puyer Batuk Pilek Anak"
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Jumlah Jadi (No.)
                </label>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => handleQtyChange(parseInt(e.target.value, 10))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono font-black text-center text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Satuan</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Bungkus / Kapsul"
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* 2. Pencarian & Komposisi Bahan Obat */}
          <div className="bg-sky-50/50 p-4 rounded-2xl border border-sky-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5 text-sky-700" />
                <span>2. Komposisi Bahan Obat (Dari Stok Apotek)</span>
              </span>
              <span className="text-[10px] font-semibold text-sky-800">
                {method === 'dtd'
                  ? 'Isi dosis per 1 sediaan, total ambil stok dihitung otomatis'
                  : 'Isi langsung total jumlah bahan yang dicampur'}
              </span>
            </div>

            <div className="relative">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ingredientSearch}
                  onChange={(e) => {
                    setIngredientSearch(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Cari bahan obat dari stok (misal: Paracetamol, CTM, Ambroxol)..."
                  className="w-full pl-9 pr-3 py-2.5 border border-sky-300 rounded-xl bg-white font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              {showDropdown && filteredIngredients.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y">
                  {filteredIngredients.map((med) => {
                    const medEarliestEd = resolveMedicineEarliestExpDate(med);
                    return (
                      <button
                        key={med.id}
                        type="button"
                        onClick={() => addMedicineIngredient(med)}
                        className="w-full text-left p-2.5 hover:bg-sky-50 cursor-pointer flex items-center justify-between gap-2 transition"
                      >
                        <div>
                          <strong className="text-slate-900 block">{med.name}</strong>
                          <span className="text-[10px] text-slate-500 inline-flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <MedicineCategorySymbol category={med.category} size="xs" />
                            <span>
                              Stok:{' '}
                              <strong className="text-emerald-700">
                                {med.stock} {med.satuanKecil || med.unit}
                              </strong>
                            </span>
                            {medEarliestEd && (
                              <span className="font-mono text-slate-600">
                                · ED: <strong>{formatDateDDMMYYYY(medEarliestEd)}</strong>
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-sky-700">
                            Rp {(med.sellPriceKlinik || med.sellPrice).toLocaleString('id-ID')}
                          </span>
                          <span className="px-2 py-1 rounded-lg bg-indigo-600 text-white font-bold text-[10px] inline-flex items-center gap-1">
                            <Plus className="w-3 h-3" />
                            <span>Pilih</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border border-sky-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-2.5">Nama Bahan Obat</th>
                    {method === 'dtd' && (
                      <th className="p-2.5 w-28 text-center">Dosis / {unit || 'Bks'}</th>
                    )}
                    <th className="p-2.5 w-28 text-center">Total Ambil Stok</th>
                    <th className="p-2.5 w-28 text-right">Subtotal</th>
                    <th className="p-2.5 w-10 text-center">#</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ingredients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={method === 'dtd' ? 5 : 4}
                        className="p-5 text-center text-slate-400 italic"
                      >
                        Cari dan pilih minimal 1 bahan obat di atas untuk menyusun komposisi racikan.
                      </td>
                    </tr>
                  ) : (
                    ingredients.map((ing, idx) => {
                      const matchedMed = medicines.find((m) => m.id === ing.medicineId);
                      const ingExp = resolveMedicineEarliestExpDate(matchedMed, ing.expDate);
                      const isEarliestEd =
                        Boolean(ingExp) &&
                        Boolean(autoBudResult.earliestExpDate) &&
                        ingExp === autoBudResult.earliestExpDate;
                      return (
                        <tr key={`${ing.medicineId}-${idx}`} className="hover:bg-slate-50">
                          <td className="p-2.5">
                            <strong className="text-slate-900 block">{ing.name}</strong>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-500">
                              <span>
                                @ Rp {ing.price.toLocaleString('id-ID')} / {ing.unit}
                              </span>
                              {ingExp && (
                                <span
                                  className={
                                    isEarliestEd
                                      ? 'px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300'
                                      : 'text-slate-500'
                                  }
                                >
                                  ED: {formatDateDDMMYYYY(ingExp)}
                                  {isEarliestEd ? ' (ED Terdekat)' : ''}
                                </span>
                              )}
                            </div>
                          </td>
                        {method === 'dtd' && (
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              step="0.25"
                              min="0.05"
                              value={ing.qtyPerDose ?? 0.5}
                              onChange={(e) => updateIngredientPerDose(idx, e.target.value)}
                              className="w-20 p-1 border border-slate-300 rounded-lg text-center font-mono font-bold bg-white"
                            />
                          </td>
                        )}
                        <td className="p-2.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              value={ing.totalQty}
                              onChange={(e) => updateIngredientTotalQty(idx, e.target.value)}
                              className="w-14 p-1 border border-slate-300 rounded-lg text-center font-mono font-black bg-white text-indigo-700"
                            />
                            <span className="text-[10px] text-slate-600 font-semibold">
                              {ing.unit}
                            </span>
                          </div>
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-800">
                          Rp {((ing.price || 0) * (ing.totalQty || 0)).toLocaleString('id-ID')}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeIngredient(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Signa / Aturan Pakai & Catatan Racikan */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 block">
              3. Aturan Pakai (Signa) &amp; Instruksi Peracikan
            </span>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Aturan Pakai (Signa)
                </label>
                <input
                  type="text"
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  placeholder="Contoh: 3x1 Bungkus Sesudah Makan"
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {QUICK_DOSAGE_BY_TYPE[racikanType].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDosage(preset)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border cursor-pointer transition ${
                        dosage === preset
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Instruksi Peracikan Apoteker / Catatan
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Misal: m.f. pulv. d.t.d. — gerus halus dan bagi rata"
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* 4. Beyond Use Date (BUD) Racikan */}
          <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-amber-700" />
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-950">
                  4. Beyond Use Date (BUD) — Pengganti ED di Etiket
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBudButtonClick}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition cursor-pointer shadow-2xs ${
                    budEnabled && (effectiveBudDate || racikanType === 'Sirup Racikan')
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-white border border-amber-400 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>
                    {racikanType === 'Sirup Racikan'
                      ? 'BUD (Input Manual)'
                      : 'BUD (Hitung Otomatis)'}
                  </span>
                </button>
                {budEnabled && (
                  <button
                    type="button"
                    onClick={() => setBudEnabled(false)}
                    className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-white border border-slate-300 text-slate-600 hover:text-rose-700 hover:border-rose-300 cursor-pointer transition"
                  >
                    Nonaktifkan
                  </button>
                )}
              </div>
            </div>

            {budEnabled ? (
              <div className="bg-white rounded-xl border border-amber-200 p-3 space-y-2.5">
                {racikanType === 'Sirup Racikan' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-5">
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Tanggal BUD Manual (Sirup / Larutan)
                      </label>
                      <input
                        ref={manualBudInputRef}
                        type="date"
                        value={manualBudDate}
                        onChange={(e) => setManualBudDate(e.target.value)}
                        className="w-full p-2 border border-amber-300 rounded-xl font-mono font-bold text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <div className="sm:col-span-7 text-[11px] text-slate-700 space-y-0.5">
                      <p className="font-bold text-amber-900">{autoBudResult.ruleDescription}</p>
                      {manualBudDate && (
                        <p className="font-mono text-emerald-700 font-black flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>BUD Etiket: {formatDateDDMMYYYY(manualBudDate)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="text-[11px] font-bold text-slate-800">
                        {autoBudResult.ruleDescription}
                      </div>
                      {autoBudResult.earliestMedName && (
                        <div className="text-[10px] text-slate-500">
                          Acuan ED Terdekat: <strong>{autoBudResult.earliestMedName}</strong> (ED:{' '}
                          <span className="font-mono font-bold">
                            {formatDateDDMMYYYY(autoBudResult.earliestExpDate)}
                          </span>
                          )
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-950 font-mono font-black text-xs flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>
                        BUD: {effectiveBudDate ? formatDateDDMMYYYY(effectiveBudDate) : '-'}
                      </span>
                    </div>
                  </div>
                )}

                {budPanelExpanded && racikanType !== 'Sirup Racikan' && effectiveBudDate && (
                  <p className="text-[10px] text-emerald-700 font-semibold border-t border-amber-100 pt-1.5">
                    ✓ Tanggal BUD otomatis aktif dan akan menggantikan keterangan ED pada etiket kemasan racikan.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-amber-900/80 italic">
                BUD sedang dinonaktifkan. Klik tombol <strong>BUD</strong> di atas untuk mengaktifkan tanggal BUD pada etiket racikan.
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-700">
            <span className="font-semibold">{ingredients.length} bahan obat</span> · Total Bahan:{' '}
            <strong className="font-mono text-indigo-800">
              Rp {totalIngredientCost.toLocaleString('id-ID')}
            </strong>{' '}
            <span className="text-[11px] text-slate-500">
              (± Rp {unitPriceEquivalent.toLocaleString('id-ID')}/{unit || 'sediaan'})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md"
            >
              <FlaskConical className="w-4 h-4" />
              <span>
                {initialItem ? 'Simpan Perubahan Racikan' : 'Tambahkan Racikan ke Resep'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
