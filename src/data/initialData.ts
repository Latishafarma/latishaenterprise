import {
  Medicine,
  Branch,
  StockMutation,
  Patient,
  PatientQueue,
  OnlineRegistration,
  Doctor,
  Staff,
  RMERecord,
  EPrescription,
  Transaction,
  PurchaseInvoice,
  StockTransfer,
  AuditLog,
  ICD10Item,
  Mitra,
  Supplier,
  DutySchedule,
  SYSTEM_PERMISSIONS
} from '../types';

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'BR-01',
    name: 'Apotek Latisha Farma (Pusat)',
    code: 'KTM-01',
    address: 'Jl. KTM Tanjung Mas Makmur Kec. Mesuji Timur Kab. Mesuji, Lampung',
    phone: '0895326272957',
    isCentral: true,
    syncStatus: 'Tersinkronisasi',
    lastSyncTime: 'Baru saja'
  },
  
  
];

export const INITIAL_ICD10_LIST: ICD10Item[] = [
  { code: 'J00', name: 'Nasofaringitis Akut / Common Cold (Batuk Pilek)', category: 'Respirasi' },
  { code: 'J02.9', name: 'Faringitis Akut (Sakit Tenggorokan)', category: 'Respirasi' },
  { code: 'J03.9', name: 'Tonsilitis Akut (Radang Amandel)', category: 'Respirasi' },
  { code: 'J06.9', name: 'Infeksi Saluran Pernapasan Atas Akut (ISPA)', category: 'Respirasi' },
  { code: 'J11.1', name: 'Influenza dengan Gejala Pernapasan', category: 'Respirasi' },
  { code: 'J18.9', name: 'Pneumonia / Radang Paru-Paru', category: 'Respirasi' },
  { code: 'J20.9', name: 'Bronkitis Akut', category: 'Respirasi' },
  { code: 'J45.9', name: 'Asma Bronkial', category: 'Respirasi' },
  { code: 'K29.7', name: 'Gastritis / Sakit Maag Akut', category: 'Pencernaan' },
  { code: 'K30', name: 'Dispepsia Fungsional (Nyeri Ulu Hati)', category: 'Pencernaan' },
  { code: 'A09', name: 'Gastroenteritis Infeksius / Diare / Muntaber', category: 'Pencernaan' },
  { code: 'K59.0', name: 'Konstipasi / Sembelit', category: 'Pencernaan' },
  { code: 'I10', name: 'Hipertensi Esensial (Tekanan Darah Tinggi)', category: 'Kardiovaskular' },
  { code: 'I11.9', name: 'Penyakit Jantung Hipertensi', category: 'Kardiovaskular' },
  { code: 'E11.9', name: 'Diabetes Melitus Tipe 2 Tanpa Komplikasi (Kencing Manis)', category: 'Endokrin' },
  { code: 'E11.65', name: 'Diabetes Melitus Tipe 2 dengan Hiperglikemia', category: 'Endokrin' },
  { code: 'E78.5', name: 'Hiperlipidemia (Kolesterol Tinggi)', category: 'Endokrin' },
  { code: 'E79.0', name: 'Hiperurisemia (Asam Urat Tinggi)', category: 'Endokrin' },
  { code: 'R50.9', name: 'Demam Tanpa Spesifikasi (Febris)', category: 'Gejala Umum' },
  { code: 'R51', name: 'Sefalgia / Sakit Kepala / Nyeri Kepala', category: 'Gejala Umum' },
  { code: 'R10.4', name: 'Nyeri Perut / Abdominal Pain', category: 'Gejala Umum' },
  { code: 'R11', name: 'Mual dan Muntah (Nausea & Vomiting)', category: 'Gejala Umum' },
  { code: 'M79.1', name: 'Mialgia (Nyeri Otot)', category: 'Muskuloskeletal' },
  { code: 'M54.5', name: 'Nyeri Punggung Bawah (Low Back Pain / LBP)', category: 'Muskuloskeletal' },
  { code: 'M25.5', name: 'Artralgia / Nyeri Sendi', category: 'Muskuloskeletal' },
  { code: 'L23.9', name: 'Dermatitis Kontak Alergi', category: 'Kulit' },
  { code: 'L30.9', name: 'Dermatitis / Eksim Non-Spesifik', category: 'Kulit' },
  { code: 'L50.9', name: 'Urtikaria / Biduran / Kaligata', category: 'Kulit' },
  { code: 'B35.1', name: 'Tinea Unguium / Jamur Kulit / Panu / Kurap', category: 'Kulit' },
  { code: 'H10.9', name: 'Konjungtivitis / Sakit Mata', category: 'Mata' },
  { code: 'N39.0', name: 'Infeksi Saluran Kemih (ISK)', category: 'Urologi' },
  { code: 'K04.0', name: 'Pulpitis / Sakit Gigi', category: 'Gigi & Mulut' },
  { code: 'K02.9', name: 'Karies Gigi / Gigi Berlubang', category: 'Gigi & Mulut' }
];

export const INITIAL_MEDICINES: Medicine[] = [
  {
    id: 'OBT-001',
    barcode: '106841',
    name: 'ACETYLCYSTEINE YARINDO 200MG BOX 10 STR @ 10 CAP',
    category: 'Obat Keras (Merah/K)',
    kelas: '',
    nappza: 'Non-NAPPZA',
    kekuatan: '200 mg',
    form: 'Kapsul',
    unit: 'KAPS',
    satuanKecil: 'KAPS',
    satuanBesar: 'BOX',
    rasioKonversi: 100,
    hnaBesar: 64102,
    hpp: Math.round(Math.round(64102 * 1.11) / 100),
    sellPrice: 1300,
    sellPriceKlinik: 1300,
    sellPriceMitra: 1300,
    markupReguler: 0,
    markupKlinik: 0,
    markupMitra: 0,
    stock: 150,
    minStock: 100,
    maxStock: 300,
    batchNo: 'BTH-AC200',
    expDate: '2027-12-31',
    rack: 'R-01',
    supplier: 'PT Yarindo Farmatama',
    branchId: 'BR-01'
  },
  {
    id: 'OBT-002',
    barcode: '10011483',
    name: 'ACIFAR 400 MG BOX 3 STR @ 10 KAPL',
    category: 'Obat Keras (Merah/K)',
    kelas: '',
    nappza: 'Non-NAPPZA',
    kekuatan: '400 mg',
    form: 'Kaplet',
    unit: 'KAPLET',
    satuanKecil: 'KAPLET',
    satuanBesar: 'BOX',
    rasioKonversi: 30,
    hnaBesar: 29600,
    hpp: Math.round(Math.round(29600 * 1.11) / 30),
    sellPrice: 2085,
    sellPriceKlinik: 2085,
    sellPriceMitra: 2085,
    markupReguler: 141.15,
    markupKlinik: 141.15,
    markupMitra: 25,
    stock: 120,
    minStock: 30,
    maxStock: 500,
    batchNo: 'BTH-ACF400',
    expDate: '2028-06-30',
    rack: 'R-02',
    supplier: 'PBF Resmi',
    branchId: 'BR-01'
  },
  {
    id: 'OBT-003',
    barcode: '10011484',
    name: 'ACIFAR 5% CREAM 5GR TUB',
    category: 'Obat Keras (Merah/K)',
    kelas: '',
    nappza: 'Non-NAPPZA',
    kekuatan: '5%',
    form: 'Cream',
    unit: 'TUB',
    satuanKecil: 'TUB',
    satuanBesar: 'TUB',
    rasioKonversi: 1,
    hnaBesar: 6441,
    hpp: Math.round(6441 * 1.11),
    sellPrice: 12184,
    sellPriceKlinik: 12184,
    sellPriceMitra: 12184,
    markupReguler: 141.07,
    markupKlinik: 141.07,
    markupMitra: 25,
    stock: 45,
    minStock: 5,
    maxStock: 50,
    batchNo: 'BTH-ACFCRM',
    expDate: '2028-10-31',
    rack: 'H5',
    supplier: 'PBF Resmi',
    branchId: 'BR-01'
  }
];

export const INITIAL_PATIENTS: Patient[] = [];

export const INITIAL_DOCTORS: Doctor[] = [
  {
    id: 'DOC-001',
    name: 'dr. Anis Prima Dewi',
    sip: 'SIP/2024/001-KNA',
    specialization: 'Dokter Umum',
    feePerPatient: 20000,
    commissionPercent: 10,
    phone: '0812-7711-2233',
    earnedCommission: 0,
    status: 'Aktif'
  }
];

export const INITIAL_STAFF: Staff[] = [
  {
    id: 'STF-001',
    name: 'apt. Mardin, S.Farm',
    role: 'APJ / Owner',
    roles: ['APJ / Owner'],
    permissions: SYSTEM_PERMISSIONS.map((p) => p.id),
    phone: '0812-3456-7890',
    status: 'Aktif',
    branchId: 'BR-01'
  },
  {
    id: 'STF-002',
    name: 'dr. Anis Prima Dewi',
    role: 'Dokter',
    phone: '0812-7711-2233',
    status: 'Aktif',
    branchId: 'BR-01'
  },
  {
    id: 'STF-003',
    name: 'Siti Rahma, A.Md.Far',
    role: 'Apoteker',
    phone: '0819-8765-4321',
    status: 'Aktif',
    branchId: 'BR-01'
  },
  {
    id: 'STF-004',
    name: 'Ns. Ratna Sari, S.Kep',
    role: 'Perawat / Bidan',
    phone: '0821-3344-9988',
    status: 'Aktif',
    branchId: 'BR-01'
  },
  {
    id: 'STF-005',
    name: 'Dewi Lestari',
    role: 'Kasir & Front Office',
    phone: '0857-1122-3344',
    status: 'Aktif',
    branchId: 'BR-01'
  }
];

export const INITIAL_PATIENT_QUEUE: PatientQueue[] = [];

export const INITIAL_ONLINE_REGISTRATIONS: OnlineRegistration[] = [];

export const INITIAL_RME_RECORDS: RMERecord[] = [];

export const INITIAL_E_PRESCRIPTIONS: EPrescription[] = [];

export const INITIAL_PURCHASE_INVOICES: PurchaseInvoice[] = [];

export const INITIAL_TRANSACTIONS: Transaction[] = [];

export const INITIAL_STOCK_MUTATIONS: StockMutation[] = [];

export const INITIAL_TRANSFERS: StockTransfer[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

export const INITIAL_MITRA: Mitra[] = [];

export const INITIAL_SUPPLIERS: Supplier[] = [];

export const INITIAL_DUTY_SCHEDULES: DutySchedule[] = [
  {
    id: 'SCH-001',
    staffId: 'STF-002',
    staffName: 'dr. Anis Prima Dewi',
    staffRole: 'Dokter',
    day: 'Senin',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Poli Umum',
    sessionLabel: 'Full Day (Fleksibel)',
    quotaPerDay: 40,
    status: 'Aktif',
    notes: 'Praktik Dokter Umum & Konsultasi Medis Keluarga',
    phone: '0812-7711-2233'
  },
  {
    id: 'SCH-002',
    staffId: 'STF-002',
    staffName: 'dr. Anis Prima Dewi',
    staffRole: 'Dokter',
    day: 'Selasa',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Poli Umum',
    sessionLabel: 'Full Day (Fleksibel)',
    quotaPerDay: 40,
    status: 'Aktif',
    notes: 'Praktik Dokter Umum',
    phone: '0812-7711-2233'
  },
  {
    id: 'SCH-003',
    staffId: 'STF-002',
    staffName: 'dr. Anis Prima Dewi',
    staffRole: 'Dokter',
    day: 'Rabu',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Poli Umum',
    sessionLabel: 'Full Day (Fleksibel)',
    quotaPerDay: 40,
    status: 'Aktif',
    notes: 'Praktik Dokter Umum & Pemeriksaan Rutin',
    phone: '0812-7711-2233'
  },
  {
    id: 'SCH-004',
    staffId: 'STF-002',
    staffName: 'dr. Anis Prima Dewi',
    staffRole: 'Dokter',
    day: 'Kamis',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Poli Umum',
    sessionLabel: 'Full Day (Fleksibel)',
    quotaPerDay: 40,
    status: 'Aktif',
    notes: 'Praktik Dokter Umum',
    phone: '0812-7711-2233'
  },
  {
    id: 'SCH-005',
    staffId: 'STF-002',
    staffName: 'dr. Anis Prima Dewi',
    staffRole: 'Dokter',
    day: 'Jumat',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Poli Umum',
    sessionLabel: 'Full Day (Fleksibel)',
    quotaPerDay: 35,
    status: 'Aktif',
    notes: 'Istirahat Sholat Jumat 11:30 - 13:30 WIB',
    phone: '0812-7711-2233'
  },
  {
    id: 'SCH-006',
    staffId: 'STF-002',
    staffName: 'dr. Anis Prima Dewi',
    staffRole: 'Dokter',
    day: 'Sabtu',
    startTime: '08:00',
    endTime: '17:00',
    serviceUnit: 'Poli Umum',
    sessionLabel: 'Shift Weekend',
    quotaPerDay: 30,
    status: 'Aktif',
    notes: 'Pelayanan Pasien Umum & Rujukan',
    phone: '0812-7711-2233'
  },
  {
    id: 'SCH-007',
    staffId: 'STF-002',
    staffName: 'dr. Anis Prima Dewi',
    staffRole: 'Dokter',
    day: 'Minggu',
    startTime: '09:00',
    endTime: '14:00',
    serviceUnit: 'Poli Umum',
    sessionLabel: 'On-Call / Perjanjian',
    quotaPerDay: 15,
    status: 'On-Call',
    notes: 'Konfirmasi pendaftaran via WhatsApp terlebih dahulu',
    phone: '0812-7711-2233'
  },
  {
    id: 'SCH-008',
    staffId: 'STF-001',
    staffName: 'apt. Mardin, S.Farm',
    staffRole: 'APJ / Owner',
    day: 'Senin',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Konseling Farmasi',
    sessionLabel: 'Pagi - Malam (Full Day)',
    quotaPerDay: 50,
    status: 'Aktif',
    notes: 'Pelayanan Informasi Obat (PIO), Konseling Terapi Obat Kronis & Skrining Resep',
    phone: '0895326272957'
  },
  {
    id: 'SCH-009',
    staffId: 'STF-001',
    staffName: 'apt. Mardin, S.Farm',
    staffRole: 'APJ / Owner',
    day: 'Selasa',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Konseling Farmasi',
    sessionLabel: 'Pagi - Malam (Full Day)',
    quotaPerDay: 50,
    status: 'Aktif',
    notes: 'Konseling Farmasi & Pengawasan Distribusi Apotek',
    phone: '0895326272957'
  },
  {
    id: 'SCH-010',
    staffId: 'STF-001',
    staffName: 'apt. Mardin, S.Farm',
    staffRole: 'APJ / Owner',
    day: 'Rabu',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Konseling Farmasi',
    sessionLabel: 'Pagi - Malam (Full Day)',
    quotaPerDay: 50,
    status: 'Aktif',
    notes: 'Konseling Farmasi & Skrining Interaksi Obat',
    phone: '0895326272957'
  },
  {
    id: 'SCH-011',
    staffId: 'STF-001',
    staffName: 'apt. Mardin, S.Farm',
    staffRole: 'APJ / Owner',
    day: 'Kamis',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Konseling Farmasi',
    sessionLabel: 'Pagi - Malam (Full Day)',
    quotaPerDay: 50,
    status: 'Aktif',
    notes: 'Konseling Farmasi & Monitoring Efek Samping Obat (MESO)',
    phone: '0895326272957'
  },
  {
    id: 'SCH-012',
    staffId: 'STF-001',
    staffName: 'apt. Mardin, S.Farm',
    staffRole: 'APJ / Owner',
    day: 'Jumat',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Konseling Farmasi',
    sessionLabel: 'Pagi - Malam (Full Day)',
    quotaPerDay: 50,
    status: 'Aktif',
    notes: 'Konseling Farmasi & Pengelolaan Sediaan Farmasi',
    phone: '0895326272957'
  },
  {
    id: 'SCH-013',
    staffId: 'STF-001',
    staffName: 'apt. Mardin, S.Farm',
    staffRole: 'APJ / Owner',
    day: 'Sabtu',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Konseling Farmasi',
    sessionLabel: 'Pagi - Malam (Full Day)',
    quotaPerDay: 40,
    status: 'Aktif',
    notes: 'Konseling Pasien & Edukasi Penggunaan Obat Rasional',
    phone: '0895326272957'
  },
  {
    id: 'SCH-014',
    staffId: 'STF-003',
    staffName: 'Siti Rahma, A.Md.Far',
    staffRole: 'Apoteker',
    day: 'Senin',
    startTime: '08:00',
    endTime: '16:00',
    serviceUnit: 'Kasir & Front Office',
    sessionLabel: 'Shift Pagi - Siang',
    quotaPerDay: 50,
    status: 'Aktif',
    notes: 'Peracikan Resep, Kasir & Penyerahan Obat',
    phone: '0819-8765-4321'
  },
  {
    id: 'SCH-015',
    staffId: 'STF-004',
    staffName: 'Ns. Ratna Sari, S.Kep',
    staffRole: 'Perawat / Bidan',
    day: 'Senin',
    startTime: '08:00',
    endTime: '16:00',
    serviceUnit: 'Poli Umum',
    sessionLabel: 'Shift Pagi',
    quotaPerDay: 40,
    status: 'Aktif',
    notes: 'Pemeriksaan Tanda Vital & Triase Pasien',
    phone: '0821-3344-9988'
  },
  {
    id: 'SCH-016',
    staffId: 'STF-005',
    staffName: 'Dewi Lestari',
    staffRole: 'Kasir & Front Office',
    day: 'Senin',
    startTime: '08:00',
    endTime: '20:00',
    serviceUnit: 'Kasir & Front Office',
    sessionLabel: 'Full Day (Fleksibel)',
    quotaPerDay: 60,
    status: 'Aktif',
    notes: 'Pendaftaran Pasien, Kasir POS & Rekap Transaksi Harian',
    phone: '0857-1122-3344'
  }
];
