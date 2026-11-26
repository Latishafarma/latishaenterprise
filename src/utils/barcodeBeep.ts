/**
 * Lightweight audio + haptic feedback helper for barcode scans.
 * Kept separate from CameraBarcodeScannerModal so views don't pull @zxing into their initial bundle.
 */
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
