import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Flashlight,
  Keyboard,
  RefreshCw,
  ScanBarcode,
  SwitchCamera,
  X,
  AlertTriangle
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export function playBarcodeBeep(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1480, ctx.currentTime);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 220);
    }
  } catch {
    // Ignore audio context errors when blocked by browser autoplay policy
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(75);
    }
  } catch {
    // Ignore vibrate unsupported
  }
}

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
  title?: string;
  subtitle?: string;
  scanMode?: 'barcode' | 'qr' | 'both';
  allowContinuous?: boolean;
}

export const CameraBarcodeScannerModal: React.FC<CameraBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'Scan Barcode / QR Kamera',
  subtitle = 'Arahkan kamera ke barcode kemasan obat atau QR Code hingga terbaca otomatis.',
  scanMode = 'both',
  allowContinuous = false
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const lastDecodedRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });
  const isMountedRef = useRef<boolean>(true);
  const onScanSuccessRef = useRef(onScanSuccess);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('Menghubungkan kamera...');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const [lastScannedBanner, setLastScannedBanner] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string>('');

  const stopCameraStream = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {}
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const nextState = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet & { torch?: boolean }]
      });
      setTorchOn(nextState);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleDetectedCode = useCallback(
    (rawText: string) => {
      const cleaned = rawText.trim();
      if (!cleaned) return;
      const now = Date.now();
      if (
        lastDecodedRef.current.code === cleaned &&
        now - lastDecodedRef.current.ts < 1400
      ) {
        return;
      }
      lastDecodedRef.current = { code: cleaned, ts: now };
      playBarcodeBeep();
      setLastScannedBanner(cleaned);
      onScanSuccessRef.current(cleaned);
      if (!continuousMode) {
        stopCameraStream();
        onCloseRef.current();
      }
    },
    [continuousMode, stopCameraStream]
  );

  const continuousModeRef = useRef(continuousMode);
  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  const startScanner = useCallback(
    async (preferredDeviceId?: string) => {
      stopCameraStream();
      setCameraError(null);
      setIsInitializing(true);
      setStatusMessage('Mengaktifkan kamera...');

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setIsInitializing(false);
        setCameraError(
          'Browser atau perangkat ini tidak mendukung akses kamera langsung. Gunakan scanner barcode fisik atau input kode manual di bawah.'
        );
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: preferredDeviceId
            ? {
                deviceId: { exact: preferredDeviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isMountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.setAttribute('playsinline', 'true');
          await videoEl.play().catch(() => {});
        }

        // Check torch capability
        const activeTrack = stream.getVideoTracks()[0];
        if (activeTrack && typeof activeTrack.getCapabilities === 'function') {
          const caps = activeTrack.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(Boolean(caps?.torch));
        }

        // Enumerate cameras for switcher
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          if (isMountedRef.current) {
            setCameras(videoInputs);
            if (!preferredDeviceId && activeTrack) {
              const activeSettings = activeTrack.getSettings?.();
              if (activeSettings?.deviceId) {
                setSelectedDeviceId(activeSettings.deviceId);
              }
            }
          }
        } catch {
          // Ignore enumerate errors
        }

        // Prepare ZXing MultiFormatReader
        const hints = new Map<DecodeHintType, unknown>();
        const formats: BarcodeFormat[] =
          scanMode === 'qr'
            ? [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]
            : scanMode === 'barcode'
            ? [
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8,
                BarcodeFormat.CODE_128,
                BarcodeFormat.CODE_39,
                BarcodeFormat.UPC_A,
                BarcodeFormat.UPC_E,
                BarcodeFormat.ITF,
                BarcodeFormat.CODABAR
              ]
            : [
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8,
                BarcodeFormat.CODE_128,
                BarcodeFormat.CODE_39,
                BarcodeFormat.UPC_A,
                BarcodeFormat.UPC_E,
                BarcodeFormat.ITF,
                BarcodeFormat.CODABAR,
                BarcodeFormat.QR_CODE,
                BarcodeFormat.DATA_MATRIX
              ];
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const zxingReader = new BrowserMultiFormatReader(hints);

        // Optional native BarcodeDetector fast path
        type NativeDetectorCtor = new (opts?: { formats?: string[] }) => {
          detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
        };
        const NativeDetector = (
          window as unknown as { BarcodeDetector?: NativeDetectorCtor }
        ).BarcodeDetector;
        let nativeDetector: InstanceType<NativeDetectorCtor> | null = null;
        if (NativeDetector) {
          try {
            const nativeFormats =
              scanMode === 'qr'
                ? ['qr_code', 'data_matrix']
                : scanMode === 'barcode'
                ? ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'codabar']
                : [
                    'ean_13',
                    'ean_8',
                    'code_128',
                    'code_39',
                    'upc_a',
                    'upc_e',
                    'itf',
                    'codabar',
                    'qr_code',
                    'data_matrix'
                  ];
            nativeDetector = new NativeDetector({ formats: nativeFormats });
          } catch {
            nativeDetector = null;
          }
        }

        setIsInitializing(false);
        setStatusMessage('Kamera aktif — arahkan ke barcode / QR Code');

        let isDecodingFrame = false;
        scanTimerRef.current = window.setInterval(async () => {
          if (isDecodingFrame) return;
          const v = videoRef.current;
          if (!v || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) return;
          isDecodingFrame = true;

          try {
            // 1. Try hardware-accelerated native BarcodeDetector first when available
            if (nativeDetector) {
              try {
                const hits = await nativeDetector.detect(v);
                if (hits && hits.length > 0 && hits[0]?.rawValue) {
                  const code = String(hits[0].rawValue).trim();
                  if (code) {
                    const now = Date.now();
                    if (
                      !(
                        lastDecodedRef.current.code === code &&
                        now - lastDecodedRef.current.ts < 1400
                      )
                    ) {
                      lastDecodedRef.current = { code, ts: now };
                      playBarcodeBeep();
                      setLastScannedBanner(code);
                      onScanSuccessRef.current(code);
                      if (!continuousModeRef.current) {
                        stopCameraStream();
                        onCloseRef.current();
                        return;
                      }
                    }
                  }
                }
              } catch {
                // Fall back to ZXing frame decode below
              }
            }

            // 2. Fallback / universal ZXing canvas decode
            if (!canvasRef.current) {
              canvasRef.current = document.createElement('canvas');
            }
            const canvas = canvasRef.current;
            const maxW = 960;
            const scale = v.videoWidth > maxW ? maxW / v.videoWidth : 1;
            const targetW = Math.max(1, Math.round(v.videoWidth * scale));
            const targetH = Math.max(1, Math.round(v.videoHeight * scale));
            if (canvas.width !== targetW) canvas.width = targetW;
            if (canvas.height !== targetH) canvas.height = targetH;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, targetW, targetH);
              try {
                const result = zxingReader.decodeFromCanvas(canvas);
                const text = result?.getText?.()?.trim();
                if (text) {
                  const now = Date.now();
                  if (
                    !(
                      lastDecodedRef.current.code === text &&
                      now - lastDecodedRef.current.ts < 1400
                    )
                  ) {
                    lastDecodedRef.current = { code: text, ts: now };
                    playBarcodeBeep();
                    setLastScannedBanner(text);
                    onScanSuccessRef.current(text);
                    if (!continuousModeRef.current) {
                      stopCameraStream();
                      onCloseRef.current();
                      return;
                    }
                  }
                }
              } catch {
                // Expected NotFoundException when frame doesn't contain readable barcode
              }
            }
          } finally {
            isDecodingFrame = false;
          }
        }, 160);
      } catch (err: unknown) {
        setIsInitializing(false);
        const msg = err instanceof Error ? err.message : String(err);
        if (/Permission|NotAllowed/i.test(msg)) {
          setCameraError(
            'Izin kamera ditolak oleh browser. Izinkan akses kamera di pengaturan browser atau gunakan scanner USB / input manual di bawah.'
          );
        } else if (/NotFound|DevicesNotFound/i.test(msg)) {
          setCameraError(
            'Kamera tidak ditemukan pada perangkat ini. Anda tetap bisa scan memakai scanner barcode fisik atau ketik kode di bawah.'
          );
        } else {
          setCameraError(
            `Kamera tidak dapat dibuka (${msg || 'akses diblokir'}). Gunakan scanner fisik atau ketik kode di bawah.`
          );
        }
      }
    },
    [scanMode, stopCameraStream]
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      setManualCode('');
      setLastScannedBanner(null);
      lastDecodedRef.current = { code: '', ts: 0 };
      startScanner(selectedDeviceId || undefined);
    } else {
      stopCameraStream();
    }
    return () => {
      isMountedRef.current = false;
      stopCameraStream();
    };
  }, [isOpen, startScanner, stopCameraStream]);

  if (!isOpen) return null;

  const handleSwitchCamera = () => {
    if (cameras.length < 2) return;
    const currentIdx = cameras.findIndex((c) => c.deviceId === selectedDeviceId);
    const nextCam = cameras[(currentIdx + 1) % cameras.length];
    if (nextCam) {
      setSelectedDeviceId(nextCam.deviceId);
      startScanner(nextCam.deviceId);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.trim();
    if (!cleaned) return;
    handleDetectedCode(cleaned);
    setManualCode('');
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-[90] p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopCameraStream();
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 shrink-0">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-extrabold text-sm truncate">{title}</h4>
              <p className="text-[10px] text-slate-300 truncate">{statusMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            aria-label="Tutup kamera scanner"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-[11px] text-slate-600 leading-relaxed">{subtitle}</p>

          {/* Camera Viewport */}
          <div className="relative w-full aspect-[4/3] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className={`w-full h-full object-cover ${cameraError ? 'hidden' : 'block'}`}
            />

            {!cameraError && (
              <>
                {/* Scanning Aim Frame Overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="w-3/4 h-1/2 border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(2,6,23,0.38)] relative">
                    <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500/85 animate-pulse shadow-sm" />
                  </div>
                </div>

                {/* Camera Action Controls (Top Right inside viewport) */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                  {torchSupported && (
                    <button
                      type="button"
                      onClick={handleToggleTorch}
                      title={torchOn ? 'Matikan Lampu Flash' : 'Nyalakan Lampu Flash'}
                      className={`p-2 rounded-xl backdrop-blur-md text-xs font-bold transition cursor-pointer ${
                        torchOn
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-900/70 text-white hover:bg-slate-900'
                      }`}
                    >
                      <Flashlight className="w-4 h-4" />
                    </button>
                  )}
                  {cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={handleSwitchCamera}
                      title="Ganti Kamera (Depan / Belakang)"
                      className="p-2 rounded-xl bg-slate-900/70 hover:bg-slate-900 text-white backdrop-blur-md transition cursor-pointer"
                    >
                      <SwitchCamera className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isInitializing && (
                  <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center text-white gap-2">
                    <Camera className="w-7 h-7 text-emerald-400 animate-pulse" />
                    <span className="text-[11px] font-bold">Menyiapkan kamera...</span>
                  </div>
                )}
              </>
            )}

            {cameraError && (
              <div className="p-4 text-center space-y-2.5 max-w-xs">
                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-[11px] text-slate-200 leading-relaxed font-medium">
                  {cameraError}
                </p>
                <button
                  type="button"
                  onClick={() => startScanner(selectedDeviceId || undefined)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Coba Buka Kamera Lagi</span>
                </button>
              </div>
            )}
          </div>

          {lastScannedBanner && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-mono font-black text-xs truncate">
                  Terbaca: {lastScannedBanner}
                </span>
              </div>
            </div>
          )}

          {allowContinuous && (
            <label className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none">
              <div>
                <span className="font-bold text-slate-800 block text-[11px]">
                  Mode Scan Beruntun
                </span>
                <span className="text-[10px] text-slate-500">
                  Kamera tetap terbuka setelah scan agar bisa memindai beberapa barang berurutan.
                </span>
              </div>
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => setContinuousMode(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>
          )}

          {/* Fallback Hardware Scanner / Manual Code Input */}
          <form onSubmit={handleManualSubmit} className="pt-1 border-t border-slate-100 space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500">
              <Keyboard className="w-3.5 h-3.5" />
              <span>Scanner Fisik USB/Bluetooth atau Ketik Kode Manual</span>
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Scan dengan alat / ketik barcode lalu Enter..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-xs bg-slate-50 focus:bg-white focus:border-sky-500 outline-none"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition cursor-pointer shrink-0"
              >
                Gunakan
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
