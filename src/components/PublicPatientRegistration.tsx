import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Send,
  Calendar,
  Clock,
  User,
  Phone,
  MapPin,
  ShieldAlert,
  CheckCircle2,
  Share2,
  Printer,
  Copy,
  ExternalLink,
  Database,
  QrCode,
  ArrowLeft,
  Sparkles,
  Stethoscope,
  MessageCircle,
  Search,
  RefreshCw,
  AlertCircle,
  X
} from 'lucide-react';
import { OnlineRegistration, DutySchedule, ScheduleDay, Medicine, Patient, isOwnerAdminRole } from '../types';
import { INITIAL_DUTY_SCHEDULES, INITIAL_MEDICINES } from '../data/initialData';
import {
  checkOrRegisterPatientSupabase,
  getSupabaseConfig,
  getSupabaseClient,
  lookupPatientByNikFromMaster,
  normalizeDateForHtmlInput,
  onlineRegToSupabaseRow,
  supabaseRowToOnlineReg
} from '../utils/supabaseClient';
import { demoGetItem, demoSetItem, getDemoBroadcastChannelName, isDemoMode } from '../utils/demoSandbox';
import { PortalPatientLiveChat } from './PortalPatientLiveChat';

interface PublicPatientRegistrationProps {
  schedules?: DutySchedule[];
  patients?: Patient[];
  embedded?: boolean;
  unifiedMode?: boolean;
  hideFloatingChat?: boolean;
  onBackToDashboard?: () => void;
  onNewRegistrationSuccess?: (reg: OnlineRegistration) => void;
}

export const PublicPatientRegistration: React.FC<PublicPatientRegistrationProps> = ({
  schedules,
  patients,
  embedded = false,
  unifiedMode = false,
  hideFloatingChat = false,
  onBackToDashboard,
  onNewRegistrationSuccess
}) => {
  const [activeSchedules, setActiveSchedules] = useState<DutySchedule[]>(() => {
    if (schedules !== undefined) return schedules;
    try {
      const saved = demoGetItem('latisha_schedules');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return INITIAL_DUTY_SCHEDULES;
  });

  useEffect(() => {
    if (schedules !== undefined) {
      setActiveSchedules(schedules);
    }
  }, [schedules]);

  const localMedicines = useMemo<Medicine[]>(() => {
    try {
      const saved = demoGetItem('latisha_medicines');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_MEDICINES;
  }, []);

  const [form, setForm] = useState({
    nik: '',
    name: '',
    birthDate: '1995-06-15',
    gender: 'Laki-laki' as 'Laki-laki' | 'Perempuan',
    phone: '',
    address: '',
    appointmentDate: new Date().toISOString().split('T')[0],
    appointmentSession: 'Full Day (Fleksibel) — 08:00 - 20:00 WIB',
    serviceType: 'Poli Umum (Pemeriksaan Dokter & Pengobatan)',
    complaint: '',
    allergy: 'Tidak Ada'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>('');
  const [toastNotice, setToastNotice] = useState<{ message: string; type: 'success' | 'info' | 'warn' } | null>(null);
  const [nikLookupStatus, setNikLookupStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle');
  const [matchedMasterPatient, setMatchedMasterPatient] = useState<Patient | null>(null);
  const lastLookedUpNikRef = useRef<string>('');
  const wasAutoFilledRef = useRef<boolean>(false);
  const lookupReqIdRef = useRef<number>(0);

  const performNikLookup = useCallback(
    async (rawNik: string) => {
      const cleanNik = rawNik.replace(/\D/g, '').slice(0, 16);
      if (cleanNik.length < 16) {
        lookupReqIdRef.current += 1;
        lastLookedUpNikRef.current = '';
        setNikLookupStatus('idle');
        setMatchedMasterPatient(null);
        if (cleanNik.length === 0 && wasAutoFilledRef.current) {
          wasAutoFilledRef.current = false;
          setForm((prev) => ({
            ...prev,
            name: '',
            birthDate: '1995-06-15',
            gender: 'Laki-laki',
            phone: '',
            address: '',
            allergy: 'Tidak Ada'
          }));
        }
        return;
      }

      if (lastLookedUpNikRef.current === cleanNik) {
        return;
      }

      lastLookedUpNikRef.current = cleanNik;
      const reqId = ++lookupReqIdRef.current;
      setNikLookupStatus('searching');

      const result = await lookupPatientByNikFromMaster(cleanNik, patients);
      if (reqId !== lookupReqIdRef.current) return;

      if (result.found && result.patient) {
        const foundPatient = result.patient;
        const normalizedBirth = normalizeDateForHtmlInput(foundPatient.birthDate);
        const normalizedPhone = String(foundPatient.phone || '').replace(/\D/g, '');
        const normalizedAddress =
          foundPatient.address && foundPatient.address.trim() !== '-'
            ? foundPatient.address.trim()
            : '';
        const normalizedAllergy =
          foundPatient.allergy && foundPatient.allergy.trim()
            ? foundPatient.allergy.trim()
            : 'Tidak Ada';

        wasAutoFilledRef.current = true;
        setMatchedMasterPatient(foundPatient);
        setNikLookupStatus('found');
        setForm((prev) => ({
          ...prev,
          nik: cleanNik,
          name: foundPatient.name && foundPatient.name !== 'Tanpa Nama' ? foundPatient.name : prev.name,
          birthDate: normalizedBirth || prev.birthDate,
          gender: foundPatient.gender === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
          phone: normalizedPhone || prev.phone,
          address: normalizedAddress,
          allergy: normalizedAllergy
        }));
      } else {
        setMatchedMasterPatient(null);
        setNikLookupStatus('not_found');
        if (wasAutoFilledRef.current) {
          wasAutoFilledRef.current = false;
          setForm((prev) => ({
            ...prev,
            name: '',
            birthDate: '1995-06-15',
            gender: 'Laki-laki',
            phone: '',
            address: '',
            allergy: 'Tidak Ada'
          }));
        }
      }
    },
    [patients]
  );

  useEffect(() => {
    const cleanNik = form.nik.replace(/\D/g, '');
    if (cleanNik.length < 16) {
      lookupReqIdRef.current += 1;
      lastLookedUpNikRef.current = '';
      setNikLookupStatus('idle');
      setMatchedMasterPatient(null);
      if (cleanNik.length === 0 && wasAutoFilledRef.current) {
        wasAutoFilledRef.current = false;
        setForm((prev) => ({
          ...prev,
          name: '',
          birthDate: '1995-06-15',
          gender: 'Laki-laki',
          phone: '',
          address: '',
          allergy: 'Tidak Ada'
        }));
      }
      return;
    }

    const timer = window.setTimeout(() => {
      performNikLookup(cleanNik);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [form.nik, performNikLookup]);
  const [successTicket, setSuccessTicket] = useState<{
    bookingCode: string;
    queueNumber: string;
    name: string;
    nik: string;
    noRm: string;
    isNewPatient: boolean;
    phone: string;
    appointmentDate: string;
    appointmentSession: string;
    serviceType: string;
    complaint: string;
    allergy: string;
    syncNotice: string;
  } | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [chatOpenTrigger, setChatOpenTrigger] = useState(0);
  const [chatStatus, setChatStatus] = useState<{ staffOnlineCount: number; unreadCount: number; isConnected: boolean }>({
    staffOnlineCount: 0,
    unreadCount: 0,
    isConnected: false
  });

  // Booking & Queue Status Lookup (Session-isolated + exact Kode Booking / NIK lookup)
  const [statusQuery, setStatusQuery] = useState('');
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [statusLookupError, setStatusLookupError] = useState('');
  const [statusResults, setStatusResults] = useState<OnlineRegistration[]>([]);
  const [hasSearchedStatus, setHasSearchedStatus] = useState(false);
  const [sessionBookingCodes, setSessionBookingCodes] = useState<string[]>(() => {
    try {
      const raw = window.sessionStorage.getItem('latisha_patient_session_bookings');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    // Auto-populate session registrations so returning customers in same session see status cleanly
    if (sessionBookingCodes.length === 0) return;
    try {
      const existing: OnlineRegistration[] = JSON.parse(demoGetItem('latisha_online_registrations') || '[]');
      const matched = existing.filter((r) => sessionBookingCodes.includes(r.bookingCode));
      if (matched.length > 0 && !hasSearchedStatus) {
        setStatusResults(matched);
      }
    } catch {}
  }, [sessionBookingCodes, hasSearchedStatus]);

  useEffect(() => {
    // Set default date to today
    const todayStr = new Date().toISOString().split('T')[0];
    setForm((prev) => ({
      ...prev,
      appointmentDate: todayStr
    }));
  }, []);

  const getDayName = (dateStr: string): ScheduleDay => {
    if (!dateStr) return 'Senin';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 'Senin';
    const [y, m, d] = parts.map(Number);
    const date = new Date(y, m - 1, d);
    const dayNames: ScheduleDay[] = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return dayNames[date.getDay()] || 'Senin';
  };

  const selectedDayName = useMemo(() => getDayName(form.appointmentDate), [form.appointmentDate]);

  const matchesAppointmentDate = (sch: DutySchedule): boolean => {
    if (sch.scheduleDate && sch.scheduleDate.trim()) {
      return sch.scheduleDate.trim() === form.appointmentDate;
    }
    return sch.day === selectedDayName;
  };

  const doctorSchedulesForDay = useMemo(() => {
    return activeSchedules.filter((sch) => matchesAppointmentDate(sch) && sch.staffRole === 'Dokter');
  }, [activeSchedules, selectedDayName, form.appointmentDate]);

  const isDoctorOnLeaveOrOff = useMemo(() => {
    if (doctorSchedulesForDay.length === 0) return true;
    return doctorSchedulesForDay.every((sch) => sch.status === 'Cuti / Libur');
  }, [doctorSchedulesForDay]);

  const matchingDutySchedules = useMemo(() => {
    return activeSchedules.filter((sch) => {
      if (!matchesAppointmentDate(sch)) return false;
      if (sch.status === 'Cuti / Libur') return false;

      if (form.serviceType.includes('Poli Umum')) {
        return sch.serviceUnit.includes('Poli Umum') || sch.staffRole === 'Dokter';
      }
      if (form.serviceType.includes('Konseling Farmasi')) {
        return (
          sch.serviceUnit.includes('Konseling Farmasi') ||
          isOwnerAdminRole(sch.staffRole) ||
          sch.staffRole === 'Apoteker'
        );
      }
      return true;
    });
  }, [activeSchedules, selectedDayName, form.appointmentDate, form.serviceType]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.nik || form.nik.length < 16) {
      setFormError('Nomor Induk Kependudukan (NIK) harus terdiri dari 16 digit angka.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Nama lengkap pasien wajib diisi.');
      return;
    }
    if (!form.phone.trim()) {
      setFormError('Nomor WhatsApp aktif wajib diisi.');
      return;
    }
    if (!form.complaint.trim()) {
      setFormError('Keluhan atau gejala utama wajib diisi.');
      return;
    }

    setIsSubmitting(true);

    // 1. Pengecekan Otomatis (Duplicate Check) & Auto-Insert ke Supabase tabel_pasien
    let patientRecord: any = null;
    let isNewPatient = true;
    let syncNotice = '';

    try {
      const regResult = await checkOrRegisterPatientSupabase({
        nik: form.nik,
        name: form.name,
        birthDate: form.birthDate,
        gender: form.gender,
        phone: form.phone,
        address: form.address,
        allergy: form.allergy,
        category: 'Pasien Praktik'
      });
      patientRecord = regResult.patient;
      isNewPatient = regResult.isNew;
      syncNotice = regResult.message;

      setToastNotice({
        message: regResult.message,
        type: regResult.isNew ? 'success' : 'info'
      });
      setTimeout(() => setToastNotice(null), 6000);
    } catch (e: any) {
      console.warn('Gagal duplicate check Supabase:', e);
      syncNotice = 'Pendaftaran offline tersimpan lokal';
    }

    const assignedNoRm = patientRecord?.id || `RM-${Date.now().toString().slice(-4)}`;

    // Generate unique Booking Code and Virtual Queue Number
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const datePrefix = new Date().getFullYear().toString().slice(-2) + String(new Date().getMonth() + 1).padStart(2, '0');
    const bookingCode = `LTF-${datePrefix}-${randomSuffix}`;
    const queueNumber = `A-${String(Math.floor(1 + Math.random() * 30)).padStart(3, '0')}`;
    const createdAtTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const newRegData: OnlineRegistration = {
      id: `REG-${Date.now().toString().slice(-6)}`,
      bookingCode,
      nik: form.nik,
      name: form.name.trim(),
      phone: form.phone.trim(),
      birthDate: form.birthDate,
      gender: form.gender,
      address: form.address.trim(),
      appointmentDate: form.appointmentDate,
      appointmentTime: form.appointmentSession.includes('08:30') ? '08:30' : form.appointmentSession.includes('14:00') ? '14:00' : '18:30',
      doctorId: 'DOC-001',
      doctorName: 'dr. Anis Prima Dewi',
      serviceType: form.serviceType,
      paymentType: 'Umum / Mandiri',
      complaint: form.complaint.trim(),
      allergy: form.allergy.trim() || 'Tidak Ada',
      status: 'Menunggu Verifikasi',
      createdAt: createdAtTime,
      branchId: 'BR-01'
    };

    // 2. Simpan juga ke antrean registrasi online Supabase jika tabel pendaftaran_online tersedia (skip saat Mode Demo)
    const supabaseClient = isDemoMode() ? null : getSupabaseClient();
    const { onlineRegTable } = getSupabaseConfig();

    if (supabaseClient) {
      try {
        const rowData = onlineRegToSupabaseRow(newRegData);
        const { error: insErr } = await supabaseClient.from(onlineRegTable).insert([rowData]);
        if (insErr) {
          console.warn('[Supabase Public Reg Insert Error]:', insErr.message);
        } else {
          console.info('[Supabase Public Reg Insert Success]:', bookingCode);
        }
      } catch (err) {
        console.warn('[Supabase Client Exception]:', err);
      }
    }

    // 3. Simpan ke LocalStorage & BroadcastChannel (terisolasi saat Mode Demo)
    try {
      const existing = JSON.parse(demoGetItem('latisha_online_registrations') || '[]');
      existing.unshift(newRegData);
      demoSetItem('latisha_online_registrations', JSON.stringify(existing));

      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_online_registration_channel'));
        bc.postMessage({ type: 'NEW_REGISTRATION', payload: newRegData });
      }
    } catch (e) {
      console.warn('LocalStorage save warning:', e);
    }

    if (onNewRegistrationSuccess) {
      onNewRegistrationSuccess(newRegData);
    }

    setSessionBookingCodes((prev) => {
      const next = prev.includes(bookingCode) ? prev : [bookingCode, ...prev].slice(0, 20);
      try {
        window.sessionStorage.setItem('latisha_patient_session_bookings', JSON.stringify(next));
      } catch {}
      return next;
    });

    setSuccessTicket({
      bookingCode,
      queueNumber,
      name: form.name,
      nik: form.nik,
      noRm: assignedNoRm,
      isNewPatient,
      phone: form.phone,
      appointmentDate: form.appointmentDate,
      appointmentSession: form.appointmentSession,
      serviceType: form.serviceType,
      complaint: form.complaint,
      allergy: form.allergy,
      syncNotice
    });

    setIsSubmitting(false);
  };

  const handleCheckRegistrationStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = statusQuery.trim();
    setStatusLookupError('');
    if (!raw) {
      setStatusLookupError('Masukkan Kode Booking (mis. LTF-2611-xxxxx) atau NIK 16 digit.');
      return;
    }
    const digitsOnly = raw.replace(/\D/g, '');
    const isNikSearch = digitsOnly.length === 16;
    const isCodeSearch = raw.length >= 6;
    if (!isNikSearch && !isCodeSearch) {
      setStatusLookupError('Masukkan minimal 6 karakter Kode Booking atau lengkap 16 digit NIK.');
      return;
    }

    setIsCheckingStatus(true);
    setHasSearchedStatus(true);

    const normalized = raw.toUpperCase();
    const resultMap = new Map<string, OnlineRegistration>();

    try {
      const localList: OnlineRegistration[] = JSON.parse(demoGetItem('latisha_online_registrations') || '[]');
      localList.forEach((item) => {
        const matchCode = String(item.bookingCode || '').toUpperCase() === normalized;
        const matchNik = isNikSearch && String(item.nik || '').replace(/\D/g, '') === digitsOnly;
        if (matchCode || matchNik) {
          resultMap.set(item.bookingCode, item);
        }
      });
    } catch {}

    const supabaseClient = isDemoMode() ? null : getSupabaseClient();
    const { onlineRegTable } = getSupabaseConfig();
    if (supabaseClient) {
      try {
        const qBuilder = isNikSearch
          ? supabaseClient.from(onlineRegTable).select('*').eq('nik', digitsOnly).limit(10)
          : supabaseClient.from(onlineRegTable).select('*').ilike('booking_code', normalized).limit(10);
        const { data, error } = await qBuilder;
        if (!error && Array.isArray(data)) {
          data.forEach((row: any) => {
            const mapped = supabaseRowToOnlineReg(row);
            resultMap.set(mapped.bookingCode, mapped);
          });
        }
      } catch (err) {
        console.warn('Supabase status lookup fallback to local:', err);
      }
    }

    setStatusResults(Array.from(resultMap.values()));
    setIsCheckingStatus(false);
  };

  const handleCopyPublicLink = () => {
    const fullUrl = unifiedMode
      ? `${window.location.origin}/?view=portal-pelanggan&tab=pasien${isDemoMode() ? '&mode=demo' : ''}`
      : `${window.location.origin}/?view=daftar${isDemoMode() ? '&mode=demo' : ''}`;
    navigator.clipboard?.writeText(fullUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    });
  };

  return (
    <div className={`${unifiedMode ? 'py-3 px-3 sm:px-4 pb-24 sm:pb-10' : 'min-h-screen py-4 px-3 sm:px-6'} bg-gradient-to-b from-sky-50 via-slate-50 to-slate-100 text-slate-800 font-sans antialiased`}>
      <div className="max-w-xl mx-auto space-y-4">

        {/* TOP BAR BRANDING (Hidden when hosted inside UnifiedCustomerPortalView to avoid duplicate top bars) */}
        {!unifiedMode && (
          <div className="bg-white/90 backdrop-blur-md rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white p-1 border border-slate-200 flex items-center justify-center shadow-xs shrink-0 overflow-hidden">
                <img
                  src={`${import.meta.env.BASE_URL}assets/aistudio/logo_resmi_apotek_673c56f0.png`}
                  alt="Logo Apotek Latisha Farma"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Portal Pasien Online
                  </span>
                </div>
                <h1 className="font-extrabold text-sm text-slate-900 leading-tight">
                  Apotek & Layanan Medis LATISHA FARMA
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setChatOpenTrigger((n) => n + 1)}
                className="w-9 h-9 rounded-full bg-gradient-to-r from-sky-700 to-emerald-600 hover:from-sky-800 hover:to-emerald-700 text-white transition flex items-center justify-center shadow-xs cursor-pointer relative"
                title="Obrolan Pasien"
                aria-label="Buka obrolan interaktif dengan petugas apotek"
              >
                <span className="relative flex items-center justify-center">
                  <MessageCircle className="w-4 h-4" />
                  <span className="w-2 h-2 rounded-full bg-emerald-300 border border-sky-800 absolute -bottom-0.5 -right-0.5" />
                </span>
                {chatStatus.unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center border border-white/80">
                    {chatStatus.unreadCount}
                  </span>
                )}
              </button>
              {onBackToDashboard && (
                <button
                  type="button"
                  onClick={onBackToDashboard}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  title="Kembali ke Dashboard Utama"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dashboard</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* HERO BANNER CARD */}
        <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-indigo-700 rounded-3xl p-5 text-white shadow-xl shadow-sky-600/15 relative overflow-hidden">
          <div className="relative z-10 space-y-1.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
              Portal Mandiri Pasien
            </span>
            <h2 className="text-lg sm:text-xl font-black tracking-tight leading-snug">
              Daftar Mandiri Berobat &amp; Cek Status Antrean
            </h2>
            <p className="text-xs text-sky-100 leading-relaxed">
              Isi formulir pendaftaran rawat jalan di bawah ini. Anda akan langsung menerima <strong>Kode Booking &amp; Nomor Antrean Virtual</strong> untuk ditunjukkan kepada petugas saat tiba di Latisha Farma.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setChatOpenTrigger((n) => n + 1)}
                title="Obrolan Pasien"
                aria-label="Buka obrolan interaktif dengan petugas klinik"
                className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-white text-sky-700 hover:bg-sky-50 shadow-xs transition cursor-pointer relative"
              >
                <span className="relative flex items-center justify-center">
                  <MessageCircle className="w-4 h-4" />
                  <span className="w-2 h-2 rounded-full bg-emerald-500 border border-white absolute -bottom-0.5 -right-0.5" />
                </span>
                {chatStatus.unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center border border-white">
                    {chatStatus.unreadCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyPublicLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedLink ? 'Tautan Tersalin!' : 'Salin Link Portal Pasien'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* CEK STATUS BOOKING & ANTREAN PASIEN */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                Cek Status Pendaftaran &amp; Antrean
              </h3>
              <p className="text-[11px] text-slate-500">
                Masukkan Kode Booking atau 16 digit NIK untuk memantau verifikasi petugas.
              </p>
            </div>
          </div>

          <form onSubmit={handleCheckRegistrationStatus} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoComplete="off"
                placeholder="Kode Booking (LTF-...) atau NIK 16 digit"
                value={statusQuery}
                onChange={(e) => {
                  setStatusQuery(e.target.value);
                  if (statusLookupError) setStatusLookupError('');
                }}
                className="w-full min-h-[40px] pl-8 pr-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-mono text-xs font-bold outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <button
              type="submit"
              disabled={isCheckingStatus}
              className="min-h-[40px] px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              <span>Cek</span>
            </button>
          </form>

          {statusLookupError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{statusLookupError}</span>
            </div>
          )}

          {statusResults.length > 0 ? (
            <div className="space-y-2">
              {statusResults.map((reg) => (
                <div
                  key={reg.bookingCode}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-sky-800 text-xs">{reg.bookingCode}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          reg.status === 'Diterima'
                            ? 'bg-emerald-100 text-emerald-800'
                            : reg.status === 'Ditolak'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {reg.status}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-800">
                      {reg.name} · {reg.serviceType}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Jadwal: {reg.appointmentDate} ({reg.appointmentTime} WIB) · Dokter: {reg.doctorName}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : hasSearchedStatus && !isCheckingStatus ? (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-[11px] text-slate-500">
              Data pendaftaran tidak ditemukan untuk kode/NIK tersebut. Pastikan ejaan Kode Booking atau 16 digit NIK sudah tepat.
            </div>
          ) : null}
        </div>

        {/* INTERACTIVE REAL-TIME CHAT SECTION DIRECTLY ON PORTAL PAGE */}
        <PortalPatientLiveChat
          mode="inline"
          defaultPatientName={form.name}
          defaultPatientPhone={form.phone}
          schedules={activeSchedules}
          medicines={localMedicines}
          externalOpenTrigger={chatOpenTrigger}
          onStatusChange={setChatStatus}
        />

        {/* SUCCESS E-TICKET CARD */}
        {successTicket ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-fadeIn p-6 space-y-4">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 -m-6 mb-4 p-5 text-white text-center">
              <div className="w-12 h-12 bg-white/20 rounded-full mx-auto flex items-center justify-center mb-1 text-2xl font-bold">
                ✓
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-3 py-0.5 rounded-full inline-block">
                Pendaftaran Berhasil Dikirim
              </span>
              <h3 className="text-lg font-black mt-1">E-TIKET PENDAFTARAN PASIEN</h3>
              <p className="text-xs text-emerald-100">Apotek & Layanan Medis Latisha Farma</p>
            </div>

            {/* Toast / Status Alert */}
            <div className={`p-3.5 rounded-2xl border text-xs font-bold flex items-start gap-2.5 ${
              successTicket.isNewPatient
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-sky-50 text-sky-900 border-sky-300'
            }`}>
              <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${successTicket.isNewPatient ? 'text-emerald-600' : 'text-sky-600'}`} />
              <div className="space-y-0.5">
                <span className="block font-black uppercase tracking-wider text-[10px]">
                  {successTicket.isNewPatient ? '🎉 Pasien Baru Terdaftar Otomatis' : '📋 Pasien Lama Teridentifikasi'}
                </span>
                <p className="text-[11px] font-medium leading-relaxed">{successTicket.syncNotice}</p>
              </div>
            </div>

            {/* Booking Box */}
            <div className="bg-emerald-50/70 border-2 border-emerald-500 rounded-2xl p-4 text-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">KODE BOOKING</span>
              <div className="text-3xl font-black font-mono text-emerald-800 tracking-wider my-1">
                {successTicket.bookingCode}
              </div>
              <div className="inline-flex items-center gap-2 mt-1 px-3 py-1 bg-white rounded-xl border border-emerald-300 shadow-xs">
                <span className="text-[10px] font-bold text-slate-500">Nomor Antrean Virtual:</span>
                <strong className="text-base font-mono font-black text-emerald-700">{successTicket.queueNumber}</strong>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Nomor Rekam Medis (RM):</span>
                <strong className="text-sky-800 font-mono font-black text-sm">{successTicket.noRm}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Status Pasien:</span>
                <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                  successTicket.isNewPatient ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                }`}>
                  {successTicket.isNewPatient ? 'Pasien Baru (Auto-Insert)' : 'Pasien Lama (Checked)'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Nama Pasien:</span>
                <strong className="text-slate-900 font-bold">{successTicket.name}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">NIK:</span>
                <strong className="text-slate-800 font-mono">{successTicket.nik}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Tanggal Kunjungan:</span>
                <strong className="text-slate-900 font-bold">{successTicket.appointmentDate}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Sesi Jam Praktek:</span>
                <strong className="text-indigo-800 font-bold">{successTicket.appointmentSession}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Layanan Poli:</span>
                <strong className="text-slate-800 font-bold">{successTicket.serviceType}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Riwayat Alergi:</span>
                <strong className="text-rose-700 font-bold">{successTicket.allergy || 'Tidak Ada'}</strong>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const msg = encodeURIComponent(
                    `Halo Latisha Farma, saya telah mendaftar online.\n\n` +
                    `*KODE BOOKING*: ${successTicket.bookingCode}\n` +
                    `*NO. ANTREAN*: ${successTicket.queueNumber}\n` +
                    `*Nama Pasien*: ${successTicket.name}\n` +
                    `*NIK*: ${successTicket.nik}\n` +
                    `*Jadwal Kunjungan*: ${successTicket.appointmentDate} (${successTicket.appointmentSession})\n` +
                    `*Poli*: ${successTicket.serviceType}\n` +
                    `*Alergi*: ${successTicket.allergy}\n\n` +
                    `Mohon konfirmasi kedatangan saya. Terima kasih.`
                  );
                  window.open(`https://wa.me/62895326272957?text=${msg}`, '_blank');
                }}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Simpan / Kirim Bukti ke WhatsApp</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Tiket</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSuccessTicket(null);
                    lookupReqIdRef.current += 1;
                    lastLookedUpNikRef.current = '';
                    wasAutoFilledRef.current = false;
                    setNikLookupStatus('idle');
                    setMatchedMasterPatient(null);
                    setForm((prev) => ({
                      ...prev,
                      nik: '',
                      name: '',
                      birthDate: '1995-06-15',
                      gender: 'Laki-laki',
                      phone: '',
                      address: '',
                      complaint: '',
                      allergy: 'Tidak Ada'
                    }));
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
                >
                  Daftar Lagi
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* REGISTRATION FORM */
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-extrabold text-base text-slate-900">Formulir Pendaftaran Online</h3>
              <p className="text-xs text-slate-500">Tanda bintang (<span className="text-rose-500 font-bold">*</span>) wajib diisi</p>
            </div>

            {isDoctorOnLeaveOrOff && (
              <div className="bg-rose-600 text-white p-4 rounded-2xl shadow-lg border-2 border-rose-700 text-center space-y-2 mb-4 animate-pulse">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full font-black text-xs uppercase tracking-widest">
                  <span>🚫</span> PENDAFTARAN TUTUP & TERKUNCI
                </div>
                <h3 className="text-lg sm:text-xl font-black tracking-wide">
                  SAAT INI TIDAK ADA DOKTER
                </h3>
                <p className="text-xs text-rose-100">
                  Jadwal praktik dokter pada hari <strong>{selectedDayName}</strong> sedang Cuti / Libur atau tidak tersedia. Pendaftaran mandiri online ditutup sementara waktu.
                </p>
              </div>
            )}

            {toastNotice && (
              <div className={`mb-4 p-3 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
                toastNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-sky-50 border-sky-300 text-sky-900'
              }`}>
                <span>{toastNotice.message}</span>
                <button type="button" onClick={() => setToastNotice(null)} className="p-1 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {formError && (
              <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
                <button type="button" onClick={() => setFormError('')} className="p-1 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className={`space-y-4 text-xs ${isDoctorOnLeaveOrOff ? 'opacity-60 pointer-events-none' : ''}`}>

              {/* SECTION 1: IDENTITAS */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px]">1</span>
                  <span>Data Identitas Pasien</span>
                </div>

                {/* NIK */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nomor Induk Kependudukan (NIK) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      required
                      maxLength={16}
                      placeholder="16 Digit KTP/KK..."
                      value={form.nik}
                      onChange={(e) => setForm({ ...form, nik: e.target.value.replace(/\D/g, '').slice(0, 16) })}
                      onBlur={(e) => {
                        const clean = e.target.value.replace(/\D/g, '').slice(0, 16);
                        if (clean.length === 16) {
                          performNikLookup(clean);
                        }
                      }}
                      className={`w-full p-2.5 pr-9 border rounded-xl font-mono font-bold bg-slate-50 focus:bg-white focus:ring-2 outline-none transition ${
                        nikLookupStatus === 'found'
                          ? 'border-emerald-400 focus:ring-emerald-500'
                          : 'focus:ring-sky-500'
                      }`}
                    />
                    {nikLookupStatus === 'searching' && (
                      <RefreshCw className="w-4 h-4 text-sky-600 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                    {nikLookupStatus === 'found' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>

                  {nikLookupStatus === 'searching' ? (
                    <span className="text-[11px] text-sky-700 font-bold mt-1 flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Membaca Master Data Pasien berdasarkan NIK...</span>
                    </span>
                  ) : nikLookupStatus === 'found' && matchedMasterPatient ? (
                    <div className="mt-1.5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-extrabold">
                          Data Pasien Terdaftar Ditemukan (No. RM: {matchedMasterPatient.noRm || matchedMasterPatient.id})
                        </div>
                        <p className="text-[10.5px] text-emerald-800 leading-snug">
                          Kolom identitas dan riwayat alergi di bawah otomatis terisi dari Master Data Pasien. Anda tetap dapat memperbarui data bila ada perubahan.
                        </p>
                      </div>
                    </div>
                  ) : nikLookupStatus === 'not_found' ? (
                    <span className="text-[10.5px] text-sky-700 font-semibold mt-1 block">
                      NIK belum terdaftar di Master Data Pasien. Silakan lengkapi data diri di bawah untuk pendaftaran pasien baru.
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      16 digit angka KTP/KK — jika NIK sudah terdaftar, data pasien terisi otomatis
                    </span>
                  )}
                </div>

                {/* NAMA LENGKAP */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Lengkap Pasien <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Sesuai KTP / Nama Pasien..."
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none capitalize"
                  />
                </div>

                {/* TANGGAL LAHIR & JENIS KELAMIN */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tanggal Lahir *</label>
                    <input
                      type="date"
                      required
                      value={form.birthDate}
                      onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                      className="w-full p-2.5 border rounded-xl font-bold bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Jenis Kelamin *</label>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value as 'Laki-laki' | 'Perempuan' })}
                      className="w-full p-2.5 border rounded-xl font-bold bg-slate-50 focus:bg-white"
                    >
                      <option value="Laki-laki">Laki-laki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </div>
                </div>

                {/* NO WHATSAPP */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nomor WhatsApp Aktif <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Contoh: 081234567890"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
                    className="w-full p-2.5 border rounded-xl font-mono font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Kode booking dan pengingat antrean dikirim ke nomor ini</span>
                </div>

                {/* ALAMAT */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Alamat Domisili</label>
                  <input
                    type="text"
                    placeholder="Kecamatan, Desa, atau Alamat lengkap domisili..."
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full p-2.5 border rounded-xl bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              {/* SECTION 2: JADWAL & POLI */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px]">2</span>
                  <span>Jadwal Kunjungan & Poli</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tanggal Kunjungan *</label>
                    <input
                      type="date"
                      required
                      value={form.appointmentDate}
                      onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })}
                      className="w-full p-2.5 border rounded-xl font-bold bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Pilihan Sesi / Jam Praktek Dokter & Petugas *
                    </label>
                    <select
                      value={form.appointmentSession}
                      onChange={(e) => setForm({ ...form, appointmentSession: e.target.value })}
                      className="w-full p-2.5 border rounded-xl font-bold bg-slate-50 focus:bg-white text-xs outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      {matchingDutySchedules.length > 0 && (
                        <optgroup label={`Jadwal Dokter & Petugas Hari ${selectedDayName}`}>
                          {matchingDutySchedules.map((sch) => (
                            <option
                              key={sch.id}
                              value={`${sch.staffName} (${sch.staffRole}) — ${sch.startTime} - ${sch.endTime} WIB [${sch.sessionLabel}]`}
                            >
                              👨‍⚕️ {sch.staffName} — {sch.startTime} - {sch.endTime} WIB ({sch.sessionLabel})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Pilihan Sesi / Jam Lainnya">
                        <option value="Full Day (Fleksibel) — 08:00 - 20:00 WIB">
                          Full Day (Fleksibel) — 08:00 - 20:00 WIB
                        </option>
                        <option value="Pagi (08:00 - 12:00 WIB)">Pagi (08:00 - 12:00 WIB)</option>
                        <option value="Siang (13:00 - 17:00 WIB)">Siang (13:00 - 17:00 WIB)</option>
                        <option value="Malam (18:00 - 21:00 WIB)">Malam (18:00 - 21:00 WIB)</option>
                        <option value="Sesuai Perjanjian / On-Call">Sesuai Perjanjian / On-Call</option>
                      </optgroup>
                    </select>
                    <div className="mt-1.5 p-2 rounded-xl bg-sky-50 border border-sky-200 text-[10px] text-sky-950 flex items-start gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-600 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-bold">Hari {selectedDayName}: </span>
                        {matchingDutySchedules.length > 0 ? (
                          <span>
                            Petugas on-duty: <strong className="text-slate-900">{matchingDutySchedules.map((s) => `${s.staffName} (${s.startTime} - ${s.endTime} WIB)`).join(', ')}</strong>
                          </span>
                        ) : (
                          <span>Layanan buka fleksibel pukul <strong>08.00 - 20.00 WIB</strong></span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Layanan Poli Tujuan *</label>
                  <select
                    value={form.serviceType}
                    onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-bold bg-slate-50 focus:bg-white"
                  >
                    <option value="Poli Umum (Pemeriksaan Dokter & Pengobatan)">Poli Umum (Pemeriksaan Dokter & Pengobatan)</option>
                    <option value="Konseling Farmasi (Pelayanan Informasi Obat & Terapi)">Konseling Farmasi (Pelayanan Informasi Obat & Terapi)</option>
                  </select>
                </div>
              </div>

              {/* SECTION 3: KELUHAN & ALERGI */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px]">3</span>
                  <span>Keluhan Medis & Alergi</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Keluhan / Gejala Utama yang Dirasakan <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Contoh: Demam 2 hari, batuk, sesak, pusing berputar, mual..."
                    value={form.complaint}
                    onChange={(e) => setForm({ ...form, complaint: e.target.value })}
                    className="w-full p-3 border rounded-xl bg-slate-50 focus:bg-white outline-none"
                  />
                </div>

                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <label className="block font-bold text-rose-900 mb-1 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    Riwayat Alergi Obat (Jika Ada)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Alergi Amoxicillin, Alergi Paracetamol (Tulis 'Tidak Ada' bila tidak ada)"
                    value={form.allergy}
                    onChange={(e) => setForm({ ...form, allergy: e.target.value })}
                    className="w-full p-2 border border-rose-300 rounded-lg text-rose-900 font-bold bg-white"
                  />
                  <span className="text-[10px] text-rose-600 mt-1 block">
                    Informasi ini sangat penting untuk keselamatan pengobatan Anda oleh dokter dan apoteker.
                  </span>
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-sky-600 via-indigo-600 to-indigo-700 hover:from-sky-500 hover:to-indigo-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-xl shadow-sky-600/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'Mengirim Pendaftaran...' : 'Kirim Pendaftaran Berobat Online'}</span>
                </button>
              </div>

            </form>
          </div>
        )}

      </div>

      {/* Floating Chat Trigger only in standalone full-page portal mode when not hosted by UnifiedCustomerPortalView */}
      {!embedded && !hideFloatingChat && (
        <PortalPatientLiveChat
          mode="floating"
          defaultPatientName={form.name}
          defaultPatientPhone={form.phone}
          schedules={activeSchedules}
          medicines={localMedicines}
          floatingPositionClass={
            unifiedMode
              ? 'bottom-[4.85rem] right-4 sm:bottom-5 sm:right-5'
              : 'bottom-4 right-4 sm:bottom-5 sm:right-5'
          }
        />
      )}
    </div>
  );
};
