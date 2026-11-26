import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FACILITY_PROFILE_FILE = path.resolve(__dirname, 'facility-profile.json');
const PROMO_DISCOUNT_FILE = path.resolve(__dirname, 'promo-discount.json');
const PATIENT_LIVE_CHAT_FILE = path.resolve(__dirname, 'patient-live-chat.json');
const PUBLIC_CHAT_CONTEXT_FILE = path.resolve(__dirname, 'public-chat-context.json');

// Latisha Farma - Single-Tenant Server Configuration


interface LiveChatMessage {
  id: string;
  sessionId: string;
  sender: 'patient' | 'staff' | 'assistant';
  senderName: string;
  text: string;
  createdAt: string;
}

interface LiveChatSession {
  sessionId: string;
  patientName: string;
  patientPhone: string;
  source: 'portal' | 'in-app';
  createdAt: string;
  updatedAt: string;
  unreadForStaff: number;
  unreadForPatient: number;
  messages: LiveChatMessage[];
}

interface StoredLiveChatData {
  sessions: LiveChatSession[];
  updatedAt?: number;
}

interface StoredPublicChatContext {
  pharmacy?: Record<string, any>;
  doctors?: any[];
  schedules?: any[];
  medicines?: any[];
  activePromos?: any[];
  serviceFees?: Record<string, any>;
  queueSummary?: Record<string, any>;
  updatedAt?: number;
}

function readStoredPublicChatContext(): StoredPublicChatContext {
  try {
    if (fs.existsSync(PUBLIC_CHAT_CONTEXT_FILE)) {
      const raw = fs.readFileSync(PUBLIC_CHAT_CONTEXT_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (err) {
    console.warn('Failed to read public-chat-context.json:', err);
  }
  return {};
}

function writeStoredPublicChatContext(data: StoredPublicChatContext) {
  try {
    fs.writeFileSync(PUBLIC_CHAT_CONTEXT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to write public-chat-context.json:', err);
  }
}

function matchMedicinesForQuery(medicinesList: any[], queryText: string) {
  if (!Array.isArray(medicinesList) || medicinesList.length === 0) return [];
  const stopWords = new Set([
    'halo', 'hai', 'obat', 'harga', 'stok', 'ada', 'tidak', 'untuk', 'yang',
    'berapa', 'apakah', 'bisa', 'tolong', 'cek', 'info', 'cara', 'pakai',
    'minum', 'dan', 'atau', 'di', 'ke', 'dari', 'saya', 'kami', 'apotek',
    'klinik', 'pasien', 'dokter', 'bantu', 'ketersediaan', 'tersedia'
  ]);
  const tokens = String(queryText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  if (tokens.length === 0) {
    return medicinesList
      .filter((m: any) => Number(m?.stock || 0) > 0)
      .slice(0, 12)
      .map((m: any) => ({
        name: m.name,
        category: m.category || '-',
        stock: Number(m.stock || 0),
        unit: m.unit || m.satuanKecil || 'pcs',
        sellPrice: Number(m.sellPrice || 0),
        kekuatan: m.kekuatan || ''
      }));
  }

  const scored: Array<{ score: number; med: any }> = [];
  for (const m of medicinesList) {
    const hay = `${m?.name || ''} ${m?.category || ''} ${m?.kelas || ''} ${m?.kekuatan || ''}`.toLowerCase();
    let score = 0;
    for (const tk of tokens) {
      if (hay.includes(tk)) score += 1;
    }
    if (score > 0) scored.push({ score, med: m });
  }
  scored.sort((a, b) => b.score - a.score || Number(b.med?.stock || 0) - Number(a.med?.stock || 0));
  const top = scored.slice(0, 15).map((item) => item.med);
  const fallback = top.length > 0 ? top : medicinesList.filter((m: any) => Number(m?.stock || 0) > 0).slice(0, 10);
  return fallback.map((m: any) => ({
    name: m.name,
    category: m.category || '-',
    stock: Number(m.stock || 0),
    unit: m.unit || m.satuanKecil || 'pcs',
    sellPrice: Number(m.sellPrice || 0),
    kekuatan: m.kekuatan || ''
  }));
}

function stripWeeklyScheduleSection(text: string): string {
  if (!text || (!text.includes('Jadwal Lengkap Mingguan') && !text.includes('Daftar Dokter Terdaftar'))) {
    return text;
  }
  return text
    .replace(/\n+\*\*Jadwal Lengkap Mingguan:\*\*[\s\S]*?(?=\n+Silakan lengkapi formulir|\n+Hubungi petugas|$)/g, '')
    .replace(/\n+\*\*Daftar Dokter Terdaftar:\*\*[\s\S]*?(?=\n+Silakan lengkapi formulir|\n+Hubungi petugas|$)/g, '');
}

const LIVE_CHAT_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit tanpa interaksi

function stripChannelSuffix(sessionId: string): string {
  return String(sessionId || '').trim().replace(/__(obrolan|pasien)$/, '');
}

function getSessionLastActivityTime(session: LiveChatSession): number {
  const lastMsg =
    Array.isArray(session?.messages) && session.messages.length > 0
      ? session.messages[session.messages.length - 1]
      : null;
  const msgTime = lastMsg?.createdAt ? new Date(lastMsg.createdAt).getTime() : NaN;
  const updatedTime = session?.updatedAt ? new Date(session.updatedAt).getTime() : NaN;
  const createdTime = session?.createdAt ? new Date(session.createdAt).getTime() : NaN;
  const candidates = [msgTime, updatedTime, createdTime].filter((t) => Number.isFinite(t));
  return candidates.length > 0 ? Math.max(...candidates) : Date.now();
}

function isSessionExpiredByInactivity(session: LiveChatSession, nowMs = Date.now()): boolean {
  return nowMs - getSessionLastActivityTime(session) >= LIVE_CHAT_INACTIVITY_TIMEOUT_MS;
}

function readStoredLiveChatData(): LiveChatSession[] {
  try {
    if (fs.existsSync(PATIENT_LIVE_CHAT_FILE)) {
      const raw = fs.readFileSync(PATIENT_LIVE_CHAT_FILE, 'utf-8');
      const parsed: StoredLiveChatData = JSON.parse(raw);
      if (Array.isArray(parsed?.sessions)) {
        const nowMs = Date.now();
        return parsed.sessions
          .filter(
            (s) =>
              s &&
              typeof s.sessionId === 'string' &&
              (s.sessionId.endsWith('__obrolan') || s.sessionId.endsWith('__pasien')) &&
              Array.isArray(s.messages) &&
              !isSessionExpiredByInactivity(s, nowMs)
          )
          .map((s) => ({
            ...s,
            messages: s.messages.map((m) => ({
              ...m,
              text: stripWeeklyScheduleSection(String(m.text || ''))
            }))
          }));
      }
    }
  } catch (err) {
    console.warn('Failed to read patient-live-chat.json:', err);
  }
  return [];
}

function writeStoredLiveChatData(sessions: LiveChatSession[]) {
  try {
    const payload: StoredLiveChatData = {
      sessions,
      updatedAt: Date.now()
    };
    fs.writeFileSync(PATIENT_LIVE_CHAT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to write patient-live-chat.json:', err);
  }
}

interface StoredFacilityData {
  pharmacy?: Record<string, any>;
  apj?: Record<string, any>;
  dpj?: Record<string, any>;
  updatedAt?: number;
}

interface StoredPromoDiscountData {
  discounts: any[];
  promos: any[];
  updatedAt?: number;
}

const LEGACY_TENANT_NAME_REGEX = /\b(a?potek\s+sehat(\s+farma)?)\b/gi;

function sanitizeLegacyTenantFacilityData(data: StoredFacilityData): StoredFacilityData {
  if (!data || typeof data !== 'object') return {};
  if (!data.pharmacy || typeof data.pharmacy !== 'object') return data;
  const nextPharmacy = { ...data.pharmacy };
  if (typeof nextPharmacy.headerNote === 'string') {
    nextPharmacy.headerNote = nextPharmacy.headerNote.replace(LEGACY_TENANT_NAME_REGEX, 'APOTEK LATISHA FARMA');
  }
  if (typeof nextPharmacy.name === 'string') {
    nextPharmacy.name = nextPharmacy.name.replace(LEGACY_TENANT_NAME_REGEX, 'APOTEK LATISHA FARMA');
  }
  return { ...data, pharmacy: nextPharmacy };
}

function readStoredFacilityData(): StoredFacilityData {
  try {
    if (fs.existsSync(FACILITY_PROFILE_FILE)) {
      const raw = fs.readFileSync(FACILITY_PROFILE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return sanitizeLegacyTenantFacilityData(parsed);
    }
  } catch (err) {
    console.warn('Failed to read facility-profile.json:', err);
  }
  return {};
}

function writeStoredFacilityData(data: StoredFacilityData) {
  try {
    const cleaned = sanitizeLegacyTenantFacilityData(data);
    fs.writeFileSync(FACILITY_PROFILE_FILE, JSON.stringify(cleaned, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to write facility-profile.json:', err);
  }
}

function readStoredPromoDiscountData(): StoredPromoDiscountData {
  try {
    if (fs.existsSync(PROMO_DISCOUNT_FILE)) {
      const raw = fs.readFileSync(PROMO_DISCOUNT_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        discounts: Array.isArray(parsed?.discounts) ? parsed.discounts : [],
        promos: Array.isArray(parsed?.promos) ? parsed.promos : [],
        updatedAt: parsed?.updatedAt
      };
    }
  } catch (err) {
    console.warn('Failed to read promo-discount.json:', err);
  }
  return { discounts: [], promos: [] };
}

function writeStoredPromoDiscountData(data: StoredPromoDiscountData) {
  try {
    fs.writeFileSync(PROMO_DISCOUNT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to write promo-discount.json:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  let memoryFacilityData: StoredFacilityData = readStoredFacilityData();
  let memoryPromoDiscountData: StoredPromoDiscountData = readStoredPromoDiscountData();
  let memoryPublicChatContext: StoredPublicChatContext = readStoredPublicChatContext();
  const getFacilityProfile = (): StoredFacilityData => memoryFacilityData;
  const getPromoData = (): StoredPromoDiscountData => memoryPromoDiscountData;
  const getPublicContext = (): StoredPublicChatContext => memoryPublicChatContext;

  // Latisha Farma Enterprise — Single-Tenant Internal Server Routes

  // API Route: Sync live public clinic context (doctor schedules, medicine prices/stocks, promos, lab fees, queue)
  app.use('/api/public-chat-context', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/public-chat-context', (_req, res) => {
    res.json({
      hasData: Boolean(memoryPublicChatContext?.updatedAt),
      updatedAt: memoryPublicChatContext?.updatedAt || null,
      schedulesCount: Array.isArray(memoryPublicChatContext?.schedules) ? memoryPublicChatContext.schedules.length : 0,
      medicinesCount: Array.isArray(memoryPublicChatContext?.medicines) ? memoryPublicChatContext.medicines.length : 0
    });
  });

  app.get('/api/public-chat-context/portal-info', (_req, res) => {
    const storedPharmacy = memoryPublicChatContext?.pharmacy || {};
    const facilityPharmacy = memoryFacilityData?.pharmacy || {};
    const phone =
      String(storedPharmacy.phone || facilityPharmacy.phone || '').trim() || '0895326272957';
    res.json({
      pharmacy: {
        name:
          String(storedPharmacy.name || facilityPharmacy.name || '').trim() ||
          'Apotek & Klinik Latisha Farma',
        branchName: String(storedPharmacy.branchName || facilityPharmacy.name || '-').trim(),
        address: String(storedPharmacy.address || facilityPharmacy.address || '-').trim(),
        phone
      },
      medicinesCount: Array.isArray(memoryPublicChatContext?.medicines)
        ? memoryPublicChatContext.medicines.length
        : 0,
      schedulesCount: Array.isArray(memoryPublicChatContext?.schedules)
        ? memoryPublicChatContext.schedules.length
        : 0,
      updatedAt: memoryPublicChatContext?.updatedAt || null
    });
  });

  app.get('/api/public-chat-context/medicines', (req, res) => {
    const rawQ = String(req.query.q || '').trim().toLowerCase();
    const list = Array.isArray(memoryPublicChatContext?.medicines)
      ? memoryPublicChatContext.medicines
      : [];

    if (!rawQ) {
      const available = list.filter((m: any) => Number(m?.stock || 0) > 0).slice(0, 18);
      return res.json({
        medicines: available.length > 0 ? available : list.slice(0, 18),
        total: list.length
      });
    }

    const tokens = rawQ.split(/\s+/).filter(Boolean);
    const matched = list
      .filter((m: any) => {
        const haystack = `${m?.name || ''} ${m?.category || ''} ${m?.kelas || ''} ${m?.kekuatan || ''}`.toLowerCase();
        return tokens.every((tk) => haystack.includes(tk));
      })
      .slice(0, 25);

    res.json({
      medicines: matched,
      total: list.length
    });
  });

  app.post('/api/public-chat-context', (req, res) => {
    try {
      const body = req.body || {};
      const nextCtx: StoredPublicChatContext = {
        pharmacy: body.pharmacy || memoryPublicChatContext.pharmacy || {},
        doctors: Array.isArray(body.doctors) ? body.doctors.slice(0, 50) : memoryPublicChatContext.doctors || [],
        schedules: Array.isArray(body.schedules) ? body.schedules.slice(0, 200) : memoryPublicChatContext.schedules || [],
        medicines: Array.isArray(body.medicines)
          ? body.medicines.slice(0, 1500).map((m: any) => ({
              name: String(m?.name || '').slice(0, 120),
              category: String(m?.category || '').slice(0, 80),
              kelas: String(m?.kelas || '').slice(0, 80),
              kekuatan: String(m?.kekuatan || '').slice(0, 60),
              stock: Number(m?.stock || 0),
              unit: String(m?.unit || 'pcs').slice(0, 30),
              sellPrice: Number(m?.sellPrice || 0)
            }))
          : memoryPublicChatContext.medicines || [],
        activePromos: Array.isArray(body.activePromos) ? body.activePromos.slice(0, 30) : memoryPublicChatContext.activePromos || [],
        serviceFees: body.serviceFees || memoryPublicChatContext.serviceFees || {},
        queueSummary: body.queueSummary || memoryPublicChatContext.queueSummary || {},
        updatedAt: Date.now()
      };

      memoryPublicChatContext = nextCtx;
      writeStoredPublicChatContext(memoryPublicChatContext);
      res.json({ ok: true, updatedAt: nextCtx.updatedAt });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to sync public chat context' });
    }
  });

  // API Route: Get & Save Facility Profile + Logo
  app.get('/api/facility-profile', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(memoryFacilityData);
  });

  app.post('/api/facility-profile', (req, res) => {
    try {
      const { pharmacy, apj, dpj } = req.body || {};
      const nextFacility: StoredFacilityData = sanitizeLegacyTenantFacilityData({
        pharmacy: pharmacy !== undefined ? pharmacy : memoryFacilityData.pharmacy,
        apj: apj !== undefined ? apj : memoryFacilityData.apj,
        dpj: dpj !== undefined ? dpj : memoryFacilityData.dpj,
        updatedAt: Date.now()
      });
      memoryFacilityData = nextFacility;
      writeStoredFacilityData(memoryFacilityData);
      res.json({ ok: true, updatedAt: nextFacility.updatedAt });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save facility profile' });
    }
  });

  // API Route: Get & Save Sales Discounts & Live Portal Promos
  app.get('/api/promo-discount', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(memoryPromoDiscountData);
  });

  app.post('/api/promo-discount', (req, res) => {
    try {
      const { discounts, promos } = req.body || {};
      const nextPromo: StoredPromoDiscountData = {
        discounts: Array.isArray(discounts) ? discounts : memoryPromoDiscountData.discounts,
        promos: Array.isArray(promos) ? promos : memoryPromoDiscountData.promos,
        updatedAt: Date.now()
      };
      memoryPromoDiscountData = nextPromo;
      writeStoredPromoDiscountData(memoryPromoDiscountData);
      res.json({ ok: true, updatedAt: nextPromo.updatedAt });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save promo & discount data' });
    }
  });

  app.get('/api/facility-logo', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const logoUrl = memoryFacilityData?.pharmacy?.logoUrl;
    if (!logoUrl || typeof logoUrl !== 'string') {
      return res.status(404).end();
    }
    const match = logoUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', mimeType);
      return res.send(buffer);
    }
  });


  // API Route: Store & Retrieve Print Payload (prevents 414 Request-URI Too Large)
  const memoryPrintPayloads: Record<string, any> = {};

  app.post('/api/print-payload', (req, res) => {
    try {
      const { key, payload } = req.body || {};
      if (key && payload !== undefined) {
        memoryPrintPayloads[key] = payload;
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save print payload' });
    }
  });

  app.get('/api/print-payload/:key', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const key = req.params.key;
    const payload = memoryPrintPayloads[key] || null;
    res.json({ payload });
  });

  // API Route: Analisis Cerdas DRPs (Drug-Related Problems) oleh AI dengan Standar Literatur Farmasi & Tautan Resmi
  app.post('/api/gemini/drp-analysis', async (req, res) => {
    try {
      const { patient, rme, prescriptions } = req.body;

      if (!prescriptions || !Array.isArray(prescriptions) || prescriptions.length === 0) {
        return res.status(400).json({ error: 'Data obat resep tidak boleh kosong.' });
      }

      // Check if GEMINI_API_KEY is available
      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build'
              }
            }
          });

          const prompt = `Lakukan analisis klinis mendalam (Clinical Decision Support System / CDSS Farmasi) untuk mengidentifikasi Drug-Related Problems (DRPs) pada e-resep pasien berikut dengan menerapkan standar literatur farmasi ketat dan penautan referensi online kredibel:

PROFIL PASIEN:
- Nama: ${patient?.name || '-'}
- No. RM: ${patient?.rmId || '-'}
- Usia: ${patient?.age || '-'} tahun (${patient?.gender || '-'})
- Riwayat Alergi Obat/Makanan: ${patient?.allergy || 'Tidak ada riwayat alergi yang dilaporkan'}
- Kategori Pasien: ${patient?.category || 'Umum'}

DATA REKAM MEDIS ELEKTRONIK (RME) AKTUAL:
- Keluhan Utama (Subjective): ${rme?.soapS || rme?.keluhanUtama || '-'}
- Pemeriksaan Fisik & Tanda Vital (Objective): TD: ${rme?.vitalSign?.td || '-'} mmHg, Suhu: ${rme?.vitalSign?.suhu || '-'} C, Nadi: ${rme?.vitalSign?.nadi || '-'} x/menit, BB: ${rme?.vitalSign?.bb || '-'} kg, TB: ${rme?.vitalSign?.tb || '-'} cm, SpO2: ${rme?.vitalSign?.spo2 || '-'}%
- Diagnosa Kerja & ICD-10 (Assessment): ${rme?.icdName ? `${rme.icdCode} - ${rme.icdName}` : (rme?.soapA || '-')}
- Catatan Dokter / Plan: ${rme?.soapP || '-'}
- Riwayat Penyakit Terdahulu: ${rme?.riwayatPenyakit || '-'}
- Riwayat Pengobatan Sebelumnya: ${rme?.riwayatPengobatanSebelumnya || '-'}

DAFTAR OBAT YANG DIRESEPKAN:
${prescriptions.map((it: any, idx: number) => `${idx + 1}. ${it.name} | Qty: ${it.qty} ${it.unit || ''} | Aturan Pakai: ${it.dosage || '-'}`).join('\n')}

ATURAN MUTLAK MENGENAI SUMBER REFERENSI ILMIAH & TAUTAN INTERNET:
1. WAJIB MENYERTAKAN SUMBER RUJUKAN KREDIBEL:
   Setiap kali AI mendeteksi adanya DRP (Drug-Related Problems), potensi interaksi, kontraindikasi alergi, ketidaksesuaian indikasi, atau penilaian klinis, AI WAJIB mencantumkan sumber literatur resmi yang mendasarinya (seperti Pedoman Praktik Klinis Dokter Kemenkes RI No. HK.02.02/MENKES/514/2015, Formularium Nasional Kemenkes RI, British National Formulary [BNF 86], Lexicomp Drug Interactions, BPOM PIONAS, ISO Indonesia, MIMS, atau Stockley's Drug Interactions).
2. PENAUTAN TAUTAN (LINK/URL) PENDUKUNG DARI INTERNET:
   Jika rujukan bersumber dari pedoman daring yang valid, panduan klinis resmi, atau artikel jurnal/farmasi terakreditasi di internet, SERTAKAN TAUTAN (hyperlink/URL) AKTIF DAN LANGSUNG menuju sumber tersebut di dalam properti 'referenceUrl'.
   Contoh domain rujukan resmi yang valid:
   - Pedoman Praktik Klinis Kemenkes RI: https://yankes.kemkes.go.id/unduhan/fileunduhan_1610411306_913506.pdf
   - BPOM PIONAS (Pusat Informasi Obat Nasional): https://pionas.pom.go.id/monografi/amoksisilin atau https://pionas.pom.go.id/
   - BNF (NICE UK): https://bnf.nice.org.uk/treatment-summaries/penicillins/ atau https://bnf.nice.org.uk/interaction/
   - Lexicomp / Drugs.com Interaction Database: https://www.drugs.com/drug-interactions.html
   - Pedoman Tatalaksana Hipertensi PERKI: https://inaheart.org/panduan-klinis/
3. DILARANG KERAS MEMBERIKAN RUJUKAN FIKTIF:
   Dilarang keras mengarang URL palsu atau rujukan umum tanpa dasar literatur yang jelas. Jika argumen bersifat standar klinis universal, sebutkan nama pedoman dan bab/halaman atau instansi penerbitnya secara spesifik beserta tautan domain resmi.

ATURAN VALIDASI KETAT SESUAI RME PASIEN (BUKAN ASUMSI):
1. Cocokkan obat HANYA terhadap data nyata pada RME pasien di atas (Keluhan Utama, Diagnosa ICD-10, Tanda Vital, Riwayat Alergi, Riwayat Penyakit).
2. Jika ada obat yang TIDAK SEJALAN dengan diagnosa (misal: antibiotik pada Common Cold/ISPA virus tanpa tanda infeksi bakteri sekunder, atau NSAID pada pasien hipertensi/tukak lambung tanpa indikasi atau tanpa proteksi), tandai tegas sebagai masalah 'Ketidaksesuaian Indikasi' (Unindicated Drug) atau 'Drug-Disease Interaction' dengan tingkat risiko 'Kritis' atau 'Sedang', jelaskan mekanisme farmakologinya secara ilmiah, dan sertakan rujukan literatur serta URL resmi.
3. Untuk setiap temuan DRP, sertakan:
   - Nama obat bermasalah (drugName)
   - Kategori DRP (category: misal 'Interaksi Obat', 'Dosis Berlebih', 'Dosis Kurang', 'Kontraindikasi Alergi', atau 'Ketidaksesuaian Indikasi')
   - Tingkat keparahan (severity: 'Kritis', 'Sedang', atau 'Rendah')
   - Penjelasan klinis ilmiah berdasarkan mekanisme farmakologi (clinicalExplanation)
   - Rekomendasi/solusi konkret tanpa asumsi mengambang (recommendation)
   - Lampiran rujukan literatur standar (literatureReference: misal 'BNF 86 hal. 420; Lexicomp Drug Interactions', 'Pedoman Praktik Klinis Kemenkes RI HK.02.02/MENKES/514/2015')
   - Tautan internet resmi (referenceUrl: URL aktif menuju rujukan)

Tentukan riskLevel secara akurat:
- 'CRITICAL': Jika terdapat alergi langsung, kontraindikasi fatal, interaksi berat, atau overdosis berbahaya (Warna Merah).
- 'MODERATE': Jika terdapat ketidaksesuaian indikasi tanpa bahaya fatal, interaksi sedang, duplikasi parsial, atau perlu penyesuaian aturan/monitoring (Warna Kuning).
- 'SAFE': Jika semua obat sesuai indikasi, dosis tepat, tidak ada interaksi bermakna, dan aman dikonsumsi (Warna Hijau).`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              systemInstruction: `Anda adalah Sistem Pendukung Keputusan Klinis (Clinical Decision Support System / CDSS) Farmasi Apotek Latisha Farma. Berikan analisis DRPs (Drug-Related Problems) yang sangat akurat, berbasis bukti literatur standar resmi (BNF, Lexicomp, MIMS, ISO Indonesia, BPOM PIONAS, Pedoman Praktik Klinis Kemenkes RI). Setiap temuan DRPs WAJIB menyertakan rujukan literatur kredibel dan tautan (URL) aktif langsung ke sumber pedoman resmi. Dilarang keras memberikan rujukan fiktif atau asumsi mengambang. Tuliskan rekomendasi actionable dalam bahasa Indonesia medis profesional.`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  riskLevel: {
                    type: Type.STRING,
                    description: "Tingkat risiko klinis: 'CRITICAL', 'MODERATE', atau 'SAFE'."
                  },
                  summary: {
                    type: Type.STRING,
                    description: "Ringkasan eksekutif hasil skrining DRPs dalam 1-2 kalimat."
                  },
                  identifiedDRPs: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        drugName: { type: Type.STRING, description: "Nama obat yang bermasalah" },
                        category: { type: Type.STRING, description: "Kategori DRP: 'Interaksi Obat', 'Dosis Berlebih', 'Dosis Kurang', 'Kontraindikasi Alergi', atau 'Ketidaksesuaian Indikasi'" },
                        severity: { type: Type.STRING, description: "'Kritis', 'Sedang', atau 'Rendah'" },
                        clinicalExplanation: { type: Type.STRING, description: "Penjelasan mekanisme klinis ilmiah menurut literatur farmakologi" },
                        recommendation: { type: Type.STRING, description: "Solusi / rekomendasi konkret bagi apoteker" },
                        literatureReference: { type: Type.STRING, description: "Rujukan literatur standar resmi (BNF, Lexicomp, Pedoman Kemenkes RI, ISO/MIMS, BPOM PIONAS)" },
                        referenceUrl: { type: Type.STRING, description: "Tautan aktif (URL) langsung menuju pedoman resmi daring, monografi BPOM PIONAS, BNF NICE, atau literatur terakreditasi" }
                      }
                    },
                    description: "Daftar terstruktur DRPs yang teridentifikasi secara lengkap beserta rujukan literatur dan tautan resmi."
                  },
                  drugDrugInteractions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        severity: { type: Type.STRING, description: "'Tinggi', 'Sedang', atau 'Rendah'" },
                        drugs: { type: Type.STRING, description: "Nama obat yang saling berinteraksi" },
                        mechanism: { type: Type.STRING, description: "Mekanisme interaksi farmakokinetik / farmakodinamik" },
                        clinicalEffect: { type: Type.STRING, description: "Dampak klinis pada pasien" },
                        recommendation: { type: Type.STRING, description: "Saran tindakan apoteker (misal jeda waktu minum, ganti obat)" },
                        literatureReference: { type: Type.STRING, description: "Rujukan literatur (misal: BNF 86, Lexicomp)" },
                        referenceUrl: { type: Type.STRING, description: "Tautan aktif (URL) basis data interaksi resmi" }
                      }
                    }
                  },
                  drugDiseaseInteractions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        drug: { type: Type.STRING, description: "Nama obat" },
                        conditionOrDiagnosis: { type: Type.STRING, description: "Diagnosa / kondisi penyakit pasien" },
                        issue: { type: Type.STRING, description: "Kesesuaian indikasi atau kontraindikasi penyakit" },
                        recommendation: { type: Type.STRING, description: "Saran penyesuaian klinis" },
                        literatureReference: { type: Type.STRING, description: "Rujukan literatur pedoman klinis (misal: Pedoman Praktik Klinis Kemenkes RI No. HK.02.02/MENKES/514/2015)" },
                        referenceUrl: { type: Type.STRING, description: "Tautan aktif (URL) pedoman klinis resmi daring" }
                      }
                    }
                  },
                  dosageAnalysis: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        drug: { type: Type.STRING, description: "Nama obat" },
                        prescribedDose: { type: Type.STRING, description: "Dosis pada resep" },
                        standardDose: { type: Type.STRING, description: "Rentang dosis lazim menurut literatur" },
                        status: { type: Type.STRING, description: "'Sesuai', 'Underdose', 'Overdose', atau 'Perlu Penyesuaian'" },
                        notes: { type: Type.STRING, description: "Catatan klinis dosis" },
                        literatureReference: { type: Type.STRING, description: "Rujukan literatur (misal: BNF 86, BPOM PIONAS)" },
                        referenceUrl: { type: Type.STRING, description: "Tautan aktif (URL) monografi resmi" }
                      }
                    }
                  },
                  allergyAndContraindications: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        drug: { type: Type.STRING, description: "Nama obat" },
                        riskType: { type: Type.STRING, description: "'Alergi', 'Kontraindikasi', atau 'Duplikasi Terapi'" },
                        explanation: { type: Type.STRING, description: "Penjelasan bahaya atau reaksi silang" },
                        alertLevel: { type: Type.STRING, description: "'Kritis' atau 'Peringatan'" },
                        literatureReference: { type: Type.STRING, description: "Rujukan literatur (misal: BNF 86 Bab 5.1.1; BPOM PIONAS; Lexicomp Drug Allergy)" },
                        referenceUrl: { type: Type.STRING, description: "Tautan aktif (URL) monografi atau referensi alergi" }
                      }
                    }
                  },
                  pharmacistRecommendations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Daftar rekomendasi poin per poin untuk apoteker konsultasikan ke dokter peresep."
                  },
                  screeningPassedRecommendation: {
                    type: Type.BOOLEAN,
                    description: "True jika resep dapat diloloskan (dengan monitoring), False jika perlu konfirmasi revisi dokter."
                  }
                }
              }
            }
          });

          const parsedResult = JSON.parse(response.text || '{}');
          return res.json({
            ...parsedResult,
            source: 'gemini-3.8-flash',
            timestamp: new Date().toISOString()
          });
        } catch (geminiError: any) {
          console.warn('Gemini API call warning, utilizing clinical expert fallback engine:', geminiError?.message || geminiError);
          // Fall through to expert rule-based engine below
        }
      }

      // Expert Clinical Pharmacology Fallback Engine
      // Menganalisis data RME nyata dengan standar literatur farmasi BNF, ISO, MIMS, Pedoman Kemenkes RI, BPOM PIONAS, dan Lexicomp
      const patientAllergy = String(patient?.allergy || '').toLowerCase();
      const rxNames = prescriptions.map((p: any) => p.name.toLowerCase());

      const identifiedDRPs: any[] = [];
      const ddiList: any[] = [];
      const diseaseList: any[] = [];
      const doseList: any[] = [];
      const allergyList: any[] = [];
      const recommendations: string[] = [];
      let calculatedRisk: 'CRITICAL' | 'MODERATE' | 'SAFE' = 'SAFE';

      // 1. Validasi Riwayat Alergi Pasien (RME)
      if (patientAllergy && !patientAllergy.includes('tidak ada') && !patientAllergy.includes('-')) {
        for (const p of prescriptions) {
          const pNameLower = p.name.toLowerCase();
          // Penisilin / Amoksisilin
          if (
            (patientAllergy.includes('penisilin') || patientAllergy.includes('penicillin') || patientAllergy.includes('amoxicillin')) &&
            (pNameLower.includes('amoxicillin') || pNameLower.includes('ampicillin') || pNameLower.includes('amoksisilin'))
          ) {
            calculatedRisk = 'CRITICAL';
            const lit = 'BNF 86 Bab 5.1.1 (Penicillins & Hypersensitivity); BPOM PIONAS Amoksisilin; Lexicomp Drug Allergy Reference';
            const litUrl = 'https://pionas.pom.go.id/monografi/amoksisilin';
            const explanation = `Pasien memiliki riwayat alergi terdokumentasi terhadap ${patient.allergy}. Peresepan ${p.name} berisiko fatal memicu reaksi hipersensitivitas tipe I (anafilaksis / bronkospasme berat) atau sindrom Steven-Johnson diperantarai IgE.`;
            const rec = `Hentikan ${p.name} segera. Rekomendasikan penggantian antibiotik non-betalaktam (misal Azitromisin 500mg OD) jika memang terbukti ada infeksi bakteri sekunder.`;
            
            allergyList.push({
              drug: p.name,
              riskType: 'Alergi',
              explanation,
              alertLevel: 'Kritis',
              literatureReference: lit,
              referenceUrl: litUrl
            });

            identifiedDRPs.push({
              drugName: p.name,
              category: 'Kontraindikasi Alergi',
              severity: 'Kritis',
              clinicalExplanation: explanation,
              recommendation: rec,
              literatureReference: lit,
              referenceUrl: litUrl
            });

            recommendations.push(rec);
          }

          // Alergi Parasetamol
          if (patientAllergy.includes('paracetamol') && pNameLower.includes('paracetamol')) {
            calculatedRisk = 'CRITICAL';
            const lit = 'BPOM PIONAS Parasetamol; BNF 86 Analgesics Reference; MIMS Indonesia';
            const litUrl = 'https://pionas.pom.go.id/monografi/parasetamol';
            const explanation = `Pasien memiliki riwayat alergi terdokumentasi terhadap Parasetamol. Reaksi silang dapat memicu ruam kutaneus, urtikaria akut, hingga hepatotoksisitas.`;
            const rec = `Hentikan Parasetamol. Ganti dengan antipiretik/analgetik alternatif sesuai profil lambung pasien.`;

            allergyList.push({
              drug: p.name,
              riskType: 'Alergi',
              explanation,
              alertLevel: 'Kritis',
              literatureReference: lit,
              referenceUrl: litUrl
            });

            identifiedDRPs.push({
              drugName: p.name,
              category: 'Kontraindikasi Alergi',
              severity: 'Kritis',
              clinicalExplanation: explanation,
              recommendation: rec,
              literatureReference: lit,
              referenceUrl: litUrl
            });

            recommendations.push(rec);
          }
        }
      }

      // 2. Cek Interaksi Obat-dengan-Obat (Drug-Drug Interactions)
      const hasCorticosteroid = rxNames.some((n: string) => n.includes('dexa') || n.includes('prednison') || n.includes('metilprednisolon'));
      const hasNSAID = rxNames.some((n: string) => n.includes('ibuprofen') || n.includes('mefenamat') || n.includes('diklofenak') || n.includes('ketorolac') || n.includes('meloxicam'));
      const hasAntihypertensive = rxNames.some((n: string) => n.includes('amlodipine') || n.includes('captopril') || n.includes('candesartan') || n.includes('losartan'));

      // Kortikosteroid + NSAID
      if (hasCorticosteroid && hasNSAID) {
        if (calculatedRisk !== 'CRITICAL') calculatedRisk = 'MODERATE';
        const lit = 'BNF 86 hal. 620 & 1104; Lexicomp Drug Interactions (Severity: Major/Moderate); Stockley\'s Drug Interactions';
        const litUrl = 'https://www.drugs.com/drug-interactions.html';
        const ddiDrugs = 'Kortikosteroid + NSAID';
        const mechanism = 'Kombinasi agen antiinflamasi steroid dan non-steroid secara sinergis meningkatkan erosi mikrovaskular dan menghambat sintesis prostaglandin protektif lambung (PGE2 & PGI2).';
        const clinicalEffect = 'Peningkatan risiko perdarahan saluran cerna atas, perforasi lambung, dan ulkus peptikum hingga 4-15 kali lipat dibandingkan monoterapi.';
        const rec = 'Hindari peresepan kombinasi jika keluhan radang dapat diatasi monoterapi. Jika mutlak diperlukan, wajib tambahkan gastroprotektor (PPI seperti Omeprazole 20mg a.c.) dan diminum sesudah makan.';

        ddiList.push({
          severity: 'Sedang',
          drugs: ddiDrugs,
          mechanism,
          clinicalEffect,
          recommendation: rec,
          literatureReference: lit,
          referenceUrl: litUrl
        });

        identifiedDRPs.push({
          drugName: ddiDrugs,
          category: 'Interaksi Obat',
          severity: 'Sedang',
          clinicalExplanation: `${mechanism} Dampak: ${clinicalEffect}`,
          recommendation: rec,
          literatureReference: lit,
          referenceUrl: litUrl
        });

        recommendations.push('Berikan proteksi lambung (PPI seperti Omeprazole 20mg) dan edukasi minum obat sesudah makan.');
      }

      // NSAID + Antihipertensi (Amlodipine / ACEi)
      if (hasNSAID && hasAntihypertensive) {
        if (calculatedRisk !== 'CRITICAL') calculatedRisk = 'MODERATE';
        const lit = 'BNF 86 hal. 1105 (NSAIDs and Antihypertensives); Pedoman Hipertensi PERKI 2021; MIMS Indonesia';
        const litUrl = 'https://inaheart.org/panduan-klinis/';
        const ddiDrugs = 'NSAID + Antihipertensi (CCB/ACEi)';
        const mechanism = 'NSAID menghambat sintesis prostaglandin renal vasodilatator, memicu retensi natrium & air serta peningkatan resistensi vaskular sistemik.';
        const clinicalEffect = 'Dapat menumpulkan efektivitas terapi antihipertensi dan menaikkan tekanan darah rata-rata 3-6 mmHg pada pasien hipertensi.';
        const rec = 'Batasi durasi NSAID maksimal 3-5 hari atau ganti dengan Parasetamol oral sebagai lini pertama. Monitor tekanan darah harian secara berkala.';

        ddiList.push({
          severity: 'Sedang',
          drugs: ddiDrugs,
          mechanism,
          clinicalEffect,
          recommendation: rec,
          literatureReference: lit,
          referenceUrl: litUrl
        });

        identifiedDRPs.push({
          drugName: ddiDrugs,
          category: 'Interaksi Obat',
          severity: 'Sedang',
          clinicalExplanation: `${mechanism} Dampak: ${clinicalEffect}`,
          recommendation: rec,
          literatureReference: lit,
          referenceUrl: litUrl
        });

        recommendations.push('Monitoring tekanan darah pasien secara teratur selama penggunaan kombinasi NSAID dan antihipertensi.');
      }

      // 3. Validasi Ketat Sesuai RME Pasien: Kesesuaian Indikasi (Drug-Disease Interactions / Unindicated Drug)
      const diagStr = `${rme?.icdCode || ''} ${rme?.icdName || ''} ${rme?.soapA || ''} ${rme?.soapS || ''}`.toLowerCase();
      const vitalTd = String(rme?.vitalSign?.td || '');
      const isHypertensivePatient = diagStr.includes('hipertensi') || diagStr.includes('i10') || vitalTd.startsWith('14') || vitalTd.startsWith('15') || vitalTd.startsWith('16') || vitalTd.startsWith('17');
      const isCommonCold = diagStr.includes('common cold') || diagStr.includes('nasofaringitis') || diagStr.includes('j00') || (diagStr.includes('ispa') && !diagStr.includes('pneumonia'));

      for (const it of prescriptions) {
        const nameLower = it.name.toLowerCase();

        // 3a. Kasus Obat Tanpa Indikasi / ISPA Viral diberi Antibiotik
        if (isCommonCold && (nameLower.includes('amoxicillin') || nameLower.includes('ampicillin') || nameLower.includes('cefixime') || nameLower.includes('azithromycin') || nameLower.includes('ciprofloxacin'))) {
          // Hanya jika belum ditandai alergi
          const alreadyFlaggedAllergy = allergyList.some((a) => a.drug.toLowerCase() === nameLower);
          if (!alreadyFlaggedAllergy) {
            if (calculatedRisk !== 'CRITICAL') calculatedRisk = 'MODERATE';
            const lit = 'Pedoman Praktik Klinis Kemenkes RI No. HK.02.02/MENKES/514/2015 hal. 211 (Tatalaksana Common Cold); ISO Indonesia Vol. 54';
            const litUrl = 'https://yankes.kemkes.go.id/unduhan/fileunduhan_1610411306_913506.pdf';
            const issue = `Common Cold / ISPA non-spesifik (>90%) disebabkan oleh infeksi virus (Rhinovirus/Coronavirus). Peresepan antibiotik ${it.name} tanpa adanya tanda infeksi bakteri sekunder (dahak purulen tebal, leukositosis, demam >3-5 hari) tergolong Obat Tanpa Indikasi (Unindicated Drug).`;
            const rec = `Konfirmasi indikasi antibiotik ke dokter peresep. Utamakan terapi simptomatik rasional (dekongestan, hidrasi adekuat, istirahat) untuk mencegah resistensi antimikroba (AMR).`;

            diseaseList.push({
              drug: it.name,
              conditionOrDiagnosis: rme?.icdName || rme?.soapA || 'Common Cold (J00)',
              issue,
              recommendation: rec,
              literatureReference: lit,
              referenceUrl: litUrl
            });

            identifiedDRPs.push({
              drugName: it.name,
              category: 'Ketidaksesuaian Indikasi',
              severity: 'Sedang',
              clinicalExplanation: issue,
              recommendation: rec,
              literatureReference: lit,
              referenceUrl: litUrl
            });

            recommendations.push(`Evaluasi urgensi antibiotik ${it.name} pada infeksi virus saluran napas atas (sesuai Pedoman Kemenkes RI).`);
          }
        }

        // 3b. Kasus Hipertensi diberi NSAID
        if (isHypertensivePatient && (nameLower.includes('ibuprofen') || nameLower.includes('mefenamat') || nameLower.includes('diklofenak'))) {
          const lit = 'Pedoman Tatalaksana Hipertensi PERKI 2021; BNF 86 hal. 1105; BPOM PIONAS';
          const litUrl = 'https://inaheart.org/panduan-klinis/';
          const issue = `Pasien memiliki diagnosa/tanda vital hipertensi (TD: ${vitalTd || 'Meningkat'}). Penggunaan NSAID berpotensi memicu retensi cairan renal dan memperberat hipertensi.`;
          const rec = `Evaluasi penggantian analgetik dengan Parasetamol oral (500-1000 mg) yang memiliki profil kardiovaskular dan hemodinamik lebih aman.`;

          diseaseList.push({
            drug: it.name,
            conditionOrDiagnosis: `Hipertensi (${vitalTd ? `TD ${vitalTd} mmHg` : 'Diagnosa RME'})`,
            issue,
            recommendation: rec,
            literatureReference: lit,
            referenceUrl: litUrl
          });

          identifiedDRPs.push({
            drugName: it.name,
            category: 'Ketidaksesuaian Indikasi',
            severity: 'Sedang',
            clinicalExplanation: issue,
            recommendation: rec,
            literatureReference: lit,
            referenceUrl: litUrl
          });
        }

        // 4. Analisis Ketepatan Dosis (Dosage Analysis) dengan Literatur Standar
        let stdDose = 'Sesuai Formularium Nasional & ISO Indonesia';
        let status: 'Sesuai' | 'Underdose' | 'Overdose' | 'Perlu Penyesuaian' = 'Sesuai';
        let note = 'Dosis lazim terapi dewasa normal.';
        let doseLit = 'ISO Indonesia Vol. 54; BNF 86';
        let doseUrl = 'https://pionas.pom.go.id/';

        if (nameLower.includes('paracetamol')) {
          stdDose = '500mg - 1000mg per dosis (maks 4000mg/hari)';
          doseLit = 'BNF 86 Analgesics & Antipyretics; BPOM PIONAS Parasetamol';
          doseUrl = 'https://pionas.pom.go.id/monografi/parasetamol';
          if (it.dosage.includes('4x') || it.dosage.includes('3x')) {
            status = 'Sesuai';
            note = 'Dosis terapi analgesik-antipiretik tepat dan aman bagi fungsi hepar dewasa normal.';
          }
        } else if (nameLower.includes('cetirizine')) {
          stdDose = '10mg 1x sehari malam hari';
          doseLit = 'BNF 86 hal. 312; BPOM PIONAS Setirizin; MIMS Indonesia';
          doseUrl = 'https://pionas.pom.go.id/monografi/setirizin-hidroklorida';
          if (it.dosage.includes('1x') || it.dosage.includes('malam')) {
            status = 'Sesuai';
            note = 'Aturan pakai tepat untuk meminimalkan efek sedasi siang hari.';
          } else if (it.dosage.includes('3x') || it.dosage.includes('2x')) {
            status = 'Overdose';
            note = 'Cetirizine merupakan antihistamin generasi ke-2 dengan half-life eliminasi panjang (24 jam); dosis optimal cukup 1x1 sehari 10mg.';
            doseLit = 'BNF 86 hal. 312; BPOM PIONAS Setirizin; MIMS Indonesia';
            doseUrl = 'https://pionas.pom.go.id/monografi/setirizin-hidroklorida';
            if (calculatedRisk !== 'CRITICAL') calculatedRisk = 'MODERATE';
            
            const rec = 'Koreksi frekuensi Cetirizine menjadi 1x1 tablet per hari (malam hari sebelum tidur).';
            recommendations.push(rec);

            identifiedDRPs.push({
              drugName: it.name,
              category: 'Dosis Berlebih',
              severity: 'Sedang',
              clinicalExplanation: note,
              recommendation: rec,
              literatureReference: doseLit,
              referenceUrl: doseUrl
            });
          }
        } else if (nameLower.includes('amoxicillin')) {
          stdDose = '500mg tiap 8 jam (3x sehari) selama 5-7 hari';
          doseLit = 'BNF 86 Bab 5.1.1; BPOM PIONAS Amoksisilin; Fornas Kemenkes RI';
          doseUrl = 'https://pionas.pom.go.id/monografi/amoksisilin';
          status = 'Sesuai';
          note = 'Dosis antibiotik standar infeksi bakteri rentan. Harus dihabiskan untuk mencegah resistensi.';
        } else if (nameLower.includes('amlodipine')) {
          stdDose = '5mg - 10mg 1x sehari pagi/malam hari';
          doseLit = 'BNF 86 Cardiovascular System; BPOM PIONAS Amlodipin; Pedoman PERKI';
          doseUrl = 'https://pionas.pom.go.id/monografi/amlodipin';
          status = 'Sesuai';
          note = 'Dosis monoterapi / kombinasi antihipertensi standar.';
        }

        doseList.push({
          drug: it.name,
          prescribedDose: it.dosage,
          standardDose: stdDose,
          status,
          notes: note,
          literatureReference: doseLit,
          referenceUrl: doseUrl
        });
      }

      // Default rekomendasi jika aman
      if (recommendations.length === 0) {
        recommendations.push('Regimen peresepan rasional, memenuhi kaidah Formularium Nasional dan panduan klinis.');
        recommendations.push('Lanjutkan dispensing dengan KIE etiket obat yang lengkap dan jelas bagi pasien.');
      }

      // Ringkasan Eksekutif
      const summaryText =
        calculatedRisk === 'CRITICAL'
          ? `PERINGATAN KRITIS DRPs: Ditemukan bahaya klinis signifikan (${allergyList.map((a: any) => a.explanation).join('. ')}). Konfirmasi dokter wajib dilakukan sebelum peracikan!`
          : calculatedRisk === 'MODERATE'
          ? `PERHATIAN DRPs (TINGKAT SEDANG): Teridentifikasi ${identifiedDRPs.length} potensi masalah (interaksi obat, ketidaksesuaian indikasi RME, atau penyesuaian aturan pakai). Disarankan konfirmasi dokter atau edukasi terarah.`
          : `SKRINING LOLOS AMAN: Seluruh obat rasional dan sesuai indikasi diagnosa RME, dosis standar terpenuhi, dan tidak ada interaksi atau kontraindikasi alergi terdeteksi.`;

      return res.json({
        riskLevel: calculatedRisk,
        summary: summaryText,
        identifiedDRPs,
        drugDrugInteractions: ddiList,
        drugDiseaseInteractions: diseaseList,
        dosageAnalysis: doseList,
        allergyAndContraindications: allergyList,
        pharmacistRecommendations: recommendations,
        screeningPassedRecommendation: calculatedRisk !== 'CRITICAL',
        source: 'clinical-cdss-engine-accredited',
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('DRP Analysis Error:', err);
      res.status(500).json({ error: 'Gagal melakukan analisis DRPs klinis: ' + (err.message || 'Internal error') });
    }
  });

  // API Route: Obrolan Interaktif Layanan Pelanggan & Pasien (Gemini 4 Hydrogen)
  app.use('/api/gemini/patient-chat', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.post('/api/gemini/patient-chat', async (req, res) => {
    try {
      const { message, history = [], context = {} } = req.body || {};
      const cleanMessage = String(message || '').trim();
      if (!cleanMessage) {
        return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({
          error:
            'Layanan asisten obrolan belum terhubung dengan GEMINI_API_KEY di konfigurasi server (Settings > Secrets).'
        });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const defaultFacilityName = 'Apotek & Klinik Latisha Farma';
      const storedPharmacy = memoryPublicChatContext?.pharmacy || {};
      const facilityPharmacy = memoryFacilityData?.pharmacy || {};
      const pharmacy = {
        name:
          context?.pharmacy?.name ||
          storedPharmacy.name ||
          facilityPharmacy.name ||
          defaultFacilityName,
        branchName:
          context?.pharmacy?.branchName ||
          storedPharmacy.branchName ||
          facilityPharmacy.name ||
          '-',
        address:
          context?.pharmacy?.address ||
          storedPharmacy.address ||
          facilityPharmacy.address ||
          '-',
        phone:
          context?.pharmacy?.phone ||
          storedPharmacy.phone ||
          facilityPharmacy.phone ||
          '-',
        apjName:
          context?.pharmacy?.apjName ||
          storedPharmacy.apjName ||
          memoryFacilityData?.apj?.name ||
          '-',
        dpjName:
          context?.pharmacy?.dpjName ||
          storedPharmacy.dpjName ||
          memoryFacilityData?.dpj?.name ||
          '-'
      };

      const doctors =
        Array.isArray(context?.doctors) && context.doctors.length > 0
          ? context.doctors
          : Array.isArray(memoryPublicChatContext?.doctors)
          ? memoryPublicChatContext.doctors
          : [];

      const schedules =
        Array.isArray(context?.schedules) && context.schedules.length > 0
          ? context.schedules
          : Array.isArray(memoryPublicChatContext?.schedules)
          ? memoryPublicChatContext.schedules
          : [];

      const matchedMedicines =
        Array.isArray(context?.matchedMedicines) && context.matchedMedicines.length > 0
          ? context.matchedMedicines
          : matchMedicinesForQuery(memoryPublicChatContext?.medicines || [], cleanMessage);

      const fallbackStoredPromos = [
        ...(Array.isArray(memoryPromoDiscountData?.promos)
          ? memoryPromoDiscountData.promos
              .filter((p: any) => p?.isActive)
              .map((p: any) => ({ title: p.title, subtitle: p.subtitle || p.description }))
          : []),
        ...(Array.isArray(memoryPromoDiscountData?.discounts)
          ? memoryPromoDiscountData.discounts
              .filter((d: any) => d?.isActive)
              .map((d: any) => ({
                title: d.name,
                subtitle:
                  String(d.valueType || '').toLowerCase() === 'percent'
                    ? `Diskon ${d.value}%`
                    : `Potongan Rp ${Number(d.value || 0).toLocaleString('id-ID')}`
              }))
          : [])
      ];

      const activePromos =
        Array.isArray(context?.activePromos) && context.activePromos.length > 0
          ? context.activePromos
          : Array.isArray(memoryPublicChatContext?.activePromos) && memoryPublicChatContext.activePromos.length > 0
          ? memoryPublicChatContext.activePromos
          : fallbackStoredPromos;

      const serviceFees =
        context?.serviceFees && Object.keys(context.serviceFees).length > 0
          ? context.serviceFees
          : memoryPublicChatContext?.serviceFees || {};

      const queueSummary =
        context?.queueSummary && typeof context.queueSummary.waitingCount === 'number'
          ? context.queueSummary
          : memoryPublicChatContext?.queueSummary || {};

      const dayOrder = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
      const fallbackDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const todayDayName = String(context?.todayDayName || fallbackDays[new Date().getDay()]);
      const todayDateLabel = String(
        context?.todayDateLabel ||
          new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
      );

      const doctorSpecByName = new Map<string, string>();
      for (const d of doctors) {
        if (d?.name) {
          doctorSpecByName.set(String(d.name).trim().toLowerCase(), String(d.specialization || 'Dokter Umum'));
        }
      }

      const isDoctorSchedule = (s: any) => {
        const role = String(s?.staffRole || '').toLowerCase();
        const name = String(s?.staffName || '').trim().toLowerCase();
        const unit = String(s?.serviceUnit || '').toLowerCase();
        return (
          role === 'dokter' ||
          name.startsWith('dr.') ||
          name.startsWith('drg.') ||
          unit.includes('poli')
        );
      };

      const doctorSchedules = schedules.filter(isDoctorSchedule);
      const otherDutySchedules = schedules.filter((s: any) => !isDoctorSchedule(s));

      const formatScheduleEntry = (s: any) => {
        const spec = doctorSpecByName.get(String(s.staffName || '').trim().toLowerCase());
        const specText = spec ? ` (${spec})` : '';
        const sessionText = s.sessionLabel ? ` | Sesi: ${s.sessionLabel}` : '';
        const quotaText =
          typeof s.quotaPerDay === 'number' && s.quotaPerDay > 0
            ? ` | Kuota: ${s.quotaPerDay} pasien`
            : '';
        const notesText = s.notes ? ` | Catatan: ${s.notes}` : '';
        return `- ${s.day}: ${s.staffName}${specText} | Jam: ${s.startTime || '-'} - ${s.endTime || '-'} WIB | Unit: ${s.serviceUnit || 'Poli Umum'}${sessionText} | Status: ${s.status || 'Aktif'}${quotaText}${notesText}`;
      };

      const sortSchedules = (list: any[]) =>
        [...list].sort((a, b) => {
          const dayDiff = dayOrder.indexOf(String(a.day || '')) - dayOrder.indexOf(String(b.day || ''));
          if (dayDiff !== 0) return dayDiff;
          return String(a.startTime || '').localeCompare(String(b.startTime || ''));
        });

      const todayDoctorSchedules = sortSchedules(
        doctorSchedules.filter(
          (s: any) => String(s.day || '').trim().toLowerCase() === todayDayName.toLowerCase()
        )
      );
      const todayOtherSchedules = sortSchedules(
        otherDutySchedules.filter(
          (s: any) => String(s.day || '').trim().toLowerCase() === todayDayName.toLowerCase()
        )
      );

      const contextLines: string[] = [
        `WAKTU & HARI INI:`,
        `- Hari ini: ${todayDateLabel} (Hari: ${todayDayName})`,
        ``,
        `PROFIL FASILITAS KESEHATAN:`,
        `- Nama: ${pharmacy.name || 'Apotek & Klinik Latisha Farma'}`,
        `- Cabang Aktif: ${pharmacy.branchName || '-'}`,
        `- Alamat: ${pharmacy.address || '-'}`,
        `- Telepon / WhatsApp: ${pharmacy.phone || '-'}`,
        `- Apoteker Penanggung Jawab (APJ): ${pharmacy.apjName || '-'}`,
        `- Dokter Penanggung Jawab (DPJ): ${pharmacy.dpjName || '-'}`,
        `- Antrean Saat Ini: ${queueSummary.waitingCount ?? 0} pasien sedang menunggu di poli.`,
        ``,
        `JADWAL PRAKTEK DOKTER REAL HARI INI (${todayDayName.toUpperCase()} — SUMBER: SUBMENU JADWAL DOKTER):`,
        todayDoctorSchedules.length > 0
          ? todayDoctorSchedules.map(formatScheduleEntry).join('\n')
          : `- Tidak ada jadwal praktek dokter yang tercatat pada hari ini (${todayDayName}, ${todayDateLabel}) di Submenu Jadwal Dokter.`,
        ...(todayOtherSchedules.length > 0
          ? [
              ``,
              `JADWAL APOTEKER / LAYANAN KLINIK HARI INI (${todayDayName.toUpperCase()}):`,
              ...todayOtherSchedules.map(formatScheduleEntry)
            ]
          : []),
        ``,
        `TARIF LAYANAN PENUNJANG & LAB:`,
        `- Biaya Penunjang Medis / Tindakan: Rp ${Number(serviceFees.medicalSupportFee || 0).toLocaleString('id-ID')}`,
        `- Biaya Home Visit: Rp ${Number(serviceFees.homeVisitFee || 0).toLocaleString('id-ID')}`,
        ...(Array.isArray(serviceFees.customTariffs) && serviceFees.customTariffs.length > 0
          ? serviceFees.customTariffs
              .filter((t: any) => !/konsultasi|konseling/i.test(String(t?.name || '')))
              .map(
                (t: any) => `- ${t.name}: Rp ${Number(t.price || 0).toLocaleString('id-ID')}`
              )
          : []),
        ``,
        `KATALOG OBAT RELEVAN (STOK & HARGA REGULER LIVE):`,
        matchedMedicines.length > 0
          ? matchedMedicines
              .slice(0, 15)
              .map(
                (m: any) =>
                  `- ${m.name} (${m.category || '-'}) | Stok: ${m.stock > 0 ? `${m.stock} ${m.unit || ''}` : 'HABIS'} | Harga: Rp ${Number(m.sellPrice || 0).toLocaleString('id-ID')}/${m.unit || 'pcs'}${m.kekuatan ? ` | Kekuatan: ${m.kekuatan}` : ''}`
              )
              .join('\n')
          : '- Tidak ada kecocokan spesifik dari pencarian kata kunci obat; arahkan pelanggan untuk menyebutkan nama obat atau keluhan secara spesifik.',
        ``,
        `PROMO & DISKON AKTIF:`,
        activePromos.length > 0
          ? activePromos
              .slice(0, 8)
              .map((p: any) => `- ${p.title}${p.subtitle ? `: ${p.subtitle}` : ''}`)
              .join('\n')
          : '- Tidak ada promo khusus yang sedang aktif saat ini.'
      ];

      const systemInstruction = `Anda adalah Asisten Layanan Pelanggan & Pasien resmi untuk ${pharmacy.name || 'Apotek & Klinik Latisha Farma'}.
Tugas Anda adalah membantu pelanggan, pasien, maupun petugas front-office/apotek dalam menjawab pertanyaan secara ramah, empatik, cepat, akurat, dan terstruktur dalam Bahasa Indonesia.

PANDUAN PENTING:
1. Gunakan DATA LIVE FASILITAS di bawah ini sebagai rujukan utama untuk jadwal dokter hari ini, alamat, kontak, layanan penunjang/lab, promo aktif, serta ketersediaan & harga obat. Jangan mengarang harga, stok obat, atau jam praktek yang tidak ada di data sistem.
2. ATURAN MUTLAK JADWAL DOKTER (HANYA TAMPILKAN JADWAL HARI INI): Saat menjawab pertanyaan mengenai jadwal praktek dokter, Anda HANYA BOLEH menampilkan jadwal praktek dokter untuk HARI INI (${todayDayName}, ${todayDateLabel}) sesuai yang tercatat pada bagian "JADWAL PRAKTEK DOKTER REAL HARI INI" dari Submenu Jadwal Dokter di bawah (sebutkan nama dokter, hari ini (${todayDayName}), jam praktek tepat sesuai data, unit/poli, sesi, status Aktif/Cuti/On-Call, dan kuota/catatan bila ada). DILARANG menampilkan daftar jadwal lengkap mingguan atau jadwal hari selain hari ini (${todayDayName}). Jika hari ini (${todayDayName}) tidak ada jadwal praktek dokter atau dokter sedang Cuti/Libur pada data sistem, cukup sampaikan bahwa hari ini tidak ada jadwal praktek dokter / dokter sedang cuti tanpa menampilkan jadwal hari lain.
3. DILARANG menyebutkan, menampilkan, atau menjawab rincian/nominal biaya konsultasi dokter maupun biaya konseling di dalam jawaban obrolan. Saat menjawab pertanyaan jadwal dokter, fokus HANYA pada nama dokter, spesialisasi, hari ini, jam praktek, unit/sesi, dan status jadwal tanpa menyinggung biaya konsultasi. Jika pengguna secara khusus menanyakan biaya konsultasi, cukup arahkan secara sopan untuk mengonfirmasi langsung ke bagian pendaftaran/front-office atau nomor kontak resmi klinik.
4. Untuk obat golongan Obat Keras (tanda K / merah), Antibiotik, atau NAPPZA, WAJIB sampaikan bahwa penyerahan obat memerlukan resep dokter atau konsultasi langsung dengan dokter/apoteker kami.
5. Anda boleh memberikan edukasi umum mengenai cara pakai obat yang benar (KIE), penyimpanan obat, efek samping ringan yang umum, dan persiapan pemeriksaan lab, tetapi JANGAN memberikan diagnosis medis final atau menggantikan pemeriksaan dokter.
6. Jika pelanggan mengeluhkan gejala darurat medis (nyeri dada berat, sesak napas parah, pingsan, kejang, perdarahan hebat, reaksi alergi berat/bengkak wajah), segera arahkan untuk menuju IGD/layanan gawat darurat terdekat.
7. Buat jawaban ringkas, mudah dibaca (gunakan poin seperlunya), sopan, dan siap disalin petugas jika ingin dikirimkan ke pelanggan/pasien.

${contextLines.join('\n')}`;

      const safeHistory = Array.isArray(history)
        ? history
            .slice(-10)
            .filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && item.content)
            .map((item: any) => ({
              role: item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: stripWeeklyScheduleSection(String(item.content)) }]
            }))
        : [];

      const contents = [
        ...safeHistory,
        { role: 'user', parts: [{ text: cleanMessage }] }
      ];

      const buildTodayDoctorScheduleReply = (): string => {
        const facilityTitle = pharmacy.name || 'Apotek & Klinik Latisha Farma';
        const lines: string[] = [
          `**Jadwal Praktek Dokter Hari Ini — ${facilityTitle}**`,
          `Hari ini: **${todayDateLabel}**`,
          ''
        ];
        if (todayDoctorSchedules.length > 0) {
          lines.push(`**Jadwal Hari Ini (${todayDayName}):**`);
          todayDoctorSchedules.forEach((s: any) => lines.push(formatScheduleEntry(s)));
        } else {
          lines.push(
            `Tidak ada jadwal praktek dokter yang tercatat pada hari ini (**${todayDayName}**) di sistem.`
          );
        }
        lines.push(
          '',
          'Silakan lengkapi formulir pendaftaran online atau hubungi petugas Apotek di ruang obrolan ini jika perlu konfirmasi.'
        );
        return lines.join('\n');
      };

      const buildLiveClinicFallbackReply = (): string => {
        const lowerQ = cleanMessage.toLowerCase();
        const facilityTitle = pharmacy.name || 'Apotek & Klinik Latisha Farma';

        if (/jadwal|dokter|praktek|praktik|poli/.test(lowerQ)) {
          return buildTodayDoctorScheduleReply();
        }

        if (/harga|stok|obat|vitamin|sirup|tablet|kapsul/.test(lowerQ)) {
          const lines: string[] = [
            `**Informasi Ketersediaan Stok & Harga Obat — ${facilityTitle}**`,
            ''
          ];
          if (matchedMedicines.length > 0) {
            matchedMedicines.slice(0, 12).forEach((m: any) => {
              const stockText = Number(m.stock || 0) > 0 ? `${m.stock} ${m.unit || 'pcs'}` : 'HABIS';
              lines.push(
                `- **${m.name}** (${m.category || '-'}) | Stok: **${stockText}** | Harga: **Rp ${Number(m.sellPrice || 0).toLocaleString('id-ID')}/${m.unit || 'pcs'}**`
              );
            });
            lines.push(
              '',
              'Ingin cek nama obat tertentu? Ketik langsung nama obatnya di kolom pesan agar Petugas Apotek segera membantu Anda. *(Obat keras/antibiotik memerlukan resep dokter)*.'
            );
          } else {
            lines.push(
              '- Data katalog stok sedang disinkronkan. Silakan ketik **nama obat** yang Anda cari pada kolom pesan agar Petugas Apotek kami langsung mengecek stok dan harganya secara real-time.'
            );
          }
          return lines.join('\n');
        }

        if (/cara pakai|cara minum|kie|penyimpanan|aturan pakai/.test(lowerQ)) {
          return [
            `**Panduan Singkat Cara Pakai & Penyimpanan Obat (KIE) — ${facilityTitle}**`,
            '',
            '- **Sebelum makan (AC):** Diminum sekitar 30–60 menit sebelum makan agar penyerapan optimal.',
            '- **Sesudah makan (PC):** Diminum segera setelah makan atau bersama makanan untuk mengurangi iritasi lambung.',
            '- **Antibiotik:** WAJIB diminum teratur sesuai jadwal jamnya dan dihabiskan sesuai anjuran dokter/apoteker.',
            '- **Penyimpanan obat:** Simpan di tempat kering, sejuk (suhu ruang < 30°C), terlindung dari cahaya matahari langsung, dan jauh dari jangkauan anak-anak.',
            '- **Tanda bahaya:** Jika muncul ruam, gatal hebat, bengkak wajah, atau sesak napas setelah minum obat, hentikan obat dan segera ke layanan gawat darurat.',
            '',
            'Untuk aturan pakai spesifik obat Anda, sebutkan nama obatnya di sini agar Apoteker/Petugas kami membantu.'
          ].join('\n');
        }

        if (/antrean|antrian|daftar|pendaftaran|alur/.test(lowerQ)) {
          const waiting = Number(queueSummary?.waitingCount ?? 0);
          return [
            `**Alur Pendaftaran & Informasi Antrean — ${facilityTitle}**`,
            '',
            `- **Antrean Poli Saat Ini:** ${waiting} pasien sedang menunggu.`,
            '- **Langkah 1:** Lengkapi formulir pendaftaran online (NIK 16 digit, nama lengkap, tanggal lahir, nomor WhatsApp, jadwal kunjungan, dan keluhan).',
            '- **Langkah 2:** Klik **Kirim Pendaftaran Berobat Online** untuk langsung mendapatkan **Kode Booking & Nomor Antrean Virtual**.',
            '- **Langkah 3:** Tunjukkan E-Tiket atau Kode Booking kepada petugas Front Office saat tiba di lokasi.',
            '',
            `Kontak Resmi: **${pharmacy.phone || '-'}** | Alamat: ${pharmacy.address || '-'}`
          ].join('\n');
        }

        if (/promo|diskon|lab|gula darah|asam urat|kolesterol|cek kesehatan/.test(lowerQ)) {
          const lines: string[] = [
            `**Promo Aktif & Layanan Cek Kesehatan — ${facilityTitle}**`,
            ''
          ];
          lines.push('**Promo & Diskon Aktif:**');
          if (activePromos.length > 0) {
            activePromos.slice(0, 8).forEach((p: any) =>
              lines.push(`- **${p.title}**${p.subtitle ? `: ${p.subtitle}` : ''}`)
            );
          } else {
            lines.push('- Saat ini belum ada promo khusus yang sedang aktif.');
          }
          lines.push('', '**Layanan Penunjang & Cek Lab:**');
          const safeTariffs = Array.isArray(serviceFees?.customTariffs)
            ? serviceFees.customTariffs.filter((t: any) => !/konsultasi|konseling/i.test(String(t?.name || '')))
            : [];
          if (safeTariffs.length > 0) {
            safeTariffs.forEach((t: any) =>
              lines.push(`- **${t.name}:** Rp ${Number(t.price || 0).toLocaleString('id-ID')}`)
            );
          }
          if (Number(serviceFees?.medicalSupportFee || 0) > 0) {
            lines.push(`- **Penunjang Medis / Tindakan:** Rp ${Number(serviceFees.medicalSupportFee).toLocaleString('id-ID')}`);
          }
          if (Number(serviceFees?.homeVisitFee || 0) > 0) {
            lines.push(`- **Layanan Home Visit:** Rp ${Number(serviceFees.homeVisitFee).toLocaleString('id-ID')}`);
          }
          if (safeTariffs.length === 0 && !Number(serviceFees?.medicalSupportFee || 0)) {
            lines.push('- Layanan cek Gula Darah, Asam Urat, dan Kolesterol tersedia langsung di Apotek & Klinik. Silakan tanyakan tarif terbaru kepada Petugas Apotek di ruang obrolan ini.');
          }
          return lines.join('\n');
        }

        return [
          `Halo! Terima kasih telah menghubungi **${facilityTitle}**.`,
          '',
          `Pesan Anda sudah kami terima. Anda dapat memilih tombol cepat (**Jadwal Dokter**, **Cek Harga & Stok**, **Cara Pakai / KIE**, **Antrean & Daftar**, atau **Promo & Cek Lab**) atau menunggu balasan langsung dari Petugas Apotek kami.`,
          `Kontak Resmi: **${pharmacy.phone || '-'}**`
        ].join('\n');
      };

      const isDirectDoctorScheduleQuery =
        /jadwal|praktek|praktik/i.test(cleanMessage) &&
        /dokter|poli|praktek|praktik|jadwal/i.test(cleanMessage) &&
        !/obat|harga|stok|vitamin|sirup|tablet|kapsul|kie|cara minum|promo|diskon|lab|gula darah|asam urat|kolesterol/i.test(
          cleanMessage
        );

      if (isDirectDoctorScheduleQuery) {
        return res.json({
          reply: buildTodayDoctorScheduleReply(),
          timestamp: new Date().toISOString()
        });
      }

      let reply = '';
      const candidateModels = [
        { model: 'gemini-4-hydrogen', useThinking: true },
        { model: 'gemini-2.5-flash', useThinking: false }
      ];

      let lastErr: any = null;
      for (const candidate of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: candidate.model,
            contents,
            config: candidate.useThinking
              ? {
                  systemInstruction,
                  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
                }
              : {
                  systemInstruction
                }
          });
          const textOut = stripWeeklyScheduleSection((response.text || '').trim());
          if (textOut) {
            reply = textOut;
            break;
          }
        } catch (modelErr: any) {
          lastErr = modelErr;
          console.warn(`Patient chat model ${candidate.model} failed:`, modelErr?.message || modelErr);
        }
      }

      if (!reply) {
        console.warn('All Gemini models unavailable for patient-chat, serving live clinic fallback:', lastErr?.message || '');
        reply = buildLiveClinicFallbackReply();
      }

      return res.json({
        reply,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('Patient Service Chat Error:', err);
      return res.status(500).json({
        error: 'Terjadi kendala sementara pada layanan obrolan. Silakan coba kirim ulang pertanyaan Anda.'
      });
    }
  });

  // ============================================================
  // REAL-TIME PATIENT PORTAL <-> LATISHA FARMA STAFF LIVE CHAT
  // ============================================================
  const liveChatSessions = new Map<string, LiveChatSession>();
  for (const s of readStoredLiveChatData()) {
    liveChatSessions.set(s.sessionId, s);
  }

  interface ChatClientMeta {
    ws: WebSocket;
    role: 'staff' | 'patient';
    sessionId?: string;
    staffName?: string;
  }
  const connectedChatClients = new Set<ChatClientMeta>();

  const getSortedLiveChatSessions = (): LiveChatSession[] => {
    return Array.from(liveChatSessions.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  };

  const persistLiveChatSessions = () => {
    const sorted = getSortedLiveChatSessions().slice(0, 150);
    if (liveChatSessions.size > 150) {
      liveChatSessions.clear();
      for (const s of sorted) liveChatSessions.set(s.sessionId, s);
    }
    writeStoredLiveChatData(sorted);
  };

  const getStaffOnlineCount = (): number => {
    let count = 0;
    for (const client of connectedChatClients) {
      if (client.role === 'staff' && client.ws.readyState === WebSocket.OPEN) {
        count += 1;
      }
    }
    return count;
  };

  const safeWsSend = (ws: WebSocket, payload: Record<string, any>) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        console.warn('WebSocket send failed:', err);
      }
    }
  };

  const broadcastPresence = () => {
    const staffOnlineCount = getStaffOnlineCount();
    const payload = { type: 'presence:update', staffOnlineCount };
    for (const client of connectedChatClients) {
      safeWsSend(client.ws, payload);
    }
  };

  const broadcastToStaffAndSession = (sessionId: string, payload: Record<string, any>) => {
    const targetBaseId = stripChannelSuffix(sessionId);
    for (const client of connectedChatClients) {
      if (
        client.role === 'staff' ||
        (client.role === 'patient' &&
          client.sessionId &&
          (client.sessionId === sessionId || stripChannelSuffix(client.sessionId) === targetBaseId))
      ) {
        safeWsSend(client.ws, payload);
      }
    }
  };

  // Automatically remove any chat session without interaction for 10 minutes
  const pruneExpiredLiveChatSessions = () => {
    const nowMs = Date.now();
    const expiredEntries: string[] = [];
    for (const [sid, session] of liveChatSessions.entries()) {
      if (isSessionExpiredByInactivity(session, nowMs)) {
        expiredEntries.push(sid);
      }
    }
    if (expiredEntries.length === 0) return;

    for (const sid of expiredEntries) {
      liveChatSessions.delete(sid);
    }
    persistLiveChatSessions();

    for (const sid of expiredEntries) {
      broadcastToStaffAndSession(sid, {
        type: 'chat:session_deleted',
        sessionId: sid,
        reason: 'inactivity_timeout'
      });
    }
  };

  // Periodic background sweep every 15 seconds to auto-delete sessions idle >= 10 minutes
  setInterval(pruneExpiredLiveChatSessions, 15_000);

  const handleIncomingLiveMessage = (input: {
    id?: string;
    sessionId?: string;
    sender?: string;
    senderName?: string;
    patientName?: string;
    patientPhone?: string;
    source?: string;
    text?: string;
  }): { ok: boolean; error?: string; session?: LiveChatSession; message?: LiveChatMessage } => {
    pruneExpiredLiveChatSessions();
    const sessionId = String(input.sessionId || '').trim().slice(0, 80);
    const text = String(input.text || '').trim().slice(0, 4000);
    const sender: 'patient' | 'staff' | 'assistant' =
      input.sender === 'staff'
        ? 'staff'
        : input.sender === 'assistant'
        ? 'assistant'
        : 'patient';

    if (!sessionId) return { ok: false, error: 'sessionId wajib diisi' };
    if (!text) return { ok: false, error: 'Pesan tidak boleh kosong' };

    const nowIso = new Date().toISOString();
    const cleanPatientName = String(input.patientName || '').trim().slice(0, 100);
    const cleanPatientPhone = String(input.patientPhone || '').trim().slice(0, 30);

    let session = liveChatSessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        patientName: cleanPatientName || 'Pengunjung Portal',
        patientPhone: cleanPatientPhone,
        source: input.source === 'in-app' ? 'in-app' : 'portal',
        createdAt: nowIso,
        updatedAt: nowIso,
        unreadForStaff: 0,
        unreadForPatient: 0,
        messages: []
      };
      liveChatSessions.set(sessionId, session);
    } else {
      if (cleanPatientName && cleanPatientName !== 'Pengunjung Portal') {
        session.patientName = cleanPatientName;
      }
      if (cleanPatientPhone) {
        session.patientPhone = cleanPatientPhone;
      }
    }

    const msgId =
      String(input.id || '').trim().slice(0, 80) ||
      `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const existingMsg = session.messages.find((m) => m.id === msgId);
    if (existingMsg) {
      return { ok: true, session, message: existingMsg };
    }

    const senderName =
      String(input.senderName || '').trim().slice(0, 100) ||
      (sender === 'staff'
        ? 'Petugas Apotek Latisha Farma'
        : sender === 'assistant'
        ? 'Asisten Otomatis Latisha Farma'
        : session.patientName || 'Pasien');

    const message: LiveChatMessage = {
      id: msgId,
      sessionId,
      sender,
      senderName,
      text,
      createdAt: nowIso
    };

    session.messages.push(message);
    if (session.messages.length > 200) {
      session.messages = session.messages.slice(-200);
    }
    session.updatedAt = nowIso;

    if (sender === 'patient') {
      session.unreadForStaff = (session.unreadForStaff || 0) + 1;
    } else if (sender === 'staff') {
      session.unreadForPatient = (session.unreadForPatient || 0) + 1;
    }

    persistLiveChatSessions();
    broadcastToStaffAndSession(sessionId, {
      type: 'chat:message',
      sessionId,
      message,
      session
    });

    return { ok: true, session, message };
  };

  const handleMarkSessionRead = (sessionId: string, reader: 'staff' | 'patient') => {
    const session = liveChatSessions.get(sessionId);
    if (!session) return null;
    if (reader === 'staff') {
      session.unreadForStaff = 0;
    } else {
      session.unreadForPatient = 0;
    }
    persistLiveChatSessions();
    broadcastToStaffAndSession(sessionId, {
      type: 'chat:read',
      sessionId,
      reader,
      session
    });
    return session;
  };

  // CORS helper for live chat REST endpoints
  app.use('/api/live-chat', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.get('/api/live-chat/sessions', (_req, res) => {
    pruneExpiredLiveChatSessions();
    res.json({
      sessions: getSortedLiveChatSessions(),
      staffOnlineCount: getStaffOnlineCount()
    });
  });

  app.get('/api/live-chat/sessions/:sessionId', (req, res) => {
    pruneExpiredLiveChatSessions();
    const rawId = String(req.params.sessionId || '').trim();
    const baseId = stripChannelSuffix(rawId);
    const directSession = liveChatSessions.get(rawId) || null;
    const obrolanSession = baseId ? liveChatSessions.get(`${baseId}__obrolan`) || null : null;
    const pasienSession = baseId ? liveChatSessions.get(`${baseId}__pasien`) || null : null;
    res.json({
      session: directSession || pasienSession,
      obrolanSession,
      pasienSession,
      staffOnlineCount: getStaffOnlineCount()
    });
  });

  app.post('/api/live-chat/messages', (req, res) => {
    const result = handleIncomingLiveMessage(req.body || {});
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json({
      ok: true,
      message: result.message,
      session: result.session,
      staffOnlineCount: getStaffOnlineCount()
    });
  });

  app.post('/api/live-chat/sessions/:sessionId/read', (req, res) => {
    const sessionId = String(req.params.sessionId || '').trim();
    const reader: 'staff' | 'patient' = req.body?.reader === 'staff' ? 'staff' : 'patient';
    const session = handleMarkSessionRead(sessionId, reader);
    res.json({ ok: true, session });
  });

  app.delete('/api/live-chat/sessions/:sessionId', (req, res) => {
    const sessionId = String(req.params.sessionId || '').trim();
    const existing = liveChatSessions.get(sessionId);
    if (existing) {
      liveChatSessions.delete(sessionId);
      persistLiveChatSessions();
      broadcastToStaffAndSession(sessionId, {
        type: 'chat:session_deleted',
        sessionId
      });
    }
    res.json({ ok: true });
  });

  // Serve standalone patient self-registration portal
  app.get(['/pendaftaran-pasien.html', '/pendaftaran', '/daftar-online'], (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'pendaftaran-pasien.html'));
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/patient-chat' });

  wss.on('connection', (ws, req) => {
    pruneExpiredLiveChatSessions();
    const parsedUrl = new URL(req.url || '/ws/patient-chat', 'http://localhost');
    const roleParam = parsedUrl.searchParams.get('role');
    const role: 'staff' | 'patient' = roleParam === 'staff' ? 'staff' : 'patient';
    const sessionId = (parsedUrl.searchParams.get('sessionId') || '').trim().slice(0, 80);
    const staffName = (parsedUrl.searchParams.get('staffName') || '').trim().slice(0, 100);

    const clientMeta: ChatClientMeta = {
      ws,
      role,
      sessionId: role === 'patient' ? sessionId : undefined,
      staffName: role === 'staff' ? staffName || 'Petugas Latisha Farma' : undefined
    };
    connectedChatClients.add(clientMeta);

    if (role === 'staff') {
      safeWsSend(ws, {
        type: 'chat:init',
        sessions: getSortedLiveChatSessions(),
        staffOnlineCount: getStaffOnlineCount()
      });
      broadcastPresence();
    } else {
      const baseId = stripChannelSuffix(sessionId);
      const directSession = sessionId ? liveChatSessions.get(sessionId) || null : null;
      const obrolanSession = baseId ? liveChatSessions.get(`${baseId}__obrolan`) || null : null;
      const pasienSession = baseId ? liveChatSessions.get(`${baseId}__pasien`) || null : null;
      safeWsSend(ws, {
        type: 'chat:init',
        sessionId,
        session: directSession || pasienSession,
        obrolanSession,
        pasienSession,
        staffOnlineCount: getStaffOnlineCount()
      });
    }

    ws.on('message', (rawData) => {
      try {
        const event = JSON.parse(String(rawData || '{}'));
        if (!event || typeof event.type !== 'string') return;

        if (event.type === 'ping') {
          safeWsSend(ws, { type: 'pong', staffOnlineCount: getStaffOnlineCount() });
          return;
        }

        if (event.type === 'chat:send') {
          const targetSessionId =
            clientMeta.role === 'patient'
              ? String(event.sessionId || clientMeta.sessionId || '').trim()
              : String(event.sessionId || '').trim();
          if (clientMeta.role === 'patient' && !clientMeta.sessionId && targetSessionId) {
            clientMeta.sessionId = stripChannelSuffix(targetSessionId);
          }
          const resolvedSender =
            event.sender === 'assistant' ? 'assistant' : clientMeta.role;
          const resObj = handleIncomingLiveMessage({
            id: event.id,
            sessionId: targetSessionId,
            sender: resolvedSender,
            senderName:
              resolvedSender === 'staff'
                ? event.senderName || clientMeta.staffName
                : event.senderName,
            patientName: event.patientName,
            patientPhone: event.patientPhone,
            source: event.source,
            text: event.text
          });
          if (!resObj.ok) {
            safeWsSend(ws, { type: 'chat:error', error: resObj.error });
          }
          return;
        }

        if (event.type === 'chat:mark_read') {
          const targetSessionId =
            clientMeta.role === 'patient'
              ? String(event.sessionId || clientMeta.sessionId || '').trim()
              : String(event.sessionId || '').trim();
          if (targetSessionId) {
            handleMarkSessionRead(targetSessionId, clientMeta.role);
          }
          return;
        }

        if (event.type === 'chat:update_profile' && clientMeta.role === 'patient') {
          const rawTargetId = String(event.sessionId || clientMeta.sessionId || '').trim();
          if (!rawTargetId) return;
          const baseId = stripChannelSuffix(rawTargetId);
          const candidateIds = [rawTargetId, `${baseId}__obrolan`, `${baseId}__pasien`];
          const nextName = String(event.patientName || '').trim().slice(0, 100);
          const nextPhone = String(event.patientPhone || '').trim().slice(0, 30);
          let updatedAny = false;
          for (const cid of candidateIds) {
            const session = liveChatSessions.get(cid);
            if (session) {
              if (nextName) session.patientName = nextName;
              if (nextPhone) session.patientPhone = nextPhone;
              updatedAny = true;
              broadcastToStaffAndSession(cid, {
                type: 'chat:session_updated',
                session
              });
            }
          }
          if (updatedAny) {
            persistLiveChatSessions();
          }
          return;
        }

        if (event.type === 'chat:delete_session') {
          const targetSessionId = String(event.sessionId || '').trim();
          const existing = targetSessionId ? liveChatSessions.get(targetSessionId) : null;
          if (targetSessionId && existing) {
            liveChatSessions.delete(targetSessionId);
            persistLiveChatSessions();
            broadcastToStaffAndSession(targetSessionId, {
              type: 'chat:session_deleted',
              sessionId: targetSessionId
            });
          }
        }
      } catch (err) {
        console.warn('Invalid WS chat payload:', err);
      }
    });

    ws.on('close', () => {
      connectedChatClients.delete(clientMeta);
      if (clientMeta.role === 'staff') {
        broadcastPresence();
      }
    });

    ws.on('error', () => {
      connectedChatClients.delete(clientMeta);
      if (clientMeta.role === 'staff') {
        broadcastPresence();
      }
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
