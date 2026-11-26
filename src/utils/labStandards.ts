/**
 * Standar Nilai Rujukan Klinis Laboratorium & Evaluator Otomatis
 * Mendukung pembedaan gender: (P)erempuan dan (L)aki-laki
 */

export interface ClinicalStandard {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
  category: 'Darah' | 'Fungsi Hati' | 'Fungsi Ginjal' | 'Profil Lipid' | 'Gula Darah & Lainnya';
  rangeFemale: string;
  rangeMale: string;
  evalFemale: { min?: number; max?: number; isLessThan?: number; isGreaterThan?: number };
  evalMale: { min?: number; max?: number; isLessThan?: number; isGreaterThan?: number };
}

export const CLINICAL_STANDARDS: ClinicalStandard[] = [
  // 1. Darah / Hematologi
  {
    id: 'eritrosit',
    name: 'Eritrosit',
    aliases: ['eritrosit', 'rbc', 'sel darah merah', 'red blood cell'],
    unit: 'juta/µl',
    category: 'Darah',
    rangeFemale: '4.0 - 5.0',
    rangeMale: '4.5 - 5.5',
    evalFemale: { min: 4.0, max: 5.0 },
    evalMale: { min: 4.5, max: 5.5 }
  },
  {
    id: 'hb',
    name: 'Hemoglobin (Hb)',
    aliases: ['hemoglobin', 'hb', 'hgb', 'hemoglobin (hb)'],
    unit: 'g/dL',
    category: 'Darah',
    rangeFemale: '12.0 - 14.0',
    rangeMale: '13.0 - 16.0',
    evalFemale: { min: 12.0, max: 14.0 },
    evalMale: { min: 13.0, max: 16.0 }
  },
  {
    id: 'ht',
    name: 'Hematokrit',
    aliases: ['hematokrit', 'ht', 'hct'],
    unit: '%',
    category: 'Darah',
    rangeFemale: '40 - 50',
    rangeMale: '45 - 55',
    evalFemale: { min: 40, max: 50 },
    evalMale: { min: 45, max: 55 }
  },
  {
    id: 'basofil',
    name: 'Basofil',
    aliases: ['basofil', 'basophil'],
    unit: '%',
    category: 'Darah',
    rangeFemale: '0.0 - 1.0',
    rangeMale: '0.0 - 1.0',
    evalFemale: { min: 0.0, max: 1.0 },
    evalMale: { min: 0.0, max: 1.0 }
  },
  {
    id: 'eosinofil',
    name: 'Eosinofil',
    aliases: ['eosinofil', 'eosinophil'],
    unit: '%',
    category: 'Darah',
    rangeFemale: '1.0 - 3.0',
    rangeMale: '1.0 - 3.0',
    evalFemale: { min: 1.0, max: 3.0 },
    evalMale: { min: 1.0, max: 3.0 }
  },
  {
    id: 'batang',
    name: 'Batang',
    aliases: ['batang', 'neutrofil batang', 'band'],
    unit: '%',
    category: 'Darah',
    rangeFemale: '2.0 - 6.0',
    rangeMale: '2.0 - 6.0',
    evalFemale: { min: 2.0, max: 6.0 },
    evalMale: { min: 2.0, max: 6.0 }
  },
  {
    id: 'segmen',
    name: 'Segmen',
    aliases: ['segmen', 'neutrofil segmen', 'segmented'],
    unit: '%',
    category: 'Darah',
    rangeFemale: '50.0 - 70.0',
    rangeMale: '50.0 - 70.0',
    evalFemale: { min: 50.0, max: 70.0 },
    evalMale: { min: 50.0, max: 70.0 }
  },
  {
    id: 'limfosit',
    name: 'Limfosit',
    aliases: ['limfosit', 'lymphocyte'],
    unit: '%',
    category: 'Darah',
    rangeFemale: '20.0 - 40.0',
    rangeMale: '20.0 - 40.0',
    evalFemale: { min: 20.0, max: 40.0 },
    evalMale: { min: 20.0, max: 40.0 }
  },
  {
    id: 'monosit',
    name: 'Monosit',
    aliases: ['monosit', 'monocyte'],
    unit: '%',
    category: 'Darah',
    rangeFemale: '2.0 - 8.0',
    rangeMale: '2.0 - 8.0',
    evalFemale: { min: 2.0, max: 8.0 },
    evalMale: { min: 2.0, max: 8.0 }
  },
  {
    id: 'led',
    name: 'Laju Endap Darah (LED)',
    aliases: ['laju endap darah', 'led', 'esr'],
    unit: 'mm/jam',
    category: 'Darah',
    rangeFemale: '< 15',
    rangeMale: '< 10',
    evalFemale: { isLessThan: 15 },
    evalMale: { isLessThan: 10 }
  },
  {
    id: 'leukosit',
    name: 'Leukosit',
    aliases: ['leukosit', 'wbc', 'sel darah putih', 'white blood cell'],
    unit: 'x10^3/µl',
    category: 'Darah',
    rangeFemale: '5.0 - 10.0',
    rangeMale: '5.0 - 10.0',
    evalFemale: { min: 5.0, max: 10.0 },
    evalMale: { min: 5.0, max: 10.0 }
  },
  {
    id: 'mch',
    name: 'MCH/HER',
    aliases: ['mch', 'mch/her', 'her'],
    unit: 'pg',
    category: 'Darah',
    rangeFemale: '27 - 31',
    rangeMale: '27 - 31',
    evalFemale: { min: 27, max: 31 },
    evalMale: { min: 27, max: 31 }
  },
  {
    id: 'mchc',
    name: 'MCHC/KHER',
    aliases: ['mchc', 'mchc/kher', 'kher'],
    unit: 'g/dL',
    category: 'Darah',
    rangeFemale: '32 - 36',
    rangeMale: '32 - 36',
    evalFemale: { min: 32, max: 36 },
    evalMale: { min: 32, max: 36 }
  },
  {
    id: 'mcv',
    name: 'MCV/VER',
    aliases: ['mcv', 'mcv/ver', 'ver'],
    unit: 'fl',
    category: 'Darah',
    rangeFemale: '80 - 96',
    rangeMale: '80 - 96',
    evalFemale: { min: 80, max: 96 },
    evalMale: { min: 80, max: 96 }
  },
  {
    id: 'trombosit',
    name: 'Trombosit',
    aliases: ['trombosit', 'platelet', 'plt'],
    unit: 'x10^3/µl',
    category: 'Darah',
    rangeFemale: '150 - 400',
    rangeMale: '150 - 400',
    evalFemale: { min: 150, max: 400 },
    evalMale: { min: 150, max: 400 }
  },

  // 2. Fungsi Hati (LFT)
  {
    id: 'alt_sgpt',
    name: 'ALT (SGPT)',
    aliases: ['alt', 'sgpt', 'alt (sgpt)', 'sgpt (alt)', 'sgpt/alt'],
    unit: 'U/L',
    category: 'Fungsi Hati',
    rangeFemale: '< 23',
    rangeMale: '< 30',
    evalFemale: { isLessThan: 23 },
    evalMale: { isLessThan: 30 }
  },
  {
    id: 'ast_sgot',
    name: 'AST (SGOT)',
    aliases: ['ast', 'sgot', 'ast (sgot)', 'sgot (ast)', 'sgot/ast'],
    unit: 'U/L',
    category: 'Fungsi Hati',
    rangeFemale: '< 21',
    rangeMale: '< 25',
    evalFemale: { isLessThan: 21 },
    evalMale: { isLessThan: 25 }
  },
  {
    id: 'alp',
    name: 'Alkalin Fosfatase',
    aliases: ['alkalin fosfatase', 'alp', 'alkaline phosphatase'],
    unit: 'U/L',
    category: 'Fungsi Hati',
    rangeFemale: '15 - 69',
    rangeMale: '15 - 69',
    evalFemale: { min: 15, max: 69 },
    evalMale: { min: 15, max: 69 }
  },
  {
    id: 'ggt',
    name: 'GGT',
    aliases: ['ggt', 'gamma gt', 'gamma-glutamyl transferase'],
    unit: 'U/L',
    category: 'Fungsi Hati',
    rangeFemale: '5 - 38',
    rangeMale: '5 - 38',
    evalFemale: { min: 5, max: 38 },
    evalMale: { min: 5, max: 38 }
  },
  {
    id: 'bilirubin_total',
    name: 'Bilirubin Total',
    aliases: ['bilirubin total', 'total bilirubin', 't. bili'],
    unit: 'mg/dL',
    category: 'Fungsi Hati',
    rangeFemale: '0.25 - 1.0',
    rangeMale: '0.25 - 1.0',
    evalFemale: { min: 0.25, max: 1.0 },
    evalMale: { min: 0.25, max: 1.0 }
  },
  {
    id: 'bilirubin_direct',
    name: 'Bilirubin Langsung',
    aliases: ['bilirubin langsung', 'bilirubin direk', 'direct bilirubin', 'd. bili'],
    unit: 'mg/dL',
    category: 'Fungsi Hati',
    rangeFemale: '0.0 - 0.25',
    rangeMale: '0.0 - 0.25',
    evalFemale: { min: 0.0, max: 0.25 },
    evalMale: { min: 0.0, max: 0.25 }
  },
  {
    id: 'protein_total',
    name: 'Protein Total',
    aliases: ['protein total', 'total protein'],
    unit: 'g/L',
    category: 'Fungsi Hati',
    rangeFemale: '61 - 82',
    rangeMale: '61 - 82',
    evalFemale: { min: 61, max: 82 },
    evalMale: { min: 61, max: 82 }
  },
  {
    id: 'albumin',
    name: 'Albumin',
    aliases: ['albumin'],
    unit: 'g/L',
    category: 'Fungsi Hati',
    rangeFemale: '37 - 52',
    rangeMale: '37 - 52',
    evalFemale: { min: 37, max: 52 },
    evalMale: { min: 37, max: 52 }
  },

  // 3. Fungsi Ginjal
  {
    id: 'kreatinin',
    name: 'Kreatinin',
    aliases: ['kreatinin', 'creatinine'],
    unit: 'U/L',
    category: 'Fungsi Ginjal',
    rangeFemale: '60 - 150',
    rangeMale: '70 - 160',
    evalFemale: { min: 60, max: 150 },
    evalMale: { min: 70, max: 160 }
  },
  {
    id: 'urea',
    name: 'Urea',
    aliases: ['urea', 'ureum', 'blood urea'],
    unit: 'mg/dL',
    category: 'Fungsi Ginjal',
    rangeFemale: '8 - 25',
    rangeMale: '8 - 25',
    evalFemale: { min: 8, max: 25 },
    evalMale: { min: 8, max: 25 }
  },
  {
    id: 'natrium',
    name: 'Natrium',
    aliases: ['natrium', 'sodium', 'na'],
    unit: 'mmol/L',
    category: 'Fungsi Ginjal',
    rangeFemale: '135 - 145',
    rangeMale: '135 - 145',
    evalFemale: { min: 135, max: 145 },
    evalMale: { min: 135, max: 145 }
  },
  {
    id: 'klorid',
    name: 'Klorid',
    aliases: ['klorid', 'klorida', 'chloride', 'cl'],
    unit: 'mmol/L',
    category: 'Fungsi Ginjal',
    rangeFemale: '94 - 111',
    rangeMale: '94 - 111',
    evalFemale: { min: 94, max: 111 },
    evalMale: { min: 94, max: 111 }
  },
  {
    id: 'kalium',
    name: 'Kalium',
    aliases: ['kalium', 'potassium', 'k'],
    unit: 'mmol/L',
    category: 'Fungsi Ginjal',
    rangeFemale: '3.5 - 5.0',
    rangeMale: '3.5 - 5.0',
    evalFemale: { min: 3.5, max: 5.0 },
    evalMale: { min: 3.5, max: 5.0 }
  },

  // 4. Profil Lipid
  {
    id: 'kolesterol_total',
    name: 'Kolesterol Total',
    aliases: ['kolesterol total', 'total cholesterol', 'kolesterol', 'cholesterol'],
    unit: 'mg/dL',
    category: 'Profil Lipid',
    rangeFemale: '150 - 200',
    rangeMale: '150 - 200',
    evalFemale: { min: 150, max: 200 },
    evalMale: { min: 150, max: 200 }
  },
  {
    id: 'hdl',
    name: 'HDL (Kolesterol HDL)',
    aliases: ['hdl', 'kolesterol hdl', 'hdl (kolesterol hdl)', 'hdl-c'],
    unit: 'mg/dL',
    category: 'Profil Lipid',
    rangeFemale: '> 50',
    rangeMale: '> 40',
    evalFemale: { isGreaterThan: 50 },
    evalMale: { isGreaterThan: 40 }
  },
  {
    id: 'ldl',
    name: 'LDL (Kolesterol LDL)',
    aliases: ['ldl', 'kolesterol ldl', 'ldl (kolesterol ldl)', 'ldl-c'],
    unit: 'mg/dL',
    category: 'Profil Lipid',
    rangeFemale: '< 100',
    rangeMale: '< 100',
    evalFemale: { isLessThan: 100 },
    evalMale: { isLessThan: 100 }
  },
  {
    id: 'trigliserid',
    name: 'Trigliserid',
    aliases: ['trigliserid', 'trigliserida', 'triglycerides', 'tg'],
    unit: 'mg/dL',
    category: 'Profil Lipid',
    rangeFemale: '120 - 190',
    rangeMale: '120 - 190',
    evalFemale: { min: 120, max: 190 },
    evalMale: { min: 120, max: 190 }
  },

  // 5. Pemeriksaan Lain & Gula Darah
  {
    id: 'gdp',
    name: 'Gula Darah Puasa (GDP)',
    aliases: ['gula darah puasa (gdp)', 'gula darah puasa', 'gdp', 'gula puasa', 'glukosa puasa', 'fasting blood glucose', 'fbg'],
    unit: 'mg/dL',
    category: 'Gula Darah & Lainnya',
    rangeFemale: '70 - 126',
    rangeMale: '70 - 126',
    evalFemale: { min: 70, max: 126 },
    evalMale: { min: 70, max: 126 }
  },
  {
    id: 'gds',
    name: 'Gula Darah Sewaktu (GDS)',
    aliases: ['gula darah sewaktu (gds)', 'gula darah sewaktu', 'gds', 'gula sewaktu', 'glukosa sewaktu', 'random blood glucose', 'rbg'],
    unit: 'mg/dL',
    category: 'Gula Darah & Lainnya',
    rangeFemale: '70 - 200',
    rangeMale: '70 - 200',
    evalFemale: { min: 70, max: 200 },
    evalMale: { min: 70, max: 200 }
  },
  {
    id: 'gd2pp',
    name: 'Gula Darah 2 Jam PP (GD2PP)',
    aliases: ['gula darah 2 jam pp (gd2pp)', 'gula darah 2 jam pp', 'gd2pp', 'gd2jpp', 'gula 2 jam pp', '2 jam pp'],
    unit: 'mg/dL',
    category: 'Gula Darah & Lainnya',
    rangeFemale: '< 140',
    rangeMale: '< 140',
    evalFemale: { isLessThan: 140 },
    evalMale: { isLessThan: 140 }
  },
  {
    id: 'amilase',
    name: 'Amilase',
    aliases: ['amilase', 'amylase'],
    unit: 'U/L',
    category: 'Gula Darah & Lainnya',
    rangeFemale: '30 - 130',
    rangeMale: '30 - 130',
    evalFemale: { min: 30, max: 130 },
    evalMale: { min: 30, max: 130 }
  },
  {
    id: 'asam_urat',
    name: 'Asam Urat',
    aliases: ['asam urat', 'uric acid', 'uric acid (asam urat)', 'au'],
    unit: 'mg/dL',
    category: 'Gula Darah & Lainnya',
    rangeFemale: '2.4 - 5.7',
    rangeMale: '3.4 - 7.0',
    evalFemale: { min: 2.4, max: 5.7 },
    evalMale: { min: 3.4, max: 7.0 }
  }
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeToken(haystack: string, token: string): boolean {
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(token)}(?:$|[^a-z0-9])`, 'i');
  return re.test(haystack);
}

/**
 * Temukan standar klinis berdasarkan nama parameter uji
 * Menggunakan pencocokan presisi (exact -> word-boundary terpanjang -> substring >= 4 karakter terpanjang)
 * agar alias pendek seperti 'k' (Kalium) tidak pernah salah cocok pada parameter lain seperti GDS/Kolesterol.
 */
export function findClinicalStandard(paramName: string): ClinicalStandard | undefined {
  if (!paramName) return undefined;
  const clean = paramName.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!clean) return undefined;

  // 1. Exact match pada nama standar
  const exactName = CLINICAL_STANDARDS.find((s) => s.name.toLowerCase() === clean);
  if (exactName) return exactName;

  // 2. Exact match pada alias
  const exactAlias = CLINICAL_STANDARDS.find((s) =>
    s.aliases.some((alias) => alias.toLowerCase() === clean)
  );
  if (exactAlias) return exactAlias;

  // 3. Word-boundary match (pilih kecocokan alias terpanjang agar spesifik, mis. "kolesterol hdl" menang atas "kolesterol")
  let bestBoundaryMatch: { std: ClinicalStandard; score: number } | null = null;
  for (const s of CLINICAL_STANDARDS) {
    const candidates = [s.name.toLowerCase(), ...s.aliases.map((a) => a.toLowerCase())];
    for (const alias of candidates) {
      if (!alias) continue;
      if (hasWholeToken(clean, alias)) {
        const score = alias.length + (alias === s.name.toLowerCase() ? 10 : 0);
        if (!bestBoundaryMatch || score > bestBoundaryMatch.score) {
          bestBoundaryMatch = { std: s, score };
        }
      }
    }
  }
  if (bestBoundaryMatch) return bestBoundaryMatch.std;

  // 4. Fallback substring match hanya untuk alias panjang (>= 4 karakter)
  let bestSubstringMatch: { std: ClinicalStandard; score: number } | null = null;
  for (const s of CLINICAL_STANDARDS) {
    const candidates = [s.name.toLowerCase(), ...s.aliases.map((a) => a.toLowerCase())];
    for (const alias of candidates) {
      if (alias.length < 4) continue;
      if (clean.includes(alias)) {
        const score = alias.length;
        if (!bestSubstringMatch || score > bestSubstringMatch.score) {
          bestSubstringMatch = { std: s, score };
        }
      }
    }
  }
  return bestSubstringMatch?.std;
}

/**
 * Dapatkan rentang rujukan standar untuk parameter berdasarkan jenis kelamin
 */
export function getStandardReferenceRange(
  paramName: string,
  gender: 'Laki-laki' | 'Perempuan'
): { range: string; unit?: string; canonicalName?: string } | null {
  const std = findClinicalStandard(paramName);
  if (!std) return null;
  return {
    range: gender === 'Perempuan' ? std.rangeFemale : std.rangeMale,
    unit: std.unit,
    canonicalName: std.name
  };
}

/**
 * Evaluasi status hasil tes (Normal, Tinggi, Rendah, Kritis, Abnormal)
 * Selalu memprioritaskan rentang Nilai Rujukan aktif pada baris tabel agar
 * kolom Nilai Hasil, Nilai Rujukan, dan Interpretasi 100% sinkron.
 */
export function evaluateLabResultStatus(
  paramName: string,
  resultVal: string,
  gender: 'Laki-laki' | 'Perempuan',
  currentReferenceRange?: string
): 'Normal' | 'Tinggi' | 'Rendah' | 'Kritis' | 'Abnormal' {
  if (!resultVal || resultVal.trim() === '') return 'Normal';

  const rawResult = resultVal.trim();
  const lowerResult = rawResult.toLowerCase();
  const std = findClinicalStandard(paramName);
  const activeRange =
    currentReferenceRange && currentReferenceRange.trim() !== ''
      ? currentReferenceRange.trim()
      : std
      ? gender === 'Perempuan'
        ? std.rangeFemale
        : std.rangeMale
      : '';
  const lowerRange = activeRange.toLowerCase();

  // 1. Cek hasil kualitatif (Positif / Negatif / Reaktif / Non-Reaktif)
  const isNonReactiveOrNeg =
    lowerResult.includes('non-reaktif') ||
    lowerResult.includes('non reaktif') ||
    lowerResult.includes('negatif') ||
    lowerResult.includes('negative') ||
    lowerResult === 'neg' ||
    lowerResult === '-';
  const isPositiveOrReactive =
    !isNonReactiveOrNeg &&
    (lowerResult.includes('positif') ||
      lowerResult.includes('positive') ||
      lowerResult.includes('reaktif') ||
      lowerResult.includes('abnormal') ||
      /^\+\d*$/.test(lowerResult) ||
      /^\d+\+$/.test(lowerResult));

  if (isNonReactiveOrNeg) {
    if (lowerRange.includes('positif') || lowerRange.includes('positive')) {
      return 'Abnormal';
    }
    return 'Normal';
  }
  if (isPositiveOrReactive) {
    if (lowerRange.includes('positif') || lowerRange.includes('positive')) {
      return 'Normal';
    }
    return 'Abnormal';
  }

  // 2. Parse nilai numerik (mendukung koma maupun titik desimal)
  const numMatch = rawResult.replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return 'Normal';
  const rawNum = parseFloat(numMatch[0]);
  if (isNaN(rawNum)) return 'Normal';

  // Helper penyesuaian satuan ribuan untuk Leukosit/Trombosit jika rujukan dalam x10^3/µl
  const adjustForUnitScale = (val: number, maxRef?: number): number => {
    if (std?.id === 'leukosit' && val > 100 && (!maxRef || maxRef <= 50)) {
      return val / 1000;
    }
    if (std?.id === 'trombosit' && val > 1000 && (!maxRef || maxRef <= 1000)) {
      return val / 1000;
    }
    return val;
  };

  // 3. Prioritaskan evaluasi langsung terhadap Nilai Rujukan aktif (activeRange)
  if (activeRange) {
    const normalizedRange = activeRange.replace(/,/g, '.').trim();

    // Pola rentang: "min - max", "min – max", "min s/d max"
    const rangeMatch = normalizedRange.match(
      /(-?\d+(?:\.\d+)?)\s*(?:-|–|—|s\/d|sd|to)\s*(-?\d+(?:\.\d+)?)/i
    );
    if (rangeMatch) {
      const minVal = parseFloat(rangeMatch[1]);
      const maxVal = parseFloat(rangeMatch[2]);
      if (!isNaN(minVal) && !isNaN(maxVal) && minVal <= maxVal) {
        const num = adjustForUnitScale(rawNum, maxVal);
        if (num >= minVal && num <= maxVal) return 'Normal';
        if (num < minVal) {
          if (minVal > 0 && num < minVal * 0.6) return 'Kritis';
          return 'Rendah';
        }
        if (maxVal > 0 && num > maxVal * 1.8) return 'Kritis';
        return 'Tinggi';
      }
    }

    // Pola batas atas: "< 200", "<= 200", "≤ 200"
    const lessMatch = normalizedRange.match(/^(<=|≤|<)\s*(-?\d+(?:\.\d+)?)/);
    if (lessMatch) {
      const op = lessMatch[1];
      const maxVal = parseFloat(lessMatch[2]);
      if (!isNaN(maxVal)) {
        const num = adjustForUnitScale(rawNum, maxVal);
        const isNormal = op === '<' ? num < maxVal : num <= maxVal;
        if (isNormal) return 'Normal';
        if (maxVal > 0 && num > maxVal * 2.5) return 'Kritis';
        return 'Tinggi';
      }
    }

    // Pola batas bawah: "> 40", ">= 40", "≥ 40"
    const greaterMatch = normalizedRange.match(/^(>=|≥|>)\s*(-?\d+(?:\.\d+)?)/);
    if (greaterMatch) {
      const op = greaterMatch[1];
      const minVal = parseFloat(greaterMatch[2]);
      if (!isNaN(minVal)) {
        const num = adjustForUnitScale(rawNum);
        const isNormal = op === '>' ? num > minVal : num >= minVal;
        if (isNormal) return 'Normal';
        if (minVal > 0 && num < minVal * 0.6) return 'Kritis';
        return 'Rendah';
      }
    }
  }

  // 4. Fallback evaluasi menggunakan aturan standar klinis bila Nilai Rujukan tidak berisi angka
  if (std) {
    const evalRule = gender === 'Perempuan' ? std.evalFemale : std.evalMale;

    if (evalRule.isLessThan !== undefined) {
      if (rawNum < evalRule.isLessThan) return 'Normal';
      if (rawNum > evalRule.isLessThan * 2.5) return 'Kritis';
      return 'Tinggi';
    }

    if (evalRule.isGreaterThan !== undefined) {
      if (rawNum > evalRule.isGreaterThan) return 'Normal';
      if (rawNum < evalRule.isGreaterThan * 0.6) return 'Kritis';
      return 'Rendah';
    }

    if (evalRule.min !== undefined && evalRule.max !== undefined) {
      const adjustedNum = adjustForUnitScale(rawNum, evalRule.max);
      if (adjustedNum >= evalRule.min && adjustedNum <= evalRule.max) return 'Normal';
      if (adjustedNum < evalRule.min) {
        if (evalRule.min > 0 && adjustedNum < evalRule.min * 0.6) return 'Kritis';
        return 'Rendah';
      }
      if (evalRule.max > 0 && adjustedNum > evalRule.max * 1.8) return 'Kritis';
      return 'Tinggi';
    }
  }

  return 'Normal';
}

function templateItemFromStandard(
  standardId: string,
  gender: 'Laki-laki' | 'Perempuan'
): { parameter: string; unit: string; referenceRange: string } {
  const std = CLINICAL_STANDARDS.find((s) => s.id === standardId);
  if (!std) {
    return { parameter: standardId, unit: 'mg/dL', referenceRange: '' };
  }
  return {
    parameter: std.name,
    unit: std.unit,
    referenceRange: gender === 'Perempuan' ? std.rangeFemale : std.rangeMale
  };
}

/**
 * Daftar template paket lab yang otomatis disesuaikan dengan jenis kelamin
 * Dibangun langsung dari CLINICAL_STANDARDS agar 100% sinkron dengan input parameter manual.
 */
export function getGenderAdjustedTemplates(gender: 'Laki-laki' | 'Perempuan') {
  return [
    {
      name: 'Gula Darah & Lainnya',
      description: 'GDS, GDP, Asam Urat, Amilase',
      items: [
        templateItemFromStandard('gds', gender),
        templateItemFromStandard('gdp', gender),
        templateItemFromStandard('asam_urat', gender),
        templateItemFromStandard('amilase', gender)
      ]
    },
    {
      name: 'Profil Lipid',
      description: 'Kolesterol Total, HDL, LDL, Trigliserid',
      items: [
        templateItemFromStandard('kolesterol_total', gender),
        templateItemFromStandard('hdl', gender),
        templateItemFromStandard('ldl', gender),
        templateItemFromStandard('trigliserid', gender)
      ]
    },
    {
      name: 'Fungsi Ginjal & Elektrolit',
      description: 'Kreatinin, Urea, Asam Urat, Na, K, Cl',
      items: [
        templateItemFromStandard('kreatinin', gender),
        templateItemFromStandard('urea', gender),
        templateItemFromStandard('asam_urat', gender),
        templateItemFromStandard('natrium', gender),
        templateItemFromStandard('kalium', gender),
        templateItemFromStandard('klorid', gender)
      ]
    },
    {
      name: 'Fungsi Hati (LFT)',
      description: 'ALT/SGPT, AST/SGOT, Bilirubin, Protein, Albumin',
      items: [
        templateItemFromStandard('alt_sgpt', gender),
        templateItemFromStandard('ast_sgot', gender),
        templateItemFromStandard('alp', gender),
        templateItemFromStandard('ggt', gender),
        templateItemFromStandard('bilirubin_total', gender),
        templateItemFromStandard('bilirubin_direct', gender),
        templateItemFromStandard('protein_total', gender),
        templateItemFromStandard('albumin', gender)
      ]
    },
    {
      name: 'Hematologi / Darah Rutin',
      description: 'Eritrosit, Hb, Ht, Leukosit, Trombosit, LED, MCV, MCH, MCHC',
      items: [
        templateItemFromStandard('eritrosit', gender),
        templateItemFromStandard('hb', gender),
        templateItemFromStandard('ht', gender),
        templateItemFromStandard('leukosit', gender),
        templateItemFromStandard('trombosit', gender),
        templateItemFromStandard('led', gender),
        templateItemFromStandard('mcv', gender),
        templateItemFromStandard('mch', gender),
        templateItemFromStandard('mchc', gender)
      ]
    },
    {
      name: 'Hitung Jenis Leukosit (Diff Count)',
      description: 'Basofil, Eosinofil, Batang, Segmen, Limfosit, Monosit',
      items: [
        templateItemFromStandard('basofil', gender),
        templateItemFromStandard('eosinofil', gender),
        templateItemFromStandard('batang', gender),
        templateItemFromStandard('segmen', gender),
        templateItemFromStandard('limfosit', gender),
        templateItemFromStandard('monosit', gender)
      ]
    }
  ];
}
