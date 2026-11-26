import { isDemoMode } from './demoSandbox';

const VIRTUAL_PORTAL_SUFFIXES = [
  '/portal-pelanggan',
  '/portal-mitra',
  '/registrasi-pegawai',
  '/daftar-online',
  '/pendaftaran',
];

/**
 * Mengembalikan base URL aplikasi dengan mempertahankan subpath repository
 * (contoh: "https://latishafarma.github.io/latishaenterprise/" pada GitHub Pages,
 * atau "https://domain.com/" pada root domain / localhost).
 * Selalu diakhiri dengan "/".
 */
export function getAppBaseUrl(): string {
  if (typeof window === 'undefined') {
    return './';
  }
  try {
    const url = new URL(window.location.href);
    let pathname = url.pathname || '/';

    // Jika URL berakhir dengan nama file HTML (mis. /latishaenterprise/index.html atau /latishaenterprise/pendaftaran-pasien.html)
    if (/\.html?$/i.test(pathname)) {
      pathname = pathname.replace(/\/[^/]*$/, '/');
    } else {
      // Hapus trailing slash sementara untuk mencocokkan virtual route subpath jika ada
      const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
      let stripped = false;
      for (const suffix of VIRTUAL_PORTAL_SUFFIXES) {
        if (trimmed === suffix || trimmed.endsWith(suffix)) {
          pathname = trimmed.slice(0, trimmed.length - suffix.length) || '/';
          stripped = true;
          break;
        }
      }
      if (!stripped && !pathname.endsWith('/')) {
        pathname = `${pathname}/`;
      }
    }

    if (!pathname.endsWith('/')) {
      pathname = `${pathname}/`;
    }

    return `${url.origin}${pathname}`;
  } catch {
    return window.location.origin ? `${window.location.origin}/` : './';
  }
}

/**
 * Mengembalikan base URL tanpa trailing slash (cocok untuk input Base URL pada QR Generator).
 * Contoh: "https://latishafarma.github.io/latishaenterprise" atau "http://localhost:3000".
 */
export function getAppBaseUrlWithoutTrailingSlash(): string {
  const base = getAppBaseUrl();
  if (base === './') return '';
  return base.replace(/\/+$/, '');
}

/**
 * Membangun URL portal publik yang aman untuk GitHub Pages, Cloud Run, maupun localhost.
 */
export function buildPortalUrl(
  params: Record<string, string>,
  includeDemoIfActive = true
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      sp.set(k, String(v));
    }
  }
  if (includeDemoIfActive && isDemoMode() && !sp.has('mode')) {
    sp.set('mode', 'demo');
  }
  const query = sp.toString();
  const base = getAppBaseUrl();
  return query ? `${base}?${query}` : base;
}

/**
 * Membangun URL untuk file statis di folder public (mis. pendaftaran-pasien.html)
 * sambil mempertahankan subpath repository GitHub Pages.
 */
export function buildPublicAssetPortalUrl(
  assetFileName: string,
  params: Record<string, string> = {},
  includeDemoIfActive = true
): string {
  const cleanAsset = String(assetFileName || '').replace(/^\/+/, '');
  const base = getAppBaseUrl();
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      sp.set(k, String(v));
    }
  }
  if (includeDemoIfActive && isDemoMode() && !sp.has('mode')) {
    sp.set('mode', 'demo');
  }
  const query = sp.toString();
  return query ? `${base}${cleanAsset}?${query}` : `${base}${cleanAsset}`;
}
