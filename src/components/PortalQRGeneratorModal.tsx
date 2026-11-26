import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  X,
  Copy,
  Check,
  Download,
  Printer,
  Smartphone,
  ExternalLink,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { getSavedPharmacyProfile } from '../utils/facilityProfileHelper';
import { isDemoMode } from '../utils/demoSandbox';
import { getAppBaseUrlWithoutTrailingSlash } from '../utils/portalUrlHelper';

export type QRPortalTargetType = 'unified' | 'reguler' | 'mitra' | 'pasien';

interface PortalQRGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTarget?: QRPortalTargetType;
  onOpenPortalPreview?: (target: QRPortalTargetType) => void;
}

const TARGET_META: Record<
  QRPortalTargetType,
  {
    label: string;
    shortTitle: string;
    subtitle: string;
    query: string;
    badge: string;
  }
> = {
  unified: {
    label: 'Aplikasi Pelanggan & Pasien Terpadu (Direkomendasikan)',
    shortTitle: 'SCAN UNTUK ORDER OBAT & DAFTAR PASIEN',
    subtitle: 'Order Obat Reguler/Mitra, Daftar Poli Mandiri & Cek Status Layanan dalam 1 Aplikasi',
    query: '?view=portal-pelanggan',
    badge: 'SEMUA LAYANAN · PWA ANDROID & iOS',
  },
  reguler: {
    label: 'Langsung Ruang Order Reguler / Umum',
    shortTitle: 'SCAN UNTUK ORDER OBAT REGULER',
    subtitle: 'Belanja obat bebas & resep dokter secara mandiri tanpa antre di kasir',
    query: '?view=portal-pelanggan&tab=order&room=reguler',
    badge: 'RUANG ORDER REGULER / UMUM',
  },
  mitra: {
    label: 'Langsung Ruang Order Mitra (B2B / Faskes)',
    shortTitle: 'SCAN UNTUK ORDER GROSIR MITRA',
    subtitle: 'Akses khusus mitra klinik/apotek terregistrasi dengan login Nama + ID Mitra',
    query: '?view=portal-pelanggan&tab=order&room=mitra',
    badge: 'RUANG ORDER MITRA TERVERIFIKASI',
  },
  pasien: {
    label: 'Langsung Portal Pendaftaran Mandiri Pasien',
    shortTitle: 'SCAN UNTUK DAFTAR PASIEN ONLINE',
    subtitle: 'Booking kunjungan dokter, cek nomor antrean & chat petugas klinik langsung dari HP',
    query: '?view=portal-pelanggan&tab=pasien',
    badge: 'PORTAL MANDIRI PASIEN',
  },
};

export const PortalQRGeneratorModal: React.FC<PortalQRGeneratorModalProps> = ({
  isOpen,
  onClose,
  defaultTarget = 'unified',
  onOpenPortalPreview,
}) => {
  const [targetType, setTargetType] = useState<QRPortalTargetType>(defaultTarget);
  const [baseOrigin, setBaseOrigin] = useState<string>(() =>
    typeof window !== 'undefined' ? getAppBaseUrlWithoutTrailingSlash() : ''
  );
  const [includeDemoParam, setIncludeDemoParam] = useState<boolean>(() => isDemoMode());
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [posterNote, setPosterNote] = useState<string>(
    'Buka Kamera HP / Google Lens -> Scan QR -> Ketuk "Pasang di Layar Utama" agar tersimpan seperti aplikasi di HP Anda.'
  );

  const pharmacy = useMemo(() => {
    try {
      return getSavedPharmacyProfile();
    } catch {
      return {
        name: 'APOTEK LATISHA FARMA',
        address: '',
        phone: '0895326272957',
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTargetType(defaultTarget);
      if (typeof window !== 'undefined' && !baseOrigin) {
        setBaseOrigin(getAppBaseUrlWithoutTrailingSlash());
      }
    }
  }, [isOpen, defaultTarget, baseOrigin]);

  const finalPortalUrl = useMemo(() => {
    const cleanBase = (baseOrigin || (typeof window !== 'undefined' ? getAppBaseUrlWithoutTrailingSlash() : ''))
      .trim()
      .replace(/\/+$/, '');
    const meta = TARGET_META[targetType];
    const demoSuffix = includeDemoParam ? '&mode=demo' : '';
    return cleanBase ? `${cleanBase}/${meta.query}${demoSuffix}` : `./${meta.query}${demoSuffix}`;
  }, [baseOrigin, targetType, includeDemoParam]);

  useEffect(() => {
    if (!isOpen || !finalPortalUrl) return;
    let cancelled = false;
    setQrError('');
    QRCode.toDataURL(finalPortalUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 560,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => {
        if (!cancelled) {
          setQrError(err?.message || 'Gagal membuat QR Code');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, finalPortalUrl]);

  if (!isOpen) return null;

  const meta = TARGET_META[targetType];
  const isLocalOrigin =
    baseOrigin.includes('localhost') || baseOrigin.includes('127.0.0.1');

  const handleCopyUrl = () => {
    navigator.clipboard?.writeText(finalPortalUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    });
  };

  const handleDownloadPosterPng = async () => {
    try {
      const highResQr = await QRCode.toDataURL(finalPortalUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 720,
        color: { dark: '#0f172a', light: '#ffffff' },
      });

      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 1320;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // White card background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Emerald header band
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      grad.addColorStop(0, '#059669');
      grad.addColorStop(1, '#0284c7');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, 230);

      // Header text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText((pharmacy?.name || 'APOTEK LATISHA FARMA').toUpperCase(), 500, 95);

      ctx.font = '600 22px sans-serif';
      ctx.fillStyle = '#e0f2fe';
      ctx.fillText(meta.badge, 500, 145);

      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(meta.shortTitle, 500, 198);

      // QR frame
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 4;
      ctx.strokeRect(140, 275, 720, 720);

      const loadImageSafe = (src: string) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const im = new window.Image();
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = src;
        });

      const [qrImg, logoImg] = await Promise.all([
        loadImageSafe(highResQr),
        loadImageSafe(`${import.meta.env.BASE_URL}assets/aistudio/logo_resmi_apotek_673c56f0.png`),
      ]);

      if (logoImg) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(54, 48, 128, 128, 22);
        ctx.fill();
        ctx.drawImage(logoImg, 66, 60, 104, 104);
      }

      if (qrImg) {
        ctx.drawImage(qrImg, 160, 295, 680, 680);
      }

      // Footer instructions
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('1. Scan QR  •  2. Order / Daftar  •  3. Tambah ke Layar Utama', 500, 1065);

      ctx.fillStyle = '#475569';
      ctx.font = '500 20px sans-serif';
      ctx.fillText(meta.subtitle.slice(0, 78), 500, 1115);

      ctx.fillStyle = '#0369a1';
      ctx.font = 'bold 19px monospace';
      const urlLabel = finalPortalUrl.length > 70 ? `${finalPortalUrl.slice(0, 67)}...` : finalPortalUrl;
      ctx.fillText(urlLabel, 500, 1175);

      if (pharmacy?.phone || pharmacy?.address) {
        ctx.fillStyle = '#64748b';
        ctx.font = '500 18px sans-serif';
        const contactLine = [pharmacy.address, pharmacy.phone ? `WA/Telp: ${pharmacy.phone}` : '']
          .filter(Boolean)
          .join(' · ')
          .slice(0, 90);
        ctx.fillText(contactLine, 500, 1245);
      }

      const link = document.createElement('a');
      link.download = `QR-Portal-${targetType}-Latisha-Farma.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err: any) {
      setQrError(err?.message || 'Gagal mengunduh gambar poster QR.');
    }
  };

  const handlePrintPoster = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #latisha-qr-print-sheet,
          #latisha-qr-print-sheet * {
            visibility: visible !important;
          }
          #latisha-qr-print-sheet {
            position: fixed !important;
            inset: 0 !important;
            margin: 0 auto !important;
            padding: 24px !important;
            background: #ffffff !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 99999 !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
          {/* Modal Header */}
          <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
                  Generator QR Code &amp; Poster Portal Pelanggan (PWA)
                </h3>
                <p className="text-[11px] text-slate-300">
                  Cetak kartu meja kasir atau unduh QR untuk ditempel di area tunggu apotek/klinik
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4 sm:p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
            {/* Left Controls */}
            <div className="lg:col-span-6 space-y-4">
              <div>
                <label className="block font-extrabold text-slate-800 mb-1.5">
                  1. Pilih Tujuan QR Code
                </label>
                <div className="space-y-1.5">
                  {(Object.keys(TARGET_META) as QRPortalTargetType[]).map((key) => {
                    const item = TARGET_META[key];
                    const selected = targetType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTargetType(key)}
                        className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                          selected
                            ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-extrabold text-slate-900 text-xs">{item.label}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{item.subtitle}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="font-extrabold text-slate-800">
                    2. Alamat Domain / Base URL Aplikasi
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      typeof window !== 'undefined' && setBaseOrigin(getAppBaseUrlWithoutTrailingSlash())
                    }
                    className="text-[11px] font-bold text-sky-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Gunakan URL Aktif
                  </button>
                </div>
                <input
                  type="url"
                  value={baseOrigin}
                  onChange={(e) => setBaseOrigin(e.target.value)}
                  placeholder="https://latishafarma.github.io/latishaenterprise"
                  className="w-full min-h-[40px] px-3 border border-slate-300 rounded-xl font-mono text-xs font-bold bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {isLocalOrigin && (
                  <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Origin saat ini memakai alamat lokal (localhost). Sebelum mencetak poster untuk HP pelanggan, pastikan mengisi alamat HTTPS publik/shared URL apotek.
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="font-bold text-slate-800">Sertakan Mode Demo Sandbox</div>
                  <div className="text-[10px] text-slate-500">
                    Aktifkan hanya bila QR ini untuk keperluan demo/uji coba klien
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeDemoParam}
                  onChange={(e) => setIncludeDemoParam(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-extrabold text-slate-800 mb-1">
                  3. Catatan Panduan Singkat pada Poster
                </label>
                <textarea
                  rows={2}
                  value={posterNote}
                  onChange={(e) => setPosterNote(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="min-h-[42px] px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedUrl ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span>{copiedUrl ? 'Link Tersalin!' : 'Salin Link Portal'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPosterPng}
                  disabled={!qrDataUrl}
                  className="min-h-[42px] px-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Poster QR (PNG)</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintPoster}
                  disabled={!qrDataUrl}
                  className="min-h-[42px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer sm:col-span-2 shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Poster QR Siap Pajang (A4 / Stand Meja Kasir)</span>
                </button>

                {onOpenPortalPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPortalPreview(targetType);
                    }}
                    className="min-h-[38px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer sm:col-span-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka Pratinjau Aplikasi Pelanggan Sekarang</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right Live Print-Ready Poster Card */}
            <div className="lg:col-span-6 flex flex-col">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                Pratinjau Kartu / Poster Cetak Apotek
              </div>
              <div
                id="latisha-qr-print-sheet"
                className="flex-1 bg-white rounded-3xl border-2 border-slate-200 overflow-hidden shadow-md flex flex-col items-center text-center"
              >
                <div className="w-full bg-gradient-to-r from-emerald-600 to-sky-600 text-white px-5 py-4 flex flex-col items-center">
                  <div className="flex items-center justify-center gap-3 mb-1.5">
                    <div className="w-11 h-11 rounded-xl bg-white p-1 shadow-xs flex items-center justify-center shrink-0">
                      <img
                        src={`${import.meta.env.BASE_URL}assets/aistudio/logo_resmi_apotek_673c56f0.png`}
                        alt="Logo Apotek Latisha Farma"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] font-black tracking-widest uppercase bg-white/20 inline-block px-2.5 py-0.5 rounded-full mb-1">
                        {meta.badge}
                      </div>
                      <h4 className="text-base sm:text-lg font-black uppercase tracking-tight leading-tight">
                        {pharmacy?.name || 'APOTEK LATISHA FARMA'}
                      </h4>
                    </div>
                  </div>
                  <p className="text-xs font-extrabold text-emerald-50 mt-0.5">
                    {meta.shortTitle}
                  </p>
                </div>

                <div className="p-5 flex flex-col items-center space-y-3 w-full">
                  {qrError ? (
                    <div className="p-6 text-rose-600 text-xs font-bold">{qrError}</div>
                  ) : qrDataUrl ? (
                    <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-xs">
                      <img
                        src={qrDataUrl}
                        alt="QR Code Portal Pelanggan & Pasien Latisha Farma"
                        className="w-52 h-52 sm:w-60 sm:h-60 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-56 h-56 rounded-2xl bg-slate-100 animate-pulse flex items-center justify-center text-slate-400">
                      Membuat QR...
                    </div>
                  )}

                  <div className="w-full max-w-sm space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-extrabold text-[11px]">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>1. Scan QR · 2. Order / Daftar · 3. Pasang App</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{posterNote}</p>
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[10px] font-bold text-sky-800 break-all">
                      {finalPortalUrl}
                    </div>
                    {(pharmacy?.address || pharmacy?.phone) && (
                      <p className="text-[10px] text-slate-500 pt-1">
                        {[pharmacy.address, pharmacy.phone ? `Telp/WA: ${pharmacy.phone}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
