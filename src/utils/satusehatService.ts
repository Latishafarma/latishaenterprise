import {
  Patient,
  RMERecord,
  EPrescription,
  Transaction,
  SatuSehatLogEntry
} from '../types';
import { getSupabaseClient, getSupabaseConfig, buildMultiTenantRlsSqlBlock } from './supabaseClient';
import { isDemoMode } from './demoSandbox';

export const SATUSEHAT_LOGS_TABLE = 'satusehat_logs';

export const SUPABASE_SATUSEHAT_SQL_SCHEMA = `-- MIGRASI INTEGRASI SATUSEHAT KEMENKES (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan di SQL Editor Dashboard Supabase Anda

ALTER TABLE pasien
  ADD COLUMN IF NOT EXISTS ihs_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sync_satusehat VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS satusehat_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pasien_ihs_number ON pasien (ihs_number);
CREATE INDEX IF NOT EXISTS idx_pasien_sync_satusehat ON pasien (sync_satusehat);

CREATE TABLE IF NOT EXISTS satusehat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  local_record_id VARCHAR(100) NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_satusehat_logs_status ON satusehat_logs (status);
CREATE INDEX IF NOT EXISTS idx_satusehat_logs_entity ON satusehat_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_satusehat_logs_local_id ON satusehat_logs (local_record_id);
CREATE INDEX IF NOT EXISTS idx_satusehat_logs_created_at ON satusehat_logs (created_at DESC);

${buildMultiTenantRlsSqlBlock('satusehat_logs')}`;

export const SATUSEHAT_CLI_DEPLOY_GUIDE = `# 1. Simpan Kredensial SATUSEHAT ke Supabase Secrets (Aman di Server)
supabase secrets set SATUSEHAT_ENV=sandbox
supabase secrets set SATUSEHAT_ORG_ID=your-organization-uuid
supabase secrets set SATUSEHAT_CLIENT_ID=your-client-id
supabase secrets set SATUSEHAT_CLIENT_SECRET=your-client-secret

# Opsional: ID Nakes (Practitioner) & Lokasi Poli default
supabase secrets set SATUSEHAT_PRACTITIONER_IHS=10000000000
supabase secrets set SATUSEHAT_LOCATION_ID=your-location-uuid

# 2. Deploy Supabase Edge Function
supabase functions deploy satusehat-sync --no-verify-jwt`;

export interface SatuSehatInvokeResponse {
  success: boolean;
  status?: 'pending' | 'sent' | 'failed';
  logId?: string | null;
  ihsNumber?: string;
  encounterId?: string;
  conditionIds?: string[];
  medicationRequestIds?: string[];
  medicationDispenseIds?: string[];
  error?: string;
}

function rowToSatuSehatLog(row: Record<string, any>): SatuSehatLogEntry {
  return {
    id: String(row.id),
    entityType: (row.entity_type || 'Patient') as SatuSehatLogEntry['entityType'],
    localRecordId: String(row.local_record_id || ''),
    patientId: row.patient_id ? String(row.patient_id) : undefined,
    patientIhsNumber: row.patient_ihs_number ? String(row.patient_ihs_number) : undefined,
    fhirResourceId: row.fhir_resource_id ? String(row.fhir_resource_id) : undefined,
    status: (row.status || 'pending') as SatuSehatLogEntry['status'],
    httpStatus: typeof row.http_status === 'number' ? row.http_status : undefined,
    requestPayload: row.request_payload || undefined,
    responsePayload: row.response_payload || undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    retryCount: Number(row.retry_count || 0),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
    syncedAt: row.synced_at ? String(row.synced_at) : undefined
  };
}

function isLogTableMissingError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('404')
  );
}

// Membuat entri 'pending' di `satusehat_logs` sebelum background call ke Edge Function
async function createPendingSatuSehatLog(params: {
  entityType: SatuSehatLogEntry['entityType'];
  localRecordId: string;
  patientId?: string;
  patientIhsNumber?: string;
  requestPayload: Record<string, any>;
}): Promise<string | undefined> {
  const client = getSupabaseClient();
  if (!client || isDemoMode()) return undefined;
  try {
    const { data, error } = await client
      .from(SATUSEHAT_LOGS_TABLE)
      .insert({
        entity_type: params.entityType,
        local_record_id: params.localRecordId,
        patient_id: params.patientId || null,
        patient_ihs_number: params.patientIhsNumber || null,
        status: 'pending',
        request_payload: params.requestPayload
      })
      .select('id')
      .maybeSingle();

    if (error) return undefined;
    return data?.id ? String(data.id) : undefined;
  } catch {
    return undefined;
  }
}

// Pemanggilan Edge Function `satusehat-sync` dengan fetch non-blocking
export async function invokeSatuSehatEdgeFunction(
  payload: Record<string, any>
): Promise<SatuSehatInvokeResponse> {
  if (isDemoMode()) {
    return { success: false, error: 'Mode Demo aktif (isolasi sandbox SATUSEHAT)' };
  }
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const cleanBase = url.replace(/\/+$/, '');
  try {
    const res = await fetch(`${cleanBase}/functions/v1/satusehat-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(payload),
      keepalive: true
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        status: 'failed',
        error: data?.error || `HTTP ${res.status} dari Edge Function satusehat-sync`
      };
    }
    return (data || { success: true, status: 'sent' }) as SatuSehatInvokeResponse;
  } catch (err: any) {
    return {
      success: false,
      status: 'failed',
      error: err?.message || String(err)
    };
  }
}

// ============================================================================
// BACKGROUND DISPATCHERS (FIRE-AND-FORGET SETELAH DATA LOKAL TERSIMPAN)
// Memastikan tombol Simpan di Kasir / RME / Master Pasien tetap 0ms instan!
// ============================================================================

export function enqueuePatientSatuSehatBackground(
  patient: Patient,
  onIhsResolved?: (patientDbId: string, ihsNumber: string) => void
): void {
  if (isDemoMode()) return;
  const cleanNik = (patient.nik || '').replace(/\D/g, '');
  if (cleanNik.length < 16 || patient.ihsNumber) return;

  const { url, key } = getSupabaseConfig();
  if (!url || !key) return;

  const patientDbId = patient.dbId || patient.id;
  const payload = {
    action: 'sync_patient',
    localRecordId: patient.noRm || patient.id,
    patientDbId,
    nik: cleanNik,
    patientName: patient.name
  };

  window.setTimeout(() => {
    void (async () => {
      const logId = await createPendingSatuSehatLog({
        entityType: 'Patient',
        localRecordId: payload.localRecordId,
        patientId: patientDbId,
        requestPayload: payload
      });
      const result = await invokeSatuSehatEdgeFunction({ ...payload, logId });
      if (result.success && result.ihsNumber && onIhsResolved) {
        onIhsResolved(patientDbId, result.ihsNumber);
      }
    })();
  }, 0);
}

export function enqueueClinicalSatuSehatBackground(params: {
  rmeRecord: RMERecord;
  patient?: Patient | null;
  prescription?: EPrescription;
}): void {
  if (isDemoMode()) return;
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return;

  const { rmeRecord, patient, prescription } = params;
  const cleanNik = (rmeRecord.nik || patient?.nik || '').replace(/\D/g, '');
  const patientIhs = patient?.ihsNumber || '';
  if (!patientIhs && cleanNik.length < 16) return;

  const diagnoses =
    rmeRecord.icdList && rmeRecord.icdList.length > 0
      ? rmeRecord.icdList.map((d) => ({ code: d.code, name: d.name || d.code }))
      : rmeRecord.icdCode
      ? [{ code: rmeRecord.icdCode, name: rmeRecord.icdName || rmeRecord.soapA || rmeRecord.icdCode }]
      : [];

  const medsSource = prescription?.items || rmeRecord.prescription || [];
  const medications = medsSource.map((it) => ({
    id: it.medicineId,
    name: it.name,
    qty: it.qty,
    unit: it.unit,
    dosage: it.dosage
  }));

  const patientDbId = patient?.dbId || patient?.id || rmeRecord.rmId;
  const payload = {
    action: 'sync_clinical_bundle',
    localRecordId: rmeRecord.id,
    patientDbId,
    patientIhs: patientIhs || undefined,
    nik: cleanNik || undefined,
    patientName: rmeRecord.patientName,
    practitionerName: rmeRecord.doctorName,
    diagnoses,
    medications,
    includeDispense: false
  };

  window.setTimeout(() => {
    void (async () => {
      const logId = await createPendingSatuSehatLog({
        entityType: 'ClinicalBundle',
        localRecordId: rmeRecord.id,
        patientId: patientDbId,
        patientIhsNumber: patientIhs || undefined,
        requestPayload: payload
      });
      await invokeSatuSehatEdgeFunction({ ...payload, logId });
    })();
  }, 0);
}

export function enqueueDispenseSatuSehatBackground(params: {
  transaction: Transaction;
  patient?: Patient | null;
}): void {
  if (isDemoMode()) return;
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return;

  const { transaction, patient } = params;
  // Hanya sinkronkan transaksi klinik/resep atau transaksi dengan identitas pasien ber-NIK/IHS
  const cleanNik = (patient?.nik || '').replace(/\D/g, '');
  const patientIhs = patient?.ihsNumber || '';
  if (!patientIhs && cleanNik.length < 16) return;

  const medications = (transaction.items || []).map((it) => ({
    id: it.id,
    name: it.name,
    qty: it.qty,
    unit: it.unit
  }));
  if (medications.length === 0) return;

  const patientDbId = patient?.dbId || patient?.id || transaction.customerName;
  const payload = {
    action: 'sync_clinical_bundle',
    localRecordId: transaction.id,
    patientDbId,
    patientIhs: patientIhs || undefined,
    nik: cleanNik || undefined,
    patientName: patient?.name || transaction.customerName,
    practitionerName: transaction.doctorName,
    diagnoses: [],
    medications,
    includeDispense: true
  };

  window.setTimeout(() => {
    void (async () => {
      const logId = await createPendingSatuSehatLog({
        entityType: 'MedicationDispense',
        localRecordId: transaction.id,
        patientId: patientDbId,
        patientIhsNumber: patientIhs || undefined,
        requestPayload: payload
      });
      await invokeSatuSehatEdgeFunction({ ...payload, logId });
    })();
  }, 0);
}

// ============================================================================
// SERVER-SIDE PAGINATED LOG READER & RETRY WORKER
// ============================================================================

export async function fetchSatuSehatLogsPaginated(params: {
  page: number;
  pageSize: number;
  statusFilter?: string;
  searchQuery?: string;
}): Promise<{
  data: SatuSehatLogEntry[] | null;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  needsTableSetup?: boolean;
  error?: string;
}> {
  const safePage = Math.max(1, Math.floor(params.page || 1));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize || 25)));
  const client = getSupabaseClient();
  if (!client) {
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: 'Klien Supabase belum dikonfigurasi'
    };
  }

  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const cleanSearch = (params.searchQuery || '').trim().replace(/[(),%\\]/g, ' ').trim();

  try {
    let query = client.from(SATUSEHAT_LOGS_TABLE).select('*', { count: 'exact' });
    if (params.statusFilter && params.statusFilter !== 'ALL') {
      query = query.eq('status', params.statusFilter);
    }
    if (cleanSearch) {
      query = query.or(
        `local_record_id.ilike.%${cleanSearch}%,entity_type.ilike.%${cleanSearch}%,patient_ihs_number.ilike.%${cleanSearch}%,fhir_resource_id.ilike.%${cleanSearch}%`
      );
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      if (isLogTableMissingError(error)) {
        return {
          data: null,
          totalCount: 0,
          page: safePage,
          pageSize: safePageSize,
          totalPages: 1,
          needsTableSetup: true,
          error: 'Tabel satusehat_logs belum dibuat di Supabase.'
        };
      }
      return {
        data: null,
        totalCount: 0,
        page: safePage,
        pageSize: safePageSize,
        totalPages: 1,
        error: error.message
      };
    }

    const totalCount = typeof count === 'number' ? count : (data?.length ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
    return {
      data: (data || []).map(rowToSatuSehatLog),
      totalCount,
      page: safePage,
      pageSize: safePageSize,
      totalPages
    };
  } catch (err: any) {
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: err?.message || String(err)
    };
  }
}

export async function retrySatuSehatLogEntry(log: SatuSehatLogEntry): Promise<SatuSehatInvokeResponse> {
  const client = getSupabaseClient();
  if (client && !isDemoMode()) {
    await client
      .from(SATUSEHAT_LOGS_TABLE)
      .update({
        status: 'pending',
        retry_count: (log.retryCount || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', log.id);
  }

  const basePayload = log.requestPayload || {
    action: log.entityType === 'Patient' ? 'sync_patient' : 'sync_clinical_bundle',
    localRecordId: log.localRecordId,
    patientDbId: log.patientId,
    patientIhs: log.patientIhsNumber
  };

  return await invokeSatuSehatEdgeFunction({
    ...basePayload,
    logId: log.id
  });
}
