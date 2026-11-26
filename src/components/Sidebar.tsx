import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Activity,
  Globe,
  Stethoscope,
  FolderOpen,
  FileSpreadsheet,
  Receipt,
  FileCheck2,
  Boxes,
  ClipboardList,
  Truck,
  AlertTriangle,
  TrendingUp,
  CreditCard,
  Settings,
  GitBranch,
  ShieldAlert,
  Volume2,
  FileText,
  Handshake,
  Building2,
  RotateCcw,
  Database,
  ClipboardCheck,
  FlaskConical,
  ShieldCheck,
  CalendarClock,
  Search,
  X,
  ShoppingBag,
  BadgePercent,
  Megaphone,
  Calculator
} from 'lucide-react';
import { isOwnerAdminRole } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingResepCount: number;
  pendingOnlineCount: number;
  pendingMitraOrdersCount?: number;
  activeRole: string;
  allowedPermissions?: string[];
  staffRoles?: string[];
  isMobileDrawerOpen?: boolean;
  onCloseMobileDrawer?: () => void;
  isDesktopCollapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  activeTab,
  setActiveTab,
  pendingResepCount,
  pendingOnlineCount,
  pendingMitraOrdersCount = 0,
  activeRole,
  allowedPermissions,
  staffRoles = [],
  isMobileDrawerOpen = false,
  onCloseMobileDrawer,
  isDesktopCollapsed = false
}) => {
  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    onCloseMobileDrawer?.();
  };
  const isAdmin =
    isOwnerAdminRole(activeRole) || staffRoles.some((r) => isOwnerAdminRole(r));

  const canAccess = (permId: string): boolean => {
    if (isAdmin) return true;
    if (!allowedPermissions) return true;
    return allowedPermissions.includes(permId);
  };

  const hasFrontOffice =
    canAccess('fo-antrean') ||
    canAccess('fo-pasien') ||
    canAccess('fo-checkin') ||
    canAccess('fo-online');

  const hasRME =
    canAccess('rme-pemeriksaan') ||
    canAccess('rme-cek-lab') ||
    canAccess('rme-riwayat') ||
    canAccess('rme-laporan') ||
    canAccess('rme-jadwal');

  const hasPOS =
    canAccess('pos-kasir') ||
    canAccess('pos-resep') ||
    canAccess('pos-mitra-orders') ||
    canAccess('pos-riwayat');

  const hasInventory =
    canAccess('inv-master') ||
    canAccess('inv-kartu-stok') ||
    canAccess('inv-stok-opname') ||
    canAccess('inv-pembelian') ||
    canAccess('inv-retur-riwayat') ||
    canAccess('inv-defecta');

  const hasFinance =
    canAccess('keuangan-labarugi') ||
    canAccess('keuangan-hutang-piutang') ||
    canAccess('keuangan-setting') ||
    canAccess('keuangan-pph');

  const hasSystem =
    canAccess('sys-cabang') ||
    canAccess('sys-satusehat') ||
    canAccess('sys-audit') ||
    canAccess('sys-marketing');

  const hasSetup =
    canAccess('setup-mitra') ||
    canAccess('setup-supplier') ||
    canAccess('setup-diskon-promo') ||
    canAccess('setup-database');

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', title: 'Dashboard Eksekutif', group: 'Dashboard', perm: 'dashboard', icon: LayoutDashboard },
    { id: 'fo-antrean', title: 'Live Monitor & Suara Antrean', group: 'Front Office & Antrean', perm: 'fo-antrean', icon: Volume2 },
    { id: 'fo-pasien', title: 'Master Pasien & Kartu QR', group: 'Front Office & Antrean', perm: 'fo-pasien', icon: Users },
    { id: 'fo-checkin', title: 'Check-in & Tanda Vital Pasien', group: 'Front Office & Antrean', perm: 'fo-checkin', icon: Activity },
    { id: 'fo-online', title: 'Pendaftaran Online Pasien', group: 'Front Office & Antrean', perm: 'fo-online', icon: Globe },
    { id: 'rme-pemeriksaan', title: 'Ruang Periksa Dokter (SOAP e-RME)', group: 'Pelayanan Dokter & RME', perm: 'rme-pemeriksaan', icon: Stethoscope },
    { id: 'rme-cek-lab', title: 'Cek Lab & Diagnostik Medis', group: 'Pelayanan Dokter & RME', perm: 'rme-cek-lab', icon: FlaskConical },
    { id: 'rme-riwayat', title: 'Arsip e-RME & Riwayat Medis', group: 'Pelayanan Dokter & RME', perm: 'rme-riwayat', icon: FolderOpen },
    { id: 'rme-laporan', title: 'Laporan Medis & Morbiditas', group: 'Pelayanan Dokter & RME', perm: 'rme-laporan', icon: FileSpreadsheet },
    { id: 'rme-jadwal', title: 'Jadwal Dokter & Petugas Shift', group: 'Pelayanan Dokter & RME', perm: 'rme-jadwal', icon: CalendarClock },
    { id: 'pos-kasir', title: 'Form POS Kasir Multi-Tier', group: 'Farmasi & Kasir POS', perm: 'pos-kasir', icon: Receipt },
    { id: 'pos-resep', title: 'Antrean E-Resep & Skrining Apoteker', group: 'Farmasi & Kasir POS', perm: 'pos-resep', icon: FileCheck2 },
    { id: 'pos-mitra-orders', title: 'Pesanan Penjualan Mitra', group: 'Farmasi & Kasir POS', perm: 'pos-mitra-orders', icon: ShoppingBag },
    { id: 'pos-riwayat', title: 'Riwayat & Faktur Penjualan', group: 'Farmasi & Kasir POS', perm: 'pos-riwayat', icon: FileText },
    { id: 'inv-master', title: 'Master Obat & Harga Bertingkat', group: 'Inventaris & Logistik Pusat', perm: 'inv-master', icon: Boxes },
    { id: 'inv-kartu-stok', title: 'Mutasi & Kartu Stok Digital', group: 'Inventaris & Logistik Pusat', perm: 'inv-kartu-stok', icon: ClipboardList },
    { id: 'inv-stok-opname', title: 'Stok Opname Fisik & Sistem', group: 'Inventaris & Logistik Pusat', perm: 'inv-stok-opname', icon: ClipboardCheck },
    { id: 'inv-pembelian', title: 'Pembelian & Faktur PBF', group: 'Inventaris & Logistik Pusat', perm: 'inv-pembelian', icon: Truck },
    { id: 'inv-retur-riwayat', title: 'Retur Pembelian Barang', group: 'Inventaris & Logistik Pusat', perm: 'inv-retur-riwayat', icon: RotateCcw },
    { id: 'inv-defecta', title: 'Defecta & Re-Order Otomatis', group: 'Inventaris & Logistik Pusat', perm: 'inv-defecta', icon: AlertTriangle },
    { id: 'keuangan-labarugi', title: 'Laba Rugi & Valuasi Aset', group: 'Keuangan & Akuntansi', perm: 'keuangan-labarugi', icon: TrendingUp },
    { id: 'keuangan-hutang-piutang', title: 'Hutang & Piutang Keuangan', group: 'Keuangan & Akuntansi', perm: 'keuangan-hutang-piutang', icon: CreditCard },
    { id: 'keuangan-setting', title: 'Gaji, Jasa, Fee & Lembur', group: 'Keuangan & Akuntansi', perm: 'keuangan-setting', icon: Settings },
    { id: 'keuangan-pph', title: 'Estimasi PPh (WP OP)', group: 'Keuangan & Akuntansi', perm: 'keuangan-pph', icon: Calculator },
    { id: 'sys-cabang', title: 'Sinkronisasi Multi-Cabang', group: 'Sistem & Multi-Cabang', perm: 'sys-cabang', icon: GitBranch },
    { id: 'sys-satusehat', title: 'Integrasi SATUSEHAT Kemenkes', group: 'Sistem & Multi-Cabang', perm: 'sys-satusehat', icon: ShieldCheck },
    { id: 'sys-audit', title: 'Audit Trail & Riwayat Log Sistem', group: 'Sistem & Multi-Cabang', perm: 'sys-audit', icon: ShieldAlert },
    { id: 'sys-marketing', title: 'Strategi Marketing', group: 'Sistem & Multi-Cabang', perm: 'sys-marketing', icon: Megaphone },
    { id: 'setup-mitra', title: 'Mitra (Fasilitas Kesehatan)', group: 'Setup', perm: 'setup-mitra', icon: Handshake },
    { id: 'setup-supplier', title: 'Supplier (Distributor & PBF)', group: 'Setup', perm: 'setup-supplier', icon: Building2 },
    { id: 'setup-diskon-promo', title: 'Manajemen Diskon & Promo', group: 'Setup', perm: 'setup-diskon-promo', icon: BadgePercent },
    { id: 'setup-database', title: 'Export & Import Database', group: 'Setup', perm: 'setup-database', icon: Database },
  ];

  const filteredMenuItems = menuItems.filter((item) => {
    if (!canAccess(item.perm)) return false;
    if (!searchQuery.trim()) return false;
    const q = searchQuery.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.group.toLowerCase().includes(q);
  });

  const sidebarBody = (
    <aside className="w-72 lg:w-64 h-full bg-slate-900 text-slate-300 flex flex-col justify-between border-r border-slate-800 shrink-0 select-none">
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile/Tablet Drawer Header */}
        <div className="flex lg:hidden items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white p-0.5 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
              <img
                src="/assets/aistudio/logo_resmi_apotek_673c56f0.png"
                alt="Logo Latisha Farma"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="font-extrabold text-white text-xs tracking-tight">Menu Navigasi Sistem</span>
          </div>
          <button
            type="button"
            onClick={onCloseMobileDrawer}
            aria-label="Tutup navigasi"
            className="min-w-[36px] min-h-[36px] rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input Header */}
        <div className="p-3 border-b border-slate-800 relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Cari menu atau submenu..."
              className="w-full bg-slate-950 text-slate-200 pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-800 focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Realtime Search Results Dropdown */}
          {isSearchOpen && searchQuery.trim().length > 0 && (
            <div className="absolute left-3 right-3 top-14 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
              {filteredMenuItems.length > 0 ? (
                filteredMenuItems.map((item) => {
                  const IconComp = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        handleSelectTab(item.id);
                        setSearchQuery('');
                        setIsSearchOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-slate-300 hover:text-white hover:bg-slate-800 transition-colors group"
                    >
                      <IconComp className="w-4 h-4 text-sky-400 shrink-0 group-hover:scale-110 transition-transform" />
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-xs truncate">{item.title}</span>
                        <span className="text-[10px] text-slate-500 truncate">{item.group}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-center text-slate-500 text-xs">
                  Tidak ditemukan menu "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Tab Links */}
        {canAccess('dashboard') && (
          <div className="p-3 border-b border-slate-800">
            <button
              onClick={() => handleSelectTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-sky-400" />
              <span>Dashboard Eksekutif</span>
            </button>
          </div>
        )}

        <nav className="p-3 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs">
          {/* MODUL 1: FRONT OFFICE & ANTREAN */}
          {hasFrontOffice && (
            <div>
              <p className="px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                1. Front Office & Antrean
              </p>
              <div className="space-y-0.5">
                {canAccess('fo-antrean') && (
                  <button
                    onClick={() => handleSelectTab('fo-antrean')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'fo-antrean'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Volume2 className="w-4 h-4 text-indigo-400" />
                      <span>Live Monitor & Suara</span>
                    </span>
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono font-bold">
                      Voice
                    </span>
                  </button>
                )}

                {canAccess('fo-pasien') && (
                  <button
                    onClick={() => handleSelectTab('fo-pasien')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'fo-pasien'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>Master Pasien & Kartu QR</span>
                  </button>
                )}

                {canAccess('fo-checkin') && (
                  <button
                    onClick={() => handleSelectTab('fo-checkin')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'fo-checkin'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Activity className="w-4 h-4 text-rose-400" />
                    <span>Check-in & Tanda Vital</span>
                  </button>
                )}

                {canAccess('fo-online') && (
                  <button
                    onClick={() => handleSelectTab('fo-online')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'fo-online'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Globe className="w-4 h-4 text-sky-400" />
                      <span>Pendaftaran Online</span>
                    </span>
                    {pendingOnlineCount > 0 && (
                      <span className="bg-sky-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                        {pendingOnlineCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* MODUL 2: PELAYANAN DOKTER & RME */}
          {hasRME && (
            <div>
              <p className="px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                2. Pelayanan Dokter & RME
              </p>
              <div className="space-y-0.5">
                {canAccess('rme-pemeriksaan') && (
                  <button
                    onClick={() => handleSelectTab('rme-pemeriksaan')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'rme-pemeriksaan'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Stethoscope className="w-4 h-4 text-sky-400" />
                    <span>Ruang Periksa Dokter (SOAP)</span>
                  </button>
                )}

                {canAccess('rme-cek-lab') && (
                  <button
                    onClick={() => handleSelectTab('rme-cek-lab')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'rme-cek-lab'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <FlaskConical className="w-4 h-4 text-purple-400" />
                      <span>Cek Lab & Diagnostik</span>
                    </span>
                    <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono font-bold">
                      Lab
                    </span>
                  </button>
                )}

                {canAccess('rme-riwayat') && (
                  <button
                    onClick={() => handleSelectTab('rme-riwayat')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'rme-riwayat'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4 text-emerald-400" />
                    <span>Arsip e-RME & Riwayat</span>
                  </button>
                )}

                {canAccess('rme-laporan') && (
                  <button
                    onClick={() => handleSelectTab('rme-laporan')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'rme-laporan'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                    <span>Laporan Medis & Morbiditas</span>
                  </button>
                )}

                {canAccess('rme-jadwal') && (
                  <button
                    onClick={() => handleSelectTab('rme-jadwal')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'rme-jadwal'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <CalendarClock className="w-4 h-4 text-sky-400" />
                      <span>Jadwal Dokter & Petugas</span>
                    </span>
                    <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-mono font-bold">
                      Shift
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* MODUL 3: FARMASI & KASIR POS */}
          {hasPOS && (
            <div>
              <p className="px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                3. Farmasi & Kasir POS
              </p>
              <div className="space-y-0.5">
                {canAccess('pos-kasir') && (
                  <button
                    onClick={() => handleSelectTab('pos-kasir')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'pos-kasir'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    <span>Form POS Kasir Multi-Tier</span>
                  </button>
                )}

                {canAccess('pos-resep') && (
                  <button
                    onClick={() => handleSelectTab('pos-resep')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'pos-resep'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <FileCheck2 className="w-4 h-4 text-amber-400" />
                      <span>Antrean E-Resep & Skrining</span>
                    </span>
                    {pendingResepCount > 0 && (
                      <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-black animate-pulse">
                        {pendingResepCount}
                      </span>
                    )}
                  </button>
                )}

                {canAccess('pos-mitra-orders') && (
                  <button
                    onClick={() => handleSelectTab('pos-mitra-orders')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'pos-mitra-orders'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <ShoppingBag className="w-4 h-4 text-emerald-400" />
                      <span>Pesanan Penjualan Mitra</span>
                    </span>
                    {pendingMitraOrdersCount > 0 && (
                      <span className="bg-emerald-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-black font-mono tabular-nums">
                        {pendingMitraOrdersCount}
                      </span>
                    )}
                  </button>
                )}

                {canAccess('pos-riwayat') && (
                  <button
                    onClick={() => handleSelectTab('pos-riwayat')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'pos-riwayat'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span>Riwayat & Faktur Penjualan</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* MODUL 4: INVENTARIS PUSAT & LOGISTIK */}
          {hasInventory && (
            <div>
              <p className="px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                4. Inventaris & Logistik Pusat
              </p>
              <div className="space-y-0.5">
                {canAccess('inv-master') && (
                  <button
                    onClick={() => handleSelectTab('inv-master')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'inv-master'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Boxes className="w-4 h-4 text-sky-400" />
                    <span>Master Obat & Harga Bertingkat</span>
                  </button>
                )}

                {canAccess('inv-kartu-stok') && (
                  <button
                    onClick={() => handleSelectTab('inv-kartu-stok')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'inv-kartu-stok'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <ClipboardList className="w-4 h-4 text-indigo-400" />
                    <span>Mutasi &amp; Kartu Stok Digital</span>
                  </button>
                )}

                {canAccess('inv-stok-opname') && (
                  <button
                    onClick={() => handleSelectTab('inv-stok-opname')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'inv-stok-opname'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <ClipboardCheck className="w-4 h-4 text-emerald-400" />
                      <span>Stok Opname</span>
                    </span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                      Live
                    </span>
                  </button>
                )}

                {canAccess('inv-pembelian') && (
                  <button
                    onClick={() => handleSelectTab('inv-pembelian')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'inv-pembelian'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Truck className="w-4 h-4 text-teal-400" />
                    <span>Pembelian & Faktur PBF</span>
                  </button>
                )}

                {canAccess('inv-retur-riwayat') && (
                  <button
                    onClick={() => handleSelectTab('inv-retur-riwayat')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'inv-retur-riwayat'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <RotateCcw className="w-4 h-4 text-rose-400" />
                    <span>Retur Pembelian</span>
                  </button>
                )}

                {canAccess('inv-defecta') && (
                  <button
                    onClick={() => handleSelectTab('inv-defecta')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'inv-defecta'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                    <span>Defecta & Re-Order Otomatis</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* MODUL 5: KEUANGAN & AKUNTANSI */}
          {hasFinance && (
            <div>
              <p className="px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                5. Keuangan & Akuntansi
              </p>
              <div className="space-y-0.5">
                {canAccess('keuangan-labarugi') && (
                  <button
                    onClick={() => handleSelectTab('keuangan-labarugi')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'keuangan-labarugi'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>Laba Rugi & Valuasi Aset</span>
                  </button>
                )}

                {canAccess('keuangan-hutang-piutang') && (
                  <button
                    onClick={() => handleSelectTab('keuangan-hutang-piutang')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'keuangan-hutang-piutang'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-amber-400" />
                    <span>Hutang & Piutang</span>
                  </button>
                )}

                {canAccess('keuangan-setting') && (
                  <button
                    onClick={() => handleSelectTab('keuangan-setting')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'keuangan-setting'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span>Gaji, Jasa, Fee & Lembur</span>
                  </button>
                )}

                {canAccess('keuangan-pph') && (
                  <button
                    onClick={() => handleSelectTab('keuangan-pph')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'keuangan-pph'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Calculator className="w-4 h-4 text-sky-400" />
                    <span>Estimasi PPh (WP OP)</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* MODUL 6: SISTEM & MULTI-CABANG */}
          {hasSystem && (
            <div>
              <p className="px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                6. Sistem & Multi-Cabang
              </p>
              <div className="space-y-0.5">
                {canAccess('sys-cabang') && (
                  <button
                    onClick={() => handleSelectTab('sys-cabang')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'sys-cabang'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <GitBranch className="w-4 h-4 text-sky-400" />
                    <span>Sinkronisasi Multi-Cabang</span>
                  </button>
                )}

                {canAccess('sys-satusehat') && (
                  <button
                    onClick={() => handleSelectTab('sys-satusehat')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'sys-satusehat'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Integrasi SATUSEHAT</span>
                  </button>
                )}

                {canAccess('sys-audit') && (
                  <button
                    onClick={() => handleSelectTab('sys-audit')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'sys-audit'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4 text-purple-400" />
                    <span>Audit Trail & Riwayat Log</span>
                  </button>
                )}

                {canAccess('sys-marketing') && (
                  <button
                    onClick={() => handleSelectTab('sys-marketing')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'sys-marketing'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Megaphone className="w-4 h-4 text-emerald-400" />
                    <span>Strategi Marketing</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* MODUL 7: SETUP */}
          {hasSetup && (
            <div>
              <p className="px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                7. Setup
              </p>
              <div className="space-y-0.5">
                {canAccess('setup-mitra') && (
                  <button
                    onClick={() => handleSelectTab('setup-mitra')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'setup-mitra'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Handshake className="w-4 h-4 text-emerald-400" />
                    <span>Mitra (Fasilitas Kesehatan)</span>
                  </button>
                )}

                {canAccess('setup-supplier') && (
                  <button
                    onClick={() => handleSelectTab('setup-supplier')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'setup-supplier'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-sky-400" />
                    <span>Supplier (Distributor & PBF)</span>
                  </button>
                )}

                {canAccess('setup-diskon-promo') && (
                  <button
                    onClick={() => handleSelectTab('setup-diskon-promo')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'setup-diskon-promo'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <BadgePercent className="w-4 h-4 text-rose-400" />
                    <span>Manajemen Diskon & Promo</span>
                  </button>
                )}

                {canAccess('setup-database') && (
                  <button
                    onClick={() => handleSelectTab('setup-database')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'setup-database'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Database className="w-4 h-4 text-amber-400" />
                    <span>Export & Import Database</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* Footer Info with Active Role & Hak Akses Badge */}
      <div className="p-3 border-t border-slate-800 bg-slate-950 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1 text-slate-400 font-bold truncate">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">{activeRole}</span>
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-400 font-mono font-bold text-[9px] shrink-0">
            {allowedPermissions ? `${allowedPermissions.length} Hak Akses` : 'Penuh'}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 flex items-center justify-between">
          <span className="font-semibold">Latisha Farma V8.0</span>
          <span className="text-emerald-400 font-bold">Online</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop collapsible sidebar (lg+) */}
      <div
        aria-hidden={isDesktopCollapsed}
        className={`hidden lg:flex h-full shrink-0 transition-all duration-200 ease-in-out overflow-hidden ${
          isDesktopCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-64 opacity-100'
        }`}
      >
        {sidebarBody}
      </div>

      {/* Mobile & Tablet slide-over drawer (<lg) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={onCloseMobileDrawer}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full shadow-2xl">
            {sidebarBody}
          </div>
        </div>
      )}
    </>
  );
});
Sidebar.displayName = 'Sidebar';
