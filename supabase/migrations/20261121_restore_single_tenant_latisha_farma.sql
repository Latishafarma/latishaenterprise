-- =====================================================================================
-- PEMBERSIHAN TOTAL PENYEWA LAMA & RESTORASI SINGLE-TENANT APOTEK & KLINIK LATISHA FARMA
-- Tanggal: 2026-11-21
-- Tujuan:
-- 1. Mengembalikan aplikasi murni sebagai sistem internal Apotek & Klinik Latisha Farma.
-- 2. Menghapus seluruh trigger, fungsi, tabel, kolom `tenant_id`, dan index sisa multi-tenant.
-- 3. Membersihkan sisa data/teks penyewa lama (seperti "Apotek Sehat Farma" / "Potek Sehat")
--    pada tabel `profil_fasilitas` maupun baris ber-tenant_id asing bila masih ada.
-- 4. Menjaga 100% keutuhan data operasional resmi Apotek & Klinik Latisha Farma.
-- =====================================================================================

BEGIN;

-- 1. HAPUS SELURUH TRIGGER ISOLASI MULTI-TENANT
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'pasien',
    'pendaftaran_online',
    'pegawai',
    'medical_records',
    'laporan_morbiditas',
    'schedules',
    'staff_attendance',
    'master_obat',
    'mitra',
    'pesanan_mitra',
    'profil_fasilitas',
    'riwayat_skrining_resep',
    'riwayat_penjualan',
    'kartu_stok',
    'cek_lab',
    'riwayat_opname',
    'sesi_opname_aktif',
    'supplier',
    'cabang',
    'transfer_stok_cabang',
    'riwayat_shift_kasir',
    'faktur_pembelian',
    'pembayaran_hutang',
    'pelunasan_piutang',
    'buku_kas_mutasi',
    'promo_diskon',
    'pengaturan_tarif_jasa',
    'satusehat_logs',
    'icd10',
    'interaksi_obat'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', 'trg_enforce_tenant_' || v_table, v_table);
    END IF;
  END LOOP;
END;
$$;

-- 2. HAPUS FUNGSI-FUNGSI MULTI-TENANT & LISENSI
DROP FUNCTION IF EXISTS public.enforce_tenant_isolation() CASCADE;
DROP FUNCTION IF EXISTS public.is_current_tenant_active(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.current_tenant_id() CASCADE;

-- 3. HAPUS SISA BARIS PENYEWA ASING, INDEX `tenant_id`, DAN KOLOM `tenant_id`
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
      AND table_name NOT IN ('tenants', 'tenant_users')
  LOOP
    -- Hapus baris penyewa asing selain LATISHA-FARMA / GLOBAL bila masih tersisa
    EXECUTE format(
      'DELETE FROM public.%I WHERE tenant_id IS NOT NULL AND UPPER(TRIM(tenant_id)) NOT IN (''LATISHA-FARMA'', ''GLOBAL'');',
      v_rec.table_name
    );

    -- Hapus index tenant_id bila ada
    EXECUTE format('DROP INDEX IF EXISTS public.%I;', 'idx_' || v_rec.table_name || '_tenant_id');

    -- Hapus kolom tenant_id agar skema murni single-tenant Latisha Farma
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS tenant_id CASCADE;', v_rec.table_name);
  END LOOP;
END;
$$;

-- 4. BERSIHKAN SISA TEKS PENYEWA LAMA ("APOTEK SEHAT FARMA" / "POTEK SEHAT") DI `profil_fasilitas`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profil_fasilitas'
  ) THEN
    -- Hapus baris profil milik penyewa lama (selain MAIN-FACILITY)
    DELETE FROM public.profil_fasilitas
    WHERE id IS DISTINCT FROM 'MAIN-FACILITY'
      AND (id LIKE '%__%' OR id LIKE '%::%' OR LOWER(COALESCE(nama_apotek, '')) LIKE '%sehat%');

    -- Bersihkan catatan kop & JSON profil bila masih menyebut Apotek Sehat / Potek Sehat
    UPDATE public.profil_fasilitas
    SET
      catatan_kop = regexp_replace(COALESCE(catatan_kop, ''), '\m(a?potek\s+sehat(\s+farma)?)\M', 'APOTEK LATISHA FARMA', 'gi'),
      pharmacy_json = CASE
        WHEN pharmacy_json IS NOT NULL AND pharmacy_json ? 'headerNote' THEN
          jsonb_set(
            pharmacy_json,
            '{headerNote}',
            to_jsonb(
              regexp_replace(
                COALESCE(pharmacy_json ->> 'headerNote', ''),
                '\m(a?potek\s+sehat(\s+farma)?)\M',
                'APOTEK LATISHA FARMA',
                'gi'
              )
            ),
            true
          )
        ELSE pharmacy_json
      END,
      updated_at = NOW()
    WHERE id = 'MAIN-FACILITY';
  END IF;
END;
$$;

-- 5. RESET & PERBARUI KEBIJAKAN ROW LEVEL SECURITY (RLS) UNTUK APOTEK LATISHA FARMA
DO $$
DECLARE
  v_table TEXT;
  v_pol RECORD;
  v_tables TEXT[] := ARRAY[
    'pasien',
    'pendaftaran_online',
    'pegawai',
    'medical_records',
    'laporan_morbiditas',
    'schedules',
    'staff_attendance',
    'master_obat',
    'mitra',
    'pesanan_mitra',
    'profil_fasilitas',
    'riwayat_skrining_resep',
    'riwayat_penjualan',
    'kartu_stok',
    'cek_lab',
    'riwayat_opname',
    'sesi_opname_aktif',
    'supplier',
    'cabang',
    'transfer_stok_cabang',
    'riwayat_shift_kasir',
    'faktur_pembelian',
    'pembayaran_hutang',
    'pelunasan_piutang',
    'buku_kas_mutasi',
    'promo_diskon',
    'pengaturan_tarif_jasa',
    'satusehat_logs',
    'icd10',
    'interaksi_obat'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', v_table);

      FOR v_pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = v_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', v_pol.policyname, v_table);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true);',
        'latisha_farma_access_' || v_table,
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

-- 6. HAPUS TABEL SEWA MULTI-TENANT JIKA MASIH ADA
DROP TABLE IF EXISTS public.tenant_users CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

COMMIT;
