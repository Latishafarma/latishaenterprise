import { Medicine, PrescriptionItem } from '../types';
import { demoGetItem, demoSetItem } from './demoSandbox';
import { calculateRacikanBud } from './racikanBudHelper';

export type MedicationRouteType = 'dalam' | 'luar';
export type MedicationLabelLayout = 'thermal-80' | 'thermal-58' | 'sheet' | 'sticker';

export function normalizeMedicationLabelLayout(
  layout?: string | null
): 'thermal-80' | 'thermal-58' | 'sheet' {
  if (layout === 'thermal-58') return 'thermal-58';
  if (layout === 'sheet') return 'sheet';
  return 'thermal-80';
}

export interface MedicationLabelItem {
  id: string;
  medicineId?: string;
  name: string;
  qty: number;
  unit: string;
  dosage: string;
  routeType: MedicationRouteType;
  timingNote: string;
  extraWarning: string;
  batchNo?: string;
  expDate?: string;
  budDate?: string;
  isRacikan?: boolean;
  racikanType?: string;
  selected: boolean;
  copies: number;
}

export function isRacikanPrescriptionItem(
  item: Partial<PrescriptionItem> | Partial<MedicationLabelItem>
): boolean {
  const notes = 'notes' in item ? item.notes : undefined;
  return Boolean(
    item.isRacikan ||
      (item.medicineId && item.medicineId.startsWith('RACIKAN-')) ||
      /\bm\.f\.?\s*(pulv|caps|ungt|potio|crem|sol)/i.test(notes || '') ||
      (/\b(puyer|racikan)\b/i.test(item.name || '') && /\[.+\]/.test(item.name || ''))
  );
}

export interface MedicationLabelPrintPayload {
  rxId: string;
  rmId?: string;
  patientName: string;
  patientAge?: string;
  patientGender?: string;
  patientAddress?: string;
  doctorName?: string;
  date: string;
  screenedBy?: string;
  layout: MedicationLabelLayout;
  labels: MedicationLabelItem[];
  createdAt: string;
}

export const MEDICATION_LABEL_PRINT_KEY = 'latisha_active_print_etiket';

const EXTERNAL_MED_KEYWORDS = [
  'salep',
  'krim',
  'cream',
  'gel',
  'ointment',
  'unguent',
  'lotion',
  'bedak',
  'tetes mata',
  'eye drop',
  'tetes telinga',
  'ear drop',
  'tetes hidung',
  'nasal',
  'suppositoria',
  'suppos',
  'suppo',
  'ovula',
  'inhaler',
  'nebul',
  'plester',
  'koyo',
  'kompres',
  'kumur',
  'gargle',
  'obat luar',
  'oles',
  'topikal',
  'shampoo',
  'antiseptik luar',
  'povidone',
  'betadine'
];

const ANTIBIOTIC_KEYWORDS = [
  'amoxicillin',
  'amoksisilin',
  'azithromycin',
  'azitromisin',
  'cefixime',
  'sefiksim',
  'cefadroxil',
  'sefadroksil',
  'ciprofloxacin',
  'siprofloksasin',
  'levofloxacin',
  'metronidazole',
  'metronidazol',
  'clindamycin',
  'klindamisin',
  'doxycycline',
  'doksisiklin',
  'erythromycin',
  'eritromisin',
  'cotrimoxazole',
  'kotrimoksazol',
  'ampicillin',
  'ampisilin',
  'ceftriaxone',
  'clarithromycin',
  'tetracycline',
  'tetrasiklin',
  'ofloxacin',
  'chloramphenicol',
  'kloramfenikol'
];

export function detectLabelRouteType(
  name: string,
  unit?: string,
  dosage?: string,
  form?: string,
  kelas?: string
): MedicationRouteType {
  const combined = `${name || ''} ${unit || ''} ${dosage || ''} ${form || ''} ${kelas || ''}`.toLowerCase();
  if (
    unit?.toLowerCase().includes('tube') ||
    unit?.toLowerCase().includes('pot') ||
    form?.toLowerCase().includes('salep') ||
    form?.toLowerCase().includes('krim') ||
    form?.toLowerCase().includes('gel') ||
    form?.toLowerCase().includes('topikal') ||
    EXTERNAL_MED_KEYWORDS.some((kw) => combined.includes(kw))
  ) {
    return 'luar';
  }
  return 'dalam';
}

export function extractLabelTimingAndWarning(
  name: string,
  unit?: string,
  dosage?: string,
  notes?: string,
  routeType: MedicationRouteType = 'dalam',
  form?: string,
  kelas?: string,
  isRacikan: boolean = false
): { timingNote: string; extraWarning: string } {
  const rawDosage = (dosage || '').trim();
  const rawNotes = (notes || '').trim();
  const lowerCombined = `${rawDosage} ${rawNotes}`.toLowerCase();
  const medCombined = `${name || ''} ${unit || ''} ${form || ''} ${kelas || ''}`.toLowerCase();

  let timingNote = '';
  if (lowerCombined.includes('sebelum makan') || lowerCombined.includes('a.c')) {
    timingNote = 'Sebelum makan';
  } else if (
    lowerCombined.includes('sesudah makan') ||
    lowerCombined.includes('setelah makan') ||
    lowerCombined.includes('p.c')
  ) {
    timingNote = 'Sesudah makan';
  } else if (
    lowerCombined.includes('bersama makan') ||
    lowerCombined.includes('saat makan') ||
    lowerCombined.includes('d.c')
  ) {
    timingNote = 'Bersama makan';
  } else if (lowerCombined.includes('bila perlu') || lowerCombined.includes('prn')) {
    timingNote = 'Bila perlu / saat gejala';
  } else if (lowerCombined.includes('malam') || lowerCombined.includes('sebelum tidur')) {
    timingNote = 'Malam sebelum tidur';
  } else if (lowerCombined.includes('pagi')) {
    timingNote = 'Pagi hari';
  } else if (routeType === 'dalam') {
    timingNote = 'Sesudah makan';
  } else {
    timingNote = 'Oleskan / gunakan secukupnya pada area yang sakit';
  }

  const warnings: string[] = [];
  if (routeType === 'luar') {
    warnings.push('OBAT LUAR — Tidak untuk ditelan');
  }
  if (
    kelas?.toLowerCase().includes('antibiotik') ||
    ANTIBIOTIC_KEYWORDS.some((kw) => medCombined.includes(kw)) ||
    lowerCombined.includes('habiskan')
  ) {
    warnings.push('HABISKAN (Antibiotik)');
  }
  if (
    medCombined.includes('sirup') ||
    medCombined.includes('syrup') ||
    medCombined.includes('suspensi') ||
    medCombined.includes('emulsi') ||
    medCombined.includes('tetes') ||
    medCombined.includes('botol') ||
    lowerCombined.includes('kocok')
  ) {
    warnings.push('Kocok dahulu sebelum dipakai');
  }
  if (
    !isRacikan &&
    rawNotes &&
    !warnings.some((w) => w.toLowerCase() === rawNotes.toLowerCase())
  ) {
    warnings.push(rawNotes);
  }

  return {
    timingNote,
    extraWarning: warnings.join(' · ')
  };
}

export function buildMedicationLabelItems(
  items: PrescriptionItem[],
  medicines: Medicine[] = []
): MedicationLabelItem[] {
  return (items || []).map((item, idx) => {
    const isRacikan = isRacikanPrescriptionItem(item);
    const matchedMed = isRacikan
      ? undefined
      : medicines.find(
          (m) =>
            (item.medicineId && m.id === item.medicineId) ||
            m.name.toLowerCase().trim() === (item.name || '').toLowerCase().trim()
        );

    const routeType = detectLabelRouteType(
      item.name,
      item.unit,
      item.dosage,
      item.racikanType || matchedMed?.form,
      matchedMed?.kelas
    );

    const { timingNote, extraWarning } = extractLabelTimingAndWarning(
      item.name,
      item.unit,
      item.dosage,
      item.notes,
      routeType,
      item.racikanType || matchedMed?.form,
      matchedMed?.kelas,
      isRacikan
    );

    // Resolve batch/ED (prefer first active batch sorted FEFO, fallback to medicine batchNo/expDate)
    let resolvedBatch = matchedMed?.batchNo || '';
    let resolvedExp = matchedMed?.expDate || '';
    if (matchedMed?.batches && matchedMed.batches.length > 0) {
      const availableBatches = matchedMed.batches
        .filter((b) => Number(b.stock) > 0 && b.expDate)
        .sort((a, b) => a.expDate.localeCompare(b.expDate));
      const primaryBatch = availableBatches[0] || matchedMed.batches[0];
      if (primaryBatch) {
        resolvedBatch = primaryBatch.batchNo || resolvedBatch;
        resolvedExp = primaryBatch.expDate || resolvedExp;
      }
    }

    // Resolve BUD for racikan items (prefer saved budDate, otherwise auto-calculate for non-Sirup)
    let resolvedBud = item.budDate || '';
    if (isRacikan && !resolvedBud && item.racikanType !== 'Sirup Racikan' && item.racikanIngredients?.length) {
      resolvedBud = calculateRacikanBud(
        item.racikanType,
        item.racikanIngredients,
        medicines
      ).budDate;
    }

    return {
      id: `LBL-${idx + 1}-${item.medicineId || idx}`,
      medicineId: item.medicineId,
      name: item.name || 'Obat',
      qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
      unit: item.unit || matchedMed?.unit || 'Tablet',
      dosage: (item.dosage || '3x1').trim(),
      routeType,
      timingNote,
      extraWarning,
      batchNo: resolvedBatch || undefined,
      expDate: isRacikan ? undefined : resolvedExp || undefined,
      budDate: isRacikan ? resolvedBud || undefined : undefined,
      isRacikan,
      racikanType: item.racikanType,
      selected: true,
      copies: 1
    };
  });
}

export function saveMedicationLabelPrintPayload(payload: MedicationLabelPrintPayload): void {
  try {
    const jsonStr = JSON.stringify(payload);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(MEDICATION_LABEL_PRINT_KEY, jsonStr);
    }
    demoSetItem(MEDICATION_LABEL_PRINT_KEY, jsonStr);
  } catch (err) {
    console.warn('Error saving medication label print payload:', err);
  }
}

export function loadMedicationLabelPrintPayload(
  searchParams?: URLSearchParams
): MedicationLabelPrintPayload | null {
  try {
    const urlPayload = searchParams?.get('_payload');
    const raw =
      urlPayload ||
      (typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(MEDICATION_LABEL_PRINT_KEY)
        : null) ||
      demoGetItem(MEDICATION_LABEL_PRINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.labels)) {
      return parsed as MedicationLabelPrintPayload;
    }
    return null;
  } catch (err) {
    console.warn('Error reading medication label print payload:', err);
    return null;
  }
}
