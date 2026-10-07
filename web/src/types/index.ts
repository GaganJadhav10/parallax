export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

export type EventType =
  | 'scan:started'
  | 'provider:started'
  | 'provider:completed'
  | 'provider:failed'
  | 'candidates:found'
  | 'dns:started'
  | 'dns:completed'
  | 'scan:completed'
  | 'scan:failed';

export interface SourceReference {
  id: string;
  name: string;
}

export interface FailedSource {
  id: string;
  name: string;
  health: string;
  error: string;
  duration_ms: number;
}

export interface SourceTiming {
  id: string;
  name: string;
  status: string;
  candidates: number;
  duration_ms: number;
}

export interface Subdomain {
  name: string;
  sources: string[];
  ips?: string[];
  cnames?: string[];
}

export interface RunMetadata {
  started_at: string;
  completed_at: string;
  duration_ms: number;
  raw_results: number;
  unique_subdomains: number;
  final_subdomains: number;
  wildcard_filtered?: number;
  enabled_sources: SourceReference[];
  failed_sources?: FailedSource[];
  source_timings: SourceTiming[];
}

export interface Report {
  id?: string;
  domain: string;
  timestamp: string;
  total_found: number;
  resolved_enabled: boolean;
  metadata: RunMetadata;
  subdomains: Subdomain[];
}

export interface ScanRecord {
  id: string;
  target: string;
  status: ScanStatus;
  resolved_enabled: boolean;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  raw_results: number;
  unique_subdomains: number;
  final_subdomains: number;
  wildcard_filtered: number;
}

export interface ScanStatusResponse {
  id: string;
  target: string;
  status: ScanStatus;
  resolved_enabled: boolean;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  raw_results?: number;
  unique_subdomains?: number;
  final_subdomains?: number;
  wildcard_filtered?: number;
}

export interface ScanEvent {
  type: EventType;
  target: string;
  source_id?: string;
  source_name?: string;
  candidates?: number;
  raw_count?: number;
  unique_count?: number;
  live_count?: number;
  wildcard_count?: number;
  duration_ms?: number;
  health?: string;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface SourceInfo {
  id: string;
  name: string;
  enabled: boolean;
  auth_required: boolean;
  status: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  time: string;
}

export interface ComparisonCounts {
  added: number;
  removed: number;
  common: number;
}

export interface ScanComparison {
  target: string;
  older_scan_id: string;
  older_scan_date: string;
  newer_scan_id: string;
  newer_scan_date: string;
  added: string[];
  removed: string[];
  common: string[];
  counts: ComparisonCounts;
}

export interface CreateScanPayload {
  target: string;
  resolve?: boolean;
  sources?: string[];
}

export interface CreateScanResponse {
  id: string;
  target: string;
  status: string;
}

export interface APIErrorDetail {
  code: string;
  message: string;
}

export interface APIErrorResponse {
  error: APIErrorDetail;
}
