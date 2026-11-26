import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  Search,
  Copy,
  Check,
  RotateCcw,
  Loader2,
  Stethoscope,
  Pill,
  Clock,
  Tag,
  ClipboardList,
  Phone,
  AlertCircle,
  ChevronRight,
  Minimize2,
  ExternalLink,
  Users,
  ArrowLeft,
  Trash2,
  Wifi,
  WifiOff
} from 'lucide-react';
import {
  Branch,
  Doctor,
  DutySchedule,
  FeeConfig,
  Medicine,
  PromoAd,
  PatientQueue,
  SalesDiscount
} from '../types';
import { formatPharmacyAddress, useFacilityProfiles } from './PharmacySettingsModal';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isError?: boolean;
}

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

interface PatientServiceChatWidgetProps {
  currentBranch: Branch;
  medicines: Medicine[];
  doctors: Doctor[];
  schedules: DutySchedule[];
  feeConfig: FeeConfig;
  promoAds: PromoAd[];
  salesDiscounts: SalesDiscount[];
  queue: PatientQueue[];
  staffName?: string;
  onNavigateTab?: (tabId: string) => void;
  onOpenPatientPortal?: () => void;
}

const PATIENT_REGISTRATION_PORTAL_URL = '/pendaftaran-pasien.html';
const LIVE_CHAT_BC_NAME = 'latisha_live_chat_sync_v1';
const STAFF_QUICK_REPLIES = [
  'Halo, dengan petugas Apotek Latisha Farma. Ada yang bisa kami bantu?',
  'Silakan lengkapi formulir pendaftaran online, data Anda langsung masuk ke sistem kami.',
  'Terima kasih, pendaftaran Anda sudah kami terima dan segera diproses.'
];

const CHAT_STORAGE_KEY = 'latisha_patient_service_chat_v3';
const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

const QUICK_PROMPTS = [
  {
    label: 'Jadwal Dokter',
    icon: Stethoscope,
    prompt: 'Halo, kapan jadwal praktek dokter hari ini?'
  },
  {
    label: 'Cek Harga & Stok',
    icon: Pill,
    prompt: 'Bantu saya cek ketersediaan stok dan harga obat yang tersedia di apotek.'
  },
  {
    label: 'Cara Pakai / KIE',
    icon: ClipboardList,
    prompt: 'Berikan panduan singkat cara minum obat yang benar (sebelum/sesudah makan dan penyimpanan obat).'
  },
  {
    label: 'Antrean & Daftar',
    icon: Clock,
    prompt: 'Bagaimana alur pendaftaran pasien baru dan berapa antrean yang sedang menunggu saat ini?'
  },
  {
    label: 'Promo & Cek Lab',
    icon: Tag,
    prompt: 'Apa saja promo aktif dan biaya layanan cek kesehatan (gula darah, asam urat, kolesterol)?'
  }
];

const GENERAL_SESSION_STORAGE_KEY = 'latisha_portal_live_chat_session_id_v1';
const GENERAL_PROFILE_STORAGE_KEY = 'latisha_portal_live_chat_profile_v1';

function getOrCreateGeneralSessionId(): string {
  try {
    const existing = localStorage.getItem(GENERAL_SESSION_STORAGE_KEY);
    if (existing && existing.trim().length >= 8) {
      const cleanBase = existing.trim().replace(/__(obrolan|pasien)$/, '');
      return `${cleanBase}__obrolan`;
    }
    const created = `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(GENERAL_SESSION_STORAGE_KEY, created);
    return `${created}__obrolan`;
  } catch {
    return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}__obrolan`;
  }
}

function readGeneralCustomerProfile(): { name: string; phone: string } {
  try {
    const raw = localStorage.getItem(GENERAL_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const name = String(parsed?.name || '').trim();
      const phone = String(parsed?.phone || '').trim();
      if (name) return { name, phone };
    }
  } catch {}
  return { name: 'Pelanggan / Pasien', phone: '' };
}

function stripWeeklyScheduleSection(text: string): string {
  if (!text || (!text.includes('Jadwal Lengkap Mingguan') && !text.includes('Daftar Dokter Terdaftar'))) {
    return text;
  }
  return text
    .replace(/\n+\*\*Jadwal Lengkap Mingguan:\*\*[\s\S]*?(?=\n+Silakan lengkapi formulir|\n+Hubungi petugas|$)/g, '')
    .replace(/\n+\*\*Daftar Dokter Terdaftar:\*\*[\s\S]*?(?=\n+Silakan lengkapi formulir|\n+Hubungi petugas|$)/g, '');
}

function createWelcomeMessage(pharmacyName: string): ChatMessage {
  return {
    id: 'welcome-msg',
    role: 'assistant',
    content: `Halo! Selamat datang di **Layanan Pelanggan & Pasien ${pharmacyName}**.\n\nSaya siap membantu menjawab pertanyaan seputar:\n- Ketersediaan stok & harga obat\n- Jadwal praktek dokter hari ini & biaya layanan lab\n- Informasi aturan pakai obat (KIE) & promo aktif\n- Informasi pendaftaran & antrean klinik\n\nSilakan ketik pertanyaan Anda atau pilih topik cepat di bawah.`,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  };
}

function renderFormattedText(text: string): React.ReactNode {
  const cleanedText = stripWeeklyScheduleSection(text);
  const lines = cleanedText.split('\n');
  return lines.map((line, lineIdx) => {
    const trimmed = line.trim();
    const isBullet = /^[-*•]\s+/.test(trimmed);
    const contentLine = isBullet ? trimmed.replace(/^[-*•]\s+/, '') : line;

    const parts = contentLine.split(/(\*\*[^*]+\*\*)/g).map((segment, segIdx) => {
      if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
        return (
          <strong key={segIdx} className="font-extrabold text-slate-900">
            {segment.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={segIdx}>{segment}</React.Fragment>;
    });

    if (isBullet) {
      return (
        <div key={lineIdx} className="flex items-start gap-1.5 pl-1 my-0.5">
          <span className="text-emerald-600 font-black leading-5">•</span>
          <span className="flex-1">{parts}</span>
        </div>
      );
    }

    if (!trimmed) {
      return <div key={lineIdx} className="h-1.5" />;
    }

    return (
      <p key={lineIdx} className="leading-relaxed">
        {parts}
      </p>
    );
  });
}

export const PatientServiceChatWidget: React.FC<PatientServiceChatWidgetProps> = React.memo(
  ({
    currentBranch,
    medicines,
    doctors,
    schedules,
    feeConfig,
    promoAds,
    salesDiscounts,
    queue,
    staffName
  }) => {
    const { pharmacyProfile, apjProfile, dpjProfile } = useFacilityProfiles();
    const pharmacyName = pharmacyProfile?.name || currentBranch?.name || 'Apotek & Klinik Latisha Farma';
    const pharmacyAddress = formatPharmacyAddress(pharmacyProfile) || currentBranch?.address || '-';
    const pharmacyPhone = pharmacyProfile?.phone || currentBranch?.phone || '-';
    const resolvedStaffName = (staffName || '').trim() || 'Petugas Latisha Farma';

    const [isOpen, setIsOpen] = useState(false);
    const [activeMode, setActiveMode] = useState<'chat' | 'live' | 'catalog'>('chat');
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [copiedPhone, setCopiedPhone] = useState(false);
    const [catalogQuery, setCatalogQuery] = useState('');
    const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

    // Real-time staff <-> patient portal live chat state (separated into Obrolan & Pasien channels)
    const [liveSessions, setLiveSessions] = useState<LiveChatSession[]>([]);
    const [selectedObrolanSessionId, setSelectedObrolanSessionId] = useState<string | null>(null);
    const [selectedLiveSessionId, setSelectedLiveSessionId] = useState<string | null>(null);
    const [liveInputText, setLiveInputText] = useState('');
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isSendingLive, setIsSendingLive] = useState(false);

    const [messages, setMessages] = useState<ChatMessage[]>(() => {
      try {
        const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
      return [createWelcomeMessage(pharmacyName)];
    });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const liveMessagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const liveInputRef = useRef<HTMLInputElement>(null);
    const isOpenRef = useRef(isOpen);
    const activeModeRef = useRef(activeMode);
    const selectedObrolanSessionIdRef = useRef(selectedObrolanSessionId);
    const selectedLiveSessionIdRef = useRef(selectedLiveSessionId);
    const staffWsRef = useRef<WebSocket | null>(null);
    const staffReconnectTimerRef = useRef<number | null>(null);
    const staffHeartbeatTimerRef = useRef<number | null>(null);
    const staffReconnectAttemptRef = useRef(0);

    isOpenRef.current = isOpen;
    activeModeRef.current = activeMode;
    selectedObrolanSessionIdRef.current = selectedObrolanSessionId;
    selectedLiveSessionIdRef.current = selectedLiveSessionId;

    // Isolated session lists:
    // - obrolanSessions: ONLY sessions from Tab Obrolan (__obrolan)
    // - pasienSessions:  ONLY sessions from Tab Pasien (__pasien)
    const obrolanSessions = useMemo(
      () => liveSessions.filter((s) => s.sessionId.endsWith('__obrolan')),
      [liveSessions]
    );

    const pasienSessions = useMemo(
      () => liveSessions.filter((s) => s.sessionId.endsWith('__pasien')),
      [liveSessions]
    );

    const totalObrolanUnread = useMemo(
      () => obrolanSessions.reduce((sum, s) => sum + (s.unreadForStaff || 0), 0),
      [obrolanSessions]
    );

    const totalLiveUnread = useMemo(
      () => pasienSessions.reduce((sum, s) => sum + (s.unreadForStaff || 0), 0),
      [pasienSessions]
    );

    const selectedLiveSession = useMemo(
      () => pasienSessions.find((s) => s.sessionId === selectedLiveSessionId) || null,
      [pasienSessions, selectedLiveSessionId]
    );

    const activeGeneralSession = useMemo(
      () =>
        obrolanSessions.find((s) => s.sessionId === selectedObrolanSessionId) ||
        (obrolanSessions.length > 0 ? obrolanSessions[0] : null),
      [obrolanSessions, selectedObrolanSessionId]
    );

    const upsertLiveSession = useCallback((incomingSession: LiveChatSession) => {
      setLiveSessions((prev) => {
        const filtered = prev.filter((s) => s.sessionId !== incomingSession.sessionId);
        return [incomingSession, ...filtered].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    }, []);

    const markLiveSessionRead = useCallback((sessionId: string) => {
      setLiveSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, unreadForStaff: 0 } : s))
      );
      if (staffWsRef.current && staffWsRef.current.readyState === WebSocket.OPEN) {
        staffWsRef.current.send(
          JSON.stringify({
            type: 'chat:mark_read',
            sessionId
          })
        );
      } else {
        fetch(`/api/live-chat/sessions/${encodeURIComponent(sessionId)}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reader: 'staff' })
        }).catch(() => {});
      }
    }, []);

    // Connect staff WebSocket + periodic polling to receive real-time patient messages
    useEffect(() => {
      let isDisposed = false;
      let bc: BroadcastChannel | null = null;
      const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit tanpa interaksi

      const applySessionList = (rawSessions: LiveChatSession[]) => {
        const nowMs = Date.now();
        const activeList = rawSessions.filter((s) => {
          const lastMsg =
            Array.isArray(s.messages) && s.messages.length > 0
              ? s.messages[s.messages.length - 1]
              : null;
          const lastIso = lastMsg?.createdAt || s.updatedAt || s.createdAt;
          const lastTime = lastIso ? new Date(lastIso).getTime() : NaN;
          return !Number.isFinite(lastTime) || nowMs - lastTime < INACTIVITY_TIMEOUT_MS;
        });

        setLiveSessions(activeList);

        const obrolanList = activeList.filter((s) => s.sessionId.endsWith('__obrolan'));
        const pasienList = activeList.filter((s) => s.sessionId.endsWith('__pasien'));

        const currentObrolanId = selectedObrolanSessionIdRef.current;
        if (!currentObrolanId || !obrolanList.some((s) => s.sessionId === currentObrolanId)) {
          setSelectedObrolanSessionId(obrolanList[0]?.sessionId || null);
        }

        const currentPasienId = selectedLiveSessionIdRef.current;
        if (currentPasienId && !pasienList.some((s) => s.sessionId === currentPasienId)) {
          setSelectedLiveSessionId(null);
        } else if (!currentPasienId && pasienList.length > 0) {
          setSelectedLiveSessionId(pasienList[0].sessionId);
        }
      };

      const hydrateSessions = async () => {
        try {
          const res = await fetch('/api/live-chat/sessions');
          if (!res.ok) return;
          const data = await res.json();
          if (!isDisposed && Array.isArray(data?.sessions)) {
            applySessionList(data.sessions);
          }
        } catch {}
      };

      hydrateSessions();
      const pollTimer = window.setInterval(hydrateSessions, 3500);

      // Instant same-browser cross-tab fallback sync
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          bc = new BroadcastChannel(LIVE_CHAT_BC_NAME);
          bc.onmessage = (evt) => {
            if (isDisposed) return;
            if (evt.data?.type === 'chat:message' || evt.data?.type === 'chat:session_deleted') {
              hydrateSessions();
            }
          };
        } catch {}
      }

      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          hydrateSessions();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);

      const connectStaffWs = () => {
        if (isDisposed) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/patient-chat?role=staff&staffName=${encodeURIComponent(
          resolvedStaffName
        )}`;

        try {
          const ws = new WebSocket(wsUrl);
          staffWsRef.current = ws;

          ws.onopen = () => {
            if (isDisposed) return;
            staffReconnectAttemptRef.current = 0;
            setIsLiveConnected(true);
            if (staffHeartbeatTimerRef.current) clearInterval(staffHeartbeatTimerRef.current);
            staffHeartbeatTimerRef.current = window.setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
              }
            }, 25000);
          };

          ws.onmessage = (event) => {
            if (isDisposed) return;
            try {
              const payload = JSON.parse(event.data);
              if (!payload || typeof payload.type !== 'string') return;

              if (payload.type === 'chat:init' && Array.isArray(payload.sessions)) {
                applySessionList(payload.sessions);
              } else if (payload.type === 'chat:message' && payload.session) {
                const updatedSession: LiveChatSession = payload.session;
                const isObrolanChannel = updatedSession.sessionId.endsWith('__obrolan');
                const isPasienChannel = updatedSession.sessionId.endsWith('__pasien');

                if (payload.message?.sender === 'patient') {
                  if (isObrolanChannel) {
                    setSelectedObrolanSessionId(updatedSession.sessionId);
                  } else if (isPasienChannel) {
                    setSelectedLiveSessionId(updatedSession.sessionId);
                  }
                }

                const isViewingThis =
                  isOpenRef.current &&
                  ((isObrolanChannel &&
                    activeModeRef.current === 'chat' &&
                    (!selectedObrolanSessionIdRef.current ||
                      selectedObrolanSessionIdRef.current === updatedSession.sessionId)) ||
                    (isPasienChannel &&
                      activeModeRef.current === 'live' &&
                      selectedLiveSessionIdRef.current === updatedSession.sessionId));

                if (isViewingThis && payload.message?.sender === 'patient') {
                  upsertLiveSession({ ...updatedSession, unreadForStaff: 0 });
                  ws.send(
                    JSON.stringify({
                      type: 'chat:mark_read',
                      sessionId: updatedSession.sessionId
                    })
                  );
                } else {
                  upsertLiveSession(updatedSession);
                }
              } else if (
                (payload.type === 'chat:read' || payload.type === 'chat:session_updated') &&
                payload.session
              ) {
                upsertLiveSession(payload.session);
              } else if (payload.type === 'chat:session_deleted' && payload.sessionId) {
                setLiveSessions((prev) => prev.filter((s) => s.sessionId !== payload.sessionId));
                setSelectedObrolanSessionId((prev) => (prev === payload.sessionId ? null : prev));
                setSelectedLiveSessionId((prev) => (prev === payload.sessionId ? null : prev));
              }
            } catch {}
          };

          ws.onclose = () => {
            if (isDisposed) return;
            setIsLiveConnected(false);
            if (staffHeartbeatTimerRef.current) {
              clearInterval(staffHeartbeatTimerRef.current);
              staffHeartbeatTimerRef.current = null;
            }
            const delay = Math.min(10000, 1500 * Math.pow(1.6, staffReconnectAttemptRef.current));
            staffReconnectAttemptRef.current += 1;
            staffReconnectTimerRef.current = window.setTimeout(connectStaffWs, delay);
          };

          ws.onerror = () => {
            try {
              ws.close();
            } catch {}
          };
        } catch {
          setIsLiveConnected(false);
        }
      };

      connectStaffWs();

      return () => {
        isDisposed = true;
        clearInterval(pollTimer);
        document.removeEventListener('visibilitychange', handleVisibility);
        if (bc) bc.close();
        if (staffHeartbeatTimerRef.current) clearInterval(staffHeartbeatTimerRef.current);
        if (staffReconnectTimerRef.current) clearTimeout(staffReconnectTimerRef.current);
        if (staffWsRef.current) staffWsRef.current.close();
      };
    }, [resolvedStaffName, upsertLiveSession]);

    const handleSendLiveReply = useCallback(
      async (customText?: string) => {
        if (!selectedLiveSessionId) return;
        const text = (typeof customText === 'string' ? customText : liveInputText).trim();
        if (!text || isSendingLive) return;

        const msgId = `stfmsg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setLiveInputText('');
        setIsSendingLive(true);

        const packet = {
          type: 'chat:send',
          id: msgId,
          sessionId: selectedLiveSessionId,
          sender: 'staff',
          senderName: resolvedStaffName,
          text
        };

        try {
          if (staffWsRef.current && staffWsRef.current.readyState === WebSocket.OPEN) {
            staffWsRef.current.send(JSON.stringify(packet));
          } else {
            const res = await fetch('/api/live-chat/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(packet)
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.session) upsertLiveSession(data.session);
            }
          }
          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            try {
              const bc = new BroadcastChannel(LIVE_CHAT_BC_NAME);
              bc.postMessage({
                type: 'chat:message',
                sessionId: selectedLiveSessionId,
                message: {
                  id: msgId,
                  sessionId: selectedLiveSessionId,
                  sender: 'staff',
                  senderName: resolvedStaffName,
                  text,
                  createdAt: new Date().toISOString()
                }
              });
              bc.close();
            } catch {}
          }
        } catch (err) {
          console.warn('Staff live reply failed:', err);
        } finally {
          setIsSendingLive(false);
        }
      },
      [selectedLiveSessionId, liveInputText, isSendingLive, resolvedStaffName, upsertLiveSession]
    );

    const handleDeleteLiveSession = useCallback((sessionId: string) => {
      if (staffWsRef.current && staffWsRef.current.readyState === WebSocket.OPEN) {
        staffWsRef.current.send(
          JSON.stringify({
            type: 'chat:delete_session',
            sessionId
          })
        );
      } else {
        fetch(`/api/live-chat/sessions/${encodeURIComponent(sessionId)}`, {
          method: 'DELETE'
        }).catch(() => {});
      }
      setLiveSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      setSelectedObrolanSessionId((prev) => (prev === sessionId ? null : prev));
      setSelectedLiveSessionId((prev) => (prev === sessionId ? null : prev));
    }, []);

    useEffect(() => {
      try {
        sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
      } catch {}
    }, [messages]);

    useEffect(() => {
      if (isOpen && activeMode === 'chat') {
        setUnreadCount(0);
        if (activeGeneralSession && activeGeneralSession.unreadForStaff > 0) {
          markLiveSessionRead(activeGeneralSession.sessionId);
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => inputRef.current?.focus(), 120);
      }
    }, [
      isOpen,
      activeMode,
      messages.length,
      activeGeneralSession?.sessionId,
      activeGeneralSession?.messages.length,
      activeGeneralSession?.unreadForStaff,
      markLiveSessionRead
    ]);

    useEffect(() => {
      if (isOpen && activeMode === 'live' && selectedLiveSessionId) {
        markLiveSessionRead(selectedLiveSessionId);
        liveMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => liveInputRef.current?.focus(), 120);
      }
    }, [isOpen, activeMode, selectedLiveSessionId, selectedLiveSession?.messages.length, markLiveSessionRead]);

    useEffect(() => {
      const handleExternalChatTrigger = (ev: Event) => {
        const detail = (ev as CustomEvent<{ mode?: 'chat' | 'live' | 'catalog'; draft?: string }>).detail;
        setIsOpen(true);
        const targetMode = detail?.mode || 'live';
        setActiveMode(targetMode);
        if (detail?.draft) {
          if (targetMode === 'live') {
            setLiveInputText(detail.draft);
          } else {
            setInputText(detail.draft);
          }
        }
      };
      window.addEventListener('latisha_open_live_chat', handleExternalChatTrigger);
      return () => {
        window.removeEventListener('latisha_open_live_chat', handleExternalChatTrigger);
      };
    }, []);

    const waitingQueueCount = useMemo(
      () => queue.filter((q) => q.status === 'Menunggu' || q.status === 'Diperiksa').length,
      [queue]
    );

    const activePromosSummary = useMemo(() => {
      const list: Array<{ title: string; subtitle?: string }> = [];
      promoAds
        .filter((p) => p.isActive)
        .forEach((p) => list.push({ title: p.title, subtitle: p.subtitle || p.description }));
      salesDiscounts
        .filter((d) => d.isActive)
        .forEach((d) =>
          list.push({
            title: d.name,
            subtitle:
              String(d.valueType || '').toLowerCase() === 'percent'
                ? `Diskon ${d.value}%`
                : `Potongan Rp ${Number(d.value || 0).toLocaleString('id-ID')}`
          })
        );
      return list;
    }, [promoAds, salesDiscounts]);

    // Keep server public chat context synchronized with live clinic schedules, medicine catalog, promos, lab fees, and queue
    // so patient portal quick-topic buttons (Jadwal Dokter, Cek Harga & Stok, etc.) auto-answer with real live data.
    useEffect(() => {
      const timer = window.setTimeout(() => {
        fetch('/api/public-chat-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pharmacy: {
              name: pharmacyName,
              branchName: currentBranch?.name || '-',
              address: pharmacyAddress,
              phone: pharmacyPhone,
              apjName: apjProfile?.name || '-',
              dpjName: dpjProfile?.name || '-'
            },
            doctors: doctors.map((d) => ({
              id: d.id,
              name: d.name,
              specialization: d.specialization,
              schedule: d.schedule
            })),
            schedules: (schedules || []).map((s) => ({
              id: s.id,
              staffId: s.staffId,
              staffName: s.staffName,
              staffRole: s.staffRole,
              day: s.day,
              startTime: s.startTime,
              endTime: s.endTime,
              serviceUnit: s.serviceUnit,
              sessionLabel: s.sessionLabel,
              quotaPerDay: s.quotaPerDay,
              status: s.status,
              notes: s.notes || ''
            })),
            medicines: medicines.slice(0, 1500).map((m) => ({
              name: m.name,
              category: m.category,
              kelas: m.kelas || '',
              kekuatan: m.kekuatan || '',
              stock: m.stock,
              unit: m.unit || m.satuanKecil || 'pcs',
              sellPrice: m.sellPrice
            })),
            activePromos: activePromosSummary,
            serviceFees: {
              medicalSupportFee: feeConfig?.medicalSupportFee || 0,
              homeVisitFee: feeConfig?.homeVisitFee || 0,
              customTariffs: (feeConfig?.customTariffs || [])
                .filter((t) => !/konsultasi|konseling/i.test(String(t.name || '')))
                .slice(0, 12)
                .map((t) => ({ name: t.name, price: t.price }))
            },
            queueSummary: {
              waitingCount: waitingQueueCount
            }
          })
        }).catch(() => {});
      }, 500);
      return () => clearTimeout(timer);
    }, [
      pharmacyName,
      currentBranch?.name,
      pharmacyAddress,
      pharmacyPhone,
      apjProfile?.name,
      dpjProfile?.name,
      doctors,
      schedules,
      medicines,
      activePromosSummary,
      feeConfig,
      waitingQueueCount
    ]);

    const catalogResults = useMemo(() => {
      if (!isOpen || activeMode !== 'catalog') return [];
      const q = catalogQuery.trim().toLowerCase();
      if (!q) {
        return medicines.filter((m) => m.stock > 0).slice(0, 18);
      }
      const tokens = q.split(/\s+/).filter(Boolean);
      return medicines
        .filter((m) => {
          const haystack = `${m.name} ${m.category} ${m.kelas || ''} ${m.kekuatan || ''}`.toLowerCase();
          return tokens.every((tk) => haystack.includes(tk));
        })
        .slice(0, 25);
    }, [isOpen, activeMode, catalogQuery, medicines]);

    const findRelevantMedicinesForPrompt = useCallback(
      (queryText: string) => {
        const stopWords = new Set([
          'halo',
          'hai',
          'obat',
          'harga',
          'stok',
          'ada',
          'tidak',
          'untuk',
          'yang',
          'berapa',
          'apakah',
          'bisa',
          'tolong',
          'cek',
          'info',
          'cara',
          'pakai',
          'minum',
          'dan',
          'atau',
          'di',
          'ke',
          'dari',
          'saya',
          'kami',
          'apotek',
          'klinik',
          'pasien',
          'dokter'
        ]);
        const tokens = queryText
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !stopWords.has(w));

        if (tokens.length === 0) {
          return medicines
            .filter((m) => m.stock > 0)
            .slice(0, 10)
            .map((m) => ({
              name: m.name,
              category: m.category,
              stock: m.stock,
              unit: m.unit || m.satuanKecil || 'pcs',
              sellPrice: m.sellPrice,
              kekuatan: m.kekuatan || ''
            }));
        }

        const scored: Array<{ score: number; med: Medicine }> = [];
        for (const m of medicines) {
          const hay = `${m.name} ${m.category} ${m.kelas || ''} ${m.kekuatan || ''}`.toLowerCase();
          let score = 0;
          for (const tk of tokens) {
            if (hay.includes(tk)) score += 1;
          }
          if (score > 0) {
            scored.push({ score, med: m });
          }
        }
        scored.sort((a, b) => b.score - a.score || b.med.stock - a.med.stock);
        const top = scored.slice(0, 15).map((item) => item.med);
        const fallback = top.length > 0 ? top : medicines.filter((m) => m.stock > 0).slice(0, 8);
        return fallback.map((m) => ({
          name: m.name,
          category: m.category,
          stock: m.stock,
          unit: m.unit || m.satuanKecil || 'pcs',
          sellPrice: m.sellPrice,
          kekuatan: m.kekuatan || ''
        }));
      },
      [medicines]
    );

    const dispatchGeneralRoomPacket = useCallback(
      async (packet: {
        id: string;
        sessionId: string;
        sender: 'patient' | 'assistant' | 'staff';
        senderName: string;
        patientName: string;
        patientPhone: string;
        text: string;
      }) => {
        const fullPacket = {
          type: 'chat:send',
          ...packet,
          source: 'in-app'
        };

        try {
          const res = await fetch('/api/live-chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullPacket)
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.session) {
              upsertLiveSession(data.session);
              setSelectedObrolanSessionId(data.session.sessionId);
            }
          }
          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            try {
              const bc = new BroadcastChannel(LIVE_CHAT_BC_NAME);
              bc.postMessage({
                type: 'chat:message',
                sessionId: packet.sessionId,
                message: {
                  id: packet.id,
                  sessionId: packet.sessionId,
                  sender: packet.sender,
                  senderName: packet.senderName,
                  text: packet.text,
                  createdAt: new Date().toISOString()
                }
              });
              bc.close();
            } catch {}
          }
        } catch (err) {
          console.warn('General room message dispatch failed:', err);
        }
      },
      [upsertLiveSession]
    );

    // Kamar Obrolan Umum (Tab Obrolan Petugas):
    // - Strictly uses __obrolan session IDs (never touches Tab Pasien __pasien sessions).
    // - If customText is passed (Quick Chat Option button or Tanya Obat), auto-answer via system.
    // - If typed manually in input box (no customText), sends staff reply (if replying to an active customer session in Tab Obrolan) or general message in Tab Obrolan.
    const handleSendMessage = useCallback(
      async (customText?: string, forceAsStaffReply?: boolean) => {
        const isQuickTopicOption =
          !forceAsStaffReply && typeof customText === 'string' && customText.trim().length > 0;
        const text = (typeof customText === 'string' ? customText : inputText).trim();
        if (!text || isSending) return;

        setActiveMode('chat');
        if (!isQuickTopicOption) {
          setInputText('');
        }
        setLastFailedPrompt(null);

        const targetSessionId = activeGeneralSession?.sessionId || getOrCreateGeneralSessionId();
        const storedProfile = readGeneralCustomerProfile();
        const customerName = activeGeneralSession?.patientName || storedProfile.name || 'Pelanggan / Pasien';
        const customerPhone = activeGeneralSession?.patientPhone || storedProfile.phone || '';

        // 1. MANUAL TYPED MESSAGE OR STAFF QUICK REPLY IN TAB OBROLAN -> Stays strictly in Tab Obrolan (__obrolan)
        if (!isQuickTopicOption) {
          const isReplyingToCustomer =
            Boolean(forceAsStaffReply) ||
            Boolean(
              activeGeneralSession &&
                activeGeneralSession.messages.some((m) => m.sender === 'patient')
            );
          setIsSending(true);
          try {
            await dispatchGeneralRoomPacket({
              id: `${isReplyingToCustomer ? 'stfmsg' : 'ptmsg'}-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 7)}`,
              sessionId: targetSessionId,
              sender: isReplyingToCustomer ? 'staff' : 'patient',
              senderName: isReplyingToCustomer ? resolvedStaffName : customerName,
              patientName: customerName,
              patientPhone: customerPhone,
              text
            });
          } finally {
            setIsSending(false);
          }
          return;
        }

        // 2. QUICK CHAT OPTION BY TOPIC -> Answered automatically by the system & synced to session
        setIsSending(true);
        try {
          await dispatchGeneralRoomPacket({
            id: `ptq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sessionId: targetSessionId,
            sender: 'patient',
            senderName: customerName,
            patientName: customerName,
            patientPhone: customerPhone,
            text
          });

          const historySnapshot = (activeGeneralSession?.messages || [])
            .slice(-8)
            .map((m) => ({
              role: m.sender === 'patient' ? 'user' : 'assistant',
              content: m.text
            }));

          const matchedMedicines = findRelevantMedicinesForPrompt(text);
          const nowDate = new Date();
          const todayDayName = INDONESIAN_DAYS[nowDate.getDay()];
          const todayDateLabel = nowDate.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
          const response = await fetch('/api/gemini/patient-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              history: historySnapshot,
              context: {
                todayDayName,
                todayDateLabel,
                pharmacy: {
                  name: pharmacyName,
                  branchName: currentBranch?.name || '-',
                  address: pharmacyAddress,
                  phone: pharmacyPhone,
                  apjName: apjProfile?.name || '-',
                  dpjName: dpjProfile?.name || '-'
                },
                doctors: doctors.map((d) => ({
                  id: d.id,
                  name: d.name,
                  specialization: d.specialization,
                  schedule: d.schedule
                })),
                schedules: (schedules || []).map((s) => ({
                  id: s.id,
                  staffId: s.staffId,
                  staffName: s.staffName,
                  staffRole: s.staffRole,
                  day: s.day,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  serviceUnit: s.serviceUnit,
                  sessionLabel: s.sessionLabel,
                  quotaPerDay: s.quotaPerDay,
                  status: s.status,
                  notes: s.notes || ''
                })),
                matchedMedicines,
                activePromos: activePromosSummary,
                serviceFees: {
                  medicalSupportFee: feeConfig?.medicalSupportFee || 0,
                  homeVisitFee: feeConfig?.homeVisitFee || 0,
                  customTariffs: (feeConfig?.customTariffs || [])
                    .filter((t) => !/konsultasi|konseling/i.test(String(t.name || '')))
                    .slice(0, 12)
                    .map((t) => ({
                      name: t.name,
                      price: t.price
                    }))
                },
                queueSummary: {
                  waitingCount: waitingQueueCount
                }
              }
            })
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data?.reply) {
            throw new Error(
              data?.error || 'Tidak dapat terhubung ke layanan obrolan saat ini. Coba lagi.'
            );
          }

          await dispatchGeneralRoomPacket({
            id: `ast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sessionId: targetSessionId,
            sender: 'assistant',
            senderName: 'Sistem Otomatis Latisha Farma',
            patientName: customerName,
            patientPhone: customerPhone,
            text: String(data.reply)
          });

          if (!isOpenRef.current) {
            setUnreadCount((c) => c + 1);
          }
        } catch (err: any) {
          setLastFailedPrompt(text);
          await dispatchGeneralRoomPacket({
            id: `err-${Date.now()}`,
            sessionId: targetSessionId,
            sender: 'assistant',
            senderName: 'Sistem Otomatis Latisha Farma',
            patientName: customerName,
            patientPhone: customerPhone,
            text:
              err?.message ||
              'Maaf, terjadi kendala koneksi saat memuat jawaban otomatis sistem.'
          });
        } finally {
          setIsSending(false);
        }
      },
      [
        inputText,
        isSending,
        activeGeneralSession,
        resolvedStaffName,
        dispatchGeneralRoomPacket,
        findRelevantMedicinesForPrompt,
        pharmacyName,
        currentBranch?.name,
        pharmacyAddress,
        pharmacyPhone,
        apjProfile?.name,
        dpjProfile?.name,
        doctors,
        schedules,
        activePromosSummary,
        feeConfig,
        waitingQueueCount
      ]
    );

    const handleResetChat = () => {
      setLastFailedPrompt(null);
      setMessages([createWelcomeMessage(pharmacyName)]);
      if (activeGeneralSession) {
        handleDeleteLiveSession(activeGeneralSession.sessionId);
      }
    };

    const handleCopyTextById = async (id: string, rawText: string) => {
      try {
        await navigator.clipboard.writeText(rawText.replace(/\*\*/g, ''));
        setCopiedId(id);
        setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
      } catch {}
    };

    const handleCopyPhone = async () => {
      if (!pharmacyPhone || pharmacyPhone === '-') return;
      try {
        await navigator.clipboard.writeText(pharmacyPhone);
        setCopiedPhone(true);
        setTimeout(() => setCopiedPhone(false), 2000);
      } catch {}
    };

    return (
      <div className={`fixed bottom-20 right-3 sm:bottom-4 sm:right-4 ${isOpen ? 'z-40' : 'z-20'} flex flex-col items-end pointer-events-none`}>
        {/* Interactive Chat Panel */}
        {isOpen && (
          <div
            role="dialog"
            aria-label="Obrolan Interaktif Layanan Pelanggan dan Pasien"
            className="pointer-events-auto mb-2.5 w-[calc(100vw-1.5rem)] sm:w-[440px] h-[550px] max-h-[calc(100vh-9.5rem)] sm:max-h-[calc(100vh-7rem)] bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-emerald-700 text-white px-4 py-3 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 relative">
                  <MessageCircle className="w-5 h-5 text-white" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-sky-800 absolute -bottom-0.5 -right-0.5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-sm leading-tight truncate flex items-center gap-1.5">
                    <span>Layanan Pelanggan &amp; Pasien</span>
                  </h3>
                  <p className="text-[11px] text-sky-100/90 truncate">
                    {pharmacyName} · Obrolan Interaktif
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {activeMode === 'chat' && (
                  <button
                    type="button"
                    onClick={handleResetChat}
                    title="Mulai obrolan baru"
                    aria-label="Mulai obrolan baru"
                    className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/15 transition cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  title="Perkecil obrolan"
                  aria-label="Perkecil obrolan"
                  className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/15 transition cursor-pointer"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-navigation Tabs + Quick Contact & Registration Portal Strip */}
            <div className="bg-slate-50 border-b border-slate-200 px-2.5 py-2 flex items-center justify-between gap-1.5 shrink-0">
              <div className="flex items-center bg-slate-200/75 p-0.5 rounded-xl text-[10.5px] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveMode('chat')}
                  className={`px-2 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer relative ${
                    activeMode === 'chat'
                      ? 'bg-white text-sky-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>Obrolan</span>
                  {totalObrolanUnread > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                      {totalObrolanUnread}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('live')}
                  className={`px-2 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer relative ${
                    activeMode === 'live'
                      ? 'bg-white text-sky-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Users className="w-3 h-3 text-sky-600 shrink-0" />
                  <span>Pasien</span>
                  {totalLiveUnread > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                      {totalLiveUnread}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('catalog')}
                  className={`px-2 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer ${
                    activeMode === 'catalog'
                      ? 'bg-white text-sky-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Search className="w-3 h-3 text-sky-600 shrink-0" />
                  <span>Cek Obat</span>
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {pharmacyPhone && pharmacyPhone !== '-' && (
                  <button
                    type="button"
                    onClick={handleCopyPhone}
                    title={`Salin nomor telepon apotek: ${pharmacyPhone}`}
                    className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    {copiedPhone ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="hidden sm:inline">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Phone className="w-3 h-3" />
                        <span className="hidden sm:inline">Kontak</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {activeMode === 'live' ? (
              /* TAB: PASIEN (HANYA MENAMPILKAN PESAN DARI TAB PASIEN PORTAL PENDAFTARAN) */
              <div className="flex-1 flex flex-col min-h-0 bg-slate-50/70">
                {!selectedLiveSession ? (
                  <>
                    <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                        {isLiveConnected ? (
                          <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span>
                          {isLiveConnected
                            ? 'Terhubung Real-Time ke Tab Pasien Portal'
                            : 'Menghubungkan ulang server obrolan...'}
                        </span>
                      </div>
                      <span className="text-[10px] font-extrabold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-lg">
                        {pasienSessions.length} Sesi
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                      {pasienSessions.length === 0 ? (
                        <div className="text-center py-10 px-4 space-y-2.5">
                          <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center mx-auto">
                            <Users className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-extrabold text-slate-700">
                            Belum ada pesan masuk di Tab Pasien
                          </p>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            Saat pelanggan atau pasien mengirim pesan melalui Tab Pasien di portal pendaftaran pasien, percakapan hanya muncul di sini secara real-time.
                          </p>
                          <a
                            href={PATIENT_REGISTRATION_PORTAL_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold transition"
                          >
                            <span>Buka Portal Pendaftaran</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ) : (
                        pasienSessions.map((session) => {
                          const lastMsg = session.messages[session.messages.length - 1];
                          const lastTime = lastMsg?.createdAt
                            ? new Date(lastMsg.createdAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : '';
                          return (
                            <div
                              key={session.sessionId}
                              onClick={() => {
                                setSelectedLiveSessionId(session.sessionId);
                                markLiveSessionRead(session.sessionId);
                              }}
                              className={`p-3 rounded-xl border transition cursor-pointer flex items-start justify-between gap-2 ${
                                session.unreadForStaff > 0
                                  ? 'bg-sky-50/90 border-sky-300 hover:border-sky-400'
                                  : 'bg-white border-slate-200 hover:border-sky-300'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-extrabold text-slate-800 truncate">
                                    {session.patientName || 'Pengunjung Portal'}
                                  </p>
                                  {session.unreadForStaff > 0 && (
                                    <span className="min-w-[18px] h-4.5 px-1.5 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center shrink-0">
                                      {session.unreadForStaff}
                                    </span>
                                  )}
                                </div>
                                {session.patientPhone && (
                                  <p className="text-[10px] font-mono font-bold text-emerald-700 mt-0.5">
                                    WA: {session.patientPhone}
                                  </p>
                                )}
                                <p className="text-[11px] text-slate-600 truncate mt-1">
                                  {lastMsg
                                    ? `${lastMsg.sender === 'staff' ? 'Anda: ' : ''}${lastMsg.text}`
                                    : 'Memulai obrolan...'}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  {lastTime}
                                </span>
                                <button
                                  type="button"
                                  title="Hapus riwayat sesi ini"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteLiveSession(session.sessionId);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  /* Active Patient Live Conversation (Strictly Tab Pasien) */
                  <>
                    <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedLiveSessionId(null)}
                          className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shrink-0"
                          title="Kembali ke daftar chat pasien"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-800 truncate">
                            {selectedLiveSession.patientName || 'Pengunjung Portal'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono truncate">
                            {selectedLiveSession.patientPhone
                              ? `WA: ${selectedLiveSession.patientPhone}`
                              : 'Pengunjung Portal Pendaftaran'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg shrink-0">
                        Tab Pasien · Live
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
                      {selectedLiveSession.messages.map((msg) => {
                        const isStaff = msg.sender === 'staff';
                        const isAssistant = msg.sender === 'assistant';
                        const timeLabel = msg.createdAt
                          ? new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '';
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isStaff || isAssistant ? 'items-end' : 'items-start'}`}
                          >
                            <span
                              className={`text-[10px] font-bold mb-0.5 px-1 ${
                                isAssistant ? 'text-sky-700' : 'text-slate-500'
                              }`}
                            >
                              {isStaff
                                ? msg.senderName || resolvedStaffName
                                : isAssistant
                                ? msg.senderName || 'Asisten Otomatis Latisha Farma'
                                : msg.senderName || selectedLiveSession.patientName}
                            </span>
                            <div
                              className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-xs shadow-2xs break-words leading-relaxed ${
                                isStaff
                                  ? 'bg-emerald-600 text-white rounded-br-sm font-medium whitespace-pre-wrap'
                                  : isAssistant
                                  ? 'bg-sky-50 text-slate-800 border border-sky-200 rounded-br-sm space-y-0.5'
                                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm whitespace-pre-wrap'
                              }`}
                            >
                              {isAssistant ? renderFormattedText(msg.text) : msg.text}
                            </div>
                            <span className="text-[10px] text-slate-400 mt-0.5 px-1">
                              {timeLabel}
                            </span>
                          </div>
                        );
                      })}
                      <div ref={liveMessagesEndRef} />
                    </div>

                    {/* Quick Staff Reply Chips */}
                    <div className="px-2.5 py-1.5 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                      {STAFF_QUICK_REPLIES.map((snippet, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isSendingLive}
                          onClick={() => handleSendLiveReply(snippet)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 hover:border-emerald-200 text-[10px] font-bold text-slate-700 whitespace-nowrap shrink-0 transition cursor-pointer"
                        >
                          {snippet.length > 42 ? `${snippet.slice(0, 42)}…` : snippet}
                        </button>
                      ))}
                    </div>

                    {/* Staff Live Reply Composer */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendLiveReply();
                      }}
                      className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
                    >
                      <input
                        ref={liveInputRef}
                        type="text"
                        value={liveInputText}
                        onChange={(e) => setLiveInputText(e.target.value)}
                        disabled={isSendingLive}
                        placeholder="Balas pesan pasien di Tab Pasien..."
                        className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 placeholder:text-slate-400"
                      />
                      <button
                        type="submit"
                        disabled={isSendingLive || !liveInputText.trim()}
                        aria-label="Kirim balasan ke pasien"
                        className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer disabled:opacity-45 shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </>
                )}
              </div>
            ) : activeMode === 'catalog' ? (
              /* Quick Medicine Availability & Price Lookup Tab */
              <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
                <div className="p-3 bg-white border-b border-slate-200">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={catalogQuery}
                      onChange={(e) => setCatalogQuery(e.target.value)}
                      placeholder="Cari nama obat, vitamin, atau golongan..."
                      className="w-full pl-9 pr-8 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                    {catalogQuery && (
                      <button
                        type="button"
                        onClick={() => setCatalogQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                  {catalogResults.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      Obat tidak ditemukan di katalog stok saat ini.
                    </div>
                  ) : (
                    catalogResults.map((med) => (
                      <div
                        key={med.id}
                        className="bg-white p-2.5 rounded-xl border border-slate-200 hover:border-sky-300 transition flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-800 truncate">
                            {med.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                            <MedicineCategorySymbol category={med.category} size="xs" />
                            <span className="text-slate-300">·</span>
                            <span
                              className={`font-bold ${
                                med.stock > 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {med.stock > 0
                                ? `Stok: ${med.stock} ${med.unit || ''}`
                                : 'Stok Habis'}
                            </span>
                          </div>
                          <p className="text-[11px] font-black text-sky-700 font-mono mt-0.5">
                            Rp {Number(med.sellPrice || 0).toLocaleString('id-ID')} /{' '}
                            {med.unit || 'pcs'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleSendMessage(
                              `Tolong jelaskan kegunaan, aturan pakai umum, dan ketersediaan obat ${med.name}.`
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-extrabold shrink-0 cursor-pointer transition"
                        >
                          Tanya Obat
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* TAB: OBROLAN (HANYA MENAMPILKAN INTERAKSI DARI TAB OBROLAN, TERPISAH DARI TAB PASIEN) */
              <>
                {obrolanSessions.length > 0 && activeGeneralSession && (
                  <div className="px-3 py-1.5 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
                      {obrolanSessions.length === 1 ? (
                        <div className="flex items-center gap-1.5 min-w-0 text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="font-extrabold text-slate-800 truncate">
                            {activeGeneralSession.patientName || 'Pelanggan'}
                          </span>
                          {activeGeneralSession.patientPhone && (
                            <span className="font-mono text-[10px] font-bold text-emerald-700 shrink-0">
                              · WA: {activeGeneralSession.patientPhone}
                            </span>
                          )}
                        </div>
                      ) : (
                        obrolanSessions.map((sess) => {
                          const isSelected = sess.sessionId === activeGeneralSession.sessionId;
                          return (
                            <button
                              key={sess.sessionId}
                              type="button"
                              onClick={() => {
                                setSelectedObrolanSessionId(sess.sessionId);
                                markLiveSessionRead(sess.sessionId);
                              }}
                              className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer transition ${
                                isSelected
                                  ? 'bg-sky-700 text-white border-sky-700'
                                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-sky-300'
                              }`}
                            >
                              <span className="truncate max-w-[110px]">
                                {sess.patientName || 'Pelanggan'}
                              </span>
                              {sess.unreadForStaff > 0 && (
                                <span className="min-w-[14px] h-3.5 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                                  {sess.unreadForStaff}
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-lg shrink-0">
                      Tab Obrolan
                    </span>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70 custom-scrollbar">
                  {/* Welcome Card */}
                  <div className="flex flex-col items-start">
                    <div className="max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs shadow-2xs bg-white text-slate-700 border border-slate-200/90 space-y-0.5">
                      {renderFormattedText(createWelcomeMessage(pharmacyName).content)}
                    </div>
                  </div>

                  {/* Isolated Tab Obrolan Conversation Stream (Customer <-> Petugas di Tab Obrolan + Jawaban Otomatis Sistem) */}
                  {(activeGeneralSession?.messages || []).map((msg) => {
                    const isPatient = msg.sender === 'patient';
                    const isAssistant = msg.sender === 'assistant';
                    const timeLabel = msg.createdAt
                      ? new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isPatient ? 'items-end' : 'items-start'}`}
                      >
                        <span
                          className={`text-[10px] font-bold mb-0.5 px-1 flex items-center gap-1 ${
                            isPatient
                              ? 'text-slate-500'
                              : isAssistant
                              ? 'text-sky-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {!isPatient &&
                            (isAssistant ? (
                              <Sparkles className="w-2.5 h-2.5 text-sky-600" />
                            ) : (
                              <Users className="w-2.5 h-2.5 text-emerald-600" />
                            ))}
                          <span>
                            {isPatient
                              ? msg.senderName || activeGeneralSession?.patientName || 'Pelanggan'
                              : isAssistant
                              ? msg.senderName || 'Sistem Otomatis Latisha Farma'
                              : msg.senderName || resolvedStaffName}
                          </span>
                        </span>

                        <div
                          className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs break-words leading-relaxed ${
                            isPatient
                              ? 'bg-sky-700 text-white rounded-br-sm font-medium whitespace-pre-wrap'
                              : isAssistant
                              ? 'bg-white text-slate-700 border border-sky-200/90 rounded-bl-sm space-y-0.5'
                              : 'bg-emerald-50/90 text-slate-800 border border-emerald-300 rounded-bl-sm whitespace-pre-wrap font-medium'
                          }`}
                        >
                          {isAssistant ? renderFormattedText(msg.text) : msg.text}
                        </div>

                        <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-slate-400">
                          <span>{timeLabel}</span>
                          {!isPatient && (
                            <button
                              type="button"
                              onClick={() => handleCopyTextById(msg.id, msg.text)}
                              className="inline-flex items-center gap-0.5 text-slate-400 hover:text-sky-700 transition cursor-pointer"
                              title="Salin jawaban"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-600 font-semibold">Disalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Salin</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isSending && (
                    <div className="flex items-start">
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs text-slate-500 flex items-center gap-2 shadow-2xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                        <span className="font-semibold">Menyiapkan jawaban layanan...</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Topic Prompts */}
                <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                  {QUICK_PROMPTS.map((item) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        disabled={isSending}
                        onClick={() => handleSendMessage(item.prompt)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-200 border border-slate-200 text-[10px] font-bold text-slate-700 flex items-center gap-1 whitespace-nowrap shrink-0 transition cursor-pointer disabled:opacity-50"
                      >
                        <IconComp className="w-3 h-3 text-sky-600 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Message Composer */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={isSending}
                    placeholder={
                      activeGeneralSession &&
                      activeGeneralSession.messages.some((m) => m.sender === 'patient')
                        ? `Balas pesan ${activeGeneralSession.patientName || 'pelanggan'} di Tab Obrolan...`
                        : 'Tulis pertanyaan pasien / pelanggan...'
                    }
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-400 outline-none text-slate-800 placeholder:text-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !inputText.trim()}
                    aria-label="Kirim pesan obrolan"
                    className="p-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shrink-0 shadow-xs"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </form>

                {/* Clinical Safety Footnote */}
                <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 text-center shrink-0">
                  Informasi bersifat panduan layanan. Untuk resep &amp; kondisi darurat, konsultasikan langsung dengan Dokter / Apoteker.
                </div>
              </>
            )}
          </div>
        )}

        {/* Floating Interactive Chat Trigger Button (Icon Only) */}
        <button
          type="button"
          onClick={() => {
            setIsOpen((prev) => {
              const nextOpen = !prev;
              if (nextOpen) {
                if (totalLiveUnread > 0 && totalObrolanUnread === 0) {
                  setActiveMode('live');
                } else if (totalObrolanUnread > 0) {
                  setActiveMode('chat');
                }
              }
              return nextOpen;
            });
            setUnreadCount(0);
          }}
          title={isOpen ? 'Tutup Obrolan Pasien' : 'Obrolan Pasien'}
          aria-expanded={isOpen}
          aria-label={
            isOpen
              ? 'Tutup obrolan interaktif layanan pelanggan dan pasien'
              : 'Buka obrolan interaktif layanan pelanggan dan pasien'
          }
          className="pointer-events-auto group w-11 h-11 flex items-center justify-center rounded-full bg-gradient-to-r from-sky-700 to-emerald-600 hover:from-sky-800 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl border border-white/25 transition-all duration-200 cursor-pointer relative"
        >
          <span className="relative flex items-center justify-center">
            {isOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <>
                <MessageCircle className="w-5 h-5" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 border-2 border-sky-800 absolute -bottom-0.5 -right-0.5" />
              </>
            )}
          </span>
          {!isOpen && unreadCount + totalObrolanUnread + totalLiveUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-xs border border-white/80">
              {unreadCount + totalObrolanUnread + totalLiveUnread}
            </span>
          )}
        </button>
      </div>
    );
  }
);
