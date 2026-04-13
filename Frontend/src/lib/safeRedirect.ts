// Helper to prevent open-redirects by validating URLs against an allowlist
const DEFAULT_ALLOWLIST = [
  'google.com',
  'meet.google.com',
  'microsoft.com',
  'teams.microsoft.com',
  'zoom.us',
  'webex.com',
  'bluejeans.com',
];

export function isAllowedRedirect(target: string, allowlist?: string[]) {
  if (!target) return false;
  try {
    const parsed = new URL(target, window.location.origin);

    // Only allow http(s)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // Allow same-origin redirects
    if (parsed.origin === window.location.origin) return true;

    const hosts = allowlist ?? DEFAULT_ALLOWLIST;
    const hostname = parsed.hostname.toLowerCase();

    return hosts.some((h) => {
      const host = h.toLowerCase();
      return hostname === host || hostname.endsWith('.' + host);
    });
  } catch {
    return false;
  }
}

export function safeOpenUrl(target: string, targetWindow = '_blank', features?: string, allowlist?: string[]) {
  if (!isAllowedRedirect(target, allowlist)) {
    console.warn('Blocked attempt to open unsafe URL:', target);
    return false;
  }

  window.open(target, targetWindow, features);
  return true;
}

export default safeOpenUrl;
