-- ============================================================================
-- MIGRASI PENAMBAHAN KOLOM NAMA SUAMI PADA TABEL `pasien`
-- Apotek & Klinik Latisha Farma
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda
-- ============================================================================

ALTER TABLE pasien
  ADD COLUMN IF NOT EXISTS nama_suami VARCHAR(255) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_pasien_nama_suami ON pasien (nama_suami);
