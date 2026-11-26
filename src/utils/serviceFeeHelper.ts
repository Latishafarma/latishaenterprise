import {
  CartItem,
  CartServiceFeeAllocation,
  DEFAULT_FEE_CONFIG,
  DEFAULT_ROLE_PERMISSIONS,
  FeeConfig,
  ServiceFeeRecipientRule,
  ServiceFeeRole,
  ServiceFeeType,
  Staff,
  StaffFeeItem,
  StaffFeeLedgerEntry,
  StaffRole,
  TariffItem,
  Transaction,
  isOwnerAdminRole,
  normalizeStaffRole
} from '../types';
import { demoGetItem, demoSetItem } from './demoSandbox';
import { getDeletedIdsSet } from './deletionRegistry';

export const FEE_LEDGER_STORAGE_KEY = 'latisha_fee_ledger';

export interface ServiceFeeRoleMeta {
  value: ServiceFeeRole;
  label: string;
  shortLabel: string;
  badgeClass: string;
  hint: string;
}

const CANONICAL_ROLE_META: Record<string, ServiceFeeRoleMeta> = {
  'APJ / Owner': {
    value: 'APJ / Owner',
    label: 'APJ / Owner',
    shortLabel: 'APJ / Owner',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    hint: 'Khusus staf dengan peran APJ / Owner aktif'
  },
  Dokter: {
    value: 'Dokter',
    label: 'Dokter',
    shortLabel: 'Dokter',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    hint: 'Khusus staf dengan peran Dokter aktif'
  },
  Apoteker: {
    value: 'Apoteker',
    label: 'Apoteker',
    shortLabel: 'Apoteker',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
    hint: 'Khusus staf Apoteker aktif (telaah/konseling/swamedikasi)'
  },
  'Perawat / Bidan': {
    value: 'Perawat / Bidan',
    label: 'Perawat / Bidan',
    shortLabel: 'Perawat / Bidan',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    hint: 'Khusus staf dengan peran Perawat / Bidan aktif'
  },
  'Perawat / Nakes Lapangan': {
    value: 'Perawat / Nakes Lapangan',
    label: 'Perawat / Nakes Lapangan',
    shortLabel: 'Nakes Lapangan',
    badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    hint: 'Khusus staf Perawat / Nakes Lapangan aktif'
  },
  'Kasir & Front Office': {
    value: 'Kasir & Front Office',
    label: 'Kasir & Front Office',
    shortLabel: 'Kasir & FO',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    hint: 'Khusus staf Kasir & Front Office aktif'
  },
  non_petugas: {
    value: 'non_petugas',
    label: 'Non-Petugas (100% Sarana / Fasilitas)',
    shortLabel: 'Non-Petugas (Fasilitas)',
    badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
    hint: 'Komponen sarana/fasilitas klinik tanpa alokasi fee petugas'
  }
};

export const NON_PETUGAS_ROLE_META: ServiceFeeRoleMeta = CANONICAL_ROLE_META.non_petugas;

export const getServiceFeeRoleOptions = (
  rolePermissions?: Record<string, string[]> | null
): ServiceFeeRoleMeta[] => {
  const sourceKeys =
    rolePermissions && Object.keys(rolePermissions).length > 0
      ? Object.keys(rolePermissions)
      : Object.keys(DEFAULT_ROLE_PERMISSIONS);

  const canonicalOrder = Object.keys(DEFAULT_ROLE_PERMISSIONS);
  const mergedKeys = Array.from(new Set([...canonicalOrder, ...sourceKeys]));

  const roleOptions: ServiceFeeRoleMeta[] = mergedKeys.map((roleName) => {
    const existing = CANONICAL_ROLE_META[roleName];
    if (existing) return existing;
    return {
      value: roleName,
      label: roleName,
      shortLabel: roleName,
      badgeClass: 'bg-violet-100 text-violet-800 border-violet-200',
      hint: `Khusus staf dengan peran ${roleName} aktif`
    };
  });

  roleOptions.push(NON_PETUGAS_ROLE_META);
  return roleOptions;
};

export const SERVICE_FEE_ROLE_OPTIONS: ServiceFeeRoleMeta[] = getServiceFeeRoleOptions();

export const normalizeServiceFeeRole = (raw?: string | null): ServiceFeeRole => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'non_petugas';
  const val = trimmed.toLowerCase();

  if (
    val === 'non_petugas' ||
    val === 'non-petugas' ||
    val === 'sarana' ||
    val === 'fasilitas'
  ) {
    return 'non_petugas';
  }
  if (val === 'dokter' || val === 'doctor') return 'Dokter';
  if (
    val === 'perawat_bidan' ||
    val === 'perawat / bidan' ||
    val === 'perawat' ||
    val === 'bidan'
  ) {
    return 'Perawat / Bidan';
  }
  if (
    val === 'perawat / nakes lapangan' ||
    val === 'perawat_nakes_lapangan' ||
    val === 'nakes lapangan' ||
    val === 'nakes'
  ) {
    return 'Perawat / Nakes Lapangan';
  }
  if (val === 'apoteker' || val === 'pharmacist') return 'Apoteker';
  if (isOwnerAdminRole(trimmed)) return 'APJ / Owner';
  if (
    val === 'kasir & front office' ||
    val === 'kasir' ||
    val === 'front office' ||
    val === 'admin'
  ) {
    return 'Kasir & Front Office';
  }

  const matchedKnown = Object.keys(CANONICAL_ROLE_META).find(
    (k) => k.toLowerCase() === val
  );
  if (matchedKnown) return matchedKnown;

  return trimmed;
};

export const getServiceFeeRoleMeta = (
  role?: ServiceFeeRole | string,
  rolePermissions?: Record<string, string[]> | null
): ServiceFeeRoleMeta => {
  const normalized = normalizeServiceFeeRole(role);
  const options = getServiceFeeRoleOptions(rolePermissions);
  return (
    options.find((opt) => opt.value.toLowerCase() === String(normalized).toLowerCase()) ||
    CANONICAL_ROLE_META[normalized] || {
      value: normalized,
      label: String(normalized),
      shortLabel: String(normalized),
      badgeClass: 'bg-violet-100 text-violet-800 border-violet-200',
      hint: `Khusus staf dengan peran ${normalized} aktif`
    }
  );
};

export const normalizeServiceFeeType = (raw?: string | null): ServiceFeeType => {
  const val = String(raw || '').trim().toLowerCase();
  return val === 'persen' || val === 'percent' || val === '%' ? 'persen' : 'nominal';
};

export const inferDefaultServiceFeeRole = (tariff: {
  id?: string;
  name?: string;
  category?: string;
}): ServiceFeeRole => {
  const id = String(tariff.id || '').toUpperCase();
  const hay = `${tariff.id || ''} ${tariff.name || ''} ${tariff.category || ''}`.toLowerCase();

  if (id === 'JASA-DOKTER-UMUM' || hay.includes('dokter') || hay.includes('poli umum')) {
    return 'Dokter';
  }
  if (
    id === 'JASA-APOTEKER' ||
    hay.includes('apoteker') ||
    hay.includes('telaah') ||
    hay.includes('konseling') ||
    hay.includes('swamedikasi')
  ) {
    return 'Apoteker';
  }
  if (id === 'JASA-ADMIN-LOKET' || hay.includes('administrasi') || hay.includes('loket') || hay.includes('sarana')) {
    return 'non_petugas';
  }
  if (
    id === 'JASA-PENUNJANG-MEDIS' ||
    id === 'JASA-HOME-VISIT' ||
    hay.includes('perawat') ||
    hay.includes('bidan') ||
    hay.includes('nakes') ||
    hay.includes('home visit') ||
    hay.includes('home care') ||
    hay.includes('tindakan') ||
    hay.includes('kb') ||
    hay.includes('skrining') ||
    hay.includes('lab')
  ) {
    return 'Perawat / Bidan';
  }
  return 'Perawat / Bidan';
};

export interface ResolvedServiceFeeRecipientRule extends ServiceFeeRecipientRule {
  nominal_fee_preview: number;
}

export interface ResolvedTariffItem extends TariffItem {
  penerima_role: ServiceFeeRole;
  wajib_pilih_petugas: boolean;
  tipe_fee: ServiceFeeType;
  nilai_fee: number;
  nominal_fee_preview: number;
  fee_recipients: ResolvedServiceFeeRecipientRule[];
  total_unit_fee_petugas: number;
  fee_fasilitas_preview: number;
}

export const calculateUnitServiceFee = (
  tarifBiaya: number,
  tipeFee?: ServiceFeeType,
  nilaiFee?: number
): number => {
  const price = Math.max(0, Number(tarifBiaya) || 0);
  const val = Math.max(0, Number(nilaiFee) || 0);
  const type = normalizeServiceFeeType(tipeFee);
  if (type === 'persen') {
    const pct = Math.min(100, val);
    return Math.round((price * pct) / 100);
  }
  return Math.round(val);
};

export const calculateTotalServiceFee = (unitFee: number, qty: number): number => {
  const unit = Math.max(0, Number(unitFee) || 0);
  const q = Math.max(0, Number(qty) || 0);
  return Math.round(unit * q);
};

export const normalizeRecipientRule = (
  rule: Partial<ServiceFeeRecipientRule>,
  tarifPrice: number,
  idx = 0
): ResolvedServiceFeeRecipientRule => {
  const role = normalizeServiceFeeRole(rule.penerima_role || 'non_petugas');
  const tipeFee = normalizeServiceFeeType(rule.tipe_fee || 'nominal');
  const nilaiFee =
    role === 'non_petugas'
      ? 0
      : rule.nilai_fee !== undefined && rule.nilai_fee !== null && !Number.isNaN(Number(rule.nilai_fee))
        ? Math.max(0, Number(rule.nilai_fee))
        : 0;
  const wajibPilih =
    role === 'non_petugas'
      ? false
      : rule.wajib_pilih_petugas !== undefined
        ? Boolean(rule.wajib_pilih_petugas)
        : true;
  const unitPreview =
    role === 'non_petugas' ? 0 : calculateUnitServiceFee(tarifPrice, tipeFee, nilaiFee);

  return {
    id: String(rule.id || `RCP-${idx + 1}`),
    penerima_role: role,
    wajib_pilih_petugas: wajibPilih,
    tipe_fee: tipeFee,
    nilai_fee: nilaiFee,
    nominal_fee_preview: unitPreview
  };
};

export const normalizeTariffWithRules = (item: TariffItem): ResolvedTariffItem => {
  const price = Math.max(0, Number(item.price) || 0);
  const inferredRole = inferDefaultServiceFeeRole(item);

  let resolvedRecipients: ResolvedServiceFeeRecipientRule[];
  if (Array.isArray(item.fee_recipients) && item.fee_recipients.length > 0) {
    resolvedRecipients = item.fee_recipients.map((r, idx) =>
      normalizeRecipientRule(r, price, idx)
    );
  } else {
    const fallbackRole = item.penerima_role
      ? normalizeServiceFeeRole(item.penerima_role)
      : inferredRole;
    const fallbackType: ServiceFeeType = item.tipe_fee
      ? normalizeServiceFeeType(item.tipe_fee)
      : 'nominal';
    const fallbackNilai =
      item.nilai_fee !== undefined &&
      item.nilai_fee !== null &&
      !Number.isNaN(Number(item.nilai_fee))
        ? Math.max(0, Number(item.nilai_fee))
        : fallbackRole === 'non_petugas'
          ? 0
          : price;
    const fallbackWajib =
      fallbackRole === 'non_petugas'
        ? false
        : item.wajib_pilih_petugas !== undefined
          ? Boolean(item.wajib_pilih_petugas)
          : true;

    resolvedRecipients = [
      normalizeRecipientRule(
        {
          id: 'RCP-1',
          penerima_role: fallbackRole,
          wajib_pilih_petugas: fallbackWajib,
          tipe_fee: fallbackType,
          nilai_fee: fallbackNilai
        },
        price,
        0
      )
    ];
  }

  const primaryRule =
    resolvedRecipients.find((r) => r.penerima_role !== 'non_petugas') ||
    resolvedRecipients[0];

  const totalUnitFeePetugas = resolvedRecipients.reduce(
    (sum, r) => sum + (r.penerima_role === 'non_petugas' ? 0 : r.nominal_fee_preview),
    0
  );
  const feeFasilitasPreview = Math.max(0, price - totalUnitFeePetugas);

  return {
    ...item,
    price,
    penerima_role: primaryRule.penerima_role,
    wajib_pilih_petugas: primaryRule.wajib_pilih_petugas,
    tipe_fee: primaryRule.tipe_fee,
    nilai_fee: primaryRule.nilai_fee,
    nominal_fee_preview: totalUnitFeePetugas,
    fee_recipients: resolvedRecipients,
    total_unit_fee_petugas: totalUnitFeePetugas,
    fee_fasilitas_preview: feeFasilitasPreview
  };
};

export const resolveAllTariffsWithRules = (
  feeConfig?: Partial<FeeConfig> | null
): ResolvedTariffItem[] => {
  const cfg = feeConfig || DEFAULT_FEE_CONFIG;
  const overrides = cfg.systemTariffConfigs || {};

  const buildSystemItem = (
    id: string,
    defaultName: string,
    defaultCategory: string,
    defaultPrice: number,
    defaultDesc: string,
    defaultRole: ServiceFeeRole,
    defaultWajib: boolean
  ): TariffItem => {
    const ov = overrides[id];
    const resolvedPrice = ov?.price !== undefined ? Number(ov.price) || 0 : defaultPrice;
    return {
      id,
      name: ov?.name || defaultName,
      category: ov?.category || defaultCategory,
      price: resolvedPrice,
      description: ov?.description ?? defaultDesc,
      isSystem: true,
      penerima_role: ov?.penerima_role ?? defaultRole,
      wajib_pilih_petugas: ov?.wajib_pilih_petugas ?? defaultWajib,
      tipe_fee: ov?.tipe_fee ?? 'nominal',
      nilai_fee:
        ov?.nilai_fee !== undefined
          ? Number(ov.nilai_fee) || 0
          : defaultRole === 'non_petugas'
            ? 0
            : resolvedPrice,
      ...(Array.isArray(ov?.fee_recipients) && ov.fee_recipients.length > 0
        ? { fee_recipients: ov.fee_recipients }
        : {})
    };
  };

  const coreBase: TariffItem[] = [
    buildSystemItem(
      'JASA-DOKTER-UMUM',
      'Jasa Dokter Umum / Pasien',
      'Poli Umum',
      cfg.doctorFee ?? DEFAULT_FEE_CONFIG.doctorFee,
      'Diberikan per pasien poli umum yang berobat.',
      'Dokter',
      true
    ),
    buildSystemItem(
      'JASA-PENUNJANG-MEDIS',
      'Jasa Penunjang Medis (Perawat / Bidan)',
      'Skrining & Nakes',
      cfg.medicalSupportFee ?? DEFAULT_FEE_CONFIG.medicalSupportFee,
      'Alokasi skrining tanda vital dan tindakan perawat.',
      'Perawat / Bidan',
      true
    ),
    buildSystemItem(
      'JASA-ADMIN-LOKET',
      'Biaya Administrasi Pendaftaran',
      'Administrasi',
      cfg.adminFee ?? DEFAULT_FEE_CONFIG.adminFee,
      'Biaya kartu rekam medis & administrasi loket.',
      'non_petugas',
      false
    ),
    buildSystemItem(
      'JASA-HOME-VISIT',
      'Jasa Kunjungan Rumah (Home Visit)',
      'Home Care',
      cfg.homeVisitFee ?? DEFAULT_FEE_CONFIG.homeVisitFee,
      'Tarif khusus pemeriksaan home care luar gedung.',
      'Perawat / Bidan',
      true
    ),
    buildSystemItem(
      'JASA-APOTEKER',
      'Jasa Apoteker',
      'Telaah & Konseling',
      cfg.pharmacistFee ?? DEFAULT_FEE_CONFIG.pharmacistFee,
      'Tarif jasa pelayanan kefarmasian, telaah resep, & konseling apoteker.',
      'Apoteker',
      true
    )
  ];

  const customList = Array.isArray(cfg.customTariffs) ? cfg.customTariffs : [];
  return [...coreBase, ...customList].map(normalizeTariffWithRules);
};

export const getStaffRoleList = (staff: Pick<Staff, 'role' | 'roles'>): StaffRole[] => {
  const list: StaffRole[] = [];
  if (staff.role) list.push(staff.role);
  if (Array.isArray(staff.roles)) {
    staff.roles.forEach((r) => {
      if (r && !list.includes(r)) list.push(r);
    });
  }
  return list;
};

export const staffMatchesServiceRole = (
  staff: Staff,
  penerimaRole: ServiceFeeRole
): boolean => {
  if (staff.status === 'Non-Aktif') return false;
  const targetRole = normalizeServiceFeeRole(penerimaRole);
  if (targetRole === 'non_petugas') return false;

  const targetLow = String(targetRole).trim().toLowerCase();
  const roles = getStaffRoleList(staff);

  return roles.some((r) => {
    const normalizedStaffRole = normalizeStaffRole(r, r as StaffRole);
    const rLow = String(r || '').trim().toLowerCase();
    const normLow = String(normalizedStaffRole || '').trim().toLowerCase();

    if (targetLow === 'apj / owner' || isOwnerAdminRole(targetRole)) {
      return isOwnerAdminRole(r) || normLow === 'apj / owner';
    }
    if (targetLow === 'dokter') {
      return normLow === 'dokter' || rLow.includes('dokter');
    }
    if (targetLow === 'perawat / bidan') {
      return normLow === 'perawat / bidan' || rLow === 'perawat / bidan';
    }
    if (targetLow === 'perawat / nakes lapangan') {
      return (
        normLow === 'perawat / nakes lapangan' ||
        rLow === 'perawat / nakes lapangan' ||
        rLow.includes('nakes lapangan')
      );
    }
    if (targetLow === 'apoteker') {
      return normLow === 'apoteker' || rLow === 'apoteker';
    }
    if (targetLow === 'kasir & front office') {
      return (
        normLow === 'kasir & front office' ||
        rLow === 'kasir & front office' ||
        rLow.includes('kasir') ||
        rLow.includes('front office')
      );
    }
    return rLow === targetLow || normLow === targetLow;
  });
};

export const filterEligibleStaffForService = (
  staffList: Staff[],
  penerimaRole: ServiceFeeRole
): Staff[] => {
  return (staffList || []).filter((st) => staffMatchesServiceRole(st, penerimaRole));
};

export const calculateFacilityShareForCartItem = (
  item: Pick<
    CartItem,
    'price' | 'qty' | 'subtotal' | 'fee_allocations' | 'total_fee_item' | 'total_fee_fasilitas' | 'penerima_role'
  >
): { totalServiceFee: number; facilityShare: number; subtotalLayanan: number } => {
  const qty = Math.max(1, Number(item.qty) || 1);
  const price = Math.max(0, Number(item.price) || 0);
  const subtotalLayanan = Math.max(0, Number(item.subtotal) || price * qty);

  let totalServiceFee = 0;
  if (Array.isArray(item.fee_allocations) && item.fee_allocations.length > 0) {
    totalServiceFee = item.fee_allocations.reduce((sum, alloc) => {
      if (normalizeServiceFeeRole(alloc.penerima_role) === 'non_petugas') return sum;
      if (!String(alloc.petugas_id || '').trim()) return sum;
      return sum + Math.max(0, Number(alloc.total_fee_item) || 0);
    }, 0);
  } else if (normalizeServiceFeeRole(item.penerima_role) !== 'non_petugas') {
    totalServiceFee = Math.max(0, Number(item.total_fee_item) || 0);
  }

  const facilityShare = Math.max(0, subtotalLayanan - totalServiceFee);
  return {
    totalServiceFee,
    facilityShare,
    subtotalLayanan
  };
};

export const normalizeTransactionDateToYMD = (dateStr?: string): string => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const clean = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10);

  // Handles ID date strings like "24/11/2026 09:30:11" or "24/11/2026, 09.30.11" or "24-11-2026"
  const idMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (idMatch) {
    const [, d, m, y] = idMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return new Date().toISOString().split('T')[0];
};

export const resolveStaffMatch = (
  staffId?: string | null,
  staffName?: string | null,
  staffList: Staff[] = []
): Staff | undefined => {
  const cleanId = String(staffId || '').trim();
  const cleanName = String(staffName || '').trim().toLowerCase();
  if (cleanId) {
    const byId = (staffList || []).find((s) => s.id === cleanId);
    if (byId) return byId;
  }
  if (cleanName) {
    const byName = (staffList || []).find(
      (s) => String(s.name || '').trim().toLowerCase() === cleanName
    );
    if (byName) return byName;
  }
  return undefined;
};

export const resolveEffectiveEntryRole = (
  entry: Pick<StaffFeeLedgerEntry, 'penerima_role' | 'role_petugas' | 'petugas_id' | 'nama_petugas'>,
  staffList: Staff[] = []
): ServiceFeeRole => {
  if (entry.penerima_role) {
    const norm = normalizeServiceFeeRole(entry.penerima_role);
    if (norm !== 'non_petugas') return norm;
  }
  if (entry.role_petugas) {
    const normRole = normalizeServiceFeeRole(entry.role_petugas);
    if (normRole !== 'non_petugas') return normRole;
  }
  const matched = resolveStaffMatch(entry.petugas_id, entry.nama_petugas, staffList);
  if (matched?.role) {
    const normMatched = normalizeServiceFeeRole(matched.role);
    if (normMatched !== 'non_petugas') return normMatched;
  }
  return 'non_petugas';
};

export const buildFeeLedgerEntriesForTransaction = (
  trx: Transaction,
  feeConfig?: Partial<FeeConfig> | null,
  staffList: Staff[] = []
): StaffFeeLedgerEntry[] => {
  if (!trx || !trx.id) return [];
  const items = Array.isArray(trx.items) ? trx.items : [];
  const isCancelled = trx.status === 'Dibatalkan' || trx.status === 'Diretur';
  const ymd = normalizeTransactionDateToYMD(trx.date);
  const nowIso = new Date().toISOString();
  const resolvedTariffs = resolveAllTariffsWithRules(feeConfig);
  const tariffMap = new Map(resolvedTariffs.map((t) => [t.id, t]));

  const entries: StaffFeeLedgerEntry[] = [];
  const coveredStaffIds = new Set<string>();
  const coveredStaffNames = new Set<string>();

  const markCovered = (pid?: string, name?: string) => {
    const cleanId = String(pid || '').trim();
    const cleanName = String(name || '').trim().toLowerCase();
    if (cleanId) coveredStaffIds.add(cleanId);
    if (cleanName) coveredStaffNames.add(cleanName);
  };

  items.forEach((item, idx) => {
    const matchedRule = tariffMap.get(item.id);
    const qty = Math.max(1, Number(item.qty) || 1);
    const tarifBiaya = Math.max(0, Number(item.price) || 0);
    const subtotalLayanan = Math.max(0, Number(item.subtotal) || tarifBiaya * qty);

    if (Array.isArray(item.fee_allocations) && item.fee_allocations.length > 0) {
      const validAllocations = item.fee_allocations
        .map((alloc, allocIdx) => {
          const petugasId = String(alloc.petugas_id || '').trim();
          const matchedStaff = resolveStaffMatch(petugasId, alloc.nama_petugas, staffList);
          let role = normalizeServiceFeeRole(alloc.penerima_role);
          if (role === 'non_petugas' && (alloc.role_petugas || matchedStaff?.role)) {
            const fallbackRole = normalizeServiceFeeRole(alloc.role_petugas || matchedStaff?.role);
            if (fallbackRole !== 'non_petugas') role = fallbackRole;
          }
          if (!petugasId || role === 'non_petugas') return null;
          const tipeFee = normalizeServiceFeeType(alloc.tipe_fee);
          const nilaiFee = Math.max(0, Number(alloc.nilai_fee) || 0);
          const unitFee =
            alloc.nominal_fee_satuan !== undefined && alloc.nominal_fee_satuan !== null
              ? Math.max(0, Number(alloc.nominal_fee_satuan))
              : calculateUnitServiceFee(tarifBiaya, tipeFee, nilaiFee);
          const totalFeeItem =
            alloc.total_fee_item !== undefined && alloc.total_fee_item !== null
              ? Math.max(0, Number(alloc.total_fee_item))
              : calculateTotalServiceFee(unitFee, qty);
          if (totalFeeItem <= 0) return null;
          return {
            alloc,
            allocIdx,
            petugasId,
            matchedStaff,
            role,
            tipeFee,
            nilaiFee,
            unitFee,
            totalFeeItem
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      if (validAllocations.length === 0) return;

      const totalAllocatedFees = validAllocations.reduce((s, x) => s + x.totalFeeItem, 0);
      const feeFasilitasItem = Math.max(0, subtotalLayanan - totalAllocatedFees);

      validAllocations.forEach((x) => {
        const entryId =
          item.fee_allocations!.length === 1
            ? `FEE-${trx.id}-${idx + 1}`
            : `FEE-${trx.id}-${idx + 1}-${x.allocIdx + 1}`;
        const namaPetugas = x.alloc.nama_petugas || x.matchedStaff?.name || 'Petugas';
        const rolePetugas =
          x.alloc.role_petugas ||
          x.matchedStaff?.role ||
          getServiceFeeRoleMeta(x.role).shortLabel;
        markCovered(x.petugasId, namaPetugas);
        entries.push({
          id: entryId,
          transaction_id: trx.id,
          transaction_date: ymd,
          transaction_datetime: trx.date,
          customer_name: trx.customerName || 'Reguler',
          trx_type: trx.type || 'REGULER',
          service_id: item.id,
          service_name: item.name,
          penerima_role: x.role,
          qty,
          tarif_biaya: tarifBiaya,
          subtotal_layanan: subtotalLayanan,
          tipe_fee: x.tipeFee,
          nilai_fee: x.nilaiFee,
          nominal_fee_satuan: x.unitFee,
          total_fee_item: x.totalFeeItem,
          fee_fasilitas: feeFasilitasItem,
          allocation_id: x.alloc.rule_id,
          petugas_id: x.petugasId,
          nama_petugas: namaPetugas,
          role_petugas: rolePetugas,
          status_pembayaran: isCancelled ? 'dibatalkan' : 'belum_dibayar',
          cancelled_reason: isCancelled
            ? trx.cancelReason || trx.returnReason || trx.status
            : undefined,
          branch_id: trx.branchId || 'BR-01',
          created_at: nowIso,
          updated_at: nowIso
        });
      });
      return;
    }

    // Legacy single-recipient fallback
    const petugasId = String(item.petugas_id || '').trim();
    if (!petugasId) return;

    const tipeFee: ServiceFeeType = item.tipe_fee
      ? normalizeServiceFeeType(item.tipe_fee)
      : matchedRule?.tipe_fee || 'nominal';
    const nilaiFee =
      item.nilai_fee !== undefined && item.nilai_fee !== null
        ? Math.max(0, Number(item.nilai_fee))
        : matchedRule?.nilai_fee ?? 0;

    const unitFee =
      item.nominal_fee_satuan !== undefined && item.nominal_fee_satuan !== null
        ? Math.max(0, Number(item.nominal_fee_satuan))
        : calculateUnitServiceFee(tarifBiaya, tipeFee, nilaiFee);
    const totalFeeItem =
      item.total_fee_item !== undefined && item.total_fee_item !== null
        ? Math.max(0, Number(item.total_fee_item))
        : calculateTotalServiceFee(unitFee, qty);

    if (totalFeeItem <= 0) return;

    const matchedStaff = resolveStaffMatch(petugasId, item.nama_petugas, staffList);
    let penerimaRole: ServiceFeeRole = item.penerima_role
      ? normalizeServiceFeeRole(item.penerima_role)
      : matchedRule?.penerima_role || inferDefaultServiceFeeRole(item);
    if (penerimaRole === 'non_petugas' && (item.role_petugas || matchedStaff?.role)) {
      const resolvedFallback = normalizeServiceFeeRole(item.role_petugas || matchedStaff?.role);
      if (resolvedFallback !== 'non_petugas') penerimaRole = resolvedFallback;
    }
    const feeFasilitasItem = Math.max(0, subtotalLayanan - totalFeeItem);
    const namaPetugas = item.nama_petugas || matchedStaff?.name || 'Petugas';
    const rolePetugas =
      item.role_petugas || matchedStaff?.role || getServiceFeeRoleMeta(penerimaRole).shortLabel;
    markCovered(petugasId, namaPetugas);

    entries.push({
      id: `FEE-${trx.id}-${idx + 1}`,
      transaction_id: trx.id,
      transaction_date: ymd,
      transaction_datetime: trx.date,
      customer_name: trx.customerName || 'Reguler',
      trx_type: trx.type || 'REGULER',
      service_id: item.id,
      service_name: item.name,
      penerima_role: penerimaRole,
      qty,
      tarif_biaya: tarifBiaya,
      subtotal_layanan: subtotalLayanan,
      tipe_fee: tipeFee,
      nilai_fee: nilaiFee,
      nominal_fee_satuan: unitFee,
      total_fee_item: totalFeeItem,
      fee_fasilitas: feeFasilitasItem,
      petugas_id: petugasId,
      nama_petugas: namaPetugas,
      role_petugas: rolePetugas,
      status_pembayaran: isCancelled ? 'dibatalkan' : 'belum_dibayar',
      cancelled_reason: isCancelled ? trx.cancelReason || trx.returnReason || trx.status : undefined,
      branch_id: trx.branchId || 'BR-01',
      created_at: nowIso,
      updated_at: nowIso
    });
  });

  // Merge non-overlapping assignedStaff from header POS Klinik / E-Resep / RME (seluruh role: Dokter, Perawat, Bidan, Apoteker, Kasir, APJ/Owner, dll.)
  if (Array.isArray(trx.assignedStaff) && trx.assignedStaff.length > 0) {
    const aggAssigned = new Map<string, StaffFeeItem>();
    trx.assignedStaff.forEach((st) => {
      if (!st) return;
      const pid = String(st.staffId || '').trim();
      const sname = String(st.staffName || '').trim();
      const feeAmt = Math.max(0, Math.round(Number(st.fee) || 0));
      if ((!pid && !sname) || feeAmt <= 0) return;
      const key = pid || sname.toLowerCase();
      const prev = aggAssigned.get(key);
      if (prev) {
        prev.fee += feeAmt;
      } else {
        aggAssigned.set(key, {
          staffId: pid || sname,
          staffName: sname || 'Petugas',
          role: st.role || '',
          fee: feeAmt
        });
      }
    });

    aggAssigned.forEach((st) => {
      const pid = String(st.staffId || '').trim();
      const snameLow = String(st.staffName || '').trim().toLowerCase();
      if ((pid && coveredStaffIds.has(pid)) || (snameLow && coveredStaffNames.has(snameLow))) {
        return;
      }

      const matchedStaff = resolveStaffMatch(pid, st.staffName, staffList);
      const rawRole = st.role || matchedStaff?.role || '';
      const normRole = rawRole ? normalizeServiceFeeRole(rawRole) : 'Kasir & Front Office';
      const penerimaRole: ServiceFeeRole =
        normRole === 'non_petugas' && rawRole ? rawRole : normRole;
      if (penerimaRole === 'non_petugas') return;

      const roleMeta = getServiceFeeRoleMeta(penerimaRole);
      const safeStaffKey = String(pid || st.staffName).replace(/[^a-zA-Z0-9_-]/g, '_');
      const roleServiceId =
        penerimaRole === 'Dokter'
          ? 'JASA-DOKTER-UMUM'
          : penerimaRole === 'Apoteker'
          ? 'JASA-APOTEKER'
          : penerimaRole === 'Perawat / Bidan' || penerimaRole === 'Perawat / Nakes Lapangan'
          ? 'JASA-PENUNJANG-MEDIS'
          : 'JASA-LAYANAN-PETUGAS';
      const feeAmt = Math.max(0, Math.round(Number(st.fee) || 0));
      const namaPetugas = st.staffName || matchedStaff?.name || 'Petugas';
      const rolePetugas = st.role || matchedStaff?.role || roleMeta.shortLabel;
      markCovered(pid, namaPetugas);

      entries.push({
        id: `FEE-${trx.id}-AS-${safeStaffKey}`,
        transaction_id: trx.id,
        transaction_date: ymd,
        transaction_datetime: trx.date,
        customer_name: trx.customerName || 'Reguler',
        trx_type: trx.type || 'KLINIK',
        service_id: roleServiceId,
        service_name: `Jasa Layanan (${roleMeta.shortLabel})`,
        penerima_role: penerimaRole,
        qty: 1,
        tarif_biaya: feeAmt,
        subtotal_layanan: feeAmt,
        tipe_fee: 'nominal',
        nilai_fee: feeAmt,
        nominal_fee_satuan: feeAmt,
        total_fee_item: feeAmt,
        fee_fasilitas: 0,
        petugas_id: pid || matchedStaff?.id || safeStaffKey,
        nama_petugas: namaPetugas,
        role_petugas: rolePetugas,
        status_pembayaran: isCancelled ? 'dibatalkan' : 'belum_dibayar',
        cancelled_reason: isCancelled
          ? trx.cancelReason || trx.returnReason || trx.status
          : undefined,
        branch_id: trx.branchId || 'BR-01',
        created_at: nowIso,
        updated_at: nowIso
      });
    });
  }

  // Fallback konsisten untuk transaksi KLINIK lama yang belum punya item JASA-* maupun assignedStaff
  if (entries.length === 0 && trx.type === 'KLINIK') {
    const docName = trx.doctorName || 'dr. Anis Prima Dewi';
    const matchedDoc = (staffList || []).find(
      (s) => s.role === 'Dokter' || s.name.toLowerCase() === docName.toLowerCase()
    );
    const feeAmt = Math.max(0, Number(feeConfig?.doctorFee) || 20000);
    if (feeAmt > 0) {
      entries.push({
        id: `FEE-${trx.id}-AS-KLINIK-DOC`,
        transaction_id: trx.id,
        transaction_date: ymd,
        transaction_datetime: trx.date,
        customer_name: trx.customerName || 'Pasien Klinik',
        trx_type: 'KLINIK',
        service_id: 'JASA-DOKTER-UMUM',
        service_name: 'Jasa Dokter Umum / Klinik',
        penerima_role: 'Dokter',
        qty: 1,
        tarif_biaya: feeAmt,
        subtotal_layanan: feeAmt,
        tipe_fee: 'nominal',
        nilai_fee: feeAmt,
        nominal_fee_satuan: feeAmt,
        total_fee_item: feeAmt,
        fee_fasilitas: 0,
        petugas_id: matchedDoc?.id || 'STF-02',
        nama_petugas: matchedDoc?.name || docName,
        role_petugas: 'Dokter',
        status_pembayaran: isCancelled ? 'dibatalkan' : 'belum_dibayar',
        cancelled_reason: isCancelled
          ? trx.cancelReason || trx.returnReason || trx.status
          : undefined,
        branch_id: trx.branchId || 'BR-01',
        created_at: nowIso,
        updated_at: nowIso
      });
    }
  }

  return entries;
};

/**
 * Menghitung ringkasan bagi hasil jasa layanan (Biaya Layanan Pasien vs Hak Fee Petugas vs Bagian Fasilitas)
 * dengan deduplikasi baris layanan agar multi-penerima pada satu jasa tidak menghitung ganda Biaya Layanan.
 */
export const summarizeLedgerRevenueSplit = (
  entries: StaffFeeLedgerEntry[] = []
): {
  totalBiayaLayanan: number;
  totalFeePetugas: number;
  totalFeeFasilitas: number;
  serviceLineCount: number;
} => {
  const lineGroups = new Map<
    string,
    { subtotalLayanan: number; totalFeePetugas: number }
  >();

  entries.forEach((entry) => {
    if (entry.status_pembayaran === 'dibatalkan') return;
    // Extract line key: FEE-TRX123-1-2 -> FEE-TRX123-1, while FEE-TRX123-AS-... uses its own unique entry.id
    const entryIdStr = String(entry.id || '');
    const isAssignedStaffEntry = /-AS-/.test(entryIdStr);
    const idParts = !isAssignedStaffEntry ? entryIdStr.match(/^(FEE-.+?-\d+)(?:-\d+)?$/) : null;
    const lineKey = isAssignedStaffEntry
      ? entryIdStr
      : idParts
      ? `${idParts[1]}__${entry.service_id}`
      : `${entry.transaction_id}__${entry.service_id}__${entry.qty}`;

    const subtotal = Math.max(
      0,
      Number(entry.subtotal_layanan) || (Number(entry.tarif_biaya) || 0) * (Number(entry.qty) || 1)
    );
    const feeItem = Math.max(0, Number(entry.total_fee_item) || 0);

    const existing = lineGroups.get(lineKey);
    if (existing) {
      existing.totalFeePetugas += feeItem;
      if (subtotal > existing.subtotalLayanan) {
        existing.subtotalLayanan = subtotal;
      }
    } else {
      lineGroups.set(lineKey, {
        subtotalLayanan: subtotal,
        totalFeePetugas: feeItem
      });
    }
  });

  let totalBiayaLayanan = 0;
  let totalFeePetugas = 0;
  let totalFeeFasilitas = 0;

  lineGroups.forEach((grp) => {
    totalBiayaLayanan += grp.subtotalLayanan;
    totalFeePetugas += grp.totalFeePetugas;
    totalFeeFasilitas += Math.max(0, grp.subtotalLayanan - grp.totalFeePetugas);
  });

  return {
    totalBiayaLayanan,
    totalFeePetugas,
    totalFeeFasilitas,
    serviceLineCount: lineGroups.size
  };
};

/**
 * Menggabungkan entri log_fee_petugas yang sudah tersimpan dengan snapshot transaksi POS
 * (termasuk item jasa, fee_allocations multi-role, dan assignedStaff klinik/e-resep)
 * sehingga seluruh petugas & role yang tercatat di POS maupun sistem langsung terekap tanpa duplikasi.
 */
export const reconcileFeeLedgerWithTransactions = (
  feeLedger: StaffFeeLedgerEntry[] = [],
  transactions: Transaction[] = [],
  feeConfig?: Partial<FeeConfig> | null,
  staffList: Staff[] = [],
  options?: {
    deletedTransactionIds?: Set<string>;
    deletedLedgerIds?: Set<string>;
    pruneMissingTransactions?: boolean;
  }
): StaffFeeLedgerEntry[] => {
  const deletedTrxSet = options?.deletedTransactionIds || getDeletedIdsSet('transactions');
  const deletedLedgerSet = options?.deletedLedgerIds || getDeletedIdsSet('fee_ledger');
  const pruneMissing = Boolean(options?.pruneMissingTransactions);

  const trxMap = new Map<string, Transaction>();
  (transactions || []).forEach((t) => {
    if (t && t.id && !deletedTrxSet.has(String(t.id).trim())) {
      trxMap.set(String(t.id).trim(), t);
    }
  });

  const byId = new Map<string, StaffFeeLedgerEntry>();
  const persistedTrxStaffIds = new Set<string>();
  const persistedTrxStaffNames = new Set<string>();

  (feeLedger || []).forEach((entry) => {
    if (!entry || !entry.id) return;
    const cleanEntryId = String(entry.id).trim();
    const cleanTrxId = String(entry.transaction_id || '').trim();
    if (deletedLedgerSet.has(cleanEntryId)) return;
    if (cleanTrxId && deletedTrxSet.has(cleanTrxId)) return;

    const matchedTrx = cleanTrxId ? trxMap.get(cleanTrxId) : undefined;
    if (pruneMissing && !matchedTrx) return;

    const trxCancelled =
      matchedTrx && (matchedTrx.status === 'Dibatalkan' || matchedTrx.status === 'Diretur');
    const effectiveRole = resolveEffectiveEntryRole(entry, staffList);
    const matchedStaff = resolveStaffMatch(entry.petugas_id, entry.nama_petugas, staffList);

    const normalizedEntry: StaffFeeLedgerEntry = {
      ...entry,
      penerima_role: effectiveRole !== 'non_petugas' ? effectiveRole : entry.penerima_role,
      nama_petugas: entry.nama_petugas || matchedStaff?.name || 'Petugas',
      role_petugas:
        entry.role_petugas ||
        matchedStaff?.role ||
        (effectiveRole !== 'non_petugas' ? getServiceFeeRoleMeta(effectiveRole).shortLabel : 'Petugas'),
      ...(trxCancelled && entry.status_pembayaran !== 'dibatalkan'
        ? {
            status_pembayaran: 'dibatalkan' as const,
            cancelled_reason:
              matchedTrx!.cancelReason || matchedTrx!.returnReason || matchedTrx!.status
          }
        : {})
    };

    byId.set(entry.id, normalizedEntry);
    if (entry.transaction_id) {
      if (entry.petugas_id) {
        persistedTrxStaffIds.add(`${entry.transaction_id}__${String(entry.petugas_id).trim()}`);
      }
      if (entry.nama_petugas) {
        persistedTrxStaffNames.add(
          `${entry.transaction_id}__${String(entry.nama_petugas).trim().toLowerCase()}`
        );
      }
    }
  });

  (transactions || []).forEach((trx) => {
    if (!trx || !trx.id || deletedTrxSet.has(String(trx.id).trim())) return;
    const derived = buildFeeLedgerEntriesForTransaction(trx, feeConfig, staffList);
    derived.forEach((entry) => {
      if (deletedLedgerSet.has(String(entry.id).trim())) return;
      if (byId.has(entry.id)) return;
      const trxIdKey = `${trx.id}__${String(entry.petugas_id || '').trim()}`;
      const trxNameKey = `${trx.id}__${String(entry.nama_petugas || '').trim().toLowerCase()}`;
      if (persistedTrxStaffIds.has(trxIdKey) || persistedTrxStaffNames.has(trxNameKey)) {
        return;
      }
      byId.set(entry.id, entry);
    });
  });

  return Array.from(byId.values()).sort((a, b) => {
    const da = `${b.transaction_date || ''} ${b.created_at || ''}`;
    const db = `${a.transaction_date || ''} ${a.created_at || ''}`;
    return da.localeCompare(db);
  });
};

export const isDemoFeeLedgerId = (id?: string): boolean => {
  if (!id) return false;
  return id.toUpperCase().startsWith('FEE-DEMO-');
};

export const loadLocalFeeLedger = (): StaffFeeLedgerEntry[] => {
  try {
    const raw = demoGetItem(FEE_LEDGER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveLocalFeeLedger = (entries: StaffFeeLedgerEntry[]): void => {
  try {
    demoSetItem(FEE_LEDGER_STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('Gagal menyimpan log_fee_petugas ke storage lokal:', err);
  }
};

export const resolveTransactionStaffFees = (
  trx: Transaction,
  feeLedgerEntries: StaffFeeLedgerEntry[] = [],
  staffList: Staff[] = []
): StaffFeeItem[] => {
  if (!trx || trx.status === 'Dibatalkan' || trx.status === 'Diretur') {
    return [];
  }

  const activeLedgerRows = (feeLedgerEntries || []).filter(
    (e) =>
      e.transaction_id === trx.id &&
      e.status_pembayaran !== 'dibatalkan' &&
      (Number(e.total_fee_item) || 0) > 0
  );

  const byStaffId = new Map<string, StaffFeeItem>();

  if (activeLedgerRows.length > 0) {
    activeLedgerRows.forEach((row) => {
      const pid = String(row.petugas_id || '').trim();
      if (!pid) return;
      const prev = byStaffId.get(pid);
      if (prev) {
        prev.fee += Number(row.total_fee_item) || 0;
      } else {
        byStaffId.set(pid, {
          staffId: pid,
          staffName: row.nama_petugas || 'Petugas',
          role: row.role_petugas || getServiceFeeRoleMeta(row.penerima_role).shortLabel,
          fee: Number(row.total_fee_item) || 0
        });
      }
    });
  } else {
    // Fallback ke snapshot di CartItem transaksi jika ledger belum terbentuk
    (trx.items || []).forEach((item) => {
      if (Array.isArray(item.fee_allocations) && item.fee_allocations.length > 0) {
        item.fee_allocations.forEach((alloc) => {
          const pid = String(alloc.petugas_id || '').trim();
          const allocFee = Math.max(0, Number(alloc.total_fee_item) || 0);
          if (!pid || allocFee <= 0 || normalizeServiceFeeRole(alloc.penerima_role) === 'non_petugas') {
            return;
          }
          const prev = byStaffId.get(pid);
          if (prev) {
            prev.fee += allocFee;
          } else {
            byStaffId.set(pid, {
              staffId: pid,
              staffName: alloc.nama_petugas || 'Petugas',
              role: alloc.role_petugas || getServiceFeeRoleMeta(alloc.penerima_role).shortLabel,
              fee: allocFee
            });
          }
        });
        return;
      }

      const pid = String(item.petugas_id || '').trim();
      const itemFee = Math.max(0, Number(item.total_fee_item) || 0);
      if (!pid || itemFee <= 0) return;
      const prev = byStaffId.get(pid);
      if (prev) {
        prev.fee += itemFee;
      } else {
        byStaffId.set(pid, {
          staffId: pid,
          staffName: item.nama_petugas || 'Petugas',
          role: item.role_petugas || getServiceFeeRoleMeta(item.penerima_role).shortLabel,
          fee: itemFee
        });
      }
    });
  }

  // Merge assignedStaff dari transaksi yang belum terwakili oleh item jasa (misal pembagian header KLINIK)
  if (Array.isArray(trx.assignedStaff) && trx.assignedStaff.length > 0) {
    trx.assignedStaff.forEach((st) => {
      if (!st || !st.staffId) return;
      if (!byStaffId.has(st.staffId)) {
        byStaffId.set(st.staffId, { ...st });
      }
    });
  }

  if (byStaffId.size > 0) {
    return Array.from(byStaffId.values());
  }

  if (trx.type === 'KLINIK') {
    const docName = trx.doctorName || 'dr. Anis Prima Dewi';
    const matchedDoc = staffList.find((s) => s.role === 'Dokter' || s.name === docName);
    return [
      {
        staffId: matchedDoc?.id || 'STF-02',
        staffName: docName,
        role: 'Dokter',
        fee: 20000
      }
    ];
  }

  return [];
};
