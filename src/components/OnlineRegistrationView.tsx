import React, { useState, useEffect } from 'react';
import {
  Globe,
  CheckCircle2,
  XCircle,
  Search,
  UserCheck,
  Calendar,
  Clock,
  QrCode,
  ShieldAlert,
  Send,
  Plus,
  ExternalLink,
  Copy
} from 'lucide-react';
import { OnlineRegistration, Patient, Doctor, PatientQueue, DutySchedule } from '../types';
import { PublicPatientRegistration } from './PublicPatientRegistration';
import {
  getSupabaseConfig,
  setSupabaseConfig,
  SUPABASE_ONLINE_REG_SQL_SCHEMA,
  SUPABASE_PATIEN_SQL_SCHEMA
} from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { Database, RefreshCw, Check, AlertTriangle, Code } from 'lucide-react';
import { getDemoBroadcastChannelName, isDemoMode } from '../utils/demoSandbox';
import { buildPortalUrl } from '../utils/portalUrlHelper';
import { PortalQRGeneratorModal } from './PortalQRGeneratorModal';

interface OnlineRegistrationViewProps {
  registrations: OnlineRegistration[];
  schedules?: DutySchedule[];
  onAddRegistration: (reg: OnlineRegistration) => void;
  onUpdateStatus: (id: string, status: OnlineRegistration['status']) => void;
  onAcceptToQueue: (reg: OnlineRegistration) => void;
  doctors: Doctor[];
  patients: Patient[];
  onReloadFromSupabase?: () => Promise<{ success: boolean; count?: number; error?: string }>;
}

export const OnlineRegistrationView: React.FC<OnlineRegistrationViewProps> = ({
  registrations,
  schedules,
  onAddRegistration,
  onUpdateStatus,
  onAcceptToQueue,
  doctors,
  patients,
  onReloadFromSupabase
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'verifikasi' | 'portal'>('verifikasi');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('SEMUA');
  const [copiedLink, setCopiedLink] = useState(false);

  const isOwnerAdmin = useIsOwnerAdmin();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [supabaseConfig, setConfigState] = useState(getSupabaseConfig());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const isSupabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.key);

  useEffect(() => {
    // Listen to real-time events from public registration standalone page (BroadcastChannel)
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_online_registration_channel'));
      bc.onmessage = (event) => {
        if (event.data?.type === 'NEW_REGISTRATION' && event.data?.payload) {
          onAddRegistration(event.data.payload);
        }
      };
      return () => bc.close();
    }
  }, [onAddRegistration]);

  const handleManualSync = async () => {
    if (!onReloadFromSupabase) return;
    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      const res = await onReloadFromSupabase();
      if (res.success) {
        setSyncStatusMsg({ text: `Sinkronisasi berhasil! Memuat ${res.count ?? 0} pendaftaran online dari Supabase.` });
      } else {
        setSyncStatusMsg({ text: res.error || 'Gagal menarik data pendaftaran online dari Supabase', isError: true });
      }
    } catch (err: any) {
      setSyncStatusMsg({ text: err?.message || 'Koneksi ke Supabase gagal', isError: true });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setSupabaseConfig(supabaseConfig);
    setShowConfigModal(false);
    if (onReloadFromSupabase && supabaseConfig.url && supabaseConfig.key) {
      handleManualSync();
    }
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(SUPABASE_ONLINE_REG_SQL_SCHEMA);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2500);
  };

  const handleCopyPortalLink = () => {
    const fullUrl = buildPortalUrl({ view: 'portal-pelanggan', tab: 'pasien' });
    navigator.clipboard?.writeText(fullUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    });
  };

  const filteredRegistrations = registrations.filter((reg) => {
    const matchSearch =
      reg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reg.bookingCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reg.nik.includes(searchTerm) ||
      reg.phone.includes(searchTerm);
    const matchStatus = statusFilter === 'SEMUA' || reg.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Tab Switcher: Verification Panel vs Public Portal */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('verifikasi')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
              activeSubTab === 'verifikasi'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Panel Verifikasi Pendaftaran Online</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-sky-200 text-sky-900 font-black">
              {registrations.filter((r) => r.status === 'Menunggu Verifikasi').length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('portal')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
              activeSubTab === 'portal'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Pratinjau Portal Mandiri Pasien</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Supabase Live Status Badge & Actions */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
            <span className="flex h-2.5 w-2.5 relative">
              {isSupabaseConfigured && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isSupabaseConfigured ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              ></span>
            </span>
            <span className="text-[11px] font-bold text-slate-700">
              {isSupabaseConfigured ? 'Supabase Live' : 'Supabase Offline'}
            </span>
            <button
              onClick={handleManualSync}
              disabled={isSyncing || !isSupabaseConfigured}
              title="Tarik data terbaru pendaftaran online dari Supabase"
              className={`ml-1 p-1 rounded-md text-slate-600 hover:text-sky-600 hover:bg-white transition ${
                isSyncing ? 'animate-spin text-sky-600' : ''
              } ${!isSupabaseConfigured ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {isOwnerAdmin && (
              <button
                onClick={() => setShowConfigModal(true)}
                title="Pengaturan Koneksi & Skema SQL Supabase Pendaftaran Online"
                className="p-1 rounded-md text-slate-600 hover:text-sky-600 hover:bg-white transition cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Buat, Unduh & Cetak QR Code Portal Pasien & Pelanggan"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>QR &amp; Poster Apotek</span>
          </button>

          <a
            href={buildPortalUrl({ view: 'portal-pelanggan', tab: 'pasien' })}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
            title="Buka Aplikasi Pelanggan & Pasien Terpadu di Tab Baru"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Buka Portal Pasien (PWA)</span>
          </a>

          <button
            type="button"
            onClick={handleCopyPortalLink}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 cursor-pointer"
            title="Salin Tautan Publik untuk Dibagikan ke WhatsApp / Pasien"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedLink ? 'Tersalin!' : 'Salin Link Pasien'}</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner if any */}
      {syncStatusMsg && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            syncStatusMsg.isError
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {syncStatusMsg.isError ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{syncStatusMsg.text}</span>
        </div>
      )}

      {activeSubTab === 'verifikasi' ? (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-3 text-xs">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari kode booking, nama pasien, atau NIK..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-xl font-semibold bg-slate-50 focus:bg-white outline-none"
              />
            </div>

            <div className="flex items-center gap-2 font-medium">
              <span className="text-slate-500 font-bold">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="p-2 border rounded-xl bg-white font-bold text-slate-700 outline-none"
              >
                <option value="SEMUA">Semua Status</option>
                <option value="Menunggu Verifikasi">Menunggu Verifikasi</option>
                <option value="Diterima">Diterima</option>
                <option value="Ditolak">Ditolak</option>
              </select>
            </div>
          </div>

          {/* Registrations List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto w-full custom-scrollbar">
              <table className="w-full min-w-[780px] text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600 text-[11px]">
                <tr>
                  <th className="p-3">Kode Booking & Waktu</th>
                  <th className="p-3">Data Pasien</th>
                  <th className="p-3">Tujuan Poli & Dokter</th>
                  <th className="p-3">Keluhan Pasien</th>
                  <th className="p-3">Metode Bayar</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Aksi Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400 italic">
                      Tidak ada permohonan pendaftaran online yang cocok.
                    </td>
                  </tr>
                ) : (
                  filteredRegistrations.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono">
                        <span className="font-extrabold text-sky-700 text-sm block">
                          {item.bookingCode}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {item.appointmentDate} · {item.appointmentTime} WIB
                        </span>
                      </td>

                      <td className="p-3">
                        <strong className="text-slate-900 block">{item.name}</strong>
                        <span className="text-[10px] text-slate-500 font-mono">
                          NIK: {item.nik} · WA: {item.phone}
                        </span>
                        {item.allergy && item.allergy !== 'Tidak Ada' && (
                          <span className="block text-[10px] font-bold text-rose-600 mt-0.5">
                            Alergi: {item.allergy}
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">{item.serviceType}</span>
                        <span className="text-[10px] text-sky-700">{item.doctorName}</span>
                      </td>

                      <td className="p-3 max-w-[200px]">
                        <p className="truncate text-slate-600">{item.complaint}</p>
                      </td>

                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                          {item.paymentType}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            item.status === 'Menunggu Verifikasi'
                              ? 'bg-amber-100 text-amber-800 animate-pulse'
                              : item.status === 'Diterima'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td className="p-3 text-center space-x-1.5">
                        {item.status === 'Menunggu Verifikasi' ? (
                          <>
                            <button
                              onClick={() => onAcceptToQueue(item)}
                              title="Verifikasi dan terbitkan nomor antrean poli hari ini"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shadow-xs transition inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Terima & Antre</span>
                            </button>
                            <button
                              onClick={() => onUpdateStatus(item.id, 'Ditolak')}
                              title="Tolak pendaftaran"
                              className="px-2 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-bold text-[11px] transition"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="text-slate-400 font-bold text-[11px]">
                            {item.status === 'Diterima' ? '✓ Masuk Antrean' : '× Ditolak'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Public Patient Registration View */
        <PublicPatientRegistration
          embedded
          schedules={schedules}
          patients={patients}
          onBackToDashboard={() => setActiveSubTab('verifikasi')}
          onNewRegistrationSuccess={(reg) => {
            onAddRegistration(reg);
          }}
        />
      )}

      {/* Supabase Connection & SQL Schema Modal for Online Registrations */}
      {isOwnerAdmin && showConfigModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Integrasi Supabase Pendaftaran Online</h3>
                  <p className="text-[11px] text-slate-400">Sinkronisasi Real-time Pendaftaran Pasien Mandiri (Smartphone/Public)</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sky-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-600" />
                  Real-time Sync Pendaftaran Mandiri Pasien
                </p>
                <ul className="list-disc list-inside text-[11px] space-y-1 text-sky-800 pl-1">
                  <li><strong>Mandiri Pasien:</strong> Pendaftaran dari smartphone pasien (`/pendaftaran-pasien.html`) langsung ter-insert ke Supabase.</li>
                  <li><strong>Panel Verifikasi:</strong> Aplikasi klinik menerima pendaftaran baru secara live via Supabase Real-time tanpa perlu refresh.</li>
                </ul>
              </div>

              {/* Form Settings */}
              <form onSubmit={handleSaveConfig} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Kredensial Project Supabase</h4>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://xyzcompany.supabase.co"
                    value={supabaseConfig.url}
                    onChange={(e) => setConfigState({ ...supabaseConfig, url: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Supabase Anon / Public API Key
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    value={supabaseConfig.key}
                    onChange={(e) => setConfigState({ ...supabaseConfig, key: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-500 outline-none font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nama Tabel Pendaftaran Online
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="pendaftaran_online"
                      value={supabaseConfig.onlineRegTable}
                      onChange={(e) => setConfigState({ ...supabaseConfig, onlineRegTable: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-500 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nama Tabel Master Pasien
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="pasien"
                      value={supabaseConfig.patientTable}
                      onChange={(e) => setConfigState({ ...supabaseConfig, patientTable: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-500 outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Simpan & Aktifkan Sync</span>
                  </button>
                </div>
              </form>

              {/* SQL Schema Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-slate-600" />
                    <h4 className="font-bold text-slate-800 text-xs">Skema DDL SQL Tabel Pendaftaran Online</h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySchema}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSchema ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Skrip SQL</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-slate-500">
                  Salin skrip SQL berikut dan jalankan di <strong>SQL Editor</strong> Supabase Dashboard Anda untuk membuat tabel <code>pendaftaran_online</code>:
                </p>

                <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-48">
                  <pre>{SUPABASE_ONLINE_REG_SQL_SCHEMA}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <PortalQRGeneratorModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        defaultTarget="unified"
      />
    </div>
  );
};

