import {
  AuditLog,
  Branch,
  CashierShiftSession,
  CashFlowRecord,
  DebtPaymentRecord,
  Doctor,
  DutySchedule,
  EPrescription,
  FeeConfig,
  ICD10Item,
  LabTestRecord,
  Medicine,
  Mitra,
  MitraOrder,
  OnlineRegistration,
  Patient,
  PatientQueue,
  PharmacyProfile,
  APJProfile,
  DPJProfile,
  PurchaseInvoice,
  PurchaseOrder,
  PurchaseReturnRecord,
  ReceivablePaymentRecord,
  RMERecord,
  Staff,
  StockMutation,
  StockOpnameRecord,
  StockTransfer,
  Supplier,
  Transaction,
  DrugInteractionRecord,
  DEFAULT_FEE_CONFIG,
  DEFAULT_ROLE_PERMISSIONS
} from '../types';
import {
  INITIAL_DOCTORS,
  INITIAL_DUTY_SCHEDULES,
  INITIAL_ICD10_LIST,
  INITIAL_STAFF
} from './initialData';
import { INITIAL_INTERAKSI_OBAT } from './drugInteractions';
import {
  clearDemoSandboxStorage,
  DEMO_INITIALIZED_KEY,
  DEMO_STORAGE_PREFIX
} from '../utils/demoSandbox';

const formatOffsetYMD = (daysOffset: number): string => {
  const d = new Date(Date.now() + daysOffset * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Crisp sample SVG receipt encoded as Data URL for instant Demo preview of Transfer Bank / QRIS validation
const SAMPLE_TRANSFER_PROOF_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="720" viewBox="0 0 540 720">
    <rect width="540" height="720" fill="#f8fafc"/>
    <rect x="30" y="30" width="480" height="660" rx="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <rect x="30" y="30" width="480" height="96" rx="24" fill="#0284c7"/>
    <text x="270" y="76" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="middle">BUKTI TRANSFER BERHASIL (DEMO)</text>
    <text x="270" y="104" font-family="sans-serif" font-size="13" fill="#e0f2fe" text-anchor="middle">Simulasi Struk Pembayaran Mitra Sandbox</text>
    <circle cx="270" cy="182" r="32" fill="#dcfce7"/>
    <path d="M254 182 l11 11 l22 -22" fill="none" stroke="#16a34a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="270" y="242" font-family="sans-serif" font-size="28" font-weight="bold" fill="#0f172a" text-anchor="middle">Rp 1.185.000</text>
    <text x="270" y="268" font-family="sans-serif" font-size="13" fill="#64748b" text-anchor="middle">Transfer ke QRIS Apotek Latisha Farma</text>
    <line x1="64" y1="298" x2="476" y2="298" stroke="#e2e8f0" stroke-dasharray="6 6"/>
    <text x="64" y="340" font-family="sans-serif" font-size="14" fill="#64748b">No. Referensi</text>
    <text x="476" y="340" font-family="monospace" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="end">DEMO-TRX-8841209</text>
    <text x="64" y="380" font-family="sans-serif" font-size="14" fill="#64748b">Pengirim</text>
    <text x="476" y="380" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="end">Klinik Pratama Sehat Sentosa</text>
    <text x="64" y="420" font-family="sans-serif" font-size="14" fill="#64748b">Penerima</text>
    <text x="476" y="420" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="end">APOTEK LATISHA FARMA</text>
    <text x="64" y="460" font-family="sans-serif" font-size="14" fill="#64748b">NMID</text>
    <text x="476" y="460" font-family="monospace" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="end">ID1026634857274</text>
    <text x="64" y="500" font-family="sans-serif" font-size="14" fill="#64748b">Status</text>
    <text x="476" y="500" font-family="sans-serif" font-size="14" font-weight="bold" fill="#16a34a" text-anchor="end">LUNAS / TERKIRIM</text>
    <rect x="64" y="555" width="412" height="84" rx="14" fill="#fef3c7" stroke="#fde68a"/>
    <text x="270" y="590" font-family="sans-serif" font-size="13" font-weight="bold" fill="#92400e" text-anchor="middle">DOKUMEN SIMULASI MODE DEMO</text>
    <text x="270" y="614" font-family="sans-serif" font-size="12" fill="#b45309" text-anchor="middle">Gunakan tombol Setujui / Tolak untuk uji validasi Admin.</text>
  </svg>`
)}`;

export interface DemoSeedBundle {
  branches: Branch[];
  medicines: Medicine[];
  patients: Patient[];
  doctors: Doctor[];
  staffList: Staff[];
  icd10List: ICD10Item[];
  queue: PatientQueue[];
  onlineRegistrations: OnlineRegistration[];
  rmeRecords: RMERecord[];
  labRecords: LabTestRecord[];
  prescriptions: EPrescription[];
  transactions: Transaction[];
  purchaseInvoices: PurchaseInvoice[];
  purchaseOrders: PurchaseOrder[];
  stockMutations: StockMutation[];
  transfers: StockTransfer[];
  auditLogs: AuditLog[];
  feeConfig: FeeConfig;
  mitraList: Mitra[];
  suppliers: Supplier[];
  purchaseReturns: PurchaseReturnRecord[];
  opnameRecords: StockOpnameRecord[];
  cashierShifts: CashierShiftSession[];
  schedules: DutySchedule[];
  mitraOrders: MitraOrder[];
  rolePermissions: Record<string, string[]>;
  debtPayments: DebtPaymentRecord[];
  receivablePayments: ReceivablePaymentRecord[];
  cashFlowRecords: CashFlowRecord[];
  pharmacyProfile: PharmacyProfile;
  apjProfile: APJProfile;
  dpjProfile: DPJProfile;
  interaksiObat: DrugInteractionRecord[];
}

export function createDemoSeedData(): DemoSeedBundle {
  const today = formatOffsetYMD(0);
  const yesterday = formatOffsetYMD(-1);
  const twoDaysAgo = formatOffsetYMD(-2);
  const threeDaysAgo = formatOffsetYMD(-3);
  const dueIn14Days = formatOffsetYMD(14);
  const dueIn30Days = formatOffsetYMD(30);
  const nearExp = formatOffsetYMD(45);
  const midExp = formatOffsetYMD(320);
  const longExp = formatOffsetYMD(620);

  const branches: Branch[] = [
    {
      id: 'BR-01',
      name: 'Apotek Latisha Farma (Pusat - Demo)',
      code: 'LTF-DEMO-01',
      address: 'Jl. KTM Tanjung Mas Makmur Kec. Mesuji Timur Kab. Mesuji, Lampung',
      phone: '0895326272957',
      isCentral: true,
      syncStatus: 'Tersinkronisasi',
      lastSyncTime: 'Sandbox Aktif'
    },
    {
      id: 'BR-02',
      name: 'Latisha Farma Cabang Timur (Demo)',
      code: 'LTF-DEMO-02',
      address: 'Jl. Lintas Timur KM 12, Kab. Mesuji, Lampung',
      phone: '0812-9988-7766',
      isCentral: false,
      syncStatus: 'Tersinkronisasi',
      lastSyncTime: 'Sandbox Aktif'
    }
  ];

  const medicines: Medicine[] = [
    {
      id: 'OBT-DEMO-001',
      barcode: '8991001001001',
      name: 'Paracetamol 500 mg (Sanmol)',
      category: 'Obat Bebas',
      kelas: 'Analgesik / Antipiretik',
      nappza: 'Non-NAPPZA',
      kekuatan: '500 mg',
      form: 'Tablet',
      unit: 'Tablet',
      satuanKecil: 'Tablet',
      satuanBesar: 'Box',
      rasioKonversi: 100,
      hnaBesar: 32000,
      hpp: 320,
      sellPrice: 500,
      sellPriceKlinik: 450,
      sellPriceMitra: 38000,
      markupReguler: 56,
      markupKlinik: 41,
      markupMitra: 19,
      stock: 450,
      minStock: 100,
      maxStock: 1000,
      batchNo: 'PCM-2409A',
      expDate: midExp,
      batches: [
        { id: 'OBT-DEMO-001-B1', batchNo: 'PCM-2409A', expDate: midExp, stock: 150 },
        { id: 'OBT-DEMO-001-B2', batchNo: 'PCM-2502B', expDate: longExp, stock: 300 }
      ],
      rack: 'Rak A-01 (Bebas)',
      supplier: 'PT Bina San Prima',
      branchId: 'BR-01'
    },
    {
      id: 'OBT-DEMO-002',
      barcode: '8991001001002',
      name: 'Amoxicillin Trihydrate 500 mg',
      category: 'Obat Keras',
      kelas: 'Antibiotik',
      nappza: 'Non-NAPPZA',
      kekuatan: '500 mg',
      form: 'Kaplet',
      unit: 'Kaplet',
      satuanKecil: 'Kaplet',
      satuanBesar: 'Box',
      rasioKonversi: 100,
      hnaBesar: 55000,
      hpp: 550,
      sellPrice: 800,
      sellPriceKlinik: 750,
      sellPriceMitra: 64000,
      markupReguler: 45,
      markupKlinik: 36,
      markupMitra: 16,
      stock: 320,
      minStock: 100,
      maxStock: 800,
      batchNo: 'AMX-2411C',
      expDate: nearExp,
      batches: [
        { id: 'OBT-DEMO-002-B1', batchNo: 'AMX-2411C', expDate: nearExp, stock: 120 },
        { id: 'OBT-DEMO-002-B2', batchNo: 'AMX-2504D', expDate: longExp, stock: 200 }
      ],
      rack: 'Rak K-02 (Antibiotik)',
      supplier: 'PT Enseval Putera Megatrading',
      branchId: 'BR-01'
    },
    {
      id: 'OBT-DEMO-003',
      barcode: '8991001001003',
      name: 'Amlodipine Besylate 10 mg',
      category: 'Obat Keras',
      kelas: 'Antihipertensi',
      nappza: 'Non-NAPPZA',
      kekuatan: '10 mg',
      form: 'Tablet',
      unit: 'Tablet',
      satuanKecil: 'Tablet',
      satuanBesar: 'Box',
      rasioKonversi: 30,
      hnaBesar: 18000,
      hpp: 600,
      sellPrice: 1000,
      sellPriceKlinik: 900,
      sellPriceMitra: 22000,
      markupReguler: 67,
      markupKlinik: 50,
      markupMitra: 22,
      stock: 270,
      minStock: 60,
      maxStock: 600,
      batchNo: 'AML-2501X',
      expDate: longExp,
      batches: [{ id: 'OBT-DEMO-003-B1', batchNo: 'AML-2501X', expDate: longExp, stock: 270 }],
      rack: 'Rak K-05 (Kardiovaskular)',
      supplier: 'PT Kimia Farma Trading',
      branchId: 'BR-01'
    },
    {
      id: 'OBT-DEMO-004',
      barcode: '8991001001004',
      name: 'Metformin HCl 500 mg',
      category: 'Obat Keras',
      kelas: 'Antidiabetik',
      nappza: 'Non-NAPPZA',
      kekuatan: '500 mg',
      form: 'Tablet',
      unit: 'Tablet',
      satuanKecil: 'Tablet',
      satuanBesar: 'Box',
      rasioKonversi: 100,
      hnaBesar: 28000,
      hpp: 280,
      sellPrice: 450,
      sellPriceKlinik: 400,
      sellPriceMitra: 34000,
      markupReguler: 61,
      markupKlinik: 43,
      markupMitra: 21,
      stock: 500,
      minStock: 100,
      maxStock: 1000,
      batchNo: 'MTF-2502A',
      expDate: longExp,
      batches: [{ id: 'OBT-DEMO-004-B1', batchNo: 'MTF-2502A', expDate: longExp, stock: 500 }],
      rack: 'Rak K-06 (Endokrin)',
      supplier: 'PT Kimia Farma Trading',
      branchId: 'BR-01'
    },
    {
      id: 'OBT-DEMO-005',
      barcode: '8991001001005',
      name: 'Omeprazole 20 mg Kapsul',
      category: 'Obat Keras',
      kelas: 'PPI / Lambung',
      nappza: 'Non-NAPPZA',
      kekuatan: '20 mg',
      form: 'Kapsul',
      unit: 'Kapsul',
      satuanKecil: 'Kapsul',
      satuanBesar: 'Box',
      rasioKonversi: 30,
      hnaBesar: 24000,
      hpp: 800,
      sellPrice: 1200,
      sellPriceKlinik: 1100,
      sellPriceMitra: 29000,
      markupReguler: 50,
      markupKlinik: 38,
      markupMitra: 21,
      stock: 210,
      minStock: 60,
      maxStock: 450,
      batchNo: 'OMP-2503K',
      expDate: midExp,
      batches: [
        { id: 'OBT-DEMO-005-B1', batchNo: 'OMP-2503K', expDate: midExp, stock: 90 },
        { id: 'OBT-DEMO-005-B2', batchNo: 'OMP-2508L', expDate: longExp, stock: 120 }
      ],
      rack: 'Rak K-03 (Pencernaan)',
      supplier: 'PT Bina San Prima',
      branchId: 'BR-01'
    },
    {
      id: 'OBT-DEMO-006',
      barcode: '8991001001006',
      name: 'Cetirizine HCl 10 mg',
      category: 'Obat Bebas Terbatas',
      kelas: 'Antihistamin / Alergi',
      nappza: 'Non-NAPPZA',
      kekuatan: '10 mg',
      form: 'Tablet',
      unit: 'Tablet',
      satuanKecil: 'Tablet',
      satuanBesar: 'Box',
      rasioKonversi: 50,
      hnaBesar: 22500,
      hpp: 450,
      sellPrice: 750,
      sellPriceKlinik: 650,
      sellPriceMitra: 27000,
      markupReguler: 67,
      markupKlinik: 44,
      markupMitra: 20,
      stock: 250,
      minStock: 50,
      maxStock: 500,
      batchNo: 'CTZ-2501M',
      expDate: longExp,
      batches: [{ id: 'OBT-DEMO-006-B1', batchNo: 'CTZ-2501M', expDate: longExp, stock: 250 }],
      rack: 'Rak B-02 (Terbatas)',
      supplier: 'PT Enseval Putera Megatrading',
      branchId: 'BR-01'
    },
    {
      id: 'OBT-DEMO-007',
      barcode: '8991001001007',
      name: 'Vitamin C 500 mg + Zinc (Enervon-C)',
      category: 'Vitamin/Suplemen',
      kelas: 'Multivitamin & Imunitas',
      nappza: 'Non-NAPPZA',
      kekuatan: '500 mg',
      form: 'Kaplet',
      unit: 'Kaplet',
      satuanKecil: 'Kaplet',
      satuanBesar: 'Box',
      rasioKonversi: 100,
      hnaBesar: 115000,
      hpp: 1150,
      sellPrice: 1600,
      sellPriceKlinik: 1500,
      sellPriceMitra: 129000,
      markupReguler: 39,
      markupKlinik: 30,
      markupMitra: 12,
      stock: 400,
      minStock: 100,
      maxStock: 800,
      batchNo: 'VTC-2505Z',
      expDate: longExp,
      batches: [{ id: 'OBT-DEMO-007-B1', batchNo: 'VTC-2505Z', expDate: longExp, stock: 400 }],
      rack: 'Rak V-01 (Etalase Depan)',
      supplier: 'PT Enseval Putera Megatrading',
      branchId: 'BR-01'
    },
    {
      id: 'OBT-DEMO-008',
      barcode: '8991001001008',
      name: 'Cefadroxil Monohydrate 500 mg',
      category: 'Obat Keras',
      kelas: 'Antibiotik',
      nappza: 'Non-NAPPZA',
      kekuatan: '500 mg',
      form: 'Kapsul',
      unit: 'Kapsul',
      satuanKecil: 'Kapsul',
      satuanBesar: 'Box',
      rasioKonversi: 50,
      hnaBesar: 62500,
      hpp: 1250,
      sellPrice: 1800,
      sellPriceKlinik: 1650,
      sellPriceMitra: 72000,
      markupReguler: 44,
      markupKlinik: 32,
      markupMitra: 15,
      stock: 35, // Intentionally below minStock (50) for Defecta Demo
      minStock: 50,
      maxStock: 400,
      batchNo: 'CFD-2412E',
      expDate: midExp,
      batches: [{ id: 'OBT-DEMO-008-B1', batchNo: 'CFD-2412E', expDate: midExp, stock: 35 }],
      rack: 'Rak K-02 (Antibiotik)',
      supplier: 'PT Bina San Prima',
      branchId: 'BR-01'
    },
    {
      id: 'OBT-DEMO-009',
      barcode: '8991001001009',
      name: 'Simvastatin 20 mg',
      category: 'Obat Keras',
      kelas: 'Dislipidemia / Kolesterol',
      nappza: 'Non-NAPPZA',
      kekuatan: '20 mg',
      form: 'Tablet',
      unit: 'Tablet',
      satuanKecil: 'Tablet',
      satuanBesar: 'Box',
      rasioKonversi: 30,
      hnaBesar: 21000,
      hpp: 700,
      sellPrice: 1100,
      sellPriceKlinik: 950,
      sellPriceMitra: 25500,
      markupReguler: 57,
      markupKlinik: 36,
      markupMitra: 21,
      stock: 180,
      minStock: 60,
      maxStock: 450,
      batchNo: 'SMV-2503P',
      expDate: longExp,
      batches: [{ id: 'OBT-DEMO-009-B1', batchNo: 'SMV-2503P', expDate: longExp, stock: 180 }],
      rack: 'Rak K-05 (Kardiovaskular)',
      supplier: 'PT Kimia Farma Trading',
      branchId: 'BR-01'
    },
    {
      id: 'OBT-DEMO-010',
      barcode: '8991001001010',
      name: 'Spuit Steril 3 cc (OneMed)',
      category: 'Alat Kesehatan',
      kelas: 'Alat Kesehatan Habis Pakai',
      nappza: 'Non-NAPPZA',
      kekuatan: '3 ml',
      form: 'Pcs',
      unit: 'Pcs',
      satuanKecil: 'Pcs',
      satuanBesar: 'Box',
      rasioKonversi: 100,
      hnaBesar: 75000,
      hpp: 750,
      sellPrice: 1500,
      sellPriceKlinik: 1200,
      sellPriceMitra: 88000,
      markupReguler: 100,
      markupKlinik: 60,
      markupMitra: 17,
      stock: 40, // Intentionally below minStock (100) for Defecta Demo
      minStock: 100,
      maxStock: 500,
      batchNo: 'OMD-3CC-25',
      expDate: longExp,
      batches: [{ id: 'OBT-DEMO-010-B1', batchNo: 'OMD-3CC-25', expDate: longExp, stock: 40 }],
      rack: 'Rak ALK-01 (Alkes)',
      supplier: 'PT Bina San Prima',
      branchId: 'BR-01'
    }
  ];

  const patients: Patient[] = [
    {
      id: 'RM-DEMO-001',
      nik: '1811031505880001',
      name: 'Budi Santoso',
      age: 38,
      gender: 'Laki-laki',
      birthDate: '1988-05-15',
      phone: '0812-7788-9001',
      address: 'Desa Tanjung Mas Makmur Blok C-12, Mesuji Timur',
      allergy: 'Tidak Ada',
      category: 'Pasien Praktik',
      bpjsNo: '0001234567891',
      registeredOnline: false,
      registrationDate: threeDaysAgo
    },
    {
      id: 'RM-DEMO-002',
      nik: '1811036208920002',
      name: 'Siti Aminah',
      age: 34,
      gender: 'Perempuan',
      birthDate: '1992-08-22',
      phone: '0813-6655-4433',
      address: 'Desa Wonosari RT 03/02, Mesuji Timur',
      allergy: 'Penisilin / Amoxicillin',
      category: 'Pasien Praktik',
      registeredOnline: true,
      registrationDate: twoDaysAgo
    },
    {
      id: 'RM-DEMO-003',
      nik: '1811030903680003',
      name: 'H. Ahmad Fauzi',
      age: 58,
      gender: 'Laki-laki',
      birthDate: '1968-03-09',
      phone: '0821-8899-1122',
      address: 'Jl. Poros KTM No. 18, Mesuji Timur',
      allergy: 'Tidak Ada',
      category: 'Pasien Umum',
      bpjsNo: '0009988776655',
      registeredOnline: false,
      registrationDate: yesterday
    },
    {
      id: 'RM-DEMO-004',
      nik: '1811035011960004',
      name: 'Rina Wijaya',
      age: 30,
      gender: 'Perempuan',
      birthDate: '1996-11-10',
      phone: '0852-7744-5566',
      address: 'Simpang Pematang KM 5, Mesuji',
      allergy: 'Sulfa',
      category: 'Pasien Praktik',
      registeredOnline: true,
      registrationDate: today
    },
    {
      id: 'RM-DEMO-005',
      nik: '1811032407750005',
      name: 'Dedi Kurniawan',
      age: 51,
      gender: 'Laki-laki',
      birthDate: '1975-07-24',
      phone: '0819-3322-1100',
      address: 'Desa Muara Tenang Blok B-04, Mesuji Timur',
      allergy: 'Tidak Ada',
      category: 'Mitra Perusahaan',
      registeredOnline: false,
      registrationDate: today
    }
  ];

  const queue: PatientQueue[] = [
    {
      nomor: 'A-001',
      rmId: 'RM-DEMO-001',
      name: 'Budi Santoso',
      age: 38,
      gender: 'Laki-laki',
      vital: { td: '122/80', suhu: 37.8, nadi: 86, spo2: 98, bb: 68, tb: 170 },
      status: 'Farmasi',
      doctorId: 'DOC-001',
      doctorName: 'dr. Anis Prima Dewi',
      checkinTime: '08:45',
      source: 'Pendaftaran Langsung (Walk-in)',
      complaint: 'Demam sejak 2 hari disertai nyeri tenggorokan',
      serviceType: 'Poli Umum',
      branchId: 'BR-01'
    },
    {
      nomor: 'A-002',
      rmId: 'RM-DEMO-002',
      name: 'Siti Aminah',
      age: 34,
      gender: 'Perempuan',
      vital: { td: '115/75', suhu: 36.6, nadi: 78, spo2: 99, bb: 54, tb: 158 },
      status: 'Diperiksa',
      doctorId: 'DOC-001',
      doctorName: 'dr. Anis Prima Dewi',
      checkinTime: '09:15',
      source: 'Pendaftaran Online',
      complaint: 'Nyeri ulu hati dan mual setelah makan pedas',
      serviceType: 'Poli Umum',
      branchId: 'BR-01'
    },
    {
      nomor: 'A-003',
      rmId: 'RM-DEMO-004',
      name: 'Rina Wijaya',
      age: 30,
      gender: 'Perempuan',
      vital: { td: '118/78', suhu: 36.8, nadi: 82, spo2: 99, bb: 56, tb: 162 },
      status: 'Menunggu',
      doctorId: 'DOC-001',
      doctorName: 'dr. Anis Prima Dewi',
      checkinTime: '09:40',
      source: 'Pendaftaran Online',
      complaint: 'Gatal-gatal dan biduran sejak semalam',
      serviceType: 'Poli Umum',
      branchId: 'BR-01'
    }
  ];

  const onlineRegistrations: OnlineRegistration[] = [
    {
      id: 'REG-DEMO-001',
      bookingCode: 'LTF-DEMO-101',
      nik: '1811035011960004',
      name: 'Rina Wijaya',
      phone: '0852-7744-5566',
      birthDate: '1996-11-10',
      gender: 'Perempuan',
      address: 'Simpang Pematang KM 5, Mesuji',
      appointmentDate: today,
      appointmentTime: '09:30',
      doctorId: 'DOC-001',
      doctorName: 'dr. Anis Prima Dewi',
      serviceType: 'Poli Umum (Pemeriksaan Dokter & Pengobatan)',
      paymentType: 'Umum / Mandiri',
      complaint: 'Alergi kulit / biduran sejak kemarin malam',
      allergy: 'Sulfa',
      status: 'Diterima',
      createdAt: '08:15',
      branchId: 'BR-01'
    },
    {
      id: 'REG-DEMO-002',
      bookingCode: 'LTF-DEMO-102',
      nik: '1811032407750005',
      name: 'Dedi Kurniawan',
      phone: '0819-3322-1100',
      birthDate: '1975-07-24',
      gender: 'Laki-laki',
      address: 'Desa Muara Tenang Blok B-04, Mesuji Timur',
      appointmentDate: today,
      appointmentTime: '11:00',
      doctorId: 'DOC-001',
      doctorName: 'dr. Anis Prima Dewi',
      serviceType: 'Poli Umum (Pemeriksaan Dokter & Pengobatan)',
      paymentType: 'Umum / Mandiri',
      complaint: 'Kontrol gula darah rutin dan pegal-pegal',
      allergy: 'Tidak Ada',
      status: 'Menunggu Verifikasi',
      createdAt: '09:05',
      branchId: 'BR-01'
    }
  ];

  const rmeRecords: RMERecord[] = [
    {
      id: 'RME-DEMO-001',
      date: today,
      time: '08:55',
      rmId: 'RM-DEMO-001',
      patientName: 'Budi Santoso',
      nik: '1811031505880001',
      age: 38,
      gender: 'Laki-laki',
      doctorName: 'dr. Anis Prima Dewi',
      doctorId: 'DOC-001',
      vitalSign: { td: '122/80', suhu: 37.8, nadi: 86, spo2: 98, bb: 68, tb: 170 },
      soapS: 'Pasien mengeluh demam naik turun sejak 2 hari, nyeri menelan, batuk ringan.',
      soapO: 'KU cukup, faring hiperemis (+), tonsil T1/T1, suhu 37.8°C.',
      soapA: 'Faringitis Akut (J02.9)',
      soapP: 'Terapi antibiotik oral, antipiretik, istirahat cukup & perbanyak minum air hangat.',
      icdCode: 'J02.9',
      icdName: 'Faringitis Akut (Sakit Tenggorokan)',
      icdList: [{ code: 'J02.9', name: 'Faringitis Akut (Sakit Tenggorokan)', category: 'Respirasi' }],
      prescription: [
        {
          medicineId: 'OBT-DEMO-002',
          name: 'Amoxicillin Trihydrate 500 mg',
          qty: 15,
          unit: 'Kaplet',
          price: 750,
          dosage: '3 x 1 Kaplet (Habiskan)'
        },
        {
          medicineId: 'OBT-DEMO-001',
          name: 'Paracetamol 500 mg (Sanmol)',
          qty: 10,
          unit: 'Tablet',
          price: 450,
          dosage: '3 x 1 Tablet bila demam/nyeri'
        }
      ],
      doctorFee: 20000,
      medicalSupportFee: 5000,
      adminFee: 1000,
      notes: 'Edukasi habiskan antibiotik 5 hari.',
      branchId: 'BR-01'
    },
    {
      id: 'RME-DEMO-002',
      date: yesterday,
      time: '14:20',
      rmId: 'RM-DEMO-003',
      patientName: 'H. Ahmad Fauzi',
      nik: '1811030903680003',
      age: 58,
      gender: 'Laki-laki',
      doctorName: 'dr. Anis Prima Dewi',
      doctorId: 'DOC-001',
      vitalSign: { td: '150/92', suhu: 36.5, nadi: 78, spo2: 98, bb: 72, tb: 168 },
      soapS: 'Kontrol tekanan darah dan nyeri tengkuk ringan.',
      soapO: 'TD 150/92 mmHg, Nadi 78x/m regular.',
      soapA: 'Hipertensi Esensial (I10)',
      soapP: 'Lanjutkan terapi antihipertensi & diet rendah garam.',
      icdCode: 'I10',
      icdName: 'Hipertensi Esensial (Tekanan Darah Tinggi)',
      icdList: [{ code: 'I10', name: 'Hipertensi Esensial (Tekanan Darah Tinggi)', category: 'Kardiovaskular' }],
      prescription: [
        {
          medicineId: 'OBT-DEMO-003',
          name: 'Amlodipine Besylate 10 mg',
          qty: 30,
          unit: 'Tablet',
          price: 900,
          dosage: '1 x 1 Tablet malam hari'
        }
      ],
      doctorFee: 20000,
      medicalSupportFee: 5000,
      adminFee: 1000,
      notes: 'Kontrol ulang 1 bulan.',
      branchId: 'BR-01'
    }
  ];

  const prescriptions: EPrescription[] = [
    {
      id: 'RX-DEMO-001',
      rmeRecordId: 'RME-DEMO-001',
      rmId: 'RM-DEMO-001',
      patientName: 'Budi Santoso',
      doctorName: 'dr. Anis Prima Dewi',
      items: rmeRecords[0].prescription,
      status: 'Pending Skrining',
      timestamp: `${today} 08:56`,
      screeningNotes: 'Menunggu telaah farmasis sebelum diserahkan di kasir POS.',
      branchId: 'BR-01'
    },
    {
      id: 'RX-DEMO-002',
      rmId: 'RM-DEMO-002',
      patientName: 'Siti Aminah',
      doctorName: 'dr. Anis Prima Dewi',
      items: [
        {
          medicineId: 'OBT-DEMO-005',
          name: 'Omeprazole 20 mg Kapsul',
          qty: 10,
          unit: 'Kapsul',
          price: 1100,
          dosage: '2 x 1 Kapsul sebelum makan'
        },
        {
          medicineId: 'OBT-DEMO-007',
          name: 'Vitamin C 500 mg + Zinc (Enervon-C)',
          qty: 10,
          unit: 'Kaplet',
          price: 1500,
          dosage: '1 x 1 Kaplet sesudah makan'
        }
      ],
      status: 'Lolos Skrining',
      timestamp: `${today} 09:20`,
      screeningNotes: 'Lolos skrining administrasi, farmasetik & klinis (alergi Penisilin terverifikasi aman).',
      branchId: 'BR-01'
    },
    {
      id: 'RX-DEMO-003',
      rmId: 'RM-DEMO-003',
      patientName: 'H. Ahmad Fauzi',
      doctorName: 'dr. Anis Prima Dewi',
      items: [
        {
          medicineId: 'OBT-DEMO-003',
          name: 'Amlodipine Besylate 10 mg',
          qty: 30,
          unit: 'Tablet',
          price: 900,
          dosage: '1 x 1 Tablet malam hari'
        },
        {
          medicineId: 'OBT-DEMO-008',
          name: 'Asam Mefenamat 500 mg Kaplet',
          qty: 10,
          unit: 'Kaplet',
          price: 850,
          dosage: '3 x 1 Kaplet sesudah makan bila nyeri'
        },
        {
          medicineId: 'OBT-DEMO-009',
          name: 'Dexamethasone 0.5 mg Tablet',
          qty: 10,
          unit: 'Tablet',
          price: 350,
          dosage: '2 x 1 Tablet sesudah makan'
        }
      ],
      status: 'Pending Skrining',
      timestamp: `${today} 10:05`,
      screeningNotes: 'Perlu pengecekan Interaction Checker sebelum diserahkan ke kasir POS.',
      branchId: 'BR-01'
    }
  ];

  const labRecords: LabTestRecord[] = [
    {
      id: 'LAB-DEMO-001',
      date: yesterday,
      time: '14:05',
      rmId: 'RM-DEMO-003',
      patientName: 'H. Ahmad Fauzi',
      nik: '1811030903680003',
      age: 58,
      gender: 'Laki-laki',
      doctorName: 'dr. Anis Prima Dewi',
      analystName: 'Ns. Ratna Sari, S.Kep',
      clinicalDiagnosis: 'Hipertensi Esensial & Skrining Metabolik',
      items: [
        {
          id: 'LT-1',
          parameter: 'Gula Darah Puasa (GDP)',
          result: '104',
          unit: 'mg/dL',
          referenceRange: '70 - 110',
          status: 'Normal',
          price: 25000
        },
        {
          id: 'LT-2',
          parameter: 'Kolesterol Total',
          result: '228',
          unit: 'mg/dL',
          referenceRange: '< 200',
          status: 'Tinggi',
          notes: 'Anjurkan diet rendah lemak jenuh',
          price: 35000
        },
        {
          id: 'LT-3',
          parameter: 'Asam Urat (Uric Acid)',
          result: '6.4',
          unit: 'mg/dL',
          referenceRange: '3.4 - 7.0',
          status: 'Normal',
          price: 25000
        }
      ],
      conclusion: 'Kolesterol total sedikit meningkat; GDP & Asam Urat dalam batas normal.',
      cost: 85000,
      branchId: 'BR-01'
    }
  ];

  const transactions: Transaction[] = [
    {
      id: 'TRX-DEMO-1001',
      date: today,
      type: 'REGULER',
      kasir: 'Dewi Lestari',
      customerName: 'Pembeli Umum (OTC)',
      status: 'Selesai',
      subtotal: 42000,
      discount: 0,
      chargeCC: 0,
      total: 42000,
      payAmount: 50000,
      change: 8000,
      hppTotal: 27700,
      profit: 14300,
      paymentMethod: 'Tunai',
      paymentStatus: 'Lunas',
      paidAmount: 42000,
      remainingAmount: 0,
      description: 'Pembelian OTC Swamedikasi',
      items: [
        {
          id: 'OBT-DEMO-001',
          name: 'Paracetamol 500 mg (Sanmol)',
          batchNo: 'PCM-2409A',
          expDate: midExp,
          qty: 20,
          unit: 'Tablet',
          tuslah: 0,
          price: 500,
          discount: 0,
          subtotal: 10000,
          hpp: 320
        },
        {
          id: 'OBT-DEMO-007',
          name: 'Vitamin C 500 mg + Zinc (Enervon-C)',
          batchNo: 'VTC-2505Z',
          expDate: longExp,
          qty: 20,
          unit: 'Kaplet',
          tuslah: 0,
          price: 1600,
          discount: 0,
          subtotal: 32000,
          hpp: 1150
        }
      ],
      branchId: 'BR-01'
    },
    {
      id: 'TRX-DEMO-1002',
      date: today,
      type: 'KLINIK',
      kasir: 'Dewi Lestari',
      customerName: 'H. Ahmad Fauzi (RM-DEMO-003)',
      rmId: 'RM-DEMO-003',
      doctorName: 'dr. Anis Prima Dewi',
      status: 'Selesai',
      subtotal: 53000,
      discount: 0,
      serviceCharge: 26000,
      chargeCC: 0,
      total: 53000,
      payAmount: 53000,
      change: 0,
      hppTotal: 18000,
      profit: 35000,
      paymentMethod: 'QRIS',
      paymentStatus: 'Lunas',
      paidAmount: 53000,
      remainingAmount: 0,
      description: 'Tebus Resep Poli Umum + Jasa Medis',
      items: [
        {
          id: 'OBT-DEMO-003',
          name: 'Amlodipine Besylate 10 mg',
          batchNo: 'AML-2501X',
          expDate: longExp,
          qty: 30,
          unit: 'Tablet',
          tuslah: 0,
          price: 900,
          discount: 0,
          subtotal: 27000,
          hpp: 600
        }
      ],
      branchId: 'BR-01'
    },
    {
      id: 'FPJ-DEMO-1003',
      date: yesterday,
      type: 'FAKTUR_PENJUALAN',
      kasir: 'apt. Mardin, S.Farm',
      customerName: 'Apotek Mitra Sejahtera',
      customerAddress: 'Jl. Raya Lambu Kibang No. 45, Tulang Bawang Barat',
      customerPhone: '0813-7700-2211',
      dueDate: dueIn14Days,
      term: '14 Hari',
      usePpn: false,
      dpp: 540000,
      ppn: 0,
      status: 'Selesai',
      subtotal: 540000,
      discount: 0,
      chargeCC: 0,
      total: 540000,
      payAmount: 0,
      change: 0,
      hppTotal: 440000,
      profit: 100000,
      paymentMethod: 'Tempo / Kredit Mitra',
      paymentStatus: 'Tempo',
      paidAmount: 0,
      remainingAmount: 540000,
      description: 'Faktur Penjualan Grosir Mitra (Tempo 14 Hari - Simulasi Piutang)',
      items: [
        {
          id: 'OBT-DEMO-002',
          name: 'Amoxicillin Trihydrate 500 mg (5 Box)',
          batchNo: 'AMX-2411C',
          expDate: nearExp,
          qty: 500,
          unit: 'Kaplet',
          tuslah: 0,
          price: 640,
          discount: 0,
          subtotal: 320000,
          hpp: 550
        },
        {
          id: 'OBT-DEMO-003',
          name: 'Amlodipine Besylate 10 mg (10 Box)',
          batchNo: 'AML-2501X',
          expDate: longExp,
          qty: 300,
          unit: 'Tablet',
          tuslah: 0,
          price: 733,
          discount: 0,
          subtotal: 220000,
          hpp: 600
        }
      ],
      branchId: 'BR-01'
    }
  ];

  const suppliers: Supplier[] = [
    {
      id: 'SUP-DEMO-001',
      name: 'PT Bina San Prima',
      address: 'Jl. Soekarno Hatta No. 112, Bandar Lampung',
      phone: '(0721) 774-889',
      email: 'order.lampung@binasanprima.co.id',
      licenseNo: 'PBF-0221-LMP/2023',
      picName: 'Bpk. Hendra Gunawan',
      createdAt: threeDaysAgo
    },
    {
      id: 'SUP-DEMO-002',
      name: 'PT Enseval Putera Megatrading',
      address: 'Jl. Ir. Sutami KM 8, Bandar Lampung',
      phone: '(0721) 350-900',
      email: 'sales.lmp@enseval.com',
      licenseNo: 'PBF-0109-LMP/2022',
      picName: 'Ibu Melati Putri',
      createdAt: threeDaysAgo
    },
    {
      id: 'SUP-DEMO-003',
      name: 'PT Kimia Farma Trading & Distribution',
      address: 'Jl. Raden Intan No. 55, Bandar Lampung',
      phone: '(0721) 261-445',
      email: 'kftd.lampung@kimiafarma.co.id',
      licenseNo: 'PBF-0045-LMP/2024',
      picName: 'Bpk. Reza Pahlevi',
      createdAt: twoDaysAgo
    }
  ];

  const purchaseInvoices: PurchaseInvoice[] = [
    {
      id: 'INV-PBF-DEMO-001',
      pbfName: 'PT Bina San Prima',
      invoiceNo: 'BSP-2026-09124',
      date: twoDaysAgo,
      dueDate: dueIn30Days,
      salesman: 'Bpk. Hendra Gunawan',
      term: '30 Hari',
      usePpn: true,
      items: [
        {
          medicineId: 'OBT-DEMO-001',
          name: 'Paracetamol 500 mg (Sanmol)',
          qty: 5,
          unit: 'Box',
          batchNo: 'PCM-2502B',
          expDate: longExp,
          price: 32000,
          disc: 0,
          subtotal: 160000
        },
        {
          medicineId: 'OBT-DEMO-005',
          name: 'Omeprazole 20 mg Kapsul',
          qty: 10,
          unit: 'Box',
          batchNo: 'OMP-2508L',
          expDate: longExp,
          price: 24000,
          disc: 0,
          subtotal: 240000
        }
      ],
      grossDpp: 400000,
      totalDiscountAmount: 0,
      dpp: 400000,
      ppn: 44000,
      totalTagihan: 444000,
      status: 'Belum Lunas',
      paidAmount: 0,
      remainingAmount: 444000,
      branchId: 'BR-01'
    },
    {
      id: 'INV-PBF-DEMO-002',
      pbfName: 'PT Enseval Putera Megatrading',
      invoiceNo: 'EPM-2026-44120',
      date: threeDaysAgo,
      dueDate: threeDaysAgo,
      salesman: 'Ibu Melati Putri',
      term: 'Cash / COD',
      usePpn: true,
      items: [
        {
          medicineId: 'OBT-DEMO-007',
          name: 'Vitamin C 500 mg + Zinc (Enervon-C)',
          qty: 4,
          unit: 'Box',
          batchNo: 'VTC-2505Z',
          expDate: longExp,
          price: 115000,
          disc: 0,
          subtotal: 460000
        }
      ],
      grossDpp: 460000,
      totalDiscountAmount: 0,
      dpp: 460000,
      ppn: 50600,
      totalTagihan: 510600,
      status: 'Lunas',
      paidAmount: 510600,
      remainingAmount: 0,
      branchId: 'BR-01'
    }
  ];

  const stockMutations: StockMutation[] = [
    {
      id: 'MUT-DEMO-01',
      date: twoDaysAgo,
      time: '10:15 WIB',
      medicineId: 'OBT-DEMO-001',
      medicineName: 'Paracetamol 500 mg (Sanmol)',
      refNo: 'BSP-2026-09124',
      type: 'PEMBELIAN',
      inQty: 300,
      outQty: 0,
      balance: 470,
      ket: 'Penerimaan Faktur PBF PT Bina San Prima (Batch PCM-2502B)',
      petugas: 'apt. Mardin, S.Farm',
      branchId: 'BR-01'
    },
    {
      id: 'MUT-DEMO-02',
      date: today,
      time: '09:10 WIB',
      medicineId: 'OBT-DEMO-001',
      medicineName: 'Paracetamol 500 mg (Sanmol)',
      refNo: 'TRX-DEMO-1001',
      type: 'PENJUALAN',
      inQty: 0,
      outQty: 20,
      balance: 450,
      ket: 'Penjualan POS OTC (FEFO Batch PCM-2409A)',
      petugas: 'Dewi Lestari',
      branchId: 'BR-01'
    },
    {
      id: 'MUT-DEMO-03',
      date: today,
      time: '09:30 WIB',
      medicineId: 'OBT-DEMO-003',
      medicineName: 'Amlodipine Besylate 10 mg',
      refNo: 'TRX-DEMO-1002',
      type: 'RESEP_DOKTER',
      inQty: 0,
      outQty: 30,
      balance: 270,
      ket: 'Penyerahan Resep dr. Anis Prima Dewi (RM-DEMO-003)',
      petugas: 'Dewi Lestari',
      branchId: 'BR-01'
    }
  ];

  const opnameRecords: StockOpnameRecord[] = [
    {
      id: 'OPN-DEMO-001',
      refNo: `SO-${yesterday.replace(/-/g, '')}-01`,
      date: yesterday,
      time: '16:30 WIB',
      petugas: 'Siti Rahma, A.Md.Far',
      branchId: 'BR-01',
      branchName: branches[0].name,
      totalItemsCounted: 2,
      matchCount: 1,
      surplusCount: 0,
      deficitCount: 1,
      totalSurplusNominal: 0,
      totalDeficitNominal: 3200,
      netNominalDiff: -3200,
      notes: 'Rekonsiliasi harian rak antibiotik & analgesik (Mode Demo)',
      items: [
        {
          medicineId: 'OBT-DEMO-001',
          medicineName: 'Paracetamol 500 mg (Sanmol)',
          unit: 'Tablet',
          hpp: 320,
          sellPrice: 500,
          systemStock: 460,
          physicalStock: 450,
          difference: -10,
          nominalDiffHpp: -3200,
          nominalDiffSell: -5000,
          reason: 'Selisih kemasan rusak 1 strip saat display',
          batchNo: 'PCM-2409A',
          expDate: midExp,
          batches: [
            { batchNo: 'PCM-2409A', expDate: midExp, systemStock: 160, physicalStock: 150, difference: -10 },
            { batchNo: 'PCM-2502B', expDate: longExp, systemStock: 300, physicalStock: 300, difference: 0 }
          ]
        },
        {
          medicineId: 'OBT-DEMO-004',
          medicineName: 'Metformin HCl 500 mg',
          unit: 'Tablet',
          hpp: 280,
          sellPrice: 450,
          systemStock: 500,
          physicalStock: 500,
          difference: 0,
          nominalDiffHpp: 0,
          nominalDiffSell: 0,
          reason: 'Sesuai (Match)',
          batchNo: 'MTF-2502A',
          expDate: longExp
        }
      ]
    }
  ];

  const cashierShifts: CashierShiftSession[] = [
    {
      id: 'SHF-DEMO-OPEN',
      branchId: 'BR-01',
      cashierName: 'Dewi Lestari',
      shiftName: 'Shift Pagi (Demo)',
      openDate: today,
      openTime: '08:00',
      openTimestamp: Date.now() - 3600 * 1000 * 2,
      openingFloat: 300000,
      openingNotes: 'Modal awal laci kasir sesi sandbox',
      systemCashSales: 42000,
      systemNonCashSales: 53000,
      expectedCashInDrawer: 342000,
      physicalCashInDrawer: 0,
      difference: 0,
      differenceStatus: 'Sesuai',
      denominations: [],
      status: 'Aktif',
      transactionCount: 2
    }
  ];

  const mitraList: Mitra[] = [
    {
      id: 'MTR-DEMO-001',
      name: 'Klinik Pratama Sehat Sentosa',
      phone: '0812-8800-4455',
      licenseNo: 'KLINIK-1811-009/2024',
      address: 'Jl. Lintas Timur KM 18, Mesuji Timur',
      category: 'Klinik Pratama',
      picName: 'dr. Hendra Kusuma',
      createdAt: threeDaysAgo
    },
    {
      id: 'MTR-DEMO-002',
      name: 'Apotek Mitra Sejahtera',
      phone: '0813-7700-2211',
      licenseNo: 'SIA-1812-044/2023',
      address: 'Jl. Raya Lambu Kibang No. 45, Tulang Bawang Barat',
      category: 'Apotek Mitra',
      picName: 'apt. Dian Permata, S.Farm',
      createdAt: twoDaysAgo
    },
    {
      id: 'MTR-DEMO-003',
      name: 'Praktik Mandiri Bidan Rina',
      phone: '0822-5544-3322',
      licenseNo: 'SIPB-1811-012/2024',
      address: 'Desa Wiralaga Mulya RT 02, Mesuji',
      category: 'Lainnya',
      picName: 'Bidan Rina Marlina, A.Md.Keb',
      createdAt: yesterday
    }
  ];

  const mitraOrders: MitraOrder[] = [
    {
      id: 'ORD-DEMO-001',
      orderCode: 'ORD-MTR-DEMO-101',
      mitraId: 'MTR-DEMO-001',
      mitraName: 'Klinik Pratama Sehat Sentosa',
      mitraCategory: 'Klinik Pratama',
      mitraPhone: '0812-8800-4455',
      mitraAddress: 'Jl. Lintas Timur KM 18, Mesuji Timur',
      picName: 'dr. Hendra Kusuma',
      items: [
        {
          medicineId: 'OBT-DEMO-001',
          name: 'Paracetamol 500 mg (Sanmol)',
          kekuatan: '500 mg',
          kelas: 'Analgesik / Antipiretik',
          category: 'Obat Bebas',
          satuanBesar: 'Box',
          satuanKecil: 'Tablet',
          rasioKonversi: 100,
          qtyBox: 2,
          qtyTotalKecil: 200,
          unitPriceBox: 38000,
          hppBox: 32000,
          subtotal: 76000
        },
        {
          medicineId: 'OBT-DEMO-007',
          name: 'Vitamin C 500 mg + Zinc (Enervon-C)',
          kekuatan: '500 mg',
          kelas: 'Multivitamin & Imunitas',
          category: 'Vitamin/Suplemen',
          satuanBesar: 'Box',
          satuanKecil: 'Kaplet',
          rasioKonversi: 100,
          qtyBox: 2,
          qtyTotalKecil: 200,
          unitPriceBox: 129000,
          hppBox: 115000,
          subtotal: 258000
        }
      ],
      totalItems: 2,
      totalQtyBox: 4,
      totalAmount: 334000,
      status: 'Pending',
      paymentMethod: 'QRIS',
      paymentStatus: 'Menunggu Verifikasi',
      paymentProofUrl: SAMPLE_TRANSFER_PROOF_SVG,
      paymentProofName: 'bukti-qris-klinik-sentosa-demo.svg',
      paymentUploadedAt: new Date(Date.now() - 1800 * 1000).toISOString(),
      paymentBankTarget: 'QRIS - APOTEK LATISHA FARMA (NMID: ID1026634857274)',
      notes: 'Mohon dikirim sore ini beserta nota resmi.',
      createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      branchId: 'BR-01'
    },
    {
      id: 'ORD-DEMO-002',
      orderCode: 'ORD-MTR-DEMO-102',
      mitraId: 'MTR-DEMO-002',
      mitraName: 'Apotek Mitra Sejahtera',
      mitraCategory: 'Apotek Mitra',
      mitraPhone: '0813-7700-2211',
      mitraAddress: 'Jl. Raya Lambu Kibang No. 45',
      picName: 'apt. Dian Permata, S.Farm',
      items: [
        {
          medicineId: 'OBT-DEMO-003',
          name: 'Amlodipine Besylate 10 mg',
          kekuatan: '10 mg',
          kelas: 'Antihipertensi',
          category: 'Obat Keras',
          satuanBesar: 'Box',
          satuanKecil: 'Tablet',
          rasioKonversi: 30,
          qtyBox: 3,
          qtyTotalKecil: 90,
          unitPriceBox: 22000,
          hppBox: 18000,
          subtotal: 66000
        }
      ],
      totalItems: 1,
      totalQtyBox: 3,
      totalAmount: 66000,
      status: 'Dikonfirmasi',
      paymentMethod: 'Transfer Bank',
      paymentStatus: 'Lunas',
      paymentProofUrl: SAMPLE_TRANSFER_PROOF_SVG,
      paymentProofName: 'bukti-transfer-bri-demo.svg',
      paymentVerifiedAt: new Date(Date.now() - 7200 * 1000).toISOString(),
      paymentVerifiedBy: 'apt. Mardin, S.Farm',
      paymentBankTarget: 'BRI - 7704-0101-3765-531 a/n Mardin',
      notes: 'Siap dikonversi ke Faktur Penjualan POS (1 klik).',
      createdAt: new Date(Date.now() - 10800 * 1000).toISOString(),
      branchId: 'BR-01'
    },
    {
      id: 'ORD-DEMO-003',
      orderCode: 'ORD-MTR-DEMO-103',
      mitraId: 'MTR-DEMO-003',
      mitraName: 'Praktik Mandiri Bidan Rina',
      mitraCategory: 'Lainnya',
      mitraPhone: '0822-5544-3322',
      mitraAddress: 'Desa Wiralaga Mulya RT 02',
      picName: 'Bidan Rina Marlina',
      items: [
        {
          medicineId: 'OBT-DEMO-004',
          name: 'Metformin HCl 500 mg',
          kekuatan: '500 mg',
          kelas: 'Antidiabetik',
          category: 'Obat Keras',
          satuanBesar: 'Box',
          satuanKecil: 'Tablet',
          rasioKonversi: 100,
          qtyBox: 1,
          qtyTotalKecil: 100,
          unitPriceBox: 34000,
          hppBox: 28000,
          subtotal: 34000
        }
      ],
      totalItems: 1,
      totalQtyBox: 1,
      totalAmount: 34000,
      status: 'Pending',
      paymentMethod: 'Transfer Bank',
      paymentStatus: 'Menunggu Pembayaran',
      notes: 'Menunggu upload bukti QRIS/Transfer dari Portal Mitra.',
      createdAt: new Date(Date.now() - 900 * 1000).toISOString(),
      branchId: 'BR-01'
    }
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'LOG-DEMO-01',
      time: '08:00:00',
      role: 'APJ / Owner',
      user: 'apt. Mardin, S.Farm',
      module: 'Mode Demo Sandbox',
      detail: 'Lingkungan uji coba terisolasi diaktifkan dengan dummy data lengkap.',
      branchId: 'BR-01'
    },
    {
      id: 'LOG-DEMO-02',
      time: '09:15:12',
      role: 'Kasir & Front Office',
      user: 'Dewi Lestari',
      module: 'POS Kasir',
      detail: 'Transaksi penjualan demo #TRX-DEMO-1002 (Rp 53.000) berhasil dicatat secara lokal.',
      branchId: 'BR-01'
    }
  ];

  const pharmacyProfile: PharmacyProfile = {
    name: 'Apotek Latisha Farma (Sandbox Demo)',
    sia: '445/098/SIA/DPMPTSP/2023',
    address: 'Jl. KTM Tanjung Mas Makmur Kec. Mesuji Timur',
    city: 'Kab. Mesuji, Lampung',
    phone: '0895326272957',
    email: 'apotek@latishafarma.com',
    npwp: '09.876.543.2-012.000',
    nib: '9120003456789',
    headerNote: 'Melayani Resep Dokter, Konsultasi Apoteker & Swamedikasi Terpercaya',
    operationalDays: 'Senin - Minggu',
    operationalOpenTime: '08:30',
    operationalCloseTime: '21:00',
    operationalSchedule: 'Senin - Minggu: 08.30 - 21.00 WIB',
    bankAccounts: [
      { id: 'BNK-1', bankName: 'SEABANK', accountNumber: '9015-5031-5849', accountHolder: 'Mardin' },
      { id: 'BNK-2', bankName: 'BRI', accountNumber: '7704-0101-3765-531', accountHolder: 'Mardin' }
    ]
  };

  const apjProfile: APJProfile = {
    name: 'apt. Mardin, S.Farm',
    sipa: '1993/SIPA/MSJ/2023',
    stra: '19930815/STRA-IAI/2018/2234',
    phone: '0812-8899-7722',
    schedule: 'Senin - Jumat: 08.00 - 16.00 WIB | Sabtu: 08.00 - 13.00 WIB',
    notes: 'Tersedia untuk Pelayanan Informasi Obat (PIO) & Konseling Pasien'
  };

  const dpjProfile: DPJProfile = {
    name: 'dr. Anis Prima Dewi',
    sip: 'SIP/2024/001-KNA',
    idi: 'KKI: 33.1.1.100.2.20.123456',
    specialization: 'Dokter Umum / Penanggung Jawab Klinis',
    phone: '0812-7389-1122',
    schedule: 'Senin - Sabtu: 08.00 - 20.00 WIB',
    notes: 'Penanggung Jawab Pelayanan Medis, RME SOAP & Surat Keterangan Dokter'
  };

  return {
    branches,
    medicines,
    patients,
    doctors: INITIAL_DOCTORS,
    staffList: INITIAL_STAFF,
    icd10List: INITIAL_ICD10_LIST,
    queue,
    onlineRegistrations,
    rmeRecords,
    labRecords,
    prescriptions,
    transactions,
    purchaseInvoices,
    purchaseOrders: [
      {
        id: 'PO-DEMO-001',
        poNumber: 'PO-DEMO-001',
        date: today,
        supplierId: 'SUP-001',
        supplierName: 'PT. Kimia Farma Trading & Distribution',
        supplierAddress: 'Jl. Soekarno Hatta No. 45, Bandar Lampung',
        supplierPhone: '0721-789012',
        supplierLicenseNo: 'PBF-1871/DINKES/2021',
        spNumbers: {
          REG: `ALF/REG/XI/${new Date().getFullYear()}/001`,
          ALK: `ALF/ALK/XI/${new Date().getFullYear()}/001`,
          PRE: `ALF/PRE/XI/${new Date().getFullYear()}/001`,
          OOT: `ALF/OOT/XI/${new Date().getFullYear()}/001`,
          PSI: `ALF/PSI/XI/${new Date().getFullYear()}/001`,
          NAR: `ALF/NAR/XI/${new Date().getFullYear()}/001`
        },
        status: 'Diproses',
        items: [
          {
            id: 'POI-DEMO-1',
            medicineId: 'OBT-001',
            name: 'Paracetamol 500mg',
            category: 'Obat Bebas',
            nappza: 'Non-NAPPZA',
            spType: 'REG',
            form: 'Tablet',
            kekuatan: '500 mg',
            satuanBesar: 'Box',
            satuanKecil: 'Strip',
            rasioKonversi: 10,
            currentStock: 12,
            minStock: 20,
            qtyBesar: 15,
            qtyKecil: 150,
            estimatedHna: 45000,
            subtotal: 675000
          },
          {
            id: 'POI-DEMO-2',
            medicineId: 'OBT-003',
            name: 'Tremenza Tablet (Pseudoephedrine HCl)',
            category: 'Obat Keras',
            nappza: 'Prekursor',
            spType: 'PRE',
            form: 'Tablet',
            kekuatan: '60 mg',
            satuanBesar: 'Box',
            satuanKecil: 'Strip',
            rasioKonversi: 10,
            currentStock: 4,
            minStock: 10,
            qtyBesar: 5,
            qtyKecil: 50,
            estimatedHna: 85000,
            subtotal: 425000
          }
        ],
        notes: 'Pesanan Re-Order Defecta rutin demo. Mohon dikirim beserta faktur resmi.',
        totalEstimatedCost: 1100000,
        branchId: 'BR-01',
        petugas: 'apt. Mardin, S.Farm',
        spPrintLogs: {
          REG: {
            printCount: 1,
            lastPrintedAt: new Date().toISOString(),
            lastPrintedBy: 'apt. Mardin, S.Farm'
          }
        },
        createdAt: new Date().toISOString()
      }
    ],
    stockMutations,
    transfers: [],
    auditLogs,
    feeConfig: DEFAULT_FEE_CONFIG,
    mitraList,
    suppliers,
    purchaseReturns: [],
    opnameRecords,
    cashierShifts,
    schedules: INITIAL_DUTY_SCHEDULES,
    mitraOrders,
    rolePermissions: DEFAULT_ROLE_PERMISSIONS,
    debtPayments: [],
    receivablePayments: [],
    cashFlowRecords: [],
    pharmacyProfile,
    apjProfile,
    dpjProfile,
    interaksiObat: INITIAL_INTERAKSI_OBAT
  };
}

/**
 * Populate isolated `latisha_demo_*` localStorage keys from fresh Demo dummy data.
 * Never touches production `latisha_*` keys.
 */
export function seedDemoSandboxStorage(forceReset = false): DemoSeedBundle {
  const seed = createDemoSeedData();
  if (typeof window === 'undefined') return seed;

  const alreadySeeded = localStorage.getItem(DEMO_INITIALIZED_KEY) === 'true';
  if (!forceReset && alreadySeeded) {
    return seed;
  }

  if (forceReset) {
    clearDemoSandboxStorage(true);
  }

  const demoWrite = (baseKey: string, val: unknown) => {
    const scopedKey = baseKey.startsWith('latisha_')
      ? baseKey.replace(/^latisha_/, DEMO_STORAGE_PREFIX)
      : `${DEMO_STORAGE_PREFIX}${baseKey}`;
    try {
      localStorage.setItem(scopedKey, typeof val === 'string' ? val : JSON.stringify(val));
    } catch {}
  };

  demoWrite('latisha_branches', seed.branches);
  demoWrite('latisha_medicines', seed.medicines);
  demoWrite('latisha_patients', seed.patients);
  demoWrite('latisha_staff', seed.staffList);
  demoWrite('latisha_icd10_list', seed.icd10List);
  demoWrite('latisha_queue', seed.queue);
  demoWrite('latisha_online_registrations', seed.onlineRegistrations);
  demoWrite('latisha_rme_records', seed.rmeRecords);
  demoWrite('latisha_lab_records', seed.labRecords);
  demoWrite('latisha_prescriptions', seed.prescriptions);
  demoWrite('latisha_transactions', seed.transactions);
  demoWrite('latisha_purchase_invoices', seed.purchaseInvoices);
  demoWrite('latisha_purchase_orders', seed.purchaseOrders);
  demoWrite('latisha_stock_mutations', seed.stockMutations);
  demoWrite('latisha_transfers', seed.transfers);
  demoWrite('latisha_audit_logs', seed.auditLogs);
  demoWrite('latisha_fee_config', seed.feeConfig);
  demoWrite('latisha_mitra', seed.mitraList);
  demoWrite('latisha_suppliers', seed.suppliers);
  demoWrite('latisha_purchase_returns', seed.purchaseReturns);
  demoWrite('latisha_stock_opname_records', seed.opnameRecords);
  demoWrite('latisha_cashier_shifts', seed.cashierShifts);
  demoWrite('latisha_cashier_shifts_cleared_v2', 'true');
  demoWrite('latisha_schedules', seed.schedules);
  demoWrite('latisha_mitra_orders', seed.mitraOrders);
  demoWrite('latisha_role_permissions', seed.rolePermissions);
  demoWrite('latisha_debt_payments', seed.debtPayments);
  demoWrite('latisha_receivable_payments', seed.receivablePayments);
  demoWrite('latisha_cash_flow', seed.cashFlowRecords);
  demoWrite('latisha_pharmacy_profile', seed.pharmacyProfile);
  demoWrite('latisha_apj_profile', seed.apjProfile);
  demoWrite('latisha_dpj_profile', seed.dpjProfile);
  demoWrite('latisha_interaksi_obat', seed.interaksiObat);
  demoWrite('latisha_active_staff_id', 'STF-001');
  demoWrite('latisha_active_role', 'APJ / Owner');
  demoWrite('latisha_user_name', 'apt. Mardin, S.Farm');
  demoWrite('latisha_is_logged_in', 'true');

  try {
    localStorage.setItem(DEMO_INITIALIZED_KEY, 'true');
  } catch {}

  return seed;
}

