import { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { ScanEvent } from '../types';

export type ScanProgressState =
  | 'Queued'
  | 'Running'
  | 'Collecting'
  | 'Resolving'
  | 'Completed'
  | 'Failed';

export interface ProviderProgress {
  name: string;
  status: 'started' | 'completed' | 'failed';
  candidates: number;
  durationMs?: number;
  error?: string;
}

export function useScanEvents(
  scanId: string | undefined,
  enabled: boolean = true,
  onFinished?: () => void
) {
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [progressState, setProgressState] = useState<ScanProgressState>('Queued');
  const [providers, setProviders] = useState<Record<string, ProviderProgress>>({});
  const [rawCount, setRawCount] = useState<number>(0);
  const [uniqueCount, setUniqueCount] = useState<number>(0);
  const [liveCount, setLiveCount] = useState<number>(0);
  const [wildcardCount, setWildcardCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Preserve callback ref across renders
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (!scanId || !enabled) return;

    let isClosed = false;
    const url = api.getEventsURL(scanId);
    const es = new EventSource(url);

    setIsConnected(true);
    setError(null);

    const handleEvent = (event: MessageEvent, type: ScanEvent['type']) => {
      try {
        const payload: ScanEvent = JSON.parse(event.data);
        payload.type = type;
        setEvents((prev) => [...prev, payload]);

        switch (type) {
          case 'scan:started':
            setProgressState('Running');
            break;

          case 'provider:started':
            setProgressState('Collecting');
            if (payload.source_name) {
              setProviders((prev) => ({
                ...prev,
                [payload.source_name!]: {
                  name: payload.source_name!,
                  status: 'started',
                  candidates: 0,
                },
              }));
            }
            break;

          case 'provider:completed':
            if (payload.source_name) {
              setProviders((prev) => ({
                ...prev,
                [payload.source_name!]: {
                  name: payload.source_name!,
                  status: 'completed',
                  candidates: payload.candidates || 0,
                  durationMs: payload.duration_ms,
                },
              }));
            }
            break;

          case 'provider:failed':
            if (payload.source_name) {
              setProviders((prev) => ({
                ...prev,
                [payload.source_name!]: {
                  name: payload.source_name!,
                  status: 'failed',
                  candidates: 0,
                  error: payload.error || payload.health,
                },
              }));
            }
            break;

          case 'candidates:found':
            if (payload.raw_count !== undefined) setRawCount(payload.raw_count);
            if (payload.unique_count !== undefined) setUniqueCount(payload.unique_count);
            break;

          case 'dns:started':
            setProgressState('Resolving');
            break;

          case 'dns:completed':
            if (payload.live_count !== undefined) setLiveCount(payload.live_count);
            if (payload.wildcard_count !== undefined) setWildcardCount(payload.wildcard_count);
            break;

          case 'scan:completed':
            setProgressState('Completed');
            setIsConnected(false);
            if (!isClosed) {
              isClosed = true;
              es.close();
            }
            if (onFinishedRef.current) {
              onFinishedRef.current();
            }
            break;

          case 'scan:failed':
            setProgressState('Failed');
            setError(payload.error || payload.message || 'Reconnaissance scan failed');
            setIsConnected(false);
            if (!isClosed) {
              isClosed = true;
              es.close();
            }
            if (onFinishedRef.current) {
              onFinishedRef.current();
            }
            break;
        }
      } catch (err: unknown) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    const eventTypes: ScanEvent['type'][] = [
      'scan:started',
      'provider:started',
      'provider:completed',
      'provider:failed',
      'candidates:found',
      'dns:started',
      'dns:completed',
      'scan:completed',
      'scan:failed',
    ];

    eventTypes.forEach((type) => {
      es.addEventListener(type, (e) => handleEvent(e, type));
    });

    es.onerror = () => {
      setIsConnected(false);
      if (!isClosed) {
        isClosed = true;
        es.close();
      }
    };

    return () => {
      isClosed = true;
      es.close();
      setIsConnected(false);
    };
  }, [scanId, enabled]);

  return {
    events,
    progressState,
    providers,
    rawCount,
    uniqueCount,
    liveCount,
    wildcardCount,
    isConnected,
    error,
  };
}
