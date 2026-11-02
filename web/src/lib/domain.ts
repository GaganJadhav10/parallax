/** Apex domain or subdomain, no scheme, no path. */
export const DOMAIN_PATTERN =
  /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

/** Strips the scheme, path, port and trailing dot users commonly paste in. */
export function normalizeTarget(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^[^@]*@/, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export function isValidTarget(value: string): boolean {
  return DOMAIN_PATTERN.test(normalizeTarget(value));
}

/**
 * Best-effort apex extraction for display. Multi-part public suffixes such as
 * co.uk are handled for the common cases; this labels the input, it never
 * decides what gets scanned.
 */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'co.za', 'co.in', 'co.jp', 'or.jp', 'ne.jp',
  'com.br', 'com.mx', 'com.ar', 'com.sg', 'com.hk', 'com.tr', 'com.cn',
]);

export function apexOf(host: string): string {
  const parts = normalizeTarget(host).split('.');
  if (parts.length <= 2) return parts.join('.');

  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

export function tldOf(host: string): string {
  const parts = normalizeTarget(host).split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/** True when the input has labels beyond the apex, e.g. api.example.com. */
export function isSubdomain(host: string): boolean {
  const normalized = normalizeTarget(host);
  return normalized !== '' && normalized !== apexOf(normalized);
}
