import {
  HealthResponse,
  SourceInfo,
  CreateScanPayload,
  CreateScanResponse,
  ScanRecord,
  ScanStatusResponse,
  Report,
  ScanComparison,
  APIErrorResponse,
} from '../types';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');

class APIClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const headers = {
      Accept: 'application/json',
      ...((options.body && typeof options.body === 'string') ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    };

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network connection failure';
      throw new Error(`Failed to connect to Parallax API at ${this.baseURL}: ${msg}`);
    }

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}: ${response.statusText}`;
      try {
        const errJson: APIErrorResponse = await response.json();
        if (errJson.error?.message) {
          errorMessage = errJson.error.message;
        }
      } catch {
        // Fall back to default error text
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Health
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/health');
  }

  // Sources
  async getSources(): Promise<SourceInfo[]> {
    return this.request<SourceInfo[]>('/api/sources');
  }

  // Scans
  async createScan(payload: CreateScanPayload): Promise<CreateScanResponse> {
    return this.request<CreateScanResponse>('/api/scans', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getScans(params?: { limit?: number; target?: string }): Promise<ScanRecord[]> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.target) query.set('target', params.target.trim());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<ScanRecord[]>(`/api/scans${qs}`);
  }

  async getScanStatus(id: string): Promise<ScanStatusResponse> {
    return this.request<ScanStatusResponse>(`/api/scans/${encodeURIComponent(id)}`);
  }

  async getScanResults(id: string): Promise<Report> {
    return this.request<Report>(`/api/scans/${encodeURIComponent(id)}/results`);
  }

  async deleteScan(id: string): Promise<{ status: string; id: string }> {
    return this.request<{ status: string; id: string }>(`/api/scans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async compareScans(id1: string, id2: string): Promise<ScanComparison> {
    const query = new URLSearchParams({ a: id1.trim(), b: id2.trim() });
    return this.request<ScanComparison>(`/api/scans/compare?${query.toString()}`);
  }

  // URLs for streaming & downloads
  getEventsURL(id: string): string {
    return `${this.baseURL}/api/scans/${encodeURIComponent(id)}/events`;
  }

  getReportURL(id: string, format: 'json' | 'html'): string {
    return `${this.baseURL}/api/scans/${encodeURIComponent(id)}/report?format=${format}`;
  }
}

export const api = new APIClient(API_BASE_URL);
