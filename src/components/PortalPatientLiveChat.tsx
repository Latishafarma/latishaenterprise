import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageCircle,
  Send,
  X,
  Minimize2,
  User,
  Users,
  Phone,
  Check,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  Sparkles,
  Search,
  Copy,
  RotateCcw,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Pill,
  ClipboardList,
  Tag,
  Loader2,
  AlertCircle,
  Edit3
} from 'lucide-react';
import { DutySchedule, Medicine } from '../types';
import { MedicineCategorySymbol } from './MedicineCategorySymbol';

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

interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isError?: boolean;
}

interface CatalogMedicineItem {
  id?: string;
  name: string;
  category: string;
  kelas?: string;
  kekuatan?: string;
  stock: number;
  unit: string;
  sellPrice: number;
}

interface PortalPatientLiveChatProps {
  defaultPatientName?: string;
  defaultPatientPhone?: string;
  schedules?: DutySchedule[];
  medicines?: Medicine[];
  /** 'floating' renders a bottom-right FAB + drawer; 'inline' renders directly inside the portal layout */
  mode?: 'floating' | 'inline';
  /** Controlled open trigger incrementer (when external header/banner buttons want to open the chat) */
  externalOpenTrigger?: number;
  /** Optional callback to expose live online status & unread badge to parent portal header */
  onStatusChange?: (status: { staffOnlineCount: number; unreadCount: number; isConnected: boolean }) => void;
  /** Optional Tailwind bottom/right positioning classes for floating FAB to avoid overlapping bottom bars */
  floatingPositionClass?: string;
}

const SESSION_STORAGE_KEY = 'latisha_portal_live_chat_session_id_v1';
const PROFILE_STORAGE_KEY = 'latisha_portal_live_chat_profile_v1';
const ASSISTANT_CHAT_STORAGE_KEY = 'latisha_portal_assistant_chat_v1';
const LIVE_CHAT_BC_NAME = 'latisha_live_chat_sync_v1';
const FALLBACK_PHARMACY_PHONE = '0895326272957';
const FALLBACK_PHARMACY_NAME = 'Apotek & Layanan Medis Latisha Farma';
const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

const QUICK_TOPIC_BUTTONS = [
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

function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && existing.trim().length >= 8) return existing.trim();
    const created = `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function formatChatTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function stripWeeklyScheduleSection(text: string): string {
  if (!text || (!text.includes('Jadwal Lengkap Mingguan') && !text.includes('Daftar Dokter Terdaftar'))) {
    return text;
  }
  return text
    .replace(/\n+\*\*Jadwal Lengkap Mingguan:\*\*[\s\S]*?(?=\n+Silakan lengkapi formulir|\n+Hubungi petugas|$)/g, '')
    .replace(/\n+\*\*Daftar Dokter Terdaftar:\*\*[\s\S]*?(?=\n+Silakan lengkapi formulir|\n+Hubungi petugas|$)/g, '');
}

function createAssistantWelcomeMessage(pharmacyName: string): AssistantChatMessage {
  return {
    id: 'portal-welcome-msg',
    role: 'assistant',
    content: `Halo! Selamat datang di layanan obrolan **${pharmacyName}**.\n\nSaya siap membantu menjawab pertanyaan Anda seputar:\n- **Jadwal praktik dokter hari ini** sesuai data terbaru klinik\n- **Cek stok & harga obat** (gunakan tab **Cek Obat** di atas)\n- **Panduan minum obat (KIE)** & penyimpanan obat\n- **Alur pendaftaran online**, antrean, promo, & cek kesehatan\n\nSilakan ketik pertanyaan Anda atau pilih topik cepat di bawah.`,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  };
}

async function copyTextSafe(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function renderFormattedAssistantText(text: string): React.ReactNode {
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

export const PortalPatientLiveChat: React.FC<PortalPatientLiveChatProps> = ({
  defaultPatientName = '',
  defaultPatientPhone = '',
  schedules = [],
  medicines = [],
  mode = 'floating',
  externalOpenTrigger = 0,
  onStatusChange,
  floatingPositionClass = 'bottom-4 right-4 sm:bottom-5 sm:right-5'
}) => {
  const [baseSessionId] = useState<string>(() =>
    getOrCreateSessionId().replace(/__(obrolan|pasien)$/, '')
  );
  const obrolanSessionId = useMemo(() => `${baseSessionId}__obrolan`, [baseSessionId]);
  const pasienSessionId = useMemo(() => `${baseSessionId}__pasien`, [baseSessionId]);

  const [isOpen, setIsOpen] = useState<boolean>(mode === 'inline');
  const [activeMode, setActiveMode] = useState<'chat' | 'live' | 'catalog'>('chat');

  // Pharmacy metadata for Kontak & welcome message
  const [pharmacyName, setPharmacyName] = useState<string>(FALLBACK_PHARMACY_NAME);
  const [pharmacyPhone, setPharmacyPhone] = useState<string>(FALLBACK_PHARMACY_PHONE);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Tab Obrolan (__obrolan) isolated state
  const [obrolanMessages, setObrolanMessages] = useState<LiveChatMessage[]>([]);
  const [unreadObrolanCount, setUnreadObrolanCount] = useState(0);
  const [assistantInput, setAssistantInput] = useState('');
  const [isSendingObrolan, setIsSendingObrolan] = useState(false);
  const [isAutoReplyingObrolan, setIsAutoReplyingObrolan] = useState(false);
  const [copiedAssistantMsgId, setCopiedAssistantMsgId] = useState<string | null>(null);

  // Tab Pasien (__pasien) isolated state
  const [liveMessages, setLiveMessages] = useState<LiveChatMessage[]>([]);
  const [unreadPasienCount, setUnreadPasienCount] = useState(0);
  const [staffOnlineCount, setStaffOnlineCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [liveInputText, setLiveInputText] = useState('');
  const [isSendingLive, setIsSendingLive] = useState(false);
  const [isAutoReplyingLive, setIsAutoReplyingLive] = useState(false);

  const unreadCount = unreadObrolanCount + unreadPasienCount;

  // Cek Obat (Catalog) state
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogServerResults, setCatalogServerResults] = useState<CatalogMedicineItem[] | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // Mandatory Patient Identity state (Nama & No. Telepon / WhatsApp)
  const [patientName, setPatientName] = useState<string>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
      return saved.name || defaultPatientName || '';
    } catch {
      return defaultPatientName || '';
    }
  });

  const [patientPhone, setPatientPhone] = useState<string>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
      return saved.phone || defaultPatientPhone || '';
    } catch {
      return defaultPatientPhone || '';
    }
  });

  const isIdentityValid = useMemo(() => {
    const cleanName = patientName.trim();
    const digitsOnly = patientPhone.replace(/\D/g, '');
    return cleanName.length >= 2 && digitsOnly.length >= 8;
  }, [patientName, patientPhone]);

  const [isEditingIdentity, setIsEditingIdentity] = useState<boolean>(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isOpenRef = useRef(isOpen);
  const activeModeRef = useRef(activeMode);
  const obrolanMessagesRef = useRef(obrolanMessages);
  const liveMessagesRef = useRef(liveMessages);
  const assistantMessagesEndRef = useRef<HTMLDivElement>(null);
  const liveMessagesEndRef = useRef<HTMLDivElement>(null);
  const assistantInputRef = useRef<HTMLInputElement>(null);
  const liveInputRef = useRef<HTMLInputElement>(null);
  const identityNameInputRef = useRef<HTMLInputElement>(null);
  const identityPhoneInputRef = useRef<HTMLInputElement>(null);
  const inlineContainerRef = useRef<HTMLDivElement>(null);

  isOpenRef.current = isOpen;
  activeModeRef.current = activeMode;
  obrolanMessagesRef.current = obrolanMessages;
  liveMessagesRef.current = liveMessages;

  // Fetch official pharmacy contact info on mount
  useEffect(() => {
    let active = true;
    fetch('/api/public-chat-context/portal-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.pharmacy) return;
        if (data.pharmacy.name) setPharmacyName(String(data.pharmacy.name));
        if (data.pharmacy.phone) setPharmacyPhone(String(data.pharmacy.phone));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Clear validation error once identity becomes valid
  useEffect(() => {
    if (isIdentityValid && identityError) {
      setIdentityError(null);
    }
  }, [isIdentityValid, identityError]);

  // Cross-tab / same-page synchronization for patient identity
  useEffect(() => {
    const syncIdentityFromStorage = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
        if (typeof saved.name === 'string' && saved.name.trim()) {
          setPatientName((prev) => (prev.trim() ? prev : saved.name));
        }
        if (typeof saved.phone === 'string' && saved.phone.trim()) {
          setPatientPhone((prev) => (prev.trim() ? prev : saved.phone));
        }
      } catch {}
    };
    window.addEventListener('storage', syncIdentityFromStorage);
    window.addEventListener('latisha_portal_profile_sync', syncIdentityFromStorage);
    return () => {
      window.removeEventListener('storage', syncIdentityFromStorage);
      window.removeEventListener('latisha_portal_profile_sync', syncIdentityFromStorage);
    };
  }, []);

  // Open trigger from external header button
  useEffect(() => {
    if (externalOpenTrigger > 0) {
      setIsOpen(true);
      if (unreadPasienCount > 0 && unreadObrolanCount === 0) {
        setActiveMode('live');
      } else if (unreadObrolanCount > 0) {
        setActiveMode('chat');
      }
      if (mode === 'inline') {
        inlineContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => {
        if (!isIdentityValid) {
          if (!patientName.trim()) {
            identityNameInputRef.current?.focus();
          } else {
            identityPhoneInputRef.current?.focus();
          }
          return;
        }
        if (activeModeRef.current === 'live') {
          liveInputRef.current?.focus();
        } else if (activeModeRef.current === 'chat') {
          assistantInputRef.current?.focus();
        }
      }, 160);
    }
  }, [externalOpenTrigger, mode, unreadPasienCount, unreadObrolanCount, isIdentityValid, patientName]);

  useEffect(() => {
    onStatusChange?.({ staffOnlineCount, unreadCount, isConnected });
  }, [staffOnlineCount, unreadCount, isConnected, onStatusChange]);

  useEffect(() => {
    if (defaultPatientName.trim() && !patientName.trim()) {
      setPatientName(defaultPatientName.trim());
    }
  }, [defaultPatientName, patientName]);

  useEffect(() => {
    if (defaultPatientPhone.trim() && !patientPhone.trim()) {
      setPatientPhone(defaultPatientPhone.trim());
    }
  }, [defaultPatientPhone, patientPhone]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PROFILE_STORAGE_KEY,
        JSON.stringify({ name: patientName.trim(), phone: patientPhone.trim() })
      );
      window.dispatchEvent(new Event('latisha_portal_profile_sync'));
    } catch {}
  }, [patientName, patientPhone]);

  // Live catalog search via server API with local fallback
  useEffect(() => {
    if (!isOpen || activeMode !== 'catalog') return;
    let cancelled = false;
    setIsLoadingCatalog(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/public-chat-context/medicines?q=${encodeURIComponent(catalogQuery.trim())}`
        );
        if (!res.ok) throw new Error('Catalog fetch error');
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data?.medicines) && (data.medicines.length > 0 || Number(data.total || 0) > 0)) {
          setCatalogServerResults(data.medicines);
        } else {
          setCatalogServerResults(null);
        }
      } catch {
        if (!cancelled) setCatalogServerResults(null);
      } finally {
        if (!cancelled) setIsLoadingCatalog(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, activeMode, catalogQuery]);

  // Local fallback catalog filter if server has no synced medicines yet
  const localCatalogFallback = useMemo<CatalogMedicineItem[]>(() => {
    if (!medicines || medicines.length === 0) return [];
    const q = catalogQuery.trim().toLowerCase();
    const mapped = medicines.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      kelas: m.kelas,
      kekuatan: m.kekuatan,
      stock: m.stock,
      unit: m.unit || m.satuanKecil || 'pcs',
      sellPrice: m.sellPrice
    }));
    if (!q) {
      const inStock = mapped.filter((m) => m.stock > 0).slice(0, 18);
      return inStock.length > 0 ? inStock : mapped.slice(0, 18);
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    return mapped
      .filter((m) => {
        const haystack = `${m.name} ${m.category} ${m.kelas || ''} ${m.kekuatan || ''}`.toLowerCase();
        return tokens.every((tk) => haystack.includes(tk));
      })
      .slice(0, 25);
  }, [medicines, catalogQuery]);

  const catalogResults = useMemo<CatalogMedicineItem[]>(() => {
    if (catalogServerResults !== null) return catalogServerResults;
    return localCatalogFallback;
  }, [catalogServerResults, localCatalogFallback]);

  const findLocalRelevantMedicines = useCallback(
    (promptText: string) => {
      if (!medicines || medicines.length === 0) return undefined;
      const tokens = promptText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3);
      if (tokens.length === 0) return undefined;
      const scored: { med: Medicine; score: number }[] = [];
      for (const med of medicines) {
        const haystack = `${med.name} ${med.category} ${med.kelas || ''} ${med.kekuatan || ''}`.toLowerCase();
        let score = 0;
        for (const tk of tokens) {
          if (haystack.includes(tk)) score += 1;
        }
        if (score > 0) scored.push({ med, score });
      }
      scored.sort((a, b) => b.score - a.score || b.med.stock - a.med.stock);
      const top = scored.slice(0, 12).map((s) => s.med);
      if (top.length === 0) return undefined;
      return top.map((m) => ({
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

  // Enforce mandatory Name & Phone before starting any chat interaction
  const requireValidIdentity = useCallback((): boolean => {
    const cleanName = patientName.trim();
    const digitsOnly = patientPhone.replace(/\D/g, '');
    if (cleanName.length < 2 || digitsOnly.length < 8) {
      setIsEditingIdentity(true);
      setIdentityError(
        'Harap isi Nama Lengkap dan Nomor Telepon / WhatsApp terlebih dahulu sebelum memulai obrolan.'
      );
      setTimeout(() => {
        if (cleanName.length < 2) {
          identityNameInputRef.current?.focus();
        } else {
          identityPhoneInputRef.current?.focus();
        }
      }, 60);
      return false;
    }
    setIdentityError(null);
    return true;
  }, [patientName, patientPhone]);

  const mergeChannelMessage = useCallback(
    (incoming: LiveChatMessage) => {
      if (incoming.sessionId === obrolanSessionId) {
        setObrolanMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
      } else if (incoming.sessionId === pasienSessionId) {
        setLiveMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
      }
    },
    [obrolanSessionId, pasienSessionId]
  );

  const markChannelRead = useCallback(
    (channel: 'obrolan' | 'pasien') => {
      const targetSid = channel === 'obrolan' ? obrolanSessionId : pasienSessionId;
      if (channel === 'obrolan') {
        setUnreadObrolanCount(0);
      } else {
        setUnreadPasienCount(0);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'chat:mark_read',
            sessionId: targetSid
          })
        );
      } else {
        fetch(`/api/live-chat/sessions/${encodeURIComponent(targetSid)}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reader: 'patient' })
        }).catch(() => {});
      }
    },
    [obrolanSessionId, pasienSessionId]
  );

  // Mark read and auto-scroll ONLY for the currently active tab ('chat' -> Obrolan, 'live' -> Pasien)
  useEffect(() => {
    if (!isOpen) return;
    if (activeMode === 'chat') {
      markChannelRead('obrolan');
      assistantMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (activeMode === 'live') {
      markChannelRead('pasien');
      liveMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [
    isOpen,
    activeMode,
    obrolanMessages.length,
    liveMessages.length,
    isAutoReplyingObrolan,
    isAutoReplyingLive,
    isSendingObrolan,
    isSendingLive,
    markChannelRead
  ]);

  // Initial REST hydrate + periodic poll + WebSocket live connection + 10-minute inactivity cleanup
  useEffect(() => {
    let isDisposed = false;
    let bc: BroadcastChannel | null = null;
    const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit tanpa interaksi

    const deleteExpiredChannelSession = (channelSid: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'chat:delete_session', sessionId: channelSid })
        );
      } else {
        fetch(`/api/live-chat/sessions/${encodeURIComponent(channelSid)}`, {
          method: 'DELETE'
        }).catch(() => {});
      }
      if (bc) {
        try {
          bc.postMessage({ type: 'chat:session_deleted', sessionId: channelSid });
        } catch {}
      }
    };

    const checkLocalInactivity = () => {
      const nowMs = Date.now();
      const obrolanList = obrolanMessagesRef.current;
      if (obrolanList.length > 0) {
        const lastMsg = obrolanList[obrolanList.length - 1];
        const lastTime = lastMsg?.createdAt ? new Date(lastMsg.createdAt).getTime() : NaN;
        if (Number.isFinite(lastTime) && nowMs - lastTime >= INACTIVITY_TIMEOUT_MS) {
          setObrolanMessages([]);
          setUnreadObrolanCount(0);
          deleteExpiredChannelSession(obrolanSessionId);
        }
      }
      const pasienList = liveMessagesRef.current;
      if (pasienList.length > 0) {
        const lastMsg = pasienList[pasienList.length - 1];
        const lastTime = lastMsg?.createdAt ? new Date(lastMsg.createdAt).getTime() : NaN;
        if (Number.isFinite(lastTime) && nowMs - lastTime >= INACTIVITY_TIMEOUT_MS) {
          setLiveMessages([]);
          setUnreadPasienCount(0);
          deleteExpiredChannelSession(pasienSessionId);
        }
      }
    };

    const fetchSessionState = async () => {
      try {
        checkLocalInactivity();
        const res = await fetch(`/api/live-chat/sessions/${encodeURIComponent(baseSessionId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (isDisposed) return;
        if (typeof data.staffOnlineCount === 'number') {
          setStaffOnlineCount(data.staffOnlineCount);
        }
        const obrolanSess: LiveChatSession | null = data.obrolanSession || null;
        if (obrolanSess && Array.isArray(obrolanSess.messages)) {
          setObrolanMessages(obrolanSess.messages);
          if (!(isOpenRef.current && activeModeRef.current === 'chat')) {
            setUnreadObrolanCount(obrolanSess.unreadForPatient || 0);
          }
        } else if (!obrolanSess && obrolanMessagesRef.current.length > 0) {
          setObrolanMessages([]);
          setUnreadObrolanCount(0);
        }
        const pasienSess: LiveChatSession | null = data.pasienSession || null;
        if (pasienSess && Array.isArray(pasienSess.messages)) {
          setLiveMessages(pasienSess.messages);
          if (!(isOpenRef.current && activeModeRef.current === 'live')) {
            setUnreadPasienCount(pasienSess.unreadForPatient || 0);
          }
        } else if (!pasienSess && liveMessagesRef.current.length > 0) {
          setLiveMessages([]);
          setUnreadPasienCount(0);
        }
      } catch {}
    };

    fetchSessionState();
    const pollTimer = window.setInterval(fetchSessionState, 3500);
    const inactivityTimer = window.setInterval(checkLocalInactivity, 15000);

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel(LIVE_CHAT_BC_NAME);
        bc.onmessage = (evt) => {
          if (isDisposed) return;
          const data = evt.data;
          if (
            data?.type === 'chat:message' &&
            (data.sessionId === obrolanSessionId || data.sessionId === pasienSessionId) &&
            data.message
          ) {
            mergeChannelMessage(data.message);
          } else if (data?.type === 'chat:session_deleted') {
            if (data.sessionId === obrolanSessionId) {
              setObrolanMessages([]);
              setUnreadObrolanCount(0);
            } else if (data.sessionId === pasienSessionId) {
              setLiveMessages([]);
              setUnreadPasienCount(0);
            }
          }
        };
      } catch {}
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchSessionState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const connectWs = () => {
      if (isDisposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/patient-chat?role=patient&sessionId=${encodeURIComponent(
        baseSessionId
      )}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isDisposed) return;
          reconnectAttemptRef.current = 0;
          setIsConnected(true);
          if (isOpenRef.current && activeModeRef.current === 'chat') {
            ws.send(JSON.stringify({ type: 'chat:mark_read', sessionId: obrolanSessionId }));
          } else if (isOpenRef.current && activeModeRef.current === 'live') {
            ws.send(JSON.stringify({ type: 'chat:mark_read', sessionId: pasienSessionId }));
          }
          if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = window.setInterval(() => {
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

            if (payload.type === 'pong') {
              if (typeof payload.staffOnlineCount === 'number') {
                setStaffOnlineCount(payload.staffOnlineCount);
              }
            } else if (payload.type === 'chat:init') {
              if (typeof payload.staffOnlineCount === 'number') {
                setStaffOnlineCount(payload.staffOnlineCount);
              }
              const obrolanSess: LiveChatSession | null = payload.obrolanSession || null;
              if (obrolanSess && Array.isArray(obrolanSess.messages)) {
                setObrolanMessages(obrolanSess.messages);
                if (!(isOpenRef.current && activeModeRef.current === 'chat')) {
                  setUnreadObrolanCount(obrolanSess.unreadForPatient || 0);
                }
              } else if (!obrolanSess) {
                setObrolanMessages([]);
                setUnreadObrolanCount(0);
              }
              const pasienSess: LiveChatSession | null = payload.pasienSession || null;
              if (pasienSess && Array.isArray(pasienSess.messages)) {
                setLiveMessages(pasienSess.messages);
                if (!(isOpenRef.current && activeModeRef.current === 'live')) {
                  setUnreadPasienCount(pasienSess.unreadForPatient || 0);
                }
              } else if (!pasienSess) {
                setLiveMessages([]);
                setUnreadPasienCount(0);
              }
            } else if (payload.type === 'presence:update') {
              if (typeof payload.staffOnlineCount === 'number') {
                setStaffOnlineCount(payload.staffOnlineCount);
              }
            } else if (payload.type === 'chat:message' && payload.message) {
              const incoming: LiveChatMessage = payload.message;
              mergeChannelMessage(incoming);
              if (incoming.sender === 'staff') {
                if (incoming.sessionId === obrolanSessionId) {
                  if (isOpenRef.current && activeModeRef.current === 'chat') {
                    ws.send(JSON.stringify({ type: 'chat:mark_read', sessionId: obrolanSessionId }));
                  } else {
                    setUnreadObrolanCount((c) => c + 1);
                  }
                } else if (incoming.sessionId === pasienSessionId) {
                  if (isOpenRef.current && activeModeRef.current === 'live') {
                    ws.send(JSON.stringify({ type: 'chat:mark_read', sessionId: pasienSessionId }));
                  } else {
                    setUnreadPasienCount((c) => c + 1);
                  }
                }
              }
            } else if (payload.type === 'chat:session_deleted') {
              if (payload.sessionId === obrolanSessionId) {
                setObrolanMessages([]);
                setUnreadObrolanCount(0);
              } else if (payload.sessionId === pasienSessionId) {
                setLiveMessages([]);
                setUnreadPasienCount(0);
              }
            }
          } catch {}
        };

        ws.onclose = () => {
          if (isDisposed) return;
          setIsConnected(false);
          if (heartbeatTimerRef.current) {
            clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
          }
          const delay = Math.min(10000, 1500 * Math.pow(1.6, reconnectAttemptRef.current));
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(connectWs, delay);
        };

        ws.onerror = () => {
          try {
            ws.close();
          } catch {}
        };
      } catch {
        setIsConnected(false);
      }
    };

    connectWs();

    return () => {
      isDisposed = true;
      clearInterval(pollTimer);
      clearInterval(inactivityTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (bc) bc.close();
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [baseSessionId, obrolanSessionId, pasienSessionId, mergeChannelMessage]);

  const handleResetAssistantChat = () => {
    setObrolanMessages([]);
    setUnreadObrolanCount(0);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'chat:delete_session', sessionId: obrolanSessionId })
      );
    } else {
      fetch(`/api/live-chat/sessions/${encodeURIComponent(obrolanSessionId)}`, {
        method: 'DELETE'
      }).catch(() => {});
    }
  };

  const handleCopyTextById = async (id: string, rawText: string) => {
    const ok = await copyTextSafe(rawText.replace(/\*\*/g, ''));
    if (ok) {
      setCopiedAssistantMsgId(id);
      setTimeout(() => setCopiedAssistantMsgId((prev) => (prev === id ? null : prev)), 2000);
    }
  };

  const handleCopyPhone = async () => {
    const phone = pharmacyPhone.trim();
    if (!phone || phone === '-') return;
    const ok = await copyTextSafe(phone);
    if (ok) {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  // =========================================================================
  // ISOLATED CHANNEL DISPATCH:
  // - 'obrolan' channel -> obrolanSessionId (only appears in Tab Obrolan)
  // - 'pasien' channel  -> pasienSessionId  (only appears in Tab Pasien)
  // =========================================================================
  const dispatchMessageToServer = useCallback(
    async (
      channel: 'obrolan' | 'pasien',
      packet: {
        id: string;
        sender: 'patient' | 'assistant';
        senderName: string;
        patientName: string;
        patientPhone: string;
        text: string;
      }
    ) => {
      const targetSid = channel === 'obrolan' ? obrolanSessionId : pasienSessionId;
      const optimisticMsg: LiveChatMessage = {
        id: packet.id,
        sessionId: targetSid,
        sender: packet.sender,
        senderName: packet.senderName,
        text: packet.text,
        createdAt: new Date().toISOString()
      };
      mergeChannelMessage(optimisticMsg);

      const fullPacket = {
        type: 'chat:send',
        ...packet,
        sessionId: targetSid,
        source: 'in-app'
      };

      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(fullPacket));
        } else {
          await fetch('/api/live-chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullPacket)
          });
        }
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel(LIVE_CHAT_BC_NAME);
            bc.postMessage({ type: 'chat:message', sessionId: targetSid, message: optimisticMsg });
            bc.close();
          } catch {}
        }
      } catch (err) {
        console.warn('Live chat send fallback failed:', err);
      }
    },
    [obrolanSessionId, pasienSessionId, mergeChannelMessage]
  );

  // Manual question handler -> routed strictly to its active tab channel ('obrolan' or 'pasien')
  const handleSendChannelMessage = useCallback(
    async (channel: 'obrolan' | 'pasien', customText?: string) => {
      const isObrolan = channel === 'obrolan';
      const rawInput = isObrolan ? assistantInput : liveInputText;
      const text = (typeof customText === 'string' ? customText : rawInput).trim();
      const currentlySending = isObrolan ? isSendingObrolan : isSendingLive;
      if (!text || currentlySending) return;

      if (!requireValidIdentity()) return;
      setIsEditingIdentity(false);

      const resolvedName = (patientName || defaultPatientName || '').trim();
      const resolvedPhone = (patientPhone || defaultPatientPhone || '').trim();
      const msgId = `ptmsg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      if (isObrolan) {
        setAssistantInput('');
        setIsSendingObrolan(true);
      } else {
        setLiveInputText('');
        setIsSendingLive(true);
      }

      try {
        await dispatchMessageToServer(channel, {
          id: msgId,
          sender: 'patient',
          senderName: resolvedName,
          patientName: resolvedName,
          patientPhone: resolvedPhone,
          text
        });
      } finally {
        if (isObrolan) {
          setIsSendingObrolan(false);
        } else {
          setIsSendingLive(false);
        }
      }
    },
    [
      assistantInput,
      liveInputText,
      isSendingObrolan,
      isSendingLive,
      patientName,
      defaultPatientName,
      patientPhone,
      defaultPatientPhone,
      dispatchMessageToServer,
      requireValidIdentity
    ]
  );

  // Quick topic option handler -> routed strictly to its active tab channel ('obrolan' or 'pasien')
  const handleQuickTopicAutoReplyByChannel = useCallback(
    async (channel: 'obrolan' | 'pasien', promptText: string) => {
      const cleanPrompt = promptText.trim();
      const isObrolan = channel === 'obrolan';
      const isBusy = isObrolan ? isAutoReplyingObrolan : isAutoReplyingLive;
      if (!cleanPrompt || isBusy) return;

      if (!requireValidIdentity()) return;
      setIsEditingIdentity(false);

      const resolvedName = (patientName || defaultPatientName || '').trim();
      const resolvedPhone = (patientPhone || defaultPatientPhone || '').trim();
      const userMsgId = `ptq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      if (isObrolan) {
        setIsAutoReplyingObrolan(true);
      } else {
        setIsAutoReplyingLive(true);
      }

      try {
        await dispatchMessageToServer(channel, {
          id: userMsgId,
          sender: 'patient',
          senderName: resolvedName,
          patientName: resolvedName,
          patientPhone: resolvedPhone,
          text: cleanPrompt
        });

        const sourceMessages = isObrolan ? obrolanMessagesRef.current : liveMessagesRef.current;
        const historySnapshot = sourceMessages.slice(-8).map((m) => ({
          role: m.sender === 'patient' ? 'user' : 'assistant',
          content: m.text
        }));

        const nowDate = new Date();
        const todayDayName = INDONESIAN_DAYS[nowDate.getDay()];
        const todayDateLabel = nowDate.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        const matchedMedicines = findLocalRelevantMedicines(cleanPrompt);

        const response = await fetch('/api/gemini/patient-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: cleanPrompt,
            history: historySnapshot,
            context: {
              todayDayName,
              todayDateLabel,
              patientName: resolvedName,
              patientPhone: resolvedPhone,
              ...(schedules.length > 0 ? { schedules } : {}),
              ...(matchedMedicines && matchedMedicines.length > 0 ? { matchedMedicines } : {})
            }
          })
        });

        const data = await response.json().catch(() => ({}));
        const replyText =
          response.ok && data?.reply
            ? String(data.reply)
            : data?.error ||
              'Maaf, layanan jawaban otomatis sedang sibuk. Pertanyaan Anda sudah diteruskan ke Petugas Apotek.';

        await dispatchMessageToServer(channel, {
          id: `ast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          sender: 'assistant',
          senderName: 'Sistem Otomatis Latisha Farma',
          patientName: resolvedName,
          patientPhone: resolvedPhone,
          text: replyText
        });
      } catch {
        await dispatchMessageToServer(channel, {
          id: `ast-err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          sender: 'assistant',
          senderName: 'Sistem Otomatis Latisha Farma',
          patientName: resolvedName,
          patientPhone: resolvedPhone,
          text: 'Maaf, terjadi kendala koneksi saat memuat jawaban otomatis. Pertanyaan Anda tetap diteruskan ke Petugas Apotek.'
        });
      } finally {
        if (isObrolan) {
          setIsAutoReplyingObrolan(false);
        } else {
          setIsAutoReplyingLive(false);
        }
      }
    },
    [
      isAutoReplyingObrolan,
      isAutoReplyingLive,
      patientName,
      defaultPatientName,
      patientPhone,
      defaultPatientPhone,
      dispatchMessageToServer,
      schedules,
      findLocalRelevantMedicines,
      requireValidIdentity
    ]
  );

  // Handlers specifically bound to Tab Obrolan ('obrolan' channel)
  const handleSendAssistantMessage = useCallback(
    async (customText?: string) => {
      if (typeof customText === 'string' && customText.trim()) {
        setActiveMode('chat');
        await handleQuickTopicAutoReplyByChannel('obrolan', customText.trim());
        return;
      }
      const manualText = assistantInput.trim();
      if (!manualText) return;
      await handleSendChannelMessage('obrolan', manualText);
    },
    [assistantInput, handleQuickTopicAutoReplyByChannel, handleSendChannelMessage]
  );

  // Handlers specifically bound to Tab Pasien ('pasien' channel)
  const handleSendLive = useCallback(
    async (customText?: string) => {
      await handleSendChannelMessage('pasien', customText);
    },
    [handleSendChannelMessage]
  );

  const handleQuickTopicAutoReplyLive = useCallback(
    async (promptText: string) => {
      await handleQuickTopicAutoReplyByChannel('pasien', promptText);
    },
    [handleQuickTopicAutoReplyByChannel]
  );

  const handleQuickTopicAutoReplyObrolan = useCallback(
    async (promptText: string) => {
      await handleQuickTopicAutoReplyByChannel('obrolan', promptText);
    },
    [handleQuickTopicAutoReplyByChannel]
  );

  const handleSaveProfile = () => {
    if (!requireValidIdentity()) return;
    setIsEditingIdentity(false);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:update_profile',
          sessionId: baseSessionId,
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim()
        })
      );
    }
  };

  // =========================================================================
  // SHARED SUB-NAVIGATION BAR + MANDATORY PATIENT IDENTITY BAR
  // =========================================================================
  const renderSubNavStrip = () => (
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
          {unreadObrolanCount > 0 && (
            <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
              {unreadObrolanCount}
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
          {unreadPasienCount > 0 && (
            <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
              {unreadPasienCount}
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
                <span>Tersalin</span>
              </>
            ) : (
              <>
                <Phone className="w-3 h-3" />
                <span>Kontak</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  const renderMandatoryIdentityBar = () => {
    const showExpandedForm = !isIdentityValid || isEditingIdentity;

    if (!showExpandedForm) {
      return (
        <div className="bg-emerald-50/80 border-b border-emerald-200/80 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="font-extrabold text-slate-800 truncate">{patientName.trim()}</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono font-bold text-emerald-800 truncate">
              {patientPhone.trim()}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingIdentity(true)}
            className="px-2 py-0.5 rounded-md bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer transition"
          >
            <Edit3 className="w-2.5 h-2.5" />
            <span>Ubah</span>
          </button>
        </div>
      );
    }

    return (
      <div
        className={`border-b px-3 py-2.5 space-y-2 shrink-0 ${
          identityError
            ? 'bg-amber-50/95 border-amber-300'
            : 'bg-sky-50/90 border-sky-200'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-extrabold text-sky-900 flex items-center gap-1">
            <User className="w-3 h-3 text-sky-700 shrink-0" />
            <span>Data Pelanggan / Pasien (Wajib Diisi Sebelum Memulai Obrolan)</span>
          </span>
          {isIdentityValid && (
            <button
              type="button"
              onClick={handleSaveProfile}
              className="px-2 py-0.5 rounded-md bg-sky-700 hover:bg-sky-800 text-white text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition shrink-0"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Simpan</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <div className="relative">
            <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              ref={identityNameInputRef}
              type="text"
              required
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Nama Lengkap *"
              aria-label="Nama Lengkap Pelanggan atau Pasien"
              className={`w-full pl-8 pr-2.5 py-1.5 text-xs font-bold bg-white border rounded-lg focus:ring-2 focus:ring-sky-500 outline-none ${
                identityError && patientName.trim().length < 2
                  ? 'border-rose-400 ring-1 ring-rose-300'
                  : 'border-sky-200'
              }`}
            />
          </div>
          <div className="relative">
            <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              ref={identityPhoneInputRef}
              type="tel"
              required
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value.replace(/[^0-9+]/g, ''))}
              placeholder="No. Telepon / WA *"
              aria-label="Nomor Telepon atau WhatsApp"
              className={`w-full pl-8 pr-2.5 py-1.5 text-xs font-mono font-bold bg-white border rounded-lg focus:ring-2 focus:ring-sky-500 outline-none ${
                identityError && patientPhone.replace(/\D/g, '').length < 8
                  ? 'border-rose-400 ring-1 ring-rose-300'
                  : 'border-sky-200'
              }`}
            />
          </div>
        </div>

        {identityError ? (
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>{identityError}</span>
          </div>
        ) : (
          <p className="text-[10px] text-sky-800 font-semibold leading-snug">
            Isi <strong>Nama</strong> &amp; <strong>No. Telepon/WA</strong> di atas untuk membuka tombol topik cepat dan memulai percakapan dengan petugas.
          </p>
        )}
      </div>
    );
  };

  const renderQuickTopicsStrip = (
    onTopicClick: (prompt: string) => void,
    disabled: boolean
  ) => (
    <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
      {QUICK_TOPIC_BUTTONS.map((item) => {
        const IconComp = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            disabled={disabled}
            onClick={() => onTopicClick(item.prompt)}
            className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition cursor-pointer disabled:opacity-50 ${
              isIdentityValid
                ? 'bg-slate-100 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-200 border-slate-200 text-slate-700'
                : 'bg-slate-100/70 border-slate-200 text-slate-500 hover:border-amber-300 hover:bg-amber-50/60'
            }`}
          >
            <IconComp className="w-3 h-3 text-sky-600 shrink-0" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderChatBody = () => (
    <>
      {renderSubNavStrip()}
      {renderMandatoryIdentityBar()}

      {activeMode === 'catalog' ? (
        /* TAB: CEK OBAT */
        <div
          className={`flex flex-col bg-slate-50/50 ${
            mode === 'inline' ? 'h-[340px]' : 'flex-1 min-h-0'
          }`}
        >
          <div className="p-3 bg-white border-b border-slate-200 shrink-0">
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
                  aria-label="Hapus pencarian obat"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {isLoadingCatalog && catalogResults.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                <span>Memuat katalog obat...</span>
              </div>
            ) : catalogResults.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Obat tidak ditemukan di katalog stok saat ini.
              </div>
            ) : (
              catalogResults.map((med, idx) => (
                <div
                  key={med.id || `${med.name}-${idx}`}
                  className="bg-white p-2.5 rounded-xl border border-slate-200 hover:border-sky-300 transition flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-800 truncate">{med.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                      <MedicineCategorySymbol category={med.category} size="xs" />
                      <span className="text-slate-300">·</span>
                      <span
                        className={`font-bold ${
                          med.stock > 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {med.stock > 0 ? `Stok: ${med.stock} ${med.unit || ''}` : 'Stok Habis'}
                      </span>
                    </div>
                    <p className="text-[11px] font-black text-sky-700 font-mono mt-0.5">
                      Rp {Number(med.sellPrice || 0).toLocaleString('id-ID')} / {med.unit || 'pcs'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleSendAssistantMessage(
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
      ) : activeMode === 'live' ? (
        /* TAB: PASIEN (REAL-TIME TWO-WAY LIVE CHAT WITH PETUGAS APOTEK) */
        <>
          {/* Live Status Sub-Bar */}
          <div className="px-3 py-1.5 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-700 min-w-0">
              {isConnected ? (
                staffOnlineCount > 0 ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">
                      Petugas Apotek Online ({staffOnlineCount}) · Real-Time
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">Petugas Standby · Pesan Anda tersimpan</span>
                  </>
                )
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">Menghubungkan ke server apotek...</span>
                </>
              )}
            </div>
          </div>

          {/* Live Messages Area */}
          <div
            className={`overflow-y-auto p-3.5 space-y-3 bg-slate-50/80 custom-scrollbar ${
              mode === 'inline' ? 'h-[250px]' : 'flex-1 min-h-0'
            }`}
          >
            <div className="bg-white border border-sky-100 rounded-2xl p-3 text-xs text-slate-700 shadow-2xs">
              <div className="flex items-center gap-1.5 font-extrabold text-sky-800 mb-1">
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chat Langsung Petugas Apotek Latisha Farma</span>
              </div>
              <p className="leading-relaxed text-[11px] text-slate-600">
                Halo{patientName.trim() ? ` ${patientName.trim()}` : ''}! Pastikan{' '}
                <strong>Nama</strong> dan <strong>No. Telepon</strong> di atas telah diisi, lalu
                ketik pesan Anda untuk terhubung langsung dengan Petugas Apotek secara real-time.
              </p>
            </div>

            {liveMessages.map((msg) => {
              const isPatient = msg.sender === 'patient';
              const isAssistant = msg.sender === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isPatient ? 'items-end' : 'items-start'}`}
                >
                  {!isPatient && (
                    <span
                      className={`text-[10px] font-bold mb-0.5 px-1 flex items-center gap-1 ${
                        isAssistant ? 'text-sky-700' : 'text-emerald-700'
                      }`}
                    >
                      {isAssistant && <Sparkles className="w-2.5 h-2.5 text-emerald-600" />}
                      <span>
                        {msg.senderName ||
                          (isAssistant
                            ? 'Asisten Otomatis Latisha Farma'
                            : 'Petugas Apotek Latisha Farma')}
                      </span>
                    </span>
                  )}
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs break-words leading-relaxed ${
                      isPatient
                        ? 'bg-sky-700 text-white rounded-br-sm font-medium whitespace-pre-wrap'
                        : isAssistant
                        ? 'bg-white text-slate-700 border border-sky-200/90 rounded-bl-sm space-y-0.5'
                        : 'bg-white text-slate-800 border border-emerald-200 rounded-bl-sm whitespace-pre-wrap'
                    }`}
                  >
                    {isAssistant ? renderFormattedAssistantText(msg.text) : msg.text}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 px-1">
                    {formatChatTime(msg.createdAt)}
                  </span>
                </div>
              );
            })}

            {isAutoReplyingLive && (
              <div className="flex items-start">
                <div className="bg-white border border-sky-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs text-slate-500 flex items-center gap-2 shadow-2xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                  <span className="font-semibold">Menyiapkan jawaban layanan otomatis...</span>
                </div>
              </div>
            )}

            <div ref={liveMessagesEndRef} />
          </div>

          {renderQuickTopicsStrip(handleQuickTopicAutoReplyLive, isAutoReplyingLive)}

          {/* Live Input Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendLive();
            }}
            className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              ref={liveInputRef}
              type="text"
              value={liveInputText}
              onFocus={() => {
                if (!isIdentityValid) requireValidIdentity();
              }}
              onChange={(e) => setLiveInputText(e.target.value)}
              disabled={isSendingLive}
              placeholder={
                isIdentityValid
                  ? 'Tulis pesan real-time untuk petugas Apotek...'
                  : 'Isi Nama & No. Telepon di atas untuk memulai obrolan...'
              }
              className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none text-slate-800 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={isSendingLive || !liveInputText.trim()}
              aria-label="Kirim pesan ke petugas apotek"
              className="p-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white transition cursor-pointer disabled:opacity-45 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      ) : (
        /* TAB: OBROLAN (KAMAR OBROLAN UMUM: TERPISAH DARI TAB PASIEN, INTERAKSI 2 ARAH PETUGAS & OPSI CHAT CEPAT OTOMATIS SISTEM) */
        <>
          <div
            className={`overflow-y-auto p-3.5 space-y-3 bg-slate-50/70 custom-scrollbar ${
              mode === 'inline' ? 'h-[260px]' : 'flex-1 min-h-0'
            }`}
          >
            {/* Welcome Card */}
            <div className="flex flex-col items-start">
              <div className="max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs shadow-2xs bg-white text-slate-700 border border-slate-200/90 space-y-0.5">
                {renderFormattedAssistantText(createAssistantWelcomeMessage(pharmacyName).content)}
              </div>
            </div>

            {/* Isolated Tab Obrolan Stream (Customer <-> Petugas di Tab Obrolan + Jawaban Otomatis Sistem) */}
            {obrolanMessages.map((msg) => {
              const isPatient = msg.sender === 'patient';
              const isAssistant = msg.sender === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isPatient ? 'items-end' : 'items-start'}`}
                >
                  {!isPatient && (
                    <span
                      className={`text-[10px] font-bold mb-0.5 px-1 flex items-center gap-1 ${
                        isAssistant ? 'text-sky-700' : 'text-emerald-700'
                      }`}
                    >
                      {isAssistant ? (
                        <Sparkles className="w-2.5 h-2.5 text-sky-600" />
                      ) : (
                        <Users className="w-2.5 h-2.5 text-emerald-600" />
                      )}
                      <span>
                        {msg.senderName ||
                          (isAssistant
                            ? 'Sistem Otomatis Latisha Farma'
                            : 'Petugas Apotek Latisha Farma')}
                      </span>
                    </span>
                  )}
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs break-words leading-relaxed ${
                      isPatient
                        ? 'bg-sky-700 text-white rounded-br-sm font-medium whitespace-pre-wrap'
                        : isAssistant
                        ? 'bg-white text-slate-700 border border-sky-200/90 rounded-bl-sm space-y-0.5'
                        : 'bg-emerald-50/90 text-slate-800 border border-emerald-300 rounded-bl-sm whitespace-pre-wrap font-medium'
                    }`}
                  >
                    {isAssistant ? renderFormattedAssistantText(msg.text) : msg.text}
                  </div>

                  <div
                    className={`flex items-center gap-2 mt-1 px-1 text-[10px] text-slate-400 ${
                      isPatient ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span>{formatChatTime(msg.createdAt)}</span>
                    {!isPatient && (
                      <button
                        type="button"
                        onClick={() => handleCopyTextById(msg.id, msg.text)}
                        className="inline-flex items-center gap-0.5 text-slate-400 hover:text-sky-700 font-semibold transition cursor-pointer"
                        title="Salin jawaban"
                      >
                        {copiedAssistantMsgId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">Tersalin</span>
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

            {isAutoReplyingObrolan && (
              <div className="flex items-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs text-slate-500 flex items-center gap-2 shadow-2xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                  <span className="font-semibold">Menyiapkan jawaban otomatis sistem...</span>
                </div>
              </div>
            )}

            <div ref={assistantMessagesEndRef} />
          </div>

          {renderQuickTopicsStrip(handleQuickTopicAutoReplyObrolan, isAutoReplyingObrolan)}

          {/* Kamar Obrolan Umum Input Composer (Manual Question -> Sent ONLY to Tab Obrolan Petugas) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendAssistantMessage();
            }}
            className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              ref={assistantInputRef}
              type="text"
              value={assistantInput}
              onFocus={() => {
                if (!isIdentityValid) requireValidIdentity();
              }}
              onChange={(e) => setAssistantInput(e.target.value)}
              disabled={isSendingObrolan}
              placeholder={
                isIdentityValid
                  ? 'Tanya jadwal dokter, stok obat, cara minum obat...'
                  : 'Isi Nama & No. Telepon di atas untuk memulai obrolan...'
              }
              className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none text-slate-800 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={isSendingObrolan || !assistantInput.trim()}
              aria-label="Kirim pesan ke tab obrolan petugas"
              className="p-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white transition cursor-pointer disabled:opacity-45 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      )}
    </>
  );

  // INLINE MODE: Embedded directly inside the registration portal page
  if (mode === 'inline') {
    return (
      <div
        ref={inlineContainerRef}
        className="no-print bg-white rounded-3xl border border-emerald-200/90 shadow-md overflow-hidden"
      >
        <div
          onClick={() => setIsOpen((v) => !v)}
          className="bg-gradient-to-r from-sky-700 via-sky-800 to-emerald-700 text-white px-4 py-3 flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 relative">
              <MessageCircle className="w-5 h-5 text-white" />
              <span
                className={`w-2.5 h-2.5 rounded-full border-2 border-sky-800 absolute -bottom-0.5 -right-0.5 ${
                  staffOnlineCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'
                }`}
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm leading-tight truncate flex items-center gap-2">
                <span>Layanan Pelanggan &amp; Pasien</span>
                {unreadCount > 0 && !isOpen && (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                    {unreadCount} Baru
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-sky-100/95 truncate flex items-center gap-1">
                {isConnected ? (
                  staffOnlineCount > 0 ? (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-300 shrink-0" />
                      <span>Petugas Apotek Online ({staffOnlineCount}) · Real-Time</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3 text-amber-200 shrink-0" />
                      <span>Obrolan Interaktif · Petugas Standby</span>
                    </>
                  )
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-amber-200 shrink-0" />
                    <span>Menghubungkan ke server apotek...</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isOpen && activeMode === 'chat' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetAssistantChat();
                }}
                title="Mulai obrolan baru"
                aria-label="Mulai obrolan baru"
                className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/15 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              aria-label={isOpen ? 'Tutup panel obrolan' : 'Buka panel obrolan'}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition cursor-pointer"
            >
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isOpen && renderChatBody()}
      </div>
    );
  }

  // FLOATING MODE: Bottom-right drawer & Icon-only FAB (matching main app PatientServiceChatWidget)
  return (
    <div className={`no-print fixed ${floatingPositionClass} z-50 flex flex-col items-end pointer-events-none`}>
      {isOpen && (
        <div
          role="dialog"
          aria-label="Layanan Pelanggan dan Pasien Latisha Farma"
          className="pointer-events-auto mb-3 w-[calc(100vw-2rem)] sm:w-[440px] h-[570px] max-h-[calc(100vh-7.5rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-emerald-700 text-white px-4 py-3 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 relative">
                <MessageCircle className="w-5 h-5 text-white" />
                <span
                  className={`w-2.5 h-2.5 rounded-full border-2 border-sky-800 absolute -bottom-0.5 -right-0.5 ${
                    staffOnlineCount > 0 ? 'bg-emerald-400' : 'bg-amber-300'
                  }`}
                />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-sm leading-tight truncate">
                  Layanan Pelanggan &amp; Pasien
                </h3>
                <p className="text-[11px] text-sky-100/95 truncate flex items-center gap-1">
                  {isConnected ? (
                    staffOnlineCount > 0 ? (
                      <>
                        <Wifi className="w-3 h-3 text-emerald-300 shrink-0" />
                        <span>Petugas Online ({staffOnlineCount}) · Real-Time</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3 h-3 text-amber-200 shrink-0" />
                        <span>{pharmacyName} · Obrolan Interaktif</span>
                      </>
                    )
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-amber-200 shrink-0" />
                      <span>Menghubungkan ke server apotek...</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {activeMode === 'chat' && (
                <button
                  type="button"
                  onClick={handleResetAssistantChat}
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
                aria-label="Perkecil jendela obrolan"
                className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/15 transition cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {renderChatBody()}
        </div>
      )}

      {/* Floating Trigger Button (Icon Only, matches main app) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
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
              <span
                className={`w-2.5 h-2.5 rounded-full border-2 border-sky-800 absolute -bottom-0.5 -right-0.5 ${
                  staffOnlineCount > 0 ? 'bg-emerald-300' : 'bg-amber-300'
                }`}
              />
            </>
          )}
        </span>
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-xs border border-white/80">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};
