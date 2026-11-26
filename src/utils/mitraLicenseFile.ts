export interface ProcessedMitraLicenseFile {
  dataUrl: string;
  fileName: string;
  fileType: 'application/pdf' | 'image/jpeg';
  uploadedAt: string;
}

const MAX_PDF_BYTES = 2.5 * 1024 * 1024; // 2.5 MB
const MAX_JPG_RAW_BYTES = 10 * 1024 * 1024; // 10 MB before canvas compression

export const isPdfLicenseFile = (
  dataUrl?: string,
  fileType?: string,
  fileName?: string
): boolean => {
  if (fileType && fileType.toLowerCase() === 'application/pdf') return true;
  if (dataUrl && dataUrl.startsWith('data:application/pdf')) return true;
  if (fileName && fileName.toLowerCase().endsWith('.pdf')) return true;
  return false;
};

/**
 * Validasi dan proses file izin fasilitas mitra (wajib format PDF atau JPG/JPEG).
 * File JPG dikompresi secara otomatis agar ringan untuk localStorage & Supabase.
 */
export const processMitraLicenseFile = (file: File): Promise<ProcessedMitraLicenseFile> => {
  return new Promise((resolve, reject) => {
    const lowerName = (file.name || '').toLowerCase();
    const mime = (file.type || '').toLowerCase();

    const isPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf');
    const isJpg =
      mime === 'image/jpeg' ||
      mime === 'image/jpg' ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg');

    if (!isPdf && !isJpg) {
      reject(new Error('Format file izin fasilitas tidak valid. Harap unggah file berformat PDF atau JPG/JPEG.'));
      return;
    }

    if (isPdf && file.size > MAX_PDF_BYTES) {
      reject(new Error('Ukuran file PDF izin fasilitas maksimal 2,5 MB.'));
      return;
    }

    if (isJpg && file.size > MAX_JPG_RAW_BYTES) {
      reject(new Error('Ukuran file JPG izin fasilitas maksimal 10 MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file izin fasilitas. Silakan coba lagi.'));
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const uploadedAt = new Date().toISOString();

      if (isPdf) {
        resolve({
          dataUrl: rawDataUrl,
          fileName: file.name,
          fileType: 'application/pdf',
          uploadedAt
        });
        return;
      }

      // Compress JPG nicely so document text stays sharp while payload remains compact
      const img = new window.Image();
      img.onerror = () => {
        resolve({
          dataUrl: rawDataUrl,
          fileName: file.name,
          fileType: 'image/jpeg',
          uploadedAt
        });
      };
      img.onload = () => {
        const maxDim = 1400;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            dataUrl: rawDataUrl,
            fileName: file.name,
            fileType: 'image/jpeg',
            uploadedAt
          });
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        resolve({
          dataUrl: compressed,
          fileName: file.name,
          fileType: 'image/jpeg',
          uploadedAt
        });
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
};
