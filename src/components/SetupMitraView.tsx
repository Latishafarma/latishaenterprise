import React, { useState, useMemo } from 'react';
import {
  Handshake,
  Search,
  Plus,
  Building,
  Phone,
  FileBadge,
  MapPin,
  Edit2,
  Trash2,
  X,
  CheckCircle,
  Building2,
  User,
  Database,
  RefreshCw,
  Code,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Upload,
  FileText,
  Image as ImageIcon,
  Eye,
  Download
} from 'lucide-react';
import { Mitra } from '../types';
import {
  SUPABASE_MITRA_SQL_SCHEMA,
  DEFAULT_MITRA_TABLE,
  getSupabaseConfig,
  setSupabaseConfig
} from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';
import { processMitraLicenseFile, isPdfLicenseFile } from '../utils/mitraLicenseFile';

interface SetupMitraViewProps {
  mitraList: Mitra[];
  onAddMitra: (mitra: Mitra) => void;
  onUpdateMitra: (mitra: Mitra) => void;
  onDeleteMitra: (id: string) => void;
  onSyncSupabase?: () => Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }>;
  isDemoSandbox?: boolean;
}

export const SetupMitraView: React.FC<SetupMitraViewProps> = ({
  mitraList,
  onAddMitra,
  onUpdateMitra,
  onDeleteMitra,
  onSyncSupabase,
  isDemoSandbox = false
}) => {
  const isOwnerAdmin = useIsOwnerAdmin();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingMitra, setEditingMitra] = useState<Mitra | null>(null);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Supabase sync & schema UI states
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [mitraTableInput, setMitraTableInput] = useState(() => getSupabaseConfig().mitraTable);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    licenseNo: '',
    licenseFileUrl: '',
    licenseFileName: '',
    licenseFileType: '',
    licenseUploadedAt: '',
    address: '',
    category: 'Klinik Pratama' as Mitra['category'],
    picName: ''
  });
  const [isProcessingLicenseFile, setIsProcessingLicenseFile] = useState(false);
  const [previewLicenseMitra, setPreviewLicenseMitra] = useState<Mitra | null>(null);
  const [copiedMitraId, setCopiedMitraId] = useState<string | null>(null);

  const filteredMitra = useMemo(() => {
    return mitraList.filter((m) => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = m.name.toLowerCase().includes(q);
        const matchPhone = m.phone.toLowerCase().includes(q);
        const matchLicense = m.licenseNo.toLowerCase().includes(q);
        const matchAddress = m.address.toLowerCase().includes(q);
        const matchPic = (m.picName || '').toLowerCase().includes(q);
        return matchName || matchPhone || matchLicense || matchAddress || matchPic;
      }
      return true;
    });
  }, [mitraList, searchTerm, categoryFilter]);

  const handleOpenAddModal = () => {
    setEditingMitra(null);
    setFormError('');
    setFormData({
      name: '',
      phone: '',
      licenseNo: '',
      licenseFileUrl: '',
      licenseFileName: '',
      licenseFileType: '',
      licenseUploadedAt: '',
      address: '',
      category: 'Klinik Pratama',
      picName: ''
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (mitra: Mitra) => {
    setEditingMitra(mitra);
    setFormError('');
    setFormData({
      name: mitra.name,
      phone: mitra.phone,
      licenseNo: mitra.licenseNo,
      licenseFileUrl: mitra.licenseFileUrl || '',
      licenseFileName: mitra.licenseFileName || '',
      licenseFileType: mitra.licenseFileType || '',
      licenseUploadedAt: mitra.licenseUploadedAt || '',
      address: mitra.address,
      category: mitra.category || 'Klinik Pratama',
      picName: mitra.picName || ''
    });
    setShowModal(true);
  };

  const handleSelectLicenseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError('');
    setIsProcessingLicenseFile(true);
    try {
      const processed = await processMitraLicenseFile(file);
      setFormData((prev) => ({
        ...prev,
        licenseFileUrl: processed.dataUrl,
        licenseFileName: processed.fileName,
        licenseFileType: processed.fileType,
        licenseUploadedAt: processed.uploadedAt
      }));
    } catch (err: any) {
      setFormError(err?.message || 'Gagal memproses file izin fasilitas.');
    } finally {
      setIsProcessingLicenseFile(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim() || !formData.licenseNo.trim() || !formData.address.trim()) {
      setFormError('Harap lengkapi semua kolom wajib (Nama Faskes, No. Tlp, No. Izin, Alamat).');
      return;
    }
    if (!formData.licenseFileUrl) {
      setFormError('File izin fasilitas (format PDF atau JPG) wajib diunggah sebelum menyimpan data mitra.');
      return;
    }

    setFormError('');
    if (editingMitra) {
      const updated: Mitra = {
        ...editingMitra,
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        licenseNo: formData.licenseNo.trim(),
        licenseFileUrl: formData.licenseFileUrl,
        licenseFileName: formData.licenseFileName || 'izin-fasilitas',
        licenseFileType: formData.licenseFileType || undefined,
        licenseUploadedAt: formData.licenseUploadedAt || new Date().toISOString(),
        address: formData.address.trim(),
        category: formData.category,
        picName: formData.picName.trim()
      };
      onUpdateMitra(updated);
      setSyncToast({
        type: 'success',
        message: isDemoSandbox
          ? `Perubahan mitra "${updated.name}" disimpan ke Mode Demo.`
          : `Perubahan mitra "${updated.name}" disimpan & disinkronkan ke Supabase.`
      });
    } else {
      const randTwo = Math.floor(10 + Math.random() * 90);
      const newMitra: Mitra = {
        id: `MTR-${String(Date.now()).slice(-4)}${randTwo}`,
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        licenseNo: formData.licenseNo.trim(),
        licenseFileUrl: formData.licenseFileUrl,
        licenseFileName: formData.licenseFileName || 'izin-fasilitas',
        licenseFileType: formData.licenseFileType || undefined,
        licenseUploadedAt: formData.licenseUploadedAt || new Date().toISOString(),
        address: formData.address.trim(),
        category: formData.category,
        picName: formData.picName.trim(),
        createdAt: new Date().toISOString().split('T')[0]
      };
      onAddMitra(newMitra);
      setSyncToast({
        type: 'success',
        message: isDemoSandbox
          ? `Mitra baru "${newMitra.name}" disimpan ke Mode Demo.`
          : `Mitra baru "${newMitra.name}" disimpan & disinkronkan ke Supabase.`
      });
    }

    setShowModal(false);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteMitra(deleteTarget.id);
    setSyncToast({
      type: 'success',
      message: isDemoSandbox
        ? `Mitra "${deleteTarget.name}" dihapus dari Mode Demo.`
        : `Mitra "${deleteTarget.name}" dihapus secara lokal & di Supabase.`
    });
    setDeleteTarget(null);
  };

  const handleRunSupabaseSync = async () => {
    if (!onSyncSupabase) return;
    setIsSyncing(true);
    setSyncToast(null);
    try {
      const res = await onSyncSupabase();
      if (res.isDemo) {
        setSyncToast({
          type: 'warning',
          message: 'Mode Demo / Sandbox aktif. Sinkronisasi ke Supabase produksi dinonaktifkan otomatis.'
        });
      } else if (res.success) {
        setSyncToast({
          type: 'success',
          message: `Sinkronisasi 2-arah berhasil! Total ${res.count ?? mitraList.length} data faskes mitra tersinkron dengan Supabase.`
        });
      } else if (res.needsTableSetup) {
        setSyncToast({
          type: 'warning',
          message: 'Tabel "mitra" di Supabase belum dibuat atau RLS belum aktif. Klik "Skema SQL Supabase" untuk menyalin DDL tabel.'
        });
        setShowSchemaModal(true);
      } else {
        setSyncToast({
          type: 'error',
          message: res.error || 'Gagal menyinkronkan data mitra ke Supabase.'
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveTableName = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSandbox) return;
    const cleaned = mitraTableInput.trim() || DEFAULT_MITRA_TABLE;
    setMitraTableInput(cleaned);
    setSupabaseConfig({ mitraTable: cleaned });
    handleRunSupabaseSync();
  };

  const handleCopySchema = () => {
    navigator.clipboard?.writeText(SUPABASE_MITRA_SQL_SCHEMA).then(() => {
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2500);
    }).catch(() => {});
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Handshake className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              Master Data Mitra (Fasilitas Kesehatan)
            </h1>
            {isDemoSandbox ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Mode Demo (Lokal)
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <Database className="w-3 h-3" />
                Supabase Live 2-Arah
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pengelolaan direktori mitra klinik, apotek rekanan, praktik mandiri dokter, dan fasilitas kesehatan jejaring.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSyncSupabase && (
            <button
              type="button"
              onClick={handleRunSupabaseSync}
              disabled={isSyncing}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl font-bold text-xs transition disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
            </button>
          )}

          {isOwnerAdmin && (
            <button
              type="button"
              onClick={() => {
                setMitraTableInput(getSupabaseConfig().mitraTable);
                setShowSchemaModal(true);
              }}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs transition"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Skema SQL Supabase</span>
            </button>
          )}

          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Mitra Baru</span>
          </button>
        </div>
      </div>

      {/* Sync Toast Banner */}
      {syncToast && (
        <div
          className={`rounded-2xl px-4 py-3 border text-xs font-medium flex items-center justify-between gap-3 ${
            syncToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : syncToast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{syncToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Live Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cari berdasarkan Nama Faskes, No. Izin, Alamat, atau No. Telepon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-bold whitespace-nowrap">Kategori:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50 focus:outline-none"
          >
            <option value="all">Semua Kategori Faskes</option>
            <option value="Klinik Pratama">Klinik Pratama</option>
            <option value="Klinik Utama">Klinik Utama</option>
            <option value="Apotek Mitra">Apotek Mitra</option>
            <option value="Praktik Dokter Mandiri">Praktik Dokter Mandiri</option>
            <option value="Rumah Sakit">Rumah Sakit</option>
            <option value="Lainnya">Lainnya</option>
          </select>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-3 w-12 text-center">No</th>
                <th className="p-3">Nama Faskes</th>
                <th className="p-3">No. Izin Operasional</th>
                <th className="p-3">Kontak / No. Telepon</th>
                <th className="p-3">Alamat Lengkap</th>
                <th className="p-3">Kategori & PIC</th>
                <th className="p-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMitra.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Building className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="font-bold">Belum ada data fasilitas kesehatan mitra yang ditemukan.</p>
                    <p className="text-[11px] mt-0.5">Klik tombol "Tambah Mitra Baru" atau "Sinkronkan Supabase".</p>
                  </td>
                </tr>
              ) : (
                filteredMitra.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>{m.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          ID Mitra: {m.id}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              navigator.clipboard?.writeText(m.id);
                            } catch {}
                            setCopiedMitraId(m.id);
                            window.setTimeout(() => {
                              setCopiedMitraId((prev) => (prev === m.id ? null : prev));
                            }, 2000);
                          }}
                          title="Salin ID Mitra untuk login Portal Order Mitra"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                        >
                          {copiedMitraId === m.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin ID</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-mono text-xs font-semibold text-slate-700 flex items-center gap-1">
                        <FileBadge className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>{m.licenseNo}</span>
                      </div>
                      {m.licenseFileUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewLicenseMitra(m)}
                          className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold transition cursor-pointer"
                          title={`Lihat dokumen izin: ${m.licenseFileName || 'Izin Fasilitas'}`}
                        >
                          <Eye className="w-3 h-3" />
                          <span>
                            Lihat Izin ({isPdfLicenseFile(m.licenseFileUrl, m.licenseFileType, m.licenseFileName) ? 'PDF' : 'JPG'})
                          </span>
                        </button>
                      ) : (
                        <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                          <AlertCircle className="w-3 h-3" />
                          <span>Belum ada file izin</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-slate-700 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{m.phone}</span>
                      </div>
                    </td>
                    <td className="p-3 max-w-[260px]">
                      <div className="text-slate-600 flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="truncate" title={m.address}>{m.address}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {m.category || 'Klinik Pratama'}
                      </span>
                      {m.picName && (
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{m.picName}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(m)}
                          title="Edit Data Mitra"
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: m.id, name: m.name })}
                          title="Hapus Mitra"
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL FORM MITRA */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Handshake className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">
                  {editingMitra ? 'Edit Fasilitas Kesehatan Mitra' : 'Form Mitra (Fasilitas Kesehatan Baru)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Faskes *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Klinik Pratama Sehat Bersama / Apotek Mandiri"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    No. Tlp *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0812-xxxx-xxxx"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    No. Izin *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="503/014/KLINIK/2023"
                    value={formData.licenseNo}
                    onChange={(e) => setFormData({ ...formData, licenseNo: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-mono text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Upload Wajib File Izin Fasilitas (PDF / JPG) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  File Izin Fasilitas (Format PDF / JPG) *
                </label>
                {!formData.licenseFileUrl ? (
                  <label className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/40 cursor-pointer transition text-center">
                    <Upload className="w-5 h-5 text-emerald-600" />
                    <span className="font-bold text-slate-700">
                      {isProcessingLicenseFile
                        ? 'Memproses dokumen izin...'
                        : 'Klik untuk unggah file izin fasilitas (PDF / JPG)'}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Wajib diisi · Format PDF (maks. 2,5 MB) atau JPG/JPEG
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
                      onChange={handleSelectLicenseFile}
                      disabled={isProcessingLicenseFile}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isPdfLicenseFile(formData.licenseFileUrl, formData.licenseFileType, formData.licenseFileName) ? (
                          <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                        <span className="font-bold text-slate-800 truncate" title={formData.licenseFileName}>
                          {formData.licenseFileName || 'Dokumen Izin Fasilitas'}
                        </span>
                      </div>
                      <label className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer shrink-0 transition">
                        {isProcessingLicenseFile ? 'Memproses...' : 'Ganti File'}
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
                          onChange={handleSelectLicenseFile}
                          disabled={isProcessingLicenseFile}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {!isPdfLicenseFile(formData.licenseFileUrl, formData.licenseFileType, formData.licenseFileName) && (
                      <img
                        src={formData.licenseFileUrl}
                        alt="Pratinjau File Izin Fasilitas"
                        className="w-full max-h-40 object-contain rounded-lg border border-slate-200 bg-white"
                      />
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Alamat *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Jl. Poros Simpang Pematang No. 12, Kab. Mesuji, Lampung"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Kategori Faskes
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full p-2.5 border rounded-xl font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Klinik Pratama">Klinik Pratama</option>
                    <option value="Klinik Utama">Klinik Utama</option>
                    <option value="Apotek Mitra">Apotek Mitra</option>
                    <option value="Praktik Dokter Mandiri">Praktik Dokter Mandiri</option>
                    <option value="Rumah Sakit">Rumah Sakit</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Penanggung Jawab / PIC
                  </label>
                  <input
                    type="text"
                    placeholder="dr. Hendra Pratama"
                    value={formData.picName}
                    onChange={(e) => setFormData({ ...formData, picName: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isProcessingLicenseFile}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{editingMitra ? 'Simpan Perubahan' : 'Simpan Mitra'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRATINJAU FILE IZIN FASILITAS MITRA */}
      {previewLicenseMitra && previewLicenseMitra.licenseFileUrl && (
        <div
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewLicenseMitra(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="font-bold text-sm truncate">
                  Dokumen Izin Fasilitas — {previewLicenseMitra.name}
                </h3>
                <p className="text-[11px] text-slate-300 font-mono truncate">
                  No. Izin: {previewLicenseMitra.licenseNo} · {previewLicenseMitra.licenseFileName || 'izin-fasilitas'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewLicenseMitra.licenseFileUrl}
                  download={
                    previewLicenseMitra.licenseFileName ||
                    `Izin_${previewLicenseMitra.name.replace(/\s+/g, '_')}.${
                      isPdfLicenseFile(
                        previewLicenseMitra.licenseFileUrl,
                        previewLicenseMitra.licenseFileType,
                        previewLicenseMitra.licenseFileName
                      )
                        ? 'pdf'
                        : 'jpg'
                    }`
                  }
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewLicenseMitra(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-100 flex-1 overflow-auto flex items-center justify-center min-h-[360px]">
              {isPdfLicenseFile(
                previewLicenseMitra.licenseFileUrl,
                previewLicenseMitra.licenseFileType,
                previewLicenseMitra.licenseFileName
              ) ? (
                <iframe
                  src={previewLicenseMitra.licenseFileUrl}
                  title={`Dokumen Izin PDF ${previewLicenseMitra.name}`}
                  className="w-full h-[65vh] rounded-2xl border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={previewLicenseMitra.licenseFileUrl}
                  alt={`Dokumen Izin ${previewLicenseMitra.name}`}
                  className="max-w-full max-h-[70vh] object-contain rounded-2xl border border-slate-200 bg-white shadow-sm"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2.5 text-rose-600">
                <span className="p-2 bg-rose-50 rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </span>
                <h3 className="font-black text-sm text-slate-900">Konfirmasi Hapus Mitra</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus data fasilitas kesehatan mitra{' '}
                <strong className="text-slate-900">"{deleteTarget.name}"</strong>? Tindakan ini juga akan menghapus data mitra tersebut dari Supabase.
              </p>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-sm transition"
                >
                  Hapus Mitra
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SKEMA SQL & INTEGRASI SUPABASE MITRA (APJ / Owner Only) */}
      {isOwnerAdmin && showSchemaModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Integrasi Supabase Master Data Mitra</h3>
                  <p className="text-[11px] text-slate-400">Sinkronisasi Real-time Dua Arah (Two-Way Live Sync)</p>
                </div>
              </div>
              <button
                onClick={() => setShowSchemaModal(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sky-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-600" />
                  Cara Kerja Sinkronisasi Dua Arah
                </p>
                <ul className="list-disc list-inside text-[11px] space-y-1 text-sky-800 pl-1">
                  <li><strong>Outbound (App ➔ Supabase):</strong> Tambah, edit, dan hapus data faskes mitra langsung tersimpan ke tabel Supabase <code>{mitraTableInput || DEFAULT_MITRA_TABLE}</code>.</li>
                  <li><strong>Inbound (Supabase ➔ App):</strong> Perubahan data di Supabase otomatis memperbarui daftar mitra di layar aplikasi, POS Kasir, dan Portal Mitra secara real-time.</li>
                </ul>
              </div>

              {!isDemoSandbox && (
                <form onSubmit={handleSaveTableName} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nama Tabel Mitra di Supabase
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="mitra"
                      value={mitraTableInput}
                      onChange={(e) => setMitraTableInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSyncing}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Simpan & Uji Koneksi</span>
                  </button>
                </form>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-slate-600" />
                    <h4 className="font-bold text-slate-800 text-xs">Skema DDL SQL Tabel Mitra</h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySchema}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
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
                  Jalankan skrip SQL berikut di <strong>SQL Editor</strong> Dashboard Supabase Anda agar tabel <code>mitra</code>, kebijakan RLS 2-arah, dan <code>supabase_realtime</code> aktif:
                </p>

                <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-56">
                  <pre>{SUPABASE_MITRA_SQL_SCHEMA}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
