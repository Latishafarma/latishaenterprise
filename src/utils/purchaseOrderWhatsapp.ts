import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PurchaseOrder, PurchaseOrderItem, SPGroupType, Supplier } from '../types';
import {
  formatPharmacyAddress,
  getSavedAPJProfile,
  getSavedPharmacyProfile
} from '../components/PharmacySettingsModal';

export interface GeneratedPOPdfResult {
  blob: Blob;
  file: File;
  fileName: string;
  availableSpGroups: SPGroupType[];
  selectedSpGroups: SPGroupType[];
  filteredItems: PurchaseOrderItem[];
  filteredTotalCost: number;
}

export interface SendPOWhatsappResult {
  mode: 'web-share' | 'wa-download' | 'cancelled';
  phone: string | null;
  displayPhone: string | null;
  fileName: string;
}

export interface GeneratePOPdfOptions {
  selectedSpGroups?: SPGroupType[];
}

const SP_GROUP_ORDER: SPGroupType[] = ['NAR', 'PSI', 'PRE', 'OOT', 'ALK', 'REG'];

const getSPGroupDocumentLabel = (spType: SPGroupType): string => {
  switch (spType) {
    case 'NAR':
      return 'NARKOTIKA';
    case 'PSI':
      return 'PSIKOTROPIKA';
    case 'PRE':
      return 'PREKURSOR FARMASI';
    case 'OOT':
      return 'OBAT-OBAT TERTENTU (OOT)';
    case 'ALK':
      return 'ALKES & BMHP';
    case 'REG':
    default:
      return 'OBAT JADI REGULER';
  }
};

export const getActiveSPGroupsForPO = (po: PurchaseOrder): SPGroupType[] => {
  const distinct = Array.from(new Set((po.items || []).map((it) => it.spType))) as SPGroupType[];
  return distinct.sort((a, b) => {
    const idxA = SP_GROUP_ORDER.indexOf(a);
    const idxB = SP_GROUP_ORDER.indexOf(b);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });
};

export const resolveSelectedSPGroupsForPO = (
  po: PurchaseOrder,
  selectedSpGroups?: SPGroupType[]
): {
  availableSpGroups: SPGroupType[];
  resolvedSpGroups: SPGroupType[];
  filteredItems: PurchaseOrderItem[];
  filteredTotalCost: number;
} => {
  const availableSpGroups = getActiveSPGroupsForPO(po);

  // Jika pemanggil tidak menentukan filter SP secara eksplisit,
  // pilih grup SP utama pertama secara default (tidak menampilkan semua SP sekaligus).
  const resolvedSpGroups: SPGroupType[] =
    selectedSpGroups !== undefined
      ? availableSpGroups.filter((g) => selectedSpGroups.includes(g))
      : availableSpGroups.length > 0
      ? [availableSpGroups[0]]
      : [];

  const selectedSet = new Set<SPGroupType>(resolvedSpGroups);
  const filteredItems = (po.items || []).filter((it) => selectedSet.has(it.spType));
  const filteredTotalCost = filteredItems.reduce(
    (sum, it) => sum + (Number(it.subtotal) || 0),
    0
  );

  return {
    availableSpGroups,
    resolvedSpGroups,
    filteredItems,
    filteredTotalCost
  };
};

export const normalizeWhatsappPhone = (rawPhone?: string | null): string | null => {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('62')) {
    return digits;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
};

const formatDateIndonesian = (dateStr?: string): string => {
  if (!dateStr) {
    return new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
};

const slugifySegment = (value: string, fallback: string): string => {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
};

export const resolveSupplierForPO = (
  po: PurchaseOrder,
  suppliers: Supplier[] = []
): Supplier | undefined => {
  if (!suppliers.length) return undefined;
  if (po.supplierId) {
    const byId = suppliers.find((s) => s.id === po.supplierId);
    if (byId) return byId;
  }
  const targetName = (po.supplierName || '').trim().toLowerCase();
  if (!targetName) return undefined;
  return suppliers.find((s) => s.name.trim().toLowerCase() === targetName);
};

export const generatePurchaseOrderPdfFile = (
  po: PurchaseOrder,
  matchedSupplier?: Supplier,
  options: GeneratePOPdfOptions = {}
): GeneratedPOPdfResult => {
  const pharmacy = getSavedPharmacyProfile();
  const apj = getSavedAPJProfile();

  const {
    availableSpGroups,
    resolvedSpGroups,
    filteredItems,
    filteredTotalCost
  } = resolveSelectedSPGroupsForPO(po, options.selectedSpGroups);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = 14;

  // Kop Surat Apotek
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text((pharmacy.name || 'APOTEK').toUpperCase(), marginX, cursorY);
  cursorY += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const fullAddress = formatPharmacyAddress(pharmacy);
  if (fullAddress) {
    const addrLines = doc.splitTextToSize(fullAddress, contentWidth);
    doc.text(addrLines, marginX, cursorY);
    cursorY += addrLines.length * 4;
  }

  const contactParts = [
    pharmacy.phone ? `Telp: ${pharmacy.phone}` : '',
    pharmacy.email ? `Email: ${pharmacy.email}` : ''
  ].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  |  '), marginX, cursorY);
    cursorY += 4;
  }

  const legalParts = [
    pharmacy.sia ? `SIA: ${pharmacy.sia}` : '',
    pharmacy.nib ? `NIB: ${pharmacy.nib}` : '',
    pharmacy.npwp ? `NPWP: ${pharmacy.npwp}` : ''
  ].filter(Boolean);
  if (legalParts.length > 0) {
    doc.text(legalParts.join('  |  '), marginX, cursorY);
    cursorY += 4;
  }

  cursorY += 1.5;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.7);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  doc.setLineWidth(0.2);
  doc.line(marginX, cursorY + 1, pageWidth - marginX, cursorY + 1);
  cursorY += 7;

  // Judul Dokumen sesuai kelompok SP yang dipilih
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  const docTitle =
    resolvedSpGroups.length === 1
      ? `SURAT PESANAN ${getSPGroupDocumentLabel(resolvedSpGroups[0])}`
      : 'SURAT PESANAN / PESANAN PEMBELIAN (PO)';
  doc.text(docTitle, pageWidth / 2, cursorY, { align: 'center' });
  cursorY += 6;

  // Blok Metadata PO & Tujuan PBF (hanya menampilkan SP yang dipilih)
  const spNumberSummary =
    resolvedSpGroups.length > 0
      ? resolvedSpGroups.map((group) => `${group}: ${po.spNumbers?.[group] || '-'}`).join('\n')
      : '-';

  const supplierPhone = po.supplierPhone || matchedSupplier?.phone || '-';
  const supplierAddress = po.supplierAddress || matchedSupplier?.address || '-';
  const supplierLicense = po.supplierLicenseNo || matchedSupplier?.licenseNo || '-';

  const leftBoxX = marginX;
  const rightBoxX = marginX + contentWidth * 0.52;
  const boxTopY = cursorY;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Detail Pesanan:', leftBoxX, boxTopY);
  doc.text('Kepada Yth. PBF / Distributor:', rightBoxX, boxTopY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);

  const leftInfoLines = [
    `No. PO      : ${po.poNumber}`,
    `Tanggal     : ${formatDateIndonesian(po.date)}`,
    `Status PO   : ${po.status}`,
    `Petugas     : ${po.petugas || 'Apoteker / Logistik'}`,
    `Nomor SP    :\n${spNumberSummary}`
  ];
  const leftText = doc.splitTextToSize(leftInfoLines.join('\n'), contentWidth * 0.48);
  doc.text(leftText, leftBoxX, boxTopY + 4.5);

  const rightInfoLines = [
    po.supplierName || '-',
    `Alamat  : ${supplierAddress}`,
    `Telepon : ${supplierPhone}`,
    `No. Izin: ${supplierLicense}`
  ];
  const rightText = doc.splitTextToSize(rightInfoLines.join('\n'), contentWidth * 0.48);
  doc.text(rightText, rightBoxX, boxTopY + 4.5);

  const leftHeight = leftText.length * 4 + 6;
  const rightHeight = rightText.length * 4 + 6;
  cursorY = boxTopY + Math.max(leftHeight, rightHeight) + 2;

  // Tabel Item Pesanan (hanya item pada kelompok SP terpilih)
  const tableRows =
    filteredItems.length > 0
      ? filteredItems.map((item, idx) => {
          const itemDesc = item.kekuatan ? `${item.name}\n(Zat Aktif: ${item.kekuatan})` : item.name;
          const qtyDesc =
            item.rasioKonversi > 1
              ? `${item.qtyBesar} ${item.satuanBesar}\n(${item.qtyKecil} ${item.satuanKecil})`
              : `${item.qtyBesar} ${item.satuanBesar}`;

          return [
            String(idx + 1),
            itemDesc,
            item.form || '-',
            item.spType,
            qtyDesc,
            `Rp ${(item.estimatedHna || 0).toLocaleString('id-ID')}`,
            `Rp ${(item.subtotal || 0).toLocaleString('id-ID')}`,
            item.ket || '-'
          ];
        })
      : [['-', 'Belum ada kelompok SP yang dipilih.', '-', '-', '-', '-', '-', '-']];

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [['No', 'Nama Obat / Alkes', 'Bentuk Sediaan', 'SP', 'Jumlah Pesan', 'Est. HNA', 'Subtotal', 'Ket']],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      valign: 'middle'
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center'
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 46 },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'center', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 24 },
      7: { cellWidth: 23 }
    }
  });

  const finalY =
    (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY + 30;
  let afterTableY = finalY + 6;

  // Ringkasan Total & Catatan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Total Estimasi Nilai Pesanan: Rp ${filteredTotalCost.toLocaleString('id-ID')}`,
    pageWidth - marginX,
    afterTableY,
    { align: 'right' }
  );
  afterTableY += 5.5;

  if (po.notes && po.notes.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Catatan:', marginX, afterTableY);
    afterTableY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const noteLines = doc.splitTextToSize(po.notes.trim(), contentWidth);
    doc.text(noteLines, marginX, afterTableY);
    afterTableY += noteLines.length * 4 + 3;
  }

  // Pastikan blok tanda tangan tidak terpotong halaman
  const pageHeight = doc.internal.pageSize.getHeight();
  if (afterTableY + 36 > pageHeight - 12) {
    doc.addPage();
    afterTableY = 18;
  }

  // Blok Tanda Tangan APJ
  const sigX = pageWidth - marginX - 68;
  const sigY = afterTableY + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`${pharmacy.city || 'Indonesia'}, ${formatDateIndonesian(po.date)}`, sigX, sigY);
  doc.text('Apoteker Penanggung Jawab (APJ),', sigX, sigY + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(apj.name || 'Apoteker Pengelola Apotek', sigX, sigY + 23);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  if (apj.sipa) {
    doc.text(`SIPA: ${apj.sipa}`, sigX, sigY + 27);
  }
  if (apj.stra) {
    doc.text(`STRA: ${apj.stra}`, sigX, sigY + 30.5);
  }

  const spTag =
    resolvedSpGroups.length === 0
      ? 'SP'
      : resolvedSpGroups.length === availableSpGroups.length && availableSpGroups.length > 1
      ? 'ALL-SP'
      : resolvedSpGroups.join('-');

  const fileName = `PO-${slugifySegment(po.poNumber, po.id)}-${spTag}-${slugifySegment(
    po.supplierName || 'PBF',
    'PBF'
  )}.pdf`;

  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });

  return {
    blob,
    file,
    fileName,
    availableSpGroups,
    selectedSpGroups: resolvedSpGroups,
    filteredItems,
    filteredTotalCost
  };
};

export const downloadPurchaseOrderPdf = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
};

const openWhatsappLink = (waUrl: string) => {
  const link = document.createElement('a');
  link.href = waUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const buildPurchaseOrderWhatsappMessage = (
  po: PurchaseOrder,
  fileName: string,
  selectedSpGroups?: SPGroupType[]
): string => {
  const pharmacy = getSavedPharmacyProfile();
  const {
    resolvedSpGroups,
    filteredItems,
    filteredTotalCost
  } = resolveSelectedSPGroupsForPO(po, selectedSpGroups);

  const spListText =
    resolvedSpGroups.length > 0
      ? resolvedSpGroups.map((group) => `${group} (${po.spNumbers?.[group] || '-'})`).join(', ')
      : '-';

  const itemPreviewLines = filteredItems.slice(0, 12).map((item, idx) => {
    const formLabel = item.form ? ` [${item.form}]` : '';
    return `${idx + 1}. ${item.name}${formLabel} — ${item.qtyBesar} ${item.satuanBesar}`;
  });
  if (filteredItems.length > 12) {
    itemPreviewLines.push(`...dan ${filteredItems.length - 12} item lainnya (lihat lampiran PDF).`);
  }

  return [
    `Halo *${po.supplierName}*,`,
    `Berikut kami sampaikan Pesanan Pembelian (PO) resmi dari *${pharmacy.name || 'Apotek'}*:`,
    '',
    `• *No. PO:* ${po.poNumber}`,
    `• *No. SP:* ${spListText}`,
    `• *Tanggal:* ${formatDateIndonesian(po.date)}`,
    `• *Total Estimasi:* Rp ${filteredTotalCost.toLocaleString('id-ID')}`,
    '',
    '*Daftar Pesanan:*',
    ...itemPreviewLines,
    '',
    `File PDF resmi (*${fileName}*) sudah terlampir/terunduh. Mohon konfirmasi ketersediaan stok & estimasi pengiriman. Terima kasih.`
  ].join('\n');
};

export interface PurchaseOrderPdfPreviewData {
  po: PurchaseOrder;
  matchedSupplier?: Supplier;
  blob: Blob;
  file: File;
  fileName: string;
  previewUrl: string;
  rawPhone: string;
  normalizedPhone: string | null;
  defaultMessage: string;
  availableSpGroups: SPGroupType[];
  selectedSpGroups: SPGroupType[];
  filteredItems: PurchaseOrderItem[];
  filteredTotalCost: number;
}

export const createPurchaseOrderPdfPreview = (
  po: PurchaseOrder,
  suppliers: Supplier[] = [],
  selectedSpGroups?: SPGroupType[]
): PurchaseOrderPdfPreviewData => {
  const matchedSupplier = resolveSupplierForPO(po, suppliers);
  const generated = generatePurchaseOrderPdfFile(po, matchedSupplier, { selectedSpGroups });
  const previewUrl = URL.createObjectURL(generated.blob);
  const rawPhone = po.supplierPhone || matchedSupplier?.phone || '';
  const normalizedPhone = normalizeWhatsappPhone(rawPhone);
  const defaultMessage = buildPurchaseOrderWhatsappMessage(
    po,
    generated.fileName,
    generated.selectedSpGroups
  );

  return {
    po,
    matchedSupplier,
    blob: generated.blob,
    file: generated.file,
    fileName: generated.fileName,
    previewUrl,
    rawPhone,
    normalizedPhone,
    defaultMessage,
    availableSpGroups: generated.availableSpGroups,
    selectedSpGroups: generated.selectedSpGroups,
    filteredItems: generated.filteredItems,
    filteredTotalCost: generated.filteredTotalCost
  };
};

export interface SendPOWhatsappOptions {
  customPhone?: string;
  customMessage?: string;
  selectedSpGroups?: SPGroupType[];
  pregeneratedPdf?: Pick<GeneratedPOPdfResult, 'blob' | 'file' | 'fileName'>;
}

export const sendPurchaseOrderViaWhatsapp = async (
  po: PurchaseOrder,
  suppliers: Supplier[] = [],
  options: SendPOWhatsappOptions = {}
): Promise<SendPOWhatsappResult> => {
  const matchedSupplier = resolveSupplierForPO(po, suppliers);
  const { blob, file, fileName } =
    options.pregeneratedPdf ||
    generatePurchaseOrderPdfFile(po, matchedSupplier, {
      selectedSpGroups: options.selectedSpGroups
    });

  const rawPhone =
    options.customPhone !== undefined
      ? options.customPhone
      : po.supplierPhone || matchedSupplier?.phone || '';
  const waPhone = normalizeWhatsappPhone(rawPhone);
  const waMessage =
    options.customMessage && options.customMessage.trim()
      ? options.customMessage.trim()
      : buildPurchaseOrderWhatsappMessage(po, fileName, options.selectedSpGroups);

  // Pada perangkat mobile yang mendukung Web Share API Level 2 dengan file attachment,
  // langsung bagikan File PDF ke aplikasi target (termasuk WhatsApp).
  const isTouchDevice =
    typeof navigator !== 'undefined' &&
    (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1);

  if (
    isTouchDevice &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: `Surat Pesanan ${po.poNumber} - ${po.supplierName}`,
        text: waMessage,
        files: [file]
      });
      return {
        mode: 'web-share',
        phone: waPhone,
        displayPhone: rawPhone || null,
        fileName
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return {
          mode: 'cancelled',
          phone: waPhone,
          displayPhone: rawPhone || null,
          fileName
        };
      }
      // Jika Web Share diblokir (misal oleh sandbox/iframe), lanjut ke unduh PDF + buka WhatsApp.
    }
  }

  // Fallback standar (Desktop & browser yang tidak mendukung direct file share):
  // 1) Otomatis unduh file PDF Surat Pesanan agar siap dikirim/diseret ke chat WhatsApp
  // 2) Buka chat WhatsApp PBF dengan rincian PO terisi otomatis
  downloadPurchaseOrderPdf(blob, fileName);

  const encodedText = encodeURIComponent(waMessage);
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
  openWhatsappLink(waUrl);

  return {
    mode: 'wa-download',
    phone: waPhone,
    displayPhone: rawPhone || null,
    fileName
  };
};
