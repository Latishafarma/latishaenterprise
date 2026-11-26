import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, WifiOff, X, CheckCircle2, MoreVertical } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="bg-amber-50 border-b border-amber-300 text-amber-950 px-4 py-2 text-xs font-bold flex items-center justify-center gap-2"
    >
      <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
      <span>
        Koneksi internet terputus. Katalog yang tersimpan masih dapat dilihat, namun pengiriman pesanan &amp; pendaftaran membutuhkan koneksi aktif.
      </span>
    </div>
  );
};

interface PWAInstallButtonProps {
  compact?: boolean;
  onOpenInstallGuide?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  onOpenInstallGuide,
}) => {
  const { isInstalled, canPromptNatively, isIos, promptInstall } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [justInstalledToast, setJustInstalledToast] = useState(false);

  if (isInstalled && !justInstalledToast) return null;

  const handleClick = async () => {
    if (canPromptNatively) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        setJustInstalledToast(true);
        setTimeout(() => setJustInstalledToast(false), 4000);
        return;
      }
    }
    if (onOpenInstallGuide) {
      onOpenInstallGuide();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {justInstalledToast ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Aplikasi Terpasang!</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className={
            compact
              ? 'min-h-[38px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-xs active:scale-95'
              : 'min-h-[40px] px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-700 hover:to-sky-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer transition shadow-sm active:scale-95'
          }
          title="Pasang aplikasi Latisha Farma ke layar utama HP Android & iOS"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{compact ? 'Pasang App' : 'Pasang di Layar Utama'}</span>
        </button>
      )}

      {showGuideModal && (
        <PWAInstallGuideModal
          isIos={isIos}
          canPromptNatively={canPromptNatively}
          onTriggerNative={async () => {
            const outcome = await promptInstall();
            if (outcome === 'accepted') setShowGuideModal(false);
          }}
          onClose={() => setShowGuideModal(false)}
        />
      )}
    </>
  );
};

interface PWAInstallGuideModalProps {
  isIos: boolean;
  canPromptNatively: boolean;
  onTriggerNative: () => void;
  onClose: () => void;
}

export const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({
  isIos,
  canPromptNatively,
  onTriggerNative,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in">
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
              <img
                src="/assets/aistudio/logo_resmi_apotek_673c56f0.png"
                alt="Ikon Aplikasi Latisha Farma"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">Pasang Aplikasi di Layar Utama HP</h3>
              <p className="text-[11px] text-slate-300">
                Akses cepat Order Obat &amp; Layanan Pasien seperti aplikasi native
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-slate-700 max-h-[75vh] overflow-y-auto">
          {canPromptNatively && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2.5">
              <p className="font-bold text-emerald-950">
                Perangkat Anda mendukung pemasangan instan satu ketuk:
              </p>
              <button
                type="button"
                onClick={onTriggerNative}
                className="w-full min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Instal Sekarang ke Layar Utama</span>
              </button>
            </div>
          )}

          {/* iPhone / iPad Instructions */}
          <div className={`p-3.5 rounded-2xl border space-y-2 ${isIos ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-slate-900">iPhone / iPad (Safari)</span>
              {isIos && (
                <span className="px-2 py-0.5 rounded bg-sky-600 text-white text-[10px] font-bold">
                  Perangkat Anda
                </span>
              )}
            </div>
            <ol className="space-y-2 text-[11px] text-slate-700">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Buka halaman ini di browser <strong>Safari</strong>, lalu ketuk ikon{' '}
                  <strong className="inline-flex items-center gap-0.5 text-sky-700">
                    <Share className="w-3.5 h-3.5" /> Bagikan (Share)
                  </strong>{' '}
                  di bilah bawah/atas layar.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Gulir ke bawah lalu pilih{' '}
                  <strong className="inline-flex items-center gap-0.5 text-slate-900">
                    <PlusSquare className="w-3.5 h-3.5" /> Tambah ke Layar Utama
                  </strong>{' '}
                  (<em>Add to Home Screen</em>).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Ketuk <strong>Tambah</strong>. Ikon <strong>LatishaFarma</strong> langsung muncul di Home Screen Anda.
                </span>
              </li>
            </ol>
          </div>

          {/* Android Instructions */}
          <div className={`p-3.5 rounded-2xl border space-y-2 ${!isIos ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-slate-900">Android (Chrome / Edge)</span>
              {!isIos && (
                <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                  Rekomendasi Chrome
                </span>
              )}
            </div>
            <ol className="space-y-2 text-[11px] text-slate-700">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Ketuk menu titik tiga{' '}
                  <strong className="inline-flex items-center text-slate-900">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </strong>{' '}
                  di pojok kanan atas browser Chrome.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Pilih <strong>Tambahkan ke layar utama</strong> atau <strong>Instal aplikasi</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Konfirmasi <strong>Instal</strong> dan buka langsung sebagai aplikasi mandiri penuh layar.
                </span>
              </li>
            </ol>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[40px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
          >
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );
};
