import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FolderOpen,
  Search,
  Printer,
  FileText,
  Calendar,
  X,
  User,
  HeartPulse,
  Pill,
  Trash2,
  Pencil,
  CheckSquare,
  Square,
  CheckCircle,
  Users,
  Plus,
  AlertCircle,
  Save,
  Clock,
  Activity,
  Check,
  Code,
  Copy,
  RefreshCw,
  ChevronDown,
  Tag
} from 'lucide-react';
import { INITIAL_PATIENTS } from '../data/initialData';
import { RMERecord, Staff, Medicine, ICD10Item, StaffFeeItem, PrescriptionItem, VitalSign, Patient } from '../types';
import { openPrintWindow } from '../utils/printHelper';
import { PaginationControls } from './PaginationControls';
import { useFacilityProfiles, formatPharmacyAddress } from './PharmacySettingsModal';
import { SUPABASE_RME_SQL_SCHEMA, fetchRmeFromSupabase, isDemoRmeId } from '../utils/supabaseClient';
import { getDeletedIdsSet } from '../utils/deletionRegistry';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { demoGetItem, demoSetItem } from '../utils/demoSandbox';
import { MedicationLabelConfigurator } from './MedicationLabelConfigurator';
import {
  MedicationLabelItem,
  MedicationLabelLayout,
  buildMedicationLabelItems,
  saveMedicationLabelPrintPayload
} from '../utils/medicationLabelHelper';

function toRomanNumeral(num: number): string {
  const n = Math.max(1, Math.round(num || 1));
  const map: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ];
  let result = '';
  let rem = n;
  for (const [val, sym] of map) {
    while (rem >= val) {
      result += sym;
      rem -= val;
    }
  }
  return result;
}

function formatStandardSigna(dosage: string, unit: string): { latin: string; clearText: string } {
  const raw = (dosage || '3x1 Sesudah Makan').trim();
  const lower = raw.toLowerCase();
  const unitLower = (unit || 'Tablet').toLowerCase();

  let freqLatin = '3 d.d. I';
  const freqMatch = lower.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)/);
  if (freqMatch) {
    const times = parseInt(freqMatch[1], 10) || 1;
    const doseNum = parseFloat(freqMatch[2].replace(',', '.')) || 1;
    const doseRoman = Number.isInteger(doseNum) ? toRomanNumeral(doseNum) : String(doseNum);
    freqLatin = `${times} d.d. ${doseRoman}`;
  } else if (lower.includes('bila perlu') || lower.includes('prn')) {
    freqLatin = 'p.r.n. I';
  }

  let unitLatin = 'tab.';
  if (unitLower.includes('kapsul') || lower.includes('kapsul')) unitLatin = 'caps.';
  else if (unitLower.includes('kaplet') || lower.includes('kaplet')) unitLatin = 'capl.';
  else if (unitLower.includes('botol') || unitLower.includes('sirup') || lower.includes('sendok') || lower.includes('ml')) unitLatin = 'cth.';
  else if (unitLower.includes('tube') || unitLower.includes('salep') || unitLower.includes('krim') || lower.includes('oles')) unitLatin = 'u.e.';
  else if (unitLower.includes('bungkus') || unitLower.includes('puyer') || unitLower.includes('sachet')) unitLatin = 'pulv.';
  else if (unitLower.includes('ampul') || unitLower.includes('vial')) unitLatin = 'inj.';
  else if (unitLower.includes('tetes')) unitLatin = 'gtt.';

  let timeLatin = '';
  if (lower.includes('sesudah makan') || lower.includes('setelah makan') || lower.includes('p.c')) {
    timeLatin = 'p.c.';
  } else if (lower.includes('sebelum makan') || lower.includes('a.c')) {
    timeLatin = 'a.c.';
  } else if (lower.includes('bersama makan') || lower.includes('d.c')) {
    timeLatin = 'd.c.';
  }
  if (lower.includes('malam')) timeLatin = `${timeLatin} h.v.`.trim();
  if (lower.includes('pagi')) timeLatin = `${timeLatin} m.`.trim();
  if (lower.includes('habiskan') || lower.includes('antibiotik')) timeLatin = `${timeLatin} (habiskan)`.trim();

  const latin = `S ${freqLatin} ${unitLatin} ${timeLatin}`.replace(/\s+/g, ' ').trim();
  return { latin, clearText: raw };
}

function lookupPatientForRx(rmId: string, patientName: string): Patient | null {
  try {
    const saved = demoGetItem('latisha_patients');
    const list: Patient[] = saved ? JSON.parse(saved) : INITIAL_PATIENTS;
    return (
      list.find((p) => p.id === rmId || p.name.toLowerCase() === patientName.toLowerCase()) || null
    );
  } catch {
    return (
      INITIAL_PATIENTS.find((p) => p.id === rmId || p.name.toLowerCase() === patientName.toLowerCase()) ||
      null
    );
  }
}

interface RmeCloudResult {
  success: boolean;
  count?: number;
  uploadedCount?: number;
  deletedFlushedCount?: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}

interface RMEHistoryViewProps {
  rmeRecords: RMERecord[];
  staffList?: Staff[];
  medicines?: Medicine[];
  icd10List?: ICD10Item[];
  onUpdateRecord?: (record: RMERecord) => void;
  onDeleteRecord?: (id: string) => void | Promise<RmeCloudResult | void>;
  onBulkDeleteRecords?: (ids: string[]) => void | Promise<RmeCloudResult | void>;
  onSyncRmeFromSupabase?: (records: RMERecord[]) => void;
  onSyncRmeSupabase?: () => Promise<RmeCloudResult>;
  needsTableSetup?: boolean;
  isDemoSandbox?: boolean;
}

export const RMEHistoryView: React.FC<RMEHistoryViewProps> = ({
  rmeRecords,
  staffList = [],
  medicines = [],
  icd10List = [],
  onUpdateRecord,
  onDeleteRecord,
  onBulkDeleteRecords,
  onSyncRmeFromSupabase,
  onSyncRmeSupabase,
  needsTableSetup = false,
  isDemoSandbox = false
}) => {
  const { pharmacyProfile, apjProfile, dpjProfile } = useFacilityProfiles();
  const pharmacyFullAddress = formatPharmacyAddress(pharmacyProfile);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<RMERecord | null>(null);
  const [printType, setPrintType] = useState<'rme' | 'copy-resep' | 'surat-sakit' | 'etiket-obat'>('rme');
  const [etiketLabels, setEtiketLabels] = useState<MedicationLabelItem[]>([]);
  const [etiketLayout, setEtiketLayout] = useState<MedicationLabelLayout>('thermal-80');

  const openRmePrintModal = (
    rec: RMERecord,
    initialType: 'rme' | 'copy-resep' | 'surat-sakit' | 'etiket-obat'
  ) => {
    setSelectedRecord(rec);
    setPrintType(initialType);
    setEtiketLabels(buildMedicationLabelItems(rec.prescription || [], medicines));
  };

  const handlePrintRmeEtiket = (rec: RMERecord) => {
    const patientInfo = lookupPatientForRx(rec.rmId, rec.patientName);
    saveMedicationLabelPrintPayload({
      rxId: `CRX/${rec.id}`,
      rmId: rec.rmId,
      patientName: rec.patientName,
      patientAge: rec.age ? String(rec.age) : undefined,
      patientGender: rec.gender,
      patientAddress: patientInfo?.address,
      doctorName: rec.doctorName,
      date: rec.date,
      screenedBy: apjProfile.name,
      layout: etiketLayout,
      labels: etiketLabels,
      createdAt: new Date().toISOString()
    });
    openPrintWindow('etiket-obat', { rxId: `CRX/${rec.id}`, layout: etiketLayout });
  };

  // Supabase Integration State
  const isOwnerAdmin = useIsOwnerAdmin();
  const [showRmeSqlModal, setShowRmeSqlModal] = useState(false);
  const [copiedRmeSql, setCopiedRmeSql] = useState(false);
  const [syncRmeLoading, setSyncRmeLoading] = useState(false);
  const [syncRmeNotice, setSyncRmeNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Edit Modal State
  const [editingRecord, setEditingRecord] = useState<RMERecord | null>(null);
  const [editPatientName, setEditPatientName] = useState('');
  const [editRmId, setEditRmId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDoctorName, setEditDoctorName] = useState('');
  const [editVital, setEditVital] = useState<VitalSign>({
    td: '120/80',
    suhu: 36.5,
    nadi: 80,
    spo2: 98,
    bb: 60,
    tb: 165
  });
  const [editSoapS, setEditSoapS] = useState('');
  const [editSoapO, setEditSoapO] = useState('');
  const [editSoapA, setEditSoapA] = useState('');
  const [editSoapP, setEditSoapP] = useState('');
  const [editAssignedStaff, setEditAssignedStaff] = useState<StaffFeeItem[]>([]);
  const [editPrescription, setEditPrescription] = useState<PrescriptionItem[]>([]);
  const [editDoctorFee, setEditDoctorFee] = useState<number>(20000);
  const [editMedicalSupportFee, setEditMedicalSupportFee] = useState<number>(5000);
  const [editAdminFee, setEditAdminFee] = useState<number>(1000);
  const [selectedNewMedId, setSelectedNewMedId] = useState('');
  const [medSearchQuery, setMedSearchQuery] = useState('');
  const [isMedDropdownOpen, setIsMedDropdownOpen] = useState(false);
  const [highlightedMedIdx, setHighlightedMedIdx] = useState(0);
  const medDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (medDropdownRef.current && !medDropdownRef.current.contains(event.target as Node)) {
        setIsMedDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedMedObj = medicines.find((m) => m.id === selectedNewMedId);
  const selectedMedDisplay = selectedMedObj
    ? `${selectedMedObj.name} (${selectedMedObj.satuanKecil || selectedMedObj.unit}) - Stok: ${selectedMedObj.stock}`
    : '';

  const filteredMedOptions = useMemo(() => {
    const q = medSearchQuery.trim().toLowerCase();
    const matched =
      !q || (selectedNewMedId && medSearchQuery === selectedMedDisplay)
        ? medicines
        : medicines.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              (m.kelas || '').toLowerCase().includes(q) ||
              (m.category || '').toLowerCase().includes(q) ||
              (m.kekuatan || '').toLowerCase().includes(q) ||
              (m.barcode || '').toLowerCase().includes(q)
          );
    return matched.slice(0, 50);
  }, [medicines, medSearchQuery, selectedNewMedId, selectedMedDisplay]);

  // Filtered records based on search term
  const filteredRecords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rmeRecords;
    return rmeRecords.filter((rec) => {
      const staffNames = rec.assignedStaff
        ? rec.assignedStaff.map((s) => s.staffName.toLowerCase()).join(' ')
        : '';
      return (
        rec.patientName.toLowerCase().includes(q) ||
        rec.rmId.toLowerCase().includes(q) ||
        rec.soapA.toLowerCase().includes(q) ||
        rec.doctorName.toLowerCase().includes(q) ||
        rec.id.toLowerCase().includes(q) ||
        staffNames.includes(q)
      );
    });
  }, [rmeRecords, searchTerm]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, safePage, pageSize]);

  // Checkbox Selection Logic
  const isAllSelected =
    filteredRecords.length > 0 && selectedIds.length === filteredRecords.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map((r) => r.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Custom in-app Delete Confirmation Modal State (avoids sandboxed iframe window.confirm blocking)
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk';
    id?: string;
    patientName?: string;
    count?: number;
  }>({
    isOpen: false,
    type: 'single'
  });

  const promptDeleteSingle = (id: string, patientName: string) => {
    setDeleteConfirmState({
      isOpen: true,
      type: 'single',
      id,
      patientName
    });
  };

  const promptBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setDeleteConfirmState({
      isOpen: true,
      type: 'bulk',
      count: selectedIds.length
    });
  };

  const handleConfirmExecuteDelete = async () => {
    const targetState = { ...deleteConfirmState };
    const bulkIds = [...selectedIds];
    setDeleteConfirmState({ isOpen: false, type: 'single' });

    if (targetState.type === 'single' && targetState.id) {
      setSelectedIds((prev) => prev.filter((item) => item !== targetState.id));
      if (selectedRecord?.id === targetState.id) {
        setSelectedRecord(null);
      }
      if (onDeleteRecord) {
        const res = await Promise.resolve(onDeleteRecord(targetState.id));
        if (res && !res.success && !res.isDemo) {
          setSyncRmeNotice({
            type: 'info',
            message: res.needsTableSetup
              ? 'Catatan RME dihapus di aplikasi, namun tabel medical_records di Supabase perlu dijalankan ulang Skema SQL-nya.'
              : `Catatan RME dihapus secara lokal dan dijadwalkan untuk dihapus dari Supabase saat koneksi kembali stabil (${res.error || 'Menunggu sinkronisasi'}).`
          });
        }
      }
    } else if (targetState.type === 'bulk') {
      setSelectedIds([]);
      if (selectedRecord && bulkIds.includes(selectedRecord.id)) {
        setSelectedRecord(null);
      }
      if (onBulkDeleteRecords) {
        const res = await Promise.resolve(onBulkDeleteRecords(bulkIds));
        if (res && !res.success && !res.isDemo) {
          setSyncRmeNotice({
            type: 'info',
            message: res.needsTableSetup
              ? 'Data terpilih dihapus di aplikasi, namun tabel medical_records di Supabase perlu dijalankan ulang Skema SQL-nya.'
              : `${bulkIds.length} catatan RME dihapus secara lokal dan antre penghapusan otomatis ke Supabase (${res.error || 'Menunggu sinkronisasi'}).`
          });
        }
      } else if (onDeleteRecord) {
        for (const id of bulkIds) {
          await Promise.resolve(onDeleteRecord(id));
        }
      }
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (rec: RMERecord) => {
    setEditingRecord(rec);
    setEditPatientName(rec.patientName);
    setEditRmId(rec.rmId);
    setEditDate(rec.date);
    setEditTime(rec.time);
    setEditDoctorName(rec.doctorName);
    setEditVital(rec.vitalSign || { td: '120/80', suhu: 36.5, nadi: 80, spo2: 98, bb: 60, tb: 165 });
    setEditSoapS(rec.soapS || '');
    setEditSoapO(rec.soapO || '');
    setEditSoapA(rec.soapA || '');
    setEditSoapP(rec.soapP || '');
    setEditDoctorFee(rec.doctorFee || 20000);
    setEditMedicalSupportFee(rec.medicalSupportFee || 5000);
    setEditAdminFee(rec.adminFee || 1000);

    // Populate assigned staff
    if (rec.assignedStaff && rec.assignedStaff.length > 0) {
      setEditAssignedStaff([...rec.assignedStaff]);
    } else {
      // Default to doctor + support
      const initialStaff: StaffFeeItem[] = [
        {
          staffId: staffList.find((s) => s.role === 'Dokter' || s.name === rec.doctorName)?.id || 'STF-02',
          staffName: rec.doctorName || 'dr. Anis Prima Dewi',
          role: 'Dokter',
          fee: rec.doctorFee || 20000
        }
      ];
      if (rec.medicalSupportFee) {
        initialStaff.push({
          staffId: 'STF-03',
          staffName: 'Ns. Siti Nurhaliza, S.Kep',
          role: 'Perawat / Bidan',
          fee: rec.medicalSupportFee
        });
      }
      setEditAssignedStaff(initialStaff);
    }

    setEditPrescription(rec.prescription ? [...rec.prescription] : []);
    setSelectedNewMedId('');
    setMedSearchQuery('');
    setIsMedDropdownOpen(false);
    setHighlightedMedIdx(0);
  };

  // Staff checklist toggle in edit form
  const handleToggleStaffInEdit = (staff: Staff) => {
    const exists = editAssignedStaff.find((s) => s.staffId === staff.id || s.staffName === staff.name);
    if (exists) {
      const nextStaff = editAssignedStaff.filter((s) => s.staffId !== staff.id && s.staffName !== staff.name);
      setEditAssignedStaff(nextStaff);
      if (staff.role === 'Dokter' && editDoctorName === staff.name) {
        const remainingDoctor = nextStaff.find((s) => s.role === 'Dokter');
        if (remainingDoctor) {
          setEditDoctorName(remainingDoctor.staffName);
        }
      }
    } else {
      let defaultFee = 5000;
      if (staff.role === 'Dokter') {
        defaultFee = editDoctorFee || 20000;
        setEditDoctorName(staff.name);
      } else if (staff.role === 'Perawat / Bidan' || staff.role === 'Perawat / Nakes Lapangan') defaultFee = editMedicalSupportFee || 5000;
      else if (staff.role === 'Kasir & Front Office') defaultFee = editAdminFee || 1000;

      setEditAssignedStaff([
        ...editAssignedStaff,
        {
          staffId: staff.id,
          staffName: staff.name,
          role: staff.role,
          fee: defaultFee
        }
      ]);
    }
  };

  const handleUpdateStaffFeeInEdit = (staffId: string, fee: number) => {
    setEditAssignedStaff(
      editAssignedStaff.map((s) => (s.staffId === staffId ? { ...s, fee: Math.max(0, fee) } : s))
    );
  };

  // Prescription item management in edit form
  const handleAddMedToEditPrescription = () => {
    if (!selectedNewMedId) return;
    const med = medicines.find((m) => m.id === selectedNewMedId);
    if (!med) return;

    const newItem: PrescriptionItem = {
      medicineId: med.id,
      name: med.name,
      qty: 10,
      unit: med.satuanKecil || med.unit || 'Tablet',
      price: med.sellPriceKlinik || med.sellPrice,
      dosage: '3x1 Tablet Sesudah Makan',
      notes: ''
    };

    setEditPrescription([...editPrescription, newItem]);
    setSelectedNewMedId('');
    setMedSearchQuery('');
    setIsMedDropdownOpen(false);
    setHighlightedMedIdx(0);
  };

  const handleRemoveMedFromEditPrescription = (idx: number) => {
    setEditPrescription(editPrescription.filter((_, i) => i !== idx));
  };

  const handleUpdatePresItem = (idx: number, field: keyof PrescriptionItem, value: any) => {
    setEditPrescription(
      editPrescription.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  // Save Edit Form
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    const assignedDoctor = editAssignedStaff.find((s) => s.role === 'Dokter');
    const syncedDoctorName = assignedDoctor ? assignedDoctor.staffName : editDoctorName;

    const updatedRecord: RMERecord = {
      ...editingRecord,
      patientName: editPatientName,
      rmId: editRmId,
      date: editDate,
      time: editTime,
      doctorName: syncedDoctorName,
      vitalSign: editVital,
      soapS: editSoapS,
      soapO: editSoapO,
      soapA: editSoapA,
      soapP: editSoapP,
      assignedStaff: editAssignedStaff,
      prescription: editPrescription,
      doctorFee: editDoctorFee,
      medicalSupportFee: editMedicalSupportFee,
      adminFee: editAdminFee
    };

    if (onUpdateRecord) {
      onUpdateRecord(updatedRecord);
    }
    setEditingRecord(null);
  };

  return (
    <div className="space-y-4">
      {/* Search & Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-emerald-600" />
            Arsip e-RME (Rekam Medis Elektronik) Pasien
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Dokumentasi digital hasil pemeriksaan SOAP, data tim petugas medis bertugas, dan riwayat terapi obat.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold border border-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Supabase Live: medical_records
            </span>
            {isOwnerAdmin && (
              <button
                type="button"
                onClick={() => setShowRmeSqlModal(true)}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
              >
                <Code className="w-3 h-3 text-emerald-600" />
                <span>Skema SQL e-RME</span>
              </button>
            )}
            <button
              type="button"
              disabled={syncRmeLoading}
              onClick={async () => {
                setSyncRmeLoading(true);
                setSyncRmeNotice(null);
                try {
                  if (onSyncRmeSupabase) {
                    const syncRes = await onSyncRmeSupabase();
                    if (syncRes.isDemo) {
                      setSyncRmeNotice({
                        type: 'info',
                        message: syncRes.error || 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase dinonaktifkan.'
                      });
                    } else if (syncRes.needsTableSetup) {
                      setSyncRmeNotice({
                        type: 'error',
                        message: syncRes.error || 'Tabel medical_records belum siap di Supabase. Silakan jalankan Skema SQL e-RME.'
                      });
                    } else if (!syncRes.success) {
                      setSyncRmeNotice({
                        type: 'error',
                        message: `Gagal menyinkronkan data e-RME: ${syncRes.error || 'Kesalahan jaringan'}`
                      });
                    } else {
                      const flushedText =
                        syncRes.deletedFlushedCount && syncRes.deletedFlushedCount > 0
                          ? ` (${syncRes.deletedFlushedCount} penghapusan dibersihkan di cloud)`
                          : '';
                      setSyncRmeNotice({
                        type: 'success',
                        message: `Sinkronisasi 2-arah e-RME selesai: ${syncRes.count ?? rmeRecords.length} catatan aktif${flushedText}.`
                      });
                    }
                    return;
                  }

                  const fetchRes = await fetchRmeFromSupabase({ forceRefresh: true });
                  if (fetchRes.error) {
                    setSyncRmeNotice({
                      type: 'error',
                      message: `Gagal mengambil data RME dari Supabase: ${fetchRes.error}`
                    });
                  } else {
                    const deletedSet = getDeletedIdsSet('rme_records');
                    const finalRecs = (fetchRes.data || []).filter(
                      (r) => r?.id && !isDemoRmeId(r.id) && !deletedSet.has(String(r.id).trim())
                    );
                    if (onSyncRmeFromSupabase) {
                      onSyncRmeFromSupabase(finalRecs);
                    }
                    demoSetItem('latisha_rme_records', JSON.stringify(finalRecs));
                    setSyncRmeNotice({
                      type: 'success',
                      message: `Berhasil menarik ${finalRecs.length} catatan e-RME aktif dari Supabase.`
                    });
                  }
                } catch (e: any) {
                  setSyncRmeNotice({
                    type: 'error',
                    message: `Gagal sinkronisasi: ${e?.message || String(e)}`
                  });
                } finally {
                  setSyncRmeLoading(false);
                }
              }}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${syncRmeLoading ? 'animate-spin' : ''}`} />
              <span>{syncRmeLoading ? 'Menyinkronkan...' : 'Sinkronkan'}</span>
            </button>
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari pasien / RM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>

          <div className="bg-slate-100 text-slate-700 font-mono text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 shrink-0">
            {filteredRecords.length} Catatan
          </div>
        </div>
      </div>

      {/* Sync / Cloud Status Banner */}
      {(syncRmeNotice || needsTableSetup || isDemoSandbox) && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            syncRmeNotice?.type === 'error' || (!syncRmeNotice && needsTableSetup)
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : syncRmeNotice?.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {syncRmeNotice?.message ||
                (needsTableSetup
                  ? 'Tabel medical_records belum disiapkan atau terkendala izin RLS di Supabase. Klik "Skema SQL e-RME" untuk menjalankan skrip.'
                  : 'Mode Demo / Sandbox aktif — perubahan data RME tersimpan di ruang simulasi dan tidak mengubah database Supabase produksi.')}
            </span>
          </div>
          {syncRmeNotice && (
            <button
              type="button"
              onClick={() => setSyncRmeNotice(null)}
              className="p-1 rounded-lg hover:bg-black/5 transition cursor-pointer shrink-0"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Bulk Action Strip when checkboxes are selected */}
      {selectedIds.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-sky-600 text-white rounded-lg">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-xs text-sky-950">
                {selectedIds.length} Catatan RME Dipilih
              </span>
              <p className="text-[11px] text-sky-700">
                Pilih tindakan massal yang ingin diterapkan ke catatan terpilih.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={promptBulkDelete}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus {selectedIds.length} Data Terpilih</span>
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Batal Pilihan
            </button>
          </div>
        </div>
      )}

      {/* RME Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600 text-[11px]">
              <tr>
                {/* 1. Checkbox Diawal Tabel */}
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    title="Pilih Semua Baris"
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer"
                  />
                </th>

                {/* 2. Tombol Edit & Hapus Diawal Tabel */}
                <th className="p-3 w-32 text-center">Aksi (Edit / Hapus)</th>

                {/* 3. Tanggal & Waktu */}
                <th className="p-3 w-32">Waktu Layanan</th>

                {/* 4. No. RM & Pasien */}
                <th className="p-3 min-w-[150px]">No. RM & Pasien</th>

                {/* 5. Nama Petugas yang Bertugas Sesuai Input Form RME */}
                <th className="p-3 min-w-[200px]">Petugas yang Bertugas (Tim Medis)</th>

                {/* 6. Tanda Vital */}
                <th className="p-3 w-28">Tanda Vital</th>

                {/* 7. Diagnosis (ICD-10) */}
                <th className="p-3 min-w-[180px]">Diagnosis (ICD-10)</th>

                {/* 8. Cetak & Dokumen */}
                <th className="p-3 text-center w-48">Dokumen & Cetak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 italic">
                    Belum ada catatan rekam medis yang sesuai pencarian.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec) => {
                  const isChecked = selectedIds.includes(rec.id);

                  // Extract assigned staff from RME form
                  const staffAssigned: StaffFeeItem[] =
                    rec.assignedStaff && rec.assignedStaff.length > 0
                      ? rec.assignedStaff
                      : [
                          {
                            staffId: 'STF-02',
                            staffName: rec.doctorName || 'dr. Anis Prima Dewi',
                            role: 'Dokter',
                            fee: rec.doctorFee || 20000
                          },
                          ...(rec.medicalSupportFee
                            ? [
                                {
                                  staffId: 'STF-03',
                                  staffName: 'Ns. Siti Nurhaliza, S.Kep',
                                  role: 'Perawat / Bidan',
                                  fee: rec.medicalSupportFee
                                }
                              ]
                            : [])
                        ];

                  return (
                    <tr
                      key={rec.id}
                      className={`transition-colors ${
                        isChecked ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(rec.id)}
                          className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer"
                        />
                      </td>

                      {/* Tombol Edit & Hapus Diawal Tabel */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(rec)}
                            title="Edit Catatan RME & Petugas"
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => promptDeleteSingle(rec.id, rec.patientName)}
                            title="Hapus Catatan RME"
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </td>

                      {/* Tanggal & Waktu */}
                      <td className="p-3 font-mono">
                        <span className="font-bold text-slate-800 block">{rec.date}</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {rec.time} WIB
                        </span>
                      </td>

                      {/* No. RM & Pasien */}
                      <td className="p-3">
                        <strong className="text-slate-900 block">{rec.patientName}</strong>
                        <span className="text-[10px] font-mono text-sky-700 font-bold block">
                          {rec.rmId} · {rec.gender}, {rec.age} thn
                        </span>
                      </td>

                      {/* Nama Petugas yang Bertugas Sesuai Input Form RME */}
                      <td className="p-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {staffAssigned.map((st, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950 text-[10px] font-medium"
                              >
                                <Users className="w-2.5 h-2.5 text-indigo-600" />
                                <span className="font-bold">{st.staffName}</span>
                                <span className="text-[9px] text-indigo-600 font-semibold">
                                  ({st.role.split('/')[0].trim()})
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Tanda Vital */}
                      <td className="p-3 font-mono text-[11px]">
                        <div>TD: <strong>{rec.vitalSign.td}</strong></div>
                        <div className="text-[10px] text-slate-500">
                          S: {rec.vitalSign.suhu}°C · N: {rec.vitalSign.nadi}
                        </div>
                      </td>

                      {/* Diagnosis ICD-10 */}
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 text-[11px] block truncate max-w-[220px]" title={rec.soapA}>
                          {rec.soapA}
                        </span>
                        {rec.soapS && (
                          <span className="text-[10px] text-slate-400 italic block mt-0.5 truncate max-w-[220px]">
                            {rec.soapS}
                          </span>
                        )}
                      </td>

                      {/* Dokumen & Cetak */}
                      <td className="p-3 text-center space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openRmePrintModal(rec, 'rme')}
                          className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-bold transition shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                        >
                          <FileText className="w-3 h-3" />
                          <span>RME Lengkap</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openRmePrintModal(rec, 'copy-resep')}
                          title="Cetak Salinan Resep (Copy Rx / Apograph) sesuai aturan penulisan resep baku"
                          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Pill className="w-3 h-3" />
                          <span>Copy Rx</span>
                        </button>

                        {rec.prescription && rec.prescription.length > 0 && (
                          <button
                            type="button"
                            onClick={() => openRmePrintModal(rec, 'etiket-obat')}
                            title="Cetak Label Instruksi Penggunaan Obat (Etiket Kemasan)"
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Tag className="w-3 h-3" />
                            <span>Etiket</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openRmePrintModal(rec, 'surat-sakit')}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[10px] font-bold transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Surat Sakit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          currentPage={safePage}
          totalPages={totalPages}
          totalCount={filteredRecords.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
          itemLabel="arsip RME"
        />
      </div>

      {/* Edit Record Modal Dialog */}
      {editingRecord && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-slate-200 my-6">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wide flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-amber-400" />
                  Edit Catatan e-RME & Penugasan Petugas Medis
                </h3>
                <p className="text-[10px] text-sky-400">
                  ID Dokumen: {editingRecord.id} · Pasien: {editingRecord.patientName} ({editingRecord.rmId})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-5 text-xs text-slate-800 max-h-[80vh] overflow-y-auto">
              {/* Section 1: Data Pasien & Waktu Layanan */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <span className="font-black text-[11px] text-slate-700 uppercase tracking-wider block">
                  1. Informasi Pasien & Kunjungan
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Nama Pasien</label>
                    <input
                      type="text"
                      value={editPatientName}
                      onChange={(e) => setEditPatientName(e.target.value)}
                      required
                      className="w-full p-2 border rounded-xl font-bold bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">No. Rekam Medis (RM)</label>
                    <input
                      type="text"
                      value={editRmId}
                      onChange={(e) => setEditRmId(e.target.value)}
                      required
                      className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-sky-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Tanggal</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      required
                      className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Waktu (WIB)</label>
                    <input
                      type="text"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      required
                      className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Petugas yang Bertugas (Multi-Petugas Form RME) */}
              <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-[11px] text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    2. Petugas yang Bertugas (Tim Medis)
                  </span>
                  <span className="text-[10px] text-indigo-700 font-semibold">
                    Centang pegawai yang bertugas untuk layanan ini
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {staffList.map((staff) => {
                    const assigned = editAssignedStaff.find(
                      (s) => s.staffId === staff.id || s.staffName === staff.name
                    );
                    const isAssigned = !!assigned;

                    return (
                      <div
                        key={staff.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                          isAssigned
                            ? 'bg-white border-indigo-400 shadow-2xs'
                            : 'bg-white/60 border-slate-200 opacity-70'
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={() => handleToggleStaffInEdit(staff)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-slate-900 block text-[11px]">
                              {staff.name}
                            </span>
                            <span className="text-[9px] text-slate-500">
                              {staff.role} ({staff.id})
                            </span>
                          </div>
                        </label>

                        {isAssigned && (
                          <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Check className="w-2.5 h-2.5 text-indigo-600" />
                            Bertugas
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-right text-[11px] font-bold text-indigo-900 pt-1">
                  Jumlah Petugas Bertugas:{' '}
                  <span className="font-mono text-indigo-800 font-black">
                    {editAssignedStaff.length} Pegawai
                  </span>
                </div>
              </div>

              {/* Section 3: Tanda Vital Pasien */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <span className="font-black text-[11px] text-slate-700 uppercase tracking-wider block">
                  3. Tanda Vital (Vital Signs)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">TD (mmHg)</label>
                    <input
                      type="text"
                      value={editVital.td}
                      onChange={(e) => setEditVital({ ...editVital, td: e.target.value })}
                      className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-slate-900"
                      placeholder="120/80"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Suhu (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editVital.suhu}
                      onChange={(e) => setEditVital({ ...editVital, suhu: parseFloat(e.target.value) || 36.5 })}
                      className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Nadi (bpm)</label>
                    <input
                      type="number"
                      value={editVital.nadi}
                      onChange={(e) => setEditVital({ ...editVital, nadi: parseInt(e.target.value) || 80 })}
                      className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">SpO2 (%)</label>
                    <input
                      type="number"
                      value={editVital.spo2}
                      onChange={(e) => setEditVital({ ...editVital, spo2: parseInt(e.target.value) || 98 })}
                      className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">BB (kg)</label>
                    <input
                      type="number"
                      value={editVital.bb || 0}
                      onChange={(e) => setEditVital({ ...editVital, bb: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">TB (cm)</label>
                    <input
                      type="number"
                      value={editVital.tb || 0}
                      onChange={(e) => setEditVital({ ...editVital, tb: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border rounded-xl font-mono font-bold bg-white text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: SOAP Medis */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <span className="font-black text-[11px] text-slate-700 uppercase tracking-wider block">
                  4. Rekam SOAP & Diagnosis ICD-10
                </span>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-sky-800 mb-1 uppercase">
                      S - Subjective (Keluhan Utama / Anamnesis)
                    </label>
                    <textarea
                      value={editSoapS}
                      onChange={(e) => setEditSoapS(e.target.value)}
                      rows={2}
                      className="w-full p-2.5 border rounded-xl font-medium bg-white text-slate-900 text-xs"
                      placeholder="Keluhan subjektif pasien..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-sky-800 mb-1 uppercase">
                      O - Objective (Pemeriksaan Fisik & Penunjang)
                    </label>
                    <textarea
                      value={editSoapO}
                      onChange={(e) => setEditSoapO(e.target.value)}
                      rows={2}
                      className="w-full p-2.5 border rounded-xl font-medium bg-white text-slate-900 text-xs"
                      placeholder="Hasil pemeriksaan objektif..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-emerald-800 mb-1 uppercase">
                      A - Assessment (Diagnosis ICD-10)
                    </label>
                    <input
                      type="text"
                      value={editSoapA}
                      onChange={(e) => setEditSoapA(e.target.value)}
                      className="w-full p-2.5 border border-emerald-300 rounded-xl font-bold bg-emerald-50/50 text-emerald-950 text-xs"
                      placeholder="Contoh: J00 - Acute nasopharyngitis [common cold]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-sky-800 mb-1 uppercase">
                      P - Plan (Rencana Terapi, Anjuran & Edukasi)
                    </label>
                    <textarea
                      value={editSoapP}
                      onChange={(e) => setEditSoapP(e.target.value)}
                      rows={2}
                      className="w-full p-2.5 border rounded-xl font-medium bg-white text-slate-900 text-xs"
                      placeholder="Rencana edukasi dan tindakan..."
                    />
                  </div>
                </div>
              </div>

              {/* Section 5: Resep Obat */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-black text-[11px] text-slate-700 uppercase tracking-wider block">
                    5. Terapi Obat (Resep Dokter)
                  </span>
                  <div className="flex items-center gap-1.5 flex-1 sm:flex-initial sm:min-w-[340px]">
                    <div ref={medDropdownRef} className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={medSearchQuery}
                        onFocus={() => {
                          setIsMedDropdownOpen(true);
                          setHighlightedMedIdx(0);
                        }}
                        onChange={(e) => {
                          setMedSearchQuery(e.target.value);
                          setSelectedNewMedId('');
                          setIsMedDropdownOpen(true);
                          setHighlightedMedIdx(0);
                        }}
                        onKeyDown={(e) => {
                          if (!isMedDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                            setIsMedDropdownOpen(true);
                            return;
                          }
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlightedMedIdx((prev) =>
                              filteredMedOptions.length === 0 ? 0 : (prev + 1) % filteredMedOptions.length
                            );
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedMedIdx((prev) =>
                              filteredMedOptions.length === 0
                                ? 0
                                : (prev - 1 + filteredMedOptions.length) % filteredMedOptions.length
                            );
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (isMedDropdownOpen && !selectedNewMedId && filteredMedOptions[highlightedMedIdx]) {
                              const chosen = filteredMedOptions[highlightedMedIdx];
                              setSelectedNewMedId(chosen.id);
                              setMedSearchQuery(`${chosen.name} (${chosen.satuanKecil || chosen.unit}) - Stok: ${chosen.stock}`);
                              setIsMedDropdownOpen(false);
                            } else if (selectedNewMedId) {
                              handleAddMedToEditPrescription();
                            }
                          } else if (e.key === 'Escape') {
                            setIsMedDropdownOpen(false);
                          }
                        }}
                        placeholder="-- Cari & Pilih Obat Baru --"
                        className="w-full pl-8 pr-12 p-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        {(medSearchQuery || selectedNewMedId) && (
                          <button
                            type="button"
                            onClick={() => {
                              setMedSearchQuery('');
                              setSelectedNewMedId('');
                              setIsMedDropdownOpen(true);
                              setHighlightedMedIdx(0);
                            }}
                            className="p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                            title="Bersihkan pencarian"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsMedDropdownOpen((prev) => !prev)}
                          className="p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                          title="Tampilkan daftar obat"
                        >
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMedDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {isMedDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl z-40 max-h-56 overflow-y-auto divide-y divide-slate-100">
                          {filteredMedOptions.length === 0 ? (
                            <div className="p-3 text-center text-[11px] text-slate-400 italic">
                              Obat "{medSearchQuery}" tidak ditemukan dalam master obat.
                            </div>
                          ) : (
                            filteredMedOptions.map((m, idx) => {
                              const unitLabel = m.satuanKecil || m.unit;
                              const isHighlighted = idx === highlightedMedIdx;
                              const isSelected = selectedNewMedId === m.id;
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setSelectedNewMedId(m.id);
                                    setMedSearchQuery(`${m.name} (${unitLabel}) - Stok: ${m.stock}`);
                                    setIsMedDropdownOpen(false);
                                  }}
                                  onMouseEnter={() => setHighlightedMedIdx(idx)}
                                  className={`w-full text-left px-3 py-2 text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                                    isSelected
                                      ? 'bg-emerald-50 text-emerald-950 font-bold'
                                      : isHighlighted
                                      ? 'bg-slate-100 text-slate-900'
                                      : 'bg-white text-slate-800 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-900 truncate">{m.name}</div>
                                    <div className="text-[10px] text-slate-500 truncate">
                                      {m.kelas ? `${m.kelas} · ` : ''}Satuan: {unitLabel}
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                                      m.stock > 0
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-rose-100 text-rose-700'
                                    }`}
                                  >
                                    Stok: {m.stock}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddMedToEditPrescription}
                      disabled={!selectedNewMedId}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah</span>
                    </button>
                  </div>
                </div>

                {editPrescription.length === 0 ? (
                  <p className="text-slate-400 italic text-[11px] text-center py-2">
                    Tidak ada obat dalam resep ini.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {editPrescription.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-[200px]">
                          <span className="font-bold text-slate-900 block">{item.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Rp {item.price.toLocaleString('id-ID')} / {item.unit}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div>
                            <span className="text-[9px] text-slate-400 block font-bold">Qty:</span>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) =>
                                handleUpdatePresItem(idx, 'qty', parseInt(e.target.value) || 1)
                              }
                              className="w-16 p-1 border rounded-lg font-mono text-center font-bold"
                            />
                          </div>

                          <div className="w-48">
                            <span className="text-[9px] text-slate-400 block font-bold">Signa / Aturan:</span>
                            <input
                              type="text"
                              value={item.dosage}
                              onChange={(e) =>
                                handleUpdatePresItem(idx, 'dosage', e.target.value)
                              }
                              className="w-full p-1 border rounded-lg text-[11px]"
                              placeholder="3x1 Tablet Sesudah Makan"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveMedFromEditPrescription(idx)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition mt-3 cursor-pointer"
                            title="Hapus obat dari resep"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-2 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 font-bold rounded-xl text-xs text-slate-700 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Perubahan e-RME</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RME Detail & Printable Sheet Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-slate-200 my-6 flex flex-col max-h-[90vh]">
            {/* Modal Header (Non-print) */}
            <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap justify-between items-center gap-3 no-print shrink-0">
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wide">
                  {printType === 'rme'
                    ? 'Rekam Medis Elektronik (e-RME Pasien)'
                    : printType === 'copy-resep'
                    ? 'Salinan Resep (Copy Rx / Apograph) Baku'
                    : printType === 'etiket-obat'
                    ? 'Cetak Label Instruksi Penggunaan Obat (Etiket)'
                    : 'Surat Keterangan Sakit Dokter'}
                </h3>
                <p className="text-[10px] text-sky-400">ID Dokumen: {selectedRecord.id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrintType('rme')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    printType === 'rme'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  RME Lengkap
                </button>
                <button
                  type="button"
                  onClick={() => setPrintType('copy-resep')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    printType === 'copy-resep'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Copy Rx
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (etiketLabels.length === 0 && (selectedRecord.prescription?.length || 0) > 0) {
                      setEtiketLabels(buildMedicationLabelItems(selectedRecord.prescription || [], medicines));
                    }
                    setPrintType('etiket-obat');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer inline-flex items-center gap-1 ${
                    printType === 'etiket-obat'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Tag className="w-3 h-3" />
                  <span>Label Obat</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintType('surat-sakit')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    printType === 'surat-sakit'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Surat Sakit
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="text-slate-400 hover:text-white transition cursor-pointer ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {printType === 'etiket-obat' ? (
              <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
                <MedicationLabelConfigurator
                  labels={etiketLabels}
                  onChangeLabels={setEtiketLabels}
                  layout={etiketLayout}
                  onChangeLayout={setEtiketLayout}
                  rxId={`CRX/${selectedRecord.id}`}
                  rmId={selectedRecord.rmId}
                  patientName={selectedRecord.patientName}
                  patientAge={selectedRecord.age ? String(selectedRecord.age) : undefined}
                  date={selectedRecord.date}
                  pharmacyName={pharmacyProfile.name}
                  pharmacyAddress={pharmacyFullAddress}
                  pharmacyPhone={pharmacyProfile.phone}
                  pharmacySia={pharmacyProfile.sia}
                  apjName={apjProfile.name}
                  apjSipa={apjProfile.sipa}
                />
              </div>
            ) : (
              <>
                {/* Printable Content Body */}
                <div id="printable-section" className="p-8 space-y-6 text-xs text-slate-800 bg-white overflow-y-auto flex-1">
              {/* Clinic Letterhead Terintegrasi Profil Apotek, APJ, dan DPJ */}
              <div className="border-b-2 border-slate-900 pb-4">
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
                  <div className="flex-1 text-center">
                    <h2 className="text-base font-black tracking-wider text-slate-900 uppercase">
                      {pharmacyProfile.name}
                    </h2>
                    <p className="text-[11px] text-slate-600 mt-0.5">
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
                <div className="text-center">
                  <div className="mt-2 inline-block px-4 py-1 bg-sky-50 text-sky-900 rounded-full font-black text-xs uppercase border border-sky-200">
                    {printType === 'rme'
                      ? 'RESUME REKAM MEDIS PASIEN'
                      : printType === 'copy-resep'
                      ? 'SALINAN RESEP (COPY RESEP / APOGRAPH)'
                      : 'SURAT KETERANGAN ISTIRAHAT SAKIT'}
                  </div>
                </div>
              </div>

              {printType === 'rme' ? (
                <>
                  {/* Patient Info Strip */}
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Identitas Pasien</span>
                      <div className="font-bold text-sm text-slate-900 mt-0.5">{selectedRecord.patientName}</div>
                      <div className="font-mono text-slate-600 mt-0.5">
                        No. RM: <strong>{selectedRecord.rmId}</strong> · {selectedRecord.gender}, {selectedRecord.age} tahun
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Waktu Pemeriksaan</span>
                      <div className="font-bold text-slate-800 mt-0.5">{selectedRecord.date} · {selectedRecord.time} WIB</div>
                      <div className="text-slate-600">Dokter: <strong>{selectedRecord.doctorName}</strong></div>
                    </div>
                  </div>

                  {/* Petugas Bertugas Strip */}
                  {selectedRecord.assignedStaff && selectedRecord.assignedStaff.length > 0 && (
                    <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 text-xs">
                      <span className="text-[10px] text-indigo-900 font-bold uppercase block mb-1">
                        Tim Petugas Medis Bertugas (Data Pegawai):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {selectedRecord.assignedStaff.map((st, i) => (
                          <span
                            key={i}
                            className="bg-white px-2 py-1 rounded-md border border-indigo-200 text-indigo-950 text-[10px] font-medium"
                          >
                            <strong>{st.staffName}</strong> ({st.role})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tanda Vital */}
                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50 font-mono text-xs flex flex-wrap gap-4 justify-between">
                    <span>TD: <strong>{selectedRecord.vitalSign.td} mmHg</strong></span>
                    <span>Suhu: <strong>{selectedRecord.vitalSign.suhu}°C</strong></span>
                    <span>Nadi: <strong>{selectedRecord.vitalSign.nadi} bpm</strong></span>
                    <span>SpO2: <strong>{selectedRecord.vitalSign.spo2}%</strong></span>
                    {selectedRecord.vitalSign.bb && <span>BB: <strong>{selectedRecord.vitalSign.bb} kg</strong></span>}
                  </div>

                  {/* SOAP Breakdown */}
                  <div className="space-y-3">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <strong className="text-sky-800 block text-[11px] mb-0.5 font-extrabold uppercase">
                        S - Subjective (Anamnesis):
                      </strong>
                      <p className="text-slate-700">{selectedRecord.soapS}</p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <strong className="text-sky-800 block text-[11px] mb-0.5 font-extrabold uppercase">
                        O - Objective (Pemeriksaan Fisik):
                      </strong>
                      <p className="text-slate-700">{selectedRecord.soapO}</p>
                    </div>

                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <strong className="text-emerald-900 block text-[11px] mb-0.5 font-extrabold uppercase">
                        A - Assessment (Diagnosis ICD-10):
                      </strong>
                      <p className="font-extrabold text-emerald-950 text-sm">{selectedRecord.soapA}</p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <strong className="text-sky-800 block text-[11px] mb-0.5 font-extrabold uppercase">
                        P - Plan (Rencana Terapi & Edukasi):
                      </strong>
                      <p className="text-slate-700">{selectedRecord.soapP || 'Edukasi dan terapi farmakologis sesuai resep.'}</p>
                    </div>
                  </div>

                  {/* Therapy / Prescription Table */}
                  <div className="space-y-2">
                    <h5 className="font-black text-xs text-slate-800 uppercase tracking-wider">
                      Resep Obat yang Diterbitkan (Therapy):
                    </h5>
                    <table className="w-full text-left text-xs border border-collapse">
                      <thead className="bg-slate-100 font-bold text-slate-700">
                        <tr>
                          <th className="p-2 border">Nama Obat</th>
                          <th className="p-2 border w-16 text-center">Jumlah</th>
                          <th className="p-2 border">Signa / Aturan Minum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRecord.prescription && selectedRecord.prescription.length > 0 ? (
                          selectedRecord.prescription.map((item, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="p-2 border font-bold">{item.name}</td>
                              <td className="p-2 border text-center font-mono font-bold">{item.qty} {item.unit}</td>
                              <td className="p-2 border italic">{item.dosage}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="p-3 text-center text-slate-400 italic">
                              Tidak ada obat yang diresepkan pada kunjungan ini.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : printType === 'copy-resep' ? (
                /* FORMAT BAKU SALINAN RESEP (COPY RX / APOGRAPH) SESUAI ATURAN PENULISAN RESEP */
                (() => {
                  const patientInfo = lookupPatientForRx(selectedRecord.rmId, selectedRecord.patientName);
                  const patientAddress = patientInfo?.address || `${pharmacyProfile.city} (Sesuai Data Rekam Medis)`;
                  const patientPhone = patientInfo?.phone || '-';
                  const patientAllergy = patientInfo?.allergy || 'Tidak ada riwayat alergi obat';

                  return (
                    <div className="space-y-4 text-xs text-slate-900">
                      {/* 1. INSCRIPTIO: Identitas Administratif Resep, Dokter & Pasien */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-300 text-[11px]">
                        <div className="space-y-1 border-b sm:border-b-0 sm:border-r border-slate-300 pb-2 sm:pb-0 sm:pr-3">
                          <div className="text-[10px] font-black uppercase tracking-wider text-indigo-900 mb-1">
                            I. Inscriptio (Asal Resep & Dokter Penulis)
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-5 text-slate-600 font-semibold">No. Salinan Resep</span>
                            <span className="col-span-7 font-mono font-black text-slate-900">: CRX/{selectedRecord.id}</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-5 text-slate-600 font-semibold">Dari Dokter</span>
                            <span className="col-span-7 font-bold text-slate-900">: {selectedRecord.doctorName || dpjProfile.name}</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-5 text-slate-600 font-semibold">No. SIP Dokter</span>
                            <span className="col-span-7 font-mono text-slate-800">: {dpjProfile.sip}</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-5 text-slate-600 font-semibold">Tertanggal Resep</span>
                            <span className="col-span-7 font-mono font-bold text-slate-900">: {selectedRecord.date} ({selectedRecord.time} WIB)</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-5 text-slate-600 font-semibold">Tgl. Copy Resep</span>
                            <span className="col-span-7 font-mono text-slate-800">: {selectedRecord.date}</span>
                          </div>
                        </div>

                        <div className="space-y-1 sm:pl-1">
                          <div className="text-[10px] font-black uppercase tracking-wider text-indigo-900 mb-1">
                            II. Identitas Lengkap Pasien (Pro)
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-600 font-semibold">Pro (Pasien)</span>
                            <span className="col-span-8 font-black text-slate-900">: {selectedRecord.patientName} ({selectedRecord.rmId})</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-600 font-semibold">Umur / JK</span>
                            <span className="col-span-8 font-bold text-slate-800">
                              : {selectedRecord.age} Tahun / {selectedRecord.gender}
                              {selectedRecord.vitalSign?.bb ? ` · BB: ${selectedRecord.vitalSign.bb} kg` : ''}
                            </span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-600 font-semibold">Alamat</span>
                            <span className="col-span-8 text-slate-800 truncate" title={patientAddress}>: {patientAddress}</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-600 font-semibold">No. Telp</span>
                            <span className="col-span-8 font-mono text-slate-800">: {patientPhone}</span>
                          </div>
                          <div className="grid grid-cols-12">
                            <span className="col-span-4 text-slate-600 font-semibold">Alergi Obat</span>
                            <span className="col-span-8 font-bold text-rose-700">: {patientAllergy}</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. INVOCATIO (R/), PRAESCRIPTIO / ORDONATIO, SIGNATURA (S), & SUBSCRIPTIO (det) */}
                      <div className="border-2 border-slate-900 rounded-2xl p-5 bg-white space-y-4 min-h-[250px] flex flex-col justify-between">
                        <div className="space-y-4">
                          {selectedRecord.prescription && selectedRecord.prescription.length > 0 ? (
                            selectedRecord.prescription.map((item, idx) => {
                              const romanQty = toRomanNumeral(item.qty);
                              const signa = formatStandardSigna(item.dosage, item.unit);
                              return (
                                <div key={idx} className="pb-3 border-b border-dashed border-slate-300 last:border-b-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1">
                                      {/* Invocatio: Tanda R/ */}
                                      <span className="font-serif italic font-black text-lg text-slate-900 leading-none select-none pt-0.5">
                                        R/
                                      </span>
                                      <div className="flex-1 space-y-1">
                                        {/* Praescriptio / Ordonatio: Nama Sediaan + Numero Angka Romawi */}
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                          <span className="font-bold text-sm text-slate-900">
                                            {item.name}
                                          </span>
                                          <span className="font-serif font-black text-sm text-slate-900 tracking-wide">
                                            No. {romanQty}{' '}
                                            <span className="font-sans font-normal text-[11px] text-slate-600">
                                              ({item.qty} {item.unit})
                                            </span>
                                          </span>
                                        </div>

                                        {/* Signatura: Simbol S + Aturan Pakai Latin & Indonesia */}
                                        <div className="pl-3 flex flex-wrap items-baseline gap-2 text-slate-800">
                                          <span className="font-serif italic font-black text-sm text-slate-900">
                                            ∫
                                          </span>
                                          <span className="font-mono font-bold text-xs text-indigo-950">
                                            {signa.latin}
                                          </span>
                                          <span className="text-[11px] text-slate-700 italic">
                                            — ({signa.clearText}{item.notes ? ` · ${item.notes}` : ''})
                                          </span>
                                        </div>

                                        {/* Garis Penutup Setiap R/ + Paraf */}
                                        <div className="pt-1.5 flex items-center gap-2">
                                          <div className="flex-1 border-b border-slate-400" />
                                          <span className="text-[9px] font-mono text-slate-500 italic">paraf</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Keterangan Penyerahan Salinan Resep (det / nedet) */}
                                    <div className="shrink-0 text-right pl-2">
                                      <span className="inline-block px-2.5 py-1 rounded border border-slate-800 bg-slate-100 font-serif italic font-black text-xs text-slate-900">
                                        det orig
                                      </span>
                                      <span className="block text-[9px] text-slate-500 mt-0.5 font-mono">
                                        (Sudah diserahkan)
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="py-12 text-center text-slate-400 italic">
                              Tidak ada item obat pada resep kunjungan ini.
                            </div>
                          )}
                        </div>

                        {/* Tanda Penutup Salinan Resep: p.c.c (Pro Copia Conform) */}
                        <div className="pt-4 border-t-2 border-slate-800 flex items-center justify-between text-xs">
                          <div className="text-[10px] text-slate-600">
                            <div>
                              <strong>Diagnosa Klinis (ICD-10):</strong> {selectedRecord.soapA}
                            </div>
                          </div>
                          <div className="text-right shrink-0 pl-4">
                            <span className="font-serif italic font-black text-base tracking-widest text-slate-900 border-2 border-slate-900 px-3 py-0.5 rounded">
                              p. c. c
                            </span>
                            <span className="block text-[9px] text-slate-600 font-semibold mt-0.5">
                              (Pro Copia Conform / Sesuai Aslinya)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* Surat Sakit Format */
                <div className="space-y-4 py-4 text-xs leading-relaxed">
                  <p>
                    Yang bertanda tangan di bawah ini, Dokter Pemeriksa <strong>{pharmacyProfile.name}</strong> ({dpjProfile.name} · {dpjProfile.specialization}) menerangkan bahwa:
                  </p>
                  <div className="pl-6 space-y-1.5 font-medium">
                    <div className="grid grid-cols-4">
                      <span className="text-slate-500">Nama Pasien</span>
                      <span className="col-span-3 font-bold text-slate-900">: {selectedRecord.patientName}</span>
                    </div>
                    <div className="grid grid-cols-4">
                      <span className="text-slate-500">No. Rekam Medis</span>
                      <span className="col-span-3 font-mono font-bold">: {selectedRecord.rmId}</span>
                    </div>
                    <div className="grid grid-cols-4">
                      <span className="text-slate-500">Umur / Gender</span>
                      <span className="col-span-3">: {selectedRecord.age} tahun / {selectedRecord.gender}</span>
                    </div>
                    <div className="grid grid-cols-4">
                      <span className="text-slate-500">Diagnosis Medis</span>
                      <span className="col-span-3 font-bold text-emerald-800">: {selectedRecord.soapA}</span>
                    </div>
                  </div>

                  <p>
                    Berdasarkan hasil pemeriksaan klinis kami, yang bersangkutan dalam keadaan <strong>SAKIT</strong> dan memerlukan istirahat selama <strong>2 (dua) hari</strong> terhitung sejak tanggal <strong>{selectedRecord.date}</strong> sampai dengan <strong>{new Date(Date.now() + 86400000).toISOString().split('T')[0]}</strong>.
                  </p>
                  <p>Demikian surat keterangan ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>
                </div>
              )}

              {/* Signature Block: Copy Resep (APJ p.c.c only) vs RME / Surat Sakit */}
              {printType === 'copy-resep' ? (
                <div className="grid grid-cols-2 pt-4 text-xs gap-4">
                  <div />
                  <div className="text-center space-y-12">
                    <p className="font-semibold text-slate-700">
                      {pharmacyProfile.city}, {selectedRecord.date}<br />
                      Disalin Sesuai Aslinya (p.c.c) Oleh Apoteker (APJ),
                    </p>
                    <div>
                      <p className="font-extrabold underline text-slate-900">{apjProfile.name}</p>
                      <p className="text-[10px] text-slate-600 font-mono">SIPA: {apjProfile.sipa}</p>
                      <p className="text-[10px] text-slate-500 font-mono">STRA: {apjProfile.stra}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 pt-6 text-xs">
                  <div />
                  <div className="text-center space-y-14">
                    <p className="font-semibold text-slate-700">
                      {pharmacyProfile.city}, {selectedRecord.date}<br />
                      Dokter Pemeriksa / Penanggung Jawab Klinis,
                    </p>
                    <div>
                      <p className="font-extrabold underline text-slate-900">{selectedRecord.doctorName || dpjProfile.name}</p>
                      <p className="text-[10px] text-slate-600 font-mono">SIP: {dpjProfile.sip}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{dpjProfile.idi}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
              </>
            )}

            {/* Modal Actions (Non-print) */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2 no-print shrink-0">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 font-bold rounded-xl text-xs text-slate-700 cursor-pointer"
              >
                Tutup
              </button>
              <div className="flex flex-wrap items-center gap-2">
                {printType === 'etiket-obat' ? (
                  <button
                    type="button"
                    disabled={etiketLabels.filter((l) => l.selected).length === 0}
                    onClick={() => selectedRecord && handlePrintRmeEtiket(selectedRecord)}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-95 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>
                      Cetak Label Obat (
                      {etiketLabels
                        .filter((l) => l.selected)
                        .reduce((s, l) => s + Math.max(1, l.copies || 1), 0)}{' '}
                      Etiket)
                    </span>
                  </button>
                ) : (
                  <>
                    {(selectedRecord.prescription?.length || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (etiketLabels.length === 0) {
                            setEtiketLabels(
                              buildMedicationLabelItems(selectedRecord.prescription || [], medicines)
                            );
                          }
                          setPrintType('etiket-obat');
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <Tag className="w-4 h-4" />
                        <span>Cetak Label Obat (Etiket)</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedRecord) {
                          try {
                            demoSetItem('latisha_active_print_rme', JSON.stringify(selectedRecord));
                          } catch (e) {}
                          openPrintWindow(printType, { rmeId: selectedRecord.id });
                        }
                      }}
                      className="px-6 py-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>
                        {printType === 'copy-resep'
                          ? 'Cetak Salinan Resep / Copy Rx (Ctrl+P)'
                          : 'Cetak Dokumen Resmi (Ctrl+P)'}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* In-App Delete Confirmation Modal Dialog */}
      {deleteConfirmState.isOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-inner">
                <Trash2 className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  {deleteConfirmState.type === 'bulk'
                    ? `Hapus ${deleteConfirmState.count} Catatan RME?`
                    : 'Hapus Catatan Rekam Medis?'}
                </h4>
                <div className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {deleteConfirmState.type === 'bulk' ? (
                    <p>
                      Apakah Anda yakin ingin menghapus <strong>{deleteConfirmState.count}</strong> catatan RME yang dipilih secara permanen?
                    </p>
                  ) : (
                    <p>
                      Apakah Anda yakin ingin menghapus catatan RME untuk pasien <strong>"{deleteConfirmState.patientName}"</strong> (ID: {deleteConfirmState.id})?
                    </p>
                  )}
                  <span className="text-rose-600 font-semibold mt-1 inline-block">
                    Data yang dihapus tidak dapat dipulihkan.
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmState({ isOpen: false, type: 'single' })}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExecuteDelete}
                  className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Ya, Hapus Permanen</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Skema SQL Tabel medical_records Supabase (APJ / Owner Only) */}
      {isOwnerAdmin && showRmeSqlModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm tracking-wide">
                  Skema SQL Tabel medical_records (Arsip e-RME) Supabase
                </h3>
              </div>
              <button
                onClick={() => setShowRmeSqlModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 font-mono text-xs bg-slate-950 text-emerald-400">
              <div className="flex justify-between items-center text-slate-400 text-[11px]">
                <span>-- Copy &amp; Paste ke SQL Editor Supabase</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_RME_SQL_SCHEMA);
                    setCopiedRmeSql(true);
                    setTimeout(() => setCopiedRmeSql(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 font-sans transition-all cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedRmeSql ? 'Tersalin!' : 'Salin Skrip DDL SQL'}</span>
                </button>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed select-all">
                {SUPABASE_RME_SQL_SCHEMA}
              </pre>
            </div>
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRmeSqlModal(false)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 cursor-pointer"
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
