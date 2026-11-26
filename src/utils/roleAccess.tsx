import React, { createContext, useContext } from 'react';
import { StaffRole, OWNER_ADMIN_ROLE, isOwnerAdminRole, normalizeStaffRole } from '../types';

interface RoleAccessContextValue {
  activeRole: StaffRole;
  isOwnerAdmin: boolean;
}

const RoleAccessContext = createContext<RoleAccessContextValue>({
  activeRole: 'Kasir & Front Office',
  isOwnerAdmin: false
});

export const RoleAccessProvider: React.FC<{
  activeRole: string;
  children: React.ReactNode;
}> = ({ activeRole, children }) => {
  const normalized = normalizeStaffRole(activeRole);
  const isOwnerAdmin = isOwnerAdminRole(normalized);

  return (
    <RoleAccessContext.Provider value={{ activeRole: normalized, isOwnerAdmin }}>
      {children}
    </RoleAccessContext.Provider>
  );
};

export const useActiveRole = (): StaffRole => {
  return useContext(RoleAccessContext).activeRole;
};

/**
 * Mengembalikan true HANYA jika akun aktif adalah APJ / Owner (Super Admin).
 * Jika overrideRole disediakan, nilai tersebut ikut diverifikasi secara ketat.
 */
export const useIsOwnerAdmin = (overrideRole?: string): boolean => {
  const ctx = useContext(RoleAccessContext);
  if (overrideRole !== undefined) {
    return isOwnerAdminRole(overrideRole);
  }
  return ctx.isOwnerAdmin;
};

export { OWNER_ADMIN_ROLE, isOwnerAdminRole, normalizeStaffRole };
