import React, { useState, useMemo, useEffect } from 'react';
import {
  HeartPulse,
  Send,
  AlertTriangle,
  UserCheck,
  Search,
  Scale,
  QrCode,
  Sparkles,
  CheckCircle2,
  Camera
} from 'lucide-react';
import { Patient, PatientQueue, Doctor, Staff } from '../types';
import { CameraBarcodeScannerModal } from './CameraBarcodeScannerModal';
import {
  checkPatientInSupabase,
  fetchPatientsPaginatedFromSupabase,
  getSupabaseConfig,
  deduplicatePatients
} from '../utils/supabaseClient';
import { isDemoMode } from '../utils/demoSandbox';

interface CheckinViewProps {
  patients: Patient[];
  doctors: Doctor[];
  staffList?: Staff[];
  queue: PatientQueue[];
  onAddToQueue: (queueItem: PatientQueue) => void;
  onNavigateToMonitor: () => void;
  onRegisterNewPatient?: (patient: Patient) => void;
}

export const CheckinView: React.FC<CheckinViewProps> = ({
  patients,
  doctors,
  staffList = [],
  queue,
  onAddToQueue,
  onNavigateToMonitor,
  onRegisterNewPatient
}) => {
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedPatientObj, setSelectedPatientObj] = useState<Patient | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [remoteSearchPatients, setRemoteSearchPatients] = useState<Patient[]>([]);
  const [showCameraQrScanner, setShowCameraQrScanner] = useState(false);

  // Debounced live Supabase search when typing 2+ chars so 5000+ patients are searchable without loading all into RAM
  useEffect(() => {
    const clean = patientSearch.trim();
    if (clean.length < 2 || isDemoMode()) {
      setRemoteSearchPatients([]);
      return;
    }
    const cfg = getSupabaseConfig();
    if (!cfg.url || !cfg.key) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchPatientsPaginatedFromSupabase({
        page: 1,
        pageSize: 20,
        searchQuery: clean
      }).then((res) => {
        if (!cancelled && res.data) {
          setRemoteSearchPatients(res.data);
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [patientSearch]);

  // Vital Signs
  const [tdSistolik, setTdSistolik] = useState('120');
  const [tdDiastolik, setTdDiastolik] = useState('80');
  const [suhu, setSuhu] = useState('36.5');
  const [nadi, setNadi] = useState('80');
  const [spo2, setSpo2] = useState('98');
  const [bb, setBb] = useState('65');
  const [tb, setTb] = useState('165');

  const activeStaff = useMemo(() => {
    return staffList.filter((s) => s.status !== 'Non-Aktif');
  }, [staffList]);

  const defaultNurse = useMemo(() => {
    const nurse = activeStaff.find(
      (s) =>
        s.role === 'Perawat / Bidan' ||
        s.role === 'Perawat / Nakes Lapangan' ||
        s.role === 'Kasir & Front Office'
    );
    return nurse?.name || activeStaff[0]?.name || '';
  }, [activeStaff]);

  const [selectedDoctorId, setSelectedDoctorId] = useState(doctors[0]?.id || 'DOC-001');
  const [screeningStaffName, setScreeningStaffName] = useState(defaultNurse);
  const [serviceType, setServiceType] = useState('Poli Umum');
  const [complaint, setComplaint] = useState('');

  const filteredPatients = useMemo(() => {
    const raw = patientSearch.trim().toLowerCase();
    const token = raw.includes(' - ') ? raw.split(' - ')[0].trim() : raw;
    if (!raw) {
      if (remoteSearchPatients.length > 0) {
        return deduplicatePatients([...remoteSearchPatients, ...patients]).slice(0, 50);
      }
      return [];
    }
    const localMatches: Patient[] = [];
    for (const p of patients) {
      const pName = (p.name || '').toLowerCase();
      const pId = (p.id || '').toLowerCase();
      const pNoRm = (p.noRm || '').toLowerCase();
      const pDbId = (p.dbId || '').toLowerCase();
      const pNik = (p.nik || '').toLowerCase();
      const pPhone = (p.phone || '').toLowerCase();
      const pAddr = (p.address || '').toLowerCase();
      if (
        pName.includes(raw) ||
        pId.includes(token) ||
        pNoRm.includes(token) ||
        pDbId.includes(token) ||
        pNik.includes(token) ||
        pPhone.includes(token) ||
        pAddr.includes(raw)
      ) {
        localMatches.push(p);
        if (localMatches.length >= 50 && remoteSearchPatients.length === 0) break;
      }
    }
    if (remoteSearchPatients.length === 0) {
      return localMatches.slice(0, 50);
    }
    return deduplicatePatients([...remoteSearchPatients, ...localMatches]).slice(0, 50);
  }, [patients, remoteSearchPatients, patientSearch]);

  const selectedPatient =
    (selectedPatientObj && selectedPatientObj.id === selectedPatientId ? selectedPatientObj : null) ||
    remoteSearchPatients.find((p) => p.id === selectedPatientId) ||
    patients.find((p) => p.id === selectedPatientId);

  // BMI Calculation
  const bmiInfo = useMemo(() => {
    const weight = parseFloat(bb);
    const height = parseFloat(tb) / 100;
    if (!weight || !height || height <= 0) return null;
    const bmi = +(weight / (height * height)).toFixed(1);
    let category = 'Normal';
    let colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (bmi < 18.5) {
      category = 'Berat Badan Kurang';
      colorClass = 'text-amber-700 bg-amber-50 border-amber-200';
    } else if (bmi >= 25 && bmi < 30) {
      category = 'Kelebihan Berat Badan (Overweight)';
      colorClass = 'text-orange-700 bg-orange-50 border-orange-200';
    } else if (bmi >= 30) {
      category = 'Obesitas';
      colorClass = 'text-rose-700 bg-rose-50 border-rose-200';
    }
    return { bmi, category, colorClass };
  }, [bb, tb]);

  const [isSearchingSupabase, setIsSearchingSupabase] = useState(false);
  const [supabaseLookupNotice, setSupabaseLookupNotice] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrInputCode, setQrInputCode] = useState('');

  const handleSelectPatient = (p: Patient) => {
    setSelectedPatientId(p.id);
    setSelectedPatientObj(p);
    setPatientSearch(`${p.id} - ${p.name}`);
    setShowDropdown(false);
    if (onRegisterNewPatient && !patients.some((existing) => existing.id === p.id)) {
      onRegisterNewPatient(p);
    }
  };

  // Pembacaan & Pencarian Langsung ke Tabel Master Pasien Supabase (`pasien`)
  const handleLookupSupabase = async (searchVal: string) => {
    const clean = searchVal.trim();
    setIsSearchingSupabase(true);
    setSupabaseLookupNotice(null);

    try {
      // 1. Jika kolom pencarian kosong, tarik daftar Master Pasien terbaru langsung dari Supabase
      if (!clean) {
        const res = await fetchPatientsPaginatedFromSupabase({
          page: 1,
          pageSize: 50
        });

        if (res.error) {
          setSupabaseLookupNotice(`Gagal membaca Master Pasien Supabase: ${res.error}`);
          return;
        }

        const fetchedList = res.data || [];
        setRemoteSearchPatients(fetchedList);
        setShowDropdown(true);

        if (fetchedList.length > 0) {
          setSupabaseLookupNotice(
            `✓ Berhasil memuat ${fetchedList.length} data dari Master Pasien Supabase (Total: ${res.totalCount.toLocaleString('id-ID')} pasien). Silakan pilih pasien di daftar bawah.`
          );
        } else {
          setSupabaseLookupNotice('Informasi: Tabel Master Pasien di Supabase saat ini masih kosong.');
        }
        return;
      }

      // 2. Jika ada kata kunci (Nama, No. RM, ID PAS-..., NIK, No. HP, atau Alamat), baca langsung dari Master Pasien Supabase
      const checkRes = await checkPatientInSupabase({
        query: clean
      });

      if (checkRes.error) {
        setSupabaseLookupNotice(`Gagal membaca Master Pasien Supabase: ${checkRes.error}`);
        return;
      }

      const matches = checkRes.matches || (checkRes.patient ? [checkRes.patient] : []);
      if (checkRes.exists && matches.length > 0) {
        setRemoteSearchPatients(matches);

        const rawToken = clean.includes(' - ') ? clean.split(' - ')[0].trim() : clean;
        const rmCompact = rawToken.replace(/^RM[\s-]+/i, 'RM');
        const exactMatch = matches.find(
          (p) =>
            p.id.toLowerCase() === rawToken.toLowerCase() ||
            (p.noRm || '').toLowerCase() === rawToken.toLowerCase() ||
            (p.dbId || '').toLowerCase() === rawToken.toLowerCase() ||
            p.id.toLowerCase() === rmCompact.toLowerCase() ||
            (p.noRm || '').toLowerCase() === rmCompact.toLowerCase() ||
            p.nik.toLowerCase() === rawToken.toLowerCase() ||
            p.name.toLowerCase() === clean.toLowerCase()
        );

        if (matches.length === 1 || exactMatch) {
          const chosen = exactMatch || matches[0];
          handleSelectPatient(chosen);
          setSupabaseLookupNotice(
            `✓ Pasien ditemukan di Master Pasien Supabase: ${chosen.name} (No. RM: ${chosen.noRm || chosen.id} · NIK: ${chosen.nik || '-'})`
          );
        } else {
          setShowDropdown(true);
          const totalMatched = checkRes.totalCount || matches.length;
          setSupabaseLookupNotice(
            `✓ Ditemukan ${matches.length} pasien (dari total ${totalMatched.toLocaleString('id-ID')} cocok) di Master Pasien Supabase untuk "${clean}". Pilih pasien pada daftar di bawah.`
          );
        }
      } else {
        setSupabaseLookupNotice(
          `Informasi: Pasien dengan kata kunci "${clean}" belum ditemukan di tabel Master Pasien Supabase.`
        );
      }
    } catch (e: any) {
      setSupabaseLookupNotice(`Gagal query Supabase: ${e.message}`);
    } finally {
      setIsSearchingSupabase(false);
      setTimeout(() => setSupabaseLookupNotice(null), 8000);
    }
  };

  const handleProcessQrScan = async (scannedText: string) => {
    if (!scannedText.trim()) return;
    // Format QR bisa: LATISHA-RM-RM-001-1801... atau RM-001 atau NIK 16 digit
    let clean = scannedText.trim();
    if (clean.includes('LATISHA-RM-')) {
      const parts = clean.split('-');
      // LATISHA, RM, RM, 001, NIK
      if (parts.length >= 4) {
        clean = `${parts[1]}-${parts[2]}`; // misal RM-001
      }
    }

    setShowQrModal(false);
    setPatientSearch(clean);

    // Cek dulu di list lokal
    const localMatch = patients.find(
      (p) =>
        p.id.toLowerCase() === clean.toLowerCase() ||
        (p.noRm || '').toLowerCase() === clean.toLowerCase() ||
        p.nik === clean
    );
    if (localMatch) {
      handleSelectPatient(localMatch);
      setSupabaseLookupNotice(`✓ Pasien QR ditemukan: ${localMatch.name} (${localMatch.id})`);
      return;
    }

    // Jika belum di lokal, query langsung ke Supabase
    await handleLookupSupabase(clean);
  };

  const handleCheckin = () => {
    if (!selectedPatient) {
      alert('Pilih pasien dari daftar terlebih dahulu!');
      return;
    }

    const doctor = doctors.find((d) => d.id === selectedDoctorId);
    const nextNum = `A-${String(queue.length + 1).padStart(3, '0')}`;
    const currentTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const newQueueItem: PatientQueue = {
      nomor: nextNum,
      rmId: selectedPatient.id,
      name: selectedPatient.name,
      age: selectedPatient.age,
      gender: selectedPatient.gender,
      vital: {
        td: `${tdSistolik}/${tdDiastolik}`,
        suhu: parseFloat(suhu) || 36.5,
        nadi: parseInt(nadi) || 80,
        spo2: parseInt(spo2) || 98,
        bb: parseFloat(bb) || undefined,
        tb: parseFloat(tb) || undefined
      },
      status: 'Menunggu',
      doctorId: selectedDoctorId,
      doctorName: doctor?.name || 'dr. Anis Prima Dewi',
      checkinTime: currentTime,
      source: 'Pendaftaran Langsung (Walk-in)',
      complaint: complaint || 'Konsultasi & Pemeriksaan Fisik',
      serviceType,
      branchId: 'BR-01'
    };

    onAddToQueue(newQueueItem);
    alert(`Pasien ${selectedPatient.name} berhasil check-in dengan nomor antrean ${nextNum}`);
    onNavigateToMonitor();
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-wrap justify-between items-center gap-2">
        <div>
          <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-rose-500" />
            Check-in Kunjungan & Skrining Tanda Vital Pasien
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Skrining awal perawat sebelum pasien masuk ke ruang periksa dokter.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Patient Selector & Allergy Warning (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Pilih Pasien Terdaftar *
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                  title="Scan QR Mandiri dari Kartu Pasien / HP"
                >
                  <QrCode className="w-3 h-3" />
                  <span>Scan QR</span>
                </button>
                <button
                  type="button"
                  disabled={isSearchingSupabase}
                  onClick={() => handleLookupSupabase(patientSearch)}
                  className={`px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                    isSearchingSupabase ? 'opacity-50 cursor-wait' : 'cursor-pointer'
                  }`}
                  title="Baca & Cari Langsung dari Tabel Master Pasien Supabase"
                >
                  <Sparkles className="w-3 h-3 text-sky-600" />
                  <span>{isSearchingSupabase ? 'Mengecek...' : 'Cek Supabase'}</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Ketik Nama, No. RM, atau NIK (atau klik Cek Supabase)..."
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLookupSupabase(patientSearch);
                  }
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            {/* Supabase Lookup Notice */}
            {supabaseLookupNotice && (
              <div className="mt-1.5 p-2 bg-sky-50 border border-sky-200 text-sky-800 rounded-xl text-[11px] font-bold flex items-center gap-1.5 animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>{supabaseLookupNotice}</span>
              </div>
            )}

            {showDropdown && filteredPatients.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y">
                {filteredPatients.map((p) => (
                  <div
                    key={`${p.dbId || p.id}-${p.nik}`}
                    onClick={() => handleSelectPatient(p)}
                    className="p-3 hover:bg-sky-50 cursor-pointer text-xs font-medium transition-colors"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <strong className="text-slate-800 truncate">{p.name}</strong>
                      <span className="font-mono text-sky-700 font-bold text-[11px] shrink-0">
                        {p.noRm || p.id}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span>NIK: {p.nik || '-'}</span>
                      <span>·</span>
                      <span>{p.gender}, {p.age} thn</span>
                      {p.address && p.address !== '-' && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[180px]">{p.address}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedPatient && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-slate-800 text-sm">{selectedPatient.name}</span>
              </div>
              <div className="text-[11px] text-slate-600 space-y-0.5">
                <div>No. RM: <strong className="font-mono text-sky-700">{selectedPatient.id}</strong></div>
                <div>Kategori: <strong>{selectedPatient.category}</strong></div>
                <div>Alamat: {selectedPatient.address}</div>
              </div>

              {selectedPatient.allergy && selectedPatient.allergy !== 'Tidak Ada' && (
                <div className="p-3 bg-rose-500 text-white rounded-xl text-xs font-bold shadow-xs animate-pulse flex items-start gap-2 mt-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="block font-black uppercase text-[10px] tracking-wider">
                      PERINGATAN ALERGI OBAT:
                    </span>
                    <span className="text-xs">{selectedPatient.allergy}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Pilih Layanan Poli
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
            >
              <option value="Poli Umum">Poli Umum</option>
              <option value="Konseling Farmasi & Obat">Konseling Farmasi & Obat</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Dokter Pemeriksa (Data Pegawai / DPJ)
            </label>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.specialization})
                </option>
              ))}
            </select>
          </div>

          {activeStaff.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Petugas Skrining / Perawat (Data Pegawai)
              </label>
              <select
                value={screeningStaffName || defaultNurse}
                onChange={(e) => setScreeningStaffName(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-sky-500 outline-none"
              >
                {activeStaff.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name} ({st.role})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: Vital Signs Inputs & Complaint (8 Cols) */}
        <div className="lg:col-span-8 bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
          <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-rose-500" />
            Tanda-Tanda Vital (Vital Signs)
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-600 mb-1">
                Tekanan Darah (mmHg)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={tdSistolik}
                  onChange={(e) => setTdSistolik(e.target.value)}
                  className="w-16 p-2 border rounded-xl bg-white font-mono font-bold text-center"
                />
                <span className="font-bold text-slate-400">/</span>
                <input
                  type="number"
                  value={tdDiastolik}
                  onChange={(e) => setTdDiastolik(e.target.value)}
                  className="w-16 p-2 border rounded-xl bg-white font-mono font-bold text-center"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">
                Suhu Tubuh (°C)
              </label>
              <input
                type="number"
                step="0.1"
                value={suhu}
                onChange={(e) => setSuhu(e.target.value)}
                className="w-full p-2 border rounded-xl bg-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">
                Denyut Nadi (bpm)
              </label>
              <input
                type="number"
                value={nadi}
                onChange={(e) => setNadi(e.target.value)}
                className="w-full p-2 border rounded-xl bg-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">
                SpO2 Oksigen (%)
              </label>
              <input
                type="number"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                className="w-full p-2 border rounded-xl bg-white font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div>
              <label className="block font-bold text-slate-600 mb-1">
                Berat Badan (kg)
              </label>
              <input
                type="number"
                step="0.1"
                value={bb}
                onChange={(e) => setBb(e.target.value)}
                className="w-full p-2 border rounded-xl bg-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">
                Tinggi Badan (cm)
              </label>
              <input
                type="number"
                value={tb}
                onChange={(e) => setTb(e.target.value)}
                className="w-full p-2 border rounded-xl bg-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">
                Indeks Massa Tubuh (BMI)
              </label>
              {bmiInfo ? (
                <div className={`p-2 border rounded-xl font-bold text-xs ${bmiInfo.colorClass}`}>
                  BMI: {bmiInfo.bmi} · {bmiInfo.category}
                </div>
              ) : (
                <div className="p-2 border rounded-xl text-slate-400 bg-slate-100 text-xs">
                  Masukkan BB & TB
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 text-xs mb-1">
              Keluhan Utama / Alasan Kunjungan Pasien
            </label>
            <textarea
              rows={3}
              placeholder="Contoh: Pasien mengeluh pusing berputar, mual sejak 2 hari, nafsu makan berkurang..."
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              className="w-full p-3 border rounded-xl bg-white font-medium text-xs focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>

          <button
            onClick={handleCheckin}
            className="w-full py-3.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Kirim Pasien ke Antrean Ruang Dokter</span>
          </button>
        </div>
      </div>

      {/* QR Scanner / QR Code Input Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-400" />
                <h4 className="font-bold text-sm">Scan QR Mandiri Pasien</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Arahkan barcode scanner fisik atau masukkan teks QR / No. RM / NIK yang tertera pada Kartu Rekam Medis / E-Tiket Pasien:
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleProcessQrScan(qrInputCode);
                }}
                className="space-y-3"
              >
                <div>
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder="Contoh: RM-001 atau 1801xxxxxxxxxxxx"
                    value={qrInputCode}
                    onChange={(e) => setQrInputCode(e.target.value)}
                    className="w-full p-3 border-2 border-sky-500 rounded-xl font-mono font-bold text-sm bg-slate-50 focus:bg-white outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Sistem akan otomatis mengecek data di Supabase (Duplicate Check) dan menampilkan profil pasien.
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCameraQrScanner(true)}
                    className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Scan Kamera QR / Barcode</span>
                  </button>

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowQrModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Validasi Pasien</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <CameraBarcodeScannerModal
        isOpen={showCameraQrScanner}
        onClose={() => setShowCameraQrScanner(false)}
        title="Scan Kamera QR / Barcode Pasien"
        subtitle="Arahkan kamera ke QR Code atau Barcode pada Kartu Rekam Medis / E-Tiket pasien."
        scanMode="both"
        onScanSuccess={(decoded) => {
          setQrInputCode(decoded);
          handleProcessQrScan(decoded);
        }}
      />
    </div>
  );
};
