import React from 'react';
import {
  Building2,
  RefreshCw,
  Smartphone,
  Monitor,
  Settings,
  LogOut,
  Wifi,
  AlertTriangle,
  Lock,
  FlaskConical,
  RotateCcw,
  Menu,
  X
} from 'lucide-react';
import { Branch, Staff, StaffRole, getStaffActiveRoles, isOwnerAdminRole } from '../types';

interface HeaderProps {
  currentBranch: Branch;
  branches: Branch[];
  onSelectBranch: (branch: Branch) => void;
  activeRole: string;
  userName: string;
  currentStaff?: Staff;
  allowedPermissions?: string[];
  isMobileMode: boolean;
  onToggleMobileMode: () => void;
  onLogout: () => void;
  onSyncNow: () => void;
  isSyncing: boolean;
  onOpenLiveMonitor: () => void;
  onOpenSettings?: (tab?: 'apotek' | 'apj' | 'dpj' | 'pegawai') => void;
  pendingShiftApprovalCount?: number;
  onNavigateToCashierShiftApproval?: () => void;
  isDemoMode?: boolean;
  onResetDemo?: () => void;
  onExitDemo?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isDesktopSidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = React.memo(({
  currentBranch,
  branches,
  onSelectBranch,
  activeRole,
  userName,
  currentStaff,
  allowedPermissions,
  isMobileMode,
  onToggleMobileMode,
  onLogout,
  onSyncNow,
  isSyncing,
  onOpenLiveMonitor,
  onOpenSettings,
  pendingShiftApprovalCount = 0,
  onNavigateToCashierShiftApproval,
  isDemoMode = false,
  onResetDemo,
  onExitDemo,
  isSidebarOpen = false,
  onToggleSidebar,
  isDesktopSidebarCollapsed = false,
  onToggleDesktopSidebar
}) => {
  const assignedRoles = getStaffActiveRoles(currentStaff, activeRole as StaffRole);
  const hasSuperAdminRole =
    isOwnerAdminRole(activeRole) || assignedRoles.some((r) => isOwnerAdminRole(r));

  const canAccess = (permId: string): boolean => {
    if (hasSuperAdminRole) return true;
    if (!allowedPermissions) return true;
    return allowedPermissions.includes(permId);
  };

  return (
    <header className="bg-white border-b border-slate-200 px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-xs z-30">
      {/* Zone 1: Hamburger (Mobile/Tablet & Desktop Toggle) + Brand Zone */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {!isMobileMode && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={isSidebarOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            className="lg:hidden min-w-[40px] min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}

        {!isMobileMode && onToggleDesktopSidebar && (
          <button
            type="button"
            onClick={onToggleDesktopSidebar}
            aria-label={isDesktopSidebarCollapsed ? 'Tampilkan sidebar menu' : 'Tutup sidebar menu'}
            aria-expanded={!isDesktopSidebarCollapsed}
            title={
              isDesktopSidebarCollapsed
                ? 'Buka Sidebar Menu Navigasi'
                : 'Tutup Sidebar untuk Tampilan Lebih Luas'
            }
            className={`hidden lg:flex min-w-[40px] min-h-[40px] rounded-xl border items-center justify-center transition-colors cursor-pointer shrink-0 ${
              isDesktopSidebarCollapsed
                ? 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200 shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white p-1 border border-slate-200 shadow-xs overflow-hidden flex items-center justify-center shrink-0"
          title="LatishaEnterprise"
        >
          <img
            src={`${import.meta.env.BASE_URL}assets/aistudio/logo_resmi_apotek_673c56f0.png`}
            alt="Logo Aplikasi LatishaEnterprise"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight whitespace-nowrap truncate">
              Latisha<span className="text-emerald-700">Enterprise</span>
            </span>
            {isDemoMode && (
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-black text-amber-950 bg-amber-300 px-2 py-0.5 rounded-md border border-amber-500 uppercase tracking-wider shadow-xs shrink-0">
                <FlaskConical className="w-3 h-3 text-amber-900" />
                MODE DEMO
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] sm:text-xs text-slate-500 mt-0.5 min-w-0">
            <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
            <select
              value={currentBranch.id}
              onChange={(e) => {
                const found = branches.find((b) => b.id === e.target.value);
                if (found) onSelectBranch(found);
              }}
              className="bg-transparent text-slate-700 font-semibold text-[11px] sm:text-xs border-none outline-none cursor-pointer hover:text-sky-700 transition-colors max-w-[135px] sm:max-w-[220px] md:max-w-none truncate"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.isCentral ? '(Pusat)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Zone 2: System Status & Quick Links */}
      <div className="hidden xl:flex items-center gap-3 text-xs font-medium text-slate-600">
        {pendingShiftApprovalCount > 0 && (hasSuperAdminRole || canAccess('pos-kasir')) && (
          <button
            type="button"
            onClick={onNavigateToCashierShiftApproval}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 font-extrabold transition shadow-xs cursor-pointer whitespace-nowrap"
            title="Klik untuk meninjau & memberikan persetujuan (Approve / Reject) selisih tutup kasir"
          >
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <span>Approval Selisih Kasir ({pendingShiftApprovalCount})</span>
          </button>
        )}

        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 whitespace-nowrap">
          <Wifi className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-slate-700 font-semibold">Sync Cabang:</span>
          <span className="text-emerald-700 font-bold">{currentBranch.syncStatus}</span>
          <button
            onClick={onSyncNow}
            title="Sinkronisasi Data Sekarang"
            disabled={isSyncing}
            className="ml-1 p-1 hover:text-sky-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>

        {canAccess('fo-antrean') && (
          <button
            onClick={onOpenLiveMonitor}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Monitor className="w-4 h-4 text-indigo-600" />
            <span>Layar Antrean & Suara</span>
          </button>
        )}
      </div>

      {/* Zone 3: Demo Controls, Mobile Mode Toggle, Logged-in User Display & Settings */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {isDemoMode && onResetDemo && (
          <button
            type="button"
            onClick={onResetDemo}
            title="Kembalikan seluruh data uji coba Demo Mode ke kondisi awal"
            className="flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 transition-all shadow-xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-800" />
            <span className="hidden sm:inline">Reset Demo</span>
          </button>
        )}
        {isDemoMode && onExitDemo && (
          <button
            type="button"
            onClick={onExitDemo}
            title="Keluar dari Mode Demo Sandbox & kembali ke mode produksi"
            className="hidden md:flex items-center gap-1 min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all cursor-pointer"
          >
            <span>Keluar Demo</span>
          </button>
        )}
        {(canAccess('mobile-lapangan') || isMobileMode) && (
          <button
            onClick={onToggleMobileMode}
            title={isMobileMode ? 'Tutup Mode Mobile' : 'Mode Mobile Lapangan'}
            className={`flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer whitespace-nowrap ${
              isMobileMode
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">
              {isMobileMode ? 'Tutup Mode Mobile' : 'Mode Mobile Lapangan'}
            </span>
          </button>
        )}

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        {/* Logged-in User Info */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="text-right hidden md:block">
            <span className="block text-xs font-bold text-slate-800 leading-tight">
              {userName}
            </span>
            <span className="block text-[10px] text-slate-500 font-semibold">
              {activeRole}
            </span>
          </div>

          <button
            onClick={() => onOpenSettings?.('apotek')}
            type="button"
            title={
              hasSuperAdminRole
                ? 'Pengaturan Sistem & Profil Fasilitas (APJ / Owner)'
                : 'Pengaturan Sistem & Profil Fasilitas (Khusus APJ / Owner)'
            }
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl font-black text-xs flex items-center justify-center border transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 ${
              hasSuperAdminRole
                ? 'bg-sky-100 hover:bg-sky-200 text-sky-800 border-sky-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-300'
            }`}
          >
            {hasSuperAdminRole ? (
              <Settings className="w-4 h-4 text-sky-800" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>
        </div>

        <button
          onClick={onLogout}
          title="Keluar dari sistem"
          className="min-w-[38px] min-h-[38px] p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer flex items-center justify-center shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
});

Header.displayName = 'Header';
