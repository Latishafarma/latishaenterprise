-- ============================================================================
-- MIGRASI INTEGRASI SATUSEHAT KEMENKES (APOTEK & KLINIK LATISHA FARMA)
-- Mode: Single-Tenant Internal Apotek & Klinik Latisha Farma
-- Jalankan pada SQL Editor di Dashboard Supabase Anda
-- ============================================================================

-- 1. Penambahan kolom SATUSEHAT IHS & status sinkronisasi pada tabel `pasien`
ALTER TABLE pasien
  ADD COLUMN IF NOT EXISTS ihs_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sync_satusehat VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS satusehat_synced_at TIMESTAMPTZ;

-- Constraint opsional agar nilai status konsisten
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_pasien_sync_satusehat'
  ) THEN
    ALTER TABLE pasien
      ADD CONSTRAINT chk_pasien_sync_satusehat
      CHECK (sync_satusehat IN ('pending', 'sent', 'failed'));
  END IF;
END $$;

-- Index cepat untuk 5.300+ baris pasien
CREATE INDEX IF NOT EXISTS idx_pasien_ihs_number ON pasien (ihs_number);
CREATE INDEX IF NOT EXISTS idx_pasien_sync_satusehat ON pasien (sync_satusehat);

-- 2. Tabel Log & Antrean Pengiriman FHIR SATUSEHAT (`satusehat_logs`)
CREATE TABLE IF NOT EXISTS satusehat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL, -- Patient | Encounter | Condition | MedicationRequest | MedicationDispense | ClinicalBundle
  local_record_id VARCHAR(100) NOT NULL, -- ID lokal (mis. PAS-001, RME-2026-001, RX-001, TRX-001)
  patient_id VARCHAR(50),
  patient_ihs_number VARCHAR(50),
  fhir_resource_id VARCHAR(150),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  http_status INTEGER,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- Index performa kueri log & retry worker
CREATE INDEX IF NOT EXISTS idx_satusehat_logs_status ON satusehat_logs (status);
CREATE INDEX IF NOT EXISTS idx_satusehat_logs_entity ON satusehat_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_satusehat_logs_local_id ON satusehat_logs (local_record_id);
CREATE INDEX IF NOT EXISTS idx_satusehat_logs_patient_id ON satusehat_logs (patient_id);
CREATE INDEX IF NOT EXISTS idx_satusehat_logs_created_at ON satusehat_logs (created_at DESC);

-- Aktifkan Row Level Security (RLS) Single-Tenant Apotek & Klinik Latisha Farma
ALTER TABLE satusehat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read satusehat_logs" ON satusehat_logs;
DROP POLICY IF EXISTS "Public Insert satusehat_logs" ON satusehat_logs;
DROP POLICY IF EXISTS "Public Update satusehat_logs" ON satusehat_logs;
DROP POLICY IF EXISTS "Public Delete satusehat_logs" ON satusehat_logs;
DROP POLICY IF EXISTS "tenant_isolation_select_satusehat_logs" ON satusehat_logs;
DROP POLICY IF EXISTS "tenant_isolation_insert_satusehat_logs" ON satusehat_logs;
DROP POLICY IF EXISTS "tenant_isolation_update_satusehat_logs" ON satusehat_logs;
DROP POLICY IF EXISTS "tenant_isolation_delete_satusehat_logs" ON satusehat_logs;
DROP POLICY IF EXISTS "latisha_farma_access_satusehat_logs" ON satusehat_logs;

CREATE POLICY "latisha_farma_access_satusehat_logs" ON satusehat_logs
  FOR ALL USING (true) WITH CHECK (true);
