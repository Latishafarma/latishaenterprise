import { EPrescription } from '../types';

/**
 * Menentukan apakah sebuah E-Resep sedang berada di dalam Antrian E-Resep POS Kasir
 * (sudah lolos skrining / siap diproses kasir, dan belum diselesaikan / ditolak).
 */
export const isPrescriptionInPosQueue = (rx: EPrescription | null | undefined): boolean => {
  if (!rx || !rx.id) return false;
  const rawStatus = String(rx.status || '').trim();
  const lower = rawStatus.toLowerCase();

  if (!rawStatus || lower === 'pending skrining') return false;
  if (lower.includes('selesai')) return false;
  if (lower.includes('tolak')) return false;
  if (lower.includes('ganti')) return false;
  if (rx.screeningChecks?.posQueueMeta?.processedPosTrxId) return false;

  return (
    rawStatus === 'Antrian POS' ||
    rawStatus === 'Lolos Skrining' ||
    rawStatus === 'Disiapkan' ||
    rawStatus === 'Diterima (Tidak Ada DRPs)' ||
    Boolean(rx.screeningChecks?.posQueueMeta?.sentToPos)
  );
};
