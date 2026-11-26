import React from 'react';
import { Check, CheckSquare, Pill, Square, Tag } from 'lucide-react';
import {
  MedicationLabelItem,
  MedicationLabelLayout,
  MedicationRouteType,
  isRacikanPrescriptionItem,
  normalizeMedicationLabelLayout
} from '../utils/medicationLabelHelper';
import { formatDateDDMMYYYY } from '../utils/racikanBudHelper';

interface MedicationLabelConfiguratorProps {
  labels: MedicationLabelItem[];
  onChangeLabels: React.Dispatch<React.SetStateAction<MedicationLabelItem[]>>;
  layout: MedicationLabelLayout;
  onChangeLayout: (layout: MedicationLabelLayout) => void;
  rxId: string;
  rmId?: string;
  patientName: string;
  patientAge?: string;
  date: string;
  pharmacyName: string;
  pharmacyAddress: string;
  pharmacyPhone?: string;
  pharmacySia?: string;
  apjName: string;
  apjSipa?: string;
}

const QUICK_TIMING_OPTIONS = [
  'Sesudah makan',
  'Sebelum makan',
  'Bersama makan',
  'Malam sebelum tidur',
  'Bila perlu',
  'Oles tipis pada area sakit'
];

export const MedicationLabelConfigurator: React.FC<MedicationLabelConfiguratorProps> = ({
  labels,
  onChangeLabels,
  layout,
  onChangeLayout,
  rxId,
  rmId,
  patientName,
  patientAge,
  date,
  pharmacyName,
  pharmacyAddress,
  pharmacyPhone,
  pharmacySia,
  apjName,
  apjSipa
}) => {
  const selectedLabels = labels.filter((l) => l.selected);
  const totalCopies = selectedLabels.reduce((sum, l) => sum + Math.max(1, l.copies || 1), 0);
  const allSelected = labels.length > 0 && selectedLabels.length === labels.length;
  const normalizedLayout = normalizeMedicationLabelLayout(layout);
  const is58mm = normalizedLayout === 'thermal-58';
  const is80mm = normalizedLayout === 'thermal-80';

  const updateLabel = (id: string, patch: Partial<MedicationLabelItem>) => {
    onChangeLabels((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const toggleAll = () => {
    const nextVal = !allSelected;
    onChangeLabels((prev) => prev.map((l) => ({ ...l, selected: nextVal })));
  };

  if (labels.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
        <Pill className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-xs font-bold text-slate-600">
          Tidak ada item obat pada resep ini untuk dicetak etiketnya.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs text-slate-800">
      {/* Control Bar: Format & Seleksi */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition"
          >
            {allSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
            ) : (
              <Square className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>{allSelected ? 'Batalkan Semua' : 'Pilih Semua Obat'}</span>
          </button>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[11px]">
            {selectedLabels.length} dari {labels.length} obat · {totalCopies} label siap cetak
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => onChangeLayout('thermal-80')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              is80mm
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Thermal 80 mm
          </button>
          <button
            type="button"
            onClick={() => onChangeLayout('thermal-58')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              is58mm
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Thermal 58 mm
          </button>
          <button
            type="button"
            onClick={() => onChangeLayout('sheet')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              normalizedLayout === 'sheet'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lembar A4 (2 Kolom)
          </button>
        </div>
      </div>

      {/* Pengaturan Instruksi Per Obat */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-sky-600" />
            <span>Pengaturan Instruksi Penggunaan &amp; Jenis Etiket Per Obat</span>
          </h4>
          <span className="text-[10px] text-slate-500">
            Putih = Obat Dalam (Diminum) · Biru = Obat Luar
          </span>
        </div>

        {labels.map((item, idx) => {
          const isExternal = item.routeType === 'luar';
          const isRacikan = isRacikanPrescriptionItem(item);
          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border p-3.5 transition space-y-3 ${
                item.selected
                  ? isExternal
                    ? 'border-sky-300 shadow-2xs'
                    : 'border-slate-300 shadow-2xs'
                  : 'border-slate-200 opacity-60'
              }`}
            >
              {/* Baris Atas: Checkbox + Nama Obat + Toggle Putih/Biru + Jumlah Cetak */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) => updateLabel(item.id, { selected: e.target.checked })}
                    className="w-4 h-4 rounded text-sky-600 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 text-xs flex flex-wrap items-center gap-1.5">
                      <span>
                        {idx + 1}. {item.name}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] text-slate-700">
                        {item.qty} {item.unit}
                      </span>
                      {isRacikan && (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 font-bold text-[10px] text-indigo-700">
                          Racikan (Nama obat &amp; instruksi apoteker dihapus di etiket)
                        </span>
                      )}
                    </div>
                    {isRacikan ? (
                      <div className="text-[10px] font-mono text-amber-800 font-bold mt-0.5">
                        BUD: {item.budDate ? formatDateDDMMYYYY(item.budDate) : 'Belum diatur'}
                      </div>
                    ) : (
                      (item.batchNo || item.expDate) && (
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          {item.batchNo ? `Batch: ${item.batchNo}` : ''}
                          {item.batchNo && item.expDate ? ' · ' : ''}
                          {item.expDate ? `ED: ${item.expDate}` : ''}
                        </div>
                      )
                    )}
                  </div>
                </label>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Switch Obat Dalam (Putih) vs Obat Luar (Biru) */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    {(['dalam', 'luar'] as MedicationRouteType[]).map((rt) => (
                      <button
                        key={rt}
                        type="button"
                        onClick={() => {
                          const updatedWarning =
                            rt === 'luar'
                              ? item.extraWarning.includes('OBAT LUAR')
                                ? item.extraWarning
                                : ['OBAT LUAR — Tidak untuk ditelan', item.extraWarning]
                                    .filter(Boolean)
                                    .join(' · ')
                              : item.extraWarning
                                  .replace(/OBAT LUAR — Tidak untuk ditelan\s*·?\s*/gi, '')
                                  .trim();
                          updateLabel(item.id, {
                            routeType: rt,
                            extraWarning: updatedWarning
                          });
                        }}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition cursor-pointer flex items-center gap-1 ${
                          item.routeType === rt
                            ? rt === 'luar'
                              ? 'bg-sky-700 text-white shadow-2xs'
                              : 'bg-white text-slate-900 border border-slate-300 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full border ${
                            rt === 'luar'
                              ? 'bg-sky-400 border-sky-200'
                              : 'bg-white border-slate-400'
                          }`}
                        />
                        <span>{rt === 'dalam' ? 'Putih (Dalam)' : 'Biru (Luar)'}</span>
                      </button>
                    ))}
                  </div>

                  {/* Stepper Jumlah Stiker */}
                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5">
                    <span className="text-[10px] font-semibold text-slate-500 mr-1">Jml Label:</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateLabel(item.id, { copies: Math.max(1, (item.copies || 1) - 1) })
                      }
                      className="w-5 h-5 rounded bg-white border border-slate-300 text-slate-700 font-black hover:bg-slate-100 cursor-pointer flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-mono font-black text-[11px] text-slate-900">
                      {item.copies || 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateLabel(item.id, { copies: Math.min(20, (item.copies || 1) + 1) })
                      }
                      className="w-5 h-5 rounded bg-white border border-slate-300 text-slate-700 font-black hover:bg-slate-100 cursor-pointer flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Input Instruksi Pemakaian */}
              {item.selected && (
                <div
                  className={`grid grid-cols-1 gap-2.5 pt-1 border-t border-slate-100 ${
                    isRacikan ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
                  }`}
                >
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Aturan Pakai (Signa)
                    </label>
                    <input
                      type="text"
                      value={item.dosage}
                      onChange={(e) => updateLabel(item.id, { dosage: e.target.value })}
                      placeholder="Contoh: 3 x 1 Tablet"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Waktu / Cara Pakai
                    </label>
                    <input
                      type="text"
                      list={`timing-options-${item.id}`}
                      value={item.timingNote}
                      onChange={(e) => updateLabel(item.id, { timingNote: e.target.value })}
                      placeholder="Sesudah / Sebelum makan"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <datalist id={`timing-options-${item.id}`}>
                      {QUICK_TIMING_OPTIONS.map((opt) => (
                        <option key={opt} value={opt} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Peringatan / Catatan Tambahan
                    </label>
                    <input
                      type="text"
                      value={item.extraWarning}
                      onChange={(e) => updateLabel(item.id, { extraWarning: e.target.value })}
                      placeholder="Misal: Habiskan / Kocok dahulu"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  {isRacikan && (
                    <div>
                      <label className="block text-[10px] font-bold text-amber-700 mb-1">
                        Tanggal BUD (Etiket)
                      </label>
                      <input
                        type="date"
                        value={item.budDate || ''}
                        onChange={(e) => updateLabel(item.id, { budDate: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live Preview Etiket Obat */}
      {selectedLabels.length > 0 && (
        <div className="bg-slate-200/70 rounded-2xl border border-slate-300 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-700" />
              <span>Pratinjau Etiket Siap Tempel Kemasan ({totalCopies} Label)</span>
            </span>
            <span className="text-[10px] font-mono text-slate-600">
              Mode:{' '}
              {is58mm
                ? 'Thermal 58 mm (Area Cetak 48 mm)'
                : is80mm
                ? 'Thermal 80 mm (Area Cetak 72 mm)'
                : 'Lembar Potong A4 (2 Kolom)'}
            </span>
          </div>

          <div
            className={
              normalizedLayout === 'sheet'
                ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                : 'flex flex-col items-center gap-3'
            }
          >
            {selectedLabels.map((item) => {
              const isExternal = item.routeType === 'luar';
              const isRacikan = isRacikanPrescriptionItem(item);
              return (
                <div
                  key={`preview-${item.id}`}
                  className={`rounded-xl overflow-hidden border-2 shadow-xs flex flex-col justify-between ${
                    is58mm
                      ? 'w-[48mm] max-w-full'
                      : is80mm
                      ? 'w-[72mm] max-w-full'
                      : 'w-full'
                  } ${
                    isExternal
                      ? 'bg-sky-50 border-sky-700'
                      : 'bg-white border-slate-900'
                  }`}
                >
                  {/* Kop Etiket */}
                  <div
                    className={`border-b flex items-start justify-between gap-1.5 ${
                      is58mm ? 'px-2 py-1 flex-col' : 'px-3 py-1.5'
                    } ${
                      isExternal
                        ? 'bg-sky-700 text-white border-sky-800'
                        : 'bg-slate-900 text-white border-slate-900'
                    }`}
                  >
                    <div className="min-w-0 w-full">
                      <div className="flex items-center justify-between gap-1">
                        <div
                          className={`font-black uppercase tracking-wide truncate ${
                            is58mm ? 'text-[8.5px]' : 'text-[10px]'
                          }`}
                        >
                          {pharmacyName}
                        </div>
                        {is58mm && (
                          <span
                            className={`px-1 py-0.5 rounded text-[7px] font-black uppercase shrink-0 border ${
                              isExternal
                                ? 'bg-white text-sky-900 border-sky-200'
                                : 'bg-white text-slate-900 border-slate-300'
                            }`}
                          >
                            {isExternal ? 'LUAR' : 'DALAM'}
                          </span>
                        )}
                      </div>
                      <div
                        className={`opacity-90 truncate ${
                          is58mm ? 'text-[7px]' : 'text-[8px]'
                        }`}
                      >
                        {pharmacyAddress}
                        {pharmacyPhone ? ` · ${pharmacyPhone}` : ''}
                      </div>
                      <div
                        className={`font-mono opacity-85 truncate ${
                          is58mm ? 'text-[6.5px]' : 'text-[8px]'
                        }`}
                      >
                        APJ: {apjName}
                        {!is58mm && apjSipa ? ` (${apjSipa})` : ''}
                        {!is58mm && pharmacySia ? ` · SIA: ${pharmacySia}` : ''}
                      </div>
                    </div>
                    {!is58mm && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0 border ${
                          isExternal
                            ? 'bg-white text-sky-900 border-sky-200'
                            : 'bg-white text-slate-900 border-slate-300'
                        }`}
                      >
                        {isExternal ? 'OBAT LUAR' : 'OBAT DALAM'}
                      </span>
                    )}
                  </div>

                  {/* Identitas Resep & Pasien */}
                  <div className={is58mm ? 'px-2 pt-1.5 pb-1 space-y-1' : 'px-3 pt-2 pb-1.5 space-y-1.5'}>
                    <div
                      className={`flex items-center justify-between font-mono text-slate-600 border-b border-dashed border-slate-300 pb-0.5 ${
                        is58mm ? 'text-[7.5px]' : 'text-[9px]'
                      }`}
                    >
                      <span className="truncate">
                        No: <strong className="text-slate-900">{rxId}</strong>
                      </span>
                      <span className="shrink-0">{is58mm ? date : `Tgl: ${date}`}</span>
                    </div>

                    <div
                      className={`flex items-baseline justify-between gap-1 ${
                        is58mm ? 'text-[8.5px]' : 'text-[10px]'
                      }`}
                    >
                      <div className="truncate">
                        <span className="text-slate-500">Pro: </span>
                        <strong className="font-black text-slate-900 uppercase">
                          {patientName}
                        </strong>
                        {patientAge ? (
                          <span className="text-slate-600 font-semibold"> ({patientAge} Th)</span>
                        ) : null}
                      </div>
                      {rmId && !is58mm && (
                        <span className="font-mono text-[9px] text-slate-500 shrink-0">
                          RM: {rmId}
                        </span>
                      )}
                    </div>

                    {/* Nama Obat + Qty (Racikan: hanya jumlah sediaan tanpa nama obat) */}
                    <div
                      className={`bg-white/90 border border-slate-300 rounded-lg space-y-1 ${
                        is58mm ? 'px-1.5 py-1' : 'px-2.5 py-1.5'
                      }`}
                    >
                      {isRacikan ? (
                        <div className="flex items-baseline justify-between gap-1.5">
                          <span
                            className={`font-bold text-slate-600 ${
                              is58mm ? 'text-[8px]' : 'text-[9.5px]'
                            }`}
                          >
                            Jumlah:
                          </span>
                          <span
                            className={`font-mono font-bold text-slate-800 shrink-0 ${
                              is58mm ? 'text-[8px]' : 'text-[10px]'
                            }`}
                          >
                            {item.qty} {item.unit}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-baseline justify-between gap-1.5">
                          <strong
                            className={`font-black text-slate-900 leading-tight ${
                              is58mm ? 'text-[9.5px]' : 'text-[11px]'
                            }`}
                          >
                            {item.name}
                          </strong>
                          <span
                            className={`font-mono font-bold text-slate-700 shrink-0 ${
                              is58mm ? 'text-[8px]' : 'text-[10px]'
                            }`}
                          >
                            {item.qty} {item.unit}
                          </span>
                        </div>
                      )}

                      {/* Aturan Pakai Besar & Jelas */}
                      <div
                        className={`rounded text-center border ${
                          is58mm ? 'px-1.5 py-0.5' : 'px-2 py-1'
                        } ${
                          isExternal
                            ? 'bg-sky-100/80 border-sky-300 text-sky-950'
                            : 'bg-slate-100 border-slate-300 text-slate-950'
                        }`}
                      >
                        <div
                          className={`font-black tracking-wide ${
                            is58mm ? 'text-[10px]' : 'text-xs'
                          }`}
                        >
                          {item.dosage || 'Sesuai petunjuk'}
                        </div>
                        {item.timingNote && (
                          <div
                            className={`font-bold uppercase tracking-tight ${
                              is58mm ? 'text-[8px]' : 'text-[10px]'
                            }`}
                          >
                            {item.timingNote}
                          </div>
                        )}
                      </div>

                      {item.extraWarning && (
                        <div
                          className={`font-extrabold text-rose-700 text-center uppercase tracking-tight ${
                            is58mm ? 'text-[7.5px]' : 'text-[9px]'
                          }`}
                        >
                          ⚠ {item.extraWarning}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Batch/ED & Copies Badge */}
                  <div
                    className={`font-mono flex items-center justify-between border-t ${
                      is58mm ? 'px-2 py-0.5 text-[7px]' : 'px-3 py-1 text-[8px]'
                    } ${
                      isExternal
                        ? 'bg-sky-100/70 border-sky-200 text-sky-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="truncate">
                      {isRacikan ? (
                        item.budDate ? (
                          <strong className="font-bold">BUD: {formatDateDDMMYYYY(item.budDate)}</strong>
                        ) : is58mm ? (
                          'Simpan tempat sejuk'
                        ) : (
                          'Simpan di tempat sejuk & kering'
                        )
                      ) : (
                        <>
                          {item.expDate
                            ? `ED: ${item.expDate}`
                            : is58mm
                            ? 'Simpan tempat sejuk'
                            : 'Simpan di tempat sejuk & kering'}
                          {item.batchNo && !is58mm ? ` · B: ${item.batchNo}` : ''}
                        </>
                      )}
                    </span>
                    <span className="font-bold shrink-0">
                      {item.copies > 1
                        ? `×${item.copies}`
                        : is58mm
                        ? 'Lekas Sembuh'
                        : 'Semoga Lekas Sembuh'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
