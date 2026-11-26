import { PortalActivityEvent, PortalActivityEventType, PortalOrderRoom } from '../types';
import { demoGetItem, demoSetItem, getDemoBroadcastChannelName } from './demoSandbox';

export const PORTAL_ACTIVITY_STORAGE_KEY = 'latisha_portal_activity_logs';
export const PORTAL_ACTIVITY_CHANNEL_NAME = 'latisha_portal_activity_channel';
const MAX_PORTAL_ACTIVITY_LOGS = 1500;

let cachedSessionId: string | null = null;

export function getPortalSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (typeof window === 'undefined') return 'SSR-SESSION';
  try {
    const existing = window.sessionStorage.getItem('latisha_portal_session_id');
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
    const created = `PS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    window.sessionStorage.setItem('latisha_portal_session_id', created);
    cachedSessionId = created;
    return created;
  } catch {
    cachedSessionId = `PS-${Date.now().toString(36)}`;
    return cachedSessionId;
  }
}

export function loadPortalActivityLogs(): PortalActivityEvent[] {
  try {
    const raw = demoGetItem(PORTAL_ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordPortalActivity(
  input: {
    room: PortalOrderRoom;
    eventType: PortalActivityEventType;
    medicineId?: string;
    medicineName?: string;
    medicineCategory?: string;
    qty?: number;
    unitPrice?: number;
    rxRequired?: boolean;
    rxRequirementLabel?: string;
    mitraVerified?: boolean;
    mitraName?: string;
    orderCode?: string;
    branchId?: string;
  }
): PortalActivityEvent {
  const evt: PortalActivityEvent = {
    id: `PAE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    room: input.room,
    eventType: input.eventType,
    medicineId: input.medicineId,
    medicineName: input.medicineName,
    medicineCategory: input.medicineCategory,
    qty: input.qty,
    unitPrice: input.unitPrice,
    rxRequired: input.rxRequired,
    rxRequirementLabel: input.rxRequirementLabel,
    mitraVerified: input.mitraVerified,
    mitraName: input.mitraName,
    orderCode: input.orderCode,
    branchId: input.branchId || 'BR-01',
    sessionId: getPortalSessionId(),
    createdAt: new Date().toISOString()
  };

  try {
    const current = loadPortalActivityLogs();
    const updated = [evt, ...current].slice(0, MAX_PORTAL_ACTIVITY_LOGS);
    demoSetItem(PORTAL_ACTIVITY_STORAGE_KEY, JSON.stringify(updated));

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(getDemoBroadcastChannelName(PORTAL_ACTIVITY_CHANNEL_NAME));
      bc.postMessage({ type: 'PORTAL_ACTIVITY_ADD', event: evt });
      bc.close();
    }
  } catch {
    // Non-blocking fallback
  }

  return evt;
}
