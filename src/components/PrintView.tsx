import React, { useEffect, useState } from 'react';
import { Printer, X, CheckCircle, FileText } from 'lucide-react';
import { INITIAL_MEDICINES, INITIAL_STOCK_MUTATIONS, INITIAL_TRANSACTIONS, INITIAL_RME_RECORDS, INITIAL_PATIENTS, INITIAL_STAFF } from '../data/initialData';
import { Medicine, PurchaseInvoice, StockMutation, StockOpnameRecord, Transaction, RMERecord, Patient, Staff, DutySchedule, StaffFeeItem } from '../types';
import {
  getSavedPharmacyProfile,
  getSavedAPJProfile,
  getSavedDPJProfile,
  useFacilityProfiles,
  formatPharmacyAddress,
  formatPharmacyLegalInfo
} from '../utils/facilityProfileHelper';
import { demoGetItem, demoSetItem, isDemoMode } from '../utils/demoSandbox';
import {
  isJasaCartItem,
  summarizeTransactionForDocument,
  getDefaultKwitansiKeterangan
} from '../utils/transactionPrintHelper';
import {
  loadLocalFeeLedger,
  normalizeTransactionDateToYMD,
  resolveTransactionStaffFees
} from '../utils/serviceFeeHelper';
import { getDeletedIdsSet } from '../utils/deletionRegistry';
import { loadLocalAttendanceRecords, formatMinutesDuration } from '../utils/attendanceService';
import { buildStaffPayrollSummary, loadLocalPayrollConfig } from '../utils/payrollService';
import {
  resolveMutationBatchDetails,
  getTransactionTypeShortLabel
} from '../utils/stockCardBatchHelper';
import {
  MEDICATION_LABEL_PRINT_KEY,
  MedicationLabelLayout,
  MedicationLabelPrintPayload,
  isRacikanPrescriptionItem,
  loadMedicationLabelPrintPayload,
  normalizeMedicationLabelLayout
} from '../utils/medicationLabelHelper';
import { formatDateDDMMYYYY } from '../utils/racikanBudHelper';
import { hasLocalServerBackend, safeBackendFetch } from '../utils/serverBridgeHelper';

interface PrintViewProps {
  mode: string;
  searchParams: URLSearchParams;
}

export const PrintView: React.FC<PrintViewProps> = ({ mode, searchParams }) => {
  // Sync payload from URL parameter into new tab's localStorage if present
  try {
    const rawPayload = searchParams.get('_payload');
    if (rawPayload) {
      const payloadKeyMap: Record<string, string> = {
        rme: 'latisha_active_print_rme',
        'copy-resep': 'latisha_active_print_rme',
        'surat-sakit': 'latisha_active_print_rme',
        'laporan-morbiditas': 'latisha_active_print_morbiditas',
        'hasil-lab': 'latisha_active_print_lab',
        'faktur-penjualan': 'latisha_active_print_trx',
        'kwitansi-penjualan': 'latisha_active_print_trx',
        'struk-pos': 'latisha_active_print_receipt',
        'kartu-pasien': 'latisha_active_print_patient',
        'nota-retur': 'latisha_active_print_retur',
        'retur-pembelian': 'latisha_active_print_retur',
        'telaah-drp': 'latisha_active_print_drp',
        'skrining-resep': 'latisha_active_print_skrining',
        'etiket-obat': MEDICATION_LABEL_PRINT_KEY
      };
      const storageKey = payloadKeyMap[mode];
      if (storageKey) {
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(storageKey, rawPayload);
          }
        } catch {}
        demoSetItem(storageKey, rawPayload);
      }
    }
  } catch {}

  const {
    pharmacyProfile: reactivePharm,
    apjProfile: reactiveApj,
    dpjProfile: reactiveDpj
  } = useFacilityProfiles();

  const [serverSyncedPharm, setServerSyncedPharm] = useState(() => getSavedPharmacyProfile());
  const [serverSyncedApj, setServerSyncedApj] = useState(() => getSavedAPJProfile());
  const [serverSyncedDpj, setServerSyncedDpj] = useState(() => getSavedDPJProfile());
  const [activeInvoicePrintType, setActiveInvoicePrintType] = useState<'faktur' | 'kwitansi'>(
    mode === 'kwitansi-penjualan' ? 'kwitansi' : 'faktur'
  );
  const [printKwitansiKeterangan, setPrintKwitansiKeterangan] = useState<string | null>(null);
  const [etiketLayoutOverride, setEtiketLayoutOverride] = useState<MedicationLabelLayout | null>(
    null
  );

  const safePrint = () => {
    if (typeof window !== 'undefined' && window.self === window.top) {
      try {
        window.focus();
        window.print();
      } catch (err) {
        console.warn('Print error:', err);
      }
    }
  };

  const [remotePayloadFetched, setRemotePayloadFetched] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const payloadKeyMap: Record<string, string> = {
      rme: 'latisha_active_print_rme',
      'copy-resep': 'latisha_active_print_rme',
      'surat-sakit': 'latisha_active_print_rme',
      'laporan-morbiditas': 'latisha_active_print_morbiditas',
      'hasil-lab': 'latisha_active_print_lab',
      'faktur-penjualan': 'latisha_active_print_trx',
      'kwitansi-penjualan': 'latisha_active_print_trx',
      'struk-pos': 'latisha_active_print_receipt',
      'kartu-pasien': 'latisha_active_print_patient',
      'nota-retur': 'latisha_active_print_retur',
      'retur-pembelian': 'latisha_active_print_retur',
      'telaah-drp': 'latisha_active_print_drp',
      'skrining-resep': 'latisha_active_print_skrining',
      'etiket-obat': MEDICATION_LABEL_PRINT_KEY
    };
    const storageKey = payloadKeyMap[mode];
    const demoActive = isDemoMode();
    const backendAvailable = hasLocalServerBackend();
    const hasInlineUrlPayload = Boolean(searchParams.get('_payload'));
    const fetchRemotePayload = (): Promise<any> =>
      safeBackendFetch(`/api/print-payload/${storageKey}`)
        .then((r) => (r && r.ok ? r.json() : null))
        .catch(() => null);

    const remotePayloadPromise =
      storageKey && !demoActive && backendAvailable && !hasInlineUrlPayload
        ? fetchRemotePayload()
            .then((data) => {
              if (data?.payload || cancelled) return data;
              return new Promise((resolve) => setTimeout(resolve, 250)).then(() =>
                cancelled ? null : fetchRemotePayload()
              );
            })
            .then((data) => {
              if (data?.payload && !cancelled) {
                const rawStr =
                  typeof data.payload === 'string'
                    ? data.payload
                    : JSON.stringify(data.payload);
                try {
                  if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem(storageKey, rawStr);
                  }
                } catch {}
                try {
                  demoSetItem(storageKey, rawStr);
                } catch {}
                setRemotePayloadFetched(true);
              }
            })
            .catch(() => {})
        : Promise.resolve();

    let hasTriggeredPrint = false;

    const triggerPrintWhenImagesReady = () => {
      if (cancelled || hasTriggeredPrint) return;

      const doPrint = () => {
        if (cancelled || hasTriggeredPrint) return;
        hasTriggeredPrint = true;

        const executePrint = () => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (!cancelled) {
                safePrint();
              }
            }, 200);
          });
        };

        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(executePrint).catch(executePrint);
        } else {
          executePrint();
        }
      };

      const images = Array.from(document.querySelectorAll('#printable-section img')) as HTMLImageElement[];
      const pending = images.filter((img) => !img.complete);

      if (pending.length === 0) {
        doPrint();
      } else {
        let resolvedCount = 0;
        const onDone = () => {
          resolvedCount += 1;
          if (resolvedCount >= pending.length) {
            doPrint();
          }
        };
        pending.forEach((img) => {
          img.addEventListener('load', onDone, { once: true });
          img.addEventListener('error', onDone, { once: true });
        });
        // Fallback timeout in case image loading stalls
        setTimeout(() => {
          if (!hasTriggeredPrint) doPrint();
        }, 1500);
      }
    };

    if (demoActive || !backendAvailable) {
      setTimeout(triggerPrintWhenImagesReady, 200);
    } else {
      const facilityPromise = safeBackendFetch('/api/facility-profile')
        .then((r) => (r && r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          if (data?.pharmacy) {
            const currentLocal = getSavedPharmacyProfile();
            const mergedPharm = {
              ...currentLocal,
              ...data.pharmacy,
              logoUrl: data.pharmacy.logoUrl || currentLocal.logoUrl || ''
            };
            if (mergedPharm.logoUrl) {
              try {
                demoSetItem('latisha_facility_logo', mergedPharm.logoUrl);
              } catch {}
            }
            try {
              demoSetItem('latisha_pharmacy_profile', JSON.stringify(mergedPharm));
            } catch {}
            setServerSyncedPharm(mergedPharm);
          }
          if (data?.apj) {
            const mergedApj = { ...getSavedAPJProfile(), ...data.apj };
            try {
              demoSetItem('latisha_apj_profile', JSON.stringify(mergedApj));
            } catch {}
            setServerSyncedApj(mergedApj);
          }
          if (data?.dpj) {
            const mergedDpj = { ...getSavedDPJProfile(), ...data.dpj };
            try {
              demoSetItem('latisha_dpj_profile', JSON.stringify(mergedDpj));
            } catch {}
            setServerSyncedDpj(mergedDpj);
          }
          if (data?.pharmacy || data?.apj || data?.dpj) {
            window.dispatchEvent(new Event('latisha_profile_updated'));
          }
        })
        .catch(() => {});

      Promise.all([remotePayloadPromise, facilityPromise]).then(() => {
        if (!cancelled) {
          setTimeout(triggerPrintWhenImagesReady, 180);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const pharmacyProfile = {
    ...serverSyncedPharm,
    ...reactivePharm,
    logoUrl: reactivePharm.logoUrl || serverSyncedPharm.logoUrl || ''
  };
  const pharmacyFullAddress = formatPharmacyAddress(pharmacyProfile);
  const apjProfile = { ...serverSyncedApj, ...reactiveApj };
  const dpjProfile = { ...serverSyncedDpj, ...reactiveDpj };

  // Shared Floating Top Action Bar
  const renderFloatingTopBar = (title: string) => (
    <div className="no-print bg-slate-900 text-white p-3.5 rounded-2xl mb-6 flex justify-between items-center shadow-lg">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-bold text-xs">
          {title} · Pratinjau Cetak Mandiri Bebas Hambatan Sandbox
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={safePrint}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer text-xs shadow-sm transition"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Sekarang (Ctrl+P)</span>
        </button>
        <button
          onClick={() => window.close()}
          className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-bold flex items-center gap-1 cursor-pointer text-xs transition"
        >
          <X className="w-4 h-4" />
          <span>Tutup Jendela</span>
        </button>
      </div>
    </div>
  );

  // Print style sheet
  const printStyles = (
    <style>{`
      @media print {
        .no-print { display: none !important; }
        html, body { background: #ffffff !important; color: #000000 !important; padding: 0 !important; margin: 0 !important; overflow: visible !important; }
        #printable-section { display: block !important; visibility: visible !important; border: none !important; box-shadow: none !important; padding: 0 !important; width: 100% !important; }
        #printable-section * { visibility: visible !important; color: #000000 !important; }
        #printable-section img { display: block !important; visibility: visible !important; opacity: 1 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `}</style>
  );

  // Helper Terbilang
  const getTerbilang = (amount: number) => {
    const rounded = Math.round(Math.abs(amount));
    if (rounded === 0) return 'Nol Rupiah';
    const bil = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    function convert(x: number): string {
      if (x < 12) return bil[x];
      if (x < 20) return convert(x - 10) + ' Belas';
      if (x < 100) return convert(Math.floor(x / 10)) + ' Puluh ' + convert(x % 10);
      if (x < 200) return 'Seratus ' + convert(x - 100);
      if (x < 1000) return convert(Math.floor(x / 100)) + ' Ratus ' + convert(x % 100);
      if (x < 2000) return 'Seribu ' + convert(x - 1000);
      if (x < 1000000) return convert(Math.floor(x / 1000)) + ' Ribu ' + convert(x % 1000);
      if (x < 1000000000) return convert(Math.floor(x / 1000000)) + ' Juta ' + convert(x % 1000000);
      return convert(Math.floor(x / 1000000000)) + ' Milyar ' + convert(x % 1000000000);
    }
    return convert(rounded).trim().replace(/\s+/g, ' ') + ' Rupiah';
  };

  // 1. SURAT PESANAN (SP / DEFECTA / RE-ORDER RESMI BPOM)
  if (mode === 'surat-pesanan') {
    const supplierParam = searchParams.get('supplier') || 'SEMUA';
    const typeParam = (searchParams.get('spType') || 'REG') as string;
    const poIdParam = searchParams.get('poId') || '';
    const dataParam = searchParams.get('data');

    let defectaItems: any[] = [];
    let spData: any = null;

    // 1. First priority: decode directly from URL query param (100% resilient across iframe sandboxes and tabs)
    if (dataParam) {
      try {
        const decoded = decodeURIComponent(dataParam);
        spData = JSON.parse(decoded);
        if (spData?.items && Array.isArray(spData.items) && spData.items.length > 0) {
          defectaItems = spData.items;
        }
      } catch (err) {
        console.warn('URL data param decode error:', err);
      }
    }

    // 2. Second priority: lookup purchase order from localStorage by poId
    if (defectaItems.length === 0 && poIdParam) {
      try {
        const savedPOs = demoGetItem('latisha_purchase_orders');
        if (savedPOs) {
          const pos = JSON.parse(savedPOs);
          const foundPo = pos.find((p: any) => p.id === poIdParam || p.poNumber === poIdParam);
          if (foundPo && foundPo.items && foundPo.items.length > 0) {
            const currentSpType = typeParam || 'SEMUA';
            const matchedItems =
              currentSpType === 'SEMUA' || currentSpType === 'ALL'
                ? foundPo.items
                : foundPo.items.filter((it: any) => it.spType === currentSpType);

            const itemsToUse = matchedItems.length > 0 ? matchedItems : foundPo.items;

            spData = {
              spNumber: foundPo.spNumbers?.[currentSpType] || foundPo.poNumber,
              spType: currentSpType,
              supplierName: foundPo.supplierName,
              supplierAddress: foundPo.supplierAddress,
              supplierPhone: foundPo.supplierPhone,
              orderDate: foundPo.date,
              notes: foundPo.notes,
              items: itemsToUse
            };
            defectaItems = itemsToUse;
          }
        }
      } catch (err) {
        console.warn('PO lookup error:', err);
      }
    }

    // 3. Third priority: localStorage latisha_active_print_sp
    if (defectaItems.length === 0) {
      try {
        const savedSp = demoGetItem('latisha_active_print_sp');
        if (savedSp) {
          const parsed = JSON.parse(savedSp);
          if (parsed?.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
            spData = parsed;
            defectaItems = parsed.items;
          }
        }
      } catch (e) {
        console.warn('Storage read error:', e);
      }
    }

    // 4. Fourth priority: Fallback to active medicines defecta list
    if (defectaItems.length === 0) {
      let medicines: Medicine[] = INITIAL_MEDICINES;
      try {
        const savedMed = demoGetItem('latisha_medicines');
        if (savedMed) medicines = JSON.parse(savedMed);
      } catch (e) {}
      defectaItems = medicines.filter((m) => m.stock <= m.minStock);
      if (supplierParam !== 'SEMUA') {
        defectaItems = defectaItems.filter((m) => (m.supplier || 'PBF Umum') === supplierParam);
      }
    }

    const rawType = spData?.spType || typeParam || 'REG';
    const spType = (rawType === 'ALL' || rawType === 'SEMUA' ? 'ALL' : rawType) as
      | 'REG'
      | 'ALK'
      | 'PRE'
      | 'OOT'
      | 'PSI'
      | 'NAR'
      | 'ALL';

    const currentSupplier =
      spData?.supplierName ||
      spData?.supplier ||
      (supplierParam === 'SEMUA'
        ? 'PT Kimia Farma Trading & Distribution / PBF Rekanan'
        : supplierParam);
    const supplierAddress =
      spData?.supplierAddress || 'Distributor Resmi Farmasi & Alat Kesehatan Indonesia';
    const todayStr = spData?.orderDate
      ? new Date(spData.orderDate).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      : new Date().toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

    // Format No Surat Pesanan ALF/{jenis SP}/{BLN}/{THN}/{No. Urut}
    const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const currentMonthRoman = romanMonths[new Date().getMonth()];
    const currentYear = new Date().getFullYear();
    const defaultSpNumber = `ALF/${spType === 'ALL' ? 'REG' : spType}/${currentMonthRoman}/${currentYear}/001`;
    const spNumber = spData?.spNumber || defaultSpNumber;

    // SP Titles based on BPOM / Kemenkes
    const spMeta: Record<string, { title: string; badge: string; notes: string }> = {
      ALL: {
        title: 'SURAT PESANAN PEMBELIAN OBAT & ALKES',
        badge: 'SURAT PESANAN LENGKAP',
        notes: 'Seluruh daftar pesanan sediaan farmasi dan perbekalan kesehatan apotek.'
      },
      REG: {
        title: 'SURAT PESANAN OBAT JADI (REGULER)',
        badge: 'SURAT PESANAN OBAT REGULER',
        notes: 'Obat yang dipesan adalah obat bebas, bebas terbatas, dan obat keras non-NAPPZA.'
      },
      ALK: {
        title: 'SURAT PESANAN ALAT KESEHATAN & BMHP',
        badge: 'SURAT PESANAN ALAT KESEHATAN',
        notes: 'Barang yang dipesan adalah Alat Kesehatan dan Bahan Medis Habis Pakai berizin edar resmi Kemenkes.'
      },
      PRE: {
        title: 'SURAT PESANAN OBAT MENGANDUNG PREKURSOR FARMASI',
        badge: 'SURAT PESANAN PREKURSOR FARMASI',
        notes: 'Surat Pesanan ini terpisah dan tidak dicampur dengan pesanan obat non-prekursor sesuai regulasi BPOM RI.'
      },
      OOT: {
        title: 'SURAT PESANAN OBAT-OBAT TERTENTU (OOT)',
        badge: 'SURAT PESANAN OBAT-OBAT TERTENTU (BPOM)',
        notes: 'Meliputi Tramadol, Trihexyphenidyl, Chlorpromazine, Amitriptyline, Haloperidol, dan Dextromethorphan.'
      },
      PSI: {
        title: 'SURAT PESANAN PSIKOTROPIKA',
        badge: 'SURAT PESANAN PSIKOTROPIKA',
        notes: 'Surat Pesanan Psikotropika hanya dapat digunakan untuk 1 (satu) PBF dan tidak boleh digabung dengan pesanan obat lain.'
      },
      NAR: {
        title: 'SURAT PESANAN NARKOTIKA',
        badge: 'SURAT PESANAN NARKOTIKA',
        notes: 'Surat Pesanan Narkotika hanya ditujukan kepada PT. Kimia Farma Trading & Distribution sebagai PBF resmi penyalur narkotika.'
      }
    };

    const currentMeta = spMeta[spType] || spMeta.REG;

    const isRegOrAlk = spType === 'REG' || spType === 'ALK';

    return (
      <div className="bg-white min-h-screen text-slate-800 p-6 max-w-4xl mx-auto font-sans text-xs">
        {printStyles}
        {renderFloatingTopBar(`${currentMeta.title} (${spType})`)}

        <div
          id="printable-section"
          className="space-y-4 border-2 border-slate-900 p-8 rounded-2xl bg-white shadow-xs text-xs leading-relaxed"
        >
          {/* KOP APOTEK RESMI */}
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
              <div className="flex-1 text-center">
                <h2 className="font-black text-xl text-slate-900 uppercase tracking-wide">
                  {pharmacyProfile.name}
                </h2>
                <p className="text-[11px] text-slate-800 font-medium">
                  {pharmacyFullAddress}
                </p>
                <p className="text-[10px] text-slate-600">
                  Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                </p>
                <div className="flex flex-wrap justify-center gap-x-4 text-[10px] text-slate-700 font-mono mt-1 border-t border-slate-300 pt-1">
                  {pharmacyProfile.sia && <span>SIA: <strong>{pharmacyProfile.sia}</strong></span>}
                  {pharmacyProfile.nib && <span>NIB: <strong>{pharmacyProfile.nib}</strong></span>}
                  {pharmacyProfile.npwp && <span>NPWP: <strong>{pharmacyProfile.npwp}</strong></span>}
                </div>
              </div>
              {pharmacyProfile.logoUrl ? <div className="w-16 shrink-0" /> : <div className="w-16 shrink-0" />}
            </div>

            <div className="text-center">
              <div className="mt-3 inline-block px-5 py-1 bg-slate-900 text-white rounded-md font-black text-xs uppercase tracking-wider">
                {currentMeta.title}
              </div>
            </div>
          </div>

          {/* Nomor SP & Tujuan PBF */}
          <div className="grid grid-cols-2 gap-4 py-2 border-b border-slate-300 text-xs">
            <div>
              <p className="text-slate-600 font-bold">NOMOR SURAT PESANAN:</p>
              <p className="font-mono font-black text-slate-900 text-sm mt-0.5 tracking-wide">
                {spNumber}
              </p>
              <p className="text-slate-600 mt-2 font-bold">TANGGAL PEMESANAN:</p>
              <p className="font-bold text-slate-800">{todayStr}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                KEPADA YTH. PIMPINAN PBF / DISTRIBUTOR:
              </p>
              <p className="font-black text-slate-900 text-sm mt-0.5">
                {currentSupplier}
              </p>
              <p className="text-slate-600 text-[11px] mt-0.5">{supplierAddress}</p>
              <p className="text-slate-500 text-[10px]">Di Tempat</p>
            </div>
          </div>

          <div className="text-slate-800 leading-normal">
            <p className="font-medium">
              Yang bertanda tangan di bawah ini Apoteker Penanggung Jawab (APJ) <strong>{pharmacyProfile.name}</strong> ({apjProfile.name} · SIPA: {apjProfile.sipa}), dengan ini mengajukan pesanan sediaan farmasi dengan rincian sebagai berikut:
            </p>
          </div>

          {/* Tabel Pesanan Resmi BPOM */}
          <table className="w-full text-left text-xs border border-collapse border-slate-400">
            <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-900 border-b border-slate-400">
              {isRegOrAlk ? (
                <tr>
                  <th className="p-2 border border-slate-400 text-center w-8">No</th>
                  <th className="p-2 border border-slate-400">Nama Obat / Barang</th>
                  <th className="p-2 border border-slate-400 text-center w-44">Bentuk &amp; Kemasan</th>
                  <th className="p-2 border border-slate-400 text-center w-28 bg-slate-200">
                    Jumlah Pesanan
                  </th>
                  <th className="p-2 border border-slate-400">Ket</th>
                </tr>
              ) : (
                <tr>
                  <th className="p-2 border border-slate-400 text-center w-8">No</th>
                  <th className="p-2 border border-slate-400">Nama Obat / Barang</th>
                  <th className="p-2 border border-slate-400 text-center w-36">Zat Aktif, Kekuatan &amp; Bentuk</th>
                  <th className="p-2 border border-slate-400 text-center w-36">Kemasan</th>
                  <th className="p-2 border border-slate-400 text-center w-28 bg-slate-200">
                    Jumlah Pesanan
                  </th>
                  <th className="p-2 border border-slate-400">Jumlah Dalam Huruf (Terbilang)</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-300 font-medium text-slate-900">
              {defectaItems.length === 0 ? (
                <tr>
                  <td colSpan={isRegOrAlk ? 5 : 6} className="p-8 text-center text-slate-400 italic">
                    Tidak ada obat dalam daftar surat pesanan ini.
                  </td>
                </tr>
              ) : (
                defectaItems.map((item, idx) => {
                  const qty = item.qtyBesar || item.qtyOrder || Math.max(1, (item.minStock * 2) - item.stock);
                  const satuan = item.satuanBesar || item.unit || 'Box';
                  const kemasanLabel = `${item.satuanBesar || 'Box'}${
                    item.rasioKonversi > 1 ? ` @ ${item.rasioKonversi} ${item.satuanKecil || item.unit}` : ''
                  }`;
                  const shapeLabel =
                    spType === 'ALK' && (!item.form || item.form === '-' || item.form === 'Tablet')
                      ? ''
                      : item.form && item.form !== '-'
                      ? item.form
                      : 'Tablet';
                  const bentukKemasanLabel = shapeLabel ? `${shapeLabel} · ${kemasanLabel}` : kemasanLabel;
                  const terbilangText = getTerbilang(qty).replace('Rupiah', satuan);

                  if (isRegOrAlk) {
                    return (
                      <tr key={item.id || idx} className="border-b border-slate-300">
                        <td className="p-2 border border-slate-400 text-center font-mono">{idx + 1}</td>
                        <td className="p-2 border border-slate-400 font-bold text-slate-900">
                          {item.name}
                        </td>
                        <td className="p-2 border border-slate-400 text-center text-[11px]">
                          {bentukKemasanLabel}
                        </td>
                        <td className="p-2 border border-slate-400 text-center font-mono font-black text-slate-900 bg-slate-100 text-xs">
                          {qty} {satuan}
                        </td>
                        <td className="p-2 border border-slate-400 italic text-[11px] text-slate-800">
                          {item.ket || terbilangText}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={item.id || idx} className="border-b border-slate-300">
                      <td className="p-2 border border-slate-400 text-center font-mono">{idx + 1}</td>
                      <td className="p-2 border border-slate-400 font-bold text-slate-900">
                        {item.name}
                        {item.nappza && item.nappza !== 'Non-NAPPZA' && (
                          <span className="ml-1 text-[9px] font-mono px-1 bg-slate-200 rounded">
                            {item.nappza}
                          </span>
                        )}
                      </td>
                      <td className="p-2 border border-slate-400 text-center font-mono text-[11px]">
                        {item.kekuatan || '-'} · {item.form || 'Tablet'}
                      </td>
                      <td className="p-2 border border-slate-400 text-center text-[11px]">
                        {kemasanLabel}
                      </td>
                      <td className="p-2 border border-slate-400 text-center font-mono font-black text-slate-900 bg-slate-100 text-xs">
                        {qty} {satuan}
                      </td>
                      <td className="p-2 border border-slate-400 italic text-[11px] text-slate-800">
                        {terbilangText}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Keterangan & Catatan */}
          <div className="p-3 bg-slate-50 border border-slate-300 rounded-xl space-y-1.5 text-[10px] text-slate-700">
            <p>
              <strong className="text-slate-900">Keterangan :</strong> Obat-obatan / sediaan farmasi tersebut di atas akan dipergunakan untuk memenuhi kebutuhan pelayanan kefarmasian resmi di sarana <strong>{pharmacyProfile.name || 'LATISHA FARMA'}</strong> (SIA: {pharmacyProfile.sia || '23082300357340002'}) sesuai ketentuan perundang-undangan.
            </p>
            <p className="font-semibold text-slate-900">
              <strong>Catatan :</strong> "Jangan memberikan produk obat/alkes yang tanggal kedaluwarsa (Expired Date) &lt; 2 (dua) tahun pada saat penyerahan barang."
            </p>
          </div>

          {/* Tanda Tangan APJ Resmi & Pemesan */}
          <div className="grid grid-cols-2 pt-6 text-xs">
            <div className="space-y-1 text-slate-600">
              <p className="font-bold text-slate-900">Alamat Pengiriman Obat:</p>
              <p className="font-bold text-slate-800">{pharmacyProfile.name}</p>
              <p>{pharmacyFullAddress}</p>
              <p>CP: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}</p>
            </div>

            <div className="text-center space-y-14">
              <p className="font-bold text-slate-800">
                {pharmacyProfile.city}, {todayStr}<br />
                Apoteker Pengelola Apotek (APJ),
              </p>
              <div>
                <p className="font-black underline text-slate-900 text-sm">{apjProfile.name}</p>
                <p className="text-[10px] text-slate-700 font-mono">SIPA: {apjProfile.sipa}</p>
                <p className="text-[10px] text-slate-600 font-mono">STRA: {apjProfile.stra}</p>
                <p className="text-[9px] text-slate-500 italic mt-0.5">(Tanda Tangan Asli & Stempel Basah)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. STRUK KASIR POS (THERMAL RECEIPT 58MM / 80MM STYLE)
  if (mode === 'struk-pos') {
    const trxId = searchParams.get('trxId') || '';
    let selectedTrx: Transaction | null = null;

    try {
      const savedReceipt = demoGetItem('latisha_active_print_receipt');
      if (savedReceipt) {
        const parsed = JSON.parse(savedReceipt);
        if (!trxId || parsed.id === trxId) {
          selectedTrx = parsed;
        }
      }
      if (!selectedTrx) {
        const savedList = demoGetItem('latisha_transactions');
        if (savedList) {
          const list: Transaction[] = JSON.parse(savedList);
          selectedTrx = list.find((t) => t.id === trxId) || list[0] || null;
        }
      }
    } catch (e) {}

    if (!selectedTrx) {
      return (
        <div className="bg-slate-100 min-h-screen text-slate-900 p-8 font-sans flex flex-col items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 text-center max-w-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Data Transaksi Tidak Ditemukan</h2>
            <p className="text-xs text-slate-500 mb-4">Tidak ada data transaksi yang dapat dicetak saat ini.</p>
            <button onClick={() => window.close()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">
              Tutup Halaman
            </button>
          </div>
        </div>
      );
    }

    const docSummary = summarizeTransactionForDocument(selectedTrx);

    return (
      <div className="bg-slate-100 min-h-screen text-slate-900 p-4 font-mono text-xs flex flex-col items-center">
        {printStyles}
        <div className="w-full max-w-sm mb-4">
          {renderFloatingTopBar('Struk Pembayaran Kasir')}
        </div>

        {/* Thermal Receipt Paper Card (80mm width standard) */}
        <div
          id="printable-section"
          className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 w-full max-w-sm text-xs space-y-3 leading-relaxed"
        >
          {/* Header Struk Terintegrasi Profil Apotek & APJ */}
          <div className="text-center border-b border-dashed border-slate-400 pb-3">
            {pharmacyProfile.logoUrl && (
              <div className="flex justify-center mb-1.5">
                <img
                  src={pharmacyProfile.logoUrl}
                  alt="Logo Faskes"
                  className="h-12 w-auto max-w-[110px] object-contain"
                />
              </div>
            )}
            <h2 className="font-black text-sm text-slate-900 uppercase">
              {pharmacyProfile.name}
            </h2>
            <p className="text-[10px] text-slate-600">
              {pharmacyFullAddress}
            </p>
            <p className="text-[10px] text-slate-600">Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}</p>
            <p className="text-[9px] text-slate-600 font-mono mt-0.5">
              {formatPharmacyLegalInfo(pharmacyProfile)}
            </p>
          </div>

          {/* Meta Info Transaksi */}
          <div className="text-[11px] space-y-0.5 border-b border-dashed border-slate-300 pb-2">
            <div className="flex justify-between">
              <span className="text-slate-500">No. Struk:</span>
              <strong className="font-bold">{selectedTrx.id}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Waktu:</span>
              <span>{selectedTrx.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Kasir:</span>
              <span>{selectedTrx.kasir}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pelanggan:</span>
              <strong className="text-slate-800">
                {!selectedTrx.customerName || selectedTrx.customerName === 'Pelanggan Umum'
                  ? 'Reguler'
                  : selectedTrx.customerName}
              </strong>
            </div>
            {selectedTrx.rmId && (
              <div className="flex justify-between">
                <span className="text-slate-500">No. RM:</span>
                <span className="font-bold text-sky-800">{selectedTrx.rmId}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Jalur Transaksi:</span>
              <span className="font-bold text-indigo-700">{selectedTrx.type}</span>
            </div>
          </div>

          {/* Petugas yang Bertugas (Multi-Petugas) jika ada */}
          {selectedTrx.assignedStaff && selectedTrx.assignedStaff.length > 0 && (
            <div className="text-[10px] bg-slate-50 p-2 rounded border border-slate-200 space-y-0.5">
              <span className="text-slate-500 font-bold block uppercase text-[9px]">
                Tim Petugas Bertugas:
              </span>
              {selectedTrx.assignedStaff.map((s, idx) => (
                <div key={idx} className="flex justify-between text-slate-700">
                  <span>{s.staffName}</span>
                  <span className="text-slate-500">({s.role})</span>
                </div>
              ))}
            </div>
          )}

          {/* Daftar Item Obat */}
          <div className="space-y-2 border-b border-dashed border-slate-300 pb-2">
            {docSummary.productItems.map((it, idx) => (
              <div key={idx} className="flex justify-between text-[11px]">
                <div className="flex-1 pr-2">
                  <div className="font-bold text-slate-900">{it.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {it.qty} {it.unit} x Rp {it.price.toLocaleString('id-ID')}
                    {it.discount ? ` (disc ${it.discount}%)` : ''}
                  </div>
                </div>
                <div className="font-bold text-slate-900 text-right">
                  Rp {it.subtotal.toLocaleString('id-ID')}
                </div>
              </div>
            ))}
            {docSummary.jasaItems.length > 0 ? (
              <>
                {docSummary.jasaItems.map((it, jIdx) => (
                  <div key={`jasa-${jIdx}`} className="flex justify-between text-[11px]">
                    <div className="flex-1 pr-2">
                      <div className="font-bold text-slate-900">{it.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {it.qty || 1} {it.unit || 'Layanan'} x Rp {it.price.toLocaleString('id-ID')}
                        {it.nama_petugas ? ` · Petugas: ${it.nama_petugas}` : ''}
                      </div>
                    </div>
                    <div className="font-bold text-slate-900 text-right">
                      Rp {it.subtotal.toLocaleString('id-ID')}
                    </div>
                  </div>
                ))}
                {docSummary.isKlinikPath && docSummary.serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <div className="flex-1 pr-2">
                      <div className="font-bold text-slate-900">Biaya Layanan / Service Charge</div>
                      <div className="text-[10px] text-slate-500">
                        1 Layanan x Rp {docSummary.serviceChargeAmount.toLocaleString('id-ID')}
                      </div>
                    </div>
                    <div className="font-bold text-slate-900 text-right">
                      Rp {docSummary.serviceChargeAmount.toLocaleString('id-ID')}
                    </div>
                  </div>
                )}
              </>
            ) : (
              docSummary.totalJasaPelayanan > 0 && (
                <div className="flex justify-between text-[11px]">
                  <div className="flex-1 pr-2">
                    <div className="font-bold text-slate-900">Jasa Pelayanan</div>
                    <div className="text-[10px] text-slate-500">
                      1 Layanan x Rp {docSummary.totalJasaPelayanan.toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div className="font-bold text-slate-900 text-right">
                    Rp {docSummary.totalJasaPelayanan.toLocaleString('id-ID')}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Ringkasan Pembayaran */}
          <div className="space-y-1 text-right border-b border-dashed border-slate-400 pb-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>Rp {docSummary.displayedSubtotal.toLocaleString('id-ID')}</span>
            </div>
            {selectedTrx.discount > 0 && (
              <div className="flex justify-between text-rose-600 font-bold">
                <span>Diskon:</span>
                <span>-Rp {selectedTrx.discount.toLocaleString('id-ID')}</span>
              </div>
            )}
            {!docSummary.isKlinikPath &&
              Boolean(selectedTrx.serviceCharge) &&
              selectedTrx.serviceCharge! > 0 && (
                <div className="flex justify-between text-indigo-700 font-bold">
                  <span>Service Charge:</span>
                  <span>+Rp {selectedTrx.serviceCharge!.toLocaleString('id-ID')}</span>
                </div>
              )}
            {Boolean(selectedTrx.pembulatan) && selectedTrx.pembulatan! > 0 && (
              <div className="flex justify-between text-slate-600 text-[11px]">
                <span>Pembulatan:</span>
                <span>+Rp {selectedTrx.pembulatan!.toLocaleString('id-ID')}</span>
              </div>
            )}
            {selectedTrx.ppn ? (
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>PPN 11%:</span>
                <span>Rp {selectedTrx.ppn.toLocaleString('id-ID')}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t border-slate-200">
              <span>TOTAL:</span>
              <span className="text-emerald-800">Rp {selectedTrx.total.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between text-slate-700 pt-1">
              <span>Metode:</span>
              <span className="font-bold">{selectedTrx.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Bayar:</span>
              <span>Rp {selectedTrx.payAmount.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-bold">
              <span>Kembali:</span>
              <span>Rp {selectedTrx.change.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Footer Struk */}
          <div className="text-center text-[10px] text-slate-500 pt-2 space-y-1">
            <p className="font-bold text-slate-700">
              Terima kasih atas kepercayaan Anda.
            </p>
            <p>Semoga lekas sembuh dan sehat selalu!</p>
            <p className="text-[9px] text-slate-400 font-mono">
              Barang yang sudah dibeli tidak dapat ditukar/dikembalikan kecuali ada perjanjian.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. MUTASI STOK & KARTU STOK DIGITAL FARMASI
  if (mode === 'mutasi-stok' || mode === 'kartu-stok') {
    const isKartuMode = mode === 'kartu-stok';
    const medId = searchParams.get('medId') || 'ALL';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const typeFilter = searchParams.get('typeFilter') || 'SEMUA';
    const searchQuery = (searchParams.get('searchQuery') || '').trim().toLowerCase();
    const isAllMode = medId === 'ALL' || !medId;

    let medicines: Medicine[] = INITIAL_MEDICINES;
    let mutations: StockMutation[] = INITIAL_STOCK_MUTATIONS;
    let transactionsList: Transaction[] = INITIAL_TRANSACTIONS;
    let purchasesList: PurchaseInvoice[] = [];
    let opnameList: StockOpnameRecord[] = [];

    try {
      const savedMed = demoGetItem('latisha_medicines');
      if (savedMed) medicines = JSON.parse(savedMed);
      const savedMut = demoGetItem('latisha_stock_mutations');
      if (savedMut) mutations = JSON.parse(savedMut);
      const savedTrx = demoGetItem('latisha_transactions');
      if (savedTrx) transactionsList = JSON.parse(savedTrx);
      const savedPur = demoGetItem('latisha_purchase_invoices');
      if (savedPur) purchasesList = JSON.parse(savedPur);
      const savedOpn = demoGetItem('latisha_stock_opname_records');
      if (savedOpn) opnameList = JSON.parse(savedOpn);
    } catch (e) {}

    const selectedMed = isAllMode
      ? undefined
      : medicines.find((m) => m.id === medId) || medicines[0];

    if (!isAllMode && !selectedMed) {
      return (
        <div className="bg-slate-100 min-h-screen text-slate-900 p-8 font-sans flex flex-col items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 text-center max-w-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Data Obat Tidak Ditemukan</h2>
            <p className="text-xs text-slate-500 mb-4">Belum ada data master obat untuk dokumen stok ini.</p>
            <button onClick={() => window.close()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">
              Tutup Halaman
            </button>
          </div>
        </div>
      );
    }

    const medicineById = new Map<string, Medicine>();
    medicines.forEach((m) => {
      if (m.id) medicineById.set(m.id, m);
    });
    const transactionById = new Map<string, Transaction>();
    transactionsList.forEach((t) => {
      if (t.id) transactionById.set(t.id, t);
    });
    const purchaseByInvoiceNo = new Map<string, PurchaseInvoice>();
    purchasesList.forEach((inv) => {
      if (inv.invoiceNo) purchaseByInvoiceNo.set(inv.invoiceNo, inv);
      if (inv.id) purchaseByInvoiceNo.set(inv.id, inv);
    });
    const opnameByRefNo = new Map<string, StockOpnameRecord>();
    opnameList.forEach((rec) => {
      if (rec.refNo) opnameByRefNo.set(rec.refNo, rec);
      if (rec.id) opnameByRefNo.set(rec.id, rec);
    });

    const batchCtx = {
      medicineById,
      transactionById,
      purchaseByInvoiceNo,
      opnameByRefNo
    };

    const filteredMutations = mutations.filter((m) => {
      if (!isAllMode && m.medicineId !== (selectedMed?.id || medId)) return false;
      if (startDate && m.date < startDate) return false;
      if (endDate && m.date > endDate) return false;
      if (typeFilter !== 'SEMUA' && m.type !== typeFilter) return false;
      if (searchQuery) {
        const med = medicineById.get(m.medicineId);
        const bInfo = resolveMutationBatchDetails(m, batchCtx);
        const bText = bInfo.details.map((d) => `${d.batchNo} ${d.expDate}`).join(' ');
        const hay = `${m.refNo} ${m.medicineName} ${m.medicineId} ${med?.batchNo || ''} ${med?.barcode || ''} ${bText} ${m.ket} ${m.petugas} ${m.type}`.toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });

    const totalIn = filteredMutations.reduce((acc, m) => acc + (Number(m.inQty) || 0), 0);
    const totalOut = filteredMutations.reduce((acc, m) => acc + (Number(m.outQty) || 0), 0);

    return (
      <div className="bg-white min-h-screen text-slate-800 p-6 max-w-5xl mx-auto font-sans text-xs">
        {printStyles}
        {renderFloatingTopBar(
          isKartuMode ? 'Kartu Stok Digital Farmasi' : 'Laporan Mutasi Stok Farmasi'
        )}

        <div id="printable-section" className="space-y-4 border border-slate-300 p-6 rounded-2xl bg-white shadow-xs">
          <div className="border-b-2 border-slate-900 pb-3">
            <div className="flex items-center justify-between gap-4">
              {pharmacyProfile.logoUrl ? (
                <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                  <img
                    src={pharmacyProfile.logoUrl}
                    alt="Logo Faskes"
                    className="w-14 h-14 object-contain"
                  />
                </div>
              ) : (
                <div className="w-14 shrink-0" />
              )}
              <div className="flex-1 text-center">
                <h2 className="font-black text-base text-slate-900 uppercase">
                  {pharmacyProfile.name}
                </h2>
                <p className="text-[11px] text-slate-600 font-medium">
                  {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                </p>
                <p className="text-[10px] text-slate-600 font-mono">
                  {formatPharmacyLegalInfo(pharmacyProfile)}
                </p>
                <h3 className="font-black text-xs text-slate-900 uppercase tracking-wide mt-1.5">
                  {isKartuMode
                    ? 'KARTU STOK DIGITAL FARMASI (BATCH & EXPIRY DATE FEFO)'
                    : 'LAPORAN MUTASI STOK FARMASI'}
                </h3>
                {isAllMode ? (
                  <p className="text-[10px] text-slate-500 font-semibold mt-1">
                    Cakupan: <strong className="text-slate-900">Semua Produk ({medicines.length} Item Terdaftar)</strong> · Total Catatan:{' '}
                    <strong className="text-slate-900">{filteredMutations.length}</strong>
                    {(startDate || endDate) && (
                      <span>
                        {' '}
                        · Periode: <strong className="text-slate-900">{startDate || '...'} s/d {endDate || '...'}</strong>
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 font-semibold mt-1">
                    Nama Produk: <strong className="text-slate-900">{selectedMed?.name}</strong> · Batch Utama:{' '}
                    <strong className="text-slate-900">{selectedMed?.batchNo || '-'}</strong> · Exp Date:{' '}
                    <strong className="text-slate-900">{selectedMed?.expDate || '-'}</strong> · Lokasi:{' '}
                    <strong className="text-slate-900">{selectedMed?.rack || '-'}</strong>
                  </p>
                )}
              </div>
              <div className="w-14 shrink-0" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 text-center font-bold text-[11px]">
            <div>
              Total Masuk:{' '}
              <span className="text-emerald-700">
                +{totalIn.toLocaleString('id-ID')} {isAllMode ? 'Unit' : selectedMed?.unit}
              </span>
            </div>
            <div>
              Total Keluar:{' '}
              <span className="text-rose-700">
                -{totalOut.toLocaleString('id-ID')} {isAllMode ? 'Unit' : selectedMed?.unit}
              </span>
            </div>
            <div>
              {isAllMode ? 'Jumlah Catatan:' : 'Saldo Saat Ini:'}{' '}
              <span className="text-sky-800">
                {isAllMode
                  ? `${filteredMutations.length} Baris`
                  : `${selectedMed?.stock ?? 0} ${selectedMed?.unit || ''}`}
              </span>
            </div>
          </div>

          {isKartuMode ? (
            <table className="w-full text-left text-xs border border-collapse">
              <thead className="bg-indigo-50 font-bold uppercase text-[10px] text-slate-700">
                <tr>
                  <th className="p-2 border">Tanggal &amp; Jam</th>
                  <th className="p-2 border">Nama Produk (Lengkap Batch &amp; ED)</th>
                  <th className="p-2 border text-center w-20">Masuk</th>
                  <th className="p-2 border text-center w-20">Keluar</th>
                  <th className="p-2 border text-center w-24">Stok Akhir</th>
                  <th className="p-2 border">Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y font-medium text-slate-700">
                {filteredMutations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                      Belum ada rekaman Kartu Stok Digital untuk filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  filteredMutations.map((m) => {
                    const med = medicineById.get(m.medicineId);
                    const batchInfo = resolveMutationBatchDetails(m, batchCtx);
                    const details = batchInfo.details;
                    const trxLabel = getTransactionTypeShortLabel(m.type, m.ket);
                    const unitLabel = med?.satuanKecil || med?.unit || '';
                    return (
                      <tr key={m.id} className="border-b align-top">
                        <td className="p-2 border font-mono whitespace-nowrap">
                          <div className="font-bold text-slate-900">{m.date}</div>
                          {m.time && <div className="text-[10px] text-slate-500">{m.time}</div>}
                        </td>
                        <td className="p-2 border">
                          <div className="font-bold text-slate-900">
                            {m.medicineName || med?.name || '-'}{' '}
                            <span className="text-[10px] font-semibold text-slate-500">
                              [{trxLabel}{m.refNo && m.refNo !== '-' ? ` #${m.refNo}` : ''}]
                            </span>
                          </div>
                          <div className="mt-1 space-y-0.5 text-[10px] font-mono text-slate-700">
                            {details.map((bd, idx) => (
                              <div key={`${m.id}-pbd-${idx}`}>
                                Batch: <strong>{bd.batchNo || '-'}</strong> · ED:{' '}
                                <strong>{bd.expDate || '-'}</strong>
                                {details.length > 1 && bd.qty > 0
                                  ? ` (${bd.qty}${unitLabel ? ` ${unitLabel}` : ''})`
                                  : ''}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-2 border text-center font-mono font-bold text-emerald-600 whitespace-nowrap">
                          {m.inQty > 0 ? `+${m.inQty}` : '-'}
                        </td>
                        <td className="p-2 border text-center font-mono font-bold text-rose-600 whitespace-nowrap">
                          {m.outQty > 0 ? `-${m.outQty}` : '-'}
                        </td>
                        <td className="p-2 border text-center font-mono font-black text-slate-900 bg-slate-50">
                          {m.balance}
                        </td>
                        <td className="p-2 border text-slate-600 font-mono text-[10px] whitespace-nowrap">
                          {m.petugas || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs border border-collapse">
              <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-700">
                <tr>
                  <th className="p-2 border">Tanggal &amp; Jam</th>
                  <th className="p-2 border">No. Referensi</th>
                  {isAllMode && <th className="p-2 border">Nama Obat</th>}
                  <th className="p-2 border">Jenis Mutasi</th>
                  <th className="p-2 border text-center w-20">Masuk</th>
                  <th className="p-2 border text-center w-20">Keluar</th>
                  <th className="p-2 border text-center w-24">Saldo Akhir</th>
                  <th className="p-2 border">Keterangan</th>
                  <th className="p-2 border">Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y font-medium text-slate-700">
                {filteredMutations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAllMode ? 9 : 8}
                      className="p-6 text-center text-slate-400 italic"
                    >
                      Belum ada catatan mutasi pergerakan stok untuk filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  filteredMutations.map((m) => (
                    <tr key={m.id} className="border-b">
                      <td className="p-2 border font-mono whitespace-nowrap">
                        <div>{m.date}</div>
                        {m.time && <div className="text-[10px] text-slate-400">{m.time}</div>}
                      </td>
                      <td className="p-2 border font-mono font-bold text-sky-700 whitespace-nowrap">
                        {m.refNo}
                      </td>
                      {isAllMode && (
                        <td className="p-2 border font-bold text-slate-800">{m.medicineName}</td>
                      )}
                      <td className="p-2 border whitespace-nowrap">
                        <span className="font-bold text-[10px] uppercase">{m.type}</span>
                      </td>
                      <td className="p-2 border text-center font-mono font-bold text-emerald-600">
                        {m.inQty > 0 ? `+${m.inQty}` : '-'}
                      </td>
                      <td className="p-2 border text-center font-mono font-bold text-rose-600">
                        {m.outQty > 0 ? `-${m.outQty}` : '-'}
                      </td>
                      <td className="p-2 border text-center font-mono font-black text-slate-900 bg-slate-50">
                        {m.balance}
                      </td>
                      <td className="p-2 border text-slate-600 text-[11px]">{m.ket}</td>
                      <td className="p-2 border text-slate-500 font-mono text-[10px] whitespace-nowrap">
                        {m.petugas}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          <div className="grid grid-cols-2 pt-6 text-xs">
            <div />
            <div className="text-center space-y-12">
              <p className="font-semibold text-slate-700">
                {pharmacyProfile.city}, {new Date().toLocaleDateString('id-ID')}<br />
                Penanggung Jawab Teknis Kefarmasian (APJ),
              </p>
              <div>
                <p className="font-extrabold underline text-slate-900">{apjProfile.name}</p>
                <p className="text-[10px] text-slate-600 font-mono">SIPA: {apjProfile.sipa}</p>
                <p className="text-[10px] text-slate-500 font-mono">STRA: {apjProfile.stra}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. FAKTUR PENJUALAN RESMI & KWITANSI PEMBAYARAN
  if (mode === 'faktur-penjualan' || mode === 'kwitansi-penjualan') {
    const trxId = searchParams.get('trxId') || '';
    const loggedInStaffName =
      searchParams.get('petugas') || demoGetItem('latisha_user_name') || '';

    let selectedTrx: Transaction | null = null;
    try {
      const activeSaved = demoGetItem('latisha_active_print_trx');
      if (activeSaved) {
        const parsed = JSON.parse(activeSaved);
        if (!trxId || parsed.id === trxId) {
          selectedTrx = parsed;
        }
      }
      if (!selectedTrx) {
        const savedList = demoGetItem('latisha_transactions');
        if (savedList) {
          const list: Transaction[] = JSON.parse(savedList);
          selectedTrx = list.find((t) => t.id === trxId) || list[0] || null;
        }
      }
    } catch (e) {}

    if (!selectedTrx) {
      return (
        <div className="bg-slate-100 min-h-screen text-slate-900 p-8 font-sans flex flex-col items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 text-center max-w-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Data Faktur Tidak Ditemukan</h2>
            <p className="text-xs text-slate-500 mb-4">Tidak ada data faktur penjualan yang dapat dicetak saat ini.</p>
            <button onClick={() => window.close()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">
              Tutup Halaman
            </button>
          </div>
        </div>
      );
    }

    const resolvedCustomer =
      !selectedTrx.customerName || selectedTrx.customerName === 'Pelanggan Umum'
        ? 'Reguler'
        : selectedTrx.customerName;

    const petugasAkun = loggedInStaffName || selectedTrx.kasir || apjProfile.name;
    const docSummary = summarizeTransactionForDocument(selectedTrx);
    const paramKeterangan = searchParams.get('keterangan');
    const effectiveKeterangan =
      printKwitansiKeterangan !== null
        ? printKwitansiKeterangan
        : paramKeterangan !== null
        ? paramKeterangan
        : getDefaultKwitansiKeterangan(selectedTrx);

    return (
      <div className="bg-white min-h-screen text-slate-800 p-6 max-w-4xl mx-auto font-sans text-xs">
        {printStyles}
        <div className="no-print bg-slate-900 text-white p-3.5 rounded-2xl mb-6 flex flex-wrap justify-between items-center gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-xs">
              {activeInvoicePrintType === 'kwitansi' ? 'Kwitansi Pembayaran' : 'Faktur Penjualan Apotek'} · Pratinjau Cetak Mandiri
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setActiveInvoicePrintType('faktur');
                setTimeout(safePrint, 150);
              }}
              className={`px-4 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer text-xs shadow-sm transition ${
                activeInvoicePrintType === 'faktur'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white ring-2 ring-indigo-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Faktur</span>
            </button>
            <button
              onClick={() => {
                setActiveInvoicePrintType('kwitansi');
                setTimeout(safePrint, 150);
              }}
              className={`px-4 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer text-xs shadow-sm transition ${
                activeInvoicePrintType === 'kwitansi'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Kwitansi</span>
            </button>
            <button
              onClick={() => window.close()}
              className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-bold flex items-center gap-1 cursor-pointer text-xs transition"
            >
              <X className="w-4 h-4" />
              <span>Tutup Jendela</span>
            </button>
          </div>
        </div>

        {activeInvoicePrintType === 'kwitansi' ? (
          <div
            id="printable-section"
            className="bg-white p-8 rounded-2xl shadow-xs border-2 border-slate-800 w-full max-w-2xl mx-auto text-slate-900 text-xs leading-relaxed space-y-4"
          >
            {/* KOP KWITANSI */}
            <div className="border-b-2 border-slate-900 pb-4 mb-5 flex justify-between items-center gap-4">
              <div className="flex items-center gap-3.5">
                {pharmacyProfile.logoUrl && (
                  <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                    <img
                      src={pharmacyProfile.logoUrl}
                      alt="Logo Faskes"
                      className="w-14 h-14 object-contain"
                    />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-black tracking-wider text-slate-900 uppercase">
                    {pharmacyProfile.name}
                  </h2>
                  <p className="text-[11px] text-slate-700 font-medium">
                    {pharmacyFullAddress}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                  </p>
                  <div className="text-[10px] text-slate-600 font-mono font-medium mt-0.5 flex flex-wrap gap-x-2">
                    {pharmacyProfile.sia && <span>SIA: <strong>{pharmacyProfile.sia}</strong></span>}
                    {pharmacyProfile.nib && <span>· NIB: <strong>{pharmacyProfile.nib}</strong></span>}
                    {pharmacyProfile.npwp && <span>· NPWP: <strong>{pharmacyProfile.npwp}</strong></span>}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="inline-block px-3.5 py-1.5 bg-slate-900 text-white font-mono font-black text-sm rounded tracking-widest uppercase">
                  KWITANSI
                </div>
              </div>
            </div>

            {/* ISI KWITANSI */}
            <div className="space-y-4 text-xs my-4">
              <div className="grid grid-cols-12 items-center border-b border-dashed border-slate-300 pb-2.5">
                <div className="col-span-4 font-bold text-slate-600 uppercase tracking-wider">
                  No. Transaksi
                </div>
                <div className="col-span-8 font-mono font-black text-slate-900 text-sm">
                  : {selectedTrx.id}
                </div>
              </div>

              <div className="grid grid-cols-12 items-center border-b border-dashed border-slate-300 pb-2.5">
                <div className="col-span-4 font-bold text-slate-600 uppercase tracking-wider">
                  DITERIMA Dari
                </div>
                <div className="col-span-8 font-extrabold text-slate-900 text-sm">
                  : {resolvedCustomer}
                </div>
              </div>

              {docSummary.totalJasaPelayanan > 0 && (
                <div className="grid grid-cols-12 items-center border-b border-dashed border-slate-300 pb-2.5">
                  <div className="col-span-4 font-bold text-slate-600 uppercase tracking-wider">
                    Jasa Pelayanan
                  </div>
                  <div className="col-span-8 font-mono font-black text-slate-900 text-sm">
                    : Rp {docSummary.totalJasaPelayanan.toLocaleString('id-ID')}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-12 items-start border-b border-dashed border-slate-300 pb-3">
                <div className="col-span-4 font-bold text-slate-600 uppercase tracking-wider pt-1">
                  Keterangan
                </div>
                <div className="col-span-8">
                  <div className="no-print flex items-start gap-1.5">
                    <span className="font-bold text-slate-900 pt-1.5">:</span>
                    <textarea
                      rows={2}
                      value={effectiveKeterangan}
                      onChange={(e) => setPrintKwitansiKeterangan(e.target.value)}
                      placeholder="Ketik keterangan kwitansi..."
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-y"
                    />
                  </div>
                  <div className="hidden print:block font-semibold text-slate-900 whitespace-pre-wrap leading-relaxed">
                    : {effectiveKeterangan.trim() || '-'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 items-center border-b border-dashed border-slate-300 pb-2.5">
                <div className="col-span-4 font-bold text-slate-600 uppercase tracking-wider">
                  Nilai Tagihan
                </div>
                <div className="col-span-8">
                  <span className="inline-block px-4 py-1.5 bg-slate-100 border-2 border-slate-800 rounded font-mono font-black text-base text-slate-900">
                    Rp {selectedTrx.total.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-12 items-start border-b border-dashed border-slate-300 pb-3">
                <div className="col-span-4 font-bold text-slate-600 uppercase tracking-wider pt-1">
                  Terbilang
                </div>
                <div className="col-span-8 p-2.5 bg-slate-50 border border-slate-300 rounded italic font-bold text-slate-900">
                  # {getTerbilang(selectedTrx.total)} #
                </div>
              </div>
            </div>

            {/* TANGGAL & TANDA TANGAN PETUGAS SESUAI AKUN */}
            <div className="mt-10 pt-4 flex justify-end">
              <div className="w-72 text-center">
                <p className="text-[11px] font-semibold text-slate-700">
                  {pharmacyProfile.city || 'Tangerang'}, {selectedTrx.date}
                </p>
                <p className="text-[11px] font-bold text-slate-800 mt-1">
                  Petugas Penerima,
                </p>
                <div
                  className="min-h-[130px] pt-24 pb-2 flex items-end justify-center"
                  style={{ minHeight: '130px', paddingTop: '96px' }}
                >
                  <span className="text-[9px] text-slate-400 italic">(Tanda Tangan & Stempel)</span>
                </div>
                <p className="font-black text-slate-900 border-t border-slate-800 pt-1.5 text-xs">
                  {petugasAkun}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div
            id="printable-section"
            className="bg-white p-8 rounded-2xl shadow-xs border border-slate-300 w-full text-slate-900 text-xs leading-relaxed space-y-4"
          >
            {/* KOP APOTEK RESMI */}
            <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-center gap-4">
              <div className="flex items-center gap-3.5">
                {pharmacyProfile.logoUrl && (
                  <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                    <img
                      src={pharmacyProfile.logoUrl}
                      alt="Logo Faskes"
                      className="w-14 h-14 object-contain"
                    />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-black tracking-wider text-slate-900 uppercase">
                    {pharmacyProfile.name}
                  </h2>
                  <p className="text-[11px] text-slate-700 font-medium">
                    {pharmacyFullAddress}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                  </p>
                  <div className="text-[10px] text-slate-600 font-mono font-medium mt-1 flex flex-wrap gap-x-2">
                    {pharmacyProfile.sia && <span>SIA: <strong>{pharmacyProfile.sia}</strong></span>}
                    {pharmacyProfile.nib && <span>· NIB: <strong>{pharmacyProfile.nib}</strong></span>}
                    {pharmacyProfile.npwp && <span>· NPWP: <strong>{pharmacyProfile.npwp}</strong></span>}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="inline-block px-3 py-1 bg-slate-900 text-white font-mono font-black text-xs rounded">
                  FAKTUR PENJUALAN
                </div>
                <div className="text-[10px] font-mono text-slate-600 mt-1">
                  No: <strong>{selectedTrx.id}</strong>
                </div>
              </div>
            </div>

            {/* Info Header */}
            <div className="grid grid-cols-2 gap-4 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  KEPADA YTH. (PEMESAN / FASKES):
                </p>
                <p className="font-bold text-slate-900 text-sm">
                  {resolvedCustomer}
                </p>
                {selectedTrx.customerAddress && (
                  <p className="text-slate-600 mt-0.5">{selectedTrx.customerAddress}</p>
                )}
                {selectedTrx.customerPhone && (
                  <p className="text-slate-600">Telp: {selectedTrx.customerPhone}</p>
                )}
              </div>

              <div className="space-y-1 text-right">
                <div className="flex justify-between">
                  <span className="text-slate-500">Tanggal Faktur:</span>
                  <strong className="text-slate-800">{selectedTrx.date}</strong>
                </div>
                {selectedTrx.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Jatuh Tempo:</span>
                    <strong className="text-amber-700">{selectedTrx.dueDate}</strong>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Syarat Pembayaran:</span>
                  <strong>{selectedTrx.term || 'Tunai / COD'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Petugas / Kasir:</span>
                  <strong>{selectedTrx.kasir}</strong>
                </div>
              </div>
            </div>

            {/* Tabel Rincian */}
            <table className="w-full border-collapse border border-slate-300 text-[11px] mb-4">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold">
                  <th className="border border-slate-300 p-2 text-center w-8">No</th>
                  <th className="border border-slate-300 p-2 text-left">Nama Obat / Alat Kesehatan</th>
                  <th className="border border-slate-300 p-2 text-left">Zat Aktif &amp; Kekuatan</th>
                  <th className="border border-slate-300 p-2 text-left">No. Batch</th>
                  <th className="border border-slate-300 p-2 text-center">Exp Date</th>
                  <th className="border border-slate-300 p-2 text-center">Qty</th>
                  <th className="border border-slate-300 p-2 text-center">Satuan</th>
                  <th className="border border-slate-300 p-2 text-right">Harga</th>
                  <th className="border border-slate-300 p-2 text-center">Diskon</th>
                  <th className="border border-slate-300 p-2 text-right">Total (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {docSummary.productItems.map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="border border-slate-300 p-1.5 text-center">{idx + 1}</td>
                    <td className="border border-slate-300 p-1.5 font-bold text-slate-800">{it.name}</td>
                    <td className="border border-slate-300 p-1.5">{it.kekuatan || '-'}</td>
                    <td className="border border-slate-300 p-1.5 font-mono">{it.batchNo || '-'}</td>
                    <td className="border border-slate-300 p-1.5 text-center font-mono">{it.expDate || '-'}</td>
                    <td className="border border-slate-300 p-1.5 text-center font-bold">{it.qty}</td>
                    <td className="border border-slate-300 p-1.5 text-center">{it.unit}</td>
                    <td className="border border-slate-300 p-1.5 text-right">{it.price.toLocaleString('id-ID')}</td>
                    <td className="border border-slate-300 p-1.5 text-center">
                      {it.discount && it.discount > 100
                        ? `Rp ${it.discount.toLocaleString('id-ID')}`
                        : `${it.discount || 0}%`}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-bold">
                      {it.subtotal.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
                {docSummary.jasaItems.length > 0 ? (
                  <>
                    {docSummary.jasaItems.map((it, jIdx) => (
                      <tr key={`jasa-${jIdx}`} className="hover:bg-slate-50">
                        <td className="border border-slate-300 p-1.5 text-center">
                          {docSummary.productItems.length + jIdx + 1}
                        </td>
                        <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                          <div>{it.name}</div>
                          {it.nama_petugas && (
                            <div className="text-[10px] font-medium text-indigo-700">
                              Petugas: {it.nama_petugas}
                              {it.role_petugas ? ` (${it.role_petugas})` : ''}
                            </div>
                          )}
                        </td>
                        <td className="border border-slate-300 p-1.5">Pelayanan Medis &amp; Kefarmasian</td>
                        <td className="border border-slate-300 p-1.5 font-mono">-</td>
                        <td className="border border-slate-300 p-1.5 text-center font-mono">-</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">{it.qty || 1}</td>
                        <td className="border border-slate-300 p-1.5 text-center">{it.unit || 'Layanan'}</td>
                        <td className="border border-slate-300 p-1.5 text-right">
                          {it.price.toLocaleString('id-ID')}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center">
                          {it.discount && it.discount > 100
                            ? `Rp ${it.discount.toLocaleString('id-ID')}`
                            : `${it.discount || 0}%`}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right font-bold">
                          {it.subtotal.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                    {docSummary.serviceChargeAmount > 0 && (
                      <tr className="hover:bg-slate-50">
                        <td className="border border-slate-300 p-1.5 text-center">
                          {docSummary.productItems.length + docSummary.jasaItems.length + 1}
                        </td>
                        <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                          Biaya Layanan / Service Charge
                        </td>
                        <td className="border border-slate-300 p-1.5">Layanan Tambahan POS</td>
                        <td className="border border-slate-300 p-1.5 font-mono">-</td>
                        <td className="border border-slate-300 p-1.5 text-center font-mono">-</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">1</td>
                        <td className="border border-slate-300 p-1.5 text-center">Layanan</td>
                        <td className="border border-slate-300 p-1.5 text-right">
                          {docSummary.serviceChargeAmount.toLocaleString('id-ID')}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center">0%</td>
                        <td className="border border-slate-300 p-1.5 text-right font-bold">
                          {docSummary.serviceChargeAmount.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    )}
                  </>
                ) : (
                  docSummary.totalJasaPelayanan > 0 && (
                    <tr className="hover:bg-slate-50">
                      <td className="border border-slate-300 p-1.5 text-center">
                        {docSummary.productItems.length + 1}
                      </td>
                      <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                        Jasa Pelayanan
                      </td>
                      <td className="border border-slate-300 p-1.5">Pelayanan Medis &amp; Kefarmasian</td>
                      <td className="border border-slate-300 p-1.5 font-mono">-</td>
                      <td className="border border-slate-300 p-1.5 text-center font-mono">-</td>
                      <td className="border border-slate-300 p-1.5 text-center font-bold">1</td>
                      <td className="border border-slate-300 p-1.5 text-center">Layanan</td>
                      <td className="border border-slate-300 p-1.5 text-right">
                        {docSummary.totalJasaPelayanan.toLocaleString('id-ID')}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-center">0%</td>
                      <td className="border border-slate-300 p-1.5 text-right font-bold">
                        {docSummary.totalJasaPelayanan.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>

            {/* Ringkasan */}
            <div className="flex justify-between items-start gap-6 mb-6 text-[11px]">
              <div className="flex-1 space-y-2">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <p className="font-bold text-slate-700">Terbilang:</p>
                  <p className="italic font-semibold text-slate-900 mt-0.5">
                    # {getTerbilang(selectedTrx.total)} #
                  </p>
                </div>

                <div className="text-[10px] text-slate-500 space-y-0.5">
                  <p><strong>Ketentuan Faktur:</strong></p>
                  <p>1. Barang yang sudah diterima dalam kondisi baik tidak dapat dikembalikan tanpa persetujuan.</p>
                  <p>2. Pembayaran via transfer harap ke Rekening Resmi: <strong>SEABANK 9015-5031-5849 a/n Mardin, BRI 7704-0101-3765-531 a/n Mardin</strong>.</p>
                </div>
              </div>

              <div className="w-64 space-y-1 text-slate-700 border border-slate-300 p-3 rounded bg-slate-50">
                {selectedTrx.discount ? (
                  <div className="flex justify-between text-rose-700">
                    <span>Total Diskon:</span>
                    <span className="font-mono">- Rp {selectedTrx.discount.toLocaleString('id-ID')}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span>Dasar Pengenaan Pajak (DPP):</span>
                  <span className="font-mono">
                    Rp {(selectedTrx.dpp || (selectedTrx.total - (selectedTrx.ppn || 0) - (selectedTrx.shippingFee || 0))).toLocaleString('id-ID')}
                  </span>
                </div>
                {selectedTrx.ppn ? (
                  <div className="flex justify-between">
                    <span>PPN 11%:</span>
                    <span className="font-mono">Rp {selectedTrx.ppn.toLocaleString('id-ID')}</span>
                  </div>
                ) : null}
                {selectedTrx.shippingFee ? (
                  <div className="flex justify-between">
                    <span>Est. Ongkir:</span>
                    <span className="font-mono">Rp {selectedTrx.shippingFee.toLocaleString('id-ID')}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-black text-slate-900 border-t border-slate-300 pt-1 text-xs">
                  <span>TOTAL FAKTUR:</span>
                  <span className="font-mono text-emerald-800">Rp {selectedTrx.total.toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>

            {/* 3 Kolom Tanda Tangan */}
            <div className="grid grid-cols-3 gap-4 text-center text-[10px] pt-4 border-t border-slate-300">
              <div>
                <p className="font-bold text-slate-700">Yang Menerima / Faskes Pemesan,</p>
                <div className="h-16 flex items-end justify-center">
                  <p className="text-slate-400 italic text-[9px]">(Stempel & Tanda Tangan)</p>
                </div>
                <p className="font-bold text-slate-900 border-t border-slate-400 pt-1">
                  {resolvedCustomer}
                </p>
              </div>

              <div>
                <p className="font-bold text-slate-700">Petugas Gudang / Kasir,</p>
                <div className="h-16 flex items-end justify-center">
                  <p className="text-slate-400 italic text-[9px]">(Tanda Tangan)</p>
                </div>
                <p className="font-bold text-slate-900 border-t border-slate-400 pt-1">
                  {selectedTrx.kasir}
                </p>
              </div>

              <div>
                <p className="font-bold text-slate-700">Apoteker Pengelola Apotek (APJ),</p>
                <div className="h-16 flex items-end justify-center">
                  <p className="text-indigo-600 font-mono font-bold text-[9px]">Latisha Farma APJ Seal</p>
                </div>
                <p className="font-bold text-slate-900 border-t border-slate-400 pt-1">
                  {apjProfile.name}
                </p>
                <p className="text-[9px] text-slate-600 font-mono">SIPA: {apjProfile.sipa}</p>
                <p className="text-[9px] text-slate-500 font-mono">STRA: {apjProfile.stra}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 5. RESUME RME, SALINAN RESEP (COPY RX / APOGRAPH), ATAU SURAT SAKIT
  if (mode === 'rme' || mode === 'copy-resep' || mode === 'surat-sakit') {
    const rmeId = searchParams.get('rmeId') || '';
    let record: RMERecord | null = null;

    try {
      const activeRme = demoGetItem('latisha_active_print_rme');
      if (activeRme) {
        const parsed = JSON.parse(activeRme);
        if (!rmeId || parsed.id === rmeId) {
          record = parsed;
        }
      }
      if (!record) {
        const savedList = demoGetItem('latisha_rme_records');
        const list: RMERecord[] = savedList ? JSON.parse(savedList) : INITIAL_RME_RECORDS;
        record = list.find((r) => r.id === rmeId) || list[0] || null;
      }
    } catch (e) {
      record = INITIAL_RME_RECORDS.find((r) => r.id === rmeId) || INITIAL_RME_RECORDS[0] || null;
    }

    if (!record) {
      return (
        <div className="bg-slate-100 min-h-screen text-slate-900 p-8 font-sans flex flex-col items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 text-center max-w-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Data Rekam Medis Tidak Ditemukan</h2>
            <p className="text-xs text-slate-500 mb-4">Tidak ada catatan RME yang dipilih untuk dicetak saat ini.</p>
            <button onClick={() => window.close()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">
              Tutup Halaman
            </button>
          </div>
        </div>
      );
    }

    const toRomanNumeral = (num: number): string => {
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
      let res = '';
      let rem = n;
      for (const [val, sym] of map) {
        while (rem >= val) {
          res += sym;
          rem -= val;
        }
      }
      return res;
    };

    const formatStandardSigna = (dosage: string, unit: string): { latin: string; clearText: string } => {
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
    };

    const lookupPatientForRx = (rmId: string, patientName: string): Patient | null => {
      try {
        const saved = demoGetItem('latisha_patients');
        const list: Patient[] = saved ? JSON.parse(saved) : INITIAL_PATIENTS;
        return list.find((p) => p.id === rmId || p.name.toLowerCase() === patientName.toLowerCase()) || null;
      } catch {
        return INITIAL_PATIENTS.find((p) => p.id === rmId || p.name.toLowerCase() === patientName.toLowerCase()) || null;
      }
    };

    const patientInfo = lookupPatientForRx(record.rmId, record.patientName);
    const patientAddress = patientInfo?.address || `${pharmacyProfile.city} (Sesuai Data Rekam Medis)`;
    const patientPhone = patientInfo?.phone || '-';
    const patientAllergy = patientInfo?.allergy || 'Tidak ada riwayat alergi obat';

    return (
      <div className="bg-white min-h-screen text-slate-800 p-6 max-w-4xl mx-auto font-sans text-xs">
        {printStyles}
        {renderFloatingTopBar(
          mode === 'rme'
            ? 'Resume e-RME Pasien'
            : mode === 'copy-resep'
            ? 'Salinan Resep (Copy Rx / Apograph)'
            : 'Surat Keterangan Sakit'
        )}

        <div
          id="printable-section"
          className="space-y-6 border border-slate-300 p-8 rounded-2xl bg-white shadow-xs text-xs"
        >
          {/* Header Terintegrasi Profil Apotek, APJ, dan DPJ */}
          <div className="border-b-2 border-slate-900 pb-4">
            <div className="flex items-center justify-between gap-4">
              {pharmacyProfile.logoUrl ? (
                <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                  <img
                    src={
                      pharmacyProfile.logoUrl ||
                      (hasLocalServerBackend()
                        ? '/api/facility-logo'
                        : `${import.meta.env.BASE_URL}assets/aistudio/logo_resmi_apotek_673c56f0.png`)
                    }
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = hasLocalServerBackend()
                        ? '/api/facility-logo'
                        : `${import.meta.env.BASE_URL}assets/aistudio/logo_resmi_apotek_673c56f0.png`;
                    }}
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
                  {formatPharmacyLegalInfo(pharmacyProfile)}
                </p>
              </div>
              <div className="w-16 shrink-0" />
            </div>
            <div className="text-center">
              <div className="mt-2 inline-block px-4 py-1 bg-sky-50 text-sky-900 rounded-full font-black text-xs uppercase border border-sky-200">
                {mode === 'rme'
                  ? 'RESUME REKAM MEDIS PASIEN'
                  : mode === 'copy-resep'
                  ? 'SALINAN RESEP (COPY RESEP / APOGRAPH)'
                  : 'SURAT KETERANGAN ISTIRAHAT SAKIT'}
              </div>
            </div>
          </div>

          {mode === 'rme' ? (
            <>
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Identitas Pasien</span>
                  <div className="font-bold text-sm text-slate-900 mt-0.5">{record.patientName}</div>
                  <div className="font-mono text-slate-600 mt-0.5">
                    No. RM: <strong>{record.rmId}</strong> · {record.gender}, {record.age} tahun
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Waktu Pemeriksaan</span>
                  <div className="font-bold text-slate-800 mt-0.5">{record.date} · {record.time} WIB</div>
                  <div className="text-slate-600">Dokter: <strong>{record.doctorName}</strong></div>
                </div>
              </div>

              {record.assignedStaff && record.assignedStaff.length > 0 && (
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 text-xs">
                  <span className="text-[10px] text-indigo-900 font-bold uppercase block mb-1">
                    Tim Petugas Medis Bertugas:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {record.assignedStaff.map((st, i) => (
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

              <div className="border border-slate-200 p-3 rounded-xl bg-slate-50 font-mono text-xs flex flex-wrap gap-4 justify-between">
                <span>TD: <strong>{record.vitalSign.td} mmHg</strong></span>
                <span>Suhu: <strong>{record.vitalSign.suhu}°C</strong></span>
                <span>Nadi: <strong>{record.vitalSign.nadi} bpm</strong></span>
                <span>SpO2: <strong>{record.vitalSign.spo2}%</strong></span>
                {record.vitalSign.bb && <span>BB: <strong>{record.vitalSign.bb} kg</strong></span>}
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <strong className="text-sky-800 block text-[11px] mb-0.5 font-extrabold uppercase">
                    S - Subjective:
                  </strong>
                  <p className="text-slate-700">{record.soapS}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <strong className="text-sky-800 block text-[11px] mb-0.5 font-extrabold uppercase">
                    O - Objective:
                  </strong>
                  <p className="text-slate-700">{record.soapO}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <strong className="text-emerald-900 block text-[11px] mb-0.5 font-extrabold uppercase">
                    A - Assessment (Diagnosis ICD-10):
                  </strong>
                  <p className="font-extrabold text-emerald-950 text-sm">{record.soapA}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <strong className="text-sky-800 block text-[11px] mb-0.5 font-extrabold uppercase">
                    P - Plan:
                  </strong>
                  <p className="text-slate-700">{record.soapP || 'Edukasi dan terapi farmakologis sesuai resep.'}</p>
                </div>
              </div>
            </>
          ) : mode === 'copy-resep' ? (
            /* FORMAT BAKU SALINAN RESEP (COPY RX / APOGRAPH) SESUAI DOKUMEN PRATINJAU */
            <div className="space-y-4 text-xs text-slate-900">
              {/* 1. INSCRIPTIO: Identitas Administratif Resep, Dokter & Pasien */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-300 text-[11px]">
                <div className="space-y-1 border-b sm:border-b-0 sm:border-r border-slate-300 pb-2 sm:pb-0 sm:pr-3">
                  <div className="text-[10px] font-black uppercase tracking-wider text-indigo-900 mb-1">
                    I. Inscriptio (Asal Resep & Dokter Penulis)
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-5 text-slate-600 font-semibold">No. Salinan Resep</span>
                    <span className="col-span-7 font-mono font-black text-slate-900">: CRX/{record.id}</span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-5 text-slate-600 font-semibold">Dari Dokter</span>
                    <span className="col-span-7 font-bold text-slate-900">: {record.doctorName || dpjProfile.name}</span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-5 text-slate-600 font-semibold">No. SIP Dokter</span>
                    <span className="col-span-7 font-mono text-slate-800">: {dpjProfile.sip}</span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-5 text-slate-600 font-semibold">Tertanggal Resep</span>
                    <span className="col-span-7 font-mono font-bold text-slate-900">: {record.date} ({record.time} WIB)</span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-5 text-slate-600 font-semibold">Tgl. Copy Resep</span>
                    <span className="col-span-7 font-mono text-slate-800">: {record.date}</span>
                  </div>
                </div>

                <div className="space-y-1 sm:pl-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-indigo-900 mb-1">
                    II. Identitas Lengkap Pasien (Pro)
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-4 text-slate-600 font-semibold">Pro (Pasien)</span>
                    <span className="col-span-8 font-black text-slate-900">: {record.patientName} ({record.rmId})</span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-4 text-slate-600 font-semibold">Umur / JK</span>
                    <span className="col-span-8 font-bold text-slate-800">
                      : {record.age} Tahun / {record.gender}
                      {record.vitalSign?.bb ? ` · BB: ${record.vitalSign.bb} kg` : ''}
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
                  {record.prescription && record.prescription.length > 0 ? (
                    record.prescription.map((item, idx) => {
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
                      <strong>Diagnosa Klinis (ICD-10):</strong> {record.soapA}
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
          ) : (
            <div className="space-y-4 py-4 text-xs leading-relaxed">
              <p>
                Yang bertanda tangan di bawah ini, Dokter Pemeriksa <strong>{pharmacyProfile.name}</strong> ({dpjProfile.name} · {dpjProfile.specialization}) menerangkan bahwa:
              </p>
              <div className="pl-6 space-y-1.5 font-medium">
                <div className="grid grid-cols-4">
                  <span className="text-slate-500">Nama Pasien</span>
                  <span className="col-span-3 font-bold text-slate-900">: {record.patientName}</span>
                </div>
                <div className="grid grid-cols-4">
                  <span className="text-slate-500">No. Rekam Medis</span>
                  <span className="col-span-3 font-mono font-bold">: {record.rmId}</span>
                </div>
                <div className="grid grid-cols-4">
                  <span className="text-slate-500">Umur / Gender</span>
                  <span className="col-span-3">: {record.age} tahun / {record.gender}</span>
                </div>
                <div className="grid grid-cols-4">
                  <span className="text-slate-500">Diagnosis Medis</span>
                  <span className="col-span-3 font-bold text-emerald-800">: {record.soapA}</span>
                </div>
              </div>

              <p>
                Berdasarkan hasil pemeriksaan klinis kami, yang bersangkutan dalam keadaan <strong>SAKIT</strong> dan memerlukan istirahat selama <strong>2 (dua) hari</strong> terhitung sejak tanggal <strong>{record.date}</strong> sampai dengan <strong>{new Date(Date.now() + 86400000).toISOString().split('T')[0]}</strong>.
              </p>
              <p>Demikian surat keterangan ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>
            </div>
          )}

          {/* Signature Block: Copy Resep (APJ p.c.c only) vs RME / Surat Sakit */}
          {mode === 'copy-resep' ? (
            <div className="grid grid-cols-2 pt-4 text-xs gap-4">
              <div />
              <div className="text-center space-y-12">
                <p className="font-semibold text-slate-700">
                  {pharmacyProfile.city}, {record.date}<br />
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
                  {pharmacyProfile.city}, {record.date}<br />
                  Dokter Pemeriksa / Penanggung Jawab Klinis (DPJ),
                </p>
                <div>
                  <p className="font-extrabold underline text-slate-900">{record.doctorName || dpjProfile.name}</p>
                  <p className="text-[10px] text-slate-600 font-mono">SIP: {dpjProfile.sip}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{dpjProfile.idi}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 6. KARTU PASIEN (PATIENT MEMBERSHIP CARD)
  if (mode === 'kartu-pasien') {
    const patientId = searchParams.get('patientId') || '';
    let patient: Patient | null = null;

    try {
      const savedActive = demoGetItem('latisha_active_print_patient');
      if (savedActive) {
        const parsed = JSON.parse(savedActive);
        if (!patientId || parsed.id === patientId) {
          patient = parsed;
        }
      }
      if (!patient) {
        const savedList = demoGetItem('latisha_patients');
        if (savedList) {
          const list: Patient[] = JSON.parse(savedList);
          patient = list.find((p) => p.id === patientId) || list[0] || null;
        }
      }
    } catch (e) {}

    if (!patient) {
      return (
        <div className="bg-slate-100 min-h-screen text-slate-900 p-8 font-sans flex flex-col items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 text-center max-w-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Data Pasien Tidak Ditemukan</h2>
            <p className="text-xs text-slate-500 mb-4">Tidak ada data pasien yang dipilih untuk dicetak saat ini.</p>
            <button onClick={() => window.close()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">
              Tutup Halaman
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-slate-100 min-h-screen text-slate-900 p-6 flex flex-col items-center justify-center font-sans text-xs">
        {printStyles}
        <div className="w-full max-w-md mb-4">
          {renderFloatingTopBar('Kartu Berobat Pasien')}
        </div>

        {/* Card Component */}
        <div
          id="printable-section"
          className="w-full max-w-md bg-gradient-to-br from-sky-900 via-sky-800 to-indigo-900 text-white rounded-3xl p-6 shadow-2xl relative overflow-hidden border border-sky-700 space-y-4"
        >
          <div className="flex justify-between items-start border-b border-sky-700/60 pb-3 gap-2">
            <div className="flex items-center gap-2.5">
              {pharmacyProfile.logoUrl && (
                <div className="w-10 h-10 rounded-xl bg-white p-1 shrink-0 flex items-center justify-center shadow-xs">
                  <img
                    src={pharmacyProfile.logoUrl}
                    alt="Logo Faskes"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <div>
                <h2 className="font-black text-sm tracking-wide uppercase text-white">
                  {pharmacyProfile.name}
                </h2>
                <p className="text-[9px] text-sky-200 mt-0.5">
                  {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                </p>
                <p className="text-[9px] text-sky-200 font-mono">
                  {formatPharmacyLegalInfo(pharmacyProfile)}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-emerald-500 text-slate-950 font-black text-[9px] rounded-full uppercase tracking-wider shrink-0">
              {patient.category || 'Pasien Umum'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-sky-300 font-bold uppercase tracking-wider block">
              Nomor Rekam Medis (No. RM)
            </span>
            <div className="font-mono font-black text-2xl tracking-widest text-white">
              {patient.id}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <span className="text-[9px] text-sky-300 uppercase block font-semibold">Nama Pasien</span>
              <strong className="text-white text-sm block font-bold truncate">{patient.name}</strong>
              <span className="text-[10px] text-sky-200 font-mono">
                {patient.gender} · {patient.age} Tahun
              </span>
            </div>
            <div>
              <span className="text-[9px] text-sky-300 uppercase block font-semibold">NIK Pasien</span>
              <span className="font-mono text-white text-[11px] block">{patient.nik}</span>
              <span className="text-[10px] text-sky-200 font-mono">
                Telp: {patient.phone || '-'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-sky-700/60 flex justify-between items-center text-[9px] text-sky-200">
            <span>Tgl Registrasi: {patient.registrationDate || '2026-01-01'}</span>
            <span className="font-mono italic font-bold">Wajib dibawa saat berobat</span>
          </div>
        </div>
      </div>
    );
  }

  // 7. LAPORAN KEUANGAN & AUDIT MEDIS
  if (mode === 'laporan-keuangan') {
    const tabParam = searchParams.get('tab') || 'fee-medis';
    const startDate = searchParams.get('startDate') || '2026-10-01';
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];
    const salaryModeParam = (searchParams.get('salaryMode') || 'config') as
      | 'config'
      | 'full-month'
      | 'prorata-days';

    let transactions: Transaction[] = INITIAL_TRANSACTIONS;
    let rmeRecords: RMERecord[] = INITIAL_RME_RECORDS;
    let staffList: Staff[] = INITIAL_STAFF;
    let schedules: DutySchedule[] = [];
    try {
      const savedTrx = demoGetItem('latisha_transactions');
      if (savedTrx) transactions = JSON.parse(savedTrx);
      const savedRme = demoGetItem('latisha_rme_records');
      if (savedRme) rmeRecords = JSON.parse(savedRme);
      const savedStaff = demoGetItem('latisha_staff');
      if (savedStaff) staffList = JSON.parse(savedStaff);
      const savedSchedules = demoGetItem('latisha_schedules');
      if (savedSchedules) schedules = JSON.parse(savedSchedules);
    } catch (e) {}

    const filteredTrx = transactions.filter((t) => {
      if (t.status === 'Dibatalkan' || t.status === 'Diretur') return false;
      const d = normalizeTransactionDateToYMD(t.date);
      return (!startDate || d >= startDate) && (!endDate || d <= endDate);
    });

    const totalOmzet = filteredTrx.reduce((acc, t) => acc + t.total, 0);
    const totalHpp = filteredTrx.reduce((acc, t) => acc + t.hppTotal, 0);
    const grossProfit = totalOmzet - totalHpp;

    // Build payroll + fee + Sunday overtime summary when tabParam === 'fee-medis'
    let payrollPrintSummary: ReturnType<typeof buildStaffPayrollSummary> | null = null;
    if (tabParam === 'fee-medis') {
      const deletedTrxIds = getDeletedIdsSet('transactions');
      const deletedLedgerIds = getDeletedIdsSet('fee_ledger');
      const activeNonCancelledTrxIds = new Set(
        transactions
          .filter(
            (t) =>
              t?.id &&
              t.status !== 'Dibatalkan' &&
              t.status !== 'Diretur' &&
              !deletedTrxIds.has(String(t.id).trim())
          )
          .map((t) => String(t.id).trim())
      );
      const feeLedgerEntries = loadLocalFeeLedger();
      const activeLedgerEntries = feeLedgerEntries.filter((e) => {
        if (!e?.id) return false;
        const cleanId = String(e.id).trim();
        const cleanTrxId = String(e.transaction_id || '').trim();
        if (deletedLedgerIds.has(cleanId) || (cleanTrxId && deletedTrxIds.has(cleanTrxId))) {
          return false;
        }
        if (!cleanTrxId || !activeNonCancelledTrxIds.has(cleanTrxId)) return false;
        return (
          e.status_pembayaran !== 'dibatalkan' &&
          (Number(e.total_fee_item) || 0) > 0 &&
          (!startDate || normalizeTransactionDateToYMD(e.transaction_date) >= startDate) &&
          (!endDate || normalizeTransactionDateToYMD(e.transaction_date) <= endDate)
        );
      });
      const activeLedgerTrxIds = new Set(activeLedgerEntries.map((e) => e.transaction_id));

      const filteredRme = rmeRecords.filter((r) => {
        const d = normalizeTransactionDateToYMD(r.date);
        return (!startDate || d >= startDate) && (!endDate || d <= endDate);
      });
      const serviceTrx = filteredTrx.filter(
        (t) =>
          t.type === 'KLINIK' ||
          (t.assignedStaff && t.assignedStaff.length > 0) ||
          (t.items || []).some(
            (it) =>
              isJasaCartItem(it) &&
              Boolean(it.petugas_id) &&
              (Number(it.total_fee_item) || 0) > 0
          ) ||
          activeLedgerTrxIds.has(t.id)
      );
      const matchedTrxIds = new Set<string>();
      const feeMap = new Map<
        string,
        { staffId: string; staffName: string; role: string; patientCount: number; totalFee: number }
      >();

      const addFee = (item: StaffFeeItem) => {
        const key = item.staffId || item.staffName;
        const prev = feeMap.get(key) || {
          staffId: item.staffId,
          staffName: item.staffName,
          role: item.role,
          patientCount: 0,
          totalFee: 0
        };
        prev.patientCount += 1;
        prev.totalFee += item.fee || 0;
        feeMap.set(key, prev);
      };

      filteredRme.forEach((rme) => {
        const matchedTrx = serviceTrx.find(
          (t) =>
            !matchedTrxIds.has(t.id) &&
            ((t.rmId && t.rmId === rme.rmId) ||
              t.customerName.toLowerCase() === rme.patientName.toLowerCase() ||
              (t.description && t.description.includes(rme.id)))
        );
        if (matchedTrx) matchedTrxIds.add(matchedTrx.id);
        const posResolved = matchedTrx
          ? resolveTransactionStaffFees(matchedTrx, feeLedgerEntries, staffList)
          : [];
        const assigned: StaffFeeItem[] =
          posResolved.length > 0
            ? posResolved
            : rme.assignedStaff && rme.assignedStaff.length > 0
            ? rme.assignedStaff
            : [
                {
                  staffId:
                    staffList.find((s) => s.role === 'Dokter' || s.name === rme.doctorName)?.id ||
                    'STF-02',
                  staffName: rme.doctorName || 'dr. Anis Prima Dewi',
                  role: 'Dokter',
                  fee: rme.doctorFee || 20000
                }
              ];
        assigned.forEach(addFee);
      });

      serviceTrx.forEach((trx) => {
        if (matchedTrxIds.has(trx.id)) return;
        matchedTrxIds.add(trx.id);
        const assigned = resolveTransactionStaffFees(trx, feeLedgerEntries, staffList);
        assigned.forEach(addFee);
      });

      // Any orphaned active ledger rows whose transaction isn't in filteredTrx
      activeLedgerEntries.forEach((entry) => {
        if (matchedTrxIds.has(entry.transaction_id)) return;
        addFee({
          staffId: entry.petugas_id,
          staffName: entry.nama_petugas,
          role: entry.role_petugas,
          fee: entry.total_fee_item
        });
      });

      payrollPrintSummary = buildStaffPayrollSummary({
        staffList,
        payrollConfig: loadLocalPayrollConfig(null),
        attendanceRecords: loadLocalAttendanceRecords(),
        schedules,
        staffFeeInputs: Array.from(feeMap.values()),
        startDate,
        endDate,
        salaryModeOverride: salaryModeParam
      });
    }

    return (
      <div className="bg-white min-h-screen text-slate-800 p-6 max-w-4xl mx-auto font-sans text-xs">
        {printStyles}
        {renderFloatingTopBar(
          tabParam === 'fee-medis'
            ? 'Rekap Gaji, Fee, dan Lembur Hari Minggu'
            : 'Laporan Keuangan & Rekapitulasi'
        )}

        <div id="printable-section" className="space-y-6 border border-slate-300 p-8 rounded-2xl bg-white shadow-xs">
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
                <h2 className="font-black text-base text-slate-900 uppercase">
                  {pharmacyProfile.name}
                </h2>
                <p className="text-[11px] text-slate-600">
                  {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                </p>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                  {formatPharmacyLegalInfo(pharmacyProfile)}
                </p>
              </div>
              <div className="w-16 shrink-0" />
            </div>
            <div className="text-center">
              <div className="mt-2 inline-block px-4 py-1 bg-emerald-50 text-emerald-900 rounded-full font-black text-xs uppercase border border-emerald-300">
                {tabParam === 'fee-medis'
                  ? 'REKAPITULASI GAJI, FEE LAYANAN MEDIS, DAN LEMBUR HARI MINGGU'
                  : 'LAPORAN KEUANGAN RESMI & REKAPITULASI PELAYANAN'}
              </div>
              <p className="text-[10px] text-slate-500 font-bold mt-1">
                Periode: {startDate} s.d. {endDate}
              </p>
            </div>
          </div>

          {tabParam === 'fee-medis' && payrollPrintSummary ? (
            <>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block font-bold">Total Gaji & Tunj.</span>
                  <span className="text-sm font-black font-mono text-slate-900 mt-1 block">
                    Rp {payrollPrintSummary.totals.totalSalaryPay.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                  <span className="text-[10px] text-indigo-700 uppercase block font-bold">Total Fee Medis</span>
                  <span className="text-sm font-black font-mono text-indigo-800 mt-1 block">
                    Rp {payrollPrintSummary.totals.totalFeePay.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] text-amber-800 uppercase block font-bold">Total Lembur Minggu</span>
                  <span className="text-sm font-black font-mono text-amber-800 mt-1 block">
                    Rp {payrollPrintSummary.totals.totalOvertimePay.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-300">
                  <span className="text-[10px] text-emerald-800 uppercase block font-bold">Grand Total SDM</span>
                  <span className="text-sm font-black font-mono text-emerald-900 mt-1 block">
                    Rp {payrollPrintSummary.totals.grandTotal.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                  Rincian Gaji, Fee Layanan Medis, dan Lembur Hari Minggu per Pegawai:
                </h3>
                <table className="w-full text-left text-xs border border-collapse">
                  <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-700">
                    <tr>
                      <th className="p-2 border text-center w-8">No</th>
                      <th className="p-2 border">Nama Pegawai & Peran</th>
                      <th className="p-2 border text-center">Absensi</th>
                      <th className="p-2 border text-right">Gaji & Tunjangan</th>
                      <th className="p-2 border text-right">Fee Layanan</th>
                      <th className="p-2 border text-right">Lembur Minggu</th>
                      <th className="p-2 border text-right">Total Diterima</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700 font-medium">
                    {payrollPrintSummary.rows.map((r, i) => (
                      <tr key={r.staffId} className="border-b">
                        <td className="p-2 border text-center font-mono">{i + 1}</td>
                        <td className="p-2 border">
                          <span className="font-bold text-slate-900 block">{r.staffName}</span>
                          <span className="text-[10px] text-slate-500">{r.role}</span>
                        </td>
                        <td className="p-2 border text-center text-[10px]">
                          H:{r.presentDays} · C:{r.leaveDays}
                        </td>
                        <td className="p-2 border text-right font-mono">
                          Rp {r.totalSalaryPay.toLocaleString('id-ID')}
                        </td>
                        <td className="p-2 border text-right font-mono">
                          Rp {r.totalFeePay.toLocaleString('id-ID')}
                          <span className="text-[9px] text-slate-500 block">{r.patientCount} pasien</span>
                        </td>
                        <td className="p-2 border text-right font-mono">
                          Rp {r.totalOvertimePay.toLocaleString('id-ID')}
                          {r.sundayOvertimeSessions > 0 && (
                            <span className="text-[9px] text-slate-500 block">
                              {r.sundayOvertimeSessions} sesi ({formatMinutesDuration(r.totalOvertimeMinutes)})
                            </span>
                          )}
                        </td>
                        <td className="p-2 border text-right font-mono font-black text-emerald-800">
                          Rp {r.grandTotal.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-black border-t-2 border-slate-300">
                      <td colSpan={3} className="p-2 border text-right uppercase text-[10px]">
                        TOTAL KESELURUHAN:
                      </td>
                      <td className="p-2 border text-right font-mono">
                        Rp {payrollPrintSummary.totals.totalSalaryPay.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2 border text-right font-mono">
                        Rp {payrollPrintSummary.totals.totalFeePay.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2 border text-right font-mono">
                        Rp {payrollPrintSummary.totals.totalOvertimePay.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2 border text-right font-mono text-emerald-900">
                        Rp {payrollPrintSummary.totals.grandTotal.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block font-bold">Total Omzet Penjualan</span>
                  <span className="text-base font-black font-mono text-slate-900 mt-1 block">
                    Rp {totalOmzet.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block font-bold">HPP Obat Terjual (COGS)</span>
                  <span className="text-base font-black font-mono text-amber-800 mt-1 block">
                    Rp {totalHpp.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] text-emerald-800 uppercase block font-bold">Laba Kotor (Gross Profit)</span>
                  <span className="text-base font-black font-mono text-emerald-800 mt-1 block">
                    Rp {grossProfit.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                  Daftar Riwayat Transaksi Jalur Kasir & Pasien:
                </h3>
                <table className="w-full text-left text-xs border border-collapse">
                  <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-700">
                    <tr>
                      <th className="p-2 border">No. Transaksi</th>
                      <th className="p-2 border">Tanggal & Waktu</th>
                      <th className="p-2 border">Nama Pelanggan / Pasien</th>
                      <th className="p-2 border">Jalur</th>
                      <th className="p-2 border text-right">Total Transaksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700 font-medium">
                    {filteredTrx.map((t) => (
                      <tr key={t.id} className="border-b">
                        <td className="p-2 border font-mono font-bold text-sky-800">{t.id}</td>
                        <td className="p-2 border font-mono">{t.date}</td>
                        <td className="p-2 border font-bold text-slate-900">{t.customerName}</td>
                        <td className="p-2 border">{t.type}</td>
                        <td className="p-2 border text-right font-mono font-bold">
                          Rp {t.total.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tabParam === 'laba-rugi' || !searchParams.get('tab') ? (
            <div className="grid grid-cols-2 pt-8 text-xs">
              <div />
              <div className="text-center space-y-14">
                <p className="font-semibold text-slate-700">
                  {pharmacyProfile.city}, {new Date().toLocaleDateString('id-ID')}<br />
                  Pimpinan,
                </p>
                <div>
                  <p className="font-extrabold underline text-slate-900">
                    {apjProfile.name || 'apt. Mardin, S.Farm'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 pt-8 text-xs">
              <div className="text-center space-y-12">
                <p className="font-semibold text-slate-700">
                  Mengetahui,<br />
                  Dokter Penanggung Jawab Klinis (DPJ),
                </p>
                <div>
                  <p className="font-extrabold underline text-slate-900">{dpjProfile.name}</p>
                  <p className="text-[10px] text-slate-600 font-mono">SIP: {dpjProfile.sip}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{dpjProfile.idi}</p>
                </div>
              </div>
              <div className="text-center space-y-12">
                <p className="font-semibold text-slate-700">
                  {pharmacyProfile.city}, {new Date().toLocaleDateString('id-ID')}<br />
                  Disahkan oleh Apoteker Penanggung Jawab (APJ),
                </p>
                <div>
                  <p className="font-extrabold underline text-slate-900">{apjProfile.name}</p>
                  <p className="text-[10px] text-slate-600 font-mono">SIPA: {apjProfile.sipa}</p>
                  <p className="text-[10px] text-slate-500 font-mono">STRA: {apjProfile.stra}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 5. RETUR PEMBELIAN (PURCHASE RETURN NOTE)
  if (mode === 'retur-pembelian') {
    const invoiceId = searchParams.get('invoiceId') || '';
    const returId = searchParams.get('returId') || '';
    let returInv: any = null;

    try {
      // Prioritas 1: Sesi cetak retur aktif (latisha_active_print_retur)
      // Membawa state input atau edit terbaru hasil two-way binding dari form secara 100% dinamis
      const savedRetur = demoGetItem('latisha_active_print_retur');
      let parsedActive: any = null;
      if (savedRetur) {
        try {
          parsedActive = JSON.parse(savedRetur);
        } catch (e) {}
      }

      const savedReturns = demoGetItem('latisha_purchase_returns');
      let returnList: any[] = [];
      if (savedReturns) {
        try {
          returnList = JSON.parse(savedReturns);
        } catch (e) {}
      }

      // A. Jika returId ditentukan, utamakan yang memiliki ID cocok
      if (returId) {
        if (parsedActive && (parsedActive.id === returId || parsedActive.returnId === returId)) {
          returInv = parsedActive;
        } else if (returnList.length > 0) {
          const matchInList = returnList.find((r: any) => r.id === returId || r.returnId === returId);
          if (matchInList) {
            returInv = matchInList;
          }
        }
      }

      // B. Jika belum ketemu dan ada parsedActive dari sesi form saat ini, gunakan parsedActive
      if (!returInv && parsedActive && Array.isArray(parsedActive.items) && parsedActive.items.length > 0) {
        returInv = parsedActive;
      }

      // C. Prioritas jika belum ketemu: cari di arsip returnList
      if (!returInv && returnList.length > 0) {
        const matchByInv = returnList.find(
          (r: any) =>
            (invoiceId && (r.invoiceId === invoiceId || r.invoiceNo === invoiceId || r.id === invoiceId)) ||
            (returId && (r.id === returId || r.returnId === returId))
        );
        if (matchByInv) {
          returInv = matchByInv;
        }
      }

      // D. Prioritas terakhir: arsip faktur pembelian (latisha_purchase_invoices) jika cetak awal
      if (!returInv && invoiceId) {
        const savedInvoices = demoGetItem('latisha_purchase_invoices');
        if (savedInvoices) {
          const invList = JSON.parse(savedInvoices);
          const foundInv = invList.find((i: any) => i.id === invoiceId || i.invoiceNo === invoiceId) || invList[0] || null;
          if (foundInv) {
            returInv = foundInv;
          }
        }
      }
    } catch (e) {
      console.error('Error loading print retur data:', e);
    }

    if (!returInv) {
      returInv = {
        id: 'RET-SAMPLE',
        pbfName: 'PT Kimia Farma Trading & Distribution',
        invoiceNo: 'FP/2026/001',
        date: new Date().toISOString().split('T')[0],
        dueDate: new Date().toISOString().split('T')[0],
        salesman: 'Budi Santoso',
        term: '30 Hari',
        usePpn: true,
        items: [
          { medicineId: 'OBT-001', name: 'Paracetamol 500mg Tablet', qty: 10, unit: 'Box', batchNo: 'B260101', expDate: '2028-12-31', price: 50000, disc: 0, subtotal: 500000, reason: '', alasan: '' }
        ],
        grossDpp: 500000,
        totalDiscountAmount: 0,
        dpp: 500000,
        ppn: 55000,
        totalTagihan: 555000,
        status: 'Belum Lunas',
        branchId: 'BR-01'
      };
    }

    const todayStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const totalRetur = (returInv.items || []).reduce((acc: number, it: any) => acc + (it.subtotal || (it.qty * it.price) || 0), 0);

    return (
      <div className="bg-white min-h-screen text-slate-800 p-6 max-w-4xl mx-auto font-sans text-xs">
        {printStyles}
        {renderFloatingTopBar('Surat Retur Pembelian / Pengembalian Barang')}

        <div
          id="printable-section"
          className="space-y-4 border-2 border-slate-900 p-8 rounded-2xl bg-white shadow-xs text-xs leading-relaxed"
        >
          {/* KOP APOTEK TERINTEGRASI PROFIL APOTEK & APJ */}
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
              <div className="flex-1 text-center">
                <h2 className="font-black text-xl text-slate-900 uppercase tracking-wide">
                  {pharmacyProfile.name}
                </h2>
                <p className="text-[11px] text-slate-800 font-medium">
                  {pharmacyFullAddress}
                </p>
                <p className="text-[10px] text-slate-600">
                  Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                </p>
                <p className="text-[10px] text-slate-600 font-mono">
                  {formatPharmacyLegalInfo(pharmacyProfile)}
                </p>
              </div>
              <div className="w-16 shrink-0" />
            </div>
            <div className="text-center">
              <div className="mt-3 inline-block px-5 py-1 bg-rose-700 text-white rounded-md font-black text-xs uppercase tracking-wider">
                NOTA / SURAT RETUR PEMBELIAN BARANG KE PBF
              </div>
            </div>
          </div>

          {/* Info Faktur Asal & PBF */}
          <div className="grid grid-cols-2 gap-4 py-2 border-b border-slate-300 text-xs">
            <div>
              <p className="text-slate-600 font-bold uppercase text-[10px]">FAKTUR ASAL PBF:</p>
              <p className="font-mono font-black text-slate-900 text-sm mt-0.5">
                No. Faktur: {returInv.invoiceNo}
              </p>
              {(returInv.returnId || (returInv.id && String(returInv.id).startsWith('RET-'))) && (
                <p className="text-rose-700 font-mono font-extrabold text-xs mt-0.5">
                  No. Dokumen Retur: {returInv.returnId || returInv.id}
                </p>
              )}
              <p className="text-slate-600 mt-1 font-medium">Tanggal Faktur: {returInv.date}</p>
              <p className="text-slate-600 font-medium">Tanggal Cetak Retur: {todayStr}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-600 font-bold uppercase text-[10px]">DIKEMBALIKAN KEPADA PBF:</p>
              <p className="font-black text-slate-900 text-sm mt-0.5">{returInv.pbfName}</p>
              <p className="text-slate-600 text-[11px]">Salesman: {returInv.salesman || '-'}</p>
              {returInv.petugas && (
                <p className="text-slate-500 text-[10px] mt-0.5">Petugas Apotek: {returInv.petugas}</p>
              )}
            </div>
          </div>

          <p className="text-slate-800 font-medium">
            Bersama surat ini, pihak <strong>{pharmacyProfile.name}</strong> secara resmi mengajukan pengembalian (retur) barang/sediaan farmasi dengan rincian dan alasan retur sebagai berikut:
          </p>

          {/* Tabel Item Retur */}
          <table className="w-full text-left text-xs border border-collapse border-slate-400">
            <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-900 border-b border-slate-400">
              <tr>
                <th className="p-2 border border-slate-400 text-center w-8">No</th>
                <th className="p-2 border border-slate-400">Nama Obat / Sediaan</th>
                <th className="p-2 border border-slate-400 text-center w-28">No. Batch & ED</th>
                <th className="p-2 border border-slate-400 text-center w-24">Jumlah Retur</th>
                <th className="p-2 border border-slate-400 text-right">Harga Satuan</th>
                <th className="p-2 border border-slate-400 text-right">Subtotal Retur</th>
                <th className="p-2 border border-slate-400">Alasan Retur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-medium text-slate-900">
              {(returInv.items || []).map((it: any, idx: number) => {
                // Ekstraksi nilai string alasan retur secara akurat dan bersih tanpa nilai default statis
                const rawReason = (it.reason && String(it.reason).trim() !== '') ? it.reason
                  : (it.alasan && String(it.alasan).trim() !== '') ? it.alasan
                  : (it.alasanRetur && String(it.alasanRetur).trim() !== '') ? it.alasanRetur
                  : (it.notes && String(it.notes).trim() !== '') ? it.notes
                  : (it.keterangan && String(it.keterangan).trim() !== '') ? it.keterangan
                  : (returInv.reason ?? returInv.alasan ?? returInv.alasanRetur ?? returInv.notes ?? '');
                const finalReason = typeof rawReason === 'string' ? rawReason.trim() : String(rawReason || '').trim();

                return (
                  <tr key={idx} className="border-b border-slate-300">
                    <td className="p-2 border border-slate-400 text-center font-mono">{idx + 1}</td>
                    <td className="p-2 border border-slate-400 font-bold text-slate-900">{it.name}</td>
                    <td className="p-2 border border-slate-400 text-center font-mono text-[10px]">
                      <div>{it.batchNo || '-'}</div>
                      <div className="text-slate-500">ED: {it.expDate || '-'}</div>
                    </td>
                    <td className="p-2 border border-slate-400 text-center font-mono font-black text-rose-700">
                      {it.qty} {it.unit}
                    </td>
                    <td className="p-2 border border-slate-400 text-right font-mono">
                      Rp {Number(it.price || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="p-2 border border-slate-400 text-right font-mono font-bold">
                      Rp {Number(it.subtotal || (it.qty * it.price) || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="p-2 border border-slate-400 text-[11px] text-slate-900">
                      {finalReason !== '' ? (
                        <span className="font-bold text-slate-950">{finalReason}</span>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t-2 border-slate-400 text-slate-900">
                <td colSpan={5} className="p-2 border border-slate-400 text-right uppercase text-[10px]">
                  Total Nilai Barang Retur:
                </td>
                <td className="p-2 border border-slate-400 text-right font-mono font-black text-rose-700 text-sm">
                  Rp {totalRetur.toLocaleString('id-ID')}
                </td>
                <td className="p-2 border border-slate-400 bg-slate-50"></td>
              </tr>
            </tfoot>
          </table>

          {/* Tanda Tangan */}
          <div className="grid grid-cols-2 pt-8 text-xs">
            <div className="text-center space-y-12">
              <p className="font-bold text-slate-800">
                Disetujui Oleh (Sales / PBF),
              </p>
              <div>
                <p className="font-bold border-b border-slate-400 pb-1 text-slate-900">( ........................................ )</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Nama & Stempel PBF</p>
              </div>
            </div>

            <div className="text-center space-y-12">
              <p className="font-bold text-slate-800">
                {pharmacyProfile.city}, {todayStr}<br />
                Hormat Kami, Apoteker Penanggung Jawab (APJ),
              </p>
              <div>
                <p className="font-black underline text-slate-900 text-sm">{apjProfile.name}</p>
                <p className="text-[10px] text-slate-700 font-mono">SIPA: {apjProfile.sipa}</p>
                <p className="text-[10px] text-slate-500 font-mono">STRA: {apjProfile.stra}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MODE 9: DOKUMEN RESMI TELAAH DRPs (CDSS APOTEKER)
  // ==========================================
  if (mode === 'telaah-drp') {
    let drpPayload: any = null;
    try {
      const raw = sessionStorage.getItem('latisha_active_print_drp') || demoGetItem('latisha_active_print_drp');
      if (raw) {
        drpPayload = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Error reading active print DRP:', e);
    }

    const rx = drpPayload?.rx;
    const patient = drpPayload?.patient;
    const rme = drpPayload?.rme;
    const drpData = drpPayload?.data;

    return (
      <div className="min-h-screen bg-slate-100 p-4 sm:p-8 flex flex-col items-center">
        {printStyles}
        <div className="w-full max-w-4xl">
          {renderFloatingTopBar('Lembar Hasil Telaah DRPs & Rekomendasi Apoteker (CDSS)')}
        </div>

        <div
          id="printable-section"
          className="bg-white w-full max-w-4xl p-8 rounded-3xl shadow-xl border border-slate-300 text-slate-800 space-y-6"
        >
          {/* Header Kop Apotek Terintegrasi Profil Apotek & APJ */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-center gap-4">
            <div className="flex items-center gap-3.5">
              {pharmacyProfile.logoUrl && (
                <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                  <img
                    src={pharmacyProfile.logoUrl}
                    alt="Logo Faskes"
                    className="w-14 h-14 object-contain"
                  />
                </div>
              )}
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  {pharmacyProfile.name}
                </h1>
                <p className="text-xs text-slate-600">
                  {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                </p>
                <p className="text-xs text-slate-600 font-mono font-medium">
                  {formatPharmacyLegalInfo(pharmacyProfile)}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="px-3 py-1 bg-sky-50 border border-sky-200 text-sky-900 text-xs font-black rounded-lg inline-block uppercase">
                {drpData?.interactionResult ? 'Interaction Checker' : 'CDSS Clinical Pharmacy'}
              </span>
              <p className="text-[11px] text-slate-500 font-mono mt-1">
                Waktu Telaah: {new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}
              </p>
            </div>
          </div>

          <div className="text-center pt-1">
            <h2 className="text-base font-black uppercase tracking-wider text-slate-900">
              {drpData?.interactionResult
                ? 'Lembar Hasil Interaction Checker (Database interaksi_obat)'
                : 'Lembar Telaah Drug-Related Problems (DRPs) & Keputusan Klinis Apoteker'}
            </h2>
            <p className="text-xs text-slate-500">
              {drpData?.interactionResult
                ? 'Pencocokan langsung pasangan obat terhadap tabel interaksi_obat (minor, moderate, major, contraindicated)'
                : 'Berdasarkan Standar BNF 86, Lexicomp, Pedoman Praktik Klinis Kemenkes RI, dan Rekam Medis Elektronik (RME)'}
            </p>
          </div>

          {/* Profil Pasien & Resep */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-500 font-bold block uppercase">No. E-Resep</span>
              <span className="font-mono font-black text-slate-900 text-sm">{rx?.id || searchParams.get('rxId') || '-'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Nama Pasien</span>
              <span className="font-black text-slate-900 text-sm">{patient?.name || rx?.patientName || '-'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold block uppercase">No. RM / Usia</span>
              <span className="font-bold text-slate-900">{patient?.rmId || rx?.rmId || '-'} ({patient?.age || '-'} th)</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Dokter Peresep</span>
              <span className="font-bold text-slate-900">{rx?.doctorName || dpjProfile.name}</span>
            </div>

            <div className="col-span-2">
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Diagnosa ICD-10 (RME)</span>
              <span className="font-bold text-slate-900">
                {rme?.icdName ? `${rme.icdCode} - ${rme.icdName}` : (rme?.soapA || 'Infeksi Saluran Napas')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Tanda Vital RME</span>
              <span className="font-mono font-bold text-slate-900">
                TD: {rme?.vitalSign?.td || '120/80'} | S: {rme?.vitalSign?.suhu || '36.5'}°C
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Riwayat Alergi</span>
              <span className="font-bold text-rose-700">
                {patient?.allergy || 'Tidak ada riwayat'}
              </span>
            </div>
          </div>

          {/* Banner Tingkat Risiko */}
          <div
            className={`p-3.5 rounded-2xl border-2 text-xs flex justify-between items-center ${
              drpData?.riskLevel === 'CRITICAL'
                ? 'bg-rose-50 border-rose-400 text-rose-950'
                : drpData?.riskLevel === 'MODERATE'
                ? 'bg-amber-50 border-amber-400 text-amber-950'
                : 'bg-emerald-50 border-emerald-400 text-emerald-950'
            }`}
          >
            <div>
              <span className="font-black uppercase tracking-wider block text-[11px]">
                Status Telaah Risiko Klinis: {drpData?.riskLevel || 'EVALUASI'}
              </span>
              <p className="font-medium mt-0.5">{drpData?.summary || '-'}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-xl text-xs font-black uppercase text-white shrink-0 ml-4 ${
                drpData?.riskLevel === 'CRITICAL'
                  ? 'bg-rose-600'
                  : drpData?.riskLevel === 'MODERATE'
                  ? 'bg-amber-600'
                  : 'bg-emerald-600'
              }`}
            >
              {drpData?.riskLevel === 'CRITICAL' ? 'BAHAYA KRITIS' : drpData?.riskLevel === 'MODERATE' ? 'PERHATIAN / MODERATE' : 'AMAN'}
            </span>
          </div>

          {/* Resep Obat */}
          <div className="space-y-2">
            <h3 className="font-black text-slate-900 text-xs uppercase tracking-wide">
              1. Daftar Obat yang Diresepkan:
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-300">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[10px]">
                  <tr>
                    <th className="p-2 border-b">No</th>
                    <th className="p-2 border-b">Nama Obat</th>
                    <th className="p-2 border-b">Jumlah</th>
                    <th className="p-2 border-b">Aturan Pakai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rx?.items?.map((it: any, idx: number) => (
                    <tr key={idx}>
                      <td className="p-2 font-mono">{idx + 1}</td>
                      <td className="p-2 font-bold text-slate-900">{it.name}</td>
                      <td className="p-2 font-mono">{it.qty} {it.unit}</td>
                      <td className="p-2 font-medium">{it.dosage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabel Terstruktur Temuan DRPs & Literatur Standar */}
          <div className="space-y-2">
            <h3 className="font-black text-slate-900 text-xs uppercase tracking-wide">
              2. Temuan Drug-Related Problems (DRPs) & Rujukan Literatur Standar:
            </h3>
            {drpData?.identifiedDRPs && drpData.identifiedDRPs.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-300">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[10px]">
                    <tr>
                      <th className="p-2 border-b">Obat Bermasalah</th>
                      <th className="p-2 border-b">Kategori DRP</th>
                      <th className="p-2 border-b text-center">Tingkat</th>
                      <th className="p-2 border-b">Penjelasan Klinis & Mekanisme</th>
                      <th className="p-2 border-b">Rekomendasi Apoteker</th>
                      <th className="p-2 border-b">Literatur Acuan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {drpData.identifiedDRPs.map((drp: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 font-bold text-slate-900 align-top">{drp.drugName}</td>
                        <td className="p-2 align-top">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 border text-slate-800">
                            {drp.category}
                          </span>
                        </td>
                        <td className="p-2 text-center align-top">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase text-white ${
                              drp.severity === 'Kritis' ? 'bg-rose-600' : 'bg-amber-600'
                            }`}
                          >
                            {drp.severity}
                          </span>
                        </td>
                        <td className="p-2 text-slate-700 align-top leading-relaxed">{drp.clinicalExplanation}</td>
                        <td className="p-2 text-slate-900 font-semibold align-top leading-relaxed">{drp.recommendation}</td>
                        <td className="p-2 text-indigo-900 font-mono text-[10px] align-top space-y-1">
                          <div className="font-semibold">{drp.literatureReference}</div>
                          {drp.referenceUrl && (
                            <div className="text-[9px] text-slate-500 break-all underline">
                              Tautan: {drp.referenceUrl}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-bold">
                ✓ Tidak ditemukan masalah DRPs bermakna. Seluruh peresepan rasional menurut BNF dan Formularium Nasional.
              </div>
            )}
          </div>

          {/* Rekomendasi Apoteker */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-300 space-y-1.5 text-xs">
            <h4 className="font-black text-slate-900 uppercase text-[11px]">
              3. Poin Konsultasi Apoteker ke Dokter Peresep:
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-800 font-medium">
              {drpData?.pharmacistRecommendations?.map((rec: string, idx: number) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>

          {/* Tanda Tangan Pengesahan Terintegrasi DPJ & APJ */}
          <div className="grid grid-cols-2 pt-8 text-xs">
            <div className="text-center space-y-12">
              <p className="font-bold text-slate-800">
                Dokter Penulis Resep (DPJ),
              </p>
              <div>
                <p className="font-bold border-b border-slate-400 pb-1 text-slate-900">
                  {rx?.doctorName || dpjProfile.name}
                </p>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5">SIP: {dpjProfile.sip}</p>
                <p className="text-[10px] text-slate-500 font-mono">{dpjProfile.idi}</p>
              </div>
            </div>

            <div className="text-center space-y-12">
              <p className="font-bold text-slate-800">
                {pharmacyProfile.city}, {new Date().toLocaleDateString('id-ID')}<br />
                Apoteker Penelaah Resep (APJ),
              </p>
              <div>
                <p className="font-black underline text-slate-900 text-sm">{apjProfile.name}</p>
                <p className="text-[10px] text-slate-700 font-mono">SIPA: {apjProfile.sipa}</p>
                <p className="text-[10px] text-slate-500 font-mono">STRA: {apjProfile.stra}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MODE 10: LAPORAN MEDIS & MORBIDITAS ICD-10 (DOKUMEN RESMI DPJ)
  // ==========================================
  if (mode === 'laporan-morbiditas') {
    const reportType = (searchParams.get('reportType') || 'KUNJUNGAN') as 'KUNJUNGAN' | 'KASUS';
    const startDate = searchParams.get('startDate') || '2026-10-01';
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];

    let rmeRecords: RMERecord[] = INITIAL_RME_RECORDS;
    try {
      const savedRme = demoGetItem('latisha_rme_records');
      if (savedRme) rmeRecords = JSON.parse(savedRme);
    } catch (e) {}

    const filteredRecords = rmeRecords.filter((ex) => {
      const matchDate = (!startDate || ex.date >= startDate) && (!endDate || ex.date <= endDate);
      return matchDate;
    });

    return (
      <div className="bg-white min-h-screen text-slate-800 p-6 max-w-4xl mx-auto font-sans text-xs">
        {printStyles}
        {renderFloatingTopBar('Laporan Medis & Morbiditas ICD-10')}

        <div id="printable-section" className="space-y-6 border border-slate-300 p-8 rounded-2xl bg-white shadow-xs">
          {/* Kop Surat Terintegrasi Profil Apotek, APJ, dan DPJ */}
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
                <h2 className="font-black text-base text-slate-900 uppercase tracking-wider">
                  {pharmacyProfile.name}
                </h2>
                <p className="text-[11px] text-slate-700 font-medium mt-0.5">
                  {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                </p>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5 flex flex-wrap justify-center gap-x-2">
                  {pharmacyProfile.sia && <span>SIA: <strong>{pharmacyProfile.sia}</strong></span>}
                  {pharmacyProfile.nib && <span>· NIB: <strong>{pharmacyProfile.nib}</strong></span>}
                  {pharmacyProfile.npwp && <span>· NPWP: <strong>{pharmacyProfile.npwp}</strong></span>}
                </p>
              </div>
              <div className="w-16 shrink-0" />
            </div>
            <div className="text-center">
              <div className="mt-3 inline-block px-4 py-1 bg-sky-100 text-sky-900 rounded-full font-black text-xs uppercase border border-sky-200">
                {reportType === 'KUNJUNGAN' && 'LAPORAN REKAPITULASI KUNJUNGAN PASIEN'}
                {reportType === 'KASUS' && 'LAPORAN DISTRIBUSI KASUS & DIAGNOSA (ICD-10)'}
              </div>
              <p className="text-[10px] text-slate-500 font-bold mt-1">
                Periode Evaluasi: {startDate} s.d. {endDate}
              </p>
            </div>
          </div>

          {/* Profil DPJ pada Laporan Medis */}
          <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 flex justify-between items-center text-xs">
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-800 block">
                Dokter Penanggung Jawab (DPJ) Layanan Medis
              </span>
              <strong className="text-slate-900">{dpjProfile.name}</strong> ({dpjProfile.specialization})
              <span className="block font-mono text-[10px] text-slate-600">
                SIP: {dpjProfile.sip} · {dpjProfile.idi} · Telp: {dpjProfile.phone}
              </span>
            </div>
          </div>

          <table className="w-full text-left text-xs border border-collapse">
            <thead className="bg-slate-100 font-bold text-[10px] uppercase text-slate-700">
              <tr>
                <th className="p-2 border text-center w-10">No</th>
                <th className="p-2 border w-24">Tanggal</th>
                <th className="p-2 border w-24">No. RM</th>
                <th className="p-2 border">Nama Pasien</th>
                <th className="p-2 border text-center w-20">Usia</th>
                <th className="p-2 border">Diagnosa ICD-10</th>
                <th className="p-2 border">Terapi / Obat</th>
                <th className="p-2 border w-32">Dokter Pemeriksa</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700 font-medium">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400 italic">
                    Tidak ada data rekam medis pada periode ini.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item, idx) => (
                  <tr key={item.id} className="border-b">
                    <td className="p-2 border text-center font-mono">{idx + 1}</td>
                    <td className="p-2 border font-mono">{item.date}</td>
                    <td className="p-2 border font-mono font-bold text-sky-700">{item.rmId}</td>
                    <td className="p-2 border font-bold text-slate-900">{item.patientName}</td>
                    <td className="p-2 border text-center">{item.age} thn</td>
                    <td className="p-2 border font-semibold">{item.soapA}</td>
                    <td className="p-2 border text-[11px]">
                      {item.prescription?.map((p) => `${p.name} (${p.qty} ${p.unit})`).join(', ') || '-'}
                    </td>
                    <td className="p-2 border">{item.doctorName || dpjProfile.name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex justify-end pt-8 text-xs">
            <div className="w-1/2 text-center space-y-12">
              <p className="font-semibold text-slate-700">
                {pharmacyProfile.city}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br />
                Dokter Penanggung Jawab Klinis (DPJ),
              </p>
              <div>
                <p className="font-extrabold underline text-slate-900">{dpjProfile.name}</p>
                <p className="text-[10px] text-slate-600 font-mono">SIP: {dpjProfile.sip}</p>
                <p className="text-[10px] text-slate-500 font-mono">{dpjProfile.idi}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 11. HASIL PEMERIKSAAN LABORATORIUM SEDERHANA (POCT)
  if (mode === 'hasil-lab') {
    let labRecord: any = null;
    try {
      const savedActive = demoGetItem('latisha_active_print_lab');
      if (savedActive) {
        labRecord = JSON.parse(savedActive);
      }
      if (!labRecord) {
        const labId = searchParams.get('labId');
        const savedList = demoGetItem('latisha_lab_records');
        if (savedList && labId) {
          const list = JSON.parse(savedList);
          labRecord = list.find((r: any) => r.id === labId);
        }
      }
    } catch {}

    return (
      <div className="p-8 bg-white min-h-screen text-slate-900 font-sans max-w-3xl mx-auto">
        {printStyles}
        {renderFloatingTopBar('Lembar Hasil Pemeriksaan Laboratorium Resmi')}

        <div id="printable-section" className="p-8 bg-white border border-slate-300 rounded-2xl space-y-5 text-xs text-slate-900 shadow-xs">
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
                <p className="text-[11px] text-slate-700 font-medium">
                  {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                </p>
                <p className="text-[10px] text-slate-600 font-mono">
                  {formatPharmacyLegalInfo(pharmacyProfile)}
                </p>
              </div>
              <div className="w-16 shrink-0" />
            </div>
          </div>

          <div className="text-center space-y-0.5 pt-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 underline">
              SURAT HASIL PEMERIKSAAN LABORATORIUM SEDERHANA (POCT)
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              No. Registrasi Lab: {labRecord?.id || '-'}
            </span>
          </div>

          {labRecord ? (
            <>
              <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px]">
                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-24 text-slate-500">Nama Pasien</span>
                    <strong className="text-slate-900">: {labRecord.patientName}</strong>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-slate-500">No. RM</span>
                    <span className="font-mono font-bold">: {labRecord.rmId}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-slate-500">Usia / Gender</span>
                    <span>: {labRecord.age} th / {labRecord.gender}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-28 text-slate-500">Tanggal Periksa</span>
                    <span className="font-mono">: {labRecord.date} ({labRecord.time} WIB)</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-slate-500">Dokter Pengirim</span>
                    <span>: {labRecord.doctorName || dpjProfile.name}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-slate-500">Petugas Analis</span>
                    <span>: {labRecord.analystName}</span>
                  </div>
                </div>
              </div>

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
                    {(labRecord.items || []).map((it: any, idx: number) => {
                      const isHigh = it.status === 'Tinggi' || it.status === 'Kritis';
                      const isLow = it.status === 'Rendah';
                      return (
                        <tr key={idx}>
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

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-extrabold text-slate-800 text-[10px] uppercase block">
                  Kesimpulan / Catatan Laboratorium:
                </span>
                <p className="text-slate-700 text-xs italic leading-relaxed">
                  "{labRecord.conclusion || 'Hasil pemeriksaan dalam batas normal.'}"
                </p>
              </div>

              <div className="grid grid-cols-2 pt-6 text-center text-xs">
                <div>
                  <span className="text-slate-500 block mb-12">Petugas Pemeriksa / Analis,</span>
                  <strong className="text-slate-900 underline block">{labRecord.analystName}</strong>
                  <span className="text-[10px] text-slate-400">Petugas Laboratorium</span>
                </div>

                <div>
                  <span className="text-slate-500 block mb-12">
                    {pharmacyProfile.city}, {labRecord.date}<br />
                    Dokter Pemeriksa / Penanggung Jawab (DPJ),
                  </span>
                  <strong className="text-slate-900 underline block">
                    {labRecord.doctorName || dpjProfile.name}
                  </strong>
                  <span className="text-[10px] text-slate-600 font-mono block">
                    SIP: {dpjProfile.sip}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {dpjProfile.idi}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-slate-400 italic">
              Data hasil laboratorium tidak ditemukan.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // MODE 11: LEMBAR SALINAN RESEP & HASIL SKRINING RESEP APOTEKER
  // ==========================================
  if (mode === 'skrining-resep') {
    let skriningPayload: any = null;
    try {
      const raw =
        sessionStorage.getItem('latisha_active_print_skrining') ||
        demoGetItem('latisha_active_print_skrining');
      if (raw) {
        skriningPayload = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Error reading active print skrining resep:', e);
    }

    const rx = skriningPayload?.rx || skriningPayload || {};
    const patient = skriningPayload?.patient;
    const extMeta = rx?.screeningChecks?.externalMeta;
    const isExtRx = Boolean(rx?.isExternalRx || extMeta?.isExternalRx || String(rx?.id || '').startsWith('RXL-'));
    const resolvedOriginFacility = rx?.originFacility || extMeta?.originFacility || '';
    const resolvedPatientAge =
      rx?.patientAge !== undefined && rx?.patientAge !== ''
        ? rx.patientAge
        : extMeta?.patientAge !== undefined && extMeta?.patientAge !== ''
        ? extMeta.patientAge
        : patient?.age || '-';
    const resolvedPatientAddress =
      rx?.patientAddress || extMeta?.patientAddress || patient?.address || '-';
    const checks = rx?.screeningChecks || {
      admin: { namaDokter: true, sip: true, tglResep: true, paraf: true },
      farmasetik: { bentukSediaan: true, dosis: true, stabilitas: true, kompatibilitas: true },
      klinis: { tepatDosis: true, tepatWaktu: true, kontraIndikasi: true, interaksi: true, duplikasi: true }
    };

    return (
      <div className="min-h-screen bg-slate-100 p-4 sm:p-8 flex flex-col items-center">
        {printStyles}
        <div className="w-full max-w-3xl">
          {renderFloatingTopBar(
            isExtRx
              ? 'Salinan Resep Luar (Apograph) & Hasil Skrining Apoteker'
              : 'Salinan Resep & Lembar Hasil Skrining Resep Apoteker'
          )}
        </div>

        <div
          id="printable-section"
          className="bg-white w-full max-w-3xl p-8 rounded-3xl shadow-xl border border-slate-300 text-slate-800 space-y-5"
        >
          {/* Kop Apotek Resmi */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-center gap-4">
            <div className="flex items-center gap-3.5">
              {pharmacyProfile.logoUrl && (
                <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                  <img
                    src={pharmacyProfile.logoUrl}
                    alt="Logo Faskes"
                    className="w-14 h-14 object-contain"
                  />
                </div>
              )}
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  {pharmacyProfile.name}
                </h1>
                <p className="text-xs text-slate-600">
                  {pharmacyFullAddress} · Telp: {pharmacyProfile.phone} · Email: {pharmacyProfile.email}
                </p>
                <p className="text-xs text-slate-600 font-mono font-medium">
                  {formatPharmacyLegalInfo(pharmacyProfile)}
                </p>
                <p className="text-[11px] text-slate-700 font-semibold mt-0.5">
                  Apoteker Penanggung Jawab (APJ): {apjProfile.name} (SIPA: {apjProfile.sipa})
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span
                className={`px-3 py-1 border text-xs font-black rounded-lg inline-block uppercase ${
                  isExtRx
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                    : 'bg-sky-50 border-sky-200 text-sky-900'
                }`}
              >
                {isExtRx ? 'Resep Dokter Luar (Rx Luar)' : 'Salinan & Skrining E-Resep'}
              </span>
              <p className="text-[11px] text-slate-500 font-mono mt-1">
                No. Resep: <strong>{rx?.id || searchParams.get('rxId') || '-'}</strong>
              </p>
            </div>
          </div>

          {/* Judul Dokumen */}
          <div className="text-center">
            <h2 className="text-base font-black uppercase tracking-widest text-slate-900 underline">
              SALINAN RESEP (APOGRAPH) &amp; HASIL SKRINING APOTEKER
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Berdasarkan Permenkes RI No. 73 Tahun 2016 tentang Standar Pelayanan Kefarmasian di Apotek
            </p>
          </div>

          {/* Informasi Dokter & Pasien */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-300 text-xs">
            <div className="space-y-1.5">
              <div className="flex">
                <span className="w-32 text-slate-500 font-semibold">No. Resep</span>
                <span className="font-mono font-black text-slate-900">: {rx?.id || '-'}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-500 font-semibold">Tanggal Resep</span>
                <span className="font-mono text-slate-800">: {rx?.timestamp || '-'}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-500 font-semibold">Dokter Peresep</span>
                <span className="font-bold text-slate-900">: {rx?.doctorName || '-'}</span>
              </div>
              {resolvedOriginFacility && (
                <div className="flex">
                  <span className="w-32 text-slate-500 font-semibold">Instansi / RS Asal</span>
                  <span className="font-semibold text-slate-800">: {resolvedOriginFacility}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex">
                <span className="w-28 text-slate-500 font-semibold">Nama Pasien</span>
                <span className="font-black text-slate-900">: {rx?.patientName || '-'}</span>
              </div>
              <div className="flex">
                <span className="w-28 text-slate-500 font-semibold">Umur / No. RM</span>
                <span className="font-semibold text-slate-800">
                  : {resolvedPatientAge} Tahun {rx?.rmId ? `(RM: ${rx.rmId})` : ''}
                </span>
              </div>
              <div className="flex">
                <span className="w-28 text-slate-500 font-semibold">Alamat Pasien</span>
                <span className="text-slate-800">: {resolvedPatientAddress}</span>
              </div>
              <div className="flex">
                <span className="w-28 text-slate-500 font-semibold">Status Skrining</span>
                <span className="font-bold text-emerald-800">: {rx?.status || 'Lolos Skrining'}</span>
              </div>
            </div>
          </div>

          {/* Daftar Obat (R/) */}
          <div className="border-2 border-slate-800 rounded-2xl p-4 space-y-3 bg-white">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="font-serif italic font-black text-lg text-slate-900">R /</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Daftar Obat &amp; Signatura ({Array.isArray(rx?.items) ? rx.items.length : 0} Item)
              </span>
            </div>

            <div className="divide-y divide-dashed divide-slate-300">
              {(rx?.items || []).map((it: any, idx: number) => (
                <div key={idx} className="py-2.5 flex justify-between items-start gap-4 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-black text-slate-900 text-sm">
                      R/ {it.name}{' '}
                      <span className="font-mono font-bold text-slate-700">
                        No. {it.qty} ({it.unit || 'Tab'})
                      </span>
                    </div>
                    <div className="pl-5 text-slate-700 font-semibold italic">
                      ∫ {it.dosage || 'Sesuai petunjuk dokter / apoteker'}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 shrink-0">
                    det / orig
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Ceklis Skrining Standar Apoteker */}
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div className="p-3 rounded-xl border border-slate-300 bg-slate-50 space-y-1">
              <strong className="uppercase text-[10px] text-slate-700 block border-b border-slate-200 pb-1">
                1. Skrining Administratif
              </strong>
              <div>[{checks.admin?.namaDokter ? '✓' : '×'}] Nama &amp; Identitas Dokter</div>
              <div>[{checks.admin?.sip ? '✓' : '×'}] SIP / Asal Faskes</div>
              <div>[{checks.admin?.tglResep ? '✓' : '×'}] Tanggal Penulisan Resep</div>
              <div>[{checks.admin?.paraf ? '✓' : '×'}] Paraf / Validitas Resep</div>
            </div>
            <div className="p-3 rounded-xl border border-slate-300 bg-slate-50 space-y-1">
              <strong className="uppercase text-[10px] text-slate-700 block border-b border-slate-200 pb-1">
                2. Skrining Farmasetik
              </strong>
              <div>[{checks.farmasetik?.bentukSediaan ? '✓' : '×'}] Bentuk &amp; Kekuatan Sediaan</div>
              <div>[{checks.farmasetik?.dosis ? '✓' : '×'}] Dosis &amp; Jumlah Obat</div>
              <div>[{checks.farmasetik?.stabilitas ? '✓' : '×'}] Stabilitas &amp; Ketersediaan</div>
              <div>[{checks.farmasetik?.kompatibilitas ? '✓' : '×'}] Kompatibilitas</div>
            </div>
            <div className="p-3 rounded-xl border border-slate-300 bg-slate-50 space-y-1">
              <strong className="uppercase text-[10px] text-slate-700 block border-b border-slate-200 pb-1">
                3. Pertimbangan Klinis
              </strong>
              <div>[{checks.klinis?.tepatDosis ? '✓' : '×'}] Ketepatan Indikasi &amp; Dosis</div>
              <div>[{checks.klinis?.tepatWaktu ? '✓' : '×'}] Aturan &amp; Cara Penggunaan</div>
              <div>[{checks.klinis?.interaksi ? '✓' : '!'}] Bebas Interaksi Obat</div>
              <div>[{checks.klinis?.kontraIndikasi ? '✓' : '!'}] Bebas Kontraindikasi</div>
            </div>
          </div>

          {/* Catatan Skrining & Hasil Interaction Checker */}
          <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-2xl space-y-1 text-xs">
            <span className="font-black text-slate-800 text-[10px] uppercase tracking-wider block">
              Catatan Skrining Klinis &amp; Hasil Interaction Checker (interaksi_obat):
            </span>
            <p className="text-slate-800 whitespace-pre-line leading-relaxed font-medium">
              {rx?.screeningNotes || 'Memenuhi standar administratif, farmasetik & klinis.'}
            </p>
          </div>

          {/* Tanda Tangan PCC & Apoteker */}
          <div className="grid grid-cols-2 pt-4 text-center text-xs">
            <div>
              <span className="text-slate-500 block mb-12">Penerima Obat / Pasien,</span>
              <strong className="text-slate-900 underline block">{rx?.patientName || '....................'}</strong>
              <span className="text-[10px] text-slate-400">Tanda Tangan &amp; Nama Terang</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-12">
                {pharmacyProfile.city}, {rx?.screenedAt || rx?.timestamp || new Date().toLocaleDateString('id-ID')}
                <br />
                Pro Copy Conform (PCC) — Apoteker Pemeriksa,
              </span>
              <strong className="text-slate-900 underline block">
                {rx?.screenedBy || apjProfile.name}
              </strong>
              <span className="text-[10px] text-slate-600 font-mono block">SIPA: {apjProfile.sipa}</span>
              <span className="text-[10px] text-slate-400 font-mono block">STRA: {apjProfile.stra}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MODE 12: ETIKET / LABEL INSTRUKSI PENGGUNAAN OBAT
  // ==========================================
  if (mode === 'etiket-obat') {
    const payload: MedicationLabelPrintPayload | null = loadMedicationLabelPrintPayload(searchParams);
    const rawLayoutParam = searchParams.get('layout');
    const activeLayout = normalizeMedicationLabelLayout(
      etiketLayoutOverride || rawLayoutParam || payload?.layout || 'thermal-80'
    );
    const is58mm = activeLayout === 'thermal-58';
    const is80mm = activeLayout === 'thermal-80';
    const isThermal = is58mm || is80mm;

    const selectedItems = (payload?.labels || []).filter((l) => l.selected !== false);
    const expandedLabels = selectedItems.flatMap((item) => {
      const count = Math.max(1, Math.min(20, Number(item.copies) || 1));
      return Array.from({ length: count }, (_, copyIdx) => ({
        ...item,
        copyIndex: copyIdx + 1,
        totalCopies: count
      }));
    });

    const rxIdDisplay = payload?.rxId || searchParams.get('rxId') || '-';
    const patientNameDisplay = payload?.patientName || '-';
    const dateDisplay = payload?.date || new Date().toLocaleDateString('id-ID');

    const pageSizeCss = is58mm
      ? '@page { size: 58mm auto; margin: 1.5mm 2mm; }'
      : is80mm
      ? '@page { size: 80mm auto; margin: 2mm 3mm; }'
      : '@page { size: A4 portrait; margin: 10mm; }';

    return (
      <div className="min-h-screen bg-slate-100 p-4 sm:p-8 flex flex-col items-center">
        {printStyles}
        <style>{`
          ${pageSizeCss}
          @media print {
            #printable-section.etiket-printable-58 {
              width: 48mm !important;
              max-width: 48mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
            }
            #printable-section.etiket-printable-80 {
              width: 72mm !important;
              max-width: 72mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
            }
            #printable-section .etiket-preserve {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #printable-section .etiket-thermal-stack {
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              gap: 2.5mm !important;
            }
            #printable-section .etiket-sheet-grid {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 3.5mm !important;
            }
            #printable-section .etiket-card {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            #printable-section .etiket-card-ext {
              background-color: #f0f9ff !important;
              border-color: #0369a1 !important;
            }
            #printable-section .etiket-card-int {
              background-color: #ffffff !important;
              border-color: #0f172a !important;
            }
            #printable-section .etiket-ext-tint {
              background-color: #e0f2fe !important;
            }
            #printable-section .etiket-int-tint {
              background-color: #f1f5f9 !important;
            }
            #printable-section .etiket-blue-header {
              background-color: #0369a1 !important;
              color: #ffffff !important;
              border-color: #075985 !important;
            }
            #printable-section .etiket-blue-header * {
              color: #ffffff !important;
            }
            #printable-section .etiket-dark-header {
              background-color: #0f172a !important;
              color: #ffffff !important;
              border-color: #0f172a !important;
            }
            #printable-section .etiket-dark-header * {
              color: #ffffff !important;
            }
            #printable-section .etiket-card .etiket-badge-light {
              background-color: #ffffff !important;
              color: #0f172a !important;
            }
            #printable-section .etiket-card-ext .etiket-badge-light {
              color: #0c4a6e !important;
            }
            #printable-section .etiket-warning {
              color: #be123c !important;
            }
            #printable-section .etiket-cut-line {
              border-bottom: 1px dashed #64748b !important;
              padding-bottom: 2mm !important;
            }
          }
        `}</style>

        <div className="w-full max-w-4xl space-y-3">
          {renderFloatingTopBar(
            `Etiket / Label Instruksi Obat (${expandedLabels.length} Label)`
          )}

          {/* Toolbar Pilihan Ukuran / Layout Cetak (Non-Print) */}
          <div className="no-print bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="text-xs text-slate-700">
              <span className="font-bold">Resep #{rxIdDisplay}</span> · Pasien:{' '}
              <strong className="text-slate-900">{patientNameDisplay}</strong> ·{' '}
              <span className="font-mono text-emerald-700 font-bold">
                {expandedLabels.length} stiker siap cetak
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setEtiketLayoutOverride('thermal-80')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  is80mm
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Thermal 80 mm
              </button>
              <button
                type="button"
                onClick={() => setEtiketLayoutOverride('thermal-58')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  is58mm
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Thermal 58 mm
              </button>
              <button
                type="button"
                onClick={() => setEtiketLayoutOverride('sheet')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  activeLayout === 'sheet'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lembar A4 (2 Kolom)
              </button>
            </div>
          </div>
        </div>

        <div
          id="printable-section"
          className={`w-full bg-white rounded-2xl shadow-lg border border-slate-300 ${
            is58mm
              ? 'etiket-printable-58 max-w-[58mm] p-2'
              : is80mm
              ? 'etiket-printable-80 max-w-[80mm] p-2.5'
              : 'max-w-[210mm] p-5'
          }`}
        >
          {expandedLabels.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs font-semibold">
              Belum ada item obat yang dipilih untuk dicetak etiketnya.
            </div>
          ) : (
            <div
              className={
                isThermal
                  ? 'etiket-thermal-stack flex flex-col items-center gap-3'
                  : 'etiket-sheet-grid grid grid-cols-1 sm:grid-cols-2 gap-3.5'
              }
            >
              {expandedLabels.map((item, idx) => {
                const isExternal = item.routeType === 'luar';
                const isRacikan = isRacikanPrescriptionItem(item);
                const hasMoreAfter = isThermal && idx < expandedLabels.length - 1;
                return (
                  <div
                    key={`${item.id}-${idx}`}
                    className={`w-full flex flex-col items-center ${
                      hasMoreAfter ? 'etiket-cut-line border-b border-dashed border-slate-300 pb-3' : ''
                    }`}
                  >
                    <div
                      className={`etiket-card etiket-preserve rounded-xl overflow-hidden border-2 flex flex-col justify-between ${
                        is58mm
                          ? 'w-[48mm] max-w-full'
                          : is80mm
                          ? 'w-[72mm] max-w-full'
                          : 'w-full min-h-[48mm]'
                      } ${
                        isExternal
                          ? 'etiket-card-ext bg-sky-50 border-sky-700'
                          : 'etiket-card-int bg-white border-slate-900'
                      }`}
                    >
                      {/* Header Apotek & Status Obat Dalam/Luar */}
                      <div
                        className={`etiket-preserve border-b flex items-start justify-between gap-1.5 ${
                          is58mm ? 'px-2 py-1 flex-col' : 'px-2.5 py-1.5'
                        } ${
                          isExternal
                            ? 'etiket-blue-header bg-sky-700 text-white border-sky-800'
                            : 'etiket-dark-header bg-slate-900 text-white border-slate-900'
                        }`}
                      >
                        <div className="min-w-0 w-full">
                          <div className="flex items-center justify-between gap-1">
                            <div
                              className={`font-black uppercase tracking-wide leading-tight truncate ${
                                is58mm ? 'text-[8.5px]' : 'text-[10px]'
                              }`}
                            >
                              {pharmacyProfile.name}
                            </div>
                            {is58mm && (
                              <span
                                className={`etiket-badge-light px-1 py-0.5 rounded text-[7px] font-black uppercase shrink-0 border bg-white ${
                                  isExternal
                                    ? 'text-sky-900 border-sky-200'
                                    : 'text-slate-900 border-slate-300'
                                }`}
                              >
                                {isExternal ? 'LUAR' : 'DALAM'}
                              </span>
                            )}
                          </div>
                          <div
                            className={`leading-tight opacity-95 truncate ${
                              is58mm ? 'text-[7px]' : 'text-[8px]'
                            }`}
                          >
                            {pharmacyFullAddress}
                            {pharmacyProfile.phone ? ` · ${pharmacyProfile.phone}` : ''}
                          </div>
                          <div
                            className={`font-mono leading-tight opacity-90 truncate ${
                              is58mm ? 'text-[6.5px]' : 'text-[7.5px]'
                            }`}
                          >
                            APJ: {apjProfile.name}
                            {!is58mm && apjProfile.sipa ? ` (${apjProfile.sipa})` : ''}
                            {!is58mm && pharmacyProfile.sia ? ` · SIA: ${pharmacyProfile.sia}` : ''}
                          </div>
                        </div>
                        {!is58mm && (
                          <span
                            className={`etiket-badge-light px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0 border bg-white ${
                              isExternal
                                ? 'text-sky-900 border-sky-200'
                                : 'text-slate-900 border-slate-300'
                            }`}
                          >
                            {isExternal ? 'OBAT LUAR' : 'OBAT DALAM'}
                          </span>
                        )}
                      </div>

                      {/* Isi Etiket */}
                      <div
                        className={`flex-1 flex flex-col justify-between ${
                          is58mm ? 'px-2 py-1.5 space-y-1' : 'px-2.5 py-2 space-y-1.5'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div
                            className={`flex items-center justify-between font-mono text-slate-700 border-b border-dashed border-slate-300 pb-0.5 ${
                              is58mm ? 'text-[7.5px]' : 'text-[8.5px]'
                            }`}
                          >
                            <span className="truncate">
                              No: <strong className="text-slate-900">{rxIdDisplay}</strong>
                            </span>
                            <span className="shrink-0">
                              {is58mm ? dateDisplay : `Tgl: ${dateDisplay}`}
                            </span>
                          </div>

                          <div
                            className={`flex items-baseline justify-between gap-1 ${
                              is58mm ? 'text-[8.5px]' : 'text-[10px]'
                            }`}
                          >
                            <div className="truncate">
                              <span className="text-slate-600">Pro: </span>
                              <strong className="font-black text-slate-900 uppercase">
                                {patientNameDisplay}
                              </strong>
                              {payload?.patientAge ? (
                                <span className="text-slate-700 font-semibold">
                                  {' '}
                                  ({payload.patientAge} Th)
                                </span>
                              ) : null}
                            </div>
                            {payload?.rmId && !is58mm && (
                              <span className="font-mono text-[8.5px] text-slate-600 shrink-0">
                                RM: {payload.rmId}
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          className={`bg-white border border-slate-300 rounded-lg space-y-1 ${
                            is58mm ? 'px-1.5 py-1' : 'px-2 py-1.5'
                          }`}
                        >
                          {isRacikan ? (
                            <div className="flex items-baseline justify-between gap-1.5">
                              <span
                                className={`font-bold text-slate-600 ${
                                  is58mm ? 'text-[8px]' : 'text-[9.5px]'
                                }`}
                              >
                                Jumlah:
                              </span>
                              <span
                                className={`font-mono font-bold text-slate-800 shrink-0 ${
                                  is58mm ? 'text-[8px]' : 'text-[9.5px]'
                                }`}
                              >
                                {item.qty} {item.unit}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-baseline justify-between gap-1.5">
                              <strong
                                className={`font-black text-slate-900 leading-tight ${
                                  is58mm ? 'text-[9.5px]' : 'text-[11px]'
                                }`}
                              >
                                {item.name}
                              </strong>
                              <span
                                className={`font-mono font-bold text-slate-800 shrink-0 ${
                                  is58mm ? 'text-[8px]' : 'text-[9.5px]'
                                }`}
                              >
                                {item.qty} {item.unit}
                              </span>
                            </div>
                          )}

                          <div
                            className={`etiket-preserve rounded text-center border ${
                              is58mm ? 'px-1.5 py-0.5' : 'px-2 py-1'
                            } ${
                              isExternal
                                ? 'etiket-ext-tint bg-sky-100/80 border-sky-300 text-sky-950'
                                : 'etiket-int-tint bg-slate-100 border-slate-300 text-slate-950'
                            }`}
                          >
                            <div
                              className={`font-black tracking-wide leading-snug ${
                                is58mm ? 'text-[10px]' : 'text-[12px]'
                              }`}
                            >
                              {item.dosage || 'Sesuai petunjuk'}
                            </div>
                            {item.timingNote && (
                              <div
                                className={`font-bold uppercase leading-tight ${
                                  is58mm ? 'text-[8px]' : 'text-[9.5px]'
                                }`}
                              >
                                {item.timingNote}
                              </div>
                            )}
                          </div>

                          {item.extraWarning && (
                            <div
                              className={`etiket-warning font-extrabold text-rose-700 text-center uppercase tracking-tight ${
                                is58mm ? 'text-[7.5px]' : 'text-[8.5px]'
                              }`}
                            >
                              ⚠ {item.extraWarning}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Footer */}
                      <div
                        className={`etiket-preserve font-mono flex items-center justify-between border-t ${
                          is58mm ? 'px-2 py-0.5 text-[7px]' : 'px-2.5 py-1 text-[8px]'
                        } ${
                          isExternal
                            ? 'etiket-ext-tint bg-sky-100/70 border-sky-200 text-sky-900'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <span className="truncate">
                          {isRacikan ? (
                            item.budDate ? (
                              <strong className="font-bold">BUD: {formatDateDDMMYYYY(item.budDate)}</strong>
                            ) : is58mm ? (
                              'Simpan tempat sejuk'
                            ) : (
                              'Simpan di tempat sejuk & kering'
                            )
                          ) : (
                            <>
                              {item.expDate
                                ? `ED: ${item.expDate}`
                                : is58mm
                                ? 'Simpan tempat sejuk'
                                : 'Simpan di tempat sejuk & kering'}
                              {item.batchNo && !is58mm ? ` · B: ${item.batchNo}` : ''}
                            </>
                          )}
                        </span>
                        <span className="font-bold shrink-0">
                          {item.totalCopies > 1
                            ? `${item.copyIndex}/${item.totalCopies}`
                            : is58mm
                            ? 'Lekas Sembuh'
                            : 'Semoga Lekas Sembuh'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="p-6 text-center">
      <h2 className="font-bold text-sm mb-4">Mempersiapkan Dokumen Cetak...</h2>
      <button
        onClick={safePrint}
        className="px-4 py-2 bg-sky-600 text-white rounded-xl font-bold cursor-pointer"
      >
        Cetak Sekarang
      </button>
    </div>
  );
};
