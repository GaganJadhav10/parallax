import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

export type EngineState = 'online' | 'offline' | 'checking';

export interface EngineStatus {
  state: EngineState;
  version: string;
  /** Round-trip time of the last health probe, in milliseconds. */
  latencyMs: number | null;
  checkedAt: Date | null;
  refresh: () => void;
}

/**
 * Backend heartbeat. The latency is measured client-side around the health
 * request — it is the real round trip the browser sees, not a reported figure.
 */
export function useEngineStatus(intervalMs = 30_000): EngineStatus {
  const [state, setState] = useState<EngineState>('checking');
  const [version, setVersion] = useState('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const probe = useCallback(async () => {
    setState('checking');
    const started = performance.now();
    try {
      const health = await api.getHealth();
      setLatencyMs(Math.round(performance.now() - started));
      setCheckedAt(new Date());
      if (health.status === 'ok') {
        setState('online');
        setVersion(health.version);
      } else {
        setState('offline');
      }
    } catch {
      setLatencyMs(null);
      setCheckedAt(new Date());
      setState('offline');
    }
  }, []);

  useEffect(() => {
    probe();
    const timer = window.setInterval(probe, intervalMs);
    return () => window.clearInterval(timer);
  }, [probe, intervalMs]);

  return { state, version, latencyMs, checkedAt, refresh: probe };
}
