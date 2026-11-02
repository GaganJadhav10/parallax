/**
 * Static descriptive metadata for the built-in providers.
 *
 * This is documentation about what each feed *is* — it never claims live
 * status, latency or rate-limit state, because the API does not report those
 * before a scan runs. Runtime state comes from /api/sources and scan results.
 */
export type SourceCategory =
  | 'Certificate Transparency'
  | 'Passive DNS'
  | 'Threat Intelligence'
  | 'Web Telemetry'
  | 'Internet Census'
  | 'Aggregator';

export interface SourceMeta {
  description: string;
  category: SourceCategory;
}

export const SOURCE_META: Record<string, SourceMeta> = {
  crtsh: {
    description: 'Public Certificate Transparency log search maintained by Sectigo.',
    category: 'Certificate Transparency',
  },
  certspotter: {
    description: 'Real-time Certificate Transparency monitoring provided by SSLMate.',
    category: 'Certificate Transparency',
  },
  hackertarget: {
    description: 'Open attack-surface and DNS host intelligence from HackerTarget.',
    category: 'Passive DNS',
  },
  rapiddns: {
    description: 'RapidDNS historical domain and subdomain query platform.',
    category: 'Passive DNS',
  },
  bufferover: {
    description: 'BufferOver passive DNS index of publicly recorded domain names.',
    category: 'Passive DNS',
  },
  anubis: {
    description: 'Aggregated subdomain intelligence collected from passive signals.',
    category: 'Aggregator',
  },
  urlscan: {
    description: 'urlscan.io public website submission and crawl telemetry.',
    category: 'Web Telemetry',
  },
  otx: {
    description: 'AlienVault Open Threat Exchange crowdsourced indicator database.',
    category: 'Threat Intelligence',
  },
  virustotal: {
    description: 'VirusTotal historical DNS resolution and analysis telemetry.',
    category: 'Threat Intelligence',
  },
  shodan: {
    description: 'Shodan internet-connected device, IP and hostname census.',
    category: 'Internet Census',
  },
};

export const FALLBACK_META: SourceMeta = {
  description: 'Passive OSINT intelligence source.',
  category: 'Aggregator',
};

export function metaFor(id: string): SourceMeta {
  return SOURCE_META[id] ?? FALLBACK_META;
}

export const CATEGORY_CHIP: Record<SourceCategory, string> = {
  'Certificate Transparency': 'chip-intel',
  'Passive DNS': 'chip-verified',
  'Threat Intelligence': 'chip-anomaly',
  'Web Telemetry': 'chip-alias',
  'Internet Census': 'chip-attention',
  Aggregator: 'chip-neutral',
};

export interface ScanProfile {
  id: string;
  name: string;
  tagline: string;
  /** Provider ids; an empty list means "every enabled provider". */
  sourceIds: string[];
  resolve: boolean;
}

export const SCAN_PROFILES: ScanProfile[] = [
  {
    id: 'fast',
    name: 'Fast recon',
    tagline: 'Four keyless high-yield feeds, DNS verified',
    sourceIds: ['crtsh', 'hackertarget', 'rapiddns', 'anubis'],
    resolve: true,
  },
  {
    id: 'full',
    name: 'Full audit',
    tagline: 'Every available provider plus DNS and wildcard filtering',
    sourceIds: [],
    resolve: true,
  },
  {
    id: 'stealth',
    name: 'Stealth',
    tagline: 'Every provider, no DNS lookups from this host',
    sourceIds: [],
    resolve: false,
  },
];
