import {
  DEFAULT_ROLE_PERMISSIONS,
  OWNER_ADMIN_ROLE,
  SYSTEM_PERMISSIONS,
  Staff,
  StaffRole,
  ensurePrimaryOwnerStaffRole,
  getStaffActiveRoles,
  isOwnerAdminRole,
  normalizeStaffRole,
  resolveStaffEffectivePermissions
} from '../types';
import {
  demoGetItem,
  demoSetItem,
  getDemoBroadcastChannelName
} from './demoSandbox';

export const RBAC_BROADCAST_CHANNEL_BASE = 'latisha_rbac_sync';
export const ROLE_PERMISSIONS_UPDATED_EVENT = 'latisha_role_permissions_updated';

export const AVAILABLE_STAFF_ROLES: StaffRole[] = [
  'Apoteker',
  'Dokter',
  'Perawat / Bidan',
  'Perawat / Nakes Lapangan',
  'Kasir & Front Office',
  'APJ / Owner'
];

export function normalizeRolePermissionsMap(
  raw?: Record<string, string[]> | null
): Record<string, string[]> {
  const validPermIds = new Set(SYSTEM_PERMISSIONS.map((p) => p.id));
  const mergedRaw: Record<string, string[]> = {
    ...DEFAULT_ROLE_PERMISSIONS,
    ...(raw && typeof raw === 'object' ? raw : {})
  };

  if (mergedRaw['Super Admin / APJ'] && !mergedRaw[OWNER_ADMIN_ROLE]) {
    mergedRaw[OWNER_ADMIN_ROLE] = mergedRaw['Super Admin / APJ'];
  }
  delete mergedRaw['Super Admin / APJ'];

  const normalized: Record<string, string[]> = {};
  for (const [rawRoleKey, list] of Object.entries(mergedRaw)) {
    const roleKey = normalizeStaffRole(rawRoleKey, rawRoleKey as StaffRole);
    if (isOwnerAdminRole(roleKey)) continue;
    const cleanList = Array.isArray(list)
      ? Array.from(
          new Set(
            list.filter((id) => validPermIds.has(id) && id !== 'sys-profil-fasilitas')
          )
        )
      : [];
    normalized[roleKey] = cleanList;
  }

  for (const [defRole, defList] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (!isOwnerAdminRole(defRole) && !normalized[defRole]) {
      normalized[defRole] = defList.filter((id) => id !== 'sys-profil-fasilitas');
    }
  }

  normalized[OWNER_ADMIN_ROLE] = SYSTEM_PERMISSIONS.map((p) => p.id);
  return normalized;
}

export function getSavedRolePermissions(): Record<string, string[]> {
  try {
    const saved = demoGetItem('latisha_role_permissions');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return normalizeRolePermissionsMap(parsed as Record<string, string[]>);
      }
    }
  } catch {}
  return normalizeRolePermissionsMap(DEFAULT_ROLE_PERMISSIONS);
}

const postRbacBroadcast = (message: {
  type: 'role_permissions' | 'staff_list';
  payload: unknown;
}) => {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(getDemoBroadcastChannelName(RBAC_BROADCAST_CHANNEL_BASE));
    ch.postMessage(message);
    ch.close();
  } catch {}
};

export function saveRolePermissionsLocally(
  map: Record<string, string[]>,
  options?: { broadcast?: boolean }
): Record<string, string[]> {
  const normalized = normalizeRolePermissionsMap(map);
  try {
    demoSetItem('latisha_role_permissions', JSON.stringify(normalized));
  } catch {}

  if (options?.broadcast !== false) {
    postRbacBroadcast({ type: 'role_permissions', payload: normalized });
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent(ROLE_PERMISSIONS_UPDATED_EVENT, { detail: normalized })
        );
      } catch {}
    }
  }

  return normalized;
}

export function saveStaffListLocally(
  staffList: Staff[],
  options?: { broadcast?: boolean }
): void {
  try {
    demoSetItem('latisha_staff', JSON.stringify(staffList));
  } catch {}
  if (options?.broadcast !== false) {
    postRbacBroadcast({ type: 'staff_list', payload: staffList });
  }
}

export function reconcileStaffPermissionsWithRoleChange(
  staffList: Staff[],
  updatedRolePermissions: Record<string, string[]>,
  changed: { role: StaffRole; permId: string; enabled: boolean }
): { nextStaffList: Staff[]; updatedStaffMembers: Staff[] } {
  const normalizedRolePerms = normalizeRolePermissionsMap(updatedRolePermissions);
  const validPermIds = new Set(SYSTEM_PERMISSIONS.map((p) => p.id));
  const updatedStaffMembers: Staff[] = [];

  const nextStaffList = staffList.map((rawSt) => {
    const st = ensurePrimaryOwnerStaffRole(rawSt).staff;
    const stRoles = getStaffActiveRoles(st, st.role);
    const hasSuperAdmin = stRoles.some((r) => isOwnerAdminRole(r));
    if (hasSuperAdmin || !stRoles.includes(changed.role)) {
      return st;
    }

    const prevPerms = resolveStaffEffectivePermissions(st, st.role, normalizedRolePerms);
    const nextSet = new Set<string>(
      prevPerms.filter((id) => validPermIds.has(id) && id !== 'sys-profil-fasilitas')
    );

    if (changed.enabled) {
      if (changed.permId !== 'sys-profil-fasilitas' && validPermIds.has(changed.permId)) {
        nextSet.add(changed.permId);
      }
    } else {
      const stillGrantedByAnotherRole = stRoles.some(
        (otherRole) =>
          otherRole !== changed.role &&
          (normalizedRolePerms[otherRole] || []).includes(changed.permId)
      );
      if (!stillGrantedByAnotherRole) {
        nextSet.delete(changed.permId);
      }
    }

    const nextPerms = Array.from(nextSet);
    const existingSet = new Set(st.permissions || []);
    const isSameLength = existingSet.size === nextPerms.length;
    const isIdentical = isSameLength && nextPerms.every((id) => existingSet.has(id));

    if (isIdentical) {
      return st;
    }

    const updatedMember: Staff = {
      ...st,
      permissions: nextPerms
    };
    updatedStaffMembers.push(updatedMember);
    return updatedMember;
  });

  return { nextStaffList, updatedStaffMembers };
}

/**
 * Menghasilkan ID Pegawai berikutnya mulai dari STF-002 (STF-001 khusus APJ / Owner)
 * secara unik dengan mencari nomor terkecil yang belum terpakai pada staffList.
 */
export function generateNextStaffId(staffList: Staff[]): string {
  const existingNums = new Set<number>();
  const existingIds = new Set<string>();

  for (const st of staffList || []) {
    const rawId = String(st?.id || '').trim().toUpperCase();
    if (!rawId) continue;
    existingIds.add(rawId);
    const match = rawId.match(/^STF-0*(\d+)$/i);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > 0) {
        existingNums.add(n);
      }
    }
  }

  let candidateNum = 2;
  let candidate = `STF-${String(candidateNum).padStart(3, '0')}`;
  while (existingNums.has(candidateNum) || existingIds.has(candidate)) {
    candidateNum += 1;
    candidate = `STF-${String(candidateNum).padStart(3, '0')}`;
  }
  return candidate;
}

/**
 * Menghitung daftar ID hak akses modul default sesuai konfigurasi peran pada sistem.
 */
export function resolveRoleDefaultPermissions(
  role: StaffRole,
  rolePermissions: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS
): string[] {
  const normalizedRole = normalizeStaffRole(role, 'Apoteker');
  if (isOwnerAdminRole(normalizedRole)) {
    return SYSTEM_PERMISSIONS.map((p) => p.id);
  }
  const normalizedMap = normalizeRolePermissionsMap(rolePermissions);
  const rawList = normalizedMap[normalizedRole] || DEFAULT_ROLE_PERMISSIONS[normalizedRole] || [];
  const validPermIds = new Set(SYSTEM_PERMISSIONS.map((p) => p.id));
  return Array.from(
    new Set(
      rawList.filter((id) => validPermIds.has(id) && id !== 'sys-profil-fasilitas')
    )
  );
}

/**
 * Menghasilkan URL lengkap untuk halaman registrasi akun pegawai, mempertahankan base pathname
 * (mis. /latishaenterprise/ pada GitHub Pages atau / pada localhost/Cloud Run).
 */
export function getStaffRegistrationShareUrl(includeDemoParam = false): string {
  if (typeof window === 'undefined') {
    return `./?view=registrasi-pegawai${includeDemoParam ? '&mode=demo' : ''}`;
  }
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('view', 'registrasi-pegawai');
  if (includeDemoParam) {
    url.searchParams.set('mode', 'demo');
  }
  return url.toString();
}
