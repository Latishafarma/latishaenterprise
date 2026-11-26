import { Medicine, Transaction } from '../types';

export type RestrictedDrugCategory = 'antibiotik' | 'psikotropik' | 'narkotik';

export interface RestrictedSaleFlaggedItem {
  id: string;
  name: string;
  category: RestrictedDrugCategory;
  qty: number;
  unit: string;
}

export interface RestrictedSaleAlarm {
  id: string;
  trxId: string;
  trxType: string;
  cashierName: string;
  customerName: string;
  categories: RestrictedDrugCategory[];
  categoryLabel: string;
  flaggedItems: RestrictedSaleFlaggedItem[];
  createdAt: string;
  timestampLabel: string;
}

/**
 * Label Merah pada kolom Kelas Terapi di Master Obat:
 * Antibiotik dengan satuan box / tab / tablet / kaps / kapsul / cap / caps / kapl / kaplet
 */
export function isAntibiotikRxDokter(m: Partial<Medicine> | undefined | null): boolean {
  if (!m) return false;
  const kelasLower = (m.kelas || '').toLowerCase();
  if (!kelasLower.includes('antibiotik')) return false;
  const unitCandidates = [m.satuanBesar, m.satuanKecil, m.unit]
    .map((u) => (u || '').trim().toLowerCase())
    .filter(Boolean);
  return unitCandidates.some((u) =>
    /\b(box|tab|tablet|kaps|kapsul|cap|caps|kapl|kaplet)\b/i.test(u)
  );
}

/**
 * Label Merah pada kolom NAPPZA di Master Obat:
 * Psikotropik atau Narkotik (Wajib Rx Asli)
 */
export function isNappzaRxAsli(m: Partial<Medicine> | undefined | null): boolean {
  if (!m) return false;
  const nappzaLower = (m.nappza || '').toLowerCase();
  return nappzaLower.includes('psikotropik') || nappzaLower.includes('narkotik');
}

export type PrescriptionStatusColorKey =
  | 'emerald'
  | 'sky'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'purple'
  | 'indigo'
  | 'slate';

export interface PrescriptionStatusColorTheme {
  key: PrescriptionStatusColorKey;
  label: string;
  dotClass: string;
  swatchClass: string;
  badgeClass: string;
  portalBadgeClass: string;
  textClass: string;
  alertBoxClass: string;
}

export const PRESCRIPTION_STATUS_COLOR_PALETTE: PrescriptionStatusColorTheme[] = [
  {
    key: 'emerald',
    label: 'Hijau',
    dotClass: 'bg-emerald-500',
    swatchClass: 'bg-emerald-500 ring-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    portalBadgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    textClass: 'text-emerald-700',
    alertBoxClass: 'bg-emerald-50 border-emerald-200 text-emerald-900'
  },
  {
    key: 'sky',
    label: 'Biru Langit',
    dotClass: 'bg-sky-500',
    swatchClass: 'bg-sky-500 ring-sky-500',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    portalBadgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    textClass: 'text-sky-700',
    alertBoxClass: 'bg-sky-50 border-sky-200 text-sky-900'
  },
  {
    key: 'amber',
    label: 'Kuning / Amber',
    dotClass: 'bg-amber-500',
    swatchClass: 'bg-amber-500 ring-amber-500',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    portalBadgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    textClass: 'text-amber-700',
    alertBoxClass: 'bg-amber-50 border-amber-200 text-amber-900'
  },
  {
    key: 'orange',
    label: 'Oranye',
    dotClass: 'bg-orange-500',
    swatchClass: 'bg-orange-500 ring-orange-500',
    badgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
    portalBadgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    textClass: 'text-orange-700',
    alertBoxClass: 'bg-orange-50 border-orange-200 text-orange-900'
  },
  {
    key: 'rose',
    label: 'Merah',
    dotClass: 'bg-rose-600',
    swatchClass: 'bg-rose-600 ring-rose-600',
    badgeClass: 'bg-rose-600 text-white border-rose-700 shadow-2xs',
    portalBadgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    textClass: 'text-rose-700',
    alertBoxClass: 'bg-rose-50 border-rose-200 text-rose-900'
  },
  {
    key: 'purple',
    label: 'Ungu',
    dotClass: 'bg-purple-600',
    swatchClass: 'bg-purple-600 ring-purple-600',
    badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
    portalBadgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    textClass: 'text-purple-700',
    alertBoxClass: 'bg-purple-50 border-purple-200 text-purple-900'
  },
  {
    key: 'indigo',
    label: 'Indigo',
    dotClass: 'bg-indigo-600',
    swatchClass: 'bg-indigo-600 ring-indigo-600',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    portalBadgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    textClass: 'text-indigo-700',
    alertBoxClass: 'bg-indigo-50 border-indigo-200 text-indigo-900'
  },
  {
    key: 'slate',
    label: 'Abu-abu',
    dotClass: 'bg-slate-600',
    swatchClass: 'bg-slate-600 ring-slate-600',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    portalBadgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    textClass: 'text-slate-700',
    alertBoxClass: 'bg-slate-100 border-slate-200 text-slate-900'
  }
];

export interface PrescriptionStatusConfig {
  id: string;
  name: string;
  requiresRx: boolean;
  requiresOriginalRx?: boolean;
  color: PrescriptionStatusColorKey;
  isDefault?: boolean;
}

export const DEFAULT_PRESCRIPTION_STATUS_CONFIGS: PrescriptionStatusConfig[] = [
  {
    id: 'RXST-TANPA-RESEP',
    name: 'Tanpa Resep',
    requiresRx: false,
    requiresOriginalRx: false,
    color: 'emerald',
    isDefault: true
  },
  {
    id: 'RXST-WAJIB-RESEP-DOKTER',
    name: 'Wajib Resep Dokter',
    requiresRx: true,
    requiresOriginalRx: false,
    color: 'amber',
    isDefault: true
  },
  {
    id: 'RXST-WAJIB-RESEP-ASLI',
    name: 'Wajib Resep Asli',
    requiresRx: true,
    requiresOriginalRx: true,
    color: 'rose',
    isDefault: true
  }
];

export const DEFAULT_PRESCRIPTION_STATUS_OPTIONS = [
  'Tanpa Resep',
  'Wajib Resep Dokter',
  'Wajib Resep Asli'
] as const;

export const PRESCRIPTION_STATUS_CONFIGS_KEY = 'latisha_prescription_status_configs_v1';
export const PRESCRIPTION_STATUS_UPDATED_EVENT = 'latisha-rx-status-config-updated';

function readStorageRaw(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const isDemo = (() => {
      try {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('mode') === 'demo' || sp.get('demo') === '1') return true;
        return window.sessionStorage.getItem('latisha_active_demo_sandbox') === '1';
      } catch {
        return false;
      }
    })();
    if (isDemo) {
      const demoVal = window.sessionStorage.getItem(`demo_${key}`);
      if (demoVal !== null) return demoVal;
    }
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageRaw(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    const isDemo = (() => {
      try {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('mode') === 'demo' || sp.get('demo') === '1') return true;
        return window.sessionStorage.getItem('latisha_active_demo_sandbox') === '1';
      } catch {
        return false;
      }
    })();
    if (isDemo) {
      window.sessionStorage.setItem(`demo_${key}`, value);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {}
}

function isValidColorKey(color: unknown): color is PrescriptionStatusColorKey {
  return PRESCRIPTION_STATUS_COLOR_PALETTE.some((c) => c.key === color);
}

export function getPrescriptionStatusColorTheme(
  color?: PrescriptionStatusColorKey | string
): PrescriptionStatusColorTheme {
  const found = PRESCRIPTION_STATUS_COLOR_PALETTE.find((c) => c.key === color);
  return found || PRESCRIPTION_STATUS_COLOR_PALETTE[0];
}

function inferDefaultMetaForLegacyStatus(rawName: string): {
  requiresRx: boolean;
  requiresOriginalRx: boolean;
  color: PrescriptionStatusColorKey;
} {
  const lower = String(rawName || '').trim().toLowerCase();
  const isNonRx =
    !lower ||
    /\b(tanpa|bebas|otc|non[\s-]?resep|no[\s-]?rx|tidak\s*(wajib|perlu)\s*resep|diorder\s*tanpa)\b/i.test(
      lower
    );
  if (isNonRx) {
    return { requiresRx: false, requiresOriginalRx: false, color: 'emerald' };
  }
  const isOriginalRx = /\b(asli|fisik|original|narkotik|psikotropik)\b/i.test(lower);
  if (isOriginalRx) {
    return { requiresRx: true, requiresOriginalRx: true, color: 'rose' };
  }
  return { requiresRx: true, requiresOriginalRx: false, color: 'amber' };
}

function dispatchPrescriptionStatusConfigUpdated(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PRESCRIPTION_STATUS_UPDATED_EVENT));
    }
  } catch {}
}

export function getPrescriptionStatusConfigs(): PrescriptionStatusConfig[] {
  const raw = readStorageRaw(PRESCRIPTION_STATUS_CONFIGS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sanitized: PrescriptionStatusConfig[] = parsed
          .filter((item) => item && typeof item.name === 'string' && item.name.trim().length > 0)
          .map((item, idx) => {
            const cleanName = String(item.name).trim();
            const reqRx = Boolean(item.requiresRx);
            const reqOrig = reqRx && Boolean(item.requiresOriginalRx);
            const fallbackColor: PrescriptionStatusColorKey = reqOrig
              ? 'rose'
              : reqRx
              ? 'amber'
              : 'emerald';
            return {
              id:
                typeof item.id === 'string' && item.id.trim()
                  ? item.id.trim()
                  : `RXST-CUSTOM-${idx + 1}`,
              name: cleanName,
              requiresRx: reqRx,
              requiresOriginalRx: reqOrig,
              color: isValidColorKey(item.color) ? item.color : fallbackColor,
              isDefault: Boolean(item.isDefault)
            };
          });
        if (sanitized.length > 0) {
          return sanitized;
        }
      }
    } catch {}
  }

  // Migrate legacy custom / hidden status lists if present
  const hiddenSet = new Set<string>();
  try {
    const hiddenRaw = readStorageRaw('latisha_hidden_prescription_statuses');
    if (hiddenRaw) {
      const parsedHidden = JSON.parse(hiddenRaw);
      if (Array.isArray(parsedHidden)) {
        parsedHidden.forEach((h) => {
          if (typeof h === 'string' && h.trim()) hiddenSet.add(h.trim().toLowerCase());
        });
      }
    }
  } catch {}

  const merged: PrescriptionStatusConfig[] = DEFAULT_PRESCRIPTION_STATUS_CONFIGS.filter(
    (d) => !hiddenSet.has(d.name.toLowerCase())
  ).map((d) => ({ ...d }));

  try {
    const customRaw = readStorageRaw('latisha_custom_prescription_statuses');
    if (customRaw) {
      const parsedCustom = JSON.parse(customRaw);
      if (Array.isArray(parsedCustom)) {
        parsedCustom.forEach((c, idx) => {
          if (typeof c !== 'string' || !c.trim()) return;
          const clean = c.trim();
          const key = clean.toLowerCase();
          if (hiddenSet.has(key)) return;
          if (merged.some((m) => m.name.toLowerCase() === key)) return;
          const inferred = inferDefaultMetaForLegacyStatus(clean);
          merged.push({
            id: `RXST-MIG-${idx}-${Date.now()}`,
            name: clean,
            requiresRx: inferred.requiresRx,
            requiresOriginalRx: inferred.requiresOriginalRx,
            color: inferred.color,
            isDefault: false
          });
        });
      }
    }
  } catch {}

  return merged.length > 0
    ? merged
    : DEFAULT_PRESCRIPTION_STATUS_CONFIGS.map((d) => ({ ...d }));
}

export function savePrescriptionStatusConfigs(
  configs: PrescriptionStatusConfig[]
): PrescriptionStatusConfig[] {
  const seenNames = new Set<string>();
  const normalized: PrescriptionStatusConfig[] = [];

  for (const item of configs) {
    const cleanName = String(item?.name || '').trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    const requiresRx = Boolean(item.requiresRx);
    const requiresOriginalRx = requiresRx && Boolean(item.requiresOriginalRx);
    const fallbackColor: PrescriptionStatusColorKey = requiresOriginalRx
      ? 'rose'
      : requiresRx
      ? 'amber'
      : 'emerald';

    normalized.push({
      id:
        item.id && item.id.trim()
          ? item.id.trim()
          : `RXST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      requiresRx,
      requiresOriginalRx,
      color: isValidColorKey(item.color) ? item.color : fallbackColor,
      isDefault: Boolean(item.isDefault)
    });
  }

  writeStorageRaw(PRESCRIPTION_STATUS_CONFIGS_KEY, JSON.stringify(normalized));
  dispatchPrescriptionStatusConfigUpdated();
  return normalized;
}

export function upsertPrescriptionStatusConfig(input: {
  id?: string;
  previousName?: string;
  name: string;
  requiresRx: boolean;
  requiresOriginalRx?: boolean;
  color: PrescriptionStatusColorKey;
}): { configs: PrescriptionStatusConfig[]; saved: PrescriptionStatusConfig } {
  const existingList = getPrescriptionStatusConfigs();
  const cleanName = String(input.name || '').trim();
  const prevNameLower = String(input.previousName || '').trim().toLowerCase();
  const targetKey = cleanName.toLowerCase();

  const existingIdx = existingList.findIndex(
    (c) =>
      (input.id && c.id === input.id) ||
      (prevNameLower && c.name.toLowerCase() === prevNameLower) ||
      c.name.toLowerCase() === targetKey
  );

  const savedItem: PrescriptionStatusConfig = {
    id:
      existingIdx >= 0
        ? existingList[existingIdx].id
        : input.id && input.id.trim()
        ? input.id.trim()
        : `RXST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    requiresRx: Boolean(input.requiresRx),
    requiresOriginalRx: Boolean(input.requiresRx) && Boolean(input.requiresOriginalRx),
    color: isValidColorKey(input.color)
      ? input.color
      : input.requiresRx
      ? 'amber'
      : 'emerald',
    isDefault: existingIdx >= 0 ? existingList[existingIdx].isDefault : false
  };

  let nextList: PrescriptionStatusConfig[];
  if (existingIdx >= 0) {
    nextList = existingList.map((item, idx) => (idx === existingIdx ? savedItem : item));
  } else {
    nextList = [...existingList, savedItem];
  }

  // Deduplicate if renamed to match another existing entry
  const deduped = savePrescriptionStatusConfigs(nextList);
  const resolvedSaved =
    deduped.find((c) => c.name.toLowerCase() === targetKey) || savedItem;

  return { configs: deduped, saved: resolvedSaved };
}

export function deletePrescriptionStatusConfig(idOrName: string): PrescriptionStatusConfig[] {
  const key = String(idOrName || '').trim().toLowerCase();
  const current = getPrescriptionStatusConfigs();
  const next = current.filter(
    (c) => c.id.toLowerCase() !== key && c.name.toLowerCase() !== key
  );
  return savePrescriptionStatusConfigs(next);
}

export function resetPrescriptionStatusConfigs(): PrescriptionStatusConfig[] {
  return savePrescriptionStatusConfigs(
    DEFAULT_PRESCRIPTION_STATUS_CONFIGS.map((d) => ({ ...d }))
  );
}

export function findPrescriptionStatusConfig(
  rawStatus: string,
  configs?: PrescriptionStatusConfig[]
): PrescriptionStatusConfig | undefined {
  const key = String(rawStatus || '').trim().toLowerCase();
  if (!key) return undefined;
  const source = configs || getPrescriptionStatusConfigs();
  return source.find((c) => c.name.trim().toLowerCase() === key);
}

export type PortalRxRequirementLevel = 'WAJIB_RESEP_ASLI' | 'WAJIB_RESEP_DOKTER' | 'BEBAS';

export interface MedicinePrescriptionRequirement {
  requiresRx: boolean;
  requiresOriginalRx: boolean;
  level: PortalRxRequirementLevel;
  badgeLabel: string;
  reason: string;
  isExplicit: boolean;
  color: PrescriptionStatusColorKey;
  colorTheme: PrescriptionStatusColorTheme;
}

/**
 * Mengklasifikasikan status resep berdasarkan pengaturan fleksibel jenis status resep
 * (wajib upload Rx & warna penanda), dengan fallback cerdas untuk data lama.
 */
export function classifyPrescriptionStatusLabel(
  rawStatus: string,
  configsOverride?: PrescriptionStatusConfig[]
): MedicinePrescriptionRequirement {
  const cleanLabel = String(rawStatus || '').trim();
  const configs = configsOverride || getPrescriptionStatusConfigs();
  const matchedConfig = findPrescriptionStatusConfig(cleanLabel, configs);

  if (matchedConfig) {
    const requiresRx = Boolean(matchedConfig.requiresRx);
    const requiresOriginalRx = requiresRx && Boolean(matchedConfig.requiresOriginalRx);
    const level: PortalRxRequirementLevel = requiresOriginalRx
      ? 'WAJIB_RESEP_ASLI'
      : requiresRx
      ? 'WAJIB_RESEP_DOKTER'
      : 'BEBAS';
    const colorTheme = getPrescriptionStatusColorTheme(matchedConfig.color);

    return {
      requiresRx,
      requiresOriginalRx,
      level,
      badgeLabel: matchedConfig.name,
      reason: !requiresRx
        ? `Status Resep "${matchedConfig.name}": produk dapat diorder langsung tanpa unggah resep.`
        : requiresOriginalRx
        ? `Status Resep "${matchedConfig.name}": wajib unggah foto/file resep dan menyerahkan resep asli fisik saat pengambilan/pengiriman.`
        : `Status Resep "${matchedConfig.name}": wajib melampirkan foto/file resep dokter sebelum checkout.`,
      isExplicit: true,
      color: colorTheme.key,
      colorTheme
    };
  }

  const inferred = inferDefaultMetaForLegacyStatus(cleanLabel);
  const level: PortalRxRequirementLevel = inferred.requiresOriginalRx
    ? 'WAJIB_RESEP_ASLI'
    : inferred.requiresRx
    ? 'WAJIB_RESEP_DOKTER'
    : 'BEBAS';
  const colorTheme = getPrescriptionStatusColorTheme(inferred.color);

  if (!inferred.requiresRx) {
    return {
      requiresRx: false,
      requiresOriginalRx: false,
      level,
      badgeLabel: cleanLabel || 'Tanpa Resep',
      reason: `Status Resep "${cleanLabel || 'Tanpa Resep'}" di Master Data Obat: produk dapat diorder langsung tanpa unggah resep.`,
      isExplicit: true,
      color: colorTheme.key,
      colorTheme
    };
  }

  if (inferred.requiresOriginalRx) {
    return {
      requiresRx: true,
      requiresOriginalRx: true,
      level,
      badgeLabel: cleanLabel,
      reason: `Status Resep "${cleanLabel}" di Master Data Obat: wajib unggah foto/file resep dan menyerahkan resep asli fisik saat pengambilan/pengiriman.`,
      isExplicit: true,
      color: colorTheme.key,
      colorTheme
    };
  }

  return {
    requiresRx: true,
    requiresOriginalRx: false,
    level,
    badgeLabel: cleanLabel,
    reason: `Status Resep "${cleanLabel}" di Master Data Obat: wajib melampirkan foto/file resep dokter sebelum checkout.`,
    isExplicit: true,
    color: colorTheme.key,
    colorTheme
  };
}

/**
 * Menentukan saran default Status Resep berdasarkan NAPPZA, kelas terapi, dan kategori.
 */
export function getDefaultPrescriptionStatusSuggestion(
  m: Partial<Medicine> | undefined | null
): 'Tanpa Resep' | 'Wajib Resep Dokter' | 'Wajib Resep Asli' {
  if (!m) return 'Tanpa Resep';
  const nappzaLower = (m.nappza || '').trim().toLowerCase();
  const kelasLower = (m.kelas || '').trim().toLowerCase();
  const categoryLower = (m.category || '').trim().toLowerCase();

  if (nappzaLower.includes('psikotropik') || nappzaLower.includes('narkotik')) {
    return 'Wajib Resep Asli';
  }

  if (isAntibiotikRxDokter(m) || kelasLower.includes('antibiotik')) {
    return 'Wajib Resep Dokter';
  }

  const hasOtherControlledNappza =
    Boolean(nappzaLower) &&
    nappzaLower !== 'non-nappza' &&
    nappzaLower !== '-' &&
    (nappzaLower.includes('oot') ||
      nappzaLower.includes('prekursor') ||
      nappzaLower.includes('tertentu'));

  if (
    hasOtherControlledNappza ||
    categoryLower === 'obat keras' ||
    categoryLower.includes('psikotropika')
  ) {
    return 'Wajib Resep Dokter';
  }

  return 'Tanpa Resep';
}

/**
 * Menentukan penanda wajib resep untuk Ruang Order Reguler:
 * Prioritas 1: Mengikuti kolom eksplisit `statusResep` pada tabel master_obat + pengaturan status resep.
 * Fallback (data lama tanpa `statusResep`): mengikuti aturan kategori/kelas/NAPPZA.
 */
export function getMedicinePrescriptionRequirement(
  m: Partial<Medicine> | undefined | null,
  configsOverride?: PrescriptionStatusConfig[]
): MedicinePrescriptionRequirement {
  const configs = configsOverride || getPrescriptionStatusConfigs();
  if (!m) {
    return classifyPrescriptionStatusLabel('Tanpa Resep', configs);
  }

  const explicitStatus = String(m.statusResep || '').trim();
  if (explicitStatus) {
    return classifyPrescriptionStatusLabel(explicitStatus, configs);
  }

  const fallbackStatus = getDefaultPrescriptionStatusSuggestion(m);
  const resolvedFallback = classifyPrescriptionStatusLabel(fallbackStatus, configs);
  return {
    ...resolvedFallback,
    isExplicit: false
  };
}

export function evaluateCartPrescriptionRequirement(
  items: Medicine[],
  configsOverride?: PrescriptionStatusConfig[]
): {
  requiresRx: boolean;
  requiresOriginalRx: boolean;
  highestLevel: PortalRxRequirementLevel;
  badgeLabel: string;
  flaggedItems: Array<{ medicine: Medicine; req: MedicinePrescriptionRequirement }>;
} {
  const configs = configsOverride || getPrescriptionStatusConfigs();
  const flaggedItems: Array<{ medicine: Medicine; req: MedicinePrescriptionRequirement }> = [];
  for (const med of items) {
    const req = getMedicinePrescriptionRequirement(med, configs);
    if (req.requiresRx) {
      flaggedItems.push({ medicine: med, req });
    }
  }
  const requiresOriginalRx = flaggedItems.some((f) => f.req.requiresOriginalRx);
  const requiresRx = flaggedItems.length > 0;
  const highestLevel: PortalRxRequirementLevel = requiresOriginalRx
    ? 'WAJIB_RESEP_ASLI'
    : requiresRx
    ? 'WAJIB_RESEP_DOKTER'
    : 'BEBAS';

  const uniqueFlagLabels = Array.from(
    new Set(flaggedItems.map((f) => f.req.badgeLabel.trim()).filter(Boolean))
  );
  const badgeLabel =
    uniqueFlagLabels.length > 0 ? uniqueFlagLabels.join(' · ') : 'Tanpa Resep';

  return {
    requiresRx,
    requiresOriginalRx,
    highestLevel,
    badgeLabel,
    flaggedItems
  };
}

/**
 * Mengevaluasi apakah sebuah transaksi merupakan penjualan obat berlabel merah
 * (Antibiotik / Psikotropik / Narkotik) di luar jalur transaksi Pasien Klinik ('KLINIK').
 */
export function buildRestrictedSaleAlarm(
  trx: Transaction,
  medicines: Medicine[]
): RestrictedSaleAlarm | null {
  if (!trx || !trx.id) return null;

  // Abaikan transaksi yang dibatalkan / diretur
  if (trx.status === 'Dibatalkan' || trx.status === 'Diretur') {
    return null;
  }

  // Hanya jalur di luar Pasien Klinik
  const normalizedType = String(trx.type || '').trim().toUpperCase();
  if (normalizedType === 'KLINIK') {
    return null;
  }

  const flaggedItems: RestrictedSaleFlaggedItem[] = [];
  const categorySet = new Set<RestrictedDrugCategory>();

  for (const item of trx.items || []) {
    if (!item || item.id?.startsWith('JASA-') || item.id?.startsWith('LAB-FEE-')) {
      continue;
    }

    const matchedMed = medicines.find(
      (m) =>
        (item.id && m.id === item.id) ||
        (item.name && m.name.trim().toLowerCase() === item.name.trim().toLowerCase())
    );
    if (!matchedMed) continue;

    const nappzaLower = (matchedMed.nappza || '').toLowerCase();
    const isPsikotropik = nappzaLower.includes('psikotropik');
    const isNarkotik = nappzaLower.includes('narkotik');
    const isAntibiotik = isAntibiotikRxDokter(matchedMed);

    if (isPsikotropik) {
      categorySet.add('psikotropik');
      flaggedItems.push({
        id: matchedMed.id,
        name: item.name || matchedMed.name,
        category: 'psikotropik',
        qty: Number(item.qty) || 1,
        unit: item.unit || matchedMed.unit || ''
      });
    }
    if (isNarkotik) {
      categorySet.add('narkotik');
      flaggedItems.push({
        id: matchedMed.id,
        name: item.name || matchedMed.name,
        category: 'narkotik',
        qty: Number(item.qty) || 1,
        unit: item.unit || matchedMed.unit || ''
      });
    }
    if (isAntibiotik) {
      categorySet.add('antibiotik');
      flaggedItems.push({
        id: matchedMed.id,
        name: item.name || matchedMed.name,
        category: 'antibiotik',
        qty: Number(item.qty) || 1,
        unit: item.unit || matchedMed.unit || ''
      });
    }
  }

  if (flaggedItems.length === 0 || categorySet.size === 0) {
    return null;
  }

  const orderedCategories: RestrictedDrugCategory[] = [];
  if (categorySet.has('antibiotik')) orderedCategories.push('antibiotik');
  if (categorySet.has('psikotropik')) orderedCategories.push('psikotropik');
  if (categorySet.has('narkotik')) orderedCategories.push('narkotik');

  const categoryLabel = orderedCategories.join(' & ');
  const now = new Date();

  return {
    id: `ALM-${trx.id}`,
    trxId: trx.id,
    trxType: normalizedType || 'REGULER',
    cashierName: (trx.kasir || 'Petugas').trim(),
    customerName: (trx.customerName || 'Pelanggan Umum').trim(),
    categories: orderedCategories,
    categoryLabel,
    flaggedItems,
    createdAt: now.toISOString(),
    timestampLabel: now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  };
}
