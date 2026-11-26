import React, { useState, useMemo, useEffect } from 'react';
import { demoSetItem } from '../utils/demoSandbox';
import {
  FlaskConical,
  Plus,
  Search,
  Printer,
  Edit2,
  Trash2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  User,
  Calendar,
  Clock,
  X,
  Save,
  Sparkles,
  Activity,
  Database,
  RefreshCw,
  Code,
  AlertCircle,
  Copy,
  Check,
  ChevronDown
} from 'lucide-react';
import {
  LabTestRecord,
  LabTestItem,
  Patient,
  Doctor,
  PharmacyProfile,
  DPJProfile,
  Staff,
  Medicine
} from '../types';
import {
  CLINICAL_STANDARDS,
  ClinicalStandard,
  findClinicalStandard,
  evaluateLabResultStatus,
  getGenderAdjustedTemplates
} from '../utils/labStandards';
import {
  useFacilityProfiles,
  formatPharmacyAddress
} from '../utils/facilityProfileHelper';
import { openPrintWindow } from '../utils/printHelper';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';
import {
  SUPABASE_LAB_TEST_SQL_SCHEMA,
  DEFAULT_LAB_TEST_TABLE,
  getSupabaseConfig,
  setSupabaseConfig,
  fetchPatientsPaginatedFromSupabase,
  deduplicatePatients
} from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { isDemoMode } from '../utils/demoSandbox';

interface LabTestViewProps {
  labRecords: LabTestRecord[];
  patients: Patient[];
  doctors: Doctor[];
  staffList?: Staff[];
  medicines?: Medicine[];
  pharmacyProfile?: PharmacyProfile;
  dpjProfile?: DPJProfile;
  onAddLabRecord: (record: LabTestRecord) => void;
  onUpdateLabRecord: (record: LabTestRecord) => void;
  onDeleteLabRecord: (
    id: string
  ) =>
    | Promise<{
        success?: boolean;
        needsTableSetup?: boolean;
        isDemo?: boolean;
        error?: string;
      } | void>
    | void;
  onSyncSupabase?: () => Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  needsTableSetup?: boolean;
  isDemoSandbox?: boolean;
}

export const LabTestView: React.FC<LabTestViewProps> = ({
  labRecords,
  patients,
  doctors,
  staffList = [],
  medicines = [],
  pharmacyProfile: propPharmacyProfile,
  dpjProfile: propDpjProfile,
  onAddLabRecord,
  onUpdateLabRecord,
  onDeleteLabRecord,
  onSyncSupabase,
  needsTableSetup = false,
  isDemoSandbox = false
}) => {
  const {
    pharmacyProfile: savedPharm,
    apjProfile,
    dpjProfile: savedDpj
  } = useFacilityProfiles();
  const pharmacyProfile = propPharmacyProfile || savedPharm;
  const dpjProfile = propDpjProfile || savedDpj;
  const pharmacyFullAddress = formatPharmacyAddress(pharmacyProfile);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ABNORMAL' | 'NORMAL'>('ALL');
  
  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LabTestRecord | null>(null);
  const [printRecord, setPrintRecord] = useState<LabTestRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<LabTestRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Supabase sync & schema modal states
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const isOwnerAdmin = useIsOwnerAdmin();
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [labTableInput, setLabTableInput] = useState(
    () => getSupabaseConfig().labTestTable || DEFAULT_LAB_TEST_TABLE
  );

  const handleRunSupabaseSync = async () => {
    if (!onSyncSupabase) return;
    setIsSyncing(true);
    setSyncToast(null);
    try {
      const res = await onSyncSupabase();
      if (res.isDemo) {
        setSyncToast({
          type: 'warning',
          message:
            'Mode Demo / Sandbox aktif. Sinkronisasi ke Supabase produksi dinonaktifkan otomatis untuk isolasi data demo.'
        });
      } else if (res.success) {
        setSyncToast({
          type: 'success',
          message: `Sinkronisasi 2-arah berhasil! Total ${res.count ?? labRecords.length} dokumen Pemeriksaan & Cek Lab tersinkron dengan Supabase.`
        });
      } else if (res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: `Tabel "${labTableInput || DEFAULT_LAB_TEST_TABLE}" belum dibuat di Supabase. Salin skrip SQL pada modal Skema SQL.`
        });
      } else {
        setSyncToast({
          type: 'error',
          message: res.error || 'Gagal menyinkronkan data Pemeriksaan & Cek Lab ke Supabase.'
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveTableName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSandbox) {
      setSyncToast({
        type: 'warning',
        message: 'Konfigurasi Supabase tidak dapat diubah saat Mode Demo Sandbox aktif.'
      });
      return;
    }
    const cleaned = labTableInput.trim() || DEFAULT_LAB_TEST_TABLE;
    setLabTableInput(cleaned);
    setSupabaseConfig({ labTestTable: cleaned });
    await handleRunSupabaseSync();
  };

  const handleCopySchema = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_LAB_TEST_SQL_SCHEMA);
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2500);
    } catch {
      setSyncToast({
        type: 'warning',
        message: 'Gagal menyalin otomatis. Silakan blok dan salin teks SQL secara manual.'
      });
    }
  };

  const activeStaffOptions = useMemo(() => {
    return staffList.filter((s) => s.status !== 'Non-Aktif');
  }, [staffList]);

  const defaultAnalyst = useMemo(() => {
    const nurseOrAnalyst = activeStaffOptions.find(
      (s) =>
        s.role === 'Perawat / Bidan' ||
        s.role === 'Perawat / Nakes Lapangan' ||
        s.role === 'Apoteker'
    );
    return nurseOrAnalyst?.name || activeStaffOptions[0]?.name || 'Analis Latisha Farma';
  }, [activeStaffOptions]);

  // Form input state
  const [selectedRmId, setSelectedRmId] = useState('');
  const [customPatientName, setCustomPatientName] = useState('');
  const [customPatientNik, setCustomPatientNik] = useState('');
  const [customPatientAge, setCustomPatientAge] = useState<number>(30);
  const [customPatientGender, setCustomPatientGender] = useState<'Laki-laki' | 'Perempuan'>('Laki-laki');
  const [examDate, setExamDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [examTime, setExamTime] = useState(() => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
  const [doctorName, setDoctorName] = useState(doctors[0]?.name || 'dr. Anis Prima Dewi');
  const [analystName, setAnalystName] = useState('');
  const [clinicalDiagnosis, setClinicalDiagnosis] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [cost, setCost] = useState<number>(0);

  // Manual input mode & Autocomplete state for patient name
  const [isManualPatientInput, setIsManualPatientInput] = useState(false);
  const [showPatientAutocomplete, setShowPatientAutocomplete] = useState(false);

  // Search/Filter registered patient inside Lab Document Form Modal
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [remoteLabPatients, setRemoteLabPatients] = useState<Patient[]>([]);

  useEffect(() => {
    const clean = patientSearchQuery.trim();
    if (isManualPatientInput || clean.length < 2 || isDemoMode()) {
      setRemoteLabPatients([]);
      return;
    }
    const cfg = getSupabaseConfig();
    if (!cfg.url || !cfg.key) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchPatientsPaginatedFromSupabase({
        page: 1,
        pageSize: 20,
        searchQuery: clean
      }).then((res) => {
        if (!cancelled && res.data) {
          setRemoteLabPatients(res.data);
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [patientSearchQuery, isManualPatientInput]);

  const filteredRegisteredPatients = useMemo(() => {
    const q = patientSearchQuery.toLowerCase().trim();
    if (!q) return patients.slice(0, 25);
    const localMatches: Patient[] = [];
    for (const p of patients) {
      if (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.noRm || '').toLowerCase().includes(q) ||
        (p.nik && p.nik.includes(q))
      ) {
        localMatches.push(p);
        if (localMatches.length >= 25 && remoteLabPatients.length === 0) break;
      }
    }
    if (remoteLabPatients.length === 0) {
      return localMatches.slice(0, 25);
    }
    return deduplicatePatients([...remoteLabPatients, ...localMatches]).slice(0, 25);
  }, [patients, remoteLabPatients, patientSearchQuery]);

  // Multi-parameter list in form
  const [testItems, setTestItems] = useState<LabTestItem[]>([
    {
      id: `ITEM-1`,
      parameter: 'Gula Darah Sewaktu (GDS)',
      result: '110',
      unit: 'mg/dL',
      referenceRange: '70 - 200',
      status: 'Normal',
      notes: '',
      price: 20000,
      productId: '',
      productName: '',
      productQty: 1,
      productUnit: '',
      productUnitPrice: 0
    }
  ]);

  // Anchored searchable dropdown states for Rincian Parameter (Parameter Uji & Master Data Produk)
  const [activeParamDropdown, setActiveParamDropdown] = useState<{
    rowId: string;
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  } | null>(null);

  const [activeProductDropdown, setActiveProductDropdown] = useState<{
    rowId: string;
    top: number;
    left: number;
    width: number;
    openUp: boolean;
    query: string;
  } | null>(null);

  const [activeAnalystDropdown, setActiveAnalystDropdown] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
    showAll: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isFormModalOpen) {
      setActiveParamDropdown(null);
      setActiveProductDropdown(null);
      setActiveAnalystDropdown(null);
    }
  }, [isFormModalOpen]);

  const computeDropdownRect = (el: HTMLElement, minWidth: number) => {
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 240 && rect.top > 240;
    const width = Math.max(rect.width, minWidth);
    const maxLeft = Math.max(8, window.innerWidth - width - 12);
    return {
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(rect.left, maxLeft),
      width,
      openUp
    };
  };

  const filteredClinicalParams = useMemo(() => {
    if (!activeParamDropdown) return CLINICAL_STANDARDS;
    const activeRow = testItems.find((i) => i.id === activeParamDropdown.rowId);
    const q = (activeRow?.parameter || '').toLowerCase().trim();
    if (!q) return CLINICAL_STANDARDS;
    return CLINICAL_STANDARDS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [activeParamDropdown, testItems]);

  const filteredLabProducts = useMemo(() => {
    if (!activeProductDropdown) return [];
    const q = activeProductDropdown.query.toLowerCase().trim();
    if (!q) return medicines.slice(0, 30);
    return medicines
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.barcode || '').toLowerCase().includes(q) ||
          (m.category || '').toLowerCase().includes(q) ||
          (m.kelas || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [activeProductDropdown, medicines]);

  const filteredAnalystOptions = useMemo(() => {
    if (!activeAnalystDropdown) return [];
    if (activeAnalystDropdown.showAll) return activeStaffOptions;
    const q = analystName.toLowerCase().trim();
    if (!q) return activeStaffOptions;
    return activeStaffOptions.filter(
      (st) =>
        st.name.toLowerCase().includes(q) ||
        (st.role || '').toLowerCase().includes(q)
    );
  }, [activeAnalystDropdown, activeStaffOptions, analystName]);

  // Synchronize test items reference ranges and evaluate status whenever gender changes
  const updateTestItemsForGender = (gender: 'Laki-laki' | 'Perempuan', currentItems?: LabTestItem[]) => {
    const targetItems = currentItems || testItems;
    const updated = targetItems.map((item) => {
      const std = findClinicalStandard(item.parameter);
      if (std) {
        const newRange = gender === 'Perempuan' ? std.rangeFemale : std.rangeMale;
        const newStatus = evaluateLabResultStatus(item.parameter, item.result, gender, newRange);
        return {
          ...item,
          referenceRange: newRange,
          unit: std.unit,
          status: newStatus
        };
      }
      // If not in clinical standards, re-evaluate with existing range
      const newStatus = evaluateLabResultStatus(item.parameter, item.result, gender, item.referenceRange);
      return {
        ...item,
        status: newStatus
      };
    });
    setTestItems(updated);
  };

  // Handle explicit gender change in the form
  const handleGenderChange = (newGender: 'Laki-laki' | 'Perempuan') => {
    setCustomPatientGender(newGender);
    updateTestItemsForGender(newGender);
  };

  // Open Create Form Modal (Bersihkan semua kolom kecuali tanggal dan jam)
  const handleOpenCreateModal = () => {
    setFormError(null);
    setEditingRecord(null);
    setPatientSearchQuery('');
    setSelectedRmId('');
    setCustomPatientName('');
    setCustomPatientNik('');
    setCustomPatientAge(30);
    setCustomPatientGender('Laki-laki');
    setIsManualPatientInput(false);
    setShowPatientAutocomplete(false);
    
    // Tanggal dan jam tetap dipertahankan
    setExamDate(new Date().toISOString().split('T')[0]);
    setExamTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    
    setDoctorName(doctors[0]?.name || 'dr. Anis Prima Dewi');
    setAnalystName(''); // Bersihkan kolom petugas/analis ketika form baru
    setClinicalDiagnosis('');
    setConclusion('');
    setCost(0);
    
    // Kosongkan parameter tes saat pertama kali buka form
    setTestItems([]);
    setIsFormModalOpen(true);
  };

  // Open Edit Form Modal
  const handleOpenEditModal = (rec: LabTestRecord) => {
    setFormError(null);
    setEditingRecord(rec);
    setPatientSearchQuery('');
    setSelectedRmId(rec.rmId);
    setCustomPatientName(rec.patientName);
    setCustomPatientNik(rec.nik || '');
    setCustomPatientAge(rec.age || 30);
    const recGender: 'Laki-laki' | 'Perempuan' = rec.gender || 'Laki-laki';
    setCustomPatientGender(recGender);
    setExamDate(rec.date);
    setExamTime(rec.time);
    setDoctorName(rec.doctorName || doctors[0]?.name || 'dr. Anis Prima Dewi');
    setAnalystName(rec.analystName);
    setClinicalDiagnosis(rec.clinicalDiagnosis || '');
    setConclusion(rec.conclusion || '');
    setCost(rec.cost || 0);
    setTestItems(
      rec.items.length > 0
        ? rec.items.map((it) => {
            const syncedStatus =
              it.result && it.result.trim() !== ''
                ? evaluateLabResultStatus(it.parameter, it.result, recGender, it.referenceRange)
                : it.status || 'Normal';
            return {
              ...it,
              status: syncedStatus,
              productQty: it.productId ? Math.max(1, Number(it.productQty) || 1) : it.productQty
            };
          })
        : []
    );
    setActiveParamDropdown(null);
    setActiveProductDropdown(null);
    setActiveAnalystDropdown(null);
    setIsFormModalOpen(true);
  };

  // Handle patient dropdown change (Mengambil nama dan data dari data master pasien)
  const handlePatientSelectChange = (rmId: string) => {
    setSelectedRmId(rmId);
    const p = patients.find((item) => item.id === rmId || item.nik === rmId);
    if (p) {
      setCustomPatientName(p.name);
      setCustomPatientNik(p.nik);
      setCustomPatientAge(p.age);
      setCustomPatientGender(p.gender);
      updateTestItemsForGender(p.gender);
    } else {
      setCustomPatientName('');
      setCustomPatientNik('');
    }
  };

  // Add parameter row (kosongkan satuan/rujukan sampai parameter dipilih agar 100% sinkron dengan standar/template)
  const handleAddParamRow = () => {
    setTestItems((prev) => [
      ...prev,
      {
        id: `ITEM-${Date.now()}-${prev.length + 1}`,
        parameter: '',
        result: '',
        unit: '',
        referenceRange: '',
        status: 'Normal',
        notes: '',
        price: 0,
        productId: '',
        productName: '',
        productQty: 1,
        productUnit: '',
        productUnitPrice: 0
      }
    ]);
  };

  // Remove parameter row and update total cost
  const handleRemoveParamRow = (id: string) => {
    setTestItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const sum = next.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
      setCost(sum);
      return next;
    });
    if (activeParamDropdown?.rowId === id) setActiveParamDropdown(null);
    if (activeProductDropdown?.rowId === id) setActiveProductDropdown(null);
  };

  // Pilih parameter klinis standar dari dropdown agar Nama, Satuan, Nilai Rujukan, & Interpretasi 100% sinkron dengan template paket
  const handleSelectStandardParam = (rowId: string, std: ClinicalStandard) => {
    const newRange = customPatientGender === 'Perempuan' ? std.rangeFemale : std.rangeMale;
    setTestItems((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;
        return {
          ...item,
          parameter: std.name,
          unit: std.unit,
          referenceRange: newRange,
          status: evaluateLabResultStatus(std.name, item.result, customPatientGender, newRange)
        };
      })
    );
    setActiveParamDropdown(null);
  };

  // Pilih atau hapus produk Master Data Produk pada baris parameter (otomatis isi Harga = sellPrice * QTY & total biaya)
  const handleSelectProductForRow = (rowId: string, med: Medicine | null) => {
    setTestItems((prev) => {
      const next = prev.map((item) => {
        if (item.id !== rowId) return item;
        if (!med) {
          return {
            ...item,
            productId: '',
            productName: '',
            productQty: 1,
            productUnit: '',
            productUnitPrice: 0,
            price: 0
          };
        }
        const qty = Math.max(1, Number(item.productQty) || 1);
        const unitPrice = Number(med.sellPriceKlinik) || Number(med.sellPrice) || 0;
        return {
          ...item,
          productId: med.id,
          productName: med.name,
          productQty: qty,
          productUnit: med.satuanKecil || med.unit || 'Pcs',
          productUnitPrice: unitPrice,
          price: unitPrice * qty
        };
      });
      const sum = next.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
      setCost(sum);
      return next;
    });
    setActiveProductDropdown(null);
  };

  // Update single parameter row with auto clinical standard lookup, gender evaluator, QTY & price summation
  const handleUpdateParamRow = (id: string, field: keyof LabTestItem, val: any) => {
    setTestItems((prev) => {
      let shouldRecalcCost = false;
      const next = prev.map((item) => {
        if (item.id === id) {
          const updated: LabTestItem = { ...item };
          if (field === 'price') {
            const parsed = val === '' ? 0 : parseFloat(String(val)) || 0;
            updated.price = Math.max(0, parsed);
            shouldRecalcCost = true;
          } else if (field === 'productQty') {
            const parsedQty = val === '' ? 1 : Math.max(1, parseInt(String(val), 10) || 1);
            updated.productQty = parsedQty;
            if (updated.productId) {
              const matchedMed = medicines.find((m) => m.id === updated.productId);
              const unitPrice = matchedMed
                ? Number(matchedMed.sellPriceKlinik) || Number(matchedMed.sellPrice) || 0
                : Number(updated.productUnitPrice) || 0;
              updated.productUnitPrice = unitPrice;
              updated.price = unitPrice * parsedQty;
              shouldRecalcCost = true;
            }
          } else {
            (updated as any)[field] = val;
          }

          // Jika nama parameter berubah: sinkronkan otomatis Satuan, Nilai Rujukan (L)/(P), dan Interpretasi dengan standar template paket
          if (field === 'parameter') {
            const std = findClinicalStandard(String(val));
            if (std) {
              updated.unit = std.unit;
              updated.referenceRange =
                customPatientGender === 'Perempuan' ? std.rangeFemale : std.rangeMale;
              updated.status = evaluateLabResultStatus(
                std.name,
                updated.result,
                customPatientGender,
                updated.referenceRange
              );
            } else if (updated.result) {
              updated.status = evaluateLabResultStatus(
                String(val),
                updated.result,
                customPatientGender,
                updated.referenceRange
              );
            }
          }

          // Jika nilai hasil berubah: evaluasi interpretasi langsung terhadap Nilai Rujukan aktif
          if (field === 'result') {
            updated.status = evaluateLabResultStatus(
              updated.parameter,
              String(val),
              customPatientGender,
              updated.referenceRange
            );
          }

          // Jika nilai rujukan diubah manual: evaluasi ulang interpretasi agar selalu sinkron
          if (field === 'referenceRange') {
            updated.status = evaluateLabResultStatus(
              updated.parameter,
              updated.result,
              customPatientGender,
              String(val)
            );
          }

          return updated;
        }
        return item;
      });

      if (shouldRecalcCost) {
        const sum = next.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
        setCost(sum);
      }

      return next;
    });
  };

  // Current templates adapted to the selected gender
  const currentTemplates = useMemo(() => {
    return getGenderAdjustedTemplates(customPatientGender);
  }, [customPatientGender]);

  // Apply template with default prices and update total cost automatically
  const handleApplyTemplate = (tmpl: ReturnType<typeof getGenderAdjustedTemplates>[0]) => {
    const newItems: LabTestItem[] = tmpl.items.map((it, idx) => ({
      id: `ITEM-${Date.now()}-${idx}-${Math.random().toString().slice(2, 6)}`,
      parameter: it.parameter,
      result: '',
      unit: it.unit,
      referenceRange: it.referenceRange,
      status: 'Normal',
      notes: '',
      price: 20000,
      productId: '',
      productName: '',
      productQty: 1,
      productUnit: '',
      productUnitPrice: 0
    }));

    setTestItems((prev) => {
      const next = [...prev, ...newItems];
      const sum = next.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
      setCost(sum);
      return next;
    });
  };

  // Save Record
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!customPatientName.trim()) {
      setFormError('Nama pasien wajib diisi.');
      return;
    }
    if (testItems.length === 0) {
      setFormError('Dokumen cek lab harus memuat minimal 1 parameter uji.');
      return;
    }

    if (editingRecord) {
      // Update
      const updated: LabTestRecord = {
        ...editingRecord,
        rmId: selectedRmId || editingRecord.rmId,
        patientName: customPatientName,
        nik: customPatientNik,
        age: customPatientAge,
        gender: customPatientGender,
        date: examDate,
        time: examTime,
        doctorName,
        analystName: analystName || defaultAnalyst,
        clinicalDiagnosis,
        items: testItems,
        conclusion,
        cost
      };
      onUpdateLabRecord(updated);
      setSyncToast({
        type: 'success',
        message: isDemoSandbox
          ? `Dokumen lab #${updated.id} diperbarui di Mode Demo Sandbox (terisolasi lokal).`
          : `Dokumen lab #${updated.id} diperbarui & disinkronkan ke Supabase.`
      });
    } else {
      // Create New
      const newRec: LabTestRecord = {
        id: `LAB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
        rmId: selectedRmId || `RM-${Math.floor(100 + Math.random() * 900)}`,
        patientName: customPatientName,
        nik: customPatientNik,
        age: customPatientAge,
        gender: customPatientGender,
        date: examDate,
        time: examTime,
        doctorName,
        analystName: analystName || defaultAnalyst,
        clinicalDiagnosis,
        items: testItems,
        conclusion,
        cost
      };
      onAddLabRecord(newRec);
      setSyncToast({
        type: 'success',
        message: isDemoSandbox
          ? `Dokumen lab baru #${newRec.id} disimpan di Mode Demo Sandbox (terisolasi lokal).`
          : `Dokumen lab baru #${newRec.id} disimpan & disinkronkan ke Supabase.`
      });
    }

    setIsFormModalOpen(false);
  };

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return labRecords.filter((rec) => {
      const matchSearch =
        rec.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.rmId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (rec.doctorName && rec.doctorName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        rec.items.some((i) => i.parameter.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchStatus = true;
      const hasAbnormal = rec.items.some((i) => i.status === 'Tinggi' || i.status === 'Rendah' || i.status === 'Kritis');
      if (statusFilter === 'ABNORMAL') matchStatus = hasAbnormal;
      if (statusFilter === 'NORMAL') matchStatus = !hasAbnormal;

      return matchSearch && matchStatus;
    });
  }, [labRecords, searchQuery, statusFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const totalDocs = labRecords.length;
    const thisMonth = new Date().toISOString().slice(0, 7);
    const thisMonthDocs = labRecords.filter((r) => r.date.startsWith(thisMonth)).length;
    let totalParams = 0;
    let abnormalParams = 0;

    labRecords.forEach((r) => {
      totalParams += r.items.length;
      abnormalParams += r.items.filter((i) => i.status !== 'Normal').length;
    });

    return {
      totalDocs,
      thisMonthDocs,
      totalParams,
      abnormalParams
    };
  }, [labRecords]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-md border border-purple-800/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-purple-300 font-extrabold text-xs uppercase tracking-wider">
            <FlaskConical className="w-4 h-4 text-purple-400" />
            <span>Modul Pelayanan Dokter & Laboratorium Klinik</span>
            {isDemoSandbox ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] font-bold normal-case tracking-normal">
                <Database className="w-3 h-3" />
                Mode Demo Sandbox
              </span>
            ) : needsTableSetup ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-300/40 text-rose-200 text-[10px] font-bold normal-case tracking-normal">
                <AlertCircle className="w-3 h-3" />
                Tabel Supabase Perlu Setup
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-300/40 text-emerald-200 text-[10px] font-bold normal-case tracking-normal">
                <CheckCircle2 className="w-3 h-3" />
                Supabase Live: {labTableInput}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Pemeriksaan & Cek Lab (POCT)
          </h1>
          <p className="text-xs text-purple-200/80 max-w-2xl">
            Pencatatan hasil diagnostik laboratorium terpadu (Gula Darah, Profil Lipid, Asam Urat, Hematologi, Urin). Terintegrasi otomatis ke ruang periksa dokter (SOAP Kolom Objektif) &amp; tersinkron 2-arah ke Supabase.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSyncSupabase && (
            <button
              type="button"
              onClick={handleRunSupabaseSync}
              disabled={isSyncing}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white border border-white/20 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
            </button>
          )}

          {isOwnerAdmin && (
            <button
              type="button"
              onClick={() => setShowSchemaModal(true)}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Skema SQL</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Dokumen Cek Lab</span>
          </button>
        </div>
      </div>

      {/* Demo Mode Isolation Notice */}
      {isDemoSandbox && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
          <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Isolasi Mode Demo / Sandbox Aktif</p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Seluruh dokumen Pemeriksaan &amp; Cek Lab pada sesi ini disimpan secara lokal di sandbox demo dan tidak pernah membaca atau menulis ke database Supabase produksi.
            </p>
          </div>
        </div>
      )}

      {/* Table Setup Warning (APJ / Owner Only) */}
      {isOwnerAdmin && needsTableSetup && !isDemoSandbox && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Tabel Supabase &ldquo;{labTableInput}&rdquo; belum dibuat:
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Salin dan jalankan skrip SQL di Dashboard Supabase agar seluruh hasil pemeriksaan &amp; cek lab tersinkronisasi 2-arah secara real-time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSchemaModal(true)}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shrink-0 cursor-pointer"
          >
            Buka Skema SQL Setup
          </button>
        </div>
      )}

      {/* Dismissible Inline Toast */}
      {syncToast && (
        <div
          className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            syncToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : syncToast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{syncToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 shrink-0 cursor-pointer"
            aria-label="Tutup notifikasi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">Total Dokumen Lab</span>
            <strong className="text-xl font-black text-slate-900">{metrics.totalDocs}</strong>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">Pemeriksaan Bulan Ini</span>
            <strong className="text-xl font-black text-slate-900">{metrics.thisMonthDocs}</strong>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">Total Parameter Uji</span>
            <strong className="text-xl font-black text-slate-900">{metrics.totalParams}</strong>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">Parameter Abnormal</span>
            <strong className="text-xl font-black text-amber-700">{metrics.abnormalParams}</strong>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari pasien, No. RM, atau parameter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-bold text-slate-500">Filter Status:</span>
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'ALL' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStatusFilter('ABNORMAL')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'ABNORMAL' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Ada Abnormal
            </button>
            <button
              onClick={() => setStatusFilter('NORMAL')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'NORMAL' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Semua Normal
            </button>
          </div>
        </div>
      </div>

      {/* Table of Lab Test Records */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="p-3.5">No. Lab / Waktu</th>
                <th className="p-3.5">Pasien & No. RM</th>
                <th className="p-3.5">Dokter / Analis</th>
                <th className="p-3.5">Parameter Diperiksa</th>
                <th className="p-3.5">Kesimpulan Klinis</th>
                <th className="p-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <FlaskConical className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-slate-600 text-sm">Belum ada dokumen hasil laboratorium.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Klik tombol "+ Tambah Dokumen Cek Lab" untuk mencatat hasil tes pasien.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 align-top">
                        <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          {rec.id}
                        </span>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1 font-mono">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{rec.date}</span>
                          <span className="text-slate-300">·</span>
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{rec.time} WIB</span>
                        </div>
                      </td>

                      <td className="p-3.5 align-top">
                        <strong className="text-slate-900 text-sm block">{rec.patientName}</strong>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {rec.rmId} · {rec.age} th · {rec.gender}
                        </div>
                      </td>

                      <td className="p-3.5 align-top">
                        <div className="text-slate-800 font-bold">{rec.doctorName || '-'}</div>
                        <div className="text-[11px] text-slate-500">Analis: {rec.analystName}</div>
                      </td>

                      <td className="p-3.5 align-top max-w-xs">
                        <div className="flex flex-wrap gap-1.5">
                          {rec.items.map((item, idx) => {
                            const isHigh = item.status === 'Tinggi' || item.status === 'Kritis';
                            const isLow = item.status === 'Rendah';
                            return (
                              <span
                                key={idx}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono ${
                                  isHigh
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : isLow
                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {item.parameter}: {item.result} {item.unit}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      <td className="p-3.5 align-top max-w-xs">
                        <p className="text-slate-700 text-xs italic leading-snug line-clamp-2">
                          "{rec.conclusion || 'Tidak ada catatan kesimpulan'}"
                        </p>
                      </td>

                      <td className="p-3.5 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Print / Preview */}
                          <button
                            onClick={() => setPrintRecord(rec)}
                            className="p-1.5 bg-slate-100 hover:bg-purple-100 text-slate-600 hover:text-purple-700 rounded-lg transition"
                            title="Cetak Surat Hasil Lab Resmi"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => handleOpenEditModal(rec)}
                            className="p-1.5 bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 rounded-lg transition"
                            title="Edit Data Lab"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setRecordToDelete(rec)}
                            className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 rounded-lg transition"
                            title="Hapus Data Lab"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL FORM INPUT / EDIT HASIL LAB (MULTI-PARAMETER) ================= */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-4 z-50 overflow-y-auto"
          onScroll={() => {
            setActiveParamDropdown(null);
            setActiveProductDropdown(null);
            setActiveAnalystDropdown(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-7xl w-full p-6 shadow-2xl my-6 space-y-5 border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingRecord ? 'Edit Dokumen Hasil Laboratorium' : 'Formulir Hasil Cek Laboratorium Baru'}
                  </h3>
                  <span className="text-xs text-slate-500">
                    Input multi-parameter diagnostik dalam 1 dokumen resmi
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveForm} className="space-y-5 text-xs">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Section 1: Pasien & Petugas */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <span className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider block">
                  1. Informasi Pasien & Pemeriksa
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700">Nama Pasien *</label>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-purple-700 cursor-pointer select-none bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                        <input
                          type="checkbox"
                          checked={isManualPatientInput}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIsManualPatientInput(checked);
                            if (checked) {
                              setShowPatientAutocomplete(false);
                            }
                          }}
                          className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer"
                        />
                        <span>Input Manual Nama</span>
                      </label>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder={isManualPatientInput ? "Ketik nama pasien manual..." : "Ketik nama / No. RM pasien terdaftar..."}
                        value={customPatientName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomPatientName(val);
                          if (!isManualPatientInput) {
                            setPatientSearchQuery(val);
                            setShowPatientAutocomplete(true);
                          }
                        }}
                        onFocus={() => {
                          if (!isManualPatientInput) {
                            setShowPatientAutocomplete(true);
                          }
                        }}
                        className="w-full pl-8 pr-3 py-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <User className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
                    </div>

                    {/* Autocomplete Dropdown */}
                    {!isManualPatientInput && showPatientAutocomplete && patientSearchQuery.trim().length > 0 && filteredRegisteredPatients.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 max-h-52 overflow-y-auto z-50 divide-y divide-slate-100">
                        {filteredRegisteredPatients.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedRmId(p.id);
                              setCustomPatientName(p.name);
                              setCustomPatientNik(p.nik || '');
                              setCustomPatientAge(p.age || 30);
                              setCustomPatientGender(p.gender);
                              updateTestItemsForGender(p.gender);
                              setShowPatientAutocomplete(false);
                              setPatientSearchQuery('');
                            }}
                            className="p-2.5 hover:bg-purple-50 cursor-pointer transition flex items-center justify-between text-xs"
                          >
                            <div>
                              <strong className="text-slate-900 block">{p.name}</strong>
                              <span className="text-[10px] text-slate-500 font-mono">RM: {p.id} · NIK: {p.nik || '-'}</span>
                            </div>
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                              {p.gender}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">No. Rekam Medis (RM)</label>
                    <input
                      type="text"
                      value={selectedRmId}
                      onChange={(e) => setSelectedRmId(e.target.value)}
                      className="w-full p-2.5 border rounded-xl font-mono bg-white font-bold"
                      placeholder="RM-001 (Opsional untuk manual)..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Usia (Tahun)</label>
                    <input
                      type="number"
                      value={customPatientAge}
                      onChange={(e) => setCustomPatientAge(parseInt(e.target.value) || 0)}
                      className="w-full p-2 border rounded-xl font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Jenis Kelamin <span className="text-[10px] text-purple-600 font-mono">((P)/(L))</span>
                    </label>
                    <select
                      value={customPatientGender}
                      onChange={(e) => handleGenderChange(e.target.value as any)}
                      className="w-full p-2 border rounded-xl bg-white font-bold text-slate-800"
                    >
                      <option value="Laki-laki">Laki-laki (L)</option>
                      <option value="Perempuan">Perempuan (P)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tanggal Periksa</label>
                    <input
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                      className="w-full p-2 border rounded-xl font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Jam</label>
                    <input
                      type="text"
                      value={examTime}
                      onChange={(e) => setExamTime(e.target.value)}
                      className="w-full p-2 border rounded-xl font-mono bg-white"
                      placeholder="09:30"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Dokter Pengirim</label>
                    <select
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      className="w-full p-2 border rounded-xl bg-white"
                    >
                      {doctors.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Preset Paket Lab Cepat dengan Standar Gender Otomatis */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>Template Paket Parameter Klinis:</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                        customPatientGender === 'Perempuan'
                          ? 'bg-pink-100 text-pink-700 border border-pink-200'
                          : 'bg-blue-100 text-blue-700 border border-blue-200'
                      }`}
                    >
                      Standar Nilai Rujukan: {customPatientGender === 'Perempuan' ? '(P)erempuan' : '(L)aki-laki'}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500">Klik paket untuk tambah baris otomatis</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {currentTemplates.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      type="button"
                      onClick={() => handleApplyTemplate(tmpl)}
                      className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-bold text-[11px] border border-purple-200 transition flex items-center gap-1"
                      title={tmpl.description}
                    >
                      <Plus className="w-3 h-3" />
                      <span>{tmpl.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Multi-Parameter Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider">
                    2. Rincian Parameter Pemeriksaan ({testItems.length} Parameter)
                  </span>

                  <button
                    type="button"
                    onClick={handleAddParamRow}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Baris Parameter</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-xs">
                  <table className="w-full min-w-[1040px] text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 border-b text-slate-600 font-bold uppercase text-[10px]">
                        <th className="p-2.5 min-w-[190px]">Nama Parameter / Uji *</th>
                        <th className="p-2.5 min-w-[190px]">Nama Produk (Master Data)</th>
                        <th className="p-2.5 w-16 text-center">QTY</th>
                        <th className="p-2.5 w-24">Nilai Hasil *</th>
                        <th className="p-2.5 w-20">Satuan</th>
                        <th className="p-2.5 w-32">
                          <div className="flex items-center gap-1.5">
                            <span>Nilai Rujukan</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-black ${
                                customPatientGender === 'Perempuan'
                                  ? 'bg-pink-100 text-pink-700 border border-pink-300'
                                  : 'bg-blue-100 text-blue-700 border border-blue-300'
                              }`}
                              title={`Nilai rujukan klinis disinkronkan otomatis untuk ${customPatientGender}`}
                            >
                              {customPatientGender === 'Perempuan' ? '(P)' : '(L)'}
                            </span>
                          </div>
                        </th>
                        <th className="p-2.5 w-28">Interpretasi</th>
                        <th className="p-2.5 min-w-[110px]">Catatan</th>
                        <th className="p-2.5 w-28 text-right" title="Mengambil Harga Jual Klinik dari Master Data Produk × QTY">Harga (Rp)</th>
                        <th className="p-2.5 w-10 text-center">Hapus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {testItems.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-5 text-center text-slate-400 text-xs">
                            Belum ada parameter uji. Klik <strong>Template Paket Parameter Klinis</strong> di atas atau tombol <strong>+ Tambah Baris Parameter</strong>.
                          </td>
                        </tr>
                      ) : (
                        testItems.map((item) => {
                          const isEditingProduct = activeProductDropdown?.rowId === item.id;
                          const productInputValue = isEditingProduct
                            ? activeProductDropdown.query
                            : item.productName || '';
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/50 align-middle">
                              <td className="p-2">
                                <input
                                  type="text"
                                  required
                                  placeholder="Pilih / ketik parameter (GDS, AU, Hb...)"
                                  value={item.parameter}
                                  onFocus={(e) => {
                                    setActiveProductDropdown(null);
                                    const rect = computeDropdownRect(e.currentTarget, 290);
                                    setActiveParamDropdown({ rowId: item.id, ...rect });
                                  }}
                                  onChange={(e) => {
                                    handleUpdateParamRow(item.id, 'parameter', e.target.value);
                                    const rect = computeDropdownRect(e.currentTarget, 290);
                                    setActiveParamDropdown({ rowId: item.id, ...rect });
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      setActiveParamDropdown((curr) =>
                                        curr?.rowId === item.id ? null : curr
                                      );
                                    }, 160);
                                  }}
                                  className="w-full p-1.5 border border-slate-300 rounded-lg font-bold bg-white focus:ring-1 focus:ring-purple-500 outline-none"
                                />
                              </td>
                              <td className="p-2">
                                <div className="relative flex items-center">
                                  <input
                                    type="text"
                                    placeholder="Cari produk (Strip/Reagen)..."
                                    value={productInputValue}
                                    onFocus={(e) => {
                                      setActiveParamDropdown(null);
                                      const rect = computeDropdownRect(e.currentTarget, 310);
                                      setActiveProductDropdown({
                                        rowId: item.id,
                                        query: item.productName || '',
                                        ...rect
                                      });
                                    }}
                                    onChange={(e) => {
                                      const q = e.target.value;
                                      const rect = computeDropdownRect(e.currentTarget, 310);
                                      setActiveProductDropdown({
                                        rowId: item.id,
                                        query: q,
                                        ...rect
                                      });
                                      if (q.trim() === '' && item.productId) {
                                        handleSelectProductForRow(item.id, null);
                                      }
                                    }}
                                    onBlur={() => {
                                      setTimeout(() => {
                                        setActiveProductDropdown((curr) =>
                                          curr?.rowId === item.id ? null : curr
                                        );
                                      }, 160);
                                    }}
                                    className={`w-full p-1.5 pr-6 border rounded-lg text-xs outline-none focus:ring-1 focus:ring-purple-500 ${
                                      item.productId
                                        ? 'border-purple-300 bg-purple-50/40 font-bold text-purple-900'
                                        : 'border-slate-300 bg-white text-slate-700'
                                    }`}
                                    title={
                                      item.productId
                                        ? `${item.productName} (Rp ${(item.productUnitPrice || 0).toLocaleString('id-ID')}/${item.productUnit || 'Pcs'}) - Stok dipotong otomatis saat POS selesai`
                                        : 'Pilih produk dari Master Data Produk untuk isi harga & potong stok otomatis saat POS selesai'
                                    }
                                  />
                                  {item.productId && (
                                    <button
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelectProductForRow(item.id, null);
                                      }}
                                      className="absolute right-1.5 text-slate-400 hover:text-rose-600 p-0.5 rounded"
                                      title="Hapus pilihan produk"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={item.productQty ?? 1}
                                  onChange={(e) =>
                                    handleUpdateParamRow(item.id, 'productQty', e.target.value)
                                  }
                                  className={`w-full p-1.5 border rounded-lg font-mono font-bold text-center outline-none focus:ring-1 focus:ring-purple-500 ${
                                    item.productId
                                      ? 'border-purple-300 bg-white text-purple-800'
                                      : 'border-slate-200 bg-slate-50 text-slate-500'
                                  }`}
                                  title="Jumlah pemakaian produk (mengalikan harga produk & mengurangi stok saat POS selesai)"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  required
                                  placeholder="Hasil..."
                                  value={item.result}
                                  onChange={(e) =>
                                    handleUpdateParamRow(item.id, 'result', e.target.value)
                                  }
                                  className="w-full p-1.5 border border-slate-300 rounded-lg font-mono font-extrabold text-purple-700 bg-white focus:ring-1 focus:ring-purple-500 outline-none"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  placeholder="mg/dL"
                                  value={item.unit}
                                  onChange={(e) =>
                                    handleUpdateParamRow(item.id, 'unit', e.target.value)
                                  }
                                  className="w-full p-1.5 border border-slate-300 rounded-lg font-mono bg-white"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  placeholder="70 - 200"
                                  value={item.referenceRange}
                                  onChange={(e) =>
                                    handleUpdateParamRow(item.id, 'referenceRange', e.target.value)
                                  }
                                  className="w-full p-1.5 border border-slate-300 rounded-lg font-mono bg-white"
                                />
                              </td>
                              <td className="p-2">
                                <select
                                  value={item.status}
                                  onChange={(e) =>
                                    handleUpdateParamRow(item.id, 'status', e.target.value as any)
                                  }
                                  className={`w-full p-1.5 border rounded-lg font-bold ${
                                    item.status === 'Tinggi' ||
                                    item.status === 'Kritis' ||
                                    item.status === 'Abnormal'
                                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                                      : item.status === 'Rendah'
                                      ? 'bg-sky-50 text-sky-700 border-sky-300'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  }`}
                                >
                                  <option value="Normal">Normal</option>
                                  <option value="Tinggi">Tinggi</option>
                                  <option value="Rendah">Rendah</option>
                                  <option value="Kritis">Kritis</option>
                                  <option value="Abnormal">Abnormal</option>
                                </select>
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  placeholder="Catatan..."
                                  value={item.notes || ''}
                                  onChange={(e) =>
                                    handleUpdateParamRow(item.id, 'notes', e.target.value)
                                  }
                                  className="w-full p-1.5 border border-slate-300 rounded-lg text-slate-600 bg-white"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={item.price !== undefined && item.price !== null ? item.price : ''}
                                  onChange={(e) =>
                                    handleUpdateParamRow(item.id, 'price', e.target.value)
                                  }
                                  className="w-full p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-right text-slate-800 bg-white focus:ring-1 focus:ring-purple-500"
                                  title="Terisi otomatis dari Harga Jual Klinik Master Data Produk × QTY (dapat diedit manual)"
                                />
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveParamRow(item.id)}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                                  title="Hapus baris"
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

                {/* Anchored Floating Searchable Dropdown: Parameter Uji Standar (sinkron template paket) */}
                {activeParamDropdown && filteredClinicalParams.length > 0 && (
                  <div
                    style={{
                      position: 'fixed',
                      top: activeParamDropdown.openUp ? undefined : activeParamDropdown.top,
                      bottom: activeParamDropdown.openUp
                        ? window.innerHeight - activeParamDropdown.top
                        : undefined,
                      left: activeParamDropdown.left,
                      width: activeParamDropdown.width
                    }}
                    className="z-[80] bg-white rounded-xl shadow-2xl border border-slate-200 max-h-60 overflow-y-auto divide-y divide-slate-100"
                  >
                    {filteredClinicalParams.map((std) => {
                      const stdRange =
                        customPatientGender === 'Perempuan' ? std.rangeFemale : std.rangeMale;
                      return (
                        <button
                          key={std.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectStandardParam(activeParamDropdown.rowId, std);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-purple-50 transition flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{std.name}</div>
                            <div className="text-[10px] text-slate-500">{std.category}</div>
                          </div>
                          <div className="text-right shrink-0 font-mono text-[10px]">
                            <div className="font-bold text-purple-700">{stdRange}</div>
                            <div className="text-slate-500">{std.unit}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Anchored Floating Searchable Dropdown: Master Data Produk */}
                {activeProductDropdown && (
                  <div
                    style={{
                      position: 'fixed',
                      top: activeProductDropdown.openUp ? undefined : activeProductDropdown.top,
                      bottom: activeProductDropdown.openUp
                        ? window.innerHeight - activeProductDropdown.top
                        : undefined,
                      left: activeProductDropdown.left,
                      width: activeProductDropdown.width
                    }}
                    className="z-[80] bg-white rounded-xl shadow-2xl border border-purple-200 max-h-64 overflow-y-auto divide-y divide-slate-100"
                  >
                    {filteredLabProducts.length === 0 ? (
                      <div className="px-3 py-3 text-center text-[11px] text-slate-400">
                        Produk tidak ditemukan di Master Data Produk.
                      </div>
                    ) : (
                      filteredLabProducts.map((med) => (
                        <button
                          key={med.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectProductForRow(activeProductDropdown.rowId, med);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-purple-50 transition flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{med.name}</div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <MedicineCategorySymbol category={med.category} size="xs" />
                              <span>· Stok:</span>{' '}
                              <span
                                className={`font-mono font-bold ${
                                  med.stock <= 0 ? 'text-rose-600' : 'text-emerald-700'
                                }`}
                              >
                                {med.stock} {med.satuanKecil || med.unit}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono text-purple-700">
                            <div className="font-extrabold text-[11px]">
                              Rp {(Number(med.sellPriceKlinik) || Number(med.sellPrice) || 0).toLocaleString('id-ID')}
                            </div>
                            <div className="text-[9px] font-sans text-slate-500">Harga Klinik</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Section 4: Kesimpulan Klinis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Kesimpulan & Catatan Hasil Laborat
                  </label>
                  <textarea
                    rows={2}
                    value={conclusion}
                    onChange={(e) => setConclusion(e.target.value)}
                    placeholder="Interpretasi menyeluruh hasil lab bagi dokter periksa..."
                    className="w-full p-2.5 border rounded-xl bg-white outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Petugas / Analis (Data Pegawai)
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={analystName}
                          placeholder="Cari pegawai atau ketik nama petugas/analis..."
                          onFocus={(e) => {
                            setActiveParamDropdown(null);
                            setActiveProductDropdown(null);
                            const rect = computeDropdownRect(e.currentTarget, 240);
                            setActiveAnalystDropdown({
                              ...rect,
                              showAll:
                                !analystName.trim() ||
                                activeStaffOptions.some((s) => s.name === analystName)
                            });
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnalystName(val);
                            const rect = computeDropdownRect(e.currentTarget, 240);
                            setActiveAnalystDropdown({
                              ...rect,
                              showAll: val.trim() === ''
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setActiveAnalystDropdown(null);
                            } else if (e.key === 'Enter' && activeAnalystDropdown && filteredAnalystOptions.length > 0) {
                              e.preventDefault();
                              setAnalystName(filteredAnalystOptions[0].name);
                              setActiveAnalystDropdown(null);
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              setActiveAnalystDropdown(null);
                            }, 160);
                          }}
                          className="w-full pl-8 pr-12 py-2 border border-slate-300 rounded-xl font-bold bg-white text-slate-800 outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                          {analystName && (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setAnalystName('');
                                const inputEl = e.currentTarget.closest('.relative')?.querySelector('input');
                                if (inputEl instanceof HTMLElement) {
                                  const rect = computeDropdownRect(inputEl, 240);
                                  setActiveAnalystDropdown({ ...rect, showAll: true });
                                }
                              }}
                              className="p-0.5 text-slate-400 hover:text-rose-600 rounded"
                              title="Bersihkan nama petugas"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>

                        {activeAnalystDropdown && activeStaffOptions.length > 0 && (
                          <div
                            style={{
                              position: 'fixed',
                              top: activeAnalystDropdown.openUp ? undefined : activeAnalystDropdown.top,
                              bottom: activeAnalystDropdown.openUp
                                ? window.innerHeight - activeAnalystDropdown.top
                                : undefined,
                              left: activeAnalystDropdown.left,
                              width: activeAnalystDropdown.width
                            }}
                            className="z-[80] bg-white rounded-xl shadow-2xl border border-slate-200 max-h-52 overflow-y-auto divide-y divide-slate-100"
                          >
                            {filteredAnalystOptions.length === 0 ? (
                              <div className="px-3 py-2.5 text-[11px] text-slate-500">
                                Tidak ditemukan di Data Pegawai. Tetap gunakan nama manual:{' '}
                                <strong className="text-purple-700">&ldquo;{analystName}&rdquo;</strong>
                              </div>
                            ) : (
                              filteredAnalystOptions.map((st) => {
                                const isSelected = st.name === analystName;
                                return (
                                  <button
                                    key={st.id}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setAnalystName(st.name);
                                      setActiveAnalystDropdown(null);
                                    }}
                                    className={`w-full text-left px-3 py-2 hover:bg-purple-50 transition flex items-center justify-between gap-2 text-xs ${
                                      isSelected ? 'bg-purple-50/70' : ''
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-900 truncate">{st.name}</div>
                                      <div className="text-[10px] text-slate-500 truncate">{st.role}</div>
                                    </div>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Biaya Pemeriksaan (Rp)</label>
                      <input
                        type="number"
                        value={cost}
                        onChange={(e) => setCost(parseInt(e.target.value) || 0)}
                        className="w-full p-2 border rounded-xl font-mono font-bold bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Datalist for autocomplete with clinical standard parameters */}
              <datalist id="clinical-params-list">
                {CLINICAL_STANDARDS.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name} ({s.unit}) · {s.category}
                  </option>
                ))}
              </datalist>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md transition flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingRecord ? 'Perbarui Dokumen Lab' : 'Simpan Dokumen Lab'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL CETAK RESMI HASIL LABORATORIUM ================= */}
      {printRecord && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-6 border border-slate-300">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <span className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-purple-600" />
                <span>Lembar Hasil Pemeriksaan Laboratorium Resmi</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    try {
                      demoSetItem('latisha_active_print_lab', JSON.stringify(printRecord));
                    } catch {}
                    openPrintWindow('hasil-lab', { labId: printRecord.id });
                  }}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak / Print PDF</span>
                </button>
                <button
                  onClick={() => setPrintRecord(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Document Sheet */}
            <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4 text-xs font-sans text-slate-900 printable-area">
              {/* Kop Klinik Terintegrasi Profil Apotek, APJ, dan DPJ */}
              <div className="border-b-2 border-slate-900 pb-3">
                <div className="flex items-center justify-between gap-4">
                  {pharmacyProfile.logoUrl ? (
                    <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                      <img
                        src={pharmacyProfile.logoUrl}
                        alt="Logo Faskes"
                        className="w-16 h-16 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-16 shrink-0" />
                  )}
                  <div className="flex-1 text-center space-y-0.5">
                    <h2 className="text-base font-black tracking-wide uppercase text-slate-900">
                      {pharmacyProfile.name}
                    </h2>
                    <p className="text-[11px] text-slate-600 font-medium">
                      {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                    </p>
                    <p className="text-[10px] text-slate-600 font-mono">
                      {[
                        pharmacyProfile.sia ? `SIA: ${pharmacyProfile.sia}` : '',
                        pharmacyProfile.nib ? `NIB: ${pharmacyProfile.nib}` : '',
                        pharmacyProfile.npwp ? `NPWP: ${pharmacyProfile.npwp}` : ''
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="w-16 shrink-0" />
                </div>
              </div>

              {/* Judul Surat */}
              <div className="text-center space-y-0.5 pt-1">
                <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 underline">
                  SURAT HASIL PEMERIKSAAN LABORATORIUM SEDERHANA (POCT)
                </h3>
                <span className="text-[10px] font-mono text-slate-500">No. Registrasi Lab: {printRecord.id}</span>
              </div>

              {/* Data Pasien & Pemeriksaan */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50/80 rounded-xl border border-slate-200 text-[11px]">
                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-24 text-slate-500">Nama Pasien</span>
                    <strong className="text-slate-900">: {printRecord.patientName}</strong>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-slate-500">No. RM</span>
                    <span className="font-mono font-bold">: {printRecord.rmId}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-slate-500">Usia / Gender</span>
                    <span>: {printRecord.age} th / {printRecord.gender}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-28 text-slate-500">Tanggal Periksa</span>
                    <span className="font-mono">: {printRecord.date} ({printRecord.time} WIB)</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-slate-500">Dokter Pengirim</span>
                    <span>: {printRecord.doctorName || dpjProfile.name}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-slate-500">Petugas Analis</span>
                    <span>: {printRecord.analystName}</span>
                  </div>
                </div>
              </div>

              {/* Tabel Hasil */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                      <th className="p-2 border-r w-8 text-center">No</th>
                      <th className="p-2 border-r">Pemeriksaan</th>
                      <th className="p-2 border-r w-24 text-center">Hasil</th>
                      <th className="p-2 border-r w-20 text-center">Satuan</th>
                      <th className="p-2 border-r w-28 text-center">Nilai Rujukan</th>
                      <th className="p-2 text-center w-24">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printRecord.items.map((it, idx) => {
                      const isHigh = it.status === 'Tinggi' || it.status === 'Kritis';
                      const isLow = it.status === 'Rendah';
                      return (
                        <tr key={idx} className={isHigh || isLow ? 'bg-amber-50/30' : ''}>
                          <td className="p-2 border-r text-center font-mono">{idx + 1}</td>
                          <td className="p-2 border-r font-bold text-slate-800">{it.parameter}</td>
                          <td className="p-2 border-r text-center font-mono font-extrabold text-slate-900">
                            {it.result}
                          </td>
                          <td className="p-2 border-r text-center font-mono text-slate-600">{it.unit}</td>
                          <td className="p-2 border-r text-center font-mono text-slate-600">
                            {it.referenceRange || '-'}
                          </td>
                          <td className="p-2 text-center font-bold">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                isHigh
                                  ? 'text-rose-700 bg-rose-100'
                                  : isLow
                                  ? 'text-sky-700 bg-sky-100'
                                  : 'text-emerald-700 bg-emerald-100'
                              }`}
                            >
                              {it.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Kesimpulan */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-extrabold text-slate-800 text-[10px] uppercase block">
                  Kesimpulan / Catatan Laboratorium:
                </span>
                <p className="text-slate-700 text-xs italic leading-relaxed">
                  "{printRecord.conclusion || 'Hasil pemeriksaan dalam batas normal.'}"
                </p>
              </div>

              {/* Tanda Tangan */}
              <div className="grid grid-cols-2 pt-6 text-center text-xs">
                <div>
                  <span className="text-slate-500 block mb-12">Petugas Pemeriksa / Analis,</span>
                  <strong className="text-slate-900 underline block">{printRecord.analystName}</strong>
                  <span className="text-[10px] text-slate-400">Petugas Laboratorium</span>
                </div>

                <div>
                  <span className="text-slate-500 block mb-12">
                    {pharmacyProfile.city}, {printRecord.date}<br />
                    Dokter Pemeriksa / Penanggung Jawab (DPJ),
                  </span>
                  <strong className="text-slate-900 underline block">
                    {printRecord.doctorName || dpjProfile.name}
                  </strong>
                  <span className="text-[10px] text-slate-600 font-mono block">
                    SIP: {dpjProfile.sip}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {dpjProfile.idi}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI HAPUS ================= */}
      {recordToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 text-rose-600 font-extrabold text-sm border-b pb-3">
              <Trash2 className="w-5 h-5 text-rose-600" />
              <span>Konfirmasi Hapus Dokumen Lab</span>
            </div>

            <p className="text-slate-600 text-xs leading-relaxed">
              Apakah Anda yakin ingin menghapus dokumen hasil laboratorium{' '}
              <strong className="text-slate-900 font-mono">#{recordToDelete.id}</strong> atas nama pasien{' '}
              <strong className="text-slate-900">{recordToDelete.patientName}</strong>?
            </p>

            <div className="p-3 bg-slate-50 rounded-xl border text-xs text-slate-600 space-y-1">
              <div>Jumlah Parameter: {recordToDelete.items.length} uji</div>
              <div>Tanggal: {recordToDelete.date} ({recordToDelete.time} WIB)</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRecordToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  const delId = recordToDelete.id;
                  const res = await Promise.resolve(onDeleteLabRecord(delId));
                  setRecordToDelete(null);
                  if (isDemoSandbox || res?.isDemo) {
                    setSyncToast({
                      type: 'success',
                      message: `Dokumen lab #${delId} dihapus dari Mode Demo Sandbox.`
                    });
                  } else if (res && res.success === false) {
                    setSyncToast({
                      type: 'warning',
                      message: res.needsTableSetup
                        ? `Dokumen lab #${delId} dihapus di aplikasi, namun Supabase menolak penghapusan (periksa Skema SQL / RLS DELETE tabel cek_lab).`
                        : `Dokumen lab #${delId} dihapus secara lokal & antre dihapus di Supabase saat sinkronisasi (${res.error || 'offline'}).`
                    });
                  } else {
                    setSyncToast({
                      type: 'success',
                      message: `Dokumen lab #${delId} dihapus permanen & disinkronkan ke Supabase.`
                    });
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs shadow-md transition"
              >
                Hapus Dokumen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL SKEMA SQL SUPABASE CEK LAB ================= */}
      {isOwnerAdmin && showSchemaModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-600" />
                  Skema SQL Supabase — Pemeriksaan &amp; Cek Lab (POCT)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tabel <strong className="font-mono">{labTableInput}</strong> untuk sinkronisasi dokumen pemeriksaan laboratorium pasien secara 2-arah &amp; real-time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSchemaModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <form
                onSubmit={handleSaveTableName}
                className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end bg-slate-50 p-3 rounded-2xl border border-slate-200"
              >
                <div className="flex-1">
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Tabel Cek Lab di Supabase
                  </label>
                  <input
                    type="text"
                    value={labTableInput}
                    onChange={(e) => setLabTableInput(e.target.value)}
                    disabled={isDemoSandbox}
                    className="w-full p-2 border rounded-xl font-mono font-bold bg-white disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isDemoSandbox || isSyncing}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer"
                >
                  Simpan &amp; Tes Koneksi
                </button>
              </form>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">
                    Salin &amp; jalankan pada Supabase Dashboard &rarr; SQL Editor:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySchema}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedSchema ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSchema ? 'SQL Tersalin!' : 'Salin SQL'}</span>
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-80 leading-relaxed">
                  {SUPABASE_LAB_TEST_SQL_SCHEMA}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
