import React, { useState } from 'react';
import {
  TrendingUp,
  Boxes,
  Users,
  FileCheck2,
  AlertTriangle,
  Receipt,
  Stethoscope,
  Volume2,
  Globe,
  ArrowRight,
  ShieldCheck,
  Building2,
  Activity,
  AlertCircle,
  Clock,
  RotateCcw,
  Tag,
  Sparkles,
  ExternalLink,
  BookOpen,
  CheckCircle2,
  Calendar,
  BarChart3
} from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Legend
} from 'recharts';
import { Transaction, Medicine, PatientQueue, EPrescription, Branch } from '../types';
import { useFacilityProfiles } from '../utils/facilityProfileHelper';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';

interface DashboardViewProps {
  transactions: Transaction[];
  medicines: Medicine[];
  queue: PatientQueue[];
  prescriptions: EPrescription[];
  currentBranch: Branch;
  onNavigateTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  transactions,
  medicines,
  queue,
  prescriptions,
  currentBranch,
  onNavigateTab
}) => {
  const { pharmacyProfile } = useFacilityProfiles();
  const [edFilter, setEdFilter] = useState<'all' | 'critical' | 'expired'>('all');
  const [revenueRangeDays, setRevenueRangeDays] = useState<7 | 14 | 30>(14);
  const [revenueChartMode, setRevenueChartMode] = useState<'bar' | 'area'>('bar');

  const totalRevenue = transactions.reduce((acc, t) => acc + t.total, 0);
  const totalProfit = transactions.reduce((acc, t) => acc + (t.profit || 0), 0);
  const lowStockCount = medicines.filter((m) => m.stock <= m.minStock).length;
  const pendingRx = prescriptions.filter((p) => p.status === 'Pending Skrining').length;
  const totalAssetHpp = medicines.reduce((acc, m) => acc + m.stock * m.hpp, 0);

  // =========================================================================
  // MODUL 0: PERBANDINGAN PENDAPATAN HARIAN (REGULER vs KLINIK vs MITRA)
  // =========================================================================
  const toLocalYMD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const normalizeDateToYMD = (rawDate?: string): string => {
    if (!rawDate) return '';
    const trimmed = rawDate.trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return toLocalYMD(parsed);
    }
    return trimmed.split(' ')[0].split('T')[0];
  };

  const dailyRevenueComparison = React.useMemo(() => {
    const todayDate = new Date();
    const buckets: Array<{
      dateKey: string;
      label: string;
      fullDateLabel: string;
      reguler: number;
      klinik: number;
      mitra: number;
      total: number;
      trxCount: number;
    }> = [];
    const bucketMap = new Map<string, (typeof buckets)[number]>();

    for (let i = revenueRangeDays - 1; i >= 0; i--) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      const dateKey = toLocalYMD(d);
      const bucket = {
        dateKey,
        label: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        fullDateLabel: d.toLocaleDateString('id-ID', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }),
        reguler: 0,
        klinik: 0,
        mitra: 0,
        total: 0,
        trxCount: 0
      };
      buckets.push(bucket);
      bucketMap.set(dateKey, bucket);
    }

    let sumReguler = 0;
    let sumKlinik = 0;
    let sumMitra = 0;
    let countReguler = 0;
    let countKlinik = 0;
    let countMitra = 0;

    transactions.forEach((t) => {
      if (t.status === 'Dibatalkan' || t.status === 'Diretur') return;
      const dateKey = normalizeDateToYMD(t.date);
      const target = bucketMap.get(dateKey);
      if (!target) return;

      const amount = Number(t.total) || 0;
      const trxType = (t.type || 'REGULER').toUpperCase();

      if (trxType === 'KLINIK') {
        target.klinik += amount;
        sumKlinik += amount;
        countKlinik += 1;
      } else if (trxType === 'FAKTUR_PENJUALAN' || trxType === 'MITRA') {
        target.mitra += amount;
        sumMitra += amount;
        countMitra += 1;
      } else {
        target.reguler += amount;
        sumReguler += amount;
        countReguler += 1;
      }
      target.total += amount;
      target.trxCount += 1;
    });

    const periodTotal = sumReguler + sumKlinik + sumMitra;
    return {
      series: buckets,
      sumReguler,
      sumKlinik,
      sumMitra,
      countReguler,
      countKlinik,
      countMitra,
      periodTotal
    };
  }, [transactions, revenueRangeDays]);

  const formatCompactRupiah = (val: number): string => {
    const abs = Math.abs(val);
    if (abs >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1).replace('.', ',')}M`;
    if (abs >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1).replace('.', ',')}jt`;
    if (abs >= 1_000) return `Rp ${Math.round(val / 1_000)}rb`;
    return `Rp ${val}`;
  };

  const CustomRevenueTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload;
    if (!row) return null;

    return (
      <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs min-w-[230px] space-y-2">
        <div className="flex items-center justify-between gap-3 border-b border-slate-700/80 pb-1.5">
          <span className="font-bold text-slate-100">{row.fullDateLabel}</span>
          <span className="font-mono tabular-nums text-[10px] text-slate-400">
            {row.trxCount} transaksi
          </span>
        </div>
        <div className="space-y-1.5 font-mono tabular-nums text-[11px]">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-sans text-slate-300">
              <span className="w-2.5 h-2.5 rounded-xs bg-green-500 shrink-0" />
              Penjualan Reguler
            </span>
            <strong className="text-green-400">Rp {row.reguler.toLocaleString('id-ID')}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-sans text-slate-300">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-500 shrink-0" />
              Penjualan Klinik
            </span>
            <strong className="text-red-400">Rp {row.klinik.toLocaleString('id-ID')}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-sans text-slate-300">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 shrink-0" />
              Faktur Penjualan Mitra
            </span>
            <strong className="text-blue-400">Rp {row.mitra.toLocaleString('id-ID')}</strong>
          </div>
        </div>
        <div className="pt-1.5 border-t border-slate-700/80 flex items-center justify-between font-mono tabular-nums">
          <span className="font-sans font-bold text-slate-200">Total Pendapatan</span>
          <strong className="text-white text-xs">Rp {row.total.toLocaleString('id-ID')}</strong>
        </div>
      </div>
    );
  };

  // =========================================================================
  // MODUL 1: NOTIFIKASI OTOMATIS OBAT KEDALUWARSA (< 3 BULAN / 90 HARI)
  // =========================================================================
  const now = new Date();
  const nearExpMedicines = medicines
    .map((m) => {
      const expDateObj = new Date(m.expDate);
      const diffMs = expDateObj.getTime() - now.getTime();
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const valueLossHpp = m.stock * m.hpp;
      return {
        ...m,
        daysLeft,
        valueLossHpp,
        isExpired: daysLeft <= 0,
        isCritical: daysLeft > 0 && daysLeft <= 30,
        isWarning: daysLeft > 30 && daysLeft <= 90
      };
    })
    .filter((m) => m.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const totalLossHpp = nearExpMedicines.reduce((acc, m) => acc + m.valueLossHpp, 0);
  const expiredCount = nearExpMedicines.filter((m) => m.daysLeft <= 0).length;
  const criticalCount = nearExpMedicines.filter((m) => m.daysLeft > 0 && m.daysLeft <= 30).length;
  const warningCount = nearExpMedicines.filter((m) => m.daysLeft > 30 && m.daysLeft <= 90).length;

  const filteredExpMedicines = nearExpMedicines.filter((m) => {
    if (edFilter === 'expired') return m.daysLeft <= 0;
    if (edFilter === 'critical') return m.daysLeft > 0 && m.daysLeft <= 30;
    return true;
  });

  // =========================================================================
  // MODUL 2: TREN INTERAKSI OBAT & DRP BERDASARKAN DATA REAL PRESCRIPTIONS
  // =========================================================================
  let adminErrorCount = 0;
  let farmasetikErrorCount = 0;
  let ddiCount = 0;
  let kontraindikasiCount = 0;
  let duplikasiCount = 0;
  let gantiRxCount = 0;
  let ditolakCount = 0;
  let lolosCount = 0;

  prescriptions.forEach((p) => {
    const checks = p.screeningChecks;
    const notes = (p.screeningNotes || '').toLowerCase();
    const status = (p.status || '').toLowerCase();

    // Administrative check errors (when any admin check is false)
    if (checks?.admin) {
      if (!checks.admin.namaDokter || !checks.admin.sip || !checks.admin.tglResep || !checks.admin.paraf) {
        adminErrorCount++;
      }
    }

    // Pharmaceutical check errors (when any pharmaceutical check is false)
    if (checks?.farmasetik) {
      if (!checks.farmasetik.bentukSediaan || !checks.farmasetik.dosis || !checks.farmasetik.stabilitas || !checks.farmasetik.kompatibilitas) {
        farmasetikErrorCount++;
      }
    }

    if (notes.includes('interaksi') || notes.includes('ddi') || notes.includes('severity') || notes.includes('major') || notes.includes('moderate')) {
      ddiCount++;
    }
    if (notes.includes('kontraindikasi') || notes.includes('contraindicated')) {
      kontraindikasiCount++;
    }
    if (notes.includes('duplikasi') || notes.includes('duplication')) {
      duplikasiCount++;
    }
    if (status.includes('ganti rx') || status.includes('konfirmasi')) {
      gantiRxCount++;
    }
    if (status.includes('ditolak') || status.includes('ada drps')) {
      ditolakCount++;
    }
    if (status.includes('lolos') || status.includes('diterima') || status.includes('selesai')) {
      lolosCount++;
    }
  });

  const drpTrendData = [
    {
      name: 'Penilaian Administrasi (Tidak Lengkap)',
      shortName: 'Admin Kurang',
      count: adminErrorCount,
      severity: 'Sedang',
      color: '#f59e0b',
      mechanism: 'Ketidaklengkapan komponen administratif resep (Nama dokter, SIP, tanggal, atau paraf).',
      recommendation: 'Konfirmasi kepada dokter peresep untuk melengkapi informasi administratif resep.',
      reference: 'Permenkes No. 73 Tahun 2016',
      referenceUrl: 'https://pionas.pom.go.id/'
    },
    {
      name: 'Penilaian Farmasetik (Tidak Sesuai)',
      shortName: 'Farmasetik Kurang',
      count: farmasetikErrorCount,
      severity: 'Sedang',
      color: '#f97316',
      mechanism: 'Ketidaksesuaian bentuk sediaan, kekuatan, stabilitas, atau kompatibilitas obat.',
      recommendation: 'Lakukan penyesuaian sediaan atau konsultasi farmasetik.',
      reference: 'Standar Pelayanan Kefarmasian di Apotek',
      referenceUrl: 'https://pionas.pom.go.id/'
    },
    {
      name: 'Interaksi Obat (DDI)',
      shortName: 'Interaksi DDI',
      count: ddiCount,
      severity: 'Major',
      color: '#eab308',
      mechanism: 'Potensi interaksi farmakokinetik atau farmakodinamik antar obat dalam resep.',
      recommendation: 'Lakukan penyesuaian dosis, pemantauan klinis, atau penggantian obat.',
      reference: 'BNF 86 & Database interaksi_obat Supabase',
      referenceUrl: 'https://pionas.pom.go.id/'
    },
    {
      name: 'Kontraindikasi',
      shortName: 'Kontraindikasi',
      count: kontraindikasiCount,
      severity: 'Kritis',
      color: '#dc2626',
      mechanism: 'Kombinasi atau indikasi obat yang dikontraindikasikan dengan kondisi pasien.',
      recommendation: 'Hentikan segera dan ganti dengan terapi alternatif yang aman.',
      reference: 'Lexicomp & Pedoman Klinis Kemenkes',
      referenceUrl: 'https://pionas.pom.go.id/'
    },
    {
      name: 'Duplikasi Terapi',
      shortName: 'Duplikasi Terapi',
      count: duplikasiCount,
      severity: 'Sedang',
      color: '#38bdf8',
      mechanism: 'Pemberian dua atau lebih obat dengan kelas farmakologis yang sama.',
      recommendation: 'Hentikan duplikasi dan berikan monoterapi.',
      reference: 'BPOM PIONAS',
      referenceUrl: 'https://pionas.pom.go.id/'
    },
    {
      name: 'Ganti Rx (Konfirmasi Dokter)',
      shortName: 'Ganti Rx',
      count: gantiRxCount,
      severity: 'Sedang',
      color: '#6366f1',
      mechanism: 'Perlu konfirmasi ulang ke dokter peresep terkait dosis, aturan pakai, atau DRP.',
      recommendation: 'Hubungi dokter peresep untuk klarifikasi dan revisi resep.',
      reference: 'Standar Pelayanan Kefarmasian',
      referenceUrl: 'https://pionas.pom.go.id/'
    },
    {
      name: 'Ditolak (Ada DRPs)',
      shortName: 'Ditolak DRPs',
      count: ditolakCount,
      severity: 'Kritis',
      color: '#e11d48',
      mechanism: 'Resep ditolak karena DRPs berat atau ketidakpatuhan standar keselamatan pasien.',
      recommendation: 'Tolak resep dan berikan lembar konseling farmasis.',
      reference: 'Permenkes No. 73 Tahun 2016',
      referenceUrl: 'https://pionas.pom.go.id/'
    }
  ];

  const totalDrpThisMonth = drpTrendData.reduce((acc, item) => acc + item.count, 0);

  // Custom Tooltip Recharts
  const CustomDrpTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs max-w-xs space-y-1.5 animate-in fade-in">
          <div className="flex justify-between items-center gap-2">
            <span className="font-extrabold text-sm text-amber-300">{data.name}</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase text-white ${
                data.severity === 'Kritis' ? 'bg-rose-600' : 'bg-amber-500'
              }`}
            >
              {data.severity}
            </span>
          </div>
          <div className="text-slate-300">
            Frekuensi Terdeteksi: <strong className="text-white font-mono">{data.count} Kasus</strong> bulan ini
          </div>
          <p className="text-[11px] text-slate-300 leading-tight">
            <strong>Mekanisme:</strong> {data.mechanism}
          </p>
          <div className="pt-1 border-t border-slate-800 text-[10px] text-sky-300 font-mono flex items-center gap-1">
            <BookOpen className="w-3 h-3 text-sky-400 shrink-0" />
            <span>Ref: {data.reference}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-md flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">
              Sistem Terpadu Aktif
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
            Dashboard Manajemen {pharmacyProfile.name?.trim() || 'Apotek & Klinik Latisha Farma'}
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Lokasi Aktif: <strong className="text-white">{currentBranch.name}</strong> · Sinkronisasi Real-Time Multi-Cabang Berjalan Normal
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateTab('fo-antrean')}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
            <span>Layar Antrean Suara</span>
          </button>
          <button
            onClick={() => onNavigateTab('pos-kasir')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Receipt className="w-4 h-4" />
            <span>Kasir POS Farmasi</span>
          </button>
        </div>
      </div>

      {/* 4 Top KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Total Omzet Penjualan
          </span>
          <div className="font-mono font-black text-2xl text-slate-900 mt-1">
            Rp {totalRevenue.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-emerald-600 font-bold mt-1 block">
            ✓ {transactions.length} Struk Terbayar
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Estimasi Laba Kotor (Profit)
          </span>
          <div className="font-mono font-black text-2xl text-emerald-600 mt-1">
            Rp {totalProfit.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">
            Margin Penjualan Farmasi
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Pasien Antrean Hari Ini
          </span>
          <div className="font-mono font-black text-2xl text-sky-800 mt-1">
            {queue.length} Pasien
          </div>
          <span className="text-[11px] text-sky-600 font-bold mt-1 block">
            {queue.filter((q) => q.status === 'Menunggu').length} Menunggu Diperiksa
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Valuasi Stok Inventaris (HPP)
          </span>
          <div className="font-mono font-black text-2xl text-slate-900 mt-1">
            Rp {totalAssetHpp.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">
            {medicines.length} Produk Master Obat
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* GRAFIK PERBANDINGAN PENDAPATAN HARIAN (REGULER, KLINIK, FAKTUR MITRA)    */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-700 shrink-0" />
              <h3 className="font-bold text-base text-slate-900 tracking-tight">
                Perbandingan Pendapatan Harian per Kanal Penjualan
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Pemantauan omzet harian transaksi selesai antara Penjualan Reguler, Penjualan Klinik, dan Faktur Penjualan Mitra ({revenueRangeDays} hari terakhir).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              {([7, 14, 30] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setRevenueRangeDays(days)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                    revenueRangeDays === days
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {days} Hari
                </button>
              ))}
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setRevenueChartMode('bar')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                  revenueChartMode === 'bar'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Grafik Batang
              </button>
              <button
                type="button"
                onClick={() => setRevenueChartMode('area')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                  revenueChartMode === 'area'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tren Area
              </button>
            </div>
          </div>
        </div>

        {/* Ringkasan Akumulasi Periode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-slate-100 text-xs">
          <div className="space-y-1">
            <span className="text-slate-500 font-semibold block">
              Total Pendapatan ({revenueRangeDays} Hari)
            </span>
            <div className="font-mono tabular-nums font-black text-lg text-slate-900">
              Rp {dailyRevenueComparison.periodTotal.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              {dailyRevenueComparison.countReguler +
                dailyRevenueComparison.countKlinik +
                dailyRevenueComparison.countMitra}{' '}
              transaksi aktif
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-600 font-semibold flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-green-600 shrink-0" />
              Penjualan Reguler
            </span>
            <div className="font-mono tabular-nums font-black text-lg text-green-700">
              Rp {dailyRevenueComparison.sumReguler.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              {dailyRevenueComparison.countReguler} trx ·{' '}
              {dailyRevenueComparison.periodTotal > 0
                ? `${Math.round((dailyRevenueComparison.sumReguler / dailyRevenueComparison.periodTotal) * 100)}%`
                : '0%'}{' '}
              porsi omzet
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-600 font-semibold flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-600 shrink-0" />
              Penjualan Klinik
            </span>
            <div className="font-mono tabular-nums font-black text-lg text-red-700">
              Rp {dailyRevenueComparison.sumKlinik.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              {dailyRevenueComparison.countKlinik} trx ·{' '}
              {dailyRevenueComparison.periodTotal > 0
                ? `${Math.round((dailyRevenueComparison.sumKlinik / dailyRevenueComparison.periodTotal) * 100)}%`
                : '0%'}{' '}
              porsi omzet
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-600 font-semibold flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 shrink-0" />
              Faktur Penjualan Mitra
            </span>
            <div className="font-mono tabular-nums font-black text-lg text-blue-700">
              Rp {dailyRevenueComparison.sumMitra.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              {dailyRevenueComparison.countMitra} trx ·{' '}
              {dailyRevenueComparison.periodTotal > 0
                ? `${Math.round((dailyRevenueComparison.sumMitra / dailyRevenueComparison.periodTotal) * 100)}%`
                : '0%'}{' '}
              porsi omzet
            </div>
          </div>
        </div>

        {/* Chart Area */}
        {dailyRevenueComparison.periodTotal === 0 ? (
          <div className="py-12 px-6 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <p className="font-bold text-slate-800 text-sm">
              Belum ada transaksi pendapatan dalam {revenueRangeDays} hari terakhir
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Grafik perbandingan harian otomatis terisi saat ada transaksi kasir Reguler, Klinik, maupun Faktur Penjualan Mitra yang berstatus selesai.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigateTab('pos-kasir')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Buka Kasir POS
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('pos-riwayat')}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Buat Faktur Penjualan Mitra
              </button>
            </div>
          </div>
        ) : (
          <div className="h-[320px] w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              {revenueChartMode === 'bar' ? (
                <BarChart
                  data={dailyRevenueComparison.series}
                  margin={{ top: 10, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    minTickGap={revenueRangeDays === 30 ? 14 : 4}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={68}
                    tickFormatter={formatCompactRupiah}
                  />
                  <Tooltip content={<CustomRevenueTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '10px', fontWeight: 600 }}
                    iconType="square"
                  />
                  <Bar
                    dataKey="reguler"
                    name="Penjualan Reguler"
                    fill="#16a34a"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={24}
                  />
                  <Bar
                    dataKey="klinik"
                    name="Penjualan Klinik"
                    fill="#dc2626"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={24}
                  />
                  <Bar
                    dataKey="mitra"
                    name="Faktur Penjualan Mitra"
                    fill="#2563eb"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              ) : (
                <AreaChart
                  data={dailyRevenueComparison.series}
                  margin={{ top: 10, right: 16, left: 8, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="revRegulerGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="revKlinikGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.26} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="revMitraGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    minTickGap={revenueRangeDays === 30 ? 14 : 4}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={68}
                    tickFormatter={formatCompactRupiah}
                  />
                  <Tooltip content={<CustomRevenueTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '10px', fontWeight: 600 }}
                    iconType="square"
                  />
                  <Area
                    type="monotone"
                    dataKey="reguler"
                    name="Penjualan Reguler"
                    stroke="#16a34a"
                    strokeWidth={2.2}
                    fill="url(#revRegulerGrad)"
                    activeDot={{ r: 5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="klinik"
                    name="Penjualan Klinik"
                    stroke="#dc2626"
                    strokeWidth={2.2}
                    fill="url(#revKlinikGrad)"
                    activeDot={{ r: 5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="mitra"
                    name="Faktur Penjualan Mitra"
                    stroke="#2563eb"
                    strokeWidth={2.2}
                    fill="url(#revMitraGrad)"
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            Tidak termasuk transaksi berstatus dibatalkan atau diretur.
          </span>
          <button
            type="button"
            onClick={() => onNavigateTab('keuangan-labarugi')}
            className="text-slate-800 hover:text-sky-700 font-bold inline-flex items-center gap-1 cursor-pointer transition"
          >
            <span>Lihat Analisis Laba Rugi Lengkap</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FITUR 1: MODUL NOTIFIKASI OTOMATIS OBAT KEDALUWARSA (< 3 BULAN)         */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-rose-200 shadow-sm overflow-hidden space-y-4">
        {/* Banner Alert Header */}
        <div className="p-6 bg-gradient-to-r from-rose-900 via-rose-950 to-slate-900 text-white flex flex-wrap justify-between items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-rose-500 text-white rounded-lg shadow-sm">
                <AlertTriangle className="w-4 h-4 animate-bounce" />
              </span>
              <span className="text-[11px] font-mono font-black text-rose-300 uppercase tracking-widest">
                Pusat Mitigasi Kerugian Inventaris
              </span>
            </div>
            <h3 className="text-lg font-black tracking-tight text-white">
              Peringatan Otomatis Obat Masa Kedaluwarsa (ED &lt; 3 Bulan)
            </h3>
            <p className="text-xs text-rose-200/90 max-w-2xl">
              Deteksi dini obat yang mendekati atau telah melampaui tanggal kedaluwarsa untuk segera diproses retur ke PBF atau diprioritaskan penjualannya menggunakan prinsip FEFO (First-Expired, First-Out).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 text-right">
              <span className="text-[10px] uppercase font-bold text-rose-200 block">
                Total Nilai Terancam Rugi (HPP)
              </span>
              <span className="font-mono font-black text-lg text-amber-300">
                Rp {totalLossHpp.toLocaleString('id-ID')}
              </span>
            </div>

            <button
              onClick={() => onNavigateTab('inv-retur')}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Buat Retur ke PBF</span>
            </button>
          </div>
        </div>

        {/* Filter Status & KPI Mini Badges */}
        <div className="px-6 flex flex-wrap justify-between items-center gap-3 text-xs border-b border-slate-200 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEdFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                edFilter === 'all'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>Semua Terancam ED (&lt; 90 Hari)</span>
              <span className="px-1.5 py-0.2 bg-white/20 rounded-full font-mono text-[10px]">
                {nearExpMedicines.length}
              </span>
            </button>

            <button
              onClick={() => setEdFilter('critical')}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                edFilter === 'critical'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Mendesak (&lt; 30 Hari)</span>
              <span className="px-1.5 py-0.2 bg-rose-600 text-white rounded-full font-mono text-[10px]">
                {criticalCount}
              </span>
            </button>

            <button
              onClick={() => setEdFilter('expired')}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                edFilter === 'expired'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>Sudah Lewat (Expired)</span>
              <span className="px-1.5 py-0.2 bg-slate-800 text-white rounded-full font-mono text-[10px]">
                {expiredCount}
              </span>
            </button>
          </div>

          <div className="text-slate-500 text-[11px] flex items-center gap-2">
            <span>Rincian: <strong>{expiredCount}</strong> expired · <strong>{criticalCount}</strong> &lt; 30 hari · <strong>{warningCount}</strong> 31-90 hari</span>
          </div>
        </div>

        {/* Tabel Interaktif Daftar Obat ED */}
        <div className="px-6 pb-6">
          {filteredExpMedicines.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 opacity-60" />
              <p className="font-bold text-slate-700 text-xs">
                Tidak ada stok obat yang terancam kedaluwarsa pada kategori filter ini.
              </p>
              <p className="text-[11px] text-slate-500">
                Seluruh batch obat saat ini berada di atas batas aman 3 bulan (90 hari).
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 uppercase font-black text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3">Nama Produk Obat</th>
                    <th className="p-3">Kategori & Bentuk</th>
                    <th className="p-3">Batch & Rak</th>
                    <th className="p-3 text-center">Tgl Kedaluwarsa</th>
                    <th className="p-3 text-center">Sisa Hari</th>
                    <th className="p-3 text-right">Sisa Stok Fisik</th>
                    <th className="p-3 text-right">Estimasi Nilai HPP</th>
                    <th className="p-3 text-center">Status & Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpMedicines.map((m) => {
                    const isExp = m.daysLeft <= 0;
                    const isCrit = m.daysLeft > 0 && m.daysLeft <= 30;

                    return (
                      <tr
                        key={m.id}
                        className={`hover:bg-slate-50/80 transition ${
                          isExp
                            ? 'bg-rose-50/40'
                            : isCrit
                            ? 'bg-amber-50/40'
                            : ''
                        }`}
                      >
                        <td className="p-3 font-extrabold text-slate-900">
                          <div>{m.name}</div>
                          <span className="text-[10px] font-mono text-slate-400">Barcode: {m.barcode}</span>
                        </td>
                        <td className="p-3 text-slate-600">
                          <div className="flex items-center gap-2">
                            <MedicineCategorySymbol category={m.category} size="sm" />
                            <span className="text-[10px] text-slate-400">{m.form}</span>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-700">
                          <div>No: {m.batchNo}</div>
                          <span className="text-[10px] text-slate-500">Rak: {m.rack}</span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-800">
                          {m.expDate}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full font-mono font-black text-[10px] ${
                              isExp
                                ? 'bg-rose-600 text-white animate-pulse'
                                : isCrit
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-amber-100 text-amber-900 border border-amber-300'
                            }`}
                          >
                            {isExp ? `LEWAT (${Math.abs(m.daysLeft)}h)` : `${m.daysLeft} hari`}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-slate-900">
                          {m.stock} {m.unit}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-rose-700">
                          Rp {m.valueLossHpp.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center space-x-1 whitespace-nowrap">
                          <button
                            onClick={() => onNavigateTab('inv-retur')}
                            title="Ajukan retur pembelian ke distributor PBF"
                            className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-lg text-[10px] font-bold cursor-pointer transition shadow-2xs"
                          >
                            Retur PBF
                          </button>
                          <button
                            onClick={() => onNavigateTab('pos-kasir')}
                            title="Buka kasir untuk cuci gudang / diskon FEFO"
                            className="px-2.5 py-1 bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 rounded-lg text-[10px] font-bold cursor-pointer transition shadow-2xs"
                          >
                            Diskon FEFO
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FITUR 2: DIAGRAM BATANG TREN DRP BULAN INI (RECHARTS)                     */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-wrap justify-between items-start border-b border-slate-200 pb-4 gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
                <Activity className="w-4 h-4 text-indigo-600" />
              </span>
              <h3 className="font-extrabold text-base text-slate-900 tracking-tight">
                Tren Interaksi Obat (DRPs) Paling Umum Bulan Ini
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                Clinical Decision Support System
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Statistik frekuensi Drug-Related Problems yang berhasil diidentifikasi dan dicegah apoteker berlandaskan standar <strong>BNF 86</strong>, <strong>Lexicomp</strong>, dan <strong>Pedoman Praktik Klinis Kemenkes RI</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 text-right">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">
                Total DRPs Terdeteksi
              </span>
              <span className="font-mono font-black text-slate-900 text-sm">
                {totalDrpThisMonth} Kasus
              </span>
            </div>
            <button
              onClick={() => onNavigateTab('pos-resep')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Buka Skrining Resep</span>
            </button>
          </div>
        </div>

        {/* Visual Recharts BarChart & Clinical Highlights */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* BarChart Container (8 cols) */}
          <div className="lg:col-span-8 h-[300px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={drpTrendData}
                margin={{ top: 20, right: 30, left: 0, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="shortName"
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomDrpTooltip />} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={36}>
                  {drpTrendData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Clinical Insights Card (4 cols) */}
          <div className="lg:col-span-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Efektivitas Skrining Farmasi</span>
            </h4>

            {lolosCount === 0 ? (
              <div className="p-4 bg-white rounded-xl border border-slate-200 text-center text-slate-400 space-y-1">
                <p className="font-bold text-slate-700 text-xs">Belum ada resep yang diloloskan</p>
                <p className="text-[10px] text-slate-500">Data efektivitas skrining resep hanya akan ditampilkan jika terdapat resep yang disetujui/diloloskan.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">
                    Resep Diloloskan (Aman)
                  </span>
                  <span className="font-extrabold text-emerald-700 text-xs block mt-0.5">
                    {lolosCount} Resep Telah Disetujui
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Memenuhi standar administratif, farmasetik, dan klinis tanpa DRP bermakna.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[11px]">
              <span className="text-slate-500">Total Resep Terproses:</span>
              <span className="font-black text-slate-900 font-mono">{prescriptions.length} Kasus</span>
            </div>
          </div>
        </div>

        {/* Legend & Literature Links */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-3 h-3 rounded-full bg-rose-600" />
              Bahaya Kritis (Alergi / Toksisitas Fatal)
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-3 h-3 rounded-full bg-amber-500" />
              Perhatian Sedang (Interaksi DDI / Indikasi)
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-3 h-3 rounded-full bg-sky-400" />
              Penyesuaian Dosis Lazim
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-400">Rujukan Utama:</span>
            <a
              href="https://bnf.nice.org.uk/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline font-bold inline-flex items-center gap-0.5"
            >
              <span>BNF NICE UK</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
            <span>·</span>
            <a
              href="https://pionas.pom.go.id/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline font-bold inline-flex items-center gap-0.5"
            >
              <span>BPOM PIONAS</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Middle Row: Quick Navigation & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Quick Nav Cards (8 cols) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-200 pb-3">
            <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
              Modul Pelayanan & Navigasi Cepat
            </h3>
            <span className="text-xs text-slate-400 font-medium">Akses langsung fitur utama</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              onClick={() => onNavigateTab('rme-pemeriksaan')}
              className="p-4 bg-sky-50/70 hover:bg-sky-100/70 rounded-2xl border border-sky-200 cursor-pointer transition-all space-y-2 group"
            >
              <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-xs group-hover:text-sky-800">
                  Ruang Periksa Dokter
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Input SOAP, ICD-10 & e-resep otomatis
                </p>
              </div>
            </div>

            <div
              onClick={() => onNavigateTab('pos-resep')}
              className="p-4 bg-amber-50/70 hover:bg-amber-100/70 rounded-2xl border border-amber-200 cursor-pointer transition-all space-y-2 group"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-900 text-xs group-hover:text-amber-800">
                    Antrean E-Resep & Skrining
                  </h4>
                  {pendingRx > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-black text-[9px] rounded-full">
                      {pendingRx}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Skrining klinis & teruskan ke kasir POS
                </p>
              </div>
            </div>

            <div
              onClick={() => onNavigateTab('fo-online')}
              className="p-4 bg-indigo-50/70 hover:bg-indigo-100/70 rounded-2xl border border-indigo-200 cursor-pointer transition-all space-y-2 group"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-xs group-hover:text-indigo-800">
                  Pendaftaran Online
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Verifikasi booking pasien mandiri
                </p>
              </div>
            </div>

            <div
              onClick={() => onNavigateTab('inv-defecta')}
              className="p-4 bg-orange-50/70 hover:bg-orange-100/70 rounded-2xl border border-orange-200 cursor-pointer transition-all space-y-2 group"
            >
              <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-xs group-hover:text-orange-800">
                  Defecta & Re-Order
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {lowStockCount} obat di bawah buffer min
                </p>
              </div>
            </div>

            <div
              onClick={() => onNavigateTab('keuangan-labarugi')}
              className="p-4 bg-emerald-50/70 hover:bg-emerald-100/70 rounded-2xl border border-emerald-200 cursor-pointer transition-all space-y-2 group"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-xs group-hover:text-emerald-800">
                  Laba Rugi Otomatis
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Laporan keuangan terintegrasi HPP
                </p>
              </div>
            </div>

            <div
              onClick={() => onNavigateTab('sys-cabang')}
              className="p-4 bg-cyan-50/70 hover:bg-cyan-100/70 rounded-2xl border border-cyan-200 cursor-pointer transition-all space-y-2 group"
            >
              <div className="w-9 h-9 rounded-xl bg-cyan-600 text-white flex items-center justify-center font-bold">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-xs group-hover:text-cyan-800">
                  Multi-Cabang & Transfer
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Matriks stok & sync 4 cabang
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Warnings & FEFO Monitoring (4 cols) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              Peringatan Stok Rendah (Defecta)
            </h4>
            <span className="text-[10px] font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              {lowStockCount} Item Menipis
            </span>
          </div>

          <div className="space-y-2.5 max-h-[300px] overflow-y-auto custom-scrollbar text-xs">
            {lowStockCount === 0 ? (
              <p className="text-slate-400 italic text-center py-8">
                Semua stok obat dalam kondisi aman di atas buffer minimum.
              </p>
            ) : (
              medicines
                .filter((m) => m.stock <= m.minStock)
                .map((m) => (
                  <div
                    key={m.id}
                    className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl flex justify-between items-center"
                  >
                    <div>
                      <strong className="text-rose-900 block font-bold">{m.name}</strong>
                      <span className="text-[10px] text-slate-600">
                        Sisa: <strong className="text-rose-700 font-mono">{m.stock} {m.unit}</strong> (Buffer Min: {m.minStock})
                      </span>
                    </div>
                    <span className="px-2 py-0.5 bg-rose-200 text-rose-800 rounded font-black text-[9px]">
                      DEFECTA
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
