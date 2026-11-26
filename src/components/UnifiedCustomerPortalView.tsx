import React, { useState, useEffect, Suspense, lazy } from 'react';
import {
  Store,
  Stethoscope,
  Users,
  Download,
  FlaskConical,
  RotateCcw,
  ArrowLeft,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import {
  DutySchedule,
  Medicine,
  Mitra,
  MitraOrder,
  OnlineRegistration,
  Patient,
  PortalOrderRoom,
  PromoAd,
  SalesDiscount,
} from '../types';
import { OfflineIndicator, PWAInstallButton, PWAInstallGuideModal } from './PWAInstallBanner';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { isDemoMode } from '../utils/demoSandbox';
import { getSavedPharmacyProfile } from '../utils/facilityProfileHelper';
import { recordPortalActivity } from '../utils/portalActivityLogger';

const PublicMitraPortalView = lazy(() =>
  import('./PublicMitraPortalView').then((m) => ({ default: m.PublicMitraPortalView }))
);
const PublicPatientRegistration = lazy(() =>
  import('./PublicPatientRegistration').then((m) => ({ default: m.PublicPatientRegistration }))
);
const PortalPatientLiveChat = lazy(() =>
  import('./PortalPatientLiveChat').then((m) => ({ default: m.PortalPatientLiveChat }))
);

export type UnifiedPortalSection = 'order' | 'pasien';

interface UnifiedCustomerPortalViewProps {
  initialSection?: UnifiedPortalSection;
  initialOrderRoom?: PortalOrderRoom;
  isDemoSandbox?: boolean;
  onResetDemo?: () => void;
  onExitDemo?: () => void;
  allowReturnToStaffPreview?: boolean;
  onBackToStaffPreview?: () => void;
  // Portal Order props
  mitraList?: Mitra[];
  initialMedicines?: Medicine[];
  initialPromos?: PromoAd[];
  initialDiscounts?: SalesDiscount[];
  onRegisterMitra?: (mitra: Mitra) => void;
  onOrderSubmitted?: (order: MitraOrder) => void;
  // Portal Pasien props
  schedules?: DutySchedule[];
  initialPatients?: Patient[];
  onNewRegistrationSuccess?: (reg: OnlineRegistration) => void;
}

const SectionLoadingFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center p-10 text-xs font-bold text-slate-500">
    Memuat layanan pelanggan...
  </div>
);

export const UnifiedCustomerPortalView: React.FC<UnifiedCustomerPortalViewProps> = ({
  initialSection = 'order',
  initialOrderRoom = 'REGULER',
  isDemoSandbox,
  onResetDemo,
  onExitDemo,
  allowReturnToStaffPreview = false,
  onBackToStaffPreview,
  mitraList,
  initialMedicines,
  initialPromos,
  initialDiscounts,
  onRegisterMitra,
  onOrderSubmitted,
  schedules,
  initialPatients,
  onNewRegistrationSuccess,
}) => {
  const demoActive = isDemoSandbox ?? isDemoMode();
  const [activeSection, setActiveSection] = useState<UnifiedPortalSection>(initialSection);
  const [orderRoom, setOrderRoom] = useState<PortalOrderRoom>(initialOrderRoom);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const { isInstalled, canPromptNatively, isIos, promptInstall } = usePWAInstall();

  const pharmacyProfile = React.useMemo(() => {
    try {
      return getSavedPharmacyProfile();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setOrderRoom(initialOrderRoom);
  }, [initialOrderRoom]);

  const handleSelectSection = (section: UnifiedPortalSection, room?: PortalOrderRoom) => {
    setActiveSection(section);
    if (room) {
      setOrderRoom(room);
    }
    if (section === 'order' && room) {
      recordPortalActivity({
        room,
        eventType: 'ROOM_SWITCH',
      });
    }
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (!url.searchParams.get('view')) {
          url.searchParams.set('view', 'portal-pelanggan');
        }
        url.searchParams.set('tab', section === 'pasien' ? 'pasien' : 'order');
        if (section === 'order' && room) {
          url.searchParams.set('room', room.toLowerCase());
        } else if (section === 'pasien') {
          url.searchParams.delete('room');
        }
        window.history.replaceState({}, '', `${url.pathname}${url.search}`);
      } catch {}
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Offline banner */}
      <OfflineIndicator />

      {/* Unified Demo Sandbox Banner */}
      {demoActive && (
        <div className="bg-amber-400 text-slate-950 border-b border-amber-500 px-3 sm:px-4 py-2 text-xs font-bold">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 bg-slate-950 text-amber-300 px-2 py-0.5 rounded-md font-black text-[10px] uppercase tracking-wider">
                <FlaskConical className="w-3 h-3" /> MODE DEMO / SANDBOX
              </span>
              <span className="text-[11px] sm:text-xs font-bold">
                Simulasi Aplikasi Pelanggan &amp; Pasien terisolasi dari database produksi.
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {onResetDemo && (
                <button
                  type="button"
                  onClick={onResetDemo}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-50 text-slate-950 border border-amber-700/30 rounded-lg font-extrabold text-[11px] cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Demo
                </button>
              )}
              {onExitDemo && (
                <button
                  type="button"
                  onClick={onExitDemo}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-extrabold text-[11px] cursor-pointer"
                >
                  Keluar Demo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unified Customer/Patient App Top Bar — Strictly Isolated from Internal Pharmacy Menus */}
      <nav
        aria-label="Navigasi Aplikasi Pelanggan & Pasien"
        className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-sm"
      >
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow-xs border border-white/20 overflow-hidden">
              <img
                src={`${import.meta.env.BASE_URL}assets/aistudio/logo_resmi_apotek_673c56f0.png`}
                alt="Logo Aplikasi Latisha Farma"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xs sm:text-sm tracking-tight truncate">
                  {pharmacyProfile?.name || 'Apotek Latisha Farma'}
                </span>
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                  <ShieldCheck className="w-3 h-3" /> Aplikasi Pelanggan &amp; Pasien
                </span>
              </div>
              <p className="text-[10px] text-slate-300 truncate">
                Order Obat Reguler &amp; Mitra · Pendaftaran Mandiri Pasien
              </p>
            </div>
          </div>

          {/* Desktop / Tablet Segmented Switcher */}
          <div className="hidden sm:flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 gap-1">
            <button
              type="button"
              onClick={() => handleSelectSection('order', 'REGULER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeSection === 'order' && orderRoom === 'REGULER'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Order Reguler</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectSection('order', 'MITRA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeSection === 'order' && orderRoom === 'MITRA'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Order Mitra</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectSection('pasien')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeSection === 'pasien'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span>Portal Pasien</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton compact onOpenInstallGuide={() => setShowInstallGuide(true)} />
            {allowReturnToStaffPreview && onBackToStaffPreview && (
              <button
                type="button"
                onClick={onBackToStaffPreview}
                className="min-h-[38px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                title="Tutup pratinjau aplikasi pelanggan"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Tutup Pratinjau</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeSection === 'order' ? (
          <Suspense fallback={<SectionLoadingFallback />}>
            <PublicMitraPortalView
              embeddedInUnifiedApp={true}
              initialRoomOverride={orderRoom}
              isDemoSandbox={demoActive}
              onResetDemo={onResetDemo}
              onExitDemo={onExitDemo}
              mitraList={mitraList}
              initialMedicines={initialMedicines}
              initialPromos={initialPromos}
              initialDiscounts={initialDiscounts}
              onRegisterMitra={onRegisterMitra}
              onOrderSubmitted={onOrderSubmitted}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<SectionLoadingFallback />}>
            <PublicPatientRegistration
              unifiedMode={true}
              hideFloatingChat={true}
              schedules={schedules}
              patients={initialPatients}
              onNewRegistrationSuccess={onNewRegistrationSuccess}
            />
          </Suspense>
        )}
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] pb-[env(safe-area-inset-bottom)]">
        <div className={`grid ${isInstalled ? 'grid-cols-3' : 'grid-cols-4'} gap-1 px-2 py-1.5`}>
          <button
            type="button"
            onClick={() => handleSelectSection('order', 'REGULER')}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-extrabold transition cursor-pointer ${
              activeSection === 'order' && orderRoom === 'REGULER'
                ? 'bg-emerald-50 text-emerald-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4 mb-0.5" />
            <span>Order Umum</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSection('order', 'MITRA')}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-extrabold transition cursor-pointer ${
              activeSection === 'order' && orderRoom === 'MITRA'
                ? 'bg-sky-50 text-sky-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Store className="w-4 h-4 mb-0.5" />
            <span>Order Mitra</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSection('pasien')}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-extrabold transition cursor-pointer ${
              activeSection === 'pasien'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Stethoscope className="w-4 h-4 mb-0.5" />
            <span>Pasien</span>
          </button>

          {!isInstalled && (
            <button
              type="button"
              onClick={async () => {
                if (canPromptNatively) {
                  const outcome = await promptInstall();
                  if (outcome === 'accepted') return;
                }
                setShowInstallGuide(true);
              }}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-extrabold text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100 transition cursor-pointer"
            >
              {canPromptNatively ? (
                <Download className="w-4 h-4 mb-0.5" />
              ) : (
                <Smartphone className="w-4 h-4 mb-0.5" />
              )}
              <span>Pasang App</span>
            </button>
          )}
        </div>
      </div>

      {/* PWA Install Guide Modal for iOS Safari / Android Chrome */}
      {showInstallGuide && (
        <PWAInstallGuideModal
          isIos={isIos}
          canPromptNatively={canPromptNatively}
          onTriggerNative={async () => {
            const outcome = await promptInstall();
            if (outcome === 'accepted') setShowInstallGuide(false);
          }}
          onClose={() => setShowInstallGuide(false)}
        />
      )}
      {/* Persistent Floating Icon-Only Chat Trigger (Visible across Order Web, Patient Portal & Mobile PWA App) */}
      <Suspense fallback={null}>
        <PortalPatientLiveChat
          mode="floating"
          schedules={schedules}
          medicines={initialMedicines}
          floatingPositionClass={
            activeSection === 'order'
              ? 'bottom-[5.25rem] right-4 sm:bottom-24 sm:right-5'
              : 'bottom-[4.85rem] right-4 sm:bottom-5 sm:right-5'
          }
        />
      </Suspense>
    </div>
  );
};
