import { CompoundIngredientItem, Medicine } from '../types';

export type RacikanBudType = 'Puyer' | 'Kapsul Racikan' | 'Salep Racikan' | 'Sirup Racikan';

export interface RacikanBudResult {
  budDate: string; // ISO YYYY-MM-DD
  earliestExpDate: string; // ISO YYYY-MM-DD
  earliestMedName: string;
  remainingMonths: number;
  budMonthsApplied?: number;
  isManual: boolean;
  ruleDescription: string;
}

export function parseFlexibleExpDate(raw?: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-') return null;

  // YYYY-MM-DD
  let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  // YYYY-MM (assume end of month)
  m = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]); // 1-indexed next month, day 0 = last day of target month
    const dt = new Date(y, mo, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  m = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateDDMMYYYY(raw?: string): string {
  if (!raw) return '';
  const dt = parseFlexibleExpDate(raw);
  if (!dt) return raw;
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}-${m}-${y}`;
}

export function addCalendarMonths(baseDate: Date, months: number): Date {
  const targetYear = baseDate.getFullYear();
  const targetMonth = baseDate.getMonth() + months;
  const day = baseDate.getDate();
  const firstOfTarget = new Date(targetYear, targetMonth, 1);
  const lastDayOfTarget = new Date(
    firstOfTarget.getFullYear(),
    firstOfTarget.getMonth() + 1,
    0
  ).getDate();
  return new Date(
    firstOfTarget.getFullYear(),
    firstOfTarget.getMonth(),
    Math.min(day, lastDayOfTarget)
  );
}

export function resolveMedicineEarliestExpDate(
  med?: Medicine,
  fallbackExpDate?: string
): string {
  if (med?.batches && med.batches.length > 0) {
    const activeBatches = med.batches
      .filter((b) => Number(b.stock) > 0 && Boolean(b.expDate))
      .map((b) => ({ raw: b.expDate, dt: parseFlexibleExpDate(b.expDate) }))
      .filter((x): x is { raw: string; dt: Date } => Boolean(x.dt))
      .sort((a, b) => a.dt.getTime() - b.dt.getTime());
    if (activeBatches.length > 0) {
      return formatDateISO(activeBatches[0].dt);
    }

    const anyBatches = med.batches
      .filter((b) => Boolean(b.expDate))
      .map((b) => ({ raw: b.expDate, dt: parseFlexibleExpDate(b.expDate) }))
      .filter((x): x is { raw: string; dt: Date } => Boolean(x.dt))
      .sort((a, b) => a.dt.getTime() - b.dt.getTime());
    if (anyBatches.length > 0) {
      return formatDateISO(anyBatches[0].dt);
    }
  }

  const parsedMed = parseFlexibleExpDate(med?.expDate);
  if (parsedMed) return formatDateISO(parsedMed);

  const parsedFallback = parseFlexibleExpDate(fallbackExpDate);
  if (parsedFallback) return formatDateISO(parsedFallback);

  return '';
}

export function calculateRacikanBud(
  racikanType: RacikanBudType | string | undefined,
  ingredients: CompoundIngredientItem[] = [],
  medicines: Medicine[] = [],
  referenceDate: Date = new Date()
): RacikanBudResult {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  let earliestDate: Date | null = null;
  let earliestMedName = '';

  for (const ing of ingredients) {
    const matchedMed = medicines.find((m) => m.id === ing.medicineId);
    const resolvedStr = resolveMedicineEarliestExpDate(matchedMed, ing.expDate);
    const parsed = parseFlexibleExpDate(resolvedStr);
    if (parsed && (!earliestDate || parsed.getTime() < earliestDate.getTime())) {
      earliestDate = parsed;
      earliestMedName = ing.name || matchedMed?.name || '';
    }
  }

  const normalizedType = (racikanType || 'Puyer') as RacikanBudType;
  const isManual = normalizedType === 'Sirup Racikan';
  const earliestExpISO = earliestDate ? formatDateISO(earliestDate) : '';

  if (isManual) {
    return {
      budDate: '',
      earliestExpDate: earliestExpISO,
      earliestMedName,
      remainingMonths: earliestDate
        ? Math.max(
            0,
            Math.round(
              (earliestDate.getFullYear() - today.getFullYear()) * 12 +
                (earliestDate.getMonth() - today.getMonth()) +
                (earliestDate.getDate() - today.getDate()) / 30
            )
          )
        : 0,
      isManual: true,
      ruleDescription: earliestExpISO
        ? `Sirup / Larutan: input tanggal BUD manual oleh petugas (ED terdekat bahan: ${formatDateDDMMYYYY(
            earliestExpISO
          )}).`
        : 'Sirup / Larutan: input tanggal BUD manual oleh petugas.'
    };
  }

  if (!earliestDate) {
    return {
      budDate: '',
      earliestExpDate: '',
      earliestMedName: '',
      remainingMonths: 0,
      isManual: false,
      ruleDescription:
        'Tambahkan bahan obat untuk menghitung BUD otomatis dari ED terdekat.'
    };
  }

  const rawMonthDiff =
    (earliestDate.getFullYear() - today.getFullYear()) * 12 +
    (earliestDate.getMonth() - today.getMonth()) +
    (earliestDate.getDate() - today.getDate()) / 30;
  const remainingMonths = Math.max(0, Math.round(rawMonthDiff));

  if (normalizedType === 'Salep Racikan') {
    const oneMonthLimit = addCalendarMonths(today, 1);
    if (earliestDate.getTime() > oneMonthLimit.getTime()) {
      const budISO = formatDateISO(oneMonthLimit);
      return {
        budDate: budISO,
        earliestExpDate: earliestExpISO,
        earliestMedName,
        remainingMonths,
        budMonthsApplied: 1,
        isManual: false,
        ruleDescription: `Salep/Krim: ED terdekat (${formatDateDDMMYYYY(
          earliestExpISO
        )}) > 1 bulan → BUD otomatis 1 bulan (${formatDateDDMMYYYY(budISO)}).`
      };
    }

    return {
      budDate: earliestExpISO,
      earliestExpDate: earliestExpISO,
      earliestMedName,
      remainingMonths,
      isManual: false,
      ruleDescription: `Salep/Krim: ED terdekat (${formatDateDDMMYYYY(
        earliestExpISO
      )}) ≤ 1 bulan → BUD mengikuti tanggal ED (${formatDateDDMMYYYY(earliestExpISO)}).`
    };
  }

  // Puyer (serbuk bagi) & Kapsul Racikan
  const sixMonthsLimit = addCalendarMonths(today, 6);
  if (earliestDate.getTime() > sixMonthsLimit.getTime()) {
    const effectiveMonths = Math.max(7, remainingMonths);
    const budMonths = Math.max(1, Math.ceil(effectiveMonths * 0.25));
    let computedBud = addCalendarMonths(today, budMonths);
    if (computedBud.getTime() > earliestDate.getTime()) {
      computedBud = earliestDate;
    }
    const budISO = formatDateISO(computedBud);
    return {
      budDate: budISO,
      earliestExpDate: earliestExpISO,
      earliestMedName,
      remainingMonths: effectiveMonths,
      budMonthsApplied: budMonths,
      isManual: false,
      ruleDescription: `${normalizedType}: ED terdekat (${formatDateDDMMYYYY(
        earliestExpISO
      )}) = ${effectiveMonths} bulan (> 6 bln) → 25% × ${effectiveMonths} bln = ${budMonths} bln → BUD ${formatDateDDMMYYYY(
        budISO
      )}.`
    };
  }

  return {
    budDate: earliestExpISO,
    earliestExpDate: earliestExpISO,
    earliestMedName,
    remainingMonths,
    isManual: false,
    ruleDescription: `${normalizedType}: ED terdekat (${formatDateDDMMYYYY(
      earliestExpISO
    )}) ≤ 6 bulan → BUD mengikuti tanggal ED (${formatDateDDMMYYYY(earliestExpISO)}).`
  };
}
