import React, { useState, useMemo } from 'react';
import {
  Truck,
  Search,
  Plus,
  Building,
  Phone,
  MapPin,
  Edit2,
  Trash2,
  X,
  CheckCircle,
  Mail,
  User,
  FileText,
  Database,
  RefreshCw,
  Code,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Supplier } from '../types';
import {
  SUPABASE_SUPPLIER_SQL_SCHEMA,
  DEFAULT_SUPPLIER_TABLE,
  getSupabaseConfig,
  setSupabaseConfig
} from '../utils/supabaseClient';
import { useIsOwnerAdmin } from '../utils/roleAccess';

interface SetupSupplierViewProps {
  suppliers: Supplier[];
  onAddSupplier: (supplier: Supplier) => void;
  onUpdateSupplier: (supplier: Supplier) => void;
  onDeleteSupplier: (id: string) => void;
  onSyncSupabase?: () => Promise<{
    success: boolean;
    count: number;
    error?: string;
    needsTableSetup?: boolean;
  }>;
  needsTableSetup?: boolean;
  isDemoSandbox?: boolean;
}

export const SetupSupplierView: React.FC<SetupSupplierViewProps> = ({
  suppliers,
  onAddSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
  onSyncSupabase,
  needsTableSetup = false,
  isDemoSandbox = false
}) => {
  const isOwnerAdmin = useIsOwnerAdmin();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Supabase Sync & SQL Schema Modal State
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [supplierTableInput, setSupplierTableInput] = useState(
    () => getSupabaseConfig().supplierTable || DEFAULT_SUPPLIER_TABLE
  );
  const [syncToast, setSyncToast] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    licenseNo: '',
    picName: ''
  });

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchAddress = s.address.toLowerCase().includes(q);
        const matchPhone = s.phone.toLowerCase().includes(q);
        const matchEmail = (s.email || '').toLowerCase().includes(q);
        const matchPic = (s.picName || '').toLowerCase().includes(q);
        const matchLicense = (s.licenseNo || '').toLowerCase().includes(q);
        return matchName || matchAddress || matchPhone || matchEmail || matchPic || matchLicense;
      }
      return true;
    });
  }, [suppliers, searchTerm]);

  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    setFormError(null);
    setFormData({
      name: '',
      address: '',
      phone: '',
      email: '',
      licenseNo: '',
      picName: ''
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormError(null);
    setFormData({
      name: supplier.name,
      address: supplier.address,
      phone: supplier.phone,
      email: supplier.email || '',
      licenseNo: supplier.licenseNo || '',
      picName: supplier.picName || ''
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim() || !formData.phone.trim()) {
      setFormError('Harap lengkapi semua kolom wajib (Nama Supplier/PBF, Alamat Lengkap, dan Kontak/Telepon)!');
      return;
    }

    setFormError(null);

    if (editingSupplier) {
      const updated: Supplier = {
        ...editingSupplier,
        name: formData.name.trim(),
        address: formData.address.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        licenseNo: formData.licenseNo.trim(),
        picName: formData.picName.trim()
      };
      onUpdateSupplier(updated);
      setSyncToast({
        type: 'success',
        text: isDemoSandbox
          ? `Data supplier "${updated.name}" diperbarui di Mode Demo Sandbox.`
          : `Data supplier "${updated.name}" diperbarui dan disinkronkan ke Supabase.`
      });
    } else {
      const newSupplier: Supplier = {
        id: `SUP-${String(Date.now()).slice(-4)}`,
        name: formData.name.trim(),
        address: formData.address.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        licenseNo: formData.licenseNo.trim(),
        picName: formData.picName.trim(),
        createdAt: new Date().toISOString().split('T')[0]
      };
      onAddSupplier(newSupplier);
      setSyncToast({
        type: 'success',
        text: isDemoSandbox
          ? `Supplier baru "${newSupplier.name}" ditambahkan di Mode Demo Sandbox.`
          : `Supplier baru "${newSupplier.name}" disimpan dan disinkronkan ke Supabase.`
      });
    }

    setShowModal(false);
    setTimeout(() => setSyncToast(null), 4000);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteSupplier(deleteTarget.id);
    setSyncToast({
      type: 'info',
      text: isDemoSandbox
        ? `Supplier "${deleteTarget.name}" dihapus dari Mode Demo Sandbox.`
        : `Supplier "${deleteTarget.name}" dihapus dari sistem dan tabel Supabase.`
    });
    setDeleteTarget(null);
    setTimeout(() => setSyncToast(null), 4000);
  };

  const handleManualSyncSupabase = async () => {
    if (!onSyncSupabase) return;
    setIsSyncingSupabase(true);
    setSyncToast(null);
    try {
      const res = await onSyncSupabase();
      if (res.success) {
        setSyncToast({
          type: 'success',
          text: `Sinkronisasi Supabase berhasil! Total ${res.count} data Supplier / PBF tersinkronisasi.`
        });
      } else {
        setSyncToast({
          type: res.needsTableSetup ? 'info' : 'error',
          text: res.error || 'Gagal menyinkronkan data Supplier dengan Supabase.'
        });
        if (res.needsTableSetup && isOwnerAdmin) {
          setShowSchemaModal(true);
        }
      }
    } catch (err: any) {
      setSyncToast({
        type: 'error',
        text: err?.message || 'Terjadi kesalahan saat sinkronisasi Supabase.'
      });
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  const handleCopySqlSchema = () => {
    navigator.clipboard.writeText(SUPABASE_SUPPLIER_SQL_SCHEMA);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2500);
  };

  const handleSaveTableName = () => {
    if (isDemoSandbox) return;
    const clean = supplierTableInput.trim() || DEFAULT_SUPPLIER_TABLE;
    setSupplierTableInput(clean);
    setSupabaseConfig({ supplierTable: clean });
    setSyncToast({
      type: 'info',
      text: `Nama tabel Supabase diatur ke "${clean}". Klik Sinkronkan Supabase untuk memuat ulang.`
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-2 bg-sky-50 text-sky-600 rounded-xl">
              <Truck className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              Master Data Supplier & PBF (Pedagang Besar Farmasi)
            </h1>
            {isDemoSandbox ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                <Database className="w-3 h-3 text-amber-600" />
                Mode Demo Sandbox (Terisolasi dari Supabase)
              </span>
            ) : needsTableSetup ? (
              isOwnerAdmin ? (
                <button
                  onClick={() => setShowSchemaModal(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300 hover:bg-rose-200 transition cursor-pointer"
                  title="Klik untuk melihat Skema SQL Tabel Supplier"
                >
                  <AlertCircle className="w-3 h-3 text-rose-600" />
                  Tabel Supabase Perlu Setup
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300">
                  <AlertCircle className="w-3 h-3 text-rose-600" />
                  Tabel Supabase Belum Siap
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Supabase Live: {supplierTableInput}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pengelolaan distributor resmi dan principal farmasi untuk pengadaan obat, faktur pembelian, dan defecta (Sinkronisasi 2 Arah & Real-Time Supabase).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSyncSupabase && (
            <button
              onClick={handleManualSyncSupabase}
              disabled={isSyncingSupabase || isDemoSandbox}
              title={
                isDemoSandbox
                  ? 'Sinkronisasi dinonaktifkan pada Mode Demo untuk menjaga isolasi data produksi'
                  : 'Sinkronkan data Supplier & PBF 2 arah dengan Supabase'
              }
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs border transition-all ${
                isDemoSandbox
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm active:scale-95'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
              <span>{isSyncingSupabase ? 'Menyinkronkan...' : 'Sinkronkan Supabase'}</span>
            </button>
          )}

          {isOwnerAdmin && (
            <button
              onClick={() => setShowSchemaModal(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs transition-all active:scale-95"
              title="Lihat Skema SQL & Konfigurasi Tabel Supplier Supabase"
            >
              <Code className="w-3.5 h-3.5 text-sky-600" />
              <span>Skema SQL</span>
            </button>
          )}

          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Supplier Baru</span>
          </button>
        </div>
      </div>

      {/* Mode Demo Isolation Notice Banner */}
      {isDemoSandbox && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Isolasi Mode Demo Aktif:</strong> Seluruh penambahan, perubahan, atau penghapusan data Supplier / PBF disimpan secara lokal pada sandbox simulasi dan tidak mengubah database produksi Supabase.
            </span>
          </div>
        </div>
      )}

      {/* Missing Table Setup Warning Banner (APJ / Owner Only) */}
      {isOwnerAdmin && !isDemoSandbox && needsTableSetup && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Tabel <code className="px-1.5 py-0.5 bg-rose-100 rounded font-mono">{supplierTableInput}</code> belum ditemukan di Supabase!
              </p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Data saat ini tetap tersimpan aman di penyimpanan lokal perangkat. Jalankan script SQL pada menu <strong>Skema SQL</strong> di Supabase SQL Editor untuk mengaktifkan sinkronisasi cloud 2 arah.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSchemaModal(true)}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shrink-0 transition"
          >
            Buka Skema SQL
          </button>
        </div>
      )}

      {/* Feedback Toast */}
      {syncToast && (
        <div
          className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 text-xs font-medium transition-all ${
            syncToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : syncToast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-sky-50 border-sky-200 text-sky-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{syncToast.text}</span>
          </div>
          <button
            onClick={() => setSyncToast(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cari berdasarkan Nama Supplier/PBF, Alamat, Kontak/telepon, No. Izin PBF, atau PIC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
          />
        </div>

        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
          Total: <strong className="text-slate-800">{filteredSuppliers.length}</strong> Supplier
        </span>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-3 w-12 text-center">No</th>
                <th className="p-3">Nama Supplier / PBF</th>
                <th className="p-3">Alamat Lengkap</th>
                <th className="p-3">Kontak / Telepon</th>
                <th className="p-3">No. Izin PBF & Email</th>
                <th className="p-3">PIC / Salesman</th>
                <th className="p-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Truck className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="font-bold">Belum ada data supplier atau PBF yang ditemukan.</p>
                    <p className="text-[11px] mt-0.5">Klik tombol "+ Tambah Supplier Baru" untuk mendaftarkan rekanan distributor farmasi.</p>
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Building className="w-4 h-4 text-sky-500 shrink-0" />
                        <span>{s.name}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">ID: {s.id}</div>
                    </td>
                    <td className="p-3 max-w-[280px]">
                      <div className="text-slate-600 flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="truncate" title={s.address}>{s.address}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-slate-700 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{s.phone}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {s.licenseNo ? (
                        <div className="font-mono text-[11px] text-slate-600 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-slate-400" />
                          <span>{s.licenseNo}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">-</span>
                      )}
                      {s.email && (
                        <div className="text-[10px] text-sky-600 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{s.email}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {s.picName ? (
                        <div className="text-slate-700 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{s.picName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(s)}
                          title="Edit Data Supplier"
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                          title="Hapus Supplier"
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

      {/* MODAL FORM SUPPLIER */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-sm">
                  {editingSupplier ? 'Edit Data Supplier / PBF' : 'Form Supplier (PBF & Distributor Farmasi)'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Supplier / PBF *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PT. Kimia Farma Trading & Distribution / PT. AAM"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Alamat Lengkap *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Contoh: Kawasan Pergudangan Logistik Farmasi Way Halim, Bandar Lampung"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-medium bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Kontak / Telepon *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 0721-789012 / 0812-xxxx-xxxx"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-medium bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    No. Izin PBF / Distribusi (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="HK.02.02/PBF/129/2021"
                    value={formData.licenseNo}
                    onChange={(e) => setFormData({ ...formData, licenseNo: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-mono text-xs bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Email Resmi (Opsional)
                  </label>
                  <input
                    type="email"
                    placeholder="sales@pbf.co.id"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-medium bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Kontak Person / Salesman (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Bpk. Bambang Irawan (Sales Executive)"
                  value={formData.picName}
                  onChange={(e) => setFormData({ ...formData, picName: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-medium bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{editingSupplier ? 'Simpan Perubahan' : 'Simpan Supplier'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS SUPPLIER */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-bold text-sm">Konfirmasi Hapus Supplier / PBF</h3>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-rose-100 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Apakah Anda yakin ingin menghapus data supplier/PBF{' '}
                <strong className="text-slate-900">"{deleteTarget.name}"</strong> ({deleteTarget.id})?
              </p>
              <p className="text-[11px] text-slate-500">
                {isDemoSandbox
                  ? 'Data akan dihapus dari sesi Mode Demo Sandbox saat ini.'
                  : 'Data akan dihapus secara permanen dari aplikasi dan tabel Supabase.'}
              </p>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Ya, Hapus Supplier</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SKEMA SQL SUPABASE (APJ / Owner Only) */}
      {isOwnerAdmin && showSchemaModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm">
                    Skema SQL & Konfigurasi Tabel Supplier (Supabase)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Sinkronisasi 2 Arah & Real-Time Master Data Supplier & PBF
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSchemaModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <label className="block font-bold text-slate-700">
                  Nama Tabel Supplier di Supabase
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={supplierTableInput}
                    disabled={isDemoSandbox}
                    onChange={(e) => setSupplierTableInput(e.target.value)}
                    placeholder={DEFAULT_SUPPLIER_TABLE}
                    className="flex-1 p-2 border border-slate-300 rounded-xl font-mono text-xs bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none disabled:bg-slate-100"
                  />
                  <button
                    type="button"
                    disabled={isDemoSandbox}
                    onClick={handleSaveTableName}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition disabled:opacity-50"
                  >
                    Simpan Nama Tabel
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Default: <code className="font-mono font-bold text-slate-700">supplier</code>. Jalankan script SQL di bawah ini pada menu <strong>SQL Editor</strong> di dashboard Supabase Anda.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">
                    Script DDL SQL (Idempoten + Realtime + RLS Policy)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySqlSchema}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl font-bold text-xs transition"
                  >
                    {copiedSchema ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Script SQL</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 bg-slate-900 text-emerald-300 rounded-xl font-mono text-[11px] overflow-x-auto leading-relaxed max-h-80">
                  {SUPABASE_SUPPLIER_SQL_SCHEMA}
                </pre>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSchemaModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
