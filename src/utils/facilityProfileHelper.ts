import { useState, useEffect } from 'react';
import { safeBackendFetch } from './serverBridgeHelper';
import {
  getSavedRolePermissions,
  normalizeRolePermissionsMap,
  saveRolePermissionsLocally
} from './staffRegistrationHelper';
import {
  PharmacyProfile,
  PharmacyBankAccount,
  APJProfile,
  DPJProfile
} from '../types';
import {
  fetchFacilityProfilesFromSupabase,
  syncFacilityProfilesToSupabase,
  getSupabaseClient,
  FacilityProfileBundle
} from './supabaseClient';
import {
  isDemoMode,
  demoGetItem,
  demoSetItem,
  demoRemoveItem
} from './demoSandbox';

export const DEFAULT_BANK_ACCOUNTS: PharmacyBankAccount[] = [
  {
    id: 'BNK-1',
    bankName: 'SEABANK',
    accountNumber: '9015-5031-5849',
    accountHolder: 'Mardin'
  },
  {
    id: 'BNK-2',
    bankName: 'BRI',
    accountNumber: '7704-0101-3765-531',
    accountHolder: 'Mardin'
  }
];

export const DEFAULT_PHARMACY_OPERATIONAL_DAYS = 'Senin - Minggu';
export const DEFAULT_PHARMACY_OPEN_TIME = '08:30';
export const DEFAULT_PHARMACY_CLOSE_TIME = '21:00';

export const normalizeTimeHHMM = (val?: string | null): string | null => {
  if (!val) return null;
  const m = String(val).trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const formatOperationalScheduleSummary = (
  days?: string,
  openTime?: string,
  closeTime?: string
): string => {
  const cleanDays = (days || '').trim() || DEFAULT_PHARMACY_OPERATIONAL_DAYS;
  const openNorm = normalizeTimeHHMM(openTime) || DEFAULT_PHARMACY_OPEN_TIME;
  const closeNorm = normalizeTimeHHMM(closeTime) || DEFAULT_PHARMACY_CLOSE_TIME;
  return `${cleanDays}: ${openNorm.replace(':', '.')} - ${closeNorm.replace(':', '.')} WIB`;
};

export interface ResolvedPharmacyOperationalHours {
  days: string;
  openTime: string;
  closeTime: string;
  openDot: string;
  closeDot: string;
  rangeLabel: string;
  summary: string;
}

export const resolvePharmacyOperationalHours = (
  profile?: Partial<PharmacyProfile> | null
): ResolvedPharmacyOperationalHours => {
  let openTime = normalizeTimeHHMM(profile?.operationalOpenTime);
  let closeTime = normalizeTimeHHMM(profile?.operationalCloseTime);

  const rawSchedule = (profile?.operationalSchedule || '').trim();
  if ((!openTime || !closeTime) && rawSchedule) {
    const match = rawSchedule.match(/(\d{1,2})[:.](\d{2})\s*(?:-|–|—|s\/d|sd|sampai)\s*(\d{1,2})[:.](\d{2})/i);
    if (match) {
      if (!openTime) openTime = normalizeTimeHHMM(`${match[1]}:${match[2]}`);
      if (!closeTime) closeTime = normalizeTimeHHMM(`${match[3]}:${match[4]}`);
    }
  }

  const finalOpen = openTime || DEFAULT_PHARMACY_OPEN_TIME;
  const finalClose = closeTime || DEFAULT_PHARMACY_CLOSE_TIME;
  const openDot = finalOpen.replace(':', '.');
  const closeDot = finalClose.replace(':', '.');
  const days = (profile?.operationalDays || '').trim() || DEFAULT_PHARMACY_OPERATIONAL_DAYS;
  const summary =
    rawSchedule || formatOperationalScheduleSummary(days, finalOpen, finalClose);

  return {
    days,
    openTime: finalOpen,
    closeTime: finalClose,
    openDot,
    closeDot,
    rangeLabel: `${openDot} - ${closeDot}`,
    summary
  };
};

export const DEFAULT_PHARMACY_OPERATIONAL_SCHEDULE = formatOperationalScheduleSummary(
  DEFAULT_PHARMACY_OPERATIONAL_DAYS,
  DEFAULT_PHARMACY_OPEN_TIME,
  DEFAULT_PHARMACY_CLOSE_TIME
);

export const DEFAULT_PHARMACY_PROFILE: PharmacyProfile = {
  name: 'Apotek Latisha Farma',
  sia: '445/098/SIA/DPMPTSP/2023',
  address: 'Jl. KTM Tanjung Mas Makmur Kec. Mesuji Timur',
  city: 'Kab. Mesuji, Lampung',
  phone: '0895326272957',
  email: 'apotek@latishafarma.com',
  npwp: '09.876.543.2-012.000',
  nib: '9120003456789',
  headerNote: 'Melayani Resep Dokter, Konsultasi Apoteker & Swamedikasi Terpercaya',
  operationalDays: DEFAULT_PHARMACY_OPERATIONAL_DAYS,
  operationalOpenTime: DEFAULT_PHARMACY_OPEN_TIME,
  operationalCloseTime: DEFAULT_PHARMACY_CLOSE_TIME,
  operationalSchedule: DEFAULT_PHARMACY_OPERATIONAL_SCHEDULE,
  bankAccounts: DEFAULT_BANK_ACCOUNTS
};

export const DEFAULT_APJ_PROFILE: APJProfile = {
  name: 'apt. Mardin, S.Farm',
  sipa: '1993/SIPA/MSJ/2023',
  stra: '19930815/STRA-IAI/2018/2234',
  phone: '0812-8899-7722',
  schedule: 'Senin - Jumat: 08.00 - 16.00 WIB | Sabtu: 08.00 - 13.00 WIB',
  notes: 'Tersedia untuk Pelayanan Informasi Obat (PIO) & Konseling Pasien'
};

export const DEFAULT_DPJ_PROFILE: DPJProfile = {
  name: 'dr. Anis Prima Dewi',
  sip: 'SIP/2024/001-KNA',
  idi: 'KKI: 33.1.1.100.2.20.123456',
  specialization: 'Dokter Umum / Penanggung Jawab Klinis',
  phone: '0812-7389-1122',
  schedule: 'Senin - Sabtu: 08.00 - 20.00 WIB',
  notes: 'Penanggung Jawab Pelayanan Medis, RME SOAP & Surat Keterangan Dokter'
};

export const formatPharmacyAddress = (prof: PharmacyProfile): string => {
  const addr = (prof.address || '').trim();
  const city = (prof.city || '').trim();
  if (!addr) return city;
  if (!city) return addr;
  if (addr.toLowerCase().includes(city.toLowerCase())) {
    return addr;
  }
  return `${addr}, ${city}`;
};

export const formatPharmacyLegalInfo = (prof?: Partial<PharmacyProfile> | null): string => {
  if (!prof) return '';
  const sia = (prof.sia || '').trim();
  const nib = (prof.nib || '').trim();
  const npwp = (prof.npwp || '').trim();
  return [
    sia ? `SIA: ${sia}` : '',
    nib ? `NIB: ${nib}` : '',
    npwp ? `NPWP: ${npwp}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
};

export const sanitizeLegacyDummyPharmacy = (raw: Partial<PharmacyProfile>): PharmacyProfile => {
  let branchName = DEFAULT_PHARMACY_PROFILE.name;
  let branchAddress = DEFAULT_PHARMACY_PROFILE.address;
  const branchCity = DEFAULT_PHARMACY_PROFILE.city;
  let branchPhone = DEFAULT_PHARMACY_PROFILE.phone;
  let branchSia = DEFAULT_PHARMACY_PROFILE.sia;

  try {
    const rawBranches = demoGetItem('latisha_branches');
    if (rawBranches) {
      const parsedBranches = JSON.parse(rawBranches);
      if (Array.isArray(parsedBranches) && parsedBranches.length > 0) {
        const b0 = parsedBranches[0];
        if (
          b0.name &&
          b0.name.trim().toLowerCase() !== 'apotek & klinik pratama latisha farma'
        ) {
          branchName = b0.name.replace(/\s*\(Pusat\)\s*$/i, '').trim() || b0.name;
        }
        if (
          b0.address &&
          !b0.address.toLowerCase().includes('jl. raya kesehatan no. 45')
        ) {
          branchAddress = b0.address;
        }
        if (
          b0.phone &&
          b0.phone.trim() !== '(021) 8899-7722'
        ) {
          branchPhone = b0.phone;
        }
        if (b0.siaNumber) {
          branchSia = b0.siaNumber;
        }
      }
    }
  } catch {}

  let savedLogo: string | undefined = raw.logoUrl;
  try {
    if (savedLogo === undefined) {
      const dedicatedLogo = demoGetItem('latisha_facility_logo');
      if (dedicatedLogo) {
        savedLogo = dedicatedLogo;
      } else {
        const existingSaved = demoGetItem('latisha_pharmacy_profile');
        if (existingSaved) {
          const parsedExisting = JSON.parse(existingSaved);
          if (parsedExisting?.logoUrl) {
            savedLogo = parsedExisting.logoUrl;
          }
        }
      }
    }
  } catch {}

  const LEGACY_TENANT_REGEX = /\b(a?potek\s+sehat(\s+farma)?)\b/gi;
  const sanitizedName =
    typeof raw.name === 'string'
      ? raw.name.replace(LEGACY_TENANT_REGEX, 'APOTEK LATISHA FARMA')
      : raw.name;
  const sanitizedHeaderNote =
    typeof raw.headerNote === 'string'
      ? raw.headerNote.replace(LEGACY_TENANT_REGEX, 'APOTEK LATISHA FARMA')
      : raw.headerNote;
  const hasLegacyTenantName = sanitizedName !== raw.name;
  const hasLegacyTenantHeaderNote = sanitizedHeaderNote !== raw.headerNote;

  const isLegacyName =
    !sanitizedName ||
    sanitizedName.trim().toLowerCase() === 'apotek & klinik pratama latisha farma';
  const isLegacyAddress =
    !raw.address ||
    raw.address.trim().toLowerCase() === 'jl. raya kesehatan no. 45' ||
    raw.address.trim().toLowerCase() === 'jl. raya kesehatan no. 45, jakarta selatan';
  const isLegacyCity =
    !raw.city ||
    raw.city.trim().toLowerCase() === 'jakarta selatan';
  const isLegacyPhone =
    !raw.phone ||
    raw.phone.trim() === '(021) 8899-7722';
  const isLegacyEmail = !raw.email;
  const isLegacySia = !raw.sia;

  const resolvedAddress = isLegacyAddress ? branchAddress : raw.address!;
  const resolvedCity = isLegacyCity ? branchCity : raw.city!;

  const rawBankAccounts = Array.isArray(raw.bankAccounts)
    ? raw.bankAccounts.filter(
        (b) =>
          !(
            (b.bankName || '').trim().toUpperCase() === 'BCA' &&
            (b.accountNumber || '').trim() === '827-092-1122'
          )
      )
    : DEFAULT_BANK_ACCOUNTS;

  const resolvedOp = resolvePharmacyOperationalHours(raw);

  const cleaned: PharmacyProfile = {
    ...DEFAULT_PHARMACY_PROFILE,
    ...raw,
    name: isLegacyName ? branchName : sanitizedName!,
    address: resolvedAddress,
    city: resolvedCity,
    phone: isLegacyPhone ? branchPhone : raw.phone!,
    email: isLegacyEmail ? DEFAULT_PHARMACY_PROFILE.email : raw.email!,
    sia: isLegacySia ? branchSia : raw.sia!,
    npwp: raw.npwp ?? DEFAULT_PHARMACY_PROFILE.npwp,
    nib: raw.nib ?? DEFAULT_PHARMACY_PROFILE.nib,
    headerNote: sanitizedHeaderNote || DEFAULT_PHARMACY_PROFILE.headerNote,
    operationalDays: resolvedOp.days,
    operationalOpenTime: resolvedOp.openTime,
    operationalCloseTime: resolvedOp.closeTime,
    operationalSchedule: resolvedOp.summary,
    bankAccounts: rawBankAccounts.length > 0 ? rawBankAccounts : DEFAULT_BANK_ACCOUNTS,
    logoUrl: savedLogo || ''
  };

  if (
    hasLegacyTenantName ||
    hasLegacyTenantHeaderNote ||
    isLegacyName ||
    isLegacyAddress ||
    isLegacyCity ||
    isLegacyPhone ||
    isLegacyEmail ||
    isLegacySia
  ) {
    try {
      demoSetItem('latisha_pharmacy_profile', JSON.stringify(cleaned));
    } catch {}
  }

  return cleaned;
};

export const syncFacilityProfileToServer = (payload: {
  pharmacy?: PharmacyProfile;
  apj?: APJProfile;
  dpj?: DPJProfile;
}) => {
  try {
    if (isDemoMode()) return;
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    void safeBackendFetch('/api/facility-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      keepalive: true,
      body: JSON.stringify(payload)
    });
  } catch {}
};

export const getSavedPharmacyProfile = (): PharmacyProfile => {
  try {
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const urlPharm = params.get('_pharm');
      if (urlPharm) {
        const rawUrlObj = JSON.parse(urlPharm);
        if (rawUrlObj?.logoUrl) {
          try {
            demoSetItem('latisha_facility_logo', rawUrlObj.logoUrl);
          } catch {}
        }
        const parsedFromUrl = sanitizeLegacyDummyPharmacy(rawUrlObj);
        demoSetItem('latisha_pharmacy_profile', JSON.stringify(parsedFromUrl));
        return parsedFromUrl;
      }
    }
    const saved = demoGetItem('latisha_pharmacy_profile');
    if (saved) {
      return sanitizeLegacyDummyPharmacy(JSON.parse(saved));
    }
    return sanitizeLegacyDummyPharmacy(DEFAULT_PHARMACY_PROFILE);
  } catch {
    return DEFAULT_PHARMACY_PROFILE;
  }
};

export const getOfficialBankAccounts = (profile?: PharmacyProfile | null): PharmacyBankAccount[] => {
  const source = profile || getSavedPharmacyProfile();
  if (Array.isArray(source?.bankAccounts) && source.bankAccounts.length > 0) {
    const valid = source.bankAccounts.filter(
      (b) => (b.bankName || '').trim() && (b.accountNumber || '').trim()
    );
    if (valid.length > 0) return valid;
  }
  return DEFAULT_BANK_ACCOUNTS;
};

export const getSavedAPJProfile = (): APJProfile => {
  try {
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const urlApj = params.get('_apj');
      if (urlApj) {
        const rawUrlApj = JSON.parse(urlApj);
        const parsedFromUrl = { ...DEFAULT_APJ_PROFILE, ...rawUrlApj };
        demoSetItem('latisha_apj_profile', JSON.stringify(parsedFromUrl));
        return parsedFromUrl;
      }
    }
    const saved = demoGetItem('latisha_apj_profile');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_APJ_PROFILE, ...parsed };
    }
    return DEFAULT_APJ_PROFILE;
  } catch {
    return DEFAULT_APJ_PROFILE;
  }
};

export const getSavedDPJProfile = (): DPJProfile => {
  try {
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const urlDpj = params.get('_dpj');
      if (urlDpj) {
        const rawUrlDpj = JSON.parse(urlDpj);
        const parsedFromUrl = { ...DEFAULT_DPJ_PROFILE, ...rawUrlDpj };
        if (parsedFromUrl.specialization === 'Dokter Umum & Pemeriksaan Keluarga') {
          parsedFromUrl.specialization = 'Dokter Umum';
        }
        demoSetItem('latisha_dpj_profile', JSON.stringify(parsedFromUrl));
        return parsedFromUrl;
      }
    }
    const saved = demoGetItem('latisha_dpj_profile');
    if (saved) {
      const rawParsed = JSON.parse(saved);
      const parsed = { ...DEFAULT_DPJ_PROFILE, ...rawParsed };
      if (parsed.specialization === 'Dokter Umum & Pemeriksaan Keluarga') {
        parsed.specialization = 'Dokter Umum';
      }
      return parsed;
    }
    return DEFAULT_DPJ_PROFILE;
  } catch {
    return DEFAULT_DPJ_PROFILE;
  }
};

export const computeFacilityBundleHash = (
  pharmacy: PharmacyProfile,
  apj: APJProfile,
  dpj: DPJProfile
): string => {
  try {
    return JSON.stringify({
      pharmacy: {
        name: pharmacy.name || '',
        sia: pharmacy.sia || '',
        address: pharmacy.address || '',
        city: pharmacy.city || '',
        phone: pharmacy.phone || '',
        email: pharmacy.email || '',
        npwp: pharmacy.npwp || '',
        nib: pharmacy.nib || '',
        headerNote: pharmacy.headerNote || '',
        operationalDays: pharmacy.operationalDays || '',
        operationalOpenTime: pharmacy.operationalOpenTime || '',
        operationalCloseTime: pharmacy.operationalCloseTime || '',
        operationalSchedule: pharmacy.operationalSchedule || '',
        logoUrl: pharmacy.logoUrl || '',
        bankAccounts: pharmacy.bankAccounts || [],
        latitude: pharmacy.latitude ?? null,
        longitude: pharmacy.longitude ?? null,
        checkInRadiusMeters: pharmacy.checkInRadiusMeters ?? 50,
        branchLocations: pharmacy.branchLocations || {}
      },
      apj: {
        name: apj.name || '',
        sipa: apj.sipa || '',
        stra: apj.stra || '',
        phone: apj.phone || '',
        schedule: apj.schedule || '',
        notes: apj.notes || ''
      },
      dpj: {
        name: dpj.name || '',
        sip: dpj.sip || '',
        idi: dpj.idi || '',
        specialization: dpj.specialization || '',
        phone: dpj.phone || '',
        schedule: dpj.schedule || '',
        notes: dpj.notes || ''
      }
    });
  } catch {
    return String(Date.now());
  }
};

export const applyRemoteFacilityProfiles = (bundle: FacilityProfileBundle): {
  changed: boolean;
  pharmacy: PharmacyProfile;
  apj: APJProfile;
  dpj: DPJProfile;
  rolePermissions?: Record<string, string[]>;
} => {
  const currentPharm = getSavedPharmacyProfile();
  const currentApj = getSavedAPJProfile();
  const currentDpj = getSavedDPJProfile();

  let rolePermissionsChanged = false;
  let resolvedRolePerms: Record<string, string[]> | undefined;
  if (bundle.rolePermissions && typeof bundle.rolePermissions === 'object') {
    const currentRolePerms = getSavedRolePermissions();
    const incomingRolePerms = normalizeRolePermissionsMap(bundle.rolePermissions);
    resolvedRolePerms = incomingRolePerms;
    if (JSON.stringify(currentRolePerms) !== JSON.stringify(incomingRolePerms)) {
      saveRolePermissionsLocally(incomingRolePerms, { broadcast: true });
      rolePermissionsChanged = true;
    }
  }

  const beforeHash = computeFacilityBundleHash(currentPharm, currentApj, currentDpj);
  const incomingPharm = bundle.pharmacy || {};

  const mergedPharmRaw: Partial<PharmacyProfile> = {
    ...currentPharm,
    ...incomingPharm,
    bankAccounts:
      Array.isArray(incomingPharm.bankAccounts) && incomingPharm.bankAccounts.length > 0
        ? incomingPharm.bankAccounts
        : currentPharm.bankAccounts,
    logoUrl:
      incomingPharm.logoUrl !== undefined ? incomingPharm.logoUrl : currentPharm.logoUrl
  };
  const nextPharm = sanitizeLegacyDummyPharmacy(mergedPharmRaw);

  const nextApj: APJProfile = {
    ...DEFAULT_APJ_PROFILE,
    ...currentApj,
    ...(bundle.apj || {})
  };

  const nextDpj: DPJProfile = {
    ...DEFAULT_DPJ_PROFILE,
    ...currentDpj,
    ...(bundle.dpj || {})
  };
  if (nextDpj.specialization === 'Dokter Umum & Pemeriksaan Keluarga') {
    nextDpj.specialization = 'Dokter Umum';
  }

  const afterHash = computeFacilityBundleHash(nextPharm, nextApj, nextDpj);
  const profilesChanged = beforeHash !== afterHash;
  if (!profilesChanged && !rolePermissionsChanged) {
    return {
      changed: false,
      pharmacy: currentPharm,
      apj: currentApj,
      dpj: currentDpj,
      ...(resolvedRolePerms ? { rolePermissions: resolvedRolePerms } : {})
    };
  }

  if (profilesChanged) {
    try {
      if (nextPharm.logoUrl) {
        demoSetItem('latisha_facility_logo', nextPharm.logoUrl);
      } else if (incomingPharm.logoUrl !== undefined) {
        demoRemoveItem('latisha_facility_logo');
      }
      demoSetItem('latisha_pharmacy_profile', JSON.stringify(nextPharm));
      demoSetItem('latisha_apj_profile', JSON.stringify(nextApj));
      demoSetItem('latisha_dpj_profile', JSON.stringify(nextDpj));
      syncFacilityProfileToServer({ pharmacy: nextPharm, apj: nextApj, dpj: nextDpj });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('latisha_profile_updated', { detail: { source: 'supabase' } }));
      }
    } catch {}
  }

  return {
    changed: true,
    pharmacy: profilesChanged ? nextPharm : currentPharm,
    apj: profilesChanged ? nextApj : currentApj,
    dpj: profilesChanged ? nextDpj : currentDpj,
    ...(resolvedRolePerms ? { rolePermissions: resolvedRolePerms } : {})
  };
};

// Module-level deduplication so multiple views mounting useFacilityProfiles() do not repeat network calls
let facilityProfilesHydratedOnce = false;

export const useFacilityProfiles = () => {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const handleProfileChange = () => setVersion((v) => v + 1);
    window.addEventListener('latisha_profile_updated', handleProfileChange);
    window.addEventListener('storage', handleProfileChange);

    if (!facilityProfilesHydratedOnce && !isDemoMode() && typeof window !== 'undefined') {
      facilityProfilesHydratedOnce = true;
      const localPharm = getSavedPharmacyProfile();
      const localApj = getSavedAPJProfile();
      const localDpj = getSavedDPJProfile();

      if (localPharm.logoUrl) {
        syncFacilityProfileToServer({
          pharmacy: localPharm,
          apj: localApj,
          dpj: localDpj
        });
      }

      safeBackendFetch('/api/facility-profile')
        .then((r) => (r && r.ok ? r.json() : null))
        .then((serverData) => {
          if (!serverData) return;
          let updated = false;
          const currentPharm = getSavedPharmacyProfile();
          if (serverData.pharmacy) {
            if (!currentPharm.logoUrl && serverData.pharmacy.logoUrl) {
              const mergedPharm = {
                ...currentPharm,
                ...serverData.pharmacy,
                logoUrl: serverData.pharmacy.logoUrl
              };
              try {
                demoSetItem('latisha_facility_logo', serverData.pharmacy.logoUrl);
                demoSetItem('latisha_pharmacy_profile', JSON.stringify(mergedPharm));
                updated = true;
              } catch {}
            }
          } else if (currentPharm.logoUrl) {
            syncFacilityProfileToServer({
              pharmacy: currentPharm,
              apj: getSavedAPJProfile(),
              dpj: getSavedDPJProfile()
            });
          }
          if (updated) {
            window.dispatchEvent(new Event('latisha_profile_updated'));
          }
        })
        .catch(() => {});

      if (getSupabaseClient()) {
        fetchFacilityProfilesFromSupabase()
          .then((res) => {
            if (res.data) {
              applyRemoteFacilityProfiles(res.data);
            } else if (res.isEmpty) {
              syncFacilityProfilesToSupabase({
                pharmacy: getSavedPharmacyProfile(),
                apj: getSavedAPJProfile(),
                dpj: getSavedDPJProfile()
              });
            }
          })
          .catch(() => {});
      }
    }

    return () => {
      window.removeEventListener('latisha_profile_updated', handleProfileChange);
      window.removeEventListener('storage', handleProfileChange);
    };
  }, []);

  return {
    pharmacyProfile: getSavedPharmacyProfile(),
    apjProfile: getSavedAPJProfile(),
    dpjProfile: getSavedDPJProfile()
  };
};
