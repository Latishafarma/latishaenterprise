import React, { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import {
  X,
  User,
  Search,
  Plus,
  Trash2,
  Save,
  Users,
  Check,
  HeartPulse,
  Pill,
  FilePlus2,
  ChevronDown,
  AlertCircle,
  Loader2
} from 'lucide-react';
import {
  RMERecord,
  EPrescription,
  Patient,
  Staff,
  Medicine,
  ICD10Item,
  StaffFeeItem,
  PrescriptionItem,
  VitalSign,
  FeeConfig
} from '../types';
import { useFacilityProfiles } from '../utils/facilityProfileHelper';
import { useIsOwnerAdmin } from '../utils/roleAccess';

export interface ManualRmeSubmitResult {
  success: boolean;
  syncedToCloud?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}

interface ManualRMEModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  staffList: Staff[];
  medicines: Medicine[];
  icd10List: ICD10Item[];
  currentBranchId?: string;
  feeConfig?: FeeConfig;
  onToggleStaffFeeEnabled?: (enabled: boolean) => void | Promise<any>;
  onSubmit: (record: RMERecord, prescription?: EPrescription) => Promise<ManualRmeSubmitResult>;
}

export const ManualRMEModal: React.FC<ManualRMEModalProps> = ({
  isOpen,
  onClose,
  patients,
  staffList,
  medicines,
  icd10List,
  currentBranchId = 'BR-01',
  feeConfig,
  onToggleStaffFeeEnabled,
  onSubmit
}) => {
  const { dpjProfile } = useFacilityProfiles();
  const isOwnerAdmin = useIsOwnerAdmin();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const nowTimeStr = useMemo(
    () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    []
  );

  // Basic Patient & Visit Info (Starts clean/empty for new manual RME entry)
  const [patientQuery, setPatientQuery] = useState('');
  const deferredPatientQuery = useDeferredValue(patientQuery);
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const patientDropdownRef = useRef<HTMLDivElement | null>(null);

  const [patientName, setPatientName] = useState('');
  const [rmId, setRmId] = useState('');
  const [nik, setNik] = useState('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<'Laki-laki' | 'Perempuan'>('Laki-laki');
  const [visitDate, setVisitDate] = useState(todayStr);
  const [visitTime, setVisitTime] = useState(nowTimeStr);
  const [doctorId, setDoctorId] = useState('');
  const [doctorName, setDoctorName] = useState('');

  // Assigned Staff & Fees
  const [assignedStaff, setAssignedStaff] = useState<StaffFeeItem[]>([]);
  const [doctorFee, setDoctorFee] = useState<number>(feeConfig?.doctorFee ?? 20000);
  const [medicalSupportFee, setMedicalSupportFee] = useState<number>(
    feeConfig?.medicalSupportFee ?? 5000
  );
  const [adminFee, setAdminFee] = useState<number>(feeConfig?.adminFee ?? 1000);
  const [localStaffFeeEnabled, setLocalStaffFeeEnabled] = useState<boolean>(
    feeConfig ? feeConfig.rmeStaffFeeEnabled !== false : true
  );
  const staffFeeEnabled = feeConfig ? feeConfig.rmeStaffFeeEnabled !== false : localStaffFeeEnabled;

  const handleToggleGlobalStaffFee = (enabled: boolean) => {
    if (!isOwnerAdmin) return;
    setLocalStaffFeeEnabled(enabled);
    if (onToggleStaffFeeEnabled) {
      Promise.resolve(onToggleStaffFeeEnabled(enabled)).catch((err) =>
        console.warn('Gagal menyinkronkan status jasa petugas RME:', err)
      );
    }
  };

  // Vital Signs (Starts empty for clean manual input)
  const [vital, setVital] = useState<{
    td: string;
    suhu: string;
    nadi: string;
    spo2: string;
    bb: string;
    tb: string;
  }>({
    td: '',
    suhu: '',
    nadi: '',
    spo2: '',
    bb: '',
    tb: ''
  });

  // SOAP & ICD-10
  const [soapS, setSoapS] = useState('');
  const [soapO, setSoapO] = useState('');
  const [soapA, setSoapA] = useState('');
  const [soapP, setSoapP] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedIcds, setSelectedIcds] = useState<ICD10Item[]>([]);
  const [icdQuery, setIcdQuery] = useState('');
  const deferredIcdQuery = useDeferredValue(icdQuery);
  const [isIcdDropdownOpen, setIsIcdDropdownOpen] = useState(false);
  const icdDropdownRef = useRef<HTMLDivElement | null>(null);

  // Prescription
  const [presItems, setPresItems] = useState<PrescriptionItem[]>([]);
  const [medQuery, setMedQuery] = useState('');
  const deferredMedQuery = useDeferredValue(medQuery);
  const [selectedMedId, setSelectedMedId] = useState('');
  const [isMedDropdownOpen, setIsMedDropdownOpen] = useState(false);
  const [highlightedMedIdx, setHighlightedMedIdx] = useState(0);
  const [dispatchToRxQueue, setDispatchToRxQueue] = useState(true);
  const medDropdownRef = useRef<HTMLDivElement | null>(null);

  // Submit state
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Click outside listeners for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (patientDropdownRef.current && !patientDropdownRef.current.contains(target)) {
        setIsPatientDropdownOpen(false);
      }
      if (icdDropdownRef.current && !icdDropdownRef.current.contains(target)) {
        setIsIcdDropdownOpen(false);
      }
      if (medDropdownRef.current && !medDropdownRef.current.contains(target)) {
        setIsMedDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Performance: Capped filtered patient suggestions (max 30 rows)
  const filteredPatients = useMemo(() => {
    const q = deferredPatientQuery.trim().toLowerCase();
    if (!q) return patients.slice(0, 30);
    const matches: Patient[] = [];
    for (let i = 0; i < patients.length; i++) {
      const p = patients[i];
      if (
        p.name.toLowerCase().includes(q) ||
        (p.noRm || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.nik || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      ) {
        matches.push(p);
        if (matches.length >= 30) break;
      }
    }
    return matches;
  }, [patients, deferredPatientQuery]);

  // Performance: Capped ICD-10 suggestions (max 30 rows)
  const filteredIcds = useMemo(() => {
    const q = deferredIcdQuery.trim().toLowerCase();
    if (!q) return icd10List.slice(0, 30);
    const matches: ICD10Item[] = [];
    for (let i = 0; i < icd10List.length; i++) {
      const item = icd10List[i];
      if (
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
      ) {
        matches.push(item);
        if (matches.length >= 30) break;
      }
    }
    return matches;
  }, [icd10List, deferredIcdQuery]);

  // Performance: Capped Medicine suggestions (max 40 rows)
  const selectedMedObj = useMemo(
    () => medicines.find((m) => m.id === selectedMedId),
    [medicines, selectedMedId]
  );
  const selectedMedDisplay = selectedMedObj
    ? `${selectedMedObj.name} (${selectedMedObj.satuanKecil || selectedMedObj.unit}) - Stok: ${selectedMedObj.stock}`
    : '';

  const filteredMedOptions = useMemo(() => {
    const q = deferredMedQuery.trim().toLowerCase();
    if (!q || (selectedMedId && deferredMedQuery === selectedMedDisplay)) {
      return medicines.slice(0, 40);
    }
    const matches: Medicine[] = [];
    for (let i = 0; i < medicines.length; i++) {
      const m = medicines[i];
      if (
        m.name.toLowerCase().includes(q) ||
        (m.kelas || '').toLowerCase().includes(q) ||
        (m.category || '').toLowerCase().includes(q) ||
        (m.kekuatan || '').toLowerCase().includes(q) ||
        (m.barcode || '').toLowerCase().includes(q)
      ) {
        matches.push(m);
        if (matches.length >= 40) break;
      }
    }
    return matches;
  }, [medicines, deferredMedQuery, selectedMedId, selectedMedDisplay]);

  if (!isOpen) return null;

  const handleSelectPatient = (p: Patient) => {
    const resolvedRm = p.noRm || p.id;
    setSelectedPatientId(p.id);
    setPatientQuery(`${p.name} (${resolvedRm})`);
    setPatientName(p.name);
    setRmId(resolvedRm);
    setNik(p.nik || '');
    setAge(p.age !== undefined && p.age !== null && Number(p.age) > 0 ? String(p.age) : '');
    setGender(p.gender === 'Perempuan' ? 'Perempuan' : 'Laki-laki');
    setIsPatientDropdownOpen(false);
    setFormError(null);
  };

  const handleSelectDoctor = (selectedId: string) => {
    const found = staffList.find((s) => s.id === selectedId);
    if (!found) {
      setDoctorId('');
      setDoctorName('');
      return;
    }
    setDoctorId(found.id);
    setDoctorName(found.name);
    setAssignedStaff((prev) => {
      const exists = prev.some((s) => s.staffId === found.id || s.staffName === found.name);
      if (exists) return prev;
      return [
        {
          staffId: found.id,
          staffName: found.name,
          role: found.role,
          fee: staffFeeEnabled ? doctorFee || 20000 : 0
        },
        ...prev.filter((s) => s.role !== 'Dokter')
      ];
    });
  };

  const handleToggleStaff = (staff: Staff) => {
    const exists = assignedStaff.some((s) => s.staffId === staff.id || s.staffName === staff.name);
    if (exists) {
      const next = assignedStaff.filter((s) => s.staffId !== staff.id && s.staffName !== staff.name);
      setAssignedStaff(next);
      if (staff.role === 'Dokter' && doctorName === staff.name) {
        const remainingDoc = next.find((s) => s.role === 'Dokter');
        if (remainingDoc) {
          setDoctorName(remainingDoc.staffName);
          setDoctorId(remainingDoc.staffId);
        }
      }
    } else {
      let fee = staffFeeEnabled ? 5000 : 0;
      if (staff.role === 'Dokter') {
        fee = staffFeeEnabled ? doctorFee || 20000 : 0;
        setDoctorName(staff.name);
        setDoctorId(staff.id);
      } else if (staff.role === 'Perawat / Bidan' || staff.role === 'Perawat / Nakes Lapangan') {
        fee = staffFeeEnabled ? medicalSupportFee || 5000 : 0;
      } else if (staff.role === 'Kasir & Front Office') {
        fee = staffFeeEnabled ? adminFee || 1000 : 0;
      }
      setAssignedStaff((prev) => [
        ...prev,
        {
          staffId: staff.id,
          staffName: staff.name,
          role: staff.role,
          fee
        }
      ]);
    }
  };

  const handleAddIcd = (item: ICD10Item) => {
    if (!selectedIcds.some((i) => i.code === item.code)) {
      const next = [...selectedIcds, item];
      setSelectedIcds(next);
      const formatted = next.map((i) => `${i.code} - ${i.name}`).join('; ');
      setSoapA(formatted);
    }
    setIcdQuery('');
    setIsIcdDropdownOpen(false);
  };

  const handleRemoveIcd = (code: string) => {
    const next = selectedIcds.filter((i) => i.code !== code);
    setSelectedIcds(next);
    if (next.length > 0) {
      setSoapA(next.map((i) => `${i.code} - ${i.name}`).join('; '));
    }
  };

  const handleAddMed = () => {
    if (!selectedMedId) return;
    const med = medicines.find((m) => m.id === selectedMedId);
    if (!med) return;

    const newItem: PrescriptionItem = {
      medicineId: med.id,
      name: med.name,
      qty: 10,
      unit: med.satuanKecil || med.unit || 'Tablet',
      price: med.sellPriceKlinik || med.sellPrice || 0,
      dosage: '3x1 Tablet Sesudah Makan',
      notes: ''
    };
    setPresItems((prev) => [...prev, newItem]);
    setSelectedMedId('');
    setMedQuery('');
    setIsMedDropdownOpen(false);
    setHighlightedMedIdx(0);
  };

  const handleUpdatePresItem = (idx: number, field: keyof PrescriptionItem, value: any) => {
    setPresItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const handleRemovePresItem = (idx: number) => {
    setPresItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = patientName.trim();
    if (!cleanName) {
      setFormError('Nama pasien wajib diisi.');
      return;
    }

    const cleanDoctor = doctorName.trim() || dpjProfile.name || 'dr. Anis Prima Dewi';
    const cleanRm =
      rmId.trim() || `RM-MNL-${Date.now().toString().slice(-6)}`;
    const recordId = `RME-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const effectiveIcds: ICD10Item[] =
      selectedIcds.length > 0
        ? selectedIcds
        : soapA.trim()
        ? [{ code: 'Z00.0', name: soapA.trim(), category: 'Pemeriksaan Umum' }]
        : [{ code: 'J00', name: 'Pemeriksaan Klinis Manual', category: 'Umum' }];

    const joinedCodes = effectiveIcds.map((i) => i.code).join(', ');
    const joinedNames = effectiveIcds.map((i) => i.name).join('; ');

    const effectiveDoctorFee = staffFeeEnabled ? Math.max(0, Number(doctorFee) || 0) : 0;
    const effectiveSupportFee = staffFeeEnabled ? Math.max(0, Number(medicalSupportFee) || 0) : 0;
    const effectiveAdminFee = staffFeeEnabled ? Math.max(0, Number(adminFee) || 0) : 0;

    const assignedDoctor = assignedStaff.find((s) => s.role === 'Dokter');
    const baseAssignedStaff: StaffFeeItem[] =
      assignedStaff.length > 0
        ? assignedStaff
        : [
            {
              staffId: doctorId || 'STF-02',
              staffName: cleanDoctor,
              role: 'Dokter',
              fee: effectiveDoctorFee
            }
          ];

    const finalAssignedStaff: StaffFeeItem[] = baseAssignedStaff.map((item) => {
      if (!staffFeeEnabled) {
        return { ...item, fee: 0 };
      }
      if (item.role === 'Dokter') {
        return { ...item, fee: effectiveDoctorFee };
      }
      if (item.role === 'Perawat / Bidan' || item.role === 'Perawat / Nakes Lapangan') {
        return { ...item, fee: effectiveSupportFee };
      }
      if (item.role === 'Kasir & Front Office') {
        return { ...item, fee: effectiveAdminFee };
      }
      return item;
    });

    const resolvedVital: VitalSign = {
      td: vital.td.trim() || '-',
      suhu: parseFloat(vital.suhu) || 0,
      nadi: parseInt(vital.nadi, 10) || 0,
      spo2: parseInt(vital.spo2, 10) || 0,
      bb: parseFloat(vital.bb) || 0,
      tb: parseFloat(vital.tb) || 0
    };

    const vitalSummaryParts = [
      vital.td.trim() ? `TD: ${vital.td.trim()} mmHg` : '',
      vital.suhu.trim() ? `Suhu: ${vital.suhu.trim()}°C` : '',
      vital.nadi.trim() ? `Nadi: ${vital.nadi.trim()} bpm` : '',
      vital.spo2.trim() ? `SpO2: ${vital.spo2.trim()}%` : ''
    ].filter(Boolean);

    const newRecord: RMERecord = {
      id: recordId,
      date: visitDate || todayStr,
      time: visitTime || nowTimeStr,
      rmId: cleanRm,
      patientName: cleanName,
      nik: nik.trim(),
      age: Math.max(0, parseInt(age, 10) || 0),
      gender,
      doctorName: assignedDoctor ? assignedDoctor.staffName : cleanDoctor,
      doctorId: assignedDoctor ? assignedDoctor.staffId : doctorId || 'STF-02',
      vitalSign: resolvedVital,
      soapS: soapS.trim() || '-',
      soapO:
        soapO.trim() ||
        (vitalSummaryParts.length > 0 ? vitalSummaryParts.join(', ') : '-'),
      soapA: soapA.trim() || effectiveIcds.map((i) => `${i.code} - ${i.name}`).join('; '),
      soapP: soapP.trim() || 'Edukasi pasien dan terapi sesuai anjuran dokter.',
      icdCode: joinedCodes,
      icdName: joinedNames,
      icdList: effectiveIcds,
      prescription: presItems,
      doctorFee: effectiveDoctorFee,
      medicalSupportFee: effectiveSupportFee,
      adminFee: effectiveAdminFee,
      assignedStaff: finalAssignedStaff,
      notes: notes.trim(),
      branchId: currentBranchId || 'BR-01'
    };

    let newPrescription: EPrescription | undefined = undefined;
    if (presItems.length > 0 && dispatchToRxQueue) {
      newPrescription = {
        id: `RX-${Date.now().toString().slice(-6)}`,
        rmeRecordId: recordId,
        rmId: cleanRm,
        patientName: cleanName,
        patientAge: newRecord.age,
        doctorName: newRecord.doctorName,
        items: presItems,
        status: 'Pending Skrining',
        timestamp: `${newRecord.date} ${newRecord.time}`.trim(),
        assignedStaff: finalAssignedStaff,
        screeningChecks: {
          admin: { namaDokter: true, sip: true, tglResep: true, paraf: true },
          farmasetik: { bentukSediaan: true, dosis: true, stabilitas: true, kompatibilitas: true },
          klinis: { tepatDosis: true, tepatWaktu: true, kontraIndikasi: true, interaksi: true }
        },
        branchId: currentBranchId || 'BR-01'
      };
    }

    setIsSubmitting(true);
    try {
      const res = await onSubmit(newRecord, newPrescription);
      if (res && res.success === false && !res.isDemo && res.error && !res.syncedToCloud) {
        // Record saved locally & queued for cloud sync; parent banner will show notice
        onClose();
        return;
      }
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Gagal menyimpan catatan RME manual.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-200 my-4 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-extrabold text-sm uppercase tracking-wide flex items-center gap-2">
              <FilePlus2 className="w-4 h-4 text-sky-400" />
              Input RME Manual (Rekam Medis Elektronik)
            </h3>
            <p className="text-[10px] text-sky-300 mt-0.5">
              Catat rekam medis pasien secara langsung — otomatis tersimpan & sinkron dua arah dengan Supabase.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white transition cursor-pointer p-1"
            title="Tutup form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleFormSubmit} className="p-5 sm:p-6 space-y-5 text-xs text-slate-800 overflow-y-auto flex-1">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: Pilih Pasien & Info Kunjungan */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-black text-[11px] text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-600" />
                1. Identitas Pasien & Waktu Kunjungan
              </span>
              <span className="text-[10px] text-slate-500">
                Pilih dari database pasien ({patients.length.toLocaleString('id-ID')}) atau ketik manual
              </span>
            </div>

            {/* Autocomplete Patient Lookup */}
            <div ref={patientDropdownRef} className="relative">
              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                Cari Pasien Terdaftar (Opsional - Otomatis Isi Data Pasien)
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={patientQuery}
                  onFocus={() => setIsPatientDropdownOpen(true)}
                  onChange={(e) => {
                    setPatientQuery(e.target.value);
                    setSelectedPatientId('');
                    setIsPatientDropdownOpen(true);
                  }}
                  placeholder="Ketik nama pasien, No. RM, NIK, atau No. HP..."
                  className="w-full pl-9 pr-9 py-2 border border-sky-300 rounded-xl bg-white text-slate-900 font-semibold focus:ring-2 focus:ring-sky-500 outline-none"
                />
                {patientQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setPatientQuery('');
                      setSelectedPatientId('');
                      setIsPatientDropdownOpen(true);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    title="Reset pencarian pasien"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isPatientDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl z-40 max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {filteredPatients.length === 0 ? (
                    <div className="p-3 text-center text-[11px] text-slate-400 italic">
                      Pasien tidak ditemukan di database — silakan isi nama pasien secara manual di kolom bawah.
                    </div>
                  ) : (
                    filteredPatients.map((p) => {
                      const pRm = p.noRm || p.id;
                      const isSel = selectedPatientId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectPatient(p);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition cursor-pointer ${
                            isSel ? 'bg-sky-50 text-sky-950 font-bold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 truncate">{p.name}</div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {p.gender} · {p.age} th {p.nik ? `· NIK: ${p.nik}` : ''}
                            </div>
                          </div>
                          <span className="shrink-0 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-mono text-[10px] font-bold">
                            {pRm}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Patient Detail Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                  Nama Pasien <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  required
                  placeholder="Contoh: Tn. Budi Santoso"
                  className="w-full p-2 border border-slate-300 rounded-xl font-bold bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">No. Rekam Medis (RM)</label>
                <input
                  type="text"
                  value={rmId}
                  onChange={(e) => setRmId(e.target.value)}
                  placeholder="Otomatis jika kosong"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-sky-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">NIK (Opsional)</label>
                <input
                  type="text"
                  value={nik}
                  onChange={(e) => setNik(e.target.value)}
                  placeholder="16 digit NIK"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Umur (Tahun)</label>
                <input
                  type="number"
                  min="0"
                  max="150"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Contoh: 25"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Jenis Kelamin</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'Laki-laki' | 'Perempuan')}
                  className="w-full p-2 border border-slate-300 rounded-xl font-bold bg-white text-slate-900"
                >
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Tanggal</label>
                <input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  required
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Waktu (WIB)</label>
                <input
                  type="text"
                  value={visitTime}
                  onChange={(e) => setVisitTime(e.target.value)}
                  required
                  placeholder="08:30"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-800"
                />
              </div>
            </div>

            {/* Dokter Pemeriksa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Pilih Dokter dari Pegawai</label>
                <select
                  value={doctorId}
                  onChange={(e) => handleSelectDoctor(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl font-bold bg-white text-slate-900"
                >
                  <option value="">-- Pilih Dokter / Manual --</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                  Nama Dokter Pemeriksa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  required
                  placeholder="Contoh: dr. Anis Prima Dewi"
                  className="w-full p-2 border border-slate-300 rounded-xl font-bold bg-white text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Tim Petugas Medis Bertugas & Jasa Petugas */}
          <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-black text-[11px] text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                2. Tim Petugas Medis Bertugas
              </span>

              <div className="flex flex-wrap items-center gap-2">
                {isOwnerAdmin ? (
                  <label className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50/70 cursor-pointer select-none transition">
                    <input
                      type="checkbox"
                      checked={staffFeeEnabled}
                      onChange={(e) => handleToggleGlobalStaffFee(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-indigo-950">
                      Aktifkan Jasa Petugas
                    </span>
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                        staffFeeEnabled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {staffFeeEnabled ? 'Aktif' : 'Nonaktif (Rp 0)'}
                    </span>
                  </label>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-extrabold ${
                      staffFeeEnabled
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-300 text-slate-600'
                    }`}
                  >
                    {staffFeeEnabled
                      ? 'Jasa Petugas: Aktif'
                      : 'Jasa Petugas: Nonaktif oleh APJ / Owner (Rp 0)'}
                  </span>
                )}

                {staffList.length > 0 && (
                  <span className="text-[10px] text-indigo-700 font-semibold">
                    Terpilih: {assignedStaff.length} pegawai
                  </span>
                )}
              </div>
            </div>

            {staffList.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                {staffList.map((staff) => {
                  const isAssigned = assignedStaff.some(
                    (s) => s.staffId === staff.id || s.staffName === staff.name
                  );
                  return (
                    <label
                      key={staff.id}
                      className={`p-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition ${
                        isAssigned
                          ? 'bg-white border-indigo-400 shadow-2xs'
                          : 'bg-white/60 border-slate-200 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={() => handleToggleStaff(staff)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block text-[11px] truncate">
                            {staff.name}
                          </span>
                          <span className="text-[9px] text-slate-500 block truncate">
                            {staff.role}
                          </span>
                        </div>
                      </div>
                      {isAssigned && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                    </label>
                  );
                })}
              </div>
            )}

            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 ${!staffFeeEnabled ? 'opacity-60' : ''}`}>
              <div>
                <label className="block text-[9px] font-bold text-indigo-900 mb-0.5">Jasa Dokter (Rp)</label>
                <input
                  type="number"
                  min="0"
                  disabled={!staffFeeEnabled}
                  value={staffFeeEnabled ? doctorFee : 0}
                  onChange={(e) => setDoctorFee(parseInt(e.target.value, 10) || 0)}
                  className="w-full p-1.5 border border-indigo-200 rounded-lg font-mono font-bold bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-indigo-900 mb-0.5">Jasa Penunjang Medis (Bidan/Perawat) (Rp)</label>
                <input
                  type="number"
                  min="0"
                  disabled={!staffFeeEnabled}
                  value={staffFeeEnabled ? medicalSupportFee : 0}
                  onChange={(e) => setMedicalSupportFee(parseInt(e.target.value, 10) || 0)}
                  className="w-full p-1.5 border border-indigo-200 rounded-lg font-mono font-bold bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-indigo-900 mb-0.5">Biaya Admin (Rp)</label>
                <input
                  type="number"
                  min="0"
                  disabled={!staffFeeEnabled}
                  value={staffFeeEnabled ? adminFee : 0}
                  onChange={(e) => setAdminFee(parseInt(e.target.value, 10) || 0)}
                  className="w-full p-1.5 border border-indigo-200 rounded-lg font-mono font-bold bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            {!staffFeeEnabled && (
              <p className="text-[10px] text-slate-500 italic">
                Jasa petugas dinonaktifkan — nominal jasa dokter, penunjang medis, dan admin disimpan sebagai Rp 0.
              </p>
            )}
          </div>

          {/* Section 3: Tanda Vital */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <span className="font-black text-[11px] text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
              3. Tanda Vital (Vital Signs)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">TD (mmHg)</label>
                <input
                  type="text"
                  value={vital.td}
                  onChange={(e) => setVital({ ...vital, td: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-900"
                  placeholder="120/80"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Suhu (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={vital.suhu}
                  onChange={(e) => setVital({ ...vital, suhu: e.target.value })}
                  placeholder="36.5"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Nadi (bpm)</label>
                <input
                  type="number"
                  value={vital.nadi}
                  onChange={(e) => setVital({ ...vital, nadi: e.target.value })}
                  placeholder="80"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">SpO2 (%)</label>
                <input
                  type="number"
                  value={vital.spo2}
                  onChange={(e) => setVital({ ...vital, spo2: e.target.value })}
                  placeholder="98"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">BB (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={vital.bb}
                  onChange={(e) => setVital({ ...vital, bb: e.target.value })}
                  placeholder="60"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">TB (cm)</label>
                <input
                  type="number"
                  value={vital.tb}
                  onChange={(e) => setVital({ ...vital, tb: e.target.value })}
                  placeholder="165"
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-white text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Section 4: SOAP Medis & Diagnosis ICD-10 */}
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
                  value={soapS}
                  onChange={(e) => setSoapS(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium bg-white text-slate-900 text-xs"
                  placeholder="Keluhan subjektif pasien..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-sky-800 mb-1 uppercase">
                  O - Objective (Pemeriksaan Fisik & Penunjang)
                </label>
                <textarea
                  value={soapO}
                  onChange={(e) => setSoapO(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium bg-white text-slate-900 text-xs"
                  placeholder="Hasil pemeriksaan fisik objektif (otomatis terisi ringkasan tanda vital jika dikosongkan)..."
                />
              </div>

              {/* ICD-10 Picker */}
              <div ref={icdDropdownRef} className="relative space-y-2">
                <label className="block text-[10px] font-bold text-emerald-800 uppercase">
                  A - Assessment (Diagnosis ICD-10)
                </label>
                {icd10List.length > 0 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={icdQuery}
                      onFocus={() => setIsIcdDropdownOpen(true)}
                      onChange={(e) => {
                        setIcdQuery(e.target.value);
                        setIsIcdDropdownOpen(true);
                      }}
                      placeholder="Cari kode/nama penyakit ICD-10 (contoh: J00, I10, demam)..."
                      className="w-full pl-9 pr-3 py-1.5 border border-emerald-300 rounded-xl bg-white text-slate-800 text-xs font-medium"
                    />
                    {isIcdDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-emerald-300 rounded-xl shadow-xl z-40 max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {filteredIcds.length === 0 ? (
                          <div className="p-2.5 text-center text-[11px] text-slate-400 italic">
                            Kode ICD-10 tidak ditemukan — isi diagnosis langsung di kolom teks di bawah.
                          </div>
                        ) : (
                          filteredIcds.map((item) => (
                            <button
                              key={item.code}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleAddIcd(item);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-xs flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="truncate">
                                <span className="font-mono font-extrabold text-emerald-800 mr-2">
                                  {item.code}
                                </span>
                                <span className="text-slate-800 font-medium">{item.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 shrink-0">{item.category}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {selectedIcds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedIcds.map((item) => (
                      <span
                        key={item.code}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-[10px] font-bold"
                      >
                        <span>
                          {item.code} - {item.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveIcd(item.code)}
                          className="text-emerald-700 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  value={soapA}
                  onChange={(e) => setSoapA(e.target.value)}
                  className="w-full p-2.5 border border-emerald-300 rounded-xl font-bold bg-emerald-50/50 text-emerald-950 text-xs"
                  placeholder="Contoh: J00 - Nasofaringitis Akut / Common Cold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-sky-800 mb-1 uppercase">
                  P - Plan (Rencana Terapi, Anjuran & Edukasi)
                </label>
                <textarea
                  value={soapP}
                  onChange={(e) => setSoapP(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium bg-white text-slate-900 text-xs"
                  placeholder="Rencana terapi, tindakan medis, dan edukasi pasien..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1 uppercase">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl font-medium bg-white text-slate-900 text-xs"
                  placeholder="Catatan khusus kunjungan atau keterangan kontrol..."
                />
              </div>
            </div>
          </div>

          {/* Section 5: Terapi Obat / Resep (Opsional) */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-black text-[11px] text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5 text-emerald-600" />
                5. Terapi Obat / Resep (Opsional)
              </span>

              <div className="flex items-center gap-1.5 flex-1 sm:flex-initial sm:min-w-[340px]">
                <div ref={medDropdownRef} className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={medQuery}
                    onFocus={() => {
                      setIsMedDropdownOpen(true);
                      setHighlightedMedIdx(0);
                    }}
                    onChange={(e) => {
                      setMedQuery(e.target.value);
                      setSelectedMedId('');
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
                        if (isMedDropdownOpen && !selectedMedId && filteredMedOptions[highlightedMedIdx]) {
                          const chosen = filteredMedOptions[highlightedMedIdx];
                          setSelectedMedId(chosen.id);
                          setMedQuery(
                            `${chosen.name} (${chosen.satuanKecil || chosen.unit}) - Stok: ${chosen.stock}`
                          );
                          setIsMedDropdownOpen(false);
                        } else if (selectedMedId) {
                          handleAddMed();
                        }
                      } else if (e.key === 'Escape') {
                        setIsMedDropdownOpen(false);
                      }
                    }}
                    placeholder="-- Cari & Pilih Obat dari Master --"
                    className="w-full pl-8 pr-12 p-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {(medQuery || selectedMedId) && (
                      <button
                        type="button"
                        onClick={() => {
                          setMedQuery('');
                          setSelectedMedId('');
                          setIsMedDropdownOpen(true);
                          setHighlightedMedIdx(0);
                        }}
                        className="p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsMedDropdownOpen((prev) => !prev)}
                      className="p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${isMedDropdownOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>

                  {isMedDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl z-40 max-h-52 overflow-y-auto divide-y divide-slate-100">
                      {filteredMedOptions.length === 0 ? (
                        <div className="p-3 text-center text-[11px] text-slate-400 italic">
                          Obat "{medQuery}" tidak ditemukan dalam master obat.
                        </div>
                      ) : (
                        filteredMedOptions.map((m, idx) => {
                          const unitLabel = m.satuanKecil || m.unit;
                          const isHighlighted = idx === highlightedMedIdx;
                          const isSelected = selectedMedId === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSelectedMedId(m.id);
                                setMedQuery(`${m.name} (${unitLabel}) - Stok: ${m.stock}`);
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
                  onClick={handleAddMed}
                  disabled={!selectedMedId}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>
            </div>

            {presItems.length === 0 ? (
              <p className="text-slate-400 italic text-[11px] text-center py-2">
                Belum ada item obat ditambahkan (opsional).
              </p>
            ) : (
              <div className="space-y-2">
                {presItems.map((item, idx) => (
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
                            handleUpdatePresItem(idx, 'qty', parseInt(e.target.value, 10) || 1)
                          }
                          className="w-16 p-1 border rounded-lg font-mono text-center font-bold"
                        />
                      </div>

                      <div className="w-48">
                        <span className="text-[9px] text-slate-400 block font-bold">Signa / Aturan:</span>
                        <input
                          type="text"
                          value={item.dosage}
                          onChange={(e) => handleUpdatePresItem(idx, 'dosage', e.target.value)}
                          className="w-full p-1 border rounded-lg text-[11px]"
                          placeholder="3x1 Tablet Sesudah Makan"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemovePresItem(idx)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition mt-3 cursor-pointer"
                        title="Hapus obat"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <label className="flex items-center gap-2 pt-1 text-[11px] font-semibold text-emerald-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dispatchToRxQueue}
                    onChange={(e) => setDispatchToRxQueue(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>Terbitkan juga daftar obat ini ke Antrean E-Resep Farmasi</span>
                </label>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-2 rounded-2xl">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 font-bold rounded-xl text-xs text-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan & Sinkronkan...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Simpan RME Manual</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
