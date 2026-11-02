import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, FileCode, ExternalLink, Search, RefreshCw, Radar } from 'lucide-react';
import { api } from '../services/api';
import { ScanRecord } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, ButtonLink, ExternalButtonLink, IconButton } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonTable } from '../components/ui/Skeleton';
import { Pagination } from '../components/ui/Pagination';
import { formatDateTime, formatNumber, formatRelativeTime, shortId } from '../lib/format';

export const ReportsPage: React.FC = () => {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loadScans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setScans(await api.getScans({ limit: 500 }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load the report catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScans();
  }, [loadScans]);

  // Only completed runs have a stored report to export.
  const exportable = useMemo(() => {
    const query = filter.toLowerCase().trim();
    return scans
      .filter((scan) => scan.status === 'completed')
      .filter(
        (scan) =>
          !query || scan.target.toLowerCase().includes(query) || scan.id.toLowerCase().includes(query)
      );
  }, [scans, filter]);

  useEffect(() => {
    setPage(1);
  }, [filter, pageSize]);

  const paged = useMemo(
    () => exportable.slice((page - 1) * pageSize, page * pageSize),
    [exportable, page, pageSize]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deliverables"
        title="Intelligence Reports"
        description="Self-contained offline HTML reports and raw JSON for any completed scan."
        icon={FileText}
        actions={
          <>
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search target…"
                aria-label="Search reports by target domain"
                className="input-mono pl-8 py-2 text-xs w-48 sm:w-56"
              />
            </div>
            <IconButton
              label="Refresh reports"
              icon={RefreshCw}
              spinning={loading}
              onClick={loadScans}
            />
          </>
        }
      />

      <Alert tone="info" title="Standalone offline reports">
        HTML reports embed their own stylesheets and need no internet connection or external CDN to
        open — safe to archive alongside engagement evidence.
      </Alert>

      {error && (
        <Alert
          tone="error"
          action={
            <Button size="sm" variant="ghost" onClick={loadScans}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <section className="card overflow-hidden">
        {!loading && exportable.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={filter ? 'No reports match that search' : 'No reports available yet'}
            description={
              filter
                ? 'Only completed scans produce an exportable report.'
                : 'Complete a reconnaissance scan and its report will appear here.'
            }
            action={
              filter ? (
                <Button onClick={() => setFilter('')}>Clear search</Button>
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
                    <th scope="col" className="text-right">Findings</th>
                    <th scope="col">Completed</th>
                    <th scope="col" className="text-right">Export</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonTable columns={5} rows={6} />
                  ) : (
                    paged.map((scan) => (
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
                        <td className="text-slate-500 text-xs whitespace-nowrap">
                          <time
                            dateTime={scan.completed_at || scan.started_at}
                            title={formatDateTime(scan.completed_at || scan.started_at)}
                          >
                            {formatRelativeTime(scan.completed_at || scan.started_at)}
                          </time>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            <ExternalButtonLink
                              size="sm"
                              href={api.getReportURL(scan.id, 'html')}
                              icon={FileText}
                              title={`Open the HTML report for ${scan.target}`}
                            >
                              HTML
                              <ExternalLink className="w-3 h-3 text-slate-600" aria-hidden="true" />
                            </ExternalButtonLink>
                            <ExternalButtonLink
                              size="sm"
                              href={api.getReportURL(scan.id, 'json')}
                              icon={FileCode}
                              title={`Open the JSON report for ${scan.target}`}
                            >
                              JSON
                              <ExternalLink className="w-3 h-3 text-slate-600" aria-hidden="true" />
                            </ExternalButtonLink>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!loading && (
              <Pagination
                page={page}
                pageSize={pageSize}
                totalItems={exportable.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="reports"
              />
            )}
          </>
        )}
      </section>
    </div>
  );
};
