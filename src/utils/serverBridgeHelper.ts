/**
 * Deteksi apakah aplikasi berjalan di static hosting (mis. GitHub Pages *.github.io)
 * yang tidak menjalankan server Express backend (/api/* & /ws/patient-chat).
 * Juga menyediakan circuit-breaker sesi agar endpoint /api/* tidak memicu
 * console error 404 berulang saat backend lokal tidak tersedia.
 */

let sessionBackendUnavailable = false;

const STATIC_HOST_SUFFIXES = ['.github.io', '.gitlab.io', '.bitbucket.io', '.pages.dev'];

export function isStaticHostEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const proto = (window.location?.protocol || '').toLowerCase();
  if (proto === 'file:') return true;
  const host = (window.location?.hostname || '').toLowerCase();
  if (!host) return false;
  return STATIC_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

export function markLocalServerUnavailable(): void {
  sessionBackendUnavailable = true;
}

export function hasLocalServerBackend(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStaticHostEnvironment() || sessionBackendUnavailable) return false;
  return true;
}

export async function safeBackendFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response | null> {
  if (!hasLocalServerBackend() || typeof fetch !== 'function') {
    return null;
  }

  try {
    const res = await fetch(input, init);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (
      res.status === 404 ||
      res.status === 405 ||
      res.status === 501 ||
      contentType.includes('text/html')
    ) {
      markLocalServerUnavailable();
      return null;
    }
    return res;
  } catch {
    return null;
  }
}
