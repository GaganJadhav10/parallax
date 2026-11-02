import { Subdomain } from '../types';

/**
 * Infrastructure attribution derived from CNAME targets.
 *
 * These are read off the DNS data the scan already returned — nothing is
 * guessed or looked up. A hostname with no CNAME yields no fingerprint, which
 * is the honest answer rather than a default label.
 */
interface FingerprintRule {
  label: string;
  /** Matched against each CNAME target, lowercased. */
  patterns: string[];
}

const FINGERPRINTS: FingerprintRule[] = [
  { label: 'Cloudflare', patterns: ['cdn.cloudflare.net', 'cloudflare.net', 'cloudflaressl.com', 'pages.dev', 'workers.dev'] },
  { label: 'AWS', patterns: ['amazonaws.com', 'awsglobalaccelerator.com', 'elasticbeanstalk.com'] },
  { label: 'CloudFront', patterns: ['cloudfront.net'] },
  { label: 'Azure', patterns: ['azurewebsites.net', 'azureedge.net', 'azurefd.net', 'trafficmanager.net', 'cloudapp.azure.com'] },
  { label: 'Google Cloud', patterns: ['googlehosted.com', 'ghs.google.com', 'appspot.com', 'run.app'] },
  { label: 'Akamai', patterns: ['akamai.net', 'akamaiedge.net', 'edgekey.net', 'edgesuite.net', 'akadns.net'] },
  { label: 'Fastly', patterns: ['fastly.net', 'fastlylb.net'] },
  { label: 'GitHub Pages', patterns: ['github.io', 'github.map.fastly.net'] },
  { label: 'Vercel', patterns: ['vercel-dns.com', 'vercel.app'] },
  { label: 'Netlify', patterns: ['netlify.app', 'netlifyglobalcdn.com'] },
  { label: 'Shopify', patterns: ['myshopify.com', 'shops.myshopify.com'] },
  { label: 'Zendesk', patterns: ['zendesk.com'] },
  { label: 'HubSpot', patterns: ['hubspot.net', 'hs-sites.com'] },
  { label: 'Salesforce', patterns: ['salesforce.com', 'force.com'] },
  { label: 'Atlassian', patterns: ['atlassian.net'] },
  { label: 'Sendgrid', patterns: ['sendgrid.net'] },
  { label: 'Heroku', patterns: ['herokudns.com', 'herokuapp.com'] },
  { label: 'DigitalOcean', patterns: ['ondigitalocean.app'] },
  { label: 'Statuspage', patterns: ['statuspage.io'] },
];

/** Distinct provider labels implied by a hostname's CNAME chain. */
export function fingerprintHost(sub: Subdomain): string[] {
  if (!sub.cnames || sub.cnames.length === 0) return [];

  const found = new Set<string>();
  for (const cname of sub.cnames) {
    const target = cname.toLowerCase();
    for (const rule of FINGERPRINTS) {
      if (rule.patterns.some((pattern) => target.endsWith(pattern) || target.includes(`.${pattern}`))) {
        found.add(rule.label);
      }
    }
  }
  return [...found];
}

/** Provider labels across a whole result set, ordered by how often they appear. */
export function fingerprintSummary(subdomains: Subdomain[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const sub of subdomains) {
    for (const label of fingerprintHost(sub)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/** IPv4 /24 prefix, or the raw address when it is IPv6 or malformed. */
export function subnetOf(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  return ip;
}

export interface HostGroup {
  /** The shared IP, subnet or CNAME target that binds this group. */
  key: string;
  hosts: Subdomain[];
}

export type GroupMode = 'ip' | 'subnet' | 'cname';

/**
 * Co-hosting view: groups hostnames by what they share, which is how shared
 * infrastructure and SaaS dependencies become visible. Hosts with no data for
 * the chosen key are collected under "unresolved".
 */
export function groupHosts(subdomains: Subdomain[], mode: GroupMode): HostGroup[] {
  const groups = new Map<string, Subdomain[]>();

  for (const sub of subdomains) {
    let keys: string[];
    if (mode === 'cname') {
      keys = sub.cnames ?? [];
    } else if (mode === 'subnet') {
      keys = [...new Set((sub.ips ?? []).map(subnetOf))];
    } else {
      keys = sub.ips ?? [];
    }

    if (keys.length === 0) keys = ['unresolved'];

    for (const key of keys) {
      const bucket = groups.get(key);
      if (bucket) bucket.push(sub);
      else groups.set(key, [sub]);
    }
  }

  return [...groups.entries()]
    .map(([key, hosts]) => ({ key, hosts }))
    .sort((a, b) => {
      // "unresolved" is noise — always last, regardless of size.
      if (a.key === 'unresolved') return 1;
      if (b.key === 'unresolved') return -1;
      return b.hosts.length - a.hosts.length || a.key.localeCompare(b.key);
    });
}

/** Every distinct IP in a result set, sorted numerically where possible. */
export function uniqueIPs(subdomains: Subdomain[]): string[] {
  const all = new Set<string>();
  for (const sub of subdomains) {
    for (const ip of sub.ips ?? []) all.add(ip);
  }
  return [...all].sort((a, b) => {
    const toParts = (ip: string) => ip.split('.').map(Number);
    const pa = toParts(a);
    const pb = toParts(b);
    if (pa.length !== 4 || pb.length !== 4) return a.localeCompare(b);
    for (let i = 0; i < 4; i += 1) {
      if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
  });
}
