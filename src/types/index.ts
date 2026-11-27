export interface MedicineBatch {
  id: string;
  batchNo: string;
  expDate: string;
  stock: number; // in small unit (satuan terkecil)
}

export interface Medicine {
  id: string;
  barcode: string;
  name: string;
  category: 'Obat Bebas' | 'Obat Bebas Terbatas' | 'Obat Keras' | 'Alat Kesehatan' | 'Vitamin/Suplemen' | 'Makanan/Minuman' | 'Kosmetic' | 'Skincare' | 'Jamu/Herbal' | string;
  kelas?: string; // Kelas Terapi (e.g. Analgesik / Antipiretik, Antibiotik, Antihipertensi, dll)
  nappza?: 'Non-NAPPZA' | 'Prekursor' | 'OOT' | 'Psikotropik' | 'Narkotik' | string; // Kategori NAPPZA
  statusResep?: string; // Status Resep Order Portal: 'Tanpa Resep' | 'Wajib Resep Dokter' | 'Wajib Resep Asli' | status kustom
  kekuatan?: string; // Zat Aktif & Kekuatan Sediaan (e.g. Paracetamol 500 mg, Amoxicillin 500 mg)
  form: string; // Tablet, Sirup, Kaplet, Kapsul, Salep, Injeksi, etc.
  unit: string;
  satuanKecil: string;
  satuanBesar: string;
  rasioKonversi: number;
  hnaBesar: number;
  hpp: number;
  sellPrice: number; // Reguler / OTC
  sellPriceKlinik: number; // Pasien Klinik
  sellPriceMitra: number; // Nakes / Mitra
  markupReguler?: number;
  markupKlinik?: number;
  markupMitra?: number;
  stock: number;
  minStock: number;
  maxStock: number;
  batchNo: string;
  expDate: string;
  batches?: MedicineBatch[]; // Multi-batch & multi-ED support (FEFO sorted)
  rack: string;
  supplier: string;
  branchId: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  isCentral: boolean;
  syncStatus: 'Tersinkronisasi' | 'Sinkronisasi Berjalan' | 'Offline';
  lastSyncTime: string;
  latitude?: number;
  longitude?: number;
}

export interface StockMutationBatchDetail {
  batchNo: string;
  expDate: string;
  qty: number;
}

export interface StockMutation {
  id: string;
  date: string;
  time: string;
  medicineId: string;
  medicineName: string;
  refNo: string;
  type: 'PEMBELIAN' | 'PENJUALAN' | 'TRANSFER_KELUAR' | 'TRANSFER_MASUK' | 'PENYESUAIAN' | 'RESEP_DOKTER' | 'RETUR PEMBELIAN' | 'STOK_OPNAME' | 'BATAL_BELI' | 'STOK_AWAL';
  inQty: number;
  outQty: number;
  balance: number;
  ket: string;
  petugas: string;
  branchId: string;
  hpp?: number;
  nominalDiff?: number;
  batchNo?: string;
  expDate?: string;
  batchDetails?: StockMutationBatchDetail[];
}

export interface StockOpnameBatchRecord {
  batchNo: string;
  expDate: string;
  systemStock: number;
  physicalStock: number;
  difference: number;
}

export interface StockOpnameItemRecord {
  medicineId: string;
  medicineName: string;
  unit: string;
  hpp: number;
  hppBesar?: number;
  sellPrice: number;
  systemStock: number;
  physicalStock: number;
  difference: number;
  nominalDiffHpp: number; // difference * hpp
  nominalDiffSell: number; // difference * sellPrice
  reason: string;
  batchNo?: string;
  expDate?: string;
  batches?: StockOpnameBatchRecord[];
}

export type StockOpnameKind = 'PENYESUAIAN_STOK' | 'STOK_AWAL';

export interface StockOpnameRecord {
  id: string;
  refNo: string;
  date: string; // YYYY-MM-DD
  time: string;
  petugas: string;
  branchId: string;
  branchName: string;
  opnameKind?: StockOpnameKind;
  totalItemsCounted: number;
  matchCount: number;
  surplusCount: number;
  deficitCount: number;
  totalSurplusNominal: number; // positive nominal (Rp)
  totalDeficitNominal: number; // absolute value of deficit nominal (Rp)
  netNominalDiff: number; // totalSurplusNominal - totalDeficitNominal
  notes?: string;
  items: StockOpnameItemRecord[];
}

export interface LiveOpnameItemActivity {
  medicineId: string;
  medicineName: string;
  staffName: string;
  sessionId: string;
  branchId?: string;
  physicalStock?: string;
  unit?: string;
  batchCount?: number;
  statusText?: string;
  isFocused?: boolean;
  updatedAt: string; // ISO string
  updatedTimeLabel?: string; // HH:mm:ss WIB
}

export interface Patient {
  id: string; // No. RM (displayed identifier)
  dbId?: string; // Primary key `id` di tabel `pasien` Supabase (jika berbeda dari `no_rm`, misal PAS-001)
  noRm?: string; // Nilai kolom `no_rm` asli di tabel `pasien` Supabase
  nik: string;
  name: string;
  age: number;
  gender: 'Laki-laki' | 'Perempuan';
  birthDate: string;
  phone: string;
  address: string;
  allergy: string;
  category: 'Pasien Umum' | 'Pasien Praktik' | 'Mitra Perusahaan';
  bpjsNo?: string;
  registeredOnline?: boolean;
  registrationDate: string;
  ihsNumber?: string; // ID SATUSEHAT (IHS Number) hasil lookup NIK Kemenkes
  syncSatusehat?: 'pending' | 'sent' | 'failed';
  satusehatSyncedAt?: string;
}

export interface SatuSehatLogEntry {
  id: string;
  entityType: 'Patient' | 'Encounter' | 'Condition' | 'MedicationRequest' | 'MedicationDispense' | 'ClinicalBundle';
  localRecordId: string;
  patientId?: string;
  patientIhsNumber?: string;
  fhirResourceId?: string;
  status: 'pending' | 'sent' | 'failed';
  httpStatus?: number;
  requestPayload?: Record<string, any>;
  responsePayload?: Record<string, any>;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export interface VitalSign {
  td: string; // mmHg e.g. 120/80
  suhu: number; // Celcius e.g. 36.5
  nadi: number; // bpm e.g. 80
  spo2: number; // % e.g. 98
  bb?: number; // kg
  tb?: number; // cm
  respirasi?: number; // x/menit
}

export interface PatientQueue {
  nomor: string; // A-001, A-002
  rmId: string;
  name: string;
  age: number;
  gender: 'Laki-laki' | 'Perempuan';
  vital: VitalSign;
  status: 'Menunggu' | 'Diperiksa' | 'Farmasi' | 'Selesai' | 'Batal';
  doctorId: string;
  doctorName: string;
  checkinTime: string;
  source: 'Pendaftaran Langsung (Walk-in)' | 'Pendaftaran Online';
  complaint: string;
  serviceType: string;
  branchId: string;
}

export interface OnlineRegistration {
  id: string;
  bookingCode: string;
  nik: string;
  name: string;
  phone: string;
  birthDate: string;
  gender: 'Laki-laki' | 'Perempuan';
  address: string;
  appointmentDate: string;
  appointmentTime: string;
  doctorId: string;
  doctorName: string;
  serviceType: string;
  paymentType: 'Umum / Mandiri';
  complaint: string;
  allergy: string;
  status: 'Menunggu Verifikasi' | 'Diterima' | 'Ditolak' | 'Selesai';
  createdAt: string;
  branchId: string;
}

export interface Doctor {
  id: string;
  name: string;
  sip: string;
  specialization: string;
  feePerPatient: number;
  commissionPercent: number;
  phone: string;
  earnedCommission: number;
  status: 'Aktif' | 'Cuti';
  schedule?: string;
}

export type ScheduleDay = 'Senin' | 'Selasa' | 'Rabu' | 'Kamis' | 'Jumat' | 'Sabtu' | 'Minggu';

export interface DutySchedule {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  day: ScheduleDay;
  scheduleDate?: string; // YYYY-MM-DD (kosong jika berlaku rutin setiap pekan)
  startTime: string; // e.g. "08:00"
  endTime: string; // e.g. "20:00"
  serviceUnit: 'Poli Umum' | 'Konseling Farmasi' | 'Kasir & Front Office' | 'Laboratorium' | string;
  sessionLabel: string; // e.g. "Full Day", "Pagi", "Sore/Malam"
  quotaPerDay?: number;
  status: 'Aktif' | 'Cuti / Libur' | 'On-Call';
  notes?: string;
  phone?: string;
}

export type StaffRole =
  | 'APJ / Owner'
  | 'Dokter'
  | 'Apoteker'
  | 'Perawat / Bidan'
  | 'Perawat / Nakes Lapangan'
  | 'Kasir & Front Office';

export const OWNER_ADMIN_ROLE: StaffRole = 'APJ / Owner';

export const isOwnerAdminRole = (role?: string | null): boolean => {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ');
  return (
    normalized === 'apj / owner' ||
    normalized === 'owner / apj' ||
    normalized === 'apj / owner (super admin)' ||
    normalized === 'super admin / apj' ||
    normalized === 'super admin' ||
    normalized === 'owner' ||
    normalized === 'apj' ||
    normalized === 'apoteker penanggung jawab'
  );
};

export const normalizeStaffRole = (
  role?: string | null,
  fallback: StaffRole = 'Apoteker'
): StaffRole => {
  if (isOwnerAdminRole(role)) return 'APJ / Owner';
  const trimmed = String(role || '').trim();
  const validRoles: StaffRole[] = [
    'APJ / Owner',
    'Dokter',
    'Apoteker',
    'Perawat / Bidan',
    'Perawat / Nakes Lapangan',
    'Kasir & Front Office'
  ];
  const matched = validRoles.find((r) => r.toLowerCase() === trimmed.toLowerCase());
  return matched || fallback;
};

export type PtkpStatus =
  | 'TK/0'
  | 'TK/1'
  | 'TK/2'
  | 'TK/3'
  | 'K/0'
  | 'K/1'
  | 'K/2'
  | 'K/3';

export type StaffTaxCategory = 'pegawai_tetap' | 'bukan_pegawai';

export type StaffStatus = 'Aktif' | 'Non-Aktif' | 'Menunggu Validasi';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  roles?: StaffRole[]; // Multi-role checkbox support
  permissions?: string[]; // Custom module access checkboxes per staff
  phone: string;
  status: StaffStatus;
  branchId: string;
  npwpNik?: string;
  ptkpStatus?: PtkpStatus;
  taxCategory?: StaffTaxCategory;
  sipNumber?: string; // No. SIP (Dokter) atau No. SIP / SIPA (Apoteker)
  sipbNumber?: string; // No. SIPB / E-STR (Bidan / Perawat)
  estrNumber?: string; // No. E-STR (Dokter / Apoteker)
  isDpj?: boolean; // Checkbox Dokter Penanggung Jawab (khusus role Dokter)
  registeredAt?: string; // Timestamp pendaftaran mandiri pegawai
  validatedAt?: string; // Timestamp validasi oleh APJ / Owner
  validatedBy?: string; // Nama APJ / Owner yang memvalidasi
}

export interface PermissionItem {
  id: string;
  label: string;
  category: string;
  superAdminOnly?: boolean;
}

export const SYSTEM_PERMISSIONS: PermissionItem[] = [
  { id: 'dashboard', label: 'Dashboard Eksekutif', category: 'Umum' },
  { id: 'fo-antrean', label: 'Live Monitor & Suara Antrean', category: '1. Front Office & Antrean' },
  { id: 'fo-pasien', label: 'Master Pasien & Kartu QR', category: '1. Front Office & Antrean' },
  { id: 'fo-checkin', label: 'Check-in & Tanda Vital', category: '1. Front Office & Antrean' },
  { id: 'fo-online', label: 'Pendaftaran Online', category: '1. Front Office & Antrean' },
  { id: 'rme-pemeriksaan', label: 'Ruang Periksa Dokter (SOAP)', category: '2. Pelayanan Dokter & RME' },
  { id: 'rme-cek-lab', label: 'Cek Lab & Diagnostik', category: '2. Pelayanan Dokter & RME' },
  { id: 'rme-riwayat', label: 'Arsip e-RME & Riwayat', category: '2. Pelayanan Dokter & RME' },
  { id: 'rme-laporan', label: 'Laporan Medis & Morbiditas', category: '2. Pelayanan Dokter & RME' },
  { id: 'rme-jadwal', label: 'Jadwal Dokter & Petugas Apotek', category: '2. Pelayanan Dokter & RME' },
  { id: 'pos-kasir', label: 'Form POS Kasir Multi-Tier', category: '3. Farmasi & Kasir POS' },
  { id: 'pos-resep', label: 'Antrean E-Resep & Skrining', category: '3. Farmasi & Kasir POS' },
  { id: 'pos-mitra-orders', label: 'Pesanan Penjualan Mitra', category: '3. Farmasi & Kasir POS' },
  { id: 'pos-riwayat', label: 'Riwayat & Faktur Penjualan', category: '3. Farmasi & Kasir POS' },
  { id: 'inv-master', label: 'Master Obat & Harga Bertingkat', category: '4. Inventaris & Logistik Pusat' },
  { id: 'inv-kartu-stok', label: 'Mutasi & Kartu Stok Digital', category: '4. Inventaris & Logistik Pusat' },
  { id: 'inv-stok-opname', label: 'Stok Opname (Live)', category: '4. Inventaris & Logistik Pusat' },
  { id: 'inv-pembelian', label: 'Pembelian & Faktur PBF', category: '4. Inventaris & Logistik Pusat' },
  { id: 'inv-retur-riwayat', label: 'Retur Pembelian', category: '4. Inventaris & Logistik Pusat' },
  { id: 'inv-defecta', label: 'Defecta & Re-Order Otomatis', category: '4. Inventaris & Logistik Pusat' },
  { id: 'keuangan-labarugi', label: 'Laba Rugi & Valuasi Aset', category: '5. Keuangan & Akuntansi' },
  { id: 'keuangan-hutang-piutang', label: 'Hutang & Piutang', category: '5. Keuangan & Akuntansi' },
  { id: 'keuangan-setting', label: 'Gaji, Jasa, Fee & Lembur', category: '5. Keuangan & Akuntansi' },
  { id: 'keuangan-pph', label: 'Estimasi PPh (WP OP)', category: '5. Keuangan & Akuntansi' },
  { id: 'sys-cabang', label: 'Sinkronisasi Multi-Cabang', category: '6. Sistem & Multi-Cabang' },
  { id: 'sys-satusehat', label: 'Integrasi SATUSEHAT Kemenkes', category: '6. Sistem & Multi-Cabang' },
  { id: 'sys-audit', label: 'Audit Trail & Riwayat Log', category: '6. Sistem & Multi-Cabang' },
  { id: 'sys-marketing', label: 'Strategi Marketing', category: '6. Sistem & Multi-Cabang' },
  { id: 'setup-mitra', label: 'Mitra (Fasilitas Kesehatan)', category: '7. Setup & Pengaturan' },
  { id: 'setup-supplier', label: 'Supplier (Distributor & PBF)', category: '7. Setup & Pengaturan' },
  { id: 'setup-diskon-promo', label: 'Manajemen Diskon & Promo', category: '7. Setup & Pengaturan' },
  { id: 'setup-database', label: 'Export & Import Database', category: '7. Setup & Pengaturan' },
  { id: 'mobile-lapangan', label: 'Mode Mobile Lapangan (Nakes / Opname)', category: '7. Setup & Pengaturan' },
  {
    id: 'sys-profil-fasilitas',
    label: 'Pengaturan Sistem & Profil Fasilitas (Khusus APJ / Owner)',
    category: '7. Setup & Pengaturan',
    superAdminOnly: true
  }
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  'APJ / Owner': SYSTEM_PERMISSIONS.map((p) => p.id),
  'Dokter': [
    'dashboard',
    'fo-antrean',
    'fo-pasien',
    'fo-checkin',
    'rme-pemeriksaan',
    'rme-cek-lab',
    'rme-riwayat',
    'rme-laporan',
    'rme-jadwal'
  ],
  'Apoteker': [
    'dashboard',
    'fo-antrean',
    'rme-cek-lab',
    'rme-jadwal',
    'pos-kasir',
    'pos-resep',
    'pos-mitra-orders',
    'pos-riwayat',
    'inv-master',
    'inv-kartu-stok',
    'inv-stok-opname',
    'inv-pembelian',
    'inv-retur-riwayat',
    'inv-defecta',
    'setup-supplier',
    'setup-diskon-promo',
    'mobile-lapangan',
    'sys-satusehat',
    'sys-marketing'
  ],
  'Perawat / Bidan': [
    'dashboard',
    'fo-antrean',
    'fo-pasien',
    'fo-checkin',
    'fo-online',
    'rme-cek-lab',
    'rme-riwayat',
    'rme-jadwal',
    'inv-stok-opname',
    'mobile-lapangan'
  ],
  'Perawat / Nakes Lapangan': [
    'dashboard',
    'fo-antrean',
    'fo-pasien',
    'fo-checkin',
    'rme-cek-lab',
    'rme-jadwal',
    'inv-stok-opname',
    'mobile-lapangan'
  ],
  'Kasir & Front Office': [
    'dashboard',
    'fo-antrean',
    'fo-pasien',
    'fo-checkin',
    'fo-online',
    'rme-jadwal',
    'pos-kasir',
    'pos-resep',
    'pos-mitra-orders',
    'pos-riwayat',
    'keuangan-hutang-piutang'
  ]
};

export const isPrimaryOwnerStaffRecord = (
  st?: Pick<Staff, 'id' | 'name'> | null
): boolean => {
  if (!st) return false;
  const normName = String(st.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
  return normName.includes('mardin');
};

export const ensurePrimaryOwnerStaffRole = (
  st: Staff
): { staff: Staff; changed: boolean } => {
  const normalizedRole = normalizeStaffRole(st.role, 'Apoteker');
  const rawRoles: StaffRole[] =
    Array.isArray(st.roles) && st.roles.length > 0
      ? Array.from(new Set(st.roles.map((r) => normalizeStaffRole(r, normalizedRole))))
      : [normalizedRole];

  if (!isPrimaryOwnerStaffRecord(st)) {
    const baseChanged =
      st.role !== normalizedRole ||
      (Array.isArray(st.roles) &&
        (st.roles.length !== rawRoles.length ||
          st.roles.some((r, idx) => r !== rawRoles[idx])));
    return {
      staff: baseChanged ? { ...st, role: normalizedRole, roles: rawRoles } : st,
      changed: baseChanged
    };
  }

  const allPerms = SYSTEM_PERMISSIONS.map((p) => p.id);
  const alreadyHasOwner = rawRoles.some((r) => isOwnerAdminRole(r));
  let nextRoles: StaffRole[];
  if (alreadyHasOwner) {
    nextRoles = Array.from(
      new Set<StaffRole>([OWNER_ADMIN_ROLE, ...rawRoles.filter((r) => !isOwnerAdminRole(r))])
    );
  } else if (rawRoles.length === 1 && rawRoles[0] === 'Apoteker') {
    nextRoles = [OWNER_ADMIN_ROLE];
  } else {
    nextRoles = Array.from(new Set<StaffRole>([OWNER_ADMIN_ROLE, ...rawRoles]));
  }

  const hasAllPerms =
    Array.isArray(st.permissions) &&
    allPerms.every((permId) => st.permissions!.includes(permId));

  const needsUpdate =
    st.role !== OWNER_ADMIN_ROLE ||
    !Array.isArray(st.roles) ||
    !st.roles.some((r) => isOwnerAdminRole(r)) ||
    st.status !== 'Aktif' ||
    !hasAllPerms;

  if (!needsUpdate) {
    return { staff: st, changed: false };
  }

  return {
    staff: {
      ...st,
      role: OWNER_ADMIN_ROLE,
      roles: nextRoles,
      status: 'Aktif',
      permissions: allPerms
    },
    changed: true
  };
};

export const getStaffActiveRoles = (
  st?: Staff | null,
  fallbackRole: StaffRole = 'Apoteker'
): StaffRole[] => {
  const safeFallback = normalizeStaffRole(fallbackRole, 'Apoteker');
  if (!st) return [safeFallback];
  const baseRoles =
    st.roles && st.roles.length > 0
      ? Array.from(new Set(st.roles.map((r) => normalizeStaffRole(r, safeFallback))))
      : [normalizeStaffRole(st.role, safeFallback)];
  if (isPrimaryOwnerStaffRecord(st) && !baseRoles.some((r) => isOwnerAdminRole(r))) {
    if (baseRoles.length === 1 && baseRoles[0] === 'Apoteker') {
      return [OWNER_ADMIN_ROLE];
    }
    return [OWNER_ADMIN_ROLE, ...baseRoles];
  }
  return baseRoles;
};

export const resolveStaffEffectivePermissions = (
  st: Staff | null | undefined,
  activeRole: string,
  rolePermissions: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS
): string[] => {
  const validPermIds = new Set(SYSTEM_PERMISSIONS.map((p) => p.id));
  const normalizedActive = normalizeStaffRole(activeRole, 'Apoteker');
  const roles = getStaffActiveRoles(st, normalizedActive);
  const hasSuperAdmin =
    roles.some((r) => isOwnerAdminRole(r)) || isOwnerAdminRole(activeRole);

  if (hasSuperAdmin) {
    return SYSTEM_PERMISSIONS.map((p) => p.id);
  }

  if (st && Array.isArray(st.permissions)) {
    return st.permissions.filter(
      (id) => validPermIds.has(id) && id !== 'sys-profil-fasilitas'
    );
  }

  const merged = new Set<string>();
  roles.forEach((r) => {
    const list = rolePermissions[r] || DEFAULT_ROLE_PERMISSIONS[r] || [];
    list.forEach((pId) => {
      if (validPermIds.has(pId) && pId !== 'sys-profil-fasilitas') {
        merged.add(pId);
      }
    });
  });

  return Array.from(merged);
};

export interface CompoundIngredientItem {
  medicineId: string;
  name: string;
  qtyPerDose?: number;
  totalQty: number;
  unit: string;
  price: number;
  hpp?: number;
  expDate?: string;
}

export interface PrescriptionItem {
  medicineId: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  dosage: string;
  notes?: string;
  isRacikan?: boolean;
  racikanType?: 'Puyer' | 'Kapsul Racikan' | 'Salep Racikan' | 'Sirup Racikan';
  racikanMethod?: 'dtd' | 'non-dtd';
  racikanName?: string;
  racikanIngredients?: CompoundIngredientItem[];
  budDate?: string;
}

export interface StaffFeeItem {
  staffId: string;
  staffName: string;
  role: string;
  fee: number;
}

export interface RMERecord {
  id: string;
  date: string;
  time: string;
  rmId: string;
  patientName: string;
  nik: string;
  age: number;
  gender: 'Laki-laki' | 'Perempuan';
  doctorName: string;
  doctorId: string;
  vitalSign: VitalSign;
  soapS: string; // Subjective
  soapO: string; // Objective
  soapA: string; // Assessment
  soapP?: string; // Plan
  icdCode: string;
  icdName: string;
  icdList?: ICD10Item[];
  prescription: PrescriptionItem[];
  doctorFee: number;
  medicalSupportFee: number;
  adminFee: number;
  assignedStaff?: StaffFeeItem[];
  notes?: string;
  branchId: string;
}

export interface EPrescription {
  id: string;
  rmeRecordId?: string;
  rmId: string;
  patientName: string;
  patientAge?: number | string;
  patientAddress?: string;
  doctorName: string;
  originFacility?: string;
  isExternalRx?: boolean;
  items: PrescriptionItem[];
  status:
    | 'Pending Skrining'
    | 'Antrian POS'
    | 'Lolos Skrining'
    | 'Ditolak'
    | 'Disiapkan'
    | 'Selesai di POS'
    | 'Diterima (Tidak Ada DRPs)'
    | 'Ditolak (Ada DRPs)'
    | 'Ganti Rx (Konfirmasi ke Dokter)'
    | string;
  timestamp: string;
  screeningNotes?: string;
  screenedBy?: string;
  screenedAt?: string;
  assignedStaff?: StaffFeeItem[];
  screeningChecks?: {
    admin: { namaDokter: boolean; sip: boolean; tglResep: boolean; paraf: boolean };
    farmasetik: { bentukSediaan: boolean; dosis: boolean; stabilitas: boolean; kompatibilitas: boolean };
    klinis: {
      tepatDosis: boolean;
      tepatWaktu: boolean;
      kontraIndikasi: boolean;
      interaksi: boolean;
      duplikasi?: boolean;
    };
    externalMeta?: {
      isExternalRx?: boolean;
      originFacility?: string;
      patientAge?: number | string;
      patientAddress?: string;
    };
    posQueueMeta?: {
      sentToPos?: boolean;
      sentToPosAt?: string;
      sentToPosBy?: string;
      processedPosTrxId?: string;
      processedPosAt?: string;
    };
  };
  branchId: string;
}

export interface LabConsumedProduct {
  medicineId: string;
  medicineName: string;
  qty: number;
  unit?: string;
  unitPrice?: number;
  hpp?: number;
}

export type ServiceFeeRole =
  | StaffRole
  | 'dokter'
  | 'perawat_bidan'
  | 'apoteker'
  | 'non_petugas'
  | string;
export type ServiceFeeType = 'nominal' | 'persen';
export type StaffFeeLedgerPaymentStatus = 'belum_dibayar' | 'dibayar' | 'dibatalkan';

export interface ServiceFeeRecipientRule {
  id: string;
  penerima_role: ServiceFeeRole;
  wajib_pilih_petugas: boolean;
  tipe_fee: ServiceFeeType;
  nilai_fee: number;
}

export interface CartServiceFeeAllocation {
  rule_id: string;
  penerima_role: ServiceFeeRole;
  wajib_pilih_petugas: boolean;
  tipe_fee: ServiceFeeType;
  nilai_fee: number;
  nominal_fee_satuan: number;
  total_fee_item: number;
  petugas_id?: string;
  nama_petugas?: string;
  role_petugas?: string;
}

export interface StaffFeeLedgerEntry {
  id: string;
  transaction_id: string;
  transaction_date: string; // YYYY-MM-DD
  transaction_datetime?: string;
  customer_name: string;
  trx_type: string;
  service_id: string;
  service_name: string;
  penerima_role: ServiceFeeRole;
  qty: number;
  tarif_biaya: number;
  subtotal_layanan: number;
  tipe_fee: ServiceFeeType;
  nilai_fee: number;
  nominal_fee_satuan: number;
  total_fee_item: number;
  fee_fasilitas?: number;
  allocation_id?: string;
  petugas_id: string;
  nama_petugas: string;
  role_petugas: string;
  status_pembayaran: StaffFeeLedgerPaymentStatus;
  paid_at?: string;
  paid_by?: string;
  cancelled_reason?: string;
  branch_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface CartItem {
  id: string;
  name: string;
  batchNo?: string;
  expDate?: string;
  kekuatan?: string;
  qty: number;
  unit: string;
  tuslah: number;
  price: number;
  discount: number;
  subtotal: number;
  hpp: number;
  labConsumedProducts?: LabConsumedProduct[];
  // Jasa & Fee Petugas Snapshot Fields (POS Multi-Tier & Ledger)
  penerima_role?: ServiceFeeRole;
  wajib_pilih_petugas?: boolean;
  tipe_fee?: ServiceFeeType;
  nilai_fee?: number;
  petugas_id?: string;
  nama_petugas?: string;
  role_petugas?: string;
  nominal_fee_satuan?: number;
  total_fee_item?: number;
  fee_allocations?: CartServiceFeeAllocation[];
  fee_fasilitas_satuan?: number;
  total_fee_fasilitas?: number;
}

export interface Transaction {
  id: string;
  date: string;
  type: 'REGULER' | 'KLINIK' | 'MITRA' | 'FAKTUR_PENJUALAN' | string;
  kasir: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  dueDate?: string;
  term?: string;
  usePpn?: boolean;
  dpp?: number;
  ppn?: number;
  status?: 'Selesai' | 'Dibatalkan' | 'Diretur';
  cancelReason?: string;
  returnReason?: string;
  returnDate?: string;
  rmId?: string;
  doctorName?: string;
  subtotal: number;
  discount: number;
  serviceCharge?: number;
  shippingFee?: number;
  pembulatan?: number;
  chargeCC: number;
  total: number;
  payAmount: number;
  change: number;
  hppTotal: number;
  profit: number;
  paymentMethod: string;
  description: string;
  paymentStatus?: 'Lunas' | 'Belum Lunas' | 'Sebagian' | 'Tempo';
  paidAmount?: number;
  remainingAmount?: number;
  assignedStaff?: StaffFeeItem[];
  items: CartItem[];
  branchId: string;
}

export interface PurchaseItem {
  medicineId?: string;
  name: string;
  qty: number;
  unit: string;
  batchNo: string;
  expDate: string;
  price: number;
  disc: number;
  subtotal: number;
}

export interface PurchaseInvoice {
  id: string;
  pbfName: string;
  invoiceNo: string;
  date: string;
  dueDate: string;
  salesman: string;
  term: 'Cash / COD' | '14 Hari' | '30 Hari' | '60 Hari' | (string & {});
  usePpn: boolean;
  items: PurchaseItem[];
  grossDpp: number;
  totalDiscountAmount: number;
  dpp: number;
  ppn: number;
  totalTagihan: number;
  status: 'Lunas' | 'Belum Lunas' | 'Sebagian';
  paidAmount?: number;
  remainingAmount?: number;
  branchId: string;
  recordType?: 'PURCHASE_INVOICE' | 'OPENING_DEBT';
  notes?: string;
}

export interface StockTransfer {
  id: string;
  date: string;
  fromBranchId: string;
  toBranchId: string;
  medicineId: string;
  medicineName: string;
  qty: number;
  unit: string;
  status: 'Terkirim' | 'Diterima' | 'Dibatalkan';
  petugas: string;
  notes?: string;
}

export interface AuditLog {
  id: string;
  time: string;
  role: string;
  user: string;
  module: string;
  detail: string;
  branchId: string;
}

export interface ICD10Item {
  code: string;
  name: string;
  category?: string;
}

export interface TariffItem {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  isSystem?: boolean;
  penerima_role?: ServiceFeeRole;
  wajib_pilih_petugas?: boolean;
  tipe_fee?: ServiceFeeType;
  nilai_fee?: number;
  fee_recipients?: ServiceFeeRecipientRule[];
}

export interface RoleSalaryDefault {
  baseSalary: number;
  fixedAllowance: number;
}

export interface StaffSalarySetting {
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  baseSalary: number;
  fixedAllowance: number;
  customOvertimeHourlyRate?: number;
  active: boolean;
  notes?: string;
}

export interface SundayOvertimeRuleConfig {
  sundayOnly: true;
  calculationMode: 'per-jam' | 'per-sesi';
  plannedHourlyRate: number; // Tarif per jam untuk Lembur Terencana (Minggu)
  unscheduledHourlyRate: number; // Tarif per jam untuk Lembur di Luar Jadwal (Minggu)
  plannedSessionRate: number; // Tarif datar per sesi untuk Lembur Terencana (Minggu)
  unscheduledSessionRate: number; // Tarif datar per sesi untuk Lembur di Luar Jadwal (Minggu)
  roundingMinutes: 1 | 15 | 30 | 60;
  requireApprovalForPayout: boolean;
}

export interface PayrollOvertimeConfig {
  salaryBasisDaysPerMonth: number;
  salaryPeriodMode: 'full-month' | 'prorata-days';
  roleDefaults: Record<string, RoleSalaryDefault>;
  staffSalaries: StaffSalarySetting[];
  sundayOvertime: SundayOvertimeRuleConfig;
  updatedAt?: string;
}

export interface FeeConfig {
  doctorFee: number;
  specialistFee: number;
  medicalSupportFee: number;
  adminFee: number;
  homeVisitFee: number;
  pharmacistFee: number;
  activeOnlyForVisit?: boolean;
  customTariffs?: TariffItem[];
  systemTariffConfigs?: Record<string, Partial<TariffItem>>;
  payrollConfig?: PayrollOvertimeConfig;
}

export const DEFAULT_PAYROLL_OVERTIME_CONFIG: PayrollOvertimeConfig = {
  salaryBasisDaysPerMonth: 30,
  salaryPeriodMode: 'full-month',
  roleDefaults: {
    'APJ / Owner': { baseSalary: 4500000, fixedAllowance: 500000 },
    Dokter: { baseSalary: 3500000, fixedAllowance: 500000 },
    Apoteker: { baseSalary: 3200000, fixedAllowance: 400000 },
    'Perawat / Bidan': { baseSalary: 2500000, fixedAllowance: 300000 },
    'Kasir & Front Office': { baseSalary: 2200000, fixedAllowance: 250000 }
  },
  staffSalaries: [],
  sundayOvertime: {
    sundayOnly: true,
    calculationMode: 'per-jam',
    plannedHourlyRate: 30000,
    unscheduledHourlyRate: 35000,
    plannedSessionRate: 100000,
    unscheduledSessionRate: 125000,
    roundingMinutes: 15,
    requireApprovalForPayout: true
  }
};

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  doctorFee: 20000,
  specialistFee: 50000,
  medicalSupportFee: 5000,
  adminFee: 1000,
  homeVisitFee: 35000,
  pharmacistFee: 10000,
  activeOnlyForVisit: true,
  customTariffs: [],
  systemTariffConfigs: {},
  payrollConfig: DEFAULT_PAYROLL_OVERTIME_CONFIG
};

export interface Mitra {
  id: string;
  name: string; // Nama Faskes
  phone: string; // No. Tlp
  licenseNo: string; // No. Izin
  licenseFileUrl?: string; // Data URL file izin fasilitas (PDF / JPG)
  licenseFileName?: string; // Nama berkas izin fasilitas
  licenseFileType?: string; // MIME type ('application/pdf' | 'image/jpeg')
  licenseUploadedAt?: string; // ISO timestamp unggah file izin
  address: string; // Alamat
  category?: 'Klinik Pratama' | 'Klinik Utama' | 'Apotek Mitra' | 'Praktik Dokter Mandiri' | 'Rumah Sakit' | 'Lainnya';
  picName?: string; // Nama Penanggung Jawab
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string; // Nama Supplier / PBF
  address: string; // Alamat
  phone: string; // Kontak / Telepon
  email?: string;
  licenseNo?: string; // No Izin PBF / Distribusi
  picName?: string; // Nama Sales / PIC
  createdAt: string;
}

export type SPGroupType = 'REG' | 'ALK' | 'PRE' | 'OOT' | 'PSI' | 'NAR';

export interface PurchaseOrderItem {
  id: string;
  medicineId: string;
  name: string;
  category: string;
  nappza: string;
  spType: SPGroupType;
  form: string;
  kekuatan?: string;
  satuanBesar: string;
  satuanKecil: string;
  rasioKonversi: number;
  currentStock: number;
  minStock: number;
  qtyBesar: number;
  qtyKecil: number;
  estimatedHna: number;
  subtotal: number;
  ket?: string;
}

export interface SPPrintLogEntry {
  printCount: number;
  lastPrintedAt: string;
  lastPrintedBy: string;
}

export interface PurchaseOrder {
  id: string; // e.g. PO-202611-001
  poNumber: string;
  date: string;
  supplierId?: string;
  supplierName: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierLicenseNo?: string;
  spNumbers: Record<SPGroupType, string>;
  status: 'Draft' | 'Diajukan' | 'Diproses' | 'Dikirim' | 'Selesai' | 'Dibatalkan';
  items: PurchaseOrderItem[];
  notes?: string;
  totalEstimatedCost: number;
  branchId?: string;
  petugas?: string;
  spPrintLogs?: Partial<Record<SPGroupType | 'ALL', SPPrintLogEntry>>;
  createdAt: string;
  updatedAt?: string;
}

export interface PurchaseReturnItem {
  medicineId: string;
  name: string;
  qty: number;
  unit: string;
  batchNo?: string;
  expDate?: string;
  price: number;
  subtotal: number;
  reason: string;
  alasan?: string;
}

export interface PurchaseReturnRecord {
  id: string;
  invoiceId: string;
  invoiceNo: string;
  pbfName: string;
  date: string;
  time: string;
  salesman?: string;
  items: PurchaseReturnItem[];
  totalReturValue: number;
  petugas: string;
  branchId: string;
}

export interface DebtPaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNo: string;
  pbfName: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  referenceNo?: string;
  notes?: string;
  petugas: string;
  previousBalance: number;
  remainingBalance: number;
  createdAt: string;
}

export interface ReceivablePaymentRecord {
  id: string;
  transactionId: string;
  customerName: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  referenceNo?: string;
  notes?: string;
  petugas: string;
  previousBalance: number;
  remainingBalance: number;
  createdAt: string;
}

export interface CashFlowRecord {
  id: string;
  date: string;
  time: string;
  type: 'IN' | 'OUT'; // IN: Pelunasan Piutang / Kas Masuk, OUT: Pembayaran Hutang / Kas Keluar
  category: 'Pembayaran Hutang PBF' | 'Pelunasan Piutang POS' | 'Operasional' | 'Lainnya';
  amount: number;
  referenceId: string;
  referenceNo: string;
  partyName: string; // PBF atau Nama Pasien/Mitra
  paymentMethod: string;
  description: string;
  petugas: string;
  createdAt: string;
}

export interface DRPItem {
  drugName: string;
  category: 'Interaksi Obat' | 'Dosis Berlebih' | 'Dosis Kurang' | 'Kontraindikasi Alergi' | 'Ketidaksesuaian Indikasi' | 'Duplikasi Terapi' | 'Monitoring Khusus' | string;
  severity: 'Kritis' | 'Sedang' | 'Rendah';
  clinicalExplanation: string;
  recommendation: string;
  literatureReference: string;
  referenceUrl?: string;
}

export interface DRPAnalysisResult {
  riskLevel: 'CRITICAL' | 'MODERATE' | 'SAFE';
  summary: string;
  identifiedDRPs?: DRPItem[];
  drugDrugInteractions: {
    severity: 'Tinggi' | 'Sedang' | 'Rendah';
    drugs: string;
    mechanism: string;
    clinicalEffect: string;
    recommendation: string;
    literatureReference?: string;
    referenceUrl?: string;
  }[];
  drugDiseaseInteractions: {
    drug: string;
    conditionOrDiagnosis: string;
    issue: string;
    recommendation: string;
    literatureReference?: string;
    referenceUrl?: string;
  }[];
  dosageAnalysis: {
    drug: string;
    prescribedDose: string;
    standardDose: string;
    status: 'Sesuai' | 'Underdose' | 'Overdose' | 'Perlu Penyesuaian';
    notes: string;
    literatureReference?: string;
    referenceUrl?: string;
  }[];
  allergyAndContraindications: {
    drug: string;
    riskType: 'Alergi' | 'Kontraindikasi' | 'Duplikasi Terapi';
    explanation: string;
    alertLevel: 'Kritis' | 'Peringatan';
    literatureReference?: string;
    referenceUrl?: string;
  }[];
  pharmacistRecommendations: string[];
  screeningPassedRecommendation: boolean;
  source?: string;
  timestamp?: string;
}

export type DrugInteractionSeverity = 'minor' | 'moderate' | 'major' | 'contraindicated';

export interface DrugInteractionRecord {
  id: string;
  obatA: string;
  obatB: string;
  aliasA?: string[];
  aliasB?: string[];
  severity: DrugInteractionSeverity;
  mekanisme: string;
  manajemenKlinis: string;
  referensi?: string;
  source?: 'supabase' | 'lokal';
}

export interface MatchedDrugInteraction {
  ruleId: string;
  rxDrugA: string;
  rxDrugB: string;
  obatA: string;
  obatB: string;
  severity: DrugInteractionSeverity;
  mekanisme: string;
  manajemenKlinis: string;
  referensi?: string;
  source: 'supabase' | 'lokal';
}

export interface InteractionCheckResult {
  rxId: string;
  totalDrugs: number;
  pairsScanned: number;
  totalRulesChecked: number;
  checkedPairs: Array<{ drugA: string; drugB: string }>;
  matches: MatchedDrugInteraction[];
  highestSeverity: DrugInteractionSeverity | 'none';
  severityCounts: Record<DrugInteractionSeverity, number>;
  dataSource: 'supabase' | 'lokal' | 'hybrid';
  checkedAt: string;
  isDemoSandbox?: boolean;
  liveFetchStatus?: 'supabase-live' | 'fallback-error' | 'fallback-empty' | 'demo-sandbox';
  liveErrorMessage?: string;
  supabaseRowCount?: number;
}

export interface PharmacyBankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch?: string;
}

export interface PharmacyProfile {
  name: string;
  sia: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  npwp?: string;
  nib?: string;
  headerNote?: string;
  operationalDays?: string;
  operationalOpenTime?: string;
  operationalCloseTime?: string;
  operationalSchedule?: string;
  logoUrl?: string;
  bankAccounts?: PharmacyBankAccount[];
  latitude?: number;
  longitude?: number;
  checkInRadiusMeters?: number;
  branchLocations?: Record<string, { latitude: number; longitude: number; radiusMeters?: number }>;
}

export interface APJProfile {
  name: string;
  sipa: string;
  stra: string;
  phone: string;
  schedule: string;
  notes?: string;
}

export interface DPJProfile {
  name: string;
  sip: string;
  idi: string;
  specialization: string;
  phone: string;
  schedule: string;
  notes?: string;
}

export interface LabTestItem {
  id: string;
  parameter: string;
  result: string;
  unit: string;
  referenceRange: string;
  status: 'Normal' | 'Tinggi' | 'Rendah' | 'Kritis' | 'Abnormal';
  notes?: string;
  price?: number;
  productId?: string;
  productName?: string;
  productQty?: number;
  productUnit?: string;
  productUnitPrice?: number;
}

export interface LabTestRecord {
  id: string;
  date: string;
  time: string;
  rmId: string;
  patientName: string;
  nik?: string;
  age?: number;
  gender?: 'Laki-laki' | 'Perempuan';
  doctorName?: string;
  analystName: string;
  clinicalDiagnosis?: string;
  items: LabTestItem[];
  conclusion?: string;
  notes?: string;
  branchId?: string;
  cost?: number;
}

export interface CashDenominationItem {
  nominal: number;
  label: string;
  sheets: number;
  subtotal: number;
}

export const CASH_DENOMINATIONS_LIST: { nominal: number; label: string }[] = [
  { nominal: 1000, label: 'Rp 1.000' },
  { nominal: 2000, label: 'Rp 2.000' },
  { nominal: 5000, label: 'Rp 5.000' },
  { nominal: 10000, label: 'Rp 10.000' },
  { nominal: 20000, label: 'Rp 20.000' },
  { nominal: 50000, label: 'Rp 50.000' },
  { nominal: 100000, label: 'Rp 100.000' }
];

export interface CashierShiftSession {
  id: string;
  branchId: string;
  cashierName: string;
  shiftName: string;
  openDate: string;
  openTime: string;
  openTimestamp: number;
  closeDate?: string;
  closeTime?: string;
  openingFloat: number;
  openingNotes?: string;
  systemCashSales: number;
  systemNonCashSales: number;
  expectedCashInDrawer: number;
  physicalCashInDrawer: number;
  difference: number;
  differenceStatus: 'Sesuai' | 'Surplus (Lebih)' | 'Defisit (Kurang)';
  closingNotes?: string;
  denominations: CashDenominationItem[];
  status:
    | 'Aktif'
    | 'Menunggu Approval Tutup Kasir'
    | 'Ditutup (Sesuai)'
    | 'Ditutup (Approved APJ / Owner)'
    | 'Ditutup (Approved Super Admin)'
    | 'Ditolak (Hitung Ulang)';
  approvedBy?: string;
  approvalTime?: string;
  approvalNotes?: string;
  transactionCount: number;
}

export type MitraOrderStatus = 'Pending' | 'Dikonfirmasi' | 'Diproses' | 'Selesai' | 'Dibatalkan';

export type MitraPaymentStatus =
  | 'Menunggu Pembayaran'
  | 'Menunggu Verifikasi'
  | 'Lunas'
  | 'Ditolak';

export type PortalOrderRoom = 'REGULER' | 'MITRA';

export interface MitraOrderItem {
  medicineId: string;
  name: string;
  kekuatan?: string;
  kelas?: string;
  category?: string;
  satuanBesar: string;
  satuanKecil: string;
  rasioKonversi: number;
  qtyBox: number;
  qtyTotalKecil: number;
  unitPriceBox: number;
  subtotal: number;
  hppBox?: number;
  unitMode?: 'KECIL' | 'BESAR';
  rxRequirementLabel?: string;
}

export interface MitraOrder {
  id: string;
  orderCode: string;
  orderRoom?: PortalOrderRoom;
  mitraId?: string;
  mitraName: string;
  mitraCategory?: string;
  mitraPhone?: string;
  mitraAddress?: string;
  picName?: string;
  items: MitraOrderItem[];
  totalItems: number;
  totalQtyBox: number;
  discountAmount?: number;
  appliedDiscountLabel?: string;
  totalAmount: number;
  status: MitraOrderStatus;
  paymentMethod?: string;
  paymentStatus?: MitraPaymentStatus;
  paymentProofUrl?: string;
  paymentProofName?: string;
  paymentUploadedAt?: string;
  paymentBankTarget?: string;
  paymentVerifiedAt?: string;
  paymentVerifiedBy?: string;
  paymentRejectionReason?: string;
  rxRequired?: boolean;
  rxRequirementLabel?: string;
  rxFileUrl?: string;
  rxFileName?: string;
  rxUploadedAt?: string;
  notes?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt?: string;
  convertedTrxId?: string;
  branchId?: string;
}

export interface MorbidityTopDiagnosis {
  icdCode: string;
  diagnosis: string;
  count: number;
}

export interface MedicalMorbidityReportRecord {
  id: string;
  title: string;
  reportType: 'KUNJUNGAN' | 'KASUS';
  startDate: string;
  endDate: string;
  minAge?: number | null;
  maxAge?: number | null;
  searchQuery?: string;
  totalVisits: number;
  totalCases: number;
  pediatricCount: number;
  topDiagnoses: MorbidityTopDiagnosis[];
  notes?: string;
  createdBy: string;
  dpjName: string;
  apjName: string;
  branchId?: string;
  createdAt: string;
  updatedAt?: string;
  recordsSnapshot?: RMERecord[];
}

export type DiscountBasis =
  | 'ALL_ITEMS'
  | 'SPECIFIC_MEDICINE'
  | 'CATEGORY'
  | 'THERAPY_CLASS'
  | 'MIN_PURCHASE'
  | 'MIN_QTY';

export type DiscountValueType = 'PERCENT' | 'NOMINAL';

export type DiscountChannelScope =
  | 'ALL'
  | 'REGULER'
  | 'KLINIK'
  | 'MITRA'
  | 'PORTAL_MITRA';

export interface SalesDiscount {
  id: string;
  name: string;
  code?: string;
  autoApply: boolean;
  basis: DiscountBasis;
  targetMedicineIds?: string[];
  targetCategories?: string[];
  targetTherapyClasses?: string[];
  valueType: DiscountValueType;
  value: number;
  maxDiscountAmount?: number;
  minPurchaseAmount?: number;
  minQty?: number;
  channelScope: DiscountChannelScope;
  startDate: string;
  endDate: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type PromoBannerTheme =
  | 'emerald-clinical'
  | 'navy-executive'
  | 'amber-flash'
  | 'indigo-network'
  | 'rose-special';

export interface PromoAd {
  id: string;
  title: string;
  badgeText?: string;
  subtitle: string;
  description?: string;
  highlightText?: string;
  promoCode?: string;
  linkedDiscountId?: string;
  ctaText?: string;
  ctaFilterCategory?: string;
  ctaFilterKelas?: string;
  ctaSearchQuery?: string;
  theme: PromoBannerTheme;
  bannerImageUrl?: string;
  priority: number;
  startDate: string;
  endDate: string;
  showOnMitraPortal: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type AttendanceStatus = 'Hadir' | 'Cuti' | 'Lembur';
export type SundayOvertimeType = 'Lembur Terencana' | 'Lembur di Luar Jadwal';
export type AttendanceApprovalStatus = 'Disetujui' | 'Menunggu Persetujuan' | 'Ditolak';

export interface StaffAttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  date: string; // YYYY-MM-DD (local date)
  dayName: ScheduleDay;
  status: AttendanceStatus;
  scheduleId?: string;
  scheduledStartTime?: string; // HH:mm
  scheduledEndTime?: string; // HH:mm
  serviceUnit?: string;
  checkInTime?: string; // HH:mm
  checkOutTime?: string; // HH:mm
  workDurationMinutes: number;
  isSunday: boolean;
  overtimeMinutes: number; // Strictly 0 on Monday-Saturday; only > 0 on Sunday (Minggu)
  overtimeType?: SundayOvertimeType;
  overtimeSource?: 'auto-checkout' | 'planned-session' | 'unscheduled-session';
  leaveReason?: string;
  approvalStatus: AttendanceApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  sourceMode?: 'desktop' | 'mobile';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type MarketingStrategyType =
  | 'BUNDLING_KLINIS'
  | 'CLEARANCE_SLOW_ED'
  | 'RESTOK_FAST_MOVING'
  | 'REPEAT_PASIEN'
  | 'REORDER_MITRA'
  | 'PROMO_UMUM';

export type MarketingCampaignStatus = 'Aktif' | 'Draf' | 'Selesai' | 'Diarsipkan';

export interface MarketingCampaignBaselineSnapshot {
  revenue: number;
  txCount: number;
  avgBasket: number;
  grossProfit: number;
  grossMarginPct: number;
  periodLabel: string;
}

export interface MarketingCampaign {
  id: string;
  title: string;
  strategyType: MarketingStrategyType;
  status: MarketingCampaignStatus;
  targetChannel: 'ALL' | 'REGULER' | 'KLINIK' | 'MITRA' | 'PORTAL_MITRA';
  targetMedicineIds?: string[];
  targetMedicineNames?: string[];
  targetMitraIds?: string[];
  targetPatientRmIds?: string[];
  linkedDiscountId?: string;
  linkedPromoId?: string;
  linkedPoId?: string;
  discountCode?: string;
  expectedLiftNote?: string;
  followUpMessage?: string;
  activatedAt: string; // YYYY-MM-DD or ISO string
  baselineDays: number;
  baselineSnapshot?: MarketingCampaignBaselineSnapshot;
  notes?: string;
  createdBy: string;
  branchId: string;
  createdAt: string;
  updatedAt?: string;
}

export type PortalActivityEventType =
  | 'ROOM_SWITCH'
  | 'VIEW_PRODUCT'
  | 'ADD_TO_CART'
  | 'REMOVE_FROM_CART'
  | 'LOCKED_MITRA_ATTEMPT'
  | 'MITRA_LOGIN_SUCCESS'
  | 'MITRA_LOGIN_FAILED'
  | 'RX_REQUIRED_PROMPT'
  | 'RX_UPLOADED'
  | 'CHECKOUT_STARTED'
  | 'CHECKOUT_SUBMITTED';

export interface PortalActivityEvent {
  id: string;
  room: PortalOrderRoom;
  eventType: PortalActivityEventType;
  medicineId?: string;
  medicineName?: string;
  medicineCategory?: string;
  qty?: number;
  unitPrice?: number;
  rxRequired?: boolean;
  rxRequirementLabel?: string;
  mitraVerified?: boolean;
  mitraName?: string;
  orderCode?: string;
  branchId?: string;
  sessionId: string;
  createdAt: string;
}

export type WpOpTaxScheme = 'umkm_final' | 'pasal_17_pembukuan' | 'nppn';
export type TaxScopeMode = 'per_unit' | 'gabungan_wpop';
export type TerCategory = 'A' | 'B' | 'C';

export interface WpOpTaxConfig {
  id: string;
  scheme: WpOpTaxScheme;
  scopeMode: TaxScopeMode;
  ownerName: string;
  ownerNpwpNik: string;
  ownerPtkpStatus: PtkpStatus;
  nppnRatePercent: number;
  monthlyOperationalExpense: number;
  includePayrollSalaryInPembukuanExpense: boolean;
  manualYtdPriorTurnover: number;
  notes?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PphMixedTransactionExclusionItem {
  transactionId: string;
  date: string;
  branchId: string;
  customerName: string;
  type: string;
  grossTotal: number;
  productAmount: number;
  excludedJasaAmount: number;
  excludedServiceCharge: number;
  discountAllocatedToProduct: number;
  productHpp: number;
}

export interface PphProductSalesBreakdown {
  taxYear: number;
  scopeMode: TaxScopeMode;
  branchId: string;
  scheme: WpOpTaxScheme;
  activeTransactionCount: number;
  cancelledOrReturnedExcludedCount: number;
  totalGrossTransactions: number;
  excludedJasaServiceAmount: number;
  excludedServiceChargeAmount: number;
  totalExcludedJasaAndService: number;
  productDiscountAllocated: number;
  productTurnoverPeriod: number;
  productHppPeriod: number;
  ytdProductTurnoverBeforePeriod: number;
  ytdProductTurnoverAfterPeriod: number;
  globalWpOpYtdProductTurnoverAfterPeriod: number;
  freeThreshold500mTotal: number;
  freeThreshold500mUsed: number;
  freeThreshold500mRemaining: number;
  umkmTaxableBasePeriod: number;
  limit48bTotal: number;
  limit48bRemaining: number;
  exceedsUmkmLimit48b: boolean;
  pembukuanOperationalExpense: number;
  pembukuanPayrollSalaryExpense: number;
  pembukuanNetIncomePeriod: number;
  nppnRatePercent: number;
  nppnNetIncomePeriod: number;
  ptkpAnnual: number;
  ptkpPeriod: number;
  pkpPeriod: number;
  pkpAnnualized: number;
  effectiveRateLabel: string;
  estimatedPphUsaha: number;
  mixedAndExcludedItems: PphMixedTransactionExclusionItem[];
}

export interface Pph21StaffBreakdown {
  staffId: string;
  staffName: string;
  role: string;
  branchId: string;
  npwpNik: string;
  ptkpStatus: PtkpStatus;
  taxCategory: StaffTaxCategory;
  terCategory: TerCategory | '-';
  salaryAndAllowance: number;
  sundayOvertimePay: number;
  serviceFeeIncome: number;
  grossIncome: number;
  dppAmount: number;
  effectiveRatePercent: number;
  rateFormulaLabel: string;
  estimatedPph21: number;
}

export interface PphMonthlySnapshot {
  id: string;
  taxYear: number;
  taxMonth: number;
  periodKey: string; // YYYY-MM
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  scopeMode: TaxScopeMode;
  branchId: string;
  branchName: string;
  scheme: WpOpTaxScheme;
  totalGrossTransactions: number;
  excludedJasaTotal: number;
  productTurnoverPeriod: number;
  productTurnoverYtd: number;
  productHppPeriod: number;
  freeThreshold500mUsed: number;
  freeThreshold500mRemaining: number;
  limit48bRemaining: number;
  estimatedPphUsaha: number;
  estimatedPph21: number;
  totalEstimatedPph: number;
  staffPph21Details: Pph21StaffBreakdown[];
  configSnapshot: WpOpTaxConfig;
  notes?: string;
  savedBy: string;
  savedAt: string;
  updatedAt: string;
}

export interface PphAuditEntry {
  id: string;
  actionType: 'CONFIG_UPDATE' | 'SNAPSHOT_SAVE' | 'SNAPSHOT_DELETE' | 'STAFF_TAX_UPDATE';
  summary: string;
  actorName: string;
  branchId: string;
  payloadSnapshot?: Record<string, any>;
  createdAt: string;
}

