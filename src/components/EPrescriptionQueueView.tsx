import React, { useState, useEffect, useMemo } from 'react';
import { isDemoMode, demoGetItem, demoSetItem } from '../utils/demoSandbox';
import {
  FileCheck2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  X,
  Printer,
  Search,
  Database,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  FileText,
  User,
  Pill,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  BookOpen,
  GitCompare,
  RefreshCw,
  Wifi,
  WifiOff,
  Code,
  Trash2,
  Plus,
  Building2,
  MapPin,
  Stethoscope,
  Tag
} from 'lucide-react';
import { openPrintWindow } from '../utils/printHelper';
import { PaginationControls } from './PaginationControls';
import { MedicationLabelConfigurator } from './MedicationLabelConfigurator';
import {
  MedicationLabelItem,
  MedicationLabelLayout,
  buildMedicationLabelItems,
  saveMedicationLabelPrintPayload
} from '../utils/medicationLabelHelper';
import {
  EPrescription,
  PrescriptionItem,
  RMERecord,
  Patient,
  Medicine,
  DrugInteractionRecord,
  DrugInteractionSeverity,
  InteractionCheckResult
} from '../types';
import {
  INITIAL_INTERAKSI_OBAT,
  SEVERITY_META,
  matchDrugInteractions,
  normalizeDrugText
} from '../data/drugInteractions';
import {
  fetchDrugInteractionsFromSupabase,
  queryBidirectionalDrugInteractionsSupabase,
  seedDrugInteractionsToSupabase,
  SUPABASE_INTERAKSI_OBAT_SQL_SCHEMA,
  fetchPrescriptionsFromSupabase,
  seedPrescriptionsToSupabase,
  syncPrescriptionToSupabase,
  deletePrescriptionsFromSupabase,
  isDemoPrescriptionId,
  SUPABASE_PRESCRIPTION_SQL_SCHEMA,
  getSupabaseClient
} from '../utils/supabaseClient';
import {
  getDeletedIdsSet,
  getPendingDeleteIds,
  getPendingSyncIdsSet,
  confirmCloudDeletes,
  confirmCloudSync,
  hasCompletedInitialCloudSync,
  markInitialCloudSyncCompleted
} from '../utils/deletionRegistry';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { useFacilityProfiles, formatPharmacyAddress } from './PharmacySettingsModal';

interface EPrescriptionQueueViewProps {
  prescriptions: EPrescription[];
  rmeRecords?: RMERecord[];
  patients?: Patient[];
  medicines?: Medicine[];
  branchId?: string;
  onApproveToPOS: (rx: EPrescription) => void;
  onRejectPrescription: (rxId: string, reason: string, extra?: Partial<EPrescription>) => void;
  onSaveExternalPrescription?: (rx: EPrescription) => void;
  onSyncPrescriptionsFromSupabase?: (list: EPrescription[]) => void;
  onSyncPrescriptionsSupabase?: () => Promise<{
    success: boolean;
    count?: number;
    uploadedCount?: number;
    deletedFlushedCount?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  onDeletePrescriptionHistory?: (
    rxId: string
  ) =>
    | void
    | Promise<{
        success: boolean;
        needsTableSetup?: boolean;
        isDemo?: boolean;
        error?: string;
      }>;
}

interface ExternalRxDrugRow {
  rowId: string;
  name: string;
  qty: number;
  unit: string;
  dosage: string;
}

export const EPrescriptionQueueView: React.FC<EPrescriptionQueueViewProps> = ({
  prescriptions,
  rmeRecords = [],
  patients = [],
  medicines = [],
  branchId = 'BR-01',
  onApproveToPOS,
  onRejectPrescription,
  onSaveExternalPrescription,
  onSyncPrescriptionsFromSupabase,
  onSyncPrescriptionsSupabase,
  onDeletePrescriptionHistory
}) => {
  const { pharmacyProfile, apjProfile, dpjProfile } = useFacilityProfiles();
  const pharmacyFullAddress = formatPharmacyAddress(pharmacyProfile);

  const [activeTab, setActiveTab] = useState<'antrean' | 'riwayat'>('antrean');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedPres, setSelectedPres] = useState<EPrescription | null>(null);
  const [rejectReason, setRejectReason] = useState('Dosis obat melebihi dosis lazim / potensi interaksi obat');
  const [searchTerm, setSearchTerm] = useState('');

  // State Database interaksi_obat (Supabase + Lokal 426 Data) & Hasil Interaction Checker (Non-AI)
  const [interaksiObatList, setInteraksiObatList] = useState<DrugInteractionRecord[]>(() => {
    try {
      const saved = demoGetItem('latisha_interaksi_obat_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= INITIAL_INTERAKSI_OBAT.length) {
          return parsed;
        }
      }
    } catch {
      // Fallback ke data 426 interaksi standar
    }
    try {
      demoSetItem('latisha_interaksi_obat_v2', JSON.stringify(INITIAL_INTERAKSI_OBAT));
    } catch {
      // ignore storage quota warning
    }
    return INITIAL_INTERAKSI_OBAT;
  });
  const [interactionSourceMode, setInteractionSourceMode] = useState<'supabase' | 'lokal' | 'hybrid'>(
    () => (!isDemoMode() && Boolean(getSupabaseClient()) ? 'supabase' : 'lokal')
  );
  const [isSyncingInitialRules, setIsSyncingInitialRules] = useState<boolean>(false);
  const [interaksiRlsBlocked, setInteraksiRlsBlocked] = useState(false);
  const isOwnerAdmin = useIsOwnerAdmin();
  const [showInteraksiSqlModal, setShowInteraksiSqlModal] = useState(false);
  const [copiedInteraksiSql, setCopiedInteraksiSql] = useState(false);
  const [checkingRxId, setCheckingRxId] = useState<string | null>(null);
  const [liveScanByRxId, setLiveScanByRxId] = useState<Record<string, InteractionCheckResult>>({});
  const [interactionResult, setInteractionResult] = useState<{
    rx: EPrescription;
    patient?: Patient;
    rme?: RMERecord;
    result: InteractionCheckResult;
  } | null>(null);

  const [copiedRecommendation, setCopiedRecommendation] = useState(false);
  const [expandedRmeId, setExpandedRmeId] = useState<string | null>(null);

  const formatBnfPionasReference = (ref?: string): string => {
    const cleaned = String(ref || '').trim();
    if (!cleaned) {
      return 'BNF 86 · BPOM PIONAS (Database interaksi_obat)';
    }
    const lower = cleaned.toLowerCase();
    if (lower.includes('bnf') || lower.includes('pionas')) {
      return cleaned;
    }
    return `${cleaned} · Standar BNF 86 & BPOM PIONAS`;
  };

  // Fungsi sinkronisasi tabel interaksi_obat (426 baris) dari Supabase menggunakan .range() paging
  const handleSyncInteraksiObatSupabase = async () => {
    if (isDemoMode()) {
      setInteraksiObatList(INITIAL_INTERAKSI_OBAT);
      setInteractionSourceMode('lokal');
      setIsSyncingInitialRules(false);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setInteraksiObatList(INITIAL_INTERAKSI_OBAT);
      setInteractionSourceMode('lokal');
      setIsSyncingInitialRules(false);
      return;
    }

    setIsSyncingInitialRules(true);
    try {
      const { data, error, rlsBlocked } = await fetchDrugInteractionsFromSupabase();
      if (!error && data && data.length > 0) {
        setInteraksiObatList(data);
        setInteractionSourceMode('supabase');
        setInteraksiRlsBlocked(false);
        try {
          demoSetItem('latisha_interaksi_obat_v2', JSON.stringify(data));
        } catch {
          // Ignore storage quota warning
        }
      } else {
        // Jika tabel mengembalikan 0 baris (misal kebijakan RLS SELECT belum diaktifkan atau tabel kosong),
        // coba semaikan 426 data ke Supabase dan pastikan aplikasi tetap memuat penuh 426 data interaksi_obat
        if (rlsBlocked) {
          const seedAttempt = await seedDrugInteractionsToSupabase(INITIAL_INTERAKSI_OBAT);
          if (seedAttempt.success) {
            const refetch = await fetchDrugInteractionsFromSupabase();
            if (!refetch.error && refetch.data && refetch.data.length > 0) {
              setInteraksiObatList(refetch.data);
              setInteractionSourceMode('supabase');
              setInteraksiRlsBlocked(false);
              try {
                demoSetItem('latisha_interaksi_obat_v2', JSON.stringify(refetch.data));
              } catch {}
              return;
            }
          }
          setInteraksiRlsBlocked(true);
        }
        setInteraksiObatList((prev) =>
          prev.length >= INITIAL_INTERAKSI_OBAT.length ? prev : INITIAL_INTERAKSI_OBAT
        );
        setInteractionSourceMode('supabase');
        try {
          demoSetItem('latisha_interaksi_obat_v2', JSON.stringify(INITIAL_INTERAKSI_OBAT));
        } catch {}
      }
    } finally {
      setIsSyncingInitialRules(false);
    }
  };

  // Sinkronisasi awal tabel interaksi_obat (426 data) sekali per sesi agar perpindahan submenu tetap instan
  useEffect(() => {
    try {
      if (
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem('latisha_interaksi_session_synced') === '1' &&
        interaksiObatList.length >= INITIAL_INTERAKSI_OBAT.length
      ) {
        return;
      }
    } catch {}
    handleSyncInteraksiObatSupabase().finally(() => {
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('latisha_interaksi_session_synced', '1');
        }
      } catch {}
    });
  }, []);

  // Screening Checkboxes per Rx
  const [screeningStates, setScreeningStates] = useState<Record<string, {
    admin: Record<string, boolean>;
    farmasetik: Record<string, boolean>;
    klinis: Record<string, boolean>;
    notes?: string;
  }>>({});

  // State Sinkronisasi Riwayat Skrining Resep ke Supabase (riwayat_skrining_resep)
  const [rxSyncLoading, setRxSyncLoading] = useState(false);
  const [rxSyncStatus, setRxSyncStatus] = useState<
    'idle' | 'syncing' | 'synced' | 'needs_setup' | 'error' | 'demo'
  >(() => (isDemoMode() ? 'demo' : getSupabaseClient() ? 'synced' : 'idle'));
  const [rxSyncNotice, setRxSyncNotice] = useState<string>('');
  const [showPrescriptionSqlModal, setShowPrescriptionSqlModal] = useState(false);
  const [copiedPrescriptionSql, setCopiedPrescriptionSql] = useState(false);
  const [confirmDeleteRxId, setConfirmDeleteRxId] = useState<string | null>(null);

  // =========================================================================
  // STATE: FITUR "RX LUAR" (RESEP DOKTER LUAR) & PRATINJAU CETAK RIWAYAT
  // =========================================================================
  const [showExternalRxModal, setShowExternalRxModal] = useState(false);
  const [extDoctorName, setExtDoctorName] = useState('');
  const [extOriginFacility, setExtOriginFacility] = useState('');
  const [extPatientName, setExtPatientName] = useState('');
  const [extPatientAge, setExtPatientAge] = useState('');
  const [extPatientAddress, setExtPatientAddress] = useState('');
  const [extItems, setExtItems] = useState<ExternalRxDrugRow[]>([
    { rowId: 'row-1', name: '', qty: 10, unit: 'Tab', dosage: '3x1 Sesudah Makan' },
    { rowId: 'row-2', name: '', qty: 10, unit: 'Tab', dosage: '2x1 Sesudah Makan' }
  ]);
  const [extScreeningNotes, setExtScreeningNotes] = useState('');
  const [extInteractionLoading, setExtInteractionLoading] = useState(false);
  const [extInteractionResult, setExtInteractionResult] = useState<InteractionCheckResult | null>(null);
  const [extFormError, setExtFormError] = useState<string | null>(null);
  const [savedExtRxBanner, setSavedExtRxBanner] = useState<EPrescription | null>(null);
  const [previewPrintRx, setPreviewPrintRx] = useState<EPrescription | null>(null);
  const [previewPrintMode, setPreviewPrintMode] = useState<'salinan' | 'etiket'>('salinan');
  const [etiketLabels, setEtiketLabels] = useState<MedicationLabelItem[]>([]);
  const [etiketLayout, setEtiketLayout] = useState<MedicationLabelLayout>('thermal-80');
  const [extActionStatus, setExtActionStatus] = useState<
    'Diterima (Tidak Ada DRPs)' | 'Ditolak (Ada DRPs)' | 'Ganti Rx (Konfirmasi ke Dokter)'
  >('Diterima (Tidak Ada DRPs)');

  const openRxDetailPreview = (rx: EPrescription, initialMode: 'salinan' | 'etiket' = 'salinan') => {
    setPreviewPrintRx(rx);
    setPreviewPrintMode(initialMode);
    setEtiketLabels(buildMedicationLabelItems(rx.items || [], medicines));
  };

  const resetExternalRxForm = () => {
    setExtDoctorName('');
    setExtOriginFacility('');
    setExtPatientName('');
    setExtPatientAge('');
    setExtPatientAddress('');
    setExtItems([
      { rowId: `row-${Date.now()}-1`, name: '', qty: 10, unit: 'Tab', dosage: '3x1 Sesudah Makan' },
      { rowId: `row-${Date.now()}-2`, name: '', qty: 10, unit: 'Tab', dosage: '2x1 Sesudah Makan' }
    ]);
    setExtScreeningNotes('');
    setExtInteractionResult(null);
    setExtFormError(null);
    setExtActionStatus('Diterima (Tidak Ada DRPs)');
  };

  const handleOpenExternalRxModal = () => {
    resetExternalRxForm();
    setShowExternalRxModal(true);
  };

  const handleAddExtItemRow = () => {
    setExtInteractionResult(null);
    setExtItems((prev) => [
      ...prev,
      {
        rowId: `row-${Date.now()}-${prev.length + 1}`,
        name: '',
        qty: 10,
        unit: 'Tab',
        dosage: '3x1 Sesudah Makan'
      }
    ]);
  };

  const handleRemoveExtItemRow = (rowId: string) => {
    setExtInteractionResult(null);
    setExtItems((prev) => (prev.length > 1 ? prev.filter((r) => r.rowId !== rowId) : prev));
  };

  const handleUpdateExtItemRow = (
    rowId: string,
    field: keyof ExternalRxDrugRow,
    value: string | number
  ) => {
    if (field === 'name') {
      setExtInteractionResult(null);
    }
    setExtItems((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        if (field === 'name' && typeof value === 'string') {
          const matchedMed = medicines.find(
            (m) => m.name.toLowerCase().trim() === value.toLowerCase().trim()
          );
          if (matchedMed && (!row.unit || row.unit === 'Tab')) {
            return { ...row, name: value, unit: matchedMed.unit || row.unit };
          }
        }
        return { ...row, [field]: value };
      })
    );
  };

  // Fungsi pencocokan real-time dua arah (bidirectional) daftar obat pada Form Rx Luar ke tabel interaksi_obat di Supabase
  const runExternalRxInteractionAnalysis = async (): Promise<{
    result: InteractionCheckResult;
    formattedNote: string;
  } | null> => {
    const validRows = extItems.filter((r) => r.name.trim() !== '');
    if (validRows.length === 0) {
      setExtFormError('Masukkan minimal 1 nama obat pada tabel sebelum menjalankan Interaction Checker.');
      return null;
    }

    setExtFormError(null);
    setExtInteractionLoading(true);
    try {
      const rxItemsForCheck: PrescriptionItem[] = validRows.map((r, idx) => {
        const matchedMed = medicines.find(
          (m) => m.name.toLowerCase().trim() === r.name.toLowerCase().trim()
        );
        return {
          medicineId: matchedMed?.id || `EXT-MED-${idx + 1}`,
          name: r.name.trim(),
          qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
          unit: r.unit.trim() || 'Tab',
          price: matchedMed?.sellPriceKlinik || matchedMed?.sellPrice || 0,
          dosage: r.dosage.trim() || 'Sesuai aturan pakai'
        };
      });

      let rulesToScan = interaksiObatList;
      let currentSourceMode: 'supabase' | 'lokal' | 'hybrid' = interactionSourceMode;
      let liveFetchStatus: InteractionCheckResult['liveFetchStatus'] = 'demo-sandbox';
      let supabaseRowCount = 0;
      let liveErrorMessage: string | undefined;
      const demoActive = isDemoMode();

      if (!demoActive && getSupabaseClient()) {
        const drugNamesList = rxItemsForCheck.map((it) => it.name);
        const [pairQueryRes, fullTableRes] = await Promise.all([
          queryBidirectionalDrugInteractionsSupabase(drugNamesList, medicines),
          fetchDrugInteractionsFromSupabase()
        ]);

        const { data, error } = fullTableRes;
        if (error && pairQueryRes.matchedRules.length === 0) {
          liveFetchStatus = 'fallback-error';
          liveErrorMessage = error;
          currentSourceMode = 'supabase';
          rulesToScan =
            interaksiObatList.length >= INITIAL_INTERAKSI_OBAT.length
              ? interaksiObatList
              : INITIAL_INTERAKSI_OBAT;
        } else if ((data && data.length > 0) || pairQueryRes.matchedRules.length > 0) {
          const mergedMap = new Map<string, DrugInteractionRecord>();
          // Prioritaskan hasil query pasangan dua arah (obat_a ILIKE Ox & obat_b ILIKE Oy ATAU sebaliknya)
          for (const r of pairQueryRes.matchedRules) {
            mergedMap.set(r.id, r);
          }
          for (const r of data || []) {
            if (!mergedMap.has(r.id)) {
              mergedMap.set(r.id, r);
            }
          }
          const combinedRules = Array.from(mergedMap.values());
          supabaseRowCount = combinedRules.length;
          liveFetchStatus = 'supabase-live';
          rulesToScan = combinedRules;
          currentSourceMode = 'supabase';
          if (data && data.length > 0) {
            setInteraksiObatList(data);
            setInteractionSourceMode('supabase');
            try {
              demoSetItem('latisha_interaksi_obat_v2', JSON.stringify(data));
            } catch {
              // ignore
            }
          }
        } else {
          rulesToScan =
            interaksiObatList.length >= INITIAL_INTERAKSI_OBAT.length
              ? interaksiObatList
              : INITIAL_INTERAKSI_OBAT;
          supabaseRowCount = rulesToScan.length;
          liveFetchStatus = 'supabase-live';
          currentSourceMode = 'supabase';
        }
      } else if (!demoActive) {
        liveFetchStatus = 'fallback-error';
        liveErrorMessage = 'Klien Supabase tidak terdeteksi.';
        currentSourceMode = 'lokal';
      }

      const rawResult = matchDrugInteractions(rxItemsForCheck, rulesToScan, currentSourceMode, medicines);
      const normalizedMatches = rawResult.matches.map((m) => ({
        ...m,
        referensi: formatBnfPionasReference(m.referensi)
      }));

      const finalResult: InteractionCheckResult = {
        ...rawResult,
        matches: normalizedMatches,
        liveFetchStatus,
        liveErrorMessage,
        supabaseRowCount,
        isDemoSandbox: demoActive
      };

      setExtInteractionResult(finalResult);

      const formattedNote =
        finalResult.matches.length === 0
          ? `[Interaction Checker - interaksi_obat] ${finalResult.pairsScanned} pasangan obat dipindai (${finalResult.totalRulesChecked} aturan): Tidak ditemukan potensi interaksi obat.`
          : `[Interaction Checker - interaksi_obat | Severity Tertinggi: ${finalResult.highestSeverity.toUpperCase()}]\n` +
            finalResult.matches
              .map(
                (m, idx) =>
                  `${idx + 1}. [${m.severity.toUpperCase()}] ${m.rxDrugA} × ${m.rxDrugB}: ${m.mekanisme} | Rekomendasi: ${m.manajemenKlinis}`
              )
              .join('\n');

      setExtScreeningNotes(formattedNote);
      return { result: finalResult, formattedNote };
    } finally {
      setExtInteractionLoading(false);
    }
  };

  // Simpan Resep Dokter Luar beserta hasil skrining/interaksi ke Riwayat Skrining Resep
  const handleSaveExternalPrescription = async () => {
    if (!extDoctorName.trim()) {
      setExtFormError('Nama Dokter Peresep wajib diisi.');
      return;
    }
    if (!extPatientName.trim()) {
      setExtFormError('Nama Pasien wajib diisi.');
      return;
    }
    if (!String(extPatientAge).trim()) {
      setExtFormError('Umur Pasien wajib diisi.');
      return;
    }
    if (!extPatientAddress.trim()) {
      setExtFormError('Alamat Pasien wajib diisi.');
      return;
    }

    const validRows = extItems.filter((r) => r.name.trim() !== '');
    if (validRows.length === 0) {
      setExtFormError('Masukkan minimal 1 baris obat (Nama Obat, Jumlah, Aturan Pakai/Signa).');
      return;
    }

    setExtFormError(null);

    // Jalankan Interaction Checker otomatis jika belum diklik agar hasil skrining tetap terekam lengkap
    let activeAnalysis = extInteractionResult;
    let resolvedNote = extScreeningNotes.trim();
    if (!activeAnalysis) {
      const autoRes = await runExternalRxInteractionAnalysis();
      if (autoRes) {
        activeAnalysis = autoRes.result;
        if (!resolvedNote) {
          resolvedNote = autoRes.formattedNote;
        }
      }
    }

    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seqNum = String(
      prescriptions.filter((p) => p.id.startsWith('RXL-')).length + 1
    ).padStart(3, '0');
    const rxId = `RXL-${dateTag}-${seqNum}`;
    const nowFormatted = new Date().toLocaleString('id-ID');

    const finalItems: PrescriptionItem[] = validRows.map((r, idx) => {
      const matchedMed = medicines.find(
        (m) => m.name.toLowerCase().trim() === r.name.toLowerCase().trim()
      );
      return {
        medicineId: matchedMed?.id || `EXT-MED-${idx + 1}`,
        name: r.name.trim(),
        qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
        unit: r.unit.trim() || 'Tab',
        price: matchedMed?.sellPriceKlinik || matchedMed?.sellPrice || 0,
        dosage: r.dosage.trim() || 'Sesuai aturan pakai'
      };
    });

    const matches = activeAnalysis?.matches || [];
    const hasMajorOrContraindicated = matches.some(
      (m) => m.severity === 'contraindicated' || m.severity === 'major'
    );

    const originPrefix = extOriginFacility.trim()
      ? `[Asal Resep Luar: ${extOriginFacility.trim()} | Pasien: ${extPatientName.trim()} (${extPatientAge} Th, ${extPatientAddress.trim()})]\n`
      : `[Resep Dokter Luar | Pasien: ${extPatientName.trim()} (${extPatientAge} Th, ${extPatientAddress.trim()})]\n`;

    const fullNotes =
      originPrefix +
      (resolvedNote ||
        'Memenuhi skrining standar administratif, farmasetik & klinis (Resep Dokter Luar).');

    const newExternalRx: EPrescription = {
      id: rxId,
      rmId: `EXT-${seqNum}`,
      patientName: extPatientName.trim(),
      patientAge: extPatientAge.trim(),
      patientAddress: extPatientAddress.trim(),
      doctorName: extOriginFacility.trim()
        ? `${extDoctorName.trim()} (${extOriginFacility.trim()})`
        : extDoctorName.trim(),
      originFacility: extOriginFacility.trim(),
      isExternalRx: true,
      items: finalItems,
      status: extActionStatus,
      timestamp: nowFormatted,
      screeningNotes: fullNotes,
      screenedBy: apjProfile.name,
      screenedAt: nowFormatted,
      screeningChecks: {
        admin: { namaDokter: true, sip: true, tglResep: true, paraf: true },
        farmasetik: { bentukSediaan: true, dosis: true, stabilitas: true, kompatibilitas: true },
        klinis: {
          tepatDosis: true,
          tepatWaktu: true,
          kontraIndikasi: !hasMajorOrContraindicated,
          interaksi: matches.length === 0,
          duplikasi: true
        },
        externalMeta: {
          isExternalRx: true,
          originFacility: extOriginFacility.trim(),
          patientAge: extPatientAge.trim(),
          patientAddress: extPatientAddress.trim()
        }
      },
      branchId
    };

    if (onSaveExternalPrescription) {
      onSaveExternalPrescription(newExternalRx);
    } else if (onSyncPrescriptionsFromSupabase) {
      onSyncPrescriptionsFromSupabase([newExternalRx, ...prescriptions]);
      syncPrescriptionToSupabase(newExternalRx).catch((err) =>
        console.warn('Supabase external rx sync warning:', err)
      );
    }

    setShowExternalRxModal(false);
    setActiveTab('riwayat');
    setSavedExtRxBanner(newExternalRx);
  };

  // Fungsi Cetak Lembar Salinan Resep / Hasil Skrining dari Tabel Riwayat Skrining
  const handleTriggerPrintPrescriptionHistory = (rx: EPrescription) => {
    const matchedPatient = patients.find(
      (pt) => pt.id === rx.rmId || pt.name.toLowerCase() === rx.patientName.toLowerCase()
    );
    const matchedRme = rmeRecords.find(
      (r) =>
        (rx.rmeRecordId && r.id === rx.rmeRecordId) ||
        (r.rmId === rx.rmId && r.patientName === rx.patientName)
    );
    const payload = {
      rx,
      patient: matchedPatient,
      rme: matchedRme,
      timestamp: new Date().toISOString()
    };
    try {
      const jsonStr = JSON.stringify(payload);
      sessionStorage.setItem('latisha_active_print_skrining', jsonStr);
      demoSetItem('latisha_active_print_skrining', jsonStr);
    } catch (e) {
      console.warn('Storage write error for skrining resep print:', e);
    }
    openPrintWindow('skrining-resep', { rxId: rx.id });
  };

  // Fungsi Cetak Label Instruksi Penggunaan Obat (Etiket Putih / Biru)
  const handleTriggerPrintMedicationLabels = (
    rx: EPrescription,
    labelsToPrint: MedicationLabelItem[],
    layoutChoice: MedicationLabelLayout
  ) => {
    const matchedPatient = patients.find(
      (pt) => pt.id === rx.rmId || pt.name.toLowerCase() === rx.patientName.toLowerCase()
    );
    const extMeta = rx.screeningChecks?.externalMeta;
    const resolvedAge =
      rx.patientAge !== undefined && rx.patientAge !== ''
        ? String(rx.patientAge)
        : extMeta?.patientAge !== undefined && extMeta?.patientAge !== ''
        ? String(extMeta.patientAge)
        : matchedPatient?.age !== undefined
        ? String(matchedPatient.age)
        : '';
    const resolvedAddress =
      rx.patientAddress || extMeta?.patientAddress || matchedPatient?.address || '';
    const dateLabel =
      (rx.timestamp || '').split(',')[0].trim() || new Date().toLocaleDateString('id-ID');

    saveMedicationLabelPrintPayload({
      rxId: rx.id,
      rmId: rx.rmId,
      patientName: rx.patientName,
      patientAge: resolvedAge,
      patientGender: matchedPatient?.gender,
      patientAddress: resolvedAddress,
      doctorName: rx.doctorName,
      date: dateLabel,
      screenedBy: rx.screenedBy || apjProfile.name,
      layout: layoutChoice,
      labels: labelsToPrint,
      createdAt: new Date().toISOString()
    });
    openPrintWindow('etiket-obat', { rxId: rx.id, layout: layoutChoice });
  };

  const pendingList = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return prescriptions.filter(
      (p) =>
        p.status === 'Pending Skrining' &&
        (!q ||
          p.id.toLowerCase().includes(q) ||
          p.patientName.toLowerCase().includes(q) ||
          p.rmId.toLowerCase().includes(q) ||
          p.doctorName.toLowerCase().includes(q) ||
          (p.originFacility || '').toLowerCase().includes(q))
    );
  }, [prescriptions, searchTerm]);

  const historyList = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return prescriptions.filter(
      (p) =>
        p.status !== 'Pending Skrining' &&
        (!q ||
          p.id.toLowerCase().includes(q) ||
          p.patientName.toLowerCase().includes(q) ||
          p.rmId.toLowerCase().includes(q) ||
          p.doctorName.toLowerCase().includes(q) ||
          (p.originFacility || '').toLowerCase().includes(q))
    );
  }, [prescriptions, searchTerm]);

  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState<number>(25);

  useEffect(() => {
    setHistoryPage(1);
  }, [searchTerm, activeTab]);

  const historyTotalPages = Math.max(1, Math.ceil(historyList.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const paginatedHistoryList = useMemo(() => {
    const start = (safeHistoryPage - 1) * historyPageSize;
    return historyList.slice(start, start + historyPageSize);
  }, [historyList, safeHistoryPage, historyPageSize]);

  const getScreening = (rxId: string) => {
    const existingRx = prescriptions.find((p) => p.id === rxId);
    const savedChecks = existingRx?.screeningChecks;
    return (
      screeningStates[rxId] || {
        admin: savedChecks?.admin || { namaDokter: true, sip: true, tglResep: true, paraf: true },
        farmasetik: savedChecks?.farmasetik || {
          bentukSediaan: true,
          dosis: true,
          stabilitas: true,
          kompatibilitas: true
        },
        klinis: {
          tepatDosis: savedChecks?.klinis?.tepatDosis ?? true,
          tepatWaktu: savedChecks?.klinis?.tepatWaktu ?? true,
          duplikasi: savedChecks?.klinis?.duplikasi ?? true,
          kontraIndikasi: savedChecks?.klinis?.kontraIndikasi ?? true,
          interaksi: savedChecks?.klinis?.interaksi ?? true
        },
        notes: existingRx?.screeningNotes || ''
      }
    );
  };

  const toggleCheck = (rxId: string, category: 'admin' | 'farmasetik' | 'klinis', field: string) => {
    const current = getScreening(rxId);
    setScreeningStates({
      ...screeningStates,
      [rxId]: {
        ...current,
        [category]: {
          ...current[category],
          [field]: !current[category][field]
        }
      }
    });
  };

  // Helper: Retrieve patient & latest RME record for a prescription
  const getPatientData = (rmId: string, patientName: string) => {
    return (
      patients.find((p) => p.id === rmId || p.name.toLowerCase() === patientName.toLowerCase()) ||
      null
    );
  };

  const getRmeData = (rx: EPrescription) => {
    if (rx.rmeRecordId) {
      const exactById = rmeRecords.find((r) => r.id === rx.rmeRecordId);
      if (exactById) return exactById;
    }
    const rxDate = (rx.timestamp || '').split(' ')[0];
    if (rxDate) {
      const byRmAndDate = rmeRecords.find(
        (r) => r.rmId === rx.rmId && r.date === rxDate
      );
      if (byRmAndDate) return byRmAndDate;
    }
    return (
      rmeRecords.find((r) => r.rmId === rx.rmId || r.patientName.toLowerCase() === rx.patientName.toLowerCase()) ||
      null
    );
  };

  // SMART RX REVIEW: Sinkron langsung dengan tabel interaksi_obat Supabase + Duplikasi Terapi & Alergi
  const runSmartRxReview = (rx: EPrescription, patient?: Patient | null) => {
    const items = rx.items || [];
    const issues: {
      type: 'DDI' | 'DUPLIKASI' | 'KONTRAINDIKASI';
      severity: 'Kritis' | 'Sedang' | 'Ringan';
      dbSeverity?: DrugInteractionSeverity;
      source?: 'supabase' | 'lokal';
      title: string;
      drugs: string;
      explanation: string;
      recommendation: string;
      reference: string;
      referenceUrl: string;
    }[] = [];

    // 0. Evaluasi Interaksi Obat Langsung dari Database interaksi_obat (prioritaskan hasil live scan tombol bila ada)
    const cachedLiveScan = liveScanByRxId[rx.id];
    const ddiScanResult =
      cachedLiveScan ||
      matchDrugInteractions(items, interaksiObatList, interactionSourceMode, medicines);

    for (const m of ddiScanResult.matches) {
      const mappedSeverity: 'Kritis' | 'Sedang' | 'Ringan' =
        m.severity === 'contraindicated' || m.severity === 'major'
          ? 'Kritis'
          : m.severity === 'moderate'
          ? 'Sedang'
          : 'Ringan';

      issues.push({
        type: 'DDI',
        severity: mappedSeverity,
        dbSeverity: m.severity,
        source: m.source,
        title: `Interaksi Obat (${m.severity.toUpperCase()}): ${m.obatA} × ${m.obatB}`,
        drugs: `${m.rxDrugA} + ${m.rxDrugB}`,
        explanation: m.mekanisme,
        recommendation: m.manajemenKlinis,
        reference: formatBnfPionasReference(m.referensi),
        referenceUrl: 'https://pionas.pom.go.id/'
      });
    }

    const hasDbPairForKeywords = (kwGroupA: string[], kwGroupB: string[]) =>
      ddiScanResult.matches.some((m) => {
        const side1 = `${m.rxDrugA} ${m.obatA}`.toLowerCase();
        const side2 = `${m.rxDrugB} ${m.obatB}`.toLowerCase();
        const fwd =
          kwGroupA.some((k) => side1.includes(k)) && kwGroupB.some((k) => side2.includes(k));
        const rev =
          kwGroupB.some((k) => side1.includes(k)) && kwGroupA.some((k) => side2.includes(k));
        return fwd || rev;
      });

    // 1. Duplikasi Terapi: NSAID
    const nsaidMatches = items.filter((it) => {
      const n = it.name.toLowerCase();
      return n.includes('ibuprofen') || n.includes('mefenamat') || n.includes('diklofenak') || n.includes('ketorolac') || n.includes('meloxicam');
    });
    if (
      nsaidMatches.length >= 2 &&
      !hasDbPairForKeywords(
        ['nsaid', 'ibuprofen', 'mefenamat', 'diklofenak', 'ketorolac', 'meloxicam'],
        ['nsaid', 'ibuprofen', 'mefenamat', 'diklofenak', 'ketorolac', 'meloxicam']
      )
    ) {
      issues.push({
        type: 'DUPLIKASI',
        severity: 'Kritis',
        title: 'Duplikasi Terapi NSAID (Double Analgesik)',
        drugs: nsaidMatches.map((i) => i.name).join(' + '),
        explanation: 'Pemberian 2 agen NSAID secara bersamaan tidak meningkatkan efek analgesia klinis, namun meningkatkan risiko toksisitas perdarahan mukosa lambung dan nefrotoksisitas secara eksponensial.',
        recommendation: 'Pilih monoterapi salah satu agen NSAID saja dan batalkan agen NSAID kedua.',
        reference: 'BPOM PIONAS NSAIDs & BNF 86 Analgesics',
        referenceUrl: 'https://pionas.pom.go.id/monografi/ibuprofen'
      });
    }

    // 2. Duplikasi Terapi: Antihistamin
    const antihistamineMatches = items.filter((it) => {
      const n = it.name.toLowerCase();
      return n.includes('cetirizine') || n.includes('setirizin') || n.includes('ctm') || n.includes('chlorpheniramine') || n.includes('loratadine');
    });
    if (
      antihistamineMatches.length >= 2 &&
      !hasDbPairForKeywords(
        ['cetirizine', 'setirizin', 'ctm', 'chlorpheniramine', 'loratadine'],
        ['cetirizine', 'setirizin', 'ctm', 'chlorpheniramine', 'loratadine']
      )
    ) {
      issues.push({
        type: 'DUPLIKASI',
        severity: 'Sedang',
        title: 'Duplikasi Terapi Antihistamin H1',
        drugs: antihistamineMatches.map((i) => i.name).join(' + '),
        explanation: 'Kombinasi multipel antihistamin meningkatkan risiko efek sedasi berlebih, rasa kantuk ekstrem, mulut kering, dan penurunan refleks motorik.',
        recommendation: 'Gunakan satu jenis antihistamin generasi ke-2 (misal Cetirizine 10mg) per hari.',
        reference: 'BPOM PIONAS & BNF 86 hal. 312',
        referenceUrl: 'https://pionas.pom.go.id/monografi/setirizin-hidroklorida'
      });
    }

    // 3. Fallback klinis DDI: Kortikosteroid + NSAID (bila belum ada di hasil tabel interaksi_obat)
    const steroidMatches = items.filter((it) => {
      const n = it.name.toLowerCase();
      return n.includes('dexa') || n.includes('prednison') || n.includes('metilprednisolon');
    });
    if (
      steroidMatches.length > 0 &&
      nsaidMatches.length > 0 &&
      !hasDbPairForKeywords(
        ['dexa', 'prednison', 'metilprednisolon', 'kortikosteroid'],
        ['nsaid', 'ibuprofen', 'mefenamat', 'diklofenak', 'ketorolac', 'meloxicam']
      )
    ) {
      issues.push({
        type: 'DDI',
        severity: 'Sedang',
        title: 'Interaksi Obat: Kortikosteroid + NSAID',
        drugs: `${steroidMatches.map((s) => s.name).join(', ')} + ${nsaidMatches.map((ns) => ns.name).join(', ')}`,
        explanation: 'Penghambatan ganda sintesis prostaglandin protektif lambung secara sinergis meningkatkan risiko erosi mikrovaskular, ulkus peptikum, dan perdarahan saluran cerna atas.',
        recommendation: 'Hindari kombinasi jika keluhan inflamasi dapat diatasi monoterapi. Bila mutlak, wajib berikan gastroprotektor PPI (Omeprazole 20mg a.c.) dan diminum sesudah makan.',
        reference: 'BNF 86 hal. 620 & 1104; BPOM PIONAS',
        referenceUrl: 'https://www.drugs.com/drug-interactions.html'
      });
    }

    // 4. Fallback klinis DDI: NSAID + Antihipertensi (bila belum ada di hasil tabel interaksi_obat)
    const antihypertensiveMatches = items.filter((it) => {
      const n = it.name.toLowerCase();
      return n.includes('amlodipine') || n.includes('captopril') || n.includes('candesartan') || n.includes('losartan');
    });
    if (
      nsaidMatches.length > 0 &&
      antihypertensiveMatches.length > 0 &&
      !hasDbPairForKeywords(
        ['nsaid', 'ibuprofen', 'mefenamat', 'diklofenak', 'ketorolac', 'meloxicam'],
        ['amlodipine', 'captopril', 'candesartan', 'losartan', 'antihipertensi']
      )
    ) {
      issues.push({
        type: 'DDI',
        severity: 'Sedang',
        title: 'Interaksi Obat: NSAID + Antihipertensi (CCB / ACEi)',
        drugs: `${nsaidMatches.map((ns) => ns.name).join(', ')} + ${antihypertensiveMatches.map((ah) => ah.name).join(', ')}`,
        explanation: 'NSAID menghambat prostaglandin renal vasodilatator, menyebabkan retensi cairan & natrium yang menumpulkan efek penurunan tekanan darah 3-6 mmHg.',
        recommendation: 'Batasi penggunaan NSAID max 3-5 hari atau ganti dengan Parasetamol sebagai analgesik lini pertama.',
        reference: 'BNF 86 hal. 1105 · BPOM PIONAS · PERKI Hipertensi',
        referenceUrl: 'https://inaheart.org/panduan-klinis/'
      });
    }

    // 5. Alergi Pasien (RME)
    const patientAllergy = String(patient?.allergy || '').toLowerCase();
    if (patientAllergy.includes('penisilin') || patientAllergy.includes('amoxicillin') || patientAllergy.includes('penicillin')) {
      const betaLactams = items.filter((it) => {
        const n = it.name.toLowerCase();
        return n.includes('amoxicillin') || n.includes('ampicillin') || n.includes('amoksisilin');
      });
      if (betaLactams.length > 0) {
        issues.push({
          type: 'KONTRAINDIKASI',
          severity: 'Kritis',
          title: 'Kontraindikasi Fatal: Alergi Pasien vs Turunan Penisilin',
          drugs: betaLactams.map((b) => b.name).join(', '),
          explanation: `Pasien memiliki riwayat alergi terdokumentasi terhadap ${patient?.allergy}. Berisiko fatal memicu reaksi hipersensitivitas tipe I (syok anafilaksis, bronkospasme berat).`,
          recommendation: 'Hentikan segera obat betalaktam dan rekomendasikan antibiotik non-betalaktam (Azitromisin).',
          reference: 'BNF 86 Bab 5.1.1 (Penicillins & Hypersensitivity); BPOM PIONAS',
          referenceUrl: 'https://pionas.pom.go.id/monografi/amoksisilin'
        });
      }
    }

    const isSyncedWithSupabase =
      !isDemoMode() &&
      (ddiScanResult.liveFetchStatus === 'supabase-live' ||
        interactionSourceMode === 'supabase' ||
        interactionSourceMode === 'hybrid' ||
        ddiScanResult.matches.some((m) => m.source === 'supabase'));

    return {
      hasIssues: issues.length > 0,
      issues,
      ddiScanResult,
      isSyncedWithSupabase
    };
  };

  const applySmartReviewToScreening = (rxId: string, issues: ReturnType<typeof runSmartRxReview>['issues']) => {
    const noteLines = issues
      .map((iss) => `[${(iss.dbSeverity || iss.severity).toUpperCase()} ${iss.type}] ${iss.title} (${iss.drugs})\n   Mekanisme: ${iss.explanation}\n   Manajemen Klinis: ${iss.recommendation} [Ref: ${iss.reference}]`)
      .join('\n');
    const current = getScreening(rxId);
    setScreeningStates({
      ...screeningStates,
      [rxId]: {
        ...current,
        klinis: {
          ...current.klinis,
          interaksi: issues.some((i) => i.type === 'DDI') ? false : current.klinis.interaksi,
          duplikasi: issues.some((i) => i.type === 'DUPLIKASI') ? false : current.klinis.duplikasi,
          kontraIndikasi:
            issues.some((i) => i.type === 'KONTRAINDIKASI' || i.dbSeverity === 'contraindicated')
              ? false
              : current.klinis.kontraIndikasi,
          tepatDosis: issues.some((i) => i.severity === 'Kritis') ? false : current.klinis.tepatDosis
        },
        notes: (current.notes ? current.notes + '\n\n' : '') + `⚠️ Smart Rx Review (interaksi_obat & Duplikasi):\n` + noteLines
      }
    });
  };

  // TRIGGER: Interaction Checker live query langsung terhadap tabel Supabase interaksi_obat (Tanpa AI/LLM)
  const handleRunInteractionChecker = async (rx: EPrescription) => {
    if (checkingRxId) return;
    setCheckingRxId(rx.id);

    const getCachedLocalRules = (): DrugInteractionRecord[] => {
      try {
        const latestRaw = demoGetItem('latisha_interaksi_obat_v2');
        if (latestRaw) {
          const parsed = JSON.parse(latestRaw);
          if (Array.isArray(parsed) && parsed.length >= INITIAL_INTERAKSI_OBAT.length) {
            return parsed;
          }
        }
      } catch {
        // Ignore parse error
      }
      return interaksiObatList.length >= INITIAL_INTERAKSI_OBAT.length
        ? interaksiObatList
        : INITIAL_INTERAKSI_OBAT;
    };

    try {
      const patient = getPatientData(rx.rmId, rx.patientName);
      const rme = getRmeData(rx);

      console.log(`[Interaction Checker][Start] Memeriksa E-Resep #${rx.id}:`, {
        pasien: rx.patientName,
        daftarObatResep: (rx.items || []).map((it) => ({
          asli: it.name,
          normal: normalizeDrugText(it.name)
        })),
        modeDemoAktif: isDemoMode()
      });

      // 1. Isolasi Mode Demo / Sandbox: tidak melakukan query/write ke Supabase produksi
      if (isDemoMode()) {
        const demoRules = getCachedLocalRules().map((r) => ({ ...r, source: 'lokal' as const }));
        const matched = matchDrugInteractions(rx.items, demoRules, 'lokal');
        const finalResult: InteractionCheckResult = {
          ...matched,
          rxId: rx.id,
          isDemoSandbox: true,
          liveFetchStatus: 'demo-sandbox'
        };
        setInteractionSourceMode('lokal');
        setLiveScanByRxId((prev) => ({ ...prev, [rx.id]: finalResult }));
        setInteractionResult({
          rx,
          patient: patient || undefined,
          rme: rme || undefined,
          result: finalResult
        });
        return;
      }

      // 2. Live Query Dua Arah (Bidirectional Pair ILIKE + Full 426 Rows) ke tabel interaksi_obat di Supabase
      const drugNamesList = (rx.items || []).map((it) => it.name);
      const [pairQueryRes, fullTableRes] = await Promise.all([
        queryBidirectionalDrugInteractionsSupabase(drugNamesList, medicines),
        fetchDrugInteractionsFromSupabase()
      ]);
      const { data, error } = fullTableRes;

      if ((!error && data && data.length > 0) || pairQueryRes.matchedRules.length > 0) {
        const sourceMode: 'supabase' = 'supabase';
        const mergedMap = new Map<string, DrugInteractionRecord>();
        for (const r of pairQueryRes.matchedRules) {
          mergedMap.set(r.id, r);
        }
        for (const r of data || []) {
          if (!mergedMap.has(r.id)) {
            mergedMap.set(r.id, r);
          }
        }
        const combinedRules = Array.from(mergedMap.values());

        if (data && data.length > 0) {
          setInteraksiObatList(data);
          setInteractionSourceMode(sourceMode);
          setInteraksiRlsBlocked(false);
          try {
            demoSetItem('latisha_interaksi_obat_v2', JSON.stringify(data));
          } catch {
            // Ignore storage quota warning
          }
        }

        const matched = matchDrugInteractions(rx.items, combinedRules, sourceMode, medicines);
        const finalResult: InteractionCheckResult = {
          ...matched,
          rxId: rx.id,
          isDemoSandbox: false,
          liveFetchStatus: 'supabase-live',
          supabaseRowCount: combinedRules.length
        };
        setLiveScanByRxId((prev) => ({ ...prev, [rx.id]: finalResult }));
        setInteractionResult({
          rx,
          patient: patient || undefined,
          rme: rme || undefined,
          result: finalResult
        });
      } else if (!error && data && data.length === 0) {
        const fallbackRules = getCachedLocalRules();
        setInteraksiObatList(fallbackRules);
        setInteractionSourceMode('supabase');
        const matched = matchDrugInteractions(rx.items, fallbackRules, 'supabase', medicines);
        const finalResult: InteractionCheckResult = {
          ...matched,
          rxId: rx.id,
          isDemoSandbox: false,
          liveFetchStatus: 'supabase-live',
          supabaseRowCount: fallbackRules.length
        };
        setLiveScanByRxId((prev) => ({ ...prev, [rx.id]: finalResult }));
        setInteractionResult({
          rx,
          patient: patient || undefined,
          rme: rme || undefined,
          result: finalResult
        });
      } else {
        // 3. Network / Query Error Fallback ke cache & data lokal
        console.warn('[Interaction Checker][Supabase Error Fallback]', error);
        const fallbackRules = getCachedLocalRules();
        setInteractionSourceMode('lokal');
        const matched = matchDrugInteractions(rx.items, fallbackRules, 'lokal', medicines);
        const finalResult: InteractionCheckResult = {
          ...matched,
          rxId: rx.id,
          isDemoSandbox: false,
          liveFetchStatus: 'fallback-error',
          liveErrorMessage: error || 'Gagal menghubungi tabel interaksi_obat di Supabase.'
        };
        setLiveScanByRxId((prev) => ({ ...prev, [rx.id]: finalResult }));
        setInteractionResult({
          rx,
          patient: patient || undefined,
          rme: rme || undefined,
          result: finalResult
        });
      }
    } finally {
      setCheckingRxId(null);
    }
  };

  // ACTION: Salin temuan Interaction Checker ke Catatan Skrining
  const handleApplyInteractionToScreening = () => {
    if (!interactionResult) return;
    const rxId = interactionResult.rx.id;
    const current = getScreening(rxId);
    const { matches, highestSeverity, pairsScanned } = interactionResult.result;

    const noteText =
      matches.length === 0
        ? `[Interaction Checker - interaksi_obat] ${pairsScanned} pasangan obat dipindai: Tidak ditemukan interaksi obat.`
        : `[Interaction Checker - interaksi_obat | Severity Tertinggi: ${highestSeverity.toUpperCase()}]\n` +
          matches
            .map(
              (m, idx) =>
                `${idx + 1}. [${m.severity.toUpperCase()}] ${m.rxDrugA} × ${m.rxDrugB}\n   Mekanisme: ${m.mekanisme}\n   Manajemen Klinis: ${m.manajemenKlinis}`
            )
            .join('\n');

    const hasMajorOrContraindicated = matches.some(
      (m) => m.severity === 'contraindicated' || m.severity === 'major'
    );

    setScreeningStates({
      ...screeningStates,
      [rxId]: {
        ...current,
        klinis: {
          ...current.klinis,
          interaksi: matches.length === 0,
          kontraIndikasi: !hasMajorOrContraindicated
        },
        notes: noteText
      }
    });

    setCopiedRecommendation(true);
    setTimeout(() => setCopiedRecommendation(false), 2500);
  };

  const buildEnrichedPrescription = (
    rx: EPrescription,
    overrides?: {
      notes?: string;
      interaksiOk?: boolean;
      kontraIndikasiOk?: boolean;
    }
  ): EPrescription => {
    const sc = getScreening(rx.id);
    const resolvedNotes =
      overrides?.notes !== undefined
        ? overrides.notes
        : (sc.notes || '').trim() ||
          rx.screeningNotes ||
          'Memenuhi standar administratif, farmasetik & klinis.';

    return {
      ...rx,
      screeningNotes: resolvedNotes,
      screenedBy: apjProfile.name,
      screenedAt: new Date().toLocaleString('id-ID'),
      screeningChecks: {
        admin: {
          namaDokter: Boolean(sc.admin.namaDokter),
          sip: Boolean(sc.admin.sip),
          tglResep: Boolean(sc.admin.tglResep),
          paraf: Boolean(sc.admin.paraf)
        },
        farmasetik: {
          bentukSediaan: Boolean(sc.farmasetik.bentukSediaan),
          dosis: Boolean(sc.farmasetik.dosis),
          stabilitas: Boolean(sc.farmasetik.stabilitas),
          kompatibilitas: Boolean(sc.farmasetik.kompatibilitas)
        },
        klinis: {
          tepatDosis: Boolean(sc.klinis.tepatDosis),
          tepatWaktu: Boolean(sc.klinis.tepatWaktu),
          kontraIndikasi:
            overrides?.kontraIndikasiOk !== undefined
              ? overrides.kontraIndikasiOk
              : Boolean(sc.klinis.kontraIndikasi),
          interaksi:
            overrides?.interaksiOk !== undefined
              ? overrides.interaksiOk
              : Boolean(sc.klinis.interaksi),
          duplikasi: Boolean(sc.klinis.duplikasi ?? true)
        }
      }
    };
  };

  const handleSyncPrescriptionsSupabase = async () => {
    if (isDemoMode()) {
      setRxSyncStatus('demo');
      setRxSyncNotice('Mode Demo / Sandbox Aktif: riwayat skrining resep tersimpan lokal di sandbox.');
      return;
    }
    if (!getSupabaseClient()) {
      setRxSyncStatus('error');
      setRxSyncNotice('Klien Supabase belum dikonfigurasi.');
      return;
    }

    setRxSyncLoading(true);
    setRxSyncStatus('syncing');
    try {
      if (onSyncPrescriptionsSupabase) {
        const syncRes = await onSyncPrescriptionsSupabase();
        if (syncRes.isDemo) {
          setRxSyncStatus('demo');
          setRxSyncNotice('Mode Demo / Sandbox Aktif: riwayat skrining resep tersimpan lokal di sandbox.');
          return;
        }
        if (syncRes.needsTableSetup) {
          setRxSyncStatus('needs_setup');
          setRxSyncNotice(
            'Tabel "riwayat_skrining_resep" belum tersedia atau terkendala RLS di Supabase. Klik "Skema SQL Riwayat" lalu jalankan di SQL Editor Supabase.'
          );
          return;
        }
        if (!syncRes.success) {
          setRxSyncStatus('error');
          setRxSyncNotice(`Gagal menyinkronkan ke Supabase: ${syncRes.error || 'Terjadi kendala koneksi'}`);
          return;
        }
        setRxSyncStatus('synced');
        const deletedInfo =
          syncRes.deletedFlushedCount && syncRes.deletedFlushedCount > 0
            ? ` (${syncRes.deletedFlushedCount} penghapusan tertunda ikut dibersihkan di cloud)`
            : '';
        setRxSyncNotice(
          `Sinkronisasi 2-arah selesai! (${syncRes.count ?? 0} data resep tersinkron dengan tabel riwayat_skrining_resep)${deletedInfo}.`
        );
        return;
      }

      // Fallback 2-arah dengan proteksi Tombstone & Pending Delete
      const pendingDeleteIds = getPendingDeleteIds('prescriptions');
      if (pendingDeleteIds.length > 0) {
        const delRes = await deletePrescriptionsFromSupabase(pendingDeleteIds);
        if (delRes.needsTableSetup) {
          setRxSyncStatus('needs_setup');
          setRxSyncNotice(
            'Tabel "riwayat_skrining_resep" belum tersedia di Supabase. Klik "Skema SQL Riwayat" lalu jalankan di SQL Editor Supabase.'
          );
          return;
        }
        if (delRes.success) {
          confirmCloudDeletes('prescriptions', pendingDeleteIds);
        }
      }

      const res = await fetchPrescriptionsFromSupabase();
      if (res.needsTableSetup) {
        setRxSyncStatus('needs_setup');
        setRxSyncNotice(
          'Tabel "riwayat_skrining_resep" belum tersedia di Supabase. Klik "Skema SQL Riwayat" lalu jalankan di SQL Editor Supabase.'
        );
        return;
      }
      if (res.error) {
        setRxSyncStatus('error');
        setRxSyncNotice(`Gagal terhubung ke Supabase: ${res.error}`);
        return;
      }

      const deletedSet = getDeletedIdsSet('prescriptions');
      const pendingSyncSet = getPendingSyncIdsSet('prescriptions');
      const remoteAll = res.data || [];

      const stubbornDeletedIds = remoteAll
        .filter((r) => r.id && deletedSet.has(String(r.id).trim()))
        .map((r) => String(r.id).trim());
      if (stubbornDeletedIds.length > 0) {
        const cleanupRes = await deletePrescriptionsFromSupabase(stubbornDeletedIds);
        if (cleanupRes.success) {
          confirmCloudDeletes('prescriptions', stubbornDeletedIds);
        }
      }

      const remoteClean = remoteAll.filter(
        (r) => r.id && !isDemoPrescriptionId(r.id) && !deletedSet.has(String(r.id).trim())
      );
      const remoteIds = new Set(remoteClean.map((r) => String(r.id).trim()));
      const syncedOnceBefore = hasCompletedInitialCloudSync('prescriptions');

      const localValid = prescriptions.filter(
        (p) => p.id && !isDemoPrescriptionId(p.id) && !deletedSet.has(String(p.id).trim())
      );
      const localToUpload = localValid.filter((p) => {
        const cleanId = String(p.id).trim();
        if (pendingSyncSet.has(cleanId)) return true;
        if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
        return false;
      });

      if (localToUpload.length > 0) {
        const seedRes = await seedPrescriptionsToSupabase(localToUpload);
        if (seedRes.needsTableSetup) {
          setRxSyncStatus('needs_setup');
          setRxSyncNotice('Tabel "riwayat_skrining_resep" belum dibuat di Supabase.');
          return;
        }
        if (seedRes.success) {
          confirmCloudSync(
            'prescriptions',
            localToUpload.map((p) => String(p.id).trim())
          );
        }
      }

      const map = new Map<string, EPrescription>();
      remoteClean.forEach((p) => map.set(String(p.id).trim(), p));
      localToUpload.forEach((p) => {
        const cleanId = String(p.id).trim();
        if (!map.has(cleanId) || pendingSyncSet.has(cleanId)) {
          map.set(cleanId, p);
        }
      });
      const merged = Array.from(map.values());

      markInitialCloudSyncCompleted('prescriptions');
      onSyncPrescriptionsFromSupabase?.(merged);
      setRxSyncStatus('synced');
      setRxSyncNotice(
        `Sinkronisasi 2-arah selesai! (${merged.length} data resep tersinkron dengan tabel riwayat_skrining_resep).`
      );
    } finally {
      setRxSyncLoading(false);
    }
  };

  const handleConfirmReject = () => {
    if (!selectedPres) return;
    const enriched = buildEnrichedPrescription(selectedPres);
    onRejectPrescription(selectedPres.id, rejectReason, {
      screeningChecks: enriched.screeningChecks,
      screenedBy: apjProfile.name,
      screenedAt: new Date().toLocaleString('id-ID')
    });
    setRejectModalOpen(false);
    setSelectedPres(null);
  };

  // Cetak Dokumen Hasil Interaction Checker (Kompatibel dengan PrintView mode telaah-drp)
  const handlePrintInteractionReport = () => {
    if (!interactionResult) return;
    const { matches, highestSeverity, pairsScanned } = interactionResult.result;
    const riskLevel =
      highestSeverity === 'contraindicated' || highestSeverity === 'major'
        ? 'CRITICAL'
        : highestSeverity === 'moderate' || highestSeverity === 'minor'
        ? 'MODERATE'
        : 'SAFE';

    const compatiblePrintData = {
      riskLevel,
      summary:
        matches.length === 0
          ? `Hasil Interaction Checker (tabel interaksi_obat): ${pairsScanned} pasangan obat dipindai, tidak ditemukan interaksi obat.`
          : `Hasil Interaction Checker (tabel interaksi_obat): Ditemukan ${matches.length} interaksi obat (tingkat tertinggi: ${highestSeverity}).`,
      identifiedDRPs: matches.map((m) => ({
        drugName: `${m.rxDrugA} × ${m.rxDrugB}`,
        category: 'Interaksi Obat',
        severity:
          m.severity === 'contraindicated' || m.severity === 'major'
            ? 'Kritis'
            : m.severity === 'moderate'
            ? 'Sedang'
            : 'Rendah',
        clinicalExplanation: `[${m.severity.toUpperCase()}] ${m.mekanisme}`,
        recommendation: m.manajemenKlinis,
        literatureReference: formatBnfPionasReference(m.referensi)
      })),
      pharmacistRecommendations:
        matches.length === 0
          ? ['Tidak ada interaksi obat yang tercatat dalam tabel interaksi_obat untuk kombinasi resep ini.']
          : matches.map((m) => `[${m.severity.toUpperCase()}] ${m.rxDrugA} × ${m.rxDrugB}: ${m.manajemenKlinis}`),
      interactionResult: interactionResult.result
    };

    const printPayload = {
      rx: interactionResult.rx,
      patient: interactionResult.patient,
      rme: interactionResult.rme,
      data: compatiblePrintData,
      timestamp: new Date().toISOString()
    };
    try {
      sessionStorage.setItem('latisha_active_print_drp', JSON.stringify(printPayload));
      demoSetItem('latisha_active_print_drp', JSON.stringify(printPayload));
    } catch (e) {
      console.warn('Storage write error for print interaction report:', e);
    }
    openPrintWindow('telaah-drp', { rxId: interactionResult.rx.id });
  };

  return (
    <div className="space-y-4">
      {/* Header & Tabs */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="p-2 bg-amber-500/15 text-amber-600 rounded-xl">
              <FileCheck2 className="w-5 h-5" />
            </span>
            <h3 className="font-black text-base text-slate-900 tracking-tight">
              Antrean E-Resep &amp; Skrining Standar Apoteker
            </h3>
            <button
              type="button"
              onClick={handleSyncInteraksiObatSupabase}
              disabled={isSyncingInitialRules}
              title="Klik untuk memuat ulang 426 data interaksi_obat dari Supabase"
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 cursor-pointer transition ${
                isDemoMode()
                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
              }`}
            >
              <Database className={`w-3 h-3 ${isDemoMode() ? 'text-amber-600' : 'text-sky-600'}`} />
              <span>
                {isDemoMode()
                  ? `Sandbox interaksi_obat (${interaksiObatList.length})`
                  : `interaksi_obat (${interaksiObatList.length})`}
              </span>
              <RefreshCw
                className={`w-2.5 h-2.5 opacity-75 ${isSyncingInitialRules ? 'animate-spin' : ''}`}
              />
            </button>
            {isOwnerAdmin && interaksiRlsBlocked && !isDemoMode() && (
              <button
                type="button"
                onClick={() => setShowInteraksiSqlModal(true)}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 flex items-center gap-1 cursor-pointer"
                title="Buka Skrip SQL RLS untuk mengizinkan akses baca publik pada tabel interaksi_obat di Supabase"
              >
                <Code className="w-3 h-3" />
                <span>RLS SQL interaksi_obat</span>
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Verifikasi kelayakan administratif, farmasetik, dan klinis terintegrasi Rekam Medis (RME) dengan Interaction Checker langsung ke tabel interaksi_obat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('antrean')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'antrean'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Antrean Resep Masuk ({prescriptions.filter((p) => p.status === 'Pending Skrining').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('riwayat')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'riwayat'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Riwayat Skrining Resep ({prescriptions.filter((p) => p.status !== 'Pending Skrining').length})</span>
          </button>
        </div>
      </div>

      {/* Kartu Identitas Resmi Layanan Farmasi, Kop Apotek & Profil APJ */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white p-4 rounded-2xl border border-indigo-800/60 shadow-xs flex flex-wrap justify-between items-center gap-4 text-xs">
        <div className="flex items-center gap-3.5">
          {pharmacyProfile.logoUrl && (
            <div className="w-12 h-12 rounded-xl bg-white p-1.5 shrink-0 flex items-center justify-center shadow-sm">
              <img
                src={pharmacyProfile.logoUrl}
                alt="Logo Faskes"
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <div className="space-y-1">
            <strong className="text-sm font-black tracking-wide text-white uppercase block">
              {pharmacyProfile.name}
            </strong>
            <p className="text-[11px] text-slate-300">
              {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
            </p>
            <p className="text-[10px] text-slate-300 font-mono flex flex-wrap gap-x-2">
              {pharmacyProfile.sia && <span>SIA: <strong className="text-amber-300">{pharmacyProfile.sia}</strong></span>}
              {pharmacyProfile.nib && <span>· NIB: <strong className="text-amber-300">{pharmacyProfile.nib}</strong></span>}
              {pharmacyProfile.npwp && <span>· NPWP: <strong className="text-amber-300">{pharmacyProfile.npwp}</strong></span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white/10 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/15">
            <span className="text-[9px] uppercase tracking-wider text-indigo-300 font-bold block">
              Apoteker Penanggung Jawab (APJ)
            </span>
            <strong className="text-xs font-black text-white block">{apjProfile.name}</strong>
            <span className="text-[10px] font-mono text-amber-300 block">
              SIPA: {apjProfile.sipa} · STRA: {apjProfile.stra}
            </span>
            <span className="text-[10px] text-slate-300 block mt-0.5">
              {apjProfile.schedule}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/15">
            <span className="text-[9px] uppercase tracking-wider text-emerald-300 font-bold block">
              Dokter Penanggung Jawab (DPJ)
            </span>
            <strong className="text-xs font-black text-white block">{dpjProfile.name}</strong>
            <span className="text-[10px] font-mono text-emerald-300 block">
              SIP: {dpjProfile.sip}
            </span>
            <span className="text-[10px] text-slate-300 block mt-0.5">
              {dpjProfile.specialization}
            </span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari No. Resep, Nama Pasien, No. RM, atau Dokter Peresep..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {activeTab === 'antrean' ? (
        <div className="space-y-4">
          {pendingList.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 italic">
              <FileCheck2 className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
              <p className="font-bold">Tidak ada antrean resep yang menunggu skrining saat ini.</p>
              <p className="text-xs text-slate-400 mt-1">Semua resep dokter telah tertangani atau lolos ke Kasir POS.</p>
            </div>
          ) : (
            pendingList.map((rx) => {
              const sc = getScreening(rx.id);
              const patient = getPatientData(rx.rmId, rx.patientName);
              const rme = getRmeData(rx);
              const isRmeExpanded = expandedRmeId === rx.id;
              const smartReview = runSmartRxReview(rx, patient);
              const activeAssignedStaff =
                rx.assignedStaff && rx.assignedStaff.length > 0
                  ? rx.assignedStaff
                  : rme?.assignedStaff || [];

              return (
                <div
                  key={rx.id}
                  className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 hover:border-slate-300 transition"
                >
                  {/* Top Rx Info & Interaction Checker Button */}
                  <div className="flex flex-wrap justify-between items-start border-b border-slate-200 pb-4 gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sky-800 text-base">{rx.id}</span>
                        <span className="text-[11px] text-slate-400 font-mono">Pukul {rx.timestamp} WIB</span>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full border border-amber-300">
                          Menunggu Skrining Apoteker
                        </span>
                      </div>
                      <h4 className="font-black text-slate-900 text-lg mt-1 flex items-center gap-2">
                        <span>{rx.patientName}</span>
                        <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border">
                          No. RM: {rx.rmId}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Dokter Peresep: <strong className="text-slate-900">{rx.doctorName}</strong>
                      </p>
                      {activeAssignedStaff.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Tim Medis:</span>
                          {activeAssignedStaff.map((st, idx) => (
                            <span
                              key={`${st.staffId}-${idx}`}
                              className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 text-[10px] font-semibold"
                            >
                              {st.staffName} ({st.role})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tombol Interaction Checker (Query live ke tabel Supabase interaksi_obat tanpa AI) */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={checkingRxId === rx.id}
                        onClick={() => handleRunInteractionChecker(rx)}
                        className="px-4 py-2.5 rounded-2xl font-black text-xs shadow-md flex items-center gap-2 transition active:scale-95 cursor-pointer bg-slate-900 hover:bg-slate-800 disabled:bg-slate-700 disabled:cursor-wait text-white border border-slate-700"
                        title="Query langsung ke tabel interaksi_obat di Supabase dan pindai pasangan obat pada e-resep"
                      >
                        {checkingRxId === rx.id ? (
                          <RefreshCw className="w-4 h-4 text-sky-300 animate-spin" />
                        ) : (
                          <GitCompare className="w-4 h-4 text-sky-300" />
                        )}
                        <span>
                          {checkingRxId === rx.id
                            ? 'Memeriksa interaksi_obat...'
                            : 'Interaction Checker'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* 1. INTEGRASI DATA REKAM MEDIS (RME) PADA PANEL SKRINING */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <h5 className="font-black text-slate-800 text-xs flex items-center gap-2 uppercase tracking-wide">
                        <HeartPulse className="w-4 h-4 text-rose-600" />
                        <span>Ringkasan Data Rekam Medis (RME) Pasien</span>
                      </h5>
                      <button
                        onClick={() => setExpandedRmeId(isRmeExpanded ? null : rx.id)}
                        className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isRmeExpanded ? 'Sembunyikan Detail RME' : 'Lihat Detail Lengkap RME'}</span>
                        {isRmeExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* RME Key Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {/* Diagnosa */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Diagnosa Kerja</span>
                        <span className="font-extrabold text-slate-900 leading-tight block mt-0.5">
                          {rme?.icdName ? `${rme.icdCode} - ${rme.icdName}` : (rme?.soapA || 'Infeksi Saluran Napas')}
                        </span>
                      </div>

                      {/* Keluhan Utama */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Keluhan Utama</span>
                        <span className="font-bold text-slate-800 leading-tight block mt-0.5 truncate" title={rme?.soapS}>
                          {rme?.soapS || 'Batuk, demam ringan'}
                        </span>
                      </div>

                      {/* Tanda Vital */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Tanda Vital</span>
                        <div className="font-mono font-bold text-slate-900 text-[11px] mt-0.5">
                          TD: {rme?.vitalSign?.td || '120/80'} | S: {rme?.vitalSign?.suhu || '36.5'}°C
                        </div>
                      </div>

                      {/* Riwayat Alergi */}
                      <div
                        className={`p-2.5 rounded-xl border ${
                          patient?.allergy && !patient.allergy.toLowerCase().includes('tidak ada')
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        }`}
                      >
                        <span className="text-[10px] font-bold block uppercase">Riwayat Alergi</span>
                        <span className="font-black text-xs block mt-0.5">
                          {patient?.allergy || 'Tidak ada riwayat alergi'}
                        </span>
                      </div>
                    </div>

                    {/* Expanded RME Details */}
                    {isRmeExpanded && (
                      <div className="pt-2 border-t border-slate-200 text-xs grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-700 animate-slide-in">
                        <div className="space-y-1 bg-white p-3 rounded-xl border">
                          <p><strong>Pemeriksaan Fisik (Objektif):</strong> {rme?.soapO || 'Fauces hiperemis ringan, ronki (-), wheezing (-)'}</p>
                          <p><strong>Rencana Terapi Dokter (Plan):</strong> {rme?.soapP || 'Edukasi istirahat dan hidrasi cukup.'}</p>
                        </div>
                        <div className="space-y-1 bg-white p-3 rounded-xl border">
                          <p><strong>Fisik Pasien:</strong> BB: {rme?.vitalSign?.bb || patient?.age ? '65 kg' : '-'}, TB: {rme?.vitalSign?.tb || '168 cm'}, SpO2: {rme?.vitalSign?.spo2 || '98'}%</p>
                          <p><strong>Kategori Pasien:</strong> {patient?.category || 'Pasien Umum / Dewasa'}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. DAFTAR OBAT YANG DIRESEPKAN */}
                  <div className="p-4 bg-sky-50/60 border border-sky-200 rounded-2xl text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h5 className="font-extrabold text-sky-950 uppercase text-[11px] flex items-center gap-2">
                        <Pill className="w-4 h-4 text-sky-700" />
                        <span>Rincian Obat Dalam E-Resep:</span>
                      </h5>
                      <button
                        type="button"
                        onClick={() => openRxDetailPreview(rx, 'etiket')}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                        title="Pratinjau & Cetak Label Etiket Instruksi Penggunaan Obat"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>Cetak Label Obat (Etiket)</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {rx.items.map((it, idx) => (
                        <div
                          key={idx}
                          className="bg-white p-3 rounded-xl border border-sky-100 shadow-2xs space-y-1"
                        >
                          <div className="font-black text-slate-900">{it.name}</div>
                          <div className="text-[11px] text-slate-600 font-medium">
                            Jumlah: <strong className="font-mono">{it.qty} {it.unit}</strong>
                          </div>
                          <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md inline-block">
                            Aturan: {it.dosage}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. SMART RX REVIEW: Tersinkronisasi Langsung dengan Tabel Supabase interaksi_obat & Duplikasi Terapi */}
                  {(() => {
                    const review = smartReview;
                    const hasCriticalIssue = review.issues.some((i) => i.severity === 'Kritis');
                    return (
                      <div
                        className={`p-4 rounded-2xl border transition ${
                          hasCriticalIssue
                            ? 'bg-rose-50/70 border-rose-300 shadow-xs'
                            : review.hasIssues
                            ? 'bg-amber-50/70 border-amber-300 shadow-xs'
                            : isSyncingInitialRules
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-emerald-50/50 border-emerald-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            {hasCriticalIssue ? (
                              <ShieldAlert className="w-4 h-4 text-rose-600 animate-pulse" />
                            ) : review.hasIssues ? (
                              <ShieldAlert className="w-4 h-4 text-amber-600 animate-pulse" />
                            ) : isSyncingInitialRules ? (
                              <RefreshCw className="w-4 h-4 text-sky-600 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            )}
                            <h5 className="font-extrabold text-slate-900 text-xs flex flex-wrap items-center gap-2">
                              <span>Smart Rx Review (DDI & Duplikasi Terapi Otomatis)</span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border font-bold text-slate-600">
                                Standar BNF & BPOM PIONAS
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  isSyncingInitialRules
                                    ? 'bg-sky-50 text-sky-800 border-sky-200'
                                    : isDemoMode()
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : review.isSyncedWithSupabase
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-300'
                                }`}
                              >
                                {isSyncingInitialRules
                                  ? 'Menyelaraskan interaksi_obat...'
                                  : isDemoMode()
                                  ? 'Sandbox interaksi_obat'
                                  : review.isSyncedWithSupabase
                                  ? 'Sinkron Supabase interaksi_obat'
                                  : 'Referensi Lokal interaksi_obat'}
                              </span>
                            </h5>
                          </div>
                          {review.hasIssues && (
                            <button
                              type="button"
                              onClick={() => applySmartReviewToScreening(rx.id, review.issues)}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                              title="Terapkan temuan Smart Rx Review ke catatan skrining apoteker"
                            >
                              <Copy className="w-3 h-3" />
                              <span>Salin ke Catatan Skrining</span>
                            </button>
                          )}
                        </div>

                        {!review.hasIssues ? (
                          isSyncingInitialRules ? (
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                              <span>Sedang memindai kombinasi obat terhadap tabel Supabase interaksi_obat...</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                              <span>✓ Tidak terdeteksi interaksi obat-obat (DDI) pada tabel interaksi_obat maupun duplikasi terapi / kontraindikasi alergi pada resep ini.</span>
                            </div>
                          )
                        ) : (
                          <div className="space-y-2 mt-2">
                            {review.issues.map((iss, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-xl border bg-white text-xs space-y-1.5 ${
                                  iss.severity === 'Kritis'
                                    ? 'border-rose-300'
                                    : iss.severity === 'Sedang'
                                    ? 'border-amber-300'
                                    : 'border-sky-300'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                        iss.severity === 'Kritis'
                                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                          : iss.severity === 'Sedang'
                                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                          : 'bg-sky-100 text-sky-800 border border-sky-200'
                                      }`}
                                    >
                                      {(iss.dbSeverity || iss.severity).toUpperCase()} • {iss.type}
                                    </span>
                                    <span className="font-extrabold text-slate-900">{iss.title}</span>
                                    {iss.source && (
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600">
                                        {iss.source === 'supabase' ? 'Supabase interaksi_obat' : 'Lokal interaksi_obat'}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                    {iss.drugs}
                                  </span>
                                </div>
                                <p className="text-slate-700 leading-relaxed text-[11px]">
                                  {iss.explanation}
                                </p>
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px]">
                                  <span className="text-indigo-900 font-semibold">
                                    <strong>Saran Manajemen Klinis:</strong> {iss.recommendation}
                                  </span>
                                  <a
                                    href={iss.referenceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-bold text-sky-700 hover:text-sky-900 underline text-[11px] bg-sky-50 px-2 py-0.5 rounded-md hover:bg-sky-100 transition"
                                  >
                                    <BookOpen className="w-3 h-3 text-sky-600" />
                                    <span>{iss.reference}</span>
                                    <ExternalLink className="w-3 h-3 text-sky-500" />
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 4. TIGA PILAR SKRINING RESEP APOTEKER */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {/* 1. Administratif */}
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <h5 className="font-black text-slate-800 text-[10px] uppercase tracking-wider border-b pb-1">
                        1. Skrining Administratif
                      </h5>
                      <div className="space-y-1.5 font-medium text-slate-700">
                        {[
                          { key: 'namaDokter', label: 'Nama & SIP Dokter' },
                          { key: 'sip', label: 'Alamat & Kontak Praktik' },
                          { key: 'tglResep', label: 'Tanggal Penulisan Resep' },
                          { key: 'paraf', label: 'Identitas & Usia Pasien' }
                        ].map((f) => (
                          <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sc.admin[f.key]}
                              onChange={() => toggleCheck(rx.id, 'admin', f.key)}
                              className="w-4 h-4 rounded text-sky-600"
                            />
                            <span>{f.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* 2. Farmasetik */}
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <h5 className="font-black text-slate-800 text-[10px] uppercase tracking-wider border-b pb-1">
                        2. Skrining Farmasetik
                      </h5>
                      <div className="space-y-1.5 font-medium text-slate-700">
                        {[
                          { key: 'bentukSediaan', label: 'Bentuk & Kekuatan Sediaan' },
                          { key: 'dosis', label: 'Dosis & Jumlah Obat' },
                          { key: 'stabilitas', label: 'Stabilitas Sediaan' },
                          { key: 'kompatibilitas', label: 'Inkompatibilitas Pencampuran' }
                        ].map((f) => (
                          <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sc.farmasetik[f.key]}
                              onChange={() => toggleCheck(rx.id, 'farmasetik', f.key)}
                              className="w-4 h-4 rounded text-sky-600"
                            />
                            <span>{f.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* 3. Klinis */}
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <h5 className="font-black text-slate-800 text-[10px] uppercase tracking-wider border-b pb-1">
                        3. Skrining Klinis (CDSS)
                      </h5>
                      <div className="space-y-1.5 font-medium text-slate-700">
                        {[
                          { key: 'tepatDosis', label: 'Ketepatan Indikasi & Dosis' },
                          { key: 'tepatWaktu', label: 'Aturan & Durasi Pakai' },
                          { key: 'duplikasi', label: 'Duplikasi / Polifarmasi' },
                          { key: 'kontraIndikasi', label: 'Kontraindikasi & Alergi' }
                        ].map((f) => (
                          <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sc.klinis[f.key]}
                              onChange={() => toggleCheck(rx.id, 'klinis', f.key)}
                              className="w-4 h-4 rounded text-sky-600"
                            />
                            <span>{f.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Catatan Skrining Apoteker */}
                  {sc.notes && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs space-y-1">
                      <span className="font-black text-amber-900 text-[10px] uppercase tracking-wider block">
                        Catatan Telaah Klinis Apoteker:
                      </span>
                      <p className="text-slate-800 font-medium whitespace-pre-line text-[11px]">
                        {sc.notes}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons & Identitas Apoteker Pemeriksa */}
                  <div className="pt-3 flex flex-wrap justify-between items-center gap-3 border-t border-slate-200">
                    <div className="text-[11px] text-slate-600 flex items-center gap-2">
                      <User className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div>
                        <span>Diverifikasi oleh Apoteker (APJ): </span>
                        <strong className="text-slate-900">{apjProfile.name}</strong>
                        <span className="font-mono text-[10px] text-slate-500 ml-1">
                          (SIPA: {apjProfile.sipa} · STRA: {apjProfile.stra})
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => {
                          setSelectedPres(rx);
                          setRejectModalOpen(true);
                        }}
                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs transition border border-rose-200 cursor-pointer"
                      >
                        Tolak / Tidak Memenuhi Syarat
                      </button>
                      <button
                        onClick={() => onApproveToPOS(buildEnrichedPrescription(rx))}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Lolos Skrining & Teruskan ke Kasir POS</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* History Tab */
        <div className="space-y-3">
          {/* Bar Sinkronisasi 2-Arah Supabase riwayat_skrining_resep */}
          <div
            className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
              rxSyncStatus === 'needs_setup'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : rxSyncStatus === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : rxSyncStatus === 'demo'
                ? 'bg-slate-100 border-slate-300 text-slate-800'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Database
                className={`w-4 h-4 shrink-0 ${
                  rxSyncStatus === 'needs_setup'
                    ? 'text-amber-600'
                    : rxSyncStatus === 'error'
                    ? 'text-rose-600'
                    : rxSyncStatus === 'demo'
                    ? 'text-slate-600'
                    : 'text-emerald-700'
                }`}
              />
              <div className="text-[11px] leading-snug">
                <span className="font-extrabold block">
                  {rxSyncStatus === 'demo'
                    ? 'Mode Demo Sandbox — Riwayat Skrining Resep Terisolasi Lokal'
                    : rxSyncStatus === 'needs_setup'
                    ? 'Tabel Supabase "riwayat_skrining_resep" Belum Dibuat'
                    : 'Sinkronisasi 2-Arah Realtime: tabel Supabase riwayat_skrining_resep'}
                </span>
                <span className="text-[10px] opacity-85 block mt-0.5">
                  {rxSyncNotice ||
                    'Setiap hasil skrining (Lolos, Ditolak, Selesai di POS) otomatis tersimpan dan disinkronkan secara real-time dengan Supabase.'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isOwnerAdmin && (
                <button
                  type="button"
                  onClick={() => setShowPrescriptionSqlModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>Skema SQL Riwayat</span>
                </button>
              )}
              <button
                type="button"
                disabled={rxSyncLoading}
                onClick={handleSyncPrescriptionsSupabase}
                className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rxSyncLoading ? 'animate-spin' : ''}`} />
                <span>{rxSyncLoading ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
              </button>
            </div>
          </div>

          {savedExtRxBanner && (
            <div className="p-4 rounded-2xl border border-indigo-300 bg-indigo-50 text-indigo-950 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <strong className="font-black block">
                    Resep Dokter Luar #{savedExtRxBanner.id} ({savedExtRxBanner.patientName}) Berhasil Disimpan ke Riwayat Skrining Resep!
                  </strong>
                  <span className="text-[11px] text-indigo-800">
                    Dokter: {savedExtRxBanner.doctorName} · {savedExtRxBanner.items.length} item obat telah terverifikasi dan tersimpan permanen.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openRxDetailPreview(savedExtRxBanner, 'etiket')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Cetak Label Obat</span>
                </button>
                <button
                  type="button"
                  onClick={() => openRxDetailPreview(savedExtRxBanner, 'salinan')}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Salinan &amp; Skrining</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSavedExtRxBanner(null)}
                  className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto w-full custom-scrollbar">
              <table className="w-full min-w-[860px] text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600 text-[11px]">
                <tr>
                  <th className="p-3.5">No. Resep &amp; Waktu</th>
                  <th className="p-3.5">Pasien &amp; Identitas</th>
                  <th className="p-3.5">Dokter Peresep &amp; Instansi</th>
                  <th className="p-3.5">Daftar Obat &amp; Signa</th>
                  <th className="p-3.5">Catatan Skrining &amp; Verifikator</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {paginatedHistoryList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-slate-400"
                    >
                      Belum ada riwayat resep yang telah diverifikasi.
                    </td>
                  </tr>
                ) : (
                  paginatedHistoryList.map((item) => {
                    const extMeta = item.screeningChecks?.externalMeta;
                    const isExtRx = Boolean(
                      item.isExternalRx || extMeta?.isExternalRx || item.id.startsWith('RXL-')
                    );
                    const resolvedAge =
                      item.patientAge !== undefined && item.patientAge !== ''
                        ? item.patientAge
                        : extMeta?.patientAge;
                    const resolvedAddress = item.patientAddress || extMeta?.patientAddress;
                    const resolvedOrigin = item.originFacility || extMeta?.originFacility;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 font-mono">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-sky-700">{item.id}</span>
                            {isExtRx && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 font-sans font-black text-[9px] uppercase">
                                Rx Luar
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{item.timestamp} WIB</span>
                        </td>
                        <td className="p-3.5">
                          <strong className="text-slate-900 block">{item.patientName}</strong>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            RM: {item.rmId}
                            {resolvedAge ? ` · ${resolvedAge} Th` : ''}
                          </span>
                          {resolvedAddress && (
                            <span className="text-[10px] text-slate-500 block mt-0.5 line-clamp-1">
                              Alamat: {resolvedAddress}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-800">
                          <span className="font-semibold block">{item.doctorName}</span>
                          {resolvedOrigin && !item.doctorName.includes(resolvedOrigin) && (
                            <span className="text-[10px] text-indigo-700 font-medium block mt-0.5">
                              {resolvedOrigin}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <ul className="list-disc list-inside text-slate-700 space-y-1">
                            {item.items.map((it, idx) => (
                              <li key={idx}>
                                <span className="font-semibold text-slate-900">{it.name}</span>{' '}
                                <span className="text-slate-600">
                                  ({it.qty} {it.unit})
                                </span>
                                {it.dosage && (
                                  <span className="block pl-4 text-[10px] text-slate-500 italic">
                                    ∫ {it.dosage}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="p-3.5 text-slate-600 max-w-xs space-y-1">
                          <p className="italic whitespace-pre-line text-[11px]">
                            {item.screeningNotes || 'Memenuhi standar administratif, farmasetik & klinis.'}
                          </p>
                          {(item.screenedBy || item.screenedAt) && (
                            <span className="block text-[10px] text-slate-400 not-italic font-mono">
                              Verifikator: {item.screenedBy || apjProfile.name}
                              {item.screenedAt ? ` · ${item.screenedAt}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`px-3 py-1 rounded-full font-bold text-[10px] inline-block whitespace-nowrap ${
                              item.status.includes('Lolos') ||
                              item.status.includes('Selesai') ||
                              item.status.includes('Diterima')
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : item.status.includes('Ganti')
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openRxDetailPreview(item, 'salinan')}
                              className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                              title="Cetak Lembar Salinan Resep & Hasil Skrining"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Cetak</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openRxDetailPreview(item, 'etiket')}
                              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                              title="Cetak Label Instruksi Penggunaan Obat (Etiket)"
                            >
                              <Tag className="w-3.5 h-3.5" />
                              <span>Etiket</span>
                            </button>

                            {onDeletePrescriptionHistory && (
                              <>
                                {confirmDeleteRxId === item.id ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const targetId = item.id;
                                        setConfirmDeleteRxId(null);
                                        const res = await onDeletePrescriptionHistory(targetId);
                                        if (res && typeof res === 'object') {
                                          if (res.isDemo) {
                                            setRxSyncStatus('demo');
                                            setRxSyncNotice(
                                              `Riwayat skrining resep #${targetId} berhasil dihapus permanen dari penyimpanan lokal sandbox.`
                                            );
                                          } else if (res.needsTableSetup) {
                                            setRxSyncStatus('needs_setup');
                                            setRxSyncNotice(
                                              `Resep #${targetId} dihapus permanen secara lokal. Jalankan "Skema SQL Riwayat" agar penghapusan juga diterapkan di tabel Supabase.`
                                            );
                                          } else if (res.success) {
                                            setRxSyncStatus('synced');
                                            setRxSyncNotice(
                                              `Riwayat skrining resep #${targetId} berhasil dihapus permanen (lokal & Supabase riwayat_skrining_resep).`
                                            );
                                          } else if (res.error) {
                                            setRxSyncStatus('error');
                                            setRxSyncNotice(
                                              `Resep #${targetId} telah dihapus lokal dan dikunci agar tidak muncul lagi (penghapusan cloud dijadwalkan saat koneksi pulih: ${res.error}).`
                                            );
                                          }
                                        }
                                      }}
                                      className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                    >
                                      Hapus
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteRxId(null)}
                                      className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteRxId(item.id)}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                    title="Hapus dari Riwayat Skrining"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>
            <PaginationControls
              currentPage={safeHistoryPage}
              totalPages={historyTotalPages}
              totalCount={historyList.length}
              pageSize={historyPageSize}
              onPageChange={setHistoryPage}
              onPageSizeChange={(sz) => {
                setHistoryPageSize(sz);
                setHistoryPage(1);
              }}
              itemLabel="riwayat resep"
            />
          </div>
        </div>
      )}

      {/* POP-UP MODAL: PRATINJAU HASIL INTERACTION CHECKER (DATABASE interaksi_obat) */}
      {interactionResult && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-slate-300 my-6 animate-scale-up">
            {/* Modal Header dengan Indikator Tingkat Keparahan Tertinggi */}
            <div
              className={`px-6 py-4 text-white flex justify-between items-center ${
                interactionResult.result.highestSeverity === 'contraindicated'
                  ? 'bg-rose-900'
                  : interactionResult.result.highestSeverity === 'major'
                  ? 'bg-red-800'
                  : interactionResult.result.highestSeverity === 'moderate'
                  ? 'bg-amber-800'
                  : interactionResult.result.highestSeverity === 'minor'
                  ? 'bg-sky-800'
                  : 'bg-emerald-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-white/10 backdrop-blur-xs">
                  {interactionResult.result.highestSeverity === 'contraindicated' ||
                  interactionResult.result.highestSeverity === 'major' ? (
                    <ShieldAlert className="w-6 h-6 text-rose-200" />
                  ) : interactionResult.result.highestSeverity === 'moderate' ||
                    interactionResult.result.highestSeverity === 'minor' ? (
                    <AlertTriangle className="w-6 h-6 text-amber-200" />
                  ) : (
                    <ShieldCheck className="w-6 h-6 text-emerald-200" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-sm uppercase tracking-wide">
                      Interaction Checker — Hasil Skrining Obat
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                      {interactionResult.result.highestSeverity === 'none'
                        ? 'TIDAK ADA INTERAKSI'
                        : `SEVERITY TERTINGGI: ${interactionResult.result.highestSeverity}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/80 mt-0.5">
                    Resep #{interactionResult.rx.id} | Pasien: {interactionResult.rx.patientName} (RM: {interactionResult.rx.rmId})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInteractionResult(null)}
                className="text-white/80 hover:text-white p-1 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
              {/* Banner Status Koneksi Live Supabase / Mode Demo / Fallback Jaringan */}
              {interactionResult.result.liveFetchStatus === 'supabase-live' && (
                <div className="px-4 py-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-950 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2 font-bold">
                    <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Terhubung Live ke Supabase (<span className="font-mono">interaksi_obat</span>):{' '}
                      <strong>{interactionResult.result.supabaseRowCount || 0} aturan</strong> berhasil diambil real-time.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRunInteractionChecker(interactionResult.rx)}
                    disabled={checkingRxId === interactionResult.rx.id}
                    className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${checkingRxId === interactionResult.rx.id ? 'animate-spin' : ''}`} />
                    <span>Refresh Query</span>
                  </button>
                </div>
              )}

              {interactionResult.result.liveFetchStatus === 'demo-sandbox' && (
                <div className="px-4 py-2.5 rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 flex items-center gap-2 text-[11px] font-semibold">
                  <Database className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    <strong>Mode Demo / Sandbox Aktif:</strong> Pemeriksaan menggunakan penyimpanan lokal{' '}
                    <span className="font-mono">interaksi_obat</span> terisolasi tanpa mengakses database produksi Supabase.
                  </span>
                </div>
              )}

              {interactionResult.result.liveFetchStatus === 'fallback-error' && (
                <div className="px-4 py-2.5 rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-start gap-2">
                    <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block">Koneksi Live Supabase Terkendala — Fallback ke Data Lokal</strong>
                      <span className="text-amber-800">
                        {interactionResult.result.liveErrorMessage || 'Menggunakan aturan interaksi_obat tersimpan.'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRunInteractionChecker(interactionResult.rx)}
                    disabled={checkingRxId === interactionResult.rx.id}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-400 hover:bg-amber-100 text-amber-900 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${checkingRxId === interactionResult.rx.id ? 'animate-spin' : ''}`} />
                    <span>Coba Query Ulang</span>
                  </button>
                </div>
              )}

              {interactionResult.result.liveFetchStatus === 'fallback-empty' && (
                <div className="px-4 py-2.5 rounded-2xl border border-sky-200 bg-sky-50 text-sky-950 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2 font-semibold">
                    <Database className="w-4 h-4 text-sky-600 shrink-0" />
                    <span>
                      Tabel <span className="font-mono">interaksi_obat</span> di Supabase masih kosong (0 baris); pencocokan menggunakan referensi lokal terpadu.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRunInteractionChecker(interactionResult.rx)}
                    disabled={checkingRxId === interactionResult.rx.id}
                    className="px-2.5 py-1 rounded-lg bg-white border border-sky-300 hover:bg-sky-100 text-sky-900 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${checkingRxId === interactionResult.rx.id ? 'animate-spin' : ''}`} />
                    <span>Cek Ulang</span>
                  </button>
                </div>
              )}

              {/* Metadata Pemindaian Tabel interaksi_obat */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-slate-900 uppercase text-[11px]">
                    <Database className="w-4 h-4 text-sky-700" />
                    <span>Pemindaian Langsung Tabel interaksi_obat</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white border border-slate-300 text-slate-700">
                    Sumber:{' '}
                    {interactionResult.result.isDemoSandbox
                      ? 'Sandbox Lokal (Mode Demo)'
                      : interactionResult.result.dataSource === 'supabase'
                      ? 'Supabase Live (interaksi_obat)'
                      : interactionResult.result.dataSource === 'hybrid'
                      ? 'Supabase Live + Referensi Lokal'
                      : 'Cache / Referensi Lokal'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Obat di Resep</span>
                    <strong className="text-sm font-mono font-black text-slate-900">
                      {interactionResult.result.totalDrugs} Item
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Pasangan Dipindai</span>
                    <strong className="text-sm font-mono font-black text-slate-900">
                      {interactionResult.result.pairsScanned} Pasang
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Aturan Diperiksa</span>
                    <strong className="text-sm font-mono font-black text-slate-900">
                      {interactionResult.result.totalRulesChecked} Data
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Interaksi Ditemukan</span>
                    <strong
                      className={`text-sm font-mono font-black ${
                        interactionResult.result.matches.length > 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {interactionResult.result.matches.length} Temuan
                    </strong>
                  </div>
                </div>

                {/* Indikator Jumlah Per Tingkat Keparahan */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {(['contraindicated', 'major', 'moderate', 'minor'] as DrugInteractionSeverity[]).map((sev) => {
                    const meta = SEVERITY_META[sev];
                    const count = interactionResult.result.severityCounts[sev];
                    return (
                      <div
                        key={sev}
                        className={`px-3 py-2 rounded-xl border flex items-center justify-between ${
                          count > 0 ? meta.cardClass : 'bg-white border-slate-200 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`} />
                          <span className="font-black uppercase text-[10px] tracking-wide text-slate-900">
                            {meta.label}
                          </span>
                        </div>
                        <span className="font-mono font-black text-xs text-slate-900">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Daftar Obat yang Dipindai dalam Resep */}
              <div className="bg-sky-50/60 border border-sky-200 rounded-2xl p-3.5 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-950 block">
                  Daftar Obat pada E-Resep Aktif ({interactionResult.rx.items.length}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {interactionResult.rx.items.map((it, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-white border border-sky-200 rounded-lg text-[11px] font-bold text-slate-800"
                    >
                      {idx + 1}. {it.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Daftar Hasil Interaksi dari Tabel interaksi_obat */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h6 className="font-black text-slate-900 uppercase text-[11px] flex items-center gap-1.5">
                    <GitCompare className="w-4 h-4 text-slate-700" />
                    <span>
                      Daftar Interaksi Obat Ditemukan ({interactionResult.result.matches.length})
                    </span>
                  </h6>
                  {interactionResult.result.matches.length > 0 && (
                    <button
                      type="button"
                      onClick={handleApplyInteractionToScreening}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedRecommendation ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedRecommendation ? 'Tersalin ke Skrining!' : 'Salin ke Form Skrining'}</span>
                    </button>
                  )}
                </div>

                {interactionResult.result.matches.length === 0 ? (
                  <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-emerald-950">
                    <div className="flex items-center gap-2 font-black text-xs">
                      <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                      <span>
                        Tidak ditemukan kecocokan interaksi obat di tabel interaksi_obat untuk resep ini.
                      </span>
                    </div>
                    {interactionResult.result.checkedPairs.length > 0 ? (
                      <div className="text-[11px] text-emerald-900 space-y-1 pl-7">
                        <span className="font-bold block">Pasangan obat yang telah dipindai:</span>
                        <ul className="list-disc list-inside space-y-0.5">
                          {interactionResult.result.checkedPairs.map((pair, idx) => (
                            <li key={idx}>
                              {pair.drugA} × {pair.drugB}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-[11px] text-emerald-900 pl-7">
                        Resep hanya berisi {interactionResult.result.totalDrugs} item obat (minimal 2 item untuk pengecekan pasangan interaksi).
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {interactionResult.result.matches.map((match, idx) => {
                      const meta = SEVERITY_META[match.severity];
                      return (
                        <div
                          key={`${match.ruleId}-${idx}`}
                          className={`p-4 rounded-2xl border-2 space-y-3 ${meta.cardClass}`}
                        >
                          <div className="flex flex-wrap justify-between items-start gap-2">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-slate-900 text-xs sm:text-sm">
                                  {match.rxDrugA} × {match.rxDrugB}
                                </span>
                                <span
                                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${meta.badgeClass}`}
                                >
                                  {meta.label}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-600">
                                Aturan Database: <strong>{match.obatA}</strong> + <strong>{match.obatB}</strong>
                              </div>
                            </div>

                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-white border border-slate-300 text-slate-700">
                              ID: {match.ruleId} · {match.source === 'supabase' ? 'Supabase' : 'Lokal'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                                Mekanisme
                              </span>
                              <p className="text-slate-800 leading-relaxed">{match.mekanisme}</p>
                            </div>

                            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 block">
                                Manajemen Klinis
                              </span>
                              <p className="text-slate-900 font-semibold leading-relaxed">
                                {match.manajemenKlinis}
                              </p>
                            </div>
                          </div>

                          {match.referensi && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-600">
                              <BookOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>Referensi: {match.referensi}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => setInteractionResult(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Tutup Pratinjau
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintInteractionReport}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Laporan Interaksi</span>
                </button>

                {interactionResult.result.highestSeverity === 'contraindicated' ||
                interactionResult.result.highestSeverity === 'major' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const summaryReason = interactionResult.result.matches
                        .map((m) => `[${m.severity.toUpperCase()}] ${m.rxDrugA} × ${m.rxDrugB}: ${m.manajemenKlinis}`)
                        .join(' | ');
                      setSelectedPres(interactionResult.rx);
                      setRejectReason(summaryReason || 'Terdeteksi interaksi obat major/contraindicated.');
                      setInteractionResult(null);
                      setRejectModalOpen(true);
                    }}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Tolak Resep (Interaksi {interactionResult.result.highestSeverity})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const { matches, highestSeverity, pairsScanned } = interactionResult.result;
                      const noteText =
                        matches.length === 0
                          ? `[Interaction Checker - interaksi_obat] ${pairsScanned} pasangan obat dipindai: Tidak ditemukan interaksi obat.`
                          : `[Interaction Checker - interaksi_obat | Severity Tertinggi: ${highestSeverity.toUpperCase()}]\n` +
                            matches
                              .map(
                                (m, idx) =>
                                  `${idx + 1}. [${m.severity.toUpperCase()}] ${m.rxDrugA} × ${m.rxDrugB}\n   Mekanisme: ${m.mekanisme}\n   Manajemen Klinis: ${m.manajemenKlinis}`
                              )
                              .join('\n');
                      const hasMajorOrContraindicated = matches.some(
                        (m) => m.severity === 'contraindicated' || m.severity === 'major'
                      );
                      handleApplyInteractionToScreening();
                      onApproveToPOS(
                        buildEnrichedPrescription(interactionResult.rx, {
                          notes: noteText,
                          interaksiOk: matches.length === 0,
                          kontraIndikasiOk: !hasMajorOrContraindicated
                        })
                      );
                      setInteractionResult(null);
                    }}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Simpan Hasil & Loloskan ke POS</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && selectedPres && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-extrabold text-sm uppercase">Konfirmasi Penolakan Resep</h3>
              <button
                onClick={() => setRejectModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600">
                Resep <strong>{selectedPres.id}</strong> atas nama pasien{' '}
                <strong>{selectedPres.patientName}</strong> akan ditolak dan dikembalikan kepada dokter peresep.
              </p>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Alasan Penolakan Klinis / Masalah Skrining (DRPs) *
                </label>
                <textarea
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full p-2.5 border rounded-xl font-medium outline-none focus:ring-2 focus:ring-rose-500 text-xs"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold cursor-pointer"
                >
                  Konfirmasi Tolak Resep
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Skema SQL Tabel Riwayat Skrining Resep (APJ / Owner Only) */}
      {isOwnerAdmin && showPrescriptionSqlModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm tracking-wide">
                  Skema SQL Tabel Riwayat Skrining Resep Supabase
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrescriptionSqlModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 font-mono text-xs bg-slate-950 text-emerald-400">
              <div className="flex justify-between items-center text-slate-400 text-[11px]">
                <span>-- Copy &amp; Paste ke SQL Editor Supabase (aman dijalankan ulang)</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_PRESCRIPTION_SQL_SCHEMA);
                    setCopiedPrescriptionSql(true);
                    setTimeout(() => setCopiedPrescriptionSql(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 font-sans transition-all cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedPrescriptionSql ? 'Tersalin!' : 'Salin Skrip DDL SQL'}</span>
                </button>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed select-all">
                {SUPABASE_PRESCRIPTION_SQL_SCHEMA}
              </pre>
            </div>
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  setShowPrescriptionSqlModal(false);
                  await handleSyncPrescriptionsSupabase();
                }}
                className="px-4 py-1.5 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 cursor-pointer"
              >
                Uji Koneksi &amp; Sinkronkan
              </button>
              <button
                type="button"
                onClick={() => setShowPrescriptionSqlModal(false)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Skema & Kebijakan RLS Tabel interaksi_obat (426 Data) */}
      {isOwnerAdmin && showInteraksiSqlModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm tracking-wide">
                  Skema &amp; Kebijakan RLS Tabel interaksi_obat (426 Data) Supabase
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInteraksiSqlModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-amber-950 text-xs">
              Jika tabel <span className="font-mono font-bold">interaksi_obat</span> di Supabase mengaktifkan Row-Level Security (RLS) tanpa policy baca publik, jalankan skrip di bawah pada <strong>SQL Editor Supabase</strong> agar seluruh <strong>426 baris data interaksi_obat</strong> dapat dibaca langsung oleh aplikasi.
            </div>
            <div className="p-4 overflow-y-auto space-y-3 font-mono text-xs bg-slate-950 text-emerald-400">
              <div className="flex justify-between items-center text-slate-400 text-[11px]">
                <span>-- Copy &amp; Paste ke SQL Editor Supabase (aman dijalankan ulang)</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_INTERAKSI_OBAT_SQL_SCHEMA);
                    setCopiedInteraksiSql(true);
                    setTimeout(() => setCopiedInteraksiSql(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 font-sans transition-all cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedInteraksiSql ? 'Tersalin!' : 'Salin Skrip RLS SQL'}</span>
                </button>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed select-all">
                {SUPABASE_INTERAKSI_OBAT_SQL_SCHEMA}
              </pre>
            </div>
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  setShowInteraksiSqlModal(false);
                  await handleSyncInteraksiObatSupabase();
                }}
                className="px-4 py-1.5 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 cursor-pointer"
              >
                Uji Koneksi &amp; Muat 426 Data
              </button>
              <button
                type="button"
                onClick={() => setShowInteraksiSqlModal(false)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: FORM INPUT RESEP DOKTER LUAR ("RX LUAR") & INTERACTION CHECKER */}
      {/* ===================================================================== */}
      {showExternalRxModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-[90] p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-300 my-6 flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/30">
                  <Stethoscope className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-sm uppercase tracking-wide">
                      Form Input Resep Dokter Luar (Rx Luar)
                    </h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-indigo-500/30 text-indigo-100 border border-indigo-400/40">
                      Skrining Standar Apoteker
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Input data resep dokter luar, analisis otomatis dengan <span className="font-mono text-amber-300">interaksi_obat</span> Supabase, dan simpan ke Riwayat Skrining Resep.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExternalRxModal(false)}
                className="text-slate-300 hover:text-white p-1.5 rounded-xl hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs overflow-y-auto flex-1">
              {extFormError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{extFormError}</span>
                </div>
              )}

              {/* Bagian 1: Identitas Dokter Peresep & Instansi Asal */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 font-black text-slate-800 uppercase text-[11px]">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>1. Identitas Dokter Peresep &amp; Asal Fasilitas Kesehatan</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Nama Dokter Peresep <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={extDoctorName}
                      onChange={(e) => setExtDoctorName(e.target.value)}
                      placeholder="Contoh: dr. Hendra Wijaya, Sp.PD"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Instansi / Klinik / Rumah Sakit Asal <span className="text-slate-400 font-normal">(Opsional)</span>
                    </label>
                    <input
                      type="text"
                      value={extOriginFacility}
                      onChange={(e) => setExtOriginFacility(e.target.value)}
                      placeholder="Contoh: RSUD Cibabat / Klinik Pratama Sehat"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Bagian 2: Identitas Pasien */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 font-black text-slate-800 uppercase text-[11px]">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span>2. Data Pasien Resep Luar</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      Nama Pasien <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={extPatientName}
                      onChange={(e) => setExtPatientName(e.target.value)}
                      placeholder="Contoh: Ny. Siti Aminah"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Umur Pasien (Tahun) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={extPatientAge}
                      onChange={(e) => setExtPatientAge(e.target.value)}
                      placeholder="Contoh: 48"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Tanggal Terima Resep
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={new Date().toLocaleDateString('id-ID')}
                      className="w-full px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-xl font-mono text-slate-600"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block font-bold text-slate-700 mb-1">
                      Alamat Pasien <span className="text-rose-600">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={extPatientAddress}
                        onChange={(e) => setExtPatientAddress(e.target.value)}
                        placeholder="Masukkan alamat lengkap tempat tinggal pasien..."
                        className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-xl font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bagian 3: Tabel / Baris Input Obat */}
              <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-slate-900 uppercase text-[11px]">
                    <Pill className="w-4 h-4 text-indigo-600" />
                    <span>3. Tabel Input Obat Resep Luar (R/)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddExtItemRow}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-black text-[11px] flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Baris Obat</span>
                  </button>
                </div>

                {/* Datalist saran obat dari katalog master_obat (tetap bisa input manual bebas) */}
                <datalist id="ext-rx-medicine-suggestions">
                  {medicines.slice(0, 300).map((m) => (
                    <option key={m.id} value={m.name} />
                  ))}
                </datalist>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5 w-10 text-center">No</th>
                        <th className="p-2.5 min-w-[220px]">Nama Obat (Input Manual / Pilih) *</th>
                        <th className="p-2.5 w-24 text-center">Jumlah *</th>
                        <th className="p-2.5 w-28">Satuan</th>
                        <th className="p-2.5 min-w-[210px]">Aturan Pakai / Signa (∫) *</th>
                        <th className="p-2.5 w-12 text-center">Hapus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {extItems.map((row, idx) => (
                        <tr key={row.rowId} className="hover:bg-slate-50/80">
                          <td className="p-2 text-center font-mono font-bold text-slate-500">
                            R/{idx + 1}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              list="ext-rx-medicine-suggestions"
                              value={row.name}
                              onChange={(e) =>
                                handleUpdateExtItemRow(row.rowId, 'name', e.target.value)
                              }
                              placeholder="Ketik nama obat (mis: Simvastatin 20mg / Amlodipine 10mg)"
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={1}
                              value={row.qty}
                              onChange={(e) =>
                                handleUpdateExtItemRow(
                                  row.rowId,
                                  'qty',
                                  Math.max(1, parseInt(e.target.value, 10) || 1)
                                )
                              }
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-center text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.unit}
                              onChange={(e) =>
                                handleUpdateExtItemRow(row.rowId, 'unit', e.target.value)
                              }
                              placeholder="Tab / Kaps / Btl"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.dosage}
                              onChange={(e) =>
                                handleUpdateExtItemRow(row.rowId, 'dosage', e.target.value)
                              }
                              placeholder="Contoh: 3x1 tab sesudah makan"
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              disabled={extItems.length <= 1}
                              onClick={() => handleRemoveExtItemRow(row.rowId)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 disabled:opacity-30 rounded-lg cursor-pointer transition"
                              title="Hapus baris obat"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Tombol Interaction Checker Otomatis di dalam Form Rx Luar */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200">
                  <div className="space-y-0.5">
                    <span className="font-black text-indigo-950 text-xs flex items-center gap-1.5">
                      <GitCompare className="w-4 h-4 text-indigo-700" />
                      <span>Analisis Interaksi Obat Otomatis (Database interaksi_obat Supabase)</span>
                    </span>
                    <p className="text-[11px] text-indigo-800">
                      Klik tombol <strong>Interaction Checker</strong> untuk mencocokkan daftar obat resep luar dengan tabel <span className="font-mono">interaksi_obat</span> secara real-time.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={extInteractionLoading}
                    onClick={runExternalRxInteractionAnalysis}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black text-xs flex items-center gap-2 cursor-pointer shadow-sm transition shrink-0"
                  >
                    <RefreshCw className={`w-4 h-4 ${extInteractionLoading ? 'animate-spin' : ''}`} />
                    <span>
                      {extInteractionLoading ? 'Memindai interaksi_obat...' : 'Interaction Checker'}
                    </span>
                  </button>
                </div>

                {/* Panel Hasil Analisis Real-time Interaction Checker di dalam Modal Rx Luar */}
                {extInteractionResult && (
                  <div className="space-y-3 pt-2 animate-fade-in">
                    <div
                      className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-2 ${
                        extInteractionResult.highestSeverity === 'contraindicated' ||
                        extInteractionResult.highestSeverity === 'major'
                          ? 'bg-rose-50 border-rose-300 text-rose-950'
                          : extInteractionResult.highestSeverity === 'moderate' ||
                            extInteractionResult.highestSeverity === 'minor'
                          ? 'bg-amber-50 border-amber-300 text-amber-950'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {extInteractionResult.matches.length > 0 ? (
                          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                        ) : (
                          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                        )}
                        <div>
                          <strong className="font-black text-xs uppercase block">
                            {extInteractionResult.matches.length === 0
                              ? 'Aman — Tidak Ditemukan Potensi Interaksi Obat'
                              : `Terdeteksi ${extInteractionResult.matches.length} Potensi Interaksi Obat (Severity Tertinggi: ${extInteractionResult.highestSeverity.toUpperCase()})`}
                          </strong>
                          <span className="text-[11px] opacity-85">
                            {extInteractionResult.totalDrugs} obat ({extInteractionResult.pairsScanned} pasangan) dicocokkan terhadap {extInteractionResult.totalRulesChecked} aturan di tabel <span className="font-mono">interaksi_obat</span> ({extInteractionResult.liveFetchStatus === 'supabase-live' ? 'Live Supabase' : 'Referensi Terpadu'}).
                          </span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-white/80 border border-slate-300 font-mono font-bold text-[10px] text-slate-800">
                        {extInteractionResult.matches.length} Temuan
                      </span>
                    </div>

                    {extInteractionResult.matches.length > 0 && (
                      <div className="space-y-2.5">
                        {extInteractionResult.matches.map((match, idx) => {
                          const meta = SEVERITY_META[match.severity];
                          return (
                            <div
                              key={`${match.ruleId}-${idx}`}
                              className={`p-3.5 rounded-2xl border-2 space-y-2 ${meta.cardClass}`}
                            >
                              <div className="flex flex-wrap justify-between items-center gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-black text-slate-900 text-xs">
                                    {match.rxDrugA} × {match.rxDrugB}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${meta.badgeClass}`}
                                  >
                                    {meta.label}
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-600">
                                  Aturan: {match.obatA} + {match.obatB}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                                  <strong className="text-[10px] uppercase text-slate-500 block">
                                    Mekanisme Interaksi:
                                  </strong>
                                  <p className="text-slate-800 mt-0.5">{match.mekanisme}</p>
                                </div>
                                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                                  <strong className="text-[10px] uppercase text-indigo-700 block">
                                    Rekomendasi Manajemen Klinis:
                                  </strong>
                                  <p className="text-slate-900 font-semibold mt-0.5">
                                    {match.manajemenKlinis}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bagian 4: Pilihan Keputusan Aksi Klinis & Status Resep Luar */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <label className="block font-black text-slate-800 uppercase text-[11px]">
                  4. Keputusan Aksi Klinis &amp; Status Resep Luar <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setExtActionStatus('Diterima (Tidak Ada DRPs)')}
                    className={`p-3 rounded-xl border-2 font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition ${
                      extActionStatus === 'Diterima (Tidak Ada DRPs)'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>[Terima Rx] Diterima (Tidak Ada DRPs)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExtActionStatus('Ditolak (Ada DRPs)')}
                    className={`p-3 rounded-xl border-2 font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition ${
                      extActionStatus === 'Ditolak (Ada DRPs)'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50'
                    }`}
                  >
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>[Tolak Rx] Ditolak (Ada DRPs)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExtActionStatus('Ganti Rx (Konfirmasi ke Dokter)')}
                    className={`p-3 rounded-xl border-2 font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition ${
                      extActionStatus === 'Ganti Rx (Konfirmasi ke Dokter)'
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50'
                    }`}
                  >
                    <RefreshCw className="w-4 h-4 shrink-0" />
                    <span>[Ganti Rx] Ganti (Konfirmasi Dokter)</span>
                  </button>
                </div>
              </div>

              {/* Bagian 5: Catatan Hasil Skrining Apoteker */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <label className="block font-black text-slate-800 uppercase text-[11px]">
                  5. Catatan Skrining &amp; Rekomendasi Klinis Apoteker (Otomatis Terisi dari Interaction Checker)
                </label>
                <textarea
                  rows={3}
                  value={extScreeningNotes}
                  onChange={(e) => setExtScreeningNotes(e.target.value)}
                  placeholder="Hasil analisis Interaction Checker atau catatan skrining apoteker akan tercatat di sini..."
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowExternalRxModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Batal
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={extInteractionLoading}
                  onClick={runExternalRxInteractionAnalysis}
                  className="px-4 py-2 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-300 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>Interaction Checker</span>
                </button>
                <button
                  type="button"
                  disabled={extInteractionLoading}
                  onClick={handleSaveExternalPrescription}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md transition"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Selesai</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: PRATINJAU & CETAK SALINAN RESEP / LABEL ETIKET OBAT            */}
      {/* ===================================================================== */}
      {previewPrintRx && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-[95] p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-slate-300 my-6 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap justify-between items-center gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                {previewPrintMode === 'etiket' ? (
                  <Tag className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Printer className="w-5 h-5 text-sky-400" />
                )}
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wide">
                    {previewPrintMode === 'etiket'
                      ? 'Cetak Label Instruksi Penggunaan Obat (Etiket)'
                      : 'Pratinjau Cetak Salinan Resep & Hasil Skrining Apoteker'}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    No. Resep: <span className="font-mono font-bold text-white">{previewPrintRx.id}</span> · Pasien: {previewPrintRx.patientName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setPreviewPrintMode('salinan')}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      previewPrintMode === 'salinan'
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Salinan &amp; Skrining
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPrintMode('etiket')}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                      previewPrintMode === 'etiket'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Tag className="w-3 h-3" />
                    <span>Label Obat (Etiket)</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewPrintRx(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
              {(() => {
                const matchedPatient = patients.find(
                  (pt) =>
                    pt.id === previewPrintRx.rmId ||
                    pt.name.toLowerCase() === previewPrintRx.patientName.toLowerCase()
                );
                const extMeta = previewPrintRx.screeningChecks?.externalMeta;
                const isExtRx = Boolean(
                  previewPrintRx.isExternalRx ||
                    extMeta?.isExternalRx ||
                    previewPrintRx.id.startsWith('RXL-')
                );
                const resolvedOrigin =
                  previewPrintRx.originFacility || extMeta?.originFacility || '';
                const resolvedAge =
                  previewPrintRx.patientAge !== undefined && previewPrintRx.patientAge !== ''
                    ? String(previewPrintRx.patientAge)
                    : extMeta?.patientAge !== undefined && extMeta?.patientAge !== ''
                    ? String(extMeta.patientAge)
                    : matchedPatient?.age !== undefined
                    ? String(matchedPatient.age)
                    : '-';
                const resolvedAddress =
                  previewPrintRx.patientAddress ||
                  extMeta?.patientAddress ||
                  matchedPatient?.address ||
                  '-';

                if (previewPrintMode === 'etiket') {
                  return (
                    <MedicationLabelConfigurator
                      labels={etiketLabels}
                      onChangeLabels={setEtiketLabels}
                      layout={etiketLayout}
                      onChangeLayout={setEtiketLayout}
                      rxId={previewPrintRx.id}
                      rmId={previewPrintRx.rmId}
                      patientName={previewPrintRx.patientName}
                      patientAge={resolvedAge === '-' ? undefined : resolvedAge}
                      date={
                        (previewPrintRx.timestamp || '').split(',')[0].trim() ||
                        new Date().toLocaleDateString('id-ID')
                      }
                      pharmacyName={pharmacyProfile.name}
                      pharmacyAddress={pharmacyFullAddress}
                      pharmacyPhone={pharmacyProfile.phone}
                      pharmacySia={pharmacyProfile.sia}
                      apjName={apjProfile.name}
                      apjSipa={apjProfile.sipa}
                    />
                  );
                }

                const checks = previewPrintRx.screeningChecks || {
                  admin: { namaDokter: true, sip: true, tglResep: true, paraf: true },
                  farmasetik: {
                    bentukSediaan: true,
                    dosis: true,
                    stabilitas: true,
                    kompatibilitas: true
                  },
                  klinis: {
                    tepatDosis: true,
                    tepatWaktu: true,
                    kontraIndikasi: true,
                    interaksi: true,
                    duplikasi: true
                  }
                };

                return (
                  <div className="bg-white p-6 rounded-2xl border border-slate-300 shadow-xs space-y-4 text-xs text-slate-800">
                    {/* Kop Apotek */}
                    <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start gap-4">
                      <div>
                        <h4 className="font-black text-base text-slate-900 uppercase">
                          {pharmacyProfile.name}
                        </h4>
                        <p className="text-[11px] text-slate-600">
                          {pharmacyFullAddress} · Telp: {pharmacyProfile.phone}
                        </p>
                        <p className="text-[10px] font-mono text-slate-600">
                          {[
                            pharmacyProfile.sia ? `SIA: ${pharmacyProfile.sia}` : '',
                            pharmacyProfile.nib ? `NIB: ${pharmacyProfile.nib}` : '',
                            pharmacyProfile.npwp ? `NPWP: ${pharmacyProfile.npwp}` : '',
                            `APJ: ${apjProfile.name} (SIPA: ${apjProfile.sipa})`
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border ${
                          isExtRx
                            ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                            : 'bg-sky-50 text-sky-900 border-sky-200'
                        }`}
                      >
                        {isExtRx ? 'Resep Dokter Luar (Rx Luar)' : 'Salinan & Skrining Resep'}
                      </span>
                    </div>

                    <div className="text-center">
                      <strong className="text-sm font-black uppercase tracking-wider underline text-slate-900">
                        SALINAN RESEP (APOGRAPH) &amp; HASIL SKRINING APOTEKER
                      </strong>
                    </div>

                    {/* Info Dokter & Pasien */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-[11px]">
                      <div className="space-y-1">
                        <div>
                          <span className="text-slate-500 font-semibold">No. Resep: </span>
                          <strong className="font-mono text-slate-900">{previewPrintRx.id}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold">Tanggal: </span>
                          <span className="font-mono">{previewPrintRx.timestamp}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold">Dokter Peresep: </span>
                          <strong className="text-slate-900">{previewPrintRx.doctorName}</strong>
                        </div>
                        {resolvedOrigin && (
                          <div>
                            <span className="text-slate-500 font-semibold">Instansi / RS Asal: </span>
                            <span className="font-semibold text-indigo-900">{resolvedOrigin}</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div>
                          <span className="text-slate-500 font-semibold">Nama Pasien: </span>
                          <strong className="text-slate-900">{previewPrintRx.patientName}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold">Umur / No. RM: </span>
                          <span>
                            {resolvedAge} Th ({previewPrintRx.rmId})
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold">Alamat Pasien: </span>
                          <span>{resolvedAddress}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold">Status: </span>
                          <strong className="text-emerald-700">{previewPrintRx.status}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Daftar Obat R/ */}
                    <div className="border-2 border-slate-800 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                        <span className="font-serif italic font-black text-base text-slate-900">
                          R /
                        </span>
                        <button
                          type="button"
                          onClick={() => setPreviewPrintMode('etiket')}
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Tag className="w-3 h-3" />
                          <span>Buat &amp; Cetak Etiket Kemasan →</span>
                        </button>
                      </div>
                      <div className="divide-y divide-dashed divide-slate-200">
                        {previewPrintRx.items.map((it, idx) => (
                          <div key={idx} className="py-2 flex justify-between items-start gap-3">
                            <div>
                              <div className="font-black text-slate-900 text-xs">
                                R/ {it.name}{' '}
                                <span className="font-mono font-bold text-slate-700">
                                  No. {it.qty} ({it.unit})
                                </span>
                              </div>
                              <div className="pl-4 text-[11px] text-slate-700 italic font-medium">
                                ∫ {it.dosage || 'Sesuai aturan pakai'}
                              </div>
                            </div>
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-300">
                              det / orig
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ringkasan Ceklis & Catatan Skrining */}
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                        <strong className="block text-slate-700 uppercase mb-1">1. Administratif</strong>
                        <div>[{checks.admin?.namaDokter ? '✓' : '×'}] Nama &amp; SIP Dokter</div>
                        <div>[{checks.admin?.tglResep ? '✓' : '×'}] Tanggal &amp; Paraf</div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                        <strong className="block text-slate-700 uppercase mb-1">2. Farmasetik</strong>
                        <div>[{checks.farmasetik?.bentukSediaan ? '✓' : '×'}] Sediaan &amp; Dosis</div>
                        <div>[{checks.farmasetik?.stabilitas ? '✓' : '×'}] Stabilitas</div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                        <strong className="block text-slate-700 uppercase mb-1">3. Klinis &amp; Interaksi</strong>
                        <div>[{checks.klinis?.tepatDosis ? '✓' : '×'}] Tepat Dosis &amp; Waktu</div>
                        <div>[{checks.klinis?.interaksi ? '✓' : '!'}] Interaksi Obat</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                      <strong className="text-[10px] uppercase text-slate-600 block">
                        Catatan Skrining &amp; Hasil Interaction Checker:
                      </strong>
                      <p className="text-[11px] text-slate-800 whitespace-pre-line">
                        {previewPrintRx.screeningNotes ||
                          'Memenuhi standar administratif, farmasetik & klinis.'}
                      </p>
                      <span className="block text-[10px] font-mono text-slate-500 pt-1">
                        Diverifikasi oleh: {previewPrintRx.screenedBy || apjProfile.name} (SIPA: {apjProfile.sipa})
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewPrintRx(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Tutup
              </button>
              <div className="flex flex-wrap items-center gap-2">
                {previewPrintMode === 'salinan' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setPreviewPrintMode('etiket')}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Tag className="w-4 h-4" />
                      <span>Cetak Label Obat (Etiket)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerPrintPrescriptionHistory(previewPrintRx)}
                      className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-black rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Cetak Lembar Salinan &amp; Skrining</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={etiketLabels.filter((l) => l.selected).length === 0}
                    onClick={() =>
                      handleTriggerPrintMedicationLabels(previewPrintRx, etiketLabels, etiketLayout)
                    }
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md"
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
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
