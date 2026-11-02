import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Search, Trash2, ArrowRight, RefreshCw, GitCompare, Radar, X } from 'lucide-react';
import { api } from '../services/api';
import { ScanRecord, ScanStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, ButtonLink, IconButton } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonTable } from '../components/ui/Skeleton';
import { Pagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  shortId,
} from '../lib/format';

const STATUS_FILTERS: Array<{ value: 'all' | ScanStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'running', label: 'Running' },
  { value: 'failed', label: 'Failed' },
];

export const ScanHistoryPage: React.FC = () => {
  const { notify } = useToast();

  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetFilter, setTargetFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ScanStatus>('all');
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScanRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Debounce so typing a domain does not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFilter(targetFilter), 300);
    return () => window.clearTimeout(timer);
  }, [targetFilter]);

  const fetchScans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setScans(await api.getScans({ target: debouncedFilter.trim() || undefined, limit: 500 }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve scan history');
    } finally {
      setLoading(false);
    }
  }, [debouncedFilter]);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? scans : scans.filter((scan) => scan.status === statusFilter)),
    [scans, statusFilter]
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedFilter, statusFilter, pageSize]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  /** Previous completed run of the same target, for a one-click delta. */
  const previousRunOf = useCallback(
    (scan: ScanRecord) =>
      scans.find(
        (other) =>
          other.id !== scan.id &&
          other.target === scan.target &&
          other.status === 'completed' &&
          new Date(other.started_at).getTime() < new Date(scan.started_at).getTime()
      ),
    [scans]
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteScan(deleteTarget.id);
      setScans((previous) => previous.filter((scan) => scan.id !== deleteTarget.id));
      notify(`Deleted scan for ${deleteTarget.target}`, 'success');
      setDeleteTarget(null);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Failed to delete scan record', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const hasFilters = debouncedFilter.trim() !== '' || statusFilter !== 'all';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Archive"
        title="Reconnaissance History"
        description="Every passive investigation persisted in local SQLite storage."
        icon={History}
        actions={
          <>
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={targetFilter}
                onChange={(event) => setTargetFilter(event.target.value)}
                placeholder="Filter by target…"
                aria-label="Filter scans by target domain"
                className="input-mono pl-8 py-2 text-xs w-48 sm:w-56"
              />
            </div>
            <IconButton
              label="Refresh history"
              icon={RefreshCw}
              spinning={loading}
              onClick={fetchScans}
            />
            <ButtonLink to="/scans/new" variant="primary" icon={Radar}>
              New scan
            </ButtonLink>
          </>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="eyebrow">Status</span>
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            aria-pressed={statusFilter === filter.value}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              statusFilter === filter.value
                ? 'bg-primary/12 text-primary border-primary/30'
                : 'bg-surface border-surface-border text-slate-500 hover:text-white hover:border-surface-border-strong'
            }`}
          >
            {filter.label}
          </button>
        ))}

        {hasFilters && (
          <button
            onClick={() => {
              setTargetFilter('');
              setStatusFilter('all');
            }}
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-white transition-colors ml-1"
          >
            <X className="w-3 h-3" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      {error && (
        <Alert
          tone="error"
          action={
            <Button size="sm" variant="ghost" onClick={fetchScans}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <section className="card overflow-hidden">
        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon={History}
            title={hasFilters ? 'No scans match these filters' : 'No scans recorded yet'}
            description={
              hasFilters
                ? 'Try a different target or status filter.'
                : 'Run your first passive reconnaissance scan to populate the archive.'
            }
            action={
              hasFilters ? (
                <Button
                  onClick={() => {
                    setTargetFilter('');
                    setStatusFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <ButtonLink to="/scans/new" variant="primary" icon={Radar}>
                  Launch a scan
                </ButtonLink>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Target</th>
                    <th scope="col">State</th>
                    <th scope="col" className="text-right">Assets</th>
                    <th scope="col" className="text-right">Elapsed</th>
                    <th scope="col">Started</th>
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonTable columns={6} rows={8} />
                  ) : (
                    paged.map((scan) => {
                      const previous = previousRunOf(scan);
                      return (
                        <tr key={scan.id}>
                          <td>
                            <Link
                              to={`/scans/${scan.id}`}
                              className="font-mono font-medium text-white hover:text-primary transition-colors break-all"
                            >
                              {scan.target}
                            </Link>
                            <span className="block text-micro font-mono text-slate-700 mt-0.5">
                              {shortId(scan.id)}
                            </span>
                          </td>
                          <td>
                            <StatusBadge status={scan.status} size="sm" />
                          </td>
                          <td className="text-right font-mono tabular-nums text-slate-200">
                            {formatNumber(scan.final_subdomains)}
                          </td>
                          <td className="text-right font-mono tabular-nums text-slate-500 text-xs">
                            {formatDuration(scan.duration_ms)}
                          </td>
                          <td className="text-slate-500 text-xs whitespace-nowrap">
                            <time dateTime={scan.started_at} title={formatDateTime(scan.started_at)}>
                              {formatRelativeTime(scan.started_at)}
                            </time>
                          </td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                to={
                                  previous
                                    ? `/compare?a=${previous.id}&b=${scan.id}`
                                    : `/compare?a=${scan.id}`
                                }
                                title={
                                  previous
                                    ? `Diff against the previous run of ${scan.target}`
                                    : `Compare ${scan.target} with another scan`
                                }
                                aria-label={
                                  previous
                                    ? `Diff ${scan.target} against its previous run`
                                    : `Compare ${scan.target} with another scan`
                                }
                                className={`p-2 rounded-lg transition-colors hover:bg-surface-raised ${
                                  previous ? 'text-primary' : 'text-slate-600 hover:text-primary'
                                }`}
                              >
                                <GitCompare className="w-4 h-4" aria-hidden="true" />
                              </Link>
                              <Link
                                to={`/scans/${scan.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-surface-raised border border-surface-border text-slate-300 text-xs font-medium hover:border-surface-border-strong hover:text-white transition-colors"
                              >
                                Inspect
                                <ArrowRight className="w-3 h-3" aria-hidden="true" />
                              </Link>
                              <IconButton
                                label={`Delete scan for ${scan.target}`}
                                icon={Trash2}
                                variant="ghost"
                                onClick={() => setDeleteTarget(scan)}
                                className="hover:text-signal-anomaly"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!loading && (
              <Pagination
                page={page}
                pageSize={pageSize}
                totalItems={filtered.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="scans"
              />
            )}
          </>
        )}
      </section>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        busy={deleting}
        title="Delete scan record"
        message={
          deleteTarget
            ? `Permanently delete the scan for ${deleteTarget.target} (${shortId(deleteTarget.id)})? All associated subdomain and telemetry data will be erased.`
            : ''
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        isDestructive
      />
    </div>
  );
};
