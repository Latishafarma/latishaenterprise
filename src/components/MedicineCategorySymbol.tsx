import React from 'react';

export type MedicineSymbolKind =
  | 'obat_bebas'
  | 'obat_bebas_terbatas'
  | 'obat_keras'
  | 'psikotropika'
  | 'narkotika'
  | 'prekursor'
  | 'oot'
  | 'jamu_herbal'
  | 'vitamin_suplemen'
  | 'alkes'
  | 'makanan_minuman'
  | 'kosmetik'
  | 'skincare'
  | 'custom';

export interface MedicineCategorySymbolMeta {
  kind: MedicineSymbolKind;
  label: string;
  shortCode: string;
}

export function resolveMedicineCategoryKind(
  rawCategory?: string | null
): MedicineCategorySymbolMeta {
  const clean = String(rawCategory || '').trim();
  const lower = clean.toLowerCase();

  if (!clean) {
    return { kind: 'custom', label: 'Belum Dikategorikan', shortCode: '?' };
  }
  if (lower.includes('narkotik')) {
    return { kind: 'narkotika', label: clean, shortCode: 'N' };
  }
  if (lower.includes('psikotropik')) {
    return { kind: 'psikotropika', label: clean, shortCode: 'Ψ' };
  }
  if (lower.includes('prekursor')) {
    return { kind: 'prekursor', label: clean, shortCode: 'Pr' };
  }
  if (
    lower === 'oot' ||
    lower.includes('obat-obat tertentu') ||
    lower.includes('obat tertentu') ||
    /\boot\b/.test(lower)
  ) {
    return { kind: 'oot', label: clean, shortCode: 'OOT' };
  }
  if (lower.includes('bebas terbatas') || lower.includes('terbatas')) {
    return { kind: 'obat_bebas_terbatas', label: clean, shortCode: 'BT' };
  }
  if (lower.includes('obat bebas') || lower === 'bebas' || lower === 'otc') {
    return { kind: 'obat_bebas', label: clean, shortCode: 'B' };
  }
  if (lower.includes('keras') || lower === 'g' || lower === 'daftar g') {
    return { kind: 'obat_keras', label: clean, shortCode: 'K' };
  }
  if (
    lower.includes('jamu') ||
    lower.includes('herbal') ||
    lower.includes('oht') ||
    lower.includes('fitofarmaka')
  ) {
    return { kind: 'jamu_herbal', label: clean, shortCode: 'J' };
  }
  if (
    lower.includes('vitamin') ||
    lower.includes('suplemen') ||
    lower.includes('multivitamin')
  ) {
    return { kind: 'vitamin_suplemen', label: clean, shortCode: 'V' };
  }
  if (
    lower.includes('alat kesehatan') ||
    lower.includes('alkes') ||
    lower.includes('medis')
  ) {
    return { kind: 'alkes', label: clean, shortCode: 'AK' };
  }
  if (
    lower.includes('makanan') ||
    lower.includes('minuman') ||
    lower.includes('nutrisi') ||
    lower.includes('susu')
  ) {
    return { kind: 'makanan_minuman', label: clean, shortCode: 'MN' };
  }
  if (lower.includes('kosmet') || lower.includes('cosmet') || lower.includes('kosmetic')) {
    return { kind: 'kosmetik', label: clean, shortCode: 'Km' };
  }
  if (lower.includes('skincare') || lower.includes('skin care') || lower.includes('kulit')) {
    return { kind: 'skincare', label: clean, shortCode: 'Sc' };
  }

  const words = clean.split(/[\s\/_-]+/).filter(Boolean);
  const monogram =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`.toUpperCase()
      : clean.slice(0, 2).toUpperCase();

  return {
    kind: 'custom',
    label: clean,
    shortCode: monogram || '?'
  };
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6',
  md: 'w-7 h-7',
  lg: 'w-8 h-8'
};

interface MedicineCategorySymbolProps {
  category?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const CUSTOM_PALETTES = [
  { bg: '#e0f2fe', stroke: '#0369a1', text: '#0c4a6e' },
  { bg: '#ede9fe', stroke: '#6d28d9', text: '#4c1d95' },
  { bg: '#fef3c7', stroke: '#b45309', text: '#78350f' },
  { bg: '#ccfbf1', stroke: '#0f766e', text: '#134e4a' },
  { bg: '#fce7f3', stroke: '#be185d', text: '#831843' },
  { bg: '#e2e8f0', stroke: '#475569', text: '#1e293b' }
];

function getCustomPalette(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return CUSTOM_PALETTES[Math.abs(hash) % CUSTOM_PALETTES.length];
}

export const MedicineCategorySymbol: React.FC<MedicineCategorySymbolProps> = React.memo(
  ({ category, size = 'md', className = '' }) => {
    const meta = resolveMedicineCategoryKind(category);
    const sizeCls = SIZE_CLASSES[size];
    const ariaLabel = `Golongan / Kategori: ${meta.label}`;

    const renderSvgContent = () => {
      switch (meta.kind) {
        case 'obat_bebas':
          // Lingkaran hijau solid dengan garis tepi hitam (Standar BPOM Obat Bebas)
          return (
            <>
              <circle
                cx="16"
                cy="16"
                r="12.5"
                fill="#22c55e"
                stroke="#0f172a"
                strokeWidth="2.6"
              />
              <circle cx="12" cy="11.5" r="2.2" fill="#86efac" opacity="0.55" />
            </>
          );

        case 'obat_bebas_terbatas':
          // Lingkaran biru solid dengan garis tepi hitam (Standar BPOM Obat Bebas Terbatas)
          return (
            <>
              <circle
                cx="16"
                cy="16"
                r="12.5"
                fill="#2563eb"
                stroke="#0f172a"
                strokeWidth="2.6"
              />
              <circle cx="12" cy="11.5" r="2.2" fill="#93c5fd" opacity="0.5" />
            </>
          );

        case 'obat_keras':
          // Lingkaran merah solid dengan garis tepi hitam dan huruf "K" hitam (Standar BPOM Obat Keras)
          return (
            <>
              <circle
                cx="16"
                cy="16"
                r="12.5"
                fill="#ef4444"
                stroke="#0f172a"
                strokeWidth="2.6"
              />
              <text
                x="16"
                y="21.5"
                textAnchor="middle"
                fill="#0f172a"
                fontSize="16.5"
                fontWeight="900"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                K
              </text>
            </>
          );

        case 'narkotika':
          // Lingkaran putih dengan palang merah (+) & tepi tegas (Standar BPOM Narkotika)
          return (
            <>
              <circle
                cx="16"
                cy="16"
                r="12.5"
                fill="#ffffff"
                stroke="#dc2626"
                strokeWidth="2.6"
              />
              <path
                d="M13.3 7.5h5.4v5.8h5.8v5.4h-5.8v5.8h-5.4v-5.8H7.5v-5.4h5.8V7.5z"
                fill="#dc2626"
                stroke="#0f172a"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </>
          );

        case 'psikotropika':
          // Lingkaran ungu dengan tepi hitam dan simbol Psi (Ψ)
          return (
            <>
              <circle
                cx="16"
                cy="16"
                r="12.5"
                fill="#7c3aed"
                stroke="#0f172a"
                strokeWidth="2.6"
              />
              <text
                x="16"
                y="21.5"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="16"
                fontWeight="900"
                fontFamily="Georgia, serif"
              >
                Ψ
              </text>
            </>
          );

        case 'prekursor':
          // Heksagon oranye dengan tepi hitam dan penanda "Pr"
          return (
            <>
              <polygon
                points="16,2.8 27.6,9.4 27.6,22.6 16,29.2 4.4,22.6 4.4,9.4"
                fill="#f97316"
                stroke="#0f172a"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
              <text
                x="16"
                y="20.2"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="12.5"
                fontWeight="900"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                Pr
              </text>
            </>
          );

        case 'oot':
          // Oktagon kuning/amber dengan tepi hitam dan penanda "OOT"
          return (
            <>
              <polygon
                points="10.8,3.2 21.2,3.2 28.8,10.8 28.8,21.2 21.2,28.8 10.8,28.8 3.2,21.2 3.2,10.8"
                fill="#facc15"
                stroke="#0f172a"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
              <text
                x="16"
                y="19.5"
                textAnchor="middle"
                fill="#0f172a"
                fontSize="9.8"
                fontWeight="900"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                OOT
              </text>
            </>
          );

        case 'jamu_herbal':
          // Lingkaran hijau muda dengan ranting daun herbal (terinspirasi simbol Jamu/Herbal)
          return (
            <>
              <circle
                cx="16"
                cy="16"
                r="12.5"
                fill="#ecfdf5"
                stroke="#15803d"
                strokeWidth="2.4"
              />
              <path
                d="M10 22c6.5 0 11.5-4.5 12-12-7.5.5-12 5.5-12 12z"
                fill="#16a34a"
              />
              <path
                d="M10.5 21.5L18.5 13.5"
                stroke="#ecfdf5"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </>
          );

        case 'vitamin_suplemen':
          // Badge perisai/lingkaran emas dengan kapsul vitamin
          return (
            <>
              <rect
                x="3.5"
                y="3.5"
                width="25"
                height="25"
                rx="8"
                fill="#fef3c7"
                stroke="#d97706"
                strokeWidth="2.4"
              />
              <g transform="rotate(-40 16 16)">
                <rect x="11.5" y="7.5" width="9" height="17" rx="4.5" fill="#f59e0b" stroke="#92400e" strokeWidth="1.4" />
                <path d="M11.5 16h9" stroke="#92400e" strokeWidth="1.4" />
                <rect x="12.2" y="8.2" width="7.6" height="7.5" rx="3.8" fill="#fef08a" />
              </g>
            </>
          );

        case 'alkes':
          // Kotak bulat biru langit dengan palang/simbol Alat Kesehatan
          return (
            <>
              <rect
                x="3.5"
                y="3.5"
                width="25"
                height="25"
                rx="7"
                fill="#e0f2fe"
                stroke="#0284c7"
                strokeWidth="2.4"
              />
              <rect x="9" y="11" width="14" height="11" rx="2" fill="#0284c7" />
              <path
                d="M13 11V9.5a1 1 0 011-1h4a1 1 0 011 1V11"
                fill="none"
                stroke="#0284c7"
                strokeWidth="1.8"
              />
              <path
                d="M16 13.5v6M13 16.5h6"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          );

        case 'makanan_minuman':
          // Lencana teal dengan gelas nutrisi / makanan & minuman
          return (
            <>
              <rect
                x="3.5"
                y="3.5"
                width="25"
                height="25"
                rx="12.5"
                fill="#ccfbf1"
                stroke="#0d9488"
                strokeWidth="2.4"
              />
              <path
                d="M10.5 13h11l-1.3 8.5a1.5 1.5 0 01-1.5 1.3h-5.4a1.5 1.5 0 01-1.5-1.3L10.5 13z"
                fill="#0d9488"
              />
              <path
                d="M16 13l2.5-4.2"
                stroke="#0f766e"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          );

        case 'kosmetik':
          // Berlian / kotak merah muda untuk Kosmetik
          return (
            <>
              <rect
                x="3.5"
                y="3.5"
                width="25"
                height="25"
                rx="8"
                fill="#fdf2f8"
                stroke="#db2777"
                strokeWidth="2.4"
              />
              <path
                d="M16 7.5l2.2 6.3L24.5 16l-6.3 2.2L16 24.5l-2.2-6.3L7.5 16l6.3-2.2L16 7.5z"
                fill="#ec4899"
              />
            </>
          );

        case 'skincare':
          // Tetesan air perawatan kulit (Skincare) indigo
          return (
            <>
              <rect
                x="3.5"
                y="3.5"
                width="25"
                height="25"
                rx="8"
                fill="#eef2ff"
                stroke="#4f46e5"
                strokeWidth="2.4"
              />
              <path
                d="M16 7.5c3.5 4.8 6 8 6 11a6 6 0 11-12 0c0-3 2.5-6.2 6-11z"
                fill="#6366f1"
              />
              <circle cx="14.2" cy="18.2" r="1.4" fill="#e0e7ff" />
            </>
          );

        case 'custom':
        default: {
          const palette = getCustomPalette(meta.label);
          return (
            <>
              <rect
                x="3.5"
                y="3.5"
                width="25"
                height="25"
                rx="7"
                fill={palette.bg}
                stroke={palette.stroke}
                strokeWidth="2.4"
              />
              <text
                x="16"
                y="20.2"
                textAnchor="middle"
                fill={palette.text}
                fontSize={meta.shortCode.length >= 2 ? '11' : '14'}
                fontWeight="900"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {meta.shortCode}
              </text>
            </>
          );
        }
      }
    };

    return (
      <span
        role="img"
        aria-label={ariaLabel}
        title={meta.label}
        className={`inline-flex items-center justify-center shrink-0 select-none ${sizeCls} ${className}`}
      >
        <svg
          viewBox="0 0 32 32"
          className="w-full h-full drop-shadow-[0_1px_1px_rgba(15,23,42,0.12)]"
          aria-hidden="true"
        >
          <title>{meta.label}</title>
          {renderSvgContent()}
        </svg>
      </span>
    );
  }
);

MedicineCategorySymbol.displayName = 'MedicineCategorySymbol';
