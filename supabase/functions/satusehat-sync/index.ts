// Supabase Edge Function: satusehat-sync
// Runtime: Deno / TypeScript
// Deploy: supabase functions deploy satusehat-sync --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type SatuSehatAction =
  | 'sync_patient'
  | 'send_encounter'
  | 'send_condition'
  | 'send_medication_request'
  | 'send_medication_dispense'
  | 'sync_clinical_bundle';

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

let cachedToken: CachedToken | null = null;

function getSatuSehatEndpoints() {
  const env = (Deno.env.get('SATUSEHAT_ENV') || 'sandbox').toLowerCase();
  if (env === 'production' || env === 'prod') {
    return {
      authBaseUrl: 'https://api-satusehat.kemkes.go.id/oauth2/v1',
      fhirBaseUrl: 'https://api-satusehat.kemkes.go.id/fhir-r4/v1'
    };
  }
  return {
    authBaseUrl: 'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1',
    fhirBaseUrl: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1'
  };
}

// 1. OAuth2 Client Credentials ke SATUSEHAT Kemenkes (menggunakan Supabase Secrets)
async function getSatuSehatAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAtMs - 60_000) {
    return cachedToken.accessToken;
  }

  const clientId = Deno.env.get('SATUSEHAT_CLIENT_ID');
  const clientSecret = Deno.env.get('SATUSEHAT_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Supabase Secrets SATUSEHAT_CLIENT_ID / SATUSEHAT_CLIENT_SECRET belum dikonfigurasi.');
  }

  const { authBaseUrl } = getSatuSehatEndpoints();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret
  });

  const res = await fetch(`${authBaseUrl}/accesstoken?grant_type=client_credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(`Gagal autentikasi OAuth2 SATUSEHAT (${res.status}): ${JSON.stringify(data)}`);
  }

  const expiresInSec = Number(data.expires_in || 1800);
  cachedToken = {
    accessToken: data.access_token,
    expiresAtMs: now + expiresInSec * 1000
  };
  return cachedToken.accessToken;
}

async function fhirRequest(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  token: string,
  payload?: unknown
) {
  const { fhirBaseUrl } = getSatuSehatEndpoints();
  const res = await fetch(`${fhirBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: payload ? JSON.stringify(payload) : undefined
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { ok: res.ok, status: res.status, data: json };
}

// 2a. Helper FHIR Patient: Cari/Sinkronisasi IHS Number berdasarkan NIK
async function syncPatientByNik(token: string, nik: string) {
  const cleanNik = nik.replace(/\D/g, '');
  if (cleanNik.length < 16) {
    throw new Error(`NIK tidak valid untuk SATUSEHAT (harus 16 digit): "${nik}"`);
  }

  const identifier = encodeURIComponent(`https://fhir.kemkes.go.id/id/nik|${cleanNik}`);
  const result = await fhirRequest('GET', `/Patient?identifier=${identifier}`, token);
  if (!result.ok) {
    throw new Error(`FHIR Patient Lookup gagal (${result.status}): ${JSON.stringify(result.data)}`);
  }

  const entry = result.data?.entry?.[0]?.resource;
  if (!entry?.id) {
    throw new Error(`Pasien dengan NIK ${cleanNik} tidak ditemukan di Master Patient Index (MPI) SATUSEHAT.`);
  }

  return {
    ihsNumber: String(entry.id),
    officialName: entry.name?.[0]?.text || '',
    httpStatus: result.status,
    raw: result.data
  };
}

// 2b. Helper FHIR Encounter: Pencatatan Kunjungan Poli / Fasilitas Kesehatan
async function sendEncounterResource(
  token: string,
  orgId: string,
  params: {
    localVisitId: string;
    patientIhs: string;
    patientName: string;
    practitionerIhs?: string;
    practitionerName?: string;
    locationId?: string;
    locationName?: string;
    startIso?: string;
    endIso?: string;
    status?: 'arrived' | 'in-progress' | 'finished';
  }
) {
  const startIso = params.startIso || new Date().toISOString();
  const endIso = params.endIso || new Date().toISOString();
  const practitionerIhs = params.practitionerIhs || Deno.env.get('SATUSEHAT_PRACTITIONER_IHS') || '';
  const locationId = params.locationId || Deno.env.get('SATUSEHAT_LOCATION_ID') || '';

  const encounterPayload: Record<string, unknown> = {
    resourceType: 'Encounter',
    identifier: [
      {
        system: `http://sys.kemkes.go.id/encounter/${orgId}`,
        value: params.localVisitId
      }
    ],
    status: params.status || 'finished',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory'
    },
    subject: {
      reference: `Patient/${params.patientIhs}`,
      display: params.patientName
    },
    period: {
      start: startIso,
      ...(params.status === 'finished' ? { end: endIso } : {})
    },
    statusHistory: [
      {
        status: 'arrived',
        period: { start: startIso, end: startIso }
      },
      ...(params.status === 'finished'
        ? [{ status: 'finished', period: { start: startIso, end: endIso } }]
        : [])
    ],
    serviceProvider: {
      reference: `Organization/${orgId}`
    }
  };

  if (practitionerIhs) {
    encounterPayload.participant = [
      {
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'ATND',
                display: 'attender'
              }
            ]
          }
        ],
        individual: {
          reference: `Practitioner/${practitionerIhs}`,
          display: params.practitionerName || 'Dokter Pemeriksa'
        }
      }
    ];
  }

  if (locationId) {
    encounterPayload.location = [
      {
        location: {
          reference: `Location/${locationId}`,
          display: params.locationName || 'Poli Umum Klinik Latisha Farma'
        }
      }
    ];
  }

  const res = await fhirRequest('POST', '/Encounter', token, encounterPayload);
  if (!res.ok || !res.data?.id) {
    throw new Error(`FHIR Encounter gagal (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return {
    encounterId: String(res.data.id),
    httpStatus: res.status,
    requestPayload: encounterPayload,
    responsePayload: res.data
  };
}

// 2c. Helper FHIR Condition: Pencatatan Diagnosis menggunakan Kode ICD-10
async function sendConditionResource(
  token: string,
  params: {
    patientIhs: string;
    patientName: string;
    encounterId: string;
    icdCode: string;
    icdDisplay: string;
    recordedDateIso?: string;
  }
) {
  const conditionPayload = {
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
          display: 'Active'
        }
      ]
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis'
          }
        ]
      }
    ],
    code: {
      coding: [
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code: params.icdCode.trim().toUpperCase(),
          display: params.icdDisplay
        }
      ]
    },
    subject: {
      reference: `Patient/${params.patientIhs}`,
      display: params.patientName
    },
    encounter: {
      reference: `Encounter/${params.encounterId}`
    },
    recordedDate: params.recordedDateIso || new Date().toISOString()
  };

  const res = await fhirRequest('POST', '/Condition', token, conditionPayload);
  if (!res.ok || !res.data?.id) {
    throw new Error(`FHIR Condition (${params.icdCode}) gagal (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return {
    conditionId: String(res.data.id),
    httpStatus: res.status,
    requestPayload: conditionPayload,
    responsePayload: res.data
  };
}

// 2d. Helper FHIR MedicationRequest & MedicationDispense: Peresepan & Penyerahan Obat Apotek
async function sendMedicationRequestResource(
  token: string,
  orgId: string,
  params: {
    prescriptionId: string;
    patientIhs: string;
    patientName: string;
    encounterId?: string;
    practitionerIhs?: string;
    practitionerName?: string;
    kfaCode?: string;
    medicineName: string;
    qty: number;
    unit?: string;
    dosageText?: string;
    authoredOnIso?: string;
  }
) {
  const practitionerIhs = params.practitionerIhs || Deno.env.get('SATUSEHAT_PRACTITIONER_IHS') || '';
  const kfaCode = params.kfaCode || '92000000'; // KFA placeholder jika produk belum terpetakan KFA

  const medReqPayload: Record<string, unknown> = {
    resourceType: 'MedicationRequest',
    identifier: [
      {
        system: `http://sys.kemkes.go.id/prescription/${orgId}`,
        use: 'official',
        value: params.prescriptionId
      }
    ],
    status: 'completed',
    intent: 'order',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category',
            code: 'outpatient',
            display: 'Outpatient'
          }
        ]
      }
    ],
    medicationCodeableConcept: {
      coding: [
        {
          system: 'http://sys.kemkes.go.id/kfa',
          code: kfaCode,
          display: params.medicineName
        }
      ],
      text: params.medicineName
    },
    subject: {
      reference: `Patient/${params.patientIhs}`,
      display: params.patientName
    },
    authoredOn: params.authoredOnIso || new Date().toISOString(),
    dosageInstruction: [
      {
        sequence: 1,
        text: params.dosageText || 'Sesuai aturan pakai apoteker'
      }
    ],
    dispenseRequest: {
      quantity: {
        value: Number(params.qty) || 1,
        unit: params.unit || 'TAB',
        system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
        code: params.unit || 'TAB'
      },
      performer: {
        reference: `Organization/${orgId}`
      }
    }
  };

  if (params.encounterId) {
    medReqPayload.encounter = { reference: `Encounter/${params.encounterId}` };
  }
  if (practitionerIhs) {
    medReqPayload.requester = {
      reference: `Practitioner/${practitionerIhs}`,
      display: params.practitionerName || 'Dokter Peresep'
    };
  }

  const res = await fhirRequest('POST', '/MedicationRequest', token, medReqPayload);
  if (!res.ok || !res.data?.id) {
    throw new Error(`FHIR MedicationRequest gagal (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return {
    medicationRequestId: String(res.data.id),
    httpStatus: res.status,
    requestPayload: medReqPayload,
    responsePayload: res.data
  };
}

async function sendMedicationDispenseResource(
  token: string,
  orgId: string,
  params: {
    dispenseId: string;
    patientIhs: string;
    patientName: string;
    encounterId?: string;
    medicationRequestId?: string;
    kfaCode?: string;
    medicineName: string;
    qty: number;
    unit?: string;
    dosageText?: string;
    handedOverIso?: string;
  }
) {
  const kfaCode = params.kfaCode || '92000000';
  const nowIso = params.handedOverIso || new Date().toISOString();

  const dispensePayload: Record<string, unknown> = {
    resourceType: 'MedicationDispense',
    identifier: [
      {
        system: `http://sys.kemkes.go.id/dispense/${orgId}`,
        use: 'official',
        value: params.dispenseId
      }
    ],
    status: 'completed',
    category: {
      coding: [
        {
          system: 'http://terminology.hl7.org/fhir/CodeSystem/medicationdispense-category',
          code: 'outpatient',
          display: 'Outpatient'
        }
      ]
    },
    medicationCodeableConcept: {
      coding: [
        {
          system: 'http://sys.kemkes.go.id/kfa',
          code: kfaCode,
          display: params.medicineName
        }
      ],
      text: params.medicineName
    },
    subject: {
      reference: `Patient/${params.patientIhs}`,
      display: params.patientName
    },
    quantity: {
      value: Number(params.qty) || 1,
      unit: params.unit || 'TAB',
      system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
      code: params.unit || 'TAB'
    },
    whenPrepared: nowIso,
    whenHandedOver: nowIso,
    dosageInstruction: [
      {
        sequence: 1,
        text: params.dosageText || 'Sesuai etiket apotek'
      }
    ],
    performer: [
      {
        actor: {
          reference: `Organization/${orgId}`
        }
      }
    ]
  };

  if (params.encounterId) {
    dispensePayload.context = { reference: `Encounter/${params.encounterId}` };
  }
  if (params.medicationRequestId) {
    dispensePayload.authorizingPrescription = [
      { reference: `MedicationRequest/${params.medicationRequestId}` }
    ];
  }

  const res = await fhirRequest('POST', '/MedicationDispense', token, dispensePayload);
  if (!res.ok || !res.data?.id) {
    throw new Error(`FHIR MedicationDispense gagal (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return {
    medicationDispenseId: String(res.data.id),
    httpStatus: res.status,
    requestPayload: dispensePayload,
    responsePayload: res.data
  };
}

// Helper mencatat/memperbarui tabel `satusehat_logs` (Single-Tenant Latisha Farma)
async function upsertSatuSehatLog(
  adminClient: ReturnType<typeof createClient> | null,
  logId: string | undefined,
  fields: Record<string, unknown>
) {
  if (!adminClient) return null;
  const nowIso = new Date().toISOString();
  if (logId) {
    const { data } = await adminClient
      .from('satusehat_logs')
      .update({ ...fields, updated_at: nowIso })
      .eq('id', logId)
      .select('id')
      .maybeSingle();
    return data?.id || logId;
  }
  const { data } = await adminClient
    .from('satusehat_logs')
    .insert({ ...fields, created_at: nowIso, updated_at: nowIso })
    .select('id')
    .maybeSingle();
  return data?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const adminClient =
    supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Payload JSON tidak valid' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const action = (body.action || 'sync_patient') as SatuSehatAction;
  const logId: string | undefined = body.logId;
  const localRecordId = String(body.localRecordId || body.patientId || body.rmeId || body.trxId || 'UNKNOWN');
  const patientDbId = body.patientDbId || body.patientId || null;

  try {
    const orgId = Deno.env.get('SATUSEHAT_ORG_ID');
    if (!orgId) {
      throw new Error('Supabase Secret SATUSEHAT_ORG_ID belum dikonfigurasi.');
    }

    const token = await getSatuSehatAccessToken();

    if (action === 'sync_patient') {
      const patientRes = await syncPatientByNik(token, String(body.nik || ''));
      if (adminClient && patientDbId) {
        await adminClient
          .from('pasien')
          .update({
            ihs_number: patientRes.ihsNumber,
            sync_satusehat: 'sent',
            satusehat_synced_at: new Date().toISOString()
          })
          .eq('id', patientDbId);
      }

      const savedLogId = await upsertSatuSehatLog(adminClient, logId, {
        entity_type: 'Patient',
        local_record_id: localRecordId,
        patient_id: patientDbId,
        patient_ihs_number: patientRes.ihsNumber,
        fhir_resource_id: `Patient/${patientRes.ihsNumber}`,
        status: 'sent',
        http_status: patientRes.httpStatus,
        request_payload: { nik: body.nik },
        response_payload: patientRes.raw,
        error_message: null,
        synced_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({
          success: true,
          status: 'sent',
          logId: savedLogId,
          ihsNumber: patientRes.ihsNumber
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'send_encounter') {
      const enc = await sendEncounterResource(token, orgId, body as any);
      const savedLogId = await upsertSatuSehatLog(adminClient, logId, {
        entity_type: 'Encounter',
        local_record_id: localRecordId,
        patient_id: patientDbId,
        patient_ihs_number: body.patientIhs,
        fhir_resource_id: `Encounter/${enc.encounterId}`,
        status: 'sent',
        http_status: enc.httpStatus,
        request_payload: enc.requestPayload,
        response_payload: enc.responsePayload,
        error_message: null,
        synced_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({ success: true, status: 'sent', logId: savedLogId, encounterId: enc.encounterId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'send_condition') {
      const cond = await sendConditionResource(token, body as any);
      const savedLogId = await upsertSatuSehatLog(adminClient, logId, {
        entity_type: 'Condition',
        local_record_id: localRecordId,
        patient_id: patientDbId,
        patient_ihs_number: body.patientIhs,
        fhir_resource_id: `Condition/${cond.conditionId}`,
        status: 'sent',
        http_status: cond.httpStatus,
        request_payload: cond.requestPayload,
        response_payload: cond.responsePayload,
        error_message: null,
        synced_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({ success: true, status: 'sent', logId: savedLogId, conditionId: cond.conditionId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'send_medication_request') {
      const mr = await sendMedicationRequestResource(token, orgId, body as any);
      const savedLogId = await upsertSatuSehatLog(adminClient, logId, {
        entity_type: 'MedicationRequest',
        local_record_id: localRecordId,
        patient_id: patientDbId,
        patient_ihs_number: body.patientIhs,
        fhir_resource_id: `MedicationRequest/${mr.medicationRequestId}`,
        status: 'sent',
        http_status: mr.httpStatus,
        request_payload: mr.requestPayload,
        response_payload: mr.responsePayload,
        error_message: null,
        synced_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({
          success: true,
          status: 'sent',
          logId: savedLogId,
          medicationRequestId: mr.medicationRequestId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'send_medication_dispense') {
      const md = await sendMedicationDispenseResource(token, orgId, body as any);
      const savedLogId = await upsertSatuSehatLog(adminClient, logId, {
        entity_type: 'MedicationDispense',
        local_record_id: localRecordId,
        patient_id: patientDbId,
        patient_ihs_number: body.patientIhs,
        fhir_resource_id: `MedicationDispense/${md.medicationDispenseId}`,
        status: 'sent',
        http_status: md.httpStatus,
        request_payload: md.requestPayload,
        response_payload: md.responsePayload,
        error_message: null,
        synced_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({
          success: true,
          status: 'sent',
          logId: savedLogId,
          medicationDispenseId: md.medicationDispenseId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Orchestrator lengkap: Patient IHS -> Encounter -> Condition(s) -> MedicationRequest / Dispense
    if (action === 'sync_clinical_bundle') {
      let patientIhs = String(body.patientIhs || '');
      if (!patientIhs) {
        const pLookup = await syncPatientByNik(token, String(body.nik || ''));
        patientIhs = pLookup.ihsNumber;
        if (adminClient && patientDbId) {
          await adminClient
            .from('pasien')
            .update({
              ihs_number: patientIhs,
              sync_satusehat: 'sent',
              satusehat_synced_at: new Date().toISOString()
            })
            .eq('id', patientDbId);
        }
      }

      const enc = await sendEncounterResource(token, orgId, {
        localVisitId: localRecordId,
        patientIhs,
        patientName: String(body.patientName || 'Pasien Klinik'),
        practitionerIhs: body.practitionerIhs,
        practitionerName: body.practitionerName,
        status: 'finished'
      });

      const conditionIds: string[] = [];
      const diagnoses: Array<{ code: string; name: string }> = Array.isArray(body.diagnoses)
        ? body.diagnoses
        : [];
      for (const diag of diagnoses) {
        if (!diag?.code) continue;
        const cond = await sendConditionResource(token, {
          patientIhs,
          patientName: String(body.patientName || 'Pasien Klinik'),
          encounterId: enc.encounterId,
          icdCode: diag.code,
          icdDisplay: diag.name || diag.code
        });
        conditionIds.push(cond.conditionId);
      }

      const medicationRequestIds: string[] = [];
      const medicationDispenseIds: string[] = [];
      const medications: Array<{
        id: string;
        name: string;
        qty: number;
        unit?: string;
        dosage?: string;
        kfaCode?: string;
      }> = Array.isArray(body.medications) ? body.medications : [];

      for (const med of medications) {
        if (!med?.name) continue;
        const mr = await sendMedicationRequestResource(token, orgId, {
          prescriptionId: `${localRecordId}-${med.id}`,
          patientIhs,
          patientName: String(body.patientName || 'Pasien Klinik'),
          encounterId: enc.encounterId,
          practitionerIhs: body.practitionerIhs,
          practitionerName: body.practitionerName,
          kfaCode: med.kfaCode,
          medicineName: med.name,
          qty: med.qty,
          unit: med.unit,
          dosageText: med.dosage
        });
        medicationRequestIds.push(mr.medicationRequestId);

        if (body.includeDispense) {
          const md = await sendMedicationDispenseResource(token, orgId, {
            dispenseId: `DISP-${localRecordId}-${med.id}`,
            patientIhs,
            patientName: String(body.patientName || 'Pasien Klinik'),
            encounterId: enc.encounterId,
            medicationRequestId: mr.medicationRequestId,
            kfaCode: med.kfaCode,
            medicineName: med.name,
            qty: med.qty,
            unit: med.unit,
            dosageText: med.dosage
          });
          medicationDispenseIds.push(md.medicationDispenseId);
        }
      }

      const savedLogId = await upsertSatuSehatLog(adminClient, logId, {
        entity_type: 'ClinicalBundle',
        local_record_id: localRecordId,
        patient_id: patientDbId,
        patient_ihs_number: patientIhs,
        fhir_resource_id: `Encounter/${enc.encounterId}`,
        status: 'sent',
        http_status: 201,
        request_payload: body,
        response_payload: {
          patientIhs,
          encounterId: enc.encounterId,
          conditionIds,
          medicationRequestIds,
          medicationDispenseIds
        },
        error_message: null,
        synced_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({
          success: true,
          status: 'sent',
          logId: savedLogId,
          ihsNumber: patientIhs,
          encounterId: enc.encounterId,
          conditionIds,
          medicationRequestIds,
          medicationDispenseIds
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Aksi SATUSEHAT tidak dikenal: ${action}`);
  } catch (err: any) {
    const errMsg = err?.message || String(err);

    if (adminClient && patientDbId && action === 'sync_patient') {
      await adminClient
        .from('pasien')
        .update({ sync_satusehat: 'failed' })
        .eq('id', patientDbId);
    }

    const failedLogId = await upsertSatuSehatLog(adminClient, logId, {
      entity_type:
        action === 'sync_patient'
          ? 'Patient'
          : action === 'send_encounter'
          ? 'Encounter'
          : action === 'send_condition'
          ? 'Condition'
          : action === 'send_medication_request'
          ? 'MedicationRequest'
          : action === 'send_medication_dispense'
          ? 'MedicationDispense'
          : 'ClinicalBundle',
      local_record_id: localRecordId,
      patient_id: patientDbId,
      patient_ihs_number: body.patientIhs || null,
      status: 'failed',
      http_status: 500,
      request_payload: body,
      error_message: errMsg
    });

    return new Response(
      JSON.stringify({
        success: false,
        status: 'failed',
        logId: failedLogId,
        error: errMsg
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
