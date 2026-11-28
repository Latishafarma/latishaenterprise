export const DEMO_MODE_ACTIVE_KEY = 'latisha_demo_mode_active';
export const DEMO_INITIALIZED_KEY = 'latisha_demo_initialized';
export const DEMO_STORAGE_PREFIX = 'latisha_demo_';

/**
 * Check whether the application is currently running in isolated Demo / Sandbox mode.
 * Triggered via URL query (?mode=demo, ?demo=true, ?demo=1) or persisted demo session flag.
 * Explicitly exits if ?mode=live or ?mode=prod is passed.
 */
export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    const modeParam = (params.get('mode') || '').toLowerCase();
    const demoParam = (params.get('demo') || '').toLowerCase();

    if (modeParam === 'live' || modeParam === 'prod') {
      return false;
    }
    if (modeParam === 'demo' || demoParam === 'true' || demoParam === '1') {
      return true;
    }

    return localStorage.getItem(DEMO_MODE_ACTIVE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Scope storage keys:
 * 1. Demo Mode reads/writes exclusively to `latisha_demo_*`
 * 2. Standard Production Mode reads/writes to standard `latisha_*` entries directly.
 */
export function getScopedStorageKey(baseKey: string): string {
  if (isDemoMode()) {
    if (
      baseKey === DEMO_MODE_ACTIVE_KEY ||
      baseKey === DEMO_INITIALIZED_KEY ||
      baseKey.startsWith(DEMO_STORAGE_PREFIX)
    ) {
      return baseKey;
    }
    if (baseKey.startsWith('latisha_')) {
      return baseKey.replace(/^latisha_/, DEMO_STORAGE_PREFIX);
    }
    return `${DEMO_STORAGE_PREFIX}${baseKey}`;
  }

  return baseKey;
}

export function demoGetItem(baseKey: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(getScopedStorageKey(baseKey));
  } catch {
    return null;
  }
}

const QUOTA_EVICTABLE_CACHE_KEYS: string[] = [
  'latisha_icd10_list',
  'latisha_interaksi_obat_v2',
  'latisha_patients',
  'latisha_audit_logs',
  'latisha_medicines'
];

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    String(e.message || '').toLowerCase().includes('quota')
  );
}

export function demoSetItem(baseKey: string, value: string): void {
  if (typeof window === 'undefined') return;
  const scopedKey = getScopedStorageKey(baseKey);
  try {
    localStorage.setItem(scopedKey, value);
    return;
  } catch (err) {
    if (!isQuotaExceededError(err)) return;

    // Never silently drop operational data (PO, Faktur, Penjualan, Tombstone / Pending Sync):
    // progressively trim/evict reconstructible reference caches in the current storage scope and retry.
    const isSelfHeavyCache = QUOTA_EVICTABLE_CACHE_KEYS.includes(baseKey);
    for (const cacheBaseKey of QUOTA_EVICTABLE_CACHE_KEYS) {
      if (cacheBaseKey === baseKey) continue;
      const cacheScopedKey = getScopedStorageKey(cacheBaseKey);
      const existingRaw = localStorage.getItem(cacheScopedKey);
      if (!existingRaw) continue;

      if (cacheBaseKey === 'latisha_audit_logs') {
        try {
          const parsed = JSON.parse(existingRaw);
          if (Array.isArray(parsed) && parsed.length > 30) {
            localStorage.setItem(cacheScopedKey, JSON.stringify(parsed.slice(0, 30)));
          } else {
            localStorage.removeItem(cacheScopedKey);
          }
        } catch {
          localStorage.removeItem(cacheScopedKey);
        }
      } else if (cacheBaseKey === 'latisha_patients') {
        try {
          const parsed = JSON.parse(existingRaw);
          if (Array.isArray(parsed) && parsed.length > 40) {
            localStorage.setItem(cacheScopedKey, JSON.stringify(parsed.slice(0, 40)));
          } else {
            localStorage.removeItem(cacheScopedKey);
          }
        } catch {
          localStorage.removeItem(cacheScopedKey);
        }
      } else {
        localStorage.removeItem(cacheScopedKey);
      }

      try {
        localStorage.setItem(scopedKey, value);
        return;
      } catch (retryErr) {
        if (!isQuotaExceededError(retryErr)) return;
      }
    }

    // Second pass: remove remaining trimmed heavy caches if still out of quota
    if (!isSelfHeavyCache) {
      for (const cacheBaseKey of QUOTA_EVICTABLE_CACHE_KEYS) {
        try {
          localStorage.removeItem(getScopedStorageKey(cacheBaseKey));
          localStorage.setItem(scopedKey, value);
          return;
        } catch {}
      }
    }
  }
}

export function demoRemoveItem(baseKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getScopedStorageKey(baseKey));
  } catch {}
}

export function getDemoBroadcastChannelName(baseName: string): string {
  if (isDemoMode()) return `${baseName}_demo`;
  return baseName;
}

/**
 * Activate Demo Mode and reflect ?mode=demo in URL if appropriate.
 */
export function activateDemoModeStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEMO_MODE_ACTIVE_KEY, 'true');
    const url = new URL(window.location.href);
    if (url.searchParams.get('mode') !== 'demo') {
      url.searchParams.set('mode', 'demo');
      url.searchParams.delete('demo');
      window.history.replaceState({}, '', url.toString());
    }
  } catch {}
}

/**
 * Deactivate Demo Mode cleanly without modifying any production `latisha_*` keys.
 */
export function deactivateDemoModeStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DEMO_MODE_ACTIVE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    url.searchParams.delete('demo');
    window.history.replaceState({}, '', url.toString());
  } catch {}
}

/**
 * Purge ONLY `latisha_demo_*` localStorage keys (leaving all real production `latisha_*` keys intact).
 */
export function clearDemoSandboxStorage(keepActiveFlag = true): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(DEMO_STORAGE_PREFIX)) {
        if (keepActiveFlag && k === DEMO_MODE_ACTIVE_KEY) continue;
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    if (keepActiveFlag) {
      localStorage.setItem(DEMO_MODE_ACTIVE_KEY, 'true');
    }
  } catch {}
}
